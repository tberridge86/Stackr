import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { runCardmarketDailyWorker } from './cardmarket-daily-worker.mjs';

const base = { STACKR_CARDMARKET_DAILY_WORKER_ENABLED: 'true', STACKR_CARDMARKET_CACHE_DIR: '/var/lib/cardmarket' };
const calls = [];
const main = async args => { calls.push(args); return { retained: true }; };

await assert.rejects(() => runCardmarketDailyWorker({ env: {}, main }), /disabled/);
assert.deepEqual(await runCardmarketDailyWorker({ env: base, main }), { retained: true });
assert.deepEqual(calls.pop(), ['--retain', `--cache-dir=${resolve(base.STACKR_CARDMARKET_CACHE_DIR)}`]);
await assert.rejects(() => runCardmarketDailyWorker({ env: { ...base, STACKR_CARDMARKET_PUBLIC_GUIDE_ENABLED: 'true' }, main }), /STACKR_EXPECTED_SUPABASE_PROJECT_REF/);
const applyEnv = {
  ...base,
  STACKR_CARDMARKET_PUBLIC_GUIDE_ENABLED: 'true',
  STACKR_EXPECTED_SUPABASE_PROJECT_REF: 'lmwfhvexfcoyeuoyrlco',
  SUPABASE_URL: 'https://lmwfhvexfcoyeuoyrlco.supabase.co',
  STACKR_CARDMARKET_MAPPING_LEDGER_PATH: '/var/lib/cardmarket/reviewed/mappings.json',
  STACKR_CARDMARKET_CHECKPOINT_PATH: '/var/lib/cardmarket/checkpoints/daily.json',
};
await runCardmarketDailyWorker({ env: applyEnv, main });
assert.deepEqual(calls.pop(), [
  '--retain', `--cache-dir=${resolve(base.STACKR_CARDMARKET_CACHE_DIR)}`, '--apply',
  `--mapping=${resolve(applyEnv.STACKR_CARDMARKET_MAPPING_LEDGER_PATH)}`, `--checkpoint=${resolve(applyEnv.STACKR_CARDMARKET_CHECKPOINT_PATH)}`, '--max-pages=500',
]);
await assert.rejects(() => runCardmarketDailyWorker({ env: { ...applyEnv, STACKR_CARDMARKET_MAPPING_LEDGER_PATH: '/tmp/mappings.json' }, main }), /inside STACKR_CARDMARKET_CACHE_DIR/);
await assert.rejects(() => runCardmarketDailyWorker({ env: { ...base, STACKR_CARDMARKET_CACHE_DIR: 'relative' }, main }), /absolute mounted-volume path/);
console.log('Cardmarket daily worker retains on a mounted volume and requires a pinned target plus reviewed-volume ledger before general-price writes.');
