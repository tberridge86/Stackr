import { searchLocalPokemonCards } from './cardSearch';
import { supabase } from './supabase';
import {
  getEnglishCardDisplayName,
  getEnglishSetDisplayName,
  getPreferredCardDisplayName,
  getPreferredSetDisplayName,
} from './pokemonDisplayNames';
import { enrichStackrCardArtworkFromFacts, fetchStackrCardRows, fetchStackrPriceSnapshots, fetchStackrSetRows, stackrCardToLegacyCard } from './stackrDomainAdapter';
import { stackrApiClient, type StackrCard } from './stackrApiV1';
import {
  buildOwnedPokedexCards,
  canRemovePokedexOwnershipMarker,
  type OwnedPokedexCard,
  type OwnedPokedexCardRow,
} from './pokedexCollectionCore';

export { buildOwnedPokedexCards, canRemovePokedexOwnershipMarker, type OwnedPokedexCard } from './pokedexCollectionCore';

export type PokedexCard = {
  id: string;
  name: string;
  english_name?: string | null;
  language?: string | null;
  region?: string | null;
  number?: string | null;
  rarity?: string | null;
  set_id?: string | null;
  set_name?: string | null;
  set_english_name?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  image_urls?: string[];
  estimated_value?: number | null;
  price_source?: string | null;
  raw_data?: any;
  /** Canonical facts used only for bounded, on-demand artwork hydration. */
  canonical_card?: StackrCard;
};


const normalise = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bfemale\b/g, 'f')
    .replace(/\bmale\b/g, 'm')
    .replace(/[''`'.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const formatPokedexName = (name: string) =>
  name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const pokemonNameMatchesCardName = (pokemonName: string, cardName: string) => {
  const pokemon = normalise(formatPokedexName(pokemonName));
  const card = normalise(cardName);

  if (!pokemon || !card) return false;
  if (card === pokemon) return true;

  const escaped = pokemon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(card);
};

const getPokemonCardSearchTerms = (pokemonName: string) => {
  const displayName = formatPokedexName(pokemonName);
  const terms = new Set([displayName]);
  const normalized = normalise(displayName);

  if (normalized === 'mr mime') terms.add('Mr. Mime');
  if (normalized === 'mr rime') terms.add('Mr. Rime');
  if (normalized === 'mime jr') terms.add('Mime Jr.');
  if (normalized === 'farfetchd') terms.add("Farfetch'd");
  if (normalized === 'sirfetchd') terms.add("Sirfetch'd");
  if (normalized === 'flabebe') terms.add('Flabébé');
  if (normalized === 'nidoran f') {
    terms.add('Nidoran♀');
    terms.add('Nidoran Female');
  }
  if (normalized === 'nidoran m') {
    terms.add('Nidoran♂');
    terms.add('Nidoran Male');
  }

  return Array.from(terms);
};

const uniqueUrls = (urls: (string | null | undefined)[]) =>
  Array.from(new Set(urls.filter((url): url is string => Boolean(url))));

const buildPokedexImageUrls = (card: any) => {
  return uniqueUrls([card.raw_data?.images?.small, card.image_small, card.raw_data?.images?.large, card.image_large]);
};

export type PokedexCardsProgress = {
  cards: PokedexCard[];
  complete: boolean;
  error?: Error | null;
};

const getPokedexCardNames = (card: any) => {
  const raw = card.raw_data ?? card.raw_payload ?? card;
  const input = {
    id: card.id ?? card.card_id ?? null,
    sourceId: card.source_id ?? card.provider_card_id ?? raw?.source_id ?? null,
    setId: card.set_id ?? raw?.set_id ?? raw?.set?.id ?? null,
    collectorNumber: card.number ?? card.collector_number ?? raw?.localId ?? raw?.number ?? null,
    language: card.language ?? raw?.language ?? raw?.set?.language ?? null,
    region: card.region ?? raw?.region ?? raw?.set?.region ?? null,
    localName: card.local_name ?? raw?.local_name ?? raw?.native_name ?? null,
    englishDisplayName:
      card.english_display_name
      ?? raw?.english_display_name
      ?? raw?.englishDisplayName
      ?? null,
    canonicalName: card.canonical_name ?? null,
    fallbackName: card.name ?? null,
    raw,
  };

  return {
    name: getPreferredCardDisplayName(input),
    englishName: getEnglishCardDisplayName(input),
    language: input.language,
    region: input.region,
  };
};

const mapCardRow = (card: any): PokedexCard => {
  const imageUrls = buildPokedexImageUrls(card);
  const thumbnailUrl = card.raw_data?.images?.small ?? card.image_small ?? null;
  const largeImageUrl = card.raw_data?.images?.large ?? card.image_large ?? null;
  const cardNames = getPokedexCardNames(card);
  const setRaw = card.raw_data?.set ?? card.raw_payload?.set ?? card.set ?? {};
  const setInput = {
    id: card.set_id ?? setRaw?.id ?? null,
    sourceId: setRaw?.tcgdex_id ?? setRaw?.source_id ?? card.raw_data?.source_id ?? card.set_id ?? null,
    setCode: setRaw?.set_code ?? setRaw?.tcgdex_id ?? card.raw_data?.set_code ?? card.set_id ?? null,
    language: cardNames.language,
    region: cardNames.region,
    localName: setRaw?.local_name ?? setRaw?.localName ?? setRaw?.native_name ?? null,
    englishDisplayName: setRaw?.english_display_name ?? setRaw?.englishDisplayName ?? null,
    canonicalName: setRaw?.name ?? card.set_name ?? null,
    fallbackName: card.set_name ?? card.set_id ?? null,
    raw: setRaw,
  };
  const setName = getPreferredSetDisplayName({
    ...setInput,
  });

  return {
    id: card.id,
    name: cardNames.name,
    english_name: cardNames.englishName,
    language: cardNames.language,
    region: cardNames.region,
    number: card.number ?? null,
    rarity: card.rarity ?? card.raw_data?.rarity ?? null,
    set_id: card.set_id ?? card.raw_data?.set?.id ?? null,
    set_name: setName,
    set_english_name: getEnglishSetDisplayName(setInput),
    image_small: thumbnailUrl,
    image_large: largeImageUrl,
    image_urls: imageUrls,
    raw_data: card.raw_data ?? null,
  };
};

type ArtworkHydrationEntry = { promise: Promise<PokedexCard>; expiresAt: number; settled: boolean };
const artworkHydrationByCardId = new Map<string, ArtworkHydrationEntry>();
const ARTWORK_CACHE_LIMIT = 512;

const pruneArtworkHydrationCache = () => {
  const now = Date.now();
  for (const [id, entry] of artworkHydrationByCardId) {
    if (entry.settled && entry.expiresAt <= now) artworkHydrationByCardId.delete(id);
  }
  while (artworkHydrationByCardId.size >= ARTWORK_CACHE_LIMIT) {
    const removable = [...artworkHydrationByCardId.entries()]
      .filter(([, entry]) => entry.settled)
      .sort(([, left], [, right]) => left.expiresAt - right.expiresAt)[0];
    if (!removable) break;
    artworkHydrationByCardId.delete(removable[0]);
  }
};

const mergePokedexArtwork = (source: PokedexCard, hydrated: any): PokedexCard => {
  if (!hydrated) return source;
  const mapped = mapCardRow(hydrated);
  return {
    ...source,
    image_small: mapped.image_small,
    image_large: mapped.image_large,
    image_urls: mapped.image_urls,
  };
};

/**
 * Hydrates at most one visible-card batch. The promise cache avoids repeat
 * asset reads as a FlatList recycles cells while preserving canonical facts.
 */
export async function hydratePokedexCardArtwork(cards: PokedexCard[]): Promise<PokedexCard[]> {
  pruneArtworkHydrationCache();
  const unique = [...new Map(cards
    .filter((card) => card.canonical_card && !card.image_small && !card.image_large)
    .map((card) => [card.id, card]))
    .values()]
    .slice(0, 100);
  const newCards = unique.filter((card) => !artworkHydrationByCardId.has(card.id));
  if (newCards.length) {
    const batch = enrichStackrCardArtworkFromFacts(newCards)
      .then((hydrated) => new Map(hydrated.map((card) => [card.id, card])))
      .catch(() => new Map<string, any>());
    for (const card of newCards) {
      if (artworkHydrationByCardId.size >= ARTWORK_CACHE_LIMIT) break;
      const entry: ArtworkHydrationEntry = { promise: Promise.resolve(card), expiresAt: Number.POSITIVE_INFINITY, settled: false };
      entry.promise = batch.then((byId) => mergePokedexArtwork(card, byId.get(card.id))).then((result) => {
        entry.settled = true;
        entry.expiresAt = Date.now() + (result.image_small || result.image_large ? 60_000 : 30_000);
        pruneArtworkHydrationCache();
        return result;
      });
      artworkHydrationByCardId.set(card.id, entry);
    }
  }
  return Promise.all(unique.map((card) => artworkHydrationByCardId.get(card.id)?.promise ?? Promise.resolve(card)));
}

async function addSetNames(cards: PokedexCard[]): Promise<PokedexCard[]> {
  const missingSetMetadataIds = [...new Set(
    cards
      .filter((card) => (!card.set_name || !card.set_english_name) && card.set_id)
      .map((card) => card.set_id as string)
  )];

  if (!missingSetMetadataIds.length) return cards;

  const sets = await fetchStackrSetRows(missingSetMetadataIds);
  return cards.map((card) => ({
    ...card,
    set_name: card.set_name ?? (card.set_id ? sets.get(card.set_id)?.name ?? null : null),
    set_english_name:
      card.set_english_name
      ?? (card.set_id ? sets.get(card.set_id)?.englishDisplayName ?? null : null),
  }));
}

async function addLatestPrices(cards: PokedexCard[]): Promise<PokedexCard[]> {
  const cardIds = [...new Set(cards.map((card) => card.id).filter(Boolean))];
  if (!cardIds.length) return cards;

  const snapshotMap = await fetchStackrPriceSnapshots(cardIds);

  return cards.map((card) => {
    const price = snapshotMap.get(card.id);

    return {
      ...card,
      estimated_value: price?.market_central ?? null,
      price_source: price ? 'stackr-api' : null,
    };
  });
}

async function enrichPokedexCards(cards: PokedexCard[]): Promise<PokedexCard[]> {
  // Card retrieval is the primary detail-screen content. Set labels and prices
  // are optional enrichments, so an unavailable auxiliary endpoint must never
  // turn a populated Pokémon collection into an empty error state.
  const [setNames, prices] = await Promise.allSettled([
    addSetNames(cards),
    addLatestPrices(cards),
  ]);

  const withSetNames = setNames.status === 'fulfilled' ? setNames.value : cards;
  if (prices.status !== 'fulfilled') return withSetNames;

  const pricesById = new Map(prices.value.map((card) => [card.id, card]));
  return withSetNames.map((card) => {
    const priced = pricesById.get(card.id);
    return priced
      ? { ...card, estimated_value: priced.estimated_value, price_source: priced.price_source }
      : card;
  });
}

async function fetchPokemonTcgApiCardsForPokemon(pokemonName: string): Promise<PokedexCard[]> {
  const displayName = formatPokedexName(pokemonName);
  const terms = getPokemonCardSearchTerms(pokemonName);
  const cardsById = new Map<string, PokedexCard>();

  for (const term of terms) {
    const rows = await searchLocalPokemonCards<any>(term, {
      language: 'all',
      limit: 250,
      skipSetDetection: true,
    });
    for (const row of rows) {
      if (!pokemonNameMatchesCardName(displayName, row.name ?? '')) continue;
      cardsById.set(row.id, mapCardRow(row));
    }
  }

  return Array.from(cardsById.values());
}

const sortPokedexCards = (cards: PokedexCard[]) => cards.sort((a, b) => {
  const dateA = a.raw_data?.set?.releaseDate ?? '';
  const dateB = b.raw_data?.set?.releaseDate ?? '';
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  return String(a.number ?? '').localeCompare(String(b.number ?? ''), undefined, { numeric: true });
});

const INITIAL_CANONICAL_PAGE_LIMIT = 24;
const CANONICAL_PAGE_LIMIT = 120;

async function fetchCanonicalPokedexCards(
  pokemonName: string,
  onProgress?: (progress: PokedexCardsProgress) => void,
): Promise<PokedexCardsProgress> {
  const cardsById = new Map<string, PokedexCard>();
  let cursor: string | null = null;
  let publishedFirstPage = false;
  let factsComplete = false;
  let factsError: Error | null = null;

  try {
    do {
      const response = await stackrApiClient.pokemonCards(pokemonName, {
        cursor,
        limit: publishedFirstPage ? CANONICAL_PAGE_LIMIT : INITIAL_CANONICAL_PAGE_LIMIT,
      });
      for (const card of response.data.cards) {
        const legacy = stackrCardToLegacyCard(card, []);
        cardsById.set(legacy.id, { ...mapCardRow(legacy), canonical_card: card });
      }
      cursor = response.meta.pagination?.nextCursor ?? null;
      onProgress?.({ cards: sortPokedexCards([...cardsById.values()]), complete: false });
      // The first visible row gets thumbnails without waiting for later
      // source pages, pricing, or set labels. Subsequent visible chunks are
      // requested by the detail FlatList.
      if (!publishedFirstPage) {
        publishedFirstPage = true;
        void hydratePokedexCardArtwork(sortPokedexCards([...cardsById.values()]).slice(0, 16))
          .then((hydrated) => {
            for (const card of hydrated) {
              const current = cardsById.get(card.id) ?? card;
              cardsById.set(card.id, { ...current, image_small: card.image_small,
                image_large: card.image_large, image_urls: card.image_urls });
            }
            onProgress?.({ cards: sortPokedexCards([...cardsById.values()]), complete: factsComplete, error: factsError });
          })
          .catch(() => {});
      }
    } while (cursor);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    factsError = failure;
    if (cardsById.size) {
      return { cards: sortPokedexCards([...cardsById.values()]), complete: false, error: failure };
    }
    throw failure;
  }

  const cards = sortPokedexCards([...cardsById.values()]);
  // Completion must represent the factual paginated collection, never wait
  // indefinitely on optional set or pricing services.
  const factual = { cards, complete: true };
  factsComplete = true;
  onProgress?.(factual);
  void enrichPokedexCards(cards)
    .then((enriched) => {
      for (const card of enriched) {
        const current = cardsById.get(card.id);
        cardsById.set(card.id, current ? { ...card, image_small: current.image_small ?? card.image_small,
          image_large: current.image_large ?? card.image_large, image_urls: current.image_urls?.length ? current.image_urls : card.image_urls } : card);
      }
      onProgress?.({ cards: sortPokedexCards([...cardsById.values()]), complete: true });
    })
    .catch(() => {});
  return factual;
}

export async function fetchCardsForPokemon(
  pokemonName: string,
  options: { onProgress?: (progress: PokedexCardsProgress) => void } = {},
): Promise<PokedexCardsProgress> {
  try {
    const result = await fetchCanonicalPokedexCards(pokemonName, options.onProgress);
    options.onProgress?.(result);
    return result;
  } catch (canonicalError) {
    // Older API deployments lack the paginated route. Keep the prior search
    // path as a visible, explicitly incomplete fallback instead of claiming a
    // hard-capped result is a full species collection.
  }
  const displayName = formatPokedexName(pokemonName);
  const searchTerms = getPokemonCardSearchTerms(pokemonName);
  const rowsById = new Map<string, any>();

  for (const term of searchTerms) {
    const data = await searchLocalPokemonCards<any>(term, {
      language: 'all',
      limit: 100,
      skipSetDetection: true,
    });
    for (const row of data) {
      rowsById.set(row.id, row);
    }
  }

  if (rowsById.size === 0) {
    const fallbackRows = await searchLocalPokemonCards<any>(displayName, {
      limit: 1000,
      skipSetDetection: true,
      select: 'id, name, number, rarity, image_small, image_large, set_id, raw_data',
    });

    for (const row of fallbackRows) {
      rowsById.set(row.id, row);
    }
  }

  let cards = Array.from(rowsById.values())
    .filter((card) => {
      const names = getPokedexCardNames(card);
      return pokemonNameMatchesCardName(displayName, names.englishName ?? names.name);
    })
    .map(mapCardRow);

  if (cards.length === 0) {
    cards = await fetchPokemonTcgApiCardsForPokemon(pokemonName);
  }

  const result = { cards: sortPokedexCards(cards), complete: false };
  options.onProgress?.(result);
  return result;
}

const OWNERSHIP_PAGE_SIZE = 500;

async function fetchAllOwnershipRows<T extends { id: string }>(
  fetchPage: (after: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await fetchPage(after);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < OWNERSHIP_PAGE_SIZE) return rows;
    const next = data[data.length - 1]?.id;
    if (!next || next === after) throw new Error('Ownership pagination did not advance.');
    after = next;
  }
}

const fetchOwnedBinderIds = async (userId: string) => {
  const binders = await fetchAllOwnershipRows<{ id: string }>((after) => {
    const query = supabase.from('binders').select('id').eq('user_id', userId)
      .order('id', { ascending: true }).limit(OWNERSHIP_PAGE_SIZE);
    return after ? query.gt('id', after) : query;
  });
  return [...new Set(binders.map((binder) => binder.id).filter(Boolean))];
};

async function fetchBinderOwnershipRows(binderIds: string[]): Promise<OwnedPokedexCardRow[]> {
  const rowsById = new Map<string, OwnedPokedexCardRow>();
  for (let start = 0; start < binderIds.length; start += 100) {
    const ids = binderIds.slice(start, start + 100);
    const rows = await fetchAllOwnershipRows<OwnedPokedexCardRow>((after) => {
      const query = supabase.from('binder_cards').select('id, card_id, set_id').in('binder_id', ids).eq('owned', true)
        .order('id', { ascending: true }).limit(OWNERSHIP_PAGE_SIZE);
      return after ? query.gt('id', after) : query;
    });
    for (const row of rows) rowsById.set(row.id, row);
  }
  return [...rowsById.values()];
}

export async function fetchOwnedPokedexCards(): Promise<Map<string, OwnedPokedexCard>> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return new Map();

  const binderIds = await fetchOwnedBinderIds(user.id);
  const [variants, binderCards, pokedexCards] = await Promise.all([
    fetchAllOwnershipRows<OwnedPokedexCardRow>((after) => {
      const query = supabase.from('user_card_variants').select('id, card_id, set_id')
        .eq('user_id', user.id).order('id', { ascending: true }).limit(OWNERSHIP_PAGE_SIZE);
      return after ? query.gt('id', after) : query;
    }),
    fetchBinderOwnershipRows(binderIds),
    fetchAllOwnershipRows<OwnedPokedexCardRow>((after) => {
      const query = supabase.from('user_pokedex_cards').select('id, card_id, set_id')
        .eq('user_id', user.id).order('id', { ascending: true }).limit(OWNERSHIP_PAGE_SIZE);
      return after ? query.gt('id', after) : query;
    }),
  ]);

  return buildOwnedPokedexCards(variants, binderCards, pokedexCards);
}

export async function fetchOwnedPokemonNameSet(): Promise<Set<string>> {
  const owned = await fetchOwnedPokedexCards();
  const cardIds = [...new Set(Array.from(owned.values()).map((row) => row.card_id).filter(Boolean))];
  const names = new Set<string>();

  if (!cardIds.length) return names;

  const rows = await fetchStackrCardRows(cardIds);
  for (const cardId of cardIds) {
    const card = rows.get(cardId);
    if (card) {
      const cardNames = getPokedexCardNames(card);
      const normalizedCardName = normalise(cardNames.englishName ?? cardNames.name);
      if (!normalizedCardName) continue;
      names.add(normalizedCardName);
    }
  }

  return names;
}

export async function setPokedexCardOwned(card: PokedexCard, owned: boolean): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in.');

  const setId = card.set_id ?? card.raw_data?.set?.id ?? null;
  if (owned && !setId) {
    throw new Error('This card needs a verified set before it can be marked collected. Open its catalogue entry and try again.');
  }
  if (!owned) {
    let variantsQuery = supabase
      .from('user_card_variants')
      .select('id')
      .eq('user_id', user.id)
      .eq('card_id', card.id)
      .limit(1);
    if (setId) variantsQuery = variantsQuery.eq('set_id', setId);
    const { data: physicalVariants, error: physicalVariantError } = await variantsQuery;
    if (physicalVariantError) throw physicalVariantError;
    if (!canRemovePokedexOwnershipMarker(physicalVariants)) {
      throw new Error('This card is owned through your collection. Use the collection card controls to remove it.');
    }
    const binderIds = await fetchOwnedBinderIds(user.id);
    for (let start = 0; start < binderIds.length; start += 100) {
      let query = supabase.from('binder_cards').select('id')
        .in('binder_id', binderIds.slice(start, start + 100))
        .eq('card_id', card.id).eq('owned', true).limit(1);
      if (setId) query = query.eq('set_id', setId);
      const { data, error } = await query;
      if (error) throw error;
      if (data?.length) throw new Error('This card is owned through your collection. Use the collection card controls to remove it.');
    }
    let marker = supabase
      .from('user_pokedex_cards')
      .delete()
      .eq('user_id', user.id)
      .eq('card_id', card.id);
    marker = setId ? marker.eq('set_id', setId) : marker.is('set_id', null);
    const { error } = await marker;
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('user_pokedex_cards').upsert({
    user_id: user.id,
    card_id: card.id,
    set_id: setId,
  }, {
    onConflict: 'user_id,card_id,set_id',
  });

  if (error) throw error;
}
