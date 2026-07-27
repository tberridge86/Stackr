import { useTheme } from '../../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../../../components/Text';
import { StackrBackButton } from '../../../components/StackrBackButton';
import { StackrBackdrop } from '../../../components/StackrBackdrop';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AVATAR_PRESETS } from '../../../lib/avatars';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from '../../../components/RaritySymbol';
import { supabase } from '../../../lib/supabase';
import {
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  getFriendStatus,
} from '../../../lib/friends';
import { stackrTabContentPadding } from '../../../lib/stackrSizing';
import { stackrIcons } from '../../../lib/stackrIcons';

// ===============================
// TYPES
// ===============================

type Profile = {
  id: string;
  collector_name: string | null;
  avatar_preset: string | null;
  pokemon_type: string | null;
  favorite_card_id: string | null;
  favorite_set_id: string | null;
  chase_card_id: string | null;
  chase_set_id: string | null;
};

type Binder = {
  id: string;
  name: string;
  color: string | null;
  gradient: string[] | null;
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

type TraderRating = {
  average_rating: number | null;
  review_count: number;
};

type FriendshipStatus =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'accepted';

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

function renderStars(rating: number | null): string {
  if (rating == null) return 'No rating yet';
  const full = Math.round(rating);
  return '⭐'.repeat(full) + '☆'.repeat(5 - full) + ` (${rating.toFixed(1)})`;
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function PublicCollectorProfileScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ userId?: string; id?: string; readOnly?: string }>();
  const routeUserId = params.userId ?? params.id;
  const binderId = Array.isArray(routeUserId) ? routeUserId[0] : routeUserId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [binders, setBinders] = useState<Binder[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [cards, setCards] = useState<Record<string, CardPreview>>({});
  const [ownedCount, setOwnedCount] = useState(0);
  const [showcaseCount, setShowcaseCount] = useState(0);
  const [traderRating, setTraderRating] = useState<TraderRating | null>(null);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendshipStatus>('none');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [favoriteCard, setFavoriteCard] = useState<CardPreview | null>(null);
  const [chaseCard, setChaseCard] = useState<CardPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendActionBusy, setFriendActionBusy] = useState(false);

  const avatar = useMemo(() => {
    return AVATAR_PRESETS.find((a) => a.key === profile?.avatar_preset) ?? null;
  }, [profile?.avatar_preset]);

  const isOwnProfile = currentUserId === binderId;

  // ===============================
  // LOAD
  // ===============================

  const loadProfile = useCallback(async () => {
    if (!binderId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      // Load all data in parallel
      const [
        profileResult,
        binderResult,
        showcaseResult,
        postResult,
        ratingResult,
        friendResult,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, collector_name, avatar_preset, pokemon_type, favorite_card_id, favorite_set_id, chase_card_id, chase_set_id')
          .eq('id', binderId)
          .maybeSingle(),

        supabase
          .from('binders')
          .select('id, name, color, gradient, type, source_set_id')
          .eq('user_id', binderId)
          .eq('is_public', true)  // Fixed: only show public binders
          .order('created_at', { ascending: false }),

        supabase
          .from('binder_card_showcases')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', binderId),

        supabase
          .from('social_posts')
          .select('id, body, card_id, set_id, created_at')
          .eq('user_id', binderId)
          .order('created_at', { ascending: false })
          .limit(10),

        supabase
          .from('profile_rating_summary')
          .select('average_rating, review_count')
          .eq('user_id', binderId)
          .maybeSingle(),

        user ? getFriendStatus(binderId) : Promise.resolve(null),
      ]);

      // Profile
      setProfile(profileResult.data as Profile | null);

      // Binders
      const nextBinders = (binderResult.data ?? []) as Binder[];
      setBinders(nextBinders);

      // Owned card count across public binders
      if (nextBinders.length > 0) {
        const binderIds = nextBinders.map((b) => b.id);
        const { count } = await supabase
          .from('binder_cards')
          .select('id', { count: 'exact', head: true })
          .in('binder_id', binderIds)
          .eq('owned', true);
        setOwnedCount(count ?? 0);
      }

      // Showcase count
      setShowcaseCount(showcaseResult.count ?? 0);

      // Posts
      const nextPosts = (postResult.data ?? []) as SocialPost[];
      setPosts(nextPosts);

      // Trader rating
      if (ratingResult.data) {
        setTraderRating(ratingResult.data as TraderRating);
      }

      // Friend status
      if (friendResult) {
        setFriendshipId(friendResult.id);
        if (friendResult.status === 'accepted') {
          setFriendStatus('accepted');
        } else if (friendResult.status === 'pending') {
          setFriendStatus(
            friendResult.requester_id === user?.id
              ? 'pending_sent'
              : 'pending_received'
          );
        }
      }

      // Load card previews (posts + featured + chase)
      const profileData = profileResult.data as Profile | null;
      const postCardIds = nextPosts
        .map((p) => p.card_id)
        .filter(Boolean) as string[];

      const specialCardIds = [
        profileData?.favorite_card_id,
        profileData?.chase_card_id,
      ].filter(Boolean) as string[];

      const allCardIds = Array.from(new Set([...postCardIds, ...specialCardIds]));

      if (allCardIds.length > 0) {
        const { data: cardData } = await supabase
          .from('pokemon_cards')
          .select('id, name, set_id, image_small, image_large, raw_data')
          .in('id', allCardIds);

        const cardMap = Object.fromEntries(
          (cardData ?? []).map((c) => [c.id, c])
        );
        setCards(cardMap);

        if (profileData?.favorite_card_id) {
          setFavoriteCard(cardMap[profileData.favorite_card_id] ?? null);
        }
        if (profileData?.chase_card_id) {
          setChaseCard(cardMap[profileData.chase_card_id] ?? null);
        }
      }
    } catch (error) {
      console.log('Public profile load failed', error);
    } finally {
      setLoading(false);
    }
  }, [binderId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ===============================
  // FRIEND ACTIONS
  // ===============================

  const handleFriendAction = async () => {
    if (!binderId || isOwnProfile) return;

    try {
      setFriendActionBusy(true);

      if (friendStatus === 'none') {
        const result = await sendFriendRequest(binderId);
        setFriendshipId(result.id);
        setFriendStatus('pending_sent');
        Alert.alert('Request sent', 'Friend request sent!');
      } else if (friendStatus === 'pending_received' && friendshipId) {
        await acceptFriendRequest(friendshipId);
        setFriendStatus('accepted');
        Alert.alert('Friends!', 'You are now friends.');
      } else if (friendStatus === 'accepted' && friendshipId) {
        Alert.alert(
          'Remove friend',
          'Are you sure you want to remove this friend?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: async () => {
                await removeFriend(friendshipId);
                setFriendStatus('none');
                setFriendshipId(null);
              },
            },
          ]
        );
      } else if (friendStatus === 'pending_sent' && friendshipId) {
        Alert.alert(
          'Withdraw request',
          'Cancel your friend request?',
          [
            { text: 'Keep', style: 'cancel' },
            {
              text: 'Withdraw',
              style: 'destructive',
              onPress: async () => {
                await removeFriend(friendshipId);
                setFriendStatus('none');
                setFriendshipId(null);
              },
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Something went wrong.');
    } finally {
      setFriendActionBusy(false);
    }
  };

  const friendButtonLabel = () => {
    switch (friendStatus) {
      case 'none': return '+ Add Friend';
      case 'pending_sent': return 'Request Sent';
      case 'pending_received': return '✓ Accept Request';
      case 'accepted': return '✓ Friends';
    }
  };

  const friendButtonStyle = () => {
    switch (friendStatus) {
      case 'none': return { backgroundColor: theme.colors.primary };
      case 'pending_sent': return { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border };
      case 'pending_received': return { backgroundColor: '#10B981' };
      case 'accepted': return { backgroundColor: '#10B981' };
    }
  };

  const friendButtonTextColor = () => {
    switch (friendStatus) {
      case 'pending_sent': return theme.colors.textSoft;
      default: return '#FFFFFF';
    }
  };

  // ===============================
  // RENDER POST
  // ===============================

  const renderPost = ({ item }: { item: SocialPost }) => {
    const card = item.card_id ? cards[item.card_id] : null;

    return (
      <View style={{
        backgroundColor: theme.colors.card,
        borderRadius: 18,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}>
        <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800' }}>
          {timeAgo(item.created_at)}
        </Text>

        {item.body ? (
          <Text style={{ color: theme.colors.text, marginTop: 8, lineHeight: 20, fontWeight: '700' }}>
            {item.body}
          </Text>
        ) : null}

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
            <View style={{ width: 74, height: 104, marginRight: 12, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.colors.surface }}>
              {card.image_small || card.image_large ? (
                <Image
                  source={{ uri: card.image_small ?? card.image_large ?? '' }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                />
              ) : null}
              <RaritySymbol
                rarity={card.raw_data?.rarity ?? null}
                size={13}
                style={RARITY_SYMBOL_CARD_OVERLAY}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                {card.name}
              </Text>
              <Text style={{ color: theme.colors.textSoft, marginTop: 4, fontSize: 12 }}>
                {card.raw_data?.set?.name ?? card.set_id}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  // ===============================
  // LOADING / NOT FOUND
  // ===============================

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <StackrBackdrop />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
            Loading collector...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <StackrBackdrop />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18, marginBottom: 12 }}>
            Collector not found
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StackrBackdrop />
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: stackrTabContentPadding.standard }}
        ListHeaderComponent={
          <View>
            {/* Back button */}
            <View style={{ marginBottom: 10 }}>
              <StackrBackButton onPress={() => router.back()} />
            </View>

            {/* Profile header */}
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.86)',
              borderRadius: 20,
              padding: 14,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
              marginBottom: 14,
            }}>
              {/* Avatar */}
              <View style={{
                width: 76,
                height: 76,
                borderRadius: 24,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                marginBottom: 9,
              }}>
                {avatar?.image ? (
                  <Image source={avatar.image} style={{ width: 76, height: 76 }} />
                ) : (
                  <Ionicons name="person" size={30} color="#fff" />
                )}
              </View>

              <Text style={{ color: theme.colors.text, fontSize: 21, lineHeight: 26, fontWeight: '900' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                {profile.collector_name ?? 'Collector'}
              </Text>

              <Text style={{ color: theme.colors.textSoft, marginTop: 3, fontSize: 12.5, lineHeight: 16, fontWeight: '700' }}>
                {profile.pokemon_type
                  ? `${profile.pokemon_type.charAt(0).toUpperCase()}${profile.pokemon_type.slice(1)} Trainer`
                  : 'Collector Profile'}
              </Text>

              {/* Trader rating */}
              <View style={{
                marginTop: 7,
                backgroundColor: theme.colors.surface,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}>
                <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '700' }}>
                  {traderRating?.review_count
                    ? `${renderStars(traderRating.average_rating)} · ${traderRating.review_count} review${traderRating.review_count !== 1 ? 's' : ''}`
                    : '⭐ No reviews yet'}
                </Text>
              </View>

              {/* Stats */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, width: '100%' }}>
                {[
                  { label: 'Cards', value: ownedCount },
                  { label: 'Binders', value: binders.length },
                  { label: 'Featured', value: showcaseCount },
                ].map(({ label, value }) => (
                  <View key={label} style={{
                    flex: 1,
                    backgroundColor: theme.colors.bg,
                    borderRadius: 14,
                    padding: 10,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                      {value}
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, marginTop: 2, fontWeight: '800' }}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Action buttons — only show if not own profile */}
              {!isOwnProfile && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, width: '100%' }}>
                  {/* Friend button */}
                  <TouchableOpacity
                    onPress={handleFriendAction}
                    disabled={friendActionBusy}
                    style={[{
                      flex: 1,
                      borderRadius: 14,
                      paddingVertical: 11,
                      alignItems: 'center',
                      opacity: friendActionBusy ? 0.6 : 1,
                    }, friendButtonStyle()]}
                  >
                    <Text style={{ color: friendButtonTextColor(), fontWeight: '900', fontSize: 13 }}>
                      {friendActionBusy ? '...' : friendButtonLabel()}
                    </Text>
                  </TouchableOpacity>

                  {/* Trade button */}
                  <TouchableOpacity
                    onPress={() => router.push({
                      pathname: '/offer/new',
                      params: { targetUserId: binderId },
                    })}
                    style={{
                      flex: 1,
                      borderRadius: 14,
                      paddingVertical: 11,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 6,
                      backgroundColor: theme.colors.secondary,
                    }}
                  >
                    <Image source={stackrIcons.trade} style={{ width: 18, height: 18 }} resizeMode="contain" />
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }}>
                      Trade
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Featured + Chase cards */}
            {(favoriteCard || chaseCard) && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 10 }}>
                  Featured Cards
                </Text>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {favoriteCard && (
                    <View style={{
                      flex: 1,
                      backgroundColor: theme.colors.card,
                      borderRadius: 16,
                      padding: 9,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: theme.colors.secondary,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                        <Image source={stackrIcons.scanCard} style={{ width: 14, height: 14 }} resizeMode="contain" />
                        <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '900' }}>
                          FEATURED
                        </Text>
                      </View>
                      <Image
                        source={{ uri: favoriteCard.image_small ?? favoriteCard.image_large ?? '' }}
                        style={{ width: 74, height: 104, borderRadius: 6 }}
                        resizeMode="contain"
                      />
                      <Text
                        numberOfLines={1}
                        style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12, marginTop: 6 }}
                      >
                        {favoriteCard.name}
                      </Text>
                    </View>
                  )}

                  {chaseCard && (
                    <View style={{
                      flex: 1,
                      backgroundColor: theme.colors.card,
                      borderRadius: 16,
                      padding: 9,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: `${theme.colors.primary}55`,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                        <Image source={stackrIcons.chase} style={{ width: 14, height: 14 }} resizeMode="contain" />
                        <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '900' }}>
                          CHASE
                        </Text>
                      </View>
                      <Image
                        source={{ uri: chaseCard.image_small ?? chaseCard.image_large ?? '' }}
                        style={{ width: 74, height: 104, borderRadius: 6 }}
                        resizeMode="contain"
                      />
                      <Text
                        numberOfLines={1}
                        style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12, marginTop: 6 }}
                      >
                        {chaseCard.name}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Public binders */}
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 10 }}>
              Public Binders
            </Text>

            {binders.length > 0 ? (
              <View style={{ gap: 10, marginBottom: 16 }}>
                {binders.map((binder) => (
                  <TouchableOpacity
                    key={binder.id}
                    onPress={() => router.push({
                      pathname: '/binder/[id]',
                      params: { id: binder.id, readOnly: 'true' },
                    })}
                    style={{
                      flexDirection: 'row',
                      backgroundColor: theme.colors.card,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      overflow: 'hidden',
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{
                      width: 12,
                      backgroundColor: binder.color ?? theme.colors.primary,
                    }} />
                    <View style={{ flex: 1, padding: 12 }}>
                      <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900' }}>
                        {binder.name}
                      </Text>
                      <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 3 }}>
                        {binder.type === 'official' ? 'Official set' : 'Custom'}
                      </Text>
                    </View>
                    <View style={{ justifyContent: 'center', paddingRight: 12 }}>
                      <Ionicons name="chevron-forward" size={16} color={theme.colors.textSoft} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={{
                backgroundColor: theme.colors.card,
                borderRadius: 16,
                padding: 16,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>
                  No public binders yet.
                </Text>
              </View>
            )}

            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 10 }}>
              Recent Posts
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 24 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
              No posts yet
            </Text>
            <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 6 }}>
              This collector hasn&apos;t shared anything yet.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
