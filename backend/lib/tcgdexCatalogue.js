import sharp from 'sharp';
import {
  getEnglishCardDisplayName,
  getEnglishSetDisplayName,
  getPreferredSetDisplayName,
} from './cardDisplayNames.js';
import { normalizeTcgdexLanguage } from './tcgdex.js';

const TCGDEX_BASE_URL = process.env.TCGDEX_API_BASE_URL || 'https://api.tcgdex.net/v2';
const TCGDEX_CACHE_TTL_MS = Number(process.env.TCGDEX_CACHE_TTL_MS || 10 * 60 * 1000);
const TCGDEX_BATCH_SIZE = Math.max(1, Math.min(Number(process.env.TCGDEX_SYNC_BATCH_SIZE || 12), 24));
const MIN_CARD_IMAGE_WIDTH = Number(process.env.MIN_CARD_IMAGE_WIDTH || 120);
const MIN_CARD_IMAGE_HEIGHT = Number(process.env.MIN_CARD_IMAGE_HEIGHT || 160);
const DISPLAY_CURRENCY = String(process.env.STACKR_DISPLAY_CURRENCY || 'GBP').toUpperCase();
const USD_TO_GBP = Number(process.env.USD_TO_GBP || 0.79);
const EUR_TO_GBP = Number(process.env.EUR_TO_GBP || 0.86);
const JPY_TO_GBP = Number(process.env.JPY_TO_GBP || 0.0051);
const STACKR_CARD_IMAGE_BUCKET = String(process.env.STACKR_CARD_IMAGE_BUCKET || 'card-images').trim();
const STACKR_CACHE_PROVIDER_IMAGES = String(process.env.STACKR_CACHE_PROVIDER_IMAGES || '').toLowerCase() === 'true';
const POKEWALLET_API_KEY = process.env.POKEWALLET_API_KEY;
const POKEWALLET_API_BASE_URL = process.env.POKEWALLET_API_BASE_URL || 'https://api.pokewallet.io';
const POKEWALLET_TIMEOUT_MS = Number(process.env.POKEWALLET_TIMEOUT_MS || 7000);
const STACKR_API_PUBLIC_URL = (
  process.env.STACKR_API_PUBLIC_URL
  || process.env.API_BASE_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
).replace(/\/$/, '');

const tcgdexFetchCache = new Map();
const imageProbeCache = new Map();
const pokeWalletSetCache = new Map();

const SUPPORTED_LANGUAGES = new Set(['en', 'ja', 'zh-tw']);
const PROVIDER = 'tcgdex';
const JAPANESE_CARD_UNIVERSE_TARGET = Number(process.env.STACKR_JAPANESE_CARD_UNIVERSE_TARGET || 30000);
const IMAGE_STATUS_PRIORITY = new Map([
  ['resolved', 1],
  ['resolved_secondary', 2],
  ['temporarily_unavailable', 3],
  ['needs_review', 4],
  ['invalid', 5],
  ['missing', 6],
]);
const PRICE_PRIORITY = new Map([
  ['recent_sold', 1],
  ['market', 2],
  ['average_sold', 3],
  ['low_listing', 4],
  ['estimated', 5],
  ['active_listing', 6],
  ['unavailable', 7],
]);

function nowIso() {
  return new Date().toISOString();
}

function addMs(date, ms) {
  return new Date(date.getTime() + ms).toISOString();
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function toNumberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function money(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

function normalizeLanguage(value = 'en') {
  const language = normalizeTcgdexLanguage(value);
  if (!SUPPORTED_LANGUAGES.has(language)) return 'en';
  return language;
}

export function getCatalogueRegion(language = 'en') {
  const lang = normalizeLanguage(language);
  if (lang === 'ja') return 'japan';
  if (lang === 'zh-tw') return 'taiwan';
  return 'international';
}

export function createTCGdexClient(language = 'en') {
  const lang = normalizeLanguage(language);
  const baseUrl = TCGDEX_BASE_URL.replace(/\/$/, '');

  async function fetchJson(path) {
    const cleanPath = String(path || '').startsWith('/') ? String(path) : `/${path}`;
    const url = `${baseUrl}/${lang}${cleanPath}`;
    const cached = tcgdexFetchCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    console.log(JSON.stringify({
      event: 'provider_request',
      provider: PROVIDER,
      language: lang,
      url,
    }));

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`TCGdex ${lang} request failed (${response.status}) for ${url}: ${raw.slice(0, 240)}`);
    }
    const value = raw ? JSON.parse(raw) : null;
    tcgdexFetchCache.set(url, { value, expiresAt: Date.now() + TCGDEX_CACHE_TTL_MS });
    return value;
  }

  return {
    language: lang,
    region: getCatalogueRegion(lang),
    series: () => fetchJson('/series'),
    sets: () => fetchJson('/sets'),
    set: (setId) => fetchJson(`/sets/${encodeURIComponent(stripLanguagePrefix(setId))}`),
    card: (cardId) => fetchJson(`/cards/${encodeURIComponent(stripLanguagePrefix(cardId))}`),
  };
}

function stripLanguagePrefix(value) {
  return String(value || '').trim().replace(/^(en|ja|jp|zh-tw|zh_tw|zhtw|zh):/i, '');
}

function stackrSetId(language, providerSetId) {
  const id = stripLanguagePrefix(providerSetId);
  return normalizeLanguage(language) === 'en' ? id : `${normalizeLanguage(language)}:${id}`;
}

function stackrCardId(language, providerCardId) {
  const id = stripLanguagePrefix(providerCardId);
  return normalizeLanguage(language) === 'en' ? id : `${normalizeLanguage(language)}:${id}`;
}

function canonicalProviderRecordId(language, providerRecordId) {
  const id = stripLanguagePrefix(providerRecordId);
  return normalizeLanguage(language) === 'en' ? id : `${normalizeLanguage(language)}:${id}`;
}

function canonicalName(card) {
  return card?.name ?? card?.localName ?? card?.id ?? 'Unknown card';
}

function mapSetCardCounts(set) {
  const cardCount = set?.cardCount ?? {};
  const total = toNumberOrNull(cardCount.total ?? cardCount.official ?? set?.cards?.length);
  return {
    printedTotal: toNumberOrNull(cardCount.official ?? cardCount.total),
    actualTotal: total,
    providerReportedTotal: total ?? (Array.isArray(set?.cards) ? set.cards.length : 0),
  };
}

function mapReleaseDate(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function buildSetDisplayNames({ language, region, id, sourceId, setCode, localName, canonicalName, raw }) {
  const englishDisplayName = language === 'en'
    ? (localName ?? canonicalName ?? sourceId ?? id ?? null)
    : getEnglishSetDisplayName({
      id,
      sourceId,
      setCode,
      language,
      region,
      localName,
      canonicalName,
      raw,
    });
  const displayName = getPreferredSetDisplayName({
    id,
    sourceId,
    setCode,
    language,
    region,
    localName,
    englishDisplayName,
    canonicalName,
    raw,
  });
  return { englishDisplayName, displayName };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function imageBaseFromRecord(card) {
  const candidates = [
    card?.image,
    card?.images?.large,
    card?.images?.small,
    card?.raw?.image,
    card?.raw_source?.image,
  ];
  return candidates.map((candidate) => String(candidate || '').trim()).find(Boolean) ?? null;
}

function hasImageExtension(url) {
  return /\.(webp|png|jpe?g)(?:[?#].*)?$/i.test(String(url || ''));
}

function imageFormatFromUrl(url) {
  const match = String(url || '').match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  const value = match?.[1]?.toLowerCase();
  if (value === 'jpeg') return 'jpg';
  return value || null;
}

function withTcgdexFileAsset(url, format = 'webp') {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (hasImageExtension(raw)) return raw;
  return `${raw.replace(/\/$/, '')}.${format}`;
}

function normalizeTcgdexSetAssetUrl(url, format = 'webp') {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const withoutCardQuality = raw.replace(/\/(?:high|low)\.(webp|png|jpe?g)(?:[?#].*)?$/i, '');
  return withTcgdexFileAsset(withoutCardQuality, format);
}

function normalizeTcgdexCardAssetUrl(url, quality = 'high', format = 'webp') {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (/^\/api\//i.test(raw)) return resolveStackrAssetUrl(raw);
  const safe = safeUrl(raw);
  if (!safe) return null;
  if (hasImageExtension(safe)) return safe;
  return `${safe.replace(/\/$/, '')}/${quality}.${format}`;
}

function getRawSetCoverImageUrl(raw) {
  const direct = normalizeTcgdexCardAssetUrl(
    raw?.cover_image_url
      ?? raw?.coverImageUrl
      ?? raw?.images?.cover
      ?? raw?.images?.artwork
      ?? raw?.image
  );
  if (direct) return direct;

  const cards = Array.isArray(raw?.cards) ? raw.cards : [];
  const cardWithImage = cards.find((card) => String(card?.image ?? card?.images?.large ?? card?.images?.small ?? '').trim());
  return normalizeTcgdexCardAssetUrl(cardWithImage?.image ?? cardWithImage?.images?.large ?? cardWithImage?.images?.small);
}

function providerTimestamp(value) {
  if (value == null || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || !/^https:\/\//i.test(raw)) return null;
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function resolveStackrAssetUrl(path) {
  const raw = String(path || '').trim();
  if (!raw) return null;
  if (/^https:\/\//i.test(raw)) return safeUrl(raw);
  if (!raw.startsWith('/')) return null;
  return STACKR_API_PUBLIC_URL ? `${STACKR_API_PUBLIC_URL}${raw}` : raw;
}

function pokeWalletLanguage(language) {
  const lang = normalizeLanguage(language);
  if (lang === 'ja') return 'jap';
  if (lang === 'en') return 'eng';
  return lang;
}

function buildPokeWalletSetImagePath(providerSetId, language) {
  const setCode = stripLanguagePrefix(providerSetId);
  if (!setCode) return null;
  const params = new URLSearchParams({ language: pokeWalletLanguage(language) });
  return `/api/pokewallet/set-images/${encodeURIComponent(setCode)}?${params.toString()}`;
}

function normalizePokeWalletSetPayload(payload) {
  return payload?.data?.set ?? payload?.data ?? payload?.set ?? payload ?? null;
}

function normalizePokeWalletCards(payload) {
  const data = payload?.data ?? payload;
  const candidates = [
    data?.cards,
    data?.results,
    data?.card_list,
    data?.items,
    payload?.cards,
    payload?.results,
  ];
  return candidates.find(Array.isArray) ?? [];
}

function pokeWalletCardId(card, fallbackSetId = null, fallbackIndex = 0) {
  const explicit = cleanText(
    card?.id
    ?? card?.card_id
    ?? card?.cardId
    ?? card?.uuid
    ?? card?.slug
  );
  if (explicit) return explicit;
  const number = cleanText(pokeWalletCardNumber(card)) ?? `row-${fallbackIndex + 1}`;
  const name = cleanText(pokeWalletEnglishCardName(card) ?? card?.name ?? card?.card_info?.jp_name) ?? 'unknown';
  return `${fallbackSetId ?? 'unknown-set'}:${number}:${name}`.toLowerCase().replace(/[^a-z0-9:.-]+/g, '-');
}

function pokeWalletCardNumber(card) {
  return cleanText(
    card?.card_info?.card_number
    ?? card?.cardInfo?.card_number
    ?? card?.cardInfo?.number
    ?? card?.number
    ?? card?.localId
    ?? card?.local_id
  );
}

function normalizePokeWalletCollectorNumber(value) {
  const text = cleanText(value);
  if (!text) return null;
  const first = text.split('/')[0] ?? text;
  const numeric = first.match(/\d+/)?.[0];
  return numeric ? String(Number(numeric)) : first.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function pokeWalletEnglishCardName(card) {
  return cleanText(
    card?.card_info?.name
    ?? card?.card_info?.clean_name
    ?? card?.cardInfo?.name
    ?? card?.name
    ?? card?.clean_name
  );
}

function pokeWalletSetName(set) {
  return cleanText(set?.name ?? set?.set_name ?? set?.card_info?.set_name);
}

function pokeWalletSetId(set) {
  return cleanText(set?.set_id ?? set?.id ?? set?.group_id ?? set?.groupId);
}

async function fetchPokeWalletSet(providerSetId, language) {
  const setCode = stripLanguagePrefix(providerSetId);
  if (!POKEWALLET_API_KEY || !setCode) return null;
  const lang = pokeWalletLanguage(language);
  const cacheKey = `${lang}:${setCode.toLowerCase()}`;
  const cached = pokeWalletSetCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = new URL(`${POKEWALLET_API_BASE_URL.replace(/\/$/, '')}/sets/${encodeURIComponent(setCode)}`);
  url.searchParams.set('language', lang);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POKEWALLET_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-API-Key': POKEWALLET_API_KEY,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    if (!response.ok) {
      console.log(JSON.stringify({
        event: 'provider_set_enrichment_failed',
        provider: 'pokewallet',
        language,
        setId: setCode,
        status: response.status,
        failureReason: payload?.message ?? payload?.error ?? text.slice(0, 180),
      }));
      pokeWalletSetCache.set(cacheKey, { value: null, expiresAt: Date.now() + 30 * 60 * 1000 });
      return null;
    }
    const value = {
      raw: payload,
      set: normalizePokeWalletSetPayload(payload),
      cards: normalizePokeWalletCards(payload),
      sourceUrl: url.toString(),
    };
    pokeWalletSetCache.set(cacheKey, { value, expiresAt: Date.now() + TCGDEX_CACHE_TTL_MS });
    return value;
  } catch (error) {
    console.log(JSON.stringify({
      event: 'provider_set_enrichment_failed',
      provider: 'pokewallet',
      language,
      setId: setCode,
      failureReason: error instanceof Error ? error.message : String(error),
    }));
    pokeWalletSetCache.set(cacheKey, { value: null, expiresAt: Date.now() + 30 * 60 * 1000 });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPokeWalletProviderAsset(providerSetId, language, enrichment) {
  if (!POKEWALLET_API_KEY || !enrichment?.set) return null;
  const setCode = stripLanguagePrefix(providerSetId);
  const imagePath = buildPokeWalletSetImagePath(pokeWalletSetId(enrichment?.set) ?? setCode, language)
    ?? buildPokeWalletSetImagePath(setCode, language);
  return {
    provider: 'pokewallet',
    set_id: pokeWalletSetId(enrichment?.set),
    set_code: cleanText(enrichment?.set?.set_code ?? setCode),
    language: pokeWalletLanguage(language),
    english_name: pokeWalletSetName(enrichment?.set),
    card_count: toNumberOrNull(enrichment?.set?.card_count ?? enrichment?.set?.cardCount),
    image_proxy_path: imagePath,
    image_proxy_url: resolveStackrAssetUrl(imagePath),
    source_url: enrichment?.sourceUrl ?? null,
  };
}

function mergeCardsWithPokeWallet(language, providerSetId, cards, enrichment) {
  if (!enrichment?.cards?.length || normalizeLanguage(language) !== 'ja') return cards;
  const byNumber = new Map();
  for (const card of enrichment.cards) {
    const key = normalizePokeWalletCollectorNumber(pokeWalletCardNumber(card));
    if (key && !byNumber.has(key)) byNumber.set(key, card);
  }
  if (!byNumber.size) return cards;

  return cards.map((card) => {
    const key = normalizePokeWalletCollectorNumber(card?.localId ?? card?.local_id);
    const matched = key ? byNumber.get(key) : null;
    if (!matched) return card;
    const englishName = pokeWalletEnglishCardName(matched);
    if (!englishName) return card;
    return {
      ...card,
      englishName,
      english_display_name: englishName,
      provider_assets: {
        ...(card?.provider_assets ?? {}),
        pokewallet: {
          provider: 'pokewallet',
          id: cleanText(matched?.id),
          card_number: pokeWalletCardNumber(matched),
          english_name: englishName,
          raw: matched,
        },
      },
    };
  });
}

async function writePokeWalletProviderRecords(db, language, setRow, enrichment) {
  const cards = normalizePokeWalletCards(enrichment);
  if (normalizeLanguage(language) !== 'ja' || !cards.length) {
    return { retrieved_total: cards.length, stored_total: 0, skipped: true };
  }

  const region = getCatalogueRegion(language);
  const providerSetId = stripLanguagePrefix(setRow?.source_id ?? setRow?.set_code ?? enrichment?.set?.id ?? enrichment?.set?.set_code);
  const now = nowIso();
  const rows = cards.map((card, index) => {
    const recordId = pokeWalletCardId(card, providerSetId, index);
    const number = pokeWalletCardNumber(card);
    const englishName = pokeWalletEnglishCardName(card);
    return {
      provider: 'pokewallet',
      provider_record_type: 'japanese_card_variant',
      provider_record_id: recordId,
      language,
      region,
      source_url: `${POKEWALLET_API_BASE_URL.replace(/\/$/, '')}/sets/${encodeURIComponent(providerSetId)}?language=${encodeURIComponent(pokeWalletLanguage(language))}`,
      response_status: 'complete',
      raw_payload: {
        ...card,
        provider: 'pokewallet',
        provider_set_id: providerSetId,
        stackr_set_id: setRow?.id ?? null,
        tcgdex_set_id: setRow?.source_id ?? providerSetId,
        card_number: number,
        english_display_name: englishName,
        retrieved_from: 'set_enrichment',
      },
      retrieved_at: now,
      updated_at: now,
    };
  });

  let stored = 0;
  for (let index = 0; index < rows.length; index += TCGDEX_BATCH_SIZE * 25) {
    const batch = rows.slice(index, index + TCGDEX_BATCH_SIZE * 25);
    const { error } = await db
      .from('provider_card_records')
      .upsert(batch, { onConflict: 'provider,provider_record_id' });

    if (error) {
      console.log(JSON.stringify({
        event: 'provider_variant_record_upsert_failed',
        provider: 'pokewallet',
        language,
        setId: setRow?.id ?? providerSetId,
        failureReason: error.message,
      }));
      return { retrieved_total: rows.length, stored_total: stored, skipped: true, error: error.message };
    }
    stored += batch.length;
  }

  return { retrieved_total: rows.length, stored_total: stored, skipped: false };
}

function uniqueByUrl(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const url = safeUrl(candidate.url);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    candidate.url = url;
    return true;
  });
}

function buildTcgdexImageCandidates(card) {
  const base = safeUrl(imageBaseFromRecord(card));
  if (!base) return [];
  if (hasImageExtension(base)) {
    return uniqueByUrl([{
      provider: PROVIDER,
      source: PROVIDER,
      url: base,
      quality: /\/high[/.]?/i.test(base) || /_hires/i.test(base) ? 'high' : 'original',
      format: imageFormatFromUrl(base),
      base,
    }]);
  }

  const clean = base.replace(/\/$/, '');
  const patterns = [
    ['high', 'webp', `${clean}/high.webp`],
    ['high', 'png', `${clean}/high.png`],
    ['high', 'jpg', `${clean}/high.jpg`],
    ['high', 'jpg', `${clean}/high.jpeg`],
    ['low', 'webp', `${clean}/low.webp`],
    ['low', 'png', `${clean}/low.png`],
    ['low', 'jpg', `${clean}/low.jpg`],
    ['low', 'jpg', `${clean}/low.jpeg`],
    ['original', 'webp', `${clean}.webp`],
    ['original', 'png', `${clean}.png`],
    ['original', 'jpg', `${clean}.jpg`],
    ['original', 'jpg', `${clean}.jpeg`],
  ];

  return uniqueByUrl(patterns.map(([quality, format, url]) => ({
    provider: PROVIDER,
    source: PROVIDER,
    url,
    quality,
    format,
    base,
  })));
}

function normalizeCollectorNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/^0+(\d)/, '$1');
}

function getSetCodeForSecondary(card) {
  return stripLanguagePrefix(card?.set?.id ?? card?.provider_set_id ?? card?.set_id ?? '').trim();
}

const pokemonTcgImageProvider = {
  name: 'pokemon_tcg_api',
  async supports(card) {
    return normalizeLanguage(card?.language) === 'en'
      && Boolean(getSetCodeForSecondary(card))
      && Boolean(normalizeCollectorNumber(card?.localId ?? card?.collector_number ?? card?.number));
  },
  async findImages(card) {
    const setCode = getSetCodeForSecondary(card);
    const rawNumber = String(card?.localId ?? card?.collector_number ?? card?.number ?? '').trim();
    const number = normalizeCollectorNumber(rawNumber);
    const numbers = [...new Set([rawNumber, number].filter(Boolean))];
    return uniqueByUrl(numbers.flatMap((candidateNumber) => {
      const encodedNumber = encodeURIComponent(candidateNumber);
      const base = `https://images.pokemontcg.io/${encodeURIComponent(setCode)}/${encodedNumber}`;
      return [
        {
          provider: pokemonTcgImageProvider.name,
          source: pokemonTcgImageProvider.name,
          url: `${base}_hires.png`,
          quality: 'high',
          format: 'png',
          base,
        },
        {
          provider: pokemonTcgImageProvider.name,
          source: pokemonTcgImageProvider.name,
          url: `${base}.png`,
          quality: 'low',
          format: 'png',
          base,
        },
      ];
    }));
  },
};

const SECONDARY_IMAGE_PROVIDERS = [pokemonTcgImageProvider];

async function probeImageCandidate(candidate) {
  const cached = imageProbeCache.get(candidate.url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const startedAt = Date.now();
  let result;
  try {
    const response = await fetch(candidate.url, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5',
        'User-Agent': 'StackR catalogue image resolver',
      },
      redirect: 'follow',
    });
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const httpStatus = response.status;

    if (!response.ok) {
      result = {
        ok: false,
        status: 'temporarily_unavailable',
        httpStatus,
        contentType,
        failureReason: `HTTP ${httpStatus}`,
      };
    } else if (!contentType.startsWith('image/')) {
      result = {
        ok: false,
        status: contentType.includes('html') ? 'invalid' : 'missing',
        httpStatus,
        contentType,
        failureReason: `Expected image content, received ${contentType || 'unknown content type'}`,
      };
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
      const width = toInt(metadata.width, 0);
      const height = toInt(metadata.height, 0);
      if (width < MIN_CARD_IMAGE_WIDTH || height < MIN_CARD_IMAGE_HEIGHT) {
        result = {
          ok: false,
          status: 'invalid',
          httpStatus,
          contentType,
          width,
          height,
          failureReason: `Image too small (${width}x${height})`,
        };
      } else {
        result = {
          ok: true,
          status: candidate.source === PROVIDER ? 'resolved' : 'resolved_secondary',
          httpStatus,
          contentType,
          width,
          height,
          durationMs: Date.now() - startedAt,
        };
      }
    }
  } catch (error) {
    result = {
      ok: false,
      status: 'temporarily_unavailable',
      httpStatus: null,
      contentType: null,
      failureReason: error instanceof Error ? error.message : String(error),
    };
  }

  imageProbeCache.set(candidate.url, {
    value: result,
    expiresAt: Date.now() + (result.ok ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000),
  });
  return result;
}

async function insertImageCheck(db, cardId, candidate, result) {
  const payload = {
    card_id: cardId,
    provider: candidate.provider,
    provider_image_base: candidate.base ?? null,
    candidate_url: candidate.url,
    http_status: result.httpStatus ?? null,
    content_type: result.contentType ?? null,
    image_width: result.width ?? null,
    image_height: result.height ?? null,
    resolution_status: result.status,
    failure_reason: result.failureReason ?? null,
    checked_at: nowIso(),
  };

  const { error } = await db.from('card_image_checks').insert(payload);
  if (error) console.log('card_image_checks insert failed:', error.message);
}

async function upsertImageResolution(db, cardId, candidate, result) {
  const now = nowIso();
  const status = result.status;
  const resolvedUrl = result.ok ? candidate.url : null;
  const retryAfter = result.ok
    ? null
    : addMs(new Date(), status === 'temporarily_unavailable' ? 6 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000);
  let variants = resolvedUrl
    ? {
      original: resolvedUrl,
      thumbnail: resolvedUrl,
      grid: resolvedUrl,
      detail: resolvedUrl,
      zoom: candidate.quality === 'high' || candidate.quality === 'original' ? resolvedUrl : null,
    }
    : {};
  if (resolvedUrl) {
    variants = await cacheImageVariantsIfAllowed(db, cardId, candidate, result, variants);
  }
  const displayUrl = variants.grid ?? variants.detail ?? variants.original ?? resolvedUrl ?? null;

  const payload = {
    card_id: cardId,
    provider: candidate.provider,
    provider_image_base: candidate.base ?? null,
    resolved_image_url: displayUrl,
    resolved_format: result.ok ? candidate.format ?? imageFormatFromUrl(candidate.url) : null,
    resolved_quality: result.ok ? candidate.quality ?? null : null,
    image_width: result.width ?? null,
    image_height: result.height ?? null,
    content_type: result.contentType ?? null,
    resolution_status: status,
    resolution_source: candidate.source,
    variants,
    last_verified_at: now,
    failure_reason: result.failureReason ?? null,
    retry_after: retryAfter,
    updated_at: now,
  };

  const { error } = await db
    .from('card_images')
    .upsert(payload, { onConflict: 'card_id,provider,resolution_source' });
  if (error) throw error;

  const imageStatus = status;
  const imageSmall = variants.grid ?? displayUrl ?? null;
  const imageLarge = variants.detail ?? variants.zoom ?? displayUrl ?? null;
  await Promise.all([
    db.from('tcg_cards').update({
      image_status: imageStatus,
      image_small_url: imageSmall,
      image_large_url: imageLarge,
      last_image_checked_at: now,
      updated_at: now,
    }).eq('id', cardId),
    db.from('card_printings').update({
      image_status: imageStatus,
      image_small_url: imageSmall,
      image_large_url: imageLarge,
      updated_at: now,
    }).eq('card_id', cardId),
    db.from('pokemon_cards').update({
      image_small: imageSmall,
      image_large: imageLarge,
      image_status: imageStatus,
      last_synced_at: now,
    }).eq('id', cardId),
  ]);
}

function safeStoragePathPart(value) {
  return String(value || '')
    .trim()
    .replace(/^(en|ja|jp|zh-tw|zh_tw|zhtw|zh):/i, (match) => match.toLowerCase().replace(/_/g, '-'))
    .replace(/[^a-zA-Z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'card';
}

async function uploadImageVariant(db, bucket, path, buffer, contentType) {
  const storage = db.storage?.from?.(bucket);
  if (!storage) return null;
  const { error } = await storage.upload(path, buffer, {
    cacheControl: '31536000',
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = storage.getPublicUrl(path);
  return data?.publicUrl ?? null;
}

async function cacheImageVariantsIfAllowed(db, cardId, candidate, result, fallbackVariants) {
  if (!STACKR_CACHE_PROVIDER_IMAGES || !STACKR_CARD_IMAGE_BUCKET || !db.storage?.from) {
    return fallbackVariants;
  }

  try {
    const response = await fetch(candidate.url, {
      headers: { Accept: 'image/webp,image/png,image/jpeg,*/*' },
    });
    if (!response.ok) return fallbackVariants;
    const sourceBuffer = Buffer.from(await response.arrayBuffer());
    const cardPath = safeStoragePathPart(cardId);
    const originalFormat = candidate.format || imageFormatFromUrl(candidate.url) || 'webp';
    const originalContentType = result.contentType || response.headers.get('content-type') || 'image/webp';
    const originalPath = `cards/${cardPath}/original.${originalFormat === 'jpg' ? 'jpg' : originalFormat}`;
    const thumbnailPath = `cards/${cardPath}/thumbnail.webp`;
    const gridPath = `cards/${cardPath}/grid.webp`;
    const detailPath = `cards/${cardPath}/detail.webp`;
    const zoomPath = `cards/${cardPath}/zoom.webp`;

    const [original, thumbnail, grid, detail, zoom] = await Promise.all([
      uploadImageVariant(db, STACKR_CARD_IMAGE_BUCKET, originalPath, sourceBuffer, originalContentType),
      sharp(sourceBuffer).resize({ width: 180, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
        .then((buffer) => uploadImageVariant(db, STACKR_CARD_IMAGE_BUCKET, thumbnailPath, buffer, 'image/webp')),
      sharp(sourceBuffer).resize({ width: 360, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer()
        .then((buffer) => uploadImageVariant(db, STACKR_CARD_IMAGE_BUCKET, gridPath, buffer, 'image/webp')),
      sharp(sourceBuffer).resize({ width: 900, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer()
        .then((buffer) => uploadImageVariant(db, STACKR_CARD_IMAGE_BUCKET, detailPath, buffer, 'image/webp')),
      sharp(sourceBuffer).webp({ quality: 92 }).toBuffer()
        .then((buffer) => uploadImageVariant(db, STACKR_CARD_IMAGE_BUCKET, zoomPath, buffer, 'image/webp')),
    ]);

    const variants = {
      ...fallbackVariants,
      original: original ?? fallbackVariants.original,
      thumbnail: thumbnail ?? fallbackVariants.thumbnail,
      grid: grid ?? fallbackVariants.grid,
      detail: detail ?? fallbackVariants.detail,
      zoom: zoom ?? fallbackVariants.zoom,
    };
    console.log(JSON.stringify({
      event: 'image_cache_write',
      provider: candidate.provider,
      cardId,
      bucket: STACKR_CARD_IMAGE_BUCKET,
      cacheHitOrMiss: 'miss',
      selectedImageFormat: 'webp',
    }));
    return variants;
  } catch (error) {
    console.log(JSON.stringify({
      event: 'image_cache_failure',
      provider: candidate.provider,
      cardId,
      bucket: STACKR_CARD_IMAGE_BUCKET,
      failureReason: error instanceof Error ? error.message : String(error),
    }));
    return fallbackVariants;
  }
}

async function getCachedImageResolution(db, cardId) {
  const { data, error } = await db
    .from('card_images')
    .select('*')
    .eq('card_id', cardId)
    .order('last_verified_at', { ascending: false, nullsFirst: false })
    .limit(10);
  if (error) return null;
  const rows = Array.isArray(data) ? data : [];
  const resolved = rows
    .filter((row) => ['resolved', 'resolved_secondary'].includes(row.resolution_status) && row.resolved_image_url)
    .sort((a, b) => (IMAGE_STATUS_PRIORITY.get(a.resolution_status) ?? 99) - (IMAGE_STATUS_PRIORITY.get(b.resolution_status) ?? 99))[0];
  if (resolved) return resolved;

  const blocked = rows.find((row) => row.retry_after && new Date(row.retry_after).getTime() > Date.now());
  return blocked ?? null;
}

export async function resolveCardImage(db, cardRecord, options = {}) {
  const language = normalizeLanguage(cardRecord?.language ?? options.language ?? 'en');
  const cardId = cardRecord?.stackrCardId ?? cardRecord?.id ?? stackrCardId(language, cardRecord?.providerCardId ?? cardRecord?.source_id);
  if (!cardId) return null;

  const cached = await getCachedImageResolution(db, cardId);
  if (!options.force) {
    if (cached?.resolution_status && ['resolved', 'resolved_secondary'].includes(cached.resolution_status)) {
      return cached;
    }
    if (cached?.retry_after && new Date(cached.retry_after).getTime() > Date.now()) {
      return cached;
    }
  }

  const tcgdexCandidates = buildTcgdexImageCandidates({ ...cardRecord, language });
  const secondaryCandidates = [];
  for (const provider of SECONDARY_IMAGE_PROVIDERS) {
    try {
      if (await provider.supports({ ...cardRecord, language })) {
        secondaryCandidates.push(...await provider.findImages({ ...cardRecord, language }));
      }
    } catch (error) {
      console.log(JSON.stringify({
        event: 'image_provider_failure',
        provider: provider.name,
        language,
        cardId,
        reason: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const candidates = [...tcgdexCandidates, ...secondaryCandidates];
  let lastFailure = null;
  for (const candidate of candidates) {
    console.log(JSON.stringify({
      event: 'image_candidate_check',
      provider: candidate.provider,
      language,
      cardId,
      providerCardId: cardRecord?.providerCardId ?? cardRecord?.source_id ?? cardRecord?.id ?? null,
      imageBasePath: candidate.base ?? null,
      candidateImageUrl: candidate.url,
    }));
    const result = await probeImageCandidate(candidate);
    await insertImageCheck(db, cardId, candidate, result);
    console.log(JSON.stringify({
      event: 'image_candidate_result',
      provider: candidate.provider,
      language,
      cardId,
      candidateImageUrl: candidate.url,
      imageHttpStatus: result.httpStatus,
      imageMimeType: result.contentType,
      selectedImageFormat: result.ok ? candidate.format : null,
      status: result.status,
      failureReason: result.failureReason ?? null,
    }));
    if (result.ok) {
      await upsertImageResolution(db, cardId, candidate, result);
      return {
        card_id: cardId,
        provider: candidate.provider,
        provider_image_base: candidate.base ?? null,
        resolved_image_url: candidate.url,
        resolved_format: candidate.format,
        resolved_quality: candidate.quality,
        image_width: result.width,
        image_height: result.height,
        content_type: result.contentType,
        resolution_status: result.status,
        resolution_source: candidate.source,
        last_verified_at: nowIso(),
      };
    }
    lastFailure = { candidate, result };
  }

  if (cached?.resolution_status && ['resolved', 'resolved_secondary'].includes(cached.resolution_status) && cached.resolved_image_url) {
    console.log(JSON.stringify({
      event: 'image_resolution_preserved_after_failed_recheck',
      provider: cached.provider ?? PROVIDER,
      language,
      cardId,
      resolvedImageUrl: cached.resolved_image_url,
      failureReason: lastFailure?.result?.failureReason ?? 'No candidate image resolved during forced recheck',
    }));
    return cached;
  }

  const missingCandidate = lastFailure?.candidate ?? {
    provider: PROVIDER,
    source: PROVIDER,
    url: null,
    base: imageBaseFromRecord(cardRecord),
    quality: null,
    format: null,
  };
  const failure = lastFailure?.result ?? {
    ok: false,
    status: 'missing',
    failureReason: 'Provider supplied no image base path',
  };
  await upsertImageResolution(db, cardId, missingCandidate, failure);
  return {
    card_id: cardId,
    provider: missingCandidate.provider,
    provider_image_base: missingCandidate.base ?? null,
    resolved_image_url: null,
    resolution_status: failure.status,
    resolution_source: missingCandidate.source,
    failure_reason: failure.failureReason,
    retry_after: addMs(new Date(), 7 * 24 * 60 * 60 * 1000),
  };
}

function displayCurrencyRate(currency) {
  const unit = String(currency || '').toUpperCase();
  if (unit === DISPLAY_CURRENCY) return 1;
  if (DISPLAY_CURRENCY !== 'GBP') return null;
  if (unit === 'USD') return USD_TO_GBP;
  if (unit === 'EUR') return EUR_TO_GBP;
  if (unit === 'JPY') return JPY_TO_GBP;
  return null;
}

function convertDisplayPrice(value, currency) {
  const number = toNumberOrNull(value);
  if (number == null) return { displayPrice: null, exchangeRate: null };
  const rate = displayCurrencyRate(currency);
  if (rate == null) return { displayPrice: null, exchangeRate: null };
  return { displayPrice: money(number * rate), exchangeRate: rate };
}

function tcgplayerPriceRows(card, language, region) {
  const tcgplayer = card?.pricing?.tcgplayer;
  if (!tcgplayer || language !== 'en') return [];
  const currency = String(tcgplayer.unit || 'USD').toUpperCase();
  const variants = Object.entries(tcgplayer)
    .filter(([key, value]) => !['unit', 'updated'].includes(key) && value && typeof value === 'object');

  return variants.flatMap(([variant, value]) => {
    const rows = [];
    const market = toNumberOrNull(value.marketPrice ?? value.midPrice);
    const low = toNumberOrNull(value.lowPrice ?? value.directLowPrice);
    const high = toNumberOrNull(value.highPrice);
    if (market != null) {
      const { displayPrice, exchangeRate } = convertDisplayPrice(market, currency);
      rows.push({
        entity_id: stackrCardId(language, card.id),
        entity_type: 'card',
        language,
        region,
        condition: variant || 'raw',
        currency,
        price_type: 'market',
        low,
        market,
        average: toNumberOrNull(value.midPrice),
        high,
        original_price: market,
        original_currency: currency,
        exchange_rate: exchangeRate,
        exchange_rate_timestamp: nowIso(),
        display_price: displayPrice,
        display_currency: DISPLAY_CURRENCY,
        provider: 'tcgdex_tcgplayer',
        provider_record_id: String(value.productId ?? card.id),
        provider_updated_at: providerTimestamp(tcgplayer.updated),
        retrieved_at: nowIso(),
        confidence: value.productId ? 'high' : 'medium',
        pricing_status: 'priced',
        raw_payload: { variant, ...value },
      });
    }
    if (low != null && market == null) {
      const { displayPrice, exchangeRate } = convertDisplayPrice(low, currency);
      rows.push({
        entity_id: stackrCardId(language, card.id),
        entity_type: 'card',
        language,
        region,
        condition: variant || 'raw',
        currency,
        price_type: 'low_listing',
        low,
        original_price: low,
        original_currency: currency,
        exchange_rate: exchangeRate,
        exchange_rate_timestamp: nowIso(),
        display_price: displayPrice,
        display_currency: DISPLAY_CURRENCY,
        provider: 'tcgdex_tcgplayer',
        provider_record_id: String(value.productId ?? card.id),
        provider_updated_at: providerTimestamp(tcgplayer.updated),
        retrieved_at: nowIso(),
        confidence: 'medium',
        pricing_status: 'partially_priced',
        raw_payload: { variant, ...value },
      });
    }
    return rows;
  });
}

function cardmarketPriceRows(card, language, region) {
  const cardmarket = card?.pricing?.cardmarket;
  if (!cardmarket) return [];
  const currency = String(cardmarket.unit || 'EUR').toUpperCase();
  const entityId = stackrCardId(language, card.id);
  const rows = [];
  const market = toNumberOrNull(cardmarket.trend ?? cardmarket.avg30 ?? cardmarket.avg);
  if (market != null) {
    const { displayPrice, exchangeRate } = convertDisplayPrice(market, currency);
    rows.push({
      entity_id: entityId,
      entity_type: 'card',
      language,
      region,
      condition: 'raw',
      currency,
      price_type: 'market',
      low: toNumberOrNull(cardmarket.low),
      market,
      average: toNumberOrNull(cardmarket.avg),
      original_price: market,
      original_currency: currency,
      exchange_rate: exchangeRate,
      exchange_rate_timestamp: nowIso(),
      display_price: displayPrice,
      display_currency: DISPLAY_CURRENCY,
      provider: 'tcgdex_cardmarket',
      provider_record_id: String(cardmarket.idProduct ?? card.id),
        provider_updated_at: providerTimestamp(cardmarket.updated),
      retrieved_at: nowIso(),
      confidence: cardmarket.idProduct ? 'high' : 'medium',
      pricing_status: 'priced',
      raw_payload: cardmarket,
    });
  }

  const holoMarket = toNumberOrNull(cardmarket['trend-holo'] ?? cardmarket['avg30-holo'] ?? cardmarket['avg-holo']);
  if (holoMarket != null) {
    const { displayPrice, exchangeRate } = convertDisplayPrice(holoMarket, currency);
    rows.push({
      entity_id: entityId,
      entity_type: 'card',
      language,
      region,
      condition: 'holo',
      currency,
      price_type: 'market',
      low: toNumberOrNull(cardmarket['low-holo']),
      market: holoMarket,
      average: toNumberOrNull(cardmarket['avg-holo']),
      original_price: holoMarket,
      original_currency: currency,
      exchange_rate: exchangeRate,
      exchange_rate_timestamp: nowIso(),
      display_price: displayPrice,
      display_currency: DISPLAY_CURRENCY,
      provider: 'tcgdex_cardmarket',
      provider_record_id: String(cardmarket.idProduct ?? card.id),
      provider_updated_at: providerTimestamp(cardmarket.updated),
      retrieved_at: nowIso(),
      confidence: cardmarket.idProduct ? 'high' : 'medium',
      pricing_status: 'priced',
      raw_payload: { variant: 'holo', ...cardmarket },
    });
  }

  const low = toNumberOrNull(cardmarket.low);
  if (!rows.length && low != null) {
    const { displayPrice, exchangeRate } = convertDisplayPrice(low, currency);
    rows.push({
      entity_id: entityId,
      entity_type: 'card',
      language,
      region,
      condition: 'raw',
      currency,
      price_type: 'low_listing',
      low,
      original_price: low,
      original_currency: currency,
      exchange_rate: exchangeRate,
      exchange_rate_timestamp: nowIso(),
      display_price: displayPrice,
      display_currency: DISPLAY_CURRENCY,
      provider: 'tcgdex_cardmarket',
      provider_record_id: String(cardmarket.idProduct ?? card.id),
      provider_updated_at: providerTimestamp(cardmarket.updated),
      retrieved_at: nowIso(),
      confidence: 'medium',
      pricing_status: 'partially_priced',
      raw_payload: cardmarket,
    });
  }
  return rows;
}

function getPricingRows(card, language, region) {
  const tcgplayerRows = tcgplayerPriceRows(card, language, region);
  const cardmarketRows = cardmarketPriceRows(card, language, region);
  if (language !== 'en') return cardmarketRows;
  return [...tcgplayerRows, ...cardmarketRows];
}

function nextPriceCheck(status, priceType) {
  const now = new Date();
  if (status === 'priced') {
    if (priceType === 'recent_sold') return addMs(now, 6 * 60 * 60 * 1000);
    if (priceType === 'market' || priceType === 'average_sold') return addMs(now, 24 * 60 * 60 * 1000);
    if (priceType === 'active_listing' || priceType === 'low_listing') return addMs(now, 60 * 60 * 1000);
  }
  if (status === 'temporarily_unavailable') return addMs(now, 6 * 60 * 60 * 1000);
  return addMs(now, 7 * 24 * 60 * 60 * 1000);
}

async function recordPriceCheck(db, payload) {
  const { error } = await db.from('card_price_checks').insert({
    entity_id: payload.entityId,
    entity_type: 'card',
    language: payload.language,
    region: payload.region,
    provider: payload.provider,
    provider_record_id: payload.providerRecordId,
    pricing_status: payload.status,
    last_checked_at: nowIso(),
    next_check_at: nextPriceCheck(payload.status, payload.priceType),
    failure_reason: payload.failureReason ?? null,
    provider_coverage: payload.providerCoverage ?? {},
    raw_payload: payload.rawPayload ?? {},
  });
  if (error) console.log('card_price_checks insert failed:', error.message);
}

async function getLatestValidPriceForCard(db, entityId) {
  try {
    const query = db.from('card_prices');
    if (typeof query.select !== 'function') return null;
    const { data, error } = await query
      .select('entity_id,display_price,display_currency,price_type,pricing_status,retrieved_at,provider')
      .eq('entity_id', entityId)
      .eq('entity_type', 'card')
      .not('display_price', 'is', null)
      .order('retrieved_at', { ascending: false })
      .limit(1);
    if (error) {
      console.log(JSON.stringify({
        event: 'price_cache_lookup_failed',
        provider: PROVIDER,
        cardId: entityId,
        failureReason: error.message,
      }));
      return null;
    }
    return Array.isArray(data) ? data[0] ?? null : null;
  } catch (error) {
    console.log(JSON.stringify({
      event: 'price_cache_lookup_failed',
      provider: PROVIDER,
      cardId: entityId,
      failureReason: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

async function getLatestPriceChecks(db, entityIds, language) {
  const ids = [...new Set(entityIds.filter(Boolean))];
  if (!ids.length) return new Map();
  try {
    const query = db.from('card_price_checks');
    if (typeof query.select !== 'function') return new Map();
    const { data, error } = await query
      .select('entity_id,pricing_status,next_check_at,last_checked_at')
      .eq('entity_type', 'card')
      .eq('language', language)
      .in('entity_id', ids)
      .order('last_checked_at', { ascending: false });
    if (error) {
      console.log(JSON.stringify({
        event: 'price_check_schedule_lookup_failed',
        provider: PROVIDER,
        language,
        failureReason: error.message,
      }));
      return new Map();
    }
    const byEntity = new Map();
    for (const row of data ?? []) {
      if (!byEntity.has(row.entity_id)) byEntity.set(row.entity_id, row);
    }
    return byEntity;
  } catch (error) {
    console.log(JSON.stringify({
      event: 'price_check_schedule_lookup_failed',
      provider: PROVIDER,
      language,
      failureReason: error instanceof Error ? error.message : String(error),
    }));
    return new Map();
  }
}

export async function refreshCardPricing(db, card, options = {}) {
  const language = normalizeLanguage(card?.language ?? options.language ?? 'en');
  const region = getCatalogueRegion(language);
  const entityId = card?.stackrCardId ?? card?.id ?? stackrCardId(language, card?.providerCardId ?? card?.source_id);
  const providerRecordId = stripLanguagePrefix(card?.providerCardId ?? card?.source_id ?? card?.id);

  if (!entityId || !providerRecordId) return { status: 'unsupported', rows: [] };

  const rows = getPricingRows({ ...card, id: providerRecordId }, language, region)
    .filter((row) => row.display_price != null || row.market != null || row.low != null || row.average != null || row.last_sold != null);

  if (!rows.length) {
    const latestValidPrice = await getLatestValidPriceForCard(db, entityId);
    const status = latestValidPrice ? 'temporarily_unavailable' : 'no_provider_mapping';
    const failureReason = latestValidPrice
      ? 'TCGdex returned no mapped pricing on this check; previous valid price retained'
      : 'TCGdex returned no mapped pricing for this exact printing';
    await recordPriceCheck(db, {
      entityId,
      language,
      region,
      provider: PROVIDER,
      providerRecordId,
      status,
      failureReason,
      providerCoverage: {
        tcgplayer: Boolean(card?.pricing?.tcgplayer),
        cardmarket: Boolean(card?.pricing?.cardmarket),
      },
      rawPayload: card?.pricing ?? {},
    });
    await Promise.all([
      db.from('tcg_cards').update({
        pricing_status: status,
        last_price_checked_at: nowIso(),
        updated_at: nowIso(),
      }).eq('id', entityId),
      db.from('card_printings').update({
        pricing_status: status,
        updated_at: nowIso(),
      }).eq('card_id', entityId),
      db.from('pokemon_cards').update({
        pricing_status: status,
        last_price_checked_at: nowIso(),
      }).eq('id', entityId),
    ]);
    return { status, rows: [], retainedPrice: latestValidPrice };
  }

  const cardPriceRows = rows.map((row) => ({
    ...row,
    entity_id: entityId,
    retrieved_at: nowIso(),
    updated_at: nowIso(),
  }));
  const marketPriceRows = cardPriceRows.map((row) => ({
    entity_id: row.entity_id,
    entity_type: row.entity_type,
    region: row.region,
    language: row.language,
    currency: row.display_currency,
    condition: row.condition,
    grader: row.grader ?? null,
    grade: row.grade ?? null,
    price_type: row.price_type,
    low: row.low,
    average: row.average,
    market: row.market,
    high: row.high,
    last_sold: row.last_sold,
    sales_count: row.sales_count,
    original_price: row.original_price,
    original_currency: row.original_currency,
    display_price: row.display_price,
    display_currency: row.display_currency,
    exchange_rate: row.exchange_rate,
    exchange_rate_timestamp: row.exchange_rate_timestamp,
    source_provider: row.provider,
    source_url: null,
    provider_updated_at: row.provider_updated_at,
    retrieved_at: row.retrieved_at,
    confidence: row.confidence,
    pricing_status: row.pricing_status,
    next_check_at: nextPriceCheck(row.pricing_status, row.price_type),
    raw_payload: row.raw_payload,
  }));

  const [{ error: cardPriceError }, { error: marketPriceError }] = await Promise.all([
    db.from('card_prices').insert(cardPriceRows),
    db.from('market_prices').insert(marketPriceRows),
  ]);
  if (cardPriceError) throw cardPriceError;
  if (marketPriceError) console.log('market_prices insert failed:', marketPriceError.message);

  const { error: historyError } = await db.from('price_history').insert(cardPriceRows.map((row) => ({
    entity_id: row.entity_id,
    entity_type: row.entity_type,
    language: row.language,
    region: row.region,
    currency: row.display_currency ?? row.currency,
    price_type: row.price_type,
    price: row.display_price ?? row.market ?? row.low ?? row.average ?? row.last_sold ?? null,
    provider: row.provider,
    provider_record_id: row.provider_record_id,
    observed_at: row.retrieved_at,
    raw_payload: row.raw_payload,
  })));
  if (historyError) console.log('price_history insert failed:', historyError.message);

  const preferred = selectDisplayPrice(cardPriceRows);
  await recordPriceCheck(db, {
    entityId,
    language,
    region,
    provider: preferred?.provider ?? PROVIDER,
    providerRecordId: preferred?.provider_record_id ?? providerRecordId,
    status: preferred?.pricing_status === 'partially_priced' ? 'partially_priced' : 'priced',
    priceType: preferred?.price_type,
    providerCoverage: {
      tcgplayer: Boolean(card?.pricing?.tcgplayer),
      cardmarket: Boolean(card?.pricing?.cardmarket),
    },
    rawPayload: card?.pricing ?? {},
  });
  await Promise.all([
    db.from('tcg_cards').update({
      pricing_status: preferred?.pricing_status === 'partially_priced' ? 'partially_priced' : 'priced',
      last_price_checked_at: nowIso(),
      updated_at: nowIso(),
    }).eq('id', entityId),
    db.from('card_printings').update({
      pricing_status: preferred?.pricing_status === 'partially_priced' ? 'partially_priced' : 'priced',
      updated_at: nowIso(),
    }).eq('card_id', entityId),
    db.from('pokemon_cards').update({
      pricing_status: preferred?.pricing_status === 'partially_priced' ? 'partially_priced' : 'priced',
      last_price_checked_at: nowIso(),
    }).eq('id', entityId),
  ]);

  return { status: preferred?.pricing_status ?? 'priced', rows: cardPriceRows };
}

function selectDisplayPrice(rows = []) {
  return [...rows]
    .filter((row) => row && row.price_type && row.display_price != null)
    .sort((a, b) => {
      const priority = (PRICE_PRIORITY.get(a.price_type) ?? 99) - (PRICE_PRIORITY.get(b.price_type) ?? 99);
      if (priority !== 0) return priority;
      return new Date(b.retrieved_at ?? 0).getTime() - new Date(a.retrieved_at ?? 0).getTime();
    })[0] ?? null;
}

async function writeProviderRecords(db, rows) {
  const providerRows = rows.filter(Boolean);
  if (!providerRows.length) return;
  const canonicalRows = providerRows.map((row) => ({
    provider: PROVIDER,
    provider_record_type: row.recordType,
    provider_record_id: canonicalProviderRecordId(row.language, row.providerRecordId),
    language: row.language,
    region: row.region,
    source_url: row.sourceUrl,
    response_status: row.status ?? 'complete',
    raw_payload: row.rawPayload ?? {},
    retrieved_at: nowIso(),
    updated_at: nowIso(),
  }));

  const legacyRows = providerRows.map((row) => ({
    provider: PROVIDER,
    provider_record_type: row.recordType,
    provider_record_id: row.providerRecordId,
    language: row.language,
    region: row.region,
    source_url: row.sourceUrl,
    response_status: row.status ?? 'success',
    raw_payload: row.rawPayload ?? {},
    retrieved_at: nowIso(),
  }));

  const [{ error: canonicalError }, { error: legacyError }] = await Promise.all([
    db.from('provider_card_records').upsert(canonicalRows, { onConflict: 'provider,provider_record_id' }),
    db.from('provider_records').upsert(legacyRows, { onConflict: 'provider,provider_record_type,provider_record_id,language' }),
  ]);
  if (canonicalError) console.log('provider_card_records upsert failed:', canonicalError.message);
  if (legacyError) console.log('provider_records upsert failed:', legacyError.message);
}

async function upsertSeries(db, language, series) {
  const region = getCatalogueRegion(language);
  const rows = (Array.isArray(series) ? series : []).map((entry, index) => {
    const sourceId = String(entry?.id ?? entry?.name ?? `series-${index}`).trim();
    return {
      id: stackrSetId(language, sourceId),
      game: 'pokemon',
      region,
      language,
      canonical_name: entry?.name ?? sourceId,
      local_name: entry?.name ?? sourceId,
      source_provider: PROVIDER,
      source_id: sourceId,
      display_order: index,
      raw_payload: entry ?? {},
      updated_at: nowIso(),
    };
  });
  if (!rows.length) return [];
  const { error } = await db.from('tcg_series').upsert(rows, { onConflict: 'source_provider,source_id,language' });
  if (error) throw error;
  await writeProviderRecords(db, rows.map((row) => ({
    recordType: 'series',
    providerRecordId: row.source_id,
    language,
    region,
    sourceUrl: `${TCGDEX_BASE_URL.replace(/\/$/, '')}/${language}/series/${encodeURIComponent(row.source_id)}`,
    rawPayload: row.raw_payload,
  })));
  return rows;
}

async function upsertSet(db, language, set) {
  const region = getCatalogueRegion(language);
  const providerSetId = String(set?.id || '').trim();
  if (!providerSetId) return null;
  const setId = stackrSetId(language, providerSetId);
  const pokeWalletEnrichment = await fetchPokeWalletSet(providerSetId, language);
  const pokeWalletAsset = buildPokeWalletProviderAsset(providerSetId, language, pokeWalletEnrichment);
  const localName = set?.name ?? providerSetId;
  const baseDisplayNames = buildSetDisplayNames({
    id: setId,
    sourceId: providerSetId,
    setCode: providerSetId,
    language,
    region,
    localName,
    canonicalName: set?.name ?? providerSetId,
    raw: set,
  });
  const englishDisplayName = baseDisplayNames.englishDisplayName ?? pokeWalletAsset?.english_name ?? null;
  const displayName = getPreferredSetDisplayName({
    id: setId,
    sourceId: providerSetId,
    setCode: providerSetId,
    language,
    region,
    localName,
    englishDisplayName,
    canonicalName: set?.name ?? providerSetId,
    raw: {
      ...(set ?? {}),
      provider_assets: pokeWalletAsset ? { pokewallet: pokeWalletAsset } : undefined,
    },
  });
  const rawPayload = {
    ...(set ?? {}),
    language,
    region,
    local_name: localName,
    english_display_name: englishDisplayName,
    display_name: displayName,
    provider_assets: {
      ...((set?.provider_assets && typeof set.provider_assets === 'object') ? set.provider_assets : {}),
      ...(pokeWalletAsset ? { pokewallet: pokeWalletAsset } : {}),
    },
  };
  const counts = mapSetCardCounts(set);
  const seriesSourceId = String(set?.serie?.id ?? set?.serie?.name ?? set?.series ?? '').trim();
  if (seriesSourceId) {
    await upsertSeries(db, language, [{
      id: seriesSourceId,
      name: set?.serie?.name ?? set?.series ?? seriesSourceId,
    }]);
  }
  const row = {
    id: setId,
    series_id: seriesSourceId ? stackrSetId(language, seriesSourceId) : null,
    region,
    language,
    canonical_name: set?.name ?? providerSetId,
    local_name: localName,
    english_display_name: englishDisplayName,
    set_code: providerSetId,
    printed_total: counts.printedTotal,
    actual_total: counts.actualTotal,
    provider_reported_total: counts.providerReportedTotal,
    release_date: mapReleaseDate(set?.releaseDate),
    symbol_url: normalizeTcgdexSetAssetUrl(set?.symbol, 'webp'),
    logo_url: normalizeTcgdexSetAssetUrl(set?.logo, 'webp') ?? pokeWalletAsset?.image_proxy_url ?? pokeWalletAsset?.image_proxy_path ?? null,
    source_provider: PROVIDER,
    source_id: providerSetId,
    data_completeness: Array.isArray(set?.cards) ? 'complete' : 'partial',
    image_completeness: set?.logo || set?.symbol || pokeWalletAsset?.image_proxy_path ? 'partial' : 'unavailable',
    last_synced_at: nowIso(),
    raw_payload: rawPayload,
    updated_at: nowIso(),
  };

  const { error } = await db.from('tcg_sets').upsert(row, { onConflict: 'source_provider,source_id,language' });
  if (error) throw error;

  await writeProviderRecords(db, [{
    recordType: 'set',
    providerRecordId: providerSetId,
    language,
    region,
    sourceUrl: `${TCGDEX_BASE_URL.replace(/\/$/, '')}/${language}/sets/${encodeURIComponent(providerSetId)}`,
    rawPayload,
  }]);

  const legacyRow = {
    id: row.id,
    name: displayName,
    series: set?.serie?.name ?? set?.serie?.id ?? set?.series ?? null,
    printed_total: row.printed_total,
    total: row.actual_total,
    release_date: row.release_date,
    symbol_url: row.symbol_url,
    logo_url: row.logo_url,
    language,
    region,
    provider: PROVIDER,
    provider_id: providerSetId,
    raw_data: rawPayload,
    last_synced_at: nowIso(),
  };
  const { error: legacyError } = await db.from('pokemon_sets').upsert(legacyRow, { onConflict: 'id' });
  if (legacyError) console.log('pokemon_sets upsert failed:', legacyError.message);
  return row;
}

function mapCardRows(language, setRow, card) {
  const region = getCatalogueRegion(language);
  const providerCardId = String(card?.id || '').trim();
  const providerSetId = String(card?.set?.id ?? setRow?.source_id ?? '').trim();
  const cardId = stackrCardId(language, providerCardId);
  const setId = setRow?.id ?? stackrSetId(language, providerSetId);
  const imageBase = imageBaseFromRecord(card);
  const placeholderStatus = imageBase ? 'needs_review' : 'missing';
  const rarity = card?.rarity ?? null;
  const collectorNumber = String(card?.localId ?? '').trim() || null;
  const subtypes = normalizeArray(card?.types);
  const localName = card?.name ?? providerCardId;
  const setLocalName = card?.set?.name ?? setRow?.local_name ?? providerSetId;
  const setEnglishDisplayName = setRow?.english_display_name ?? getEnglishSetDisplayName({
    id: setId,
    sourceId: providerSetId,
    setCode: providerSetId,
    language,
    region,
    localName: setLocalName,
    canonicalName: setRow?.canonical_name ?? setLocalName,
    raw: card?.set ?? setRow?.raw_payload,
  });
  const setDisplayName = getPreferredSetDisplayName({
    id: setId,
    sourceId: providerSetId,
    setCode: providerSetId,
    language,
    region,
    localName: setLocalName,
    englishDisplayName: setEnglishDisplayName,
    canonicalName: setRow?.canonical_name ?? setLocalName,
    raw: card?.set ?? setRow?.raw_payload,
  });
  const providerEnglishDisplayName = cleanText(
    card?.englishDisplayName
    ?? card?.english_display_name
    ?? card?.englishName
    ?? card?.provider_assets?.pokewallet?.english_name
  );
  const englishDisplayName = language === 'en'
    ? localName
    : providerEnglishDisplayName ?? getEnglishCardDisplayName({
      id: cardId,
      sourceId: providerCardId,
      setId,
      collectorNumber,
      language,
      region,
      localName,
      raw: card,
    });
  const displayName = englishDisplayName ?? localName;
  const raw = {
    ...card,
    language,
    region,
    imageBase,
    local_name: localName,
    english_display_name: englishDisplayName,
    display_name: displayName,
    provider_assets: card?.provider_assets ?? {},
    set: {
      ...(card?.set ?? {}),
      id: setId,
      tcgdex_id: providerSetId,
      local_name: setLocalName,
      english_display_name: setEnglishDisplayName,
      display_name: setDisplayName,
      name: setDisplayName,
    },
  };
  const hasFullRecord = Boolean(card?.id && card?.name && !card?.partial);

  const canonical = {
    id: cardId,
    set_id: setId,
    region,
    language,
    canonical_name: canonicalName(card),
    local_name: localName,
    english_display_name: englishDisplayName,
    collector_number: collectorNumber,
    printed_number: collectorNumber,
    rarity,
    supertype: card?.category ?? null,
    subtypes,
    hp: card?.hp != null ? String(card.hp) : null,
    artist: card?.illustrator ?? null,
    image_small_url: null,
    image_large_url: null,
    source_provider: PROVIDER,
    source_id: providerCardId,
    provider: PROVIDER,
    provider_card_id: providerCardId,
    provider_set_id: providerSetId,
    data_completeness: hasFullRecord ? 'complete' : 'partial',
    image_status: placeholderStatus,
    pricing_status: card?.pricing ? 'needs_review' : 'no_provider_mapping',
    record_status: hasFullRecord ? 'complete' : 'partial',
    last_synced_at: nowIso(),
    raw_payload: raw,
    raw_source: raw,
    updated_at: nowIso(),
  };

  const printing = {
    id: `${cardId}:normal`,
    card_id: cardId,
    set_id: setId,
    region,
    language,
    collector_number: collectorNumber,
    variant: 'normal',
    rarity,
    image_small_url: null,
    image_large_url: null,
    source_provider: PROVIDER,
    source_id: providerCardId,
    image_status: placeholderStatus,
    pricing_status: canonical.pricing_status,
    raw_payload: raw,
    raw_source: raw,
    last_synced_at: nowIso(),
    updated_at: nowIso(),
  };

  const legacy = {
    id: cardId,
    set_id: setId,
    name: displayName,
    number: collectorNumber,
    rarity,
    artist: card?.illustrator ?? null,
    image_small: null,
    image_large: null,
    language,
    region,
    provider: PROVIDER,
    external_ids: { tcgdex: providerCardId },
    image_status: placeholderStatus,
    pricing_status: canonical.pricing_status,
    raw_data: raw,
    last_synced_at: nowIso(),
  };

  return { canonical, printing, legacy };
}

const STRONG_IMAGE_STATUSES = new Set(['resolved', 'resolved_secondary', 'high', 'medium']);
const STRONG_PRICE_STATUSES = new Set(['priced', 'partially_priced']);

function normalizePreservedImageStatus(status) {
  if (status === 'high' || status === 'medium') return 'resolved';
  return status;
}

async function fetchExistingRowsById(db, table, columns, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map();
  try {
    const query = db.from(table);
    if (typeof query.select !== 'function') return new Map();
    const { data, error } = await query
      .select(columns)
      .in('id', uniqueIds);
    if (error) {
      console.log(JSON.stringify({
        event: 'catalogue_existing_row_lookup_failed',
        provider: PROVIDER,
        table,
        failureReason: error.message,
      }));
      return new Map();
    }
    return new Map((data ?? []).map((row) => [row.id, row]));
  } catch (error) {
    console.log(JSON.stringify({
      event: 'catalogue_existing_row_lookup_failed',
      provider: PROVIDER,
      table,
      failureReason: error instanceof Error ? error.message : String(error),
    }));
    return new Map();
  }
}

function mergeExistingImageState(row, existing, fields = {}) {
  if (!existing) return row;
  const smallField = fields.small ?? 'image_small_url';
  const largeField = fields.large ?? 'image_large_url';
  const currentStatus = row.image_status;
  const existingStatus = existing.image_status;
  const hasExistingImage = Boolean(existing[smallField] || existing[largeField]);
  const shouldPreserveImage = hasExistingImage || STRONG_IMAGE_STATUSES.has(existingStatus);
  if (!shouldPreserveImage) return row;

  const merged = {
    ...row,
    [smallField]: row[smallField] ?? existing[smallField] ?? null,
    [largeField]: row[largeField] ?? existing[largeField] ?? null,
    image_status: STRONG_IMAGE_STATUSES.has(existingStatus) && !STRONG_IMAGE_STATUSES.has(currentStatus)
      ? normalizePreservedImageStatus(existingStatus)
      : currentStatus,
  };
  if ('last_image_checked_at' in row || existing.last_image_checked_at) {
    merged.last_image_checked_at = row.last_image_checked_at ?? existing.last_image_checked_at;
  }
  return merged;
}

function mergeExistingPricingState(row, existing) {
  if (!existing) return row;
  if (!STRONG_PRICE_STATUSES.has(existing.pricing_status) || STRONG_PRICE_STATUSES.has(row.pricing_status)) return row;
  const merged = {
    ...row,
    pricing_status: existing.pricing_status,
  };
  if ('last_price_checked_at' in row || existing.last_price_checked_at) {
    merged.last_price_checked_at = row.last_price_checked_at ?? existing.last_price_checked_at;
  }
  return merged;
}

async function writeCardRows(db, language, setRow, cards) {
  const mapped = cards.map((card) => mapCardRows(language, setRow, card)).filter((entry) => entry.canonical.source_id);
  if (!mapped.length) return [];

  const [existingCards, existingPrintings, existingLegacyCards] = await Promise.all([
    fetchExistingRowsById(
      db,
      'tcg_cards',
      'id,image_small_url,image_large_url,image_status,pricing_status,last_image_checked_at,last_price_checked_at',
      mapped.map((entry) => entry.canonical.id)
    ),
    fetchExistingRowsById(
      db,
      'card_printings',
      'id,image_small_url,image_large_url,image_status,pricing_status',
      mapped.map((entry) => entry.printing.id)
    ),
    fetchExistingRowsById(
      db,
      'pokemon_cards',
      'id,image_small,image_large,image_status,pricing_status,last_image_checked_at,last_price_checked_at',
      mapped.map((entry) => entry.legacy.id)
    ),
  ]);

  for (const entry of mapped) {
    entry.canonical = mergeExistingPricingState(
      mergeExistingImageState(entry.canonical, existingCards.get(entry.canonical.id)),
      existingCards.get(entry.canonical.id)
    );
    entry.printing = mergeExistingPricingState(
      mergeExistingImageState(entry.printing, existingPrintings.get(entry.printing.id)),
      existingPrintings.get(entry.printing.id)
    );
    entry.legacy = mergeExistingPricingState(
      mergeExistingImageState(entry.legacy, existingLegacyCards.get(entry.legacy.id), { small: 'image_small', large: 'image_large' }),
      existingLegacyCards.get(entry.legacy.id)
    );
  }

  const { error: cardsError } = await db
    .from('tcg_cards')
    .upsert(mapped.map((entry) => entry.canonical), { onConflict: 'source_provider,source_id,language' });
  if (cardsError) throw cardsError;

  const { error: printingsError } = await db
    .from('card_printings')
    .upsert(mapped.map((entry) => entry.printing), { onConflict: 'source_provider,source_id,language,variant' });
  if (printingsError) console.log('card_printings upsert failed:', printingsError.message);

  const { error: legacyError } = await db
    .from('pokemon_cards')
    .upsert(mapped.map((entry) => entry.legacy), { onConflict: 'id' });
  if (legacyError) console.log('pokemon_cards upsert failed:', legacyError.message);

  await writeProviderRecords(db, mapped.map((entry) => ({
    recordType: 'card',
    providerRecordId: entry.canonical.source_id,
    language,
    region: entry.canonical.region,
    sourceUrl: `${TCGDEX_BASE_URL.replace(/\/$/, '')}/${language}/cards/${encodeURIComponent(entry.canonical.source_id)}`,
    rawPayload: entry.canonical.raw_payload,
  })));

  const mappings = mapped.map((entry) => ({
    stackr_card_id: entry.canonical.id,
    provider: PROVIDER,
    provider_card_id: entry.canonical.source_id,
    confidence: 1,
    metadata: {
      language,
      region: entry.canonical.region,
      setId: entry.canonical.set_id,
      collectorNumber: entry.canonical.collector_number,
    },
    updated_at: nowIso(),
    provider_record_type: 'card',
    provider_record_id: entry.canonical.source_id,
    stackr_entity_type: 'card',
    stackr_entity_id: entry.canonical.id,
    match_method: 'provider_id',
    match_confidence: 1,
    match_status: 'matched',
    last_verified_at: nowIso(),
  }));
  const { error: mappingError } = await db
    .from('provider_mappings')
    .upsert(mappings, { onConflict: 'provider,provider_card_id,language' });
  if (mappingError) console.log('provider_mappings upsert failed:', mappingError.message);

  return mapped.map((entry) => ({ ...entry.canonical, stackrCardId: entry.canonical.id, providerCardId: entry.canonical.source_id }));
}

async function startSyncRun(db, jobName, language, setId = null) {
  const { data, error } = await db
    .from('catalogue_sync_runs')
    .insert({
      provider: PROVIDER,
      job_name: jobName,
      language,
      region: getCatalogueRegion(language),
      set_id: setId,
      status: 'running',
      started_at: nowIso(),
    })
    .select('id, started_at')
    .single();
  if (error) {
    console.log('catalogue_sync_runs start failed:', error.message);
    return null;
  }
  return data;
}

async function finishSyncRun(db, run, status, summary, errorMessage = null) {
  if (!run?.id) return;
  const startedAt = run.started_at ? new Date(run.started_at).getTime() : Date.now();
  const durationMs = Math.max(0, Date.now() - startedAt);
  const { error } = await db
    .from('catalogue_sync_runs')
    .update({
      status,
      provider_reported_total: summary.provider_reported_total ?? 0,
      retrieved_total: summary.retrieved_total ?? 0,
      stored_total: summary.stored_total ?? 0,
      missing_total: summary.missing_total ?? 0,
      duplicate_total: summary.duplicate_total ?? 0,
      finished_at: nowIso(),
      duration_ms: durationMs,
      summary,
      error_message: errorMessage,
    })
    .eq('id', run.id);
  if (error) console.log('catalogue_sync_runs finish failed:', error.message);
}

async function recordSyncError(db, run, payload) {
  const { error } = await db.from('catalogue_sync_errors').insert({
    sync_run_id: run?.id ?? null,
    provider: PROVIDER,
    job_name: payload.jobName,
    language: payload.language,
    region: getCatalogueRegion(payload.language),
    set_id: payload.setId ?? null,
    card_id: payload.cardId ?? null,
    provider_record_id: payload.providerRecordId ?? null,
    stage: payload.stage,
    severity: payload.severity ?? 'error',
    message: payload.message,
    raw_payload: payload.rawPayload ?? {},
  });
  if (error) console.log('catalogue_sync_errors insert failed:', error.message);
}

async function fetchFullCardsForSet(client, set, options, run, db) {
  const summaries = Array.isArray(set?.cards) ? set.cards : [];
  const fullCards = [];
  for (let index = 0; index < summaries.length; index += TCGDEX_BATCH_SIZE) {
    const batch = summaries.slice(index, index + TCGDEX_BATCH_SIZE);
    const results = await Promise.all(batch.map(async (summary) => {
      const cardId = summary?.id;
      if (!cardId) return null;
      try {
        return await client.card(cardId);
      } catch (error) {
        await recordSyncError(db, run, {
          jobName: 'syncCardsForSet',
          language: client.language,
          setId: set?.id,
          providerRecordId: cardId,
          stage: 'fetch_full_card',
          message: error instanceof Error ? error.message : String(error),
          rawPayload: summary,
        });
        if (options.allowPartial) return { ...summary, set: { id: set?.id, name: set?.name }, partial: true };
        return null;
      }
    }));
    fullCards.push(...results.filter(Boolean));
  }
  return fullCards;
}

export async function syncCardsForSet(db, options = {}) {
  const language = normalizeLanguage(options.language ?? 'en');
  const client = createTCGdexClient(language);
  const setId = stripLanguagePrefix(options.setId);
  if (!setId) throw new Error('setId is required');
  const run = await startSyncRun(db, 'syncCardsForSet', language, setId);
  const summary = {
    provider_reported_total: 0,
    retrieved_total: 0,
    stored_total: 0,
    missing_total: 0,
    duplicate_total: 0,
    image_resolved_total: 0,
    priced_total: 0,
    provider_variant_total: 0,
    stored_provider_variant_total: 0,
    japanese_card_universe_target: language === 'ja' ? JAPANESE_CARD_UNIVERSE_TARGET : null,
  };

  try {
    const set = await client.set(setId);
    const setRow = await upsertSet(db, language, set);
    const fullCards = await fetchFullCardsForSet(client, set, { allowPartial: true }, run, db);
    const pokeWalletEnrichment = await fetchPokeWalletSet(setRow?.source_id ?? set?.id, language);
    const providerVariantResult = await writePokeWalletProviderRecords(db, language, setRow, pokeWalletEnrichment);
    const enrichedCards = mergeCardsWithPokeWallet(language, setRow?.source_id ?? set?.id, fullCards, pokeWalletEnrichment);
    const reportedTotal = mapSetCardCounts(set).providerReportedTotal ?? fullCards.length;
    const providerIds = enrichedCards.map((card) => card?.id).filter(Boolean);
    const duplicateTotal = providerIds.length - new Set(providerIds).size;
    const storedCards = await writeCardRows(db, language, setRow, enrichedCards);

    summary.provider_reported_total = reportedTotal;
    summary.retrieved_total = enrichedCards.length;
    summary.stored_total = storedCards.length;
    summary.provider_variant_total = providerVariantResult.retrieved_total ?? 0;
    summary.stored_provider_variant_total = providerVariantResult.stored_total ?? 0;
    summary.missing_total = Math.max(0, reportedTotal - storedCards.length);
    summary.duplicate_total = Math.max(0, duplicateTotal);

    if (options.resolveImages) {
      for (const card of storedCards) {
        const original = fullCards.find((entry) => entry?.id === card.providerCardId);
        const result = await resolveCardImage(db, { ...original, ...card, language }, { language, force: Boolean(options.forceImages) });
        if (['resolved', 'resolved_secondary'].includes(result?.resolution_status)) summary.image_resolved_total += 1;
      }
    }

    if (options.refreshPrices) {
      for (const card of storedCards) {
        const original = fullCards.find((entry) => entry?.id === card.providerCardId);
        const result = await refreshCardPricing(db, { ...original, ...card, language }, { language });
        if (['priced', 'partially_priced'].includes(result?.status)) summary.priced_total += 1;
      }
    }

    const syncStatus = summary.missing_total > 0 || summary.duplicate_total > 0 ? 'partial' : 'complete';
    await db.from('tcg_sets').update({
      retrieved_total: summary.retrieved_total,
      stored_total: summary.stored_total,
      missing_total: summary.missing_total,
      duplicate_total: summary.duplicate_total,
      sync_status: syncStatus,
      last_card_sync_at: nowIso(),
      updated_at: nowIso(),
    }).eq('id', setRow.id);

    await finishSyncRun(db, run, syncStatus === 'complete' ? 'completed' : 'partial', summary);
    return { language, region: client.region, setId: setRow.id, ...summary, sync_status: syncStatus };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSyncRun(db, run, 'failed', summary, message);
    throw error;
  }
}

export async function syncTcgdexCatalogue(db, options = {}) {
  const language = normalizeLanguage(options.language ?? 'en');
  const client = createTCGdexClient(language);
  const run = await startSyncRun(db, 'syncTcgdexCatalogue', language, options.setId ?? null);
  const summary = {
    series_total: 0,
    sets_total: 0,
    sets_synced: 0,
    cards_synced: 0,
    provider_reported_total: 0,
    retrieved_total: 0,
    stored_total: 0,
    missing_total: 0,
    duplicate_total: 0,
    image_resolved_total: 0,
    priced_total: 0,
  };

  try {
    if (!options.setId) {
      const series = await client.series();
      summary.series_total = Array.isArray(series) ? series.length : 0;
      await upsertSeries(db, language, series);
    }

    const setIds = [];
    if (options.setId) {
      setIds.push(stripLanguagePrefix(options.setId));
    } else {
      const sets = await client.sets();
      summary.sets_total = Array.isArray(sets) ? sets.length : 0;
      for (const brief of Array.isArray(sets) ? sets : []) {
        const fullSet = await client.set(brief.id);
        await upsertSet(db, language, fullSet);
        setIds.push(brief.id);
      }
    }

    if (options.allCards || options.setId) {
      for (const id of setIds) {
        const setResult = await syncCardsForSet(db, {
          language,
          setId: id,
          resolveImages: options.resolveImages,
          refreshPrices: options.refreshPrices,
          forceImages: options.forceImages,
        });
        summary.sets_synced += 1;
        summary.cards_synced += setResult.stored_total ?? 0;
        summary.provider_reported_total += setResult.provider_reported_total ?? 0;
        summary.retrieved_total += setResult.retrieved_total ?? 0;
        summary.stored_total += setResult.stored_total ?? 0;
        summary.missing_total += setResult.missing_total ?? 0;
        summary.duplicate_total += setResult.duplicate_total ?? 0;
        summary.image_resolved_total += setResult.image_resolved_total ?? 0;
        summary.priced_total += setResult.priced_total ?? 0;
      }
    }

    const status = summary.missing_total > 0 || summary.duplicate_total > 0 ? 'partial' : 'completed';
    await finishSyncRun(db, run, status, summary);
    return { language, region: client.region, ...summary, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSyncRun(db, run, 'failed', summary, message);
    throw error;
  }
}

async function fetchRowsWithCount(query, page = 1, limit = 50, maxLimit = 250) {
  const pageNumber = Math.max(1, toInt(page, 1));
  const pageSize = Math.max(1, Math.min(toInt(limit, 50), maxLimit));
  const from = (pageNumber - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { rows: data ?? [], count: count ?? data?.length ?? 0, page: pageNumber, limit: pageSize };
}

export async function listCatalogueSeries(db, options = {}) {
  const language = normalizeLanguage(options.language ?? 'en');
  let query = db
    .from('tcg_series')
    .select('*', { count: 'exact' })
    .eq('source_provider', PROVIDER)
    .eq('language', language)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('canonical_name', { ascending: true });
  const q = String(options.q || '').trim();
  if (q) query = query.ilike('canonical_name', `%${q}%`);
  const result = await fetchRowsWithCount(query, options.page, options.limit ?? 100);
  return {
    language,
    region: getCatalogueRegion(language),
    count: result.count,
    page: result.page,
    limit: result.limit,
    series: result.rows,
  };
}

async function fetchSetCoverImages(db, setIds) {
  const ids = [...new Set((setIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await db
    .from('tcg_set_cover_images')
    .select('set_id, cover_image_url')
    .in('set_id', ids);
  if (error) {
    console.log('tcg_set_cover_images lookup skipped:', error.message);
    return new Map();
  }
  const bySetId = new Map();
  for (const row of data ?? []) {
    if (row?.set_id && row?.cover_image_url && !bySetId.has(row.set_id)) {
      bySetId.set(row.set_id, row.cover_image_url);
    }
  }
  return bySetId;
}

function formatCatalogueSetForClient(set, coverImageUrl = null) {
  if (!set) return null;
  const region = set.region ?? getCatalogueRegion(set.language);
  const localName = set.local_name ?? set.raw_payload?.local_name ?? set.raw_payload?.name ?? set.canonical_name ?? set.source_id ?? set.id;
  const englishDisplayName = set.english_display_name ?? getEnglishSetDisplayName({
    id: set.id,
    sourceId: set.source_id,
    setCode: set.set_code,
    language: set.language,
    region,
    localName,
    canonicalName: set.canonical_name,
    raw: set.raw_payload,
  });
  const displayName = getPreferredSetDisplayName({
    id: set.id,
    sourceId: set.source_id,
    setCode: set.set_code,
    language: set.language,
    region,
    localName,
    englishDisplayName,
    canonicalName: set.canonical_name,
    raw: set.raw_payload,
  });
  const fallbackCoverImageUrl = coverImageUrl ?? getRawSetCoverImageUrl(set.raw_payload);
  return {
    ...set,
    name: displayName,
    localName,
    englishDisplayName,
    logo: set.logo_url ?? null,
    symbol: set.symbol_url ?? null,
    images: {
      logo: set.logo_url ?? null,
      symbol: set.symbol_url ?? null,
      cover: fallbackCoverImageUrl ?? null,
      artwork: fallbackCoverImageUrl ?? null,
    },
    raw_payload: {
      ...(set.raw_payload ?? {}),
      local_name: localName,
      english_display_name: englishDisplayName,
      display_name: displayName,
      cover_image_url: fallbackCoverImageUrl ?? null,
    },
  };
}

export async function listCatalogueSets(db, options = {}) {
  const language = normalizeLanguage(options.language ?? 'en');
  let query = db
    .from('tcg_sets')
    .select('*', { count: 'exact' })
    .eq('source_provider', PROVIDER)
    .eq('language', language)
    .order('release_date', { ascending: false, nullsFirst: false })
    .order('canonical_name', { ascending: true });
  const q = String(options.q || '').trim();
  if (q) query = query.or(`canonical_name.ilike.%${q}%,local_name.ilike.%${q}%,english_display_name.ilike.%${q}%,set_code.ilike.%${q}%`);
  const result = await fetchRowsWithCount(query, options.page, options.limit ?? 100);
  const coverImages = await fetchSetCoverImages(db, result.rows.map((row) => row.id));
  return {
    language,
    region: getCatalogueRegion(language),
    count: result.count,
    page: result.page,
    limit: result.limit,
    sets: result.rows.map((row) => formatCatalogueSetForClient(row, coverImages.get(row.id))).filter(Boolean),
  };
}

export async function repairSetAssetUrls(db, options = {}) {
  const language = normalizeLanguage(options.language ?? 'en');
  const limit = Math.max(1, Math.min(toInt(options.limit, 500), 5000));
  let query = db
    .from('tcg_sets')
    .select('id,language,region,logo_url,symbol_url,raw_payload,source_provider,source_id,set_code')
    .eq('source_provider', PROVIDER)
    .eq('language', language)
    .limit(limit);
  if (options.setId) query = query.ilike('id', stackrSetId(language, options.setId));
  const { data, error } = await query;
  if (error) throw error;

  let checked = 0;
  let repaired = 0;
  for (const row of data ?? []) {
    checked += 1;
    const providerSetId = row.source_id ?? row.set_code ?? row.raw_payload?.id ?? row.id;
    const pokeWalletEnrichment = await fetchPokeWalletSet(providerSetId, language);
    const pokeWalletAsset = buildPokeWalletProviderAsset(providerSetId, language, pokeWalletEnrichment);
    const logoUrl = normalizeTcgdexSetAssetUrl(row.raw_payload?.logo ?? row.logo_url, 'webp');
    const symbolUrl = normalizeTcgdexSetAssetUrl(row.raw_payload?.symbol ?? row.symbol_url, 'webp');
    const nextLogoUrl = logoUrl ?? pokeWalletAsset?.image_proxy_url ?? pokeWalletAsset?.image_proxy_path ?? null;
    const rawPayload = {
      ...(row.raw_payload ?? {}),
      provider_assets: {
        ...((row.raw_payload?.provider_assets && typeof row.raw_payload.provider_assets === 'object') ? row.raw_payload.provider_assets : {}),
        ...(pokeWalletAsset ? { pokewallet: pokeWalletAsset } : {}),
      },
    };
    if (nextLogoUrl === row.logo_url && symbolUrl === row.symbol_url && !pokeWalletAsset) continue;
    const patch = {
      logo_url: nextLogoUrl,
      symbol_url: symbolUrl,
      image_completeness: nextLogoUrl || symbolUrl ? 'partial' : row.raw_payload?.image_completeness ?? 'unavailable',
      raw_payload: rawPayload,
      updated_at: nowIso(),
    };
    const [{ error: setError }, { error: legacyError }] = await Promise.all([
      db.from('tcg_sets').update(patch).eq('id', row.id),
      db.from('pokemon_sets').update({
        logo_url: nextLogoUrl,
        symbol_url: symbolUrl,
        raw_data: rawPayload,
        last_synced_at: nowIso(),
      }).eq('id', row.id),
    ]);
    if (setError) throw setError;
    if (legacyError) {
      console.log(JSON.stringify({
        event: 'legacy_set_asset_repair_failed',
        provider: PROVIDER,
        language,
        setId: row.id,
        failureReason: legacyError.message,
      }));
    }
    repaired += 1;
  }

  return { language, region: getCatalogueRegion(language), checked, repaired };
}

export async function getCatalogueSet(db, setId, options = {}) {
  const language = normalizeLanguage(options.language ?? 'en');
  const id = stackrSetId(language, setId);
  const { data, error } = await db
    .from('tcg_sets')
    .select('*')
    .ilike('id', id)
    .eq('language', language)
    .maybeSingle();
  if (error) throw error;
  const coverImages = await fetchSetCoverImages(db, data?.id ? [data.id] : []);
  return formatCatalogueSetForClient(data, data?.id ? coverImages.get(data.id) : null) ?? null;
}

function formatCatalogueCardForClient(card) {
  if (!card) return null;
  const englishDisplayName = card.english_display_name ?? getEnglishCardDisplayName({
    id: card.id,
    sourceId: card.source_id ?? card.provider_card_id,
    setId: card.set_id,
    collectorNumber: card.collector_number,
    language: card.language,
    region: card.region,
    localName: card.local_name ?? card.raw_payload?.local_name ?? card.raw_payload?.name,
    raw: card.raw_payload,
  });
  const name = englishDisplayName ?? card.local_name ?? card.canonical_name ?? card.id;
  const setName = card.raw_payload?.set?.english_display_name
    ?? card.raw_payload?.set?.display_name
    ?? card.raw_payload?.set?.name
    ?? null;
  return {
    ...card,
    name,
    localName: card.local_name ?? card.canonical_name,
    englishDisplayName,
    setName,
    raw_payload: {
      ...(card.raw_payload ?? {}),
      name,
      local_name: card.local_name ?? card.raw_payload?.local_name ?? null,
      english_display_name: englishDisplayName,
      set: card.raw_payload?.set
        ? {
            ...card.raw_payload.set,
            name: setName ?? card.raw_payload.set.name,
          }
        : card.raw_payload?.set,
    },
  };
}

export async function getCatalogueCard(db, cardId, options = {}) {
  const language = normalizeLanguage(options.language ?? (String(cardId).startsWith('ja:') ? 'ja' : 'en'));
  const id = stackrCardId(language, cardId);
  const { data, error } = await db
    .from('tcg_cards')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return formatCatalogueCardForClient(data) ?? null;
}

function formatDisplayPrice(row) {
  if (!row || row.display_price == null) return null;
  return {
    displayPrice: row.display_price,
    currency: row.display_currency ?? DISPLAY_CURRENCY,
    originalPrice: row.original_price ?? row.market ?? row.low ?? row.average ?? row.last_sold ?? null,
    originalCurrency: row.original_currency ?? row.currency ?? null,
    priceType: row.price_type,
    confidence: row.confidence ?? 'medium',
    updatedAt: row.retrieved_at ?? null,
    provider: row.provider ?? row.source_provider ?? null,
    pricingStatus: row.pricing_status ?? 'priced',
    sourceLabel: priceSourceLabel(row.price_type, row),
  };
}

function priceSourceLabel(priceType, row) {
  if (priceType === 'recent_sold') return row?.sales_count ? `Recent sold · ${row.sales_count} sales` : 'Recent sold';
  if (priceType === 'market') return 'Market value';
  if (priceType === 'average_sold') return row?.sales_count ? `Average sold · ${row.sales_count} sales` : 'Average sold';
  if (priceType === 'low_listing') return 'Lowest verified listing';
  if (priceType === 'active_listing') return 'Active listing';
  if (priceType === 'estimated') return 'Estimate';
  return 'Price unavailable';
}

async function fetchLatestImages(db, cardIds) {
  if (!cardIds.length) return new Map();
  const { data, error } = await db
    .from('card_images')
    .select('*')
    .in('card_id', cardIds)
    .order('last_verified_at', { ascending: false, nullsFirst: false });
  if (error) {
    console.log('card_images lookup failed:', error.message);
    return new Map();
  }
  const byCard = new Map();
  for (const row of data ?? []) {
    const existing = byCard.get(row.card_id);
    const currentPriority = IMAGE_STATUS_PRIORITY.get(existing?.resolution_status) ?? 99;
    const nextPriority = IMAGE_STATUS_PRIORITY.get(row.resolution_status) ?? 99;
    if (!existing || nextPriority < currentPriority) byCard.set(row.card_id, row);
  }
  return byCard;
}

async function fetchLatestPrices(db, cardIds) {
  if (!cardIds.length) return new Map();
  const { data, error } = await db
    .from('card_prices')
    .select('*')
    .in('entity_id', cardIds)
    .eq('entity_type', 'card')
    .order('retrieved_at', { ascending: false });
  if (error) {
    console.log('card_prices lookup failed:', error.message);
    return new Map();
  }
  const byCard = new Map();
  for (const row of data ?? []) {
    if (!row.display_price) continue;
    const existing = byCard.get(row.entity_id);
    const currentPriority = PRICE_PRIORITY.get(existing?.price_type) ?? 99;
    const nextPriority = PRICE_PRIORITY.get(row.price_type) ?? 99;
    if (!existing || nextPriority < currentPriority) byCard.set(row.entity_id, row);
  }
  return byCard;
}

export async function listCatalogueSetCards(db, setId, options = {}) {
  const language = normalizeLanguage(options.language ?? (String(setId).startsWith('ja:') ? 'ja' : 'en'));
  const canonicalSetId = stackrSetId(language, setId);
  let query = db
    .from('tcg_cards')
    .select('*', { count: 'exact' })
    .ilike('set_id', canonicalSetId)
    .eq('language', language)
    .order('collector_number', { ascending: true, nullsFirst: false });

  const result = await fetchRowsWithCount(query, options.page, options.limit ?? 500, 500);
  const cardIds = result.rows.map((row) => row.id);
  const [images, prices] = await Promise.all([
    fetchLatestImages(db, cardIds),
    fetchLatestPrices(db, cardIds),
  ]);

  const cards = result.rows.map((card) => {
    const image = images.get(card.id);
    const price = prices.get(card.id);
    const imageUrl = image?.variants?.grid ?? image?.resolved_image_url ?? card.image_small_url ?? null;
    const englishDisplayName = card.english_display_name
      ?? getEnglishCardDisplayName({
        id: card.id,
        sourceId: card.source_id ?? card.provider_card_id,
        setId: card.set_id,
        collectorNumber: card.collector_number,
        language: card.language,
        region: card.region,
        localName: card.local_name ?? card.raw_payload?.name,
        raw: card.raw_payload,
      });
    return {
      id: card.id,
      name: englishDisplayName ?? card.canonical_name ?? card.local_name,
      localName: card.local_name ?? card.canonical_name,
      englishDisplayName,
      setId: card.set_id,
      setName: card.raw_payload?.set?.english_display_name
        ?? card.raw_payload?.set?.display_name
        ?? card.raw_payload?.set?.name
        ?? null,
      collectorNumber: card.collector_number,
      language: card.language,
      region: card.region,
      dexIds: card.raw_payload?.dexId ?? card.raw_payload?.dexIds ?? card.raw_payload?.nationalPokedexNumbers ?? null,
      rarity: card.rarity,
      image: {
        url: imageUrl,
        status: image?.resolution_status ?? card.image_status ?? 'missing',
        source: image?.resolution_source ?? (imageUrl ? PROVIDER : 'stackr_placeholder'),
        width: image?.image_width ?? null,
        height: image?.image_height ?? null,
      },
      pricing: formatDisplayPrice(price),
      pricingStatus: price?.pricing_status ?? card.pricing_status ?? 'unsupported',
      ownershipQuantity: 0,
      duplicateQuantity: 0,
      completionStatus: card.data_completeness ?? card.record_status ?? 'partial',
      raw: options.includeRaw ? card.raw_payload : undefined,
    };
  });

  return {
    language,
    region: getCatalogueRegion(language),
    setId: canonicalSetId,
    count: result.count,
    page: result.page,
    limit: result.limit,
    cards,
  };
}

export async function getCatalogueHealth(db, options = {}) {
  const language = options.language ? normalizeLanguage(options.language) : null;
  let query = db.from('catalogue_health').select('*').order('language', { ascending: true });
  if (language) query = query.eq('language', language);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];

  const providerVariantCounts = new Map();
  const countLanguages = [...new Set((language ? [language] : rows.map((row) => row.language)).map(normalizeLanguage))];
  for (const countLanguage of countLanguages) {
    try {
      const { count, error: providerError } = await db
        .from('provider_card_records')
        .select('id', { count: 'exact', head: true })
        .eq('provider', 'pokewallet')
        .eq('provider_record_type', 'japanese_card_variant')
        .eq('language', countLanguage);
      if (providerError) throw providerError;
      providerVariantCounts.set(countLanguage, count ?? 0);
    } catch (providerError) {
      console.log(JSON.stringify({
        event: 'provider_variant_health_skipped',
        provider: 'pokewallet',
        language: countLanguage,
        failureReason: providerError?.message ?? String(providerError),
      }));
    }
  }

  return rows.map((row) => {
    const rowLanguage = normalizeLanguage(row.language);
    const providerVariantCards = providerVariantCounts.get(rowLanguage) ?? 0;
    const japaneseUniverseTarget = rowLanguage === 'ja' ? JAPANESE_CARD_UNIVERSE_TARGET : null;
    const largestKnownJapaneseCount = rowLanguage === 'ja'
      ? Math.max(Number(row.cards_stored ?? 0), providerVariantCards)
      : null;
    return {
      ...row,
      provider_variant_cards: providerVariantCards,
      japanese_card_universe_target: japaneseUniverseTarget,
      japanese_card_universe_gap: japaneseUniverseTarget == null
        ? null
        : Math.max(0, japaneseUniverseTarget - (largestKnownJapaneseCount ?? 0)),
      japanese_catalogue_coverage: rowLanguage === 'ja'
        ? providerVariantCards >= JAPANESE_CARD_UNIVERSE_TARGET
          ? 'variant_provider_complete'
          : providerVariantCards > 0
          ? 'variant_provider_partial'
          : 'tcgdex_base_catalogue_only'
        : null,
    };
  });
}

export async function resolveMissingImages(db, options = {}) {
  const language = normalizeLanguage(options.language ?? 'en');
  const limit = Math.max(1, Math.min(toInt(options.limit, 100), 500));
  const force = Boolean(options.force);
  let query = db
    .from('tcg_cards')
    .select('*')
    .eq('language', language)
    .or('image_status.is.null,image_status.in.(missing,invalid,temporarily_unavailable,needs_review,unavailable)')
    .limit(limit);
  if (options.setId) query = query.ilike('set_id', stackrSetId(language, options.setId));
  const { data, error } = await query;
  if (error) throw error;

  let resolved = 0;
  let missing = 0;
  for (const row of data ?? []) {
    const raw = row.raw_payload ?? row.raw_source ?? {};
    const result = await resolveCardImage(db, {
      ...raw,
      ...row,
      stackrCardId: row.id,
      providerCardId: row.source_id ?? row.provider_card_id,
      language,
    }, { language, force });
    if (['resolved', 'resolved_secondary'].includes(result?.resolution_status)) resolved += 1;
    else missing += 1;
  }
  return { language, region: getCatalogueRegion(language), checked: data?.length ?? 0, resolved, missing };
}

export async function refreshCardPrices(db, options = {}) {
  const language = normalizeLanguage(options.language ?? 'en');
  const limit = Math.max(1, Math.min(toInt(options.limit, 100), 500));
  let query = db
    .from('tcg_cards')
    .select('*')
    .eq('language', language)
    .or('pricing_status.is.null,pricing_status.in.(no_provider_mapping,temporarily_unavailable,unsupported,needs_review)')
    .limit(limit);
  if (options.setId) query = query.ilike('set_id', stackrSetId(language, options.setId));
  const { data, error } = await query;
  if (error) throw error;

  const client = createTCGdexClient(language);
  const rows = data ?? [];
  const latestChecks = await getLatestPriceChecks(db, rows.map((row) => row.id), language);
  let priced = 0;
  let unavailable = 0;
  let skipped = 0;
  for (const row of rows) {
    const latestCheck = latestChecks.get(row.id);
    if (!(options.force || options.forcePrices) && latestCheck?.next_check_at && new Date(latestCheck.next_check_at).getTime() > Date.now()) {
      skipped += 1;
      continue;
    }
    let card = row.raw_payload ?? row.raw_source ?? {};
    if (!card?.pricing) {
      try {
        card = await client.card(row.source_id ?? row.provider_card_id ?? row.id);
      } catch (error) {
        await recordPriceCheck(db, {
          entityId: row.id,
          language,
          region: getCatalogueRegion(language),
          provider: PROVIDER,
          providerRecordId: row.source_id ?? row.provider_card_id ?? row.id,
          status: 'temporarily_unavailable',
          failureReason: error instanceof Error ? error.message : String(error),
        });
        unavailable += 1;
        continue;
      }
    }
    const result = await refreshCardPricing(db, {
      ...card,
      stackrCardId: row.id,
      providerCardId: row.source_id ?? row.provider_card_id ?? card.id,
      language,
    }, { language });
    if (['priced', 'partially_priced'].includes(result.status)) priced += 1;
    else unavailable += 1;
  }
  return { language, region: getCatalogueRegion(language), checked: rows.length, priced, unavailable, skipped };
}

export async function repairTcgdexCatalogue(db, options = {}) {
  const languages = options.language ? [normalizeLanguage(options.language)] : ['en', 'ja', 'zh-tw'];
  const run = await startSyncRun(db, 'repairTcgdexCatalogue', null, options.setId ?? null);
  const summary = {
    languages,
    set_asset_checked_total: 0,
    set_asset_repaired_total: 0,
    image_checked_total: 0,
    image_resolved_total: 0,
    image_missing_total: 0,
    price_checked_total: 0,
    priced_total: 0,
    unpriced_total: 0,
  };

  try {
    for (const language of languages) {
      const setAssetResult = await repairSetAssetUrls(db, {
        language,
        setId: options.setId,
        limit: options.limit ?? 500,
      });
      summary.set_asset_checked_total += setAssetResult.checked;
      summary.set_asset_repaired_total += setAssetResult.repaired;

      const imageResult = await resolveMissingImages(db, {
        language,
        setId: options.setId,
        limit: options.limit ?? 250,
        force: options.forceImages,
      });
      summary.image_checked_total += imageResult.checked;
      summary.image_resolved_total += imageResult.resolved;
      summary.image_missing_total += imageResult.missing;

      const priceResult = await refreshCardPrices(db, {
        language,
        setId: options.setId,
        limit: options.limit ?? 250,
        forcePrices: options.forcePrices,
      });
      summary.price_checked_total += priceResult.checked;
      summary.priced_total += priceResult.priced;
      summary.unpriced_total += priceResult.unavailable;
    }
    await finishSyncRun(db, run, 'completed', summary);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSyncRun(db, run, 'failed', summary, message);
    throw error;
  }
}

export const tcgdexCatalogueJobs = {
  syncEnglishSets: (db, options = {}) => syncTcgdexCatalogue(db, { ...options, language: 'en' }),
  syncJapaneseSets: (db, options = {}) => syncTcgdexCatalogue(db, { ...options, language: 'ja' }),
  syncChineseSets: (db, options = {}) => syncTcgdexCatalogue(db, { ...options, language: 'zh-tw' }),
  syncCardsForSet,
  repairSetAssetUrls,
  resolveMissingImages,
  verifyExistingImages: (db, options = {}) => resolveMissingImages(db, { ...options, force: true }),
  refreshCardPrices,
  retryUnpricedCards: refreshCardPrices,
  generateImageVariants: resolveMissingImages,
  reconcileProviderMappings: async () => ({ status: 'provider_id_mappings_are_upserted_during_sync' }),
  buildCatalogueHealthReport: getCatalogueHealth,
};
