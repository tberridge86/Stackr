import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const trialWorkflow = readFileSync(
  '.github/workflows/trial-production-baseline-migrations.yml',
  'utf8',
);
const breakGlassWorkflow = readFileSync(
  '.github/workflows/rebuild-staging-break-glass.yml',
  'utf8',
);
const transfer = readFileSync(
  'scripts/deploy/rehearse-staging-catalogue-transfer.mjs',
  'utf8',
);
const storagePromotion = readFileSync(
  'scripts/deploy/promote-catalogue-storage.mjs',
  'utf8',
);
const verifiedPostgres = readFileSync(
  'scripts/deploy/verified-supabase-postgres.mjs',
  'utf8',
);
const preservation = JSON.parse(
  readFileSync('deploy/staging-catalogue-preservation-tables.json', 'utf8'),
);

assert.match(trialWorkflow, /inputs\.confirmation == 'REPLAY MIGRATIONS ON RESTORE TARGET'/);
assert.match(trialWorkflow, /inputs\.confirmation == 'REHEARSE STAGING CATALOGUE TRANSFER'/);
assert.match(trialWorkflow, /rehearse-staging-catalogue-transfer\.mjs/);
assert.doesNotMatch(trialWorkflow, /APPROVE DESTRUCTIVE STAGING REBUILD/);
assert.doesNotMatch(trialWorkflow, /rebuild-staging:|Rebuild canonical staging database/);
assert.doesNotMatch(trialWorkflow, /STACKR_TRANSFER_MODE:\s*commit|mutation-started/);

assert.match(breakGlassWorkflow, /name: Break Glass - Rebuild Canonical Staging Database/);
assert.match(
  breakGlassWorkflow,
  /test "\$GITHUB_REF" = 'refs\/heads\/main'/,
  'the destructive rebuild must only run from main',
);
assert.match(
  breakGlassWorkflow,
  /test "\$EXPECTED_COMMIT_SHA" = "\$GITHUB_SHA"/,
  'the destructive rebuild must require the exact dispatched SHA',
);
assert.match(breakGlassWorkflow, /inputs\.expected_commit_sha/);
assert.match(breakGlassWorkflow, /inputs\.approve_data_replacement/);
assert.match(breakGlassWorkflow, /inputs\.incident_reference/);
assert.match(
  breakGlassWorkflow,
  /REBUILD CANONICAL STAGING FROM ISOLATED CANDIDATE/,
);
assert.match(breakGlassWorkflow, /current_main_sha=.*commits\/main/);
assert.match(breakGlassWorkflow, /test "\$current_main_sha" = "\$GITHUB_SHA"/);
assert.match(breakGlassWorkflow, /rebuild-staging:\s+needs: authorize/);
assert.match(
  breakGlassWorkflow,
  /rebuild-staging:[\s\S]*?github\.ref == 'refs\/heads\/main' &&[\s\S]*?inputs\.expected_commit_sha == github\.sha &&[\s\S]*?inputs\.approve_data_replacement/,
);
assert.match(breakGlassWorkflow, /environment: staging/);
assert.match(breakGlassWorkflow, /group: stackr-staging-destructive-rebuild/);
assert.match(breakGlassWorkflow, /SUPABASE_PROJECT_REF: lmwfhvexfcoyeuoyrlco/);
assert.match(breakGlassWorkflow, /SUPABASE_RESTORE_PROJECT_REF: krjttpmthxkfsbqksxci/);
assert.match(breakGlassWorkflow, /SUPABASE_PRODUCTION_PROJECT_REF: oakdbbzdqwurpjnoqhmu/);
assert.match(breakGlassWorkflow, /Create ephemeral rollback backup/);
assert.match(breakGlassWorkflow, /Restore rollback backup after a failed rebuild/);
assert.match(breakGlassWorkflow, /select count\(\*\) from auth\.users/);
assert.match(breakGlassWorkflow, /select count\(\*\) from storage\.objects/);
assert.match(breakGlassWorkflow, /supabase_migrations\.schema_migrations/);
assert.match(breakGlassWorkflow, /authorization\.json/);
assert.match(breakGlassWorkflow, /npm run test:commerce-release-lock/);
assert.match(breakGlassWorkflow, /npm run test:security-containment/);
assert.doesNotMatch(
  breakGlassWorkflow,
  /environment: production|SUPABASE_PRODUCTION_DB_URL|--linked/,
);

assert.match(transfer, /COMMIT STAGING CATALOGUE TO ISOLATED CANDIDATE/);
assert.match(transfer, /committed_transfer_source_not_canonical_staging/);
assert.match(transfer, /committed_transfer_target_not_isolated_candidate/);
assert.match(transfer, /committed_transfer_production_guard_mismatch/);
assert.match(transfer, /if \(TRANSFER_MODE !== 'rehearse'\) \{[\s\S]+await target\.query\('commit'\);[\s\S]+targetCommitSucceeded = true/);
assert.match(transfer, /PROMOTE VERIFIED CATALOGUE TO PRODUCTION/);
assert.match(transfer, /production_promotion_target_guard_mismatch/);
assert.match(transfer, /else await target\.query\('rollback'\)/);
assert.match(transfer, /targetCommitVerified/);
assert.match(storagePromotion, /PROMOTE VERIFIED CATALOGUE TO PRODUCTION/);
assert.match(storagePromotion, /production_storage_source_guard_mismatch/);
assert.match(storagePromotion, /production_storage_target_guard_mismatch/);
assert.match(storagePromotion, /source_storage_content_hash_mismatch/);
assert.match(storagePromotion, /providerRequestsPerformed: false/);
assert.match(transfer, /createVerifiedSupabasePostgresClient/);
assert.match(storagePromotion, /createVerifiedSupabasePostgresClient/);
assert.match(verifiedPostgres, /rejectUnauthorized: true/);
assert.doesNotMatch(verifiedPostgres, /rejectUnauthorized\s*:\s*false|sslmode=no-verify|NODE_TLS_REJECT_UNAUTHORIZED|uselibpqcompat/);

assert.ok(
  preservation.tables.includes('ingest.data_conflicts'),
  'the staging conflict review queue must be preserved',
);
assert.deepEqual(
  preservation.excludedEmptyStagingOnlyTables,
  [],
  'staging preservation must not claim nonexistent empty-table exclusions',
);
assert.deepEqual(
  preservation.excludedStagingProjections,
  [],
  'staging preservation must not claim nonexistent regenerable projections',
);
assert.deepEqual(
  preservation.excludedParentReferenceProjections,
  [],
  'full staging preservation must not project references to deliberately omitted parents',
);

console.log('Staging rebuild tooling tests passed.');
