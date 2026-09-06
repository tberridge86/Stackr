import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchAllSets, getPokemonSetLogoUrl, getPokemonSetVisualUrl, normalizePokemonCardLanguage, type PokemonSet } from '../../lib/pokemonTcg';
import { getLocalSetArtworkSourceForSet } from '../../lib/localSetArtwork';
import { StackrBackdrop, StackrHeroBackdrop } from '../../components/StackrBackdrop';
import { StackrPageTitle } from '../../components/StackrScreen';
import { supabase } from '../../lib/supabase';
import { stackrTabContentPadding } from '../../lib/stackrSizing';
import { useTheme } from '../../components/theme-context';
import {
  getPokemonLanguageDescriptor,
  POKEMON_CATALOGUE_LANGUAGE_OPTIONS,
  PokemonLanguageFlagIcon,
  type PokemonCatalogueLanguageCode,
} from '../../components/PokemonLanguageBadge';
import {
  getEnglishSetDisplaySupplement,
  getEnglishSupplementalName,
  getPreferredSetDisplayName,
} from '../../lib/pokemonDisplayNames';

// ===============================
// CONSTANTS
// ===============================

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const SERIES_ORDER = [
  'Scarlet & Violet',
  'Sword & Shield',
  'Sun & Moon',
  'XY',
  'Black & White',
  'HeartGold & SoulSilver',
  'Platinum',
  'Diamond & Pearl',
  'EX',
  'e-Card',
  'Neo',
  'Gym',
  'Base',
  'Other',
];

// ===============================
// HELPERS
// ===============================

function groupSetsBySeries(sets: PokemonSet[]): { series: string; sets: PokemonSet[] }[] {
  const map: Record<string, PokemonSet[]> = {};

  for (const set of sets) {
    const series = set.series ?? 'Other';
    if (!map[series]) map[series] = [];
    map[series].push(set);
  }

  // Sort by preferred series order
  return SERIES_ORDER
    .filter((s) => map[s])
    .map((s) => ({ series: s, sets: map[s] }))
    .concat(
      Object.keys(map)
        .filter((s) => !SERIES_ORDER.includes(s))
        .map((s) => ({ series: s, sets: map[s] }))
    );
}

type DiscoverSetLanguage = PokemonCatalogueLanguageCode;
type DiscoverLanguageFilter = 'all' | DiscoverSetLanguage;

const LANGUAGE_FILTERS: readonly { key: DiscoverLanguageFilter; label: string; language?: DiscoverSetLanguage }[] = [
  { key: 'all', label: 'All' },
  ...POKEMON_CATALOGUE_LANGUAGE_OPTIONS.map(({ key, label }) => ({ key, label, language: key })),
];

function getSeriesKey(language: DiscoverSetLanguage, series: string) {
  return `${language}:${series}`;
}

function getLanguageHeaderCopy(language: Exclude<DiscoverSetLanguage, 'en'>) {
  if (language === 'zh-cn') {
    return {
      title: 'Simplified Chinese Sets',
      subtitle: 'Expand for official Simplified Chinese binders',
      seriesPrefix: 'Simplified Chinese',
    };
  }

  if (language === 'zh-tw') {
    return {
      title: 'Traditional Chinese Sets',
      subtitle: 'Expand for official Traditional Chinese binders',
      seriesPrefix: 'Traditional Chinese',
    };
  }

  return {
    title: 'Japanese Sets',
    subtitle: 'Expand for official Japanese binders',
    seriesPrefix: 'Japan',
  };
}

function normalizeSetSearchText(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/pok\u00e9mon/g, 'pokemon')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getEditDistanceWithin(left: string, right: string, maxDistance: number) {
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }

  return previous[right.length];
}

function getSetSearchText(set: PokemonSet) {
  return normalizeSetSearchText([
    set.name,
    set.localName,
    set.englishDisplayName,
    set.series,
    set.id,
    set.externalIds?.setCode,
    set.externalIds?.tcgdex,
    set.externalIds?.pokedata,
  ].filter(Boolean).join(' '));
}

function matchesSetSearch(set: PokemonSet, query: string) {
  if (!query) return true;
  const search = normalizeSetSearchText(query);
  const haystack = getSetSearchText(set);
  if (haystack.includes(search)) return true;

  const haystackTokens = haystack.split(' ').filter(Boolean);
  return search.split(' ').filter(Boolean).every((token) => (
    haystackTokens.some((candidate) => (
      candidate.includes(token)
      || token.includes(candidate)
      || (token.length >= 5 && getEditDistanceWithin(token, candidate, 2) <= 2)
    ))
  ));
}

type ExistingBinderSummary = {
  id: string;
  name: string | null;
  sourceSetId: string;
  language: string;
};

function normaliseSetKey(setId?: string | null, language?: string | null) {
  return `${normalizePokemonCardLanguage(language)}:${String(setId ?? '').trim().toLowerCase()}`;
}

async function fetchExistingSetBinders() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return {};

  const { data, error } = await supabase
    .from('binders')
    .select('id, name, source_set_id, language')
    .eq('user_id', user.id)
    .not('source_set_id', 'is', null);

  if (error) {
    console.log('Failed to load existing set binders', error.message);
    return {};
  }

  return (data ?? []).reduce<Record<string, ExistingBinderSummary>>((map, binder: any) => {
    const key = normaliseSetKey(binder.source_set_id, binder.language);
    if (!key || map[key]) return map;
    map[key] = {
      id: binder.id,
      name: binder.name ?? null,
      sourceSetId: binder.source_set_id,
      language: normalizePokemonCardLanguage(binder.language),
    };
    return map;
  }, {});
}

// ===============================
// SET CARD COMPONENT
// ===============================

function SetCard({
  item,
  existingBinder,
}: {
  item: PokemonSet;
  existingBinder?: ExistingBinderSummary;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const { theme } = useTheme();
  const raw = (item as any).raw_data ?? {};
  const setIdentityInput = {
    id: item.id,
    sourceId: item.externalIds?.tcgdex ?? raw.source_id ?? raw.provider_id ?? null,
    setCode: item.externalIds?.setCode ?? raw.set_code ?? item.id,
    language: item.language ?? raw.language ?? null,
    region: item.region ?? raw.region ?? null,
    localName: item.localName ?? raw.local_name ?? raw.localName ?? item.name ?? null,
    englishDisplayName: item.englishDisplayName ?? raw.english_display_name ?? raw.englishDisplayName ?? null,
    canonicalName: item.name,
    fallbackName: item.id,
    raw,
  };
  const displayName = getPreferredSetDisplayName(setIdentityInput);
  const rawEnglishSupplement = getEnglishSetDisplaySupplement(setIdentityInput);
  const englishValue = getEnglishSupplementalName(displayName, rawEnglishSupplement?.value);
  const englishSupplement = rawEnglishSupplement && englishValue
    ? { ...rawEnglishSupplement, value: englishValue }
    : null;
  const logoSource = getLocalSetArtworkSourceForSet({
    id: item.id,
    language: item.language,
    setCode: item.externalIds?.setCode,
    sourceId: item.externalIds?.tcgdex ?? item.externalIds?.pokedata,
    name: item.name,
    localName: item.localName,
    englishDisplayName: item.englishDisplayName,
    externalIds: item.externalIds,
  });
  const logoUrl = logoSource ? null : (getPokemonSetVisualUrl(item) ?? getPokemonSetLogoUrl(item.id, item.language));
  const hasExistingBinder = Boolean(existingBinder);

  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: '/set/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Open set ${displayName}`}
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        ...cardShadow,
      }}
      activeOpacity={0.8}
    >
      {/* Set logo */}
      <View style={{
        width: 88,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        borderRadius: 0,
      }}>
        {logoSource ? (
          <Image
            source={logoSource}
            style={{ width: 84, height: 40 }}
            resizeMode="contain"
          />
        ) : logoUrl && !logoFailed ? (
          <Image
            source={{ uri: logoUrl }}
            style={{ width: 84, height: 40 }}
            resizeMode="contain"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <Ionicons name="albums-outline" size={24} color={theme.colors.textSoft} />
        )}
      </View>

      {/* Set info */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }} numberOfLines={1}>
          {displayName}
        </Text>
        {englishSupplement ? (
          <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
            {englishSupplement.label} {englishSupplement.value}
          </Text>
        ) : null}
        <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 3 }}>
          {getPokemonLanguageDescriptor(item.language)?.label ?? item.language ?? 'English'} · {item.total} cards · {item.releaseDate ?? ''}
        </Text>
      </View>

      {/* CTA */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {hasExistingBinder ? (
          <View
            accessibilityRole="text"
            accessibilityLabel={`${item.name} already has a binder in your vault`}
            style={{
              backgroundColor: '#F3F0FF',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderWidth: 1,
              borderColor: '#DED5FF',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="checkmark-circle" size={13} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '900' }}>
              In Vault
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              router.push({
                pathname: '/binder/new',
                params: { sourceSetId: item.id, type: 'official', language: item.language ?? 'en' },
              });
            }}
            accessibilityRole="button"
            accessibilityLabel={`Create binder for ${item.name}`}
            style={{
              backgroundColor: theme.colors.primary + '18',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderWidth: 1,
              borderColor: theme.colors.primary + '40',
            }}
          >
            <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '900' }}>
              + Binder
            </Text>
          </TouchableOpacity>
        )}

        <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />
      </View>
    </TouchableOpacity>
  );
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function ExploreScreen() {
  const { theme } = useTheme();
  const [englishSets, setEnglishSets] = useState<PokemonSet[]>([]);
  const [japaneseSets, setJapaneseSets] = useState<PokemonSet[]>([]);
  const [simplifiedChineseSets, setSimplifiedChineseSets] = useState<PokemonSet[]>([]);
  const [traditionalChineseSets, setTraditionalChineseSets] = useState<PokemonSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState<DiscoverLanguageFilter>('all');
  const [existingBindersBySet, setExistingBindersBySet] = useState<Record<string, ExistingBinderSummary>>({});
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(
    new Set([getSeriesKey('en', 'Scarlet & Violet'), getSeriesKey('en', 'Sword & Shield')])
  );
  const [japaneseSetsExpanded, setJapaneseSetsExpanded] = useState(false);
  const [simplifiedChineseSetsExpanded, setSimplifiedChineseSetsExpanded] = useState(false);
  const [traditionalChineseSetsExpanded, setTraditionalChineseSetsExpanded] = useState(false);

  // ===============================
  // LOAD
  // ===============================

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [englishData, japaneseData, simplifiedChineseData, traditionalChineseData, existingBinders] = await Promise.all([
        fetchAllSets({ language: 'en' }),
        fetchAllSets({ language: 'ja', preferCanonicalApi: true }),
        fetchAllSets({ language: 'zh-cn', preferCanonicalApi: true }),
        fetchAllSets({ language: 'zh-tw', preferCanonicalApi: true }),
        fetchExistingSetBinders(),
      ]);
      setEnglishSets(englishData);
      setJapaneseSets(japaneseData);
      setSimplifiedChineseSets(simplifiedChineseData);
      setTraditionalChineseSets(traditionalChineseData);
      setExistingBindersBySet(existingBinders);
    } catch (error) {
      console.log('Failed to load sets', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // ===============================
  // SEARCH + GROUP
  // ===============================

  const searchedEnglishSets = useMemo(() => {
    const q = search.trim();
    return englishSets.filter((set) => matchesSetSearch(set, q));
  }, [englishSets, search]);

  const searchedJapaneseSets = useMemo(() => {
    const q = search.trim();
    return japaneseSets.filter((set) => matchesSetSearch(set, q));
  }, [japaneseSets, search]);

  const searchedSimplifiedChineseSets = useMemo(() => {
    const q = search.trim();
    return simplifiedChineseSets.filter((set) => matchesSetSearch(set, q));
  }, [simplifiedChineseSets, search]);

  const searchedTraditionalChineseSets = useMemo(() => {
    const q = search.trim();
    return traditionalChineseSets.filter((set) => matchesSetSearch(set, q));
  }, [traditionalChineseSets, search]);

  const filteredEnglishSets = useMemo(
    () => languageFilter === 'all' || languageFilter === 'en' ? searchedEnglishSets : [],
    [languageFilter, searchedEnglishSets]
  );

  const filteredJapaneseSets = useMemo(
    () => languageFilter === 'all' || languageFilter === 'ja' ? searchedJapaneseSets : [],
    [languageFilter, searchedJapaneseSets]
  );

  const filteredSimplifiedChineseSets = useMemo(
    () => languageFilter === 'all' || languageFilter === 'zh-cn' ? searchedSimplifiedChineseSets : [],
    [languageFilter, searchedSimplifiedChineseSets]
  );

  const filteredTraditionalChineseSets = useMemo(
    () => languageFilter === 'all' || languageFilter === 'zh-tw' ? searchedTraditionalChineseSets : [],
    [languageFilter, searchedTraditionalChineseSets]
  );

  const filteredSets = useMemo(
    () => [...filteredEnglishSets, ...filteredJapaneseSets, ...filteredSimplifiedChineseSets, ...filteredTraditionalChineseSets],
    [filteredEnglishSets, filteredJapaneseSets, filteredSimplifiedChineseSets, filteredTraditionalChineseSets]
  );

  const isSearching = search.trim().length > 0;

  const groupedEnglishSeries = useMemo(
    () => groupSetsBySeries(filteredEnglishSets),
    [filteredEnglishSets]
  );

  const groupedJapaneseSeries = useMemo(
    () => groupSetsBySeries(filteredJapaneseSets),
    [filteredJapaneseSets]
  );

  const groupedSimplifiedChineseSeries = useMemo(
    () => groupSetsBySeries(filteredSimplifiedChineseSets),
    [filteredSimplifiedChineseSets]
  );

  const groupedTraditionalChineseSeries = useMemo(
    () => groupSetsBySeries(filteredTraditionalChineseSets),
    [filteredTraditionalChineseSets]
  );

  const toggleSeries = (language: DiscoverSetLanguage, series: string) => {
    const key = getSeriesKey(language, series);
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAll = () => {
    setJapaneseSetsExpanded(true);
    setSimplifiedChineseSetsExpanded(true);
    setTraditionalChineseSetsExpanded(true);
    setExpandedSeries(new Set([
      ...groupedEnglishSeries.map((g) => getSeriesKey('en', g.series)),
      ...groupedJapaneseSeries.map((g) => getSeriesKey('ja', g.series)),
      ...groupedSimplifiedChineseSeries.map((g) => getSeriesKey('zh-cn', g.series)),
      ...groupedTraditionalChineseSeries.map((g) => getSeriesKey('zh-tw', g.series)),
    ]));
  };

  const collapseAll = () => {
    setJapaneseSetsExpanded(false);
    setSimplifiedChineseSetsExpanded(false);
    setTraditionalChineseSetsExpanded(false);
    setExpandedSeries(new Set());
  };

  const selectLanguageFilter = (nextFilter: DiscoverLanguageFilter) => {
    setLanguageFilter(nextFilter);
    if (nextFilter === 'all') return;

    if (nextFilter === 'ja') setJapaneseSetsExpanded(true);
    if (nextFilter === 'zh-cn') setSimplifiedChineseSetsExpanded(true);
    if (nextFilter === 'zh-tw') setTraditionalChineseSetsExpanded(true);

    const groups = nextFilter === 'en'
      ? groupedEnglishSeries
      : nextFilter === 'ja'
        ? groupedJapaneseSeries
        : nextFilter === 'zh-cn'
          ? groupedSimplifiedChineseSeries
          : groupedTraditionalChineseSeries;
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      groups.forEach((group) => next.add(getSeriesKey(nextFilter, group.series)));
      return next;
    });
  };

  // ===============================
  // RENDER
  // ===============================

  type ListItem =
    | { type: 'languageHeader'; language: Exclude<DiscoverSetLanguage, 'en'>; count: number; expanded: boolean }
    | { type: 'header'; language: DiscoverSetLanguage; series: string; count: number }
    | { type: 'set'; set: PokemonSet; series: string };

  const flatData = useMemo((): ListItem[] => {
    if (isSearching) {
      // No grouping during search — just flat list
      return filteredSets.map((set) => ({
        type: 'set' as const,
        set,
        series: set.series ?? 'Other',
      }));
    }

    const items: ListItem[] = [];

    if (languageFilter === 'all' || languageFilter === 'en') {
      for (const group of groupedEnglishSeries) {
        items.push({ type: 'header', language: 'en', series: group.series, count: group.sets.length });
        if (expandedSeries.has(getSeriesKey('en', group.series))) {
          for (const set of group.sets) {
            items.push({ type: 'set', set, series: group.series });
          }
        }
      }
    }

    if (languageFilter === 'all') {
      items.push({
        type: 'languageHeader',
        language: 'ja',
        count: filteredJapaneseSets.length,
        expanded: japaneseSetsExpanded,
      });
    }

    if (languageFilter === 'ja' || (languageFilter === 'all' && japaneseSetsExpanded)) {
      for (const group of groupedJapaneseSeries) {
        items.push({ type: 'header', language: 'ja', series: group.series, count: group.sets.length });
        if (expandedSeries.has(getSeriesKey('ja', group.series))) {
          for (const set of group.sets) {
            items.push({ type: 'set', set, series: group.series });
          }
        }
      }
    }

    if (languageFilter === 'all') {
      items.push({
        type: 'languageHeader',
        language: 'zh-cn',
        count: filteredSimplifiedChineseSets.length,
        expanded: simplifiedChineseSetsExpanded,
      });
    }

    if (languageFilter === 'zh-cn' || (languageFilter === 'all' && simplifiedChineseSetsExpanded)) {
      for (const group of groupedSimplifiedChineseSeries) {
        items.push({ type: 'header', language: 'zh-cn', series: group.series, count: group.sets.length });
        if (expandedSeries.has(getSeriesKey('zh-cn', group.series))) {
          for (const set of group.sets) {
            items.push({ type: 'set', set, series: group.series });
          }
        }
      }
    }

    if (languageFilter === 'all') {
      items.push({
        type: 'languageHeader',
        language: 'zh-tw',
        count: filteredTraditionalChineseSets.length,
        expanded: traditionalChineseSetsExpanded,
      });
    }

    if (languageFilter === 'zh-tw' || (languageFilter === 'all' && traditionalChineseSetsExpanded)) {
      for (const group of groupedTraditionalChineseSeries) {
        items.push({ type: 'header', language: 'zh-tw', series: group.series, count: group.sets.length });
        if (expandedSeries.has(getSeriesKey('zh-tw', group.series))) {
          for (const set of group.sets) {
            items.push({ type: 'set', set, series: group.series });
          }
        }
      }
    }

    return items;
  }, [
    expandedSeries,
    filteredJapaneseSets.length,
    filteredSimplifiedChineseSets.length,
    filteredTraditionalChineseSets.length,
    filteredSets,
    groupedEnglishSeries,
    groupedJapaneseSeries,
    groupedSimplifiedChineseSeries,
    groupedTraditionalChineseSeries,
    isSearching,
    japaneseSetsExpanded,
    languageFilter,
    simplifiedChineseSetsExpanded,
    traditionalChineseSetsExpanded,
  ]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
        <StackrBackdrop />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
            Loading sets...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
      <StackrBackdrop />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>

        <View style={{ position: 'relative', borderRadius: 24, padding: 12, marginBottom: 12, overflow: 'hidden', backgroundColor: `${theme.colors.card}CC`, borderWidth: 1, borderColor: theme.colors.border }}>
          <StackrHeroBackdrop opacity={0.24} />
        {/* Header */}
        <StackrPageTitle title="Discover Sets" accentText="Sets" style={{ marginBottom: 4 }} />
        <Text style={{ color: theme.colors.textSoft, fontSize: 14, marginBottom: 14 }}>
          Filter English, Japanese, Simplified Chinese or Traditional Chinese sets · {englishSets.length + japaneseSets.length + simplifiedChineseSets.length + traditionalChineseSets.length} sets available
        </Text>

        {/* Search */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.card,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: 10,
        }}>
          <Ionicons name="search" size={16} color={theme.colors.textSoft} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search sets by name or series..."
            placeholderTextColor={theme.colors.textSoft}
            autoCorrect={false}
            autoCapitalize="words"
            style={{ flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: '600' }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textSoft} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, marginTop: 10, paddingRight: 8 }}>
          {LANGUAGE_FILTERS.map((option) => {
            const active = languageFilter === option.key;
            const count = option.key === 'all'
              ? searchedEnglishSets.length + searchedJapaneseSets.length + searchedSimplifiedChineseSets.length + searchedTraditionalChineseSets.length
              : option.key === 'en'
                ? searchedEnglishSets.length
                : option.key === 'ja'
                  ? searchedJapaneseSets.length
                  : option.key === 'zh-cn'
                    ? searchedSimplifiedChineseSets.length
                    : searchedTraditionalChineseSets.length;

            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => {
                  selectLanguageFilter(option.key);
                }}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Show ${option.label} sets`}
                style={{
                  minHeight: 44,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                  backgroundColor: active ? theme.colors.primary + '14' : theme.colors.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {option.language ? (
                    <PokemonLanguageFlagIcon language={option.language} size={15} decorative />
                  ) : (
                    <Ionicons name="apps-outline" size={14} color={active ? theme.colors.primary : theme.colors.textSoft} />
                  )}
                  <Text style={{ color: active ? theme.colors.primary : theme.colors.text, fontSize: 12, lineHeight: 15, fontWeight: '900' }} numberOfLines={1}>
                    {option.label}
                  </Text>
                </View>
                <Text numeric style={{ color: theme.colors.textSoft, fontSize: 9.5, lineHeight: 12, fontWeight: '800', marginTop: 1 }}>
                  {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Expand / collapse all — only when not searching */}
        </View>

        {!isSearching && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <TouchableOpacity
              onPress={expandAll}
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 7,
                borderWidth: 1, borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                Expand all
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={collapseAll}
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 7,
                borderWidth: 1, borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                Collapse all
              </Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            <Text style={{ color: theme.colors.textSoft, fontSize: 12, alignSelf: 'center' }}>
              {filteredSets.length} sets
            </Text>
          </View>
        )}

        {/* Set list */}
        <FlatList
          data={flatData}
          keyExtractor={(item) =>
            item.type === 'languageHeader'
              ? `language-${item.language}`
              : item.type === 'header'
                ? `header-${item.language}-${item.series}`
                : `set-${item.set.language ?? 'en'}-${item.set.id}`
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: stackrTabContentPadding.standard }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={theme.colors.primary}
            />
          }
          renderItem={({ item }) => {
            if (item.type === 'languageHeader') {
              const copy = getLanguageHeaderCopy(item.language);
              return (
                <TouchableOpacity
                  onPress={() => {
                    if (item.language === 'ja') {
                      setJapaneseSetsExpanded((current) => !current);
                    } else if (item.language === 'zh-cn') {
                      setSimplifiedChineseSetsExpanded((current) => !current);
                    } else {
                      setTraditionalChineseSetsExpanded((current) => !current);
                    }
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 13,
                    paddingHorizontal: 12,
                    marginTop: 6,
                    marginBottom: 8,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.primary + '28',
                    backgroundColor: theme.colors.primary + '0D',
                  }}
                  activeOpacity={0.76}
                >
                  <PokemonLanguageFlagIcon language={item.language} size={28} decorative style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                      {copy.title}
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
                      {copy.subtitle}
                    </Text>
                  </View>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginRight: 8 }}>
                    {item.count} sets
                  </Text>
                  <Ionicons
                    name={item.expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.colors.textSoft}
                  />
                </TouchableOpacity>
              );
            }

            if (item.type === 'header') {
              const expanded = expandedSeries.has(getSeriesKey(item.language, item.series));
              const copy = item.language === 'en' ? null : getLanguageHeaderCopy(item.language);
              return (
                <TouchableOpacity
                  onPress={() => toggleSeries(item.language, item.series)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: item.language !== 'en' ? 10 : 4,
                    marginBottom: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, flex: 1 }}>
                    {copy ? `${copy.seriesPrefix} · ${item.series}` : item.series}
                  </Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginRight: 8 }}>
                    {item.count} sets
                  </Text>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.colors.textSoft}
                  />
                </TouchableOpacity>
              );
            }

            return (
              <SetCard
                item={item.set}
                existingBinder={existingBindersBySet[normaliseSetKey(item.set.id, item.set.language)]}
              />
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                No sets found
              </Text>
              <Text style={{ color: theme.colors.textSoft, marginTop: 8, textAlign: 'center' }}>
                Try a different search term.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}
