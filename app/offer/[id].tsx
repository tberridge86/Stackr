import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchOfferEvents,
  sendOfferMessage,
} from '../../lib/tradeOfferEvents';

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const data = await fetchOfferEvents(id);
      setEvents(data);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) load();
  }, [id]);

  const handleSend = async () => {
    if (!message.trim()) return;

    await sendOfferMessage(id, message);
    setMessage('');
    load();
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontWeight: 'bold' }}>{item.event_type}</Text>
            {item.note && <Text>{item.note}</Text>}
            {item.proposed_cash_amount && (
              <Text>💰 £{item.proposed_cash_amount}</Text>
            )}
          </View>
        )}
      />

      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Send message..."
          style={{
            flex: 1,
            borderWidth: 1,
            padding: 10,
            borderRadius: 10,
          }}
        />

        <TouchableOpacity
          onPress={handleSend}
          style={{
            marginLeft: 10,
            backgroundColor: '#2563eb',
            padding: 12,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: '#fff' }}>Send</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}