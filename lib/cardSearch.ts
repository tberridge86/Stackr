import { readOptionalCatalogueEnrichment } from './optionalCatalogueEnrichment';
import { parseCardSearchIntent } from './cardSearchIntent';
import { searchStackrCards } from './stackrDomainAdapter';
import { attachLiveTcgdexCardReferences, type PokemonCardLanguage } from './pokemonTcg';

type SearchRow = Record<string, any>;

/**
 * Compatibility options retained for existing callers. Search interpretation,
 * canonical identity and matching now belong to Stackr API; the legacy local
 * fuzzy/direct-table implementations that previously consumed several of these
 * options were unreachable from this exported path and have been removed.
 */
type SearchOptions = {
  limit?: number;
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

function mapSearchRows(cards: Awaited<ReturnType<typeof searchStackrCards>>): SearchRow[] {
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
  }));
}

/**
 * Application-facing card search boundary.
 *
 * Canonical matching is performed once by Stackr API. The optional controlled
 * TCGdex reference can fill a display-only image gap after canonical results
 * are already emitted; it never changes card/printing identity or supplies a
 * competing search result.
 */
export async function searchLocalPokemonCards<T extends SearchRow = SearchRow>(
  input: string,
  options: SearchOptions = {}
): Promise<T[]> {
  const trimmed = input.trim();
  if (trimmed.length < 2) return [];

  const catalogueQuery = parseCardSearchIntent(trimmed).catalogueQuery;
  if (catalogueQuery.length < 2) return [];

  const limit = options.limit ?? 80;
  const cards = await searchStackrCards(catalogueQuery, {
    language: isAllLanguageSearch(options.language) ? null : options.language,
    limit,
    onCanonicalResults: options.onCanonicalResults
      ? (matches) => options.onCanonicalResults?.(mapSearchRows(matches))
      : undefined,
  });

  const enriched = cards.some((card) => !card.images.small && !card.images.large)
    ? await readOptionalCatalogueEnrichment(() => attachLiveTcgdexCardReferences(cards))
    : cards;

  return mapSearchRows(enriched ?? cards) as T[];
}
