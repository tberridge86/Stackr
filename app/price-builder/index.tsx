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
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import {
  PRODUCT_LOOKUP_OPTIONS,
  productLookupLabel,
  refreshMarketProductPrice,
  searchMarketProducts,
} from '../../lib/productSearch';
import type { ProductLookupType } from '../../lib/productSearch';


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
  | 'Damaged'
  | 'Sealed';

type LookupType = 'raw_card' | ProductLookupType;

type CardRow = {
  id: string;
  name: string;
  language?: string | null;
  set_id: string | null;
  image_small: string | null;
  image_large: string | null;
  raw_data: any;
  is_product?: boolean;
  product_type?: ProductLookupType;
  product_price_low?: number | null;
  product_price_high?: number | null;
  product_price_count?: number | null;
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

const PRODUCT_CONDITIONS: Condition[] = ['Sealed'];

const CONDITION_MULTIPLIER: Record<Condition, number> = {
  Mint: 1,
  'Near Mint': 0.95,
  'Lightly Played': 0.82,
  'Moderately Played': 0.65,
  'Heavily Played': 0.45,
  Damaged: 0.25,
  Sealed: 1,
};

const LOOKUP_OPTIONS: { key: LookupType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'raw_card', label: 'Raw Card', icon: 'albums-outline' },
  ...PRODUCT_LOOKUP_OPTIONS.map((option) => ({
    key: option.key,
    label: option.label,
    icon: option.icon as keyof typeof Ionicons.glyphMap,
  })),
];

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
  if (card.is_product) return card.raw_data?.productPrice?.average ?? null;

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

const productToBuilderRow = (product: Awaited<ReturnType<typeof searchMarketProducts>>[number]): CardRow => ({
  id: product.id,
  name: product.name,
  set_id: product.set_name,
  image_small: product.image_url,
  image_large: product.image_large_url ?? product.image_url,
  raw_data: {
    set: { name: product.set_name ?? productLookupLabel(product.product_type) },
    productPrice: product.latest_price,
  },
  is_product: true,
  product_type: product.product_type,
  product_price_low: product.latest_price?.low ?? null,
  product_price_high: product.latest_price?.high ?? null,
  product_price_count: product.latest_price?.count ?? null,
});

// ===============================
// MAIN COMPONENT
// ===============================

export default function PriceBuilderScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [lookupType, setLookupType] = useState<LookupType>('raw_card');
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

      if (lookupType !== 'raw_card') {
        const products = await searchMarketProducts(text, lookupType, 30);
        if (products[0] && products[0].latest_price?.average == null) {
          try {
            const price = await refreshMarketProductPrice(products[0]);
            products[0] = { ...products[0], latest_price: price };
          } catch (error) {
            console.log('Product price refresh failed', error);
          }
        }
        setResults(products.map(productToBuilderRow));
        return;
      }

      const cards = await searchLocalPokemonCards<CardRow>(text, {
        language: 'all',
        limit: 80,
        select: 'id, name, language, set_id, image_small, image_large, raw_data',
      });

      setResults(cards);
    } catch (error) {
      console.log('Search failed', error);
      Alert.alert('Search failed', 'Could not search cards.');
    } finally {
      setSearching(false);
    }
  }, [lookupType]);

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
      condition: card.is_product ? 'Sealed' : 'Near Mint',
      quantity: 1,
      tcgPrice: card.is_product ? null : getTcgPrice(card.raw_data),
      ebayPrice: card.is_product ? card.raw_data?.productPrice?.average ?? null : null,
      cardmarketPrice: card.is_product ? null : getCardmarketPrice(card.raw_data),
      ebayLoading: !card.is_product,
    }));

    setItems((prev) => [...prev, ...newItems]);
    setPendingSelection({});
    setQuery('');
    setResults([]);

    for (const newItem of newItems) {
      if (newItem.card.is_product) continue;
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
      setLookupType('raw_card');
      setQuery('raw');
      runSearch('raw');
      return;
    }
    if (action === 'sealed') {
      setLookupType('booster_bundle');
      setQuery('booster');
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
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 14, marginTop: 1 }} numberOfLines={1}>
            {item.is_product ? `${item.raw_data?.set?.name ?? item.set_id ?? 'Product'} · ${money(item.raw_data?.productPrice?.average ?? null)}` : item.raw_data?.set?.name ?? item.set_id ?? 'Unknown set'}
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
    const itemConditions = item.card.is_product ? PRODUCT_CONDITIONS : CONDITIONS;
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
            {item.card.is_product && item.card.product_price_count != null ? ` · ${item.card.product_price_count} comps` : ''}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 4, paddingVertical: 4 }}
          >
            {itemConditions.map((condition) => {
              const active = item.condition === condition;
              return (
                <TouchableOpacity
                  key={condition}
                  onPress={() => updateCondition(item.localId, condition)}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <Text style={{
                    color: active ? theme.colors.primary : theme.colors.textSoft,
                    fontWeight: '900',
                    fontSize: 12,
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
            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900', textAlign: 'right' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
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
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
      <StackrBackdrop />
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
            paddingTop: 2,
            paddingBottom: insets.bottom + 156,
          }}
        >
          <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
            <Text style={{ color: theme.colors.text, fontSize: 22, lineHeight: 27, fontWeight: '900' }}>
              Price Builder
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 1 }}>
              Build bundle totals fast
            </Text>
          </View>

        {/* Search */}
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 14,
          padding: 7,
          marginHorizontal: 16,
          marginBottom: 5,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 7 }}>
            {LOOKUP_OPTIONS.map((option) => {
              const active = lookupType === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => {
                    setLookupType(option.key);
                    setResults([]);
                    setPendingSelection({});
                    if (query.trim().length >= 2) {
                      setTimeout(() => runSearch(query), 0);
                    }
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    borderRadius: 999,
                    paddingHorizontal: 9,
                    paddingVertical: 6,
                    backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <Ionicons name={option.icon} size={15} color={active ? theme.colors.primary : theme.colors.textSoft} />
                  <Text style={{ color: active ? theme.colors.primary : theme.colors.textSoft, fontWeight: '900', fontSize: 10.5, lineHeight: 13 }}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TextInput
            value={query}
            onChangeText={handleQueryChange}
            placeholder={lookupType === 'raw_card' ? 'Search e.g. Charizard base...' : `Search ${productLookupLabel(lookupType).toLowerCase()}...`}
            placeholderTextColor={theme.colors.textSoft}
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="words"
            style={{
              backgroundColor: theme.colors.bg,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 7,
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

              <View style={{ maxHeight: 118 }}>
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
          contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingBottom: 6 }}
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
                  gap: 6,
                  borderRadius: 999,
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                  backgroundColor: active ? theme.colors.primary + '12' : theme.colors.card,
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
                    fontSize: 11,
                    lineHeight: 14,
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
            marginBottom: 8,
            backgroundColor: theme.colors.primary + '12',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.primary + '35',
            padding: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                Best estimate
              </Text>
              <Text style={{ color: theme.colors.primary, fontSize: 18, lineHeight: 23, fontWeight: '900', marginTop: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                {money(bestEstimate)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                {offerPercentNumber}% offer
              </Text>
              <Text style={{ color: '#22C55E', fontSize: 15, lineHeight: 19, fontWeight: '900', marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                {money(offerGuideValue)}
              </Text>
            </View>
          </View>
        )}

        {/* Bundle rows */}
        {items.length === 0 ? (
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 16, padding: 12,
            marginHorizontal: 16,
            marginTop: 8,
            borderWidth: 1, borderColor: theme.colors.border,
            alignItems: 'center',
          }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15, lineHeight: 19, textAlign: 'center' }}>
              No items yet
            </Text>
            <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 4, lineHeight: 17, fontSize: 12 }}>
              Search, select, then add to builder.
            </Text>
          </View>
        ) : (
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 16,
            marginHorizontal: 16,
            padding: 9,
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
                Your bundle ({items.length} item{items.length === 1 ? '' : 's'})
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
                + Add another item
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Estimate and offer guide */}
        <View style={{
          backgroundColor: theme.colors.card,
          borderRadius: 16,
          marginHorizontal: 16,
          marginTop: 10,
          marginBottom: 0,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 10,
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
            borderRadius: 14,
            padding: 8,
            borderWidth: 1,
            borderColor: theme.colors.primary + '35',
          }}>
            <View style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ rotate: '-8deg' }],
            }}>
              <Ionicons name="calculator-outline" size={23} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15, lineHeight: 19 }}>
                Instant Estimate
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontWeight: '700', marginTop: 1, fontSize: 11.5, lineHeight: 15 }}>
                Compare live market totals
              </Text>
            </View>
          </View>

          {[
            { label: 'TCG average', value: totals.tcg },
            { label: 'eBay sold recent', value: totals.ebay },
            { label: 'Cardmarket low-mid', value: totals.cardmarket },
          ].map(({ label, value }) => (
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
              <Text style={{ color: theme.colors.textSoft, fontWeight: '800', flex: 1, minWidth: 0, fontSize: 12.5 }} numberOfLines={1}>
                {label}
              </Text>
              <Text style={{ color: theme.colors.text, fontWeight: '900', maxWidth: '46%', textAlign: 'right', fontSize: 13 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                {money(value)}
              </Text>
            </View>
          ))}

          <View style={{
            marginTop: 8, paddingTop: 8,
            borderTopWidth: 1, borderTopColor: theme.colors.border,
            flexDirection: 'row', justifyContent: 'space-between', gap: 10,
          }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15, flex: 1, minWidth: 0 }} numberOfLines={1}>
              Best estimate
            </Text>
            <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 17, maxWidth: '50%', textAlign: 'right' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
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
            <Text style={{ color: '#22C55E', fontWeight: '900', fontSize: 15, maxWidth: '42%', textAlign: 'right' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
              {money(offerGuideValue)}
            </Text>
          </View>
        </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
