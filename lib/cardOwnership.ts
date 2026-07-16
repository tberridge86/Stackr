import { supabase } from './supabase';
import { calculateAvailableQuantity, normaliseQuantity } from './cardOwnershipCore';

export type {
  AvailabilityBreakdown,
  CanonicalCardOwnershipRecord,
  CardCondition,
  CardOwnershipState,
  QuantityCommitment,
} from './cardOwnershipCore';

export {
  assertCanCommitQuantity,
  calculateAvailableQuantity,
  getDuplicateQuantity,
  getOwnershipAvailability,
  getOwnershipKey,
} from './cardOwnershipCore';

export async function fetchUserCardAvailability(input: {
  userId: string;
  cardId: string;
  setId?: string | null;
}) {
  const ownedQuery = supabase
    .from('user_card_variants')
    .select('quantity')
    .eq('user_id', input.userId)
    .eq('card_id', input.cardId);
  if (input.setId) ownedQuery.eq('set_id', input.setId);

  const listingQuery = supabase
    .from('user_card_flags')
    .select('id')
    .eq('user_id', input.userId)
    .eq('card_id', input.cardId)
    .eq('flag_type', 'trade')
    .or('listing_status.eq.active,listing_status.is.null');
  if (input.setId) listingQuery.eq('set_id', input.setId);

  const [ownedResult, listingResult] = await Promise.allSettled([ownedQuery, listingQuery]);

  const ownedQuantity = ownedResult.status === 'fulfilled' && !ownedResult.value.error
    ? (ownedResult.value.data ?? []).reduce((sum: number, row: any) => sum + normaliseQuantity(row.quantity), 0)
    : 0;

  const listedQuantity = listingResult.status === 'fulfilled' && !listingResult.value.error
    ? (listingResult.value.data ?? []).length
    : 0;

  let pendingTransactionQuantity = 0;
  try {
    let tradeQuery = supabase
      .from('trade_offer_cards')
      .select('quantity, trade_offers!inner(status)')
      .eq('owner_id', input.userId)
      .eq('card_id', input.cardId)
      .in('trade_offers.status', ['pending', 'accepted', 'payment_required', 'payment_sent', 'sent']);
    if (input.setId) tradeQuery = tradeQuery.eq('set_id', input.setId);
    const { data, error } = await tradeQuery;
    if (!error) {
      pendingTransactionQuantity = (data ?? []).reduce((sum: number, row: any) => sum + normaliseQuantity(row.quantity ?? 1), 0);
    }
  } catch {
    pendingTransactionQuantity = 0;
  }

  return calculateAvailableQuantity(ownedQuantity, {
    listed: listedQuantity,
    pendingTransactions: pendingTransactionQuantity,
  });
}
