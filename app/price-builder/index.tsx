import { theme } from '../../lib/theme';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ===============================
// TYPES
// ===============================

const PRICE_API_URL = process.env.EXPO_PUBLIC_PRICE_API_URL ?? '';

type Condition =
  | 'Mint'
  | 'Near Mint'
  | 'Lightly Played'
  | 'Moderately Played'
  | 'Heavily Played'
  | 'Damaged';

type CardRow = {
  id: string;
  name: string;
  set_id: string | null;
  image_small: string | null;
  image_large: string | null;
  raw_data: any;
};

type BuilderItem = {
  localId: string;
  card: CardRow;
  condition: Condition;
  quantity: number;
  tcgPrice: number | null;
  ebayPrice: number | null;
  cardmarketPrice: number | null;
  ebayLoading: boolean;
};

// ===============================
// CONSTANTS
// ===============================

const CONDITIONS: Condition[] = [
  'Mint',
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
];

const CONDITION_MULTIPLIER: Record<Condition, number> = {
  Mint: 1,
  'Near Mint': 0.95,
  'Lightly Played': 0.82,
  'Moderately Played': 0.65,
  'Heavily Played': 0.45,
  Damaged: 0.25,
};

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

// ===============================
// HELPERS
// ===============================

const money = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '--';
  return `£${Number(value).toFixed(2)}`;
};

const getTcgPrice = (raw: any): number | null => {
  const prices = raw?.tcgplayer?.prices;
  if (!prices) return null;
  const val =
    prices?.holofoil?.market ??
    prices?.reverseHolofoil?.market ??
    prices?.normal?.market ??
    prices?.['1stEditionHolofoil']?.market ??
    prices?.['1stEditionNormal']?.market ??
    null;
  return val != null ? Number(val) : null;
};

const getCardmarketPrice = (raw: any): number | null => {
  const prices = raw?.cardmarket?.prices;
  if (!prices) return null;
  const val =
    prices?.averageSellPrice ??
    prices?.trendPrice ??
    prices?.avg30 ??
    prices?.avg7 ??
    prices?.lowPrice ??
    null;
  return val != null ? Number(val) : null;
};

const fetchEbayPrice = async (card: CardRow): Promise<number | null> => {
  const { data } = await supabase
    .from('market_price_snapshots')
    .select('ebay_average')
    .eq('card_id', card.id)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.ebay_average != null) return Number(data.ebay_average);
  if (!PRICE_API_URL) return null;

  try {
    const params = new URLSearchParams({
      cardId: card.id,
      name: card.name ?? '',
      setName: card.raw_data?.set?.name ?? '',
      number: card.raw_data?.number ?? '',
    });
    const res = await fetch(`${PRICE_API_URL}/api/price/ebay?${params.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    const avg = json?.average ?? json?.ebay_average ?? json?.avg ?? null;
    return avg != null ? Number(avg) : null;
  } catch {
    return null;
  }
};

// ===============================
// MAIN COMPONENT
// ===============================

export default function PriceBuilderScreen() {
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CardRow[]>([]);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [pendingSelection, setPendingSelection] = useState<Record<string, CardRow>>({});
  const pendingCount = Object.keys(pendingSelection).length;
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ===============================
  // SEARCH
  // ===============================

  const runSearch = useCallback(async (text: string) => {
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      setSearching(true);

      const words = text.trim().split(' ').filter(Boolean);
      const cardName = words[0];
      const setHint = words.slice(1).join(' ');

      let query = supabase
        .from('pokemon_cards')
        .select('id, name, set_id, image_small, image_large, raw_data')
        .ilike('name', `%${cardName}%`)
        .limit(60);

      if (setHint) {
        query = query.ilike('set_id', `%${setHint}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      let cards = (data ?? []) as CardRow[];

      if (setHint) {
        const hint = setHint.toLowerCase();
        cards = cards.filter(
          (c) =>
            (c.raw_data?.set?.name ?? '').toLowerCase().includes(hint) ||
            (c.set_id ?? '').toLowerCase().includes(hint)
        );
      }

      setResults(cards);
    } catch (error) {
      console.log('Search failed', error);
      Alert.alert('Search failed', 'Could not search cards.');
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(() => runSearch(text), 350);
  }, [runSearch]);

  // ===============================
  // MULTI SELECT
  // ===============================

  const togglePending = useCallback((card: CardRow) => {
    setPendingSelection((prev) => {
      const next = { ...prev };
      if (next[card.id]) {
        delete next[card.id];
      } else {
        next[card.id] = card;
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const allSelected = results.every((r) => pendingSelection[r.id]);
    if (allSelected) {
      setPendingSelection({});
    } else {
      const next: Record<string, CardRow> = {};
      results.forEach((r) => { next[r.id] = r; });
      setPendingSelection(next);
    }
  }, [results, pendingSelection]);

  // ===============================
  // ADD SELECTED CARDS
  // ===============================

  const addPending = useCallback(async () => {
    const cards = Object.values(pendingSelection);
    if (!cards.length) return;

    const newItems: BuilderItem[] = cards.map((card) => ({
      localId: `${card.id}-${Date.now()}-${Math.random()}`,
      card,
      condition: 'Near Mint',
      quantity: 1,
      tcgPrice: getTcgPrice(card.raw_data),
      ebayPrice: null,
      cardmarketPrice: getCardmarketPrice(card.raw_data),
      ebayLoading: true,
    }));

    setItems((prev) => [...prev, ...newItems]);
    setPendingSelection({});
    setQuery('');
    setResults([]);

    for (const newItem of newItems) {
      fetchEbayPrice(newItem.card).then((ebayPrice) => {
        setItems((prev) =>
          prev.map((item) =>
            item.localId === newItem.localId
              ? { ...item, ebayPrice, ebayLoading: false }
              : item
          )
        );
      });
    }
  }, [pendingSelection]);

  // ===============================
  // ITEM ACTIONS
  // ===============================

  const removeItem = useCallback((localId: string) => {
    setItems((prev) => prev.filter((item) => item.localId !== localId));
  }, []);

  const updateCondition = useCallback((localId: string, condition: Condition) => {
    setItems((prev) =>
      prev.map((item) => item.localId === localId ? { ...item, condition } : item)
    );
  }, []);

  const updateQuantity = useCallback((localId: string, change: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.localId === localId
          ? { ...item, quantity: Math.max(1, item.quantity + change) }
          : item
      )
    );
  }, []);

  // ===============================
  // TOTALS
  // ===============================

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const m = CONDITION_MULTIPLIER[item.condition];
        acc.tcg += (item.tcgPrice ?? 0) * m * item.quantity;
        acc.ebay += (item.ebayPrice ?? 0) * m * item.quantity;
        acc.cardmarket += (item.cardmarketPrice ?? 0) * m * item.quantity;
        return acc;
      },
      { tcg: 0, ebay: 0, cardmarket: 0 }
    );
  }, [items]);

  const bestEstimate = useMemo(() => {
    const available = [
      totals.tcg > 0 ? totals.tcg : null,
      totals.ebay > 0 ? totals.ebay : null,
      totals.cardmarket > 0 ? totals.cardmarket : null,
    ].filter((v): v is number => v != null);
    if (!available.length) return 0;
    return available.reduce((sum, v) => sum + v, 0) / available.length;
  }, [totals]);

  // ===============================
  // RENDER SEARCH RESULT
  // ===============================

  const renderResult = useCallback(({ item }: { item: CardRow }) => {
    const isPending = Boolean(pendingSelection[item.id]);
    return (
      <TouchableOpacity
        onPress={() => togglePending(item)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isPending ? theme.colors.primary + '18' : theme.colors.bg,
          borderRadius: 14,
          padding: 10,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: isPending ? theme.colors.primary : theme.colors.border,
        }}
        activeOpacity={0.8}
      >
        {item.image_small ? (
          <Image
            source={{ uri: item.image_small }}
            style={{ width: 44, height: 62, borderRadius: 6, marginRight: 10 }}
            resizeMode="contain"
          />
        ) : (
          <View style={{
            width: 44, height: 62,
            borderRadius: 6, marginRight: 10,
            backgroundColor: theme.colors.surface,
          }} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{item.name}</Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
            {item.raw_data?.set?.name ?? item.set_id ?? 'Unknown set'}
          </Text>
        </View>
        <View style={{
          width: 26, height: 26,
          borderRadius: 999,
          backgroundColor: isPending ? theme.colors.primary : theme.colors.surface,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 2,
          borderColor: isPending ? theme.colors.primary : theme.colors.border,
          marginLeft: 8,
        }}>
          {isPending && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
        </View>
      </TouchableOpacity>
    );
  }, [pendingSelection, togglePending]);

  // ===============================
  // RENDER BUILDER ITEM
  // ===============================

  const renderBuilderItem = useCallback(({ item }: { item: BuilderItem }) => {
    const m = CONDITION_MULTIPLIER[item.condition];
    const tcg = item.tcgPrice != null ? item.tcgPrice * m : null;
    const ebay = item.ebayPrice != null ? item.ebayPrice * m : null;
    const cardmarket = item.cardmarketPrice != null ? item.cardmarketPrice * m : null;

    return (
      <View style={{
        flex: 1,
        backgroundColor: theme.colors.card,
        borderRadius: 16,
        padding: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...cardShadow,
      }}>
        {item.card.image_small || item.card.image_large ? (
          <Image
            source={{ uri: item.card.image_small ?? item.card.image_large ?? '' }}
            style={{ width: '100%', height: 120, marginBottom: 8, borderRadius: 8 }}
            resizeMode="contain"
          />
        ) : (
          <View style={{
            width: '100%', height: 120,
            borderRadius: 10, marginBottom: 8,
            backgroundColor: theme.colors.surface,
          }} />
        )}

        <Text numberOfLines={2} style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }}>
          {item.card.name}
        </Text>
        <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>
          {item.card.raw_data?.set?.name ?? item.card.set_id ?? 'Unknown'}
        </Text>

        {/* Quantity */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
          <TouchableOpacity
            onPress={() => updateQuantity(item.localId, -1)}
            style={{
              width: 28, height: 28, borderRadius: 9,
              backgroundColor: theme.colors.surface,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>−</Text>
          </TouchableOpacity>
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{item.quantity}</Text>
          <TouchableOpacity
            onPress={() => updateQuantity(item.localId, 1)}
            style={{
              width: 28, height: 28, borderRadius: 9,
              backgroundColor: theme.colors.surface,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Condition picker */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingVertical: 10 }}
        >
          {CONDITIONS.map((condition) => {
            const active = item.condition === condition;
            return (
              <TouchableOpacity
                key={condition}
                onPress={() => updateCondition(item.localId, condition)}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 9, paddingVertical: 7,
                  backgroundColor: active ? theme.colors.primary : theme.colors.bg,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text style={{
                  color: active ? '#FFFFFF' : theme.colors.textSoft,
                  fontWeight: '900', fontSize: 10,
                }}>
                  {condition}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Prices */}
        <View style={{ gap: 2, marginTop: 2 }}>
          <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: '800' }}>
            TCG: {money(tcg)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: '800' }}>
              eBay: {item.ebayLoading ? '' : money(ebay)}
            </Text>
            {item.ebayLoading && <ActivityIndicator size="small" color={theme.colors.textSoft} />}
          </View>
          <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: '800' }}>
            CM: {money(cardmarket)}
          </Text>
        </View>

        {/* Remove */}
        <TouchableOpacity
          onPress={() => removeItem(item.localId)}
          style={{
            marginTop: 8,
            backgroundColor: '#FEE2E2',
            borderRadius: 10,
            paddingVertical: 7,
          }}
        >
          <Text style={{ color: '#991B1B', textAlign: 'center', fontSize: 11, fontWeight: '900' }}>
            Remove
          </Text>
        </TouchableOpacity>
      </View>
    );
  }, [removeItem, updateCondition, updateQuantity]);

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
        <Text style={{ color: theme.colors.text, fontSize: 36, fontWeight: '900' }}>
          Price Builder
        </Text>
        <Text style={{ color: theme.colors.textSoft, marginTop: 3 }}>
          Build a bundle and compare totals.
        </Text>
      </View>

      <View style={{ flex: 1 }}>

        {/* Search card */}
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 12,
          marginHorizontal: 16,
          marginBottom: 12,
          marginTop: 4,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}>
          <TextInput
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Search e.g. Charizard base..."
            placeholderTextColor={theme.colors.textSoft}
            style={{
              backgroundColor: theme.colors.bg,
              borderRadius: 14,
              padding: 12,
              color: theme.colors.text,
              fontWeight: '800',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            returnKeyType="search"
            onSubmitEditing={() => runSearch(query)}
          />

          {searching && (
            <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 10 }} />
          )}

          {results.length > 0 && !searching && (
            <>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 10,
                marginBottom: 6,
              }}>
                <TouchableOpacity
                  onPress={toggleSelectAll}
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>
                    {results.every((r) => pendingSelection[r.id]) ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>

                {pendingCount > 0 && (
                  <TouchableOpacity
                    onPress={addPending}
                    style={{
                      backgroundColor: theme.colors.primary,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>
                      Add {pendingCount} to Builder
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                renderItem={renderResult}
                style={{ maxHeight: 200 }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              />
            </>
          )}
        </View>

        {/* Card grid or empty */}
        {items.length === 0 ? (
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 18, padding: 10,
            marginHorizontal: 16,
            marginTop: 140,
            borderWidth: 1, borderColor: theme.colors.border,
            alignItems: 'center',
          }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, textAlign: 'center' }}>
              No cards added yet
            </Text>
            <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
              Search for cards above, select the ones you want, then tap Add to Builder.
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.localId}
            renderItem={renderBuilderItem}
            numColumns={2}
            columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingBottom: 460, gap: 10, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Total bar */}
        <View style={{
          position: 'absolute',
          left: 0, right: 0, bottom:60,
          backgroundColor: theme.colors.card,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          padding: 16,
          paddingBottom: insets.bottom + 16,
        }}>
          {items.length > 0 && (
            <TouchableOpacity
              onPress={() => setItems([])}
              style={{ alignSelf: 'flex-end', marginBottom: 8 }}
            >
              <Text style={{ color: '#EF4444', fontWeight: '900' }}>Clear All</Text>
            </TouchableOpacity>
          )}

          {[
            { label: 'TCG total', value: totals.tcg },
            { label: 'eBay total', value: totals.ebay },
            { label: 'Cardmarket total', value: totals.cardmarket },
          ].map(({ label, value }) => (
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: theme.colors.textSoft, fontWeight: '800' }}>{label}</Text>
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{money(value)}</Text>
            </View>
          ))}

          <View style={{
            marginTop: 8, paddingTop: 10,
            borderTopWidth: 1, borderTopColor: theme.colors.border,
            flexDirection: 'row', justifyContent: 'space-between',
          }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
              Best estimate
            </Text>
            <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 18 }}>
              {money(bestEstimate)}
            </Text>
          </View>

          <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.colors.textSoft, fontWeight: '900' }}>
              85% offer guide
            </Text>
            <Text style={{ color: '#22C55E', fontWeight: '900', fontSize: 16 }}>
              {money(bestEstimate * 0.85)}
            </Text>
          </View>
        </View>

      </View>
    </View>
  );
}