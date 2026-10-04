import assert from 'node:assert/strict';
import { createBulkFeedLoader, mainCatalogueBulkPrices, planCatalogueBulkPrices, providerSubtype, runCatalogueBulkSweep, selectBulkProduct, validateBulkFx } from './refresh-catalogue-bulk-prices.mjs';

const now = Date.parse('2026-10-03T12:00:00Z');
const fx = { rate: 0.75, at: '2026-10-03T10:00:00Z', source: 'fixture-fx' };
const enGroup = { categoryId: 3, groupId: 10, name: 'Silver Tempest' };
const jaGroup = { categoryId: 85, groupId: 20, name: 'ストームエメラルダ' };
const base = { variant_id: 'en-normal', catalogue_version_id: 'v1', set_id: 'en-set', language_code: 'en', variant_code: 'normal', finish_code: 'normal', collector_number: '139', card_english_display_name: 'Lugia VSTAR' };
const enProduct = { categoryId: 3, groupId: 10, productId: 30, name: 'Lugia VSTAR', extendedData: [{ name: 'Number', value: '139/195' }] };
assert.equal(providerSubtype({ ...base, variant_code: 'reverse_holo', finish_code: 'reverse_holo' }), 'Reverse Holofoil');
assert.equal(selectBulkProduct(base, enGroup, [enProduct])?.mappingMethod, 'exact_name_number');
assert.equal(selectBulkProduct(base, enGroup, [enProduct, { ...enProduct, productId: 31 }]), null, 'ambiguous products require repair');
assert.equal(selectBulkProduct({ ...base, provider_mapping: { category_id: 85, group_id: 10, product_id: 30, method: 'reviewed' } }, enGroup, [enProduct]), null, 'a map from another category cannot cross languages');
assert.equal(selectBulkProduct({ ...base, provider_mapping: { category_id: 3, group_id: 10, product_id: 30, method: 'reviewed' } }, enGroup, [{ ...enProduct, presaleInfo: { isPresale: true } }]), null, 'reviewed aliases still reject presale products');

// Japanese TCGCSV products currently carry English names. Never translate or
// compare those names: the server must first bind the provider group through a
// unique exact set code and prove the collector number names one printing.
const jaNumberRow = { ...base, variant_id: 'ja-number', set_id: 'ja-set', language_code: 'ja', collector_number: '001', card_english_display_name: null, card_native_name: 'ニャオハ', provider_set_method: 'exact_set_code', unique_collector_number: true };
const jaNumberProduct = { categoryId: 85, groupId: 20, productId: 201, name: 'Sprigatito', extendedData: [{ name: 'Number', value: '001/073' }] };
assert.equal(selectBulkProduct(jaNumberRow, jaGroup, [jaNumberProduct])?.mappingMethod, 'exact_set_code_number');
assert.equal(selectBulkProduct({ ...jaNumberRow, unique_collector_number: false }, jaGroup, [jaNumberProduct]), null, 'a duplicate canonical printing cannot use number-only mapping');
assert.equal(selectBulkProduct(jaNumberRow, jaGroup, [{ ...jaNumberProduct, extendedData: [{ name: 'Number', value: ' ' }] }]), null, 'blank provider numbers never map');
assert.equal(selectBulkProduct(jaNumberRow, jaGroup, [jaNumberProduct, { ...jaNumberProduct, productId: 202 }]), null, 'duplicate provider numbers require repair');
assert.equal(selectBulkProduct({ ...base, card_english_display_name: 'Different card', provider_set_method: 'exact_set_code', unique_collector_number: true }, enGroup, [enProduct]), null, 'non-Japanese cards cannot bypass exact name matching');
assert.equal(selectBulkProduct({ ...jaNumberRow, provider_mapping: { category_id: 85, group_id: 20, product_id: 201, method: 'exact_set_code_number' } }, jaGroup, [jaNumberProduct])?.productId, 201, 'a durable exact-code map is revalidated before reuse');
assert.equal(selectBulkProduct({ ...jaNumberRow, unique_collector_number: false, provider_mapping: { category_id: 85, group_id: 20, product_id: 201, method: 'exact_set_code_number' } }, jaGroup, [jaNumberProduct]), null, 'a durable exact-code map is quarantined when canonical uniqueness changes');
assert.equal(selectBulkProduct({ ...jaNumberRow, provider_mapping: { category_id: 85, group_id: 20, product_id: 201, method: 'exact_set_code_number' } }, jaGroup, [jaNumberProduct, { ...jaNumberProduct, productId: 202 }]), null, 'a durable exact-code map is quarantined when provider uniqueness changes');
assert.throws(() => validateBulkFx({ ...fx, rate: NaN }, now));

const feed = { products: [enProduct], prices: [{ productId: 30, subTypeName: 'Normal', marketPrice: 12 }, { productId: 30, subTypeName: 'Holofoil', marketPrice: 20 }, { productId: 30, subTypeName: 'Reverse Holofoil', marketPrice: 30 }] };
const plan = planCatalogueBulkPrices({ candidates: [base, { ...base, variant_id: 'holo', variant_code: 'holo', finish_code: 'holo' }, { ...base, variant_id: 'reverse', variant_code: 'reverse_holo', finish_code: 'reverse_holo' }, { ...base, variant_id: 'bad', language_code: 'zh-cn' }], group: enGroup, ...feed, datasetAt: '2026-10-03T00:00:00Z', fx, now });
assert.equal(plan.priced, 3); assert.equal(plan.results[2].quote.subtype, 'Reverse Holofoil'); assert.equal(plan.results[3].reason, 'unsupported_provider_language');
assert.ok(plan.results.every((row) => !('condition' in (row.quote ?? {})) && !('soldAt' in (row.quote ?? {}))), 'general feed never becomes condition or sales evidence');
const jaPlan = planCatalogueBulkPrices({ candidates: [jaNumberRow], group: jaGroup, products: [jaNumberProduct], prices: [{ productId: 201, subTypeName: 'Normal', marketPrice: 6 }], datasetAt: '2026-10-03T00:00:00Z', fx, now });
assert.equal(jaPlan.results[0].mapping?.method, 'exact_set_code_number');
assert.equal(jaPlan.results[0].quote?.subtype, 'Normal', 'the Japanese number path still requires the exact canonical finish');
const collision = planCatalogueBulkPrices({ candidates: [base, { ...base, variant_id: 'same-provider-identity' }], group: enGroup, ...feed, datasetAt: '2026-10-03T00:00:00Z', fx, now });
assert.ok(collision.results.every((row) => row.reason === 'ambiguous_provider_identity' && row.mapping === null), 'two canonical cards cannot claim one provider product/subtype');

// 600 identities exercise two set checkpoints and 500-card pagination. The
// first group is deliberately paged 500 + 100, proving the prior cap is gone.
const enCards = Array.from({ length: 600 }, (_, n) => ({ ...base, variant_id: `en-${n}`, collector_number: String(n + 1), card_english_display_name: `Card ${n + 1}`, provider_mapping: { category_id: 3, group_id: 10, product_id: 1000 + n, method: 'reviewed' } }));
const jaCards = Array.from({ length: 2 }, (_, n) => ({ ...base, variant_id: `ja-${n}`, set_id: 'ja-set', language_code: 'ja', collector_number: String(n + 1), card_english_display_name: undefined, card_native_name: `ピカチュウ${n + 1}`, provider_mapping: { category_id: 85, group_id: 20, product_id: 2000 + n, method: 'reviewed' } }));
const enLargeProducts = enCards.map((row, n) => ({ categoryId: 3, groupId: 10, productId: 1000 + n, name: row.card_english_display_name, extendedData: [{ name: 'number', value: `${n + 1}/600` }] }));
const jaLargeProducts = jaCards.map((row, n) => ({ categoryId: 85, groupId: 20, productId: 2000 + n, name: row.card_native_name, extendedData: [{ name: 'Number', value: `${n + 1}/2` }] }));
const claimed = [{ categoryId: 3, groupId: 10, language: 'en', group: enGroup, leaseToken: 'lease-en' }, { categoryId: 85, groupId: 20, language: 'ja', group: jaGroup, leaseToken: 'lease-ja' }];
const stored = []; const finished = []; let claimIndex = 0;
const outcomeSeedPages = [{ scanned: 500, written: 500, complete: false }, { scanned: 102, written: 102, complete: true }];
const sweep = await runCatalogueBulkSweep({ datasetAt: '2026-10-03T00:00:00Z', fx, now, groups: [enGroup, jaGroup], maxGroups: 10,
  begin: async () => ({ runId: 'run-1' }), seedOutcomes: async ({ limit }) => { assert.equal(limit,500); return outcomeSeedPages.shift(); }, claim: async () => claimed[claimIndex++] ?? null,
  resolveSet: async () => ({ status: 'mapped' }),
  candidates: async ({ categoryId, after }) => { const source = categoryId === 3 ? enCards : jaCards; const i = after ? source.findIndex((r) => r.variant_id === after) + 1 : 0; return source.slice(i, i + 500); },
  loader: { load: async (key) => ({ results: key.startsWith('tcgplayer/3/') ? (key.endsWith('products') ? enLargeProducts : enLargeProducts.map((p) => ({ productId: p.productId, subTypeName: 'Normal', marketPrice: 1 }))) : (key.endsWith('products') ? jaLargeProducts : jaLargeProducts.map((p) => ({ productId: p.productId, subTypeName: 'Normal', marketPrice: 4 }))) }) },
  store: async ({ results }) => { stored.push(results); return results.length; }, finish: async (value) => { finished.push(value); return true; } });
assert.equal(sweep.cards, 602); assert.equal(sweep.priced, 602); assert.equal(stored.flat().length, 602); assert.equal(finished.filter((v) => v.status === 'complete').length, 2);
assert.deepEqual(sweep.outcomeSeed,{ pages: 2, scanned: 602, written: 602, complete: true },'publication outcome seed resumes in bounded pages before provider work');

// A bounded invocation reports partial work and the next run resumes its durable
// checkpoint rather than restarting provider group zero.
const resumeJobs = [...claimed]; const resumeFinished = [];
const resumeOptions = { datasetAt: '2026-10-03T00:00:00Z', fx, now, groups: [enGroup, jaGroup], begin: async () => ({ runId: 'resume' }), claim: async () => resumeJobs.shift() ?? null, resolveSet: async () => ({ status: 'mapped' }), candidates: async ({ categoryId, after }) => { const source = categoryId === 3 ? enCards : jaCards; const i = after ? source.findIndex((r) => r.variant_id === after) + 1 : 0; return source.slice(i, i + 500); }, loader: { load: async (key) => ({ results: key.startsWith('tcgplayer/3/') ? (key.endsWith('products') ? enLargeProducts : enLargeProducts.map((p) => ({ productId: p.productId, subTypeName: 'Normal', marketPrice: 1 }))) : (key.endsWith('products') ? jaLargeProducts : jaLargeProducts.map((p) => ({ productId: p.productId, subTypeName: 'Normal', marketPrice: 4 }))) }) }, store: async ({ results }) => results.length, finish: async (value) => { resumeFinished.push(value); return true; } };
assert.equal((await runCatalogueBulkSweep({ ...resumeOptions, maxGroups: 1 })).status, 'partial');
assert.equal((await runCatalogueBulkSweep({ ...resumeOptions, maxGroups: 1 })).status, 'partial');
assert.equal((await runCatalogueBulkSweep({ ...resumeOptions, maxGroups: 1 })).status, 'complete');
assert.equal(resumeFinished.filter((row) => row.status === 'complete').length, 2);

// The duplicate is separated by the 500-card boundary. Preflight must detect it
// before storing page one, so neither canonical alias receives the quote/map.
const boundaryCards = [...enCards.slice(0, 500), { ...enCards[0], variant_id: 'en-duplicate-page-2' }]; const boundaryStored = [];
await runCatalogueBulkSweep({ datasetAt: '2026-10-03T00:00:00Z', fx, now, groups: [enGroup], maxGroups: 1, begin: async () => ({ runId: 'boundary' }), claim: async () => boundaryCards ? ({ categoryId: 3, groupId: 10, language: 'en', group: enGroup, leaseToken: 'boundary-lease' }) : null, resolveSet: async () => ({ status: 'mapped' }), candidates: async ({ after }) => { const i = after ? boundaryCards.findIndex((r) => r.variant_id === after) + 1 : 0; return boundaryCards.slice(i, i + 500); }, loader: { load: async (key) => ({ results: key.endsWith('products') ? enLargeProducts : enLargeProducts.map((p) => ({ productId: p.productId, subTypeName: 'Normal', marketPrice: 1 })) }) }, store: async ({ results }) => { boundaryStored.push(...results); return results.length; }, finish: async () => true });
const boundaryBlocked = boundaryStored.filter((row) => row.variantId === 'en-0' || row.variantId === 'en-duplicate-page-2');
assert.equal(boundaryBlocked.length, 2); assert.ok(boundaryBlocked.every((row) => row.reason === 'ambiguous_provider_identity' && row.mapping === null && row.quote === null));

// Metadata is hour-cached; immutable set files stay cached for the current
// build even when older than a day, then acquire a fresh revision on advance.
const dataset = '2026-10-03T00:00:00Z'; const oldDataset = '2026-10-02T00:00:00Z'; const feedKey = 'tcgplayer/3/10/products';
const cache = new Map([[feedKey, { payload: { success: true, results: [] }, dataset_at: dataset, fetched_at: '2026-10-01T00:00:00Z' }], ['last-updated', { payload: oldDataset, dataset_at: oldDataset, fetched_at: new Date(Date.now() - 7200000).toISOString() }]]); const revisions = []; let feedFetches = 0;
const fakeDb = { schema: (schema) => { assert.equal(schema, 'api', 'internal market schema must not be exposed'); return { rpc: async (name, args) => { revisions.push([name, args]); return { data: name === 'read_catalogue_bulk_feed' ? cache.get(args.p_key) ?? null : name === 'finish_catalogue_bulk_feed' ? true : '00000000-0000-4000-8000-000000000001', error: null }; } }; } };
const fixtureFetch = async (url) => { feedFetches++; return url.endsWith('last-updated.txt') ? new Response(dataset) : new Response(JSON.stringify({ success: true, results: [] })); };
const feedLoader = createBulkFeedLoader(fakeDb, fixtureFetch); feedLoader.setDataset(dataset); await feedLoader.load(feedKey);
assert.equal(feedFetches, 0, 'same-build set file remains cached after 24 hours');
await feedLoader.load('last-updated'); assert.equal(feedFetches, 1, 'hour-expired metadata is refreshed');
cache.set(feedKey, { payload: { success: true, results: [] }, dataset_at: oldDataset, fetched_at: '2026-10-03T11:00:00Z' }); feedLoader.setDataset(dataset); await feedLoader.load(feedKey);
assert.equal(feedFetches, 2); assert.ok(revisions.some(([name, args]) => name === 'claim_catalogue_bulk_feed_revision' && args.p_key === feedKey && args.p_dataset === dataset));

// An unmapped native set remains visible and terminal rather than being silently
// skipped or incorrectly joined to an English set.
claimIndex = 0; const unmapped = []; const imported = [];
const gap = await runCatalogueBulkSweep({ datasetAt: '2026-10-03T00:00:00Z', fx, now, groups: [jaGroup], maxGroups: 1, begin: async () => ({ runId: 'gap' }), claim: async () => claimIndex++ ? null : claimed[1], resolveSet: async () => ({ status: 'ambiguous' }), candidates: async () => { throw Error('must not read unmapped cards'); }, loader: { load: async (key) => { imported.push(key); return { results: [] }; } }, store: async () => { throw Error('must not write unmapped price'); }, finish: async (value) => { unmapped.push(value); return true; } });
assert.equal(gap.unmapped, 1); assert.equal(unmapped[0].status, 'unmapped');
assert.deepEqual(imported, ['tcgplayer/85/20/products', 'tcgplayer/85/20/prices'], 'unmapped set feeds remain cached for mapping repair');
await assert.rejects(mainCatalogueBulkPrices([]), /disabled/);
console.log('Catalogue bulk provider passed: category 3/85, durable map candidates, collision rejection, reverse holo, 600-card pagination/resume, explicit mapping gaps, and disabled live rollout.');
