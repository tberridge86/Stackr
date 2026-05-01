import { theme } from '../../lib/theme';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchAllSets, PokemonSet } from '../../lib/pokemonTcg';

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

// ===============================
// SET CARD COMPONENT
// ===============================

function SetCard({ item }: { item: PokemonSet }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoUrl = `https://images.pokemontcg.io/${item.id}/logo.png`;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/set/${item.id}`)}
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
        width: 80,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: 8,
      }}>
        {!logoFailed ? (
          <Image
            source={{ uri: logoUrl }}
            style={{ width: 76, height: 40 }}
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
          {item.name}
        </Text>
        <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 3 }}>
          {item.total} cards · {item.releaseDate ?? ''}
        </Text>
      </View>

      {/* CTA */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            router.push({
              pathname: '/binder/new',
              params: { sourceSetId: item.id, type: 'official' },
            });
          }}
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

        <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />
      </View>
    </TouchableOpacity>
  );
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function ExploreScreen() {
  const [sets, setSets] = useState<PokemonSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(
    new Set(['Scarlet & Violet', 'Sword & Shield'])
  );

  // ===============================
  // LOAD
  // ===============================

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const data = await fetchAllSets();
      setSets(data);
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

  const filteredSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sets;
    return sets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.series?.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    );
  }, [sets, search]);

  const isSearching = search.trim().length > 0;

  const groupedSeries = useMemo(
    () => groupSetsBySeries(filteredSets),
    [filteredSets]
  );

  const toggleSeries = (series: string) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(series)) {
        next.delete(series);
      } else {
        next.add(series);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSeries(new Set(groupedSeries.map((g) => g.series)));
  };

  const collapseAll = () => {
    setExpandedSeries(new Set());
  };

  // ===============================
  // RENDER
  // ===============================

  type ListItem =
    | { type: 'header'; series: string; count: number }
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

    for (const group of groupedSeries) {
      items.push({ type: 'header', series: group.series, count: group.sets.length });
      if (expandedSeries.has(group.series)) {
        for (const set of group.sets) {
          items.push({ type: 'set', set, series: group.series });
        }
      }
    }

    return items;
  }, [groupedSeries, expandedSeries, isSearching, filteredSets]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>

        {/* Header */}
        <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '900', marginBottom: 4 }}>
          Explore
        </Text>
        <Text style={{ color: theme.colors.textSoft, fontSize: 14, marginBottom: 14 }}>
          Browse all Pokémon TCG sets · {sets.length} sets available
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
          marginBottom: 12,
          gap: 10,
        }}>
          <Ionicons name="search" size={16} color={theme.colors.textSoft} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search sets by name or series..."
            placeholderTextColor={theme.colors.textSoft}
            style={{ flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: '600' }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textSoft} />
            </TouchableOpacity>
          )}
        </View>

        {/* Expand / collapse all — only when not searching */}
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
            item.type === 'header' ? `header-${item.series}` : `set-${item.set.id}`
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={theme.colors.primary}
            />
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              const expanded = expandedSeries.has(item.series);
              return (
                <TouchableOpacity
                  onPress={() => toggleSeries(item.series)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: 4,
                    marginBottom: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, flex: 1 }}>
                    {item.series}
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

            return <SetCard item={item.set} />;
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