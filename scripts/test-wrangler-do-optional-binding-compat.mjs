import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mapDurableObjectBinding, patchWranglerCli } from './deploy/patch-wrangler-do-optional-binding.mjs';

const cli = 'gateway/node_modules/wrangler/wrangler-dist/cli.js';
const require = createRequire(import.meta.url);
const source = readFileSync(cli, 'utf8');
assert.match(source, /\.\.\.binding\.script_name === void 0 \? \{\} : \{ script_name: binding\.script_name \}/);
assert.match(source, /\.\.\.binding\.environment === void 0 \? \{\} : \{ environment: binding\.environment \}/);
const module = { exports: {} };
const diff = new Function('require', 'exports', 'module', '__filename', '__dirname', `${source}; return require_lib4();`)(createRequire(new URL(`../${cli}`, import.meta.url)), module.exports, module, cli, 'gateway/node_modules/wrangler/wrangler-dist');
const local = { durable_objects: { bindings: [{ name: 'GATEWAY_STATE', class_name: 'GatewayState' }] } };
assert.equal(diff.diff({ durable_objects: { bindings: [mapDurableObjectBinding({ name: 'GATEWAY_STATE', class_name: 'GatewayState' })] } }, local), undefined);
for (const binding of [
  { name: 'OTHER', class_name: 'GatewayState' },
  { name: 'GATEWAY_STATE', class_name: 'OtherState' },
  { name: 'GATEWAY_STATE', class_name: 'GatewayState', script_name: 'other-worker' },
  { name: 'GATEWAY_STATE', class_name: 'GatewayState', environment: 'staging' },
]) assert.notEqual(diff.diff({ durable_objects: { bindings: [mapDurableObjectBinding(binding)] } }, local), undefined, 'changed durable-object identity must remain a diff');
assert.notEqual(diff.diff({ durable_objects: { bindings: [] } }, local), undefined, 'missing durable-object binding must remain a diff');
assert.throws(() => patchWranglerCli({ packagePath: 'gateway/package.json', cliPath: cli }), /unsupported_wrangler_version/);
assert.throws(() => patchWranglerCli({ cliPath: 'gateway/package.json' }), /unexpected_wrangler_cli_sha256/);
console.log('Wrangler Durable Object optional-binding compatibility guards passed.');
