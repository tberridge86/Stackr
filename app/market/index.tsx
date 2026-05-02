import { theme } from '../../lib/theme';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';

// ===============================
// TYPES
// ===============================

type PokemonCard = {
  id: string;
  name: string;
  number?: string;
  rarity?: string;
  images?: { small?: string; large?: string };
  set?: { id?: string; name?: string; series?: string };
  tcgplayer?: {
    prices?: Record<string, { low?: number; mid?: number; high?: number; market?: number }>;
  };
  cardmarket?: {
    prices?: {
      averageSellPrice?: number;
      trendPrice?: number;
      avg30?: number;
    };
  };
};

type WatchlistRow = {
  id?: string;
  user_id?: string;
  card_id: string;
  set_id?: string | null;
  created_at?: string;
};

type WatchlistPriceState = {
  latestPrice: number | null;
  previousPrice: number | null;
  change: number | null;
  percentChange: number | null;
  hasHistory: boolean;
};

type EbayDetailData = {
  low?: number | null;
  average?: number | null;
  high?: number | null;
  count?: number | null;
} | null;

// ===============================
// CONSTANTS
// ===============================

const PRICE_API_URL = process.env.EXPO_PUBLIC_PRICE_API_URL ?? '';

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

// ===============================
// HELPERS
// ===============================

const formatCurrency = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '--';
  return `£${value.toFixed(2)}`;
};

const formatDelta = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}£${value.toFixed(2)}`;
};

const formatPercent = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '';
  const sign = value > 0 ? '+' : '';
  return `(${sign}${value.toFixed(1)}%)`;
};

const getBestTcgPrice = (
  card: PokemonCard,
  field: 'mid' | 'low' | 'market'
): number | null => {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  const preferred = ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal'];

  for (const key of preferred) {
    const val = prices[key]?.[field];
    if (typeof val === 'number') return val;
  }

  for (const entry of Object.values(prices)) {
    const val = entry?.[field];
    if (typeof val === 'number') return val;
  }

  return null;
};

// ===============================
// MAIN COMPONENT
// ===============================

export default function MarketScreen() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PokemonCard[]>([]);

  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailEbayData, setDetailEbayData] = useState<EbayDetailData>(null);
  const [detailPriceLoading, setDetailPriceLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [watchlistCards, setWatchlistCards] = useState<PokemonCard[]>([]);
  const [watchlistPriceMap, setWatchlistPriceMap] = useState<Record<string, WatchlistPriceState>>({});
  const [watchlistLoading, setWatchlistLoading] = useState(true);

  const translateY = useRef(new Animated.Value(0)).current;
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const watchedCardIds = useMemo(
    () => new Set(watchlist.map((item) => item.card_id)),
    [watchlist]
  );

  const isWatching = useCallback(
    (cardId: string) => watchedCardIds.has(cardId),
    [watchedCardIds]
  );

  // ===============================
  // MODAL
  // ===============================

  const closeDetail = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 700,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      translateY.setValue(0);
      setDetailVisible(false);
      setSelectedCard(null);
      setDetailEbayData(null);
    });
  }, [translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 130 || gesture.vy > 1.2) {
            closeDetail();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 80,
              friction: 10,
            }).start();
          }
        },
      }),
    [closeDetail, translateY]
  );

  // ===============================
  // LOAD WATCHLIST PRICES
  // ===============================

  const loadWatchlistPrices = useCallback(async (cardIds: string[]) => {
    if (!cardIds.length) {
      setWatchlistPriceMap({});
      return;
    }

    const { data, error } = await supabase
      .from('market_price_snapshots')
      .select('card_id, ebay_average, tcg_mid, snapshot_at')
      .in('card_id', cardIds)
      .order('snapshot_at', { ascending: false });

    if (error) {
      console.log('Watchlist price snapshot error:', error);
      return;
    }

    // Keep only latest 2 per card
    const grouped: Record<string, any[]> = {};
    for (const row of data ?? []) {
      if (!grouped[row.card_id]) grouped[row.card_id] = [];
      if (grouped[row.card_id].length < 2) {
        grouped[row.card_id].push(row);
      }
    }

    const nextMap: Record<string, WatchlistPriceState> = {};

    for (const cardId of cardIds) {
      const snapshots = grouped[cardId] ?? [];
      const latest = snapshots[0];
      const previous = snapshots[1];

      const latestPrice = latest?.ebay_average ?? latest?.tcg_mid ?? null;
      const previousPrice = previous?.ebay_average ?? previous?.tcg_mid ?? null;

      const change =
        latestPrice != null && previousPrice != null
          ? latestPrice - previousPrice
          : null;

      const percentChange =
        change != null && previousPrice != null && previousPrice !== 0
          ? (change / previousPrice) * 100
          : null;

      nextMap[cardId] = {
        latestPrice,
        previousPrice,
        change,
        percentChange,
        hasHistory: snapshots.length > 1,
      };
    }

    setWatchlistPriceMap(nextMap);
  }, []);

  // ===============================
  // LOAD WATCHLIST
  // Fixed: load watchlist + cards in one go using Supabase
  // ===============================

  const loadWatchlist = useCallback(async () => {
    try {
      setWatchlistLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      if (!user) {
        setWatchlist([]);
        setWatchlistCards([]);
        setWatchlistPriceMap({});
        return;
      }

      const { data: watchlistData, error } = await supabase
        .from('market_watchlist')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (watchlistData ?? []) as WatchlistRow[];
      setWatchlist(rows);

      if (!rows.length) {
        setWatchlistCards([]);
        setWatchlistPriceMap({});
        return;
      }

      const cardIds = rows.map((r) => r.card_id);

      // Load card data from Supabase (not external API)
      const { data: cardData } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
        .in('id', cardIds);

      const cards: PokemonCard[] = (cardData ?? []).map((card: any) => ({
        id: card.id,
        name: card.name,
        number: card.number ?? '',
        rarity: card.rarity ?? undefined,
        images: {
          small: card.image_small ?? undefined,
          large: card.image_large ?? undefined,
        },
        set: {
          id: card.set_id,
          name: card.raw_data?.set?.name ?? card.set_id,
          series: card.raw_data?.set?.series ?? '',
        },
        tcgplayer: card.raw_data?.tcgplayer,
        cardmarket: card.raw_data?.cardmarket,
      }));

      // Preserve watchlist order
      const cardMap = Object.fromEntries(cards.map((c) => [c.id, c]));
      const ordered = cardIds.map((id) => cardMap[id]).filter(Boolean) as PokemonCard[];

      setWatchlistCards(ordered);

      // Load price snapshots
      await loadWatchlistPrices(cardIds);
    } catch (err) {
      console.log('Failed to load watchlist:', err);
    } finally {
      setWatchlistLoading(false);
    }
  }, [loadWatchlistPrices]);

  // ===============================
  // FOCUS EFFECT
  // ===============================

  useFocusEffect(
    useCallback(() => {
      loadWatchlist();
    }, [loadWatchlist])
  );

  // ===============================
  // SEARCH
  // Fixed: uses Supabase, not external API
  // ===============================

  const searchCards = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();

    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);

      const { data, error } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
        .ilike('name', `%${trimmed}%`)
        .limit(60);

      if (error) throw error;

      const cards: PokemonCard[] = (data ?? []).map((card: any) => ({
        id: card.id,
        name: card.name,
        number: card.number ?? '',
        rarity: card.rarity ?? undefined,
        images: {
          small: card.image_small ?? undefined,
          large: card.image_large ?? undefined,
        },
        set: {
          id: card.set_id,
          name: card.raw_data?.set?.name ?? card.set_id,
          series: card.raw_data?.set?.series ?? '',
        },
        tcgplayer: card.raw_data?.tcgplayer,
        cardmarket: card.raw_data?.cardmarket,
      }));

      setSearchResults(cards);
    } catch (err) {
      console.log('Search error:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search on text change
  const handleSearchChange = useCallback((text: string) => {
    setQuery(text);

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      searchCards(text);
    }, 400);
  }, [searchCards]);

  // ===============================
  // EBAY PRICE FETCH
  // ===============================

  const fetchDetailEbayData = useCallback(async (card: PokemonCard) => {
    try {
      if (!PRICE_API_URL) return;

      setDetailPriceLoading(true);
      setDetailEbayData(null);

      const params = new URLSearchParams({
        cardId: card.id,
        name: card.name ?? '',
        setName: card.set?.name ?? '',
        number: card.number ?? '',
      });

      const response = await fetch(`${PRICE_API_URL}/api/price/ebay?${params.toString()}`);

      if (!response.ok) {
        setDetailEbayData(null);
        return;
      }

      const json = await response.json();

      setDetailEbayData({
        low: json?.low ?? null,
        average: json?.average ?? null,
        high: json?.high ?? null,
        count: json?.count ?? null,
      });
    } catch (err) {
      console.log('eBay price fetch error:', err);
      setDetailEbayData(null);
    } finally {
      setDetailPriceLoading(false);
    }
  }, []);

  // ===============================
  // CARD DETAIL
  // ===============================

  const openCardDetail = useCallback(async (card: PokemonCard) => {
    translateY.setValue(0);
    setSelectedCard(card);
    setDetailVisible(true);
    await fetchDetailEbayData(card);
  }, [fetchDetailEbayData, translateY]);

  // ===============================
  // WATCHLIST TOGGLE
  // ===============================

  const toggleWatchlist = useCallback(async (card: PokemonCard) => {
    if (!userId) return;

    if (isWatching(card.id)) {
      await supabase
        .from('market_watchlist')
        .delete()
        .eq('user_id', userId)
        .eq('card_id', card.id);
    } else {
      await supabase.from('market_watchlist').insert({
        user_id: userId,
        card_id: card.id,
        set_id: card.set?.id ?? null,
      });
    }

    await loadWatchlist();
  }, [userId, isWatching, loadWatchlist]);

  // ===============================
  // RENDER HELPERS
  // ===============================

  const renderPriceChange = useCallback((cardId: string) => {
    const priceData = watchlistPriceMap[cardId];

    if (!priceData) {
      return <Text style={{ color: theme.colors.textSoft, fontSize: 14, marginTop: 6 }}>--</Text>;
    }

    const { latestPrice, change, percentChange, hasHistory } = priceData;
    const changeColor = change == null ? theme.colors.textSoft : change > 0 ? '#22C55E' : change < 0 ? '#EF4444' : theme.colors.textSoft;

    return (
      <View style={{ marginTop: 10, marginBottom: 10, gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>
          {formatCurrency(latestPrice)}
        </Text>
        {hasHistory ? (
          <Text style={{ fontSize: 13, fontWeight: '700', color: changeColor }}>
            {formatDelta(change)} {formatPercent(percentChange)}
          </Text>
        ) : (
          <Text style={{ fontSize: 13, color: theme.colors.textSoft }}>No history yet</Text>
        )}
      </View>
    );
  }, [watchlistPriceMap]);

  // ===============================
  // RENDER SEARCH RESULT CARD
  // ===============================

  const renderCard = useCallback(({ item }: { item: PokemonCard }) => {
    const watching = isWatching(item.id);
    const tcgMid = getBestTcgPrice(item, 'mid');

    return (
      <Pressable
        onPress={() => openCardDetail(item)}
        style={{
          flexDirection: 'row',
          marginHorizontal: 16,
          marginBottom: 12,
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          ...cardShadow,
        }}
      >
        <Image
          source={{ uri: item.images?.small ?? item.images?.large }}
          style={{ width: 86, height: 120, borderRadius: 12, backgroundColor: theme.colors.surface }}
          resizeMode="contain"
        />

        <View style={{ flex: 1, marginLeft: 12, justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }} numberOfLines={2}>
            {item.name}
          </Text>

          <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 4 }} numberOfLines={1}>
            {item.set?.name ?? 'Unknown set'}
            {item.number ? ` • #${item.number}` : ''}
          </Text>

          {item.rarity && (
            <Text style={{ color: '#FFD166', fontSize: 12, marginTop: 3, fontWeight: '700' }}>
              {item.rarity}
            </Text>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700' }}>TCG</Text>
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
              ${tcgMid != null ? tcgMid.toFixed(2) : '--'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => toggleWatchlist(item)}
            style={{
              marginTop: 10,
              alignSelf: 'flex-start',
              backgroundColor: watching ? theme.colors.secondary : theme.colors.surface,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: watching ? theme.colors.secondary : theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 13 }}>
              {watching ? '✓ Watching' : '+ Watch'}
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    );
  }, [isWatching, openCardDetail, toggleWatchlist]);

  // ===============================
  // RENDER WATCHLIST CARD
  // ===============================

  const renderWatchlistCard = useCallback(({ item }: { item: PokemonCard }) => {
    const watching = isWatching(item.id);

    return (
      <Pressable
        onPress={() => openCardDetail(item)}
        style={{
          width: 280,
          flexDirection: 'row',
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 12,
          marginRight: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'flex-start',
          ...cardShadow,
        }}
      >
        <Image
          source={{ uri: item.images?.small ?? item.images?.large }}
          style={{ width: 82, height: 114, borderRadius: 10, backgroundColor: theme.colors.surface }}
          resizeMode="contain"
        />

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '800' }} numberOfLines={2}>
            {item.name}
          </Text>

          <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
            {item.set?.name ?? 'Unknown set'}
            {item.number ? ` • #${item.number}` : ''}
          </Text>

          {renderPriceChange(item.id)}

          <TouchableOpacity
            onPress={() => toggleWatchlist(item)}
            style={{
              alignSelf: 'flex-start',
              backgroundColor: watching ? theme.colors.secondary : theme.colors.surface,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderWidth: 1,
              borderColor: watching ? theme.colors.secondary : theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>
              {watching ? '✓ Watching' : '+ Watch'}
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    );
  }, [isWatching, openCardDetail, renderPriceChange, toggleWatchlist]);

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadWatchlist();
              setRefreshing(false);
            }}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: 10 }}>
            {/* Header */}
            <Text style={{ fontSize: 30, fontWeight: '900', color: theme.colors.text }}>
              Market
            </Text>
            <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20, color: theme.colors.textSoft, marginBottom: 16 }}>
              Search cards, watch prices, and track daily movement.
            </Text>

            {/* Search bar */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <TextInput
                value={query}
                onChangeText={handleSearchChange}
                placeholder="Search card name..."
                placeholderTextColor={theme.colors.textSoft}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.card,
                  color: theme.colors.text,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 16,
                }}
                returnKeyType="search"
                onSubmitEditing={() => searchCards(query)}
              />

              <TouchableOpacity
                onPress={() => searchCards(query)}
                style={{
                  backgroundColor: theme.colors.primary,
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Search</Text>
              </TouchableOpacity>
            </View>

            {/* Watchlist */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>
                Watchlist
              </Text>
              {watchlistLoading && (
                <ActivityIndicator color={theme.colors.textSoft} size="small" />
              )}
            </View>

            {!userId ? (
              <View style={{
                backgroundColor: theme.colors.card,
                borderRadius: 16,
                padding: 18,
                alignItems: 'center',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>
                  Sign in to use your market watchlist.
                </Text>
              </View>
            ) : watchlistLoading ? (
              <View style={{
                backgroundColor: theme.colors.card,
                borderRadius: 16,
                padding: 18,
                alignItems: 'center',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : watchlistCards.length === 0 ? (
              <View style={{
                backgroundColor: theme.colors.card,
                borderRadius: 16,
                padding: 18,
                alignItems: 'center',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>
                  No watched cards yet. Search for a card and tap Watch.
                </Text>
              </View>
            ) : (
              <FlatList
                data={watchlistCards}
                keyExtractor={(item) => `watch-${item.id}`}
                renderItem={renderWatchlistCard}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 0, paddingBottom: 4, marginBottom: 16 }}
              />
            )}

            {/* Search results header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>
                {searchResults.length > 0 ? `Results (${searchResults.length})` : 'Search Results'}
              </Text>
              {searching && <ActivityIndicator color={theme.colors.textSoft} size="small" />}
            </View>
          </View>
        }
        ListEmptyComponent={
          !searching ? (
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: 16,
              padding: 18,
              marginHorizontal: 16,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}>
              <Text style={{ color: theme.colors.textSoft, textAlign: 'center', lineHeight: 20 }}>
                Search for a Pokémon card to view pricing and add it to your watchlist.
              </Text>
            </View>
          ) : null
        }
      />

      {/* ===============================
          CARD DETAIL MODAL
      =============================== */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDetail}
      >
        <BlurView intensity={95} tint="dark" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={closeDetail} />

          <SafeAreaView style={{ flex: 1 }}>
            <Animated.View
              style={{ flex: 1, transform: [{ translateY }] }}
              {...panResponder.panHandlers}
            >
              <ScrollView
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 44 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Drag handle */}
<View style={{
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 20,
  position: 'relative',
}}>
  <View style={{
    width: 42, height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.55)',
  }} />
  <TouchableOpacity
    onPress={closeDetail}
    style={{
      position: 'absolute',
      right: 0,
      padding: 8,
    }}
  >
    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 20, fontWeight: '700' }}>✕</Text>
  </TouchableOpacity>
</View>

                {selectedCard && (
                  <>
                    {/* Card image */}
                    <Image
                      source={{ uri: selectedCard.images?.large ?? selectedCard.images?.small }}
                      style={{ width: '100%', height: 330, borderRadius: 20, alignSelf: 'center', marginBottom: 18 }}
                      resizeMode="contain"
                    />

                    {/* Card info panel */}
                    <View style={{
                      backgroundColor: theme.colors.card,
                      borderRadius: 22,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      ...cardShadow,
                    }}>
                      <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>
                        {selectedCard.name}
                      </Text>

                      <Text style={{ marginTop: 6, color: theme.colors.textSoft, fontSize: 15, marginBottom: 4 }}>
                        {selectedCard.set?.name ?? 'Unknown set'}
                        {selectedCard.number ? ` • #${selectedCard.number}` : ''}
                      </Text>

                      {selectedCard.rarity && (
                        <Text style={{ color: '#FFD166', fontSize: 13, fontWeight: '700', marginBottom: 8 }}>
                          {selectedCard.rarity}
                        </Text>
                      )}

                      {/* Watch button */}
                      <TouchableOpacity
                        onPress={() => toggleWatchlist(selectedCard)}
                        style={{
                          marginTop: 8,
                          alignSelf: 'flex-start',
                          backgroundColor: isWatching(selectedCard.id) ? theme.colors.secondary : theme.colors.surface,
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderWidth: 1,
                          borderColor: isWatching(selectedCard.id) ? theme.colors.secondary : theme.colors.border,
                        }}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>
                          {isWatching(selectedCard.id) ? '✓ Watching' : '+ Watch'}
                        </Text>
                      </TouchableOpacity>

                      {/* TCGPlayer prices (USD) */}
                      <View style={{
                        marginTop: 16,
                        backgroundColor: theme.colors.surface,
                        borderRadius: 16,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}>
                        <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '800', marginBottom: 10 }}>
                          TCGPlayer (USD)
                        </Text>

                        <PriceRow label="Low" value={`$${getBestTcgPrice(selectedCard, 'low')?.toFixed(2) ?? '--'}`} />
                        <PriceRow label="Mid" value={`$${getBestTcgPrice(selectedCard, 'mid')?.toFixed(2) ?? '--'}`} />
                        <PriceRow label="Market" value={`$${getBestTcgPrice(selectedCard, 'market')?.toFixed(2) ?? '--'}`} />
                      </View>

                      {/* Cardmarket prices */}
                      {selectedCard.cardmarket?.prices && (
                        <View style={{
                          marginTop: 12,
                          backgroundColor: theme.colors.surface,
                          borderRadius: 16,
                          padding: 14,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}>
                          <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '800', marginBottom: 10 }}>
                            Cardmarket (EUR)
                          </Text>
                          <PriceRow
                            label="Trend"
                            value={selectedCard.cardmarket.prices.trendPrice != null
                              ? `€${selectedCard.cardmarket.prices.trendPrice.toFixed(2)}`
                              : '--'}
                          />
                          <PriceRow
                            label="30d Avg"
                            value={selectedCard.cardmarket.prices.avg30 != null
                              ? `€${selectedCard.cardmarket.prices.avg30.toFixed(2)}`
                              : '--'}
                          />
                        </View>
                      )}

                      {/* eBay live prices (GBP) */}
                      <View style={{
                        marginTop: 12,
                        backgroundColor: theme.colors.surface,
                        borderRadius: 16,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '800' }}>
                            eBay Live (GBP)
                          </Text>
                          {detailPriceLoading && (
                            <ActivityIndicator size="small" color={theme.colors.primary} />
                          )}
                        </View>

                        {detailPriceLoading ? (
                          <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                            Fetching live prices...
                          </Text>
                        ) : (
                          <>
                            <PriceRow label="Low" value={formatCurrency(detailEbayData?.low)} />
                            <PriceRow label="Average" value={formatCurrency(detailEbayData?.average)} highlight />
                            <PriceRow label="High" value={formatCurrency(detailEbayData?.high)} />
                            {detailEbayData?.count != null && (
                              <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 6 }}>
                                Based on {detailEbayData.count} listing{detailEbayData.count !== 1 ? 's' : ''}
                              </Text>
                            )}
                          </>
                        )}
                      </View>
                    </View>
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </SafeAreaView>
        </BlurView>
      </Modal>
    </SafeAreaView>
  );
}

// ===============================
// SUB COMPONENTS
// ===============================

function PriceRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 14 }}>{label}</Text>
      <Text style={{
        color: highlight ? theme.colors.primary : theme.colors.text,
        fontSize: highlight ? 15 : 14,
        fontWeight: highlight ? '900' : '700',
      }}>
        {value}
      </Text>
    </View>
  );
}