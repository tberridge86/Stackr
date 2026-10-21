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
  setId: BENCHMARK_IDENTITIES.search.setId,
  setCode: 'SV2a',
  collectorNumber: '157/165',
  languageCode: 'ja',
};
expectedSearch.card = {
  cardId: expectedSearch.cardId, languageCode: expectedSearch.languageCode,
  set: { setId: expectedSearch.setId, setCode: expectedSearch.setCode },
  collectorNumber: { value: expectedSearch.collectorNumber },
  defaultVariantId: expectedSearch.variantId,
  variants: [{ variantId: expectedSearch.variantId, variantCode: 'normal', finishCode: 'normal' }],
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


// The app filters on result.card and renders its nested identity, not just the
// summary fields. A matching summary must never hide a broken rendered card.
const invalidSearchCases = [
  ['rank_two', [{ ...expectedSearch, cardId: 'wrong' }, expectedSearch]],
  ['rank_six', [...Array(5).fill({ ...expectedSearch, cardId: 'wrong' }), expectedSearch]],
  ['missing_card', [{ ...expectedSearch, card: null }]],
  ['nested_identity', [{ ...expectedSearch, card: { ...expectedSearch.card, cardId: 'wrong' } }]],
  ['nested_language', [{ ...expectedSearch, card: { ...expectedSearch.card, languageCode: 'en' } }]],
  ['nested_set', [{ ...expectedSearch, card: { ...expectedSearch.card, set: { ...expectedSearch.card.set, setId: 'wrong' } } }]],
  ['nested_number', [{ ...expectedSearch, card: { ...expectedSearch.card, collectorNumber: { value: '158' } } }]],
  ['joint_wrong_set', [{ ...expectedSearch, setId: 'wrong', card: { ...expectedSearch.card, set: { ...expectedSearch.card.set, setId: 'wrong' } } }]],
  ['default_variant', [{ ...expectedSearch, card: { ...expectedSearch.card, defaultVariantId: 'wrong' } }]],
  ['nested_variant', [{ ...expectedSearch, card: { ...expectedSearch.card, variants: [] } }]],
];
for (const [label, results] of invalidSearchCases) {
  assert.throws(() => validatePublicApiBenchmarkResponse('search', envelope({ results })),
    /search_/, label + ' must fail');
}
console.log('Ten rank/rendered-card negative controls rejected.');

assert.equal(report.requestCount, 19);
assert.equal(report.results[3].failedRequests, 1);
assert.equal(report.results[3].attemptedWarmups, 1);
assert.equal(report.results[3].skippedSamples, 5);
assert.equal(report.results[3].p95Ms, null, 'No successful sample is not zero latency');
assert.equal(report.results[3].firstRequest.status, 504);
assert.ok(report.results[3].firstRequest.durationMs >= 0);

for (const mode of ['success', 'http', 'api', 'decode', 'validation', 'transport', 'timeout']) {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `
    process.argv.push('--gateway=https://example.test', '--samples=5', '--warmups=1', '--timeout-ms=1000');
    const responses = ${JSON.stringify({
      health: envelope({ status: 'ok', service: 'stackr-api-gateway' }),
      sets: envelope({ sets: [{ setId: 'en-set', languageCode: 'en' }] }),
      search: envelope({ results: [expectedSearch] }),
      manifest: envelope({ assets: [expectedAsset] }),
    })};
    let searches = 0;
    globalThis.fetch = async (url, options) => {
      const route = new URL(url).pathname.split('/').at(-1);
      const mode = ${JSON.stringify(mode)};
      const failing = route === 'search' && ++searches === 3 && mode !== 'success';
      if (failing && mode === 'transport') throw new Error('private transport URL must not be exported');
      if (failing && mode === 'timeout') {
        return new Response(new ReadableStream({ start(controller) {
          options.signal.addEventListener('abort', () => controller.error(new Error('body aborted')), { once: true });
        } }), { headers: { 'content-type': 'application/json' } });
      }
      const body = failing && mode === 'decode' ? '{broken'
        : JSON.stringify(failing && mode === 'api' ? { error: { code: 'unavailable' } }
          : failing && mode === 'validation' ? { data: { results: [] } } : responses[route]);
      return new Response(body, { status: failing && mode === 'http' ? 503 : 200,
        headers: { 'content-type': 'application/json', 'x-stackr-cache': 'HIT' } });
    };
    await import('./scripts/deploy/benchmark-public-api.mjs');
  `], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(run.status, mode === 'success' ? 0 : 1, `${mode}: ${run.stderr}`);
  const receipt = JSON.parse(run.stdout);
  const search = receipt.results[2];
  assert.equal(receipt.requestCount, mode === 'success' ? 24 : 21);
  assert.equal(search.attemptedWarmups, 1);
  assert.equal(search.attemptedSamples, mode === 'success' ? 5 : 2);
  assert.equal(search.samples, mode === 'success' ? 5 : 1);
  assert.equal(search.skippedSamples, mode === 'success' ? 0 : 3);
  assert.equal(search.failedRequests, mode === 'success' ? 0 : 1);
  assert.equal(search.firstRequest.cacheStatus, 'HIT');
  assert.ok(search.firstRequest.durationMs >= 0);
  assert.equal(search.expectedIdentityVerified, mode === 'success');
  const successful = search.requests.filter(r => r.phase === 'sample' && r.ok).map(r => r.durationMs).sort((a,b) => a-b);
  assert.ok(Math.abs(search.p50Ms - successful[Math.ceil(successful.length * .5) - 1]) <= .01);
  assert.ok(Math.abs(search.p95Ms - successful[Math.ceil(successful.length * .95) - 1]) <= .01);
  if (mode !== 'success') {
    const failed = search.requests.at(-1);
    assert.equal(failed.failureType, mode);
    assert.equal(failed.status, mode === 'transport' ? null : mode === 'http' ? 503 : 200);
    assert.ok(failed.durationMs >= 0);
    if (mode === 'timeout') assert.ok(failed.durationMs >= 900, 'Timeout includes stalled body consumption');
    assert.equal(search.p95Ms, search.requests[1].durationMs, 'Failure duration cannot enter successful p95');
    assert.equal(receipt.ok, false);
    assert.equal(search.passed, false);
    assert.equal(search.requests.length, 3, 'Stop this route on first failure');
    assert.equal(receipt.results[3].samples, 5, 'Retain independent later scenarios');
    assert.ok(!run.stdout.includes('private transport URL'));
  }
}
console.log('Seven actual CLI outcome cases retain request denominators, failures, body deadlines and successful-only percentiles.');
