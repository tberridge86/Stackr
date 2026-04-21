import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View, Pressable, ScrollView, Image, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { fetchAllSets, PokemonSet } from '../lib/pokemonTcg';
import { useCollection } from '../components/collection-context';

function SetCard({
  set,
  tracked,
  onToggleTrack,
}: {
  set: PokemonSet;
  tracked: boolean;
  onToggleTrack: () => void;
}) {
  return (
    <Pressable
      onPress={() => router.push(`/set/${set.id}`)}
      style={({ pressed }) => [
        styles.card,
        tracked && styles.cardTracked,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardBadge}>
          {set.images?.symbol ? (
            <Image source={{ uri: set.images.symbol }} style={styles.symbolImage} resizeMode="contain" />
          ) : (
            <Ionicons
              name="albums"
              size={18}
              color={tracked ? '#0b0f2a' : '#FFD166'}
            />
          )}
        </View>

        <View style={styles.cardTextWrap}>
          <Text style={[styles.cardTitle, tracked && styles.cardTitleTracked]}>
            {set.name}
          </Text>
          <Text style={[styles.cardSubtitle, tracked && styles.cardSubtitleTracked]}>
            {set.series} · {set.total} cards
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={18}
          color={tracked ? '#0b0f2a' : '#94a0c9'}
        />
      </View>

      <View style={styles.cardBottom}>
        <Text style={[styles.cardMeta, tracked && styles.cardMetaTracked]}>
          {set.releaseDate}
        </Text>

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onToggleTrack();
          }}
          style={({ pressed }) => [
            styles.trackButton,
            tracked && styles.trackButtonActive,
            pressed && styles.cardPressed,
          ]}
        >
          <Text style={[styles.trackButtonText, tracked && styles.trackButtonTextActive]}>
            {tracked ? 'Tracking' : 'Track'}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function CollectionScreen() {
  const { trackedSetIds, toggleTrackedSet, isTracked } = useCollection();
  const [allSets, setAllSets] = useState<PokemonSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const loadSets = async () => {
      try {
        const sets = await fetchAllSets();
        setAllSets(sets);
      } catch (error) {
        console.log('Failed to fetch sets', error);
      } finally {
        setLoading(false);
      }
    };

    loadSets();
  }, []);

  const trackedSets = useMemo(
    () => allSets.filter((set) => trackedSetIds.includes(set.id)),
    [allSets, trackedSetIds]
  );

  const filteredSets = useMemo(() => {
    return allSets.filter((set) => {
      const q = search.toLowerCase();
      return (
        set.name.toLowerCase().includes(q) ||
        set.series.toLowerCase().includes(q)
      );
    });
  }, [allSets, search]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={18} color="#fff" />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.heading}>My Sets</Text>
            <Text style={styles.subheading}>Choose which sets you want to track.</Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="#8f9bc2" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search sets..."
            placeholderTextColor="#8f9bc2"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{trackedSets.length}</Text>
            <Text style={styles.statLabel}>Tracked</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{loading ? '...' : allSets.length}</Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Tracked sets</Text>
        <View style={styles.grid}>
          {trackedSets.length > 0 ? (
            trackedSets.map((set) => (
              <SetCard
                key={set.id}
                set={set}
                tracked={true}
                onToggleTrack={() => toggleTrackedSet(set.id)}
              />
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No tracked sets yet</Text>
              <Text style={styles.emptySubtitle}>Pick a set below to start tracking it.</Text>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>All available sets</Text>
        <View style={styles.grid}>
          {loading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Loading sets...</Text>
              <Text style={styles.emptySubtitle}>Pulling live data from the API.</Text>
            </View>
          ) : (
            filteredSets.map((set) => (
              <SetCard
                key={set.id}
                set={set}
                tracked={isTracked(set.id)}
                onToggleTrack={() => toggleTrackedSet(set.id)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080b1d' },
  container: { padding: 18, paddingBottom: 120 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#121938',
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
  searchWrap: {
    backgroundColor: '#121938',
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
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#111735',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statValue: {
    color: '#FFD166',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  statLabel: {
    color: '#91A0C8',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  grid: {
    gap: 14,
  },
  card: {
    backgroundColor: '#121938',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardTracked: {
    backgroundColor: '#FFD166',
    borderColor: '#FFD166',
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.94,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,209,102,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  symbolImage: {
    width: 24,
    height: 24,
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardTitleTracked: {
    color: '#0b0f2a',
  },
  cardSubtitle: {
    color: '#AAB3D1',
    fontSize: 14,
  },
  cardSubtitleTracked: {
    color: 'rgba(11,15,42,0.72)',
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardMeta: {
    color: '#FFD166',
    fontSize: 13,
    fontWeight: '700',
  },
  cardMetaTracked: {
    color: '#0b0f2a',
  },
  trackButton: {
    backgroundColor: 'rgba(255,209,102,0.12)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  trackButtonActive: {
    backgroundColor: '#0b0f2a',
  },
  trackButtonText: {
    color: '#FFD166',
    fontWeight: '800',
    fontSize: 12,
  },
  trackButtonTextActive: {
    color: '#FFD166',
  },
  emptyCard: {
    backgroundColor: '#121938',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySubtitle: {
    color: '#AAB3D1',
    fontSize: 14,
  },
});