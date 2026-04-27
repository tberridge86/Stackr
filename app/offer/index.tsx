import { theme } from '../../lib/theme';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  fetchMyTradeOffers,
  openPaypalPayment,
  updateCashPaymentStatus,
  updateTradeOfferStatus,
} from '../../lib/tradeOffers';
import { supabase } from '../../lib/supabase';

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

export default function OffersScreen() {
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const loadOffers = async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      setCurrentUserId(user?.id ?? null);

      if (!user) {
        setOffers([]);
        return;
      }

      const data = await fetchMyTradeOffers();
      setOffers(data ?? []);
    } catch (error: any) {
      console.log('Failed to load offers', error);
      Alert.alert(
        'Could not load offers',
        error?.message ?? 'Something went wrong.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadOffers();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOffers();
  };

  const doStatusUpdate = async (offerId: string, status: any, note?: string) => {
    try {
      await updateTradeOfferStatus(offerId, status, note);
      await loadOffers();
    } catch (error: any) {
      console.log('Failed to update offer', error);
      Alert.alert(
        'Could not update offer',
        error?.message ?? 'Something went wrong.'
      );
    }
  };

  const doPaymentStatusUpdate = async (
    offerId: string,
    paymentStatus: 'required' | 'sent' | 'confirmed' | 'failed'
  ) => {
    try {
      await updateCashPaymentStatus(offerId, paymentStatus);
      await loadOffers();
    } catch (error: any) {
      console.log('Failed to update payment', error);
      Alert.alert(
        'Could not update payment',
        error?.message ?? 'Something went wrong.'
      );
    }
  };

  const handlePayPal = async (offer: any) => {
    try {
      const cash = Array.isArray(offer.trade_cash_terms)
        ? offer.trade_cash_terms[0]
        : offer.trade_cash_terms;

      if (!cash) {
        Alert.alert('No cash payment', 'This offer has no cash payment terms.');
        return;
      }

      await openPaypalPayment({
        paypalMeUsername: cash.paypal_me_username,
        paypalEmail: cash.paypal_email,
        amount: Number(cash.amount),
      });
    } catch (error: any) {
      console.log('Failed to open PayPal', error);
      Alert.alert(
        'Could not open PayPal',
        error?.message ?? 'Something went wrong.'
      );
    }
  };

  const renderOffer = ({ item }: { item: any }) => {
    const isSender = currentUserId === item.sender_id;
    const isReceiver = currentUserId === item.receiver_id;

    const cards = Array.isArray(item.trade_offer_cards)
      ? item.trade_offer_cards
      : [];

    const cash = Array.isArray(item.trade_cash_terms)
      ? item.trade_cash_terms[0]
      : item.trade_cash_terms;

    const offeredCards = cards.filter(
      (card: any) => card.owner_id === item.sender_id
    );

    const requestedCards = cards.filter(
      (card: any) => card.owner_id === item.receiver_id
    );

    return (
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 14,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: theme.colors.border,
          ...cardShadow,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 17,
                fontWeight: '900',
              }}
            >
              {isSender
                ? 'Offer Sent'
                : isReceiver
                  ? 'Offer Received'
                  : 'Trade Offer'}
            </Text>

            <Text
              style={{
                color: theme.colors.textSoft,
                marginTop: 4,
                fontSize: 12,
              }}
            >
              Status: {item.status}
            </Text>
          </View>

          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 5,
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text
              style={{
                color: theme.colors.primary,
                fontWeight: '900',
                fontSize: 11,
              }}
            >
              {item.status}
            </Text>
          </View>
        </View>

        <View style={{ marginBottom: 10 }}>
          <Text
            style={{
              color: theme.colors.secondary,
              fontWeight: '900',
              marginBottom: 4,
            }}
          >
            Requested
          </Text>

          {requestedCards.length ? (
            requestedCards.map((card: any) => (
              <Text
                key={`requested-${card.id}`}
                style={{
                  color: theme.colors.text,
                  fontSize: 13,
                  marginBottom: 2,
                }}
              >
                {card.card_id}
              </Text>
            ))
          ) : (
            <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
              No requested cards
            </Text>
          )}
        </View>

        <View style={{ marginBottom: 10 }}>
          <Text
            style={{
              color: '#16A34A',
              fontWeight: '900',
              marginBottom: 4,
            }}
          >
            Offered
          </Text>

          {offeredCards.length ? (
            offeredCards.map((card: any) => (
              <Text
                key={`offered-${card.id}`}
                style={{
                  color: theme.colors.text,
                  fontSize: 13,
                  marginBottom: 2,
                }}
              >
                {card.card_id}
              </Text>
            ))
          ) : (
            <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
              No offered cards
            </Text>
          )}
        </View>

        {cash ? (
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              padding: 10,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
              Cash: £{Number(cash.amount).toFixed(2)}
            </Text>
            <Text
              style={{
                color: theme.colors.textSoft,
                fontSize: 12,
                marginTop: 3,
              }}
            >
              Payment status: {cash.payment_status}
            </Text>
          </View>
        ) : null}

        {item.message ? (
          <Text style={{ color: theme.colors.textSoft, marginBottom: 10 }}>
            “{item.message}”
          </Text>
        ) : null}

        <View style={{ gap: 8 }}>
          {isReceiver && item.status === 'sent' ? (
            <>
              <ActionButton
                label="Accept"
                active
                onPress={() =>
                  doStatusUpdate(item.id, 'accepted', 'Offer accepted.')
                }
              />
              <ActionButton
                label="Decline"
                onPress={() =>
                  doStatusUpdate(item.id, 'declined', 'Offer declined.')
                }
              />
            </>
          ) : null}

          {cash ? (
            <>
              <ActionButton
                label="Pay via PayPal"
                onPress={() => handlePayPal(item)}
              />

              <ActionButton
                label="I sent payment"
                onPress={() => doPaymentStatusUpdate(item.id, 'sent')}
              />

              <ActionButton
                label="Payment received"
                onPress={() => doPaymentStatusUpdate(item.id, 'confirmed')}
              />
            </>
          ) : null}

          <ActionButton
            label="Mark shipped"
            onPress={() =>
              doStatusUpdate(item.id, 'shipped', 'Trade marked as shipped.')
            }
          />

          <ActionButton
            label="Mark received"
            onPress={() =>
              doStatusUpdate(item.id, 'received', 'Trade marked as received.')
            }
          />

          <ActionButton
            label="Complete trade"
            active
            onPress={() =>
              doStatusUpdate(item.id, 'completed', 'Trade completed.')
            }
          />

          <ActionButton
            label="Dispute"
            danger
            onPress={() =>
              doStatusUpdate(item.id, 'disputed', 'Trade disputed.')
            }
          />
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
            Loading offers...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ flex: 1, padding: 16 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: 28,
            fontWeight: '900',
          }}
        >
          Trade Offers
        </Text>

        <Text
          style={{
            color: theme.colors.textSoft,
            marginTop: 4,
            marginBottom: 16,
          }}
        >
          Review, accept and manage your trades.
        </Text>

        <FlatList
          data={offers}
          keyExtractor={(item) => item.id}
          renderItem={renderOffer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 18,
                padding: 22,
                alignItems: 'center',
                marginTop: 20,
                borderWidth: 1,
                borderColor: theme.colors.border,
                ...cardShadow,
              }}
            >
              <Text
                style={{
                  color: theme.colors.text,
                  fontWeight: '900',
                  fontSize: 17,
                }}
              >
                No offers yet
              </Text>
              <Text
                style={{
                  color: theme.colors.textSoft,
                  textAlign: 'center',
                  marginTop: 8,
                  lineHeight: 20,
                }}
              >
                Offers you send and receive will appear here.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  onPress,
  active,
  danger,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: active
          ? theme.colors.primary
          : danger
            ? '#FEE2E2'
            : theme.colors.surface,
        borderRadius: 12,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active
          ? theme.colors.primary
          : danger
            ? '#FCA5A5'
            : theme.colors.border,
      }}
    >
      <Text
        style={{
          color: active ? '#FFFFFF' : danger ? '#991B1B' : theme.colors.text,
          fontWeight: '900',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}