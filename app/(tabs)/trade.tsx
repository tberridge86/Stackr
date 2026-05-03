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
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ===============================
// TYPES
// ===============================

type MainTab = 'trading' | 'marketplace';
type SegmentKey = 'marketplaceListings' | 'myListings' | 'wanted' | 'myOffers';

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

  const openTradeCardDetail = (item: any) => {
    const cardDetails = cardDetailsMap[item.id];
    translateY.setValue(0);
    setSelectedListing(item);
    setSelectedCard(cardDetails ?? null);
    setDetailVisible(true);
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
      refreshTrade();
      loadWantedCards();
      loadMyOffers();
    }, [refreshTrade, loadWantedCards, loadMyOffers])
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
    try {
      await archiveListing(listingId);
      await refreshTrade();
      Alert.alert('Removed', 'This card has been removed from trade.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not remove listing.');
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
        <TouchableOpacity
          onPress={() => openTradeCardDetail(item)}
          style={{ flexDirection: 'row' }}
          activeOpacity={0.8}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ width: 72, height: 100, borderRadius: 10, marginRight: 12, backgroundColor: theme.colors.surface }}
              resizeMode="cover"
            />
          ) : (
            <View style={{
              width: 72, height: 100, borderRadius: 10, marginRight: 12,
              backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>No image</Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 4 }} numberOfLines={2}>
              {cardName}
            </Text>

            <Text style={{ color: theme.colors.textSoft, marginBottom: 4 }} numberOfLines={1}>
              {setName}
            </Text>

            {item.condition && (
              <Text style={{ color: getConditionColor(item.condition), marginBottom: 4, fontWeight: '700', fontSize: 12 }}>
                {item.condition}
              </Text>
            )}

            {item.has_damage && (
              <Text style={{ color: '#EF4444', marginBottom: 4, fontWeight: '900', fontSize: 12 }}>
                ⚠️ Damage disclosed
              </Text>
            )}

            {/* Price */}
            {segment !== 'wanted' && (
              item.asking_price != null || item.custom_value != null ? (
                <Text style={{ color: '#22C55E', marginBottom: 4, fontWeight: '900' }}>
                  £{Number(item.asking_price ?? item.custom_value).toFixed(2)}
                </Text>
              ) : item.trade_only ? (
                <Text style={{ color: theme.colors.primary, marginBottom: 4, fontWeight: '900' }}>
                  Trade only
                </Text>
              ) : (
                <Text style={{ color: theme.colors.primary, marginBottom: 4, fontWeight: '800' }}>
                  Open to offers
                </Text>
              )
            )}

            {/* Seller */}
            {segment === 'marketplaceListings' && (
              <TouchableOpacity onPress={() => router.push(`/user/${item.user_id}`)}>
                <Text style={{ color: theme.colors.primary, marginTop: 2, fontSize: 12 }}>
                  {sellerName}{isMyListing ? ' • Your listing' : ''}
                </Text>
              </TouchableOpacity>
            )}

            {segment === 'wanted' && (
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
                On your wishlist
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {!!item.listing_notes && (
          <Text style={{ color: theme.colors.textSoft, marginTop: 10, fontSize: 13 }}>
            {item.listing_notes}
          </Text>
        )}

        {/* Actions */}
        <View style={{ marginTop: 12, gap: 8 }}>
          {segment === 'marketplaceListings' && !isMyListing && (
            <TouchableOpacity
              onPress={() => handleMakeOffer(item)}
              style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 12 }}
            >
              <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '900' }}>
                Make Offer
              </Text>
            </TouchableOpacity>
          )}

          {segment === 'myListings' && (
            <TouchableOpacity
              onPress={() => handleArchive(item.id)}
              style={{ backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#FCA5A5' }}
            >
              <Text style={{ color: '#991B1B', textAlign: 'center', fontWeight: '900' }}>
                Remove from Trade
              </Text>
            </TouchableOpacity>
          )}

          {segment === 'wanted' && (
            <TouchableOpacity
              onPress={() => toggleWishlistCard(item.card_id, item.set_id)}
              style={{ backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#FCA5A5' }}
            >
              <Text style={{ color: '#991B1B', textAlign: 'center', fontWeight: '900' }}>
                Remove from Wishlist
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ===============================
  // RENDER OFFER CARD
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
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 14,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          ...cardShadow,
        }}
        activeOpacity={0.8}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14 }}>
            {isReceiver ? '📬 Received' : '📤 Sent'}
          </Text>
          <View style={{
            backgroundColor: statusColor + '20',
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: statusColor + '40',
          }}>
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '800' }}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* Progress pills */}
        {['accepted', 'sent', 'received'].includes(offer.status) && (
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <ProgressPill label="Agreed" done={true} />
            <ProgressPill
              label="Sent"
              done={offer.sender_sent && offer.receiver_sent}
              partial={offer.sender_sent || offer.receiver_sent}
            />
            <ProgressPill
              label="Received"
              done={offer.sender_received && offer.receiver_received}
              partial={offer.sender_received || offer.receiver_received}
            />
          </View>
        )}

        {/* Actions */}
        <View style={{ gap: 8 }}>
          {/* Mark sent */}
          {isAccepted && !iHaveSent && (
            <TouchableOpacity
              onPress={() => handleMarkSent(offer.id)}
              disabled={busy}
              style={[{
                backgroundColor: theme.colors.primary,
                borderRadius: 12,
                paddingVertical: 10,
                alignItems: 'center',
              }, busy && { opacity: 0.6 }]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>
                  📦 Mark My Cards as Sent
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Mark received */}
          {(isAccepted || isSentStatus) && !iHaveReceived && iHaveSent && (
            <TouchableOpacity
              onPress={() => handleMarkReceived(offer.id)}
              disabled={busy}
              style={[{
                backgroundColor: '#8B5CF6',
                borderRadius: 12,
                paddingVertical: 10,
                alignItems: 'center',
              }, busy && { opacity: 0.6 }]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>
                  📬 Mark Cards as Received
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Leave review */}
          {isCompleted && (
            <TouchableOpacity
              onPress={() => router.push(
                `/offer/review?offerId=${offer.id}&reviewUserId=${
                  isSender ? offer.receiver_id : offer.sender_id
                }`
              )}
              style={{
                backgroundColor: theme.colors.primary + '18',
                borderRadius: 12,
                paddingVertical: 10,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.colors.primary,
              }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }}>
                ⭐ Leave a Review
              </Text>
            </TouchableOpacity>
          )}

          {/* View negotiation */}
          <TouchableOpacity
            onPress={() => router.push(`/offer?id=${offer.id}`)}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 13 }}>
              Open Negotiation →
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ===============================
  // RENDER TRADING TAB
  // ===============================

  const renderTrading = () => {
    const pendingOfferCount = myOffers.filter(
      (o) => o.status === 'pending' && o.receiver_id === myUserId
    ).length;

    return (
      <>
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          {renderSegmentButton('marketplaceListings', 'Listings')}
          {renderSegmentButton('myListings', 'Mine')}
          {renderSegmentButton('myOffers', `Offers${pendingOfferCount > 0 ? ` (${pendingOfferCount})` : ''}`)}
          {renderSegmentButton('wanted', 'Wanted')}
        </View>

        {!!tradeError && (
          <View style={{
            backgroundColor: '#FEE2E2',
            borderColor: '#FCA5A5',
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}>
            <Text style={{ color: '#991B1B' }}>{tradeError}</Text>
          </View>
        )}

        {segment === 'myOffers' ? (
          myOffers.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                No trade offers yet
              </Text>
              <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 8 }}>
                Browse listings and make an offer to get started.
              </Text>
            </View>
          ) : (
            <FlatList
              data={myOffers}
              keyExtractor={(item) => item.id}
              renderItem={renderOffer}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 200 }}
              refreshControl={
                <RefreshControl
                  refreshing={false}
                  onRefresh={loadMyOffers}
                  tintColor={theme.colors.primary}
                />
              }
            />
          )
        ) : tradeLoading && currentData.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            data={currentData}
            keyExtractor={(item, index) =>
              item.id ? String(item.id) : `${item.card_id}-${item.set_id}-${index}`
            }
            renderItem={renderListing}
            showsVerticalScrollIndicator={false}
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
            ListEmptyComponent={
              <View style={{ paddingVertical: 50 }}>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>
                  {segment === 'marketplaceListings'
                    ? 'No active trade listings yet.'
                    : segment === 'wanted'
                    ? 'You have no wanted cards yet.'
                    : 'You have no cards marked for trade yet.'}
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
      <View style={{
        backgroundColor: theme.colors.card,
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        marginBottom: 14,
        ...cardShadow,
      }}>
        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
          Price Tracker
        </Text>
        <Text style={{ color: theme.colors.textSoft, marginTop: 8, lineHeight: 20 }}>
          Search cards, watch prices, and track daily movement using eBay and snapshot data.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/market')}
          style={{ marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 13 }}
        >
          <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '900' }}>
            Open Marketplace
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{
        backgroundColor: theme.colors.card,
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...cardShadow,
      }}>
        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Coming soon</Text>
        {['Top movers today', 'Watchlist trends', 'Collection value graph', 'Price alerts'].map((item) => (
          <Text key={item} style={{ color: theme.colors.textSoft, marginTop: 8 }}>• {item}</Text>
        ))}
      </View>
    </ScrollView>
  );

   // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 16, paddingTop: 42 }}>

      <Text style={{ color: theme.colors.text, fontSize: 30, fontWeight: '900', marginBottom: 6 }}>
        Market
      </Text>

      <Text style={{ color: theme.colors.textSoft, fontSize: 14, marginBottom: 16 }}>
        Trading, offers, prices, and card movement.
      </Text>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {renderMainTabButton('trading', '🤝 Trading')}
        {renderMainTabButton('marketplace', '📈 Prices')}
      </View>

      {mainTab === 'trading' ? renderTrading() : renderMarketplace()}

      {/* Card Detail Modal */}
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
              style={{ flex: 1, transform: [{ translateY }] }}
            >
              <ScrollView
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 75, paddingBottom: 44 }}
                showsVerticalScrollIndicator={false}
              >
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
    style={{ position: 'absolute', right: 0, padding: 8 }}
  >
    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 20, fontWeight: '700' }}>✕</Text>
  </TouchableOpacity>
</View>
                {(selectedCard || selectedListing) && (
                  <>
                    {selectedCard?.images?.large || selectedCard?.images?.small ? (
                      <Image
                        source={{ uri: selectedCard.images?.large ?? selectedCard.images?.small }}
                        style={{ width: '100%', height: 330, borderRadius: 20, alignSelf: 'center', marginBottom: 18 }}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={{
                        width: '100%', height: 330, borderRadius: 20,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: theme.colors.card, marginBottom: 18,
                      }}>
                        <Text style={{ color: theme.colors.textSoft, fontWeight: '800' }}>No image</Text>
                      </View>
                    )}

                    <View style={{
                      backgroundColor: theme.colors.card,
                      borderRadius: 22,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      ...cardShadow,
                    }}>
                      <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>
                        {selectedCard?.name ?? selectedListing?.card_id ?? 'Unknown card'}
                      </Text>

                      <Text style={{ marginTop: 6, color: theme.colors.textSoft, fontSize: 15, marginBottom: 14 }}>
                        {selectedCard?.set?.name ?? 'Unknown set'}
                        {selectedCard?.number ? ` • #${selectedCard.number}` : ''}
                      </Text>

                      <View style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: 16,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}>
                        <DetailRow
                          label="Condition"
                          value={selectedListing?.condition ?? '--'}
                          valueColor={getConditionColor(selectedListing?.condition ?? '')}
                        />
                        <DetailRow
                          label="Asking Price"
                          value={
                            selectedListing?.asking_price != null
                              ? `£${Number(selectedListing.asking_price).toFixed(2)}`
                              : selectedListing?.trade_only
                              ? 'Trade only'
                              : 'Open to offers'
                          }
                        />
                        <DetailRow
                          label="Market Estimate"
                          value={
                            selectedListing?.market_estimate != null
                              ? `£${Number(selectedListing.market_estimate).toFixed(2)}`
                              : '--'
                          }
                        />
                        <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 6 }}>
                          Market values are estimated using recent TCG data. Actual value may vary.
                        </Text>
                      </View>

                      {!!selectedListing?.listing_notes && (
                        <View style={{
                          marginTop: 14,
                          backgroundColor: theme.colors.surface,
                          borderRadius: 16,
                          padding: 14,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}>
                          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 }}>
                            Notes
                          </Text>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 14, lineHeight: 20 }}>
                            {selectedListing.listing_notes}
                          </Text>
                        </View>
                      )}

                      {selectedListing?.user_id !== myUserId ? (
                        <TouchableOpacity
                          onPress={() => { closeDetail(); handleMakeOffer(selectedListing); }}
                          style={{ marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 13 }}
                        >
                          <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '900' }}>
                            Make Offer
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={{
                          marginTop: 16,
                          backgroundColor: theme.colors.surface,
                          borderRadius: 14,
                          paddingVertical: 13,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}>
                          <Text style={{ color: theme.colors.textSoft, textAlign: 'center', fontWeight: '900' }}>
                            Your listing
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </SafeAreaView>
        </BlurView>
      </Modal>

      {/* ===============================
          PRICE BUILDER FAB
          Sits after Modal, inside main View
      =============================== */}
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

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: valueColor ?? theme.colors.text, fontSize: 14, fontWeight: '800' }}>
        {value}
      </Text>
    </View>
  );
}

function ProgressPill({
  label,
  done,
  partial,
}: {
  label: string;
  done: boolean;
  partial?: boolean;
}) {
  const bg = done ? '#10B981' : partial ? '#F59E0B' : theme.colors.surface;
  const textColor = done || partial ? '#FFFFFF' : theme.colors.textSoft;

  return (
    <View style={{
      backgroundColor: bg,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: done ? '#10B981' : partial ? '#F59E0B' : theme.colors.border,
    }}>
      <Text style={{ color: textColor, fontSize: 11, fontWeight: '800' }}>
        {done ? '✓ ' : partial ? '◑ ' : ''}{label}
      </Text>
    </View>
  );
}