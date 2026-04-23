import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { addCardsToBinder } from '../../lib/binders';
import { searchPokemonCards, PokemonSearchCard } from '../../lib/pokemonTcgSearch';

const QUICK_SEARCHES = ['Psyduck', 'Pikachu', 'Charizard', 'Eevee', 'Snorlax', 'Mew'];

export default function AddCardsToBinderScreen() {
  const params = useLocalSearchParams<{ binderId?: string }>();
  const binderId = typeof params.binderId === 'string' ? params.binderId : '';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PokemonSearchCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const selectedCards = useMemo(
    () => results.filter((card) => selectedIds.includes(card.id)),
    [results, selectedIds]
  );

  const runSearch = async (override?: string) => {
    try {
      const searchTerm = (override ?? query).trim();

      if (!searchTerm) {
        setResults([]);
        setSelectedIds([]);
        return;
      }

      if (override) {
        setQuery(override);
      }

      setSearching(true);
      const data = await searchPokemonCards(searchTerm);
      setResults(data);
      setSelectedIds([]);
    } catch (error: any) {
      Alert.alert('Search error', error?.message ?? 'Could not search cards.');
    } finally {
      setSearching(false);
    }
  };

  const toggleCard = (cardId: string) => {
    setSelectedIds((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : [...prev, cardId]
    );
  };

  const selectAllResults = () => {
    setSelectedIds(results.map((card) => card.id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const save = async () => {
    try {
      if (!binderId) {
        Alert.alert('Error', 'Missing binder.');
        return;
      }

      if (!selectedCards.length) {
        Alert.alert('Nothing selected', 'Choose at least one card.');
        return;
      }

      setSaving(true);

      await addCardsToBinder(
        binderId,
        selectedCards.map((card) => ({
          cardId: card.id,
          setId: card.set?.id ?? '',
        }))
      );

      router.replace({
        pathname: '/binder/[id]',
        params: { id: binderId },
      });
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not add cards.');
    } finally {
      setSaving(false);
    }
  };

  const resultLabel =
    results.length === 1 ? '1 result' : `${results.length} results`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0b0b' }} edges={['top']}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{ color: 'white', fontSize: 28, fontWeight: '800', marginBottom: 16 }}>
          Add Cards
        </Text>

        <View style={{ flexDirection: 'row', marginBottom: 14 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search Pokémon, card name, set..."
            placeholderTextColor="#777"
            style={{
              flex: 1,
              backgroundColor: '#151515',
              color: 'white',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 14,
              marginRight: 10,
            }}
            returnKeyType="search"
            onSubmitEditing={() => runSearch()}
          />

          <TouchableOpacity
            onPress={() => runSearch()}
            style={{
              backgroundColor: '#2563eb',
              borderRadius: 14,
              paddingHorizontal: 16,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: 'white', fontWeight: '800' }}>Search</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 12 }}
          style={{ marginBottom: 6 }}
        >
          {QUICK_SEARCHES.map((term) => (
            <TouchableOpacity
              key={term}
              onPress={() => runSearch(term)}
              style={{
                backgroundColor: '#151515',
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginRight: 8,
                borderWidth: 1,
                borderColor: '#262626',
              }}
            >
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>{term}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {!!results.length && !searching && (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#AAB3D1', fontSize: 13 }}>
              {resultLabel} · {selectedIds.length} selected
            </Text>

            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                onPress={selectAllResults}
                style={{
                  backgroundColor: '#1f2940',
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  marginRight: 8,
                }}
              >
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>
                  Select All
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={clearSelection}
                style={{
                  backgroundColor: '#151515',
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 12 }}>
                  Clear
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {searching ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 120 }}
            ListEmptyComponent={
              <View style={{ paddingTop: 40 }}>
                <Text style={{ color: '#AAB3D1', textAlign: 'center' }}>
                  Search for cards to add to this binder.
                </Text>
                <Text
                  style={{
                    color: '#7f89b0',
                    textAlign: 'center',
                    marginTop: 8,
                    fontSize: 13,
                  }}
                >
                  Tip: search a Pokémon name like Psyduck, then select all.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const selected = selectedIds.includes(item.id);

              return (
                <TouchableOpacity
                  onPress={() => toggleCard(item.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: selected ? '#1f2940' : '#151515',
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: selected ? '#3b82f6' : '#262626',
                  }}
                >
                  {item.images?.small ? (
                    <Image
                      source={{ uri: item.images.small }}
                      style={{ width: 50, height: 70, borderRadius: 8, marginRight: 12 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: 50,
                        height: 70,
                        borderRadius: 8,
                        marginRight: 12,
                        backgroundColor: '#0f0f0f',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#777', fontSize: 10 }}>No image</Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: 'white', fontWeight: '800', fontSize: 15 }}>
                      {item.name ?? 'Unknown card'}
                    </Text>
                    <Text style={{ color: '#AAB3D1', marginTop: 4 }}>
                      {item.set?.name ?? 'Unknown set'}
                      {item.number ? ` • #${item.number}` : ''}
                    </Text>
                    {!!item.rarity && (
                      <Text style={{ color: '#7f89b0', marginTop: 4, fontSize: 12 }}>
                        {item.rarity}
                      </Text>
                    )}
                  </View>

                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: selected ? '#3b82f6' : '#222',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: '800' }}>
                      {selected ? '✓' : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        <TouchableOpacity
          onPress={save}
          disabled={saving}
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 24,
            backgroundColor: '#2563eb',
            borderRadius: 14,
            paddingVertical: 14,
          }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '800' }}>
            {saving ? 'Adding...' : `Add Selected (${selectedIds.length})`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}