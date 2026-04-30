import { supabase } from './supabase';

export async function submitTraderRating({
  tradeOfferId,
  reviewerId,
  reviewedUserId,
  rating,
  review,
}: {
  tradeOfferId: string;
  reviewerId: string;
  reviewedUserId: string;
  rating: number;
  review?: string;
}) {
  const { data, error } = await supabase
    .from('trader_ratings')
    .insert({
      trade_offer_id: tradeOfferId,
      reviewer_id: reviewerId,
      reviewed_user_id: reviewedUserId,
      rating,
      review: review?.trim() || null,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function hasUserRatedTrade(
  tradeOfferId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from('trader_ratings')
    .select('id')
    .eq('trade_offer_id', tradeOfferId)
    .eq('reviewer_id', userId)
    .maybeSingle();

  if (error) throw error;

  return !!data;
}

export async function getTraderRatingSummary(userId: string) {
  const { data, error } = await supabase
    .from('trader_rating_summary')
    .select('average_rating, rating_count')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return {
    averageRating: data?.average_rating ?? null,
    ratingCount: data?.rating_count ?? 0,
  };
}