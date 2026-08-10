import {
  getEnglishCardDisplayName,
  getEnglishSetDisplayName,
  getPreferredSetDisplayName,
} from './cardDisplayNames.js';

const TCGDEX_BASE_URL = process.env.TCGDEX_API_BASE_URL || 'https://api.tcgdex.net/v2';
const TCGDEX_TIMEOUT_MS = Number(process.env.TCGDEX_TIMEOUT_MS || 9000);
const TCGDEX_PAGE_SIZE = Number(process.env.TCGDEX_PAGE_SIZE || 250);
const TCGDEX_MAX_PAGES = Number(process.env.TCGDEX_MAX_PAGES || 80);
const TCGDEX_CARD_DETAIL_BATCH_SIZE = Number(process.env.TCGDEX_CARD_DETAIL_BATCH_SIZE || 12);

const JAPANESE_LANGUAGE = 'ja';
const JAPANESE_REGION = 'JP';
const TCGDEX_PROVIDER = 'tcgdex';
const PRODUCT_CANDIDATE_PROVIDER = 'stackr_japanese_product_candidates';

export const JAPANESE_PRODUCT_TYPES = [
  'booster_pack',
  'booster_box',
  'booster_bundle',
  'elite_trainer_box',
  'pokemon_center_elite_trainer_box',
  'collection_box',
  'special_collection',
  'premium_collection',
  'starter_deck',
  'theme_deck',
  'deck_build_box',
  'high_class_pack',
  'special_set',
  'promo_pack',
  'blister',
  'tin',
  'display',
  'case',
  'other',
];

export const JAPANESE_PROVIDER_CAPABILITIES = [
  {
    provider: 'tcgdex',
    cards: 'high for metadata, provider-limited for images',
    sets: 'high',
    series: 'high',
    sealedProducts: 'not supplied directly',
    prices: 'cardmarket/tcgplayer fields where present; not a sealed-product price provider',
  },
  {
    provider: 'stackr_japanese_product_candidates',
    cards: 'none',
    sets: 'set-linked only',
    series: 'none',
    sealedProducts: 'low-confidence candidates for admin review',
    prices: 'none',
  },
];

function cleanValue(value) {
  return String(value ?? '').trim();
}

function stackrId(language, sourceId) {
  const clean = cleanValue(sourceId);
  return language === 'en' ? clean : `${language}:${clean}`;
}

function stripLanguagePrefix(value, language = JAPANESE_LANGUAGE) {
  const clean = cleanValue(value);
  const prefix = `${language}:`;
  return clean.toLowerCase().startsWith(prefix) ? clean.slice(prefix.length) : clean;
}

function withWebpAsset(url, size = 'high') {
  if (!url) return null;
  const value = String(url).trim();
  if (/\.(webp|png|jpe?g)(?:[?#].*)?$/i.test(value)) return value;
  return `${value.replace(/\/$/, '')}/${size}.webp`;
}

function withSetWebpAsset(url) {
  if (!url) return null;
  const value = String(url).trim();
  if (/\.(webp|png|jpe?g)(?:[?#].*)?$/i.test(value)) return value;
  return `${value.replace(/\/$/, '')}.webp`;
}

function buildJapaneseSetDisplayNames(set, sourceId, id) {
  const localName = set?.name ?? sourceId;
  const englishDisplayName = getEnglishSetDisplayName({
    id,
    sourceId,
    setCode: sourceId,
    language: JAPANESE_LANGUAGE,
    region: JAPANESE_REGION,
    localName,
    canonicalName: localName,
    raw: set,
  });
  const displayName = getPreferredSetDisplayName({
    id,
    sourceId,
    setCode: sourceId,
    language: JAPANESE_LANGUAGE,
    region: JAPANESE_REGION,
    localName,
    englishDisplayName,
    canonicalName: localName,
    raw: set,
  });
  return { localName, englishDisplayName, displayName };
}

function normaliseSearchText(value = '') {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/pokemon|pok[e\u00e9]mon/g, 'pokemon')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildTcgdexUrl(path, params = {}) {
  const url = new URL(`${TCGDEX_BASE_URL.replace(/\/$/, '')}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).length) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function fetchTcgdexJson(path, params = {}) {
  const url = buildTcgdexUrl(path, params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TCGDEX_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`TCGdex request failed (${response.status}): ${text.slice(0, 240)}`);
    }
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTcgdexPagedArray(path, params = {}) {
  const rows = [];

  for (let page = 1; page <= TCGDEX_MAX_PAGES; page += 1) {
    const pageRows = await fetchTcgdexJson(path, {
      ...params,
      'pagination:page': page,
      'pagination:itemsPerPage': TCGDEX_PAGE_SIZE,
    });
    const list = Array.isArray(pageRows) ? pageRows : [];
    rows.push(...list);
    if (list.length < TCGDEX_PAGE_SIZE) break;
  }

  return rows;
}

function completenessFromFields(fields) {
  const available = fields.filter((field) => field !== null && field !== undefined && String(field).length > 0).length;
  if (available === fields.length) return 'high';
  if (available >= Math.ceil(fields.length * 0.66)) return 'medium';
  if (available > 0) return 'low';
  return 'unavailable';
}

function imageStatus(small, large) {
  if (small && large) return 'high';
  if (small || large) return 'medium';
  return 'unavailable';
}

function mapSeriesRow(series, displayOrder = null) {
  const id = stackrId(JAPANESE_LANGUAGE, series.id);
  return {
    id,
    game: 'pokemon',
    region: JAPANESE_REGION,
    language: JAPANESE_LANGUAGE,
    canonical_name: series.name ?? series.id,
    local_name: series.name ?? null,
    source_provider: TCGDEX_PROVIDER,
    source_id: series.id,
    display_order: displayOrder,
    raw_payload: series ?? {},
    updated_at: new Date().toISOString(),
  };
}

function mapSetRow(set, seriesId = null) {
  const sourceId = stripLanguagePrefix(set.id);
  const id = stackrId(JAPANESE_LANGUAGE, sourceId);
  const { localName, englishDisplayName, displayName } = buildJapaneseSetDisplayNames(set, sourceId, id);
  const printedTotal = toNumberOrNull(set.cardCount?.official);
  const actualTotal = toNumberOrNull(set.cardCount?.total ?? set.cards?.length);
  const logo = set.logo ? withSetWebpAsset(set.logo) : null;
  const symbol = set.symbol ? withSetWebpAsset(set.symbol) : null;
  const rawPayload = {
    ...(set ?? {}),
    language: JAPANESE_LANGUAGE,
    region: JAPANESE_REGION,
    local_name: localName,
    english_display_name: englishDisplayName,
    display_name: displayName,
  };

  return {
    id,
    series_id: seriesId ? stackrId(JAPANESE_LANGUAGE, stripLanguagePrefix(seriesId)) : set.serie?.id ? stackrId(JAPANESE_LANGUAGE, set.serie.id) : null,
    region: JAPANESE_REGION,
    language: JAPANESE_LANGUAGE,
    canonical_name: set.name ?? sourceId,
    local_name: localName,
    english_display_name: englishDisplayName,
    set_code: sourceId,
    printed_total: printedTotal,
    actual_total: actualTotal,
    release_date: set.releaseDate ?? null,
    symbol_url: symbol,
    logo_url: logo,
    source_provider: TCGDEX_PROVIDER,
    source_id: sourceId,
    data_completeness: completenessFromFields([sourceId, set.name, printedTotal ?? actualTotal]),
    image_completeness: imageStatus(symbol, logo),
    last_synced_at: new Date().toISOString(),
    raw_payload: rawPayload,
    updated_at: new Date().toISOString(),
  };
}

function mapLegacySetRow(set, seriesId = null) {
  const canonical = mapSetRow(set, seriesId);
  return {
    id: canonical.id,
    name: canonical.english_display_name ?? canonical.raw_payload?.display_name ?? canonical.local_name ?? canonical.source_id,
    series: set.serie?.name ?? set.serie?.id ?? seriesId ?? '',
    printed_total: canonical.printed_total ?? 0,
    total: canonical.actual_total ?? canonical.printed_total ?? 0,
    release_date: canonical.release_date,
    symbol_url: canonical.symbol_url,
    logo_url: canonical.logo_url,
    language: JAPANESE_LANGUAGE,
    region: JAPANESE_REGION,
    external_ids: {
      tcgdex: canonical.source_id,
      setCode: canonical.set_code,
    },
    raw_data: canonical.raw_payload,
  };
}

function mapCardRow(card, fallbackSet) {
  const sourceId = stripLanguagePrefix(card.id);
  const setSourceId = stripLanguagePrefix(card.set?.id ?? fallbackSet.id);
  const id = stackrId(JAPANESE_LANGUAGE, sourceId);
  const setId = stackrId(JAPANESE_LANGUAGE, setSourceId);
  const localName = card.name ?? sourceId;
  const englishDisplayName = getEnglishCardDisplayName({
    id,
    sourceId,
    setId,
    collectorNumber: card.localId ?? null,
    language: JAPANESE_LANGUAGE,
    region: JAPANESE_REGION,
    localName,
    raw: card,
  });
  const setNames = buildJapaneseSetDisplayNames(card.set ?? fallbackSet, setSourceId, setId);
  const small = card.image ? withWebpAsset(card.image, 'low') : null;
  const large = card.image ? withWebpAsset(card.image, 'high') : null;
  const subtypes = [card.stage, ...(Array.isArray(card.types) ? card.types : [])].filter(Boolean);

  return {
    id,
    set_id: setId,
    concept_id: null,
    region: JAPANESE_REGION,
    language: JAPANESE_LANGUAGE,
    canonical_name: card.name ?? sourceId,
    local_name: localName,
    english_display_name: englishDisplayName,
    collector_number: card.localId ?? null,
    printed_number: card.localId ?? null,
    rarity: card.rarity ?? null,
    supertype: card.category ?? null,
    subtypes,
    hp: card.hp == null ? null : String(card.hp),
    artist: card.illustrator ?? null,
    image_small_url: small,
    image_large_url: large,
    source_provider: TCGDEX_PROVIDER,
    source_id: sourceId,
    data_completeness: completenessFromFields([sourceId, card.name, card.localId, card.rarity]),
    image_status: imageStatus(small, large),
    last_synced_at: new Date().toISOString(),
    raw_payload: {
      ...card,
      language: JAPANESE_LANGUAGE,
      stackr_db_id: id,
      local_name: localName,
      english_display_name: englishDisplayName,
      display_name: englishDisplayName ?? localName,
      set: {
        ...(card.set ?? {}),
        id: setId,
        tcgdex_id: setSourceId,
        name: setNames.displayName,
        local_name: setNames.localName,
        english_display_name: setNames.englishDisplayName,
        display_name: setNames.displayName,
        printedTotal: card.set?.cardCount?.official ?? fallbackSet.cardCount?.official ?? null,
        total: card.set?.cardCount?.total ?? fallbackSet.cardCount?.total ?? fallbackSet.cards?.length ?? null,
      },
    },
    updated_at: new Date().toISOString(),
  };
}

function mapLegacyCardRow(card, fallbackSet) {
  const canonical = mapCardRow(card, fallbackSet);
  return {
    id: canonical.id,
    name: canonical.english_display_name ?? canonical.local_name ?? canonical.source_id,
    set_id: canonical.set_id,
    language: JAPANESE_LANGUAGE,
    region: JAPANESE_REGION,
    external_ids: {
      tcgdex: canonical.source_id,
    },
    number: canonical.collector_number,
    rarity: canonical.rarity,
    image_small: canonical.image_small_url,
    image_large: canonical.image_large_url,
    raw_data: canonical.raw_payload,
  };
}

function mapPrintingRow(card, fallbackSet) {
  const cardRow = mapCardRow(card, fallbackSet);
  return {
    id: `${cardRow.id}:normal`,
    concept_id: null,
    card_id: cardRow.id,
    set_id: cardRow.set_id,
    region: JAPANESE_REGION,
    language: JAPANESE_LANGUAGE,
    collector_number: cardRow.collector_number,
    variant: 'normal',
    rarity: cardRow.rarity,
    image_small_url: cardRow.image_small_url,
    image_large_url: cardRow.image_large_url,
    source_provider: TCGDEX_PROVIDER,
    source_id: cardRow.source_id,
    last_synced_at: new Date().toISOString(),
    raw_payload: card ?? {},
    updated_at: new Date().toISOString(),
  };
}

function mapVariantRows(card, fallbackSet) {
  const cardRow = mapCardRow(card, fallbackSet);
  const detailed = Array.isArray(card.variants_detailed) ? card.variants_detailed : [];
  const booleanVariants = Object.entries(card.variants ?? {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([type]) => ({ type, variantId: 'tcgdex_flag' }));
  const variants = detailed.length ? detailed : booleanVariants;

  return variants.map((variant) => ({
    id: `${cardRow.id}:${normaliseSearchText(variant.type || variant.variantId || 'variant').replace(/\s+/g, '-') || 'variant'}`,
    card_id: cardRow.id,
    printing_id: `${cardRow.id}:normal`,
    region: JAPANESE_REGION,
    language: JAPANESE_LANGUAGE,
    variant_type: variant.type ?? 'variant',
    variant_label: variant.size ? `${variant.type ?? 'variant'} ${variant.size}` : variant.type ?? null,
    source_provider: TCGDEX_PROVIDER,
    source_id: variant.variantId ?? cardRow.source_id,
    confidence: variant.variantId && variant.variantId !== 'generated' ? 'high' : 'medium',
    raw_payload: variant,
    updated_at: new Date().toISOString(),
  }));
}

function productTypeForJapaneseSet(set) {
  const text = `${set.local_name ?? set.name ?? ''} ${set.english_display_name ?? ''} ${set.set_code ?? set.id ?? ''}`;
  if (/high[-\s]?class|ハイクラス|ハイ.?クラス/i.test(text)) return 'high_class_pack';
  if (/deck build|デッキビルド|デッキビルドBOX/i.test(text)) return 'deck_build_box';
  if (/starter|スタート|スターター/i.test(text)) return 'starter_deck';
  if (/promo|プロモ/i.test(text)) return 'promo_pack';
  if (/premium|プレミアム|special|スペシャル/i.test(text)) return 'special_set';
  return 'booster_pack';
}

function productTypeForJapaneseSetSafe(set) {
  const text = `${set.local_name ?? set.name ?? ''} ${set.english_display_name ?? ''} ${set.set_code ?? set.id ?? ''}`;
  if (/high[-\s]?class|\u30cf\u30a4\u30af\u30e9\u30b9/i.test(text)) return 'high_class_pack';
  if (/deck build|\u30c7\u30c3\u30ad\u30d3\u30eb\u30c9/i.test(text)) return 'deck_build_box';
  if (/starter|\u30b9\u30bf\u30fc\u30c8|\u30b9\u30bf\u30fc\u30bf\u30fc/i.test(text)) return 'starter_deck';
  if (/promo|\u30d7\u30ed\u30e2/i.test(text)) return 'promo_pack';
  if (/premium|\u30d7\u30ec\u30df\u30a2\u30e0|special|\u30b9\u30da\u30b7\u30e3\u30eb/i.test(text)) return 'special_set';
  return productTypeForJapaneseSet(set);
}

function productTypeLabel(type) {
  return {
    booster_pack: 'Booster Pack',
    booster_box: 'Booster Box',
    booster_bundle: 'Booster Bundle',
    elite_trainer_box: 'Elite Trainer Box',
    pokemon_center_elite_trainer_box: 'Pokemon Center Elite Trainer Box',
    collection_box: 'Collection Box',
    special_collection: 'Special Collection',
    premium_collection: 'Premium Collection',
    starter_deck: 'Starter Deck',
    theme_deck: 'Theme Deck',
    deck_build_box: 'Deck Build Box',
    high_class_pack: 'High-Class Pack',
    special_set: 'Special Set',
    promo_pack: 'Promo Pack',
    blister: 'Blister',
    tin: 'Tin',
    display: 'Display',
    case: 'Case',
    other: 'Other',
  }[type] ?? 'Sealed Product';
}

function mapProductCandidate(set) {
  const productType = productTypeForJapaneseSetSafe(set);
  const sourceId = `${set.source_id}:${productType}`;
  const label = productTypeLabel(productType);
  const canonicalName = `${set.english_display_name ?? set.canonical_name ?? set.source_id} ${label}`;
  const localName = [set.local_name, label].filter(Boolean).join(' ');
  const searchText = [
    canonicalName,
    localName,
    set.set_code,
    'japanese',
    'jp',
    'pokemon',
    productType.replace(/_/g, ' '),
  ].map(normaliseSearchText).filter(Boolean).join(' ');

  return {
    id: stackrId(JAPANESE_LANGUAGE, `product:${sourceId}`),
    region: JAPANESE_REGION,
    language: JAPANESE_LANGUAGE,
    product_type: productType,
    canonical_name: canonicalName,
    local_name: localName,
    english_display_name: canonicalName,
    set_id: set.id,
    release_date: set.release_date,
    pack_count: null,
    cards_per_pack: null,
    box_configuration: null,
    manufacturer_product_code: null,
    barcode: null,
    image_front_url: null,
    image_back_url: null,
    image_side_url: null,
    image_source: null,
    image_license_status: 'unknown',
    image_verified: false,
    image_last_checked: null,
    source_provider: PRODUCT_CANDIDATE_PROVIDER,
    source_id: sourceId,
    data_completeness: 'low',
    image_status: 'unavailable',
    confidence: 'low',
    search_text: searchText,
    last_synced_at: new Date().toISOString(),
    raw_payload: {
      set_id: set.id,
      set_source_id: set.source_id,
      generated_from: 'tcgdex_set',
      warning: 'Low-confidence sealed product candidate; requires provider image and product verification before being presented as complete.',
    },
    updated_at: new Date().toISOString(),
  };
}

function mapMarketProductCompatibilityRow(product) {
  const releaseYear = product.release_date ? String(new Date(product.release_date).getFullYear()) : null;
  return {
    id: product.id,
    product_type: product.product_type,
    name: product.english_display_name ?? product.canonical_name,
    set_name: product.english_display_name ?? product.local_name ?? product.set_id,
    language: product.language,
    region: product.region,
    release_year: releaseYear,
    image_url: product.image_front_url,
    image_large_url: product.image_front_url,
    aliases: [
      product.local_name,
      product.canonical_name,
      product.product_type.replace(/_/g, ' '),
      'Japanese',
      'JP',
    ].filter(Boolean),
    search_text: product.search_text,
    source: PRODUCT_CANDIDATE_PROVIDER,
    source_provider: product.source_provider,
    source_id: product.source_id,
    confidence: product.confidence,
    data_completeness: product.data_completeness,
    image_status: product.image_status,
    updated_at: new Date().toISOString(),
  };
}

async function upsertRows(db, table, rows, onConflict = 'id') {
  if (!rows.length) return { count: 0 };
  const { error } = await db.from(table).upsert(rows, { onConflict });
  if (error) throw error;
  return { count: rows.length };
}

async function insertProviderRecords(db, recordType, rows) {
  const records = rows.map((row) => ({
    provider: row.source_provider ?? TCGDEX_PROVIDER,
    provider_record_type: recordType,
    provider_record_id: row.source_id,
    region: row.region ?? JAPANESE_REGION,
    language: row.language ?? JAPANESE_LANGUAGE,
    response_status: 'success',
    raw_payload: row.raw_payload ?? {},
  }));
  return upsertRows(db, 'provider_records', records, 'provider,provider_record_type,provider_record_id,language');
}

async function upsertProviderMappings(db, recordType, entityType, rows, matchConfidence = 1) {
  const mappings = rows.map((row) => ({
    stackr_card_id: entityType === 'card' ? row.id : null,
    provider: row.source_provider ?? TCGDEX_PROVIDER,
    provider_card_id: `${recordType}:${row.source_id}`,
    provider_record_type: recordType,
    provider_record_id: row.source_id,
    language: row.language ?? JAPANESE_LANGUAGE,
    confidence: matchConfidence,
    metadata: {
      region: row.region ?? JAPANESE_REGION,
      source_id: row.source_id,
      canonical_id: row.id,
    },
    stackr_entity_type: entityType,
    stackr_entity_id: row.id,
    match_method: 'provider_id',
    match_confidence: matchConfidence,
    match_status: 'matched',
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  return upsertRows(db, 'provider_mappings', mappings, 'provider,provider_card_id,language');
}

async function startSyncRun(db, syncName, metadata = {}) {
  const { data, error } = await db
    .from('sync_runs')
    .insert({
      provider: TCGDEX_PROVIDER,
      sync_name: syncName,
      region: JAPANESE_REGION,
      language: JAPANESE_LANGUAGE,
      status: 'started',
      metadata,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function finishSyncRun(db, syncRunId, status, summary = {}, errorMessage = null) {
  const { error } = await db
    .from('sync_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_requested: summary.recordsRequested ?? 0,
      records_retrieved: summary.recordsRetrieved ?? 0,
      records_written: summary.recordsWritten ?? 0,
      records_skipped: summary.recordsSkipped ?? 0,
      missing_records: summary.missingRecords ?? 0,
      duplicate_records: summary.duplicateRecords ?? 0,
      failed_mappings: summary.failedMappings ?? 0,
      metadata: summary,
      error_message: errorMessage,
    })
    .eq('id', syncRunId);
  if (error) throw error;
}

async function recordSyncError(db, syncRunId, syncName, entityType, entityId, errorType, errorMessage, rawPayload = {}) {
  await db.from('sync_errors').insert({
    sync_run_id: syncRunId,
    provider: TCGDEX_PROVIDER,
    sync_name: syncName,
    entity_type: entityType,
    entity_id: entityId,
    error_type: errorType,
    error_message: errorMessage,
    raw_payload: rawPayload,
  });
}

export async function syncJapaneseSeries(db) {
  const series = await fetchTcgdexPagedArray(`/${JAPANESE_LANGUAGE}/series`);
  const rows = series.map((serie, index) => mapSeriesRow(serie, index + 1));
  await upsertRows(db, 'tcg_series', rows);
  await insertProviderRecords(db, 'series', rows);
  await upsertProviderMappings(db, 'series', 'series', rows, 1);
  return { rows, recordsRetrieved: series.length, recordsWritten: rows.length };
}

export async function syncJapaneseSets(db, options = {}) {
  const seriesRows = options.seriesId
    ? [{ source_id: stripLanguagePrefix(options.seriesId), id: stackrId(JAPANESE_LANGUAGE, stripLanguagePrefix(options.seriesId)) }]
    : (await syncJapaneseSeries(db)).rows;
  const rows = [];
  const legacyRows = [];
  let recordsRetrieved = 0;

  for (const series of seriesRows) {
    const detail = await fetchTcgdexJson(`/${JAPANESE_LANGUAGE}/series/${encodeURIComponent(series.source_id)}`);
    const sets = Array.isArray(detail?.sets) ? detail.sets : [];
    recordsRetrieved += sets.length;
    for (const set of sets) {
      rows.push(mapSetRow({ ...set, serie: { id: detail.id, name: detail.name } }, detail.id));
      legacyRows.push(mapLegacySetRow({ ...set, serie: { id: detail.id, name: detail.name } }, detail.id));
    }
  }

  await upsertRows(db, 'tcg_sets', rows);
  await upsertRows(db, 'pokemon_sets', legacyRows);
  await insertProviderRecords(db, 'set', rows);
  await upsertProviderMappings(db, 'set', 'set', rows, 1);

  return { rows, recordsRetrieved, recordsWritten: rows.length };
}

export async function syncJapaneseCardsForSet(db, setId, syncRunId = null) {
  const sourceSetId = stripLanguagePrefix(setId);
  const set = await fetchTcgdexJson(`/${JAPANESE_LANGUAGE}/sets/${encodeURIComponent(sourceSetId)}`);
  const expectedTotal = toNumberOrNull(set?.cardCount?.total) ?? set?.cards?.length ?? 0;
  const cardBriefs = Array.isArray(set?.cards) ? set.cards : [];
  const setRows = [mapSetRow(set, set?.serie?.id)];
  const legacySetRows = [mapLegacySetRow(set, set?.serie?.id)];
  const cardRows = [];
  const legacyCardRows = [];
  const printingRows = [];
  const variantRows = [];
  let missingRecords = Math.max(expectedTotal - cardBriefs.length, 0);
  let failedMappings = 0;

  await upsertRows(db, 'tcg_sets', setRows);
  await upsertRows(db, 'pokemon_sets', legacySetRows);
  await insertProviderRecords(db, 'set', setRows);
  await upsertProviderMappings(db, 'set', 'set', setRows, 1);

  if (missingRecords > 0 && syncRunId) {
    await recordSyncError(
      db,
      syncRunId,
      'syncJapaneseCardsForSet',
      'set',
      sourceSetId,
      'partial_response',
      `TCGdex returned ${cardBriefs.length} cards but provider total is ${expectedTotal}.`,
      { set }
    );
  }

  for (let index = 0; index < cardBriefs.length; index += TCGDEX_CARD_DETAIL_BATCH_SIZE) {
    const batch = cardBriefs.slice(index, index + TCGDEX_CARD_DETAIL_BATCH_SIZE);
    const details = await Promise.all(batch.map(async (brief) => {
      try {
        return await fetchTcgdexJson(`/${JAPANESE_LANGUAGE}/cards/${encodeURIComponent(brief.id)}`);
      } catch (error) {
        failedMappings += 1;
        if (syncRunId) {
          await recordSyncError(
            db,
            syncRunId,
            'syncJapaneseCardsForSet',
            'card',
            brief.id,
            'provider_failure',
            error instanceof Error ? error.message : String(error),
            { brief }
          );
        }
        return null;
      }
    }));

    for (const card of details.filter(Boolean)) {
      cardRows.push(mapCardRow(card, set));
      legacyCardRows.push(mapLegacyCardRow(card, set));
      printingRows.push(mapPrintingRow(card, set));
      variantRows.push(...mapVariantRows(card, set));
    }
  }

  await upsertRows(db, 'tcg_cards', cardRows);
  await upsertRows(db, 'pokemon_cards', legacyCardRows);
  await upsertRows(db, 'card_printings', printingRows);
  await upsertRows(db, 'card_variants', variantRows);
  await insertProviderRecords(db, 'card', cardRows);
  await upsertProviderMappings(db, 'card', 'card', cardRows, 1);

  return {
    set: setRows[0],
    recordsRequested: expectedTotal,
    recordsRetrieved: cardBriefs.length,
    recordsWritten: cardRows.length,
    missingRecords,
    failedMappings,
  };
}

export async function syncJapaneseSealedProducts(db, options = {}) {
  let query = db
    .from('tcg_sets')
    .select('id, source_id, set_code, canonical_name, local_name, english_display_name, release_date')
    .eq('region', JAPANESE_REGION)
    .eq('language', JAPANESE_LANGUAGE)
    .order('release_date', { ascending: false, nullsFirst: false })
    .limit(Math.min(Math.max(Number(options.limit ?? 500), 1), 5000));

  if (options.setId) query = query.eq('id', stackrId(JAPANESE_LANGUAGE, stripLanguagePrefix(options.setId)));

  const { data, error } = await query;
  if (error) throw error;

  const products = (data ?? []).map(mapProductCandidate);
  await upsertRows(db, 'sealed_products', products);
  await upsertRows(db, 'market_products', products.map(mapMarketProductCompatibilityRow));
  await insertProviderRecords(db, 'sealed_product', products);
  await upsertProviderMappings(db, 'sealed_product', 'sealed_product', products, 0.35);

  return {
    recordsRetrieved: data?.length ?? 0,
    recordsWritten: products.length,
  };
}

export async function verifyJapaneseCatalogue(db) {
  const { data, error } = await db
    .from('japanese_catalogue_health')
    .select('*')
    .order('release_date', { ascending: false, nullsFirst: false });
  if (error) throw error;

  const rows = data ?? [];
  return {
    sets: rows.length,
    completeSets: rows.filter((row) => row.current_status === 'Complete').length,
    cardsStored: rows.reduce((sum, row) => sum + Number(row.stored_total ?? 0), 0),
    cardsMissingImages: rows.reduce((sum, row) => sum + Number(row.cards_missing_image ?? 0), 0),
    cardsMissingPrices: rows.reduce((sum, row) => sum + Number(row.cards_missing_price ?? 0), 0),
    productsLinked: rows.reduce((sum, row) => sum + Number(row.sealed_products_linked ?? 0), 0),
    statuses: rows.reduce((acc, row) => {
      const status = row.current_status ?? 'Needs review';
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {}),
    rows,
  };
}

export async function syncJapaneseCatalogue(db, options = {}) {
  const syncRunId = await startSyncRun(db, 'japanese_catalogue', options);
  const summary = {
    recordsRequested: 0,
    recordsRetrieved: 0,
    recordsWritten: 0,
    recordsSkipped: 0,
    missingRecords: 0,
    duplicateRecords: 0,
    failedMappings: 0,
    series: 0,
    sets: 0,
    cards: 0,
    products: 0,
  };

  try {
    const series = await syncJapaneseSeries(db);
    summary.series = series.recordsWritten;
    summary.recordsRetrieved += series.recordsRetrieved;
    summary.recordsWritten += series.recordsWritten;

    const sets = await syncJapaneseSets(db, { seriesId: options.seriesId });
    summary.sets = sets.recordsWritten;
    summary.recordsRetrieved += sets.recordsRetrieved;
    summary.recordsWritten += sets.recordsWritten;

    const setIds = options.setId
      ? [stripLanguagePrefix(options.setId)]
      : options.allCards
        ? sets.rows.map((set) => set.source_id)
        : [];

    for (const setId of setIds) {
      const cards = await syncJapaneseCardsForSet(db, setId, syncRunId);
      summary.recordsRequested += cards.recordsRequested;
      summary.recordsRetrieved += cards.recordsRetrieved;
      summary.recordsWritten += cards.recordsWritten;
      summary.missingRecords += cards.missingRecords;
      summary.failedMappings += cards.failedMappings;
      summary.cards += cards.recordsWritten;
    }

    const products = await syncJapaneseSealedProducts(db, { setId: options.setId });
    summary.products = products.recordsWritten;
    summary.recordsRetrieved += products.recordsRetrieved;
    summary.recordsWritten += products.recordsWritten;

    const health = await verifyJapaneseCatalogue(db);
    await finishSyncRun(db, syncRunId, summary.failedMappings || summary.missingRecords ? 'partial' : 'success', {
      ...summary,
      health: {
        sets: health.sets,
        completeSets: health.completeSets,
        statuses: health.statuses,
      },
    });

    return { syncRunId, summary, health };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSyncRun(db, syncRunId, 'failed', summary, message);
    await recordSyncError(db, syncRunId, 'japanese_catalogue', null, null, 'sync_failed', message);
    throw error;
  }
}

export async function listJapaneseSeries(db) {
  const { data, error } = await db
    .from('tcg_series')
    .select('*')
    .eq('region', JAPANESE_REGION)
    .eq('language', JAPANESE_LANGUAGE)
    .order('display_order', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function listJapaneseSets(db, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit ?? 50), 1), 200);
  const page = Math.max(Number(options.page ?? 1), 1);
  let query = db
    .from('tcg_sets')
    .select('*')
    .eq('region', JAPANESE_REGION)
    .eq('language', JAPANESE_LANGUAGE)
    .order('release_date', { ascending: false, nullsFirst: false })
    .range((page - 1) * limit, (page * limit) - 1);

  if (options.q) {
    const q = cleanValue(options.q);
    query = query.or(`canonical_name.ilike.%${q}%,local_name.ilike.%${q}%,english_display_name.ilike.%${q}%,set_code.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getJapaneseSet(db, setId) {
  const id = stackrId(JAPANESE_LANGUAGE, stripLanguagePrefix(setId));
  const { data, error } = await db.from('tcg_sets').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listJapaneseSetCards(db, setId, options = {}) {
  const id = stackrId(JAPANESE_LANGUAGE, stripLanguagePrefix(setId));
  const limit = Math.min(Math.max(Number(options.limit ?? 60), 1), 200);
  const page = Math.max(Number(options.page ?? 1), 1);
  const { data, error } = await db
    .from('tcg_cards')
    .select('*')
    .eq('set_id', id)
    .order('collector_number', { ascending: true })
    .range((page - 1) * limit, (page * limit) - 1);
  if (error) throw error;
  return data ?? [];
}

export async function listJapaneseSetProducts(db, setId) {
  const id = stackrId(JAPANESE_LANGUAGE, stripLanguagePrefix(setId));
  const { data, error } = await db
    .from('sealed_products')
    .select('*')
    .eq('set_id', id)
    .order('product_type', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getJapaneseCard(db, cardId) {
  const id = stackrId(JAPANESE_LANGUAGE, stripLanguagePrefix(cardId));
  const { data, error } = await db.from('tcg_cards').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getJapaneseProduct(db, productId) {
  const id = cleanValue(productId).startsWith('ja:') ? cleanValue(productId) : stackrId(JAPANESE_LANGUAGE, stripLanguagePrefix(productId));
  const { data, error } = await db.from('sealed_products').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function searchCatalogue(db, options = {}) {
  const q = cleanValue(options.q ?? options.query);
  const limit = Math.min(Math.max(Number(options.limit ?? 12), 1), 50);
  if (q.length < 2) return { query: q, cards: [], sets: [], products: [], listings: [] };

  const [cards, sets, products, listings] = await Promise.all([
    db
      .from('tcg_cards')
      .select('id, set_id, local_name, english_display_name, collector_number, rarity, image_small_url, language, region')
      .eq('language', JAPANESE_LANGUAGE)
      .or(`local_name.ilike.%${q}%,english_display_name.ilike.%${q}%,collector_number.ilike.%${q}%,source_id.ilike.%${q}%`)
      .limit(limit),
    db
      .from('tcg_sets')
      .select('id, local_name, english_display_name, set_code, printed_total, actual_total, logo_url, language, region')
      .eq('language', JAPANESE_LANGUAGE)
      .or(`local_name.ilike.%${q}%,english_display_name.ilike.%${q}%,set_code.ilike.%${q}%,source_id.ilike.%${q}%`)
      .limit(limit),
    db
      .from('sealed_products')
      .select('id, product_type, local_name, english_display_name, image_front_url, set_id, language, region, confidence')
      .in('region', [JAPANESE_REGION, 'japan'])
      .eq('language', JAPANESE_LANGUAGE)
      .or(`canonical_name.ilike.%${q}%,local_name.ilike.%${q}%,english_display_name.ilike.%${q}%,search_text.ilike.%${normaliseSearchText(q)}%`)
      .limit(limit),
    db
      .from('user_card_flags')
      .select('id, card_id, set_id, product_name, product_type, asking_price, pricing_mode')
      .eq('flag_type', 'trade')
      .or(`product_name.ilike.%${q}%,card_id.ilike.%${q}%,set_id.ilike.%${q}%`)
      .limit(limit),
  ]);

  return {
    query: q,
    cards: cards.error ? [] : cards.data ?? [],
    sets: sets.error ? [] : sets.data ?? [],
    products: products.error ? [] : products.data ?? [],
    listings: listings.error ? [] : listings.data ?? [],
    errors: {
      cards: cards.error?.message,
      sets: sets.error?.message,
      products: products.error?.message,
      listings: listings.error?.message,
    },
  };
}

export async function getJapaneseCatalogueHealth(db) {
  return verifyJapaneseCatalogue(db);
}
