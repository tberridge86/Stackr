import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const explicitEvidencePath = process.argv.find((arg) => arg.startsWith('--evidence='))?.slice(11);
const latestEvidenceFile = readdirSync('deploy/evidence')
  .filter((name) => /^staging-migration-reconciliation-\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .sort()
  .at(-1);
const evidencePath = explicitEvidencePath
  ?? (latestEvidenceFile ? `deploy/evidence/${latestEvidenceFile}` : null);
if (!evidencePath) throw new Error('No staging migration reconciliation evidence file was found.');
const requireAligned = process.argv.includes('--require-aligned');
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
const manifest = JSON.parse(readFileSync('deploy/release-manifest.json', 'utf8'));
const errors = [];

function lfSha256(filePath) {
  const normalized = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized).digest('hex');
}

function orderedMigrationKeySha256(migrations) {
  return createHash('sha256').update(`${migrations.map((name) => name.replace(/\.sql$/, '')).join('\n')}\n`).digest('hex');
}

function repositoryMigrationContentSha256(migrations) {
  const ledger = migrations.map((name) => (
    `${name.replace(/\.sql$/, '')}\n${lfSha256(`supabase/migrations/${name}`)}\n`
  )).join('');
  return createHash('sha256').update(ledger).digest('hex');
}

const localMigrations = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (![
  'stackr-migration-reconciliation-v1.0.0',
  'stackr-migration-reconciliation-v1.1.0',
].includes(evidence.schemaVersion)) {
  errors.push('invalid_migration_reconciliation_version');
}
if (evidence.productionProjectRef !== manifest.components.database.projectRef) {
  errors.push('production_project_ref_mismatch');
}
if (evidence.stagingProjectRef !== manifest.components.database.stagingProjectRef) {
  errors.push('staging_project_ref_mismatch');
}
if (evidence.productionMutationPerformed !== false) errors.push('production_mutation_not_prohibited');

if (evidence.schemaVersion === 'stackr-migration-reconciliation-v1.1.0') {
  const keyDigest = orderedMigrationKeySha256(localMigrations);
  const contentDigest = repositoryMigrationContentSha256(localMigrations);
  if (evidence.localMigrationFileCount !== localMigrations.length) {
    errors.push('local_migration_count_drift');
  }
  if (evidence.stagingMigrationHistoryCountAfter !== localMigrations.length) {
    errors.push('staging_migration_count_drift');
  }
  if (evidence.exactVersionNameOrderMatch !== true) {
    errors.push('migration_history_not_exact');
  }
  if (evidence.orderedMigrationKeySha256 !== keyDigest
    || evidence.remoteOrderedMigrationKeySha256 !== keyDigest) {
    errors.push('ordered_migration_key_hash_drift');
  }
  if (evidence.repositoryMigrationContentSha256 !== contentDigest) {
    errors.push('repository_migration_content_hash_drift');
  }
  if (requireAligned && evidence.status !== 'aligned') errors.push('migration_history_not_aligned');

  console.log(JSON.stringify({
    ok: errors.length === 0,
    evidencePath,
    status: evidence.status,
    localMigrationFileCount: localMigrations.length,
    stagingMigrationHistoryCount: evidence.stagingMigrationHistoryCountAfter,
    exactVersionNameOrderMatch: evidence.exactVersionNameOrderMatch,
    errors,
  }, null, 2));
  if (errors.length) process.exit(1);
  process.exit(0);
}

if (evidence.localMigrationFileCount !== localMigrations.length) {
  errors.push('local_migration_count_drift');
}
if (evidence.stagingMigrationHistoryCountAfter
  !== evidence.matchedRepositoryMigrations.length + evidence.stagingOnlyMigrationNames.length) {
  errors.push('staging_migration_count_inconsistent');
}
if (evidence.unverifiedRepositoryMigrationCount
  !== localMigrations.length - evidence.matchedRepositoryMigrations.length) {
  errors.push('unverified_repository_migration_count_inconsistent');
}
if (evidence.repositoryMigrationGroups?.preCanonicalLegacyCount
  + evidence.repositoryMigrationGroups?.canonicalAndLaterCount !== localMigrations.length) {
  errors.push('repository_migration_group_count_inconsistent');
}
if (evidence.repositoryMigrationGroups?.accountedForCount
  !== evidence.matchedRepositoryMigrations.length) {
  errors.push('accounted_repository_migration_count_inconsistent');
}
if (evidence.dryRun?.wouldPushCount !== localMigrations.length || evidence.dryRun?.safeToApply !== false) {
  errors.push('migration_dry_run_evidence_inconsistent');
}
if (evidence.status === 'blocked_missing_pre_repository_baseline') {
  if (evidence.reconciliationComplete !== false || evidence.baselineGap?.confirmed !== true) {
    errors.push('missing_baseline_blocker_not_evidenced');
  }
  if (evidence.baselineGap?.firstRepositoryMigration !== localMigrations[0]) {
    errors.push('first_repository_migration_evidence_drift');
  }
}
if (evidence.status === 'isolated_candidate_aligned_staging_promotion_blocked') {
  if (evidence.reconciliationComplete !== false
    || evidence.baselineGap?.resolvedOnIsolatedCandidate !== true) {
    errors.push('isolated_candidate_alignment_not_evidenced');
  }
  if (evidence.isolatedCandidate?.migrationHistoryAligned !== true
    || evidence.isolatedCandidate?.repositoryMigrationCount !== localMigrations.length
    || evidence.isolatedCandidateUnverifiedRepositoryMigrationCount !== 0) {
    errors.push('isolated_candidate_migration_count_inconsistent');
  }
  if (evidence.stagingMutationPerformed !== false
    || evidence.isolatedBranchMutationPerformed !== true) {
    errors.push('isolated_candidate_mutation_scope_invalid');
  }
  if ((evidence.isolatedCandidate?.securityAdvisorErrorCount ?? -1) !== 0
    || evidence.isolatedCandidate?.securityAdvisorLastSuccessfulMigrationCount !== localMigrations.length
    || evidence.isolatedCandidate?.securityAdvisorRerunStatus !== 'completed'
    || evidence.isolatedCandidate?.promotionApproved !== false
    || !Array.isArray(evidence.isolatedCandidate?.promotionBlockers)
    || evidence.isolatedCandidate.promotionBlockers.length === 0) {
    errors.push('isolated_candidate_promotion_blocker_missing');
  }
  const preservation = evidence.stagingCataloguePreservation;
  if (preservation?.status !== 'rehearsed_and_rolled_back'
    || preservation?.targetRollbackVerified !== true
    || preservation?.productionMutationPerformed !== false
    || preservation?.stagingMutationPerformed !== false
    || preservation?.sourceRowCount !== preservation?.matchedSourceRowCount
    || (preservation?.sourceRowCount ?? 0) <= 0
    || preservation?.legacyRawRecordIdentityIndexPresent !== false
    || preservation?.importRunRawRecordIdentityIndexPresent !== true) {
    errors.push('staging_catalogue_preservation_not_verified');
  }
}

for (const match of evidence.matchedRepositoryMigrations) {
  if (!localMigrations.includes(match.repositoryFile)) {
    errors.push(`matched_repository_migration_missing:${match.repositoryFile}`);
    continue;
  }
  if (lfSha256(`supabase/migrations/${match.repositoryFile}`) !== match.repositoryLfSha256) {
    errors.push(`matched_repository_migration_hash_drift:${match.repositoryFile}`);
  }
}

if (requireAligned && evidence.status !== 'aligned') errors.push('migration_history_not_aligned');

console.log(JSON.stringify({
  ok: errors.length === 0,
  evidencePath,
  status: evidence.status,
  localMigrationFileCount: localMigrations.length,
  stagingMigrationHistoryCount: evidence.stagingMigrationHistoryCountAfter,
  unverifiedRepositoryMigrationCount: evidence.unverifiedRepositoryMigrationCount,
  errors,
}, null, 2));
if (errors.length) process.exit(1);
