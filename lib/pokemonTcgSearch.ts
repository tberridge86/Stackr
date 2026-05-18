import { searchLocalPokemonCards } from './cardSearch';

export type PokemonSearchCard = {
  id: string;
  name?: string;
  number?: string;
  images?: {
    small?: string;
    large?: string;
  };
  set?: {
    id?: string;
    name?: string;
    series?: string;
  };
  rarity?: string;
  supertype?: string;
  subtypes?: string[];
};

export async function searchPokemonCards(query: string): Promise<PokemonSearchCard[]> {
  const trimmed = query.trim();

  if (!trimmed) return [];

  const localResults = await searchLocalPokemonCards<any>(trimmed, {
    limit: 80,
    select: 'id, name, number, rarity, image_small, image_large, set_id, raw_data',
  });

  if (localResults.length > 0) {
    return localResults.map((card) => ({
      id: card.id,
      name: card.name,
      number: card.number ?? undefined,
      rarity: card.rarity ?? card.raw_data?.rarity ?? undefined,
      images: {
        small: card.image_small ?? undefined,
        large: card.image_large ?? undefined,
      },
      set: {
        id: card.set_id ?? undefined,
        name: card.raw_data?.set?.name ?? card.set_id ?? undefined,
        series: card.raw_data?.set?.series ?? undefined,
      },
      supertype: card.raw_data?.supertype,
      subtypes: card.raw_data?.subtypes,
    }));
  }

  const encoded = encodeURIComponent(`name:"*${trimmed}*"`);
  const url = `https://api.pokemontcg.io/v2/cards?q=${encoded}&pageSize=60`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to search cards.');
  }

  const json = await response.json();
  return json?.data ?? [];
}
