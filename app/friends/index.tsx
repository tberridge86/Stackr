import { useTheme } from '../../components/theme-context';
import React, { useCallback, useState } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AVATAR_PRESETS } from '../../lib/avatars';
import {
  getPendingFriendRequests,
  getMyFriends,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from '../../lib/friends';

// ===============================
// TYPES
// ===============================

type FriendRequest = {
  id: string;
  requester_id: string;
  requester: {
    id: string;
    collector_name: string | null;
    avatar_preset: string | null;
  } | null;
  created_at: string;
};

type Friend = {
  id: string;
  friend_id: string;
  friend: {
    id: string;
    collector_name: string | null;
    avatar_preset: string | null;
  } | null;
};

// ===============================
// HELPERS
// ===============================

function AvatarView({
  avatarPreset,
  size = 44,
}: {
  avatarPreset: string | null | undefined;
  size?: number;
}) {
  const { theme } = useTheme();
  const avatar = AVATAR_PRESETS.find((a) => a.key === avatarPreset);

  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      backgroundColor: theme.colors.primary,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {avatar?.image ? (
        <Image source={avatar.image} style={{ width: size, height: size }} />
      ) : (
        <Ionicons name="person" size={size * 0.5} color="#fff" />
      )}
    </View>
  );
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function FriendsScreen() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // ===============================
  // LOAD
  // ===============================

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [pending, accepted] = await Promise.all([
        getPendingFriendRequests(),
        getMyFriends(),
      ]);

      setRequests(pending as FriendRequest[]);
      setFriends(accepted as Friend[]);
    } catch (error) {
      console.log(error);
      Alert.alert('Error', 'Failed to load friends.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // ===============================
  // ACTIONS
  // ===============================

  const handleAccept = async (id: string) => {
    try {
      setActionBusy(id);
      await acceptFriendRequest(id);
      await loadData();
    } catch {
      Alert.alert('Error', 'Could not accept request.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleDecline = async (id: string) => {
    try {
      setActionBusy(id);
      await declineFriendRequest(id);
      await loadData();
    } catch {
      Alert.alert('Error', 'Could not decline request.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleRemoveFriend = (friendship: Friend) => {
    Alert.alert(
      'Remove friend',
      `Remove ${friendship.friend?.collector_name ?? 'this collector'} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionBusy(friendship.id);
              await removeFriend(friendship.id);
              await loadData();
            } catch {
              Alert.alert('Error', 'Could not remove friend.');
            } finally {
              setActionBusy(null);
            }
          },
        },
      ]
    );
  };

  // ===============================
  // RENDER REQUEST
  // ===============================

  const renderRequest = ({ item }: { item: FriendRequest }) => {
    const busy = actionBusy === item.id;

    return (
      <View style={{
        backgroundColor: theme.colors.card,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
        <AvatarView avatarPreset={item.requester?.avatar_preset} />

        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 2 }}>
            {item.requester?.collector_name ?? 'Collector'}
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>
            Wants to be your friend
          </Text>
        </View>

        {busy ? (
          <ActivityIndicator color={theme.colors.primary} size="small" />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => handleAccept(item.id)}
              style={{
                backgroundColor: '#22C55E',
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>
                Accept
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleDecline(item.id)}
              style={{
                backgroundColor: theme.colors.surface,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 13 }}>
                Decline
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ===============================
  // RENDER FRIEND
  // ===============================

  const renderFriend = ({ item }: { item: Friend }) => {
    const busy = actionBusy === item.id;

    return (
      <TouchableOpacity
        onPress={() => router.push(`/community/profile/${item.friend_id}`)}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 16,
          padding: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: theme.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
        activeOpacity={0.8}
      >
        <AvatarView avatarPreset={item.friend?.avatar_preset} />

        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
            {item.friend?.collector_name ?? 'Collector'}
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
            Tap to view profile
          </Text>
        </View>

        {busy ? (
          <ActivityIndicator color={theme.colors.textSoft} size="small" />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />

            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleRemoveFriend(item);
              }}
              style={{
                padding: 6,
                borderRadius: 8,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Ionicons name="person-remove-outline" size={16} color={theme.colors.textSoft} />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ===============================
  // LOADING
  // ===============================

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
            Loading friends...
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
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
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
              Friends
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
              {friends.length} friend{friends.length !== 1 ? 's' : ''}
              {requests.length > 0 ? ` · ${requests.length} pending` : ''}
            </Text>
          </View>

          {/* Find friends button */}
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/community' as any)}
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13 }}>
              Find
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={renderFriend}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              tintColor={theme.colors.primary}
            />
          }
          ListHeaderComponent={
            requests.length > 0 ? (
              <View style={{ marginBottom: 16 }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 10,
                  gap: 8,
                }}>
                  <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>
                    Pending Requests
                  </Text>
                  <View style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900' }}>
                      {requests.length}
                    </Text>
                  </View>
                </View>

                {requests.map((item) => (
                  <View key={item.id}>
                    {renderRequest({ item })}
                  </View>
                ))}

                <View style={{ height: 1, backgroundColor: theme.colors.border, marginBottom: 16 }} />

                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 10 }}>
                  Your Friends
                </Text>
              </View>
            ) : (
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 10 }}>
                Your Friends
              </Text>
            )
          }
          ListEmptyComponent={
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: 16,
              padding: 24,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 6 }}>
                No friends yet
              </Text>
              <Text style={{ color: theme.colors.textSoft, textAlign: 'center', lineHeight: 20, marginBottom: 14 }}>
                Search for collectors in the community to add friends.
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/community' as any)}
                style={{
                  backgroundColor: theme.colors.primary,
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
                  Go to Community
                </Text>
              </TouchableOpacity>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}
