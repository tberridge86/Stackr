import assert from 'node:assert/strict';
import { scoreObservationMatch } from '../backend/lib/pricingV2/matcher.js';
import { normaliseObservation } from '../backend/lib/pricingV2/normalise.js';
import { declaredEbayListingLanguage, ebayListingLanguageEvidence, normaliseEbayActiveListing } from '../backend/lib/pricingV2/adapters/ebayActive.js';

const identity = language => ({
  language,
  productType: 'raw_card',
  canonicalCardName: 'Pikachu',
  localisedCardNames: { [language]: '皮卡丘' },
  cardNumber: '001',
  printedCardNumber: '001',
  canonicalSetName: 'Test Set',
  localisedSetNames: { [language]: 'Test Set' },
  setCode: 'TST',
  finish: 'normal',
  edition: 'modern',
});
const score = (title, language, declaredLanguage = null) => scoreObservationMatch(
  { title, language: declaredLanguage }, identity(language), { minimumMatchScore: 0.85 },
);

const simplified = 'Pikachu 001 Test Set Simplified Chinese Pokemon Card';
const traditional = 'Pikachu 001 Test Set Traditional Chinese Pokemon Card';
const ambiguous = '皮卡丘 001 Test Set Chinese Pokemon Card';
assert.equal(score(simplified, 'zh-CN').accepted, true, 'explicit Simplified Chinese title may match zh-CN');
assert.equal(score(simplified, 'zh-TW').accepted, false, 'Simplified Chinese title must not match zh-TW');
assert.equal(score(traditional, 'zh-TW').accepted, true, 'explicit Traditional Chinese title may match zh-TW');
assert.equal(score(traditional, 'zh-CN').accepted, false, 'Traditional Chinese title must not match zh-CN');
assert.equal(score(ambiguous, 'zh-CN').accepted, false, 'generic Chinese/CJK title must not match zh-CN');
assert.equal(score(ambiguous, 'zh-TW').accepted, false, 'generic Chinese/CJK title must not match zh-TW');
assert.equal(score('Pikachu 001 Test Set Pokemon Card', 'zh-CN', 'zh-CN').accepted, true, 'explicit declared zh-CN may match zh-CN');
assert.equal(score('Pikachu 001 Test Set Pokemon Card', 'zh-TW', 'zh-CN').accepted, false, 'declared zh-CN must not match zh-TW');

const simplifiedListing = { localizedAspects: [{ name: 'Language', value: 'Simplified Chinese' }] };
const traditionalListing = { aspects: [{ aspectName: 'Card Language', aspectValues: [{ value: 'Traditional Chinese' }] }] };
const genericListing = { localizedAspects: [{ name: 'Language', value: 'Chinese' }] };
const conflictingListing = { localizedAspects: [{ name: 'Language', value: 'Simplified Chinese' }, { name: 'Language', value: 'Traditional Chinese' }] };
assert.equal(declaredEbayListingLanguage(simplifiedListing), 'zh-CN');
assert.equal(declaredEbayListingLanguage(traditionalListing), 'zh-TW');
assert.equal(declaredEbayListingLanguage(genericListing), null, 'generic Chinese is not an exact target language');
assert.equal(declaredEbayListingLanguage(conflictingListing), null, 'conflicting language aspects must fail closed');
assert.deepEqual(ebayListingLanguageEvidence(conflictingListing), { status: 'conflicting', language: null, reason: 'LANGUAGE_EVIDENCE_CONFLICT' });

const normalisedSimplified = normaliseEbayActiveListing({ ...simplifiedListing, itemId: 'v1|1|0', title: simplified, price: { value: '10', currency: 'GBP' }, shippingOptions: [{ shippingCost: { value: '0', currency: 'GBP' } }] }, 'fixture');
assert.equal(normalisedSimplified.language, 'zh-CN');
assert.equal(normalisedSimplified.languageEvidence.status, 'declared');
assert.equal(normalisedSimplified.metadata.languageEvidence.status, 'declared');

const normalisedConflict = normaliseEbayActiveListing({ ...conflictingListing, itemId: 'v1|2|0', title: simplified, price: { value: '10', currency: 'GBP' }, shippingOptions: [{ shippingCost: { value: '0', currency: 'GBP' } }] }, 'fixture');
const conflictMatch = scoreObservationMatch(normalisedConflict, identity('zh-CN'), { minimumMatchScore: 0.85 });
assert.equal(conflictMatch.accepted, false, 'conflicting declared aspects cannot fall back to an explicit Simplified title');
assert.ok(conflictMatch.reasons.includes('LANGUAGE_EVIDENCE_CONFLICT'));
const persistedConflict = normaliseObservation(normalisedConflict, identity('zh-CN'), conflictMatch);
assert.equal(persistedConflict.metadata.languageEvidence.status, 'conflicting', 'language evidence status survives normalisation');
assert.match(persistedConflict.exclusionReason, /LANGUAGE_EVIDENCE_CONFLICT/);

const declaredChineseWithTraditionalTitle = normaliseEbayActiveListing({ ...simplifiedListing, itemId: 'v1|3|0', title: traditional, price: { value: '10', currency: 'GBP' }, shippingOptions: [{ shippingCost: { value: '0', currency: 'GBP' } }] }, 'fixture');
const declaredTitleConflict = scoreObservationMatch(declaredChineseWithTraditionalTitle, identity('zh-CN'), { minimumMatchScore: 0.85 });
assert.equal(declaredTitleConflict.accepted, false, 'declared Simplified language cannot override explicit Traditional title');
assert.ok(declaredTitleConflict.reasons.includes('LANGUAGE_EVIDENCE_TITLE_CONFLICT'));
console.log('eBay active-listing language evidence keeps Simplified and Traditional Chinese distinct.');
