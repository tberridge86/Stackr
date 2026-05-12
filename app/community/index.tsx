import { router } from 'expo-router';
import { useTheme } from '../../components/theme-context';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AVATAR_PRESETS } from '../../lib/avatars';
import { supabase } from '../../lib/supabase';
import { getMyFriends } from '../../lib/friends';

// ===============================
// TYPES
// ===============================

type FeedMode = 'global' | 'friends';

type SocialPost = {
  id: string;
  user_id: string;
  post_type: string;
  body: string | null;
  binder_id: string | null;
  card_id: string | null;
  set_id: string | null;
  created_at: string;
};

type ProfilePreview = {
  id: string;
  collector_name: string | null;
  avatar_preset: string | null;
};

type CardPreview = {
  id: string;
  name: string;
  set_id: string;
  image_small: string | null;
  image_large: string | null;
  raw_data?: any;
};

type OwnedCardOption = {
  card_id: string;
  set_id: string;
  card: CardPreview | null;
};

// ===============================
// HELPERS
// ===============================

function timeAgo(dateString: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateString).getTime());
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function getRarityTag(rarity: string | null | undefined): string | null {
  if (!rarity) return null;
  const r = rarity.toLowerCase();
  if (r.includes('secret')) return '👑 Secret Rare';
  if (r.includes('ultra')) return '🔥 Ultra Rare';
  if (r.includes('full art')) return '🎨 Full Art';
  if (r.includes('rainbow')) return '🌈 Rainbow Rare';
  if (r.includes('gold')) return '✨ Gold Rare';
  if (r.includes('holo')) return '✨ Holo';
  return null;
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function CommunityScreen() {
  const { theme } = useTheme();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfilePreview>>({});
  const [cards, setCards] = useState<Record<string, CardPreview>>({});
  const [ownedCards, setOwnedCards] = useState<OwnedCardOption[]>([]);
  const [friends, setFriends] = useState<any[]>([]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<FeedMode>('global');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);

  const [body, setBody] = useState('');
  const [selectedCard, setSelectedCard] = useState<OwnedCardOption | null>(null);

  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<ProfilePreview[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ===============================
  // LOAD FEED
  // ===============================

  const loadFeed = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      const [myFriends, postResult] = await Promise.all([
        getMyFriends(),
        supabase
          .from('social_posts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      setFriends(myFriends);

      const nextPosts = (postResult.data ?? []) as SocialPost[];
      setPosts(nextPosts);

      // Load profiles + cards in parallel
      const userIds = [...new Set(nextPosts.map((p) => p.user_id))];
      const cardIds = [
        ...new Set(nextPosts.map((p) => p.card_id).filter(Boolean)),
      ] as string[];

      await Promise.all([
        userIds.length
          ? supabase
              .from('profiles')
              .select('id, collector_name, avatar_preset')
              .in('id', userIds)
              .then(({ data }) => {
                setProfiles(
                  Object.fromEntries((data ?? []).map((p) => [p.id, p]))
                );
              })
          : Promise.resolve(),

        cardIds.length
          ? supabase
              .from('pokemon_cards')
              .select('id, name, set_id, image_small, image_large, raw_data')
              .in('id', cardIds)
              .then(({ data }) => {
                setCards(
                  Object.fromEntries((data ?? []).map((c) => [c.id, c]))
                );
              })
          : Promise.resolve(),
      ]);
    } catch (error) {
      console.log('Feed load failed', error);
      Alert.alert('Error', 'Could not load community feed.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ===============================
  // LOAD OWNED CARDS
  // ===============================

  const loadOwnedCards = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: binderData } = await supabase
        .from('binders')
        .select('id')
        .eq('user_id', user.id);

      const binderIds = (binderData ?? []).map((b) => b.id);
      if (!binderIds.length) {
        setOwnedCards([]);
        return;
      }

      const { data: ownedRows } = await supabase
        .from('binder_cards')
        .select('card_id, set_id')
        .in('binder_id', binderIds)
        .eq('owned', true);

      if (!ownedRows?.length) {
        setOwnedCards([]);
        return;
      }

      // Deduplicate by card_id
      const uniqueCardIds = [...new Set(ownedRows.map((r) => r.card_id))];

      const { data: cardData } = await supabase
        .from('pokemon_cards')
        .select('id, name, set_id, image_small, image_large, raw_data')
        .in('id', uniqueCardIds);

      const cardMap = Object.fromEntries(
        (cardData ?? []).map((c) => [c.id, c])
      );

      // One entry per unique card_id
      const deduped = uniqueCardIds.map((cardId) => {
        const row = ownedRows.find((r) => r.card_id === cardId)!;
        return {
          card_id: cardId,
          set_id: row.set_id,
          card: cardMap[cardId] ?? null,
        };
      });

      setOwnedCards(deduped);
    } catch (error) {
      console.log('Owned cards load failed', error);
    }
  }, []);

  // ===============================
  // REALTIME SUBSCRIPTION
  // ===============================

  useEffect(() => {
    loadFeed();
    loadOwnedCards();

    const channel = supabase
      .channel('social-posts-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'social_posts',
        },
        async (payload) => {
          const newPost = payload.new as SocialPost;

          // Load the poster's profile if we don't have it
          if (!profiles[newPost.user_id]) {
            const { data } = await supabase
              .from('profiles')
              .select('id, collector_name, avatar_preset')
              .eq('id', newPost.user_id)
              .maybeSingle();

            if (data) {
              setProfiles((prev) => ({ ...prev, [data.id]: data }));
            }
          }

          // Load card if attached
          if (newPost.card_id && !cards[newPost.card_id]) {
            const { data } = await supabase
              .from('pokemon_cards')
              .select('id, name, set_id, image_small, image_large, raw_data')
              .eq('id', newPost.card_id)
              .maybeSingle();

            if (data) {
              setCards((prev) => ({ ...prev, [data.id]: data }));
            }
          }

          setPosts((prev) => [newPost, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFeed, loadOwnedCards]);

  // ===============================
  // FRIENDS FEED
  // ===============================

  const friendIds = useMemo(
    () => new Set(friends.map((f) => f.friend_id)),
    [friends]
  );

  const visiblePosts = useMemo(() => {
    if (mode === 'global') return posts;
    return posts.filter((post) => friendIds.has(post.user_id));
  }, [posts, mode, friendIds]);

  // ===============================
  // USER SEARCH (debounced)
  // ===============================

  const searchUsers = useCallback((text: string) => {
    setUserSearch(text);

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (text.trim().length < 2) {
      setUserResults([]);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      try {
        setUserSearchLoading(true);

        const { data, error } = await supabase
          .from('profiles')
          .select('id, collector_name, avatar_preset')
          .ilike('collector_name', `%${text.trim()}%`)
          .neq('id', currentUserId ?? '')
          .limit(10);

        if (error) throw error;
        setUserResults((data ?? []) as ProfilePreview[]);
      } catch (error) {
        console.log('User search failed', error);
      } finally {
        setUserSearchLoading(false);
      }
    }, 350);
  }, [currentUserId]);

  // ===============================
  // CREATE POST
  // ===============================

  const handleCreatePost = async () => {
    const trimmedBody = body.trim();

    if (!trimmedBody && !selectedCard) {
      Alert.alert('Add something first', 'Write a post or attach a card.');
      return;
    }

    try {
      setPosting(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('You must be signed in.');

      const { error } = await supabase.from('social_posts').insert({
        user_id: user.id,
        post_type: selectedCard ? 'card_showcase' : 'general',
        body: trimmedBody || null,
        card_id: selectedCard?.card_id ?? null,
        set_id: selectedCard?.set_id ?? null,
      });

      if (error) throw error;

      setBody('');
      setSelectedCard(null);
    } catch (error: any) {
      console.log('Create post failed', error);
      Alert.alert('Could not post', error?.message ?? 'Something went wrong.');
    } finally {
      setPosting(false);
    }
  };

  // ===============================
  // RENDER POST
  // ===============================

  const renderPost = ({ item }: { item: SocialPost }) => {
    const profile = profiles[item.user_id];
    const avatar = AVATAR_PRESETS.find((a) => a.key === profile?.avatar_preset);
    const card = item.card_id ? cards[item.card_id] : null;
    const isMyPost = item.user_id === currentUserId;
    const rarityTag = getRarityTag(card?.raw_data?.rarity);

    return (
      <View style={{
        backgroundColor: theme.colors.card,
        borderRadius: 18,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}>
        {/* Post header */}
        <TouchableOpacity
          onPress={() => !isMyPost && router.push(`/community/profile/${item.user_id}`)}
          style={{ flexDirection: 'row', alignItems: 'center' }}
          activeOpacity={isMyPost ? 1 : 0.7}
        >
          <View style={{
            width: 42,
            height: 42,
            borderRadius: 13,
            backgroundColor: theme.colors.primary,
            marginRight: 10,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {avatar?.image ? (
              <Image source={avatar.image} style={{ width: 42, height: 42 }} />
            ) : (
              <Ionicons name="person" size={18} color="#fff" />
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
              {profile?.collector_name ?? 'Collector'}
              {isMyPost && (
                <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 12 }}>
                  {' '}(you)
                </Text>
              )}
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>
              {timeAgo(item.created_at)}
            </Text>
          </View>

          {!isMyPost && (
            <TouchableOpacity
              onPress={() => router.push(`/community/profile/${item.user_id}`)}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700' }}>
                View profile
              </Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {/* Post body */}
        {item.body ? (
          <Text style={{ color: theme.colors.text, marginTop: 10, lineHeight: 20, fontWeight: '600' }}>
            {item.body}
          </Text>
        ) : item.post_type === 'card_showcase' && !item.body ? (
          <Text style={{ color: theme.colors.textSoft, marginTop: 10, fontSize: 13, fontStyle: 'italic' }}>
            Just added this to my collection 👀
          </Text>
        ) : null}

        {/* Attached card */}
        {card && (
          <View style={{
            flexDirection: 'row',
            marginTop: 12,
            backgroundColor: theme.colors.bg,
            borderRadius: 16,
            padding: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}>
            {card.image_small || card.image_large ? (
              <Image
                source={{ uri: card.image_small ?? card.image_large ?? '' }}
                style={{ width: 74, height: 104, marginRight: 12 }}
                resizeMode="contain"
              />
            ) : (
              <View style={{
                width: 74,
                height: 104,
                marginRight: 12,
                backgroundColor: theme.colors.surface,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ color: theme.colors.textSoft, fontSize: 10 }}>No image</Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                {card.name}
              </Text>
              <Text style={{ color: theme.colors.textSoft, marginTop: 4, fontSize: 12 }}>
                {card.raw_data?.set?.name ?? card.set_id}
              </Text>
              {card.raw_data?.rarity && (
                <Text style={{ color: '#FFD166', fontSize: 12, marginTop: 2, fontWeight: '900' }}>
                  {card.raw_data.rarity}
                </Text>
              )}
              {rarityTag && (
                <View style={{
                  marginTop: 8,
                  backgroundColor: theme.colors.primary + '18',
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  alignSelf: 'flex-start',
                  borderWidth: 1,
                  borderColor: theme.colors.primary + '40',
                }}>
                  <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '900' }}>
                    {rarityTag}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  // ===============================
  // RENDER USER RESULT
  // ===============================

  const renderUserResult = ({ item }: { item: ProfilePreview }) => {
    const avatar = AVATAR_PRESETS.find((a) => a.key === item.avatar_preset);

    return (
      <TouchableOpacity
        onPress={() => {
          router.push(`/community/profile/${item.id}`);
          setUserSearch('');
          setUserResults([]);
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.bg,
          borderRadius: 14,
          padding: 10,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
        activeOpacity={0.8}
      >
        <View style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: theme.colors.primary,
          marginRight: 10,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {avatar?.image ? (
            <Image source={avatar.image} style={{ width: 40, height: 40 }} />
          ) : (
            <Ionicons name="person" size={18} color="#fff" />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
            {item.collector_name ?? 'Collector'}
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
            View profile
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
      </TouchableOpacity>
    );
  };

  // ===============================
  // RENDER OWNED CARD
  // ===============================

  const renderOwnedCard = ({ item }: { item: OwnedCardOption }) => {
    const card = item.card;
    const isSelected = selectedCard?.card_id === item.card_id;

    return (
      <TouchableOpacity
        onPress={() => {
          setSelectedCard(item);
          setCardModalOpen(false);
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isSelected ? theme.colors.primary + '12' : theme.colors.card,
          borderRadius: 16,
          padding: 10,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
        }}
        activeOpacity={0.8}
      >
        {card?.image_small || card?.image_large ? (
          <Image
            source={{ uri: card.image_small ?? card.image_large ?? '' }}
            style={{ width: 52, height: 74, marginRight: 12, borderRadius: 4 }}
            resizeMode="contain"
          />
        ) : (
          <View style={{
            width: 52,
            height: 74,
            marginRight: 12,
            backgroundColor: theme.colors.surface,
            borderRadius: 8,
          }} />
        )}

        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
            {card?.name ?? item.card_id}
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 3 }}>
            {card?.raw_data?.set?.name ?? item.set_id}
          </Text>
          {card?.raw_data?.rarity && (
            <Text style={{ color: '#FFD166', fontSize: 11, marginTop: 2, fontWeight: '700' }}>
              {card.raw_data.rarity}
            </Text>
          )}
        </View>

        <Text style={{ color: isSelected ? theme.colors.primary : theme.colors.textSoft, fontWeight: '900' }}>
          {isSelected ? '✓' : 'Select'}
        </Text>
      </TouchableOpacity>
    );
  };

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>

        {/* Header */}
        <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '900', marginBottom: 12 }}>
          Community
        </Text>

        {/* Search collectors */}
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 12,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="search" size={16} color={theme.colors.textSoft} />
            <TextInput
              value={userSearch}
              onChangeText={searchUsers}
              placeholder="Search collectors..."
              placeholderTextColor={theme.colors.textSoft}
              style={{
                flex: 1,
                color: theme.colors.text,
                fontWeight: '800',
                fontSize: 14,
              }}
            />
            {userSearch.length > 0 && (
              <TouchableOpacity onPress={() => { setUserSearch(''); setUserResults([]); }}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textSoft} />
              </TouchableOpacity>
            )}
          </View>

          {userSearchLoading && (
            <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 8 }} />
          )}

          {userResults.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <FlatList
                data={userResults}
                keyExtractor={(item) => item.id}
                renderItem={renderUserResult}
                scrollEnabled={false}
              />
            </View>
          )}
        </View>

        {/* Feed mode tabs */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {(['global', 'friends'] as FeedMode[]).map((m) => {
            const active = mode === m;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={{
                  flex: 1,
                  backgroundColor: active ? theme.colors.primary : theme.colors.card,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text style={{
                  color: active ? '#FFFFFF' : theme.colors.textSoft,
                  fontWeight: '900',
                  fontSize: 13,
                }}>
                  {m === 'global' ? '🌍 Global' : '👥 Friends'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Create post */}
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 12,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="What do you want to share?"
            placeholderTextColor={theme.colors.textSoft}
            multiline
            style={{
              minHeight: 70,
              color: theme.colors.text,
              textAlignVertical: 'top',
              fontWeight: '700',
            }}
          />

          {/* Selected card preview */}
          {selectedCard?.card && (
            <View style={{
              backgroundColor: theme.colors.bg,
              borderRadius: 14,
              padding: 10,
              marginTop: 10,
              borderWidth: 1,
              borderColor: theme.colors.primary,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}>
              {selectedCard.card.image_small && (
                <Image
                  source={{ uri: selectedCard.card.image_small }}
                  style={{ width: 36, height: 50, borderRadius: 4 }}
                  resizeMode="contain"
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                  Attached card
                </Text>
                <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 2 }}>
                  {selectedCard.card.name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedCard(null)}>
                <Ionicons name="close-circle" size={20} color={theme.colors.textSoft} />
              </TouchableOpacity>
            </View>
          )}

          {/* Post actions */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => setCardModalOpen(true)}
              style={{
                flex: 1,
                backgroundColor: theme.colors.bg,
                borderRadius: 14,
                paddingVertical: 11,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
              }}
            >
              <Ionicons name="albums-outline" size={17} color={theme.colors.text} />
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12 }}>
                Attach card
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCreatePost}
              disabled={posting}
              style={{
                backgroundColor: theme.colors.primary,
                borderRadius: 14,
                paddingVertical: 12,
                paddingHorizontal: 20,
                opacity: posting ? 0.6 : 1,
              }}
            >
              {posting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '900' }}>Post</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Feed */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
              Loading feed...
            </Text>
          </View>
        ) : (
          <FlatList
            data={visiblePosts}
            keyExtractor={(item) => item.id}
            renderItem={renderPost}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadFeed(true)}
                tintColor={theme.colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', padding: 40 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>
                  {mode === 'friends' ? 'No friend posts yet' : 'No posts yet'}
                </Text>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
                  {mode === 'friends'
                    ? 'Add friends to see their posts here.'
                    : 'Share a card from your binder or write your first update.'}
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* ===============================
          ATTACH CARD MODAL
      =============================== */}
      <Modal visible={cardModalOpen} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
          <View style={{ flex: 1, padding: 16 }}>
            <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900', marginBottom: 4 }}>
              Attach a card
            </Text>
            <Text style={{ color: theme.colors.textSoft, marginBottom: 14 }}>
              Only cards marked as owned in your binders appear here.
            </Text>

            <FlatList
              data={ownedCards}
              keyExtractor={(item) => item.card_id}
              renderItem={renderOwnedCard}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', padding: 24 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                    No owned cards found
                  </Text>
                  <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 6 }}>
                    Mark cards as owned in a binder first.
                  </Text>
                </View>
              }
            />

            <TouchableOpacity
              onPress={() => setCardModalOpen(false)}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 14,
                padding: 14,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}