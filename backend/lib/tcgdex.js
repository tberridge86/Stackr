import {
  getEnglishCardDisplayName,
  getEnglishSetDisplayName,
  getPreferredSetDisplayName,
} from './cardDisplayNames.js';

const TCGDEX_BASE_URL = process.env.TCGDEX_API_BASE_URL || 'https://api.tcgdex.net/v2';
const TCGDEX_CACHE_TTL_MS = Number(process.env.TCGDEX_CACHE_TTL_MS || 10 * 60 * 1000);
const USD_TO_GBP = Number(process.env.USD_TO_GBP || 0.79);
const EUR_TO_GBP = Number(process.env.EUR_TO_GBP || 0.86);

const tcgdexCache = new Map();
const tcgdexInflight = new Map();

export const TCGDEX_LANGUAGES = [
  { code: 'en', label: 'English', region: 'INTL' },
  { code: 'fr', label: 'French', region: 'FR' },
  { code: 'es', label: 'Spanish', region: 'ES' },
  { code: 'it', label: 'Italian', region: 'IT' },
  { code: 'pt-br', label: 'Portuguese (Brazil)', region: 'BR' },
  { code: 'de', label: 'German', region: 'DE' },
  { code: 'ja', label: 'Japanese', region: 'JP' },
  { code: 'zh-tw', label: 'Chinese (Traditional)', region: 'TW' },
  { code: 'id', label: 'Indonesian', region: 'ID' },
  { code: 'th', label: 'Thai', region: 'TH' },
];

const LANGUAGE_ALIASES = new Map([
  ['jp', 'ja'],
  ['jpn', 'ja'],
  ['japanese', 'ja'],
  ['japan', 'ja'],
  ['br', 'pt-br'],
  ['pt', 'pt-br'],
  ['ptbr', 'pt-br'],
  ['pt_br', 'pt-br'],
  ['portuguese', 'pt-br'],
  ['zh', 'zh-tw'],
  ['zhtw', 'zh-tw'],
  ['zh_tw', 'zh-tw'],
  ['traditional-chinese', 'zh-tw'],
  ['chinese-traditional', 'zh-tw'],
  ['cn-traditional', 'zh-tw'],
  ['tw', 'zh-tw'],
  ['indonesian', 'id'],
  ['thai', 'th'],
  ['french', 'fr'],
  ['spanish', 'es'],
  ['italian', 'it'],
  ['german', 'de'],
  ['english', 'en'],
]);

function normalizeLanguage(value = 'en') {
  const cleaned = String(value || 'en').trim().toLowerCase().replace(/\s+/g, '-');
  const aliased = LANGUAGE_ALIASES.get(cleaned) ?? cleaned;
  return TCGDEX_LANGUAGES.some((language) => language.code === aliased) ? aliased : 'en';
}

export function normalizeTcgdexLanguage(value = 'en') {
  return normalizeLanguage(value);
}

function getLanguageMeta(language) {
  const lang = normalizeLanguage(language);
  return TCGDEX_LANGUAGES.find((entry) => entry.code === lang) ?? TCGDEX_LANGUAGES[0];
}

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/pok[eé]mon/g, 'pokemon')
    .replace(/[’`]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\s'-]/g, ' ')
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

function money(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

function toGbp(value, unit) {
  const num = toNumberOrNull(value);
  if (num == null) return null;
  const currency = String(unit || '').toUpperCase();
  if (currency === 'GBP') return money(num);
  if (currency === 'EUR') return money(num * EUR_TO_GBP);
  return money(num * USD_TO_GBP);
}

async function fetchJson(path) {
  const url = `${TCGDEX_BASE_URL.replace(/\/$/, '')}${path}`;
  const now = Date.now();
  const cached = tcgdexCache.get(url);
  if (cached && cached.expiresAt > now) return cached.value;

  const inflight = tcgdexInflight.get(url);
  if (inflight) return inflight;

  const request = (async () => {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`TCGdex request failed (${response.status}): ${text.slice(0, 240)}`);
    }
    const value = text ? JSON.parse(text) : null;
    tcgdexCache.set(url, { value, expiresAt: Date.now() + TCGDEX_CACHE_TTL_MS });
    return value;
  })();

  tcgdexInflight.set(url, request);
  try {
    return await request;
  } finally {
    tcgdexInflight.delete(url);
  }
}

function withCardImageAsset(url, size = 'high') {
  if (!url) return null;
  const value = String(url).trim();
  if (/\.(webp|png|jpe?g)(?:[?#].*)?$/i.test(value)) return value;
  return `${value.replace(/\/$/, '')}/${size}.webp`;
}

function withSetAsset(url, extension = 'webp') {
  if (!url) return null;
  const value = String(url).trim();
  if (/\.(webp|png|jpe?g)(?:[?#].*)?$/i.test(value)) return value;
  return `${value.replace(/\/$/, '')}.${extension}`;
}

function mapSetBrief(set, language) {
  const lang = normalizeLanguage(language);
  const meta = getLanguageMeta(lang);
  const total = set?.cardCount?.total ?? set?.cardCount?.official ?? null;
  const localName = set?.name ?? set?.id ?? null;
  const englishDisplayName = lang === 'en'
    ? localName
    : getEnglishSetDisplayName({
      id: set?.id ?? null,
      sourceId: set?.id ?? null,
      setCode: set?.id ?? null,
      language: lang,
      region: meta.region,
      localName,
      raw: set,
    });
  const displayName = getPreferredSetDisplayName({
    id: set?.id ?? null,
    sourceId: set?.id ?? null,
    setCode: set?.id ?? null,
    language: lang,
    region: meta.region,
    localName,
    englishDisplayName,
    raw: set,
  });
  return {
    id: set?.id ?? null,
    providerSetId: set?.id ?? null,
    language: lang,
    region: meta.region,
    name: displayName,
    localName,
    englishDisplayName,
    series: set?.serie?.name ?? set?.serie?.id ?? set?.series ?? null,
    releaseDate: set?.releaseDate ?? null,
    cardCount: {
      total,
      official: set?.cardCount?.official ?? total,
      normal: set?.cardCount?.normal ?? null,
      holo: set?.cardCount?.holo ?? null,
      reverse: set?.cardCount?.reverse ?? null,
      firstEd: set?.cardCount?.firstEd ?? null,
    },
    logo: set?.logo ? withSetAsset(set.logo, 'webp') : null,
    logoBase: set?.logo ?? null,
    symbol: set?.symbol ? withSetAsset(set.symbol, 'webp') : null,
    symbolBase: set?.symbol ?? null,
    raw: set ?? null,
  };
}

function mapCardBrief(card, language, context = {}) {
  const lang = normalizeLanguage(language);
  const meta = getLanguageMeta(lang);
  const localName = card?.name ?? card?.id ?? null;
  const contextSet = card?.set ?? context.set ?? null;
  const setId = contextSet?.id ?? context.setId ?? null;
  const raw = {
    ...(card ?? {}),
    set: contextSet ?? card?.set ?? undefined,
  };
  const englishDisplayName = lang === 'en'
    ? localName
    : getEnglishCardDisplayName({
      id: card?.id ?? null,
      sourceId: card?.id ?? null,
      setId,
      collectorNumber: card?.localId ?? null,
      language: lang,
      region: meta.region,
      localName,
      raw,
    });
  const displayName = englishDisplayName ?? localName;
  return {
    id: card?.id ?? null,
    providerCardId: card?.id ?? null,
    language: lang,
    region: meta.region,
    localId: card?.localId ?? null,
    number: card?.localId ?? null,
    name: displayName,
    localName,
    englishDisplayName,
    image: card?.image ? withCardImageAsset(card.image, 'high') : null,
    imageSmall: card?.image ? withCardImageAsset(card.image, 'low') : null,
    imageBase: card?.image ?? null,
    raw,
  };
}

function getTcgplayerVariants(pricing) {
  const tcgplayer = pricing?.tcgplayer;
  if (!tcgplayer) return [];
  const unit = tcgplayer.unit || 'USD';
  return Object.entries(tcgplayer)
    .filter(([key, value]) => key !== 'unit' && key !== 'updated' && value && typeof value === 'object')
    .map(([variant, value]) => ({
      source: 'tcgdex_tcgplayer',
      variant,
      currency: unit,
      updatedAt: tcgplayer.updated ?? null,
      low: toNumberOrNull(value.lowPrice),
      mid: toNumberOrNull(value.midPrice),
      high: toNumberOrNull(value.highPrice),
      market: toNumberOrNull(value.marketPrice),
      directLow: toNumberOrNull(value.directLowPrice),
      lowGbp: toGbp(value.lowPrice, unit),
      midGbp: toGbp(value.midPrice, unit),
      highGbp: toGbp(value.highPrice, unit),
      marketGbp: toGbp(value.marketPrice ?? value.midPrice ?? value.lowPrice, unit),
      directLowGbp: toGbp(value.directLowPrice, unit),
      externalProductId: value.productId ?? null,
    }))
    .filter((entry) => entry.lowGbp != null || entry.midGbp != null || entry.marketGbp != null);
}

function getCardmarketVariants(pricing) {
  const cardmarket = pricing?.cardmarket;
  if (!cardmarket) return [];
  const unit = cardmarket.unit || 'EUR';
  const standard = {
    source: 'tcgdex_cardmarket',
    variant: 'standard',
    currency: unit,
    updatedAt: cardmarket.updated ?? null,
    low: toNumberOrNull(cardmarket.low),
    average: toNumberOrNull(cardmarket.avg),
    trend: toNumberOrNull(cardmarket.trend),
    average1: toNumberOrNull(cardmarket.avg1),
    average7: toNumberOrNull(cardmarket.avg7),
    average30: toNumberOrNull(cardmarket.avg30),
    lowGbp: toGbp(cardmarket.low, unit),
    averageGbp: toGbp(cardmarket.avg, unit),
    trendGbp: toGbp(cardmarket.trend, unit),
    average1Gbp: toGbp(cardmarket.avg1, unit),
    average7Gbp: toGbp(cardmarket.avg7, unit),
    average30Gbp: toGbp(cardmarket.avg30, unit),
    marketGbp: toGbp(cardmarket.trend ?? cardmarket.avg30 ?? cardmarket.avg ?? cardmarket.low, unit),
    externalProductId: cardmarket.idProduct ?? null,
  };
  const holo = {
    source: 'tcgdex_cardmarket',
    variant: 'holo',
    currency: unit,
    updatedAt: cardmarket.updated ?? null,
    low: toNumberOrNull(cardmarket['low-holo']),
    average: toNumberOrNull(cardmarket['avg-holo']),
    trend: toNumberOrNull(cardmarket['trend-holo']),
    average1: toNumberOrNull(cardmarket['avg1-holo']),
    average7: toNumberOrNull(cardmarket['avg7-holo']),
    average30: toNumberOrNull(cardmarket['avg30-holo']),
    lowGbp: toGbp(cardmarket['low-holo'], unit),
    averageGbp: toGbp(cardmarket['avg-holo'], unit),
    trendGbp: toGbp(cardmarket['trend-holo'], unit),
    average1Gbp: toGbp(cardmarket['avg1-holo'], unit),
    average7Gbp: toGbp(cardmarket['avg7-holo'], unit),
    average30Gbp: toGbp(cardmarket['avg30-holo'], unit),
    marketGbp: toGbp(cardmarket['trend-holo'] ?? cardmarket['avg30-holo'] ?? cardmarket['avg-holo'] ?? cardmarket['low-holo'], unit),
    externalProductId: cardmarket.idProduct ?? null,
  };

  return [standard, holo].filter((entry) => entry.marketGbp != null || entry.lowGbp != null);
}

export function summariseTcgdexPricing(card, language = 'en') {
  const lang = normalizeLanguage(language);
  const cardmarket = getCardmarketVariants(card?.pricing);
  const tcgplayer = lang === 'en' ? getTcgplayerVariants(card?.pricing) : [];
  const preferred = lang === 'en'
    ? tcgplayer[0] ?? cardmarket[0] ?? null
    : cardmarket[0] ?? null;

  return {
    preferredGbp: preferred?.marketGbp ?? preferred?.averageGbp ?? preferred?.midGbp ?? preferred?.lowGbp ?? null,
    preferredSource: preferred?.source ?? null,
    preferredVariant: preferred?.variant ?? null,
    cardmarket,
    tcgplayer,
    raw: card?.pricing ?? null,
  };
}

function mapDetailedCard(card, language) {
  const brief = mapCardBrief(card, language);
  const lang = normalizeLanguage(language);
  const meta = getLanguageMeta(lang);
  const localSetName = card?.set?.name ?? null;
  const setEnglishDisplayName = lang === 'en'
    ? localSetName
    : getEnglishSetDisplayName({
      id: card?.set?.id ?? null,
      sourceId: card?.set?.id ?? null,
      setCode: card?.set?.id ?? null,
      language: lang,
      region: meta.region,
      localName: localSetName,
      raw: card?.set,
    });
  const setDisplayName = getPreferredSetDisplayName({
    id: card?.set?.id ?? null,
    sourceId: card?.set?.id ?? null,
    setCode: card?.set?.id ?? null,
    language: lang,
    region: meta.region,
    localName: localSetName,
    englishDisplayName: setEnglishDisplayName,
    raw: card?.set,
  });
  return {
    ...brief,
    rarity: card?.rarity ?? null,
    category: card?.category ?? null,
    illustrator: card?.illustrator ?? null,
    hp: card?.hp ?? null,
    types: card?.types ?? [],
    stage: card?.stage ?? null,
    suffix: card?.suffix ?? null,
    item: card?.item ?? null,
    set: card?.set
      ? {
          id: card.set.id ?? null,
          name: setDisplayName,
          localName: localSetName,
          englishDisplayName: setEnglishDisplayName,
          logo: card.set.logo ? withSetAsset(card.set.logo, 'webp') : null,
          symbol: card.set.symbol ? withSetAsset(card.set.symbol, 'webp') : null,
          cardCount: card.set.cardCount ?? null,
        }
      : null,
    pricing: summariseTcgdexPricing(card, language),
    raw: card ?? null,
  };
}

export async function searchTcgdexCards({ query, language = 'ja', limit = 20 }) {
  const lang = normalizeLanguage(language);
  const trimmed = String(query || '').trim();
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams({ name: trimmed });
  const results = await fetchJson(`/${lang}/cards?${params.toString()}`);
  const list = Array.isArray(results) ? results : Array.isArray(results?.value) ? results.value : [];
  return list.slice(0, Math.max(1, Math.min(Number(limit) || 20, 100))).map((card) => ({
    ...mapCardBrief(card, lang),
    image: card.image ? withCardImageAsset(card.image, 'low') : null,
  }));
}

export async function fetchTcgdexCard(cardId, language = 'ja') {
  const id = String(cardId || '').trim();
  if (!id) return null;
  const lang = normalizeLanguage(language);
  return fetchJson(`/${lang}/cards/${encodeURIComponent(id)}`);
}

export async function fetchTcgdexLanguages() {
  return TCGDEX_LANGUAGES;
}

export async function fetchTcgdexSets({ language = 'en', limit = 250, query = '' } = {}) {
  const lang = normalizeLanguage(language);
  const trimmed = String(query || '').trim().toLowerCase();
  const results = await fetchJson(`/${lang}/sets`);
  const list = Array.isArray(results) ? results : [];
  const mapped = list.map((set) => mapSetBrief(set, lang));
  const filtered = trimmed
    ? mapped.filter((set) => normalizeText(`${set?.name ?? ''} ${set?.localName ?? ''} ${set?.id ?? ''}`).includes(normalizeText(trimmed)))
    : mapped;
  return filtered.slice(0, Math.max(1, Math.min(Number(limit) || 250, 500)));
}

export async function fetchTcgdexSet(setId, language = 'en') {
  const id = String(setId || '').trim();
  if (!id) return null;
  const lang = normalizeLanguage(language);
  const set = await fetchJson(`/${lang}/sets/${encodeURIComponent(id)}`);
  const setContext = { id: set?.id ?? id, name: set?.name ?? null };
  return {
    ...mapSetBrief(set, lang),
    cards: Array.isArray(set?.cards) ? set.cards.map((card) => mapCardBrief(card, lang, { set: setContext })) : [],
  };
}

export async function fetchTcgdexCardDetail(cardId, language = 'en') {
  const card = await fetchTcgdexCard(cardId, language);
  return card ? mapDetailedCard(card, language) : null;
}

export async function searchTcgdexCardsDetailed({
  query,
  language = 'en',
  setId,
  number,
  limit = 20,
  includeDetails = false,
}) {
  const lang = normalizeLanguage(language);
  const trimmed = String(query || '').trim();
  const localNumber = String(number || '').trim().replace(/^0+/, '');
  const cleanSetId = String(setId || '').trim();
  if (trimmed.length < 2 && !cleanSetId) return [];

  let summaries = [];
  if (cleanSetId) {
    const set = await fetchTcgdexSet(cleanSetId, lang);
    summaries = Array.isArray(set?.cards) ? set.cards : [];
  } else {
    summaries = await searchTcgdexCards({ query: trimmed, language: lang, limit: Math.max(Number(limit) || 20, 20) });
  }

  const normalizedQuery = normalizeText(trimmed);
  const filtered = summaries.filter((card) => {
    const matchesName = !normalizedQuery || normalizeText(card?.name).includes(normalizedQuery);
    const matchesNumber = !localNumber || String(card?.localId ?? card?.number ?? '').replace(/^0+/, '') === localNumber;
    return matchesName && matchesNumber;
  }).slice(0, Math.max(1, Math.min(Number(limit) || 20, 100)));

  if (!includeDetails) return filtered;

  const detailed = [];
  for (const card of filtered) {
    try {
      const detail = await fetchTcgdexCardDetail(card.id, lang);
      if (detail) detailed.push(detail);
    } catch (error) {
      console.log(JSON.stringify({
        event: 'tcgdex_detail_failure',
        provider: 'tcgdex',
        language: lang,
        cardId: card?.id ?? null,
        failureReason: error instanceof Error ? error.message : String(error),
      }));
      detailed.push(card);
    }
  }
  return detailed;
}

function getTcgplayerPrice(pricing) {
  const tcgplayer = pricing?.tcgplayer;
  if (!tcgplayer) return null;
  const unit = tcgplayer.unit || 'USD';
  const entries = Object.values(tcgplayer).filter((entry) => entry && typeof entry === 'object');
  const preferred = entries
    .map((entry) => ({
      low: toGbp(entry.lowPrice, unit),
      mid: toGbp(entry.midPrice ?? entry.marketPrice, unit),
      market: toGbp(entry.marketPrice ?? entry.midPrice, unit),
      updated: tcgplayer.updated ?? null,
      productId: entry.productId ?? null,
    }))
    .find((entry) => entry.market != null || entry.mid != null || entry.low != null);

  if (!preferred) return null;
  return {
    source: 'tcgdex_tcgplayer',
    low: preferred.low,
    mid: preferred.market ?? preferred.mid ?? preferred.low,
    market: preferred.market ?? preferred.mid ?? preferred.low,
    updatedAt: preferred.updated,
    externalProductId: preferred.productId,
  };
}

function getCardmarketPrice(pricing) {
  const cardmarket = pricing?.cardmarket;
  if (!cardmarket) return null;
  const unit = cardmarket.unit || 'EUR';
  const trend = toGbp(cardmarket.trend, unit);
  const avg30 = toGbp(cardmarket.avg30, unit);
  const avg = toGbp(cardmarket.avg, unit);
  const low = toGbp(cardmarket.low, unit);
  const value = trend ?? avg30 ?? avg ?? low;
  if (value == null) return null;

  return {
    source: 'tcgdex_cardmarket',
    low,
    mid: value,
    market: value,
    updatedAt: cardmarket.updated ?? null,
    externalProductId: cardmarket.idProduct ?? null,
  };
}

function resolveTcgdexPrice(card, language = 'ja') {
  const lang = normalizeLanguage(language);
  const meta = getLanguageMeta(lang);
  const localName = card?.name ?? null;
  const englishDisplayName = lang === 'en'
    ? localName
    : getEnglishCardDisplayName({
      id: card?.id ?? null,
      sourceId: card?.id ?? null,
      collectorNumber: card?.localId ?? null,
      language: lang,
      region: meta.region,
      localName,
      raw: card,
    });
  const localSetName = card?.set?.name ?? null;
  const setEnglishDisplayName = lang === 'en'
    ? localSetName
    : getEnglishSetDisplayName({
      id: card?.set?.id ?? null,
      sourceId: card?.set?.id ?? null,
      setCode: card?.set?.id ?? null,
      language: lang,
      region: meta.region,
      localName: localSetName,
      raw: card?.set,
    });
  const tcgplayer = lang === 'en' ? getTcgplayerPrice(card?.pricing) : null;
  const cardmarket = getCardmarketPrice(card?.pricing);
  const preferred = lang === 'en'
    ? tcgplayer ?? cardmarket
    : cardmarket;

  if (!preferred) {
    return {
      source: 'tcgdex',
      providerCardId: card?.id ?? null,
      language: lang,
      name: englishDisplayName ?? localName,
      localName,
      englishDisplayName,
      setName: setEnglishDisplayName ?? localSetName,
      setLocalName: localSetName,
      setEnglishDisplayName,
      number: card?.localId ?? null,
      image: card?.image ? withCardImageAsset(card.image, 'high') : null,
      tcg_low: null,
      tcg_mid: null,
      cardmarket_trend: null,
      price: null,
      priceSource: null,
      pricingUpdatedAt: null,
      raw: card ?? null,
    };
  }

  return {
    source: 'tcgdex',
    providerCardId: card?.id ?? null,
    language: lang,
    name: englishDisplayName ?? localName,
    localName,
    englishDisplayName,
    setName: setEnglishDisplayName ?? localSetName,
    setLocalName: localSetName,
    setEnglishDisplayName,
    number: card?.localId ?? null,
    rarity: card?.rarity ?? null,
    image: card?.image ? withCardImageAsset(card.image, 'high') : null,
    tcg_low: preferred.source === 'tcgdex_tcgplayer' ? preferred.low : null,
    tcg_mid: preferred.source === 'tcgdex_tcgplayer' ? preferred.market : null,
    cardmarket_trend: preferred.source === 'tcgdex_cardmarket' ? preferred.market : null,
    price: preferred.market ?? preferred.mid ?? preferred.low,
    priceSource: preferred.source,
    pricingUpdatedAt: preferred.updatedAt,
    externalProductId: preferred.externalProductId,
    raw: card ?? null,
  };
}

function scoreTcgdexCard(card, target = {}) {
  const targetName = normalizeText(target.name);
  const targetSet = normalizeText(target.setName);
  const targetNumber = normalizeText(target.number).replace(/^0+/, '');
  const cardName = normalizeText(card?.name);
  const cardSet = normalizeText(card?.set?.name);
  const cardNumber = normalizeText(card?.localId).replace(/^0+/, '');
  let score = 0;

  if (targetName && cardName === targetName) score += 80;
  else if (targetName && cardName.includes(targetName)) score += 50;
  else if (targetName && targetName.includes(cardName)) score += 35;

  if (targetSet && cardSet === targetSet) score += 45;
  else if (targetSet && cardSet.includes(targetSet)) score += 25;

  if (targetNumber && cardNumber === targetNumber) score += 45;
  if (card?.pricing?.cardmarket || card?.pricing?.tcgplayer) score += 8;

  return score;
}

export async function fetchTcgdexCardPrice({
  cardId,
  name,
  setName,
  number,
  language = 'ja',
  searchLimit = 8,
}) {
  const lang = normalizeLanguage(language);

  if (cardId) {
    try {
      const card = await fetchTcgdexCard(cardId, lang);
      if (card?.id) return resolveTcgdexPrice(card, lang);
    } catch (error) {
      console.log(JSON.stringify({
        event: 'tcgdex_price_card_lookup_failure',
        provider: 'tcgdex',
        language: lang,
        cardId,
        failureReason: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const query = String(name || '').trim();
  if (!query) return null;

  const summaries = await searchTcgdexCards({ query, language: lang, limit: searchLimit });
  const detailed = [];
  for (const summary of summaries) {
    try {
      const card = await fetchTcgdexCard(summary.id, lang);
      if (card?.id) detailed.push(card);
    } catch (error) {
      console.log(JSON.stringify({
        event: 'tcgdex_price_search_detail_failure',
        provider: 'tcgdex',
        language: lang,
        cardId: summary?.id ?? null,
        failureReason: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (!detailed.length) return null;
  const best = detailed
    .map((card) => ({ card, score: scoreTcgdexCard(card, { name, setName, number }) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < 40) return null;
  return {
    ...resolveTcgdexPrice(best.card, lang),
    matchScore: best.score,
  };
}
