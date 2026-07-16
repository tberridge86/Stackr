import { PRICE_API_URL } from './config';
import { fetchAllSets, type PokemonSet } from './pokemonTcg';
import { supabase } from './supabase';
import type { InventoryCardSnapshot } from './inventory';

export type ProductLookupType =
  | 'sealed_product'
  | 'booster_pack'
  | 'sleeved_booster_pack'
  | 'booster_bundle'
  | 'booster_box'
  | 'elite_trainer_box'
  | 'collection_bundle'
  | 'accessories';

export type ProductPriceResult = {
  low: number | null;
  average: number | null;
  high: number | null;
  tcgLow?: number | null;
  tcgMid?: number | null;
  tcgMarket?: number | null;
  tcgProductId?: number | null;
  count: number | null;
  query: string;
  soldDataSource: string | null;
};

export type MarketProduct = {
  id: string;
  product_type: ProductLookupType;
  name: string;
  set_name: string | null;
  language?: string | null;
  release_year?: string | null;
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
  { key: 'sleeved_booster_pack', label: 'Sleeved Pack', icon: 'file-tray-full-outline' },
  { key: 'booster_bundle', label: 'Booster Bundle', icon: 'file-tray-stacked-outline' },
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
  sleeved_booster_pack: 'pokemon sleeved booster pack sealed',
  booster_bundle: 'pokemon booster bundle sealed',
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

const PRODUCT_FALLBACK_LABELS: Record<ProductLookupType, string> = {
  sealed_product: 'Sealed Product',
  booster_pack: 'Booster Pack',
  sleeved_booster_pack: 'Sleeved Booster Pack',
  booster_bundle: 'Booster Bundle',
  booster_box: 'Booster Box',
  elite_trainer_box: 'Elite Trainer Box',
  collection_bundle: 'Collection Box',
  accessories: 'Accessories',
};

const PRODUCT_FALLBACK_ALIASES: Record<ProductLookupType, string[]> = {
  sealed_product: ['sealed', 'sealed product'],
  booster_pack: ['pack', 'single pack', 'loose pack'],
  sleeved_booster_pack: ['sleeved pack', 'blister pack', 'sleeved booster'],
  booster_bundle: ['bundle', 'booster bundle'],
  booster_box: ['box', 'booster box', 'booster display', 'display box'],
  elite_trainer_box: ['etb', 'elite trainer box'],
  collection_bundle: ['collection', 'collection box', 'premium collection'],
  accessories: ['accessory', 'sleeves', 'binder', 'deck box', 'playmat'],
};

const PRODUCT_QUERY_STOPWORDS: Record<ProductLookupType, string[]> = {
  sealed_product: ['sealed', 'product'],
  booster_pack: ['booster', 'pack', 'single', 'loose', 'sealed'],
  sleeved_booster_pack: ['sleeved', 'blister', 'booster', 'pack', 'sealed'],
  booster_bundle: ['booster', 'bundle', 'sealed'],
  booster_box: ['booster', 'box', 'display', 'sealed'],
  elite_trainer_box: ['elite', 'trainer', 'box', 'etb', 'sealed'],
  collection_bundle: ['collection', 'box', 'premium', 'ultra', 'sealed'],
  accessories: ['accessory', 'accessories'],
};

function getSetFallbackQuery(text: string, type?: ProductLookupType) {
  const words = normaliseText(text).split(/\s+/).filter(Boolean);
  if (!type) return words.join(' ');
  const stopwords = new Set([...PRODUCT_QUERY_STOPWORDS[type], 'pokemon', 'tcg']);
  const setWords = words.filter((word) => !stopwords.has(word));
  return (setWords.length ? setWords : words).join(' ');
}

function setMatchesProductSearch(set: PokemonSet, normalizedQuery: string) {
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!queryWords.length) return false;

  const haystack = normaliseText([
    set.name,
    set.id,
    set.series,
    set.language === 'ja' ? 'ja jp jpn japan japanese vintage modern' : 'en english',
    set.region ?? '',
    set.externalIds ? Object.values(set.externalIds).join(' ') : '',
    set.releaseDate ? new Date(set.releaseDate).getFullYear().toString() : '',
  ].filter(Boolean).join(' '));

  return queryWords.every((word) => haystack.includes(word));
}

function setProductFallbackName(setName: string, type: ProductLookupType) {
  if (type === 'sealed_product') return `${setName} sealed product`;
  if (type === 'accessories') return `${setName} accessories`;
  return `${setName} ${PRODUCT_FALLBACK_LABELS[type]}`;
}

function buildSetProductFallback(set: PokemonSet, type: ProductLookupType): MarketProduct {
  const label = PRODUCT_FALLBACK_LABELS[type];
  const name = setProductFallbackName(set.name, type);
  const releaseYear = set.releaseDate ? String(new Date(set.releaseDate).getFullYear()) : null;
  const languageLabel = set.language === 'ja' ? 'Japanese' : 'English';
  const aliases = [
    set.id,
    set.series,
    set.language,
    languageLabel,
    releaseYear,
    ...PRODUCT_FALLBACK_ALIASES[type],
    ...PRODUCT_FALLBACK_ALIASES[type].map((alias) => `${set.name} ${alias}`),
  ].filter((value): value is string => Boolean(value?.trim()));

  return {
    id: productInventoryId(name, type),
    product_type: type,
    name,
    set_name: set.name,
    language: languageLabel,
    release_year: releaseYear,
    image_url: null,
    image_large_url: null,
    aliases,
    search_text: buildSearchText(name, type, aliases, set.name),
    source: 'set_catalog',
    latest_price: null,
  };
}

async function getSetCatalogFallbackProducts(
  text: string,
  type?: ProductLookupType,
  limit = 20
): Promise<MarketProduct[]> {
  if (!type || type === 'accessories') return [];

  const trimmed = normaliseText(text);
  if (trimmed.length < 2) return [];
  const setQuery = getSetFallbackQuery(text, type);
  if (setQuery.length < 2) return [];

  try {
    const sets = await fetchAllSets({ language: 'all' });
    return sets
      .filter((set) => setMatchesProductSearch(set, setQuery))
      .slice(0, limit)
      .map((set) => buildSetProductFallback(set, type));
  } catch (error) {
    console.log('Set catalogue product fallback failed', error);
    return [];
  }
}

function productDedupeKey(product: MarketProduct) {
  return [
    product.product_type,
    normaliseText(product.set_name ?? ''),
    normaliseText(product.name),
  ].join(':');
}

function mergeProductResults(
  primary: MarketProduct[],
  fallback: MarketProduct[],
  limit: number
) {
  const seen = new Set<string>();
  const merged: MarketProduct[] = [];
  for (const product of [...primary, ...fallback]) {
    const key = productDedupeKey(product);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(product);
    if (merged.length >= limit) break;
  }
  return merged;
}

const mapProductRow = (row: any): MarketProduct => ({
  id: row.id,
  product_type: row.product_type,
  name: row.name,
  set_name: row.set_name ?? null,
  language: row.language ?? null,
  release_year: row.release_year == null ? null : String(row.release_year),
  image_url: row.image_url ?? null,
  image_large_url: row.image_large_url ?? null,
  aliases: Array.isArray(row.aliases) ? row.aliases : [],
  search_text: row.search_text ?? '',
  source: row.source ?? null,
});

const shouldShowCatalogProduct = (product: MarketProduct) =>
  product.source !== 'user' && product.source !== 'local' && Boolean(product.set_name || product.image_url);

const mapSnapshotRow = (row: any): ProductPriceResult => ({
  low: row?.ebay_low == null ? null : Number(row.ebay_low),
  average: row?.ebay_average == null ? null : Number(row.ebay_average),
  high: row?.ebay_high == null ? null : Number(row.ebay_high),
  tcgLow: row?.tcg_low == null ? null : Number(row.tcg_low),
  tcgMid: row?.tcg_mid == null ? null : Number(row.tcg_mid),
  tcgMarket: row?.tcg_market == null ? null : Number(row.tcg_market),
  tcgProductId: row?.tcg_product_id == null ? null : Number(row.tcg_product_id),
  count: row?.sold_count == null ? null : Number(row.sold_count),
  query: row?.query ?? '',
  soldDataSource: row?.source ?? null,
});

const mergeSnapshotRows = (rows: any[]): ProductPriceResult => {
  const merged: ProductPriceResult = {
    low: null,
    average: null,
    high: null,
    tcgLow: null,
    tcgMid: null,
    tcgMarket: null,
    tcgProductId: null,
    count: null,
    query: '',
    soldDataSource: null,
  };

  for (const row of rows) {
    const snapshot = mapSnapshotRow(row);
    merged.low ??= snapshot.low;
    merged.average ??= snapshot.average;
    merged.high ??= snapshot.high;
    merged.tcgLow ??= snapshot.tcgLow;
    merged.tcgMid ??= snapshot.tcgMid;
    merged.tcgMarket ??= snapshot.tcgMarket;
    merged.tcgProductId ??= snapshot.tcgProductId;
    merged.count ??= snapshot.count;
    if (!merged.query && snapshot.query) merged.query = snapshot.query;
    if (!merged.soldDataSource && snapshot.soldDataSource) merged.soldDataSource = snapshot.soldDataSource;
  }

  return merged;
};

const buildLatestProductPriceMap = (snapshots: any[] = []) => {
  const rowsByProduct = new Map<string, any[]>();
  for (const snapshot of snapshots) {
    if (!snapshot.product_id) continue;
    if (!rowsByProduct.has(snapshot.product_id)) rowsByProduct.set(snapshot.product_id, []);
    rowsByProduct.get(snapshot.product_id)!.push(snapshot);
  }

  const latestMap = new Map<string, ProductPriceResult>();
  for (const [productId, rows] of rowsByProduct.entries()) {
    latestMap.set(productId, mergeSnapshotRows(rows));
  }

  return latestMap;
};

async function fetchProductSnapshots(ids: string[]) {
  const columnsWithTcg = 'product_id, ebay_low, ebay_average, ebay_high, tcg_low, tcg_mid, tcg_market, tcg_product_id, sold_count, query, source, snapshot_at';
  const columnsLegacy = 'product_id, ebay_low, ebay_average, ebay_high, sold_count, query, source, snapshot_at';
  let result: any = await supabase
    .from('market_product_price_snapshots')
    .select(columnsWithTcg)
    .in('product_id', ids)
    .order('snapshot_at', { ascending: false });

  if (result.error && String(result.error.message ?? '').includes('tcg_')) {
    result = await supabase
      .from('market_product_price_snapshots')
      .select(columnsLegacy)
      .in('product_id', ids)
      .order('snapshot_at', { ascending: false });
  }

  return result;
}

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

  const products = (data ?? []).map(mapProductRow).filter(shouldShowCatalogProduct);
  const ids = products.map((product) => product.id);
  if (!ids.length) {
    return getSetCatalogFallbackProducts(text, type, limit);
  }

  const { data: snapshots, error: snapshotError } = await fetchProductSnapshots(ids);

  if (snapshotError) {
    const fallback = await getSetCatalogFallbackProducts(text, type, Math.max(0, limit - products.length));
    return mergeProductResults(products, fallback, limit);
  }

  const latestMap = buildLatestProductPriceMap(snapshots ?? []);

  const pricedProducts = products.map((product) => ({ ...product, latest_price: latestMap.get(product.id) ?? null }));
  if (pricedProducts.length >= limit) return pricedProducts;

  const fallback = await getSetCatalogFallbackProducts(text, type, limit - pricedProducts.length);
  return mergeProductResults(pricedProducts, fallback, limit);
}

export async function listMarketProducts(
  type?: ProductLookupType,
  limit = 40
): Promise<MarketProduct[]> {
  let query = supabase
    .from('market_products')
    .select('*')
    .order('product_type')
    .order('name')
    .limit(limit);

  if (type) query = query.eq('product_type', type);

  const { data, error } = await query;
  if (error) {
    console.log('Market product catalog failed', error);
    return [];
  }

  const products = (data ?? []).map(mapProductRow).filter(shouldShowCatalogProduct);
  const ids = products.map((product) => product.id);
  if (!ids.length) return products;

  const { data: snapshots, error: snapshotError } = await fetchProductSnapshots(ids);

  if (snapshotError) return products;

  const latestMap = buildLatestProductPriceMap(snapshots ?? []);

  return products.map((product) => ({ ...product, latest_price: latestMap.get(product.id) ?? null }));
}

export async function getMarketProductById(productId: string): Promise<MarketProduct | null> {
  const id = productId.trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('market_products')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.log('Market product lookup failed', error);
    return null;
  }

  const product = mapProductRow(data);
  if (!shouldShowCatalogProduct(product)) return null;

  const latestPrice = await getLatestProductPrice(product.id);
  return { ...product, latest_price: latestPrice };
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
  const { data, error } = await fetchProductSnapshots([productId]);

  if (error || !data?.length) return null;
  return mergeSnapshotRows(data);
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
  const product = await ensureMarketProduct(name, type);
  const price = await fetchLiveProductPrice(name, type);
  if (product) await saveProductPriceSnapshot(product, price);
  return price;
}

async function fetchLiveProductPrice(name: string, type: ProductLookupType): Promise<ProductPriceResult> {
  if (!PRICE_API_URL) throw new Error('Missing price API URL');

  const query = buildProductQuery(name, type);
  const params = new URLSearchParams({
    q: query,
    productType: type === 'accessories' ? 'accessory' : 'sealed',
    productSubtype: type,
  });

  const response = await fetch(`${PRICE_API_URL.replace(/\/$/, '')}/api/price/ebay?${params.toString()}`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to fetch product price: ${response.status} ${text}`);
  }

  const data = await response.json();
  return {
    low: data.low ?? null,
    average: data.average ?? null,
    high: data.high ?? null,
    count: data.count ?? null,
    query: data.query ?? query,
    soldDataSource: data.soldDataSource ?? null,
  };
}

export async function refreshMarketProductPrice(product: MarketProduct): Promise<ProductPriceResult> {
  const price = await fetchLiveProductPrice(product.name, product.product_type);
  await saveProductPriceSnapshot(product, price);
  return price;
}

export async function getProductPriceWithFallback(
  name: string,
  type: ProductLookupType
): Promise<ProductPriceResult | null> {
  const matchingProducts = await searchMarketProducts(name, type, 1);
  const product = matchingProducts[0] ?? await ensureMarketProduct(name, type);
  const cached = product ? await getLatestProductPrice(product.id) : null;
  if (cached?.average != null) return cached;

  try {
    return product ? await refreshMarketProductPrice(product) : await fetchProductPrice(name, type);
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
    tcg_price: product.latest_price?.tcgMarket ?? product.latest_price?.tcgMid ?? product.latest_price?.tcgLow ?? null,
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
