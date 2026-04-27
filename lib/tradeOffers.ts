import { Linking } from 'react-native';
import { supabase } from './supabase';

export type TradeOfferStatus =
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'payment_required'
  | 'payment_sent'
  | 'payment_confirmed'
  | 'shipped'
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

export async function createTradeOffer(input: {
  listingId?: string | null;
  senderUserId?: string | null;
  receiverUserId?: string | null;
  receiverId?: string | null;
  offeredCards: TradeCardInput[];
  requestedCards: TradeCardInput[];
  cash?: TradeCashInput | null;
  message?: string | null;
}) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in.');

  const senderId = input.senderUserId ?? user.id;
  const receiverId = input.receiverUserId ?? input.receiverId;

  if (!receiverId) {
    throw new Error('Missing receiver user ID.');
  }

  const hasCash = !!input.cash && Number(input.cash.amount) > 0;

  const { data: offer, error: offerError } = await supabase
    .from('trade_offers')
    .insert({
      listing_id: input.listingId ?? null,
      sender_id: senderId,
      receiver_id: receiverId,
      status: hasCash ? 'payment_required' : 'sent',
      message: input.message ?? null,
    })
    .select()
    .single();

  if (offerError) throw offerError;

  const cardRows = [
    ...input.offeredCards.map((card) => ({
      offer_id: offer.id,
      owner_id: senderId,
      card_id: card.cardId,
      set_id: card.setId ?? null,
      quantity: card.quantity ?? 1,
      condition: card.condition ?? null,
      notes: card.notes ?? null,
    })),
    ...input.requestedCards.map((card) => ({
      offer_id: offer.id,
      owner_id: receiverId,
      card_id: card.cardId,
      set_id: card.setId ?? null,
      quantity: card.quantity ?? 1,
      condition: card.condition ?? null,
      notes: card.notes ?? null,
    })),
  ];

  if (cardRows.length > 0) {
    const { error: cardsError } = await supabase
      .from('trade_offer_cards')
      .insert(cardRows);

    if (cardsError) throw cardsError;
  }

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

  await createTradeStatusEvent({
    offerId: offer.id,
    status: hasCash ? 'payment_required' : 'sent',
    note: hasCash
      ? 'Trade offer created with cash payment required.'
      : 'Trade offer sent.',
  });

  return offer;
}

export async function fetchMyTradeOffers() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return [];

  const { data, error } = await supabase
    .from('trade_offers')
    .select(
      `
      *,
      trade_offer_cards (*),
      trade_cash_terms (*)
    `
    )
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data ?? [];
}

export async function fetchTradeOfferById(offerId: string) {
  const { data, error } = await supabase
    .from('trade_offers')
    .select(
      `
      *,
      trade_offer_cards (*),
      trade_cash_terms (*),
      trade_status_events (*)
    `
    )
    .eq('id', offerId)
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}

export async function updateTradeOfferStatus(
  offerId: string,
  status: TradeOfferStatus,
  note?: string | null
) {
  const { error } = await supabase
    .from('trade_offers')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', offerId);

  if (error) throw error;

  await createTradeStatusEvent({
    offerId,
    status,
    note: note ?? null,
  });
}

export async function updateCashPaymentStatus(
  offerId: string,
  paymentStatus: 'required' | 'sent' | 'confirmed' | 'failed'
) {
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

export async function createTradeStatusEvent(input: {
  offerId: string;
  status: string;
  note?: string | null;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('trade_status_events').insert({
    offer_id: input.offerId,
    user_id: user?.id ?? null,
    status: input.status,
    note: input.note ?? null,
  });

  if (error) throw error;
}

export function buildPaypalMeUrl(username: string, amount: number) {
  const cleanUsername = username
    .replace('https://paypal.me/', '')
    .replace('https://www.paypal.me/', '')
    .replace('paypal.me/', '')
    .replace('@', '')
    .trim();

  return `https://www.paypal.me/${encodeURIComponent(
    cleanUsername
  )}/${amount.toFixed(2)}`;
}

export function buildPaypalEmailPaymentUrl(email: string, amount: number) {
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
}) {
  const url = input.paypalMeUsername
    ? buildPaypalMeUrl(input.paypalMeUsername, input.amount)
    : input.paypalEmail
      ? buildPaypalEmailPaymentUrl(input.paypalEmail, input.amount)
      : null;

  if (!url) {
    throw new Error('No PayPal details available.');
  }

  const canOpen = await Linking.canOpenURL(url);

  if (!canOpen) {
    throw new Error('Could not open PayPal.');
  }

  await Linking.openURL(url);
}