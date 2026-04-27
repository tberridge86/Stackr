import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '../../components/profile-context';
import { BACKGROUND_MAP } from '../../lib/backgrounds';
import { AVATAR_PRESETS } from '../../lib/avatars';
import { theme } from '../../lib/theme';
import {
  getCachedCardSync,
  getCachedCardsForSet,
} from '../../lib/pokemonTcgCache';

function TopLoaderCard({ label, card }: { label: string; card: any | null }) {
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
    return (
      BACKGROUND_MAP[profile?.background_key ?? 'galaxy'] ??
      BACKGROUND_MAP['galaxy']
    );
  }, [profile?.background_key]);

  const avatar = useMemo(() => {
    return (
      AVATAR_PRESETS.find((a) => a.key === profile?.avatar_preset) ?? null
    );
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
  }, 
  [profile]
);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
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
        <View style={styles.heroTopRow}>
          <View style={styles.avatarWrap}>
            {avatar?.image ? (
              <Image source={avatar.image} style={styles.avatar} />
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

      {/* Showcase */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Showcase</Text>
          {showcaseLoading && (
            <ActivityIndicator color={theme.colors.primary} size="small" />
          )}
        </View>

        <View style={styles.topLoaderRow}>
          <TopLoaderCard label="Favourite Card" card={favoriteCard} />
          <TopLoaderCard label="Chase Card" card={chaseCard} />
        </View>
      </View>

      {/* Quick Access */}
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
          <Ionicons name="storefront-outline" size={20} color="#FFD166" />
          <Text style={styles.quickActionText}>Open Marketplace</Text>
          <Ionicons name="chevron-forward" size={18} color="#94A0C9" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 120 },

  centered: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: { color: theme.colors.textSoft, marginTop: 12 },

  errorTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: theme.colors.textSoft,
    marginTop: 6,
  },

  setupButton: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    padding: 12,
    borderRadius: 12,
  },
  setupButtonText: {
    color: '#fff',
    fontWeight: '900',
  },

  heroCard: {
    borderRadius: 26,
    padding: 18,
    marginBottom: 20,
  },

  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  avatarWrap: {
    width: 86,
    height: 86,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  avatar: { width: 82, height: 82 },

  avatarFallback: { justifyContent: 'center', alignItems: 'center' },

  editButton: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 10,
    borderRadius: 12,
  },

  editButtonText: { color: '#fff', marginLeft: 6 },

  collectorName: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 16,
  },

  collectorMeta: { color: '#ccc', marginTop: 6 },

  section: { marginBottom: 20 },

  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },

  topLoaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  topLoaderWrap: { width: '48%', alignItems: 'center' },

  topLoaderLabel: {
    color: theme.colors.secondary,
    fontWeight: '800',
    marginBottom: 10,
  },

  topLoaderOuter: {
    backgroundColor: '#d8dde6',
    borderRadius: 18,
    padding: 10,
    width: '100%',
  },

  topLoaderInner: {
    backgroundColor: '#f4f7fb',
    borderRadius: 12,
    minHeight: 190,
    justifyContent: 'center',
    alignItems: 'center',
  },

  topLoaderImage: { width: 120, height: 168 },

  topLoaderEmpty: { alignItems: 'center' },

  topLoaderEmptyText: { color: '#7c859f' },

  topLoaderName: {
    color: theme.colors.text,
    marginTop: 10,
  },

  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },

  quickActionText: {
    flex: 1,
    color: theme.colors.text,
    marginLeft: 12,
  },
});