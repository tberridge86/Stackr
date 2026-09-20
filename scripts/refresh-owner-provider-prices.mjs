import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readOwnerPrintingCatalogue } from './lib/owner-price-printing-identities.mjs';
import { ownerIdentityLookupRows, resolveScopedOwnedProviderVariant } from './lib/owner-price-saved-references.mjs';
import { ownedValuationUnits } from './lib/prepared-collection-valuation.mjs';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';
import {
  isUuid,
  legacyEnglishOwnerPair,
  ownedRowEligibility,
  parseOwnerPriceRefreshArguments,
  resolveOwnerExactQueueItem,
  summariseOwnerPriceRefresh,
} from './lib/owner-provider-price-refresh-core.mjs';

const require = createRequire(import.meta.url);
const { createMarketPricingService } = require('../backend/lib/marketPricing/service.js');
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const OWNED_SCAN_MAX_ROWS = 1000;
const OWNED_SNAPSHOT_READ_MAX_ROWS = 1000;
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

const knownLanguage = (value) => {
  const match = /^(en|ja|ko|zh-cn|zh-tw):/i.exec(String(value ?? '').trim());
  return match?.[1].toLowerCase() ?? null;
};
const normaliseLanguage = (value) => String(value ?? '').trim().toLowerCase().replace(/_/g, '-');

function hasSavedLanguageConflict(row) {
  const explicit = [...new Set([knownLanguage(row?.card_id), knownLanguage(row?.set_id)].filter(Boolean))];
  if (explicit.length > 1) return true;
  const stored = normaliseLanguage(row?.language);
  return Boolean(stored && explicit[0] && stored !== explicit[0]);
}

function needsUnambiguousLanguageContext(row) {
  if (hasSavedLanguageConflict(row) || String(row?.language ?? '').trim() || ownedRowEligibility(row)) return false;
  // This does not resolve or alter the row. It asks only whether the existing
  // verified English bridge would be applicable if a binder context proves it.
  // ME rows already have an established unscoped rule and need no extra read.
  return !legacyEnglishOwnerPair(row) && Boolean(legacyEnglishOwnerPair({ ...row, language: 'en' }));
}

async function enrichOwnedRowsWithBinderLanguage(supabase, ownerId, rows) {
  if (!rows.some(needsUnambiguousLanguageContext)) return rows;
  const { data, error } = await supabase.schema('api').rpc('collection_valuation_inputs', { p_owner: ownerId });
  if (error) throw error;
  if (!data || typeof data !== 'object' || !Array.isArray(data.binders) || !Array.isArray(data.binderCards)) {
    throw new Error('Owned language context snapshot is unavailable.');
  }
  // Reuse the prepared-valuation context logic, but retain only the already
  // bounded ownership scan. Legacy binder placements cannot become additional
  // provider-refresh candidates here.
  const ownedIds = new Set(rows.map((row) => String(row?.id ?? '')).filter(Boolean));
  const languageByOwnedId = new Map(ownedValuationUnits({
    ownedRows: rows,
    binders: data.binders,
    binderCards: data.binderCards,
  }).filter((unit) => ownedIds.has(String(unit?.id ?? '')))
    .map((unit) => [String(unit.id), unit.language]));
  return rows.map((row) => {
    const language = languageByOwnedId.get(String(row?.id ?? ''));
    return String(language ?? '').trim() ? { ...row, language } : row;
  });
}

export async function readOwnedRows(supabase, ownerId) {
  // This is a candidate scan, never a provider-pull limit. It remains bounded
  // so a corrupted owner collection cannot turn a scheduled run into a broad
  // catalogue refresh.
  const rows = await queryRows(supabase.from('user_card_variants')
    .select('id,card_id,set_id,variant,quantity,condition,grade_company,grade,updated_at')
    .eq('user_id', ownerId)
    .gt('quantity', 0)
    .order('updated_at', { ascending: false })
    .limit(OWNED_SCAN_MAX_ROWS + 1));
  // A project max_rows setting can cap a requested 1001 rows at 1000. At that
  // boundary we cannot prove the full owner collection was read, so stop
  // before a partial scan drives an "all prices" refresh claim.
  if (rows.length >= OWNED_SCAN_MAX_ROWS) {
    throw new Error('Owner price refresh scan reached its safe result bound.');
  }
  return enrichOwnedRowsWithBinderLanguage(supabase, ownerId, rows);
}

async function resolveOwnedCandidates(supabase, ownedRows) {
  const rowsNeedingIdentity = ownedRows.filter((row) => !ownedRowEligibility(row) && !hasSavedLanguageConflict(row));
  const referenceRows = rowsNeedingIdentity.flatMap(ownerIdentityLookupRows);
  const externalIds = [...new Set(referenceRows.flatMap((row) => [
    row.card_id, row.set_id, ...(legacyEnglishOwnerPair(row)?.setAliases ?? []),
  ])
    .map((value) => String(value ?? '').trim()).filter(Boolean))];
  const identifierRows = externalIds.length
    ? await queryRows(supabase.schema('api').from('catalogue_external_identifiers')
      .select('source_entity_type,external_id,language_code,set_id,printing_id,variant_id,confidence')
      .in('external_id', externalIds)
      .limit(5000))
    : [];

  if (identifierRows.length >= 1000) throw new Error('Owner identifier read reached its safe result bound.');

  const provisionalVariantIds = [...new Set([
    ...referenceRows.map((row) => String(row.card_id ?? '').toLowerCase()).filter(isUuid),
    ...identifierRows
    .filter((row) => String(row?.variant_id ?? '').trim())
    .map((row) => String(row.variant_id).toLowerCase())
    .filter(isUuid),
  ])];
  const directCatalogueRows = provisionalVariantIds.length
    ? await queryRows(supabase.schema('api').from('catalogue_cards')
      .select('variant_id,printing_id,set_id,language_code,variant_code,finish_code')
      .in('variant_id', provisionalVariantIds)
      .limit(5000))
    : [];
  if (directCatalogueRows.length >= 1000) throw new Error('Owner variant read reached its safe result bound.');
  const printingCatalogueRows = await readOwnerPrintingCatalogue(supabase, referenceRows, identifierRows, directCatalogueRows);
  const legacySetReferences = new Set(referenceRows
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
  const catalogueRows = [...directCatalogueRows, ...printingCatalogueRows, ...legacyCatalogueRows];
  return ownedRows.map((row) => hasSavedLanguageConflict(row)
    ? { ok: false, reason: 'ambiguous_saved_identity' }
    : resolveScopedOwnedProviderVariant(row, identifierRows, catalogueRows));
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

export function ownerQueueRetryAfter(attempts, providerRetryAfter) {
  const raw = providerRetryAfter;
  const seconds = raw != null && Number.isFinite(Number(raw)) ? Number(raw) : (Date.parse(String(raw)) - Date.now()) / 1000;
  return new Date(Date.now() + Math.max(Math.min(60, 2 ** Number(attempts ?? 0)) * 60_000,
    Number.isFinite(seconds) ? Math.max(0, seconds) * 1000 : 0)).toISOString();
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

async function retryQueueItem(supabase, item, leaseUntil, errorCode, providerRetryAfter) {
  const deferred = errorCode === 'provider_refresh_cooldown';
  const attempts = Number(item.row.attempts ?? 0) + (deferred ? 0 : 1);
  const exhausted = !deferred && attempts >= QUEUE_MAX_ATTEMPTS;
  const patch = exhausted
    ? { processed_at: new Date().toISOString(), attempts, last_error: 'exact_provider_retry_exhausted' }
    : { attempts, last_error: errorCode, run_after: ownerQueueRetryAfter(item.row.attempts, providerRetryAfter) };
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

/**
 * Favour identities without an exact provider snapshot, then the oldest
 * stored snapshot. This makes each bounded run expand owner coverage before
 * re-reading already-covered cards. UUID ordering only breaks real ties.
 */
export function selectOwnedCandidatesBySnapshot(candidates, snapshotsByVariant, limit) {
  if (limit <= 0) return [];
  const timestamp = (candidate) => {
    const value = snapshotsByVariant.get(candidate.variantId);
    const time = Date.parse(value?.snapshotAt ?? value?.calculatedAt ?? '');
    return Number.isFinite(time) ? time : null;
  };
  return [...candidates].sort((left, right) => {
    const leftTime = timestamp(left); const rightTime = timestamp(right);
    if (leftTime == null && rightTime != null) return -1;
    if (rightTime == null && leftTime != null) return 1;
    if (leftTime != null && rightTime != null && leftTime !== rightTime) return leftTime - rightTime;
    return left.variantId.localeCompare(right.variantId);
  }).slice(0, limit);
}

async function readOwnedCandidateSnapshots(supabase, candidates) {
  const variantIds = [...new Set(candidates.map((candidate) => String(candidate.variantId).toLowerCase()).filter(isUuid))];
  if (!variantIds.length) return new Map();
  const { data, error } = await supabase.from('market_price_snapshots')
    .select('card_id,snapshot_at,calculated_at')
    .in('card_id', variantIds)
    .is('user_id', null)
    .eq('primary_source', 'tcgdex')
    .eq('price_type', 'market_estimate')
    .eq('proven_last_sold', false)
    .is('methodology_version', null)
    .gt('tcgdex_price', 0)
    .order('snapshot_at', { ascending: false })
    .limit(OWNED_SNAPSHOT_READ_MAX_ROWS);
  if (error) throw error;
  // A PostgREST project cap can make an exact limit indistinguishable from a
  // truncated result. Refuse the run before any provider call instead of
  // claiming a partial set is complete or old.
  if ((data ?? []).length >= OWNED_SNAPSHOT_READ_MAX_ROWS) {
    throw new Error('Owned snapshot recency read reached its safe result bound.');
  }
  const snapshots = new Map();
  for (const row of data ?? []) {
    const variantId = String(row?.card_id ?? '').toLowerCase();
    if (!isUuid(variantId) || snapshots.has(variantId)) continue;
    snapshots.set(variantId, { snapshotAt: row.snapshot_at ?? null, calculatedAt: row.calculated_at ?? null });
  }
  return snapshots;
}

export async function runOwnerProviderRefresh({ supabase, refreshExactProviderEstimate, ownerId, limit, dryRun, includeQueue = false, queueOnly = false }) {
  const queueRows = includeQueue ? await readOwnerQueue(supabase, ownerId, limit) : [];
  const resolvedQueue = includeQueue ? await resolveOwnerQueue(supabase, queueRows, ownerId) : [];
  const validQueue = resolvedQueue.filter((item) => item.ok);
  const invalidQueue = resolvedQueue.filter((item) => !item.ok);
  const ownedRows = queueOnly ? [] : await readOwnedRows(supabase, ownerId);
  const resolved = queueOnly ? [] : await resolveOwnedCandidates(supabase, ownedRows);
  // The same owned identity can appear through multiple binder rows. One
  // exact provider snapshot is sufficient for that canonical variant.
  const queueSelected = [...new Map(validQueue.map((item) => [item.variantId, item])).values()].slice(0, limit);
  const queueVariantIds = new Set(queueSelected.map((item) => item.variantId));
  const ownedCandidates = [...new Map(resolved.filter((result) => result.ok)
    .filter((result) => !queueVariantIds.has(result.variantId))
    .map((result) => [result.variantId, result])).values()];
  const ownedBudget = Math.max(0, limit - queueSelected.length);
  const ownedSnapshots = ownedBudget ? await readOwnedCandidateSnapshots(supabase, ownedCandidates) : new Map();
  const ownedSelected = selectOwnedCandidatesBySnapshot(ownedCandidates, ownedSnapshots, ownedBudget);
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
      if (await retryQueueItem(supabase, item, leaseUntil, code, error?.retryAfter)) summary.queueTerminal += 1;
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

export async function prepareStoredValuationIfEnabled({supabase,service,ownerId,dryRun,env=process.env}) {
  if (dryRun || env.STACKR_PREPARED_VALUATIONS_ENABLED !== 'true') return null;
  const { prepareCollectionValuation } = await import('./lib/prepared-collection-valuation.mjs');
  return prepareCollectionValuation({supabase,service,ownerId,
    providerCapacityVerified:env.STACKR_PREPARED_REFRESH_QUEUE_ENABLED === 'true'});
}

async function main() {
  if (process.env.STACKR_CATALOGUE_PRICING_ENABLED === 'true') {
    const { mainCataloguePricing } = await import('./refresh-catalogue-prices.mjs');
    return mainCataloguePricing();
  }
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
  const valuation=await prepareStoredValuationIfEnabled({supabase,service,ownerId,dryRun});
  console.log(JSON.stringify({ worker: 'owner-provider-price-refresh', ...summary,
    valuationPublished:valuation?.published??false,valuationDiagnostics:valuation?.diagnostics??null }, null, 2));
  if (summary.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Owner provider refresh failed: ${error?.message ?? String(error)}`);
    process.exit(1);
  });
}
