import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { buildRecoveredMigrationCommand } from './build-r2-recovered-command-20261027.mjs';

const files = { inspector: './inspect-r2-optimised-tail-20261027.mjs', reconciler: './reconcile-r2-interrupted-runs-20261027.mjs',
  launcher: './launch-r2-recovered-run-20261027.mjs', receipt: './r2-recovery-receipt-20261027.mjs',
  runtime: './lib/r2-runtime-snapshot-20261026b.mjs', coverage: './lib/r2-final-coverage-snapshot-20261026b.mjs' };
const sources = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, file]) =>
  [name, await readFile(new URL(file, import.meta.url), 'utf8')])));
const built = buildRecoveredMigrationCommand(sources);
const entry = built.startCommand.slice("node --input-type=module -e '".length, -1).replaceAll("'\\''", "'");

test('production composition preserves six reviewed sources byte-for-byte with valid module syntax', () => {
  const encoded = JSON.parse(entry.match(/^const encoded=(.+);$/m)[1]);
  for (const [name, source] of Object.entries(sources)) {
    assert.equal(gunzipSync(Buffer.from(encoded[name], 'base64')).toString(), source);
    assert.equal(built.sourceHashes[name], createHash('sha256').update(source).digest('hex'));
  }
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: entry, encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
});

test('wrong service cannot import runtime or invoke either reconciliation or uploads', () => {
  const secret = 'PRIVATE_COMPOSITION_TEST';
  const child = spawnSync('/bin/sh', ['-c', built.startCommand], { encoding: 'utf8', timeout: 5000,
    env: { ...process.env, RAILWAY_SERVICE_ID: 'wrong', SUPABASE_DB_URL: secret } });
  assert.equal(child.status, 1);
  assert.deepEqual(JSON.parse(child.stdout.trim()), { event: 'recovered_production_entry_failed',
    code: 'recovery_host_mismatch', requiresReconciliation: true });
  assert.ok(!(child.stdout + child.stderr).includes(secret));
});

test('changed production runtime, missing modules, or oversized source cannot produce a recovery command', () => {
  assert.throws(() => buildRecoveredMigrationCommand({ ...sources, runtime: sources.runtime + '\n' }), /recovery_production_runtime_changed/);
  assert.throws(() => buildRecoveredMigrationCommand({ ...sources, coverage: sources.coverage + '\n' }), /recovery_production_runtime_changed/);
  const missing = { ...sources }; delete missing.receipt;
  assert.throws(() => buildRecoveredMigrationCommand(missing), /recovery_source_set_invalid/);
  assert.throws(() => buildRecoveredMigrationCommand({ ...sources, inspector: 'x'.repeat(262145) }), /recovery_source_bound/);
});
