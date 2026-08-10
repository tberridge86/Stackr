// @ts-nocheck
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { refreshPricingForCard } from '../backend/lib/pricingV2/engine.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getArg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function resolveSupabaseUrl() {
  const explicit = process.env.SUPABASE_URL;
  if (explicit) return explicit;
  const projectRef = process.env.SUPABASE_PROJECT_REF || 'oakdbbzdqwurpjnoqhmu';
  return `https://${projectRef}.supabase.co`;
}

const supabase = createClient(
  resolveSupabaseUrl(),
  process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv('SUPABASE_SECRET_KEY')
);

async function fetchQueue(limit: number) {
  const { data, error } = await supabase
    .from('price_refresh_queue')
    .select('*')
    .is('processed_at', null)
    .lte('run_after', new Date().toISOString())
    .order('priority', { ascending: false })
    .order('requested_at', { ascending: true })
    .limit(limit * 3);
  if (error) throw error;
  return (data ?? [])
    .filter((row: any) => String(row.reason ?? '').startsWith('pricing_v2') || row.metadata?.pricingEngine === 'v2')
    .slice(0, limit);
}

async function markQueue(row: any, error?: string) {
  const patch = error
    ? {
        attempts: Number(row.attempts ?? 0) + 1,
        last_error: error.slice(0, 500),
        run_after: new Date(Date.now() + Math.min(60, Math.pow(2, Number(row.attempts ?? 0))) * 60_000).toISOString(),
      }
    : {
        processed_at: new Date().toISOString(),
        last_error: null,
      };
  const { error: updateError } = await supabase.from('price_refresh_queue').update(patch).eq('id', row.id);
  if (updateError) console.log(`Could not update queue row ${row.id}: ${updateError.message}`);
}

async function run() {
  const limit = Math.min(Math.max(Number(getArg('limit', '100')), 1), 500);
  const dryRun = hasFlag('dry-run');
  const ignoreFeatureFlag = hasFlag('ignore-feature-flag');
  const delayMs = Number(getArg('delayMs', process.env.PRICING_V2_REFRESH_DELAY_MS ?? '700'));
  const queue = await fetchQueue(limit);

  const stats = {
    totalQueued: queue.length,
    completed: 0,
    failed: 0,
    noExactMatch: 0,
    priceFound: 0,
    priceStillUnavailable: 0,
    sourceSpecificFailureCounts: {} as Record<string, number>,
    dryRun,
  };

  console.log(`Pricing V2 refresh worker: ${queue.length} due item(s), dryRun=${dryRun}`);
  if (dryRun) {
    console.log(JSON.stringify(queue.map((row: any) => ({
      id: row.id,
      cardId: row.card_id,
      language: row.language,
      reason: row.reason,
      priority: row.priority,
    })), null, 2));
    return;
  }

  for (let index = 0; index < queue.length; index += 1) {
    const row = queue[index];
    try {
      const result = await refreshPricingForCard(supabase, row.card_id, {
        setId: row.set_id,
        language: row.language,
        productType: row.metadata?.productType ?? 'raw_card',
        ignoreFeatureFlag,
      });
      stats.completed += 1;
      if (result.marketPrice != null) stats.priceFound += 1;
      else stats.priceStillUnavailable += 1;
      if (result.state === 'insufficient_exact_market_evidence') stats.noExactMatch += 1;
      for (const limitation of result.accessLimitations ?? []) {
        stats.sourceSpecificFailureCounts[limitation.source] = (stats.sourceSpecificFailureCounts[limitation.source] ?? 0) + 1;
      }
      await markQueue(row);
      console.log(`[${index + 1}/${queue.length}] ${row.card_id}: ${result.state}`);
    } catch (error: any) {
      stats.failed += 1;
      await markQueue(row, error?.message ?? String(error));
      console.log(`[${index + 1}/${queue.length}] ${row.card_id}: failed - ${error?.message ?? error}`);
    }
    if (index + 1 < queue.length) await delay(delayMs);
  }

  console.log(JSON.stringify(stats, null, 2));
  if (stats.failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error('Pricing V2 refresh worker failed:', error);
  process.exit(1);
});
