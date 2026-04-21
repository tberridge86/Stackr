import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || 'EBAY_GB';
const PORT = process.env.PORT || 3001;

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
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID,
        },
      }
    );

    const data = await ebayRes.json();

    const prices =
      data.itemSummaries
        ?.map((item) => parseFloat(item.price?.value))
        .filter((p) => !Number.isNaN(p)) || [];

    if (prices.length === 0) {
      return res.json({
        average: null,
        count: 0,
        marketplace: EBAY_MARKETPLACE_ID,
      });
    }

    const average =
      prices.reduce((sum, price) => sum + price, 0) / prices.length;

    return res.json({
      average: average.toFixed(2),
      count: prices.length,
      marketplace: EBAY_MARKETPLACE_ID,
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
