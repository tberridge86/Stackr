import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  fetchOfferEvents,
  sanitizeGate0TradeOfferEvent,
  TradeOfferEvent,
} from '../../lib/tradeOfferEvents';
import {
  fetchTradeOfferById,
  sanitizeGate0TradeOffer,
  updateTradeOfferStatus,
  TradeOffer,
  TradeOfferCard,
} from '../../lib/tradeOffers';
import { fetchStackrCardRows, fetchStackrPriceSnapshots } from '../../lib/stackrDomainAdapter';
import { attachLiveTcgdexCardReferences } from '../../lib/pokemonTcg';
import { hydrateCardReferenceRowMapWithLiveTcgdexReferences } from '../../lib/scanCardReferenceHydration';
import { stackrBrand } from '../../lib/stackrBrand';
import { StackrCenterModal } from '../../components/StackrModalSystem';
import { sanitizeGate0CommerceCopy } from '../../lib/gate0CommerceCopy';
import {
  CARD_ONLY_RELEASE_NOTICE,
  TRADE_PROBLEM_NOTICE,
  getCardOnlyOfferWarning,
  getOfferConfirmCopy,
  type OfferConfirmAction,
} from '../../lib/tradeOfferReview';

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

const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `£${value.toFixed(2)}`
    : '--';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

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
    pending: 'Offer pending',
    accepted: 'Offer accepted',
    declined: 'Offer declined',
    cancelled: 'Offer cancelled',
    disputed: 'Problem flagged',
  };
  return labels[eventType] ?? 'Update';
};

const OFFER_STATUS_LABEL: Record<string, string> = {
  pending: 'PENDING',
  accepted: 'ACCEPTED',
  declined: 'DECLINED',
  cancelled: 'CANCELLED',
  disputed: 'PROBLEM FLAGGED',
  unavailable: 'UNAVAILABLE',
};

// ===============================
// MAIN COMPONENT
// ===============================

export default function OfferDetailScreen() {
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const offerId = String(id);
  const [offer, setOffer] = useState<TradeOffer | null>(null);
  const [offerCards, setOfferCards] = useState<TradeOfferCard[]>([]);
  const [cardPreviews, setCardPreviews] = useState<Record<string, CardPreview>>({});
  const [events, setEvents] = useState<TradeOfferEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<OfferConfirmAction | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authUserIdRef = useRef('');
  const authGenerationRef = useRef(0);
  const { new: isNew } = useLocalSearchParams<{ new?: string }>();

  const isCurrentIdentity = useCallback((userId: string, generation: number) => (
    authUserIdRef.current === userId && authGenerationRef.current === generation
  ), []);

  const resetPrivateOfferState = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setOffer(null);
    setOfferCards([]);
    setCardPreviews({});
    setEvents([]);
    setToast(null);
    setSending(false);
    setConfirmAction(null);
  }, []);

  const bindIdentity = useCallback((userId: string) => {
    if (authUserIdRef.current === userId) return authGenerationRef.current;
    authUserIdRef.current = userId;
    authGenerationRef.current += 1;
    resetPrivateOfferState();
    setCurrentUserId(userId);
    setLoading(Boolean(userId));
    return authGenerationRef.current;
  }, [resetPrivateOfferState]);

  const showToast = useCallback((msg: string, userId: string, generation: number) => {
    if (!isCurrentIdentity(userId, generation)) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => {
      if (isCurrentIdentity(userId, generation)) setToast(null);
    }, 3000);
  }, [isCurrentIdentity]);

  // ===============================
  // DERIVED STATE
  // ===============================

  const offerStatus = offer?.status ?? 'pending';
  const isSender = offer?.sender_id === currentUserId;
  const isReceiver = offer?.receiver_id === currentUserId;

  const isPending = offerStatus === 'pending';
  const isAccepted = offerStatus === 'accepted';
  const isDisputed = offerStatus === 'disputed';
  const isTerminal = ['declined', 'cancelled', 'unavailable'].includes(offerStatus);
  const isParticipant = isSender || isReceiver;
  const displayEvents = events;

  const mySentCards = offerCards.filter((c) => c.owner_id === currentUserId);
  const theirSentCards = offerCards.filter((c) => c.owner_id !== currentUserId);
  const oneSidedWarning = isParticipant ? getCardOnlyOfferWarning(mySentCards, theirSentCards) : null;

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
  const mySideValue = myCardsValue;
  const theirSideValue = theirCardsValue;
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
  const confirmCopy = getOfferConfirmCopy(confirmAction, oneSidedWarning);

  // ===============================
  // LOAD
  // ===============================

  const load = useCallback(async (
    userId = authUserIdRef.current,
    generation = authGenerationRef.current,
  ) => {
    if (!userId || !offerId || !isCurrentIdentity(userId, generation)) return;
    try {
      setLoading(true);

      const [eventsData, offerData] = await Promise.all([
        fetchOfferEvents(offerId),
        fetchTradeOfferById(offerId),
      ]);
      if (!isCurrentIdentity(userId, generation)) return;
      if (
        !offerData
        || (offerData.sender_id !== userId && offerData.receiver_id !== userId)
      ) {
        throw new Error('This offer is not available for this account.');
      }

      let toastName: string | null = null;
      if (isNew === '1' && offerData.receiver_id) {
        const { data: receiverProfile } = await supabase
          .from('profile_public_directory')
          .select('collector_name')
          .eq('id', offerData.receiver_id)
          .maybeSingle();
        if (!isCurrentIdentity(userId, generation)) return;
        toastName = sanitizeGate0CommerceCopy(
          receiverProfile?.collector_name,
          'them',
        ) ?? 'them';
      }

      const allCardIds = Array.from(new Set(
        (offerData.trade_offer_cards ?? []).map((c) => c.card_id)
      ));
      const previewMap: Record<string, CardPreview> = {};

      if (allCardIds.length > 0) {
        const [cards, prices] = await Promise.all([
          fetchStackrCardRows(allCardIds).then((rows) => hydrateCardReferenceRowMapWithLiveTcgdexReferences(rows, attachLiveTcgdexCardReferences)),
          fetchStackrPriceSnapshots(allCardIds),
        ]);
        if (!isCurrentIdentity(userId, generation)) return;
        for (const legacyId of allCardIds) {
          const card = cards.get(legacyId) as any;
          if (!card) continue;
          previewMap[legacyId] = {
            card_id: legacyId,
            name: sanitizeGate0CommerceCopy(card.name, 'Collector card') ?? 'Collector card',
            image_url: card.image_small ?? card.image_large ?? null,
            set_name: sanitizeGate0CommerceCopy(
              card.set_name ?? card.raw_data?.set?.name ?? null,
              null,
            ),
            estimated_value: prices.get(legacyId)?.market_central ?? null,
          };
        }
      }

      if (!isCurrentIdentity(userId, generation)) return;
      setEvents(eventsData ?? []);
      setOffer(offerData);
      setOfferCards(offerData.trade_offer_cards ?? []);
      setCardPreviews(previewMap);
      if (toastName) showToast(`Offer sent to ${toastName}`, userId, generation);

    } catch (error: any) {
      if (!isCurrentIdentity(userId, generation)) return;
      console.log('Failed to load negotiation', error);
      resetPrivateOfferState();
      Alert.alert('Could not load', error?.message ?? 'Something went wrong.');
      router.replace('/offers');
    } finally {
      if (isCurrentIdentity(userId, generation)) setLoading(false);
    }
  }, [isCurrentIdentity, isNew, offerId, resetPrivateOfferState, showToast]);

  // ===============================
  // AUTH IDENTITY + LOAD
  // ===============================

  useEffect(() => {
    let mounted = true;
    let authEventEpoch = 0;

    const activate = (userId: string) => {
      if (!mounted) return;
      const generation = bindIdentity(userId);
      if (!userId) {
        setLoading(false);
        router.replace('/offers');
        return;
      }
      void load(userId, generation);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventEpoch += 1;
      activate(session?.user?.id ?? '');
    });

    const initialEpoch = authEventEpoch;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted || initialEpoch !== authEventEpoch) return;
      if (error) {
        console.log('Offer detail account lookup failed', error);
        activate('');
        return;
      }
      activate(data.user?.id ?? '');
    });

    return () => {
      mounted = false;
      authGenerationRef.current += 1;
      subscription.unsubscribe();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [bindIdentity, load]);

  // ===============================
  // REALTIME SUBSCRIPTION
  // ===============================

  useEffect(() => {
    const userId = authUserIdRef.current;
    const generation = authGenerationRef.current;
    if (
      !offerId
      || !userId
      || !offer
      || (offer.sender_id !== userId && offer.receiver_id !== userId)
      || !isCurrentIdentity(userId, generation)
    ) return;


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
          if (!isCurrentIdentity(userId, generation)) return;
          const event = sanitizeGate0TradeOfferEvent(payload.new as TradeOfferEvent);
          if (!event) return;
          setEvents((prev) => {
            if (prev.some((item) => item.id === event.id)) return prev;
            return [...prev, event];
          });
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
          if (!payload.new || !isCurrentIdentity(userId, generation)) return;
          const next = sanitizeGate0TradeOffer({ ...offer, ...payload.new } as TradeOffer);
          if (next.sender_id !== userId && next.receiver_id !== userId) {
            resetPrivateOfferState();
            router.replace('/offers');
            return;
          }
          setOffer(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isCurrentIdentity, offer, offerId, resetPrivateOfferState]);

  // ===============================
  // HELPERS
  // ===============================

  // ===============================
  // ACTIONS
  // ===============================

  const performAcceptOffer = async () => {
    const userId = authUserIdRef.current;
    const generation = authGenerationRef.current;
    if (!userId || offer?.receiver_id !== userId || !isCurrentIdentity(userId, generation)) return;
    try {
      setSending(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id !== userId || !isCurrentIdentity(userId, generation)) return;
      await updateTradeOfferStatus(offerId, 'accepted');
      if (!isCurrentIdentity(userId, generation)) return;
      await load(userId, generation);
    } catch (error: any) {
      if (!isCurrentIdentity(userId, generation)) return;
      Alert.alert('Could not accept', error?.message ?? 'Something went wrong.');
    } finally {
      if (isCurrentIdentity(userId, generation)) setSending(false);
    }
  };

  const performDeclineOffer = async () => {
    const userId = authUserIdRef.current;
    const generation = authGenerationRef.current;
    if (!userId || offer?.receiver_id !== userId || !isCurrentIdentity(userId, generation)) return;
    try {
      setSending(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id !== userId || !isCurrentIdentity(userId, generation)) return;
      await updateTradeOfferStatus(offerId, 'declined');
      if (!isCurrentIdentity(userId, generation)) return;
      await load(userId, generation);
    } catch (error: any) {
      if (!isCurrentIdentity(userId, generation)) return;
      Alert.alert('Error', error?.message ?? 'Could not decline.');
    } finally {
      if (isCurrentIdentity(userId, generation)) setSending(false);
    }
  };

  const performWithdrawOffer = async () => {
    const userId = authUserIdRef.current;
    const generation = authGenerationRef.current;
    if (!userId || offer?.sender_id !== userId || !isCurrentIdentity(userId, generation)) return;
    try {
      setSending(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id !== userId || !isCurrentIdentity(userId, generation)) return;
      await updateTradeOfferStatus(offerId, 'cancelled');
      if (!isCurrentIdentity(userId, generation)) return;
      router.replace('/offers');
    } catch (error: any) {
      if (!isCurrentIdentity(userId, generation)) return;
      Alert.alert('Error', error?.message ?? 'Could not withdraw.');
    } finally {
      if (isCurrentIdentity(userId, generation)) setSending(false);
    }
  };

  const handleAcceptOffer = () => setConfirmAction('accept');
  const handleDeclineOffer = () => setConfirmAction('decline');
  const handleWithdrawOffer = () => setConfirmAction('withdraw');
  const handleRaiseDispute = () => setConfirmAction('dispute');

  const performRaiseDispute = async () => {
    const userId = authUserIdRef.current;
    const generation = authGenerationRef.current;
    if (
      !userId
      || !offer
      || (offer.sender_id !== userId && offer.receiver_id !== userId)
      || !isCurrentIdentity(userId, generation)
    ) return;
    try {
      setSending(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id !== userId || !isCurrentIdentity(userId, generation)) return;
      await updateTradeOfferStatus(offerId, 'disputed');
      if (!isCurrentIdentity(userId, generation)) return;
      await load(userId, generation);
    } catch (error: any) {
      if (!isCurrentIdentity(userId, generation)) return;
      Alert.alert('Could not flag problem', error?.message ?? 'Something went wrong.');
    } finally {
      if (isCurrentIdentity(userId, generation)) setSending(false);
    }
  };

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
            {preview?.name ?? 'Collector card'}
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
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.systemText}>{getEventLabel(item.event_type)}</Text>
        {!!item.note && <Text style={styles.systemNote}>{item.note}</Text>}
        <Text style={styles.systemTime}>{formatTime(item.created_at)}</Text>
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
            <Text style={styles.subtitle}>Card-only offer status</Text>
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
              {OFFER_STATUS_LABEL[offerStatus] ?? 'UNAVAILABLE'}
            </Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 220 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {offer && (
            <View style={styles.reviewHeroCard}>
              <Text style={styles.heroEyebrow}>Review Offer</Text>
              <Text style={styles.heroTitle}>Check both sides</Text>
              <Text style={styles.heroSubtitle}>
                Review both sides before accepting this card-for-card offer.
              </Text>

              <View style={styles.dealSidesRow}>
                <View style={styles.dealSideCard}>
                  <View style={styles.dealSideHeader}>
                    <Text style={styles.dealSideTitle}>Your side</Text>
                    <Text style={styles.dealCountPill}>
                      {mySentCards.length} card{mySentCards.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  {renderMiniStack(mySentCards, 'No cards')}
                  <Text style={styles.dealMeta}>
                    {mySentCards.length > 0
                      ? mySentCards.map((card) => cardPreviews[card.card_id]?.name ?? 'Card').slice(0, 2).join(', ')
                      : 'No cards'}
                  </Text>
                </View>

                <View style={styles.dealSideCard}>
                  <View style={styles.dealSideHeader}>
                    <Text style={styles.dealSideTitle}>Their side</Text>
                    <Text style={styles.dealCountPill}>
                      {theirSentCards.length} card{theirSentCards.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  {renderMiniStack(theirSentCards, 'No cards')}
                  <Text style={styles.dealMeta}>
                    {theirSentCards.length > 0
                      ? theirSentCards.map((card) => cardPreviews[card.card_id]?.name ?? 'Card').slice(0, 2).join(', ')
                      : 'No cards'}
                  </Text>
                </View>
              </View>

              <View style={styles.valueComparisonCard}>
                <Text style={styles.valueComparisonTitle}>Total Value Comparison</Text>
                <View style={styles.valueComparisonGrid}>
                  <View style={[styles.valueComparisonCell, tradeFairnessState === 'your-heavy' && styles.valueComparisonCellWarn]}>
                    <Text style={styles.valueComparisonLabel}>Your side</Text>
                    <Text style={styles.valueComparisonAmount}>{money(mySideValue)}</Text>
                  </View>
                  <View style={[styles.valueComparisonCell, tradeFairnessState === 'their-heavy' && styles.valueComparisonCellWarn]}>
                    <Text style={styles.valueComparisonLabel}>Their side</Text>
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
                <Text style={[styles.fairnessStatus, (oneSidedWarning || tradeFairnessState !== 'balanced') && styles.fairnessStatusWarn]}>
                  {oneSidedWarning ? 'Check the card exchange' : fairnessStatus}
                </Text>
                <Text accessibilityRole={oneSidedWarning ? 'alert' : undefined} style={styles.fairnessCopy}>
                  {oneSidedWarning ?? fairnessCopy}
                </Text>
              </View>

              {isReceiver && isPending && (
                <View style={styles.reviewActionRow}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Accept trade"
                    accessibilityState={{ disabled: sending, busy: sending }}
                    onPress={handleAcceptOffer}
                    disabled={sending}
                    style={[styles.primaryWideButton, styles.reviewActionButton, sending && styles.disabled]}
                  >
                    <Text style={styles.primaryWideButtonText}>Accept Trade</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Decline offer"
                    accessibilityState={{ disabled: sending }}
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
                  accessibilityRole="button"
                  accessibilityLabel="Withdraw offer"
                  accessibilityState={{ disabled: sending }}
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
                  <Text style={styles.cardLabel}>You offer:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {mySentCards.map(renderCardChip)}
                  </View>
                </View>
              )}

              {theirSentCards.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={styles.cardLabel}>They offer:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {theirSentCards.map(renderCardChip)}
                  </View>
                </View>
              )}

            </View>
          )}

          {isParticipant && isAccepted && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Flag a problem"
              accessibilityState={{ disabled: sending }}
              onPress={handleRaiseDispute}
              disabled={sending}
              style={[styles.secondaryWideButton, { marginHorizontal: 12 }, sending && styles.disabled]}
            >
              <Text style={styles.secondaryWideButtonText}>Flag a problem</Text>
            </TouchableOpacity>
          )}

          {isDisputed && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Problem flagged</Text>
              <Text style={styles.trustText}>
                {TRADE_PROBLEM_NOTICE}
              </Text>
            </View>
          )}

          {/* Trust Notice */}
          <View style={styles.trustCard}>
            <Text style={styles.trustTitle}>Trading on Stackr</Text>
            <Text style={styles.trustText}>
              {CARD_ONLY_RELEASE_NOTICE}
            </Text>
          </View>

          {/* Offer updates */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            {displayEvents.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 20 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                  No offer updates yet
                </Text>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 6, fontSize: 13 }}>
                  Card selections and offer status changes appear here.
                </Text>
              </View>
            ) : (
              displayEvents.map((event) => (
                <React.Fragment key={event.id}>
                  {renderEvent({ item: event })}
                </React.Fragment>
              ))
            )}
          </View>
        </ScrollView>

        {isTerminal ? (
          <View style={styles.lockedComposer}>
            <Text style={styles.lockedText}>
              {offerStatus === 'unavailable'
                ? 'This legacy offer is unavailable in the current beta.'
                : 'This offer has been declined or cancelled.'}
            </Text>
          </View>
        ) : null}
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
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityState={{ disabled: sending }}
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
                accessibilityRole="button"
                accessibilityLabel={confirmCopy.actionLabel}
                accessibilityState={{ disabled: sending, busy: sending }}
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
    minHeight: 44,
    minWidth: 44,
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
    minHeight: 44,
    minWidth: 44,
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
  systemTime: { color: theme.colors.textSoft, fontSize: 10, marginTop: 2, textAlign: 'center' as const },
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
