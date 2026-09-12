import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildGatewayReleaseConfig, RUNTIME_VAR_NAMES } from './deploy/write-gateway-release-config.mjs';

const source = JSON.parse(readFileSync('gateway/wrangler.jsonc', 'utf8'));
const pristine = JSON.stringify(source);
const vars = Object.fromEntries(RUNTIME_VAR_NAMES.map((name) => [name, `reviewed-${name}`]));
const output = buildGatewayReleaseConfig(source, vars);
assert.equal(JSON.stringify(source), pristine, 'tracked baseline must remain unchanged');
assert.deepEqual(Object.fromEntries(RUNTIME_VAR_NAMES.map((name) => [name, output.env.production.vars[name]])), vars);
assert.throws(() => buildGatewayReleaseConfig(source, { ...vars, BACKEND_ORIGIN: '' }), /BACKEND_ORIGIN must be non-empty/);
assert.throws(() => buildGatewayReleaseConfig(source, { ...vars, EXTRA: 'unexpected' }), /exact reviewed set/);
const invalidRoute = structuredClone(source); invalidRoute.env.production.routes[0].enabled = false;
assert.throws(() => buildGatewayReleaseConfig(invalidRoute, vars), /production route/);
const persistedBinding = structuredClone(source); persistedBinding.env.production.vars.BACKEND_ORIGIN = 'unexpected';
assert.throws(() => buildGatewayReleaseConfig(persistedBinding, vars), /must not be persisted/);
const outputPath = join('gateway', `.gateway-release-config-test-${process.pid}.json`);
const cli = (env) => spawnSync(process.execPath, ['scripts/deploy/write-gateway-release-config.mjs', `--output=${outputPath}`], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, ...env } });
try {
  const success = cli(vars);
  assert.equal(success.status, 0, success.stderr);
  assert(existsSync(outputPath), 'CLI must create its requested temporary config');
  const generated = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.deepEqual(Object.fromEntries(RUNTIME_VAR_NAMES.map((name) => [name, generated.env.production.vars[name]])), vars);
  assert.deepEqual(generated.env.production.routes, source.env.production.routes, 'CLI must preserve the tracked route');
assert.deepEqual(generated.observability, source.observability, 'CLI must preserve tracked observability');
  assert.deepEqual(generated.env.production.durable_objects, source.env.production.durable_objects, 'CLI must preserve the durable-object binding');
  assert.deepEqual(generated.exports, source.exports, 'CLI must preserve the durable-object export');
  rmSync(outputPath);
  const missing = cli({ ...vars, BACKEND_ORIGIN: '' });
  assert.notEqual(missing.status, 0, 'CLI must reject a missing runtime binding');
  assert.match(missing.stderr, /BACKEND_ORIGIN must be non-empty/);
  assert(!existsSync(outputPath), 'failed CLI must not leave a generated config');
} finally {
  rmSync(outputPath, { force: true });
}
console.log('Gateway release config guards passed.');
