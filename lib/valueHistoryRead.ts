import type { StackrMarketMover } from './stackrApiV1';
import { getCollectionPriceCoverageLabel, type CollectionPricingSummary, type CollectionValueRead } from './collectionPricingState';
import { preparedPricingSummary, type PreparedValuationResponse } from './preparedCollectionValuation';

export const VALUE_HISTORY_READ_TIMEOUT_MS = 12_000;
export const VALUE_HISTORY_PREVIEW_TIMEOUT_MS = 4_000;
export type ValueHistoryRange = '7D' | '30D' | '6M' | '12M';
export type ValueHistoryPoint = { day: string; value: number };
export type ValueHistoryPreview = { name: string; setId: string | null; setName: string | null; imageUrl: string | null };
export type ValueHistoryMover = ValueHistoryPreview & {
  cardId: string;
  latestPrice: number;
  previousPrice: number;
  change: number;
  percentChange: number;
  quantity?: number;
  impact?: number;
  snapshotAt: string;
  previousSnapshotAt: string;
  confidence: StackrMarketMover['confidence'];
};

/** A deadline settles the lane even when the transport never settles. */
export async function withValueHistoryDeadline<T>(work: () => Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Value history read timed out.')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Keep the server's exact paired observations together, including same-day pairs. */
export function marketValueHistory(rows: StackrMarketMover[], now = Date.now()): {
  movers: ValueHistoryMover[]; trackedCards: number; calculatedAt: string | null;
} {
  const candidates = rows.filter((row) => row.productType === 'raw_card' && row.currency === 'GBP' && row.variantId
    && row.currentEstimate != null && Number.isFinite(row.currentEstimate) && row.currentEstimate >= 0
    && row.previousEstimate != null && Number.isFinite(row.previousEstimate) && row.previousEstimate > 0
    && row.calculatedAt && row.previousCalculatedAt
    && Number.isFinite(Date.parse(row.previousCalculatedAt))
    && Date.parse(row.previousCalculatedAt) < Date.parse(row.calculatedAt)
    && Date.parse(row.calculatedAt) <= now);
  // The wire format does not identify the condition behind duplicate variants.
  // Do not combine or select conflicting identity comparisons by card ID.
  const groups = new Map<string, StackrMarketMover[]>();
  for (const row of candidates) groups.set(row.variantId!, [...(groups.get(row.variantId!) ?? []), row]);
  const pairs = [...groups.values()].filter((group) => group.every((row) => JSON.stringify(row) === JSON.stringify(group[0])))
    .map((group) => group[0]);
  const movers: ValueHistoryMover[] = pairs.flatMap((row) => {
    const latestPrice = row.currentEstimate!;
    const previousPrice = row.previousEstimate!;
    const change = latestPrice - previousPrice;
    const percentChange = change / previousPrice * 100;
    if (Math.abs(change) < 0.1 && Math.abs(percentChange) < 0.5) return [];
    return [{ cardId: row.variantId!, name: row.variantId!, setId: null, setName: null, imageUrl: null,
      latestPrice, previousPrice, change, percentChange, snapshotAt: row.calculatedAt!,
      previousSnapshotAt: row.previousCalculatedAt!, confidence: row.confidence }];
  });
  return { movers, trackedCards: pairs.length,
    calculatedAt: pairs.map((row) => row.calculatedAt!).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null };
}

export function collectionValueHistory(response: PreparedValuationResponse, now = Date.now()): {
  total: number | null;
  pointsByRange: Record<ValueHistoryRange, ValueHistoryPoint[]>;
  coverage: string;
  calculatedAt: string | null;
  historyAvailable: boolean;
} {
  const pointsByRange: Record<ValueHistoryRange, ValueHistoryPoint[]> = { '7D': [], '30D': [], '6M': [], '12M': [] };
  const summary = response.summary;
  if (!summary || summary.collectionRevision !== response.requestedCollectionRevision) {
    return { total: null, pointsByRange, coverage: 'Your current collection valuation is being prepared. Retry to check its progress.',
      calculatedAt: null, historyAvailable: false };
  }
  const pricing = preparedPricingSummary(summary);
  const trend = summary.trend;
  const seen = new Set<string>();
  const points = trend?.eligible && trend.scope && trend.evidence
    && (trend.pricedUnits == null || trend.pricedUnits === summary.pricedUnits)
    && (trend.totalUnits == null || trend.totalUnits === summary.totalUnits)
    ? trend.points.filter((point) => point.evidence && Number.isFinite(point.total) && point.total >= 0
      && Number.isFinite(Date.parse(point.at)) && Date.parse(point.at) <= now)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .filter((point) => {
        // Duplicate evidence is not another market observation.
        if (seen.has(point.evidence)) return false;
        seen.add(point.evidence); return true;
      }) : [];
  // The latest evidence must still describe this exact holdings/coverage scope.
  const comparable = points.at(-1)?.total === summary.total && points.at(-1)?.evidence === trend?.evidence ? points : [];
  for (const [range, days] of [['7D', 7], ['30D', 30], ['6M', 183], ['12M', 365]] as const) {
    pointsByRange[range] = comparable.filter((point) => Date.parse(point.at) >= now - days * 86_400_000)
      .map((point) => ({ day: point.at, value: point.total }));
  }
  const coverage = [getCollectionPriceCoverageLabel(pricing),
    pricing.unpricedUnits ? `${pricing.unpricedUnits} unpriced cards excluded; they are not valued at £0` : null,
    pricing.staleUnits ? `${pricing.staleUnits} cards use older stored estimates` : null,
    summary.calculatedAt ? `Valuation calculated ${new Date(summary.calculatedAt).toLocaleString('en-GB')}` : null,
    response.state === 'updating' ? 'An updated stored valuation is being prepared' : null,
  ].filter(Boolean).join('. ');
  return { total: pricing.total, pointsByRange, coverage, calculatedAt: summary.calculatedAt,
    historyAvailable: comparable.length >= 2 };
}

/** Home v4 stores real scoped valuation reads, not reconstructed card history. */
export function savedCollectionValueHistory(snapshot: unknown, now = Date.now()): ReturnType<typeof collectionValueHistory> | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const saved = snapshot as { pricingContractVersion?: unknown; cachedAt?: number; collectionTotal?: number | null;
    collectionPricingSummary?: CollectionPricingSummary; collectionValueReads?: CollectionValueRead[] };
  const summary = saved.collectionPricingSummary;
  if (saved.pricingContractVersion !== 4 || !Number.isFinite(saved.cachedAt) || saved.cachedAt! <= 0 || saved.cachedAt! > now + 300_000
    || !summary || summary.total !== saved.collectionTotal || summary.total == null || !Number.isFinite(summary.total) || summary.total < 0
    || [summary.totalUnits, summary.pricedUnits, summary.unpricedUnits, summary.staleUnits, summary.exactPricedUnits, summary.generalEstimateUnits]
      .some((count) => !Number.isSafeInteger(count) || count < 0)
    || summary.totalUnits !== summary.pricedUnits + summary.unpricedUnits || summary.pricedUnits === 0
    || summary.pricedUnits !== summary.exactPricedUnits + summary.generalEstimateUnits || summary.staleUnits > summary.pricedUnits) return null;
  const reads = (Array.isArray(saved.collectionValueReads) ? saved.collectionValueReads.slice(-4_000) : [])
    .filter((read) => read && typeof read.identitySignature === 'string' && read.identitySignature.trim()
      && Number.isFinite(read.total) && read.total >= 0 && Number.isFinite(Date.parse(read.capturedAt))
      && Date.parse(read.capturedAt) <= now && Date.parse(read.capturedAt) <= saved.cachedAt! + 300_000
      && read.totalUnits === summary.totalUnits && Number.isSafeInteger(read.pricedUnits) && read.pricedUnits > 0
      && read.pricedUnits <= summary.pricedUnits)
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const anchor = reads.at(-1);
  const comparable = anchor ? reads.filter((read) => read.identitySignature === anchor.identitySignature
    && read.totalUnits === anchor.totalUnits && read.pricedUnits === anchor.pricedUnits) : [];
  const seen = new Set<string>();
  const points = comparable.filter((read) => {
    if (seen.has(read.capturedAt)) return false;
    seen.add(read.capturedAt); return true;
  });
  const pointsByRange: Record<ValueHistoryRange, ValueHistoryPoint[]> = { '7D': [], '30D': [], '6M': [], '12M': [] };
  for (const [range, days] of [['7D', 7], ['30D', 30], ['6M', 183], ['12M', 365]] as const) {
    pointsByRange[range] = points.filter((point) => Date.parse(point.capturedAt) >= now - days * 86_400_000)
      .map((point) => ({ day: point.capturedAt, value: point.total }));
  }
  // Prefer the exact saved series subtotal when Home's general headline covers
  // extra cards. Never attach that broader amount to the exact trend.
  const pricedUnits = anchor?.pricedUnits ?? summary.pricedUnits;
  const total = anchor?.total ?? summary.total;
  const basis = anchor || summary.generalEstimateUnits === 0 ? 'exact stored estimate subtotal'
    : `estimate subtotal including ${summary.generalEstimateUnits} labelled general estimates`;
  return { total, pointsByRange, calculatedAt: null, historyAvailable: points.length >= 2,
    coverage: `Last saved ${new Date(saved.cachedAt!).toLocaleString('en-GB')}: ${basis}, prices for ${pricedUnits} of ${summary.totalUnits} cards. Saved history; current holdings and price freshness have not been rechecked.` };
}
