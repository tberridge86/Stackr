import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export type OfferStatus = 'pending' | 'accepted' | 'declined';

export type OfferedCardRef = {
  cardId: string;
  setId: string;
};

export type TradeOffer = {
  id: string;
  listingId?: string;
  fromUserId: string;
  toUserId: string;
  targetCardId: string;
  targetSetId: string;
  offeredCards: OfferedCardRef[];
  cashTopUp: string;
  note: string;
  status: OfferStatus;
  createdAt: string;
};

type CreateOfferInput = Omit<TradeOffer, 'id' | 'status' | 'createdAt'>;

type OfferContextType = {
  offers: TradeOffer[];
  offersLoading: boolean;
  createOffer: (input: CreateOfferInput) => Promise<void>;
  updateOfferStatus: (offerId: string, status: OfferStatus) => Promise<void>;
  removeOffer: (offerId: string) => Promise<void>;
  refreshOffers: () => Promise<void>;
};

const OfferContext = createContext<OfferContextType | null>(null);

function mapOfferRow(row: any): TradeOffer {
  return {
    id: row.id,
    listingId: row.listing_id ?? undefined,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    targetCardId: row.target_card_id,
    targetSetId: row.target_set_id,
    offeredCards: Array.isArray(row.offered_cards) ? row.offered_cards : [],
    cashTopUp: row.cash_top_up ?? '',
    note: row.note ?? '',
    status: row.status,
    createdAt: row.created_at,
  };
}

export function OfferProvider({ children }: { children: React.ReactNode }) {
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);

  const refreshOffers = async () => {
    try {
      setOffersLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        setOffers([]);
        return;
      }

      const { data, error } = await supabase
        .from('trade_offers')
        .select('*')
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setOffers((data ?? []).map(mapOfferRow));
    } catch (error) {
      console.log('Failed to load offers', error);
    } finally {
      setOffersLoading(false);
    }
  };

  useEffect(() => {
    refreshOffers();

    const channel = supabase
      .channel('trade-offers-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trade_offers' },
        () => {
          refreshOffers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const value = useMemo(
    () => ({
      offers,
      offersLoading,

      createOffer: async (input: CreateOfferInput) => {
        const { error } = await supabase.from('trade_offers').insert({
          listing_id: input.listingId ?? null,
          from_user_id: input.fromUserId,
          to_user_id: input.toUserId,
          target_card_id: input.targetCardId,
          target_set_id: input.targetSetId,
          offered_cards: input.offeredCards,
          cash_top_up: input.cashTopUp,
          note: input.note,
          status: 'pending',
        });

        if (error) throw error;

        await refreshOffers();
      },

      updateOfferStatus: async (offerId: string, status: OfferStatus) => {
        const { error } = await supabase
          .from('trade_offers')
          .update({ status })
          .eq('id', offerId);

        if (error) throw error;

        await refreshOffers();
      },

      removeOffer: async (offerId: string) => {
        const { error } = await supabase
          .from('trade_offers')
          .delete()
          .eq('id', offerId);

        if (error) throw error;

        await refreshOffers();
      },

      refreshOffers,
    }),
    [offers, offersLoading]
  );

  return <OfferContext.Provider value={value}>{children}</OfferContext.Provider>;
}

export function useOffers() {
  const ctx = useContext(OfferContext);
  if (!ctx) {
    throw new Error('useOffers must be used inside OfferProvider');
  }
  return ctx;
}