import { router } from 'expo-router';
import { useTheme } from '../../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  Animated,
  StyleSheet,
  Image,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { Text } from '../../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AVATAR_PRESETS } from '../../../lib/avatars';
import { supabase } from '../../../lib/supabase';
import { getMyFriends } from '../../../lib/friends';
import { useProfile } from '../../../components/profile-context';

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
  binder_id: string;
  card_id: string;
  set_id: string;
  card?: CardPreview | null;
};

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

export default function CommunityScreen() {
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
  const { profile: myProfile } = useProfile();
  const isAdmin = myProfile?.role === 'admin';

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfilePreview>>({});
  const [cards, setCards] = useState<Record<string, CardPreview>>({});
  const [ownedCards, setOwnedCards] = useState<OwnedCardOption[]>([]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<FeedMode>('global');

  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);

  const postBoxAnim = useRef(new Animated.Value(1)).current;
  const postBoxVisible = useRef(true);
  const feedLastScrollY = useRef(0);

  const handleFeedScroll = useCallback((event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const diff = y - feedLastScrollY.current;
    feedLastScrollY.current = y;

    if (diff > 6 && y > 10 && postBoxVisible.current) {
      postBoxVisible.current = false;
      Animated.timing(postBoxAnim, { toValue: 0, duration: 220, useNativeDriver: false }).start();
    } else if (diff < -6 && !postBoxVisible.current) {
      postBoxVisible.current = true;
      Animated.timing(postBoxAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    }
  }, [postBoxAnim]);

  const [body, setBody] = useState('');
  const [selectedCard, setSelectedCard] = useState<OwnedCardOption | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<ProfilePreview[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);

  const loadFeed = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      const myFriends = await getMyFriends();
      setFriends(myFriends);

      if (userError) throw userError;
      setCurrentUserId(user?.id ?? null);

      const { data: postData, error: postError } = await supabase
        .from('social_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (postError) throw postError;

      const nextPosts = (postData ?? []) as SocialPost[];
      setPosts(nextPosts);

      const userIds = [...new Set(nextPosts.map((post) => post.user_id))];
      const cardIds = [
        ...new Set(nextPosts.map((post) => post.card_id).filter(Boolean)),
      ] as string[];

      if (userIds.length) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, collector_name, avatar_preset')
          .in('id', userIds);

        const profileMap = Object.fromEntries(
          (profileData ?? []).map((profile) => [profile.id, profile])
        );

        setProfiles(profileMap);
      } else {
        setProfiles({});
      }

      if (cardIds.length) {
        const { data: cardData } = await supabase
          .from('pokemon_cards')
          .select('id, name, set_id, image_small, image_large, raw_data')
          .in('id', cardIds);

        const cardMap = Object.fromEntries(
          (cardData ?? []).map((card) => [card.id, card])
        );

        setCards(cardMap);
      } else {
        setCards({});
      }
    } catch (error) {
      console.log('Feed load failed', error);
      Alert.alert('Error', 'Could not load community feed.');
    } finally {
      setLoading(false);
    }
  };

  const loadOwnedCards = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: binderData, error: binderError } = await supabase
        .from('binders')
        .select('id')
        .eq('user_id', user.id);

      if (binderError) throw binderError;

      const binderIds = (binderData ?? []).map((binder) => binder.id);

      if (!binderIds.length) {
        setOwnedCards([]);
        return;
      }

      const { data: ownedRows, error: ownedError } = await supabase
        .from('binder_cards')
        .select('binder_id, card_id, set_id')
        .in('binder_id', binderIds)
        .eq('owned', true);

      if (ownedError) throw ownedError;

      const cardIds = [
        ...new Set((ownedRows ?? []).map((row) => row.card_id)),
      ];

      if (!cardIds.length) {
        setOwnedCards([]);
        return;
      }

      const { data: cardData, error: cardError } = await supabase
        .from('pokemon_cards')
        .select('id, name, set_id, image_small, image_large, raw_data')
        .in('id', cardIds);

      if (cardError) throw cardError;

      const cardMap = Object.fromEntries(
        (cardData ?? []).map((card) => [card.id, card])
      );

      const options = (ownedRows ?? []).map((row) => ({
        binder_id: row.binder_id,
        card_id: row.card_id,
        set_id: row.set_id,
        card: cardMap[row.card_id] ?? null,
      }));

      setOwnedCards(options);
    } catch (error) {
      console.log('Owned cards load failed', error);
      Alert.alert('Error', 'Could not load your owned cards.');
    }
  };

  const searchUsers = async (text: string) => {
  setUserSearch(text);

  if (text.trim().length < 2) {
    setUserResults([]);
    return;
  }

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
};

  useEffect(() => {
    loadFeed();
    loadOwnedCards();
  }, []);

 const visiblePosts = useMemo(() => {
  if (mode === 'global') return posts;

  return posts.filter((post) =>
    friends.some((f) => f.friend_id === post.user_id)
  );
}, [posts, mode, friends]);
  const handleAdminDeletePost = async (postId: string) => {
    Alert.alert('Delete post', 'Remove this post permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('social_posts').delete().eq('id', postId);
          if (!error) setPosts(prev => prev.filter(p => p.id !== postId));
          else Alert.alert('Error', error.message);
        },
      },
    ]);
  };

  const handleCreatePost = async () => {
    const trimmedBody = body.trim();

    if (!trimmedBody && !selectedCard) {
      Alert.alert('Add something first', 'Write a post or attach a card.');
      return;
    }

    try {
      setPosting(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error('You must be signed in.');

      const { error } = await supabase.from('social_posts').insert({
        user_id: user.id,
        post_type: selectedCard ? 'card_showcase' : 'general',
        body: trimmedBody || null,
        binder_id: selectedCard?.binder_id ?? null,
        card_id: selectedCard?.card_id ?? null,
        set_id: selectedCard?.set_id ?? null,
      });

      if (error) throw error;

      setBody('');
      setSelectedCard(null);

      await loadFeed();
    } catch (error: any) {
      console.log('Create post failed', error);
      Alert.alert(
        'Could not post',
        error?.message ?? 'Something went wrong.'
      );
    } finally {
      setPosting(false);
    }
  };

  const renderPost = ({ item }: { item: SocialPost }) => {
    const profile = profiles[item.user_id];
    const avatar = AVATAR_PRESETS.find(
      (a) => a.key === profile?.avatar_preset
    );
    const card = item.card_id ? cards[item.card_id] : null;

    return (
  <View style={styles.postCard}>
    <View style={styles.postTopRow}>
      <View style={styles.avatar}>
        {avatar?.image ? (
          <Image source={avatar.image} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person" size={18} color="#fff" />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.name}>
          {profile?.collector_name ?? 'Collector'}
        </Text>
        <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
      </View>

      {isAdmin && (
        <Pressable
          onPress={() => handleAdminDeletePost(item.id)}
          style={{ padding: 6 }}
        >
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
        </Pressable>
      )}
    </View>
 
        {item.post_type === 'card_showcase' && (
  <Text style={styles.body}>
    {item.body || 'Just added this to my collection 👀'}
  </Text>
)}

{item.post_type === 'general' && item.body && (
  <Text style={styles.body}>{item.body}</Text>
)}

        {card && (
          <View style={styles.attachedCard}>
            {card.image_small || card.image_large ? (
              <Image
                source={{ uri: card.image_small ?? card.image_large ?? '' }}
                style={styles.attachedCardImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.emptyCardImage}>
                <Text style={styles.emptyCardText}>No image</Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{card.name}</Text>
              <Text style={styles.cardSet}>
  {card.raw_data?.set?.name ?? card.set_id}
</Text>

{card.raw_data?.rarity && (
  <Text style={styles.cardRarity}>{card.raw_data.rarity}</Text>
)}

<Text style={styles.cardTag}>
  {card.raw_data?.rarity === 'Rare Holo' && '✨ Holo Pull'}
  {card.raw_data?.rarity === 'Ultra Rare' && '🔥 Ultra Rare'}
  {card.raw_data?.rarity === 'Secret Rare' && '👑 Secret Rare'}
  {!card.raw_data?.rarity && 'From collection'}
</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

const renderUserResult = ({ item }: { item: ProfilePreview }) => {
  const avatar = AVATAR_PRESETS.find((a) => a.key === item.avatar_preset);

  return (
    <Pressable
      onPress={() => router.push(`/user/${item.id}`)}
      style={styles.userResultCard}
    >
      <View style={styles.userResultAvatar}>
        {avatar?.image ? (
          <Image source={avatar.image} style={styles.userResultAvatarImage} />
        ) : (
          <Ionicons name="person" size={18} color="#fff" />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.userResultName}>
          {item.collector_name ?? 'Collector'}
        </Text>
        <Text style={styles.userResultSubtext}>View profile</Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
    </Pressable>
  );
};

  const renderOwnedCard = ({ item }: { item: OwnedCardOption }) => {
    const card = item.card;

    return (
      <Pressable
        onPress={() => {
          setSelectedCard(item);
          setCardModalOpen(false);
        }}
        style={styles.ownedCardRow}
      >
        {card?.image_small || card?.image_large ? (
          <Image
            source={{ uri: card.image_small ?? card.image_large ?? '' }}
            style={styles.ownedCardImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.ownedCardImagePlaceholder} />
        )}

        <View style={{ flex: 1 }}>
          <Text style={styles.ownedCardName}>
            {card?.name ?? item.card_id}
          </Text>
          <Text style={styles.ownedCardSet}>
            {card?.raw_data?.set?.name ?? item.set_id}
          </Text>
        </View>

        <Text style={styles.selectText}>Select</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.heading}>Community</Text>

        <View style={styles.searchCard}>
  <TextInput
    value={userSearch}
    onChangeText={searchUsers}
    placeholder="Search collectors..."
    placeholderTextColor={theme.colors.textSoft}
    style={styles.searchInput}
  />

  {userSearchLoading && (
    <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 8 }} />
  )}

  {userResults.length > 0 && (
    <FlatList
      data={userResults}
      keyExtractor={(item) => item.id}
      renderItem={renderUserResult}
      scrollEnabled={false}
      style={{ marginTop: 10 }}
    />
  )}
</View>

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

        <Animated.View style={{
          opacity: postBoxAnim,
          maxHeight: postBoxAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 400] }),
          overflow: 'hidden',
        }}>
        <View style={styles.createCard}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="What do you want to share?"
            placeholderTextColor={theme.colors.textSoft}
            multiline
            style={styles.input}
          />

          {selectedCard?.card && (
            <View style={styles.selectedCardPreview}>
              <Text style={styles.selectedLabel}>Attached card</Text>
              <Text style={styles.selectedName}>
                {selectedCard.card.name}
              </Text>

              <Pressable onPress={() => setSelectedCard(null)}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.createActions}>
            <Pressable
              onPress={() => setCardModalOpen(true)}
              style={styles.attachButton}
            >
              <Ionicons
                name="albums-outline"
                size={17}
                color={theme.colors.text}
              />
              <Text style={styles.attachText}>Attach owned card</Text>
            </Pressable>

            <Pressable
              onPress={handleCreatePost}
              disabled={posting}
              style={[styles.postButton, posting && { opacity: 0.6 }]}
            >
              {posting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.postButtonText}>Post</Text>
              )}
            </Pressable>
          </View>
        </View>
        </Animated.View>

        {loading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <FlatList
            data={visiblePosts}
            keyExtractor={(item) => item.id}
            renderItem={renderPost}
            onScroll={handleFeedScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120 }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No posts yet</Text>
                <Text style={styles.emptyText}>
                  Share a card from your binder or write your first update.
                </Text>
              </View>
            }
          />
        )}
      </View>

      <Modal visible={cardModalOpen} animationType="slide">
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeading}>Choose a card to attach</Text>
            <Text style={styles.modalSubheading}>
              Only cards you have marked as owned will appear here.
            </Text>

            <FlatList
              data={ownedCards}
              keyExtractor={(item) =>
                `${item.binder_id}-${item.set_id}-${item.card_id}`
              }
              renderItem={renderOwnedCard}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No owned cards found</Text>
                  <Text style={styles.emptyText}>
                    Mark cards as owned in a binder first, then come back to
                    attach them.
                  </Text>
                </View>
              }
            />

            <Pressable
              onPress={() => setCardModalOpen(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  container: { flex: 1, padding: 16 },

  heading: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
  },

  modeRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
    marginBottom: 12,
  },

  tab: {
    color: theme.colors.textSoft,
    fontWeight: '800',
  },

  activeTab: {
    color: theme.colors.primary,
    fontWeight: '900',
  },

  createCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  input: {
    minHeight: 70,
    color: theme.colors.text,
    textAlignVertical: 'top',
    fontWeight: '700',
  },

  createActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },

  attachButton: {
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
  },

  attachText: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 12,
  },

  postButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },

  postButtonText: {
    color: '#fff',
    fontWeight: '900',
  },

  selectedCardPreview: {
    backgroundColor: theme.colors.bg,
    borderRadius: 14,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  selectedLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
  },

  selectedName: {
    color: theme.colors.text,
    fontWeight: '900',
    marginTop: 3,
  },

  removeText: {
    color: '#FF6B6B',
    fontWeight: '900',
    marginTop: 6,
  },

  postCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  postTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: theme.colors.primary,
    marginRight: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarImage: {
    width: 42,
    height: 42,
  },

  name: {
    color: theme.colors.text,
    fontWeight: '900',
  },

  time: {
    color: theme.colors.textSoft,
    fontSize: 11,
    marginTop: 2,
  },

  body: {
    color: theme.colors.text,
    marginTop: 12,
    lineHeight: 20,
    fontWeight: '600',
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

  attachedCardImage: {
    width: 74,
    height: 104,
    marginRight: 12,
  },

  emptyCardImage: {
    width: 74,
    height: 104,
    marginRight: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
  },

  emptyCardText: {
    color: theme.colors.textSoft,
    fontSize: 10,
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

  cardTag: {
    color: theme.colors.primary,
    marginTop: 10,
    fontSize: 12,
    fontWeight: '900',
  },

  modalContainer: {
    flex: 1,
    padding: 16,
  },

  modalHeading: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
  },

  modalSubheading: {
    color: theme.colors.textSoft,
    marginTop: 4,
    marginBottom: 14,
  },

  ownedCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  ownedCardImage: {
    width: 52,
    height: 74,
    marginRight: 12,
  },

  ownedCardImagePlaceholder: {
    width: 52,
    height: 74,
    marginRight: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
  },

  ownedCardName: {
    color: theme.colors.text,
    fontWeight: '900',
  },

  ownedCardSet: {
    color: theme.colors.textSoft,
    fontSize: 12,
    marginTop: 3,
  },

  selectText: {
    color: theme.colors.primary,
    fontWeight: '900',
  },

  closeButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 10,
  },

  closeButtonText: {
    color: theme.colors.text,
    fontWeight: '900',
  },

cardRarity: {
  color: '#FFD166',
  fontSize: 12,
  marginTop: 2,
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

  searchCard: {
  backgroundColor: theme.colors.card,
  borderRadius: 18,
  padding: 12,
  marginTop: 12,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: theme.colors.border,
},

searchInput: {
  backgroundColor: theme.colors.bg,
  borderRadius: 14,
  padding: 12,
  color: theme.colors.text,
  fontWeight: '800',
  borderWidth: 1,
  borderColor: theme.colors.border,
},

userResultCard: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: theme.colors.bg,
  borderRadius: 14,
  padding: 10,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: theme.colors.border,
},

userResultAvatar: {
  width: 40,
  height: 40,
  borderRadius: 12,
  backgroundColor: theme.colors.primary,
  marginRight: 10,
  overflow: 'hidden',
  alignItems: 'center',
  justifyContent: 'center',
},

userResultAvatarImage: {
  width: 40,
  height: 40,
},

userResultName: {
  color: theme.colors.text,
  fontWeight: '900',
},

userResultSubtext: {
  color: theme.colors.textSoft,
  fontSize: 12,
  marginTop: 2,
},
});
}