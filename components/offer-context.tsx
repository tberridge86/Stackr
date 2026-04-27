import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from '../lib/supabase';

export type OfferStatus =
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

export type OfferedCardRef = {
  cardId: string;
  setId: string | null;
};

export type TradeOffer = {
  id: string;
  listingId?: string | null;
  fromUserId: string;
  toUserId: string;
  senderId: string;
  receiverId: string;
  offeredCards: OfferedCardRef[];
  requestedCards: OfferedCardRef[];
  cashTopUp: string;
  note: string;
  message: string;
  status: OfferStatus;
  createdAt: string;
};

type CreateOfferInput = {
  listingId?: string | null;
  fromUserId: string;
  toUserId: string;
  targetCardId?: string;
  targetSetId?: string | null;
  offeredCards: OfferedCardRef[];
  requestedCards?: OfferedCardRef[];
  cashTopUp?: string;
  note?: string;
};

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
  const cards = Array.isArray(row.trade_offer_cards)
    ? row.trade_offer_cards
    : [];

  const offeredCards = cards
    .filter((card: any) => card.owner_id === row.sender_id)
    .map((card: any) => ({
      cardId: card.card_id,
      setId: card.set_id ?? null,
    }));

  const requestedCards = cards
    .filter((card: any) => card.owner_id === row.receiver_id)
    .map((card: any) => ({
      cardId: card.card_id,
      setId: card.set_id ?? null,
    }));

  const cash = Array.isArray(row.trade_cash_terms)
    ? row.trade_cash_terms[0]
    : row.trade_cash_terms;

  return {
    id: row.id,
    listingId: row.listing_id ?? null,

    fromUserId: row.sender_id,
    toUserId: row.receiver_id,

    senderId: row.sender_id,
    receiverId: row.receiver_id,

    offeredCards,
    requestedCards,

    cashTopUp: cash?.amount ? String(cash.amount) : '',
    note: row.message ?? '',
    message: row.message ?? '',
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
        const hasCash =
          input.cashTopUp != null &&
          input.cashTopUp.trim() !== '' &&
          Number(input.cashTopUp) > 0;

        const { data: offer, error: offerError } = await supabase
          .from('trade_offers')
          .insert({
            listing_id: input.listingId ?? null,
            sender_id: input.fromUserId,
            receiver_id: input.toUserId,
            status: hasCash ? 'payment_required' : 'sent',
            message: input.note ?? null,
          })
          .select()
          .single();

        if (offerError) throw offerError;

        const requestedCards =
          input.requestedCards && input.requestedCards.length > 0
            ? input.requestedCards
            : input.targetCardId
              ? [
                  {
                    cardId: input.targetCardId,
                    setId: input.targetSetId ?? null,
                  },
                ]
              : [];

        const cardRows = [
          ...input.offeredCards.map((card) => ({
            offer_id: offer.id,
            owner_id: input.fromUserId,
            card_id: card.cardId,
            set_id: card.setId ?? null,
            quantity: 1,
          })),
          ...requestedCards.map((card) => ({
            offer_id: offer.id,
            owner_id: input.toUserId,
            card_id: card.cardId,
            set_id: card.setId ?? null,
            quantity: 1,
          })),
        ];

        if (cardRows.length > 0) {
          const { error: cardsError } = await supabase
            .from('trade_offer_cards')
            .insert(cardRows);

          if (cardsError) throw cardsError;
        }

        if (hasCash) {
          const { error: cashError } = await supabase
            .from('trade_cash_terms')
            .insert({
              offer_id: offer.id,
              payer_id: input.fromUserId,
              recipient_id: input.toUserId,
              amount: Number(input.cashTopUp),
              currency: 'GBP',
              payment_status: 'required',
            });

          if (cashError) throw cashError;
        }

        await refreshOffers();
      },

      updateOfferStatus: async (offerId: string, status: OfferStatus) => {
        const { error } = await supabase
          .from('trade_offers')
          .update({
            status,
            updated_at: new Date().toISOString(),
          })
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