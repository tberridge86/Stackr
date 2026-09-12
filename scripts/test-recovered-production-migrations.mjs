import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const receiptPath = 'docs/releases/backend-migration-ledger-reconciliation-20260912.json';
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
const groups = [
  ['PR #168 recovered search migrations', receipt.pr168RecoveredSearchMigrations, 5],
  ['newly recovered production migrations', receipt.newlyRecoveredProductionMigrations, 6],
];

assert.equal(receipt.schemaVersion, 'stackr-live-migration-ledger-reconciliation-v1.0.0');
assert.match(receipt.repository.baseSha, /^[0-9a-f]{40}$/);
assert.equal(receipt.productionMutationPerformed, false);
assert.equal(receipt.stagingMutationPerformed, false);

for (const [label, entries, expectedCount] of groups) {
  assert.equal(entries.length, expectedCount, `${label} count changed`);
  for (const entry of entries) {
    assert.equal(entry.liveStatementCount, 1, `${entry.version} no longer has one recorded statement`);
    assert.equal(entry.exactRecordedStatementMatch, true, `${entry.version} was not reconciled`);
    assert.equal(entry.sourceFile, `${entry.version}_${entry.name}.sql`);
    const file = readFileSync(`supabase/migrations/${entry.sourceFile}`);
    assert.equal(file.at(-1), 10, `${entry.sourceFile} must retain a repository final newline`);
    const recordedStatement = file.subarray(0, -1);
    assert.equal(recordedStatement.length, entry.liveStatementBytes, `${entry.version} byte count drifted`);
    assert.equal(
      createHash('sha256').update(recordedStatement).digest('hex'),
      entry.liveStatementSha256,
      `${entry.version} differs from the production-recorded statement`,
    );
  }
}

console.log('Recovered production migration statements remain byte-identical to the recorded ledger.');
