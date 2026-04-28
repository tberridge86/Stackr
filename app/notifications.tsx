import { theme } from '../lib/theme';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function NotificationsScreen() {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);

  const loadNotifications = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setNotifications([]);
        return;
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setNotifications(data ?? []);
    } catch (error) {
      console.log('Failed to load notifications', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const openNotification = async (item: any) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', item.id);

    router.push('/trade');
  };

  useEffect(() => {
    loadNotifications();
  }, []);

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ flex: 1, padding: 18 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: 30,
            fontWeight: '900',
            marginBottom: 6,
          }}
        >
          Notifications
        </Text>

        <Text
          style={{
            color: theme.colors.textSoft,
            fontSize: 14,
            marginBottom: 18,
          }}
        >
          Wishlist matches and trade updates will appear here.
        </Text>

        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 120,
            flexGrow: notifications.length === 0 ? 1 : 0,
          }}
          ListEmptyComponent={
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 80,
              }}
            >
              <Ionicons
                name="notifications-outline"
                size={42}
                color={theme.colors.textSoft}
              />
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 18,
                  fontWeight: '900',
                  marginTop: 14,
                }}
              >
                No notifications yet
              </Text>
              <Text
                style={{
                  color: theme.colors.textSoft,
                  textAlign: 'center',
                  marginTop: 8,
                  lineHeight: 20,
                }}
              >
                When someone lists a card from your wishlist, you’ll see it here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openNotification(item)}
              style={({ pressed }) => ({
                backgroundColor: theme.colors.card,
                borderRadius: 18,
                padding: 14,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: item.read
                  ? theme.colors.border
                  : theme.colors.primary,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    backgroundColor: theme.colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Ionicons
                    name={item.read ? 'notifications-outline' : 'notifications'}
                    size={20}
                    color={theme.colors.primary}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 15,
                      fontWeight: '900',
                    }}
                  >
                    {item.title ?? 'Notification'}
                  </Text>

                  <Text
                    style={{
                      color: theme.colors.textSoft,
                      fontSize: 13,
                      lineHeight: 19,
                      marginTop: 5,
                    }}
                  >
                    {item.message ?? ''}
                  </Text>

                  {!item.read && (
                    <Text
                      style={{
                        color: theme.colors.primary,
                        fontSize: 12,
                        fontWeight: '900',
                        marginTop: 8,
                      }}
                    >
                      New
                    </Text>
                  )}
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.textSoft}
                />
              </View>
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}