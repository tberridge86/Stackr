import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const evidencePath = process.argv.find((arg) => arg.startsWith('--evidence='))?.slice(11)
  ?? 'deploy/evidence/staging-migration-reconciliation-2026-07-30.json';
const requireAligned = process.argv.includes('--require-aligned');
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
const manifest = JSON.parse(readFileSync('deploy/release-manifest.json', 'utf8'));
const errors = [];

function lfSha256(filePath) {
  const normalized = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized).digest('hex');
}

const localMigrations = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (evidence.schemaVersion !== 'stackr-migration-reconciliation-v1.0.0') {
  errors.push('invalid_migration_reconciliation_version');
}
if (evidence.productionProjectRef !== manifest.components.database.projectRef) {
  errors.push('production_project_ref_mismatch');
}
if (evidence.stagingProjectRef !== manifest.components.database.stagingProjectRef) {
  errors.push('staging_project_ref_mismatch');
}
if (evidence.productionMutationPerformed !== false) errors.push('production_mutation_not_prohibited');
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
if (evidence.dryRun?.safeToApply !== false) {
  errors.push('migration_dry_run_evidence_inconsistent');
}
if (evidence.status === 'isolated_candidate_stale_staging_promotion_blocked') {
  if (evidence.dryRun?.currentChainVerified !== false
    || evidence.dryRun?.observedRepositoryMigrationCount !== evidence.dryRun?.wouldPushCount
    || evidence.dryRun?.observedRepositoryMigrationCount >= localMigrations.length) {
    errors.push('stale_migration_dry_run_not_evidenced');
  }
} else if (evidence.dryRun?.wouldPushCount !== localMigrations.length) {
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
  if ((evidence.isolatedCandidate?.securityAdvisorErrorCount ?? 0) <= 0
    || evidence.isolatedCandidate?.promotionApproved !== false) {
    errors.push('isolated_candidate_promotion_blocker_missing');
  }
}
if (evidence.status === 'isolated_candidate_stale_staging_promotion_blocked') {
  const candidateMigrationCount = evidence.isolatedCandidate?.repositoryMigrationCount;
  if (evidence.reconciliationComplete !== false
    || evidence.baselineGap?.resolvedOnIsolatedCandidate !== true
    || evidence.isolatedCandidate?.migrationHistoryAligned !== true
    || evidence.isolatedCandidate?.currentChainAligned !== false
    || evidence.isolatedCandidateUnverifiedRepositoryMigrationCount
      !== localMigrations.length - candidateMigrationCount
    || candidateMigrationCount >= localMigrations.length) {
    errors.push('stale_isolated_candidate_not_evidenced');
  }
  if (evidence.stagingMutationPerformed !== false
    || evidence.isolatedBranchMutationPerformed !== true
    || evidence.isolatedCandidate?.promotionApproved !== false) {
    errors.push('stale_isolated_candidate_scope_invalid');
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
