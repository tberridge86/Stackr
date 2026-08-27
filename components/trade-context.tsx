import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { InteractionManager } from 'react-native';
import type { MarketplaceListing } from '../lib/marketplace';
import { supabase } from '../lib/supabase';
import { createActivityPost } from '../lib/activity';

import { assertTradeFulfilmentEnabled } from '../lib/config';
import { assertPremiumSellerWriteAccess } from '../lib/premiumSellerAccess';
import type { User } from '@supabase/supabase-js';

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

type AuthScopedTradeRefresh = {
  userId: string | null;
  generation: number;
  request: Promise<void>;
};

type VerifiedAuthIdentity = {
  user: User | null;
  userId: string | null;
  generation: number;
};

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

const loadMarketplaceApi = () => import('../lib/marketplace');

function invalidateMarketplaceCachesSoon() {
  loadMarketplaceApi()
    .then(({ invalidateMarketplaceListingCaches }) => invalidateMarketplaceListingCaches())
    .catch((error) => {
      console.log('Marketplace cache invalidation failed', error);
    });
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
  const mountedRef = useRef(true);
  const trustedAuthUserIdRef = useRef<string | null>(null);
  const authBoundaryInitializedRef = useRef(false);
  const authGenerationRef = useRef(0);
  const refreshTradeInFlightRef = useRef<AuthScopedTradeRefresh | null>(null);
  const marketListingsHydratedRef = useRef(false);

  const clearAccountScopedTradeState = useCallback(() => {
    setTradeCardIds([]);
    setWishlistCardIds([]);
    setTradeKeys([]);
    setWishlistKeys([]);
    setTradeMeta({});
    setMarketplaceListings([]);
    setMyListings([]);
    setTradeError(null);
    setTradeLoading(false);
    marketListingsHydratedRef.current = false;
  }, []);

  const isCurrentAuthIdentity = useCallback((userId: string | null, generation: number) => {
    return (
      mountedRef.current
      && trustedAuthUserIdRef.current === userId
      && authGenerationRef.current === generation
    );
  }, []);

  const bindTrustedAuthUser = useCallback((userId: string | null) => {
    if (authBoundaryInitializedRef.current && trustedAuthUserIdRef.current === userId) {
      return authGenerationRef.current;
    }

    authBoundaryInitializedRef.current = true;
    trustedAuthUserIdRef.current = userId;
    authGenerationRef.current += 1;
    refreshTradeInFlightRef.current = null;
    clearAccountScopedTradeState();
    return authGenerationRef.current;
  }, [clearAccountScopedTradeState]);

  const invalidateTrustedAuthIdentity = useCallback(() => {
    authBoundaryInitializedRef.current = true;
    trustedAuthUserIdRef.current = null;
    authGenerationRef.current += 1;
    refreshTradeInFlightRef.current = null;
    clearAccountScopedTradeState();
  }, [clearAccountScopedTradeState]);

  const verifyCurrentAuthIdentity = useCallback(async (
    expectedGeneration: number,
    expectedUserId?: string | null,
  ): Promise<VerifiedAuthIdentity | null> => {
    if (!mountedRef.current || authGenerationRef.current !== expectedGeneration) return null;

    const boundaryWasInitialized = authBoundaryInitializedRef.current;
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!mountedRef.current || authGenerationRef.current !== expectedGeneration) return null;

    const verifiedUserId = user?.id ?? null;
    if (expectedUserId !== undefined && verifiedUserId !== expectedUserId) return null;

    if (boundaryWasInitialized) {
      if (trustedAuthUserIdRef.current !== verifiedUserId) return null;
      return { user, userId: verifiedUserId, generation: expectedGeneration };
    }

    const generation = bindTrustedAuthUser(verifiedUserId);
    return { user, userId: verifiedUserId, generation };
  }, [bindTrustedAuthUser]);

  const requireVerifiedSignedInIdentity = useCallback(async () => {
    const generation = authGenerationRef.current;
    const expectedUserId = authBoundaryInitializedRef.current
      ? trustedAuthUserIdRef.current
      : undefined;
    let identity: VerifiedAuthIdentity | null;
    try {
      identity = await verifyCurrentAuthIdentity(generation, expectedUserId);
    } catch (error) {
      if (
        authGenerationRef.current === generation
        && trustedAuthUserIdRef.current === (expectedUserId ?? null)
      ) invalidateTrustedAuthIdentity();
      throw error;
    }
    if (!identity) {
      if (
        authGenerationRef.current === generation
        && trustedAuthUserIdRef.current === (expectedUserId ?? null)
      ) invalidateTrustedAuthIdentity();
      throw new Error('Your signed-in account changed. Please try again.');
    }
    if (!identity.user) throw new Error('You must be signed in.');
    return { ...identity, user: identity.user, userId: identity.user.id };
  }, [invalidateTrustedAuthIdentity, verifyCurrentAuthIdentity]);

  // ===============================
  // LOAD FLAGS FROM DB
  // ===============================

  const loadFlags = useCallback(async (
    userId = trustedAuthUserIdRef.current,
    generation = authGenerationRef.current,
  ) => {
    if (!userId || !isCurrentAuthIdentity(userId, generation)) return;

    const { data, error } = await supabase
      .from('user_card_flags')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    if (!isCurrentAuthIdentity(userId, generation)) return;

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
  }, [isCurrentAuthIdentity]);

  // ===============================
  // REFRESH TRADE
  // ===============================

  const refreshTradeForIdentity = useCallback(async ({
    userId,
    generation,
  }: VerifiedAuthIdentity) => {
    const inFlight = refreshTradeInFlightRef.current;
    if (inFlight?.userId === userId && inFlight.generation === generation) {
      return inFlight.request;
    }

    const request = (async () => {
      try {
        if (!isCurrentAuthIdentity(userId, generation)) return;
        setTradeError(null);
        setTradeLoading(true);

        if (userId) await loadFlags(userId, generation);
        if (!isCurrentAuthIdentity(userId, generation)) return;

        const {
          fetchMarketplaceListings,
          fetchMyListings,
          invalidateMarketplaceListingCaches,
        } = await loadMarketplaceApi();
        if (!isCurrentAuthIdentity(userId, generation)) return;
        invalidateMarketplaceListingCaches();
        const [marketplace, mine] = await Promise.all([
          fetchMarketplaceListings(),
          userId ? fetchMyListings() : Promise.resolve([]),
        ]);

        if (!isCurrentAuthIdentity(userId, generation)) return;
        setMarketplaceListings(marketplace ?? []);
        setMyListings(mine ?? []);
        marketListingsHydratedRef.current = true;
      } catch (error) {
        console.log('refreshTrade failed', error);
        if (isCurrentAuthIdentity(userId, generation)) {
          setTradeError(
            error instanceof Error ? error.message : 'Failed to refresh trade data'
          );
        }
      } finally {
        if (isCurrentAuthIdentity(userId, generation)) setTradeLoading(false);
        if (
          refreshTradeInFlightRef.current?.userId === userId
          && refreshTradeInFlightRef.current.generation === generation
        ) {
          refreshTradeInFlightRef.current = null;
        }
      }
    })();

    refreshTradeInFlightRef.current = { userId, generation, request };
    return request;
  }, [isCurrentAuthIdentity, loadFlags]);

  const refreshTrade = useCallback(async () => {
    const generation = authGenerationRef.current;
    const expectedUserId = authBoundaryInitializedRef.current
      ? trustedAuthUserIdRef.current
      : undefined;
    let identity: VerifiedAuthIdentity | null;
    try {
      identity = await verifyCurrentAuthIdentity(generation, expectedUserId);
    } catch (error) {
      if (
        authGenerationRef.current === generation
        && trustedAuthUserIdRef.current === (expectedUserId ?? null)
      ) invalidateTrustedAuthIdentity();
      throw error;
    }
    if (!identity) {
      if (
        authGenerationRef.current === generation
        && trustedAuthUserIdRef.current === (expectedUserId ?? null)
      ) invalidateTrustedAuthIdentity();
      return;
    }
    return refreshTradeForIdentity(identity);
  }, [invalidateTrustedAuthIdentity, refreshTradeForIdentity, verifyCurrentAuthIdentity]);

  useEffect(() => {
    mountedRef.current = true;
    let interactionTask: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;

    const activateVerifiedIdentity = (identity: VerifiedAuthIdentity) => {
      const { userId, generation } = identity;
      if (!isCurrentAuthIdentity(userId, generation)) return;
      interactionTask?.cancel?.();

      if (userId) void loadFlags(userId, generation).catch((error) => {
        if (isCurrentAuthIdentity(userId, generation)) {
          console.log('Initial trade flags load failed', error);
        }
      });
      interactionTask = InteractionManager.runAfterInteractions(() => {
        if (!isCurrentAuthIdentity(userId, generation) || marketListingsHydratedRef.current) return;
        void refreshTradeForIdentity(identity);
      });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const expectedUserId = session?.user?.id ?? null;
      const generation = bindTrustedAuthUser(expectedUserId);
      interactionTask?.cancel?.();
      setTimeout(() => {
        void verifyCurrentAuthIdentity(generation, expectedUserId)
          .then((identity) => {
            if (identity) {
              activateVerifiedIdentity(identity);
            } else if (isCurrentAuthIdentity(expectedUserId, generation)) {
              invalidateTrustedAuthIdentity();
            }
          })
          .catch((error) => {
            if (isCurrentAuthIdentity(expectedUserId, generation)) {
              console.log('Trade auth verification failed', error);
              invalidateTrustedAuthIdentity();
            }
          });
      }, 0);
    });
    const initialGeneration = authGenerationRef.current;
    void verifyCurrentAuthIdentity(initialGeneration)
      .then((identity) => {
        if (identity) activateVerifiedIdentity(identity);
      })
      .catch((error) => {
        if (authGenerationRef.current === initialGeneration) {
          console.log('Initial trade user lookup failed', error);
          bindTrustedAuthUser(null);
        }
      });

    return () => {
      mountedRef.current = false;
      interactionTask?.cancel?.();
      subscription.unsubscribe();
      trustedAuthUserIdRef.current = null;
      authBoundaryInitializedRef.current = true;
      authGenerationRef.current += 1;
      refreshTradeInFlightRef.current = null;
    };
  }, [
    bindTrustedAuthUser,
    invalidateTrustedAuthIdentity,
    isCurrentAuthIdentity,
    loadFlags,
    refreshTradeForIdentity,
    verifyCurrentAuthIdentity,
  ]);

  // ===============================
  // ARCHIVE LISTING
  // ===============================

  const archiveListing = useCallback(
    async (listingId: string) => {
      const { archiveMarketplaceListing } = await loadMarketplaceApi();
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
      assertTradeFulfilmentEnabled();
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

    },
    []
  );

  const markTradeReceived = useCallback(
    async (tradeId: string, userId: string) => {
      assertTradeFulfilmentEnabled();
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

      }
    },
    []
  );

  // ===============================
  // TOGGLE FLAG (trade / wishlist)
  // ===============================

  const toggleFlag = useCallback(
    async (cardId: string, flag: 'trade' | 'wishlist', setId?: string | null) => {
      const { user, userId, generation } = await requireVerifiedSignedInIdentity();
      if (flag === 'trade') assertPremiumSellerWriteAccess(user);

      const resolvedSetId = setId ?? getSetIdFromCardId(cardId);
      const key = makeFlagKey(cardId, resolvedSetId);
      const isTrade = flag === 'trade';

      const setKeys = isTrade ? setTradeKeys : setWishlistKeys;
      const setIds = isTrade ? setTradeCardIds : setWishlistCardIds;

      const { data: existingFlag, error: existingFlagError } = await supabase
        .from('user_card_flags')
        .select('id, set_id')
        .eq('user_id', userId)
        .eq('card_id', cardId)
        .eq('flag_type', flag)
        .maybeSingle();
      if (existingFlagError) throw existingFlagError;
      if (!isCurrentAuthIdentity(userId, generation)) {
        throw new Error('Your signed-in account changed. Please try again.');
      }

      // The database row, scoped to the freshly verified user, is authoritative.
      // React closures can still contain account A's keys until the A -> B clear renders.
      const exists = Boolean(existingFlag);
      const stateKey = existingFlag
        ? makeFlagKey(cardId, existingFlag.set_id ?? getSetIdFromCardId(cardId))
        : key;

      // Optimistic update
      setKeys((prev) => exists
        ? prev.filter((existingKey) => existingKey !== stateKey)
        : [...prev.filter((existingKey) => existingKey !== stateKey), stateKey]);
      setIds((prev) => exists
        ? prev.filter((id) => id !== cardId)
        : [...prev.filter((id) => id !== cardId), cardId]);

      try {
        if (exists) {
          const { error } = await supabase
            .from('user_card_flags')
            .delete()
            .eq('id', existingFlag!.id)
            .eq('user_id', userId)
            .eq('flag_type', flag);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('user_card_flags').upsert(
            {
              user_id: userId,
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
        }

        if (!isCurrentAuthIdentity(userId, generation)) return;

        if (!exists && flag === 'trade') {
          try {
            await createActivityPost({
              type: 'trade_listed',
              title: 'Listed a card for trade',
              cardId,
              setId: resolvedSetId,
            }, {
              expectedUserId: userId,
            });
          } catch (err) {
            if (isCurrentAuthIdentity(userId, generation)) {
              console.log('Failed to create trade activity post', err);
              invalidateTrustedAuthIdentity();
            }
            return;
          }
          if (!isCurrentAuthIdentity(userId, generation)) return;

          // Check for wishlist matches and create in-app notifications.
          let wantedQuery = supabase
            .from('user_card_flags')
            .select('user_id')
            .eq('card_id', cardId)
            .eq('flag_type', 'wishlist')
            .neq('user_id', userId);

          if (resolvedSetId) {
            wantedQuery = wantedQuery.eq('set_id', resolvedSetId);
          }

          const { data: wantedMatches, error: wantedError } = await wantedQuery;
          if (!isCurrentAuthIdentity(userId, generation)) return;

          if (wantedError) {
            console.log('Failed to check wishlist matches', wantedError);
          }

          if (wantedMatches?.length) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('collector_name')
              .eq('id', userId)
              .maybeSingle();
            if (!isCurrentAuthIdentity(userId, generation)) return;

            const sellerName = profile?.collector_name ?? 'Another collector';
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
            if (!isCurrentAuthIdentity(userId, generation)) return;

            if (notifyError) {
              console.log('Failed to create wishlist notifications', notifyError);
            }
          }
        }

        if (flag === 'trade') {
          invalidateMarketplaceCachesSoon();
        }
        if (isCurrentAuthIdentity(userId, generation)) {
          await loadFlags(userId, generation);
        }
      } catch (error) {
        console.log('Rollback triggered', error);

        // Rollback optimistic update
        if (isCurrentAuthIdentity(userId, generation)) {
          setKeys((prev) => exists
            ? [...prev.filter((existingKey) => existingKey !== stateKey), stateKey]
            : prev.filter((existingKey) => existingKey !== stateKey));
          setIds((prev) => exists ? [...prev, cardId] : prev.filter((id) => id !== cardId));
        }

        throw error;
      }
    },
    [
      invalidateTrustedAuthIdentity,
      isCurrentAuthIdentity,
      loadFlags,
      requireVerifiedSignedInIdentity,
    ]
  );

  // ===============================
  // CREATE TRADE LISTING
  // ===============================

  const createTradeListing = useCallback(
    async (input: TradeListingInput) => {
      const { user, userId, generation } = await requireVerifiedSignedInIdentity();
      assertPremiumSellerWriteAccess(user);

      const resolvedSetId = input.setId ?? getSetIdFromCardId(input.cardId);

      const { error } = await supabase.from('user_card_flags').upsert(
        {
          user_id: userId,
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
      invalidateMarketplaceCachesSoon();

 // ── Notify Discord ─────────────────────────────────────────────
      // ── End Discord ────────────────────────────────────────────────

      // Check for wishlist matches and send push notifications
      if (isCurrentAuthIdentity(userId, generation)) await refreshTrade();
    },
    [isCurrentAuthIdentity, refreshTrade, requireVerifiedSignedInIdentity]
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
      const { user, userId, generation } = await requireVerifiedSignedInIdentity();
      assertPremiumSellerWriteAccess(user);

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
            user_id: userId,
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
        if (isCurrentAuthIdentity(userId, generation)) {
          await loadFlags(userId, generation);
        }
        throw error;
      }
      invalidateMarketplaceCachesSoon();
    },
    [isCurrentAuthIdentity, loadFlags, requireVerifiedSignedInIdentity]
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
