export type PokemonSet = {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  releaseDate: string;
  images?: {
    symbol?: string;
    logo?: string;
  };
};

export type PokemonCard = {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  images?: {
    small?: string;
    large?: string;
  };
};

const API_BASE = 'https://api.pokemontcg.io/v2';

export async function fetchAllSets(): Promise<PokemonSet[]> {
  const res = await fetch(`${API_BASE}/sets?orderBy=-releaseDate&pageSize=500`);
  if (!res.ok) {
    throw new Error('Failed to fetch sets');
  }
  const json = await res.json();
  return json.data ?? [];
}

export async function fetchCardsForSet(setId: string): Promise<PokemonCard[]> {
  const query = encodeURIComponent(`set.id:${setId}`);
  const res = await fetch(`${API_BASE}/cards?q=${query}&orderBy=number&pageSize=500`);
  if (!res.ok) {
    throw new Error('Failed to fetch cards for set');
  }
  const json = await res.json();
  return json.data ?? [];
}

export async function fetchCardById(cardId: string): Promise<PokemonCard | null> {
  const res = await fetch(`${API_BASE}/cards/${cardId}`);
  if (!res.ok) {
    return null;
  }
  const json = await res.json();
  return json.data ?? null;
}