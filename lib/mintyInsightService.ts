import { supabase } from './supabase';
import {
  getMintyInsightCategory,
  getMintyRecommendedActionLabel,
  type MintyInsight,
  type MintyInsightFeedback,
  type MintyInsightEvidenceSignal,
  type MintyRecommendedRoute,
} from './mintyInsights';

type MintyHomeRecommendedAction = NonNullable<MintyInsight['recommended_actions']>[number];

type MintyInsightRow = {
  id: string;
  user_id: string;
  stackr_card_id: string | null;
  recommendation: string;
  recommendation_label?: string | null;
  recommendation_score: number | null;
  confidence_score: number | null;
  confidence_label?: string | null;
  relevance_score?: number | null;
  input_snapshot_id?: string | null;
  structured_signals: any;
  narrative: any;
  recommended_actions?: any;
  data_limitations?: any;
  card_snapshot?: any;
  generated_at: string | null;
  expires_at: string | null;
  version: string | null;
};

export type MintyInsightLoadResult = {
  insight: MintyInsight | null;
  source: 'cache' | 'refreshed' | 'fallback' | 'none';
  updating: boolean;
  error?: string | null;
};

const confidenceToLegacy = (label?: string | null, score?: number | null): MintyInsight['confidence'] => {
  const normalised = String(label ?? '').toLowerCase();
  if (normalised.includes('very high') || normalised === 'high') return 'High';
  if (normalised.includes('moderate') || (typeof score === 'number' && score >= 50)) return 'Medium';
  return 'Low';
};

const toArray = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const plainRecommendationLabel = (recommendation?: string | null) => {
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
};

const hasTechnicalMintyCopy = (value?: string | null) =>
  /\b(source-quality|sold-price evidence|market data|demand, supply|marketplace and pricing signals|scored market metrics)\b/i.test(value ?? '');

const plainCachedSummary = (recommendation: string | null | undefined, cardName: string, currentBody: string) => {
  if (!hasTechnicalMintyCopy(currentBody)) return currentBody;
  switch (recommendation) {
    case 'strong_buy':
    case 'buy':
      return `${cardName} looks worth buying if the price fits your budget. Check recent sold prices before you commit.`;
    case 'watch':
      return `${cardName} is interesting, but I would not rush. Set an alert and wait for the next few sales.`;
    case 'hold':
      return `${cardName} looks steady. If you own it, I would keep it for now.`;
    case 'consider_selling':
    case 'sell':
      return `Recent patterns are weaker for ${cardName}. If this is a spare copy, compare recent sold prices and consider listing it.`;
    case 'avoid':
      return `I would skip ${cardName} for now unless it is a personal chase or grail.`;
    default:
      return `${cardName} matters to your collection, but there are not enough recent sold prices for confident advice yet.`;
  }
};

const routeForRecommendation = (recommendation?: string | null): MintyRecommendedRoute => {
  if (recommendation === 'sell' || recommendation === 'consider_selling') return 'watch_single_price';
  if (recommendation === 'buy' || recommendation === 'strong_buy') return 'watch_single_price';
  if (recommendation === 'insufficient_data') return 'set_price_alert';
  return 'hold_and_watch';
};

const signalToEvidence = (signal: any): MintyInsightEvidenceSignal | null => {
  const label = String(signal?.label ?? '').trim();
  const evidence = String(signal?.evidence ?? '').trim();
  if (!label || !evidence) return null;
  return {
    type: signal?.type === 'positive' || signal?.type === 'negative' ? signal.type : 'neutral',
    label,
    evidence,
    confidenceScore: typeof signal?.confidenceScore === 'number' ? signal.confidenceScore : undefined,
    confidenceLabel: signal?.confidenceLabel ?? undefined,
    source: 'market',
  };
};

export function mintyInsightRowToHomeInsight(row: MintyInsightRow): MintyInsight {
  const card = row.card_snapshot && typeof row.card_snapshot === 'object' ? row.card_snapshot : {};
  const narrative = row.narrative && typeof row.narrative === 'object' ? row.narrative : {};
  const signals = toArray(row.structured_signals);
  const positiveSignals = signals.filter((signal: any) => signal?.type === 'positive');
  const negativeSignals = signals.filter((signal: any) => signal?.type === 'negative');
  const cardName = card.name ?? card.cardName ?? 'This card';
  const recommendationLabel = row.recommendation_label ?? plainRecommendationLabel(row.recommendation);
  const title = hasTechnicalMintyCopy(narrative.headline) ? `${recommendationLabel}: ${cardName}` : narrative.headline ?? recommendationLabel;
  const rawBody = narrative.recommendationSummary
    ?? narrative.recommendation_summary
    ?? 'Minty checked your collection, recent prices, and listings. Wait for clearer recent sold prices before acting.';
  const body = plainCachedSummary(row.recommendation, cardName, rawBody);
  const recommendedRoute = routeForRecommendation(row.recommendation);
  const recommendedActions = toArray<MintyHomeRecommendedAction>(row.recommended_actions);
  const evidence = signals.map(signalToEvidence).filter(Boolean) as MintyInsightEvidenceSignal[];
  const tags = ['api-backed', row.recommendation, card.language ?? 'unknown-language'].filter(Boolean) as string[];
  const actionLabel = getMintyRecommendedActionLabel(recommendedRoute, {
    recommended_actions: recommendedActions,
    recommendation_label: row.recommendation_label ?? recommendationLabel,
  });

  return {
    id: row.id,
    title,
    body,
    action_label: actionLabel,
    explanation: body,
    evidence,
    data_refreshed_at: row.generated_at,
    source_context: 'market',
    confidence: confidenceToLegacy(row.confidence_label, row.confidence_score),
    confidence_score: Math.max(0, Math.min(100, Math.round(Number(row.confidence_score ?? 0)))),
    personalisation_reason: toArray<string>(narrative.whyMintyPickedThis ?? narrative.why_minty_picked_this).join(' ') || 'Minty compared this with your collection, active listings, and recent prices.',
    related_user_goal: row.recommendation === 'sell' || row.recommendation === 'consider_selling' ? 'selling_duplicate' : 'watching_market',
    related_cards: [cardName].filter(Boolean),
    related_products: [card.setName ?? card.set_name ?? ''].filter(Boolean),
    recommended_route: recommendedRoute,
    user_feedback_options: ['useful', 'not_helpful', 'no_longer_relevant', 'hide'],
    privacy_level: 'personalised',
    scoring: {
      relevance_to_owned_cards: Math.round(Number(row.relevance_score ?? 50)),
      relevance_to_chase_list: Math.round(Number(row.relevance_score ?? 50)),
      relevance_to_recent_views: 0,
      relevance_to_purchase_history: 0,
      market_movement_strength: Math.round(Number(row.recommendation_score ?? 0)),
      confidence_score: Math.round(Number(row.confidence_score ?? 0)),
      potential_user_value: Math.round(Number(row.recommendation_score ?? 0)),
      freshness: 82,
      actionability: toArray(row.recommended_actions).some((action: any) => action?.primary) ? 88 : 52,
    },
    tags,
    insight_category: getMintyInsightCategory({
      tags,
      recommendation: row.recommendation,
      recommended_route: recommendedRoute,
      related_user_goal: row.recommendation === 'sell' || row.recommendation === 'consider_selling' ? 'selling_duplicate' : 'watching_market',
    }),
    recommendation: row.recommendation,
    recommendation_label: row.recommendation_label ?? undefined,
    recommendation_score: row.recommendation_score ?? undefined,
    confidence_label: row.confidence_label ?? undefined,
    generated_at: row.generated_at,
    expires_at: row.expires_at,
    card_name: card.name ?? card.cardName ?? null,
    card_set_name: card.setName ?? card.set_name ?? null,
    card_image_url: card.imageUrl ?? card.image_url ?? null,
    opportunities: positiveSignals as MintyInsight['opportunities'],
    risks: negativeSignals as MintyInsight['risks'],
    supporting_signals: signals as MintyInsight['supporting_signals'],
    why_minty_picked_this: toArray<string>(narrative.whyMintyPickedThis ?? narrative.why_minty_picked_this),
    price_outlook: narrative.priceOutlook ?? narrative.price_outlook ?? undefined,
    recommended_actions: recommendedActions,
    data_limitations: toArray<string>(row.data_limitations ?? narrative.dataLimitations ?? narrative.data_limitations),
    narrative: {
      headline: title,
      recommendationSummary: body,
      opportunities: toArray<string>(narrative.opportunities),
      risks: toArray<string>(narrative.risks),
      whyMintyPickedThis: toArray<string>(narrative.whyMintyPickedThis ?? narrative.why_minty_picked_this),
      outlook: narrative.outlook ?? 'The next move depends on fresh recent sold prices.',
      limitationText: narrative.limitationText ?? narrative.limitation_text,
    },
    is_api_backed: true,
  };
}

export async function fetchLatestCachedMintyInsight(): Promise<MintyInsight | null> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data, error } = await supabase
    .from('minty_insights')
    .select('id, user_id, stackr_card_id, recommendation, recommendation_label, recommendation_score, confidence_score, confidence_label, relevance_score, input_snapshot_id, structured_signals, narrative, recommended_actions, data_limitations, card_snapshot, generated_at, expires_at, version')
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString())
    .order('relevance_score', { ascending: false })
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mintyInsightRowToHomeInsight(data as MintyInsightRow);
}

export async function refreshMintyInsight(options: { force?: boolean } = {}): Promise<MintyInsight | null> {
  const { data, error } = await supabase.functions.invoke('minty-insight', {
    body: { force: Boolean(options.force) },
  });

  if (error) throw new Error(error.message);
  const row = data?.insight ?? data?.record ?? data;
  if (!row) return null;
  return mintyInsightRowToHomeInsight(row as MintyInsightRow);
}

export async function loadMintyInsight(options: { forceRefresh?: boolean } = {}): Promise<MintyInsightLoadResult> {
  const cached = await fetchLatestCachedMintyInsight().catch(() => null);
  if (cached && !options.forceRefresh) {
    return { insight: cached, source: 'cache', updating: false };
  }

  try {
    const refreshed = await refreshMintyInsight({ force: options.forceRefresh });
    return { insight: refreshed ?? cached, source: refreshed ? 'refreshed' : cached ? 'cache' : 'none', updating: false };
  } catch (error) {
    return {
      insight: cached,
      source: cached ? 'cache' : 'none',
      updating: false,
      error: error instanceof Error ? error.message : 'Minty refresh unavailable',
    };
  }
}

export async function recordMintyInsightFeedback(
  insight: MintyInsight,
  feedback: MintyInsightFeedback
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('user_insight_interactions')
    .insert({
      user_id: user.id,
      insight_id: isUuid(insight.id) ? insight.id : null,
      interaction_type: feedback,
      recommendation: insight.recommendation ?? null,
      confidence_score: insight.confidence_score ?? null,
      data_snapshot: {
        recommendationScore: insight.recommendation_score ?? null,
        confidenceLabel: insight.confidence_label ?? insight.confidence,
        signals: insight.supporting_signals ?? [],
      },
    });
}
