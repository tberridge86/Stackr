import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  '.github/workflows/trial-production-baseline-migrations.yml',
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

assert.match(workflow, /inputs\.confirmation == 'APPROVE DESTRUCTIVE STAGING REBUILD'/);
assert.match(workflow, /SUPABASE_PROJECT_REF: lmwfhvexfcoyeuoyrlco/);
assert.match(workflow, /SUPABASE_RESTORE_PROJECT_REF: krjttpmthxkfsbqksxci/);
assert.match(workflow, /SUPABASE_PRODUCTION_PROJECT_REF: oakdbbzdqwurpjnoqhmu/);
assert.match(workflow, /Create ephemeral rollback backup/);
assert.match(workflow, /Restore rollback backup after a failed rebuild/);
assert.match(workflow, /select count\(\*\) from auth\.users/);
assert.match(workflow, /select count\(\*\) from storage\.objects/);
assert.match(workflow, /supabase_migrations\.schema_migrations/);
assert.doesNotMatch(workflow, /SUPABASE_PRODUCTION_DB_URL|--linked/);

assert.match(transfer, /COMMIT STAGING CATALOGUE TO ISOLATED CANDIDATE/);
assert.match(transfer, /committed_transfer_source_not_canonical_staging/);
assert.match(transfer, /committed_transfer_target_not_isolated_candidate/);
assert.match(transfer, /committed_transfer_production_guard_mismatch/);
assert.match(transfer, /if \(TRANSFER_MODE !== 'rehearse'\) await target\.query\('commit'\)/);
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

console.log('Staging rebuild tooling tests passed.');
