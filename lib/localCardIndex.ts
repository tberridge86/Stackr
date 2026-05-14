import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const STORAGE_KEY = 'stackr:local-card-index:v1';
const BUILT_AT_KEY = 'stackr:local-card-index-built-at:v1';
const CHUNK_COUNT_KEY = 'stackr:local-card-index-chunks:v1';
const CHUNK_KEY_PREFIX = 'stackr:local-card-index-chunk:v1:';
const PAGE_SIZE = 1000;
const STORAGE_CHUNK_SIZE = 500;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type LocalScanCard = {
  id: string;
  name: string;
  number: string;
  set_id: string;
  set_name: string;
  set_printed_total: number | null;
  image_small: string;
  rarity: string;
};

type LocalIndexPayload = {
  cards: LocalScanCard[];
  byNumberTotal: Record<string, number[]>;
};

let memoryIndex: LocalIndexPayload | null = null;
let loadingPromise: Promise<LocalIndexPayload | null> | null = null;

function getPrintedTotal(rawData: any) {
  const total = Number(rawData?.set?.printedTotal ?? rawData?.set?.total ?? NaN);
  return Number.isFinite(total) ? total : null;
}

function toScanCard(row: any): LocalScanCard {
  return {
    id: row.id,
    name: row.name,
    number: row.number ?? '',
    set_id: row.set_id,
    set_name: row.raw_data?.set?.name ?? row.set_id,
    set_printed_total: getPrintedTotal(row.raw_data),
    image_small: row.image_small ?? '',
    rarity: row.rarity ?? '',
  };
}

function keyFor(number: number | string, total: number | string) {
  return `${Number(number)}/${Number(total)}`;
}

function buildIndex(cards: LocalScanCard[]): LocalIndexPayload {
  const byNumberTotal: Record<string, number[]> = {};

  cards.forEach((card, index) => {
    const total = card.set_printed_total;
    const number = Number.parseInt(card.number, 10);
    if (!Number.isFinite(number) || !total) return;

    const key = keyFor(number, total);
    byNumberTotal[key] = byNumberTotal[key] ?? [];
    byNumberTotal[key].push(index);
  });

  return { cards, byNumberTotal };
}

async function fetchAllScanCards() {
  const cards: LocalScanCard[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select('id, name, number, rarity, image_small, set_id, raw_data')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const rows = data ?? [];
    cards.push(...rows.map(toScanCard));
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return cards;
}

async function loadStoredIndex() {
  try {
    const [builtAtRaw, chunkCountRaw] = await Promise.all([
      AsyncStorage.getItem(BUILT_AT_KEY),
      AsyncStorage.getItem(CHUNK_COUNT_KEY),
    ]);

    if (!builtAtRaw || !chunkCountRaw) return null;
    const builtAt = Number(builtAtRaw);
    const chunkCount = Number(chunkCountRaw);
    if (!Number.isFinite(builtAt) || Date.now() - builtAt > MAX_AGE_MS) return null;
    if (!Number.isFinite(chunkCount) || chunkCount <= 0) return null;

    const chunkKeys = Array.from({ length: chunkCount }, (_, index) => `${CHUNK_KEY_PREFIX}${index}`);
    const chunks = await AsyncStorage.multiGet(chunkKeys);
    const cards = chunks.flatMap(([, raw]) => (raw ? JSON.parse(raw) as LocalScanCard[] : []));
    return buildIndex(cards);
  } catch (error) {
    console.log('Local card index load failed:', error);
    return null;
  }
}

async function storeIndex(cards: LocalScanCard[]) {
  const chunks: [string, string][] = [];
  for (let index = 0; index < cards.length; index += STORAGE_CHUNK_SIZE) {
    chunks.push([
      `${CHUNK_KEY_PREFIX}${chunks.length}`,
      JSON.stringify(cards.slice(index, index + STORAGE_CHUNK_SIZE)),
    ]);
  }

  await AsyncStorage.multiRemove([STORAGE_KEY]);
  await AsyncStorage.multiSet([
    [BUILT_AT_KEY, String(Date.now())],
    [CHUNK_COUNT_KEY, String(chunks.length)],
    ...chunks,
  ]);
}

export async function getLocalCardIndex() {
  if (memoryIndex) return memoryIndex;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const stored = await loadStoredIndex();
    if (stored) {
      memoryIndex = stored;
      return stored;
    }

    const cards = await fetchAllScanCards();
    const index = buildIndex(cards);
    memoryIndex = index;
    await storeIndex(cards);
    return index;
  })();

  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

export async function lookupLocalCardsByPrintedNumber(
  printedNumber?: { number: number; total: number } | null,
  setId?: string | null,
  options?: { allowBuild?: boolean }
) {
  if (!printedNumber) return null;

  const index = memoryIndex
    ?? (options?.allowBuild ? await getLocalCardIndex() : await loadStoredIndex());
  if (!index) return null;
  memoryIndex = index;

  const ids = index.byNumberTotal[keyFor(printedNumber.number, printedNumber.total)] ?? [];
  const cards = ids
    .map((id) => index.cards[id])
    .filter((card) => card && (!setId || card.set_id === setId));

  return cards;
}

export function resolveLocalCardsByName(cards: LocalScanCard[], ocrText?: string | null) {
  const text = String(ocrText ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;

  const matches = cards.filter((card) => {
    const name = card.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return name && text.includes(name);
  });

  return matches.length === 1 ? matches[0] : null;
}

export function warmLocalCardIndex() {
  getLocalCardIndex().catch((error) => {
    console.log('Local card index warmup failed:', error);
  });
}
