import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probeRetrievalAcceptance, validateRetrievalCohort, durationSummary } from './lib/retrieval-acceptance.mjs';

const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const bytes = Buffer.from('fixture-approved-immutable-webp-bytes');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const identity = (n = 1, variant = n + 100) => ({
  cardId: id(n), variantId: id(variant), setId: id(500), catalogueVersionId: id(600),
  languageCode: 'ja', collectorNumber: String(n),
});
const image = { assetId: id(700), role: 'original', mimeType: 'image/webp', byteSize: bytes.length, sha256 };
const asset = () => ({ ...image, assetType: 'card_image', cardId: id(1), variantId: id(101), setId: id(500),
  contentSha256: sha256, deliveryUrl: 'https://cdn.example.com/card.webp', derivatives: [] });
const card = (expected = identity()) => ({
  cardId: expected.cardId, catalogueVersionId: expected.catalogueVersionId, languageCode: expected.languageCode,
  collectorNumber: { value: expected.collectorNumber }, set: { setId: expected.setId },
  defaultVariantId: expected.variantId, variants: [{ variantId: expected.variantId, image: asset() }],
});
const cohort = (cases = [{ id: 'card', kind: 'card', identities: [identity()], image }]) => ({
  schemaVersion: 1, probeSourceSha: 'a'.repeat(40), apiOrigin: 'https://api.example.com',
  cdnOrigins: ['https://cdn.example.com'], cases,
});
const json = (data, nextCursor) => new Response(JSON.stringify({ data,
  ...(nextCursor === undefined ? {} : { meta: { pagination: { limit: 50, nextCursor } } }) }),
{ headers: { 'content-type': 'application/json' } });
function fixture(replace) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(Object.keys(options.headers), ['Accept'], 'no credentials forwarded');
      const override = replace?.(new URL(url), calls.length);
      if (override !== undefined) return await override;
      if (url.includes('/cards/')) return json({ card: card() });
      if (url.includes('/assets/manifest')) {
        assert.equal(new URL(url).searchParams.get('limit'), '50');
        return json({ assets: [asset()] }, null);
      }
      return new Response(bytes, { headers: { 'content-type': image.mimeType } });
    },
  };
}
async function rejectsResult(expected, replacement, input = cohort(), options = {}) {
  const f = fixture(replacement);
  const result = await probeRetrievalAcceptance(input, { fetchImpl: f.fetchImpl, ...options });
  assert.equal(result.ok, false, expected);
  assert.equal(result.results[0].error, expected);
  assert.equal(result.successfulSampleLatency.count, 0);
  assert.equal(result.failedSamples, result.attemptedSamples);
  return { result, calls: f.calls };
}
const f = fixture();
const success = await probeRetrievalAcceptance(cohort(), { fetchImpl: f.fetchImpl, samples: 2 });
assert.equal(success.ok, true);
assert.equal(success.requestCount, 6);
assert.equal(success.successfulSamples, 2);
assert.equal(success.surface, 'fixture');
assert.equal(success.probeSourceVerification, 'operator_supplied_unverified');
assert.equal(success.servedApiRevision, 'unverified');
assert.equal(success.deviceRendering, 'not_run');
assert.equal(success.deploymentApproved, false);
assert.equal(success.cohortSha256.length, 64);
assert(success.responseBytes > bytes.length * 2);
assert.deepEqual(durationSummary([10, 30, 20, 40]), { count: 4, p50Ms: 20, p95Ms: 40, maxMs: 40 });
assert.deepEqual(durationSummary([]), { count: 0, p50Ms: null, p95Ms: null, maxMs: null });

await rejectsResult('card_identity_mismatch', (url) => url.pathname.includes('/cards/')
  ? json({ card: { ...card(), languageCode: 'en' } }) : undefined);
await rejectsResult('variant_missing_or_duplicate', (url) => url.pathname.includes('/cards/')
  ? json({ card: { ...card(), variants: [] } }) : undefined);
await rejectsResult('invalid_envelope', () => json(null));
await rejectsResult('invalid_json', () => new Response('{', { headers: { 'content-type': 'application/json' } }));
await rejectsResult('http_or_redirect', () => new Response('no', { status: 500 }));
await rejectsResult('content_type_mismatch', (url) => url.origin.includes('cdn.')
  ? new Response('<html>blocked</html>', { headers: { 'content-type': 'text/html' } }) : undefined);
await rejectsResult('image_checksum_mismatch', (url) => url.origin.includes('cdn.')
  ? new Response(Buffer.alloc(bytes.length), { headers: { 'content-type': image.mimeType } }) : undefined);
await rejectsResult('asset_identity_mismatch', (url) => url.pathname.includes('/assets/')
  ? json({ assets: [{ ...asset(), variantId: id(999) }] }, null) : undefined);
await rejectsResult('asset_evidence_mismatch', (url) => url.pathname.includes('/assets/')
  ? json({ assets: [{ ...asset(), contentSha256: 'f'.repeat(64) }] }, null) : undefined);
await rejectsResult('expected_asset_missing', (url) => url.pathname.includes('/assets/') ? json({ assets: [] }, null) : undefined);
await rejectsResult('card_manifest_url_mismatch', (url) => url.pathname.includes('/assets/')
  ? json({ assets: [{ ...asset(), deliveryUrl: 'https://other.example.com/private.webp' }] }, null) : undefined);
const untrusted = asset(); untrusted.deliveryUrl = 'https://other.example.com/card.webp';
const blockedOrigin = await rejectsResult('untrusted_origin', (url) => {
  if (url.pathname.includes('/cards/')) return json({ card: { ...card(), variants: [{ variantId: id(101), image: untrusted }] } });
  if (url.pathname.includes('/assets/')) return json({ assets: [untrusted] }, null);
});
assert.equal(blockedOrigin.calls.length, 2, 'no untrusted CDN request');
await rejectsResult('body_too_large', () => new Response('x', {
  headers: { 'content-type': 'application/json', 'content-length': String(3 * 1024 * 1024) },
}));
await rejectsResult('body_too_large', undefined, cohort(), { maxBytes: 5 });
await rejectsResult('budget_exhausted', undefined, cohort(), { maxRequests: 1 });
await rejectsResult('timeout', () => new Promise(() => {}), cohort(), { timeoutMs: 5 });
await rejectsResult('timeout', () => new Response(new ReadableStream({ start() {} }), {
  headers: { 'content-type': 'application/json' },
}), cohort(), { timeoutMs: 5 });
const controller = new AbortController(); controller.abort();
const cancelled = await rejectsResult('cancelled', undefined, cohort(), { signal: controller.signal });
assert.equal(cancelled.calls.length, 0);

const identities = [identity(), identity(1, 102), identity(2)];
const setCohort = cohort([{ id: 'set', kind: 'set', identities }]);
const pageFixture = fixture((url) => {
  assert.equal(url.searchParams.get('limit'), '50');
  return url.searchParams.has('cursor')
    ? json({ cards: [card(identities[1]), card(identities[2])] }, null)
    : json({ cards: [card(identities[0])] }, 'next');
});
const fullSet = await probeRetrievalAcceptance(setCohort, { fetchImpl: pageFixture.fetchImpl });
assert.equal(fullSet.ok, true, 'same card on another page with distinct variant is legitimate');
assert.equal(fullSet.requestCount, 2);
await rejectsResult('incomplete_identity_set', () => json({ cards: [card()] }, null), setCohort);
await rejectsResult('duplicate_identity', () => json({ cards: [card(), card()] }, null), setCohort);
await rejectsResult('unexpected_identity', () => json({ cards: [card(identity(3))] }, null), setCohort);
await rejectsResult('pagination_missing', () => json({ cards: [card()] }), setCohort);
await rejectsResult('card_identity_mismatch', () => json({ cards: [{ ...card(), catalogueVersionId: id(999) }] }, null), setCohort);
await rejectsResult('invalid_page', () => json({ cards: Array.from({ length: 51 }, () => card()) }, null), setCohort);
const oversizedIdentities = Array.from({ length: 51 }, (_, index) => identity(index < 50 ? 1 : 2, index + 100));
await rejectsResult('variant_page_limit_exceeded', () => json({ cards: [
  { ...card(oversizedIdentities[0]), variants: oversizedIdentities.slice(0, 50).map((entry) => ({ variantId: entry.variantId })) },
  card(oversizedIdentities[50]),
] }, null), cohort([{ id: 'oversized', kind: 'set', identities: oversizedIdentities }]));
let page = 0;
await rejectsResult('repeated_cursor', () => json({ cards: [card(identities[page++])] }, 'same'), setCohort);

for (const apiOrigin of ['http://api.example.com', 'https://127.0.0.1', 'https://localhost', 'https://a.internal', 'https://u:p@api.example.com', 'https://api.example.com/path']) {
  assert.throws(() => validateRetrievalCohort({ ...cohort(), apiOrigin }));
}
assert.throws(() => validateRetrievalCohort({ ...cohort(), cases: [] }));
assert.throws(() => validateRetrievalCohort({ ...cohort(), probeSourceSha: 'short' }));
await assert.rejects(probeRetrievalAcceptance(cohort(), { surface: 'live_api', fetchImpl: f.fetchImpl }), /live_requires_native_fetch/);
await assert.rejects(probeRetrievalAcceptance(cohort()), /fixture_requires_injected_fetch/);
const cli = spawnSync(process.execPath, [fileURLToPath(new URL('./probe-retrieval-acceptance.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(cli.status, 2);
assert.match(cli.stderr, /Usage:/);
console.log('Retrieval acceptance fixtures pass: exact identities, complete variant pages, card/manifest/CDN checksums, bounded reads, failure accounting and no live/device claims.');
