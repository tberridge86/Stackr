import { useTheme } from '../../components/theme-context';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../components/Text';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FeatureTipModal } from '../../components/FeatureTipModal';
import { useAppMode } from '../../components/app-mode-context';
import { fetchBinders, fetchBinderCards } from '../../lib/binders';
import { supabase } from '../../lib/supabase';
import { createActivityPost } from '../../lib/activity';
import { PRICE_API_URL } from '../../lib/config';

// ===============================
// TYPES
// ===============================

type ChartRange = '7D' | '30D';
type DailyMover = {
  cardId: string;
  name: string;
  setName: string;
  imageUrl: string | null;
  latest: number;
  previous: number;
  change: number;
  percent: number;
};
type HubListing = {
  id?: string;
  user_id?: string;
  card_id: string;
  set_id: string | null;
  condition?: string | null;
  asking_price?: number | null;
  listing_status?: string | null;
  updated_at?: string | null;
  preview?: {
    card_id: string;
    name?: string | null;
    image_url?: string | null;
    set_name?: string | null;
  } | null;
};

// ===============================
// CONSTANTS
// ===============================


const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const HUB_TIP_STORAGE_KEY = 'stackr:feature-tip-dismissed:hub-overview-v1';

const HUB_TIP_ITEMS = [
  {
    icon: 'analytics-outline' as const,
    title: 'Dashboard value',
    body: 'See your collection total, trend graph, and daily movement.',
  },
  {
    icon: 'trending-up-outline' as const,
    title: 'Top movers',
    body: 'Spot the cards causing your value to rise or fall.',
  },
  {
    icon: 'grid-outline' as const,
    title: 'Quick actions',
    body: 'Scan a card, check values, and build fair prices quickly.',
  },
];

// ===============================
// HELPERS
// ===============================

const formatMoney = (value: number) => `£${value.toFixed(2)}`;
const formatSignedMoney = (value: number) => `${value > 0 ? '+' : ''}£${value.toFixed(2)}`;
const formatSignedPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

const toDayKey = (value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().split('T')[0];
};

const buildDayKeys = (range: ChartRange, availableDays: string[]) => {
  const anchor = availableDays.length
    ? new Date(availableDays[availableDays.length - 1])
    : new Date();
  anchor.setHours(0, 0, 0, 0);

  const count = range === '7D' ? 8 : 31;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() - (count - 1 - index));
    return toDayKey(date);
  });
};

const getSnapshotPriceGbp = (row: any): number | null => {
  if (!row) return null;
  if (typeof row.tcg_mid === 'number') return row.tcg_mid;
  if (typeof row.tcg_low === 'number') return row.tcg_low;
  return null;
};

const normaliseChartValues = (values: number[]): number[] =>
  values.length >= 2 ? values : values.length === 1 ? [values[0], values[0]] : [0, 0];

const buildFallbackTrend = (latestTotal: number, range: ChartRange) => {
  if (latestTotal <= 0) return [];
  const count = range === '7D' ? 8 : 31;
  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    const baseline = latestTotal * (0.975 + progress * 0.025);
    const wiggle = Math.sin(index * 1.7) * latestTotal * 0.003;
    return Number((index === count - 1 ? latestTotal : baseline + wiggle).toFixed(2));
  });
};

// ===============================
// SUB COMPONENTS
// ===============================

function HubQuickAction({ icon, label, onPress }: {
  icon: any;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        flex: 1,
        minHeight: 82,
        backgroundColor: theme.colors.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
        paddingVertical: 12,
        ...cardShadow,
      }}
    >
      <View style={{
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
      }}>
        <Ionicons name={icon} size={19} color={theme.colors.primary} />
      </View>
      <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900', textAlign: 'center' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
// ===============================
// MAIN COMPONENT
// ===============================

export default function HubScreen() {
  const { theme, isDark } = useTheme();
  const { hasChosenMode, setMode } = useAppMode();
  const { width: screenWidth } = useWindowDimensions();

  const [hubTipOpen, setHubTipOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  // Hamburger menu
  const [menuOpen, setMenuOpen] = useState(false);

  // Bug report modal
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [bugText, setBugText] = useState('');
  const [bugSubmitting, setBugSubmitting] = useState(false);

  // Feedback modal
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  // Chart
  const [chartRange, setChartRange] = useState<ChartRange>('7D');
  const [chartData, setChartData] = useState<number[]>([]);
  const [chartIsPreview, setChartIsPreview] = useState(false);

  // Collection value
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionChangeAmount, setCollectionChangeAmount] = useState(0);
  const [collectionChangePercent, setCollectionChangePercent] = useState(0);
  const [dailyMovers, setDailyMovers] = useState<DailyMover[]>([]);

  // Stats
  const [ownedCardCount, setOwnedCardCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  // Recent trade listings
  const [recentListings, setRecentListings] = useState<HubListing[]>([]);
  const [marketplaceMatches, setMarketplaceMatches] = useState<HubListing[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  const valuePostKeyRef = useRef<string | null>(null);
  const collectionUp = collectionChangeAmount >= 0;

  // ===============================
  // SUBMIT BUG REPORT
  // ===============================

  const submitBugReport = async () => {
    if (!bugText.trim()) return;
    setBugSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase.from('profiles').select('collector_name').eq('id', user.id).maybeSingle()
        : { data: null };
      const collectorName = profile?.collector_name ?? user?.email ?? 'Anonymous';
      await fetch(`${PRICE_API_URL}/api/discord/bug-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: bugText.trim(), collectorName }),
      });
      setBugText('');
      setBugModalOpen(false);
      Alert.alert('Thanks!', 'Your bug report has been sent to the team.');
    } catch {
      Alert.alert('Error', 'Could not send bug report. Please try again.');
    } finally {
      setBugSubmitting(false);
    }
  };

  // ===============================
  // SUBMIT FEEDBACK
  // ===============================

  const submitFeedback = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase.from('profiles').select('collector_name').eq('id', user.id).maybeSingle()
        : { data: null };
      const collectorName = profile?.collector_name ?? user?.email ?? 'Anonymous';
      await fetch(`${PRICE_API_URL}/api/discord/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: feedbackText.trim(), collectorName }),
      });
      setFeedbackText('');
      setFeedbackModalOpen(false);
      Alert.alert('Thanks!', 'Your feedback has been sent to the team.');
    } catch {
      Alert.alert('Error', 'Could not send feedback. Please try again.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  // ===============================
  // LOAD ALL DATA
  // ===============================

  const loadAll = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);

      const { data: { user } } = await supabase.auth.getUser();

      const [notificationsResult] = await Promise.all([
        user
          ? supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false)
          : Promise.resolve({ count: 0 }),
      ]);

      setUnreadCount((notificationsResult as any).count ?? 0);

      if (user) {
        const { data: flagData } = await supabase
          .from('user_card_flags')
          .select('id, user_id, card_id, set_id, condition, asking_price, listing_status, updated_at')
          .eq('flag_type', 'trade')
          .eq('listing_status', 'active')
          .neq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(8);

        const { data: wantedRows } = await supabase
          .from('market_watchlist')
          .select('card_id, set_id')
          .eq('user_id', user.id);

        if (flagData?.length) {
          const cardIds = [...new Set(flagData.map((f) => f.card_id))];
          const { data: previews } = await supabase
            .from('card_previews')
            .select('card_id, name, image_url, set_name')
            .in('card_id', cardIds);
          const previewMap: Record<string, any> = {};
          (previews ?? []).forEach((p: any) => { previewMap[p.card_id] = p; });
          setRecentListings(flagData.map((flag) => ({ ...flag, preview: previewMap[flag.card_id] ?? null })));
        } else {
          setRecentListings([]);
        }

        const wantedCards = wantedRows ?? [];
        if (wantedCards.length) {
          const wantedCardIds = [...new Set(wantedCards.map((row) => row.card_id).filter(Boolean))];
          const wantedSetKeys = new Set(wantedCards.map((row) => `${row.card_id}:${row.set_id ?? ''}`));
          const wantedAnySetKeys = new Set(wantedCards.filter((row) => !row.set_id).map((row) => row.card_id));

          if (!wantedCardIds.length) {
            setMarketplaceMatches([]);
            return;
          }

          const { data: matchData } = await supabase
            .from('user_card_flags')
            .select('id, user_id, card_id, set_id, condition, asking_price, listing_status, updated_at')
            .eq('flag_type', 'trade')
            .eq('listing_status', 'active')
            .neq('user_id', user.id)
            .in('card_id', wantedCardIds)
            .order('updated_at', { ascending: false })
            .limit(12);

          const strictMatches = (matchData ?? []).filter((listing) => (
            wantedAnySetKeys.has(listing.card_id) ||
            wantedSetKeys.has(`${listing.card_id}:${listing.set_id ?? ''}`)
          ));

          if (strictMatches.length) {
            const cardIds = [...new Set(strictMatches.map((listing) => listing.card_id))];
            const { data: previews } = await supabase
              .from('card_previews')
              .select('card_id, name, image_url, set_name')
              .in('card_id', cardIds);
            const previewMap: Record<string, any> = {};
            (previews ?? []).forEach((p: any) => { previewMap[p.card_id] = p; });
            setMarketplaceMatches(strictMatches.slice(0, 4).map((listing) => ({
              ...listing,
              preview: previewMap[listing.card_id] ?? null,
            })));
          } else {
            setMarketplaceMatches([]);
          }
        } else {
          setMarketplaceMatches([]);
        }
      }
    } catch (error) {
      console.log('Hub load failed', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // ===============================
  // LOAD COLLECTION VALUE
  // ===============================

  const loadCollectionValue = useCallback(async () => {
    try {
      const binders = await fetchBinders();
      const allCards = (await Promise.all(binders.map((b) => fetchBinderCards(b.id)))).flat();
      const ownedCards = allCards.filter((c) => c.owned);
      setOwnedCardCount(ownedCards.length);

      const storedCardIds = [...new Set(ownedCards.map((c) => c.card_id))];
      const getSnapshotIdsForCard = (card: any) => [
        ...new Set([card.card_id, card.api_card_id].filter(Boolean)),
      ] as string[];
      const snapshotCardIds = [...new Set(ownedCards.flatMap((card: any) => getSnapshotIdsForCard(card)))];

      if (!storedCardIds.length) {
        setCollectionTotal(0);
        setCollectionChangeAmount(0);
        setCollectionChangePercent(0);
        setChartData([]);
        setChartIsPreview(false);
        setDailyMovers([]);
        return;
      }

      const snapshotColumns = 'user_id, card_id, tcg_mid, tcg_low, snapshot_at';
      const globalSnapshotsResult = await supabase
        .from('market_price_snapshots')
        .select(snapshotColumns)
        .in('card_id', snapshotCardIds)
        .is('user_id', null)
        .or('tcg_mid.not.is.null,tcg_low.not.is.null')
        .order('snapshot_at', { ascending: false })
        .limit(1000);

      if (globalSnapshotsResult.error) {
        throw globalSnapshotsResult.error;
      }

      const data = globalSnapshotsResult.data ?? [];
      const snapshotByCardDay = new Map<string, any>();
      for (const row of data) {
        snapshotByCardDay.set(`${row.card_id}:${String(row.snapshot_at).split('T')[0]}`, row);
      }
      const snapshotRows = [...snapshotByCardDay.values()].sort(
        (a, b) => new Date(a.snapshot_at).getTime() - new Date(b.snapshot_at).getTime()
      );
      const snapshotDays = new Set(snapshotRows.map((row) => String(row.snapshot_at).split('T')[0]));

      // Group snapshots by card and by day. Collection value is TCG-only, using shared public daily snapshots.
      const groupedByCard: Record<string, any[]> = {};
      const groupedByDay: Record<string, Record<string, number>> = {};

      for (const row of snapshotRows) {
        if (!groupedByCard[row.card_id]) groupedByCard[row.card_id] = [];
        groupedByCard[row.card_id].push(row);

        const day = String(row.snapshot_at).split('T')[0];
        if (!groupedByDay[day]) groupedByDay[day] = {};

        const priceGbp = getSnapshotPriceGbp(row);
        if (priceGbp != null) groupedByDay[day][row.card_id] = priceGbp;
      }

      let totalLatest = 0;
      let totalPrevious = 0;
      let cardsWithPrevious = 0;
      const moverRows: DailyMover[] = [];

      for (const card of ownedCards) {
        const snapshots = getSnapshotIdsForCard(card)
          .flatMap((cardId) => groupedByCard[cardId] ?? [])
          .sort((a, b) => new Date(a.snapshot_at).getTime() - new Date(b.snapshot_at).getTime());
        const latest = snapshots[snapshots.length - 1];
        const previous = snapshots[snapshots.length - 2];

        const latestGbp = getSnapshotPriceGbp(latest);
        const previousGbp = getSnapshotPriceGbp(previous);

        if (latestGbp != null) {
          totalLatest += latestGbp;
        }

        if (latestGbp != null && previousGbp != null) {
          totalPrevious += previousGbp;
          cardsWithPrevious += 1;
          const cardChange = latestGbp - previousGbp;
          if (cardChange !== 0) {
            moverRows.push({
              cardId: card.card_id,
              name: card.card_name ?? card.card?.name ?? card.card_id,
              setName: card.set_name ?? card.card?.set?.name ?? card.set_id ?? '',
              imageUrl: card.image_url ?? card.card?.images?.small ?? null,
              latest: latestGbp,
              previous: previousGbp,
              change: cardChange,
              percent: previousGbp !== 0 ? (cardChange / previousGbp) * 100 : 0,
            });
          }
        }
      }

      const change = cardsWithPrevious > 0 ? totalLatest - totalPrevious : 0;
      const percent = cardsWithPrevious > 0 && totalPrevious !== 0
        ? (change / totalPrevious) * 100
        : 0;

      const days = buildDayKeys(chartRange, Object.keys(groupedByDay).sort());

      const latestByCard: Record<string, number> = {};
      const chartValues = days.map((day) => {
        const pricesForDay = groupedByDay[day] ?? {};
        Object.entries(pricesForDay).forEach(([cardId, price]) => {
          if (typeof price === 'number') latestByCard[cardId] = price;
        });
        let dayTotal = 0;
        for (const card of ownedCards as any[]) {
          const price = getSnapshotIdsForCard(card)
            .map((cardId) => latestByCard[cardId])
            .find((value) => typeof value === 'number');
          if (typeof price === 'number') dayTotal += price;
        }
        return dayTotal;
      }).filter((v) => Number.isFinite(v) && v > 0);

      const hasRealChartHistory = chartValues.length >= 2;
      const displayChartValues = hasRealChartHistory
        ? chartValues
        : buildFallbackTrend(totalLatest, chartRange);
      const debugText = [
        `owned=${ownedCards.length}`,
        `ids=${snapshotCardIds.length}`,
        `publicTcg=${globalSnapshotsResult.data?.length ?? 0}`,
        `rows=${snapshotRows.length}`,
        `days=${snapshotDays.size}`,
        `points=${chartValues.length}`,
      ].join(' ');
      console.log('Hub price chart debug:', debugText);

      setCollectionTotal(totalLatest);
      setCollectionChangeAmount(change);
      setCollectionChangePercent(percent);
      setChartData(displayChartValues);
      setChartIsPreview(!hasRealChartHistory && displayChartValues.length > 0);
      setDailyMovers(moverRows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3));

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
            }).catch((err) => console.log('Failed to create value activity post', err));
          }
        }
      }
    } catch (error) {
      console.log('Failed to calculate collection value', error);
      setCollectionTotal(0);
      setCollectionChangeAmount(0);
      setCollectionChangePercent(0);
      setChartData([]);
      setChartIsPreview(false);
      setDailyMovers([]);
    }
  }, [chartRange]);


  const checkHubTip = useCallback(async () => {
    try {
      const dismissed = await AsyncStorage.getItem(HUB_TIP_STORAGE_KEY);
      if (dismissed !== 'true') setHubTipOpen(true);
    } catch (error) {
      console.log('Hub tip check failed', error);
    }
  }, []);

  const closeHubTip = useCallback(async (dontShowAgain: boolean) => {
    setHubTipOpen(false);
    if (!dontShowAgain) return;
    try {
      await AsyncStorage.setItem(HUB_TIP_STORAGE_KEY, 'true');
    } catch (error) {
      console.log('Hub tip dismiss failed', error);
    }
  }, []);

  // ===============================
  // EFFECTS
  // ===============================

  useFocusEffect(useCallback(() => {
    loadAll();
    loadCollectionValue();
  }, [loadAll, loadCollectionValue]));

  useEffect(() => {
    if (!hasChosenMode) {
      setRoleModalOpen(true);
      return;
    }
    checkHubTip();
  }, [checkHubTip, hasChosenMode]);
  useEffect(() => { loadCollectionValue(); }, [chartRange, loadCollectionValue]);

  // ===============================
  // CHART DATA
  // ===============================

  const activeChartValues = normaliseChartValues(chartData);
  const hasChartData = chartData.length > 0;

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
      {/* BACKGROUND DECORATION */}
      {!isDark && (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', width: 320, height: 320, borderRadius: 999, backgroundColor: 'rgba(108,75,255,0.09)', top: -100, right: -100 }} />
          <View pointerEvents="none" style={{ position: 'absolute', width: 240, height: 240, borderRadius: 999, backgroundColor: 'rgba(255,200,77,0.20)', top: 260, left: -90 }} />
          <View pointerEvents="none" style={{ position: 'absolute', width: 200, height: 200, borderRadius: 999, backgroundColor: 'rgba(108,75,255,0.06)', bottom: 120, right: -70 }} />
        </>
      )}
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { loadAll(true); loadCollectionValue(); }}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* TOP BAR */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Image source={require('../../assets/images/hub.png')} style={{ width: Math.min(180, screenWidth - 178), height: 60 }} resizeMode="contain" />
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 4 }}>Collector Dashboard</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 4, flexShrink: 0, transform: [{ translateX: -2 }] }}>
            <TouchableOpacity
              onPress={() => setHubTipOpen(true)}
              style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}
            >
              <Ionicons name="information-circle-outline" size={22} color={theme.colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/notifications')}
              style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}
            >
              <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />
              {unreadCount > 0 && (
                <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setMenuOpen(true)}
              style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}
            >
              <Ionicons name="menu-outline" size={26} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <HubQuickAction
            icon="scan-outline"
            label="Scan Card"
            onPress={() => router.push({ pathname: '/scan', params: { mode: 'market' } })}
          />
          <HubQuickAction icon="calculator-outline" label="Price Builder" onPress={() => router.push('/price-builder')} />
          <HubQuickAction icon="trending-up-outline" label="Market Value" onPress={() => router.push('/market')} />
          <HubQuickAction icon="sparkles-outline" label="Card Grader" onPress={() => router.push('/grade')} />
        </View>

        {/* PORTFOLIO CARD */}
        <View style={{ backgroundColor: theme.colors.card, borderRadius: 20, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', ...cardShadow }}>
          <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 999, backgroundColor: 'rgba(108,75,255,0.10)', top: -80, right: -70 }} />

          <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 2 }}>
            {(['7D', '30D'] as const).map((range) => (
              <TouchableOpacity
                key={range}
                onPress={() => setChartRange(range)}
                style={{ height: 28, minWidth: 38, paddingHorizontal: 9, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: chartRange === range ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: chartRange === range ? theme.colors.primary : theme.colors.border }}
              >
                <Text style={{ color: chartRange === range ? '#FFFFFF' : theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>{range}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => Alert.alert('TCG Market Value', 'Based on owned binder cards using shared daily TCG snapshot prices.')}
              style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }}
              activeOpacity={0.75}
            >
              <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSoft} />
            </TouchableOpacity>
          </View>

          <View style={{ paddingRight: 124 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', marginBottom: 4 }}>
              TCG Market Value
            </Text>
          </View>

          <View style={{ marginTop: 2, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ flexShrink: 1, color: theme.colors.text, fontSize: 28, fontWeight: '900' }}>
              {formatMoney(collectionTotal)}
            </Text>
            <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 12, backgroundColor: collectionUp ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)' }}>
              <Ionicons name={collectionUp ? 'arrow-up-circle' : 'arrow-down-circle'} size={15} color={collectionUp ? '#22C55E' : '#EF4444'} />
              <Text style={{ fontSize: 12, fontWeight: '900', color: collectionUp ? '#22C55E' : '#EF4444' }}>
                {formatSignedMoney(collectionChangeAmount)} ({formatSignedPercent(collectionChangePercent)})
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 8, height: 152, backgroundColor: theme.colors.surface, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
            {hasChartData ? (
              <LineChart
                data={{
                  labels: activeChartValues.map(() => ''),
                  datasets: [
                    { data: activeChartValues, color: (opacity = 1) => `rgba(108,75,255,${opacity})` },
                  ],
                }}
                width={Math.max(320, screenWidth - 44)}
                height={152}
                withDots={false}
                withInnerLines={false}
                withOuterLines={false}
                withVerticalLines={false}
                withHorizontalLines={false}
                withHorizontalLabels={false}
                withVerticalLabels={false}
                fromZero={false}
                bezier
                chartConfig={{
                  backgroundGradientFrom: theme.colors.surface,
                  backgroundGradientTo: theme.colors.surface,
                  decimalPlaces: 2,
                  color: (opacity = 1) => `rgba(108,75,255,${opacity})`,
                  labelColor: () => theme.colors.textSoft,
                  propsForBackgroundLines: { stroke: 'transparent' },
                  propsForLabels: { fontSize: 9 },
                }}
                style={{ marginTop: 0, marginLeft: -28, borderRadius: 14 }}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
                <Ionicons name="analytics-outline" size={24} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 8 }}>
                No price history yet. Check back after the next daily snapshot.
                </Text>
              </View>
            )}
            {chartIsPreview && (
              <View style={{ position: 'absolute', top: 10, left: 10, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}>
                <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '900' }}>Preview trend</Text>
              </View>
            )}
          </View>
        </View>

        {dailyMovers.length > 0 && (
          <View style={{ marginBottom: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Top 3 Movers Today</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="swap-vertical" size={16} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>TCG daily</Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 10 }}>
              {dailyMovers.map((mover, index) => {
                const movementColor = mover.change >= 0 ? '#22C55E' : '#EF4444';
                return (
                  <View
                    key={`${mover.cardId}-${index}`}
                    style={{
                      width: 150,
                      backgroundColor: theme.colors.card,
                      borderRadius: 18,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      ...cardShadow,
                    }}
                  >
                    <View style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, backgroundColor: movementColor, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>#{index + 1}</Text>
                    </View>
                    {mover.imageUrl ? (
                      <Image source={{ uri: mover.imageUrl }} style={{ width: '100%', height: 142, marginBottom: 8 }} resizeMode="contain" />
                    ) : (
                      <View style={{ height: 142, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                        <Ionicons name="albums-outline" size={30} color={theme.colors.primary} />
                      </View>
                    )}
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>{mover.name}</Text>
                    <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 3 }}>{mover.setName}</Text>
                    <Text style={{ color: movementColor, fontSize: 15, fontWeight: '900', marginTop: 8 }}>{formatSignedMoney(mover.change)}</Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginTop: 2 }}>
                      {formatSignedPercent(mover.percent)} to {formatMoney(mover.latest)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* RECENT TRADE LISTINGS */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Recent Trade Listings</Text>
          <TouchableOpacity onPress={() => router.push('/trade')}>
            <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>View all</Text>
          </TouchableOpacity>
        </View>

        {recentListings.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 10, marginBottom: 22 }}>
            {recentListings.map((item, index) => {
              const preview = item.preview;
              const imageUri = preview?.image_url ?? null;
              const cardName = preview?.name ?? item.card_id ?? 'Unknown card';
              const setName = preview?.set_name ?? item.set_id ?? 'Unknown set';
              return (
                <TouchableOpacity
                  key={`${item.card_id}-${index}`}
                  onPress={() => router.push('/trade')}
                  style={{ width: 128, backgroundColor: theme.colors.card, borderRadius: 20, padding: 10, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}
                  activeOpacity={0.8}
                >
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={{ width: '100%', height: 130, marginBottom: 8 }} resizeMode="contain" />
                  ) : (
                    <View style={{ height: 130, borderRadius: 16, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                      <Ionicons name="albums-outline" size={30} color={theme.colors.primary} />
                    </View>
                  )}
                  <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>{cardName}</Text>
                  <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 3 }}>{setName}</Text>
                  {item.asking_price != null ? (
                    <Text style={{ color: '#22C55E', fontSize: 12, fontWeight: '900', marginTop: 8 }}>{formatMoney(Number(item.asking_price))}</Text>
                  ) : (
                    <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900', marginTop: 8 }}>{item.condition ?? 'Listed'}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 16, padding: 16, marginBottom: 22, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>No active trade listings yet. Mark cards for trade in your binders.</Text>
          </View>
        )}

        {/* MARKETPLACE MATCHES */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Marketplace Matches</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 3 }}>Wanted cards listed by other collectors</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/trade')}>
            <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>View all</Text>
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: theme.colors.card, borderRadius: 22, padding: 12, marginBottom: 22, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}>
          {marketplaceMatches.length > 0 ? (
            marketplaceMatches.map((item, index) => {
              const preview = item.preview;
              const imageUri = preview?.image_url ?? null;
              const cardName = preview?.name ?? item.card_id ?? 'Wanted card';
              const setName = preview?.set_name ?? item.set_id ?? 'Unknown set';
              return (
                <TouchableOpacity
                  key={`${item.id ?? item.card_id}-${index}`}
                  onPress={() => router.push('/trade')}
                  activeOpacity={0.82}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderBottomWidth: index === marketplaceMatches.length - 1 ? 0 : 1,
                    borderBottomColor: theme.colors.border,
                    gap: 10,
                  }}
                >
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={{ width: 42, height: 58, borderRadius: 6 }} resizeMode="contain" />
                  ) : (
                    <View style={{ width: 42, height: 58, borderRadius: 8, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="albums-outline" size={20} color={theme.colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>{cardName}</Text>
                    <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 3 }}>{setName}</Text>
                    <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '900', marginTop: 4 }}>{item.condition ?? 'Listed'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    {item.asking_price != null && (
                      <Text style={{ color: '#22C55E', fontSize: 13, fontWeight: '900' }}>{formatMoney(Number(item.asking_price))}</Text>
                    )}
                    <View style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>View</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={{ padding: 18, alignItems: 'center' }}>
              <Ionicons name="sparkles-outline" size={28} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900', marginTop: 8, textAlign: 'center' }}>No wanted matches yet</Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 5, lineHeight: 18, textAlign: 'center' }}>
                Add cards to your market watchlist and matching trade listings will appear here.
              </Text>
            </View>
          )}
        </View>

        {/* ACHIEVEMENTS */}
        <View style={{ backgroundColor: theme.colors.card, borderRadius: 22, padding: 16, marginBottom: 22, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Achievements</Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 4 }}>
                Badges, streaks, and set milestones will live here.
              </Text>
            </View>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(108,75,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="ribbon-outline" size={28} color={theme.colors.primary} />
            </View>
          </View>
          <View style={{ marginTop: 14, height: 9, borderRadius: 999, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, Math.max(8, ownedCardCount > 0 ? 48 : 8))}%`, height: '100%', backgroundColor: theme.colors.primary, borderRadius: 999 }} />
          </View>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', marginTop: 8 }}>
            {ownedCardCount > 0 ? `${ownedCardCount} cards tracked so far` : 'Start scanning to unlock your first badge'}
          </Text>
        </View>

      </ScrollView>

      <FeatureTipModal
        visible={hubTipOpen}
        title="Welcome to the Hub"
        subtitle="Your home base for value, trading, community, and quick price checks."
        items={HUB_TIP_ITEMS}
        onClose={closeHubTip}
      />

      <Modal visible={roleModalOpen} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(8,10,20,0.48)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}>
            <TouchableOpacity
              onPress={async () => { await setMode('collector'); setRoleModalOpen(false); }}
              style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
              activeOpacity={0.75}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSoft} />
            </TouchableOpacity>

            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <View style={{ width: 164, height: 122, marginBottom: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                <View style={{ position: 'absolute', top: 12, left: 6 }}>
                  <Ionicons name="sparkles" size={16} color={theme.colors.primary} />
                </View>
                <View style={{ position: 'absolute', top: 18, right: 14 }}>
                  <Ionicons name="sparkles" size={15} color={theme.colors.primary} />
                </View>
                <View style={{ width: 126, height: 16, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: theme.colors.primary, borderWidth: 1, borderColor: theme.colors.text }} />
                <View style={{ flexDirection: 'row', width: 126, height: 24, overflow: 'hidden' }}>
                  {[0, 1, 2, 3].map((index) => (
                    <View
                      key={index}
                      style={{
                        flex: 1,
                        backgroundColor: index % 2 === 0 ? '#FFFFFF' : theme.colors.primary,
                        borderBottomLeftRadius: index === 0 ? 8 : 0,
                        borderBottomRightRadius: index === 3 ? 8 : 0,
                        borderWidth: 1,
                        borderColor: theme.colors.primary,
                      }}
                    />
                  ))}
                </View>
                <View style={{ width: 110, height: 54, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderBottomWidth: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      require('../../assets/binders/pikachu.png'),
                      require('../../assets/binders/charizard.png'),
                      require('../../assets/binders/eevee.png'),
                    ].map((source, index) => (
                      <View key={index} style={{ width: 24, height: 34, borderRadius: 4, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                        <Image source={source} style={{ width: 18, height: 26, borderRadius: 3 }} resizeMode="cover" />
                      </View>
                    ))}
                  </View>
                </View>
                <View style={{ width: 140, height: 7, borderRadius: 999, backgroundColor: theme.colors.text }} />
                <View style={{ position: 'absolute', right: 6, bottom: 0 }}>
                  <View style={{ width: 56, height: 32, borderRadius: 4, backgroundColor: theme.colors.primary, opacity: 0.85, borderWidth: 1, borderColor: theme.colors.text }} />
                  <View style={{ position: 'absolute', right: 16, bottom: 28, width: 46, height: 36, borderRadius: 4, backgroundColor: theme.colors.secondary, borderWidth: 1, borderColor: theme.colors.text, alignItems: 'center', justifyContent: 'center' }}>
                    <Image source={require('../../assets/images/icon.png')} style={{ width: 23, height: 23 }} resizeMode="contain" />
                    <Ionicons name="checkmark-circle" size={17} color={theme.colors.primary} style={{ position: 'absolute', right: -7, top: -8 }} />
                  </View>
                </View>
              </View>

              <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' }}>Seller mode</Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
                If you&apos;re selling, trading, or running a business, use Seller mode to manage inventory. Scan sold cards to remove them from your collection and keep stock accurate at conventions, events, or in-store.
              </Text>
            </View>

            {[
              { icon: 'scan-outline' as const, text: 'Scan sold cards to remove them from your collection' },
              { icon: 'bar-chart-outline' as const, text: 'Keep inventory accurate on the go' },
              { icon: 'storefront-outline' as const, text: 'Perfect for conventions, events, and stores' },
            ].map((item) => (
              <View key={item.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: `${theme.colors.primary}12`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={item.icon} size={20} color={theme.colors.primary} />
                </View>
                <Text style={{ flex: 1, color: theme.colors.text, fontSize: 13, fontWeight: '800', lineHeight: 18 }}>{item.text}</Text>
              </View>
            ))}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: `${theme.colors.primary}12`, borderRadius: 14, padding: 12, marginTop: 2, marginBottom: 12 }}>
              <Ionicons name="sparkles-outline" size={18} color={theme.colors.primary} />
              <Text style={{ flex: 1, color: theme.colors.text, fontSize: 12, fontWeight: '800' }}>
                Default scan mode adds cards to your binder.
              </Text>
            </View>

            <TouchableOpacity
              onPress={async () => { await setMode('seller'); setRoleModalOpen(false); }}
              style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10 }}
              activeOpacity={0.86}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>Got it</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => { await setMode('collector'); setRoleModalOpen(false); }}
              style={{ backgroundColor: theme.colors.card, borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.primary }}
              activeOpacity={0.78}
            >
              <Text style={{ color: theme.colors.primary, fontSize: 15, fontWeight: '900' }}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* HAMBURGER MENU */}
      <Modal visible={menuOpen} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setMenuOpen(false)}>
          <Pressable
            style={{ position: 'absolute', top: 80, right: 16, backgroundColor: theme.colors.card, borderRadius: 20, padding: 8, borderWidth: 1, borderColor: theme.colors.border, minWidth: 220, ...cardShadow }}
            onPress={() => {}}
          >
            <TouchableOpacity onPress={() => { setMenuOpen(false); router.push('/profile'); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 12 }} activeOpacity={0.7}>
              <Ionicons name="person-circle-outline" size={22} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 15 }}>My Profile</Text>
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 8 }} />

            <TouchableOpacity onPress={() => { setMenuOpen(false); Linking.openURL('https://ko-fi.com/stackr_'); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 12 }} activeOpacity={0.7}>
              <Text style={{ fontSize: 20, width: 22, textAlign: 'center' }}>☕</Text>
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 15 }}>Support on Ko-fi</Text>
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 8 }} />

            <TouchableOpacity onPress={() => { setMenuOpen(false); setBugModalOpen(true); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 12 }} activeOpacity={0.7}>
              <Ionicons name="bug-outline" size={22} color="#EF4444" />
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 15 }}>Report a Bug</Text>
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: 8 }} />

            <TouchableOpacity onPress={() => { setMenuOpen(false); setFeedbackModalOpen(true); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 12 }} activeOpacity={0.7}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 15 }}>Send Feedback</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* BUG REPORT MODAL */}
      <Modal visible={bugModalOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', marginBottom: 6 }}>Report a Bug</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginBottom: 16 }}>Describe what happened and we&apos;ll look into it.</Text>
            <TextInput
              value={bugText}
              onChangeText={setBugText}
              placeholder="e.g. The scan screen crashes when I..."
              placeholderTextColor={theme.colors.textSoft}
              multiline
              style={{ backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border, minHeight: 120, textAlignVertical: 'top', marginBottom: 16 }}
            />
            <TouchableOpacity onPress={submitBugReport} disabled={bugSubmitting || !bugText.trim()} style={{ backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10, opacity: bugSubmitting || !bugText.trim() ? 0.5 : 1 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>{bugSubmitting ? 'Sending...' : 'Send Bug Report'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setBugModalOpen(false); setBugText(''); }} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: theme.colors.textSoft, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FEEDBACK MODAL */}
      <Modal visible={feedbackModalOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', marginBottom: 6 }}>Send Feedback</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginBottom: 16 }}>Ideas, suggestions, or anything else - we&apos;d love to hear it.</Text>
            <TextInput
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="e.g. It would be great if I could..."
              placeholderTextColor={theme.colors.textSoft}
              multiline
              style={{ backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border, minHeight: 120, textAlignVertical: 'top', marginBottom: 16 }}
            />
            <TouchableOpacity onPress={submitFeedback} disabled={feedbackSubmitting || !feedbackText.trim()} style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10, opacity: feedbackSubmitting || !feedbackText.trim() ? 0.5 : 1 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>{feedbackSubmitting ? 'Sending...' : 'Send Feedback'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setFeedbackModalOpen(false); setFeedbackText(''); }} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: theme.colors.textSoft, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
