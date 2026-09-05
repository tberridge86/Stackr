import assert from 'node:assert/strict';
import {
  canonicalEbayListingUrl,
  hasQualifiedSoldProvenance,
  validateSoldProvenance,
} from '../backend/lib/marketPricing/soldProvenance.js';

const completeSale = {
  externalReference: '123456789012',
  finalPrice: 42.5,
  currency: 'GBP',
  soldAt: '2026-09-03T10:00:00.000Z',
  sourceUrl: 'https://www.ebay.co.uk/itm/123456789012?_trkparms=ignored#details',
  saleStatus: 'completed',
  rawPayload: { result: 'immutable-provider-evidence' },
};

const accepted = validateSoldProvenance(completeSale, {
  sourceConfig: { authorisedSoldData: true },
  matchScore: 0.95,
  minimumMatchScore: 0.85,
});
assert.equal(accepted.qualified, true);
assert.equal(accepted.sourceUrl, 'https://www.ebay.co.uk/itm/123456789012');

const unauthorised = validateSoldProvenance(completeSale, {
  sourceConfig: { authorisedSoldData: false },
  matchScore: 0.95,
  minimumMatchScore: 0.85,
});
assert.equal(unauthorised.qualified, false);
assert.ok(unauthorised.reasons.includes('UNAUTHORISED_SOLD_PROVIDER'));

const incomplete = validateSoldProvenance({
  ...completeSale,
  sourceUrl: 'http://www.ebay.co.uk/itm/123456789012',
  saleStatus: 'refunded',
  rawPayload: null,
}, {
  sourceConfig: { authorisedSoldData: true },
  matchScore: 0.82,
  minimumMatchScore: 0.85,
});
assert.equal(incomplete.qualified, false);
assert.ok(incomplete.reasons.includes('MISSING_CANONICAL_HTTPS_LISTING_URL'));
assert.ok(incomplete.reasons.includes('SALE_REFUNDED'));
assert.ok(incomplete.reasons.includes('BELOW_EXACT_MATCH_THRESHOLD'));
assert.ok(incomplete.reasons.includes('MISSING_RAW_SALE_EVIDENCE'));

const impossiblePriceAndTime = validateSoldProvenance({
  ...completeSale,
  finalPrice: 0,
  soldAt: '2026-09-04T10:00:00.000Z',
  observedAt: '2026-09-03T10:00:00.000Z',
}, {
  sourceConfig: { authorisedSoldData: true },
  matchScore: 0.95,
  minimumMatchScore: 0.85,
});
assert.equal(impossiblePriceAndTime.qualified, false);
assert.ok(impossiblePriceAndTime.reasons.includes('MISSING_FINAL_SOLD_PRICE'));
assert.ok(impossiblePriceAndTime.reasons.includes('SOLD_AT_AFTER_OBSERVATION'));

assert.equal(canonicalEbayListingUrl('https://example.com/item/1'), null);
assert.equal(canonicalEbayListingUrl('https://www.ebay.co.uk.evil.example/itm/123456789012'), null);
assert.equal(canonicalEbayListingUrl('https://www.ebay.co.uk/help/home'), null);
assert.equal(hasQualifiedSoldProvenance({ sourceType: 'sold_transaction', metadata: { soldProvenance: accepted } }), true);
assert.equal(hasQualifiedSoldProvenance({ sourceType: 'sold_transaction', metadata: { soldProvenance: incomplete } }), false);

console.log('Sold provenance tests passed');
