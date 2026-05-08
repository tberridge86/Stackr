import { theme } from '../../lib/theme';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
  StyleSheet,
} from 'react-native';
import { Text } from '../../components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { createTradeOffer } from '../../lib/tradeOffers';
import { getCachedCardSync } from '../../lib/pokemonTcgCache';

// ===============================
// CONSTANTS
// ===============================

const PRICE_API_URL = process.env.EXPO_PUBLIC_PRICE_API_URL ?? '';
const MAX_OFFER_CARDS = 6;

// ===============================
// TYPES
// ===============================

type CashPayer = 'sender' | 'receiver';

type TradeCardOption = {
  id: string;
  card_id: string;
  set_id: string | null;
  name: string;
  image_url: string | null;
  set_name?: string | null;
  number?: string | null;
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

export default function NewOfferScreen() {
  const params = useLocalSearchParams<{
    listingId?: string;
    targetUserId?: string;
    cardId?: string;
    setId?: string;
  }>();

  const listingId = Array.isArray(params.listingId) ? params.listingId[0] : params.listingId;
  const targetUserId = Array.isArray(params.targetUserId) ? params.targetUserId[0] : params.targetUserId;
  const cardId = Array.isArray(params.cardId) ? params.cardId[0] : params.cardId;
  const setId = Array.isArray(params.setId) ? params.setId[0] : params.setId;

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [targetUserName, setTargetUserName] = useState<string | null>(null);
  const [targetCard, setTargetCard] = useState<TradeCardOption | null>(null);
  const [myTradeCards, setMyTradeCards] = useState<TradeCardOption[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  const [cashAmount, setCashAmount] = useState('');
  const [cashPayer, setCashPayer] = useState<CashPayer>('sender');
  const [paypalRecipient, setPaypalRecipient] = useState('');
  const [message, setMessage] = useState('');

  const cashAmountNumber = useMemo(() => {
    const cleaned = cashAmount.replace(/[£,]/g, '').trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [cashAmount]);

  const cashInvolved = cashAmountNumber > 0;

  useEffect(() => {
    loadScreen();
  }, []);

  // ===============================
  // LOAD
  // ===============================

  async function loadScreen() {
    try {
      setLoading(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        Alert.alert('Sign in required', 'You need to be signed in to make trade offers.');
        router.replace('/offer');
        return;
      }

      setCurrentUserId(user.id);

      if (!listingId || !targetUserId || !cardId) {
        Alert.alert('Missing trade details', 'This offer is missing listing information.');
        router.replace('/offer');
        return;
      }

      const [target, receiverProfile, ownCards] = await Promise.all([
        buildTargetCard(cardId, setId ?? null),
        supabase.from('profiles').select('collector_name').eq('id', targetUserId).maybeSingle(),
        fetchMyTradeCards(user.id),
      ]);

      setTargetCard(target);
      setTargetUserName(receiverProfile.data?.collector_name ?? null);
      setMyTradeCards(ownCards);
    } catch (error: any) {
      console.error('Failed to load offer screen:', error);
      Alert.alert('Could not load offer', error?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  // ===============================
  // BUILD TARGET CARD
  // ===============================

  async function buildTargetCard(
    cardIdValue: string,
    setIdValue: string | null
  ): Promise<TradeCardOption> {
    const cached = setIdValue
      ? (getCachedCardSync(setIdValue, cardIdValue) as any)
      : null;

    if (cached) {
      return {
        id: cardIdValue,
        card_id: cardIdValue,
        set_id: setIdValue ?? cached?.set?.id ?? null,
        name: cached?.name ?? cardIdValue,
        image_url: cached?.images?.small ?? cached?.images?.large ?? null,
        set_name: cached?.set?.name ?? null,
        number: cached?.number ?? null,
      };
    }

    const { data } = await supabase
      .from('card_previews')
      .select('card_id, name, image_url')
      .eq('card_id', cardIdValue)
      .maybeSingle();

    return {
      id: cardIdValue,
      card_id: cardIdValue,
      set_id: setIdValue ?? null,
      name: data?.name ?? cardIdValue,
      image_url: data?.image_url ?? null,
      set_name: null,
      number: null,
    };
  }

  // ===============================
  // FETCH MY TRADE CARDS
  // ===============================

  async function fetchMyTradeCards(userId: string): Promise<TradeCardOption[]> {
    const { data: flags, error: flagsError } = await supabase
      .from('user_card_flags')
      .select('id, card_id, set_id')
      .eq('user_id', userId)
      .eq('flag_type', 'trade')
      .order('created_at', { ascending: false });

    if (flagsError) throw flagsError;
    if (!flags || flags.length === 0) return [];

    const cardIds = flags.map((flag: any) => flag.card_id);

    const { data: previews, error: previewsError } = await supabase
      .from('card_previews')
      .select('card_id, name, image_url')
      .in('card_id', cardIds);

    if (previewsError) throw previewsError;

    const previewMap = new Map(
      (previews ?? []).map((preview: any) => [preview.card_id, preview])
    );

    return flags.map((flag: any) => {
      const preview = previewMap.get(flag.card_id) as any;
      const cached = flag.set_id
        ? (getCachedCardSync(flag.set_id, flag.card_id) as any)
        : null;

      return {
        id: flag.id,
        card_id: flag.card_id,
        set_id: flag.set_id ?? preview?.set_id ?? cached?.set?.id ?? null,
        name: preview?.name ?? cached?.name ?? flag.card_id,
        image_url:
          preview?.image_url ??
          cached?.images?.small ??
          cached?.images?.large ??
          null,
        set_name: preview?.set_name ?? cached?.set?.name ?? null,
        number: preview?.number ?? cached?.number ?? null,
      };
    });
  }

  // ===============================
  // TOGGLE CARD SELECTION
  // ===============================

  function toggleCard(cardIdValue: string) {
    setSelectedCardIds((current) => {
      if (current.includes(cardIdValue)) {
        return current.filter((id) => id !== cardIdValue);
      }
      if (current.length >= MAX_OFFER_CARDS) {
        Alert.alert(
          'Too many cards',
          `You can offer up to ${MAX_OFFER_CARDS} cards in a single trade.`
        );
        return current;
      }
      return [...current, cardIdValue];
    });
  }

  // ===============================
  // SEND OFFER
  // ===============================

  async function sendOffer() {
    try {
      if (!currentUserId || !targetUserId || !listingId || !cardId) {
        Alert.alert('Missing details', 'This offer is missing required trade information.');
        return;
      }

      if (selectedCardIds.length === 0 && !cashInvolved) {
        Alert.alert('Empty offer', 'Add at least one card or a cash amount.');
        return;
      }

      if (cashInvolved && !paypalRecipient.trim()) {
        Alert.alert(
          'PayPal details needed',
          'Add the PayPal.me username or PayPal email for the person receiving cash.'
        );
        return;
      }

      setSending(true);

      const selectedCards = myTradeCards.filter((card) =>
        selectedCardIds.includes(card.card_id)
      );

      const newOffer = await createTradeOffer({
        listingId,
        senderUserId: currentUserId,
        receiverUserId: targetUserId,
        requestedCards: [
          {
            cardId,
            setId: targetCard?.set_id ?? setId ?? null,
            quantity: 1,
          },
        ],
        offeredCards: selectedCards.map((card) => ({
          cardId: card.card_id,
          setId: card.set_id,
          quantity: 1,
        })),
        cash: cashInvolved
          ? {
              amount: cashAmountNumber,
              currency: 'GBP',
              payer: cashPayer,
              recipientPaypal: paypalRecipient.trim(),
              paymentStatus: 'not_sent',
            }
          : null,
        message: message.trim() || null,
      } as any);

      // Notify the receiver they have a new trade offer
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('collector_name')
        .eq('id', currentUserId)
        .maybeSingle();

      sendPushNotification('/api/notify/trade-offer', {
        recipientUserId: targetUserId,
        senderUsername: senderProfile?.collector_name ?? 'Someone',
        cardName: targetCard?.name ?? undefined,
      });

      const destination = newOffer?.id ? `/offer/${newOffer.id}?new=1` : '/offers';
      router.push(destination as any);
    } catch (error: any) {
      console.error('Failed to send trade offer:', error);
      Alert.alert('Could not send offer', error?.message ?? 'Something went wrong.');
    } finally {
      setSending(false);
    }
  }

  // ===============================
  // LOADING STATE
  // ===============================

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading offer...</Text>
      </View>
    );
  }

  // ===============================
  // RENDER
  // ===============================

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Make an Offer</Text>
      <Text style={styles.subtitle}>
        Choose cards, add cash if needed, and send your offer.
      </Text>

      {/* Card you want */}
      <Section title="Card you want">
        {targetCard ? (
          <View style={styles.cardRow}>
            {targetCard.image_url ? (
              <Image source={{ uri: targetCard.image_url }} style={styles.cardImage} />
            ) : (
              <View style={styles.cardImagePlaceholder} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{targetCard.name}</Text>
              <Text style={styles.cardMeta}>
                {targetCard.set_name ?? targetCard.set_id ?? 'Unknown set'}
                {targetCard.number ? ` · ${targetCard.number}` : ''}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.muted}>Target card could not be loaded.</Text>
        )}
      </Section>

      {/* Cards you are offering */}
      <Section title={`Cards you are offering (max ${MAX_OFFER_CARDS})`}>
        {myTradeCards.length === 0 ? (
          <Text style={styles.muted}>
            You have no cards currently marked for trade.
          </Text>
        ) : (
          <>
            {selectedCardIds.length > 0 && (
              <Text style={styles.selectedCount}>
                {selectedCardIds.length} / {MAX_OFFER_CARDS} selected
              </Text>
            )}

            {myTradeCards.map((card) => {
              const selected = selectedCardIds.includes(card.card_id);
              return (
                <TouchableOpacity
                  key={`${card.id}-${card.card_id}`}
                  onPress={() => toggleCard(card.card_id)}
                  style={[
                    styles.selectCardRow,
                    selected && styles.selectCardRowActive,
                  ]}
                >
                  {card.image_url ? (
                    <Image source={{ uri: card.image_url }} style={styles.smallCardImage} />
                  ) : (
                    <View style={styles.smallCardImagePlaceholder} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{card.name}</Text>
                    <Text style={styles.cardMeta}>
                      {card.set_name ?? card.set_id ?? 'Unknown set'}
                      {card.number ? ` · ${card.number}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.selectText, selected && styles.selectTextActive]}>
                    {selected ? '✓ Selected' : 'Add'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </Section>

      {/* Cash offer */}
      <Section title="Cash top-up (optional)">
        <TextInput
          value={cashAmount}
          onChangeText={setCashAmount}
          placeholder="Amount e.g. 15.00"
          placeholderTextColor={theme.colors.textSoft}
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <View style={styles.toggleRow}>
          <TouchableOpacity
            onPress={() => setCashPayer('sender')}
            style={[styles.toggleButton, cashPayer === 'sender' && styles.toggleButtonActive]}
          >
            <Text style={[styles.toggleText, cashPayer === 'sender' && styles.toggleTextActive]}>
              I pay cash
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setCashPayer('receiver')}
            style={[styles.toggleButton, cashPayer === 'receiver' && styles.toggleButtonActive]}
          >
            <Text style={[styles.toggleText, cashPayer === 'receiver' && styles.toggleTextActive]}>
              They pay cash
            </Text>
          </TouchableOpacity>
        </View>

        {cashInvolved && (
          <>
            <Text style={styles.paypalLabel}>
              PayPal details for{' '}
              {cashPayer === 'sender' ? 'the receiver' : 'you'}
            </Text>
            <TextInput
              value={paypalRecipient}
              onChangeText={setPaypalRecipient}
              placeholder="PayPal.me username or email"
              placeholderTextColor={theme.colors.textSoft}
              autoCapitalize="none"
              style={styles.input}
            />
          </>
        )}

        {cashInvolved && (
          <View style={styles.cashSummary}>
            <Text style={styles.cashSummaryText}>
              💰 {cashPayer === 'sender' ? 'You' : 'They'} pay{' '}
              £{cashAmountNumber.toFixed(2)} via PayPal
            </Text>
          </View>
        )}
      </Section>

      {/* Message */}
      <Section title="Message (optional)">
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Add a short message to introduce your offer..."
          placeholderTextColor={theme.colors.textSoft}
          multiline
          style={[styles.input, styles.messageInput]}
        />
      </Section>

      {/* Offer summary */}
      {(selectedCardIds.length > 0 || cashInvolved) && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Offer summary</Text>
          <Text style={styles.summaryText}>
            You want: {targetCard?.name ?? 'Unknown card'}
          </Text>
          {selectedCardIds.length > 0 && (
            <Text style={styles.summaryText}>
              You offer: {selectedCardIds.length} card{selectedCardIds.length !== 1 ? 's' : ''}
            </Text>
          )}
          {cashInvolved && (
            <Text style={styles.summaryText}>
              + £{cashAmountNumber.toFixed(2)} cash ({cashPayer === 'sender' ? 'you pay' : 'they pay'})
            </Text>
          )}
        </View>
      )}

      {/* Send button */}
      <TouchableOpacity
        onPress={sendOffer}
        disabled={sending}
        style={[styles.sendButton, sending && styles.disabled]}
      >
        {sending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.sendButtonText}>Send Offer</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ===============================
// SUB COMPONENTS
// ===============================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ===============================
// STYLES
// ===============================

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
  loadingText: {
    color: theme.colors.textSoft,
    marginTop: 12,
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 16,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 6,
  },
  subtitle: {
    color: theme.colors.textSoft,
    marginBottom: 20,
    lineHeight: 20,
  },
  section: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12,
  },
  selectedCount: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectCardRowActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '12',
  },
  cardImage: {
    width: 76,
    height: 106,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
  },
  cardImagePlaceholder: {
    width: 76,
    height: 106,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
  },
  smallCardImage: {
    width: 52,
    height: 72,
    borderRadius: 6,
    backgroundColor: theme.colors.surface,
  },
  smallCardImagePlaceholder: {
    width: 52,
    height: 72,
    borderRadius: 6,
    backgroundColor: theme.colors.surface,
  },
  cardName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  cardMeta: {
    color: theme.colors.textSoft,
    fontSize: 12,
    marginTop: 4,
  },
  muted: {
    color: theme.colors.textSoft,
    lineHeight: 20,
  },
  paypalLabel: {
    color: theme.colors.textSoft,
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  messageInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  toggleButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  toggleText: {
    color: theme.colors.textSoft,
    fontWeight: '800',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  selectText: {
    color: theme.colors.textSoft,
    fontWeight: '900',
    fontSize: 13,
  },
  selectTextActive: {
    color: theme.colors.primary,
    fontSize: 13,
  },
  cashSummary: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cashSummaryText: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  summaryBox: {
    backgroundColor: theme.colors.primary + '12',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  summaryTitle: {
    color: theme.colors.primary,
    fontWeight: '900',
    fontSize: 14,
    marginBottom: 6,
  },
  summaryText: {
    color: theme.colors.text,
    fontSize: 13,
    marginBottom: 4,
  },
  sendButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.6,
  },
});