import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNTIME_VAR_NAMES = Object.freeze(['BACKEND_ORIGIN', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'STACKR_PRICING_ACCESS_MODE', 'STACKR_PRICING_OWNER_USER_ID']);

export function buildGatewayReleaseConfig(source, runtimeVars) {
  const config = structuredClone(source);
  const production = config?.env?.production;
  assert(production && typeof production === 'object', 'production gateway configuration is required');
  assert.deepEqual(production.routes, [{ pattern: 'api.stackrtcg.com', custom_domain: true, zone_name: 'stackrtcg.com', enabled: true, previews_enabled: false }], 'production route must preserve the live custom-domain configuration');
  assert.deepEqual(config.observability, { enabled: true, head_sampling_rate: 0.1, redact_query_string: false, logs: { enabled: true, invocation_logs: true, head_sampling_rate: 0.1 }, traces: { enabled: false, head_sampling_rate: 0.1 } }, 'tracked observability must preserve the live production settings');
  assert.deepEqual(production.durable_objects, { bindings: [{ name: 'GATEWAY_STATE', class_name: 'GatewayState' }] }, 'production durable-object binding must preserve the live identity');
  assert.deepEqual(config.exports, { GatewayState: { type: 'durable-object', storage: 'sqlite' } }, 'durable-object export must preserve the live storage declaration');
  const supplied = Object.keys(runtimeVars ?? {}).sort();
  assert.deepEqual(supplied, [...RUNTIME_VAR_NAMES].sort(), 'runtime bindings must be the exact reviewed set');
  for (const name of RUNTIME_VAR_NAMES) {
    assert.equal(typeof runtimeVars[name], 'string', `${name} must be a string`);
    assert(runtimeVars[name].trim(), `${name} must be non-empty`);
    assert(!(name in production.vars), `${name} must not be persisted in tracked production vars`);
  }
  config.env.production.vars = { ...production.vars, ...runtimeVars };
  return config;
}

function argument(name) { return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? null; }
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const output = argument('--output');
  assert(output, 'Supply --output=<same-directory temporary config path>.');
  const source = JSON.parse(readFileSync('gateway/wrangler.jsonc', 'utf8'));
  const runtimeVars = Object.fromEntries(RUNTIME_VAR_NAMES.map((name) => [name, String(process.env[name] ?? '')]));
  writeFileSync(output, `${JSON.stringify(buildGatewayReleaseConfig(source, runtimeVars), null, 2)}\n`, { mode: 0o600 });
}
