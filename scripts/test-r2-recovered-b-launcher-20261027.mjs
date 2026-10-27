import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveredMigrationLauncher, RECOVERED_RUN_ID } from './launch-r2-recovered-b-run-20261027.mjs';

function certificate() { return {"schemaVersion": 1, "kind": "stackr-r2-recovered-run-reconciliation", "status": "reconciled", "reconciliationPassed": true, "sourceCommit": "6dfe188166df76b41d44801ab66970b0a3881ae5", "projectRef": "oakdbbzdqwurpjnoqhmu", "databaseReadOnly": true, "transactionRolledBack": true, "postcheckPassed": true, "evidenceModified": false, "resumeAuthorized": false, "runs": [{"runId": "production-recovered-20261027a", "evidenceSha256": "97f03b3fbaf5fd36c7ef3c209e8ef33d4919a7159b4d41c3e7781adaf79c8c8e", "checkpointSha256": "6a1335924d03d03d3bcc181844370c9a2e7bc48d1ad7acfab52f93324e1b7251", "completedBatches": 229, "inventoryRows": 5750, "journalPublishedAssets": 5733}], "rowCounts": {"current": 5750, "unique": 5750, "inheritedBaseline": 53001, "historicalSupersessions": 9}, "expectationSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "databaseChecks": [{"checkedAt": "2026-10-27T13:00:00Z", "matchedRows": 5750, "pushed": 58734, "remaining": 3364, "totalEligible": 62098}, {"checkedAt": "2026-10-27T13:00:00Z", "matchedRows": 5750, "pushed": 58734, "remaining": 3364, "totalEligible": 62098}], "parentAcceptance": {"runId": "production-recovered-20261027a", "receiptSha256": "45d5eb8d9e55cd014a0e43f49a4014581bd1936181c8cf44a09bb02b6c366d91", "certificateSha256": "8c171b74bbde16a0645fd0aa0801139c36b3ed5f3277a6309425ebdef151386c", "inheritedPushed": 53001, "eligibleTotal": 62098, "freshBaselineRowsCompared": false}, "parentManifests": [{"runId": "production-optimised-20261026b", "evidenceSha256": "d06e9a223cd8a7985ec2cc641d03eceea32f4c6eb7cffc7275e41927f94c0e71", "checkpointSha256": "d1728f7eec12c65b31a5fe442c1ecb63362ba7bcb54812f8a28106b60d1f077f", "unchanged": true}, {"runId": "production-resumed-20261026a", "evidenceSha256": "83755a507c55824e96f5dee71085399891e4a1b5bbc329794dcc6a3acfc7c661", "checkpointSha256": "b59da552b04a09fe066eb5036de3f624b9c294f058bce6d214f0039cdd0401b8", "unchanged": true}], "historicalLinks": [{"rowId": "d5056127-65e8-4706-bda1-b2a456715c9d", "beforeSnapshotSha256": "b345dd4e1891d93eb0352ea6df21b7eeff133af7d841dbf11c2317bb3296745f", "afterSnapshotSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "sequence": 1, "operationId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "receiptSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}, {"rowId": "d5059ad3-69f2-49cb-b2de-884fab164f26", "beforeSnapshotSha256": "179df69124897417dd583ec6623dc14cbac36d3a8159a445b18b36348a5dd14d", "afterSnapshotSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "sequence": 1, "operationId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "receiptSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}, {"rowId": "d508764e-03b4-470b-a74f-5db5b1e76898", "beforeSnapshotSha256": "42ae34712c934df0eb80e66e73d94c722098aa0a20107e34abe08ab62dd85510", "afterSnapshotSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "sequence": 1, "operationId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "receiptSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}, {"rowId": "d509e99a-633e-4132-a88e-ce68cce56bb5", "beforeSnapshotSha256": "3c6693d3e18808f99681d525af0f2f6731233d3f184573ab59d7c965e65538a3", "afterSnapshotSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "sequence": 1, "operationId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "receiptSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}, {"rowId": "d50ac605-1212-4f81-aa2f-b89063026a8c", "beforeSnapshotSha256": "cc4bee90554664768b58a60e11300b5d10c440b2715cc4ec070ba42bac4685e2", "afterSnapshotSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "sequence": 1, "operationId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "receiptSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}, {"rowId": "d50b4c8c-d641-4ca4-9b5b-3dc20bc253c0", "beforeSnapshotSha256": "c0a6ee6da48e33b9bb43da8876a6f66d0fd8dbda5be83be0c5b883f7bddd39ae", "afterSnapshotSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "sequence": 1, "operationId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "receiptSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}, {"rowId": "d51028c1-645c-4a13-9c6b-34cfbee45f16", "beforeSnapshotSha256": "588dfa0f6cf79c3a69790cffecd2ef1c0d111d48a24de11c0efdd223076bb525", "afterSnapshotSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "sequence": 1, "operationId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "receiptSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}, {"rowId": "d511b5c7-5c35-4aa8-bfba-b33c45c360da", "beforeSnapshotSha256": "b39f46df4f7299a0336d721366aabe29b8d546bef49065677ebf18e1f3ca5e05", "afterSnapshotSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "sequence": 1, "operationId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "receiptSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}, {"rowId": "d512f6f9-5370-4f74-9564-b3bb818accb1", "beforeSnapshotSha256": "0ec2357bb6ff5950f62cc7d60aca86e4ad9b47c3685ceb3ab90f401670c27550", "afterSnapshotSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "sequence": 1, "operationId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "receiptSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}], "publicVerification": {"objectsVerified": 34, "bytesVerified": 1000000, "proofSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}, "sourceFailureRechecks": [{"rowId": "efa53563-2d1f-4eeb-8665-efa3a8ed5e4f", "role": "search-result", "status": 200, "sha256": "7c83bcee90f015b28de1519aff90b589a3654150a5b438158d65a4a89c95c543", "byteSize": 3480, "verified": true}]}; }
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
      return { runId: RECOVERED_RUN_ID, status: 'traversal_complete', completedBatches: 364, publishedAssets: 3364 }; },
    verifyCoverage: async () => { calls.push('coverage'); return { status: 'coverage_complete' }; },
    readCapacity: async () => ({ admitted: true }), report: value => events.push(value),
    schedule: () => 1, unschedule: () => calls.push('unschedule'),
  };
  return { calls, events, proof, dependencies, run: () => createRecoveredMigrationLauncher(dependencies)({ env: {} }) };
}

test('fresh validated continuation persists acceptance before running and verifies final coverage', async () => {
  const f = fixture(); const result = await f.run();
  assert.equal(result.publishedAssets, 3364);
  assert.deepEqual(f.calls, ['exists', 'reconcile', 'exists', 'persist', 'runtime', 'runner', 'coverage', 'unschedule', 'close']);
  assert.equal(f.events[0].event, 'recovered_migration_reconciliation_accepted');
  assert.equal(f.events[0].matchedRows, 5750);
});

test('existing successor is refused before obsolete parent revalidation or any write', async () => {
  const f = fixture(); f.dependencies.successorExists = async () => true;
  await assert.rejects(f.run(), error => error.code === 'recovery_successor_requires_own_reconciliation');
  assert.deepEqual(f.calls, []);
});

test('missing source proof, historical drift, changed scope, or missing rollback cannot start a worker', async () => {
  for (const mutate of [
    proof => { proof.sourceFailureRechecks[0].verified = false; },
    proof => { proof.historicalLinks[0].beforeSnapshotSha256 = 'f'.repeat(64); },
    proof => { proof.databaseChecks[1].remaining = 3363; },
    proof => { proof.transactionRolledBack = false; },
    proof => { proof.parentAcceptance.receiptSha256 = 'f'.repeat(64); },
    proof => { proof.parentManifests[0].unchanged = false; },
    proof => { proof.historicalLinks.pop(); },
    proof => { proof.parentAcceptance.freshBaselineRowsCompared = true; },
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
