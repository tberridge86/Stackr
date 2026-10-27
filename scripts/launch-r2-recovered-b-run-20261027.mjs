// A new linked continuation, never an in-place repair of interrupted evidence.
import { createHash } from 'node:crypto';

export const RECOVERED_RUN_ID = 'production-recovered-20261027b';
const CURRENT = 'production-recovered-20261027a';
const REF = 'oakdbbzdqwurpjnoqhmu';
const hash = value => createHash('sha256').update(value).digest('hex');
const SHA = /^[a-f0-9]{64}$/;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const check = (value, code) => { if (!value) fail(code); };

const PARENT_SOURCE_TAIL = [{"rowId": "d5056127-65e8-4706-bda1-b2a456715c9d", "beforeSnapshotSha256": "b345dd4e1891d93eb0352ea6df21b7eeff133af7d841dbf11c2317bb3296745f", "inventoryIndex": 16}, {"rowId": "d5059ad3-69f2-49cb-b2de-884fab164f26", "beforeSnapshotSha256": "179df69124897417dd583ec6623dc14cbac36d3a8159a445b18b36348a5dd14d", "inventoryIndex": 17}, {"rowId": "d508764e-03b4-470b-a74f-5db5b1e76898", "beforeSnapshotSha256": "42ae34712c934df0eb80e66e73d94c722098aa0a20107e34abe08ab62dd85510", "inventoryIndex": 18}, {"rowId": "d509e99a-633e-4132-a88e-ce68cce56bb5", "beforeSnapshotSha256": "3c6693d3e18808f99681d525af0f2f6731233d3f184573ab59d7c965e65538a3", "inventoryIndex": 19}, {"rowId": "d50ac605-1212-4f81-aa2f-b89063026a8c", "beforeSnapshotSha256": "cc4bee90554664768b58a60e11300b5d10c440b2715cc4ec070ba42bac4685e2", "inventoryIndex": 20}, {"rowId": "d50b4c8c-d641-4ca4-9b5b-3dc20bc253c0", "beforeSnapshotSha256": "c0a6ee6da48e33b9bb43da8876a6f66d0fd8dbda5be83be0c5b883f7bddd39ae", "inventoryIndex": 21}, {"rowId": "d51028c1-645c-4a13-9c6b-34cfbee45f16", "beforeSnapshotSha256": "588dfa0f6cf79c3a69790cffecd2ef1c0d111d48a24de11c0efdd223076bb525", "inventoryIndex": 22}, {"rowId": "d511b5c7-5c35-4aa8-bfba-b33c45c360da", "beforeSnapshotSha256": "b39f46df4f7299a0336d721366aabe29b8d546bef49065677ebf18e1f3ca5e05", "inventoryIndex": 23}, {"rowId": "d512f6f9-5370-4f74-9564-b3bb818accb1", "beforeSnapshotSha256": "0ec2357bb6ff5950f62cc7d60aca86e4ad9b47c3685ceb3ab90f401670c27550", "inventoryIndex": 24}];

export function validateRecoveryCertificate(c) {
  check(c?.schemaVersion===1 && c.kind==='stackr-r2-recovered-run-reconciliation' && c.status==='reconciled'
    && c.reconciliationPassed===true && c.sourceCommit==='6dfe188166df76b41d44801ab66970b0a3881ae5'
    && c.projectRef===REF && c.databaseReadOnly===true && c.transactionRolledBack===true
    && c.postcheckPassed===true && c.evidenceModified===false && c.resumeAuthorized===false,
    'recovery_reconciliation_required');
  const run=c.runs?.[0];
  check(c.runs?.length===1 && run.runId===CURRENT
    && run.evidenceSha256==='97f03b3fbaf5fd36c7ef3c209e8ef33d4919a7159b4d41c3e7781adaf79c8c8e'
    && run.checkpointSha256==='6a1335924d03d03d3bcc181844370c9a2e7bc48d1ad7acfab52f93324e1b7251'
    && run.completedBatches===229 && run.inventoryRows===5750 && run.journalPublishedAssets===5733,
    'recovery_parent_evidence_mismatch');
  check(c.rowCounts?.current===5750 && c.rowCounts.unique===5750 && c.rowCounts.inheritedBaseline===53001
    && c.rowCounts.historicalSupersessions===9 && SHA.test(c.expectationSha256??''),'recovery_row_reconciliation_required');
  check(Array.isArray(c.databaseChecks) && c.databaseChecks.length===2 && c.databaseChecks.every(v=>v.matchedRows===5750
    && v.pushed===58734 && v.remaining===3364 && v.totalEligible===62098 && Number.isFinite(Date.parse(v.checkedAt))),
    'recovery_scope_changed');
  const a=c.parentAcceptance;
  check(a?.runId===CURRENT && a.receiptSha256==='45d5eb8d9e55cd014a0e43f49a4014581bd1936181c8cf44a09bb02b6c366d91'
    && a.certificateSha256==='8c171b74bbde16a0645fd0aa0801139c36b3ed5f3277a6309425ebdef151386c'
    && a.inheritedPushed===53001 && a.eligibleTotal===62098 && a.freshBaselineRowsCompared===false,
    'recovery_parent_acceptance_required');
  const parents=[
    ['production-optimised-20261026b','d06e9a223cd8a7985ec2cc641d03eceea32f4c6eb7cffc7275e41927f94c0e71','d1728f7eec12c65b31a5fe442c1ecb63362ba7bcb54812f8a28106b60d1f077f'],
    ['production-resumed-20261026a','83755a507c55824e96f5dee71085399891e4a1b5bbc329794dcc6a3acfc7c661','b59da552b04a09fe066eb5036de3f624b9c294f058bce6d214f0039cdd0401b8']
  ];
  check(Array.isArray(c.parentManifests) && c.parentManifests.length===2 && parents.every(([runId,evidence,checkpoint])=>
    c.parentManifests.filter(p=>p.runId===runId && p.evidenceSha256===evidence && p.checkpointSha256===checkpoint && p.unchanged===true).length===1),
    'recovery_parent_manifest_required');
  const links=PARENT_SOURCE_TAIL;
  check(Array.isArray(c.historicalLinks) && c.historicalLinks.length===9 && links.every(pin=>
    c.historicalLinks.filter(l=>l.rowId===pin.rowId && l.beforeSnapshotSha256===pin.beforeSnapshotSha256
      && SHA.test(l.afterSnapshotSha256??'') && l.afterSnapshotSha256!==l.beforeSnapshotSha256
      && Number.isSafeInteger(l.sequence) && l.sequence>=1 && l.sequence<=229
      && SHA.test(l.operationId??'') && SHA.test(l.receiptSha256??'')).length===1),'recovery_historical_links_required');
  const p=c.publicVerification;
  check(Number.isSafeInteger(p?.objectsVerified) && p.objectsVerified>=30 && p.objectsVerified<=256
    && Number.isSafeInteger(p.bytesVerified) && p.bytesVerified>0 && p.bytesVerified<=134217728 && SHA.test(p.proofSha256??''),
    'recovery_public_verification_required');
  const f=c.sourceFailureRechecks?.[0];
  check(c.sourceFailureRechecks?.length===1 && f.rowId==='efa53563-2d1f-4eeb-8665-efa3a8ed5e4f'
    && f.role==='search-result' && f.status===200 && f.sha256==='7c83bcee90f015b28de1519aff90b589a3654150a5b438158d65a4a89c95c543'
    && f.byteSize===3480 && f.verified===true,'recovery_failed_source_unverified');
  return c;
}

export function createRecoveredMigrationLauncher({ reconcile, successorExists, persistAcceptance,
  createRuntime, runRunner, verifyCoverage, readCapacity, report = () => {},
  stopRequested = () => false, schedule = setInterval, unschedule = clearInterval } = {}) {
  for (const fn of [reconcile, successorExists, persistAcceptance, createRuntime, runRunner,
    verifyCoverage, readCapacity, report, stopRequested, schedule, unschedule]) {
    check(typeof fn === 'function', 'recovery_dependencies_required');
  }
  return async function launch({ env = process.env } = {}) {
    // This entry is first-launch only. An existing successor must be reconciled
    // on its own merits, never checked against an obsolete parent's before-state.
    check(await successorExists() === false, 'recovery_successor_requires_own_reconciliation');
    const certificate = validateRecoveryCertificate(await reconcile({ env }));
    check(!stopRequested(), 'recovery_stopped_before_publication');
    check(await successorExists() === false, 'recovery_successor_requires_own_reconciliation');
    const certificateSha256 = hash(JSON.stringify(certificate));
    const acceptance = { schemaVersion: 1, kind: 'stackr-r2-linked-continuation', runId: RECOVERED_RUN_ID,
      parentRunIds: [CURRENT], certificateSha256, certificate,
      confirmedGlobalBaseline: 58734, eligibleTotal: 62098, newRunStartsFromNull: true,
      parentEvidencePreserved: true, sourceObjectsDeleted: 0 };
    const receiptSha256 = await persistAcceptance(acceptance);
    check(SHA.test(receiptSha256 ?? ''), 'recovery_receipt_persistence_required');
    report({ event: 'recovered_migration_reconciliation_accepted', runId: RECOVERED_RUN_ID,
      certificateSha256, receiptSha256, matchedRows: 5750, confirmedGlobalBaseline: 58734,
      remainingSource: 3364, eligibleTotal: 62098, parentEvidencePreserved: true });
    const runtime = createRuntime();
    check(typeof runtime?.runCli === 'function' && typeof runtime?.close === 'function'
      && typeof runtime?.metrics === 'function', 'recovery_runtime_required');
    let timer;
    try {
      timer = schedule(() => report({ event: 'recovered_migration_heartbeat', runId: RECOVERED_RUN_ID,
        metrics: runtime.metrics(), authoritativeCompletion: false }), 30000);
      const result = await runRunner({ argv: ['--mode=execute', '--expected-ref=' + REF,
        '--run-id=' + RECOVERED_RUN_ID, '--max-batches=10000', '--concurrency=8', '--resume=false'], env,
        runCli: runtime.runCli, readCapacity: async directory => {
          const capacity = await readCapacity(directory);
          return stopRequested() ? { ...capacity, admitted: false, operatorStopRequested: true } : capacity;
        } });
      check(result?.runId === RECOVERED_RUN_ID && ['traversal_complete', 'bounded', 'capacity_paused'].includes(result.status),
        'recovery_unexpected_runner_result');
      report({ event: 'recovered_migration_result', runId: RECOVERED_RUN_ID, status: result.status,
        completedBatches: result.completedBatches, publishedAssets: result.publishedAssets,
        globalCoverageVerified: false });
      if (result.status === 'traversal_complete') {
        const coverage = await verifyCoverage({ traversalResult: result, env });
        report({ event: 'recovered_migration_final_coverage', ...coverage });
        check(coverage?.status === 'coverage_complete', 'recovery_final_coverage_incomplete');
        return { ...result, coverage };
      }
      return result;
    } catch (error) {
      report({ event: 'recovered_migration_blocked', runId: RECOVERED_RUN_ID,
        code: /^(recovery_|runner_)[a-z0-9_]{1,100}$/.test(error?.code ?? '') ? error.code : 'recovery_failed',
        requiresReconciliation: true });
      throw error;
    } finally {
      if (timer !== undefined) unschedule(timer);
      await runtime.close();
    }
  };
}
