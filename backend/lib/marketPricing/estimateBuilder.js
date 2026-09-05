import { pricingV2Config } from '../pricingV2/config.js';
import { calculatePricingEstimate } from '../pricingV2/statistics.js';
import { canonicalEbayListingUrl } from './soldProvenance.js';

const SUPPORTED_DISPLAY_CURRENCY = 'GBP';

function parseTime(value) {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time) ? time : null;
}

function toFiniteNumber(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMoney(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

function hasStrictSoldProvenance(row) {
  const soldAt = parseTime(row.sold_at);
  const observedAt = parseTime(row.observed_at);
  return row.provider_authorised === true
    && row.raw_evidence_verified === true
    && ['provider_observed', 'confirmed'].includes(String(row.sale_verification_state ?? ''))
    && row.transaction_status === 'completed'
    && row.final_price_confirmed === true
    && row.canonical_match_verified === true
    && Boolean(String(row.source_item_id ?? '').trim())
    && /^https:\/\//i.test(String(row.source_url ?? '').trim())
    && Boolean(String(row.raw_title ?? '').trim())
    && Boolean(row.raw_record_id)
    && /^[0-9a-f]{64}$/i.test(String(row.evidence_sha256 ?? '').trim())
    && Boolean(String(row.provenance_version ?? '').trim())
    && soldAt != null
    && observedAt != null
    && soldAt <= observedAt;
}

function estimateStatus(priceType) {
  if (priceType === 'recent_sold_value') return 'recent_sold_value';
  if (priceType === 'thin_sold_market_estimate') return 'thin_sold_value';
  if (priceType === 'market_estimate') return 'market_estimate';
  if (priceType === 'asking_price_indication') return 'asking_price_indication';
  return 'unavailable';
}

function groupKey(row) {
  return [
    row.market_identity_id,
    row.variant_id ?? '',
    row.sealed_product_variant_id ?? '',
    row.condition_code ?? '',
    row.grader_code ?? '',
    row.grade_id ?? '',
    row.currency_code,
  ].join('|');
}

function observationKey(row) {
  // A sale seen by two providers is still one sale. eBay item identifiers are
  // marketplace-global; country domains and provider fetch times do not create
  // independent evidence. Non-eBay providers retain their own ID namespace.
  try {
    const url = new URL(canonicalEbayListingUrl(row.source_url));
    const itemId = url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})\/?$/)?.[1];
    if (itemId) return `ebay|${itemId}`;
  } catch { /* Strict provenance validation rejects invalid URLs separately. */ }
  return [row.provider_code, row.source_item_id, row.sold_at].map((value) => String(value ?? '')).join('|');
}

function compareRows(left, right) {
  return String(left.market_identity_id).localeCompare(String(right.market_identity_id))
    || String(left.condition_code ?? '').localeCompare(String(right.condition_code ?? ''))
    || String(left.grader_code ?? '').localeCompare(String(right.grader_code ?? ''))
    || String(left.grade_id ?? '').localeCompare(String(right.grade_id ?? ''))
    || String(left.currency_code).localeCompare(String(right.currency_code));
}

/**
 * Builds insert-ready canonical market estimate rows from already-authorised sold
 * observations. It deliberately does not write to Supabase: callers must run the
 * returned plan through an explicit, separately approved bounded write step.
 */
export function buildCanonicalPriceEstimatePlan({
  observations = [],
  estimateVersionId,
  now = new Date().toISOString(),
  minimumMatchScore = pricingV2Config.minimumMatchScore,
  minimumSoldObservations = 3,
  staleAfterHours = pricingV2Config.staleAfterHours,
} = {}) {
  if (!estimateVersionId) throw new Error('Canonical estimate plan requires an estimateVersionId.');
  const nowMs = parseTime(now);
  if (nowMs == null) throw new Error('Canonical estimate plan requires a valid now timestamp.');

  const groups = new Map();
  const excluded = [];
  for (const row of observations) {
    if (!row?.market_identity_id || !row?.currency_code) {
      excluded.push({ id: row?.id ?? null, reason: 'missing_canonical_identity_or_currency' });
      continue;
    }
    if (String(row.currency_code).toUpperCase() !== SUPPORTED_DISPLAY_CURRENCY) {
      excluded.push({ id: row.id ?? null, reason: 'unsupported_display_currency_for_current_builder' });
      continue;
    }
    if (toFiniteNumber(row.sold_price) == null || toFiniteNumber(row.sold_price) <= 0) {
      excluded.push({ id: row.id ?? null, reason: 'invalid_sold_price' });
      continue;
    }
    if (parseTime(row.sold_at) == null || parseTime(row.sold_at) > nowMs || parseTime(row.observed_at) > nowMs) {
      excluded.push({ id: row.id ?? null, reason: 'invalid_sold_at' });
      continue;
    }
    if (toFiniteNumber(row.parsed_match_confidence) == null || Number(row.parsed_match_confidence) < minimumMatchScore) {
      excluded.push({ id: row.id ?? null, reason: 'below_minimum_match_confidence' });
      continue;
    }
    if (!hasStrictSoldProvenance(row)) {
      excluded.push({ id: row.id ?? null, reason: 'unproven_sold_observation' });
      continue;
    }
    const key = groupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const estimates = [];
  for (const rows of groups.values()) {
    const deduped = new Map();
    const conflicts = new Set();
    for (const row of rows) {
      const key = observationKey(row);
      const existing = deduped.get(key);
      if (existing && (Number(row.sold_price) !== Number(existing.sold_price)
        || Date.parse(row.sold_at) !== Date.parse(existing.sold_at))) {
        conflicts.add(key);
      }
      if (!existing || Number(row.parsed_match_confidence) > Number(existing.parsed_match_confidence)) {
        deduped.set(key, row);
      }
    }
    const eligible = [...deduped.entries()].filter(([key]) => !conflicts.has(key)).map(([, row]) => row);
    for (const key of conflicts) {
      excluded.push({ marketIdentityId: rows[0].market_identity_id, observationKey: key, reason: 'conflicting_sale_evidence' });
    }
    if (eligible.length < minimumSoldObservations) {
      excluded.push({
        marketIdentityId: rows[0].market_identity_id,
        reason: 'insufficient_exact_sold_observations',
        observationCount: eligible.length,
      });
      continue;
    }

    const identityKey = `market_identity|${rows[0].market_identity_id}`;
    const pricingObservations = eligible.map((row) => ({
      observationId: row.id ?? null,
      sourceId: row.provider_code,
      sourceType: 'sold_transaction',
      externalReference: observationKey(row),
      // Use a consistent item-price basis; missing shipping is not free shipping.
      normalisedDeliveredPriceGbp: roundMoney(Number(row.sold_price)),
      soldAt: row.sold_at,
      matchScore: Number(row.parsed_match_confidence),
      canonicalIdentityKey: identityKey,
      includedInEstimate: true,
      sourceReliability: 1,
      metadata: {
        soldProvenance: {
          qualified: true,
          verificationState: row.sale_verification_state,
          transactionStatus: row.transaction_status,
          evidenceSha256: row.evidence_sha256,
          provenanceVersion: row.provenance_version,
        },
      },
    }));
    const calculated = calculatePricingEstimate(pricingObservations, {
      ...pricingV2Config,
      minimumMatchScore,
    });
    if (calculated.marketEstimate == null || calculated.priceType === 'insufficient_exact_market_evidence') {
      excluded.push({ marketIdentityId: rows[0].market_identity_id, reason: 'no_safe_estimate_after_outlier_filtering' });
      continue;
    }

    const usedIds = new Set(calculated.observationsUsed.map((row) => row.observationId));
    const soldTimes = eligible.filter((row) => usedIds.has(row.id)).map((row) => row.sold_at).sort((left, right) => Date.parse(left) - Date.parse(right));
    const latestSoldAtMs = Date.parse(soldTimes.at(-1));
    const staleAfter = new Date(latestSoldAtMs + Number(staleAfterHours) * 3_600_000).toISOString();
    estimates.push({
      market_identity_id: rows[0].market_identity_id,
      estimate_version_id: estimateVersionId,
      product_kind: rows[0].sealed_product_variant_id ? 'sealed_product' : rows[0].grader_code ? 'graded_card' : 'raw_card',
      variant_id: rows[0].variant_id ?? null,
      sealed_product_variant_id: rows[0].sealed_product_variant_id ?? null,
      condition_code: rows[0].condition_code ?? null,
      grader_code: rows[0].grader_code ?? null,
      grade_id: rows[0].grade_id ?? null,
      display_currency_code: SUPPORTED_DISPLAY_CURRENCY,
      evidence_status: estimateStatus(calculated.priceType),
      unavailable_reason: null,
      sample_count: calculated.compCount,
      sold_sample_count: calculated.soldCompCount,
      active_listing_count: 0,
      source_count: calculated.sourceCount,
      date_range_start: soldTimes[0],
      date_range_end: soldTimes.at(-1),
      low_estimate: calculated.lowEstimate,
      central_estimate: calculated.marketEstimate,
      high_estimate: calculated.highEstimate,
      confidence_score: Math.min(100, Math.round((calculated.soldCompCount / 8) * 100)),
      confidence_label: calculated.soldCompCount >= 8 ? 'high' : calculated.soldCompCount >= 5 ? 'medium' : 'low',
      freshness: Date.parse(staleAfter) > nowMs ? 'fresh' : 'stale',
      recency_weight: null,
      source_breakdown: calculated.sourceBreakdown,
      outlier_summary: {
        method: 'median_absolute_deviation',
        price_basis: 'item_price_excludes_shipping',
        input_observation_count: rows.length,
        duplicate_observation_count: rows.length - eligible.length,
        excluded_outlier_count: calculated.outlierCount,
      },
      fallback_identity_key: null,
      fallback_reason: null,
      calculated_at: now,
      stale_after: staleAfter,
      // These IDs are intentionally part of the write plan rather than an API
      // response. The controlled database function verifies that each one is
      // still an exact, eligible sold observation before it writes an estimate.
      included_sold_observation_ids: calculated.observationsUsed
        .map((row) => row.observationId)
        .filter(Boolean)
        .sort(),
    });
  }

  estimates.sort(compareRows);
  return {
    estimates,
    excluded,
    summary: {
      inputObservations: observations.length,
      estimateCount: estimates.length,
      excludedCount: excluded.length,
      totalSoldObservationsUsed: estimates.reduce((total, row) => total + row.sold_sample_count, 0),
    },
  };
}
