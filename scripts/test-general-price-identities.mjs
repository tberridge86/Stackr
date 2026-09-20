import assert from 'node:assert/strict';
import { generalPrintingDiscoveryIds, readGeneralPrintingCatalogue, resolveGeneralPriceIdentity } from './lib/general-price-identities.mjs';
import { chooseGeneralPriceUnits, summarisePreparedUnits } from './lib/prepared-collection-valuation.mjs';
import { selectGeneralPriceBase, wrapGeneralEstimate } from '../backend/lib/marketPricing/generalEstimate.js';
const set = '11111111-1111-4111-8111-111111111111';
const printing = '22222222-2222-4222-8222-222222222222';
const normal = '33333333-3333-4333-8333-333333333333';
const holo = '44444444-4444-4444-8444-444444444444';
const row = (variant_id, variant_code, finish_code = variant_code) => ({ variant_id, printing_id: printing, set_id: set, set_code: 'me01', collector_number: '133', language_code: 'en', variant_code, finish_code });
const raw = { quantity: 1, condition: 'Near Mint', grade_company: '', grade: '', language: 'en', set_id: 'me1', card_id: 'me1-133', variant: 'normal' };

assert.equal(selectGeneralPriceBase([row(normal, 'normal'), row(holo, 'holo')]).baseVariantId, normal, 'normal is preferred over holo');
assert.equal(selectGeneralPriceBase([row(holo, 'holo')]).baseVariantId, holo, 'a unique holo is a safe general base');
assert.equal(selectGeneralPriceBase([row(holo, 'holo'), row('55555555-5555-4555-8555-555555555555', 'holo')]), null, 'two holos are ambiguous');

const identifiers = [
  { source_entity_type: 'set', external_id: 'me1', language_code: 'en', set_id: set },
  { source_entity_type: 'card', external_id: 'me1-133', language_code: 'en', printing_id: printing, variant_id: null },
];
assert.deepEqual(resolveGeneralPriceIdentity(raw, identifiers, [row(normal, 'normal'), row(holo, 'holo')]), {
  ok: true, priceVariantId: normal, priceScope: 'printing_general', resolution: 'same_printing_base',
  selection: { baseVariantId: normal, printingId: printing, setId: set, language: 'en', finishCode: 'normal', reason: 'same_printing_normal_base' },
  baseCandidates: [
    { baseVariantId: normal, printingId: printing, setId: set, language: 'en', finishCode: 'normal', reason: 'same_printing_normal_base' },
    { baseVariantId: holo, printingId: printing, setId: set, language: 'en', finishCode: 'holo', reason: 'same_printing_unique_holo_base' },
  ],
});
assert.equal(resolveGeneralPriceIdentity(raw, identifiers, [row(holo, 'holo')]).selection.baseVariantId, holo, 'a same-set English holo is used only when normal is absent');

const unaliasedSet = { ...raw, set_id: 'me01' };
const printingOnly = [{ source_entity_type: 'card', external_id: 'me1-133', language_code: 'en', printing_id: printing, variant_id: null, confidence: '1.0' }];
const holoOnly = [row(holo, 'holo')];
assert.equal(resolveGeneralPriceIdentity(unaliasedSet, printingOnly, holoOnly).resolution, 'approved_printing_alias_general', 'an approved English printing alias can prove its own one-set holo base');
assert.equal(resolveGeneralPriceIdentity(unaliasedSet, printingOnly, [{ ...holoOnly[0], set_code: null, collector_number: null }, holoOnly[0]]).ok, true,
  'a partial direct row and its complete printing copy are consolidated before ME evidence is checked');
assert.equal(resolveGeneralPriceIdentity(unaliasedSet, printingOnly, [{ ...holoOnly[0], set_code: 'me02' }, holoOnly[0]]).ok, false,
  'conflicting duplicate physical identity evidence is refused');
assert.equal(resolveGeneralPriceIdentity(unaliasedSet, [{ ...printingOnly[0], confidence: 1 }], holoOnly).ok, true, 'numeric approved confidence remains authoritative');
assert.equal(resolveGeneralPriceIdentity({ ...unaliasedSet, set_id: set }, printingOnly, holoOnly).ok, true, 'a matching supplied canonical set UUID is accepted as set evidence');
assert.equal(resolveGeneralPriceIdentity(unaliasedSet, [{ ...printingOnly[0], confidence: '0.8' }], holoOnly).ok, false, 'unapproved aliases cannot broaden a missing set');
assert.equal(resolveGeneralPriceIdentity(unaliasedSet, printingOnly, [{ ...holoOnly[0], collector_number: '134' }]).ok, false, 'approved printing evidence must match the verified ME collector pair');
assert.equal(resolveGeneralPriceIdentity(unaliasedSet, [...printingOnly, { ...printingOnly[0], printing_id: '66666666-6666-4666-8666-666666666666' }], holoOnly).ok, false, 'conflicting printings are refused');
assert.equal(resolveGeneralPriceIdentity(raw, [...identifiers, { source_entity_type: 'set', external_id: 'me1', language_code: 'en', set_id: '77777777-7777-4777-8777-777777777777' }], [row(normal, 'normal')]).reason, 'general_identity_ambiguous', 'conflicting literal set aliases are refused');
assert.equal(resolveGeneralPriceIdentity({ ...raw, language: 'ja' }, identifiers, [row(normal, 'normal')]).ok, false, 'a foreign language cannot borrow English printing evidence');

const canonicalReverse = { ...raw, set_id: set, card_id: holo };
assert.equal(resolveGeneralPriceIdentity(canonicalReverse, [], [row(holo, 'holo'), row(normal, 'normal')]).priceVariantId, normal,
  'a direct canonical finish with its canonical set can select a proven normal sibling');
assert.deepEqual(generalPrintingDiscoveryIds([canonicalReverse], [], [row(holo, 'holo')]), [printing],
  'a direct canonical row requests its complete printing group even when one member was read already');

const exactPrice = { currency: 'GBP', status: 'available', estimates: { central: 12 }, fallbackEstimate: null };
const wrapped = wrapGeneralEstimate(exactPrice, selectGeneralPriceBase(holoOnly), 'same_printing_base');
assert.equal(wrapped.quoteScope, 'printing_level');
assert.equal(wrapped.generalEstimate.baseVariantId, holo);
assert.equal(wrapped.status, 'market_estimate');
assert.equal(wrapped.priceType, 'market_estimate');
assert.equal(wrapped.provenLastSold, false);
assert.deepEqual(wrapped.fallbackEstimate, { identityKey: null, reason: 'general_card_estimate', exact: false,
  baseVariantId: holo, printingId: printing, language: 'en', finishCode: 'holo', resolution: 'same_printing_base' });
assert.equal(wrapGeneralEstimate({ ...exactPrice, fallbackEstimate: { exact: false } }, selectGeneralPriceBase(holoOnly)), null, 'general values cannot chain fallbacks');
assert.equal(wrapGeneralEstimate({ ...exactPrice, quoteScope: 'printing_level', fallbackEstimate: null }, selectGeneralPriceBase(holoOnly)), null, 'a printing-level quote cannot chain into another estimate');
assert.equal(wrapGeneralEstimate({ ...exactPrice, estimates: { central: -1 } }, selectGeneralPriceBase(holoOnly)), null, 'a negative central estimate is not usable');
const soldBase = wrapGeneralEstimate({ ...exactPrice, status: 'recent_sold_value', priceType: 'recent_sold_value', sample: { sold: 4, active: 2 }, provenLastSold: true, lastSoldEvidence: { id: 'sale' } }, selectGeneralPriceBase(holoOnly));
assert.equal(soldBase.sample.sold, 0, 'a general estimate does not claim the base variant sold evidence as its own');
assert.equal(soldBase.lastSoldEvidence, null);
const prices = new Map([[normal, { ...exactPrice, freshness: 'fresh', staleAfter: '2099-01-01T00:00:00.000Z' }], [holo, { ...exactPrice, estimates: { central: 5 }, freshness: 'fresh', staleAfter: '2099-01-01T00:00:00.000Z' }]]);
const exactSummary = summarisePreparedUnits([{ quantity: 2, variantId: normal }], new Map(), prices);
assert.equal(exactSummary.pricedUnits, 2); assert.equal(exactSummary.exactPricedUnits, 2); assert.equal(exactSummary.generalEstimateUnits, 0);
const generalSummary = summarisePreparedUnits([
  { quantity: 2, priceVariantId: normal, priceScope: 'exact' },
  { quantity: 3, priceVariantId: holo, priceScope: 'printing_general', selection: selectGeneralPriceBase(holoOnly), resolution: 'same_printing_base' },
], new Map(), prices, Date.now(), { general: true });
assert.equal(generalSummary.valuationBasis, 'general_card_estimate');
assert.equal(generalSummary.pricedUnits, 5); assert.equal(generalSummary.exactPricedUnits, 2); assert.equal(generalSummary.generalEstimateUnits, 3);
assert.equal(generalSummary.exactPricedUnits + generalSummary.generalEstimateUnits, generalSummary.pricedUnits, 'exclusive accounting preserves quantity');
const unavailableExact = { ...exactPrice, status: 'unavailable', estimates: { central: null } };
const selected = chooseGeneralPriceUnits([{ quantity: 1, variantId: normal, generalBaseCandidates: [selectGeneralPriceBase(holoOnly)], selection: selectGeneralPriceBase(holoOnly), resolution: 'same_printing_base' }],
  new Map([[normal, unavailableExact], [holo, prices.get(holo)]]));
assert.equal(selected[0].priceScope, 'printing_general', 'an unavailable exact quote falls back to the separately proven printing base');
const exactSelected = chooseGeneralPriceUnits([{ quantity: 1, variantId: normal, generalBaseCandidates: [selectGeneralPriceBase(holoOnly)], selection: selectGeneralPriceBase(holoOnly) }], prices);
assert.equal(exactSelected[0].priceScope, 'exact', 'a usable exact quote remains preferred to a general base');
const discoveryCatalogue = Array.from({ length: 244 }, (_, index) => ({ ...row(`33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`, 'normal'), printing_id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}` }));
const discoveryUnits = discoveryCatalogue.map((card) => ({ ...raw, card_id: card.variant_id, set_id: set }));
const batches = [];
const discoveryDb = { schema: () => ({ from: () => {
  const query = { select: () => query, in: (_column, ids) => { batches.push(ids); return query; }, order: () => query,
    range: async () => ({ data: [], error: null }) };
  return query;
} }) };
await readGeneralPrintingCatalogue(discoveryDb, discoveryUnits, [], discoveryCatalogue);
assert.equal(batches.length, 5, 'the measured 244-printing owner cohort must fit bounded discovery');
assert(batches.every((batch) => batch.length <= 50), 'larger collections cannot expand any individual database request');
assert.equal(new Set(batches.flat()).size, 244, 'no printing is skipped or fetched twice');
console.log('General printing identity and labelled estimate tests passed.');
