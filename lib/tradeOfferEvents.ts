import { supabase } from './supabase';
import { TRADE_CASH_TERMS_ENABLED } from './config';
import {
  assertGate0OfferFreeTextDisabled,
  sanitizeGate0OfferFreeText,
} from './gate0CommerceCopy';
import {
  isGate0TradeEventVisible,
  sanitizeGate0TradeOfferEvent,
  type TradeOfferEvent,
} from './tradeGate0';
export { sanitizeGate0TradeOfferEvent } from './tradeGate0';
export type { TradeOfferEvent } from './tradeGate0';

// All events read from trade_offer_events
// Status changes also write there via logTradeEvent in tradeOffers.ts

export async function fetchOfferEvents(
  offerId: string
): Promise<TradeOfferEvent[]> {
  const { data, error } = await supabase
    .from('trade_offer_events')
    .select('*')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as TradeOfferEvent[])
    .map(sanitizeGate0TradeOfferEvent)
    .filter((event): event is TradeOfferEvent => event !== null);
}

export async function sendOfferMessage(
  offerId: string,
  note: string
): Promise<void> {
  assertGate0OfferFreeTextDisabled(note, 'Offer message');
  if (!isGate0TradeEventVisible('message')) {
    throw new Error('Free-form offer messages are disabled during this beta.');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('trade_offer_events').insert({
    offer_id: offerId,
    user_id: user.id,
    event_type: 'message',
    note: sanitizeGate0OfferFreeText(note),
  });

  if (error) throw error;
}

export async function sendCounterOffer(
  offerId: string,
  note: string,
  cash?: number
): Promise<void> {
  assertGate0OfferFreeTextDisabled(note, 'Counter-offer message');
  if (!isGate0TradeEventVisible('counter_offer')) {
    throw new Error('Free-form counter offers are disabled during this beta.');
  }

  if (cash != null && !TRADE_CASH_TERMS_ENABLED) {
    throw new Error('Cash counter-offers are disabled for this release.');
  }
  if (cash != null && (!Number.isFinite(cash) || cash <= 0)) {
    throw new Error('Cash counter-offers require a positive finite amount.');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('trade_offer_events').insert({
    offer_id: offerId,
    user_id: user.id,
    event_type: 'counter_offer',
    note: sanitizeGate0OfferFreeText(note),
    proposed_cash_amount: cash ?? null,
  });

  if (error) throw error;
}
