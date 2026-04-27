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

  // Binder valuation fields
  ebay_value?: number | null;
  tcg_value?: number | null;
  cardmarket_value?: number | null;
};

export type BinderCardRecord = {
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
  const { data, error } = await supabase
    .from('binder_cards')
    .select('*')
    .eq('binder_id', binderId)
    .order('slot_order', { ascending: true });

  if (error) throw error;

  return (data ?? []) as BinderCardRecord[];
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

  const binder = data as BinderRecord;

  if (input.type === 'official' && input.sourceSetId) {
    const cards = await fetchCardsForSet(input.sourceSetId);

    if (cards.length) {
      const rows = cards.map((card, index) => ({
        binder_id: binder.id,

        card_id: card.id,
        set_id: card.set?.id ?? input.sourceSetId,

        api_card_id: card.id,
        api_set_id: card.set?.id ?? input.sourceSetId,

        card_name: card.name ?? null,
        card_number: card.number ?? null,
        image_url: card.images?.small ?? null,

        set_name: card.set?.name ?? null,
        set_total: card.set?.printedTotal ?? card.set?.total ?? null,

        slot_order: index,
        owned: false,
        notes: '',
      }));

      const { error: cardsError } = await supabase
        .from('binder_cards')
        .insert(rows);

      if (cardsError) throw cardsError;
    }
  }

  return binder;
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
  const { error } = await supabase
    .from('binders')
    .delete()
    .eq('id', binderId);

  if (error) throw error;
}