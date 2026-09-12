import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
console.log('Gateway release config guards passed.');
