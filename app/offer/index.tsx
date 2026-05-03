import { theme } from '../../lib/theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  fetchOfferEvents,
  sendCounterOffer,
  sendOfferMessage,
  TradeOfferEvent,
} from '../../lib/tradeOfferEvents';
import {
  updateTradeOfferStatus,
  markTradeSent,
  markTradeReceived,
  TradeOffer,
  TradeOfferCard,
  TradeCashTerms,
} from '../../lib/tradeOffers';

// ===============================
// CONSTANTS
// ===============================

const PRICE_API_URL = process.env.EXPO_PUBLIC_PRICE_API_URL ?? '';

// ===============================
// TYPES
// ===============================

type CardPreview = {
  card_id: string;
  name: string | null;
  image_url: string | null;
  set_name: string | null;
};

// ===============================
// HELPERS
// ===============================

const formatTime = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const getEventLabel = (eventType: string): string => {
  const labels: Record<string, string> = {
    offer_created: 'Offer created',
    counter_offer: 'Counter offer',
    pending: '⏳ Offer pending',
    accepted: '✅ Offer accepted',
    declined: '❌ Offer declined',
    cancelled: '🚫 Offer cancelled',
    sent: '📦 Cards sent',
    received: '📬 Cards received',
    completed: '🎉 Trade completed',
    disputed: '⚠️ Dispute raised',
    payment_required: '💳 Payment required',
    payment_sent: '💸 Payment sent',
    payment_confirmed: '✅ Payment confirmed',
  };
  return labels[eventType] ?? 'Update';
};

async function sendPushNotification(
  endpoint: string,
  payload: Record<string, any>
): Promise<void> {
  if (!PRICE_API_URL) return;
  try {
    await fetch(`${PRICE_API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.log(`Push notification failed (${endpoint}):`, err);
  }
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listRef = useRef<FlatList>(null);
  const offerId = String(id);

  const [offer, setOffer] = useState<TradeOffer | null>(null);
  const [offerCards, setOfferCards] = useState<TradeOfferCard[]>([]);
  const [cashTerms, setCashTerms] = useState<TradeCashTerms | null>(null);
  const [cardPreviews, setCardPreviews] = useState<Record<string, CardPreview>>({});
  const [events, setEvents] = useState<TradeOfferEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [message, setMessage] = useState('');
  const [counterAmount, setCounterAmount] = useState('');
  const [sending, setSending] = useState(false);

  // ===============================
  // DERIVED STATE
  // ===============================

  const offerStatus = offer?.status ?? 'pending';
  const isSender = offer?.sender_id === currentUserId;
  const isReceiver = offer?.receiver_id === currentUserId;

  const isPending = offerStatus === 'pending';
  const isAccepted = offerStatus === 'accepted';
  const isAcceptedOrBeyond = ['accepted', 'sent', 'received', 'completed'].includes(offerStatus);
  const isSentOrBeyond = ['sent', 'received', 'completed'].includes(offerStatus);
  const isReceivedOrBeyond = ['received', 'completed'].includes(offerStatus);
  const isCompleted = offerStatus === 'completed';
  const isDisputed = offerStatus === 'disputed';
  const isDeclinedOrCancelled = ['declined', 'cancelled'].includes(offerStatus);

  const mySentCards = offerCards.filter((c) => c.owner_id === currentUserId);
  const theirSentCards = offerCards.filter((c) => c.owner_id !== currentUserId);

  const iHaveSent = isSender ? offer?.sender_sent : offer?.receiver_sent;
  const theyHaveSent = isSender ? offer?.receiver_sent : offer?.sender_sent;
  const iHaveReceived = isSender ? offer?.sender_received : offer?.receiver_received;
  const theyHaveReceived = isSender ? offer?.receiver_received : offer?.sender_received;

  // ===============================
  // LOAD
  // ===============================

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? '');

      const [eventsData, offerResult] = await Promise.all([
        fetchOfferEvents(offerId),
        supabase
          .from('trade_offers')
          .select(`
            *,
            trade_offer_cards (*),
            trade_cash_terms (*)
          `)
          .eq('id', offerId)
          .maybeSingle(),
      ]);

      setEvents(eventsData ?? []);

      if (offerResult.data) {
        const offerData = offerResult.data as TradeOffer;
        setOffer(offerData);
        setOfferCards(offerData.trade_offer_cards ?? []);
        setCashTerms(offerData.trade_cash_terms?.[0] ?? null);

        const allCardIds = Array.from(new Set(
          (offerData.trade_offer_cards ?? []).map((c) => c.card_id)
        ));

        if (allCardIds.length > 0) {
          const { data: previews } = await supabase
            .from('card_previews')
            .select('card_id, name, image_url, set_name')
            .in('card_id', allCardIds);

          const previewMap: Record<string, CardPreview> = {};
          (previews ?? []).forEach((p: any) => {
            previewMap[p.card_id] = p;
          });
          setCardPreviews(previewMap);
        }
      }

      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 150);
    } catch (error: any) {
      console.log('Failed to load negotiation', error);
      Alert.alert('Could not load', error?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  // ===============================
  // REALTIME SUBSCRIPTION
  // ===============================

  useEffect(() => {
    if (!offerId) return;

    load();

    const channel = supabase
      .channel(`trade-offer-${offerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trade_offer_events',
          filter: `offer_id=eq.${offerId}`,
        },
        (payload) => {
          setEvents((prev) => {
            if (prev.some((e) => e.id === payload.new.id)) return prev;
            return [...prev, payload.new as TradeOfferEvent];
          });
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trade_offers',
          filter: `id=eq.${offerId}`,
        },
        (payload) => {
          if (payload.new) {
            setOffer((prev) => prev ? { ...prev, ...payload.new } : prev);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [offerId, load]);

  // ===============================
  // HELPERS
  // ===============================

  const getFirstCardName = (): string | undefined => {
    const firstCard = offerCards[0];
    if (!firstCard) return undefined;
    return cardPreviews[firstCard.card_id]?.name ?? undefined;
  };

  // ===============================
  // ACTIONS
  // ===============================

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    try {
      setSending(true);
      await sendOfferMessage(offerId, message.trim());
      setMessage('');
    } catch (error: any) {
      Alert.alert('Could not send', error?.message ?? 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  const handleCounter = async () => {
    const amount = counterAmount.trim() ? Number(counterAmount) : undefined;

    if (!message.trim() && amount === undefined) {
      Alert.alert('Counter offer', 'Add a note or cash amount first.');
      return;
    }

    if (counterAmount.trim() && Number.isNaN(amount)) {
      Alert.alert('Invalid amount', 'Enter a valid cash amount.');
      return;
    }

    try {
      setSending(true);
      await sendCounterOffer(
        offerId,
        message.trim() || 'Counter offer proposed.',
        amount
      );
      setMessage('');
      setCounterAmount('');
    } catch (error: any) {
      Alert.alert('Could not send counter', error?.message ?? 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  const handleAcceptOffer = async () => {
    try {
      setSending(true);
      await updateTradeOfferStatus(offerId, 'accepted', 'Offer accepted.');

      if (offer?.sender_id) {
        sendPushNotification('/api/notify/trade-status', {
          recipientUserId: offer.sender_id,
          status: 'accepted',
          cardName: getFirstCardName(),
        });
      }

      await load();
    } catch (error: any) {
      Alert.alert('Could not accept', error?.message ?? 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  const handleDeclineOffer = async () => {
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
              setSending(true);
              await updateTradeOfferStatus(offerId, 'declined', 'Offer declined.');

              if (offer?.sender_id) {
                sendPushNotification('/api/notify/trade-status', {
                  recipientUserId: offer.sender_id,
                  status: 'declined',
                  cardName: getFirstCardName(),
                });
              }

              await load();
            } catch (error: any) {
              Alert.alert('Error', error?.message ?? 'Could not decline.');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  const handleAcceptCounter = async (event: TradeOfferEvent) => {
    try {
      setSending(true);
      const note = `Counter accepted${
        event.proposed_cash_amount != null
          ? ` at £${Number(event.proposed_cash_amount).toFixed(2)}`
          : ''
      }.`;
      await updateTradeOfferStatus(offerId, 'accepted', note);

      if (event.user_id && event.user_id !== currentUserId) {
        sendPushNotification('/api/notify/trade-status', {
          recipientUserId: event.user_id,
          status: 'accepted',
          cardName: getFirstCardName(),
        });
      }

      await load();
    } catch (error: any) {
      Alert.alert('Could not accept counter', error?.message ?? 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  const handleMarkSent = async () => {
    try {
      setSending(true);
      await markTradeSent(offerId);

      const recipientUserId = isSender ? offer?.receiver_id : offer?.sender_id;
      if (recipientUserId) {
        sendPushNotification('/api/notify/trade-status', {
          recipientUserId,
          status: 'sent',
          cardName: getFirstCardName(),
        });
      }

      await load();
    } catch (error: any) {
      Alert.alert('Could not mark as sent', error?.message ?? 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  const handleMarkReceived = async () => {
    try {
      setSending(true);
      await markTradeReceived(offerId);

      const recipientUserId = isSender ? offer?.receiver_id : offer?.sender_id;
      if (recipientUserId) {
        sendPushNotification('/api/notify/trade-status', {
          recipientUserId,
          status: 'received',
          cardName: getFirstCardName(),
        });
      }

      await load();
    } catch (error: any) {
      Alert.alert('Could not mark as received', error?.message ?? 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  const handleRaiseDispute = async () => {
    Alert.alert(
      'Raise dispute',
      'Are you sure you want to raise a dispute? Use this only if there is a serious problem with the trade.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Raise Dispute',
          style: 'destructive',
          onPress: async () => {
            try {
              setSending(true);
              await updateTradeOfferStatus(offerId, 'disputed', 'Dispute raised.');
              await load();
            } catch (error: any) {
              Alert.alert('Error', error?.message ?? 'Could not raise dispute.');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  // ===============================
  // RENDER CARD CHIP
  // ===============================

  const renderCardChip = (card: TradeOfferCard) => {
    const preview = cardPreviews[card.card_id];
    return (
      <View
        key={card.id}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: 6,
          marginBottom: 4,
          marginRight: 4,
        }}
      >
        {preview?.image_url ? (
          <Image
            source={{ uri: preview.image_url }}
            style={{ width: 24, height: 34, borderRadius: 3 }}
          />
        ) : (
          <View style={{
            width: 24,
            height: 34,
            borderRadius: 3,
            backgroundColor: theme.colors.border,
          }} />
        )}
        <View>
          <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '700', maxWidth: 120 }} numberOfLines={1}>
            {preview?.name ?? card.card_id}
          </Text>
          {preview?.set_name && (
            <Text style={{ color: theme.colors.textSoft, fontSize: 10 }} numberOfLines={1}>
              {preview.set_name}
            </Text>
          )}
        </View>
      </View>
    );
  };

  // ===============================
  // RENDER EVENT
  // ===============================

  const renderEvent = ({ item }: { item: TradeOfferEvent }) => {
    const mine = item.user_id === currentUserId;
    const isSystem = !['message', 'counter_offer'].includes(item.event_type);

    if (isSystem) {
      return (
        <View style={styles.systemWrap}>
          <Text style={styles.systemText}>{getEventLabel(item.event_type)}</Text>
          {!!item.note && <Text style={styles.systemNote}>{item.note}</Text>}
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text style={[styles.bubbleType, mine ? styles.bubbleTypeMine : styles.bubbleTypeOther]}>
            {item.event_type === 'counter_offer' ? 'Counter offer' : mine ? 'You' : 'Them'}
          </Text>

          {!!item.note && (
            <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextOther]}>
              {item.note}
            </Text>
          )}

          {item.proposed_cash_amount != null && (
            <View style={[styles.cashPill, !mine && styles.cashPillOther]}>
              <Text style={[styles.cashPillText, !mine && styles.cashPillTextOther]}>
                💰 Cash: £{Number(item.proposed_cash_amount).toFixed(2)}
              </Text>
            </View>
          )}

          {item.event_type === 'counter_offer' &&
            !mine &&
            !isAcceptedOrBeyond &&
            !isDisputed && (
              <TouchableOpacity
                disabled={sending}
                onPress={() => handleAcceptCounter(item)}
                style={[styles.acceptCounterButton, sending && styles.disabled]}
              >
                <Text style={styles.acceptCounterText}>Accept Counter</Text>
              </TouchableOpacity>
            )}

          <Text style={[styles.timeText, mine ? styles.timeTextMine : styles.timeTextOther]}>
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  // ===============================
  // LOADING
  // ===============================

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading negotiation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Negotiation</Text>
            <Text style={styles.subtitle}>Private trade discussion</Text>
          </View>

          <View style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}>
            <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: '800' }}>
              {offerStatus.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Trade Summary */}
          {offer && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Trade Summary</Text>

              {mySentCards.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={styles.cardLabel}>You send:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {mySentCards.map(renderCardChip)}
                  </View>
                </View>
              )}

              {theirSentCards.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={styles.cardLabel}>They send:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {theirSentCards.map(renderCardChip)}
                  </View>
                </View>
              )}

              {cashTerms && (
                <View style={{
                  backgroundColor: '#FEF3C7',
                  borderRadius: 10,
                  padding: 10,
                  marginTop: 4,
                  borderWidth: 1,
                  borderColor: '#FDE68A',
                }}>
                  <Text style={{ color: '#92400E', fontWeight: '800', fontSize: 13 }}>
                    💰 £{Number(cashTerms.amount).toFixed(2)} cash —{' '}
                    {cashTerms.payer_id === currentUserId ? 'you pay' : 'they pay'}
                  </Text>
                  {cashTerms.paypal_me_username && (
                    <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
                      PayPal: paypal.me/{cashTerms.paypal_me_username}
                    </Text>
                  )}
                  {cashTerms.paypal_email && (
                    <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
                      PayPal email: {cashTerms.paypal_email}
                    </Text>
                  )}
                </View>
              )}

              {isReceiver && isPending && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <TouchableOpacity
                    onPress={handleAcceptOffer}
                    disabled={sending}
                    style={[{
                      flex: 1,
                      backgroundColor: '#10B981',
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                    }, sending && styles.disabled]}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14 }}>
                      ✓ Accept Offer
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleDeclineOffer}
                    disabled={sending}
                    style={[{
                      flex: 1,
                      backgroundColor: '#FEE2E2',
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#FCA5A5',
                    }, sending && styles.disabled]}
                  >
                    <Text style={{ color: '#991B1B', fontWeight: '900', fontSize: 14 }}>
                      ✕ Decline
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {isSender && isPending && (
                <TouchableOpacity
                  onPress={() => {
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
                              setSending(true);
                              await updateTradeOfferStatus(offerId, 'cancelled', 'Offer withdrawn.');
                              router.replace('/offers');
                            } catch (e: any) {
                              Alert.alert('Error', e?.message ?? 'Could not withdraw.');
                            } finally {
                              setSending(false);
                            }
                          },
                        },
                      ]
                    );
                  }}
                  disabled={sending}
                  style={[{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    marginTop: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }, sending && styles.disabled]}
                >
                  <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 13 }}>
                    Withdraw Offer
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Trade Progress */}
          {isAcceptedOrBeyond && !isDeclinedOrCancelled && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Trade Progress</Text>

              <ProgressStep label="Offer agreed" done={true} />
              <ProgressStep
                label="Cards sent"
                done={isSentOrBeyond}
                partial={
                  !isSentOrBeyond && (
                    (isSender && !!offer?.sender_sent) ||
                    (!isSender && !!offer?.receiver_sent)
                  )
                }
                partialLabel="Waiting for other side"
              />
              <ProgressStep
                label="Cards received"
                done={isReceivedOrBeyond}
                partial={
                  !isReceivedOrBeyond && (
                    (isSender && !!offer?.sender_received) ||
                    (!isSender && !!offer?.receiver_received)
                  )
                }
                partialLabel="Waiting for other side"
              />
              <ProgressStep label="Completed" done={isCompleted} />

              {isAccepted && (
                <View style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 10,
                  padding: 10,
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  gap: 4,
                }}>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                    SENT STATUS
                  </Text>
                  <Text style={{ color: iHaveSent ? '#10B981' : theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                    {iHaveSent ? '✅' : '⬜'} You — {iHaveSent ? 'sent' : 'not sent yet'}
                  </Text>
                  <Text style={{ color: theyHaveSent ? '#10B981' : theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                    {theyHaveSent ? '✅' : '⬜'} Them — {theyHaveSent ? 'sent' : 'not sent yet'}
                  </Text>
                </View>
              )}

              {isSentOrBeyond && !isCompleted && (
                <View style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 10,
                  padding: 10,
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  gap: 4,
                }}>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                    RECEIVED STATUS
                  </Text>
                  <Text style={{ color: iHaveReceived ? '#10B981' : theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                    {iHaveReceived ? '✅' : '⬜'} You — {iHaveReceived ? 'received' : 'not received yet'}
                  </Text>
                  <Text style={{ color: theyHaveReceived ? '#10B981' : theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                    {theyHaveReceived ? '✅' : '⬜'} Them — {theyHaveReceived ? 'received' : 'not received yet'}
                  </Text>
                </View>
              )}

              {!isCompleted && !isDisputed && (
                <View style={{ gap: 8, marginTop: 12 }}>
                  {isAccepted && !iHaveSent && (
                    <TouchableOpacity
                      disabled={sending}
                      onPress={handleMarkSent}
                      style={[{
                        backgroundColor: theme.colors.primary,
                        borderRadius: 12,
                        paddingVertical: 12,
                        alignItems: 'center',
                      }, sending && styles.disabled]}
                    >
                      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>
                        📦 Mark My Cards as Sent
                      </Text>
                    </TouchableOpacity>
                  )}

                  {isSentOrBeyond && !iHaveReceived && (
                    <TouchableOpacity
                      disabled={sending}
                      onPress={handleMarkReceived}
                      style={[{
                        backgroundColor: '#8B5CF6',
                        borderRadius: 12,
                        paddingVertical: 12,
                        alignItems: 'center',
                      }, sending && styles.disabled]}
                    >
                      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>
                        📬 Mark Cards as Received
                      </Text>
                    </TouchableOpacity>
                  )}

                  {isAcceptedOrBeyond && (
                    <TouchableOpacity
                      disabled={sending}
                      onPress={handleRaiseDispute}
                      style={[{
                        backgroundColor: '#FEE2E2',
                        borderRadius: 12,
                        paddingVertical: 10,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: '#FCA5A5',
                      }, sending && styles.disabled]}
                    >
                      <Text style={{ color: '#991B1B', fontWeight: '900', fontSize: 12 }}>
                        ⚠️ Raise Dispute
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {isDisputed && (
                <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '800', marginTop: 8 }}>
                  ⚠️ This trade has been marked as disputed.
                </Text>
              )}
            </View>
          )}

          {/* Completed */}
          {isCompleted && (
            <View style={[styles.card, {
              borderColor: '#10B981',
              backgroundColor: '#F0FDF4',
            }]}>
              <Text style={{ color: '#065F46', fontWeight: '900', fontSize: 16, marginBottom: 6 }}>
                🎉 Trade Complete!
              </Text>
              <Text style={{ color: '#065F46', fontSize: 13, lineHeight: 18, marginBottom: 14 }}>
                This trade has been completed successfully. Leave a review to help build trust in the community.
              </Text>
              <TouchableOpacity
                onPress={() => router.push(
                  `/offer/review?offerId=${offerId}&reviewUserId=${
                    isSender ? offer?.receiver_id : offer?.sender_id
                  }`
                )}
                style={{
                  backgroundColor: '#10B981',
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14 }}>
                  ⭐ Leave a Review
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Trust Notice */}
          <View style={styles.trustCard}>
            <Text style={styles.trustTitle}>Trading on Stackr</Text>
            <Text style={styles.trustText}>
              Stackr connects collectors to arrange trades directly. Keep all communication
              here so your trade history is recorded. Never share personal payment details
              outside of the agreed PayPal terms.
            </Text>
          </View>

          {/* Messages */}
          <FlatList
            ref={listRef}
            data={events}
            keyExtractor={(item) => item.id}
            renderItem={renderEvent}
            scrollEnabled={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 20 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                  No messages yet
                </Text>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 6, fontSize: 13 }}>
                  Start the negotiation with a message or counter offer.
                </Text>
              </View>
            }
          />
        </ScrollView>

        {/* Composer */}
        {!isCompleted && !isDisputed && !isDeclinedOrCancelled ? (
          <View style={styles.composerWrap}>
            {!isAcceptedOrBeyond && (
              <View style={styles.counterRow}>
                <TextInput
                  value={counterAmount}
                  onChangeText={setCounterAmount}
                  placeholder="Counter cash £"
                  placeholderTextColor={theme.colors.textSoft}
                  keyboardType="decimal-pad"
                  style={styles.counterInput}
                />
                <TouchableOpacity
                  onPress={handleCounter}
                  disabled={sending}
                  style={[styles.counterButton, sending && styles.disabled]}
                >
                  <Text style={styles.counterButtonText}>Counter</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.messageInputRow}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Message..."
                placeholderTextColor={theme.colors.textSoft}
                multiline
                style={styles.messageInput}
              />
              <TouchableOpacity
                onPress={handleSendMessage}
                disabled={sending || !message.trim()}
                style={[styles.sendButton, (sending || !message.trim()) && styles.disabled]}
              >
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.lockedComposer}>
            <Text style={styles.lockedText}>
              {isCompleted
                ? '🎉 This trade is completed.'
                : isDisputed
                ? '⚠️ This trade is disputed. Keep records of all messages.'
                : '🚫 This offer has been declined or cancelled.'}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ===============================
// SUB COMPONENTS
// ===============================

function ProgressStep({
  label,
  done,
  partial,
  partialLabel,
}: {
  label: string;
  done: boolean;
  partial?: boolean;
  partialLabel?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      <Text style={{ marginRight: 8, fontSize: 16 }}>
        {done ? '✅' : partial ? '🔄' : '⬜'}
      </Text>
      <View>
        <Text style={{
          color: done ? theme.colors.text : theme.colors.textSoft,
          fontSize: 13,
          fontWeight: done ? '900' : '700',
        }}>
          {label}
        </Text>
        {partial && partialLabel && (
          <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '600' }}>
            {partialLabel}
          </Text>
        )}
      </View>
    </View>
  );
}

// ===============================
// STYLES
// ===============================

const styles = {
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  keyboard: { flex: 1 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  loadingText: { color: theme.colors.textSoft, marginTop: 12 },

  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
  },
  backText: { color: theme.colors.text, fontSize: 30, lineHeight: 30, marginTop: -2 },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: '900' as const },
  subtitle: { color: theme.colors.textSoft, fontSize: 12, marginTop: 2 },

  card: {
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    color: theme.colors.text,
    fontWeight: '900' as const,
    fontSize: 15,
    marginBottom: 12,
  },
  cardLabel: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700' as const,
    marginBottom: 6,
  },

  trustCard: {
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  trustTitle: { color: theme.colors.text, fontWeight: '900' as const, fontSize: 13, marginBottom: 5 },
  trustText: { color: theme.colors.textSoft, fontSize: 11, lineHeight: 16 },

  messageRow: { flexDirection: 'row' as const, marginBottom: 10 },
  messageRowMine: { justifyContent: 'flex-end' as const },
  messageRowOther: { justifyContent: 'flex-start' as const },
  bubble: { maxWidth: '82%' as any, borderRadius: 18, padding: 12 },
  bubbleMine: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: theme.colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  bubbleType: { fontSize: 11, fontWeight: '900' as const, marginBottom: 4 },
  bubbleTypeMine: { color: '#FFFFFF', opacity: 0.85 },
  bubbleTypeOther: { color: theme.colors.primary },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleTextOther: { color: theme.colors.text },
  timeText: { fontSize: 10, alignSelf: 'flex-end' as const, marginTop: 6 },
  timeTextMine: { color: 'rgba(255,255,255,0.75)' },
  timeTextOther: { color: theme.colors.textSoft },

  cashPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  cashPillOther: { backgroundColor: theme.colors.primary + '18' },
  cashPillText: { color: '#FFFFFF', fontWeight: '900' as const, fontSize: 12 },
  cashPillTextOther: { color: theme.colors.primary },

  acceptCounterButton: {
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 8,
    alignItems: 'center' as const,
  },
  acceptCounterText: { color: '#FFFFFF', fontWeight: '900' as const, fontSize: 12 },

  systemWrap: {
    alignSelf: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  systemText: {
    color: theme.colors.text,
    fontWeight: '900' as const,
    fontSize: 12,
    textAlign: 'center' as const,
  },
  systemNote: {
    color: theme.colors.textSoft,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center' as const,
  },

  composerWrap: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  counterRow: { flexDirection: 'row' as const, gap: 8, marginBottom: 8 },
  counterInput: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  counterButton: {
    backgroundColor: '#FACC15',
    borderRadius: 14,
    paddingHorizontal: 14,
    justifyContent: 'center' as const,
  },
  counterButtonText: { color: '#111827', fontWeight: '900' as const },
  messageInputRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 8,
  },
  messageInput: {
    flex: 1,
    maxHeight: 110,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 11,
    textAlignVertical: 'top' as const,
  },
  sendButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendButtonText: { color: '#FFFFFF', fontWeight: '900' as const },
  lockedComposer: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  lockedText: {
    color: theme.colors.textSoft,
    textAlign: 'center' as const,
    fontWeight: '800' as const,
    fontSize: 12,
  },
  disabled: { opacity: 0.5 },
};