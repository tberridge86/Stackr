import {
  sendFriendRequest,
  getFriendStatus,
  removeFriend,
} from '../../lib/friends';
import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { BACKGROUND_MAP } from '../../lib/backgrounds';
import { AVATAR_PRESETS } from '../../lib/avatars';
import {
  getCachedCardSync,
  getCachedCardsForSet,
} from '../../lib/pokemonTcgCache';
import { fetchBinderCards } from '../../lib/binders';
import { useTrade } from '../../components/trade-context';

type PublicProfile = {
  id: string;
  email: string | null;
  collector_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  banner_url: string | null;
  pokemon_type: string | null;
  background_key: string | null;
  favorite_card_id: string | null;
  favorite_set_id: string | null;
  chase_card_id: string | null;
  chase_set_id: string | null;
  created_at?: string;
};

type PublicBinder = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  type: 'official' | 'custom';
  source_set_id: string | null;
  is_public?: boolean;
  created_at?: string;
};

type RatingSummary = {
  user_id: string;
  average_rating: number | null;
  review_count: number;
};

type TradeReview = {
  id: string;
  trade_id: string;
  reviewer_id: string;
  reviewed_user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

const TYPE_OPTIONS = [
  { key: 'water', label: 'Water', accent: '#4FC3F7', card: '#78C8F0' },
  { key: 'fire', label: 'Fire', accent: '#FF8A65', card: '#F5AC78' },
  { key: 'grass', label: 'Grass', accent: '#81C784', card: '#A7DB8D' },
  { key: 'electric', label: 'Electric', accent: '#FFD54F', card: '#FAE078' },
  { key: 'psychic', label: 'Psychic', accent: '#CE93D8', card: '#FA92B2' },
  { key: 'dark', label: 'Dark', accent: '#90A4AE', card: '#705848' },
  { key: 'dragon', label: 'Dragon', accent: '#7986CB', card: '#7038F8' },
];

const BACKGROUNDS = [
  { key: 'galaxy', label: 'Galaxy', preview: '#3B2C85' },
  { key: 'forest', label: 'Forest', preview: '#2E7D32' },
  { key: 'ocean', label: 'Ocean', preview: '#1565C0' },
  { key: 'lava', label: 'Lava', preview: '#BF360C' },
];

const asGradientColors = (colors: string[]) =>
  colors as [string, string, ...string[]];

function getInitials(name: string) {
  return name
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

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
              <Text style={styles.topLoaderEmptyIcon}>✦</Text>
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

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const userId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [favoriteCard, setFavoriteCard] = useState<any | null>(null);
  const [chaseCard, setChaseCard] = useState<any | null>(null);
  const [binders, setBinders] = useState<PublicBinder[]>([]);
  const [binderCounts, setBinderCounts] = useState<
    Record<string, { owned: number; total: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [showcaseLoading, setShowcaseLoading] = useState(false);
  const [bindersLoading, setBindersLoading] = useState(false);

  const { getTraderRating, getTraderReviews } = useTrade();

  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [reviews, setReviews] = useState<TradeReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [myUserId, setMyUserId] = useState<string>('');
  const [friendship, setFriendship] = useState<any | null>(null);
  const [friendLoading, setFriendLoading] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setProfile(data as PublicProfile);
      } else {
        setProfile(null);
      }

      setLoading(false);
    };

    loadProfile();
  }, [userId]);

  useEffect(() => {
    const loadFriendship = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setMyUserId(user?.id ?? '');

      if (!user || !userId || user.id === userId) return;

      const status = await getFriendStatus(userId);
      setFriendship(status);
    };

    loadFriendship();
  }, [userId]);

  useEffect(() => {
    let mounted = true;

    const loadReviews = async () => {
      if (!userId) return;

      try {
        setReviewsLoading(true);

        const [summary, reviewRows] = await Promise.all([
          getTraderRating(userId),
          getTraderReviews(userId),
        ]);

        if (mounted) {
          setRatingSummary(summary);
          setReviews(reviewRows ?? []);
        }
      } catch (error) {
        console.log('Failed to load trader reviews', error);
        if (mounted) {
          setRatingSummary(null);
          setReviews([]);
        }
      } finally {
        if (mounted) setReviewsLoading(false);
      }
    };

    loadReviews();

    return () => {
      mounted = false;
    };
  }, [userId, getTraderRating, getTraderReviews]);

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

    const loadShowcase = async () => {
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
        console.log('Failed to load public showcase cards', error);
      } finally {
        if (mounted) setShowcaseLoading(false);
      }
    };

    loadShowcase();

    return () => {
      mounted = false;
    };
  }, [profile]);

  useEffect(() => {
    let mounted = true;

    const loadBinders = async () => {
      if (!userId) return;

      try {
        setBindersLoading(true);

        const { data, error } = await supabase
          .from('binders')
          .select('*')
          .eq('user_id', userId)
          .eq('is_public', true)
          .order('created_at', { ascending: false });

        if (error) {
          console.log('Failed to load public binders', error);
          if (mounted) {
            setBinders([]);
            setBinderCounts({});
          }
          return;
        }

        const safeBinders = (data ?? []) as PublicBinder[];

        const countEntries = await Promise.all(
          safeBinders.map(async (binder) => {
            const cards = await fetchBinderCards(binder.id);
            const owned = cards.filter((c) => c.owned).length;
            return [binder.id, { owned, total: cards.length }] as const;
          })
        );

        if (mounted) {
          setBinders(safeBinders);
          setBinderCounts(Object.fromEntries(countEntries));
        }
      } catch (error) {
        console.log('Failed to load public binders', error);
      } finally {
        if (mounted) setBindersLoading(false);
      }
    };

    loadBinders();

    return () => {
      mounted = false;
    };
  }, [userId]);

  const selectedType = useMemo(
    () =>
      TYPE_OPTIONS.find((type) => type.key === profile?.pokemon_type) ??
      TYPE_OPTIONS[0],
    [profile?.pokemon_type]
  );

  const selectedBackground = useMemo(
    () =>
      BACKGROUNDS.find((bg) => bg.key === profile?.background_key) ??
      BACKGROUNDS[0],
    [profile?.background_key]
  );

  const backgroundTheme = useMemo(
    () =>
      BACKGROUND_MAP[profile?.background_key || 'galaxy'] ??
      BACKGROUND_MAP.galaxy,
    [profile?.background_key]
  );

  const presetAvatar = useMemo(
    () =>
      AVATAR_PRESETS.find((avatar) => avatar.key === profile?.avatar_preset) ??
      null,
    [profile?.avatar_preset]
  );

  const handleFriendPress = async () => {
    if (!userId || !myUserId || myUserId === userId) return;

    try {
      setFriendLoading(true);

      if (!friendship) {
        const request = await sendFriendRequest(userId);
        setFriendship(request);
        return;
      }

      if (friendship.status === 'accepted') {
        await removeFriend(friendship.id);
        setFriendship(null);
      }
    } catch (error) {
      console.log(error);
    } finally {
      setFriendLoading(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient
        colors={asGradientColors(BACKGROUND_MAP.galaxy.colors)}
        style={styles.gradient}
      >
        <SafeAreaView style={styles.safeTransparent}>
          <View style={styles.center}>
            <ActivityIndicator color="#FFD166" />
            <Text style={styles.loadingText}>Loading collector...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!profile) {
    return (
      <LinearGradient
        colors={asGradientColors(BACKGROUND_MAP.galaxy.colors)}
        style={styles.gradient}
      >
        <SafeAreaView style={styles.safeTransparent}>
          <View style={styles.center}>
            <Text style={styles.heading}>Collector not found</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.back()}>
              <Text style={styles.primaryButtonText}>Go Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const initials = getInitials(profile.collector_name ?? 'PC');

  return (
    <LinearGradient
      colors={asGradientColors(backgroundTheme.colors)}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeTransparent}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={() => router.back()}>
              <Text style={styles.iconText}>‹</Text>
            </Pressable>

            <View style={styles.titleWrap}>
              <Text style={styles.heading}>Collector Profile</Text>
              <Text style={styles.subheading}>Public collector card</Text>
            </View>

            <View style={styles.iconSpacer} />
          </View>

          <Text style={styles.sectionTitle}>Collector Card</Text>
          <Text style={styles.sectionSubtext}>
            This is how this collector appears across the app.
          </Text>

          <View style={styles.previewWrap}>
            <View style={[styles.collectorCard, { backgroundColor: selectedType.card }]}>
              <Text style={styles.collectorSmall}>Collector</Text>

              <Text style={styles.collectorName}>
                {profile.collector_name || 'Unknown Collector'}
              </Text>

              <Text style={styles.hp}>HP 120</Text>

              <View style={styles.avatarFrame}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                ) : presetAvatar ? (
                  <Image source={presetAvatar.image} style={styles.avatarImage} />
                ) : (
                  <View
                    style={[
                      styles.initialsAvatar,
                      { backgroundColor: selectedType.accent },
                    ]}
                  >
                    <Text style={styles.initialsText}>{initials}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.cardTagline}>Collector • Trade Partner</Text>

              <View style={styles.ratingBadge}>
                <Text style={styles.ratingBadgeText}>
                  {ratingSummary && ratingSummary.review_count > 0
                    ? `⭐ ${Number(ratingSummary.average_rating).toFixed(1)} • ${ratingSummary.review_count} review${ratingSummary.review_count === 1 ? '' : 's'}`
                    : '⭐ No trader reviews yet'}
                </Text>
              </View>

              <View style={styles.attackRow}>
                <Text style={styles.attackName}>Collector Type</Text>
                <Text style={styles.attackValue}>{selectedType.label}</Text>
              </View>

              <View style={styles.attackRow}>
                <Text style={styles.attackName}>Background</Text>
                <Text style={styles.attackValue}>{selectedBackground.label}</Text>
              </View>

              <Text style={styles.footerText}>Collecting. Trading. Connecting.</Text>
            </View>
          </View>

          {myUserId !== profile.id && (
            <Pressable
              onPress={handleFriendPress}
              disabled={friendLoading || friendship?.status === 'pending'}
              style={[
                styles.primaryButton,
                {
                  marginBottom: 22,
                  opacity:
                    friendLoading || friendship?.status === 'pending' ? 0.6 : 1,
                },
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {friendLoading
                  ? 'Working...'
                  : !friendship
                  ? 'Add Friend'
                  : friendship.status === 'pending'
                  ? friendship.requester_id === myUserId
                    ? 'Request Sent'
                    : 'Pending Request'
                  : friendship.status === 'accepted'
                  ? 'Friends'
                  : 'Add Friend'}
              </Text>
            </Pressable>
          )}

          <View style={styles.showcaseHeaderRow}>
            <Text style={styles.sectionTitle}>Showcase</Text>
            {showcaseLoading && <ActivityIndicator color="#FFD166" size="small" />}
          </View>

          <Text style={styles.sectionSubtext}>
            Favourite and chase cards this collector wants to show off.
          </Text>

          <View style={styles.topLoaderRow}>
            <TopLoaderCard label="Favourite Card" card={favoriteCard} />
            <TopLoaderCard label="Chase Card" card={chaseCard} />
          </View>

          <View style={styles.showcaseHeaderRow}>
            <Text style={styles.sectionTitle}>Public Binders</Text>
            {bindersLoading && <ActivityIndicator color="#FFD166" size="small" />}
          </View>

          <Text style={styles.sectionSubtext}>
            Read-only binders this collector has chosen to share.
          </Text>

          {binders.length === 0 ? (
            <View style={styles.infoCard}>
              <Text style={styles.emptyText}>No public binders shared yet.</Text>
            </View>
          ) : (
            binders.map((binder) => {
              const progress = binderCounts[binder.id] ?? { owned: 0, total: 0 };

              return (
                <TouchableOpacity
                  key={binder.id}
                  onPress={() =>
                    router.push({
                      pathname: '/binder/[id]',
                      params: { id: binder.id },
                    })
                  }
                  style={styles.publicBinderCard}
                >
                  <View
                    style={[
                      styles.publicBinderSpine,
                      { backgroundColor: binder.color || '#2563eb' },
                    ]}
                  />

                  <View style={styles.publicBinderBody}>
                    <View style={styles.publicBinderBadge}>
                      <Text style={styles.publicBinderBadgeText}>
                        {binder.type === 'official' ? 'OFFICIAL' : 'CUSTOM'}
                      </Text>
                    </View>

                    <Text style={styles.publicBinderName}>{binder.name}</Text>
                    <Text style={styles.publicBinderMeta}>
                      {progress.owned} / {progress.total} owned
                    </Text>

                    <View style={styles.publicBinderTrack}>
                      <View
                        style={[
                          styles.publicBinderFill,
                          {
                            width: progress.total
                              ? `${(progress.owned / progress.total) * 100}%`
                              : '0%',
                            backgroundColor: binder.color || '#2563eb',
                          },
                        ]}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <View style={styles.infoCard}>
            <View style={styles.showcaseHeaderRow}>
              <Text style={styles.infoTitle}>Trader Reviews</Text>
              {reviewsLoading && <ActivityIndicator color="#FFD166" size="small" />}
            </View>

            {reviews.length === 0 ? (
              <Text style={styles.emptyText}>No reviews yet.</Text>
            ) : (
              reviews.slice(0, 5).map((review) => (
                <View key={review.id} style={styles.reviewRow}>
                  <Text style={styles.reviewStars}>
                    {'★'.repeat(review.rating)}
                    {'☆'.repeat(5 - review.rating)}
                  </Text>

                  {review.comment ? (
                    <Text style={styles.reviewComment}>“{review.comment}”</Text>
                  ) : (
                    <Text style={styles.reviewCommentMuted}>No written comment.</Text>
                  )}

                  <Text style={styles.reviewDate}>
                    {new Date(review.created_at).toLocaleDateString()}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Collector Info</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>
                {profile.collector_name || 'Unknown'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type</Text>
              <Text style={styles.infoValue}>{selectedType.label}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Theme</Text>
              <Text style={styles.infoValue}>{selectedBackground.label}</Text>
            </View>
          </View>

          <View style={styles.buttonGroup}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.back()}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeTransparent: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    padding: 18,
    paddingBottom: 120,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 28,
    marginTop: -2,
  },
  titleWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  iconSpacer: {
    width: 42,
  },
  heading: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  subheading: {
    color: '#D5DAEC',
    fontSize: 13,
    marginTop: 3,
  },
  loadingText: {
    color: '#D5DAEC',
    marginTop: 10,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  sectionSubtext: {
    color: '#D5DAEC',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  previewWrap: {
    alignItems: 'center',
    marginBottom: 22,
  },
  collectorCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 18,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  collectorSmall: {
    color: 'rgba(11,15,42,0.72)',
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 4,
  },
  collectorName: {
    color: '#0b0f2a',
    fontSize: 24,
    fontWeight: '900',
  },
  hp: {
    position: 'absolute',
    top: 18,
    right: 18,
    color: '#0b0f2a',
    fontSize: 16,
    fontWeight: '900',
  },
  avatarFrame: {
    marginTop: 14,
    marginBottom: 12,
    height: 180,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 160,
    height: 160,
    resizeMode: 'contain',
  },
  initialsAvatar: {
    width: 120,
    height: 120,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '900',
  },
  cardTagline: {
    color: '#0b0f2a',
    fontWeight: '700',
    marginBottom: 12,
  },
  ratingBadge: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  ratingBadgeText: {
    color: '#0b0f2a',
    fontWeight: '900',
    fontSize: 13,
  },
  attackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  attackName: {
    color: '#0b0f2a',
    fontWeight: '700',
  },
  attackValue: {
    color: '#0b0f2a',
    fontWeight: '900',
  },
  footerText: {
    color: 'rgba(11,15,42,0.72)',
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '700',
  },
  showcaseHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topLoaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
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
  topLoaderEmptyIcon: {
    color: '#7c859f',
    fontSize: 26,
    fontWeight: '800',
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
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
    minHeight: 34,
  },
  publicBinderCard: {
    flexDirection: 'row',
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 12,
    minHeight: 118,
    backgroundColor: 'rgba(10,14,31,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  publicBinderSpine: {
    width: 20,
  },
  publicBinderBody: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  publicBinderBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  publicBinderBadgeText: {
    color: '#D5DAEC',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  publicBinderName: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
  },
  publicBinderMeta: {
    color: '#D5DAEC',
    marginTop: 6,
    marginBottom: 12,
  },
  publicBinderTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  publicBinderFill: {
    height: '100%',
    borderRadius: 999,
  },
  emptyText: {
    color: '#D5DAEC',
    textAlign: 'center',
    fontSize: 14,
  },
  infoCard: {
    backgroundColor: 'rgba(10,14,31,0.45)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 18,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  infoRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  infoLabel: {
    color: '#D5DAEC',
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  reviewRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  reviewStars: {
    color: '#FFD166',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 6,
  },
  reviewComment: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  reviewCommentMuted: {
    color: '#D5DAEC',
    fontSize: 14,
    fontStyle: 'italic',
  },
  reviewDate: {
    color: '#D5DAEC',
    fontSize: 12,
    marginTop: 6,
  },
  buttonGroup: {
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#FFD166',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#0b0f2a',
    fontWeight: '900',
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});