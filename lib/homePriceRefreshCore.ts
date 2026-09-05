export type RotatingStringBatch = {
  items: string[];
  total: number;
  nextCursor: number;
  remainingInCycle: number;
};

/** The current snapshot and refresh endpoints are raw near-mint GBP only. */
export function supportsHomeSnapshotScope(productType: string, condition: string | null | undefined): boolean {
  const token = String(condition ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return productType === 'raw_card' && ['near_mint', 'raw_near_mint', 'nm'].includes(token);
}

export type HomeSnapshotTrendEntry = {
  variantId: string;
  quantity: number;
};

export type HomeSnapshotTrendObservation = {
  variantId: string;
  snapshotAt: string | null;
  marketCentral: number | null;
  freshness: string | null;
  priceType: string | null;
  priceBasis?: string | null;
  primarySource?: string | null;
  methodologyVersion?: string | null;
  staleAfter?: string | null;
};

function snapshotRegimeKey(observation: HomeSnapshotTrendObservation): string {
  // This is an internal comparison key only. Missing historical metadata uses
  // one stable opaque value; it is never returned to, or labelled for, users.
  const token = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase() || '__unspecified__';
  return [
    token(observation.priceType),
    token(observation.priceBasis),
    token(observation.primarySource),
    token(observation.methodologyVersion),
  ].join('|');
}

/** Selects one bounded, non-wrapping batch so automatic refreshes rotate fairly. */
export function takeRotatingStringBatch(values: readonly string[], cursor: number, limit: number): RotatingStringBatch {
  const unique = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort();
  const safeLimit = Math.max(0, Math.floor(limit));
  if (!unique.length || safeLimit === 0) return { items: [], total: unique.length, nextCursor: 0, remainingInCycle: unique.length };
  const start = Number.isFinite(cursor) && cursor >= 0 && cursor < unique.length ? Math.floor(cursor) : 0;
  const end = Math.min(unique.length, start + safeLimit);
  return {
    items: unique.slice(start, end),
    total: unique.length,
    nextCursor: end >= unique.length ? 0 : end,
    remainingInCycle: Math.max(0, unique.length - end),
  };
}

/**
 * Builds a collection series from persisted snapshots only. Every point uses the
 * same current variant set and is emitted only when a stored observation exists
 * in that bucket; it never fills a time grid or turns an app read into a point.
 */
export function buildVerifiedHomeSnapshotTrend(
  entries: readonly HomeSnapshotTrendEntry[],
  observations: readonly HomeSnapshotTrendObservation[],
  options: { rangeStartMs: number; nowMs: number; bucketMs: number },
): number[] {
  const quantities = new Map<string, number>();
  for (const entry of entries) {
    const variantId = String(entry.variantId ?? '').trim();
    const quantity = Number(entry.quantity);
    if (!variantId || !Number.isFinite(quantity) || quantity <= 0) return [];
    quantities.set(variantId, (quantities.get(variantId) ?? 0) + quantity);
  }
  if (!quantities.size || !Number.isFinite(options.bucketMs) || options.bucketMs <= 0) return [];

  const rows = observations
    .map((observation, index) => {
      const timestamp = Date.parse(String(observation.snapshotAt ?? ''));
      const expiry = Date.parse(String(observation.staleAfter ?? ''));
      return {
        ...observation,
        index,
        timestamp,
        expiry: Number.isFinite(expiry) ? expiry : timestamp + 72 * 60 * 60_000,
        regime: snapshotRegimeKey(observation),
      };
    })
    .filter((observation) => (
      quantities.has(observation.variantId)
      && Number.isFinite(observation.timestamp)
      && observation.timestamp <= options.nowMs
      && typeof observation.marketCentral === 'number'
      && Number.isFinite(observation.marketCentral)
      && observation.marketCentral > 0
      && (['fresh', 'source_timestamped'].includes(observation.freshness ?? '')
        // An old quote may still be valid historical evidence, provided it
        // had not already expired when that snapshot was taken.
        || (observation.freshness === 'stale' && Boolean(observation.staleAfter)))
      && observation.expiry > observation.timestamp
      && observation.priceType !== 'unavailable'
    ))
    .sort((left, right) => left.timestamp - right.timestamp || left.index - right.index);

  // Never bridge a price-basis, source, methodology, or price-type transition.
  // Scan backwards so A-B-A keeps only the latest A suffix rather than joining
  // it to the earlier, non-comparable A observations.
  const latestRegime = new Map<string, string>();
  const passedBoundary = new Set<string>();
  const latestComparableRows = new Set<number>();
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const expected = latestRegime.get(row.variantId);
    if (expected === undefined) {
      latestRegime.set(row.variantId, row.regime);
      latestComparableRows.add(row.index);
    } else if (!passedBoundary.has(row.variantId) && row.regime === expected) {
      latestComparableRows.add(row.index);
    } else if (row.regime !== expected) {
      passedBoundary.add(row.variantId);
    }
  }
  const comparableRows = rows.filter((row) => latestComparableRows.has(row.index));

  const latestByVariant = new Map<string, { value: number; expiry: number }>();
  const values: number[] = [];
  for (let index = 0; index < comparableRows.length;) {
    const bucket = Math.floor(comparableRows[index].timestamp / options.bucketMs) * options.bucketMs;
    let hasStoredObservation = false;
    let bucketObservedAt = comparableRows[index].timestamp;
    while (index < comparableRows.length && Math.floor(comparableRows[index].timestamp / options.bucketMs) * options.bucketMs === bucket) {
      latestByVariant.set(comparableRows[index].variantId, { value: comparableRows[index].marketCentral!, expiry: comparableRows[index].expiry });
      bucketObservedAt = comparableRows[index].timestamp;
      hasStoredObservation = true;
      index += 1;
    }
    if (!hasStoredObservation || bucket < options.rangeStartMs || latestByVariant.size !== quantities.size) continue;
    if ([...latestByVariant.values()].some((quote) => quote.expiry <= bucketObservedAt)) continue;
    let total = 0;
    for (const [variantId, quantity] of quantities) total += latestByVariant.get(variantId)!.value * quantity;
    values.push(total);
  }
  return values.length >= 2 ? values : [];
}
