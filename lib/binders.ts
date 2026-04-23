import { supabase } from './supabase';
import { fetchCardsForSet } from './pokemonTcg';

export type BinderType = 'official' | 'custom';

export type BinderRecord = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  type: BinderType;
  source_set_id: string | null;
  created_at: string;
};

export type BinderCardRecord = {
  id: string;
  binder_id: string;
  card_id: string;
  set_id: string;
  slot_order: number;
  owned: boolean;
  notes: string;
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

export async function fetchBinderById(binderId: string): Promise<BinderRecord | null> {
  const { data, error } = await supabase
    .from('binders')
    .select('*')
    .eq('id', binderId)
    .maybeSingle();

  if (error) throw error;
  return (data as BinderRecord | null) ?? null;
}

export async function fetchBinderCards(binderId: string): Promise<BinderCardRecord[]> {
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
        set_id: input.sourceSetId,
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
  cards: Array<{ cardId: string; setId: string }>
): Promise<void> {
  const existing = await fetchBinderCards(binderId);
  const existingKeys = new Set(existing.map((c) => `${c.set_id}:${c.card_id}`));

  const rows = cards
    .filter((c) => !existingKeys.has(`${c.setId}:${c.cardId}`))
    .map((c, index) => ({
      binder_id: binderId,
      card_id: c.cardId,
      set_id: c.setId,
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
  const { error } = await supabase
    .from('binder_cards')
    .update({ owned })
    .eq('id', binderCardId);

  if (error) throw error;
}

export async function deleteBinder(binderId: string): Promise<void> {
  const { error } = await supabase
    .from('binders')
    .delete()
    .eq('id', binderId);

  if (error) throw error;
}