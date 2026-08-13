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
  InventoryMovementDraft,
  InventorySaleTransaction,
  PRODUCT_INVENTORY_CONDITIONS,
  SellerBinderDelta,
  commitSellerInventoryBatch,
  createInventoryItem,
  loadInventoryItems,
} from '../../lib/inventory';
import { getPriceFromPokemonCard } from '../../lib/pricing';
import { scanStore } from '../../lib/scanStore';
import { supabase } from '../../lib/supabase';
import { PRICE_API_URL } from '../../lib/config';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import {
  PRODUCT_LOOKUP_OPTIONS,
  listMarketProducts,
  productLookupLabel,
  productToInventorySnapshot,
  refreshMarketProductPrice,
  searchMarketProducts,
} from '../../lib/productSearch';
import type { ProductLookupType } from '../../lib/productSearch';
import { isSellerAtomicWritesDisabledError } from '../../lib/sellerAtomicWrites';
import { getSellerStockOutRoute } from '../../lib/sellerStockOutRouting';

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
  Sealed: 'SEA',
};

function mergeSellerBinderDeltas(deltas: SellerBinderDelta[]) {
  const merged = new Map<string, SellerBinderDelta>();
  for (const delta of deltas) {
    const key = `${delta.binder_id}:${delta.card_id}`;
    const current = merged.get(key);
    merged.set(key, current
      ? { ...current, quantity_delta: current.quantity_delta + delta.quantity_delta }
      : delta);
  }
  return [...merged.values()].filter((delta) => delta.quantity_delta !== 0);
}

type InventoryLookupType = 'raw_card' | ProductLookupType;

const INVENTORY_LOOKUP_OPTIONS: {
  key: InventoryLookupType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'raw_card', label: 'Raw Card', icon: 'albums-outline' },
  ...PRODUCT_LOOKUP_OPTIONS
    .filter((option) => option.key !== 'sealed_product')
    .map((option) => ({
      key: option.key,
      label: option.label,
      icon: option.icon as keyof typeof Ionicons.glyphMap,
    })),
];

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
  card.is_product
    ? card.tcg_price ?? card.ebay_price ?? card.cardmarket_price ?? null
    : card.ebay_price ?? card.tcg_price ?? card.cardmarket_price ?? null;

const getDraftConditions = (card: InventoryCardSnapshot) =>
  card.is_product ? PRODUCT_INVENTORY_CONDITIONS : INVENTORY_CONDITIONS;

const INVENTORY_FILTER_CONDITIONS = [...INVENTORY_CONDITIONS, ...PRODUCT_INVENTORY_CONDITIONS];

type InventoryDraft = {
  card: InventoryCardSnapshot;
  quantities: Record<InventoryCondition, number>;
  askingPrice: string;
  expanded: boolean;
};

type SaleCartLine = {
  item: InventoryItem;
  quantity: number;
};

const showSellerWriteFailure = (error: unknown, fallbackTitle: string, fallbackMessage: string) => {
  if (isSellerAtomicWritesDisabledError(error)) {
    Alert.alert(
      'Inventory is read-only for now',
      'This bridge release is not accepting seller changes yet. Your inventory was not changed.'
    );
    return;
  }
  Alert.alert(fallbackTitle, fallbackMessage);
};

const createQuantities = (defaultCondition: InventoryCondition = 'Near Mint') => {
  const quantities = Object.fromEntries(
    INVENTORY_CONDITIONS.map((condition) => [condition, 0])
  ) as Record<InventoryCondition, number>;
  quantities[defaultCondition] = 1;
  return quantities;
};

const getProductConfidence = (card: InventoryCardSnapshot) => {
  const count = card.product_price_count ?? 0;
  if (count >= 8) return { label: 'High confidence', color: '#16A34A' };
  if (count >= 3) return { label: 'Medium confidence', color: '#D97706' };
  if (card.is_product) return { label: 'Low confidence', color: '#DC2626' };
  return null;
};

const getProductResultSubtitle = (card: InventoryCardSnapshot) => {
  if (!card.is_product) {
    return `${card.set_name} · #${card.number ?? '--'} · ${money(getPreferredPrice(card))}`;
  }

  const typeLabel = card.product_type
    ? productLookupLabel(card.product_type as ProductLookupType)
    : 'Product';
  const setLabel = card.set_name && card.set_name !== typeLabel ? card.set_name : null;
  return `${typeLabel}${setLabel ? ` · ${setLabel}` : ''} · recommended ${money(getPreferredPrice(card))}`;
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
  const [lookupType, setLookupType] = useState<InventoryLookupType>('raw_card');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InventoryCardSnapshot[]>([]);
  const [searching, setSearching] = useState(false);
  const [drafts, setDrafts] = useState<InventoryDraft[]>([]);
  const [filterCondition, setFilterCondition] = useState<InventoryCondition | 'All'>('All');
  const [inventoryViewFilter, setInventoryViewFilter] = useState<InventoryViewFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const [selectedProduct, setSelectedProduct] = useState<InventoryCardSnapshot | null>(null);
  const [productQuantity, setProductQuantity] = useState('1');
  const [productAskingPrice, setProductAskingPrice] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitInventoryChange = useCallback(async (input: {
    nextItems: InventoryItem[];
    movements?: InventoryMovementDraft[];
    sale?: InventorySaleTransaction | null;
    binderDeltas?: SellerBinderDelta[];
  }) => {
    if (
      input.sale == null
      && input.movements?.some((movement) => getSellerStockOutRoute(movement.reason) === 'sale-cart')
    ) {
      throw new Error('Sold stock-out must be completed through the sale cart.');
    }

    const committed = await commitSellerInventoryBatch({
      expectedItems: items,
      items: input.nextItems,
      movements: input.movements,
      sale: input.sale,
      binderDeltas: mergeSellerBinderDeltas(input.binderDeltas ?? []),
    });
    setItems(committed.items);
    return committed;
  }, [items]);

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
      const data = await searchLocalPokemonCards<any>(trimmed, {
        limit: 60,
        select: 'id,name,number,rarity,set_id,image_small,image_large,raw_data',
      });

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

  const searchProduct = useCallback(async (text: string, type: ProductLookupType) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    try {
      setSearching(true);
      const catalogResults = await searchMarketProducts(trimmed, type, 12);
      if (catalogResults.length) {
        setResults(catalogResults.map(productToInventorySnapshot));
        const needsPrice = catalogResults[0].latest_price?.average == null;
        if (needsPrice) {
          try {
            const price = await refreshMarketProductPrice(catalogResults[0]);
            setResults([
              productToInventorySnapshot({ ...catalogResults[0], latest_price: price }),
              ...catalogResults.slice(1).map(productToInventorySnapshot),
            ]);
          } catch (error) {
            console.log('Inventory product price refresh failed', error);
          }
        }
        return;
      }

      setResults([]);
    } catch (error) {
      console.log('Inventory product search failed', error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const loadProductCatalog = useCallback(async (type: ProductLookupType) => {
    try {
      setSearching(true);
      const products = await listMarketProducts(type, 40);
      setResults(products.map(productToInventorySnapshot));
    } catch (error) {
      console.log('Inventory product catalog failed', error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const onSearchChange = useCallback((text: string) => {
    setQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (lookupType === 'raw_card') {
        searchCards(text);
      } else {
        if (text.trim().length < 2) {
          loadProductCatalog(lookupType);
        } else {
          searchProduct(text, lookupType);
        }
      }
    }, lookupType === 'raw_card' ? 300 : 450);
  }, [loadProductCatalog, lookupType, searchCards, searchProduct]);

  const changeLookupType = useCallback((nextType: InventoryLookupType) => {
    setLookupType(nextType);
    setResults([]);
    setDrafts([]);
    if (nextType !== 'raw_card' && !query.trim()) {
      loadProductCatalog(nextType);
      return;
    }
    if (query.trim()) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        if (nextType === 'raw_card') {
          searchCards(query);
        } else {
          searchProduct(query, nextType);
        }
      }, 120);
    }
  }, [loadProductCatalog, query, searchCards, searchProduct]);

  const toggleDraftCard = useCallback((card: InventoryCardSnapshot) => {
    setDrafts((prev) => {
      if (prev.some((draft) => draft.card.id === card.id)) {
        return prev.filter((draft) => draft.card.id !== card.id);
      }
      return [...prev, { card, quantities: createQuantities(card.is_product ? 'Sealed' : 'Near Mint'), askingPrice: '', expanded: true }];
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
            [condition]: Math.max(0, (draft.quantities[condition] ?? 0) + change),
          },
        };
      })
    );
  }, []);

  const updateDraftAskingPrice = useCallback((cardId: string, value: string) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.card.id === cardId
          ? { ...draft, askingPrice: value.replace(/[^0-9.]/g, '').slice(0, 9) }
          : draft
      )
    );
  }, []);

  const removeDraft = useCallback((cardId: string) => {
    setDrafts((prev) => prev.filter((draft) => draft.card.id !== cardId));
  }, []);

  const openProductStockModal = useCallback((card: InventoryCardSnapshot) => {
    setSelectedProduct(card);
    setProductQuantity('1');
    setProductAskingPrice('');
  }, []);

  const addStockLine = useCallback((currentItems: InventoryItem[], card: InventoryCardSnapshot, condition: InventoryCondition, quantity: number, askingPrice?: number | null) => {
    const existing = currentItems.find(
      (item) =>
        item.card_id === card.id
        && item.condition === condition
        && (item.card.inventory_binder_id ?? null) === (card.inventory_binder_id ?? null)
    );
    const now = new Date().toISOString();
    return existing
      ? currentItems.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                quantity: item.quantity + quantity,
                asking_price: askingPrice ?? item.asking_price,
                updated_at: now,
                card,
              }
            : item
        )
      : [{
          ...createInventoryItem(card, condition, quantity),
          id: `${card.id}:${condition}:${Date.now()}:${Math.random()}`,
          asking_price: askingPrice ?? null,
        }, ...currentItems];
  }, []);

  const addSelectedProductToInventory = useCallback(async () => {
    if (!selectedProduct) return;

    const quantity = Math.max(1, Math.floor(Number.parseInt(productQuantity, 10) || 1));
    const parsedAskingPrice = Number.parseFloat(productAskingPrice.replace(/[^0-9.]/g, ''));
    const askingPrice = Number.isFinite(parsedAskingPrice) ? parsedAskingPrice : null;

    const next = addStockLine(items, selectedProduct, 'Sealed', quantity, askingPrice);
    const addedItem = next.find((item) => (
      item.card_id === selectedProduct.id
      && item.condition === 'Sealed'
      && (item.card.inventory_binder_id ?? null) === null
    ));
    if (!addedItem) return;

    try {
      await commitInventoryChange({
        nextItems: next,
        movements: [{
          inventory_item_id: addedItem.id,
          action_type: 'scan_in',
          card_id: selectedProduct.id,
          set_id: selectedProduct.set_id,
          card_name: selectedProduct.name,
          quantity,
          reason: askingPrice != null ? 'Added to Sell/Trade' : 'Added to Collection',
          value_at_time: getPreferredPrice(selectedProduct),
          image_small: selectedProduct.image_small,
        }],
      });
      setSelectedProduct(null);
      setProductQuantity('1');
      setProductAskingPrice('');
    } catch (error) {
      console.log('Product inventory commit failed', error);
      showSellerWriteFailure(
        error,
        'Could not add product',
        'Inventory was not changed. Check your connection and try again.'
      );
    }
  }, [addStockLine, commitInventoryChange, items, productAskingPrice, productQuantity, selectedProduct]);

  const addAllDrafts = useCallback(async () => {
    const totalQuantity = drafts.reduce(
      (sum, draft) => sum + getDraftConditions(draft.card).reduce((inner, condition) => inner + (draft.quantities[condition] ?? 0), 0),
      0
    );
    if (totalQuantity <= 0) {
      Alert.alert('No quantities selected', 'Add at least one condition quantity before adding to inventory.');
      return;
    }

    let next = items;
    const movements: InventoryMovementDraft[] = [];
    for (const draft of drafts) {
      const parsedAskingPrice = Number.parseFloat(draft.askingPrice);
      const askingPrice = Number.isFinite(parsedAskingPrice) ? parsedAskingPrice : null;
      for (const condition of getDraftConditions(draft.card)) {
        const quantity = draft.quantities[condition] ?? 0;
        if (quantity <= 0) continue;
        next = addStockLine(next, draft.card, condition, quantity, askingPrice);
        const inventoryItem = next.find((item) => (
          item.card_id === draft.card.id
          && item.condition === condition
          && (item.card.inventory_binder_id ?? null) === null
        ));
        if (!inventoryItem) continue;
        movements.push({
          inventory_item_id: inventoryItem.id,
          action_type: 'scan_in',
          card_id: draft.card.id,
          set_id: draft.card.set_id,
          card_name: draft.card.name,
          quantity,
          reason: askingPrice != null ? 'Added to Sell/Trade' : 'Added to Collection',
          value_at_time: getPreferredPrice(draft.card),
          image_small: draft.card.image_small,
        });
      }
    }
    try {
      await commitInventoryChange({ nextItems: next, movements });
      setQuery('');
      setResults([]);
      setDrafts([]);
    } catch (error) {
      console.log('Inventory stock-in batch failed', error);
      showSellerWriteFailure(
        error,
        'Could not add batch',
        'Nothing was changed. Check your connection and try again.'
      );
    }
  }, [addStockLine, commitInventoryChange, drafts, items]);

  const updateQuantity = useCallback(async (id: string, change: number) => {
    const current = items.find((item) => item.id === id);
    if (!current) return false;
    const nextQuantity = Math.max(0, current.quantity + change);
    const actualChange = nextQuantity - current.quantity;
    if (actualChange === 0) return false;
    const next = items
      .map((item) =>
        item.id === id
          ? { ...item, quantity: Math.max(0, item.quantity + change), updated_at: new Date().toISOString() }
          : item
      )
      .filter((item) => item.quantity > 0);
    const binderId = current.card.is_product || !current.set_id
      ? null
      : current.card.inventory_binder_id ?? null;
    try {
      await commitInventoryChange({
        nextItems: next,
        movements: [{
          inventory_item_id: current.id,
          action_type: actualChange > 0 ? 'scan_in' : 'scan_out',
          card_id: current.card_id,
          set_id: current.set_id,
          card_name: current.card.name,
          quantity: Math.abs(actualChange),
          reason: actualChange > 0 ? 'Added to Collection' : 'Removed from Collection',
          binder_id: binderId,
          binder_name: binderId ? current.card.inventory_binder_name ?? null : null,
          value_at_time: getPreferredPrice(current.card),
          image_small: current.card.image_small,
        }],
        binderDeltas: binderId && current.set_id ? [{
          binder_id: binderId,
          card_id: current.card_id,
          set_id: current.set_id,
          quantity_delta: actualChange,
          card_name: current.card.name,
          card_number: current.card.number,
          image_url: current.card.image_small,
          set_name: current.card.set_name,
        }] : [],
      });
      return true;
    } catch (error) {
      console.log('Inventory quantity update failed', error);
      showSellerWriteFailure(
        error,
        'Could not update quantity',
        'Inventory was not changed. Refresh and try again.'
      );
      return false;
    }
  }, [commitInventoryChange, items]);

  const updateAskingPrice = useCallback(async (id: string, value: string) => {
    const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
    const next = items.map((item) =>
      item.id === id
        ? { ...item, asking_price: Number.isFinite(parsed) ? parsed : null, updated_at: new Date().toISOString() }
        : item
    );
    try {
      await commitInventoryChange({ nextItems: next });
    } catch (error) {
      console.log('Inventory price update failed', error);
      showSellerWriteFailure(
        error,
        'Could not update price',
        'Inventory was not changed. Refresh and try again.'
      );
    }
  }, [commitInventoryChange, items]);

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
        setLookupType('raw_card');
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

  const catalogResults = useMemo(() => {
    return results;
  }, [results]);

  const totalStock = items.reduce((sum, item) => sum + item.quantity, 0);
  const inventoryValue = items.reduce((sum, item) => sum + (getPreferredPrice(item.card) ?? 0) * item.quantity, 0);
  const activeInventoryFilterCount = (inventoryViewFilter !== 'all' ? 1 : 0)
    + (filterCondition !== 'All' ? 1 : 0)
    + (setFilter.trim() ? 1 : 0)
    + (minPrice.trim() ? 1 : 0)
    + (maxPrice.trim() ? 1 : 0);
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
    const reason = stockOutContext === 'sale' ? 'Sold' : 'Removed from Collection';
    if (getSellerStockOutRoute(reason) === 'sale-cart') {
      addItemToSale(item);
      setSaleOpen(true);
      return;
    }
    const removed = await updateQuantity(item.id, -1);
    if (removed) {
      Alert.alert('Stock removed', `${item.card.name} (${conditionShort[item.condition]}) was removed from inventory.`);
    }
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

    const sale: InventorySaleTransaction = {
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
    };
    const movements: InventoryMovementDraft[] = saleCart.map((line) => {
      const binderId = line.item.card.is_product || !line.item.set_id
        ? null
        : line.item.card.inventory_binder_id ?? null;
      return {
        inventory_item_id: line.item.id,
        action_type: 'scan_out',
        card_id: line.item.card_id,
        set_id: line.item.set_id,
        card_name: line.item.card.name,
        quantity: line.quantity,
        reason: 'Sold',
        binder_id: binderId,
        binder_name: binderId ? line.item.card.inventory_binder_name ?? null : null,
        value_at_time: getPreferredPrice(line.item.card),
        image_small: line.item.card.image_small,
      };
    });
    const binderDeltas: SellerBinderDelta[] = saleCart.flatMap((line) => {
      const binderId = line.item.card.is_product
        ? null
        : line.item.card.inventory_binder_id ?? null;
      if (!binderId || !line.item.set_id) return [];
      return [{
        binder_id: binderId,
        card_id: line.item.card_id,
        set_id: line.item.set_id,
        quantity_delta: -line.quantity,
        card_name: line.item.card.name,
        card_number: line.item.card.number,
        image_url: line.item.card.image_small,
        set_name: line.item.card.set_name,
      }];
    });

    try {
      await commitInventoryChange({ nextItems, movements, sale, binderDeltas });
      setSaleOpen(false);
      setSaleCart([]);
      setSalePrice('');
      Alert.alert('Sale completed', 'Inventory and the sale report were saved together.');
    } catch (error) {
      console.log('Seller sale commit failed', error);
      showSellerWriteFailure(
        error,
        'Could not complete sale',
        'Nothing was changed. Refresh and try again.'
      );
    }
  }, [commitInventoryChange, items, saleCart, saleEstimatedValue, salePrice]);

  const renderInventoryItem = ({ item }: { item: InventoryItem }) => {
    const price = getPreferredPrice(item.card);
    const saleLine = saleCart.find((line) => line.item.id === item.id);
    return (
      <View style={{ width: itemWidth, backgroundColor: theme.colors.card, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 10, ...cardShadow }}>
        {item.card.image_small ? (
          <Image source={{ uri: item.card.image_small }} style={{ width: '100%', aspectRatio: item.card.is_product ? 1 : 0.72, borderRadius: 10 }} resizeMode="contain" />
        ) : (
          <View style={{ width: '100%', aspectRatio: item.card.is_product ? 1 : 0.72, borderRadius: 10, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={item.card.is_product ? 'cube-outline' : 'albums-outline'} size={28} color={theme.colors.primary} />
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
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 29, fontWeight: '900' }}>Inventory</Text>
            <Text style={{ color: theme.colors.textSoft, marginTop: 2, fontSize: 12, fontWeight: '700' }}>{totalStock} in stock · {money(inventoryValue)} value</Text>
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
            <TextInput
              value={query}
              onChangeText={onSearchChange}
              placeholder={stockScanMode === 'add' ? (lookupType === 'raw_card' ? 'Search card to add...' : `Search ${productLookupLabel(lookupType).toLowerCase()}...`) : 'Search current stock...'}
              placeholderTextColor={theme.colors.textSoft}
              style={{ flex: 1, color: theme.colors.text, paddingVertical: 11, fontWeight: '800' }}
            />
            {searching && <ActivityIndicator color={theme.colors.primary} />}
          </View>

          {stockScanMode === 'add' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
              {INVENTORY_LOOKUP_OPTIONS.map((option) => {
                const active = lookupType === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => changeLookupType(option.key)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 11,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: active ? '#F6F1FF' : theme.colors.card,
                      borderWidth: 1,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Ionicons name={option.icon} size={15} color={active ? theme.colors.primary : theme.colors.textSoft} />
                    <Text style={{ color: active ? theme.colors.primary : theme.colors.textSoft, fontWeight: '900', fontSize: 11 }}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {results.length > 0 && (
            <>
            {stockScanMode === 'add' && lookupType !== 'raw_card' && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                      {productLookupLabel(lookupType)}
                    </Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2, fontWeight: '700' }}>
                      {query.trim() ? `${catalogResults.length} matching item${catalogResults.length !== 1 ? 's' : ''}` : `${catalogResults.length} available item${catalogResults.length !== 1 ? 's' : ''}`}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => loadProductCatalog(lookupType)} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="refresh" size={17} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <FlatList
              data={lookupType === 'raw_card' ? results : catalogResults}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: lookupType === 'raw_card' ? 220 : Math.min(540, Math.max(360, width * 0.95)), marginTop: 10 }}
              renderItem={({ item }) => {
                const selected = lookupType === 'raw_card' && drafts.some((draft) => draft.card.id === item.id);
                const confidence = getProductConfidence(item);
                return (
                  <TouchableOpacity
                    onPress={() => lookupType === 'raw_card' ? toggleDraftCard(item) : openProductStockModal(item)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: lookupType === 'raw_card' ? 9 : 12,
                      paddingHorizontal: lookupType === 'raw_card' ? 0 : 10,
                      marginBottom: lookupType === 'raw_card' ? 0 : 8,
                      borderTopWidth: lookupType === 'raw_card' ? 1 : 0,
                      borderTopColor: theme.colors.border,
                      borderRadius: lookupType === 'raw_card' ? 0 : 16,
                      backgroundColor: lookupType === 'raw_card' ? 'transparent' : theme.colors.surface,
                      borderWidth: lookupType === 'raw_card' ? 0 : 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    {item.image_small ? (
                      <Image source={{ uri: item.image_small }} style={{ width: item.is_product ? 68 : 46, height: item.is_product ? 68 : 62, borderRadius: item.is_product ? 10 : 0 }} resizeMode="contain" />
                    ) : (
                      <View style={{ width: item.is_product ? 68 : 46, height: item.is_product ? 68 : 62, borderRadius: 10, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={item.is_product ? 'cube-outline' : 'albums-outline'} size={20} color={theme.colors.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={lookupType === 'raw_card' ? 1 : 2} style={{ color: theme.colors.text, fontWeight: '900', fontSize: lookupType === 'raw_card' ? 14 : 15 }}>{item.name}</Text>
                      <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 12 }}>
                        {getProductResultSubtitle(item)}
                      </Text>
                      {item.is_product && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                          <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 12 }}>TCG {money(item.tcg_price)}</Text>
                          <Text style={{ color: theme.colors.textSoft, fontWeight: '800', fontSize: 12 }}>eBay {money(item.ebay_price)}</Text>
                        </View>
                      )}
                      {confidence && (
                        <View style={{ alignSelf: 'flex-start', marginTop: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: `${confidence.color}18` }}>
                          <Text style={{ color: confidence.color, fontWeight: '900', fontSize: 10 }}>
                            {confidence.label}{item.product_price_count != null ? ` - ${item.product_price_count} sold` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: selected ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: selected ? theme.colors.primary : theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={lookupType === 'raw_card' ? (selected ? 'checkmark' : 'add') : 'chevron-forward'} size={18} color={selected ? '#FFFFFF' : theme.colors.textSoft} />
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
            </>
          )}
        </View>

        {drafts.length > 0 && (
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12, ...cardShadow }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>Review stock</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>{drafts.length} item{drafts.length !== 1 ? 's' : ''} selected</Text>
              </View>
              <TouchableOpacity onPress={addAllDrafts} style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>Add all</Text>
              </TouchableOpacity>
            </View>

            {drafts.map((draft) => {
              const draftConditions = getDraftConditions(draft.card);
              const draftTotal = draftConditions.reduce((sum, condition) => sum + (draft.quantities[condition] ?? 0), 0);
              return (
                <View key={draft.card.id} style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 10, marginTop: 8 }}>
                  <TouchableOpacity onPress={() => toggleDraftExpanded(draft.card.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {draft.card.image_small ? (
                      <Image source={{ uri: draft.card.image_small }} style={{ width: 40, height: draft.card.is_product ? 40 : 56, borderRadius: draft.card.is_product ? 8 : 0 }} resizeMode="contain" />
                    ) : (
                      <View style={{ width: 40, height: draft.card.is_product ? 40 : 56, borderRadius: 8, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={draft.card.is_product ? 'cube-outline' : 'albums-outline'} size={18} color={theme.colors.primary} />
                      </View>
                    )}
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
                      {draft.card.is_product && (
                        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12 }}>Your price</Text>
                              <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>
                                Recommended {money(getPreferredPrice(draft.card))}
                              </Text>
                            </View>
                            <TextInput
                              value={draft.askingPrice}
                              onChangeText={(value) => updateDraftAskingPrice(draft.card.id, value)}
                              placeholder="Ask"
                              placeholderTextColor={theme.colors.textSoft}
                              keyboardType="decimal-pad"
                              style={{ width: 92, backgroundColor: theme.colors.card, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, paddingVertical: 7, color: theme.colors.text, fontWeight: '900' }}
                            />
                          </View>
                        </View>
                      )}
                      {draftConditions.map((condition) => (
                        <View key={condition} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 10 }}>
                          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12 }}>{condition}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity onPress={() => updateDraftQuantity(draft.card.id, condition, -1)} style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
                              <Ionicons name="remove" size={16} color={theme.colors.text} />
                            </TouchableOpacity>
                            <Text style={{ color: theme.colors.text, fontWeight: '900', minWidth: 20, textAlign: 'center' }}>{draft.quantities[condition] ?? 0}</Text>
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
          <TouchableOpacity
            onPress={() => setFiltersOpen((open) => !open)}
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: filtersOpen || activeInventoryFilterCount > 0 ? theme.colors.primary : theme.colors.border,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="filter-outline" size={18} color={filtersOpen || activeInventoryFilterCount > 0 ? theme.colors.primary : theme.colors.textSoft} />
              <Text style={{ color: filtersOpen || activeInventoryFilterCount > 0 ? theme.colors.primary : theme.colors.text, fontWeight: '900' }}>Filters</Text>
              {activeInventoryFilterCount > 0 && (
                <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 11 }}>{activeInventoryFilterCount}</Text>
                </View>
              )}
            </View>
            <Ionicons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSoft} />
          </TouchableOpacity>

          {filtersOpen && (
            <View style={{ marginTop: 10 }}>
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
            {(['All', ...INVENTORY_FILTER_CONDITIONS] as const).map((condition) => (
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
          {activeInventoryFilterCount > 0 && (
            <TouchableOpacity
              onPress={() => {
                setInventoryViewFilter('all');
                setFilterCondition('All');
                setSetFilter('');
                setMinPrice('');
                setMaxPrice('');
              }}
              style={{ marginTop: 8, alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 11 }}>Clear filters</Text>
            </TouchableOpacity>
          )}
            </View>
          )}
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

      <Modal visible={!!selectedProduct} transparent animationType="slide" onRequestClose={() => setSelectedProduct(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(10, 8, 25, 0.34)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.colors.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 16, borderWidth: 1, borderColor: theme.colors.border, maxHeight: '90%', ...cardShadow }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Add stock</Text>
                <Text style={{ color: theme.colors.textSoft, marginTop: 3, fontWeight: '700' }}>
                  {selectedProduct?.product_type ? productLookupLabel(selectedProduct.product_type as ProductLookupType) : 'Sealed product'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedProduct(null)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {selectedProduct && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  {selectedProduct.image_large || selectedProduct.image_small ? (
                    <Image source={{ uri: selectedProduct.image_large ?? selectedProduct.image_small ?? '' }} style={{ width: 124, height: 124, borderRadius: 14, backgroundColor: theme.colors.surface }} resizeMode="contain" />
                  ) : (
                    <View style={{ width: 124, height: 124, borderRadius: 14, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="cube-outline" size={34} color={theme.colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900' }} numberOfLines={3}>{selectedProduct.name}</Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700', marginTop: 5 }} numberOfLines={2}>{selectedProduct.set_name ?? 'Product'}</Text>
                    {getProductConfidence(selectedProduct) ? (
                      <View style={{ alignSelf: 'flex-start', marginTop: 9, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: `${getProductConfidence(selectedProduct)!.color}18` }}>
                        <Text style={{ color: getProductConfidence(selectedProduct)!.color, fontWeight: '900', fontSize: 11 }}>
                          {getProductConfidence(selectedProduct)!.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={{ marginTop: 16, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14, marginBottom: 10 }}>Recommended prices</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 11 }}>TCG</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginTop: 4 }}>{money(selectedProduct.tcg_price)}</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 11 }}>eBay sold avg</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginTop: 4 }}>{money(selectedProduct.ebay_price)}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 11 }}>eBay low</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>{money(selectedProduct.product_price_low)}</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 11 }}>eBay high</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>{money(selectedProduct.product_price_high)}</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: theme.colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                      <Text style={{ color: theme.colors.textSoft, fontWeight: '900', fontSize: 11 }}>Sold comps</Text>
                      <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 4 }}>{selectedProduct.product_price_count ?? '--'}</Text>
                    </View>
                  </View>
                </View>

                <View style={{ marginTop: 14, gap: 10 }}>
                  <View>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12, marginBottom: 6 }}>Your shop price</Text>
                    <TextInput
                      value={productAskingPrice}
                      onChangeText={(value) => setProductAskingPrice(value.replace(/[^0-9.]/g, '').slice(0, 9))}
                      placeholder={`Recommended ${money(getPreferredPrice(selectedProduct))}`}
                      placeholderTextColor={theme.colors.textSoft}
                      keyboardType="decimal-pad"
                      style={{ backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 11, color: theme.colors.text, fontWeight: '900' }}
                    />
                  </View>
                  <View>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12, marginBottom: 6 }}>Quantity to add</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <TouchableOpacity onPress={() => setProductQuantity((value) => String(Math.max(1, (Number.parseInt(value, 10) || 1) - 1)))} style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
                        <Ionicons name="remove" size={18} color={theme.colors.text} />
                      </TouchableOpacity>
                      <TextInput
                        value={productQuantity}
                        onChangeText={(value) => setProductQuantity(value.replace(/[^0-9]/g, '').slice(0, 4) || '1')}
                        keyboardType="number-pad"
                        style={{ flex: 1, textAlign: 'center', backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 11, color: theme.colors.text, fontWeight: '900', fontSize: 16 }}
                      />
                      <TouchableOpacity onPress={() => setProductQuantity((value) => String((Number.parseInt(value, 10) || 1) + 1))} style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="add" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <TouchableOpacity onPress={addSelectedProductToInventory} style={{ marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>Add to inventory</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

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

