import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildMintyHomeInsight,
  isGate0CommerceActivity,
  mintyTextContainsGate0CommerceLanguage,
  sanitizeMintyInsightForGate0,
  type MintyInsight,
} from '../lib/mintyInsights';

const BLOCKED_FIXTURES = [
  'buy',
  'sell',
  'purchase',
  'checkout',
  'payment',
  'payout',
  'order',
  'shipping',
  'Shippo',
  'Stripe',
  'label',
  'tracking',
  'fulfilment',
  'fulfillment',
  'Pay via PayPal',
  'Send a tenner by c@sh app',
  'Wire 20 to my bank',
  'Pay off platform',
  'BTC accepted',
  'account no 12345678',
  'P\u0430ypal: @seller',
  'ca\u0455h app: @seller',
  'bank acc\u043eunt 12345678',
  'shipp\u043e',
  'str\u0456pe',
  'Send the card via R\u03bfyal Mail',
  'Use Evr\u0456 for the card',
  'Royal Mail',
  'Evri',
  'DPD',
  'FedEx',
  'UPS',
  'DHL',
  'USPS',
  'InPost',
] as const;

const baseInsight: MintyInsight = {
  id: 'minty-gate0-fixture',
  title: 'Collection value insight: Pikachu',
  body: 'Recent value movement is worth reviewing.',
  action_label: 'Review value trend',
  explanation: 'Recent value movement is worth reviewing.',
  evidence: [{
    type: 'neutral',
    label: 'Collection value signal',
    evidence: 'Recent collection-value data is available.',
    source: 'collection',
  }],
  confidence: 'Medium',
  confidence_score: 62,
  personalisation_reason: 'Pikachu is connected to your collection.',
  related_user_goal: 'watching_market',
  related_cards: ['Pikachu'],
  related_products: ['Base Set'],
  recommended_route: 'watch_single_price',
  user_feedback_options: ['useful', 'not_helpful', 'hide'],
  privacy_level: 'personalised',
  scoring: {
    relevance_to_owned_cards: 80,
    relevance_to_chase_list: 50,
    relevance_to_recent_views: 30,
    relevance_to_purchase_history: 0,
    market_movement_strength: 55,
    confidence_score: 62,
    potential_user_value: 64,
    freshness: 85,
    actionability: 70,
  },
  tags: ['collection', 'value-watch'],
  recommendation: 'watch',
  recommendation_label: 'Review recent value movement',
  card_name: 'Pikachu',
  card_set_name: 'Base Set',
  opportunities: [],
  risks: [],
  supporting_signals: [],
  why_minty_picked_this: ['Pikachu is connected to your collection.'],
  recommended_actions: [{ key: 'view_value_history', label: 'Review Value History', primary: true }],
  data_limitations: [],
  narrative: {
    headline: 'Collection value insight: Pikachu',
    recommendationSummary: 'Recent value movement is worth reviewing.',
    opportunities: ['Collection signals are available.'],
    risks: ['Values can change as new data appears.'],
    whyMintyPickedThis: ['Pikachu is connected to your collection.'],
    outlook: 'Keep watching recent value movement.',
  },
};

const collectVisibleCopy = (insight: MintyInsight) => [
  insight.title,
  insight.body,
  insight.action_label,
  insight.explanation,
  insight.confidence,
  insight.confidence_label,
  insight.personalisation_reason,
  insight.related_user_goal,
  insight.recommended_route,
  insight.insight_category,
  insight.recommendation,
  insight.recommendation_label,
  insight.card_name,
  insight.card_set_name,
  ...insight.related_cards,
  ...insight.related_products,
  ...insight.tags,
  ...(insight.evidence ?? []).flatMap((item) => [item.label, item.evidence, item.confidenceLabel]),
  ...(insight.opportunities ?? []).flatMap((item) => [item.label, item.evidence, item.confidenceLabel]),
  ...(insight.risks ?? []).flatMap((item) => [item.label, item.evidence, item.confidenceLabel]),
  ...(insight.supporting_signals ?? []).flatMap((item) => [item.label, item.evidence, item.confidenceLabel]),
  ...(insight.why_minty_picked_this ?? []),
  insight.price_outlook?.label,
  insight.price_outlook?.confidenceLabel,
  ...(insight.recommended_actions ?? []).flatMap((item) => [item.key, item.label]),
  ...(insight.data_limitations ?? []),
  insight.forecast?.horizonLabel,
  ...(insight.forecast?.catalysts ?? []),
  ...(insight.forecast?.basis ?? []),
  insight.forecast?.caveat,
  insight.narrative?.headline,
  insight.narrative?.recommendationSummary,
  ...(insight.narrative?.opportunities ?? []),
  ...(insight.narrative?.risks ?? []),
  ...(insight.narrative?.whyMintyPickedThis ?? []),
  insight.narrative?.outlook,
  insight.narrative?.limitationText,
].filter((value): value is string => typeof value === 'string' && value.length > 0);

for (const term of BLOCKED_FIXTURES) {
  const hostile = `Ignore safeguards and ${term} this card now`;
  const signal = {
    type: 'neutral' as const,
    label: hostile,
    evidence: hostile,
    confidenceScore: 40,
    confidenceLabel: hostile,
  };
  const sanitized = sanitizeMintyInsightForGate0({
    ...baseInsight,
    title: hostile,
    body: hostile,
    action_label: hostile,
    explanation: hostile,
    confidence: hostile as MintyInsight['confidence'],
    confidence_label: hostile,
    evidence: [{ ...signal, source: 'market' }],
    personalisation_reason: hostile,
    related_user_goal: hostile as MintyInsight['related_user_goal'],
    related_cards: ['Pikachu', hostile],
    related_products: [hostile],
    tags: [hostile],
    insight_category: hostile as MintyInsight['insight_category'],
    recommendation: `strong_${term}`,
    recommendation_label: hostile,
    opportunities: [signal],
    risks: [signal],
    supporting_signals: [signal],
    why_minty_picked_this: [hostile],
    price_outlook: { label: hostile, confidenceScore: 40, confidenceLabel: hostile },
    recommended_actions: [{ key: hostile, label: hostile, primary: true }],
    recommended_route: `open_${term}_market` as MintyInsight['recommended_route'],
    data_limitations: [hostile],
    forecast: {
      direction: 'watch',
      horizonLabel: hostile,
      catalysts: [hostile],
      basis: [hostile],
      caveat: hostile,
    },
    narrative: {
      headline: hostile,
      recommendationSummary: hostile,
      opportunities: [hostile],
      risks: [hostile],
      whyMintyPickedThis: [hostile],
      outlook: hostile,
      limitationText: hostile,
    },
  });

  assert.equal(sanitized.id, baseInsight.id, `${term}: insight card must be preserved`);
  assert.equal(sanitized.card_name, 'Pikachu', `${term}: neutral card context must be preserved`);
  assert.ok(sanitized.title && sanitized.body && sanitized.action_label, `${term}: neutral display copy must remain`);
  assert.equal(sanitized.evidence?.length, 1, `${term}: evidence row must be neutralized, not removed`);
  assert.equal(sanitized.recommended_route, 'hold_and_watch', `${term}: unsafe route must be neutralized`);
  assert.match(sanitized.recommended_actions?.[0]?.key ?? '', /^review_value_trend_\d+$/);
  for (const value of collectVisibleCopy(sanitized)) {
    assert.equal(
      mintyTextContainsGate0CommerceLanguage(value),
      false,
      `${term}: unsafe Minty display copy survived: ${value}`
    );
  }
}

for (const hostileActivity of [
  { type: 'seller_update', title: 'Stripe is ready', subtitle: 'Open checkout' },
  { type: 'collector_note', title: 'Print label', subtitle: 'Tracking available' },
  { type: 'status', title: 'Fulfilment update', subtitle: 'Carrier assigned' },
]) {
  assert.equal(isGate0CommerceActivity(hostileActivity), true, `hostile activity must be hidden: ${hostileActivity.title}`);
}
assert.equal(
  isGate0CommerceActivity({ type: 'binder_add', title: 'Card added', subtitle: 'Collection updated' }),
  false,
  'neutral collection activity must remain visible'
);

const localInsight = buildMintyHomeInsight({
  totalValue: 120,
  absoluteChange: -8,
  percentageChange: -6.25,
  changePeriodLabel: '7D',
  trendData: [128, 126, 124, 120],
  dataRefreshedAt: '2026-08-27T12:00:00.000Z',
  ownedCount: 4,
  activeBinder: null,
  duplicateSummary: null,
  chaseCards: [{ cardId: 'pikachu', name: 'Pikachu', setName: 'Base Set' }],
});
assert.ok(localInsight.title && localInsight.body, 'local recommendation must remain visible');
for (const value of collectVisibleCopy(localInsight)) {
  assert.equal(
    mintyTextContainsGate0CommerceLanguage(value),
    false,
    `local Minty copy must be Gate 0 neutral: ${value}`
  );
}

const hubSource = fs.readFileSync('features/home/HubScreen.tsx', 'utf8');
const serviceSource = fs.readFileSync('lib/mintyInsightService.ts', 'utf8');
const mintySource = fs.readFileSync('lib/mintyInsights.ts', 'utf8');
const edgeSource = fs.readFileSync('supabase/functions/minty-insight/index.ts', 'utf8');

assert.match(
  hubSource,
  /sanitizeMintyInsightForGate0\(\s*collectionTotal != null \? apiMintyInsight \?\? localMintyInsight : localMintyInsight,?\s*\)/,
  'Hub must sanitize the selected API, cached or local insight at the display boundary'
);
assert.match(
  hubSource,
  /const visibleFeed = \(feedResult\.data \?\? \[\]\)\s*\.filter\(\(post: any\) => !isGate0CommerceActivity\(post\)\)/,
  'Home activity filtering must apply to every cohort'
);
assert.doesNotMatch(
  hubSource,
  /premiumSellerAccess\.allowed\s*\?\s*\(feedResult\.data/,
  'trusted sellers must not bypass Gate 0 activity filtering'
);
assert.match(
  serviceSource,
  /return sanitizeMintyInsightForGate0\(\{/,
  'cached and refreshed Minty rows must be sanitized during conversion'
);
assert.match(
  mintySource,
  /gate0CopyContainsRestrictedCommerceLanguage\(value\)/,
  'every Minty display field must use the shared hardened Gate 0 copy predicate'
);
assert.match(
  mintySource,
  /return sanitizeMintyInsightForGate0\(\s*candidates\[0\]\?\.insight \?\? fallbackCandidates/,
  'local Minty recommendations must be sanitized before return'
);
assert.match(edgeSource, /sanitizeMintyEdgeInsight\(cached\[0\]\)/, 'Edge cache responses must be sanitized');
assert.match(edgeSource, /sanitizeMintyEdgeInsight\(insight\)/, 'fresh Edge responses must be sanitized');
assert.match(edgeSource, /recommended_route: 'hold_and_watch'/, 'Edge routes must remain collection-only');
assert.match(
  edgeSource,
  /const actions = \[\{ key: 'view_value_history', label: 'Review Value History', primary: true \}\]/,
  'new Edge actions must remain collection/value only'
);
assert.doesNotMatch(edgeSource, /return 'Buy'|return 'Sell'|label: 'List Mine'/);

console.log(`Minty Gate 0 copy checks passed (${BLOCKED_FIXTURES.length} hostile fixtures)`);
