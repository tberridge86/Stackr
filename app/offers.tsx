import { theme } from '../lib/theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { StackrPageTitle } from '../components/StackrScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { StackrBackButton } from '../components/StackrBackButton';
import { StackrCenterModal } from '../components/StackrModalSystem';
import {
  fetchMyTradeOffers,
  updateTradeOfferStatus,
  TradeOffer,
} from '../lib/tradeOffers';
import { fetchStackrCardRows } from '../lib/stackrDomainAdapter';

type SegmentKey = 'received' | 'sent' | 'history';
type OfferListConfirmAction = {
  type: 'accept' | 'decline' | 'withdraw';
  offerId: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  unavailable: 'Unavailable',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#F59E0B',
  accepted: '#10B981',
  declined: '#EF4444',
  cancelled: '#6B7280',
  disputed: '#B45309',
  unavailable: '#6B7280',
};

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

function getOfferListConfirmCopy(action: OfferListConfirmAction | null) {
  if (!action) return null;
  if (action.type === 'accept') {
    return {
      title: 'Accept offer?',
      body: 'This records the card-only agreement and updates the offer status.',
      actionLabel: 'Accept Offer',
      destructive: false,
    };
  }
  if (action.type === 'decline') {
    return {
      title: 'Decline offer?',
      body: 'The other collector will be told this offer was declined.',
      actionLabel: 'Decline',
      destructive: true,
    };
  }
  return {
    title: 'Withdraw offer?',
    body: 'This cancels your pending offer before the other collector accepts it.',
    actionLabel: 'Withdraw',
    destructive: true,
  };
}

export default function OffersScreen() {
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [segment, setSegment] = useState<SegmentKey>('received');
  const [cardPreviews, setCardPreviews] = useState<Record<string, any>>({});
  const [confirmAction, setConfirmAction] = useState<OfferListConfirmAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const authUserIdRef = useRef('');
  const authGenerationRef = useRef(0);

  const isCurrentIdentity = useCallback((userId: string, generation: number) => (
    authUserIdRef.current === userId && authGenerationRef.current === generation
  ), []);

  const bindIdentity = useCallback((userId: string) => {
    if (authUserIdRef.current === userId) return authGenerationRef.current;
    authUserIdRef.current = userId;
    authGenerationRef.current += 1;
    setOffers([]);
    setCardPreviews({});
    setCurrentUserId(userId);
    setConfirmAction(null);
    setConfirmBusy(false);
    setLoading(Boolean(userId));
    return authGenerationRef.current;
  }, []);

  // ===============================
  // LOAD
  // ===============================

  const load = useCallback(async (
    userId = authUserIdRef.current,
    generation = authGenerationRef.current,
  ) => {
    if (!userId || !isCurrentIdentity(userId, generation)) return;
    try {
      setLoading(true);

      const data = await fetchMyTradeOffers();
      if (!isCurrentIdentity(userId, generation)) return;
      setOffers(data);

      // Load card previews for all cards in all offers
      const allCardIds = Array.from(new Set(
        data.flatMap((offer) =>
          (offer.trade_offer_cards ?? []).map((c) => c.card_id)
        )
      ));

      if (allCardIds.length > 0) {
        const previews = await fetchStackrCardRows(allCardIds);

        const map: Record<string, any> = {};
        previews.forEach((card: any) => {
          map[card.id] = {
            card_id: card.id,
            name: card.name,
            image_url: card.image_small ?? card.image_large ?? null,
            set_name: card.set_name ?? card.set_id ?? null,
          };
        });

        if (!isCurrentIdentity(userId, generation)) return;
        setCardPreviews(map);
      } else {
        setCardPreviews({});
      }
    } catch (error) {
      if (!isCurrentIdentity(userId, generation)) return;
      console.log('Failed to load offers', error);
      setOffers([]);
      setCardPreviews({});
    } finally {
      if (isCurrentIdentity(userId, generation)) setLoading(false);
    }
  }, [isCurrentIdentity]);

  useEffect(() => {
    let mounted = true;
    let authEventEpoch = 0;

    const activate = (userId: string) => {
      if (!mounted) return;
      const generation = bindIdentity(userId);
      if (userId) void load(userId, generation);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventEpoch += 1;
      activate(session?.user?.id ?? '');
    });

    const initialEpoch = authEventEpoch;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted || initialEpoch !== authEventEpoch) return;
      if (error) {
        console.log('Offer account lookup failed', error);
        activate('');
        return;
      }
      activate(data.user?.id ?? '');
    });

    return () => {
      mounted = false;
      authGenerationRef.current += 1;
      subscription.unsubscribe();
    };
  }, [bindIdentity, load]);

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

  const handleAccept = (offerId: string) => {
    setConfirmAction({ type: 'accept', offerId });
  };

  const handleDecline = (offerId: string) => {
    setConfirmAction({ type: 'decline', offerId });
  };

  const handleWithdraw = (offerId: string) => {
    setConfirmAction({ type: 'withdraw', offerId });
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    const userId = authUserIdRef.current;
    const generation = authGenerationRef.current;
    if (!userId || !isCurrentIdentity(userId, generation)) return;

    try {
      setConfirmBusy(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id !== userId || !isCurrentIdentity(userId, generation)) return;
      if (action.type === 'accept') {
        await updateTradeOfferStatus(action.offerId, 'accepted');
      } else if (action.type === 'decline') {
        await updateTradeOfferStatus(action.offerId, 'declined');
      } else {
        await updateTradeOfferStatus(action.offerId, 'cancelled');
      }
      if (!isCurrentIdentity(userId, generation)) return;
      setConfirmAction(null);
      await load(userId, generation);
    } catch (error: any) {
      if (!isCurrentIdentity(userId, generation)) return;
      const fallback =
        action.type === 'accept'
          ? 'Could not accept offer.'
          : action.type === 'decline'
          ? 'Could not decline offer.'
          : 'Could not withdraw offer.';
      Alert.alert('Error', error?.message ?? fallback);
    } finally {
      if (isCurrentIdentity(userId, generation)) setConfirmBusy(false);
    }
  };

  // ===============================
  // RENDER OFFER CARD
  // ===============================

  const renderOffer = ({ item: offer }: { item: TradeOffer }) => {
    const isReceiver = offer.receiver_id === currentUserId;
    const isPending = offer.status === 'pending';
    const statusLabel = STATUS_LABEL[offer.status] ?? 'Unavailable';
    const statusColor = STATUS_COLOR[offer.status] ?? theme.colors.textSoft;

    const offerCards = (offer.trade_offer_cards ?? []).filter(
      (c) => c.owner_id === offer.sender_id
    );

    const requestedCards = (offer.trade_offer_cards ?? []).filter(
      (c) => c.owner_id === offer.receiver_id
    );

    return (
      <TouchableOpacity
        onPress={() => router.push(`/offer/${offer.id}` as any)}
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
        {offer.status === 'accepted' && (
          <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' }}>
            Tap to negotiate →
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const confirmCopy = getOfferListConfirmCopy(confirmAction);

  // ===============================
  // RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
      <StackrBackdrop />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <StackrBackButton onPress={() => router.back()} style={{ marginRight: 12 }} />

          <View style={{ flex: 1 }}>
            <StackrPageTitle title="Offers" accentText="ers" />
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
                  backgroundColor: active ? theme.colors.primary + '12' : theme.colors.card,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text style={{
                  color: active ? theme.colors.primary : theme.colors.textSoft,
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
                    color: active ? theme.colors.primary : theme.colors.textSoft,
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
                    ? 'When someone sends you a Market offer it will appear here.'
                    : segment === 'sent'
                    ? 'Offers you send to other collectors will appear here.'
                    : 'Accepted, declined, cancelled and disputed offers will appear here.'}
                </Text>
              </View>
            }
          />
        )}
      </View>

      <StackrCenterModal
        visible={Boolean(confirmCopy)}
        onClose={() => !confirmBusy && setConfirmAction(null)}
        dismissible={!confirmBusy}
        contentStyle={{ padding: 20 }}
      >
        {confirmCopy ? (
          <View style={{ gap: 14 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 18,
                alignSelf: 'center',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: confirmCopy.destructive ? '#FEE2E2' : theme.colors.primary + '12',
                borderWidth: 1,
                borderColor: confirmCopy.destructive ? '#FCA5A5' : theme.colors.primary + '28',
              }}
            >
              <Text style={{ color: confirmCopy.destructive ? '#991B1B' : theme.colors.primary, fontSize: 22, fontWeight: '900' }}>
                {confirmCopy.destructive ? '!' : 'OK'}
              </Text>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ color: theme.colors.text, fontSize: 21, lineHeight: 26, fontWeight: '900', textAlign: 'center' }}>
                {confirmCopy.title}
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' }}>
                {confirmCopy.body}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              <TouchableOpacity
                disabled={confirmBusy}
                onPress={() => setConfirmAction(null)}
                activeOpacity={0.82}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                }}
              >
                <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={confirmBusy}
                onPress={runConfirmedAction}
                activeOpacity={0.82}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: confirmCopy.destructive ? '#DC2626' : theme.colors.primary,
                }}
              >
                {confirmBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>
                    {confirmCopy.actionLabel}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </StackrCenterModal>
    </SafeAreaView>
  );
}
