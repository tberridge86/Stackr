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

function assetOptions() {
  return {
    assetBaseUrl: String(process.env.STACKR_ASSET_BASE_URL ?? '').replace(/\/$/, ''),
    supabaseUrl: String(process.env.SUPABASE_URL ?? '').replace(/\/$/, ''),
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

async function fetchFactRows(supabase, setId, language, afterVariantId, limit) {
  let query = supabase
    .schema('api')
    .from('catalogue_cards')
    .select('*')
    .eq('set_id', setId)
    .order('variant_id', { ascending: true })
    .limit(limit + 1);
  if (language) query = query.eq('language_code', language);
  if (afterVariantId) query = query.gt('variant_id', afterVariantId);

  const { data, error } = await query;
  if (error) throw error;

  const bundleRows = Array.isArray(data) ? data : [];
  const rawRows = bundleRows.slice(0, limit);
  return {
    cards: groupCardRows(sortCardsForDisplay(rawRows)),
    pagination: paginationFromRows(bundleRows, rawRows, limit),
  };
}

/**
 * Fetches one published set page through a single PostgREST request.
 * Binder first paint can request facts only (includeAssets=false), while existing
 * consumers retain the preferred-artwork response by default.
 */
export async function fetchFastSetCards(supabase, setId, input = {}) {
  if (!isUuid(setId)) throw new ApiError(400, 'invalid_set_id', 'setId must be a canonical UUID.');
  const limit = parseLimit(input.limit, 120, 500);
  const language = clean(input.language);
  if (language && !SUPPORTED_LANGUAGE_CODES.includes(language)) {
    throw new ApiError(400, 'invalid_language', 'Unsupported catalogue language.');
  }
  const cursor = parseCursor(input.cursor);
  const afterVariantId = clean(cursor?.variant_id);
  if (afterVariantId && !isUuid(afterVariantId)) {
    throw new ApiError(400, 'invalid_cursor', 'cursor is not a valid Stackr pagination cursor.');
  }

  if (!shouldIncludeAssets(input.includeAssets)) {
    return fetchFactRows(supabase, setId, language, afterVariantId, limit);
  }

  const { data, error } = await supabase.schema('api').rpc('catalogue_set_card_rows', {
    p_set_id: setId,
    p_language_code: language,
    p_after_variant_id: afterVariantId,
    p_limit: limit,
  });
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
        image: imageRow ? toCatalogueAsset(imageRow, assetOptions()) : null,
      };
    }),
  }));

  return {
    cards,
    pagination: paginationFromRows(bundleRows, rawRows, limit),
  };
}
