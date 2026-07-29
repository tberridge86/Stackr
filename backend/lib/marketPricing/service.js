import {
  ApiError,
  clean,
  encodeCursor,
  isUuid,
  parseCursor,
  parseLimit,
} from '../stackrApiV1.js';

export const MARKET_PRICING_VERSION = 'market-pricing-v1.0.0';
export const MARKET_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

function table(supabase, schema, name) {
  return supabase.schema(schema).from(name);
}

async function queryRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function queryMaybeOne(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? null;
}

function normalizeProductType(value) {
  const raw = clean(value) ?? 'raw_card';
  if (!['raw_card', 'graded_card', 'sealed_product'].includes(raw)) {
    throw new ApiError(400, 'invalid_product_type', 'productType must be raw_card, graded_card or sealed_product.');
  }
  return raw;
}

function normalizeCurrency(value) {
  const code = String(value ?? process.env.STACKR_DISPLAY_CURRENCY ?? 'GBP').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new ApiError(400, 'invalid_currency', 'currency must be a three-letter ISO currency code.');
  }
  return code;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrNull(value) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? text : null;
}

function unavailablePrice(variantId, input = {}, reason = 'insufficient_exact_market_evidence') {
  const productType = normalizeProductType(input.productType);
  const currency = normalizeCurrency(input.currency);
  return {
    variantId,
    productType,
    identityKey: null,
    currency,
    status: 'unavailable',
    priceType: 'unavailable',
    estimates: {
      low: null,
      central: null,
      high: null,
    },
    sample: {
      total: 0,
      sold: 0,
      active: 0,
      sources: 0,
      dateRange: {
        from: null,
        to: null,
      },
    },
    confidence: {
      score: 0,
      label: 'insufficient_evidence',
    },
    freshness: 'unknown',
    sourceBreakdown: [],
    outliers: {},
    fallbackEstimate: null,
    unavailableReason: reason,
    calculatedAt: null,
    staleAfter: null,
    estimateVersion: MARKET_PRICING_VERSION,
  };
}

function toPriceResponse(row, variantId) {
  return {
    variantId: row.variant_id ?? variantId,
    productType: row.product_kind,
    identityKey: row.identity_key,
    currency: row.display_currency_code,
    status: row.evidence_status,
    priceType: row.evidence_status,
    estimates: {
      low: numeric(row.low_estimate),
      central: numeric(row.central_estimate),
      high: numeric(row.high_estimate),
    },
    sample: {
      total: Number(row.sample_count ?? 0),
      sold: Number(row.sold_sample_count ?? 0),
      active: Number(row.active_listing_count ?? 0),
      sources: Number(row.source_count ?? 0),
      dateRange: {
        from: dateOrNull(row.date_range_start),
        to: dateOrNull(row.date_range_end),
      },
    },
    confidence: {
      score: Number(row.confidence_score ?? 0),
      label: row.confidence_label ?? 'insufficient_evidence',
    },
    freshness: row.freshness ?? 'unknown',
    sourceBreakdown: Array.isArray(row.source_breakdown) ? row.source_breakdown : [],
    outliers: row.outlier_summary ?? {},
    fallbackEstimate: row.fallback_identity_key
      ? {
          identityKey: row.fallback_identity_key,
          reason: row.fallback_reason ?? 'fallback_identity_used',
          exact: false,
        }
      : null,
    unavailableReason: row.unavailable_reason ?? null,
    calculatedAt: dateOrNull(row.calculated_at),
    staleAfter: dateOrNull(row.stale_after),
    estimateVersion: row.estimate_version ?? MARKET_PRICING_VERSION,
  };
}

function toHistoryObservation(row) {
  return {
    observationId: row.observation_id,
    observationType: row.observation_type,
    variantId: row.variant_id,
    productType: row.product_kind,
    providerCode: row.provider_code,
    providerName: row.provider_name,
    sourceItemId: row.source_item_id,
    observedPrice: numeric(row.observed_price),
    shippingPrice: numeric(row.shipping_price),
    currency: row.currency_code,
    saleOrListingType: row.sale_or_listing_type,
    conditionCode: row.condition_code ?? null,
    graderCode: row.grader_code ?? null,
    gradeLabel: row.grade_label ?? null,
    observedAt: dateOrNull(row.observed_at),
    soldAt: dateOrNull(row.sold_at),
    sourceUrl: row.source_url ?? null,
    sourceTitle: row.source_title ?? null,
    parsedMatchConfidence: numeric(row.parsed_match_confidence),
    duplicateGroupId: row.duplicate_group_id ?? null,
  };
}

function applyMarketIdentityFilters(query, input = {}) {
  const productType = normalizeProductType(input.productType);
  const currency = normalizeCurrency(input.currency);
  query = query.eq('product_kind', productType).eq('display_currency_code', currency);
  if (clean(input.condition)) query = query.eq('condition_code', clean(input.condition));
  if (clean(input.grader)) query = query.eq('grader_code', clean(input.grader).toUpperCase());
  if (clean(input.grade)) query = query.eq('grade_value', clean(input.grade));
  return query;
}

function applyHistoryFilters(query, input = {}) {
  const productType = normalizeProductType(input.productType);
  const currency = normalizeCurrency(input.currency);
  query = query.eq('product_kind', productType).eq('currency_code', currency);
  if (clean(input.observationType)) query = query.eq('observation_type', clean(input.observationType));
  if (clean(input.condition)) query = query.eq('condition_code', clean(input.condition));
  if (clean(input.grader)) query = query.eq('grader_code', clean(input.grader).toUpperCase());
  return query;
}

export function createMarketPricingService(options) {
  const supabase = options.supabase;

  return {
    async price(variantId, input = {}) {
      if (!isUuid(variantId)) throw new ApiError(400, 'invalid_variant_id', 'variantId must be a canonical UUID.');
      let query = table(supabase, 'api', 'market_price_estimates')
        .select('*')
        .eq('variant_id', variantId);
      query = applyMarketIdentityFilters(query, input);
      query = query
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = await queryMaybeOne(query);
      if (!row) {
        const reason = normalizeProductType(input.productType) === 'graded_card' && (!clean(input.grader) || !clean(input.grade))
          ? 'grader_and_grade_required_for_graded_price'
          : 'insufficient_exact_market_evidence';
        return unavailablePrice(variantId, input, reason);
      }
      return toPriceResponse(row, variantId);
    },

    async priceHistory(variantId, input = {}) {
      if (!isUuid(variantId)) throw new ApiError(400, 'invalid_variant_id', 'variantId must be a canonical UUID.');
      const limit = parseLimit(input.limit, 50, 200);
      const cursor = parseCursor(input.cursor);
      let query = table(supabase, 'api', 'market_price_history')
        .select('*')
        .eq('variant_id', variantId);
      query = applyHistoryFilters(query, input);
      if (cursor?.observedAt) query = query.lt('observed_at', cursor.observedAt);
      query = query
        .order('observed_at', { ascending: false })
        .limit(limit + 1);
      const rows = await queryRows(query);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return {
        variantId,
        observations: page.map(toHistoryObservation),
        pagination: {
          limit,
          nextCursor: rows.length > limit && last?.observed_at
            ? encodeCursor({ observedAt: last.observed_at })
            : null,
        },
      };
    },

    async marketMovers(input = {}) {
      const limit = parseLimit(input.limit, 25, 100);
      const currency = normalizeCurrency(input.currency);
      let query = table(supabase, 'api', 'market_movers')
        .select('*')
        .eq('display_currency_code', currency)
        .order('percentage_change', { ascending: false, nullsFirst: false })
        .limit(limit + 1);
      if (clean(input.productType)) query = query.eq('product_kind', normalizeProductType(input.productType));
      const rows = await queryRows(query);
      return {
        movers: rows.slice(0, limit).map((row) => ({
          variantId: row.variant_id ?? null,
          sealedProductVariantId: row.sealed_product_variant_id ?? null,
          productType: row.product_kind,
          currency: row.display_currency_code,
          currentEstimate: numeric(row.current_estimate),
          previousEstimate: numeric(row.previous_estimate),
          percentageChange: numeric(row.percentage_change),
          confidence: {
            score: Number(row.confidence_score ?? 0),
            label: row.confidence_label ?? 'insufficient_evidence',
          },
          calculatedAt: dateOrNull(row.calculated_at),
          previousCalculatedAt: dateOrNull(row.previous_calculated_at),
        })),
        pagination: { limit, nextCursor: null },
      };
    },

    async marketOpportunities(input = {}) {
      const limit = parseLimit(input.limit, 25, 100);
      const currency = normalizeCurrency(input.currency);
      let query = table(supabase, 'api', 'market_opportunities')
        .select('*')
        .eq('currency_code', currency)
        .order('discount_percentage', { ascending: false, nullsFirst: false })
        .limit(limit + 1);
      if (clean(input.productType)) query = query.eq('product_kind', normalizeProductType(input.productType));
      const rows = await queryRows(query);
      return {
        opportunities: rows.slice(0, limit).map((row) => ({
          activeListingId: row.active_listing_id,
          variantId: row.variant_id ?? null,
          sealedProductVariantId: row.sealed_product_variant_id ?? null,
          productType: row.product_kind,
          providerCode: row.provider_code,
          sourceItemId: row.source_item_id,
          sourceTitle: row.source_title,
          askingPrice: numeric(row.observed_price),
          shippingPrice: numeric(row.shipping_price),
          currency: row.currency_code,
          centralEstimate: numeric(row.central_estimate),
          lowEstimate: numeric(row.low_estimate),
          highEstimate: numeric(row.high_estimate),
          discountPercentage: numeric(row.discount_percentage),
          sourceUrl: row.source_url ?? null,
          observedAt: dateOrNull(row.observed_at),
          estimateCalculatedAt: dateOrNull(row.estimate_calculated_at),
          confidence: {
            score: Number(row.confidence_score ?? 0),
            label: row.confidence_label ?? 'insufficient_evidence',
          },
          reason: 'active_listing_below_exact_variant_estimate',
        })),
        pagination: { limit, nextCursor: null },
      };
    },
  };
}
