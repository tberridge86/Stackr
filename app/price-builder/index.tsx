import { useTheme } from '../../components/theme-context';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { FeatureTipGate } from '../../components/FeatureTipModal';
import { StackrCardPlaceholder } from '../../components/StackrCardPlaceholder';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { searchLocalPokemonCards } from '../../lib/cardSearch';


// ===============================
// TYPES
// ===============================

import { PRICE_API_URL } from '../../lib/config';

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

const BUILDER_QUICK_FILTERS = [
  { icon: 'time-outline' as const, label: 'Recent', action: 'recent' },
  { icon: 'shield-checkmark-outline' as const, label: 'PSA 10', action: 'psa' },
  { icon: 'diamond-outline' as const, label: 'Raw', action: 'raw' },
  { icon: 'archive-outline' as const, label: 'Sealed', action: 'sealed' },
  { icon: 'sparkles-outline' as const, label: 'Near Mint', action: 'nm' },
  { icon: 'pricetag-outline' as const, label: 'Under £50', action: 'under50' },
] as const;

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
    const printedTotal = card.raw_data?.set?.printedTotal ?? card.raw_data?.set?.total;
    if (printedTotal != null) params.set('setTotal', String(printedTotal));
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
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CardRow[]>([]);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [pendingSelection, setPendingSelection] = useState<Record<string, CardRow>>({});
  const [offerPercent, setOfferPercent] = useState('85');
  const [activeQuickFilter, setActiveQuickFilter] = useState<string>('recent');
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

      const cards = await searchLocalPokemonCards<CardRow>(text, {
        limit: 80,
        select: 'id, name, set_id, image_small, image_large, raw_data',
      });

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

  const handleQuickFilter = useCallback((action: string) => {
    setActiveQuickFilter(action);
    if (action === 'nm') {
      setItems((prev) => prev.map((item) => ({ ...item, condition: 'Near Mint' })));
      return;
    }
    if (action === 'raw') {
      setQuery('raw');
      runSearch('raw');
      return;
    }
    if (action === 'sealed') {
      setQuery('booster');
      runSearch('booster');
      return;
    }
    if (action === 'psa') {
      setQuery('psa');
      runSearch('psa');
    }
  }, [runSearch]);

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

  const offerPercentNumber = useMemo(() => {
    const parsed = Number.parseFloat(offerPercent.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
  }, [offerPercent]);

  const offerGuideValue = bestEstimate * (offerPercentNumber / 100);

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
        <View style={{ marginRight: 10 }}>
          <StackrCardPlaceholder
            uri={item.image_small}
            width={44}
            height={62}
            borderRadius={6}
          />
        </View>
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
  }, [
    pendingSelection,
    theme.colors.bg,
    theme.colors.border,
    theme.colors.primary,
    theme.colors.surface,
    theme.colors.text,
    theme.colors.textSoft,
    togglePending,
  ]);

  // ===============================
  // RENDER BUILDER ITEM
  // ===============================

  const renderBuilderItem = useCallback(({ item }: { item: BuilderItem }) => {
    const m = CONDITION_MULTIPLIER[item.condition];
    const tcg = item.tcgPrice != null ? item.tcgPrice * m : null;
    const ebay = item.ebayPrice != null ? item.ebayPrice * m : null;
    const cardmarket = item.cardmarketPrice != null ? item.cardmarketPrice * m : null;
    const rowEstimate = [tcg, ebay, cardmarket]
      .filter((value): value is number => value != null && value > 0);
    const estimate = rowEstimate.length
      ? rowEstimate.reduce((sum, value) => sum + value, 0) / rowEstimate.length
      : null;

    return (
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.card,
        borderRadius: 12,
        padding: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 7,
        ...cardShadow,
      }}>
        <StackrCardPlaceholder
          uri={item.card.image_small ?? item.card.image_large}
          width={36}
          height={50}
          borderRadius={7}
        />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }}>
            {item.card.name}
          </Text>
          <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 10, marginTop: 1 }}>
            {item.card.raw_data?.set?.name ?? item.card.set_id ?? 'Unknown set'}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 4, paddingVertical: 4 }}
          >
            {CONDITIONS.map((condition) => {
              const active = item.condition === condition;
              return (
                <TouchableOpacity
                  key={condition}
                  onPress={() => updateCondition(item.localId, condition)}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <Text style={{
                    color: active ? '#FFFFFF' : theme.colors.textSoft,
                    fontWeight: '900',
                    fontSize: 9,
                  }}>
                    {condition}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <TouchableOpacity
              onPress={() => updateQuantity(item.localId, -1)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 8,
                backgroundColor: theme.colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.colors.text, fontWeight: '900', minWidth: 16, textAlign: 'center', fontSize: 12 }}>
              {item.quantity}
            </Text>
            <TouchableOpacity
              onPress={() => updateQuantity(item.localId, 1)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 8,
                backgroundColor: theme.colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 5, minWidth: 82 }}>
          <View>
            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900', textAlign: 'right' }}>
              {money(estimate != null ? estimate * item.quantity : null)}
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '800', textAlign: 'right' }}>
              est.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => removeItem(item.localId)}
            style={{
              width: 26,
              height: 26,
              borderRadius: 10,
              backgroundColor: theme.colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="trash-outline" size={15} color={theme.colors.textSoft} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [
    removeItem,
    theme.colors.border,
    theme.colors.card,
    theme.colors.primary,
    theme.colors.surface,
    theme.colors.text,
    theme.colors.textSoft,
    updateCondition,
    updateQuantity,
  ]);

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FeatureTipGate
        tipKey="price-builder-screen-v1"
        title="Price Builder"
        subtitle="Build a quick, fair value for trades, bundles, or listings."
        items={[
          { icon: 'search-outline', title: 'Add cards', body: 'Search cards, select them, then add them to the builder.' },
          { icon: 'options-outline', title: 'Condition matters', body: 'Set condition and quantity to adjust estimated value.' },
          { icon: 'calculator-outline', title: 'Compare totals', body: 'Use eBay, TCG, and Cardmarket totals as a guide.' },
        ]}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 6,
            paddingBottom: insets.bottom + 180,
          }}
        >
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 29, fontWeight: '900' }}>
              Price Builder
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
              Build a bundle and compare totals
            </Text>
          </View>

        {/* Search card */}
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 16,
          padding: 8,
          marginHorizontal: 16,
          marginBottom: 6,
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
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
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

              <View style={{ maxHeight: 132 }}>
                {results.slice(0, 12).map((item) => (
                  <View key={item.id}>
                    {renderResult({ item })}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 7, paddingHorizontal: 16, paddingBottom: 8 }}
        >
          {BUILDER_QUICK_FILTERS.map((item) => {
            const active = activeQuickFilter === item.action;
            return (
              <TouchableOpacity
                key={item.action}
                onPress={() => handleQuickFilter(item.action)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  backgroundColor: active ? '#F6F1FF' : theme.colors.card,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Ionicons
                  name={item.icon}
                  size={16}
                  color={active ? theme.colors.primary : theme.colors.textSoft}
                />
                <Text
                  style={{
                    color: active ? theme.colors.primary : theme.colors.textSoft,
                    fontWeight: '900',
                    fontSize: 12,
                  }}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {items.length > 0 && (
          <View style={{
            marginHorizontal: 16,
            marginBottom: 10,
            backgroundColor: theme.colors.primary + '12',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.primary + '35',
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                Best estimate
              </Text>
              <Text style={{ color: theme.colors.primary, fontSize: 20, fontWeight: '900', marginTop: 1 }}>
                {money(bestEstimate)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                {offerPercentNumber}% offer
              </Text>
              <Text style={{ color: '#22C55E', fontSize: 16, fontWeight: '900', marginTop: 2 }}>
                {money(offerGuideValue)}
              </Text>
            </View>
          </View>
        )}

        {/* Bundle rows */}
        {items.length === 0 ? (
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 18, padding: 10,
            marginHorizontal: 16,
            marginTop: 14,
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
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 18,
            marginHorizontal: 16,
            padding: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
            ...cardShadow,
          }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>
                Your bundle ({items.length} card{items.length === 1 ? '' : 's'})
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontWeight: '800', fontSize: 12 }}>
                Total items: {items.reduce((sum, item) => sum + item.quantity, 0)}
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              {items.map((item) => (
                <View key={item.localId}>
                  {renderBuilderItem({ item })}
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => setQuery('')}
              style={{
                marginTop: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: theme.colors.border,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>
                + Add another card
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Estimate and offer guide */}
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          marginHorizontal: 16,
          marginTop: 12,
          marginBottom: 0,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 12,
          ...cardShadow,
        }}>
          {items.length > 0 && (
            <TouchableOpacity
              onPress={() => setItems([])}
              style={{ alignSelf: 'flex-end', marginBottom: 6 }}
            >
              <Text style={{ color: '#EF4444', fontWeight: '900' }}>Clear All</Text>
            </TouchableOpacity>
          )}

          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: theme.colors.primary + '0E',
            borderRadius: 16,
            padding: 10,
            borderWidth: 1,
            borderColor: theme.colors.primary + '35',
          }}>
            <View style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ rotate: '-8deg' }],
            }}>
              <Ionicons name="calculator-outline" size={25} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                Instant Estimate
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontWeight: '700', marginTop: 2, fontSize: 12 }}>
                Compare live market totals
              </Text>
            </View>
          </View>

          {[
            { label: 'TCG average', value: totals.tcg },
            { label: 'eBay sold recent', value: totals.ebay },
            { label: 'Cardmarket low-mid', value: totals.cardmarket },
          ].map(({ label, value }) => (
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
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

          <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <TextInput
                value={offerPercent}
                onChangeText={(text) => setOfferPercent(text.replace(/[^0-9.]/g, '').slice(0, 6))}
                keyboardType="decimal-pad"
                selectTextOnFocus
                style={{
                  width: 58,
                  backgroundColor: theme.colors.surface,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  color: theme.colors.text,
                  fontWeight: '900',
                  textAlign: 'center',
                }}
              />
              <Text style={{ color: theme.colors.textSoft, fontWeight: '900' }}>
                % offer guide
              </Text>
            </View>
            <Text style={{ color: '#22C55E', fontWeight: '900', fontSize: 16 }}>
              {money(offerGuideValue)}
            </Text>
          </View>
        </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
