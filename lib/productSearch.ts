import { PRICE_API_URL } from './config';
import { supabase } from './supabase';
import type { InventoryCardSnapshot } from './inventory';

export type ProductLookupType =
  | 'sealed_product'
  | 'booster_pack'
  | 'booster_box'
  | 'elite_trainer_box'
  | 'collection_bundle'
  | 'accessories';

export type ProductPriceResult = {
  low: number | null;
  average: number | null;
  high: number | null;
  count: number | null;
  query: string;
  soldDataSource: string | null;
};

export type MarketProduct = {
  id: string;
  product_type: ProductLookupType;
  name: string;
  set_name: string | null;
  image_url: string | null;
  image_large_url: string | null;
  aliases: string[];
  search_text: string;
  source: string | null;
  latest_price?: ProductPriceResult | null;
};

export const PRODUCT_LOOKUP_OPTIONS: {
  key: ProductLookupType;
  label: string;
  icon: string;
}[] = [
  { key: 'sealed_product', label: 'Sealed Product', icon: 'cube-outline' },
  { key: 'booster_pack', label: 'Booster Pack', icon: 'file-tray-full-outline' },
  { key: 'booster_box', label: 'Booster Box', icon: 'archive-outline' },
  { key: 'elite_trainer_box', label: 'Elite Trainer Box', icon: 'file-tray-stacked-outline' },
  { key: 'collection_bundle', label: 'Collection Bundle', icon: 'cube-outline' },
  { key: 'accessories', label: 'Accessories', icon: 'layers-outline' },
];

export const PRODUCT_QUERY_SUFFIX: Record<ProductLookupType | 'raw_card' | 'graded_slab', string> = {
  raw_card: 'pokemon card',
  graded_slab: 'pokemon graded slab',
  sealed_product: 'pokemon sealed product',
  booster_pack: 'pokemon booster pack sealed',
  booster_box: 'pokemon booster box sealed',
  elite_trainer_box: 'pokemon elite trainer box sealed',
  collection_bundle: 'pokemon collection box sealed',
  accessories: 'pokemon card accessories',
};

export const productLookupLabel = (type: ProductLookupType) =>
  PRODUCT_LOOKUP_OPTIONS.find((option) => option.key === type)?.label ?? 'Product';

export const buildProductQuery = (text: string, type: ProductLookupType | 'raw_card' | 'graded_slab') =>
  `${text.trim()} ${PRODUCT_QUERY_SUFFIX[type]}`.trim();

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 90);

export const productInventoryId = (name: string, type: ProductLookupType) =>
  `product:${type}:${slugify(name) || 'item'}`;

const normaliseText = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const buildSearchText = (name: string, type: ProductLookupType, aliases: string[] = [], setName?: string | null) =>
  [
    name,
    productLookupLabel(type),
    type.replace(/_/g, ' '),
    setName ?? '',
    ...aliases,
  ].map(normaliseText).filter(Boolean).join(' ');

const mapProductRow = (row: any): MarketProduct => ({
  id: row.id,
  product_type: row.product_type,
  name: row.name,
  set_name: row.set_name ?? null,
  image_url: row.image_url ?? null,
  image_large_url: row.image_large_url ?? null,
  aliases: Array.isArray(row.aliases) ? row.aliases : [],
  search_text: row.search_text ?? '',
  source: row.source ?? null,
});

const mapSnapshotRow = (row: any): ProductPriceResult => ({
  low: row?.ebay_low == null ? null : Number(row.ebay_low),
  average: row?.ebay_average == null ? null : Number(row.ebay_average),
  high: row?.ebay_high == null ? null : Number(row.ebay_high),
  count: row?.sold_count == null ? null : Number(row.sold_count),
  query: row?.query ?? '',
  soldDataSource: row?.source ?? null,
});

export async function searchMarketProducts(
  text: string,
  type?: ProductLookupType,
  limit = 20
): Promise<MarketProduct[]> {
  const trimmed = normaliseText(text);
  if (trimmed.length < 2) return [];

  let query = supabase
    .from('market_products')
    .select('*')
    .limit(limit);

  if (type) query = query.eq('product_type', type);
  for (const word of trimmed.split(/\s+/).filter(Boolean).slice(0, 8)) {
    query = query.ilike('search_text', `%${word}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.log('Market product search failed', error);
    return [];
  }

  const products = (data ?? []).map(mapProductRow);
  const ids = products.map((product) => product.id);
  if (!ids.length) return products;

  const { data: snapshots, error: snapshotError } = await supabase
    .from('market_product_price_snapshots')
    .select('product_id, ebay_low, ebay_average, ebay_high, sold_count, query, source, snapshot_at')
    .in('product_id', ids)
    .order('snapshot_at', { ascending: false });

  if (snapshotError) return products;

  const latestMap = new Map<string, ProductPriceResult>();
  for (const snapshot of snapshots ?? []) {
    if (!latestMap.has(snapshot.product_id)) latestMap.set(snapshot.product_id, mapSnapshotRow(snapshot));
  }

  return products.map((product) => ({ ...product, latest_price: latestMap.get(product.id) ?? null }));
}

export async function ensureMarketProduct(name: string, type: ProductLookupType): Promise<MarketProduct | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const id = productInventoryId(trimmed, type);
  const { data: existing } = await supabase
    .from('market_products')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (existing) return mapProductRow(existing);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      id,
      product_type: type,
      name: trimmed,
      set_name: null,
      image_url: null,
      image_large_url: null,
      aliases: [],
      search_text: buildSearchText(trimmed, type),
      source: 'local',
    };
  }

  const row = {
    id,
    product_type: type,
    name: trimmed,
    set_name: null,
    image_url: null,
    image_large_url: null,
    aliases: [],
    search_text: buildSearchText(trimmed, type),
    source: 'user',
    created_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('market_products')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .maybeSingle();

  if (error) {
    console.log('Market product upsert failed', error);
    return mapProductRow(row);
  }

  return data ? mapProductRow(data) : mapProductRow(row);
}

export async function getLatestProductPrice(productId: string): Promise<ProductPriceResult | null> {
  const { data, error } = await supabase
    .from('market_product_price_snapshots')
    .select('ebay_low, ebay_average, ebay_high, sold_count, query, source, snapshot_at')
    .eq('product_id', productId)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapSnapshotRow(data);
}

async function saveProductPriceSnapshot(
  product: MarketProduct,
  price: ProductPriceResult
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('market_product_price_snapshots').insert({
    product_id: product.id,
    product_type: product.product_type,
    product_name: product.name,
    ebay_low: price.low,
    ebay_average: price.average,
    ebay_high: price.high,
    sold_count: price.count,
    query: price.query,
    source: price.soldDataSource,
    created_by: user.id,
  });

  if (error) console.log('Market product price snapshot save failed', error);
}

export async function fetchProductPrice(name: string, type: ProductLookupType): Promise<ProductPriceResult> {
  if (!PRICE_API_URL) throw new Error('Missing price API URL');

  const product = await ensureMarketProduct(name, type);
  const query = buildProductQuery(name, type);
  const params = new URLSearchParams({
    q: query,
    productType: type === 'accessories' ? 'accessory' : 'sealed',
  });

  const response = await fetch(`${PRICE_API_URL.replace(/\/$/, '')}/api/price/ebay?${params.toString()}`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to fetch product price: ${response.status} ${text}`);
  }

  const data = await response.json();
  const price = {
    low: data.low ?? null,
    average: data.average ?? null,
    high: data.high ?? null,
    count: data.count ?? null,
    query: data.query ?? query,
    soldDataSource: data.soldDataSource ?? null,
  };

  if (product) await saveProductPriceSnapshot(product, price);
  return price;
}

export async function getProductPriceWithFallback(
  name: string,
  type: ProductLookupType
): Promise<ProductPriceResult | null> {
  const product = await ensureMarketProduct(name, type);
  const cached = product ? await getLatestProductPrice(product.id) : null;
  if (cached?.average != null) return cached;

  try {
    return await fetchProductPrice(name, type);
  } catch (error) {
    console.log('Live product price fetch failed', error);
    return cached;
  }
}

export function productToInventorySnapshot(product: MarketProduct): InventoryCardSnapshot {
  return {
    id: product.id,
    name: product.name,
    number: null,
    set_id: null,
    set_name: product.set_name ?? productLookupLabel(product.product_type),
    rarity: null,
    image_small: product.image_url,
    image_large: product.image_large_url ?? product.image_url,
    tcg_price: null,
    ebay_price: product.latest_price?.average ?? null,
    cardmarket_price: null,
    is_product: true,
    product_type: product.product_type,
    product_name: product.name,
    product_price_low: product.latest_price?.low ?? null,
    product_price_high: product.latest_price?.high ?? null,
    product_price_count: product.latest_price?.count ?? null,
    product_price_query: product.latest_price?.query ?? null,
    product_price_source: product.latest_price?.soldDataSource ?? null,
  };
}

export function toInventoryProductSnapshot(
  name: string,
  type: ProductLookupType,
  price?: ProductPriceResult | null
): InventoryCardSnapshot {
  return {
    id: productInventoryId(name, type),
    name: name.trim(),
    number: null,
    set_id: null,
    set_name: productLookupLabel(type),
    rarity: null,
    image_small: null,
    image_large: null,
    tcg_price: null,
    ebay_price: price?.average ?? null,
    cardmarket_price: null,
    is_product: true,
    product_type: type,
    product_name: name.trim(),
    product_price_low: price?.low ?? null,
    product_price_high: price?.high ?? null,
    product_price_count: price?.count ?? null,
    product_price_query: price?.query ?? null,
    product_price_source: price?.soldDataSource ?? null,
  };
}
