import { searchLocalPokemonCards } from './cardSearch';
import { correctPokemonNameQuery } from './pokemonNameAutocorrect';
import { normalizePokemonCardLanguage, type PokemonCardLanguage } from './pokemonTcg';

export type PokemonSearchCard = {
  id: string;
  language?: PokemonCardLanguage;
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

export async function searchPokemonCards(
  query: string,
  options: { language?: PokemonCardLanguage | string | null } = {}
): Promise<PokemonSearchCard[]> {
  const trimmed = query.trim();
  const language = normalizePokemonCardLanguage(options.language);

  if (!trimmed) return [];

  const localResults = await searchLocalPokemonCards<any>(trimmed, {
    language,
    limit: 80,
    select: 'id, name, number, rarity, image_small, image_large, set_id, raw_data',
  });

  if (localResults.length > 0) {
    return localResults.map((card) => ({
      id: card.id,
      language,
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

  const corrected = await correctPokemonNameQuery(trimmed, { allowIndex: false });
  if (language === 'ja') return [];

  const fallbackQuery = corrected.changed ? corrected.correctedQuery : trimmed;
  const encoded = encodeURIComponent(`name:"*${fallbackQuery}*"`);
  const url = `https://api.pokemontcg.io/v2/cards?q=${encoded}&pageSize=60`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to search cards.');
  }

  const json = await response.json();
  return json?.data ?? [];
}
