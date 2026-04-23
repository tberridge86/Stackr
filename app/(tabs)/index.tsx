import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCollection } from '../../components/collection-context';
import { fetchAllSets, PokemonSet } from '../../lib/pokemonTcg';

function StatPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SetCard({
  set,
  accent,
}: {
  set: PokemonSet;
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={() => router.push(`/set/${set.id}`)}
      style={({ pressed }) => [
        styles.setCard,
        accent && styles.setCardAccent,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.setCardTop}>
        <View style={styles.setCardTitleWrap}>
          {set.images?.logo ? (
            <Image source={{ uri: set.images.logo }} style={styles.setLogo} resizeMode="contain" />
          ) : (
            <Text style={[styles.setCardTitle, accent && styles.setCardTitleAccent]}>
              {set.name}
            </Text>
          )}
          <Text style={[styles.setCardSubtitle, accent && styles.setCardSubtitleAccent]}>
            {set.total} cards · {set.series}
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={18}
          color={accent ? '#0b0f2a' : '#94a0c9'}
        />
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, accent && styles.progressFillAccent]} />
      </View>
    </Pressable>
  );
}

function ActionTile({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionTile, pressed && styles.cardPressed]}>
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={18} color="#FFD166" />
      </View>
      <View style={styles.actionTextWrap}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function BinderShelfTile({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.binderShelfTile, pressed && styles.cardPressed]}>
      <View style={styles.binderSpine} />
      <View style={styles.binderCover}>
        <View style={styles.binderLabelStrip}>
          <Text style={styles.binderLabelText}>BINDER</Text>
        </View>

        <View style={styles.binderContent}>
          <View style={styles.binderIconWrap}>
            <Ionicons name="folder-open-outline" size={22} color="#FFD166" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.binderTitle}>My Binders</Text>
            <Text style={styles.binderSubtitle}>
              Open your themed collection folders
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A0C9" />
        </View>
      </View>
    </Pressable>
  );
}

export default function HubScreen() {
  const { trackedSetIds } = useCollection();
  const [allSets, setAllSets] = useState<PokemonSet[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.topBarBrand}>PocketVault</Text>
            <Text style={styles.topBarSubtitle}>Collector dashboard</Text>
          </View>

          <Pressable
            onPress={() => router.push('/profile')}
            style={({ pressed }) => [styles.profileButton, pressed && styles.cardPressed]}
          >
            <Ionicons name="person-circle-outline" size={28} color="#ffffff" />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Text style={styles.brand}>PocketVault</Text>
          <Text style={styles.heading}>Your collection, properly organised.</Text>
          <Text style={styles.subheading}>
            Track your sets, jump into your binder, scan cards quickly, and keep an eye on value.
          </Text>

          <View style={styles.statsRow}>
            <StatPill label="Tracked Sets" value={String(trackedSetIds.length)} />
            <StatPill label="Available Sets" value={loading ? '...' : String(allSets.length)} />
            <StatPill label="For Trade" value="29" />
          </View>

          <Pressable style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}>
            <Ionicons name="scan" size={22} color="#0b0f2a" />
            <Text style={styles.scanButtonText}>Scan Cards</Text>
          </Pressable>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Tracked sets</Text>
          <Pressable onPress={() => router.push('/collection')}>
            <Text style={styles.sectionLink}>View all</Text>
          </Pressable>
        </View>

        <View style={styles.grid}>
          {loading ? (
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderText}>Loading sets...</Text>
            </View>
          ) : trackedSets.length > 0 ? (
            trackedSets.slice(0, 4).map((set, index) => (
              <SetCard key={set.id} set={set} accent={index === 0} />
            ))
          ) : (
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderText}>No tracked sets yet. Tap “View all” to choose some.</Text>
            </View>
          )}
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
        </View>

        <View style={styles.actionGrid}>
          <BinderShelfTile onPress={() => router.push('/binder')} />

          <ActionTile
            icon="swap-horizontal"
            title="Trade Hub"
            subtitle="Manage trade cards"
            onPress={() => router.push('/trade')}
          />

          <ActionTile
            icon="stats-chart"
            title="Market"
            subtitle="Track prices and sold values"
            onPress={() => router.push('/market')}
          />

          <ActionTile
            icon="desktop-outline"
            title="Pokédex"
            subtitle="Explore entries"
            onPress={() => router.push('/pokedex')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080b1d' },
  container: { padding: 18, paddingBottom: 120 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  topBarBrand: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  topBarSubtitle: {
    color: '#94A0C9',
    fontSize: 13,
    marginTop: 4,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#121938',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },

  heroCard: {
    backgroundColor: '#111735',
    borderRadius: 26,
    padding: 20,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(255,209,102,0.08)',
    top: -70,
    right: -40,
  },
  brand: {
    color: '#FFD166',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  heading: {
    color: '#ffffff',
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900',
    marginBottom: 10,
  },
  subheading: {
    color: '#AAB3D1',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
    maxWidth: '92%',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  statPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    color: '#91A0C8',
    fontSize: 11,
    fontWeight: '600',
  },
  scanButton: {
    backgroundColor: '#FFD166',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  scanButtonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.95,
  },
  scanButtonText: {
    color: '#0b0f2a',
    fontSize: 16,
    fontWeight: '900',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionLink: {
    color: '#FFD166',
    fontSize: 13,
    fontWeight: '700',
  },
  grid: {
    gap: 14,
    marginBottom: 24,
  },
  setCard: {
    backgroundColor: '#121938',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  setCardAccent: {
    backgroundColor: '#FFD166',
    borderColor: '#FFD166',
  },
  setCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  setCardTitleWrap: {
    flex: 1,
    marginRight: 10,
  },
  setLogo: {
    width: 150,
    height: 42,
    marginBottom: 6,
  },
  setCardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  setCardTitleAccent: {
    color: '#0b0f2a',
  },
  setCardSubtitle: {
    color: '#AAB3D1',
    fontSize: 14,
    lineHeight: 20,
  },
  setCardSubtitleAccent: {
    color: 'rgba(11,15,42,0.72)',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    width: '48%',
    height: '100%',
    backgroundColor: '#FFD166',
    borderRadius: 999,
  },
  progressFillAccent: {
    backgroundColor: '#0b0f2a',
    width: '72%',
  },

  actionGrid: {
    gap: 12,
  },
  binderShelfTile: {
    flexDirection: 'row',
    borderRadius: 22,
    overflow: 'hidden',
    minHeight: 92,
    backgroundColor: '#121938',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  binderSpine: {
    width: 18,
    backgroundColor: '#2563eb',
  },
  binderCover: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
  },
  binderLabelStrip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  binderLabelText: {
    color: '#AAB3D1',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  binderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  binderIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,209,102,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  binderTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 3,
  },
  binderSubtitle: {
    color: '#94A0C9',
    fontSize: 13,
    lineHeight: 18,
  },

  actionTile: {
    backgroundColor: '#121938',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,209,102,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 3,
  },
  actionSubtitle: {
    color: '#94A0C9',
    fontSize: 13,
    lineHeight: 18,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.94,
  },
  placeholderCard: {
    backgroundColor: '#121938',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  placeholderText: {
    color: '#AAB3D1',
    fontSize: 14,
    lineHeight: 20,
  },
});