import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, ScrollView, Pressable, View } from 'react-native';

function MarketCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

export default function MarketScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Market</Text>
        <Text style={styles.subheading}>Track values, sold listings, and card price movement.</Text>

        <View style={styles.grid}>
          <MarketCard title="Card Values" subtitle="Search current values" />
          <MarketCard title="Trending Cards" subtitle="See what is moving" />
          <MarketCard title="Recent Sales" subtitle="Review sold market activity" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0f2a' },
  container: { padding: 20, paddingBottom: 120 },
  heading: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subheading: { color: '#aab3d1', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  grid: { gap: 14 },
  card: {
    backgroundColor: '#151b45',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  cardSubtitle: { color: '#aab3d1', fontSize: 14, lineHeight: 20 },
});