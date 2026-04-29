import { supabase } from './supabase';

export const fetchOfferEvents = async (offerId: string) => {
  const { data, error } = await supabase
    .from('trade_offer_events')
    .select('*')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
};

export const sendOfferMessage = async (
  offerId: string,
  note: string
) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('trade_offer_events').insert({
    offer_id: offerId,
    user_id: user.id,
    event_type: 'message',
    note,
  });

  if (error) throw error;
};

export const sendCounterOffer = async (
  offerId: string,
  note: string,
  cash?: number
) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('trade_offer_events').insert({
    offer_id: offerId,
    user_id: user.id,
    event_type: 'counter_offer',
    note,
    proposed_cash_amount: cash ?? null,
  });

  if (error) throw error;
};