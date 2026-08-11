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

const backendRailwayConfig = JSON.parse(readFileSync('backend/railway.json', 'utf8'));
for (const watchPattern of [
  'backend/**',
  'data/**',
  'lib/**',
  'routes/**',
  'test/**',
  'server.js',
  'tsconfig.json',
  'railway.json',
  'scripts/**',
  'package.json',
  'package-lock.json',
]) {
  assert.ok(
    backendRailwayConfig.build.watchPatterns.includes(watchPattern),
    `backend Railway watch patterns must support ${watchPattern}`,
  );
}

const recognitionRailwayConfig = JSON.parse(readFileSync('recognition-service/railway.json', 'utf8'));
for (const watchPattern of [
  'recognition-service/**',
  'app/**',
  'tests/**',
  '.dockerignore',
  'Dockerfile',
  'railway.json',
  'README.md',
  'requirements-dev.txt',
  'requirements.txt',
]) {
  assert.ok(
    recognitionRailwayConfig.build.watchPatterns.includes(watchPattern),
    `recognition Railway watch patterns must support ${watchPattern}`,
  );
}

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

const catalogueWorkerSecretsTemp = mkdtempSync(path.join(tmpdir(), 'stackr-catalogue-worker-secrets-test-'));
try {
  const outputPath = path.join(catalogueWorkerSecretsTemp, 'worker-secrets.json');
  const catalogueSecrets = {
    BACKEND_ORIGIN_KEY: 'test-catalogue-origin-key',
    BACKEND_ADMIN_KEY: 'test-catalogue-admin-key',
  };
  const workerSecrets = run(
    'scripts/deploy/write-worker-secrets.mjs',
    [`--output=${outputPath}`],
    { ...catalogueSecrets, STACKR_DEPLOYMENT_SCOPE: 'catalogue_api' },
  );
  assert.equal(workerSecrets.status, 0, workerSecrets.stderr || workerSecrets.stdout);
  assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')), catalogueSecrets);
  for (const value of Object.values(catalogueSecrets)) {
    assert.doesNotMatch(workerSecrets.stdout, new RegExp(value), 'worker secret values must not be logged');
  }
} finally {
  rmSync(catalogueWorkerSecretsTemp, { recursive: true, force: true });
}

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
assert.equal(migrationAlignmentGate.status, 0, migrationAlignmentGate.stderr || migrationAlignmentGate.stdout);
assert.doesNotMatch(migrationAlignmentGate.stdout, /migration_history_not_aligned/);
const stagingReleaseGate = run('scripts/deploy/verify-staging-readiness-evidence.mjs', ['--require-release-ready']);
assert.notEqual(stagingReleaseGate.status, 0, 'staging evidence must block release until recovery and model gates pass');
assert.doesNotMatch(stagingReleaseGate.stdout, /storage_recovery_not_verified/);
assert.doesNotMatch(stagingReleaseGate.stdout, /database_recovery_not_verified/);
assert.doesNotMatch(stagingReleaseGate.stdout, /migration_history_not_aligned/);
assert.match(stagingReleaseGate.stdout, /model_and_index_not_ready/);
assert.match(stagingReleaseGate.stdout, /staging_release_not_ready/);
const releasePreflight = run('scripts/deploy/preflight.mjs', ['--release']);
assert.notEqual(releasePreflight.status, 0, 'release preflight must fail closed without approvals and credentials');
const completeStagingEnvironment = {
  STACKR_DEPLOYMENT_ENVIRONMENT: 'staging',
  STACKR_DEPLOYMENT_SCOPE: 'full_platform',
  STACKR_MIGRATION_BASELINE_APPROVED: 'true',
  STACKR_MODEL_INDEX_RELEASE_APPROVED: 'true',
  STACKR_STORAGE_BACKUP_APPROVED: 'true',
  SUPABASE_ACCESS_TOKEN: 'test-only',
  SUPABASE_DB_URL: 'postgresql://test-only',
  SUPABASE_PROJECT_REF: releaseManifest.components.database.stagingProjectRef,
  RAILWAY_API_TOKEN: 'test-only',
  RAILWAY_PROJECT_ID: 'test-only',
  RAILWAY_ENVIRONMENT_ID: 'test-only',
  RAILWAY_BACKEND_SERVICE_ID: 'test-only',
  RAILWAY_RECOGNITION_SERVICE_ID: 'test-only',
  CLOUDFLARE_API_TOKEN: 'test-only',
  CLOUDFLARE_ACCOUNT_ID: 'test-only',
  STACKR_BACKEND_URL: 'https://backend.invalid',
  STACKR_RECOGNITION_URL: 'https://recognition.invalid',
  STACKR_GATEWAY_URL: 'https://gateway.invalid',
  STACKR_SUPABASE_URL: 'https://staging.supabase.invalid',
  STACKR_SUPABASE_PUBLISHABLE_KEY: 'test-only',
  BACKEND_ORIGIN_KEY: 'test-only',
  BACKEND_ADMIN_KEY: 'test-only',
  RECOGNITION_SERVICE_SECRET: 'test-only',
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
assert.match(credentialledReleasePreflight.stdout, /release_gate_not_ready:activeModelSelected/);
assert.match(credentialledReleasePreflight.stdout, /release_gate_not_ready:activeIndexValidated/);
assert.doesNotMatch(credentialledReleasePreflight.stdout, /release_gate_not_ready:migrationHistoryAligned/);
assert.doesNotMatch(credentialledReleasePreflight.stdout, /release_gate_not_ready:storageBackupVerified/);
assert.doesNotMatch(credentialledReleasePreflight.stdout, /release_approval_missing/);
const crossedProjectPreflight = run('scripts/deploy/preflight.mjs', ['--release'], {
  ...completeStagingEnvironment,
  SUPABASE_PROJECT_REF: releaseManifest.components.database.projectRef,
});
assert.match(crossedProjectPreflight.stdout, /supabase_project_ref_mismatch:staging/);
const catalogueReleaseEnvironment = {
  STACKR_DEPLOYMENT_ENVIRONMENT: 'staging',
  STACKR_DEPLOYMENT_SCOPE: 'catalogue_api',
  STACKR_MIGRATION_BASELINE_APPROVED: 'true',
  STACKR_STORAGE_BACKUP_APPROVED: 'true',
  SUPABASE_ACCESS_TOKEN: 'test-only',
  SUPABASE_DB_URL: 'postgresql://test-only',
  SUPABASE_PROJECT_REF: releaseManifest.components.database.stagingProjectRef,
  RAILWAY_API_TOKEN: 'test-only',
  RAILWAY_PROJECT_ID: 'test-only',
  RAILWAY_ENVIRONMENT_ID: 'test-only',
  RAILWAY_BACKEND_SERVICE_ID: 'test-only',
  RAILWAY_RECOGNITION_SERVICE_ID: '',
  CLOUDFLARE_API_TOKEN: 'test-only',
  CLOUDFLARE_ACCOUNT_ID: 'test-only',
  STACKR_BACKEND_URL: 'https://backend.invalid',
  STACKR_RECOGNITION_URL: '',
  STACKR_GATEWAY_URL: 'https://gateway.invalid',
  STACKR_SUPABASE_URL: 'https://staging.supabase.invalid',
  STACKR_SUPABASE_PUBLISHABLE_KEY: 'test-only',
  BACKEND_ORIGIN_KEY: 'test-only',
  BACKEND_ADMIN_KEY: 'test-only',
  RECOGNITION_SERVICE_SECRET: '',
  EXPO_TOKEN: '',
};
const catalogueStagingPreflight = run(
  'scripts/deploy/preflight.mjs',
  ['--catalogue-api-release'],
  catalogueReleaseEnvironment,
);
assert.equal(
  catalogueStagingPreflight.status,
  0,
  catalogueStagingPreflight.stderr || catalogueStagingPreflight.stdout,
);
assert.doesNotMatch(
  catalogueStagingPreflight.stdout,
  /missing_release_variable:SUPABASE_(?:STAGING_DB_URL|STAGING_SECRET_KEY|PRODUCTION_SECRET_KEY)/,
  'staging catalogue rehearsals must not require production catalogue-promotion credentials',
);
assert.doesNotMatch(
  catalogueStagingPreflight.stdout,
  /missing_release_variable:(?:RAILWAY_RECOGNITION_SERVICE_ID|STACKR_RECOGNITION_URL|RECOGNITION_SERVICE_SECRET|EXPO_TOKEN)/,
  'catalogue rehearsals must not require recognition or mobile credentials',
);

const catalogueProductionPreflight = run(
  'scripts/deploy/preflight.mjs',
  ['--catalogue-api-release'],
  {
    ...catalogueReleaseEnvironment,
    STACKR_DEPLOYMENT_ENVIRONMENT: 'production',
    SUPABASE_PROJECT_REF: releaseManifest.components.database.projectRef,
    SUPABASE_STAGING_DB_URL: '',
    SUPABASE_STAGING_SECRET_KEY: '',
    SUPABASE_PRODUCTION_SECRET_KEY: '',
  },
);
assert.notEqual(
  catalogueProductionPreflight.status,
  0,
  'production catalogue preflight must fail closed without promotion credentials',
);
for (const variable of [
  'SUPABASE_STAGING_DB_URL',
  'SUPABASE_STAGING_SECRET_KEY',
  'SUPABASE_PRODUCTION_SECRET_KEY',
]) {
  assert.match(catalogueProductionPreflight.stdout, new RegExp(`missing_release_variable:${variable}`));
}
assert.doesNotMatch(
  catalogueProductionPreflight.stdout,
  /missing_release_variable:(?:RAILWAY_RECOGNITION_SERVICE_ID|STACKR_RECOGNITION_URL|RECOGNITION_SERVICE_SECRET|EXPO_TOKEN)/,
  'production catalogue releases must not require recognition or mobile credentials',
);

const modelReport = run('scripts/deploy/verify-model-release.mjs');
assert.equal(modelReport.status, 0, modelReport.stderr || modelReport.stdout);
const modelGate = run('scripts/deploy/verify-model-release.mjs', ['--require-active']);
assert.notEqual(modelGate.status, 0, 'model release gate must reject the currently unselected model/index');

const secretScan = run('scripts/deploy/secret-scan.mjs');
assert.equal(secretScan.status, 0, secretScan.stderr || secretScan.stdout);

const secretScanTemp = mkdtempSync(path.join(tmpdir(), 'stackr-secret-scan-test-'));
try {
  writeFileSync(
    path.join(secretScanTemp, 'diagnostic.txt'),
    `provider error: ${'sbp' + '_' + 'A'.repeat(24)}\n`,
  );
  const scannedDiagnostic = run('scripts/deploy/secret-scan.mjs', [`--directory=${secretScanTemp}`]);
  assert.notEqual(scannedDiagnostic.status, 0, 'backup diagnostics containing a Supabase access token must not be uploaded');
  assert.match(scannedDiagnostic.stderr, /supabase_access_token/);
} finally {
  rmSync(secretScanTemp, { recursive: true, force: true });
}

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
const productionMonitorWorkflow = readFileSync('.github/workflows/production-api-monitor.yml', 'utf8');
const rollbackWorkflow = readFileSync('.github/workflows/rollback.yml', 'utf8');
const recoveryWorkflow = readFileSync('.github/workflows/staging-recovery-drill.yml', 'utf8');
const productionBaselineWorkflow = readFileSync('.github/workflows/capture-production-schema-baseline.yml', 'utf8');
const baselineMigrationTrialWorkflow = readFileSync('.github/workflows/trial-production-baseline-migrations.yml', 'utf8');
const catalogueTransferWorkflow = readFileSync('.github/workflows/staging-catalogue-preservation-rehearsal.yml', 'utf8');
const ingestionWorkflow = readFileSync('.github/workflows/ingestion-workers.yml', 'utf8');
for (const workflowName of readdirSync('.github/workflows').filter((name) => name.endsWith('.yml'))) {
  const workflow = readFileSync(`.github/workflows/${workflowName}`, 'utf8');
  assert.doesNotMatch(workflow, /uses:\s+actions\/(?:checkout|setup-node|setup-python)@v\d/, `${workflowName} must pin first-party actions`);
}
assert.match(stagingWorkflow, /backups list/);
assert.match(stagingWorkflow, /id: physical_backup_list/);
assert.match(stagingWorkflow, /physical-backup-list\.stderr/);
assert.match(stagingWorkflow, /stackr-staging-physical-backup-diagnostics-\$\{\{ github\.run_id \}\}/);
assert.match(stagingWorkflow, /steps\.physical_backup_list\.outcome == 'failure'/);
assert.match(stagingWorkflow, /secret-scan\.mjs[\s\S]+stackr-backup-diagnostics/);
assert.match(stagingWorkflow, /rm -rf "\$RUNNER_TEMP\/stackr-backup-diagnostics"/);
assert.match(productionWorkflow, /id: physical_backup_list/);
assert.match(productionWorkflow, /physical-backup-list\.stderr/);
assert.match(productionWorkflow, /stackr-production-physical-backup-diagnostics-\$\{\{ github\.run_id \}\}/);
assert.match(productionWorkflow, /steps\.physical_backup_list\.outcome == 'failure'/);
assert.match(productionWorkflow, /secret-scan\.mjs[\s\S]+stackr-backup-diagnostics/);
assert.match(productionWorkflow, /rm -rf "\$RUNNER_TEMP\/stackr-backup-diagnostics"/);
assert.deepEqual(
  [...stagingWorkflow.matchAll(/db push\s+--db-url "([^"]+)"/g)].map((match) => match[1]),
  ['$STACKR_SOURCE_DB_URL', '$STACKR_SOURCE_DB_URL'],
  'staging migration dry-run and apply must use the validated, normalized source URL',
);
assert.match(productionWorkflow, /prepare-postgres-urls\.mjs --source-only/);
assert.deepEqual(
  [...productionWorkflow.matchAll(/db dump\s*\\\s*\n\s*--db-url "([^"]+)"/g)].map((match) => match[1]),
  ['$STACKR_SOURCE_DB_URL', '$STACKR_SOURCE_DB_URL'],
  'production logical backups must use the validated, normalized source URL',
);
assert.deepEqual(
  [...productionWorkflow.matchAll(/db push\s+--db-url "([^"]+)"/g)].map((match) => match[1]),
  ['$STACKR_SOURCE_DB_URL', '$STACKR_SOURCE_DB_URL'],
  'production migration dry-run and apply must use the validated, normalized source URL',
);
assert.match(productionWorkflow, /benchmark-public-api\.mjs/);
assert.match(productionWorkflow, /--catalogue-p95-ms=150/);
assert.match(productionWorkflow, /--search-p95-ms=300/);
assert.match(productionMonitorWorkflow, /cron: '\*\/10 \* \* \* \*'/);
assert.match(productionMonitorWorkflow, /STACKR_PRODUCTION_MONITOR_ENABLED == 'true'/);
assert.match(productionMonitorWorkflow, /--full-gateway/);
assert.match(productionMonitorWorkflow, /--require-published-catalogue/);
assert.match(productionMonitorWorkflow, /--required-catalogue-languages=en,ja,zh-tw,zh-cn,ko/);
assert.match(productionMonitorWorkflow, /issues: write/);
assert.match(productionMonitorWorkflow, /if: failure\(\)[\s\S]+gh issue (?:comment|create)/);
assert.match(productionMonitorWorkflow, /if: success\(\)[\s\S]+gh issue close/);
assert.match(stagingWorkflow, /STACKR_DEPLOYMENT_ENVIRONMENT: staging/);
assert.match(stagingWorkflow, /STACKR_DEPLOYMENT_SCOPE: \$\{\{ inputs\.release_scope \}\}/);
assert.match(
  stagingWorkflow,
  /SUPABASE_ACCESS_TOKEN:\s+\$\{\{ secrets\.STACKR_GITHUB_STAGING_BACKUPS \|\| secrets\.SUPABASE_ACCESS_TOKEN \}\}/,
  'staging must prefer the dedicated backup-read token without removing the standard token fallback',
);
assert.match(stagingWorkflow, /release_scope:[\s\S]+options: \[catalogue_api, full_platform\]/);
assert.match(stagingWorkflow, /STACKR_STORAGE_BACKUP_APPROVED/);
assert.match(stagingWorkflow, /verify-staging-migration-reconciliation\.mjs --require-aligned/);
assert.match(stagingWorkflow, /verify-staging-readiness-evidence\.mjs --require-catalogue-api-ready/);
assert.match(stagingWorkflow, /verify-staging-readiness-evidence\.mjs --require-release-ready/);
assert.match(stagingWorkflow, /deploy:preflight -- --catalogue-api-release/);
assert.match(stagingWorkflow, /prepare-postgres-urls\.mjs --source-only/);
assert.deepEqual(
  [...stagingWorkflow.matchAll(/db dump\s*\\\s*\n\s*--db-url "([^"]+)"/g)].map((match) => match[1]),
  ['$STACKR_SOURCE_DB_URL', '$STACKR_SOURCE_DB_URL'],
  'staging logical backups must use the validated, normalized source URL',
);
assert.match(stagingWorkflow, /Deploy recognition container[\s\S]+if: inputs\.release_scope == 'full_platform'/);
assert.match(stagingWorkflow, /RECOGNITION_REQUIRED:\$\{\{ inputs\.release_scope/);
assert.match(stagingWorkflow, /--require-published-catalogue/);
assert.match(recoveryWorkflow, /inputs\.confirmation == 'RESTORE STAGING BACKUP'/);
assert.doesNotMatch(recoveryWorkflow, /github\.event\.head_commit/);
assert.match(recoveryWorkflow, /SUPABASE_RESTORE_DB_URL/);
assert.match(recoveryWorkflow, /SUPABASE_RESTORE_PROJECT_REF/);
assert.match(recoveryWorkflow, /krjttpmthxkfsbqksxci/);
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
assert.doesNotMatch(productionBaselineWorkflow, /pull_request:/);
assert.match(productionBaselineWorkflow, /db dump/);
assert.match(productionBaselineWorkflow, /no matching schemas were found/);
assert.match(productionBaselineWorkflow, /supabase_migrations schema absent on source/);
assert.match(productionBaselineWorkflow, /secret-scan\.mjs/);
assert.match(productionBaselineWorkflow, /retention-days: 1/);
assert.match(productionBaselineWorkflow, /rm -rf "\$RUNNER_TEMP\/stackr-production-baseline"/);
assert.doesNotMatch(productionBaselineWorkflow, /db push|migration repair|psql|SUPABASE_ACCESS_TOKEN/);
assert.doesNotMatch(productionBaselineWorkflow, /upload-artifact@v\d/);
assert.match(baselineMigrationTrialWorkflow, /environment: staging/);
assert.match(baselineMigrationTrialWorkflow, /secrets\.SUPABASE_RESTORE_DB_URL/);
assert.match(baselineMigrationTrialWorkflow, /krjttpmthxkfsbqksxci/);
assert.match(baselineMigrationTrialWorkflow, /lmwfhvexfcoyeuoyrlco/);
assert.match(baselineMigrationTrialWorkflow, /oakdbbzdqwurpjnoqhmu/);
assert.match(baselineMigrationTrialWorkflow, /inputs\.confirmation == 'REPLAY MIGRATIONS ON RESTORE TARGET'/);
assert.match(baselineMigrationTrialWorkflow, /inputs\.confirmation == 'REHEARSE STAGING CATALOGUE TRANSFER'/);
assert.doesNotMatch(baselineMigrationTrialWorkflow, /pull_request:/);
assert.match(baselineMigrationTrialWorkflow, /prepare-isolated-reconciliation-url\.mjs/);
assert.match(baselineMigrationTrialWorkflow, /verify-production-schema-baseline\.mjs/);
assert.match(baselineMigrationTrialWorkflow, /--expected-history-version=20260802160643/);
assert.match(
  baselineMigrationTrialWorkflow,
  /--expected-history-name=production_critical_rls_storage_containment_20260802/,
);
assert.match(baselineMigrationTrialWorkflow, /db push --db-url "\$STACKR_RESTORE_DB_URL" --include-all --dry-run/);
assert.match(baselineMigrationTrialWorkflow, /db push --db-url "\$STACKR_RESTORE_DB_URL" --include-all/);
assert.match(baselineMigrationTrialWorkflow, /find supabase\/migrations[^\n]+wc -l/);
assert.match(baselineMigrationTrialWorkflow, /test "\$actual_migrations" = "\$expected_migrations"/);
assert.doesNotMatch(baselineMigrationTrialWorkflow, /migration-count\.txt"\)" = '\d+'/);
assert.match(baselineMigrationTrialWorkflow, /rm -rf "\$RUNNER_TEMP\/stackr-baseline-trial"/);
assert.match(baselineMigrationTrialWorkflow, /rehearse-staging-catalogue-transfer\.mjs/);
assert.match(baselineMigrationTrialWorkflow, /rm -rf "\$RUNNER_TEMP\/stackr-catalogue-transfer"/);
assert.doesNotMatch(baselineMigrationTrialWorkflow, /SUPABASE_ACCESS_TOKEN|--linked/);
assert.match(catalogueTransferWorkflow, /inputs\.confirmation == 'REHEARSE STAGING CATALOGUE TRANSFER'/);
assert.match(catalogueTransferWorkflow, /SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);
assert.match(catalogueTransferWorkflow, /SUPABASE_RESTORE_DB_URL: \$\{\{ secrets\.SUPABASE_RESTORE_DB_URL \}\}/);
assert.match(catalogueTransferWorkflow, /lmwfhvexfcoyeuoyrlco/);
assert.match(catalogueTransferWorkflow, /krjttpmthxkfsbqksxci/);
assert.match(catalogueTransferWorkflow, /oakdbbzdqwurpjnoqhmu/);
assert.match(catalogueTransferWorkflow, /prepare-postgres-urls\.mjs/);
assert.match(catalogueTransferWorkflow, /rehearse-staging-catalogue-transfer\.mjs/);
assert.match(catalogueTransferWorkflow, /retention-days: 1/);
assert.match(catalogueTransferWorkflow, /rm -rf "\$RUNNER_TEMP\/stackr-catalogue-transfer"/);
assert.doesNotMatch(catalogueTransferWorkflow, /pull_request:|push:|SUPABASE_ACCESS_TOKEN|db push|migration repair/);

const catalogueTransferScript = readFileSync('scripts/deploy/rehearse-staging-catalogue-transfer.mjs', 'utf8');
assert.match(catalogueTransferScript, /begin transaction isolation level repeatable read read only/);
assert.match(catalogueTransferScript, /for \(const tableName of \[\.\.\.tableConfig\.tables\]\.reverse\(\)\)/);
assert.match(catalogueTransferScript, /delete from \$\{qualifiedName\(tableName\)\}/);
assert.doesNotMatch(catalogueTransferScript, /truncate[\s\S]+cascade/i);
assert.doesNotMatch(catalogueTransferScript, /setval\(/i);
assert.match(catalogueTransferScript, /alter sequence[\s\S]+restart with/i);
assert.match(catalogueTransferScript, /disable'\} trigger user/);
assert.match(catalogueTransferScript, /enable' : 'disable/);
assert.match(catalogueTransferScript, /setUserTriggersEnabled\(target, tableName, true\)/);
assert.match(catalogueTransferScript, /targetSequencesAfterRollback/);
assert.match(catalogueTransferScript, /compatibleTableContract/);
assert.match(catalogueTransferScript, /required_target_columns/);
assert.match(catalogueTransferScript, /targetOnlyColumns/);
assert.match(catalogueTransferScript, /column\.udt_name === 'json'/);
assert.match(catalogueTransferScript, /transfer_insert_failed/);
assert.match(catalogueTransferScript, /source_unique_constraint_conflict:ingest\.raw_source_records/);
assert.match(catalogueTransferScript, /count\(distinct payload_hash\)/);
assert.match(catalogueTransferScript, /legacyRawRecordIdentityIndexPresent/);
assert.match(catalogueTransferScript, /importRunIdentityIndexPresent/);
assert.match(catalogueTransferScript, /if \(TRANSFER_MODE !== 'rehearse'\) await target\.query\('commit'\)/);
assert.match(catalogueTransferScript, /PROMOTE VERIFIED CATALOGUE TO PRODUCTION/);
assert.match(catalogueTransferScript, /production_promotion_target_guard_mismatch/);
assert.match(catalogueTransferScript, /targetRollbackVerified/);
assert.match(catalogueTransferScript, /targetCommitVerified/);

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
assert.throws(
  () => normalizePostgresUrl(
    'postgresql://postgres.productionproject:password-stagingproject@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?project=stagingproject',
    'stagingproject',
  ),
  /database_url_project_mismatch/,
  'a project ref outside the parsed database username must not satisfy the target guard',
);

const sourceOnlyValidation = run('scripts/deploy/prepare-postgres-urls.mjs', ['--source-only'], {
  SUPABASE_DB_URL: rawPasswordUrl.normalized,
  SUPABASE_PROJECT_REF: 'exampleproject',
  SUPABASE_RESTORE_DB_URL: '',
  SUPABASE_RESTORE_PROJECT_REF: '',
  GITHUB_ENV: '',
});
assert.equal(sourceOnlyValidation.status, 0, sourceOnlyValidation.stderr || sourceOnlyValidation.stdout);
assert.match(sourceOnlyValidation.stdout, /Protected source database URL verified\./);
assert.doesNotMatch(sourceOnlyValidation.stdout, /p=a@#ss%word/);

const sourceOnlyEnvironmentTemp = mkdtempSync(path.join(tmpdir(), 'stackr-source-url-test-'));
try {
  const sourceOnlyEnvironmentPath = path.join(sourceOnlyEnvironmentTemp, 'github.env');
  const sourceOnlyExport = run('scripts/deploy/prepare-postgres-urls.mjs', ['--source-only'], {
    SUPABASE_DB_URL: rawPasswordUrl.normalized,
    SUPABASE_PROJECT_REF: 'exampleproject',
    SUPABASE_RESTORE_DB_URL: '',
    SUPABASE_RESTORE_PROJECT_REF: '',
    GITHUB_ENV: sourceOnlyEnvironmentPath,
  });
  assert.equal(sourceOnlyExport.status, 0, sourceOnlyExport.stderr || sourceOnlyExport.stdout);
  assert.equal(
    readFileSync(sourceOnlyEnvironmentPath, 'utf8'),
    `STACKR_SOURCE_DB_URL=${rawPasswordUrl.normalized}\n`,
  );
} finally {
  rmSync(sourceOnlyEnvironmentTemp, { recursive: true, force: true });
}

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

const reconciliationUrlTemp = mkdtempSync(path.join(tmpdir(), 'stackr-reconciliation-url-test-'));
try {
  const reconciliationEnvironmentPath = path.join(reconciliationUrlTemp, 'github.env');
  const { prepareIsolatedReconciliationUrl } = await import('./deploy/prepare-isolated-reconciliation-url.mjs');
  const preparedReconciliation = prepareIsolatedReconciliationUrl({
    connectionString: 'postgresql://postgres.restoreref:p=a@#ss@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    projectRef: 'restoreref',
    productionProjectRef: 'productionref',
    stagingProjectRef: 'stagingref',
    environmentPath: reconciliationEnvironmentPath,
  });
  assert.equal(
    readFileSync(reconciliationEnvironmentPath, 'utf8'),
    `STACKR_RESTORE_DB_URL=${preparedReconciliation.normalized}\n`,
  );
  assert.throws(
    () => prepareIsolatedReconciliationUrl({
      connectionString: 'postgresql://postgres.productionref:password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
      projectRef: 'productionref',
      productionProjectRef: 'productionref',
      stagingProjectRef: 'stagingref',
      environmentPath: reconciliationEnvironmentPath,
    }),
    /reconciliation_target_not_isolated/,
  );
} finally {
  rmSync(reconciliationUrlTemp, { recursive: true, force: true });
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

const {
  buildRestoreCleanupSql,
  buildRestoreCleanupSqlWithRoles,
} = await import('./deploy/prepare-restore-cleanup.mjs');
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
const cleanupWithRoles = buildRestoreCleanupSqlWithRoles('', [
  'CREATE ROLE "stackr_recognition";',
  "CREATE ROLE \"stackr_o'brien\";",
  'CREATE ROLE "stackr_recognition";',
].join('\n'));
assert.equal(cleanupWithRoles.droppedRoleCount, 2);
assert.match(
  cleanupWithRoles.sql,
  /GRANT %I TO CURRENT_USER;[\s\S]+REASSIGN OWNED BY %I TO "postgres";[\s\S]+DROP OWNED BY %I;[\s\S]+DROP ROLE %I;/,
);
assert.match(cleanupWithRoles.sql, /rolname = 'stackr_o''brien'/);
assert.doesNotMatch(cleanupWithRoles.sql, /DROP ROLE IF EXISTS "stackr_recognition"/);
assert.ok(
  cleanupWithRoles.sql.indexOf('GRANT %I TO CURRENT_USER')
    < cleanupWithRoles.sql.indexOf('CREATE SCHEMA "public"'),
  'custom role ownership and grants must be cleared before the role is dropped',
);
assert.match(productionWorkflow, /release-database\.mjs catalogue activate/);
assert.match(productionWorkflow, /versions deploy/);
assert.match(productionWorkflow, /rollout-percentage/);
assert.match(productionWorkflow, /STACKR_DEPLOYMENT_ENVIRONMENT: production/);
assert.match(productionWorkflow, /STACKR_STORAGE_BACKUP_APPROVED/);
assert.match(productionWorkflow, /verify-staging-migration-reconciliation\.mjs --require-aligned/);
assert.match(productionWorkflow, /verify-staging-readiness-evidence\.mjs --require-release-ready/);
assert.match(productionWorkflow, /update:revert-update-rollout/);
assert.match(productionWorkflow, /release_scope:[\s\S]+options: \[catalogue_api, full_platform\]/);
assert.match(productionWorkflow, /--require-catalogue-api-ready/);
assert.match(productionWorkflow, /Catalogue API promotion currently supports the guarded first-release bootstrap only/);
assert.match(productionWorkflow, /Catalogue API bootstrap does not publish a mobile update/);
assert.match(productionWorkflow, /Remove a failed first production gateway[\s\S]+wrangler --cwd gateway delete --env production --force/);
assert.match(productionWorkflow, /promote-catalogue-storage\.mjs/);
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
