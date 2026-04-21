import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Image,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchAllSets,
  fetchCardsForSet,
  PokemonCard,
  PokemonSet,
} from '../../lib/pokemonTcg';
import { useTrade } from '../../components/trade-context';
import { fetchEbayPrice } from '../../lib/ebay';

export default function CardDetailScreen() {
  const { id, setId } = useLocalSearchParams<{ id: string; setId: string }>();

  const [setInfo, setSetInfo] = useState<PokemonSet | null>(null);
  const [card, setCard] = useState<PokemonCard | null>(null);
  const [owned, setOwned] = useState(false);
  const [loading, setLoading] = useState(true);

  const [ebayPrice, setEbayPrice] = useState<string | null>(null);

  const {
    toggleTradeCard,
    toggleWishlistCard,
    isForTrade,
    isWanted,
    updateTradeMeta,
    getMeta,
  } = useTrade();

  const [condition, setCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!id || !setId) return;

    const loadData = async () => {
      try {
        const [allSets, cards, savedOwned] = await Promise.all([
          fetchAllSets(),
          fetchCardsForSet(setId),
          AsyncStorage.getItem(`ownedCards:${setId}`),
        ]);

        const currentSet = allSets.find((s) => s.id === setId) ?? null;
        const currentCard = cards.find((c) => c.id === id) ?? null;
        const ownedIds: string[] = savedOwned ? JSON.parse(savedOwned) : [];

        setSetInfo(currentSet);
        setCard(currentCard);
        setOwned(ownedIds.includes(id));

        if (currentCard) {
          const meta = getMeta(currentCard.id);
          setCondition(meta.condition || '');
          setNotes(meta.notes || '');
          setValue(meta.value || '');

          // 🔥 FETCH EBAY PRICE
          const query = `${currentCard.name} ${currentSet?.name} ${currentCard.number}`;

          fetchEbayPrice(query)
            .then((data) => {
              if (data.average) {
                setEbayPrice(data.average);
              }
            })
            .catch(() => {});
        }
      } catch (error) {
        console.log('Failed to load card detail', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, setId]);

  const toggleOwned = async () => {
    if (!id || !setId) return;

    const saved = await AsyncStorage.getItem(`ownedCards:${setId}`);
    const ownedIds: string[] = saved ? JSON.parse(saved) : [];

    let nextOwned;

    if (ownedIds.includes(id)) {
      nextOwned = ownedIds.filter((c) => c !== id);
    } else {
      nextOwned = [...ownedIds, id];
    }

    await AsyncStorage.setItem(`ownedCards:${setId}`, JSON.stringify(nextOwned));
    setOwned(nextOwned.includes(id));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.heading}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!card || !setInfo) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.heading}>Card not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const forTrade = isForTrade(card.id);
  const wanted = isWanted(card.id);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* HEADER */}
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>{card.name}</Text>
        <Text style={styles.subtitle}>
          {setInfo.name} · #{card.number}
        </Text>

        {/* IMAGE */}
        {card.images?.large && (
          <Image source={{ uri: card.images.large }} style={styles.image} />
        )}

        {/* 🔥 EBAY PRICE */}
        {ebayPrice && (
          <View style={styles.ebayBox}>
            <Text style={styles.ebayLabel}>eBay Market</Text>
            <Text style={styles.ebayValue}>£{ebayPrice}</Text>
          </View>
        )}

        {/* ACTIONS */}
        <Pressable style={styles.button} onPress={toggleOwned}>
          <Text>{owned ? 'Owned' : 'Mark Owned'}</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() => toggleTradeCard(card.id)}
        >
          <Text>{forTrade ? 'Remove Trade' : 'Add to Trade'}</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() => toggleWishlistCard(card.id)}
        >
          <Text>{wanted ? 'Remove Wishlist' : 'Add to Wishlist'}</Text>
        </Pressable>

        {/* TRADE DETAILS */}
        {forTrade && (
          <View style={styles.metaBox}>
            <Text>Condition</Text>
            <TextInput
              value={condition}
              onChangeText={(text) => {
                setCondition(text);
                updateTradeMeta(card.id, { condition: text });
              }}
              style={styles.input}
            />

            <Text>Value (£)</Text>
            <TextInput
              value={value}
              onChangeText={(text) => {
                setValue(text);
                updateTradeMeta(card.id, { value: text });
              }}
              style={styles.input}
            />

            <Text>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={(text) => {
                setNotes(text);
                updateTradeMeta(card.id, { notes: text });
              }}
              style={[styles.input, { height: 80 }]}
              multiline
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080b1d' },
  container: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  back: { color: '#fff', marginBottom: 10 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#aaa', marginBottom: 10 },

  image: {
    width: '100%',
    height: 300,
    resizeMode: 'contain',
    marginBottom: 16,
  },

  ebayBox: {
    backgroundColor: '#111735',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  ebayLabel: {
    color: '#aaa',
    fontSize: 12,
  },
  ebayValue: {
    color: '#FFD166',
    fontSize: 22,
    fontWeight: '900',
  },

  button: {
    backgroundColor: '#FFD166',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },

  metaBox: {
    marginTop: 16,
  },

  input: {
    backgroundColor: '#222',
    color: '#fff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
});