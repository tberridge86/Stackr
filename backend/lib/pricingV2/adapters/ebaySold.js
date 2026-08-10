import { pricingV2Config } from '../config.js';
import { generatePricingQueries } from '../queryGenerator.js';

function normalizeSoldPayloadItem(item, query) {
  const price = item.itemPrice ?? item.price ?? item.soldPrice ?? item.totalPrice;
  const currency = item.currency ?? item.priceCurrency ?? item.originalCurrency ?? 'GBP';
  const soldAt = item.soldAt ?? item.sold_at ?? item.transactionDate ?? item.endTime ?? null;
  const externalReference = item.transactionId ?? item.listingId ?? item.itemId ?? item.id ?? null;

  return {
    sourceId: 'ebay_sold',
    sourceType: 'sold_transaction',
    externalReference,
    title: item.title ?? item.name ?? '',
    itemPrice: price,
    shippingPrice: item.shippingPrice ?? item.shipping ?? 0,
    currency,
    soldAt,
    listedAt: null,
    language: item.language ?? null,
    gradingCompany: item.gradingCompany ?? item.grader ?? null,
    grade: item.grade ?? null,
    condition: item.condition ?? null,
    metadata: {
      query,
      saleType: item.saleType ?? item.buyingOption ?? null,
      bestOffer: Boolean(item.bestOffer ?? item.best_offer),
      listingUrlPermitted: Boolean(item.listingUrl || item.url),
      listingUrl: item.listingUrl ?? item.url ?? null,
    },
    rawPayload: item,
  };
}

export function createEbaySoldAdapter(config = pricingV2Config.sources.ebay_sold) {
  const hasAuthorisedAccess = Boolean(config.enabled && config.authorisedEndpoint && config.authorisedToken);

  return {
    id: 'ebay_sold',
    displayName: 'eBay sold transactions',
    capabilities: {
      soldTransactions: hasAuthorisedAccess,
      activeListings: false,
      marketEstimate: false,
      rawCards: true,
      gradedCards: true,
      sealedProducts: true,
      supportedLanguages: ['en', 'ja', 'zh-CN', 'zh-TW', 'ko'],
      supportedCurrencies: ['GBP', 'USD', 'EUR', 'JPY', 'CAD', 'AUD'],
    },
    async healthCheck() {
      if (!config.enabled) {
        return {
          status: 'disabled',
          message: 'eBay sold adapter is disabled by PRICING_V2_EBAY_SOLD_ENABLED.',
        };
      }
      if (!hasAuthorisedAccess) {
        return {
          status: 'unavailable',
          message: 'No authorised eBay completed/sold transaction provider is configured.',
        };
      }
      return { status: 'ok', message: 'Authorised eBay sold provider configured.' };
    },
    async searchPrices(identity, context = {}) {
      if (!hasAuthorisedAccess) return [];
      const queries = context.queries?.length ? context.queries : generatePricingQueries(identity);
      const observations = [];

      for (const query of queries.slice(0, context.maxQueries ?? 4)) {
        const url = new URL(config.authorisedEndpoint);
        url.searchParams.set('q', query);
        url.searchParams.set('language', identity.language);
        url.searchParams.set('productType', identity.productType);
        url.searchParams.set('limit', String(context.limit ?? 50));

        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.authorisedToken}`,
          },
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Authorised eBay sold provider failed (${response.status}): ${text.slice(0, 180)}`);
        }
        const json = await response.json();
        const items = Array.isArray(json?.transactions)
          ? json.transactions
          : Array.isArray(json?.items)
            ? json.items
            : Array.isArray(json?.results)
              ? json.results
              : [];
        observations.push(...items.map((item) => normalizeSoldPayloadItem(item, query)));
      }

      return observations;
    },
  };
}
