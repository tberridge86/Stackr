import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchTcgcsvUiCardPricesForSet } from '../lib/pricing';

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, finishing job...');
});

const JOB_NAME = 'daily-tcgcsv-sync';
const SET_FETCH_DELAY_MS = 400;
const CARD_UPSERT_DELAY_MS = 20;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type TcgFallbackPrice = {
  low: number | null;
  mid: number | null;
  market: number | null;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function todayMidnightUTC(): string {
  return new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';
}

function normalizeNumber(value: string): string {
  return value.trim().replace(/^#/, '').replace(/\s+/g, '').toLowerCase();
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bex\b/g, ' ex ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCollectorNumber(value: string): string {
  const normalized = normalizeNumber(value);
  if (!normalized) return '';
  const left = normalized.split('/')[0] ?? normalized;
  return left.replace(/^0+/, '') || '0';
}

function toGbpFromUsd(usd: number | null): number | null {
  const USD_TO_GBP = Number(process.env.USD_TO_GBP ?? 0.79);
  return typeof usd === 'number' ? Math.round(usd * USD_TO_GBP * 100) / 100 : null;
}

function computeFallbackPriceFromVariants(variants: { lowPrice: number | null; midPrice: number | null; marketPrice: number | null }[]): TcgFallbackPrice {
  const values = variants
    .flatMap((v) => [v.lowPrice, v.midPrice, v.marketPrice])
    .filter((v): v is number => typeof v === 'number');

  const lowUsd = values.length ? Math.min(...values) : null;
  const midValues = variants
    .map((v) => v.midPrice)
    .filter((v): v is number => typeof v === 'number');
  const marketValues = variants
    .map((v) => v.marketPrice)
    .filter((v): v is number => typeof v === 'number');

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((sum, n) => sum + n, 0) / arr.length : null;

  return {
    low: toGbpFromUsd(lowUsd),
    mid: toGbpFromUsd(avg(midValues)),
    market: toGbpFromUsd(avg(marketValues)),
  };
}

async function logCron(jobName: string, status: 'started' | 'success' | 'failed', details?: string) {
  const { error } = await supabase.from('cron_logs').insert({
    job_name: jobName,
    status,
    details: details ?? null,
    ran_at: new Date().toISOString(),
  });
  if (error) console.log('⚠️ Failed to write cron log:', error);
}

async function runDailyTcgcsvSync() {
  console.log('🚀 Daily TCGCSV sync started');
  await logCron(JOB_NAME, 'started');

  const snapshotAt = todayMidnightUTC();

  const { data: cards, error: cardsError } = await supabase
    .from('pokemon_cards')
    .select('id, name, set_id, raw_data');

  if (cardsError) throw cardsError;
  if (!cards?.length) {
    console.log('⚠️ No cards found in pokemon_cards');
    await logCron(JOB_NAME, 'success', 'No cards to process.');
    return;
  }

  const bySetName = new Map<string, any[]>();
  for (const card of cards) {
    const setName = (card?.raw_data?.set?.name ?? '').trim();
    if (!setName) continue;
    if (!bySetName.has(setName)) bySetName.set(setName, []);
    bySetName.get(setName)!.push(card);
  }

  let totalSets = 0;
  let totalMatched = 0;
  let totalUpdated = 0;
  let totalNoMatch = 0;
  let totalSetErrors = 0;

  for (const [setName, setCards] of bySetName.entries()) {
    totalSets += 1;
    try {
      console.log(`📦 Processing set: ${setName} (${setCards.length} cards)`);
      const rows = await fetchTcgcsvUiCardPricesForSet(setName);

      for (const card of setCards) {
        const cardNumberRaw = (card?.raw_data?.number ?? '').trim();
        const cardNumberNormalized = normalizeNumber(cardNumberRaw);
        const cardCollector = parseCollectorNumber(cardNumberRaw);
        const cardName = (card?.name ?? card?.raw_data?.name ?? '').trim();
        const cardNameNormalized = normalizeName(cardName);

        const matched =
          rows.find((row) => normalizeNumber(row.number ?? '') === cardNumberNormalized) ??
          rows.find((row) => parseCollectorNumber(row.number ?? '') === cardCollector && cardCollector !== '') ??
          rows.find((row) => normalizeName(row.name).includes(cardNameNormalized) && cardNameNormalized.length > 2) ??
          rows.find((row) => row.name.trim().toLowerCase() === cardName.toLowerCase()) ??
          null;

        if (!matched) {
          totalNoMatch += 1;
          continue;
        }

        totalMatched += 1;

        const fallback = computeFallbackPriceFromVariants(
          matched.variants.map((v) => ({
            lowPrice: v.lowPrice ?? null,
            midPrice: v.midPrice ?? null,
            marketPrice: v.marketPrice ?? null,
          }))
        );

        const snapshot = {
          user_id: null,
          card_id: card.id,
          set_id: card.set_id ?? card?.raw_data?.set?.id ?? null,
          tcg_low: fallback.low,
          tcg_mid: fallback.market ?? fallback.mid ?? fallback.low,
          cardmarket_trend: null,
          ebay_low: null,
          ebay_average: null,
          ebay_high: null,
          ebay_count: 0,
          snapshot_at: snapshotAt,
        };

        const { error: upsertError } = await supabase
          .from('market_price_snapshots')
          .upsert(snapshot, {
            onConflict: 'user_id,card_id,set_id,snapshot_at',
            ignoreDuplicates: false,
          });

        if (!upsertError) {
          totalUpdated += 1;
        } else {
          console.log(`⚠️ Upsert failed for card ${card.id}:`, upsertError.message);
        }

        await delay(CARD_UPSERT_DELAY_MS);
      }

      await delay(SET_FETCH_DELAY_MS);
    } catch (err) {
      totalSetErrors += 1;
      console.log(`⚠️ Set sync failed for "${setName}":`, err);
    }
  }

  const details =
    `Sets: ${totalSets}. Matched: ${totalMatched}. Updated: ${totalUpdated}. No match: ${totalNoMatch}. Set errors: ${totalSetErrors}. Snapshot: ${snapshotAt}`;

  console.log('✅ Daily TCGCSV sync complete');
  console.log(details);
  await logCron(JOB_NAME, 'success', details);
}

async function main() {
  try {
    await runDailyTcgcsvSync();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ daily-tcgcsv-sync failed:', error);
    await logCron(JOB_NAME, 'failed', error?.message ?? 'Unknown error');
    process.exit(1);
  }
}

main();
