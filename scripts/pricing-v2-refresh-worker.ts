// @ts-nocheck
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { refreshPricingForCard } from '../backend/lib/pricingV2/engine.js';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';

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
  // The worker intentionally validates a small caller-supplied environment key.
  // eslint-disable-next-line expo/no-dynamic-env-var
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const supabaseTarget = resolvePricingV2SupabaseTarget();

const supabase = createClient(
  supabaseTarget.url,
  process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv('SUPABASE_SECRET_KEY')
);

async function fetchQueue(limit: number) {
  const dueAt = new Date().toISOString();
  const dueQuery = () => supabase
    .from('price_refresh_queue')
    .select('*')
    .is('processed_at', null)
    .lte('run_after', dueAt)
    .order('priority', { ascending: false })
    .order('requested_at', { ascending: true });

  // Filter each V2 ownership signal in PostgREST before limiting. Filtering a
  // mixed queue in memory allowed a large legacy backlog to starve exact manual
  // refreshes indefinitely.
  const results = await Promise.all([
    dueQuery().like('reason', 'pricing_v2%').limit(limit),
    dueQuery().eq('metadata->>pricingEngine', 'v2').limit(limit),
    dueQuery()
      .eq('reason', 'manual_snapshot_refresh')
      .in('metadata->>refreshPipeline', ['pricing_v2_exact', 'legacy_snapshot'])
      .not('metadata->>canonicalVariantId', 'is', null)
      .limit(limit),
  ]);
  for (const result of results) {
    if (result.error) throw result.error;
  }

  const unique = new Map<string, any>();
  for (const result of results) {
    for (const row of result.data ?? []) unique.set(row.id, row);
  }
  return [...unique.values()]
    .sort((left: any, right: any) => {
      const priority = Number(right.priority ?? 0) - Number(left.priority ?? 0);
      if (priority) return priority;
      return String(left.requested_at ?? '').localeCompare(String(right.requested_at ?? ''));
    })
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
  if (updateError) throw new Error(`Could not persist queue state for ${row.id}: ${updateError.message}`);
}

function exactQueueMetadataError(metadata: Record<string, any>) {
  const missing = (name: string) => !String(metadata[name] ?? '').trim();
  const required = ['canonicalVariantId', 'identityKey', 'canonicalCardName'];
  const productType = metadata.productType ?? 'raw_card';
  if (productType !== 'sealed_product') required.push('cardNumber');
  if (productType === 'sealed_product') required.push('sealedProductType');
  const absent = required.filter(missing);
  return absent.length
    ? `Exact pricing queue metadata is incomplete (${absent.join(', ')}); refusing printing-level rehydration.`
    : null;
}

async function run() {
  const limit = Math.min(Math.max(Number(getArg('limit', '100')), 1), 500);
  const dryRun = hasFlag('dry-run');
  const ignoreFeatureFlag = hasFlag('ignore-feature-flag');
  const delayMs = Number(getArg('delayMs', process.env.PRICING_V2_REFRESH_DELAY_MS ?? '700'));
  const queue = await fetchQueue(limit);
  const pokeTraceExpected = String(process.env.PRICING_V2_POKETRACE_SOLD_ENABLED ?? '').toLowerCase() === 'true'
    && String(process.env.PRICING_V2_POKETRACE_SOLD_AUTHORISED ?? '').toLowerCase() === 'true';

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
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const metadataError = exactQueueMetadataError(metadata);
      if (metadataError) throw new Error(metadataError);
      const result = await refreshPricingForCard(supabase, row.card_id, {
        setId: row.set_id,
        language: row.language,
        productType: metadata.productType ?? 'raw_card',
        canonicalVariantId: metadata.canonicalVariantId ?? metadata.variantId ?? null,
        canonicalPrintingId: metadata.canonicalPrintingId ?? null,
        canonicalCardName: metadata.canonicalCardName ?? metadata.name ?? null,
        canonicalSetName: metadata.canonicalSetName ?? metadata.setName ?? null,
        setCode: metadata.setCode ?? null,
        cardNumber: metadata.cardNumber ?? metadata.number ?? null,
        rarity: metadata.rarity ?? null,
        variant: metadata.variantCode ?? metadata.variant ?? null,
        finish: metadata.finishCode ?? metadata.finish ?? null,
        edition: metadata.edition ?? null,
        condition: metadata.condition ?? metadata.rawCondition ?? 'raw_near_mint',
        rawCondition: metadata.rawCondition ?? metadata.condition ?? 'raw_near_mint',
        promoCode: metadata.promoCode ?? null,
        gradingCompany: metadata.gradingCompany ?? null,
        grade: metadata.grade ?? null,
        qualifier: metadata.qualifier ?? null,
        sealedProductType: metadata.sealedProductType ?? null,
        packageVariant: metadata.packageVariant ?? null,
        releaseRegion: metadata.releaseRegion ?? null,
        currency: metadata.currency ?? 'GBP',
        ignoreFeatureFlag,
      });
      if (metadata.identityKey && result.identityKey !== metadata.identityKey) {
        throw new Error(`Exact pricing identity mismatch: queued ${metadata.identityKey}, received ${result.identityKey ?? 'none'}`);
      }
      if (metadata.canonicalVariantId && result.canonicalVariantId !== metadata.canonicalVariantId) {
        throw new Error(`Exact pricing canonical variant mismatch: queued ${metadata.canonicalVariantId}, received ${result.canonicalVariantId ?? 'none'}`);
      }
      for (const limitation of result.accessLimitations ?? []) {
        stats.sourceSpecificFailureCounts[limitation.source] = (stats.sourceSpecificFailureCounts[limitation.source] ?? 0) + 1;
      }
      const pokeTraceFailure = (result.accessLimitations ?? [])
        .find((limitation: any) => limitation.source === 'poketrace_sold');
      if (pokeTraceExpected && pokeTraceFailure) {
        const message = `PokeTrace exact sold-evidence refresh failed: ${pokeTraceFailure.message ?? 'provider unavailable'}`;
        stats.failed += 1;
        await markQueue(row, message);
        console.log(`[${index + 1}/${queue.length}] ${row.card_id}: ${message}`);
      } else {
        stats.completed += 1;
        if (result.marketPrice != null) stats.priceFound += 1;
        else stats.priceStillUnavailable += 1;
        if (result.state === 'insufficient_exact_market_evidence') stats.noExactMatch += 1;
        await markQueue(row);
        console.log(`[${index + 1}/${queue.length}] ${row.card_id}: ${result.state}`);
      }
    } catch (error: any) {
      const message = error?.message ?? String(error);
      stats.failed += 1;
      await markQueue(row, message);
      console.log(`[${index + 1}/${queue.length}] ${row.card_id}: failed - ${message}`);
    }
    if (index + 1 < queue.length) await delay(delayMs);
  }

  console.log(JSON.stringify(stats, null, 2));
  if (stats.failed > 0
    || (pokeTraceExpected && (stats.sourceSpecificFailureCounts.poketrace_sold ?? 0) > 0)) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('Pricing V2 refresh worker failed:', error);
  process.exit(1);
});
