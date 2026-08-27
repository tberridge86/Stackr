// @ts-nocheck

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EBAY_BROWSE_TOKEN = Deno.env.get('EBAY_BROWSE_TOKEN') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const NARRATIVE_MODEL = Deno.env.get('MINTY_NARRATIVE_MODEL') ?? 'gpt-4.1-mini';

type Recommendation =
  | 'strong_buy'
  | 'buy'
  | 'watch'
  | 'hold'
  | 'consider_selling'
  | 'sell'
  | 'avoid'
  | 'insufficient_data';

type Signal = {
  type: 'positive' | 'negative' | 'neutral';
  label: string;
  evidence: string;
  confidenceScore: number;
  confidenceLabel: string;
};

const nowIso = () => new Date().toISOString();
const daysAgo = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
const numeric = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : Number.isFinite(Number(value)) ? Number(value) : fallback;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

async function rest(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Supabase service environment is not configured.');
  const headers = new Headers(init.headers ?? {});
  headers.set('apikey', SERVICE_ROLE_KEY);
  headers.set('Authorization', `Bearer ${SERVICE_ROLE_KEY}`);
  if (!headers.has('Content-Type') && init.method && init.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Prefer') && init.method && init.method !== 'GET') {
    headers.set('Prefer', 'return=representation');
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase REST ${response.status}: ${text}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function getUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function confidenceLabel(score: number) {
  if (score >= 85) return 'Very High';
  if (score >= 70) return 'High';
  if (score >= 50) return 'Moderate';
  if (score >= 30) return 'Low';
  return 'Very Low';
}

function recommendationLabel(recommendation: Recommendation) {
  switch (recommendation) {
    case 'strong_buy':
      return 'Strong value signal';
    case 'buy':
      return 'Positive value signal';
    case 'watch':
      return 'Worth watching';
    case 'hold':
      return 'Steady value signal';
    case 'consider_selling':
      return 'Value shift to review';
    case 'sell':
      return 'Value trend to review';
    case 'avoid':
      return 'Use caution for now';
    default:
      return 'Not enough reliable data';
  }
}

const MINTY_GATE0_COMMERCE_LANGUAGE = /\b(?:buy(?:s|ing)?|bought|sell(?:s|ing)?|sold|sales?|purchas(?:e|es|ed|ing)|checkout|payments?|payouts?|order(?:s|ed|ing)?|ship(?:s|ping|ped|ments?)|deliver(?:y|ies|ed|ing)|carriers?|postage|labels?|tracking|fulfil(?:ment|ments|led|ling)?|fulfill(?:ment|ments|ed|ing)?|shippo|stripe)\b/i;
const MINTY_GATE0_SUMMARY = 'Minty noticed a change in recent collection and value signals. Review the latest trend and keep watching how this card moves.';

function hasGate0CommerceLanguage(value: unknown) {
  return MINTY_GATE0_COMMERCE_LANGUAGE.test(
    String(value ?? '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  );
}

function gate0SafeText(value: unknown, fallback: string) {
  const text = String(value ?? '').trim();
  return text && !hasGate0CommerceLanguage(text) ? text : fallback;
}

function gate0SafeList(value: unknown, fallback: string) {
  return Array.isArray(value) ? value.map((item) => gate0SafeText(item, fallback)) : [];
}

function sanitizeMintyNarrative(value: unknown, cardName: string) {
  const narrative = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const safeName = gate0SafeText(cardName, 'this card');
  return {
    headline: gate0SafeText(narrative.headline, `Collection value insight: ${safeName}`),
    recommendationSummary: gate0SafeText(narrative.recommendationSummary, MINTY_GATE0_SUMMARY),
    opportunities: gate0SafeList(narrative.opportunities, 'Recent collection and value signals are available to review.'),
    risks: gate0SafeList(narrative.risks, 'Values can change as new information appears.'),
    whyMintyPickedThis: gate0SafeList(
      narrative.whyMintyPickedThis,
      'This card is connected to your collection and recent value activity.'
    ),
    outlook: gate0SafeText(narrative.outlook, 'Keep watching recent value movement as new data appears.'),
    limitationText: narrative.limitationText
      ? gate0SafeText(narrative.limitationText, 'Some collection or value signals may be incomplete.')
      : undefined,
  };
}

function sanitizeMintySignal(value: unknown) {
  const signal = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    type: signal.type === 'positive' || signal.type === 'negative' ? signal.type : 'neutral',
    label: gate0SafeText(signal.label, 'Collection value signal'),
    evidence: gate0SafeText(signal.evidence, 'Recent collection and value data is available to review.'),
    confidenceScore: numeric(signal.confidenceScore),
    confidenceLabel: gate0SafeText(signal.confidenceLabel, 'Low'),
  };
}

function sanitizeMintyEdgeInsight(value: unknown) {
  if (!value || typeof value !== 'object') return value;
  const insight = value as Record<string, unknown>;
  const cardSnapshot = insight.card_snapshot && typeof insight.card_snapshot === 'object'
    ? insight.card_snapshot as Record<string, unknown>
    : {};
  const safeCardName = gate0SafeText(cardSnapshot.name, 'this card');
  return {
    ...insight,
    recommendation: hasGate0CommerceLanguage(insight.recommendation) ? 'watch' : insight.recommendation,
    recommendation_label: gate0SafeText(insight.recommendation_label, 'Review recent value movement'),
    recommended_route: 'hold_and_watch',
    structured_signals: Array.isArray(insight.structured_signals)
      ? insight.structured_signals.map(sanitizeMintySignal)
      : [],
    narrative: sanitizeMintyNarrative(insight.narrative, safeCardName),
    recommended_actions: [{ key: 'view_value_history', label: 'Review Value History', primary: true }],
    data_limitations: gate0SafeList(insight.data_limitations, 'Some collection or value signals may be incomplete.'),
    card_snapshot: {
      ...cardSnapshot,
      name: safeCardName,
      setName: gate0SafeText(cardSnapshot.setName, 'Collection set'),
    },
  };
}

function makeSignal(type: Signal['type'], label: string, evidence: string, confidenceScore: number): Signal {
  const score = clamp(confidenceScore);
  return {
    type,
    label,
    evidence,
    confidenceScore: score,
    confidenceLabel: confidenceLabel(score),
  };
}

function extractCardName(card: Record<string, unknown> | null) {
  if (!card) return 'Unknown card';
  const rawData = typeof card.raw_data === 'object' && card.raw_data ? card.raw_data as Record<string, unknown> : {};
  return String(card.name ?? rawData.name ?? rawData.englishName ?? rawData.japaneseName ?? 'Unknown card');
}

function extractSetName(card: Record<string, unknown> | null) {
  if (!card) return null;
  const rawData = typeof card.raw_data === 'object' && card.raw_data ? card.raw_data as Record<string, unknown> : {};
  const set = typeof rawData.set === 'object' && rawData.set ? rawData.set as Record<string, unknown> : {};
  return String(rawData.setName ?? rawData.japaneseSetName ?? set.name ?? card.set_id ?? '') || null;
}

function extractImageUrl(card: Record<string, unknown> | null) {
  if (!card) return null;
  const images = typeof card.images === 'object' && card.images ? card.images as Record<string, unknown> : {};
  const rawData = typeof card.raw_data === 'object' && card.raw_data ? card.raw_data as Record<string, unknown> : {};
  const rawImages = typeof rawData.images === 'object' && rawData.images ? rawData.images as Record<string, unknown> : {};
  return String(images.small ?? images.large ?? rawImages.small ?? rawImages.large ?? rawData.imageUrl ?? '') || null;
}

function observationDateMs(observation: Record<string, unknown>) {
  const value = observation.sold_at ?? observation.observed_at ?? observation.created_at;
  const ms = value ? Date.parse(String(value)) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function cleanObservations(observations: Record<string, unknown>[]) {
  const unique = new Map<string, Record<string, unknown>>();
  for (const observation of observations) {
    const price = numeric(observation.converted_price_gbp);
    if (price <= 0) continue;
    const key = [
      observation.source,
      observation.source_type,
      observation.listing_url,
      observation.sold_at,
      price.toFixed(2),
    ].join(':');
    if (!unique.has(key)) unique.set(key, observation);
  }

  const rows = [...unique.values()];
  const prices = rows.map((row) => numeric(row.converted_price_gbp)).filter((value) => value > 0);
  const centre = median(prices);
  if (!centre) return { included: rows, outlierRate: 0 };
  const deviations = prices.map((price) => Math.abs(price - centre));
  const mad = median(deviations) ?? 0;
  if (mad === 0) return { included: rows, outlierRate: 0 };
  const included = rows.filter((row) => Math.abs(numeric(row.converted_price_gbp) - centre) / mad <= 6);
  return {
    included,
    outlierRate: rows.length ? (rows.length - included.length) / rows.length : 0,
  };
}

function sourceAgreement(prices: number[]) {
  if (prices.length < 2) return prices.length === 1 ? 52 : 0;
  const med = median(prices) ?? 0;
  if (med <= 0) return 0;
  const averageDeviation = prices.reduce((sum, price) => sum + Math.abs(price - med), 0) / prices.length;
  return clamp(100 - (averageDeviation / med) * 160);
}

function calculateChangePercent(recent: number[], previous: number[]) {
  const recentMedian = median(recent);
  const previousMedian = median(previous);
  if (!recentMedian || !previousMedian) return null;
  return ((recentMedian - previousMedian) / previousMedian) * 100;
}

function scoreRecommendation(metrics: Record<string, unknown>, marketplace: Record<string, unknown>) {
  const priceMomentum = clamp(50 + numeric(metrics.change30dPercent) * 2.1 + numeric(metrics.change7dPercent) * 0.9 - numeric(metrics.volatility) * 0.25);
  const demandGrowth = clamp(
    42 +
      numeric(metrics.favouriteGrowth30d) * 1.2 +
      numeric(metrics.chaseGrowth30d) * 1.4 +
      numeric(metrics.collectionGrowth30d) * 0.8 +
      Math.min(28, numeric(marketplace.favouriteCount) * 0.8 + numeric(marketplace.offerCount) * 1.4 + numeric(marketplace.chaseCount) * 1.2)
  );
  const activeSupply = numeric(metrics.activeSupply);
  const confirmedSales30d = numeric(metrics.confirmedSales30d);
  const confirmedSales7d = numeric(metrics.confirmedSales7d);
  const supplyPressure = clamp(70 - Math.max(0, activeSupply - confirmedSales30d) * 2.2 - Math.max(0, numeric(metrics.newListings7d) - confirmedSales7d) * 2.8 + numeric(metrics.sellThroughRate) * 40);
  const liquidity = clamp(numeric(metrics.liquidity));
  const listingGap = metrics.listingToSaleGapPercent == null ? 46 : clamp(58 - numeric(metrics.listingToSaleGapPercent) * 0.9);
  const agreement = clamp(numeric(metrics.sourceAgreement));
  const stackrInterest = clamp(35 + numeric(marketplace.favouriteCount) * 1.2 + numeric(marketplace.offerCount) * 2 + numeric(marketplace.listingViews) * 0.08 + numeric(metrics.collectionGrowth30d) * 0.6 + numeric(metrics.chaseGrowth30d) * 0.8);
  return clamp(
    priceMomentum * 0.2 +
      demandGrowth * 0.2 +
      supplyPressure * 0.15 +
      liquidity * 0.15 +
      listingGap * 0.15 +
      agreement * 0.1 +
      stackrInterest * 0.05
  );
}

function dataQuality(metrics: Record<string, unknown>) {
  return clamp(
    Math.min(35, numeric(metrics.confirmedSales30d) * 3 + numeric(metrics.confirmedSales7d) * 2) +
      Math.min(20, numeric(metrics.sourceCount) * 8) +
      numeric(metrics.dataFreshness) * 0.18 +
      numeric(metrics.sourceAgreement) * 0.16 +
      numeric(metrics.matchConfidence) * 0.14 -
      numeric(metrics.outlierRate) * 35
  );
}

function confidenceScore(metrics: Record<string, unknown>, hasSoldData: boolean) {
  return clamp(dataQuality(metrics) + (hasSoldData ? 10 : -18) + numeric(metrics.liquidity) * 0.18);
}

function decide(score: number, confidence: number, quality: number): Recommendation {
  if (quality < 35) return 'insufficient_data';
  if (score >= 80 && confidence >= 75) return 'strong_buy';
  if (score >= 65 && confidence >= 60) return 'buy';
  if (score >= 50) return 'watch';
  if (score >= 40) return 'hold';
  if (score >= 25) return 'consider_selling';
  if (score >= 18) return 'sell';
  return 'avoid';
}

async function fetchEbayActiveObservations(card: Record<string, unknown> | null) {
  if (!EBAY_BROWSE_TOKEN || !card) return { observations: [], warnings: [] };
  const name = extractCardName(card);
  const setName = extractSetName(card);
  const query = encodeURIComponent([name, setName, 'Pokemon card'].filter(Boolean).join(' '));
  try {
    const response = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${query}&limit=20`, {
      headers: {
        Authorization: `Bearer ${EBAY_BROWSE_TOKEN}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
      },
    });
    if (!response.ok) {
      return { observations: [], warnings: [`eBay active listing lookup failed with ${response.status}.`] };
    }
    const payload = await response.json();
    const rows = Array.isArray(payload.itemSummaries) ? payload.itemSummaries : [];
    const observations = rows
      .map((item: Record<string, unknown>) => {
        const price = typeof item.price === 'object' && item.price ? item.price as Record<string, unknown> : {};
        const amount = numeric(price.value);
        const currency = String(price.currency ?? 'GBP').toUpperCase();
        if (amount <= 0 || currency !== 'GBP') return null;
        return {
          id: crypto.randomUUID(),
          stackr_card_id: card.id,
          language: String(card.language ?? 'en'),
          source: 'ebay_browse',
          source_type: 'active_listing',
          original_price: amount,
          original_currency: currency,
          converted_price_gbp: amount,
          observed_at: nowIso(),
          listing_url: item.itemWebUrl ?? null,
          shipping_included: false,
          verified_sale: false,
          match_confidence: 55,
          raw_payload: item,
        };
      })
      .filter(Boolean);
    return { observations, warnings: [] };
  } catch (error) {
    return { observations: [], warnings: [`eBay active listing lookup failed: ${error instanceof Error ? error.message : 'unknown error'}.`] };
  }
}

function buildMetrics(input: {
  card: Record<string, unknown>;
  observations: Record<string, unknown>[];
  stackrListings: Record<string, unknown>[];
  watchRows: Record<string, unknown>[];
  ownedRows: Record<string, unknown>[];
  snapshotRows: Record<string, unknown>[];
}) {
  const { included, outlierRate } = cleanObservations(input.observations);
  const now = Date.now();
  const sold = included.filter((row) => row.source_type === 'sold_listing' && row.verified_sale === true);
  const active = included.filter((row) => row.source_type === 'active_listing' || row.source_type === 'market_price');
  const stackrActivePrices = input.stackrListings
    .filter((row) => row.listing_status === 'active')
    .map((row) => numeric(row.asking_price ?? row.listing_price ?? row.market_estimate))
    .filter((value) => value > 0);
  const sold30 = sold.filter((row) => observationDateMs(row) >= daysAgo(30));
  const sold7 = sold.filter((row) => observationDateMs(row) >= daysAgo(7));
  const sold90 = sold.filter((row) => observationDateMs(row) >= daysAgo(90));
  const sold31to90 = sold.filter((row) => observationDateMs(row) < daysAgo(30) && observationDateMs(row) >= daysAgo(90));
  const sold8to30 = sold.filter((row) => observationDateMs(row) < daysAgo(7) && observationDateMs(row) >= daysAgo(30));
  const recentSoldPrices = sold30.map((row) => numeric(row.converted_price_gbp));
  const previousSoldPrices = sold31to90.map((row) => numeric(row.converted_price_gbp));
  const activePrices = [
    ...active.map((row) => numeric(row.converted_price_gbp)),
    ...stackrActivePrices,
  ].filter((value) => value > 0);
  const medianSoldGbp = median(recentSoldPrices) ?? median(sold90.map((row) => numeric(row.converted_price_gbp)));
  const medianActiveListingGbp = median(activePrices);
  const latestObservationMs = Math.max(0, ...included.map(observationDateMs), ...input.snapshotRows.map((row) => Date.parse(String(row.snapshot_at ?? row.created_at ?? '')) || 0));
  const freshness = latestObservationMs ? clamp(100 - ((now - latestObservationMs) / (24 * 60 * 60 * 1000)) * 4) : 0;
  const activeSupply = input.stackrListings.filter((row) => row.listing_status === 'active').length + active.filter((row) => observationDateMs(row) >= daysAgo(14)).length;
  const sellThroughRate = activeSupply + sold30.length > 0 ? sold30.length / (activeSupply + sold30.length) : null;
  const listingToSaleGapPercent = medianSoldGbp && medianActiveListingGbp
    ? ((medianActiveListingGbp - medianSoldGbp) / medianSoldGbp) * 100
    : null;
  const allComparablePrices = [...recentSoldPrices, ...activePrices];
  const med = median(allComparablePrices);
  const volatility = med ? (allComparablePrices.reduce((sum, value) => sum + Math.abs(value - med), 0) / Math.max(1, allComparablePrices.length)) / med * 100 : null;
  const sources = new Set(included.map((row) => String(row.source ?? 'unknown')));
  if (input.stackrListings.length) sources.add('stackr_marketplace');
  const marketplace = {
    activeListingCount: input.stackrListings.filter((row) => row.listing_status === 'active').length,
    completedSaleCount: input.stackrListings.filter((row) => row.listing_status === 'sold').length,
    medianCompletedSaleGbp: null,
    medianActiveListingGbp,
    favouriteCount: input.watchRows.length,
    offerCount: input.stackrListings.reduce((sum, row) => sum + numeric(row.offer_count), 0),
    listingViews: input.stackrListings.reduce((sum, row) => sum + numeric(row.view_count), 0),
    chaseCount: input.watchRows.length,
    collectionAdds30d: input.ownedRows.filter((row) => Date.parse(String(row.updated_at ?? row.created_at ?? '')) >= daysAgo(30)).length,
  };
  const metrics = {
    stackrCardId: String(input.card.id),
    language: String(input.card.language ?? 'en'),
    rawOrGraded: 'raw',
    grader: null,
    grade: null,
    medianSoldGbp,
    medianActiveListingGbp,
    change7dPercent: calculateChangePercent(sold7.map((row) => numeric(row.converted_price_gbp)), sold8to30.map((row) => numeric(row.converted_price_gbp))),
    change30dPercent: calculateChangePercent(recentSoldPrices, previousSoldPrices),
    change90dPercent: null,
    activeSupply,
    newListings7d: active.filter((row) => observationDateMs(row) >= daysAgo(7)).length,
    confirmedSales7d: sold7.length,
    confirmedSales30d: sold30.length,
    sellThroughRate,
    medianTimeToSellDays: null,
    listingToSaleGapPercent,
    volatility,
    favouriteGrowth30d: null,
    collectionGrowth30d: marketplace.collectionAdds30d,
    chaseGrowth30d: null,
    liquidity: clamp(sold30.length * 8 + numeric(sellThroughRate) * 40),
    dataFreshness: freshness,
    sourceAgreement: sourceAgreement(allComparablePrices),
    outlierRate,
    sourceCount: sources.size,
    matchConfidence: included.length ? Math.max(...included.map((row) => numeric(row.match_confidence, 55))) : 45,
  };
  return { metrics, marketplace };
}

function buildSignals(metrics: Record<string, unknown>, marketplace: Record<string, unknown>) {
  const signals: Signal[] = [];
  const change30d = metrics.change30dPercent == null ? null : numeric(metrics.change30dPercent);
  if (change30d != null) {
    signals.push(makeSignal(
      change30d >= 0 ? 'positive' : 'negative',
      change30d >= 0 ? 'Price momentum is positive' : 'Price momentum is softening',
      `Thirty-day movement is ${change30d > 0 ? '+' : ''}${change30d.toFixed(1)}%.`,
      change30d >= 0 ? 62 : 55
    ));
  }
  if (numeric(metrics.confirmedSales30d) > 0) {
    signals.push(makeSignal('positive', 'Recent value observations exist', `${metrics.confirmedSales30d} verified value observations are available from the last 30 days.`, 62 + Math.min(25, numeric(metrics.confirmedSales30d) * 2)));
  } else {
    signals.push(makeSignal('negative', 'Recent value coverage is limited', 'No verified value observations were found in the current 30-day window.', 36));
  }
  if (numeric(metrics.activeSupply) > 0) {
    signals.push(makeSignal(
      numeric(metrics.activeSupply) > numeric(metrics.confirmedSales30d) * 2 ? 'negative' : 'neutral',
      'Active supply check',
      `${metrics.activeSupply} active references against ${metrics.confirmedSales30d} recent value observations.`,
      54
    ));
  }
  if (numeric(marketplace.favouriteCount) || numeric(marketplace.chaseCount)) {
    signals.push(makeSignal('positive', 'StackR collector interest', `${marketplace.favouriteCount} favourites and ${marketplace.chaseCount} chase markers in StackR.`, 58));
  }
  if (numeric(metrics.sourceAgreement) < 45) {
    signals.push(makeSignal('negative', 'Sources disagree', 'Pricing sources are not closely aligned, so Minty reduces confidence.', numeric(metrics.sourceAgreement)));
  }
  if (numeric(metrics.outlierRate) > 0.25) {
    signals.push(makeSignal('negative', 'Outlier rate is high', `${Math.round(numeric(metrics.outlierRate) * 100)}% of observations were excluded as outliers or unreliable.`, 42));
  }
  return signals;
}

function buildFallbackNarrative(input: {
  name: string;
  recommendationLabel: string;
  confidenceLabel: string;
  signals: Signal[];
  limitations: string[];
  ownsCard: boolean;
}) {
  const positives = input.signals.filter((item) => item.type === 'positive').slice(0, 3);
  const negatives = input.signals.filter((item) => item.type === 'negative').slice(0, 3);
  return {
    headline: `Collection value insight: ${input.name}`,
    recommendationSummary: input.recommendationLabel === 'Not enough reliable data'
      ? `${input.name} is relevant, but Minty needs stronger recent value evidence before drawing a firmer conclusion.`
      : `${input.name} has a collection-value pattern worth reviewing. Minty is using recent observations, current availability, StackR interest and source-quality signals.`,
    opportunities: positives.length ? positives.map((item) => `${item.label}: ${item.evidence}`) : ['No strong positive signal is confirmed yet.'],
    risks: negatives.length ? negatives.map((item) => `${item.label}: ${item.evidence}`) : ['No major risk signal is dominant, but fresh value references should still be reviewed.'],
    whyMintyPickedThis: [
      input.ownsCard ? 'It is connected to your collection.' : 'It is connected to your StackR activity.',
      input.signals[0]?.evidence ?? 'Minty ranked it from available market and collection signals.',
    ],
    outlook: input.limitations.length
      ? 'Highly uncertain until stronger market coverage appears.'
      : 'Likely to remain stable unless fresh value observations shift the trend.',
    limitationText: input.limitations.join(' ') || undefined,
  };
}

async function generateNarrative(payload: Record<string, unknown>, fallback: Record<string, unknown>) {
  if (!OPENAI_API_KEY) return fallback;
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: NARRATIVE_MODEL,
        input: [
          {
            role: 'system',
            content: [
              'You write concise Pokemon collector recommendations for StackR.',
              'Use only the structured payload and preserve confidence and metrics.',
              'Frame every response as collection and value monitoring only. Never recommend a transaction, fulfilment step or external provider.',
              'Return valid JSON with headline, recommendationSummary, opportunities, risks, whyMintyPickedThis, outlook and optional limitationText.',
            ].join(' '),
          },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        text: { format: { type: 'json_object' } },
      }),
    });
    if (!response.ok) return fallback;
    const result = await response.json();
    const outputText = result.output_text
      ?? result.output?.flatMap((item: Record<string, unknown>) => item.content ?? [])
        ?.map((content: Record<string, unknown>) => content.text)
        ?.filter(Boolean)
        ?.join('\n');
    if (!outputText) return fallback;
    const parsed = JSON.parse(outputText);
    return {
      headline: String(parsed.headline ?? fallback.headline),
      recommendationSummary: String(parsed.recommendationSummary ?? fallback.recommendationSummary),
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 4).map(String) : fallback.opportunities,
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 4).map(String) : fallback.risks,
      whyMintyPickedThis: Array.isArray(parsed.whyMintyPickedThis) ? parsed.whyMintyPickedThis.slice(0, 4).map(String) : fallback.whyMintyPickedThis,
      outlook: String(parsed.outlook ?? fallback.outlook),
      limitationText: parsed.limitationText ? String(parsed.limitationText) : fallback.limitationText,
    };
  } catch (_error) {
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await getUser(req);
    if (!user?.id) return json({ error: 'Unauthenticated' }, 401);
    const body = await req.json().catch(() => ({}));
    const force = Boolean(body.force);
    const now = nowIso();

    if (!force) {
      const cached = await rest(`minty_insights?select=*&user_id=eq.${encodeURIComponent(user.id)}&expires_at=gt.${encodeURIComponent(now)}&stale=eq.false&order=relevance_score.desc,generated_at.desc&limit=1`).catch(() => []);
      if (Array.isArray(cached) && cached[0]) return json({ insight: sanitizeMintyEdgeInsight(cached[0]), source: 'cache' });
    }

    const ownedRows = await rest(`user_card_variants?select=*&user_id=eq.${encodeURIComponent(user.id)}&order=updated_at.desc&limit=50`).catch(() => []);
    const watchRowsForUser = await rest(`market_watchlist?select=*&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=50`).catch(() => []);
    const userListings = await rest(`user_card_flags?select=*&user_id=eq.${encodeURIComponent(user.id)}&flag_type=eq.trade&order=updated_at.desc&limit=50`).catch(() => []);

    const candidateRow = [...(Array.isArray(ownedRows) ? ownedRows : [])]
      .sort((a, b) => numeric(b.quantity, 1) - numeric(a.quantity, 1))[0]
      ?? (Array.isArray(watchRowsForUser) ? watchRowsForUser[0] : null)
      ?? (Array.isArray(userListings) ? userListings[0] : null);

    const cardId = candidateRow?.card_id;
    if (!cardId) {
      return json({
        insight: null,
        source: 'none',
        message: 'No collection or watchlist card was available for Minty to score.',
      });
    }

    const cards = await rest(`pokemon_cards?select=*&id=eq.${encodeURIComponent(String(cardId))}&limit=1`).catch(() => []);
    const card = Array.isArray(cards) ? cards[0] : null;
    if (!card) return json({ insight: null, source: 'none', message: 'Card catalogue record unavailable.' });

    const language = String(card.language ?? candidateRow.language ?? 'en');
    const observations = await rest(`price_observations?select=*&stackr_card_id=eq.${encodeURIComponent(String(card.id))}&language=eq.${encodeURIComponent(language)}&excluded=eq.false&order=observed_at.desc&limit=200`).catch(() => []);
    const snapshots = await rest(`market_price_snapshots?select=*&card_id=eq.${encodeURIComponent(String(card.id))}&language=eq.${encodeURIComponent(language)}&order=snapshot_at.desc&limit=100`).catch(() => []);
    const stackrListings = await rest(`user_card_flags?select=*&card_id=eq.${encodeURIComponent(String(card.id))}&flag_type=eq.trade&listing_status=eq.active&order=updated_at.desc&limit=100`).catch(() => []);
    const cardWatchRows = await rest(`market_watchlist?select=*&card_id=eq.${encodeURIComponent(String(card.id))}&limit=200`).catch(() => []);
    const cardOwnedRows = await rest(`user_card_variants?select=*&card_id=eq.${encodeURIComponent(String(card.id))}&limit=200`).catch(() => []);
    const ebayResult = await fetchEbayActiveObservations(card);
    const allObservations = [
      ...(Array.isArray(observations) ? observations : []),
      ...ebayResult.observations,
      ...(Array.isArray(snapshots) ? snapshots.map((snapshot: Record<string, unknown>) => ({
        id: crypto.randomUUID(),
        stackr_card_id: snapshot.card_id,
        language: snapshot.language ?? language,
        source: snapshot.price_source ?? 'market_price_snapshots',
        source_type: 'market_price',
        original_price: numeric(snapshot.price_gbp ?? snapshot.market_price ?? snapshot.tcgdex_price),
        original_currency: 'GBP',
        converted_price_gbp: numeric(snapshot.price_gbp ?? snapshot.market_price ?? snapshot.tcgdex_price),
        observed_at: snapshot.snapshot_at ?? snapshot.created_at ?? now,
        shipping_included: false,
        verified_sale: false,
        match_confidence: 70,
        raw_payload: snapshot,
      })) : []),
    ];

    const { metrics, marketplace } = buildMetrics({
      card,
      observations: allObservations,
      stackrListings: Array.isArray(stackrListings) ? stackrListings : [],
      watchRows: Array.isArray(cardWatchRows) ? cardWatchRows : [],
      ownedRows: Array.isArray(cardOwnedRows) ? cardOwnedRows : [],
      snapshotRows: Array.isArray(snapshots) ? snapshots : [],
    });

    const hasSoldData = numeric(metrics.confirmedSales30d) > 0 || numeric(metrics.confirmedSales7d) > 0;
    const quality = dataQuality(metrics);
    const recommendationScore = scoreRecommendation(metrics, marketplace);
    const confidence = confidenceScore(metrics, hasSoldData);
    const recommendation = decide(recommendationScore, confidence, quality);
    const recLabel = recommendationLabel(recommendation);
    const confLabel = confidenceLabel(confidence);
    const signals = buildSignals(metrics, marketplace);
    const limitations = [
      ...ebayResult.warnings,
      !hasSoldData ? 'Verified recent value coverage is limited.' : null,
      language.toLowerCase().startsWith('ja') && numeric(metrics.sourceCount) < 2 ? 'Japanese pricing is available from limited source coverage.' : null,
      EBAY_BROWSE_TOKEN ? null : 'eBay active-listing supply is not configured on this environment.',
    ].filter(Boolean);
    const cardName = extractCardName(card);
    const setName = extractSetName(card);
    const cardSnapshot = {
      id: card.id,
      name: cardName,
      setName,
      language,
      imageUrl: extractImageUrl(card),
      variant: candidateRow.variant ?? null,
    };
    const fallbackNarrative = buildFallbackNarrative({
      name: cardName,
      recommendationLabel: recLabel,
      confidenceLabel: confLabel,
      signals,
      limitations,
      ownsCard: Array.isArray(ownedRows) && ownedRows.some((row) => row.card_id === card.id),
    });
    const narrativePayload = {
      card: {
        name: cardName,
        set: setName,
        language,
        variant: candidateRow.variant ?? null,
      },
      recommendation,
      recommendationScore,
      confidenceScore: confidence,
      confidenceLabel: confLabel,
      summarySignals: signals.map(({ type, label, evidence }) => ({ type, label, evidence })),
      pricing: {
        medianSoldGbp: metrics.medianSoldGbp,
        medianActiveListingGbp: metrics.medianActiveListingGbp,
        change30dPercent: metrics.change30dPercent,
        sales30d: metrics.confirmedSales30d,
      },
      dataLimitations: limitations,
    };
    const narrative = sanitizeMintyNarrative(
      await generateNarrative(narrativePayload, fallbackNarrative),
      cardName
    );

    const snapshotRowsInserted = await rest('market_snapshots', {
      method: 'POST',
      body: JSON.stringify({
        stackr_card_id: card.id,
        language,
        raw_or_graded: metrics.rawOrGraded,
        grader: metrics.grader,
        grade: metrics.grade,
        variant: candidateRow.variant ?? null,
        median_sold_gbp: metrics.medianSoldGbp,
        median_active_listing_gbp: metrics.medianActiveListingGbp,
        active_supply: metrics.activeSupply,
        confirmed_sales_7d: metrics.confirmedSales7d,
        confirmed_sales_30d: metrics.confirmedSales30d,
        favourite_count: marketplace.favouriteCount,
        chase_count: marketplace.chaseCount,
        collection_adds_30d: marketplace.collectionAdds30d,
        source_count: metrics.sourceCount,
        source_agreement: metrics.sourceAgreement,
        data_freshness: metrics.dataFreshness,
        outlier_rate: metrics.outlierRate,
        raw_metrics: { metrics, marketplace },
      }),
    }).catch(() => null);
    const snapshotId = Array.isArray(snapshotRowsInserted) ? snapshotRowsInserted[0]?.id : null;

    const relevanceScore = clamp(
      (Array.isArray(ownedRows) && ownedRows.some((row) => row.card_id === card.id) ? 30 : 0) +
        (Array.isArray(watchRowsForUser) && watchRowsForUser.some((row) => row.card_id === card.id) ? 24 : 0) +
        Math.min(12, Math.max(0, numeric(candidateRow.quantity, 1) - 1) * 4) +
        recommendationScore * 0.25
    );
    const actions = [{ key: 'view_value_history', label: 'Review Value History', primary: true }];

    const inserted = await rest('minty_insights', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        stackr_card_id: card.id,
        recommendation,
        recommendation_label: recLabel,
        recommendation_score: recommendationScore,
        confidence_score: confidence,
        confidence_label: confLabel,
        relevance_score: relevanceScore,
        input_snapshot_id: snapshotId,
        structured_signals: signals,
        narrative,
        recommended_actions: actions,
        data_limitations: limitations,
        card_snapshot: cardSnapshot,
        generated_at: now,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        version: 'minty-v2.0.0',
      }),
    });
    const insight = Array.isArray(inserted) ? inserted[0] : inserted;

    if (insight?.id && signals.length) {
      await rest('minty_insight_signals', {
        method: 'POST',
        body: JSON.stringify(signals.map((item) => ({
          insight_id: insight.id,
          signal_type: item.type,
          label: item.label,
          evidence: item.evidence,
          confidence_score: item.confidenceScore,
          confidence_label: item.confidenceLabel,
        }))),
      }).catch(() => null);
    }

    return json({ insight: sanitizeMintyEdgeInsight(insight), source: 'refreshed' });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Minty insight refresh failed' }, 500);
  }
});
