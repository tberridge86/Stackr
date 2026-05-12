import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Text } from '../../components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { BACKGROUND_MAP } from '../../lib/backgrounds';
import { AVATAR_PRESETS } from '../../lib/avatars';
import {
  getCachedCardSync,
  getCachedCardsForSet,
} from '../../lib/pokemonTcgCache';
import {
  sendFriendRequest,
  getFriendStatus,
  acceptFriendRequest,
  removeFriend,
} from '../../lib/friends';

// ===============================
// TYPES
// ===============================

type PublicProfile = {
  id: string;
  collector_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  pokemon_type: string | null;
  background_key: string | null;
  favorite_card_id: string | null;
  favorite_set_id: string | null;
  chase_card_id: string | null;
  chase_set_id: string | null;
};

type PublicBinder = {
  id: string;
  name: string;
  color: string;
  type: 'official' | 'custom';
  source_set_id: string | null;
};

type TradeReview = {
  id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

type FriendshipStatus =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'accepted';

// ===============================
// CONSTANTS
// ===============================

const TYPE_OPTIONS = [
  { key: 'water', label: 'Water', accent: '#4FC3F7', card: '#78C8F0' },
  { key: 'fire', label: 'Fire', accent: '#FF8A65', card: '#F5AC78' },
  { key: 'grass', label: 'Grass', accent: '#81C784', card: '#A7DB8D' },
  { key: 'electric', label: 'Electric', accent: '#FFD54F', card: '#FAE078' },
  { key: 'psychic', label: 'Psychic', accent: '#CE93D8', card: '#FA92B2' },
  { key: 'dark', label: 'Dark', accent: '#90A4AE', card: '#705848' },
  { key: 'dragon', label: 'Dragon', accent: '#7986CB', card: '#7038F8' },
  { key: 'fighting', label: 'Fighting', accent: '#EF5350', card: '#C03028' },
  { key: 'ghost', label: 'Ghost', accent: '#AB47BC', card: '#705898' },
  { key: 'ice', label: 'Ice', accent: '#4DD0E1', card: '#98D8D8' },
  { key: 'fairy', label: 'Fairy', accent: '#F48FB1', card: '#EE99AC' },
  { key: 'normal', label: 'Normal', accent: '#BDBDBD', card: '#A8A878' },
];

const BACKGROUNDS = [
  { key: 'galaxy', label: 'Galaxy' },
  { key: 'forest', label: 'Forest' },
  { key: 'ocean', label: 'Ocean' },
  { key: 'lava', label: 'Lava' },
];

const asGradientColors = (colors: string[]) =>
  colors as [string, string, ...string[]];

function getInitials(name: string): string {
  return name
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

// ===============================
// SUB COMPONENTS
// ===============================

function TopLoaderCard({ label, card }: { label: string; card: any | null }) {
  return (
    <View style={{ width: '48%', alignItems: 'center' }}>
      <Text style={{ color: '#FFD166', fontSize: 13, fontWeight: '800', marginBottom: 10 }}>
        {label}
      </Text>

      <View style={{
        width: '100%',
        backgroundColor: '#d8dde6',
        borderRadius: 18,
        padding: 10,
        borderWidth: 2,
        borderColor: '#eef2f7',
        overflow: 'hidden',
      }}>
        <View style={{
          backgroundColor: '#f4f7fb',
          borderRadius: 12,
          minHeight: 190,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {card?.images?.small ? (
            <Image
              source={{ uri: card.images.small }}
              style={{ width: 120, height: 168 }}
              resizeMode="contain"
            />
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#7c859f', fontSize: 24 }}>✦</Text>
              <Text style={{ color: '#7c859f', marginTop: 8, fontWeight: '700', fontSize: 12 }}>
                Not set
              </Text>
            </View>
          )}
        </View>

        {/* Gloss effect */}
        <View style={{
          position: 'absolute',
          top: 0, left: 10, bottom: 0,
          width: 26,
          backgroundColor: 'rgba(255,255,255,0.16)',
        }} />
      </View>

      <Text
        numberOfLines={2}
        style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700', textAlign: 'center',
                  marginTop: 10 }}
      >
        {card?.name ?? 'No card selected'}
      </Text>
    </View>
  );
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function PublicProfileScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const userId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [favoriteCard, setFavoriteCard] = useState<any | null>(null);
  const [chaseCard, setChaseCard] = useState<any | null>(null);
  const [binders, setBinders] = useState<PublicBinder[]>([]);
  const [binderCounts, setBinderCounts] = useState<Record<string, { owned: number; total: number }>>({});
  const [reviews, setReviews] = useState<TradeReview[]>([]);
  const [ratingSummary, setRatingSummary] = useState<{ average_rating: number | null; review_count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState('');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendshipStatus>('none');
  const [friendBusy, setFriendBusy] = useState(false);

  // ===============================
  // DERIVED
  // ===============================

  const selectedType = useMemo(
    () => TYPE_OPTIONS.find((t) => t.key === profile?.pokemon_type) ?? TYPE_OPTIONS[0],
    [profile?.pokemon_type]
  );

  const selectedBackground = useMemo(
    () => BACKGROUNDS.find((bg) => bg.key === profile?.background_key) ?? BACKGROUNDS[0],
    [profile?.background_key]
  );

  const backgroundTheme = useMemo(
    () => BACKGROUND_MAP[profile?.background_key ?? 'galaxy'] ?? BACKGROUND_MAP.galaxy,
    [profile?.background_key]
  );

  const presetAvatar = useMemo(
    () => AVATAR_PRESETS.find((a) => a.key === profile?.avatar_preset) ?? null,
    [profile?.avatar_preset]
  );

  const isOwnProfile = myUserId === userId;

  // ===============================
  // LOAD ALL DATA
  // ===============================

  const loadAll = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setMyUserId(user?.id ?? '');

      // Load profile + binders + reviews + friendship in parallel
      const [
        profileResult,
        bindersResult,
        reviewsResult,
        ratingResult,
        friendResult,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, collector_name, avatar_url, avatar_preset, pokemon_type, background_key, favorite_card_id, favorite_set_id, chase_card_id, chase_set_id')
          .eq('id', userId)
          .maybeSingle(),

        supabase
          .from('binders')
          .select('id, name, color, type, source_set_id')
          .eq('user_id', userId)
          .eq('is_public', true)
          .order('created_at', { ascending: false }),

        supabase
          .from('trade_reviews')
          .select('id, reviewer_id, rating, comment, created_at')
          .eq('reviewed_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5),

        supabase
          .from('profile_rating_summary')
          .select('average_rating, review_count')
          .eq('user_id', userId)
          .maybeSingle(),

        user && user.id !== userId
          ? getFriendStatus(userId)
          : Promise.resolve(null),
      ]);

      const profileData = profileResult.data as PublicProfile | null;
      setProfile(profileData);

      // Binders
      const publicBinders = (bindersResult.data ?? []) as PublicBinder[];
      setBinders(publicBinders);

      // Reviews
      setReviews((reviewsResult.data ?? []) as TradeReview[]);

      // Rating
      if (ratingResult.data) {
        setRatingSummary(ratingResult.data as any);
      }

      // Friendship status
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

      // Load binder card counts from DB (no full virtual merge)
      if (publicBinders.length > 0) {
        const binderIds = publicBinders.map((b) => b.id);

        const { data: ownedRows } = await supabase
          .from('binder_cards')
          .select('binder_id, owned')
          .in('binder_id', binderIds);

        const counts: Record<string, { owned: number; total: number }> = {};

        for (const binder of publicBinders) {
          const rows = (ownedRows ?? []).filter((r) => r.binder_id === binder.id);
          counts[binder.id] = {
            owned: rows.filter((r) => r.owned).length,
            total: rows.length,
          };
        }

        setBinderCounts(counts);
      }

      // Load showcase cards
      if (profileData?.favorite_card_id && profileData?.favorite_set_id) {
        let fav = getCachedCardSync(profileData.favorite_set_id, profileData.favorite_card_id);
        if (!fav) {
          const cards = await getCachedCardsForSet(profileData.favorite_set_id);
          fav = cards.find((c) => c.id === profileData.favorite_card_id) ?? null;
        }
        setFavoriteCard(fav ?? null);
      }

      if (profileData?.chase_card_id && profileData?.chase_set_id) {
        let chase = getCachedCardSync(profileData.chase_set_id, profileData.chase_card_id);
        if (!chase) {
          const cards = await getCachedCardsForSet(profileData.chase_set_id);
          chase = cards.find((c) => c.id === profileData.chase_card_id) ?? null;
        }
        setChaseCard(chase ?? null);
      }
    } catch (error) {
      console.log('Failed to load public profile', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ===============================
  // FRIEND ACTIONS
  // ===============================

  const handleFriendAction = async () => {
    if (!userId || isOwnProfile) return;

    try {
      setFriendBusy(true);

      if (friendStatus === 'none') {
        const result = await sendFriendRequest(userId);
        setFriendshipId(result.id);
        setFriendStatus('pending_sent');
      } else if (friendStatus === 'pending_received' && friendshipId) {
        await acceptFriendRequest(friendshipId);
        setFriendStatus('accepted');
      } else if (friendStatus === 'accepted' && friendshipId) {
        Alert.alert(
          'Remove friend',
          'Remove this collector from your friends?',
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
    } catch (error) {
      console.log('Friend action error', error);
    } finally {
      setFriendBusy(false);
    }
  };

  const friendButtonLabel = (): string => {
    if (friendBusy) return '...';
    switch (friendStatus) {
      case 'none': return 'Add Friend';
      case 'pending_sent': return 'Request Sent';
      case 'pending_received': return '✓ Accept Request';
      case 'accepted': return '✓ Friends';
    }
  };

  // ===============================
  // LOADING
  // ===============================

  if (loading) {
    return (
      <LinearGradient
        colors={asGradientColors(BACKGROUND_MAP.galaxy.colors)}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color="#FFD166" size="large" />
            <Text style={{ color: '#D5DAEC', marginTop: 12 }}>Loading collector...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!profile) {
    return (
      <LinearGradient
        colors={asGradientColors(BACKGROUND_MAP.galaxy.colors)}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['bottom', 'left', 'right']}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginBottom: 16 }}>
              Collector not found
            </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ backgroundColor: '#FFD166', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20 }}
            >
              <Text style={{ color: '#0b0f2a', fontWeight: '900' }}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const initials = getInitials(profile.collector_name ?? 'PC');

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <LinearGradient
      colors={asGradientColors(backgroundTheme.colors)}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 120, paddingTop: 0 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Top bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                        <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '900' }}>
                Collector Profile
              </Text>
              <Text style={{ color: '#D5DAEC', fontSize: 13, marginTop: 2 }}>
                Public collector card
              </Text>
            </View>
          </View>

          {/* ===============================
              COLLECTOR CARD
          =============================== */}
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginBottom: 6 }}>
            Collector Card
          </Text>
          <Text style={{ color: '#D5DAEC', fontSize: 13, lineHeight: 18, marginBottom: 16 }}>
            This is how this collector appears across Stackr.
          </Text>

          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{
              width: '100%',
              maxWidth: 360,
              borderRadius: 24,
              padding: 18,
              borderWidth: 3,
              borderColor: 'rgba(255,255,255,0.35)',
              backgroundColor: selectedType.card,
            }}>
              <Text style={{ color: 'rgba(11,15,42,0.72)', fontWeight: '800', fontSize: 12, marginBottom: 4 }}>
                Collector
              </Text>

              <Text style={{ color: '#0b0f2a', fontSize: 24, fontWeight: '900' }}>
                {profile.collector_name ?? 'Unknown Collector'}
              </Text>

              <Text style={{ position: 'absolute', top: 18, right: 18, color: '#0b0f2a', fontSize: 16, fontWeight: '900' }}>
                HP 120
              </Text>

              {/* Avatar */}
              <View style={{
                marginTop: 14,
                marginBottom: 12,
                height: 180,
                borderRadius: 18,
                overflow: 'hidden',
                backgroundColor: 'rgba(255,255,255,0.20)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={{ width: 160, height: 160 }} resizeMode="contain" />
                ) : presetAvatar ? (
                  <Image source={presetAvatar.image} style={{ width: 160, height: 160 }} resizeMode="contain" />
                ) : (
                  <View style={{
                    width: 120, height: 120,
                    borderRadius: 999,
                    backgroundColor: selectedType.accent,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 38, fontWeight: '900' }}>
                      {initials}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={{ color: '#0b0f2a', fontWeight: '700', marginBottom: 12 }}>
                Collector • Trade Partner
              </Text>

              {/* Rating badge */}
              <View style={{
                backgroundColor: 'rgba(255,255,255,0.28)',
                borderRadius: 999,
                paddingHorizontal: 12, paddingVertical: 8,
                marginBottom: 12,
                alignSelf: 'flex-start',
              }}>
                <Text style={{ color: '#0b0f2a', fontWeight: '900', fontSize: 13 }}>
                  {ratingSummary && ratingSummary.review_count > 0
                    ? `⭐ ${Number(ratingSummary.average_rating).toFixed(1)} · ${ratingSummary.review_count} review${ratingSummary.review_count !== 1 ? 's' : ''}`
                    : '⭐ No reviews yet'}
                </Text>
              </View>

              {/* Type + background rows */}
              {[
                { label: 'Collector Type', value: selectedType.label },
                { label: 'Background', value: selectedBackground.label },
              ].map(({ label, value }) => (
                <View key={label} style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  backgroundColor: 'rgba(255,255,255,0.28)',
                  borderRadius: 14,
                  paddingHorizontal: 12, paddingVertical: 10,
                  marginBottom: 8,
                }}>
                  <Text style={{ color: '#0b0f2a', fontWeight: '700' }}>{label}</Text>
                  <Text style={{ color: '#0b0f2a', fontWeight: '900' }}>{value}</Text>
                </View>
              ))}

              <Text style={{ color: 'rgba(11,15,42,0.72)', textAlign: 'center', marginTop: 10, fontWeight: '700' }}>
                Collecting. Trading. Connecting.
              </Text>
            </View>
          </View>

          {/* ===============================
              FRIEND + TRADE BUTTONS
          =============================== */}
          {!isOwnProfile && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 22 }}>
              <TouchableOpacity
                onPress={handleFriendAction}
                disabled={friendBusy}
                style={{
                  flex: 1,
                  backgroundColor: friendStatus === 'accepted' ? '#22C55E' : '#FFD166',
                  borderRadius: 14,
                  paddingVertical: 13,
                  alignItems: 'center',
                  opacity: friendBusy ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#0b0f2a', fontWeight: '900', fontSize: 14 }}>
                  {friendButtonLabel()}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
  if (!userId) return;
  router.push({
    pathname: '/trade/[userId]',
    params: {
      userId,
      userName: profile?.collector_name ?? '',
    },
  });
}}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  borderRadius: 14,
                  paddingVertical: 13,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.3)',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14 }}>
                  🤝 Trade
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ===============================
              SHOWCASE CARDS
          =============================== */}
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginBottom: 6 }}>
            Showcase
          </Text>
          <Text style={{ color: '#D5DAEC', fontSize: 13, lineHeight: 18, marginBottom: 14 }}>
            Favourite and chase cards this collector wants to show off.
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
            <TopLoaderCard label="⭐ Favourite" card={favoriteCard} />
            <TopLoaderCard label="🎯 Chase" card={chaseCard} />
          </View>

          {/* ===============================
              PUBLIC BINDERS
          =============================== */}
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginBottom: 6 }}>
            Public Binders
          </Text>
          <Text style={{ color: '#D5DAEC', fontSize: 13, lineHeight: 18, marginBottom: 14 }}>
            Read-only binders this collector has chosen to share.
          </Text>

          {binders.length === 0 ? (
            <View style={{
              backgroundColor: 'rgba(10,14,31,0.45)',
              borderRadius: 16, padding: 18,
              alignItems: 'center', marginBottom: 20,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
            }}>
              <Text style={{ color: '#D5DAEC', textAlign: 'center' }}>
                No public binders shared yet.
              </Text>
            </View>
          ) : (
            <View style={{ marginBottom: 20 }}>
              {binders.map((binder) => {
                const progress = binderCounts[binder.id] ?? { owned: 0, total: 0 };
                const percent = progress.total > 0
                  ? (progress.owned / progress.total) * 100
                  : 0;

                return (
                  <TouchableOpacity
                    key={binder.id}
                    onPress={() => router.push({
                      pathname: '/binder/[id]',
                      params: { id: binder.id, readOnly: 'true' },
                    })}
                    style={{
                      flexDirection: 'row',
                      borderRadius: 20,
                      overflow: 'hidden',
                      marginBottom: 12,
                      minHeight: 100,
                      backgroundColor: 'rgba(10,14,31,0.45)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)',
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ width: 16, backgroundColor: binder.color ?? '#2563eb' }} />

                    <View style={{ flex: 1, padding: 14 }}>
                      <View style={{
                        alignSelf: 'flex-start',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        paddingHorizontal: 10, paddingVertical: 4,
                        borderRadius: 999, marginBottom: 8,
                      }}>
                        <Text style={{ color: '#D5DAEC', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>
                          {binder.type === 'official' ? 'OFFICIAL' : 'CUSTOM'}
                        </Text>
                      </View>

                      <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginBottom: 4 }}>
                        {binder.name}
                      </Text>

                      <Text style={{ color: '#D5DAEC', fontSize: 13, marginBottom: 10 }}>
                        {progress.owned} / {progress.total} owned
                      </Text>

                      <View style={{ height: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <View style={{
                          width: `${percent}%`,
                          height: '100%',
                          backgroundColor: binder.color ?? '#2563eb',
                          borderRadius: 999,
                        }} />
                      </View>
                    </View>

                    <View style={{ justifyContent: 'center', paddingRight: 14 }}>
                      <Ionicons name="chevron-forward" size={16} color="#D5DAEC" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ===============================
              TRADER REVIEWS
          =============================== */}
          <View style={{
            backgroundColor: 'rgba(10,14,31,0.45)',
            borderRadius: 20, padding: 16,
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
            marginBottom: 18,
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginBottom: 12 }}>
              Trader Reviews
            </Text>

            {reviews.length === 0 ? (
              <Text style={{ color: '#D5DAEC', textAlign: 'center', fontSize: 14 }}>
                No reviews yet.
              </Text>
            ) : (
              reviews.map((review) => (
                <View key={review.id} style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(255,255,255,0.06)',
                }}>
                  <Text style={{ color: '#FFD166', fontSize: 16, fontWeight: '900', marginBottom: 6 }}>
                    {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                  </Text>

                  {review.comment ? (
  <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20 }}>
   &quot;{review.comment}&quot;
  </Text>
) : (
  <Text style={{ color: '#D5DAEC', fontSize: 14, fontStyle: 'italic' }}>
    No written comment.
  </Text>
)}

                  <Text style={{ color: '#D5DAEC', fontSize: 12, marginTop: 6 }}>
                    {new Date(review.created_at).toLocaleDateString()}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* ===============================
              COLLECTOR INFO
          =============================== */}
          <View style={{
            backgroundColor: 'rgba(10,14,31,0.45)',
            borderRadius: 20, padding: 16,
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
            marginBottom: 18,
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginBottom: 12 }}>
              Collector Info
            </Text>

            {[
              { label: 'Name', value: profile.collector_name ?? 'Unknown' },
              { label: 'Type', value: selectedType.label },
              { label: 'Theme', value: selectedBackground.label },
            ].map(({ label, value }) => (
              <View key={label} style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(255,255,255,0.06)',
              }}>
                <Text style={{ color: '#D5DAEC', fontSize: 12, marginBottom: 4 }}>{label}</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>{value}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}