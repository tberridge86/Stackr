import { theme } from '../../lib/theme';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addCardsToBinder } from '../../lib/binders';
import { searchPokemonCards, PokemonSearchCard } from '../../lib/pokemonTcgSearch';

// ===============================
// CONSTANTS
// ===============================

const QUICK_SEARCHES = [
  'Pikachu', 'Charizard', 'Mewtwo', 'Eevee',
  'Snorlax', 'Mew', 'Psyduck', 'Gengar',
];

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

// ===============================
// MAIN COMPONENT
// ===============================

export default function AddCardsToBinderScreen() {
  const params = useLocalSearchParams<{ binderId?: string }>();
  const binderId = typeof params.binderId === 'string' ? params.binderId : '';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PokemonSearchCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Persists selections across searches
  const [selectedCards, setSelectedCards] = useState<
    Record<string, PokemonSearchCard>
  >({});

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedCount = Object.keys(selectedCards).length;
  const selectedList = Object.values(selectedCards);

  // ===============================
  // SEARCH
  // ===============================

  const runSearch = useCallback(async (override?: string) => {
    const searchTerm = (override ?? query).trim();

    if (!searchTerm) {
      setResults([]);
      return;
    }

    if (override) setQuery(override);

    try {
      setSearching(true);
      const data = await searchPokemonCards(searchTerm);
      setResults(data);
    } catch (error: any) {
      Alert.alert('Search error', error?.message ?? 'Could not search cards.');
    } finally {
      setSearching(false);
    }
  }, [query]);

  // Debounced search on type
  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (text.trim().length < 2) return;

    searchTimerRef.current = setTimeout(() => {
      runSearch(text);
    }, 400);
  }, [runSearch]);

  // ===============================
  // SELECTION
  // ===============================

  const toggleCard = useCallback((card: PokemonSearchCard) => {
    setSelectedCards((prev) => {
      const next = { ...prev };
      if (next[card.id]) {
        delete next[card.id];
      } else {
        next[card.id] = card;
      }
      return next;
    });
  }, []);

  const selectAllResults = useCallback(() => {
    setSelectedCards((prev) => {
      const next = { ...prev };
      for (const card of results) {
        next[card.id] = card;
      }
      return next;
    });
  }, [results]);

  const clearSelection = useCallback(() => {
    setSelectedCards({});
  }, []);

  // ===============================
  // SAVE
  // ===============================

  const save = useCallback(async () => {
    if (!binderId) {
      Alert.alert('Error', 'Missing binder.');
      return;
    }

    if (!selectedList.length) {
      Alert.alert('Nothing selected', 'Choose at least one card.');
      return;
    }

    try {
      setSaving(true);

      await addCardsToBinder(
        binderId,
        selectedList.map((card) => ({
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
  }, [binderId, selectedList]);

  // ===============================
  // RENDER CARD
  // ===============================

  const renderCard = useCallback(({ item }: { item: PokemonSearchCard }) => {
    const selected = Boolean(selectedCards[item.id]);

    return (
      <TouchableOpacity
        onPress={() => toggleCard(item)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: selected
            ? theme.colors.primary + '18'
            : theme.colors.card,
          borderRadius: 14,
          padding: 12,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          ...cardShadow,
        }}
        activeOpacity={0.8}
      >
        {/* Card image */}
        {item.images?.small ? (
          <Image
            source={{ uri: item.images.small }}
            style={{ width: 52, height: 72, borderRadius: 8, marginRight: 12 }}
            resizeMode="contain"
          />
        ) : (
          <View style={{
            width: 52, height: 72,
            borderRadius: 8, marginRight: 12,
            backgroundColor: theme.colors.surface,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 10 }}>No image</Text>
          </View>
        )}

        {/* Card info */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }} numberOfLines={1}>
            {item.name ?? 'Unknown card'}
          </Text>
          <Text style={{ color: theme.colors.textSoft, marginTop: 4, fontSize: 13 }} numberOfLines={1}>
            {item.set?.name ?? 'Unknown set'}
            {item.number ? ` • #${item.number}` : ''}
          </Text>
          {!!item.rarity && (
            <Text style={{ color: '#FFD166', marginTop: 4, fontSize: 12, fontWeight: '700' }}>
              {item.rarity}
            </Text>
          )}
        </View>

        {/* Checkbox */}
        <View style={{
          width: 26, height: 26,
          borderRadius: 999,
          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 2,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          marginLeft: 8,
        }}>
          {selected && (
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          )}
        </View>
      </TouchableOpacity>
    );
  }, [selectedCards, toggleCard]);

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={['top']}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
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
              Add Cards
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
              Search and select cards to add to your binder
            </Text>
          </View>
        </View>

        {/* Search bar */}
        <View style={{ flexDirection: 'row', marginBottom: 12, gap: 10 }}>
          <View style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.colors.card,
            borderRadius: 14,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            gap: 8,
          }}>
            <Ionicons name="search" size={16} color={theme.colors.textSoft} />
            <TextInput
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search Pokémon, card name, set..."
              placeholderTextColor={theme.colors.textSoft}
              style={{
                flex: 1,
                color: theme.colors.text,
                paddingVertical: 14,
                fontWeight: '600',
              }}
              returnKeyType="search"
              onSubmitEditing={() => runSearch()}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textSoft} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={() => runSearch()}
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: 14,
              paddingHorizontal: 16,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Search</Text>
          </TouchableOpacity>
        </View>

        {/* Quick searches */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
          style={{ marginBottom: 4 }}
        >
          {QUICK_SEARCHES.map((term) => (
            <TouchableOpacity
              key={term}
              onPress={() => runSearch(term)}
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>
                {term}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Selection controls */}
        {results.length > 0 && !searching && (
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
              {results.length} result{results.length !== 1 ? 's' : ''}
              {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
            </Text>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={selectAllResults}
                style={{
                  backgroundColor: theme.colors.card,
                  borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 7,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>
                  All
                </Text>
              </TouchableOpacity>

              {selectedCount > 0 && (
                <TouchableOpacity
                  onPress={clearSelection}
                  style={{
                    backgroundColor: theme.colors.card,
                    borderRadius: 10,
                    paddingHorizontal: 12, paddingVertical: 7,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ color: theme.colors.textSoft, fontWeight: '700', fontSize: 12 }}>
                    Clear
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Selected across searches summary */}
        {selectedCount > 0 && (
          <View style={{
            backgroundColor: theme.colors.primary + '12',
            borderRadius: 12,
            padding: 10,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: theme.colors.primary + '30',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
            <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 13, flex: 1 }}>
              {selectedCount} card{selectedCount !== 1 ? 's' : ''} selected
              {results.length > 0 ? ' — search more to add more' : ''}
            </Text>
            <TouchableOpacity onPress={clearSelection}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Results list */}
        {searching ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
            <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
              Searching...
            </Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={renderCard}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={{ paddingTop: 40, alignItems: 'center' }}>
                <Ionicons name="albums-outline" size={42} color={theme.colors.textSoft} />
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginTop: 14 }}>
                  Search for cards
                </Text>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
                  Search a Pokémon name or card set.{'\n'}
                  Tip: search "Psyduck" then tap All to grab them all.
                </Text>
              </View>
            }
          />
        )}

        {/* Add button */}
        <TouchableOpacity
          onPress={save}
          disabled={saving || selectedCount === 0}
          style={{
            position: 'absolute',
            left: 16, right: 16, bottom: 24,
            backgroundColor: selectedCount === 0
              ? theme.colors.textSoft
              : theme.colors.primary,
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '900', fontSize: 15 }}>
                {selectedCount === 0
                  ? 'Select cards to add'
                  : `Add ${selectedCount} card${selectedCount !== 1 ? 's' : ''} to Binder`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}