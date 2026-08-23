import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { assertPremiumSellerWriteAccess } from './premiumSellerAccess';
import { isVerifiedSellerSessionIdentity, sellerBatchRequestId, sellerCacheKey } from './sellerCache';
import {
  executeSellerBatchWithIdentity,
  SellerInventoryCommitAccountChangedError,
  SellerInventoryCommitReconciliationRequiredError,
} from './sellerBatchCommit';
import { loadRemoteWithCache } from './sellerRemoteCache';

export { sellerCacheKey } from './sellerCache';

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
  persisted_card_snapshot?: InventoryCardSnapshot;
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
  inventory_item_id: string;
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

export type InventoryMovementDraft = Omit<InventoryMovement, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type SellerBinderDelta = {
  binder_id: string;
  card_id: string;
  set_id: string;
  quantity_delta: number;
  card_name?: string | null;
  card_number?: string | null;
  image_url?: string | null;
  set_name?: string | null;
};

export type SellerInventoryBatchResult = {
  requestId: string;
  inventoryItemCount: number;
  movementCount: number;
  binderDeltaCount: number;
  saleRecorded: boolean;
  replayed: boolean;
};

const STORAGE_KEY = 'stackr:inventory-items:v2';
const SALES_STORAGE_KEY = 'stackr:inventory-sales:v2';
const MOVEMENTS_STORAGE_KEY = 'stackr:inventory-movements:v2';

async function authenticatedUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

async function currentSellerCommitIdentityMatches(expectedUserId: string) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const verifiedUser = await authenticatedUser();
  return isVerifiedSellerSessionIdentity(session?.user?.id, verifiedUser?.id)
    && verifiedUser?.id === expectedUserId;
}

async function currentUserAndCache<T>(base: string) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const sessionUser = session?.user ?? null;
  if (!sessionUser) return { user: null, cached: [] as T[], key: null };
  const key = sellerCacheKey(base, sessionUser.id);
  const cached = parseCachedArray<T>(await AsyncStorage.getItem(key));
  const user = await authenticatedUser();
  if (!isVerifiedSellerSessionIdentity(sessionUser.id, user?.id)) {
    throw new Error('Seller session could not be verified.');
  }
  return { user, cached, key };
}

function createBatchId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}

function parseCachedArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function inventoryPayload(items: InventoryItem[], usePersistedSnapshot: boolean) {
  return items.map(({ persisted_card_snapshot: persistedCardSnapshot, ...item }) => ({
    ...item,
    card: usePersistedSnapshot && persistedCardSnapshot
      ? persistedCardSnapshot
      : item.card,
  }));
}

function isRetryableSellerBatchError(error: any) {
  const code = String(error?.code ?? '');
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const message = String(error?.message ?? '').toLowerCase();
  return status >= 500
    || code === 'PGRST000'
    || code === 'PGRST001'
    || code === 'PGRST002'
    || code === 'PGRST003'
    || message.includes('failed to fetch')
    || message.includes('network request failed')
    || message.includes('networkerror')
    || message.includes('connection')
    || message.includes('timeout');
}

async function waitForRetry(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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

type SellerInventoryLoadOptions = {
  onStale?: () => void;
};

export async function loadInventoryItems(options: SellerInventoryLoadOptions = {}): Promise<InventoryItem[]> {
  const { user, cached, key: storageKey } = await currentUserAndCache<InventoryItem>(STORAGE_KEY);
  if (!user || !storageKey) return [];

  const loaded = await loadRemoteWithCache({
    cached,
    fetchRemote: async () => {
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
        persisted_card_snapshot: row.card_snapshot,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      if (!remoteItems.length) return [];
      try {
        return await hydrateProductInventoryPrices(remoteItems);
      } catch (error) {
        console.log('Seller inventory price hydrate failed', error);
        return remoteItems;
      }
    },
    writeCache: (fresh) => AsyncStorage.setItem(storageKey, JSON.stringify(fresh)),
    onStale: options.onStale,
    onCacheWriteError: (error) => console.log('Seller inventory cache write failed', error),
  });
  if (loaded.stale) console.log('Seller inventory Supabase load failed', loaded.remoteError);
  if (!loaded.stale) return loaded.value;
  try {
    return await hydrateProductInventoryPrices(loaded.value);
  } catch {
    return loaded.value;
  }
}

/**
 * Loads the authenticated seller's current inventory directly from Supabase.
 * Sweep planning fails closed if the session and verified user do not match,
 * so a batch can never be prepared from another account or a stale device cache.
 */
export async function loadVerifiedSellerInventorySnapshot(): Promise<{
  userId: string;
  items: InventoryItem[];
}> {
  const [{ data: sessionData, error: sessionError }, { data: { user }, error: userError }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);
  if (sessionError) throw sessionError;
  if (userError) throw userError;
  if (!user || !isVerifiedSellerSessionIdentity(sessionData.session?.user?.id, user.id)) {
    throw new Error('Sign in again before preparing a seller inventory batch.');
  }

  const { data, error } = await supabase
    .from('seller_inventory_items')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  const items = (data ?? []).map((row: any): InventoryItem => ({
    id: row.id,
    card_id: row.card_id,
    set_id: row.set_id,
    condition: row.condition,
    quantity: row.quantity,
    asking_price: row.asking_price == null ? null : Number(row.asking_price),
    buy_price: row.buy_price == null ? null : Number(row.buy_price),
    notes: row.notes,
    card: row.card_snapshot,
    persisted_card_snapshot: row.card_snapshot,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
  if (!await currentSellerCommitIdentityMatches(user.id)) {
    throw new Error('Seller account changed while live inventory was loading.');
  }
  return { userId: user.id, items };
}

export async function commitSellerInventoryBatch(input: {
  expectedUserId?: string;
  expectedItems: InventoryItem[];
  items: InventoryItem[];
  movements?: InventoryMovementDraft[];
  sale?: InventorySaleTransaction | null;
  binderDeltas?: SellerBinderDelta[];
  requestId?: string;
}) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Sign in before changing seller inventory.');
  if (input.expectedUserId && user.id !== input.expectedUserId) {
    throw new SellerInventoryCommitAccountChangedError();
  }
  assertPremiumSellerWriteAccess(user);

  const requestToken = input.requestId ?? createBatchId('request');
  const requestId = sellerBatchRequestId(user.id, requestToken);
  const movements = (input.movements ?? []).map((movement): InventoryMovement => ({
    ...movement,
    id: movement.id ?? createBatchId('movement'),
    created_at: movement.created_at ?? new Date().toISOString(),
  }));

  const rpcInput = {
    p_request_id: requestId,
    p_expected_inventory: inventoryPayload(input.expectedItems, true),
    p_inventory: inventoryPayload(input.items, false),
    p_movements: movements,
    p_sale: input.sale ?? null,
    p_binder_deltas: input.binderDeltas ?? [],
  };

  const verifyCommitIdentity = () => currentSellerCommitIdentityMatches(user.id);
  const result = await executeSellerBatchWithIdentity<SellerInventoryBatchResult>({
    requestId,
    verifyIdentity: verifyCommitIdentity,
    invoke: async () => {
      const { data, error } = await supabase.rpc('commit_seller_inventory_batch', rpcInput);
      return { data: data as SellerInventoryBatchResult | null, error };
    },
    isRetryableError: isRetryableSellerBatchError,
    waitBeforeRetry: () => waitForRetry(250),
  });

  try {
    if (!await verifyCommitIdentity()) {
      throw new SellerInventoryCommitReconciliationRequiredError(
        requestId,
        'committed_identity_unverified',
      );
    }
  } catch (error) {
    if (error instanceof SellerInventoryCommitReconciliationRequiredError) throw error;
    throw new SellerInventoryCommitReconciliationRequiredError(
      requestId,
      'committed_identity_unverified',
      { cause: error },
    );
  }

  const committedItems = input.items.map((item) => ({
    ...item,
    persisted_card_snapshot: item.card,
  }));

  // Remote data is authoritative. Cache only after the complete database
  // transaction succeeds; a cache failure cannot turn a committed batch into
  // a duplicate retry because the server receipt remains authoritative.
  try {
    const storageKey = sellerCacheKey(STORAGE_KEY, user.id);
    const movementsStorageKey = sellerCacheKey(MOVEMENTS_STORAGE_KEY, user.id);
    const salesStorageKey = sellerCacheKey(SALES_STORAGE_KEY, user.id);
    const [cachedMovementsRaw, cachedSalesRaw] = await Promise.all([
      AsyncStorage.getItem(movementsStorageKey),
      AsyncStorage.getItem(salesStorageKey),
    ]);
    const cachedMovements = parseCachedArray<InventoryMovement>(cachedMovementsRaw);
    const movementIds = new Set(movements.map((movement) => movement.id));
    const nextMovements = [
      ...movements,
      ...cachedMovements.filter((movement) => !movementIds.has(movement.id)),
    ].slice(0, 100);
    const cachedSales = parseCachedArray<InventorySaleTransaction>(cachedSalesRaw);
    const nextSales = input.sale
      ? [input.sale, ...cachedSales.filter((sale) => sale.id !== input.sale?.id)]
      : cachedSales;
    await Promise.all([
      AsyncStorage.setItem(storageKey, JSON.stringify(committedItems)),
      AsyncStorage.setItem(movementsStorageKey, JSON.stringify(nextMovements)),
      AsyncStorage.setItem(salesStorageKey, JSON.stringify(nextSales)),
    ]);
  } catch (error) {
    console.log('Seller inventory local cache update failed', error);
  }

  try {
    if (!await verifyCommitIdentity()) {
      throw new SellerInventoryCommitReconciliationRequiredError(
        requestId,
        'committed_identity_unverified',
      );
    }
  } catch (error) {
    if (error instanceof SellerInventoryCommitReconciliationRequiredError) throw error;
    throw new SellerInventoryCommitReconciliationRequiredError(
      requestId,
      'committed_identity_unverified',
      { cause: error },
    );
  }

  return { result, movements, items: committedItems, userId: user.id };
}

export async function loadInventorySales(): Promise<InventorySaleTransaction[]> {
  const { user, cached } = await currentUserAndCache<InventorySaleTransaction>(SALES_STORAGE_KEY);
  if (!user) return [];
  return cached;
}

export async function loadInventoryMovements(options: SellerInventoryLoadOptions = {}): Promise<InventoryMovement[]> {
  const { user, cached, key: movementsStorageKey } = await currentUserAndCache<InventoryMovement>(MOVEMENTS_STORAGE_KEY);
  if (!user || !movementsStorageKey) return [];

  const loaded = await loadRemoteWithCache({
    cached,
    fetchRemote: async () => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []).map((row: any): InventoryMovement => ({
        id: row.id,
        inventory_item_id: row.inventory_item_id,
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
    },
    writeCache: (fresh) => AsyncStorage.setItem(movementsStorageKey, JSON.stringify(fresh)),
    onStale: options.onStale,
    onCacheWriteError: (error) => console.log('Inventory movement cache write failed', error),
  });
  if (loaded.stale) console.log('Inventory movement Supabase load failed', loaded.remoteError);
  return loaded.value;
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
