import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchBinders, type BinderCardRecord, type BinderRecord } from './binders';
import { USD_TO_GBP } from './config';
import { fetchOwnedCardRows, type OwnedCardRow } from './ownership';
import { getPriceFromPokemonCard } from './pricing';
import { supabase } from './supabase';
import { bumpCollectionSummaryVersion, getCollectionSummaryVersion } from './collectionSummaryInvalidation';

const SUMMARY_CACHE_TTL_MS = 60 * 1000;
const SUMMARY_PERSISTED_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SUMMARY_CACHE_STORAGE_PREFIX = 'stackr:collection-summary:v2:';
const MASTER_SET_STORAGE_PREFIX = 'stackr:binder-master-set:';

export type CollectionSummary = {
  totalOwnedItems: number;
  totalCardsOwned: number;
  uniqueCards: number;
  rawCardsOwned: number;
  gradedSlabsOwned: number;
  sealedProductsOwned: number;
  duplicateCopies: number;
  collectionValue: number;
  binderCount: number;
  completedSets: number;
  updatedAt: string;
};

let cachedSummary: { userId: string; version: number; expiresAt: number; value: CollectionSummary } | null = null;
let inflightSummary: { userId: string; version: number; promise: Promise<CollectionSummary> } | null = null;

const toQuantity = (value: unknown) => Math.max(1, Math.floor(Number(value ?? 1) || 1));
const ownedQuantity = (card: BinderCardRecord) => card.owned ? toQuantity(card.owned_quantity) : 0;
const cardKey = (setId?: string | null, cardId?: string | null) => `${setId ?? ''}:${cardId ?? ''}`;
const POKEMON_CARD_COLUMNS = 'id, name, number, rarity, image_small, image_large, set_id, raw_data';
const SAVED_BINDER_CARD_COLUMNS = 'id, binder_id, card_id, set_id, language, api_card_id, card_name, api_set_id, card_number, image_url, set_name, set_total, slot_order, owned, owned_quantity, condition, grade_company, grade, notes, ebay_price, tcg_price, cardmarket_price, last_price_update, created_at';
const METADATA_CHUNK_SIZE = 100;
const METADATA_CONCURRENCY = 3;
const SAVED_BINDER_CARD_PAGE_SIZE = 1000;

const TCG_PRICE_VARIANT_PRIORITY = [
  'holofoil',
  'reverseHolofoil',
  'reverseHoloEnergy',
  'reverseHoloPokeball',
  'normal',
  'unlimitedHolofoil',
  'unlimited',
  '1stEditionHolofoil',
  '1stEditionNormal',
];

const TCG_PRICE_VARIANT_FALLBACKS: Record<string, string[]> = {
  card: TCG_PRICE_VARIANT_PRIORITY,
  normal: ['normal', 'unlimited'],
  unlimited: ['unlimited', 'normal'],
  holofoil: ['holofoil', 'unlimitedHolofoil'],
  unlimitedHolofoil: ['unlimitedHolofoil', 'holofoil'],
  reverseHolofoil: ['reverseHolofoil', 'reverseHoloEnergy', 'reverseHoloPokeball', 'holofoil', 'normal'],
  reverseHoloEnergy: ['reverseHoloEnergy', 'reverseHolofoil', 'normal'],
  reverseHoloPokeball: ['reverseHoloPokeball', 'reverseHolofoil', 'normal'],
  '1stEditionNormal': ['1stEditionNormal'],
  '1stEditionHolofoil': ['1stEditionHolofoil'],
};

const TCG_PRICE_EDITION_FALLBACKS: Record<string, string[]> = {
  '1st_edition': ['1stEditionHolofoil', '1stEditionNormal'],
  unlimited: ['unlimitedHolofoil', 'unlimited', 'holofoil', 'normal', 'reverseHolofoil', 'reverseHoloEnergy', 'reverseHoloPokeball'],
};

function toGbpFromUsd(value: number) {
  return Math.round(value * USD_TO_GBP * 100) / 100;
}

function getTcgEntryUsd(entry: any): number | null {
  const value = entry?.market ?? entry?.mid ?? entry?.low;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getTcgPriceFromPricesGbp(prices: any, variant?: string | null, edition?: string | null): number | null {
  if (!prices) return null;
  const preferred = variant
    ? TCG_PRICE_VARIANT_FALLBACKS[variant] ?? [variant, ...TCG_PRICE_VARIANT_PRIORITY]
    : edition
      ? TCG_PRICE_EDITION_FALLBACKS[edition] ?? TCG_PRICE_VARIANT_PRIORITY
      : TCG_PRICE_VARIANT_PRIORITY;

  for (const key of preferred) {
    const usd = getTcgEntryUsd(prices[key]);
    if (usd != null) return toGbpFromUsd(usd);
  }

  if (variant || edition) return null;
  for (const entry of Object.values(prices) as any[]) {
    const usd = getTcgEntryUsd(entry);
    if (usd != null) return toGbpFromUsd(usd);
  }
  return null;
}

function getOwnedCardCurrentTcgGbp(card: any, variant?: string | null, edition?: string | null): number | null {
  const prices =
    card?.card?.tcgplayer?.prices ??
    card?.card?.raw_data?.tcgplayer?.prices ??
    card?.raw_data?.tcgplayer?.prices ??
    card?.tcgplayer?.prices ??
    null;
  const variantPrice = getTcgPriceFromPricesGbp(prices, variant, edition);
  const direct = card?.tcg_price;
  const directPrice = typeof direct === 'number' && Number.isFinite(direct) && direct > 0
    ? Math.round(direct * 100) / 100
    : null;

  if ((variant || edition) && variantPrice != null) return variantPrice;
  const rawFallback = getPriceFromPokemonCard(card?.raw_data ?? card?.card?.raw_data ?? card);
  return directPrice ?? variantPrice ?? (typeof rawFallback === 'number' ? toGbpFromUsd(rawFallback) : null);
}

async function isMasterSetEnabled(binder: BinderRecord) {
  try {
    const stored = await AsyncStorage.getItem(`${MASTER_SET_STORAGE_PREFIX}${binder.id}`);
    return stored === 'true' || binder.master_set_enabled === true;
  } catch {
    return binder.master_set_enabled === true;
  }
}

function getVariantRowsByCard(rows: OwnedCardRow[]) {
  const map = new Map<string, OwnedCardRow[]>();
  for (const row of rows) {
    const key = cardKey(row.set_id, row.card_id);
    const current = map.get(key) ?? [];
    current.push(row);
    map.set(key, current);
  }
  return map;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function fetchPokemonCardsById(cardIds: string[]) {
  const uniqueIds = [...new Set(cardIds.filter(Boolean))];
  const cardMap = new Map<string, any>();

  const rowsByChunk = await mapWithConcurrency(chunk(uniqueIds, METADATA_CHUNK_SIZE), METADATA_CONCURRENCY, async (idChunk) => {
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select(POKEMON_CARD_COLUMNS)
      .in('id', idChunk);
    if (error) throw error;
    return data ?? [];
  });

  for (const rows of rowsByChunk) {
    for (const card of rows) if (card.id) cardMap.set(card.id, card);
  }

  return cardMap;
}

async function fetchSavedOwnedBinderCards(binderIds: string[]) {
  const uniqueBinderIds = [...new Set(binderIds.filter(Boolean))];
  const rowsByChunk = await mapWithConcurrency(chunk(uniqueBinderIds, METADATA_CHUNK_SIZE), METADATA_CONCURRENCY, async (binderIdChunk) => {
    const rows: BinderCardRecord[] = [];
    for (let from = 0; ; from += SAVED_BINDER_CARD_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('binder_cards')
        .select(SAVED_BINDER_CARD_COLUMNS)
        .in('binder_id', binderIdChunk)
        .eq('owned', true)
        .order('slot_order', { ascending: true })
        .range(from, from + SAVED_BINDER_CARD_PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as BinderCardRecord[]));
      if (!data || data.length < SAVED_BINDER_CARD_PAGE_SIZE) return rows;
    }
  });
  return rowsByChunk.flat();
}

function buildCardLikeFromOwnedRow(row: OwnedCardRow, card?: any | null) {
  const raw = card?.raw_data ?? {};
  const images = raw.images ?? {};
  const set = raw.set ?? null;

  return {
    card_id: row.card_id,
    set_id: row.set_id,
    card_name: card?.name ?? raw.name ?? row.card_id,
    card_number: card?.number ?? raw.number ?? null,
    image_url: card?.image_small ?? card?.image_large ?? images.small ?? images.large ?? null,
    card: {
      id: card?.id ?? row.card_id,
      name: card?.name ?? raw.name ?? row.card_id,
      number: card?.number ?? raw.number ?? null,
      rarity: card?.rarity ?? raw.rarity ?? null,
      images: {
        small: card?.image_small ?? images.small ?? null,
        large: card?.image_large ?? images.large ?? null,
      },
      set,
      tcgplayer: raw.tcgplayer ?? null,
      cardmarket: raw.cardmarket ?? null,
      raw_data: raw,
    },
    raw_data: raw,
    tcgplayer: raw.tcgplayer ?? null,
    tcg_price: null,
  };
}

function buildCardLikeFromSavedBinderRow(row: BinderCardRecord, card?: any | null) {
  const raw = card?.raw_data ?? row.card?.raw_data ?? {};
  const images = raw.images ?? {};
  return {
    ...row,
    card_id: row.card_id,
    set_id: row.set_id,
    card_name: row.card_name ?? card?.name ?? raw.name ?? row.card_id,
    card_number: row.card_number ?? card?.number ?? raw.number ?? null,
    image_url: row.image_url ?? card?.image_small ?? card?.image_large ?? images.small ?? images.large ?? null,
    card: {
      id: card?.id ?? row.card_id,
      name: row.card_name ?? card?.name ?? raw.name ?? row.card_id,
      number: row.card_number ?? card?.number ?? raw.number ?? null,
      rarity: card?.rarity ?? raw.rarity ?? null,
      images: {
        small: row.image_url ?? card?.image_small ?? images.small ?? null,
        large: card?.image_large ?? images.large ?? null,
      },
      set: raw.set ?? null,
      tcgplayer: raw.tcgplayer ?? null,
      cardmarket: raw.cardmarket ?? null,
      raw_data: raw,
    },
    raw_data: raw,
    tcgplayer: raw.tcgplayer ?? null,
    tcg_price: row.tcg_price,
  };
}

async function getCompletedSetCount(
  binders: BinderRecord[],
  savedOwnedRows: BinderCardRecord[],
  variantRows: OwnedCardRow[],
  masterByBinderId: Map<string, boolean>,
) {
  const officialBinders = binders.filter((binder) => binder.type === 'official' && binder.source_set_id);
  if (!officialBinders.length) return 0;

  const setIds = [...new Set(officialBinders.map((binder) => binder.source_set_id).filter(Boolean))] as string[];
  const masterSetIds = [...new Set(officialBinders.filter((binder) => masterByBinderId.get(binder.id)).map((binder) => binder.source_set_id).filter(Boolean))] as string[];

  const [setRowsResult, officialCardsResult] = await Promise.all([
    supabase.from('pokemon_sets').select('id, printed_total, total').in('id', setIds),
    masterSetIds.length
      ? supabase.from('pokemon_cards').select('id, set_id, rarity, raw_data').in('set_id', masterSetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (setRowsResult.error) throw setRowsResult.error;
  if (officialCardsResult.error) throw officialCardsResult.error;
  const setTotals = new Map((setRowsResult.data ?? []).map((set: any) => [set.id, Number(set.printed_total ?? set.total ?? 0)]));
  const savedOwnedKeysBySet = new Map<string, Set<string>>();
  const ownedVariantKeysBySet = new Map<string, Set<string>>();
  const cardsBySet = new Map<string, any[]>();
  const variantsByCard = new Map<string, Set<string>>();

  for (const row of savedOwnedRows) {
    if (!row.set_id || !row.card_id) continue;
    const keys = savedOwnedKeysBySet.get(row.set_id) ?? new Set<string>();
    keys.add(cardKey(row.set_id, row.card_id));
    savedOwnedKeysBySet.set(row.set_id, keys);
  }

  for (const row of variantRows) {
    if (!row.set_id || !row.card_id) continue;
    const keys = ownedVariantKeysBySet.get(row.set_id) ?? new Set<string>();
    keys.add(cardKey(row.set_id, row.card_id));
    ownedVariantKeysBySet.set(row.set_id, keys);
  }

  for (const card of officialCardsResult.data ?? []) {
    if (!card.set_id) continue;
    const current = cardsBySet.get(card.set_id) ?? [];
    current.push(card);
    cardsBySet.set(card.set_id, current);
  }

  for (const row of variantRows) {
    if (!row.card_id || !row.set_id || !row.variant) continue;
    const key = cardKey(row.set_id, row.card_id);
    if (!variantsByCard.has(key)) variantsByCard.set(key, new Set());
    variantsByCard.get(key)!.add(row.variant);
  }

  const completed = new Set<string>();
  for (const binder of officialBinders) {
    const setId = binder.source_set_id;
    if (!setId) continue;
    const ownedCardKeys = new Set([
      ...(savedOwnedKeysBySet.get(setId) ?? new Set<string>()),
      ...(ownedVariantKeysBySet.get(setId) ?? new Set<string>()),
    ]);
    let owned = ownedCardKeys.size;
    let total = setTotals.get(setId) ?? 0;

    if (masterByBinderId.get(binder.id)) {
      const officialCards = cardsBySet.get(setId) ?? [];
      if (officialCards.length) {
        owned = 0;
        total = 0;
        for (const card of officialCards) {
          const variants = Object.keys(card.raw_data?.tcgplayer?.prices ?? {});
          const expectedVariants = variants.length > 1 ? variants : ['normal'];
          const key = cardKey(setId, card.id);
          total += expectedVariants.length;
          owned += expectedVariants.filter((variant) => variantsByCard.get(key)?.has(variant)).length || (ownedCardKeys.has(key) ? 1 : 0);
        }
      }
    }

    if (total > 0 && owned >= total) completed.add(setId);
  }

  return completed.size;
}

async function buildCollectionSummary(userId: string): Promise<CollectionSummary> {
  // The summary only needs binders the user saved and owns. Avoid fetchBinderCards here:
  // official binders otherwise expand an entire catalogue and attach live price snapshots.
  const [binders, variantRows] = await Promise.all([
    fetchBinders({ enrich: false }),
    fetchOwnedCardRows(),
  ]);
  if (binders.some((binder) => binder.user_id !== userId)) {
    throw new Error('Collection summary received binders for a different account.');
  }
  if (variantRows.some((row) => row.user_id !== userId)) {
    throw new Error('Collection summary received ownership rows for a different account.');
  }
  const [savedOwnedRows, masterSetEnabled] = await Promise.all([
    fetchSavedOwnedBinderCards(binders.map((binder) => binder.id)),
    Promise.all(binders.map(async (binder) => [binder.id, await isMasterSetEnabled(binder)] as const)),
  ]);
  const knownBinderIds = new Set(binders.map((binder) => binder.id));
  if (savedOwnedRows.some((row) => !knownBinderIds.has(row.binder_id))) {
    throw new Error('Collection summary received saved cards outside this account\'s binders.');
  }
  const masterEntries = new Map(masterSetEnabled);
  const binderById = new Map(binders.map((binder) => [binder.id, binder]));
  const variantRowsByCard = getVariantRowsByCard(variantRows);
  const ownedCardMap = await fetchPokemonCardsById([
    ...variantRows.map((row) => row.card_id),
    ...savedOwnedRows.map((row) => row.card_id),
  ]);

  let totalOwnedItems = 0;
  let rawCardsOwned = 0;
  let gradedSlabsOwned = 0;
  let duplicateCopies = 0;
  let collectionValue = 0;
  const uniqueCardKeys = new Set<string>();
  const countedUnitKeys = new Set<string>();

  const addUnit = (
    card: any,
    variant: string | null,
    quantity: number,
    mode: 'raw' | 'graded',
    unitKey?: string,
  ) => {
    const key = unitKey ?? `${cardKey(card.set_id, card.card_id)}:${variant ?? 'owned'}:${mode}`;
    if (countedUnitKeys.has(key)) return;
    countedUnitKeys.add(key);
    uniqueCardKeys.add(cardKey(card.set_id, card.card_id));
    const safeQuantity = toQuantity(quantity);
    totalOwnedItems += safeQuantity;
    duplicateCopies += Math.max(0, safeQuantity - 1);
    if (mode === 'graded') gradedSlabsOwned += safeQuantity;
    else rawCardsOwned += safeQuantity;
    const unitValue = getOwnedCardCurrentTcgGbp(card, variant, card.__binderEdition) ?? 0;
    collectionValue += unitValue * safeQuantity;
  };

  for (const row of variantRows) {
    if (!row.card_id || !row.set_id) continue;
    const card = buildCardLikeFromOwnedRow(row, ownedCardMap.get(row.card_id));
    const mode = row.grade_company || row.grade ? 'graded' : 'raw';
    const unitKey = `owned:${row.id ?? `${row.set_id}:${row.card_id}:${row.variant ?? ''}:${row.condition ?? ''}:${row.grade_company ?? ''}:${row.grade ?? ''}`}`;
    addUnit(card, row.variant || 'normal', row.quantity, mode, unitKey);
  }

  for (const savedRow of savedOwnedRows) {
    const binder = binderById.get(savedRow.binder_id);
    const card = {
      ...buildCardLikeFromSavedBinderRow(savedRow, ownedCardMap.get(savedRow.card_id)),
      __binderEdition: binder?.edition ?? null,
    };
    const key = cardKey(card.set_id, card.card_id);
    if (variantRowsByCard.has(key)) continue;
    const mode = binder?.card_mode === 'graded' || savedRow.grade_company || savedRow.grade ? 'graded' : 'raw';
    addUnit(card, null, ownedQuantity(savedRow), mode);
  }

  const completedSets = await getCompletedSetCount(binders, savedOwnedRows, variantRows, masterEntries);

  return {
    totalOwnedItems,
    totalCardsOwned: rawCardsOwned + gradedSlabsOwned,
    uniqueCards: uniqueCardKeys.size,
    rawCardsOwned,
    gradedSlabsOwned,
    sealedProductsOwned: 0,
    duplicateCopies,
    collectionValue: Math.round(collectionValue * 100) / 100,
    binderCount: binders.length,
    completedSets,
    updatedAt: new Date().toISOString(),
  };
}

function getEmptySummary(): CollectionSummary {
  return {
    totalOwnedItems: 0,
    totalCardsOwned: 0,
    uniqueCards: 0,
    rawCardsOwned: 0,
    gradedSlabsOwned: 0,
    sealedProductsOwned: 0,
    duplicateCopies: 0,
    collectionValue: 0,
    binderCount: 0,
    completedSets: 0,
    updatedAt: new Date().toISOString(),
  };
}

function getSummaryCacheKey(userId: string) {
  return `${SUMMARY_CACHE_STORAGE_PREFIX}${userId}`;
}

function isUsableSummary(value: any): value is CollectionSummary {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof value.totalCardsOwned === 'number'
    && typeof value.collectionValue === 'number'
    && typeof value.binderCount === 'number'
  );
}

async function readPersistedSummary(userId: string, maxAgeMs = SUMMARY_PERSISTED_MAX_AGE_MS) {
  try {
    const raw = await AsyncStorage.getItem(getSummaryCacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const cachedAt = Number(parsed?.cachedAt ?? 0);
    if (!cachedAt || Date.now() - cachedAt > maxAgeMs || !isUsableSummary(parsed?.value)) {
      return null;
    }

    return parsed.value as CollectionSummary;
  } catch (error) {
    console.log('Collection summary persisted cache read failed:', error);
    return null;
  }
}

async function writePersistedSummary(userId: string, value: CollectionSummary) {
  try {
    await AsyncStorage.setItem(
      getSummaryCacheKey(userId),
      JSON.stringify({ cachedAt: Date.now(), value, version: getCollectionSummaryVersion() })
    );
  } catch (error) {
    console.log('Collection summary persisted cache write failed:', error);
  }
}

function getSessionUserId() {
  return supabase.auth.getSession().then(({ data: { session }, error }) => {
    if (error) throw error;
    return session?.user?.id ?? null;
  });
}

async function refreshCollectionSummary(userId: string, version: number) {
  let entry!: { userId: string; version: number; promise: Promise<CollectionSummary> };
  const promise = (async () => {
    const value = await buildCollectionSummary(userId);
    // A refresh may finish after logout, account switch, or an ownership mutation.
    // Reject for every joined caller rather than allowing a raw build result through.
    if (inflightSummary !== entry || version !== getCollectionSummaryVersion() || await getSessionUserId() !== userId) {
      throw new Error('Collection summary changed account or version before completion.');
    }
    cachedSummary = {
      userId,
      version,
      expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
      value,
    };
    await writePersistedSummary(userId, value);
    return value;
  })();
  entry = { userId, version, promise };
  inflightSummary = entry;
  void promise.then(
    () => {
      if (inflightSummary === entry) inflightSummary = null;
    },
    () => {
      if (inflightSummary === entry) inflightSummary = null;
    }
  );
  return promise;
}

function matchingSummaryInflight(userId: string, version: number) {
  return inflightSummary?.userId === userId && inflightSummary.version === version
    ? inflightSummary.promise
    : null;
}

function refreshOrJoinCollectionSummary(userId: string, version: number) {
  return matchingSummaryInflight(userId, version) ?? refreshCollectionSummary(userId, version);
}

async function ensureCurrentSummaryIdentity(userId: string, version: number) {
  if (version !== getCollectionSummaryVersion() || await getSessionUserId() !== userId) {
    throw new Error('Collection summary changed account or version before completion.');
  }
}

function returnStaleAndRefresh(value: CollectionSummary, userId: string, version: number) {
  void refreshOrJoinCollectionSummary(userId, version).catch((refreshError) => {
    console.log('Collection summary background refresh failed:', refreshError?.message ?? refreshError);
  });
  return value;
}

export function invalidateCollectionSummary() {
  bumpCollectionSummaryVersion();
  cachedSummary = null;
}

export async function getCollectionSummary(options?: {
  forceRefresh?: boolean;
  staleWhileRefresh?: boolean;
  maxPersistedAgeMs?: number;
}) {
  const userId = await getSessionUserId();
  if (!userId) return getEmptySummary();

  const now = Date.now();
  const version = getCollectionSummaryVersion();
  const memoryHit = cachedSummary?.userId === userId && cachedSummary.version === version ? cachedSummary : null;
  if (!options?.forceRefresh && memoryHit && memoryHit.expiresAt > now) return memoryHit.value;
  if (options?.staleWhileRefresh && memoryHit) {
    return returnStaleAndRefresh(memoryHit.value, userId, version);
  }

  const matchingInflight = matchingSummaryInflight(userId, version);
  if (!options?.forceRefresh && matchingInflight) return matchingInflight;

  const persisted = version === 0 ? await readPersistedSummary(userId, options?.maxPersistedAgeMs) : null;
  // AsyncStorage is outside Supabase RLS. Recheck its local identity/version boundary
  // before using a persisted value or joining a request started meanwhile.
  await ensureCurrentSummaryIdentity(userId, version);
  if (persisted && options?.staleWhileRefresh) {
    cachedSummary = { userId, version, expiresAt: now + SUMMARY_CACHE_TTL_MS, value: persisted };
    return returnStaleAndRefresh(persisted, userId, version);
  }

  return refreshOrJoinCollectionSummary(userId, version);
}
