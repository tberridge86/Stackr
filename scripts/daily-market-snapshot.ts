import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchEbayPrice } from '../lib/ebay';

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
};

// ===============================
// CONFIG
// ===============================

const JOB_NAME = 'daily-market-snapshot';

const EBAY_DELAY_MS = 800;
const EBAY_RETRY_DELAY_MS = 2000;
const EBAY_RATE_LIMIT_DELAY_MS = 10000; // back off 10s if throttled

const TCG_BATCH_SIZE = 30;
const TCG_DELAY_MS = 2000;
const TCG_RETRY_DELAY_MS = 5000;
const TCG_MAX_RETRIES = 3;

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

// Fixed: removed trailing pipe from type
function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toInteger(value: number | string | null | undefined): number {
  const parsed = toNumber(value);
  return parsed == null ? 0 : Math.round(parsed);
}

// ===============================
// EBAY QUERY BUILDER
// ===============================

function buildEbayQuery(card: any): string {
  // Format card number properly
  // Prefer "4/102" format — only use bare number as last resort
  let number: string | null = null;

  if (card.card_number && card.set_total) {
    // Best case: we have both number and total
    number = `${card.card_number}/${card.set_total}`;
  } else if (card.card_number) {
    // Fallback: just the number — less specific but better than nothing
    number = String(card.card_number);
  }

  const parts = [
    card.card_name,
    number,
    card.set_name,
    'pokemon card',
  ].filter(Boolean);

  return parts.join(' ');
}

// ===============================
// TCG PRICE HELPERS
// ===============================

function getPriceFromPokemonCard(card: any): number | null {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  const preferred = [
    'holofoil',
    'reverseHolofoil',
    'normal',
    '1stEditionHolofoil',
    '1stEditionNormal',
  ];

  for (const key of preferred) {
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return value;
  }

  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return value;
  }

  return null;
}

// ===============================
// CRON LOGGING
// ===============================

async function logCron(
  jobName: string,
  status: 'started' | 'success' | 'failed',
  details?: string
) {
  const { error } = await supabase.from('cron_logs').insert({
    job_name: jobName,
    status,
    details: details ?? null,
    ran_at: new Date().toISOString(),
  });

  if (error) {
    console.log('⚠️ Failed to write cron log:', error);
  }
}

// ===============================
// TCG FETCHING
// ===============================

async function fetchTcgBatch(
  batch: string[],
  batchNumber: number
): Promise<Record<string, number>> {
  const q = batch.map((id) => `id:${id}`).join(' OR ');
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=${batch.length}`;

  for (let attempt = 1; attempt <= TCG_MAX_RETRIES; attempt += 1) {
    try {
      console.log(`🔍 TCG batch ${batchNumber}, attempt ${attempt} (${batch.length} cards)`);

      const headers: Record<string, string> = {};

      if (process.env.POKEMON_TCG_API_KEY) {
        headers['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;
      } else {
        console.log('⚠️ No POKEMON_TCG_API_KEY found in env');
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
        if (typeof price === 'number') {
          priceMap[card.id] = price;
        }
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

async function fetchTcgPricesInBatches(
  cardIds: string[]
): Promise<Record<string, number>> {
  const finalPriceMap: Record<string, number> = {};

  for (let i = 0; i < cardIds.length; i += TCG_BATCH_SIZE) {
    const batch = cardIds.slice(i, i + TCG_BATCH_SIZE);
    const batchNumber = Math.floor(i / TCG_BATCH_SIZE) + 1;

    const batchMap = await fetchTcgBatch(batch, batchNumber);
    Object.assign(finalPriceMap, batchMap);

    if (i + TCG_BATCH_SIZE < cardIds.length) {
      await delay(TCG_DELAY_MS);
    }
  }

  return finalPriceMap;
}

// ===============================
// EBAY FETCHING
// ===============================

async function fetchEbayWithRetry(
  ebayQuery: string,
  displayName: string
): Promise<EbayResponse> {
  try {
    console.log(`🟡 eBay: "${ebayQuery}"`);
    const result = await fetchEbayPrice(ebayQuery);

    // Handle 429 rate limiting
    if ((result as any)?.status === 429) {
      console.log(`⚠️ eBay rate limited — backing off ${EBAY_RATE_LIMIT_DELAY_MS}ms`);
      await delay(EBAY_RATE_LIMIT_DELAY_MS);
      return await fetchEbayPrice(ebayQuery);
    }

    return result;
  } catch {
    console.log(`⚠️ eBay fetch failed for "${displayName}" — retrying...`);
    await delay(EBAY_RETRY_DELAY_MS);

    try {
      return await fetchEbayPrice(ebayQuery);
    } catch (secondError) {
      console.log(`🚫 eBay final fail for "${displayName}":`, secondError);
      return { low: null, average: null, high: null, count: 0 };
    }
  }
}

// ===============================
// MAIN JOB
// ===============================

async function runDailyMarketSnapshot() {
  console.log('🚀 Daily market snapshot started');

  await logCron(JOB_NAME, 'started');

  // Fetch all owned cards
  const { data: cards, error } = await supabase
    .from('binder_cards')
    .select('card_id, set_id, api_card_id, api_set_id, card_name, card_number, set_name, set_total')
    .eq('owned', true);

  if (error) throw error;

  if (!cards || cards.length === 0) {
    console.log('⚠️ No owned cards found');
    await logCron(JOB_NAME, 'success', 'No owned cards found');
    return;
  }

  console.log(`📦 Found ${cards.length} owned card rows`);

  // Deduplicate by api_card_id
  const uniqueCards = Array.from(
    new Map(
      cards.map((card) => [card.api_card_id || card.card_id, card])
    ).values()
  );

  console.log(`🔢 ${uniqueCards.length} unique cards after deduplication`);

  // Fetch TCG prices in batches
  const cardIds = uniqueCards
    .map((card) => card.api_card_id || card.card_id)
    .filter(Boolean);

  console.log(`🔍 Fetching TCG prices for ${cardIds.length} cards`);

  const priceMap = await fetchTcgPricesInBatches(cardIds);

  // Counters
  let savedCount = 0;
  let missingTcgCount = 0;
  let ebayFoundCount = 0;
  let ebayFailCount = 0;
  let upsertFailCount = 0;

  // Process each card
  for (let index = 0; index < uniqueCards.length; index += 1) {
    const card = uniqueCards[index];

    const lookupId = card.api_card_id || card.card_id;
    const displayName = card.card_name || lookupId;
    const tcgPrice = priceMap[lookupId];

    console.log(`\n📍 [${index + 1}/${uniqueCards.length}] ${displayName}`);

    if (typeof tcgPrice !== 'number') {
      missingTcgCount += 1;
      console.log(`⚠️ No TCG price for ${displayName}`);
    }

    // Fetch eBay price
    const ebayQuery = buildEbayQuery(card);
    const ebay = await fetchEbayWithRetry(ebayQuery, displayName);

    const ebayAverage = toNumber(ebay.average);

    if (ebayAverage !== null) {
      ebayFoundCount += 1;
    } else {
      ebayFailCount += 1;
    }

    // Build snapshot
    const snapshot = {
      card_id: card.card_id,
      set_id: card.set_id,

      tcg_low: null,
      tcg_mid: typeof tcgPrice === 'number' ? tcgPrice : null,
      cardmarket_trend: null,

      ebay_low: toNumber(ebay.low),
      ebay_average: ebayAverage,
      ebay_high: toNumber(ebay.high),
      ebay_count: toInteger(ebay.count ?? ebay.rawCount),

      snapshot_at: new Date().toISOString(),
    };

    // UPSERT instead of INSERT — prevents duplicate rows per card
    const { error: upsertError } = await supabase
      .from('market_price_snapshots')
      .upsert(snapshot, {
        onConflict: 'card_id,set_id',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      upsertFailCount += 1;
      console.error(`❌ Upsert failed for ${displayName}:`, upsertError);
      await delay(EBAY_DELAY_MS);
      continue;
    }

    savedCount += 1;
    console.log(
      `✅ ${displayName} | TCG: ${snapshot.tcg_mid ?? 'none'} | eBay avg: ${snapshot.ebay_average ?? 'none'}`
    );

    await delay(EBAY_DELAY_MS);
  }

  // Summary
  console.log('\n📊 Snapshot complete');
  console.log(`💾 Saved/updated: ${savedCount}`);
  console.log(`⚠️  Missing TCG: ${missingTcgCount}`);
  console.log(`🟡 eBay found: ${ebayFoundCount}`);
  console.log(`🚫 eBay failed: ${ebayFailCount}`);
  console.log(`❌ Upsert failures: ${upsertFailCount}`);

  // Update binder card prices from snapshots
  // Non-fatal — log and continue if RPC fails
  const { error: updateError } = await supabase.rpc('update_binder_card_prices');

  if (updateError) {
    console.error('⚠️ update_binder_card_prices RPC failed:', updateError);
    console.log('ℹ️ Snapshots were saved — prices will update on next successful RPC run');
  } else {
    console.log('✅ Binder card prices updated via RPC');
  }

  await logCron(
    JOB_NAME,
    'success',
    `Saved ${savedCount}. Missing TCG: ${missingTcgCount}. eBay found: ${ebayFoundCount}. eBay failed: ${ebayFailCount}. Upsert failed: ${upsertFailCount}.`
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