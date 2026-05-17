import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeatureTipGate } from '../../components/FeatureTipModal';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import {
  INVENTORY_CONDITIONS,
  InventoryCardSnapshot,
  InventoryCondition,
  InventoryItem,
  addInventorySale,
  createInventoryItem,
  loadInventoryItems,
  saveInventoryItems,
} from '../../lib/inventory';
import { getPriceFromPokemonCard } from '../../lib/pricing';
import { scanStore } from '../../lib/scanStore';
import { supabase } from '../../lib/supabase';
import { PRICE_API_URL } from '../../lib/config';

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const conditionShort: Record<InventoryCondition, string> = {
  Mint: 'M',
  'Near Mint': 'NM',
  'Lightly Played': 'LP',
  'Moderately Played': 'MP',
  'Heavily Played': 'HP',
  Damaged: 'DMG',
};

type InventoryViewFilter = 'all' | 'lowStock' | 'highValue' | 'noPrice' | 'stockOut';

const inventoryViewFilters: {
  key: InventoryViewFilter;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'all', label: 'All stock', icon: 'file-tray-full-outline' },
  { key: 'lowStock', label: 'Low stock', icon: 'alert-circle-outline' },
  { key: 'highValue', label: 'High value', icon: 'trending-up-outline' },
  { key: 'noPrice', label: 'No price', icon: 'pricetag-outline' },
  { key: 'stockOut', label: 'Stock out', icon: 'remove-circle-outline' },
];

const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? `£${value.toFixed(2)}` : '--';

const getPreferredPrice = (card: InventoryCardSnapshot) =>
  card.ebay_price ?? card.tcg_price ?? card.cardmarket_price ?? null;

type InventoryDraft = {
  card: InventoryCardSnapshot;
  quantities: Record<InventoryCondition, number>;
  expanded: boolean;
};

type SaleCartLine = {
  item: InventoryItem;
  quantity: number;
};

const createQuantities = (defaultCondition: InventoryCondition = 'Near Mint') => {
  const quantities = Object.fromEntries(
    INVENTORY_CONDITIONS.map((condition) => [condition, 0])
  ) as Record<InventoryCondition, number>;
  quantities[defaultCondition] = 1;
  return quantities;
};

const toCardSnapshot = (row: any, snapshot?: any): InventoryCardSnapshot => {
  const raw = row.raw_data ?? {};
  return {
    id: row.id,
    name: row.name,
    number: row.number ?? null,
    set_id: row.set_id ?? null,
    set_name: raw?.set?.name ?? row.set_id ?? null,
    rarity: row.rarity ?? raw?.rarity ?? null,
    image_small: row.image_small ?? raw?.images?.small ?? null,
    image_large: row.image_large ?? raw?.images?.large ?? null,
    tcg_price: snapshot?.tcg_mid ?? getPriceFromPokemonCard(raw),
    ebay_price: snapshot?.ebay_average ?? null,
    cardmarket_price: snapshot?.cardmarket_trend ?? null,
  };
};

export default function InventoryScreen() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const columns = width >= 800 ? 3 : 2;
  const itemWidth = (width - 32 - (columns - 1) * 10) / columns;

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InventoryCardSnapshot[]>([]);
  const [searching, setSearching] = useState(false);
  const [drafts, setDrafts] = useState<InventoryDraft[]>([]);
  const [filterCondition, setFilterCondition] = useState<InventoryCondition | 'All'>('All');
  const [inventoryViewFilter, setInventoryViewFilter] = useState<InventoryViewFilter>('all');
  const [setFilter, setSetFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [saleCart, setSaleCart] = useState<SaleCartLine[]>([]);
  const [salePrice, setSalePrice] = useState('');
  const [stockScanMode, setStockScanMode] = useState<'add' | 'remove'>('add');
  const [stockOutCandidates, setStockOutCandidates] = useState<InventoryItem[]>([]);
  const [stockOutContext, setStockOutContext] = useState<'inventory' | 'sale'>('inventory');
  const [stockOutPickerOpen, setStockOutPickerOpen] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async (nextItems: InventoryItem[]) => {
    setItems(nextItems);
    await saveInventoryItems(nextItems);
  }, []);

  const load = useCallback(async () => {
    const stored = await loadInventoryItems();
    setItems(stored);
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const searchCards = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    try {
      setSearching(true);
      const { data, error } = await supabase
        .from('pokemon_cards')
        .select('id,name,number,rarity,set_id,image_small,image_large,raw_data')
        .ilike('name', `%${trimmed}%`)
        .limit(50);
      if (error) throw error;

      const ids = (data ?? []).map((row: any) => row.id);
      const snapshotMap = new Map<string, any>();
      if (ids.length) {
        const { data: snapshots } = await supabase
          .from('market_price_snapshots')
          .select('card_id,tcg_mid,ebay_average,cardmarket_trend,snapshot_date')
          .in('card_id', ids)
          .order('snapshot_date', { ascending: false });
        for (const snap of snapshots ?? []) {
          if (!snapshotMap.has(snap.card_id)) snapshotMap.set(snap.card_id, snap);
        }
      }

      setResults((data ?? []).map((row: any) => toCardSnapshot(row, snapshotMap.get(row.id))));
    } catch (error) {
      console.log('Inventory search failed', error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const onSearchChange = useCallback((text: string) => {
    setQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchCards(text), 300);
  }, [searchCards]);

  const toggleDraftCard = useCallback((card: InventoryCardSnapshot) => {
    setDrafts((prev) => {
      if (prev.some((draft) => draft.card.id === card.id)) {
        return prev.filter((draft) => draft.card.id !== card.id);
      }
      return [...prev, { card, quantities: createQuantities(), expanded: true }];
    });
  }, []);

  const toggleDraftExpanded = useCallback((cardId: string) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.card.id === cardId ? { ...draft, expanded: !draft.expanded } : draft
      )
    );
  }, []);

  const updateDraftQuantity = useCallback((cardId: string, condition: InventoryCondition, change: number) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.card.id !== cardId) return draft;
        return {
          ...draft,
          quantities: {
            ...draft.quantities,
            [condition]: Math.max(0, draft.quantities[condition] + change),
          },
        };
      })
    );
  }, []);

  const removeDraft = useCallback((cardId: string) => {
    setDrafts((prev) => prev.filter((draft) => draft.card.id !== cardId));
  }, []);

  const addStockLine = useCallback((currentItems: InventoryItem[], card: InventoryCardSnapshot, condition: InventoryCondition, quantity: number) => {
    const existing = currentItems.find((item) => item.card_id === card.id && item.condition === condition);
    const now = new Date().toISOString();
    return existing
      ? currentItems.map((item) =>
          item.id === existing.id
            ? { ...item, quantity: item.quantity + quantity, updated_at: now, card }
            : item
        )
      : [{ ...createInventoryItem(card, condition, quantity), id: `${card.id}:${condition}:${Date.now()}:${Math.random()}` }, ...currentItems];
  }, []);

  const addAllDrafts = useCallback(async () => {
    const totalQuantity = drafts.reduce(
      (sum, draft) => sum + INVENTORY_CONDITIONS.reduce((inner, condition) => inner + draft.quantities[condition], 0),
      0
    );
    if (totalQuantity <= 0) {
      Alert.alert('No quantities selected', 'Add at least one condition quantity before adding to inventory.');
      return;
    }

    let next = items;
    for (const draft of drafts) {
      for (const condition of INVENTORY_CONDITIONS) {
        const quantity = draft.quantities[condition];
        if (quantity > 0) next = addStockLine(next, draft.card, condition, quantity);
      }
    }
    await persist(next);
    setQuery('');
    setResults([]);
    setDrafts([]);
  }, [addStockLine, drafts, items, persist]);

  const updateQuantity = useCallback(async (id: string, change: number) => {
    const next = items
      .map((item) =>
        item.id === id
          ? { ...item, quantity: Math.max(0, item.quantity + change), updated_at: new Date().toISOString() }
          : item
      )
      .filter((item) => item.quantity > 0);
    await persist(next);
  }, [items, persist]);

  const updateAskingPrice = useCallback(async (id: string, value: string) => {
    const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
    const next = items.map((item) =>
      item.id === id
        ? { ...item, asking_price: Number.isFinite(parsed) ? parsed : null, updated_at: new Date().toISOString() }
        : item
    );
    await persist(next);
  }, [items, persist]);

  const identifyScannedCard = useCallback(async (base64Image: string) => {
    const response = await fetch(`${PRICE_API_URL}/api/cardsight/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image }),
    });
    return response.json().catch(() => null);
  }, []);

  const findStockOutCandidates = useCallback((parsed: any) => {
    const name = String(parsed?.name ?? parsed?.card?.name ?? '').trim().toLowerCase();
    const setName = String(parsed?.set ?? parsed?.card?.set ?? parsed?.card?.setName ?? '').trim().toLowerCase();
    const number = String(parsed?.number ?? parsed?.card?.number ?? '').trim().toLowerCase();
    const cleanNumber = number.replace(/^0+/, '').replace(/[^a-z0-9]/g, '');

    return items
      .map((item) => {
        let score = 0;
        const itemName = item.card.name.toLowerCase();
        const itemSet = `${item.card.set_name ?? ''} ${item.card.set_id ?? ''}`.toLowerCase();
        const itemNumber = String(item.card.number ?? '').toLowerCase();
        const cleanItemNumber = itemNumber.replace(/^0+/, '').replace(/[^a-z0-9]/g, '');

        if (name && itemName === name) score += 80;
        else if (name && (itemName.includes(name) || name.includes(itemName))) score += 58;

        if (cleanNumber && cleanItemNumber && cleanNumber === cleanItemNumber) score += 55;
        if (setName && itemSet.includes(setName)) score += 35;

        return { item, score };
      })
      .filter((entry) => entry.score >= 55)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
  }, [items]);

  const openStockOutPicker = useCallback((candidates: InventoryItem[], context: 'inventory' | 'sale') => {
    setStockOutCandidates(candidates);
    setStockOutContext(context);
    setStockOutPickerOpen(true);
  }, []);

  const scanToInventory = useCallback(() => {
    scanStore.setCallback(async (base64Image: string) => {
      try {
        const parsed = await identifyScannedCard(base64Image);
        const name = parsed?.name ?? parsed?.card?.name;
        if (!name) {
          Alert.alert('Could not identify card', 'Try searching manually or scan again.');
          return;
        }

        if (stockScanMode === 'remove') {
          const candidates = findStockOutCandidates(parsed);
          if (!candidates.length) {
            Alert.alert('Not found in inventory', 'This scan did not match any current stock rows.');
            return;
          }
          openStockOutPicker(candidates, 'inventory');
          return;
        }

        setQuery(String(name));
        await searchCards(String(name));
      } catch (error) {
        console.log('Inventory scan failed', error);
        Alert.alert('Scan failed', 'Try searching manually for now.');
      }
    });
    router.push({ pathname: '/scan', params: { mode: 'inventory' } });
  }, [findStockOutCandidates, identifyScannedCard, openStockOutPicker, searchCards, stockScanMode]);

  const filteredItems = useMemo(() => {
    const min = Number.parseFloat(minPrice);
    const max = Number.parseFloat(maxPrice);
    return items.filter((item) => {
      const preferredPrice = getPreferredPrice(item.card);
      if (inventoryViewFilter === 'lowStock' && item.quantity > 2) return false;
      if (inventoryViewFilter === 'highValue' && (preferredPrice ?? 0) < 25) return false;
      if (inventoryViewFilter === 'noPrice' && preferredPrice != null) return false;
      if (inventoryViewFilter === 'stockOut' && item.quantity > 0) return false;
      if (filterCondition !== 'All' && item.condition !== filterCondition) return false;
      if (setFilter.trim()) {
        const haystack = `${item.card.set_name ?? ''} ${item.card.set_id ?? ''}`.toLowerCase();
        if (!haystack.includes(setFilter.trim().toLowerCase())) return false;
      }
      const price = preferredPrice ?? 0;
      if (Number.isFinite(min) && price < min) return false;
      if (Number.isFinite(max) && price > max) return false;
      return true;
    });
  }, [filterCondition, inventoryViewFilter, items, maxPrice, minPrice, setFilter]);

  const totalStock = items.reduce((sum, item) => sum + item.quantity, 0);
  const inventoryValue = items.reduce((sum, item) => sum + (getPreferredPrice(item.card) ?? 0) * item.quantity, 0);
  const saleEstimatedValue = saleCart.reduce(
    (sum, line) => sum + (getPreferredPrice(line.item.card) ?? 0) * line.quantity,
    0
  );
  const salePreviewImages = saleCart
    .flatMap((line) => Array.from({ length: line.quantity }, () => line.item.card.image_small))
    .filter(Boolean)
    .slice(0, 5) as string[];

  const startSale = useCallback(() => {
    setSaleCart([]);
    setSalePrice('');
    setSaleOpen(true);
  }, []);

  const addItemToSale = useCallback((item: InventoryItem) => {
    setSaleCart((prev) => {
      const existing = prev.find((line) => line.item.id === item.id);
      if (existing) {
        return prev.map((line) =>
          line.item.id === item.id
            ? { ...line, quantity: Math.min(item.quantity, line.quantity + 1) }
            : line
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
    setSaleOpen(true);
  }, []);

  const updateSaleQuantity = useCallback((itemId: string, change: number) => {
    setSaleCart((prev) =>
      prev
        .map((line) =>
          line.item.id === itemId
            ? { ...line, quantity: Math.max(0, Math.min(line.item.quantity, line.quantity + change)) }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  }, []);

  const chooseStockOutItem = useCallback(async (item: InventoryItem) => {
    setStockOutPickerOpen(false);
    if (stockOutContext === 'sale') {
      addItemToSale(item);
      setSaleOpen(true);
      return;
    }
    await updateQuantity(item.id, -1);
    Alert.alert('Stock removed', `${item.card.name} (${conditionShort[item.condition]}) was removed from inventory.`);
  }, [addItemToSale, stockOutContext, updateQuantity]);

  const scanToSale = useCallback(() => {
    setSaleOpen(false);
    scanStore.setCallback(async (base64Image: string) => {
      try {
        const parsed = await identifyScannedCard(base64Image);
        const candidates = findStockOutCandidates(parsed);
        if (!candidates.length) {
          setSaleOpen(true);
          Alert.alert('Not found in inventory', 'This card is not in your current stock. Add it to inventory first if needed.');
          return;
        }
        if (candidates.length === 1) {
          addItemToSale(candidates[0]);
          return;
        }
        openStockOutPicker(candidates, 'sale');
      } catch (error) {
        console.log('Sale scan failed', error);
        setSaleOpen(true);
        Alert.alert('Scan failed', 'Try adding the card from inventory manually.');
      }
    });
    router.push({ pathname: '/scan', params: { mode: 'inventory' } });
  }, [addItemToSale, findStockOutCandidates, identifyScannedCard, openStockOutPicker]);

  const completeSale = useCallback(async () => {
    if (!saleCart.length) {
      Alert.alert('No cards added', 'Add at least one inventory item before completing a sale.');
      return;
    }

    const soldPrice = Number.parseFloat(salePrice.replace(/[^0-9.]/g, ''));
    const now = new Date().toISOString();
    const nextItems = items
      .map((item) => {
        const line = saleCart.find((saleLine) => saleLine.item.id === item.id);
        if (!line) return item;
        return {
          ...item,
          quantity: Math.max(0, item.quantity - line.quantity),
          updated_at: now,
        };
      })
      .filter((item) => item.quantity > 0);

    await addInventorySale({
      id: `sale:${Date.now()}`,
      sold_price: Number.isFinite(soldPrice) ? soldPrice : null,
      estimated_value: saleEstimatedValue,
      created_at: now,
      lines: saleCart.map((line) => ({
        inventory_item_id: line.item.id,
        card_id: line.item.card_id,
        card_name: line.item.card.name,
        set_name: line.item.card.set_name,
        condition: line.item.condition,
        quantity: line.quantity,
        estimated_unit_price: getPreferredPrice(line.item.card),
        image_small: line.item.card.image_small,
      })),
    });
    await persist(nextItems);
    setSaleOpen(false);
    setSaleCart([]);
    setSalePrice('');
    Alert.alert('Sale completed', 'Inventory has been updated and the sale report has been saved.');
  }, [items, persist, saleCart, saleEstimatedValue, salePrice]);

  const renderInventoryItem = ({ item }: { item: InventoryItem }) => {
    const price = getPreferredPrice(item.card);
    const saleLine = saleCart.find((line) => line.item.id === item.id);
    return (
      <View style={{ width: itemWidth, backgroundColor: theme.colors.card, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 10, ...cardShadow }}>
        {item.card.image_small ? (
          <Image source={{ uri: item.card.image_small }} style={{ width: '100%', aspectRatio: 0.72, borderRadius: 10 }} resizeMode="contain" />
        ) : (
          <View style={{ width: '100%', aspectRatio: 0.72, borderRadius: 10, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="albums-outline" size={28} color={theme.colors.primary} />
          </View>
        )}
        <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13, marginTop: 8 }}>{item.card.name}</Text>
        <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>{item.card.set_name ?? item.card.set_id}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13 }}>{money(price)}</Text>
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 10 }}>{conditionShort[item.condition]}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 }}>
          <TouchableOpacity onPress={() => updateQuantity(item.id, -1)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="remove" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>{item.quantity}</Text>
          <TouchableOpacity onPress={() => updateQuantity(item.id, 1)} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <TextInput
          placeholder="Ask £"
          placeholderTextColor={theme.colors.textSoft}
          keyboardType="decimal-pad"
          defaultValue={item.asking_price != null ? String(item.asking_price) : ''}
          onEndEditing={(event) => updateAskingPrice(item.id, event.nativeEvent.text)}
          style={{ marginTop: 8, backgroundColor: theme.colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, color: theme.colors.text, fontWeight: '800', borderWidth: 1, borderColor: theme.colors.border }}
        />
        <TouchableOpacity
          onPress={() => addItemToSale(item)}
          style={{
            marginTop: 8,
            backgroundColor: saleLine ? `${theme.colors.primary}18` : theme.colors.primary,
            borderRadius: 10,
            paddingVertical: 9,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: saleLine ? theme.colors.primary : theme.colors.primary,
          }}
        >
          <Text style={{ color: saleLine ? theme.colors.primary : '#FFFFFF', fontWeight: '900', fontSize: 12 }}>
            {saleLine ? `In sale x${saleLine.quantity}` : 'Add to sale'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={['top']}>
      <FeatureTipGate
        tipKey="inventory-screen-v1"
        title="Inventory"
        subtitle="Manage vendor stock separately from your personal binders."
        items={[
          { icon: 'search-outline', title: 'Search or scan', body: 'Add cards quickly from text search or camera scan.' },
          { icon: 'layers-outline', title: 'Condition slots', body: 'LP Charizard and NM Charizard are separate stock rows.' },
          { icon: 'pricetag-outline', title: 'Live price glance', body: 'See latest prices and stock counts without opening details.' },
        ]}
      />

      <View style={{ paddingHorizontal: 16, paddingTop: 8, flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <View>
            <Text style={{ color: theme.colors.text, fontSize: 30, fontWeight: '900' }}>Inventory</Text>
            <Text style={{ color: theme.colors.textSoft, marginTop: 2 }}>{totalStock} in stock · {money(inventoryValue)} value</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={startSale} style={{ backgroundColor: theme.colors.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: theme.colors.border }}>
              <Ionicons name="receipt-outline" size={18} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Sale</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={scanToInventory} style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Scan</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ backgroundColor: theme.colors.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: 14, padding: 4, marginBottom: 10, borderWidth: 1, borderColor: theme.colors.border }}>
            {(['add', 'remove'] as const).map((mode) => {
              const active = stockScanMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setStockScanMode(mode)}
                  style={{
                    flex: 1,
                    borderRadius: 11,
                    paddingVertical: 9,
                    alignItems: 'center',
                    backgroundColor: active ? theme.colors.primary : 'transparent',
                  }}
                >
                  <Text style={{ color: active ? '#FFFFFF' : theme.colors.textSoft, fontWeight: '900', fontSize: 12 }}>
                    {mode === 'add' ? 'Stock In' : 'Stock Out'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.border }}>
            <Ionicons name="search-outline" size={18} color={theme.colors.textSoft} />
            <TextInput value={query} onChangeText={onSearchChange} placeholder={stockScanMode === 'add' ? 'Search card to add...' : 'Search current stock...'} placeholderTextColor={theme.colors.textSoft} style={{ flex: 1, color: theme.colors.text, paddingVertical: 11, fontWeight: '800' }} />
            {searching && <ActivityIndicator color={theme.colors.primary} />}
          </View>

          {results.length > 0 && (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 220, marginTop: 10 }}
              renderItem={({ item }) => {
                const selected = drafts.some((draft) => draft.card.id === item.id);
                return (
                  <TouchableOpacity onPress={() => toggleDraftCard(item)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                    {item.image_small ? <Image source={{ uri: item.image_small }} style={{ width: 42, height: 58 }} resizeMode="contain" /> : <View style={{ width: 42, height: 58 }} />}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900' }}>{item.name}</Text>
                      <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 12 }}>{item.set_name} · #{item.number ?? '--'} · {money(getPreferredPrice(item))}</Text>
                    </View>
                    <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: selected ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: selected ? theme.colors.primary : theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={selected ? 'checkmark' : 'add'} size={18} color={selected ? '#FFFFFF' : theme.colors.textSoft} />
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>

        {drafts.length > 0 && (
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12, ...cardShadow }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>Review stock</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>{drafts.length} card{drafts.length !== 1 ? 's' : ''} selected</Text>
              </View>
              <TouchableOpacity onPress={addAllDrafts} style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>Add all</Text>
              </TouchableOpacity>
            </View>

            {drafts.map((draft) => {
              const draftTotal = INVENTORY_CONDITIONS.reduce((sum, condition) => sum + draft.quantities[condition], 0);
              return (
                <View key={draft.card.id} style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 10, marginTop: 8 }}>
                  <TouchableOpacity onPress={() => toggleDraftExpanded(draft.card.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {draft.card.image_small ? <Image source={{ uri: draft.card.image_small }} style={{ width: 40, height: 56 }} resizeMode="contain" /> : <View style={{ width: 40, height: 56 }} />}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900' }}>{draft.card.name}</Text>
                      <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 12 }}>{draft.card.set_name} · {draftTotal} total</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeDraft(draft.card.id)} style={{ padding: 8 }}>
                      <Ionicons name="close" size={18} color={theme.colors.textSoft} />
                    </TouchableOpacity>
                    <Ionicons name={draft.expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSoft} />
                  </TouchableOpacity>

                  {draft.expanded && (
                    <View style={{ marginTop: 10, gap: 7 }}>
                      {INVENTORY_CONDITIONS.map((condition) => (
                        <View key={condition} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 10 }}>
                          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12 }}>{condition}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity onPress={() => updateDraftQuantity(draft.card.id, condition, -1)} style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
                              <Ionicons name="remove" size={16} color={theme.colors.text} />
                            </TouchableOpacity>
                            <Text style={{ color: theme.colors.text, fontWeight: '900', minWidth: 20, textAlign: 'center' }}>{draft.quantities[condition]}</Text>
                            <TouchableOpacity onPress={() => updateDraftQuantity(draft.card.id, condition, 1)} style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="add" size={16} color="#FFFFFF" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
        <View style={{ marginBottom: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {inventoryViewFilters.map((filter) => {
              const active = inventoryViewFilter === filter.key;
              return (
                <TouchableOpacity
                  key={filter.key}
                  onPress={() => {
                    setInventoryViewFilter(filter.key);
                    if (filter.key === 'stockOut') setStockScanMode('remove');
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: active ? '#F6F1FF' : theme.colors.card,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <Ionicons
                    name={filter.icon}
                    size={15}
                    color={active ? theme.colors.primary : theme.colors.textSoft}
                  />
                  <Text
                    style={{
                      color: active ? theme.colors.primary : theme.colors.textSoft,
                      fontWeight: '900',
                      fontSize: 11,
                    }}
                  >
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(['All', ...INVENTORY_CONDITIONS] as const).map((condition) => (
              <TouchableOpacity key={condition} onPress={() => setFilterCondition(condition)} style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: filterCondition === condition ? theme.colors.primary : theme.colors.card, borderWidth: 1, borderColor: filterCondition === condition ? theme.colors.primary : theme.colors.border }}>
                <Text style={{ color: filterCondition === condition ? '#FFFFFF' : theme.colors.textSoft, fontWeight: '900', fontSize: 11 }}>{condition === 'All' ? 'All' : conditionShort[condition]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput value={setFilter} onChangeText={setSetFilter} placeholder="Set" placeholderTextColor={theme.colors.textSoft} style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, color: theme.colors.text }} />
            <TextInput value={minPrice} onChangeText={setMinPrice} placeholder="Min £" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textSoft} style={{ width: 78, backgroundColor: theme.colors.card, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, color: theme.colors.text }} />
            <TextInput value={maxPrice} onChangeText={setMaxPrice} placeholder="Max £" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textSoft} style={{ width: 78, backgroundColor: theme.colors.card, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, color: theme.colors.text }} />
          </View>
        </View>

        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={renderInventoryItem}
          numColumns={columns}
          key={columns}
          columnWrapperStyle={columns > 1 ? { gap: 10 } : undefined}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 55, paddingHorizontal: 24 }}>
              <Ionicons name="file-tray-full-outline" size={44} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18, marginTop: 12 }}>No inventory yet</Text>
              <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>Search or scan a card, choose its condition, then add it as stock.</Text>
            </View>
          }
        />
      </View>

      <Modal visible={stockOutPickerOpen} transparent animationType="fade" onRequestClose={() => setStockOutPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(10, 8, 25, 0.34)', justifyContent: 'center', padding: 18 }}>
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: theme.colors.border, maxHeight: '78%', ...cardShadow }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View>
                <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Choose stock slot</Text>
                <Text style={{ color: theme.colors.textSoft, marginTop: 3, fontWeight: '700' }}>
                  Pick the condition to {stockOutContext === 'sale' ? 'add to this sale' : 'remove from inventory'}.
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setStockOutPickerOpen(false); if (stockOutContext === 'sale') setSaleOpen(true); }} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {stockOutCandidates.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => chooseStockOutItem(item)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.border }}
                >
                  {item.card.image_small ? (
                    <Image source={{ uri: item.card.image_small }} style={{ width: 44, height: 62, borderRadius: 5 }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: 44, height: 62, borderRadius: 5, backgroundColor: theme.colors.surface }} />
                  )}
                  <View style={{ flex: 1, marginLeft: 11 }}>
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900' }}>{item.card.name}</Text>
                    <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>{item.card.set_name ?? item.card.set_id} · #{item.card.number ?? '--'}</Text>
                    <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 12, marginTop: 4 }}>{conditionShort[item.condition]} · {item.quantity} in stock · {money(getPreferredPrice(item.card))}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textSoft} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={saleOpen} transparent animationType="fade" onRequestClose={() => setSaleOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(10, 8, 25, 0.34)', justifyContent: 'center', padding: 18 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 26, padding: 18, borderWidth: 1, borderColor: '#E8E1FF', ...cardShadow }}>
            <TouchableOpacity
              onPress={() => setSaleOpen(false)}
              style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: '#F4F1FC', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={22} color={theme.colors.primary} />
            </TouchableOpacity>

            <View style={{ alignItems: 'center', paddingTop: 10 }}>
              <View style={{ width: 140, height: 94, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
                <View style={{ position: 'absolute', top: 0, flexDirection: 'row', gap: 3 }}>
                  {salePreviewImages.length
                    ? salePreviewImages.slice(0, 3).map((uri, index) => (
                        <Image
                          key={`${uri}:${index}`}
                          source={{ uri }}
                          style={{
                            width: 42,
                            height: 58,
                            borderRadius: 4,
                            borderWidth: 1,
                            borderColor: '#D9CCFF',
                            transform: [{ rotate: `${(index - 1) * 8}deg` }],
                          }}
                          resizeMode="cover"
                        />
                      ))
                    : [
                        require('../../assets/binders/charizard.png'),
                        require('../../assets/binders/pikachu.png'),
                        require('../../assets/binders/blastoise.png'),
                      ].map((source, index) => (
                        <Image
                          key={`sale-placeholder:${index}`}
                          source={source}
                          style={{
                            width: 42,
                            height: 58,
                            borderRadius: 4,
                            borderWidth: 1,
                            borderColor: '#D9CCFF',
                            transform: [{ rotate: `${(index - 1) * 8}deg` }],
                          }}
                          resizeMode="cover"
                        />
                      ))}
                </View>
                <View style={{ width: 104, height: 48, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.primary, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
                  <Image source={require('../../assets/images/icon.png')} style={{ width: 34, height: 34 }} resizeMode="contain" />
                </View>
                <Ionicons name="sparkles" size={18} color={theme.colors.primary} style={{ position: 'absolute', left: 0, top: 30 }} />
                <Ionicons name="sparkles" size={18} color={theme.colors.primary} style={{ position: 'absolute', right: 0, top: 36 }} />
              </View>

              <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '900', textAlign: 'center' }}>Great Sale building!</Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 14, fontWeight: '700', marginTop: 3 }}>Keep scanning to add more items.</Text>
            </View>

            <View style={{ backgroundColor: '#F9F7FF', borderRadius: 16, borderWidth: 1, borderColor: '#E6DEFF', padding: 14, marginTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 86, borderRightWidth: 1, borderRightColor: '#E2DAFA', paddingRight: 12 }}>
                  <Text style={{ color: theme.colors.primary, fontSize: 9, fontWeight: '900' }}>ITEMS SCANNED</Text>
                  <Text style={{ color: theme.colors.primary, fontSize: 42, fontWeight: '900', marginTop: 2 }}>{saleCart.reduce((sum, line) => sum + line.quantity, 0)}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingLeft: 12 }}>
                  {salePreviewImages.length ? salePreviewImages.map((uri, index) => (
                    <Image key={`${uri}:preview:${index}`} source={{ uri }} style={{ width: 48, height: 66, borderRadius: 5, backgroundColor: '#FFFFFF' }} resizeMode="cover" />
                  )) : (
                    <View style={{ height: 66, justifyContent: 'center' }}>
                      <Text style={{ color: theme.colors.textSoft, fontWeight: '800' }}>Add inventory cards to begin</Text>
                    </View>
                  )}
                </ScrollView>
              </View>

              <View style={{ height: 1, backgroundColor: '#E2DAFA', marginVertical: 13 }} />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="pricetag-outline" size={30} color={theme.colors.primary} />
                  <View>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 9, fontWeight: '900' }}>ESTIMATED VALUE</Text>
                    <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '900' }}>{money(saleEstimatedValue)}</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: '#EAF9EF', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: '#1C9B4C', fontWeight: '900', fontSize: 12 }}>+18%</Text>
                  <Text style={{ color: '#1C9B4C', fontWeight: '800', fontSize: 10 }}>Great Sale bonus</Text>
                </View>
              </View>
            </View>

            {saleCart.length > 0 && (
              <View style={{ marginTop: 12, maxHeight: 150 }}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {saleCart.map((line) => (
                    <View key={line.item.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#EFEAFB' }}>
                      <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.text, fontWeight: '900' }}>{line.item.card.name}</Text>
                      <Text style={{ color: theme.colors.textSoft, fontWeight: '800', marginRight: 8 }}>{conditionShort[line.item.condition]}</Text>
                      <TouchableOpacity onPress={() => updateSaleQuantity(line.item.id, -1)} style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: '#F4F1FC', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="remove" size={15} color={theme.colors.text} />
                      </TouchableOpacity>
                      <Text style={{ width: 28, textAlign: 'center', color: theme.colors.text, fontWeight: '900' }}>{line.quantity}</Text>
                      <TouchableOpacity onPress={() => updateSaleQuantity(line.item.id, 1)} style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="add" size={15} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <TextInput
              value={salePrice}
              onChangeText={setSalePrice}
              placeholder="Actual sold price"
              placeholderTextColor={theme.colors.textSoft}
              keyboardType="decimal-pad"
              style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E3DAFF', backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontWeight: '900' }}
            />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <TouchableOpacity onPress={scanToSale} style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#D8CCFF', paddingVertical: 13, alignItems: 'center' }}>
                <Ionicons name="scan-outline" size={22} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.primary, fontWeight: '900', marginTop: 4 }}>Scan More</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '700' }}>Keep adding items</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={completeSale} style={{ flex: 1, borderRadius: 14, backgroundColor: theme.colors.primary, paddingVertical: 13, alignItems: 'center', shadowColor: theme.colors.primary, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
                <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontWeight: '900', marginTop: 3 }}>Complete Sale</Text>
                <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 10, fontWeight: '700' }}>Remove sold stock</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '800', textAlign: 'center', marginTop: 16 }}>
              The more you scan, the bigger your sale report.
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

