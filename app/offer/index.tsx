import { theme } from '../../lib/theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
} from '../../lib/tradeOfferEvents';
import { updateTradeOfferStatus } from '../../lib/tradeOffers';

type TradeStatus = 'shipped' | 'received' | 'completed' | 'disputed';

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listRef = useRef<FlatList>(null);

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [message, setMessage] = useState('');
  const [counterAmount, setCounterAmount] = useState('');
  const [sending, setSending] = useState(false);

  const offerId = String(id);

  const latestStatus =
    events
      .filter((event) =>
        ['accepted', 'shipped', 'received', 'completed', 'disputed'].includes(
          event.event_type
        )
      )
      .at(-1)?.event_type ?? 'negotiating';

  const isAcceptedOrBeyond = ['accepted', 'shipped', 'received', 'completed'].includes(
    latestStatus
  );
  const isShippedOrBeyond = ['shipped', 'received', 'completed'].includes(latestStatus);
  const isReceivedOrBeyond = ['received', 'completed'].includes(latestStatus);
  const isCompleted = latestStatus === 'completed';
  const isDisputed = latestStatus === 'disputed';

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id ?? '');

      const data = await fetchOfferEvents(offerId);
      setEvents(data ?? []);

      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 150);
    } catch (error: any) {
      console.log('Failed to load negotiation', error);
      Alert.alert(
        'Could not load negotiation',
        error?.message ?? 'Something went wrong.'
      );
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useEffect(() => {
    if (!offerId) return;

    load();

    const channel = supabase
      .channel(`trade-offer-events-${offerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trade_offer_events',
          filter: `offer_id=eq.${offerId}`,
        },
        (payload) => {
          const newEvent = payload.new;

          setEvents((prev) => {
            const alreadyExists = prev.some((event) => event.id === newEvent.id);
            if (alreadyExists) return prev;
            return [...prev, newEvent];
          });

          setTimeout(() => {
            listRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [offerId, load]);

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      setSending(true);
      await sendOfferMessage(offerId, message.trim());
      setMessage('');
    } catch (error: any) {
      Alert.alert('Could not send message', error?.message ?? 'Something went wrong.');
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

  const handleTradeStatus = async (status: TradeStatus, note: string) => {
    try {
      setSending(true);
      await updateTradeOfferStatus(offerId, status, note);
      await sendOfferMessage(offerId, note);
    } catch (error: any) {
      Alert.alert('Could not update trade', error?.message ?? 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  const handleAcceptCounter = async (event: any) => {
    try {
      setSending(true);

      const note = `Counter accepted${
        event.proposed_cash_amount != null
          ? ` at £${Number(event.proposed_cash_amount).toFixed(2)}`
          : ''
      }.`;

      await updateTradeOfferStatus(offerId, 'accepted', note);
      await sendOfferMessage(offerId, note);
    } catch (error: any) {
      Alert.alert('Could not accept counter', error?.message ?? 'Something went wrong.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const getEventLabel = (eventType: string) => {
    switch (eventType) {
      case 'offer_created':
        return 'Offer created';
      case 'counter_offer':
        return 'Counter offer';
      case 'accepted':
        return 'Accepted';
      case 'shipped':
        return 'Shipped';
      case 'received':
        return 'Received';
      case 'completed':
        return 'Completed';
      case 'declined':
        return 'Declined';
      case 'disputed':
        return 'Disputed';
      default:
        return 'Message';
    }
  };

  const renderEvent = ({ item }: { item: any }) => {
    const mine = item.user_id === currentUserId;
    const isSystem = item.event_type !== 'message' && item.event_type !== 'counter_offer';

    if (isSystem) {
      return (
        <View style={styles.systemWrap}>
          <Text style={styles.systemText}>{getEventLabel(item.event_type)}</Text>
          {!!item.note && <Text style={styles.systemNote}>{item.note}</Text>}
        </View>
      );
    }

    return (
      <View
        style={[
          styles.messageRow,
          mine ? styles.messageRowMine : styles.messageRowOther,
        ]}
      >
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text
            style={[
              styles.bubbleType,
              mine ? styles.bubbleTypeMine : styles.bubbleTypeOther,
            ]}
          >
            {item.event_type === 'counter_offer'
              ? 'Counter offer'
              : mine
                ? 'You'
                : 'Them'}
          </Text>

          {!!item.note && (
            <Text
              style={[
                styles.bubbleText,
                mine ? styles.bubbleTextMine : styles.bubbleTextOther,
              ]}
            >
              {item.note}
            </Text>
          )}

          {item.proposed_cash_amount != null && (
            <View style={styles.cashPill}>
              <Text style={styles.cashPillText}>
                Cash proposed: £{Number(item.proposed_cash_amount).toFixed(2)}
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

          <Text
            style={[
              styles.timeText,
              mine ? styles.timeTextMine : styles.timeTextOther,
            ]}
          >
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

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

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Negotiation</Text>
            <Text style={styles.subtitle}>Private trade discussion</Text>
          </View>
        </View>

        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>Trade Progress</Text>

          <ProgressItem label="Offer agreed" active={isAcceptedOrBeyond} />
          <ProgressItem label="Shipped" active={isShippedOrBeyond} />
          <ProgressItem label="Received" active={isReceivedOrBeyond} />
          <ProgressItem label="Completed" active={isCompleted} />

          {!isCompleted && !isDisputed && (
            <View style={styles.progressActions}>
              {isAcceptedOrBeyond && !isShippedOrBeyond && (
                <TouchableOpacity
                  disabled={sending}
                  onPress={() =>
                    handleTradeStatus('shipped', 'Trade marked as shipped.')
                  }
                  style={[styles.progressActionButton, sending && styles.disabled]}
                >
                  <Text style={styles.progressActionText}>Mark Shipped</Text>
                </TouchableOpacity>
              )}

              {isShippedOrBeyond && !isReceivedOrBeyond && (
                <TouchableOpacity
                  disabled={sending}
                  onPress={() =>
                    handleTradeStatus('received', 'Trade marked as received.')
                  }
                  style={[styles.progressActionButton, sending && styles.disabled]}
                >
                  <Text style={styles.progressActionText}>Mark Received</Text>
                </TouchableOpacity>
              )}

              {isReceivedOrBeyond && !isCompleted && (
                <TouchableOpacity
                  disabled={sending}
                  onPress={() =>
                    handleTradeStatus('completed', 'Trade completed.')
                  }
                  style={[styles.progressActionButton, sending && styles.disabled]}
                >
                  <Text style={styles.progressActionText}>Complete Trade</Text>
                </TouchableOpacity>
              )}

              {isAcceptedOrBeyond && !isCompleted && (
                <TouchableOpacity
                  disabled={sending}
                  onPress={() =>
                    handleTradeStatus('disputed', 'Trade marked as disputed.')
                  }
                  style={[styles.disputeButton, sending && styles.disabled]}
                >
                  <Text style={styles.disputeButtonText}>Raise Dispute</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {isDisputed && (
            <Text style={styles.disputeText}>This trade has been marked as disputed.</Text>
          )}
        </View>

        <View style={styles.trustCard}>
          <Text style={styles.trustTitle}>Trading on Stackr</Text>
          <Text style={styles.trustText}>
            Stackr connects collectors to arrange trades. Items are exchanged directly between users.
          </Text>
          <Text style={styles.trustText}>
            Please confirm card condition, agree details clearly, and only trade when you’re comfortable.
          </Text>
          <Text style={styles.trustText}>
            Keep all messages inside Stackr so your trade history is recorded.
          </Text>
        </View>

        <FlatList
          ref={listRef}
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEvent}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyText}>
                Start the negotiation with a message or counter offer.
              </Text>
            </View>
          }
        />

        {!isCompleted && !isDisputed ? (
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
                style={[
                  styles.sendButton,
                  (sending || !message.trim()) && styles.disabled,
                ]}
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
                : 'This trade is disputed. Keep records of all messages.'}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProgressItem({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={styles.progressItem}>
      <Text style={styles.progressIcon}>{active ? '✅' : '⬜'}</Text>
      <Text style={active ? styles.progressTextActive : styles.progressText}>
        {label}
      </Text>
    </View>
  );
}

const styles = {
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  keyboard: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
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
  backText: {
    color: theme.colors.text,
    fontSize: 30,
    lineHeight: 30,
    marginTop: -2,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900' as const,
  },
  subtitle: {
    color: theme.colors.textSoft,
    fontSize: 12,
    marginTop: 2,
  },

  progressCard: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  progressTitle: {
    color: theme.colors.text,
    fontWeight: '900' as const,
    fontSize: 14,
    marginBottom: 10,
  },
  progressItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 6,
  },
  progressIcon: { marginRight: 8 },
  progressText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  progressTextActive: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900' as const,
  },
  progressActions: {
    marginTop: 8,
    gap: 8,
  },
  progressActionButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center' as const,
  },
  progressActionText: {
    color: '#FFFFFF',
    fontWeight: '900' as const,
    fontSize: 12,
  },
  disputeButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  disputeButtonText: {
    color: '#991B1B',
    fontWeight: '900' as const,
    fontSize: 12,
  },
  disputeText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800' as const,
    marginTop: 6,
  },

  trustCard: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  trustTitle: {
    color: theme.colors.text,
    fontWeight: '900' as const,
    fontSize: 13,
    marginBottom: 5,
  },
  trustText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },

  listContent: { padding: 16, paddingBottom: 20 },
  messageRow: { flexDirection: 'row' as const, marginBottom: 10 },
  messageRowMine: { justifyContent: 'flex-end' as const },
  messageRowOther: { justifyContent: 'flex-start' as const },
  bubble: {
    maxWidth: '82%' as const,
    borderRadius: 18,
    padding: 12,
  },
  bubbleMine: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: theme.colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  bubbleType: {
    fontSize: 11,
    fontWeight: '900' as const,
    marginBottom: 4,
  },
  bubbleTypeMine: { color: '#FFFFFF', opacity: 0.85 },
  bubbleTypeOther: { color: theme.colors.primary },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleTextOther: { color: theme.colors.text },
  timeText: {
    fontSize: 10,
    alignSelf: 'flex-end' as const,
    marginTop: 6,
  },
  timeTextMine: { color: 'rgba(255,255,255,0.75)' },
  timeTextOther: { color: theme.colors.textSoft },

  cashPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  cashPillText: {
    color: '#FFFFFF',
    fontWeight: '900' as const,
    fontSize: 12,
  },

  acceptCounterButton: {
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 8,
    alignItems: 'center' as const,
  },
  acceptCounterText: {
    color: '#FFFFFF',
    fontWeight: '900' as const,
    fontSize: 12,
  },

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

  emptyWrap: { alignItems: 'center' as const, paddingTop: 80 },
  emptyTitle: {
    color: theme.colors.text,
    fontWeight: '900' as const,
    fontSize: 18,
  },
  emptyText: {
    color: theme.colors.textSoft,
    textAlign: 'center' as const,
    marginTop: 8,
    lineHeight: 20,
  },

  composerWrap: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  counterRow: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 8,
  },
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
  counterButtonText: {
    color: '#111827',
    fontWeight: '900' as const,
  },
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
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '900' as const,
  },
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