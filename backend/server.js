import { createClient } from '@supabase/supabase-js';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || 'EBAY_GB';
const XIMILAR_API_TOKEN = process.env.XIMILAR_API_TOKEN;
const POKEMON_TCG_API_KEY = process.env.POKEMON_TCG_API_KEY;
const PORT = process.env.PORT || 3001;


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
  'psa', 'bgs', 'cgc', 'sgc', 'ace grading',
  'graded', 'gem mint', 'slab',
  'proxy', 'replica', 'reprint',
  'custom card', 'fan art', 'fanart',
  'bundle', 'bulk', 'job lot', 'joblot', 'lot of',
  'booster pack', 'booster box', 'empty box', 'display box',
  'choose your card', 'choose your cards', 'pick your card',
  'you choose', 'choose card', 'choose a card', 'choose individual',
  'singles common', 'common uncommon',
  'sticker sheet', 'sticker pack', 'artbox',
  'black metal card', 'metal card', 'solid metal',
  'gold foil card', 'gold metal',
  'oversized', 'digital', 'code card',
  'keychain', 'fridge magnet', 'magnet',
  'resin', 'coaster', 'plastic card',
  'read description',
  'heavily played', 'poor condition', 'damaged',
  'creased', 'crease', 'bent', 'inked', 'marked',
  'written on', 'torn', 'water damaged',
  'novelty', 'random card', 'random selection',
];

function titleLooksBad(title = '') {
  const t = title.toLowerCase();
  return BLOCKED_TERMS.some((term) => t.includes(term));
}

function extractCardNumber(query = '') {
  const match = query.match(/\b(\d+\/\d+)\b/);
  return match ? match[1].toLowerCase() : null;
}

function getImportantWords(query = '') {
  const stopWords = new Set([
    'pokemon', 'pokémon', 'card', 'cards', 'base', 'set',
    'holo', 'foil', 'perfect', 'order', 'the', 'and', 'for',
    'near', 'mint', 'nm', 'lp', 'mp', 'hp', 'ex', 'nm/m',
  ]);

  return query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9'é]/g, ''))
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

function titleLooksGoodForQuery(title = '', query = '') {
  const t = title.toLowerCase();
  const cardNumber = extractCardNumber(query);
  const importantWords = getImportantWords(query);

  if (importantWords.length > 0) {
    const hasRelevantWord = importantWords.some((word) => t.includes(word));
    if (!hasRelevantWord) return false;
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
  const trimmed = sorted.length >= 6 ? sorted.slice(1, -1) : sorted;
  const avg = trimmed.reduce((sum, p) => sum + p, 0) / trimmed.length;

  return {
    low: Number(trimmed[0].toFixed(2)),
    average: Number(avg.toFixed(2)),
    high: Number(trimmed[trimmed.length - 1].toFixed(2)),
    count: trimmed.length,
  };
}

function buildCardQuery({ name = '', setName = '', number = '' }) {
  return [name, setName, number, 'pokemon card']
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');
}

function buildFallbackQuery({ name = '' }) {
  return `${name.trim()} pokemon card`.trim();
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
      scope: 'https://api.ebay.com/oauth/api_scope',
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
// CORE EBAY SEARCH
// ===============================

async function searchEbay(query, token) {
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(
    query
  )}&limit=50&sort=price`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Browse search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.itemSummaries || [];
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

async function fetchEbaySummary(query, cardName = '') {
  const token = await getToken();

  const rawItems = await searchEbay(query, token);
  let cleaned = filterItems(rawItems, query);

  let usedFallback = false;
  let fallbackQuery = '';

  if (cleaned.length === 0 && cardName) {
    fallbackQuery = buildFallbackQuery({ name: cardName });
    console.log(`⚠️ No results for "${query}" — retrying with "${fallbackQuery}"`);

    const fallbackItems = await searchEbay(fallbackQuery, token);
    cleaned = filterItems(fallbackItems, fallbackQuery);
    usedFallback = true;
  }

  const prices = cleaned
    .map((item) => numberFromPrice(item.price?.value))
    .filter((p) => p !== null);

  const summary = summarisePrices(prices);

  return {
    marketplace: EBAY_MARKETPLACE_ID,
    query: usedFallback ? fallbackQuery : query,
    originalQuery: query,
    usedFallback,
    low: summary.low,
    average: summary.average,
    high: summary.high,
    count: summary.count,
    rawCount: rawItems.length,
    sampleTitles: rawItems.slice(0, 10).map((item) => ({
      title: item.title,
      price: item.price?.value,
    })),
    acceptedTitles: cleaned.slice(0, 10).map((item) => ({
      title: item.title,
      price: item.price?.value,
    })),
  };
}

// ===============================
// ROUTES
// ===============================

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

    const cardName = query.split(' ')[0];
    const summary = await fetchEbaySummary(query, cardName);
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

    if (!name) {
      return res.status(400).json({ error: 'Missing card name' });
    }

    const query = buildCardQuery({ name, setName, number });
    const summary = await fetchEbaySummary(query, name);

    return res.json({ cardId, name, setName, number, ...summary });
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

    const token = await getToken();

    const primaryQuery = buildCardQuery({ name, setName, number });
    const fallbackQuery = buildFallbackQuery({ name });

    const [primaryRaw, fallbackRaw] = await Promise.all([
      searchEbay(primaryQuery, token),
      searchEbay(fallbackQuery, token),
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

app.post('/api/sync/set', async (req, res) => {
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

// ===============================
// START
// ===============================

app.listen(PORT, () => {
  console.log(`Stackr backend listening on port ${PORT}`);
});

// ===============================
// START
// ===============================

app.listen(PORT, () => {
  console.log(`Stackr backend listening on port ${PORT}`);
});