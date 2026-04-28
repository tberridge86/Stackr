import { theme } from '../../lib/theme';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type PokemonListItem = {
  name: string;
  url: string;
};

type PokemonEntry = {
  id: number;
  name: string;
  url: string;
};

type RangeKey =
  | 'all'
  | 'kanto'
  | 'johto'
  | 'hoenn'
  | 'sinnoh'
  | 'unova'
  | 'kalos'
  | 'alola'
  | 'galar'
  | 'paldea';

const POKEAPI_LIST_URL = 'https://pokeapi.co/api/v2/pokemon?limit=20000';

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const formatPokemonName = (name: string) => {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getPokemonIdFromUrl = (url: string) => {
  const parts = url.split('/').filter(Boolean);
  const id = Number(parts[parts.length - 1]);
  return Number.isFinite(id) ? id : 0;
};

const getPokemonImageUrl = (id: number) => {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
};

const getRangeMatch = (range: RangeKey, id: number) => {
  if (range === 'all') return true;
  if (range === 'kanto') return id >= 1 && id <= 151;
  if (range === 'johto') return id >= 152 && id <= 251;
  if (range === 'hoenn') return id >= 252 && id <= 386;
  if (range === 'sinnoh') return id >= 387 && id <= 493;
  if (range === 'unova') return id >= 494 && id <= 649;
  if (range === 'kalos') return id >= 650 && id <= 721;
  if (range === 'alola') return id >= 722 && id <= 809;
  if (range === 'galar') return id >= 810 && id <= 905;
  if (range === 'paldea') return id >= 906 && id <= 1025;
  return true;
};

export default function PokedexScreen() {
  const insets = useSafeAreaInsets();

  const [pokemon, setPokemon] = useState<PokemonEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<RangeKey>('all');

  useEffect(() => {
    const loadPokemon = async () => {
      try {
        setLoading(true);

        const response = await fetch(POKEAPI_LIST_URL);
        const json = await response.json();

        const results: PokemonListItem[] = Array.isArray(json?.results)
          ? json.results
          : [];

        const mapped = results
          .map((item) => ({
            id: getPokemonIdFromUrl(item.url),
            name: item.name,
            url: item.url,
          }))
          .filter((item) => item.id > 0)
          .sort((a, b) => a.id - b.id);

        setPokemon(mapped);
      } catch (error) {
        console.log('Failed to load Pokédex', error);
      } finally {
        setLoading(false);
      }
    };

    loadPokemon();
  }, []);

  const filteredPokemon = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    return pokemon.filter((item) => {
      const matchesSearch =
        !cleanQuery ||
        item.name.toLowerCase().includes(cleanQuery) ||
        String(item.id).includes(cleanQuery);

      const matchesRange = getRangeMatch(selectedRange, item.id);

      return matchesSearch && matchesRange;
    });
  }, [pokemon, query, selectedRange]);

  const renderRangeChip = (key: RangeKey, label: string) => {
    const active = selectedRange === key;

    return (
      <Pressable
        onPress={() => setSelectedRange(key)}
        style={[styles.rangeChip, active && styles.rangeChipActive]}
      >
        <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  const renderPokemon = ({ item }: { item: PokemonEntry }) => {
    return (
      <Pressable
        onPress={() => router.push(`/pokemon/${item.id}`)}
        style={({ pressed }) => [styles.dexRow, pressed && styles.cardPressed]}
      >
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: getPokemonImageUrl(item.id) }}
            style={styles.pokemonImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.dexInfo}>
          <Text style={styles.dexName}>{formatPokemonName(item.name)}</Text>
          <Text style={styles.dexSubtitle}>
            #{String(item.id).padStart(4, '0')} · Pokédex entry
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.headerCard}>
          <Text style={styles.heading}>Pokédex</Text>
          <Text style={styles.subheading}>
            Browse every Pokémon and build this into your collection encyclopedia.
          </Text>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={theme.colors.textSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search Pokémon or number..."
              placeholderTextColor={theme.colors.textSoft}
              style={styles.searchInput}
            />
          </View>
        </View>

        <View style={styles.rangeRow}>
          {renderRangeChip('all', 'All')}
          {renderRangeChip('kanto', 'Kanto')}
          {renderRangeChip('johto', 'Johto')}
          {renderRangeChip('hoenn', 'Hoenn')}
          {renderRangeChip('sinnoh', 'Sinnoh')}
          {renderRangeChip('unova', 'Unova')}
          {renderRangeChip('kalos', 'Kalos')}
          {renderRangeChip('alola', 'Alola')}
          {renderRangeChip('galar', 'Galar')}
          {renderRangeChip('paldea', 'Paldea')}
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {loading ? 'Loading...' : `${filteredPokemon.length} Pokémon shown`}
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading full Pokédex...</Text>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={filteredPokemon}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderPokemon}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 170,
            }}
            ListFooterComponent={<View style={{ height: 40 }} />}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No Pokémon found</Text>
                <Text style={styles.emptyText}>
                  Try a different name, number, or region.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  list: {
    flex: 1,
    marginBottom: -50,
  },
  headerCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
    ...cardShadow,
  },
  heading: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 8,
  },
  subheading: {
    color: theme.colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    paddingVertical: 13,
    paddingHorizontal: 10,
    fontSize: 15,
    fontWeight: '600',
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  rangeChip: {
    backgroundColor: theme.colors.card,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rangeChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  rangeChipText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  rangeChipTextActive: {
    color: '#FFFFFF',
  },
  summaryRow: {
    marginBottom: 10,
  },
  summaryText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  dexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow,
  },
  imageWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pokemonImage: {
    width: 58,
    height: 58,
  },
  dexInfo: {
    flex: 1,
  },
  dexName: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 4,
  },
  dexSubtitle: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.94,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: theme.colors.textSoft,
    marginTop: 12,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },
  emptyText: {
    color: theme.colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
  },
});