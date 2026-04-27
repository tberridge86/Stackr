import { theme } from '../../../lib/theme';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Image,
  Pressable,
} from 'react-native';
import { Text } from '../../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityPost,
  ReactionType,
  fetchActivityFeed,
  toggleActivityReaction,
  toggleFollowUser,
} from '../../../lib/activity';
import { AVATAR_PRESETS } from '../../../lib/avatars';
import { supabase } from '../../../lib/supabase';

type CardPreview = {
  card_id: string;
  name: string;
  set_name: string | null;
  image_url: string | null;
};

type FeedMode = 'global' | 'friends';

const POKEMON_TCG_API = 'https://api.pokemontcg.io/v2/cards';

function timeAgo(dateString: string) {
  const then = new Date(dateString).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

async function fetchCardPreviewFromAPI(cardId: string): Promise<CardPreview | null> {
  try {
    const res = await fetch(`${POKEMON_TCG_API}/${cardId}`);
    const json = await res.json();
    const card = json?.data;

    if (!card) return null;

    return {
      card_id: card.id,
      name: card.name,
      set_name: card.set?.name ?? null,
      image_url: card.images?.small ?? card.images?.large ?? null,
    };
  } catch {
    return null;
  }
}

export default function CommunityScreen() {
  const [feed, setFeed] = useState<ActivityPost[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardMap, setCardMap] = useState<Record<string, CardPreview>>({});
  const [mode, setMode] = useState<FeedMode>('global');

  const loadFeed = async () => {
    try {
      setLoading(true);

      const result = await fetchActivityFeed();
      setFeed(result.posts);
      setCurrentUserId(result.currentUserId);

      const cardIds = [
        ...new Set(
          result.posts
            .map((p) => p.card_id)
            .filter((id): id is string => !!id)
        ),
      ];

      if (!cardIds.length) {
        setCardMap({});
        return;
      }

      // 1️⃣ Get existing previews from Supabase
      const { data: existing } = await supabase
        .from('card_previews')
        .select('*')
        .in('card_id', cardIds);

      const existingMap: Record<string, CardPreview> = Object.fromEntries(
        (existing ?? []).map((p) => [p.card_id, p])
      );

      // 2️⃣ Find missing cards
      const missingIds = cardIds.filter((id) => !existingMap[id]);

      let newPreviews: CardPreview[] = [];

      if (missingIds.length > 0) {
        const fetched = await Promise.all(
          missingIds.map((id) => fetchCardPreviewFromAPI(id))
        );

        newPreviews = fetched.filter((p): p is CardPreview => !!p);

        // 3️⃣ Save them to Supabase
        if (newPreviews.length > 0) {
          await supabase.from('card_previews').upsert(newPreviews);
        }
      }

      // 4️⃣ Combine maps
      const finalMap = {
        ...existingMap,
        ...Object.fromEntries(newPreviews.map((p) => [p.card_id, p])),
      };

      setCardMap(finalMap);
    } catch (error) {
      console.log('Feed load failed', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, []);

  const visibleFeed = useMemo(() => {
    if (mode === 'global') return feed;
    return feed.filter(
      (item) => item.is_following || item.user_id === currentUserId
    );
  }, [feed, mode, currentUserId]);

  const handleReaction = async (id: string, reaction: ReactionType) => {
    await toggleActivityReaction(id, reaction);
    await loadFeed();
  };

  const handleFollow = async (id: string) => {
    await toggleFollowUser(id);
    await loadFeed();
  };

  const renderItem = ({ item }: { item: ActivityPost }) => {
    const avatar = AVATAR_PRESETS.find(
      (a) => a.key === item.profile?.avatar_preset
    );

    const card = item.card_id ? cardMap[item.card_id] : null;
    const isMe = item.user_id === currentUserId;

    const title =
      card && item.type === 'binder_add'
        ? `Added ${card.name} to ${card.set_name ?? 'their'} binder`
        : card && item.type === 'trade_listed'
        ? `Listed ${card.name} for trade`
        : item.title;

    return (
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.avatar}>
            {avatar?.image ? (
              <Image source={avatar.image} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={18} color="#fff" />
            )}
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>
                {item.profile?.collector_name ?? 'Collector'}
              </Text>

              {!isMe && (
                <Pressable
                  onPress={() => handleFollow(item.user_id)}
                  style={[
                    styles.followButton,
                    item.is_following && styles.followActive,
                  ]}
                >
                  <Text style={styles.followText}>
                    {item.is_following ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.title}>{title}</Text>
          </View>

          <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
        </View>

        {card?.image_url && (
          <Image
            source={{ uri: card.image_url }}
            style={styles.cardImage}
          />
        )}

        <View style={styles.reactions}>
          {['like', 'want', 'watching'].map((r) => {
            const active = item.my_reactions?.includes(r);
            const count = item.reactions?.[r] ?? 0;

            return (
              <Pressable
                key={r}
                onPress={() => handleReaction(item.id, r as ReactionType)}
                style={[styles.reactBtn, active && styles.reactActive]}
              >
                <Text style={styles.reactText}>
                  {r === 'like' ? '👍' : r === 'want' ? '🔥' : '👀'} {count || ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>Community</Text>

        <View style={styles.modeRow}>
          <Pressable onPress={() => setMode('global')}>
            <Text style={mode === 'global' ? styles.activeTab : styles.tab}>
              Global
            </Text>
          </Pressable>
          <Pressable onPress={() => setMode('friends')}>
            <Text style={mode === 'friends' ? styles.activeTab : styles.tab}>
              Friends
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#FFD166" />
        ) : (
          <FlatList
            data={visibleFeed}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  container: { flex: 1, padding: 16 },
  heading: { color: theme.colors.text, fontSize: 26, fontWeight: '900' },

  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 12,
    marginTop: 12,
  },

  topRow: { flexDirection: 'row' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    marginRight: 10,
    overflow: 'hidden',
  },
  avatarImage: { width: 40, height: 40 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
 name: { color: theme.colors.text, fontWeight: '800' },

  followButton: {
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  followActive: { backgroundColor: '#DCFCE7' },
  followText: { fontSize: 10, fontWeight: '800' },

  title: { color: theme.colors.textSoft, marginTop: 4 },

  time: { color: theme.colors.textSoft, fontSize: 11 },

  cardImage: {
    width: 80,
    height: 110,
    marginTop: 10,
  },

  reactions: { flexDirection: 'row', marginTop: 10, gap: 8 },
  reactBtn: {
    backgroundColor: theme.colors.bg,
    padding: 6,
    borderRadius: 999,
  },
  reactActive: { backgroundColor: '#FFD166' },
  reactText: { color: theme.colors.text, fontSize: 12 },

  modeRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  tab: { color: theme.colors.textSoft },
  activeTab: { color: theme.colors.primary, fontWeight: '800' },
});