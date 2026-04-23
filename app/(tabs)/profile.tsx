import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '../../components/profile-context';
import { getBackgroundByKey } from '../../lib/backgrounds';
import { getAvatarByPreset } from '../../lib/avatars';
import {
  getCachedCardSync,
  getCachedCardsForSet,
} from '../../lib/pokemonTcgCache';

function TopLoaderCard({
  label,
  card,
}: {
  label: string;
  card: any | null;
}) {
  return (
    <View style={styles.topLoaderWrap}>
      <Text style={styles.topLoaderLabel}>{label}</Text>

      <View style={styles.topLoaderOuter}>
        <View style={styles.topLoaderInner}>
          {card?.images?.small ? (
            <Image
              source={{ uri: card.images.small }}
              style={styles.topLoaderImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.topLoaderEmpty}>
              <Ionicons name="image-outline" size={28} color="#7c859f" />
              <Text style={styles.topLoaderEmptyText}>Not set</Text>
            </View>
          )}
        </View>

        <View style={styles.topLoaderGloss} />
      </View>

      <Text style={styles.topLoaderName} numberOfLines={2}>
        {card?.name ?? 'No card selected'}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { profile, loading } = useProfile();

  const [favoriteCard, setFavoriteCard] = useState<any | null>(null);
  const [chaseCard, setChaseCard] = useState<any | null>(null);
  const [showcaseLoading, setShowcaseLoading] = useState(false);

  const background = useMemo(() => {
    return getBackgroundByKey(profile?.background_key ?? null);
  }, [profile?.background_key]);

  const avatar = useMemo(() => {
    return getAvatarByPreset(profile?.avatar_preset ?? null);
  }, [profile?.avatar_preset]);

  useEffect(() => {
    let mounted = true;

    const loadCard = async (cardId?: string | null, setId?: string | null) => {
      if (!cardId || !setId) return null;

      let found = getCachedCardSync(setId, cardId);

      if (!found) {
        const cards = await getCachedCardsForSet(setId);
        found = cards.find((c) => c.id === cardId) ?? null;
      }

      return found;
    };

    const loadShowcaseCards = async () => {
      if (!profile) return;

      try {
        setShowcaseLoading(true);

        const [fav, chase] = await Promise.all([
          loadCard(profile.favorite_card_id, profile.favorite_set_id),
          loadCard(profile.chase_card_id, profile.chase_set_id),
        ]);

        if (mounted) {
          setFavoriteCard(fav);
          setChaseCard(chase);
        }
      } catch (error) {
        console.log('Failed to load showcase cards', error);
      } finally {
        if (mounted) setShowcaseLoading(false);
      }
    };

    loadShowcaseCards();

    return () => {
      mounted = false;
    };
  }, [
    profile?.favorite_card_id,
    profile?.favorite_set_id,
    profile?.chase_card_id,
    profile?.chase_set_id,
    profile?.id,
  ]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#fff" size="large" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>No profile found</Text>
        <Text style={styles.errorText}>
          Complete your profile setup to continue.
        </Text>

        <TouchableOpacity
          onPress={() => router.push('/profile/setup')}
          style={styles.setupButton}
        >
          <Text style={styles.setupButtonText}>Set Up Profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: background?.colors?.[0] ?? '#1b1f3a',
          },
        ]}
      >
        <View style={styles.heroOverlay} />

        <View style={styles.heroTopRow}>
          <View style={styles.avatarWrap}>
            {avatar?.image ? (
              <Image source={avatar.image} style={styles.avatar} resizeMode="contain" />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={34} color="#fff" />
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={() => router.push('/profile/setup')}
            style={styles.editButton}
          >
            <Ionicons name="create-outline" size={16} color="#fff" />
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.collectorName}>
          {profile.collector_name ?? 'Collector'}
        </Text>

        <Text style={styles.collectorMeta}>
          {profile.pokemon_type
            ? `${profile.pokemon_type} Collector`
            : 'Collector Profile'}
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Showcase</Text>
          {showcaseLoading && <ActivityIndicator color="#fff" size="small" />}
        </View>

        <View style={styles.topLoaderRow}>
          <TopLoaderCard label="Favourite Card" card={favoriteCard} />
          <TopLoaderCard label="Chase Card" card={chaseCard} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Collector Details</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Collector Name</Text>
            <Text style={styles.infoValue}>
              {profile.collector_name ?? 'Not set'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Pokémon Type</Text>
            <Text style={styles.infoValue}>
              {profile.pokemon_type ?? 'Not set'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Background</Text>
            <Text style={styles.infoValue}>
              {profile.background_key ?? 'Default'}
            </Text>
          </View>

          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>
              {profile.email ?? 'Not available'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Access</Text>

        <TouchableOpacity
          onPress={() => router.push('/binder')}
          style={styles.quickAction}
        >
          <Ionicons name="folder-open-outline" size={20} color="#FFD166" />
          <Text style={styles.quickActionText}>Open Binders</Text>
          <Ionicons name="chevron-forward" size={18} color="#94A0C9" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/trade')}
          style={styles.quickAction}
        >
          <Ionicons name="swap-horizontal" size={20} color="#FFD166" />
          <Text style={styles.quickActionText}>Open Trade Hub</Text>
          <Ionicons name="chevron-forward" size={18} color="#94A0C9" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080b1d',
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  centered: {
    flex: 1,
    backgroundColor: '#080b1d',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#AAB3D1',
    marginTop: 12,
  },
  errorTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  errorText: {
    color: '#AAB3D1',
    textAlign: 'center',
    marginBottom: 18,
  },
  setupButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  setupButtonText: {
    color: 'white',
    fontWeight: '800',
  },

  heroCard: {
    borderRadius: 26,
    padding: 18,
    marginBottom: 20,
    overflow: 'hidden',
    minHeight: 180,
    justifyContent: 'space-between',
  },
  heroOverlay: {
    position: 'absolute',
    right: -30,
    top: -20,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  avatarWrap: {
    width: 86,
    height: 86,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 82,
    height: 82,
  },
  avatarFallback: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  editButtonText: {
    color: 'white',
    fontWeight: '800',
    marginLeft: 6,
  },
  collectorName: {
    color: 'white',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 18,
  },
  collectorMeta: {
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
    fontSize: 14,
  },

  section: {
    marginBottom: 20,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },

  topLoaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topLoaderWrap: {
    width: '48%',
    alignItems: 'center',
  },
  topLoaderLabel: {
    color: '#FFD166',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  topLoaderOuter: {
    width: '100%',
    backgroundColor: '#d8dde6',
    borderRadius: 18,
    padding: 10,
    borderWidth: 2,
    borderColor: '#eef2f7',
    position: 'relative',
    overflow: 'hidden',
  },
  topLoaderInner: {
    backgroundColor: '#f4f7fb',
    borderRadius: 12,
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  topLoaderImage: {
    width: 120,
    height: 168,
  },
  topLoaderEmpty: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLoaderEmptyText: {
    color: '#7c859f',
    marginTop: 8,
    fontWeight: '700',
  },
  topLoaderGloss: {
    position: 'absolute',
    top: 0,
    left: 10,
    width: 26,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  topLoaderName: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
    minHeight: 34,
  },

  infoCard: {
    backgroundColor: '#121938',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  infoRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    color: '#94A0C9',
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '700',
  },
  infoValue: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },

  quickAction: {
    backgroundColor: '#121938',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickActionText: {
    flex: 1,
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 12,
  },
});