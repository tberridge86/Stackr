import { supabase } from './supabase';

// All events read from trade_offer_events
// Status changes also write there via logTradeEvent in tradeOffers.ts

export type TradeOfferEvent = {
  id: string;
  offer_id: string;
  user_id: string | null;
  event_type: string;
  note: string | null;
  proposed_cash_amount: number | null;
  created_at: string;
};

export async function fetchOfferEvents(
  offerId: string
): Promise<TradeOfferEvent[]> {
  const { data, error } = await supabase
    .from('trade_offer_events')
    .select('*')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as TradeOfferEvent[];
}

export async function sendOfferMessage(
  offerId: string,
  note: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('trade_offer_events').insert({
    offer_id: offerId,
    user_id: user.id,
    event_type: 'message',
    note,
  });

  if (error) throw error;
}

export async function sendCounterOffer(
  offerId: string,
  note: string,
  cash?: number
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('trade_offer_events').insert({
    offer_id: offerId,
    user_id: user.id,
    event_type: 'counter_offer',
    note,
    proposed_cash_amount: cash ?? null,
  });

  if (error) throw error;
}