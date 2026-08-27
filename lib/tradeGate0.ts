import { LIVE_COMMERCE_RELEASE_APPROVED } from './config';
import { sanitizeGate0OfferFreeText } from './gate0CommerceCopy';

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
  | 'disputed'
  | 'unavailable';

const GATE0_VISIBLE_TRADE_STATUSES = new Set<TradeOfferStatus>([
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'disputed',
]);

const GATE0_VISIBLE_TRADE_EVENTS = new Set([
  'offer_created',
  'accepted',
  'declined',
  'cancelled',
  'disputed',
]);

export function normalizeGate0TradeOfferStatus(status: unknown): TradeOfferStatus {
  const normalized = String(status ?? 'pending') as TradeOfferStatus;
  if (LIVE_COMMERCE_RELEASE_APPROVED || GATE0_VISIBLE_TRADE_STATUSES.has(normalized)) {
    return normalized;
  }
  return 'unavailable';
}

export function isGate0TradeStatusVisible(status: unknown) {
  return LIVE_COMMERCE_RELEASE_APPROVED
    || GATE0_VISIBLE_TRADE_STATUSES.has(String(status ?? '') as TradeOfferStatus);
}

export function isGate0TradeEventVisible(eventType: unknown) {
  return LIVE_COMMERCE_RELEASE_APPROVED
    || GATE0_VISIBLE_TRADE_EVENTS.has(String(eventType ?? ''));
}

type Gate0TradeOfferShape = {
  status: TradeOfferStatus;
  message?: string | null;
  sender_sent: boolean;
  receiver_sent: boolean;
  sender_received: boolean;
  receiver_received: boolean;
  completed_at: string | null;
  trade_cash_terms?: unknown;
};

export function sanitizeGate0TradeOffer<T extends Gate0TradeOfferShape>(offer: T): T {
  if (LIVE_COMMERCE_RELEASE_APPROVED) return offer;
  return {
    ...offer,
    status: normalizeGate0TradeOfferStatus(offer.status),
    message: sanitizeGate0OfferFreeText(offer.message),
    sender_sent: false,
    receiver_sent: false,
    sender_received: false,
    receiver_received: false,
    completed_at: null,
    trade_cash_terms: undefined,
  };
}

export type TradeOfferEvent = {
  id: string;
  offer_id: string;
  user_id: string | null;
  event_type: string;
  note: string | null;
  proposed_cash_amount: number | null;
  created_at: string;
};

export function sanitizeGate0TradeOfferEvent(
  event: TradeOfferEvent,
): TradeOfferEvent | null {
  if (!isGate0TradeEventVisible(event.event_type)) return null;
  if (LIVE_COMMERCE_RELEASE_APPROVED) return event;

  return {
    ...event,
    note: sanitizeGate0OfferFreeText(event.note),
    proposed_cash_amount: null,
  };
}
