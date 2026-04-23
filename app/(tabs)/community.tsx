import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';

export default function CommunityScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Community</Text>
        <Text style={styles.subheading}>
          Friends, activity, and social posts will live here.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Coming next</Text>
          <Text style={styles.cardText}>
            Friend requests, activity posts, and social updates like:
          </Text>
          <Text style={styles.bullet}>• Tom got his chase card</Text>
          <Text style={styles.bullet}>• Tom completed Perfect Order</Text>
          <Text style={styles.bullet}>• Tom listed Charizard for trade</Text>
          <Text style={styles.bullet}>• Liam added 12 cards to 151</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Planned sections</Text>
          <Text style={styles.bullet}>• Friends</Text>
          <Text style={styles.bullet}>• Activity feed</Text>
          <Text style={styles.bullet}>• Social posts</Text>
          <Text style={styles.bullet}>• Likes and comments</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080b1d' },
  container: { padding: 18, paddingBottom: 120 },
  heading: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subheading: { color: '#AAB3D1', fontSize: 15, lineHeight: 22, marginBottom: 20 },

  card: {
    backgroundColor: '#121938',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 14,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  cardText: {
    color: '#AAB3D1',
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 20,
  },
  bullet: {
    color: '#D7DCF2',
    fontSize: 14,
    marginBottom: 6,
  },
});