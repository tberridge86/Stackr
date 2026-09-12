import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WRANGLER_VERSION = '4.131.1';
export const EXPECTED_CLI_SHA256 = 'dadbd16d62d6b104d8f711ff91d6b5bf08b58cf01986209c9a06c00f0631c786';
const original = `              {\n                name: binding.name,\n                class_name: binding.class_name,\n                script_name: binding.script_name,\n                environment: binding.environment\n              }`;
const replacement = `              {\n                name: binding.name,\n                class_name: binding.class_name,\n                ...binding.script_name === void 0 ? {} : { script_name: binding.script_name },\n                ...binding.environment === void 0 ? {} : { environment: binding.environment }\n              }`;

export function patchWranglerCli({ packagePath = 'gateway/node_modules/wrangler/package.json', cliPath = 'gateway/node_modules/wrangler/wrangler-dist/cli.js' } = {}) {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  assert.equal(pkg.version, WRANGLER_VERSION, `unsupported_wrangler_version:${pkg.version}`);
  const source = readFileSync(cliPath, 'utf8');
  const hash = createHash('sha256').update(source).digest('hex');
  assert.equal(hash, EXPECTED_CLI_SHA256, `unexpected_wrangler_cli_sha256:${hash}`);
  assert.equal(source.split(original).length - 1, 1, 'expected_wrangler_do_adapter_occurrence_missing_or_ambiguous');
  assert.equal(source.includes(replacement), false, 'wrangler_do_adapter_already_patched');
  writeFileSync(cliPath, source.replace(original, replacement));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) patchWranglerCli();
