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
const PORT = process.env.PORT || 3001;
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function titleLooksBad(title = '') {
  const t = title.toLowerCase();

  const blockedTerms = [
    'psa',
    'bgs',
    'cgc',
    'sgc',
    'ace grading',
    'graded',
    'grade 9',
    'grade 10',
    'gem mint',
    'slab',
    'proxy',
    'replica',
    'reprint',
    'custom',
    'custom card',
    'fan art',
    'fanart',
    'bundle',
    'bulk',
    'job lot',
    'joblot',
    'lot of',
    'x cards',
    'booster pack',
    'booster box',
    'empty box',
    'display box',
    'choose your card',
    'choose your cards',
    'choose card',
    'choose individual card',
    'choose a card',
    'pick your card',
    'you choose',
    'choose',
    'singles common uncommon',
    'common uncommon',
    'random',
    'guaranteed holo',
    'sticker',
    'stickers',
    'artbox',
    'gold foil',
    'black metal',
    'metal card',
    'oversized',
    'digital',
    'code card',
    'gift',
    'gold',
    'foil etched',
    'novelty',
    'keychain',
    'fridge magnet',
    'magnet',
    'solid metal',
    'metal',
    'resin',
    'coaster',
    'plastic card',
    'read description',
    'heavily played',
    'poor condition',
    'damaged',
    'creased',
    'crease',
    'bent',
    'inked',
    'marked',
    'written on',
    'torn',
    'water damaged',
  ];

  return blockedTerms.some((term) => t.includes(term));
}

function extractCardNumber(query = '') {
  const match = query.match(/\b\d+\/\d+\b/);
  return match ? match[0].toLowerCase() : null;
}

function getMainCardName(query = '') {
  const stopWords = new Set([
    'pokemon',
    'pokémon',
    'card',
    'base',
    'set',
    'perfect',
    'order',
    'holo',
    'foil',
  ]);

  return query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ''))
    .filter((word) => word.length >= 3 && !stopWords.has(word));
}

function titleLooksGoodForQuery(title = '', query = '') {
  const t = title.toLowerCase();
  const q = query.toLowerCase();

  const cardNumber = extractCardNumber(q);
  const importantWords = getMainCardName(q);

  if (!t.includes('pokemon') && !t.includes('pokémon')) return false;
  if (!t.includes('card')) return false;

  if (importantWords.length > 0) {
    const hasCardName = importantWords.some((word) => t.includes(word));
    if (!hasCardName) return false;
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
    return {
      low: null,
      average: null,
      high: null,
      count: 0,
    };
  }

  const sorted = [...prices].sort((a, b) => a - b);

  return {
    low: Number(sorted[0].toFixed(2)),
    average: Number(
      (sorted.reduce((sum, price) => sum + price, 0) / sorted.length).toFixed(2)
    ),
    high: Number(sorted[sorted.length - 1].toFixed(2)),
    count: sorted.length,
  };
}

function buildCardQuery({ name = '', setName = '', number = '' }) {
  return [name, setName, number, 'pokemon card']
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
}

async function getToken() {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    throw new Error('Missing eBay credentials');
  }

  const basic = Buffer.from(
    `${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`
  ).toString('base64');

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

  return data.access_token;
}

async function fetchEbaySummary(query) {
  const token = await getToken();

  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(
    query
  )}&limit=50&sort=price`;

  const ebayRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID,
    },
  });

  if (!ebayRes.ok) {
    const text = await ebayRes.text();
    throw new Error(`Browse search failed (${ebayRes.status}): ${text}`);
  }

  const data = await ebayRes.json();
  const items = data.itemSummaries || [];

  const cleaned = items.filter((item) => {
    const title = item.title || '';
    const price = numberFromPrice(item.price?.value);

    if (!price) return false;
    if (titleLooksBad(title)) return false;
    if (!titleLooksGoodForQuery(title, query)) return false;
    if (price < 1) return false;
    if (price > 5000) return false;

    return true;
  });

  const prices = cleaned
    .map((item) => numberFromPrice(item.price?.value))
    .filter((price) => price !== null);

  const sortedPrices = [...prices].sort((a, b) => a - b);

  const trimmedPrices =
    sortedPrices.length >= 5 ? sortedPrices.slice(1, -1) : sortedPrices;

  const summary = summarisePrices(trimmedPrices);

  return {
    marketplace: EBAY_MARKETPLACE_ID,
    query,
    low: summary.low,
    average: summary.average,
    high: summary.high,
    count: summary.count,
    rawCount: items.length,
    sampleTitles: items.slice(0, 10).map((item) => ({
      title: item.title,
      price: item.price?.value,
    })),
    acceptedTitles: cleaned.slice(0, 10).map((item) => ({
      title: item.title,
      price: item.price?.value,
    })),
  };
}

async function scanWithXimilar(imageUrl) {
  if (!XIMILAR_API_TOKEN) {
    throw new Error('Missing XIMILAR_API_TOKEN');
  }

  const ximilarRes = await fetch(
    'https://api.ximilar.com/collectibles/v2/tcg_id',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${XIMILAR_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [
          {
            _url: imageUrl,
          },
        ],
      }),
    }
  );

  const data = await ximilarRes.json();

  if (!ximilarRes.ok) {
    return {
      ok: false,
      status: ximilarRes.status,
      data,
    };
  }

  return {
    ok: true,
    status: ximilarRes.status,
    data,
  };
}

app.get('/', (req, res) => {
  res.send('Stackr API is running');
});

app.get('/debug-env', (req, res) => {
  res.json({
    ok: true,
    hasEbayClientId: Boolean(EBAY_CLIENT_ID),
    hasEbayClientSecret: Boolean(EBAY_CLIENT_SECRET),
    hasXimilarToken: Boolean(XIMILAR_API_TOKEN),
    marketplace: EBAY_MARKETPLACE_ID,
  });
});

app.get('/test-ebay-token', async (req, res) => {
  try {
    const token = await getToken();

    return res.json({
      ok: true,
      tokenPreview: `${token.slice(0, 10)}...`,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: getErrorMessage(error),
    });
  }
});

app.get('/price', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();

    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const summary = await fetchEbaySummary(query);
    return res.json(summary);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch eBay price',
      detail: getErrorMessage(error),
    });
  }
});

app.get('/api/price/ebay', async (req, res) => {
  try {
    const cardId = String(req.query.cardId || '').trim();
    const name = String(req.query.name || '').trim();
    const setName = String(req.query.setName || '').trim();
    const number = String(req.query.number || '').trim();

    const query = buildCardQuery({ name, setName, number });

    if (!query) {
      return res.status(400).json({ error: 'Missing card search details' });
    }

    const summary = await fetchEbaySummary(query);

    return res.json({
      cardId,
      name,
      setName,
      number,
      ...summary,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch eBay pricing',
      detail: getErrorMessage(error),
    });
  }
});

app.post('/scan', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'Missing imageUrl' });
    }

    const result = await scanWithXimilar(imageUrl);

    if (!result.ok) {
      return res.status(result.status).json({
        error: 'Ximilar request failed',
        detail: result.data,
      });
    }

    return res.json(result.data);
  } catch (error) {
    return res.status(500).json({
      error: 'Scan failed',
      detail: getErrorMessage(error),
    });
  }
});

app.post('/api/scan/tcg', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'Missing imageUrl' });
    }

    const result = await scanWithXimilar(imageUrl);

    if (!result.ok) {
      return res.status(result.status).json({
        error: 'Ximilar request failed',
        detail: result.data,
      });
    }

    return res.json(result.data);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to scan card',
      detail: getErrorMessage(error),
    });
  }
});

app.get('/debug-ximilar', async (req, res) => {
  try {
    if (!XIMILAR_API_TOKEN) {
      return res.status(500).json({ ok: false, error: 'Missing token' });
    }

    const testRes = await fetch('https://api.ximilar.com/account/v2/details/', {
      method: 'GET',
      headers: {
        Authorization: `Token ${XIMILAR_API_TOKEN}`,
      },
    });

    const text = await testRes.text();

    return res.status(testRes.status).send(text);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: getErrorMessage(error),
    });
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

  const isSeller = trade.seller_id === user_id;
  const updateField = isSeller ? 'seller_sent' : 'buyer_sent';

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

  const isSeller = trade.seller_id === user_id;
  const updateField = isSeller ? 'seller_received' : 'buyer_received';

  const updated = await supabase
    .from('trades')
    .update({ [updateField]: true })
    .eq('id', trade_id)
    .select()
    .single();

  const t = updated.data;

  // AUTO COMPLETE TRADE
  if (t.buyer_received && t.seller_received) {
    await supabase
      .from('trades')
      .update({ status: 'completed' })
      .eq('id', trade_id);
  }

  res.json(updated.data);
});

app.listen(PORT, () => {
  console.log(`Stackr backend listening on port ${PORT}`);
});