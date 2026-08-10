import { supabase } from './supabase';
import { getCuratedPokemonCardDbRow } from './curatedPokemonCatalogue';
import { fetchStackrCardRows } from './stackrDomainAdapter';
import {
  getEnglishCardDisplayName,
  getLocalCardName,
  getPreferredCardDisplayName,
} from './pokemonDisplayNames';

export type ListingStats = {
  count: number;
  lowest: number | null;
};

export type PokemonCardDetailRow = {
  id: string;
  name?: string | null;
  language?: string | null;
  number?: string | null;
  rarity?: string | null;
  set_id?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  raw_data?: any;
};

type CanonicalCardDetailRow = {
  id: string;
  canonical_name?: string | null;
  local_name?: string | null;
  english_display_name?: string | null;
  language?: string | null;
  collector_number?: string | null;
  rarity?: string | null;
  set_id?: string | null;
  image_small_url?: string | null;
  image_large_url?: string | null;
  raw_payload?: any;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const CARD_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const LISTING_STATS_CACHE_TTL_MS = 60 * 1000;
const EMPTY_DETAIL_CACHE_TTL_MS = 30 * 1000;
const SUPABASE_IN_CHUNK_SIZE = 100;

const cardDetailCache = new Map<string, CacheEntry<PokemonCardDetailRow | null>>();
const cardListingStatsCache = new Map<string, CacheEntry<ListingStats>>();
const productListingStatsCache = new Map<string, CacheEntry<ListingStats>>();
const cardDetailInflight = new Map<string, Promise<Map<string, PokemonCardDetailRow>>>();
const cardStatsInflight = new Map<string, Promise<Map<string, ListingStats>>>();
const productStatsInflight = new Map<string, Promise<Map<string, ListingStats>>>();

const emptyListingStats = (): ListingStats => ({ count: 0, lowest: null });

function uniqueValues(values: (string | null | undefined)[]) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function mapCuratedCardDetail(cardId: string): PokemonCardDetailRow | null {
  const row = getCuratedPokemonCardDbRow(cardId);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    language: row.language,
    number: row.number,
    rarity: row.rarity,
    set_id: row.set_id,
    image_small: row.image_small,
    image_large: row.image_large,
    raw_data: row.raw_data,
  };
}

function chunkValues<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function getBatchKey(prefix: string, values: string[]) {
  return `${prefix}:${[...values].sort().join('|')}`;
}

function getFreshValue<T>(cache: Map<string, CacheEntry<T>>, key: string, now: number) {
  const cached = cache.get(key);
  return cached && cached.expiresAt > now ? cached.value : undefined;
}

function mapCanonicalCardDetail(row: CanonicalCardDetailRow): PokemonCardDetailRow {
  const raw = row.raw_payload ?? {};
  const localName = getLocalCardName({
    id: row.id,
    sourceId: raw.id ?? row.id,
    language: row.language ?? raw.language ?? null,
    localName: row.local_name ?? raw.local_name ?? null,
    fallbackName: raw.name ?? row.canonical_name ?? row.id,
    raw,
  });
  const englishDisplayName = getEnglishCardDisplayName({
    id: row.id,
    sourceId: raw.id ?? row.id,
    setId: row.set_id ?? raw.set?.id ?? null,
    collectorNumber: row.collector_number ?? raw.localId ?? raw.number ?? null,
    language: row.language ?? raw.language ?? null,
    localName,
    englishDisplayName: row.english_display_name ?? raw.english_display_name ?? null,
    canonicalName: row.canonical_name ?? raw.canonical_name ?? null,
    fallbackName: raw.name ?? row.id,
    raw,
  });
  const name = getPreferredCardDisplayName({
    id: row.id,
    sourceId: raw.id ?? row.id,
    setId: row.set_id ?? raw.set?.id ?? null,
    collectorNumber: row.collector_number ?? raw.localId ?? raw.number ?? null,
    language: row.language ?? raw.language ?? null,
    localName,
    englishDisplayName,
    canonicalName: row.canonical_name ?? raw.canonical_name ?? null,
    fallbackName: raw.name ?? row.id,
    raw,
  });

  return {
    id: row.id,
    name,
    language: row.language ?? raw.language ?? null,
    number: row.collector_number ?? raw.localId ?? raw.number ?? null,
    rarity: row.rarity ?? raw.rarity ?? null,
    set_id: row.set_id ?? raw.set?.id ?? null,
    image_small: row.image_small_url ?? raw.images?.small ?? null,
    image_large: row.image_large_url ?? raw.images?.large ?? null,
    raw_data: {
      ...raw,
      id: raw.id ?? row.id.replace(/^(en|ja|jp|zh-tw|zh_tw|zhtw|zh):/i, ''),
      name,
      local_name: localName,
      english_display_name: englishDisplayName ?? row.english_display_name ?? raw.english_display_name ?? null,
      number: row.collector_number ?? raw.localId ?? raw.number ?? null,
      set: {
        ...(raw.set ?? {}),
        id: row.set_id ?? raw.set?.id ?? null,
      },
      images: {
        ...(raw.images ?? {}),
        small: row.image_small_url ?? raw.images?.small ?? null,
        large: row.image_large_url ?? raw.images?.large ?? null,
      },
    },
  };
}

function cacheListingStats(cache: Map<string, CacheEntry<ListingStats>>, key: string, value: ListingStats) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + LISTING_STATS_CACHE_TTL_MS,
  });
}

function addListingPrice(stats: ListingStats, askingPrice: unknown): ListingStats {
  const price = askingPrice == null ? null : Number(askingPrice);
  return {
    count: stats.count + 1,
    lowest: price == null || !Number.isFinite(price)
      ? stats.lowest
      : stats.lowest == null
        ? price
        : Math.min(stats.lowest, price),
  };
}

export async function fetchCachedPokemonCardDetails(cardIds: string[]) {
  const result = new Map<string, PokemonCardDetailRow>();
  const now = Date.now();
  const missingIds: string[] = [];

  for (const cardId of uniqueValues(cardIds)) {
    const curated = mapCuratedCardDetail(cardId);
    if (curated) {
      result.set(cardId, curated);
      cardDetailCache.set(cardId, {
        value: curated,
        expiresAt: now + CARD_DETAIL_CACHE_TTL_MS,
      });
      continue;
    }

    const cached = getFreshValue(cardDetailCache, cardId, now);
    if (cached === undefined) {
      missingIds.push(cardId);
    } else if (cached) {
      result.set(cardId, cached);
    }
  }

  if (!missingIds.length) return result;

  for (const chunk of chunkValues(missingIds, SUPABASE_IN_CHUNK_SIZE)) {
    const batchKey = getBatchKey('pokemon-card-details', chunk);
    const request = cardDetailInflight.get(batchKey) ?? (async () => {
      const stackrRows = await fetchStackrCardRows(chunk);
      const rows = new Map<string, PokemonCardDetailRow>();
      const foundIds = new Set<string>();

      for (const legacyId of chunk) {
        const row = stackrRows.get(legacyId);
        if (!row?.id) continue;
        const mapped: PokemonCardDetailRow = row;
        foundIds.add(legacyId);
        rows.set(legacyId, mapped);
        cardDetailCache.set(legacyId, {
          value: mapped,
          expiresAt: Date.now() + CARD_DETAIL_CACHE_TTL_MS,
        });
      }

      for (const cardId of chunk) {
        if (foundIds.has(cardId)) continue;
        cardDetailCache.set(cardId, {
          value: null,
          expiresAt: Date.now() + EMPTY_DETAIL_CACHE_TTL_MS,
        });
      }

      return rows;
    })().finally(() => {
      cardDetailInflight.delete(batchKey);
    });

    cardDetailInflight.set(batchKey, request);
    const rows = await request;
    rows.forEach((row, cardId) => result.set(cardId, row));
  }

  return result;
}

export async function fetchCachedCardListingStats(cardIds: string[]) {
  const result = new Map<string, ListingStats>();
  const now = Date.now();
  const missingIds: string[] = [];

  for (const cardId of uniqueValues(cardIds)) {
    const cached = getFreshValue(cardListingStatsCache, cardId, now);
    if (cached) {
      result.set(cardId, cached);
    } else {
      missingIds.push(cardId);
    }
  }

  if (!missingIds.length) return result;

  for (const chunk of chunkValues(missingIds, SUPABASE_IN_CHUNK_SIZE)) {
    const batchKey = getBatchKey('card-listing-stats', chunk);
    const request = cardStatsInflight.get(batchKey) ?? (async () => {
      const next = new Map<string, ListingStats>(chunk.map((cardId) => [cardId, emptyListingStats()]));
      const { data, error } = await supabase
        .from('user_card_flags')
        .select('card_id, asking_price')
        .eq('flag_type', 'trade')
        .or('listing_status.eq.active,listing_status.is.null')
        .in('card_id', chunk);

      if (error) throw error;

      for (const row of (data ?? []) as any[]) {
        const cardId = String(row.card_id ?? '');
        if (!cardId) continue;
        next.set(cardId, addListingPrice(next.get(cardId) ?? emptyListingStats(), row.asking_price));
      }

      next.forEach((stats, cardId) => cacheListingStats(cardListingStatsCache, cardId, stats));
      return next;
    })().finally(() => {
      cardStatsInflight.delete(batchKey);
    });

    cardStatsInflight.set(batchKey, request);
    const rows = await request;
    rows.forEach((stats, cardId) => result.set(cardId, stats));
  }

  return result;
}

export async function fetchCachedProductListingStatsByName(productNames: string[]) {
  const result = new Map<string, ListingStats>();
  const now = Date.now();
  const missingNames: string[] = [];

  for (const productName of uniqueValues(productNames)) {
    const cached = getFreshValue(productListingStatsCache, productName, now);
    if (cached) {
      result.set(productName, cached);
    } else {
      missingNames.push(productName);
    }
  }

  if (!missingNames.length) return result;

  for (const chunk of chunkValues(missingNames, SUPABASE_IN_CHUNK_SIZE)) {
    const batchKey = getBatchKey('product-listing-stats', chunk);
    const request = productStatsInflight.get(batchKey) ?? (async () => {
      const next = new Map<string, ListingStats>(chunk.map((name) => [name, emptyListingStats()]));
      const { data, error } = await supabase
        .from('user_card_flags')
        .select('product_name, asking_price')
        .eq('flag_type', 'trade')
        .or('listing_status.eq.active,listing_status.is.null')
        .in('product_name', chunk);

      if (error) throw error;

      for (const row of (data ?? []) as any[]) {
        const productName = String(row.product_name ?? '');
        if (!productName) continue;
        next.set(productName, addListingPrice(next.get(productName) ?? emptyListingStats(), row.asking_price));
      }

      next.forEach((stats, productName) => cacheListingStats(productListingStatsCache, productName, stats));
      return next;
    })().finally(() => {
      productStatsInflight.delete(batchKey);
    });

    productStatsInflight.set(batchKey, request);
    const rows = await request;
    rows.forEach((stats, productName) => result.set(productName, stats));
  }

  return result;
}

export function invalidateMarketSearchDataCache() {
  cardDetailCache.clear();
  cardListingStatsCache.clear();
  productListingStatsCache.clear();
  cardDetailInflight.clear();
  cardStatsInflight.clear();
  productStatsInflight.clear();
}
