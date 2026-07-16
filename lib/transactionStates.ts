export type MarketplaceLifecycleStatus =
  | 'draft'
  | 'review'
  | 'published'
  | 'reserved'
  | 'purchased'
  | 'payment_pending'
  | 'payment_failed'
  | 'awaiting_dispatch'
  | 'dispatched'
  | 'tracking_active'
  | 'delivered'
  | 'buyer_confirmed'
  | 'completed'
  | 'cancelled'
  | 'return_requested'
  | 'disputed'
  | 'refunded'
  | 'archived'
  | 'sold';

export type TradeLifecycleStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'countered'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'preparing_shipment'
  | 'shipped'
  | 'received'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'reviewed'
  | 'payment_required'
  | 'payment_sent'
  | 'payment_confirmed'
  | 'pending';

export const MARKETPLACE_STATUS_LABELS: Record<MarketplaceLifecycleStatus, string> = {
  draft: 'Draft',
  review: 'In review',
  published: 'Published',
  reserved: 'Reserved',
  purchased: 'Purchased',
  payment_pending: 'Payment pending',
  payment_failed: 'Payment failed',
  awaiting_dispatch: 'Awaiting dispatch',
  dispatched: 'Dispatched',
  tracking_active: 'Tracking active',
  delivered: 'Delivered',
  buyer_confirmed: 'Buyer confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  return_requested: 'Return requested',
  disputed: 'Disputed',
  refunded: 'Refunded',
  archived: 'Archived',
  sold: 'Sold',
};

export const TRADE_STATUS_LABELS: Record<TradeLifecycleStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  countered: 'Countered',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
  preparing_shipment: 'Preparing shipment',
  shipped: 'Shipped',
  received: 'Received',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  reviewed: 'Reviewed',
  payment_required: 'Payment required',
  payment_sent: 'Payment sent',
  payment_confirmed: 'Payment confirmed',
  pending: 'Pending',
};

export function normaliseMarketplaceStatus(status?: string | null): MarketplaceLifecycleStatus {
  if (status === 'active' || status == null) return 'published';
  if (status in MARKETPLACE_STATUS_LABELS) return status as MarketplaceLifecycleStatus;
  return 'published';
}

export function normaliseTradeStatus(status?: string | null): TradeLifecycleStatus {
  if (status && status in TRADE_STATUS_LABELS) return status as TradeLifecycleStatus;
  return 'pending';
}
