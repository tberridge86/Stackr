import { useTheme } from '../../components/theme-context';
import React, {
  useCallback,
  useEffect,
  useMemo,
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
import { useProfile } from '../../components/profile-context';
import { StackrProfileAvatar } from '../../components/StackrProfileAvatar';
import { fetchBinders, fetchBinderCards, type BinderCardRecord, type BinderRecord } from '../../lib/binders';
import { fetchOwnedCardRows, type OwnedCardRow } from '../../lib/ownership';
import { supabase } from '../../lib/supabase';
import { PRICE_API_URL } from '../../lib/config';
import { ValueTrackerCard } from '../../components/ValueTrackerCard';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { attachLiveTcgdexCardReferences, getPokemonCardImageUrls } from '../../lib/pokemonTcg';
import { stackrBrand } from '../../lib/stackrBrand';
import { stackrIcons } from '../../lib/stackrIcons';
import { getStackrHomeWordmarkWidth, stackrLogoSizes, stackrTabContentPadding } from '../../lib/stackrSizing';
import {
  ContinueBinderCard,
  ChaseCardsSheet,
  HOME_TOKENS,
  HomeActionsRow,
  HomeOpportunitiesSection,
  RecentActivitySection,
  type HomeActivityItem,
  type HomeBinderSummary,
  type HomeCardPreview,
  type HomeChaseListingSuggestion,
  type HomeDuplicateItem,
  type HomeDuplicateSummary,
} from '../../components/HomeCommandCenter';
import {
  DEFAULT_MINTY_FEEDBACK_PROFILE,
  DEFAULT_MINTY_PERSONALISATION_SETTINGS,
  applyMintyInsightFeedback,
  buildMintyHomeInsight,
  isGate0CommerceActivity,
  sanitizeMintyInsightForGate0,
  type MintyFeedbackProfile,
  type MintyInsight,
  type MintyInsightFeedback,
  type MintyPersonalisationSettings,
} from '../../lib/mintyInsights';
import {
  loadMintyInsight,
  recordMintyInsightFeedback,
} from '../../lib/mintyInsightService';
import { getCustomBinderNameArtKeyForBinder } from '../../lib/customBinderNameArt';
import { fetchStackrCardRows, fetchStackrPriceSnapshots } from '../../lib/stackrDomainAdapter';
import { loadCollectionPrices, type CollectionPriceResult } from '../../lib/collectionPricingApi';
import {
  getCollectionPriceCoverageLabel,
  summariseCollectionPricing,
  type CollectionValueRead,
  type CollectionPricingSummary,
} from '../../lib/collectionPricingState';
import { stackrApiClient } from '../../lib/stackrApiV1';
import {
  buildVerifiedHomeSnapshotTrend,
  supportsHomeSnapshotScope,
  takeRotatingStringBatch,
  type HomeSnapshotTrendEntry,
} from '../../lib/homePriceRefreshCore';
import { hydrateCardReferenceRowMapWithLiveTcgdexReferences } from '../../lib/scanCardReferenceHydration';

const fetchHomeDisplayCardRows = async (cardIds: string[]) => (
  hydrateCardReferenceRowMapWithLiveTcgdexReferences(
    await fetchStackrCardRows(cardIds), attachLiveTcgdexCardReferences,
  )
);
import { sanitizeMarketplaceCondition } from '../../lib/marketplacePresentation';
import {
  sanitizeGate0CommerceCopy,
  sanitizeGate0Notification,
} from '../../lib/gate0CommerceCopy';
import {
  LEGACY_HOME_COLLECTION_CACHE_KEY,
  getHomeCollectionCacheKey,
  parseHomeCollectionCache,
  serializeHomeCollectionCache,
} from '../../lib/homeCollectionCache';

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

const getChaseCardKey = (item: Pick<HomeCardPreview, 'cardId' | 'setId'>) => `${item.cardId}:${item.setId ?? ''}`;

type HomeBinderCard = BinderCardRecord & {
  __binderId: string;
  __binderEdition: string | null;
  __binderCardMode: 'raw' | 'graded' | null;
  __binderDefaultCondition: string | null;
  __binderDefaultGradeCompany: string | null;
  __binderDefaultGrade: string | null;
  __masterSetEnabled: boolean;
};

type HomeBinderCardGroup = {
  binder: BinderRecord;
  cards: HomeBinderCard[];
};

type HomeCollectionCacheSnapshot = {
  pricingContractVersion: 2;
  cachedAt: number;
  mintyDataRefreshedAt?: string | null;
  chartRange: ChartRange;
  chartData: number[];
  collectionValueReads?: CollectionValueRead[];
  collectionTotal: number | null;
  collectionPricingSummary: CollectionPricingSummary;
  collectionChangeAmount: number;
  collectionChangePercent: number;
  ownedCardCount: number;
  activeBinder: HomeBinderSummary | null;
  duplicateSummary: HomeDuplicateSummary;
  missingCards: HomeCardPreview[];
};

const EMPTY_COLLECTION_PRICING: CollectionPricingSummary = {
  total: null,
  totalUnits: 0,
  pricedUnits: 0,
  unpricedUnits: 0,
  staleUnits: 0,
  latestCalculatedAt: null,
  state: 'empty',
};
const MAX_COLLECTION_VALUE_READS = 4_000;
const HOME_LIVE_PRICE_POLL_MS = 3 * 60 * 1000;
const HOME_AUTOMATIC_PRICE_REFRESH_MS = 15 * 60 * 1000;
const HOME_AUTOMATIC_PRICE_REFRESH_LIMIT = 12;
const HOME_MANUAL_PRICE_REFRESH_LIMIT = 100;
const HOME_PRICE_REFRESH_BATCH_SIZE = 12;

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
const LEGACY_MINTY_PERSONALISATION_STORAGE_KEY = 'stackr:minty-personalisation:v1';
const LEGACY_MINTY_FEEDBACK_STORAGE_KEY = 'stackr:minty-feedback:v1';
const MINTY_PERSONALISATION_STORAGE_KEY_PREFIX = 'stackr:minty-personalisation:v2';
const MINTY_FEEDBACK_STORAGE_KEY_PREFIX = 'stackr:minty-feedback:v2';

const getMintyPersonalisationStorageKey = (userId: string) =>
  `${MINTY_PERSONALISATION_STORAGE_KEY_PREFIX}:${encodeURIComponent(userId)}`;
const getMintyFeedbackStorageKey = (userId: string) =>
  `${MINTY_FEEDBACK_STORAGE_KEY_PREFIX}:${encodeURIComponent(userId)}`;
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
    body: 'Search cards, check values, and build fair prices quickly.',
  },
];

// ===============================
// HELPERS
// ===============================

const EMPTY_DUPLICATE_SUMMARY: HomeDuplicateSummary = {
  count: 0,
  estimatedValue: 0,
  estimatedValueAvailable: false,
  items: [],
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

const buildMintyRefreshSignature = ({
  chartRange,
  total,
  change,
  percent,
  ownedCount,
  activeBinder,
  duplicateCount,
  missingCards,
}: {
  chartRange: ChartRange;
  total: number;
  change: number;
  percent: number;
  ownedCount: number;
  activeBinder?: HomeBinderSummary | null;
  duplicateCount: number;
  missingCards: HomeCardPreview[];
}) => [
  chartRange,
  total.toFixed(2),
  change.toFixed(2),
  percent.toFixed(2),
  ownedCount,
  activeBinder?.id ?? 'no-binder',
  activeBinder?.missing ?? 0,
  duplicateCount,
  missingCards.slice(0, 4).map((card) => `${card.cardId}:${card.setId ?? ''}`).join(','),
].join('|');

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

const buildBinderSummaries = (groups: HomeBinderCardGroup[], customNameArtKeys: Record<string, string> = {}): HomeBinderSummary[] =>
  groups.map(({ binder, cards }) => {
    const ownedCards = cards.filter((card) => getOwnedQuantity(card) > 0);
    const owned = ownedCards.length;
    const total = cards.length;
    const duplicateCount = ownedCards.reduce(
      (sum, card) => sum + Math.max(0, getOwnedQuantity(card) - 1),
      0
    );
    const coverCard = ownedCards.find((card) => getCardImageUrl(card)) ?? cards.find((card) => getCardImageUrl(card));
    const topValueCards = ownedCards
      .map((card) => ({
        cardId: card.card_id,
        setId: card.set_id,
        name: getCardDisplayName(card),
        imageUrl: getCardImageUrl(card),
        estimatedValue: null,
      }))
      .filter((card) => card.imageUrl)
      .slice(0, 3);

    return {
      id: binder.id,
      name: binder.name,
      type: binder.type ?? null,
      sourceSetId: binder.source_set_id ?? null,
      sourceSetLanguage: binder.language ?? null,
      sourceSetLogoUrl: binder.source_set_logo_url ?? null,
      sourceSetSymbolUrl: binder.source_set_symbol_url ?? null,
      sourceSetCoverUrl: binder.source_set_cover_url ?? null,
      customNameArtKey: binder.type === 'custom' ? customNameArtKeys[binder.id] ?? null : null,
      cardMode: binder.card_mode ?? null,
      masterSetEnabled: cards.some((card) => card.__masterSetEnabled),
      coverKey: binder.cover_key ?? null,
      color: binder.color ?? null,
      coverImageUrl: coverCard ? getCardImageUrl(coverCard) : null,
      owned,
      total,
      missing: Math.max(0, total - owned),
      duplicateCount,
      value: 0,
      valueAvailable: false,
      valueCoverageLabel: null,
      completionPercent: total ? Math.round((owned / total) * 100) : 0,
      topValueCards,
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

  for (const { cards } of groups) {
    for (const card of cards) {
      const extraQuantity = Math.max(0, getOwnedQuantity(card) - 1);
      if (!extraQuantity) continue;

      const key = `${card.set_id ?? ''}:${card.card_id}`;
      const current = duplicateMap.get(key);

      if (current) {
        current.extraQuantity += extraQuantity;
      } else {
        duplicateMap.set(key, {
          cardId: card.card_id,
          setId: card.set_id,
          name: getCardDisplayName(card),
          setName: getCardSetName(card),
          imageUrl: getCardImageUrl(card),
          extraQuantity,
          estimatedValue: 0,
          estimatedValueAvailable: false,
        });
      }
    }
  }

  const items = [...duplicateMap.values()].sort((a, b) => b.estimatedValue - a.estimatedValue);
  return {
    count: items.reduce((sum, item) => sum + item.extraQuantity, 0),
    estimatedValue: 0,
    estimatedValueAvailable: false,
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
      estimatedValue: null,
    }))
    .slice(0, 5);
};

type HomeOwnedPricingUnit = {
  key: string;
  card: HomeBinderCard | null;
  binderIds: string[];
  cardId: string;
  setId: string;
  quantity: number;
  variant: string | null;
  condition: string | null;
  gradeCompany: string | null;
  grade: string | null;
  productType: 'raw_card' | 'graded_card';
  identityExact: boolean;
};

const homeCardKey = (setId?: string | null, cardId?: string | null) => `${setId ?? ''}:${cardId ?? ''}`;

const buildHomeOwnedPricingUnits = (
  allCards: HomeBinderCard[],
  ownedRows: OwnedCardRow[],
): HomeOwnedPricingUnit[] => {
  const cardsByIdentity = new Map<string, HomeBinderCard[]>();
  for (const card of allCards) {
    const key = homeCardKey(card.set_id, card.card_id);
    cardsByIdentity.set(key, [...(cardsByIdentity.get(key) ?? []), card]);
  }

  const units: HomeOwnedPricingUnit[] = ownedRows.map((row) => {
    const cardKey = homeCardKey(row.set_id, row.card_id);
    const matchingCards = cardsByIdentity.get(cardKey) ?? [];
    const card = matchingCards[0] ?? null;
    const explicitCondition = String(row.condition ?? '').trim() || null;
    const explicitGradeCompany = String(row.grade_company ?? '').trim() || null;
    const explicitGrade = String(row.grade ?? '').trim() || null;
    const binderModes = [...new Set(matchingCards.map((candidate) => (
      candidate.__binderCardMode === 'graded' ? 'graded' : 'raw'
    )))];
    const hasExplicitGradeIdentity = Boolean(explicitGradeCompany || explicitGrade);
    const binderMode = binderModes.length === 1 ? binderModes[0] : null;
    const productType = hasExplicitGradeIdentity || binderMode === 'graded'
      ? 'graded_card' as const
      : 'raw_card' as const;
    const unanimousDefault = (read: (candidate: HomeBinderCard) => string | null) => {
      const values = [...new Set(matchingCards
        .map(read)
        .map((value) => String(value ?? '').trim())
        .filter(Boolean))];
      return values.length === 1 ? values[0] : null;
    };
    return {
      key: [cardKey, row.variant, row.condition ?? '', row.grade_company ?? '', row.grade ?? ''].join(':'),
      card,
      binderIds: [...new Set(matchingCards.map((candidate) => candidate.__binderId))],
      cardId: row.card_id,
      setId: row.set_id,
      quantity: Math.max(1, Number(row.quantity ?? 1)),
      variant: row.variant || null,
      condition: explicitCondition ?? (productType === 'raw_card'
        ? unanimousDefault((candidate) => candidate.__binderDefaultCondition)
        : null),
      gradeCompany: explicitGradeCompany ?? (productType === 'graded_card'
        ? unanimousDefault((candidate) => candidate.__binderDefaultGradeCompany)
        : null),
      grade: explicitGrade ?? (productType === 'graded_card'
        ? unanimousDefault((candidate) => candidate.__binderDefaultGrade)
        : null),
      productType,
      identityExact: binderModes.length <= 1 || hasExplicitGradeIdentity,
    };
  });

  const canonicalCardKeys = new Set(ownedRows.map((row) => homeCardKey(row.set_id, row.card_id)));
  const legacyCardKeys = new Set<string>();
  for (const card of allCards) {
    const cardKey = homeCardKey(card.set_id, card.card_id);
    if (!card.owned || canonicalCardKeys.has(cardKey) || legacyCardKeys.has(cardKey)) continue;
    legacyCardKeys.add(cardKey);
    const matchingCards = cardsByIdentity.get(cardKey) ?? [card];
    units.push({
      key: `legacy:${cardKey}:${card.condition ?? ''}:${card.grade_company ?? ''}:${card.grade ?? ''}`,
      card,
      binderIds: [...new Set(matchingCards.map((candidate) => candidate.__binderId))],
      cardId: card.card_id,
      setId: card.set_id,
      quantity: getOwnedQuantity(card),
      variant: card.__binderEdition ?? null,
      condition: card.condition || card.__binderDefaultCondition,
      gradeCompany: card.grade_company || card.__binderDefaultGradeCompany,
      grade: card.grade || card.__binderDefaultGrade,
      productType: card.grade_company
        || card.grade
        || card.__binderCardMode === 'graded'
        ? 'graded_card'
        : 'raw_card',
      identityExact: true,
    });
  }

  return units;
};

const pricingInputForHomeUnit = (unit: HomeOwnedPricingUnit) => ({
  key: unit.key,
  references: unit.identityExact
    ? [...new Set([unit.card?.api_card_id, unit.cardId].filter((value): value is string => Boolean(value)))]
    : [],
  quantity: unit.quantity,
  language: unit.card?.language ?? null,
  setId: unit.card?.api_set_id ?? unit.setId,
  variantCode: unit.variant,
  productType: unit.productType,
  condition: unit.condition,
  grader: unit.gradeCompany,
  grade: unit.grade,
});

const pricingSummaryForResults = (results: CollectionPriceResult[]) => summariseCollectionPricing(
  results.map((result) => ({
    quantity: result.quantity,
    centralValue: result.central,
    evidenceStatus: result.status,
    freshness: result.freshness,
    calculatedAt: result.calculatedAt,
    staleAfter: result.staleAfter,
  })),
);

const collectionIdentitySignature = (results: CollectionPriceResult[]) => results
  .map((result) => `${result.key}:${result.variantId ?? 'unresolved'}:${result.quantity}`)
  .sort()
  .join('|');

const applyHomeBinderPrices = (
  summaries: HomeBinderSummary[],
  units: HomeOwnedPricingUnit[],
  results: CollectionPriceResult[],
) => {
  const resultByKey = new Map(results.map((result) => [result.key, result]));
  return summaries.map((summary) => {
    const binderUnits = units.filter((unit) => unit.binderIds.includes(summary.id));
    const binderResults = binderUnits
      .map((unit) => resultByKey.get(unit.key))
      .filter((result): result is CollectionPriceResult => Boolean(result));
    const pricing = pricingSummaryForResults(binderResults);
    const priceByCard = new Map<string, number>();
    for (const unit of binderUnits) {
      const result = resultByKey.get(unit.key);
      if (result?.central == null || result.status === 'unavailable') continue;
      priceByCard.set(homeCardKey(unit.setId, unit.cardId), result.central);
    }
    return {
      ...summary,
      value: pricing.total ?? 0,
      valueAvailable: pricing.total != null,
      valueCoverageLabel: pricing.state === 'partial' || pricing.state === 'stale'
        ? getCollectionPriceCoverageLabel(pricing)
        : null,
      topValueCards: summary.topValueCards
        .map((card) => ({ ...card, estimatedValue: priceByCard.get(homeCardKey(card.setId, card.cardId)) ?? null }))
        .sort((a, b) => (b.estimatedValue ?? -1) - (a.estimatedValue ?? -1)),
    };
  });
};

const applyHomeDuplicatePrices = (
  summary: HomeDuplicateSummary,
  units: HomeOwnedPricingUnit[],
  results: CollectionPriceResult[],
): HomeDuplicateSummary => {
  if (!summary.count) return summary;
  const resultByKey = new Map(results.map((result) => [result.key, result]));
  const pricedByCard = new Map<string, { value: number; quantity: number }>();
  for (const unit of units) {
    const extraQuantity = Math.max(0, unit.quantity - 1);
    if (!extraQuantity) continue;
    const result = resultByKey.get(unit.key);
    if (result?.central == null || result.status === 'unavailable') continue;
    const key = homeCardKey(unit.setId, unit.cardId);
    const current = pricedByCard.get(key) ?? { value: 0, quantity: 0 };
    current.value += result.central * extraQuantity;
    current.quantity += extraQuantity;
    pricedByCard.set(key, current);
  }
  const items = summary.items.map((item) => {
    const priced = pricedByCard.get(homeCardKey(item.setId, item.cardId));
    return {
      ...item,
      estimatedValue: priced?.value ?? 0,
      estimatedValueAvailable: Boolean(priced && priced.quantity === item.extraQuantity),
    };
  });
  const allPriced = items.length > 0 && items.every((item) => item.estimatedValueAvailable);
  return {
    ...summary,
    estimatedValue: items.reduce((total, item) => total + (item.estimatedValueAvailable ? item.estimatedValue : 0), 0),
    estimatedValueAvailable: allPriced,
    items,
  };
};

const activityIconForType = (type?: string | null): keyof typeof Ionicons.glyphMap => {
  const normalized = String(type ?? '').toLowerCase();
  if (normalized.includes('value')) return 'trending-up-outline';
  if (normalized.includes('remove') || normalized.includes('delete') || normalized.includes('reduced') || normalized.includes('scan_out')) return 'remove-circle-outline';
  if (normalized.includes('trade')) return 'swap-horizontal-outline';
  if (normalized.includes('sale') || normalized.includes('sold')) return 'receipt-outline';
  if (normalized.includes('binder_add') || normalized.includes('add') || normalized.includes('increased')) return 'add-circle-outline';
  if (normalized.includes('wishlist') || normalized.includes('favorite') || normalized.includes('favourite')) return 'sparkles-outline';
  return 'sparkles-outline';
};

const activityTypeForFeedType = (type?: string | null): HomeActivityItem['activityType'] => {
  const normalized = String(type ?? '').toLowerCase();
  if (normalized.includes('value')) return 'value';
  if (normalized.includes('trade')) return 'trade';
  if (normalized.includes('wishlist') || normalized.includes('favorite') || normalized.includes('favourite')) return 'favorite';
  if (normalized.includes('remove') || normalized.includes('delete') || normalized.includes('reduced') || normalized.includes('scan_out')) return 'removed';
  if (normalized.includes('duplicate')) return 'duplicate';
  if (normalized.includes('add') || normalized.includes('binder')) return 'added';
  return 'generic';
};

const enrichActivityItemsWithCardImages = async (items: HomeActivityItem[]): Promise<HomeActivityItem[]> => {
  const cardIds = [
    ...new Set(
      items
        .map((item) => item.cardId)
        .filter((cardId): cardId is string => Boolean(cardId))
    ),
  ];

  if (!cardIds.length) return items;

  try {
    const officialCards = await fetchHomeDisplayCardRows(cardIds);

    const activityImageByCardId = new Map<string, string>();
    const cardNameByCardId = new Map<string, string>();

    for (const cardId of cardIds) {
      const card = officialCards.get(cardId);
      if (!card) continue;
      const rawImages = (card.raw_data as any)?.images ?? null;
      const officialImages = getPokemonCardImageUrls(cardId, card.set_id, card.number);
      const imageUrl =
        officialImages.small ??
        officialImages.large ??
        card.image_small ??
        card.image_large ??
        rawImages?.small ??
        rawImages?.large ??
        null;

      if (imageUrl) activityImageByCardId.set(cardId, imageUrl);
      if (card.name) cardNameByCardId.set(cardId, card.name);
    }

    return items.map((item) => {
      const cardId = item.cardId ?? null;
      if (!cardId) return item;

      const resolvedName = cardNameByCardId.get(cardId) ?? null;
      return {
        ...item,
        imageUrl: item.imageUrl ?? activityImageByCardId.get(cardId) ?? null,
        title: resolvedName && item.title.includes('Unknown item')
          ? item.title.replace('Unknown item', resolvedName)
          : item.title,
      };
    });
  } catch (error) {
    console.log('Failed to enrich home activity cards', error);
    return items;
  }
};

// ===============================
// SUB COMPONENTS
// ===============================

// ===============================
// MAIN COMPONENT
// ===============================

export default function HubScreen() {
  const { theme, isDark } = useTheme();
  const { hasChosenMode, hydrated: appModeHydrated, premiumSellerAccess, setMode } = useAppMode();
  const { profile: myProfile } = useProfile();
  const { width: screenWidth } = useWindowDimensions();
  const homeScreenPadding = screenWidth < 360
    ? HOME_TOKENS.layout.screenPaddingSmall
    : screenWidth >= 430
      ? HOME_TOKENS.layout.screenPaddingLarge
      : HOME_TOKENS.layout.screenPadding;
  const homeSpeltWordmarkWidth = getStackrHomeWordmarkWidth(screenWidth);

  const [hubTipOpen, setHubTipOpen] = useState(false);
  const [hasNewInfo, setHasNewInfo] = useState(false);
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
  const [collectionTotal, setCollectionTotal] = useState<number | null>(null);
  const [collectionPricingSummary, setCollectionPricingSummary] = useState<CollectionPricingSummary>(EMPTY_COLLECTION_PRICING);
  const [collectionPricingWarning, setCollectionPricingWarning] = useState<string | null>(null);
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
  const [chaseSheetOpen, setChaseSheetOpen] = useState(false);
  const [selectedChaseKey, setSelectedChaseKey] = useState<string | null>(null);
  const [chaseListingsByKey, setChaseListingsByKey] = useState<Record<string, HomeChaseListingSuggestion[]>>({});
  const [chaseListingsLoading, setChaseListingsLoading] = useState(false);
  const [chaseListingsError, setChaseListingsError] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<HomeActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [mintySettingsOpen, setMintySettingsOpen] = useState(false);
  const [mintyPersonalisation, setMintyPersonalisation] = useState<MintyPersonalisationSettings>(DEFAULT_MINTY_PERSONALISATION_SETTINGS);
  const [mintyFeedback, setMintyFeedback] = useState<MintyFeedbackProfile>(DEFAULT_MINTY_FEEDBACK_PROFILE);
  const [apiMintyInsight, setApiMintyInsight] = useState<MintyInsight | null>(null);
  const [mintyInsightRefreshing, setMintyInsightRefreshing] = useState(false);
  const [mintyInsightError, setMintyInsightError] = useState<string | null>(null);
  const [mintyDataRefreshedAt, setMintyDataRefreshedAt] = useState<string | null>(null);
  // Stats
  const [ownedCardCount, setOwnedCardCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  // Recent trade listings
  const [recentListings, setRecentListings] = useState<HubListing[]>([]);
  const [marketplaceMatches, setMarketplaceMatches] = useState<HubListing[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  const hasLoadedCollectionValueRef = useRef(false);
  const hasSuccessfulCollectionPricingRef = useRef(false);
  const collectionValueReadsRef = useRef<CollectionValueRead[]>([]);
  const refreshableVariantIdsRef = useRef<string[]>([]);
  const providerRefreshCursorRef = useRef(0);
  const providerRefreshSignatureRef = useRef<string | null>(null);
  const providerRefreshEnqueueInFlightRef = useRef(false);
  const automaticProviderRefreshAtRef = useRef(0);
  const livePricePollInFlightRef = useRef(false);
  const cachedHomeSnapshotUserIdRef = useRef<string | null>(null);
  const homeSessionUserIdRef = useRef<string | null>(null);
  const homeCollectionRequestRef = useRef(0);
  const homeGeneralRequestRef = useRef(0);
  const homeChaseRequestRef = useRef(0);
  const homeChaseListingsRequestRef = useRef(0);
  const homeActivityRequestRef = useRef(0);
  const previousChartRangeRef = useRef<ChartRange>(chartRange);
  const mintyMarketSignatureRef = useRef<string | null>(null);
  const mintyPreferenceGenerationRef = useRef(0);
  const mintyInsightRequestRef = useRef(0);

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

  const loadMintyPreferences = useCallback(async (expectedUserId?: string | null) => {
    const generation = mintyPreferenceGenerationRef.current;
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const trustedUserId = user?.id ?? null;
      if (!trustedUserId || (expectedUserId !== undefined && expectedUserId !== trustedUserId)) return;

      const [settingsRaw, feedbackRaw] = await Promise.all([
        AsyncStorage.getItem(getMintyPersonalisationStorageKey(trustedUserId)),
        AsyncStorage.getItem(getMintyFeedbackStorageKey(trustedUserId)),
        AsyncStorage.removeItem(LEGACY_MINTY_PERSONALISATION_STORAGE_KEY),
        AsyncStorage.removeItem(LEGACY_MINTY_FEEDBACK_STORAGE_KEY),
      ]);
      const { data: { user: confirmedUser }, error: confirmationError } = await supabase.auth.getUser();
      if (confirmationError) throw confirmationError;
      if (
        generation !== mintyPreferenceGenerationRef.current
        || confirmedUser?.id !== trustedUserId
        || homeSessionUserIdRef.current !== trustedUserId
      ) return;
      if (settingsRaw) {
        const parsed = JSON.parse(settingsRaw);
        setMintyPersonalisation({
          ...DEFAULT_MINTY_PERSONALISATION_SETTINGS,
          ...(parsed && typeof parsed === 'object' ? parsed : {}),
        });
      }
      if (feedbackRaw) {
        const parsed = JSON.parse(feedbackRaw);
        setMintyFeedback({
          ...DEFAULT_MINTY_FEEDBACK_PROFILE,
          ...(parsed && typeof parsed === 'object' ? parsed : {}),
          hiddenInsightIds: Array.isArray(parsed?.hiddenInsightIds) ? parsed.hiddenInsightIds : [],
          showLessTopics: parsed?.showLessTopics && typeof parsed.showLessTopics === 'object' ? parsed.showLessTopics : {},
          showMoreTopics: parsed?.showMoreTopics && typeof parsed.showMoreTopics === 'object' ? parsed.showMoreTopics : {},
        });
      }
    } catch (error) {
      console.log('Minty preference load failed', error);
    }
  }, []);

  const persistMintyPreference = useCallback(async (
    ownerUserId: string | null,
    kind: 'personalisation' | 'feedback',
    value: unknown,
  ) => {
    if (!ownerUserId) return;
    const generation = mintyPreferenceGenerationRef.current;
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (
        user?.id !== ownerUserId
        || homeSessionUserIdRef.current !== ownerUserId
        || generation !== mintyPreferenceGenerationRef.current
      ) return;
      const storageKey = kind === 'personalisation'
        ? getMintyPersonalisationStorageKey(ownerUserId)
        : getMintyFeedbackStorageKey(ownerUserId);
      await AsyncStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      console.log(`Minty ${kind} save failed`, error);
    }
  }, []);

  const updateMintyPersonalisation = useCallback((updates: Partial<MintyPersonalisationSettings>) => {
    const ownerUserId = homeSessionUserIdRef.current;
    setMintyPersonalisation((current) => {
      const next = { ...current, ...updates };
      void persistMintyPreference(ownerUserId, 'personalisation', next);
      return next;
    });
  }, [persistMintyPreference]);

  const handleMintyInsightFeedback = useCallback((feedbackType: MintyInsightFeedback, insight: MintyInsight) => {
    const ownerUserId = homeSessionUserIdRef.current;
    setMintyFeedback((current) => {
      const next = applyMintyInsightFeedback(current, insight, feedbackType);
      void persistMintyPreference(ownerUserId, 'feedback', next);
      return next;
    });
    recordMintyInsightFeedback(insight, feedbackType).catch((error) => {
      console.log('Minty feedback sync failed', error);
    });
  }, [persistMintyPreference]);

  const loadApiMintyInsight = useCallback(async (forceRefresh = false) => {
    const requestId = ++mintyInsightRequestRef.current;
    setMintyInsightRefreshing(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const trustedUserId = user?.id ?? null;
      if (!trustedUserId) {
        setApiMintyInsight(null);
        setMintyInsightError(null);
        return;
      }
      const result = await loadMintyInsight({ forceRefresh });
      const { data: { user: confirmedUser }, error: confirmationError } = await supabase.auth.getUser();
      if (confirmationError) throw confirmationError;
      if (
        mintyInsightRequestRef.current !== requestId
        || homeSessionUserIdRef.current !== trustedUserId
        || confirmedUser?.id !== trustedUserId
      ) return;
      setApiMintyInsight(result.insight ?? null);
      setMintyInsightError(result.error ?? null);
    } catch {
      if (mintyInsightRequestRef.current === requestId) {
        setApiMintyInsight(null);
        setMintyInsightError('Minty insight is temporarily unavailable.');
      }
    } finally {
      if (mintyInsightRequestRef.current === requestId) setMintyInsightRefreshing(false);
    }
  }, []);

  const refreshMintyForMarketSignature = useCallback((signature: string) => {
    if (!signature || mintyMarketSignatureRef.current === signature) return;
    mintyMarketSignatureRef.current = signature;
    void loadApiMintyInsight(true);
  }, [loadApiMintyInsight]);

  const resetMintyPreferences = useCallback(() => {
    const ownerUserId = homeSessionUserIdRef.current;
    setMintyPersonalisation(DEFAULT_MINTY_PERSONALISATION_SETTINGS);
    setMintyFeedback(DEFAULT_MINTY_FEEDBACK_PROFILE);
    void persistMintyPreference(ownerUserId, 'personalisation', DEFAULT_MINTY_PERSONALISATION_SETTINGS);
    void persistMintyPreference(ownerUserId, 'feedback', DEFAULT_MINTY_FEEDBACK_PROFILE);
  }, [persistMintyPreference]);

  // ===============================
  // LOAD ALL DATA
  // ===============================

  const loadAll = useCallback(async (isRefresh = false) => {
    const requestId = ++homeGeneralRequestRef.current;
    try {
      if (isRefresh) setRefreshing(true);

      const { data: { user } } = await supabase.auth.getUser();
      const trustedUserId = user?.id ?? null;
      homeSessionUserIdRef.current = trustedUserId;
      const isCurrentRequest = () => (
        homeGeneralRequestRef.current === requestId
        && homeSessionUserIdRef.current === trustedUserId
      );

      const [notificationsResult] = await Promise.all([
        user
          ? supabase.from('notifications').select('id, type, title, message').eq('user_id', user.id).eq('read', false)
          : Promise.resolve({ data: [] }),
      ]);

      const visibleUnreadNotifications = ((notificationsResult as any).data ?? [])
        .map((notification: any) => sanitizeGate0Notification(notification))
        .filter(Boolean);
      if (!isCurrentRequest()) return;
      setUnreadCount(visibleUnreadNotifications.length);

      if (user) {
        const [flagResult, wantedResult] = await Promise.allSettled([
          supabase
            .from('user_card_flags')
            .select('id, user_id, card_id, set_id, condition, asking_price, listing_status, updated_at')
            .eq('flag_type', 'trade')
            .eq('listing_status', 'active')
            .neq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(8),
          supabase
            .from('market_watchlist')
            .select('card_id, set_id')
            .eq('user_id', user.id),
        ]);
        const flagData = flagResult.status === 'fulfilled' && !flagResult.value.error
          ? flagResult.value.data ?? []
          : [];
        const wantedRows = wantedResult.status === 'fulfilled' && !wantedResult.value.error
          ? wantedResult.value.data ?? []
          : [];

        if (flagData?.length) {
          const cardIds = [...new Set(flagData.map((f) => f.card_id))];
          const previews = await fetchHomeDisplayCardRows(cardIds);
          const previewMap: Record<string, any> = {};
          previews.forEach((card: any) => {
            previewMap[card.id] = {
              card_id: card.id,
              name: card.name,
              image_url: card.image_small ?? card.image_large ?? null,
              set_name: card.set_name ?? card.set_id ?? null,
            };
          });
          if (!isCurrentRequest()) return;
          setRecentListings(flagData.map((flag) => ({ ...flag, preview: previewMap[flag.card_id] ?? null })));
        } else {
          if (!isCurrentRequest()) return;
          setRecentListings([]);
        }

        const wantedCards = wantedRows ?? [];
        if (wantedCards.length) {
          const wantedCardIds = [...new Set(wantedCards.map((row) => row.card_id).filter(Boolean))];
          const wantedSetKeys = new Set(wantedCards.map((row) => `${row.card_id}:${row.set_id ?? ''}`));
          const wantedAnySetKeys = new Set(wantedCards.filter((row) => !row.set_id).map((row) => row.card_id));

          if (!wantedCardIds.length) {
            if (!isCurrentRequest()) return;
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
            const previews = await fetchHomeDisplayCardRows(cardIds);
            const previewMap: Record<string, any> = {};
            previews.forEach((card: any) => {
              previewMap[card.id] = {
                card_id: card.id,
                name: card.name,
                image_url: card.image_small ?? card.image_large ?? null,
                set_name: card.set_name ?? card.set_id ?? null,
              };
            });
            if (!isCurrentRequest()) return;
            setMarketplaceMatches(strictMatches.slice(0, 4).map((listing) => ({
              ...listing,
              preview: previewMap[listing.card_id] ?? null,
            })));
          } else {
            if (!isCurrentRequest()) return;
            setMarketplaceMatches([]);
          }
        } else {
          if (!isCurrentRequest()) return;
          setMarketplaceMatches([]);
        }
      } else if (isCurrentRequest()) {
        setRecentListings([]);
        setMarketplaceMatches([]);
      }
    } catch (error) {
      console.log('Hub load failed', error);
    } finally {
      if (homeGeneralRequestRef.current === requestId) setRefreshing(false);
    }
  }, []);

  // ===============================
  // LOAD COLLECTION VALUE
  // ===============================

  const applyCachedHomeCollection = useCallback(async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      await AsyncStorage.removeItem(LEGACY_HOME_COLLECTION_CACHE_KEY);

      const trustedUserId = user?.id ?? null;
      if (!trustedUserId) {
        if (cachedHomeSnapshotUserIdRef.current) {
          cachedHomeSnapshotUserIdRef.current = null;
          hasLoadedCollectionValueRef.current = false;
          hasSuccessfulCollectionPricingRef.current = false;
          setCollectionTotal(null);
          setCollectionPricingSummary(EMPTY_COLLECTION_PRICING);
          setCollectionPricingWarning(null);
          setCollectionChangeAmount(0);
          setCollectionChangePercent(0);
          setOwnedCardCount(0);
          setActiveBinder(null);
          setDuplicateSummary(EMPTY_DUPLICATE_SUMMARY);
          setMissingCards([]);
          setChartData([]);
          setMintyDataRefreshedAt(null);
        }
        return false;
      }

      if (cachedHomeSnapshotUserIdRef.current === trustedUserId) return false;
      if (cachedHomeSnapshotUserIdRef.current !== null) {
        hasLoadedCollectionValueRef.current = false;
        hasSuccessfulCollectionPricingRef.current = false;
        setCollectionTotal(null);
        setCollectionPricingSummary(EMPTY_COLLECTION_PRICING);
        setCollectionPricingWarning(null);
        setCollectionChangeAmount(0);
        setCollectionChangePercent(0);
        setOwnedCardCount(0);
        setActiveBinder(null);
        setDuplicateSummary(EMPTY_DUPLICATE_SUMMARY);
        setMissingCards([]);
        setChartData([]);
        collectionValueReadsRef.current = [];
        setMintyDataRefreshedAt(null);
        setChaseCards([]);
        setRecentActivity([]);
        setRecentListings([]);
        setMarketplaceMatches([]);
        setChaseListingsByKey({});
      }

      const storageKey = getHomeCollectionCacheKey(trustedUserId);
      const raw = await AsyncStorage.getItem(storageKey);
      if (!raw) return false;

      const snapshot = parseHomeCollectionCache<Partial<HomeCollectionCacheSnapshot>>(
        raw,
        trustedUserId,
      );
      if (
        !snapshot
        || snapshot.pricingContractVersion !== 2
        || (snapshot.collectionTotal !== null && typeof snapshot.collectionTotal !== 'number')
        || !snapshot.collectionPricingSummary
      ) {
        hasSuccessfulCollectionPricingRef.current = false;
        await AsyncStorage.removeItem(storageKey);
        return false;
      }

      const { data: { user: confirmedUser }, error: confirmationError } = await supabase.auth.getUser();
      if (confirmationError) throw confirmationError;
      if (confirmedUser?.id !== trustedUserId) {
        hasLoadedCollectionValueRef.current = false;
        hasSuccessfulCollectionPricingRef.current = false;
        return false;
      }
      cachedHomeSnapshotUserIdRef.current = trustedUserId;

      setCollectionTotal(snapshot.collectionTotal);
      setCollectionPricingSummary(snapshot.collectionPricingSummary as CollectionPricingSummary);
      setCollectionPricingWarning(null);
      setCollectionChangeAmount(Number(snapshot.collectionChangeAmount ?? 0));
      setCollectionChangePercent(Number(snapshot.collectionChangePercent ?? 0));
      setOwnedCardCount(Number(snapshot.ownedCardCount ?? 0));
      setActiveBinder(snapshot.activeBinder ?? null);
      setDuplicateSummary(snapshot.duplicateSummary ?? EMPTY_DUPLICATE_SUMMARY);
      setMissingCards(Array.isArray(snapshot.missingCards) ? snapshot.missingCards : []);
      setMintyDataRefreshedAt(snapshot.mintyDataRefreshedAt ?? null);
      collectionValueReadsRef.current = Array.isArray(snapshot.collectionValueReads)
        ? snapshot.collectionValueReads.slice(-MAX_COLLECTION_VALUE_READS)
        : [];
      setChartData([]);
      hasLoadedCollectionValueRef.current = true;
      hasSuccessfulCollectionPricingRef.current = snapshot.collectionTotal != null;
      setCollectionValueLoading(false);
      return true;
    } catch (error) {
      console.log('Home collection cache hydrate failed', error);
      return false;
    }
  }, []);

  const saveHomeCollectionCache = useCallback(async (
    trustedUserId: string,
    snapshot: Omit<HomeCollectionCacheSnapshot, 'cachedAt'>,
  ) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (user?.id !== trustedUserId) return;

      await Promise.all([
        AsyncStorage.removeItem(LEGACY_HOME_COLLECTION_CACHE_KEY),
        AsyncStorage.setItem(
          getHomeCollectionCacheKey(trustedUserId),
          serializeHomeCollectionCache(trustedUserId, {
            ...snapshot,
            cachedAt: Date.now(),
          }),
        ),
      ]);
    } catch (error) {
      console.log('Home collection cache save failed', error);
    }
  }, []);

  const loadCollectionValue = useCallback(async () => {
    const requestId = ++homeCollectionRequestRef.current;
    setCollectionValueError(null);
    setCollectionPricingWarning(null);
    setHomeDataError(null);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        await applyCachedHomeCollection();
        setCollectionValueLoading(false);
        return;
      }

      const trustedUserId = user.id;
      homeSessionUserIdRef.current = trustedUserId;
      const isCurrentRequest = () => (
        homeCollectionRequestRef.current === requestId
        && homeSessionUserIdRef.current === trustedUserId
      );
      const confirmCurrentRequest = async () => {
        if (!isCurrentRequest()) return false;
        const { data: { user: confirmedUser }, error: confirmationError } = await supabase.auth.getUser();
        if (confirmationError) throw confirmationError;
        return isCurrentRequest() && confirmedUser?.id === trustedUserId;
      };
      const hadLoadedCollectionValue =
        cachedHomeSnapshotUserIdRef.current === trustedUserId
        && hasLoadedCollectionValueRef.current;
      setCollectionValueLoading(!hadLoadedCollectionValue);
      if (!hadLoadedCollectionValue) {
        await applyCachedHomeCollection();
      }

      const binders = await fetchBinders().catch((binderError: any) => {
        console.log('Home binders failed:', binderError?.message ?? binderError);
        return [] as BinderRecord[];
      });
      const binderGroups: HomeBinderCardGroup[] = await Promise.all(
        binders.map(async (binder) => {
          try {
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
                __binderCardMode: binder.card_mode ?? null,
                __binderDefaultCondition: binder.default_condition ?? null,
                __binderDefaultGradeCompany: binder.default_grade_company ?? null,
                __binderDefaultGrade: binder.default_grade ?? null,
                __masterSetEnabled: masterSetEnabled,
              })),
            };
          } catch (binderError: any) {
            console.log('Home binder cards failed:', binder.id, binderError?.message ?? binderError);
            return {
              binder,
              cards: [],
            };
          }
        })
      );
      const allCards = binderGroups.flatMap((group) => group.cards);
      const customNameArtEntries = await Promise.all(
        binderGroups
          .filter((group) => group.binder.type === 'custom')
          .map(async (group) => [
            group.binder.id,
            await getCustomBinderNameArtKeyForBinder(group.binder.id, group.binder.name),
          ] as const)
      );
      const binderSummaries = buildBinderSummaries(binderGroups, Object.fromEntries(customNameArtEntries));
      const nextActiveBinder = selectActiveBinder(binderSummaries);
      let nextDuplicateSummary = buildDuplicateSummary(binderGroups);
      const nextMissingCards = buildMissingCards(binderGroups, nextActiveBinder);

      if (!await confirmCurrentRequest()) return;
      if (!hasLoadedCollectionValueRef.current) {
        setActiveBinder(nextActiveBinder);
        setDuplicateSummary(nextDuplicateSummary);
        setMissingCards(nextMissingCards);
      }

      let ownedRows: OwnedCardRow[] = [];
      try {
        ownedRows = await fetchOwnedCardRows();
      } catch (ownershipError) {
        console.log('Home canonical ownership failed; using binder ownership only', ownershipError);
      }
      const ownedUnits = buildHomeOwnedPricingUnits(allCards, ownedRows);
      const ownedUnitCount = ownedUnits.reduce((total, unit) => total + unit.quantity, 0);
      if (!await confirmCurrentRequest()) return;
      setOwnedCardCount(ownedUnitCount);

      const priceResults = ownedUnits.length
        ? await loadCollectionPrices(ownedUnits.map(pricingInputForHomeUnit))
        : [];
      const nextPricingSummary = pricingSummaryForResults(priceResults);
      const identitySignature = collectionIdentitySignature(priceResults);
      const rawSnapshotEntries: HomeSnapshotTrendEntry[] = [];
      let canReadSnapshotHistory = priceResults.length === ownedUnits.length;
      for (const [index, unit] of ownedUnits.entries()) {
        const price = priceResults[index];
        if (
          !supportsHomeSnapshotScope(unit.productType, unit.condition)
          || !price?.variantId
          || price.central == null
          || price.status === 'unavailable'
        ) {
          canReadSnapshotHistory = false;
          continue;
        }
        rawSnapshotEntries.push({ variantId: price.variantId, quantity: unit.quantity });
      }
      const refreshableVariantIds = [...new Set(
        priceResults.flatMap((price, index) => (
          supportsHomeSnapshotScope(ownedUnits[index]?.productType, ownedUnits[index]?.condition) && price.variantId ? [price.variantId] : []
        )),
      )].sort();
      refreshableVariantIdsRef.current = refreshableVariantIds;
      if (providerRefreshSignatureRef.current !== identitySignature) {
        providerRefreshSignatureRef.current = identitySignature;
        providerRefreshCursorRef.current = 0;
      }

      let nextChartData: number[] = [];
      if (canReadSnapshotHistory && rawSnapshotEntries.length === ownedUnits.length && refreshableVariantIds.length) {
        const rangeDays = chartRange === '7D' ? 7 : 30;
        const nowMs = Date.now();
        try {
          const responses = await Promise.all(
            Array.from({ length: Math.ceil(refreshableVariantIds.length / 24) }, (_, index) => (
              stackrApiClient.marketPriceSnapshots({
                variantIds: refreshableVariantIds.slice(index * 24, (index + 1) * 24),
                rangeDays,
              })
            )),
          );
          if (!await confirmCurrentRequest()) return;
          nextChartData = buildVerifiedHomeSnapshotTrend(
            rawSnapshotEntries,
            responses.flatMap((response) => response.data.snapshots),
            {
              rangeStartMs: nowMs - rangeDays * 24 * 60 * 60 * 1000,
              nowMs,
              bucketMs: chartRange === '7D' ? 30 * 60 * 1000 : 24 * 60 * 60 * 1000,
            },
          );
        } catch (historyError) {
          console.log('Home stored price history unavailable', historyError);
        }
      }
      // A chart point must represent a persisted provider snapshot, never an app read.
      const nextValueReads: CollectionValueRead[] = [];
      const chartChange = nextChartData.length >= 2
        ? nextChartData[nextChartData.length - 1] - nextChartData[0]
        : 0;
      const chartStart = nextChartData[0] ?? null;
      const chartChangePercent = chartStart != null && chartStart !== 0
        ? (chartChange / chartStart) * 100
        : 0;
      const pricedBinderSummaries = applyHomeBinderPrices(binderSummaries, ownedUnits, priceResults);
      const nextPricedActiveBinder = selectActiveBinder(pricedBinderSummaries);
      nextDuplicateSummary = applyHomeDuplicatePrices(nextDuplicateSummary, ownedUnits, priceResults);
      const hadCachedPricing = hasSuccessfulCollectionPricingRef.current;
      const requestFailures = priceResults.filter((result) => result.requestError).length;

      if (!await confirmCurrentRequest()) return;
      if (nextPricingSummary.state === 'unavailable' && hadCachedPricing) {
        setCollectionPricingWarning('Live refresh is unavailable. Showing your last successful stored-price read.');
        setCollectionValueError(null);
        return;
      }

      const pricingWarning = requestFailures > 0
        ? `Could not refresh ${requestFailures} price${requestFailures === 1 ? '' : 's'}. ${getCollectionPriceCoverageLabel(nextPricingSummary)}.`
        : nextPricingSummary.state === 'partial'
          ? `${getCollectionPriceCoverageLabel(nextPricingSummary)}. The amount shown is the known subtotal.${nextPricingSummary.staleUnits ? ' Some stored prices may also be stale.' : ''}`
          : nextPricingSummary.state === 'stale'
            ? 'Stored prices are stale. Refresh will retry without replacing them with £0.'
            : null;
      const refreshedAt = nextPricingSummary.latestCalculatedAt;

      setActiveBinder(nextPricedActiveBinder);
      setDuplicateSummary(nextDuplicateSummary);
      setMissingCards(nextMissingCards);
      setCollectionTotal(nextPricingSummary.total);
      setCollectionPricingSummary(nextPricingSummary);
      setCollectionPricingWarning(pricingWarning);
      setCollectionChangeAmount(chartChange);
      setCollectionChangePercent(chartChangePercent);
      setChartData(nextChartData);
      collectionValueReadsRef.current = nextValueReads;
      setMintyDataRefreshedAt(refreshedAt);
      setCollectionValueError(null);
      cachedHomeSnapshotUserIdRef.current = trustedUserId;
      hasSuccessfulCollectionPricingRef.current = nextPricingSummary.total != null;

      void saveHomeCollectionCache(trustedUserId, {
        pricingContractVersion: 2,
        mintyDataRefreshedAt: refreshedAt,
        chartRange,
        chartData: nextChartData,
        collectionValueReads: nextValueReads,
        collectionTotal: nextPricingSummary.total,
        collectionPricingSummary: nextPricingSummary,
        collectionChangeAmount: chartChange,
        collectionChangePercent: chartChangePercent,
        ownedCardCount: ownedUnitCount,
        activeBinder: nextPricedActiveBinder,
        duplicateSummary: nextDuplicateSummary,
        missingCards: nextMissingCards,
      });

      if (nextPricingSummary.total != null) {
        refreshMintyForMarketSignature(buildMintyRefreshSignature({
          chartRange,
          total: nextPricingSummary.total,
          change: chartChange,
          percent: chartChangePercent,
          ownedCount: ownedUnitCount,
          activeBinder: nextPricedActiveBinder,
          duplicateCount: nextDuplicateSummary.count,
          missingCards: nextMissingCards,
        }));
      }

      return;

    } catch (error) {
      console.log('Failed to calculate collection value', error);
      if (homeCollectionRequestRef.current !== requestId) return;
      if (!hasSuccessfulCollectionPricingRef.current) {
        setCollectionTotal(null);
        setCollectionPricingSummary(EMPTY_COLLECTION_PRICING);
        setCollectionPricingWarning(null);
        setCollectionChangeAmount(0);
        setCollectionChangePercent(0);
        setChartData([]);
        setActiveBinder(null);
        setDuplicateSummary(EMPTY_DUPLICATE_SUMMARY);
        setMissingCards([]);
      }
      if (hasSuccessfulCollectionPricingRef.current) {
        setCollectionPricingWarning('Refresh failed. Showing your last successful stored-price read.');
        setCollectionValueError(null);
      } else {
        setCollectionValueError('We could not load stored market prices. Pull to refresh or try again.');
        setHomeDataError('Could not refresh collector data. Pull to refresh or try again.');
      }
    } finally {
      if (homeCollectionRequestRef.current === requestId) {
        hasLoadedCollectionValueRef.current = true;
        setCollectionValueLoading(false);
      }
    }
  }, [applyCachedHomeCollection, chartRange, refreshMintyForMarketSignature, saveHomeCollectionCache]);

  const loadCollectionValueRef = useRef(loadCollectionValue);

  const handleChartRangeChange = useCallback((nextRange: ChartRange) => {
    if (nextRange === chartRange) return;
    homeCollectionRequestRef.current += 1;
    setChartData([]);
    setCollectionChangeAmount(0);
    setCollectionChangePercent(0);
    setChartRange(nextRange);
  }, [chartRange]);

  useEffect(() => {
    loadCollectionValueRef.current = loadCollectionValue;
  }, [loadCollectionValue]);

  const enqueueAutomaticProviderRefresh = useCallback(async () => {
    const now = Date.now();
    if (
      providerRefreshEnqueueInFlightRef.current
      || now - automaticProviderRefreshAtRef.current < HOME_AUTOMATIC_PRICE_REFRESH_MS
    ) return;
    const batch = takeRotatingStringBatch(
      refreshableVariantIdsRef.current,
      providerRefreshCursorRef.current,
      HOME_AUTOMATIC_PRICE_REFRESH_LIMIT,
    );
    if (!batch.items.length) return;

    providerRefreshEnqueueInFlightRef.current = true;
    automaticProviderRefreshAtRef.current = now;
    providerRefreshCursorRef.current = batch.nextCursor;
    try {
      // This only enqueues provider work. Current UI values continue to be stored snapshots.
      await stackrApiClient.requestMarketPriceRefresh(batch.items, { productType: 'raw_card', currency: 'GBP' });
    } catch (error) {
      console.log('Home automatic price refresh could not be queued', error);
    } finally {
      providerRefreshEnqueueInFlightRef.current = false;
    }
  }, []);

  const refreshLivePrices = useCallback(async () => {
    if (providerRefreshEnqueueInFlightRef.current) {
      Alert.alert('Live price refresh in progress', 'A provider refresh request is already being queued. Stored prices have not been changed yet.');
      return;
    }
    const variantIds = [...new Set(refreshableVariantIdsRef.current)].slice(0, HOME_MANUAL_PRICE_REFRESH_LIMIT);
    if (!variantIds.length) {
      Alert.alert(
        'Live price refresh unavailable',
        'Add cards with an exact raw-card match first. Nothing was queued and the stored values have not changed.',
      );
      return;
    }

    providerRefreshEnqueueInFlightRef.current = true;
    setRefreshing(true);
    const summary = { queued: 0, alreadyQueued: 0, cooldown: 0 };
    try {
      const batches = Array.from(
        { length: Math.ceil(variantIds.length / HOME_PRICE_REFRESH_BATCH_SIZE) },
        (_, index) => variantIds.slice(index * HOME_PRICE_REFRESH_BATCH_SIZE, (index + 1) * HOME_PRICE_REFRESH_BATCH_SIZE),
      );
      for (const batch of batches) {
        const response = await stackrApiClient.requestMarketPriceRefresh(batch, { productType: 'raw_card', currency: 'GBP' });
        summary.queued += response.data.summary.queued;
        summary.alreadyQueued += response.data.summary.already_queued;
        summary.cooldown += response.data.summary.cooldown;
      }
      await loadCollectionValueRef.current();
      const detail = summary.queued
        ? `${summary.queued} ${summary.queued === 1 ? 'refresh was' : 'refreshes were'} queued for background processing. Stored prices stay visible until the provider writes a new snapshot.`
        : summary.alreadyQueued
          ? `${summary.alreadyQueued} ${summary.alreadyQueued === 1 ? 'card is' : 'cards are'} already queued. Stored prices stay visible until a new snapshot is written.`
          : `${summary.cooldown} ${summary.cooldown === 1 ? 'card is' : 'cards are'} in the provider cooldown. No price was changed.`;
      Alert.alert(summary.queued ? 'Live price refresh queued' : 'Live price refresh checked', detail);
    } catch (error) {
      console.log('Home manual price refresh could not be queued', error);
      const pending = summary.queued + summary.alreadyQueued;
      Alert.alert('Live price refresh interrupted', pending
        ? `${pending} card refreshes are confirmed queued or already pending. The remaining requests could not be confirmed. Stored prices remain visible while processing continues.`
        : 'The refresh request could not be confirmed. Stored prices remain visible; retrying is safe and will not duplicate pending requests.');
    } finally {
      providerRefreshEnqueueInFlightRef.current = false;
      setRefreshing(false);
    }
  }, []);

  const pollLivePrices = useCallback(async () => {
    if (livePricePollInFlightRef.current) return;
    livePricePollInFlightRef.current = true;
    try {
      await loadCollectionValueRef.current();
      await enqueueAutomaticProviderRefresh();
    } finally {
      livePricePollInFlightRef.current = false;
    }
  }, [enqueueAutomaticProviderRefresh]);

  const loadChaseCards = useCallback(async () => {
    const requestId = ++homeChaseRequestRef.current;
    setChaseLoading(true);
    setChaseError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (homeChaseRequestRef.current === requestId) setChaseCards([]);
        return;
      }
      const trustedUserId = user.id;
      const isCurrentRequest = () => (
        homeChaseRequestRef.current === requestId
        && homeSessionUserIdRef.current === trustedUserId
      );

      const [wishlistResult, watchlistResult, showcaseResult] = await Promise.all([
        supabase
          .from('user_card_flags')
          .select('id, card_id, set_id, asking_price, market_estimate, created_at')
          .eq('user_id', user.id)
          .eq('flag_type', 'wishlist')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('market_watchlist')
          .select('id, card_id, set_id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('binder_card_showcases')
          .select('id, card_id, set_id, sort_order')
          .eq('user_id', user.id)
          .eq('showcase_type', 'chase')
          .order('sort_order', { ascending: true })
          .limit(30),
      ]);

      if (wishlistResult.error) throw wishlistResult.error;
      if (watchlistResult.error) throw watchlistResult.error;
      if (showcaseResult.error) throw showcaseResult.error;

      const mergedRows: any[] = [];
      const seen = new Set<string>();
      for (const row of [...(showcaseResult.data ?? []), ...(wishlistResult.data ?? []), ...(watchlistResult.data ?? [])]) {
        if (!row.card_id) continue;
        const key = `${row.card_id}:${row.set_id ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mergedRows.push(row);
      }

      if (!mergedRows.length) {
        if (!isCurrentRequest()) return;
        setChaseCards([]);
        return;
      }

      const cardIds = [...new Set(mergedRows.map((row) => row.card_id))];
      const [officialCardMap, priceMap] = await Promise.all([
        fetchHomeDisplayCardRows(cardIds),
        fetchStackrPriceSnapshots(cardIds),
      ]);

      if (!isCurrentRequest()) return;
      setChaseCards(mergedRows.map((row) => {
        const officialCard = officialCardMap.get(row.card_id) ?? null;
        const estimated = row.market_estimate ?? row.asking_price ?? priceMap.get(row.card_id)?.market_central ?? null;
        const cardNumber = officialCard?.number ?? null;
        const setId = officialCard?.set_id ?? row.set_id ?? null;
        const officialImages = getPokemonCardImageUrls(row.card_id, setId, cardNumber);
        const rawImages = (officialCard?.raw_data as any)?.images ?? null;
        const officialImage =
          officialImages.small ??
          officialImages.large ??
          officialCard?.image_small ??
          officialCard?.image_large ??
          rawImages?.small ??
          rawImages?.large ??
          null;
        return {
          cardId: row.card_id,
          setId,
          name: officialCard?.name ?? row.card_id,
          setName: (officialCard?.raw_data as any)?.set?.name ?? row.set_id ?? 'Wanted card',
          number: cardNumber,
          rarity: officialCard?.rarity ?? null,
          imageUrl: officialImage ?? null,
          estimatedValue: typeof estimated === 'number' ? estimated : estimated == null ? null : Number(estimated),
        };
      }));
    } catch (error) {
      console.log('Failed to load home chase cards', error);
      if (homeChaseRequestRef.current !== requestId) return;
      setChaseCards([]);
      setChaseError('Could not refresh chase cards.');
    } finally {
      if (homeChaseRequestRef.current === requestId) setChaseLoading(false);
    }
  }, []);

  const selectedChaseCard = useMemo(() => {
    if (!chaseCards.length) return null;
    return chaseCards.find((item) => getChaseCardKey(item) === selectedChaseKey) ?? chaseCards[0];
  }, [chaseCards, selectedChaseKey]);

  useEffect(() => {
    if (!selectedChaseKey && chaseCards[0]) {
      setSelectedChaseKey(getChaseCardKey(chaseCards[0]));
    }
  }, [chaseCards, selectedChaseKey]);

  const loadChaseMarketplaceListings = useCallback(async (card: HomeCardPreview, force = false) => {
    const requestId = ++homeChaseListingsRequestRef.current;
    const key = getChaseCardKey(card);
    if (!force && chaseListingsByKey[key]) return;

    setChaseListingsLoading(true);
    setChaseListingsError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const trustedUserId = user?.id ?? null;
      const isCurrentRequest = () => (
        homeChaseListingsRequestRef.current === requestId
        && homeSessionUserIdRef.current === trustedUserId
      );
      const { data, error } = await supabase
        .from('user_card_flags')
        .select('id, user_id, card_id, set_id, condition, asking_price, trade_only, listing_status, updated_at')
        .eq('flag_type', 'trade')
        .eq('listing_status', 'active')
        .eq('card_id', card.cardId)
        .neq('user_id', user?.id ?? '00000000-0000-0000-0000-000000000000')
        .order('updated_at', { ascending: false })
        .limit(12);

      if (error) throw error;

      const rows = data ?? [];
      const sellerIds = [...new Set(rows.map((row: any) => row.user_id).filter(Boolean))];
      const { data: profiles, error: profileError } = sellerIds.length
        ? await supabase
          .from('profile_public_directory')
          .select('id, collector_name')
          .in('id', sellerIds)
        : { data: [], error: null };

      if (profileError) {
        console.log('Chase marketplace profile lookup failed', profileError.message);
      }

      const profileMap = new Map((profiles ?? []).map((profile: any) => [
        profile.id,
        sanitizeGate0CommerceCopy(profile.collector_name ?? null, 'Collector'),
      ]));
      const exactMatches = rows.filter((row: any) => !card.setId || row.set_id === card.setId);
      const fallbackMatches = rows.filter((row: any) => card.setId && row.set_id !== card.setId);
      const rankedRows = [...exactMatches, ...fallbackMatches].slice(0, 6);
      const suggestions: HomeChaseListingSuggestion[] = rankedRows.map((row: any) => ({
        id: row.id,
        cardId: row.card_id,
        setId: row.set_id ?? null,
        sellerDisplayName: profileMap.get(row.user_id) ?? null,
        askingPrice: row.asking_price == null ? null : Number(row.asking_price),
        condition: sanitizeMarketplaceCondition(row.condition),
        tradeOnly: Boolean(row.trade_only),
        status: row.listing_status ?? 'active',
        updatedAt: row.updated_at ?? null,
      }));

      if (!isCurrentRequest()) return;
      setChaseListingsByKey((current) => ({
        ...current,
        [key]: suggestions,
      }));
    } catch (error) {
      console.log('Failed to load chase marketplace listings', error);
      if (homeChaseListingsRequestRef.current === requestId) {
        setChaseListingsError('The Market listings could not be checked.');
      }
    } finally {
      if (homeChaseListingsRequestRef.current === requestId) setChaseListingsLoading(false);
    }
  }, [chaseListingsByKey]);

  useEffect(() => {
    if (!chaseSheetOpen || !selectedChaseCard) return;
    loadChaseMarketplaceListings(selectedChaseCard);
  }, [chaseSheetOpen, selectedChaseCard, loadChaseMarketplaceListings]);

  const openChaseSheet = useCallback((card?: HomeCardPreview) => {
    if (card) {
      setSelectedChaseKey(getChaseCardKey(card));
    } else if (!selectedChaseKey && chaseCards[0]) {
      setSelectedChaseKey(getChaseCardKey(chaseCards[0]));
    }
    setChaseSheetOpen(true);
  }, [chaseCards, selectedChaseKey]);

  const selectedChaseListings = selectedChaseCard
    ? chaseListingsByKey[getChaseCardKey(selectedChaseCard)] ?? []
    : [];

  const loadRecentActivity = useCallback(async () => {
    const requestId = ++homeActivityRequestRef.current;
    setActivityLoading(true);
    setActivityError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (homeActivityRequestRef.current === requestId) setRecentActivity([]);
        return;
      }
      const trustedUserId = user.id;
      const isCurrentRequest = () => (
        homeActivityRequestRef.current === requestId
        && homeSessionUserIdRef.current === trustedUserId
      );

      const feedResult = await supabase
        .from('activity_feed')
        .select('id, type, title, subtitle, card_id, set_id, value_change, is_positive, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (feedResult.error) throw feedResult.error;

      const visibleFeed = (feedResult.data ?? [])
        .filter((post: any) => !isGate0CommerceActivity(post));
      const feedItems: HomeActivityItem[] = visibleFeed.map((post: any) => ({
        id: `post:${post.id}`,
        title: sanitizeGate0CommerceCopy(
          post.title,
          'Collection update',
        ) ?? 'Collection update',
        subtitle: sanitizeGate0CommerceCopy(post.subtitle, null),
        createdAt: post.created_at,
        valueChange: post.value_change == null ? null : Number(post.value_change),
        isPositive: post.is_positive ?? null,
        icon: activityIconForType(post.type),
        cardId: post.card_id ?? null,
        setId: post.set_id ?? null,
        imageUrl: null,
        activityType: activityTypeForFeedType(post.type),
      }));

      const combined = feedItems
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);

      const enriched = await enrichActivityItemsWithCardImages(combined);
      if (!isCurrentRequest()) return;
      setRecentActivity(enriched);
    } catch (error) {
      console.log('Failed to load recent home activity', error);
      if (homeActivityRequestRef.current !== requestId) return;
      setRecentActivity([]);
      setActivityError('Could not refresh recent activity.');
    } finally {
      if (homeActivityRequestRef.current === requestId) setActivityLoading(false);
    }
  }, []);


  const checkHubTip = useCallback(async () => {
    try {
      const dismissed = await AsyncStorage.getItem(HUB_TIP_STORAGE_KEY);
      const shouldShow = dismissed !== 'true';
      setHasNewInfo(shouldShow);
      if (shouldShow) setHubTipOpen(true);
    } catch (error) {
      console.log('Hub tip check failed', error);
    }
  }, []);

  const closeHubTip = useCallback(async (dontShowAgain: boolean) => {
    setHubTipOpen(false);
    if (dontShowAgain) setHasNewInfo(false);
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

  useEffect(() => {
    let mounted = true;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    const bindHomeSession = (nextUserId: string | null) => {
      if (!mounted) return;
      if (homeSessionUserIdRef.current === nextUserId) {
        if (nextUserId) void loadMintyPreferences(nextUserId);
        return;
      }
      homeSessionUserIdRef.current = nextUserId;
      homeCollectionRequestRef.current += 1;
      homeGeneralRequestRef.current += 1;
      homeChaseRequestRef.current += 1;
      homeChaseListingsRequestRef.current += 1;
      homeActivityRequestRef.current += 1;
      mintyPreferenceGenerationRef.current += 1;
      mintyInsightRequestRef.current += 1;
      cachedHomeSnapshotUserIdRef.current = null;
      hasLoadedCollectionValueRef.current = false;
      hasSuccessfulCollectionPricingRef.current = false;
      collectionValueReadsRef.current = [];
      refreshableVariantIdsRef.current = [];
      providerRefreshCursorRef.current = 0;
      providerRefreshSignatureRef.current = null;
      automaticProviderRefreshAtRef.current = 0;
      mintyMarketSignatureRef.current = null;

      setCollectionTotal(null);
      setCollectionPricingSummary(EMPTY_COLLECTION_PRICING);
      setCollectionPricingWarning(null);
      setCollectionChangeAmount(0);
      setCollectionChangePercent(0);
      setOwnedCardCount(0);
      setActiveBinder(null);
      setDuplicateSummary(EMPTY_DUPLICATE_SUMMARY);
      setMissingCards([]);
      setChartData([]);
      setMintyDataRefreshedAt(null);
      setUnreadCount(0);
      setRecentListings([]);
      setMarketplaceMatches([]);
      setChaseCards([]);
      setSelectedChaseKey(null);
      setChaseListingsByKey({});
      setRecentActivity([]);
      setMintyPersonalisation(DEFAULT_MINTY_PERSONALISATION_SETTINGS);
      setMintyFeedback(DEFAULT_MINTY_FEEDBACK_PROFILE);
      setApiMintyInsight(null);
      setMintyInsightError(null);
      setMintyInsightRefreshing(false);

      if (reloadTimer) clearTimeout(reloadTimer);
      if (!nextUserId) return;
      reloadTimer = setTimeout(() => {
        if (!mounted || homeSessionUserIdRef.current !== nextUserId) return;
        void applyCachedHomeCollection();
        void loadCollectionValueRef.current();
        void loadAll();
        void loadChaseCards();
        void loadRecentActivity();
        void loadMintyPreferences(nextUserId);
        void loadApiMintyInsight(false);
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      bindHomeSession(session?.user?.id ?? null);
    });
    void supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        console.log('Home session lookup failed:', error.message);
        bindHomeSession(null);
        return;
      }
      bindHomeSession(data.user?.id ?? null);
    });

    return () => {
      mounted = false;
      if (reloadTimer) clearTimeout(reloadTimer);
      subscription.unsubscribe();
    };
  }, [applyCachedHomeCollection, loadAll, loadApiMintyInsight, loadChaseCards, loadMintyPreferences, loadRecentActivity]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    let secondaryTimer: ReturnType<typeof setTimeout> | null = null;
    const livePriceTimer = setInterval(() => {
      void pollLivePrices();
    }, HOME_LIVE_PRICE_POLL_MS);

    void (async () => {
      await applyCachedHomeCollection();
      if (!cancelled) void pollLivePrices();
    })();
    void loadAll();

    secondaryTimer = setTimeout(() => {
      if (cancelled) return;
      void loadChaseCards();
      void loadRecentActivity();
    }, 180);

    return () => {
      cancelled = true;
      clearInterval(livePriceTimer);
      if (secondaryTimer) clearTimeout(secondaryTimer);
    };
  }, [applyCachedHomeCollection, loadAll, loadChaseCards, loadRecentActivity, pollLivePrices]));

  useEffect(() => {
    if (appModeHydrated && premiumSellerAccess.allowed && !hasChosenMode) {
      setRoleModalOpen(true);
      return;
    }
    if (!appModeHydrated) return;
    checkHubTip();
  }, [appModeHydrated, checkHubTip, hasChosenMode, premiumSellerAccess.allowed]);
  useEffect(() => {
    loadApiMintyInsight(false);
  }, [loadApiMintyInsight]);
  useEffect(() => {
    if (previousChartRangeRef.current === chartRange) return;
    previousChartRangeRef.current = chartRange;
    loadCollectionValue();
  }, [chartRange, loadCollectionValue]);

  const localMintyInsight = useMemo(() => buildMintyHomeInsight({
    totalValue: collectionTotal ?? 0,
    absoluteChange: collectionChangeAmount,
    percentageChange: collectionChangePercent,
    changePeriodLabel: chartRange,
    trendData: chartData,
    dataRefreshedAt: mintyDataRefreshedAt,
    ownedCount: ownedCardCount,
    activeBinder,
    duplicateSummary,
    chaseCards,
    missingCards,
    recentActivity,
    marketplaceMatchCount: marketplaceMatches.length,
  }, mintyPersonalisation, mintyFeedback), [
    activeBinder,
    chartData,
    chartRange,
    chaseCards,
    collectionChangeAmount,
    collectionChangePercent,
    collectionTotal,
    duplicateSummary,
    marketplaceMatches.length,
    mintyDataRefreshedAt,
    mintyFeedback,
    mintyPersonalisation,
    missingCards,
    ownedCardCount,
    recentActivity,
  ]);
  const mintyInsight = sanitizeMintyInsightForGate0(
    collectionTotal != null ? apiMintyInsight ?? localMintyInsight : localMintyInsight,
  );

  const openMintyAction = useCallback((insight: MintyInsight) => {
    switch (insight.recommended_route) {
      case 'complete_with_singles':
        router.push('/binder');
        return;
      case 'trade_duplicates':
        router.push({ pathname: '/(tabs)/market', params: { mode: 'trade' } } as any);
        return;
      case 'watch_sealed_entry':
        router.push('/(tabs)/market' as any);
        return;
      case 'set_price_alert':
        router.push('/(tabs)/search' as any);
        return;
      case 'watch_single_price':
      case 'protect_high_value_card':
      case 'hold_and_watch':
      default:
        router.push('/value-history');
    }
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

  const openChaseCardDetail = useCallback((item: HomeCardPreview) => {
    router.push({
      pathname: '/card/[id]',
      params: {
        id: item.cardId,
        setId: item.setId ?? undefined,
      },
    });
    setChaseSheetOpen(false);
  }, []);

  const openChaseListing = useCallback((_listing: HomeChaseListingSuggestion) => {
    // TODO: route directly to a listing detail screen when Stackr adds one.
    router.push('/(tabs)/market' as any);
    setChaseSheetOpen(false);
  }, []);

  const browseMarketplaceFromChase = useCallback(() => {
    router.push('/(tabs)/market' as any);
    setChaseSheetOpen(false);
  }, []);

  const retrySelectedChaseListings = useCallback(() => {
    if (selectedChaseCard) {
      loadChaseMarketplaceListings(selectedChaseCard, true);
    }
  }, [loadChaseMarketplaceListings, selectedChaseCard]);

  const headerButtonStyle = (glow = false) => ({
    width: HOME_TOKENS.touch.iconButton,
    height: HOME_TOKENS.touch.iconButton,
    borderRadius: 16,
    backgroundColor: glow
      ? (isDark ? 'rgba(123,77,255,0.16)' : '#F8F3FF')
      : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.94)'),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: glow ? 1.2 : 1,
    borderColor: glow ? '#7B4DFF' : 'rgba(112,70,213,0.18)',
    shadowColor: glow ? '#7046D5' : '#2A185F',
    shadowOpacity: glow ? 0.22 : 0.06,
    shadowRadius: glow ? 16 : 8,
    shadowOffset: { width: 0, height: glow ? 0 : 4 },
    elevation: glow ? 6 : 2,
  });

  const renderMintySettingRow = (
    key: keyof MintyPersonalisationSettings,
    title: string,
    subtitle: string
  ) => {
    const enabled = mintyPersonalisation[key];
    return (
      <TouchableOpacity
        key={key}
        onPress={() => updateMintyPersonalisation({ [key]: !enabled } as Partial<MintyPersonalisationSettings>)}
        activeOpacity={0.78}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>{title}</Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', lineHeight: 15, marginTop: 2 }}>
            {subtitle}
          </Text>
        </View>
        <View
          style={{
            width: 46,
            height: 26,
            borderRadius: 999,
            padding: 3,
            alignItems: enabled ? 'flex-end' : 'flex-start',
            backgroundColor: enabled ? theme.colors.primary : theme.colors.surface,
            borderWidth: 1,
            borderColor: enabled ? theme.colors.primary : theme.colors.border,
          }}
        >
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' }} />
        </View>
      </TouchableOpacity>
    );
  };

  const profileHasNew = !hasChosenMode;

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
      <StackrBackdrop />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: homeScreenPadding,
          paddingTop: HOME_TOKENS.spacing.sm,
          paddingBottom: stackrTabContentPadding.standard,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refreshLivePrices();
              void loadAll(true);
              void loadChaseCards();
              void loadRecentActivity();
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* TOP BAR */}
        <View style={{ minHeight: HOME_TOKENS.touch.primaryButtonHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: HOME_TOKENS.spacing.md, gap: HOME_TOKENS.spacing.xs }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Image
                source={stackrBrand.logoDisplay}
                style={{
                  width: stackrLogoSizes.homeMark.width,
                  height: stackrLogoSizes.homeMark.height,
                  flexShrink: 0,
                  backgroundColor: 'transparent',
                }}
                resizeMode="contain"
                accessible
                accessibilityRole="image"
                accessibilityIgnoresInvertColors
                accessibilityLabel="Stackr logo"
              />
              <Image
                source={stackrBrand.spelt}
                style={{
                  width: homeSpeltWordmarkWidth,
                  height: stackrLogoSizes.homeWordmark.height,
                  flexShrink: 1,
                  backgroundColor: 'transparent',
                }}
                resizeMode="contain"
                accessible
                accessibilityRole="image"
                accessibilityIgnoresInvertColors
                accessibilityLabel="Stackr wordmark"
              />
              <Text
                style={{ flexShrink: 0, color: theme.colors.primary, fontSize: 12, lineHeight: 13, fontWeight: '900' }}
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {'Collect.\nTrade.\nProtect.'}
              </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: HOME_TOKENS.spacing.xs, flexShrink: 0 }}>
            <TouchableOpacity
              onPress={() => {
                setHasNewInfo(false);
                setHubTipOpen(true);
              }}
              activeOpacity={0.78}
              style={headerButtonStyle(hasNewInfo)}
              accessibilityRole="button"
              accessibilityLabel="Open Stackr tips"
            >
              <Image
                source={stackrIcons.info}
                style={{ width: 30, height: 30 }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/notifications')}
              activeOpacity={0.78}
              style={headerButtonStyle(unreadCount > 0)}
              accessibilityRole="button"
              accessibilityLabel="Open notifications"
            >
              <Image
                source={stackrIcons.notifications}
                style={{ width: 31, height: 31 }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              {unreadCount > 0 && (
                <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                  <Text style={{ color: '#fff', fontSize: 12, lineHeight: 15, fontWeight: '900' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setMenuOpen(true)}
              activeOpacity={0.78}
              style={headerButtonStyle(profileHasNew)}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              <StackrProfileAvatar
                avatarUrl={myProfile?.avatar_url}
                avatarPreset={myProfile?.avatar_preset}
                size={34}
                borderWidth={1}
                accessibilityLabel="Open profile"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* VALUE TRACKER */}
        <View style={{ marginBottom: 12 }}>
          <ValueTrackerCard
            totalValue={collectionTotal}
            currency="GBP"
            percentageChange={collectionChangePercent}
            absoluteChange={collectionChangeAmount}
            changePeriodLabel={chartRange}
            trendData={chartData}
            trendRange={chartRange}
            onTrendRangeChange={handleChartRangeChange}
            ownedCount={ownedCardCount}
            pricingState={collectionPricingSummary.state}
            pricingCoverageLabel={getCollectionPriceCoverageLabel(collectionPricingSummary)}
            pricingWarning={collectionPricingWarning}
            mintyInsight={chartData.length >= 2 ? mintyInsight : null}
            mintyInsightUpdating={mintyInsightRefreshing}
            mintyInsightError={mintyInsightError}
            isLoading={collectionValueLoading}
            error={collectionValueError}
            onPress={() => router.push('/value-history')}
            onRetry={refreshLivePrices}
            onRefresh={refreshLivePrices}
            refreshing={refreshing}
            onEmptyAction={() => router.push({ pathname: '/scan', params: { mode: 'market' } })}
            onMintyAction={openMintyAction}
            onMintyInsightFeedback={handleMintyInsightFeedback}
            onMintySettingsPress={() => setMintySettingsOpen(true)}
          />
        </View>

        <HomeActionsRow
          ownedCount={ownedCardCount}
          listingCount={recentListings.length}
          onBinders={() => router.push('/binder')}
          onScan={() => router.push('/scan')}
          onSearch={() => router.push('/(tabs)/search' as any)}
          onBuildTrade={() => router.push({ pathname: '/(tabs)/market', params: { mode: 'trade' } } as any)}
          onCommunity={() => router.push('/(tabs)/community' as any)}
        />

        <ContinueBinderCard
          binder={activeBinder}
          isLoading={collectionValueLoading && !activeBinder && !homeDataError}
          error={homeDataError}
          onView={(binderId) => router.push({ pathname: '/binder/[id]', params: { id: binderId } })}
          onScan={(binderId) => router.push({ pathname: '/scan', params: { mode: 'binder', binderId } })}
          onCreate={() => router.push('/binder/new')}
        />

        <HomeOpportunitiesSection
          duplicateSummary={duplicateSummary}
          chaseCount={chaseCards.length}
          marketMoverCount={Math.max(marketplaceMatches.length, collectionChangeAmount !== 0 ? 1 : 0)}
          isLoading={(collectionValueLoading && duplicateSummary.count === 0 && !homeDataError) || chaseLoading}
          error={homeDataError ?? chaseError}
          onDuplicates={() => router.push('/duplicates' as any)}
          onChase={() => openChaseSheet()}
          onMarketMovers={() => router.push('/value-history')}
        />

        <RecentActivitySection
          items={recentActivity}
          isLoading={activityLoading}
          error={activityError}
          onRetry={loadRecentActivity}
          onItemPress={openActivityItem}
        />

      </ScrollView>

      <ChaseCardsSheet
        visible={chaseSheetOpen}
        items={chaseCards}
        isLoading={chaseLoading}
        error={chaseError}
        selectedCardId={selectedChaseCard?.cardId ?? null}
        listings={selectedChaseListings}
        listingsLoading={chaseListingsLoading}
        listingsError={chaseListingsError}
        onClose={() => setChaseSheetOpen(false)}
        onSelectCard={(item) => setSelectedChaseKey(getChaseCardKey(item))}
        onViewCard={openChaseCardDetail}
        onViewListing={openChaseListing}
        onBrowseMarketplace={browseMarketplaceFromChase}
        onAddChase={browseMarketplaceFromChase}
        onRetryListings={retrySelectedChaseListings}
      />

      <FeatureTipModal
        visible={hubTipOpen}
        title="Welcome to the Hub"
        subtitle="Your home base for value, trading, community, and quick price checks."
        items={HUB_TIP_ITEMS}
        onClose={closeHubTip}
      />

      <Modal visible={mintySettingsOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(8,10,20,0.46)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setMintySettingsOpen(false)} />
          <View style={{ backgroundColor: theme.colors.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
              <View style={{ width: 42, height: 42, borderRadius: 16, backgroundColor: `${theme.colors.primary}14`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles-outline" size={22} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.colors.text, fontSize: 20, lineHeight: 24, fontWeight: '900' }}>Minty personalisation</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 4 }}>
                  Choose what Minty can look at. Your feedback helps shape the next advice.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setMintySettingsOpen(false)}
                activeOpacity={0.76}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={19} color={theme.colors.textSoft} />
              </TouchableOpacity>
            </View>

            <View style={{ borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: 14, marginTop: 8 }}>
              {renderMintySettingRow('personalisedInsights', 'Personalised advice', 'Use your collection goals to pick the most useful Minty tips.')}
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
              {renderMintySettingRow('useChaseList', 'Use chase list', 'Connect advice to cards you are hunting.')}
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
              {renderMintySettingRow('useViewingHistory', 'Use viewing history', 'Notice cards and searches you keep coming back to.')}
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
              {renderMintySettingRow('useTradeHistory', 'Use trade history', 'Suggest ways to use duplicates for better cards.')}
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
              {renderMintySettingRow('usePriceAlerts', 'Use price alerts', 'Prioritise cards you already want price help with.')}
              <View style={{ height: 1, backgroundColor: theme.colors.border }} />
              {renderMintySettingRow('useMarketCatalysts', 'Use events and releases', 'Consider upcoming sets, events, game news, and anniversary dates.')}
            </View>

            <TouchableOpacity
              onPress={resetMintyPreferences}
              activeOpacity={0.78}
              style={{ marginTop: 14, borderRadius: 15, borderWidth: 1, borderColor: `${theme.colors.primary}44`, backgroundColor: `${theme.colors.primary}10`, paddingVertical: 13, alignItems: 'center' }}
            >
              <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>Reset Minty preferences</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {premiumSellerAccess.allowed ? (
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
                      require('../../assets/rev2/05-binder-covers/clean-cutouts/pikachu.png'),
                      require('../../assets/rev2/05-binder-covers/clean-cutouts/charizard.png'),
                      require('../../assets/rev2/05-binder-covers/clean-cutouts/eevee.png'),
                    ].map((source, index) => (
                      <View key={index} style={{ width: 24, height: 34, borderRadius: 4, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                        <Image source={source} style={{ width: 20, height: 30 }} resizeMode="contain" />
                      </View>
                    ))}
                  </View>
                </View>
                <View style={{ width: 140, height: 7, borderRadius: 999, backgroundColor: theme.colors.text }} />
                <View style={{ position: 'absolute', right: 6, bottom: 0 }}>
                  <View style={{ width: 56, height: 32, borderRadius: 4, backgroundColor: theme.colors.primary, opacity: 0.85, borderWidth: 1, borderColor: theme.colors.text }} />
                  <View style={{ position: 'absolute', right: 16, bottom: 28, width: 46, height: 36, borderRadius: 4, backgroundColor: theme.colors.secondary, borderWidth: 1, borderColor: theme.colors.text, alignItems: 'center', justifyContent: 'center' }}>
                    <Image source={require('../../assets/rev2/01-brand/app/icon.png')} style={{ width: 23, height: 23 }} resizeMode="contain" />
                    <Ionicons name="checkmark-circle" size={17} color={theme.colors.primary} style={{ position: 'absolute', right: -7, top: -8 }} />
                  </View>
                </View>
              </View>

              <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' }}>Premium Seller Mode</Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
                Trusted seller beta access adds professional inventory tools and browse-only listing publication. Stackr cannot create orders, take payment, buy shipping or trigger payouts in this release.
              </Text>
            </View>

            {[
              { icon: 'scan-outline' as const, text: 'Scan stock out to keep inventory accurate' },
              { icon: 'bar-chart-outline' as const, text: 'Keep inventory accurate on the go' },
              { icon: 'storefront-outline' as const, text: 'Built for conventions, events and higher-volume sellers' },
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
                Market browsing and trades remain available outside the trusted seller beta. Listing publication is beta-only.
              </Text>
            </View>

            <TouchableOpacity
              onPress={async () => {
                const opened = await setMode('seller');
                setRoleModalOpen(false);
                if (opened) router.push('/seller' as any);
              }}
              style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10 }}
              activeOpacity={0.86}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>Open Premium Seller Mode</Text>
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
      ) : null}
      {/* HAMBURGER MENU */}
      <Modal visible={menuOpen} transparent animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setMenuOpen(false)}>
          <Pressable
            style={{ position: 'absolute', top: 80, right: 16, backgroundColor: theme.colors.card, borderRadius: 20, padding: 8, borderWidth: 1, borderColor: theme.colors.border, minWidth: 220, ...cardShadow }}
            onPress={() => {}}
          >
            <TouchableOpacity onPress={() => { setMenuOpen(false); router.push('/profile'); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 12 }} activeOpacity={0.7}>
              <StackrProfileAvatar
                avatarUrl={myProfile?.avatar_url}
                avatarPreset={myProfile?.avatar_preset}
                size={28}
                borderWidth={1}
                accessibilityLabel="My Profile"
              />
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
