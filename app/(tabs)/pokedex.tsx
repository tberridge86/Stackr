import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StackrLoadingIndicator as ActivityIndicator } from '../../components/StackrLoadingIndicator';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type DimensionValue,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
import { stackrApiClient } from '../../lib/stackrApiV1';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { PokemonArtworkGlow, StackrScreen } from '../../components/StackrScreen';
import { stackrIcons } from '../../lib/stackrIcons';

type PokemonListItem = {
  name: string;
  url: string;
};

export type PokemonEntry = {
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
const POKEDEX_INITIAL_LIST_LIMIT = 151;
const getPokedexListUrl = (offset: number, limit: number) => (
  `/pokemon?offset=${offset}&limit=${limit}`
);
const POKEDEX_CACHE_KEY = 'stackr:pokedex:pokemon-list:v2:published';

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

const mergePokemonResults = (...pages: PokemonEntry[][]): PokemonEntry[] => {
  const byId = new Map<number, PokemonEntry>();
  for (const page of pages) {
    for (const entry of page) byId.set(entry.id, entry);
  }
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
};

type PokeApiPageResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type PokedexPageFetcher = (url: string) => Promise<PokeApiPageResponse>;

const fetchPublishedPokedexPage: PokedexPageFetcher = async (path) => {
  const params = new URLSearchParams(path.split('?')[1]);
  const response = await stackrApiClient.pokemonIndex({
    offset: Number(params.get('offset')),
    limit: Number(params.get('limit')),
  });
  return { ok: true, status: 200, json: async () => response.data };
};

const readPokemonPage = async (fetchPage: PokedexPageFetcher, offset: number, limit: number) => {
  const response = await fetchPage(getPokedexListUrl(offset, limit));
  if (!response.ok) throw new Error(`Pokédex API returned ${response.status}`);
  const json = await response.json() as { count?: unknown; indexVersion?: unknown; results?: unknown };
  if (typeof json.indexVersion !== 'string' || !json.indexVersion.trim()) {
    throw new Error('Pokédex API returned an invalid index version');
  }
  if (!Array.isArray(json.results) || !json.results.every((item) => {
    if (!item || typeof item !== 'object'
      || typeof item.name !== 'string' || !item.name.trim()
      || typeof item.url !== 'string') return false;
    const id = getPokemonIdFromUrl(item.url);
    return Number.isSafeInteger(id) && id > 0;
  })) throw new Error('Pokédex API returned malformed Pokémon results');
  return { count: json.count, indexVersion: json.indexVersion,
    entries: mapPokemonResults(json.results as PokemonListItem[]) };
};

/**
 * Fetch the capped catalogue in two bounded phases. The first callback is for
 * display only; callers must cache only this function's fully validated return.
 */
export async function fetchCompletePokedex(
  fetchPage: PokedexPageFetcher,
  onFirstPage: (entries: PokemonEntry[]) => void,
): Promise<PokemonEntry[]> {
  const first = await readPokemonPage(fetchPage, 0, POKEDEX_INITIAL_LIST_LIMIT);
  const reportedTotal = Number(first.count);
  if (!Number.isSafeInteger(reportedTotal) || reportedTotal < 1) {
    throw new Error('Pokédex API returned an invalid Pokémon count');
  }

  const cappedTotal = Math.min(POKEDEX_LIST_LIMIT, reportedTotal);
  const expectedFirstPageLength = Math.min(cappedTotal, POKEDEX_INITIAL_LIST_LIMIT);
  if (mergePokemonResults(first.entries).length !== expectedFirstPageLength) {
    throw new Error('Pokédex API returned a truncated first Pokémon page');
  }
  onFirstPage(first.entries);

  const remainingLimit = cappedTotal - first.entries.length;
  if (!remainingLimit) return first.entries;

  const remaining = await readPokemonPage(fetchPage, first.entries.length, remainingLimit);
  if (remaining.indexVersion !== first.indexVersion || remaining.count !== first.count) {
    throw new Error('The Pokédex index changed during loading. Please retry.');
  }
  const complete = mergePokemonResults(first.entries, remaining.entries);
  if (complete.length !== cappedTotal) {
    throw new Error('Pokédex API returned a truncated Pokémon continuation');
  }
  return complete;
}

type PokedexRemoteLoadOptions = {
  hasCachedPokemon: boolean;
  isActive: () => boolean;
  publishPartial: (entries: PokemonEntry[]) => void;
  publishComplete: (entries: PokemonEntry[]) => void;
  persistComplete: (entries: PokemonEntry[]) => Promise<void>;
  setLoadingMore: (loading: boolean) => void;
};

/** Keep partial display data out of every cache and ignore superseded loads. */
export async function loadPokedexRemote(
  fetchPage: PokedexPageFetcher,
  options: PokedexRemoteLoadOptions,
): Promise<'complete' | 'stale'> {
  const complete = await fetchCompletePokedex(fetchPage, (firstPage) => {
    if (!options.isActive()) return;
    if (!options.hasCachedPokemon) options.publishPartial(firstPage);
    options.setLoadingMore(true);
  });
  if (!options.isActive()) return 'stale';

  options.publishComplete(complete);
  if (!options.isActive()) return 'stale';
  await options.persistComplete(complete);
  return options.isActive() ? 'complete' : 'stale';
}

const isPokemonEntryArray = (value: unknown): value is PokemonEntry[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      Number.isSafeInteger((item as PokemonEntry).id) && (item as PokemonEntry).id > 0 &&
      typeof (item as PokemonEntry).name === 'string' && (item as PokemonEntry).name.trim().length > 0 &&
      typeof (item as PokemonEntry).url === 'string' &&
      getPokemonIdFromUrl((item as PokemonEntry).url) === (item as PokemonEntry).id
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
  const [pokemonTotal, setPokemonTotal] = useState(POKEDEX_LIST_LIMIT);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadEpoch, setReloadEpoch] = useState(0);
  const [selectedRange, setSelectedRange] = useState<RangeKey>('all');
  const [ownedPokemonNames, setOwnedPokemonNames] = useState<Set<string>>(new Set());
  const [compactProgress, setCompactProgress] = useState(false);

  useEffect(() => {
    let active = true;

    const publishPokemon = (mapped: PokemonEntry[]) => {
      if (!active) return;
      setPokemon(mapped);
      setLoading(false);
    };

    const applyCompletePokemon = (mapped: PokemonEntry[]) => {
      if (!active) return;
      pokemonMemoryCache = mapped;
      setPokemonTotal(mapped.length);
      publishPokemon(mapped);
    };

    const loadCachedPokemon = async () => {
      if (pokemonMemoryCache?.length) {
        applyCompletePokemon(pokemonMemoryCache);
        return true;
      }

      try {
        const cached = await AsyncStorage.getItem(POKEDEX_CACHE_KEY);
        if (!cached) return false;

        const parsed = JSON.parse(cached);
        if (!isPokemonEntryArray(parsed) || parsed.length !== POKEDEX_LIST_LIMIT
          || mergePokemonResults(parsed).length !== parsed.length) return false;

        applyCompletePokemon(parsed);
        return true;
      } catch (error) {
        console.log('Failed to load cached Pokédex', error);
        return false;
      }
    };

    const loadRemotePokemon = async (hasCachedPokemon: boolean) => {
      let publishedPartial = false;
      try {
        if (active) setLoadError(null);
        if (!hasCachedPokemon && active) setLoading(true);

        await loadPokedexRemote(fetchPublishedPokedexPage, {
          hasCachedPokemon,
          isActive: () => active,
          // A cold tab can become useful after Kanto has arrived. Do not replace
          // a complete cached list with this display-only partial page.
          publishPartial: (firstPage) => {
            publishedPartial = true;
            publishPokemon(firstPage);
          },
          publishComplete: applyCompletePokemon,
          setLoadingMore,
          persistComplete: async (mapped) => {
            if (!active) return;
            try {
              await AsyncStorage.setItem(POKEDEX_CACHE_KEY, JSON.stringify(mapped));
            } catch (cacheError) {
              if (active) console.log('Failed to cache Pokédex', cacheError);
            }
          },
        });
      } catch (error) {
        console.log('Failed to load Pokédex', error);
        if (active) {
          setLoadError(hasCachedPokemon
            ? 'Could not refresh the Pokédex. Showing saved results.'
            : publishedPartial
              ? 'Could not load the full Pokédex. Showing the Pokémon loaded so far.'
              : 'Could not load the Pokédex. Check your connection and try again.');
        }
      } finally {
        if (active) {
          setLoading(false);
          setLoadingMore(false);
        }
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
  }, [reloadEpoch]);

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
  const pokedexTotal = pokemonTotal;
  const incompletePokedex = pokemon.length < pokedexTotal;
  const pendingPokedex = incompletePokedex && (loading || loadingMore);

  const mastersetProgress = pokedexTotal ? ownedPokedexCount / pokedexTotal : 0;
  const mastersetPercent = Math.round(mastersetProgress * 100);
  const mastersetFillWidth = `${Math.min(100, mastersetProgress * 100)}%` as DimensionValue;

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextCompact = event.nativeEvent.contentOffset.y > 18;
    setCompactProgress((current) => (current === nextCompact ? current : nextCompact));
  }, []);

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
          <View style={styles.compactHeader}>
            <Text style={styles.pageTitle}>Pokédex</Text>
            <Text style={styles.pageSubtitle} numberOfLines={1}>
              Explore Pokémon and linked cards.
            </Text>
          </View>

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

        <View style={[styles.mastersetProgress, compactProgress && styles.mastersetProgressCompact]}>
          <View style={styles.mastersetProgressTop}>
            <Text style={styles.mastersetProgressLabel}>Masterset progress</Text>
            <Text style={styles.mastersetPercent}>
              {compactProgress
                ? `${mastersetPercent}% · ${ownedPokedexCount}/${pokedexTotal}`
                : `${ownedPokedexCount}/${pokedexTotal} owned`}
            </Text>
          </View>
          <View style={[styles.mastersetTrack, compactProgress && styles.mastersetTrackCompact]}>
            <View style={[styles.mastersetFill, { width: mastersetFillWidth }]} />
          </View>
          {!compactProgress && (
            <View style={styles.mastersetMetaRow}>
              <Text style={styles.mastersetProgressValue}>
                {mastersetPercent}% complete
              </Text>
              <Text style={styles.mastersetProgressValue}>
                {loading ? 'Loading...' : loadingMore ? 'Loading more...' : `${filteredPokemon.length} shown`}
              </Text>
            </View>
          )}
        </View>

        {loadError ? (
          <View style={styles.loadError} accessibilityRole="alert">
            <Text style={styles.loadErrorText}>{loadError}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading the Pokédex"
              onPress={() => setReloadEpoch((current) => current + 1)}
              style={({ pressed }) => [styles.loadRetry, pressed && styles.cardPressed]}
            >
              <Text style={styles.loadRetryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {loadingMore && pokemon.length > 0 ? (
          <View style={styles.loadingMore} accessible accessibilityRole="progressbar" accessibilityLabel="Loading more Pokémon" accessibilityState={{ busy: true }}>
            <ActivityIndicator color={theme.colors.primary} size="small" />
            <Text style={styles.loadingMoreText}>Loading more Pokémon...</Text>
          </View>
        ) : null}

        {loading && pokemon.length === 0 ? (
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
            onScroll={handleListScroll}
            scrollEventThrottle={16}
            columnWrapperStyle={{ gap: 6, marginBottom: 6, paddingHorizontal: 6 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 170,
            }}
            ListFooterComponent={<View style={{ height: 40 }} />}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{pendingPokedex ? 'More Pokémon are still loading' : loadError && incompletePokedex ? 'Some Pokémon could not load' : 'No Pokémon found'}</Text>
                <Text style={styles.emptyText}>
                  {pendingPokedex ? 'Results will appear as loading completes.' : loadError && incompletePokedex ? 'Tap Retry to load the remaining Pokémon.' : 'Try a different name, number, or region.'}
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
    paddingHorizontal: 14,
    paddingTop: 2,
  },
  list: {
    flex: 1,
  },
  headerBlock: {
    gap: 6,
    marginBottom: 6,
  },
  compactHeader: {
    gap: 1,
  },
  pageTitle: {
    color: theme.colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: 0,
  },
  pageSubtitle: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  mastersetProgress: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: theme.colors.primary + '16',
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 6,
    gap: 5,
  },
  mastersetProgressCompact: {
    paddingVertical: 6,
    gap: 4,
  },
  mastersetProgressTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mastersetProgressLabel: {
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
    flexShrink: 1,
  },
  mastersetProgressValue: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  mastersetMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mastersetTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary + '12',
    overflow: 'hidden',
  },
  mastersetTrackCompact: {
    height: 5,
  },
  mastersetFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  mastersetPercent: {
    color: theme.colors.primary,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: theme.colors.primary + '18',
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  regionScroller: {
    marginBottom: 6,
    marginHorizontal: -14,
  },
  regionRail: {
    gap: 7,
    paddingHorizontal: 14,
    paddingBottom: 1,
  },
  regionTile: {
    width: 58,
    minHeight: 46,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 14,
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.colors.primary + '14',
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
    width: 48,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regionIcon: {
    width: 46,
    height: 34,
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
  loadError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
  },
  loadErrorText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  loadRetry: {
    backgroundColor: theme.colors.primary + '14',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  loadRetryText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  loadingMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  loadingMoreText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
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
  borderRadius: 14,
  padding: 8,
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
  marginBottom: 5,
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
