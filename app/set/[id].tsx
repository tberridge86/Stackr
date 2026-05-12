import { useTheme } from '../../components/theme-context';
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

// Per-set variant overrides (e.g. for sets with multiple reverse holo patterns)
const SET_VARIANT_OVERRIDES: Record<string, Partial<Record<string, string[]>>> = {
  asc: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  ASC: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  me2pt5: {
    Common: ['normal', 'reverseHolofoil'],
    Uncommon: ['normal', 'reverseHolofoil'],
  },
};

function getVariants(card: PokemonCard, explicitSetId?: string): string[] {
  const setId = (explicitSetId ?? card.set?.id ?? '').toLowerCase();

  // 1. Check for hardcoded set overrides (e.g. Ascended Heroes 3-variant logic)
  const override = SET_VARIANT_OVERRIDES[setId] || SET_VARIANT_OVERRIDES[setId.toUpperCase()];
  if (override && card.rarity) {
    const r = card.rarity;
    const variants = override[r] ||
                     override[r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()] ||
                     override[r.toLowerCase()];
    if (variants) return variants;
  }

  // 2. Try to get variants from TCGPlayer price keys
  const prices = card.tcgplayer?.prices;
  const keys = Object.keys(prices ?? {}).filter(k => k !== 'unlimited');

  // Return multiple variants ONLY if they exist in the database data
  if (keys.length > 1) return keys;

  // 3. Default to single variant
  return keys.length > 0 ? [keys[0]] : ['normal'];
}

function shortVariant(key: string): string {
  return VARIANT_LABELS[key] ?? key.slice(0, 4);
}

// ===============================
// CARD ITEM
// ===============================

type CardItemProps = {
  card: PokemonCard;
  ownedVariants: Set<string>;
  setId: string;
  onToggleVariant: (cardId: string, variant: string) => void;
};

const CardItem = React.memo(({ card, ownedVariants, setId, onToggleVariant }: CardItemProps) => {
  const { theme } = useTheme();
  const variants = useMemo(() => getVariants(card, setId), [card, setId]);
  const anyOwned = variants.some((v) => ownedVariants.has(`${card.id}:${v}`));
  const allOwned = variants.every((v) => ownedVariants.has(`${card.id}:${v}`));
  const slicePct = 100 / variants.length;

  return (
    <View style={{
      width: '48%',
      borderRadius: 18,
      padding: 10,
      borderWidth: 1.5,
      backgroundColor: anyOwned ? '#FFF8E7' : theme.colors.card,
      borderColor: allOwned ? '#FFD166' : anyOwned ? 'rgba(255,209,102,0.5)' : theme.colors.border,
      marginBottom: 12,
    }}>
      {/* Header: number badge + detail arrow */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <View style={{
          backgroundColor: anyOwned ? 'rgba(255,209,102,0.2)' : theme.colors.surface,
          paddingVertical: 3,
          paddingHorizontal: 8,
          borderRadius: 999,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: anyOwned ? '#9A6C00' : theme.colors.textSoft }}>
            #{card.number}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push(`/card/${card.id}?setId=${setId}`)}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="arrow-up-circle-outline" size={18} color={theme.colors.textSoft} />
        </TouchableOpacity>
      </View>

      {/* Image + variant slices */}
      <View style={{ width: '100%', height: 148, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
        {card.images?.small ? (
          <Image
            source={{ uri: card.images.small }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, {
            backgroundColor: theme.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }]}>
            <Ionicons name="image-outline" size={28} color={theme.colors.textSoft} />
          </View>
        )}

        {variants.map((variant, i) => {
          const owned = ownedVariants.has(`${card.id}:${variant}`);
          return (
            <TouchableOpacity
              key={variant}
              onPress={() => onToggleVariant(card.id, variant)}
              activeOpacity={0.7}
              style={{
                position: 'absolute',
                left: `${slicePct * i}%` as any,
                width: `${slicePct}%` as any,
                top: 0,
                bottom: 0,
                backgroundColor: owned ? 'rgba(255,209,102,0.55)' : 'rgba(0,0,0,0.05)',
                borderLeftWidth: i > 0 ? 1 : 0,
                borderColor: 'rgba(255,255,255,0.4)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {owned && (
                <Ionicons name="checkmark-circle" size={22} color="#7A5200" />
              )}
              <View style={{ position: 'absolute', bottom: 3, alignItems: 'center' }}>
                {variant === 'reverseHoloEnergy' ? (
                  <Ionicons name="flash" size={11} color={owned ? '#7A5200' : 'rgba(255,255,255,0.9)'} />
                ) : variant === 'reverseHoloPokeball' ? (
                  <Ionicons name="aperture" size={11} color={owned ? '#7A5200' : 'rgba(255,255,255,0.9)'} />
                ) : (
                  <Text style={{
                    fontSize: 9,
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
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Name + rarity */}
      <Text numberOfLines={2} style={{
        fontSize: 13,
        fontWeight: '800',
        color: theme.colors.text,
        marginBottom: 4,
        minHeight: 34,
      }}>
        {card.name}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textSoft }}>
        {card.rarity ?? 'Unknown'}
      </Text>
    </View>
  );
});

// ===============================
// MAIN COMPONENT
// ===============================

export default function SetDetailScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const setId = Array.isArray(id) ? id[0] : id;

  const [setInfo, setSetInfo] = useState<PokemonSet | null>(null);
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownedVariants, setOwnedVariants] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('All');
  const [sort, setSort] = useState<SortType>('number');

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
        setUserId(user.id);
        const { data: variantRows } = await supabase
          .from('user_card_variants')
          .select('card_id, variant')
          .eq('user_id', user.id)
          .eq('set_id', setId);

        setOwnedVariants(new Set((variantRows ?? []).map((r) => `${r.card_id}:${r.variant}`)));
      }
    } catch (e) {
      console.log('Failed to load set data', e);
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => { loadSetData(); }, [loadSetData]);

  // ===============================
  // TOGGLE VARIANT
  // ===============================

  const handleToggleVariant = useCallback(async (cardId: string, variant: string) => {
    if (!userId) return;
    const key = `${cardId}:${variant}`;
    let removing = false;

    setOwnedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        removing = true;
      } else {
        next.add(key);
        removing = false;
      }
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
  }, [userId, setId]);

  // ===============================
  // FILTER + SORT
  // ===============================

  const rarities = useMemo(() => [
    'All',
    ...Array.from(new Set(cards.map((c) => c.rarity).filter(Boolean) as string[])),
  ], [cards]);

  const filteredCards = useMemo(() => {
    let result = cards.filter((card) => {
      const variants = getVariants(card, setId);
      const anyOwned = variants.some((v) => ownedVariants.has(`${card.id}:${v}`));
      const matchesSearch =
        card.name.toLowerCase().includes(search.toLowerCase()) ||
        card.number.toLowerCase().includes(search.toLowerCase());
      const matchesFilter =
        filter === 'all' ||
        (filter === 'owned' && anyOwned) ||
        (filter === 'missing' && !anyOwned);
      const matchesRarity = selectedRarity === 'All' || card.rarity === selectedRarity;
      return matchesSearch && matchesFilter && matchesRarity;
    });

    if (sort === 'number') result.sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
    else if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'rarity') result.sort((a, b) => (a.rarity ?? '').localeCompare(b.rarity ?? ''));

    return result;
  }, [cards, ownedVariants, search, filter, selectedRarity, sort]);

  const ownedCardCount = useMemo(() =>
    cards.filter((c) => getVariants(c, setId).some((v) => ownedVariants.has(`${c.id}:${v}`))).length,
    [cards, ownedVariants, setId]
  );

  const progressPercent = setInfo?.total && setInfo.total > 0
    ? (ownedCardCount / setInfo.total) * 100
    : 0;

  const renderCard = useCallback(({ item: card }: { item: PokemonCard }) => (
    <CardItem
      card={card}
      ownedVariants={ownedVariants}
      setId={setId ?? ''}
      onToggleVariant={handleToggleVariant}
    />
  ), [ownedVariants, setId, handleToggleVariant]);

  // ===============================
  // LOADING STATE
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
      <View style={{
        backgroundColor: theme.colors.card,
        marginHorizontal: 16,
        marginBottom: 6,
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>Collection Progress</Text>
          <Text style={{ color: '#FFD166', fontSize: 15, fontWeight: '900' }}>
            {ownedCardCount} / {setInfo.total}
          </Text>
        </View>
        <View style={{ height: 6, borderRadius: 999, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
          <View style={{
            height: '100%',
            backgroundColor: '#FFD166',
            borderRadius: 999,
            width: `${progressPercent}%` as any,
          }} />
        </View>
        <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 5 }}>
          {progressPercent.toFixed(1)}% complete
        </Text>
      </View>

      {/* Collapsible header */}
      <Animated.View style={{ opacity: headerOpacity, maxHeight: headerMaxHeight, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>

          <View style={{ marginBottom: 12, marginTop: 4 }}>
            <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>{setInfo.name}</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
              {setInfo.series} · {setInfo.total} cards
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push({ pathname: '/binder/new', params: { sourceSetId: setId, type: 'official' } })}
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: 14,
              paddingVertical: 13,
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>+ Create Binder for This Set</Text>
          </TouchableOpacity>

          {/* Search */}
          <View style={{
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
          }}>
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
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  backgroundColor: filter === item ? '#FFD166' : theme.colors.card,
                  borderColor: filter === item ? '#FFD166' : theme.colors.border,
                }}
              >
                <Text style={{ fontWeight: '700', fontSize: 13, color: filter === item ? '#0b0f2a' : theme.colors.textSoft }}>
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
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  backgroundColor: sort === item ? theme.colors.primary : theme.colors.card,
                  borderColor: sort === item ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text style={{ fontWeight: '700', fontSize: 13, color: sort === item ? '#FFFFFF' : theme.colors.textSoft }}>
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
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  backgroundColor: selectedRarity === rarity ? 'rgba(255,209,102,0.14)' : theme.colors.card,
                  borderColor: selectedRarity === rarity ? '#FFD166' : theme.colors.border,
                }}
              >
                <Text style={{ fontWeight: '700', fontSize: 13, color: selectedRarity === rarity ? '#FFD166' : theme.colors.textSoft }}>
                  {rarity}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Animated.View>

      {/* Card grid */}
      <FlatList
        data={filteredCards}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
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
