import { pricingV2Config } from './config.js';

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] == null ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

export function dedupeObservations(observations) {
  const byKey = new Map();
  for (const observation of observations) {
    const key = observation.externalReference
      ? `${observation.sourceId}:${observation.externalReference}`
      : observation.observationHash;
    const existing = byKey.get(key);
    if (!existing || observation.matchScore > existing.matchScore) {
      byKey.set(key, observation);
    }
  }
  return [...byKey.values()];
}

export function removeOutliers(observations) {
  const priced = observations.filter((row) => typeof row.normalisedDeliveredPriceGbp === 'number');
  if (priced.length < 5) return priced.map((row) => ({ ...row, outlier: false }));

  const prices = priced.map((row) => row.normalisedDeliveredPriceGbp);
  const med = median(prices);
  const deviations = prices.map((price) => Math.abs(price - med));
  const mad = median(deviations);

  if (mad && mad > 0) {
    return priced.map((row) => {
      const modifiedZ = 0.6745 * (row.normalisedDeliveredPriceGbp - med) / mad;
      return { ...row, outlier: Math.abs(modifiedZ) > 3.5 };
    });
  }

  const q1 = quantile(prices, 0.25);
  const q3 = quantile(prices, 0.75);
  const iqr = q3 - q1;
  if (!iqr || iqr <= 0) return priced.map((row) => ({ ...row, outlier: false }));
  const lower = q1 - iqr * 1.5;
  const upper = q3 + iqr * 1.5;
  return priced.map((row) => ({
    ...row,
    outlier: row.normalisedDeliveredPriceGbp < lower || row.normalisedDeliveredPriceGbp > upper,
  }));
}

export function getRecencyWeight(dateValue, halfLifeDays = 45) {
  if (!dateValue) return 0.55;
  const ageDays = Math.max(0, (Date.now() - new Date(dateValue).getTime()) / 86_400_000);
  return Math.max(0.1, Math.pow(0.5, ageDays / halfLifeDays));
}

export function getObservationWeight(observation) {
  const saleTypeWeight = observation.sourceType === 'sold_transaction'
    ? 1
    : observation.sourceType === 'market_estimate'
      ? 0.62
      : 0.35;
  const bestOfferWeight = observation.metadata?.bestOffer ? 0.78 : 1;
  const recencyWeight = getRecencyWeight(observation.soldAt ?? observation.listedAt ?? observation.fetchedAt);
  const matchWeight = Math.pow(Math.max(0, Math.min(1, observation.matchScore ?? 0)), 2);
  return Math.max(
    0.01,
    (observation.sourceReliability ?? 0.3) * matchWeight * recencyWeight * saleTypeWeight * bestOfferWeight
  );
}

export function weightedQuantile(observations, q) {
  const rows = observations
    .filter((row) => typeof row.normalisedDeliveredPriceGbp === 'number')
    .map((row) => ({
      value: row.normalisedDeliveredPriceGbp,
      weight: row.weight ?? getObservationWeight(row),
    }))
    .filter((row) => row.weight > 0)
    .sort((a, b) => a.value - b.value);

  if (!rows.length) return null;
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const target = totalWeight * q;
  let running = 0;
  for (const row of rows) {
    running += row.weight;
    if (running >= target) return row.value;
  }
  return rows[rows.length - 1].value;
}

function estimateGroup(observations, activeOnly = false) {
  if (!observations.length) return null;
  const weighted = observations.map((row) => ({ ...row, weight: getObservationWeight(row) }));
  const market = weightedQuantile(weighted, activeOnly ? 0.25 : 0.5);
  const low = weightedQuantile(weighted, activeOnly ? 0.1 : 0.25);
  const high = weightedQuantile(weighted, activeOnly ? 0.5 : 0.75);
  const prices = weighted.map((row) => row.normalisedDeliveredPriceGbp);
  const med = median(prices);
  const volatility = med ? (quantile(prices, 0.75) - quantile(prices, 0.25)) / med : null;
  return {
    market,
    low,
    high,
    count: weighted.length,
    sourceCount: new Set(weighted.map((row) => row.sourceId)).size,
    volatility,
  };
}

function roundMoney(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function sourceBreakdown(observations) {
  const bySource = new Map();
  for (const row of observations) {
    if (!bySource.has(row.sourceId)) bySource.set(row.sourceId, []);
    bySource.get(row.sourceId).push(row);
  }
  return [...bySource.entries()].map(([source, rows]) => ({
    source,
    estimate: roundMoney(weightedQuantile(rows, rows.every((row) => row.sourceType === 'active_listing') ? 0.25 : 0.5)),
    observationsUsed: rows.length,
    sourceType: rows[0]?.sourceType ?? 'unknown',
  }));
}

export function calculatePricingEstimate(observations, config = pricingV2Config) {
  const exact = observations.filter((row) =>
    row.includedInEstimate &&
    row.matchScore >= config.minimumMatchScore &&
    row.canonicalIdentityKey === observations[0]?.canonicalIdentityKey
  );
  const deduped = dedupeObservations(exact);
  const outlierTagged = removeOutliers(deduped);
  const included = outlierTagged.filter((row) => !row.outlier);
  const sold = included.filter((row) => row.sourceType === 'sold_transaction');
  const secondary = included.filter((row) => row.sourceType === 'market_estimate' || row.sourceType === 'market_price');
  const active = included.filter((row) => row.sourceType === 'active_listing');
  const soldEstimate = estimateGroup(sold);
  const secondaryEstimate = estimateGroup(secondary);
  const activeEstimate = estimateGroup(active, true);
  let decisionCase = 'no_data';
  let finalRows = [];
  let primarySource = 'none';
  let priceType = 'insufficient_exact_market_evidence';

  if (sold.length >= 3) {
    decisionCase = 'A_SUFFICIENT_EBAY_SOLD_OR_VERIFIED_SOLD';
    finalRows = sold;
    primarySource = sold[0]?.sourceId ?? 'sold_transactions';
    priceType = 'recent_sold_value';
  } else if (sold.length > 0 && secondary.length > 0) {
    decisionCase = 'B_THIN_SOLD_PLUS_SECONDARY';
    finalRows = [...sold, ...secondary];
    primarySource = sold[0]?.sourceId ?? secondary[0]?.sourceId ?? 'mixed';
    priceType = 'thin_sold_market_estimate';
  } else if (secondary.length > 0) {
    decisionCase = 'C_SECONDARY_MARKET_CONSENSUS';
    finalRows = secondary;
    primarySource = secondary[0]?.sourceId ?? 'secondary';
    priceType = 'market_estimate';
  } else if (active.length > 0) {
    decisionCase = 'D_ACTIVE_LISTING_INDICATION';
    finalRows = active;
    primarySource = active[0]?.sourceId ?? 'active_listings';
    priceType = 'asking_price_indication';
  }

  const activeOnly = decisionCase === 'D_ACTIVE_LISTING_INDICATION';
  const finalEstimate = estimateGroup(finalRows, activeOnly);
  const disagreementPercentage = soldEstimate?.market && secondaryEstimate?.market
    ? Math.abs(soldEstimate.market - secondaryEstimate.market) / soldEstimate.market
    : null;
  const needsReview = disagreementPercentage != null
    && disagreementPercentage >= config.disagreementReviewThreshold;

  return {
    decisionCase,
    priceType,
    primarySource,
    marketEstimate: roundMoney(finalEstimate?.market),
    lowEstimate: roundMoney(finalEstimate?.low),
    highEstimate: roundMoney(finalEstimate?.high),
    ebaySoldEstimate: roundMoney(soldEstimate?.market),
    secondaryConsensusEstimate: roundMoney(secondaryEstimate?.market),
    activeListingIndication: roundMoney(activeEstimate?.market),
    compCount: included.length,
    soldCompCount: sold.length,
    activeListingCount: active.length,
    sourceCount: new Set(included.map((row) => row.sourceId)).size,
    volatility: typeof finalEstimate?.volatility === 'number' ? Number(finalEstimate.volatility.toFixed(4)) : null,
    observationsUsed: finalRows,
    includedObservationCount: included.length,
    rejectedObservationCount: observations.length - included.length,
    outlierCount: outlierTagged.filter((row) => row.outlier).length,
    sourceBreakdown: sourceBreakdown(finalRows),
    disagreementPercentage: disagreementPercentage == null ? null : Number(disagreementPercentage.toFixed(4)),
    disagreementReason: needsReview ? 'Primary sold evidence and secondary market evidence differ materially.' : null,
    needsReview,
  };
}
