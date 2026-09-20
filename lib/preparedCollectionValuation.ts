import type { CollectionPricingSummary } from './collectionPricingState';

export type PreparedCoverage = {
  total: number | null;
  currency: 'GBP';
  totalUnits: number;
  distinctPriceIdentities: number;
  pricedUnits: number;
  freshUnits: number;
  olderPriceUnits: number;
  unpricedUnits: number;
  pending: number;
  retrying: number;
  unsupported: number;
  unresolved: number;
  noProviderQuote: number;
  oldestSourceAt: string | null;
  latestSourceAt: string | null;
};
export type PreparedValuation = PreparedCoverage & {
  trend?: { scope: string; evidence: string; eligible: boolean; points: { at: string; total: number; evidence: string }[] };
  cycle?: { id: string; dueAt: string; overdue: boolean; population: number; accounted: number } | null;
  collectionRevision: string;
  valuationRevision: string;
  calculatedAt: string;
  binders: { binderId: string; owned: PreparedCoverage; standardSet: PreparedCoverage | null; masterSet: PreparedCoverage | null }[];
  refresh: { accepted: number; alreadyPending: number; unsupported: number; unresolved: number; blocked: number; remaining?: number } | null;
};
export type PreparedValuationResponse = {
  state: 'ready' | 'pending' | 'updating';
  requestedCollectionRevision: string;
  summary: PreparedValuation | null;
  refreshRequest: { requestedAt: string; completedAt: string | null; pending: boolean } | null;
};
export function preparedPricingSummary(summary: PreparedCoverage): CollectionPricingSummary {
  if (summary.currency !== 'GBP' || summary.totalUnits !== summary.pricedUnits + summary.unpricedUnits
    || summary.pricedUnits !== summary.freshUnits + summary.olderPriceUnits
    || summary.unpricedUnits !== summary.pending + summary.retrying + summary.unsupported + summary.unresolved + summary.noProviderQuote
    || Object.values({ totalUnits: summary.totalUnits, pricedUnits: summary.pricedUnits, unpricedUnits: summary.unpricedUnits,
      freshUnits: summary.freshUnits, olderPriceUnits: summary.olderPriceUnits }).some((n) => !Number.isSafeInteger(n) || n < 0)
    || (summary.pricedUnits > 0 && (summary.total == null || !Number.isFinite(summary.total) || summary.total < 0))) {
    throw new Error('The prepared valuation did not reconcile.');
  }
  return {total: summary.total, totalUnits: summary.totalUnits, pricedUnits: summary.pricedUnits,
    unpricedUnits: summary.unpricedUnits, staleUnits: summary.olderPriceUnits, latestCalculatedAt: summary.latestSourceAt,
    state: !summary.totalUnits ? 'empty' : !summary.pricedUnits ? 'unavailable' : summary.unpricedUnits ? 'partial' : summary.olderPriceUnits ? 'stale' : 'fresh'};
}

/**
 * A partial prepared run is not allowed to make already stored, exact prices
 * disappear from Home. The caller first maps stored evidence to the current
 * owned identities, so collection edits cannot retain removed-card evidence.
 */
export function hasLowerPreparedPriceCoverage(
  prepared: Pick<PreparedCoverage, 'totalUnits' | 'pricedUnits' | 'unpricedUnits'>,
  stored: Pick<CollectionPricingSummary, 'total' | 'pricedUnits'>,
) {
  return prepared.unpricedUnits > 0
    && stored.total != null
    && stored.pricedUnits > prepared.pricedUnits;
}

export function preparedValuationTrend(summary: PreparedValuation, days: 7 | 30, now = Date.now()) {
  const points = (summary.trend?.points ?? []).filter((p) => Number.isFinite(p.total) && p.total >= 0
    && Date.parse(p.at) >= now - days * 86400000 && Date.parse(p.at) <= now).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (points.length < 2 || summary.unpricedUnits || points.at(-1)?.total !== summary.total) return { values: [], change: 0, percent: 0 };
  const values = points.map((p) => p.total);
  const change = values[values.length - 1] - values[0];
  return { values, change, percent: values[0] > 0 ? change / values[0] * 100 : 0 };
}
