import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../lib/theme';

import {
  getPendingFriendRequests,
  getMyFriends,
  acceptFriendRequest,
  declineFriendRequest,
} from '../../lib/friends';

export default function FriendsScreen() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [pending, accepted] = await Promise.all([
        getPendingFriendRequests(),
        getMyFriends(),
      ]);

      setRequests(pending);
      setFriends(accepted);
    } catch (error) {
      console.log(error);
      Alert.alert('Error', 'Failed to load friends.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAccept = async (id: string) => {
    try {
      await acceptFriendRequest(id);
      loadData();
    } catch {
      Alert.alert('Error', 'Could not accept request.');
    }
  };

  const handleDecline = async (id: string) => {
    try {
      await declineFriendRequest(id);
      loadData();
    } catch {
      Alert.alert('Error', 'Could not decline request.');
    }
  };

  const renderRequest = ({ item }: any) => {
    return (
      <View
        style={{
          backgroundColor: theme.colors.card,
          padding: 14,
          borderRadius: 16,
          marginBottom: 10,
        }}
      >
        <Text style={{ fontWeight: '900', marginBottom: 6 }}>
          {item.requester?.collector_name || 'Collector'}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={() => handleAccept(item.id)}
            style={{
              flex: 1,
              backgroundColor: '#22C55E',
              padding: 10,
              borderRadius: 10,
            }}
          >
            <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '900' }}>
              Accept
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleDecline(item.id)}
            style={{
              flex: 1,
              backgroundColor: '#EF4444',
              padding: 10,
              borderRadius: 10,
            }}
          >
            <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '900' }}>
              Decline
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFriend = ({ item }: any) => {
     return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        padding: 14,
        borderRadius: 16,
        marginBottom: 10,
      }}
    >
      <Text style={{ fontWeight: '900' }}>
        {item.friend?.collector_name || 'Collector'}
      </Text>
    </View>
  );
};

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 26, fontWeight: '900', marginBottom: 10 }}>
        Friends
      </Text>

      {/* REQUESTS */}
      {requests.length > 0 && (
        <>
          <Text style={{ fontWeight: '800', marginBottom: 8 }}>
            Pending Requests
          </Text>

          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            renderItem={renderRequest}
            scrollEnabled={false}
          />
        </>
      )}

      {/* FRIENDS */}
      <Text style={{ fontWeight: '800', marginVertical: 10 }}>
        Your Friends
      </Text>

      {friends.length === 0 ? (
        <Text style={{ color: theme.colors.textSoft }}>
          No friends yet.
        </Text>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={renderFriend}
        />
      )}
    </SafeAreaView>
  );
}