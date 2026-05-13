import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '../../components/profile-context';
import { AVATAR_PRESETS } from '../../lib/avatars';
import { supabase } from '../../lib/supabase';
import {
  getCachedCardSync,
  getCachedCardsForSet,
} from '../../lib/pokemonTcgCache';

// ===============================
// CONSTANTS
// ===============================

const TYPE_COLOR_MAP: Record<string, string> = {
  water: '#78C8F0',
  fire: '#e9721d',
  grass: '#A7DB8D',
  electric: '#FAE078',
  psychic: '#FA92B2',
  dark: '#705848',
  dragon: '#7038F8',
  normal: '#A8A878',
  fighting: '#C03028',
  flying: '#A890F0',
  poison: '#A040A0',
  ground: '#E0C068',
  rock: '#B8A038',
  bug: '#A8B820',
  ghost: '#705898',
  steel: '#B8B8D0',
  ice: '#98D8D8',
  fairy: '#EE99AC',
};

function getTextColorForBg(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#0b0f2a' : '#FFFFFF';
}

// ===============================
// SUB COMPONENTS
// ===============================

function TopLoaderCard({
  label,
  card,
  labelColor,
}: {
  label: string;
  card: any | null;
  labelColor?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ width: '48%', alignItems: 'center' }}>
      <Text style={{
        color: labelColor ?? theme.colors.secondary,
        fontWeight: '800',
        marginBottom: 10,
        fontSize: 13,
      }}>
        {label}
      </Text>

      <View style={{
        backgroundColor: '#d8dde6',
        borderRadius: 16,
        padding: 8,
        width: '100%',
      }}>
        <View style={{
          backgroundColor: '#f4f7fb',
          borderRadius: 12,
          minHeight: 190,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          {card?.images?.small ? (
            <Image
              source={{ uri: card.images.small }}
              style={{ width: 120, height: 168 }}
              resizeMode="contain"
            />
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="image-outline" size={28} color="#7c859f" />
              <Text style={{ color: '#7c859f', marginTop: 6, fontSize: 12 }}>
                Not set
              </Text>
            </View>
          )}
        </View>
      </View>

      <Text
        numberOfLines={2}
        style={{
          color: theme.colors.text,
          marginTop: 10,
          textAlign: 'center',
          fontWeight: '600',
          fontSize: 12,
        }}
      >
        {card?.name ?? 'No card selected'}
      </Text>
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.15)',
      borderRadius: 14,
      padding: 12,
      alignItems: 'center',
    }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 18 }}>
        {value}
      </Text>
      <Text style={{
        color: 'rgba(255,255,255,0.75)',
        fontSize: 11,
        marginTop: 3,
        fontWeight: '700',
      }}>
        {label}
      </Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  badge,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.card,
        padding: 16,
        borderRadius: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
      activeOpacity={0.8}
    >
      <Ionicons name={icon} size={20} color={theme.colors.secondary} />

      <Text style={{
        flex: 1,
        color: theme.colors.text,
        marginLeft: 12,
        fontWeight: '700',
      }}>
        {label}
      </Text>

      {badge != null && badge > 0 && (
        <View style={{
          backgroundColor: theme.colors.primary,
          borderRadius: 999,
          minWidth: 22,
          paddingHorizontal: 6,
          paddingVertical: 2,
          marginRight: 8,
        }}>
          <Text style={{
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: '900',
            textAlign: 'center',
          }}>
            {badge}
          </Text>
        </View>
      )}

      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
    </TouchableOpacity>
  );
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function ProfileScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { profile, loading, refreshProfile } = useProfile();

  const [favoriteCard, setFavoriteCard] = useState<any | null>(null);
  const [chaseCard, setChaseCard] = useState<any | null>(null);
  const [showcaseLoading, setShowcaseLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [ownedCount, setOwnedCount] = useState(0);
  const [binderCount, setBinderCount] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);
  const [successRate, setSuccessRate] = useState<number | null>(null);

  const [traderRating, setTraderRating] = useState<{
    average_rating: number | null;
    review_count: number;
  } | null>(null);

  const [unreadCount, setUnreadCount] = useState(0);

  const avatar = useMemo(() => {
    return AVATAR_PRESETS.find((a) => a.key === profile?.avatar_preset) ?? null;
  }, [profile?.avatar_preset]);

  const profileColor =
    TYPE_COLOR_MAP[profile?.pokemon_type ?? ''] ?? theme.colors.primary;

  const heroTextColor = getTextColorForBg(profileColor);

  // ===============================
  // LOAD SHOWCASE CARDS
  // ===============================

  const loadShowcaseCards = useCallback(async () => {
    if (!profile) return;

    try {
      setShowcaseLoading(true);

      const loadCard = async (cardId?: string | null, setId?: string | null) => {
        if (!cardId || !setId) return null;

        let found = getCachedCardSync(setId, cardId);

        if (!found) {
          const cards = await getCachedCardsForSet(setId);
          found = cards.find((c) => c.id === cardId) ?? null;
        }

        return found ?? null;
      };

      const [fav, chase] = await Promise.all([
        loadCard(profile.favorite_card_id, profile.favorite_set_id),
        loadCard(profile.chase_card_id, profile.chase_set_id),
      ]);

      setFavoriteCard(fav);
      setChaseCard(chase);
    } catch (error) {
      console.log('Failed to load showcase cards', error);
    } finally {
      setShowcaseLoading(false);
    }
  }, [profile]);

  // ===============================
  // LOAD STATS
  // ===============================

  const loadStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [
        bindersResult,
        ratingResult,
        notificationsResult,
        tradesResult,
      ] = await Promise.all([
        supabase
          .from('binders')
          .select('id')
          .eq('user_id', user.id),

        supabase
          .from('profile_rating_summary')
          .select('average_rating, review_count')
          .eq('user_id', user.id)
          .maybeSingle(),

        supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false),

        supabase
          .from('trade_offers')
          .select('status')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`),
      ]);

      const binderIds = (bindersResult.data ?? []).map((b) => b.id);
      setBinderCount(binderIds.length);

      if (binderIds.length > 0) {
        const { count } = await supabase
          .from('binder_cards')
          .select('*', { count: 'exact', head: true })
          .in('binder_id', binderIds)
          .eq('owned', true);

        setOwnedCount(count ?? 0);
      } else {
        setOwnedCount(0);
      }

      if (ratingResult.data) {
        setTraderRating(ratingResult.data as any);
      } else {
        setTraderRating(null);
      }

      setUnreadCount(notificationsResult.count ?? 0);

      const tradesData = tradesResult.data ?? [];

      const completed = tradesData.filter(
        (trade) => trade.status === 'completed'
      ).length;

      const failed = tradesData.filter(
        (trade) =>
          trade.status === 'cancelled' ||
          trade.status === 'disputed' ||
          trade.status === 'declined'
      ).length;

      const totalResolved = completed + failed;

      setTradeCount(completed);

      if (totalResolved > 0) {
        setSuccessRate(Math.round((completed / totalResolved) * 100));
      } else {
        setSuccessRate(null);
      }
    } catch (error) {
      console.log('Failed to load profile stats', error);
    }
  }, []);

  // ===============================
  // FOCUS EFFECT
  // ===============================

  useFocusEffect(
    useCallback(() => {
      loadShowcaseCards();
      loadStats();
    }, [loadShowcaseCards, loadStats])
  );

  useEffect(() => {
    loadShowcaseCards();
  }, [loadShowcaseCards]);

  // ===============================
  // REFRESH
  // ===============================

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        refreshProfile(),
        loadShowcaseCards(),
        loadStats(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // ===============================
  // LOGOUT
  // ===============================

  const handleLogout = async () => {
    try {
      setLoggingOut(true);

      const { error } = await supabase.auth.signOut();

      if (error) {
        Alert.alert('Logout failed', error.message);
        return;
      }

      router.replace('/login');
    } catch (error) {
      Alert.alert('Logout failed', 'Something went wrong. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: handleLogout },
      ]
    );
  };

  // ===============================
  // LOADING STATE
  // ===============================

  if (loading) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
          Loading profile...
        </Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}>
        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>
          No profile found
        </Text>

        <Text style={{
          color: theme.colors.textSoft,
          marginTop: 6,
          textAlign: 'center',
        }}>
          Complete your profile setup to continue.
        </Text>

        <TouchableOpacity
          onPress={() => router.push('/profile/setup')}
          style={{
            marginTop: 16,
            backgroundColor: theme.colors.primary,
            paddingVertical: 12,
            paddingHorizontal: 18,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '900' }}>
            Set up profile
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={confirmLogout}
          disabled={loggingOut}
          style={{
            marginTop: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FFECEC',
            padding: 14,
            borderRadius: 14,
            gap: 8,
            width: '100%',
          }}
        >
          {loggingOut ? (
            <ActivityIndicator color="#D92D20" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color="#D92D20" />
              <Text style={{ color: '#D92D20', fontWeight: '900' }}>
                Log out
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* HERO CARD */}
        <View style={{
          borderRadius: 26,
          padding: 18,
          marginBottom: 20,
          backgroundColor: profileColor,
        }}>
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}>
            <View style={{
              width: 90,
              height: 90,
              borderRadius: 22,
              backgroundColor: 'rgba(255,255,255,0.15)',
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
            }}>
              {avatar?.image ? (
                <Image source={avatar.image} style={{ width: '100%', height: '100%' }} />
              ) : (
                <View style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 30, fontWeight: '900' }}>
                    {profile.collector_name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => router.push('/notifications')}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: 'rgba(0,0,0,0.25)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="notifications-outline" size={20} color="#fff" />

                {unreadCount > 0 && (
                  <View style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: '#EF4444',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={{
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: '900',
                    }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push('/profile/setup')}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: 'rgba(0,0,0,0.25)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="create-outline" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={{
            color: heroTextColor,
            fontSize: 26,
            fontWeight: '900',
            marginTop: 16,
          }}>
            {profile.collector_name ?? 'Collector'}
          </Text>

          <Text style={{
            color: heroTextColor,
            marginTop: 4,
            fontWeight: '600',
            opacity: 0.85,
          }}>
            {profile.pokemon_type
              ? `${profile.pokemon_type.charAt(0).toUpperCase()}${profile.pokemon_type.slice(1)} Trainer`
              : 'Collector Profile'}
          </Text>

          {/* Trader trust line */}
          <View style={{
            marginTop: 10,
            backgroundColor: 'rgba(0,0,0,0.15)',
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 6,
            alignSelf: 'flex-start',
          }}>
            {(!traderRating || traderRating.review_count === 0) && tradeCount === 0 ? (
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                ⭐ New Trader
              </Text>
            ) : (
              <Text style={{ fontSize: 11, fontWeight: '700' }}>
                <Text style={{ color: '#FFD166' }}>
                  ⭐ {traderRating?.average_rating?.toFixed(1) ?? '—'}
                </Text>

                <Text style={{ color: '#FFFFFF' }}>
                  {' · '}
                  {traderRating?.review_count ?? 0} review{traderRating?.review_count === 1 ? '' : 's'}
                  {' · 🤝 '}
                  {tradeCount} trade{tradeCount === 1 ? '' : 's'}
                  {' · '}
                </Text>

                <Text style={{ color: '#22C55E' }}>
                  {successRate != null ? `✔ ${successRate}% success` : '✔ No history'}
                </Text>
              </Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <StatBox label="Cards" value={ownedCount} />
            <StatBox label="Binders" value={binderCount} />
            <StatBox label="Trades" value={tradeCount} />
          </View>
        </View>

        {/* SHOWCASE */}
        <View style={{ marginBottom: 20 }}>
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>
              Showcase
            </Text>

            {showcaseLoading && (
              <ActivityIndicator color={theme.colors.primary} size="small" />
            )}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <TopLoaderCard
              label="⭐ Favourite Card"
              card={favoriteCard}
              labelColor={theme.colors.secondary}
            />

            <TopLoaderCard
              label="🎯 Chase Card"
              card={chaseCard}
              labelColor="#FF8FA3"
            />
          </View>

          <TouchableOpacity
            onPress={() => router.push('/binder')}
            style={{
              marginTop: 12,
              backgroundColor: theme.colors.surface,
              borderRadius: 14,
              paddingVertical: 11,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{
              color: theme.colors.textSoft,
              fontWeight: '700',
              fontSize: 13,
            }}>
              Set showcase cards from your binders →
            </Text>
          </TouchableOpacity>
        </View>

        {/* QUICK ACCESS */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{
            color: theme.colors.text,
            fontSize: 18,
            fontWeight: '800',
            marginBottom: 12,
          }}>
            Quick Access
          </Text>

          <QuickAction
            icon="folder-open-outline"
            label="My Binders"
            onPress={() => router.push('/binder')}
          />

          <QuickAction
            icon="storefront-outline"
            label="Trade Marketplace"
            onPress={() => router.push('/trade')}
          />

          <QuickAction
            icon="swap-horizontal-outline"
            label="My Offers"
            onPress={() => router.push('/offers')}
          />

          <QuickAction
            icon="people-outline"
            label="Friends"
            onPress={() => router.push('/friends')}
          />

          <QuickAction
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push('/notifications')}
            badge={unreadCount}
          />

          <QuickAction
            icon="earth-outline"
            label="Community"
            onPress={() => router.push('/(tabs)/community' as any)}
          />
        </View>

        {/* ACCOUNT */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{
            color: theme.colors.text,
            fontSize: 18,
            fontWeight: '800',
            marginBottom: 12,
          }}>
            Account
          </Text>

          <QuickAction
            icon="person-outline"
            label="Edit Profile"
            onPress={() => router.push('/profile/setup')}
          />

          <QuickAction
            icon="card-outline"
            label="Seller Account & Payouts"
            onPress={() => router.push('/seller/onboarding' as any)}
          />

          {/* Dark mode toggle */}
          <TouchableOpacity
            onPress={toggleTheme}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.colors.card,
              padding: 16,
              borderRadius: 16,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            activeOpacity={0.8}
          >
            <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={20} color={theme.colors.secondary} />
            <Text style={{ flex: 1, color: theme.colors.text, marginLeft: 12, fontWeight: '700' }}>
              {isDark ? 'Dark Mode' : 'Light Mode'}
            </Text>
            <View style={{
              width: 44, height: 26, borderRadius: 13,
              backgroundColor: isDark ? theme.colors.primary : theme.colors.border,
              justifyContent: 'center',
              paddingHorizontal: 3,
            }}>
              <View style={{
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: '#FFFFFF',
                alignSelf: isDark ? 'flex-end' : 'flex-start',
              }} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={confirmLogout}
            disabled={loggingOut}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FFECEC',
              padding: 16,
              borderRadius: 16,
              gap: 8,
              opacity: loggingOut ? 0.6 : 1,
            }}
          >
            {loggingOut ? (
              <ActivityIndicator color="#D92D20" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={20} color="#D92D20" />
                <Text style={{ color: '#D92D20', fontWeight: '900' }}>
                  Log out
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
