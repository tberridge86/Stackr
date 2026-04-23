import { fetchAllSets, fetchCardsForSet } from './pokemonTcg';

export type PokemonCard = {
  id: string;
  name?: string;
  images?: {
    small?: string;
    large?: string;
  };
  set?: {
    id?: string;
    name?: string;
  };
};

export type PokemonSet = {
  id: string;
  name?: string;
};

let setsCache: PokemonSet[] | null = null;
const cardsBySetCache: Record<string, PokemonCard[]> = {};

/**
 * Get all sets (cached)
 */
export async function getCachedSets(): Promise<PokemonSet[]> {
  if (setsCache) return setsCache;

  try {
    const sets = await fetchAllSets();
    setsCache = sets;
    return sets;
  } catch (err) {
    console.error('Failed to fetch sets:', err);
    return [];
  }
}

/**
 * Get cards for a set (cached)
 */
export async function getCachedCardsForSet(
  setId: string
): Promise<PokemonCard[]> {
  if (cardsBySetCache[setId]) return cardsBySetCache[setId];

  try {
    const cards = await fetchCardsForSet(setId);
    cardsBySetCache[setId] = cards;
    return cards;
  } catch (err) {
    console.error(`Failed to fetch cards for set ${setId}:`, err);
    return [];
  }
}

/**
 * Get a card synchronously if already cached
 */
export function getCachedCardSync(
  setId: string,
  cardId: string
): PokemonCard | null {
  const cards = cardsBySetCache[setId];
  if (!cards) return null;

  return cards.find((card) => card.id === cardId) ?? null;
}

/**
 * Optional: clear cache (useful for debugging or refresh)
 */
export function clearPokemonCache() {
  setsCache = null;
  Object.keys(cardsBySetCache).forEach((key) => {
    delete cardsBySetCache[key];
  });
}