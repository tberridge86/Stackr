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

import { PRICE_API_URL } from '../lib/config';

// ===============================
// TYPES
// ===============================

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

// ===============================
// CONTEXT TYPE
// ===============================

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

  markTradeSent: (tradeId: string, userId: string) => Promise<void>;
  markTradeReceived: (tradeId: string, userId: string) => Promise<void>;

  isForTrade: (cardId: string, setId?: string | null) => boolean;
  isWanted: (cardId: string, setId?: string | null) => boolean;
  getMeta: (cardId: string, setId?: string | null) => TradeMeta;

  refreshTrade: () => Promise<void>;
  archiveListing: (listingId: string) => Promise<void>;

  createTradeReview: (input: CreateTradeReviewInput) => Promise<void>;
  getTraderRating: (userId: string) => Promise<TraderRatingSummary | null>;
  getTraderReviews: (userId: string) => Promise<TradeReview[]>;
};

// ===============================
// HELPERS
// ===============================

const getSetIdFromCardId = (cardId: string): string | null => {
  const parts = cardId.split('-');
  return parts.length > 1 ? parts[0] : null;
};

const makeFlagKey = (cardId: string, setId?: string | null): FlagKey => {
  return `${setId ?? 'unknown'}:${cardId}`;
};

// ===============================
// PUSH NOTIFICATION HELPER
// ===============================

async function sendPushNotification(
  endpoint: string,
  payload: Record<string, any>
): Promise<void> {
  if (!PRICE_API_URL) return;
  try {
    await fetch(`${PRICE_API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.log(`Push notification failed (${endpoint}):`, err);
  }
}

// ===============================
// CONTEXT
// ===============================

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

  // ===============================
  // LOAD FLAGS FROM DB
  // ===============================

  const loadFlags = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();

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

  // ===============================
  // REFRESH TRADE
  // ===============================

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

  // ===============================
  // ARCHIVE LISTING
  // ===============================

  const archiveListing = useCallback(
    async (listingId: string) => {
      await archiveMarketplaceListing(listingId);
      await refreshTrade();
    },
    [refreshTrade]
  );

  // ===============================
  // TRADE REVIEWS
  // ===============================

  const createTradeReview = useCallback(
    async (input: CreateTradeReviewInput) => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error('You must be signed in.');
      if (input.rating < 1 || input.rating > 5) throw new Error('Rating must be between 1 and 5.');
      if (user.id === input.reviewedUserId) throw new Error('You cannot review yourself.');

      const { error } = await supabase.from('trade_reviews').insert({
        trade_id: input.tradeId,
        reviewer_id: user.id,
        reviewed_user_id: input.reviewedUserId,
        rating: input.rating,
        comment: input.comment?.trim() || null,
      });

      if (error) throw error;

      // ── Notify Discord reviews channel ────────────────────────────
      if (PRICE_API_URL) {
        try {
          const { data: tradeOffer } = await supabase
            .from('trade_offers')
            .select('card_name')
            .eq('id', input.tradeId)
            .maybeSingle();

          await fetch(
            `${PRICE_API_URL.replace(/\/$/, '')}/api/discord/new-review`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reviewedUserId: input.reviewedUserId,
                reviewerUserId: user.id,
                rating: input.rating,
                comment: input.comment ?? null,
                cardName: tradeOffer?.card_name ?? null,
              }),
            }
          );
        } catch (discordErr) {
          console.log('Review Discord notification failed:', discordErr);
        }
      }
      // ── End Discord ───────────────────────────────────────────────
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

  // ===============================
  // MARK TRADE SENT / RECEIVED
  // ===============================

  const markTradeSent = useCallback(
    async (tradeId: string, userId: string) => {
      const { data: trade, error: loadError } = await supabase
        .from('trade_offers')
        .select('id, sender_id, receiver_id, card_name')
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

      // Notify the other party
      const recipientUserId =
        trade.sender_id === userId ? trade.receiver_id : trade.sender_id;

      sendPushNotification('/api/notify/trade-status', {
        recipientUserId,
        status: 'sent',
        cardName: trade.card_name ?? undefined,
      });
    },
    []
  );

  const markTradeReceived = useCallback(
    async (tradeId: string, userId: string) => {
      const { data: trade, error: loadError } = await supabase
        .from('trade_offers')
        .select('id, sender_id, receiver_id, card_name')
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

      // Notify the other party
      const recipientUserId =
        trade.sender_id === userId ? trade.receiver_id : trade.sender_id;

      sendPushNotification('/api/notify/trade-status', {
        recipientUserId,
        status: 'received',
        cardName: trade.card_name ?? undefined,
      });

      // Check if both sides complete
      const { data: updatedTrade, error: reloadError } = await supabase
        .from('trade_offers')
        .select('sender_sent, receiver_sent, sender_received, receiver_received')
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

        // Notify both parties the trade is complete
        sendPushNotification('/api/notify/trade-status', {
          recipientUserId: trade.sender_id,
          status: 'completed',
          cardName: trade.card_name ?? undefined,
        });
        sendPushNotification('/api/notify/trade-status', {
          recipientUserId: trade.receiver_id,
          status: 'completed',
          cardName: trade.card_name ?? undefined,
        });
      }
    },
    []
  );

  // ===============================
  // TOGGLE FLAG (trade / wishlist)
  // ===============================

  const toggleFlag = useCallback(
    async (cardId: string, flag: 'trade' | 'wishlist', setId?: string | null) => {
      const resolvedSetId = setId ?? getSetIdFromCardId(cardId);
      const key = makeFlagKey(cardId, resolvedSetId);
      const isTrade = flag === 'trade';

      const currentKeys = isTrade ? tradeKeys : wishlistKeys;
      const setKeys = isTrade ? setTradeKeys : setWishlistKeys;
      const setIds = isTrade ? setTradeCardIds : setWishlistCardIds;

      const exists = currentKeys.includes(key);

      // Optimistic update
      setKeys((prev) => exists ? prev.filter((k) => k !== key) : [...prev, key]);
      setIds((prev) => exists ? prev.filter((id) => id !== cardId) : [...prev, cardId]);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('You must be signed in.');

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
            }).catch((err) => {
              console.log('Failed to create trade activity post', err);
            });

            // Check for wishlist matches and notify via push
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

              // Get card name for notification
              const { data: cardData } = await supabase
                .from('pokemon_cards')
                .select('name')
                .eq('id', cardId)
                .maybeSingle();

              const cardName = cardData?.name ?? 'a card';

              // Insert in-app notifications
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

              // Send push notifications to each matched user
              for (const match of wantedMatches) {
                sendPushNotification('/api/notify/wishlist-match', {
                  recipientUserId: match.user_id,
                  listerUsername: sellerName,
                  cardName,
                });
              }
            }
          }
        }

        await loadFlags();
      } catch (error) {
        console.log('Rollback triggered', error);

        // Rollback optimistic update
        setKeys((prev) => exists ? [...prev, key] : prev.filter((k) => k !== key));
        setIds((prev) => exists ? [...prev, cardId] : prev.filter((id) => id !== cardId));

        throw error;
      }
    },
    [tradeKeys, wishlistKeys, loadFlags]
  );

  // ===============================
  // CREATE TRADE LISTING
  // ===============================

  const createTradeListing = useCallback(
    async (input: TradeListingInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in.');

      const resolvedSetId = input.setId ?? getSetIdFromCardId(input.cardId);

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

 // ── Notify Discord ─────────────────────────────────────────────
      console.log('🔥 createTradeListing — notifying Discord');
      if (PRICE_API_URL) {
        try {
          // Get the listing ID we just upserted
          const { data: flag } = await supabase
            .from('user_card_flags')
            .select('id')
            .eq('user_id', user.id)
            .eq('card_id', input.cardId)
            .eq('flag_type', 'trade')
            .maybeSingle();

          if (flag?.id) {
            console.log('📡 Posting listing to Discord:', flag.id);
            const discordRes = await fetch(
              `${PRICE_API_URL.replace(/\/$/, '')}/api/discord/new-trade-listing`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listingId: flag.id }),
              }
            );
            console.log('✅ Discord status:', discordRes.status);
          } else {
            console.log('⚠️ Could not find listing ID for Discord notification');
          }
        } catch (discordErr) {
          console.log('❌ Discord notification failed:', discordErr);
        }
      } else {
        console.log('❌ PRICE_API_URL missing — Discord notification skipped');
      }
      // ── End Discord ────────────────────────────────────────────────

      // Check for wishlist matches and send push notifications
      let wantedQuery = supabase
        .from('user_card_flags')
        .select('user_id')
        .eq('card_id', input.cardId)
        .eq('flag_type', 'wishlist')
        .neq('user_id', user.id);

      if (resolvedSetId) {
        wantedQuery = wantedQuery.eq('set_id', resolvedSetId);
      }

      const { data: wantedMatches } = await wantedQuery;

      if (wantedMatches?.length) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('collector_name')
          .eq('id', user.id)
          .maybeSingle();

        const { data: cardData } = await supabase
          .from('pokemon_cards')
          .select('name')
          .eq('id', input.cardId)
          .maybeSingle();

        const sellerName = profile?.collector_name ?? 'Another collector';
        const cardName = cardData?.name ?? 'a card';

        for (const match of wantedMatches) {
          sendPushNotification('/api/notify/wishlist-match', {
            recipientUserId: match.user_id,
            listerUsername: sellerName,
            cardName,
          });
        }
      }

      await refreshTrade();
    },
    [refreshTrade]
  );

  // ===============================
  // TOGGLE HELPERS
  // ===============================

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

  // ===============================
  // UPDATE TRADE META
  // ===============================

  const updateTradeMeta = useCallback(
    async (cardId: string, data: Partial<TradeMeta>, setId?: string | null) => {
      const { data: { user } } = await supabase.auth.getUser();
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

      const updateFields: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (data.condition !== undefined) updateFields.condition = data.condition;
      if (data.notes !== undefined) updateFields.notes = data.notes;
      if (data.value !== undefined) {
        updateFields.value = data.value;
        updateFields.asking_price = data.value ? Number(data.value) : null;
      }
      if (data.askingPrice !== undefined) updateFields.asking_price = data.askingPrice;
      if (data.marketEstimate !== undefined) updateFields.market_estimate = data.marketEstimate;
      if (data.tradeOnly !== undefined) updateFields.trade_only = data.tradeOnly;
      if (data.hasDamage !== undefined) updateFields.has_damage = data.hasDamage;
      if (data.damageNotes !== undefined) updateFields.damage_notes = data.damageNotes;
      if (data.damageImageUrl !== undefined) updateFields.damage_image_url = data.damageImageUrl;
      if (data.listingNotes !== undefined) updateFields.listing_notes = data.listingNotes;

      const { error } = await supabase
        .from('user_card_flags')
        .upsert(
          {
            user_id: user.id,
            card_id: cardId,
            set_id: resolvedSetId,
            flag_type: 'trade',
            ...updateFields,
          },
          {
            onConflict: 'user_id,card_id,flag_type',
          }
        );

      if (error) {
        await loadFlags();
        throw error;
      }
    },
    [loadFlags]
  );

  // ===============================
  // CONTEXT VALUE
  // ===============================

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

      isForTrade: (cardId: string, setId?: string | null): boolean => {
        const resolvedSetId = setId ?? getSetIdFromCardId(cardId);
        const key = makeFlagKey(cardId, resolvedSetId);
        return tradeKeys.includes(key);
      },

      isWanted: (cardId: string, setId?: string | null): boolean => {
        const resolvedSetId = setId ?? getSetIdFromCardId(cardId);
        const key = makeFlagKey(cardId, resolvedSetId);
        return wishlistKeys.includes(key);
      },

      getMeta: (cardId: string, setId?: string | null): TradeMeta => {
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
      markTradeSent,
      markTradeReceived,
      refreshTrade,
      archiveListing,
      createTradeReview,
      getTraderRating,
      getTraderReviews,
    ]
  );

  return (
    <TradeContext.Provider value={value}>
      {children}
    </TradeContext.Provider>
  );
}

// ===============================
// HOOK
// ===============================

export function useTrade() {
  const ctx = useContext(TradeContext);
  if (!ctx) throw new Error('useTrade must be used inside TradeProvider');
  return ctx;
}