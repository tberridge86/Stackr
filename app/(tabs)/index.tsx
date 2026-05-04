import { theme } from '../../lib/theme';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { router , useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  Linking,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../../components/Text';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { useCollection } from '../../components/collection-context';
import { fetchBinders, fetchBinderCards } from '../../lib/binders';
import { supabase } from '../../lib/supabase';
import { createActivityPost } from '../../lib/activity';

// ===============================
// TYPES
// ===============================

type ChartRange = '1D' | '7D' | '30D' | 'ALL';
type ChartMode = 'TCG' | 'EBAY' | 'BOTH';

// ===============================
// CONSTANTS
// ===============================

const screenWidth = Dimensions.get('window').width;

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const ONBOARDING_STEPS = [
  {
    title: 'Welcome to Stackr',
    body: 'Stackr helps you track your Pokémon card collection, build binders, check values, trade safely, and connect with other collectors.',
  },
  {
    title: 'Hub',
    body: 'This is your dashboard. You can see your collection value, recent listings, quick stats, notifications, and shortcuts into the app.',
  },
  {
    title: 'Binders',
    body: 'Create official set binders or custom binders. Track owned and missing cards, favourite cards, chase cards, values, and public binders.',
  },
  {
    title: 'Trade',
    body: 'The trade area is where you can browse listings, mark cards for trade, make offers, and use the Price Builder to check fair values.',
  },
  {
    title: 'Profile',
    body: 'Your public profile shows your trader rating, reviews, showcase cards, friends, and any binders you choose to make public.',
  },
  {
    title: 'Safety',
    body: 'Stackr helps collectors find each other. It does not handle money, hold payments, or guarantee trades. Always trade carefully and use trusted methods.',
  },
];

// ===============================
// HELPERS
// ===============================

const formatMoney = (value: number) => `£${value.toFixed(2)}`;

const formatSignedMoney = (value: number) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}£${value.toFixed(2)}`;
};

const formatSignedPercent = (value: number) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const getRangeStartDate = (range: ChartRange): string | null => {
  if (range === 'ALL') return null;
  const date = new Date();
  if (range === '1D') date.setDate(date.getDate() - 1);
  if (range === '7D') date.setDate(date.getDate() - 7);
  if (range === '30D') date.setDate(date.getDate() - 30);
  return date.toISOString();
};

const getPriceFromSnapshot = (row: any, source: 'tcg' | 'ebay'): number | null => {
  const price = source === 'tcg' ? row?.tcg_mid : row?.ebay_average;
  return typeof price === 'number' ? price : null;
};

const getPriceFromPokemonCard = (card: any): number | null => {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  const preferred = ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal'];

  for (const key of preferred) {
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return value;
  }

  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return value;
  }

  return null;
};

const fetchLivePricesForCardIds = async (cardIds: string[]): Promise<Record<string, number>> => {
  const priceMap: Record<string, number> = {};

  for (let i = 0; i < cardIds.length; i += 20) {
    const chunk = cardIds.slice(i, i + 20);
    const q = chunk.map((id) => `id:${id}`).join(' OR ');
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=20`;

    try {
      const response = await fetch(url);
      const json = await response.json();

      for (const card of json?.data ?? []) {
        const price = getPriceFromPokemonCard(card);
        if (typeof price === 'number') {
          priceMap[card.id] = price;
        }
      }
    } catch (err) {
      console.log('TCG live price fetch failed for chunk', err);
    }
  }

  return priceMap;
};

// Fixed: pad shorter array so both datasets have equal length
const equaliseArrays = (a: number[], b: number[]): [number[], number[]] => {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return [[0, 0], [0, 0]];
  const pad = (arr: number[]) =>
    arr.length < maxLen
      ? [...Array(maxLen - arr.length).fill(arr[0] ?? 0), ...arr]
      : arr;
  return [pad(a), pad(b)];
};

const normaliseChartValues = (values: number[]): number[] =>
  values.length >= 2 ? values : values.length === 1 ? [values[0], values[0]] : [0, 0];

// ===============================
// SUB COMPONENTS
// ===============================

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={{
      width: '48.5%',
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...cardShadow,
    }}>
      <Text style={{ color: theme.colors.text, fontSize: 23, fontWeight: '900' }}>
        {value}
      </Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700', marginTop: 6 }}>
        {label}
      </Text>
    </View>
  );
}

function QuickLink({
  icon,
  label,
  onPress,
  badge,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        ...cardShadow,
      }}
      activeOpacity={0.8}
    >
      <View style={{
        width: 40, height: 40,
        borderRadius: 12,
        backgroundColor: theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
      }}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>

      <Text style={{ flex: 1, color: theme.colors.text, fontWeight: '700', fontSize: 15 }}>
        {label}
      </Text>

      {badge != null && badge > 0 && (
        <View style={{
          backgroundColor: theme.colors.primary,
          borderRadius: 999,
          minWidth: 22,
          paddingHorizontal: 6,
          paddingVertical: 2,
          marginRight: 8,
        }}>
          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900', textAlign: 'center' }}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      )}

      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
    </TouchableOpacity>
  );
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function HubScreen() {
  const { trackedSetIds } = useCollection();

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  // Chart
  const [chartRange, setChartRange] = useState<ChartRange>('7D');
  const [chartMode, setChartMode] = useState<ChartMode>('TCG');
  const [chartData, setChartData] = useState<{ tcg: number[]; ebay: number[] }>({ tcg: [], ebay: [] });

  // Collection value
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionChangeAmount, setCollectionChangeAmount] = useState(0);
  const [collectionChangePercent, setCollectionChangePercent] = useState(0);

  // Stats
  const [ownedCardCount, setOwnedCardCount] = useState(0);
  const [unpricedCardCount, setUnpricedCardCount] = useState(0);
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalSets, setTotalSets] = useState(0);

  // Recent trade listings
  const [recentListings, setRecentListings] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const valuePostKeyRef = useRef<string | null>(null);

  const collectionUp = collectionChangeAmount >= 0;

  // ===============================
  // LOAD ALL DATA
  // ===============================

  const loadAll = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      // Load counts in parallel
      const [
        notificationsResult,
        watchlistResult,
        setsResult,
      ] = await Promise.all([
        user
          ? supabase
              .from('notifications')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('read', false)
          : Promise.resolve({ count: 0 }),

        user
          ? supabase
              .from('market_watchlist')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
          : Promise.resolve({ count: 0 }),

        fetch('https://api.pokemontcg.io/v2/sets?pageSize=1')
          .then((r) => r.json())
          .then((j) => ({ count: j?.totalCount ?? 0 }))
          .catch(() => ({ count: 0 })),
      ]);

      setUnreadCount((notificationsResult as any).count ?? 0);
      setWatchlistCount((watchlistResult as any).count ?? 0);
      setTotalSets((setsResult as any).count ?? 0);

      // Load recent trade listings
      // Uses user_card_flags (trade) joined with card_previews
      if (user) {
        const { data: flagData } = await supabase
          .from('user_card_flags')
          .select('card_id, set_id, condition, asking_price, listing_status')
          .eq('flag_type', 'trade')
          .eq('listing_status', 'active')
          .neq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(8);

        if (flagData?.length) {
          const cardIds = [...new Set(flagData.map((f) => f.card_id))];

          const { data: previews } = await supabase
            .from('card_previews')
            .select('card_id, name, image_url, set_name')
            .in('card_id', cardIds);

          const previewMap: Record<string, any> = {};
          (previews ?? []).forEach((p: any) => { previewMap[p.card_id] = p; });

          setRecentListings(
            flagData.map((flag) => ({
              ...flag,
              preview: previewMap[flag.card_id] ?? null,
            }))
          );
        }
      }
    } catch (error) {
      console.log('Hub load failed', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ===============================
  // LOAD COLLECTION VALUE
  // ===============================

  const loadCollectionValue = useCallback(async () => {
    try {
      const binders = await fetchBinders();

      const allCards = (
        await Promise.all(binders.map((b) => fetchBinderCards(b.id)))
      ).flat();

      const ownedCards = allCards.filter((c) => c.owned);
      setOwnedCardCount(ownedCards.length);

      const storedCardIds = [...new Set(ownedCards.map((c) => c.card_id))];
      const apiCardIds = [...new Set(ownedCards.map((c: any) => c.api_card_id || c.card_id))];

      if (!storedCardIds.length) {
        setCollectionTotal(0);
        setCollectionChangeAmount(0);
        setCollectionChangePercent(0);
        setUnpricedCardCount(0);
        setChartData({ tcg: [], ebay: [] });
        return;
      }

      let snapshotQuery = supabase
        .from('market_price_snapshots')
        .select('card_id, ebay_average, tcg_mid, snapshot_at')
        .in('card_id', storedCardIds)
        .order('snapshot_at', { ascending: true });

      const rangeStart = getRangeStartDate(chartRange);
      if (rangeStart) {
        snapshotQuery = snapshotQuery.gte('snapshot_at', rangeStart);
      }

      const { data, error } = await snapshotQuery;
      if (error) throw error;

      const groupedByCard: Record<string, any[]> = {};
      const groupedByDay: Record<string, { tcg: Record<string, number>; ebay: Record<string, number> }> = {};

      for (const row of data ?? []) {
        if (!groupedByCard[row.card_id]) groupedByCard[row.card_id] = [];
        groupedByCard[row.card_id].push(row);

        const day = String(row.snapshot_at).split('T')[0];
        if (!groupedByDay[day]) groupedByDay[day] = { tcg: {}, ebay: {} };

        const tcgPrice = getPriceFromSnapshot(row, 'tcg');
        const ebayPrice = getPriceFromSnapshot(row, 'ebay');

        if (tcgPrice != null) groupedByDay[day].tcg[row.card_id] = tcgPrice;
        if (ebayPrice != null) groupedByDay[day].ebay[row.card_id] = ebayPrice;
      }

      const activeSource: 'tcg' | 'ebay' = chartMode === 'EBAY' ? 'ebay' : 'tcg';

      let totalLatest = 0;
      let totalPrevious = 0;
      let cardsWithPrevious = 0;
      let unpriced = 0;

      for (const card of ownedCards) {
        const snapshots = groupedByCard[card.card_id] ?? [];
        const latest = snapshots[snapshots.length - 1];
        const previous = snapshots[snapshots.length - 2];

        const latestPrice = getPriceFromSnapshot(latest, activeSource);
        const previousPrice = getPriceFromSnapshot(previous, activeSource);

        if (typeof latestPrice === 'number') {
          totalLatest += latestPrice;
        } else {
          unpriced += 1;
        }

        if (typeof latestPrice === 'number' && typeof previousPrice === 'number') {
          totalPrevious += previousPrice;
          cardsWithPrevious += 1;
        }
      }

      // Fallback to live TCG prices if no snapshots
      if (totalLatest === 0 && activeSource === 'tcg') {
        const livePriceMap = await fetchLivePricesForCardIds(apiCardIds);
        let liveTotal = 0;
        let liveUnpriced = 0;

        for (const card of ownedCards as any[]) {
          const lookupId = card.api_card_id || card.card_id;
          const price = livePriceMap[lookupId];
          if (typeof price === 'number') {
            liveTotal += price;
          } else {
            liveUnpriced += 1;
          }
        }

        totalLatest = liveTotal;
        unpriced = liveUnpriced;
      }

      const change = cardsWithPrevious > 0 ? totalLatest - totalPrevious : 0;
      const percent =
        cardsWithPrevious > 0 && totalPrevious !== 0
          ? (change / totalPrevious) * 100
          : 0;

      const days = Object.keys(groupedByDay).sort();

      const buildValues = (source: 'tcg' | 'ebay') =>
        days
          .map((day) => {
            const pricesForDay = groupedByDay[day][source];
            let dayTotal = 0;
            for (const cardId of storedCardIds) {
              const price = pricesForDay[cardId];
              if (typeof price === 'number') dayTotal += price;
            }
            return dayTotal;
          })
          .filter((v) => Number.isFinite(v) && v > 0);

      setCollectionTotal(totalLatest);
      setCollectionChangeAmount(change);
      setCollectionChangePercent(percent);
      setUnpricedCardCount(unpriced);
      setChartData({ tcg: buildValues('tcg'), ebay: buildValues('ebay') });

      // Auto-post value change to activity feed
      if (chartRange === '7D' && cardsWithPrevious > 0 && Math.abs(change) > 1) {
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const { data: existingPost } = await supabase
            .from('activity_feed')
            .select('id')
            .eq('user_id', user.id)
            .eq('type', 'value_change')
            .gte('created_at', today.toISOString())
            .limit(1);

          const alreadyPosted = Array.isArray(existingPost) && existingPost.length > 0;
          const postKey = `${user.id}-${today.toISOString()}-${change.toFixed(2)}`;

          if (!alreadyPosted && valuePostKeyRef.current !== postKey) {
            valuePostKeyRef.current = postKey;

            createActivityPost({
              type: 'value_change',
              title: change > 0 ? 'Collection value is up today' : 'Collection value is down today',
              subtitle: `${formatSignedMoney(change)} (${formatSignedPercent(percent)}) · Total ${formatMoney(totalLatest)}`,
              valueChange: change,
              isPositive: change > 0,
            }).catch((err) => {
              console.log('Failed to create value activity post', err);
            });
          }
        }
      }
    } catch (error) {
      console.log('Failed to calculate collection value', error);
      setCollectionTotal(0);
      setCollectionChangeAmount(0);
      setCollectionChangePercent(0);
      setUnpricedCardCount(0);
      setChartData({ tcg: [], ebay: [] });
    }
  }, [chartRange, chartMode]);

  // ===============================
  // ONBOARDING CHECK
  // ===============================

  const checkOnboarding = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('has_seen_onboarding')
        .eq('id', user.id)
        .maybeSingle();

      if (data && !data.has_seen_onboarding) {
        setShowOnboarding(true);
      }
    } catch (error) {
      console.log('Onboarding check failed (column may not exist yet)', error);
    }
  }, []);

  // ===============================
  // EFFECTS
  // ===============================

  useFocusEffect(
    useCallback(() => {
      loadAll();
      loadCollectionValue();
    }, [loadAll, loadCollectionValue])
  );

  useEffect(() => {
    checkOnboarding();
  }, [checkOnboarding]);

  // Reload chart when range/mode changes
  useEffect(() => {
    loadCollectionValue();
  }, [chartRange, chartMode, loadCollectionValue]);

  // ===============================
  // CHART DATA
  // ===============================

  const tcgChartValues = normaliseChartValues(chartData.tcg);
  const ebayChartValues = normaliseChartValues(chartData.ebay);

  // Fixed: equalise array lengths for BOTH mode
  const [equalTcg, equalEbay] = equaliseArrays(tcgChartValues, ebayChartValues);

  const activeChartValues = chartMode === 'EBAY' ? ebayChartValues : tcgChartValues;
  const hasChartData = chartData.tcg.length > 0 || chartData.ebay.length > 0;

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              loadAll(true);
              loadCollectionValue();
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* ===============================
            TOP BAR
        =============================== */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Image
              source={require('../../assets/images/hub.png')}
              style={{ width: 200, height: 60 }}
              resizeMode="contain"
            />
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 4 }}>
              Collector Dashboard
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>

 {/* ☕ Ko-fi */}
  <TouchableOpacity
    onPress={() => Linking.openURL('https://ko-fi.com/stackr_')}
    style={{
      width: 46, height: 46,
      borderRadius: 14,
      backgroundColor: '#FF5E5B',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#e54e4b',
      ...cardShadow,
    }}
  >
    <Text style={{ fontSize: 20 }}>☕</Text>
  </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => router.push('/notifications')}
              style={{
                width: 46, height: 46,
                borderRadius: 14,
                backgroundColor: theme.colors.card,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
                ...cardShadow,
              }}
            >
              <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />
              {unreadCount > 0 && (
                <View style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 18, height: 18, borderRadius: 9,
                  backgroundColor: '#EF4444',
                  alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 4,
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/profile')}
              style={{
                width: 46, height: 46,
                borderRadius: 14,
                backgroundColor: theme.colors.card,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
                ...cardShadow,
              }}
            >
              <Ionicons name="person-circle-outline" size={26} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ===============================
            PORTFOLIO CARD
        =============================== */}
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 28,
          padding: 20,
          marginBottom: 22,
          borderWidth: 1,
          borderColor: theme.colors.border,
          overflow: 'hidden',
          ...cardShadow,
        }}>
          {/* Glow */}
          <View style={{
            position: 'absolute',
            width: 240, height: 240,
            borderRadius: 999,
            backgroundColor: 'rgba(108,75,255,0.08)',
            top: -80, right: -60,
          }} />

          <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700', marginBottom: 8 }}>
            Collection Value ({chartMode === 'EBAY' ? 'eBay' : 'TCG'})
          </Text>

          <Text style={{ color: theme.colors.text, fontSize: 38, fontWeight: '900', letterSpacing: -0.5 }}>
            {formatMoney(collectionTotal)}
          </Text>

          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Ionicons
              name={collectionUp ? 'arrow-up-circle' : 'arrow-down-circle'}
              size={18}
              color={collectionUp ? '#22C55E' : '#EF4444'}
            />
            <Text style={{ fontSize: 15, fontWeight: '800', color: collectionUp ? '#22C55E' : '#EF4444' }}>
              {formatSignedMoney(collectionChangeAmount)} ({formatSignedPercent(collectionChangePercent)}) today
            </Text>
          </View>

          <Text style={{ marginTop: 7, color: theme.colors.textSoft, fontSize: 12, fontWeight: '600' }}>
            Based on owned binder cards with available price snapshots
          </Text>

          {/* Chart */}
          <View style={{
            marginTop: 18,
            backgroundColor: theme.colors.surface,
            borderRadius: 20,
            padding: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            overflow: 'hidden',
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '800' }}>
                Portfolio trend
              </Text>
            </View>

            <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              {/* Chart mode tabs */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['TCG', 'EBAY', 'BOTH'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => setChartMode(mode)}
                    style={{
                      paddingHorizontal: 9, paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: chartMode === mode ? theme.colors.primary : theme.colors.card,
                      borderWidth: 1,
                      borderColor: chartMode === mode ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Text style={{
                      color: chartMode === mode ? '#FFFFFF' : theme.colors.textSoft,
                      fontSize: 11, fontWeight: '800',
                    }}>
                      {mode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Chart range tabs */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['1D', '7D', '30D', 'ALL'] as const).map((range) => (
                  <TouchableOpacity
                    key={range}
                    onPress={() => setChartRange(range)}
                    style={{
                      paddingHorizontal: 9, paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: chartRange === range ? theme.colors.primary : theme.colors.card,
                      borderWidth: 1,
                      borderColor: chartRange === range ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Text style={{
                      color: chartRange === range ? '#FFFFFF' : theme.colors.textSoft,
                      fontSize: 11, fontWeight: '800',
                    }}>
                      {range}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <LineChart
              data={{
                labels: activeChartValues.map(() => ''),
                datasets:
                  chartMode === 'BOTH'
                    ? [
                        {
                          data: equalTcg,
                          color: (opacity = 1) => `rgba(108,75,255,${opacity})`,
                        },
                        {
                          data: equalEbay,
                          color: (opacity = 1) => `rgba(234,179,8,${opacity})`,
                        },
                      ]
                    : [
                        {
                          data: activeChartValues,
                          color: (opacity = 1) =>
                            chartMode === 'EBAY'
                              ? `rgba(234,179,8,${opacity})`
                              : `rgba(108,75,255,${opacity})`,
                        },
                      ],
              }}
              width={screenWidth - 64}
              height={145}
              withDots={false}
              withInnerLines={true}
              withOuterLines={false}
              withVerticalLines={false}
              withHorizontalLines={true}
              fromZero={false}
              bezier
              chartConfig={{
                backgroundGradientFrom: theme.colors.card,
                backgroundGradientTo: theme.colors.card,
                decimalPlaces: 2,
                color: (opacity = 1) => `rgba(108,75,255,${opacity})`,
                labelColor: () => theme.colors.textSoft,
                propsForBackgroundLines: { stroke: '#E2E5EB' },
                propsForLabels: { fontSize: 9 },
              }}
              style={{ marginTop: 12, marginLeft: -18, borderRadius: 14 }}
            />

            {chartMode === 'BOTH' && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#6C4BFF' }} />
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800' }}>TCG</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#EAB308' }} />
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800' }}>eBay</Text>
                </View>
              </View>
            )}

           {!hasChartData && (
  <Text style={{ color: theme.colors.textSoft, fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 }}>
    No price history yet — check back tomorrow as your graph builds daily.
  </Text>
)}

<Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginTop: 6, fontStyle: 'italic' }}>
  📈 Prices update daily — your chart gets more accurate over time
</Text>
          </View>
        </View>

        {/* ===============================
            QUICK STATS
        =============================== */}
        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', marginBottom: 12 }}>
          Quick Stats
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 }}>
          <StatCard label="Owned cards" value={String(ownedCardCount)} />
          <StatCard label="Collection value" value={formatMoney(collectionTotal)} />
          <StatCard label="Tracked sets" value={String(trackedSetIds.length)} />
          <StatCard label="Available sets" value={totalSets > 0 ? String(totalSets) : '...'} />
          <StatCard label="Unpriced cards" value={String(unpricedCardCount)} />
          <StatCard label="Watchlist" value={String(watchlistCount)} />
        </View>

        {/* ===============================
            RECENT TRADE LISTINGS
        =============================== */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
            Recent Trade Listings
          </Text>
          <TouchableOpacity onPress={() => router.push('/trade')}>
            <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>
              View all
            </Text>
          </TouchableOpacity>
        </View>

        {recentListings.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingRight: 10, marginBottom: 24 }}
          >
            {recentListings.map((item, index) => {
              const preview = item.preview;
              const imageUri = preview?.image_url ?? null;
              const cardName = preview?.name ?? item.card_id ?? 'Unknown card';
              const setName = preview?.set_name ?? item.set_id ?? 'Unknown set';

              return (
                <TouchableOpacity
                  key={`${item.card_id}-${index}`}
                  onPress={() => router.push('/trade')}
                  style={{
                    width: 128,
                    backgroundColor: theme.colors.card,
                    borderRadius: 20,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    ...cardShadow,
                  }}
                  activeOpacity={0.8}
                >
                  {imageUri ? (
                    <Image
                      source={{ uri: imageUri }}
                      style={{ width: '100%', height: 130, marginBottom: 8 }}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={{
                      height: 130,
                      borderRadius: 16,
                      backgroundColor: theme.colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 8,
                    }}>
                      <Ionicons name="albums-outline" size={30} color={theme.colors.primary} />
                    </View>
                  )}

                  <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
                    {cardName}
                  </Text>
                  <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 3 }}>
                    {setName}
                  </Text>
                  {item.asking_price != null ? (
                    <Text style={{ color: '#22C55E', fontSize: 12, fontWeight: '900', marginTop: 8 }}>
                      £{Number(item.asking_price).toFixed(2)}
                    </Text>
                  ) : (
                    <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900', marginTop: 8 }}>
                      {item.condition ?? 'Listed'}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 16,
            padding: 16,
            marginBottom: 24,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}>
            <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>
              No active trade listings yet. Mark cards for trade in your binders.
            </Text>
          </View>
        )}

        {/* ===============================
            QUICK LINKS
        =============================== */}
        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', marginBottom: 12 }}>
          Quick Access
        </Text>

        <QuickLink icon="folder-open-outline" label="My Binders" onPress={() => router.push('/binder')} />
        <QuickLink icon="storefront-outline" label="Trade Marketplace" onPress={() => router.push('/trade')} />
        <QuickLink icon="swap-horizontal-outline" label="My Offers" onPress={() => router.push('/offers')} />
        <QuickLink icon="people-outline" label="Community" onPress={() => router.push('/community')} />
        <QuickLink
          icon="notifications-outline"
          label="Notifications"
          onPress={() => router.push('/notifications')}
          badge={unreadCount}
        />
      </ScrollView>

      {/* ===============================
          ONBOARDING MODAL
      =============================== */}
      <Modal visible={showOnboarding} transparent animationType="fade">
        <View
  pointerEvents="box-none"
  style={{
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  }}
>
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 24,
            padding: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            ...cardShadow,
          }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '900', marginBottom: 10 }}>
              {onboardingStep + 1} / {ONBOARDING_STEPS.length}
            </Text>

            <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900', marginBottom: 10 }}>
              {ONBOARDING_STEPS[onboardingStep].title}
            </Text>

            <Text style={{ color: theme.colors.textSoft, fontSize: 15, lineHeight: 22 }}>
              {ONBOARDING_STEPS[onboardingStep].body}
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              {onboardingStep > 0 && (
                <TouchableOpacity
                  onPress={() => setOnboardingStep((prev) => prev - 1)}
                  style={{
                    paddingVertical: 11, paddingHorizontal: 16,
                    borderRadius: 14,
                    backgroundColor: theme.colors.surface,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Back</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={async () => {
                  if (onboardingStep < ONBOARDING_STEPS.length - 1) {
                    setOnboardingStep((prev) => prev + 1);
                    return;
                  }

                  const { data: { user } } = await supabase.auth.getUser();

                  if (user) {
                    await supabase
                      .from('profiles')
                      .update({ has_seen_onboarding: true })
                      .eq('id', user.id)
                      .catch(() => {}); // non-fatal if column doesn't exist
                  }

                  setShowOnboarding(false);
                }}
                style={{
                  paddingVertical: 11, paddingHorizontal: 18,
                  borderRadius: 14,
                  backgroundColor: theme.colors.primary,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
                  {onboardingStep === ONBOARDING_STEPS.length - 1 ? 'Get started' : 'Next'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}