import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';
import {
  isUuid,
  legacyEnglishOwnerPair,
  ownedRowEligibility,
  parseOwnerPriceRefreshArguments,
  resolveOwnerExactQueueItem,
  resolveOwnedProviderVariant,
  summariseOwnerPriceRefresh,
} from './lib/owner-provider-price-refresh-core.mjs';

const require = createRequire(import.meta.url);
const { createMarketPricingService } = require('../backend/lib/marketPricing/service.js');
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const OWNED_SCAN_MULTIPLIER = 10;
const QUEUE_MAX_ATTEMPTS = 5;
const UNAVAILABLE_PROVIDER_CODES = new Set(['unresolved_provider_identity', 'ambiguous_provider_identity', 'exact_provider_quote_unavailable']);
// These are stable, non-sensitive ApiError codes emitted by the exact provider
// service. All other provider errors deliberately collapse to the generic code
// before they reach the operational receipt.
const SAFE_REFRESH_ERROR_CODES = new Set([
  ...UNAVAILABLE_PROVIDER_CODES,
  'exact_provider_refresh_failed',
  'provider_refresh_timeout',
  'unsupported_refresh_scope',
  'provider_identity_truncated',
  'provider_refresh_cooldown',
  'exact_provider_daily_snapshot_conflict',
]);

function requireEnv(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function ownerRefreshConfiguration() {
  const target = resolvePricingV2SupabaseTarget();
  if (target.projectRef !== PRODUCTION_PROJECT_REF) {
    throw new Error('Owner provider refresh is production-only and refused the configured project.');
  }
  if (String(process.env.STACKR_OWNER_PRICE_REFRESH_ENABLED ?? '').toLowerCase() !== 'true') {
    throw new Error('STACKR_OWNER_PRICE_REFRESH_ENABLED must be true.');
  }
  const ownerId = requireEnv('STACKR_OWNER_PRICE_REFRESH_USER_ID').toLowerCase();
  if (!isUuid(ownerId)) throw new Error('STACKR_OWNER_PRICE_REFRESH_USER_ID must be a UUID.');
  return { target, ownerId };
}

async function queryRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function readOwnedRows(supabase, ownerId, limit) {
  // This is a candidate scan, never a provider-pull limit. It remains bounded
  // so a corrupted owner collection cannot turn a scheduled run into a broad
  // catalogue refresh.
  return queryRows(supabase.from('user_card_variants')
    .select('id,card_id,set_id,variant,quantity,condition,grade_company,grade,updated_at')
    .eq('user_id', ownerId)
    .gt('quantity', 0)
    .order('updated_at', { ascending: false })
    .limit(limit * OWNED_SCAN_MULTIPLIER));
}

async function resolveOwnedCandidates(supabase, ownedRows) {
  const rowsNeedingIdentity = ownedRows.filter((row) => !ownedRowEligibility(row));
  const externalIds = [...new Set(rowsNeedingIdentity.flatMap((row) => [
    row.card_id, row.set_id, ...(legacyEnglishOwnerPair(row)?.setAliases ?? []),
  ])
    .map((value) => String(value ?? '').trim()).filter(Boolean))];
  const identifierRows = externalIds.length
    ? await queryRows(supabase.schema('api').from('catalogue_external_identifiers')
      .select('source_entity_type,external_id,language_code,set_id,printing_id,variant_id,confidence')
      .in('external_id', externalIds)
      .limit(5000))
    : [];

  const provisionalVariantIds = [...new Set([
    ...rowsNeedingIdentity.map((row) => String(row.card_id ?? '').toLowerCase()).filter(isUuid),
    ...identifierRows
    .filter((row) => String(row?.variant_id ?? '').trim())
    .map((row) => String(row.variant_id).toLowerCase())
    .filter(isUuid),
  ])];
  const directCatalogueRows = provisionalVariantIds.length
    ? await queryRows(supabase.schema('api').from('catalogue_cards')
      .select('variant_id,set_id,language_code,variant_code,finish_code')
      .in('variant_id', provisionalVariantIds)
      .limit(5000))
    : [];
  const legacySetReferences = new Set(rowsNeedingIdentity
    .flatMap((row) => legacyEnglishOwnerPair(row)?.setAliases ?? [])
    .map((value) => String(value).toLowerCase()));
  const legacySetIds = [...new Set(identifierRows
    .filter((row) => String(row?.source_entity_type ?? '').toLowerCase() === 'set')
    .filter((row) => String(row?.language_code ?? '').toLowerCase() === 'en')
    .filter((row) => legacySetReferences.has(String(row?.external_id ?? '').toLowerCase()))
    .map((row) => String(row?.set_id ?? '').toLowerCase())
    .filter(isUuid))].slice(0, 30);
  // Read one set at a time. Even the maximum owner run must not create thirty
  // concurrent full-set reads against the published catalogue view.
  const legacyCatalogueRows = [];
  for (const setId of legacySetIds) {
    legacyCatalogueRows.push(...await queryRows(supabase.schema('api').from('catalogue_cards')
      .select('variant_id,set_id,language_code,collector_number,variant_code,finish_code')
      .eq('set_id', setId)
      .eq('language_code', 'en')
      .limit(1000)));
  }
  const catalogueRows = [...directCatalogueRows, ...legacyCatalogueRows];
  return ownedRows.map((row) => resolveOwnedProviderVariant(row, identifierRows, catalogueRows));
}

async function readOwnerQueue(supabase, ownerId, limit) {
  return queryRows(supabase.from('price_refresh_queue')
    .select('id,card_id,set_id,language,reason,requested_by,requested_at,run_after,processed_at,attempts,last_error,metadata')
    .eq('requested_by', ownerId)
    .eq('reason', 'manual_snapshot_refresh')
    .eq('metadata->>refreshPipeline', 'pricing_v2_exact')
    .is('processed_at', null)
    .lte('run_after', new Date().toISOString())
    .order('priority', { ascending: false })
    .order('requested_at', { ascending: true })
    .limit(limit));
}

async function resolveOwnerQueue(supabase, queueRows, ownerId) {
  const ids = [...new Set(queueRows
    .map((row) => String(row?.metadata?.canonicalVariantId ?? '').toLowerCase())
    .filter(isUuid))];
  const catalogueRows = ids.length
    ? await queryRows(supabase.schema('api').from('catalogue_cards')
      .select('variant_id,printing_id,language_code,set_id,variant_code,finish_code')
      .in('variant_id', ids)
      .limit(100))
    : [];
  return queueRows.map((row) => ({ row, ...resolveOwnerExactQueueItem(row, catalogueRows, ownerId) }));
}

function retryAfter(attempts) {
  return new Date(Date.now() + Math.min(60, 2 ** Number(attempts ?? 0)) * 60_000).toISOString();
}

async function claimQueueItem(supabase, item) {
  const leaseUntil = new Date(Date.now() + 5 * 60_000).toISOString();
  const { data, error } = await supabase.from('price_refresh_queue')
    .update({ run_after: leaseUntil, last_error: null })
    .eq('id', item.row.id)
    .eq('requested_by', item.row.requested_by)
    .is('processed_at', null)
    .eq('run_after', item.row.run_after)
    .lte('run_after', new Date().toISOString())
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data ? leaseUntil : null;
}

async function completeQueueItem(supabase, item, leaseUntil) {
  const { error } = await supabase.from('price_refresh_queue')
    .update({ processed_at: new Date().toISOString(), attempts: Number(item.row.attempts ?? 0) + 1, last_error: null })
    .eq('id', item.row.id)
    .eq('requested_by', item.row.requested_by)
    .is('processed_at', null)
    .eq('run_after', leaseUntil);
  if (error) throw error;
}

function safeQueueErrorCode(error) {
  const code = String(error?.code ?? '');
  return SAFE_REFRESH_ERROR_CODES.has(code) ? code : 'exact_provider_refresh_failed';
}

function recordFailureDiagnostic(summary, variantId, error, source) {
  const id = String(variantId ?? '').toLowerCase();
  if (!isUuid(id)) return;
  // This receipt is an owner-only operational summary. Never include an error
  // message, provider response, queue payload, credentials or card name.
  summary.failureDiagnostics.push({ variantId: id, code: safeQueueErrorCode(error), source });
}

async function retryQueueItem(supabase, item, leaseUntil, errorCode) {
  const attempts = Number(item.row.attempts ?? 0) + 1;
  const exhausted = attempts >= QUEUE_MAX_ATTEMPTS;
  const patch = exhausted
    ? { processed_at: new Date().toISOString(), attempts, last_error: 'exact_provider_retry_exhausted' }
    : { attempts, last_error: errorCode, run_after: retryAfter(item.row.attempts) };
  const { error } = await supabase.from('price_refresh_queue')
    .update(patch)
    .eq('id', item.row.id)
    .eq('requested_by', item.row.requested_by)
    .is('processed_at', null)
    .eq('run_after', leaseUntil);
  if (error) throw error;
  return exhausted;
}

async function terminalQueueItem(supabase, item) {
  const { error } = await supabase.from('price_refresh_queue')
    .update({ processed_at: new Date().toISOString(), attempts: Number(item.row.attempts ?? 0) + 1, last_error: 'unsupported_exact_queue_identity' })
    .eq('id', item.row.id)
    .eq('requested_by', item.row.requested_by)
    .is('processed_at', null)
    .eq('run_after', item.row.run_after)
    .lte('run_after', new Date().toISOString());
  if (error) throw error;
}

async function refreshExact(refreshExactProviderEstimate, variantId) {
  return refreshExactProviderEstimate(variantId, {
    productType: 'raw_card', condition: 'near_mint', currency: 'GBP',
  });
}

export async function runOwnerProviderRefresh({ supabase, refreshExactProviderEstimate, ownerId, limit, dryRun, includeQueue = false, queueOnly = false }) {
  const queueRows = includeQueue ? await readOwnerQueue(supabase, ownerId, limit) : [];
  const resolvedQueue = includeQueue ? await resolveOwnerQueue(supabase, queueRows, ownerId) : [];
  const validQueue = resolvedQueue.filter((item) => item.ok);
  const invalidQueue = resolvedQueue.filter((item) => !item.ok);
  const ownedRows = queueOnly ? [] : await readOwnedRows(supabase, ownerId, limit);
  const resolved = queueOnly ? [] : await resolveOwnedCandidates(supabase, ownedRows);
  // The same owned identity can appear through multiple binder rows. One
  // exact provider snapshot is sufficient for that canonical variant.
  const queueSelected = [...new Map(validQueue.map((item) => [item.variantId, item])).values()].slice(0, limit);
  const queueVariantIds = new Set(queueSelected.map((item) => item.variantId));
  const ownedSelected = [...new Map(resolved.filter((result) => result.ok)
    .filter((result) => !queueVariantIds.has(result.variantId))
    .map((result) => [result.variantId, result])).values()].slice(0, Math.max(0, limit - queueSelected.length));
  // Keep only canonical public UUIDs. This is enough to reconcile a bounded
  // refresh against later snapshots without exposing binder rows or provider
  // identity details.
  const selectedVariantIds = [...queueSelected, ...ownedSelected]
    .map((item) => String(item.variantId ?? '').toLowerCase())
    .filter(isUuid)
    .slice(0, limit);
  const summary = {
    ...summariseOwnerPriceRefresh(resolved),
    queueScanned: queueRows.length,
    queueEligible: validQueue.length,
    queueUnsupported: invalidQueue.length,
    queueTerminal: 0,
    queueClaimLost: 0,
    queueCompleted: 0,
    queueRetried: 0,
    selected: queueSelected.length + ownedSelected.length,
    selectedVariantIds,
    refreshed: 0, unavailable: 0, failed: 0, dryRun,
    failureDiagnostics: [],
  };
  if (!dryRun) {
    for (const item of invalidQueue) {
      await terminalQueueItem(supabase, item);
      summary.queueTerminal += 1;
    }
  }
  if (dryRun) return summary;

  for (const item of queueSelected) {
    const leaseUntil = await claimQueueItem(supabase, item);
    if (!leaseUntil) {
      summary.queueClaimLost += 1;
      continue;
    }
    try {
      await refreshExact(refreshExactProviderEstimate, item.variantId);
      summary.refreshed += 1;
      await completeQueueItem(supabase, item, leaseUntil);
      summary.queueCompleted += 1;
    } catch (error) {
      // The exact service deliberately rejects missing/ambiguous aliases and
      // unavailable current quotes. Keep the scheduled run bounded and report
      // those as unavailable without substituting another provider or finish.
      const code = safeQueueErrorCode(error);
      if (UNAVAILABLE_PROVIDER_CODES.has(code)) summary.unavailable += 1;
      else summary.failed += 1;
      recordFailureDiagnostic(summary, item.variantId, error, 'queue');
      if (await retryQueueItem(supabase, item, leaseUntil, code)) summary.queueTerminal += 1;
      else summary.queueRetried += 1;
    }
  }
  for (const item of ownedSelected) {
    try {
      await refreshExact(refreshExactProviderEstimate, item.variantId);
      summary.refreshed += 1;
    } catch (error) {
      const code = safeQueueErrorCode(error);
      if (UNAVAILABLE_PROVIDER_CODES.has(code)) summary.unavailable += 1;
      else summary.failed += 1;
      recordFailureDiagnostic(summary, item.variantId, error, 'owned');
    }
  }
  return summary;
}

async function main() {
  const { limit, dryRun, includeQueue, queueOnly } = parseOwnerPriceRefreshArguments(process.argv.slice(2));
  const { target, ownerId } = ownerRefreshConfiguration();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || requireEnv('SUPABASE_SECRET_KEY');
  const supabase = createClient(target.url, serviceKey);
  const service = createMarketPricingService({ supabase, refreshEnabled: true });
  const summary = await runOwnerProviderRefresh({
    supabase,
    refreshExactProviderEstimate: service.refreshExactProviderEstimate,
    ownerId,
    limit,
    dryRun,
    includeQueue,
    queueOnly,
  });
  console.log(JSON.stringify({ worker: 'owner-provider-price-refresh', ...summary }, null, 2));
  if (summary.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Owner provider refresh failed: ${error?.message ?? String(error)}`);
    process.exit(1);
  });
}
