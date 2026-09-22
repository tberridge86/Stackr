import { searchStackrCards } from './stackrDomainAdapter';
import { parseCardSearchIntent } from './cardSearchIntent';
import { attachLiveTcgdexCardReferences, type PokemonCardLanguage } from './pokemonTcg';

type SearchRow = Record<string, any>;

// Retain the existing call signature while callers migrate. The legacy options
// below were already unused by the exported search path before this cleanup.
type SearchOptions = {
  limit?: number;
  select?: string;
  language?: PokemonCardLanguage | 'all' | string | null;
  skipSetDetection?: boolean;
  enableShortSetDetection?: boolean;
  skipApiBackedSearch?: boolean;
  skipIndexFallback?: boolean;
  skipNameCorrection?: boolean;
};

function isAllLanguageSearch(value: SearchOptions['language']) {
  return String(value ?? '').trim().toLowerCase() === 'all';
}

// This is an adapter, not another search implementation. Keep canonical search
// and its existing presentation enrichment until that boundary has its own
// coverage-tested replacement; removing dead helpers is not a provider cutover.
export async function searchLocalPokemonCards<T extends SearchRow = SearchRow>(
  input: string,
  options: SearchOptions = {}
): Promise<T[]> {
  const trimmed = input.trim();
  if (trimmed.length < 2) return [];
  const catalogueQuery = parseCardSearchIntent(trimmed).catalogueQuery;
  if (catalogueQuery.length < 2) return [];
  const limit = options.limit ?? 80;
  const cards = await attachLiveTcgdexCardReferences(await searchStackrCards(catalogueQuery, {
    language: isAllLanguageSearch(options.language) ? null : options.language,
    limit,
  }));
  return cards.map((card) => ({
    id: card.id,
    name: card.name,
    language: card.language,
    region: card.region,
    number: card.number,
    rarity: card.rarity ?? null,
    image_small: card.images.small ?? null,
    image_large: card.images.large ?? null,
    set_id: card.set.id,
    set_name: card.set.name,
    external_ids: card.externalIds,
    raw_data: card.raw_data,
  })) as unknown as T[];
}
