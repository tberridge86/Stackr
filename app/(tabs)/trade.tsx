import { BlurView } from 'expo-blur';
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
TextInput,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { useFocusEffect, router } from 'expo-router';
import { useTrade } from '../../components/trade-context';
import {
  getCachedCardSync,
  getCachedCardsForSet,
} from '../../lib/pokemonTcgCache';
import { supabase } from '../../lib/supabase';

type MainTab = 'trading' | 'marketplace';
type SegmentKey = 'marketplaceListings' | 'myListings' | 'wanted'| 'myOffers';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const getConditionColor = (condition: string) => {
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

export default function TradeScreen() {
 const [mainTab, setMainTab] = useState<MainTab>('trading');
const [segment, setSegment] = useState<SegmentKey>('marketplaceListings');
const [wantedCards, setWantedCards] = useState<any[]>([]);
const [cardDetailsMap, setCardDetailsMap] = useState<Record<string, any>>({});

const [myUserId, setMyUserId] = useState<string>('');
const [activeTrades, setActiveTrades] = useState<Record<string, any>>({});

const [reviewVisible, setReviewVisible] = useState(false);
const [reviewTrade, setReviewTrade] = useState<any | null>(null);
const [reviewedUserId, setReviewedUserId] = useState<string>('');
const [reviewRating, setReviewRating] = useState(5);
const [reviewComment, setReviewComment] = useState('');
const [reviewSaving, setReviewSaving] = useState(false);

// 👇 MODAL STATE
const [selectedListing, setSelectedListing] = useState<any | null>(null);
const [selectedCard, setSelectedCard] = useState<any | null>(null);
const [detailVisible, setDetailVisible] = useState(false);

// 👇 ANIMATION
const translateY = useRef(new Animated.Value(0)).current;

// 👇 TRADE DATA
const {
  marketplaceListings,
  myListings,
  tradeLoading,
  tradeError,
  refreshTrade,
  archiveListing,
  toggleWishlistCard,
  createTradeReview,
} = useTrade();

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
      onMoveShouldSetPanResponder: (_, gesture) => {
        return gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
      },
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          translateY.setValue(gesture.dy);
        }
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

const openTradeCardDetail = (item: any) => {
  const cardDetails = cardDetailsMap[item.id];

  translateY.setValue(0);
  setSelectedListing(item);
  setSelectedCard(cardDetails ?? null);
  setDetailVisible(true);
};

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setMyUserId(user?.id ?? '');
    };

    loadUser();
  }, []);

   const loadWantedCards = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setWantedCards([]);
      return;
    }

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
};

  useFocusEffect(
    useCallback(() => {
      refreshTrade();
      loadWantedCards();
    }, [refreshTrade])
  );

  const currentData = useMemo(() => {
    if (segment === 'marketplaceListings') return marketplaceListings;
    if (segment === 'myListings') return myListings;
    if (segment === 'wanted') return wantedCards;
    return [];
  }, [segment, marketplaceListings, myListings, wantedCards]);

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
          found = cards.find((card) => card.id === cardId) ?? null;
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
      name: data.raw_data?.set?.name ?? data.raw_data?.set?.series ?? data.set_id,
    },
    images: {
      small: data.image_small,
      large: data.image_large,
    },
  };

  continue;
}
      }

      if (mounted) setCardDetailsMap(nextMap);
    };

    if (currentData.length) loadDetails();
    else setCardDetailsMap({});

    return () => {
      mounted = false;
    };
  }, [currentData]);

  const handleArchive = async (listingId: string) => {
    try {
      await archiveListing(listingId);
      await refreshTrade();
      Alert.alert('Removed', 'This card has been removed from trade.');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not remove listing.';
      Alert.alert('Error', message);
    }
  };

  const handleMakeOffer = (item: any) => {
    const isMyListing = item.user_id === myUserId;

    if (isMyListing) {
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
        <Text
          style={{
            color: active ? '#FFFFFF' : theme.colors.textSoft,
            textAlign: 'center',
            fontWeight: '900',
            fontSize: 15,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSegmentButton = (key: SegmentKey, label: string) => {
    const active = segment === key;

    return (
      <TouchableOpacity
        onPress={() => setSegment(key)}
        style={{
          flex: 1,
          paddingVertical: 10,
          paddingHorizontal: 8,
          marginHorizontal: 4,
          borderRadius: 12,
          backgroundColor: active ? theme.colors.secondary : theme.colors.card,
          borderWidth: 1,
          borderColor: active ? theme.colors.secondary : theme.colors.border,
        }}
      >
        <Text
          style={{
            color: active ? theme.colors.text : theme.colors.textSoft,
            textAlign: 'center',
            fontWeight: '800',
            fontSize: 12,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };
const openReviewModal = (trade: any) => {
  const otherUserId =
    trade.seller_id === myUserId ? trade.buyer_id : trade.seller_id;

  setReviewTrade(trade);
  setReviewedUserId(otherUserId);
  setReviewRating(5);
  setReviewComment('');
  setReviewVisible(true);
};

const submitReview = async () => {
  if (!reviewTrade || !reviewedUserId) return;

  try {
    setReviewSaving(true);

    await createTradeReview({
      tradeId: reviewTrade.id,
      reviewedUserId,
      rating: reviewRating,
      comment: reviewComment,
    });

    setReviewVisible(false);
    setReviewTrade(null);
    setReviewedUserId('');
    setReviewComment('');

    Alert.alert('Review saved', 'Thanks for rating this trader.');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not save review.';

    Alert.alert('Error', message);
  } finally {
    setReviewSaving(false);
  }
};


  const renderListing = ({ item }: { item: any }) => {
    const sellerName = item?.profiles?.collector_name || 'Collector';
    const cardDetails = cardDetailsMap[item.id];
    const imageUri = cardDetails?.images?.small ?? null;
    const cardName = cardDetails?.name ?? item.card_id ?? 'Unknown card';
    const setName = cardDetails?.set?.name ?? 'Unknown set';
    const isMyListing = item.user_id === myUserId;

    const trade = activeTrades[item.id];
        const isSeller = trade?.seller_id === myUserId;


    return (
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 14,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          ...cardShadow,
        }}
      >
        <TouchableOpacity
          onPress={() => openTradeCardDetail(item)}
          style={{ flexDirection: 'row' }}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{
                width: 72,
                height: 100,
                borderRadius: 10,
                marginRight: 12,
                backgroundColor: theme.colors.surface,
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: 72,
                height: 100,
                borderRadius: 10,
                marginRight: 12,
                backgroundColor: theme.colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>
                No image
              </Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 16,
                fontWeight: '900',
                marginBottom: 4,
              }}
              numberOfLines={2}
            >
              {cardName}
            </Text>

           <Text
  style={{ color: theme.colors.textSoft, marginBottom: 4 }}
  numberOfLines={1}
>
  {setName}
</Text>

{item.condition && (
  <Text
    style={{
      color: getConditionColor(item.condition),
      marginBottom: 4,
      fontWeight: '700',
      fontSize: 12,
    }}
  >
    Condition: {item.condition}
  </Text>
)}
              {item.has_damage && (
  <Text style={{ color: '#EF4444', marginBottom: 4, fontWeight: '900' }}>
    Damage disclosed
  </Text>
)}

{item.trade_only && (
  <Text style={{ color: theme.colors.primary, marginBottom: 4, fontWeight: '900' }}>
    Trade only
  </Text>
)}

            {segment === 'wanted' ? (
  <Text
    style={{
      color: theme.colors.primary,
      marginBottom: 4,
      fontWeight: '800',
    }}
  >
    Wanted card
  </Text>
) : item.asking_price != null || item.custom_value != null ? (
  <Text
    style={{
      color: '#22C55E',
      marginBottom: 4,
      fontWeight: '900',
    }}
  >
    Asking: £{Number(item.asking_price ?? item.custom_value).toFixed(2)}
  </Text>
) : item.trade_only ? (
  <Text
    style={{
      color: theme.colors.primary,
      marginBottom: 4,
      fontWeight: '900',
    }}
  >
    Trade only
  </Text>
) : (
  <Text
    style={{
      color: theme.colors.primary,
      marginBottom: 4,
      fontWeight: '800',
    }}
  >
    Open to offers
  </Text>
)}

           {segment === 'marketplaceListings' ? (
  <TouchableOpacity onPress={() => router.push(`/user/${item.user_id}`)}>
    <Text style={{ color: theme.colors.primary, marginTop: 2 }}>
      {sellerName}
      {isMyListing ? ' • Your listing' : ''}
    </Text>
  </TouchableOpacity>
) : segment === 'wanted' ? (
  <Text style={{ color: theme.colors.textSoft, marginTop: 2 }}>
    Added to wishlist
  </Text>
) : (
  <Text style={{ color: theme.colors.textSoft, marginTop: 2 }}>
    Listed for trade
  </Text>
)}
          </View>
        </TouchableOpacity>

        {!!item.notes && (
          <Text style={{ color: theme.colors.textSoft, marginTop: 10 }}>
            {item.notes}
          </Text>
        )}

{trade ? (
  <View
    style={{
      marginTop: 12,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    }}
  >
    <Text
      style={{
        color: theme.colors.text,
        fontWeight: '900',
        marginBottom: 8,
      }}
    >
      {trade.status === 'completed'
        ? '✅ Trade completed'
        : '📦 Trade in progress'}
    </Text>

    {trade.status === 'completed' && (
  <TouchableOpacity
    onPress={() => openReviewModal(trade)}
    style={{
      backgroundColor: '#FACC15',
      borderRadius: 10,
      paddingVertical: 10,
      marginBottom: 8,
    }}
  >
    <Text style={{ color: '#111827', textAlign: 'center', fontWeight: '900' }}>
      Leave Trader Review
    </Text>
  </TouchableOpacity>
)}

    {/* MARK AS SENT */}
    {((isSeller && !trade.seller_sent) ||
      (!isSeller && !trade.buyer_sent)) && (
      <TouchableOpacity
        onPress={() => markSent(trade.id)}
        style={{
          backgroundColor: theme.colors.primary,
          borderRadius: 10,
          paddingVertical: 10,
          marginBottom: 8,
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '900' }}>
          Mark as Sent
        </Text>
      </TouchableOpacity>
    )}

    {/* MARK AS RECEIVED */}
    {((isSeller && trade.seller_sent && !trade.seller_received) ||
      (!isSeller && trade.buyer_sent && !trade.buyer_received)) && (
      <TouchableOpacity
        onPress={() => markReceived(trade.id)}
        style={{
          backgroundColor: '#22C55E',
          borderRadius: 10,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '900' }}>
          Mark as Received
        </Text>
      </TouchableOpacity>
    )}
  </View>
) : segment === 'marketplaceListings' && !isMyListing ? (
  <TouchableOpacity
    onPress={() => handleMakeOffer(item)}
    style={{
      marginTop: 12,
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
    }}
  >
    <Text
      style={{
        color: '#FFFFFF',
        textAlign: 'center',
        fontWeight: '900',
      }}
    >
      Make Offer
    </Text>
  </TouchableOpacity>
) : segment === 'myListings' ? (
  <TouchableOpacity
    onPress={() => handleArchive(item.id)}
    style={{
      marginTop: 12,
      backgroundColor: '#FEE2E2',
      borderRadius: 12,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: '#FCA5A5',
    }}
  >
    <Text
      style={{
        color: '#991B1B',
        textAlign: 'center',
        fontWeight: '900',
      }}
    >
      Remove from Trade
    </Text>
  </TouchableOpacity>
) : segment === 'wanted' ? (
  <TouchableOpacity
    onPress={() =>
      toggleWishlistCard(item.card_id, item.set_id)
    }
    style={{
      marginTop: 12,
      backgroundColor: '#FEE2E2',
      borderRadius: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: '#FCA5A5',
    }}
  >
    <Text
      style={{
        color: '#991B1B',
        textAlign: 'center',
        fontWeight: '900',
      }}
    >
      Remove from wishlist
    </Text>
  </TouchableOpacity>
) : null}
      </View>
    );
  };

  const renderEmpty = () => {
    const text =
  segment === 'marketplaceListings'
    ? 'No active trade listings yet.'
    : segment === 'wanted'
    ? 'You have no wanted cards yet.'
    : 'You have no cards marked for trade yet.';

    return (
      <View style={{ paddingVertical: 50 }}>
        <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>
          {text}
        </Text>
      </View>
    );
  };

  const renderOffersShortcut = () => {
    return (
      <View style={{ paddingVertical: 30 }}>
        <Text
          style={{
            color: theme.colors.textSoft,
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          View and manage your trade offers.
        </Text>

        <TouchableOpacity
          onPress={() => router.push('/offer')}
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
            alignSelf: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Open Offers</Text>
        </TouchableOpacity>
      </View>
    );
  };

    const renderTrading = () => {
    return (
      <>
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          {renderSegmentButton('marketplaceListings', 'Listings')}
          {renderSegmentButton('myListings', 'Mine')}
          {renderSegmentButton('myOffers', 'Offers')}
          {renderSegmentButton('wanted', 'Wanted')}
        </View>

        {!!tradeError && (
          <View
            style={{
              backgroundColor: '#FEE2E2',
              borderColor: '#FCA5A5',
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#991B1B' }}>{tradeError}</Text>
          </View>
        )}

        {segment === 'myOffers' ? (
          renderOffersShortcut()
        ) : tradeLoading && currentData.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            data={currentData}
            keyExtractor={(item, index) =>
  item.id ? String(item.id) : `${item.card_id}-${item.set_id}-${index}`
}
            renderItem={renderListing}
            contentContainerStyle={{
              paddingBottom: 200,
              flexGrow: currentData.length === 0 ? 1 : 0,
            }}
            refreshControl={
              <RefreshControl
                refreshing={tradeLoading}
                onRefresh={refreshTrade}
                tintColor={theme.colors.primary}
              />
            }
            ListEmptyComponent={renderEmpty}
          />
        )}
      </>
    );
  };

  const renderMarketplace = () => {
    return (
      <View>
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 20,
            padding: 18,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginBottom: 14,
            ...cardShadow,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 20,
              fontWeight: '900',
            }}
          >
            Price Tracker
          </Text>

          <Text
            style={{
              color: theme.colors.textSoft,
              marginTop: 8,
              lineHeight: 20,
            }}
          >
            Search cards, watch prices, and track daily movement using eBay and
            snapshot data.
          </Text>

          <TouchableOpacity
            onPress={() => router.push('/market')}
            style={{
              marginTop: 16,
              backgroundColor: theme.colors.primary,
              borderRadius: 14,
              paddingVertical: 13,
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                textAlign: 'center',
                fontWeight: '900',
              }}
            >
              Open Marketplace
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 20,
            padding: 18,
            borderWidth: 1,
            borderColor: theme.colors.border,
            ...cardShadow,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 18,
              fontWeight: '900',
            }}
          >
            Coming next
          </Text>

          {[
            'Top movers today',
            'Watchlist trends',
            'Collection value graph',
            'Price alerts',
          ].map((item) => (
            <Text key={item} style={{ color: theme.colors.textSoft, marginTop: 8 }}>
              • {item}
            </Text>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
        paddingHorizontal: 16,
        paddingTop: 42,
      }}
    >
      <Text
        style={{
          color: theme.colors.text,
          fontSize: 30,
          fontWeight: '900',
          marginBottom: 6,
        }}
      >
        Market
      </Text>

      <Text
        style={{
          color: theme.colors.textSoft,
          fontSize: 14,
          marginBottom: 16,
        }}
      >
        Trading, offers, prices, and card movement.
      </Text>

      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {renderMainTabButton('trading', 'Trading')}
        {renderMainTabButton('marketplace', 'Marketplace')}
      </View>

      {mainTab === 'trading' ? renderTrading() : renderMarketplace()}

 <Modal
  visible={detailVisible}
  transparent
  animationType="fade"
  onRequestClose={closeDetail}
>
  <BlurView intensity={95} tint="dark" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' }}>
    <Pressable style={StyleSheet.absoluteFillObject} onPress={closeDetail} />

    <SafeAreaView style={{ flex: 1 }}>
      <Animated.View
        {...panResponder.panHandlers}
        style={{
          flex: 1,
          transform: [{ translateY }],
        }}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 44,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 42,
              height: 5,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.55)',
              marginBottom: 20,
            }}
          />

          {selectedCard || selectedListing ? (
            <>
              {selectedCard?.images?.large || selectedCard?.images?.small ? (
                <Image
                  source={{
                    uri: selectedCard.images?.large || selectedCard.images?.small,
                  }}
                  style={{
                    width: '100%',
                    height: 330,
                    borderRadius: 20,
                    alignSelf: 'center',
                    marginBottom: 18,
                  }}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={{
                    width: '100%',
                    height: 330,
                    borderRadius: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.card,
                    marginBottom: 18,
                  }}
                >
                  <Text style={{ color: theme.colors.textSoft, fontWeight: '800' }}>
                    No image
                  </Text>
                </View>
              )}

              <View
                style={{
                  backgroundColor: theme.colors.card,
                  borderRadius: 22,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  ...cardShadow,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: 24,
                    fontWeight: '900',
                  }}
                >
                  {selectedCard?.name ?? selectedListing?.card_id ?? 'Unknown card'}
                </Text>

                <Text
  style={{
    marginTop: 6,
    color: theme.colors.textSoft,
    fontSize: 15,
    marginBottom: 14,
  }}
>
  {selectedCard?.set?.name ??
  cardDetailsMap[selectedListing?.id]?.set?.name ??
    'Unknown set'}
  {selectedCard?.number ? ` • #${selectedCard.number}` : ''}
</Text>

                <View
                  style={{
                    marginTop: 8,
                    backgroundColor: theme.colors.surface,
                    borderRadius: 16,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <>
  {/* CONDITION */}
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
    <Text style={{ color: theme.colors.textSoft, fontSize: 14 }}>
      Condition
    </Text>
    <Text style={{ color: getConditionColor(selectedListing?.condition ?? ''), fontSize: 14, fontWeight: '800' }}>
      {selectedListing?.condition ?? '--'}
    </Text>
  </View>

  {/* PRICE */}
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
    <Text style={{ color: theme.colors.textSoft, fontSize: 14 }}>
      Asking Price
    </Text>
    <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800' }}>
      {selectedListing?.asking_price != null || selectedListing?.custom_value != null
        ? `£${Number(selectedListing.asking_price ?? selectedListing.custom_value).toFixed(2)}`
        : selectedListing?.trade_only
        ? 'Trade only'
        : 'Open to offers'}
    </Text>
  </View>

  {/* MARKET */}
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
    <Text style={{ color: theme.colors.textSoft, fontSize: 14 }}>
      Market estimate (based on condition)
    </Text>
    <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800' }}>
      {selectedListing?.market_estimate != null
        ? `£${Number(selectedListing.market_estimate).toFixed(2)}`
        : '--'}
    </Text>
      </View>
      
<Text style={styles.marketDisclaimer}>
  Market values are estimated using recent TCG data and assume the stated card condition. Actual value may vary.
</Text>

</>

                </View>

                {!!selectedListing?.notes && (
                  <View
                    style={{
                      marginTop: 14,
                      backgroundColor: theme.colors.surface,
                      borderRadius: 16,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: 16,
                        fontWeight: '800',
                        marginBottom: 8,
                      }}
                    >
                      Notes
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textSoft,
                        fontSize: 14,
                        lineHeight: 20,
                      }}
                    >
                      {selectedListing.notes}
                    </Text>
                  </View>
                )}

                {selectedListing?.user_id !== myUserId ? (
                  <TouchableOpacity
                    onPress={() => {
                      closeDetail();
                      handleMakeOffer(selectedListing);
                    }}
                    style={{
                      marginTop: 16,
                      backgroundColor: theme.colors.primary,
                      borderRadius: 14,
                      paddingVertical: 13,
                    }}
                  >
                    <Text
                      style={{
                        color: '#FFFFFF',
                        textAlign: 'center',
                        fontWeight: '900',
                      }}
                    >
                      Make Offer
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View
                    style={{
                      marginTop: 16,
                      backgroundColor: theme.colors.surface,
                      borderRadius: 14,
                      paddingVertical: 13,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.textSoft,
                        textAlign: 'center',
                        fontWeight: '900',
                      }}

                      
                    >
                      Your listing
                    </Text>
                  </View>
                )}
              </View>
            </>
          ) : null}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  </BlurView>
</Modal>
      
 <Modal
  visible={reviewVisible}
  transparent
  animationType="fade"
  onRequestClose={() => setReviewVisible(false)}
>
  <View
    style={{
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      padding: 20,
    }}
  >
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text
        style={{
          color: theme.colors.text,
          fontSize: 22,
          fontWeight: '900',
          marginBottom: 8,
        }}
      >
        Rate this trader
      </Text>

      <Text
        style={{
          color: theme.colors.textSoft,
          marginBottom: 14,
        }}
      >
        Leave a star rating and optional comment.
      </Text>

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => setReviewRating(star)}
            style={{ paddingHorizontal: 5 }}
          >
            <Text style={{ fontSize: 34 }}>
              {star <= reviewRating ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        value={reviewComment}
        onChangeText={setReviewComment}
        placeholder="Optional comment"
        placeholderTextColor={theme.colors.textSoft}
        multiline
        style={{
          minHeight: 90,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          color: theme.colors.text,
          padding: 12,
          textAlignVertical: 'top',
          marginBottom: 14,
        }}
      />

      <TouchableOpacity
        disabled={reviewSaving}
        onPress={submitReview}
        style={{
          backgroundColor: theme.colors.primary,
          borderRadius: 14,
          paddingVertical: 13,
          opacity: reviewSaving ? 0.6 : 1,
        }}
      >
        <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '900' }}>
          {reviewSaving ? 'Saving...' : 'Submit Review'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setReviewVisible(false)}
        style={{
          marginTop: 10,
          borderRadius: 14,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Text
          style={{
            color: theme.colors.textSoft,
            textAlign: 'center',
            fontWeight: '900',
          }}
        >
          Cancel
        </Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
      
      
    </View>
  );
}

const styles = StyleSheet.create({
  marketDisclaimer: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
});