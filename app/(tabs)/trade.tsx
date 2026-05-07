import { theme } from '../../lib/theme';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { useFocusEffect, router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTrade } from '../../components/trade-context';
import {
  getCachedCardSync,
  getCachedCardsForSet,
} from '../../lib/pokemonTcgCache';
import {
  fetchMyTradeOffers,
  markTradeSent,
  markTradeReceived,
  TradeOffer,
} from '../../lib/tradeOffers';
import { fetchEbayPrice } from '../../lib/ebay';
import { supabase } from '../../lib/supabase';

const PRICE_API_URL = process.env.EXPO_PUBLIC_PRICE_API_URL ?? '';

// ===============================
// TYPES
// ===============================

type MainTab = 'trading' | 'marketplace';
type SegmentKey = 'marketplaceListings' | 'myListings' | 'wanted' | 'myOffers';

type TopMover = {
  card: any;
  change: number;
  percentChange: number;
  latestPrice: number;
};

type WatchlistPriceState = {
  latestPrice: number | null;
  change: number | null;
  percentChange: number | null;
  hasHistory: boolean;
};

// ===============================
// HELPERS
// ===============================

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const getConditionColor = (condition: string): string => {
  switch (condition) {
    case 'Mint': return '#22C55E';
    case 'Near Mint': return '#4ADE80';
    case 'Lightly Played': return '#FACC15';
    case 'Moderately Played': return '#FB923C';
    case 'Heavily Played': return '#f78787';
    case 'Damaged': return '#EF4444';
    default: return theme.colors.textSoft;
  }
};

const STATUS_LABEL: Record<string, string> = {
  pending: '⏳ Pending',
  accepted: '✅ Accepted',
  declined: '❌ Declined',
  cancelled: '🚫 Cancelled',
  sent: '📦 Cards Sent',
  received: '📬 Cards Received',
  completed: '🎉 Completed',
  disputed: '⚠️ Disputed',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#F59E0B',
  accepted: '#10B981',
  declined: '#EF4444',
  cancelled: '#6B7280',
  sent: '#3B82F6',
  received: '#8B5CF6',
  completed: '#10B981',
  disputed: '#EF4444',
};

// ===============================
// MAIN COMPONENT
// ===============================

export default function TradeScreen() {
  const insets = useSafeAreaInsets();
  const [mainTab, setMainTab] = useState<MainTab>('trading');
  const [segment, setSegment] = useState<SegmentKey>('marketplaceListings');
  const [wantedCards, setWantedCards] = useState<any[]>([]);
  const [myOffers, setMyOffers] = useState<TradeOffer[]>([]);
  const [cardDetailsMap, setCardDetailsMap] = useState<Record<string, any>>({});
const [myUserId, setMyUserId] = useState<string>('');

  const [selectedListing, setSelectedListing] = useState<any | null>(null);
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // eBay prices for detail modal
  const [ebayData, setEbayData] = useState<{ low: number | null; average: number | null; high: number | null; count: number } | null>(null);
  const [ebayLoading, setEbayLoading] = useState(false);

  // Top Movers
  const [topMovers, setTopMovers] = useState<TopMover[]>([]);
  const [topMoversLoading, setTopMoversLoading] = useState(true);

  // Watchlist Trends
  const [watchlistCards, setWatchlistCards] = useState<any[]>([]);
  const [watchlistPriceMap, setWatchlistPriceMap] = useState<Record<string, WatchlistPriceState>>({});
  const [watchlistLoading, setWatchlistLoading] = useState(true);

  const translateY = useRef(new Animated.Value(0)).current;

  const {
    marketplaceListings,
    myListings,
    tradeLoading,
    tradeError,
    refreshTrade,
    archiveListing,
    toggleWishlistCard,
  } = useTrade();

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
      setSelectedListing(null);
      setSelectedCard(null);
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

const openTradeCardDetail = async (item: any) => {
    let cardDetails = cardDetailsMap[item.id];
    translateY.setValue(0);
    setSelectedListing(item);
    setSelectedCard(cardDetails ?? null);
    setDetailVisible(true);
    
// If cardDetails not loaded yet, fetch it directly
    if (!cardDetails?.name && item.card_id) {
      try {
        const { data } = await supabase
          .from('pokemon_cards')
          .select('id, name, number, set_id, image_small, image_large, raw_data')
          .eq('id', item.card_id)
          .maybeSingle();
        
        if (data) {
          cardDetails = {
            id: data.id,
            name: data.name,
            number: data.number,
            set: {
              id: data.set_id,
              name: data.raw_data?.set?.name ?? data.set_id,
            },
            images: {
              small: data.image_small,
              large: data.image_large,
            },
          };
          // Update the map for future reference
          setCardDetailsMap(prev => ({ ...prev, [item.id]: cardDetails }));
        }
      } catch (err) {
        console.log('Failed to fetch card details:', err);
      }
    }
    
    // Fetch live eBay price
    const cardName = cardDetails?.name;
    if (cardName) {
      setEbayLoading(true);
      setEbayData(null);
      try {
        // Build search term with set name and card number
        const setName = cardDetails?.set?.name ?? '';
        const cardNumber = cardDetails?.number ?? '';
        const searchTerm = `${cardName} ${setName} ${cardNumber}`.trim();
        
        console.log('Fetching eBay price for:', searchTerm);
        
        // Check if PRICE_API_URL is configured
        if (!PRICE_API_URL) {
          console.log('PRICE_API_URL not configured - skipping eBay fetch');
          setEbayData(null);
          setEbayLoading(false);
          return;
        }
        
        const response = await fetch(`${PRICE_API_URL}/price?q=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
          console.log('eBay API response not ok:', response.status);
          setEbayData(null);
          setEbayLoading(false);
          return;
        }
        
        const result = await response.json();
        console.log('eBay result:', result);
        setEbayData({
          low: result.low ?? null,
          average: result.average ?? null,
          high: result.high ?? null,
          count: result.count ?? 0,
        });
      } catch (err) {
        console.log('Failed to fetch eBay price:', err);
        setEbayData(null);
      } finally {
        setEbayLoading(false);
      }
    } else {
      console.log('No card name available for eBay fetch, card_id:', item.card_id);
    }
  };

  // ===============================
  // LOAD
  // ===============================

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setMyUserId(user?.id ?? '');
    });
  }, []);

  const loadWantedCards = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setWantedCards([]); return; }

      const { data, error } = await supabase
        .from('user_card_flags')
        .select('*')
        .eq('user_id', user.id)
        .eq('flag_type', 'wishlist')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWantedCards(data ?? []);
    } catch (error) {
      console.log('Failed to load wanted cards', error);
      setWantedCards([]);
    }
  }, []);

  const loadMyOffers = useCallback(async () => {
    try {
      const offers = await fetchMyTradeOffers();
      setMyOffers(offers);
    } catch (error) {
      console.log('Failed to load offers', error);
    }
  }, []);

  const loadTopMovers = useCallback(async () => {
    try {
      setTopMoversLoading(true);

      const { data: dateRows } = await supabase
        .from('market_price_snapshots')
        .select('snapshot_at')
        .order('snapshot_at', { ascending: false })
        .limit(2);

      if (!dateRows || dateRows.length < 2) return;

      const latestDate = dateRows[0].snapshot_at;
      const previousDate = dateRows[1].snapshot_at;

      const { data: latestSnaps } = await supabase
        .from('market_price_snapshots')
        .select('card_id, tcg_mid, ebay_average')
        .eq('snapshot_at', latestDate);

      const { data: previousSnaps } = await supabase
        .from('market_price_snapshots')
        .select('card_id, tcg_mid, ebay_average')
        .eq('snapshot_at', previousDate);

      if (!latestSnaps?.length || !previousSnaps?.length) return;

      const previousMap: Record<string, number> = {};
      for (const row of previousSnaps) {
        const price = row.ebay_average ?? row.tcg_mid;
        if (typeof price === 'number') previousMap[row.card_id] = price;
      }

      const movers: { cardId: string; change: number; percentChange: number; latestPrice: number }[] = [];

      for (const row of latestSnaps) {
        const latestPrice = row.ebay_average ?? row.tcg_mid;
        const previousPrice = previousMap[row.card_id];
        if (typeof latestPrice !== 'number' || typeof previousPrice !== 'number') continue;
        if (previousPrice === 0) continue;
        const change = latestPrice - previousPrice;
        const percentChange = (change / previousPrice) * 100;
        if (Math.abs(change) < 0.05) continue;
        movers.push({ cardId: row.card_id, change, percentChange, latestPrice });
      }

      movers.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange));
      const top = movers.slice(0, 10);
      if (!top.length) return;

      const cardIds = top.map((m) => m.cardId);
      const { data: cardData } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, image_small, set_id, raw_data')
        .in('id', cardIds);

      const cardMap = Object.fromEntries(
        (cardData ?? []).map((c: any) => [c.id, {
          id: c.id,
          name: c.name,
          number: c.number,
          images: { small: c.image_small },
          set: { name: c.raw_data?.set?.name ?? c.set_id },
        }])
      );

      setTopMovers(
        top
          .map((m) => ({ card: cardMap[m.cardId], change: m.change, percentChange: m.percentChange, latestPrice: m.latestPrice }))
          .filter((m) => m.card != null)
      );
    } catch (err) {
      console.log('Top movers error:', err);
    } finally {
      setTopMoversLoading(false);
    }
  }, []);

  const loadMarketWatchlist = useCallback(async () => {
    try {
      setWatchlistLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setWatchlistCards([]); return; }

      const { data: watchlistData } = await supabase
        .from('market_watchlist')
        .select('card_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!watchlistData?.length) { setWatchlistCards([]); return; }

      const cardIds = watchlistData.map((r: any) => r.card_id);

      const { data: cardData } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, image_small, set_id, raw_data')
        .in('id', cardIds);

      const cards = (cardData ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        number: c.number,
        images: { small: c.image_small },
        set: { name: c.raw_data?.set?.name ?? c.set_id },
      }));

      setWatchlistCards(cards);

      const { data: snapData } = await supabase
        .from('market_price_snapshots')
        .select('card_id, ebay_average, tcg_mid, snapshot_at')
        .in('card_id', cardIds)
        .order('snapshot_at', { ascending: false });

      const grouped: Record<string, any[]> = {};
      for (const row of snapData ?? []) {
        if (!grouped[row.card_id]) grouped[row.card_id] = [];
        if (grouped[row.card_id].length < 2) grouped[row.card_id].push(row);
      }

      const priceMap: Record<string, WatchlistPriceState> = {};
      for (const cardId of cardIds) {
        const snaps = grouped[cardId] ?? [];
        const latest = snaps[0];
        const previous = snaps[1];
        const latestPrice = latest?.ebay_average ?? latest?.tcg_mid ?? null;
        const previousPrice = previous?.ebay_average ?? previous?.tcg_mid ?? null;
        const change = latestPrice != null && previousPrice != null ? latestPrice - previousPrice : null;
        const percentChange = change != null && previousPrice ? (change / previousPrice) * 100 : null;
        priceMap[cardId] = { latestPrice, change, percentChange, hasHistory: snaps.length > 1 };
      }

      setWatchlistPriceMap(priceMap);
    } catch (err) {
      console.log('Market watchlist error:', err);
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshTrade();
      loadWantedCards();
      loadMyOffers();
      loadTopMovers();
      loadMarketWatchlist();
    }, [refreshTrade, loadWantedCards, loadMyOffers, loadTopMovers, loadMarketWatchlist])
  );

  // ===============================
  // CURRENT DATA
  // ===============================

  const currentData = useMemo(() => {
    if (segment === 'marketplaceListings') return marketplaceListings;
    if (segment === 'myListings') return myListings;
    if (segment === 'wanted') return wantedCards;
    return [];
  }, [segment, marketplaceListings, myListings, wantedCards]);

  // ===============================
  // LOAD CARD DETAILS
  // ===============================

  useEffect(() => {
    let mounted = true;

    const loadDetails = async () => {
      const nextMap: Record<string, any> = {};

      for (const item of currentData) {
        const setId = item.set_id;
        const cardId = item.card_id;
        if (!cardId) continue;

        let found = setId ? getCachedCardSync(setId, cardId) : null;

        if (!found && setId) {
          const cards = await getCachedCardsForSet(setId);
          found = cards.find((c) => c.id === cardId) ?? null;
        }

        if (found?.set?.name) {
          nextMap[item.id] = found;
          continue;
        }

        const { data } = await supabase
          .from('pokemon_cards')
          .select('id, name, set_id, image_small, image_large, raw_data')
          .eq('id', cardId)
          .maybeSingle();

        if (data) {
          nextMap[item.id] = {
            id: data.id,
            name: data.name,
            set: {
              id: data.set_id,
              name: data.raw_data?.set?.name ?? data.set_id,
            },
            images: {
              small: data.image_small,
              large: data.image_large,
            },
          };
        }
      }

      if (mounted) setCardDetailsMap(nextMap);
    };

    if (currentData.length) {
      loadDetails();
    } else {
      setCardDetailsMap({});
    }

    return () => { mounted = false; };
  }, [currentData]);

  // ===============================
  // ACTIONS
  // ===============================

const handleArchive = async (listingId: string) => {
    Alert.alert(
      'Remove Listing',
      'Are you sure you want to remove this card from the marketplace?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveListing(listingId);
              await refreshTrade();
              Alert.alert('Removed', 'Card has been removed from the marketplace.');
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Could not remove listing.');
            }
          },
        },
      ]
    );
  };

  const handleMakeOffer = (item: any) => {
    if (item.user_id === myUserId) {
      Alert.alert('Not allowed', "You can't offer on your own card.");
      return;
    }
    router.push({
      pathname: '/offer/new',
      params: {
        listingId: item.id,
        targetUserId: item.user_id,
        cardId: item.card_id,
        setId: item.set_id ?? '',
      },
    });
  };

  const handleMarkSent = async (offerId: string) => {
    try {
      setActionBusy(offerId);
      await markTradeSent(offerId);
      await loadMyOffers();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not mark as sent.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleMarkReceived = async (offerId: string) => {
    try {
      setActionBusy(offerId);
      await markTradeReceived(offerId);
      await loadMyOffers();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not mark as received.');
    } finally {
      setActionBusy(null);
    }
  };

  // ===============================
  // RENDER HELPERS
  // ===============================

  const renderMainTabButton = (key: MainTab, label: string) => {
    const active = mainTab === key;
    return (
      <TouchableOpacity
        onPress={() => setMainTab(key)}
        style={{
          flex: 1,
          paddingVertical: 12,
          borderRadius: 16,
          backgroundColor: active ? theme.colors.primary : theme.colors.card,
          borderWidth: 1,
          borderColor: active ? theme.colors.primary : theme.colors.border,
        }}
      >
        <Text style={{
          color: active ? '#FFFFFF' : theme.colors.textSoft,
          textAlign: 'center',
          fontWeight: '900',
          fontSize: 15,
        }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSegmentButton = (key: SegmentKey, label: string) => {
    const active = segment === key;
    return (
      <TouchableOpacity
        key={key}
        onPress={() => setSegment(key)}
        style={{
          flex: 1,
          paddingVertical: 10,
          paddingHorizontal: 6,
          marginHorizontal: 3,
          borderRadius: 12,
          backgroundColor: active ? theme.colors.secondary : theme.colors.card,
          borderWidth: 1,
          borderColor: active ? theme.colors.secondary : theme.colors.border,
        }}
      >
        <Text style={{
          color: active ? theme.colors.text : theme.colors.textSoft,
          textAlign: 'center',
          fontWeight: '800',
          fontSize: 11,
        }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  // ===============================
  // RENDER LISTING
  // ===============================

  const renderListing = ({ item }: { item: any }) => {
    const sellerName = item?.profiles?.collector_name ?? 'Collector';
    const cardDetails = cardDetailsMap[item.id];
    const imageUri = cardDetails?.images?.small ?? null;
    const cardName = cardDetails?.name ?? item.card_id ?? 'Unknown card';
    const setName = cardDetails?.set?.name ?? 'Unknown set';
    const isMyListing = item.user_id === myUserId;

    return (
      <View style={{
        backgroundColor: theme.colors.card,
        borderRadius: 18,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...cardShadow,
      }}>
        <TouchableOpacity onPress={() => openTradeCardDetail(item)} style={{ flexDirection: 'row' }} activeOpacity={0.8}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={{ width: 72, height: 100, borderRadius: 10, marginRight: 12, backgroundColor: theme.colors.surface }} resizeMode="cover" />
          ) : (
            <View style={{ width: 72, height: 100, borderRadius: 10, marginRight: 12, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>No image</Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 4 }} numberOfLines={2}>{cardName}</Text>
            <Text style={{ color: theme.colors.textSoft, marginBottom: 4 }} numberOfLines={1}>{setName}</Text>

            {item.condition && (
              <Text style={{ color: getConditionColor(item.condition), marginBottom: 4, fontWeight: '700', fontSize: 12 }}>{item.condition}</Text>
            )}
            {item.has_damage && (
              <Text style={{ color: '#EF4444', marginBottom: 4, fontWeight: '900', fontSize: 12 }}>⚠️ Damage disclosed</Text>
            )}

            {segment !== 'wanted' && (
              item.asking_price != null || item.custom_value != null ? (
                <Text style={{ color: '#22C55E', marginBottom: 4, fontWeight: '900' }}>£{Number(item.asking_price ?? item.custom_value).toFixed(2)}</Text>
              ) : item.trade_only ? (
                <Text style={{ color: theme.colors.primary, marginBottom: 4, fontWeight: '900' }}>Trade only</Text>
              ) : (
                <Text style={{ color: theme.colors.primary, marginBottom: 4, fontWeight: '800' }}>Open to offers</Text>
              )
            )}

            {segment === 'marketplaceListings' && (
              <TouchableOpacity onPress={() => router.push(`/user/${item.user_id}`)}>
                <Text style={{ color: theme.colors.primary, marginTop: 2, fontSize: 12 }}>
                  {sellerName}{isMyListing ? ' • Your listing' : ''}
                </Text>
              </TouchableOpacity>
            )}
            {segment === 'wanted' && (
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>On your wishlist</Text>
            )}
          </View>
        </TouchableOpacity>

        {!!item.listing_notes && (
          <Text style={{ color: theme.colors.textSoft, marginTop: 10, fontSize: 13 }}>{item.listing_notes}</Text>
        )}

        <View style={{ marginTop: 12, gap: 8 }}>
          {segment === 'marketplaceListings' && !isMyListing && (
            <TouchableOpacity onPress={() => handleMakeOffer(item)} style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 12 }}>
              <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '900' }}>Make Offer</Text>
            </TouchableOpacity>
          )}
          {segment === 'myListings' && (
            <TouchableOpacity onPress={() => handleArchive(item.id)} style={{ backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#FCA5A5' }}>
              <Text style={{ color: '#991B1B', textAlign: 'center', fontWeight: '900' }}>Remove from Trade</Text>
            </TouchableOpacity>
          )}
          {segment === 'wanted' && (
            <TouchableOpacity onPress={() => toggleWishlistCard(item.card_id, item.set_id)} style={{ backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#FCA5A5' }}>
              <Text style={{ color: '#991B1B', textAlign: 'center', fontWeight: '900' }}>Remove from Wishlist</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ===============================
  // RENDER OFFER
  // ===============================

  const renderOffer = ({ item: offer }: { item: TradeOffer }) => {
    const isReceiver = offer.receiver_id === myUserId;
    const isSender = offer.sender_id === myUserId;
    const statusLabel = STATUS_LABEL[offer.status] ?? offer.status;
    const statusColor = STATUS_COLOR[offer.status] ?? theme.colors.textSoft;
    const busy = actionBusy === offer.id;

    const iHaveSent = isSender ? offer.sender_sent : offer.receiver_sent;
    const iHaveReceived = isSender ? offer.sender_received : offer.receiver_received;
    const isAccepted = offer.status === 'accepted';
    const isSentStatus = offer.status === 'sent';
    const isCompleted = offer.status === 'completed';

    return (
      <TouchableOpacity
        onPress={() => router.push(`/offer?id=${offer.id}`)}
        style={{ backgroundColor: theme.colors.card, borderRadius: 18, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14 }}>
            {isReceiver ? '📬 Received' : '📤 Sent'}
          </Text>
          <View style={{ backgroundColor: statusColor + '20', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: statusColor + '40' }}>
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '800' }}>{statusLabel}</Text>
          </View>
        </View>

        {['accepted', 'sent', 'received'].includes(offer.status) && (
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <ProgressPill label="Agreed" done={true} />
            <ProgressPill label="Sent" done={offer.sender_sent && offer.receiver_sent} partial={offer.sender_sent || offer.receiver_sent} />
            <ProgressPill label="Received" done={offer.sender_received && offer.receiver_received} partial={offer.sender_received || offer.receiver_received} />
          </View>
        )}

        <View style={{ gap: 8 }}>
          {isAccepted && !iHaveSent && (
            <TouchableOpacity onPress={() => handleMarkSent(offer.id)} disabled={busy} style={[{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' }, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>📦 Mark My Cards as Sent</Text>}
            </TouchableOpacity>
          )}
          {(isAccepted || isSentStatus) && !iHaveReceived && iHaveSent && (
            <TouchableOpacity onPress={() => handleMarkReceived(offer.id)} disabled={busy} style={[{ backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>📬 Mark Cards as Received</Text>}
            </TouchableOpacity>
          )}
          {isCompleted && (
            <TouchableOpacity
              onPress={() => router.push(`/offer/review?offerId=${offer.id}&reviewUserId=${isSender ? offer.receiver_id : offer.sender_id}`)}
              style={{ backgroundColor: theme.colors.primary + '18', borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.primary }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }}>⭐ Leave a Review</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.push(`/offer?id=${offer.id}`)} style={{ backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 13 }}>Open Negotiation →</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ===============================
  // RENDER TRADING TAB
  // ===============================

  const renderTrading = () => {
    const pendingOfferCount = myOffers.filter((o) => o.status === 'pending' && o.receiver_id === myUserId).length;

    return (
      <>
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          {renderSegmentButton('marketplaceListings', 'Listings')}
          {renderSegmentButton('myListings', 'Mine')}
          {renderSegmentButton('myOffers', `Offers${pendingOfferCount > 0 ? ` (${pendingOfferCount})` : ''}`)}
          {renderSegmentButton('wanted', 'Wanted')}
        </View>

        {!!tradeError && (
          <View style={{ backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <Text style={{ color: '#991B1B' }}>{tradeError}</Text>
          </View>
        )}

        {segment === 'myOffers' ? (
          myOffers.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>No trade offers yet</Text>
              <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 8 }}>Browse listings and make an offer to get started.</Text>
            </View>
          ) : (
            <FlatList
              data={myOffers}
              keyExtractor={(item) => item.id}
              renderItem={renderOffer}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 200 }}
              refreshControl={<RefreshControl refreshing={false} onRefresh={loadMyOffers} tintColor={theme.colors.primary} />}
            />
          )
        ) : tradeLoading && currentData.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            data={currentData}
            keyExtractor={(item, index) => item.id ? String(item.id) : `${item.card_id}-${item.set_id}-${index}`}
            renderItem={renderListing}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 200, flexGrow: currentData.length === 0 ? 1 : 0 }}
            refreshControl={<RefreshControl refreshing={tradeLoading} onRefresh={refreshTrade} tintColor={theme.colors.primary} />}
            ListEmptyComponent={
              <View style={{ paddingVertical: 50 }}>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>
                  {segment === 'marketplaceListings' ? 'No active trade listings yet.' : segment === 'wanted' ? 'You have no wanted cards yet.' : 'You have no cards marked for trade yet.'}
                </Text>
              </View>
            }
          />
        )}
      </>
    );
  };

  // ===============================
  // RENDER MARKETPLACE TAB
  // ===============================

  const renderMarketplace = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

      {/* Watchlist Trends */}
      <View style={{ backgroundColor: theme.colors.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 14, ...cardShadow }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Watchlist Trends</Text>
          {watchlistLoading && <ActivityIndicator size="small" color={theme.colors.textSoft} />}
        </View>

        {watchlistLoading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : watchlistCards.length === 0 ? (
          <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
            No watched cards yet — search in the marketplace and tap Watch.
          </Text>
        ) : (
          watchlistCards.map((card, index) => {
            const priceData = watchlistPriceMap[card.id];
            const change = priceData?.change ?? null;
            const changeColor = change == null ? theme.colors.textSoft : change > 0 ? '#22C55E' : change < 0 ? '#EF4444' : theme.colors.textSoft;
            const arrow = change == null ? '' : change > 0 ? '▲ ' : '▼ ';

            return (
              <View
                key={card.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderBottomWidth: index < watchlistCards.length - 1 ? 1 : 0,
                  borderBottomColor: theme.colors.border,
                }}
              >
                <Image source={{ uri: card.images?.small }} style={{ width: 36, height: 50, borderRadius: 5, backgroundColor: theme.colors.surface, marginRight: 10 }} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }} numberOfLines={1}>{card.name}</Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{card.set?.name ?? ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
                    {priceData?.latestPrice != null ? `£${priceData.latestPrice.toFixed(2)}` : '--'}
                  </Text>
                  {priceData?.hasHistory ? (
                    <Text style={{ color: changeColor, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                      {arrow}{change != null ? `£${Math.abs(change).toFixed(2)}` : '--'}
                      {priceData.percentChange != null ? ` (${priceData.percentChange > 0 ? '+' : ''}${priceData.percentChange.toFixed(1)}%)` : ''}
                    </Text>
                  ) : (
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>No history</Text>
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Top Movers */}
      <View style={{ backgroundColor: theme.colors.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 14, ...cardShadow }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Top Movers</Text>
          {topMoversLoading && <ActivityIndicator size="small" color={theme.colors.textSoft} />}
        </View>

        {topMoversLoading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : topMovers.length === 0 ? (
          <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
            Not enough price history yet — check back tomorrow.
          </Text>
        ) : (
          topMovers.map((mover, index) => {
            const isUp = mover.change > 0;
            const changeColor = isUp ? '#22C55E' : '#EF4444';
            const arrow = isUp ? '▲ ' : '▼ ';

            return (
              <View
                key={mover.card.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderBottomWidth: index < topMovers.length - 1 ? 1 : 0,
                  borderBottomColor: theme.colors.border,
                }}
              >
                <Image source={{ uri: mover.card.images?.small }} style={{ width: 36, height: 50, borderRadius: 5, backgroundColor: theme.colors.surface, marginRight: 10 }} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }} numberOfLines={1}>{mover.card.name}</Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {mover.card.set?.name ?? ''}{mover.card.number ? ` · #${mover.card.number}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>£{mover.latestPrice.toFixed(2)}</Text>
                  <Text style={{ color: changeColor, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                    {arrow}£{Math.abs(mover.change).toFixed(2)} ({mover.percentChange > 0 ? '+' : ''}{mover.percentChange.toFixed(1)}%)
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 16, paddingTop: 42 }}>
      <Text style={{ color: theme.colors.text, fontSize: 30, fontWeight: '900', marginBottom: 6 }}>Market</Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 14, marginBottom: 16 }}>Trading, offers, prices, and card movement.</Text>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {renderMainTabButton('trading', '🤝 Trading')}
       <TouchableOpacity
  onPress={() => router.push('/market')}
  style={{
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  }}
>
  <Text style={{
    color: theme.colors.textSoft,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 15,
  }}>
    📈 Prices
  </Text>
</TouchableOpacity>
      </View>

      {mainTab === 'trading' ? renderTrading() : renderMarketplace()}

      {/* Card Detail Modal */}
      <Modal visible={detailVisible} transparent animationType="fade" onRequestClose={closeDetail}>
        <BlurView intensity={95} tint="dark" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' }}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeDetail} />
          <SafeAreaView style={{ flex: 1 }}>
            <Animated.View {...panResponder.panHandlers} style={{ flex: 1, transform: [{ translateY }] }}>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 75, paddingBottom: 44 }} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, position: 'relative' }}>
                  <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.55)' }} />
                  <TouchableOpacity onPress={closeDetail} style={{ position: 'absolute', right: 0, padding: 8 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 20, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                </View>

                {(selectedCard || selectedListing) && (
                  <>
                    {selectedCard?.images?.large || selectedCard?.images?.small ? (
                      <Image source={{ uri: selectedCard.images?.large ?? selectedCard.images?.small }} style={{ width: '100%', height: 330, borderRadius: 20, alignSelf: 'center', marginBottom: 18 }} resizeMode="contain" />
                    ) : (
                      <View style={{ width: '100%', height: 330, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card, marginBottom: 18 }}>
                        <Text style={{ color: theme.colors.textSoft, fontWeight: '800' }}>No image</Text>
                      </View>
                    )}

                    <View style={{ backgroundColor: theme.colors.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}>
                      <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>
                        {selectedCard?.name ?? selectedListing?.card_id ?? 'Unknown card'}
                      </Text>
                      <Text style={{ marginTop: 6, color: theme.colors.textSoft, fontSize: 15, marginBottom: 14 }}>
                        {selectedCard?.set?.name ?? 'Unknown set'}
                        {selectedCard?.number ? ` • #${selectedCard.number}` : ''}
                      </Text>

<View style={{ backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border }}>
                        <DetailRow label="Condition" value={selectedListing?.condition ?? '--'} valueColor={getConditionColor(selectedListing?.condition ?? '')} />
                        <DetailRow
                          label="Asking Price"
                          value={selectedListing?.asking_price != null ? `£${Number(selectedListing.asking_price).toFixed(2)}` : selectedListing?.trade_only ? 'Trade only' : 'Open to offers'}
                          valueColor={theme.colors.primary}
                        />
                        
                        {/* Live eBay Prices */}
                        <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 12 }} />
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '800' }}>eBay Live (GBP)</Text>
                          {ebayLoading && <ActivityIndicator size="small" color={theme.colors.primary} />}
                        </View>
                        {ebayLoading ? (
                          <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>Fetching live prices...</Text>
                        ) : ebayData && ebayData.average != null ? (
                          <>
                            <DetailRow label="Low" value={ebayData.low != null ? `£${ebayData.low.toFixed(2)}` : '--'} />
                            <DetailRow label="Average" value={ebayData.average != null ? `£${ebayData.average.toFixed(2)}` : '--'} valueColor={theme.colors.primary} />
                            <DetailRow label="High" value={ebayData.high != null ? `£${ebayData.high.toFixed(2)}` : '--'} />
                            {ebayData.count > 0 && (
                              <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 4 }}>Based on {ebayData.count} listing{ebayData.count !== 1 ? 's' : ''}</Text>
                            )}
                          </>
                        ) : (
                          <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>Live prices unavailable</Text>
                        )}
                        
{/* Market Prices (Historical) - only show if prices exist */}
                        {selectedListing?.prices && (selectedListing.prices.ebay_average != null || selectedListing.prices.tcg_mid != null || selectedListing.prices.cardmarket_trend != null) && (
                          <>
                            <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 12 }} />
                            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '800', marginBottom: 8 }}>Market Prices</Text>
                            {selectedListing.prices?.ebay_average != null && (
                              <DetailRow 
                                label="eBay Avg" 
                                value={`£${Number(selectedListing.prices.ebay_average).toFixed(2)}`} 
                              />
                            )}
                            {selectedListing.prices?.tcg_mid != null && (
                              <DetailRow 
                                label="TCGPlayer Mid" 
                                value={`£${Number(selectedListing.prices.tcg_mid).toFixed(2)}`} 
                              />
                            )}
{selectedListing.prices?.cardmarket_trend != null && (
                              <DetailRow 
                                label="Cardmarket" 
                                value={`£${Number(selectedListing.prices.cardmarket_trend).toFixed(2)}`} 
                              />
                            )}
                              />}
                          </>
                        )}
                        
                        <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 6 }}>
                          Live prices fetched directly from eBay. Historical prices from TCG data.
                        </Text>
                      </View>

                      {!!selectedListing?.listing_notes && (
                        <View style={{ marginTop: 14, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border }}>
                          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 }}>Notes</Text>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 14, lineHeight: 20 }}>{selectedListing.listing_notes}</Text>
                        </View>
                      )}

{selectedListing?.user_id !== myUserId ? (
                        <TouchableOpacity onPress={() => { closeDetail(); handleMakeOffer(selectedListing); }} style={{ marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 13 }}>
                          <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '900' }}>Make Offer</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <View style={{ marginTop: 16, backgroundColor: theme.colors.surface, borderRadius: 14, paddingVertical: 13, borderWidth: 1, borderColor: theme.colors.border }}>
                            <Text style={{ color: theme.colors.textSoft, textAlign: 'center', fontWeight: '900' }}>Your listing</Text>
                          </View>
                          <TouchableOpacity 
                            onPress={() => handleArchive(selectedListing.id)} 
                            style={{ marginTop: 10, backgroundColor: '#FEE2E2', borderRadius: 14, paddingVertical: 13, borderWidth: 1, borderColor: '#FCA5A5' }}
                          >
                            <Text style={{ color: '#991B1B', textAlign: 'center', fontWeight: '900' }}>Delete Listing</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </SafeAreaView>
        </BlurView>
      </Modal>

      {/* Price Builder FAB */}
      <TouchableOpacity
        onPress={() => router.push('/price-builder')}
        style={{
          position: 'absolute',
          right: 122,
          transform: [{ translateX: -30 }],
          bottom: insets.bottom + 75,
          width: 60,
          height: 60,
          borderRadius: 16,
          backgroundColor: theme.colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 10 },
          elevation: 5,
        }}
      >
        <Ionicons name="calculator-outline" size={38} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

// ===============================
// SUB COMPONENTS
// ===============================

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: valueColor ?? theme.colors.text, fontSize: 14, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}

function ProgressPill({ label, done, partial }: { label: string; done: boolean; partial?: boolean }) {
  const bg = done ? '#10B981' : partial ? '#F59E0B' : theme.colors.surface;
  const textColor = done || partial ? '#FFFFFF' : theme.colors.textSoft;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: done ? '#10B981' : partial ? '#F59E0B' : theme.colors.border }}>
      <Text style={{ color: textColor, fontSize: 11, fontWeight: '800' }}>
        {done ? '✓ ' : partial ? '◑ ' : ''}{label}
      </Text>
    </View>
  );
}