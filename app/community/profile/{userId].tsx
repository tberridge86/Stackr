import { theme } from '../../../lib/theme';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AVATAR_PRESETS } from '../../../lib/avatars';
import { supabase } from '../../../lib/supabase';

type Profile = {
  id: string;
  collector_name: string | null;
  avatar_preset: string | null;
  pokemon_type: string | null;
};

type Binder = {
  id: string;
  name: string;
  color: string | null;
  type: string;
  source_set_id: string | null;
};

type SocialPost = {
  id: string;
  body: string | null;
  card_id: string | null;
  set_id: string | null;
  created_at: string;
};

type CardPreview = {
  id: string;
  name: string;
  set_id: string;
  image_small: string | null;
  image_large: string | null;
  raw_data?: any;
};

function timeAgo(dateString: string) {
  const then = new Date(dateString).getTime();
  const diff = Math.max(0, Date.now() - then);

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default function PublicCollectorProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const profileUserId = Array.isArray(userId) ? userId[0] : userId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [binders, setBinders] = useState<Binder[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [cards, setCards] = useState<Record<string, CardPreview>>({});
  const [ownedCount, setOwnedCount] = useState(0);
  const [showcaseCount, setShowcaseCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const avatar = useMemo(() => {
    return AVATAR_PRESETS.find((a) => a.key === profile?.avatar_preset) ?? null;
  }, [profile?.avatar_preset]);

  const loadProfile = async () => {
    if (!profileUserId) return;

    try {
      setLoading(true);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, collector_name, avatar_preset, pokemon_type')
        .eq('id', profileUserId)
        .maybeSingle();

      if (profileError) throw profileError;

      setProfile(profileData as Profile | null);

      const { data: binderData, error: binderError } = await supabase
        .from('binders')
        .select('id, name, color, type, source_set_id')
        .eq('user_id', profileUserId)
        .order('created_at', { ascending: false });

      if (binderError) throw binderError;

      const nextBinders = (binderData ?? []) as Binder[];
      setBinders(nextBinders);

      const binderIds = nextBinders.map((binder) => binder.id);

      if (binderIds.length) {
        const { count: ownedTotal } = await supabase
          .from('binder_cards')
          .select('*', { count: 'exact', head: true })
          .in('binder_id', binderIds)
          .eq('owned', true);

        setOwnedCount(ownedTotal ?? 0);
      } else {
        setOwnedCount(0);
      }

      const { count: showcaseTotal } = await supabase
        .from('binder_card_showcases')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profileUserId);

      setShowcaseCount(showcaseTotal ?? 0);

      const { data: postData, error: postError } = await supabase
        .from('social_posts')
        .select('id, body, card_id, set_id, created_at')
        .eq('user_id', profileUserId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (postError) throw postError;

      const nextPosts = (postData ?? []) as SocialPost[];
      setPosts(nextPosts);

      const cardIds = [
        ...new Set(nextPosts.map((post) => post.card_id).filter(Boolean)),
      ] as string[];

      if (cardIds.length) {
        const { data: cardData } = await supabase
          .from('pokemon_cards')
          .select('id, name, set_id, image_small, image_large, raw_data')
          .in('id', cardIds);

        setCards(
          Object.fromEntries((cardData ?? []).map((card) => [card.id, card]))
        );
      } else {
        setCards({});
      }
    } catch (error) {
      console.log('Public profile load failed', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [profileUserId]);

  const renderPost = ({ item }: { item: SocialPost }) => {
    const card = item.card_id ? cards[item.card_id] : null;

    return (
      <View style={styles.postCard}>
        <Text style={styles.postTime}>{timeAgo(item.created_at)}</Text>

        {item.body ? <Text style={styles.postBody}>{item.body}</Text> : null}

        {card && (
          <View style={styles.attachedCard}>
            {card.image_small || card.image_large ? (
              <Image
                source={{ uri: card.image_small ?? card.image_large ?? '' }}
                style={styles.cardImage}
                resizeMode="contain"
              />
            ) : null}

            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{card.name}</Text>
              <Text style={styles.cardSet}>
                {card.raw_data?.set?.name ?? card.set_id}
              </Text>
              {card.raw_data?.rarity && (
                <Text style={styles.cardRarity}>{card.raw_data.rarity}</Text>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading collector...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Collector not found</Text>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        ListHeaderComponent={
          <View>
            <Pressable onPress={() => router.back()} style={styles.backRow}>
              <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>

            <View style={styles.headerCard}>
              <View style={styles.avatar}>
                {avatar?.image ? (
                  <Image source={avatar.image} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={34} color="#fff" />
                )}
              </View>

              <Text style={styles.name}>
                {profile.collector_name ?? 'Collector'}
              </Text>

              <Text style={styles.meta}>
                {profile.pokemon_type
                  ? `${profile.pokemon_type.charAt(0).toUpperCase()}${profile.pokemon_type.slice(1)} Trainer`
                  : 'Collector Profile'}
              </Text>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{ownedCount}</Text>
                  <Text style={styles.statLabel}>Cards</Text>
                </View>

                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{binders.length}</Text>
                  <Text style={styles.statLabel}>Binders</Text>
                </View>

                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{showcaseCount}</Text>
                  <Text style={styles.statLabel}>Showcase</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Public binders</Text>

            <View style={styles.binderGrid}>
              {binders.length ? (
                binders.slice(0, 6).map((binder) => (
                  <View key={binder.id} style={styles.binderCard}>
                    <View
                      style={[
                        styles.binderStripe,
                        { backgroundColor: binder.color ?? theme.colors.primary },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.binderName}>
                        {binder.name}
                      </Text>
                      <Text style={styles.binderType}>
                        {binder.type === 'official' ? 'Official set' : 'Custom'}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No public binders yet.</Text>
              )}
            </View>

            <Text style={styles.sectionTitle}>Recent posts</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptyText}>
              This collector has not shared anything yet.
            </Text>
          </View>
        }
        contentContainerStyle={styles.content}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 120 },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  loadingText: {
    color: theme.colors.textSoft,
    marginTop: 12,
  },

  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  backText: {
    color: theme.colors.text,
    fontWeight: '900',
  },

  headerCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 22,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  avatar: {
    width: 92,
    height: 92,
    borderRadius: 26,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 12,
  },

  avatarImage: {
    width: 92,
    height: 92,
  },

  name: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
  },

  meta: {
    color: theme.colors.textSoft,
    marginTop: 4,
    fontWeight: '700',
  },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },

  statBox: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  statNumber: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 18,
  },

  statLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    marginTop: 3,
    fontWeight: '800',
  },

  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 20,
    marginBottom: 10,
  },

  binderGrid: {
    gap: 10,
  },

  binderCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },

  binderStripe: {
    width: 12,
  },

  binderName: {
    color: theme.colors.text,
    fontWeight: '900',
    paddingTop: 12,
    paddingHorizontal: 12,
  },

  binderType: {
    color: theme.colors.textSoft,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    marginTop: 3,
  },

  postCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  postTime: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
  },

  postBody: {
    color: theme.colors.text,
    marginTop: 8,
    lineHeight: 20,
    fontWeight: '700',
  },

  attachedCard: {
    flexDirection: 'row',
    marginTop: 12,
    backgroundColor: theme.colors.bg,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  cardImage: {
    width: 74,
    height: 104,
    marginRight: 12,
  },

  cardName: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
  },

  cardSet: {
    color: theme.colors.textSoft,
    marginTop: 4,
    fontSize: 12,
  },

  cardRarity: {
    color: '#FFD166',
    marginTop: 3,
    fontSize: 12,
    fontWeight: '900',
  },

  emptyState: {
    alignItems: 'center',
    padding: 24,
  },

  emptyTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
  },

  emptyText: {
    color: theme.colors.textSoft,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },

  backButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 14,
  },

  backButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
});