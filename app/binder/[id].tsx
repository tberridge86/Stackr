import { theme } from '../../lib/theme';
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams , Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import {
  BinderCardRecord,
  BinderRecord,
  addCardsToBinder,
  fetchBinderById,
  fetchBinderCards,
  updateBinderCardOwned,
} from '../../lib/binders';
import {
  getCachedCardSync,
  getCachedCardsForSet,
} from '../../lib/pokemonTcgCache';
import { useTrade } from '../../components/trade-context';
import { supabase } from '../../lib/supabase';

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

const screenHeight = Dimensions.get('window').height;

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const getSetIdFromCardId = (cardId: string) => {
  const parts = cardId.split('-');
  return parts.length > 1 ? parts[0] : '';
};

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return '--';
  return `£${value.toFixed(2)}`;
};

export default function BinderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const binderId = Array.isArray(id) ? id[0] : id;

  const [binder, setBinder] = useState<BinderRecord | null>(null);
  const [cards, setCards] = useState<BinderCardWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const [sortMode, setSortMode] = useState<SortMode>('binder');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  const [selectedCard, setSelectedCard] =
    useState<BinderCardWithDetails | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const [showcaseRows, setShowcaseRows] = useState<ShowcaseRow[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addSearchResults, setAddSearchResults] = useState<CardPreviewResult[]>(
    []
  );
  const [addSearchLoading, setAddSearchLoading] = useState(false);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);

  const modalTranslateY = useRef(new Animated.Value(0)).current;
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);

  const imageScale = Animated.multiply(baseScale, pinchScale);

  const { toggleTradeCard, toggleWishlistCard, isForTrade, isWanted } =
    useTrade();

  const sortOptions: { label: string; value: SortMode }[] = [
    { label: 'Binder order', value: 'binder' },
    { label: 'Name', value: 'name' },
    { label: 'Owned first', value: 'owned' },
    { label: 'Missing first', value: 'missing' },
    { label: 'Number', value: 'number' },
  ];

  const currentSortLabel =
    sortOptions.find((option) => option.value === sortMode)?.label ??
    'Binder order';

  const closeDetailModal = () => {
    setDetailVisible(false);
    modalTranslateY.setValue(0);
    baseScale.setValue(1);
    pinchScale.setValue(1);
    lastScale.current = 1;
  };

  const handleScanCard = async () => {
 Alert.alert(
    'Coming soon',
    'Card scanning is built into the app architecture, but this feature is coming soon.'
  );



  return;


    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'Please allow camera access.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setScanning(true);

      console.log('Captured image:', result.assets[0].uri);

      Alert.alert(
        'Photo captured',
        'Camera capture is working. Next step is uploading this image so Ximilar can scan it.'
      );
    } catch (error) {
      console.log('Scan failed', error);
      Alert.alert('Scan failed', 'Could not scan this card.');
    } finally {
      setScanning(false);
    }
  };

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
          Animated.spring(modalTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
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

  const load = async () => {
    if (!binderId) return;

    try {
      setLoading(true);

      const binderData = await fetchBinderById(binderId);
      setBinder(binderData);

      const binderCards = await fetchBinderCards(binderId);
      const withDetails: BinderCardWithDetails[] = [];

      for (const binderCard of binderCards) {
        let found = getCachedCardSync(binderCard.set_id, binderCard.card_id);

        if (!found) {
          const setCards = await getCachedCardsForSet(binderCard.set_id);
          found =
            setCards.find((card) => card.id === binderCard.card_id) ?? null;
        }

        withDetails.push({
          ...binderCard,
          card: found,
        });
      }

      setCards(withDetails);

      const {
        data: { user },
      } = await supabase.auth.getUser();

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
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [binderId])
  );

  const sortedCards = useMemo(() => {
    const next = [...cards];

    if (sortMode === 'binder') {
      return next.sort((a, b) => a.slot_order - b.slot_order);
    }

    if (sortMode === 'name') {
      return next.sort((a, b) =>
        String(a.card?.name ?? a.card_id).localeCompare(
          String(b.card?.name ?? b.card_id)
        )
      );
    }

    if (sortMode === 'owned') {
      return next.sort((a, b) => Number(b.owned) - Number(a.owned));
    }

    if (sortMode === 'missing') {
      return next.sort((a, b) => Number(a.owned) - Number(b.owned));
    }

    if (sortMode === 'number') {
      return next.sort((a, b) =>
        String(a.card?.number ?? a.card_id).localeCompare(
          String(b.card?.number ?? b.card_id),
          undefined,
          { numeric: true }
        )
      );
    }

    return next;
  }, [cards, sortMode]);

  const ownedCount = cards.filter((card) => card.owned).length;
  const totalCount = cards.length;
  const progressPercent = totalCount
    ? Math.round((ownedCount / totalCount) * 100)
    : 0;

  const getShowcaseItems = (type: ShowcaseType) => {
    return showcaseRows
      .filter((row) => row.showcase_type === type)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row) =>
        cards.find(
          (card) => card.card_id === row.card_id && card.set_id === row.set_id
        )
      )
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

  const toggleShowcase = async (
    item: BinderCardWithDetails,
    type: ShowcaseType
  ) => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

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

      const currentRows = showcaseRows.filter(
        (row) => row.showcase_type === type
      );

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
      Alert.alert(
        'Could not update showcase',
        error?.message ?? 'Something went wrong.'
      );
    }
  };

  const reorderShowcase = async (
    type: ShowcaseType,
    orderedItems: BinderCardWithDetails[]
  ) => {
    const rowsForType = showcaseRows.filter(
      (row) => row.showcase_type === type
    );

    const updatedRows = rowsForType.map((row) => {
      const nextIndex = orderedItems.findIndex(
        (item) => item.card_id === row.card_id && item.set_id === row.set_id
      );

      return {
        ...row,
        sort_order: nextIndex >= 0 ? nextIndex : row.sort_order,
      };
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

  const openCardDetail = (item: BinderCardWithDetails) => {
    const latestCard = cards.find((card) => card.id === item.id) ?? item;
    setSelectedCard(latestCard);
    setDetailVisible(true);
  };

  const handleCardPress = async (item: BinderCardWithDetails) => {
    const newOwned = !item.owned;

    setCards((prev) =>
      prev.map((card) =>
        card.id === item.id ? { ...card, owned: newOwned } : card
      )
    );

    if (selectedCard?.id === item.id) {
      setSelectedCard({ ...item, owned: newOwned });
    }

    try {
      await updateBinderCardOwned(item.id, newOwned);
    } catch (error) {
      console.log('Rollback owned toggle', error);

      setCards((prev) =>
        prev.map((card) =>
          card.id === item.id ? { ...card, owned: !newOwned } : card
        )
      );

      Alert.alert('Error', 'Failed to update card.');
    }
  };

  const searchCardsToAdd = async (query: string) => {
    setAddSearch(query);

    if (query.trim().length < 2) {
      setAddSearchResults([]);
      return;
    }

    try {
      setAddSearchLoading(true);

      const safeQuery = query.trim();

      const response = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=name:*${encodeURIComponent(
          safeQuery
        )}*&pageSize=30`
      );

      const json = await response.json();

      const results = (json.data ?? []).map((card: any) => ({
        card_id: card.id,
        name: card.name,
        set_name: card.set?.name ?? null,
        image_url: card.images?.small ?? card.images?.large ?? null,
      }));

      setAddSearchResults(results);

      if (results.length > 0) {
        const rows = results.map((card: CardPreviewResult) => ({
          card_id: card.card_id,
          name: card.name,
          set_name: card.set_name ?? null,
          image_url: card.image_url ?? null,
        }));

        const { error: cacheError } = await supabase
          .from('card_previews')
          .upsert(rows, { onConflict: 'card_id' });

        if (cacheError) {
          console.log('Card preview cache failed', cacheError);
        }
      }
    } catch (error) {
      console.log('Failed to search cards', error);
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

      await addCardsToBinder(binderId, [
        {
          cardId: card.card_id,
          setId: derivedSetId,
        },
      ]);

      setShowAddModal(false);
      setAddSearch('');
      setAddSearchResults([]);

      await load();

      Alert.alert('Added', `${card.name} has been added as missing.`);
    } catch (error: any) {
      console.log('Failed to add card to custom binder', error);
      Alert.alert(
        'Could not add card',
        error?.message ?? 'Something went wrong.'
      );
    } finally {
      setAddingCardId(null);
    }
  };

  const renderToploaderCard = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<BinderCardWithDetails>) => {
    const imageUri = item.card?.images?.small ?? item.card?.images?.large ?? null;

    return (
      <TouchableOpacity
        onPress={() => openCardDetail(item)}
        onLongPress={drag}
        activeOpacity={0.9}
        style={{
          width: 120,
          marginRight: 14,
          opacity: isActive ? 0.75 : 1,
        }}
      >
        <View
          style={{
            padding: 5,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: item.owned
              ? theme.colors.secondary
              : theme.colors.border,
            backgroundColor: theme.colors.card,
            ...cardShadow,
          }}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{
                width: '100%',
                aspectRatio: 0.72,
                borderRadius: 7,
                opacity: item.owned ? 1 : 0.35,
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: '100%',
                aspectRatio: 0.72,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surface,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: theme.colors.textSoft, fontSize: 10 }}>
                No image
              </Text>
            </View>
          )}

          <View
            style={{
              position: 'absolute',
              left: 7,
              right: 7,
              top: 7,
              bottom: 7,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.7)',
            }}
          />
        </View>

        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.text,
            fontSize: 11,
            fontWeight: '900',
            textAlign: 'center',
            marginTop: 7,
          }}
        >
          {item.card?.name ?? item.card_id}
        </Text>

        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.textSoft,
            fontSize: 9,
            textAlign: 'center',
            marginTop: 2,
          }}
        >
          Hold to drag
        </Text>
      </TouchableOpacity>
    );
  };

  const renderShowcaseStrip = (type: ShowcaseType, title: string) => {
    const data = getShowcaseItems(type);

    if (!data.length) return null;

    return (
      <View style={{ marginBottom: 24, zIndex: 0 }}>
        <Text
          style={{
            color: type === 'favorite' ? theme.colors.secondary : '#FF8FA3',
            fontSize: 18,
            fontWeight: '900',
            marginBottom: 10,
          }}
        >
          {title}
        </Text>

        <DraggableFlatList
          data={data}
          horizontal
          keyExtractor={(item) => `${type}-${item.set_id}-${item.card_id}`}
          renderItem={renderToploaderCard}
          onDragEnd={({ data: newData }) => reorderShowcase(type, newData)}
          showsHorizontalScrollIndicator={false}
        />
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
        <View
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 20,
            flexDirection: 'row',
            gap: 4,
          }}
        >
          <TouchableOpacity
            onPress={(event) => {
              event.stopPropagation();
              toggleShowcase(item, 'favorite');
            }}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: favorite ? theme.colors.secondary : '#FFFFFF',
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: favorite ? theme.colors.text : theme.colors.secondary,
                fontWeight: '900',
              }}
            >
              ★
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={(event) => {
              event.stopPropagation();
              toggleShowcase(item, 'chase');
            }}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: chase ? '#FF8FA3' : '#FFFFFF',
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: chase ? theme.colors.text : '#FF8FA3',
                fontWeight: '900',
              }}
            >
              ♦
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={{
            width: '100%',
            aspectRatio: 0.72,
            borderRadius: 10,
            backgroundColor: theme.colors.surface,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ color: theme.colors.textSoft, fontSize: 10 }}>
              No image
            </Text>
          )}
        </View>

        <Text
          numberOfLines={2}
          style={{
            color: theme.colors.text,
            fontSize: 11,
            fontWeight: '900',
            marginTop: 6,
            minHeight: 28,
          }}
        >
          {cardName}
        </Text>

        {(forTrade || wanted) && (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 5 }}>
            {forTrade && (
              <Text
                style={{ color: '#16A34A', fontSize: 10, fontWeight: '900' }}
              >
                Trade
              </Text>
            )}
            {wanted && (
              <Text
                style={{
                  color: theme.colors.secondary,
                  fontSize: 10,
                  fontWeight: '900',
                }}
              >
                Want
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
  <>
    <Stack.Screen options={{ headerShown: false }} />
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
            Loading binder...
          </Text>
        </View>
      </SafeAreaView>
</>
);
  }

  if (!binder) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 20,
              fontWeight: '900',
            }}
          >
            Binder not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const modalCard = selectedCard?.card;
  const modalForTrade = selectedCard
    ? isForTrade(selectedCard.card_id, selectedCard.set_id)
    : false;
  const modalWanted = selectedCard
    ? isWanted(selectedCard.card_id, selectedCard.set_id)
    : false;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}
        >
          
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.text,
                fontSize: 24,
                fontWeight: '900',
              }}
            >
              {binder.name}
            </Text>
            <Text style={{ color: theme.colors.textSoft, marginTop: 4 }}>
              {ownedCount} / {totalCount} owned · {progressPercent}%
            </Text>
          </View>
        </View>

        <View
          style={{
            height: 9,
            borderRadius: 999,
            backgroundColor: theme.colors.surface,
            overflow: 'hidden',
            marginBottom: 16,
          }}
        >
          <View
            style={{
              width: totalCount ? `${(ownedCount / totalCount) * 100}%` : '0%',
              height: '100%',
              backgroundColor: binder.color || theme.colors.primary,
              borderRadius: 999,
            }}
          />
        </View>

        {renderShowcaseStrip('favorite', 'Favourite Top Loaders')}
        {renderShowcaseStrip('chase', 'Chase Cards')}

        <TouchableOpacity
          onPress={handleScanCard}
          disabled={scanning}
          style={{
            backgroundColor: theme.colors.secondary,
            borderRadius: 14,
            paddingVertical: 13,
            alignItems: 'center',
            marginBottom: 12,
            opacity: scanning ? 0.6 : 1,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
            {scanning ? 'Scanning...' : 'Scan Card'}
          </Text>
        </TouchableOpacity>

        {binder.type === 'custom' && (
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
            <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
              + Add Card to Binder
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ marginBottom: 14, zIndex: 20 }}>
          <Text
            style={{
              color: theme.colors.textSoft,
              fontSize: 12,
              fontWeight: '900',
              marginBottom: 6,
            }}
          >
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
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
              {currentSortLabel}
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontWeight: '900' }}>
              {sortDropdownOpen ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {sortDropdownOpen && (
            <View
              style={{
                marginTop: 8,
                backgroundColor: theme.colors.card,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: 'hidden',
              }}
            >
              {sortOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => {
                    setSortMode(option.value);
                    setSortDropdownOpen(false);
                  }}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor:
                      sortMode === option.value
                        ? theme.colors.secondary
                        : theme.colors.card,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontWeight: '900',
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <FlatList
          data={sortedCards}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          numColumns={3}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 130 }}
        />
      </View>

      <Modal visible={showAddModal} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
          <View style={{ padding: 16, flex: 1 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 22,
                fontWeight: '900',
              }}
            >
              Add Card
            </Text>

            <TextInput
              placeholder="Search by card name, set or card ID..."
              placeholderTextColor={theme.colors.textSoft}
              value={addSearch}
              onChangeText={searchCardsToAdd}
              style={{
                backgroundColor: theme.colors.card,
                color: theme.colors.text,
                borderRadius: 14,
                padding: 14,
                marginVertical: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            />

            {addSearchLoading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <FlatList
                data={addSearchResults}
                keyExtractor={(item) =>
                  `${getSetIdFromCardId(item.card_id)}-${item.card_id}`
                }
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const derivedSetId = getSetIdFromCardId(item.card_id);

                  const alreadyInBinder = cards.some(
                    (card) =>
                      card.card_id === item.card_id &&
                      card.set_id === derivedSetId
                  );

                  return (
                    <TouchableOpacity
                      onPress={() => {
                        if (alreadyInBinder) {
                          Alert.alert(
                            'Already added',
                            'This card is already in this binder.'
                          );
                          return;
                        }

                        handleAddCardToCustomBinder(item);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: theme.colors.card,
                        borderRadius: 14,
                        padding: 10,
                        marginBottom: 10,
                        opacity: alreadyInBinder ? 0.55 : 1,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        ...cardShadow,
                      }}
                    >
                      {item.image_url ? (
                        <Image
                          source={{ uri: item.image_url }}
                          style={{
                            width: 50,
                            height: 70,
                            borderRadius: 6,
                            backgroundColor: theme.colors.surface,
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 50,
                            height: 70,
                            borderRadius: 6,
                            backgroundColor: theme.colors.surface,
                          }}
                        />
                      )}

                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text
                          numberOfLines={1}
                          style={{ color: theme.colors.text, fontWeight: '900' }}
                        >
                          {item.name}
                        </Text>
                        <Text
                          style={{
                            color: theme.colors.textSoft,
                            fontSize: 12,
                          }}
                        >
                          {item.set_name ?? derivedSetId}
                        </Text>
                      </View>

                      {addingCardId === item.card_id ? (
                        <ActivityIndicator color={theme.colors.primary} size="small" />
                      ) : (
                        <Text
                          style={{
                            color: alreadyInBinder
                              ? theme.colors.secondary
                              : theme.colors.primary,
                            fontWeight: '900',
                          }}
                        >
                          {alreadyInBinder ? 'Added' : 'Add'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity
              onPress={() => setShowAddModal(false)}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 14,
                padding: 14,
                alignItems: 'center',
                marginTop: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDetailModal}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(27,42,75,0.35)' }}>
          <BlurView intensity={45} tint="light" style={{ flex: 1 }}>
            <Pressable
              onPress={closeDetailModal}
              style={{
                position: 'absolute',
                inset: 0,
              }}
            />

            <Animated.View
              {...modalPanResponder.panHandlers}
              style={{
                flex: 1,
                transform: [{ translateY: modalTranslateY }],
              }}
            >
              <SafeAreaView style={{ flex: 1 }}>
                <View
                  style={{
                    alignItems: 'center',
                    paddingTop: 6,
                    paddingBottom: 4,
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 5,
                      borderRadius: 999,
                      backgroundColor: 'rgba(27,42,75,0.35)',
                    }}
                  />
                </View>

                <TouchableOpacity
                  onPress={closeDetailModal}
                  style={{
                    position: 'absolute',
                    top: 46,
                    right: 16,
                    zIndex: 50,
                    backgroundColor: theme.colors.card,
                    borderRadius: 999,
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                    Close
                  </Text>
                </TouchableOpacity>

                {selectedCard ? (
                  <ScrollView
                    contentContainerStyle={{
                      padding: 16,
                      paddingTop: 42,
                      paddingBottom: 40,
                    }}
                    showsVerticalScrollIndicator={false}
                  >
                    <PinchGestureHandler
                      onGestureEvent={onPinchGestureEvent}
                      onHandlerStateChange={onPinchHandlerStateChange}
                    >
                      <Animated.Image
                        source={{
                          uri:
                            modalCard?.images?.large ??
                            modalCard?.images?.small ??
                            undefined,
                        }}
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

                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: 26,
                        fontWeight: '900',
                        marginTop: 18,
                      }}
                    >
                      {modalCard?.name ?? selectedCard.card_id}
                    </Text>

                    <Text style={{ color: theme.colors.textSoft, marginTop: 6 }}>
                      {modalCard?.set?.name ?? selectedCard.set_id}
                      {modalCard?.number ? ` · #${modalCard.number}` : ''}
                    </Text>

                    <View style={boxStyle}>
                      <Text style={boxTitleStyle}>Market Value</Text>

                      <Row
                        label="eBay"
                        value={formatCurrency(selectedCard?.ebay_price)}
                      />

                      <Row
                        label="TCG"
                        value={formatCurrency(selectedCard?.tcg_price)}
                      />

                      <Row
                        label="CardMarket"
                        value={formatCurrency(selectedCard?.cardmarket_price)}
                      />

                      <Text
                        style={{
                          color: theme.colors.textSoft,
                          fontSize: 11,
                          marginTop: 8,
                        }}
                      >
                        Updated daily
                      </Text>
                    </View>

                    <View style={boxStyle}>
                      <Text style={boxTitleStyle}>Card Actions</Text>

                      <ActionButton
                        label={
                          selectedCard.owned
                            ? 'Mark as missing'
                            : 'Mark as owned'
                        }
                        active={selectedCard.owned}
                        onPress={() => handleCardPress(selectedCard)}
                      />

                      <ActionButton
                        label={
                          isShowcased(selectedCard, 'favorite')
                            ? 'Remove favourite top loader'
                            : 'Add to favourite top loaders'
                        }
                        active={isShowcased(selectedCard, 'favorite')}
                        onPress={() => toggleShowcase(selectedCard, 'favorite')}
                      />

                      <ActionButton
                        label={
                          isShowcased(selectedCard, 'chase')
                            ? 'Remove chase card'
                            : 'Add to chase cards'
                        }
                        active={isShowcased(selectedCard, 'chase')}
                        onPress={() => toggleShowcase(selectedCard, 'chase')}
                      />

                      <ActionButton
                        label={
                          modalForTrade ? 'Remove from trade' : 'Mark for trade'
                        }
                        active={modalForTrade}
                        onPress={async () => {
                          await toggleTradeCard(
                            selectedCard.card_id,
                            selectedCard.set_id
                          );
                          await load();
                        }}
                      />

                      <ActionButton
                        label={
                          modalWanted
                            ? 'Remove from wishlist'
                            : 'Add to wishlist'
                        }
                        active={modalWanted}
                        onPress={() =>
                          toggleWishlistCard(
                            selectedCard.card_id,
                            selectedCard.set_id
                          )
                        }
                      />
                    </View>
                  </ScrollView>
                ) : null}
              </SafeAreaView>
            </Animated.View>
          </BlurView>
        </View>
      </Modal>
        </SafeAreaView>
  </>
);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
      }}
    >
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
      <Text
        style={{
          color: active ? '#FFFFFF' : theme.colors.text,
          fontWeight: '900',
          textAlign: 'center',
        }}
      >
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