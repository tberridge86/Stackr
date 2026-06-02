import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchEbayPrice } from '../lib/ebay';
import { fetchPokeTraceCardPrice } from '../lib/pricing';

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, finishing job...');
});

// ===============================
// TYPES
// ===============================

type EbayResponse = {
  low?: number | string | null;
  average?: number | string | null;
  high?: number | string | null;
  count?: number | string | null;
  rawCount?: number | string | null;
  query?: string | null;
  soldDataSource?: string | null;
};

type ProductRow = {
  id: string;
  product_type: string;
  name: string;
  set_name: string | null;
  aliases?: string[] | null;
};

// ===============================
// CONFIG
// ===============================

const JOB_NAME = 'daily-market-snapshot';

const EBAY_DELAY_MS = 800;
const EBAY_RETRY_DELAY_MS = 2000;
const EBAY_RATE_LIMIT_DELAY_MS = 10000;

const TCG_BATCH_SIZE = 30;
const TCG_DELAY_MS = 2000;
const TCG_RETRY_DELAY_MS = 5000;
const TCG_MAX_RETRIES = 3;
const USD_TO_GBP = Number(process.env.USD_TO_GBP ?? 0.79);

// ===============================
// SUPABASE
// ===============================

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ===============================
// UTILS
// ===============================

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toInteger(value: number | string | null | undefined): number {
  const parsed = toNumber(value);
  return parsed == null ? 0 : Math.round(parsed);
}

function toGbpFromUsd(value: number | null): number | null {
  return typeof value === 'number' ? Math.round(value * USD_TO_GBP * 100) / 100 : null;
}

function todayMidnightUTC(): string {
  return new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';
}

function nextMidnightUTC(snapshotDate: string): string {
  const date = new Date(snapshotDate);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

// ===============================
// EBAY QUERY BUILDER
// ===============================

function buildEbayQuery(card: any): string {
  let number: string | null = null;
  if (card.card_number && card.set_total) {
    number = `${card.card_number}/${card.set_total}`;
  } else if (card.card_number) {
    number = String(card.card_number);
  }
  const parts = [card.card_name, number, card.set_name, 'pokemon card'].filter(Boolean);
  return parts.join(' ');
}

function buildEbayPriceInput(card: any) {
  return {
    cardId: card.api_card_id || card.card_id,
    name: card.card_name || card.api_card_id || card.card_id,
    setName: card.set_name ?? undefined,
    number: card.card_number ?? undefined,
    setTotal: card.set_total ?? undefined,
  };
}

function productTypeLabel(productType: string): string {
  switch (productType) {
    case 'booster_pack': return 'pokemon booster pack sealed';
    case 'sleeved_booster_pack': return 'pokemon sleeved booster pack sealed';
    case 'booster_bundle': return 'pokemon booster bundle sealed';
    case 'booster_box': return 'pokemon booster box sealed';
    case 'elite_trainer_box': return 'pokemon elite trainer box sealed';
    case 'collection_bundle': return 'pokemon collection box sealed';
    case 'accessories': return 'pokemon card accessories';
    case 'sealed_product':
    default:
      return 'pokemon sealed product';
  }
}

function buildProductEbayQuery(product: ProductRow): string {
  return `${product.name} ${productTypeLabel(product.product_type)}`.trim();
}

// ===============================
// TCG PRICE HELPERS
// ===============================

function getPriceFromPokemonCard(card: any): number | null {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;
  const preferred = ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal'];
  for (const key of preferred) {
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return toGbpFromUsd(value);
  }
  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return toGbpFromUsd(value);
  }
  return null;
}

// ===============================
// CRON LOGGING
// ===============================

async function logCron(jobName: string, status: 'started' | 'success' | 'failed', details?: string) {
  const { error } = await supabase.from('cron_logs').insert({
    job_name: jobName,
    status,
    details: details ?? null,
    ran_at: new Date().toISOString(),
  });
  if (error) console.log('⚠️ Failed to write cron log:', error);
}

// ===============================
// TCG FETCHING
// ===============================

async function fetchTcgBatch(batch: string[], batchNumber: number): Promise<Record<string, number>> {
  const q = batch.map((id) => `id:${id}`).join(' OR ');
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=${batch.length}`;

  for (let attempt = 1; attempt <= TCG_MAX_RETRIES; attempt += 1) {
    try {
      console.log(`🔍 TCG batch ${batchNumber}, attempt ${attempt} (${batch.length} cards)`);
      const headers: Record<string, string> = {};
      if (process.env.POKEMON_TCG_API_KEY) {
        headers['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;
      }
      const response = await fetch(url, { headers });
      const text = await response.text();
      if (!response.ok) {
        console.log(`⚠️ TCG HTTP ${response.status}: ${text.slice(0, 120)}`);
        await delay(TCG_RETRY_DELAY_MS * attempt);
        continue;
      }
      if (text.toLowerCase().includes('throttled')) {
        console.log('⚠️ TCG throttled — waiting before retry...');
        await delay(TCG_RETRY_DELAY_MS * attempt);
        continue;
      }
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        console.log(`⚠️ TCG returned non-JSON: ${text.slice(0, 120)}`);
        await delay(TCG_RETRY_DELAY_MS * attempt);
        continue;
      }
      const priceMap: Record<string, number> = {};
      for (const card of json?.data ?? []) {
        const price = getPriceFromPokemonCard(card);
        if (typeof price === 'number') priceMap[card.id] = price;
      }
      return priceMap;
    } catch (error) {
      console.log(`⚠️ TCG batch ${batchNumber} error:`, error);
      await delay(TCG_RETRY_DELAY_MS * attempt);
    }
  }
  console.log(`🚫 TCG batch ${batchNumber} failed after all retries`);
  return {};
}

async function fetchTcgPricesInBatches(cardIds: string[]): Promise<Record<string, number>> {
  const finalPriceMap: Record<string, number> = {};
  for (let i = 0; i < cardIds.length; i += TCG_BATCH_SIZE) {
    const batch = cardIds.slice(i, i + TCG_BATCH_SIZE);
    const batchNumber = Math.floor(i / TCG_BATCH_SIZE) + 1;
    const batchMap = await fetchTcgBatch(batch, batchNumber);
    Object.assign(finalPriceMap, batchMap);
    if (i + TCG_BATCH_SIZE < cardIds.length) await delay(TCG_DELAY_MS);
  }
  return finalPriceMap;
}

async function fetchCachedTcgPrices(cardIds: string[]): Promise<Record<string, number>> {
  if (!cardIds.length) return {};

  const { data, error } = await supabase
    .from('market_price_snapshots')
    .select('card_id, tcg_mid, tcg_low, snapshot_at')
    .is('user_id', null)
    .in('card_id', cardIds)
    .not('tcg_mid', 'is', null)
    .order('snapshot_at', { ascending: false });

  if (error) {
    console.log('⚠️ Failed to fetch cached TCGCSV prices:', error);
    return {};
  }

  const prices: Record<string, number> = {};
  for (const row of data ?? []) {
    if (prices[row.card_id] == null) {
      prices[row.card_id] = toNumber(row.tcg_mid ?? row.tcg_low) ?? 0;
    }
  }

  return Object.fromEntries(Object.entries(prices).filter(([, value]) => value > 0));
}

async function saveMarketPriceSnapshotByDay(snapshot: any, snapshotDate: string) {
  const nextDay = nextMidnightUTC(snapshotDate);
  const updatePayload = { ...snapshot };
  delete updatePayload.user_id;
  delete updatePayload.card_id;
  delete updatePayload.set_id;

  const updateQuery = supabase
    .from('market_price_snapshots')
    .update(updatePayload)
    .eq('card_id', snapshot.card_id)
    .gte('snapshot_at', snapshotDate)
    .lt('snapshot_at', nextDay);

  const { data: updated, error: updateError } = snapshot.set_id == null
    ? await updateQuery.is('set_id', null).select('card_id').limit(1)
    : await updateQuery.eq('set_id', snapshot.set_id).select('card_id').limit(1);

  if (updateError) return updateError;
  if (updated && updated.length > 0) return null;

  const { error: insertError } = await supabase
    .from('market_price_snapshots')
    .insert(snapshot);

  return insertError;
}

// ===============================
// EBAY FETCHING
// ===============================

async function fetchEbayWithRetry(ebayQuery: string, displayName: string, card?: any): Promise<EbayResponse> {
  const input = card ? buildEbayPriceInput(card) : ebayQuery;
  try {
    console.log(`🟡 eBay: "${ebayQuery}"`);
    const result = await fetchEbayPrice(input);
    if ((result as any)?.status === 429) {
      console.log(`⚠️ eBay rate limited — backing off ${EBAY_RATE_LIMIT_DELAY_MS}ms`);
      await delay(EBAY_RATE_LIMIT_DELAY_MS);
      return await fetchEbayPrice(input);
    }
    return result;
  } catch {
    console.log(`⚠️ eBay fetch failed for "${displayName}" — retrying...`);
    await delay(EBAY_RETRY_DELAY_MS);
    try {
      return await fetchEbayPrice(input);
    } catch (secondError) {
      console.log(`🚫 eBay final fail for "${displayName}":`, secondError);
      return { low: null, average: null, high: null, count: 0 };
    }
  }
}

async function fetchProductEbayWithRetry(product: ProductRow): Promise<EbayResponse> {
  const ebayQuery = buildProductEbayQuery(product);
  const baseUrl = process.env.PRICE_API_URL || process.env.EXPO_PUBLIC_PRICE_API_URL;
  if (!baseUrl) throw new Error('Missing PRICE_API_URL');

  const params = new URLSearchParams({
    q: ebayQuery,
    productType: product.product_type === 'accessories' ? 'accessory' : 'sealed',
    productSubtype: product.product_type,
  });
  const url = `${baseUrl.replace(/\/$/, '')}/api/price/ebay?${params.toString()}`;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      console.log(`🟡 Product eBay: "${ebayQuery}"`);
      const response = await fetch(url);
      const text = await response.text();
      if (response.status === 429) {
        console.log(`⚠️ Product eBay rate limited — backing off ${EBAY_RATE_LIMIT_DELAY_MS}ms`);
        await delay(EBAY_RATE_LIMIT_DELAY_MS);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
      return JSON.parse(text);
    } catch (error) {
      if (attempt === 2) {
        console.log(`🚫 Product eBay final fail for "${product.name}":`, error);
        return { low: null, average: null, high: null, count: 0, query: ebayQuery };
      }
      console.log(`⚠️ Product eBay fetch failed for "${product.name}" — retrying...`);
      await delay(EBAY_RETRY_DELAY_MS);
    }
  }

  return { low: null, average: null, high: null, count: 0, query: ebayQuery };
}

async function fetchPokeTraceWithRetry(card: any) {
  const identifier = String(card.card_name || card.api_card_id || card.card_id || '').trim();
  if (!identifier) return null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      console.log(`PokeTrace: "${identifier}"`);
      return await fetchPokeTraceCardPrice({
        identifier,
        setName: card.set_name ?? null,
        number: card.card_number ?? null,
        market: 'US',
      });
    } catch (error) {
      if (attempt === 2) {
        console.log(`PokeTrace final fail for "${identifier}":`, error);
        return null;
      }
      console.log(`PokeTrace fetch failed for "${identifier}" - retrying...`);
      await delay(TCG_RETRY_DELAY_MS);
    }
  }

  return null;
}

// ===============================
// PROCESS ONE USER
// ===============================

async function processUser(userId: string, snapshotDate: string) {
  console.log(`\n👤 Processing user: ${userId}`);

  // Get all owned cards for this user
  const { data: cards, error } = await supabase
    .from('binder_cards')
    .select('card_id, set_id, api_card_id, api_set_id, card_name, card_number, set_name, set_total')
    .eq('owned', true)
    .in('binder_id',
      (await supabase.from('binders').select('id').eq('user_id', userId)).data?.map((b: any) => b.id) ?? []
    );

  if (error) {
    console.log(`❌ Failed to fetch cards for user ${userId}:`, error);
    return { saved: 0, missingTcg: 0, ebayFound: 0, ebayFail: 0, upsertFail: 0 };
  }

  if (!cards?.length) {
    console.log(`⚠️ No owned cards for user ${userId}`);
    return { saved: 0, missingTcg: 0, ebayFound: 0, ebayFail: 0, upsertFail: 0 };
  }

  console.log(`📦 ${cards.length} owned card rows`);

  // Deduplicate by api_card_id
  const uniqueCards = Array.from(
    new Map(cards.map((card) => [card.api_card_id || card.card_id, card])).values()
  );

  console.log(`🔢 ${uniqueCards.length} unique cards after deduplication`);

  const cardIds = uniqueCards.map((card) => card.api_card_id || card.card_id).filter(Boolean);
  const pokemonTcgFallbackMap = process.env.ENABLE_POKEMONTCG_CARD_PRICE_FALLBACK === 'true'
    ? await fetchTcgPricesInBatches(cardIds)
    : {};
  const cachedTcgMap = await fetchCachedTcgPrices(
    uniqueCards.map((card) => card.card_id).filter(Boolean)
  );

  let saved = 0, missingTcg = 0, ebayFound = 0, ebayFail = 0, upsertFail = 0;

  for (let index = 0; index < uniqueCards.length; index += 1) {
    const card = uniqueCards[index];
    const lookupId = card.api_card_id || card.card_id;
    const displayName = card.card_name || lookupId;
    const pokeTrace = await fetchPokeTraceWithRetry(card);
    const tcgPrice =
      pokeTrace?.tcg_mid ??
      pokeTrace?.tcg_low ??
      pokemonTcgFallbackMap[lookupId] ??
      cachedTcgMap[card.card_id];

    console.log(`\n📍 [${index + 1}/${uniqueCards.length}] ${displayName}`);

    if (typeof tcgPrice !== 'number') {
      missingTcg += 1;
      console.log(`⚠️ No TCG price for ${displayName}`);
    }

    const ebayQuery = buildEbayQuery(card);
    const ebay = pokeTrace?.ebay_average != null
      ? {
          low: pokeTrace.ebay_low,
          average: pokeTrace.ebay_average,
          high: pokeTrace.ebay_high,
          count: pokeTrace.ebay_count,
          soldDataSource: 'poketrace',
        }
      : await fetchEbayWithRetry(ebayQuery, displayName, card);
    const ebayAverage = toNumber(ebay.average);

    if (ebayAverage !== null) { ebayFound += 1; } else { ebayFail += 1; }

    const snapshot = {
      user_id: userId,
      card_id: card.card_id,
      set_id: card.set_id,
      tcg_low: null,
      tcg_mid: typeof tcgPrice === 'number' ? tcgPrice : null,
      cardmarket_trend: pokeTrace?.cardmarket_trend ?? null,
      ebay_low: toNumber(ebay.low),
      ebay_average: ebayAverage,
      ebay_high: toNumber(ebay.high),
      ebay_count: toInteger(ebay.count ?? ebay.rawCount),
      snapshot_at: snapshotDate,
    };

    const upsertError = await saveMarketPriceSnapshotByDay(snapshot, snapshotDate);

    if (upsertError) {
      upsertFail += 1;
      console.error(`❌ Upsert failed for ${displayName}:`, upsertError);
    } else {
      saved += 1;
      console.log(`✅ ${displayName} | TCG: ${snapshot.tcg_mid ?? 'none'} | eBay avg: ${snapshot.ebay_average ?? 'none'}`);
    }

    await delay(EBAY_DELAY_MS);
  }

  return { saved, missingTcg, ebayFound, ebayFail, upsertFail };
}

// ===============================
// PROCESS PRODUCT CATALOG
// ===============================

async function processMarketProducts() {
  console.log('\n📦 Processing market products');

  const { data: products, error } = await supabase
    .from('market_products')
    .select('id, product_type, name, set_name, aliases')
    .order('product_type')
    .order('name');

  if (error) {
    console.log('❌ Failed to fetch market products:', error);
    return { saved: 0, priced: 0, failed: 0 };
  }

  if (!products?.length) {
    console.log('⚠️ No market products found');
    return { saved: 0, priced: 0, failed: 0 };
  }

  let saved = 0;
  let priced = 0;
  let failed = 0;

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index] as ProductRow;
    console.log(`\n📦 Product [${index + 1}/${products.length}] ${product.name}`);

    const ebay = await fetchProductEbayWithRetry(product);
    const average = toNumber(ebay.average);
    if (average !== null) priced += 1; else failed += 1;

    const snapshot = {
      product_id: product.id,
      product_type: product.product_type,
      product_name: product.name,
      ebay_low: toNumber(ebay.low),
      ebay_average: average,
      ebay_high: toNumber(ebay.high),
      sold_count: toInteger(ebay.count ?? ebay.rawCount),
      query: ebay.query ?? buildProductEbayQuery(product),
      source: ebay.soldDataSource ?? null,
      snapshot_at: new Date().toISOString(),
      created_by: null,
    };

    const { error: insertError } = await supabase
      .from('market_product_price_snapshots')
      .insert(snapshot);

    if (insertError) {
      failed += 1;
      console.error(`❌ Product snapshot insert failed for ${product.name}:`, insertError);
    } else {
      saved += 1;
      console.log(`✅ ${product.name} | eBay avg: ${snapshot.ebay_average ?? 'none'} | sold: ${snapshot.sold_count}`);
    }

    await delay(EBAY_DELAY_MS);
  }

  return { saved, priced, failed };
}

// ===============================
// MAIN JOB
// ===============================

async function runDailyMarketSnapshot() {
  console.log('🚀 Daily market snapshot started');
  await logCron(JOB_NAME, 'started');

  const snapshotDate = todayMidnightUTC();
  console.log(`📅 Snapshot date: ${snapshotDate}`);

  // Get all unique user IDs who have owned cards
  const { data: binders, error: binderError } = await supabase
    .from('binders')
    .select('user_id')
    .not('user_id', 'is', null);

  if (binderError) throw binderError;

  const userIds = [...new Set((binders ?? []).map((b: any) => b.user_id))];
  console.log(`👥 Found ${userIds.length} users to process`);

  let totalSaved = 0, totalMissingTcg = 0, totalEbayFound = 0, totalEbayFail = 0, totalUpsertFail = 0;

  for (const userId of userIds) {
    const result = await processUser(userId, snapshotDate);
    totalSaved += result.saved;
    totalMissingTcg += result.missingTcg;
    totalEbayFound += result.ebayFound;
    totalEbayFail += result.ebayFail;
    totalUpsertFail += result.upsertFail;
  }

  console.log('\n📊 Snapshot complete');
  console.log(`👥 Users processed: ${userIds.length}`);
  console.log(`💾 Saved/updated:   ${totalSaved}`);
  console.log(`⚠️  Missing TCG:    ${totalMissingTcg}`);
  console.log(`🟡 eBay found:      ${totalEbayFound}`);
  console.log(`🚫 eBay failed:     ${totalEbayFail}`);
  console.log(`❌ Upsert fails:    ${totalUpsertFail}`);

  const productResult = await processMarketProducts();
  console.log(`📦 Product snapshots saved: ${productResult.saved}`);
  console.log(`📦 Product prices found:    ${productResult.priced}`);
  console.log(`📦 Product price failures:  ${productResult.failed}`);

  const { error: updateError } = await supabase.rpc('update_binder_card_prices');
  if (updateError) {
    console.error('⚠️ update_binder_card_prices RPC failed:', updateError);
  } else {
    console.log('✅ Binder card prices updated via RPC');
  }

  await logCron(JOB_NAME, 'success',
    `Users: ${userIds.length}. Saved: ${totalSaved}. Missing TCG: ${totalMissingTcg}. eBay found: ${totalEbayFound}. eBay failed: ${totalEbayFail}. Upsert failed: ${totalUpsertFail}. Products saved: ${productResult.saved}. Products priced: ${productResult.priced}. Product failures: ${productResult.failed}.`
  );
}

// ===============================
// ENTRY POINT
// ===============================

async function main() {
  try {
    await runDailyMarketSnapshot();
    console.log('🎉 Job complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Daily snapshot job failed:', error);
    await logCron(JOB_NAME, 'failed', error?.message ?? 'Unknown error');
    process.exit(1);
  }
}

main();
