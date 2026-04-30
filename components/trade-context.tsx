import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  MarketplaceListing,
  fetchMarketplaceListings,
  fetchMyListings,
  archiveMarketplaceListing,
} from '../lib/marketplace';
import { supabase } from '../lib/supabase';
import { createActivityPost } from '../lib/activity';

type TradeMeta = {
  condition?: string;
  notes?: string;
  value?: string;
  askingPrice?: number | null;
  marketEstimate?: number | null;
  tradeOnly?: boolean;
  hasDamage?: boolean;
  damageNotes?: string | null;
  damageImageUrl?: string | null;
  listingNotes?: string | null;
};

type TradeListingInput = {
  cardId: string;
  setId?: string | null;
  condition: string;
  askingPrice?: number | null;
  marketEstimate?: number | null;
  tradeOnly: boolean;
  hasDamage: boolean;
  damageNotes?: string | null;
  damageImageUrl?: string | null;
  listingNotes?: string | null;
};

export type TradeReview = {
  id: string;
  trade_id: string;
  reviewer_id: string;
  reviewed_user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type TraderRatingSummary = {
  user_id: string;
  average_rating: number | null;
  review_count: number;
};

type CreateTradeReviewInput = {
  tradeId: string;
  reviewedUserId: string;
  rating: number;
  comment?: string | null;
};

type FlagKey = string;

const getSetIdFromCardId = (cardId: string) => {
  const parts = cardId.split('-');
  return parts.length > 1 ? parts[0] : null;
};

const makeFlagKey = (cardId: string, setId?: string | null): FlagKey => {
  return `${setId ?? 'unknown'}:${cardId}`;
};

type TradeContextType = {
  tradeCardIds: string[];
  wishlistCardIds: string[];
  tradeKeys: string[];
  wishlistKeys: string[];
  tradeMeta: Record<string, TradeMeta>;

  marketplaceListings: MarketplaceListing[];
  myListings: MarketplaceListing[];
  tradeLoading: boolean;
  tradeError: string | null;

  toggleTradeCard: (cardId: string, setId?: string | null) => Promise<void>;
  createTradeListing: (input: TradeListingInput) => Promise<void>;
  toggleWishlistCard: (cardId: string, setId?: string | null) => Promise<void>;
  updateTradeMeta: (
    cardId: string,
    data: Partial<TradeMeta>,
    setId?: string | null
  ) => Promise<void>;

  isForTrade: (cardId: string, setId?: string | null) => boolean;
  isWanted: (cardId: string, setId?: string | null) => boolean;
  getMeta: (cardId: string, setId?: string | null) => TradeMeta;

  refreshTrade: () => Promise<void>;
  archiveListing: (listingId: string) => Promise<void>;

  createTradeReview: (input: CreateTradeReviewInput) => Promise<void>;
  getTraderRating: (userId: string) => Promise<TraderRatingSummary | null>;
  getTraderReviews: (userId: string) => Promise<TradeReview[]>;
};

const TradeContext = createContext<TradeContextType | null>(null);

export function TradeProvider({ children }: { children: React.ReactNode }) {
  const [tradeCardIds, setTradeCardIds] = useState<string[]>([]);
  const [wishlistCardIds, setWishlistCardIds] = useState<string[]>([]);
  const [tradeKeys, setTradeKeys] = useState<string[]>([]);
  const [wishlistKeys, setWishlistKeys] = useState<string[]>([]);
  const [tradeMeta, setTradeMeta] = useState<Record<string, TradeMeta>>({});

  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>([]);
  const [myListings, setMyListings] = useState<MarketplaceListing[]>([]);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setTradeCardIds([]);
      setWishlistCardIds([]);
      setTradeKeys([]);
      setWishlistKeys([]);
      setTradeMeta({});
      return;
    }

    const { data, error } = await supabase
      .from('user_card_flags')
      .select('*')
      .eq('user_id', user.id);

    if (error) throw error;

    const rows = data ?? [];

    const tradeRows = rows.filter((row) => row.flag_type === 'trade');
    const wishlistRows = rows.filter((row) => row.flag_type === 'wishlist');

    setTradeCardIds(tradeRows.map((row) => row.card_id));
    setWishlistCardIds(wishlistRows.map((row) => row.card_id));

    setTradeKeys(
      tradeRows.map((row) =>
        makeFlagKey(row.card_id, row.set_id ?? getSetIdFromCardId(row.card_id))
      )
    );

    setWishlistKeys(
      wishlistRows.map((row) =>
        makeFlagKey(row.card_id, row.set_id ?? getSetIdFromCardId(row.card_id))
      )
    );

    const nextMeta: Record<string, TradeMeta> = {};

    tradeRows.forEach((row) => {
      const key = makeFlagKey(
        row.card_id,
        row.set_id ?? getSetIdFromCardId(row.card_id)
      );

      nextMeta[key] = {
        condition: row.condition ?? undefined,
        notes: row.notes ?? undefined,
        value: row.value ?? undefined,
        askingPrice: row.asking_price ?? null,
        marketEstimate: row.market_estimate ?? null,
        tradeOnly: row.trade_only ?? false,
        hasDamage: row.has_damage ?? false,
        damageNotes: row.damage_notes ?? null,
        damageImageUrl: row.damage_image_url ?? null,
        listingNotes: row.listing_notes ?? null,
      };
    });

    setTradeMeta(nextMeta);
  }, []);

  const refreshTrade = useCallback(async () => {
    try {
      setTradeError(null);
      setTradeLoading(true);

      await loadFlags();

      const [marketplace, mine] = await Promise.all([
        fetchMarketplaceListings(),
        fetchMyListings(),
      ]);

      setMarketplaceListings(marketplace ?? []);
      setMyListings(mine ?? []);
    } catch (error) {
      console.log('refreshTrade failed', error);
      setMarketplaceListings([]);
      setMyListings([]);
      setTradeError(
        error instanceof Error ? error.message : 'Failed to refresh trade data'
      );
    } finally {
      setTradeLoading(false);
    }
  }, [loadFlags]);

  useEffect(() => {
    refreshTrade();
  }, [refreshTrade]);

  const archiveListing = useCallback(
    async (listingId: string) => {
      await archiveMarketplaceListing(listingId);
      await refreshTrade();
    },
    [refreshTrade]
  );

  const createTradeReview = useCallback(
    async (input: CreateTradeReviewInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('You must be signed in.');

      if (input.rating < 1 || input.rating > 5) {
        throw new Error('Rating must be between 1 and 5.');
      }

      if (user.id === input.reviewedUserId) {
        throw new Error('You cannot review yourself.');
      }

      const { error } = await supabase.from('trade_reviews').insert({
        trade_id: input.tradeId,
        reviewer_id: user.id,
        reviewed_user_id: input.reviewedUserId,
        rating: input.rating,
        comment: input.comment?.trim() || null,
      });

      if (error) throw error;
    },
    []
  );

  const getTraderRating = useCallback(
    async (userId: string): Promise<TraderRatingSummary | null> => {
      const { data, error } = await supabase
        .from('profile_rating_summary')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      return data ?? null;
    },
    []
  );

  const getTraderReviews = useCallback(
    async (userId: string): Promise<TradeReview[]> => {
      const { data, error } = await supabase
        .from('trade_reviews')
        .select('*')
        .eq('reviewed_user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data ?? [];
    },
    []
  );

const markTradeSent = useCallback(
  async (tradeId: string, userId: string) => {
    const { data: trade, error: loadError } = await supabase
      .from('trade_offers')
      .select('id, sender_id, receiver_id')
      .eq('id', tradeId)
      .single();

    if (loadError) throw loadError;

    const update =
      trade.sender_id === userId
        ? { sender_sent: true }
        : { receiver_sent: true };

    const { error } = await supabase
      .from('trade_offers')
      .update(update)
      .eq('id', tradeId);

    if (error) throw error;
  },
  []
);

const markTradeReceived = useCallback(
  async (tradeId: string, userId: string) => {
    const { data: trade, error: loadError } = await supabase
      .from('trade_offers')
      .select('id, sender_id, receiver_id')
      .eq('id', tradeId)
      .single();

    if (loadError) throw loadError;

    const update =
      trade.sender_id === userId
        ? { sender_received: true }
        : { receiver_received: true };

    const { error } = await supabase
      .from('trade_offers')
      .update(update)
      .eq('id', tradeId);

    if (error) throw error;

    const { data: updatedTrade, error: reloadError } = await supabase
      .from('trade_offers')
      .select(
        'sender_sent, receiver_sent, sender_received, receiver_received'
      )
      .eq('id', tradeId)
      .single();

    if (reloadError) throw reloadError;

    const bothCompleted =
      updatedTrade.sender_sent &&
      updatedTrade.receiver_sent &&
      updatedTrade.sender_received &&
      updatedTrade.receiver_received;

    if (bothCompleted) {
      const { error: completeError } = await supabase
        .from('trade_offers')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', tradeId);

      if (completeError) throw completeError;
    }
  },
  []
);

  const toggleFlag = useCallback(
    async (
      cardId: string,
      flag: 'trade' | 'wishlist',
      setId?: string | null
    ) => {
      const resolvedSetId = setId ?? getSetIdFromCardId(cardId);
      const key = makeFlagKey(cardId, resolvedSetId);
      const isTrade = flag === 'trade';

      const currentKeys = isTrade ? tradeKeys : wishlistKeys;
      const setKeys = isTrade ? setTradeKeys : setWishlistKeys;
      const setIds = isTrade ? setTradeCardIds : setWishlistCardIds;

      const exists =
        currentKeys.includes(key) ||
        (isTrade ? tradeCardIds : wishlistCardIds).includes(cardId);

      setKeys((prev) =>
        exists ? prev.filter((item) => item !== key) : [...prev, key]
      );

      setIds((prev) =>
        exists ? prev.filter((id) => id !== cardId) : [...prev, cardId]
      );

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          throw new Error('You must be signed in.');
        }

        if (exists) {
          let query = supabase
            .from('user_card_flags')
            .delete()
            .eq('user_id', user.id)
            .eq('card_id', cardId)
            .eq('flag_type', flag);

          if (resolvedSetId) {
            query = query.eq('set_id', resolvedSetId);
          }

          const { error } = await query;

          if (error) throw error;
        } else {
          const { error } = await supabase.from('user_card_flags').upsert(
            {
              user_id: user.id,
              card_id: cardId,
              set_id: resolvedSetId,
              flag_type: flag,
            },
            {
              onConflict: 'user_id,card_id,flag_type',
              ignoreDuplicates: true,
            }
          );

          if (error) throw error;

          if (flag === 'trade') {
            createActivityPost({
              type: 'trade_listed',
              title: 'Listed a card for trade',
              cardId,
              setId: resolvedSetId,
            }).catch((activityError) => {
              console.log('Failed to create trade activity post', activityError);
            });

            let wantedQuery = supabase
              .from('user_card_flags')
              .select('user_id')
              .eq('card_id', cardId)
              .eq('flag_type', 'wishlist')
              .neq('user_id', user.id);

            if (resolvedSetId) {
              wantedQuery = wantedQuery.eq('set_id', resolvedSetId);
            }

            const { data: wantedMatches, error: wantedError } = await wantedQuery;

            if (wantedError) {
              console.log('Failed to check wishlist matches', wantedError);
            }

            if (wantedMatches?.length) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('collector_name')
                .eq('id', user.id)
                .maybeSingle();

              const sellerName = profile?.collector_name ?? 'Another collector';

              const notifications = wantedMatches.map((match) => ({
                user_id: match.user_id,
                type: 'wishlist_match',
                title: 'Wishlist match found',
                message: `${sellerName} just listed a card from your wishlist.`,
                card_id: cardId,
                set_id: resolvedSetId,
                created_at: new Date().toISOString(),
                read: false,
              }));

              const { error: notifyError } = await supabase
                .from('notifications')
                .insert(notifications);

              if (notifyError) {
                console.log('Failed to create wishlist notifications', notifyError);
              }
            }
          }
        }

        await loadFlags();
      } catch (error) {
        console.log('Rollback triggered', error);

        setKeys((prev) =>
          exists ? [...prev, key] : prev.filter((item) => item !== key)
        );

        setIds((prev) =>
          exists ? [...prev, cardId] : prev.filter((id) => id !== cardId)
        );

        throw error;
      }
    },
    [tradeKeys, wishlistKeys, tradeCardIds, wishlistCardIds, loadFlags]
  );

  const createTradeListing = useCallback(
    async (input: TradeListingInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('You must be signed in.');

      const resolvedSetId = input.setId ?? getSetIdFromCardId(input.cardId);
      const key = makeFlagKey(input.cardId, resolvedSetId);

      const { error } = await supabase.from('user_card_flags').upsert(
        {
          user_id: user.id,
          card_id: input.cardId,
          set_id: resolvedSetId,
          flag_type: 'trade',
          condition: input.condition,
          asking_price: input.askingPrice ?? null,
          market_estimate: input.marketEstimate ?? null,
          trade_only: input.tradeOnly,
          has_damage: input.hasDamage,
          damage_notes: input.damageNotes ?? null,
          damage_image_url: input.damageImageUrl ?? null,
          listing_notes: input.listingNotes ?? null,
          listing_status: 'active',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,card_id,flag_type',
        }
      );

      if (error) throw error;

      setTradeKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
      setTradeCardIds((prev) =>
        prev.includes(input.cardId) ? prev : [...prev, input.cardId]
      );

      setTradeMeta((prev) => ({
        ...prev,
        [key]: {
          condition: input.condition,
          askingPrice: input.askingPrice ?? null,
          marketEstimate: input.marketEstimate ?? null,
          tradeOnly: input.tradeOnly,
          hasDamage: input.hasDamage,
          damageNotes: input.damageNotes ?? null,
          damageImageUrl: input.damageImageUrl ?? null,
          listingNotes: input.listingNotes ?? null,
        },
      }));

      await refreshTrade();
    },
    [refreshTrade]
  );

  const toggleTradeCard = useCallback(
    async (cardId: string, setId?: string | null) => {
      await toggleFlag(cardId, 'trade', setId);
      await refreshTrade();
    },
    [toggleFlag, refreshTrade]
  );

  const toggleWishlistCard = useCallback(
    async (cardId: string, setId?: string | null) => {
      await toggleFlag(cardId, 'wishlist', setId);
      await refreshTrade();
    },
    [toggleFlag, refreshTrade]
  );

  const updateTradeMeta = useCallback(
    async (
      cardId: string,
      data: Partial<TradeMeta>,
      setId?: string | null
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('You must be signed in.');

      const resolvedSetId = setId ?? getSetIdFromCardId(cardId);
      const key = makeFlagKey(cardId, resolvedSetId);

      setTradeMeta((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          ...data,
        },
      }));

      let query = supabase
        .from('user_card_flags')
        .update({
          condition: data.condition ?? null,
          notes: data.notes ?? null,
          value: data.value ?? null,

          asking_price:
            data.askingPrice !== undefined
              ? data.askingPrice
              : data.value
              ? Number(data.value)
              : null,

          market_estimate:
            data.marketEstimate !== undefined ? data.marketEstimate : null,

          trade_only: data.tradeOnly !== undefined ? data.tradeOnly : false,

          has_damage: data.hasDamage !== undefined ? data.hasDamage : false,

          damage_notes: data.damageNotes ?? null,

          damage_image_url: data.damageImageUrl ?? null,

          listing_notes: data.listingNotes ?? data.notes ?? null,

          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('card_id', cardId)
        .eq('flag_type', 'trade');

      if (resolvedSetId) {
        query = query.eq('set_id', resolvedSetId);
      }

      const { error } = await query;

      if (error) {
        await loadFlags();
        throw error;
      }
    },
    [loadFlags]
  );

  const value = useMemo(
    () => ({
      tradeCardIds,
      wishlistCardIds,
      tradeKeys,
      wishlistKeys,
      tradeMeta,

      marketplaceListings,
      myListings,
      tradeLoading,
      tradeError,

      toggleTradeCard,
      createTradeListing,
      toggleWishlistCard,
      updateTradeMeta,
      markTradeSent,
      markTradeReceived,

      isForTrade: (cardId: string, setId?: string | null) => {
        const resolvedSetId = setId ?? getSetIdFromCardId(cardId);
        const key = makeFlagKey(cardId, resolvedSetId);

        return tradeKeys.includes(key) || tradeCardIds.includes(cardId);
      },

      isWanted: (cardId: string, setId?: string | null) => {
        const resolvedSetId = setId ?? getSetIdFromCardId(cardId);
        const key = makeFlagKey(cardId, resolvedSetId);

        return wishlistKeys.includes(key) || wishlistCardIds.includes(cardId);
      },

      getMeta: (cardId: string, setId?: string | null) => {
        const resolvedSetId = setId ?? getSetIdFromCardId(cardId);
        const key = makeFlagKey(cardId, resolvedSetId);
        return tradeMeta[key] || {};
      },

      refreshTrade,
      archiveListing,

      createTradeReview,
      getTraderRating,
      getTraderReviews,
    }),
    [
      tradeCardIds,
      wishlistCardIds,
      tradeKeys,
      wishlistKeys,
      tradeMeta,
      marketplaceListings,
      myListings,
      tradeLoading,
      tradeError,
      toggleTradeCard,
      createTradeListing,
      toggleWishlistCard,
      updateTradeMeta,
      refreshTrade,
      archiveListing,
      createTradeReview,
      getTraderRating,
      getTraderReviews,
      markTradeSent,
      markTradeReceived,
    ]
  );

  return <TradeContext.Provider value={value}>{children}</TradeContext.Provider>;
}

export function useTrade() {
  const ctx = useContext(TradeContext);
  if (!ctx) throw new Error('useTrade must be used inside TradeProvider');
  return ctx;
}