import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchBinders, type BinderCardRecord, type BinderRecord } from './binders';
import { fetchOwnedCardRows, type OwnedCardRow } from './ownership';
import { supabase } from './supabase';
import { parseCollectionSummary, readCompactCollectionSummary } from './collectionSummaryRead';
import { storedRawSummaryPrice, COLLECTION_SUMMARY_USD_TO_GBP } from './collectionSummaryValue';
import { withPersonalDataReadTimeout } from './personalDataRead';
import { bumpCollectionSummaryVersion, getCollectionSummaryVersion } from './collectionSummaryInvalidation';

const SUMMARY_CACHE_TTL_MS = 60 * 1000;
const SUMMARY_PERSISTED_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SUMMARY_CACHE_STORAGE_PREFIX = 'stackr:collection-summary:v3:';
const MASTER_SET_STORAGE_PREFIX = 'stackr:binder-master-set:';

export type CollectionSummaryValuation = {
  basis: 'stored_tcg_raw_estimate';
  currency: 'GBP';
  usdToGbp: number;
  totalUnits: number;
  pricedUnits: number;
  unpricedUnits: number;
  unsupportedUnits: number;
  missingPriceUnits: number;
  freshness: 'unknown';
  state: 'empty' | 'unavailable' | 'partial' | 'available';
};

export type CollectionSummary = {
  schemaVersion: 'collection-summary-v1';
  subjectUserId: string | null;
  valuation: CollectionSummaryValuation;
  totalOwnedItems: number;
  totalCardsOwned: number;
  uniqueCards: number;
  rawCardsOwned: number;
  gradedSlabsOwned: number;
  sealedProductsOwned: number;
  duplicateCopies: number;
  collectionValue: number | null;
  binderCount: number;
  completedSets: number;
  updatedAt: string;
};

let cachedSummary: { userId: string; version: number; expiresAt: number; value: CollectionSummary } | null = null;
let inflightSummary: { userId: string; version: number; promise: Promise<CollectionSummary> } | null = null;

const toQuantity = (value: unknown) => Math.max(1, Math.floor(Number(value ?? 1) || 1));
const ownedQuantity = (card: BinderCardRecord) => card.owned ? toQuantity(card.owned_quantity) : 0;
const cardKey = (setId?: string | null, cardId?: string | null) => JSON.stringify([setId ?? '', cardId ?? '']);
const POKEMON_CARD_COLUMNS = 'id, language, set_id, raw_data';
const SAVED_BINDER_CARD_COLUMNS = 'id, binder_id, card_id, set_id, language, slot_order, owned, owned_quantity, condition, grade_company, grade';
const METADATA_CHUNK_SIZE = 50;
const METADATA_CONCURRENCY = 3;
const SUMMARY_PAGE_SIZE = 50;

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

// Offset pages advance by the rows actually received. A smaller server cap is
// not an end marker; only an empty page proves that this filtered read is complete.
async function readSummaryPages<T extends { id: string }>(
  buildQuery: () => any,
  accepts: (row: T) => boolean,
  signal: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  for (;;) {
    const from = rows.length;
    if (signal.aborted) throw new Error('The collection summary was cancelled.');
    const { data, error } = await buildQuery().range(from, from + SUMMARY_PAGE_SIZE - 1).abortSignal(signal);
    if (signal.aborted) throw new Error('The collection summary was cancelled.');
    if (error) throw error;
    if (!Array.isArray(data) || data.length > SUMMARY_PAGE_SIZE) {
      throw new Error('Collection summary received an incomplete page.');
    }
    if (!data.length) return rows;
    for (const row of data as T[]) {
      if (typeof row?.id !== 'string' || !row.id || seen.has(row.id) || !accepts(row)) {
        throw new Error('Collection summary received inconsistent page identities.');
      }
      seen.add(row.id);
      rows.push(row);
    }
  }
}

async function fetchPokemonCardsById(cardIds: string[], signal: AbortSignal) {
  const uniqueIds = [...new Set(cardIds.filter(Boolean))];
  const cardMap = new Map<string, any>();

  const rowsByChunk = await mapWithConcurrency(chunk(uniqueIds, METADATA_CHUNK_SIZE), METADATA_CONCURRENCY, (idChunk) =>
    readSummaryPages<any>(() => supabase.from('pokemon_cards')
      .select(POKEMON_CARD_COLUMNS).in('id', idChunk).order('id', { ascending: true }),
    (row) => idChunk.includes(row.id), signal));

  for (const rows of rowsByChunk) {
    for (const card of rows) if (card.id) cardMap.set(card.id, card);
  }

  return cardMap;
}

async function fetchSavedOwnedBinderCards(binderIds: string[], signal: AbortSignal) {
  const uniqueBinderIds = [...new Set(binderIds.filter(Boolean))];
  const rowsByChunk = await mapWithConcurrency(chunk(uniqueBinderIds, METADATA_CHUNK_SIZE), METADATA_CONCURRENCY, (binderIdChunk) =>
    readSummaryPages<BinderCardRecord>(() => supabase.from('binder_cards')
      .select(SAVED_BINDER_CARD_COLUMNS).in('binder_id', binderIdChunk).eq('owned', true)
      .order('slot_order', { ascending: true }).order('id', { ascending: true }),
    (row) => row.owned === true && binderIdChunk.includes(row.binder_id), signal));
  return rowsByChunk.flat();
}

async function getCompletedSetCount(
  binders: BinderRecord[],
  savedOwnedRows: BinderCardRecord[],
  variantRows: OwnedCardRow[],
  masterByBinderId: Map<string, boolean>,
  signal: AbortSignal,
) {
  const officialBinders = binders.filter((binder) => binder.type === 'official' && binder.source_set_id);
  if (!officialBinders.length) return 0;

  const setIds = [...new Set(officialBinders.map((binder) => binder.source_set_id).filter(Boolean))] as string[];
  const masterSetIds = [...new Set(officialBinders.filter((binder) => masterByBinderId.get(binder.id)).map((binder) => binder.source_set_id).filter(Boolean))] as string[];

  // Both metadata sources share the existing three-read concurrency bound.
  const metadataTasks = [
    ...chunk(setIds, METADATA_CHUNK_SIZE).map((ids) => ({ kind: 'sets' as const, ids })),
    ...chunk(masterSetIds, METADATA_CHUNK_SIZE).map((ids) => ({ kind: 'cards' as const, ids })),
  ];
  const metadataResults = await mapWithConcurrency(metadataTasks, METADATA_CONCURRENCY, async ({ kind, ids }) => ({
    kind,
    rows: await readSummaryPages<any>(() => kind === 'sets'
      ? supabase.from('pokemon_sets').select('id, printed_total, total').in('id', ids).order('id', { ascending: true })
      : supabase.from('pokemon_cards').select('id, set_id, rarity, raw_data').in('set_id', ids).order('id', { ascending: true }),
    (row) => ids.includes(kind === 'sets' ? row.id : row.set_id), signal),
  }));
  const setRows = metadataResults.filter((result) => result.kind === 'sets').flatMap((result) => result.rows);
  const officialCards = metadataResults.filter((result) => result.kind === 'cards').flatMap((result) => result.rows);
  const setTotals = new Map<string, number>(setRows.map((set: any) => [set.id, Number(set.printed_total ?? set.total ?? 0)]));
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

  for (const card of officialCards) {
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

async function buildCollectionSummary(userId: string, signal: AbortSignal): Promise<CollectionSummary> {
  const compact = await readCompactCollectionSummary(userId, signal);
  if (compact) return compact;
  if (signal.aborted) throw new Error('The collection summary was cancelled.');
  // The summary only needs binders the user saved and owns. Avoid fetchBinderCards here:
  // official binders otherwise expand an entire catalogue and attach live price snapshots.
  const [binders, variantRows] = await Promise.all([
    fetchBinders({ enrich: false }),
    fetchOwnedCardRows({ isCurrent: () => !signal.aborted }),
  ]);
  if (binders.some((binder) => binder.user_id !== userId)) {
    throw new Error('Collection summary received binders for a different account.');
  }
  if (variantRows.some((row) => row.user_id !== userId)) {
    throw new Error('Collection summary received ownership rows for a different account.');
  }
  const [savedOwnedRows, masterSetEnabled] = await Promise.all([
    fetchSavedOwnedBinderCards(binders.map((binder) => binder.id), signal),
    mapWithConcurrency(binders, METADATA_CONCURRENCY, async (binder) => [binder.id, await isMasterSetEnabled(binder)] as const),
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
  ], signal);

  let totalOwnedItems = 0;
  let rawCardsOwned = 0;
  let gradedSlabsOwned = 0;
  let duplicateCopies = 0;
  let collectionValue = 0;
  let pricedUnits = 0;
  let unsupportedUnits = 0;
  let missingPriceUnits = 0;
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
    const price = storedRawSummaryPrice({
      card: ownedCardMap.get(card.card_id), cardId: card.card_id, setId: card.set_id, variant,
      edition: card.__binderEdition, condition: card.__condition,
      gradeCompany: card.grade_company, grade: card.grade, mode, languages: card.__languages,
    });
    if (price.amount !== null) {
      pricedUnits += safeQuantity;
      collectionValue += price.amount * safeQuantity;
    } else if (price.unsupported) unsupportedUnits += safeQuantity;
    else missingPriceUnits += safeQuantity;
  };

  for (const row of variantRows) {
    if (!row.card_id || !row.set_id) continue;
    const card = { card_id: row.card_id, set_id: row.set_id,
      __condition: row.condition, grade_company: row.grade_company, grade: row.grade };
    const mode = row.grade_company || row.grade ? 'graded' : 'raw';
    const unitKey = `owned:${row.id ?? `${row.set_id}:${row.card_id}:${row.variant ?? ''}:${row.condition ?? ''}:${row.grade_company ?? ''}:${row.grade ?? ''}`}`;
    addUnit(card, row.variant || 'normal', row.quantity, mode, unitKey);
  }

  for (const savedRow of savedOwnedRows) {
    const binder = binderById.get(savedRow.binder_id);
    const card = {
      ...savedRow,
      __binderEdition: binder?.edition ?? null,
      __condition: savedRow.condition || binder?.default_condition || 'Near Mint',
      __languages: [savedRow.language, binder?.language],
    };
    const key = cardKey(card.set_id, card.card_id);
    if (variantRowsByCard.has(key)) continue;
    const mode = binder?.card_mode === 'graded' || savedRow.grade_company || savedRow.grade ? 'graded' : 'raw';
    addUnit(card, null, ownedQuantity(savedRow), mode);
  }

  const completedSets = await getCompletedSetCount(binders, savedOwnedRows, variantRows, masterEntries, signal);

  const unpricedUnits = unsupportedUnits + missingPriceUnits;
  return {
    schemaVersion: 'collection-summary-v1',
    subjectUserId: userId,
    valuation: { basis: 'stored_tcg_raw_estimate', currency: 'GBP', usdToGbp: COLLECTION_SUMMARY_USD_TO_GBP,
      totalUnits: totalOwnedItems, pricedUnits, unpricedUnits, unsupportedUnits, missingPriceUnits, freshness: 'unknown',
      state: !totalOwnedItems ? 'empty' : !pricedUnits ? 'unavailable' : unpricedUnits ? 'partial' : 'available' },
    totalOwnedItems,
    totalCardsOwned: rawCardsOwned + gradedSlabsOwned,
    uniqueCards: uniqueCardKeys.size,
    rawCardsOwned,
    gradedSlabsOwned,
    sealedProductsOwned: 0,
    duplicateCopies,
    collectionValue: pricedUnits || !totalOwnedItems ? Math.round(collectionValue * 100) / 100 : null,
    binderCount: binders.length,
    completedSets,
    updatedAt: new Date().toISOString(),
  };
}

function getEmptySummary(): CollectionSummary {
  return {
    schemaVersion: 'collection-summary-v1',
    subjectUserId: null,
    valuation: { basis: 'stored_tcg_raw_estimate', currency: 'GBP', usdToGbp: COLLECTION_SUMMARY_USD_TO_GBP,
      totalUnits: 0, pricedUnits: 0, unpricedUnits: 0, unsupportedUnits: 0, missingPriceUnits: 0, freshness: 'unknown', state: 'empty' },
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

function isUsableSummary(value: unknown, userId: string): value is CollectionSummary {
  try {
    parseCollectionSummary(value, userId);
    return true;
  } catch {
    return false;
  }
}

async function readPersistedSummary(userId: string, maxAgeMs = SUMMARY_PERSISTED_MAX_AGE_MS) {
  try {
    const raw = await AsyncStorage.getItem(getSummaryCacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const cachedAt = Number(parsed?.cachedAt ?? 0);
    if (!cachedAt || Date.now() - cachedAt > maxAgeMs || !isUsableSummary(parsed?.value, userId)) {
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
    const controller = new AbortController();
    let changedAccount = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || session?.user?.id !== userId) {
        changedAccount = true;
        controller.abort();
      }
    });
    try {
      return await withPersonalDataReadTimeout(async (signal) => {
        const value = parseCollectionSummary(await buildCollectionSummary(userId, signal), userId);
        // A refresh may finish after logout, account switch, or an ownership mutation.
        // Reject for every joined caller rather than allowing a raw build result through.
        const beforeWriteUserId = await getSessionUserId();
        if (changedAccount || signal.aborted || inflightSummary !== entry || version !== getCollectionSummaryVersion() || beforeWriteUserId !== userId) {
          throw new Error('Collection summary changed account or version before completion.');
        }
        await writePersistedSummary(userId, value);
        const afterWriteUserId = await getSessionUserId();
        if (changedAccount || signal.aborted || inflightSummary !== entry || version !== getCollectionSummaryVersion()
          || afterWriteUserId !== userId) {
          throw new Error('Collection summary changed account or version before completion.');
        }
        cachedSummary = { userId, version, expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS, value };
        return value;
      }, { signal: controller.signal });
    } finally {
      subscription.unsubscribe();
    }
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
  const currentUserId = await getSessionUserId();
  if (version !== getCollectionSummaryVersion() || currentUserId !== userId) {
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
