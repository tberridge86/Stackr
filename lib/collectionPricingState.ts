export type CollectionPriceEvidenceStatus = string | null | undefined;
export type CollectionPriceFreshness = 'fresh' | 'stale' | 'expired' | 'unknown' | string | null | undefined;

export type CollectionPricingInput = {
  quantity?: number | null;
  centralValue: number | null | undefined;
  evidenceStatus?: CollectionPriceEvidenceStatus;
  freshness?: CollectionPriceFreshness;
  calculatedAt?: string | null;
  staleAfter?: string | null;
};

export type CollectionPricingState = 'empty' | 'unavailable' | 'partial' | 'fresh' | 'stale';

export type CollectionPricingSummary = {
  total: number | null;
  totalUnits: number;
  pricedUnits: number;
  unpricedUnits: number;
  staleUnits: number;
  latestCalculatedAt: string | null;
  state: CollectionPricingState;
};

function normaliseQuantity(value: number | null | undefined) {
  if (value == null) return 1;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 1;
}

function isUnavailable(status: CollectionPriceEvidenceStatus) {
  return String(status ?? '').trim().toLowerCase() === 'unavailable';
}

function parsedTime(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isStale(input: CollectionPricingInput, now: number) {
  const freshness = String(input.freshness ?? '').trim().toLowerCase();
  if (freshness === 'stale' || freshness === 'expired' || freshness === 'unknown') return true;
  const staleAfter = parsedTime(input.staleAfter);
  return staleAfter != null && staleAfter <= now;
}

/**
 * Aggregates only known stored estimates. A numeric zero is a valid known price
 * unless the API explicitly marks the estimate unavailable.
 */
export function summariseCollectionPricing(
  inputs: readonly CollectionPricingInput[],
  options: { now?: number | Date } = {},
): CollectionPricingSummary {
  const configuredNow = options.now instanceof Date ? options.now.getTime() : options.now;
  const now = Number.isFinite(configuredNow) ? Number(configuredNow) : Date.now();
  let totalUnits = 0;
  let pricedUnits = 0;
  let staleUnits = 0;
  let total = 0;
  let latestCalculatedAt: string | null = null;
  let latestCalculatedAtMs: number | null = null;

  for (const input of inputs) {
    const quantity = normaliseQuantity(input.quantity);
    totalUnits += quantity;
    const centralValue = Number(input.centralValue);
    const priced = input.centralValue != null
      && !isUnavailable(input.evidenceStatus)
      && Number.isFinite(centralValue);
    if (!priced) continue;

    pricedUnits += quantity;
    total += centralValue * quantity;
    if (isStale(input, now)) staleUnits += quantity;

    const calculatedAtMs = parsedTime(input.calculatedAt);
    if (calculatedAtMs != null && (latestCalculatedAtMs == null || calculatedAtMs > latestCalculatedAtMs)) {
      latestCalculatedAtMs = calculatedAtMs;
      latestCalculatedAt = input.calculatedAt ?? null;
    }
  }

  const unpricedUnits = totalUnits - pricedUnits;
  const state: CollectionPricingState = totalUnits === 0
    ? 'empty'
    : pricedUnits === 0
      ? 'unavailable'
      : unpricedUnits > 0
        ? 'partial'
        : staleUnits > 0
          ? 'stale'
          : 'fresh';

  return {
    total: pricedUnits > 0 ? total : null,
    totalUnits,
    pricedUnits,
    unpricedUnits,
    staleUnits,
    latestCalculatedAt,
    state,
  };
}

export type CollectionPriceHistoryState = 'building' | 'ready';

/** A chart is only ready with two or more real finite points; no points are invented. */
export function getCollectionPriceHistoryState(points: readonly number[] | null | undefined): CollectionPriceHistoryState {
  const finitePointCount = (points ?? []).filter((point) => Number.isFinite(point)).length;
  return finitePointCount >= 2 ? 'ready' : 'building';
}

export function getCollectionPriceCoverageLabel(summary: Pick<CollectionPricingSummary, 'state' | 'pricedUnits' | 'totalUnits' | 'staleUnits'>) {
  if (summary.state === 'empty') return 'No cards tracked';
  if (summary.state === 'unavailable') return 'No stored market estimates yet';
  if (summary.state === 'partial') return `Prices for ${summary.pricedUnits} of ${summary.totalUnits} cards`;
  if (summary.state === 'stale') return `Prices for ${summary.pricedUnits} cards need updating`;
  return `Prices for all ${summary.totalUnits} cards`;
}
