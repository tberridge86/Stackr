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
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FeatureTipModal } from '../../components/FeatureTipModal';
import { useAppMode } from '../../components/app-mode-context';
import { fetchBinders, fetchBinderCards, type BinderCardRecord, type BinderRecord } from '../../lib/binders';
import { supabase } from '../../lib/supabase';
import { createActivityPost } from '../../lib/activity';
import { PRICE_API_URL, USD_TO_GBP } from '../../lib/config';
import { ValueTrackerCard } from '../../components/ValueTrackerCard';
import {
  ChaseOrMissingSection,
  ContinueBinderCard,
  HomeActionsRow,
  TradeProtectionSummaryCard,
  TradeableDuplicatesCard,
  RecentActivitySection,
  type HomeActivityItem,
  type HomeBinderSummary,
  type HomeCardPreview,
  type HomeDuplicateItem,
  type HomeDuplicateSummary,
} from '../../components/HomeCommandCenter';
import { loadInventoryMovements, type InventoryMovement } from '../../lib/inventory';

// ===============================
// TYPES
// ===============================

type ChartRange = '7D' | '30D';
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

type HomeBinderCard = BinderCardRecord & {
  __binderId: string;
  __binderEdition: string | null;
  __masterSetEnabled: boolean;
};

type HomeBinderCardGroup = {
  binder: BinderRecord;
  cards: HomeBinderCard[];
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
const HOME_MASTER_SET_STORAGE_PREFIX = 'stackr:binder-master-set:';

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

const formatMoney = (value: number) => `\u00A3${value.toFixed(2)}`;
const formatSignedMoney = (value: number) => `${value > 0 ? '+' : ''}\u00A3${value.toFixed(2)}`;
const formatSignedPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

const EMPTY_DUPLICATE_SUMMARY: HomeDuplicateSummary = {
  count: 0,
  estimatedValue: 0,
  items: [],
};

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

const TCG_PRICE_VARIANT_PRIORITY = [
  'holofoil',
  'reverseHolofoil',
  'reverseHoloEnergy',
  'reverseHoloPokeball',
  'normal',
  'unlimitedHolofoil',
  'unlimited',
  '1stEditionHolofoil',
  '1stEditionNormal',
];

const TCG_PRICE_VARIANT_FALLBACKS: Record<string, string[]> = {
  card: TCG_PRICE_VARIANT_PRIORITY,
  normal: ['normal', 'unlimited'],
  unlimited: ['unlimited', 'normal'],
  holofoil: ['holofoil', 'unlimitedHolofoil'],
  unlimitedHolofoil: ['unlimitedHolofoil', 'holofoil'],
  reverseHolofoil: ['reverseHolofoil', 'reverseHoloEnergy', 'reverseHoloPokeball', 'holofoil', 'normal'],
  reverseHoloEnergy: ['reverseHoloEnergy', 'reverseHolofoil', 'normal'],
  reverseHoloPokeball: ['reverseHoloPokeball', 'reverseHolofoil', 'normal'],
  '1stEditionNormal': ['1stEditionNormal'],
  '1stEditionHolofoil': ['1stEditionHolofoil'],
};

const TCG_PRICE_EDITION_FALLBACKS: Record<string, string[]> = {
  '1st_edition': [
    '1stEditionHolofoil',
    '1stEditionNormal',
  ],
  unlimited: [
    'unlimitedHolofoil',
    'unlimited',
    'holofoil',
    'normal',
    'reverseHolofoil',
    'reverseHoloEnergy',
    'reverseHoloPokeball',
  ],
};

const toGbpFromUsd = (value: number) => Math.round(value * USD_TO_GBP * 100) / 100;

const getTcgEntryUsd = (entry: any): number | null => {
  const value = entry?.market ?? entry?.mid ?? entry?.low;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const getTcgPriceFromPricesGbp = (prices: any, variant?: string | null, edition?: string | null): number | null => {
  if (!prices) return null;

  const preferred = variant
    ? TCG_PRICE_VARIANT_FALLBACKS[variant] ?? [variant, ...TCG_PRICE_VARIANT_PRIORITY]
    : edition
      ? TCG_PRICE_EDITION_FALLBACKS[edition] ?? TCG_PRICE_VARIANT_PRIORITY
      : TCG_PRICE_VARIANT_PRIORITY;

  for (const key of preferred) {
    const usd = getTcgEntryUsd(prices[key]);
    if (usd != null) return toGbpFromUsd(usd);
  }

  if (variant || edition) return null;

  for (const entry of Object.values(prices) as any[]) {
    const usd = getTcgEntryUsd(entry);
    if (usd != null) return toGbpFromUsd(usd);
  }

  return null;
};

const getOwnedCardCurrentTcgGbp = (card: any, variant?: string | null, edition?: string | null): number | null => {
  const prices =
    card?.card?.tcgplayer?.prices ??
    card?.card?.raw_data?.tcgplayer?.prices ??
    card?.raw_data?.tcgplayer?.prices ??
    card?.tcgplayer?.prices ??
    null;
  const variantPrice = getTcgPriceFromPricesGbp(prices, variant, edition);
  const direct = card?.tcg_price;
  const directPrice = typeof direct === 'number' && Number.isFinite(direct) && direct > 0
    ? Math.round(direct * 100) / 100
    : null;

  if ((variant || edition) && variantPrice != null) return variantPrice;
  return directPrice ?? variantPrice;
};

const getHomeMasterSetStorageKey = (binderId: string) => `${HOME_MASTER_SET_STORAGE_PREFIX}${binderId}`;

const isHomeMasterSetEnabled = async (binderId: string) => {
  try {
    return (await AsyncStorage.getItem(getHomeMasterSetStorageKey(binderId))) === 'true';
  } catch (error) {
    console.log('Failed to load home master set setting', error);
    return false;
  }
};

const buildFallbackTrend = (latestTotal: number, range: ChartRange, changeAmount = 0) => {
  if (latestTotal <= 0) return [];
  const count = range === '7D' ? 8 : 31;
  const previousTotal = Number.isFinite(changeAmount) && changeAmount !== 0
    ? Math.max(0, latestTotal - changeAmount)
    : latestTotal;

  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    const baseline = previousTotal + (latestTotal - previousTotal) * progress;
    const wiggle = Math.sin(index * 1.7) * latestTotal * 0.003;
    return Number((index === count - 1 || changeAmount === 0 ? baseline : baseline + wiggle).toFixed(2));
  });
};

const alignTrendWithChange = (values: number[], changeAmount: number) => {
  if (values.length < 2 || !Number.isFinite(changeAmount) || changeAmount === 0) return values;
  const chartChange = values[values.length - 1] - values[0];
  if ((changeAmount < 0 && chartChange > 0) || (changeAmount > 0 && chartChange < 0)) {
    return [...values].reverse();
  }
  return values;
};

const getOwnedQuantity = (card: BinderCardRecord) =>
  card.owned ? Math.max(1, Number(card.owned_quantity ?? 1)) : 0;

const getCardImageUrl = (card: BinderCardRecord): string | null =>
  card.image_url ??
  card.card?.images?.small ??
  card.card?.images?.large ??
  card.card?.raw_data?.images?.small ??
  null;

const getCardDisplayName = (card: BinderCardRecord) =>
  card.card_name ?? card.card?.name ?? card.card?.raw_data?.name ?? card.card_id ?? 'Unknown card';

const getCardSetName = (card: BinderCardRecord) =>
  card.set_name ?? card.card?.set?.name ?? card.card?.raw_data?.set?.name ?? card.set_id ?? 'Unknown set';

const getCardRarity = (card: BinderCardRecord) =>
  card.card?.rarity ?? card.card?.raw_data?.rarity ?? null;

const getBinderCardPriceGbp = (card: BinderCardRecord, edition?: string | null) => {
  const tcg = getOwnedCardCurrentTcgGbp(card, null, edition);
  const fallback = [card.tcg_price, card.ebay_price, card.cardmarket_price].find(
    (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
  );
  return tcg ?? fallback ?? null;
};

const buildBinderSummaries = (groups: HomeBinderCardGroup[]): HomeBinderSummary[] =>
  groups.map(({ binder, cards }) => {
    const ownedCards = cards.filter((card) => getOwnedQuantity(card) > 0);
    const owned = ownedCards.length;
    const total = cards.length;
    const value = ownedCards.reduce((sum, card) => {
      const price = getBinderCardPriceGbp(card, binder.edition) ?? 0;
      return sum + price * getOwnedQuantity(card);
    }, 0);
    const duplicateCount = ownedCards.reduce(
      (sum, card) => sum + Math.max(0, getOwnedQuantity(card) - 1),
      0
    );
    const coverCard = ownedCards.find((card) => getCardImageUrl(card)) ?? cards.find((card) => getCardImageUrl(card));

    return {
      id: binder.id,
      name: binder.name,
      color: binder.color ?? null,
      coverImageUrl: coverCard ? getCardImageUrl(coverCard) : null,
      owned,
      total,
      missing: Math.max(0, total - owned),
      duplicateCount,
      value,
      completionPercent: total ? Math.round((owned / total) * 100) : 0,
    };
  });

const selectActiveBinder = (summaries: HomeBinderSummary[]) => {
  const active = summaries
    .filter((binder) => binder.total > 0 && binder.owned > 0 && binder.missing > 0)
    .sort((a, b) => b.completionPercent - a.completionPercent || b.owned - a.owned);
  return active[0] ?? summaries.find((binder) => binder.owned > 0) ?? summaries[0] ?? null;
};

const buildDuplicateSummary = (groups: HomeBinderCardGroup[]): HomeDuplicateSummary => {
  const duplicateMap = new Map<string, HomeDuplicateItem>();

  for (const { binder, cards } of groups) {
    for (const card of cards) {
      const extraQuantity = Math.max(0, getOwnedQuantity(card) - 1);
      if (!extraQuantity) continue;

      const key = `${card.set_id ?? ''}:${card.card_id}`;
      const price = getBinderCardPriceGbp(card, binder.edition) ?? 0;
      const current = duplicateMap.get(key);
      const estimatedValue = price * extraQuantity;

      if (current) {
        current.extraQuantity += extraQuantity;
        current.estimatedValue += estimatedValue;
      } else {
        duplicateMap.set(key, {
          cardId: card.card_id,
          setId: card.set_id,
          name: getCardDisplayName(card),
          setName: getCardSetName(card),
          imageUrl: getCardImageUrl(card),
          extraQuantity,
          estimatedValue,
        });
      }
    }
  }

  const items = [...duplicateMap.values()].sort((a, b) => b.estimatedValue - a.estimatedValue);
  return {
    count: items.reduce((sum, item) => sum + item.extraQuantity, 0),
    estimatedValue: items.reduce((sum, item) => sum + item.estimatedValue, 0),
    items,
  };
};

const buildMissingCards = (
  groups: HomeBinderCardGroup[],
  activeBinder: HomeBinderSummary | null
): HomeCardPreview[] => {
  if (!activeBinder) return [];
  const group = groups.find((item) => item.binder.id === activeBinder.id);
  if (!group) return [];

  return group.cards
    .filter((card) => getOwnedQuantity(card) === 0)
    .map((card) => ({
      cardId: card.card_id,
      setId: card.set_id,
      name: getCardDisplayName(card),
      setName: getCardSetName(card),
      number: card.card_number ?? card.card?.number ?? null,
      rarity: getCardRarity(card),
      imageUrl: getCardImageUrl(card),
      estimatedValue: getBinderCardPriceGbp(card, group.binder.edition),
    }))
    .sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0))
    .slice(0, 5);
};

const activityIconForType = (type?: string | null): keyof typeof Ionicons.glyphMap => {
  if (type === 'value_change') return 'trending-up-outline';
  if (type === 'trade_listed') return 'swap-horizontal-outline';
  if (type === 'binder_add') return 'albums-outline';
  return 'sparkles-outline';
};

const inventoryMovementToActivity = (movement: InventoryMovement): HomeActivityItem => {
  const isOut = movement.action_type === 'scan_out';
  const duplicate = movement.reason === 'Added as Duplicate';
  return {
    id: `movement:${movement.id}`,
    title: duplicate
      ? `Added duplicate: ${movement.card_name}`
      : `${isOut ? 'Scanned out' : 'Scanned in'}: ${movement.card_name}`,
    subtitle: movement.binder_name ?? movement.reason,
    createdAt: movement.created_at,
    valueChange: movement.value_at_time == null
      ? null
      : movement.value_at_time * movement.quantity * (isOut ? -1 : 1),
    isPositive: !isOut,
    icon: isOut ? 'log-out-outline' : duplicate ? 'copy-outline' : 'scan-outline',
    cardId: movement.card_id,
    setId: movement.set_id,
  };
};

// ===============================
// SUB COMPONENTS
// ===============================

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

  // Collection value
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionChangeAmount, setCollectionChangeAmount] = useState(0);
  const [collectionChangePercent, setCollectionChangePercent] = useState(0);
  const [collectionValueLoading, setCollectionValueLoading] = useState(true);
  const [collectionValueError, setCollectionValueError] = useState<string | null>(null);
  const [homeDataError, setHomeDataError] = useState<string | null>(null);
  const [activeBinder, setActiveBinder] = useState<HomeBinderSummary | null>(null);
  const [duplicateSummary, setDuplicateSummary] = useState<HomeDuplicateSummary>(EMPTY_DUPLICATE_SUMMARY);
  const [missingCards, setMissingCards] = useState<HomeCardPreview[]>([]);
  const [chaseCards, setChaseCards] = useState<HomeCardPreview[]>([]);
  const [chaseLoading, setChaseLoading] = useState(true);
  const [chaseError, setChaseError] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<HomeActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  // Stats
  const [ownedCardCount, setOwnedCardCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  // Recent trade listings
  const [recentListings, setRecentListings] = useState<HubListing[]>([]);
  const [marketplaceMatches, setMarketplaceMatches] = useState<HubListing[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  const valuePostKeyRef = useRef<string | null>(null);

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
    setCollectionValueLoading(true);
    setCollectionValueError(null);
    setHomeDataError(null);
    try {
      const binders = await fetchBinders();
      const binderGroups: HomeBinderCardGroup[] = await Promise.all(
        binders.map(async (binder) => {
          const [binderCards, masterSetEnabled] = await Promise.all([
            fetchBinderCards(binder.id),
            isHomeMasterSetEnabled(binder.id),
          ]);

          return {
            binder,
            cards: binderCards.map((card) => ({
              ...card,
              __binderId: binder.id,
              __binderEdition: binder.edition ?? null,
              __masterSetEnabled: masterSetEnabled,
            })),
          };
        })
      );
      const allCards = binderGroups.flatMap((group) => group.cards);
      const binderSummaries = buildBinderSummaries(binderGroups);
      const nextActiveBinder = selectActiveBinder(binderSummaries);

      setActiveBinder(nextActiveBinder);
      setDuplicateSummary(buildDuplicateSummary(binderGroups));
      setMissingCards(buildMissingCards(binderGroups, nextActiveBinder));

      const getSnapshotIdsForCard = (card: any) => [
        ...new Set([card.card_id, card.api_card_id].filter(Boolean)),
      ] as string[];

      const variantSetIds = [
        ...new Set(
          allCards
            .map((card) => card.set_id)
            .filter(Boolean)
        ),
      ] as string[];
      const ownedVariantsByCard = new Map<string, Set<string>>();

      if (variantSetIds.length) {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.log('Hub variant user lookup failed:', userError.message);
        }

        if (user) {
          const { data: variantRows, error: variantError } = await supabase
            .from('user_card_variants')
            .select('card_id, set_id, variant')
            .eq('user_id', user.id)
            .in('set_id', variantSetIds);

          if (variantError) {
            console.log('Hub variants failed:', variantError.message);
          } else {
            for (const row of variantRows ?? []) {
              if (!row.card_id || !row.set_id || !row.variant) continue;
              const key = `${row.set_id}:${row.card_id}`;
              if (!ownedVariantsByCard.has(key)) ownedVariantsByCard.set(key, new Set());
              ownedVariantsByCard.get(key)!.add(row.variant);
            }
          }
        }
      }

      const ownedUnits: {
        card: any;
        variant: string | null;
        snapshotIds: string[];
        currentTcgPriceGbp: number | null;
      }[] = [];
      const countedVariantKeys = new Set<string>();
      const countedOwnedCardKeys = new Set<string>();

      const addOwnedUnit = (card: any, variant: string | null) => {
        ownedUnits.push({
          card,
          variant,
          snapshotIds: getSnapshotIdsForCard(card),
          currentTcgPriceGbp: getOwnedCardCurrentTcgGbp(card, variant, card.__binderEdition),
        });
      };

      for (const card of allCards) {
        const variantCardKey = `${card.set_id}:${card.card_id}`;
        const ownedVariants = [...(ownedVariantsByCard.get(variantCardKey) ?? new Set<string>())];

        if (card.__masterSetEnabled && ownedVariants.length) {
          for (const variant of ownedVariants) {
            const variantUnitKey = `${variantCardKey}:${variant}`;
            if (countedVariantKeys.has(variantUnitKey)) continue;
            countedVariantKeys.add(variantUnitKey);
            addOwnedUnit(card, variant);
          }
          continue;
        }

        if (!card.__masterSetEnabled && ownedVariants.length) {
          for (const variant of ownedVariants) {
            const variantUnitKey = `${variantCardKey}:${variant}`;
            if (countedVariantKeys.has(variantUnitKey)) continue;
            countedVariantKeys.add(variantUnitKey);
            addOwnedUnit(card, variant);
          }
          continue;
        }

        if (card.owned) {
          if (countedOwnedCardKeys.has(variantCardKey) || [...countedVariantKeys].some((key) => key.startsWith(`${variantCardKey}:`))) {
            continue;
          }
          countedOwnedCardKeys.add(variantCardKey);
          addOwnedUnit(card, null);
        }
      }

      setOwnedCardCount(ownedUnits.length);

      const snapshotCardIds = [...new Set(ownedUnits.flatMap((unit) => unit.snapshotIds))];

      if (!ownedUnits.length) {
        setCollectionTotal(0);
        setCollectionChangeAmount(0);
        setCollectionChangePercent(0);
        setChartData([]);
        return;
      }

      const snapshotColumns = 'user_id, card_id, tcg_mid, tcg_low, snapshot_at';
      let data: any[] = [];
      if (snapshotCardIds.length) {
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

        data = globalSnapshotsResult.data ?? [];
      }

      const snapshotByCardDay = new Map<string, any>();
      for (const row of data) {
        snapshotByCardDay.set(`${row.card_id}:${String(row.snapshot_at).split('T')[0]}`, row);
      }
      const snapshotRows = [...snapshotByCardDay.values()].sort(
        (a, b) => new Date(a.snapshot_at).getTime() - new Date(b.snapshot_at).getTime()
      );
      const snapshotDays = new Set(snapshotRows.map((row) => String(row.snapshot_at).split('T')[0]));

      // Collection value is TCG-only: public daily snapshots first, current TCG card/variant prices as instant fallback.
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
      let comparableLatest = 0;
      let comparablePrevious = 0;
      let cardsWithPrevious = 0;
      let currentlyPricedCards = 0;

      for (const unit of ownedUnits) {
        const snapshots = unit.snapshotIds
          .flatMap((cardId) => groupedByCard[cardId] ?? [])
          .sort((a, b) => new Date(a.snapshot_at).getTime() - new Date(b.snapshot_at).getTime());
        const latest = snapshots[snapshots.length - 1];
        const previous = snapshots[snapshots.length - 2];

        const latestGbp = unit.currentTcgPriceGbp ?? getSnapshotPriceGbp(latest);
        const previousGbp = getSnapshotPriceGbp(previous);

        if (latestGbp != null) {
          totalLatest += latestGbp;
          currentlyPricedCards += 1;
        }

        if (latestGbp != null && previousGbp != null) {
          comparableLatest += latestGbp;
          comparablePrevious += previousGbp;
          cardsWithPrevious += 1;
        }
      }

      const change = cardsWithPrevious > 0 ? comparableLatest - comparablePrevious : 0;
      const percent = cardsWithPrevious > 0 && comparablePrevious !== 0
        ? (change / comparablePrevious) * 100
        : 0;

      const days = buildDayKeys(chartRange, Object.keys(groupedByDay).sort());
      const firstDay = days[0];
      const lastDay = days[days.length - 1];

      const latestByCard: Record<string, number> = {};
      for (const row of snapshotRows) {
        const day = String(row.snapshot_at).split('T')[0];
        if (day >= firstDay) continue;
        const priceGbp = getSnapshotPriceGbp(row);
        if (priceGbp != null) latestByCard[row.card_id] = priceGbp;
      }

      const chartPoints = days.map((day) => {
        const pricesForDay = groupedByDay[day] ?? {};
        Object.entries(pricesForDay).forEach(([cardId, price]) => {
          if (typeof price === 'number') latestByCard[cardId] = price;
        });
        let dayTotal = 0;
        let pricedCount = 0;
        for (const unit of ownedUnits) {
          const price = day === lastDay && unit.currentTcgPriceGbp != null
            ? unit.currentTcgPriceGbp
            : unit.snapshotIds
              .map((cardId) => latestByCard[cardId])
              .find((value) => typeof value === 'number');
          if (typeof price === 'number') {
            dayTotal += price;
            pricedCount += 1;
          }
        }
        return { value: dayTotal, pricedCount };
      });

      const usableChartPoints = chartPoints
        .map((point, index) => ({ ...point, day: days[index] }))
        .filter((point) => (
          Number.isFinite(point.value) &&
          point.value > 0 &&
          currentlyPricedCards > 0 &&
          point.pricedCount === currentlyPricedCards
      ));
      const chartValues = usableChartPoints.map((point) => point.value);

      const hasRealChartHistory = chartValues.length >= 2;
      const displayChartValues = hasRealChartHistory
        ? alignTrendWithChange(chartValues, change)
        : buildFallbackTrend(totalLatest, chartRange, change);
      const debugText = [
        `ownedUnits=${ownedUnits.length}`,
        `masterVariants=${countedVariantKeys.size}`,
        `ids=${snapshotCardIds.length}`,
        `publicTcg=${data.length}`,
        `currentTcg=${ownedUnits.filter((unit) => unit.currentTcgPriceGbp != null).length}`,
        `rows=${snapshotRows.length}`,
        `days=${snapshotDays.size}`,
        `points=${chartValues.length}`,
        `priced=${currentlyPricedCards}`,
        `comparable=${cardsWithPrevious}`,
      ].join(' ');
      console.log('Hub price chart debug:', debugText);

      setCollectionTotal(totalLatest);
      setCollectionChangeAmount(change);
      setCollectionChangePercent(percent);
      setChartData(displayChartValues);
      setCollectionValueError(null);

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
      setCollectionValueError('We could not refresh market prices. Pull to refresh or try again.');
      setHomeDataError('Could not refresh collector data. Pull to refresh or try again.');
      setActiveBinder(null);
      setDuplicateSummary(EMPTY_DUPLICATE_SUMMARY);
      setMissingCards([]);
    } finally {
      setCollectionValueLoading(false);
    }
  }, [chartRange]);

  const loadChaseCards = useCallback(async () => {
    setChaseLoading(true);
    setChaseError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setChaseCards([]);
        return;
      }

      const [wishlistResult, watchlistResult] = await Promise.all([
        supabase
          .from('user_card_flags')
          .select('id, card_id, set_id, asking_price, market_estimate, created_at')
          .eq('user_id', user.id)
          .eq('flag_type', 'wishlist')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('market_watchlist')
          .select('id, card_id, set_id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      if (wishlistResult.error) throw wishlistResult.error;
      if (watchlistResult.error) throw watchlistResult.error;

      const mergedRows: any[] = [];
      const seen = new Set<string>();
      for (const row of [...(wishlistResult.data ?? []), ...(watchlistResult.data ?? [])]) {
        if (!row.card_id) continue;
        const key = `${row.card_id}:${row.set_id ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mergedRows.push(row);
      }

      if (!mergedRows.length) {
        setChaseCards([]);
        return;
      }

      const cardIds = [...new Set(mergedRows.map((row) => row.card_id))];
      const { data: previews, error: previewsError } = await supabase
        .from('card_previews')
        .select('card_id, name, image_url, set_name')
        .in('card_id', cardIds);

      if (previewsError) {
        console.log('Home chase previews failed', previewsError.message);
      }

      const previewMap: Record<string, any> = {};
      (previews ?? []).forEach((preview: any) => {
        previewMap[preview.card_id] = preview;
      });

      setChaseCards(mergedRows.slice(0, 5).map((row) => {
        const preview = previewMap[row.card_id] ?? null;
        const estimated = row.market_estimate ?? row.asking_price ?? null;
        return {
          cardId: row.card_id,
          setId: row.set_id ?? null,
          name: preview?.name ?? row.card_id,
          setName: preview?.set_name ?? row.set_id ?? 'Wanted card',
          imageUrl: preview?.image_url ?? null,
          estimatedValue: typeof estimated === 'number' ? estimated : estimated == null ? null : Number(estimated),
        };
      }));
    } catch (error) {
      console.log('Failed to load home chase cards', error);
      setChaseCards([]);
      setChaseError('Could not refresh chase cards.');
    } finally {
      setChaseLoading(false);
    }
  }, []);

  const loadRecentActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRecentActivity([]);
        return;
      }

      const [feedResult, movements] = await Promise.all([
        supabase
          .from('activity_feed')
          .select('id, type, title, subtitle, card_id, set_id, value_change, is_positive, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8),
        loadInventoryMovements(),
      ]);

      if (feedResult.error) throw feedResult.error;

      const feedItems: HomeActivityItem[] = (feedResult.data ?? []).map((post: any) => ({
        id: `post:${post.id}`,
        title: post.title ?? 'Collection update',
        subtitle: post.subtitle ?? null,
        createdAt: post.created_at,
        valueChange: post.value_change == null ? null : Number(post.value_change),
        isPositive: post.is_positive ?? null,
        icon: activityIconForType(post.type),
        cardId: post.card_id ?? null,
        setId: post.set_id ?? null,
      }));

      const movementItems = movements.slice(0, 8).map(inventoryMovementToActivity);
      const combined = [...feedItems, ...movementItems]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);

      setRecentActivity(combined);
    } catch (error) {
      console.log('Failed to load recent home activity', error);
      setRecentActivity([]);
      setActivityError('Could not refresh recent activity.');
    } finally {
      setActivityLoading(false);
    }
  }, []);


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
    loadChaseCards();
    loadRecentActivity();
  }, [loadAll, loadCollectionValue, loadChaseCards, loadRecentActivity]));

  useEffect(() => {
    if (!hasChosenMode) {
      setRoleModalOpen(true);
      return;
    }
    checkHubTip();
  }, [checkHubTip, hasChosenMode]);
  useEffect(() => { loadCollectionValue(); }, [chartRange, loadCollectionValue]);

  const showChaseCards = chaseCards.length > 0;

  const openCardPreview = useCallback((item: HomeCardPreview) => {
    router.push({
      pathname: '/card/[id]',
      params: {
        id: item.cardId,
        setId: item.setId ?? undefined,
      },
    });
  }, []);

  const openActivityItem = useCallback((item: HomeActivityItem) => {
    if (item.id === 'scan-empty') {
      router.push({ pathname: '/scan', params: { mode: 'market' } });
      return;
    }
    if (item.cardId) {
      router.push({
        pathname: '/card/[id]',
        params: {
          id: item.cardId,
          setId: item.setId ?? undefined,
        },
      });
      return;
    }
    router.push('/community');
  }, []);

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
            onRefresh={() => {
              loadAll(true);
              loadCollectionValue();
              loadChaseCards();
              loadRecentActivity();
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* TOP BAR */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Image source={require('../../assets/images/hub.png')} style={{ width: Math.min(180, screenWidth - 178), height: 60 }} resizeMode="contain" />
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 4 }}>Your collection</Text>
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
              <Ionicons name="person-circle-outline" size={26} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* VALUE TRACKER */}
        <View style={{ marginBottom: 16 }}>
          <ValueTrackerCard
            totalValue={collectionTotal}
            currency="GBP"
            percentageChange={collectionChangePercent}
            absoluteChange={collectionChangeAmount}
            changePeriodLabel={`${chartRange} movement`}
            trendData={chartData}
            isLoading={collectionValueLoading}
            error={collectionValueError}
            onPress={() => Alert.alert('TCG Market Value', 'Based only on TCG prices. The latest point uses owned cards and Master Set variants immediately, with shared daily snapshots for history.')}
            onRetry={loadCollectionValue}
            onEmptyAction={() => router.push({ pathname: '/scan', params: { mode: 'market' } })}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: theme.colors.card, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 8, ...cardShadow }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '900', paddingLeft: 4 }}>Value window</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {(['7D', '30D'] as const).map((range) => (
                <TouchableOpacity
                  key={range}
                  onPress={() => setChartRange(range)}
                  style={{ height: 32, minWidth: 46, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: chartRange === range ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: chartRange === range ? theme.colors.primary : theme.colors.border }}
                  activeOpacity={0.82}
                >
                  <Text style={{ color: chartRange === range ? '#FFFFFF' : theme.colors.textSoft, fontSize: 12, fontWeight: '900' }}>{range}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <HomeActionsRow
          ownedCount={ownedCardCount}
          listingCount={recentListings.length}
          onScan={() => router.push({ pathname: '/scan', params: { mode: 'market' } })}
          onBinders={() => router.push('/binder')}
          onTrade={() => router.push('/trade')}
        />

        <ContinueBinderCard
          binder={activeBinder}
          isLoading={collectionValueLoading && !activeBinder && !homeDataError}
          error={homeDataError}
          onView={(binderId) => router.push({ pathname: '/binder/[id]', params: { id: binderId } })}
          onScan={(binderId) => router.push({ pathname: '/scan', params: { mode: 'binder', binderId } })}
          onCreate={() => router.push('/binder/new')}
        />

        <TradeableDuplicatesCard
          summary={duplicateSummary}
          isLoading={collectionValueLoading && duplicateSummary.count === 0 && !homeDataError}
          error={homeDataError}
          matchCount={marketplaceMatches.length}
          onAction={() => router.push('/trade')}
        />

        <ChaseOrMissingSection
          mode={showChaseCards ? 'chase' : 'missing'}
          binderName={activeBinder?.name ?? null}
          items={showChaseCards ? chaseCards : missingCards}
          isLoading={showChaseCards ? chaseLoading : (collectionValueLoading && missingCards.length === 0 && !homeDataError)}
          error={showChaseCards ? chaseError : homeDataError}
          onViewAll={() => {
            if (showChaseCards) {
              router.push('/trade');
              return;
            }
            if (activeBinder) {
              router.push({ pathname: '/binder/[id]', params: { id: activeBinder.id } });
              return;
            }
            router.push('/binder');
          }}
          onItemPress={openCardPreview}
          onEmptyAction={() => router.push(showChaseCards ? '/trade' : '/binder')}
        />

        <RecentActivitySection
          items={recentActivity}
          isLoading={activityLoading}
          error={activityError}
          onRetry={loadRecentActivity}
          onItemPress={openActivityItem}
        />

        <TradeProtectionSummaryCard onPress={() => router.push('/trade')} />

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
