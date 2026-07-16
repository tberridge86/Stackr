import { PRICE_API_URL } from './config';

export type ForeignPokemonLanguageCode =
  | 'en'
  | 'fr'
  | 'es'
  | 'it'
  | 'pt-br'
  | 'de'
  | 'ja'
  | 'zh-tw'
  | 'id'
  | 'th';

export type ForeignPokemonLanguage = {
  code: ForeignPokemonLanguageCode;
  label: string;
  region: string;
};

export type ForeignPokemonSet = {
  id: string;
  providerSetId: string;
  language: ForeignPokemonLanguageCode;
  region: string;
  name: string;
  series?: string | null;
  releaseDate?: string | null;
  logo?: string | null;
  logoBase?: string | null;
  symbol?: string | null;
  symbolBase?: string | null;
  cardCount?: {
    total?: number | null;
    official?: number | null;
    normal?: number | null;
    holo?: number | null;
    reverse?: number | null;
    firstEd?: number | null;
  };
  cards?: ForeignPokemonCardBrief[];
};

export type ForeignPokemonCardBrief = {
  id: string;
  providerCardId: string;
  language: ForeignPokemonLanguageCode;
  region: string;
  localId?: string | null;
  number?: string | null;
  name: string;
  image?: string | null;
  imageSmall?: string | null;
  imageBase?: string | null;
};

export type ForeignPokemonPriceVariant = {
  source: 'tcgdex_cardmarket' | 'tcgdex_tcgplayer';
  variant: string;
  currency: string;
  updatedAt?: string | null;
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
  average?: number | null;
  trend?: number | null;
  lowGbp?: number | null;
  midGbp?: number | null;
  highGbp?: number | null;
  marketGbp?: number | null;
  averageGbp?: number | null;
  trendGbp?: number | null;
  externalProductId?: string | number | null;
};

export type ForeignPokemonPricing = {
  preferredGbp: number | null;
  preferredSource: string | null;
  preferredVariant: string | null;
  cardmarket: ForeignPokemonPriceVariant[];
  tcgplayer: ForeignPokemonPriceVariant[];
  raw?: unknown;
};

export type ForeignPokemonCard = ForeignPokemonCardBrief & {
  rarity?: string | null;
  category?: string | null;
  illustrator?: string | null;
  hp?: string | number | null;
  types?: string[];
  stage?: string | null;
  set?: {
    id?: string | null;
    name?: string | null;
    logo?: string | null;
    symbol?: string | null;
    cardCount?: unknown;
  } | null;
  pricing: ForeignPokemonPricing;
  raw?: unknown;
};

function assertPriceApiUrl() {
  if (!PRICE_API_URL) throw new Error('Missing EXPO_PUBLIC_PRICE_API_URL');
  return PRICE_API_URL.replace(/\/$/, '');
}

async function fetchForeignJson<T>(path: string): Promise<T> {
  const response = await fetch(`${assertPriceApiUrl()}${path}`);
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.detail?.message ?? json?.detail ?? json?.error ?? `Foreign Pokemon API failed: ${response.status}`);
  }
  return json as T;
}

export async function fetchForeignPokemonLanguages(): Promise<ForeignPokemonLanguage[]> {
  const json = await fetchForeignJson<{ languages: ForeignPokemonLanguage[] }>('/api/foreign/languages');
  return json.languages ?? [];
}

export async function fetchForeignPokemonSets(options: {
  language?: ForeignPokemonLanguageCode | string | null;
  query?: string;
  limit?: number;
} = {}): Promise<ForeignPokemonSet[]> {
  const params = new URLSearchParams();
  if (options.language) params.set('language', String(options.language));
  if (options.query?.trim()) params.set('q', options.query.trim());
  if (options.limit) params.set('limit', String(options.limit));
  const json = await fetchForeignJson<{ sets: ForeignPokemonSet[] }>(`/api/foreign/sets?${params.toString()}`);
  return json.sets ?? [];
}

export async function fetchForeignPokemonSet(
  setId: string,
  options: { language?: ForeignPokemonLanguageCode | string | null } = {}
): Promise<ForeignPokemonSet | null> {
  const params = new URLSearchParams();
  if (options.language) params.set('language', String(options.language));
  const query = params.toString();
  const json = await fetchForeignJson<{ set: ForeignPokemonSet }>(
    `/api/foreign/sets/${encodeURIComponent(setId)}${query ? `?${query}` : ''}`
  );
  return json.set ?? null;
}

export async function searchForeignPokemonCards(options: {
  query?: string;
  language?: ForeignPokemonLanguageCode | string | null;
  setId?: string;
  number?: string;
  limit?: number;
  includeDetails?: boolean;
}): Promise<(ForeignPokemonCardBrief | ForeignPokemonCard)[]> {
  const params = new URLSearchParams();
  if (options.query?.trim()) params.set('q', options.query.trim());
  if (options.language) params.set('language', String(options.language));
  if (options.setId?.trim()) params.set('setId', options.setId.trim());
  if (options.number?.trim()) params.set('number', options.number.trim());
  if (options.limit) params.set('limit', String(options.limit));
  if (options.includeDetails) params.set('includeDetails', 'true');
  const json = await fetchForeignJson<{ cards: (ForeignPokemonCardBrief | ForeignPokemonCard)[] }>(
    `/api/foreign/cards/search?${params.toString()}`
  );
  return json.cards ?? [];
}

export async function fetchForeignPokemonCard(
  cardId: string,
  options: { language?: ForeignPokemonLanguageCode | string | null } = {}
): Promise<ForeignPokemonCard | null> {
  const params = new URLSearchParams();
  if (options.language) params.set('language', String(options.language));
  const query = params.toString();
  const json = await fetchForeignJson<{ card: ForeignPokemonCard }>(
    `/api/foreign/cards/${encodeURIComponent(cardId)}${query ? `?${query}` : ''}`
  );
  return json.card ?? null;
}

export async function fetchForeignPokemonCardPricing(
  cardId: string,
  options: { language?: ForeignPokemonLanguageCode | string | null } = {}
): Promise<ForeignPokemonPricing | null> {
  const params = new URLSearchParams();
  if (options.language) params.set('language', String(options.language));
  const query = params.toString();
  const json = await fetchForeignJson<{ pricing: ForeignPokemonPricing }>(
    `/api/foreign/cards/${encodeURIComponent(cardId)}/prices${query ? `?${query}` : ''}`
  );
  return json.pricing ?? null;
}
