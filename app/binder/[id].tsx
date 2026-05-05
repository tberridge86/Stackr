import { theme } from '../../lib/theme';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Text } from '../../components/Text';
import { SafeAreaView , useSafeAreaInsets } from 'react-native-safe-area-context';

import { router, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import {
  BinderCardRecord,
  BinderRecord,
  addCardsToBinder,
  fetchBinderById,
  fetchBinderCards,
  updateBinderCardOwned,
} from '../../lib/binders';
import { useTrade } from '../../components/trade-context';
import { supabase } from '../../lib/supabase';
import { fetchEbayPrice } from '../../lib/ebay';

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

const CONDITION_MULTIPLIERS: Record<string, number> = {
  Mint: 1.05,
  'Near Mint': 1,
  'Lightly Played': 0.85,
  'Moderately Played': 0.65,
  'Heavily Played': 0.45,
  Damaged: 0.2,
};

const screenHeight = Dimensions.get('window').height;

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

const getEstimatedValue = (card: any, condition: string): number => {
  const base = getBaseCardValue(card);
  const multiplier = CONDITION_MULTIPLIERS[condition] ?? 1;
  return base * multiplier;
};

const getBinderTcgPrice = (card: any, edition?: string | null): number | null => {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  if (edition === '1st_edition') {
    const preferred = ['1stEditionHolofoil', '1stEditionNormal', 'holofoil', 'reverseHolofoil', 'normal'];
    for (const key of preferred) {
      const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
      if (typeof value === 'number') return value;
    }
  }

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

// ===============================
// MAIN COMPONENT
// ===============================

export default function BinderDetailScreen() {
  const { id, readOnly } = useLocalSearchParams<{ id: string; readOnly?: string }>();
  const binderId = Array.isArray(id) ? id[0] : id;
  const isReadOnly = readOnly === 'true';
  const insets = useSafeAreaInsets();

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
      const editionTerm = binder?.edition === '1st_edition' ? '1st edition' : '';

      const query = [name, setName, number, editionTerm, 'pokemon card']
        .map((v) => v.trim())
        .filter(Boolean)
        .join(' ');

      const result = await fetchEbayPrice(query);

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
        const { data, error } = await supabase
          .from('binder_card_showcases')
          .select('*')
          .eq('user_id', user.id)
          .eq('binder_id', binderId)
          .order('sort_order', { ascending: true });

        if (error) throw error;
        setShowcaseRows((data ?? []) as ShowcaseRow[]);
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

  const ownedCount = cards.filter((c) => c.owned).length;
  const totalCount = cards.length;
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
    Alert.alert('Added', `${validCards.length} card${validCards.length !== 1 ? 's' : ''} added to binder.`);
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
    const favorite = isShowcased(item, 'favorite');
    const chase = isShowcased(item, 'chase');

    return (
      <TouchableOpacity
        onPress={() => handleCardPress(item)}
        onLongPress={() => openCardDetail(item)}
        delayLongPress={300}
        activeOpacity={0.85}
        style={{
          width: '31.5%',
          marginBottom: 14,
          backgroundColor: theme.colors.card,
          borderRadius: 14,
          padding: 6,
          borderWidth: 1,
          borderColor: item.owned ? theme.colors.secondary : theme.colors.border,
          opacity: item.owned ? 1 : 0.55,
          ...cardShadow,
        }}
      >
        {!isReadOnly && (
          <View style={{
            position: 'absolute',
            top: 8, left: 8,
            zIndex: 20,
            flexDirection: 'row',
            gap: 4,
          }}>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); toggleShowcase(item, 'favorite'); }}
              style={{
                width: 24, height: 24, borderRadius: 12,
                backgroundColor: favorite ? theme.colors.secondary : '#FFFFFF',
                borderWidth: 1, borderColor: theme.colors.border,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: favorite ? theme.colors.text : theme.colors.secondary, fontWeight: '900' }}>★</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); toggleShowcase(item, 'chase'); }}
              style={{
                width: 24, height: 24, borderRadius: 12,
                backgroundColor: chase ? '#FF8FA3' : '#FFFFFF',
                borderWidth: 1, borderColor: theme.colors.border,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: chase ? theme.colors.text : '#FF8FA3', fontWeight: '900' }}>♦</Text>
            </TouchableOpacity>
          </View>
        )}

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
      </TouchableOpacity>
    );
  };

  // ===============================
  // LOADING / NOT FOUND
  // ===============================

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
              Viewing another collector's binder — read only
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
          numColumns={3}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
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
                    <PinchGestureHandler
                      onGestureEvent={onPinchGestureEvent}
                      onHandlerStateChange={onPinchHandlerStateChange}
                    >
                      <Animated.Image
                        source={{ uri: modalCard?.images?.large ?? modalCard?.images?.small ?? undefined }}
                        style={{
                          width: '100%',
                          maxHeight: screenHeight * 0.48,
                          aspectRatio: 0.72,
                          borderRadius: 20,
                          alignSelf: 'center',
                          transform: [{ scale: imageScale }],
                        }}
                        resizeMode="contain"
                      />
                    </PinchGestureHandler>

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
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
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

                      <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                        eBay Live · GBP {binder.edition === '1st_edition' ? '· 1st Edition' : ''}
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
                                {modalEbayPrice?.low != null ? `£${modalEbayPrice.low.toFixed(2)}` : '--'}
                              </Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: theme.colors.primary + '18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.primary }}>
                              <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Avg</Text>
                              <Text style={{ color: theme.colors.primary, fontWeight: '900', textAlign: 'center', fontSize: 15 }}>
                                {modalEbayPrice?.average != null ? `£${modalEbayPrice.average.toFixed(2)}` : '--'}
                              </Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                              <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>High</Text>
                              <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'center' }}>
                                {modalEbayPrice?.high != null ? `£${modalEbayPrice.high.toFixed(2)}` : '--'}
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
                        Stored Prices
                      </Text>

                      <Row label="eBay (cached)" value={formatCurrency(selectedCard?.ebay_price)} />
                      <Row label="TCGPlayer" value={formatCurrency(getBinderTcgPrice(selectedCard?.card, binder?.edition))} />
                      <Row label="CardMarket" value={formatCurrency(selectedCard?.cardmarket_price)} />

                      <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 8 }}>
                        Updated daily
                      </Text>
                    </View>

                    {!isReadOnly && (
                      <View style={boxStyle}>
                        <Text style={boxTitleStyle}>Card Actions</Text>

                        <ActionButton
                          label={selectedCard.owned ? 'Mark as missing' : 'Mark as owned'}
                          active={selectedCard.owned}
                          onPress={() => handleCardPress(selectedCard)}
                        />
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
                          label={modalForTrade ? 'Edit trade listing' : 'Mark for trade'}
                          active={modalForTrade}
                          onPress={() => {
                            setTradeCard(selectedCard);
                            setTradeModalVisible(true);
                          }}
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

      {/* TRADE LISTING MODAL */}
      {!isReadOnly && (
        <Modal visible={tradeModalVisible} animationType="slide">
          <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
            <View style={{ padding: 16 }}>
              <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>
                Trade Listing
              </Text>

              <Text style={{ marginTop: 16, color: theme.colors.textSoft }}>Condition</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {CONDITION_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setTradeCondition(option)}
                    style={{
                      padding: 8,
                      borderRadius: 10,
                      backgroundColor: tradeCondition === option ? theme.colors.primary : theme.colors.card,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text style={{ color: tradeCondition === option ? '#fff' : theme.colors.text, fontWeight: '700' }}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ marginTop: 16, color: theme.colors.textSoft }}>Your Price (£)</Text>
              <TextInput
                value={tradePrice}
                onChangeText={setTradePrice}
                placeholder="e.g. 5.00"
                keyboardType="decimal-pad"
                placeholderTextColor={theme.colors.textSoft}
                style={{
                  backgroundColor: theme.colors.card,
                  borderRadius: 12,
                  padding: 12,
                  marginTop: 6,
                  color: theme.colors.text,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              />

              {tradeCard && (
                <Text style={{ marginTop: 6, color: theme.colors.textSoft, fontSize: 13 }}>
                  Est. value: £{getEstimatedValue(tradeCard, tradeCondition).toFixed(2)}
                </Text>
              )}

              <Text style={{ marginTop: 16, color: theme.colors.textSoft }}>Notes (optional)</Text>
              <TextInput
                value={tradeNotes}
                onChangeText={setTradeNotes}
                placeholder="Any details..."
                placeholderTextColor={theme.colors.textSoft}
                multiline
                style={{
                  backgroundColor: theme.colors.card,
                  borderRadius: 12,
                  padding: 12,
                  marginTop: 6,
                  color: theme.colors.text,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
              />

              <TouchableOpacity
                onPress={() => setTradeOnly((prev) => !prev)}
                style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center' }}
              >
                <Text style={{ color: theme.colors.text }}>
                  {tradeOnly ? '☑ ' : '☐ '}Trade only (no selling)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  if (!tradeCard) return;
                  const estimated = getEstimatedValue(tradeCard, tradeCondition);
                  await createTradeListing({
                    cardId: tradeCard.card_id,
                    setId: tradeCard.set_id,
                    condition: tradeCondition,
                    askingPrice: tradePrice ? Number(tradePrice) : null,
                    marketEstimate: estimated,
                    tradeOnly,
                    hasDamage: tradeCondition === 'Damaged',
                    damageNotes: tradeCondition === 'Damaged' ? tradeNotes : null,
                    damageImageUrl: null,
                    listingNotes: tradeNotes,
                  });
                  setTradeModalVisible(false);
                  resetTradeModal();
                  await load();
                }}
                style={{
                  backgroundColor: theme.colors.primary,
                  borderRadius: 14,
                  padding: 14,
                  alignItems: 'center',
                  marginTop: 20,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>List Card</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setTradeModalVisible(false); resetTradeModal(); }}
                style={{ marginTop: 10, alignItems: 'center' }}
              >
                <Text style={{ color: theme.colors.textSoft }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ===============================
// SUB COMPONENTS
// ===============================

function Row({ label, value }: { label: string; value: string }) {
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