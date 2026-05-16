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
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BinderRecord,
  BinderCardRecord,
  addCardsToBinder,
  fetchBinderById,
  fetchBinderCards,
  updateBinderCardOwned,
  updateBinderCardCondition,
  CONDITION_MULTIPLIERS,
  getEstimatedValue,
} from '../../lib/binders';
import { useTrade } from '../../components/trade-context';
import { supabase } from '../../lib/supabase';
import { fetchEbayPrice } from '../../lib/ebay';
import { USD_TO_GBP, EUR_TO_GBP } from '../../lib/config';
import { fetchTcgcsvUiCardPricesForSet } from '../../lib/pricing';

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

const formatCurrency = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '--';
  return `£${value.toFixed(2)}`;
};

const getBaseCardValue = (card: any): number => {
  return card?.ebay_price ?? card?.tcg_price ?? card?.cardmarket_price ?? 0;
};

const getCardmarketPrice = (binderCard: any): number | null => {
  if (typeof binderCard?.cardmarket_price === 'number') return binderCard.cardmarket_price;
  const prices = binderCard?.card?.cardmarket?.prices;
  if (!prices) return null;
  const eur = prices.trendPrice ?? prices.averageSellPrice ?? prices.avg30;
  return typeof eur === 'number' ? Math.round(eur * EUR_TO_GBP * 100) / 100 : null;
};

const getBinderTcgPrice = (card: any, edition?: string | null): number | null => {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  if (edition === '1st_edition') {
    const preferred = ['1stEditionHolofoil', '1stEditionNormal', 'holofoil', 'reverseHolofoil', 'normal'];
    for (const key of preferred) {
      const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
      if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
    }
  }

  const preferred = ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal'];
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

// ===============================
// VARIANT HELPERS
// ===============================

const VARIANT_LABELS: Record<string, string> = {
  normal: 'Nrm',
  holofoil: 'Holo',
  reverseHolofoil: 'Rev',
  '1stEditionNormal': '1st',
  '1stEditionHolofoil': '1stH',
  unlimitedHolofoil: '∞H',
  unlimited: '∞',
  reverseHoloEnergy: 'Nrg',
  reverseHoloPokeball: 'Ball',
};

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

function shortVariant(key: string): string {
  return VARIANT_LABELS[key] ?? key.slice(0, 4);
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function BinderDetailScreen() {
  const { theme } = useTheme();
  const { id, readOnly } = useLocalSearchParams<{ id: string; readOnly?: string }>();
  const binderId = Array.isArray(id) ? id[0] : id;
  const isReadOnly = readOnly === 'true';
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

  const [tradeModalVisible, setTradeModalVisible] = useState(false);
  const [tradeCard, setTradeCard] = useState<BinderCardWithDetails | null>(null);
  const [tradeCondition, setTradeCondition] = useState<string>('Near Mint');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeNotes, setTradeNotes] = useState('');
  const [tradeOnly, setTradeOnly] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ownedVariants, setOwnedVariants] = useState<Set<string>>(new Set());
  const [masterSetEnabled, setMasterSetEnabled] = useState(false);
  const [updatingMasterSet, setUpdatingMasterSet] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    toastTimer.current = setTimeout(() => setToastMessage(null), 2500);
  };

  const [showcaseCollapsed, setShowcaseCollapsed] = useState<Record<ShowcaseType, boolean>>({
  favorite: false,
  chase: false,
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
      });

      setModalEbayPrice({
        low: result.low ?? null,
        average: result.average ?? null,
        high: result.high ?? null,
        count: result.count ?? 0,
        usedFallback: result.usedFallback ?? false,
      });
    } catch (err) {
      console.error('Modal eBay fetch failed:', err);
      setModalEbayError(true);
    } finally {
      setModalEbayLoading(false);
    }
  }, [binder?.edition]);

  // ===============================
  // LOAD
  // ===============================

  const load = useCallback(async () => {
    if (!binderId) return;

    try {
      setLoading(true);

      const binderData = await fetchBinderById(binderId);
      setBinder(binderData);
      setIsPublic(Boolean(binderData?.is_public));

      const binderCards = await fetchBinderCards(binderId);
      setCards(binderCards);

      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setUserId(user.id);

        const { data, error } = await supabase
          .from('binder_card_showcases')
          .select('*')
          .eq('user_id', user.id)
          .eq('binder_id', binderId)
          .order('sort_order', { ascending: true });

        if (error) throw error;
        setShowcaseRows((data ?? []) as ShowcaseRow[]);

        // Load variant ownership for all cards in this binder
        const cardIds = binderCards.map((c) => c.card_id);
        if (cardIds.length > 0) {
          const { data: variantRows } = await supabase
            .from('user_card_variants')
            .select('card_id, variant')
            .eq('user_id', user.id)
            .in('card_id', cardIds);
          setOwnedVariants(new Set((variantRows ?? []).map((r) => `${r.card_id}:${r.variant}`)));
        }
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
        if (mounted) setMasterSetEnabled(stored === 'true');
      } catch (error) {
        console.log('Failed to load master set setting', error);
      }
    };

    loadMasterSetMode();

    return () => {
      mounted = false;
    };
  }, [binderId]);

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
    const variants = masterSetEnabled ? getVariants(c.card, c.set_id) : ['card'];
    if (variants.length > 1) {
      totalCount += variants.length;
      ownedCount += variants.filter((v) => ownedVariants.has(`${c.card_id}:${v}`)).length;
    } else {
      totalCount += 1;
      if (c.owned) ownedCount += 1;
    }
  }
  const progressPercent = totalCount ? Math.round((ownedCount / totalCount) * 100) : 0;

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
    } catch (error) {
      console.log('Toggle master set error:', error);
      setMasterSetEnabled((prev) => !prev);
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

  const handleCardPress = async (item: BinderCardWithDetails) => {
    if (isReadOnly) {
      openCardDetail(item);
      return;
    }

    const newOwned = !item.owned;

    setCards((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, owned: newOwned } : c))
    );

    if (selectedCard?.id === item.id) {
      setSelectedCard({ ...item, owned: newOwned });
    }

    try {
  await updateBinderCardOwned(item.id, newOwned, {
    cardName: item.card?.name ?? item.card_name ?? null,
    cardNumber: item.card?.number ?? item.card_number ?? null,
    imageUrl: item.card?.images?.small ?? item.image_url ?? null,
    setName: item.card?.set?.name ?? item.set_name ?? null,
    slotOrder: item.slot_order,
    condition: item.condition,
  });
  setCards((prev) =>
    prev.map((c) => (c.id === item.id ? { ...c, owned: newOwned } : c))
  );
} catch (error) {
  console.log('Rollback owned toggle', error);
  setCards((prev) =>
    prev.map((c) => (c.id === item.id ? { ...c, owned: !newOwned } : c))
  );
  Alert.alert('Error', 'Failed to update card.');
}
  };

  const handleToggleVariant = useCallback(async (cardId: string, setId: string, variant: string) => {
    if (!userId || isReadOnly) return;
    const key = `${cardId}:${variant}`;
    let removing = false;

    setOwnedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); removing = true; }
      else { next.add(key); removing = false; }
      return next;
    });

    if (removing) {
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
        .insert({ user_id: userId, card_id: cardId, set_id: setId, variant });
    }
  }, [userId, isReadOnly]);

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

      const { data, error } = await supabase
        .from('pokemon_cards')
        .select('id, name, set_id, image_small, image_large, raw_data')
        .ilike('name', `%${safeQuery}%`)
        .limit(150);

      if (error) throw error;

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
      await addCardsToBinder(binderId, [{ cardId: card.card_id, setId: derivedSetId }]);
      setShowAddModal(false);
      setAddSearch('');
      setAddSearchResults([]);
      await load();
      Alert.alert('Added', `${card.name} has been added as missing.`);
    } catch (error: any) {
      Alert.alert('Could not add card', error?.message ?? 'Something went wrong.');
    } finally {
      setAddingCardId(null);
    }
  };

  const handleAddMultipleToCustomBinder = async () => {
  if (!binderId || pendingAddCount === 0) return;

  const cardsToAdd = Object.values(pendingAddIds);

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
  // SCAN (scaffolded)
  // ===============================

  const handleScanCard = async () => {
    Alert.alert(
      'Coming soon',
      'Card scanning is built into the app architecture, but this feature is coming soon.'
    );
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
          {imageUri ? (
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

          <View style={{
            position: 'absolute',
            left: 7, right: 7, top: 7, bottom: 7,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.7)',
          }} />
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

  return (
    <View style={{ marginBottom: 24, zIndex: 0 }}>
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
        <Text style={{
          color: type === 'favorite' ? theme.colors.secondary : '#FF8FA3',
          fontSize: 18,
          fontWeight: '900',
        }}>
          {title}
        </Text>

        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}>
          <Text style={{
            color: type === 'favorite' ? theme.colors.secondary : '#FF8FA3',
            fontSize: 12,
            fontWeight: '700',
          }}>
            {data.length} card{data.length !== 1 ? 's' : ''}
          </Text>
          <Text style={{
            color: type === 'favorite' ? theme.colors.secondary : '#FF8FA3',
            fontSize: 14,
            fontWeight: '900',
          }}>
            {collapsed ? '▶' : '▼'}
          </Text>
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
        />
      )}
    </View>
  );
};

  const renderCard = ({ item }: { item: BinderCardWithDetails }) => {
    const imageUri = item.card?.images?.small ?? item.card?.images?.large ?? null;
    const cardName = item.card?.name ?? item.card_id;
    const forTrade = isForTrade(item.card_id, item.set_id);
    const wanted = isWanted(item.card_id, item.set_id);

    const variants = masterSetEnabled ? getVariants(item.card, item.set_id) : ['card'];
    const multiVariant = variants.length > 1;
    const anyVariantOwned = variants.some((v) => ownedVariants.has(`${item.card_id}:${v}`));
    const isOwned = multiVariant ? anyVariantOwned : item.owned;

    const Container = multiVariant ? View : TouchableOpacity;

    return (
      <Container
        onPress={multiVariant ? undefined : () => handleCardPress(item)}
        onLongPress={() => openCardDetail(item)}
        delayLongPress={300}
        activeOpacity={0.85}
        style={{
          width: cardWidth,
          marginBottom: 8,
          backgroundColor: theme.colors.card,
          borderRadius: 14,
          padding: 6,
          borderWidth: 1,
          borderColor: isOwned ? theme.colors.secondary : theme.colors.border,
          opacity: isOwned ? 1 : 0.6,
          ...cardShadow,
        }}
      >
        <View style={{
          width: '100%',
          aspectRatio: 0.72,
          borderRadius: 10,
          backgroundColor: theme.colors.surface,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ color: theme.colors.textSoft, fontSize: 10 }}>No image</Text>
          )}

          {multiVariant && (
            <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
              {variants.map((variant, i) => {
                const owned = ownedVariants.has(`${item.card_id}:${variant}`);
                return (
                  <Pressable
                    key={variant}
                    onPress={() =>
                      isReadOnly
                        ? openCardDetail(item)
                        : handleToggleVariant(item.card_id, item.set_id, variant)
                    }
                    onLongPress={() => openCardDetail(item)}
                    delayLongPress={400}
                    style={({ pressed }) => ({
                      flex: 1,
                      backgroundColor: pressed
                        ? 'rgba(108,75,255,0.25)'
                        : owned
                          ? 'rgba(255,209,102,0.45)'
                          : 'rgba(0,0,0,0.04)',
                      borderLeftWidth: i > 0 ? 1 : 0,
                      borderColor: 'rgba(255,255,255,0.3)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    {owned && (
                      <View style={{
                        backgroundColor: 'rgba(255,255,255,0.7)',
                        borderRadius: 10,
                        width: 20,
                        height: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 13, color: '#7A5200', fontWeight: '900' }}>✓</Text>
                      </View>
                    )}
                    <View style={{ position: 'absolute', bottom: 3, alignItems: 'center' }}>
                      {variant === 'reverseHoloEnergy' ? (
                        <Ionicons name="flash" size={10} color={owned ? '#7A5200' : 'rgba(255,255,255,0.9)'} />
                      ) : variant === 'reverseHoloPokeball' ? (
                        <Ionicons name="aperture" size={10} color={owned ? '#7A5200' : 'rgba(255,255,255,0.9)'} />
                      ) : variant === 'holofoil' || variant === '1stEditionHolofoil' || variant === 'unlimitedHolofoil' ? (
                        <Ionicons name="star" size={10} color={owned ? '#7A5200' : 'rgba(255,255,255,0.9)'} />
                      ) : variant === 'reverseHolofoil' ? (
                        <Ionicons name="sync" size={10} color={owned ? '#7A5200' : 'rgba(255,255,255,0.9)'} />
                      ) : (
                        <Text style={{
                          fontSize: 8,
                          fontWeight: '900',
                          color: owned ? '#7A5200' : 'rgba(255,255,255,0.9)',
                          textShadowColor: 'rgba(0,0,0,0.5)',
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: 2,
                        }}>
                          {shortVariant(variant)}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Text numberOfLines={2} style={{
          color: theme.colors.text,
          fontSize: 11,
          fontWeight: '900',
          marginTop: 6,
          minHeight: 28,
        }}>
          {cardName}
        </Text>

        {item.owned && item.condition && item.condition !== 'Near Mint' && (
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
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>

        {/* Header */}
        <View style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900', flex: 1, marginRight: 8 }}>
              {binder.name}
            </Text>

            {!isReadOnly && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '900' }}>
                  Master set
                </Text>
                <Switch
                  value={masterSetEnabled}
                  onValueChange={toggleMasterSet}
                  disabled={updatingMasterSet}
                  style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                />
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '900' }}>
                  {isPublic ? '🌍' : '🔒'}
                </Text>
                <Switch
                  value={isPublic}
                  onValueChange={togglePublic}
                  disabled={updatingVisibility}
                  style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                />
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
              {ownedCount} / {totalCount} owned · {progressPercent}%
            </Text>

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
            <Text style={{ fontSize: 16 }}>👁️</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700' }}>
              Viewing another collector&apos;s binder — read only
            </Text>
          </View>
        )}

        {/* Showcase strips */}
        {renderShowcaseStrip('favorite', 'Favourite Top Loaders')}
        {renderShowcaseStrip('chase', 'Chase Cards')}

        {/* Add card button */}
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

        {/* Sort dropdown */}
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
            <Text style={{ color: theme.colors.textSoft, fontWeight: '900' }}>
              {sortDropdownOpen ? '▲' : '▼'}
            </Text>
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

        {/* Card grid */}
        <FlatList
          data={sortedCards}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          key={numColumns}
          numColumns={numColumns}
          columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
        />
      </View>

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

        {/* Select all / count row */}
        {addSearchResults.length > 0 && !addSearchLoading && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}>
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
                    Add {pendingAddCount} to Binder
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
                      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>✓</Text>
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
                    top: 20, right: 16,
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
                    contentContainerStyle={{ padding: 16, paddingTop: 42, paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={{ width: '100%', aspectRatio: 0.72, maxHeight: screenHeight * 0.48, alignSelf: 'center', borderRadius: 20, overflow: 'hidden' }}>
                      <PinchGestureHandler
                        onGestureEvent={onPinchGestureEvent}
                        onHandlerStateChange={onPinchHandlerStateChange}
                      >
                        <Animated.View style={{ flex: 1, transform: [{ scale: imageScale }] }}>
                          <Image
                            source={{ uri: modalCard?.images?.large ?? modalCard?.images?.small ?? undefined }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="contain"
                          />

                          {/* Variant slices in Modal */}
                          {!isReadOnly && masterSetEnabled && (() => {
                            const modalVariants = getVariants(selectedCard.card, selectedCard.set_id);
                            if (modalVariants.length <= 1) return null;
                            return (
                              <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]} pointerEvents="box-none">
                                {modalVariants.map((variant, i) => {
                                  const owned = ownedVariants.has(`${selectedCard.card_id}:${variant}`);
                                  return (
                                    <Pressable
                                      key={variant}
                                      onPress={() => handleToggleVariant(selectedCard.card_id, selectedCard.set_id, variant)}
                                      style={({ pressed }) => ({
                                        flex: 1,
                                        backgroundColor: pressed
                                          ? 'rgba(108,75,255,0.25)'
                                          : owned
                                            ? 'rgba(255,209,102,0.3)'
                                            : 'transparent',
                                        borderLeftWidth: i > 0 ? 1 : 0,
                                        borderColor: 'rgba(255,255,255,0.2)',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      })}
                                    >
                                      {owned && (
                                        <View style={{ backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 }}>
                                          <Text style={{ fontSize: 18, color: '#7A5200', fontWeight: '900' }}>✓</Text>
                                        </View>
                                      )}
                                      <View style={{
                                        position: 'absolute',
                                        bottom: 12,
                                        backgroundColor: 'rgba(0,0,0,0.6)',
                                        paddingHorizontal: 8,
                                        paddingVertical: 4,
                                        borderRadius: 6,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}>
                                        {variant === 'reverseHoloEnergy' ? (
                                          <Ionicons name="flash" size={12} color="#FFFFFF" />
                                        ) : variant === 'reverseHoloPokeball' ? (
                                          <Ionicons name="aperture" size={12} color="#FFFFFF" />
                                        ) : (
                                          <Text style={{
                                            fontSize: 10,
                                            fontWeight: '900',
                                            color: '#FFFFFF',
                                          }}>
                                            {shortVariant(variant)}
                                          </Text>
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
                            {modalEbayLoading ? 'Fetching...' : '↻ Refresh'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Condition Selection */}
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

                      <View style={{ height: 1, backgroundColor: theme.colors.border, marginBottom: 16 }} />

                      <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                        eBay Sold Prices · Adjusted for {selectedCard.condition || 'Near Mint'}
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
                                {modalEbayPrice?.low != null ? formatCurrency(getEstimatedValue(modalEbayPrice.low, selectedCard.condition || 'Near Mint')) : '--'}
                              </Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: theme.colors.primary + '18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.primary }}>
                              <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Avg</Text>
                              <Text style={{ color: theme.colors.primary, fontWeight: '900', textAlign: 'center', fontSize: 15 }}>
                                {modalEbayPrice?.average != null ? formatCurrency(getEstimatedValue(modalEbayPrice.average, selectedCard.condition || 'Near Mint')) : '--'}
                              </Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                              <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>High</Text>
                              <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'center' }}>
                                {modalEbayPrice?.high != null ? formatCurrency(getEstimatedValue(modalEbayPrice.high, selectedCard.condition || 'Near Mint')) : '--'}
                              </Text>
                            </View>
                          </View>

                          {modalEbayPrice?.count != null && modalEbayPrice.count > 0 && (
                            <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>
                              Based on {modalEbayPrice.count} listing{modalEbayPrice.count !== 1 ? 's' : ''}
                            </Text>
                          )}
                          {modalEbayPrice?.usedFallback && (
                            <Text style={{ color: '#F59E0B', fontSize: 11, marginTop: 2 }}>
                              ⚠️ Broad search used — results may be less specific
                            </Text>
                          )}
                          {modalEbayPrice?.count === 0 && (
                            <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>
                              No listings found on eBay
                            </Text>
                          )}
                        </>
                      )}

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
                    </View>

                    {!isReadOnly && masterSetEnabled && (() => {
                      const modalVariants = getVariants(selectedCard.card, selectedCard.set_id);
                      const isMultiVariant = modalVariants.length > 1;
                      return isMultiVariant ? (
                        <View style={boxStyle}>
                          <Text style={boxTitleStyle}>Variants Owned</Text>
                          {modalVariants.map((variant) => {
                            const variantOwned = ownedVariants.has(`${selectedCard.card_id}:${variant}`);
                            return (
                              <ActionButton
                                key={variant}
                                label={`${VARIANT_LABELS[variant] ?? variant}${variantOwned ? ' · Owned ✓' : ' · Not owned'}`}
                                active={variantOwned}
                                onPress={() => handleToggleVariant(selectedCard.card_id, selectedCard.set_id, variant)}
                              />
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

