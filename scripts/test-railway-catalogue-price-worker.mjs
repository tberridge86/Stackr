import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runRailwayCataloguePriceWorker } from './run-railway-catalogue-price-worker.mjs';

const events = [];
let starts = 0;
const run = async () => { starts++; return 0; };
const log = (line) => events.push(JSON.parse(line));
const enabled = {
  STACKR_CATALOGUE_PRICE_WORKER_ENABLED: 'true',
  STACKR_CATALOGUE_BULK_PRICING_ENABLED: 'true',
  STACKR_CATALOGUE_PRICING_SCHEDULER: 'railway',
  STACKR_EXPECTED_SUPABASE_PROJECT_REF: 'a'.repeat(20),
  SUPABASE_URL: `https://${'a'.repeat(20)}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: ['test', 'secret', 'key'].join('-'),
};

for (const value of [undefined, '', 'false', 'TRUE', '1']) {
  assert.equal(await runRailwayCataloguePriceWorker({
    env: { ...enabled, STACKR_CATALOGUE_PRICE_WORKER_ENABLED: value }, run, log,
  }), 0);
}
assert.equal(starts, 0, 'disabled configurations must never invoke the writer');
assert.ok(events.every((event) => event.event === 'railway_catalogue_price_worker_disabled' && event.writesStarted === false));

for (const invalid of [
  { STACKR_CATALOGUE_PRICING_SCHEDULER: 'github' },
  { STACKR_CATALOGUE_PRICING_SCHEDULER: undefined },
  { STACKR_CATALOGUE_BULK_PRICING_ENABLED: 'false' },
  { STACKR_EXPECTED_SUPABASE_PROJECT_REF: undefined },
  { SUPABASE_URL: `https://${'b'.repeat(20)}.supabase.co` },
  { SUPABASE_SERVICE_ROLE_KEY: '' },
]) {
  await assert.rejects(() => runRailwayCataloguePriceWorker({ env: { ...enabled, ...invalid }, run, log }));
}
assert.equal(starts, 0, 'all activation checks must finish before writer startup');
assert.equal(await runRailwayCataloguePriceWorker({ env: enabled, run, log }), 0);
assert.equal(starts, 1);
assert.equal(await runRailwayCataloguePriceWorker({ env: enabled, run: async () => 124, log }), 124,
  'the existing deadline failure must remain visible');
await assert.rejects(() => runRailwayCataloguePriceWorker({
  env: enabled, run: async () => { throw new Error('synthetic startup failure'); }, log,
}), /synthetic startup failure/);

const config = JSON.parse(await readFile(new URL('../deploy/catalogue-price-worker/railway.json', import.meta.url), 'utf8'));
assert.equal(config.build.builder, 'DOCKERFILE');
assert.equal(config.build.dockerfilePath, 'deploy/catalogue-price-worker/Dockerfile');
assert.equal(config.deploy.startCommand, 'node scripts/run-railway-catalogue-price-worker.mjs');
assert.equal(config.deploy.restartPolicyType, 'NEVER');
assert.equal(Object.hasOwn(config.deploy, 'cronSchedule'), false, 'preparation must not activate a schedule');
assert.equal(Object.hasOwn(config.deploy, 'healthcheckPath'), false, 'a one-shot worker is not an HTTP service');
const docker = await readFile(new URL('../deploy/catalogue-price-worker/Dockerfile', import.meta.url), 'utf8');
assert.match(docker, /COPY scripts\/run-railway-catalogue-price-worker\.mjs \.\/scripts\//);
assert.match(docker, /CMD \["node", "scripts\/run-catalogue-price-cron\.mjs"\]/,
  'existing service entrypoints must not change during preparation');
console.log('Railway catalogue worker: inert defaults, activation gates, exact target, failure propagation and inactive config passed.');
