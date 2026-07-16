import { searchLocalPokemonCards } from './cardSearch';
import { USD_TO_GBP } from './config';
import { getPreferredMarketPrice, getPriceFromPokemonCard } from './pricing';
import { supabase } from './supabase';

export type PokedexCard = {
  id: string;
  name: string;
  number?: string | null;
  rarity?: string | null;
  set_id?: string | null;
  set_name?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  image_urls?: string[];
  estimated_value?: number | null;
  price_source?: string | null;
  raw_data?: any;
};

export type OwnedPokedexCard = {
  card_id: string;
  set_id: string | null;
  binder_card_ids: string[];
  pokedex_card_ids: string[];
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
  const id = String(card.id ?? '').trim();
  const scrydexLarge = id ? `https://images.scrydex.com/pokemon/${id}/large` : null;
  const scrydexSmall = id ? `https://images.scrydex.com/pokemon/${id}/small` : null;

  return uniqueUrls([
    scrydexLarge,
    scrydexSmall,
    card.raw_data?.images?.large,
    card.raw_data?.images?.small,
    card.image_large,
    card.image_small,
  ]);
};

const mapCardRow = (card: any): PokedexCard => {
  const imageUrls = buildPokedexImageUrls(card);

  return {
    id: card.id,
    name: card.name,
    number: card.number ?? null,
    rarity: card.rarity ?? card.raw_data?.rarity ?? null,
    set_id: card.set_id ?? card.raw_data?.set?.id ?? null,
    set_name: card.raw_data?.set?.name ?? card.set_name ?? null,
    image_small: imageUrls[1] ?? imageUrls[0] ?? null,
    image_large: imageUrls[0] ?? null,
    image_urls: imageUrls,
    raw_data: card.raw_data ?? null,
  };
};

const mapApiCard = (card: any): PokedexCard => ({
  id: card.id,
  name: card.name,
  number: card.number ?? null,
  rarity: card.rarity ?? null,
  set_id: card.set?.id ?? null,
  set_name: card.set?.name ?? null,
  image_small: card.images?.small ?? null,
  image_large: card.images?.large ?? null,
  image_urls: uniqueUrls([card.images?.large, card.images?.small]),
  raw_data: card,
});

async function addSetNames(cards: PokedexCard[]): Promise<PokedexCard[]> {
  const missingSetNameIds = [...new Set(
    cards
      .filter((card) => !card.set_name && card.set_id)
      .map((card) => card.set_id as string)
  )];

  if (!missingSetNameIds.length) return cards;

  const { data, error } = await supabase
    .from('pokemon_sets')
    .select('id, name')
    .in('id', missingSetNameIds);

  if (error) {
    console.log('Pokedex set name lookup failed:', error.message);
    return cards;
  }

  const setNameMap = new Map((data ?? []).map((set: any) => [set.id, set.name]));
  return cards.map((card) => ({
    ...card,
    set_name: card.set_name ?? (card.set_id ? setNameMap.get(card.set_id) ?? null : null),
  }));
}

async function addLatestPrices(cards: PokedexCard[]): Promise<PokedexCard[]> {
  const cardIds = [...new Set(cards.map((card) => card.id).filter(Boolean))];
  if (!cardIds.length) return cards;

  const snapshotMap = new Map<string, any>();
  for (let i = 0; i < cardIds.length; i += 250) {
    const batch = cardIds.slice(i, i + 250);
    const { data, error } = await supabase
      .from('market_price_snapshots')
      .select('card_id, ebay_average, tcg_mid, cardmarket_trend, snapshot_at')
      .in('card_id', batch)
      .order('snapshot_at', { ascending: false });

    if (error) {
      console.log('Pokedex price lookup failed:', error.message);
      continue;
    }

    for (const row of data ?? []) {
      if (!snapshotMap.has((row as any).card_id)) {
        snapshotMap.set((row as any).card_id, row);
      }
    }
  }

  return cards.map((card) => {
    const fallbackTcgUsd = getPriceFromPokemonCard(card.raw_data);
    const price = getPreferredMarketPrice(snapshotMap.get(card.id), {
      tcg: typeof fallbackTcgUsd === 'number' ? fallbackTcgUsd * USD_TO_GBP : null,
    });

    return {
      ...card,
      estimated_value: price.value,
      price_source: price.source,
    };
  });
}

async function enrichPokedexCards(cards: PokedexCard[]): Promise<PokedexCard[]> {
  const withSetNames = await addSetNames(cards);
  return addLatestPrices(withSetNames);
}

async function fetchPokemonTcgApiCardsForPokemon(pokemonName: string): Promise<PokedexCard[]> {
  const displayName = formatPokedexName(pokemonName);
  const terms = getPokemonCardSearchTerms(pokemonName);
  const cardsById = new Map<string, PokedexCard>();

  for (const term of terms) {
    const query = `name:"*${term.replace(/"/g, '')}*"`;
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=250&orderBy=-set.releaseDate`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.log('Pokedex Pokemon TCG API fallback failed:', {
          pokemonName,
          term,
          status: response.status,
        });
        continue;
      }

      const json = await response.json();
      const rows = Array.isArray(json?.data) ? json.data : [];

      for (const row of rows) {
        if (!pokemonNameMatchesCardName(displayName, row.name ?? '')) continue;
        cardsById.set(row.id, mapApiCard(row));
      }
    } catch (error) {
      console.log('Pokedex Pokemon TCG API fallback errored:', {
        pokemonName,
        term,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Array.from(cardsById.values());
}

export async function fetchCardsForPokemon(pokemonName: string): Promise<PokedexCard[]> {
  const displayName = formatPokedexName(pokemonName);
  const searchTerms = getPokemonCardSearchTerms(pokemonName);
  const rowsById = new Map<string, any>();

  for (const term of searchTerms) {
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
      .ilike('name', `%${term}%`)
      .limit(1000);

    if (error) {
      console.log('Pokedex direct card lookup failed:', {
        pokemonName,
        term,
        message: error.message,
        code: error.code,
      });
      continue;
    }

    for (const row of data ?? []) {
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
    .filter((card) => pokemonNameMatchesCardName(displayName, card.name ?? ''))
    .map(mapCardRow)
    .sort((a, b) => {
      const dateA = a.raw_data?.set?.releaseDate ?? '';
      const dateB = b.raw_data?.set?.releaseDate ?? '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return String(a.number ?? '').localeCompare(String(b.number ?? ''), undefined, { numeric: true });
    });

  if (cards.length === 0) {
    cards = await fetchPokemonTcgApiCardsForPokemon(pokemonName);
  }

  return enrichPokedexCards(cards);
}

export async function fetchOwnedPokedexCards(): Promise<Map<string, OwnedPokedexCard>> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return new Map();

  const { data: binders, error: binderError } = await supabase
    .from('binders')
    .select('id')
    .eq('user_id', user.id);

  if (binderError) throw binderError;

  const map = new Map<string, OwnedPokedexCard>();

  const addRow = (
    row: { id: string; card_id: string; set_id: string | null },
    source: 'binder' | 'pokedex'
  ) => {
    const key = `${row.set_id ?? ''}:${row.card_id}`;
    const existing = map.get(key);

    if (existing) {
      if (source === 'binder') existing.binder_card_ids.push(row.id);
      else existing.pokedex_card_ids.push(row.id);
    } else {
      map.set(key, {
        card_id: row.card_id,
        set_id: row.set_id ?? null,
        binder_card_ids: source === 'binder' ? [row.id] : [],
        pokedex_card_ids: source === 'pokedex' ? [row.id] : [],
      });
    }
  };

  const binderIds = (binders ?? []).map((binder) => binder.id).filter(Boolean);

  if (binderIds.length) {
    const { data: rows, error } = await supabase
      .from('binder_cards')
      .select('id, card_id, set_id')
      .in('binder_id', binderIds)
      .eq('owned', true);

    if (error) throw error;

    for (const row of rows ?? []) {
      addRow(row, 'binder');
    }
  }

  const { data: pokedexRows, error: pokedexError } = await supabase
    .from('user_pokedex_cards')
    .select('id, card_id, set_id')
    .eq('user_id', user.id);

  if (pokedexError) throw pokedexError;

  for (const row of pokedexRows ?? []) {
    addRow(row, 'pokedex');
  }

  return map;
}

export async function fetchOwnedPokemonNameSet(): Promise<Set<string>> {
  const owned = await fetchOwnedPokedexCards();
  const cardIds = [...new Set(Array.from(owned.values()).map((row) => row.card_id).filter(Boolean))];
  const names = new Set<string>();

  if (!cardIds.length) return names;

  for (let i = 0; i < cardIds.length; i += 200) {
    const batch = cardIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select('name')
      .in('id', batch);

    if (error) throw error;

    for (const card of data ?? []) {
      const normalizedCardName = normalise(card.name ?? '');
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
  const { data: binders, error: binderError } = await supabase
    .from('binders')
    .select('id')
    .eq('user_id', user.id);

  if (binderError) throw binderError;

  const binderIds = (binders ?? []).map((binder) => binder.id).filter(Boolean);
  let existingBinderRows: { id: string }[] = [];

  if (binderIds.length) {
    let existingQuery = supabase
      .from('binder_cards')
      .select('id')
      .in('binder_id', binderIds)
      .eq('card_id', card.id);

    if (setId) existingQuery = existingQuery.eq('set_id', setId);

    const { data: rows, error } = await existingQuery;
    if (error) throw error;
    existingBinderRows = rows ?? [];
  }

  if (!owned) {
    if (existingBinderRows.length) {
      const { error: binderUpdateError } = await supabase
        .from('binder_cards')
        .update({ owned: false })
        .in('id', existingBinderRows.map((row) => row.id));

      if (binderUpdateError) throw binderUpdateError;
    }

    const { error } = await supabase
      .from('user_pokedex_cards')
      .delete()
      .eq('user_id', user.id)
      .eq('card_id', card.id);

    if (error) throw error;
    return;
  }

  if (existingBinderRows.length) {
    const { error: binderUpdateError } = await supabase
      .from('binder_cards')
      .update({ owned: true })
      .in('id', existingBinderRows.map((row) => row.id));

    if (binderUpdateError) throw binderUpdateError;

    const { error: pokedexDeleteError } = await supabase
      .from('user_pokedex_cards')
      .delete()
      .eq('user_id', user.id)
      .eq('card_id', card.id);

    if (pokedexDeleteError) throw pokedexDeleteError;
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
