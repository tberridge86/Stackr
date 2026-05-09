import { theme } from '../../lib/theme';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  FlatList,
  TextInput,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Text } from '../../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchAllSets, fetchCardsForSet, PokemonCard, PokemonSet } from '../../lib/pokemonTcg';
import { supabase } from '../../lib/supabase';

// ===============================
// TYPES
// ===============================

type FilterType = 'all' | 'owned' | 'missing';
type SortType = 'number' | 'name' | 'rarity';

// ===============================
// MAIN COMPONENT
// ===============================

export default function SetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const setId = Array.isArray(id) ? id[0] : id;

  const [setInfo, setSetInfo] = useState<PokemonSet | null>(null);
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [loading, setLoading] = useState(true);

  // Owned card IDs from Supabase (across all binders)
  const [ownedCardIds, setOwnedCardIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('All');
  const [sort, setSort] = useState<SortType>('number');

  // ===============================
  // LOAD SET DATA
  // ===============================

  const loadSetData = useCallback(async () => {
    if (!setId) return;

    try {
      setLoading(true);

      const [allSets, fetchedCards] = await Promise.all([
        fetchAllSets(),
        fetchCardsForSet(setId),
      ]);

      const currentSet = allSets.find((s) => s.id === setId) ?? null;
      setSetInfo(currentSet);
      setCards(fetchedCards);

      // Load owned cards from Supabase
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Get all binders for this user
        const { data: binders } = await supabase
          .from('binders')
          .select('id')
          .eq('user_id', user.id);

        const binderIds = (binders ?? []).map((b) => b.id);

        if (binderIds.length > 0) {
          const { data: ownedRows } = await supabase
            .from('binder_cards')
            .select('card_id')
            .in('binder_id', binderIds)
            .eq('set_id', setId)
            .eq('owned', true);

          setOwnedCardIds(
            new Set((ownedRows ?? []).map((r) => r.card_id))
          );
        }
      }
    } catch (error) {
      console.log('Failed to load set data', error);
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => {
    loadSetData();
  }, [loadSetData]);

  // ===============================
  // FILTER + SORT
  // ===============================

  const rarities = useMemo(
    () => [
      'All',
      ...Array.from(
        new Set(cards.map((c) => c.rarity).filter(Boolean) as string[])
      ),
    ],
    [cards]
  );

  const filteredCards = useMemo(() => {
    let result = cards.filter((card) => {
      const owned = ownedCardIds.has(card.id);

      const matchesSearch =
        card.name.toLowerCase().includes(search.toLowerCase()) ||
        card.number.toLowerCase().includes(search.toLowerCase());

      const matchesFilter =
        filter === 'all' ||
        (filter === 'owned' && owned) ||
        (filter === 'missing' && !owned);

      const matchesRarity =
        selectedRarity === 'All' || card.rarity === selectedRarity;

      return matchesSearch && matchesFilter && matchesRarity;
    });

    if (sort === 'number') {
      result.sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
    } else if (sort === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'rarity') {
      result.sort((a, b) => (a.rarity ?? '').localeCompare(b.rarity ?? ''));
    }

    return result;
  }, [cards, ownedCardIds, search, filter, selectedRarity, sort]);

  const ownedCount = useMemo(
    () => cards.filter((c) => ownedCardIds.has(c.id)).length,
    [cards, ownedCardIds]
  );

  const progressPercent =
    setInfo?.total && setInfo.total > 0
      ? (ownedCount / setInfo.total) * 100
      : 0;

  // ===============================
  // RENDER CARD
  // ===============================

  const renderCard = useCallback(({ item: card }: { item: PokemonCard }) => {
    const owned = ownedCardIds.has(card.id);

    return (
      <TouchableOpacity
        onPress={() => router.push(`/card/${card.id}?setId=${setId}`)}
        activeOpacity={0.85}
        style={{
          width: '48%',
          backgroundColor: owned ? '#FFD166' : theme.colors.card,
          borderRadius: 18,
          padding: 12,
          borderWidth: 1,
          borderColor: owned ? '#FFD166' : theme.colors.border,
        }}
      >
        {/* Card number badge */}
        <View style={{
          alignSelf: 'flex-start',
          backgroundColor: owned ? 'rgba(0,0,0,0.12)' : theme.colors.surface,
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: 999,
          marginBottom: 10,
        }}>
          <Text style={{ color: owned ? '#0b0f2a' : theme.colors.textSoft, fontSize: 11, fontWeight: '800' }}>
            #{card.number}
          </Text>
        </View>

        {/* Card image */}
        {card.images?.small ? (
          <Image
            source={{ uri: card.images.small }}
            style={{ width: '100%', height: 150, marginBottom: 10, borderRadius: 12 }}
            resizeMode="contain"
          />
        ) : (
          <View style={{
            width: '100%', height: 150,
            marginBottom: 10, borderRadius: 12,
            backgroundColor: owned ? 'rgba(0,0,0,0.08)' : theme.colors.surface,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="image-outline" size={30} color={owned ? '#0b0f2a' : theme.colors.textSoft} />
            <Text style={{ color: owned ? '#0b0f2a' : theme.colors.textSoft, fontSize: 12, marginTop: 6 }}>
              No image
            </Text>
          </View>
        )}

        {/* Card name */}
        <Text
          numberOfLines={2}
          style={{ color: owned ? '#0b0f2a' : theme.colors.text, fontSize: 14, fontWeight: '800', marginBottom: 6, minHeight: 36 }}
        >
          {card.name}
        </Text>

        {/* Rarity */}
        <Text
          numberOfLines={1}
          style={{ color: owned ? 'rgba(11,15,42,0.6)' : theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginBottom: 10 }}
        >
          {card.rarity ?? 'Unknown'}
        </Text>

        {/* Owned pill */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: owned ? 'rgba(0,0,0,0.12)' : theme.colors.surface,
          borderRadius: 999,
          paddingVertical: 6,
          paddingHorizontal: 10,
          alignSelf: 'flex-start',
        }}>
          <Ionicons
            name={owned ? 'checkmark-circle' : 'ellipse-outline'}
            size={14}
            color={owned ? '#0b0f2a' : theme.colors.textSoft}
          />
          <Text style={{ color: owned ? '#0b0f2a' : theme.colors.textSoft, fontSize: 12, fontWeight: '800' }}>
            {owned ? 'Owned' : 'Missing'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [ownedCardIds, setId]);

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
      {/* Progress bar — always visible */}
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
            {ownedCount} / {setInfo.total}
          </Text>
        </View>
        <View style={{ height: 6, borderRadius: 999, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
          <View style={{
            width: `${progressPercent}%`,
            height: '100%',
            backgroundColor: '#FFD166',
            borderRadius: 999,
          }} />
        </View>
        <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 5 }}>
          {progressPercent.toFixed(1)}% complete
        </Text>
      </View>

      <FlatList
        data={filteredCards}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 12 }}
        renderItem={renderCard}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Back button + title */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{
                  width: 40, height: 40,
                  borderRadius: 12,
                  backgroundColor: theme.colors.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
              </TouchableOpacity>

              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>
                  {setInfo.name}
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
                  {setInfo.series} · {setInfo.total} cards
                </Text>
              </View>
            </View>

            {/* Create binder CTA */}
            <TouchableOpacity
              onPress={() => router.push({
                pathname: '/binder/new',
                params: { sourceSetId: setId, type: 'official' },
              })}
              style={{
                backgroundColor: theme.colors.primary,
                borderRadius: 14,
                paddingVertical: 13,
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
                + Create Binder for This Set
              </Text>
            </TouchableOpacity>

            {/* Search */}
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 12,
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
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {(['all', 'owned', 'missing'] as FilterType[]).map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setFilter(item)}
                  style={{
                    backgroundColor: filter === item ? '#FFD166' : theme.colors.card,
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: filter === item ? '#FFD166' : theme.colors.border,
                  }}
                >
                  <Text style={{
                    color: filter === item ? '#0b0f2a' : theme.colors.textSoft,
                    fontWeight: '700',
                    fontSize: 13,
                  }}>
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Sort chips */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {(['number', 'name', 'rarity'] as SortType[]).map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setSort(item)}
                  style={{
                    backgroundColor: sort === item ? theme.colors.primary : theme.colors.card,
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: sort === item ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <Text style={{
                    color: sort === item ? '#FFFFFF' : theme.colors.textSoft,
                    fontWeight: '700',
                    fontSize: 13,
                  }}>
                    {item === 'number' ? '#' : item === 'name' ? 'A–Z' : 'Rarity'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Rarity filter */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 10, marginBottom: 4 }}
            >
              {rarities.map((rarity) => (
                <TouchableOpacity
                  key={rarity}
                  onPress={() => setSelectedRarity(rarity)}
                  style={{
                    backgroundColor: selectedRarity === rarity
                      ? 'rgba(255,209,102,0.14)'
                      : theme.colors.card,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: selectedRarity === rarity ? '#FFD166' : theme.colors.border,
                  }}
                >
                  <Text style={{
                    color: selectedRarity === rarity ? '#FFD166' : theme.colors.textSoft,
                    fontWeight: '700',
                    fontSize: 12,
                  }}>
                    {rarity}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Results count */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 }}>
              <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                Cards
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                {filteredCards.length} shown
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>
              No cards match your filters.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}