import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function run(script, args = [], env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

for (const filePath of [
  'deploy/release-manifest.json',
  'backend/railway.json',
  'recognition-service/railway.json',
  'eas.json',
  'app.json',
]) JSON.parse(readFileSync(filePath, 'utf8'));

const releaseManifest = JSON.parse(readFileSync('deploy/release-manifest.json', 'utf8'));
const appConfig = JSON.parse(readFileSync('app.json', 'utf8'));
assert.equal(
  releaseManifest.components.mobile.easProjectId,
  appConfig.expo.extra.eas.projectId,
  'release manifest and Expo app must use the same project ID',
);
assert.equal(
  appConfig.expo.updates.url,
  `https://u.expo.dev/${releaseManifest.components.mobile.easProjectId}`,
  'Expo update URL must match the release project ID',
);
assert.notEqual(
  releaseManifest.components.database.projectRef,
  releaseManifest.components.database.stagingProjectRef,
  'staging and production Supabase refs must be isolated',
);

const preflight = run('scripts/deploy/preflight.mjs');
assert.equal(preflight.status, 0, preflight.stderr || preflight.stdout);
const stagingEvidence = run('scripts/deploy/verify-staging-readiness-evidence.mjs');
assert.equal(stagingEvidence.status, 0, stagingEvidence.stderr || stagingEvidence.stdout);
const evidenceGuardTemp = mkdtempSync(path.join(tmpdir(), 'stackr-readiness-evidence-test-'));
try {
  const sourceEvidence = JSON.parse(readFileSync('deploy/evidence/staging-readiness-2026-07-30.json', 'utf8'));
  const spoofedReadyPath = path.join(evidenceGuardTemp, 'spoofed-ready.json');
  writeFileSync(spoofedReadyPath, JSON.stringify({
    ...sourceEvidence,
    modelAndIndex: { ...sourceEvidence.modelAndIndex, status: 'ready' },
  }));
  const spoofedReady = run(
    'scripts/deploy/verify-staging-readiness-evidence.mjs',
    [`--evidence=${spoofedReadyPath}`],
  );
  assert.notEqual(spoofedReady.status, 0, 'a ready label must not override blocked capture evidence');
  assert.match(spoofedReady.stdout, /ready_model_lacks_real_capture_evidence/);
  assert.match(spoofedReady.stdout, /ready_model_lacks_complete_benchmark/);

  const tamperedChecksumPath = path.join(evidenceGuardTemp, 'tampered-checksum.json');
  writeFileSync(tamperedChecksumPath, JSON.stringify({
    ...sourceEvidence,
    modelAndIndex: {
      ...sourceEvidence.modelAndIndex,
      benchmarkEvidenceSha256: '0'.repeat(64),
    },
  }));
  const tamperedChecksum = run(
    'scripts/deploy/verify-staging-readiness-evidence.mjs',
    [`--evidence=${tamperedChecksumPath}`],
  );
  assert.notEqual(tamperedChecksum.status, 0, 'tampered benchmark evidence must fail closed');
  assert.match(tamperedChecksum.stdout, /model_benchmark_evidence_checksum_mismatch/);
} finally {
  rmSync(evidenceGuardTemp, { recursive: true, force: true });
}
const migrationReconciliation = run('scripts/deploy/verify-staging-migration-reconciliation.mjs');
assert.equal(migrationReconciliation.status, 0, migrationReconciliation.stderr || migrationReconciliation.stdout);
const migrationAlignmentGate = run(
  'scripts/deploy/verify-staging-migration-reconciliation.mjs',
  ['--require-aligned'],
);
assert.notEqual(migrationAlignmentGate.status, 0, 'blocked reconciliation must not pass the alignment gate');
assert.match(migrationAlignmentGate.stdout, /migration_history_not_aligned/);
const stagingReleaseGate = run('scripts/deploy/verify-staging-readiness-evidence.mjs', ['--require-release-ready']);
assert.notEqual(stagingReleaseGate.status, 0, 'staging evidence must block release until recovery and model gates pass');
assert.doesNotMatch(stagingReleaseGate.stdout, /storage_recovery_not_verified/);
assert.doesNotMatch(stagingReleaseGate.stdout, /database_recovery_not_verified/);
assert.match(stagingReleaseGate.stdout, /migration_history_not_aligned/);
assert.match(stagingReleaseGate.stdout, /model_and_index_not_ready/);
const releasePreflight = run('scripts/deploy/preflight.mjs', ['--release']);
assert.notEqual(releasePreflight.status, 0, 'release preflight must fail closed without approvals and credentials');
const completeStagingEnvironment = {
  STACKR_DEPLOYMENT_ENVIRONMENT: 'staging',
  STACKR_MIGRATION_BASELINE_APPROVED: 'true',
  STACKR_MODEL_INDEX_RELEASE_APPROVED: 'true',
  STACKR_STORAGE_BACKUP_APPROVED: 'true',
  SUPABASE_ACCESS_TOKEN: 'test-only',
  SUPABASE_DB_URL: 'postgresql://test-only',
  SUPABASE_PROJECT_REF: releaseManifest.components.database.stagingProjectRef,
  RAILWAY_TOKEN: 'test-only',
  RAILWAY_PROJECT_ID: 'test-only',
  RAILWAY_ENVIRONMENT_ID: 'test-only',
  RAILWAY_BACKEND_SERVICE_ID: 'test-only',
  RAILWAY_RECOGNITION_SERVICE_ID: 'test-only',
  CLOUDFLARE_API_TOKEN: 'test-only',
  CLOUDFLARE_ACCOUNT_ID: 'test-only',
  STACKR_BACKEND_URL: 'https://backend.invalid',
  STACKR_RECOGNITION_URL: 'https://recognition.invalid',
  STACKR_GATEWAY_URL: 'https://gateway.invalid',
  EXPO_TOKEN: 'test-only',
};
const credentialledReleasePreflight = run(
  'scripts/deploy/preflight.mjs',
  ['--release'],
  completeStagingEnvironment,
);
assert.notEqual(
  credentialledReleasePreflight.status,
  0,
  'protected variables must not override false authoritative release gates',
);
assert.match(credentialledReleasePreflight.stdout, /release_gate_not_ready:migrationHistoryAligned/);
assert.match(credentialledReleasePreflight.stdout, /release_gate_not_ready:storageBackupVerified/);
assert.doesNotMatch(credentialledReleasePreflight.stdout, /release_approval_missing/);
const crossedProjectPreflight = run('scripts/deploy/preflight.mjs', ['--release'], {
  ...completeStagingEnvironment,
  SUPABASE_PROJECT_REF: releaseManifest.components.database.projectRef,
});
assert.match(crossedProjectPreflight.stdout, /supabase_project_ref_mismatch:staging/);

const modelReport = run('scripts/deploy/verify-model-release.mjs');
assert.equal(modelReport.status, 0, modelReport.stderr || modelReport.stdout);
const modelGate = run('scripts/deploy/verify-model-release.mjs', ['--require-active']);
assert.notEqual(modelGate.status, 0, 'model release gate must reject the currently unselected model/index');

const secretScan = run('scripts/deploy/secret-scan.mjs');
assert.equal(secretScan.status, 0, secretScan.stderr || secretScan.stdout);

const dockerfile = readFileSync('recognition-service/Dockerfile', 'utf8');
assert.match(dockerfile, /python:3\.12\.11-slim-bookworm@sha256:[0-9a-f]{64}/);
assert.match(dockerfile, /USER 10001:10001/);
assert.match(dockerfile, /chmod 0555 \/models/);

const backendServer = readFileSync('backend/server.js', 'utf8');
assert.match(backendServer, /res\.setHeader\('X-Request-Id', requestId\)/);

const rollbackTool = readFileSync('scripts/deploy/railway-rollback.mjs', 'utf8');
assert.match(rollbackTool, /deploymentRollback/);
assert.doesNotMatch(rollbackTool, /console\.log\([^\n]*(?:RAILWAY_TOKEN|RAILWAY_API_TOKEN)/);

const stagingWorkflow = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
const productionWorkflow = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const rollbackWorkflow = readFileSync('.github/workflows/rollback.yml', 'utf8');
const recoveryWorkflow = readFileSync('.github/workflows/staging-recovery-drill.yml', 'utf8');
const productionBaselineWorkflow = readFileSync('.github/workflows/capture-production-schema-baseline.yml', 'utf8');
const ingestionWorkflow = readFileSync('.github/workflows/ingestion-workers.yml', 'utf8');
for (const workflowName of readdirSync('.github/workflows').filter((name) => name.endsWith('.yml'))) {
  const workflow = readFileSync(`.github/workflows/${workflowName}`, 'utf8');
  assert.doesNotMatch(workflow, /uses:\s+actions\/(?:checkout|setup-node|setup-python)@v\d/, `${workflowName} must pin first-party actions`);
}
assert.match(stagingWorkflow, /backups list/);
assert.match(stagingWorkflow, /db push --db-url "\$SUPABASE_DB_URL" --dry-run/);
assert.match(stagingWorkflow, /STACKR_DEPLOYMENT_ENVIRONMENT: staging/);
assert.match(stagingWorkflow, /STACKR_STORAGE_BACKUP_APPROVED/);
assert.match(stagingWorkflow, /verify-staging-migration-reconciliation\.mjs --require-aligned/);
assert.match(stagingWorkflow, /verify-staging-readiness-evidence\.mjs --require-release-ready/);
assert.match(recoveryWorkflow, /inputs\.confirmation == 'RESTORE STAGING BACKUP'/);
assert.doesNotMatch(recoveryWorkflow, /github\.event\.head_commit/);
assert.match(recoveryWorkflow, /SUPABASE_RESTORE_DB_URL/);
assert.match(recoveryWorkflow, /SUPABASE_RESTORE_PROJECT_REF/);
assert.match(recoveryWorkflow, /kynqqwyctohrjqloyedh/);
assert.match(recoveryWorkflow, /source_database_url_project_mismatch/);
assert.match(recoveryWorkflow, /restore_database_url_project_mismatch/);
assert.match(recoveryWorkflow, /prepare-postgres-urls\.mjs/);
assert.match(recoveryWorkflow, /sanitize-supabase-role-dump\.mjs/);
assert.match(recoveryWorkflow, /prepare-restore-cleanup\.mjs/);
assert.match(recoveryWorkflow, /STACKR_SOURCE_DB_URL/);
assert.match(recoveryWorkflow, /STACKR_RESTORE_DB_URL/);
assert.doesNotMatch(recoveryWorkflow, /secrets\.SUPABASE_ACCESS_TOKEN/);
assert.doesNotMatch(recoveryWorkflow, /vars\.SUPABASE_(?:PROJECT_REF|RESTORE_PROJECT_REF)/);
assert.match(recoveryWorkflow, /verify-postgres-restore\.mjs/);
assert.match(recoveryWorkflow, /backup-restore-storage-fixture\.mjs/);
assert.match(recoveryWorkflow, /--file \/backup\/cleanup\.sql/);
assert.match(recoveryWorkflow, /rm -rf "\$RUNNER_TEMP\/stackr-recovery"/);
assert.match(productionBaselineWorkflow, /environment: migration-baseline/);
assert.match(productionBaselineWorkflow, /secrets\.SUPABASE_PRODUCTION_DB_URL/);
assert.match(productionBaselineWorkflow, /oakdbbzdqwurpjnoqhmu/);
assert.match(productionBaselineWorkflow, /inputs\.confirmation == 'CAPTURE PRODUCTION SCHEMA'/);
assert.match(productionBaselineWorkflow, /pull_request:[\s\S]+types: \[synchronize\]/);
assert.match(productionBaselineWorkflow, /paths:[\s\S]+capture-production-schema-baseline\.yml/);
assert.match(productionBaselineWorkflow, /head\.repo\.full_name == github\.repository/);
assert.match(productionBaselineWorkflow, /head\.ref == 'chore\/api-gateway-v1'/);
assert.match(productionBaselineWorkflow, /base\.ref == 'main'/);
assert.match(productionBaselineWorkflow, /db dump/);
assert.match(productionBaselineWorkflow, /no matching schemas were found/);
assert.match(productionBaselineWorkflow, /supabase_migrations schema absent on source/);
assert.match(productionBaselineWorkflow, /secret-scan\.mjs/);
assert.match(productionBaselineWorkflow, /retention-days: 1/);
assert.match(productionBaselineWorkflow, /rm -rf "\$RUNNER_TEMP\/stackr-production-baseline"/);
assert.doesNotMatch(productionBaselineWorkflow, /db push|migration repair|psql|SUPABASE_ACCESS_TOKEN/);
assert.doesNotMatch(productionBaselineWorkflow, /upload-artifact@v\d/);

const { normalizePostgresUrl } = await import('./deploy/prepare-postgres-urls.mjs');
const rawPasswordUrl = normalizePostgresUrl(
  'postgresql://postgres.exampleproject:p=a@#ss%word@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
  'exampleproject',
);
assert.equal(
  rawPasswordUrl.normalized,
  'postgresql://postgres.exampleproject:p%3Da%40%23ss%25word@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
);
assert.equal(
  normalizePostgresUrl(rawPasswordUrl.normalized, 'exampleproject').normalized,
  rawPasswordUrl.normalized,
  'normalising an encoded URL must be idempotent',
);
assert.throws(
  () => normalizePostgresUrl(rawPasswordUrl.normalized, 'anotherproject'),
  /database_url_project_mismatch/,
);

const baselineUrlTemp = mkdtempSync(path.join(tmpdir(), 'stackr-baseline-url-test-'));
try {
  const baselineEnvironmentPath = path.join(baselineUrlTemp, 'github.env');
  const { prepareProductionBaselineUrl } = await import('./deploy/prepare-production-baseline-url.mjs');
  const preparedBaseline = prepareProductionBaselineUrl({
    connectionString: 'postgresql://postgres.productionref:p=a@#ss@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    projectRef: 'productionref',
    environmentPath: baselineEnvironmentPath,
  });
  assert.equal(
    readFileSync(baselineEnvironmentPath, 'utf8'),
    `STACKR_PRODUCTION_DB_URL=${preparedBaseline.normalized}\n`,
  );
} finally {
  rmSync(baselineUrlTemp, { recursive: true, force: true });
}

const { createSchemaBaselineEvidence } = await import('./deploy/create-schema-baseline-evidence.mjs');
const baselineEvidence = createSchemaBaselineEvidence({
  schema: 'CREATE SCHEMA catalog;\nCREATE TABLE catalog.cards (id uuid);\nCREATE POLICY read_cards ON catalog.cards FOR SELECT USING (true);\n',
  historySchema: 'CREATE SCHEMA supabase_migrations;\n',
  historyData: 'COPY supabase_migrations.schema_migrations (version) FROM stdin;\n20260513170000\n\\.\n',
});
assert.equal(baselineEvidence.productionMutationPerformed, false);
assert.equal(baselineEvidence.customerTableDataIncluded, false);
assert.equal(baselineEvidence.inventory.tables, 1);
assert.equal(baselineEvidence.inventory.policies, 1);
assert.equal(baselineEvidence.inventory.migrationHistorySchemaPresent, true);
assert.equal(baselineEvidence.inventory.migrationHistoryRows, 1);
const absentHistoryEvidence = createSchemaBaselineEvidence({
  schema: 'CREATE TABLE public.cards (id uuid);\n',
  historySchema: '-- stackr: supabase_migrations schema absent on source\n',
  historyData: '-- stackr: no migration history rows because schema is absent\n',
});
assert.equal(absentHistoryEvidence.inventory.migrationHistorySchemaPresent, false);
assert.equal(absentHistoryEvidence.inventory.migrationHistoryRows, 0);
assert.throws(
  () => createSchemaBaselineEvidence({
    schema: 'COPY public.cards (id) FROM stdin;\nsecret-user-row\n\\.\n',
    historySchema: 'CREATE SCHEMA supabase_migrations;\n',
    historyData: '-- no migration rows\n',
  }),
  /schema_dump_contains_copy_data/,
);

const { sanitizeRoleDumpText } = await import('./deploy/sanitize-supabase-role-dump.mjs');
const roleDump = [
  'CREATE ROLE "stackr_ingest";',
  'ALTER ROLE "stackr_ingest" SET "statement_timeout" TO \'30s\';',
  'ALTER ROLE "supabase_admin" SET "statement_timeout" TO \'2min\';',
  'GRANT "stackr_ingest" TO "supabase_admin";',
  'RESET ALL;',
].join('\n');
const sanitizedRoleDump = sanitizeRoleDumpText(roleDump);
assert.equal(sanitizedRoleDump.removedStatementCount, 2);
assert.match(sanitizedRoleDump.output, /^CREATE ROLE "stackr_ingest";/m);
assert.match(sanitizedRoleDump.output, /^ALTER ROLE "stackr_ingest"/m);
assert.doesNotMatch(sanitizedRoleDump.output, /^ALTER ROLE "supabase_admin"/m);
assert.doesNotMatch(sanitizedRoleDump.output, /^GRANT "stackr_ingest" TO "supabase_admin"/m);
assert.equal(
  sanitizeRoleDumpText(sanitizedRoleDump.output).removedStatementCount,
  0,
  'sanitising a role dump must be idempotent',
);

const { buildRestoreCleanupSql } = await import('./deploy/prepare-restore-cleanup.mjs');
const cleanup = buildRestoreCleanupSql([
  'COPY "public"."cards" ("id") FROM stdin;',
  'COPY "catalog"."sets" ("id") FROM stdin;',
  'COPY "auth"."users" ("id") FROM stdin;',
  'COPY "storage"."buckets" ("id") FROM stdin;',
].join('\n'));
assert.equal(cleanup.droppedSchemaCount, 8);
assert.equal(cleanup.truncatedTableCount, 2);
assert.match(cleanup.sql, /DROP SCHEMA IF EXISTS "public" CASCADE;/);
assert.match(cleanup.sql, /CREATE SCHEMA "public" AUTHORIZATION "postgres";/);
assert.match(cleanup.sql, /TRUNCATE TABLE ONLY "auth"\."users" CASCADE;/);
assert.match(cleanup.sql, /TRUNCATE TABLE ONLY "storage"\."buckets" CASCADE;/);
assert.doesNotMatch(cleanup.sql, /TRUNCATE TABLE ONLY "public"\."cards"/);
assert.match(productionWorkflow, /release-database\.mjs catalogue activate/);
assert.match(productionWorkflow, /versions deploy/);
assert.match(productionWorkflow, /rollout-percentage/);
assert.match(productionWorkflow, /STACKR_DEPLOYMENT_ENVIRONMENT: production/);
assert.match(productionWorkflow, /STACKR_STORAGE_BACKUP_APPROVED/);
assert.match(productionWorkflow, /verify-staging-migration-reconciliation\.mjs --require-aligned/);
assert.match(productionWorkflow, /verify-staging-readiness-evidence\.mjs --require-release-ready/);
assert.match(productionWorkflow, /update:revert-update-rollout/);
assert.doesNotMatch(productionWorkflow, /update:rollback/);
assert.match(rollbackWorkflow, /release-database\.mjs index rollback/);
assert.match(rollbackWorkflow, /update:revert-update-rollout/);
assert.match(rollbackWorkflow, /update:republish/);
assert.match(rollbackWorkflow, /destination-channel/);
assert.doesNotMatch(rollbackWorkflow, /update:rollback/);
assert.match(ingestionWorkflow, /STACKR_CATALOGUE_INGESTION_AUTOMATION_APPROVED/);
assert.match(ingestionWorkflow, /--setId="\$STACKR_INGEST_SET"/);
assert.match(ingestionWorkflow, /resume-import[\s\S]+--runKey="\$STACKR_INGEST_ID"/);
assert.match(ingestionWorkflow, /rebuild-record[\s\S]+--providerRecordId="\$STACKR_INGEST_ID"/);
assert.doesNotMatch(rollbackWorkflow, /run:[^\n]*\$\{\{ inputs\.(?:target_id|reason) \}\}/);

const backupFailure = run('scripts/deploy/verify-backup.mjs');
assert.notEqual(backupFailure.status, 0, 'backup verification must fail closed without backup files');
assert.doesNotMatch(backupFailure.stderr, /ENOENT|TypeError/, 'backup verifier should report missing evidence cleanly');

const easTemp = mkdtempSync(path.join(tmpdir(), 'stackr-eas-test-'));
try {
  const payloadPath = path.join(easTemp, 'update.json');
  const environmentPath = path.join(easTemp, 'github.env');
  const groupId = '11111111-2222-4333-8444-555555555555';
  writeFileSync(payloadPath, JSON.stringify([{ group: groupId }, { group: groupId }]));
  const captured = run('scripts/deploy/capture-eas-update-group.mjs', [
    `--file=${payloadPath}`,
    `--github-env=${environmentPath}`,
  ]);
  assert.equal(captured.status, 0, captured.stderr || captured.stdout);
  assert.equal(readFileSync(environmentPath, 'utf8'), `STACKR_EAS_UPDATE_GROUP_ID=${groupId}\n`);
} finally {
  rmSync(easTemp, { recursive: true, force: true });
}

console.log('Stage 13 deployment tooling tests passed.');
