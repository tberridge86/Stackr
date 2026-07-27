import { PRICE_API_URL } from './config';

export const PRICING_ENGINE_V2_ENABLED = process.env.EXPO_PUBLIC_PRICING_ENGINE_V2_ENABLED === 'true';

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

function buildCacheKey(cardId: string, options: PricingV2Options) {
  return JSON.stringify({ cardId, ...options, forceRefresh: false });
}

export async function fetchStackrPricingV2(cardId: string, options: PricingV2Options = {}) {
  if (!cardId) throw new Error('Missing card id');
  const cacheKey = buildCacheKey(cardId, options);
  const cached = responseCache.get(cacheKey);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value != null && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  const response = await fetch(`${PRICE_API_URL}/api/pricing/${encodeURIComponent(cardId)}${query ? `?${query}` : ''}`);
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.detail ?? json?.error ?? `Pricing V2 failed (${response.status})`);
  }
  responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: json });
  return json as PricingV2Response;
}
