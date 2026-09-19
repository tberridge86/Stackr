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
