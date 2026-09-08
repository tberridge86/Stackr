import { PRICE_API_URL } from './config';
import {
  resolveTcgdexControlledCardReference,
  stripTcgdexReferencesFromValueBeforePersistence,
} from './tcgdexControlledCardReference';

export type ForeignPokemonLanguageCode =
  | 'en'
  | 'fr'
  | 'es'
  | 'it'
  | 'pt-br'
  | 'de'
  | 'ja'
  | 'zh-cn'
  | 'zh-tw'
  | 'ko'
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
  localName?: string | null;
  englishDisplayName?: string | null;
  series?: string | null;
  releaseDate?: string | null;
  logo?: string | null;
  logoBase?: string | null;
  symbol?: string | null;
  symbolBase?: string | null;
  images?: {
    logo?: string | null;
    symbol?: string | null;
    cover?: string | null;
    artwork?: string | null;
  };
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
  localName?: string | null;
  englishDisplayName?: string | null;
  image?: string | null;
  imageSmall?: string | null;
  imageBase?: string | null;
  controlledReference?: ForeignPokemonControlledCardReference | null;
};

export type ForeignPokemonControlledCardReference = {
  uri: string;
  sourceCode: 'tcgdex';
  attributionText: 'TCGdex reference';
  cachePolicy: 'memory';
  providerCardId: string;
  providerSetId: string;
  localId: string;
  provenance: 'tcgdex_live_or_ttl_cached_provider_card_record';
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
    localName?: string | null;
    englishDisplayName?: string | null;
    logo?: string | null;
    symbol?: string | null;
    cardCount?: unknown;
  } | null;
  pricing: ForeignPokemonPricing;
  raw?: unknown;
};

const FOREIGN_SET_REFERENCE_CACHE_TTL_MS = 10 * 60 * 1000;
const foreignSetReferenceCache = new Map<string, { expiresAt: number; value: ForeignPokemonSet | null }>();
const foreignSetReferenceInflight = new Map<string, Promise<ForeignPokemonSet | null>>();

/** Explicit user retry only; this clears runtime responses, never stored assets. */
export function invalidateForeignPokemonSetReferenceCache() {
  foreignSetReferenceCache.clear();
}

function sanitizeForeignSetRaw(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  const { logo: _logo, logoBase: _logoBase, symbol: _symbol, symbolBase: _symbolBase, cover: _cover, artwork: _artwork, image: _image, images: _images, cards: _cards, ...safe } = value as Record<string, unknown>;
  return stripTcgdexReferencesFromValueBeforePersistence(safe);
}

function sanitizeForeignCardRaw(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  const { image: _image, imageBase: _imageBase, imageSmall: _imageSmall, imageLarge: _imageLarge, images: _images, set, ...safe } = value as Record<string, unknown>;
  return stripTcgdexReferencesFromValueBeforePersistence({ ...safe, set: sanitizeForeignSetRaw(set) });
}

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

export function hydrateForeignPokemonControlledCardReference(
  card: ForeignPokemonCardBrief | ForeignPokemonCard,
  envelope: { source?: string | null; language?: string | null; providerSetId?: string | null },
) {
  if (!['ja', 'zh-tw', 'zh-cn'].includes(card.language)) return card;
  const descriptor = card.controlledReference;
  const safeRaw = sanitizeForeignCardRaw((card as ForeignPokemonCard).raw);
  if (envelope.source !== 'tcgdex' || !descriptor
    || descriptor.sourceCode !== 'tcgdex'
    || descriptor.provenance !== 'tcgdex_live_or_ttl_cached_provider_card_record'
    || descriptor.providerCardId !== card.providerCardId
    || descriptor.localId !== String(card.localId ?? card.number ?? '')
    || (envelope.language && envelope.language !== card.language)
    || (envelope.providerSetId && envelope.providerSetId !== descriptor.providerSetId)) {
    return { ...card, ...((card as ForeignPokemonCard).raw === undefined ? {} : { raw: safeRaw }), image: null, imageSmall: null, imageBase: null, controlledReference: null };
  }
  const resolved = resolveTcgdexControlledCardReference({
    language: card.language, providerCardId: descriptor.providerCardId,
    providerSetId: descriptor.providerSetId, localId: descriptor.localId,
    providerLowResolutionUri: descriptor.uri, provenance: descriptor.provenance,
  });
  return { ...card, ...((card as ForeignPokemonCard).raw === undefined ? {} : { raw: safeRaw }), image: resolved?.uri ?? null, imageSmall: resolved?.uri ?? null, imageBase: null, controlledReference: resolved ? descriptor : null };
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
  const cacheKey = `${String(options.language ?? '').trim().toLowerCase()}:${setId.trim()}`;
  const cached = foreignSetReferenceCache.get(cacheKey);
  if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
  const inflight = foreignSetReferenceInflight.get(cacheKey);
  if (inflight) return inflight;
  const request = (async () => {
  const json = await fetchForeignJson<{ source?: string; language?: string; set: ForeignPokemonSet }>(
    `/api/foreign/sets/${encodeURIComponent(setId)}${query ? `?${query}` : ''}`
  );
  if (!json.set) return null;
  return { ...json.set, cards: (json.set.cards ?? []).map((card) => hydrateForeignPokemonControlledCardReference(card, { source: json.source, language: json.language, providerSetId: json.set.providerSetId ?? json.set.id })) };
  })();
  foreignSetReferenceInflight.set(cacheKey, request);
  try {
    const value = await request;
    if (value) foreignSetReferenceCache.set(cacheKey, { expiresAt: Date.now() + FOREIGN_SET_REFERENCE_CACHE_TTL_MS, value });
    else foreignSetReferenceCache.delete(cacheKey);
    return value;
  }
  finally { foreignSetReferenceInflight.delete(cacheKey); }
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
  const json = await fetchForeignJson<{ source?: string; language?: string; cards: (ForeignPokemonCardBrief | ForeignPokemonCard)[] }>(
    `/api/foreign/cards/search?${params.toString()}`
  );
  return (json.cards ?? []).map((card) => hydrateForeignPokemonControlledCardReference(card, { source: json.source, language: json.language, providerSetId: options.setId ?? null }));
}

export async function fetchForeignPokemonCard(
  cardId: string,
  options: { language?: ForeignPokemonLanguageCode | string | null } = {}
): Promise<ForeignPokemonCard | null> {
  const params = new URLSearchParams();
  if (options.language) params.set('language', String(options.language));
  const query = params.toString();
  const json = await fetchForeignJson<{ source?: string; language?: string; card: ForeignPokemonCard }>(
    `/api/foreign/cards/${encodeURIComponent(cardId)}${query ? `?${query}` : ''}`
  );
  return json.card ? hydrateForeignPokemonControlledCardReference(json.card, { source: json.source, language: json.language }) as ForeignPokemonCard : null;
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
