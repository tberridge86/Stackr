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
export type GeneralPreparedCoverage = PreparedCoverage & {
  /** Exclusive quantities whose sum is pricedUnits. */
  exactPricedUnits: number;
  generalEstimateUnits: number;
};
export type PreparedGeneralValuation = GeneralPreparedCoverage & {
  valuationBasis: 'general_card_estimate';
  binders: { binderId: string; owned: GeneralPreparedCoverage; standardSet: GeneralPreparedCoverage | null; masterSet: GeneralPreparedCoverage | null }[];
};
export type PreparedValuation = PreparedCoverage & {
  trend?: { scope: string; evidence: string; eligible: boolean; points: { at: string; total: number; evidence: string }[] };
  cycle?: { id: string; dueAt: string; overdue: boolean; population: number; accounted: number } | null;
  collectionRevision: string;
  valuationRevision: string;
  calculatedAt: string;
  binders: { binderId: string; owned: PreparedCoverage; standardSet: PreparedCoverage | null; masterSet: PreparedCoverage | null }[];
  refresh: { accepted: number; alreadyPending: number; unsupported: number; unresolved: number; blocked: number; remaining?: number } | null;
  /** Optional additive valuation. Older servers continue to return only the exact summary. */
  general?: PreparedGeneralValuation | null;
};
export type PreparedValuationResponse = {
  state: 'ready' | 'pending' | 'updating';
  requestedCollectionRevision: string;
  summary: PreparedValuation | null;
  refreshRequest: { requestedAt: string; completedAt: string | null; pending: boolean } | null;
};
function hasValidCoverageCounts(summary: PreparedCoverage) {
  if (summary.currency !== 'GBP' || summary.totalUnits !== summary.pricedUnits + summary.unpricedUnits
    || summary.pricedUnits !== summary.freshUnits + summary.olderPriceUnits
    || summary.unpricedUnits !== summary.pending + summary.retrying + summary.unsupported + summary.unresolved + summary.noProviderQuote) return false;
  const counts = { totalUnits: summary.totalUnits, distinctPriceIdentities: summary.distinctPriceIdentities, pricedUnits: summary.pricedUnits,
    unpricedUnits: summary.unpricedUnits, freshUnits: summary.freshUnits, olderPriceUnits: summary.olderPriceUnits,
    pending: summary.pending, retrying: summary.retrying, unsupported: summary.unsupported, unresolved: summary.unresolved,
    noProviderQuote: summary.noProviderQuote };
  if (Object.values(counts).some((n) => !Number.isSafeInteger(n) || n < 0)) return false;
  return summary.pricedUnits === 0
    ? summary.total === null
    : summary.total != null && Number.isFinite(summary.total) && summary.total >= 0;
}
export function preparedPricingSummary(summary: PreparedCoverage): CollectionPricingSummary {
  if (!hasValidCoverageCounts(summary)) {
    throw new Error('The prepared valuation did not reconcile.');
  }
  return {total: summary.total, totalUnits: summary.totalUnits, pricedUnits: summary.pricedUnits,
    exactPricedUnits: summary.pricedUnits, generalEstimateUnits: 0,
    unpricedUnits: summary.unpricedUnits, staleUnits: summary.olderPriceUnits, latestCalculatedAt: summary.latestSourceAt,
    state: !summary.totalUnits ? 'empty' : !summary.pricedUnits ? 'unavailable' : summary.unpricedUnits ? 'partial' : summary.olderPriceUnits ? 'stale' : 'fresh'};
}

/** Invalid additive data never replaces the established exact valuation. */
export function preparedGeneralPricingSummary(summary: GeneralPreparedCoverage): CollectionPricingSummary | null {
  if (!hasValidCoverageCounts(summary)
    || summary.pricedUnits !== summary.exactPricedUnits + summary.generalEstimateUnits
    || !Number.isSafeInteger(summary.exactPricedUnits) || summary.exactPricedUnits < 0
    || !Number.isSafeInteger(summary.generalEstimateUnits) || summary.generalEstimateUnits < 0) return null;
  return { total: summary.total, totalUnits: summary.totalUnits, pricedUnits: summary.pricedUnits,
    exactPricedUnits: summary.exactPricedUnits, generalEstimateUnits: summary.generalEstimateUnits,
    unpricedUnits: summary.unpricedUnits, staleUnits: summary.olderPriceUnits, latestCalculatedAt: summary.latestSourceAt,
    state: !summary.totalUnits ? 'empty' : !summary.pricedUnits ? 'unavailable' : summary.unpricedUnits ? 'partial' : summary.olderPriceUnits ? 'stale' : 'fresh' };
}

export function isGeneralPreparedCoverage(value: PreparedCoverage | GeneralPreparedCoverage): value is GeneralPreparedCoverage {
  return 'exactPricedUnits' in value && 'generalEstimateUnits' in value
    && Number.isSafeInteger(value.exactPricedUnits) && Number.isSafeInteger(value.generalEstimateUnits);
}

export function isPreparedGeneralValuation(value: PreparedValuation | PreparedGeneralValuation): value is PreparedGeneralValuation {
  return 'valuationBasis' in value && value.valuationBasis === 'general_card_estimate' && isGeneralPreparedCoverage(value);
}

function compatibleGeneralCoverage(exact: PreparedCoverage, general: GeneralPreparedCoverage | null) {
  return general != null && preparedGeneralPricingSummary(general) != null
    && general.totalUnits === exact.totalUnits && general.pricedUnits >= exact.pricedUnits;
}

function hasCoherentGeneralBinders(exactBinders: PreparedValuation['binders'], generalBinders: PreparedGeneralValuation['binders']) {
  if (exactBinders.length !== generalBinders.length) return false;
  const byId = new Map(generalBinders.map((binder) => [binder.binderId, binder]));
  if (byId.size !== generalBinders.length || exactBinders.some((binder) => !binder.binderId || !byId.has(binder.binderId))) return false;
  for (const exact of exactBinders) {
    const general = byId.get(exact.binderId)!;
    if (!compatibleGeneralCoverage(exact.owned, general.owned)) return false;
    for (const key of ['standardSet', 'masterSet'] as const) {
      if (Boolean(exact[key]) !== Boolean(general[key])) return false;
      if (exact[key] && !compatibleGeneralCoverage(exact[key], general[key])) return false;
    }
  }
  return true;
}

/** Prefer the additive general valuation only after validating its coverage arithmetic. */
export function preferredPreparedValuation(summary: PreparedValuation): PreparedValuation | PreparedGeneralValuation {
  const general = summary.general;
  return hasValidCoverageCounts(summary) && general && isPreparedGeneralValuation(general) && preparedGeneralPricingSummary(general)
    && general.totalUnits === summary.totalUnits && general.pricedUnits >= summary.pricedUnits
    && hasCoherentGeneralBinders(summary.binders, general.binders) ? general : summary;
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
