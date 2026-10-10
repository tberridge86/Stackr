import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyCardmarketDailyGuide, exportCardmarketReviewCandidates, refreshCardmarketDailyFeeds } from './cardmarket-daily-guide.mjs';

const version = '99999999-9999-4999-8999-999999999999';
const printing = '11111111-1111-4111-8111-111111111111';
const products = { version: 1, createdAt: '2026-10-04T11:00:00+0200', products: [{ idProduct: 1, idCategory: 51, name: 'Reviewed' }, { idProduct: 2, idCategory: 51, name: 'Unmapped' }] };
const guide = { version: 1, createdAt: '2026-10-04T02:00:00+0200', priceGuides: [{ idProduct: 1, idCategory: 51, trend: 12, avg30: null, avg: null }] };
const retainedResult = (kind, payload) => { const rawPayload = JSON.stringify(payload); const sha256 = createHash('sha256').update(rawPayload).digest('hex'); return { kind, url: kind === 'products' ? 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json' : 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json', unchanged: false, etag: `"${kind}-etag"`, createdAt: payload.createdAt, payload, rawPayload, byteLength: Buffer.byteLength(rawPayload), sha256 }; };
const ledger = { schemaVersion: 1, mappings: [{ cardmarketProductId: 1, cardmarketCategoryId: 51, printingId: printing, catalogueVersionId: version, method: 'reviewed_exact', languageEvidence: { source: 'operator verified language' }, variantEvidence: { source: 'operator verified printing' }, finishEvidence: { source: 'unscoped public guide acknowledged' }, reviewReference: 'CARDMARKET-REVIEW-001' }] };
const cache = await mkdtemp(join(tmpdir(), 'stackr-cardmarket-daily-'));
let calls = 0;
const initial = await refreshCardmarketDailyFeeds({ cacheDir: cache, now: Date.parse('2026-10-04T12:00:00Z'), download: async kind => { calls += 1; return retainedResult(kind, kind === 'products' ? products : guide); } });
assert.equal(calls, 2); assert.equal(initial.refreshed, true);
assert.equal((await refreshCardmarketDailyFeeds({ cacheDir: cache, now: Date.parse('2026-10-04T12:10:00Z'), download: async () => { throw Error('must not fetch inside daily lease'); } })).reason, 'daily_cache_fresh');
const conditional = await refreshCardmarketDailyFeeds({ cacheDir: cache, now: Date.parse('2026-10-05T12:00:00Z'), download: async kind => ({ kind, unchanged: true, etag: `"${kind}-etag-2"` }) });
assert.equal(conditional.refreshed, true); assert.equal(conditional.feeds.products.products.length, 2);
assert.match(await readFile(join(cache, 'manifest.json'), 'utf8'), /etag-2/);
const rpcCalls = [];
const api = { rpc: async (name, args) => {
  rpcCalls.push({ name, args });
  if (name === 'read_cardmarket_retained_feed_revision') return { data: null, error: null };
  if (name === 'claim_cardmarket_source_revision') return { data: `${args.p_kind}-token`, error: null };
  if (name === 'finish_cardmarket_public_feed') return { data: `${args.p_kind}-revision`, error: null };
  if (name === 'review_cardmarket_printing_mapping') return { data: true, error: null };
  if (name === 'queue_cardmarket_mapping_repairs') return { data: args.p_repairs.length, error: null };
  if (name === 'store_cardmarket_blended_general_prices') return { data: args.p_results.length, error: null };
  throw Error(`Unexpected RPC ${name}`);
} };
const checkpoint = join(cache, 'apply-checkpoint.json');
const applied = await applyCardmarketDailyGuide({ api, retained: conditional, mappingLedger: ledger, checkpointPath: checkpoint, exchangeRate: 0.85, exchangeRateAt: '2026-10-04T11:00:00Z', exchangeRateSource: 'ECB fixture', now: Date.parse('2026-10-04T12:00:00Z'), maxPages: 1 });
assert.deepEqual(applied, { revisions: { products: 'products-revision', priceGuide: 'price_guide-revision' }, reviewedMappings: 1, stored: 1, repairs: 1, pages: 1, complete: true,
  dailyReadiness: { provider: { sourceAt: guide.createdAt, state: 'fresh', ageHours: 12 }, quoteScope: 'printing_level_blended', fullCatalogueCurrent: false } });
assert.equal(rpcCalls.filter(call => call.name === 'review_cardmarket_printing_mapping').length, 1);
assert.equal(rpcCalls.find(call => call.name === 'claim_cardmarket_source_revision' && call.args.p_kind === 'price_guide').args.p_kind, 'price_guide');
assert.equal(rpcCalls.find(call => call.name === 'store_cardmarket_blended_general_prices').args.p_results[0].selectedField, 'trend');
await writeFile(checkpoint, JSON.stringify({ schemaVersion: 2, reviewedKeys: ['51:1'], afterProductId: 1, priceGuideSha256: 'a'.repeat(64) }));
const revised = await applyCardmarketDailyGuide({ api, retained: conditional, mappingLedger: ledger, checkpointPath: checkpoint, exchangeRate: 0.85, exchangeRateAt: '2026-10-04T11:00:00Z', exchangeRateSource: 'ECB EUR fixture', now: Date.parse('2026-10-04T12:00:00Z'), maxPages: 1 });
assert.equal(revised.stored, 1, 'a changed guide restarts the product cursor');
assert.equal(rpcCalls.filter(call => call.name === 'review_cardmarket_printing_mapping').length, 2, 'a legacy checkpoint re-verifies full reviewed identity once');
assert.equal(JSON.parse(await readFile(checkpoint, 'utf8')).priceGuideSha256, conditional.manifest.feeds.priceGuide.sha256);
const beforeRestartClaims = rpcCalls.filter(call => call.name === 'claim_cardmarket_public_feed').length;
const restartApi = { rpc: async (name, args) => name === 'read_cardmarket_retained_feed_revision'
  ? { data: `${args.p_kind}-revision`, error: null } : api.rpc(name, args) };
const restarted = await applyCardmarketDailyGuide({ api: restartApi, retained: conditional, mappingLedger: ledger, checkpointPath: join(cache, 'new-volume-checkpoint.json'), exchangeRate: 0.85, exchangeRateAt: '2026-10-04T11:00:00Z', exchangeRateSource: 'ECB fixture', now: Date.parse('2026-10-04T12:00:00Z'), maxPages: 1 });
assert.equal(restarted.stored, 1);
assert.equal(rpcCalls.filter(call => call.name === 'claim_cardmarket_public_feed').length, beforeRestartClaims, 'a new worker volume reuses already retained source revisions');
// Same-guide mapping changes must apply even when their product is behind a
// completed cursor. Retain revision receipts, re-acknowledge changed identity.
const expandedGuide = { ...guide, priceGuides: [...guide.priceGuides, { idProduct: 2, idCategory: 51, trend: 18 }] };
const expandedRetained = { ...conditional, feeds: { ...conditional.feeds, priceGuide: expandedGuide },
  manifest: { ...conditional.manifest, feeds: { ...conditional.manifest.feeds,
    priceGuide: { ...conditional.manifest.feeds.priceGuide, sha256: retainedResult('priceGuide', expandedGuide).sha256 } } } };
const mappingCheckpoint = join(cache, 'same-guide-checkpoint.json');
const applyExpanded = mappingLedger => applyCardmarketDailyGuide({ api, retained: expandedRetained, mappingLedger,
  checkpointPath: mappingCheckpoint, exchangeRate: 0.85, exchangeRateAt: '2026-10-04T11:00:00Z', exchangeRateSource: 'ECB fixture', now: Date.parse('2026-10-04T12:00:00Z'), maxPages: 1 });
await applyExpanded(ledger);
assert.equal((await applyExpanded(ledger)).stored, 0, 'unchanged guide and reviewed identity remain a no-op');
const newPrinting = '22222222-2222-4222-8222-222222222222';
const extendedLedger = { ...ledger, mappings: [...ledger.mappings, { ...ledger.mappings[0], cardmarketProductId: 2,
  printingId: newPrinting, reviewReference: 'CARDMARKET-REVIEW-002' }] };
assert.equal((await applyExpanded(extendedLedger)).stored, 2, 'a newly reviewed product behind the cursor is priced from the same retained guide');
assert.ok(rpcCalls.at(-1).args.p_results.some(row => row.printingId === newPrinting));
const beforeCorrection = rpcCalls.filter(call => call.name === 'review_cardmarket_printing_mapping').length;
const correctedLedger = { ...extendedLedger, mappings: extendedLedger.mappings.map(mapping => mapping.cardmarketProductId === 2
  ? { ...mapping, catalogueVersionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reviewReference: 'CARDMARKET-REVIEW-003' } : mapping) };
assert.equal((await applyExpanded(correctedLedger)).stored, 2);
assert.equal(rpcCalls.filter(call => call.name === 'review_cardmarket_printing_mapping').length, beforeCorrection + 1,
  'a reused product key cannot inherit acknowledgement for another reviewed identity');
const productRevisionCheckpoint = JSON.parse(await readFile(mappingCheckpoint, 'utf8'));
productRevisionCheckpoint.productsSha256 = 'f'.repeat(64); productRevisionCheckpoint.revisions.products = 'old-product-revision';
await writeFile(mappingCheckpoint, JSON.stringify(productRevisionCheckpoint));
assert.equal((await applyExpanded(correctedLedger)).revisions.products, 'products-revision', 'changed product content must resolve its own source revision');
const tinyGuide = { ...expandedGuide, priceGuides: expandedGuide.priceGuides.map(row => row.idProduct === 2 ? { ...row, trend: 0.001 } : row) };
const tinyRetained = { ...expandedRetained, feeds: { ...expandedRetained.feeds, priceGuide: tinyGuide },
  manifest: { ...expandedRetained.manifest, feeds: { ...expandedRetained.manifest.feeds,
    priceGuide: { ...expandedRetained.manifest.feeds.priceGuide, sha256: retainedResult('priceGuide', tinyGuide).sha256 } } } };
const tiny = await applyCardmarketDailyGuide({ api, retained: tinyRetained, mappingLedger: correctedLedger,
  checkpointPath: mappingCheckpoint, exchangeRate: 0.85, exchangeRateAt: '2026-10-04T11:00:00Z', exchangeRateSource: 'ECB fixture', now: Date.parse('2026-10-04T12:00:00Z'), maxPages: 1 });
assert.equal(tiny.stored, 1);
assert.equal(tiny.repairs, 1, 'a sub-cent quote is recorded as an explicit missing market value, rather than counted as a zero-price success');
assert.ok(rpcCalls.some(call => call.name === 'queue_cardmarket_mapping_repairs'
  && call.args.p_repairs.some(row => row.providerProductId === 2 && row.detail.reason === 'rounded_to_zero_gbp')));
let midnightCalls = 0;
await refreshCardmarketDailyFeeds({ cacheDir: cache, now: Date.parse('2026-10-05T13:01:00Z'), download: async kind => { midnightCalls++; return { kind, unchanged: true, etag: `"${kind}-etag-2"` }; } });
assert.equal(midnightCalls, 2, 'yesterday\'s guide is rechecked hourly until today\'s guide arrives');
await assert.rejects(() => applyCardmarketDailyGuide({ api, retained: conditional, mappingLedger: { ...ledger, mappings: [{ ...ledger.mappings[0], cardmarketProductId: 99 }] }, checkpointPath: checkpoint, exchangeRate: 0.85, exchangeRateAt: '2026-10-04T11:00:00Z', exchangeRateSource: 'ECB fixture', now: Date.parse('2026-10-04T12:00:00Z') }), /absent from the retained product catalogue/);
const beforeStaleCalls = rpcCalls.length;
await assert.rejects(() => applyCardmarketDailyGuide({ api, retained: conditional, mappingLedger: ledger, checkpointPath: checkpoint,
  exchangeRate: 0.85, exchangeRateAt: '2026-10-04T11:00:00Z', exchangeRateSource: 'ECB fixture', now: Date.parse('2026-10-07T12:00:00Z') }), /Daily price guide is stale/);
assert.equal(rpcCalls.length, beforeStaleCalls, 'an expired retained guide must not write or advance its checkpoint');
const candidateExport = await exportCardmarketReviewCandidates({ retained: conditional, api: { rpc: async (name) => {
  assert.equal(name, 'list_cardmarket_current_provenance_candidates');
  return { data: [{ provider_product_id: 1, printing_id: printing, language_code: 'en', catalogue_version_id: version, provenance: { externalIds: ['sv1-1'], variantIds: ['22222222-2222-4222-8222-222222222222'], finishCodes: ['normal', 'holo'] } }], error: null };
} } });
assert.equal(candidateExport.candidates.length, 1); assert.equal(candidateExport.candidates[0].mappingTemplate.finishEvidence.type, 'blended_public_guide_not_exact_finish'); assert.equal(candidateExport.candidates[0].mappingTemplate.reviewReference, undefined);
const completedRun = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const materializedExport = await exportCardmarketReviewCandidates({ retained: conditional, provenanceRunId: completedRun, api: { rpc: async (name, args) => {
  assert.equal(name, 'list_cardmarket_completed_provenance_candidates');
  assert.deepEqual(args, { p_run: completedRun, p_after_product_id: 0, p_limit: 100 });
  return { data: [{ provider_product_id: 1, printing_id: printing, language_code: 'en', catalogue_version_id: version, provenance: { externalIds: ['sv1-1'], variantIds: ['22222222-2222-4222-8222-222222222222'], finishCodes: ['normal', 'holo'] } }], error: null };
} } });
assert.equal(materializedExport.candidates.length, 1, 'a completed immutable provenance run can drive review material');
await assert.rejects(() => exportCardmarketReviewCandidates({ retained: conditional, provenanceRunId: 'bad', api }), /Invalid completed Cardmarket provenance run id/);
console.log('Cardmarket daily retention uses daily/ETag guards and applies only reviewed, printing-scoped blended estimates with resumable checkpoints.');
