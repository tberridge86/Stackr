import { supabase } from './supabase';
import {
  BETA_TRADE_DEMO_MODE,
  PRICE_API_URL,
  TRADE_CASH_TERMS_ENABLED,
  assertTradeFulfilmentEnabled,
} from './config';
import {
  isGate0TradeEventVisible,
  isGate0TradeStatusVisible,
  sanitizeGate0TradeOffer,
  type TradeOfferStatus,
} from './tradeGate0';
import {
  assertGate0OfferFreeTextDisabled,
  sanitizeGate0OfferFreeText,
} from './gate0CommerceCopy';
export {
  isGate0TradeEventVisible,
  normalizeGate0TradeOfferStatus,
  sanitizeGate0TradeOffer,
} from './tradeGate0';
export type { TradeOfferStatus } from './tradeGate0';

// ===============================
// TYPES
// ===============================

type WritableTradeOfferStatus = Exclude<TradeOfferStatus, 'unavailable'>;

const PAYMENT_TRADE_STATUSES = new Set<TradeOfferStatus>([
  'payment_required',
  'payment_sent',
  'payment_confirmed',
]);

export type TradeCardInput = {
  cardId: string;
  setId?: string | null;
  quantity?: number | null;
  condition?: string | null;
  notes?: string | null;
};

export type TradeCashInput = {
  amount: number;
  currency?: string | null;
  payer?: 'sender' | 'receiver' | string | null;
  payerId?: string | null;
  recipientId?: string | null;
  paymentStatus?: string | null;
};

export type TradeOffer = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: TradeOfferStatus;
  message: string | null;
  listing_id: string | null;
  sender_sent: boolean;
  receiver_sent: boolean;
  sender_received: boolean;
  receiver_received: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  trade_offer_cards?: TradeOfferCard[];
  trade_cash_terms?: TradeCashTerms[];
};

export type TradeOfferCard = {
  id: string;
  offer_id: string;
  owner_id: string;
  card_id: string;
  set_id: string | null;
  quantity: number;
  condition: string | null;
  notes: string | null;
};

export type TradeCashTerms = {
  id: string;
  offer_id: string;
  payer_id: string;
  recipient_id: string;
  amount: number;
  currency: string;
  paypal_me_username: string | null;
  paypal_email: string | null;
  payment_intent_id?: string | null;
  payment_status: string;
};

// ===============================
// CREATE OFFER
// ===============================

export async function createTradeOffer(input: {
  listingId?: string | null;
  senderUserId?: string | null;
  receiverUserId?: string | null;
  receiverId?: string | null;
  offeredCards: TradeCardInput[];
  requestedCards: TradeCardInput[];
  cash?: TradeCashInput | null;
  message?: string | null;
}): Promise<TradeOffer> {
  assertGate0OfferFreeTextDisabled(input.message, 'Offer message');
  for (const card of [...input.offeredCards, ...input.requestedCards]) {
    assertGate0OfferFreeTextDisabled(card.notes, 'Offer card note');
  }

  if (input.cash != null && !TRADE_CASH_TERMS_ENABLED) {
    throw new Error('Cash terms are disabled for this release. Card-for-card offers only.');
  }

  const cashAmount = input.cash == null ? null : Number(input.cash.amount);
  if (cashAmount != null && (!Number.isFinite(cashAmount) || cashAmount <= 0)) {
    throw new Error('Cash terms require a positive finite amount.');
  }
  const hasCash = cashAmount != null;

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in.');

  const senderId = input.senderUserId ?? user.id;
  const receiverId = input.receiverUserId ?? input.receiverId;

  if (!receiverId) throw new Error('Missing receiver user ID.');
  if (senderId !== user.id) throw new Error('Offer sender must match the signed-in user.');
  if (receiverId === senderId) throw new Error('You cannot make an offer to yourself.');
  if (!input.listingId) throw new Error('An active Market listing is required for an offer.');
  if (input.offeredCards.length === 0 || input.requestedCards.length !== 1) {
    throw new Error('Card-only offers require offered cards and one requested listing card.');
  }

  const { data: activeListing, error: listingError } = await supabase
    .from('user_card_flags')
    .select('user_id, card_id, set_id')
    .eq('id', input.listingId)
    .eq('flag_type', 'trade')
    .eq('listing_status', 'active')
    .maybeSingle();
  if (listingError) throw listingError;
  if (!activeListing?.user_id || !activeListing.card_id) {
    throw new Error('This Market listing is no longer available.');
  }
  if (activeListing.user_id !== receiverId) {
    throw new Error('The offer recipient must match the active listing owner.');
  }
  if (activeListing.user_id === senderId) {
    throw new Error('You cannot make an offer on your own listing.');
  }

  const requestedCard = input.requestedCards[0];
  if (
    requestedCard.cardId !== activeListing.card_id
    || (requestedCard.setId ?? null) !== (activeListing.set_id ?? null)
  ) {
    throw new Error('The requested card must match the active Market listing.');
  }

  // Create the offer — always starts as 'pending'
  const { data: offer, error: offerError } = await supabase
    .from('trade_offers')
    .insert({
      listing_id: input.listingId ?? null,
      sender_id: senderId,
      receiver_id: receiverId,
      status: 'pending',
      message: sanitizeGate0OfferFreeText(input.message),
    })
    .select()
    .single();

  if (offerError) throw offerError;

  // Insert offer cards
  const cardRows = [
    ...input.offeredCards.map((card) => ({
      offer_id: offer.id,
      owner_id: senderId,
      card_id: card.cardId,
      set_id: card.setId ?? null,
    })),
    ...input.requestedCards.map((card) => ({
      offer_id: offer.id,
      owner_id: receiverId,
      card_id: card.cardId,
      set_id: card.setId ?? null,
    })),
  ];

  if (cardRows.length > 0) {
    const { error: cardsError } = await supabase
      .from('trade_offer_cards')
      .insert(cardRows);
    if (cardsError) throw cardsError;
  }

  // Insert cash terms if applicable
  if (hasCash && input.cash) {
    const payerId =
      input.cash.payerId ??
      (input.cash.payer === 'receiver' ? receiverId : senderId);

    const recipientId =
      input.cash.recipientId ??
      (input.cash.payer === 'receiver' ? senderId : receiverId);

    const { error: cashError } = await supabase
      .from('trade_cash_terms')
      .insert({
        offer_id: offer.id,
        payer_id: payerId,
        recipient_id: recipientId,
        amount: input.cash.amount,
        currency: input.cash.currency ?? 'GBP',
        payment_status: 'required',
      });

    if (cashError) throw cashError;
  }

  // Log the creation event
  await logTradeEvent({
    offerId: offer.id,
    userId: senderId,
    eventType: 'offer_created',
    note: null,
  });

  return offer as TradeOffer;
}

// ===============================
// FETCH OFFERS
// ===============================

export async function fetchMyTradeOffers(): Promise<TradeOffer[]> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return [];

  const offerSelect = TRADE_CASH_TERMS_ENABLED
    ? '*, trade_offer_cards (*), trade_cash_terms (*)'
    : '*, trade_offer_cards (*)';
  const { data, error } = await supabase
    .from('trade_offers')
    .select(offerSelect)
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as TradeOffer[]).map(sanitizeGate0TradeOffer);
}

export async function fetchTradeOfferById(offerId: string): Promise<TradeOffer | null> {
  const offerSelect = TRADE_CASH_TERMS_ENABLED
    ? '*, trade_offer_cards (*), trade_cash_terms (*)'
    : '*, trade_offer_cards (*)';
  const { data, error } = await supabase
    .from('trade_offers')
    .select(offerSelect)
    .eq('id', offerId)
    .maybeSingle();

  if (error) throw error;
  return data ? sanitizeGate0TradeOffer(data as unknown as TradeOffer) : null;
}

// ===============================
// UPDATE STATUS
// ===============================

export async function updateTradeOfferStatus(
  offerId: string,
  status: WritableTradeOfferStatus,
): Promise<void> {
  if (!TRADE_CASH_TERMS_ENABLED && PAYMENT_TRADE_STATUSES.has(status)) {
    throw new Error('Payment trade statuses are disabled for this release.');
  }
  if (!isGate0TradeStatusVisible(status)) {
    throw new Error('Trade fulfilment statuses are disabled for this release.');
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in.');

  const { data: currentOffer, error: offerError } = await supabase
    .from('trade_offers')
    .select('sender_id, receiver_id')
    .eq('id', offerId)
    .maybeSingle();
  if (offerError) throw offerError;
  if (!currentOffer || ![currentOffer.sender_id, currentOffer.receiver_id].includes(user.id)) {
    throw new Error('Only offer participants can update this trade.');
  }

  const extraFields: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'accepted') extraFields.accepted_at = new Date().toISOString();
  if (status === 'declined') extraFields.declined_at = new Date().toISOString();
  if (status === 'completed') extraFields.completed_at = new Date().toISOString();

  const { error } = await supabase
    .from('trade_offers')
    .update(extraFields)
    .eq('id', offerId);

  if (error) throw error;

  await logTradeEvent({
    offerId,
    userId: user.id,
    eventType: status,
    note: null,
  });
}

// ===============================
// MARK SENT / RECEIVED
// Both sides must confirm for card-for-card trades
// ===============================

export async function markTradeSent(
  offerId: string
): Promise<void> {
  assertTradeFulfilmentEnabled();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  const { data: offer, error: fetchError } = await supabase
    .from('trade_offers')
    .select('sender_id, receiver_id, sender_sent, receiver_sent')
    .eq('id', offerId)
    .single();

  if (fetchError) throw fetchError;

  const isSender = offer.sender_id === user.id;
  const updateField = isSender ? 'sender_sent' : 'receiver_sent';

  const { error } = await supabase
    .from('trade_offers')
    .update({
      [updateField]: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', offerId);

  if (error) throw error;

  await logTradeEvent({
    offerId,
    userId: user.id,
    eventType: 'sent',
    note: `${isSender ? 'Sender' : 'Receiver'} marked cards as sent.`,
  });

  // Check if both sides have sent
  const bothSent =
    (isSender ? true : offer.sender_sent) &&
    (isSender ? offer.receiver_sent : true);

  if (bothSent) {
    await updateTradeOfferStatus(offerId, 'sent');
  }
}

export async function markTradeReceived(
  offerId: string
): Promise<void> {
  assertTradeFulfilmentEnabled();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  const { data: offer, error: fetchError } = await supabase
    .from('trade_offers')
    .select('sender_id, receiver_id, sender_received, receiver_received')
    .eq('id', offerId)
    .single();

  if (fetchError) throw fetchError;

  const isSender = offer.sender_id === user.id;
  const updateField = isSender ? 'sender_received' : 'receiver_received';

  const { error } = await supabase
    .from('trade_offers')
    .update({
      [updateField]: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', offerId);

  if (error) throw error;

  await logTradeEvent({
    offerId,
    userId: user.id,
    eventType: 'received',
    note: `${isSender ? 'Sender' : 'Receiver'} marked cards as received.`,
  });

  // Check if both sides have received — auto complete
  const bothReceived =
    (isSender ? true : offer.sender_received) &&
    (isSender ? offer.receiver_received : true);

  if (bothReceived) {
    await updateTradeOfferStatus(offerId, 'completed');
  }
}

// ===============================
// CASH PAYMENT
// ===============================

export async function updateCashPaymentStatus(
  offerId: string,
  paymentStatus: 'required' | 'sent' | 'confirmed' | 'failed'
): Promise<void> {
  if (!TRADE_CASH_TERMS_ENABLED) {
    throw new Error('Cash payment status updates are disabled for this release.');
  }

  const { error } = await supabase
    .from('trade_cash_terms')
    .update({
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('offer_id', offerId);

  if (error) throw error;

  const offerStatus: TradeOfferStatus =
    paymentStatus === 'sent'
      ? 'payment_sent'
      : paymentStatus === 'confirmed'
      ? 'payment_confirmed'
      : paymentStatus === 'failed'
      ? 'disputed'
      : 'payment_required';

  await updateTradeOfferStatus(
    offerId,
    offerStatus,
  );
}

// ===============================
// REVIEW
// ===============================

export async function createTradeReview(input: {
  offerId: string;
  reviewedUserId: string;
  rating: number;
  comment?: string | null;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  if (input.rating < 1 || input.rating > 5) {
    throw new Error('Rating must be between 1 and 5.');
  }

  if (user.id === input.reviewedUserId) {
    throw new Error('You cannot review yourself.');
  }

  const { error } = await supabase.from('trade_reviews').insert({
    trade_id: input.offerId,
    reviewer_id: user.id,
    reviewed_user_id: input.reviewedUserId,
    rating: input.rating,
    comment: input.comment?.trim() || null,
  });

  if (error) throw error;
}

// ===============================
// EVENTS (unified — writes to trade_offer_events)
// ===============================

export async function logTradeEvent(input: {
  offerId: string;
  userId?: string | null;
  eventType: string;
  note?: string | null;
  proposedCashAmount?: number | null;
}): Promise<void> {
  assertGate0OfferFreeTextDisabled(input.note, 'Offer event note');

  if (!TRADE_CASH_TERMS_ENABLED && input.proposedCashAmount != null) {
    throw new Error('Cash counter-offers are disabled for this release.');
  }
  if (!TRADE_CASH_TERMS_ENABLED && PAYMENT_TRADE_STATUSES.has(input.eventType as TradeOfferStatus)) {
    throw new Error('Payment trade events are disabled for this release.');
  }
  if (!isGate0TradeEventVisible(input.eventType)) {
    throw new Error('Trade fulfilment events are disabled for this release.');
  }

  const cashAmount = input.proposedCashAmount == null ? null : Number(input.proposedCashAmount);
  if (cashAmount != null && (!Number.isFinite(cashAmount) || cashAmount <= 0)) {
    throw new Error('Cash counter-offers require a positive finite amount.');
  }

  const { error } = await supabase.from('trade_offer_events').insert({
    offer_id: input.offerId,
    user_id: input.userId ?? null,
    event_type: input.eventType,
    note: sanitizeGate0OfferFreeText(input.note),
    proposed_cash_amount: cashAmount,
  });

  if (error) throw error;
}

// ===============================
// STRIPE TRADE CASH HELPERS
// ===============================

export async function createTradeCashPaymentIntent(input: {
  offerId: string;
  payerId: string;
}): Promise<{ clientSecret: string }> {
  if (BETA_TRADE_DEMO_MODE) {
    throw new Error('Demo trade mode is enabled. No real payments can be started during beta.');
  }

  if (!PRICE_API_URL) {
    throw new Error('Missing PRICE_API_URL configuration.');
  }

  const response = await fetch(`${PRICE_API_URL}/api/stripe/create-trade-cash-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offerId: input.offerId,
      payerId: input.payerId,
    }),
  });

  const data = await response.json().catch(() => ({} as any));

  if (!response.ok) {
    throw new Error(data?.error ?? 'Could not create Stripe payment intent.');
  }

  if (!data?.clientSecret) {
    throw new Error('Missing Stripe client secret.');
  }

  return { clientSecret: data.clientSecret as string };
}
