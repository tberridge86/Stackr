import { searchLocalPokemonCards } from './cardSearch';
import { supabase } from './supabase';

export type PokedexCard = {
  id: string;
  name: string;
  number?: string | null;
  rarity?: string | null;
  set_id?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  image_urls?: string[];
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

const uniqueUrls = (urls: Array<string | null | undefined>) =>
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
    image_small: imageUrls[1] ?? imageUrls[0] ?? null,
    image_large: imageUrls[0] ?? null,
    image_urls: imageUrls,
    raw_data: card.raw_data ?? null,
  };
};

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

  return Array.from(rowsById.values())
    .filter((card) => pokemonNameMatchesCardName(displayName, card.name ?? ''))
    .map(mapCardRow)
    .sort((a, b) => {
      const dateA = a.raw_data?.set?.releaseDate ?? '';
      const dateB = b.raw_data?.set?.releaseDate ?? '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return String(a.number ?? '').localeCompare(String(b.number ?? ''), undefined, { numeric: true });
    });
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
