import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const TCGCSV_BASE_URL = 'https://tcgcsv.com';
const POKEMON_CATEGORY_ID = 3;
const USD_TO_GBP = Number(process.env.USD_TO_GBP ?? 0.79);
const GROUP_DELAY_MS = Number(process.env.TCGCSV_GROUP_DELAY_MS ?? 250);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type TcgcsvGroup = {
  groupId: number;
  name: string;
  categoryId: number;
};

type TcgcsvProduct = {
  productId: number;
  name: string;
  groupId: number;
  imageUrl?: string | null;
  extendedData?: { name?: string; value?: string }[];
};

type TcgcsvPrice = {
  productId: number;
  lowPrice?: number | null;
  midPrice?: number | null;
  marketPrice?: number | null;
};

type MarketProductRow = {
  id: string;
  product_type: string;
  name: string;
  set_name: string | null;
  aliases: string[] | null;
  image_url: string | null;
};

type ProductLookupType =
  | 'booster_pack'
  | 'sleeved_booster_pack'
  | 'booster_bundle'
  | 'booster_box'
  | 'elite_trainer_box'
  | 'collection_bundle'
  | 'accessories';

const WRITE = process.argv.includes('--write');
const LIMIT = (() => {
  const index = process.argv.indexOf('--limit');
  return index >= 0 ? Number(process.argv[index + 1]) : null;
})();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'PocketVault/1.0.0' },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TCGCSV request failed ${response.status}: ${text.slice(0, 160)}`);
  }
  return response.json() as Promise<T>;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\bpokemon\b|\btcg\b|\bsv\b|\bscarlet\b|\bviolet\b/gi, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value: string) {
  return normalize(value).replace(/\s+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100);
}

function cleanSetName(groupName: string) {
  return groupName.replace(/^[A-Z0-9]+:\s*/i, '').trim();
}

function getLargeImageUrl(imageUrl: string | null) {
  if (!imageUrl) return null;
  return imageUrl.replace(/_200w(\.[a-z]+)$/i, '_400w$1');
}

function getExtendedDataValue(product: TcgcsvProduct, key: string): string | null {
  const entries = Array.isArray(product.extendedData) ? product.extendedData : [];
  const match = entries.find((entry) => String(entry?.name ?? '').toLowerCase() === key.toLowerCase());
  const value = match?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function classifyProduct(name: string): ProductLookupType | null {
  const lower = name.toLowerCase();
  if (lower.includes('code card')) return null;
  if (/\bcase\b/.test(lower)) return null;
  if (lower.includes('elite trainer box') || /\betb\b/.test(lower)) return 'elite_trainer_box';
  if (lower.includes('booster box')) return 'booster_box';
  if (lower.includes('booster bundle')) return 'booster_bundle';
  if (lower.includes('sleeved booster')) return 'sleeved_booster_pack';
  if (lower.includes('booster pack')) return 'booster_pack';
  if (lower.includes('collection') || lower.includes('premium box') || lower.includes('premium collection')) return 'collection_bundle';
  if (lower.includes('binder') || lower.includes('sleeves') || lower.includes('playmat') || lower.includes('deck box')) return 'accessories';
  return null;
}

function isDisplayableMarketProduct(product: TcgcsvProduct) {
  if (getExtendedDataValue(product, 'Number') || getExtendedDataValue(product, 'Rarity')) return false;
  return classifyProduct(product.name) != null;
}

function buildSearchText(product: { name: string; productType: ProductLookupType; setName: string; aliases: string[] }) {
  return [
    product.name,
    product.productType.replace(/_/g, ' '),
    product.setName,
    ...product.aliases,
  ].map(normalize).filter(Boolean).join(' ');
}

function buildAliases(productName: string, setName: string, productType: ProductLookupType) {
  const aliases = new Set<string>();
  const set = setName.replace(/^Scarlet & Violet\s+/i, '').trim();
  aliases.add(productName);
  aliases.add(`${set} ${productType.replace(/_/g, ' ')}`);
  if (productType === 'elite_trainer_box') aliases.add(`${set} etb`);
  if (productType === 'booster_box') aliases.add(`${set} booster display`);
  if (productType === 'booster_pack') aliases.add(`${set} loose pack`);
  if (productType === 'sleeved_booster_pack') aliases.add(`${set} sleeved pack`);
  return [...aliases].filter((alias) => alias.trim() && normalize(alias) !== normalize(productName));
}

function toGbp(value: number | null | undefined) {
  return typeof value === 'number' ? Math.round(value * USD_TO_GBP * 100) / 100 : null;
}

function summarize(prices: TcgcsvPrice[]) {
  const lows = prices.map((price) => price.lowPrice).filter((value): value is number => typeof value === 'number');
  const mids = prices.map((price) => price.midPrice).filter((value): value is number => typeof value === 'number');
  const markets = prices.map((price) => price.marketPrice).filter((value): value is number => typeof value === 'number');
  const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    low: toGbp(lows.length ? Math.min(...lows) : null),
    mid: toGbp(avg(mids)),
    market: toGbp(avg(markets)),
  };
}

function findExistingProduct(
  existingProducts: MarketProductRow[],
  productName: string,
  productType: ProductLookupType,
  setName: string
) {
  const productNorm = normalize(productName);
  const setNorm = normalize(setName);
  return existingProducts.find((existing) => (
    existing.product_type === productType &&
    normalize(existing.name) === productNorm &&
    (!existing.set_name || normalize(existing.set_name) === setNorm)
  )) ?? null;
}

async function main() {
  console.log(WRITE ? 'Write mode: discovered products will be saved.' : 'Dry run: pass --write to save discovered products.');

  const [{ data: existingProducts, error: existingError }, groupsJson] = await Promise.all([
    supabase.from('market_products').select('id, product_type, name, set_name, aliases, image_url'),
    fetchJson<{ results?: TcgcsvGroup[] }>(`${TCGCSV_BASE_URL}/tcgplayer/3/groups`),
  ]);
  if (existingError) throw existingError;

  const groups = (groupsJson.results ?? [])
    .filter((group) => group.categoryId === POKEMON_CATEGORY_ID)
    .slice(0, LIMIT ?? undefined);

  let discovered = 0;
  let upserted = 0;
  let snapshots = 0;
  let skipped = 0;

  for (const group of groups) {
    const setName = cleanSetName(group.name);
    try {
      const [productsJson, pricesJson] = await Promise.all([
        fetchJson<{ results?: TcgcsvProduct[] }>(`${TCGCSV_BASE_URL}/tcgplayer/3/${group.groupId}/products`),
        fetchJson<{ results?: TcgcsvPrice[] }>(`${TCGCSV_BASE_URL}/tcgplayer/3/${group.groupId}/prices`),
      ]);

      const pricesByProductId = new Map<number, TcgcsvPrice[]>();
      for (const price of pricesJson.results ?? []) {
        if (!pricesByProductId.has(price.productId)) pricesByProductId.set(price.productId, []);
        pricesByProductId.get(price.productId)!.push(price);
      }

      const products = (productsJson.results ?? []).filter(isDisplayableMarketProduct);
      if (products.length) console.log(`${setName}: ${products.length} products`);

      for (const product of products) {
        const productType = classifyProduct(product.name);
        const productPrices = pricesByProductId.get(product.productId) ?? [];
        if (!productType || !productPrices.length) {
          skipped += 1;
          continue;
        }

        discovered += 1;
        const existing = findExistingProduct(existingProducts ?? [], product.name, productType, setName);
        const id = existing?.id ?? `product:${productType}:${slugify(`${setName} ${product.name}`)}`;
        const aliases = buildAliases(product.name, setName, productType);
        const summary = summarize(productPrices);

        if (WRITE) {
          const { error: upsertError } = await supabase.from('market_products').upsert({
            id,
            product_type: productType,
            name: product.name,
            set_name: setName,
            aliases,
            search_text: buildSearchText({ name: product.name, productType, setName, aliases }),
            image_url: product.imageUrl ?? existing?.image_url ?? null,
            image_large_url: getLargeImageUrl(product.imageUrl ?? null),
            source: 'tcgcsv',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
          if (upsertError) throw upsertError;
          upserted += 1;

          const { error: snapshotError } = await supabase.from('market_product_price_snapshots').insert({
            product_id: id,
            product_type: productType,
            product_name: product.name,
            tcg_low: summary.low,
            tcg_mid: summary.mid,
            tcg_market: summary.market,
            tcg_product_id: product.productId,
            query: product.name,
            source: 'tcgcsv',
            created_by: null,
          });
          if (snapshotError) throw snapshotError;
          snapshots += 1;
        }
      }
    } catch (error) {
      skipped += 1;
      console.log(`Skipped ${setName}:`, error);
    }

    await delay(GROUP_DELAY_MS);
  }

  console.log(`Done. Groups ${groups.length}, discovered ${discovered}, upserted ${upserted}, snapshots ${snapshots}, skipped ${skipped}.`);
  if (!WRITE) console.log('No database rows were changed.');
}

main().catch((error) => {
  console.error('TCGCSV product discovery failed:', error);
  process.exit(1);
});
