import { supabase } from './supabase';
import { fetchCardsForSet } from './pokemonTcg';
import { createActivityPost } from './activity';

export type BinderType = 'official' | 'custom';

export type BinderRecord = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  type: BinderType;
  source_set_id: string | null;
  created_at: string;

  ebay_value?: number | null;
  tcg_value?: number | null;
  cardmarket_value?: number | null;
};

export type BinderCardRecord = {
  card?: any | null;
  id: string;
  binder_id: string;
  card_id: string;
  set_id: string;
  api_card_id: string | null;
  card_name: string | null;
  api_set_id: string | null;
  card_number: string | null;
  image_url: string | null;
  set_name: string | null;
  set_total: number | null;
  slot_order: number;
  owned: boolean;
  notes: string;

  ebay_price: number | null;
  tcg_price: number | null;
  cardmarket_price: number | null;
  last_price_update: string | null;

  created_at: string;
};

function makeVirtualBinderCardId(
  binderId: string,
  setId: string,
  cardId: string
) {
  return `virtual:${binderId}:${setId}:${cardId}`;
}

function parseVirtualBinderCardId(id: string) {
  const parts = id.split(':');

  if (parts[0] !== 'virtual' || parts.length < 4) {
    return null;
  }

  return {
    binderId: parts[1],
    setId: parts[2],
    cardId: parts.slice(3).join(':'),
  };
}

export async function fetchBinders(): Promise<BinderRecord[]> {
  const { data, error } = await supabase
    .from('binders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []) as BinderRecord[];
}

export async function fetchBinderById(
  binderId: string
): Promise<BinderRecord | null> {
  const { data, error } = await supabase
    .from('binders')
    .select('*')
    .eq('id', binderId)
    .maybeSingle();

  if (error) throw error;

  return (data as BinderRecord | null) ?? null;
}

export async function fetchBinderCards(
  binderId: string
): Promise<BinderCardRecord[]> {
  const binder = await fetchBinderById(binderId);

  if (!binder) return [];

  const { data: userRows, error: userRowsError } = await supabase
    .from('binder_cards')
    .select('*')
    .eq('binder_id', binderId)
    .order('slot_order', { ascending: true });

  if (userRowsError) throw userRowsError;

  const savedRows = (userRows ?? []) as BinderCardRecord[];

  if (binder.type !== 'official' || !binder.source_set_id) {
    return savedRows;
  }

  const setCards = await fetchCardsForSet(binder.source_set_id);

  const savedByCardKey = new Map(
    savedRows.map((row) => [`${row.set_id}:${row.card_id}`, row])
  );

  return setCards.map((card, index) => {
    const setId = binder.source_set_id as string;
    const existing = savedByCardKey.get(`${setId}:${card.id}`);

    if (existing) {
      return {
  ...existing,
  slot_order: existing.slot_order ?? index,
  card_name: existing.card_name ?? card.name ?? null,
  card_number: existing.card_number ?? card.number ?? null,
  image_url: existing.image_url ?? card.images?.small ?? null,
  card: {
    id: card.id,
    name: card.name,
    number: card.number,
    rarity: card.rarity,
    images: {
      small: card.images?.small ?? null,
      large: card.images?.large ?? null,
    },
  },
};
    }

    return {
      id: makeVirtualBinderCardId(binderId, setId, card.id),
      binder_id: binderId,
      card_id: card.id,
      set_id: setId,
      api_card_id: card.id,
      card_name: card.name ?? null,
      api_set_id: setId,
      card_number: card.number ?? null,
      image_url: card.images?.small ?? null,
      set_name: null,
      set_total: setCards.length,
      slot_order: index,
      owned: false,
      notes: '',

      ebay_price: null,
      tcg_price: null,
      cardmarket_price: null,
      last_price_update: null,

card: {
  id: card.id,
  name: card.name,
  number: card.number,
  rarity: card.rarity,
  images: {
    small: card.images?.small ?? null,
    large: card.images?.large ?? null,
  },
},

created_at: new Date().toISOString(),
    };
  });
}

export async function createBinder(input: {
  name: string;
  color: string;
  type: BinderType;
  sourceSetId?: string | null;
}): Promise<BinderRecord> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in.');

  const { data, error } = await supabase
    .from('binders')
    .insert({
      user_id: user.id,
      name: input.name,
      color: input.color,
      type: input.type,
      source_set_id: input.sourceSetId ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  return data as BinderRecord;
}

export async function addCardsToBinder(
  binderId: string,
  cards: { cardId: string; setId: string }[]
): Promise<void> {
  const existing = await fetchBinderCards(binderId);

  const existingKeys = new Set(
    existing.map((card) => `${card.set_id}:${card.card_id}`)
  );

  const rows = cards
    .filter((card) => !existingKeys.has(`${card.setId}:${card.cardId}`))
    .map((card, index) => ({
      binder_id: binderId,
      card_id: card.cardId,
      set_id: card.setId,
      slot_order: existing.length + index,
      owned: false,
      notes: '',
    }));

  if (!rows.length) return;

  const { error } = await supabase.from('binder_cards').insert(rows);

  if (error) throw error;
}

export async function updateBinderCardOwned(
  binderCardId: string,
  owned: boolean
): Promise<void> {
  const virtual = parseVirtualBinderCardId(binderCardId);

  if (virtual) {
    if (!owned) return;

    const { data, error } = await supabase
      .from('binder_cards')
      .insert({
        binder_id: virtual.binderId,
        card_id: virtual.cardId,
        set_id: virtual.setId,
        api_card_id: virtual.cardId,
        api_set_id: virtual.setId,
        slot_order: 0,
        owned: true,
        notes: '',
      })
      .select('id, card_id, set_id, owned')
      .single();

    if (error) throw error;

    await createActivityPost({
      title: 'Added a card to binder',
      subtitle: virtual.cardId,
      cardId: virtual.cardId,
      setId: virtual.setId,
      type: 'binder_add',
    });

    return;
  }

  const { data: existingCard, error: fetchError } = await supabase
    .from('binder_cards')
    .select('card_id, set_id, owned')
    .eq('id', binderCardId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from('binder_cards')
    .update({ owned })
    .eq('id', binderCardId);

  if (error) throw error;

  if (owned && existingCard && !existingCard.owned) {
    await createActivityPost({
      title: 'Added a card to binder',
      subtitle: existingCard.card_id,
      cardId: existingCard.card_id,
      setId: existingCard.set_id,
      type: 'binder_add',
    });
  }
}

export async function deleteBinder(binderId: string): Promise<void> {
  const { error } = await supabase.from('binders').delete().eq('id', binderId);

  if (error) throw error;
}