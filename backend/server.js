import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const EBAY_CLIENT_ID = 'TomBerri-pocketva-PRD-a84c0e5fe-afeb98cd';
const EBAY_CLIENT_SECRET = 'REMOVED_BY_INCIDENT_20260729';
const EBAY_MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || 'EBAY_GB';
const PORT = process.env.PORT || 3001;

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
  const num = parseFloat(value);
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
    low: low.toFixed(2),
    average: average.toFixed(2),
    high: high.toFixed(2),
    count: sorted.length,
  };
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
    throw new Error(`Token request failed: ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

app.get('/price', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();

    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const token = await getToken();

    const ebayRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=25&sort=price`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID,
        },
      }
    );

    if (!ebayRes.ok) {
      const text = await ebayRes.text();
      throw new Error(`Browse search failed: ${text}`);
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

    return res.json({
      marketplace: EBAY_MARKETPLACE_ID,
      query,
      low: summary.low,
      average: summary.average,
      high: summary.high,
      count: summary.count,
      rawCount: items.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Failed to fetch eBay price',
      detail: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`eBay backend listening on port ${PORT}`);
});