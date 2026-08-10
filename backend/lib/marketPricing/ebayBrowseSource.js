import {
  PriceSourceUnavailableError,
  unavailablePriceSourceResult,
  validateObservationSeparation,
  validatePriceSourceAdapter,
} from './priceSourceAdapter.js';

let cachedToken = null;
let tokenExpiresAt = 0;

function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function requestEbayApplicationToken(config) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;

  if (!config.clientId || !config.clientSecret) {
    throw new PriceSourceUnavailableError(
      'missing_ebay_oauth_credentials',
      'Missing eBay OAuth client credentials for the Browse API.',
    );
  }

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const response = await config.fetchImpl(`${config.oauthBaseUrl}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: config.oauthScopes,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new PriceSourceUnavailableError(
      'ebay_oauth_failed',
      `eBay OAuth token request failed with status ${response.status}.`,
      { responsePreview: text.slice(0, 160) },
    );
  }

  const payload = await response.json();
  cachedToken = payload.access_token;
  tokenExpiresAt = now + Number(payload.expires_in ?? 3600) * 1000;
  return cachedToken;
}

function normaliseBrowseItem(item, context = {}) {
  const price = item?.price ?? item?.currentBidPrice ?? {};
  const shipping = Array.isArray(item?.shippingOptions)
    ? item.shippingOptions[0]?.shippingCost
    : null;
  const buyingOptions = Array.isArray(item?.buyingOptions) ? item.buyingOptions : [];

  return {
    sourceId: 'ebay_browse_active',
    sourceType: 'active_listing',
    sourceItemId: clean(item?.itemId ?? item?.legacyItemId),
    sourceUrl: clean(item?.itemWebUrl),
    rawTitle: clean(item?.title) ?? '',
    observedPrice: numberOrNull(price?.value),
    shippingPrice: numberOrNull(shipping?.value),
    currency: clean(price?.currency) ?? clean(shipping?.currency) ?? 'GBP',
    saleOrListingType: buyingOptions.includes('AUCTION') ? 'auction_active' : 'fixed_price',
    condition: clean(item?.condition),
    observedAt: new Date().toISOString(),
    soldAt: null,
    query: context.query ?? null,
    http: context.http ?? {},
    rawPayload: item,
  };
}

export function createEbayBrowsePriceSource(options = {}) {
  const config = {
    enabled: options.enabled ?? ['1', 'true', 'yes', 'on'].includes(String(process.env.PRICING_V2_EBAY_ACTIVE_ENABLED ?? 'true').toLowerCase()),
    clientId: options.clientId ?? process.env.EBAY_CLIENT_ID,
    clientSecret: options.clientSecret ?? process.env.EBAY_CLIENT_SECRET,
    marketplaceId: options.marketplaceId ?? process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_GB',
    oauthScopes: options.oauthScopes ?? process.env.EBAY_OAUTH_SCOPES ?? 'https://api.ebay.com/oauth/api_scope',
    oauthBaseUrl: options.oauthBaseUrl ?? 'https://api.ebay.com',
    browseBaseUrl: options.browseBaseUrl ?? 'https://api.ebay.com',
    fetchImpl: options.fetchImpl ?? fetch,
  };

  const adapter = {
    identifySource() {
      return {
        code: 'ebay_browse_active',
        displayName: 'eBay Browse API active listings',
        officialApiRequired: true,
        oauthRequired: true,
        supportsActiveListings: true,
        supportsSoldObservations: false,
        automatedRefreshAllowed: true,
        credentialEnvNames: ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_MARKETPLACE_ID', 'EBAY_OAUTH_SCOPES'],
      };
    },

    async healthCheck() {
      if (!config.enabled) return { status: 'disabled', message: 'eBay Browse active-listing adapter is disabled.' };
      if (!config.clientId || !config.clientSecret) {
        return { status: 'unavailable', message: 'Missing eBay OAuth client credentials.' };
      }
      return { status: 'ok', message: 'eBay Browse active-listing access is configured.' };
    },

    async fetchActiveListings(request = {}) {
      const health = await this.healthCheck();
      if (health.status !== 'ok') {
        return unavailablePriceSourceResult('active_listing_source_unavailable', health.message);
      }

      const query = clean(request.query);
      if (!query) {
        return unavailablePriceSourceResult('missing_query', 'An active-listing query is required.');
      }

      const token = await requestEbayApplicationToken(config);
      const url = new URL('/buy/browse/v1/item_summary/search', config.browseBaseUrl);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(Math.min(Number(request.limit ?? 50), 200)));

      const response = await config.fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': config.marketplaceId,
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return unavailablePriceSourceResult('ebay_browse_failed', `eBay Browse search failed with status ${response.status}.`, {
          status: response.status,
        });
      }

      const items = Array.isArray(payload?.itemSummaries) ? payload.itemSummaries : [];
      return {
        ok: true,
        observations: items.map((item) => this.normaliseObservation(item, { query, httpStatus: response.status })),
      };
    },

    async fetchSoldObservations() {
      return unavailablePriceSourceResult(
        'sold_data_not_available_from_browse_api',
        'The eBay Browse API active-listing source cannot provide sold observations.',
      );
    },

    normaliseObservation(item, context = {}) {
      return normaliseBrowseItem(item, {
        query: context.query,
        http: { status: context.httpStatus ?? null },
      });
    },

    validateObservation(observation) {
      const separation = validateObservationSeparation(observation);
      if (!separation.ok) return separation;
      if (observation.sourceType !== 'active_listing') {
        return { ok: false, reason: 'unsupported_observation_type', message: 'eBay Browse only yields active listings.' };
      }
      if (!observation.sourceItemId || observation.observedPrice == null) {
        return { ok: false, reason: 'missing_required_listing_fields', message: 'Listing is missing source item ID or price.' };
      }
      return { ok: true, reason: null, message: 'Listing observation is valid.' };
    },
  };

  return validatePriceSourceAdapter(adapter);
}
