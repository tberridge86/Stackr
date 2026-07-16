import { useTheme } from '../../components/theme-context';
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
import { getPreferredMarketPrice, getPriceFromPokemonCard } from '../../lib/pricing';
import { BETA_TRADE_DEMO_MODE, PRICE_API_URL, USD_TO_GBP } from '../../lib/config';
import { fetchUserCardAvailability } from '../../lib/cardOwnership';
import { fetchOwnedCardRows } from '../../lib/ownership';
import { stackrBrand } from '../../lib/stackrBrand';

// ===============================
// CONSTANTS
// ===============================

const MAX_OFFER_CARDS = 6;

// ===============================
// TYPES
// ===============================

type CashPayer = 'sender' | 'receiver';
type OfferCardFilter = 'all' | 'duplicates' | 'priced';

type TradeCardOption = {
  id: string;
  card_id: string;
  set_id: string | null;
  name: string;
  image_url: string | null;
  set_name?: string | null;
  number?: string | null;
  estimated_value?: number | null;
  price_source?: string | null;
  owned_quantity?: number | null;
};

type OwnedTradeSource = {
  id?: string | null;
  card_id: string;
  set_id: string | null;
  quantity: number;
  name?: string | null;
  image_url?: string | null;
  set_name?: string | null;
  number?: string | null;
  fallback_price?: number | null;
};

const OFFER_CARD_FILTERS: { key: OfferCardFilter; label: string }[] = [
  { key: 'all', label: 'All owned' },
  { key: 'duplicates', label: 'Duplicates' },
  { key: 'priced', label: 'Priced' },
];

type OfferListingRow = {
  id: string;
  user_id: string;
  card_id: string | null;
  set_id: string | null;
  flag_type: string | null;
  listing_status?: string | null;
  product_type?: string | null;
  product_name?: string | null;
  asking_price?: number | null;
  market_estimate?: number | null;
  listing_images?: string[] | null;
  condition?: string | null;
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

const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `£${value.toFixed(2)}`
    : 'No price yet';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function getRawTcgPriceGbp(rawData: any): number | null {
  const usdPrice = getPriceFromPokemonCard(rawData);
  return typeof usdPrice === 'number' ? usdPrice * USD_TO_GBP : null;
}

async function fetchEstimatedPrice(cardIdValue: string, rawData?: any) {
  const fallbackTcg = getRawTcgPriceGbp(rawData);

  const { data, error } = await supabase
    .from('market_price_snapshots')
    .select('ebay_average, tcg_mid, cardmarket_trend, snapshot_at')
    .eq('card_id', cardIdValue)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.log('Trade price lookup failed:', error.message);
  }

  return getPreferredMarketPrice(data ?? null, { tcg: fallbackTcg });
}

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
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
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
  const [listingOwnerId, setListingOwnerId] = useState<string | null>(null);
  const [targetUserName, setTargetUserName] = useState<string | null>(null);
  const [targetCard, setTargetCard] = useState<TradeCardOption | null>(null);
  const [myTradeCards, setMyTradeCards] = useState<TradeCardOption[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [offerCardSearch, setOfferCardSearch] = useState('');
  const [offerCardFilter, setOfferCardFilter] = useState<OfferCardFilter>('all');

  const [cashAmount, setCashAmount] = useState('');
  const [cashPayer, setCashPayer] = useState<CashPayer>('sender');
  const [message, setMessage] = useState('');

  const cashAmountNumber = useMemo(() => {
    const cleaned = cashAmount.replace(/[£,]/g, '').trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [cashAmount]);

  const cashInvolved = cashAmountNumber > 0;
  const selectedTradeCards = useMemo(
    () => myTradeCards.filter((card) => selectedCardIds.includes(card.card_id)),
    [myTradeCards, selectedCardIds]
  );
  const filteredTradeCards = useMemo(() => {
    const query = offerCardSearch.trim().toLowerCase();
    return myTradeCards.filter((card) => {
      const searchable = [
        card.name,
        card.set_name,
        card.set_id,
        card.number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      if (!matchesSearch) return false;
      if (offerCardFilter === 'duplicates') return (card.owned_quantity ?? 1) > 1;
      if (offerCardFilter === 'priced') return (card.estimated_value ?? 0) > 0;
      return true;
    });
  }, [myTradeCards, offerCardFilter, offerCardSearch]);
  const requestedSideValue = targetCard?.estimated_value ?? 0;
  const offeredCardsValue = selectedTradeCards.reduce(
    (total, card) => total + (card.estimated_value ?? 0),
    0
  );
  const offeredSideValue =
    offeredCardsValue + (cashPayer === 'sender' ? cashAmountNumber : 0);
  const receiverSideValue =
    requestedSideValue + (cashPayer === 'receiver' ? cashAmountNumber : 0);
  const valueDifference = offeredSideValue - receiverSideValue;
  const absoluteDifference = Math.abs(valueDifference);
  const comparisonBase = Math.max(offeredSideValue, receiverSideValue, 1);
  const differencePercent = Math.min(100, (absoluteDifference / comparisonBase) * 100);
  const fairnessState =
    absoluteDifference < 2 || differencePercent <= 8
      ? 'balanced'
      : valueDifference > 0
        ? 'your-heavy'
        : 'their-heavy';
  const fairnessMarkerPercent = clamp(
    50 - (valueDifference / comparisonBase) * 44,
    6,
    94
  );
  const fairnessLabel =
    fairnessState === 'balanced'
      ? 'Balanced'
      : fairnessState === 'your-heavy'
        ? 'Your side is heavier'
        : 'Their side is heavier';
  const fairnessHint =
    fairnessState === 'balanced'
      ? 'Both sides are close enough to feel fair.'
      : fairnessState === 'your-heavy'
        ? `You are offering about ${money(absoluteDifference)} more.`
        : `They are sending about ${money(absoluteDifference)} more.`;
  const fairnessColor = fairnessState === 'balanced' ? theme.colors.primary : '#F59E0B';

  useEffect(() => {
    let active = true;
    loadScreen(() => active);
    return () => {
      active = false;
    };
    // Reload only when the route identity changes; loadScreen is defined below and closes over these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId, targetUserId, cardId, setId]);

  // ===============================
  // LOAD
  // ===============================

  async function loadScreen(isActive = () => true) {
    try {
      setLoading(true);
      setTargetCard(null);
      setMyTradeCards([]);
      setSelectedCardIds([]);
      setOfferCardSearch('');
      setOfferCardFilter('all');
      setCashAmount('');
      setCashPayer('sender');
      setMessage('');
      setListingOwnerId(null);

      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        Alert.alert('Sign in required', 'You need to be signed in to make Market offers.');
        router.replace('/offer');
        return;
      }

      setCurrentUserId(user.id);

      if (!listingId) {
        Alert.alert('Missing offer details', 'This offer is missing listing information.');
        router.replace('/offer');
        return;
      }

      const listing = await fetchListingForOffer(listingId);
      if (!listing?.card_id || !listing.user_id) {
        throw new Error('This Market listing could not be found.');
      }

      if (targetUserId && listing.user_id !== targetUserId) {
        console.log('Offer route target mismatch; using listing owner', {
          listingId,
          routeTargetUserId: targetUserId,
          listingUserId: listing.user_id,
        });
      }

      if (cardId && listing.card_id !== cardId) {
        console.log('Offer route card mismatch; using listing card', {
          listingId,
          routeCardId: cardId,
          listingCardId: listing.card_id,
        });
      }

      const [target, receiverProfile, ownCards] = await Promise.all([
        buildTargetCard(listing.card_id, listing.set_id ?? null, listing),
        supabase.from('profiles').select('collector_name').eq('id', listing.user_id).maybeSingle(),
        fetchMyTradeCards(user.id),
      ]);

      if (!isActive()) return;
      setTargetCard(target);
      setListingOwnerId(listing.user_id);
      setTargetUserName(receiverProfile.data?.collector_name ?? null);
      setMyTradeCards(ownCards);
    } catch (error: any) {
      if (!isActive()) return;
      console.error('Failed to load offer screen:', error);
      Alert.alert('Could not load offer', error?.message ?? 'Something went wrong.');
    } finally {
      if (isActive()) setLoading(false);
    }
  }

  async function fetchListingForOffer(listingIdValue: string): Promise<OfferListingRow | null> {
    const { data, error } = await supabase
      .from('user_card_flags')
      .select(`
        id, user_id, card_id, set_id, flag_type, listing_status,
        product_type, product_name, asking_price, market_estimate,
        listing_images, condition
      `)
      .eq('id', listingIdValue)
      .eq('flag_type', 'trade')
      .maybeSingle();

    if (error) throw error;
    return (data as OfferListingRow | null) ?? null;
  }

  // ===============================
  // BUILD TARGET CARD
  // ===============================

  async function buildTargetCard(
    cardIdValue: string,
    setIdValue: string | null,
    listing?: OfferListingRow | null
  ): Promise<TradeCardOption> {
    const isProductListing = listing?.product_type &&
      listing.product_type !== 'raw_card' &&
      listing.product_type !== 'graded_slab';

    if (isProductListing) {
      return {
        id: cardIdValue,
        card_id: cardIdValue,
        set_id: setIdValue ?? null,
        name: listing?.product_name ?? cardIdValue,
        image_url: Array.isArray(listing?.listing_images) ? listing?.listing_images?.[0] ?? null : null,
        set_name: listing?.product_type?.replace(/_/g, ' ') ?? 'Product',
        number: null,
        estimated_value: listing?.market_estimate ?? listing?.asking_price ?? null,
        price_source: listing?.market_estimate != null ? 'listing' : null,
      };
    }

    const cached = setIdValue
      ? (getCachedCardSync(setIdValue, cardIdValue) as any)
      : null;

    const { data: cardRow } = await supabase
      .from('pokemon_cards')
      .select('id, name, set_id, number, image_small, image_large, raw_data')
      .eq('id', cardIdValue)
      .maybeSingle();

    if (cardRow || cached) {
      const rawData = (cardRow as any)?.raw_data ?? cached;
      const price = await fetchEstimatedPrice(cardIdValue, rawData);

      return {
        id: cardIdValue,
        card_id: cardIdValue,
        set_id: (cardRow as any)?.set_id ?? setIdValue ?? cached?.set?.id ?? null,
        name: (cardRow as any)?.name ?? cached?.name ?? cardIdValue,
        image_url:
          (cardRow as any)?.image_small ??
          (cardRow as any)?.image_large ??
          cached?.images?.small ??
          cached?.images?.large ??
          null,
        set_name: rawData?.set?.name ?? null,
        number: (cardRow as any)?.number ?? cached?.number ?? null,
        estimated_value: listing?.market_estimate ?? price.value,
        price_source: listing?.market_estimate != null ? 'listing' : price.source,
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
      estimated_value: listing?.market_estimate ?? listing?.asking_price ?? null,
      price_source: null,
    };
  }

  // ===============================
  // FETCH MY TRADE CARDS
  // ===============================

  async function fetchBinderOwnedTradeSources(userId: string): Promise<OwnedTradeSource[]> {
    const { data: binders, error: bindersError } = await supabase
      .from('binders')
      .select('id')
      .eq('user_id', userId);

    if (bindersError) {
      console.log('Owned binder lookup failed:', bindersError.message);
      return [];
    }

    const binderIds = (binders ?? []).map((binder: any) => binder.id).filter(Boolean);
    if (binderIds.length === 0) return [];

    const { data, error } = await supabase
      .from('binder_cards')
      .select(`
        id, card_id, set_id, card_name, set_name, card_number, image_url,
        owned_quantity, ebay_price, tcg_price, cardmarket_price, owned
      `)
      .in('binder_id', binderIds)
      .eq('owned', true);

    if (error) {
      console.log('Owned binder card lookup failed:', error.message);
      return [];
    }

    return (data ?? [])
      .filter((row: any) => row.card_id)
      .map((row: any) => ({
        id: row.id ?? null,
        card_id: row.card_id,
        set_id: row.set_id ?? null,
        quantity: Math.max(1, Number(row.owned_quantity ?? 1) || 1),
        name: row.card_name ?? null,
        image_url: row.image_url ?? null,
        set_name: row.set_name ?? null,
        number: row.card_number ?? null,
        fallback_price:
          row.tcg_price ??
          row.ebay_price ??
          row.cardmarket_price ??
          null,
      }));
  }

  async function fetchMyTradeCards(userId: string): Promise<TradeCardOption[]> {
    let ownedSources: OwnedTradeSource[] = [];
    let useCanonicalAvailability = false;

    try {
      const ownedRows = await fetchOwnedCardRows();
      useCanonicalAvailability = ownedRows.length > 0;
      ownedSources = ownedRows.map((row) => ({
        id: row.id ?? null,
        card_id: row.card_id,
        set_id: row.set_id ?? null,
        quantity: Math.max(1, Number(row.quantity ?? 1) || 1),
      }));
    } catch (error: any) {
      console.log('Owned variant lookup failed:', error?.message ?? error);
    }

    if (ownedSources.length === 0) {
      ownedSources = await fetchBinderOwnedTradeSources(userId);
    }

    const grouped = new Map<string, OwnedTradeSource>();
    for (const source of ownedSources) {
      if (!source.card_id) continue;
      const key = `${source.set_id ?? 'unknown'}:${source.card_id}`;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { ...source, quantity: Math.max(1, Number(source.quantity ?? 1) || 1) });
        continue;
      }
      grouped.set(key, {
        ...current,
        quantity: Math.max(1, Number(current.quantity ?? 1) || 1) + Math.max(1, Number(source.quantity ?? 1) || 1),
        name: current.name ?? source.name ?? null,
        image_url: current.image_url ?? source.image_url ?? null,
        set_name: current.set_name ?? source.set_name ?? null,
        number: current.number ?? source.number ?? null,
        fallback_price: current.fallback_price ?? source.fallback_price ?? null,
      });
    }

    const ownedCards = Array.from(grouped.values());
    if (ownedCards.length === 0) return [];

    const cardIds = [...new Set(ownedCards.map((card) => card.card_id).filter(Boolean))];
    const availableQuantityByKey = new Map<string, number>();

    if (useCanonicalAvailability) {
      await Promise.all(ownedCards.map(async (owned) => {
        try {
          const availability = await fetchUserCardAvailability({
            userId,
            cardId: owned.card_id,
            setId: owned.set_id,
          });
          availableQuantityByKey.set(`${owned.set_id ?? 'unknown'}:${owned.card_id}`, availability.availableQuantity);
        } catch (error: any) {
          console.log('Offer availability lookup failed:', error?.message ?? error);
          availableQuantityByKey.set(`${owned.set_id ?? 'unknown'}:${owned.card_id}`, owned.quantity);
        }
      }));
    }

    const [cardRowsResult, previewsResult, snapshotsResult] = await Promise.all([
      supabase
        .from('pokemon_cards')
        .select('id, name, set_id, number, image_small, image_large, raw_data')
        .in('id', cardIds),
      supabase
      .from('card_previews')
        .select('card_id, name, image_url')
        .in('card_id', cardIds),
      supabase
        .from('market_price_snapshots')
        .select('card_id, ebay_average, tcg_mid, cardmarket_trend, snapshot_at')
        .in('card_id', cardIds)
        .order('snapshot_at', { ascending: false }),
    ]);

    if (cardRowsResult.error) throw cardRowsResult.error;
    if (previewsResult.error) throw previewsResult.error;
    if (snapshotsResult.error) {
      console.log('Trade snapshot lookup failed:', snapshotsResult.error.message);
    }

    const previewMap = new Map(
      (previewsResult.data ?? []).map((preview: any) => [preview.card_id, preview])
    );
    const cardRowMap = new Map(
      (cardRowsResult.data ?? []).map((card: any) => [card.id, card])
    );
    const snapshotMap = new Map<string, any>();
    for (const snapshot of snapshotsResult.data ?? []) {
      if (!snapshotMap.has((snapshot as any).card_id)) {
        snapshotMap.set((snapshot as any).card_id, snapshot);
      }
    }

    const options: TradeCardOption[] = [];

    for (const owned of ownedCards) {
      const availableQuantity = availableQuantityByKey.get(`${owned.set_id ?? 'unknown'}:${owned.card_id}`) ?? owned.quantity;
      if (availableQuantity <= 0) continue;
      const preview = previewMap.get(owned.card_id) as any;
      const row = cardRowMap.get(owned.card_id) as any;
      const cached = owned.set_id
        ? (getCachedCardSync(owned.set_id, owned.card_id) as any)
        : null;
      const rawData = row?.raw_data ?? cached;
      const price = getPreferredMarketPrice(snapshotMap.get(owned.card_id), {
        tcg: owned.fallback_price ?? getRawTcgPriceGbp(rawData),
      });

      options.push({
        id: owned.id ?? `${owned.set_id ?? 'owned'}:${owned.card_id}`,
        card_id: owned.card_id,
        set_id: owned.set_id ?? row?.set_id ?? cached?.set?.id ?? null,
        name: row?.name ?? preview?.name ?? cached?.name ?? owned.name ?? owned.card_id,
        image_url:
          row?.image_small ??
          row?.image_large ??
          preview?.image_url ??
          cached?.images?.small ??
          cached?.images?.large ??
          owned.image_url ??
          null,
        set_name: rawData?.set?.name ?? owned.set_name ?? cached?.set?.name ?? null,
        number: row?.number ?? owned.number ?? cached?.number ?? null,
        estimated_value: price.value ?? owned.fallback_price ?? null,
        price_source: price.source ?? (owned.fallback_price != null ? 'owned' : null),
        owned_quantity: availableQuantity,
      });
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
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
          `You can offer up to ${MAX_OFFER_CARDS} cards in a single offer.`
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
      const receiverUserId = listingOwnerId ?? targetUserId ?? null;
      if (!currentUserId || !receiverUserId || !listingId || !targetCard?.card_id) {
        Alert.alert('Missing details', 'This offer is missing required Market information.');
        return;
      }

      if (selectedCardIds.length === 0 && !cashInvolved) {
        Alert.alert('Empty offer', 'Add at least one card or a cash amount.');
        return;
      }

      for (const card of selectedTradeCards) {
        const availability = await fetchUserCardAvailability({
          userId: currentUserId,
          cardId: card.card_id,
          setId: card.set_id,
        });
        if (availability.availableQuantity < 1) {
          Alert.alert(
            'Card no longer available',
            `${card.name} is already committed to another listing, reservation or pending transaction.`
          );
          setSelectedCardIds((current) => current.filter((id) => id !== card.card_id));
          return;
        }
      }

      setSending(true);

      const newOffer = await createTradeOffer({
        listingId,
        senderUserId: currentUserId,
        receiverUserId,
        requestedCards: [
          {
            cardId: targetCard.card_id,
            setId: targetCard.set_id ?? null,
            quantity: 1,
          },
        ],
        offeredCards: selectedTradeCards.map((card) => ({
          cardId: card.card_id,
          setId: card.set_id,
          quantity: 1,
        })),
        cash: cashInvolved
          ? {
              amount: cashAmountNumber,
              currency: 'GBP',
              payer: cashPayer,
              paymentStatus: 'required',
            }
          : null,
        message: message.trim() || null,
      } as any);

      // Notify the receiver they have a new Market offer.
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('collector_name')
        .eq('id', currentUserId)
        .maybeSingle();

      sendPushNotification('/api/notify/trade-offer', {
        recipientUserId: receiverUserId,
        senderUsername: senderProfile?.collector_name ?? 'Someone',
        cardName: targetCard?.name ?? undefined,
      });

      const destination = newOffer?.id ? `/offer/${newOffer.id}?new=1` : '/offers';
      router.push(destination as any);
    } catch (error: any) {
      console.error('Failed to send Market offer:', error);
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
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <Image source={stackrBrand.wordmark} style={styles.brandLogo} resizeMode="contain" />
      <Text style={styles.title}>Build an Offer</Text>
      <Text style={styles.subtitle}>
        Add cards, cash or a message
        {targetUserName ? ` to ${targetUserName}` : ''}.
      </Text>

      {BETA_TRADE_DEMO_MODE && (
        <View style={{
          backgroundColor: '#FEF3C7',
          borderColor: '#F59E0B',
          borderWidth: 1,
          borderRadius: 12,
          padding: 12,
          marginBottom: 14,
        }}>
          <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '900' }}>
            DEMO TRADE MODE
          </Text>
          <Text style={{ color: '#92400E', fontSize: 12, lineHeight: 17, marginTop: 3 }}>
            Beta Market offers are for testing only. Cash top-ups are recorded as demo terms and no real payment is taken.
          </Text>
        </View>
      )}

      <View style={styles.tradeSides}>
        <View style={styles.tradeSideCard}>
          <View style={styles.tradeSideHeader}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>Y</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tradeSideName}>You</Text>
              <Text style={styles.trustedText}>Collector</Text>
            </View>
          </View>

          <View style={styles.sideLabelRow}>
            <Text style={styles.sideLabel}>Cards</Text>
            <Text style={styles.countBadge}>{selectedTradeCards.length}</Text>
          </View>

          <View style={styles.stackArea}>
            {selectedTradeCards.length > 0 ? (
              selectedTradeCards.slice(0, 3).map((card, index) =>
                card.image_url ? (
                  <Image
                    key={`${card.card_id}-${index}`}
                    source={{ uri: card.image_url }}
                    style={[
                      styles.stackCardImage,
                      {
                        left: 16 + index * 18,
                        transform: [{ rotate: `${(index - 1) * 5}deg` }],
                      },
                    ]}
                  />
                ) : (
                  <View
                    key={`${card.card_id}-${index}`}
                    style={[
                      styles.stackCardImage,
                      styles.stackPlaceholder,
                      { left: 16 + index * 18 },
                    ]}
                  />
                )
              )
            ) : (
              <View style={styles.emptyStack}>
                <Text style={styles.emptyStackText}>Add cards</Text>
              </View>
            )}
            {selectedTradeCards.length > 1 && (
              <View style={styles.stackCountBubble}>
                <Text style={styles.stackCountText}>x{selectedTradeCards.length}</Text>
              </View>
            )}
          </View>

          <View style={styles.sideValueBox}>
            <Text style={styles.valueLabel}>Est. Value</Text>
            <Text style={styles.sideValueAmount}>{money(offeredSideValue)}</Text>
            {cashPayer === 'sender' && cashInvolved && (
              <Text style={styles.cashMini}>includes {money(cashAmountNumber)} cash</Text>
            )}
          </View>
        </View>

        <View style={styles.swapBadge}>
          <Text style={styles.swapBadgeText}>⇄</Text>
        </View>

        <View style={styles.tradeSideCard}>
          <View style={styles.tradeSideHeader}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{(targetUserName ?? 'T').charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tradeSideName}>{targetUserName ?? 'Collector'}</Text>
              <Text style={styles.trustedText}>Collector</Text>
            </View>
          </View>

          <View style={styles.sideLabelRow}>
            <Text style={styles.sideLabel}>Cards</Text>
            <Text style={styles.countBadge}>{targetCard ? 1 : 0}</Text>
          </View>

          <View style={styles.stackArea}>
            {targetCard?.image_url ? (
              <Image source={{ uri: targetCard.image_url }} style={styles.targetStackImage} />
            ) : (
              <View style={styles.emptyStack}>
                <Text style={styles.emptyStackText}>Wanted card</Text>
              </View>
            )}
          </View>

          <View style={styles.sideValueBox}>
            <Text style={styles.valueLabel}>Est. Value</Text>
            <Text style={styles.sideValueAmount}>{money(receiverSideValue)}</Text>
            {cashPayer === 'receiver' && cashInvolved && (
              <Text style={styles.cashMini}>includes {money(cashAmountNumber)} cash</Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.fairnessBox}>
        <View style={styles.fairnessHeader}>
          <Text style={styles.fairnessTitle}>Offer Balance</Text>
          <Text
            style={[
              styles.fairnessPill,
              fairnessState !== 'balanced' && styles.fairnessPillWarn,
            ]}
          >
            {money(absoluteDifference)}
          </Text>
        </View>

        <View style={styles.fairnessTrack}>
          <View style={styles.fairnessTrackLeft} />
          <View style={styles.fairnessTrackRight} />
          <View
            style={[
              styles.fairnessMarker,
              { left: `${fairnessMarkerPercent}%` },
              { borderColor: fairnessColor },
            ]}
          />
        </View>
        <View style={styles.fairnessEnds}>
          <Text style={styles.fairnessEndText}>You</Text>
          <Text style={styles.fairnessEndText}>Them</Text>
        </View>

        <Text
          style={[
            styles.fairnessLabel,
            fairnessState !== 'balanced' && styles.fairnessLabelWarn,
          ]}
        >
          {fairnessLabel}
        </Text>
        <Text style={styles.fairnessHint}>{fairnessHint}</Text>

        <View style={styles.tradeSummaryCard}>
          <View style={styles.tradeSummaryHeader}>
            <Text style={styles.tradeSummaryTitle}>Offer Summary</Text>
            <Text style={styles.tradeSummaryDelta}>{Math.round(differencePercent)}%</Text>
          </View>
          <View style={styles.valueGrid}>
          <View style={[styles.valueCell, fairnessState === 'your-heavy' && styles.valueCellActive]}>
            <Text style={styles.valueLabel}>Your side</Text>
            <Text style={styles.valueAmount}>{money(offeredSideValue)}</Text>
          </View>
          <View style={[styles.valueCell, fairnessState === 'their-heavy' && styles.valueCellActive]}>
            <Text style={styles.valueLabel}>Their side</Text>
            <Text style={styles.valueAmount}>{money(receiverSideValue)}</Text>
          </View>
          <View style={styles.valueCell}>
            <Text style={styles.valueLabel}>Difference</Text>
            <Text style={styles.valueAmount}>{money(absoluteDifference)}</Text>
          </View>
          </View>
        </View>
      </View>

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
              <Text style={styles.priceMeta}>
                {money(targetCard.estimated_value)}
                {targetCard.price_source ? ` ${targetCard.price_source}` : ''}
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
            No owned cards found yet. Scan cards into your collection first.
          </Text>
        ) : (
          <>
            <TextInput
              value={offerCardSearch}
              onChangeText={setOfferCardSearch}
              placeholder="Search your owned cards"
              placeholderTextColor={theme.colors.textSoft}
              autoCorrect={false}
              autoCapitalize="words"
              style={styles.offerSearchInput}
            />

            <View style={styles.offerFilterRow}>
              {OFFER_CARD_FILTERS.map((filter) => {
                const active = offerCardFilter === filter.key;
                return (
                  <TouchableOpacity
                    key={filter.key}
                    onPress={() => setOfferCardFilter(filter.key)}
                    activeOpacity={0.78}
                    style={[styles.offerFilterChip, active && styles.offerFilterChipActive]}
                  >
                    <Text style={[styles.offerFilterText, active && styles.offerFilterTextActive]}>
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedCardIds.length > 0 && (
              <Text style={styles.selectedCount}>
                {selectedCardIds.length} / {MAX_OFFER_CARDS} selected
              </Text>
            )}

            {filteredTradeCards.length === 0 ? (
              <Text style={styles.muted}>
                No owned cards match that search or filter.
              </Text>
            ) : filteredTradeCards.map((card) => {
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
                      {card.owned_quantity ? ` · x${card.owned_quantity} owned` : ''}
                    </Text>
                    <Text style={styles.priceMeta}>
                      {money(card.estimated_value)}
                      {card.price_source ? ` ${card.price_source}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.selectText, selected && styles.selectTextActive]}>
                    {selected ? 'Selected' : 'Add'}
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
          <View style={styles.cashSummary}>
            <Text style={styles.cashSummaryText}>
              {cashPayer === 'sender' ? 'You' : 'They'} pay{' '}
              £{cashAmountNumber.toFixed(2)} {BETA_TRADE_DEMO_MODE ? 'as demo cash only' : 'via Stripe'}
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



    </ScrollView>
    <View style={{ paddingHorizontal: 16, paddingBottom: 110, paddingTop: 8 }}>
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
    </View>
    </View>
  );
}

// ===============================
// SUB COMPONENTS
// ===============================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);

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

function makeStyles(theme: any) {
  return StyleSheet.create({
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
  brandLogo: {
    width: 150,
    height: 48,
    marginBottom: 8,
    alignSelf: 'flex-start',
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
  tradeSides: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  tradeSideCard: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow,
  },
  tradeSideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  tradeSideName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  trustedText: {
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  sideLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sideLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  countBadge: {
    color: theme.colors.primary,
    backgroundColor: theme.colors.primary + '14',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: '900',
  },
  stackArea: {
    height: 122,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackCardImage: {
    position: 'absolute',
    top: 4,
    width: 72,
    height: 100,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  targetStackImage: {
    width: 78,
    height: 108,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
  },
  stackPlaceholder: {
    backgroundColor: theme.colors.primary + '18',
  },
  emptyStack: {
    width: 82,
    height: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  emptyStackText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  stackCountBubble: {
    position: 'absolute',
    right: 14,
    bottom: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stackCountText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  swapBadge: {
    position: 'absolute',
    left: '50%',
    top: 82,
    zIndex: 2,
    width: 34,
    height: 34,
    marginLeft: -17,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow,
  },
  swapBadgeText: {
    color: theme.colors.primary,
    fontSize: 18,
    fontWeight: '900',
  },
  sideValueBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 70,
  },
  sideValueAmount: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  cashMini: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
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
  offerSearchInput: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
    fontWeight: '700',
  },
  offerFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  offerFilterChip: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  offerFilterChipActive: {
    backgroundColor: theme.colors.primary + '14',
    borderColor: theme.colors.primary,
  },
  offerFilterText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
  },
  offerFilterTextActive: {
    color: theme.colors.primary,
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
  priceMeta: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  muted: {
    color: theme.colors.textSoft,
    lineHeight: 20,
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
  fairnessBox: {
    backgroundColor: theme.colors.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow,
  },
  fairnessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  fairnessTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  fairnessPill: {
    color: theme.colors.primary,
    backgroundColor: theme.colors.primary + '14',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
  },
  fairnessPillWarn: {
    color: '#F59E0B',
    backgroundColor: '#F59E0B18',
  },
  fairnessTrack: {
    height: 9,
    borderRadius: 999,
    overflow: 'visible',
    flexDirection: 'row',
    backgroundColor: theme.colors.border,
    marginTop: 2,
  },
  fairnessTrackLeft: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  fairnessTrackRight: {
    flex: 1,
    backgroundColor: '#F59E0B',
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  fairnessMarker: {
    position: 'absolute',
    top: -8,
    width: 24,
    height: 24,
    marginLeft: -12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: theme.colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  fairnessEnds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  fairnessEndText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  fairnessLabel: {
    color: theme.colors.primary,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 8,
  },
  fairnessLabelWarn: {
    color: '#F59E0B',
  },
  fairnessHint: {
    color: theme.colors.textSoft,
    textAlign: 'center',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  tradeSummaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
  },
  tradeSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tradeSummaryTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  tradeSummaryDelta: {
    color: theme.colors.primary,
    backgroundColor: theme.colors.primary + '14',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '900',
  },
  valueGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  valueCell: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
  },
  valueCellActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#F59E0B12',
  },
  valueLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  valueAmount: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
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
}
