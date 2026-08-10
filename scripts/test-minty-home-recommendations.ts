import {
  buildMintyHomeInsight,
  DEFAULT_MINTY_FEEDBACK_PROFILE,
  DEFAULT_MINTY_PERSONALISATION_SETTINGS,
  type MintyHomeInsightInput,
  type MintyInsight,
} from '../lib/mintyInsights';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const fixedRefresh = '2026-07-25T12:00:00.000Z';
const settings = {
  ...DEFAULT_MINTY_PERSONALISATION_SETTINGS,
  useMarketCatalysts: false,
};

const baseInput: MintyHomeInsightInput = {
  totalValue: 0,
  absoluteChange: 0,
  percentageChange: 0,
  changePeriodLabel: '7D',
  trendData: [],
  dataRefreshedAt: fixedRefresh,
  ownedCount: 0,
  activeBinder: null,
  duplicateSummary: null,
  chaseCards: [],
  wantedCards: [],
  recentViews: [],
  recentSearches: [],
  priceAlerts: [],
  missingCards: [],
  recentActivity: [],
  marketplaceMatchCount: 0,
};

const validateInsightContract = (label: string, insight: MintyInsight) => {
  assert(Boolean(insight.title?.trim()), `${label}: missing headline`);
  assert(Boolean(insight.action_label?.trim()), `${label}: missing recommended action`);
  assert(Boolean(insight.explanation?.trim() || insight.body?.trim()), `${label}: missing explanation`);
  assert(Array.isArray(insight.evidence) && insight.evidence.length > 0, `${label}: missing evidence`);
  assert(['Low', 'Medium', 'High'].includes(insight.confidence), `${label}: invalid confidence`);
  assert(Boolean(insight.data_refreshed_at), `${label}: missing refreshed timestamp`);
  assert(!/guarantee|guaranteed return|certain profit/i.test(insight.body), `${label}: over-confident language`);
};

const build = (input: MintyHomeInsightInput) =>
  buildMintyHomeInsight(input, settings, DEFAULT_MINTY_FEEDBACK_PROFILE);

const newUser = build(baseInput);
validateInsightContract('new user with no history', newUser);
assert(newUser.confidence === 'Low', 'new user should stay low confidence');

const searchOnly = build({
  ...baseInput,
  totalValue: 0,
  percentageChange: -2.4,
  absoluteChange: -3,
  trendData: [44, 43.5, 42.8],
  recentSearches: [{ cardId: 'mudkip-ir', name: 'Mudkip Illustration Rare', setName: 'Prismatic Evolutions' }],
});
validateInsightContract('user with only search history', searchOnly);
assert(searchOnly.confidence !== 'High', 'search-only insight should not be high confidence');
assert(searchOnly.related_cards.includes('Mudkip Illustration Rare'), 'search-only insight should name the searched card');

const establishedCollection = build({
  ...baseInput,
  totalValue: 420,
  absoluteChange: 18,
  percentageChange: 4.5,
  trendData: [382, 390, 404, 414, 420],
  ownedCount: 26,
  activeBinder: {
    name: 'Temporal Forces',
    owned: 92,
    total: 162,
    missing: 70,
    completionPercent: 57,
    topValueCards: [{ cardId: 'walking-wake-sir', name: 'Walking Wake ex', setName: 'Temporal Forces', estimatedValue: 58 }],
  },
});
validateInsightContract('established collection', establishedCollection);

const chaseCards = build({
  ...baseInput,
  totalValue: 180,
  absoluteChange: -12,
  percentageChange: -5.2,
  trendData: [202, 198, 192, 188, 180],
  ownedCount: 8,
  chaseCards: [{ cardId: 'greninja-sir', name: 'Greninja ex', setName: 'Twilight Masquerade', estimatedValue: 210 }],
});
validateInsightContract('user with chase cards', chaseCards);
assert(chaseCards.related_user_goal === 'chasing_specific_card', 'chase insight should stay chase-focused');

const incompleteBinder = build({
  ...baseInput,
  totalValue: 320,
  absoluteChange: 0,
  percentageChange: 0,
  trendData: [320, 320, 320, 320],
  ownedCount: 118,
  activeBinder: {
    name: 'Surging Sparks',
    owned: 188,
    total: 204,
    missing: 16,
    completionPercent: 92,
    topValueCards: [{ cardId: 'pikachu-ex-sir', name: 'Pikachu ex', setName: 'Surging Sparks', estimatedValue: 180 }],
  },
  missingCards: [{ cardId: 'latias-ex', name: 'Latias ex', setName: 'Surging Sparks' }],
});
validateInsightContract('user with incomplete binders', incompleteBinder);
assert(incompleteBinder.recommended_route === 'complete_with_singles', 'incomplete binder should recommend singles completion');

const marketUnavailableFallback = build({
  ...baseInput,
  totalValue: 120,
  ownedCount: 10,
  trendData: [],
  dataRefreshedAt: fixedRefresh,
});
validateInsightContract('market API unavailable', marketUnavailableFallback);
assert(marketUnavailableFallback.confidence === 'Low', 'market-unavailable fallback should be low confidence');

const unchangedA = build({
  ...baseInput,
  totalValue: 420,
  absoluteChange: 18,
  percentageChange: 4.5,
  trendData: [382, 390, 404, 414, 420],
  ownedCount: 26,
  dataRefreshedAt: fixedRefresh,
});
const unchangedB = build({
  ...baseInput,
  totalValue: 420,
  absoluteChange: 18,
  percentageChange: 4.5,
  trendData: [382, 390, 404, 414, 420],
  ownedCount: 26,
  dataRefreshedAt: fixedRefresh,
});
validateInsightContract('market data unchanged', unchangedA);
assert(
  unchangedA.id === unchangedB.id &&
    unchangedA.title === unchangedB.title &&
    unchangedA.action_label === unchangedB.action_label &&
    unchangedA.data_refreshed_at === unchangedB.data_refreshed_at,
  'unchanged market data should produce a stable cached-style recommendation'
);

const majorPriceMove = build({
  ...baseInput,
  totalValue: 900,
  absoluteChange: -115,
  percentageChange: -11.3,
  trendData: [1015, 990, 955, 932, 910, 900],
  ownedCount: 44,
  activeBinder: {
    name: 'Paldea Evolved',
    owned: 160,
    total: 193,
    missing: 33,
    completionPercent: 82,
    topValueCards: [{ cardId: 'magikarp-ir', name: 'Magikarp', setName: 'Paldea Evolved', estimatedValue: 125 }],
  },
});
validateInsightContract('major price movement detected', majorPriceMove);
assert(majorPriceMove.evidence?.length, 'major price movement should still include supporting evidence');

const conflictingSignals = build({
  ...baseInput,
  totalValue: 260,
  absoluteChange: 16,
  percentageChange: 6.1,
  trendData: [244, 260],
  ownedCount: 6,
  chaseCards: [{ cardId: 'ogerpon-sir', name: 'Ogerpon ex', setName: 'Twilight Masquerade', estimatedValue: 88 }],
  recentSearches: [{ cardId: 'ogerpon-sir', name: 'Ogerpon ex', setName: 'Twilight Masquerade', estimatedValue: 88 }],
});
validateInsightContract('conflicting signals', conflictingSignals);
assert(conflictingSignals.confidence !== 'High', 'conflicting or thin signals should not produce high confidence');

console.log('Minty home recommendation scenario checks passed');
