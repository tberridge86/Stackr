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
    .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
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
  }));
}

export async function fetchCardById(cardId: string): Promise<PokemonCard | null> {
  const { data, error } = await supabase
    .from('pokemon_cards')
    .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
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
  };
}