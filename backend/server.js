/* eslint-env node */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import discordRoutes from './routes/discord.js';
import sharp from 'sharp';
import cardsightRoutes from './routes/cardsight.js';
import { Buffer } from 'node:buffer';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api/cardsight', cardsightRoutes);
app.use('/api/discord', discordRoutes);

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || 'EBAY_GB';
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
const SERPAPI_ENGINE = process.env.SERPAPI_ENGINE || 'ebay';
const XIMILAR_API_TOKEN = process.env.XIMILAR_API_TOKEN;
const POKEMON_TCG_API_KEY = process.env.POKEMON_TCG_API_KEY;
const PORT = process.env.PORT || 3001;
const EBAY_OAUTH_SCOPES = (
  process.env.EBAY_OAUTH_SCOPES ||
  'https://api.ebay.com/oauth/api_scope'
)
  .split(/\s+/)
  .filter(Boolean);


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// ===============================
// TITLE FILTERING
// ===============================

const BLOCKED_TERMS = [
  // Graded slabs
  'psa', 'bgs', 'cgc', 'sgc', 'ace grading', 'beckett',
  'graded', 'gem mint', 'slab',

  // Fakes / unofficial
  'proxy', 'replica', 'reprint',
  'custom card', 'custom ', 'fan art', 'fanart', 'fan-made', 'fan made',

  // Multi-card lots
  'bundle', 'bulk', 'job lot', 'joblot', 'lot of', 'trio', 'pair',
  'collection lot', 'mixed lot',

  // Sealed product / booster
  'booster pack', 'booster box', 'booster bundle', 'booster',
  'blister pack', 'blister',
  'sealed pack', 'elite trainer', 'etb',
  'empty box', 'display box', 'empty tin',
  'advent calendar',

  // Multi-listing choose-your-own
  'choose your card', 'choose your cards', 'pick your card',
  'you choose', 'choose card', 'choose a card', 'choose individual',
  'singles common', 'common uncommon',
  'select your', 'pick from',

  // Stickers / art products
  'sticker sheet', 'sticker pack', 'sticker set', 'sticker',
  'artbox',

  // Metal / novelty fake cards
  'black metal card', 'metal card', 'solid metal',
  'gold foil card', 'gold metal', 'metal gold',
  '24k gold', '24ct gold', 'gold plated',

  // Other non-card formats
  'oversized', 'digital', 'code card',
  'mini card', 'mini print',

  // Keychains / wearables / accessories
  'keychain', 'keyring', 'lanyard', 'wristband',
  'fridge magnet', 'magnet',
  'pendant', 'necklace', 'jewellery', 'jewelry', 'bracelet', 'earring',
  'pin badge', 'button badge', 'enamel pin',
  'badge',

  // Toys / figures / plush
  'plush', 'soft toy', 'stuffed',
  'figure', 'figurine', 'statue', 'mini figure',

  // Homeware / clothing
  'mug', 'cup', 'coaster',
  't-shirt', 'hoodie', 'clothing',
  'phone case', 'phone cover',
  'notebook', 'journal',
  'poster', 'art print', 'canvas print', 'canvas',
  'bookmark', 'patch',
  'playmat', 'play mat',
  'tin',

  // Card accessories (not cards)
  'deck box', 'deckbox',
  'sleeve', 'card sleeve',
  'binder', 'portfolio', 'card folder', 'album',
  'acrylic case', 'acrylic stand',

  // Plastic / resin novelties
  'resin', 'plastic card',

  // Display / novelty items
  'for display', 'display only', 'display piece',
  'mystery pack', 'mystery box', 'mystery bag', 'mystery bundle',
  'novelty', 'random card', 'random selection',
  'coin', 'token',

  // Condition red flags
  'read description',
  'heavily played', 'poor condition', 'damaged',
  'creased', 'crease', 'bent', 'inked', 'marked',
  'written on', 'torn', 'water damaged',
];

function titleLooksBad(title = '') {
  const t = title.toLowerCase();
  return BLOCKED_TERMS.some((term) => t.includes(term));
}

function extractCardNumber(query = '') {
  const match = query.match(/\b(\d+\/\d+)\b/);
  return match ? match[1].toLowerCase() : null;
}

// Common set name mappings to abbreviations/ids
const SET_NAME_MAPPINGS = {
  'base set': 'base',
  'base': 'base',
  'jungle': 'base2',
  'fossil': 'base3',
  'base set 2': 'base2',
  'legendary collection': 'base5',
  'neo': 'neo',
  'gym': 'gym',
  'e-card': 'ecard',
  'ex': 'ex',
  'ruby sapphire': 'rs',
  'ruby & sapphire': 'rs',
  'diamond pearl': 'dp',
  'diamond & pearl': 'dp',
  'platinum': 'pt',
  'heartgold soulsilver': 'hgss',
  'black white': 'bw',
  'black & white': 'bw',
  'xy': 'xy',
  'x y': 'xy',
  'sun moon': 'sm',
  'sun & moon': 'sm',
  'sword shield': 'swsh',
  'sword & shield': 'swsh',
  'scarlet violet': 'sv',
  'scarlet & violet': 'sv',
};

function getImportantWords(query = '') {
  const stopWords = new Set([
    'pokemon', 'pokémon', 'card', 'cards', 
    'holo', 'foil', 'perfect', 'order', 'the', 'and', 'for',
    'near', 'mint', 'nm', 'lp', 'mp', 'hp', 'ex', 'nm/m',
    'holographic', 'reverse', '1st', 'first', 'edition',
    'pokemon card', 'tcg', 'pokemontcg',
    'ultra', 'secret', 'rare', 'amazing', 'rare',
    'vmax', 'vstar', 'vunion', 'ex', 'gx', 'prism',
    'star', 'Radiant', 'illustrator', 'special',
  ]);

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9'é]/g, ''))
    .filter((w) => w.length >= 2 && !stopWords.has(w) && !/^\d+$/.test(w));

  // Add mapped set abbreviations
  const queryLower = query.toLowerCase();
  for (const [setName, abbrev] of Object.entries(SET_NAME_MAPPINGS)) {
    if (queryLower.includes(setName) && !words.includes(abbrev)) {
      words.push(abbrev);
    }
  }

  return words;
}

function titleLooksGoodForQuery(title = '', query = '') {
  const t = title.toLowerCase();
  const cardNumber = extractCardNumber(query);
  const importantWords = getImportantWords(query);

  if (importantWords.length > 0) {
    const allWordsPresent = importantWords.every((word) => t.includes(word));
    if (!allWordsPresent) return false;
  }

  if (cardNumber && !t.includes(cardNumber)) return false;

  return true;
}

function numberFromPrice(value) {
  const num = parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
}

function summarisePrices(prices) {
  if (!prices.length) {
    return { low: null, average: null, high: null, count: 0 };
  }

  const sorted = [...prices].sort((a, b) => a - b);

  let trimmed;
  if (sorted.length >= 10) {
    // Trim bottom 15% and top 15% for a robust mid-market range
    const cut = Math.max(1, Math.floor(sorted.length * 0.15));
    trimmed = sorted.slice(cut, sorted.length - cut);
  } else if (sorted.length >= 6) {
    trimmed = sorted.slice(1, -1);
  } else {
    trimmed = sorted;
  }

  const avg = trimmed.reduce((sum, p) => sum + p, 0) / trimmed.length;

  return {
    low: Number(trimmed[0].toFixed(2)),
    average: Number(avg.toFixed(2)),
    high: Number(trimmed[trimmed.length - 1].toFixed(2)),
    count: trimmed.length,
  };
}

function buildCardQuery({ name = '', setName = '', number = '', rarity = '' }) {
  const parts = [name];

  // Add set name if available
  if (setName) {
    parts.push(setName);
  }

  // Add card number if available (e.g., "9/102" or "9")
  if (number) {
    parts.push(number);
  }

  // Add rarity hints to help distinguish holo vs non-holo
  if (rarity) {
    const rarityLower = rarity.toLowerCase();
    if (rarityLower.includes('holo') || rarityLower === 'rare' || rarityLower === 'ultra rare' || rarityLower === 'secret rare') {
      parts.push('holo');
      parts.push('holographic');
    }
    if (rarityLower.includes('reverse')) {
      parts.push('reverse holo');
    }
    if (rarityLower.includes('first edition') || rarityLower.includes('1st')) {
      parts.push('1st edition');
    }
  }

  parts.push('pokemon card');

  return parts
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');
}

// Build better fallback query with set hints when primary fails
function buildFallbackQuery({ name = '', setName = '', number = '', rarity = '' }) {
  const parts = [name];
  
  // Prioritize set name in fallback to maintain specificity
  if (setName) {
    parts.push(setName);
  }
  
  // Always add card number if available (critical for uniqueness)
  if (number) {
    parts.push(number);
  }
  
  // Add rarity hints for better rare card matching
  if (rarity) {
    const rarityLower = rarity.toLowerCase();
    if (rarityLower.includes('holo') || rarityLower === 'rare' || rarityLower === 'ultra rare' || rarityLower === 'secret rare') {
      parts.push('holo');
      parts.push('holographic');
    }
    if (rarityLower.includes('reverse')) {
      parts.push('reverse holo');
    }
    if (rarityLower.includes('first edition') || rarityLower.includes('1st')) {
      parts.push('1st edition');
    }
  } else if (!setName && !number) {
    // Only add holo hints if nothing else to go on
    parts.push('holo');
    parts.push('holographic');
  }
  
  parts.push('pokemon card');
  
  return parts
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');
}

// ===============================
// PRICE RESULT CACHE (2-hour TTL)
// ===============================

const priceCache = new Map();
const PRICE_CACHE_TTL = 2 * 60 * 60 * 1000;

// In-flight dedupe so concurrent identical queries share one upstream call
const inflightPriceRequests = new Map();

// Short failure cache to avoid immediate repeat hits after upstream throttling
const failureCache = new Map();
const FAILURE_CACHE_TTL = 60 * 1000;

// Global cooldown after eBay rate limit response
let ebayRateLimitCooldownUntil = 0;
const EBAY_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;

function getCachedPrice(key) {
  const entry = priceCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { priceCache.delete(key); return null; }
  return entry.data;
}

function setCachedPrice(key, data) {
  priceCache.set(key, { data, expiresAt: Date.now() + PRICE_CACHE_TTL });
}

function getCachedFailure(key) {
  const entry = failureCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    failureCache.delete(key);
    return null;
  }
  return entry.error;
}

function setCachedFailure(key, error) {
  failureCache.set(key, { error, expiresAt: Date.now() + FAILURE_CACHE_TTL });
}

function normalizePriceKey({ query = '', name = '', setName = '', number = '', rarity = '' }) {
  return JSON.stringify({
    query: String(query || '').trim().toLowerCase(),
    name: String(name || '').trim().toLowerCase(),
    setName: String(setName || '').trim().toLowerCase(),
    number: String(number || '').trim().toLowerCase(),
    rarity: String(rarity || '').trim().toLowerCase(),
  });
}

function isEbayRateLimitErrorMessage(message = '') {
  const m = String(message || '').toLowerCase();
  return m.includes('errorid') && m.includes('10001') && m.includes('ratelimiter');
}

// ===============================
// TOKEN CACHE
// ===============================

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    throw new Error('Missing eBay credentials');
  }

  const basic = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: EBAY_OAUTH_SCOPES.join(' '),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  if (!data.access_token) {
    throw new Error('Token response did not include access_token');
  }

  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in * 1000);

  return cachedToken;
}

// ===============================
// CORE EBAY SEARCH (Browse API)
// NOTE: Browse API does not provide exact equivalent of Finding's completed/sold endpoint.
// We approximate market pricing from current listing summaries (buyingOptions FIXED_PRICE/AUCTION).
// ===============================

function getBrowseLimitErrorMessage(status, text) {
  const raw = String(text || '');
  if (status === 429) return `Browse API rate limited (429): ${raw}`;
  if (status === 403) return `Browse API forbidden (403): ${raw}`;
  return `Browse API search failed (${status}): ${raw}`;
}

function parseSoldPriceValue(rawValue) {
  if (rawValue == null) return null;
  const cleaned = String(rawValue).replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalizeSerpApiSoldItems(data) {
  const candidates = [
    ...(Array.isArray(data?.organic_results) ? data.organic_results : []),
    ...(Array.isArray(data?.shopping_results) ? data.shopping_results : []),
    ...(Array.isArray(data?.search_results) ? data.search_results : []),
    ...(Array.isArray(data?.results) ? data.results : []),
    ...(Array.isArray(data?.items) ? data.items : []),
  ];

  return candidates
    .map((item) => {
      const title = String(item?.title || item?.name || '').trim();
      const priceValue =
        parseSoldPriceValue(item?.price?.extracted) ??
        parseSoldPriceValue(item?.price?.from?.extracted) ??
        parseSoldPriceValue(item?.price?.raw) ??
        parseSoldPriceValue(item?.extracted_price) ??
        parseSoldPriceValue(item?.price?.value);

      return {
        title,
        price: { value: priceValue },
      };
    })
    .filter((item) => item.title && item.price.value !== null);
}

async function searchEbaySoldListingsSerpApi(query) {
  if (!SERPAPI_API_KEY) {
    throw new Error('Missing SERPAPI_API_KEY');
  }

  const marketplace = String(EBAY_MARKETPLACE_ID || 'EBAY_GB').toLowerCase();
  const params = new URLSearchParams({
    engine: SERPAPI_ENGINE,
    _nkw: query,
    LH_Sold: '1',
    LH_Complete: '1',
    sacat: '0',
    api_key: SERPAPI_API_KEY,
    ebay_domain: marketplace === 'ebay_us' ? 'ebay.com' : 'ebay.co.uk',
  });
  const serpUrl = `https://serpapi.com/search.json?${params.toString()}`;

  const res = await fetch(serpUrl, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpApi sold search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  console.log('🔍 SerpApi top-level keys:', Object.keys(data));

  const normalized = normalizeSerpApiSoldItems(data);

  if (!normalized.length) {
    throw new Error('SerpApi returned no sold listings');
  }

  return normalized;
}

async function searchEbayBrowseListings(query) {
  const now = Date.now();
  if (now < ebayRateLimitCooldownUntil) {
    const secs = Math.ceil((ebayRateLimitCooldownUntil - now) / 1000);
    throw new Error(`eBay rate-limit cooldown active (${secs}s remaining)`);
  }

  const token = await getToken();
  const marketplace = EBAY_MARKETPLACE_ID;
  const limit = 50;

  const url =
    'https://api.ebay.com/buy/browse/v1/item_summary/search' +
    `?q=${encodeURIComponent(query)}` +
    `&limit=${limit}` +
    '&sort=price';

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': marketplace,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    const message = getBrowseLimitErrorMessage(res.status, text);
    if (res.status === 429 || message.toLowerCase().includes('ratelimit')) {
      ebayRateLimitCooldownUntil = Date.now() + EBAY_RATE_LIMIT_COOLDOWN_MS;
    }
    throw new Error(message);
  }

  const data = await res.json();
  const items = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];

  return items
    .filter((item) => {
      const options = Array.isArray(item?.buyingOptions) ? item.buyingOptions : [];
      return options.includes('FIXED_PRICE') || options.includes('AUCTION');
    })
    .map((item) => ({
      title: item?.title ?? '',
      price: { value: item?.price?.value ?? item?.currentBidPrice?.value ?? null },
    }));
}

function filterItems(items, query) {
  return items.filter((item) => {
    const title = item.title || '';
    const price = numberFromPrice(item.price?.value);

    if (!price) return false;
    if (price < 0.5) return false;
    if (price > 5000) return false;
    if (titleLooksBad(title)) return false;
    if (!titleLooksGoodForQuery(title, query)) return false;

    return true;
  });
}

// Extended signature to pass all card details to fallback
async function fetchEbaySummary(query, options = {}) {
  const { name = '', setName = '', number = '', rarity = '' } = options;
  const cardName = name || query.split(' ')[0];

  const cacheKey = normalizePriceKey({ query, name, setName, number, rarity });

  const cached = getCachedPrice(cacheKey);
  if (cached) {
    console.log(`✅ Cache hit for "${query}"`);
    return cached;
  }

  const cachedFailure = getCachedFailure(cacheKey);
  if (cachedFailure) {
    throw new Error(cachedFailure);
  }

  if (inflightPriceRequests.has(cacheKey)) {
    return inflightPriceRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      let rawItems = [];
      let usedSoldProvider = false;

      try {
        rawItems = await searchEbaySoldListingsSerpApi(query);
        usedSoldProvider = true;
      } catch (soldError) {
        console.log(`⚠️ Sold-provider failed for "${query}" (${getErrorMessage(soldError)}). Falling back to Browse listings.`);
        rawItems = await searchEbayBrowseListings(query);
      }
      let cleaned = filterItems(rawItems, query);

      let usedFallback = false;
      let fallbackQuery = '';

      if (cleaned.length === 0 && cardName) {
        fallbackQuery = buildFallbackQuery({ name: cardName, setName, number, rarity });
        console.log(`⚠️ No results for "${query}" — retrying with "${fallbackQuery}"`);

        let fallbackItems = [];
        try {
          fallbackItems = await searchEbaySoldListingsSerpApi(fallbackQuery);
          usedSoldProvider = true;
        } catch (soldFallbackError) {
          console.log(`⚠️ Sold-provider fallback failed for "${fallbackQuery}" (${getErrorMessage(soldFallbackError)}). Falling back to Browse listings.`);
          fallbackItems = await searchEbayBrowseListings(fallbackQuery);
        }
        cleaned = filterItems(fallbackItems, fallbackQuery);
        usedFallback = true;
      }

      const prices = cleaned
        .map((item) => numberFromPrice(item.price?.value))
        .filter((p) => p !== null);

      const summary = summarisePrices(prices);

      const result = {
        marketplace: EBAY_MARKETPLACE_ID,
        query: usedFallback ? fallbackQuery : query,
        originalQuery: query,
        usedFallback,
        low: summary.low,
        average: summary.average,
        high: summary.high,
        count: summary.count,
        rawCount: rawItems.length,
        soldDataSource: usedSoldProvider ? 'serpapi' : 'browse',
        sampleTitles: rawItems.slice(0, 10).map((item) => ({
          title: item.title,
          price: item.price?.value,
        })),
        acceptedTitles: cleaned.slice(0, 10).map((item) => ({
          title: item.title,
          price: item.price?.value,
        })),
      };

      setCachedPrice(cacheKey, result);
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      if (isEbayRateLimitErrorMessage(message) || message.includes('cooldown active')) {
        setCachedFailure(cacheKey, message);
      }
      throw error;
    } finally {
      inflightPriceRequests.delete(cacheKey);
    }
  })();

  inflightPriceRequests.set(cacheKey, promise);
  return promise;
}

// ===============================
// ROUTES
// ===============================

app.get('/debug-serpapi', async (req, res) => {
  const query = String(req.query.q || 'Charizard base set').trim();
  if (!SERPAPI_API_KEY) return res.status(500).json({ error: 'Missing SERPAPI_API_KEY' });

  const marketplace = String(EBAY_MARKETPLACE_ID || 'EBAY_GB').toLowerCase();
  const params = new URLSearchParams({
    engine: SERPAPI_ENGINE,
    _nkw: query,
    LH_Sold: '1',
    LH_Complete: '1',
    sacat: '0',
    api_key: SERPAPI_API_KEY,
    ebay_domain: marketplace === 'ebay_us' ? 'ebay.com' : 'ebay.co.uk',
  });
  const serpUrl = `https://serpapi.com/search.json?${params.toString()}`;

  const serpRes = await fetch(serpUrl, { headers: { Accept: 'application/json' } });
  const data = await serpRes.json();
  return res.json({ topLevelKeys: Object.keys(data), data });
});

app.get('/', (req, res) => {
  res.send('Stackr API is running');
});

app.get('/debug-env', (req, res) => {
  res.json({
    ok: true,
    hasEbayClientId: Boolean(EBAY_CLIENT_ID),
    hasEbayClientSecret: Boolean(EBAY_CLIENT_SECRET),
    hasXimilarToken: Boolean(XIMILAR_API_TOKEN),
    hasTcgApiKey: Boolean(POKEMON_TCG_API_KEY),
    marketplace: EBAY_MARKETPLACE_ID,
  });
});

app.get('/ebay-rate-limits', async (_req, res) => {
  try {
    const token = await getToken();
    const response = await fetch('https://api.ebay.com/developer/analytics/v1_beta/rate_limit/', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'eBay rate limit request failed',
        status: response.status,
        detail: data,
      });
    }

    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.get('/test-ebay-token', async (req, res) => {
  try {
    const token = await getToken();
    return res.json({ ok: true, tokenPreview: `${token.slice(0, 10)}...` });
  } catch (error) {
    return res.status(500).json({ ok: false, error: getErrorMessage(error) });
  }
});

// Simple price endpoint
app.get('/price', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();

    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    // Extract card name from query for fallback
    const cardName = query.split(' ')[0];
    
    // Try to parse additional info from query string for better fallback
    const parts = query.split(' ');
    const setName = parts.length > 1 ? parts.find(p => /^(base|xy|swsh|sv|sm|bw|dp|hgss)/i.test(p)) || '' : '';
    const number = parts.length > 1 ? parts.find(p => /^\d+\/\d+$/.test(p)) || '' : '';
    
    const summary = await fetchEbaySummary(query, { name: cardName, setName, number });
    return res.json(summary);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch eBay price',
      detail: getErrorMessage(error),
    });
  }
});

// Structured price endpoint
app.get('/api/price/ebay', async (req, res) => {
  try {
    const cardId = String(req.query.cardId || '').trim();
    const name = String(req.query.name || '').trim();
    const setName = String(req.query.setName || '').trim();
    const number = String(req.query.number || '').trim();
    const rarity = String(req.query.rarity || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Missing card name' });
    }

    // Build primary query with rarity hints for better matching
    const query = buildCardQuery({ name, setName, number, rarity });
    
    // Pass full card details for better fallback matching
    const summary = await fetchEbaySummary(query, { name, setName, number, rarity });

    return res.json({ cardId, name, setName, number, rarity, ...summary });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch eBay pricing',
      detail: getErrorMessage(error),
    });
  }
});

// ===============================
// DEBUG: PRICE FILTER INSPECTOR
// ===============================

app.get('/price/debug', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    const setName = String(req.query.set || '').trim();
    const number = String(req.query.number || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Missing ?name= param' });
    }

    const primaryQuery = buildCardQuery({ name, setName, number });
    const fallbackQuery = buildFallbackQuery({ name });

    const [primaryRaw, fallbackRaw] = await Promise.all([
      searchEbayBrowseListings(primaryQuery),
      searchEbayBrowseListings(fallbackQuery),
    ]);

    function analyseItems(items, query) {
      return items.map((item) => {
        const title = item.title || '';
        const price = numberFromPrice(item.price?.value);

        const reasons = [];

        if (!price) reasons.push('NO_PRICE');
        if (price !== null && price < 0.5) reasons.push(`PRICE_TOO_LOW (£${price})`);
        if (price !== null && price > 5000) reasons.push(`PRICE_TOO_HIGH (£${price})`);

        const t = title.toLowerCase();
        const matchedBlockedTerms = BLOCKED_TERMS.filter((term) => t.includes(term));
        if (matchedBlockedTerms.length > 0) {
          reasons.push(`BLOCKED_TERMS: [${matchedBlockedTerms.join(', ')}]`);
        }

        const cardNumber = extractCardNumber(query);
        const importantWords = getImportantWords(query);

        if (importantWords.length > 0) {
          const hasRelevantWord = importantWords.some((word) => t.includes(word));
          if (!hasRelevantWord) {
            reasons.push(`MISSING_KEYWORDS (looking for any of: [${importantWords.join(', ')}])`);
          }
        }

        if (cardNumber && !t.includes(cardNumber)) {
          reasons.push(`MISSING_CARD_NUMBER (looking for: ${cardNumber})`);
        }

        const accepted = reasons.length === 0;

        return {
          title,
          price: item.price?.value ?? null,
          accepted,
          reasons: accepted ? ['✅ ACCEPTED'] : reasons,
        };
      });
    }

    const primaryAnalysis = analyseItems(primaryRaw, primaryQuery);
    const fallbackAnalysis = analyseItems(fallbackRaw, fallbackQuery);

    const primaryAccepted = primaryAnalysis.filter((i) => i.accepted);
    const fallbackAccepted = fallbackAnalysis.filter((i) => i.accepted);

    const primaryPrices = primaryAccepted.map((i) => numberFromPrice(i.price)).filter(Boolean);
    const fallbackPrices = fallbackAccepted.map((i) => numberFromPrice(i.price)).filter(Boolean);

    return res.json({
      queries: { primary: primaryQuery, fallback: fallbackQuery },
      parsed: {
        importantWords: getImportantWords(primaryQuery),
        cardNumber: extractCardNumber(primaryQuery) ?? 'none found',
      },
      primary: {
        totalFromEbay: primaryRaw.length,
        accepted: primaryAccepted.length,
        rejected: primaryRaw.length - primaryAccepted.length,
        priceSummary: summarisePrices(primaryPrices),
        items: primaryAnalysis,
      },
      fallback: {
        totalFromEbay: fallbackRaw.length,
        accepted: fallbackAccepted.length,
        rejected: fallbackRaw.length - fallbackAccepted.length,
        priceSummary: summarisePrices(fallbackPrices),
        items: fallbackAnalysis,
      },
      blockedTermsActive: BLOCKED_TERMS,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Debug failed',
      detail: getErrorMessage(error),
    });
  }
});

// ===============================
// TCG CARD SEARCH
// Used by the scan feature
// ===============================

app.get('/api/search/tcg', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    const number = String(req.query.number || '').trim();
    const setName = String(req.query.setName || '').trim();
    const setId = String(req.query.setId || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    const headers = POKEMON_TCG_API_KEY
      ? { 'X-Api-Key': POKEMON_TCG_API_KEY }
      : {};

    // Build primary query
    let q = `name:"${name}"`;
    if (number) q += ` number:${number}`;
    if (setId) q += ` set.id:${setId}`;
    if (setName) q += ` set.name:"${setName}"`;

    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=20&orderBy=-set.releaseDate`;

    console.log(`🔍 Primary query: ${q}`);
    console.log(`🔍 URL: ${url}`);

    const response = await fetch(url, { headers });
    let cards = [];

    if (response.ok) {
      const data = await response.json();
      cards = data.data ?? [];
      console.log(`✅ Primary found: ${cards.length} cards`);
      if (cards.length > 0) {
        console.log(`✅ First: ${cards[0].name} | ${cards[0].set?.name} | #${cards[0].number}`);
      }
    } else {
      console.log(`❌ Primary failed: ${response.status}`);
    }

    // Fallback 1 — drop setId, keep number
    if (cards.length === 0 && (setId || setName) && number) {
      console.log('⚠️ Fallback 1 — name + number only');
      const q2 = `name:"${name}" number:${number}`;
      const res2 = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q2)}&pageSize=20&orderBy=-set.releaseDate`,
        { headers }
      );
      if (res2.ok) {
        const data2 = await res2.json();
        cards = data2.data ?? [];
        console.log(`✅ Fallback 1 found: ${cards.length} cards`);
        if (cards.length > 0) {
          console.log(`✅ First: ${cards[0].name} | ${cards[0].set?.name} | #${cards[0].number}`);
        }
      }
    }

    // Fallback 2 — name only
    if (cards.length === 0) {
      console.log('⚠️ Fallback 2 — name only');
      const q3 = `name:"${name}"`;
      const res3 = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q3)}&pageSize=20&orderBy=-set.releaseDate`,
        { headers }
      );
      if (res3.ok) {
        const data3 = await res3.json();
        cards = data3.data ?? [];
        console.log(`✅ Fallback 2 found: ${cards.length} cards`);
        if (cards.length > 0) {
          console.log(`✅ First: ${cards[0].name} | ${cards[0].set?.name} | #${cards[0].number}`);
        }
      }
    }

    const formatted = cards.map((card) => ({
      id: card.id,
      name: card.name,
      number: card.number,
      set_id: card.set?.id,
      set_name: card.set?.name,
      series: card.set?.series,
      rarity: card.rarity,
      image_small: card.images?.small,
      image_large: card.images?.large,
      release_date: card.set?.releaseDate,
    }));

    console.log(`📦 Returning ${formatted.length} cards`);

    return res.json({ cards: formatted, total: formatted.length });
  } catch (error) {
    return res.status(500).json({
      error: 'TCG search failed',
      detail: getErrorMessage(error),
    });
  }
});

// ===============================
// SCAN (Ximilar — scaffolded)
// ===============================

async function scanWithXimilar(imageUrl) {
  if (!XIMILAR_API_TOKEN) throw new Error('Missing XIMILAR_API_TOKEN');

  const ximilarRes = await fetch('https://api.ximilar.com/collectibles/v2/tcg_id', {
    method: 'POST',
    headers: {
      Authorization: `Token ${XIMILAR_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records: [{ _url: imageUrl }] }),
  });

  const data = await ximilarRes.json();

  return {
    ok: ximilarRes.ok,
    status: ximilarRes.status,
    data,
  };
}

app.post('/scan', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Missing imageUrl' });

    const result = await scanWithXimilar(imageUrl);
    if (!result.ok) {
      return res.status(result.status).json({ error: 'Ximilar request failed', detail: result.data });
    }

    return res.json(result.data);
  } catch (error) {
    return res.status(500).json({ error: 'Scan failed', detail: getErrorMessage(error) });
  }
});

app.post('/api/scan/tcg', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Missing imageUrl' });

    const result = await scanWithXimilar(imageUrl);
    if (!result.ok) {
      return res.status(result.status).json({ error: 'Ximilar request failed', detail: result.data });
    }

    return res.json(result.data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to scan card', detail: getErrorMessage(error) });
  }
});

app.get('/debug-ximilar', async (req, res) => {
  try {
    if (!XIMILAR_API_TOKEN) return res.status(500).json({ ok: false, error: 'Missing token' });

    const testRes = await fetch('https://api.ximilar.com/account/v2/details/', {
      method: 'GET',
      headers: { Authorization: `Token ${XIMILAR_API_TOKEN}` },
    });

    const text = await testRes.text();
    return res.status(testRes.status).send(text);
  } catch (error) {
    return res.status(500).json({ ok: false, error: getErrorMessage(error) });
  }
});

// ===============================
// TRADE: MARK AS SENT
// ===============================

app.post('/api/trade/sent', async (req, res) => {
  const { trade_id, user_id } = req.body;

  const { data: trade } = await supabase
    .from('trades')
    .select('*')
    .eq('id', trade_id)
    .single();

  if (!trade) return res.status(400).json({ error: 'Trade not found' });

  const updateField = trade.seller_id === user_id ? 'seller_sent' : 'buyer_sent';

  const { error } = await supabase
    .from('trades')
    .update({ [updateField]: true })
    .eq('id', trade_id);

  if (error) return res.status(400).json({ error });

  res.json({ success: true });
});

// ===============================
// TRADE: MARK AS RECEIVED
// ===============================

app.post('/api/trade/received', async (req, res) => {
  const { trade_id, user_id } = req.body;

  const { data: trade } = await supabase
    .from('trades')
    .select('*')
    .eq('id', trade_id)
    .single();

  if (!trade) return res.status(400).json({ error: 'Trade not found' });

  const updateField = trade.seller_id === user_id ? 'seller_received' : 'buyer_received';

  const updated = await supabase
    .from('trades')
    .update({ [updateField]: true })
    .eq('id', trade_id)
    .select()
    .single();

  const t = updated.data;

  if (t?.buyer_received && t?.seller_received) {
    await supabase
      .from('trades')
      .update({ status: 'completed' })
      .eq('id', trade_id);
  }

  res.json(updated.data);
});

// ===============================
// PUSH NOTIFICATIONS
// ===============================

async function sendPushNotification(token, title, body, data = {}) {
  const message = {
    to: token,
    sound: 'default',
    title,
    body,
    data,
  };

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(message),
  });

  const json = await res.json();
  return json;
}

async function getUserPushToken(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', userId)
    .maybeSingle();
  return data?.expo_push_token ?? null;
}

// Send notification to a single user
app.post('/api/notify', async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'Missing userId, title, or body' });
    }

    const token = await getUserPushToken(userId);

    if (!token) {
      return res.json({ ok: false, reason: 'No push token for user' });
    }

    const result = await sendPushNotification(token, title, body, data ?? {});
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: 'Notification failed', detail: getErrorMessage(error) });
  }
});

// New trade offer notification
app.post('/api/notify/trade-offer', async (req, res) => {
  try {
    const { recipientUserId, senderUsername, cardName } = req.body;

    if (!recipientUserId) {
      return res.status(400).json({ error: 'Missing recipientUserId' });
    }

    const token = await getUserPushToken(recipientUserId);
    if (!token) return res.json({ ok: false, reason: 'No push token' });

    const result = await sendPushNotification(
      token,
      '📬 New Trade Offer',
      `${senderUsername ?? 'Someone'} wants to trade${cardName ? ` for your ${cardName}` : ''}`,
      { type: 'trade_offer', screen: 'offers' }
    );

    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send trade offer notification', detail: getErrorMessage(error) });
  }
});

// Trade status update notification (accepted, declined, sent, received)
app.post('/api/notify/trade-status', async (req, res) => {
  try {
    const { recipientUserId, status, cardName } = req.body;

    if (!recipientUserId || !status) {
      return res.status(400).json({ error: 'Missing recipientUserId or status' });
    }

    const token = await getUserPushToken(recipientUserId);
    if (!token) return res.json({ ok: false, reason: 'No push token' });

    const messages = {
      accepted: { title: '✅ Trade Accepted', body: `Your trade offer${cardName ? ` for ${cardName}` : ''} was accepted!` },
      declined: { title: '❌ Trade Declined', body: `Your trade offer${cardName ? ` for ${cardName}` : ''} was declined.` },
      sent: { title: '📦 Card Sent', body: `The other trader has marked${cardName ? ` ${cardName}` : ' their card'} as sent.` },
      received: { title: '📬 Card Received', body: `The other trader has confirmed they received${cardName ? ` ${cardName}` : ' their card'}.` },
      completed: { title: '🎉 Trade Complete', body: `Your trade${cardName ? ` for ${cardName}` : ''} is complete!` },
    };

    const msg = messages[status];
    if (!msg) return res.status(400).json({ error: `Unknown status: ${status}` });

    const result = await sendPushNotification(token, msg.title, msg.body, { type: 'trade_status', status, screen: 'offers' });

    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send trade status notification', detail: getErrorMessage(error) });
  }
});

// Wishlist alert — someone listed a card the user has on their watchlist
app.post('/api/notify/wishlist-match', async (req, res) => {
  try {
    const { recipientUserId, listerUsername, cardName } = req.body;

    if (!recipientUserId || !cardName) {
      return res.status(400).json({ error: 'Missing recipientUserId or cardName' });
    }

    const token = await getUserPushToken(recipientUserId);
    if (!token) return res.json({ ok: false, reason: 'No push token' });

    const result = await sendPushNotification(
      token,
      '⭐ Wishlist Card Available',
      `${listerUsername ?? 'Someone'} just listed ${cardName} for trade — it's on your wishlist!`,
      { type: 'wishlist_match', screen: 'trade' }
    );

    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send wishlist notification', detail: getErrorMessage(error) });
  }
});

// Price alert — card hit target price
app.post('/api/notify/price-alert', async (req, res) => {
  try {
    const { recipientUserId, cardName, currentPrice, targetPrice, direction } = req.body;

    if (!recipientUserId || !cardName) {
      return res.status(400).json({ error: 'Missing recipientUserId or cardName' });
    }

    const token = await getUserPushToken(recipientUserId);
    if (!token) return res.json({ ok: false, reason: 'No push token' });

    const directionText = direction === 'below' ? 'dropped below' : 'risen above';

    const result = await sendPushNotification(
      token,
      '💰 Price Alert',
      `${cardName} has ${directionText} your target of £${targetPrice?.toFixed(2)}. Current price: £${currentPrice?.toFixed(2)}`,
      { type: 'price_alert', screen: 'market' }
    );

    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send price alert', detail: getErrorMessage(error) });
  }
});

// ... all the notification endpoints ...

// ===============================
// SYNC SET
// ===============================

app.get('/api/sync/set', async (req, res) => {
  try {
    const setId = String(req.query.setId || req.body.setId || '').trim();
    if (!setId) return res.status(400).json({ error: 'Missing setId' });

    const headers = POKEMON_TCG_API_KEY
      ? { 'X-Api-Key': POKEMON_TCG_API_KEY }
      : {};

    let page = 1;
    let totalUpserted = 0;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&pageSize=250&page=${page}`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        return res.status(500).json({ error: `TCG API failed: ${response.status}` });
      }

      const data = await response.json();
      const cards = data.data ?? [];

      if (!cards.length) {
        hasMore = false;
        break;
      }

      const rows = cards.map((card) => ({
        id: card.id,
        name: card.name,
        set_id: card.set?.id ?? setId,
        number: card.number ?? null,
        rarity: card.rarity ?? null,
        image_small: card.images?.small ?? null,
        image_large: card.images?.large ?? null,
        raw_data: card,
      }));

      const { error } = await supabase
        .from('pokemon_cards')
        .upsert(rows, { onConflict: 'id' });

      if (error) {
        console.log('Upsert error:', error);
        return res.status(500).json({ error: error.message });
      }

      totalUpserted += rows.length;
      console.log(`✅ Synced page ${page} — ${rows.length} cards`);

      if (cards.length < 250) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return res.json({ ok: true, setId, totalUpserted });
   } catch (error) {
    return res.status(500).json({
      error: 'Sync failed',
      detail: getErrorMessage(error),
    });
  }
});

app.post('/api/scan/identify', async (req, res) => {
  console.log('📸 /api/scan/identify hit');
  console.log('📸 Body keys:', Object.keys(req.body));
  try {
    const { base64Image } = req.body;
if (!base64Image) return res.status(400).json({ error: 'Missing base64Image' });

// Resize to under 1MB before sending to Claude
const imageBuffer = Buffer.from(base64Image, 'base64');
const resizedBuffer = await sharp(imageBuffer)
  .resize({ width: 600, withoutEnlargement: true })
  .jpeg({ quality: 60 })
  .toBuffer();
const processedBase64 = resizedBuffer.toString('base64');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: processedBase64 },
              },
              {
                type: 'text',
                text: 'This is a Pokémon TCG card. Identify the following: 1) The Pokémon name printed at the top of the card. 2) The set name printed near the bottom or on the set symbol. 3) The collector card number printed at the bottom in the format XX/XXX (e.g. 4/102 or 25/198). Respond with ONLY raw JSON, no markdown, no code fences, no extra text. Exact format: {"name": "pokemon name", "set": "set name", "number": "XX/XXX"}. If you genuinely cannot read any part of the card respond with {"error": "could not identify"}.',
              },
            ],
          },
        ],
      }),
    });

    console.log('📡 Anthropic status:', response.status);
    const data = await response.json();
    console.log('📡 Anthropic full response:', JSON.stringify(data));
    const text = data?.content?.[0]?.text ?? '';
    console.log('🔍 Claude raw response:', text);
    
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      return res.status(422).json({ error: 'Could not parse card identity' });
    }

    return res.json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Scan identify failed', detail: err.message });
  }
});

// ===============================
// DISCORD ROUTES
// ===============================

app.use('/api/discord', discordRoutes);

// ===============================
// START
// ===============================

app.listen(PORT, () => {
  console.log(`Stackr backend listening on port ${PORT}`);
});
