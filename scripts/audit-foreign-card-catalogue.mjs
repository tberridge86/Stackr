#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const imageSize = require('image-size').imageSize;

const ROOT = process.cwd();
const OUTPUT_DIR = path.resolve(ROOT, 'tmp', 'foreign-card-audit');
const POKEDATA_BASE_URL = 'https://www.pokedata.io';
const TCGDEX_BASE_URL = 'https://api.tcgdex.net/v2';
const PAGE_SIZE = 1000;
const LANGUAGES = ['en', 'ja', 'zh-tw'];

function nowIso() {
  return new Date().toISOString();
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function resolveSupabaseCredentials() {
  const envUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const envKey = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (envUrl && envKey) return { url: envUrl, key: envKey, source: 'environment' };

  const supabaseSource = await readTextIfExists(path.resolve(ROOT, 'lib', 'supabase.tsx'));
  const url = supabaseSource.match(/supabaseUrl\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const key = supabaseSource.match(/supabaseAnonKey\s*=\s*['"]([^'"]+)['"]/)?.[1];
  if (url && key) return { url, key, source: 'lib/supabase.tsx public client' };
  return null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Stackr foreign catalogue audit',
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return {
    url,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
    json,
  };
}

function isLikelySignedUrl(url) {
  return /(\?|&)(expires|x-amz-expires|x-amz-signature|signature|token|policy)=/i.test(String(url || ''));
}

function imageFormatSupportedByApp(contentType) {
  const type = String(contentType || '').toLowerCase();
  return ['image/jpeg', 'image/png', 'image/webp'].includes(type);
}

async function probeImage(url, context = {}) {
  if (!url) {
    return {
      ...context,
      requested_url: null,
      http_status: null,
      mime_type: null,
      image_width: null,
      image_height: null,
      requires_authentication: false,
      hotlinking_blocked: false,
      signed_or_expiring_url: false,
      supported_format: false,
      final_displayed_state: 'placeholder',
      failure_reason: 'No image URL available',
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5',
        'User-Agent': 'Stackr foreign catalogue audit',
      },
      redirect: 'follow',
    });
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const bytes = response.ok ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
    let dimensions = {};
    if (bytes.length && contentType.startsWith('image/')) {
      try {
        dimensions = imageSize(bytes) || {};
      } catch (error) {
        dimensions = { dimension_error: error instanceof Error ? error.message : String(error) };
      }
    }

    const okImage = response.ok && contentType.startsWith('image/');
    return {
      ...context,
      requested_url: url,
      http_status: response.status,
      mime_type: contentType || null,
      content_length: response.headers.get('content-length'),
      cache_control: response.headers.get('cache-control'),
      expires: response.headers.get('expires'),
      access_control_allow_origin: response.headers.get('access-control-allow-origin'),
      image_width: dimensions.width ?? null,
      image_height: dimensions.height ?? null,
      dimension_error: dimensions.dimension_error ?? null,
      requires_authentication: response.status === 401,
      hotlinking_blocked: response.status === 403,
      signed_or_expiring_url: isLikelySignedUrl(url),
      supported_format: okImage && imageFormatSupportedByApp(contentType),
      final_displayed_state: okImage ? 'image' : 'placeholder',
      failure_reason: okImage ? null : `HTTP ${response.status}${contentType ? ` ${contentType}` : ''}`,
    };
  } catch (error) {
    return {
      ...context,
      requested_url: url,
      http_status: null,
      mime_type: null,
      image_width: null,
      image_height: null,
      requires_authentication: false,
      hotlinking_blocked: false,
      signed_or_expiring_url: isLikelySignedUrl(url),
      supported_format: false,
      final_displayed_state: 'placeholder',
      failure_reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function tcgdexImageCandidates(imageBase) {
  if (!imageBase) return [];
  const clean = String(imageBase).replace(/\/$/, '');
  if (/\.(webp|png|jpe?g)(\?|$)/i.test(clean)) return [clean];
  return [
    `${clean}/high.webp`,
    `${clean}/high.png`,
    `${clean}/low.webp`,
    `${clean}/low.png`,
  ];
}

async function probeTcgdexSample(language, setId, label) {
  const setResponse = await fetchJson(`${TCGDEX_BASE_URL}/${language}/sets/${encodeURIComponent(setId)}`);
  const set = setResponse.json;
  const summary = {
    provider: 'tcgdex',
    language,
    set_id: setId,
    label,
    set_http_status: setResponse.status,
    set_name: set?.name ?? null,
    set_card_count: Array.isArray(set?.cards) ? set.cards.length : null,
    set_logo: set?.logo ?? null,
    set_symbol: set?.symbol ?? null,
  };

  const cardSummary = Array.isArray(set?.cards)
    ? set.cards.find((card) => card?.image) ?? set.cards[0]
    : null;
  if (!cardSummary?.id) return { ...summary, card_failure_reason: 'No card summary in set response', image_probes: [] };

  const cardResponse = await fetchJson(`${TCGDEX_BASE_URL}/${language}/cards/${encodeURIComponent(cardSummary.id)}`);
  const card = cardResponse.json;
  const imageBase = card?.image ?? cardSummary?.image ?? null;
  const probes = [];
  for (const url of tcgdexImageCandidates(imageBase).slice(0, 4)) {
    probes.push(await probeImage(url, {
      provider: 'tcgdex',
      language,
      set_id: setId,
      card_internal_id: language === 'en' ? card?.id ?? cardSummary.id : `${language}:${card?.id ?? cardSummary.id}`,
      external_source_id: card?.id ?? cardSummary.id,
      collector_number: card?.localId ?? cardSummary.localId ?? null,
    }));
  }

  return {
    ...summary,
    card_http_status: cardResponse.status,
    card_id: card?.id ?? cardSummary.id,
    collector_number: card?.localId ?? cardSummary.localId ?? null,
    card_name: card?.name ?? cardSummary.name ?? null,
    card_image_base: imageBase,
    card_pricing_keys: card?.pricing ? Object.keys(card.pricing) : [],
    image_probes: probes,
    card_failure_reason: imageBase ? null : 'Provider card record has no image base',
  };
}

async function loadPokeDataChineseFiles() {
  const setsPath = path.resolve(ROOT, 'tmp', 'pokedata-chinese', 'pokedata-chinese-sets.json');
  const cardsPath = path.resolve(ROOT, 'tmp', 'pokedata-chinese', 'pokedata-chinese-cards.json');
  const sets = JSON.parse(await readTextIfExists(setsPath) || '[]');
  const cards = JSON.parse(await readTextIfExists(cardsPath) || '[]');
  return { sets, cards, setsPath, cardsPath };
}

async function probePokeDataSamples() {
  const probes = [];
  const { sets: chineseSets, cards: chineseCards } = await loadPokeDataChineseFiles();
  const chineseSet = chineseSets.find((set) => set?.artwork?.logo || set?.artwork?.symbol);
  const chineseCard = chineseCards.find((card) => card?.image);
  if (chineseSet) {
    probes.push(await probeImage(chineseSet.artwork.logo || chineseSet.artwork.symbol, {
      provider: 'pokedata',
      language: 'zh-tw',
      entity_type: 'set_logo',
      set_id: `pokedata:${chineseSet.pokedata_id}`,
      external_source_id: String(chineseSet.pokedata_id),
      set_name: chineseSet.name,
    }));
  }
  if (chineseCard) {
    probes.push(await probeImage(chineseCard.image, {
      provider: 'pokedata',
      language: 'zh-tw',
      entity_type: 'card_image',
      card_internal_id: `zh-tw:pokedata:${chineseCard.pokedata_id}`,
      external_source_id: String(chineseCard.pokedata_id),
      set_id: `pokedata:${chineseCard.set_id}`,
      set_name: chineseCard.set_name,
      collector_number: chineseCard.number,
    }));
  }

  const allSetsResponse = await fetchJson(`${POKEDATA_BASE_URL}/api/sets`);
  const japaneseSet = Array.isArray(allSetsResponse.json)
    ? allSetsResponse.json.find((set) => String(set?.tcg).toLowerCase() === 'pokemon' && String(set?.language).toUpperCase() === 'JAPANESE')
    : null;
  if (japaneseSet?.img_url) {
    probes.push(await probeImage(japaneseSet.img_url, {
      provider: 'pokedata',
      language: 'ja',
      entity_type: 'set_logo',
      set_id: `pokedata:${japaneseSet.id}`,
      external_source_id: String(japaneseSet.id),
      set_name: japaneseSet.name,
    }));
  }
  if (japaneseSet?.name) {
    const params = new URLSearchParams({ set_name: japaneseSet.name, tcg: 'Pokemon', stats: 'kwan' });
    const cardsResponse = await fetchJson(`${POKEDATA_BASE_URL}/api/cards?${params.toString()}`);
    const japaneseCard = Array.isArray(cardsResponse.json) ? cardsResponse.json.find((card) => card?.img_url) : null;
    if (japaneseCard) {
      probes.push(await probeImage(japaneseCard.img_url, {
        provider: 'pokedata',
        language: 'ja',
        entity_type: 'card_image',
        card_internal_id: `ja:pokedata:${japaneseCard.id}`,
        external_source_id: String(japaneseCard.id),
        set_id: `pokedata:${japaneseCard.set_id}`,
        set_name: japaneseCard.set_name,
        collector_number: japaneseCard.num ?? null,
      }));
    }
  }
  return probes;
}

async function fetchAllRows(supabase, table, select, buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (buildQuery) query = buildQuery(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function countRows(supabase, table, buildQuery) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (buildQuery) query = buildQuery(query);
  const { count, error } = await query;
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0, error: null };
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row?.[key] ?? 'null');
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function rawImageBase(row) {
  const raw = row.raw_payload ?? row.raw_source ?? {};
  return raw.image ?? raw.images?.large ?? raw.images?.small ?? raw.imageBase ?? null;
}

function missingImageDiagnostic(row, latestCheck) {
  const imageBase = rawImageBase(row);
  const attemptedUrl = latestCheck?.candidate_url
    ?? tcgdexImageCandidates(imageBase)[0]
    ?? row.image_small_url
    ?? row.image_large_url
    ?? null;
  return {
    language: row.language,
    card_internal_id: row.id,
    external_source_id: row.source_id ?? row.provider_card_id ?? null,
    set_id: row.set_id,
    collector_number: row.collector_number,
    card_name: row.english_display_name ?? row.local_name ?? row.canonical_name ?? row.id,
    requested_url: attemptedUrl,
    http_response: latestCheck?.http_status ?? null,
    mime_type: latestCheck?.content_type ?? null,
    image_dimensions: latestCheck?.image_width || latestCheck?.image_height
      ? { width: latestCheck.image_width ?? null, height: latestCheck.image_height ?? null }
      : null,
    requires_authentication: latestCheck?.http_status === 401,
    hotlinking_blocked: latestCheck?.http_status === 403,
    url_has_expiry_signature: isLikelySignedUrl(attemptedUrl),
    supported_format: latestCheck?.content_type ? imageFormatSupportedByApp(latestCheck.content_type) : null,
    fallback_attempted: Boolean(row.image_small_url || row.image_large_url || imageBase),
    final_displayed_state: row.image_small_url || row.image_large_url ? 'image if client accepts URL' : 'placeholder',
    image_status: row.image_status ?? null,
    failure_reason: latestCheck?.failure_reason ?? (imageBase ? 'No successful image resolution stored' : 'Provider record has no image base'),
  };
}

async function runSupabaseAudit() {
  const credentials = await resolveSupabaseCredentials();
  if (!credentials) return { available: false, reason: 'No Supabase public credentials found' };
  const supabase = createClient(credentials.url, credentials.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const counts = {};
  for (const language of LANGUAGES) {
    counts[language] = {
      tcg_sets: await countRows(supabase, 'tcg_sets', (q) => q.eq('language', language)),
      tcg_cards: await countRows(supabase, 'tcg_cards', (q) => q.eq('language', language)),
      pokemon_sets: await countRows(supabase, 'pokemon_sets', (q) => q.eq('language', language)),
      pokemon_cards: await countRows(supabase, 'pokemon_cards', (q) => q.eq('language', language)),
      market_price_snapshots: await countRows(supabase, 'market_price_snapshots', (q) => q.eq('language', language)),
      card_prices: await countRows(supabase, 'card_prices', (q) => q.eq('language', language)),
      market_prices: await countRows(supabase, 'market_prices', (q) => q.eq('language', language)),
      provider_mappings: await countRows(supabase, 'provider_mappings', (q) => q.eq('language', language)),
    };
  }

  const catalogueHealth = await fetchAllRows(supabase, 'catalogue_health', '*').catch((error) => [
    { error: error.message },
  ]);
  const setRows = [];
  const cardRows = [];
  for (const language of ['ja', 'zh-tw']) {
    setRows.push(...await fetchAllRows(
      supabase,
      'tcg_sets',
      'id,language,region,source_provider,source_id,set_code,canonical_name,local_name,english_display_name,printed_total,actual_total,provider_reported_total,retrieved_total,stored_total,missing_total,duplicate_total,sync_status,logo_url,symbol_url,release_date,last_synced_at',
      (q) => q.eq('language', language)
    ));
    cardRows.push(...await fetchAllRows(
      supabase,
      'tcg_cards',
      'id,set_id,language,region,canonical_name,local_name,english_display_name,collector_number,rarity,image_small_url,image_large_url,image_status,pricing_status,source_provider,source_id,provider_card_id,provider_set_id,last_image_checked_at,last_price_checked_at,raw_payload',
      (q) => q.eq('language', language)
    ));
  }

  const imageChecks = await fetchAllRows(
    supabase,
    'card_image_checks',
    'card_id,provider,provider_image_base,candidate_url,http_status,content_type,image_width,image_height,resolution_status,failure_reason,checked_at',
    (q) => q.order('checked_at', { ascending: false }).limit(5000)
  ).catch(() => []);
  const latestImageCheckByCard = new Map();
  for (const check of imageChecks) {
    if (check.card_id && !latestImageCheckByCard.has(check.card_id)) latestImageCheckByCard.set(check.card_id, check);
  }

  const missingImageRows = cardRows.filter((row) => !['resolved', 'resolved_secondary'].includes(String(row.image_status || '')));
  const missingImageReport = missingImageRows.map((row) => missingImageDiagnostic(row, latestImageCheckByCard.get(row.id)));

  const priceRows = await fetchAllRows(
    supabase,
    'card_prices',
    'entity_id,language,region,condition,grader,grade,price_type,display_price,display_currency,provider,provider_record_id,retrieved_at,confidence,pricing_status',
    (q) => q.in('language', ['ja', 'zh-tw'])
  ).catch(() => []);
  const providerMappings = await fetchAllRows(
    supabase,
    'provider_mappings',
    'stackr_card_id,provider,provider_card_id,language,metadata,provider_record_type,provider_record_id,stackr_entity_id,match_method,match_confidence,match_status,last_verified_at',
    (q) => q.or('stackr_card_id.ilike.ja:%,stackr_card_id.ilike.zh-tw:%')
  ).catch(() => []);
  const providerMappingLanguageMismatches = providerMappings.filter((row) => {
    const expected = String(row.stackr_card_id || '').startsWith('ja:')
      ? 'ja'
      : String(row.stackr_card_id || '').startsWith('zh-tw:')
      ? 'zh-tw'
      : null;
    return expected && row.language !== expected;
  });
  const syncErrors = await fetchAllRows(
    supabase,
    'catalogue_sync_errors',
    'provider,job_name,language,region,set_id,card_id,provider_record_id,stage,severity,message,created_at',
    (q) => q.in('language', ['ja', 'zh-tw']).order('created_at', { ascending: false }).limit(1000)
  ).catch(() => []);

  const setCoverage = LANGUAGES.map((language) => ({
    language,
    tcgdex_sets_stored: counts[language]?.tcg_sets?.count ?? null,
    tcgdex_cards_stored: counts[language]?.tcg_cards?.count ?? null,
    legacy_sets_stored: counts[language]?.pokemon_sets?.count ?? null,
    legacy_cards_stored: counts[language]?.pokemon_cards?.count ?? null,
  }));
  const storedSetCoverage = setRows.map((set) => ({
    id: set.id,
    language: set.language,
    source_provider: set.source_provider,
    source_id: set.source_id,
    set_code: set.set_code,
    name: set.english_display_name ?? set.local_name ?? set.canonical_name,
    printed_total: set.printed_total,
    actual_total: set.actual_total,
    provider_reported_total: set.provider_reported_total,
    retrieved_total: set.retrieved_total,
    stored_total: set.stored_total,
    missing_total: set.missing_total,
    duplicate_total: set.duplicate_total,
    sync_status: set.sync_status,
    has_logo: Boolean(set.logo_url),
    has_symbol: Boolean(set.symbol_url),
    release_date: set.release_date,
    last_synced_at: set.last_synced_at,
  }));
  const pricingCoverage = {
    by_language: LANGUAGES.map((language) => ({
      language,
      market_price_snapshots: counts[language]?.market_price_snapshots?.count ?? null,
      card_prices: counts[language]?.card_prices?.count ?? null,
      market_prices: counts[language]?.market_prices?.count ?? null,
      provider_mappings: counts[language]?.provider_mappings?.count ?? null,
    })),
    card_pricing_status_counts: countBy(cardRows, 'pricing_status'),
    card_prices_by_language: countBy(priceRows, 'language'),
    card_prices_by_price_type: countBy(priceRows, 'price_type'),
    card_prices_by_provider: countBy(priceRows, 'provider'),
    provider_mapping_language_mismatches: {
      count: providerMappingLanguageMismatches.length,
      sample: providerMappingLanguageMismatches.slice(0, 25),
    },
  };

  return {
    available: true,
    credential_source: credentials.source,
    generated_at: nowIso(),
    counts,
    catalogue_health: catalogueHealth,
    set_coverage_summary: setCoverage,
    set_coverage_rows: storedSetCoverage,
    missing_image_summary: {
      total: missingImageReport.length,
      by_language: countBy(missingImageReport, 'language'),
      by_status: countBy(missingImageReport, 'image_status'),
    },
    missing_image_report: missingImageReport,
    pricing_coverage_report: pricingCoverage,
    failed_record_report: syncErrors,
  };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const tcgdexSets = {};
  for (const language of LANGUAGES) {
    const response = await fetchJson(`${TCGDEX_BASE_URL}/${language}/sets`);
    tcgdexSets[language] = {
      http_status: response.status,
      count: Array.isArray(response.json) ? response.json.length : null,
      set_ids_with_logo_or_symbol: Array.isArray(response.json)
        ? response.json.filter((set) => set.logo || set.symbol).map((set) => set.id)
        : [],
      sample: Array.isArray(response.json) ? response.json.slice(0, 5) : null,
    };
  }

  const tcgdexSamples = [
    await probeTcgdexSample('en', 'base1', 'English baseline with Pokemon TCG image fallback potential'),
    await probeTcgdexSample('ja', 'SV2a', 'Japanese set with TCGdex image bases'),
    await probeTcgdexSample('ja', 'M1L', 'Japanese set with missing TCGdex image bases'),
    await probeTcgdexSample('zh-tw', 'SV2a', 'Chinese set with TCGdex image bases'),
    await probeTcgdexSample('zh-tw', 'SC2a', 'Chinese set with missing TCGdex image bases'),
  ];
  const pokedataProbes = await probePokeDataSamples();
  const supabaseAudit = await runSupabaseAudit();

  const { sets: chineseSets, cards: chineseCards } = await loadPokeDataChineseFiles();
  const providerCoverage = {
    generated_at: nowIso(),
    tcgdex: tcgdexSets,
    pokedata_chinese_local_export: {
      sets: chineseSets.length,
      cards: chineseCards.length,
      cards_with_images: chineseCards.filter((card) => card.image).length,
      priced_cards: chineseCards.filter((card) => card.prices?.has_live_value).length,
      unpriced_cards: chineseCards.filter((card) => !card.prices?.has_live_value).length,
    },
  };

  const imageProbes = {
    generated_at: nowIso(),
    tcgdex_samples: tcgdexSamples,
    pokedata_samples: pokedataProbes,
  };

  await fs.writeFile(path.join(OUTPUT_DIR, 'provider-coverage-report.json'), JSON.stringify(providerCoverage, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'provider-image-probes.json'), JSON.stringify(imageProbes, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'live-supabase-catalogue-report.json'), JSON.stringify(supabaseAudit, null, 2));
  if (supabaseAudit.available) {
    await fs.writeFile(path.join(OUTPUT_DIR, 'missing-image-report.json'), JSON.stringify(supabaseAudit.missing_image_report, null, 2));
    await fs.writeFile(path.join(OUTPUT_DIR, 'set-coverage-report.json'), JSON.stringify(supabaseAudit.set_coverage_rows, null, 2));
    await fs.writeFile(path.join(OUTPUT_DIR, 'pricing-coverage-report.json'), JSON.stringify(supabaseAudit.pricing_coverage_report, null, 2));
    await fs.writeFile(path.join(OUTPUT_DIR, 'failed-record-report.json'), JSON.stringify(supabaseAudit.failed_record_report, null, 2));
  }

  console.log(JSON.stringify({
    ok: true,
    output_dir: OUTPUT_DIR,
    provider_coverage: providerCoverage,
    supabase_available: supabaseAudit.available,
    supabase_summary: supabaseAudit.available ? {
      catalogue_health: supabaseAudit.catalogue_health,
      missing_images: supabaseAudit.missing_image_summary,
      pricing: supabaseAudit.pricing_coverage_report,
    } : supabaseAudit,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
