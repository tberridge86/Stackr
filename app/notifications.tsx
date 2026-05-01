import { theme } from '../lib/theme';
import React, { useCallback, useState } from 'react';
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

function getNotificationIcon(type: string): {
  name: any;
  color: string;
  bg: string;
} {
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

// Route to the right screen based on notification type
function getNotificationRoute(item: Notification): string {
  switch (item.type) {
    case 'wishlist_match':
      return '/trade';
    case 'trade_offer':
    case 'offer_accepted':
    case 'offer_declined':
    case 'trade_completed':
      return item.offer_id ? `/offer?id=${item.offer_id}` : '/offers';
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

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
    } catch (error) {
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
    const { name, color, bg } = getNotificationIcon(item.type);

    return (
      <TouchableOpacity
        onPress={() => markAsRead(item)}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: item.read ? theme.colors.border : theme.colors.primary,
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
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900', flex: 1, marginRight: 8 }} numberOfLines={1}>
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

  // ===============================
  // LOADING
  // ===============================

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 40, height: 40,
              borderRadius: 12,
              backgroundColor: theme.colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 26 }}>‹</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '900' }}>
              Notifications
            </Text>
            {unreadCount > 0 && (
              <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
                {unreadCount} unread
              </Text>
            )}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={markAllAsRead}
                disabled={markingAll}
                style={{
                  backgroundColor: theme.colors.card,
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                {markingAll ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700' }}>
                    Mark all read
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {notifications.length > 0 && (
              <TouchableOpacity
                onPress={clearAll}
                style={{
                  backgroundColor: theme.colors.card,
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                  Clear all
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginBottom: 16 }}>
          Wishlist matches, trade updates and friend activity.
        </Text>

        {/* List */}
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 120,
            flexGrow: notifications.length === 0 ? 1 : 0,
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
                No notifications yet
              </Text>
              <Text style={{ color: theme.colors.textSoft, textAlign: 'center', lineHeight: 20, maxWidth: 260 }}>
                When someone lists a card from your wishlist or responds to a trade offer, you'll see it here.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}