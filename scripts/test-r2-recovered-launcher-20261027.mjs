import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveredMigrationLauncher, RECOVERED_RUN_ID } from './launch-r2-recovered-run-20261027.mjs';

function certificate() {
  return { schemaVersion: 1, kind: 'stackr-r2-interrupted-run-reconciliation', status: 'reconciled',
    reconciliationPassed: true, sourceCommit: '6dfe188166df76b41d44801ab66970b0a3881ae5',
    projectRef: 'oakdbbzdqwurpjnoqhmu', databaseReadOnly: true, transactionRolledBack: true,
    postcheckPassed: true, evidenceModified: false, resumeAuthorized: false,
    runs: [
      { runId: 'production-optimised-20261026b', evidenceSha256: 'd06e9a223cd8a7985ec2cc641d03eceea32f4c6eb7cffc7275e41927f94c0e71',
        checkpointSha256: 'd1728f7eec12c65b31a5fe442c1ecb63362ba7bcb54812f8a28106b60d1f077f',
        completedBatches: 1065, inventoryRows: 26650, journalPublishedAssets: 26641 },
      { runId: 'production-resumed-20261026a', evidenceSha256: '83755a507c55824e96f5dee71085399891e4a1b5bbc329794dcc6a3acfc7c661',
        checkpointSha256: 'b59da552b04a09fe066eb5036de3f624b9c294f058bce6d214f0039cdd0401b8',
        completedBatches: 67, inventoryRows: 1700, journalPublishedAssets: 1699 },
    ],
    rowCounts: { current: 26650, prior: 1700, unique: 28349, historicalOverlap: 1 }, expectationSha256: 'a'.repeat(64),
    databaseChecks: [0, 1].map(() => ({ checkedAt: '2026-10-27T09:00:00Z', matchedRows: 28349, pushed: 53001, remaining: 9097, totalEligible: 62098 })),
    historicalLink: { rowId: '62db634c-943e-4570-a606-d1039746a477',
      beforeSnapshotSha256: '93e7cf97672dc35dfc5caedb45523442a7314b1b15190e962bb063fc89aee2e7',
      afterSnapshotSha256: '199a02febbd5251c344a6d193be9e61bd4790ee50f72953f2a1a9904aac6ab02',
      sequence: 1, operationId: 'b'.repeat(64), receiptSha256: 'c'.repeat(64), objectsVerified: 4 },
    publicVerification: { objectsVerified: 72, bytesVerified: 1000000, proofSha256: 'd'.repeat(64) },
    sourceFailureRecheck: { rowId: 'd50b4c8c-d641-4ca4-9b5b-3dc20bc253c0', role: 'detail-page', status: 200,
      sha256: '9408ea91152362549183668e0d2f600bcbdd9459bf52dc80f1cd340e5142e8c2', byteSize: 146338, verified: true },
  };
}
function fixture() {
  const calls = [], events = [], proof = certificate();
  const dependencies = {
    reconcile: async () => { calls.push('reconcile'); return proof; },
    successorExists: async () => { calls.push('exists'); return false; },
    persistAcceptance: async value => { calls.push('persist'); assert.equal(value.runId, RECOVERED_RUN_ID);
      assert.equal(value.certificate, proof); assert.equal(value.parentEvidencePreserved, true); return 'e'.repeat(64); },
    createRuntime: () => { calls.push('runtime'); return { runCli() {}, metrics: () => ({}), close: async () => { calls.push('close'); } }; },
    runRunner: async input => { calls.push('runner'); assert.ok(input.argv.includes('--resume=false'));
      assert.ok(input.argv.includes('--run-id=' + RECOVERED_RUN_ID)); assert.ok(input.argv.includes('--concurrency=8'));
      return { runId: RECOVERED_RUN_ID, status: 'traversal_complete', completedBatches: 364, publishedAssets: 9097 }; },
    verifyCoverage: async () => { calls.push('coverage'); return { status: 'coverage_complete' }; },
    readCapacity: async () => ({ admitted: true }), report: value => events.push(value),
    schedule: () => 1, unschedule: () => calls.push('unschedule'),
  };
  return { calls, events, proof, dependencies, run: () => createRecoveredMigrationLauncher(dependencies)({ env: {} }) };
}

test('fresh validated continuation persists acceptance before running and verifies final coverage', async () => {
  const f = fixture(); const result = await f.run();
  assert.equal(result.publishedAssets, 9097);
  assert.deepEqual(f.calls, ['exists', 'reconcile', 'exists', 'persist', 'runtime', 'runner', 'coverage', 'unschedule', 'close']);
  assert.equal(f.events[0].event, 'recovered_migration_reconciliation_accepted');
  assert.equal(f.events[0].matchedRows, 28349);
});

test('existing successor is refused before obsolete parent revalidation or any write', async () => {
  const f = fixture(); f.dependencies.successorExists = async () => true;
  await assert.rejects(f.run(), error => error.code === 'recovery_successor_requires_own_reconciliation');
  assert.deepEqual(f.calls, []);
});

test('missing source proof, historical drift, changed scope, or missing rollback cannot start a worker', async () => {
  for (const mutate of [
    proof => { proof.sourceFailureRecheck.verified = false; },
    proof => { proof.historicalLink.afterSnapshotSha256 = 'f'.repeat(64); },
    proof => { proof.databaseChecks[1].remaining = 9096; },
    proof => { proof.transactionRolledBack = false; },
    proof => { proof.runs[0].evidenceSha256 = 'f'.repeat(64); },
    proof => { proof.publicVerification.objectsVerified = 0; },
  ]) {
    const f = fixture(); mutate(f.proof); await assert.rejects(f.run());
    assert.ok(!f.calls.includes('persist')); assert.ok(!f.calls.includes('runtime')); assert.ok(!f.calls.includes('runner'));
  }
});

test('receipt persistence failure never starts uploads', async () => {
  const f = fixture(); f.dependencies.persistAcceptance = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(f.run(), /disk unavailable/); assert.ok(!f.calls.includes('runtime'));
});

test('interrupted successor closes runtime and requests its own reconciliation', async () => {
  const f = fixture(); f.dependencies.runRunner = async () => { throw Object.assign(new Error('private detail'), { code: 'runner_execution_incomplete' }); };
  await assert.rejects(f.run(), /private detail/);
  assert.equal(f.calls.at(-1), 'close'); assert.ok(!f.calls.includes('coverage'));
  assert.equal(f.events.at(-1).code, 'runner_execution_incomplete');
  assert.ok(!JSON.stringify(f.events).includes('private detail'));
});

test('capacity pause is not completion and final coverage failure is not a successful migration', async () => {
  const paused = fixture(); paused.dependencies.runRunner = async () => ({ runId: RECOVERED_RUN_ID, status: 'capacity_paused', publishedAssets: 25 });
  assert.equal((await paused.run()).status, 'capacity_paused'); assert.ok(!paused.calls.includes('coverage'));
  const failed = fixture(); failed.dependencies.verifyCoverage = async () => ({ status: 'coverage_incomplete' });
  await assert.rejects(failed.run(), error => error.code === 'recovery_final_coverage_incomplete');
  assert.equal(failed.calls.at(-1), 'close');
});
