import { EUR_TO_GBP, PRICE_API_URL, USD_TO_GBP } from './config';
import { normalizeGradeKey, normalizeGraderKey } from './graderRegistry';

const TCGCSV_BASE_URL = 'https://tcgcsv.com';

type TcgcsvGroup = {
  groupId: number;
  name: string;
  abbreviation?: string;
  categoryId: number;
};

type TcgcsvExtendedDataEntry = {
  name?: string;
  value?: string;
};

type TcgcsvProduct = {
  productId: number;
  name: string;
  groupId: number;
  imageUrl?: string | null;
  extendedData?: TcgcsvExtendedDataEntry[];
};

type TcgcsvPrice = {
  productId: number;
  subTypeName: string;
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
};

type PokeTracePriceTier = {
  avg?: number | null;
  average?: number | null;
  market?: number | null;
  low?: number | null;
  high?: number | null;
  saleCount?: number | null;
  count?: number | null;
  avg1d?: number | null;
  avg7d?: number | null;
  avg30d?: number | null;
  median3d?: number | null;
  median7d?: number | null;
  median30d?: number | null;
};

type PokeTraceCard = {
  id?: string;
  name?: string;
  cardNumber?: string;
  number?: string;
  set?: { name?: string; slug?: string } | string | null;
  market?: 'US' | 'EU' | string;
  currency?: 'USD' | 'EUR' | 'GBP' | string;
  prices?: {
    ebay?: Record<string, PokeTracePriceTier>;
    tcgplayer?: Record<string, PokeTracePriceTier>;
    cardmarket?: Record<string, PokeTracePriceTier>;
    cardmarket_unsold?: Record<string, PokeTracePriceTier>;
  };
  gradedOptions?: string[];
  conditionOptions?: string[];
  totalSaleCount?: number;
  refs?: {
    tcgplayerId?: string | number | null;
    cardmarketId?: string | number | null;
  };
};

export type PokeTraceCardPriceResult = {
  source: 'poketrace';
  providerCardId: string | null;
  name: string | null;
  setName: string | null;
  number: string | null;
  market: string | null;
  currency: string | null;
  tcg_low: number | null;
  tcg_mid: number | null;
  ebay_low: number | null;
  ebay_average: number | null;
  ebay_high: number | null;
  ebay_count: number;
  cardmarket_trend: number | null;
  graded_average: number | null;
  graded_low: number | null;
  graded_high: number | null;
  graded_count: number;
  graded_tier: string | null;
  gradedOptions: string[];
  conditionOptions: string[];
  raw: PokeTraceCard;
};

export type PokeTraceCardPriceInput = {
  identifier: string;
  tcgPlayerId?: string | number | null;
  setName?: string | null;
  number?: string | null;
  language?: string | null;
  market?: 'US' | 'EU';
  gradingCompany?: string | null;
  grade?: string | number | null;
  gradeLabel?: string | null;
};

export type PokeTraceHistoryPeriod = '7d' | '30d' | '90d' | '1y' | 'all';

export type PokeTraceHistoryPoint = {
  date: string;
  source: string;
  avg: number | null;
  low: number | null;
  high: number | null;
  value: number | null;
  saleCount: number | null;
};

const POKETRACE_PRICE_CACHE_TTL_MS = 60 * 1000;
const POKETRACE_HISTORY_CACHE_TTL_MS = 60 * 1000;
const POKETRACE_ERROR_CACHE_TTL_MS = 30 * 1000;
const POKETRACE_RATE_LIMIT_CACHE_TTL_MS = 2 * 60 * 1000;
const POKETRACE_WARNING_TTL_MS = 60 * 1000;
const TCGCSV_JSON_CACHE_TTL_MS = 10 * 60 * 1000;
const TCGCSV_UI_PRICE_CACHE_TTL_MS = 10 * 60 * 1000;

const pokeTracePriceCache = new Map<string, { expiresAt: number; value: PokeTraceCardPriceResult | null }>();
const pokeTracePriceInflight = new Map<string, Promise<PokeTraceCardPriceResult | null>>();
const pokeTraceHistoryCache = new Map<string, { expiresAt: number; value: PokeTraceHistoryPoint[] }>();
const pokeTraceHistoryInflight = new Map<string, Promise<PokeTraceHistoryPoint[]>>();
const pokeTraceWarnings = new Map<string, number>();
const tcgcsvJsonCache = new Map<string, { expiresAt: number; value: unknown }>();
const tcgcsvJsonInflight = new Map<string, Promise<unknown>>();

const getPokeTraceFailureTtl = (status: number) =>
  status === 429 ? POKETRACE_RATE_LIMIT_CACHE_TTL_MS : POKETRACE_ERROR_CACHE_TTL_MS;

const warnPokeTraceOnce = (key: string, message: string) => {
  const now = Date.now();
  const lastWarning = pokeTraceWarnings.get(key) ?? 0;
  if (now - lastWarning < POKETRACE_WARNING_TTL_MS) return;
  pokeTraceWarnings.set(key, now);
  console.warn(message);
};

const getPokeTracePriceCacheKey = (input: PokeTraceCardPriceInput) => JSON.stringify({
  identifier: input.identifier?.trim().toLowerCase() ?? '',
  tcgPlayerId: input.tcgPlayerId != null ? String(input.tcgPlayerId).trim().toLowerCase() : '',
  setName: input.setName?.trim().toLowerCase() ?? '',
  number: input.number?.trim().toLowerCase() ?? '',
  language: input.language != null ? String(input.language).trim().toLowerCase() : 'en',
  market: input.market ?? 'US',
  gradingCompany: normalizeGraderKey(input.gradingCompany) ?? String(input.gradingCompany ?? '').trim().toLowerCase(),
  grade: normalizeGradeKey(input.grade).toLowerCase(),
  gradeLabel: normalizeGradeKey(input.gradeLabel).toLowerCase(),
});

export type TcgcsvCardVariantPrice = {
  subTypeName: string;
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
};

export type TcgcsvUiCardPriceRow = {
  productId: number;
  name: string;
  imageUrl: string | null;
  number: string | null;
  variants: TcgcsvCardVariantPrice[];
};

export type TcgcsvUiProductPriceRow = {
  productId: number;
  name: string;
  imageUrl: string | null;
  groupId: number;
  groupName: string;
  variants: TcgcsvCardVariantPrice[];
};

const tcgcsvUiCardPriceCache = new Map<string, { expiresAt: number; value: TcgcsvUiCardPriceRow[] }>();
const tcgcsvUiCardPriceInflight = new Map<string, Promise<TcgcsvUiCardPriceRow[]>>();
const tcgcsvUiProductPriceCache = new Map<string, { expiresAt: number; value: TcgcsvUiProductPriceRow[] }>();
const tcgcsvUiProductPriceInflight = new Map<string, Promise<TcgcsvUiProductPriceRow[]>>();

export type TcgVariantPriceSummary = {
  variant: string;
  market: number | null;
  mid: number | null;
  low: number | null;
};

export type TcgCardPriceAvailability = {
  id: string;
  name: string;
  number?: string;
  setName?: string;
  variants: TcgVariantPriceSummary[];
};

export type LatestMarketSnapshot = {
  ebay_average?: number | null;
  ebay_low?: number | null;
  ebay_high?: number | null;
  tcg_mid?: number | null;
  tcg_low?: number | null;
  cardmarket_trend?: number | null;
};

export const getPreferredMarketPrice = (
  snapshot?: LatestMarketSnapshot | null,
  fallback?: { ebay?: number | null; tcg?: number | null; cardmarket?: number | null }
) => {
  const ebay = snapshot?.ebay_average ?? fallback?.ebay ?? null;
  if (typeof ebay === 'number') return { source: 'ebay' as const, value: ebay };

  const tcg = snapshot?.tcg_mid ?? fallback?.tcg ?? null;
  if (typeof tcg === 'number') return { source: 'tcg' as const, value: tcg };

  const cardmarket = snapshot?.cardmarket_trend ?? fallback?.cardmarket ?? null;
  if (typeof cardmarket === 'number') return { source: 'cardmarket' as const, value: cardmarket };

  return { source: null, value: null };
};

const RAW_TIER_PRIORITY = [
  'NEAR_MINT',
  'MINT',
  'LIGHTLY_PLAYED',
  'EXCELLENT',
  'MODERATELY_PLAYED',
  'HEAVILY_PLAYED',
  'DAMAGED',
  'AGGREGATED',
];

export const normalizePokeTraceTierKey = (value?: string | number | null) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '_')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const buildPokeTraceGradedTier = (
  gradingCompany?: string | null,
  grade?: string | number | null,
  gradeLabel?: string | null
) => {
  const company = normalizeGraderKey(gradingCompany) ?? normalizePokeTraceTierKey(gradingCompany);
  const gradeKey = normalizeGradeKey(grade);
  const labelKey = normalizeGradeKey(gradeLabel);
  return company && gradeKey ? [company, gradeKey, labelKey].filter(Boolean).join('_') : null;
};

export type StackrPricingKey = {
  canonicalCardId: string;
  language: string;
  edition: string | null;
  variant: string | null;
  rawOrGraded: 'raw' | 'graded';
  grader: string | null;
  grade: string | null;
  gradeLabel: string | null;
  currency: string;
  source: string;
  salesWindow: string;
};

export function buildStackrPricingKey(input: Partial<StackrPricingKey>) {
  const rawOrGraded = input.rawOrGraded ?? 'raw';
  return JSON.stringify({
    canonicalCardId: input.canonicalCardId ?? '',
    language: String(input.language ?? 'en').trim().toLowerCase(),
    edition: input.edition ?? null,
    variant: input.variant ?? null,
    rawOrGraded,
    grader: rawOrGraded === 'graded' ? normalizeGraderKey(input.grader) ?? normalizePokeTraceTierKey(input.grader) : null,
    grade: rawOrGraded === 'graded' ? normalizeGradeKey(input.grade) || null : null,
    gradeLabel: rawOrGraded === 'graded' ? normalizeGradeKey(input.gradeLabel) || null : null,
    currency: String(input.currency ?? 'GBP').trim().toUpperCase(),
    source: input.source ?? 'unknown',
    salesWindow: input.salesWindow ?? 'current',
  } satisfies StackrPricingKey);
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function convertPokeTracePrice(value: unknown, currency?: string | null): number | null {
  const parsed = toNumberOrNull(value);
  if (parsed == null) return null;
  const rate = currency === 'EUR' ? EUR_TO_GBP : currency === 'GBP' ? 1 : USD_TO_GBP;
  return Math.round(parsed * rate * 100) / 100;
}

function getTierAverage(tier?: PokeTracePriceTier | null): number | null {
  return toNumberOrNull(
    tier?.avg ??
    tier?.average ??
    tier?.market ??
    tier?.median7d ??
    tier?.median30d ??
    tier?.avg7d ??
    tier?.avg30d
  );
}

function pickPokeTraceTier(
  tiers?: Record<string, PokeTracePriceTier>,
  preferredKeys: string[] = RAW_TIER_PRIORITY
) {
  if (!tiers) return { key: null as string | null, tier: null as PokeTracePriceTier | null };
  for (const key of preferredKeys) {
    const direct = tiers[key];
    if (direct) return { key, tier: direct };

    const match = Object.keys(tiers).find((candidate) => normalizePokeTraceTierKey(candidate) === key);
    if (match) return { key: match, tier: tiers[match] };
  }

  const firstKey = Object.keys(tiers)[0] ?? null;
  return { key: firstKey, tier: firstKey ? tiers[firstKey] : null };
}

function pickExactPokeTraceTier(
  tiers?: Record<string, PokeTracePriceTier>,
  preferredKeys: (string | null)[] = []
) {
  if (!tiers) return { key: null as string | null, tier: null as PokeTracePriceTier | null };
  for (const key of preferredKeys.filter(Boolean) as string[]) {
    const direct = tiers[key];
    if (direct) return { key, tier: direct };

    const normalizedKey = normalizePokeTraceTierKey(key);
    const match = Object.keys(tiers).find((candidate) => normalizePokeTraceTierKey(candidate) === normalizedKey);
    if (match) return { key: match, tier: tiers[match] };
  }

  return { key: null as string | null, tier: null as PokeTracePriceTier | null };
}

export function normalizePokeTraceCardPrice(
  card: PokeTraceCard | null | undefined,
  options: Pick<PokeTraceCardPriceInput, 'gradingCompany' | 'grade' | 'gradeLabel'> = {}
): PokeTraceCardPriceResult | null {
  if (!card) return null;

  const currency = typeof card.currency === 'string' ? card.currency.toUpperCase() : 'USD';
  const rawTcg = pickPokeTraceTier(card.prices?.tcgplayer);
  const rawEbay = pickPokeTraceTier(card.prices?.ebay);
  const cardmarket = pickPokeTraceTier(card.prices?.cardmarket, ['AGGREGATED', ...RAW_TIER_PRIORITY]);
  const cardmarketUnsold = pickPokeTraceTier(card.prices?.cardmarket_unsold);
  const requestedGradedTier = buildPokeTraceGradedTier(options.gradingCompany, options.grade, options.gradeLabel);
  const requestedWithoutLabel = buildPokeTraceGradedTier(options.gradingCompany, options.grade);
  const gradedTier = requestedGradedTier
    ? pickExactPokeTraceTier(card.prices?.ebay ?? card.prices?.cardmarket_unsold, [requestedGradedTier, requestedWithoutLabel])
    : { key: null as string | null, tier: null as PokeTracePriceTier | null };
  const setName = typeof card.set === 'string' ? card.set : card.set?.name ?? null;

  return {
    source: 'poketrace',
    providerCardId: card.id ?? null,
    name: card.name ?? null,
    setName,
    number: card.cardNumber ?? card.number ?? null,
    market: card.market ?? null,
    currency,
    tcg_low: convertPokeTracePrice(rawTcg.tier?.low, currency),
    tcg_mid: convertPokeTracePrice(getTierAverage(rawTcg.tier), currency),
    ebay_low: convertPokeTracePrice(rawEbay.tier?.low, currency),
    ebay_average: convertPokeTracePrice(getTierAverage(rawEbay.tier), currency),
    ebay_high: convertPokeTracePrice(rawEbay.tier?.high, currency),
    ebay_count: Math.round(toNumberOrNull(rawEbay.tier?.saleCount ?? rawEbay.tier?.count ?? card.totalSaleCount) ?? 0),
    cardmarket_trend: convertPokeTracePrice(getTierAverage(cardmarket.tier ?? cardmarketUnsold.tier), currency),
    graded_average: convertPokeTracePrice(getTierAverage(gradedTier.tier), currency),
    graded_low: convertPokeTracePrice(gradedTier.tier?.low, currency),
    graded_high: convertPokeTracePrice(gradedTier.tier?.high, currency),
    graded_count: Math.round(toNumberOrNull(gradedTier.tier?.saleCount ?? gradedTier.tier?.count) ?? 0),
    graded_tier: gradedTier.key,
    gradedOptions: Array.isArray(card.gradedOptions) ? card.gradedOptions : [],
    conditionOptions: Array.isArray(card.conditionOptions) ? card.conditionOptions : [],
    raw: card,
  };
}

export async function fetchPokeTraceCardPrice(
  input: PokeTraceCardPriceInput
): Promise<PokeTraceCardPriceResult | null> {
  if (!PRICE_API_URL || !input.identifier?.trim()) return null;
  const cacheKey = getPokeTracePriceCacheKey(input);
  const cached = pokeTracePriceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const inflight = pokeTracePriceInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    const params = new URLSearchParams({
      identifier: input.identifier.trim(),
      market: input.market ?? 'US',
    });
    if (input.tcgPlayerId != null && String(input.tcgPlayerId).trim()) {
      params.set('tcgPlayerId', String(input.tcgPlayerId).trim());
    }
    if (input.setName?.trim()) params.set('setName', input.setName.trim());
    if (input.number?.trim()) params.set('number', input.number.trim());
    if (input.language?.trim()) params.set('language', input.language.trim());

    const response = await fetch(`${PRICE_API_URL}/api/poketrace/card?${params.toString()}`);
    if (!response.ok) {
      const ttl = getPokeTraceFailureTtl(response.status);
      const message = response.status === 429
        ? 'PokeTrace rate limit reached; cooling down price requests briefly.'
        : `PokeTrace fetch unavailable: ${response.status}`;
      warnPokeTraceOnce(`price:${response.status}`, message);
      pokeTracePriceCache.set(cacheKey, { expiresAt: Date.now() + ttl, value: null });
      return null;
    }

    const json = await response.json();
    const value = normalizePokeTraceCardPrice(json?.card, {
      gradingCompany: input.gradingCompany,
      grade: input.grade,
      gradeLabel: input.gradeLabel,
    });
    pokeTracePriceCache.set(cacheKey, { expiresAt: Date.now() + POKETRACE_PRICE_CACHE_TTL_MS, value });
    return value;
  })();

  pokeTracePriceInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pokeTracePriceInflight.delete(cacheKey);
  }
}

export async function fetchPokeTracePriceHistory(
  providerCardId: string,
  tier: string,
  period: PokeTraceHistoryPeriod = '30d'
): Promise<PokeTraceHistoryPoint[]> {
  if (!PRICE_API_URL || !providerCardId || !tier) return [];
  const cacheKey = JSON.stringify({ providerCardId, tier, period });
  const cached = pokeTraceHistoryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const inflight = pokeTraceHistoryInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    const params = new URLSearchParams({
      period,
      limit: period === '7d' ? '14' : period === '30d' ? '45' : period === '90d' ? '100' : '365',
    });

    const response = await fetch(
      `${PRICE_API_URL}/api/poketrace/card/${encodeURIComponent(providerCardId)}/prices/${encodeURIComponent(tier)}/history?${params.toString()}`
    );
    if (!response.ok) {
      const ttl = getPokeTraceFailureTtl(response.status);
      const message = response.status === 429
        ? 'PokeTrace rate limit reached; cooling down history requests briefly.'
        : `PokeTrace history unavailable: ${response.status}`;
      warnPokeTraceOnce(`history:${response.status}`, message);
      pokeTraceHistoryCache.set(cacheKey, { expiresAt: Date.now() + ttl, value: [] });
      return [];
    }

    const json = await response.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    const value = rows
      .map((row: any): PokeTraceHistoryPoint | null => {
        const currency = typeof row?.currency === 'string' ? row.currency.toUpperCase() : 'USD';
        const pointValue = row?.median7d ?? row?.median30d ?? row?.avg7d ?? row?.avg30d ?? row?.avg;
        const date = typeof row?.date === 'string' ? row.date : null;
        const source = typeof row?.source === 'string' ? row.source : 'unknown';
        if (!date) return null;
        return {
          date,
          source,
          avg: convertPokeTracePrice(row?.avg, currency),
          low: convertPokeTracePrice(row?.low, currency),
          high: convertPokeTracePrice(row?.high, currency),
          value: convertPokeTracePrice(pointValue, currency),
          saleCount: toNumberOrNull(row?.saleCount),
        };
      })
      .filter((row: PokeTraceHistoryPoint | null): row is PokeTraceHistoryPoint => Boolean(row))
      .sort((a: PokeTraceHistoryPoint, b: PokeTraceHistoryPoint) => a.date.localeCompare(b.date));

    pokeTraceHistoryCache.set(cacheKey, { expiresAt: Date.now() + POKETRACE_HISTORY_CACHE_TTL_MS, value });
    return value;
  })();

  pokeTraceHistoryInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pokeTraceHistoryInflight.delete(cacheKey);
  }
}

export const getPriceFromPokemonCard = (card: any, edition?: string | null): number | null => {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  const preferred = edition === '1st_edition'
    ? [
        '1stEditionHolofoil',
        '1stEditionNormal',
      ]
    : edition === 'unlimited'
    ? [
        'unlimitedHolofoil',
        'unlimited',
        'holofoil',
        'normal',
      ]
    : [
        'unlimitedHolofoil',
        'unlimited',
        'holofoil',
        'reverseHolofoil',
        'normal',
        '1stEditionHolofoil',
        '1stEditionNormal',
      ];

  for (const key of preferred) {
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return value;
  }

  if (edition === '1st_edition' || edition === 'unlimited') return null;

  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return value;
  }

  return null;
};

export const fetchLivePricesForCardIds = async (cardIds: string[]) => {
  const chunks: string[][] = [];

  for (let i = 0; i < cardIds.length; i += 20) {
    chunks.push(cardIds.slice(i, i + 20));
  }

  const priceMap: Record<string, number> = {};

  for (const chunk of chunks) {
    for (const id of chunk) {
      const [setId, number] = id.split('-');

      const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(
        `set.id:${setId} number:${number}`
      )}`;
      const response = await fetch(url);
      const json = await response.json();

      const card = json?.data?.[0];

      if (!card) {
        console.log(`❌ Not found in API: ${id}`);
        continue;
      }

      const price = getPriceFromPokemonCard(card);

      if (typeof price === 'number') {
        priceMap[id] = price;
      }
    }
  }

  return priceMap;
};

export const summarizeCardPriceAvailability = (card: any): TcgCardPriceAvailability => {
  const prices = card?.tcgplayer?.prices ?? {};
  const variants: TcgVariantPriceSummary[] = Object.entries(prices).map(
    ([variant, value]: [string, any]) => ({
      variant,
      market: typeof value?.market === 'number' ? value.market : null,
      mid: typeof value?.mid === 'number' ? value.mid : null,
      low: typeof value?.low === 'number' ? value.low : null,
    })
  );

  return {
    id: card?.id ?? '',
    name: card?.name ?? '',
    number: card?.number ?? undefined,
    setName: card?.set?.name ?? undefined,
    variants,
  };
};

export const fetchCardsBySetNameWithPriceAvailability = async (
  setName: string,
  cardName?: string,
  pageSize = 40
): Promise<TcgCardPriceAvailability[]> => {
  const filters = [`set.name:"${setName}"`];
  if (cardName?.trim()) {
    filters.push(`name:"*${cardName.trim()}*"`);
  }

  const query = filters.join(' ');
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(
    query
  )}&pageSize=${pageSize}`;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch cards for set "${setName}": ${response.status} ${text}`);
  }

  const json = await response.json();
  const cards = Array.isArray(json?.data) ? json.data : [];
  return cards.map(summarizeCardPriceAvailability);
};

async function fetchTcgcsvJson<T>(url: string): Promise<T> {
  const now = Date.now();
  const cached = tcgcsvJsonCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const inflight = tcgcsvJsonInflight.get(url);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const request = (async () => {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PocketVault/1.0.0',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TCGCSV request failed: ${response.status} ${text}`);
    }

    const json = await response.json() as T;
    tcgcsvJsonCache.set(url, {
      expiresAt: Date.now() + TCGCSV_JSON_CACHE_TTL_MS,
      value: json,
    });
    return json;
  })();

  tcgcsvJsonInflight.set(url, request as Promise<unknown>);
  try {
    return await request;
  } finally {
    tcgcsvJsonInflight.delete(url);
  }
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getExtendedDataValue(product: TcgcsvProduct, key: string): string | null {
  const entries = Array.isArray(product.extendedData) ? product.extendedData : [];
  const match = entries.find(
    (entry) => String(entry?.name ?? '').toLowerCase() === key.toLowerCase()
  );
  const value = match?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isUiDisplayableSingleCard(product: TcgcsvProduct): boolean {
  const lowerName = product.name.toLowerCase();

  const blockedNameTerms = [
    'code card',
    'booster',
    'elite trainer box',
    'etb',
    'bundle',
    'case',
    'blister',
    'collection',
    'deck',
    'tin',
    'playmat',
    'sleeves',
    'binder',
    'poster',
    'coins',
    'box',
  ];

  if (blockedNameTerms.some((term) => lowerName.includes(term))) {
    return false;
  }

  const number = getExtendedDataValue(product, 'Number');
  const rarity = getExtendedDataValue(product, 'Rarity');

  return Boolean(number || rarity);
}

function isUiDisplayableMarketProduct(product: TcgcsvProduct): boolean {
  const lowerName = product.name.toLowerCase();
  if (lowerName.includes('code card')) return false;
  if (getExtendedDataValue(product, 'Number') || getExtendedDataValue(product, 'Rarity')) return false;

  const productTerms = [
    'elite trainer box',
    'etb',
    'booster box',
    'booster bundle',
    'booster pack',
    'sleeved booster',
    'collection',
    'ultra-premium',
    'ultra premium',
    'binder',
    'tin',
    'sleeves',
    'playmat',
  ];

  return productTerms.some((term) => lowerName.includes(term));
}

export async function fetchTcgcsvPokemonGroupByName(
  setName: string
): Promise<TcgcsvGroup | null> {
  const url = `${TCGCSV_BASE_URL}/tcgplayer/3/groups`;
  const json = await fetchTcgcsvJson<{ results?: TcgcsvGroup[] }>(url);
  const groups = Array.isArray(json.results) ? json.results : [];

  const target = normalizeForCompare(setName);
  const exact = groups.find((group) => normalizeForCompare(group.name) === target);
  if (exact) return exact;

  return (
    groups.find((group) => normalizeForCompare(group.name).includes(target)) ?? null
  );
}

export async function fetchTcgcsvUiCardPricesForSet(
  setName: string
): Promise<TcgcsvUiCardPriceRow[]> {
  const cacheKey = normalizeForCompare(setName);
  const cached = tcgcsvUiCardPriceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const inflight = tcgcsvUiCardPriceInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
  const group = await fetchTcgcsvPokemonGroupByName(setName);
  if (!group) return [];

  const [productsJson, pricesJson] = await Promise.all([
    fetchTcgcsvJson<{ results?: TcgcsvProduct[] }>(
      `${TCGCSV_BASE_URL}/tcgplayer/3/${group.groupId}/products`
    ),
    fetchTcgcsvJson<{ results?: TcgcsvPrice[] }>(
      `${TCGCSV_BASE_URL}/tcgplayer/3/${group.groupId}/prices`
    ),
  ]);

  const products = (productsJson.results ?? []).filter(isUiDisplayableSingleCard);
  const prices = pricesJson.results ?? [];

  const priceByProductId = new Map<number, TcgcsvCardVariantPrice[]>();
  for (const price of prices) {
    if (!priceByProductId.has(price.productId)) {
      priceByProductId.set(price.productId, []);
    }

    priceByProductId.get(price.productId)!.push({
      subTypeName: price.subTypeName,
      marketPrice: typeof price.marketPrice === 'number' ? price.marketPrice : null,
      lowPrice: typeof price.lowPrice === 'number' ? price.lowPrice : null,
      midPrice: typeof price.midPrice === 'number' ? price.midPrice : null,
    });
  }

  const rows: TcgcsvUiCardPriceRow[] = [];
  for (const product of products) {
    const variants = priceByProductId.get(product.productId) ?? [];
    if (!variants.length) continue;

    rows.push({
      productId: product.productId,
      name: product.name,
      imageUrl: typeof product.imageUrl === 'string' && product.imageUrl.trim() ? product.imageUrl.trim() : null,
      number: getExtendedDataValue(product, 'Number'),
      variants,
    });
  }

    tcgcsvUiCardPriceCache.set(cacheKey, {
      expiresAt: Date.now() + TCGCSV_UI_PRICE_CACHE_TTL_MS,
      value: rows,
    });
    return rows;
  })();

  tcgcsvUiCardPriceInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    tcgcsvUiCardPriceInflight.delete(cacheKey);
  }
}

export async function fetchTcgcsvUiProductPricesForSet(
  setName: string
): Promise<TcgcsvUiProductPriceRow[]> {
  const cacheKey = normalizeForCompare(setName);
  const cached = tcgcsvUiProductPriceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const inflight = tcgcsvUiProductPriceInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
  const group = await fetchTcgcsvPokemonGroupByName(setName);
  if (!group) return [];

  const [productsJson, pricesJson] = await Promise.all([
    fetchTcgcsvJson<{ results?: TcgcsvProduct[] }>(
      `${TCGCSV_BASE_URL}/tcgplayer/3/${group.groupId}/products`
    ),
    fetchTcgcsvJson<{ results?: TcgcsvPrice[] }>(
      `${TCGCSV_BASE_URL}/tcgplayer/3/${group.groupId}/prices`
    ),
  ]);

  const products = (productsJson.results ?? []).filter(isUiDisplayableMarketProduct);
  const prices = pricesJson.results ?? [];

  const priceByProductId = new Map<number, TcgcsvCardVariantPrice[]>();
  for (const price of prices) {
    if (!priceByProductId.has(price.productId)) {
      priceByProductId.set(price.productId, []);
    }

    priceByProductId.get(price.productId)!.push({
      subTypeName: price.subTypeName,
      marketPrice: typeof price.marketPrice === 'number' ? price.marketPrice : null,
      lowPrice: typeof price.lowPrice === 'number' ? price.lowPrice : null,
      midPrice: typeof price.midPrice === 'number' ? price.midPrice : null,
    });
  }

    const rows = products
    .map((product) => ({
      productId: product.productId,
      name: product.name,
      imageUrl: typeof product.imageUrl === 'string' && product.imageUrl.trim() ? product.imageUrl.trim() : null,
      groupId: group.groupId,
      groupName: group.name,
      variants: priceByProductId.get(product.productId) ?? [],
    }))
    .filter((product) => product.variants.length > 0);

    tcgcsvUiProductPriceCache.set(cacheKey, {
      expiresAt: Date.now() + TCGCSV_UI_PRICE_CACHE_TTL_MS,
      value: rows,
    });
    return rows;
  })();

  tcgcsvUiProductPriceInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    tcgcsvUiProductPriceInflight.delete(cacheKey);
  }
}

type PptEbayGrade = {
  avg?: number;
  average?: number;
  averagePrice?: number;
  minPrice?: number;
  maxPrice?: number;
  count?: number;
  recent_sales?: number;
};

type PptCard = {
  id?: string;
  name?: string;
  set?: string;
  setName?: string;
  number?: string;
  prices?: { market?: number };
  ebay?: {
    psa8?: PptEbayGrade;
    psa9?: PptEbayGrade;
    psa10?: PptEbayGrade;
    salesByGrade?: Record<string, PptEbayGrade>;
  };
};

export async function fetchPptCardWithPsaGrades(identifier: string, setName?: string): Promise<PptCard | null> {
  if (!PRICE_API_URL) return null;

  const params = new URLSearchParams({ identifier });
  if (/^\d+$/.test(identifier)) {
    params.set('tcgPlayerId', identifier);
  }
  if (setName) params.set('setName', setName);

  const res = await fetch(`${PRICE_API_URL}/api/pokemon-price-tracker/card?${params.toString()}`);
  if (!res.ok) {
    console.warn(`PPT PSA fetch failed: ${res.status}`);
    return null;
  }
  const json = await res.json();
  const card = json?.card ?? json?.data?.[0];
  return card ?? null;
}
