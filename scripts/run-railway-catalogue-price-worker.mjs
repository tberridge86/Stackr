import { pathToFileURL } from 'node:url';
import { runPriceCron } from './run-catalogue-price-cron.mjs';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';

/** The prepared Railway service is inert until its reviewed cutover is enabled. */
export async function runRailwayCataloguePriceWorker({
  env = process.env,
  run = runPriceCron,
  log = console.info,
} = {}) {
  if (env.STACKR_CATALOGUE_PRICE_WORKER_ENABLED !== 'true') {
    log(JSON.stringify({ event: 'railway_catalogue_price_worker_disabled', writesStarted: false }));
    return 0;
  }
  if (env.STACKR_CATALOGUE_PRICING_SCHEDULER !== 'railway') {
    throw new Error('Catalogue worker requires explicit Railway scheduler ownership.');
  }
  if (env.STACKR_CATALOGUE_BULK_PRICING_ENABLED !== 'true') {
    throw new Error('Catalogue worker requires the separate bulk pricing activation flag.');
  }
  // Validate all activation controls before spawning the existing writer. This
  // helper is pure: it cannot obtain a lease, contact a provider or write rows.
  resolvePricingV2SupabaseTarget(env);
  if (!String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '').trim()) {
    throw new Error('Catalogue worker requires a server-only database credential.');
  }
  return run();
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runRailwayCataloguePriceWorker().then((code) => { process.exitCode = code; }).catch(() => {
    // Configuration and downstream errors must not echo environment values.
    console.error('Railway catalogue price worker activation or execution failed.');
    process.exitCode = 1;
  });
}
