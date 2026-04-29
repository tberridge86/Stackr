import { supabase } from './supabase';

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

export async function fetchAllSets(): Promise<PokemonSet[]> {
  const { data, error } = await supabase
    .from('pokemon_sets')
    .select(
      'id, name, series, printed_total, total, release_date, symbol_url, logo_url'
    )
    .order('release_date', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((set) => ({
    id: set.id,
    name: set.name,
    series: set.series ?? '',
    printedTotal: set.printed_total ?? 0,
    total: set.total ?? 0,
    releaseDate: set.release_date ?? '',
    images: {
      symbol: set.symbol_url ?? undefined,
      logo: set.logo_url ?? undefined,
    },
  }));
}

export async function fetchCardsForSet(setId: string): Promise<PokemonCard[]> {
  const { data, error } = await supabase
    .from('pokemon_cards')
    .select('id, name, number, rarity, image_small, image_large')
    .eq('set_id', setId)
    .order('number', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((card) => ({
    id: card.id,
    name: card.name,
    number: card.number ?? '',
    rarity: card.rarity ?? undefined,
    images: {
      small: card.image_small ?? undefined,
      large: card.image_large ?? undefined,
    },
  }));
}

export async function fetchCardById(cardId: string): Promise<PokemonCard | null> {
  const { data, error } = await supabase
    .from('pokemon_cards')
    .select('id, name, number, rarity, image_small, image_large')
    .eq('id', cardId)
    .maybeSingle();

  if (error) {
    console.log('Failed to fetch card by ID:', error.message);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    number: data.number ?? '',
    rarity: data.rarity ?? undefined,
    images: {
      small: data.image_small ?? undefined,
      large: data.image_large ?? undefined,
    },
  };
}