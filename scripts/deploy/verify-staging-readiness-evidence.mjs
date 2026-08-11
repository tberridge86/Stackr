import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const latestEvidenceFile = readdirSync('deploy/evidence')
  .filter((name) => /^staging-readiness-\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .sort()
  .at(-1);
const evidencePath = process.argv.find((arg) => arg.startsWith('--evidence='))?.slice(11)
  ?? (latestEvidenceFile ? `deploy/evidence/${latestEvidenceFile}` : null);
if (!evidencePath) throw new Error('No staging readiness evidence file was found.');
const requireReleaseReady = process.argv.includes('--require-release-ready');
const requireCatalogueApiReady = process.argv.includes('--require-catalogue-api-ready');
const requiredCatalogueLanguages = ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'];
const manifest = JSON.parse(readFileSync('deploy/release-manifest.json', 'utf8'));
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
const errors = [];
const warnings = [];

function readChecksumBoundJson(path, expectedSha256, errorPrefix) {
  if (!path || !expectedSha256 || !existsSync(path)) {
    errors.push(`${errorPrefix}_missing`);
    return null;
  }
  const contents = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const actualSha256 = createHash('sha256').update(contents).digest('hex');
  if (actualSha256 !== expectedSha256) {
    errors.push(`${errorPrefix}_checksum_mismatch`);
    return null;
  }
  return JSON.parse(contents);
}

if (evidence.schemaVersion !== 'stackr-staging-readiness-evidence-v1.0.0') {
  errors.push('invalid_staging_readiness_evidence_version');
}
if (!Number.isFinite(Date.parse(evidence.capturedAt))) errors.push('invalid_evidence_capture_time');
else if (Date.now() - Date.parse(evidence.capturedAt) > 7 * 24 * 60 * 60 * 1000) {
  warnings.push('staging_readiness_evidence_older_than_seven_days');
}
if (!/^[0-9a-f]{40}$/.test(evidence.sourceCommitHash ?? '')) errors.push('invalid_evidence_source_commit');
if (evidence.supabase?.productionProjectRef !== manifest.components.database.projectRef) {
  errors.push('production_project_ref_evidence_mismatch');
}
if (evidence.supabase?.stagingProjectRef !== manifest.components.database.stagingProjectRef) {
  errors.push('staging_project_ref_evidence_mismatch');
}
for (const field of [
  'localMigrationFileCount',
  'productionMigrationHistoryCount',
  'stagingMigrationHistoryCount',
  'stagingSecurityAdvisorFindingCountAfterRollback',
  'productionPhysicalBackupCount',
  'stagingPhysicalBackupCount',
]) {
  if (!Number.isInteger(evidence.supabase?.[field]) || evidence.supabase[field] < 0) {
    errors.push(`invalid_evidence_count:${field}`);
  }
}
if (evidence.supabase?.productionMigrationHistoryCount
  !== evidence.supabase?.localMigrationFileCount) {
  errors.push('production_migration_history_count_drift');
}
if (evidence.stage6Rehearsal?.rollbackApplied !== true
  || evidence.stage6Rehearsal?.finalStage6ObjectCount !== 0) {
  errors.push('stage6_rehearsal_not_cleanly_rolled_back');
}
if (evidence.stage6Rehearsal?.securityAdvisorFindingCountAfterFixedMigration !== 0) {
  errors.push('stage6_rehearsal_has_security_findings');
}
if (evidence.stage6Rehearsal?.currentVectorExtensionInstalled !== true) {
  errors.push('staging_vector_extension_not_verified');
}
if (!Number.isFinite(Date.parse(evidence.supabase?.latestStagingPhysicalBackupAt))) {
  errors.push('invalid_latest_staging_physical_backup_time');
}
if (evidence.databaseRecovery?.status === 'verified'
  && (!evidence.databaseRecovery.restoreTargetProjectRef || !evidence.databaseRecovery.restoreTestedAt)) {
  errors.push('database_restore_evidence_incomplete');
}

const migrationEvidence = readChecksumBoundJson(
  evidence.supabase?.migrationReconciliationEvidence,
  evidence.supabase?.migrationReconciliationEvidenceSha256,
  'migration_reconciliation_evidence',
);
if (migrationEvidence && migrationEvidence.status !== evidence.supabase?.migrationHistoryStatus) {
  errors.push('migration_reconciliation_status_mismatch');
}

const captureEvidence = readChecksumBoundJson(
  evidence.modelAndIndex?.captureReadinessEvidence,
  evidence.modelAndIndex?.captureReadinessEvidenceSha256,
  'capture_readiness_evidence',
);
const benchmarkEvidence = readChecksumBoundJson(
  evidence.modelAndIndex?.benchmarkEvidence,
  evidence.modelAndIndex?.benchmarkEvidenceSha256,
  'model_benchmark_evidence',
);
const indexPlanEvidence = readChecksumBoundJson(
  evidence.modelAndIndex?.indexPlanEvidence,
  evidence.modelAndIndex?.indexPlanEvidenceSha256,
  'embedding_index_plan_evidence',
);
if (evidence.modelAndIndex?.status === 'ready') {
  if (captureEvidence?.status !== 'ready' || captureEvidence?.eligibleCaptureCount <= 0) {
    errors.push('ready_model_lacks_real_capture_evidence');
  }
  if (captureEvidence?.missingRealCaptureLanguages?.length !== 0) {
    errors.push('ready_model_lacks_required_language_captures');
  }
  if (benchmarkEvidence?.status !== 'complete' || !benchmarkEvidence?.selectedModelId) {
    errors.push('ready_model_lacks_complete_benchmark');
  }
  if (indexPlanEvidence?.status !== 'ready' || !indexPlanEvidence?.modelId) {
    errors.push('ready_model_lacks_inactive_index_plan');
  }
}

if (manifest.releaseGates.migrationHistoryAligned === true
  && evidence.supabase?.migrationHistoryStatus !== 'aligned') {
  errors.push('migration_gate_lacks_aligned_evidence');
}
if (manifest.releaseGates.storageBackupVerified === true
  && evidence.storageRecovery?.status !== 'verified') {
  errors.push('storage_gate_lacks_verified_restore_evidence');
}

if (requireReleaseReady) {
  if (evidence.supabase?.migrationHistoryStatus !== 'aligned') errors.push('migration_history_not_aligned');
  if (evidence.databaseRecovery?.status !== 'verified') errors.push('database_recovery_not_verified');
  if (evidence.storageRecovery?.status !== 'verified') errors.push('storage_recovery_not_verified');
  if (evidence.modelAndIndex?.status !== 'ready') errors.push('model_and_index_not_ready');
  if (evidence.releaseReadiness?.status !== 'ready') errors.push('staging_release_not_ready');
}
if (requireCatalogueApiReady) {
  if (evidence.supabase?.migrationHistoryStatus !== 'aligned') errors.push('migration_history_not_aligned');
  if (evidence.databaseRecovery?.status !== 'verified') errors.push('database_recovery_not_verified');
  if (evidence.storageRecovery?.status !== 'verified') errors.push('storage_recovery_not_verified');
  if (!Number.isInteger(evidence.catalogue?.publishedVersions)
    || evidence.catalogue.publishedVersions <= 0) {
    errors.push('catalogue_version_not_published');
  }
  if (!Number.isInteger(evidence.catalogue?.cardPrintings)
    || evidence.catalogue.cardPrintings <= 0) {
    errors.push('catalogue_has_no_card_printings');
  }
  if (!Number.isInteger(evidence.catalogue?.publicApprovedAssets)
    || evidence.catalogue.publicApprovedAssets <= 0) {
    errors.push('catalogue_has_no_approved_assets');
  }
  const releaseEligibleLanguages = new Set(evidence.catalogue?.releaseEligibleLanguages ?? []);
  for (const language of requiredCatalogueLanguages) {
    if (!releaseEligibleLanguages.has(language)) {
      errors.push(`release_eligible_catalogue_language_missing:${language}`);
    }
  }
}

console.log(JSON.stringify({
  ok: errors.length === 0,
  evidencePath,
  capturedAt: evidence.capturedAt ?? null,
  releaseReady: evidence.releaseReadiness?.status === 'ready',
  blockers: evidence.releaseReadiness?.blockers ?? [],
  warnings,
  errors,
}, null, 2));
if (errors.length) process.exit(1);
