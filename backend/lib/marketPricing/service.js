import {
  ApiError,
  clean,
  encodeCursor,
  isUuid,
  parseCursor,
  parseLimit,
} from '../stackrApiV1.js';
import { buildCanonicalIdentity } from '../pricingV2/identity.js';
import { fetchTcgdexNormalCardPrice } from '../tcgdex.js';

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
const PERSONAL_PROVIDER_REFRESH_COOLDOWN_MS = 5 * 60_000;
const PERSONAL_PROVIDER_REFRESH_TIMEOUT_MS = 12_000;
const personalProviderRefreshes = new Map();
// Snapshot rows retain calculation_summary; outlier_summary belongs to the
// separate canonical estimate projection and is not a snapshot column.
const SNAPSHOT_HISTORY_SELECT = 'id,card_id,language,canonical_identity_key,pricing_identity_json,market_price_gbp,low_price_gbp,high_price_gbp,tcgdex_price,tcg_mid,tcg_low,primary_source,price_source,price_type,confidence_score,confidence_label,methodology_version,source_breakdown,calculation_summary,calculated_at,snapshot_at,stale_after,is_stale';
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
  variantId = String(variantId).toLowerCase();
  const resolved = metadata ?? await catalogueRefreshMetadata(supabase, variantId);
  const cardIds = new Set([variantId]);
  if (!resolved?.language) return { cardIds: [...cardIds], metadata: resolved };
  if (resolved.canonicalPrintingId) cardIds.add(resolved.canonicalPrintingId);

  const filters = [`variant_id.eq.${variantId}`];
  if (resolved.canonicalPrintingId) filters.push(`printing_id.eq.${resolved.canonicalPrintingId}`);
  const { data, error } = await table(supabase, 'api', 'catalogue_external_identifiers')
    .select('source_entity_type,external_id,variant_id,printing_id')
    .eq('language_code', resolved.language)
    .or(filters.join(','));
  if (error) throw error;
  for (const row of data ?? []) {
    const id = clean(row?.external_id);
    // Retain genuine printing aliases, but do not borrow a sibling variant's
    // identifier merely because it shares the same printing.
    const exactVariant = row?.variant_id === variantId;
    const printingAlias = !row?.variant_id && row?.printing_id === resolved.canonicalPrintingId;
    if (!id || (!exactVariant && !printingAlias)) continue;
    cardIds.add(id);

    // TCGdex's imported ordinary card identity has one documented suffix:
    // `<provider-card-id>:normal`. Legacy snapshots use the provider card id
    // without that suffix. Derive it only from that exact variant identifier;
    // never strip arbitrary colon suffixes or borrow a sibling's alias.
    if (exactVariant && isDefaultVariant(resolved)
      && row?.source_entity_type === 'card') {
      const match = /^([A-Za-z0-9][A-Za-z0-9._-]*):normal$/.exec(id);
      if (match) cardIds.add(match[1]);
    }
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

  // Most current provider snapshots are now written against the canonical
  // variant ID.  Check that narrow, exact scope before reading the aliases
  // view or broadening to a printing-level fallback.  This preserves the
  // exact-variant-first rule while keeping ordinary collection reads below
  // the gateway's downstream deadline.
  const { data, error } = await supabase
    .from('market_price_snapshots')
    .select('id,card_id,language,canonical_identity_key,pricing_identity_json,market_price_gbp,low_price_gbp,high_price_gbp,tcgdex_price,tcg_mid,tcg_low,primary_source,price_source,price_type,confidence_score,confidence_label,calculated_at,snapshot_at,stale_after,is_stale')
    .eq('card_id', variantId)
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
  if (best?.quoteScope === 'exact_variant') return best;

  // Legacy imported snapshots can be keyed by an approved provider alias or
  // printing ID.  Keep this broader query strictly behind the exact check so
  // it remains a fallback and never lets a sibling variant replace an exact
  // canonical price.
  const { cardIds } = await resolveSnapshotIdentity(supabase, variantId, metadata);
  if (!cardIds.length) return best;
  const aliases = await supabase
    .from('market_price_snapshots')
    .select('id,card_id,language,canonical_identity_key,pricing_identity_json,market_price_gbp,low_price_gbp,high_price_gbp,tcgdex_price,tcg_mid,tcg_low,primary_source,price_source,price_type,confidence_score,confidence_label,calculated_at,snapshot_at,stale_after,is_stale')
    .in('card_id', cardIds)
    .is('user_id', null)
    .eq('language', metadata.language)
    .order('snapshot_at', { ascending: false })
    .limit(100);
  if (aliases.error) throw aliases.error;
  for (const row of aliases.data ?? []) {
    const scope = snapshotVariantScope(row, variantId, metadata);
    const estimate = scope ? legacySnapshotEstimate(row, variantId, scope) : null;
    if (!estimate) continue;
    if (!best || (scope === 'exact_variant' && best.quoteScope !== 'exact_variant')) best = estimate;
  }
  return best;
}

/**
 * Latest-only callers already have canonical variant UUIDs. Read each exact
 * scope with a bounded per-variant query: a global ordered limit could let one
 * noisy card hide another card's newest row. This path intentionally never
 * falls through to aliases; it is the large-collection escape hatch.
 */
async function latestExactSnapshotItems(supabase, variantIds, printingIds = []) {
  if (!variantIds.length && !printingIds.length) return new Map();
  const catalogue = variantIds.length
    ? table(supabase, 'api', 'catalogue_cards')
      .select('variant_id,printing_id,language_code,set_id,set_code,set_english_display_name,set_native_name,collector_number,card_english_display_name,card_native_name,rarity_code,variant_code,finish_code')
      .in('variant_id', variantIds)
    : Promise.resolve({ data: [], error: null });
  const printingCatalogue = printingIds.length
    ? table(supabase, 'api', 'catalogue_cards')
      .select('variant_id,printing_id,language_code,set_id,set_code,set_english_display_name,set_native_name,collector_number,card_english_display_name,card_native_name,rarity_code,variant_code,finish_code')
      .in('printing_id', printingIds)
    : null;
  const [{ data: variantRows, error: variantError }, printingResult] = await Promise.all([catalogue, printingCatalogue]);
  if (variantError) throw variantError;
  if (printingResult?.error) throw printingResult.error;
  const allRows = [...(variantRows ?? []), ...(printingResult?.data ?? [])];
  const metadataFor = (row) => ({
    name: row.card_native_name ?? row.card_english_display_name ?? null,
    language: row.language_code ?? null,
    setId: row.set_id ?? null,
    setCode: row.set_code ?? null,
    setName: row.set_native_name ?? row.set_english_display_name ?? null,
    number: row.collector_number ?? null,
    rarity: row.rarity_code ?? null,
    canonicalVariantId: row.variant_id,
    canonicalPrintingId: row.printing_id,
    variantCode: row.variant_code ?? null,
    finishCode: row.finish_code ?? null,
  });
  const metadataByVariant = new Map(allRows.map((row) => [row.variant_id, metadataFor(row)]));
  const normalPrintingVariants = new Map();
  for (const printingId of printingIds) {
    const matches = allRows.filter((row) => row.printing_id === printingId
      && ['normal', 'standard'].includes(String(row.variant_code ?? '').toLowerCase())
      && ['normal', 'standard'].includes(String(row.finish_code ?? '').toLowerCase()));
    if (matches.length === 1) normalPrintingVariants.set(printingId, matches[0].variant_id);
  }
  const requestedVariantIds = [...new Set([...variantIds, ...normalPrintingVariants.values()])];
  const rowsByVariant = new Map();
  for (const batch of chunks(requestedVariantIds, 6)) {
    const rows = await Promise.all(batch.map(async (variantId) => {
      const metadata = metadataByVariant.get(variantId);
      if (!metadata?.language) return [variantId, []];
      const { data, error } = await supabase.from('market_price_snapshots')
        .select(SNAPSHOT_HISTORY_SELECT)
        .eq('card_id', variantId)
        .eq('language', metadata.language)
        .is('user_id', null)
        .order('snapshot_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return [variantId, data ?? []];
    }));
    for (const [variantId, variantRows] of rows) rowsByVariant.set(variantId, variantRows);
  }
  const latest = new Map();
  for (const variantId of requestedVariantIds) {
    const metadata = metadataByVariant.get(variantId);
    if (!metadata?.language) continue;
    for (const row of rowsByVariant.get(variantId) ?? []) {
      const scope = snapshotVariantScope(row, variantId, metadata);
      if (scope !== 'exact_variant') continue;
      const item = canonicalSnapshotHistoryItem(row, variantId, scope) ?? toSnapshotHistoryItem(row, variantId, scope);
      const timestamp = Date.parse(String(row.snapshot_at ?? row.calculated_at ?? ''));
      if (!item?.snapshotAt || !Number.isFinite(timestamp)) continue;
      const current = latest.get(variantId);
      const currentTimestamp = Date.parse(String(current?.snapshotAt ?? ''));
      if (!current || !Number.isFinite(currentTimestamp) || timestamp > currentTimestamp) {
        latest.set(variantId, {
          ...item,
          printingId: metadata.canonicalPrintingId,
          setId: metadata.setId,
          languageCode: metadata.language,
          variantCode: metadata.variantCode,
        });
      }
    }
  }
  return new Map([
    ...variantIds.map((variantId) => [variantId, latest.get(variantId)]),
    ...printingIds.map((printingId) => [printingId, latest.get(normalPrintingVariants.get(printingId))]),
  ].filter(([, item]) => Boolean(item)));
}

function legacyBaseSnapshotScope(row) {
  const identity = row?.pricing_identity_json;
  if (!identity || typeof identity !== 'object') return true;
  const productType = clean(identity.productType)?.toLowerCase();
  const condition = clean(identity.condition)?.toLowerCase();
  const variant = clean(identity.variantCode ?? identity.variant)?.toLowerCase();
  const finish = clean(identity.finishCode ?? identity.finish)?.toLowerCase();
  const edition = clean(identity.edition)?.toLowerCase();
  return (!productType || productType === 'raw_card')
    && (!condition || condition === 'raw_near_mint')
    && (!variant || ['normal', 'standard'].includes(variant))
    && (!finish || ['normal', 'standard'].includes(finish))
    && !edition;
}

/**
 * Saved legacy ownership has no canonical variant UUID. This deliberately
 * returns only a source-labelled base-printing cache record scoped to the
 * exact saved card/set/language tuple. It is never an exact finish quote.
 */
async function latestLegacySnapshotItems(supabase, legacyIds, legacySetId, language) {
  const latest = new Map();
  for (const batch of chunks(legacyIds, 6)) {
    const results = await Promise.all(batch.map(async (legacyId) => {
      const { data, error } = await supabase.from('market_price_snapshots')
        .select(SNAPSHOT_HISTORY_SELECT)
        .eq('card_id', legacyId)
        .eq('set_id', legacySetId)
        .eq('language', language)
        .is('user_id', null)
        .order('snapshot_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return [legacyId, data ?? []];
    }));
    for (const [legacyId, rows] of results) {
      for (const row of rows) {
        if (!legacyBaseSnapshotScope(row)) continue;
        const item = toSnapshotHistoryItem(row, legacyId, 'printing_level');
        const timestamp = Date.parse(String(row.snapshot_at ?? row.calculated_at ?? ''));
        if (!item?.snapshotAt || !Number.isFinite(timestamp)) continue;
        const current = latest.get(legacyId);
        const currentTimestamp = Date.parse(String(current?.snapshotAt ?? ''));
        if (!current || !Number.isFinite(currentTimestamp) || timestamp > currentTimestamp) {
          latest.set(legacyId, {
            ...item,
            // Legacy imported rows often have no safe expiry timestamp. The
            // client must call this a cached/stale base-printing estimate.
            freshness: 'stale',
            legacyReference: legacyId,
            legacySetId,
            languageCode: language,
          });
        }
      }
    }
  }
  return latest;
}

function normaliseTcgdexNormalIdentifier(value) {
  const identifier = clean(value);
  if (!identifier) return null;
  const suffix = /^([A-Za-z0-9][A-Za-z0-9._-]*):normal$/i.exec(identifier);
  if (suffix) return suffix[1];
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(identifier) ? identifier : null;
}

function sameProviderIdentifier(left, right) {
  return clean(left)?.toLowerCase() === clean(right)?.toLowerCase();
}

async function exactTcgdexVariantAlias(supabase, variantId, metadata) {
  const { data, error } = await supabase
    .schema('api')
    .rpc('approved_tcgdex_variant_aliases', {
      p_variant_id: variantId,
      p_language_code: metadata.language,
    })
    .select('external_id')
    .limit(101);
  if (error) throw error;
  if ((data ?? []).length > 100) throw new ApiError(422, 'provider_identity_truncated', 'Too many provider identifiers are attached to this variant.');
  const aliases = [...new Set((data ?? [])
    .map((row) => normaliseTcgdexNormalIdentifier(row.external_id))
    .filter(Boolean))];
  if (aliases.length !== 1) {
    throw new ApiError(422, aliases.length ? 'ambiguous_provider_identity' : 'unresolved_provider_identity', 'Exactly one approved TCGdex identifier is required for this variant.');
  }
  return aliases[0];
}

function providerQuoteIsValid(quote, alias, metadata) {
  const price = Number(quote?.price);
  if (!Number.isFinite(price) || price <= 0) return false;
  if (String(quote?.language ?? '').toLowerCase() !== String(metadata.language).toLowerCase()) return false;
  if (!sameProviderIdentifier(quote?.providerCardId, alias)) return false;
  if (String(quote?.number ?? '').replace(/^0+/, '') !== String(metadata.number ?? '').replace(/^0+/, '')) return false;
  const updatedAt = Date.parse(String(quote?.pricingUpdatedAt ?? ''));
  return Number.isFinite(updatedAt) && updatedAt <= Date.now() + 5 * 60_000;
}

function utcDayBounds(isoTimestamp) {
  const timestamp = new Date(isoTimestamp);
  const start = new Date(Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate()));
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

function exactProviderSnapshotMatches(row, snapshot) {
  const identity = row?.pricing_identity_json ?? {};
  const expectedIdentity = snapshot.pricing_identity_json ?? {};
  return row?.user_id == null
    && row?.card_id === snapshot.card_id
    && row?.set_id === snapshot.set_id
    && row?.language === snapshot.language
    && row?.canonical_identity_key === snapshot.canonical_identity_key
    && identity.canonicalVariantId === expectedIdentity.canonicalVariantId
    && identity.productType === 'raw_card'
    && (identity.rawCondition ?? identity.condition) === RAW_NEAR_MINT
    && row?.primary_source === 'tcgdex'
    && row?.price_type === 'market_estimate'
    && row?.proven_last_sold === false
    && row?.methodology_version == null
    && sameProviderIdentifier(row?.tcgdex_card_id, snapshot.tcgdex_card_id)
    && Number.isFinite(Number(row?.tcgdex_price))
    && Number(row.tcgdex_price) > 0;
}

function snapshotTimestamp(row) {
  const timestamp = Date.parse(row?.snapshot_at ?? row?.calculated_at ?? '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function providerQuoteTimestamp(row) {
  const timestamp = Date.parse(row?.tcgdex_price_updated_at ?? '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function existingQuoteIsAtLeastAsFresh(existing, incoming) {
  const existingProviderTime = providerQuoteTimestamp(existing);
  const incomingProviderTime = providerQuoteTimestamp(incoming);
  if (existingProviderTime != null && incomingProviderTime != null) return existingProviderTime >= incomingProviderTime;
  const existingSnapshotTime = snapshotTimestamp(existing);
  const incomingSnapshotTime = snapshotTimestamp(incoming);
  return existingSnapshotTime != null && incomingSnapshotTime != null && existingSnapshotTime >= incomingSnapshotTime;
}

async function readSameUtcDayExactSnapshots(supabase, snapshot) {
  const { start, end } = utcDayBounds(snapshot.snapshot_at);
  const { data, error } = await supabase
    .from('market_price_snapshots')
    .select('id,user_id,card_id,set_id,language,canonical_identity_key,pricing_identity_json,tcg_low,tcg_mid,cardmarket_trend,tcgdex_card_id,tcgdex_price,tcgdex_price_updated_at,price_source,primary_source,price_type,proven_last_sold,methodology_version,calculated_at,snapshot_at,stale_after,is_stale')
    .eq('card_id', snapshot.card_id)
    .eq('set_id', snapshot.set_id)
    .is('user_id', null)
    .gte('snapshot_at', start)
    .lt('snapshot_at', end)
    .order('snapshot_at', { ascending: false })
    .limit(4);
  if (error) throw error;
  return data ?? [];
}

async function replaceSameDayExactProviderSnapshot(supabase, existing, snapshot) {
  let query = supabase.from('market_price_snapshots')
    .update(snapshot)
    .eq('id', existing.id)
    .is('user_id', null)
    .eq('card_id', existing.card_id)
    .eq('set_id', existing.set_id)
    .eq('language', existing.language)
    .eq('canonical_identity_key', existing.canonical_identity_key)
    .eq('primary_source', 'tcgdex')
    .eq('price_type', 'market_estimate')
    .eq('proven_last_sold', false)
    .is('methodology_version', null)
    .eq('tcgdex_card_id', existing.tcgdex_card_id)
    .eq('is_stale', Boolean(existing.is_stale))
    .eq('snapshot_at', existing.snapshot_at);
  query = existing.calculated_at == null
    ? query.is('calculated_at', null)
    : query.eq('calculated_at', existing.calculated_at);
  query = existing.tcgdex_price_updated_at == null
    ? query.is('tcgdex_price_updated_at', null)
    : query.eq('tcgdex_price_updated_at', existing.tcgdex_price_updated_at);
  const { data, error } = await query
    .select('id,user_id,card_id,set_id,language,canonical_identity_key,pricing_identity_json,tcg_low,tcg_mid,cardmarket_trend,tcgdex_card_id,tcgdex_price,tcgdex_price_updated_at,price_source,primary_source,price_type,proven_last_sold,methodology_version,calculated_at,snapshot_at,stale_after,is_stale')
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function insertExactProviderSnapshot(supabase, snapshot) {
  const { error } = await supabase.from('market_price_snapshots').insert(snapshot);
  if (!error) return snapshot;
  if (error.code !== '23505') throw error;

  const existingRows = await readSameUtcDayExactSnapshots(supabase, snapshot);
  const existing = existingRows.find((row) => exactProviderSnapshotMatches(row, snapshot));
  // The unique day index may have been occupied by a sold/V2 or different
  // physical identity. Never overwrite it just to make a provider refresh fit.
  if (!existing) {
    throw new ApiError(409, 'exact_provider_daily_snapshot_conflict', 'A different snapshot already occupies this card’s UTC-day record.');
  }
  if (existingQuoteIsAtLeastAsFresh(existing, snapshot)) return existing;

  const updated = await replaceSameDayExactProviderSnapshot(supabase, existing, snapshot);
  if (updated && exactProviderSnapshotMatches(updated, snapshot)) return updated;

  // A concurrent refresh won the optimistic timestamp guard. Re-read rather
  // than retrying an update that might replace the newer verified quote.
  const racedRows = await readSameUtcDayExactSnapshots(supabase, snapshot);
  const raced = racedRows.find((row) => exactProviderSnapshotMatches(row, snapshot));
  if (raced && existingQuoteIsAtLeastAsFresh(raced, snapshot)) return raced;
  throw new ApiError(409, 'exact_provider_daily_snapshot_conflict', 'The daily exact snapshot changed concurrently and could not be safely reused.');
}

async function providerQuoteWithinTimeout(providerFetch, request) {
  let timeout;
  try {
    return await Promise.race([
      providerFetch(request),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new ApiError(503, 'provider_refresh_timeout', 'The provider did not return an estimate in time.')), PERSONAL_PROVIDER_REFRESH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function prunePersonalProviderRefreshes(now) {
  for (const [key, state] of personalProviderRefreshes) {
    if (!state.promise && now - state.completedAt >= PERSONAL_PROVIDER_REFRESH_COOLDOWN_MS) personalProviderRefreshes.delete(key);
  }
  const completed = [...personalProviderRefreshes.entries()].filter(([, state]) => !state.promise);
  if (completed.length > 128) {
    completed.sort(([, left], [, right]) => left.completedAt - right.completedAt);
    for (const [key] of completed.slice(0, completed.length - 128)) personalProviderRefreshes.delete(key);
  }
}

async function refreshExactLegacyProviderEstimate(supabase, variantId, input, providerFetch) {
  if (!supportedLegacyInput(input)) throw new ApiError(422, 'unsupported_refresh_scope', 'Provider refresh supports only raw near-mint GBP cards.');
  const metadata = await catalogueRefreshMetadata(supabase, variantId);
  const identity = canonicalIdentityForMetadata(metadata, RAW_NEAR_MINT);
  if (!metadata || !identity || !isDefaultVariant(metadata)) throw new ApiError(422, 'unsupported_refresh_scope', 'This provider refresh is available only for an exact normal/default variant.');
  const alias = await exactTcgdexVariantAlias(supabase, variantId, metadata);
  const quote = await providerQuoteWithinTimeout(providerFetch, { cardId: alias, language: metadata.language });
  if (!providerQuoteIsValid(quote, alias, metadata)) throw new ApiError(404, 'exact_provider_quote_unavailable', 'The exact provider card has no current normal estimate.');
  const snapshotAt = new Date().toISOString();
  const providerUpdatedAt = new Date(quote.pricingUpdatedAt).toISOString();
  const staleAfter = new Date(Date.parse(providerUpdatedAt) + 6 * 60 * 60_000).toISOString();
  const snapshot = {
    user_id: null, card_id: variantId, set_id: metadata.setId, language: metadata.language,
    canonical_identity_key: identity.identityKey,
    pricing_identity_json: { ...identity, canonicalVariantId: variantId, canonical_variant_id: variantId },
    tcg_low: quote.tcg_low ?? null, tcg_mid: quote.tcg_mid ?? null, cardmarket_trend: quote.cardmarket_trend ?? null,
    tcgdex_card_id: quote.providerCardId, tcgdex_price: quote.price, tcgdex_price_updated_at: providerUpdatedAt,
    price_source: quote.priceSource ?? 'tcgdex', primary_source: 'tcgdex', price_type: 'market_estimate', proven_last_sold: false,
    calculated_at: snapshotAt, snapshot_at: snapshotAt, stale_after: staleAfter, is_stale: Date.parse(staleAfter) <= Date.now(), source_payload: quote.raw ?? null,
  };
  const persisted = await insertExactProviderSnapshot(supabase, snapshot);
  return legacySnapshotEstimate(persisted, variantId, 'exact_variant');
}

async function refreshPersonalProviderEstimate(supabase, variantId, input, providerFetch) {
  const now = Date.now();
  prunePersonalProviderRefreshes(now);
  const existing = personalProviderRefreshes.get(variantId);
  if (existing?.promise) return existing.promise;
  if (existing?.completedAt && now - existing.completedAt < PERSONAL_PROVIDER_REFRESH_COOLDOWN_MS) throw new ApiError(429, 'provider_refresh_cooldown', 'This exact card was refreshed recently.');
  const promise = refreshExactLegacyProviderEstimate(supabase, variantId, input, providerFetch);
  personalProviderRefreshes.set(variantId, { promise, completedAt: null });
  try {
    const result = await promise;
    personalProviderRefreshes.set(variantId, { promise: null, completedAt: Date.now() });
    return result;
  } catch (error) {
    personalProviderRefreshes.delete(variantId);
    throw error;
  }
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
  const providerFetch = options.fetchTcgdexNormalCardPrice ?? fetchTcgdexNormalCardPrice;

  return {
    async refreshExactProviderEstimate(variantId, input = {}) {
      if (!isUuid(variantId)) throw new ApiError(400, 'invalid_variant_id', 'variantId must be a canonical UUID.');
      return refreshPersonalProviderEstimate(supabase, String(variantId).toLowerCase(), input, providerFetch);
    },
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
      const rawLegacyIds = input.legacyIds == null ? []
        : (Array.isArray(input.legacyIds) ? input.legacyIds : String(input.legacyIds).split(','));
      if (rawLegacyIds.some((value) => !clean(value))) {
        throw new ApiError(400, 'invalid_legacy_ids', 'legacyIds must not contain empty references.');
      }
      const legacyIds = rawLegacyIds.map((value) => clean(value));
      if (legacyIds.some((value) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value))) {
        throw new ApiError(400, 'invalid_legacy_ids', 'legacyIds contain an unsafe reference.');
      }
      const legacyIdentityKeys = legacyIds.map((value) => value.toLowerCase());
      if (new Set(legacyIdentityKeys).size !== legacyIds.length) {
        throw new ApiError(400, 'invalid_legacy_ids', 'legacyIds must be unique without regard to case.');
      }
      const printingIds = input.printingIds == null ? [] : parseUniqueCanonicalVariantIds(
        input.printingIds,
        24,
        'printingIds must contain one or more unique canonical UUIDs.',
      );
      const ids = variantIds.length ? parseUniqueCanonicalVariantIds(
        variantIds, 24, 'variantIds must contain one or more unique canonical UUIDs.',
      ) : [];
      const selectorCount = Number(ids.length > 0) + Number(printingIds.length > 0) + Number(legacyIds.length > 0);
      if (selectorCount !== 1) {
        throw new ApiError(400, 'invalid_snapshot_selector', 'Supply exactly one of variantIds, printingIds or legacyIds.');
      }
      if (normalizeCurrency(input.currency) !== 'GBP') {
        throw new ApiError(422, 'unsupported_snapshot_currency', 'Legacy price snapshots are published only in GBP.');
      }
      const rangeDays = parseSnapshotRangeDays(input.rangeDays);
      if (input.latestOnly != null && input.latestOnly !== true && input.latestOnly !== '1') {
        throw new ApiError(400, 'invalid_latest_only', 'latestOnly must be 1 when supplied.');
      }
      const requestedLatestOnly = input.latestOnly === true || input.latestOnly === '1';
      if (rangeDays && requestedLatestOnly) {
        throw new ApiError(400, 'incompatible_snapshot_query', 'latestOnly cannot be combined with rangeDays.');
      }
      const latestOnly = requestedLatestOnly;
      if (legacyIds.length > 24) throw new ApiError(400, 'too_many_legacy_ids', 'At most 24 legacyIds may be requested at once.');
      const legacySetId = clean(input.legacySetId);
      const legacyLanguage = clean(input.language)?.toLowerCase();
      if (!legacyIds.length && (legacySetId || legacyLanguage)) {
        throw new ApiError(400, 'legacy_scope_without_ids', 'legacySetId and language require legacyIds.');
      }
      if (legacyIds.length && (!latestOnly || !legacySetId || !legacyLanguage)) {
        throw new ApiError(400, 'legacy_ids_require_scoped_latest_only', 'legacyIds require latestOnly, legacySetId and language.');
      }
      if (legacyIds.length && (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(legacySetId)
        || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(legacyLanguage))) {
        throw new ApiError(400, 'invalid_legacy_scope', 'legacySetId and language must be safe scoped references.');
      }
      if (printingIds.length && !latestOnly) {
        throw new ApiError(400, 'printing_ids_require_latest_only', 'printingIds require latestOnly.');
      }
      const limit = rangeDays === 7 ? 338 : rangeDays === 30 ? 32 : parseLimit(input.limit, 72, 120);
      if (legacyIds.length) {
        const legacySnapshots = [...(await latestLegacySnapshotItems(supabase, legacyIds, legacySetId, legacyLanguage)).values()]
          .map((item) => ({
            cardId: item.legacyReference,
            legacySetId: item.legacySetId,
            languageCode: item.languageCode,
            marketCentral: item.marketCentral,
            currency: item.currency,
            calculatedAt: item.calculatedAt,
            snapshotAt: item.snapshotAt,
            priceType: item.priceType,
            freshness: item.freshness,
            staleAfter: item.staleAfter ?? null,
            primarySource: item.primarySource ?? null,
            priceBasis: item.priceBasis ?? 'unknown_or_mixed_normalisation',
            quoteScope: 'printing_level',
          }));
        return { snapshots: [], legacySnapshots, limit: 1 };
      }
      const exactLatest = latestOnly ? await latestExactSnapshotItems(supabase, ids, printingIds) : new Map();
      if (latestOnly) return { snapshots: [...exactLatest.values()], limit: 1 };
      const unresolvedIds = ids;
      const resolved = await Promise.all(unresolvedIds.map(async (id) => ({
        id,
        ...(await resolveSnapshotIdentity(supabase, id)),
      })));
      const cardIds = [...new Set(resolved.flatMap((entry) => entry.cardIds))];
      if (!cardIds.length) return { snapshots: [...exactLatest.values()], limit, ...(rangeDays ? { rangeDays } : {}) };
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
      const perVariant = new Map(unresolvedIds.map((id) => [id, new Map()]));
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
      const snapshots = [
        ...exactLatest.values(),
        ...[...perVariant.values()].flatMap((items) => [...items.values()]
          .sort((left, right) => Date.parse(right.snapshotAt) - Date.parse(left.snapshotAt))
          .slice(0, rangeDays ? limit + 1 : limit)),
      ].sort((left, right) => Date.parse(right.snapshotAt) - Date.parse(left.snapshotAt));
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
