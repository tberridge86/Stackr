import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  BENCHMARK_IDENTITIES,
  validatePublicApiBenchmarkResponse,
} from './deploy/public-api-benchmark-contract.mjs';

const envelope = (data) => ({ data, error: null });
const delivery = (role) => ({ role, deliveryUrl: `https://assets.stackrtcg.com/${role}.webp` });
const expectedSearch = {
  type: 'card',
  reason: 'exact_set_code_collector_number',
  cardId: BENCHMARK_IDENTITIES.search.cardId,
  variantId: '53bca9cb-46c8-42bc-beed-267409740edd',
  setCode: 'SV2a',
  collectorNumber: '157/165',
  languageCode: 'ja',
};
const expectedAsset = {
  variantId: BENCHMARK_IDENTITIES.asset.variantId,
  deliveryUrl: 'https://assets.stackrtcg.com/original.jpg',
  derivatives: BENCHMARK_IDENTITIES.asset.derivativeRoles.map(delivery),
};

assert.deepEqual(
  validatePublicApiBenchmarkResponse('health', envelope({ status: 'ok', service: 'stackr-api' })),
  { usefulCount: 1, expectedIdentityFound: true, languageVerified: null },
);
assert.equal(validatePublicApiBenchmarkResponse('sets', envelope({ sets: [
  { setId: 'set-a', languageCode: 'en' },
  { setId: 'set-b', languageCode: 'en' },
] })).usefulCount, 2);
assert.equal(validatePublicApiBenchmarkResponse('search', envelope({ results: [expectedSearch] })).expectedIdentityFound, true);
assert.equal(validatePublicApiBenchmarkResponse('assets', envelope({ assets: [expectedAsset] })).usefulCount, 1);
assert.equal(validatePublicApiBenchmarkResponse('health', envelope({ status: 'ok', service: 'stackr-api-gateway' })).usefulCount, 1);
assert.throws(() => validatePublicApiBenchmarkResponse('health', envelope({ status: 'ok', service: 'unrelated' })), /health_service_identity_mismatch/);

assert.throws(() => validatePublicApiBenchmarkResponse('search', envelope({ results: [] })), /search_unexpectedly_empty/);
assert.throws(() => validatePublicApiBenchmarkResponse('search', envelope({ results: [
  { ...expectedSearch, languageCode: 'en' },
] })), /search_wrong_language/);
assert.throws(() => validatePublicApiBenchmarkResponse('search', envelope({ results: [
  { ...expectedSearch, cardId: '00000000-0000-4000-8000-000000000000' },
] })), /search_expected_identity_missing/);
assert.throws(() => validatePublicApiBenchmarkResponse('sets', envelope({ sets: [] })), /sets_unexpectedly_empty/);
assert.throws(() => validatePublicApiBenchmarkResponse('sets', envelope({ sets: [
  { setId: 'set-a', languageCode: 'ja' },
] })), /sets_wrong_language/);
assert.throws(() => validatePublicApiBenchmarkResponse('assets', envelope({ assets: [] })), /assets_unexpectedly_empty/);
assert.throws(() => validatePublicApiBenchmarkResponse('assets', envelope({ assets: [
  { ...expectedAsset, variantId: '00000000-0000-4000-8000-000000000000' },
] })), /assets_expected_identity_missing/);
assert.throws(() => validatePublicApiBenchmarkResponse('assets', envelope({ assets: [
  { ...expectedAsset, derivatives: expectedAsset.derivatives.slice(0, 2) },
] })), /derivative_missing_or_duplicate/);

console.log('Public API benchmark rejects false-green empty, wrong-language and wrong-identity responses.');

const diagnostic = spawnSync(process.execPath, ['--input-type=module', '-e', `
  process.argv.push('--gateway=https://example.test', '--samples=5', '--warmups=1');
  const responses = ${JSON.stringify({
    health: envelope({ status: 'ok', service: 'stackr-api-gateway' }),
    sets: envelope({ sets: [{ setId: 'en-set', languageCode: 'en' }] }),
    search: envelope({ results: [expectedSearch] }),
  })};
  globalThis.fetch = async (url) => {
    const route = new URL(url).pathname.split('/').at(-1);
    return new Response(JSON.stringify(responses[route] ?? { error: 'timeout' }), {
      status: route === 'manifest' ? 504 : 200, headers: { 'content-type': 'application/json' },
    });
  };
  await import('./scripts/deploy/benchmark-public-api.mjs');
`], { encoding: 'utf8' });
assert.equal(diagnostic.status, 1, diagnostic.stderr);
const report = JSON.parse(diagnostic.stdout);
assert.equal(report.ok, false);
assert.equal(report.results.length, 4, 'one failed route cannot erase completed measurements');
assert.equal(report.results[2].samples, 5);
assert.equal(report.results[3].error, 'assets_warmup_failed_with_504');
console.log('Public API benchmark retains completed measurements and exits nonzero on a route timeout.');
