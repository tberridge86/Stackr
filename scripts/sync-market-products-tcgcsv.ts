import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchTcgcsvUiProductPricesForSet } from '../lib/pricing';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const USD_TO_GBP = Number(process.env.USD_TO_GBP ?? 0.79);
const SET_DELAY_MS = 350;
const WRITE = process.argv.includes('--write');

type MarketProductRow = {
  id: string;
  product_type: string;
  name: string;
  set_name: string | null;
  aliases: string[] | null;
  image_url: string | null;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/pokemon|tcg|scarlet|violet|sv/gi, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bex\b/g, ' ex ')
    .trim();
}

function toGbp(value: number | null | undefined) {
  return typeof value === 'number' ? Math.round(value * USD_TO_GBP * 100) / 100 : null;
}

function getLargeImageUrl(imageUrl: string | null) {
  if (!imageUrl) return null;
  return imageUrl.replace(/_200w(\.[a-z]+)$/i, '_400w$1');
}

function productTypeHints(productType: string) {
  switch (productType) {
    case 'elite_trainer_box': return ['elite trainer box', 'etb'];
    case 'booster_box': return ['booster box'];
    case 'booster_bundle': return ['booster bundle'];
    case 'booster_pack': return ['booster pack'];
    case 'sleeved_booster_pack': return ['sleeved booster'];
    case 'collection_bundle': return ['collection', 'premium collection', 'ultra premium'];
    case 'case': return ['case'];
    case 'accessories': return ['sleeves', 'binder', 'playmat', 'deck box'];
    default: return [];
  }
}

function scoreMatch(product: MarketProductRow, candidate: { name: string }) {
  const productName = normalize(product.name);
  const candidateName = normalize(candidate.name);
  const aliases = (product.aliases ?? []).map(normalize);
  if (/\bcase\b/.test(candidateName) && product.product_type !== 'case' && !/\bcase\b/.test(productName)) {
    return -1000;
  }
  let score = 0;

  if (candidateName === productName) score += 100;
  if (candidateName.includes(productName) || productName.includes(candidateName)) score += 65;
  for (const alias of aliases) {
    if (alias && (candidateName.includes(alias) || alias.includes(candidateName))) score += 45;
  }
  for (const hint of productTypeHints(product.product_type)) {
    if (candidateName.includes(normalize(hint))) score += 12;
  }
  if (/\bcode card\b/.test(candidateName)) score -= 100;

  return score;
}

function summarize(variants: { lowPrice: number | null; midPrice: number | null; marketPrice: number | null }[]) {
  const saleableVariants = variants.filter((v: any) => !/\bcase\b/i.test(String(v.subTypeName ?? '')));
  const nextVariants = saleableVariants.length ? saleableVariants : variants;
  const lows = nextVariants.map((v) => v.lowPrice).filter((v): v is number => typeof v === 'number');
  const mids = nextVariants.map((v) => v.midPrice).filter((v): v is number => typeof v === 'number');
  const markets = nextVariants.map((v) => v.marketPrice).filter((v): v is number => typeof v === 'number');
  const avg = (arr: number[]) => arr.length ? arr.reduce((sum, value) => sum + value, 0) / arr.length : null;
  return {
    low: toGbp(lows.length ? Math.min(...lows) : null),
    mid: toGbp(avg(mids)),
    market: toGbp(avg(markets)),
  };
}

async function assertTcgColumnsExist() {
  const { error } = await supabase
    .from('market_product_price_snapshots')
    .select('tcg_low, tcg_mid, tcg_market, tcg_product_id')
    .limit(1);

  if (error) {
    throw new Error(`Missing product TCGCSV columns. Apply migration 20260519124500_market_product_tcgcsv_prices.sql first. ${error.message}`);
  }
}

async function main() {
  await assertTcgColumnsExist();
  console.log(WRITE ? 'Write mode: product images and TCGCSV snapshots will be saved.' : 'Dry run: pass --write to save product images and TCGCSV snapshots.');

  const { data, error } = await supabase
    .from('market_products')
    .select('id, product_type, name, set_name, aliases, image_url')
    .order('set_name')
    .order('name');

  if (error) throw error;
  const products = (data ?? []) as MarketProductRow[];
  const bySet = new Map<string, MarketProductRow[]>();
  for (const product of products) {
    if (!product.set_name) continue;
    if (!bySet.has(product.set_name)) bySet.set(product.set_name, []);
    bySet.get(product.set_name)!.push(product);
  }

  let matched = 0;
  let updatedImages = 0;
  let insertedSnapshots = 0;
  let noMatch = 0;

  for (const [setName, setProducts] of bySet.entries()) {
    console.log(`\nProcessing ${setName} (${setProducts.length} products)`);
    const tcgProducts = await fetchTcgcsvUiProductPricesForSet(setName);

    for (const product of setProducts) {
      const best = tcgProducts
        .map((candidate) => ({ candidate, score: scoreMatch(product, candidate) }))
        .sort((a, b) => b.score - a.score)[0];

      if (!best || best.score < 40) {
        noMatch += 1;
        console.log(`No match: ${product.name}`);
        continue;
      }

      matched += 1;
      const summary = summarize(best.candidate.variants);

      if (WRITE && best.candidate.imageUrl && !product.image_url) {
        const { error: imageError } = await supabase
          .from('market_products')
          .update({
            image_url: best.candidate.imageUrl,
            image_large_url: getLargeImageUrl(best.candidate.imageUrl),
            updated_at: new Date().toISOString(),
          })
          .eq('id', product.id);
        if (!imageError) updatedImages += 1;
        else console.log(`Image update failed for ${product.name}: ${imageError.message}`);
      }

      if (WRITE) {
        const { error: insertError } = await supabase
          .from('market_product_price_snapshots')
          .insert({
            product_id: product.id,
            product_type: product.product_type,
            product_name: product.name,
            tcg_low: summary.low,
            tcg_mid: summary.mid,
            tcg_market: summary.market,
            tcg_product_id: best.candidate.productId,
            query: best.candidate.name,
            source: 'tcgcsv',
            created_by: null,
          });

        if (!insertError) insertedSnapshots += 1;
        else console.log(`Snapshot insert failed for ${product.name}: ${insertError.message}`);
      }

      console.log(`Matched: ${product.name} -> ${best.candidate.name} (${best.score}) TCG ${summary.market ?? summary.mid ?? summary.low ?? 'none'}`);
    }

    await delay(SET_DELAY_MS);
  }

  console.log(`\nDone. Matched ${matched}, images ${updatedImages}, snapshots ${insertedSnapshots}, no match ${noMatch}.`);
  if (!WRITE) console.log('No database rows were changed.');
}

main().catch((error) => {
  console.error('Market product TCGCSV sync failed:', error);
  process.exit(1);
});
