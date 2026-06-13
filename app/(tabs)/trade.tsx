import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions ,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  Modal,
  ScrollView,
  Animated,
  PanResponder,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { FeatureTipGate } from '../../components/FeatureTipModal';
import { StackrCardPlaceholder } from '../../components/StackrCardPlaceholder';
import PokeTraceMarketInsights from '../../components/PokeTraceMarketInsights';
import {
  EmptyStateCard,
  TrustBadge,
} from '../../components/PremiumUI';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTrade } from '../../components/trade-context';
import { useProfile } from '../../components/profile-context';
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
import { supabase } from '../../lib/supabase';
import { BETA_TRADE_DEMO_MODE, PRICE_API_URL } from '../../lib/config';
import { getProductPriceWithFallback } from '../../lib/productSearch';
import type { ProductLookupType } from '../../lib/productSearch';

// ===============================
// CONSTANTS
// ===============================

const PHOTO_SLOT_LABELS = ['Card Front', 'Card Back', 'Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right'];

// ===============================
// TYPES
// ===============================

type SegmentKey = 'tradeListings' | 'myListings' | 'wanted' | 'myOffers' | 'adminReview';
type TradeCardTypeFilter = 'any' | 'raw' | 'graded' | 'sealed';

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
    default: return '#7970A9';
  }
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  sent: 'Cards Sent',
  received: 'Cards Received',
  completed: 'Completed',
  disputed: 'Disputed',
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
  const { theme } = useTheme();
  const { profile: myProfile } = useProfile();
  const isAdmin = myProfile?.role === 'admin';
  const { width } = useWindowDimensions();
  const [segment, setSegment] = useState<SegmentKey>('tradeListings');
  const [wantedCards, setWantedCards] = useState<any[]>([]);
  const [myOffers, setMyOffers] = useState<TradeOffer[]>([]);
  const [cardDetailsMap, setCardDetailsMap] = useState<Record<string, any>>({});
const [myUserId, setMyUserId] = useState<string>('');

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc'>('newest');
  const [filterCardType, setFilterCardType] = useState<TradeCardTypeFilter>('any');
  const [filterSetQuery, setFilterSetQuery] = useState('');
  const [filterConditions, setFilterConditions] = useState<string[]>([]);
  const [filterMinPrice, setFilterMinPrice] = useState('');
  const [filterMaxPrice, setFilterMaxPrice] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterHasPhotos, setFilterHasPhotos] = useState(false);

  const activeFilterCount = filterConditions.length +
    (filterCardType !== 'any' ? 1 : 0) + (filterSetQuery.trim() ? 1 : 0) +
    (filterMinPrice ? 1 : 0) + (filterMaxPrice ? 1 : 0) +
    (filterLocation.trim() ? 1 : 0) + (filterHasPhotos ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0);

  const [selectedListing, setSelectedListing] = useState<any | null>(null);
  const [modalPhotoIndex, setModalPhotoIndex] = useState(0);
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // eBay prices for detail modal
  const [ebayData, setEbayData] = useState<{ low: number | null; average: number | null; high: number | null; count: number } | null>(null);
  const [ebayLoading, setEbayLoading] = useState(false);

  const translateY = useRef(new Animated.Value(0)).current;

  const {
    marketplaceListings: tradeListings,
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
    setModalPhotoIndex(0);
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
    const cardName = cardDetails?.name ?? item.product_name;
    if (cardName) {
      setEbayLoading(true);
      setEbayData(null);
      try {
        const setName = cardDetails?.set?.name ?? '';
        const cardNumber = cardDetails?.number ?? '';
        const rarity = cardDetails?.rarity ?? '';
        
        console.log('Fetching eBay sold price for:', { cardName, setName, cardNumber, rarity });
        
        if (!PRICE_API_URL) {
          console.log('PRICE_API_URL not configured - skipping eBay fetch');
          setEbayData(null);
          setEbayLoading(false);
          return;
        }
        
        const isProduct = item.product_type && item.product_type !== 'raw_card' && item.product_type !== 'graded_slab';
        if (isProduct) {
          const result = await getProductPriceWithFallback(cardName, item.product_type as ProductLookupType);
          setEbayData(result ? {
            low: result.low ?? null,
            average: result.average ?? null,
            high: result.high ?? null,
            count: result.count ?? 0,
          } : null);
          setEbayLoading(false);
          return;
        }

        if (item.pricing_mode === 'graded') {
          setEbayData(null);
          setEbayLoading(false);
          return;
        }

        const params = new URLSearchParams({
              name: cardName,
              setName,
              number: cardNumber,
              rarity,
              cardId: cardDetails?.id ?? item.card_id ?? '',
              productType: 'card',
              pricingMode: 'raw',
            });
        const printedTotal = cardDetails?.set?.printedTotal ?? cardDetails?.set?.total;
        if (printedTotal != null) params.set('setTotal', String(printedTotal));

        const response = await fetch(`${PRICE_API_URL}/api/price/ebay?${params.toString()}`);
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          console.log('eBay API error:', response.status, errBody);
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

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const run = async () => {
        if (!isActive) return;
        await Promise.all([
          Promise.resolve(refreshTrade()),
          loadWantedCards(),
          loadMyOffers(),
        ]);
      };

      run();

      return () => {
        isActive = false;
      };
    }, [refreshTrade, loadWantedCards, loadMyOffers])
  );

  // ===============================
  // CURRENT DATA
  // ===============================

  // Raw data used for loading card details - no filter dependencies
  const currentData = useMemo(() => {
    if (segment === 'tradeListings') return tradeListings;
    if (segment === 'adminReview') return tradeListings.filter((item) => item.admin_review_required);
    if (segment === 'myListings') return myListings;
    if (segment === 'wanted') return wantedCards;
    return [];
  }, [segment, tradeListings, myListings, wantedCards]);

  // Filtered/sorted data for display - depends on cardDetailsMap but not the other way round
  const displayData = useMemo(() => {
    if (segment !== 'tradeListings' && segment !== 'adminReview') return currentData;

    let data = [...currentData];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter((item) => {
        const details = cardDetailsMap[item.id];
        const name = (details?.name ?? item.card_id ?? '').toLowerCase();
        const set = (details?.set?.name ?? '').toLowerCase();
        return name.includes(q) || set.includes(q);
      });
    }
    if (filterConditions.length > 0) {
      data = data.filter((item) => filterConditions.includes(item.condition));
    }
    if (filterCardType === 'raw') {
      data = data.filter((item) => !item.grade_company && !item.grade);
    } else if (filterCardType === 'graded') {
      data = data.filter((item) => item.pricing_mode === 'graded' || !!item.grade_company || !!item.grade);
    } else if (filterCardType === 'sealed') {
      data = data.filter((item) => {
        const details = cardDetailsMap[item.id];
        if (item.product_type && item.product_type !== 'raw_card' && item.product_type !== 'graded_slab') return true;
        const haystack = `${details?.name ?? ''} ${details?.set?.name ?? ''} ${item.listing_notes ?? ''}`.toLowerCase();
        return haystack.includes('sealed') || haystack.includes('booster') || haystack.includes('etb') || haystack.includes('box');
      });
    }
    if (filterSetQuery.trim()) {
      const q = filterSetQuery.trim().toLowerCase();
      data = data.filter((item) => {
        const details = cardDetailsMap[item.id];
        return String(details?.set?.name ?? details?.set_id ?? item.set_id ?? '').toLowerCase().includes(q);
      });
    }
    const minP = parseFloat(filterMinPrice);
    const maxP = parseFloat(filterMaxPrice);
    if (!isNaN(minP)) data = data.filter((item) => (item.asking_price ?? 0) >= minP);
    if (!isNaN(maxP)) data = data.filter((item) => (item.asking_price ?? 0) <= maxP);
    if (filterHasPhotos) {
      data = data.filter((item) => Array.isArray(item.listing_images) && item.listing_images.length > 0);
    }
    if (filterLocation.trim()) {
      const q = filterLocation.trim().toLowerCase();
      data = data.filter((item) => {
        const profile = (item.profiles ?? item.profile ?? {}) as any;
        const haystack = `${profile.location ?? ''} ${profile.city ?? ''} ${profile.display_name ?? ''}`.toLowerCase();
        return haystack.includes(q);
      });
    }
    if (sortBy === 'price_asc') data.sort((a, b) => (a.asking_price ?? 0) - (b.asking_price ?? 0));
    else if (sortBy === 'price_desc') data.sort((a, b) => (b.asking_price ?? 0) - (a.asking_price ?? 0));

    return data;
  }, [currentData, segment, searchQuery, filterConditions, filterCardType, filterSetQuery, filterMinPrice, filterMaxPrice, filterLocation, filterHasPhotos, sortBy, cardDetailsMap]);

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
        if (item.product_type && item.product_type !== 'raw_card') continue;
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
      'Are you sure you want to remove this card from trade listings?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveListing(listingId);
              await refreshTrade();
              Alert.alert('Removed', 'Card has been removed from trade listings.');
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Could not remove listing.');
            }
          },
        },
      ]
    );
  };

  const handleApproveAdminReview = async (listingId: string) => {
    if (!isAdmin) return;

    try {
      setActionBusy(listingId);
      const { error } = await supabase
        .from('user_card_flags')
        .update({
          admin_review_required: false,
          admin_review_reason: null,
        })
        .eq('id', listingId)
        .eq('flag_type', 'trade');

      if (error) throw error;
      await refreshTrade();
      if (selectedListing?.id === listingId) {
        setSelectedListing((current: any) => current ? {
          ...current,
          admin_review_required: false,
          admin_review_reason: null,
        } : current);
      }
      Alert.alert('Approved', 'Listing has been cleared from admin review.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not approve listing.');
    } finally {
      setActionBusy(null);
    }
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
    const cardDetails = cardDetailsMap[item.id];
    const listingPhoto = Array.isArray(item.listing_images) && item.listing_images.length > 0
      ? item.listing_images[0]
      : null;
    const imageUri = listingPhoto ?? cardDetails?.images?.small ?? null;
    const isProductListing = item.product_type && item.product_type !== 'raw_card' && item.product_name;
    const cardName = isProductListing ? item.product_name : cardDetails?.name ?? item.product_name ?? item.card_id ?? 'Unknown card';
    const setName = isProductListing ? (item.product_type ?? 'Product').replace(/_/g, ' ') : cardDetails?.set?.name ?? 'Unknown set';
    const isMyListing = item.user_id === myUserId;

    if (isProductListing) {
      return (
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 16,
          padding: 10,
          marginBottom: 12,
          width: '94%',
          alignSelf: 'center',
          borderWidth: 1,
          borderColor: theme.colors.border,
          ...cardShadow,
        }}>
          <TouchableOpacity onPress={() => openTradeCardDetail(item)} activeOpacity={0.85}>
            <View style={{
              width: '100%',
              aspectRatio: 1,
              borderRadius: 14,
              overflow: 'hidden',
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Ionicons name="cube-outline" size={44} color={theme.colors.textSoft} />
              )}
            </View>

            <View style={{ paddingTop: 12 }}>
              <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900' }} numberOfLines={2}>{cardName}</Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', marginTop: 3, textTransform: 'capitalize' }} numberOfLines={1}>{setName}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                <TrustBadge label={listingPhoto ? 'Photo checked' : 'Photo pending'} icon="camera-outline" tone={listingPhoto ? 'green' : 'gold'} />
                <TrustBadge label={item.asking_price != null ? 'Value shown' : 'Open value'} icon="scale-outline" tone={item.asking_price != null ? 'green' : 'neutral'} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
                <View>
                  <Text style={{ color: '#22C55E', fontWeight: '900', fontSize: 18 }}>
                    {item.asking_price != null ? `£${Number(item.asking_price).toFixed(2)}` : '--'}
                  </Text>
                  {item.market_estimate != null && (
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                      Est. £{Number(item.market_estimate).toFixed(2)}
                    </Text>
                  )}
                </View>
                {item.admin_review_required && (
                  <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B' }}>
                    <Text style={{ color: '#92400E', fontSize: 11, fontWeight: '900' }}>Admin review</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>

          <View style={{ marginTop: 10, gap: 8 }}>
            {segment === 'myListings' && (
              <TouchableOpacity onPress={() => handleArchive(item.id)} style={{ backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#FCA5A5' }}>
                <Text style={{ color: '#991B1B', textAlign: 'center', fontWeight: '900' }}>Remove from Trade</Text>
              </TouchableOpacity>
            )}
            {segment === 'tradeListings' && !isMyListing && (
              <TouchableOpacity onPress={() => handleMakeOffer(item)} style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 10 }}>
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '900' }}>Make Offer</Text>
              </TouchableOpacity>
            )}
            {isAdmin && item.admin_review_required && (
              <TouchableOpacity
                onPress={() => handleApproveAdminReview(item.id)}
                disabled={actionBusy === item.id}
                style={{ borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#10B981', backgroundColor: '#ECFDF5' }}
              >
                <Text style={{ color: '#047857', textAlign: 'center', fontWeight: '900' }}>
                  {actionBusy === item.id ? 'Approving...' : 'Approve Listing'}
                </Text>
              </TouchableOpacity>
            )}
            {(segment === 'tradeListings' || segment === 'adminReview') && isAdmin && !isMyListing && (
              <TouchableOpacity
                onPress={() => Alert.alert('Delete listing', 'Remove this listing?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => handleArchive(item.id) },
                ])}
                style={{ borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#EF4444' }}
              >
                <Text style={{ color: '#EF4444', textAlign: 'center', fontWeight: '900' }}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    // Horizontal listing row, shared by public listings / Mine / Wanted
    return (
      <View style={{
        backgroundColor: theme.colors.card,
        borderRadius: 16, padding: 10, marginBottom: 10,
        width: '96%', alignSelf: 'center',
        borderWidth: 1, borderColor: theme.colors.border, ...cardShadow,
      }}>
        <TouchableOpacity onPress={() => openTradeCardDetail(item)} style={{ flexDirection: 'row' }} activeOpacity={0.8}>
          <View style={{ marginRight: 11 }}>
            <StackrCardPlaceholder
              uri={imageUri}
              width={64}
              height={88}
              borderRadius={9}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900', marginBottom: 3 }} numberOfLines={2}>{cardName}</Text>
            <Text style={{ color: theme.colors.textSoft, marginBottom: 3, fontSize: 12 }} numberOfLines={1}>{setName}</Text>
            {item.condition && (
              <Text style={{ color: getConditionColor(item.condition), marginBottom: 3, fontWeight: '700', fontSize: 11 }}>{item.condition}</Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 5 }}>
              <TrustBadge label={listingPhoto ? 'Photo checked' : 'Photo pending'} icon="camera-outline" tone={listingPhoto ? 'green' : 'gold'} />
              {item.condition ? <TrustBadge label={item.condition} icon="shield-outline" tone="purple" /> : null}
            </View>
            {item.asking_price != null && (
              <Text style={{ color: '#22C55E', fontWeight: '900', fontSize: 13 }}>£{Number(item.asking_price).toFixed(2)}</Text>
            )}
            {item.market_estimate != null && (
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>Est. £{Number(item.market_estimate).toFixed(2)}</Text>
            )}
            {item.admin_review_required && (
              <Text style={{ color: '#D97706', fontSize: 11, fontWeight: '900', marginTop: 4 }}>Admin review</Text>
            )}
            {segment === 'wanted' && (
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>On your wishlist</Text>
            )}
          </View>
        </TouchableOpacity>

        <View style={{ marginTop: 10, gap: 8 }}>
          {segment === 'myListings' && (
            <TouchableOpacity onPress={() => handleArchive(item.id)} style={{ backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#FCA5A5' }}>
              <Text style={{ color: '#991B1B', textAlign: 'center', fontWeight: '900' }}>Remove from Trade</Text>
            </TouchableOpacity>
          )}
          {segment === 'tradeListings' && !isMyListing && (
            <TouchableOpacity onPress={() => handleMakeOffer(item)} style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 10 }}>
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '900' }}>Make Offer</Text>
            </TouchableOpacity>
          )}
          {isAdmin && item.admin_review_required && (
            <TouchableOpacity
              onPress={() => handleApproveAdminReview(item.id)}
              disabled={actionBusy === item.id}
              style={{ borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#10B981', backgroundColor: '#ECFDF5' }}
            >
              <Text style={{ color: '#047857', textAlign: 'center', fontWeight: '900' }}>
                {actionBusy === item.id ? 'Approving...' : 'Approve Listing'}
              </Text>
            </TouchableOpacity>
          )}
          {(segment === 'tradeListings' || segment === 'adminReview') && isAdmin && !isMyListing && (
            <TouchableOpacity
              onPress={() => Alert.alert('Delete listing', 'Remove this listing?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => handleArchive(item.id) },
              ])}
              style={{ borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#EF4444' }}
            >
              <Text style={{ color: '#EF4444', textAlign: 'center', fontWeight: '900' }}>Remove</Text>
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
    const offerCards = offer.trade_offer_cards ?? [];
    const myCardCount = offerCards
      .filter((card) => card.owner_id === myUserId)
      .reduce((sum, card) => sum + Math.max(1, Number(card.quantity ?? 1)), 0);
    const theirCardCount = offerCards
      .filter((card) => card.owner_id !== myUserId)
      .reduce((sum, card) => sum + Math.max(1, Number(card.quantity ?? 1)), 0);
    const cashTotal = (offer.trade_cash_terms ?? []).reduce((sum, term) => sum + Number(term.amount ?? 0), 0);

    return (
      <TouchableOpacity
        onPress={() => router.push(`/offer?id=${offer.id}`)}
        style={{ backgroundColor: theme.colors.card, borderRadius: 18, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14 }}>
            {isReceiver ? 'Received' : 'Sent'}
          </Text>
          <View style={{ backgroundColor: statusColor + '20', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: statusColor + '40' }}>
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '800' }}>{statusLabel}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '900' }}>Your Offer</Text>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 }}>{myCardCount}</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '700' }}>card{myCardCount !== 1 ? 's' : ''}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '900' }}>Their Offer</Text>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 }}>{theirCardCount}</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '700' }}>card{theirCardCount !== 1 ? 's' : ''}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: theme.colors.primary + '10', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: theme.colors.primary + '25' }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '900' }}>Balance</Text>
            <Text style={{ color: theme.colors.primary, fontSize: 16, fontWeight: '900', marginTop: 4 }}>
              {cashTotal > 0 ? `£${cashTotal.toFixed(0)}` : 'Cards'}
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '700' }}>review</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          <TrustBadge label="Value balance" icon="scale-outline" tone="green" />
          <TrustBadge label={isAccepted || isCompleted ? 'Agreed' : 'Needs action'} icon={isAccepted || isCompleted ? 'checkmark-circle-outline' : 'alert-circle-outline'} tone={isAccepted || isCompleted ? 'green' : 'gold'} />
          <TrustBadge label="Protected timeline" icon="shield-outline" tone="purple" />
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
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>Mark My Cards as Sent</Text>}
            </TouchableOpacity>
          )}
          {(isAccepted || isSentStatus) && !iHaveReceived && iHaveSent && (
            <TouchableOpacity onPress={() => handleMarkReceived(offer.id)} disabled={busy} style={[{ backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>Mark Cards as Received</Text>}
            </TouchableOpacity>
          )}
          {isCompleted && (
            <TouchableOpacity
              onPress={() => router.push(`/offer/review?offerId=${offer.id}&reviewUserId=${isSender ? offer.receiver_id : offer.sender_id}`)}
              style={{ backgroundColor: theme.colors.primary + '18', borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.primary }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }}>Leave a Review</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.push(`/offer?id=${offer.id}`)} style={{ backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 13 }}>Open Negotiation</Text>
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
    const activeOfferCount = myOffers.filter((o) => ['pending', 'accepted', 'sent', 'received'].includes(o.status)).length;
    const completedOfferCount = myOffers.filter((o) => o.status === 'completed').length;
    const myListingCount = myListings.length;
    const visibleCount =
      segment === 'myOffers'
        ? myOffers.length
        : segment === 'myListings'
          ? myListings.length
          : segment === 'wanted'
            ? wantedCards.length
            : displayData.length;
    const visibleLabel =
      segment === 'myOffers'
        ? `${visibleCount} offer${visibleCount !== 1 ? 's' : ''}`
        : segment === 'wanted'
          ? `${visibleCount} wanted card${visibleCount !== 1 ? 's' : ''}`
          : `${visibleCount} listing${visibleCount !== 1 ? 's' : ''}`;

    const header = (
      <View style={{ gap: 10, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900' }}>
              {visibleLabel}
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
              {segment === 'tradeListings' || segment === 'adminReview'
                ? displayData.length !== currentData.length
                  ? `Showing ${displayData.length} of ${currentData.length}`
                  : 'Marketplace listings'
                : segment === 'myListings'
                  ? `${myListingCount} active from your collection`
                  : segment === 'myOffers'
                    ? `${activeOfferCount} active, ${completedOfferCount} completed`
                    : 'Cards you are looking for'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/listing/new' as any)}
            style={{
              minWidth: 72,
              height: 38,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 5,
            }}
          >
            <Ionicons name="add" size={17} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>List</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setSegment('myOffers')}
            style={{
              minWidth: 82,
              height: 38,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 5,
            }}
          >
            <Ionicons name="chatbubbles-outline" size={16} color={theme.colors.textSoft} />
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }}>
              {pendingOfferCount > 0 ? `Offers ${pendingOfferCount}` : 'Offers'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          {renderSegmentButton('tradeListings', 'Listings')}
          {isAdmin && renderSegmentButton('adminReview', 'Review')}
          {renderSegmentButton('myListings', 'Mine')}
          {renderSegmentButton('myOffers', `Offers${pendingOfferCount > 0 ? ` (${pendingOfferCount})` : ''}`)}
          {renderSegmentButton('wanted', 'Wanted')}
        </View>

        {(segment === 'tradeListings' || segment === 'adminReview') && (
          <View style={{ marginBottom: 12 }}>
            {/* Search + Filter button */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search cards or sets..."
                placeholderTextColor={theme.colors.textSoft}
                style={{
                  flex: 1, backgroundColor: theme.colors.card, color: theme.colors.text,
                  borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12,
                  paddingHorizontal: 12, paddingVertical: 9, fontSize: 13,
                }}
              />
              <TouchableOpacity
                onPress={() => setFiltersOpen(o => !o)}
                style={{
                  backgroundColor: activeFilterCount > 0 ? theme.colors.primary : theme.colors.card,
                  borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center',
                  borderWidth: 1, borderColor: activeFilterCount > 0 ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text style={{ color: activeFilterCount > 0 ? '#fff' : theme.colors.text, fontWeight: '800', fontSize: 13 }}>
                  {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Filter panel */}
            {filtersOpen && (
              <View style={{
                backgroundColor: theme.colors.card, borderRadius: 14,
                padding: 14, borderWidth: 1, borderColor: theme.colors.border,
                gap: 12,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>Filters</Text>
                  <TouchableOpacity onPress={() => setFiltersOpen(false)}>
                    <Ionicons name="chevron-up" size={18} color={theme.colors.textSoft} />
                  </TouchableOpacity>
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 13 }}>Card type</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {([
                      ['any', 'Any'],
                      ['raw', 'Raw'],
                      ['graded', 'Graded'],
                      ['sealed', 'Sealed'],
                    ] as const).map(([value, label]) => (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setFilterCardType(value)}
                        style={{
                          flex: 1,
                          paddingVertical: 8,
                          borderRadius: 10,
                          alignItems: 'center',
                          backgroundColor: filterCardType === value ? theme.colors.primary : theme.colors.surface,
                          borderWidth: 1,
                          borderColor: filterCardType === value ? theme.colors.primary : theme.colors.border,
                        }}
                      >
                        <Text style={{ color: filterCardType === value ? '#fff' : theme.colors.text, fontSize: 11, fontWeight: '800' }}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 13 }}>Set</Text>
                  <TextInput
                    value={filterSetQuery}
                    onChangeText={setFilterSetQuery}
                    placeholder="Any set"
                    placeholderTextColor={theme.colors.textSoft}
                    style={{
                      backgroundColor: theme.colors.surface, color: theme.colors.text,
                      borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
                      paddingHorizontal: 10, paddingVertical: 8, fontSize: 13,
                    }}
                  />
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 13 }}>Condition</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 4 }}>
                    {['Mint', 'Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'].map((c) => {
                      const active = filterConditions.includes(c);
                      return (
                        <TouchableOpacity
                          key={c}
                          onPress={() => setFilterConditions(prev =>
                            active ? prev.filter(x => x !== c) : [...prev, c]
                          )}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                            backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                            borderWidth: 1, borderColor: active ? theme.colors.primary : theme.colors.border,
                          }}
                        >
                          <Text style={{ color: active ? '#fff' : theme.colors.text, fontSize: 12, fontWeight: '800' }}>
                            {c === 'Near Mint' ? 'NM' : c === 'Lightly Played' ? 'LP' : c === 'Moderately Played' ? 'MP' : c === 'Heavily Played' ? 'HP' : c === 'Damaged' ? 'DMG' : 'Mint'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 13 }}>Price range (£)</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={filterMinPrice}
                      onChangeText={setFilterMinPrice}
                      placeholder="Min"
                      placeholderTextColor={theme.colors.textSoft}
                      keyboardType="decimal-pad"
                      style={{
                        flex: 1, backgroundColor: theme.colors.surface, color: theme.colors.text,
                        borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
                        paddingHorizontal: 10, paddingVertical: 8, fontSize: 13,
                      }}
                    />
                    <TextInput
                      value={filterMaxPrice}
                      onChangeText={setFilterMaxPrice}
                      placeholder="Max"
                      placeholderTextColor={theme.colors.textSoft}
                      keyboardType="decimal-pad"
                      style={{
                        flex: 1, backgroundColor: theme.colors.surface, color: theme.colors.text,
                        borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
                        paddingHorizontal: 10, paddingVertical: 8, fontSize: 13,
                      }}
                    />
                  </View>
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 13 }}>Location</Text>
                  <TextInput
                    value={filterLocation}
                    onChangeText={setFilterLocation}
                    placeholder="Any location"
                    placeholderTextColor={theme.colors.textSoft}
                    style={{
                      backgroundColor: theme.colors.surface, color: theme.colors.text,
                      borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
                      paddingHorizontal: 10, paddingVertical: 8, fontSize: 13,
                    }}
                  />
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 13 }}>Sort</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {(['newest', 'price_asc', 'price_desc'] as const).map((s) => (
                      <TouchableOpacity
                        key={s}
                        onPress={() => setSortBy(s)}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                          backgroundColor: sortBy === s ? theme.colors.primary : theme.colors.surface,
                          borderWidth: 1, borderColor: sortBy === s ? theme.colors.primary : theme.colors.border,
                        }}
                      >
                        <Text style={{ color: sortBy === s ? '#fff' : theme.colors.text, fontSize: 11, fontWeight: '800' }}>
                          {s === 'newest' ? 'Newest' : s === 'price_asc' ? 'Low to high' : 'High to low'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setFilterHasPhotos(p => !p)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                    borderColor: filterHasPhotos ? theme.colors.primary : theme.colors.border,
                    backgroundColor: filterHasPhotos ? theme.colors.primary : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {filterHasPhotos && <Ionicons name="checkmark" size={15} color="#fff" />}
                  </View>
                  <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 13 }}>Photos only</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setSortBy('newest');
                    setFilterCardType('any');
                    setFilterSetQuery('');
                    setFilterConditions([]);
                    setFilterMinPrice('');
                    setFilterMaxPrice('');
                    setFilterLocation('');
                    setFilterHasPhotos(false);
                  }}
                  style={{
                    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
                    paddingVertical: 8, alignItems: 'center',
                  }}
                >
                  <Text style={{ color: theme.colors.textSoft, fontWeight: '700', fontSize: 13 }}>Clear all filters</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

      </View>
    );

    return (
      <View style={{ flex: 1 }}>
        {header}

        {!!tradeError && (
          <View style={{ backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <Text style={{ color: '#991B1B' }}>{tradeError}</Text>
          </View>
        )}

        {segment === 'myOffers' ? (
          myOffers.length === 0 ? (
            <View style={{ paddingTop: 12, paddingBottom: 40 }}>
              <EmptyStateCard
                icon="chatbubbles-outline"
                title="No trade offers yet"
                body="Browse listings, make an offer, or create a listing so another collector can start a trade."
                actionLabel="Browse Listings"
                onAction={() => setSegment('tradeListings')}
              />
            </View>
          ) : (
            <FlatList
              data={myOffers}
              keyExtractor={(item) => item.id}
              renderItem={renderOffer}
              scrollEventThrottle={32}
              initialNumToRender={8}
              maxToRenderPerBatch={6}
              updateCellsBatchingPeriod={50}
              windowSize={7}
              removeClippedSubviews
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 200 }}
              refreshControl={<RefreshControl refreshing={false} onRefresh={loadMyOffers} tintColor={theme.colors.primary} />}
            />
          )
        ) : tradeLoading && displayData.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            key="trade-list"
            data={displayData}
            keyExtractor={(item, index) => item.id ? String(item.id) : `${item.card_id}-${item.set_id}-${index}`}
            renderItem={renderListing}
            numColumns={1}
            scrollEventThrottle={32}
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            removeClippedSubviews
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 200, flexGrow: displayData.length === 0 ? 1 : 0 }}
            refreshControl={<RefreshControl refreshing={tradeLoading} onRefresh={refreshTrade} tintColor={theme.colors.primary} />}
            ListEmptyComponent={
              <View style={{ paddingVertical: 26 }}>
                <EmptyStateCard
                  icon={segment === 'wanted' ? 'heart-outline' : 'swap-horizontal-outline'}
                  title={
                    segment === 'tradeListings'
                      ? 'No active trade listings'
                      : segment === 'adminReview'
                        ? 'No listings need review'
                        : segment === 'wanted'
                          ? 'No wanted cards yet'
                          : 'No cards marked for trade'
                  }
                  body={
                    segment === 'tradeListings'
                      ? 'Create a listing or check back as collectors add new cards.'
                      : segment === 'adminReview'
                        ? 'Everything looks clear right now.'
                        : segment === 'wanted'
                          ? 'Mark cards as wanted from card details to build your trade target list.'
                          : 'Mark cards for trade from your binder or card detail pages.'
                  }
                  actionLabel={segment === 'tradeListings' ? 'Add Listing' : undefined}
                  onAction={segment === 'tradeListings' ? () => router.push('/listing/new' as any) : undefined}
                />
              </View>
            }
          />
        )}
      </View>
    );
  };

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 16, paddingTop: 42, zIndex: 0 }}>
      <FeatureTipGate
        tipKey="trade-screen-v1"
        title="Trade"
        subtitle="Build safer card trades with other collectors."
        items={[
          { icon: 'storefront-outline', title: 'Browse Listings', body: 'Find cards other collectors have listed to buy, sell, or trade.' },
          { icon: 'add-circle-outline', title: 'List Cards', body: 'Add your own cards and set sale or trade terms.' },
          { icon: 'chatbubbles-outline', title: 'Offers', body: 'Review incoming and outgoing trade offers.' },
          { icon: 'heart-outline', title: 'Wanted Cards', body: 'Track cards you are looking for.' },
        ]}
      />

      <View style={{ paddingTop: 2, paddingBottom: 12 }}>
        <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 29, fontWeight: '900' }}>Trade</Text>
        <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
          Compare values, manage offers, and track wanted cards
        </Text>
      </View>

      {BETA_TRADE_DEMO_MODE && (
        <View style={{
          backgroundColor: '#FEF3C7',
          borderColor: '#F59E0B',
          borderWidth: 1,
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}>
          <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '900' }}>
            DEMO TRADES - BETA ONLY
          </Text>
          <Text style={{ color: '#92400E', fontSize: 12, lineHeight: 17, marginTop: 3 }}>
            Listings and offers are test flows. Payments are disabled and no live transaction will happen.
          </Text>
        </View>
      )}

      {renderTrading()}

      {/* Card Detail Modal */}
      <Modal visible={detailVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeDetail}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
            <Animated.View {...panResponder.panHandlers} style={{ flex: 1, transform: [{ translateY }] }}>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, position: 'relative' }}>
                  <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: theme.colors.border }} />
                  <TouchableOpacity onPress={closeDetail} style={{ position: 'absolute', right: 0, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Ionicons name="close" size={20} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>

                {(selectedCard || selectedListing) && (
                  <>
                    {(() => {
                      const listingPhotos = Array.isArray(selectedListing?.listing_images) && selectedListing.listing_images.length > 0
                        ? selectedListing.listing_images as string[]
                        : null;
                      if (listingPhotos) {
                        return (
                          <View style={{ marginBottom: 18 }}>
                            <ScrollView
                              horizontal
                              pagingEnabled
                              showsHorizontalScrollIndicator={false}
                              onMomentumScrollEnd={(e) =>
                                setModalPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / (width - 32)))
                              }
                              style={{ borderRadius: 16, overflow: 'hidden' }}
                            >
                              {listingPhotos.map((uri, i) => (
                                <View
                                  key={i}
                                  style={{
                                    width: width - 32,
                                    height: 360,
                                    backgroundColor: theme.colors.surface,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Image
                                    source={{ uri }}
                                    style={{ width: '100%', height: '100%' }}
                                    resizeMode="contain"
                                  />
                                </View>
                              ))}
                            </ScrollView>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                              <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800' }}>
                                {PHOTO_SLOT_LABELS[modalPhotoIndex] ?? `Photo ${modalPhotoIndex + 1}`} · {modalPhotoIndex + 1} of {listingPhotos.length}
                              </Text>
                              <View style={{ flexDirection: 'row', gap: 5 }}>
                                {listingPhotos.map((_, i) => (
                                  <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === modalPhotoIndex ? theme.colors.primary : theme.colors.border }} />
                                ))}
                              </View>
                            </View>
                          </View>
                        );
                      }
                      return selectedCard?.images?.large || selectedCard?.images?.small ? (
                        <Image source={{ uri: selectedCard.images?.large ?? selectedCard.images?.small }} style={{ width: '100%', height: 330, borderRadius: 20, alignSelf: 'center', marginBottom: 18 }} resizeMode="contain" />
                      ) : (
                        <View style={{ width: '100%', height: 330, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card, marginBottom: 18 }}>
                          <Text style={{ color: theme.colors.textSoft, fontWeight: '800' }}>No image</Text>
                        </View>
                      );
                    })()}

                    <View style={{ backgroundColor: theme.colors.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}>
                      <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>
                        {selectedCard?.name ?? selectedListing?.product_name ?? selectedListing?.card_id ?? 'Unknown card'}
                      </Text>
                      <Text style={{ marginTop: 6, color: theme.colors.textSoft, fontSize: 15, marginBottom: 14 }}>
                        {selectedCard?.set?.name ?? (selectedListing?.product_type ? String(selectedListing.product_type).replace(/_/g, ' ') : 'Unknown set')}
                        {selectedCard?.number ? ` - #${selectedCard.number}` : ''}
                      </Text>

                      {selectedListing?.profiles?.collector_name && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                          {selectedListing.profiles.avatar_url ? (
                            <Image source={{ uri: selectedListing.profiles.avatar_url }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                          ) : (
                            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="person" size={17} color={theme.colors.textSoft} />
                            </View>
                          )}
                          <View>
                            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700' }}>Collector</Text>
                            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '800' }}>{selectedListing.profiles.collector_name}</Text>
                          </View>
                        </View>
                      )}

<View style={{ backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border }}>
                        {selectedListing && (
                          <>
                            <DetailRow label="Condition" value={selectedListing.condition ?? '--'} valueColor={getConditionColor(selectedListing.condition ?? '')} />
                            <DetailRow
                              label="Trade Value"
                              value={selectedListing.asking_price != null ? `£${Number(selectedListing.asking_price).toFixed(2)}` : selectedListing.trade_only ? 'Trade only' : 'Open to offers'}
                              valueColor={theme.colors.primary}
                            />
                          </>
                        )}
                        
                        {selectedListing?.pricing_mode !== 'graded' && (
                          <>
                        {/* Live eBay Prices */}
                        <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 12 }} />
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '800' }}>eBay Sold Prices (GBP)</Text>
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
                          </>
                        )}
                        
{/* Reference Prices - only show if prices exist */}
                        {selectedListing?.prices && (selectedListing.prices.ebay_average != null || selectedListing.prices.tcg_mid != null || selectedListing.prices.cardmarket_trend != null) && (
                          <>
                            <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 12 }} />
                            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '800', marginBottom: 8 }}>Reference Prices</Text>
                            {selectedListing.prices?.ebay_average != null && (
                              <DetailRow 
                                label={selectedListing.pricing_mode === 'graded' ? 'PokeTrace Graded Avg' : 'eBay Avg'}
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
                          </>
                        )}
                        
                        {selectedListing?.pricing_mode !== 'graded' && (
                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 6 }}>
                            Sold prices from eBay. Historical prices from TCG data.
                          </Text>
                        )}
                      </View>

                      {selectedCard && (!selectedListing?.product_type || selectedListing.product_type === 'raw_card' || selectedListing.product_type === 'graded_slab') && (
                        <PokeTraceMarketInsights
                          cardName={selectedCard.name ?? selectedListing?.product_name ?? selectedListing?.card_id ?? ''}
                          setName={selectedCard.set?.name ?? null}
                          number={selectedCard.number ?? null}
                          rawCondition={selectedListing?.pricing_mode === 'graded' ? null : selectedListing?.condition ?? null}
                          gradingCompany={selectedListing?.pricing_mode === 'graded' ? selectedListing?.grade_company ?? null : null}
                          grade={selectedListing?.pricing_mode === 'graded' ? selectedListing?.grade ?? null : null}
                        />
                      )}

                      {!!selectedListing?.listing_notes && (
                        <View style={{ marginTop: 14, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border }}>
                          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 }}>Notes</Text>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 14, lineHeight: 20 }}>{selectedListing.listing_notes}</Text>
                        </View>
                      )}

                      {selectedListing && (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: theme.colors.primary + '10', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.primary + '28', marginTop: 12 }}>
                          <Ionicons name="shield-checkmark" size={16} color={theme.colors.primary} style={{ marginTop: 1 }} />
                          <Text style={{ flex: 1, color: theme.colors.primary, fontSize: 12, lineHeight: 18, fontWeight: '700' }}>
                            Photos verified at listing time. Contact the collector if the card doesn&apos;t match the listing.
                          </Text>
                        </View>
                      )}

{selectedListing && selectedListing.user_id !== myUserId ? (
                        <>
                          <TouchableOpacity onPress={() => { closeDetail(); handleMakeOffer(selectedListing); }} style={{ marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 13 }}>
                            <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '900' }}>Make Offer</Text>
                          </TouchableOpacity>
                          {isAdmin && (
                            <>
                              {selectedListing.admin_review_required && (
                                <TouchableOpacity
                                  onPress={() => handleApproveAdminReview(selectedListing.id)}
                                  disabled={actionBusy === selectedListing.id}
                                  style={{ marginTop: 8, backgroundColor: '#ECFDF5', borderRadius: 14, paddingVertical: 13, borderWidth: 1, borderColor: '#10B981' }}
                                >
                                  <Text style={{ color: '#047857', textAlign: 'center', fontWeight: '900' }}>
                                    {actionBusy === selectedListing.id ? 'Approving...' : 'Admin: Approve Listing'}
                                  </Text>
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                onPress={() => Alert.alert('Delete listing', 'Remove this listing as admin?', [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Delete', style: 'destructive', onPress: () => { closeDetail(); handleArchive(selectedListing.id); } },
                                ])}
                                style={{ marginTop: 8, backgroundColor: '#FEE2E2', borderRadius: 14, paddingVertical: 13, borderWidth: 1, borderColor: '#FCA5A5' }}
                              >
                                <Text style={{ color: '#991B1B', textAlign: 'center', fontWeight: '900' }}>Admin: Remove Listing</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </>
                      ) : selectedListing ? (
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
                      ) : null}
                    </View>
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </SafeAreaView>
        </View>
      </Modal>

    </View>
  );
}

// ===============================
// SUB COMPONENTS
// ===============================

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: valueColor ?? theme.colors.text, fontSize: 14, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}

function ProgressPill({ label, done, partial }: { label: string; done: boolean; partial?: boolean }) {
  const { theme } = useTheme();
  const bg = done ? '#10B981' : partial ? '#F59E0B' : theme.colors.surface;
  const textColor = done || partial ? '#FFFFFF' : theme.colors.textSoft;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: done ? '#10B981' : partial ? '#F59E0B' : theme.colors.border }}>
      <Text style={{ color: textColor, fontSize: 11, fontWeight: '800' }}>
        {done ? 'Done ' : partial ? 'Part ' : ''}{label}
      </Text>
    </View>
  );
}
