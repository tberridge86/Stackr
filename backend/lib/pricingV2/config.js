export const PRICING_METHODOLOGY_VERSION = 'pricing-v2.0.0';

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const booleanFromEnv = (name, fallback = false) => {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
};

export const pricingV2Config = {
  enabled: booleanFromEnv('PRICING_ENGINE_V2_ENABLED', false),
  minimumMatchScore: numberFromEnv('PRICING_V2_MIN_MATCH_SCORE', 0.85),
  disagreementReviewThreshold: numberFromEnv('PRICING_V2_DISAGREEMENT_THRESHOLD', 0.30),
  staleAfterHours: numberFromEnv('PRICING_V2_STALE_AFTER_HOURS', 72),
  staleFallbackDays: numberFromEnv('PRICING_V2_STALE_FALLBACK_DAYS', 180),
  maxObservationsPerSource: numberFromEnv('PRICING_V2_MAX_OBSERVATIONS_PER_SOURCE', 30),
  currencyRates: {
    GBP: 1,
    USD: numberFromEnv('USD_TO_GBP', 0.79),
    EUR: numberFromEnv('EUR_TO_GBP', 0.86),
    JPY: numberFromEnv('JPY_TO_GBP', 0.0051),
    CAD: numberFromEnv('CAD_TO_GBP', 0.58),
    AUD: numberFromEnv('AUD_TO_GBP', 0.52),
  },
  sources: {
    ebay_sold: {
      id: 'ebay_sold',
      displayName: 'eBay sold transactions',
      enabled: booleanFromEnv('PRICING_V2_EBAY_SOLD_ENABLED', false),
      reliabilityWeight: numberFromEnv('PRICING_V2_EBAY_SOLD_WEIGHT', 1.0),
      refreshIntervalHours: numberFromEnv('PRICING_V2_EBAY_SOLD_REFRESH_HOURS', 12),
      authorisedEndpoint: process.env.EBAY_SOLD_API_URL || '',
      authorisedToken: process.env.EBAY_SOLD_API_KEY || '',
    },
    ebay_active: {
      id: 'ebay_active',
      displayName: 'eBay active listings',
      enabled: booleanFromEnv('PRICING_V2_EBAY_ACTIVE_ENABLED', true),
      reliabilityWeight: numberFromEnv('PRICING_V2_EBAY_ACTIVE_WEIGHT', 0.35),
      refreshIntervalHours: numberFromEnv('PRICING_V2_EBAY_ACTIVE_REFRESH_HOURS', 6),
      marketplaceId: process.env.EBAY_MARKETPLACE_ID || 'EBAY_GB',
      browseLimit: numberFromEnv('PRICING_V2_EBAY_ACTIVE_LIMIT', 40),
      timeoutMs: numberFromEnv('PRICING_V2_EBAY_ACTIVE_TIMEOUT_MS', 6000),
    },
    existing_stackr_source: {
      id: 'existing_stackr_source',
      displayName: 'Existing Stackr cached prices',
      enabled: booleanFromEnv('PRICING_V2_EXISTING_STACKR_ENABLED', true),
      reliabilityWeight: numberFromEnv('PRICING_V2_EXISTING_STACKR_WEIGHT', 0.55),
      refreshIntervalHours: numberFromEnv('PRICING_V2_EXISTING_STACKR_REFRESH_HOURS', 12),
    },
    manual_verified_comp: {
      id: 'manual_verified_comp',
      displayName: 'Manual verified comp',
      enabled: booleanFromEnv('PRICING_V2_MANUAL_COMP_ENABLED', true),
      reliabilityWeight: numberFromEnv('PRICING_V2_MANUAL_COMP_WEIGHT', 0.95),
      refreshIntervalHours: numberFromEnv('PRICING_V2_MANUAL_COMP_REFRESH_HOURS', 24),
    },
  },
};

export function getSourceConfig(sourceId) {
  return pricingV2Config.sources[sourceId] ?? {
    id: sourceId,
    displayName: sourceId,
    enabled: false,
    reliabilityWeight: 0.3,
    refreshIntervalHours: 24,
  };
}

export function getEnabledSourceConfigs() {
  return Object.values(pricingV2Config.sources).filter((source) => source.enabled);
}
