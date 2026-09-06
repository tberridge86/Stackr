import assert from 'node:assert/strict';
import {
  buildVerifiedHomeSnapshotTrend,
  supportsHomeSnapshotScope,
  takeRotatingStringBatch,
} from '../lib/homePriceRefreshCore.ts';

const firstBatch = takeRotatingStringBatch(['variant-b', 'variant-a', 'variant-b', 'variant-c'], 0, 2);
assert.equal(supportsHomeSnapshotScope('raw_card', 'Near Mint'), true);
assert.equal(supportsHomeSnapshotScope('raw_card', 'raw_near_mint'), true);
assert.equal(supportsHomeSnapshotScope('raw_card', 'Lightly Played'), false);
assert.equal(supportsHomeSnapshotScope('graded_card', 'Near Mint'), false);
assert.equal(supportsHomeSnapshotScope('raw_card', null), false);
assert.deepEqual(firstBatch.items, ['variant-a', 'variant-b']);
assert.equal(firstBatch.nextCursor, 2);
const secondBatch = takeRotatingStringBatch(['variant-b', 'variant-a', 'variant-c'], firstBatch.nextCursor, 2);
assert.deepEqual(secondBatch.items, ['variant-c']);
assert.equal(secondBatch.nextCursor, 0);

const trend = buildVerifiedHomeSnapshotTrend(
  [
    { variantId: 'variant-a', quantity: 1 },
    { variantId: 'variant-b', quantity: 1 },
  ],
  [
    { variantId: 'variant-a', snapshotAt: '1970-01-01T00:00:01.200Z', marketCentral: 10, freshness: 'fresh', priceType: 'estimate' },
    { variantId: 'variant-b', snapshotAt: '1970-01-01T00:00:01.300Z', marketCentral: 20, freshness: 'fresh', priceType: 'estimate' },
    { variantId: 'variant-a', snapshotAt: '1970-01-01T00:00:02.100Z', marketCentral: 15, freshness: 'fresh', priceType: 'estimate' },
    { variantId: 'variant-b', snapshotAt: '1970-01-01T00:00:03.100Z', marketCentral: 999, freshness: 'stale', priceType: 'estimate' },
  ],
  { rangeStartMs: 1_000, nowMs: 4_000, bucketMs: 1_000 },
);
assert.deepEqual(trend, [30, 35], 'only actual, fresh provider snapshots can create chart points');

assert.deepEqual(
  buildVerifiedHomeSnapshotTrend(
    [{ variantId: 'variant-a', quantity: 1 }, { variantId: 'variant-b', quantity: 1 }],
    [{ variantId: 'variant-a', snapshotAt: '1970-01-01T00:00:01.000Z', marketCentral: 10, freshness: 'fresh', priceType: 'estimate' }],
    { rangeStartMs: 0, nowMs: 2_000, bucketMs: 1_000 },
  ),
  [],
  'partial card coverage must not be displayed as portfolio movement',
);

const historical = [
  { variantId: 'a', snapshotAt: '2026-08-01T00:00:00Z', staleAfter: '2026-08-02T00:00:00Z', marketCentral: 10, freshness: 'stale', priceType: 'legacy_cached_market_estimate' },
  { variantId: 'a', snapshotAt: '2026-08-01T12:00:00Z', staleAfter: '2026-08-02T12:00:00Z', marketCentral: 12, freshness: 'source_timestamped', priceType: 'legacy_cached_market_estimate' },
];
const options = { rangeStartMs: Date.parse('2026-08-01T00:00:00Z'), nowMs: Date.parse('2026-08-04T00:00:00Z'), bucketMs: 1_800_000 };
assert.deepEqual(buildVerifiedHomeSnapshotTrend([{ variantId: 'a', quantity: 2 }], historical, options), [20, 24], 'Historical estimates remain valid at their original observation time');
assert.deepEqual(buildVerifiedHomeSnapshotTrend([{ variantId: 'a', quantity: 1 }], historical.map((row) => ({ ...row, staleAfter: row.snapshotAt })), options), [], 'Re-fetching an expired quote cannot create fresh history');
assert.deepEqual(buildVerifiedHomeSnapshotTrend([{ variantId: 'a', quantity: 1 }], historical.map((row) => ({ ...row, marketCentral: 0 })), options), [], 'Missing prices cannot become zero-value movement');

const regime = (primarySource, priceBasis, methodologyVersion = 'pricing-v2.0.0') => ({
  primarySource,
  priceBasis,
  methodologyVersion,
  priceType: 'market_estimate',
});
assert.deepEqual(
  buildVerifiedHomeSnapshotTrend(
    [{ variantId: 'a', quantity: 1 }],
    [
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:01.000Z', marketCentral: 10, freshness: 'fresh', ...regime('existing_stackr_source', 'unknown_or_mixed_normalisation') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:02.000Z', marketCentral: 12, freshness: 'fresh', ...regime('existing_stackr_source', 'unknown_or_mixed_normalisation') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:03.000Z', marketCentral: 20, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:04.000Z', marketCentral: 22, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
    ],
    { rangeStartMs: 0, nowMs: 5_000, bucketMs: 1_000 },
  ),
  [20, 22],
  'a source/basis transition resets the series instead of looking like a price jump',
);

assert.deepEqual(
  buildVerifiedHomeSnapshotTrend(
    [{ variantId: 'a', quantity: 1 }],
    [
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:01.000Z', marketCentral: 10, freshness: 'fresh', ...regime('source-a', 'item_price_excludes_shipping') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:02.000Z', marketCentral: 30, freshness: 'fresh', ...regime('source-b', 'normalised_delivered_price_gbp') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:03.000Z', marketCentral: 20, freshness: 'fresh', ...regime('source-a', 'item_price_excludes_shipping') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:04.000Z', marketCentral: 21, freshness: 'fresh', ...regime('source-a', 'item_price_excludes_shipping') },
    ],
    { rangeStartMs: 0, nowMs: 5_000, bucketMs: 1_000 },
  ),
  [20, 21],
  'A-B-A history keeps only the latest contiguous A regime',
);

assert.deepEqual(
  buildVerifiedHomeSnapshotTrend(
    [{ variantId: 'a', quantity: 1 }, { variantId: 'b', quantity: 1 }],
    [
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:01.000Z', marketCentral: 10, freshness: 'fresh', ...regime('legacy', 'unknown_or_mixed_normalisation') },
      { variantId: 'b', snapshotAt: '1970-01-01T00:00:01.000Z', marketCentral: 5, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:02.000Z', marketCentral: 20, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
      { variantId: 'b', snapshotAt: '1970-01-01T00:00:02.000Z', marketCentral: 5, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:03.000Z', marketCentral: 25, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
      { variantId: 'b', snapshotAt: '1970-01-01T00:00:03.000Z', marketCentral: 5, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
    ],
    { rangeStartMs: 0, nowMs: 4_000, bucketMs: 1_000 },
  ),
  [25, 30],
  'a portfolio only resumes once every tracked variant has valid current-regime coverage',
);

console.log('home live price refresh tests passed');
