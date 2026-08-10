import { pricingV2Config } from '../config.js';
import { generatePricingQueries } from '../queryGenerator.js';

let cachedToken = null;
let tokenExpiresAt = 0;
let cooldownUntil = 0;

async function getEbayToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing eBay Browse credentials');

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const scopes = process.env.EBAY_OAUTH_SCOPES || 'https://api.ebay.com/oauth/api_scope';
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: scopes,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`eBay token request failed (${response.status}): ${text.slice(0, 180)}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + Number(data.expires_in ?? 3600) * 1000;
  return cachedToken;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBrowseItem(item, query) {
  const price = item?.price?.value ?? item?.currentBidPrice?.value ?? item?.itemWebUrlPrice ?? null;
  const currency = item?.price?.currency ?? item?.currentBidPrice?.currency ?? 'GBP';
  const shipping = Array.isArray(item?.shippingOptions)
    ? item.shippingOptions[0]?.shippingCost?.value ?? 0
    : 0;

  return {
    sourceId: 'ebay_active',
    sourceType: 'active_listing',
    externalReference: item?.itemId ?? item?.legacyItemId ?? null,
    title: item?.title ?? '',
    itemPrice: price,
    shippingPrice: shipping,
    currency,
    listedAt: item?.itemCreationDate ?? null,
    soldAt: null,
    condition: item?.condition ?? null,
    metadata: {
      query,
      buyingOptions: item?.buyingOptions ?? [],
      itemWebUrl: item?.itemWebUrl ?? null,
      sellerFeedbackPercentage: item?.seller?.feedbackPercentage ?? null,
      sellerFeedbackScore: item?.seller?.feedbackScore ?? null,
      imageUrl: item?.image?.imageUrl ?? null,
    },
    rawPayload: item,
  };
}

export function createEbayActiveAdapter(config = pricingV2Config.sources.ebay_active) {
  const hasCredentials = Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);

  return {
    id: 'ebay_active',
    displayName: 'eBay active listings',
    capabilities: {
      soldTransactions: false,
      activeListings: hasCredentials && config.enabled,
      marketEstimate: false,
      rawCards: true,
      gradedCards: true,
      sealedProducts: true,
      supportedLanguages: ['en', 'ja', 'zh-CN', 'zh-TW', 'ko'],
      supportedCurrencies: ['GBP', 'USD', 'EUR', 'JPY', 'CAD', 'AUD'],
    },
    async healthCheck() {
      if (!config.enabled) return { status: 'disabled', message: 'eBay active adapter disabled.' };
      if (!hasCredentials) return { status: 'unavailable', message: 'Missing eBay Browse credentials.' };
      return { status: 'ok', message: 'eBay Browse active listing access configured.' };
    },
    async searchPrices(identity, context = {}) {
      if (!config.enabled || !hasCredentials) return [];
      if (Date.now() < cooldownUntil) return [];

      const token = await getEbayToken();
      const queries = context.queries?.length ? context.queries : generatePricingQueries(identity);
      const observations = [];

      for (const query of queries.slice(0, context.maxQueries ?? 3)) {
        const url =
          'https://api.ebay.com/buy/browse/v1/item_summary/search'
          + `?q=${encodeURIComponent(query)}`
          + `&limit=${Math.min(config.browseLimit ?? 40, context.limit ?? 40)}`
          + '&sort=price';

        const response = await fetchWithTimeout(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': config.marketplaceId || 'EBAY_GB',
          },
        }, config.timeoutMs ?? 6000);

        if (response.status === 429) {
          cooldownUntil = Date.now() + 60_000;
          break;
        }
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`eBay Browse search failed (${response.status}): ${text.slice(0, 180)}`);
        }

        const json = await response.json();
        const items = Array.isArray(json?.itemSummaries) ? json.itemSummaries : [];
        observations.push(
          ...items
            .filter((item) => {
              const options = Array.isArray(item?.buyingOptions) ? item.buyingOptions : [];
              return options.includes('FIXED_PRICE') || options.includes('AUCTION');
            })
            .map((item) => normalizeBrowseItem(item, query))
        );
      }

      return observations;
    },
  };
}
