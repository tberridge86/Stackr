import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dns from 'dns';
import https from 'https';

dns.setServers(['1.1.1.1', '8.8.8.8']);
dns.setDefaultResultOrder('ipv4first');

const app = express();

app.use(cors());
app.use(express.json());

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || 'EBAY_GB';
const PORT = process.env.PORT || 3001;

const ebayAgent = new https.Agent({
  lookup: (hostname, options, callback) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (err) {
        callback(err);
        return;
      }

      if (!addresses || addresses.length === 0) {
        callback(new Error(`No IPv4 addresses found for ${hostname}`));
        return;
      }

      if (options?.all) {
        callback(
          null,
          addresses.map((address) => ({
            address,
            family: 4,
          }))
        );
        return;
      }

      callback(null, addresses[0], 4);
    });
  },
});

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
    'custom card',
    'fan art',
    'fanart',
    'bundle',
    'job lot',
    'joblot',
    'lot of',
    'x cards',
    'booster pack',
    'booster box',
    'empty box',
    'display box',
  ];

  return blockedTerms.some((term) => t.includes(term));
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
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  const average = sorted.reduce((sum, p) => sum + p, 0) / sorted.length;

  return {
    low: Number(low.toFixed(2)),
    average: Number(average.toFixed(2)),
    high: Number(high.toFixed(2)),
    count: sorted.length,
  };
}

function buildCardQuery({ name = '', setName = '', number = '' }) {
  return [name, setName, number, 'pokemon card']
    .map((v) => String(v || '').trim())
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
    agent: ebayAgent,
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
  )}&limit=25&sort=price`;

  const ebayRes = await fetch(url, {
    agent: ebayAgent,
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
    if (price < 0.5) return false;
    if (price > 10000) return false;

    return true;
  });

  const prices = cleaned
    .map((item) => numberFromPrice(item.price?.value))
    .filter((p) => p !== null);

  const summary = summarisePrices(prices);

  return {
    marketplace: EBAY_MARKETPLACE_ID,
    query,
    low: summary.low,
    average: summary.average,
    high: summary.high,
    count: summary.count,
    rawCount: items.length,
  };
}

app.get('/', (req, res) => {
  res.send('PocketVault API is running');
});

app.get('/debug-env', (req, res) => {
  res.json({
    ok: true,
    hasEbayClientId: Boolean(EBAY_CLIENT_ID),
    hasEbayClientSecret: Boolean(EBAY_CLIENT_SECRET),
    marketplace: EBAY_MARKETPLACE_ID,
  });
});

app.get('/debug-dns', async (req, res) => {
  try {
    const ebayLookup = await dns.promises.resolve4('api.ebay.com');
    const googleLookup = await dns.promises.resolve4('google.com');

    return res.json({
      ok: true,
      ebayLookup,
      googleLookup,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: getErrorMessage(error),
    });
  }
});

app.get('/test-ebay-token', async (req, res) => {
  try {
    const token = await getToken();

    return res.json({
      ok: true,
      tokenPreview: `${token.slice(0, 10)}...`,
    });
  } catch (error) {
    console.error('Token test failed:', error);

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
    console.error('Legacy /price route error:', error);

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

    console.log('eBay API request:', {
      cardId,
      name,
      setName,
      number,
      query,
    });

    const summary = await fetchEbaySummary(query);

    return res.json({
      cardId,
      name,
      setName,
      number,
      ...summary,
    });
  } catch (error) {
    console.error('/api/price/ebay route error:', error);

    return res.status(500).json({
      error: 'Failed to fetch eBay pricing',
      detail: getErrorMessage(error),
    });
  }
});

app.listen(PORT, () => {
  console.log(`eBay backend listening on port ${PORT}`);
});