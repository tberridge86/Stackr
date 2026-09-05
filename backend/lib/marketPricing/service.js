import {
  ApiError,
  clean,
  encodeCursor,
  isUuid,
  parseCursor,
  parseLimit,
} from '../stackrApiV1.js';
import { buildCanonicalIdentity } from '../pricingV2/identity.js';

export const MARKET_PRICING_VERSION = 'market-pricing-v1.0.0';
export const MARKET_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
export const MARKET_HISTORY_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=60';

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
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrNull(value) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? text : null;
}

const RAW_NEAR_MINT = 'raw_near_mint';
const SNAPSHOT_HISTORY_RPC_PAGE_SIZE = 1_000;
const SNAPSHOT_HISTORY_RPC_MAX_ROWS = 40_000;
const SNAPSHOT_HISTORY_SELECT = 'id,card_id,language,canonical_identity_key,pricing_identity_json,market_price_gbp,low_price_gbp,high_price_gbp,tcgdex_price,tcg_mid,tcg_low,primary_source,price_source,price_type,confidence_score,confidence_label,methodology_version,source_breakdown,calculation_summary,outlier_summary,calculated_at,snapshot_at,stale_after,is_stale';
const CONDITION_CODES = new Map([
  ['mint', 'raw_mint'],
  ['raw_mint', 'raw_mint'],
  ['near_mint', RAW_NEAR_MINT],
  [RAW_NEAR_MINT, RAW_NEAR_MINT],
  ['lightly_played', 'raw_lightly_played'],
  ['raw_lightly_played', 'raw_lightly_played'],
  ['moderately_played', 'raw_moderately_played'],
  ['raw_moderately_played', 'raw_moderately_played'],
  ['heavily_played', 'raw_heavily_played'],
  ['raw_heavily_played', 'raw_heavily_played'],
  ['damaged', 'raw_damaged'],
  ['raw_damaged', 'raw_damaged'],
]);

function normalizeConditionCode(value) {
  const token = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return token ? CONDITION_CODES.get(token) ?? token : null;
}

function parseSnapshotRangeDays(value) {
  if (value == null || value === '') return null;
  const days = Number(value);
  if (!Number.isInteger(days) || ![7, 30].includes(days)) {
    throw new ApiError(400, 'invalid_range_days', 'rangeDays must be either 7 or 30.');
  }
  return days;
}

function snapshotValue(row, ...names) {
  for (const name of names) {
    const value = numeric(row?.[name]);
    if (value != null) return value;
  }
  return null;
}

function chunks(values, size) {
  const result = [];
  for (let offset = 0; offset < values.length; offset += size) result.push(values.slice(offset, offset + size));
  return result;
}

function parseUniqueCanonicalVariantIds(values, max, message) {
  if (!Array.isArray(values) || !values.length) {
    throw new ApiError(400, 'invalid_variant_ids', message);
  }
  if (values.length > max) {
    throw new ApiError(400, 'too_many_variant_ids', `At most ${max} variantIds may be requested at once.`);
  }
  const ids = [];
  const seen = new Set();
  for (const value of values) {
    const id = String(value ?? '').trim();
    if (!isUuid(id)) throw new ApiError(400, 'invalid_variant_ids', message);
    const normalized = id.toLowerCase();
    if (seen.has(normalized)) {
      throw new ApiError(400, 'duplicate_variant_ids', 'variantIds must be unique (case-insensitively).');
    }
    seen.add(normalized);
    ids.push(normalized);
  }
  return ids;
}

function canonicalVariantIdFromSnapshot(row) {
  const identity = row?.pricing_identity_json;
  return clean(identity?.canonicalVariantId ?? identity?.canonical_variant_id);
}

function isDefaultVariant(metadata) {
  if (!metadata?.variantCode && !metadata?.finishCode) return false;
  const variant = clean(metadata?.variantCode)?.toLowerCase();
  const finish = clean(metadata?.finishCode)?.toLowerCase();
  return (!variant || ['standard', 'default', 'normal'].includes(variant))
    && (!finish || ['standard', 'default', 'normal', 'non_holo'].includes(finish));
}

function canonicalIdentityForMetadata(metadata, condition = RAW_NEAR_MINT) {
  if (!metadata?.canonicalVariantId || !metadata?.setId || !metadata?.number || !metadata?.name) return null;
  return buildCanonicalIdentity({
    id: metadata.canonicalVariantId,
    language: metadata.language,
    set_id: metadata.setId,
    number: metadata.number,
    name: metadata.name,
    rarity: metadata.rarity,
  }, {
    canonicalVariantId: metadata.canonicalVariantId,
    canonicalPrintingId: metadata.canonicalPrintingId,
    productType: 'raw_card',
    language: metadata.language,
    setId: metadata.setId,
    cardNumber: metadata.number,
    variant: metadata.variantCode,
    finish: metadata.finishCode,
    condition,
  });
}

// Legacy rows do not necessarily identify a physical finish.  An unscoped
// row may therefore price only the normal/default finish.  A stored canonical
// variant ID or full canonical identity is the sole basis for an exact scope.
function snapshotVariantScope(row, variantId, metadata) {
  const explicitVariantId = canonicalVariantIdFromSnapshot(row);
  if (explicitVariantId && explicitVariantId !== variantId) return null;

  const expectedIdentity = canonicalIdentityForMetadata(metadata);
  const identityKey = clean(row?.canonical_identity_key);
  if (identityKey) {
    if (!expectedIdentity) return null;
    if (identityKey === expectedIdentity.identityKey) return 'exact_variant';
    return null;
  }

  if (explicitVariantId) {
    const rowIdentity = row.pricing_identity_json;
    const productType = clean(rowIdentity?.productType ?? rowIdentity?.product_type);
    const condition = normalizeConditionCode(rowIdentity?.rawCondition ?? rowIdentity?.raw_condition ?? rowIdentity?.condition);
    if (productType && productType !== 'raw_card') return null;
    if (condition && condition !== RAW_NEAR_MINT) return null;
    return 'exact_variant';
  }
  return isDefaultVariant(metadata) ? 'printing_level' : null;
}

function legacySource(row) {
  const source = clean(row?.primary_source ?? row?.price_source)?.toLowerCase();
  // The current production evidence only has a small number of explicitly
  // sourced TCGdex rows. Do not infer a source for the older source-null rows.
  return source?.includes('tcgdex') ? 'tcgdex' : null;
}

function legacySnapshotEstimate(row, variantId, scope) {
  const source = legacySource(row);
  const central = source === 'tcgdex'
    ? snapshotValue(row, 'tcgdex_price', 'tcg_mid', 'tcg_low', 'market_price_gbp')
    : null;
  if (!source || central == null) return null;
  const calculatedAt = dateOrNull(row.calculated_at) ?? dateOrNull(row.snapshot_at);
  if (!calculatedAt) return null;
  const staleAfter = dateOrNull(row.stale_after);
  const stale = Boolean(row.is_stale)
    || Boolean(staleAfter && new Date(staleAfter).getTime() < Date.now());
  return {
    variantId,
    productType: 'raw_card',
    identityKey: null,
    quoteScope: scope,
    currency: 'GBP',
    primarySource: source,
    status: 'legacy_cached_market_estimate',
    priceType: 'legacy_cached_market_estimate',
    // TCGdex does not document whether its aggregate includes shipping. Keep
    // that uncertainty explicit rather than implying sold-price comparability.
    priceBasis: 'provider_market_estimate_shipping_unknown',
    estimates: {
      low: snapshotValue(row, 'tcg_low', 'low_price_gbp'),
      central,
      high: snapshotValue(row, 'high_price_gbp'),
    },
    // A cached catalogue value is neither a sale nor an individual listing.
    sample: { total: 0, sold: 0, active: 0, sources: 1, dateRange: { from: null, to: null } },
    confidence: { score: 0, label: 'source_labelled_legacy_estimate' },
    freshness: stale ? 'stale' : 'source_timestamped',
    sourceBreakdown: [{ sourceId: source, sourceType: 'legacy_cached_market_snapshot', observationCount: 0 }],
    outliers: {},
    fallbackEstimate: scope === 'printing_level'
      ? { identityKey: null, reason: 'legacy_printing_level_snapshot', exact: false }
      : null,
    unavailableReason: null,
    calculatedAt,
    staleAfter,
    estimateVersion: 'legacy-market-snapshot-v1',
  };
}

const SNAPSHOT_HISTORY_SOURCES = new Set([
  'poketrace_sold',
  'ebay_active',
  'ebay_sold',
  'ebay',
  'tcgdex',
  'existing_stackr_source',
  'manual_verified_comp',
  'manual_verified_import',
]);
const SOLD_MARKET_SOURCES = new Set(['poketrace_sold', 'ebay_sold', 'manual_verified_comp', 'manual_verified_import']);
const SOLD_MARKET_PRICE_TYPES = new Set([
  'recent_sold_value',
  'recent_sold_market_estimate',
  'sold_market_estimate',
]);
const RECOGNISED_SNAPSHOT_PRICE_BASES = new Set([
  'item_price_excludes_shipping',
  'asking_price_excludes_shipping',
  'normalised_delivered_price_gbp',
  'provider_market_estimate_shipping_unknown',
]);

function canonicalSnapshotHistoryItem(row, variantId, scope) {
  if (scope !== 'exact_variant') return null;
  const source = clean(row?.primary_source ?? row?.price_source)?.toLowerCase();
  const methodology = clean(row?.methodology_version);
  const sourceBreakdown = Array.isArray(row?.source_breakdown) ? row.source_breakdown : [];
  const central = numeric(row?.market_price_gbp);
  const snapshotAt = dateOrNull(row?.snapshot_at) ?? dateOrNull(row?.calculated_at);
  if (!source || !SNAPSHOT_HISTORY_SOURCES.has(source)
    || !methodology?.startsWith('pricing-v2.')
    || !sourceBreakdown.length
    || !sourceBreakdown.some((item) => clean(item?.sourceId ?? item?.source)?.toLowerCase() === source)
    || central == null || central <= 0 || !snapshotAt) return null;
  const declaredType = clean(row?.price_type)?.toLowerCase();
  // A chart point is an estimate/asking indication. It must never turn the
  // snapshot's retained evidence pointer into a displayed individual sale.
  const priceType = declaredType === 'asking_price_indication' || source === 'ebay_active'
    ? 'asking_price_indication'
    : SOLD_MARKET_SOURCES.has(source) && SOLD_MARKET_PRICE_TYPES.has(declaredType)
      ? 'recent_sold_market_estimate'
      : 'market_estimate';
  const staleAfter = dateOrNull(row?.stale_after);
  const stale = Boolean(row?.is_stale)
    || Boolean(staleAfter && new Date(staleAfter).getTime() < Date.now());
  const declaredBasis = clean(row?.calculation_summary?.priceBasis ?? row?.outlier_summary?.price_basis);
  return {
    cardId: row.card_id,
    variantId,
    quoteScope: scope,
    calculatedAt: dateOrNull(row?.calculated_at) ?? snapshotAt,
    snapshotAt,
    marketCentral: central,
    marketLow: numeric(row?.low_price_gbp),
    marketHigh: numeric(row?.high_price_gbp),
    currency: 'GBP',
    confidence: {
      score: numeric(row?.confidence_score) ?? 0,
      label: row?.confidence_label ?? 'source_timestamped_estimate',
    },
    sampleCount: 0,
    primarySource: source,
    sourceBreakdown,
    methodologyVersion: methodology,
    // Price basis must be declared by the snapshot writer. Provider/source
    // identity alone cannot establish whether delivery or FX was included.
    priceBasis: declaredBasis && RECOGNISED_SNAPSHOT_PRICE_BASES.has(declaredBasis)
      ? declaredBasis
      : 'unknown_or_mixed_normalisation',
    priceType,
    staleAfter,
    isStale: stale,
    freshness: stale ? 'stale' : 'source_timestamped',
    provenLastSold: false,
    lastSoldEvidence: null,
  };
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
    priceBasis: clean(row.outlier_summary?.price_basis) ?? 'item_price_excludes_shipping',
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
  const provenLastSold = row.proven_last_sold === true;
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
    provenLastSold,
    saleVerificationState: provenLastSold ? row.sale_verification_state ?? null : null,
    transactionStatus: provenLastSold ? row.transaction_status ?? null : null,
    evidenceSha256: provenLastSold ? row.evidence_sha256 ?? null : null,
    provenanceVersion: provenLastSold ? row.provenance_version ?? null : null,
    lastSoldEvidence: provenLastSold && row.last_sold_evidence && typeof row.last_sold_evidence === 'object'
      ? row.last_sold_evidence
      : null,
  };
}

function applyMarketIdentityFilters(query, input = {}) {
  const productType = normalizeProductType(input.productType);
  const currency = normalizeCurrency(input.currency);
  query = query.eq('product_kind', productType).eq('display_currency_code', currency);
  // The public raw-card price endpoint is near-mint by default. Without this
  // predicate, a newly calculated played/mint estimate could win by timestamp.
  const condition = normalizeConditionCode(input.condition)
    ?? (productType === 'raw_card' ? RAW_NEAR_MINT : null);
  if (condition) query = query.eq('condition_code', condition);
  if (clean(input.grader)) query = query.eq('grader_code', clean(input.grader).toUpperCase());
  if (clean(input.grade)) query = query.eq('grade_value', clean(input.grade));
  return query;
}

function applyHistoryFilters(query, input = {}) {
  const productType = normalizeProductType(input.productType);
  const currency = normalizeCurrency(input.currency);
  query = query.eq('product_kind', productType).eq('currency_code', currency);
  if (clean(input.observationType)) query = query.eq('observation_type', clean(input.observationType));
  const condition = normalizeConditionCode(input.condition);
  if (condition) query = query.eq('condition_code', condition);
  if (clean(input.grader)) query = query.eq('grader_code', clean(input.grader).toUpperCase());
  return query;
}

async function catalogueRefreshMetadata(supabase, variantId) {
  const { data, error } = await table(supabase, 'api', 'catalogue_cards')
    .select('variant_id,printing_id,language_code,set_id,set_code,set_english_display_name,set_native_name,collector_number,card_english_display_name,card_native_name,rarity_code,variant_code,finish_code')
    .eq('variant_id', variantId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;
  return {
    name: data.card_native_name ?? data.card_english_display_name ?? null,
    language: data.language_code ?? null,
    setId: data.set_id ?? null,
    setCode: data.set_code ?? null,
    setName: data.set_native_name ?? data.set_english_display_name ?? null,
    number: data.collector_number ?? null,
    rarity: data.rarity_code ?? null,
    canonicalVariantId: data.variant_id,
    canonicalPrintingId: data.printing_id,
    variantCode: data.variant_code ?? null,
    finishCode: data.finish_code ?? null,
  };
}

async function resolveSnapshotIdentity(supabase, variantId, metadata = null) {
  const resolved = metadata ?? await catalogueRefreshMetadata(supabase, variantId);
  const cardIds = new Set([variantId]);
  if (!resolved?.language) return { cardIds: [...cardIds], metadata: resolved };
  if (resolved.canonicalPrintingId) cardIds.add(resolved.canonicalPrintingId);

  const filters = [`variant_id.eq.${variantId}`];
  if (resolved.canonicalPrintingId) filters.push(`printing_id.eq.${resolved.canonicalPrintingId}`);
  const { data, error } = await table(supabase, 'api', 'catalogue_external_identifiers')
    .select('external_id')
    .eq('language_code', resolved.language)
    .or(filters.join(','));
  if (error) throw error;
  for (const row of data ?? []) {
    const id = clean(row?.external_id);
    if (id) cardIds.add(id);
  }
  return { cardIds: [...cardIds], metadata: resolved };
}

async function readSnapshotHistoryRpc(supabase, cardIds, rangeDays) {
  const rows = [];
  for (let offset = 0; offset < SNAPSHOT_HISTORY_RPC_MAX_ROWS; offset += SNAPSHOT_HISTORY_RPC_PAGE_SIZE) {
    const { data: page, error } = await supabase
      .schema('api')
      .rpc('market_price_snapshot_history', {
        p_card_ids: cardIds,
        p_range_days: rangeDays,
      })
      .select(SNAPSHOT_HISTORY_SELECT)
      .order('snapshot_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + SNAPSHOT_HISTORY_RPC_PAGE_SIZE - 1);
    if (error) throw error;
    const pageRows = page ?? [];
    rows.push(...pageRows);
    if (pageRows.length < SNAPSHOT_HISTORY_RPC_PAGE_SIZE) return rows;
  }
  // Returning a prefix would draw a believable but incomplete chart. Fail
  // closed instead; the migration's buckets should be far below this bound.
  throw new ApiError(503, 'snapshot_history_result_limit', 'Snapshot history exceeds the safe retrieval bound.');
}

function supportedLegacyInput(input = {}) {
  if (normalizeProductType(input.productType) !== 'raw_card') return false;
  if (normalizeCurrency(input.currency) !== 'GBP') return false;
  const condition = normalizeConditionCode(input.condition);
  return !condition || condition === RAW_NEAR_MINT;
}

async function findLegacySnapshotEstimate(supabase, variantId, input = {}) {
  if (!supportedLegacyInput(input)) return null;
  const metadata = await catalogueRefreshMetadata(supabase, variantId);
  if (!metadata?.language) return null;
  const { cardIds } = await resolveSnapshotIdentity(supabase, variantId, metadata);
  if (!cardIds.length) return null;
  const { data, error } = await supabase
    .from('market_price_snapshots')
    .select('id,card_id,language,canonical_identity_key,pricing_identity_json,market_price_gbp,low_price_gbp,high_price_gbp,tcgdex_price,tcg_mid,tcg_low,primary_source,price_source,price_type,confidence_score,confidence_label,calculated_at,snapshot_at,stale_after,is_stale')
    .in('card_id', cardIds)
    .is('user_id', null)
    .eq('language', metadata.language)
    .order('snapshot_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  let best = null;
  for (const row of data ?? []) {
    const scope = snapshotVariantScope(row, variantId, metadata);
    const estimate = scope ? legacySnapshotEstimate(row, variantId, scope) : null;
    if (!estimate) continue;
    if (!best || (scope === 'exact_variant' && best.quoteScope !== 'exact_variant')) best = estimate;
  }
  return best;
}

function toSnapshotHistoryItem(row, variantId, scope) {
  const estimate = legacySnapshotEstimate(row, variantId, scope);
  if (!estimate) return null;
  return {
    cardId: row.card_id,
    variantId,
    quoteScope: scope,
    calculatedAt: estimate.calculatedAt,
    snapshotAt: dateOrNull(row.snapshot_at) ?? estimate.calculatedAt,
    marketCentral: estimate.estimates.central,
    marketLow: estimate.estimates.low,
    marketHigh: estimate.estimates.high,
    currency: estimate.currency,
    confidence: estimate.confidence,
    sampleCount: 0,
    primarySource: estimate.sourceBreakdown[0].sourceId,
    priceType: estimate.priceType,
    staleAfter: estimate.staleAfter,
    isStale: estimate.freshness === 'stale',
    freshness: estimate.freshness,
  };
}

export function createMarketPricingService(options) {
  const supabase = options.supabase;
  const refreshEnabled = options.refreshEnabled ?? process.env.MARKET_PRICE_REFRESH_ENABLED === 'true';

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
        const legacy = reason === 'insufficient_exact_market_evidence'
          ? await findLegacySnapshotEstimate(supabase, variantId, input)
          : null;
        if (legacy) return legacy;
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

    async snapshotHistory(variantIds, input = {}) {
      const ids = parseUniqueCanonicalVariantIds(
        variantIds,
        24,
        'variantIds must contain one or more unique canonical UUIDs.',
      );
      if (normalizeCurrency(input.currency) !== 'GBP') {
        throw new ApiError(422, 'unsupported_snapshot_currency', 'Legacy price snapshots are published only in GBP.');
      }
      const rangeDays = parseSnapshotRangeDays(input.rangeDays);
      const limit = rangeDays === 7 ? 338 : rangeDays === 30 ? 32 : parseLimit(input.limit, 72, 120);
      const resolved = await Promise.all(ids.map(async (id) => ({
        id,
        ...(await resolveSnapshotIdentity(supabase, id)),
      })));
      const cardIds = [...new Set(resolved.flatMap((entry) => entry.cardIds))];
      if (!cardIds.length) return { snapshots: [], limit, ...(rangeDays ? { rangeDays } : {}) };
      let data;
      if (rangeDays) {
        const resultSets = await Promise.all(chunks(cardIds, 120)
          .map((cardIdChunk) => readSnapshotHistoryRpc(supabase, cardIdChunk, rangeDays)));
        data = resultSets.flat();
      } else {
        const { data: rows, error } = await supabase
          .from('market_price_snapshots')
          .select(SNAPSHOT_HISTORY_SELECT)
          .in('card_id', cardIds)
          .is('user_id', null)
          .order('snapshot_at', { ascending: false })
          .limit(Math.min(2_880, ids.length * limit * 4));
        if (error) throw error;
        data = rows ?? [];
      }
      const requestedAt = Date.now();
      const rangeStart = rangeDays ? requestedAt - rangeDays * 86_400_000 : null;
      const perVariant = new Map(ids.map((id) => [id, new Map()]));
      for (const entry of resolved) {
        const rows = (data ?? []).filter((row) => (
          entry.cardIds.includes(row.card_id) && row.language === entry.metadata?.language
        ));
        for (const row of rows) {
          const scope = snapshotVariantScope(row, entry.id, entry.metadata);
          const item = scope
            ? canonicalSnapshotHistoryItem(row, entry.id, scope) ?? toSnapshotHistoryItem(row, entry.id, scope)
            : null;
          if (!item || item.snapshotAt == null) continue;
          const timestamp = Date.parse(item.snapshotAt);
          if (!Number.isFinite(timestamp) || timestamp > requestedAt) continue;
          const bucket = rangeDays
            ? timestamp < rangeStart
              ? 'baseline'
              : String(Math.floor((timestamp - Date.UTC(2000, 0, 1)) / (rangeDays === 7 ? 30 * 60_000 : 24 * 60 * 60_000)))
            : `${item.snapshotAt}|${item.cardId}`;
          const existing = perVariant.get(entry.id).get(bucket);
          if (!existing
            || (item.quoteScope === 'exact_variant' && existing.quoteScope !== 'exact_variant')
            || Date.parse(item.snapshotAt) > Date.parse(existing.snapshotAt)) {
            perVariant.get(entry.id).set(bucket, item);
          }
        }
      }
      const snapshots = [...perVariant.values()].flatMap((items) => [...items.values()]
        .sort((left, right) => Date.parse(right.snapshotAt) - Date.parse(left.snapshotAt))
        .slice(0, rangeDays ? limit + 1 : limit));
      return {
        snapshots: snapshots.sort((left, right) => Date.parse(right.snapshotAt) - Date.parse(left.snapshotAt)),
        limit,
        ...(rangeDays ? { rangeDays, bucketMinutes: rangeDays === 7 ? 30 : 1_440 } : {}),
      };
    },

    async requestSnapshotRefresh(variantId, input = {}, requestedBy = null) {
      if (!refreshEnabled) {
        throw new ApiError(503, 'price_refresh_not_enabled', 'Manual price refresh is not enabled in this deployment.');
      }
      if (!isUuid(variantId)) throw new ApiError(400, 'invalid_variant_id', 'variantId must be a canonical UUID.');
      variantId = String(variantId).toLowerCase();
      if (!supportedLegacyInput(input)) {
        throw new ApiError(422, 'unsupported_refresh_scope', 'Manual refresh currently supports raw near-mint GBP cards only.');
      }
      const metadata = await catalogueRefreshMetadata(supabase, variantId);
      const identity = canonicalIdentityForMetadata(metadata, RAW_NEAR_MINT);
      if (!identity || !metadata?.canonicalPrintingId || !metadata?.language) {
        throw new ApiError(422, 'unresolved_refresh_identity', 'The exact canonical card identity is incomplete, so no provider refresh was queued.');
      }
      const now = new Date();
      const { data: existing, error: existingError } = await supabase
        .from('price_refresh_queue')
        .select('requested_at,run_after,processed_at')
        .eq('card_id', metadata.canonicalPrintingId)
        .eq('language', metadata.language)
        .eq('metadata->>canonicalVariantId', variantId)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      const responseBase = { variantId, quoteScope: 'exact_variant' };
      if (existing && !existing.processed_at) {
        return { ...responseBase, status: 'already_queued', providerRefreshPending: true, queuedAt: existing.requested_at, earliestRefreshAt: existing.run_after ?? existing.requested_at };
      }
      const previous = Date.parse(existing?.requested_at ?? '');
      if (Number.isFinite(previous) && now.getTime() - previous < 5 * 60_000) {
        return { ...responseBase, status: 'cooldown', providerRefreshPending: false, queuedAt: existing.requested_at, earliestRefreshAt: new Date(previous + 5 * 60_000).toISOString() };
      }
      const { data, error } = await supabase
        .from('price_refresh_queue')
        .insert({
          card_id: metadata.canonicalPrintingId,
          set_id: metadata.setId,
          language: metadata.language,
          reason: 'manual_snapshot_refresh',
          priority: 100,
          requested_by: requestedBy,
          metadata: {
            refreshPipeline: 'pricing_v2_exact',
            requestedVia: 'v1_card_price_refresh',
            canonicalVariantId: variantId,
            canonicalPrintingId: metadata.canonicalPrintingId,
            canonicalCardName: metadata.name,
            canonicalSetName: metadata.setName,
            setCode: metadata.setCode,
            cardNumber: metadata.number,
            rarity: metadata.rarity,
            variantCode: metadata.variantCode,
            finishCode: metadata.finishCode,
            edition: identity.edition,
            identityKey: identity.identityKey,
            quoteScope: 'exact_variant',
            condition: RAW_NEAR_MINT,
            rawCondition: RAW_NEAR_MINT,
            productType: 'raw_card',
            currency: 'GBP',
          },
        })
        .select('requested_at,run_after')
        .maybeSingle();
      if (error?.code === '23505') {
        const { data: raced, error: racedError } = await supabase
          .from('price_refresh_queue')
          .select('requested_at,run_after,processed_at')
          .eq('card_id', metadata.canonicalPrintingId)
          .eq('language', metadata.language)
          .eq('metadata->>canonicalVariantId', variantId)
          .order('requested_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (racedError) throw racedError;
        if (raced && !raced.processed_at) {
          return { ...responseBase, status: 'already_queued', providerRefreshPending: true, queuedAt: raced.requested_at, earliestRefreshAt: raced.run_after ?? raced.requested_at };
        }
      }
      if (error) throw error;
      return { ...responseBase, status: 'queued', providerRefreshPending: true, queuedAt: data?.requested_at ?? now.toISOString(), earliestRefreshAt: data?.run_after ?? now.toISOString() };
    },

    async requestSnapshotRefreshBatch(variantIds, input = {}, requestedBy = null) {
      if (!refreshEnabled) {
        throw new ApiError(503, 'price_refresh_not_enabled', 'Manual price refresh is not enabled in this deployment.');
      }
      const ids = parseUniqueCanonicalVariantIds(
        variantIds,
        12,
        'variantIds must contain between 1 and 12 unique canonical UUIDs.',
      );
      const items = [];
      for (const group of chunks(ids, 4)) items.push(...await Promise.all(group.map((id) => this.requestSnapshotRefresh(id, input, requestedBy))));
      return {
        items,
        summary: items.reduce((summary, item) => {
          summary[item.status] = (summary[item.status] ?? 0) + 1;
          return summary;
        }, { queued: 0, already_queued: 0, cooldown: 0 }),
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
