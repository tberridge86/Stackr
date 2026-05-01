import { theme } from '../lib/theme';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  fetchMyTradeOffers,
  updateTradeOfferStatus,
  TradeOffer,
} from '../lib/tradeOffers';

type SegmentKey = 'received' | 'sent' | 'history';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  payment_required: 'Payment Required',
  payment_sent: 'Payment Sent',
  payment_confirmed: 'Payment Confirmed',
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
  payment_required: '#F59E0B',
  payment_sent: '#3B82F6',
  payment_confirmed: '#10B981',
  sent: '#3B82F6',
  received: '#8B5CF6',
  completed: '#10B981',
  disputed: '#EF4444',
};

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

export default function OffersScreen() {
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [segment, setSegment] = useState<SegmentKey>('received');
  const [cardPreviews, setCardPreviews] = useState<Record<string, any>>({});

  // ===============================
  // LOAD
  // ===============================

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? '');

      const data = await fetchMyTradeOffers();
      setOffers(data);

      // Load card previews for all cards in all offers
      const allCardIds = Array.from(new Set(
        data.flatMap((offer) =>
          (offer.trade_offer_cards ?? []).map((c) => c.card_id)
        )
      ));

      if (allCardIds.length > 0) {
        const { data: previews } = await supabase
          .from('card_previews')
          .select('card_id, name, image_url, set_name')
          .in('card_id', allCardIds);

        const map: Record<string, any> = {};
        (previews ?? []).forEach((p: any) => {
          map[p.card_id] = p;
        });

        setCardPreviews(map);
      }
    } catch (error) {
      console.log('Failed to load offers', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ===============================
  // SEGMENTS
  // ===============================

  const receivedOffers = offers.filter(
    (o) => o.receiver_id === currentUserId && o.status === 'pending'
  );

  const sentOffers = offers.filter(
    (o) => o.sender_id === currentUserId && o.status === 'pending'
  );

  const historyOffers = offers.filter(
    (o) => o.status !== 'pending'
  );

  const currentOffers =
    segment === 'received'
      ? receivedOffers
      : segment === 'sent'
      ? sentOffers
      : historyOffers;

  // ===============================
  // ACTIONS
  // ===============================

  const handleAccept = async (offerId: string) => {
    try {
      await updateTradeOfferStatus(offerId, 'accepted', 'Offer accepted.');
      await load();
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not accept offer.');
    }
  };

  const handleDecline = async (offerId: string) => {
    Alert.alert(
      'Decline offer',
      'Are you sure you want to decline this offer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateTradeOfferStatus(offerId, 'declined', 'Offer declined.');
              await load();
            } catch (error: any) {
              Alert.alert('Error', error?.message ?? 'Could not decline offer.');
            }
          },
        },
      ]
    );
  };

  const handleWithdraw = async (offerId: string) => {
    Alert.alert(
      'Withdraw offer',
      'Are you sure you want to withdraw this offer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateTradeOfferStatus(offerId, 'cancelled', 'Offer withdrawn.');
              await load();
            } catch (error: any) {
              Alert.alert('Error', error?.message ?? 'Could not withdraw offer.');
            }
          },
        },
      ]
    );
  };

  // ===============================
  // RENDER OFFER CARD
  // ===============================

  const renderOffer = ({ item: offer }: { item: TradeOffer }) => {
    const isReceiver = offer.receiver_id === currentUserId;
    const isPending = offer.status === 'pending';
    const isCompleted = offer.status === 'completed';
    const statusLabel = STATUS_LABEL[offer.status] ?? offer.status;
    const statusColor = STATUS_COLOR[offer.status] ?? theme.colors.textSoft;

    const offerCards = (offer.trade_offer_cards ?? []).filter(
      (c) => c.owner_id === offer.sender_id
    );

    const requestedCards = (offer.trade_offer_cards ?? []).filter(
      (c) => c.owner_id === offer.receiver_id
    );

    const cashTerms = offer.trade_cash_terms?.[0] ?? null;

    return (
      <TouchableOpacity
        onPress={() => router.push(`/offer?id=${offer.id}`)}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 14,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: theme.colors.border,
          ...cardShadow,
        }}
        activeOpacity={0.85}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>
            {isReceiver ? '📬 Offer received' : '📤 Offer sent'}
          </Text>
          <View style={{
            backgroundColor: statusColor + '20',
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderWidth: 1,
            borderColor: statusColor + '40',
          }}>
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '800' }}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* Cards being traded */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>

          {/* Sender's cards */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
              {isReceiver ? 'They offer:' : 'You offer:'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {offerCards.slice(0, 3).map((card) => {
                const preview = cardPreviews[card.card_id];
                return (
                  <View key={card.id} style={{ alignItems: 'center' }}>
                    {preview?.image_url ? (
                      <Image
                        source={{ uri: preview.image_url }}
                        style={{ width: 44, height: 62, borderRadius: 4 }}
                      />
                    ) : (
                      <View style={{
                        width: 44,
                        height: 62,
                        borderRadius: 4,
                        backgroundColor: theme.colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Text style={{ color: theme.colors.textSoft, fontSize: 8 }}>?</Text>
                      </View>
                    )}
                  </View>
                );
              })}
              {offerCards.length > 3 && (
                <View style={{
                  width: 44,
                  height: 62,
                  borderRadius: 4,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                    +{offerCards.length - 3}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Swap arrow */}
          <View style={{ alignItems: 'center', paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 22, color: theme.colors.textSoft }}>⇄</Text>
            {cashTerms && (
              <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '800', marginTop: 4 }}>
                £{Number(cashTerms.amount).toFixed(2)}
              </Text>
            )}
          </View>

          {/* Requested cards */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
              {isReceiver ? 'You give:' : 'They give:'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {requestedCards.slice(0, 3).map((card) => {
                const preview = cardPreviews[card.card_id];
                return (
                  <View key={card.id} style={{ alignItems: 'center' }}>
                    {preview?.image_url ? (
                      <Image
                        source={{ uri: preview.image_url }}
                        style={{ width: 44, height: 62, borderRadius: 4 }}
                      />
                    ) : (
                      <View style={{
                        width: 44,
                        height: 62,
                        borderRadius: 4,
                        backgroundColor: theme.colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Text style={{ color: theme.colors.textSoft, fontSize: 8 }}>?</Text>
                      </View>
                    )}
                  </View>
                );
              })}
              {requestedCards.length > 3 && (
                <View style={{
                  width: 44,
                  height: 62,
                  borderRadius: 4,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                    +{requestedCards.length - 3}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Message */}
        {offer.message && (
          <View style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontStyle: 'italic' }}>
              "{offer.message}"
            </Text>
          </View>
        )}

        {/* Progress for active trades */}
        {['accepted', 'payment_required', 'payment_sent', 'payment_confirmed', 'sent', 'received'].includes(offer.status) && (
          <View style={{
            flexDirection: 'row',
            gap: 6,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}>
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
            <ProgressPill label="Complete" done={offer.status === 'completed'} />
          </View>
        )}

        {/* Actions */}
        {isPending && isReceiver && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity
              onPress={() => handleAccept(offer.id)}
              style={{
                flex: 1,
                backgroundColor: '#10B981',
                borderRadius: 12,
                paddingVertical: 11,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>
                Accept
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleDecline(offer.id)}
              style={{
                flex: 1,
                backgroundColor: '#FEE2E2',
                borderRadius: 12,
                paddingVertical: 11,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#FCA5A5',
              }}
            >
              <Text style={{ color: '#991B1B', fontWeight: '900', fontSize: 13 }}>
                Decline
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isPending && !isReceiver && (
          <TouchableOpacity
            onPress={() => handleWithdraw(offer.id)}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              paddingVertical: 11,
              alignItems: 'center',
              marginTop: 4,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 13 }}>
              Withdraw Offer
            </Text>
          </TouchableOpacity>
        )}

        {/* Tap to negotiate hint for active offers */}
        {!isPending && !isCompleted && (
          <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' }}>
            Tap to negotiate →
          </Text>
        )}

        {/* Leave review prompt */}
        {isCompleted && (
          <TouchableOpacity
            onPress={() => router.push(`/offer/review?offerId=${offer.id}&reviewUserId=${isReceiver ? offer.sender_id : offer.receiver_id}`)}
            style={{
              backgroundColor: theme.colors.primary + '18',
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: 'center',
              marginTop: 8,
              borderWidth: 1,
              borderColor: theme.colors.primary,
            }}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }}>
              ⭐ Leave a Review
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // ===============================
  // RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: theme.colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 26 }}>‹</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '900' }}>
              Trade Offers
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
              Manage your incoming and outgoing offers
            </Text>
          </View>
        </View>

        {/* Segments */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {(
            [
              { key: 'received', label: 'Received', count: receivedOffers.length },
              { key: 'sent', label: 'Sent', count: sentOffers.length },
              { key: 'history', label: 'History', count: historyOffers.length },
            ] as { key: SegmentKey; label: string; count: number }[]
          ).map(({ key, label, count }) => {
            const active = segment === key;
            return (
              <Pressable
                key={key}
                onPress={() => setSegment(key)}
                style={{
                  flex: 1,
                  backgroundColor: active ? theme.colors.primary : theme.colors.card,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text style={{
                  color: active ? '#FFFFFF' : theme.colors.textSoft,
                  fontWeight: '800',
                  fontSize: 13,
                }}>
                  {label}
                </Text>
                <View style={{
                  marginTop: 4,
                  minWidth: 22,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: active ? 'rgba(255,255,255,0.2)' : theme.colors.surface,
                }}>
                  <Text style={{
                    color: active ? '#FFFFFF' : theme.colors.textSoft,
                    fontWeight: '900',
                    fontSize: 11,
                    textAlign: 'center',
                  }}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* List */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
              Loading offers...
            </Text>
          </View>
        ) : (
          <FlatList
            data={currentOffers}
            keyExtractor={(item) => item.id}
            renderItem={renderOffer}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={{
                backgroundColor: theme.colors.card,
                borderRadius: 16,
                padding: 24,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 6 }}>
                  {segment === 'received' ? 'No offers received' : segment === 'sent' ? 'No offers sent' : 'No trade history'}
                </Text>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center', fontSize: 13 }}>
                  {segment === 'received'
                    ? 'When someone sends you a trade offer it will appear here.'
                    : segment === 'sent'
                    ? 'Offers you send to other collectors will appear here.'
                    : 'Completed and declined offers will appear here.'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
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
  const bg = done
    ? '#10B981'
    : partial
    ? '#F59E0B'
    : theme.colors.surface;

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