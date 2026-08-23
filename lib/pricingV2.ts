import { fetchStackrPrice } from './stackrDomainAdapter';
import { stackrApiClient, type StackrPriceHistoryObservation } from './stackrApiV1';

export const PRICING_ENGINE_V2_ENABLED = process.env.EXPO_PUBLIC_PRICING_ENGINE_V2_ENABLED === 'true'
  || process.env.EXPO_PUBLIC_STACKR_API_ENABLED === 'true';

export type EbayLastSold = {
  price: number;
  shippingPrice: number | null;
  deliveredPrice: number;
  currency: string;
  soldAt: string;
  providerCode: string;
  providerName: string;
  sourceItemId: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  conditionCode: string | null;
  graderCode: string | null;
  gradeLabel: string | null;
  matchConfidence: number | null;
};

export type PricingV2Response = {
  cardId: string;
  identityKey: string;
  currency: 'GBP';
  state: 'market_value' | 'asking_price_indication' | 'stale_verified_value' | 'insufficient_exact_market_evidence';
  marketPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  confidence: {
    score: number;
    label: 'low' | 'medium' | 'high';
    explanation: string;
  };
  evidence: {
    compCount: number;
    soldCompCount: number;
    activeListingCount: number;
    sourceCount: number;
    primarySource: string;
    priceType: string | null;
  };
  sourceBreakdown: {
    source: string;
    estimate: number | null;
    observationsUsed: number;
    sourceType?: string;
  }[];
  lastUpdated: string | null;
  staleAfter: string | null;
  isStale: boolean;
  methodologyVersion: string;
  refreshQueued: boolean;
  featureFlagEnabled: boolean;
  ebayLastSold: EbayLastSold | null;
  accessLimitations?: { source: string; status: string; message?: string }[];
};

type PricingV2Options = {
  language?: string | null;
  variant?: string | null;
  finish?: string | null;
  edition?: string | null;
  condition?: string | null;
  productType?: 'raw_card' | 'graded_card' | 'sealed_product' | string | null;
  gradingCompany?: string | null;
  grade?: string | number | null;
  forceRefresh?: boolean;
};

const responseCache = new Map<string, { expiresAt: number; value: PricingV2Response }>();
const CACHE_TTL_MS = 60 * 1000;

function toEbayLastSold(observation?: StackrPriceHistoryObservation): EbayLastSold | null {
  if (
    !observation
    || observation.observationType !== 'sold_observation'
    || observation.providerCode !== 'ebay_sold_authorised'
    || observation.observedPrice == null
    || !observation.soldAt
  ) return null;
  const shippingPrice = observation.shippingPrice;
  return {
    price: observation.observedPrice,
    shippingPrice,
    deliveredPrice: observation.observedPrice + (shippingPrice ?? 0),
    currency: observation.currency,
    soldAt: observation.soldAt,
    providerCode: observation.providerCode,
    providerName: observation.providerName,
    sourceItemId: observation.sourceItemId,
    sourceTitle: observation.sourceTitle,
    sourceUrl: observation.sourceUrl,
    conditionCode: observation.conditionCode,
    graderCode: observation.graderCode,
    gradeLabel: observation.gradeLabel,
    matchConfidence: observation.parsedMatchConfidence,
  };
}

function buildCacheKey(cardId: string, options: PricingV2Options) {
  return JSON.stringify({ cardId, ...options, forceRefresh: false });
}

export async function fetchStackrPricingV2(cardId: string, options: PricingV2Options = {}) {
  if (!cardId) throw new Error('Missing card id');
  const cacheKey = buildCacheKey(cardId, options);
  const cached = responseCache.get(cacheKey);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;

  const result = await fetchStackrPrice(cardId, {
    language: options.language,
    productType: options.productType === 'graded_card' || options.productType === 'sealed_product'
      ? options.productType
      : 'raw_card',
    currency: 'GBP',
    condition: options.condition,
    grader: options.gradingCompany,
    grade: options.grade,
  });
  if (!result) throw new Error('Stackr API could not resolve an exact canonical variant for pricing.');
  const lastSoldResponse = await stackrApiClient.cardPriceHistory(result.resolved.variantId, {
    productType: options.productType === 'graded_card' || options.productType === 'sealed_product'
      ? options.productType
      : 'raw_card',
    currency: 'GBP',
    condition: options.condition ?? undefined,
    grader: options.gradingCompany ?? undefined,
    observationType: 'sold_observation',
    providerCode: 'ebay_sold_authorised',
    limit: 1,
  }).catch(() => null);
  const ebayLastSold = toEbayLastSold(lastSoldResponse?.data.observations[0]);
  const price = result.price;
  const state: PricingV2Response['state'] = price.status === 'unavailable'
    ? 'insufficient_exact_market_evidence'
    : price.status === 'asking_price_indication'
      ? 'asking_price_indication'
      : price.freshness === 'stale' || price.freshness === 'expired'
        ? 'stale_verified_value'
        : 'market_value';
  const value: PricingV2Response = {
    cardId: result.resolved.card.cardId,
    identityKey: price.identityKey ?? result.resolved.variantId,
    currency: 'GBP',
    state,
    marketPrice: price.estimates.central,
    lowPrice: price.estimates.low,
    highPrice: price.estimates.high,
    confidence: {
      score: price.confidence.score,
      label: price.confidence.label === 'insufficient_evidence' ? 'low' : price.confidence.label,
      explanation: price.unavailableReason ?? `${price.sample.total} exact-identity market observations.`,
    },
    evidence: {
      compCount: price.sample.total,
      soldCompCount: price.sample.sold,
      activeListingCount: price.sample.active,
      sourceCount: price.sample.sources,
      primarySource: 'stackr-api-v1',
      priceType: price.priceType,
    },
    sourceBreakdown: price.sourceBreakdown.map((source) => ({
      source: String(source.providerCode ?? source.source ?? 'unknown'),
      estimate: typeof source.estimate === 'number' ? source.estimate : null,
      observationsUsed: Number(source.observationsUsed ?? source.count ?? 0),
      sourceType: typeof source.sourceType === 'string' ? source.sourceType : undefined,
    })),
    lastUpdated: price.calculatedAt,
    staleAfter: price.staleAfter,
    isStale: price.freshness === 'stale' || price.freshness === 'expired',
    methodologyVersion: price.estimateVersion,
    refreshQueued: false,
    featureFlagEnabled: PRICING_ENGINE_V2_ENABLED,
    ebayLastSold,
  };
  responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
