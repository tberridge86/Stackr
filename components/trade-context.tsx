import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type TradeCardMeta = {
  condition?: string;
  notes?: string;
  value?: string;
};

type TradeContextType = {
  tradeCardIds: string[];
  wishlistCardIds: string[];
  tradeMeta: Record<string, TradeCardMeta>;

  toggleTradeCard: (cardId: string) => void;
  toggleWishlistCard: (cardId: string) => void;

  updateTradeMeta: (cardId: string, data: Partial<TradeCardMeta>) => void;

  getMeta: (cardId: string) => TradeCardMeta;

  isForTrade: (cardId: string) => boolean;
  isWanted: (cardId: string) => boolean;
};

const TradeContext = createContext<TradeContextType | null>(null);

const TRADE_STORAGE_KEY = 'tradeCardIds';
const WISHLIST_STORAGE_KEY = 'wishlistCardIds';
const META_STORAGE_KEY = 'tradeMeta';

export function TradeProvider({ children }: { children: React.ReactNode }) {
  const [tradeCardIds, setTradeCardIds] = useState<string[]>([]);
  const [wishlistCardIds, setWishlistCardIds] = useState<string[]>([]);
  const [tradeMeta, setTradeMeta] = useState<Record<string, TradeCardMeta>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [t, w, m] = await Promise.all([
          AsyncStorage.getItem(TRADE_STORAGE_KEY),
          AsyncStorage.getItem(WISHLIST_STORAGE_KEY),
          AsyncStorage.getItem(META_STORAGE_KEY),
        ]);

        if (t) setTradeCardIds(JSON.parse(t));
        if (w) setWishlistCardIds(JSON.parse(w));
        if (m) setTradeMeta(JSON.parse(m));
      } catch (e) {
        console.log('load trade failed', e);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;

    AsyncStorage.setItem(TRADE_STORAGE_KEY, JSON.stringify(tradeCardIds));
    AsyncStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlistCardIds));
    AsyncStorage.setItem(META_STORAGE_KEY, JSON.stringify(tradeMeta));
  }, [tradeCardIds, wishlistCardIds, tradeMeta, loaded]);

  const value = useMemo(
    () => ({
      tradeCardIds,
      wishlistCardIds,
      tradeMeta,

      toggleTradeCard: (cardId: string) => {
        setTradeCardIds((prev) =>
          prev.includes(cardId)
            ? prev.filter((id) => id !== cardId)
            : [...prev, cardId]
        );
      },

      toggleWishlistCard: (cardId: string) => {
        setWishlistCardIds((prev) =>
          prev.includes(cardId)
            ? prev.filter((id) => id !== cardId)
            : [...prev, cardId]
        );
      },

      updateTradeMeta: (cardId: string, data: Partial<TradeCardMeta>) => {
        setTradeMeta((prev) => ({
          ...prev,
          [cardId]: {
            ...prev[cardId],
            ...data,
          },
        }));
      },

      getMeta: (cardId: string) => tradeMeta[cardId] || {},

      isForTrade: (cardId: string) => tradeCardIds.includes(cardId),
      isWanted: (cardId: string) => wishlistCardIds.includes(cardId),
    }),
    [tradeCardIds, wishlistCardIds, tradeMeta]
  );

  return <TradeContext.Provider value={value}>{children}</TradeContext.Provider>;
}

export function useTrade() {
  const ctx = useContext(TradeContext);
  if (!ctx) throw new Error('useTrade must be used inside TradeProvider');
  return ctx;
}