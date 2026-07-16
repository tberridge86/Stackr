export type MintyProviderName =
  | 'stackr'
  | 'pokemon_tcg_api'
  | 'tcgdex'
  | 'ebay_browse'
  | 'approved_sold_data'
  | 'currency_provider'
  | 'openai_responses'
  | 'deterministic_fallback';

export type MintyProviderResult<T> = {
  provider: MintyProviderName | string;
  fetchedAt: string;
  data: T;
  warnings?: string[];
};

export type CardProviderMapping = {
  stackrCardId: string;
  provider: string;
  providerCardId: string;
  language: string;
  confidence: number;
};

export type NormalisedCatalogueCard = {
  stackrCardId: string;
  canonicalCardId?: string | null;
  providerMappings: CardProviderMapping[];
  language: string;
  name: string;
  englishName?: string | null;
  japaneseName?: string | null;
  romanisedName?: string | null;
  setId?: string | null;
  setName?: string | null;
  japaneseSetName?: string | null;
  setCode?: string | null;
  cardNumber?: string | null;
  rarity?: string | null;
  variant?: string | null;
  imageUrl?: string | null;
  imageThumbnailUrl?: string | null;
  releaseDate?: string | null;
  searchTokens: string[];
  updatedAt: string;
};

export type NormalisedPriceObservation = {
  id: string;
  stackrCardId: string;
  language: string;
  condition?: string | null;
  grader?: string | null;
  grade?: string | null;
  gradeLabel?: string | null;
  source: string;
  sourceType: 'active_listing' | 'sold_listing' | 'market_price';
  originalPrice: number;
  originalCurrency: string;
  convertedPriceGbp: number;
  observedAt: string;
  soldAt?: string | null;
  listingUrl?: string | null;
  shippingIncluded: boolean;
  verifiedSale: boolean;
  matchConfidence: number;
  rawPayload?: Record<string, unknown>;
};

export type NormalisedMarketplaceSignal = {
  stackrCardId: string;
  activeListingCount: number;
  completedSaleCount: number;
  medianCompletedSaleGbp: number | null;
  medianActiveListingGbp: number | null;
  timeToSellDays: number | null;
  favouriteCount: number;
  offerCount: number;
  listingViews: number;
  listingAgeDays: number | null;
  priceReductionCount: number;
  chaseCount: number;
  collectionAdds30d: number;
  sellThroughRate: number | null;
  observedAt: string;
};

export type CurrencyQuote = {
  from: string;
  to: string;
  rate: number;
  quotedAt: string;
  source: string;
};

export type MintyNarrativePayload = {
  card: {
    name: string;
    set?: string | null;
    language?: string | null;
    variant?: string | null;
  };
  recommendation: string;
  recommendationScore: number;
  confidenceScore: number;
  confidenceLabel: string;
  summarySignals: Array<{
    type: 'positive' | 'negative' | 'neutral';
    label: string;
    evidence: string;
  }>;
  pricing: {
    medianSoldGbp?: number | null;
    medianActiveListingGbp?: number | null;
    change30dPercent?: number | null;
    sales30d?: number | null;
  };
  dataLimitations: string[];
};

export type MintyNarrativeOutput = {
  headline: string;
  recommendationSummary: string;
  opportunities: string[];
  risks: string[];
  whyMintyPickedThis: string[];
  outlook: string;
  limitationText?: string;
};

export interface CardCatalogueProvider {
  readonly name: MintyProviderName | string;
  searchCards(query: string, options?: { language?: string; limit?: number }): Promise<MintyProviderResult<NormalisedCatalogueCard[]>>;
  getCard(stackrCardId: string): Promise<MintyProviderResult<NormalisedCatalogueCard | null>>;
}

export interface RawPriceProvider {
  readonly name: MintyProviderName | string;
  getRawPrices(input: {
    stackrCardIds: string[];
    language?: string;
    condition?: string;
  }): Promise<MintyProviderResult<NormalisedPriceObservation[]>>;
}

export interface GradedPriceProvider {
  readonly name: MintyProviderName | string;
  getGradedPrices(input: {
    stackrCardIds: string[];
    language?: string;
    graders?: string[];
    grades?: string[];
  }): Promise<MintyProviderResult<NormalisedPriceObservation[]>>;
}

export interface ActiveListingProvider {
  readonly name: MintyProviderName | string;
  getActiveListings(input: {
    stackrCardIds: string[];
    language?: string;
    query?: string;
  }): Promise<MintyProviderResult<NormalisedPriceObservation[]>>;
}

export interface SoldListingProvider {
  readonly name: MintyProviderName | string;
  getSoldListings(input: {
    stackrCardIds: string[];
    language?: string;
    graders?: string[];
    grades?: string[];
    since?: string;
  }): Promise<MintyProviderResult<NormalisedPriceObservation[]>>;
}

export interface CurrencyProvider {
  readonly name: MintyProviderName | string;
  convert(input: {
    amount: number;
    from: string;
    to: string;
    observedAt?: string;
  }): Promise<MintyProviderResult<{ amount: number; quote: CurrencyQuote }>>;
}

export interface StackrMarketplaceProvider {
  readonly name: MintyProviderName | string;
  getMarketplaceSignals(stackrCardIds: string[]): Promise<MintyProviderResult<NormalisedMarketplaceSignal[]>>;
}

export interface InsightNarrativeProvider {
  readonly name: MintyProviderName | string;
  generateNarrative(payload: MintyNarrativePayload): Promise<MintyProviderResult<MintyNarrativeOutput>>;
}

