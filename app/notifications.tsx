import { useTheme } from '../components/theme-context';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  View,
  RefreshControl,
  Alert,
} from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { StackrScreenHeader } from '../components/StackrScreenHeader';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { stackrTabContentPadding } from '../lib/stackrSizing';

// ===============================
// TYPES
// ===============================

type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  message: string | null;
  card_id: string | null;
  set_id: string | null;
  offer_id: string | null;
  read: boolean;
  created_at: string;
};

type ActivityTab = 'all' | 'trades' | 'offers' | 'messages' | 'likes';

const ACTIVITY_TABS: { key: ActivityTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trades', label: 'Trades' },
  { key: 'offers', label: 'Offers' },
  { key: 'messages', label: 'Messages' },
  { key: 'likes', label: 'Likes' },
];

// ===============================
// HELPERS
// ===============================

function timeAgo(dateString: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateString).getTime());
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function getNotificationIcon(type: string, theme: any): { name: any; color: string; bg: string } {
  switch (type) {
    case 'wishlist_match':
      return { name: 'heart', color: '#EC4899', bg: '#FCE7F3' };
    case 'trade_offer':
      return { name: 'swap-horizontal', color: theme.colors.primary, bg: theme.colors.primary + '20' };
    case 'offer_accepted':
      return { name: 'checkmark-circle', color: '#10B981', bg: '#D1FAE5' };
    case 'offer_declined':
      return { name: 'close-circle', color: '#EF4444', bg: '#FEE2E2' };
    case 'trade_completed':
      return { name: 'trophy', color: '#F59E0B', bg: '#FEF3C7' };
    case 'friend_request':
      return { name: 'person-add', color: '#8B5CF6', bg: '#EDE9FE' };
    case 'friend_accepted':
      return { name: 'people', color: '#10B981', bg: '#D1FAE5' };
    case 'card_received':
      return { name: 'gift', color: '#F59E0B', bg: '#FEF3C7' };
    default:
      return { name: 'notifications', color: theme.colors.primary, bg: theme.colors.surface };
  }
}

function getActivityTab(type: string): ActivityTab {
  if (type.includes('message') || type.includes('chat')) return 'messages';
  if (type.includes('like') || type.includes('favourite') || type.includes('favorite') || type === 'wishlist_match') return 'likes';
  if (type.includes('offer')) return 'offers';
  if (type.includes('trade') || type.includes('card_received')) return 'trades';
  return 'all';
}

// Route to the right screen based on notification type
function getNotificationRoute(item: Notification): string {
  switch (item.type) {
    case 'wishlist_match':
      return '/trade';
    case 'trade_offer':
    case 'offer_accepted':
    case 'offer_declined':
    case 'trade_completed':
      return item.offer_id ? `/offer/${item.offer_id}` : '/offers';
    case 'friend_request':
    case 'friend_accepted':
      return '/friends';
    default:
      return '/trade';
  }
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<ActivityTab>('all');

  const unreadCount = notifications.filter((n) => !n.read).length;
  const featuredNotification = notifications.find((n) => !n.read) ?? notifications[0] ?? null;

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications;
    return notifications.filter((item) => getActivityTab(item.type) === activeTab);
  }, [activeTab, notifications]);

  // ===============================
  // LOAD
  // ===============================

  const loadNotifications = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setNotifications([]);
        return;
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications((data ?? []) as Notification[]);
    } catch (error) {
      console.log('Failed to load notifications', error);
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  // ===============================
  // ACTIONS
  // ===============================

  const markAsRead = async (item: Notification) => {
    if (!item.read) {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
      );

      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', item.id);
    }

    // Route to relevant screen
    const route = getNotificationRoute(item);
    router.push(route as any);
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0) return;

    try {
      setMarkingAll(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      Alert.alert('Error', 'Could not mark all as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  const clearAll = () => {
    Alert.alert(
      'Clear all notifications',
      'Are you sure you want to delete all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              await supabase
                .from('notifications')
                .delete()
                .eq('user_id', user.id);

              setNotifications([]);
            } catch {
              Alert.alert('Error', 'Could not clear notifications.');
            }
          },
        },
      ]
    );
  };

  // ===============================
  // RENDER NOTIFICATION
  // ===============================

  const renderNotification = ({ item }: { item: Notification }) => {
    const { name, color, bg } = getNotificationIcon(item.type, theme);

    return (
      <TouchableOpacity
        onPress={() => markAsRead(item)}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 20,
          padding: 14,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: item.read ? theme.colors.border : theme.colors.primary + '55',
          shadowColor: '#111827',
          shadowOpacity: 0.04,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },
          elevation: 1,
        }}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* Icon */}
          <View style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}>
            <Ionicons name={name} size={20} color={color} />
          </View>

          {/* Content */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '900', flex: 1, marginRight: 8 }} numberOfLines={1}>
                {item.title ?? 'Notification'}
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11 }}>
                {timeAgo(item.created_at)}
              </Text>
            </View>

            <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19 }}>
              {item.message ?? ''}
            </Text>

            {!item.read && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 }}>
                <View style={{
                  width: 6, height: 6,
                  borderRadius: 3,
                  backgroundColor: theme.colors.primary,
                }} />
                <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '900' }}>
                  New
                </Text>
              </View>
            )}
          </View>

          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.colors.textSoft}
            style={{ marginLeft: 8, marginTop: 2 }}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const renderActivityHeader = () => {
    const featuredIcon = featuredNotification ? getNotificationIcon(featuredNotification.type, theme) : null;

    return (
      <View>
        <StackrScreenHeader
          title="Activity"
          accentText="ity"
          subtitle="Stay in the loop with The Market"
          rightIcon="search-outline"
          onRightPress={() => router.push('/(tabs)/market' as any)}
        />

        <View style={{
          flexDirection: 'row',
          backgroundColor: theme.colors.card,
          borderRadius: 22,
          padding: 5,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}>
          {ACTIVITY_TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  minHeight: 42,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? theme.colors.primary + '18' : 'transparent',
                  borderWidth: active ? 1 : 0,
                  borderColor: active ? theme.colors.primary + '55' : 'transparent',
                }}
              >
                <Text style={{
                  color: active ? theme.colors.primary : theme.colors.textSoft,
                  fontSize: 13,
                  fontWeight: '900',
                }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {featuredNotification ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => markAsRead(featuredNotification)}
            style={{
              backgroundColor: theme.colors.primary + '10',
              borderRadius: 26,
              padding: 18,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: theme.colors.primary + '33',
              overflow: 'hidden',
            }}
          >
            <Ionicons name="sparkles" size={18} color="#F59E0B" style={{ position: 'absolute', right: 38, top: 28 }} />
            <Ionicons name="sparkles" size={14} color={theme.colors.primary} style={{ position: 'absolute', right: 70, top: 82 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
              <View style={{
                width: 58,
                height: 58,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: featuredIcon?.bg ?? theme.colors.card,
                marginRight: 14,
              }}>
                <Ionicons name={featuredIcon?.name ?? 'notifications'} size={26} color={featuredIcon?.color ?? theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', flex: 1 }} numberOfLines={1}>
                    {featuredNotification.title ?? 'Stackr activity'}
                  </Text>
                  {!featuredNotification.read && (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary }} />
                  )}
                </View>
                <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900', marginTop: 2 }}>
                  {timeAgo(featuredNotification.created_at)}
                </Text>
              </View>
            </View>

            <Text style={{ color: theme.colors.text, fontSize: 25, lineHeight: 31, fontWeight: '900', marginBottom: 10 }}>
              {featuredNotification.message ?? 'You have a new update waiting.'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => markAsRead(featuredNotification)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.primary,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>
                  View
                </Text>
              </TouchableOpacity>
              {!featuredNotification.read && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => markAsRead(featuredNotification)}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.card,
                    borderWidth: 1,
                    borderColor: theme.colors.primary + '55',
                  }}
                >
                  <Text style={{ color: theme.colors.primary, fontSize: 15, fontWeight: '900' }}>
                    Mark read
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
              Latest updates
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
              {unreadCount > 0 ? `${unreadCount} unread` : 'Everything is caught up'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={markAllAsRead}
                disabled={markingAll}
                style={{
                  backgroundColor: theme.colors.primary + '12',
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderWidth: 1,
                  borderColor: theme.colors.primary + '35',
                }}
              >
                {markingAll ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>
                    Mark read
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {notifications.length > 0 && (
              <TouchableOpacity
                onPress={clearAll}
                style={{
                  backgroundColor: theme.colors.card,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '900' }}>
                  Clear
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ===============================
  // LOADING
  // ===============================

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
        <StackrBackdrop />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
            Loading notifications...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
      <StackrBackdrop />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 0 }}>
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          ListHeaderComponent={renderActivityHeader}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: stackrTabContentPadding.standard,
            flexGrow: filteredNotifications.length === 0 ? 1 : 0,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadNotifications(true)}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
              <View style={{
                width: 72, height: 72,
                borderRadius: 20,
                backgroundColor: theme.colors.card,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}>
                <Ionicons name="notifications-outline" size={34} color={theme.colors.textSoft} />
              </View>

              <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 8 }}>
                No activity here yet
              </Text>
              <Text style={{ color: theme.colors.textSoft, textAlign: 'center', lineHeight: 20, maxWidth: 260 }}>
                Trade updates, offers, messages and chase matches will appear here.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}
