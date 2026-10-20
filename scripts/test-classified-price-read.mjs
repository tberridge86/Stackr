import assert from 'node:assert/strict';
import { createCataloguePriceRead } from '../backend/lib/marketPricing/cataloguePriceRead.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const selected = (n = 1, extra = {}) => ({ variant_id: id(n), printing_id: id(1000 + n), set_id: id(2000 + n),
  catalogue_version_id: id(9000), language_code: 'en', variant_code: 'normal', finish_code: 'normal',
  requested_variant_ids: [id(n)], is_default: true, ...extra });
const unavailable = (variantId, _input, reason = 'no_stored_market_quote') => ({ variantId, productType: 'raw_card', currency: 'GBP',
  identityKey: variantId, status: 'unavailable', priceType: 'unavailable', estimates: { central: null, low: null, high: null },
  confidence: { score: 0, label: 'insufficient_evidence' }, freshness: 'unknown', calculatedAt: null, staleAfter: null,
  provenLastSold: false, lastSoldObservationId: null, lastSoldEvidence: null, sourceBreakdown: [], outliers: {},
  sample: { total: 0, sold: 0, active: 0, sources: 0, dateRange: { from: null, to: null } },
  fallbackEstimate: null, unavailableReason: reason, estimateVersion: 'fixture' });
const quote = (amount, extra = {}) => ({ ...unavailable(id(1)), status: 'market_estimate', priceType: 'market_estimate',
  unavailableReason: null, estimates: { central: amount, low: null, high: null }, freshness: 'stale', ...extra });
const iso = (offset = 0) => new Date(Date.now() + offset).toISOString();
const resolution = (row = selected(), extra = {}) => {
  const sourceAt = iso(-3600000); const retrievedAt = iso(-1800000); const staleAfter = iso(3600000);
  return { classification: 'MARKET_GUIDE', variantId: row.variant_id,
  printingId: row.printing_id, setId: row.set_id, catalogueVersionId: row.catalogue_version_id,
  language: row.language_code, finish: row.finish_code, currency: 'GBP', value: 6.12345, confidence: 0.85,
  provider: 'tcgcsv', evidenceType: 'exact_variant_market', printingMatch: true, languageMatch: true, finishMatch: true,
  condition: 'raw_market_unspecified', grade: null, exact: false, usableForHoldingsValuation: false,
  sourceAt, retrievedAt, staleAfter, checkedAt: iso(-600000),
  policyVersion: 'classified-v1', marketSignalValue: 6.12345,
  provenance: { provider: 'tcgcsv', scope: 'exact_variant_market', currency: 'GBP', value: 6.12345,
    variant_id: row.variant_id, printing_id: row.printing_id, set_id: row.set_id, catalogue_version_id: row.catalogue_version_id,
    language: row.language_code, finish: row.finish_code, variant_code: row.variant_code,
    source_at: sourceAt, retrieved_at: retrievedAt, stale_after: staleAfter,
    source_record: { variant_id: row.variant_id, printing_id: row.printing_id, set_id: row.set_id, catalogue_version_id: row.catalogue_version_id,
      language_code: row.language_code, category_id: row.language_code === 'ja' ? 85 : 3, group_id: 44, product_id: 55, subtype: 'Normal',
      central_estimate: 6.12345, dataset_at: sourceAt, recorded_at: retrievedAt, stale_after: staleAfter,
      original_price: 8.1646, original_currency: 'USD', exchange_rate: 0.75, exchange_rate_at: sourceAt, exchange_rate_source: 'fixture' } },
  ...extra };
};
const marketResolution = (amount, { scope = 'exact_variant_market', classification = amount < 2 ? 'ESTIMATED_VALUE' : 'MARKET_GUIDE' } = {}) => {
  const base = resolution();
  return { ...base, classification, evidenceType: scope, finishMatch: scope === 'exact_variant_market',
    value: classification === 'ESTIMATED_VALUE' ? Math.max(0.1, Math.round(amount * 10) / 10) : amount,
    marketSignalValue: amount, provenance: { ...base.provenance, scope, value: amount,
      ...(scope === 'printing_market' ? { finish: null, variant_code: null } : {}),
      source_record: { ...base.provenance.source_record, central_estimate: amount, original_price: amount / 0.75 } } };
};
const noPrice = (row = selected(), extra = {}) => resolution(row, { classification: 'PRICE_UNAVAILABLE', value: null,
  provider: null, evidenceType: 'none', confidence: 0, sourceAt: null, retrievedAt: null, staleAfter: null,
  reason: 'no_defensible_market_evidence', provenance: undefined, ...extra });

function fixture(rows = [selected()], options = {}) {
  const calls = [];
  const supabase = { schema: () => ({ rpc(name, args) {
    const call = { name, args }; calls.push(call);
    const work = async () => {
      if (name === 'read_catalogue_prices') return options.identityWork ? options.identityWork(call) : options.identityResponse ?? { data: (options.references ?? rows.map(r => r.variant_id)).map(reference => ({ reference,
        candidates: options.byReference?.[reference] ?? rows.filter(r => r.variant_id === reference) })) };
      if (name === 'read_pricing_classifications') {
        if (options.classificationError) return { error: options.classificationError };
        if (options.classificationWork) return options.classificationWork(call);
        return { data: options.classifications ?? [] };
      }
      return { data: [] };
    };
    const builder = { abortSignal(signal) { call.signal = signal; return builder; }, then(resolve, reject) { return Promise.resolve().then(work).then(resolve, reject); } };
    return builder;
  }, from(table) {
    let ids = [];
    const builder = { select() { return builder; }, eq() { return builder; }, in(_key, values) { ids = values; return builder; }, limit() { return builder; },
      abortSignal() { return builder; }, then(resolve) { return Promise.resolve({ data: rows.filter(r => ids.includes(table === 'catalogue_sets' ? r.set_id : r.variant_id))
        .map(r => ({ ...r, rarity_label: 'Common', release_date: '2022-01-01' })) }).then(resolve); } };
    return builder;
  } }) };
  const read = createCataloguePriceRead({ supabase, toEstimatePrice: r => r, toSnapshotPrice: r => r,
    unavailablePrice: unavailable, readTimeoutMs: options.readTimeoutMs ?? 100, ancillaryTimeoutMs: options.ancillaryTimeoutMs ?? 80 });
  return { calls, read: (input = {}) => read({ references: options.references ?? rows.map(r => r.variant_id), estimateMode: 'general', classificationVersion: 'classified-v1', ...input }) };
}

// Red against the pre-port reader: it ignores the stored unavailable decision
// and synthesises the 9p common-card provisional fallback instead.
const explicit = fixture([selected()], { classifications: [{ variant_id: id(1), resolution: noPrice() }] });
const explicitRow = (await explicit.read()).prices[0];
assert.equal(explicitRow.price.estimates.central, null, 'authoritative unavailable must suppress the provisional fallback');
assert.equal(explicitRow.price.classification, 'PRICE_UNAVAILABLE');

const { classifiedPrice } = await import('../backend/lib/marketPricing/classifiedPriceRead.js');
const good = resolution();
const priced = classifiedPrice(good, selected(), unavailable);
assert.equal(priced.estimates.central, good.value, 'retain source precision before display');
assert.equal(priced.classification, 'MARKET_GUIDE');
assert.equal(priced.freshness, 'fresh');
assert.equal(priced.sample.sold, 0);
assert.equal(priced.provenLastSold, false);
assert.deepEqual(priced.sourceBreakdown[0].provenance, good.provenance);
const reviewFailures = [];
const adversarial = [
  ['outer value detached from verified source', { ...good, value: 1234.56 }],
  ['printing guide above policy ceiling', { ...good, value: 60.12345, marketSignalValue: 60.12345,
    evidenceType: 'printing_market', finishMatch: false, provenance: { ...good.provenance, scope: 'printing_market',
      value: 60.12345, finish: null, variant_code: null, source_record: { ...good.provenance.source_record, central_estimate: 60.12345, original_price: 80.1646 } } }],
  ['expired source relabelled fresh', { ...good, provenance: { ...good.provenance, stale_after: iso(-1000) } }],
  ['classification checked before source retrieval', { ...good, checkedAt: iso(-7200000) }],
];
for (const [name, value] of adversarial) {
  const result = classifiedPrice(value, selected(), unavailable);
  if (result.estimates.central != null) reviewFailures.push(name);
}
assert.deepEqual(reviewFailures, [], 'independent-review adversarial values must remain unavailable');
for (const amount of [0.001, 0.15, 1.25, 1.23456, 1.999]) {
  const estimate = marketResolution(amount);
  const result = classifiedPrice(estimate, selected(), unavailable);
  assert.equal(result.classification, 'ESTIMATED_VALUE');
  assert.equal(result.estimates.central, estimate.value, 'estimated tier uses the verified positive tenth/minimum policy');
  assert.equal(result.sourceBreakdown[0].provenance.value, amount, 'source precision is retained');
}
for (const amount of [6.12345, 19.99999]) {
  const printing = marketResolution(amount, { scope: 'printing_market' });
  assert.equal(classifiedPrice(printing, selected(), unavailable).estimates.central, amount);
}
assert.equal(classifiedPrice(marketResolution(1.23456, { scope: 'printing_market' }), selected(), unavailable).estimates.central, 1.2);
const storedPennyGuide = marketResolution(6.12);
storedPennyGuide.provenance.source_record.original_price = good.provenance.source_record.original_price;
assert.equal(classifiedPrice(storedPennyGuide, selected(), unavailable).estimates.central, 6.12, 'writer-rounded GBP still verifies against original USD×rate');
const incorrectPennyGuide = marketResolution(6.13);
incorrectPennyGuide.provenance.source_record.original_price = good.provenance.source_record.original_price;
assert.equal(classifiedPrice(incorrectPennyGuide, selected(), unavailable).estimates.central, null, 'a neighboring penny is not valid FX evidence');
for (const invalid of [marketResolution(20, { scope: 'printing_market' }), marketResolution(60.12345, { scope: 'printing_market' }),
  marketResolution(1.23456, { scope: 'printing_market', classification: 'MARKET_GUIDE' }),
  marketResolution(6.12345, { classification: 'ESTIMATED_VALUE' }), { ...good, value: 6.12 },
  { ...good, provenance: { ...good.provenance, source_record: { ...good.provenance.source_record, exchange_rate: 1 / 0.75 } } },
  { ...good, provenance: { ...good.provenance, source_record: { ...good.provenance.source_record, central_estimate: 1234.56 } } }]) {
  assert.equal(classifiedPrice(invalid, selected(), unavailable).estimates.central, null);
}
const staleAfter = iso(-1000);
const validStale = { ...good, staleAfter, provenance: { ...good.provenance, stale_after: staleAfter,
  source_record: { ...good.provenance.source_record, stale_after: staleAfter } } };
assert.equal(classifiedPrice(validStale, selected(), unavailable).freshness, 'stale');
const offset = (value) => value.replace('Z', '+00:00');
const equivalentInstants = { ...good, sourceAt: offset(good.sourceAt), retrievedAt: offset(good.retrievedAt), staleAfter: offset(good.staleAfter), checkedAt: offset(good.checkedAt) };
assert.equal(classifiedPrice(equivalentInstants, selected(), unavailable).freshness, 'fresh', 'timestamp equality compares instants, not UTC spelling');
for (const invalid of [
  { ...good, checkedAt: good.sourceAt },
  { ...good, checkedAt: null },
  { ...good, checkedAt: iso(3600000) },
  { ...good, provenance: { ...good.provenance, stale_after: undefined } },
  { ...good, provenance: { ...good.provenance, stale_after: 'invalid' } },
  { ...good, provenance: { ...good.provenance, source_at: iso(-3600001) } },
  { ...good, provenance: { ...good.provenance, retrieved_at: iso(-1700000) } },
  { ...good, provenance: { ...good.provenance, source_record: { ...good.provenance.source_record, recorded_at: iso(-1500000) } } },
  { ...good, provenance: { ...good.provenance, source_record: { ...good.provenance.source_record, dataset_at: null } } },
  { ...good, provenance: { ...good.provenance, source_record: { ...good.provenance.source_record, stale_after: iso(-1000) } } },
  { ...good, provenance: { ...good.provenance, source_record: { ...good.provenance.source_record, exchange_rate_at: iso(-900000) } } },
]) assert.equal(classifiedPrice(invalid, selected(), unavailable).estimates.central, null, 'invalid or conflicting provenance chronology is unavailable');
for (const bad of [{ variantId: id(2) }, { printingId: id(3) }, { setId: id(4) }, { catalogueVersionId: id(5) },
  { language: 'zh-tw' }, { finish: 'holo' }, { currency: 'USD' }, { value: Infinity }, { value: 0 }, { confidence: NaN },
  { confidence: -1 }, { confidence: 1.1 }, { confidence: '0.85' }, { sourceAt: null }, { sourceAt: 'invalid' }, { sourceAt: iso(3600000) },
  { sourceAt: '2026-02-30T00:00:00Z' }, { staleAfter: '2027-02-30T00:00:00Z' },
  { retrievedAt: null }, { retrievedAt: iso(3600000) }, { staleAfter: null }, { staleAfter: 'invalid' },
  { staleAfter: iso(-7200000) }, { grade: 10 }, { condition: 'near_mint' }, { exact: true }, { usableForHoldingsValuation: true },
  { classification: 'EXACT_PRICE' }, { provider: 'ebay_sold' }, { evidenceType: 'sold' }, { printingMatch: false },
  { provenance: { ...good.provenance, language: 'ja' } }, { provenance: { ...good.provenance, variant_code: 'holo' } },
  { provenance: { ...good.provenance, source_record: { ...good.provenance.source_record, category_id: 85 } } },
  { provenance: { ...good.provenance, source_record: { ...good.provenance.source_record, product_id: null } } },
  { provenance: { ...good.provenance, source_record: { ...good.provenance.source_record, subtype: 'Holofoil' } } },
  { provenance: null }]) {
  const result = classifiedPrice({ ...good, ...bad }, selected(), unavailable);
  assert.equal(result.estimates.central, null, `reject malformed evidence ${JSON.stringify(bad)}`);
  assert.notEqual(result.freshness, 'fresh');
}
const cn = selected(1, { language_code: 'zh-cn' });
assert.equal(classifiedPrice(resolution(cn, { language: 'zh-tw' }), cn, unavailable).estimates.central, null);
assert.equal(classifiedPrice(resolution(cn), cn, unavailable).estimates.central, null, 'unsupported provider language cannot acquire an invented price');

const exactQuote = quote(99.125, { provenLastSold: true, priceType: 'recent_sold_value', lastSoldEvidence: { evidenceSha256: 'a'.repeat(64) } });
const exact = fixture([selected(1, { estimate: exactQuote })], { classifications: [{ variant_id: id(1), resolution: noPrice() }] });
assert.deepEqual((await exact.read()).prices[0].price, exactQuote, 'preserve every exact/stale/sold/source field');
assert.equal(exact.calls.length, 1, 'exact priced pages need no additive RPC');
const absent = fixture([selected()], { classificationError: { code: 'PGRST202' } });
assert.equal((await absent.read()).prices[0].price.fallbackEstimate.reason, 'provisional_catalogue_baseline');
for (const error of [{ code: '42501' }, { code: '57014' }, { status: 401 }, { code: 'PGRST500' },
  { code: '42883', message: 'some_inner_dependency does not exist' }]) {
  const page = await fixture([selected()], { classificationError: error }).read();
  assert.equal(page.prices.length, 0, 'failed reads do not manufacture unavailable prices');
  assert.deepEqual(page.readErrors, [{ reference: id(1), code: error.code ?? 'catalogue_price_read_failed' }]);
}
for (const classifications of [[{ variant_id: id(2), resolution: good }],
  [{ variant_id: id(1), resolution: good }, { variant_id: id(1), resolution: good }]]) {
  const page = await fixture([selected()], { classifications }).read();
  assert.equal(page.prices.length, 0);
  assert.equal(page.readErrors[0].code, 'catalogue_price_read_failed');
}
const pageRows = Array.from({ length: 100 }, (_, i) => selected(i + 1));
const byReference = Object.fromEntries(pageRows.map(row => [row.variant_id, [row, ...Array.from({ length: 3 }, (_, i) => ({ ...row,
  variant_id: id(5000 + i), requested_variant_ids: [row.variant_id], is_default: false, variant_code: 'reverse_holo', finish_code: 'reverse_holo' }))]]));
const page = fixture(pageRows, { byReference });
await page.read();
const classificationCalls = page.calls.filter(c => c.name === 'read_pricing_classifications');
assert.equal(classificationCalls.length, 1);
assert.deepEqual(classificationCalls[0].args.p_variants, pageRows.map(r => r.variant_id), 'only 100 selected identities, never 400 candidates');
assert.ok(page.calls.every(c => (c.args.p_printing_ids ?? c.args.p_variants ?? c.args.p_references).length <= 100));
for (const extra of [{ product_kind: 'graded_card' }, { product_kind: 'sealed_product' }, { grader_code: 'psa' }]) {
  const f = fixture([selected(1, extra)]); await f.read();
  assert.equal(f.calls.length, 1, 'raw-only adapters never consult graded/sealed evidence');
}
let completeLate;
const stalled = fixture([selected()], { ancillaryTimeoutMs: 20, classificationWork: () => new Promise(resolve => { completeLate = resolve; }) });
const start = performance.now();
assert.equal((await stalled.read()).readErrors[0].code, 'catalogue_price_read_timeout');
assert.ok(performance.now() - start < 500);
assert.ok(stalled.calls.filter(c => c.name !== 'read_catalogue_prices').every(c => c.signal.aborted));
completeLate({ data: [{ variant_id: id(1), resolution: good }] });
await new Promise(resolve => setImmediate(resolve));
const partial = fixture([selected(1), selected(2)], { classifications: [{ variant_id: id(1), resolution: good }] });
const partialRows = (await partial.read()).prices;
assert.equal(partialRows[0].price.classification, 'MARKET_GUIDE');
assert.equal(partialRows[1].price.fallbackEstimate.reason, 'provisional_catalogue_baseline', 'missing classification retains supported fallback');
for (const classificationError of [{ code: '42501' }, { code: 'catalogue_price_read_timeout' }]) {
  const mixed = fixture([selected(1, { estimate: exactQuote }), selected(2)], { classificationError });
  const result = await mixed.read();
  assert.deepEqual(result.prices[0].price, exactQuote, 'mixed cold reads preserve their newly retrieved exact evidence');
  assert.equal(result.prices.length, 1);
  assert.deepEqual(result.readErrors, [{ reference: id(2), code: classificationError.code }]);
}
for (const classificationError of [{ code: '42501' }, { code: '57014' }]) {
  const legacy = fixture([selected()], { classificationError });
  const page = await legacy.read({ classificationVersion: undefined });
  assert.equal(page.prices[0].price.fallbackEstimate.reason, 'provisional_catalogue_baseline');
  assert.equal(page.readErrors, undefined);
  assert.ok(legacy.calls.every(call => call.name !== 'read_pricing_classifications'), 'installed legacy clients do not enter the new classification path');
}
const legacyStall = fixture([selected()], { classificationWork: () => new Promise(() => {}) });
assert.equal((await legacyStall.read({ classificationVersion: undefined })).prices.length, 1);
assert.ok(legacyStall.calls.every(call => call.name !== 'read_pricing_classifications'));
let finishMixed;
const mixedStall = fixture([selected(1, { estimate: exactQuote }), selected(2)], { ancillaryTimeoutMs: 20,
  classificationWork: () => new Promise(resolve => { finishMixed = resolve; }) });
const mixedTimeout = await mixedStall.read();
assert.deepEqual(mixedTimeout.prices[0].price, exactQuote, 'real timed-out classification cannot erase a neighboring exact quote');
assert.deepEqual(mixedTimeout.readErrors, [{ reference: id(2), code: 'catalogue_price_read_timeout' }]);
finishMixed({ data: [] });
let finishIdentity;
const identityStall = fixture([selected()], { readTimeoutMs: 20, identityWork: () => new Promise(resolve => { finishIdentity = resolve; }) });
await assert.rejects(identityStall.read(), error => error.code === 'catalogue_price_read_timeout');
finishIdentity({ data: [{ reference: id(1), candidates: [selected()] }] });
await new Promise(resolve => setImmediate(resolve));
assert.equal(identityStall.calls.length, 1, 'late identity completion cannot initiate new ancillary requests');
await assert.rejects(fixture().read({ classificationVersion: 'unknown-v2' }), error => error.code === 'invalid_classification_version');
console.log('Classified stored read passed: exact priority, authoritative unavailable, identity/provenance/freshness rejection, absent vs failed RPC, selected 100-ID cap, cancellation and partial rows.');
