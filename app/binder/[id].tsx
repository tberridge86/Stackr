import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Switch,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Text } from '../../components/Text';
import { SafeAreaView , useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EditionAwareCardImage from '../../components/EditionAwareCardImage';
import PokeTraceMarketInsights from '../../components/PokeTraceMarketInsights';
import {
  BinderRecord,
  BinderCardRecord,
  addCardsToBinder,
  fetchBinderById,
  fetchBinderCards,
  updateBinderCardOwned,
  updateBinderCardCondition,
  updateBinderCardGrading,
  updateBinderCardQuantity,
  CONDITION_MULTIPLIERS,
  getEstimatedValue,
} from '../../lib/binders';
import { useTrade } from '../../components/trade-context';
import { supabase } from '../../lib/supabase';
import { fetchEbayPrice } from '../../lib/ebay';
import { USD_TO_GBP, EUR_TO_GBP } from '../../lib/config';
import { fetchTcgcsvUiCardPricesForSet } from '../../lib/pricing';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import { checkAchievements, recordAchievementEvent } from '../../lib/achievements';
import type { ScanEditionHint } from '../../types/scan';

// ===============================
// CONSTANTS
// ===============================

const CONDITION_OPTIONS = [
  'Mint',
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
];

const GRADING_COMPANIES = ['PSA', 'CGC', 'BGS', 'Ace'];
const GRADES = ['10', '9.5', '9', '8', '7'];


const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

// ===============================
// TYPES
// ===============================

type BinderCardWithDetails = BinderCardRecord & {
  card?: any | null;
};

type ShowcaseType = 'favorite' | 'chase';

type ShowcaseRow = {
  id: string;
  user_id: string;
  binder_id: string;
  card_id: string;
  set_id: string;
  showcase_type: ShowcaseType;
  sort_order: number;
};

type CardPreviewResult = {
  card_id: string;
  name: string;
  set_name?: string | null;
  image_url?: string | null;
};

type SortMode = 'binder' | 'name' | 'owned' | 'missing' | 'number';

type EbayModalPrice = {
  low: number | null;
  average: number | null;
  high: number | null;
  count: number;
  usedFallback?: boolean;
};

type TcgFallbackPrice = {
  low: number | null;
  mid: number | null;
  market: number | null;
};

// ===============================
// HELPERS
// ===============================

const getSetIdFromCardId = (cardId: string) => {
  const parts = cardId.split('-');
  return parts.length > 1 ? parts[0] : '';
};

const getBinderEditionHint = (edition?: string | null): ScanEditionHint | null => {
  if (edition === '1st_edition' || edition === 'unlimited' || edition === 'shadowless') return edition;
  return null;
};

const getOwnedQuantity = (card?: Pick<BinderCardRecord, 'owned_quantity'> | null) =>
  Math.max(1, Math.floor(Number(card?.owned_quantity ?? 1) || 1));

const getVariantKey = (cardId: string, setId: string, variant: string) => `${setId}:${cardId}:${variant}`;
const getVariantCardKey = (cardId: string, setId: string) => `${setId}:${cardId}`;

const getVariantQuantityFromMap = (
  variants: Map<string, number>,
  cardId: string,
  setId: string,
  variant: string
) => Math.max(0, Math.floor(Number(variants.get(getVariantKey(cardId, setId, variant)) ?? 0) || 0));

const formatCurrency = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '--';
  return `£${value.toFixed(2)}`;
};

const getBaseCardValue = (card: any): number => {
  return card?.ebay_price ?? card?.tcg_price ?? card?.cardmarket_price ?? 0;
};

const getPreferredBinderCardPrice = (card: BinderCardWithDetails, variant?: string | null, edition?: string | null): number => {
  return getBinderTcgPrice(card.card, edition, variant) ?? card.ebay_price ?? card.tcg_price ?? card.cardmarket_price ?? 0;
};

const getGradeDescriptor = (grade?: string | null): string => {
  const numeric = Number(grade);
  if (Number.isNaN(numeric)) return 'AUTHENTIC';
  if (numeric >= 10) return 'GEM MINT';
  if (numeric >= 9.5) return 'GEM MINT';
  if (numeric >= 9) return 'MINT';
  if (numeric >= 8) return 'NM-MT';
  if (numeric >= 7) return 'NEAR MINT';
  return 'GRADED';
};

const getSlabAccent = (company?: string | null): string => {
  const key = (company ?? '').toUpperCase();
  if (key === 'PSA') return '#DC2626';
  if (key === 'CGC') return '#2563EB';
  if (key === 'BGS') return '#D97706';
  if (key === 'ACE') return '#7C3AED';
  return '#334155';
};

const getCardmarketPrice = (binderCard: any): number | null => {
  if (typeof binderCard?.cardmarket_price === 'number') return binderCard.cardmarket_price;
  const prices = binderCard?.card?.cardmarket?.prices;
  if (!prices) return null;
  const eur = prices.trendPrice ?? prices.averageSellPrice ?? prices.avg30;
  return typeof eur === 'number' ? Math.round(eur * EUR_TO_GBP * 100) / 100 : null;
};

const getBinderTcgPrice = (card: any, edition?: string | null, variant?: string | null): number | null => {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  if (variant) {
    const value = prices[variant]?.market ?? prices[variant]?.mid ?? prices[variant]?.low;
    if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
    return null;
  }

  if (edition === '1st_edition') {
    const preferred = ['1stEditionHolofoil', '1stEditionNormal'];
    for (const key of preferred) {
      const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
      if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
    }
    return null;
  }

  if (edition === 'unlimited') {
    const preferred = ['unlimitedHolofoil', 'unlimited', 'holofoil', 'reverseHolofoil', 'normal'];
    for (const key of preferred) {
      const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
      if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
    }
    return null;
  }

  const preferred = ['unlimitedHolofoil', 'unlimited', 'holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal'];
  for (const key of preferred) {
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
  }

  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
  }

  return null;
};

function GradedSlabCard({
  item,
  imageUri,
  editionHint,
  size = 'grid',
  opacity = 1,
}: {
  item: BinderCardWithDetails;
  imageUri: string | null;
  editionHint: ScanEditionHint | null;
  size?: 'showcase' | 'grid' | 'modal';
  opacity?: number;
}) {
  const company = (item.grade_company ?? 'PSA').toUpperCase();
  const grade = item.grade ?? '10';
  const accent = getSlabAccent(company);
  const cardName = item.card?.name ?? item.card_name ?? item.card_id;
  const setName = item.card?.set?.name ?? item.set_name ?? item.set_id;
  const number = item.card?.number ?? item.card_number ?? null;
  const compact = size !== 'modal';
  const labelHeight = compact ? (size === 'showcase' ? 46 : 54) : 86;
  const outerPadding = compact ? 4 : 8;
  const bodyPadding = compact ? 4 : 8;
  const companyWidth = compact ? (size === 'showcase' ? 38 : 44) : 94;
  const gradeWidth = compact ? (size === 'showcase' ? 34 : 40) : 76;

  return (
    <View style={{
      width: '100%',
      height: '100%',
      opacity,
      borderRadius: compact ? 11 : 24,
      backgroundColor: '#DDE3EC',
      padding: outerPadding,
      borderWidth: compact ? 1 : 2,
      borderColor: '#AAB4C2',
    }}>
      <View style={{
        backgroundColor: '#F8FAFC',
        borderRadius: compact ? 8 : 16,
        borderWidth: 1,
        borderColor: '#CBD5E1',
        overflow: 'hidden',
        marginBottom: compact ? 5 : 8,
      }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          minHeight: labelHeight,
        }}>
          <View style={{
            width: companyWidth,
            backgroundColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: compact ? 3 : 10,
          }}>
            <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: compact ? (size === 'showcase' ? 10 : 12) : 24, fontWeight: '900' }}>
              {company}
            </Text>
          </View>

          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: compact ? 5 : 10, paddingVertical: compact ? 3 : 7 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color: '#0F172A', fontSize: compact ? (size === 'showcase' ? 7 : 9) : 15, fontWeight: '900' }}>
              {cardName}
            </Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={{ color: '#64748B', fontSize: compact ? (size === 'showcase' ? 5.5 : 7) : 11, fontWeight: '800', marginTop: compact ? 1 : 3 }}>
              {setName}{number ? ` #${number}` : ''}
            </Text>
            <Text numberOfLines={1} style={{ color: '#64748B', fontSize: compact ? 5 : 10, fontWeight: '800', marginTop: compact ? 0 : 3 }}>
              POKEMON CARD
            </Text>
          </View>

          <View style={{
            width: gradeWidth,
            backgroundColor: '#FFFFFF',
            borderLeftWidth: 1,
            borderLeftColor: '#CBD5E1',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Text numberOfLines={1} style={{ color: accent, fontSize: compact ? (size === 'showcase' ? 14 : 17) : 32, fontWeight: '900' }}>
              {grade}
            </Text>
            {!compact && (
              <Text numberOfLines={1} style={{ color: '#334155', fontSize: 9, fontWeight: '900' }}>
                {getGradeDescriptor(grade)}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={{
        flex: 1,
        borderRadius: compact ? 8 : 18,
        backgroundColor: '#C7D2E1',
        padding: bodyPadding,
        borderWidth: 1,
        borderColor: '#94A3B8',
      }}>
        <View style={{
          flex: 1,
          borderRadius: compact ? 6 : 12,
          overflow: 'hidden',
          backgroundColor: '#F8FAFC',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {imageUri ? (
            <EditionAwareCardImage
              uri={imageUri}
              cardId={item.card_id}
              rawData={item.card}
              editionHint={editionHint}
              sourceSize={size === 'modal' ? 'large' : 'small'}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ color: '#64748B', fontSize: compact ? 9 : 13, fontWeight: '800' }}>No image</Text>
          )}
        </View>
      </View>

      <View style={{
        position: 'absolute',
        left: compact ? 3 : 6,
        right: compact ? 3 : 6,
        top: compact ? 3 : 6,
        bottom: compact ? 3 : 6,
        borderRadius: compact ? 10 : 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.72)',
      }} pointerEvents="none" />
    </View>
  );
}

// ===============================
// VARIANT HELPERS
// ===============================

const VARIANT_LABELS: Record<string, string> = {
  normal: 'Base',
  holofoil: 'Holo',
  reverseHolofoil: 'Reverse Holo',
  '1stEditionNormal': '1st',
  '1stEditionHolofoil': '1stH',
  unlimitedHolofoil: 'Unlimited Holo',
  unlimited: 'Unlimited',
  reverseHoloEnergy: 'Reverse Holo',
  reverseHoloPokeball: 'Reverse Holo',
};

type MasterVariantKind = 'base' | 'holo' | 'reverse';

const MASTER_VARIANT_COPY: Record<MasterVariantKind, { label: string; helper: string; icon: string; bg: string; color: string; border: string; rainbow?: boolean }> = {
  base: {
    label: 'Base',
    helper: 'Left third',
    icon: 'square-outline',
    bg: '#EEF2FF',
    color: '#0B1746',
    border: '#D9E0FF',
  },
  holo: {
    label: 'Holo',
    helper: 'Middle third',
    icon: 'sparkles',
    bg: '#EFE7FF',
    color: '#6D3DFF',
    border: '#DED1FF',
  },
  reverse: {
    label: 'Reverse Holo',
    helper: 'Right third',
    icon: 'sparkles',
    bg: '#F6E7FF',
    color: '#6D3DFF',
    border: '#F0C9FF',
    rainbow: true,
  },
};

function getMasterVariantKind(key: string): MasterVariantKind {
  if (key === 'normal' || key === '1stEditionNormal' || key === 'unlimited') return 'base';
  if (key === 'holofoil' || key === '1stEditionHolofoil' || key === 'unlimitedHolofoil') return 'holo';
  return 'reverse';
}

// Per-set variant overrides (e.g. for sets with multiple reverse holo patterns like Poké Ball)
const SET_VARIANT_OVERRIDES: Record<string, Partial<Record<string, string[]>>> = {
  asc: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  ASC: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  // English 151: Only force 2 slices if your DB doesn't have the price keys yet
  me2pt5: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  me3: {
    Common: ['normal', 'reverseHolofoil'],
    Uncommon: ['normal', 'reverseHolofoil'],
  },
};

const getMasterSetStorageKey = (binderId: string) => `stackr:binder-master-set:${binderId}`;

function getVariants(card: any, explicitSetId?: string): string[] {
  const setId = (explicitSetId ?? card?.set?.id ?? card?.set_id ?? '').toLowerCase();
  const setName = (card?.set?.name ?? card?.raw_data?.set?.name ?? '').toLowerCase();

  // 1. Check for hardcoded set overrides by set ID
  let override = SET_VARIANT_OVERRIDES[setId] || SET_VARIANT_OVERRIDES[setId.toUpperCase()];

  // Fallback by set name in case naming differs
  if (!override && setName.includes('ascended')) {
    override = {
      Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
      Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    };
  }

  if (override && card?.rarity) {
    const r = card.rarity;
    const variants = override[r] ||
                     override[r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()] ||
                     override[r.toLowerCase()];
    if (variants) return variants;
  }

  // 2. Try to get variants from TCGPlayer price keys (Most cards fall here)
  const prices = card?.tcgplayer?.prices ?? card?.raw_data?.tcgplayer?.prices;
  const keys = Object.keys(prices ?? {}).filter(k => k !== 'unlimited');

  // Return multiple variants ONLY if they exist in the database data
  if (keys.length > 1) return keys;

  // 3. Fallback: Default to a single variant if no multi-variant data is found
  return keys.length > 0 ? [keys[0]] : ['normal'];
}

const getDefaultOwnedVariant = (variants: string[]): string | null => {
  const preferred = [
    'normal',
    'unlimited',
    'holofoil',
    'unlimitedHolofoil',
    '1stEditionNormal',
    '1stEditionHolofoil',
    'reverseHolofoil',
    'reverseHoloEnergy',
    'reverseHoloPokeball',
  ];

  return preferred.find((variant) => variants.includes(variant)) ?? variants[0] ?? null;
};

// ===============================
// MAIN COMPONENT
// ===============================

export default function BinderDetailScreen() {
  const { theme } = useTheme();
  const { id, readOnly } = useLocalSearchParams<{ id: string; readOnly?: string }>();
  const binderId = Array.isArray(id) ? id[0] : id;
  const routeReadOnly = readOnly === 'true';
  const insets = useSafeAreaInsets();
  const { width, height: screenHeight } = useWindowDimensions();
  const numColumns = width >= 900 ? 6 : width >= 600 ? 4 : 2;
  const cardWidth = (width - 32 - (numColumns - 1) * 8) / numColumns;

  // ===============================
  // STATE
  // ===============================

  const [binder, setBinder] = useState<BinderRecord | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [cards, setCards] = useState<BinderCardWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const [sortMode, setSortMode] = useState<SortMode>('number');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  const [selectedCard, setSelectedCard] = useState<BinderCardWithDetails | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const [modalEbayPrice, setModalEbayPrice] = useState<EbayModalPrice | null>(null);
  const [modalEbayLoading, setModalEbayLoading] = useState(false);
  const [modalEbayError, setModalEbayError] = useState(false);
  const [modalTcgFallbackPrice, setModalTcgFallbackPrice] = useState<TcgFallbackPrice | null>(null);

  const [showcaseRows, setShowcaseRows] = useState<ShowcaseRow[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [debouncedAddSearch, setDebouncedAddSearch] = useState('');
  const [addSearchResults, setAddSearchResults] = useState<CardPreviewResult[]>([]);
  const [addSearchLoading, setAddSearchLoading] = useState(false);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);
const [pendingAddIds, setPendingAddIds] = useState<Record<string, CardPreviewResult>>({});
const pendingAddCount = Object.keys(pendingAddIds).length;
  const [addGradeCompany, setAddGradeCompany] = useState('PSA');
  const [addGrade, setAddGrade] = useState('10');
  const [gradingCardToAdd, setGradingCardToAdd] = useState<BinderCardWithDetails | null>(null);
  const [gradingPromptCompany, setGradingPromptCompany] = useState('PSA');
  const [gradingPromptGrade, setGradingPromptGrade] = useState('10');

  const [tradeModalVisible, setTradeModalVisible] = useState(false);
  const [tradeCard, setTradeCard] = useState<BinderCardWithDetails | null>(null);
  const [tradeCondition, setTradeCondition] = useState<string>('Near Mint');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeNotes, setTradeNotes] = useState('');
  const [tradeOnly, setTradeOnly] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ownedVariants, setOwnedVariants] = useState<Map<string, number>>(new Map());
  const [variantManagedCards, setVariantManagedCards] = useState<Set<string>>(new Set());
  const [masterSetEnabled, setMasterSetEnabled] = useState(false);
  const [masterSetIntroVisible, setMasterSetIntroVisible] = useState(false);
  const [updatingMasterSet, setUpdatingMasterSet] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const lastGridScrollYRef = useRef(0);
  const achievementProgressRef = useRef<Record<string, number>>({});
  const isOwner = Boolean(userId && binder?.user_id === userId);
  const isReadOnly = routeReadOnly || (Boolean(binder) && !isOwner);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    toastTimer.current = setTimeout(() => setToastMessage(null), 2500);
  };

  const [showcaseCollapsed, setShowcaseCollapsed] = useState<Record<ShowcaseType, boolean>>({
  favorite: true,
  chase: true,
});

  const modalTranslateY = useRef(new Animated.Value(0)).current;
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const imageScale = Animated.multiply(baseScale, pinchScale);

  const { createTradeListing, toggleWishlistCard, isForTrade, isWanted } = useTrade();

  const sortOptions: { label: string; value: SortMode }[] = [
    { label: 'Binder order', value: 'binder' },
    { label: 'Name', value: 'name' },
    { label: 'Owned first', value: 'owned' },
    { label: 'Missing first', value: 'missing' },
    { label: 'Number', value: 'number' },
  ];

  const currentSortLabel =
    sortOptions.find((o) => o.value === sortMode)?.label ?? 'Binder order';

  // ===============================
  // MODAL HELPERS
  // ===============================

  const closeDetailModal = () => {
    setDetailVisible(false);
    setModalEbayPrice(null);
    setModalEbayError(false);
    setModalTcgFallbackPrice(null);
    modalTranslateY.setValue(0);
    baseScale.setValue(1);
    pinchScale.setValue(1);
    lastScale.current = 1;
  };

  const resetTradeModal = () => {
    setTradeCard(null);
    setTradeCondition('Near Mint');
    setTradePrice('');
    setTradeNotes('');
    setTradeOnly(false);
  };

  // ===============================
  // EBAY PRICE FOR MODAL
  // ===============================

  const fetchModalEbayPrice = useCallback(async (card: BinderCardWithDetails) => {
    try {
      setModalEbayLoading(true);
      setModalEbayError(false);
      setModalEbayPrice(null);

      const name = card.card?.name ?? card.card_name ?? '';
      const setName = card.card?.set?.name ?? card.set_name ?? '';
      const number = card.card?.number ?? card.card_number ?? '';
      const cardId = card.card?.id ?? card.card_id ?? '';
      const baseRarity = card.card?.rarity ?? '';
      const isGraded = binder?.card_mode === 'graded';
      if (isGraded) {
        setModalEbayLoading(false);
        return;
      }
      const rarity = binder?.edition === '1st_edition'
        ? `${baseRarity} 1st edition`.trim()
        : baseRarity;

      const result = await fetchEbayPrice({
        cardId,
        name,
        setName,
        number,
        setTotal: card.card?.set?.printedTotal ?? card.card?.set?.total ?? null,
        rarity,
        pricingMode: 'raw',
        condition: isGraded ? null : card.condition || 'Near Mint',
        gradingCompany: isGraded ? card.grade_company ?? 'PSA' : null,
        grade: isGraded ? card.grade ?? '10' : null,
      });

      setModalEbayPrice({
        low: result.low ?? null,
        average: result.average ?? null,
        high: result.high ?? null,
        count: result.count ?? 0,
        usedFallback: result.usedFallback ?? false,
      });
    } catch (err) {
      console.warn('Modal eBay price unavailable:', err instanceof Error ? err.message : err);
      setModalEbayError(true);
    } finally {
      setModalEbayLoading(false);
    }
  }, [binder?.card_mode, binder?.edition]);

  // ===============================
  // LOAD
  // ===============================

  const load = useCallback(async () => {
    if (!binderId) return;

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const binderData = await fetchBinderById(binderId);

      if (!binderData || (binderData.user_id !== user?.id && !binderData.is_public)) {
        setBinder(null);
        setCards([]);
        setShowcaseRows([]);
        return;
      }

      setBinder(binderData);
      setIsPublic(Boolean(binderData?.is_public));

      const binderCards = await fetchBinderCards(binderId);

      if (user) {
        const { data, error } = await supabase
          .from('binder_card_showcases')
          .select('*')
          .eq('user_id', user.id)
          .eq('binder_id', binderId)
          .order('sort_order', { ascending: true });

        if (error) throw error;
        setShowcaseRows((data ?? []) as ShowcaseRow[]);

        const { data: userBinders, error: userBindersError } = await supabase
          .from('binders')
          .select('id')
          .eq('user_id', user.id);

        if (userBindersError) throw userBindersError;

        const userBinderIds = (userBinders ?? []).map((row) => row.id).filter(Boolean);
        const { data: ownedRows, error: ownedRowsError } = userBinderIds.length
          ? await supabase
              .from('binder_cards')
              .select('card_id, set_id')
              .in('binder_id', userBinderIds)
              .eq('owned', true)
          : { data: [], error: null };

        if (ownedRowsError) throw ownedRowsError;

        const nextGlobalOwnedKeys = new Set(
          (ownedRows ?? []).map((row) => `${row.set_id}:${row.card_id}`)
        );
        setCards(binderCards.map((card) => ({
          ...card,
          owned: card.owned || nextGlobalOwnedKeys.has(`${card.set_id}:${card.card_id}`),
        })));

        // Load variant ownership for all cards in this binder
        const cardIds = binderCards.map((c) => c.card_id);
        if (cardIds.length > 0) {
          const setIds = Array.from(new Set(binderCards.map((c) => c.set_id).filter(Boolean)));
          const binderVariantCardKeys = new Set(
            binderCards.map((card) => getVariantCardKey(card.card_id, card.set_id))
          );
          const { data: variantRowsWithQuantity, error: variantQuantityError } = await supabase
            .from('user_card_variants')
            .select('card_id, set_id, variant, quantity')
            .eq('user_id', user.id)
            .in('card_id', cardIds)
            .in('set_id', setIds);

          const variantRows = variantQuantityError
            ? (await supabase
                .from('user_card_variants')
                .select('card_id, set_id, variant')
                .eq('user_id', user.id)
                .in('card_id', cardIds)
                .in('set_id', setIds)).data
            : variantRowsWithQuantity;

          const typedVariantRows = ((variantRows ?? []) as {
            card_id: string;
            set_id?: string | null;
            variant: string;
            quantity?: number | null;
          }[]).filter((row) =>
            Boolean(row.set_id) && binderVariantCardKeys.has(getVariantCardKey(row.card_id, row.set_id ?? ''))
          );

          setOwnedVariants(new Map(
            typedVariantRows.map((row) => [
              getVariantKey(row.card_id, row.set_id ?? '', row.variant),
              Math.max(1, Number(row.quantity ?? 1)),
            ])
          ));
          setVariantManagedCards(new Set(
            typedVariantRows.map((row) => getVariantCardKey(row.card_id, row.set_id ?? ''))
          ));
        } else {
          setOwnedVariants(new Map());
          setVariantManagedCards(new Set());
        }
      } else {
        setCards(binderCards);
        setOwnedVariants(new Map());
        setVariantManagedCards(new Set());
      }
    } catch (error) {
      console.log('Failed to load binder', error);
      Alert.alert('Error', 'Could not load this binder.');
    } finally {
      setLoading(false);
    }
  }, [binderId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    let mounted = true;

    const loadMasterSetMode = async () => {
      if (!binderId) return;
      try {
        const stored = await AsyncStorage.getItem(getMasterSetStorageKey(binderId));
        if (mounted) setMasterSetEnabled(stored === 'true' || binder?.master_set_enabled === true);
      } catch (error) {
        console.log('Failed to load master set setting', error);
      }
    };

    loadMasterSetMode();

    return () => {
      mounted = false;
    };
  }, [binder?.master_set_enabled, binderId]);

  // ===============================
  // DEBOUNCED SEARCH
  // ===============================

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAddSearch(addSearch), 350);
    return () => clearTimeout(timer);
  }, [addSearch]);

  useEffect(() => {
    if (debouncedAddSearch.trim().length >= 2) {
      searchCardsToAdd(debouncedAddSearch);
    } else {
      setAddSearchResults([]);
    }
  }, [debouncedAddSearch]);

  // ===============================
  // SORTED CARDS
  // ===============================

  const sortedCards = useMemo(() => {
    const next = [...cards];
    if (sortMode === 'binder') return next.sort((a, b) => a.slot_order - b.slot_order);
    if (sortMode === 'name') return next.sort((a, b) =>
      String(a.card?.name ?? a.card_id).localeCompare(String(b.card?.name ?? b.card_id))
    );
    if (sortMode === 'owned') return next.sort((a, b) => Number(b.owned) - Number(a.owned));
    if (sortMode === 'missing') return next.sort((a, b) => Number(a.owned) - Number(b.owned));
    if (sortMode === 'number') return next.sort((a, b) =>
      String(a.card?.number ?? a.card_id).localeCompare(
        String(b.card?.number ?? b.card_id),
        undefined,
        { numeric: true }
      )
    );
    return next;
  }, [cards, sortMode]);

  let ownedCount = 0;
  let totalCount = 0;
  for (const c of cards) {
    const savedVariants = [...ownedVariants.keys()]
      .filter((key) => key.startsWith(`${c.set_id}:${c.card_id}:`))
      .map((key) => key.slice(`${c.set_id}:${c.card_id}:`.length));
    const variants = masterSetEnabled ? getVariants(c.card, c.set_id) : ['card'];
    if (masterSetEnabled && variants.length > 1) {
      totalCount += variants.length;
      const variantManaged = variantManagedCards.has(getVariantCardKey(c.card_id, c.set_id));
      const defaultVariant = c.owned && !variantManaged ? getDefaultOwnedVariant(variants) : null;
      const ownedVariantCount = variants.filter((v) =>
        getVariantQuantityFromMap(ownedVariants, c.card_id, c.set_id, v) > 0 || v === defaultVariant
      ).length;
      ownedCount += ownedVariantCount > 0 ? ownedVariantCount : !variantManaged && c.owned ? 1 : 0;
    } else {
      totalCount += 1;
      if (c.owned || savedVariants.length > 0) ownedCount += 1;
    }
  }
  const progressPercent = totalCount ? Math.round((ownedCount / totalCount) * 100) : 0;

  useEffect(() => {
    if (!binderId || totalCount <= 0 || loading) return;

    const lastProgress = achievementProgressRef.current[binderId] ?? -1;
    if (progressPercent <= lastProgress && progressPercent < 100) return;
    achievementProgressRef.current[binderId] = progressPercent;

    checkAchievements({
      binderId,
      binderCompletion: progressPercent,
      masterSetEnabled,
    }).catch((achievementError) => {
      console.log('Binder progress achievement check failed:', achievementError);
    });

    if (progressPercent >= 100 && lastProgress < 100) {
      recordAchievementEvent(
        masterSetEnabled ? 'master_set_complete' : 'binder_complete',
        {
          binderId,
          binderCompletion: progressPercent,
          complete: true,
          masterSetEnabled,
        }
      ).catch((achievementError) => {
        console.log('Binder complete achievement event failed:', achievementError);
      });
    }
  }, [binderId, loading, masterSetEnabled, progressPercent, totalCount]);

  const binderValue = useMemo(() => {
    return cards.reduce((sum, card) => {
      const variantManaged = variantManagedCards.has(getVariantCardKey(card.card_id, card.set_id));
      let variants = masterSetEnabled
        ? getVariants(card.card, card.set_id).filter((variant) => {
            const savedQuantity = getVariantQuantityFromMap(ownedVariants, card.card_id, card.set_id, variant);
            if (savedQuantity > 0) return true;
            const defaultVariant = card.owned && !variantManaged
              ? getDefaultOwnedVariant(getVariants(card.card, card.set_id))
              : null;
            return variant === defaultVariant;
          })
        : [...ownedVariants.keys()]
            .filter((key) => key.startsWith(`${card.set_id}:${card.card_id}:`))
            .map((key) => key.slice(`${card.set_id}:${card.card_id}:`.length));

      if (masterSetEnabled && card.owned && !variantManaged && variants.length === 0) {
        const defaultVariant = getDefaultOwnedVariant(getVariants(card.card, card.set_id));
        variants = defaultVariant ? [defaultVariant] : [];
      }

      if (variants.length) {
        return sum + variants.reduce((variantSum, variant) => {
          const base = getPreferredBinderCardPrice(card, variant, binder?.edition);
          const savedQuantity = getVariantQuantityFromMap(ownedVariants, card.card_id, card.set_id, variant);
          const quantity = savedQuantity > 0 ? savedQuantity : getOwnedQuantity(card);
          return variantSum + getEstimatedValue(base, card.condition || 'Near Mint') * quantity;
        }, 0);
      }

      if (!card.owned) return sum;

      const base = getPreferredBinderCardPrice(card, null, binder?.edition);
      return sum + getEstimatedValue(base, card.condition || 'Near Mint');
    }, 0);
  }, [binder?.edition, cards, masterSetEnabled, ownedVariants, variantManagedCards]);

  const getDisplayedVariantQuantity = useCallback((card: BinderCardWithDetails, variant: string) => {
    const savedQuantity = getVariantQuantityFromMap(ownedVariants, card.card_id, card.set_id, variant);
    if (savedQuantity > 0) return savedQuantity;
    const variantManaged = variantManagedCards.has(getVariantCardKey(card.card_id, card.set_id));
    if (variantManaged) return 0;
    if (!masterSetEnabled || !card.owned) return 0;

    const defaultVariant = getDefaultOwnedVariant(getVariants(card.card, card.set_id));
    return variant === defaultVariant ? getOwnedQuantity(card) : 0;
  }, [masterSetEnabled, ownedVariants, variantManagedCards]);

  const getDisplayedOwnedQuantity = useCallback((card: BinderCardWithDetails) => {
    const baseQuantity = card.owned ? getOwnedQuantity(card) : 0;
    if (!masterSetEnabled) return baseQuantity;

    const variants = getVariants(card.card, card.set_id);
    if (variants.length <= 1) return baseQuantity;

    const ownedVariantCount = variants.reduce((sum, variant) =>
      sum + getDisplayedVariantQuantity(card, variant), 0);
    if (variantManagedCards.has(getVariantCardKey(card.card_id, card.set_id))) return ownedVariantCount;

    return Math.max(baseQuantity, ownedVariantCount);
  }, [getDisplayedVariantQuantity, masterSetEnabled, variantManagedCards]);

  // ===============================
  // VISIBILITY TOGGLE
  // ===============================

  const togglePublic = async () => {
    try {
      if (!binder || updatingVisibility) return;
      setUpdatingVisibility(true);
      const newValue = !isPublic;
      setIsPublic(newValue);

      const { error } = await supabase
        .from('binders')
        .update({ is_public: newValue })
        .eq('id', binder.id);

      if (error) throw error;

      if (newValue) {
        checkAchievements({ publicBinder: true }).catch((achievementError) => {
          console.log('Public binder achievement check failed:', achievementError);
        });
      }
    } catch (err) {
      console.log('Toggle public error:', err);
      setIsPublic((prev) => !prev);
      Alert.alert('Could not update binder', 'Please try again.');
    } finally {
      setUpdatingVisibility(false);
    }
  };

  const toggleMasterSet = async (value: boolean) => {
    if (!binderId || updatingMasterSet) return;
    try {
      setUpdatingMasterSet(true);
      setMasterSetEnabled(value);
      await AsyncStorage.setItem(getMasterSetStorageKey(binderId), value ? 'true' : 'false');
      if (value) {
        recordAchievementEvent('master_set_enabled', { binderId }).catch((achievementError) => {
          console.log('Master set achievement check failed:', achievementError);
        });
      }
      const { error } = await supabase
        .from('binders')
        .update({ master_set_enabled: value })
        .eq('id', binderId);

      if (error && error.code !== 'PGRST204') throw error;

      setBinder((current) => current ? { ...current, master_set_enabled: value } : current);
      if (value) {
        setTimeout(() => setMasterSetIntroVisible(true), 80);
      } else {
        setMasterSetIntroVisible(false);
      }
    } catch (error) {
      console.log('Toggle master set error:', error);
      setMasterSetEnabled((prev) => !prev);
      setMasterSetIntroVisible(false);
      Alert.alert('Could not update binder', 'Please try again.');
    } finally {
      setUpdatingMasterSet(false);
    }
  };

  // ===============================
  // SHOWCASE
  // ===============================

  const getShowcaseItems = (type: ShowcaseType) => {
    return showcaseRows
      .filter((row) => row.showcase_type === type)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row) => cards.find((c) => c.card_id === row.card_id && c.set_id === row.set_id))
      .filter(Boolean) as BinderCardWithDetails[];
  };

  const isShowcased = (item: BinderCardWithDetails, type: ShowcaseType) => {
    return showcaseRows.some(
      (row) =>
        row.card_id === item.card_id &&
        row.set_id === item.set_id &&
        row.showcase_type === type
    );
  };

  const toggleShowcase = async (item: BinderCardWithDetails, type: ShowcaseType) => {
    if (isReadOnly) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('You must be signed in.');
      if (!binderId) throw new Error('Missing binder ID.');

      const existing = showcaseRows.find(
        (row) =>
          row.card_id === item.card_id &&
          row.set_id === item.set_id &&
          row.showcase_type === type
      );

      if (existing) {
        const { error } = await supabase
          .from('binder_card_showcases')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
        setShowcaseRows((prev) => prev.filter((row) => row.id !== existing.id));
        return;
      }

      const currentRows = showcaseRows.filter((row) => row.showcase_type === type);

      if (currentRows.length >= 3) {
        Alert.alert(
          type === 'favorite' ? 'Favourite limit reached' : 'Chase card limit reached',
          type === 'favorite'
            ? 'You can only choose 3 favourite cards per set.'
            : 'You can only choose 3 chase cards per set.'
        );
        return;
      }

      const { data, error } = await supabase
        .from('binder_card_showcases')
        .insert({
          user_id: user.id,
          binder_id: binderId,
          card_id: item.card_id,
          set_id: item.set_id,
          showcase_type: type,
          sort_order: currentRows.length,
        })
        .select()
        .single();

      if (error) throw error;
      setShowcaseRows((prev) => [...prev, data as ShowcaseRow]);
    } catch (error: any) {
      console.log('Failed to update showcase', error);
      Alert.alert('Could not update showcase', error?.message ?? 'Something went wrong.');
    }
  };

  const reorderShowcase = async (type: ShowcaseType, orderedItems: BinderCardWithDetails[]) => {
    if (isReadOnly) return;

    const rowsForType = showcaseRows.filter((row) => row.showcase_type === type);

    const updatedRows = rowsForType.map((row) => {
      const nextIndex = orderedItems.findIndex(
        (item) => item.card_id === row.card_id && item.set_id === row.set_id
      );
      return { ...row, sort_order: nextIndex >= 0 ? nextIndex : row.sort_order };
    });

    setShowcaseRows((prev) => [
      ...prev.filter((row) => row.showcase_type !== type),
      ...updatedRows,
    ]);

    try {
      await Promise.all(
        updatedRows.map((row) =>
          supabase
            .from('binder_card_showcases')
            .update({ sort_order: row.sort_order })
            .eq('id', row.id)
        )
      );
    } catch (error) {
      console.log('Failed to reorder showcase', error);
      Alert.alert('Error', 'Could not save showcase order.');
      load();
    }
  };

  // ===============================
  // CARD ACTIONS
  // ===============================

  const openCardDetail = (item: BinderCardWithDetails) => {
    const latestCard = cards.find((c) => c.id === item.id) ?? item;
    setSelectedCard(latestCard);
    setDetailVisible(true);
    fetchModalEbayPrice(latestCard);
  };

  const applyCardOwnedChange = async (
    item: BinderCardWithDetails,
    newOwned: boolean,
    grading?: { company: string; grade: string }
  ) => {
    const nextQuantity = newOwned ? getOwnedQuantity(item) : 1;
    setCards((prev) =>
      prev.map((c) => (c.id === item.id ? {
        ...c,
        owned: newOwned,
        owned_quantity: nextQuantity,
        grade_company: grading?.company ?? c.grade_company ?? null,
        grade: grading?.grade ?? c.grade ?? null,
      } : c))
    );

    if (selectedCard?.id === item.id) {
      setSelectedCard({
        ...item,
        owned: newOwned,
        owned_quantity: nextQuantity,
        grade_company: grading?.company ?? item.grade_company ?? null,
        grade: grading?.grade ?? item.grade ?? null,
      });
    }

    try {
  const latestPrice = await updateBinderCardOwned(item.id, newOwned, {
    cardName: item.card?.name ?? item.card_name ?? null,
    cardNumber: item.card?.number ?? item.card_number ?? null,
    imageUrl: item.card?.images?.small ?? item.image_url ?? null,
    setName: item.card?.set?.name ?? item.set_name ?? null,
    slotOrder: item.slot_order,
    condition: item.condition,
    gradeCompany: grading?.company ?? item.grade_company ?? null,
    grade: grading?.grade ?? item.grade ?? null,
    ownedQuantity: nextQuantity,
  });

  if (userId) {
    const { data: userBinders } = await supabase
      .from('binders')
      .select('id')
      .eq('user_id', userId);
    const userBinderIds = (userBinders ?? []).map((row) => row.id).filter(Boolean);

    if (userBinderIds.length) {
      await supabase
        .from('binder_cards')
        .update({ owned: newOwned, owned_quantity: nextQuantity })
        .in('binder_id', userBinderIds)
        .eq('card_id', item.card_id)
        .eq('set_id', item.set_id);
    }
  }

  setCards((prev) =>
    prev.map((c) => (c.card_id === item.card_id && c.set_id === item.set_id ? {
      ...c,
      owned: newOwned,
      owned_quantity: nextQuantity,
      grade_company: grading?.company ?? c.grade_company ?? null,
      grade: grading?.grade ?? c.grade ?? null,
      ebay_price: latestPrice?.ebay_price ?? c.ebay_price,
      tcg_price: latestPrice?.tcg_price ?? c.tcg_price,
      cardmarket_price: latestPrice?.cardmarket_price ?? c.cardmarket_price,
      last_price_update: latestPrice?.last_price_update ?? c.last_price_update,
    } : c))
  );
  if (selectedCard?.id === item.id) {
    setSelectedCard((prev) => prev ? {
      ...prev,
      owned: newOwned,
      owned_quantity: nextQuantity,
      grade_company: grading?.company ?? prev.grade_company ?? null,
      grade: grading?.grade ?? prev.grade ?? null,
      ebay_price: latestPrice?.ebay_price ?? prev.ebay_price,
      tcg_price: latestPrice?.tcg_price ?? prev.tcg_price,
      cardmarket_price: latestPrice?.cardmarket_price ?? prev.cardmarket_price,
      last_price_update: latestPrice?.last_price_update ?? prev.last_price_update,
    } : prev);
  }
} catch (error) {
  console.log('Rollback owned toggle', error);
  setCards((prev) =>
    prev.map((c) => (c.id === item.id ? { ...c, owned: !newOwned, owned_quantity: getOwnedQuantity(item) } : c))
  );
  Alert.alert('Error', 'Failed to update card.');
}
  };

  const handleCardPress = async (item: BinderCardWithDetails) => {
    if (isReadOnly) {
      openCardDetail(item);
      return;
    }

    const newOwned = !item.owned;

    if (binder?.card_mode === 'graded' && newOwned) {
      setGradingPromptCompany(item.grade_company ?? 'PSA');
      setGradingPromptGrade(item.grade ?? '10');
      setGradingCardToAdd(item);
      return;
    }

    await applyCardOwnedChange(item, newOwned);
  };

  const confirmGradedCardAdd = async () => {
    if (!gradingCardToAdd) return;
    const card = gradingCardToAdd;
    setGradingCardToAdd(null);
    await applyCardOwnedChange(card, true, {
      company: gradingPromptCompany,
      grade: gradingPromptGrade,
    });
  };

  const handleRemoveCustomBinderCard = async (item: BinderCardWithDetails) => {
    if (isReadOnly || binder?.type !== 'custom') return;

    Alert.alert(
      'Remove from binder?',
      `Remove ${item.card?.name ?? item.card_name ?? 'this card'} from this custom binder?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const previousCards = cards;
            const previousShowcaseRows = showcaseRows;

            try {
              setCards((prev) => prev.filter((card) => card.id !== item.id));
              setShowcaseRows((prev) =>
                prev.filter((row) => !(row.card_id === item.card_id && row.set_id === item.set_id))
              );

              const { error } = await supabase
                .from('binder_cards')
                .delete()
                .eq('id', item.id)
                .eq('binder_id', binder.id);

              if (error) throw error;

              await supabase
                .from('binder_card_showcases')
                .delete()
                .eq('binder_id', binder.id)
                .eq('card_id', item.card_id)
                .eq('set_id', item.set_id);

              if (selectedCard?.id === item.id) {
                setDetailVisible(false);
                setSelectedCard(null);
              }

              showToast('Card removed from binder');
            } catch (error) {
              console.log('Failed to remove custom binder card', error);
              setCards(previousCards);
              setShowcaseRows(previousShowcaseRows);
              Alert.alert('Could not remove card', 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleCardLongPress = (item: BinderCardWithDetails) => {
    if (isReadOnly || binder?.type !== 'custom') {
      openCardDetail(item);
      return;
    }

    Alert.alert(item.card?.name ?? item.card_name ?? 'Card options', 'What would you like to do?', [
      { text: 'View details', onPress: () => openCardDetail(item) },
      { text: 'Remove from binder', style: 'destructive', onPress: () => handleRemoveCustomBinderCard(item) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSetVariantQuantity = useCallback(async (
    cardId: string,
    setId: string,
    variant: string,
    quantity: number
  ) => {
    if (!userId || isReadOnly) return;
    const key = getVariantKey(cardId, setId, variant);
    const cardKey = getVariantCardKey(cardId, setId);
    const nextQuantity = Math.max(0, Math.min(999, Math.floor(Number(quantity) || 0)));
    const targetCard = cards.find((card) => card.card_id === cardId && card.set_id === setId);
    const cardVariants = targetCard ? getVariants(targetCard.card, setId) : [variant];
    const nextCardOwned = cardVariants.some((candidateVariant) =>
      candidateVariant === variant
        ? nextQuantity > 0
        : getVariantQuantityFromMap(ownedVariants, cardId, setId, candidateVariant) > 0
    );

    setOwnedVariants((prev) => {
      const next = new Map(prev);
      if (nextQuantity > 0) next.set(key, nextQuantity);
      else next.delete(key);
      return next;
    });
    setVariantManagedCards((prev) => {
      const next = new Set(prev);
      next.add(cardKey);
      return next;
    });
    setCards((prev) =>
      prev.map((card) =>
        card.card_id === cardId && card.set_id === setId
          ? { ...card, owned: nextCardOwned, owned_quantity: nextCardOwned ? getOwnedQuantity(card) : 1 }
          : card
      )
    );
    setSelectedCard((prev) =>
      prev && prev.card_id === cardId && prev.set_id === setId
        ? { ...prev, owned: nextCardOwned, owned_quantity: nextCardOwned ? getOwnedQuantity(prev) : 1 }
        : prev
    );

    try {
      if (nextQuantity <= 0) {
        await supabase
          .from('user_card_variants')
          .delete()
          .eq('user_id', userId)
          .eq('card_id', cardId)
          .eq('set_id', setId)
          .eq('variant', variant);
      } else {
        await supabase
          .from('user_card_variants')
          .upsert({
            user_id: userId,
            card_id: cardId,
            set_id: setId,
            variant,
            quantity: nextQuantity,
          }, { onConflict: 'user_id,card_id,set_id,variant' });
      }

      const { data: userBinders } = await supabase
        .from('binders')
        .select('id')
        .eq('user_id', userId);
      const userBinderIds = (userBinders ?? []).map((row) => row.id).filter(Boolean);
      if (userBinderIds.length) {
        await supabase
          .from('binder_cards')
          .update({ owned: nextCardOwned })
          .in('binder_id', userBinderIds)
          .eq('card_id', cardId)
          .eq('set_id', setId);
      }
    } catch (error) {
      console.log('Failed to update variant quantity', error);
      Alert.alert('Error', 'Failed to update variant quantity.');
      load();
    }
  }, [cards, isReadOnly, load, ownedVariants, userId]);

  const handleToggleVariant = useCallback(async (cardId: string, setId: string, variant: string) => {
    const savedQuantity = getVariantQuantityFromMap(ownedVariants, cardId, setId, variant);
    const targetCard = cards.find((card) => card.card_id === cardId && card.set_id === setId);
    const cardVariants = targetCard ? getVariants(targetCard.card, setId) : [variant];
    const isManaged = variantManagedCards.has(getVariantCardKey(cardId, setId));
    const defaultVariant = targetCard && !isManaged && targetCard.owned
      ? getDefaultOwnedVariant(cardVariants)
      : null;
    const currentQuantity = savedQuantity > 0
      ? savedQuantity
      : defaultVariant === variant && targetCard
        ? getOwnedQuantity(targetCard)
        : 0;
    await handleSetVariantQuantity(cardId, setId, variant, currentQuantity > 0 ? 0 : 1);
  }, [cards, handleSetVariantQuantity, ownedVariants, variantManagedCards]);

  const handleSetCondition = async (item: BinderCardWithDetails, condition: string) => {
    if (isReadOnly) return;

    setCards((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, condition } : c))
    );
    if (selectedCard?.id === item.id) {
      setSelectedCard({ ...item, condition });
    }

    try {
      await updateBinderCardCondition(item.id, condition);
    } catch (error) {
      console.log('Failed to update condition', error);
      Alert.alert('Error', 'Failed to update condition.');
      load();
    }
  };

  const handleSetOwnedQuantity = async (item: BinderCardWithDetails, quantity: number) => {
    if (isReadOnly) return;

    const nextQuantity = Math.max(1, Math.min(999, Math.floor(Number(quantity) || 1)));
    const updatedCard = { ...item, owned: true, owned_quantity: nextQuantity };

    setCards((prev) =>
      prev.map((c) => (
        c.card_id === item.card_id && c.set_id === item.set_id
          ? { ...c, owned: true, owned_quantity: nextQuantity }
          : c
      ))
    );
    if (selectedCard?.id === item.id) {
      setSelectedCard(updatedCard);
    }

    try {
      await updateBinderCardQuantity(item.id, nextQuantity, {
        cardName: item.card?.name ?? item.card_name ?? null,
        cardNumber: item.card?.number ?? item.card_number ?? null,
        imageUrl: item.card?.images?.small ?? item.image_url ?? null,
        setName: item.card?.set?.name ?? item.set_name ?? null,
        slotOrder: item.slot_order,
        condition: item.condition,
        gradeCompany: item.grade_company ?? null,
        grade: item.grade ?? null,
      });

      if (userId) {
        const { data: userBinders } = await supabase
          .from('binders')
          .select('id')
          .eq('user_id', userId);
        const userBinderIds = (userBinders ?? []).map((row) => row.id).filter(Boolean);

        if (userBinderIds.length) {
          await supabase
            .from('binder_cards')
            .update({ owned: true, owned_quantity: nextQuantity })
            .in('binder_id', userBinderIds)
            .eq('card_id', item.card_id)
            .eq('set_id', item.set_id);
        }
      }
    } catch (error) {
      console.log('Failed to update owned quantity', error);
      Alert.alert('Error', 'Failed to update quantity owned.');
      load();
    }
  };

  const handleSetGrading = async (
    item: BinderCardWithDetails,
    updates: { company?: string; grade?: string }
  ) => {
    if (isReadOnly) return;

    const nextCompany = updates.company ?? item.grade_company ?? 'PSA';
    const nextGrade = updates.grade ?? item.grade ?? '10';
    const updatedCard = { ...item, grade_company: nextCompany, grade: nextGrade };

    setCards((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, grade_company: nextCompany, grade: nextGrade } : c))
    );
    if (selectedCard?.id === item.id) {
      setSelectedCard(updatedCard);
    }

    try {
      await updateBinderCardGrading(item.id, nextCompany, nextGrade);
      fetchModalEbayPrice(updatedCard);
    } catch (error) {
      console.log('Failed to update grading', error);
      Alert.alert('Error', 'Failed to update grading details.');
      load();
    }
  };

  // ===============================
  // SEARCH (custom binder)
  // ===============================

  const searchCardsToAdd = async (query: string) => {
    const safeQuery = query.trim();
    if (safeQuery.length < 2) {
      setAddSearchResults([]);
      return;
    }

    try {
      setAddSearchLoading(true);

      const data = await searchLocalPokemonCards<any>(safeQuery, {
        limit: 150,
        select: 'id, name, set_id, image_small, image_large, raw_data',
      });

      setAddSearchResults(
        (data ?? []).map((card: any) => ({
          card_id: card.id,
          name: card.name,
          set_name: card.raw_data?.set?.name ?? card.set_id,
          image_url: card.image_small ?? card.image_large ?? null,
        }))
      );
    } catch (error) {
      console.log('Supabase search failed', error);
      setAddSearchResults([]);
    } finally {
      setAddSearchLoading(false);
    }
  };

  const handleAddCardToCustomBinder = async (card: CardPreviewResult) => {
    if (!binderId) return;

    const derivedSetId = getSetIdFromCardId(card.card_id);

    if (!derivedSetId) {
      Alert.alert('Missing set', 'Could not work out the set for this card.');
      return;
    }

    try {
      setAddingCardId(card.card_id);
      await addCardsToBinder(binderId, [{
        cardId: card.card_id,
        setId: derivedSetId,
        cardName: card.name ?? null,
        imageUrl: card.image_url ?? null,
        setName: card.set_name ?? null,
        gradeCompany: binder?.card_mode === 'graded' ? addGradeCompany : null,
        grade: binder?.card_mode === 'graded' ? addGrade : null,
      }]);
      setShowAddModal(false);
      setAddSearch('');
      setAddSearchResults([]);
      setPendingAddIds({});
      await load();
      Alert.alert('Added', `${card.name} has been added${binder?.card_mode === 'graded' ? ` as ${addGradeCompany} ${addGrade}` : ' as missing'}.`);
    } catch (error: any) {
      Alert.alert('Could not add card', error?.message ?? 'Something went wrong.');
    } finally {
      setAddingCardId(null);
    }
  };

  const handleAddMultipleToCustomBinder = async () => {
  if (!binderId || pendingAddCount === 0) return;

  const cardsToAdd = Object.values(pendingAddIds);

  if (binder?.card_mode === 'graded' && cardsToAdd.length === 1) {
    await handleAddCardToCustomBinder(cardsToAdd[0]);
    return;
  }

  if (binder?.card_mode === 'graded') {
    Alert.alert('Choose one slab', 'Graded binders add one card at a time so you can choose the grading company and grade.');
    return;
  }

  try {
    setAddingCardId('bulk');

    const validCards = cardsToAdd
  .map((card) => ({
    cardId: card.card_id,
    setId: getSetIdFromCardId(card.card_id),
    cardName: card.name ?? null,
    imageUrl: card.image_url ?? null,
    setName: card.set_name ?? null,
  }))
  .filter((c) => c.setId);

    await addCardsToBinder(binderId, validCards);
    setPendingAddIds({});
    setAddSearch('');
    setAddSearchResults([]);
    setShowAddModal(false);
    await load();
    showToast(`${validCards.length} card${validCards.length !== 1 ? 's' : ''} added to binder.`);
  } catch (error: any) {
    Alert.alert('Could not add cards', error?.message ?? 'Something went wrong.');
  } finally {
    setAddingCardId(null);
  }
};

  // ===============================
  // SCAN
  // ===============================

  const handleScanCard = async () => {
    if (!binder?.id) return;
    router.push({ pathname: '/scan', params: { binderId: binder.id } });
  };

  // ===============================
  // GESTURE HANDLERS
  // ===============================

  const modalPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) modalTranslateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 140 || gesture.vy > 1.2) {
          closeDetailModal();
        } else {
          Animated.spring(modalTranslateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true }
  );

  const onPinchHandlerStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current *= event.nativeEvent.scale;
      lastScale.current = Math.max(1, Math.min(lastScale.current, 3));
      baseScale.setValue(lastScale.current);
      pinchScale.setValue(1);
    }
  };

  // ===============================
  // RENDER HELPERS
  // ===============================

  const renderToploaderCard = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<BinderCardWithDetails>) => {
    const imageUri = item.card?.images?.small ?? item.card?.images?.large ?? null;
    const imageEditionHint = getBinderEditionHint(binder?.edition);
    const isGradedBinder = binder?.card_mode === 'graded';
    const ownedQuantity = getOwnedQuantity(item);

    return (
      <TouchableOpacity
        onPress={() => openCardDetail(item)}
        onLongPress={isReadOnly ? undefined : drag}
        activeOpacity={0.9}
        style={{ width: 120, marginRight: 14, opacity: isActive ? 0.75 : 1 }}
      >
        <View style={{
          padding: 5,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: item.owned ? theme.colors.secondary : theme.colors.border,
          backgroundColor: theme.colors.card,
          ...cardShadow,
        }}>
          {isGradedBinder ? (
            <View style={{ width: '100%', aspectRatio: 0.68 }}>
              <GradedSlabCard
                item={item}
                imageUri={imageUri}
                editionHint={imageEditionHint}
                size="showcase"
                opacity={item.owned ? 1 : 0.35}
              />
            </View>
          ) : imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ width: '100%', aspectRatio: 0.72, borderRadius: 7, opacity: item.owned ? 1 : 0.35 }}
              resizeMode="cover"
            />
          ) : (
            <View style={{
              width: '100%',
              aspectRatio: 0.72,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
            }}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 10 }}>No image</Text>
            </View>
          )}

          {!isGradedBinder && (
            <View style={{
            position: 'absolute',
            left: 7, right: 7, top: 7, bottom: 7,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.7)',
          }} />
          )}

          {item.owned && ownedQuantity > 1 && (
            <View style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              minWidth: 28,
              height: 24,
              borderRadius: 12,
              paddingHorizontal: 7,
              backgroundColor: theme.colors.primary,
              borderWidth: 2,
              borderColor: theme.colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>
                x{ownedQuantity}
              </Text>
            </View>
          )}
        </View>

        <Text numberOfLines={1} style={{
          color: theme.colors.text,
          fontSize: 11,
          fontWeight: '900',
          textAlign: 'center',
          marginTop: 7,
        }}>
          {item.card?.name ?? item.card_id}
        </Text>

        {!isReadOnly && (
          <Text numberOfLines={1} style={{
            color: theme.colors.textSoft,
            fontSize: 9,
            textAlign: 'center',
            marginTop: 2,
          }}>
            Hold to drag
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderShowcaseStrip = (type: ShowcaseType, title: string) => {
  const data = getShowcaseItems(type);
  if (!data.length) return null;

  const collapsed = showcaseCollapsed[type];
  const isChase = type === 'chase';
  const accent = type === 'favorite' ? theme.colors.secondary : '#E85D8A';
  const panelStyle = isChase
    ? {
        backgroundColor: theme.dark ? 'rgba(232,93,138,0.08)' : '#FFF9F1',
        borderColor: theme.dark ? 'rgba(232,93,138,0.35)' : '#F8DCA6',
        borderWidth: 1,
        borderRadius: 22,
        padding: 14,
        overflow: 'hidden' as const,
        ...cardShadow,
      }
    : {};

  return (
    <View style={{ marginBottom: 24, zIndex: 0, ...panelStyle }}>
      {isChase && (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', right: 18, top: 74, opacity: theme.dark ? 0.1 : 0.35 }}>
            <Ionicons name="sparkles" size={58} color="#F3C6DC" />
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', right: -16, bottom: -14, opacity: theme.dark ? 0.08 : 0.28 }}>
            <Ionicons name="ellipse" size={92} color="#E9D8FD" />
          </View>
        </>
      )}
      <TouchableOpacity
        onPress={() =>
          setShowcaseCollapsed((prev) => ({ ...prev, [type]: !prev[type] }))
        }
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: collapsed ? 0 : 10,
        }}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {isChase && <Ionicons name="sparkles" size={18} color={accent} />}
          <Text style={{
            color: accent,
            fontSize: isChase ? 20 : 18,
            fontWeight: '900',
          }}>
            {title}
          </Text>
        </View>

        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}>
          <Text style={{
            color: accent,
            fontSize: 12,
            fontWeight: '900',
          }}>
            {data.length} card{data.length !== 1 ? 's' : ''}
          </Text>
          <Ionicons
            name={collapsed ? 'chevron-forward' : 'chevron-down'}
            size={18}
            color={accent}
          />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <DraggableFlatList
          data={data}
          horizontal
          keyExtractor={(item) => `${type}-${item.set_id}-${item.card_id}`}
          renderItem={renderToploaderCard}
          onDragEnd={({ data: newData }) => !isReadOnly && reorderShowcase(type, newData)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={isChase ? { paddingTop: 4, paddingBottom: 2, paddingRight: 10 } : undefined}
        />
      )}
    </View>
  );
};

  const renderCard = ({ item }: { item: BinderCardWithDetails }) => {
    const imageUri = item.card?.images?.small ?? item.card?.images?.large ?? null;
    const imageEditionHint = getBinderEditionHint(binder?.edition);
    const cardName = item.card?.name ?? item.card_id;
    const forTrade = isForTrade(item.card_id, item.set_id);
    const wanted = isWanted(item.card_id, item.set_id);
    const isGradedBinder = binder?.card_mode === 'graded';

    const variants = masterSetEnabled ? getVariants(item.card, item.set_id) : ['card'];
    const multiVariant = variants.length > 1;
    const anyVariantOwned = variants.some((v) => getDisplayedVariantQuantity(item, v) > 0);
    const displayedOwnedQuantity = getDisplayedOwnedQuantity(item);
    const isOwned = multiVariant ? anyVariantOwned || displayedOwnedQuantity > 0 : item.owned;

    const Container = multiVariant ? View : TouchableOpacity;

    return (
      <Container
        onPress={multiVariant ? undefined : () => handleCardPress(item)}
        onLongPress={() => handleCardLongPress(item)}
        delayLongPress={300}
        activeOpacity={0.85}
        style={{
          width: cardWidth,
          marginBottom: 8,
          borderRadius: 14,
          padding: 6,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          ...cardShadow,
        }}
      >
        <View style={{
          width: '100%',
          aspectRatio: isGradedBinder ? 0.68 : 0.72,
          borderRadius: 10,
          backgroundColor: theme.colors.surface,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: multiVariant ? 1 : isOwned ? 1 : 0.36,
        }}>
          {isGradedBinder ? (
            <GradedSlabCard
              item={item}
              imageUri={imageUri}
              editionHint={imageEditionHint}
              size="grid"
            />
          ) : imageUri ? (
            <EditionAwareCardImage
              uri={imageUri}
              cardId={item.card_id}
              rawData={item.card}
              editionHint={imageEditionHint}
              sourceSize="small"
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ color: theme.colors.textSoft, fontSize: 10 }}>No image</Text>
          )}

          {multiVariant && (
            <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
              {variants.map((variant, i) => {
                const variantQuantity = getDisplayedVariantQuantity(item, variant);
                const owned = variantQuantity > 0;
                return (
                  <Pressable
                    key={variant}
                    onPress={() =>
                      isReadOnly
                        ? openCardDetail(item)
                        : handleToggleVariant(item.card_id, item.set_id, variant)
                    }
                    onLongPress={() => handleCardLongPress(item)}
                    delayLongPress={400}
                    style={({ pressed }) => ({
                      flex: 1,
                      opacity: owned ? 1 : 0.36,
                      backgroundColor: pressed
                        ? 'rgba(108,75,255,0.25)'
                        : owned
                          ? 'transparent'
                          : 'rgba(255,255,255,0.58)',
                      borderLeftWidth: i > 0 ? 1 : 0,
                      borderColor: 'rgba(255,255,255,0.3)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    <View style={{
                      position: 'absolute',
                      bottom: 5,
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: owned ? theme.colors.primary : theme.colors.card,
                      borderWidth: 2,
                      borderColor: theme.colors.card,
                    }}>
                      {owned && variantQuantity > 1 ? (
                        <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
                          x{variantQuantity}
                        </Text>
                      ) : owned ? (
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      ) : (
                        <MasterVariantIcon variant={variant} size="tiny" active={false} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {!multiVariant && (
            <View style={{
              position: 'absolute',
              right: 7,
              ...(isGradedBinder ? { bottom: 7 } : { top: 7 }),
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: isOwned ? theme.colors.primary : theme.colors.card,
              borderWidth: 2,
              borderColor: theme.colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons
                name={isOwned ? 'checkmark' : 'add'}
                size={14}
                color={isOwned ? '#FFFFFF' : theme.colors.primary}
              />
            </View>
          )}

          {isOwned && displayedOwnedQuantity > 1 && (
            <View style={{
              position: 'absolute',
              left: 7,
              top: 7,
              minWidth: 28,
              height: 24,
              borderRadius: 12,
              paddingHorizontal: 7,
              backgroundColor: theme.colors.primary,
              borderWidth: 2,
              borderColor: theme.colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>
                x{displayedOwnedQuantity}
              </Text>
            </View>
          )}
        </View>

        <Text numberOfLines={2} style={{
          color: theme.colors.text,
          fontSize: 11,
          fontWeight: '900',
          marginTop: 6,
          minHeight: 28,
          opacity: multiVariant ? anyVariantOwned ? 1 : 0.48 : isOwned ? 1 : 0.48,
        }}>
          {cardName}
        </Text>

        {item.owned && binder?.card_mode === 'graded' && (
          <Text style={{
            color: '#3730A3',
            fontSize: 9,
            fontWeight: '900',
            marginTop: 2,
          }}>
            {[item.grade_company ?? 'PSA', item.grade ?? '10'].filter(Boolean).join(' ')}
          </Text>
        )}

        {item.owned && binder?.card_mode !== 'graded' && item.condition && item.condition !== 'Near Mint' && (
          <Text style={{
            color: theme.colors.textSoft,
            fontSize: 9,
            fontWeight: '700',
            marginTop: 2,
          }}>
            {item.condition}
          </Text>
        )}

        {!isReadOnly && (forTrade || wanted) && (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 5 }}>
            {forTrade && (
              <Text style={{ color: '#16A34A', fontSize: 10, fontWeight: '900' }}>Trade</Text>
            )}
            {wanted && (
              <Text style={{ color: theme.colors.secondary, fontSize: 10, fontWeight: '900' }}>Want</Text>
            )}
          </View>
        )}
      </Container>
    );
  };

  // ===============================
  // LOADING / NOT FOUND
  // ===============================

  useEffect(() => {
    let mounted = true;

    const loadModalTcgFallback = async () => {
      if (!selectedCard) {
        setModalTcgFallbackPrice(null);
        return;
      }

      const prices = selectedCard.card?.tcgplayer?.prices;
      if (prices && Object.keys(prices).length > 0) {
        setModalTcgFallbackPrice(null);
        return;
      }

      const setName = (selectedCard.card?.set?.name ?? selectedCard.set_name ?? '').trim();
      const cardName = (selectedCard.card?.name ?? selectedCard.card_name ?? '').trim();
      const cardNumberRaw = (selectedCard.card?.number ?? selectedCard.card_number ?? '').trim();

      if (!setName || !cardName) {
        setModalTcgFallbackPrice(null);
        return;
      }

      try {
        const rows = await fetchTcgcsvUiCardPricesForSet(setName);
        if (!mounted) return;

        const normalizeNumber = (value: string) =>
          value.trim().replace(/^#/, '').replace(/\s+/g, '').toLowerCase();

        const normalizeName = (value: string) =>
          value
            .toLowerCase()
            .replace(/\bex\b/g, ' ex ')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();

        const parseCollectorNumber = (value: string): string => {
          const normalized = normalizeNumber(value);
          if (!normalized) return '';
          const left = normalized.split('/')[0] ?? normalized;
          return left.replace(/^0+/, '') || '0';
        };

        const cardNumberNormalized = normalizeNumber(cardNumberRaw);
        const cardCollector = parseCollectorNumber(cardNumberRaw);
        const cardNameNormalized = normalizeName(cardName);

        const matched =
          rows.find((row) => normalizeNumber(row.number ?? '') === cardNumberNormalized) ??
          rows.find((row) => parseCollectorNumber(row.number ?? '') === cardCollector && cardCollector !== '') ??
          rows.find((row) => normalizeName(row.name).includes(cardNameNormalized) && cardNameNormalized.length > 2) ??
          rows.find((row) => row.name.trim().toLowerCase() === cardName.toLowerCase()) ??
          null;

        if (!matched) {
          setModalTcgFallbackPrice(null);
          return;
        }

        const values = matched.variants
          .flatMap((v) => [v.lowPrice, v.midPrice, v.marketPrice])
          .filter((v): v is number => typeof v === 'number');

        const lowUsd = values.length ? Math.min(...values) : null;
        const midValues = matched.variants
          .map((v) => v.midPrice)
          .filter((v): v is number => typeof v === 'number');
        const marketValues = matched.variants
          .map((v) => v.marketPrice)
          .filter((v): v is number => typeof v === 'number');

        const avg = (arr: number[]) =>
          arr.length ? arr.reduce((sum, n) => sum + n, 0) / arr.length : null;
        const toGbp = (v: number | null) =>
          typeof v === 'number' ? Math.round(v * USD_TO_GBP * 100) / 100 : null;

        setModalTcgFallbackPrice({
          low: toGbp(lowUsd),
          mid: toGbp(avg(midValues)),
          market: toGbp(avg(marketValues)),
        });
      } catch {
        if (mounted) setModalTcgFallbackPrice(null);
      }
    };

    loadModalTcgFallback();

    return () => {
      mounted = false;
    };
  }, [selectedCard]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>Loading binder...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!binder) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
            Binder not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const modalCard = selectedCard?.card;
  const modalForTrade = selectedCard ? isForTrade(selectedCard.card_id, selectedCard.set_id) : false;
  const modalWanted = selectedCard ? isWanted(selectedCard.card_id, selectedCard.set_id) : false;

  const boxStyle = {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow,
  };

  const boxTitleStyle = {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900' as const,
    marginBottom: 10,
  };

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen
        options={{
          headerTitle: '',
          headerRight: () => (
            <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900', maxWidth: width * 0.68, textAlign: 'right' }}>
              {binder.name}
            </Text>
          ),
        }}
      />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 0 }}>

        {/* Header */}
        <View style={{ marginBottom: 8 }}>
          {!isReadOnly && (
            <TouchableOpacity
              onPress={handleScanCard}
              style={{
                position: 'absolute',
                left: 0,
                top: 8,
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.primary,
                zIndex: 5,
              }}
            >
              <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              {!isReadOnly && (
                <View style={{ flex: 0.28 }} />
              )}

              <View style={{ flex: 1, alignItems: 'flex-end', paddingTop: 0 }}>
                {!isReadOnly && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                        Master set
                      </Text>
                      <TouchableOpacity
                        onPress={() => setMasterSetIntroVisible(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}
                      >
                        <Ionicons name="information-circle-outline" size={15} color={theme.colors.textSoft} />
                      </TouchableOpacity>
                      <Switch
                        value={masterSetEnabled}
                        onValueChange={toggleMasterSet}
                        disabled={updatingMasterSet}
                        style={{ transform: [{ scaleX: 0.68 }, { scaleY: 0.68 }] }}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                        {isPublic ? 'Public' : 'Private'}
                      </Text>
                      <Switch
                        value={isPublic}
                        onValueChange={togglePublic}
                        disabled={updatingVisibility}
                        style={{ transform: [{ scaleX: 0.68 }, { scaleY: 0.68 }] }}
                      />
                    </View>
                  </View>
                )}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800' }}>
                {ownedCount} / {totalCount} owned · {progressPercent}%
              </Text>

              <View style={{
                backgroundColor: theme.colors.primary + '16',
                borderRadius: 999,
                paddingHorizontal: 9,
                paddingVertical: 3,
                borderWidth: 1,
                borderColor: theme.colors.primary + '35',
              }}>
                <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>
                  {formatCurrency(binderValue)}
                </Text>
              </View>

              {binder.card_mode === 'graded' && (
                <View style={{
                  backgroundColor: '#EEF2FF',
                  borderRadius: 999,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                  borderWidth: 1,
                  borderColor: '#A5B4FC',
                }}>
                  <Text style={{ color: '#3730A3', fontSize: 11, fontWeight: '900' }}>
                    Graded slabs
                  </Text>
                </View>
              )}

              {binder.edition && (
                <View style={{
                  backgroundColor: binder.edition === '1st_edition' ? '#F59E0B' : theme.colors.surface,
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderWidth: 1,
                  borderColor: binder.edition === '1st_edition' ? '#F59E0B' : theme.colors.border,
                }}>
                  <Text style={{
                    color: binder.edition === '1st_edition' ? '#FFFFFF' : theme.colors.textSoft,
                    fontSize: 10,
                    fontWeight: '900',
                  }}>
                    {binder.edition === '1st_edition' ? '1st Edition' : 'Unlimited'}
                  </Text>
                </View>
              )}
            </View>

          </View>

        {/* Progress bar */}
        <View style={{
          height: 6,
          borderRadius: 999,
          backgroundColor: theme.colors.surface,
          overflow: 'hidden',
          marginBottom: 10,
        }}>
          <View style={{
            width: totalCount ? `${(ownedCount / totalCount) * 100}%` : '0%',
            height: '100%',
            backgroundColor: binder.color || theme.colors.primary,
            borderRadius: 999,
          }} />
        </View>

        {/* Read only banner */}
        <View>
          {isReadOnly && (
          <View style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 14,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
            <Text style={{ fontSize: 16 }}>ðŸ‘ï¸</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700' }}>
              Viewing another collector&apos;s binder â€” read only
            </Text>
          </View>
          )}
        </View>

        {/* Showcase strips */}
        <View>
          {renderShowcaseStrip('favorite', 'Favourite Top Loaders')}
          {renderShowcaseStrip('chase', 'Chase Cards')}
        </View>

        {/* Add card button */}
        <View>
          {binder.type === 'custom' && !isReadOnly && (
            <TouchableOpacity
              onPress={() => setShowAddModal(true)}
              style={{
                backgroundColor: theme.colors.primary,
                borderRadius: 14,
                paddingVertical: 13,
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>+ Add Card to Binder</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Sort dropdown */}
        <View>
          <View style={{ marginBottom: 14, zIndex: 20 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '900', marginBottom: 6 }}>
              Sort:
            </Text>

            <TouchableOpacity
              onPress={() => setSortDropdownOpen((prev) => !prev)}
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 14,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{currentSortLabel}</Text>
              <Ionicons
                name={sortDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.colors.textSoft}
              />
            </TouchableOpacity>

            {sortDropdownOpen && (
              <View style={{
                marginTop: 8,
                backgroundColor: theme.colors.card,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: 'hidden',
              }}>
                {sortOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => { setSortMode(option.value); setSortDropdownOpen(false); }}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      backgroundColor: sortMode === option.value ? theme.colors.secondary : theme.colors.card,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Card grid */}
        <FlatList
          data={sortedCards}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          key={numColumns}
          numColumns={numColumns}
          columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
          initialNumToRender={numColumns * 4}
          maxToRenderPerBatch={numColumns * 3}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
        />
      </View>

      {/* MASTER SET INTRO MODAL */}
      <Modal
        visible={masterSetIntroVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMasterSetIntroVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(28,32,52,0.42)', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
          <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
          <View style={{
            width: Math.min(width - 54, 354),
            maxHeight: screenHeight - 96,
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            paddingHorizontal: 18,
            paddingTop: 16,
            paddingBottom: 18,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 12 },
            elevation: 12,
          }}>
            <TouchableOpacity
              onPress={() => setMasterSetIntroVisible(false)}
              style={{
                position: 'absolute',
                right: 10,
                top: 10,
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: '#F0EEF8',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
              }}
            >
              <Ionicons name="close" size={19} color="#0B1746" />
            </TouchableOpacity>

            <View style={{ alignItems: 'center', marginBottom: 2 }}>
              <Ionicons name="sparkles" size={25} color="#FFAA4C" />
            </View>

            <Text style={{ color: '#061547', fontSize: 23, lineHeight: 27, fontWeight: '900', textAlign: 'center' }}>
              Welcome Completionist
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
              <Ionicons name="sparkles" size={12} color="#6D3DFF" />
              <Text style={{ color: '#6D3DFF', fontSize: 18, fontWeight: '900' }}>Track Variants</Text>
              <Ionicons name="sparkles" size={12} color="#6D3DFF" />
            </View>

            <Text style={{ color: '#59617F', fontSize: 13, lineHeight: 17, textAlign: 'center', marginTop: 6, maxWidth: 275 }}>
              Tap the card by thirds to mark the version you own.
            </Text>
            <Text style={{ color: '#59617F', fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 1, maxWidth: 285 }}>
              Left = Base, Middle = Holo, Right = Reverse Holo.
            </Text>

            <View style={{
              width: Math.min(width - 152, 178),
              aspectRatio: 0.72,
              marginTop: 10,
              borderRadius: 15,
              padding: 5,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#D8C9FF',
              shadowColor: '#6D3DFF',
              shadowOpacity: 0.14,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 6 },
              elevation: 5,
            }}>
              <LinearGradient
                colors={['#DCD6FF', '#9189EF', '#C9B6FF', '#FFE6A8', '#B7F2FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1, borderRadius: 11, overflow: 'hidden' }}
              >
                <View style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.86)' }} />
                <View style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.86)' }} />
                <View style={{ position: 'absolute', left: '30%', right: '30%', top: '35%', aspectRatio: 1, borderRadius: 999, borderWidth: 9, borderColor: 'rgba(94,78,180,0.72)' }} />
                <View style={{ position: 'absolute', left: '18%', right: '18%', top: '47%', height: 3, backgroundColor: 'rgba(94,78,180,0.72)' }} />
                <Ionicons name="sparkles" size={22} color="#FFFFFF" style={{ position: 'absolute', top: '12%', alignSelf: 'center' }} />
                <View style={{ position: 'absolute', left: 9, right: 9, bottom: 13, flexDirection: 'row', justifyContent: 'space-between' }}>
                  {['normal', 'holofoil', 'reverseHolofoil'].map((variant, index) => (
                    <View key={variant} style={{ alignItems: 'center' }}>
                      <View style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        borderWidth: index === 2 ? 3 : 2,
                        borderColor: index === 2 ? '#FFC83D' : '#FFFFFF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: index === 2 ? 'rgba(255,200,61,0.34)' : 'rgba(255,255,255,0.14)',
                      }}>
                        <Ionicons name="finger-print" size={16} color={index === 2 ? '#FFE89A' : '#FFFFFF'} />
                      </View>
                      <MasterVariantIcon variant={variant} size="tiny" active />
                    </View>
                  ))}
                </View>
              </LinearGradient>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {['normal', 'holofoil', 'reverseHolofoil'].map((variant) => {
                const copy = MASTER_VARIANT_COPY[getMasterVariantKind(variant)];
                return (
                  <View key={variant} style={{ alignItems: 'center', width: 72 }}>
                    <MasterVariantIcon variant={variant} size="medium" active />
                    <Text style={{ color: '#061547', fontSize: 11, fontWeight: '900', marginTop: 4, textAlign: 'center' }}>{copy.label}</Text>
                    <Text style={{ color: '#68708D', fontSize: 9, fontWeight: '700', marginTop: 1, textAlign: 'center' }}>{copy.helper}</Text>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setMasterSetIntroVisible(false)}
              style={{
                marginTop: 14,
                width: '100%',
                backgroundColor: '#5D2DD3',
                borderRadius: 10,
                paddingVertical: 11,
                alignItems: 'center',
                shadowColor: '#5D2DD3',
                shadowOpacity: 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                elevation: 4,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ADD CARD MODAL */}
{!isReadOnly && (
  <Modal visible={showAddModal} animationType="slide">
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ padding: 16, flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>
            Add Cards
          </Text>
          <TouchableOpacity
            onPress={() => {
              setShowAddModal(false);
              setPendingAddIds({});
              setAddSearch('');
              setAddSearchResults([]);
            }}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Close</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          placeholder="Search by card name..."
          placeholderTextColor={theme.colors.textSoft}
          value={addSearch}
          onChangeText={setAddSearch}
          style={{
            backgroundColor: theme.colors.card,
            color: theme.colors.text,
            borderRadius: 14,
            padding: 14,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        />

        {binder?.card_mode === 'graded' && (
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 14,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginBottom: 12,
          }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 8 }}>
              Choose grading company and grade
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginBottom: 8 }}>
              This applies to the card you add next.
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 7 }}>
              Company
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {GRADING_COMPANIES.map((company) => {
                const active = addGradeCompany === company;
                return (
                  <TouchableOpacity
                    key={company}
                    onPress={() => setAddGradeCompany(company)}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                      borderWidth: 1,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{company}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 7 }}>
              Grade
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {GRADES.map((grade) => {
                const active = addGrade === grade;
                return (
                  <TouchableOpacity
                    key={grade}
                    onPress={() => setAddGrade(grade)}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                      borderWidth: 1,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{grade}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Select all / count row */}
        {addSearchResults.length > 0 && !addSearchLoading && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            {binder?.card_mode !== 'graded' ? (
              <TouchableOpacity
              onPress={() => {
                const allEligible = addSearchResults.filter((r) => {
                  const setId = getSetIdFromCardId(r.card_id);
                  return !cards.some((c) => c.card_id === r.card_id && c.set_id === setId);
                });
                const allSelected = allEligible.every((r) => pendingAddIds[r.card_id]);
                if (allSelected) {
                  setPendingAddIds({});
                } else {
                  const next: Record<string, CardPreviewResult> = {};
                  allEligible.forEach((r) => { next[r.card_id] = r; });
                  setPendingAddIds(next);
                }
              }}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>
                {addSearchResults
                  .filter((r) => {
                    const setId = getSetIdFromCardId(r.card_id);
                    return !cards.some((c) => c.card_id === r.card_id && c.set_id === setId);
                  })
                  .every((r) => pendingAddIds[r.card_id])
                  ? 'Deselect All'
                  : 'Select All'}
              </Text>
            </TouchableOpacity>
            ) : (
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                Select one card, then add it as {addGradeCompany} {addGrade}
              </Text>
            )}

            {pendingAddCount > 0 && (
              <TouchableOpacity
                onPress={handleAddMultipleToCustomBinder}
                disabled={addingCardId === 'bulk'}
                style={{
                  backgroundColor: theme.colors.primary,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  opacity: addingCardId === 'bulk' ? 0.6 : 1,
                }}
              >
                {addingCardId === 'bulk' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>
                    {binder?.card_mode === 'graded'
                      ? `Add ${addGradeCompany} ${addGrade}`
                      : `Add ${pendingAddCount} to Binder`}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {addSearchLoading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <FlatList
            data={addSearchResults}
            keyExtractor={(item) => `${getSetIdFromCardId(item.card_id)}-${item.card_id}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const derivedSetId = getSetIdFromCardId(item.card_id);
              const alreadyInBinder = cards.some(
                (c) => c.card_id === item.card_id && c.set_id === derivedSetId
              );
              const isPending = Boolean(pendingAddIds[item.card_id]);

              return (
                <TouchableOpacity
                  onPress={() => {
                    if (alreadyInBinder) {
                      Alert.alert('Already added', 'This card is already in this binder.');
                      return;
                    }
                    setPendingAddIds((prev) => {
                      if (binder?.card_mode === 'graded') {
                        return { [item.card_id]: item };
                      }
                      const next = { ...prev };
                      if (next[item.card_id]) {
                        delete next[item.card_id];
                      } else {
                        next[item.card_id] = item;
                      }
                      return next;
                    });
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isPending ? theme.colors.primary + '18' : theme.colors.card,
                    borderRadius: 14,
                    padding: 10,
                    marginBottom: 10,
                    opacity: alreadyInBinder ? 0.35 : 1,
                    borderWidth: 1,
                    borderColor: isPending ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  {item.image_url ? (
                    <Image
                      source={{ uri: item.image_url }}
                      style={{ width: 50, height: 70, borderRadius: 6, backgroundColor: theme.colors.surface }}
                    />
                  ) : (
                    <View style={{ width: 50, height: 70, borderRadius: 6, backgroundColor: theme.colors.surface }} />
                  )}

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900' }}>
                      {item.name}
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>
                      {item.set_name ?? derivedSetId}
                    </Text>
                  </View>

                  <View style={{
                    width: 26, height: 26,
                    borderRadius: 999,
                    backgroundColor: alreadyInBinder
                      ? theme.colors.secondary
                      : isPending
                        ? theme.colors.primary
                        : theme.colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: alreadyInBinder
                      ? theme.colors.secondary
                      : isPending
                        ? theme.colors.primary
                        : theme.colors.border,
                    marginLeft: 8,
                  }}>
                    {(alreadyInBinder || isPending) && (
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  </Modal>
)}

      {/* GRADED CARD PROMPT */}
      {!isReadOnly && (
        <Modal
          visible={Boolean(gradingCardToAdd)}
          transparent
          animationType="fade"
          onRequestClose={() => setGradingCardToAdd(null)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(27,42,75,0.35)', justifyContent: 'center', padding: 18 }}>
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: 18,
              padding: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              ...cardShadow,
            }}>
              <Text style={{ color: theme.colors.text, fontSize: 19, fontWeight: '900', marginBottom: 4 }}>
                Add graded card
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginBottom: 14 }}>
                Choose the grading company and grade for this card.
              </Text>

              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 8 }}>
                Company
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {GRADING_COMPANIES.map((company) => {
                  const active = gradingPromptCompany === company;
                  return (
                    <TouchableOpacity
                      key={company}
                      onPress={() => setGradingPromptCompany(company)}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                        borderWidth: 1,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{company}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 8 }}>
                Grade
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {GRADES.map((grade) => {
                  const active = gradingPromptGrade === grade;
                  return (
                    <TouchableOpacity
                      key={grade}
                      onPress={() => setGradingPromptGrade(grade)}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                        borderWidth: 1,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{grade}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setGradingCardToAdd(null)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmGradedCardAdd}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    backgroundColor: theme.colors.primary,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Add {gradingPromptCompany} {gradingPromptGrade}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* CARD DETAIL MODAL */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDetailModal}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(27,42,75,0.35)' }}>
          <BlurView intensity={45} tint="light" style={{ flex: 1 }}>
            <Pressable onPress={closeDetailModal} style={{ position: 'absolute', inset: 0 }} />

            <Animated.View
              {...modalPanResponder.panHandlers}
              style={{ flex: 1, transform: [{ translateY: modalTranslateY }] }}
            >
              <SafeAreaView style={{ flex: 1 }}>
                <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 4 }}>
                  <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: 'rgba(27,42,75,0.35)' }} />
                </View>

                <TouchableOpacity
                  onPress={closeDetailModal}
                  style={{
                    position: 'absolute',
                    top: 48, right: 16,
                    zIndex: 50,
                    backgroundColor: theme.colors.card,
                    borderRadius: 999,
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Close</Text>
                </TouchableOpacity>

                {selectedCard && (
                  <ScrollView
                    contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={{
                      width: '100%',
                      aspectRatio: binder.card_mode === 'graded' ? 0.68 : 0.72,
                      maxHeight: screenHeight * 0.62,
                      alignSelf: 'center',
                      borderRadius: 20,
                      overflow: 'hidden',
                    }}>
                      <PinchGestureHandler
                        onGestureEvent={onPinchGestureEvent}
                        onHandlerStateChange={onPinchHandlerStateChange}
                      >
                        <Animated.View style={{ flex: 1, transform: [{ scale: imageScale }] }}>
                          {binder.card_mode === 'graded' ? (
                            <GradedSlabCard
                              item={selectedCard}
                              imageUri={modalCard?.images?.large ?? modalCard?.images?.small ?? null}
                              editionHint={getBinderEditionHint(binder.edition)}
                              size="modal"
                            />
                          ) : (
                            <EditionAwareCardImage
                              uri={modalCard?.images?.large ?? modalCard?.images?.small ?? undefined}
                              cardId={selectedCard.card_id}
                              rawData={modalCard}
                              editionHint={getBinderEditionHint(binder.edition)}
                              sourceSize="large"
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="contain"
                            />
                          )}

                          {/* Variant slices in Modal */}
                          {binder.card_mode !== 'graded' && !isReadOnly && masterSetEnabled && (() => {
                            const modalVariants = getVariants(selectedCard.card, selectedCard.set_id);
                            if (modalVariants.length <= 1) return null;
                            return (
                              <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]} pointerEvents="box-none">
                                {modalVariants.map((variant, i) => {
                                  const variantQuantity = getDisplayedVariantQuantity(selectedCard, variant);
                                  const owned = variantQuantity > 0;
                                  return (
                                    <Pressable
                                      key={variant}
                                      onPress={() => handleToggleVariant(selectedCard.card_id, selectedCard.set_id, variant)}
                                      style={({ pressed }) => ({
                                        flex: 1,
                                        backgroundColor: pressed
                                          ? 'rgba(108,75,255,0.25)'
                                          : 'transparent',
                                        borderLeftWidth: i > 0 ? 1 : 0,
                                        borderColor: 'rgba(255,255,255,0.2)',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      })}
                                    >
                                      <View style={{
                                        position: 'absolute',
                                        bottom: 12,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 34,
                                        height: 34,
                                        borderRadius: 17,
                                        backgroundColor: owned ? theme.colors.primary : theme.colors.card,
                                        borderWidth: 2,
                                        borderColor: theme.colors.card,
                                      }}>
                                        {owned && variantQuantity > 1 ? (
                                          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900' }}>
                                            x{variantQuantity}
                                          </Text>
                                        ) : owned ? (
                                          <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                                        ) : (
                                          <MasterVariantIcon variant={variant} size="medium" active={false} />
                                        )}
                                      </View>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            );
                          })()}
                        </Animated.View>
                      </PinchGestureHandler>

                      {getDisplayedOwnedQuantity(selectedCard) > 1 && (
                        <View
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            left: 14,
                            bottom: 14,
                            minWidth: 42,
                            height: 34,
                            borderRadius: 17,
                            paddingHorizontal: 11,
                            backgroundColor: theme.colors.primary,
                            borderWidth: 2,
                            borderColor: theme.colors.card,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>
                            x{getDisplayedOwnedQuantity(selectedCard)}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '900', marginTop: 18 }}>
                      {modalCard?.name ?? selectedCard.card_id}
                    </Text>

                    <Text style={{ color: theme.colors.textSoft, marginTop: 6 }}>
                      {modalCard?.set?.name ?? selectedCard.set_id}
                      {modalCard?.number ? ` · #${modalCard.number}` : ''}
                    </Text>

                    {binder.edition && (
                      <View style={{
                        alignSelf: 'flex-start',
                        marginTop: 6,
                        backgroundColor: binder.edition === '1st_edition' ? '#F59E0B' : theme.colors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                        borderWidth: 1,
                        borderColor: binder.edition === '1st_edition' ? '#F59E0B' : theme.colors.border,
                      }}>
                        <Text style={{
                          color: binder.edition === '1st_edition' ? '#FFFFFF' : theme.colors.textSoft,
                          fontSize: 11,
                          fontWeight: '900',
                        }}>
                          {binder.edition === '1st_edition' ? '1st Edition' : 'Unlimited'}
                        </Text>
                      </View>
                    )}

                    {/* Market Value */}
                    <View style={boxStyle}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={boxTitleStyle}>Market Value</Text>
                        {binder.card_mode !== 'graded' && (
                          <TouchableOpacity
                            onPress={() => selectedCard && fetchModalEbayPrice(selectedCard)}
                            disabled={modalEbayLoading}
                            style={{
                              backgroundColor: theme.colors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                            }}
                          >
                            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700' }}>
                              {modalEbayLoading ? 'Fetching...' : 'Refresh'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {binder.card_mode === 'graded' ? (
                        <View style={{ marginBottom: 16 }}>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                            Slab Details
                          </Text>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 7 }}>
                            Company
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                            {GRADING_COMPANIES.map((company) => {
                              const active = (selectedCard.grade_company ?? 'PSA') === company;
                              return (
                                <TouchableOpacity
                                  key={company}
                                  onPress={() => handleSetGrading(selectedCard, { company })}
                                  disabled={isReadOnly}
                                  style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 10,
                                    backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                                    borderWidth: 1,
                                    borderColor: active ? theme.colors.primary : theme.colors.border,
                                  }}
                                >
                                  <Text style={{
                                    color: active ? '#FFFFFF' : theme.colors.text,
                                    fontSize: 11,
                                    fontWeight: '900',
                                  }}>
                                    {company}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 7 }}>
                            Grade
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {GRADES.map((grade) => {
                              const active = (selectedCard.grade ?? '10') === grade;
                              return (
                                <TouchableOpacity
                                  key={grade}
                                  onPress={() => handleSetGrading(selectedCard, { grade })}
                                  disabled={isReadOnly}
                                  style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 10,
                                    backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                                    borderWidth: 1,
                                    borderColor: active ? theme.colors.primary : theme.colors.border,
                                  }}
                                >
                                  <Text style={{
                                    color: active ? '#FFFFFF' : theme.colors.text,
                                    fontSize: 11,
                                    fontWeight: '900',
                                  }}>
                                    {grade}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ) : (
                        <View style={{ marginBottom: 16 }}>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                            Card Condition
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {CONDITION_OPTIONS.map((c) => {
                              const active = (selectedCard.condition || 'Near Mint') === c;
                              return (
                                <TouchableOpacity
                                  key={c}
                                  onPress={() => handleSetCondition(selectedCard, c)}
                                  disabled={isReadOnly}
                                  style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 10,
                                    backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                                    borderWidth: 1,
                                    borderColor: active ? theme.colors.primary : theme.colors.border,
                                  }}
                                >
                                  <Text style={{
                                    color: active ? '#FFFFFF' : theme.colors.text,
                                    fontSize: 11,
                                    fontWeight: '900',
                                  }}>
                                    {c}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}

                      {(!isReadOnly || getOwnedQuantity(selectedCard) > 1) && (
                        <View style={{ marginBottom: 16 }}>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                            Copies Owned
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity
                              onPress={() => handleSetOwnedQuantity(selectedCard, getOwnedQuantity(selectedCard) - 1)}
                              disabled={isReadOnly || getOwnedQuantity(selectedCard) <= 1}
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 12,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: theme.colors.surface,
                                borderWidth: 1,
                                borderColor: theme.colors.border,
                                opacity: isReadOnly || getOwnedQuantity(selectedCard) <= 1 ? 0.45 : 1,
                              }}
                            >
                              <Ionicons name="remove" size={18} color={theme.colors.text} />
                            </TouchableOpacity>
                            <View style={{
                              minWidth: 58,
                              height: 38,
                              borderRadius: 12,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: theme.colors.primary + '18',
                              borderWidth: 1,
                              borderColor: theme.colors.primary,
                            }}>
                              <Text style={{ color: theme.colors.primary, fontSize: 18, fontWeight: '900' }}>
                                {getOwnedQuantity(selectedCard)}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => handleSetOwnedQuantity(selectedCard, getOwnedQuantity(selectedCard) + 1)}
                              disabled={isReadOnly}
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 12,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: theme.colors.surface,
                                borderWidth: 1,
                                borderColor: theme.colors.border,
                                opacity: isReadOnly ? 0.45 : 1,
                              }}
                            >
                              <Ionicons name="add" size={18} color={theme.colors.text} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      <View style={{ height: 1, backgroundColor: theme.colors.border, marginBottom: 16 }} />

                      <PokeTraceMarketInsights
                        cardName={modalCard?.name ?? selectedCard.card_name ?? selectedCard.card_id}
                        setName={modalCard?.set?.name ?? selectedCard.set_name ?? selectedCard.set_id}
                        number={modalCard?.number ?? selectedCard.card_number ?? null}
                        rawCondition={binder.card_mode === 'graded' ? null : selectedCard.condition || 'Near Mint'}
                        gradingCompany={binder.card_mode === 'graded' ? selectedCard.grade_company ?? 'PSA' : null}
                        grade={binder.card_mode === 'graded' ? selectedCard.grade ?? '10' : null}
                        summaryOnly
                      />

                      {binder.card_mode !== 'graded' && (
                        <>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                            eBay Sold Prices - Adjusted for {selectedCard.condition || 'Near Mint'}
                          </Text>

                          {modalEbayLoading ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                              <ActivityIndicator size="small" color={theme.colors.primary} />
                              <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>Fetching live prices...</Text>
                            </View>
                          ) : modalEbayError ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                              <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>Could not fetch eBay prices. </Text>
                              <TouchableOpacity onPress={() => selectedCard && fetchModalEbayPrice(selectedCard)}>
                                <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '700' }}>Retry</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <>
                              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                                <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Low</Text>
                                  <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'center' }}>
                                    {modalEbayPrice?.low != null
                                      ? formatCurrency(getEstimatedValue(modalEbayPrice.low, selectedCard.condition || 'Near Mint'))
                                      : '--'}
                                  </Text>
                                </View>
                                <View style={{ flex: 1, backgroundColor: theme.colors.primary + '18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.primary }}>
                                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Avg</Text>
                                  <Text style={{ color: theme.colors.primary, fontWeight: '900', textAlign: 'center', fontSize: 15 }}>
                                    {modalEbayPrice?.average != null
                                      ? formatCurrency(getEstimatedValue(modalEbayPrice.average, selectedCard.condition || 'Near Mint'))
                                      : '--'}
                                  </Text>
                                </View>
                                <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>High</Text>
                                  <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'center' }}>
                                    {modalEbayPrice?.high != null
                                      ? formatCurrency(getEstimatedValue(modalEbayPrice.high, selectedCard.condition || 'Near Mint'))
                                      : '--'}
                                  </Text>
                                </View>
                              </View>

                              {modalEbayPrice?.count != null && modalEbayPrice.count > 0 && (
                                <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>
                                  Based on {modalEbayPrice.count} listing{modalEbayPrice.count !== 1 ? 's' : ''}
                                </Text>
                              )}
                              {modalEbayPrice?.usedFallback && (modalEbayPrice?.count ?? 0) > 0 && (
                                <Text style={{ color: '#F59E0B', fontSize: 11, marginTop: 2 }}>
                                  Broad search used - results may be less specific
                                </Text>
                              )}
                              {modalEbayPrice?.count === 0 && (
                                <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>
                                  No listings found on eBay
                                </Text>
                              )}
                            </>
                          )}
                        </>
                      )}

                      {binder.card_mode !== 'graded' && (
                        <>
                          <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 12 }} />

                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                            Stored Prices (Adjusted)
                          </Text>

                          <Row label="eBay (cached)" value={formatCurrency(getEstimatedValue(selectedCard?.ebay_price ?? 0, selectedCard.condition || 'Near Mint'))} />
                          <Row
                            label="TCGPlayer"
                            value={formatCurrency(
                              getEstimatedValue(
                                getBinderTcgPrice(selectedCard?.card, binder?.edition) ??
                                  modalTcgFallbackPrice?.market ??
                                  modalTcgFallbackPrice?.mid ??
                                  modalTcgFallbackPrice?.low ??
                                  0,
                                selectedCard.condition || 'Near Mint'
                              )
                            )}
                          />
                          <Row label="CardMarket" value={formatCurrency(getEstimatedValue(getCardmarketPrice(selectedCard) ?? 0, selectedCard.condition || 'Near Mint'))} />

                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 8 }}>
                            Updated daily
                          </Text>
                        </>
                      )}
                    </View>

                    <PokeTraceMarketInsights
                      cardName={modalCard?.name ?? selectedCard.card_name ?? selectedCard.card_id}
                      setName={modalCard?.set?.name ?? selectedCard.set_name ?? selectedCard.set_id}
                      number={modalCard?.number ?? selectedCard.card_number ?? null}
                      rawCondition={binder.card_mode === 'graded' ? null : selectedCard.condition || 'Near Mint'}
                      gradingCompany={binder.card_mode === 'graded' ? selectedCard.grade_company ?? 'PSA' : null}
                      grade={binder.card_mode === 'graded' ? selectedCard.grade ?? '10' : null}
                    />

                    {!isReadOnly && masterSetEnabled && (() => {
                      const modalVariants = getVariants(selectedCard.card, selectedCard.set_id);
                      const isMultiVariant = modalVariants.length > 1;
                      return isMultiVariant ? (
                        <View style={boxStyle}>
                          <Text style={boxTitleStyle}>Variants Owned</Text>
                          {modalVariants.map((variant) => {
                            const variantQuantity = getDisplayedVariantQuantity(selectedCard, variant);
                            const variantOwned = variantQuantity > 0;
                            return (
                              <View
                                key={variant}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 10,
                                  paddingVertical: 10,
                                  borderBottomWidth: 1,
                                  borderBottomColor: theme.colors.border,
                                }}
                              >
                                <TouchableOpacity
                                  onPress={() => handleToggleVariant(selectedCard.card_id, selectedCard.set_id, variant)}
                                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                                  activeOpacity={0.75}
                                >
                                  <View style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 17,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: variantOwned ? theme.colors.primary : theme.colors.surface,
                                    borderWidth: 1,
                                    borderColor: variantOwned ? theme.colors.primary : theme.colors.border,
                                  }}>
                                    {variantOwned ? (
                                      <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                                    ) : (
                                      <MasterVariantIcon variant={variant} size="small" active={false} />
                                    )}
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
                                      {VARIANT_LABELS[variant] ?? variant}
                                    </Text>
                                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>
                                      {variantOwned ? `${variantQuantity} owned` : 'Not owned'}
                                    </Text>
                                  </View>
                                </TouchableOpacity>

                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <TouchableOpacity
                                    onPress={() => handleSetVariantQuantity(selectedCard.card_id, selectedCard.set_id, variant, variantQuantity - 1)}
                                    disabled={variantQuantity <= 0}
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: 10,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      backgroundColor: theme.colors.surface,
                                      borderWidth: 1,
                                      borderColor: theme.colors.border,
                                      opacity: variantQuantity <= 0 ? 0.45 : 1,
                                    }}
                                  >
                                    <Ionicons name="remove" size={16} color={theme.colors.text} />
                                  </TouchableOpacity>
                                  <View style={{
                                    minWidth: 42,
                                    height: 32,
                                    borderRadius: 10,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: variantOwned ? theme.colors.primary + '18' : theme.colors.surface,
                                    borderWidth: 1,
                                    borderColor: variantOwned ? theme.colors.primary : theme.colors.border,
                                  }}>
                                    <Text style={{ color: variantOwned ? theme.colors.primary : theme.colors.textSoft, fontSize: 14, fontWeight: '900' }}>
                                      {variantQuantity}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    onPress={() => handleSetVariantQuantity(selectedCard.card_id, selectedCard.set_id, variant, variantQuantity + 1)}
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: 10,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      backgroundColor: theme.colors.surface,
                                      borderWidth: 1,
                                      borderColor: theme.colors.border,
                                    }}
                                  >
                                    <Ionicons name="add" size={16} color={theme.colors.text} />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ) : null;
                    })()}

                    {!isReadOnly && (
                      <View style={boxStyle}>
                        <Text style={boxTitleStyle}>Card Actions</Text>

                        {(!masterSetEnabled || getVariants(selectedCard.card).length <= 1) && (
                          <ActionButton
                            label={selectedCard.owned ? 'Mark as missing' : 'Mark as owned'}
                            active={selectedCard.owned}
                            onPress={() => handleCardPress(selectedCard)}
                          />
                        )}
                        <ActionButton
                          label={isShowcased(selectedCard, 'favorite') ? 'Remove favourite top loader' : 'Add to favourite top loaders'}
                          active={isShowcased(selectedCard, 'favorite')}
                          onPress={() => toggleShowcase(selectedCard, 'favorite')}
                        />
                        <ActionButton
                          label={isShowcased(selectedCard, 'chase') ? 'Remove chase card' : 'Add to chase cards'}
                          active={isShowcased(selectedCard, 'chase')}
                          onPress={() => toggleShowcase(selectedCard, 'chase')}
                        />
                        <ActionButton
                          label={modalWanted ? 'Remove from wishlist' : 'Add to wishlist'}
                          active={modalWanted}
                          onPress={() => toggleWishlistCard(selectedCard.card_id, selectedCard.set_id)}
                        />
                      </View>
                    )}
                  </ScrollView>
                )}
              </SafeAreaView>
            </Animated.View>
          </BlurView>
        </View>
      </Modal>


      {/* In-app toast */}
      {toastMessage && (
        <View style={{
          position: 'absolute',
          bottom: 40,
          left: 24,
          right: 24,
          backgroundColor: theme.colors.primary,
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 18,
          alignItems: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 6,
        }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{toastMessage}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ===============================
// SUB COMPONENTS
// ===============================

function Row({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: theme.colors.textSoft }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{value}</Text>
    </View>
  );
}

function MasterVariantIcon({
  variant,
  size = 'small',
  active = false,
}: {
  variant: string;
  size?: 'tiny' | 'small' | 'medium' | 'large';
  active?: boolean;
}) {
  const kind = getMasterVariantKind(variant);
  const width = size === 'large' ? 38 : size === 'medium' ? 30 : size === 'small' ? 25 : 20;
  const height = size === 'large' ? 46 : size === 'medium' ? 36 : size === 'small' ? 30 : 24;
  const iconSize = size === 'large' ? 18 : size === 'medium' ? 14 : size === 'small' ? 12 : 10;
  const purple = '#6D3DFF';
  const isEnergyReverse = variant === 'reverseHoloEnergy';
  const isPokeballReverse = variant === 'reverseHoloPokeball';
  const isFirstEdition = variant === '1stEditionNormal' || variant === '1stEditionHolofoil';
  const isHolo = kind === 'holo';
  const isReverse = kind === 'reverse';

  const baseStyle = {
    width,
    height,
    borderRadius: 5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: isReverse ? 2 : 1,
    borderColor: isReverse ? '#FFC83D' : '#DED1FF',
    overflow: 'hidden' as const,
  };

  if (isEnergyReverse) {
    return (
      <View style={[baseStyle, { backgroundColor: '#F5F0FF' }]}>
        <Ionicons name="flash" size={iconSize + 2} color={purple} />
      </View>
    );
  }

  if (isPokeballReverse) {
    return (
      <View style={[baseStyle, { backgroundColor: '#F5F0FF' }]}>
        <View style={{
          width: iconSize + 8,
          height: iconSize + 8,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: purple,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <View style={{ position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: purple }} />
          <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 2, borderColor: purple, backgroundColor: '#FFFFFF' }} />
        </View>
      </View>
    );
  }

  if (isReverse) {
    return (
      <LinearGradient
        colors={['#FFE27A', '#F9D6FF', '#D7F5FF', '#FFF0B8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={baseStyle}
      >
        <Ionicons name="sparkles" size={iconSize} color={purple} style={{ position: 'absolute', top: 4, left: 4 }} />
        <Ionicons name="sparkles" size={Math.max(8, iconSize - 2)} color={purple} style={{ position: 'absolute', bottom: 4, right: 4 }} />
      </LinearGradient>
    );
  }

  if (isHolo) {
    return (
      <View style={[baseStyle, { backgroundColor: '#F3EEFF', borderColor: '#C9B6FF' }]}>
        <Ionicons name="sparkles" size={iconSize + 1} color={purple} />
        {isFirstEdition && (
          <Text style={{
            position: 'absolute',
            right: 3,
            bottom: 1,
            color: purple,
            fontSize: Math.max(7, iconSize - 4),
            fontWeight: '900',
          }}>
            1
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[baseStyle, { backgroundColor: '#F3EEFF' }]}>
      <View style={{
        width: '62%',
        height: '72%',
        borderRadius: 3,
        borderWidth: 1.5,
        borderColor: purple,
        backgroundColor: active ? '#FFFFFF' : 'transparent',
      }} />
      {isFirstEdition && (
        <Text style={{
          position: 'absolute',
          right: 3,
          bottom: 1,
          color: purple,
          fontSize: Math.max(7, iconSize - 4),
          fontWeight: '900',
        }}>
          1
        </Text>
      )}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  active?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: active ? theme.colors.primary : theme.colors.card,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.border,
      }}
    >
      <Text style={{
        color: active ? '#FFFFFF' : theme.colors.text,
        fontWeight: '900',
        textAlign: 'center',
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}



