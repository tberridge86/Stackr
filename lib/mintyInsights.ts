export type CollectorIntent =
  | 'completing_set'
  | 'chasing_specific_card'
  | 'buying_dip'
  | 'trading_up'
  | 'grading_candidate'
  | 'protecting_collection'
  | 'selling_duplicate'
  | 'watching_market'
  | 'sealed_collector'
  | 'raw_single_collector'
  | 'slab_collector';

export type MintyConfidence = 'Low' | 'Medium' | 'High';

export type MintyRecommendedRoute =
  | 'watch_single_price'
  | 'watch_sealed_entry'
  | 'trade_duplicates'
  | 'complete_with_singles'
  | 'hold_and_watch'
  | 'set_price_alert'
  | 'protect_high_value_card';

export type MintyPrivacyLevel = 'personalised' | 'general';

export type MintyInsightFeedback =
  | 'useful'
  | 'not_relevant'
  | 'not_helpful'
  | 'no_longer_relevant'
  | 'show_more'
  | 'show_less'
  | 'hide';

export type MintyForecastDirection = 'up' | 'down' | 'volatile' | 'watch';

export type MintyForecast = {
  direction: MintyForecastDirection;
  horizonLabel: string;
  estimatedImpactPctRange?: [number, number];
  estimatedValueRange?: {
    low: number;
    high: number;
    currency: 'GBP';
  };
  catalysts: string[];
  basis: string[];
  caveat: string;
};

export type MintyInsightScores = {
  relevance_to_owned_cards: number;
  relevance_to_chase_list: number;
  relevance_to_recent_views: number;
  relevance_to_purchase_history: number;
  market_movement_strength: number;
  confidence_score: number;
  potential_user_value: number;
  freshness: number;
  actionability: number;
};

export type MintyInsight = {
  id: string;
  title: string;
  body: string;
  forecast?: MintyForecast;
  confidence: MintyConfidence;
  confidence_score: number;
  personalisation_reason: string;
  related_user_goal: CollectorIntent;
  related_cards: string[];
  related_products: string[];
  recommended_route: MintyRecommendedRoute;
  user_feedback_options: MintyInsightFeedback[];
  privacy_level: MintyPrivacyLevel;
  scoring: MintyInsightScores;
  tags: string[];
  recommendation?: string;
  recommendation_label?: string;
  recommendation_score?: number;
  confidence_label?: string;
  generated_at?: string | null;
  expires_at?: string | null;
  card_name?: string | null;
  card_set_name?: string | null;
  card_image_url?: string | null;
  opportunities?: Array<{
    type: 'positive' | 'negative' | 'neutral';
    label: string;
    evidence: string;
    confidenceScore: number;
    confidenceLabel: string;
  }>;
  risks?: Array<{
    type: 'positive' | 'negative' | 'neutral';
    label: string;
    evidence: string;
    confidenceScore: number;
    confidenceLabel: string;
  }>;
  supporting_signals?: Array<{
    type: 'positive' | 'negative' | 'neutral';
    label: string;
    evidence: string;
    confidenceScore: number;
    confidenceLabel: string;
  }>;
  why_minty_picked_this?: string[];
  price_outlook?: {
    label: string;
    confidenceScore: number;
    confidenceLabel: string;
  };
  recommended_actions?: Array<{
    key: string;
    label: string;
    primary?: boolean;
  }>;
  data_limitations?: string[];
  narrative?: {
    headline: string;
    recommendationSummary: string;
    opportunities: string[];
    risks: string[];
    whyMintyPickedThis: string[];
    outlook: string;
    limitationText?: string;
  };
  is_api_backed?: boolean;
};

export type CollectorPreferenceProfile = {
  favourite_pokemon: string[];
  favourite_sets: string[];
  preferred_product_types: string[];
  preferred_card_types: string[];
  average_purchase_range: string;
  high_interest_cards: string[];
  active_chases: string[];
  completion_goals: string[];
  trade_style: string;
  confidence_preference: 'low' | 'medium_to_high' | 'high';
  inferred_intents: CollectorIntent[];
};

export type MintyPersonalisationSettings = {
  personalisedInsights: boolean;
  usePurchaseHistory: boolean;
  useChaseList: boolean;
  useViewingHistory: boolean;
  useTradeHistory: boolean;
  usePriceAlerts: boolean;
  useMarketCatalysts: boolean;
};

export type MintyFeedbackProfile = {
  hiddenInsightIds: string[];
  showLessTopics: Record<string, number>;
  showMoreTopics: Record<string, number>;
};

type InsightCard = {
  cardId?: string | null;
  setId?: string | null;
  name?: string | null;
  setName?: string | null;
  rarity?: string | null;
  estimatedValue?: number | null;
};

type InsightBinder = {
  name: string;
  owned: number;
  total: number;
  missing: number;
  completionPercent: number;
  topValueCards?: InsightCard[];
};

type InsightDuplicateSummary = {
  count: number;
  estimatedValue: number;
  items: Array<InsightCard & { extraQuantity?: number | null }>;
};

type InsightActivity = {
  title: string;
  subtitle?: string | null;
  valueChange?: number | null;
  activityType?: string | null;
};

export type InsightUpcomingRelease = {
  name: string;
  releaseDate?: string | null;
  relatedCharacters?: string[];
  relatedSets?: string[];
  relatedEras?: string[];
  relatedTags?: string[];
  expectedDirection?: MintyForecastDirection;
  estimatedImpactPctRange?: [number, number];
  signal?:
    | 'attention'
    | 'reprint_risk'
    | 'sealed_release'
    | 'product_release'
    | 'game_release'
    | 'movie_release'
    | 'anniversary'
    | 'worlds'
    | 'seasonal'
    | 'rotation'
    | 'mega_evolution'
    | 'unknown';
  source?: string | null;
};

export type MintyHomeInsightInput = {
  totalValue: number;
  absoluteChange: number;
  percentageChange: number;
  changePeriodLabel: string;
  trendData?: number[];
  ownedCount: number;
  activeBinder?: InsightBinder | null;
  duplicateSummary?: InsightDuplicateSummary | null;
  chaseCards?: InsightCard[];
  wantedCards?: InsightCard[];
  recentViews?: InsightCard[];
  recentSearches?: InsightCard[];
  priceAlerts?: InsightCard[];
  missingCards?: InsightCard[];
  recentActivity?: InsightActivity[];
  marketplaceMatchCount?: number;
  upcomingReleases?: InsightUpcomingRelease[];
  marketCatalysts?: InsightUpcomingRelease[];
};

export const DEFAULT_MINTY_PERSONALISATION_SETTINGS: MintyPersonalisationSettings = {
  personalisedInsights: true,
  usePurchaseHistory: true,
  useChaseList: true,
  useViewingHistory: true,
  useTradeHistory: true,
  usePriceAlerts: true,
  useMarketCatalysts: true,
};

export const DEFAULT_MINTY_FEEDBACK_PROFILE: MintyFeedbackProfile = {
  hiddenInsightIds: [],
  showLessTopics: {},
  showMoreTopics: {},
};

const DEFAULT_FEEDBACK_OPTIONS: MintyInsightFeedback[] = ['useful', 'not_relevant', 'show_more', 'show_less', 'hide'];

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const safeName = (value?: string | null, fallback = 'that card') => {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : fallback;
};

const getInsightCardName = (card?: InsightCard | null) => safeName(card?.name, 'that card');

const getInsightSetName = (card?: InsightCard | null) => safeName(card?.setName, 'Pokemon TCG');

const scoreTotal = (scores: MintyInsightScores) =>
  Math.round(
    scores.relevance_to_owned_cards * 0.13 +
    scores.relevance_to_chase_list * 0.17 +
    scores.relevance_to_recent_views * 0.08 +
    scores.relevance_to_purchase_history * 0.08 +
    scores.market_movement_strength * 0.13 +
    scores.confidence_score * 0.11 +
    scores.potential_user_value * 0.13 +
    scores.freshness * 0.07 +
    scores.actionability * 0.10
  );

const getConfidence = (score: number): MintyConfidence => {
  if (score >= 76) return 'High';
  if (score >= 46) return 'Medium';
  return 'Low';
};

const topicWeight = (tags: string[], feedback: MintyFeedbackProfile) =>
  tags.reduce((weight, tag) => {
    const more = feedback.showMoreTopics[tag] ?? 0;
    const less = feedback.showLessTopics[tag] ?? 0;
    return weight + more * 5 - less * 12;
  }, 0);

const getTrendConfidenceScore = (input: MintyHomeInsightInput) => {
  const trendCount = (input.trendData ?? []).filter((value) => Number.isFinite(value)).length;
  if (trendCount >= 6 && Math.abs(input.percentageChange) >= 4) return 78;
  if (trendCount >= 3 && Math.abs(input.percentageChange) >= 1.5) return 60;
  if (trendCount >= 2) return 44;
  return 28;
};

const marketStrengthScore = (percentageChange: number, absoluteChange: number) =>
  clampScore(Math.max(Math.abs(percentageChange) * 12, Math.abs(absoluteChange) > 25 ? 45 : 20));

const shortList = (items: string[], limit = 3) => [...new Set(items.filter(Boolean))].slice(0, limit);

const normaliseLookupText = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const KNOWN_POKEMON_NAMES = [
  'Terapagos',
  'Charizard',
  'Blastoise',
  'Arcanine',
  'Tyranitar',
  'Vaporeon',
  'Sylveon',
  'Pikachu',
  'Mewtwo',
  'Gengar',
  'Psyduck',
  'Snorlax',
  'Froakie',
  'Mantine',
  'Togepi',
  'Latias',
  'Eevee',
  'Mew',
];

const ANNIVERSARY_POKEMON = [
  'Pikachu',
  'Charizard',
  'Blastoise',
  'Venusaur',
  'Mew',
  'Mewtwo',
  'Eevee',
  'Gengar',
  'Snorlax',
  'Dragonite',
  'Gyarados',
  'Machamp',
];

const XY_MEGA_POKEMON = [
  'Zygarde',
  'Greninja',
  'Lucario',
  'Charizard',
  'Mewtwo',
  'Gardevoir',
  'Gengar',
  'Rayquaza',
  'Diancie',
  'Absol',
  'Mawile',
  'Manectric',
  'Alakazam',
];

const XY_ERA_SET_TERMS = [
  'XY',
  'Kalos',
  'Evolutions',
  'Flashfire',
  'Phantom Forces',
  'Ancient Origins',
  'Roaring Skies',
  'BREAKthrough',
  'BREAKpoint',
  'Fates Collide',
  'Steam Siege',
  'Generations',
];

const DEFAULT_MINTY_MARKET_CATALYSTS: InsightUpcomingRelease[] = [
  {
    name: 'Pokemon TCG 30th Celebration',
    releaseDate: '2026-09-16',
    relatedCharacters: ANNIVERSARY_POKEMON,
    relatedSets: ['30th Celebration', 'Celebrations', 'Base Set', 'Wizards of the Coast'],
    relatedEras: ['vintage', 'anniversary', 'kanto'],
    relatedTags: ['anniversary', 'reprint-risk', 'sealed', 'nostalgia'],
    signal: 'anniversary',
    expectedDirection: 'volatile',
    estimatedImpactPctRange: [-8, 18],
    source: 'Official Pokemon TCG 30th Celebration announcement',
  },
  {
    name: 'Kalos and Mega Evolution attention cycle',
    releaseDate: '2026-02-27',
    relatedCharacters: XY_MEGA_POKEMON,
    relatedSets: XY_ERA_SET_TERMS,
    relatedEras: ['xy', 'kalos', 'mega-evolution'],
    relatedTags: ['game-release', 'xy', 'mega-evolution', 'nostalgia'],
    signal: 'mega_evolution',
    expectedDirection: 'up',
    estimatedImpactPctRange: [4, 14],
    source: 'Pokemon game and Mega Evolution attention window',
  },
  {
    name: 'Pokemon Day announcement window',
    releaseDate: '2026-02-27',
    relatedCharacters: [...ANNIVERSARY_POKEMON, ...XY_MEGA_POKEMON],
    relatedSets: ['30th Celebration', 'XY', 'Kalos', 'Celebrations'],
    relatedEras: ['anniversary', 'xy', 'modern'],
    relatedTags: ['announcement', 'product-release', 'watch'],
    signal: 'attention',
    expectedDirection: 'watch',
    estimatedImpactPctRange: [0, 10],
    source: 'Annual Pokemon Day announcement cycle',
  },
  {
    name: 'World Championships season',
    releaseDate: '2026-08-15',
    relatedCharacters: ['Pikachu', 'Charizard', 'Mewtwo', 'Gardevoir', 'Greninja', 'Terapagos'],
    relatedSets: ['World Championships', 'promo', 'competitive'],
    relatedEras: ['current', 'competitive'],
    relatedTags: ['event', 'promo', 'competitive'],
    signal: 'worlds',
    expectedDirection: 'watch',
    estimatedImpactPctRange: [0, 9],
    source: 'Annual competitive event season',
  },
  {
    name: 'Holiday sealed demand window',
    releaseDate: '2026-11-15',
    relatedCharacters: ANNIVERSARY_POKEMON,
    relatedSets: ['Elite Trainer Box', 'Booster Box', 'Collection Box', 'sealed'],
    relatedEras: ['sealed', 'modern'],
    relatedTags: ['sealed', 'seasonal', 'gift-demand'],
    signal: 'seasonal',
    expectedDirection: 'up',
    estimatedImpactPctRange: [3, 12],
    source: 'Seasonal sealed-product demand pattern',
  },
];

const getCharacterName = (cardName?: string | null) => {
  const rawName = safeName(cardName, '');
  const knownName = KNOWN_POKEMON_NAMES.find((name) => rawName.toLowerCase().includes(name.toLowerCase()));
  if (knownName) return knownName;

  const cleaned = rawName
    .replace(/\b(ex|gx|vmax|vstar|v-union|v)\b/gi, '')
    .replace(/\b(full art|special illustration rare|illustration rare|promo|holo|reverse holo)\b/gi, '')
    .replace(/[^\w\s'-]/g, ' ')
    .trim();
  return cleaned.split(/\s+/)[0] ?? '';
};

const getAverageRange = (values: number[]) => {
  const cleanValues = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!cleanValues.length) return 'not enough purchase data yet';
  const average = cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
  if (average < 20) return '\u00A30-\u00A320';
  if (average < 50) return '\u00A320-\u00A350';
  if (average < 80) return '\u00A350-\u00A380';
  if (average < 150) return '\u00A380-\u00A3150';
  return '\u00A3150+';
};

const getDaysUntilRelease = (releaseDate?: string | null) => {
  if (!releaseDate) return null;
  const releaseTime = new Date(releaseDate).getTime();
  if (!Number.isFinite(releaseTime)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((releaseTime - today.getTime()) / 86400000);
};

const releaseSignalCopy = (signal?: InsightUpcomingRelease['signal']) => {
  switch (signal) {
    case 'anniversary':
      return 'anniversary attention can lift nostalgia cards, while reprints can pressure easy-to-replace copies';
    case 'game_release':
      return 'game-release attention can pull demand toward featured Pokemon and their older chase cards';
    case 'movie_release':
      return 'movie attention can lift character demand, but the effect usually needs sold volume to confirm';
    case 'mega_evolution':
      return 'Mega Evolution and Kalos attention can lift XY-era interest before sold prices fully catch up';
    case 'worlds':
      return 'event attention can lift promos and competitive characters, but spikes can fade quickly';
    case 'seasonal':
      return 'seasonal demand can support sealed products, especially when supply is already thin';
    case 'rotation':
      return 'rotation or format news can move playable cards faster than collector-only cards';
    case 'reprint_risk':
      return 'new supply or reprint details could change the cleaner buying route';
    case 'sealed_release':
      return 'sealed demand may move before single-card prices settle';
    case 'product_release':
      return 'early product attention can be noisy before sold volume confirms it';
    case 'attention':
      return 'new attention can lift interest, but I would wait for sold volume to confirm it';
    default:
      return 'new attention can move demand, but I would treat it as a watch signal first';
  }
};

const formatForecastPercentRange = (range?: [number, number]) => {
  if (!range) return 'watch-only';
  const [low, high] = range;
  const format = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}%`;
  return `${format(low)} to ${format(high)}`;
};

const formatForecastCurrencyRange = (range?: MintyForecast['estimatedValueRange']) => {
  if (!range) return null;
  const format = (value: number) => {
    const safe = Math.max(0, value);
    return `\u00A3${safe.toFixed(safe >= 1000 ? 0 : 2)}`;
  };
  return `${format(range.low)}-\u00A3${Math.max(0, range.high).toFixed(range.high >= 1000 ? 0 : 2)}`;
};

const getBestEstimatedCardValue = (...cards: Array<InsightCard | null | undefined>) => {
  for (const card of cards) {
    const value = Number(card?.estimatedValue ?? NaN);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
};

const buildForecast = ({
  direction,
  catalyst,
  card,
  fallbackValue,
  basis,
  horizonLabel,
}: {
  direction: MintyForecastDirection;
  catalyst: InsightUpcomingRelease;
  card?: InsightCard | null;
  fallbackValue?: number | null;
  basis: string[];
  horizonLabel: string;
}): MintyForecast => {
  const range = catalyst.estimatedImpactPctRange;
  const estimatedValue = getBestEstimatedCardValue(card) ?? fallbackValue ?? null;
  const estimatedValueRange = estimatedValue != null && range
    ? {
        low: Math.max(0, estimatedValue * (1 + range[0] / 100)),
        high: Math.max(0, estimatedValue * (1 + range[1] / 100)),
        currency: 'GBP' as const,
      }
    : undefined;

  return {
    direction,
    horizonLabel,
    estimatedImpactPctRange: range,
    estimatedValueRange,
    catalysts: [catalyst.name],
    basis,
    caveat: 'Forecast ranges are Minty watch bands, not guaranteed prices. Confirm with sold comps before buying or selling.',
  };
};

const getForecastDirectionVerb = (direction: MintyForecastDirection) => {
  switch (direction) {
    case 'up':
      return 'upside watch';
    case 'down':
      return 'downside risk';
    case 'volatile':
      return 'volatility watch';
    default:
      return 'watch signal';
  }
};

const getForecastHorizon = (daysUntil: number | null) => {
  if (daysUntil == null) return 'next catalyst window';
  if (daysUntil < -30) return 'post-release window';
  if (daysUntil < 0) return 'early post-release window';
  if (daysUntil <= 14) return 'next two weeks';
  if (daysUntil <= 45) return 'next 45 days';
  if (daysUntil <= 120) return 'next 3-4 months';
  return 'long-range watch';
};

const mergeCatalysts = (input: MintyHomeInsightInput, settings: MintyPersonalisationSettings) => {
  const supplied = [...(input.upcomingReleases ?? []), ...(input.marketCatalysts ?? [])];
  if (!settings.useMarketCatalysts) return supplied;

  const merged = [...DEFAULT_MINTY_MARKET_CATALYSTS, ...supplied];
  const seen = new Set<string>();
  return merged.filter((release) => {
    const key = `${normaliseLookupText(release.name)}:${release.releaseDate ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const findRelevantUpcomingRelease = (
  input: MintyHomeInsightInput,
  profile: CollectorPreferenceProfile,
  settings: MintyPersonalisationSettings
) => {
  const releases = mergeCatalysts(input, settings);
  if (!releases.length) return null;

  const interestCharacters = shortList(
    [
      ...profile.favourite_pokemon,
      ...profile.high_interest_cards.map((cardName) => getCharacterName(cardName)),
      ...(input.chaseCards ?? []).map((card) => getCharacterName(card.name)),
    ],
    8
  );
  const interestSets = shortList(
    [
      ...profile.favourite_sets,
      ...(input.chaseCards ?? []).map((card) => card.setName ?? ''),
      ...(input.wantedCards ?? []).map((card) => card.setName ?? ''),
      ...(input.priceAlerts ?? []).map((card) => card.setName ?? ''),
      input.activeBinder?.name ?? '',
    ],
    8
  );
  const interestEras = shortList(
    [
      ...interestSets,
      ...interestCharacters,
      ...profile.preferred_product_types,
      ...profile.preferred_card_types,
    ],
    12
  );
  const normalisedCharacters = interestCharacters.map(normaliseLookupText).filter(Boolean);
  const normalisedSets = interestSets.map(normaliseLookupText).filter(Boolean);
  const normalisedEras = interestEras.map(normaliseLookupText).filter(Boolean);

  const scored = releases
    .map((release) => {
      const releaseName = safeName(release.name, '');
      const normalisedReleaseName = normaliseLookupText(releaseName);
      const characterMatch = (release.relatedCharacters ?? [])
        .map((name) => safeName(name, ''))
        .find((name) => {
          const normalised = normaliseLookupText(name);
          return normalised && normalisedCharacters.some((interest) => interest === normalised || normalised.includes(interest) || interest.includes(normalised));
        });
      const setMatch = (release.relatedSets ?? [])
        .map((name) => safeName(name, ''))
        .find((name) => {
          const normalised = normaliseLookupText(name);
          return normalised && normalisedSets.some((interest) => interest === normalised || normalised.includes(interest) || interest.includes(normalised));
        });
      const releaseNameCharacterMatch = interestCharacters.find((name) => {
        const normalised = normaliseLookupText(name);
        return normalised && normalisedReleaseName.includes(normalised);
      });
      const releaseNameSetMatch = interestSets.find((name) => {
        const normalised = normaliseLookupText(name);
        return normalised && normalisedReleaseName.includes(normalised);
      });
      const eraMatch = [...(release.relatedEras ?? []), ...(release.relatedTags ?? [])]
        .map((name) => safeName(name, ''))
        .find((name) => {
          const normalised = normaliseLookupText(name);
          return normalised && normalisedEras.some((interest) => interest === normalised || normalised.includes(interest) || interest.includes(normalised));
        });
      const xySetMatch = interestSets.find((setName) => {
        const normalised = normaliseLookupText(setName);
        return normalised && XY_ERA_SET_TERMS.some((term) => normalised.includes(normaliseLookupText(term)));
      });
      const anniversaryCharacterMatch = interestCharacters.find((name) => {
        const normalised = normaliseLookupText(name);
        return normalised && ANNIVERSARY_POKEMON.some((term) => normalised === normaliseLookupText(term));
      });
      const daysUntil = getDaysUntilRelease(release.releaseDate);
      const timingScore = daysUntil == null ? 8 : daysUntil >= -14 && daysUntil <= 120 ? 20 : 6;
      const score =
        (characterMatch || releaseNameCharacterMatch ? 54 : 0) +
        (setMatch || releaseNameSetMatch ? 44 : 0) +
        (eraMatch ? 26 : 0) +
        (xySetMatch && (release.signal === 'mega_evolution' || release.signal === 'game_release') ? 34 : 0) +
        (anniversaryCharacterMatch && release.signal === 'anniversary' ? 30 : 0) +
        timingScore +
        (release.source ? 8 : 0) +
        (release.estimatedImpactPctRange ? 6 : 0);

      return {
        release,
        matchedCharacter: characterMatch ?? releaseNameCharacterMatch ?? anniversaryCharacterMatch ?? null,
        matchedSet: setMatch ?? releaseNameSetMatch ?? xySetMatch ?? null,
        matchedEra: eraMatch ?? null,
        daysUntil,
        score,
      };
    })
    .filter((match) => match.score >= 48)
    .sort((a, b) => b.score - a.score);

  return scored[0] ?? null;
};

export function buildCollectorPreferenceProfile(
  input: MintyHomeInsightInput,
  settings: MintyPersonalisationSettings = DEFAULT_MINTY_PERSONALISATION_SETTINGS,
  feedback: MintyFeedbackProfile = DEFAULT_MINTY_FEEDBACK_PROFILE
): CollectorPreferenceProfile {
  const chaseCards = settings.useChaseList ? input.chaseCards ?? [] : [];
  const wantedCards = settings.useChaseList ? input.wantedCards ?? [] : [];
  const recentViews = settings.useViewingHistory ? input.recentViews ?? [] : [];
  const recentSearches = settings.useViewingHistory ? input.recentSearches ?? [] : [];
  const priceAlerts = settings.usePriceAlerts ? input.priceAlerts ?? [] : [];
  const activeBinder = input.activeBinder ?? null;
  const duplicateSummary = settings.useTradeHistory ? input.duplicateSummary ?? null : null;
  const missingCards = input.missingCards ?? [];
  const activities = settings.usePurchaseHistory ? input.recentActivity ?? [] : [];
  const topOwned = activeBinder?.topValueCards ?? [];
  const interestCards = [...chaseCards, ...wantedCards, ...priceAlerts, ...recentViews, ...recentSearches];
  const allCards = [...interestCards, ...missingCards, ...(duplicateSummary?.items ?? []), ...topOwned];
  const purchaseValues = activities
    .map((activity) => Math.abs(Number(activity.valueChange ?? 0)))
    .filter((value) => value > 0);

  const favouritePokemon = shortList(
    [...interestCards, ...topOwned, ...(duplicateSummary?.items ?? [])]
      .map((card) => getCharacterName(card.name))
      .filter(Boolean)
  );
  const favouriteSets = shortList(allCards.map((card) => card.setName ?? '').filter(Boolean));
  const preferredCardTypes = shortList(allCards.map((card) => card.rarity ?? '').filter(Boolean));
  const highInterestCards = shortList(interestCards.map((card) => getInsightCardName(card)), 5);
  const completionGoals = activeBinder && activeBinder.total > 0 && activeBinder.missing > 0
    ? [`${activeBinder.name} completion`]
    : [];
  const productTypes = preferredCardTypes.some((type) => /graded|slab/i.test(type))
    ? ['singles', 'graded']
    : ['singles'];

  const inferredIntents: CollectorIntent[] = [];
  if (chaseCards.length || wantedCards.length || priceAlerts.length) inferredIntents.push('chasing_specific_card');
  if (activeBinder && activeBinder.missing > 0 && activeBinder.completionPercent >= 60) inferredIntents.push('completing_set');
  if (duplicateSummary && duplicateSummary.count > 0 && (chaseCards.length || wantedCards.length || priceAlerts.length)) inferredIntents.push('trading_up');
  if (input.absoluteChange < 0 || input.percentageChange < -1) inferredIntents.push('buying_dip');
  if (preferredCardTypes.some((type) => /graded|slab/i.test(type))) inferredIntents.push('slab_collector');
  inferredIntents.push('raw_single_collector');

  for (const [topic, count] of Object.entries(feedback.showLessTopics)) {
    if (count >= 3 && topic === 'sealed') {
      const index = productTypes.indexOf('sealed');
      if (index >= 0) productTypes.splice(index, 1);
    }
  }

  return {
    favourite_pokemon: favouritePokemon,
    favourite_sets: favouriteSets,
    preferred_product_types: productTypes,
    preferred_card_types: preferredCardTypes,
    average_purchase_range: getAverageRange(purchaseValues),
    high_interest_cards: highInterestCards,
    active_chases: highInterestCards,
    completion_goals: completionGoals,
    trade_style: duplicateSummary && duplicateSummary.count > 0 && (chaseCards.length || wantedCards.length || priceAlerts.length)
      ? 'uses duplicates to fund chase cards'
      : duplicateSummary && duplicateSummary.count > 0
        ? 'keeps tradeable duplicate options open'
        : 'collection-first',
    confidence_preference: 'medium_to_high',
    inferred_intents: shortList(inferredIntents, 5) as CollectorIntent[],
  };
}

const makeInsight = (insight: Omit<MintyInsight, 'confidence' | 'confidence_score' | 'user_feedback_options'>): MintyInsight => {
  const confidenceScore = clampScore(insight.scoring.confidence_score);
  return {
    ...insight,
    confidence: getConfidence(confidenceScore),
    confidence_score: confidenceScore,
    user_feedback_options: DEFAULT_FEEDBACK_OPTIONS,
  };
};

function buildCandidateInsights(
  input: MintyHomeInsightInput,
  profile: CollectorPreferenceProfile,
  settings: MintyPersonalisationSettings
): MintyInsight[] {
  const trendConfidence = getTrendConfidenceScore(input);
  const movementStrength = marketStrengthScore(input.percentageChange, input.absoluteChange);
  const chaseCard = settings.useChaseList ? input.chaseCards?.[0] : undefined;
  const chaseName = getInsightCardName(chaseCard);
  const chaseSet = getInsightSetName(chaseCard);
  const activeBinder = input.activeBinder ?? null;
  const duplicateSummary = settings.useTradeHistory ? input.duplicateSummary ?? null : null;
  const topOwned = activeBinder?.topValueCards?.[0] ?? null;
  const missingCard = input.missingCards?.[0] ?? null;
  const dataThin = (input.trendData ?? []).filter((value) => Number.isFinite(value)).length < 3;
  const candidates: MintyInsight[] = [];

  if (chaseCard && input.percentageChange < -1) {
    candidates.push(makeInsight({
      id: `chase-dip:${chaseCard.cardId ?? chaseName}:${input.changePeriodLabel}`,
      title: 'Chase price window',
      body: `${chaseName} is on your radar, and your broader collection signal is softer ${input.changePeriodLabel.toLowerCase()}. If you want to pull it, sealed may be worth watching; if the single is the target, I would watch the card price before buying sealed. Confidence: ${getConfidence(trendConfidence)}.`,
      personalisation_reason: `Relevant because ${chaseName} is in your chase or watch list.`,
      related_user_goal: 'chasing_specific_card',
      related_cards: [chaseName],
      related_products: [`${chaseSet} singles`],
      recommended_route: 'watch_single_price',
      privacy_level: settings.personalisedInsights ? 'personalised' : 'general',
      tags: ['chase', 'single', 'market-dip'],
      scoring: {
        relevance_to_owned_cards: activeBinder ? 44 : 22,
        relevance_to_chase_list: 98,
        relevance_to_recent_views: settings.useViewingHistory ? 24 : 0,
        relevance_to_purchase_history: settings.usePurchaseHistory ? 18 : 0,
        market_movement_strength: movementStrength,
        confidence_score: Math.max(52, trendConfidence),
        potential_user_value: 96,
        freshness: 88,
        actionability: 94,
      },
    }));
  }

  if (chaseCard && input.percentageChange >= -1) {
    const characterName = getCharacterName(chaseName) || chaseName;
    candidates.push(makeInsight({
      id: `chase-cluster:${chaseCard.cardId ?? chaseName}:${input.changePeriodLabel}`,
      title: 'Chase relevance check',
      body: `Your interests are clustering around ${characterName} and ${chaseSet}. ${chaseName} still looks like a watch item, but I would use alerts until the signal is stronger. Confidence: ${dataThin ? 'Low' : getConfidence(trendConfidence)}.`,
      personalisation_reason: `Relevant because ${chaseName} is in your chase or watch list.`,
      related_user_goal: 'chasing_specific_card',
      related_cards: [chaseName],
      related_products: [`${chaseSet} singles`],
      recommended_route: dataThin ? 'set_price_alert' : 'watch_single_price',
      privacy_level: settings.personalisedInsights ? 'personalised' : 'general',
      tags: ['chase', 'single', 'market-watch'],
      scoring: {
        relevance_to_owned_cards: activeBinder ? 38 : 16,
        relevance_to_chase_list: 94,
        relevance_to_recent_views: settings.useViewingHistory ? 30 : 0,
        relevance_to_purchase_history: settings.usePurchaseHistory ? 16 : 0,
        market_movement_strength: Math.max(34, movementStrength),
        confidence_score: dataThin ? 30 : trendConfidence,
        potential_user_value: 78,
        freshness: 78,
        actionability: 76,
      },
    }));
  }

  if (chaseCard && duplicateSummary && duplicateSummary.count > 0) {
    const duplicateValue = duplicateSummary.estimatedValue;
    const valuePhrase = duplicateValue > 0
      ? `around \u00A3${duplicateValue.toFixed(duplicateValue >= 100 ? 0 : 2)} in duplicate value`
      : 'extra duplicate copies';
    candidates.push(makeInsight({
      id: `trade-up:${chaseCard.cardId ?? chaseName}:${duplicateSummary.count}`,
      title: 'Trade-up route',
      body: `You have ${valuePhrase} and ${chaseName} on your chase list. Those extras could help fund the chase without touching your main binder. Confidence: Medium.`,
      personalisation_reason: `Connects your duplicate pool to ${chaseName}.`,
      related_user_goal: 'trading_up',
      related_cards: [chaseName, ...shortList(duplicateSummary.items.map((card) => getInsightCardName(card)), 2)],
      related_products: [],
      recommended_route: 'trade_duplicates',
      privacy_level: 'personalised',
      tags: ['trade', 'duplicates', 'chase'],
      scoring: {
        relevance_to_owned_cards: 88,
        relevance_to_chase_list: 90,
        relevance_to_recent_views: 0,
        relevance_to_purchase_history: settings.usePurchaseHistory ? 24 : 0,
        market_movement_strength: Math.max(40, movementStrength),
        confidence_score: 66,
        potential_user_value: 90,
        freshness: 76,
        actionability: 92,
      },
    }));
  }

  if (activeBinder && activeBinder.missing > 0 && activeBinder.completionPercent >= 60) {
    const missingName = getInsightCardName(missingCard);
    const route = input.percentageChange < -1 ? 'This may be a better completion window' : 'Singles may still be the cleanest route';
    candidates.push(makeInsight({
      id: `binder-completion:${activeBinder.name}:${activeBinder.missing}`,
      title: 'Binder completion read',
      body: `You are ${activeBinder.missing} card${activeBinder.missing === 1 ? '' : 's'} away from ${activeBinder.name}. ${route}, especially around ${missingName}. Confidence: ${dataThin ? 'Low' : 'Medium'}.`,
      personalisation_reason: `Based on your ${activeBinder.name} binder progress.`,
      related_user_goal: 'completing_set',
      related_cards: missingCard ? [missingName] : [],
      related_products: [`${activeBinder.name} singles`],
      recommended_route: 'complete_with_singles',
      privacy_level: 'personalised',
      tags: ['binder', 'completion', 'single'],
      scoring: {
        relevance_to_owned_cards: 88,
        relevance_to_chase_list: chaseCard ? 34 : 0,
        relevance_to_recent_views: 0,
        relevance_to_purchase_history: settings.usePurchaseHistory ? 14 : 0,
        market_movement_strength: movementStrength,
        confidence_score: dataThin ? 38 : Math.max(54, trendConfidence),
        potential_user_value: 84,
        freshness: 72,
        actionability: 88,
      },
    }));
  }

  const upcomingRelease = settings.personalisedInsights ? findRelevantUpcomingRelease(input, profile, settings) : null;
  if (upcomingRelease) {
    const release = upcomingRelease.release;
    const matchedInterest = upcomingRelease.matchedCharacter ?? upcomingRelease.matchedSet ?? upcomingRelease.matchedEra ?? 'your collection interests';
    const timing = upcomingRelease.daysUntil == null
      ? 'coming up'
      : upcomingRelease.daysUntil < 0
        ? 'newly released'
        : upcomingRelease.daysUntil === 0
          ? 'releasing today'
          : `${upcomingRelease.daysUntil} day${upcomingRelease.daysUntil === 1 ? '' : 's'} away`;
    const forecastCard = chaseCard ?? topOwned ?? missingCard ?? null;
    const forecastDirection = release.expectedDirection ?? (release.signal === 'reprint_risk' ? 'volatile' : 'watch');
    const forecast = buildForecast({
      direction: forecastDirection,
      catalyst: release,
      card: forecastCard,
      fallbackValue: input.totalValue > 0 && input.ownedCount > 0 ? input.totalValue / input.ownedCount : null,
      basis: [
        `${release.name} catalyst`,
        `${matchedInterest} relevance`,
        dataThin ? 'thin current sold-data signal' : `${input.changePeriodLabel} collection movement`,
      ],
      horizonLabel: getForecastHorizon(upcomingRelease.daysUntil),
    });
    const percentBand = formatForecastPercentRange(forecast.estimatedImpactPctRange);
    const valueBand = formatForecastCurrencyRange(forecast.estimatedValueRange);
    const valuePhrase = valueBand ? ` Minty watch band: ${valueBand}.` : '';
    const releaseConfidence = clampScore(
      38 +
        Math.min(upcomingRelease.score, 70) * 0.45 +
        (profile.active_chases.length ? 8 : 0) +
        (release.source ? 6 : 0) -
        (dataThin ? 10 : 0)
    );

    candidates.push(makeInsight({
      id: `upcoming-release:${normaliseLookupText(release.name)}:${matchedInterest}`,
      title: release.signal === 'anniversary'
        ? '30th anniversary watch'
        : release.signal === 'mega_evolution'
          ? 'XY and Mega watch'
          : 'Upcoming catalyst watch',
      body: `${release.name} is ${timing} and overlaps with ${matchedInterest}. ${getForecastDirectionVerb(forecastDirection)}: ${percentBand}. ${releaseSignalCopy(release.signal)}.${valuePhrase} Confirm with sold comps before acting. Confidence: ${getConfidence(releaseConfidence)}.`,
      forecast,
      personalisation_reason: `Relevant because ${matchedInterest} appears in your collection, chase list or binder goals.`,
      related_user_goal: profile.active_chases.length ? 'chasing_specific_card' : 'watching_market',
      related_cards: shortList([matchedInterest, ...profile.high_interest_cards], 3),
      related_products: [release.name],
      recommended_route: 'set_price_alert',
      privacy_level: 'personalised',
      tags: ['upcoming-release', 'market-watch', release.signal ?? 'release-signal'],
      scoring: {
        relevance_to_owned_cards: activeBinder ? 54 : 28,
        relevance_to_chase_list: profile.active_chases.length ? 82 : 34,
        relevance_to_recent_views: settings.useViewingHistory ? 34 : 0,
        relevance_to_purchase_history: settings.usePurchaseHistory ? 24 : 0,
        market_movement_strength: Math.max(36, movementStrength),
        confidence_score: releaseConfidence,
        potential_user_value: 76,
        freshness: upcomingRelease.daysUntil == null ? 58 : upcomingRelease.daysUntil >= -14 && upcomingRelease.daysUntil <= 30 ? 90 : 72,
        actionability: 78,
      },
    }));

    if (release.signal === 'anniversary' || release.signal === 'reprint_risk') {
      const riskConfidence = clampScore(releaseConfidence - (dataThin ? 6 : 0));
      const riskForecast = buildForecast({
        direction: 'volatile',
        catalyst: {
          ...release,
          expectedDirection: 'volatile',
          estimatedImpactPctRange: [-10, 12],
        },
        card: forecastCard,
        fallbackValue: input.totalValue > 0 && input.ownedCount > 0 ? input.totalValue / input.ownedCount : null,
        basis: [
          'anniversary reprint risk',
          `${matchedInterest} nostalgia demand`,
          'modern reprints can add supply',
        ],
        horizonLabel: getForecastHorizon(upcomingRelease.daysUntil),
      });
      candidates.push(makeInsight({
        id: `reprint-risk:${normaliseLookupText(release.name)}:${matchedInterest}`,
        title: 'Reprint risk check',
        body: `${matchedInterest} has anniversary attention, but reprints can split the market. Scarce originals and strong grades may hold better; easy-to-replace modern copies can soften. Watch band: ${formatForecastPercentRange(riskForecast.estimatedImpactPctRange)}. Confidence: ${getConfidence(riskConfidence)}.`,
        forecast: riskForecast,
        personalisation_reason: `Relevant because ${matchedInterest} connects to the anniversary catalyst.`,
        related_user_goal: 'watching_market',
        related_cards: shortList([matchedInterest, ...profile.high_interest_cards], 3),
        related_products: [release.name],
        recommended_route: 'set_price_alert',
        privacy_level: 'personalised',
        tags: ['reprint-risk', 'anniversary', 'market-watch'],
        scoring: {
          relevance_to_owned_cards: activeBinder ? 58 : 34,
          relevance_to_chase_list: profile.active_chases.length ? 66 : 24,
          relevance_to_recent_views: settings.useViewingHistory ? 30 : 0,
          relevance_to_purchase_history: settings.usePurchaseHistory ? 20 : 0,
          market_movement_strength: Math.max(40, movementStrength),
          confidence_score: riskConfidence,
          potential_user_value: 82,
          freshness: upcomingRelease.daysUntil == null ? 58 : upcomingRelease.daysUntil >= -30 && upcomingRelease.daysUntil <= 120 ? 88 : 66,
          actionability: 84,
        },
      }));
    }
  }

  if (topOwned && !chaseCard) {
    const ownedName = getInsightCardName(topOwned);
    const ownedConfidence = dataThin ? 36 : Math.max(50, trendConfidence);
    candidates.push(makeInsight({
      id: `owned-hold:${topOwned.cardId ?? ownedName}:${input.changePeriodLabel}`,
      title: 'High-value hold check',
      body: `${ownedName} is one of your stronger owned cards. I would track nearby listings for context, but I would not suggest moving your only copy from the main collection. Confidence: ${getConfidence(ownedConfidence)}.`,
      personalisation_reason: `Linked to a high-value card already in your binder.`,
      related_user_goal: 'protecting_collection',
      related_cards: [ownedName],
      related_products: [],
      recommended_route: 'protect_high_value_card',
      privacy_level: 'personalised',
      tags: ['owned', 'protect', 'market-watch'],
      scoring: {
        relevance_to_owned_cards: 98,
        relevance_to_chase_list: 0,
        relevance_to_recent_views: settings.useViewingHistory ? 20 : 0,
        relevance_to_purchase_history: 0,
        market_movement_strength: movementStrength,
        confidence_score: ownedConfidence,
        potential_user_value: 84,
        freshness: 74,
        actionability: 72,
      },
    }));
  }

  if (dataThin && (chaseCard || activeBinder || topOwned)) {
    const relatedCard = chaseCard ? chaseName : topOwned ? getInsightCardName(topOwned) : getInsightCardName(missingCard);
    candidates.push(makeInsight({
      id: `thin-data:${relatedCard}:${input.changePeriodLabel}`,
      title: 'Low-confidence signal',
      body: `${relatedCard} looks relevant to your collection activity, but market data is thin right now. I would set an alert or watch another refresh before acting. Confidence: Low.`,
      personalisation_reason: `Relevant to ${profile.inferred_intents[0]?.replace(/_/g, ' ') ?? 'your collection activity'}.`,
      related_user_goal: chaseCard ? 'chasing_specific_card' : activeBinder ? 'completing_set' : 'watching_market',
      related_cards: relatedCard ? [relatedCard] : [],
      related_products: [],
      recommended_route: 'set_price_alert',
      privacy_level: settings.personalisedInsights ? 'personalised' : 'general',
      tags: ['low-confidence', 'watch', 'alert'],
      scoring: {
        relevance_to_owned_cards: activeBinder || topOwned ? 54 : 18,
        relevance_to_chase_list: chaseCard ? 74 : 0,
        relevance_to_recent_views: settings.useViewingHistory ? 16 : 0,
        relevance_to_purchase_history: 0,
        market_movement_strength: movementStrength,
        confidence_score: 28,
        potential_user_value: 56,
        freshness: 70,
        actionability: 72,
      },
    }));
  }

  candidates.push(makeInsight({
    id: `collection-market:${input.changePeriodLabel}:${input.ownedCount}`,
    title: 'Collection market read',
    body: input.ownedCount > 0
      ? `Your tracked collection is ${input.absoluteChange >= 0 ? 'holding firmer' : 'softer'} ${input.changePeriodLabel.toLowerCase()}. I will prioritise owned cards, chase targets and binder gaps before showing broader market noise. Confidence: ${getConfidence(trendConfidence)}.`
      : `Start adding owned or wanted cards and I can make this market read specific to your collection goals. Confidence: Low.`,
    personalisation_reason: input.ownedCount > 0
      ? `Based on ${input.ownedCount} owned card${input.ownedCount === 1 ? '' : 's'} and current value movement.`
      : 'No collection behaviour has been linked yet.',
    related_user_goal: 'watching_market',
    related_cards: shortList(profile.high_interest_cards, 2),
    related_products: [],
    recommended_route: 'hold_and_watch',
    privacy_level: input.ownedCount > 0 && settings.personalisedInsights ? 'personalised' : 'general',
    tags: ['owned', 'market-watch'],
    scoring: {
      relevance_to_owned_cards: input.ownedCount > 0 ? 70 : 0,
      relevance_to_chase_list: chaseCard ? 30 : 0,
      relevance_to_recent_views: 0,
      relevance_to_purchase_history: 0,
      market_movement_strength: movementStrength,
      confidence_score: trendConfidence,
      potential_user_value: 52,
      freshness: 70,
      actionability: 48,
    },
  }));

  return candidates;
}

export function buildMintyHomeInsight(
  input: MintyHomeInsightInput,
  settings: MintyPersonalisationSettings = DEFAULT_MINTY_PERSONALISATION_SETTINGS,
  feedback: MintyFeedbackProfile = DEFAULT_MINTY_FEEDBACK_PROFILE
): MintyInsight {
  const safeSettings = {
    ...DEFAULT_MINTY_PERSONALISATION_SETTINGS,
    ...settings,
  };
  const safeFeedback = {
    ...DEFAULT_MINTY_FEEDBACK_PROFILE,
    ...feedback,
    hiddenInsightIds: feedback.hiddenInsightIds ?? [],
    showLessTopics: feedback.showLessTopics ?? {},
    showMoreTopics: feedback.showMoreTopics ?? {},
  };
  const profile = buildCollectorPreferenceProfile(input, safeSettings, safeFeedback);
  const personalisationAllowed = safeSettings.personalisedInsights;
  const hasCatalystSignals = Boolean(input.upcomingReleases?.length || input.marketCatalysts?.length || safeSettings.useMarketCatalysts);
  const candidates = buildCandidateInsights(
    input,
    profile,
    personalisationAllowed
      ? safeSettings
      : {
          ...safeSettings,
          useChaseList: false,
          usePurchaseHistory: false,
          useTradeHistory: false,
          useViewingHistory: false,
          usePriceAlerts: false,
        }
  )
    .filter((insight) => !safeFeedback.hiddenInsightIds.includes(insight.id))
    .map((insight) => ({
      insight,
      total: scoreTotal(insight.scoring) +
        topicWeight(insight.tags, safeFeedback) +
        (input.percentageChange < -1 && insight.tags.includes('market-dip') ? 28 : 0) -
        (input.percentageChange < -1 && insight.tags.includes('duplicates') ? 10 : 0) +
        (!input.chaseCards?.length && insight.tags.includes('protect') ? 16 : 0) +
        (input.percentageChange < -1 && insight.tags.includes('completion') ? 24 : 0) +
        (hasCatalystSignals && insight.tags.includes('upcoming-release') ? 18 : 0) +
        (hasCatalystSignals && insight.tags.includes('anniversary') ? 16 : 0) +
        (hasCatalystSignals && insight.tags.includes('mega_evolution') ? 14 : 0) +
        (hasCatalystSignals && insight.tags.includes('reprint-risk') ? 12 : 0),
    }))
    .filter(({ insight, total }) => insight.privacy_level === 'general' || total >= 45)
    .sort((a, b) => b.total - a.total);

  const fallbackCandidates = buildCandidateInsights(input, profile, {
    ...safeSettings,
    useChaseList: false,
    usePurchaseHistory: false,
    useTradeHistory: false,
    useViewingHistory: false,
    usePriceAlerts: false,
  });

  return candidates[0]?.insight ?? fallbackCandidates[fallbackCandidates.length - 1];
}

export function applyMintyInsightFeedback(
  profile: MintyFeedbackProfile,
  insight: MintyInsight,
  feedbackType: MintyInsightFeedback
): MintyFeedbackProfile {
  const next: MintyFeedbackProfile = {
    hiddenInsightIds: [...new Set(profile.hiddenInsightIds ?? [])],
    showLessTopics: { ...(profile.showLessTopics ?? {}) },
    showMoreTopics: { ...(profile.showMoreTopics ?? {}) },
  };

  if (feedbackType === 'hide') {
    next.hiddenInsightIds = [...new Set([...next.hiddenInsightIds, insight.id])];
  }

  if (
    feedbackType === 'show_less' ||
    feedbackType === 'not_relevant' ||
    feedbackType === 'not_helpful' ||
    feedbackType === 'no_longer_relevant' ||
    feedbackType === 'hide'
  ) {
    for (const tag of insight.tags) {
      next.showLessTopics[tag] = (next.showLessTopics[tag] ?? 0) + 1;
    }
  }

  if (feedbackType === 'show_more' || feedbackType === 'useful') {
    for (const tag of insight.tags) {
      next.showMoreTopics[tag] = (next.showMoreTopics[tag] ?? 0) + 1;
    }
  }

  return next;
}
