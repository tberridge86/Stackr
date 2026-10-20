import {
  PriceSourceUnavailableError,
  unavailablePriceSourceResult,
  validateObservationSeparation,
  validatePriceSourceAdapter,
} from './priceSourceAdapter.js';

// Credentials and token scopes belong to one adapter instance. Never reuse an
// application token from another environment or credential configuration.
const applicationTokens = new WeakMap();

function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function requestEbayApplicationToken(config) {
  const cached = applicationTokens.get(config);
  if (cached?.token && Date.now() < cached.expiresAt - 60_000) return cached.token;
  if (cached?.pending) return cached.pending;
  const pending = mintEbayApplicationToken(config).then(({ token, expiresAt }) => {
    applicationTokens.set(config, { token, expiresAt });
    return token;
  });
  applicationTokens.set(config, { pending });
  try { return await pending; }
  catch (error) { if (applicationTokens.get(config)?.pending === pending) applicationTokens.delete(config); throw error; }
}

async function boundedEbayFetch(config, url, options) {
  try {
    return await config.fetchImpl(url, { ...options, signal: AbortSignal.timeout(config.requestTimeoutMs) });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new PriceSourceUnavailableError('ebay_request_timeout', 'eBay request exceeded its deadline.');
    }
    throw error;
  }
}

async function mintEbayApplicationToken(config) {

  if (!config.clientId || !config.clientSecret) {
    throw new PriceSourceUnavailableError(
      'missing_ebay_oauth_credentials',
      'Missing eBay OAuth client credentials for the Browse API.',
    );
  }

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const response = await boundedEbayFetch(config, `${config.oauthBaseUrl}/identity/v1/oauth2/token`, {
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
    throw new PriceSourceUnavailableError(
      'ebay_oauth_failed',
      `eBay OAuth token request failed with status ${response.status}.`,
      { httpStatus: response.status },
    );
  }

  const payload = await response.json();
  const token = clean(payload.access_token);
  const expiresIn = Number(payload.expires_in);
  if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new PriceSourceUnavailableError('invalid_ebay_oauth_response', 'eBay did not return a valid application token.');
  }
  return { token, expiresAt: Date.now() + expiresIn * 1000 };
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
    requestTimeoutMs: Math.min(30_000, Math.max(1, Number(options.requestTimeoutMs) || 8_000)),
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

    async healthCheck({ verifyAccess = false } = {}) {
      if (!config.enabled) return { status: 'disabled', message: 'eBay Browse active-listing adapter is disabled.' };
      if (!config.clientId || !config.clientSecret) {
        return { status: 'unavailable', message: 'Missing eBay OAuth client credentials.' };
      }
      if (!verifyAccess) return { status: 'ok', accessVerified: false, message: 'eBay Browse credentials are configured; live access has not been verified.' };
      try {
        const result = await this.fetchActiveListings({ query: 'Pokemon', limit: 1 });
        return result.ok
          ? { status: 'ok', accessVerified: true, checkedAt: new Date().toISOString(), message: 'eBay OAuth and Browse read access verified.' }
          : { status: 'unavailable', accessVerified: false, reason: result.reason, message: result.message };
      } catch (error) {
        return { status: 'unavailable', accessVerified: false, reason: error?.code ?? 'ebay_access_probe_failed', message: 'eBay live access probe failed.' };
      }
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
      const requestedLimit = Number(request.limit ?? 50);
      url.searchParams.set('limit', String(Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 200)) : 50));

      const response = await boundedEbayFetch(config, url, {
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

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || (payload.itemSummaries != null && !Array.isArray(payload.itemSummaries)) || payload.errors?.length) {
        return unavailablePriceSourceResult('invalid_ebay_browse_response', 'eBay did not return a valid Browse response.');
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
