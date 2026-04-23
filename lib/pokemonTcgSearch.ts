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

  const encoded = encodeURIComponent(`name:"*${trimmed}*"`);
  const url = `https://api.pokemontcg.io/v2/cards?q=${encoded}&pageSize=60`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to search cards.');
  }

  const json = await response.json();
  return json?.data ?? [];
}