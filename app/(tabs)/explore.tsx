import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';

function SetCard({ title, progress }: { title: string; progress: string }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardMeta}>{progress}</Text>
    </Pressable>
  );
}

export default function CollectionScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Collection</Text>
        <Text style={styles.subheading}>Your tracked sets will live here.</Text>

        <View style={styles.grid}>
          <SetCard title="Base Set" progress="42 / 102 cards" />
          <SetCard title="Jungle" progress="18 / 64 cards" />
          <SetCard title="Fossil" progress="27 / 62 cards" />
          <SetCard title="151" progress="88 / 207 cards" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0b0f2a',
  },
  container: {
    padding: 20,
    paddingBottom: 120,
  },
  heading: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subheading: {
    color: '#aab3d1',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  grid: {
    gap: 14,
  },
  card: {
    backgroundColor: '#151b45',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardMeta: {
    color: '#FFD166',
    fontSize: 14,
    fontWeight: '600',
  },
});