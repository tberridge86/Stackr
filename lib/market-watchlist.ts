import { supabase } from './supabase';

export type MarketWatchItem = {
  id: string;
  user_id: string;
  card_id: string;
  set_id: string;
  created_at: string;
};

export async function fetchMarketWatchlist(): Promise<MarketWatchItem[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return [];

  const { data, error } = await supabase
    .from('market_watchlist')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as MarketWatchItem[];
}

export async function addToMarketWatchlist(cardId: string, setId: string): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in.');

  const { error } = await supabase.from('market_watchlist').upsert(
    {
      user_id: user.id,
      card_id: cardId,
      set_id: setId,
    },
    {
      onConflict: 'user_id,card_id,set_id',
      ignoreDuplicates: true,
    }
  );

  if (error) throw error;
}

export async function removeFromMarketWatchlist(cardId: string, setId: string): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw userError;

  const { error } = await supabase
    .from('market_watchlist')
    .delete()
    .eq('user_id', user.id)
    .eq('card_id', cardId)
    .eq('set_id', setId);

  if (error) throw error;
}