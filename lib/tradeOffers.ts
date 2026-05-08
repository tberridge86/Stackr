import { Linking } from 'react-native';
import { supabase } from './supabase';

// ===============================
// TYPES
// ===============================

export type TradeOfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'payment_required'
  | 'payment_sent'
  | 'payment_confirmed'
  | 'sent'
  | 'received'
  | 'completed'
  | 'disputed';

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
  recipientPaypal?: string | null;
  paypalMeUsername?: string | null;
  paypalEmail?: string | null;
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
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in.');

  const senderId = input.senderUserId ?? user.id;
  const receiverId = input.receiverUserId ?? input.receiverId;

  if (!receiverId) throw new Error('Missing receiver user ID.');

  const hasCash = !!input.cash && Number(input.cash.amount) > 0;

  // Create the offer — always starts as 'pending'
  const { data: offer, error: offerError } = await supabase
    .from('trade_offers')
    .insert({
      listing_id: input.listingId ?? null,
      sender_id: senderId,
      receiver_id: receiverId,
      status: 'pending',
      message: input.message ?? null,
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

    const paypalValue = input.cash.recipientPaypal?.trim() ?? '';
    const looksLikeEmail = paypalValue.includes('@');

    const { error: cashError } = await supabase
      .from('trade_cash_terms')
      .insert({
        offer_id: offer.id,
        payer_id: payerId,
        recipient_id: recipientId,
        amount: input.cash.amount,
        currency: input.cash.currency ?? 'GBP',
        paypal_me_username: looksLikeEmail
          ? null
          : (input.cash.paypalMeUsername ?? paypalValue) || null,
        paypal_email: looksLikeEmail
          ? (input.cash.paypalEmail ?? paypalValue)
          : (input.cash.paypalEmail ?? null),
        payment_status: 'required',
      });

    if (cashError) throw cashError;
  }

  // Log the creation event
  await logTradeEvent({
    offerId: offer.id,
    userId: senderId,
    eventType: 'offer_created',
    note: input.message ?? 'Trade offer sent.',
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

  const { data, error } = await supabase
    .from('trade_offers')
    .select(`
      *,
      trade_offer_cards (*),
      trade_cash_terms (*)
    `)
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as TradeOffer[];
}

export async function fetchTradeOfferById(offerId: string): Promise<TradeOffer | null> {
  const { data, error } = await supabase
    .from('trade_offers')
    .select(`
      *,
      trade_offer_cards (*),
      trade_cash_terms (*)
    `)
    .eq('id', offerId)
    .maybeSingle();

  if (error) throw error;
  return (data as TradeOffer | null) ?? null;
}

// ===============================
// UPDATE STATUS
// ===============================

export async function updateTradeOfferStatus(
  offerId: string,
  status: TradeOfferStatus,
  note?: string | null
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

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
    userId: user?.id ?? null,
    eventType: status,
    note: note ?? null,
  });
}

// ===============================
// MARK SENT / RECEIVED
// Both sides must confirm for card-for-card trades
// ===============================

export async function markTradeSent(
  offerId: string
): Promise<void> {
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
    await updateTradeOfferStatus(offerId, 'sent', 'Both sides have sent their cards.');
  }
}

export async function markTradeReceived(
  offerId: string
): Promise<void> {
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
    await updateTradeOfferStatus(
      offerId,
      'completed',
      'Both sides confirmed receipt. Trade complete!'
    );
  }
}

// ===============================
// CASH PAYMENT
// ===============================

export async function updateCashPaymentStatus(
  offerId: string,
  paymentStatus: 'required' | 'sent' | 'confirmed' | 'failed'
): Promise<void> {
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
    `Payment marked as ${paymentStatus}.`
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
  const { error } = await supabase.from('trade_offer_events').insert({
    offer_id: input.offerId,
    user_id: input.userId ?? null,
    event_type: input.eventType,
    note: input.note ?? null,
    proposed_cash_amount: input.proposedCashAmount ?? null,
  });

  if (error) throw error;
}

// ===============================
// PAYPAL HELPERS
// ===============================

export function buildPaypalMeUrl(username: string, amount: number): string {
  const clean = username
    .replace('https://paypal.me/', '')
    .replace('https://www.paypal.me/', '')
    .replace('paypal.me/', '')
    .replace('@', '')
    .trim();

  return `https://www.paypal.me/${encodeURIComponent(clean)}/${amount.toFixed(2)}`;
}

export function buildPaypalEmailPaymentUrl(email: string, amount: number): string {
  const params = new URLSearchParams({
    cmd: '_xclick',
    business: email,
    amount: amount.toFixed(2),
    currency_code: 'GBP',
  });

  return `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
}

export async function openPaypalPayment(input: {
  paypalMeUsername?: string | null;
  paypalEmail?: string | null;
  amount: number;
}): Promise<void> {
  const url = input.paypalMeUsername
    ? buildPaypalMeUrl(input.paypalMeUsername, input.amount)
    : input.paypalEmail
    ? buildPaypalEmailPaymentUrl(input.paypalEmail, input.amount)
    : null;

  if (!url) throw new Error('No PayPal details available.');

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) throw new Error('Could not open PayPal.');

  await Linking.openURL(url);
}