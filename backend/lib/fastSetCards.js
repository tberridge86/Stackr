import {
  ApiError,
  SUPPORTED_LANGUAGE_CODES,
  encodeCursor,
  groupCardRows,
  isUuid,
  parseCursor,
  parseLimit,
  toCatalogueAsset,
} from './stackrApiV1.js';
import { correctedCatalogueSetId, CORRECTION_LANGUAGE } from './catalogueLanguageCorrections.js';
import { readCatalogueQuery } from './traceContext.js';
import { createPublicAssetStorageReaders } from './objectStorage.js';

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function sortCardsForDisplay(rows) {
  return [...rows].sort((a, b) => {
    const left = a.collector_number_sort ?? Number.MAX_SAFE_INTEGER;
    const right = b.collector_number_sort ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return String(a.collector_number_sort_key ?? a.collector_number ?? '')
      .localeCompare(String(b.collector_number_sort_key ?? b.collector_number ?? ''));
  });
}

function assetOptions(supabase) {
  const r2Configured = Boolean(clean(process.env.STACKR_R2_BUCKET) || clean(process.env.STACKR_R2_PUBLIC_BASE_URL));
  return {
    assetBaseUrl: String(process.env.STACKR_ASSET_BASE_URL ?? '').replace(/\/$/, ''),
    supabaseUrl: String(process.env.SUPABASE_URL ?? '').replace(/\/$/, ''),
    r2Configured,
    assetStorageReaders: r2Configured ? createPublicAssetStorageReaders(supabase) : null,
  };
}

function shouldIncludeAssets(value) {
  if (value == null || value === '') return true;
  if (value === false || value === 0) return false;
  const normalized = String(value).trim().toLowerCase();
  return !['false', '0', 'no', 'off'].includes(normalized);
}

function paginationFromRows(bundleRows, rawRows, limit) {
  const last = rawRows.at(-1);
  return {
    limit,
    nextCursor: bundleRows.length > limit && last?.variant_id
      ? encodeCursor({ variant_id: last.variant_id })
      : null,
  };
}

async function fetchFactRows(supabase, setId, language, afterVariantId, limit, options) {
  let catalogueVersionId = clean(options.catalogueVersionId);
  if (!catalogueVersionId) {
    const { data: publishedSet, error } = await readCatalogueQuery(supabase.schema('api')
      .from('catalogue_sets')
      .select('catalogue_version_id')
      .eq('set_id', setId)
      .maybeSingle());
    if (error) throw error;
    if (!publishedSet) return { cards: [], pagination: { limit, nextCursor: null } };
    catalogueVersionId = clean(publishedSet.catalogue_version_id);
  }
  if (!isUuid(catalogueVersionId)) {
    throw new ApiError(502, 'catalogue_version_unavailable', 'The published set catalogue version is unavailable.');
  }
  // Keep the facts path as narrowly scoped as the canonical set-card read.
  // Otherwise Postgres can walk every published version's variants first.
  let query = supabase
    .schema('api')
    .from('catalogue_cards')
    .select('*')
    .eq('set_id', setId)
    .eq('catalogue_version_id', catalogueVersionId)
    .order('variant_id', { ascending: true })
    .limit(limit + 1);
  if (language) query = query.eq('language_code', language);
  if (afterVariantId) query = query.gt('variant_id', afterVariantId);

  const { data, error } = await readCatalogueQuery(query);
  if (error) throw error;

  const bundleRows = Array.isArray(data) ? data : [];
  const rawRows = bundleRows.slice(0, limit);
  return {
    cards: groupCardRows(sortCardsForDisplay(rawRows)),
    pagination: paginationFromRows(bundleRows, rawRows, limit),
  };
}

/**
 * Fetches one published set page, resolving its published version for facts.
 * Binder first paint can request facts only (includeAssets=false), while existing
 * consumers retain the preferred-artwork response by default.
 */
export async function fetchFastSetCards(supabase, setId, input = {}, options = {}) {
  if (!isUuid(setId)) throw new ApiError(400, 'invalid_set_id', 'setId must be a canonical UUID.');
  const targetSetId = correctedCatalogueSetId(setId);
  const isLanguageCorrection = targetSetId !== setId;
  setId = targetSetId;
  const limit = parseLimit(input.limit, 120, 500);
  const language = isLanguageCorrection ? CORRECTION_LANGUAGE : clean(input.language);
  if (language && !SUPPORTED_LANGUAGE_CODES.includes(language)) {
    throw new ApiError(400, 'invalid_language', 'Unsupported catalogue language.');
  }
  const cursor = parseCursor(input.cursor);
  const afterVariantId = clean(cursor?.variant_id);
  if (afterVariantId && !isUuid(afterVariantId)) {
    throw new ApiError(400, 'invalid_cursor', 'cursor is not a valid Stackr pagination cursor.');
  }

  if (isLanguageCorrection) {
    const { data: publishedSet, error } = await readCatalogueQuery(supabase.schema('api')
      .from('catalogue_sets').select('catalogue_version_id,language_code')
      .eq('set_id', setId).maybeSingle());
    if (error) throw error;
    if (!publishedSet || publishedSet.language_code !== CORRECTION_LANGUAGE) {
      throw new ApiError(502, 'invalid_language_correction', 'The reviewed correction target is unavailable.');
    }
    options = { ...options, catalogueVersionId: publishedSet.catalogue_version_id };
  }

  const verifyCorrectedCards = (cards) => {
    if (isLanguageCorrection && cards.some((card) => card.languageCode !== CORRECTION_LANGUAGE || card.set?.setId !== setId)) {
      throw new ApiError(502, 'invalid_language_correction', 'The reviewed correction target is unavailable.');
    }
  };

  if (!shouldIncludeAssets(input.includeAssets)) {
    const result = await fetchFactRows(supabase, setId, language, afterVariantId, limit, options);
    verifyCorrectedCards(result.cards);
    return result;
  }

  // Resolve the same provider/bucket routing as card-detail and manifest reads.
  // Facts-only requests above do not depend on optional image configuration.
  const assetUrlOptions = assetOptions(supabase);
  const { data, error } = await readCatalogueQuery(supabase.schema('api').rpc('catalogue_set_card_rows', {
    p_set_id: setId,
    p_language_code: language,
    p_after_variant_id: afterVariantId,
    p_limit: limit,
  }));
  if (error) throw error;

  const bundleRows = Array.isArray(data) ? data : [];
  const pageRows = bundleRows.slice(0, limit);
  const rawRows = pageRows.map((entry) => entry?.card_row).filter(Boolean);
  const imageByVariant = new Map();
  for (const entry of pageRows) {
    const sourceVariantId = clean(entry?.card_row?.variant_id);
    if (sourceVariantId && entry?.image_row) imageByVariant.set(sourceVariantId, entry.image_row);
  }

  const cards = groupCardRows(sortCardsForDisplay(rawRows)).map((card) => ({
    ...card,
    variants: card.variants.map((variant) => {
      const imageRow = imageByVariant.get(variant.variantId);
      return {
        ...variant,
        image: imageRow ? toCatalogueAsset(imageRow, assetUrlOptions) : null,
      };
    }),
  }));
  verifyCorrectedCards(cards);

  return {
    cards,
    pagination: paginationFromRows(bundleRows, rawRows, limit),
  };
}
