import { theme } from '../../lib/theme';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Animated,
  View,
  FlatList,
  TextInput,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Text } from '../../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchAllSets, fetchCardsForSet, PokemonCard, PokemonSet } from '../../lib/pokemonTcg';
import { supabase } from '../../lib/supabase';

type FilterType = 'all' | 'owned' | 'missing';
type SortType = 'number' | 'name' | 'rarity';

// ===============================
// CARD ITEM — memoised to avoid re-renders
// ===============================

type CardItemProps = {
  card: PokemonCard;
  owned: boolean;
  setId: string;
};

const CardItem = React.memo(({ card, owned, setId }: CardItemProps) => (
  <TouchableOpacity
    onPress={() => router.push(`/card/${card.id}?setId=${setId}`)}
    activeOpacity={0.85}
    style={[styles.cardItem, { backgroundColor: owned ? '#FFD166' : theme.colors.card, borderColor: owned ? '#FFD166' : theme.colors.border }]}
  >
    <View style={[styles.numberBadge, { backgroundColor: owned ? 'rgba(0,0,0,0.12)' : theme.colors.surface }]}>
      <Text style={[styles.numberText, { color: owned ? '#0b0f2a' : theme.colors.textSoft }]}>#{card.number}</Text>
    </View>

    {card.images?.small ? (
      <Image source={{ uri: card.images.small }} style={styles.cardImage} resizeMode="contain" />
    ) : (
      <View style={[styles.cardImagePlaceholder, { backgroundColor: owned ? 'rgba(0,0,0,0.08)' : theme.colors.surface }]}>
        <Ionicons name="image-outline" size={30} color={owned ? '#0b0f2a' : theme.colors.textSoft} />
        <Text style={[styles.placeholderText, { color: owned ? '#0b0f2a' : theme.colors.textSoft }]}>No image</Text>
      </View>
    )}

    <Text numberOfLines={2} style={[styles.cardName, { color: owned ? '#0b0f2a' : theme.colors.text }]}>{card.name}</Text>
    <Text numberOfLines={1} style={[styles.cardRarity, { color: owned ? 'rgba(11,15,42,0.6)' : theme.colors.textSoft }]}>{card.rarity ?? 'Unknown'}</Text>

    <View style={[styles.ownedPill, { backgroundColor: owned ? 'rgba(0,0,0,0.12)' : theme.colors.surface }]}>
      <Ionicons name={owned ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={owned ? '#0b0f2a' : theme.colors.textSoft} />
      <Text style={[styles.ownedText, { color: owned ? '#0b0f2a' : theme.colors.textSoft }]}>{owned ? 'Owned' : 'Missing'}</Text>
    </View>
  </TouchableOpacity>
));

// ===============================
// MAIN COMPONENT
// ===============================

export default function SetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const setId = Array.isArray(id) ? id[0] : id;

  const [setInfo, setSetInfo] = useState<PokemonSet | null>(null);
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownedCardIds, setOwnedCardIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('All');
  const [sort, setSort] = useState<SortType>('number');

  // Scroll-aware header — driven directly from scroll position
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerOpacity = scrollY.interpolate({ inputRange: [0, 60], outputRange: [1, 0], extrapolate: 'clamp' });
  const headerMaxHeight = scrollY.interpolate({ inputRange: [0, 60], outputRange: [600, 0], extrapolate: 'clamp' });

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false }
  );

  // ===============================
  // LOAD DATA
  // ===============================

  const loadSetData = useCallback(async () => {
    if (!setId) return;
    try {
      setLoading(true);
      const [allSets, fetchedCards] = await Promise.all([fetchAllSets(), fetchCardsForSet(setId)]);
      const currentSet = allSets.find((s) => s.id === setId) ?? null;
      setSetInfo(currentSet);
      setCards(fetchedCards);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: binders } = await supabase.from('binders').select('id').eq('user_id', user.id);
        const binderIds = (binders ?? []).map((b) => b.id);
        if (binderIds.length > 0) {
          const { data: ownedRows } = await supabase
            .from('binder_cards').select('card_id')
            .in('binder_id', binderIds).eq('set_id', setId).eq('owned', true);
          setOwnedCardIds(new Set((ownedRows ?? []).map((r) => r.card_id)));
        }
      }
    } catch (e) {
      console.log('Failed to load set data', e);
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => { loadSetData(); }, [loadSetData]);

  // ===============================
  // FILTER + SORT
  // ===============================

  const rarities = useMemo(() => ['All', ...Array.from(new Set(cards.map((c) => c.rarity).filter(Boolean) as string[]))], [cards]);

  const filteredCards = useMemo(() => {
    let result = cards.filter((card) => {
      const owned = ownedCardIds.has(card.id);
      const matchesSearch = card.name.toLowerCase().includes(search.toLowerCase()) || card.number.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || (filter === 'owned' && owned) || (filter === 'missing' && !owned);
      const matchesRarity = selectedRarity === 'All' || card.rarity === selectedRarity;
      return matchesSearch && matchesFilter && matchesRarity;
    });

    if (sort === 'number') result.sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
    else if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'rarity') result.sort((a, b) => (a.rarity ?? '').localeCompare(b.rarity ?? ''));

    return result;
  }, [cards, ownedCardIds, search, filter, selectedRarity, sort]);

  const ownedCount = useMemo(() => cards.filter((c) => ownedCardIds.has(c.id)).length, [cards, ownedCardIds]);
  const progressPercent = setInfo?.total && setInfo.total > 0 ? (ownedCount / setInfo.total) * 100 : 0;

  const renderCard = useCallback(({ item: card }: { item: PokemonCard }) => (
    <CardItem card={card} owned={ownedCardIds.has(card.id)} setId={setId ?? ''} />
  ), [ownedCardIds, setId]);

  // ===============================
  // LOADING
  // ===============================

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>Loading set...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!setInfo) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Set not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>

      {/* Progress bar — always pinned */}
      <View style={styles.progressCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>Collection Progress</Text>
          <Text style={{ color: '#FFD166', fontSize: 15, fontWeight: '900' }}>{ownedCount} / {setInfo.total}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
        </View>
        <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 5 }}>{progressPercent.toFixed(1)}% complete</Text>
      </View>

      {/* Collapsible header — fades + collapses as you scroll down */}
      <Animated.View style={{ opacity: headerOpacity, maxHeight: headerMaxHeight, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>

          {/* Title */}
          <View style={{ marginBottom: 12, marginTop: 4 }}>
            <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>{setInfo.name}</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>{setInfo.series} · {setInfo.total} cards</Text>
          </View>

          {/* Create binder CTA */}
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/binder/new', params: { sourceSetId: setId, type: 'official' } })}
            style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginBottom: 12 }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>+ Create Binder for This Set</Text>
          </TouchableOpacity>

          {/* Search */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={theme.colors.textSoft} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search cards..."
              placeholderTextColor={theme.colors.textSoft}
              style={{ flex: 1, color: theme.colors.text, fontSize: 15 }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textSoft} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter chips */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {(['all', 'owned', 'missing'] as FilterType[]).map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setFilter(item)}
                style={[styles.chip, { backgroundColor: filter === item ? '#FFD166' : theme.colors.card, borderColor: filter === item ? '#FFD166' : theme.colors.border }]}
              >
                <Text style={[styles.chipText, { color: filter === item ? '#0b0f2a' : theme.colors.textSoft }]}>
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Sort chips */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {(['number', 'name', 'rarity'] as SortType[]).map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setSort(item)}
                style={[styles.chip, { backgroundColor: sort === item ? theme.colors.primary : theme.colors.card, borderColor: sort === item ? theme.colors.primary : theme.colors.border }]}
              >
                <Text style={[styles.chipText, { color: sort === item ? '#FFFFFF' : theme.colors.textSoft }]}>
                  {item === 'number' ? '#' : item === 'name' ? 'A–Z' : 'Rarity'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Rarity scroll */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {rarities.map((rarity) => (
              <TouchableOpacity
                key={rarity}
                onPress={() => setSelectedRarity(rarity)}
                style={[styles.chip, {
                  backgroundColor: selectedRarity === rarity ? 'rgba(255,209,102,0.14)' : theme.colors.card,
                  borderColor: selectedRarity === rarity ? '#FFD166' : theme.colors.border,
                }]}
              >
                <Text style={[styles.chipText, { color: selectedRarity === rarity ? '#FFD166' : theme.colors.textSoft }]}>{rarity}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Animated.View>

      {/* Card list */}
      <FlatList
        data={filteredCards}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 12 }}
        renderItem={renderCard}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={12}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Cards</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>{filteredCards.length} shown</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>No cards match your filters.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    backgroundColor: theme.colors.card,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFD166',
    borderRadius: 999,
  },
  searchBar: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontWeight: '700',
    fontSize: 13,
  },
  cardItem: {
    width: '48%',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
  },
  numberBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    marginBottom: 10,
  },
  numberText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardImage: {
    width: '100%',
    height: 150,
    marginBottom: 10,
    borderRadius: 12,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 150,
    marginBottom: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 12,
    marginTop: 6,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
    minHeight: 36,
  },
  cardRarity: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  ownedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  ownedText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
