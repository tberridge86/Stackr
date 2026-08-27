import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { PRICE_API_URL, TRADE_CASH_TERMS_ENABLED } from '../../lib/config';
import { fetchStackrCardRows, fetchStackrPriceSnapshots } from '../../lib/stackrDomainAdapter';
import { stackrBrand } from '../../lib/stackrBrand';
import { StackrCenterModal } from '../../components/StackrModalSystem';

// ===============================
// CONSTANTS
// ===============================

// ===============================
// TYPES
// ===============================

type CardPreview = {
  card_id: string;
  name: string | null;
  image_url: string | null;
  set_name: string | null;
  estimated_value?: number | null;
};

type OfferConfirmAction = 'accept' | 'decline' | 'withdraw' | 'dispute';

const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `£${value.toFixed(2)}`
    : '--';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function getOfferConfirmCopy(action: OfferConfirmAction | null) {
  if (!action) return null;
  if (action === 'accept') {
    return {
      title: 'Accept trade?',
      body: 'This records the deal and moves both collectors into the protected trade flow.',
      actionLabel: 'Accept Trade',
      destructive: false,
    };
  }
  if (action === 'decline') {
    return {
      title: 'Decline offer?',
      body: 'This closes the pending offer and lets the other collector know.',
      actionLabel: 'Decline',
      destructive: true,
    };
  }
  if (action === 'withdraw') {
    return {
      title: 'Withdraw offer?',
      body: 'This cancels your pending offer before it is accepted.',
      actionLabel: 'Withdraw',
      destructive: true,
    };
  }
  return {
    title: 'Raise dispute?',
    body: 'Use this only when there is a serious problem with the trade. The trade will be marked as disputed.',
    actionLabel: 'Raise Dispute',
    destructive: true,
  };
}

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
    pending: 'Offer pending',
    accepted: 'Offer accepted',
    declined: 'Offer declined',
    cancelled: 'Offer cancelled',
    sent: 'Cards sent',
    received: 'Cards received',
    completed: 'Trade completed',
    disputed: 'Dispute raised',
    payment_required: 'Payment required',
    payment_sent: 'Payment sent',
    payment_confirmed: 'Payment confirmed',
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
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const offerId = String(id);
  const insets = useSafeAreaInsets();

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
  const [toast, setToast] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<OfferConfirmAction | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { new: isNew } = useLocalSearchParams<{ new?: string }>();

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

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
  const cashAmount = TRADE_CASH_TERMS_ENABLED ? Number(cashTerms?.amount ?? 0) : 0;
  const myCardsValue = useMemo(
    () => mySentCards.reduce((total, card) => {
      const quantity = Number(card.quantity ?? 1) || 1;
      return total + (cardPreviews[card.card_id]?.estimated_value ?? 0) * quantity;
    }, 0),
    [cardPreviews, mySentCards]
  );
  const theirCardsValue = useMemo(
    () => theirSentCards.reduce((total, card) => {
      const quantity = Number(card.quantity ?? 1) || 1;
      return total + (cardPreviews[card.card_id]?.estimated_value ?? 0) * quantity;
    }, 0),
    [cardPreviews, theirSentCards]
  );
  const mySideValue = myCardsValue + (cashTerms?.payer_id === currentUserId ? cashAmount : 0);
  const theirSideValue = theirCardsValue + (cashTerms && cashTerms.payer_id !== currentUserId ? cashAmount : 0);
  const tradeValueDifference = mySideValue - theirSideValue;
  const absoluteTradeDifference = Math.abs(tradeValueDifference);
  const comparisonBase = Math.max(mySideValue, theirSideValue, 1);
  const tradeDifferencePercent = Math.min(100, (absoluteTradeDifference / comparisonBase) * 100);
  const tradeFairnessState =
    absoluteTradeDifference < 2 || tradeDifferencePercent <= 8
      ? 'balanced'
      : tradeValueDifference > 0
        ? 'your-heavy'
        : 'their-heavy';
  const fairnessMarkerPercent = clamp(50 - (tradeValueDifference / comparisonBase) * 44, 6, 94);
  const fairnessStatus =
    tradeFairnessState === 'balanced'
      ? 'Balanced'
      : tradeFairnessState === 'your-heavy'
        ? 'Your side is heavier'
        : 'Their side is heavier';
  const fairnessCopy =
    tradeFairnessState === 'balanced'
      ? 'Both sides are close enough to feel fair.'
      : tradeFairnessState === 'your-heavy'
        ? `You are sending about ${money(absoluteTradeDifference)} more.`
        : `They are sending about ${money(absoluteTradeDifference)} more.`;
  const fairnessColor = tradeFairnessState === 'balanced' ? theme.colors.primary : '#F59E0B';
  const confirmCopy = getOfferConfirmCopy(confirmAction);

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

        if (isNew === '1' && offerData.receiver_id) {
          const { data: receiverProfile } = await supabase
            .from('profile_public_directory')
            .select('collector_name')
            .eq('id', offerData.receiver_id)
            .maybeSingle();
          const name = receiverProfile?.collector_name ?? 'them';
          showToast(`Offer sent to ${name}`);
        }

        const allCardIds = Array.from(new Set(
          (offerData.trade_offer_cards ?? []).map((c) => c.card_id)
        ));

        if (allCardIds.length > 0) {
          const [cards, prices] = await Promise.all([
            fetchStackrCardRows(allCardIds),
            fetchStackrPriceSnapshots(allCardIds),
          ]);
          const previewMap: Record<string, CardPreview> = {};
          for (const legacyId of allCardIds) {
            const card = cards.get(legacyId) as any;
            if (!card) continue;
            previewMap[legacyId] = {
              card_id: legacyId,
              name: card.name ?? null,
              image_url: card.image_small ?? card.image_large ?? null,
              set_name: card.set_name ?? card.raw_data?.set?.name ?? null,
              estimated_value: prices.get(legacyId)?.market_central ?? null,
            };
          }

          setCardPreviews(previewMap);
        }
      }

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 150);
    } catch (error: any) {
      console.log('Failed to load negotiation', error);
      Alert.alert('Could not load', error?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [isNew, offerId]);

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
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
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
    const amount = TRADE_CASH_TERMS_ENABLED && counterAmount.trim()
      ? Number(counterAmount)
      : undefined;

    if (!message.trim() && amount === undefined) {
      Alert.alert('Counter offer', 'Add a note first.');
      return;
    }

    if (TRADE_CASH_TERMS_ENABLED && counterAmount.trim() && Number.isNaN(amount)) {
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

  const performAcceptOffer = async () => {
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

  const performDeclineOffer = async () => {
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
  };

  const performWithdrawOffer = async () => {
    try {
      setSending(true);
      await updateTradeOfferStatus(offerId, 'cancelled', 'Offer withdrawn.');
      router.replace('/offers');
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not withdraw.');
    } finally {
      setSending(false);
    }
  };

  const handleAcceptOffer = () => setConfirmAction('accept');
  const handleDeclineOffer = () => setConfirmAction('decline');
  const handleWithdrawOffer = () => setConfirmAction('withdraw');

  const handleAcceptCounter = async (event: TradeOfferEvent) => {
    if (!TRADE_CASH_TERMS_ENABLED && Number(event.proposed_cash_amount ?? 0) > 0) {
      Alert.alert('Cash terms unavailable', 'This release supports card-for-card counter offers only.');
      return;
    }

    try {
      setSending(true);
      const note = `Counter accepted${
        TRADE_CASH_TERMS_ENABLED && event.proposed_cash_amount != null
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

  const performRaiseDispute = async () => {
    try {
      setSending(true);
      await updateTradeOfferStatus(offerId, 'disputed', 'Dispute raised.');
      await load();
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not raise dispute.');
    } finally {
      setSending(false);
    }
  };

  const handleRaiseDispute = () => setConfirmAction('dispute');

  const runConfirmedOfferAction = async () => {
    const action = confirmAction;
    if (!action) return;

    setConfirmAction(null);
    if (action === 'accept') {
      await performAcceptOffer();
    } else if (action === 'decline') {
      await performDeclineOffer();
    } else if (action === 'withdraw') {
      await performWithdrawOffer();
    } else {
      await performRaiseDispute();
    }
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
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: 10,
          marginBottom: 6,
          marginRight: 6,
        }}
      >
        {preview?.image_url ? (
          <Image
            source={{ uri: preview.image_url }}
            style={{ width: 54, height: 75, borderRadius: 5 }}
            resizeMode="contain"
          />
        ) : (
          <View style={{
            width: 54,
            height: 75,
            borderRadius: 5,
            backgroundColor: theme.colors.border,
          }} />
        )}
        <View>
          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700', maxWidth: 140 }} numberOfLines={2}>
            {preview?.name ?? card.card_id}
          </Text>
          {preview?.set_name && (
            <Text style={{ color: theme.colors.textSoft, fontSize: 11 }} numberOfLines={1}>
              {preview.set_name}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderMiniStack = (cards: TradeOfferCard[], emptyLabel: string) => {
    const displayCards = cards.slice(0, 3);
    return (
      <View style={styles.miniStack}>
        {displayCards.length > 0 ? (
          displayCards.map((card, index) => {
            const preview = cardPreviews[card.card_id];
            return preview?.image_url ? (
              <Image
                key={card.id}
                source={{ uri: preview.image_url }}
                style={[
                  styles.miniStackCard,
                  {
                    left: 22 + index * 18,
                    transform: [{ rotate: `${(index - 1) * 5}deg` }],
                  },
                ]}
                resizeMode="cover"
              />
            ) : (
              <View
                key={card.id}
                style={[
                  styles.miniStackCard,
                  styles.miniStackPlaceholder,
                  { left: 22 + index * 18 },
                ]}
              />
            );
          })
        ) : (
          <View style={styles.emptyMiniStack}>
            <Text style={styles.emptyMiniStackText}>{emptyLabel}</Text>
          </View>
        )}
        {cards.length > 1 && (
          <View style={styles.stackCountBadge}>
            <Text style={styles.stackCountText}>x{cards.length}</Text>
          </View>
        )}
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

          {TRADE_CASH_TERMS_ENABLED && item.proposed_cash_amount != null && (
            <View style={[styles.cashPill, !mine && styles.cashPillOther]}>
              <Text style={[styles.cashPillText, !mine && styles.cashPillTextOther]}>
                Cash: £{Number(item.proposed_cash_amount).toFixed(2)}
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
          <View style={{ flex: 1 }}>
            <Image source={stackrBrand.wordmark} style={styles.headerLogo} resizeMode="contain" />
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
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 220 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {!TRADE_CASH_TERMS_ENABLED && (
            <View style={{
              backgroundColor: '#FEF3C7',
              borderColor: '#F59E0B',
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              marginHorizontal: 16,
              marginBottom: 12,
            }}>
              <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '900' }}>
                CARD-ONLY TRADE BETA
              </Text>
              <Text style={{ color: '#92400E', fontSize: 12, lineHeight: 17, marginTop: 3 }}>
                Cash top-ups and payment terms are hidden for this release.
              </Text>
            </View>
          )}

          {offer && (
            <View style={styles.reviewHeroCard}>
              <Text style={styles.heroEyebrow}>Review Deal</Text>
              <Text style={styles.heroTitle}>Almost there!</Text>
              <Text style={styles.heroSubtitle}>
                Review both sides before accepting, sending, or tracking this trade.
              </Text>

              <View style={styles.dealSidesRow}>
                <View style={styles.dealSideCard}>
                  <View style={styles.dealSideHeader}>
                    <Text style={styles.dealSideTitle}>You send</Text>
                    <Text style={styles.dealCountPill}>
                      {mySentCards.length} card{mySentCards.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  {renderMiniStack(mySentCards, 'No cards')}
                  <Text style={styles.dealMeta}>
                    {mySentCards.length > 0
                      ? mySentCards.map((card) => cardPreviews[card.card_id]?.name ?? 'Card').slice(0, 2).join(', ')
                      : 'Message only'}
                  </Text>
                </View>

                <View style={styles.dealSideCard}>
                  <View style={styles.dealSideHeader}>
                    <Text style={styles.dealSideTitle}>You receive</Text>
                    <Text style={styles.dealCountPill}>
                      {theirSentCards.length} card{theirSentCards.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  {renderMiniStack(theirSentCards, 'No cards')}
                  <Text style={styles.dealMeta}>
                    {theirSentCards.length > 0
                      ? theirSentCards.map((card) => cardPreviews[card.card_id]?.name ?? 'Card').slice(0, 2).join(', ')
                      : 'Message only'}
                  </Text>
                </View>
              </View>

              {TRADE_CASH_TERMS_ENABLED && cashTerms && (
                <View style={styles.cashAdjustmentCard}>
                  <View style={styles.cashIcon}>
                    <Text style={styles.cashIconText}>£</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cashAdjustmentTitle}>Cash adjustment</Text>
                    <Text style={styles.cashAdjustmentSub}>
                      {cashTerms.payer_id === currentUserId ? 'You pay' : 'They pay'}
                    </Text>
                  </View>
                  <Text style={styles.cashAdjustmentAmount}>
                    £{Number(cashTerms.amount).toFixed(2)}
                  </Text>
                </View>
              )}

              <View style={styles.valueComparisonCard}>
                <Text style={styles.valueComparisonTitle}>Total Value Comparison</Text>
                <View style={styles.valueComparisonGrid}>
                  <View style={[styles.valueComparisonCell, tradeFairnessState === 'your-heavy' && styles.valueComparisonCellWarn]}>
                    <Text style={styles.valueComparisonLabel}>You send</Text>
                    <Text style={styles.valueComparisonAmount}>{money(mySideValue)}</Text>
                  </View>
                  <View style={[styles.valueComparisonCell, tradeFairnessState === 'their-heavy' && styles.valueComparisonCellWarn]}>
                    <Text style={styles.valueComparisonLabel}>You receive</Text>
                    <Text style={styles.valueComparisonAmount}>{money(theirSideValue)}</Text>
                  </View>
                  <View style={styles.valueComparisonCell}>
                    <Text style={styles.valueComparisonLabel}>Difference</Text>
                    <Text style={styles.valueComparisonAmount}>{money(absoluteTradeDifference)}</Text>
                  </View>
                </View>
                <View style={styles.fairnessBar}>
                  <View style={styles.fairnessLeft} />
                  <View style={styles.fairnessRight} />
                  <View
                    style={[
                      styles.fairnessKnob,
                      { left: `${fairnessMarkerPercent}%`, borderColor: fairnessColor },
                    ]}
                  />
                </View>
                <Text style={[styles.fairnessStatus, tradeFairnessState !== 'balanced' && styles.fairnessStatusWarn]}>
                  {fairnessStatus}
                </Text>
                <Text style={styles.fairnessCopy}>{fairnessCopy}</Text>
              </View>

              {isReceiver && isPending && (
                <View style={styles.reviewActionRow}>
                  <TouchableOpacity
                    onPress={handleAcceptOffer}
                    disabled={sending}
                    style={[styles.primaryWideButton, styles.reviewActionButton, sending && styles.disabled]}
                  >
                    <Text style={styles.primaryWideButtonText}>Accept Trade</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleDeclineOffer}
                    disabled={sending}
                    style={[styles.secondaryWideButton, styles.reviewActionButton, sending && styles.disabled]}
                  >
                    <Text style={styles.secondaryWideButtonText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isSender && isPending && (
                <TouchableOpacity
                  onPress={handleWithdrawOffer}
                  disabled={sending}
                  style={[styles.secondaryWideButton, sending && styles.disabled]}
                >
                  <Text style={styles.secondaryWideButtonText}>Withdraw Offer</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Offer Summary */}
          {offer && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Offer Summary</Text>

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

              {TRADE_CASH_TERMS_ENABLED && cashTerms && (
                <View style={{
                  backgroundColor: '#FEF3C7',
                  borderRadius: 10,
                  padding: 10,
                  marginTop: 4,
                  borderWidth: 1,
                  borderColor: '#FDE68A',
                }}>
                  <Text style={{ color: '#92400E', fontWeight: '800', fontSize: 13 }}>
                    £{Number(cashTerms.amount).toFixed(2)} cash -{' '}
                    {cashTerms.payer_id === currentUserId ? 'you pay' : 'they pay'}
                  </Text>
                  <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
                    Payment method: Stripe
                  </Text>
                  {cashTerms.payment_status && (
                    <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
                      Status: {cashTerms.payment_status.replace('_', ' ')}
                    </Text>
                  )}
                </View>
              )}

            </View>
          )}

          {/* Trade Progress */}
          {isAcceptedOrBeyond && !isDeclinedOrCancelled && (
            <View style={styles.card}>
              <View style={styles.progressHeader}>
                <View style={styles.progressShield}>
                  <Text style={styles.progressShieldText}>OK</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.progressTitle}>Trade Progress</Text>
                  <Text style={styles.progressSub}>
                    Your trade is protected until both sides confirm.
                  </Text>
                </View>
              </View>

              <View style={styles.progressTimeline}>
                <ProgressStep label="Offer accepted" done={true} />
                <ProgressStep label="Condition check" done={isAcceptedOrBeyond} />
                <ProgressStep label="Both sides confirmed" done={isAcceptedOrBeyond} />
                <ProgressStep
                  label="Cards sent"
                  done={isSentOrBeyond}
                  partial={!isSentOrBeyond && !!iHaveSent}
                  partialLabel="Waiting for other side"
                />
                <ProgressStep
                  label="Cards received"
                  done={isReceivedOrBeyond}
                  partial={!isReceivedOrBeyond && !!iHaveReceived}
                  partialLabel="Waiting for confirmation"
                />
                <ProgressStep label="Trade completed" done={isCompleted} />
              </View>

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
                    {iHaveSent ? 'OK' : '-'} You - {iHaveSent ? 'sent' : 'not sent yet'}
                  </Text>
                  <Text style={{ color: theyHaveSent ? '#10B981' : theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                    {theyHaveSent ? 'OK' : '-'} Them - {theyHaveSent ? 'sent' : 'not sent yet'}
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
                    {iHaveReceived ? 'OK' : '-'} You - {iHaveReceived ? 'received' : 'not received yet'}
                  </Text>
                  <Text style={{ color: theyHaveReceived ? '#10B981' : theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                    {theyHaveReceived ? 'OK' : '-'} Them - {theyHaveReceived ? 'received' : 'not received yet'}
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
                        Mark My Cards as Sent
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
                        Mark Cards as Received
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
                        Raise Dispute
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {isDisputed && (
                <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '800', marginTop: 8 }}>
                  This trade has been marked as disputed.
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
                Trade Complete!
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
                  Leave a Review
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Trust Notice */}
          <View style={styles.trustCard}>
            <Text style={styles.trustTitle}>Trading on Stackr</Text>
            <Text style={styles.trustText}>
              Stackr connects collectors to arrange trades directly. Keep all communication
              here so your trade history is recorded. This release supports card-for-card trades only;
              do not arrange cash top-ups in chat.
            </Text>
          </View>

          {/* Messages */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            {events.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 20 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                  No messages yet
                </Text>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 6, fontSize: 13 }}>
                  Start the negotiation with a message or counter offer.
                </Text>
              </View>
            ) : (
              events.map((event) => (
                <React.Fragment key={event.id}>
                  {renderEvent({ item: event })}
                </React.Fragment>
              ))
            )}
          </View>
        </ScrollView>

        {/* Composer */}
        {!isCompleted && !isDisputed && !isDeclinedOrCancelled ? (
          <View style={[styles.composerWrap, { bottom: Math.max(insets.bottom + 25, 32) }]}>
            {!isAcceptedOrBeyond && (
              <View style={styles.counterRow}>
                {TRADE_CASH_TERMS_ENABLED ? (
                  <TextInput
                    value={counterAmount}
                    onChangeText={setCounterAmount}
                    placeholder="Counter cash £"
                    placeholderTextColor={theme.colors.textSoft}
                    keyboardType="decimal-pad"
                    style={styles.counterInput}
                  />
                ) : null}
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
                ? 'This trade is completed.'
                : isDisputed
                ? 'This trade is disputed. Keep records of all messages.'
                : 'This offer has been declined or cancelled.'}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <StackrCenterModal
        visible={Boolean(confirmCopy)}
        onClose={() => !sending && setConfirmAction(null)}
        dismissible={!sending}
        contentStyle={{ padding: 20 }}
      >
        {confirmCopy ? (
          <View style={{ gap: 14 }}>
            <View
              style={{
                width: 50,
                height: 50,
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
                disabled={sending}
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
                disabled={sending}
                onPress={runConfirmedOfferAction}
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
                {sending ? (
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

      {toast && (
        <View style={{
          position: 'absolute',
          bottom: 80,
          left: 20,
          right: 20,
          backgroundColor: theme.colors.primary,
          borderRadius: 14,
          paddingVertical: 12,
          paddingHorizontal: 16,
          alignItems: 'center',
          elevation: 6,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
        }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{toast}</Text>
        </View>
      )}
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
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
      <Text style={{ marginRight: 12, fontSize: 16, width: 30, textAlign: 'center' }}>
        {done ? 'OK' : partial ? '...' : '-'}
      </Text>
      <View style={{ flex: 1 }}>
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

function makeStyles(theme: any) {
  return {
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  keyboard: { flex: 1 },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  loadingText: { color: theme.colors.textSoft, marginTop: 12 },

  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 4,
    marginTop: -24,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  headerLogo: {
    width: 128,
    height: 40,
    marginBottom: 4,
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
  reviewHeroCard: {
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: theme.colors.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#6D4AFF',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroEyebrow: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '900' as const,
    marginBottom: 4,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900' as const,
  },
  heroSubtitle: {
    color: theme.colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 14,
  },
  dealSidesRow: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  dealSideCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dealSideHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  dealSideTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900' as const,
  },
  dealCountPill: {
    color: theme.colors.primary,
    backgroundColor: theme.colors.primary + '14',
    borderRadius: 999,
    overflow: 'hidden' as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '900' as const,
  },
  miniStack: {
    height: 112,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  miniStackCard: {
    position: 'absolute' as const,
    top: 4,
    width: 66,
    height: 94,
    borderRadius: 8,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  miniStackPlaceholder: {
    backgroundColor: theme.colors.primary + '18',
  },
  emptyMiniStack: {
    width: 78,
    height: 94,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.card,
  },
  emptyMiniStackText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800' as const,
  },
  stackCountBadge: {
    position: 'absolute' as const,
    right: 8,
    bottom: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stackCountText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900' as const,
  },
  dealMeta: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700' as const,
    minHeight: 30,
  },
  cashAdjustmentCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cashIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cashIconText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900' as const,
  },
  cashAdjustmentTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900' as const,
  },
  cashAdjustmentSub: {
    color: theme.colors.textSoft,
    fontSize: 12,
    marginTop: 2,
  },
  cashAdjustmentAmount: {
    color: '#0EA371',
    fontSize: 18,
    fontWeight: '900' as const,
  },
  valueComparisonCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  valueComparisonTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900' as const,
    marginBottom: 10,
  },
  valueComparisonGrid: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 14,
  },
  valueComparisonCell: {
    flex: 1,
    minHeight: 64,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center' as const,
  },
  valueComparisonCellWarn: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFF7ED',
  },
  valueComparisonLabel: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800' as const,
    marginBottom: 5,
  },
  valueComparisonAmount: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900' as const,
  },
  fairnessBar: {
    height: 8,
    borderRadius: 999,
    overflow: 'visible' as const,
    flexDirection: 'row' as const,
    marginBottom: 10,
  },
  fairnessLeft: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  fairnessRight: {
    flex: 1,
    backgroundColor: '#F59E0B',
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  fairnessKnob: {
    position: 'absolute' as const,
    left: '50%' as any,
    top: -6,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: theme.colors.primary,
  },
  fairnessStatus: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
  },
  fairnessStatusWarn: {
    color: '#B45309',
  },
  fairnessCopy: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center' as const,
    marginTop: 4,
  },
  reviewActionRow: {
    flexDirection: 'row' as const,
    gap: 10,
    marginTop: 14,
  },
  reviewActionButton: {
    flex: 1,
    marginTop: 0,
  },
  primaryWideButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center' as const,
    marginTop: 14,
  },
  primaryWideButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
  },
  secondaryWideButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center' as const,
    marginTop: 14,
    borderWidth: 1,
    borderColor: theme.colors.primary + '55',
  },
  secondaryWideButtonText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '900' as const,
  },
  progressHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 16,
  },
  progressShield: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  progressShieldText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900' as const,
  },
  progressTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900' as const,
  },
  progressSub: {
    color: theme.colors.textSoft,
    fontSize: 13,
    marginTop: 2,
  },
  progressTimeline: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    position: 'absolute' as const,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    zIndex: 20,
    elevation: 20,
  },
  counterRow: { flexDirection: 'row' as const, gap: 8, marginBottom: 6 },
  counterInput: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  counterButton: {
    backgroundColor: '#FACC15',
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 46,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  counterButtonText: { color: '#111827', fontWeight: '900' as const, fontSize: 14 },
  messageInputRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 8,
  },
  messageInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    textAlignVertical: 'top' as const,
  },
  sendButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 13,
    minHeight: 48,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sendButtonText: { color: '#FFFFFF', fontWeight: '900' as const, fontSize: 14 },
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
  }; // end of return
} // end of makeStyles
