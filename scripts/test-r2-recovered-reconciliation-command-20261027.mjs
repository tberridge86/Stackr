import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { buildRecoveredReconciliationCommand } from './build-r2-recovered-reconciliation-command-20261027.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const entryOf = command => command.slice("node --input-type=module -e '".length, -1).replaceAll("'\\''", "'");

test('embedded modules preserve exact source bytes and generated entry has valid module syntax', () => {
  const inspector = "export const x = \"' $() ` \\\n private-value\";";
  const reconciler = 'export function createRecoveredRunReconciler() {}\n';
  const built = buildRecoveredReconciliationCommand(inspector, reconciler, inspector);
  const entry = entryOf(built.startCommand);
  const encoded = JSON.parse(entry.match(/^const encoded=(.+);$/m)[1]);
  assert.equal(gunzipSync(Buffer.from(encoded.inspector, 'base64')).toString(), inspector);
  assert.equal(gunzipSync(Buffer.from(encoded.reconciler, 'base64')).toString(), reconciler);
  assert.deepEqual(built.sourceHashes, { inspector: hash(inspector), reconciler: hash(reconciler), parentInspector: hash(inspector) });
  assert.equal(gunzipSync(Buffer.from(encoded.parentInspector, 'base64')).toString(), inspector);
  assert.equal(built.commandSha256, hash(built.startCommand));
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: entry, encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
});

test('wrong service rejects before supplied module execution and does not expose environment values', () => {
  const sentinel = 'PRIVATE_TEST_VALUE_DO_NOT_PRINT';
  const source = `console.log(${JSON.stringify(sentinel)}); throw new Error(${JSON.stringify(sentinel)});`;
  const built = buildRecoveredReconciliationCommand(source, source, source);
  const child = spawnSync('/bin/sh', ['-c', built.startCommand], {
    encoding: 'utf8', timeout: 5000,
    env: { ...process.env, RAILWAY_SERVICE_ID: 'wrong', SUPABASE_DB_URL: sentinel },
  });
  assert.equal(child.status, 1);
  assert.deepEqual(JSON.parse(child.stdout.trim()), {
    event: 'r2_reconciliation_failed', code: 'reconciliation_host_mismatch', runnerStarted: false, resumeAuthorized: false,
  });
  assert.ok(!(child.stdout + child.stderr).includes(sentinel));
});

test('empty and oversized sources cannot become a deployment command', () => {
  for (const value of ['', null, 'x'.repeat(262145)]) {
    assert.throws(() => buildRecoveredReconciliationCommand(value, 'export {};', 'export {};'), /reconciliation_source_bound/);
    assert.throws(() => buildRecoveredReconciliationCommand('export {};', value, 'export {};'), /reconciliation_source_bound/);
  }
});
