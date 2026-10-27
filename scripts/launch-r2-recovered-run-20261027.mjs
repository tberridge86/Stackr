// A new linked continuation, never an in-place repair of interrupted evidence.
import { createHash } from 'node:crypto';

export const RECOVERED_RUN_ID = 'production-recovered-20261027a';
const CURRENT = 'production-optimised-20261026b';
const PRIOR = 'production-resumed-20261026a';
const REF = 'oakdbbzdqwurpjnoqhmu';
const hash = value => createHash('sha256').update(value).digest('hex');
const SHA = /^[a-f0-9]{64}$/;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const check = (value, code) => { if (!value) fail(code); };

export function validateRecoveryCertificate(certificate) {
  check(certificate?.schemaVersion === 1 && certificate.kind === 'stackr-r2-interrupted-run-reconciliation'
    && certificate.status === 'reconciled' && certificate.reconciliationPassed === true
    && certificate.sourceCommit === '6dfe188166df76b41d44801ab66970b0a3881ae5'
    && certificate.projectRef === REF && certificate.databaseReadOnly === true
    && certificate.transactionRolledBack === true && certificate.postcheckPassed === true
    && certificate.evidenceModified === false && certificate.resumeAuthorized === false,
  'recovery_reconciliation_required');
  const runs = certificate.runs;
  check(Array.isArray(runs) && runs.length === 2 && new Set(runs.map(run => run.runId)).size === 2,
    'recovery_parent_runs_required');
  const current = runs.find(run => run.runId === CURRENT), prior = runs.find(run => run.runId === PRIOR);
  check(current?.evidenceSha256 === 'd06e9a223cd8a7985ec2cc641d03eceea32f4c6eb7cffc7275e41927f94c0e71'
    && current.checkpointSha256 === 'd1728f7eec12c65b31a5fe442c1ecb63362ba7bcb54812f8a28106b60d1f077f'
    && current.completedBatches === 1065 && current.inventoryRows === 26650 && current.journalPublishedAssets === 26641
    && prior?.evidenceSha256 === '83755a507c55824e96f5dee71085399891e4a1b5bbc329794dcc6a3acfc7c661'
    && prior.checkpointSha256 === 'b59da552b04a09fe066eb5036de3f624b9c294f058bce6d214f0039cdd0401b8'
    && prior.completedBatches === 67 && prior.inventoryRows === 1700 && prior.journalPublishedAssets === 1699,
  'recovery_parent_evidence_mismatch');
  check(certificate.rowCounts?.current === 26650 && certificate.rowCounts.prior === 1700
    && certificate.rowCounts.unique === 28349 && certificate.rowCounts.historicalOverlap === 1
    && SHA.test(certificate.expectationSha256 ?? ''), 'recovery_row_reconciliation_required');
  check(Array.isArray(certificate.databaseChecks) && certificate.databaseChecks.length === 2
    && certificate.databaseChecks.every(value => value.matchedRows === 28349 && value.pushed === 53001
      && value.remaining === 9097 && value.totalEligible === 62098 && Number.isFinite(Date.parse(value.checkedAt))),
  'recovery_scope_changed');
  const link = certificate.historicalLink;
  check(link?.rowId === '62db634c-943e-4570-a606-d1039746a477'
    && link.beforeSnapshotSha256 === '93e7cf97672dc35dfc5caedb45523442a7314b1b15190e962bb063fc89aee2e7'
    && link.afterSnapshotSha256 === '199a02febbd5251c344a6d193be9e61bd4790ee50f72953f2a1a9904aac6ab02'
    && Number.isSafeInteger(link.sequence) && link.sequence >= 1 && link.sequence <= 1065
    && SHA.test(link.operationId ?? '') && SHA.test(link.receiptSha256 ?? '')
    && Number.isSafeInteger(link.objectsVerified) && link.objectsVerified >= 1 && link.objectsVerified <= 17,
  'recovery_historical_link_required');
  const proof = certificate.publicVerification;
  check(Number.isSafeInteger(proof?.objectsVerified) && proof.objectsVerified >= 64 && proof.objectsVerified <= 256
    && Number.isSafeInteger(proof.bytesVerified) && proof.bytesVerified > 0 && proof.bytesVerified <= 134217728
    && SHA.test(proof.proofSha256 ?? ''), 'recovery_public_verification_required');
  const source = certificate.sourceFailureRecheck;
  check(source?.rowId === 'd50b4c8c-d641-4ca4-9b5b-3dc20bc253c0' && source.role === 'detail-page'
    && source.status === 200 && source.sha256 === '9408ea91152362549183668e0d2f600bcbdd9459bf52dc80f1cd340e5142e8c2'
    && source.byteSize === 146338 && source.verified === true, 'recovery_failed_source_unverified');
  return certificate;
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
      parentRunIds: [CURRENT, PRIOR], certificateSha256, certificate,
      confirmedGlobalBaseline: 53001, eligibleTotal: 62098, newRunStartsFromNull: true,
      parentEvidencePreserved: true, sourceObjectsDeleted: 0 };
    const receiptSha256 = await persistAcceptance(acceptance);
    check(SHA.test(receiptSha256 ?? ''), 'recovery_receipt_persistence_required');
    report({ event: 'recovered_migration_reconciliation_accepted', runId: RECOVERED_RUN_ID,
      certificateSha256, receiptSha256, matchedRows: 28349, confirmedGlobalBaseline: 53001,
      remainingSource: 9097, eligibleTotal: 62098, parentEvidencePreserved: true });
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
