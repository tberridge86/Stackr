import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type DimensionValue,
  type ImageSourcePropType,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '../../components/Text';
import { FeatureTipGate } from '../../components/FeatureTipModal';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fetchOwnedPokemonNameSet, pokemonNameMatchesCardName } from '../../lib/pokedexCollection';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { PokemonArtworkGlow, StackrPageHeader, StackrScreen } from '../../components/StackrScreen';
import { stackrIcons } from '../../lib/stackrIcons';

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

const REGION_FILTERS: { key: RangeKey; label: string; source: ImageSourcePropType }[] = [
  { key: 'all', label: 'All', source: stackrIcons.pokedex },
  { key: 'kanto', label: 'Kanto', source: require('../../assets/rev2/08-pokedex-regions/Kanto.png') },
  { key: 'johto', label: 'Johto', source: require('../../assets/rev2/08-pokedex-regions/johto.png') },
  { key: 'hoenn', label: 'Hoenn', source: require('../../assets/rev2/08-pokedex-regions/Hoenn.png') },
  { key: 'sinnoh', label: 'Sinnoh', source: require('../../assets/rev2/08-pokedex-regions/Sinnoh.png') },
  { key: 'unova', label: 'Unova', source: require('../../assets/rev2/08-pokedex-regions/unova.png') },
  { key: 'kalos', label: 'Kalos', source: require('../../assets/rev2/08-pokedex-regions/Kalos.png') },
  { key: 'alola', label: 'Alola', source: require('../../assets/rev2/08-pokedex-regions/Alola.png') },
  { key: 'galar', label: 'Galar', source: require('../../assets/rev2/08-pokedex-regions/Galar.png') },
  { key: 'paldea', label: 'Paldea', source: require('../../assets/rev2/08-pokedex-regions/Paldea.png') },
];

const POKEDEX_LIST_LIMIT = 1350;
const POKEAPI_LIST_URL = `https://pokeapi.co/api/v2/pokemon?limit=${POKEDEX_LIST_LIMIT}`;
const POKEDEX_CACHE_KEY = 'stackr:pokedex:pokemon-list:v1';

let pokemonMemoryCache: PokemonEntry[] | null = null;

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

const mapPokemonResults = (results: PokemonListItem[]): PokemonEntry[] =>
  results
    .map((item) => ({
      id: getPokemonIdFromUrl(item.url),
      name: item.name,
      url: item.url,
    }))
    .filter((item) => item.id > 0)
    .sort((a, b) => a.id - b.id);

const isPokemonEntryArray = (value: unknown): value is PokemonEntry[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as PokemonEntry).id === 'number' &&
      typeof (item as PokemonEntry).name === 'string' &&
      typeof (item as PokemonEntry).url === 'string'
  );

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
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const numColumns = width >= 900 ? 8 : width >= 600 ? 5 : 3;
  const itemWidth = (width - 36 - (numColumns + 1) * 6) / numColumns;

  const [pokemon, setPokemon] = useState<PokemonEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<RangeKey>('all');
  const [ownedPokemonNames, setOwnedPokemonNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    const applyPokemon = (mapped: PokemonEntry[]) => {
      pokemonMemoryCache = mapped;
      if (!active) return;
      setPokemon(mapped);
      setLoading(false);
    };

    const loadCachedPokemon = async () => {
      if (pokemonMemoryCache?.length) {
        applyPokemon(pokemonMemoryCache);
        return true;
      }

      try {
        const cached = await AsyncStorage.getItem(POKEDEX_CACHE_KEY);
        if (!cached) return false;

        const parsed = JSON.parse(cached);
        if (!isPokemonEntryArray(parsed) || parsed.length === 0) return false;

        applyPokemon(parsed);
        return true;
      } catch (error) {
        console.log('Failed to load cached Pokédex', error);
        return false;
      }
    };

    const loadRemotePokemon = async (hasCachedPokemon: boolean) => {
      try {
        if (!hasCachedPokemon && active) setLoading(true);

        const response = await fetch(POKEAPI_LIST_URL);
        if (!response.ok) throw new Error(`PokeAPI returned ${response.status}`);

        const json = await response.json();

        const results: PokemonListItem[] = Array.isArray(json?.results)
          ? json.results
          : [];

        const mapped = mapPokemonResults(results);

        applyPokemon(mapped);
        AsyncStorage.setItem(POKEDEX_CACHE_KEY, JSON.stringify(mapped)).catch((cacheError) => {
          console.log('Failed to cache Pokédex', cacheError);
        });
      } catch (error) {
        console.log('Failed to load Pokédex', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    const loadPokemon = async () => {
      const hasCachedPokemon = await loadCachedPokemon();
      await loadRemotePokemon(hasCachedPokemon);
    };

    loadPokemon();

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      fetchOwnedPokemonNameSet()
        .then((names) => {
          if (active) setOwnedPokemonNames(names);
        })
        .catch((error) => {
          console.log('Failed to load Pokedex ownership', error);
        });

      return () => {
        active = false;
      };
    }, [])
  );

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

  const ownedPokemonNameList = useMemo(
    () => Array.from(ownedPokemonNames),
    [ownedPokemonNames]
  );

  const isPokemonOwned = useCallback(
    (pokemonName: string) =>
      ownedPokemonNameList.some((cardName) =>
        pokemonNameMatchesCardName(pokemonName, cardName)
      ),
    [ownedPokemonNameList]
  );

  const ownedPokemonIds = useMemo(() => {
    const ids = new Set<number>();

    for (const item of pokemon) {
      if (isPokemonOwned(item.name)) ids.add(item.id);
    }

    return ids;
  }, [isPokemonOwned, pokemon]);

  const ownedPokedexCount = ownedPokemonIds.size;
  const pokedexTotal = pokemon.length || POKEDEX_LIST_LIMIT;

  const mastersetProgress = pokedexTotal ? ownedPokedexCount / pokedexTotal : 0;
  const mastersetPercent = Math.round(mastersetProgress * 100);
  const mastersetFillWidth = `${Math.min(100, mastersetProgress * 100)}%` as DimensionValue;

  const renderRangeChip = (option: { key: RangeKey; label: string; source: ImageSourcePropType }) => {
    const { key, label, source } = option;
    const active = selectedRange === key;

    return (
      <Pressable
        key={key}
        onPress={() => setSelectedRange(key)}
        accessibilityRole="button"
        accessibilityLabel={`${label} region filter`}
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [
          styles.regionTile,
          active && styles.regionTileActive,
          pressed && styles.regionTilePressed,
        ]}
      >
        <View style={styles.regionIconFrame}>
          <Image
            source={source}
            style={styles.regionIcon}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
      </Pressable>
    );
  };

  const renderPokemon = ({ item }: { item: PokemonEntry }) => {
    const owned = ownedPokemonIds.has(item.id);

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/pokemon/[id]',
            params: { id: String(item.id), name: item.name },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`${formatPokemonName(item.name)}, number ${String(item.id).padStart(4, '0')}${owned ? ', owned' : ', not owned'}`}
        style={({ pressed }) => [styles.gridCard, { width: itemWidth }, pressed && styles.cardPressed]}
      >
        <View style={[styles.gridImageWrap, owned && { backgroundColor: 'transparent' }]}>
          <PokemonArtworkGlow style={styles.pokemonArtworkFrame}>
            <Image
              source={{ uri: getPokemonImageUrl(item.id) }}
              style={styles.gridImage}
              resizeMode="contain"
            />
          </PokemonArtworkGlow>
          {owned && (
            <View style={styles.ownedBadge}>
              <Ionicons name="checkmark" size={12} color="#FFFFFF" />
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={styles.gridName}>
          {formatPokemonName(item.name)}
        </Text>
        <Text style={styles.gridNumber}>
          #{String(item.id).padStart(4, '0')}
        </Text>
      </Pressable>
    );
  };

  return (
    <StackrScreen variant="tab" style={styles.safe}>
      <StackrBackdrop />
      <FeatureTipGate
        tipKey="pokedex-screen-v1"
        title="Pokédex collection"
        subtitle="Track cards by Pokémon, not just by set."
        items={[
          { icon: 'albums-outline', title: 'All cards', body: 'Tap a Pokémon to see every card for that Pokémon across all sets.' },
          { icon: 'checkmark-circle-outline', title: 'Ownership', body: 'Mark cards owned inside each Pokémon page to build a Pokémon collection.' },
          { icon: 'sync-outline', title: 'Binder sync', body: 'Cards owned in your binders also count here, without creating extra binders.' },
        ]}
      />
      <View style={styles.container}>
        <View style={styles.headerBlock}>
          <StackrPageHeader
            title="Pokédex"
            accentText="dex"
            subtitle="Explore Pokémon and discover every card linked to them."
          />

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={theme.colors.textSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search Pokémon or number..."
              placeholderTextColor={theme.colors.textSoft}
              autoCorrect={false}
              autoCapitalize="words"
              style={styles.searchInput}
            />
          </View>
        </View>

        <View style={styles.regionScroller}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.regionRail}
          >
            {REGION_FILTERS.map(renderRangeChip)}
          </ScrollView>
        </View>

        <View style={styles.mastersetProgress}>
          <View style={styles.mastersetProgressTop}>
            <Text style={styles.mastersetProgressLabel}>Masterset progress</Text>
            <Text style={styles.mastersetProgressValue}>
              {ownedPokedexCount}/{pokedexTotal} Pokémon owned
            </Text>
          </View>
          <View style={styles.mastersetTrack}>
            <View style={[styles.mastersetFill, { width: mastersetFillWidth }]} />
          </View>
          <Text style={styles.mastersetPercent}>{mastersetPercent}% complete</Text>
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
            key={numColumns}
            numColumns={numColumns}
            initialNumToRender={numColumns * 4}
            maxToRenderPerBatch={numColumns * 5}
            windowSize={7}
            removeClippedSubviews
            columnWrapperStyle={{ gap: 6, marginBottom: 6, paddingHorizontal: 6 }}
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
    </StackrScreen>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: theme.spacing.sm,
  },
  list: {
    flex: 1,
  },
  headerBlock: {
    gap: 12,
    marginBottom: 12,
  },
  mastersetProgress: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  mastersetProgressTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mastersetProgressLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    flexShrink: 1,
  },
  mastersetProgressValue: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  mastersetTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  mastersetFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  mastersetPercent: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '900',
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
  regionScroller: {
    marginBottom: 12,
    marginHorizontal: -18,
  },
  regionRail: {
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 2,
  },
  regionTile: {
    width: 82,
    minHeight: 72,
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  regionTileActive: {
    backgroundColor: theme.colors.primary + '12',
    borderColor: theme.colors.primary,
  },
  regionTilePressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.94,
  },
  regionIconFrame: {
    width: 68,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regionIcon: {
    width: 66,
    height: 56,
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
  gridCard: {
  backgroundColor: theme.colors.card,
  borderRadius: 16,
  padding: 10,
  alignItems: 'center',
  borderWidth: 1,
  borderColor: theme.colors.border,
  ...cardShadow,
},
gridImageWrap: {
  width: '100%',
  aspectRatio: 1,
  backgroundColor: theme.colors.surface,
  borderRadius: 12,
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 6,
  overflow: 'visible',
},
pokemonArtworkFrame: {
  width: '100%',
  height: '100%',
},
ownedBadge: {
  position: 'absolute',
  right: 6,
  top: 6,
  width: 22,
  height: 22,
  borderRadius: 11,
  backgroundColor: theme.colors.primary,
  borderWidth: 2,
  borderColor: theme.colors.card,
  alignItems: 'center',
  justifyContent: 'center',
},
gridImage: {
  width: '80%',
  height: '80%',
},
gridName: {
  color: theme.colors.text,
  fontSize: 11,
  fontWeight: '900',
  textAlign: 'center',
},
gridNumber: {
  color: theme.colors.textSoft,
  fontSize: 10,
  fontWeight: '700',
  textAlign: 'center',
  marginTop: 2,
},
});
}
