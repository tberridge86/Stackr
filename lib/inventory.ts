import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type InventoryCondition =
  | 'Mint'
  | 'Near Mint'
  | 'Lightly Played'
  | 'Moderately Played'
  | 'Heavily Played'
  | 'Damaged'
  | 'Sealed';

export const INVENTORY_CONDITIONS: InventoryCondition[] = [
  'Mint',
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
];

export const PRODUCT_INVENTORY_CONDITIONS: InventoryCondition[] = ['Sealed'];

export type InventoryCardSnapshot = {
  id: string;
  name: string;
  number: string | null;
  set_id: string | null;
  set_name: string | null;
  rarity: string | null;
  image_small: string | null;
  image_large: string | null;
  tcg_price: number | null;
  ebay_price: number | null;
  cardmarket_price: number | null;
  is_product?: boolean;
  product_type?: string | null;
  product_name?: string | null;
  product_price_low?: number | null;
  product_price_high?: number | null;
  product_price_count?: number | null;
  product_price_query?: string | null;
  product_price_source?: string | null;
  inventory_binder_id?: string | null;
  inventory_binder_name?: string | null;
};

export type InventoryItem = {
  id: string;
  card_id: string;
  set_id: string | null;
  condition: InventoryCondition;
  quantity: number;
  asking_price: number | null;
  buy_price: number | null;
  notes: string | null;
  card: InventoryCardSnapshot;
  created_at: string;
  updated_at: string;
};

export type InventorySaleLine = {
  inventory_item_id: string;
  card_id: string;
  card_name: string;
  set_name: string | null;
  condition: InventoryCondition;
  quantity: number;
  estimated_unit_price: number | null;
  image_small: string | null;
};

export type InventorySaleTransaction = {
  id: string;
  sold_price: number | null;
  estimated_value: number;
  lines: InventorySaleLine[];
  created_at: string;
};

export type InventoryMovementAction = 'scan_in' | 'scan_out';

export type InventoryMovementReason =
  | 'Added to Collection'
  | 'Added to Binder'
  | 'Added as Duplicate'
  | 'Added to Sell/Trade'
  | 'Sold'
  | 'Traded'
  | 'Shipped'
  | 'Lost/Damaged'
  | 'Removed from Collection'
  | 'Other';

export type InventoryMovement = {
  id: string;
  action_type: InventoryMovementAction;
  card_id: string;
  set_id: string | null;
  card_name: string;
  quantity: number;
  reason: InventoryMovementReason;
  binder_id?: string | null;
  binder_name?: string | null;
  collection_id?: string | null;
  value_at_time?: number | null;
  image_small?: string | null;
  created_at: string;
};

const STORAGE_KEY = 'stackr:inventory-items:v1';
const SALES_STORAGE_KEY = 'stackr:inventory-sales:v1';
const MOVEMENTS_STORAGE_KEY = 'stackr:inventory-movements:v1';

async function hydrateProductInventoryPrices(items: InventoryItem[]): Promise<InventoryItem[]> {
  const productIds = items
    .filter((item) => item.card?.is_product || item.card_id.startsWith('product:'))
    .map((item) => item.card_id);

  if (!productIds.length) return items;

  const { data, error } = await supabase
    .from('market_product_price_snapshots')
    .select('product_id, ebay_low, ebay_average, ebay_high, sold_count, query, source, snapshot_at')
    .in('product_id', [...new Set(productIds)])
    .order('snapshot_at', { ascending: false });

  if (error) {
    console.log('Seller inventory product price hydrate failed', error);
    return items;
  }

  const latestByProductId = new Map<string, any>();
  for (const snapshot of data ?? []) {
    if (!latestByProductId.has(snapshot.product_id)) latestByProductId.set(snapshot.product_id, snapshot);
  }

  return items.map((item) => {
    const snapshot = latestByProductId.get(item.card_id);
    if (!snapshot) return item;
    return {
      ...item,
      card: {
        ...item.card,
        ebay_price: snapshot.ebay_average == null ? item.card.ebay_price : Number(snapshot.ebay_average),
        product_price_low: snapshot.ebay_low == null ? null : Number(snapshot.ebay_low),
        product_price_high: snapshot.ebay_high == null ? null : Number(snapshot.ebay_high),
        product_price_count: snapshot.sold_count == null ? null : Number(snapshot.sold_count),
        product_price_query: snapshot.query ?? null,
        product_price_source: snapshot.source ?? null,
        is_product: true,
      },
      updated_at: item.updated_at,
    };
  });
}

export async function loadInventoryItems(): Promise<InventoryItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const cached = (() => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return cached;

    const { data, error } = await supabase
      .from('seller_inventory_items')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const remoteItems = (data ?? []).map((row: any): InventoryItem => ({
      id: row.id,
      card_id: row.card_id,
      set_id: row.set_id,
      condition: row.condition,
      quantity: row.quantity,
      asking_price: row.asking_price == null ? null : Number(row.asking_price),
      buy_price: row.buy_price == null ? null : Number(row.buy_price),
      notes: row.notes,
      card: row.card_snapshot,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    if (!remoteItems.length) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }

    const hydratedItems = await hydrateProductInventoryPrices(remoteItems);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(hydratedItems));
    return hydratedItems;
  } catch (error) {
    console.log('Seller inventory Supabase load failed', error);
    try {
      return await hydrateProductInventoryPrices(cached);
    } catch {
      return cached;
    }
  }
}

export async function saveInventoryItems(items: InventoryItem[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error: deleteError } = await supabase
      .from('seller_inventory_items')
      .delete()
      .eq('user_id', user.id);
    if (deleteError) throw deleteError;

    if (!items.length) return;

    const rows = items.map((item) => ({
      id: item.id,
      user_id: user.id,
      card_id: item.card_id,
      set_id: item.set_id,
      condition: item.condition,
      quantity: item.quantity,
      asking_price: item.asking_price,
      buy_price: item.buy_price,
      notes: item.notes,
      card_snapshot: item.card,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));

    const { error: insertError } = await supabase
      .from('seller_inventory_items')
      .insert(rows);
    if (insertError) throw insertError;
  } catch (error) {
    console.log('Seller inventory Supabase save failed', error);
  }
}

export async function loadInventorySales(): Promise<InventorySaleTransaction[]> {
  const raw = await AsyncStorage.getItem(SALES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveInventorySales(sales: InventorySaleTransaction[]) {
  await AsyncStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(sales));
}

export async function loadInventoryMovements(): Promise<InventoryMovement[]> {
  const raw = await AsyncStorage.getItem(MOVEMENTS_STORAGE_KEY);
  const cached = (() => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return cached;

    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const remoteMovements = (data ?? []).map((row: any): InventoryMovement => ({
      id: row.id,
      action_type: row.action_type,
      card_id: row.card_id ?? row.product_id,
      set_id: row.set_id ?? null,
      card_name: row.card_name ?? row.product_name ?? 'Unknown item',
      quantity: Number(row.quantity ?? 1),
      reason: row.reason ?? (row.action_type === 'scan_out' ? 'Removed from Collection' : 'Added to Collection'),
      binder_id: row.binder_id ?? null,
      binder_name: row.binder_name ?? null,
      collection_id: row.collection_id ?? null,
      value_at_time: row.value_at_time == null ? null : Number(row.value_at_time),
      image_small: row.image_small ?? null,
      created_at: row.created_at,
    }));

    await AsyncStorage.setItem(MOVEMENTS_STORAGE_KEY, JSON.stringify(remoteMovements));
    return remoteMovements;
  } catch (error) {
    console.log('Inventory movement Supabase load failed', error);
    return cached;
  }
}

export async function saveInventoryMovements(movements: InventoryMovement[]) {
  await AsyncStorage.setItem(MOVEMENTS_STORAGE_KEY, JSON.stringify(movements));
}

export async function addInventoryMovement(input: Omit<InventoryMovement, 'id' | 'created_at'> & { created_at?: string }) {
  const movement: InventoryMovement = {
    ...input,
    id: `movement:${Date.now()}:${Math.random()}`,
    created_at: input.created_at ?? new Date().toISOString(),
  };
  const current = await loadInventoryMovements();
  const next = [movement, ...current].slice(0, 100);
  await saveInventoryMovements(next);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return movement;

    const { error } = await supabase.from('inventory_movements').insert({
      id: movement.id,
      user_id: user.id,
      card_id: movement.card_id,
      action_type: movement.action_type,
      quantity: movement.quantity,
      reason: movement.reason,
      binder_id: movement.binder_id ?? null,
      collection_id: movement.collection_id ?? null,
      value_at_time: movement.value_at_time ?? null,
      created_at: movement.created_at,
    });
    if (error) throw error;
  } catch (error) {
    console.log('Inventory movement Supabase save failed', error);
  }

  return movement;
}

export async function addInventorySale(sale: InventorySaleTransaction) {
  const current = await loadInventorySales();
  await saveInventorySales([sale, ...current]);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error: saleError } = await supabase.from('seller_sale_transactions').insert({
      id: sale.id,
      user_id: user.id,
      sold_price: sale.sold_price,
      estimated_value: sale.estimated_value,
      created_at: sale.created_at,
    });
    if (saleError) throw saleError;

    if (!sale.lines.length) return;
    const { error: lineError } = await supabase.from('seller_sale_transaction_items').insert(
      sale.lines.map((line) => ({
        transaction_id: sale.id,
        user_id: user.id,
        inventory_item_id: line.inventory_item_id,
        card_id: line.card_id,
        card_name: line.card_name,
        set_name: line.set_name,
        condition: line.condition,
        quantity: line.quantity,
        estimated_unit_price: line.estimated_unit_price,
        image_small: line.image_small,
      }))
    );
    if (lineError) throw lineError;
  } catch (error) {
    console.log('Seller sale Supabase save failed', error);
  }
}

export function createInventoryItem(
  card: InventoryCardSnapshot,
  condition: InventoryCondition,
  quantity = 1
): InventoryItem {
  const now = new Date().toISOString();
  return {
    id: `${card.id}:${condition}:${Date.now()}`,
    card_id: card.id,
    set_id: card.set_id,
    condition,
    quantity,
    asking_price: null,
    buy_price: null,
    notes: null,
    card,
    created_at: now,
    updated_at: now,
  };
}
