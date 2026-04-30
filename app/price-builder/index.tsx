import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Text } from '../../components/Text';
import { theme } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

const PRICE_API_URL = process.env.EXPO_PUBLIC_PRICE_API_URL || '';

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
};

const CONDITIONS: Condition[] = [
  'Mint',
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
];

const conditionMultiplier: Record<Condition, number> = {
  Mint: 1,
  'Near Mint': 0.95,
  'Lightly Played': 0.82,
  'Moderately Played': 0.65,
  'Heavily Played': 0.45,
  Damaged: 0.25,
};

function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '--';
  return `£${Number(value).toFixed(2)}`;
}

function getTcgPrice(raw: any): number | null {
  const prices = raw?.tcgplayer?.prices;
  if (!prices) return null;

  const possible =
    prices?.holofoil?.market ??
    prices?.reverseHolofoil?.market ??
    prices?.normal?.market ??
    prices?.['1stEditionHolofoil']?.market ??
    prices?.['1stEditionNormal']?.market ??
    null;

  return possible != null ? Number(possible) : null;
}

function getCardmarketPrice(raw: any): number | null {
  const prices = raw?.cardmarket?.prices;

  const possible =
    prices?.averageSellPrice ??
    prices?.trendPrice ??
    prices?.avg30 ??
    prices?.avg7 ??
    prices?.lowPrice ??
    null;

  return possible != null ? Number(possible) : null;
}

async function getLatestEbayPrice(card: CardRow) {
  const { data, error } = await supabase
    .from('market_price_snapshots')
    .select('ebay_average')
    .eq('card_id', card.id)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data?.ebay_average != null) {
    return Number(data.ebay_average);
  }

  if (!PRICE_API_URL) {
    console.log('No EXPO_PUBLIC_PRICE_API_URL set');
    return null;
  }

  try {
    const params = new URLSearchParams({
      cardId: card.id,
      name: card.name || '',
      setName: card.raw_data?.set?.name || '',
      number: card.raw_data?.number || '',
    });

    const response = await fetch(
      `${PRICE_API_URL}/api/price/ebay?${params.toString()}`
    );

    const rawText = await response.text();

    if (!response.ok) {
      console.log('Live eBay API failed:', response.status, rawText);
      return null;
    }

    const json = JSON.parse(rawText);

    const liveAverage =
      json?.average ??
      json?.ebay_average ??
      json?.avg ??
      null;

    return liveAverage != null ? Number(liveAverage) : null;
  } catch (error) {
    console.log('Live eBay fallback failed', error);
    return null;
  }
}

export default function PriceBuilderScreen() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CardRow[]>([]);
  const [items, setItems] = useState<BuilderItem[]>([]);

  const searchCards = async (text: string) => {
    setQuery(text);

    if (text.trim().length < 2) {
      setResults([]);
      return;
    }

    try {
      setSearching(true);

      const { data, error } = await supabase
        .from('pokemon_cards')
        .select('id, name, set_id, image_small, image_large, raw_data')
        .ilike('name', `%${text.trim()}%`)
        .limit(100);

      if (error) throw error;

      setResults((data ?? []) as CardRow[]);
    } catch (error) {
      console.log(error);
      Alert.alert('Search failed', 'Could not search cards.');
    } finally {
      setSearching(false);
    }
  };

  const addCard = async (card: CardRow) => {
    const tcgBase = getTcgPrice(card.raw_data);
    const cardmarketBase = getCardmarketPrice(card.raw_data);
    const ebayBase = await getLatestEbayPrice(card);

    setItems((current) => [
      ...current,
      {
        localId: `${card.id}-${Date.now()}`,
        card,
        condition: 'Near Mint',
        quantity: 1,
        tcgPrice: tcgBase,
        ebayPrice: ebayBase,
        cardmarketPrice: cardmarketBase,
      },
    ]);

    setQuery('');
    setResults([]);
  };

  const removeItem = (localId: string) => {
    setItems((current) => current.filter((item) => item.localId !== localId));
  };

  const updateCondition = (localId: string, condition: Condition) => {
    setItems((current) =>
      current.map((item) =>
        item.localId === localId ? { ...item, condition } : item
      )
    );
  };

  const updateQuantity = (localId: string, change: number) => {
    setItems((current) =>
      current.map((item) =>
        item.localId === localId
          ? { ...item, quantity: Math.max(1, item.quantity + change) }
          : item
      )
    );
  };

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const multiplier = conditionMultiplier[item.condition];

        acc.tcg += (item.tcgPrice ?? 0) * multiplier * item.quantity;
        acc.ebay += (item.ebayPrice ?? 0) * multiplier * item.quantity;
        acc.cardmarket +=
          (item.cardmarketPrice ?? 0) * multiplier * item.quantity;

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
    ].filter((value): value is number => value != null);

    if (!available.length) return 0;

    return available.reduce((sum, value) => sum + value, 0) / available.length;
  }, [totals]);

  const renderResult = ({ item }: { item: CardRow }) => (
    <Pressable onPress={() => addCard(item)} style={styles.resultCard}>
      {item.image_small ? (
        <Image source={{ uri: item.image_small }} style={styles.resultImage} />
      ) : (
        <View style={styles.resultImagePlaceholder} />
      )}

      <View style={{ flex: 1 }}>
        <Text style={styles.resultName}>{item.name}</Text>
        <Text style={styles.resultSet}>
          {item.raw_data?.set?.name ?? item.set_id ?? 'Unknown set'}
        </Text>
      </View>

      <Text style={styles.addText}>Add</Text>
    </Pressable>
  );

  const renderBuilderItem = ({ item }: { item: BuilderItem }) => {
    const multiplier = conditionMultiplier[item.condition];

    const tcg = item.tcgPrice != null ? item.tcgPrice * multiplier : null;
    const ebay = item.ebayPrice != null ? item.ebayPrice * multiplier : null;
    const cardmarket =
      item.cardmarketPrice != null
        ? item.cardmarketPrice * multiplier
        : null;

    return (
      <View style={styles.gridCard}>
        {item.card.image_small || item.card.image_large ? (
          <Image
            source={{
              uri: item.card.image_small ?? item.card.image_large ?? '',
            }}
            style={styles.gridCardImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.gridCardImagePlaceholder} />
        )}

        <Text style={styles.gridCardName} numberOfLines={2}>
          {item.card.name}
        </Text>

        <Text style={styles.gridCardSet} numberOfLines={1}>
          {item.card.raw_data?.set?.name ?? item.card.set_id ?? 'Unknown set'}
        </Text>

        <View style={styles.qtyRow}>
          <Pressable
            onPress={() => updateQuantity(item.localId, -1)}
            style={styles.qtyButton}
          >
            <Text style={styles.qtyButtonText}>−</Text>
          </Pressable>

          <Text style={styles.qtyText}>{item.quantity}</Text>

          <Pressable
            onPress={() => updateQuantity(item.localId, 1)}
            style={styles.qtyButton}
          >
            <Text style={styles.qtyButtonText}>+</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.conditionRow}
        >
          {CONDITIONS.map((condition) => {
            const active = item.condition === condition;

            return (
              <Pressable
                key={condition}
                onPress={() => updateCondition(item.localId, condition)}
                style={[
                  styles.conditionPill,
                  active && styles.conditionPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.conditionText,
                    active && styles.conditionTextActive,
                  ]}
                >
                  {condition}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.gridPrices}>
          <Text style={styles.gridPriceText}>TCG: {money(tcg)}</Text>
          <Text style={styles.gridPriceText}>eBay: {money(ebay)}</Text>
          <Text style={styles.gridPriceText}>CM: {money(cardmarket)}</Text>
        </View>

        <Pressable
          onPress={() => removeItem(item.localId)}
          style={styles.gridRemoveButton}
        >
          <Text style={styles.gridRemoveText}>Remove</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>Price Builder</Text>
          <Text style={styles.subheading}>
            Build a bundle and compare totals.
          </Text>
        </View>
      </View>

      <View style={styles.searchCard}>
        <TextInput
          value={query}
          onChangeText={searchCards}
          placeholder="Search cards to add..."
          placeholderTextColor={theme.colors.textSoft}
          style={styles.input}
        />

        {searching && (
          <ActivityIndicator
            color={theme.colors.primary}
            style={{ marginTop: 10 }}
          />
        )}

        {results.length > 0 && (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={renderResult}
            style={{
              marginTop: 10,
              maxHeight: 450,
            }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No cards added yet</Text>
          <Text style={styles.emptyText}>
            Search for cards above and add them to build a price total.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.localId}
          renderItem={renderBuilderItem}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.totalBar}>
        <Pressable onPress={() => setItems([])} style={styles.clearAllButton}>
          <Text style={styles.clearAllText}>Clear All</Text>
        </Pressable>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TCG total</Text>
          <Text style={styles.totalValue}>{money(totals.tcg)}</Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>eBay total</Text>
          <Text style={styles.totalValue}>{money(totals.ebay)}</Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Cardmarket total</Text>
          <Text style={styles.totalValue}>{money(totals.cardmarket)}</Text>
        </View>

        <View style={styles.bestRow}>
          <Text style={styles.bestLabel}>Best estimate</Text>
          <Text style={styles.bestValue}>{money(bestEstimate)}</Text>
        </View>

        <View style={styles.offerRow}>
          <Text style={styles.offerLabel}>85% offer guide</Text>
          <Text style={styles.offerValue}>{money(bestEstimate * 0.85)}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backText: {
    color: theme.colors.text,
    fontSize: 32,
    lineHeight: 32,
    marginTop: -3,
  },
  heading: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  subheading: {
    color: theme.colors.textSoft,
    marginTop: 3,
  },
  searchCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  input: {
    backgroundColor: theme.colors.bg,
    borderRadius: 14,
    padding: 12,
    color: theme.colors.text,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resultImage: {
    width: 44,
    height: 62,
    borderRadius: 6,
    marginRight: 10,
  },
  resultImagePlaceholder: {
    width: 44,
    height: 62,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: theme.colors.surface,
  },
  resultName: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  resultSet: {
    color: theme.colors.textSoft,
    fontSize: 12,
    marginTop: 2,
  },
  addText: {
    color: theme.colors.primary,
    fontWeight: '900',
  },
  emptyCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 18,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
    textAlign: 'center',
  },
  emptyText: {
    color: theme.colors.textSoft,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingBottom: 220,
    gap: 10,
  },
  columnWrapper: {
    gap: 10,
  },
  gridCard: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  gridCardImage: {
    width: '100%',
    height: 120,
    marginBottom: 8,
  },
  gridCardImagePlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  gridCardName: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 13,
  },
  gridCardSet: {
    color: theme.colors.textSoft,
    fontSize: 11,
    marginTop: 2,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 18,
  },
  qtyText: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  conditionRow: {
    gap: 6,
    paddingVertical: 10,
  },
  conditionPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  conditionPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  conditionText: {
    color: theme.colors.textSoft,
    fontWeight: '900',
    fontSize: 10,
  },
  conditionTextActive: {
    color: '#fff',
  },
  gridPrices: {
    marginTop: 4,
    gap: 2,
  },
  gridPriceText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  gridRemoveButton: {
    marginTop: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingVertical: 7,
  },
  gridRemoveText: {
    color: '#991B1B',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '900',
  },
  totalBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: 16,
    paddingBottom: 28,
  },
  clearAllButton: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  clearAllText: {
    color: '#EF4444',
    fontWeight: '900',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  totalLabel: {
    color: theme.colors.textSoft,
    fontWeight: '800',
  },
  totalValue: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  bestRow: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bestLabel: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
  },
  bestValue: {
    color: theme.colors.primary,
    fontWeight: '900',
    fontSize: 18,
  },
  offerRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  offerLabel: {
    color: theme.colors.textSoft,
    fontWeight: '900',
  },
  offerValue: {
    color: '#22C55E',
    fontWeight: '900',
    fontSize: 16,
  },
});