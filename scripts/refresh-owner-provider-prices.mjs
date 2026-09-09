import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';
import {
  isUuid,
  ownedRowEligibility,
  parseOwnerPriceRefreshArguments,
  resolveOwnedProviderVariant,
  summariseOwnerPriceRefresh,
} from './lib/owner-provider-price-refresh-core.mjs';

const require = createRequire(import.meta.url);
const { createMarketPricingService } = require('../backend/lib/marketPricing/service.js');
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const OWNED_SCAN_MULTIPLIER = 10;

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
  const externalIds = [...new Set(rowsNeedingIdentity.flatMap((row) => [row.card_id, row.set_id])
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
  const catalogueRows = provisionalVariantIds.length
    ? await queryRows(supabase.schema('api').from('catalogue_cards')
      .select('variant_id,set_id,language_code,variant_code,finish_code')
      .in('variant_id', provisionalVariantIds)
      .limit(5000))
    : [];
  return ownedRows.map((row) => resolveOwnedProviderVariant(row, identifierRows, catalogueRows));
}

export async function runOwnerProviderRefresh({ supabase, refreshExactProviderEstimate, ownerId, limit, dryRun }) {
  const ownedRows = await readOwnedRows(supabase, ownerId, limit);
  const resolved = await resolveOwnedCandidates(supabase, ownedRows);
  // The same owned identity can appear through multiple binder rows. One
  // exact provider snapshot is sufficient for that canonical variant.
  const selected = [...new Map(resolved.filter((result) => result.ok)
    .map((result) => [result.variantId, result])).values()].slice(0, limit);
  const summary = { ...summariseOwnerPriceRefresh(resolved), selected: selected.length, refreshed: 0, unavailable: 0, failed: 0, dryRun };
  if (dryRun) return summary;

  for (const item of selected) {
    try {
      await refreshExactProviderEstimate(item.variantId, {
        productType: 'raw_card', condition: 'near_mint', currency: 'GBP',
      });
      summary.refreshed += 1;
    } catch (error) {
      // The exact service deliberately rejects missing/ambiguous aliases and
      // unavailable current quotes. Keep the scheduled run bounded and report
      // those as unavailable without substituting another provider or finish.
      const code = String(error?.code ?? '');
      if (['unresolved_provider_identity', 'ambiguous_provider_identity', 'exact_provider_quote_unavailable'].includes(code)) summary.unavailable += 1;
      else summary.failed += 1;
    }
  }
  return summary;
}

async function main() {
  const { limit, dryRun } = parseOwnerPriceRefreshArguments(process.argv.slice(2));
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
