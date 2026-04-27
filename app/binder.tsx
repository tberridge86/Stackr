import { theme } from '../lib/theme';
import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAllSets, fetchCardsForSet, PokemonCard, PokemonSet } from '../lib/pokemonTcg';
import { useCollection } from '../components/collection-context';

type BinderSet = {
  set: PokemonSet;
  cards: PokemonCard[];
};

export default function BinderScreen() {
  const { trackedSetIds } = useCollection();
  const [binderSets, setBinderSets] = useState<BinderSet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBinder = async () => {
      try {
        const allSets = await fetchAllSets();
        const trackedSets = allSets.filter((set) => trackedSetIds.includes(set.id));

        const setResults = await Promise.all(
          trackedSets.map(async (set) => {
            const saved = await AsyncStorage.getItem(`ownedCards:${set.id}`);
            const ownedIds: string[] = saved ? JSON.parse(saved) : [];

            if (ownedIds.length === 0) {
              return null;
            }

            const cards = await fetchCardsForSet(set.id);
            const ownedCards = cards.filter((card) => ownedIds.includes(card.id));

            if (ownedCards.length === 0) {
              return null;
            }

            return {
              set,
              cards: ownedCards,
            };
          })
        );

        setBinderSets(setResults.filter(Boolean) as BinderSet[]);
      } catch (error) {
        console.log('Failed to load binder', error);
      } finally {
        setLoading(false);
      }
    };

    loadBinder();
  }, [trackedSetIds]);

  const totalOwnedCards = useMemo(
    () => binderSets.reduce((sum, item) => sum + item.cards.length, 0),
    [binderSets]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={18} color="#fff" />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.heading}>Binder</Text>
            <Text style={styles.subheading}>Your owned cards, grouped by set.</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroValue}>{totalOwnedCards}</Text>
          <Text style={styles.heroLabel}>Owned cards</Text>
        </View>

        {loading ? (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderTitle}>Loading binder...</Text>
            <Text style={styles.placeholderText}>Fetching your owned cards.</Text>
          </View>
        ) : binderSets.length === 0 ? (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderTitle}>Your binder is empty</Text>
            <Text style={styles.placeholderText}>
              Mark some cards as owned inside a set and they’ll show up here.
            </Text>
          </View>
        ) : (
          binderSets.map(({ set, cards }) => (
            <View key={set.id} style={styles.setSection}>
              <View style={styles.setHeader}>
                <Text style={styles.setTitle}>{set.name}</Text>
                <Text style={styles.setMeta}>{cards.length} owned</Text>
              </View>

              <View style={styles.cardGrid}>
                {cards.map((card) => (
                  <Pressable
                    key={card.id}
                    onPress={() => router.push(`/card/${card.id}?setId=${set.id}`)}
                    style={({ pressed }) => [
                      styles.cardTile,
                      pressed && styles.cardPressed,
                    ]}
                  >
                    {card.images?.small ? (
                      <Image
                        source={{ uri: card.images.small }}
                        style={styles.cardImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={styles.cardImageFallback}>
                        <Ionicons name="image-outline" size={28} color="#7987b3" />
                      </View>
                    )}

                    <Text style={styles.cardName} numberOfLines={2}>
                      {card.name}
                    </Text>
                    <Text style={styles.cardNumber}>#{card.number}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  container: {
    padding: 18,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  heading: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  subheading: {
    color: '#AAB3D1',
    fontSize: 14,
  },
  heroCard: {
    backgroundColor: '#111735',
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  heroValue: {
    color: '#FFD166',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 4,
  },
  heroLabel: {
    color: '#AAB3D1',
    fontSize: 14,
    fontWeight: '700',
  },
  placeholderCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  placeholderTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  placeholderText: {
    color: '#AAB3D1',
    fontSize: 14,
    lineHeight: 20,
  },
  setSection: {
    marginBottom: 24,
  },
  setHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  setTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    marginRight: 10,
  },
  setMeta: {
    color: '#FFD166',
    fontSize: 12,
    fontWeight: '800',
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  cardTile: {
    width: '31%',
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  cardImage: {
    width: '100%',
    height: 120,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cardImageFallback: {
    width: '100%',
    height: 120,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    minHeight: 30,
    marginBottom: 4,
  },
  cardNumber: {
    color: '#94A0C9',
    fontSize: 10,
    fontWeight: '700',
  },
});