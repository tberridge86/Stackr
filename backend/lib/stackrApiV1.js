import { createHash, randomUUID } from 'node:crypto';

export const STACKR_API_V1 = '1';
export const DEFAULT_CATALOGUE_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
export const NO_STORE_CACHE_CONTROL = 'no-store';
export const SUPPORTED_LANGUAGE_CODES = ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXACT_NAME_TYPES = new Set(['native', 'english_display']);
const ALIAS_NAME_TYPES = new Set(['alias', 'translated', 'search_normalized']);

export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function normalizeSearchText(value = '') {
  return String(value ?? '')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/pok\u00e9mon/g, 'pokemon')
    .replace(/[\u2019\u2018`\u00b4]/g, "'")
    .replace(/([a-z])'s\b/g, '$1s')
    .replace(/'/g, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCollectorNumber(value = '') {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .split('/')
    .map((part) => part.replace(/(^|[^0-9])0+(?=\d)/g, '$1').replace(/^0+(?=\d)/, ''))
    .join('/');
}

export function collectorMatches(candidate, query) {
  const left = normalizeCollectorNumber(candidate);
  const right = normalizeCollectorNumber(query);
  if (!left || !right) return false;
  if (left === right) return true;
  if (!right.includes('/')) return left.split('/')[0] === right;
  return false;
}

export function isUuid(value) {
  return UUID_PATTERN.test(String(value ?? '').trim());
}

export function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

export function parseLimit(value, fallback = 50, max = 250) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new ApiError(400, 'invalid_limit', 'limit must be a positive integer.');
  }
  return Math.min(numeric, max);
}

export function parseCursor(value) {
  const cursor = clean(value);
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object') throw new Error('empty cursor');
    return decoded;
  } catch {
    throw new ApiError(400, 'invalid_cursor', 'cursor is not a valid Stackr pagination cursor.');
  }
}

export function encodeCursor(payload) {
  if (!payload) return null;
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function parseChangeSequence(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new ApiError(400, 'invalid_change_sequence', 'change sequence must be a non-negative integer.');
  }
  return numeric;
}

export function etagFor(payload) {
  const hash = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('base64url');
  return `"${hash}"`;
}

export function requestIdFrom(req) {
  return clean(req.headers['x-request-id']) ?? randomUUID();
}

export function matchesIfNoneMatch(req, etag) {
  const header = String(req.headers['if-none-match'] ?? '');
  return header
    .split(',')
    .map((part) => part.trim())
    .includes(etag);
}

export function parseSearchQuery(query = '') {
  const raw = String(query ?? '').normalize('NFKC').trim();
  const normalized = normalizeSearchText(raw);
  const tokens = raw.split(/\s+/).filter(Boolean);
  const compactTokens = normalized.split(/\s+/).filter(Boolean);
  const collectorToken = [...tokens]
    .reverse()
    .find((token) => /[0-9]/.test(token) && /^[\p{L}\p{N}./_-]+$/u.test(token));
  const setCollector = raw.match(/^([A-Za-z0-9._-]{2,20})\s+([\p{L}\p{N}./_-]*\d[\p{L}\p{N}./_-]*)$/u);

  return {
    raw,
    normalized,
    tokens,
    compactTokens,
    collectorNumber: collectorToken ? normalizeCollectorNumber(collectorToken) : null,
    setCode: setCollector ? setCollector[1] : null,
    setCollectorNumber: setCollector ? setCollector[2] : null,
  };
}

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

function applyLanguageFilter(query, language) {
  const value = clean(language);
  return value ? query.eq('language_code', value) : query;
}

function applyIdCursor(query, idColumn, cursor) {
  const decoded = parseCursor(cursor);
  if (decoded?.[idColumn]) return query.gt(idColumn, decoded[idColumn]);
  return query;
}

function pageFromRows(rows, limit, idColumn) {
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = page[page.length - 1];
  return {
    rows: page,
    pagination: {
      limit,
      nextCursor: hasMore && last?.[idColumn] ? encodeCursor({ [idColumn]: last[idColumn] }) : null,
    },
  };
}

function dedupeByVariant(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const key = row?.variant_id ?? row?.canonical_key ?? row?.printing_id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

export function toLanguage(row) {
  return {
    code: row.code,
    bcp47Code: row.bcp47_code,
    englishName: row.english_name,
    nativeName: row.native_name,
    scriptCode: row.script_code ?? null,
    sortOrder: row.sort_order ?? 100,
  };
}

export function toSeries(row) {
  return {
    seriesId: row.id,
    game: row.game_code,
    languageCode: row.language_code,
    nativeName: row.native_name,
    englishDisplayName: row.english_display_name ?? null,
    seriesCode: row.series_code ?? null,
    releaseDate: row.release_date ?? null,
    endDate: row.end_date ?? null,
    displayOrder: row.display_order ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function toSet(row) {
  return {
    setId: row.set_id ?? row.id,
    game: row.game_code,
    languageCode: row.language_code,
    language: row.language_english_name || row.language_native_name
      ? {
          englishName: row.language_english_name ?? null,
          nativeName: row.language_native_name ?? null,
        }
      : undefined,
    seriesId: row.series_id ?? null,
    seriesNativeName: row.series_native_name ?? null,
    seriesEnglishDisplayName: row.series_english_display_name ?? null,
    setCode: row.set_code ?? null,
    nativeName: row.native_name ?? row.set_native_name ?? null,
    englishDisplayName: row.english_display_name ?? row.set_english_display_name ?? null,
    releaseDate: row.release_date ?? null,
    printedTotal: row.printed_total ?? null,
    total: row.total ?? null,
    regionCode: row.region_code ?? null,
    updatedAt: row.updated_at ?? null,
    sourceUpdatedAt: row.source_updated_at ?? null,
  };
}

export function toVariant(row) {
  return {
    variantId: row.variant_id,
    canonicalId: row.canonical_key,
    variantCode: row.variant_code,
    variantLabel: row.variant_label ?? null,
    finishCode: row.finish_code ?? null,
    finishLabel: row.finish_label ?? null,
    artworkKey: row.artwork_key ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function toCardSummary(rows) {
  const row = rows[0];
  if (!row) return null;
  return {
    cardId: row.printing_id,
    game: row.game_code,
    languageCode: row.language_code,
    language: {
      englishName: row.language_english_name ?? null,
      nativeName: row.language_native_name ?? null,
    },
    set: {
      setId: row.set_id,
      setCode: row.set_code ?? null,
      nativeName: row.set_native_name ?? null,
      englishDisplayName: row.set_english_display_name ?? null,
    },
    collectorNumber: {
      value: row.collector_number,
      prefix: row.collector_number_prefix ?? null,
      sort: row.collector_number_sort ?? null,
      suffix: row.collector_number_suffix ?? null,
      sortKey: row.collector_number_sort_key ?? null,
    },
    names: {
      native: row.card_native_name,
      englishDisplay: row.card_english_display_name ?? null,
    },
    rarity: {
      code: row.rarity_code ?? null,
      label: row.rarity_label ?? null,
    },
    defaultVariantId: rows.find((candidate) => candidate.variant_code === 'normal')?.variant_id ?? row.variant_id,
    variants: rows.map(toVariant),
    updatedAt: row.changed_at ?? row.updated_at ?? null,
  };
}

export function groupCardRows(rows) {
  const byPrinting = new Map();
  for (const row of rows) {
    if (!byPrinting.has(row.printing_id)) byPrinting.set(row.printing_id, []);
    byPrinting.get(row.printing_id).push(row);
  }
  return [...byPrinting.values()].map(toCardSummary).filter(Boolean);
}

function toDeltaChange(row) {
  const changeType = row.change_type === 'deprecate' ? 'deprecation' : row.change_type;
  return {
    sequence: Number(row.change_sequence),
    operation: changeType,
    entityType: String(row.entity_table ?? '').replace(/_/g, '-'),
    entityId: row.entity_id ?? null,
    entityKey: row.entity_key ?? null,
    changedAt: row.changed_at,
    summary: row.public_change_summary ?? {},
  };
}

function toSearchResult(row, reason, extra = {}) {
  return {
    type: 'card',
    reason,
    cardId: row.printing_id,
    variantId: row.variant_id,
    canonicalId: row.canonical_key,
    setId: row.set_id,
    setCode: row.set_code ?? null,
    collectorNumber: row.collector_number,
    nativeName: row.card_native_name,
    englishDisplayName: row.card_english_display_name ?? null,
    languageCode: row.language_code,
    variantCode: row.variant_code,
    ...extra,
    card: toCardSummary([row]),
  };
}

function toSetSearchResult(row, reason, extra = {}) {
  return {
    type: 'set',
    reason,
    setId: row.set_id ?? row.id,
    setCode: row.set_code ?? null,
    nativeName: row.native_name,
    englishDisplayName: row.english_display_name ?? null,
    languageCode: row.language_code,
    ...extra,
    set: toSet(row),
  };
}

async function fetchCardRowsByVariants(supabase, variantIds) {
  const ids = [...new Set(variantIds.filter(Boolean))];
  if (!ids.length) return [];
  return queryRows(table(supabase, 'api', 'catalogue_cards')
    .select('*')
    .in('variant_id', ids)
    .limit(Math.max(ids.length, 1) * 4));
}

async function fetchCardRowsByPrintings(supabase, printingIds) {
  const ids = [...new Set(printingIds.filter(Boolean))];
  if (!ids.length) return [];
  return queryRows(table(supabase, 'api', 'catalogue_cards')
    .select('*')
    .in('printing_id', ids)
    .limit(Math.max(ids.length, 1) * 8));
}

async function fetchSetsByIds(supabase, setIds) {
  const ids = [...new Set(setIds.filter(Boolean))];
  if (!ids.length) return [];
  return queryRows(table(supabase, 'api', 'catalogue_sets')
    .select('*')
    .in('set_id', ids)
    .limit(ids.length));
}

async function fetchSetIdsByCode(supabase, setCode, language) {
  if (!setCode) return [];
  let query = table(supabase, 'api', 'catalogue_sets')
    .select('set_id,set_code,language_code')
    .ilike('set_code', setCode)
    .limit(25);
  query = applyLanguageFilter(query, language);
  const rows = await queryRows(query);
  return rows
    .filter((row) => normalizeSearchText(row.set_code) === normalizeSearchText(setCode))
    .map((row) => row.set_id);
}

function sortCardsForDisplay(rows) {
  return [...rows].sort((a, b) => {
    const left = a.collector_number_sort ?? Number.MAX_SAFE_INTEGER;
    const right = b.collector_number_sort ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return String(a.collector_number_sort_key ?? a.collector_number).localeCompare(String(b.collector_number_sort_key ?? b.collector_number));
  });
}

async function searchCanonicalId(supabase, parsed, limit) {
  const exact = [];
  if (parsed.raw) {
    exact.push(...await queryRows(table(supabase, 'api', 'catalogue_cards')
      .select('*')
      .eq('canonical_key', parsed.raw.toLowerCase())
      .limit(limit)));
  }
  if (isUuid(parsed.raw)) {
    exact.push(...await queryRows(table(supabase, 'api', 'catalogue_cards')
      .select('*')
      .eq('variant_id', parsed.raw)
      .limit(limit)));
    exact.push(...await queryRows(table(supabase, 'api', 'catalogue_cards')
      .select('*')
      .eq('printing_id', parsed.raw)
      .limit(limit)));
  }
  return dedupeByVariant(exact).slice(0, limit).map((row) => toSearchResult(row, 'exact_canonical_id'));
}

async function searchExternalId(supabase, parsed, limit, language) {
  let query = table(supabase, 'api', 'catalogue_external_identifiers')
    .select('source_entity_type,external_id,language_code,set_id,printing_id,variant_id,confidence')
    .eq('external_id', parsed.raw)
    .limit(limit);
  query = applyLanguageFilter(query, language);
  const identifiers = await queryRows(query);
  if (!identifiers.length) return [];

  const rows = [
    ...await fetchCardRowsByVariants(supabase, identifiers.map((item) => item.variant_id)),
    ...await fetchCardRowsByPrintings(supabase, identifiers.map((item) => item.printing_id)),
  ];
  const setRows = await fetchSetsByIds(supabase, identifiers.map((item) => item.set_id));
  return [
    ...dedupeByVariant(rows).map((row) => toSearchResult(row, 'exact_external_id')),
    ...setRows.map((row) => toSetSearchResult(row, 'exact_external_id')),
  ].slice(0, limit);
}

async function searchSetCodeCollector(supabase, parsed, limit, language) {
  if (!parsed.setCode || !parsed.setCollectorNumber) return [];
  const setIds = await fetchSetIdsByCode(supabase, parsed.setCode, language);
  if (!setIds.length) return [];
  let query = table(supabase, 'api', 'catalogue_cards')
    .select('*')
    .in('set_id', setIds)
    .limit(Math.max(limit * 8, 80));
  query = applyLanguageFilter(query, language);
  const rows = await queryRows(query);
  return dedupeByVariant(rows)
    .filter((row) => collectorMatches(row.collector_number, parsed.setCollectorNumber))
    .slice(0, limit)
    .map((row) => toSearchResult(row, 'exact_set_code_collector_number', { matchedSetCode: parsed.setCode }));
}

async function searchCollectorNumber(supabase, parsed, limit, language, selectedSetId) {
  const collector = parsed.collectorNumber;
  if (!collector) return [];
  let exactQuery = table(supabase, 'api', 'catalogue_cards')
    .select('*')
    .eq('collector_number', parsed.setCollectorNumber ?? parsed.raw)
    .limit(Math.max(limit * 4, 80));
  exactQuery = applyLanguageFilter(exactQuery, language);
  if (selectedSetId) exactQuery = exactQuery.eq('set_id', selectedSetId);

  const exactRows = await queryRows(exactQuery);
  if (exactRows.length) {
    return dedupeByVariant(exactRows)
      .filter((row) => collectorMatches(row.collector_number, collector))
      .slice(0, limit)
      .map((row) => toSearchResult(row, selectedSetId ? 'exact_collector_number_in_set' : 'exact_collector_number'));
  }

  let query = table(supabase, 'api', 'catalogue_cards')
    .select('*')
    .limit(Math.max(limit * 10, 120));
  query = applyLanguageFilter(query, language);
  if (selectedSetId) query = query.eq('set_id', selectedSetId);
  const rows = await queryRows(query);
  return dedupeByVariant(rows)
    .filter((row) => collectorMatches(row.collector_number, collector))
    .slice(0, limit)
    .map((row) => toSearchResult(row, selectedSetId ? 'exact_collector_number_in_set' : 'exact_collector_number'));
}

async function searchNames(supabase, parsed, limit, language, types, reasonForType) {
  if (!parsed.normalized) return [];
  let namesQuery = table(supabase, 'api', 'catalogue_card_names')
    .select('name_type,name,normalized_name,printing_id,variant_id')
    .eq('normalized_name', parsed.normalized)
    .in('name_type', [...types])
    .limit(Math.max(limit * 4, 80));
  namesQuery = applyLanguageFilter(namesQuery, language);
  const names = await queryRows(namesQuery);
  if (!names.length) return [];
  const rows = [
    ...await fetchCardRowsByVariants(supabase, names.map((name) => name.variant_id)),
    ...await fetchCardRowsByPrintings(supabase, names.map((name) => name.printing_id)),
  ];
  return dedupeByVariant(rows).slice(0, limit).map((row) => {
    const match = names.find((name) => name.variant_id === row.variant_id || name.printing_id === row.printing_id);
    return toSearchResult(row, reasonForType(match?.name_type), {
      matchedName: match?.name ?? null,
      matchedNameType: match?.name_type ?? null,
    });
  });
}

async function searchNameWithSetCode(supabase, parsed, limit, language) {
  if (parsed.compactTokens.length < 2) return [];
  const results = [];
  for (let index = 0; index < parsed.tokens.length; index += 1) {
    const setCode = parsed.tokens[index];
    if (!/[0-9]/.test(setCode) || setCode.length > 20) continue;
    const nameQuery = normalizeSearchText(parsed.tokens.filter((_, tokenIndex) => tokenIndex !== index).join(' '));
    if (!nameQuery) continue;
    const setIds = await fetchSetIdsByCode(supabase, setCode, language);
    if (!setIds.length) continue;
    let namesQuery = table(supabase, 'api', 'catalogue_card_names')
      .select('name_type,name,normalized_name,printing_id,variant_id')
      .eq('normalized_name', nameQuery)
      .in('name_type', [...EXACT_NAME_TYPES, ...ALIAS_NAME_TYPES])
      .limit(Math.max(limit * 4, 80));
    namesQuery = applyLanguageFilter(namesQuery, language);
    const names = await queryRows(namesQuery);
    const rows = [
      ...await fetchCardRowsByVariants(supabase, names.map((name) => name.variant_id)),
      ...await fetchCardRowsByPrintings(supabase, names.map((name) => name.printing_id)),
    ];
    results.push(...dedupeByVariant(rows)
      .filter((row) => setIds.includes(row.set_id))
      .map((row) => toSearchResult(row, 'exact_name_in_set', { matchedSetCode: setCode })));
  }
  return dedupeByVariant(results).slice(0, limit);
}

async function searchFuzzyName(supabase, parsed, limit, language) {
  if (!parsed.normalized || parsed.normalized.length < 2) return [];
  const safe = parsed.normalized.replace(/[%_]/g, ' ').replace(/\s+/g, '%');
  let namesQuery = table(supabase, 'api', 'catalogue_card_names')
    .select('name_type,name,normalized_name,printing_id,variant_id')
    .ilike('normalized_name', `%${safe}%`)
    .limit(Math.max(limit * 6, 120));
  namesQuery = applyLanguageFilter(namesQuery, language);
  const names = await queryRows(namesQuery);
  if (!names.length) return [];
  const rows = [
    ...await fetchCardRowsByVariants(supabase, names.map((name) => name.variant_id)),
    ...await fetchCardRowsByPrintings(supabase, names.map((name) => name.printing_id)),
  ];
  return dedupeByVariant(rows).slice(0, limit).map((row) => {
    const match = names.find((name) => name.variant_id === row.variant_id || name.printing_id === row.printing_id);
    return toSearchResult(row, 'fuzzy_name', {
      matchedName: match?.name ?? null,
      matchedNameType: match?.name_type ?? null,
    });
  });
}

export function searchFixtureCatalogue(query, fixture, options = {}) {
  const parsed = parseSearchQuery(query);
  const limit = parseLimit(options.limit, 20, 100);
  const selectedSetId = clean(options.setId);
  const language = clean(options.language);
  const cards = (fixture.cards ?? []).filter((card) => !language || card.languageCode === language);
  const names = fixture.names ?? [];
  const externals = fixture.externalIds ?? [];

  const byVariant = new Map(cards.map((card) => [card.variantId, card]));
  const byPrinting = new Map(cards.map((card) => [card.cardId, card]));
  const results = [];
  const push = (card, reason, extra = {}) => {
    if (!card || results.some((item) => item.variantId === card.variantId)) return;
    results.push({
      type: 'card',
      reason,
      cardId: card.cardId,
      variantId: card.variantId,
      canonicalId: card.canonicalId,
      setId: card.setId,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber,
      nativeName: card.nativeName,
      englishDisplayName: card.englishDisplayName,
      languageCode: card.languageCode,
      variantCode: card.variantCode,
      ...extra,
    });
  };

  for (const card of cards) {
    if (card.canonicalId === parsed.raw || card.variantId === parsed.raw || card.cardId === parsed.raw) {
      push(card, 'exact_canonical_id');
    }
  }
  if (results.length) return results.slice(0, limit);

  for (const external of externals) {
    if (external.externalId === parsed.raw) {
      push(byVariant.get(external.variantId) ?? byPrinting.get(external.cardId), 'exact_external_id');
    }
  }
  if (results.length) return results.slice(0, limit);

  if (parsed.setCode && parsed.setCollectorNumber) {
    for (const card of cards) {
      if (normalizeSearchText(card.setCode) === normalizeSearchText(parsed.setCode) &&
        collectorMatches(card.collectorNumber, parsed.setCollectorNumber)) {
        push(card, 'exact_set_code_collector_number');
      }
    }
  }
  if (results.length) return results.slice(0, limit);

  if (parsed.collectorNumber) {
    for (const card of cards) {
      if ((!selectedSetId || card.setId === selectedSetId) && collectorMatches(card.collectorNumber, parsed.collectorNumber)) {
        push(card, selectedSetId ? 'exact_collector_number_in_set' : 'exact_collector_number');
      }
    }
  }
  if (results.length) return results.slice(0, limit);

  for (const name of names.filter((item) => EXACT_NAME_TYPES.has(item.nameType))) {
    if (normalizeSearchText(name.name) === parsed.normalized) {
      push(byVariant.get(name.variantId) ?? byPrinting.get(name.cardId), 'exact_name', {
        matchedName: name.name,
        matchedNameType: name.nameType,
      });
    }
  }
  if (results.length) return results.slice(0, limit);

  for (const name of names.filter((item) => ALIAS_NAME_TYPES.has(item.nameType))) {
    if (normalizeSearchText(name.name) === parsed.normalized) {
      push(byVariant.get(name.variantId) ?? byPrinting.get(name.cardId), name.nameType === 'alias' ? 'exact_alias' : 'exact_translated_name', {
        matchedName: name.name,
        matchedNameType: name.nameType,
      });
    }
  }
  if (results.length) return results.slice(0, limit);

  for (const name of names) {
    if (normalizeSearchText(name.name).includes(parsed.normalized)) {
      push(byVariant.get(name.variantId) ?? byPrinting.get(name.cardId), 'fuzzy_name', {
        matchedName: name.name,
        matchedNameType: name.nameType,
      });
    }
  }
  return results.slice(0, limit);
}

export function createCatalogueV1Service(options) {
  const supabase = options.supabase;
  const assetBaseUrl = String(options.assetBaseUrl ?? process.env.STACKR_ASSET_BASE_URL ?? '').replace(/\/$/, '');
  const modelIndexVersion = clean(options.modelIndexVersion)
    ?? clean(process.env.STACKR_MODEL_INDEX_VERSION)
    ?? clean(process.env.SCANNER_PACK_ID)
    ?? 'en-clip-base-v1';
  const minCompatibleAppSchemaVersion = clean(options.minCompatibleAppSchemaVersion)
    ?? clean(process.env.STACKR_MIN_APP_SCHEMA_VERSION)
    ?? '1';

  return {
    async health() {
      return {
        status: 'ok',
        service: 'stackr-api',
        apiVersion: STACKR_API_V1,
        generatedAt: new Date().toISOString(),
      };
    },

    async ready() {
      try {
        const languages = await queryRows(table(supabase, 'api', 'catalogue_languages')
          .select('code')
          .limit(1));
        const latest = await queryMaybeOne(table(supabase, 'api', 'catalogue_delta_changes')
          .select('change_sequence')
          .order('change_sequence', { ascending: false })
          .limit(1)
          .maybeSingle());
        return {
          status: 'ready',
          checks: {
            supabase: 'ok',
            catalogueLanguages: languages.length,
            latestChangeSequence: Number(latest?.change_sequence ?? 0),
          },
          generatedAt: new Date().toISOString(),
        };
      } catch {
        throw new ApiError(503, 'service_not_ready', 'Stackr API dependencies are not ready.', {
          dependency: 'supabase',
        });
      }
    },

    async manifest() {
      const [versions, latest, languages] = await Promise.all([
        queryRows(table(supabase, 'api', 'published_catalogue_versions')
          .select('id,version_key,version_label,language_code,min_change_sequence,max_change_sequence,published_at,updated_at,language_sort_order')
          .order('language_sort_order', { ascending: true })
          .order('language_code', { ascending: true })),
        queryMaybeOne(table(supabase, 'api', 'catalogue_delta_changes')
          .select('change_sequence')
          .order('change_sequence', { ascending: false })
          .limit(1)
          .maybeSingle()),
        queryRows(table(supabase, 'api', 'catalogue_languages')
          .select('code,bcp47_code,english_name,native_name,script_code,sort_order')
          .order('sort_order', { ascending: true })),
      ]);
      const currentCatalogueVersion = versions.length
        ? versions.map((version) => version.version_key).join('|')
        : 'bootstrap';
      const latestVersion = versions[versions.length - 1] ?? null;

      const body = {
        currentCatalogueVersion,
        catalogueVersionId: latestVersion?.id ?? null,
        minCompatibleAppSchemaVersion,
        latestChangeSequence: Number(latest?.change_sequence ?? latestVersion?.max_change_sequence ?? 0),
        availableLanguageShards: languages.map((language) => {
          const languageVersion = versions.find((version) => version.language_code === language.code);
          return {
            languageCode: language.code,
            bcp47Code: language.bcp47_code,
            nativeName: language.native_name,
            englishName: language.english_name,
            catalogueVersion: languageVersion?.version_key ?? null,
            catalogueVersionId: languageVersion?.id ?? null,
            shardPath: `/v1/sets?language=${encodeURIComponent(language.code)}`,
            deltaPath: `/v1/catalog/delta?language=${encodeURIComponent(language.code)}`,
          };
        }),
        assetBaseUrl: assetBaseUrl || null,
        modelIndexVersion,
        generatedAt: new Date().toISOString(),
      };
      return { ...body, etag: etagFor(body) };
    },

    async delta(input = {}) {
      const since = parseChangeSequence(input.since ?? input.sinceSequence, 0);
      const limit = parseLimit(input.limit, 100, 500);
      const cursor = parseCursor(input.cursor);
      const after = Math.max(since, Number(cursor?.changeSequence ?? 0));
      let query = table(supabase, 'api', 'catalogue_delta_changes')
        .select('*')
        .gt('change_sequence', after)
        .order('change_sequence', { ascending: true })
        .limit(limit + 1);
      const rows = await queryRows(query);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return {
        sinceChangeSequence: since,
        changes: page.map(toDeltaChange),
        pagination: {
          limit,
          nextCursor: rows.length > limit && last ? encodeCursor({ changeSequence: Number(last.change_sequence) }) : null,
        },
      };
    },

    async languages() {
      const rows = await queryRows(table(supabase, 'api', 'catalogue_languages')
        .select('code,bcp47_code,english_name,native_name,script_code,sort_order')
        .order('sort_order', { ascending: true }));
      return { languages: rows.map(toLanguage) };
    },

    async series(input = {}) {
      const limit = parseLimit(input.limit, 50, 250);
      let query = table(supabase, 'api', 'catalogue_series')
        .select('id,game_code,language_code,native_name,english_display_name,series_code,release_date,end_date,display_order,updated_at')
        .order('id', { ascending: true })
        .limit(limit + 1);
      query = applyLanguageFilter(query, input.language);
      if (clean(input.game)) query = query.eq('game_code', clean(input.game));
      query = applyIdCursor(query, 'id', input.cursor);
      const { rows, pagination } = pageFromRows(await queryRows(query), limit, 'id');
      return { series: rows.map(toSeries), pagination };
    },

    async sets(input = {}) {
      const limit = parseLimit(input.limit, 50, 250);
      let query = table(supabase, 'api', 'catalogue_sets')
        .select('*')
        .order('set_id', { ascending: true })
        .limit(limit + 1);
      query = applyLanguageFilter(query, input.language);
      if (clean(input.game)) query = query.eq('game_code', clean(input.game));
      if (clean(input.seriesId)) query = query.eq('series_id', clean(input.seriesId));
      if (clean(input.setCode)) query = query.ilike('set_code', clean(input.setCode));
      if (clean(input.region)) query = query.eq('region_code', clean(input.region));
      query = applyIdCursor(query, 'set_id', input.cursor);
      const { rows, pagination } = pageFromRows(await queryRows(query), limit, 'set_id');
      return { sets: rows.map(toSet), pagination };
    },

    async set(setId) {
      if (!isUuid(setId)) throw new ApiError(400, 'invalid_set_id', 'setId must be a canonical UUID.');
      const row = await queryMaybeOne(table(supabase, 'api', 'catalogue_sets')
        .select('*')
        .eq('set_id', setId)
        .maybeSingle());
      if (!row) throw new ApiError(404, 'set_not_found', 'Set was not found.');
      return { set: toSet(row) };
    },

    async setCards(setId, input = {}) {
      if (!isUuid(setId)) throw new ApiError(400, 'invalid_set_id', 'setId must be a canonical UUID.');
      const limit = parseLimit(input.limit, 120, 500);
      let query = table(supabase, 'api', 'catalogue_cards')
        .select('*')
        .eq('set_id', setId)
        .order('variant_id', { ascending: true })
        .limit(limit + 1);
      query = applyLanguageFilter(query, input.language);
      query = applyIdCursor(query, 'variant_id', input.cursor);
      const { rows, pagination } = pageFromRows(await queryRows(query), limit, 'variant_id');
      return { cards: groupCardRows(sortCardsForDisplay(rows)), pagination };
    },

    async card(cardId) {
      if (!isUuid(cardId)) throw new ApiError(400, 'invalid_card_id', 'cardId must be a canonical UUID.');
      let rows = await queryRows(table(supabase, 'api', 'catalogue_cards')
        .select('*')
        .eq('printing_id', cardId)
        .limit(50));
      if (!rows.length) {
        rows = await queryRows(table(supabase, 'api', 'catalogue_cards')
          .select('*')
          .eq('variant_id', cardId)
          .limit(50));
      }
      if (!rows.length) throw new ApiError(404, 'card_not_found', 'Card was not found.');
      return { card: toCardSummary(sortCardsForDisplay(rows)) };
    },

    async cardVariants(cardId) {
      const detail = await this.card(cardId);
      return {
        cardId: detail.card.cardId,
        variants: detail.card.variants,
      };
    },

    async assetManifest(input = {}) {
      const limit = parseLimit(input.limit, 250, 1000);
      let query = table(supabase, 'api', 'asset_manifest')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit + 1);
      if (clean(input.assetType)) query = query.eq('asset_type', clean(input.assetType));
      if (clean(input.setId)) query = query.eq('set_id', clean(input.setId));
      if (clean(input.printingId)) query = query.eq('printing_id', clean(input.printingId));
      if (clean(input.variantId)) query = query.eq('variant_id', clean(input.variantId));
      const rows = await queryRows(query);
      return {
        assets: rows.slice(0, limit).map((row) => ({
          assetId: row.asset_id,
          assetType: row.asset_type,
          game: row.game_code ?? null,
          setId: row.set_id ?? null,
          cardId: row.printing_id ?? null,
          variantId: row.variant_id ?? null,
          deliveryPath: row.storage_key ?? null,
          deliveryUrl: assetBaseUrl && row.storage_key ? `${assetBaseUrl}/${row.storage_key}` : row.external_url ?? null,
          sourceAttribution: row.source_attribution ?? null,
          permissionStatus: row.permission_status,
          contentSha256: row.content_sha256 ?? null,
          perceptualHash: row.perceptual_hash ?? null,
          mimeType: row.mime_type ?? null,
          width: row.width ?? null,
          height: row.height ?? null,
          byteSize: row.byte_size ?? null,
          derivatives: row.derivative_list ?? [],
          cacheControl: row.cache_control ?? null,
          externallyReferenced: row.externally_referenced ?? false,
          unavailableReason: row.unavailable_reason ?? null,
          lastVerifiedAt: row.last_verified_at ?? null,
          updatedAt: row.updated_at ?? null,
        })),
        pagination: {
          limit,
          nextCursor: null,
        },
      };
    },

    async search(input = {}) {
      const q = clean(input.q ?? input.query);
      if (!q || q.length < 2) throw new ApiError(400, 'invalid_search_query', 'Search query must contain at least two characters.');
      if (q.length > 160) throw new ApiError(400, 'invalid_search_query', 'Search query is too long.');
      const limit = parseLimit(input.limit, 20, 100);
      const language = clean(input.language);
      if (language && !SUPPORTED_LANGUAGE_CODES.includes(language)) {
        throw new ApiError(400, 'invalid_language', 'Unsupported catalogue language.');
      }
      const selectedSetId = clean(input.setId);
      if (selectedSetId && !isUuid(selectedSetId)) throw new ApiError(400, 'invalid_set_id', 'setId must be a canonical UUID.');
      const parsed = parseSearchQuery(q);

      const strategies = [
        () => searchCanonicalId(supabase, parsed, limit),
        () => searchExternalId(supabase, parsed, limit, language),
        () => searchSetCodeCollector(supabase, parsed, limit, language),
        () => searchCollectorNumber(supabase, parsed, limit, language, selectedSetId),
        () => searchNameWithSetCode(supabase, parsed, limit, language),
        () => searchNames(supabase, parsed, limit, language, EXACT_NAME_TYPES, () => 'exact_name'),
        () => searchNames(supabase, parsed, limit, language, ALIAS_NAME_TYPES, (type) => type === 'alias' ? 'exact_alias' : 'exact_translated_name'),
        () => searchFuzzyName(supabase, parsed, limit, language),
      ];

      for (const strategy of strategies) {
        const results = await strategy();
        if (results.length) {
          return {
            query: q,
            normalizedQuery: parsed.normalized,
            results,
            pagination: { limit, nextCursor: null },
          };
        }
      }

      return {
        query: q,
        normalizedQuery: parsed.normalized,
        results: [],
        pagination: { limit, nextCursor: null },
      };
    },
  };
}
