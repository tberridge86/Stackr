// @ts-nocheck
import assert from 'node:assert/strict';
import { buildCanonicalIdentity } from '../backend/lib/pricingV2/identity.js';
import { generatePricingQueries } from '../backend/lib/pricingV2/queryGenerator.js';
import { scoreObservationMatch } from '../backend/lib/pricingV2/matcher.js';
import { normaliseObservation } from '../backend/lib/pricingV2/normalise.js';
import { calculatePricingEstimate } from '../backend/lib/pricingV2/statistics.js';
import { calculateConfidence } from '../backend/lib/pricingV2/confidence.js';

function makeIdentity(overrides = {}) {
  return buildCanonicalIdentity({
    id: overrides.id ?? 'sv12a-225',
    name: overrides.name ?? 'Zacian',
    language: overrides.language ?? 'ja',
    number: overrides.number ?? '225',
    rarity: overrides.rarity ?? 'SAR',
    set_id: overrides.setId ?? 'sv12a',
    raw_data: {
      language: overrides.language ?? 'ja',
      english_display_name: overrides.englishName ?? 'Zacian',
      local_name: overrides.localName ?? 'ザシアン',
      set: {
        id: overrides.setId ?? 'sv12a',
        name: overrides.setName ?? 'VSTAR Universe',
        english_display_name: overrides.setName ?? 'VSTAR Universe',
        printedTotal: overrides.setTotal ?? '172',
        set_code: overrides.setCode ?? 'S12a',
      },
    },
  }, overrides);
}

function obs(title: string, price: number, identity: any, extra = {}) {
  const match = scoreObservationMatch({
    title,
    itemPrice: price,
    currency: 'GBP',
    sourceId: extra.sourceId ?? 'manual_verified_comp',
    sourceType: extra.sourceType ?? 'sold_transaction',
    language: extra.language ?? identity.language,
  }, identity, { minimumMatchScore: 0.85 });
  return normaliseObservation({
    title,
    itemPrice: price,
    currency: 'GBP',
    shippingPrice: 0,
    sourceId: extra.sourceId ?? 'manual_verified_comp',
    sourceType: extra.sourceType ?? 'sold_transaction',
    externalReference: extra.externalReference ?? `${title}-${price}`,
    soldAt: extra.soldAt ?? new Date().toISOString(),
    language: extra.language ?? identity.language,
  }, identity, match);
}

const english = makeIdentity({ language: 'en', setId: 'swsh12pt5', number: 'GG48', setName: 'Crown Zenith' });
const japanese = makeIdentity({ language: 'ja', setId: 'sv12a', number: '225', setName: 'VSTAR Universe' });
const chinese = makeIdentity({ language: 'zh-tw', setId: 'csv5', number: '0101', setName: 'Gem Pack Vol. 5' });
assert.notEqual(english.identityKey, japanese.identityKey, 'English and Japanese identities must not share a key');
assert.notEqual(japanese.identityKey, chinese.identityKey, 'Japanese and Chinese identities must not share a key');

const masterBall = makeIdentity({ finish: 'masterball_reverse' });
const reverse = makeIdentity({ finish: 'reverse_holo' });
assert.notEqual(masterBall.identityKey, reverse.identityKey, 'Master Ball reverse and standard reverse must not share a key');

const graded = makeIdentity({ productType: 'graded_card', gradingCompany: 'PSA', grade: '10' });
const raw = makeIdentity({ productType: 'raw_card' });
assert.notEqual(graded.identityKey, raw.identityKey, 'Raw and graded identities must not share a key');

const wrongLanguage = scoreObservationMatch({
  title: 'Zacian GG48 Crown Zenith English Pokemon Card',
  language: 'en',
}, japanese);
assert.equal(wrongLanguage.accepted, false, 'Wrong-language listing must be rejected');

const rawVsGraded = scoreObservationMatch({
  title: 'PSA 10 Zacian 225/172 VSTAR Universe Japanese Pokemon Card',
  language: 'ja',
}, raw);
assert.equal(rawVsGraded.accepted, false, 'Graded listing must not price a raw card');

const queries = generatePricingQueries(japanese);
assert.ok(queries.some((query) => query.includes('225/172') || query.includes('225')), 'Queries should include collector number');
assert.ok(queries.some((query) => /Japanese|JPN|Japan/.test(query)), 'Queries should include language hints');

const soldRows = [
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 10, japanese, { externalReference: 'a' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 11, japanese, { externalReference: 'b' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 12, japanese, { externalReference: 'c' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 999, japanese, { externalReference: 'outlier' }),
];
const estimate = calculatePricingEstimate(soldRows);
assert.equal(estimate.priceType, 'recent_sold_value');
assert.ok(estimate.marketEstimate >= 10 && estimate.marketEstimate <= 12, 'Outlier must not dominate weighted median');

const duplicateEstimate = calculatePricingEstimate([
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 10, japanese, { externalReference: 'dup' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 10, japanese, { externalReference: 'dup' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 12, japanese, { externalReference: 'new' }),
]);
assert.equal(duplicateEstimate.compCount, 2, 'Duplicate observations must be removed');

const activeOnly = calculatePricingEstimate([
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 30, japanese, { sourceId: 'ebay_active', sourceType: 'active_listing', externalReference: 'active-a' }),
  obs('Zacian 225/172 VSTAR Universe Japanese Pokemon Card SAR', 35, japanese, { sourceId: 'ebay_active', sourceType: 'active_listing', externalReference: 'active-b' }),
]);
const activeConfidence = calculateConfidence(activeOnly, activeOnly.observationsUsed, japanese);
assert.equal(activeOnly.priceType, 'asking_price_indication', 'Active listings must be labelled as asking indication');
assert.equal(activeOnly.soldCompCount, 0, 'Active listings must not appear as sold comps');
assert.equal(activeConfidence.label, 'low', 'Active-only confidence must stay low');

console.log('Pricing V2 tests passed');
