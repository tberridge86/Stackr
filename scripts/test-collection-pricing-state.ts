import assert from 'node:assert/strict';
import {
  getComparableCollectionValueReads,
  getCollectionPriceCoverageLabel,
  getCollectionPriceHistoryState,
  summariseCollectionPricing,
} from '../lib/collectionPricingState';

const now = Date.parse('2026-09-05T12:00:00.000Z');

const zeroPrice = summariseCollectionPricing([
  { quantity: 1, centralValue: 0, evidenceStatus: 'recent_sold_value', freshness: 'fresh' },
], { now });
assert.equal(zeroPrice.total, 0, 'A genuine £0 estimate must remain a known price.');
assert.equal(zeroPrice.pricedUnits, 1);
assert.equal(zeroPrice.state, 'fresh');

const zeroQuantity = summariseCollectionPricing([
  { quantity: 0, centralValue: 10, evidenceStatus: 'recent_sold_value', freshness: 'fresh' },
], { now });
assert.equal(zeroQuantity.total, null, 'A zero quantity must remain zero rather than become one unit.');
assert.equal(zeroQuantity.totalUnits, 0);
assert.equal(zeroQuantity.pricedUnits, 0);
assert.equal(zeroQuantity.state, 'empty');

const missingPrice = summariseCollectionPricing([
  { quantity: 1, centralValue: null, evidenceStatus: 'market_estimate', freshness: 'unknown' },
], { now });
assert.equal(missingPrice.total, null, 'Unavailable estimates must not become £0.');
assert.equal(missingPrice.unpricedUnits, 1);
assert.equal(missingPrice.state, 'unavailable');
assert.equal(getCollectionPriceCoverageLabel(missingPrice), 'No stored market estimates yet');

const partial = summariseCollectionPricing([
  { quantity: 2, centralValue: 4.5, evidenceStatus: 'recent_sold_value', freshness: 'fresh' },
  { quantity: 3, centralValue: null, evidenceStatus: 'unavailable' },
], { now });
assert.equal(partial.total, 9);
assert.equal(partial.totalUnits, 5);
assert.equal(partial.pricedUnits, 2);
assert.equal(partial.unpricedUnits, 3);
assert.equal(partial.state, 'partial');
assert.equal(getCollectionPriceCoverageLabel(partial), 'Prices for 2 of 5 cards');

const stale = summariseCollectionPricing([
  {
    quantity: 2,
    centralValue: 6,
    evidenceStatus: 'thin_sold_value',
    freshness: 'fresh',
    calculatedAt: '2026-09-04T12:00:00.000Z',
    staleAfter: '2026-09-05T11:59:59.000Z',
  },
], { now });
assert.equal(stale.total, 12);
assert.equal(stale.staleUnits, 2);
assert.equal(stale.latestCalculatedAt, '2026-09-04T12:00:00.000Z');
assert.equal(stale.state, 'stale');

const unknownFreshness = summariseCollectionPricing([
  { quantity: 1, centralValue: 3, evidenceStatus: 'market_estimate', freshness: 'unknown' },
], { now });
assert.equal(unknownFreshness.state, 'stale', 'Unknown freshness must not be presented as fresh.');

assert.equal(getCollectionPriceHistoryState([]), 'building');
assert.equal(getCollectionPriceHistoryState([Number.NaN, 4]), 'building');
assert.equal(getCollectionPriceHistoryState([0, 4]), 'ready');

const comparableReads = getComparableCollectionValueReads([
  { capturedAt: '2026-09-05T10:00:00.000Z', total: 13, totalUnits: 3, pricedUnits: 3, identitySignature: 'owned-a' },
  { capturedAt: '2026-09-05T10:03:00.000Z', total: 16, totalUnits: 3, pricedUnits: 3, identitySignature: 'owned-a' },
  { capturedAt: '2026-09-05T10:06:00.000Z', total: 19, totalUnits: 4, pricedUnits: 4, identitySignature: 'owned-b' },
  { capturedAt: '2026-09-05T12:03:00.000Z', total: 99, totalUnits: 3, pricedUnits: 3, identitySignature: 'owned-a' },
], { totalUnits: 3, pricedUnits: 3, identitySignature: 'owned-a' }, 7, now);
assert.deepEqual(comparableReads, [13, 16], 'Only in-range reads with identical owned-unit signatures and complete coverage may form the chart.');

const sparseReads = getComparableCollectionValueReads([
  { capturedAt: '2026-09-05T10:00:00.000Z', total: 13, totalUnits: 3, pricedUnits: 3, identitySignature: 'owned-a' },
], { totalUnits: 3, pricedUnits: 3, identitySignature: 'owned-a' }, 7, now);
assert.deepEqual(sparseReads, [], 'One real read must remain History building.');

console.log('Collection pricing state tests passed');
