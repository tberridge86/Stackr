import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getComparableCollectionValueReads } from '../lib/collectionPricingState';
import { preparedValuationTrend } from '../lib/preparedCollectionValuation';
import { catalogueRefreshPlan, refreshOutcome } from './refresh-catalogue-prices.mjs';
import { mergeValuationTrend, summarisePreparedUnits, valuationTrendEvidence } from './lib/prepared-collection-valuation.mjs';

const now = Date.parse('2026-10-03T09:15:00Z');
const unit = (variantId: string, quantity = 1) => ({ variantId, quantity, binderIds: [], reason: null });
const price = (variantId: string, central: number, calculatedAt: string, staleAfter: string) => ({
  variantId, status: 'market_estimate', currency: 'GBP', estimates: { central },
  primarySource: 'tcgdex', priceBasis: 'provider_market', estimateVersion: 'pricing-v2.test',
  calculatedAt, providerUpdatedAt: calculatedAt, staleAfter, freshness: Date.parse(staleAfter) > now ? 'fresh' : 'stale',
});

const units = [unit('a'), unit('b')];
const prices = new Map([['a', price('a', 10, '2026-10-02T09:00:00Z', '2026-10-02T21:00:00Z')]]);
const summary = summarisePreparedUnits(units, new Map(), prices, now);
assert.equal(summary.total, 10);
assert.equal(summary.pricedUnits, 1);
assert.equal(summary.unpricedUnits, 1);
assert.equal(summary.olderPriceUnits, 1, 'stale evidence stays priced but is explicitly stale');

const evidence = valuationTrendEvidence(units, prices, summary);
assert.equal(evidence.eligible, true, 'a genuine partial subtotal may build its own comparable history');
assert.equal(evidence.coverage, 'partial');
assert.equal(evidence.pricedUnits, 1);
assert.equal(evidence.totalUnits, 2);
assert.equal(evidence.staleUnits, 1);

const first = { at: '2026-10-02T09:00:00Z', total: 10, evidence: 'e1' };
const second = { at: '2026-10-03T09:00:00Z', total: 12, evidence: 'e2' };
assert.deepEqual(mergeValuationTrend([], first, true), [first], 'zero history keeps one genuine point without inventing a line');
assert.equal(mergeValuationTrend([first], { ...second, evidence: 'e1' }, true).length, 1, 'unchanged evidence does not manufacture duplicate movement');
assert.deepEqual(mergeValuationTrend([first], second, true), [first, second], 'two genuine observations produce history');

const prepared: any = {
  total: 12, totalUnits: 2, pricedUnits: 1, unpricedUnits: 1, freshUnits: 0, olderPriceUnits: 1,
  trend: { scope: evidence.scope, evidence: 'e2', eligible: true, pricedUnits: 1, totalUnits: 2, staleUnits: 1, coverage: 'partial', points: [first, second] },
};
assert.deepEqual(preparedValuationTrend(prepared, 30).values, [10, 12], 'partial scoped history remains visible');

const reads = [
  { capturedAt: '2026-10-02T09:00:00Z', total: 10, totalUnits: 2, pricedUnits: 1, identitySignature: 'same' },
  { capturedAt: '2026-10-03T09:00:00Z', total: 12, totalUnits: 2, pricedUnits: 1, identitySignature: 'same' },
];
assert.deepEqual(getComparableCollectionValueReads(reads, reads[1], 7, now), [10, 12]);
assert.deepEqual(getComparableCollectionValueReads(reads, { ...reads[1], totalUnits: 3 }, 7, now), [], 'card additions/removals cannot be projected backwards');
assert.deepEqual(getComparableCollectionValueReads(reads, { ...reads[1], pricedUnits: 2 }, 7, now), [], 'pricing coverage changes start a new comparable series');
assert.deepEqual(getComparableCollectionValueReads(reads, { ...reads[1], identitySignature: 'other' }, 7, now), [], 'identity changes start a new comparable series');

const catalogueRows = Array.from({ length: 53125 }, (_, index) => ({
  variant_id: String(index), language_code: index < 32301 ? 'en' : index < 41028 ? 'ja' : 'zh-cn',
  variant_code: 'normal', finish_code: 'normal',
}));
const plan = catalogueRefreshPlan(catalogueRows, { hours: 12, requestBudget: 200000, spacingMs: 1000 });
assert.equal(plan.eligibleUpperBound, 53125);
assert.equal(plan.spacingCapacity, 43200);
assert.equal(plan.spacingShortfall, 9925);
assert.equal(plan.fits, false, 'a 12-hour full pass must fail closed when spacing alone cannot fit it');
assert.ok(plan.minimumRuntimeHours > 14.7 && plan.minimumRuntimeHours < 14.8);
assert.equal(refreshOutcome(Object.assign(new Error('denied'), { status: 401 })).code, 'provider_unauthorized');
assert.equal(refreshOutcome(Object.assign(new Error('denied'), { status: 403 })).code, 'provider_forbidden');

const hub = fs.readFileSync('features/home/HubScreen.tsx', 'utf8');
assert.doesNotMatch(hub, /buildVerifiedHomeSnapshotTrend/, 'Home must not apply current holdings to historical per-card snapshots');
assert.doesNotMatch(hub, /selectComparableHomeSnapshotEntries/, 'legacy reconstructed snapshot scope is removed');
assert.match(hub, /pricingContractVersion: 4/);
assert.match(hub, /setChartData\(cachedChartData\)/, 'restored sessions retain persisted genuine history');
assert.match(hub, /unpriced cards are excluded, not £0/);

const card = fs.readFileSync('components/ValueTrackerCard.tsx', 'utf8');
assert.match(card, /No comparable collection history recorded yet/, 'history section stays visible without enough points');

const migration = fs.readFileSync('supabase/migrations/20261003091500_issue304_pricing_coverage_history.sql', 'utf8');
assert.match(migration, /catalogue_price_coverage_status/);
assert.match(migration, /create or replace function api\.claim_catalogue_prices[\\s\\S]*as \\$\\$[\\s\\S]*returning i\.\*;\\n\\$\\$;/,
  'catalogue claim function must use a valid dollar-quoted SQL body');
assert.match(migration, /accessDenied/);
assert.match(migration, /order by price_priority,i\.attempts,i\.ordinal/);
assert.match(migration, /\(p_summary->>'pricedUnits'\)::integer>0/);
assert.doesNotMatch(migration, /freshUnits.*totalUnits/, 'history persistence must not require impossible all-fresh coverage');

console.log('Issue #304 pricing/history regressions passed: fair capacity math, denial classification, partial/stale history, holdings isolation and restored-session history.');
