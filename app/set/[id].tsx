import { theme } from '../../lib/theme';
import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAllSets, fetchCardsForSet, PokemonCard, PokemonSet } from '../../lib/pokemonTcg';

type FilterType = 'all' | 'owned' | 'missing';
type SortType = 'number' | 'name' | 'rarity';

export default function SetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [setInfo, setSetInfo] = useState<PokemonSet | null>(null);
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [ownedCards, setOwnedCards] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('All');
  const [sort, setSort] = useState<SortType>('number');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!id) return;

    const loadSetData = async () => {
      try {
        const [allSets, fetchedCards] = await Promise.all([
          fetchAllSets(),
          fetchCardsForSet(id),
        ]);

        const currentSet = allSets.find((s) => s.id === id) ?? null;

        setSetInfo(currentSet);
        setCards(fetchedCards);
      } catch (error) {
        console.log('Failed to fetch set data', error);
      } finally {
        setLoading(false);
      }
    };

    loadSetData();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const loadOwnedCards = async () => {
      try {
        const saved = await AsyncStorage.getItem(`ownedCards:${id}`);
        if (saved) {
          setOwnedCards(JSON.parse(saved));
        }
      } catch (error) {
        console.log('Failed to load owned cards', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadOwnedCards();
  }, [id]);

  useEffect(() => {
    if (!id || !isLoaded) return;

    const saveOwnedCards = async () => {
      try {
        await AsyncStorage.setItem(`ownedCards:${id}`, JSON.stringify(ownedCards));
      } catch (error) {
        console.log('Failed to save owned cards', error);
      }
    };

    saveOwnedCards();
  }, [ownedCards, id, isLoaded]);

  const rarities = useMemo(
    () => ['All', ...Array.from(new Set(cards.map((card) => card.rarity).filter(Boolean) as string[]))],
    [cards]
  );

  const filteredCards = useMemo(() => {
    let result = cards.filter((card) => {
      const owned = ownedCards.includes(card.id);

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
      result.sort((a, b) => {
        const numA = parseInt(a.number, 10) || 0;
        const numB = parseInt(b.number, 10) || 0;
        return numA - numB;
      });
    }

    if (sort === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (sort === 'rarity') {
      result.sort((a, b) => (a.rarity ?? '').localeCompare(b.rarity ?? ''));
    }

    return result;
  }, [cards, ownedCards, search, filter, selectedRarity, sort]);

  const toggleOwned = (cardId: string) => {
    setOwnedCards((prev) =>
      prev.includes(cardId)
        ? prev.filter((existingId) => existingId !== cardId)
        : [...prev, cardId]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.heading}>Loading set...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!setInfo) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.heading}>Set not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const ownedCount = ownedCards.length;
  const progressPercent =
    setInfo.total > 0 ? (ownedCount / setInfo.total) * 100 : 0;

  const renderCard = ({ item: card }: { item: PokemonCard }) => {
    const owned = ownedCards.includes(card.id);

    return (
      <Pressable
        onPress={() => toggleOwned(card.id)}
        onLongPress={() => router.push(`/card/${card.id}?setId=${setInfo.id}`)}
        delayLongPress={250}
        style={({ pressed }) => [
          styles.cardTile,
          owned && styles.cardTileOwned,
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.cardNumberBadge}>
          <Text style={[styles.cardNumberText, owned && styles.cardNumberTextOwned]}>
            #{card.number}
          </Text>
        </View>

        {card.images?.small ? (
          <Image
            source={{ uri: card.images.small }}
            style={styles.cardImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.cardImageFallback}>
            <Ionicons
              name="image-outline"
              size={30}
              color={owned ? '#0b0f2a' : '#7987b3'}
            />
            <Text style={[styles.fallbackText, owned && styles.fallbackTextOwned]}>
              No image
            </Text>
          </View>
        )}

        <Text style={[styles.cardName, owned && styles.cardNameOwned]} numberOfLines={2}>
          {card.name}
        </Text>

        <Text
          style={[styles.cardRarity, owned && styles.cardRarityOwned]}
          numberOfLines={1}
        >
          {card.rarity ?? 'Unknown'}
        </Text>

        <View style={[styles.ownedPill, owned && styles.ownedPillActive]}>
          <Ionicons
            name={owned ? 'checkmark-circle' : 'ellipse-outline'}
            size={14}
            color={owned ? '#0b0f2a' : '#FFD166'}
          />
          <Text
            style={[styles.ownedPillText, owned && styles.ownedPillTextActive]}
          >
            {owned ? 'Owned' : 'Missing'}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={filteredCards}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={renderCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <Pressable onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="chevron-back" size={18} color="#fff" />
              </Pressable>

              <View style={styles.headerTextWrap}>
                <Text style={styles.heading}>{setInfo.name}</Text>
                <Text style={styles.subheading}>
                  {setInfo.series} · {setInfo.total} cards
                </Text>
              </View>
            </View>

            <View style={styles.progressCard}>
              <Text style={styles.progressTitle}>Collection Progress</Text>
              <Text style={styles.progressNumbers}>
                {ownedCount} / {setInfo.total}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${progressPercent}%` }]}
                />
              </View>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color="#8f9bc2" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search cards..."
                placeholderTextColor="#8f9bc2"
                style={styles.searchInput}
              />
            </View>

            <View style={styles.filterRow}>
              {(['all', 'owned', 'missing'] as FilterType[]).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setFilter(item)}
                  style={[
                    styles.filterChip,
                    filter === item && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filter === item && styles.filterChipTextActive,
                    ]}
                  >
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.filterRow}>
              {(['number', 'name', 'rarity'] as SortType[]).map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setSort(item)}
                  style={[
                    styles.filterChip,
                    sort === item && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      sort === item && styles.filterChipTextActive,
                    ]}
                  >
                    {item === 'number'
                      ? 'Number'
                      : item === 'name'
                        ? 'A–Z'
                        : 'Rarity'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rarityRow}
            >
              {rarities.map((rarity) => (
                <Pressable
                  key={rarity}
                  onPress={() => setSelectedRarity(rarity)}
                  style={[
                    styles.rarityChip,
                    selectedRarity === rarity && styles.rarityChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.rarityChipText,
                      selectedRarity === rarity && styles.rarityChipTextActive,
                    ]}
                  >
                    {rarity}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.resultsRow}>
              <Text style={styles.sectionTitle}>Cards</Text>
              <Text style={styles.resultsText}>{filteredCards.length} shown</Text>
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  listContent: {
    padding: 18,
    paddingBottom: 120,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  heading: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  subheading: {
    color: '#AAB3D1',
    fontSize: 14,
  },
  progressCard: {
    backgroundColor: '#111735',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  progressTitle: {
    color: '#AAB3D1',
    fontSize: 13,
    marginBottom: 6,
  },
  progressNumbers: {
    color: '#FFD166',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFD166',
    borderRadius: 999,
  },
  searchWrap: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterChip: {
    backgroundColor: theme.colors.card,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  filterChipActive: {
    backgroundColor: '#FFD166',
    borderColor: '#FFD166',
  },
  filterChipText: {
    color: '#AAB3D1',
    fontWeight: '700',
    fontSize: 12,
  },
  filterChipTextActive: {
    color: '#0b0f2a',
  },
  rarityRow: {
    gap: 8,
    paddingBottom: 8,
    marginBottom: 8,
  },
  rarityChip: {
    backgroundColor: theme.colors.card,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  rarityChipActive: {
    backgroundColor: 'rgba(255,209,102,0.14)',
    borderColor: '#FFD166',
  },
  rarityChipText: {
    color: '#AAB3D1',
    fontWeight: '700',
    fontSize: 12,
  },
  rarityChipTextActive: {
    color: '#FFD166',
  },
  resultsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  resultsText: {
    color: '#8f9bc2',
    fontSize: 12,
    fontWeight: '700',
  },
  cardTile: {
    width: '48%',
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardTileOwned: {
    backgroundColor: '#FFD166',
    borderColor: '#FFD166',
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  cardNumberBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    marginBottom: 10,
  },
  cardNumberText: {
    color: '#AAB3D1',
    fontSize: 11,
    fontWeight: '800',
  },
  cardNumberTextOwned: {
    color: '#0b0f2a',
  },
  cardImage: {
    width: '100%',
    height: 150,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cardImageFallback: {
    width: '100%',
    height: 150,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  fallbackText: {
    color: '#7987b3',
    fontSize: 12,
    fontWeight: '700',
  },
  fallbackTextOwned: {
    color: '#0b0f2a',
  },
  cardName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
    minHeight: 36,
  },
  cardNameOwned: {
    color: '#0b0f2a',
  },
  cardRarity: {
    color: '#94A0C9',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  cardRarityOwned: {
    color: 'rgba(11,15,42,0.72)',
  },
  ownedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,209,102,0.12)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  ownedPillActive: {
    backgroundColor: '#0b0f2a',
  },
  ownedPillText: {
    color: '#FFD166',
    fontSize: 12,
    fontWeight: '800',
  },
  ownedPillTextActive: {
    color: '#FFD166',
  },
});