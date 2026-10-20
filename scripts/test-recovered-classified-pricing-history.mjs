import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

// Offline preservation check only. This never connects to or migrates a database.
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const receipt = JSON.parse(read('docs/releases/pricing-history-reconciliation-20261020.json'));
assert.equal(receipt.recoveredFrom, 'f964524be042219a343bed5d896a0f279cf80888');
assert.equal(receipt.originalFiles.length, 11);
assert.equal(new Set(receipt.originalFiles.map((entry) => entry.path)).size, 11);
for (const entry of receipt.originalFiles) {
  const content = Buffer.from(read(entry.path), 'utf8');
  const blob = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
  assert.equal(blob, entry.gitBlob, `Recovered historical bytes changed: ${entry.path}`);
}

const coverage = JSON.parse(read('docs/releases/pricing-classified-coverage-20261005.json'));
const recovery = JSON.parse(read('docs/releases/pricing-recovery-20261005.json'));
const aliases = [
  ...coverage.productionIntegrity.migrations.map(({ name, version }) => ({
    name, production: version,
    stage: coverage.stagingIntegrity.migrations.find((entry) => entry.name === name)?.version,
  })),
  ...recovery.migrations,
];
assert.equal(aliases.length, 7);
assert.equal(new Set(aliases.map((entry) => entry.name)).size, 7);
assert.equal(new Set(aliases.flatMap((entry) => [entry.production, entry.stage])).size, 14);
assert.deepEqual(receipt.migrations, aliases);
for (const entry of aliases) {
  assert.match(entry.production, /^20261005\d{6}$/);
  assert.match(entry.stage, /^20261005\d{6}$/);
  assert.notEqual(entry.production, entry.stage, 'Retain the recorded staging version alias.');
  const path = `supabase/migrations/${entry.production}_${entry.name}.sql`;
  assert.ok(receipt.originalFiles.some((file) => file.path === path));
  assert.ok(!existsSync(`supabase/migrations/${entry.stage}_${entry.name}.sql`),
    'Do not introduce duplicate staging-alias migrations.');
  const recorded = recovery.migrationBodyHashes.find((item) => item.name === entry.name);
  if (recorded) {
    assert.equal(createHash('sha256').update(read(path)).digest('hex'), recorded.sha256NormalizedLf);
  }
}
assert.deepEqual(coverage.productionIntegrity.functions, coverage.stagingIntegrity.functions,
  'The historical classification function/configuration evidence must agree.');
assert.ok(coverage.productionIntegrity.functions.some((item) => item.proname === 'read_pricing_classifications'));
for (const item of coverage.productionIntegrity.functions) {
  assert.equal(item.anon_execute, false);
  assert.equal(item.authenticated_execute, false);
  assert.equal(item.service_execute, true);
}
assert.equal(recovery.functionProof.length, 2);
assert.deepEqual(recovery.functionProof[0].data, recovery.functionProof[1].data,
  'The historical retained-observation function/configuration evidence must agree.');
for (const item of recovery.functionProof[0].data) {
  assert.equal(item.authenticated, false);
  assert.equal(item.service, true);
}
console.log('Recovered classification history: 11 original blobs, 7 production/staging aliases and recorded hashes pass. No live database verification performed.');
