import 'dotenv/config';
import { mainClassifyCataloguePricing } from './classify-catalogue-pricing.mjs';
import { isAbsolute, relative, resolve } from 'node:path';
import { mainCardmarketDailyGuide } from './cardmarket-daily-guide.mjs';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';

function enabled(value) { return value === 'true'; }
function requiredPath(value, label) {
  if (typeof value !== 'string' || !value.trim() || !isAbsolute(value)) throw Error(`${label} must be an absolute mounted-volume path.`);
  return resolve(value);
}
function inside(root, path, label) {
  const candidate = requiredPath(path, label);
  const distance = relative(root, candidate);
  if (distance === '..' || distance.startsWith(`..${String.fromCharCode(92)}`) || distance.startsWith('../') || isAbsolute(distance)) throw Error(`${label} must be inside STACKR_CARDMARKET_CACHE_DIR.`);
  return candidate;
}

/**
 * Railway cron entry point. It retains Cardmarket's two public files on the
 * attached volume every day; it only persists reviewed mappings and blended
 * general estimates after the separate public-guide gate is enabled.
 */
export async function runCardmarketDailyWorker({ env = process.env, main = mainCardmarketDailyGuide } = {}) {
  if (!enabled(env.STACKR_CARDMARKET_DAILY_WORKER_ENABLED)) throw Error('Cardmarket daily worker is disabled.');
  const cacheDir = requiredPath(env.STACKR_CARDMARKET_CACHE_DIR, 'STACKR_CARDMARKET_CACHE_DIR');
  const apply = enabled(env.STACKR_CARDMARKET_PUBLIC_GUIDE_ENABLED);
  const args = ['--retain', `--cache-dir=${cacheDir}`];
  if (!apply) return main(args);

  // Fail before either provider or database work when the deployment has not
  // explicitly named the only project it may mutate.
  resolvePricingV2SupabaseTarget(env);
  const mapping = inside(cacheDir, env.STACKR_CARDMARKET_MAPPING_LEDGER_PATH, 'STACKR_CARDMARKET_MAPPING_LEDGER_PATH');
  const checkpoint = inside(cacheDir, env.STACKR_CARDMARKET_CHECKPOINT_PATH, 'STACKR_CARDMARKET_CHECKPOINT_PATH');
  args.push('--apply', `--mapping=${mapping}`, `--checkpoint=${checkpoint}`, '--max-pages=500');
  return main(args);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/cardmarket-daily-worker.mjs')) {
  runCardmarketDailyWorker().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }).finally(async () => {
    if (process.env.STACKR_CARDMARKET_DAILY_WORKER_ENABLED === 'true'
      && process.env.STACKR_CARDMARKET_PUBLIC_GUIDE_ENABLED === 'true') {
      try { await mainClassifyCataloguePricing(['--apply']); }
      catch (error) { console.error(`Classification failed: ${error.message}`); process.exitCode = 1; }
    }
  });
}
