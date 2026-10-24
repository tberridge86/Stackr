import assert from 'node:assert/strict';
import { marketValueHistory } from '../lib/valueHistoryRead';
import type { StackrDailyMarketCoverage, StackrMarketMover } from '../lib/stackrApiV1';

const now = Date.parse('2026-10-22T12:00:00Z');
const coverage: StackrDailyMarketCoverage = { scope: 'catalogue_daily', source: 'tcgcsv', state: 'ready',
  publishedVariants: 1000, supportedVariants: 800, unsupportedVariants: 200,
  quotedVariants: 700, unquotedVariants: 100, comparableVariants: 600, staleVariants: 50,
  insufficientHistoryVariants: 50, latestSourceAt: '2026-10-22T09:00:00Z', asOf: '2026-10-22T12:00:00Z' };
const row: StackrMarketMover = { variantId: '00000000-0000-4000-8000-000000000001', sealedProductVariantId: null,
  productType: 'raw_card', currency: 'GBP', currentEstimate: 10.01, previousEstimate: 10, percentageChange: 0.1,
  calculatedAt: '2026-10-22T09:00:00Z', previousCalculatedAt: '2026-10-21T10:00:00Z', comparisonDays: 1,
  priceBasis: 'catalogue_market_guide', sourceProvider: 'tcgcsv', confidence: { score: 0, label: 'low' } };
const result = marketValueHistory([row], coverage, now);
assert.equal(result.trackedCards, 600, 'the global comparable denominator cannot become the returned page length');
assert.equal(result.movers.length, 1, 'real penny movement is not silently discarded by legacy noise thresholds');
assert.equal(result.movers[0].latestPrice, 10.01);
assert.equal(result.coverage, coverage);
for (const change of [
  { previousCalculatedAt: '2026-10-22T08:00:00Z' },
  { previousCalculatedAt: '2026-10-20T08:00:00Z' },
  { previousCalculatedAt: 'invalid' },
  { calculatedAt: '2026-10-19T08:00:00Z', previousCalculatedAt: '2026-10-18T08:00:00Z' },
  { calculatedAt: '2026-10-23T08:00:00Z' },
  { priceBasis: undefined }, { sourceProvider: undefined }, { comparisonDays: 2 },
  { productType: 'graded_card' }, { currency: 'USD' }, { currentEstimate: null },
  { previousEstimate: 0 }, { percentageChange: 100 },
] as Partial<StackrMarketMover>[]) {
  assert.throws(() => marketValueHistory([{ ...row, ...change }], coverage, now), /could not be verified/,
    `invalid daily provenance must fail visibly: ${JSON.stringify(change)}`);
}
assert.throws(() => marketValueHistory([row, { ...row, currentEstimate: 10.02, percentageChange: 0.2 }], coverage, now), /identities conflict/);
assert.throws(() => marketValueHistory([row], { ...coverage, quotedVariants: 1 }, now), /coverage could not be verified/);
assert.throws(() => marketValueHistory([row], { ...coverage, asOf: 'invalid' }, now), /coverage could not be verified/);
assert.throws(() => marketValueHistory([row], { ...coverage, latestSourceAt: '2026-10-23T12:00:00Z' }, now), /coverage could not be verified/);
assert.equal(marketValueHistory([], coverage, now).trackedCards, 600, 'an unchanged catalogue remains covered without fabricated movers');
const noHistory: StackrDailyMarketCoverage = { ...coverage, state: 'insufficient_history', comparableVariants: 0, insufficientHistoryVariants: 650 };
assert.equal(marketValueHistory([], noHistory, now).movers.length, 0);
assert.throws(() => marketValueHistory([row], noHistory, now), /coverage could not be verified/);
console.log('Daily value-history transform passed: global coverage, genuine consecutive source dates, stale/future/invalid provenance, duplicate identities and unavailable history.');
