import { supabase } from './supabase';
import type { MintyInsight, MintyInsightFeedback } from './mintyInsights';

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

export function mintyInsightRowToHomeInsight(row: MintyInsightRow): MintyInsight {
  const card = row.card_snapshot && typeof row.card_snapshot === 'object' ? row.card_snapshot : {};
  const narrative = row.narrative && typeof row.narrative === 'object' ? row.narrative : {};
  const signals = toArray(row.structured_signals);
  const positiveSignals = signals.filter((signal: any) => signal?.type === 'positive');
  const negativeSignals = signals.filter((signal: any) => signal?.type === 'negative');
  const title = narrative.headline ?? row.recommendation_label ?? 'Minty Insight';
  const body = narrative.recommendationSummary
    ?? narrative.recommendation_summary
    ?? 'Minty has calculated a recommendation from your collection and market data.';

  return {
    id: row.id,
    title,
    body,
    confidence: confidenceToLegacy(row.confidence_label, row.confidence_score),
    confidence_score: Math.max(0, Math.min(100, Math.round(Number(row.confidence_score ?? 0)))),
    personalisation_reason: toArray<string>(narrative.whyMintyPickedThis ?? narrative.why_minty_picked_this).join(' ') || 'Minty ranked this from your collection, marketplace and pricing signals.',
    related_user_goal: row.recommendation === 'sell' || row.recommendation === 'consider_selling' ? 'selling_duplicate' : 'watching_market',
    related_cards: [card.name ?? card.cardName ?? ''].filter(Boolean),
    related_products: [card.setName ?? card.set_name ?? ''].filter(Boolean),
    recommended_route: row.recommendation === 'sell' || row.recommendation === 'consider_selling'
      ? 'watch_single_price'
      : row.recommendation === 'insufficient_data'
        ? 'set_price_alert'
        : 'hold_and_watch',
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
    tags: ['api-backed', row.recommendation, card.language ?? 'unknown-language'].filter(Boolean),
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
    recommended_actions: toArray(row.recommended_actions),
    data_limitations: toArray<string>(row.data_limitations ?? narrative.dataLimitations ?? narrative.data_limitations),
    narrative: {
      headline: title,
      recommendationSummary: body,
      opportunities: toArray<string>(narrative.opportunities),
      risks: toArray<string>(narrative.risks),
      whyMintyPickedThis: toArray<string>(narrative.whyMintyPickedThis ?? narrative.why_minty_picked_this),
      outlook: narrative.outlook ?? 'Outlook depends on fresh sold-price coverage.',
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
