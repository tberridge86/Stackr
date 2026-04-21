import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, ScrollView, Pressable, View } from 'react-native';

function DexCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

export default function PokedexScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Pokédex</Text>
        <Text style={styles.subheading}>Explore Pokémon tied to your cards and collection.</Text>

        <View style={styles.grid}>
          <DexCard title="Browse Pokémon" subtitle="Search and explore entries" />
          <DexCard title="Owned Links" subtitle="See which Pokémon appear in your cards" />
          <DexCard title="Type Search" subtitle="Filter by type and family" />
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