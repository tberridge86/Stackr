import type { SearchPageMetadata } from './searchPagination';
import { searchStackrCards } from './stackrDomainAdapter';
import { readOptionalCatalogueEnrichment } from './optionalCatalogueEnrichment';
import { parseCardSearchIntent } from './cardSearchIntent';
import { attachLiveTcgdexCardReferences, type PokemonCardLanguage } from './pokemonTcg';

type SearchRow = Record<string, any>;

type SearchOptions = {
  limit?: number;
  cursor?: string;
  force?: boolean;
  signal?: AbortSignal;
  preserveVariantIdentity?: boolean;
  onPagination?: (metadata: SearchPageMetadata) => void;
  select?: string;
  language?: PokemonCardLanguage | 'all' | string | null;
  skipSetDetection?: boolean;
  enableShortSetDetection?: boolean;
  skipApiBackedSearch?: boolean;
  skipIndexFallback?: boolean;
  skipNameCorrection?: boolean;
  onCanonicalResults?: (rows: SearchRow[]) => void;
};

function isAllLanguageSearch(value: SearchOptions['language']) {
  return String(value ?? '').trim().toLowerCase() === 'all';
}

export async function searchLocalPokemonCards<T extends SearchRow = SearchRow>(
  input: string,
  options: SearchOptions = {}
): Promise<T[]> {
  const trimmed = input.trim();
  if (trimmed.length < 2) return [];
  const catalogueQuery = parseCardSearchIntent(trimmed).catalogueQuery;
  if (catalogueQuery.length < 2) return [];
  const limit = options.limit ?? 80;
  const toRows = (cards: Awaited<ReturnType<typeof searchStackrCards>>) => cards.map((card) => ({
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
  }));
  const cards = await searchStackrCards(catalogueQuery, {
    language: isAllLanguageSearch(options.language) ? null : options.language,
    limit, cursor: options.cursor, signal: options.signal, force: options.force,
    preserveVariantIdentity: options.preserveVariantIdentity, onPagination: options.onPagination,
    onCanonicalResults: options.onCanonicalResults
      ? (matches) => options.onCanonicalResults?.(toRows(matches)) : undefined,
  });
  const enriched = cards.some(card => !card.images.small && !card.images.large)
    ? await readOptionalCatalogueEnrichment(() => attachLiveTcgdexCardReferences(cards), options.signal) : cards;
  return toRows(enriched ?? cards) as unknown as T[];
}
