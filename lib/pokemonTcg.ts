import { Image, InteractionManager } from 'react-native';
import { supabase } from './supabase';

export type PokemonSet = {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  releaseDate: string;
  language?: PokemonCardLanguage;
  region?: string | null;
  externalIds?: Record<string, any>;
  images?: {
    symbol?: string;
    logo?: string;
  };
};

export type PokemonCardLanguage = 'en' | 'ja';

export type PokemonCard = {
  id: string;
  name: string;
  number: string;
  language?: PokemonCardLanguage;
  region?: string | null;
  externalIds?: Record<string, any>;
  rarity?: string;
  images?: {
    small?: string;
    large?: string;
  };
  set?: { id?: string; name?: string; series?: string };
  tcgplayer?: { prices?: Record<string, any> };
  cardmarket?: { prices?: Record<string, any> };
  artist?: string;
  supertype?: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  flavorText?: string;
  rules?: string[];
  attacks?: any[];
  weaknesses?: any[];
  resistances?: any[];
  retreatCost?: string[];
  raw_data?: any;
};

const POKEMON_TCG_IMAGE_BASE_URL = 'https://images.pokemontcg.io';
const SCRYDEX_IMAGE_BASE_URL = 'https://images.scrydex.com/pokemon';
const POKEMON_SET_CACHE_TTL_MS = 10 * 60 * 1000;
const POKEMON_SET_CARDS_CACHE_TTL_MS = 10 * 60 * 1000;

type PokemonSetLanguageFilter = PokemonCardLanguage | 'all';
type FetchAllSetsOptions = {
  language?: PokemonSetLanguageFilter | string | null;
};
type FetchCardsForSetOptions = {
  language?: PokemonCardLanguage | string | null;
};

let allSetsCache = new Map<string, { expiresAt: number; value: PokemonSet[] }>();
let allSetsInflight = new Map<string, Promise<PokemonSet[]>>();
const cardsForSetCache = new Map<string, { expiresAt: number; value: PokemonCard[] }>();
const cardsForSetInflight = new Map<string, Promise<PokemonCard[]>>();
const prefetchedSetLogoUrls = new Set<string>();

const SET_ID_ALIASES: Record<string, string> = {
  'destined rivals': 'sv10',
  'destined-rivals': 'sv10',
  destinedrivals: 'sv10',
  'phantasmal flames': 'me2',
  'phantasmal-flames': 'me2',
  phantasmalflames: 'me2',
  'perfect order': 'me3',
  'perfect-order': 'me3',
  perfectorder: 'me3',
  'perect order': 'me3',
  'perect-order': 'me3',
  perectorder: 'me3',
};

function normalizeSetId(setId?: string | null) {
  const normalized = String(setId ?? '').trim().toLowerCase();
  if (!normalized) return normalized;

  const spaced = normalized.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const dashed = spaced.replace(/\s+/g, '-');
  const compact = spaced.replace(/\s+/g, '');

  return SET_ID_ALIASES[normalized]
    ?? SET_ID_ALIASES[spaced]
    ?? SET_ID_ALIASES[dashed]
    ?? SET_ID_ALIASES[compact]
    ?? dashed;
}

export function normalizePokemonCardLanguage(language?: string | null): PokemonCardLanguage {
  const cleaned = String(language ?? 'en').trim().toLowerCase();
  if (['ja', 'jp', 'jpn', 'japanese', 'japan'].includes(cleaned)) return 'ja';
  return 'en';
}

function normalizeSetLanguageFilter(language?: string | null): PokemonSetLanguageFilter {
  const cleaned = String(language ?? 'en').trim().toLowerCase();
  if (cleaned === 'all') return 'all';
  return normalizePokemonCardLanguage(cleaned);
}

function shouldUseScrydexImages(setId?: string | null) {
  const normalized = normalizeSetId(setId);
  if (normalized === 'me2pt5') return true;

  return /^me\d+$/.test(normalized);
}

export function getPokemonSetLogoUrl(setId?: string | null): string | undefined {
  if (!setId) return undefined;
  const normalized = normalizeSetId(setId);
  const url = shouldUseScrydexImages(setId)
    ? `${SCRYDEX_IMAGE_BASE_URL}/${encodeURIComponent(normalized)}-logo/logo`
    : `${POKEMON_TCG_IMAGE_BASE_URL}/${encodeURIComponent(normalized)}/logo.png`;
  prefetchPokemonSetLogoUrl(url);
  return url;
}

export function getPokemonSetSymbolUrl(setId?: string | null): string | undefined {
  if (!setId) return undefined;
  const normalized = normalizeSetId(setId);
  if (shouldUseScrydexImages(setId)) {
    return `${SCRYDEX_IMAGE_BASE_URL}/${encodeURIComponent(normalized)}-symbol/symbol`;
  }
  return `${POKEMON_TCG_IMAGE_BASE_URL}/${encodeURIComponent(normalized)}/symbol.png`;
}

export function getPokemonSetArtworkUrl(setId?: string | null): string | undefined {
  return getPokemonSetSymbolUrl(setId);
}

export function getPokemonSetBranding(setId?: string | null) {
  if (!setId) {
    return {
      normalizedSetId: '',
      logoUrl: undefined,
      artworkUrl: undefined,
      symbolUrl: undefined,
    };
  }

  const normalizedSetId = normalizeSetId(setId);
  const logoUrl = getPokemonSetLogoUrl(normalizedSetId);
  const symbolUrl = getPokemonSetSymbolUrl(normalizedSetId);
  return {
    normalizedSetId,
    logoUrl,
    artworkUrl: symbolUrl,
    symbolUrl,
  };
}

export function getPokemonCardImageUrls(cardId: string, fallbackSetId?: string | null, fallbackNumber?: string | null) {
  const setId = normalizeSetId(fallbackSetId || cardId.split('-')[0]);
  const idPrefix = `${setId}-`;
  const idNumber = cardId.startsWith(idPrefix) ? cardId.slice(idPrefix.length) : null;
  const rawNumber = idNumber || fallbackNumber || '';
  const imageNumber = /^\d+$/.test(rawNumber) ? String(Number(rawNumber)) : rawNumber;

  if (!setId || !imageNumber) {
    return { small: undefined, large: undefined };
  }

  if (shouldUseScrydexImages(setId)) {
    const imageId = `${setId}-${imageNumber}`;
    return {
      small: `${SCRYDEX_IMAGE_BASE_URL}/${encodeURIComponent(imageId)}/small`,
      large: `${SCRYDEX_IMAGE_BASE_URL}/${encodeURIComponent(imageId)}/large`,
    };
  }

  return {
    small: `${POKEMON_TCG_IMAGE_BASE_URL}/${setId}/${imageNumber}.png`,
    large: `${POKEMON_TCG_IMAGE_BASE_URL}/${setId}/${imageNumber}_hires.png`,
  };
}

function prefetchPokemonSetLogoUrl(url?: string | null) {
  if (!url || prefetchedSetLogoUrls.has(url)) return;
  prefetchedSetLogoUrls.add(url);
  InteractionManager.runAfterInteractions(() => {
    Image.prefetch(url).catch(() => {
      prefetchedSetLogoUrls.delete(url);
    });
  });
}

export function prefetchPokemonSetLogos(setIds: Array<string | null | undefined>) {
  for (const setId of setIds) {
    const url = getPokemonSetLogoUrl(setId);
    if (url) prefetchPokemonSetLogoUrl(url);
  }
}

function getBestPokemonTcgImages(card: {
  id: string;
  set_id?: string | null;
  number?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  raw_data?: any;
}) {
  const rawImages = card.raw_data?.images;
  const dbSmall = card.image_small ?? null;
  const dbLarge = card.image_large ?? null;
  const rawSmall = rawImages?.small ?? null;
  const rawLarge = rawImages?.large ?? null;

  const hasScryDexImage = [dbSmall, dbLarge, rawSmall, rawLarge].some((url) =>
    String(url ?? '').includes('images.scrydex.com')
  );

  if (hasScryDexImage) {
    return {
      small: rawSmall ?? dbSmall ?? undefined,
      large: rawLarge ?? dbLarge ?? undefined,
    };
  }

  return getPokemonCardImageUrls(card.id, card.set_id, card.number);
}

export async function fetchAllSets(options: FetchAllSetsOptions = {}): Promise<PokemonSet[]> {
  const language = normalizeSetLanguageFilter(options.language);
  const cacheKey = `sets:${language}`;
  const cached = allSetsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const inflight = allSetsInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    let query = supabase
      .from('pokemon_sets')
      .select(
        'id, name, series, printed_total, total, release_date, symbol_url, logo_url, language, region, external_ids'
      )
      .order('release_date', { ascending: false });

    if (language !== 'all') {
      query = query.eq('language', language);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const sets = (data ?? []).map((set) => ({
      id: set.id,
      name: set.name,
      series: set.series ?? '',
      printedTotal: set.printed_total ?? 0,
      total: set.total ?? 0,
      releaseDate: set.release_date ?? '',
      language: normalizePokemonCardLanguage(set.language),
      region: set.region ?? null,
      externalIds: set.external_ids ?? {},
      images: {
        symbol: set.symbol_url ?? getPokemonSetSymbolUrl(set.id),
        logo: set.logo_url ?? getPokemonSetLogoUrl(set.id),
      },
    }));

    prefetchPokemonSetLogos(sets.map((set) => set.id));
    allSetsCache.set(cacheKey, {
      expiresAt: Date.now() + POKEMON_SET_CACHE_TTL_MS,
      value: sets,
    });
    return sets;
  })();

  allSetsInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    allSetsInflight.delete(cacheKey);
  }
}

export async function fetchCardsForSet(setId: string, options: FetchCardsForSetOptions = {}): Promise<PokemonCard[]> {
  const normalizedSetId = normalizeSetId(setId);
  const language = normalizePokemonCardLanguage(options.language);
  const cacheKey = `${language}:${normalizedSetId}`;
  const cached = cardsForSetCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const inflight = cardsForSetInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select('id, name, language, region, external_ids, number, rarity, image_small, image_large, set_id, raw_data')
      .eq('set_id', normalizedSetId)
      .eq('language', language)
      .order('number', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const cards = (data ?? []).map((card) => {
      const images = getBestPokemonTcgImages(card);

      return {
        id: card.id,
        name: card.name,
        number: card.number ?? '',
        language: normalizePokemonCardLanguage(card.language),
        region: card.region ?? null,
        externalIds: card.external_ids ?? {},
        rarity: card.rarity ?? undefined,
        images,
        set: card.raw_data?.set ?? undefined,
        tcgplayer: card.raw_data?.tcgplayer ?? undefined,
        cardmarket: card.raw_data?.cardmarket ?? undefined,
        artist: card.raw_data?.artist ?? undefined,
        supertype: card.raw_data?.supertype ?? undefined,
        subtypes: card.raw_data?.subtypes ?? undefined,
        hp: card.raw_data?.hp ?? undefined,
        types: card.raw_data?.types ?? undefined,
        evolvesFrom: card.raw_data?.evolvesFrom ?? undefined,
        flavorText: card.raw_data?.flavorText ?? undefined,
        rules: card.raw_data?.rules ?? undefined,
        attacks: card.raw_data?.attacks ?? undefined,
        weaknesses: card.raw_data?.weaknesses ?? undefined,
        resistances: card.raw_data?.resistances ?? undefined,
        retreatCost: card.raw_data?.retreatCost ?? undefined,
        raw_data: card.raw_data ?? undefined,
      };
    });

    cardsForSetCache.set(cacheKey, {
      expiresAt: Date.now() + POKEMON_SET_CARDS_CACHE_TTL_MS,
      value: cards,
    });
    return cards;
  })();

  cardsForSetInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    cardsForSetInflight.delete(cacheKey);
  }
}

export async function fetchCardById(
  cardId: string,
  options: { language?: PokemonCardLanguage | string | null } = {}
): Promise<PokemonCard | null> {
  let query = supabase
    .from('pokemon_cards')
    .select('id, name, language, region, external_ids, number, rarity, image_small, image_large, set_id, raw_data')
    .eq('id', cardId);

  if (options.language) {
    query = query.eq('language', normalizePokemonCardLanguage(options.language));
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.log('Failed to fetch card by ID:', error.message);
    return null;
  }

  if (!data) return null;

  const images = getBestPokemonTcgImages(data);

  return {
    id: data.id,
    name: data.name,
    number: data.number ?? '',
    language: normalizePokemonCardLanguage(data.language),
    region: data.region ?? null,
    externalIds: data.external_ids ?? {},
    rarity: data.rarity ?? undefined,
    images,
    set: data.raw_data?.set ?? undefined,
    tcgplayer: data.raw_data?.tcgplayer ?? undefined,
    cardmarket: data.raw_data?.cardmarket ?? undefined,
    artist: data.raw_data?.artist ?? undefined,
    supertype: data.raw_data?.supertype ?? undefined,
    subtypes: data.raw_data?.subtypes ?? undefined,
    hp: data.raw_data?.hp ?? undefined,
    types: data.raw_data?.types ?? undefined,
    attacks: data.raw_data?.attacks ?? undefined,
    weaknesses: data.raw_data?.weaknesses ?? undefined,
    resistances: data.raw_data?.resistances ?? undefined,
    raw_data: data.raw_data ?? undefined,
  };
}
