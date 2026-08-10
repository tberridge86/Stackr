import {
  getMintyInsightCategory,
  getMintyRecommendedActionLabel,
  type MintyInsight,
  type MintyInsightEvidenceSignal,
  type MintyInsightScores,
} from './mintyInsights';

export type MintyRecommendation =
  | 'strong_buy'
  | 'buy'
  | 'watch'
  | 'hold'
  | 'consider_selling'
  | 'sell'
  | 'avoid'
  | 'insufficient_data';

export type MintyConfidenceBand = 'Very High' | 'High' | 'Moderate' | 'Low' | 'Very Low';

export type PriceObservationSourceType = 'active_listing' | 'sold_listing' | 'market_price';

export type PriceObservation = {
  id: string;
  stackrCardId: string;
  language: string;
  condition?: string | null;
  grader?: string | null;
  grade?: string | null;
  source: string;
  sourceType: PriceObservationSourceType;
  originalPrice: number;
  originalCurrency: string;
  convertedPriceGbp: number;
  observedAt: string;
  soldAt?: string | null;
  listingUrl?: string | null;
  shippingIncluded: boolean;
  verifiedSale: boolean;
};

export type StackrMarketplaceSignal = {
  activeListingCount: number;
  completedSaleCount: number;
  medianCompletedSaleGbp: number | null;
  medianActiveListingGbp: number | null;
  favouriteCount: number;
  offerCount: number;
  listingViews: number;
  chaseCount: number;
  collectionAdds30d: number;
};

export type CardMarketMetrics = {
  stackrCardId: string;
  language: string;
  rawOrGraded: 'raw' | 'graded';
  grader?: string | null;
  grade?: string | null;
  variant?: string | null;
  medianSoldGbp: number | null;
  medianActiveListingGbp: number | null;
  change7dPercent: number | null;
  change30dPercent: number | null;
  change90dPercent: number | null;
  activeSupply: number;
  newListings7d: number;
  confirmedSales7d: number;
  confirmedSales30d: number;
  sellThroughRate: number | null;
  medianTimeToSellDays: number | null;
  listingToSaleGapPercent: number | null;
  volatility: number | null;
  favouriteGrowth30d: number | null;
  collectionGrowth30d: number | null;
  chaseGrowth30d: number | null;
  liquidity: number;
  dataFreshness: number;
  sourceAgreement: number;
  outlierRate: number;
  sourceCount: number;
  matchConfidence: number;
};

export type MintyStructuredSignal = {
  type: 'positive' | 'negative' | 'neutral';
  label: string;
  evidence: string;
  confidenceScore: number;
  confidenceLabel: MintyConfidenceBand;
};

export type MintyRecommendedAction = {
  key:
    | 'view_listings'
    | 'list_mine'
    | 'add_to_chase'
    | 'set_price_alert'
    | 'view_price_history'
    | 'hold'
    | 'compare_japanese'
    | 'compare_english';
  label: string;
  primary?: boolean;
};

export type MintyNarrative = {
  headline: string;
  recommendationSummary: string;
  opportunities: string[];
  risks: string[];
  whyMintyPickedThis: string[];
  outlook: string;
  limitationText?: string;
};

export type MintyInsightScoreConfig = {
  weights: {
    priceMomentum: number;
    demandGrowth: number;
    supplyPressure: number;
    liquidity: number;
    priceRange: number;
    sourceAgreement: number;
    stackrInterest: number;
  };
  thresholds: {
    insufficientData: number;
    strongBuyScore: number;
    strongBuyConfidence: number;
    buyScore: number;
    buyConfidence: number;
    watchScore: number;
    holdScore: number;
    considerSellingScore: number;
    sellScore: number;
  };
};

export type MintyRecommendationInput = {
  card: {
    stackrCardId: string;
    name: string;
    setName?: string | null;
    language?: string | null;
    variant?: string | null;
    imageUrl?: string | null;
  };
  userContext: {
    ownsCard: boolean;
    duplicateCopies?: number;
    inChaseList?: boolean;
    inFavorites?: boolean;
    recentlyViewed?: boolean;
    recentScan?: boolean;
    sellerInventory?: boolean;
  };
  metrics: CardMarketMetrics;
  marketplace: StackrMarketplaceSignal;
  generatedAt?: string;
  dataLimitations?: string[];
  config?: Partial<MintyInsightScoreConfig>;
};

export type MintyRecommendationResult = {
  id: string;
  recommendation: MintyRecommendation;
  recommendationLabel: string;
  recommendationScore: number;
  confidenceScore: number;
  confidenceLabel: MintyConfidenceBand;
  relevanceScore: number;
  signals: MintyStructuredSignal[];
  opportunities: MintyStructuredSignal[];
  risks: MintyStructuredSignal[];
  dataLimitations: string[];
  narrative: MintyNarrative;
  priceOutlook: {
    label: 'Likely to rise' | 'Likely to remain stable' | 'Likely to soften' | 'Highly uncertain';
    confidenceScore: number;
    confidenceLabel: MintyConfidenceBand;
  };
  recommendedActions: MintyRecommendedAction[];
  generatedAt: string;
  expiresAt: string;
  version: string;
};

const DEFAULT_CONFIG: MintyInsightScoreConfig = {
  weights: {
    priceMomentum: 20,
    demandGrowth: 20,
    supplyPressure: 15,
    liquidity: 15,
    priceRange: 15,
    sourceAgreement: 10,
    stackrInterest: 5,
  },
  thresholds: {
    insufficientData: 35,
    strongBuyScore: 80,
    strongBuyConfidence: 75,
    buyScore: 65,
    buyConfidence: 60,
    watchScore: 50,
    holdScore: 40,
    considerSellingScore: 25,
    sellScore: 18,
  },
};

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const num = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function getMintyConfidenceLabel(score: number): MintyConfidenceBand {
  if (score >= 85) return 'Very High';
  if (score >= 70) return 'High';
  if (score >= 50) return 'Moderate';
  if (score >= 30) return 'Low';
  return 'Very Low';
}

export function getMintyRecommendationLabel(recommendation: MintyRecommendation) {
  switch (recommendation) {
    case 'strong_buy':
      return 'Looks like a strong buy';
    case 'buy':
      return 'Looks like a buy';
    case 'watch':
      return 'Keep watching';
    case 'hold':
      return 'Hold for now';
    case 'consider_selling':
      return 'Consider selling';
    case 'sell':
      return 'Think about selling';
    case 'avoid':
      return 'Skip for now';
    default:
      return 'Not enough recent sales';
  }
}

function mergeConfig(config?: Partial<MintyInsightScoreConfig>): MintyInsightScoreConfig {
  return {
    weights: { ...DEFAULT_CONFIG.weights, ...(config?.weights ?? {}) },
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...(config?.thresholds ?? {}) },
  };
}

function signal(type: MintyStructuredSignal['type'], label: string, evidence: string, confidenceScore: number): MintyStructuredSignal {
  const safeScore = clampScore(confidenceScore);
  return {
    type,
    label,
    evidence,
    confidenceScore: safeScore,
    confidenceLabel: getMintyConfidenceLabel(safeScore),
  };
}

function scoreMomentum(metrics: CardMarketMetrics) {
  const change30 = num(metrics.change30dPercent, 0);
  const change7 = num(metrics.change7dPercent, 0);
  return clampScore(50 + change30 * 2.1 + change7 * 0.9 - num(metrics.volatility, 0) * 0.25);
}

function scoreDemand(metrics: CardMarketMetrics, marketplace: StackrMarketplaceSignal) {
  const favouriteGrowth = num(metrics.favouriteGrowth30d, 0);
  const chaseGrowth = num(metrics.chaseGrowth30d, 0);
  const collectionGrowth = num(metrics.collectionGrowth30d, 0);
  const firstParty = Math.min(28, marketplace.favouriteCount * 0.8 + marketplace.offerCount * 1.4 + marketplace.chaseCount * 1.2);
  return clampScore(42 + favouriteGrowth * 1.2 + chaseGrowth * 1.4 + collectionGrowth * 0.8 + firstParty);
}

function scoreSupply(metrics: CardMarketMetrics) {
  const listingPressure = Math.max(0, metrics.activeSupply - metrics.confirmedSales30d);
  const newListingPressure = Math.max(0, metrics.newListings7d - metrics.confirmedSales7d);
  return clampScore(70 - listingPressure * 2.2 - newListingPressure * 2.8 + num(metrics.sellThroughRate, 0) * 40);
}

function scorePriceRange(metrics: CardMarketMetrics) {
  const gap = metrics.listingToSaleGapPercent;
  if (gap == null) return 46;
  return clampScore(58 - gap * 0.9);
}

function scoreStackrInterest(metrics: CardMarketMetrics, marketplace: StackrMarketplaceSignal) {
  return clampScore(
    35 +
      marketplace.favouriteCount * 1.2 +
      marketplace.offerCount * 2 +
      marketplace.listingViews * 0.08 +
      num(metrics.collectionGrowth30d, 0) * 0.6 +
      num(metrics.chaseGrowth30d, 0) * 0.8
  );
}

function computeDataQuality(metrics: CardMarketMetrics) {
  const salesCoverage = Math.min(35, metrics.confirmedSales30d * 3 + metrics.confirmedSales7d * 2);
  const sourceCoverage = Math.min(20, metrics.sourceCount * 8);
  const freshness = metrics.dataFreshness * 0.18;
  const agreement = metrics.sourceAgreement * 0.16;
  const match = metrics.matchConfidence * 0.14;
  const outlierPenalty = metrics.outlierRate * 35;
  return clampScore(salesCoverage + sourceCoverage + freshness + agreement + match - outlierPenalty);
}

function computeConfidence(metrics: CardMarketMetrics, hasSoldData: boolean) {
  const dataQuality = computeDataQuality(metrics);
  const soldBonus = hasSoldData ? 10 : -18;
  const liquidity = metrics.liquidity * 0.18;
  return clampScore(dataQuality + soldBonus + liquidity);
}

function determineRecommendation(score: number, confidence: number, dataQuality: number, config: MintyInsightScoreConfig): MintyRecommendation {
  if (dataQuality < config.thresholds.insufficientData) return 'insufficient_data';
  if (score >= config.thresholds.strongBuyScore && confidence >= config.thresholds.strongBuyConfidence) return 'strong_buy';
  if (score >= config.thresholds.buyScore && confidence >= config.thresholds.buyConfidence) return 'buy';
  if (score >= config.thresholds.watchScore) return 'watch';
  if (score >= config.thresholds.holdScore) return 'hold';
  if (score >= config.thresholds.considerSellingScore) return 'consider_selling';
  if (score >= config.thresholds.sellScore) return 'sell';
  return 'avoid';
}

function buildSignals(input: MintyRecommendationInput, scoreParts: Record<string, number>) {
  const { metrics, marketplace } = input;
  const signals: MintyStructuredSignal[] = [];
  if (metrics.change30dPercent != null) {
    signals.push(signal(
      metrics.change30dPercent >= 0 ? 'positive' : 'negative',
      metrics.change30dPercent >= 0 ? 'Price has been moving up' : 'Price has been moving down',
      `Over the last 30 days it moved ${metrics.change30dPercent > 0 ? '+' : ''}${metrics.change30dPercent.toFixed(1)}%.`,
      Math.max(35, scoreParts.priceMomentum)
    ));
  }
  if (metrics.confirmedSales30d > 0) {
    signals.push(signal('positive', 'Recent sales found', `${metrics.confirmedSales30d} confirmed sale${metrics.confirmedSales30d === 1 ? '' : 's'} in the last 30 days.`, 62 + Math.min(25, metrics.confirmedSales30d * 2)));
  } else {
    signals.push(signal('negative', 'Not many recent sales', 'No confirmed sales were found in the last 30 days.', 36));
  }
  if (metrics.activeSupply > 0) {
    const type = metrics.activeSupply > metrics.confirmedSales30d * 2 ? 'negative' : 'neutral';
    signals.push(signal(type, 'Listings versus sales', `${metrics.activeSupply} active listing${metrics.activeSupply === 1 ? '' : 's'} against ${metrics.confirmedSales30d} recent sale${metrics.confirmedSales30d === 1 ? '' : 's'}.`, scoreParts.supplyPressure));
  }
  if (marketplace.favouriteCount || marketplace.chaseCount) {
    signals.push(signal('positive', 'Collector interest in StackR', `${marketplace.favouriteCount} saved listing${marketplace.favouriteCount === 1 ? '' : 's'} and ${marketplace.chaseCount} chase marker${marketplace.chaseCount === 1 ? '' : 's'} in StackR.`, scoreParts.stackrInterest));
  }
  if (metrics.sourceAgreement < 45) {
    signals.push(signal('negative', 'Price sources do not agree', 'Recent prices are spread out, so Minty is less certain.', metrics.sourceAgreement));
  }
  if (metrics.outlierRate > 0.25) {
    signals.push(signal('negative', 'Some prices looked unusual', `${Math.round(metrics.outlierRate * 100)}% of observations looked too unusual to trust fully.`, 42));
  }
  return signals;
}

function getPlainRecommendationSummary(
  recommendation: MintyRecommendation,
  input: MintyRecommendationInput,
  name: string
) {
  switch (recommendation) {
    case 'strong_buy':
    case 'buy':
      return `${name} looks worth buying if the price fits your budget. Recent patterns are leaning in its favour, but check the latest sold prices before you commit.`;
    case 'watch':
      return `${name} is interesting, but I would not rush. Set an alert and wait for the next few sales to confirm the direction.`;
    case 'hold':
      return `${name} looks steady. If you own it, I would keep it for now; if you want it, wait for a fair listing rather than chasing the first one.`;
    case 'consider_selling':
    case 'sell':
      return input.userContext.ownsCard
        ? `Recent patterns are weaker for ${name}. If this is a spare copy, compare recent sold prices and consider listing it.`
        : `I would be careful buying ${name} right now. Recent patterns do not give a strong reason to chase it.`;
    case 'avoid':
      return `I would skip ${name} for now unless it is a personal chase or grail. The current patterns do not support paying up.`;
    default:
      return `${name} matters to your collection, but there are not enough recent sold prices for confident advice yet. I would set an alert and wait for a few more sales before buying or selling.`;
  }
}

function buildNarrativeFallback(
  input: MintyRecommendationInput,
  recommendation: MintyRecommendation,
  recommendationLabel: string,
  signals: MintyStructuredSignal[],
  limitations: string[]
): MintyNarrative {
  const positives = signals.filter((item) => item.type === 'positive').slice(0, 3);
  const negatives = signals.filter((item) => item.type === 'negative').slice(0, 3);
  const name = input.card.name;
  const summary = getPlainRecommendationSummary(recommendation, input, name);
  return {
    headline: `${recommendationLabel}: ${name}`,
    recommendationSummary: summary,
    opportunities: positives.length ? positives.map((item) => `${item.label}: ${item.evidence}`) : ['No strong positive pattern is clear yet.'],
    risks: negatives.length ? negatives.map((item) => `${item.label}: ${item.evidence}`) : ['No big warning sign right now, but check recent sold prices before acting.'],
    whyMintyPickedThis: [
      input.userContext.ownsCard ? 'This card is in your collection.' : 'This card came from your StackR activity.',
      input.userContext.inChaseList ? 'It appears in your chase list.' : 'Minty compared recent prices, listings, and StackR interest.',
      signals[0]?.evidence ?? 'Minty looked at recent price and listing patterns.',
    ],
    outlook: input.metrics.change30dPercent == null
      ? 'Unclear until more recent sold prices appear.'
      : input.metrics.change30dPercent > 4
        ? 'Could rise if people keep buying and listings stay limited.'
        : input.metrics.change30dPercent < -4
          ? 'Could dip unless collector interest picks up.'
          : 'Looks fairly steady unless new sales change the pattern.',
    limitationText: limitations.length ? limitations.join(' ') : undefined,
  };
}

function getOutlook(metrics: CardMarketMetrics, confidenceScore: number): MintyRecommendationResult['priceOutlook'] {
  const confidenceLabel = getMintyConfidenceLabel(confidenceScore);
  if (confidenceScore < 35) return { label: 'Highly uncertain', confidenceScore, confidenceLabel };
  if (num(metrics.change30dPercent, 0) > 4 && metrics.sourceAgreement >= 55) return { label: 'Likely to rise', confidenceScore, confidenceLabel };
  if (num(metrics.change30dPercent, 0) < -4) return { label: 'Likely to soften', confidenceScore, confidenceLabel };
  return { label: 'Likely to remain stable', confidenceScore, confidenceLabel };
}

function getActions(recommendation: MintyRecommendation, input: MintyRecommendationInput): MintyRecommendedAction[] {
  if (recommendation === 'insufficient_data') {
    return [
      { key: 'set_price_alert', label: 'Set price alert', primary: true },
      { key: 'view_price_history', label: 'View price history' },
    ];
  }
  if (recommendation === 'sell' || recommendation === 'consider_selling') {
    return input.userContext.ownsCard
      ? [
          { key: 'list_mine', label: 'List mine', primary: true },
          { key: 'view_price_history', label: 'View price history' },
          { key: 'hold', label: 'Hold' },
        ]
      : [{ key: 'view_price_history', label: 'View price history', primary: true }];
  }
  if (recommendation === 'buy' || recommendation === 'strong_buy') {
    return [
      { key: 'view_listings', label: 'View listings', primary: true },
      { key: 'set_price_alert', label: 'Set price alert' },
      input.card.language?.toLowerCase().startsWith('ja')
        ? { key: 'compare_english', label: 'Compare English version' }
        : { key: 'compare_japanese', label: 'Compare Japanese version' },
    ];
  }
  return [
    { key: 'set_price_alert', label: 'Set price alert', primary: true },
    { key: 'view_price_history', label: 'View price history' },
    input.userContext.inChaseList ? { key: 'view_listings', label: 'View listings' } : { key: 'add_to_chase', label: 'Add to Chase' },
  ];
}

export function evaluateMintyRecommendation(input: MintyRecommendationInput): MintyRecommendationResult {
  const config = mergeConfig(input.config);
  const metrics = input.metrics;
  const marketplace = input.marketplace;
  const hasSoldData = metrics.confirmedSales30d > 0 || metrics.confirmedSales7d > 0;
  const dataQualityScore = computeDataQuality(metrics);
  const scoreParts = {
    priceMomentum: scoreMomentum(metrics),
    demandGrowth: scoreDemand(metrics, marketplace),
    supplyPressure: scoreSupply(metrics),
    liquidity: clampScore(metrics.liquidity),
    priceRange: scorePriceRange(metrics),
    sourceAgreement: clampScore(metrics.sourceAgreement),
    stackrInterest: scoreStackrInterest(metrics, marketplace),
  };
  const recommendationScore = clampScore(
    scoreParts.priceMomentum * (config.weights.priceMomentum / 100) +
    scoreParts.demandGrowth * (config.weights.demandGrowth / 100) +
    scoreParts.supplyPressure * (config.weights.supplyPressure / 100) +
    scoreParts.liquidity * (config.weights.liquidity / 100) +
    scoreParts.priceRange * (config.weights.priceRange / 100) +
    scoreParts.sourceAgreement * (config.weights.sourceAgreement / 100) +
    scoreParts.stackrInterest * (config.weights.stackrInterest / 100)
  );
  const confidenceScore = computeConfidence(metrics, hasSoldData);
  const confidenceLabel = getMintyConfidenceLabel(confidenceScore);
  const recommendation = determineRecommendation(recommendationScore, confidenceScore, dataQualityScore, config);
  const recommendationLabel = getMintyRecommendationLabel(recommendation);
  const limitations = [...(input.dataLimitations ?? [])];
  if (!hasSoldData) limitations.push('There are not many confirmed recent sales yet.');
  if (metrics.language?.toLowerCase().startsWith('ja') && metrics.sourceCount < 2) {
    limitations.push('Japanese pricing is available from limited source coverage.');
  }
  if (metrics.rawOrGraded === 'graded' && (!metrics.grader || !metrics.grade)) {
    limitations.push('Grader or grade certainty is incomplete.');
  }

  const signals = buildSignals(input, scoreParts);
  const opportunities = signals.filter((item) => item.type === 'positive');
  const risks = signals.filter((item) => item.type === 'negative');
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const narrative = buildNarrativeFallback(input, recommendation, recommendationLabel, signals, limitations);
  const relevanceScore = clampScore(
    (input.userContext.ownsCard ? 30 : 0) +
    (input.userContext.inChaseList ? 24 : 0) +
    (input.userContext.inFavorites ? 16 : 0) +
    (input.userContext.recentlyViewed ? 12 : 0) +
    (input.userContext.duplicateCopies ? Math.min(12, input.userContext.duplicateCopies * 4) : 0) +
    recommendationScore * 0.25
  );

  return {
    id: `minty:${input.card.stackrCardId}:${metrics.language}:${metrics.rawOrGraded}:${metrics.grader ?? 'raw'}:${metrics.grade ?? ''}`,
    recommendation,
    recommendationLabel,
    recommendationScore,
    confidenceScore,
    confidenceLabel,
    relevanceScore,
    signals,
    opportunities,
    risks,
    dataLimitations: [...new Set(limitations)],
    narrative,
    priceOutlook: getOutlook(metrics, confidenceScore),
    recommendedActions: getActions(recommendation, input),
    generatedAt,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    version: 'minty-v2.0.0',
  };
}

const routeForRecommendation = (recommendation: MintyRecommendation) => {
  if (recommendation === 'sell' || recommendation === 'consider_selling') return 'watch_single_price';
  if (recommendation === 'buy' || recommendation === 'strong_buy') return 'watch_single_price';
  if (recommendation === 'insufficient_data') return 'set_price_alert';
  return 'hold_and_watch';
};

const confidenceToLegacy = (label: MintyConfidenceBand) => {
  if (label === 'Very High' || label === 'High') return 'High';
  if (label === 'Moderate') return 'Medium';
  return 'Low';
};

export function mintyRecommendationToHomeInsight(
  result: MintyRecommendationResult,
  card: MintyRecommendationInput['card']
): MintyInsight {
  const scores: MintyInsightScores = {
    relevance_to_owned_cards: result.relevanceScore,
    relevance_to_chase_list: result.relevanceScore,
    relevance_to_recent_views: 0,
    relevance_to_purchase_history: 0,
    market_movement_strength: result.recommendationScore,
    confidence_score: result.confidenceScore,
    potential_user_value: result.recommendationScore,
    freshness: 84,
    actionability: result.recommendedActions.some((action) => action.primary) ? 88 : 54,
  };
  const recommendedRoute = routeForRecommendation(result.recommendation);
  const evidence = result.signals.map((signal): MintyInsightEvidenceSignal => ({
    type: signal.type,
    label: signal.label,
    evidence: signal.evidence,
    confidenceScore: signal.confidenceScore,
    confidenceLabel: signal.confidenceLabel,
    source: 'market',
  }));
  const tags = ['api-backed', result.recommendation, card.language ?? 'unknown-language'];
  return {
    id: result.id,
    title: result.narrative.headline,
    body: result.narrative.recommendationSummary,
    action_label: getMintyRecommendedActionLabel(recommendedRoute, {
      recommended_actions: result.recommendedActions,
      recommendation_label: result.recommendationLabel,
    }),
    explanation: result.narrative.recommendationSummary,
    evidence,
    data_refreshed_at: result.generatedAt,
    source_context: 'market',
    confidence: confidenceToLegacy(result.confidenceLabel),
    confidence_score: result.confidenceScore,
    personalisation_reason: result.narrative.whyMintyPickedThis.join(' '),
    related_user_goal: result.recommendation === 'sell' || result.recommendation === 'consider_selling' ? 'selling_duplicate' : 'watching_market',
    related_cards: [card.name].filter(Boolean),
    related_products: [card.setName ?? ''].filter(Boolean),
    recommended_route: recommendedRoute,
    user_feedback_options: ['useful', 'not_relevant', 'show_less', 'hide'],
    privacy_level: 'personalised',
    scoring: scores,
    tags,
    insight_category: getMintyInsightCategory({
      tags,
      recommendation: result.recommendation,
      recommended_route: recommendedRoute,
      related_user_goal: result.recommendation === 'sell' || result.recommendation === 'consider_selling' ? 'selling_duplicate' : 'watching_market',
    }),
    recommendation: result.recommendation,
    recommendation_label: result.recommendationLabel,
    recommendation_score: result.recommendationScore,
    confidence_label: result.confidenceLabel,
    generated_at: result.generatedAt,
    expires_at: result.expiresAt,
    card_name: card.name,
    card_set_name: card.setName ?? null,
    card_image_url: card.imageUrl ?? null,
    opportunities: result.opportunities,
    risks: result.risks,
    supporting_signals: result.signals,
    why_minty_picked_this: result.narrative.whyMintyPickedThis,
    price_outlook: result.priceOutlook,
    recommended_actions: result.recommendedActions,
    data_limitations: result.dataLimitations,
    narrative: result.narrative,
    is_api_backed: true,
  } as MintyInsight;
}
