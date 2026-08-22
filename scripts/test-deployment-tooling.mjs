import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
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

  const staleProductionHistoryPath = path.join(evidenceGuardTemp, 'stale-production-history.json');
  const latestEvidence = JSON.parse(readFileSync('deploy/evidence/staging-readiness-2026-08-11.json', 'utf8'));
  writeFileSync(staleProductionHistoryPath, JSON.stringify({
    ...latestEvidence,
    supabase: {
      ...latestEvidence.supabase,
      productionMigrationHistoryCount: latestEvidence.supabase.localMigrationFileCount - 1,
    },
  }));
  const staleProductionHistory = run(
    'scripts/deploy/verify-staging-readiness-evidence.mjs',
    [`--evidence=${staleProductionHistoryPath}`],
  );
  assert.notEqual(staleProductionHistory.status, 0, 'stale production migration history must fail closed');
  assert.match(staleProductionHistory.stdout, /production_migration_history_count_drift/);
} finally {
  rmSync(evidenceGuardTemp, { recursive: true, force: true });
}
const migrationReconciliation = run('scripts/deploy/verify-staging-migration-reconciliation.mjs');
const migrationAlignmentGate = run(
  'scripts/deploy/verify-staging-migration-reconciliation.mjs',
  ['--require-aligned'],
);
if (migrationReconciliation.status === 0) {
  assert.equal(migrationAlignmentGate.status, 0, migrationAlignmentGate.stderr || migrationAlignmentGate.stdout);
  assert.doesNotMatch(migrationAlignmentGate.stdout, /migration_history_not_aligned/);
} else {
  // A migration PR is allowed to be exactly one reviewed migration ahead of
  // the last aligned staging evidence. Normal staging/production workflows
  // still invoke --require-aligned and remain fail-closed; only the dedicated,
  // checksum-pinned migration workflow may apply this transition.
  const reconciliation = JSON.parse(migrationReconciliation.stdout);
  assert.equal(reconciliation.localMigrationFileCount, reconciliation.stagingMigrationHistoryCount + 1);
  assert.deepEqual(reconciliation.errors, [
    'local_migration_count_drift',
    'staging_migration_count_drift',
    'ordered_migration_key_hash_drift',
    'repository_migration_content_hash_drift',
    'baseline_migration_history_restore_not_verified',
    'isolated_candidate_delta_replay_not_verified',
  ]);
  const localMigrations = readdirSync('supabase/migrations')
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
  assert.equal(localMigrations.at(-1), '20260813135412_premium_seller_access_boundary.sql');
  assert.notEqual(migrationAlignmentGate.status, 0, 'global deployment must remain blocked while staging evidence trails');
}
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
assert.match(
  rollbackTool,
  /mutation deploymentRollback\(\$id: String!\) \{ deploymentRollback\(id: \$id\) \}/,
  'Railway rollback must treat deploymentRollback as the Boolean scalar in the live schema',
);
for (const schema of releaseManifest.components.database.privateSchemas) {
  assert.ok(
    !releaseManifest.components.database.exposedSchemas.includes(schema),
    `private database schema ${schema} must not be exposed`,
  );
}
assert.doesNotMatch(
  rollbackTool,
  /deploymentRollback\(id: \$id\) \{ id status \}/,
  'Railway rollback must not select fields from a Boolean scalar',
);
assert.doesNotMatch(rollbackTool, /console\.log\([^\n]*(?:RAILWAY_TOKEN|RAILWAY_API_TOKEN)/);

const stagingWorkflow = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
const productionWorkflow = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const productionMonitorWorkflow = readFileSync('.github/workflows/production-api-monitor.yml', 'utf8');
const rollbackWorkflow = readFileSync('.github/workflows/rollback.yml', 'utf8');
const recoveryWorkflow = readFileSync('.github/workflows/staging-recovery-drill.yml', 'utf8');
const productionBaselineWorkflow = readFileSync('.github/workflows/capture-production-schema-baseline.yml', 'utf8');
const baselineMigrationTrialWorkflow = readFileSync('.github/workflows/trial-production-baseline-migrations.yml', 'utf8');
const catalogueTransferWorkflow = readFileSync('.github/workflows/staging-catalogue-preservation-rehearsal.yml', 'utf8');
const sellerMigrationWorkflow = readFileSync('.github/workflows/deploy-seller-inventory-migration.yml', 'utf8');
const premiumSellerRuntimeWorkflow = readFileSync('.github/workflows/manage-premium-seller-runtime.yml', 'utf8');
const premiumSellerQaIdentityWorkflow = readFileSync(
  '.github/workflows/manage-premium-seller-qa-identity.yml',
  'utf8',
);
const productionCataloguePromotion = JSON.parse(
  readFileSync('deploy/production-catalogue-promotion-tables.json', 'utf8'),
);
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
assert.match(
  productionWorkflow,
  /@railway\/cli@5\.30\.1 up "\$GITHUB_WORKSPACE\/backend" --ci \\/,
  'production must use an absolute backend path while preserving the repository archive root for Railway',
);
assert.match(
  productionWorkflow,
  /if \[ "\$railway_latest_status" = "SKIPPED" \]; then[\s\S]+deployment redeploy --yes --json/,
  'a Railway upload skipped for unchanged watched files must redeploy the staged backend configuration',
);
assert.match(
  productionWorkflow,
  /RAILWAY_DEPLOYMENT_ID="\$railway_redeploy_id"[\s\S]+rows\.find\(item => item\?\.id === process\.env\.RAILWAY_DEPLOYMENT_ID\)/,
  'production must wait for the exact fallback Railway deployment',
);
assert.match(
  productionWorkflow,
  /FAILED\|CRASHED\|REMOVED\|REMOVING\|SKIPPED\|SLEEPING\|NEEDS_APPROVAL\|CANCELED\|CANCELLED[\s\S]+did not become healthy within 15 minutes/,
  'production must fail closed when the fallback Railway deployment fails or times out',
);
assert.match(
  productionWorkflow,
  /npm run deploy:smoke -- --gateway= --backend="\$STACKR_BACKEND_URL"/,
  'pre-activation readiness must not probe the gateway before gateway bootstrap',
);
assert.match(
  productionWorkflow,
  /variable set STACKR_GATEWAY_ORIGIN_KEY --stdin --skip-deploys/,
  'production must synchronize the backend origin key before deploying the matching gateway',
);
assert.doesNotMatch(
  productionWorkflow,
  /variable set STACKR_GATEWAY_ORIGIN_KEY=/,
  'production must never expose the backend origin key as a command-line value',
);
assert.match(
  productionWorkflow,
  /--allowed-origin=https:\/\/stackrtcg\.com/,
  'production full-gateway smoke must use an allowlisted production browser origin',
);
assert.doesNotMatch(
  productionWorkflow,
  /@railway\/cli@5\.30\.1 up (?:backend|\.\/backend) --ci/,
  'production must not pass Railway a relative backend path with explicit project selection',
);
assert.doesNotMatch(
  productionWorkflow,
  /up "\$GITHUB_WORKSPACE\/backend" --path-as-root/,
  'production must not strip the backend directory from the Railway upload',
);
assert.match(
  stagingWorkflow,
  /@railway\/cli@5\.30\.1 up backend --path-as-root --ci/,
  'staging must keep uploading backend as the archive root for its rootless Railway service',
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
assert.match(
  productionWorkflow,
  /SUPABASE_ACCESS_TOKEN:\s+\$\{\{ secrets\.STACKR_GITHUB_PRODUCTION_BACKUPS \|\| secrets\.SUPABASE_ACCESS_TOKEN \}\}/,
  'production must prefer the dedicated backup-read token without removing the standard token fallback',
);
assert.match(stagingWorkflow, /release_scope:[\s\S]+options: \[catalogue_api, recognition_service, full_platform\]/);
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
assert.match(stagingWorkflow, /Deploy recognition container[\s\S]+if: inputs\.release_scope != 'catalogue_api'/);
assert.match(stagingWorkflow, /Recognition-service-only deployments do not apply database migrations/);
assert.match(stagingWorkflow, /npm run deploy:smoke -- --recognition="\$STACKR_RECOGNITION_URL" --signed-recognition/);
assert.match(readFileSync('scripts/deploy/smoke.mjs', 'utf8'), /recognition_signed_vector_lookup/);
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
assert.match(baselineMigrationTrialWorkflow, /inputs\.baseline_artifact_id/);
assert.match(baselineMigrationTrialWorkflow, /inputs\.baseline_archive_sha256/);
assert.match(baselineMigrationTrialWorkflow, /inputs\.baseline_schema_sha256/);
assert.match(baselineMigrationTrialWorkflow, /inputs\.baseline_history_count/);
assert.match(baselineMigrationTrialWorkflow, /inputs\.baseline_history_version/);
assert.match(baselineMigrationTrialWorkflow, /inputs\.baseline_history_name/);
assert.match(baselineMigrationTrialWorkflow, /--expected-history-count="\$BASELINE_HISTORY_COUNT"/);
assert.match(baselineMigrationTrialWorkflow, /--expected-history-version="\$BASELINE_HISTORY_VERSION"/);
assert.match(
  baselineMigrationTrialWorkflow,
  /--expected-history-name="\$BASELINE_HISTORY_NAME"/,
);
assert.match(
  baselineMigrationTrialWorkflow,
  /--file \/trial\/artifact\/production-schema\.sql --file \/trial\/artifact\/migration-history-schema\.sql --file \/trial\/artifact\/migration-history-data\.sql/,
);
assert.match(baselineMigrationTrialWorkflow, /Verify restored production migration history/);
assert.match(baselineMigrationTrialWorkflow, /restored-baseline-migration-keys\.txt/);
assert.match(baselineMigrationTrialWorkflow, /cmp --silent "\$expected_keys" "\$restored_keys"/);
assert.match(baselineMigrationTrialWorkflow, /--baseline-actual-keys="\$RUNNER_TEMP\/stackr-baseline-trial\/restored-baseline-migration-keys\.txt"/);
assert.doesNotMatch(baselineMigrationTrialWorkflow, /isolated-production-storage-fixture\.sql/);
assert.ok(
  baselineMigrationTrialWorkflow.indexOf('/trial/artifact/migration-history-data.sql')
    < baselineMigrationTrialWorkflow.indexOf('db push --db-url "$STACKR_RESTORE_DB_URL" --include-all --dry-run'),
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
assert.match(catalogueTransferWorkflow, /table_set:/);
assert.match(catalogueTransferWorkflow, /default: staging_preservation/);
assert.match(catalogueTransferWorkflow, /staging_preservation/);
assert.match(catalogueTransferWorkflow, /production_catalogue/);
assert.match(catalogueTransferWorkflow, /deploy\/production-catalogue-promotion-tables\.json/);
assert.match(catalogueTransferWorkflow, /STACKR_TRANSFER_TABLE_CONFIG=\$table_config/);
assert.match(catalogueTransferWorkflow, /STACKR_TRANSFER_MODE: rehearse/);
assert.match(catalogueTransferWorkflow, /source_identity_policy='replace'/);
assert.match(catalogueTransferWorkflow, /source_identity_policy='preserve_by_code'/);
assert.match(
  catalogueTransferWorkflow,
  /STACKR_TRANSFER_SOURCE_IDENTITY_POLICY=\$source_identity_policy/,
);
assert.match(catalogueTransferWorkflow, /invalid_transfer_table_set/);
assert.match(catalogueTransferWorkflow, /retention-days: 1/);
assert.match(catalogueTransferWorkflow, /rm -rf "\$RUNNER_TEMP\/stackr-catalogue-transfer"/);
assert.doesNotMatch(catalogueTransferWorkflow, /pull_request:|push:|SUPABASE_ACCESS_TOKEN|db push|migration repair/);
assert.match(sellerMigrationWorkflow, /inputs\.confirmation == 'APPLY PREMIUM SELLER ACCESS BOUNDARY'/);
assert.match(sellerMigrationWorkflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(sellerMigrationWorkflow, /inputs\.expected_commit_sha == github\.sha/);
assert.match(sellerMigrationWorkflow, /environment: production/);
assert.match(sellerMigrationWorkflow, /group: stackr-production-deployment/);
assert.match(sellerMigrationWorkflow, /STACKR_MIGRATION_BASELINE_APPROVED/);
assert.match(sellerMigrationWorkflow, /prepare-postgres-urls\.mjs --source-only/);
assert.match(sellerMigrationWorkflow, /verify-seller-inventory-production-migration\.mjs --before/);
assert.match(sellerMigrationWorkflow, /verify-seller-inventory-production-migration\.mjs --after/);
assert.match(sellerMigrationWorkflow, /backups list/);
assert.match(sellerMigrationWorkflow, /verify-backup\.mjs/);
assert.match(sellerMigrationWorkflow, /20260813135412_premium_seller_access_boundary\.sql/);
assert.match(sellerMigrationWorkflow, /NO_COLOR: 1/);
assert.match(sellerMigrationWorkflow, /plan\.replace\(\/\\x1b/);
const ansiMigrationPlan = '\u001b[1m20260813135412_premium_seller_access_boundary.sql\u001b[22m';
const cleanMigrationPlan = ansiMigrationPlan.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
assert.deepEqual(
  [...cleanMigrationPlan.matchAll(/\b(\d{14}_[A-Za-z0-9_]+\.sql)\b/g)].map((match) => match[1]),
  ['20260813135412_premium_seller_access_boundary.sql'],
  'seller migration plan parsing must tolerate ANSI-formatted Supabase CLI output',
);
assert.deepEqual(
  [...sellerMigrationWorkflow.matchAll(/db push\s*[\\\s\n]+--db-url "([^"]+)"/g)].map((match) => match[1]),
  ['$STACKR_SOURCE_DB_URL', '$STACKR_SOURCE_DB_URL'],
  'seller migration dry-run and apply must use the validated production URL',
);
assert.doesNotMatch(sellerMigrationWorkflow, /railway|wrangler|eas-cli|rehearse-staging-catalogue-transfer/);
assert.match(premiumSellerRuntimeWorkflow, /workflow_dispatch:/);
assert.doesNotMatch(premiumSellerRuntimeWorkflow, /pull_request:|push:|schedule:/);
assert.match(premiumSellerRuntimeWorkflow, /default: disable/);
assert.match(premiumSellerRuntimeWorkflow, /options:\s+\- disable\s+\- enable_qa/);
assert.match(premiumSellerRuntimeWorkflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(premiumSellerRuntimeWorkflow, /environment: production/);
assert.match(premiumSellerRuntimeWorkflow, /group: stackr-premium-seller-runtime/);
assert.match(premiumSellerRuntimeWorkflow, /cancel-in-progress: false/);
assert.match(premiumSellerRuntimeWorkflow, /oakdbbzdqwurpjnoqhmu/);
assert.match(premiumSellerRuntimeWorkflow, /ENABLE PREMIUM SELLER QA/);
assert.match(premiumSellerRuntimeWorkflow, /DISABLE PREMIUM SELLER NOW/);
assert.match(premiumSellerRuntimeWorkflow, /prepare-postgres-urls\.mjs --source-only/);
assert.match(
  premiumSellerRuntimeWorkflow,
  /name: Prepare the normalized production database URL\s+env:\s+SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/,
);
assert.equal(
  [...premiumSellerRuntimeWorkflow.matchAll(/secrets\.SUPABASE_DB_URL/g)].length,
  1,
  'the raw production URL must be scoped only to the normalization step',
);
assert.match(premiumSellerRuntimeWorkflow, /set-premium-seller-runtime\.mjs --validate-request/);
assert.match(premiumSellerRuntimeWorkflow, /set-premium-seller-runtime\.mjs/);
assert.match(premiumSellerRuntimeWorkflow, /npm ci --ignore-scripts/);
assert.doesNotMatch(premiumSellerRuntimeWorkflow, /SUPABASE_ACCESS_TOKEN|db push|railway|wrangler|eas-cli/);
assert.doesNotMatch(
  premiumSellerRuntimeWorkflow,
  /run:[^\n]*\$\{\{ inputs\./,
  'runtime inputs must be passed through environment variables, not interpolated into shell commands',
);
assert.match(premiumSellerQaIdentityWorkflow, /workflow_dispatch:/);
assert.doesNotMatch(premiumSellerQaIdentityWorkflow, /pull_request:|push:|schedule:/);
assert.match(premiumSellerQaIdentityWorkflow, /options:\s+\- preflight\s+\- provision\s+\- send_magic_link/);
assert.match(premiumSellerQaIdentityWorkflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(premiumSellerQaIdentityWorkflow, /environment: production/);
assert.match(premiumSellerQaIdentityWorkflow, /group: stackr-premium-seller-qa-identity/);
assert.doesNotMatch(
  premiumSellerQaIdentityWorkflow,
  /group: stackr-premium-seller-runtime/,
  'QA identity work must not queue the independent runtime kill switch',
);
assert.match(premiumSellerQaIdentityWorkflow, /cancel-in-progress: false/);
assert.match(premiumSellerQaIdentityWorkflow, /STACKR_WORKFLOW_SHA: \$\{\{ github\.sha \}\}/);
assert.match(premiumSellerQaIdentityWorkflow, /STACKR_RELEASE_SHA: \$\{\{ inputs\.release_commit_sha \}\}/);
assert.match(premiumSellerQaIdentityWorkflow, /STACKR_EXPECTED_COMMIT_SHA: \$\{\{ inputs\.expected_commit_sha \}\}/);
assert.match(premiumSellerQaIdentityWorkflow, /fetch-depth: 0/);
assert.match(premiumSellerQaIdentityWorkflow, /git merge-base --is-ancestor/);
assert.match(premiumSellerQaIdentityWorkflow, /git diff --name-only/);
assert.match(premiumSellerQaIdentityWorkflow, /:!\.github\/workflows\/manage-premium-seller-qa-identity\.yml/);
assert.match(premiumSellerQaIdentityWorkflow, /:!scripts\/deploy\/manage-premium-seller-qa-identity\.mjs/);
assert.match(premiumSellerQaIdentityWorkflow, /:!scripts\/test-deployment-tooling\.mjs/);
assert.match(premiumSellerQaIdentityWorkflow, /PREMIUM_SELLER_QA_EMAIL: \$\{\{ secrets\.PREMIUM_SELLER_QA_EMAIL \}\}/);
assert.match(premiumSellerQaIdentityWorkflow, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/);
assert.match(premiumSellerQaIdentityWorkflow, /SUPABASE_PRODUCTION_SECRET_KEY: \$\{\{ secrets\.SUPABASE_PRODUCTION_SECRET_KEY \}\}/);
assert.match(premiumSellerQaIdentityWorkflow, /STACKR_SUPABASE_PUBLISHABLE_KEY: \$\{\{ secrets\.STACKR_SUPABASE_PUBLISHABLE_KEY \}\}/);
assert.match(premiumSellerQaIdentityWorkflow, /prepare-postgres-urls\.mjs --source-only/);
assert.equal(
  [...premiumSellerQaIdentityWorkflow.matchAll(/secrets\.SUPABASE_DB_URL/g)].length,
  1,
  'the raw production URL must only be scoped to normalization',
);
assert.match(premiumSellerQaIdentityWorkflow, /manage-premium-seller-qa-identity\.mjs --validate-request/);
assert.match(premiumSellerQaIdentityWorkflow, /manage-premium-seller-qa-identity\.mjs/);
assert.match(premiumSellerQaIdentityWorkflow, /npm ci --ignore-scripts/);
assert.doesNotMatch(premiumSellerQaIdentityWorkflow, /db push|migration repair|railway|wrangler|eas-cli/);
assert.doesNotMatch(
  premiumSellerQaIdentityWorkflow,
  /run:[^\n]*\$\{\{ inputs\./,
  'QA identity inputs must be passed through environment variables',
);

const {
  PREMIUM_SELLER_QA_MARKER,
  PREMIUM_SELLER_QA_PROJECT_REF,
  PREMIUM_SELLER_QA_REDIRECT_URL,
  assertHostedPremiumSellerQaAuthConfig,
  assertManagedPremiumSellerQaIdentity,
  assertPublicPremiumSellerQaAuthSettings,
  expectedPremiumSellerQaAppMetadata,
  normalizeQaEmail,
  provisionPremiumSellerQaIdentity,
  resolvePremiumSellerQaIdentityRequest,
  safePremiumSellerQaIdentityFailureCode,
  selectSolePremiumSellerQaIdentity,
  sendPremiumSellerQaMagicLink,
} = await import('./deploy/manage-premium-seller-qa-identity.mjs');
const qaReleaseSha = '1234567890abcdef1234567890abcdef12345678';
const qaWorkflowSha = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const qaPreviousReleaseSha = 'abcdef1234567890abcdef1234567890abcdef12';
const qaEmail = 'release-qa@example.test';
const qaUserId = '11111111-1111-4111-8111-111111111111';
const qaProviderMetadata = { provider: 'email', providers: ['email'] };
const qaAppMetadata = expectedPremiumSellerQaAppMetadata(qaReleaseSha, qaProviderMetadata);
assert.equal(PREMIUM_SELLER_QA_PROJECT_REF, 'oakdbbzdqwurpjnoqhmu');
assert.equal(PREMIUM_SELLER_QA_REDIRECT_URL, 'stackr-staging://auth/callback');
const stagingAppConfig = run(
  'node_modules/expo/bin/cli',
  ['config', '--type', 'public', '--json'],
  { APP_VARIANT: 'staging' },
);
assert.equal(stagingAppConfig.status, 0, stagingAppConfig.stderr || stagingAppConfig.stdout);
assert.equal(
  PREMIUM_SELLER_QA_REDIRECT_URL,
  `${JSON.parse(stagingAppConfig.stdout).scheme}://auth/callback`,
  'the QA redirect must exactly match the seller-canary native URL scheme',
);
assert.deepEqual(PREMIUM_SELLER_QA_MARKER, {
  managed: true,
  purpose: 'premium_seller_release_smoke',
  environment: 'production',
  schema_version: 1,
});
assert.equal(normalizeQaEmail('Release-QA@Example.Test'), qaEmail);
assert.throws(() => normalizeQaEmail(' release-qa@example.test'), /premium_seller_qa_email_invalid/);
assert.deepEqual(
  resolvePremiumSellerQaIdentityRequest({
    action: 'preflight',
    confirmation: 'PREFLIGHT PREMIUM SELLER QA IDENTITY',
    releaseSha: qaReleaseSha,
    workflowSha: qaWorkflowSha,
    expectedCommitSha: qaWorkflowSha,
  }).action,
  'preflight',
);
assert.deepEqual(
  resolvePremiumSellerQaIdentityRequest({
    action: 'provision',
    confirmation: 'PROVISION PREMIUM SELLER QA IDENTITY',
    releaseSha: qaReleaseSha,
    workflowSha: qaWorkflowSha,
    expectedCommitSha: qaWorkflowSha,
  }).action,
  'provision',
);
assert.deepEqual(
  resolvePremiumSellerQaIdentityRequest({
    action: 'send_magic_link',
    confirmation: 'SEND PREMIUM SELLER QA MAGIC LINK',
    releaseSha: qaReleaseSha,
    workflowSha: qaWorkflowSha,
    expectedCommitSha: qaWorkflowSha,
  }).action,
  'send_magic_link',
);
assert.throws(
  () => resolvePremiumSellerQaIdentityRequest({
    action: 'send_magic_link',
    confirmation: 'SEND PREMIUM SELLER QA MAGIC LINK',
    releaseSha: qaReleaseSha,
    workflowSha: qaWorkflowSha,
    expectedCommitSha: qaPreviousReleaseSha,
  }),
  /premium_seller_qa_expected_commit_mismatch/,
);
assert.doesNotThrow(() => assertHostedPremiumSellerQaAuthConfig({
  external_email_enabled: true,
  uri_allow_list: `https://stackr.example/auth, ${PREMIUM_SELLER_QA_REDIRECT_URL}`,
}));
assert.throws(
  () => assertHostedPremiumSellerQaAuthConfig({
    external_email_enabled: true,
    uri_allow_list: 'https://stackr.example/auth',
  }),
  /premium_seller_qa_redirect_not_allowed/,
);
assert.throws(
  () => assertHostedPremiumSellerQaAuthConfig({
    external_email_enabled: false,
    uri_allow_list: PREMIUM_SELLER_QA_REDIRECT_URL,
  }),
  /premium_seller_qa_hosted_auth_config_invalid/,
);
assert.doesNotThrow(() => assertPublicPremiumSellerQaAuthSettings({ external: { email: true } }));
assert.throws(
  () => assertPublicPremiumSellerQaAuthSettings({ external: { email: false } }),
  /premium_seller_qa_public_auth_settings_invalid/,
);
const managedQaUser = {
  id: qaUserId,
  email: qaEmail,
  aud: 'authenticated',
  role: 'authenticated',
  email_confirmed_at: '2026-08-13T12:00:00.000Z',
  app_metadata: qaAppMetadata,
  identities: [{
    identity_id: '22222222-2222-4222-8222-222222222222',
    user_id: qaUserId,
    provider: 'email',
  }],
};
assert.deepEqual(
  assertManagedPremiumSellerQaIdentity(managedQaUser, {
    email: qaEmail,
    releaseSha: qaReleaseSha,
    requireConfirmed: true,
  }),
  qaProviderMetadata,
);
assert.throws(
  () => assertManagedPremiumSellerQaIdentity({
    ...managedQaUser,
    app_metadata: { ...qaAppMetadata, role: 'admin' },
  }, { email: qaEmail, releaseSha: qaReleaseSha }),
  /premium_seller_qa_identity_unmanaged/,
  'unexpected authorization metadata must make a QA identity ineligible',
);
assert.throws(
  () => assertManagedPremiumSellerQaIdentity({
    ...managedQaUser,
    app_metadata: { ...qaAppMetadata, stackr_release_qa: { ...PREMIUM_SELLER_QA_MARKER, schema_version: 2 } },
  }, { email: qaEmail, releaseSha: qaReleaseSha }),
  /premium_seller_qa_identity_unmanaged/,
);
assert.throws(
  () => assertManagedPremiumSellerQaIdentity({ ...managedQaUser, role: 'service_role' }, {
    email: qaEmail,
    releaseSha: qaReleaseSha,
  }),
  /premium_seller_qa_identity_role_invalid/,
);
assert.throws(
  () => assertManagedPremiumSellerQaIdentity({
    ...managedQaUser,
    identities: [
      ...managedQaUser.identities,
      { user_id: qaUserId, provider: 'google' },
    ],
  }, { email: qaEmail, releaseSha: qaReleaseSha }),
  /premium_seller_qa_identity_provider_invalid/,
);
assert.throws(
  () => assertManagedPremiumSellerQaIdentity({ ...managedQaUser, is_sso_user: true }, {
    email: qaEmail,
    releaseSha: qaReleaseSha,
  }),
  /premium_seller_qa_identity_provider_invalid/,
);
assert.throws(
  () => expectedPremiumSellerQaAppMetadata(qaReleaseSha, {
    provider: 'google',
    providers: ['google'],
  }),
  /premium_seller_qa_provider_metadata_invalid/,
);
assert.throws(
  () => assertManagedPremiumSellerQaIdentity({
    ...managedQaUser,
    app_metadata: { ...qaAppMetadata, stackr_release_sha: qaPreviousReleaseSha },
  }, { email: qaEmail, releaseSha: qaReleaseSha }),
  /premium_seller_qa_identity_release_mismatch/,
  'a QA identity must never be rebound across releases while older sessions may exist',
);
assert.equal(selectSolePremiumSellerQaIdentity([managedQaUser], qaEmail)?.id, qaUserId);
assert.equal(selectSolePremiumSellerQaIdentity([], qaEmail), null);
assert.throws(
  () => selectSolePremiumSellerQaIdentity([
    managedQaUser,
    {
      ...managedQaUser,
      id: '33333333-3333-4333-8333-333333333333',
      email: 'another-release-qa@example.test',
      app_metadata: { provider: 'email', providers: ['email'], stackr_premium_seller: true },
    },
  ], qaEmail),
  /premium_seller_qa_global_identity_collision/,
  'another Premium entitlement must stop controlled single-user QA',
);
assert.throws(
  () => selectSolePremiumSellerQaIdentity([
    managedQaUser,
    {
      ...managedQaUser,
      id: '44444444-4444-4444-8444-444444444444',
      email: 'stale-release-qa@example.test',
      app_metadata: {
        provider: 'email',
        providers: ['email'],
        stackr_release_qa: { ...PREMIUM_SELLER_QA_MARKER },
      },
    },
  ], qaEmail),
  /premium_seller_qa_global_identity_collision/,
  'another managed QA marker must stop identity provisioning',
);

let updateCalled = false;
const provisionAdmin = {
  async getUserById() {
    return { data: { user: managedQaUser }, error: null };
  },
  async updateUserById() {
    updateCalled = true;
    throw new Error('existing QA identity must not be rebound');
  },
};
await provisionPremiumSellerQaIdentity({
  admin: provisionAdmin,
  email: qaEmail,
  releaseSha: qaReleaseSha,
  existingUser: managedQaUser,
});
assert.equal(updateCalled, false);

let createRequest;
const createAdmin = {
  async createUser(attributes) {
    createRequest = attributes;
    return { data: { user: managedQaUser }, error: null };
  },
  async getUserById() {
    return { data: { user: managedQaUser }, error: null };
  },
};
await provisionPremiumSellerQaIdentity({
  admin: createAdmin,
  email: qaEmail,
  releaseSha: qaReleaseSha,
  existingUser: null,
});
assert.deepEqual(createRequest, {
  email: qaEmail,
  email_confirm: true,
  app_metadata: {
    stackr_premium_seller: true,
    stackr_release_qa: { ...PREMIUM_SELLER_QA_MARKER },
    stackr_release_sha: qaReleaseSha,
  },
});

let magicLinkRequest;
const magicLinkAdmin = {
  async getUserById() {
    return { data: { user: managedQaUser }, error: null };
  },
};
const magicLinkPublicClient = {
  auth: {
    async signInWithOtp(request) {
      magicLinkRequest = request;
      return { data: {}, error: null };
    },
  },
};
await sendPremiumSellerQaMagicLink({
  publicClient: magicLinkPublicClient,
  admin: magicLinkAdmin,
  email: qaEmail,
  releaseSha: qaReleaseSha,
  existingUser: managedQaUser,
});
assert.deepEqual(magicLinkRequest, {
  email: qaEmail,
  options: {
    shouldCreateUser: false,
    emailRedirectTo: 'stackr-staging://auth/callback',
  },
});
await assert.rejects(
  () => sendPremiumSellerQaMagicLink({
    publicClient: magicLinkPublicClient,
    admin: magicLinkAdmin,
    email: qaEmail,
    releaseSha: qaReleaseSha,
    existingUser: null,
  }),
  /premium_seller_qa_identity_missing/,
  'sending a link must never create a missing identity',
);
const qaIdentityToolSource = readFileSync(
  'scripts/deploy/manage-premium-seller-qa-identity.mjs',
  'utf8',
);
assert.match(qaIdentityToolSource, /external_email_enabled !== true/);
assert.match(qaIdentityToolSource, /assertPremiumSellerMigrationInstalled/);
assert.match(qaIdentityToolSource, /assertPremiumSellerRuntimeContract/);
assert.match(qaIdentityToolSource, /loadReviewedPremiumSellerWrapperContract/);
assert.match(qaIdentityToolSource, /loadReviewedAtomicSellerImplementationContract/);
assert.match(qaIdentityToolSource, /pg_advisory_xact_lock\(hashtext\('stackr\.premium_seller_runtime_control'\)\)/);
assert.match(qaIdentityToolSource, /where singleton\s+for update/);
assert.match(qaIdentityToolSource, /inventory_owner_read_only !== true/);
assert.match(qaIdentityToolSource, /receipts_have_only_read_policy !== true/);
assert.match(qaIdentityToolSource, /runtime_row_count !== 1/);
assert.match(qaIdentityToolSource, /disabled_singleton_count !== 1/);
assert.match(qaIdentityToolSource, /seller_ledgers_empty !== true/);
assert.match(qaIdentityToolSource, /AbortSignal\.timeout\(15_000\)/);
assert.match(qaIdentityToolSource, /shouldCreateUser: false/);
assert.match(qaIdentityToolSource, /emailRedirectTo: PREMIUM_SELLER_QA_REDIRECT_URL/);
assert.match(
  qaIdentityToolSource,
  /existingCandidate[\s\S]+getQaIdentityById\(adminClient\.auth\.admin, existingCandidate\.id\)[\s\S]+assertManagedPremiumSellerQaIdentity\(existingUser/,
  'abbreviated listUsers rows must be refreshed before identity-shape validation',
);
assert.match(
  qaIdentityToolSource,
  /globalCandidate[\s\S]+getQaIdentityById\(adminClient\.auth\.admin, globalCandidate\.id\)[\s\S]+assertManagedPremiumSellerQaIdentity\(globallyVerified/,
  'post-provision global scans must refresh the exact account before validation',
);
assert.doesNotMatch(qaIdentityToolSource, /allowPreviousRelease|updateUserById|deleteUser/);
assert.doesNotMatch(qaIdentityToolSource, /console\.(?:log|error)\([^\n]*(?:email|user\.id|link|token|secretKey|publishableKey|accessToken)/i);
const qaSentinelEmail = 'never-print-qa-address@example.test';
const qaSentinelSecret = 'never-print-qa-secret';
const rejectedQaRequest = run(
  'scripts/deploy/manage-premium-seller-qa-identity.mjs',
  ['--validate-request'],
  {
    STACKR_PREMIUM_SELLER_QA_ACTION: 'send_magic_link',
    STACKR_PREMIUM_SELLER_QA_CONFIRMATION: 'wrong confirmation',
    STACKR_RELEASE_SHA: qaReleaseSha,
    STACKR_WORKFLOW_SHA: qaWorkflowSha,
    STACKR_EXPECTED_COMMIT_SHA: qaWorkflowSha,
    PREMIUM_SELLER_QA_EMAIL: qaSentinelEmail,
    SUPABASE_ACCESS_TOKEN: qaSentinelSecret,
    SUPABASE_PRODUCTION_SECRET_KEY: qaSentinelSecret,
    STACKR_SUPABASE_PUBLISHABLE_KEY: qaSentinelSecret,
  },
);
assert.notEqual(rejectedQaRequest.status, 0);
assert.match(rejectedQaRequest.stderr, /premium_seller_qa_confirmation_mismatch/);
assert.doesNotMatch(
  `${rejectedQaRequest.stdout}\n${rejectedQaRequest.stderr}`,
  /never-print-qa-address|never-print-qa-secret/,
);
assert.equal(
  safePremiumSellerQaIdentityFailureCode(new Error(`${qaSentinelEmail}:${qaSentinelSecret}`)),
  'premium_seller_qa_identity_operation_failed',
);

const {
  PREMIUM_SELLER_MIGRATION_NAME,
  PREMIUM_SELLER_MIGRATION_VERSION,
  PREMIUM_SELLER_PRODUCTION_PROJECT_REF,
  loadReviewedAtomicSellerImplementationContract,
  loadReviewedPremiumSellerWrapperContract,
  resolvePremiumSellerRuntimeRequest,
  safePremiumSellerRuntimeFailureCode,
} = await import('./deploy/set-premium-seller-runtime.mjs');
assert.equal(PREMIUM_SELLER_PRODUCTION_PROJECT_REF, 'oakdbbzdqwurpjnoqhmu');
assert.equal(PREMIUM_SELLER_MIGRATION_VERSION, '20260813135412');
assert.equal(PREMIUM_SELLER_MIGRATION_NAME, 'premium_seller_access_boundary');
assert.deepEqual(
  resolvePremiumSellerRuntimeRequest({
    action: 'enable_qa',
    confirmation: 'ENABLE PREMIUM SELLER QA',
  }),
  {
    action: 'enable_qa',
    confirmation: 'ENABLE PREMIUM SELLER QA',
    targetEnabled: true,
    successMessage: 'Premium Seller runtime enabled for controlled QA.',
  },
);
assert.deepEqual(
  resolvePremiumSellerRuntimeRequest({
    action: 'disable',
    confirmation: 'DISABLE PREMIUM SELLER NOW',
  }),
  {
    action: 'disable',
    confirmation: 'DISABLE PREMIUM SELLER NOW',
    targetEnabled: false,
    successMessage: 'Premium Seller runtime disabled.',
  },
);
assert.throws(
  () => resolvePremiumSellerRuntimeRequest({
    action: 'enable_qa',
    confirmation: 'DISABLE PREMIUM SELLER NOW',
  }),
  /premium_seller_runtime_confirmation_mismatch/,
);
assert.throws(
  () => resolvePremiumSellerRuntimeRequest({
    action: 'enable',
    confirmation: 'ENABLE PREMIUM SELLER QA',
  }),
  /premium_seller_runtime_action_invalid/,
);
const reviewedPremiumSellerWrapper = loadReviewedPremiumSellerWrapperContract();
assert.match(reviewedPremiumSellerWrapper, /premium_seller_mode_disabled/);
assert.match(reviewedPremiumSellerWrapper, /premium_seller_entitlement_required/);
assert.match(reviewedPremiumSellerWrapper, /auth\.jwt\(\) -> 'app_metadata' -> 'stackr_premium_seller'/);
assert.match(reviewedPremiumSellerWrapper, /private\.commit_seller_inventory_batch_impl/);
const reviewedAtomicSellerImplementation = loadReviewedAtomicSellerImplementationContract();
assert.match(reviewedAtomicSellerImplementation, /seller_inventory_authentication_required/);
assert.match(reviewedAtomicSellerImplementation, /pg_advisory_xact_lock/);
const runtimeToolSource = readFileSync('scripts/deploy/set-premium-seller-runtime.mjs', 'utf8');
assert.match(runtimeToolSource, /begin isolation level serializable/);
assert.match(runtimeToolSource, /pg_advisory_xact_lock/);
assert.match(runtimeToolSource, /for update/);
assert.match(runtimeToolSource, /updated\.rowCount !== 1/);
assert.match(runtimeToolSource, /readback\.rows\[0\]\?\.matching_rows !== 1/);
assert.match(runtimeToolSource, /request\.action === 'enable_qa'[\s\S]+assertSellerLedgersEmpty/);
assert.match(runtimeToolSource, /request\.action === 'enable_qa'[\s\S]+assertPremiumSellerMigrationInstalled/);
assert.match(runtimeToolSource, /else \{[\s\S]+assertEmergencyDisableContract/);
assert.doesNotMatch(runtimeToolSource, /console\.(?:log|error)\([^\n]*(?:connectionString|normalized|rows)/);
const runtimeSecretUrl = 'postgresql://postgres.oakdbbzdqwurpjnoqhmu:do-not-log@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
const rejectedRuntimeRequest = run(
  'scripts/deploy/set-premium-seller-runtime.mjs',
  ['--validate-request'],
  {
    STACKR_PREMIUM_SELLER_ACTION: 'disable',
    STACKR_PREMIUM_SELLER_CONFIRMATION: 'wrong confirmation',
    STACKR_SOURCE_DB_URL: runtimeSecretUrl,
  },
);
assert.notEqual(rejectedRuntimeRequest.status, 0);
assert.match(rejectedRuntimeRequest.stderr, /premium_seller_runtime_confirmation_mismatch/);
assert.doesNotMatch(
  `${rejectedRuntimeRequest.stdout}\n${rejectedRuntimeRequest.stderr}`,
  /do-not-log|postgresql:\/\//,
  'runtime failures must not log the production URL or password',
);
assert.equal(
  safePremiumSellerRuntimeFailureCode(new Error(runtimeSecretUrl)),
  'premium_seller_runtime_database_operation_failed',
);
assert.ok(releaseManifest.components.database.privateSchemas.includes('private'));
assert.deepEqual(productionCataloguePromotion.excludedParentReferenceProjections, [{
  table: 'ingest.external_identifiers',
  constraint: 'external_identifiers_raw_record_id_fkey',
  parentTable: 'ingest.raw_source_records',
  columns: ['raw_record_id'],
  action: 'set_null',
  reason: 'parent_table_deliberately_excluded_private_provenance',
}]);

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
assert.match(catalogueTransferScript, /if \(TRANSFER_MODE !== 'rehearse'\) \{[\s\S]+await target\.query\('commit'\);[\s\S]+targetCommitSucceeded = true/);
assert.match(catalogueTransferScript, /PROMOTE VERIFIED CATALOGUE TO PRODUCTION/);
assert.match(catalogueTransferScript, /production_promotion_target_guard_mismatch/);
assert.match(catalogueTransferScript, /invalid_transfer_source_identity_policy/);
assert.match(catalogueTransferScript, /production_source_identity_policy_mismatch/);
assert.match(catalogueTransferScript, /committed_source_identity_policy_mismatch/);
assert.match(catalogueTransferScript, /SOURCE_IDENTITY_POLICY === 'preserve_by_code'/);
assert.match(catalogueTransferScript, /sourceIdentityPolicy: SOURCE_IDENTITY_POLICY/);
assert.match(catalogueTransferScript, /targetRollbackVerified/);
assert.match(catalogueTransferScript, /targetCommitVerified/);
assert.match(catalogueTransferScript, /planCatalogueSourceIdentityMerge/);
assert.match(catalogueTransferScript, /foreignKeyColumnsReferencingSources/);
assert.match(catalogueTransferScript, /if \(sourceIdentityPlan && tableName === SOURCE_IDENTITY_TABLE\) continue/);
assert.match(catalogueTransferScript, /upsertRows/);
assert.match(catalogueTransferScript, /preservedProductionSourceIdCount/);
assert.match(catalogueTransferScript, /selfReferentialForeignKeyColumns/);
assert.match(catalogueTransferScript, /jsonb_agg\(child_attribute\.attname::text/);
assert.doesNotMatch(catalogueTransferScript, /array_agg\(child_attribute\.attname/);
assert.match(catalogueTransferScript, /self_reference_transfer_requires_nullable_columns/);
assert.match(catalogueTransferScript, /source_identity_self_reference_unsupported/);
assert.match(catalogueTransferScript, /selfReferenceTransfer\.initialRows/);
assert.match(catalogueTransferScript, /selfReferenceTransfer\.rowsToRestore/);
assert.match(catalogueTransferScript, /excludedParentForeignKeys/);
assert.match(catalogueTransferScript, /excludedParentReferenceProjection/);
assert.match(catalogueTransferScript, /declaredExcludedParentReferenceProjections/);
assert.match(catalogueTransferScript, /excludedParentReferenceProjectedValueCount/);
assert.doesNotMatch(catalogueTransferScript, /disable trigger all/i);
assert.match(catalogueTransferScript, /lockTransferTables\(target, tableConfig\.tables\)/);
assert.match(catalogueTransferScript, /in exclusive mode/);
assert.match(catalogueTransferScript, /set local lock_timeout = '30s'/);
assert.ok(
  catalogueTransferScript.indexOf('lockTransferTables(target, tableConfig.tables)')
    < catalogueTransferScript.indexOf("'ingest.raw_source_records_identity_uidx'"),
  'the target tables must be write-locked before the repeatable-read target snapshot is established',
);
assert.match(catalogueTransferScript, /nonstandard_user_trigger_state/);
assert.match(catalogueTransferScript, /user_trigger_state_mismatch/);
assert.match(catalogueTransferScript, /target_precommit_row_count_mismatch/);
assert.match(catalogueTransferScript, /target_precommit_sequence_mismatch/);
assert.match(catalogueTransferScript, /targetPreCommitVerified = true/);
assert.match(catalogueTransferScript, /expectedCatalogueOwnedSequenceStates/);
assert.match(catalogueTransferScript, /targetMismatchTables = \[\]/);
assert.match(catalogueTransferScript, /targetAlreadyMatched = targetMismatchTables\.length === 0/);
assert.match(catalogueTransferScript, /non_idempotent_production_transfer_requires_indexed_foreign_keys/);
assert.match(catalogueTransferScript, /if \(!targetAlreadyMatched\) \{[\s\S]+delete from \$\{qualifiedName\(tableName\)\}/);
assert.match(catalogueTransferScript, /productionMutationPerformed: TRANSFER_MODE === 'promote' && !targetAlreadyMatched/);
assert.match(catalogueTransferScript, /targetAlreadyMatched: evidence\.targetAlreadyMatched/);
assert.match(catalogueTransferScript, /productionMutationPerformed: evidence\.productionMutationPerformed/);
assert.match(catalogueTransferScript, /transferPolicy: evidence\.transferPolicy/);
assert.match(catalogueTransferScript, /postCommitObservationMatched/);
assert.ok(
  catalogueTransferScript.indexOf('non_idempotent_production_transfer_requires_indexed_foreign_keys')
    < catalogueTransferScript.indexOf('delete from ${qualifiedName(tableName)}'),
  'a non-idempotent production snapshot must fail before any target delete',
);
assert.doesNotMatch(catalogueTransferScript, /throw new Error\(`target_commit_mismatch/);
assert.ok(
  catalogueTransferScript.indexOf('production_release_versions_mismatch')
    < catalogueTransferScript.indexOf("await target.query('commit')"),
  'production release verification must happen before the target transaction commits',
);
assert.ok(
  catalogueTransferScript.indexOf('production_asset_url_rewrite_incomplete')
    < catalogueTransferScript.indexOf("await target.query('commit')"),
  'production asset URL verification must happen before the target transaction commits',
);
assert.doesNotMatch(catalogueTransferScript, /update catalog\.assets[\s\S]+set url/i);
assert.match(
  productionWorkflow,
  /name: Promote verified catalogue snapshot into production\s+id: catalogue_promotion/,
);
assert.match(
  productionWorkflow,
  /name: Build non-secret catalogue promotion audit[\s\S]+!cancelled\(\)[\s\S]+steps\.catalogue_promotion\.outcome != 'skipped'/,
);
assert.match(
  productionWorkflow,
  /name: Scan catalogue promotion audit for secrets[\s\S]+secret-scan\.mjs --directory=/,
);
assert.match(
  productionWorkflow,
  /name: Upload non-secret catalogue promotion audit[\s\S]+uses: actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/,
);
assert.match(
  productionWorkflow,
  /stackr-production-catalogue-promotion-audit-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}[\s\S]+path: \$\{\{ runner\.temp \}\}\/stackr-catalogue-promotion-audit\/audit-summary\.json[\s\S]+if-no-files-found: error[\s\S]+retention-days: 1/,
);
assert.ok(
  productionWorkflow.indexOf('Upload non-secret catalogue promotion audit')
    < productionWorkflow.indexOf('Deploy rolling catalogue API version'),
  'the catalogue audit must be uploaded before the backend deployment begins',
);

const promotionAuditDirectory = mkdtempSync(path.join(tmpdir(), 'stackr-promotion-audit-'));
try {
  const storageEvidencePath = path.join(promotionAuditDirectory, 'storage-evidence.json');
  const databaseEvidencePath = path.join(promotionAuditDirectory, 'database-evidence.json');
  const auditOutputPath = path.join(promotionAuditDirectory, 'audit-summary.json');
  writeFileSync(storageEvidencePath, JSON.stringify({
    schemaVersion: 'stackr-production-catalogue-storage-promotion-v1.0.0',
    sourceProjectRef: 'internal-staging-ref',
    targetProjectRef: 'internal-production-ref',
    sourceInventorySha256: 'internal-storage-digest',
    sourceObjectCount: 10,
    targetObjectCountBefore: 10,
    copiedObjectCount: 0,
    copiedByteSize: 0,
    copiedContentHashVerifiedCount: 0,
    targetObjectCountAfter: 10,
    verifiedSourceObjectCount: 10,
    existingProductionObjectsRetained: true,
    providerRequestsPerformed: false,
    ok: true,
  }));
  writeFileSync(databaseEvidencePath, JSON.stringify({
    schemaVersion: 'stackr-production-catalogue-data-promotion-evidence-v1.4.0',
    sourceProjectRef: 'internal-staging-ref',
    targetProjectRef: 'internal-production-ref',
    targetAlreadyMatched: true,
    productionMutationPerformed: false,
    targetTransactionCommitted: true,
    targetCommitVerified: true,
    transferPolicy: 'verify_allowlisted_production_catalogue_already_matches_without_mutation',
    selectedTableCount: 1,
    sourceRowCount: 2,
    matchedSourceRowCount: 2,
    catalogueRelease: {
      sourceVersionIds: ['internal-release-uuid'],
      releaseVersionSha256: 'internal-release-digest',
      productionAssetUrlRewriteCount: 1,
      productionAssetTimestampReuseCount: 1,
    },
    tables: [{
      table: 'internal.schema_table',
      sourceSha256: 'internal-row-digest',
      targetPreCommitVerified: true,
      transferSkippedAsAlreadyCurrent: true,
      commitMatched: true,
      postCommitObservationMatched: true,
    }],
  }));
  const auditResult = run(
    './scripts/deploy/create-production-catalogue-promotion-audit.mjs',
    [
      `--storage=${storageEvidencePath}`,
      `--database=${databaseEvidencePath}`,
      `--output=${auditOutputPath}`,
      '--promotion-outcome=success',
    ],
    {
      GITHUB_SHA: 'public-commit-sha',
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '2',
    },
  );
  assert.equal(auditResult.status, 0, auditResult.stderr);
  const publicAudit = JSON.parse(readFileSync(auditOutputPath, 'utf8'));
  assert.equal(publicAudit.classification, 'public_non_secret_aggregate_only');
  assert.equal(publicAudit.storage.copiedObjectCount, 0);
  assert.equal(publicAudit.database.targetAlreadyMatched, true);
  assert.equal(publicAudit.database.productionMutationPerformed, false);
  assert.equal(publicAudit.database.skippedCurrentTableCount, 1);
  assert.equal(publicAudit.workflowRunAttempt, '2');
  const serializedPublicAudit = JSON.stringify(publicAudit);
  for (const internalValue of [
    'internal-staging-ref',
    'internal-production-ref',
    'internal-storage-digest',
    'internal-release-uuid',
    'internal-release-digest',
    'internal.schema_table',
    'internal-row-digest',
  ]) assert.doesNotMatch(serializedPublicAudit, new RegExp(internalValue.replace('.', '\\.')));
  for (const internalValue of [
    'internal-staging-ref',
    'internal-production-ref',
    'internal-storage-digest',
    'internal-release-uuid',
    'internal-release-digest',
    'internal.schema_table',
    'internal-row-digest',
  ]) assert.doesNotMatch(auditResult.stdout, new RegExp(internalValue.replace('.', '\\.')));

  const postCommitMismatchEvidence = JSON.parse(readFileSync(databaseEvidencePath, 'utf8'));
  postCommitMismatchEvidence.tables[0].postCommitObservationMatched = false;
  const postCommitMismatchPath = path.join(
    promotionAuditDirectory,
    'postcommit-mismatch-evidence.json',
  );
  writeFileSync(postCommitMismatchPath, JSON.stringify(postCommitMismatchEvidence));
  const postCommitMismatchAudit = run(
    './scripts/deploy/create-production-catalogue-promotion-audit.mjs',
    [
      `--storage=${storageEvidencePath}`,
      `--database=${postCommitMismatchPath}`,
      `--output=${path.join(promotionAuditDirectory, 'postcommit-mismatch-audit.json')}`,
      '--promotion-outcome=success',
    ],
  );
  assert.notEqual(postCommitMismatchAudit.status, 0);
  assert.match(postCommitMismatchAudit.stderr, /successful_database_no_op_not_verified/);

  rmSync(databaseEvidencePath);
  const partialAuditOutputPath = path.join(promotionAuditDirectory, 'partial-audit.json');
  const partialAuditResult = run(
    './scripts/deploy/create-production-catalogue-promotion-audit.mjs',
    [
      `--storage=${storageEvidencePath}`,
      `--database=${databaseEvidencePath}`,
      `--output=${partialAuditOutputPath}`,
      '--promotion-outcome=failure',
    ],
  );
  assert.equal(partialAuditResult.status, 0, partialAuditResult.stderr);
  const partialAudit = JSON.parse(readFileSync(partialAuditOutputPath, 'utf8'));
  assert.equal(partialAudit.storage.evidencePresent, true);
  assert.equal(partialAudit.database.evidencePresent, false);
  const invalidSuccessAudit = run(
    './scripts/deploy/create-production-catalogue-promotion-audit.mjs',
    [
      `--storage=${storageEvidencePath}`,
      `--database=${databaseEvidencePath}`,
      `--output=${path.join(promotionAuditDirectory, 'invalid-success.json')}`,
      '--promotion-outcome=success',
    ],
  );
  assert.notEqual(invalidSuccessAudit.status, 0);
  assert.match(invalidSuccessAudit.stderr, /successful_catalogue_promotion_evidence_missing/);

  writeFileSync(databaseEvidencePath, JSON.stringify({
    schemaVersion: 'stackr-production-catalogue-data-promotion-evidence-v1.4.0',
    targetAlreadyMatched: false,
    productionMutationPerformed: true,
    targetTransactionCommitted: false,
    targetCommitVerified: false,
    transferPolicy: 'verify_allowlisted_production_catalogue_already_matches_without_mutation',
    selectedTableCount: 1,
    sourceRowCount: 2,
    matchedSourceRowCount: 2,
    catalogueRelease: {
      productionAssetUrlRewriteCount: 1,
      productionAssetTimestampReuseCount: 1,
    },
    tables: [{
      targetPreCommitVerified: false,
      transferSkippedAsAlreadyCurrent: false,
      commitMatched: false,
      postCommitObservationMatched: false,
    }],
  }));
  const contradictorySuccessAudit = run(
    './scripts/deploy/create-production-catalogue-promotion-audit.mjs',
    [
      `--storage=${storageEvidencePath}`,
      `--database=${databaseEvidencePath}`,
      `--output=${path.join(promotionAuditDirectory, 'contradictory-success.json')}`,
      '--promotion-outcome=success',
    ],
  );
  assert.notEqual(contradictorySuccessAudit.status, 0);
  assert.match(contradictorySuccessAudit.stderr, /successful_database_no_op_not_verified/);

  const badStorageEvidence = JSON.parse(readFileSync(storageEvidencePath, 'utf8'));
  badStorageEvidence.ok = false;
  badStorageEvidence.providerRequestsPerformed = true;
  const badStorageEvidencePath = path.join(promotionAuditDirectory, 'bad-storage-evidence.json');
  writeFileSync(badStorageEvidencePath, JSON.stringify(badStorageEvidence));
  const badStorageSuccessAudit = run(
    './scripts/deploy/create-production-catalogue-promotion-audit.mjs',
    [
      `--storage=${badStorageEvidencePath}`,
      `--database=${databaseEvidencePath}`,
      `--output=${path.join(promotionAuditDirectory, 'bad-storage-success.json')}`,
      '--promotion-outcome=success',
    ],
  );
  assert.notEqual(badStorageSuccessAudit.status, 0);
  assert.match(badStorageSuccessAudit.stderr, /successful_storage_no_op_not_verified/);
} finally {
  rmSync(promotionAuditDirectory, { recursive: true, force: true });
}

const {
  catalogueTransferTargetMatch,
  expectedCatalogueOwnedSequenceStates,
  planCatalogueSourceIdentityMerge,
  remapCatalogueSourceForeignKeys,
  rewriteProductionCatalogueAssetUrls,
  stableCatalogueJson,
  verifyCatalogueRowsByPrimaryKey,
} = await import('./deploy/catalogue-source-identity.mjs');
const {
  prepareCatalogueSelfReferenceTransfer,
} = await import('./deploy/catalogue-self-reference-transfer.mjs');
const {
  projectCatalogueExcludedParentReferences,
  validateCatalogueExcludedParentForeignKeys,
} = await import('./deploy/catalogue-excluded-parent-transfer.mjs');

const externalIdentifierSourceRows = [
  { id: 'identifier-1', source_id: 'source-1', raw_record_id: 'raw-1' },
  { id: 'identifier-2', source_id: 'source-1', raw_record_id: null },
];
const excludedParentForeignKeys = validateCatalogueExcludedParentForeignKeys({
  foreignKeys: [
    {
      constraintName: 'external_identifiers_raw_record_id_fkey',
      parentTable: 'ingest.raw_source_records',
      columnNames: ['raw_record_id'],
      allColumnsNullable: true,
      deleteAction: 'SET NULL',
    },
    {
      constraintName: 'external_identifiers_source_id_fkey',
      parentTable: 'ingest.sources',
      columnNames: ['source_id'],
      allColumnsNullable: false,
      deleteAction: 'RESTRICT',
    },
  ],
  transferColumns: ['id', 'source_id', 'raw_record_id'],
  selectedTables: ['ingest.sources', 'ingest.external_identifiers'],
  tableName: 'ingest.external_identifiers',
  rows: externalIdentifierSourceRows,
  declaredProjections: [{
    table: 'ingest.external_identifiers',
    constraintName: 'external_identifiers_raw_record_id_fkey',
    parentTable: 'ingest.raw_source_records',
    columnNames: ['raw_record_id'],
    action: 'set_null',
    reason: 'parent_table_deliberately_excluded_private_provenance',
  }],
});
assert.equal(excludedParentForeignKeys.length, 1);
const projectedExcludedParentReferences = projectCatalogueExcludedParentReferences(
  externalIdentifierSourceRows,
  excludedParentForeignKeys,
  'ingest.external_identifiers',
);
assert.deepEqual(projectedExcludedParentReferences.rows, [
  { id: 'identifier-1', source_id: 'source-1', raw_record_id: null },
  { id: 'identifier-2', source_id: 'source-1', raw_record_id: null },
]);
assert.deepEqual(projectedExcludedParentReferences.projectedColumns, ['raw_record_id']);
assert.equal(projectedExcludedParentReferences.projectedRowCount, 1);
assert.equal(projectedExcludedParentReferences.projectedValueCount, 1);
assert.equal(externalIdentifierSourceRows[0].raw_record_id, 'raw-1');
assert.throws(
  () => validateCatalogueExcludedParentForeignKeys({
    foreignKeys: [{
      constraintName: 'unsafe_parent_fkey',
      parentTable: 'ingest.unselected_parent',
      columnNames: ['parent_id'],
      allColumnsNullable: true,
      deleteAction: 'RESTRICT',
    }],
    transferColumns: ['id', 'parent_id'],
    selectedTables: ['catalog.test_rows'],
    tableName: 'catalog.test_rows',
    rows: [{ id: 'test-row', parent_id: 'parent-row' }],
    declaredProjections: [],
  }),
  /undeclared_excluded_parent_reference_projection/,
);
for (const [foreignKeyPatch, expectedError] of [
  [{ allColumnsNullable: false }, /excluded_parent_reference_requires_nullable_columns/],
  [{ deleteAction: 'RESTRICT' }, /excluded_parent_reference_requires_on_delete_set_null/],
]) {
  assert.throws(
    () => validateCatalogueExcludedParentForeignKeys({
      foreignKeys: [{
        constraintName: 'external_identifiers_raw_record_id_fkey',
        parentTable: 'ingest.raw_source_records',
        columnNames: ['raw_record_id'],
        allColumnsNullable: true,
        deleteAction: 'SET NULL',
        ...foreignKeyPatch,
      }],
      transferColumns: ['id', 'raw_record_id'],
      selectedTables: ['ingest.external_identifiers'],
      tableName: 'ingest.external_identifiers',
      rows: externalIdentifierSourceRows,
      declaredProjections: [{
        table: 'ingest.external_identifiers',
        constraintName: 'external_identifiers_raw_record_id_fkey',
        parentTable: 'ingest.raw_source_records',
        columnNames: ['raw_record_id'],
        action: 'set_null',
        reason: 'parent_table_deliberately_excluded_private_provenance',
      }],
    }),
    expectedError,
  );
}
assert.deepEqual(
  validateCatalogueExcludedParentForeignKeys({
    foreignKeys: [{
      constraintName: 'unused_null_parent_fkey',
      parentTable: 'auth.users',
      columnNames: ['requested_by'],
      allColumnsNullable: true,
      deleteAction: 'NO ACTION',
    }],
    transferColumns: ['id', 'requested_by'],
    selectedTables: ['ingest.import_runs'],
    tableName: 'ingest.import_runs',
    rows: [{ id: 'run-1', requested_by: null }],
    declaredProjections: [],
  }),
  [],
);

const forwardAndCyclicSelfReferences = [
  {
    id: 'batch-two-child',
    corrected_by_id: 'later-batch-parent',
    related_by_id: null,
    composite_parent_id: 'later-batch-parent',
    composite_parent_language: 'en',
  },
  {
    id: 'later-batch-parent',
    corrected_by_id: null,
    related_by_id: null,
    composite_parent_id: null,
    composite_parent_language: null,
  },
  {
    id: 'cycle-a',
    corrected_by_id: 'cycle-b',
    related_by_id: 'later-batch-parent',
    composite_parent_id: null,
    composite_parent_language: null,
  },
  {
    id: 'cycle-b',
    corrected_by_id: 'cycle-a',
    related_by_id: null,
    composite_parent_id: null,
    composite_parent_language: 'partially-populated-fixture',
  },
];
const preparedSelfReferences = prepareCatalogueSelfReferenceTransfer(
  forwardAndCyclicSelfReferences,
  [
    'corrected_by_id',
    'related_by_id',
    'composite_parent_id',
    'composite_parent_language',
  ],
  'catalog.test_rows',
);
assert.deepEqual(
  preparedSelfReferences.initialRows,
  [
    {
      id: 'batch-two-child',
      corrected_by_id: null,
      related_by_id: null,
      composite_parent_id: null,
      composite_parent_language: null,
    },
    {
      id: 'later-batch-parent',
      corrected_by_id: null,
      related_by_id: null,
      composite_parent_id: null,
      composite_parent_language: null,
    },
    {
      id: 'cycle-a',
      corrected_by_id: null,
      related_by_id: null,
      composite_parent_id: null,
      composite_parent_language: null,
    },
    {
      id: 'cycle-b',
      corrected_by_id: null,
      related_by_id: null,
      composite_parent_id: null,
      composite_parent_language: null,
    },
  ],
  'the initial insert must not depend on self-referenced rows being in an earlier batch',
);
assert.deepEqual(
  preparedSelfReferences.rowsToRestore,
  [
    forwardAndCyclicSelfReferences[0],
    forwardAndCyclicSelfReferences[2],
    forwardAndCyclicSelfReferences[3],
  ],
  'only rows with populated self references need the exact-value restoration pass',
);
assert.equal(preparedSelfReferences.deferredRowCount, 3);
assert.equal(preparedSelfReferences.deferredValueCount, 7);
assert.equal(
  forwardAndCyclicSelfReferences[0].corrected_by_id,
  'later-batch-parent',
  'preparing the initial insert must not mutate the verified source snapshot',
);
const sourceIdentityPlan = planCatalogueSourceIdentityMerge(
  [
    { id: 'staging-shared', code: 'shared', display_name: 'Staging shared' },
    { id: 'staging-new', code: 'new', display_name: 'Staging new' },
  ],
  [
    { id: 'production-shared', code: 'shared', display_name: 'Production shared' },
    { id: 'production-only', code: 'legacy', display_name: 'Production only' },
  ],
);
assert.equal(sourceIdentityPlan.sourceIdMap.get('staging-shared'), 'production-shared');
assert.equal(sourceIdentityPlan.sourceIdMap.get('staging-new'), 'staging-new');
assert.deepEqual(
  sourceIdentityPlan.mappedSourceRows.map(({ id, code }) => ({ id, code })),
  [
    { id: 'production-shared', code: 'shared' },
    { id: 'staging-new', code: 'new' },
  ],
);
assert.deepEqual(
  sourceIdentityPlan.preservedTargetOnlyRows.map(({ id, code }) => ({ id, code })),
  [{ id: 'production-only', code: 'legacy' }],
);
assert.equal(sourceIdentityPlan.preservedProductionSourceIdCount, 1);
assert.equal(sourceIdentityPlan.remappedSourceIdCount, 1);
assert.equal(sourceIdentityPlan.insertedSourceCount, 1);
const retainedProductionConflict = { source_id: 'production-shared' };
assert.ok(
  sourceIdentityPlan.mappedSourceRows.some(({ id }) => id === retainedProductionConflict.source_id),
  'a retained production conflict must keep referencing the preserved production source UUID',
);
const rerunSourceIdentityPlan = planCatalogueSourceIdentityMerge(
  [
    { id: 'staging-shared', code: 'shared', display_name: 'Staging shared' },
    { id: 'staging-new', code: 'new', display_name: 'Staging new' },
  ],
  [...sourceIdentityPlan.mappedSourceRows, ...sourceIdentityPlan.preservedTargetOnlyRows],
);
assert.deepEqual(
  [...rerunSourceIdentityPlan.sourceIdMap.entries()],
  [...sourceIdentityPlan.sourceIdMap.entries()],
  'rerunning the promotion must preserve the same source identity mapping',
);
assert.equal(rerunSourceIdentityPlan.insertedSourceCount, 0);

const sourceForeignKeyRows = [
  { id: 'row-1', source_id: 'staging-shared' },
  { id: 'row-2', source_id: 'staging-new' },
  { id: 'row-3', source_id: null },
];
const remappedSourceForeignKeys = remapCatalogueSourceForeignKeys(
  sourceForeignKeyRows,
  ['source_id'],
  sourceIdentityPlan.sourceIdMap,
  'catalog.assets',
);
assert.deepEqual(
  remappedSourceForeignKeys.rows.map(({ id, source_id: sourceId }) => ({ id, sourceId })),
  [
    { id: 'row-1', sourceId: 'production-shared' },
    { id: 'row-2', sourceId: 'staging-new' },
    { id: 'row-3', sourceId: null },
  ],
);
assert.equal(remappedSourceForeignKeys.remappedRowCount, 1);
assert.equal(sourceForeignKeyRows[0].source_id, 'staging-shared');
const reorderedCompositeKeySourceRows = [
  { catalogue_version_id: 'version-1', source_id: 'z-source', external_id: 'one' },
  { catalogue_version_id: 'version-1', source_id: 'a-source', external_id: 'two' },
];
const reorderedCompositeKeyTargetRows = [
  reorderedCompositeKeySourceRows[1],
  reorderedCompositeKeySourceRows[0],
];
const reorderedCompositeKeyMatches = verifyCatalogueRowsByPrimaryKey(
  'catalog.catalogue_version_external_identifiers',
  reorderedCompositeKeySourceRows,
  reorderedCompositeKeyTargetRows,
  ['catalogue_version_id', 'source_id', 'external_id'],
);
assert.equal(
  stableCatalogueJson(reorderedCompositeKeyMatches),
  stableCatalogueJson(reorderedCompositeKeySourceRows),
  'post-commit verification must canonicalize target rows to transformed source order',
);
assert.throws(
  () => remapCatalogueSourceForeignKeys(
    [{ id: 'row-missing', source_id: 'missing-source' }],
    ['source_id'],
    sourceIdentityPlan.sourceIdMap,
    'ingest.external_identifiers',
  ),
  /catalogue_source_identity_mapping_missing:ingest\.external_identifiers:source_id:missing-source/,
);
assert.throws(
  () => planCatalogueSourceIdentityMerge(
    [{ id: 'production-only', code: 'new-code' }],
    [{ id: 'production-only', code: 'legacy-code' }],
  ),
  /catalogue_source_identity_id_collision:production-only:legacy-code:new-code/,
);

const assetRewriteTimestamp = '2026-08-12T16:30:00.000Z';
const assetRewrite = rewriteProductionCatalogueAssetUrls(
  [
    {
      id: 'asset-1',
      storage_provider: 'supabase_storage',
      storage_bucket: 'stackr-catalogue-public',
      url: 'https://staging-ref.supabase.co/storage/v1/object/public/example.webp',
      updated_at: '2026-08-11T00:00:00.000Z',
    },
    {
      id: 'asset-2',
      storage_provider: 'remote',
      storage_bucket: null,
      url: 'https://staging-ref.example/remote.webp',
      updated_at: '2026-08-11T00:00:00.000Z',
    },
  ],
  'staging-ref',
  'production-ref',
  assetRewriteTimestamp,
);
assert.equal(assetRewrite.rewrittenRowCount, 1);
assert.equal(assetRewrite.reusedProductionTimestampCount, 0);
assert.equal(
  assetRewrite.rows[0].url,
  'https://production-ref.supabase.co/storage/v1/object/public/example.webp',
);
assert.equal(assetRewrite.rows[0].updated_at, assetRewriteTimestamp);
assert.equal(assetRewrite.rows[1].url, 'https://staging-ref.example/remote.webp');
assert.equal(
  assetRewrite.rows[0].id,
  'asset-1',
  'rewriting a production Storage URL must preserve the catalogue asset identity',
);

const priorProductionAssetTimestamp = new Date('2026-08-12T18:14:40.182Z');
const idempotentAssetRewrite = rewriteProductionCatalogueAssetUrls(
  [{
    id: 'asset-1',
    storage_provider: 'supabase_storage',
    storage_bucket: 'stackr-catalogue-public',
    url: 'https://staging-ref.supabase.co/storage/v1/object/public/example.webp',
    updated_at: '2026-08-11T00:00:00.000Z',
  }],
  'staging-ref',
  'production-ref',
  assetRewriteTimestamp,
  [{
    id: 'asset-1',
    storage_provider: 'supabase_storage',
    storage_bucket: 'stackr-catalogue-public',
    url: 'https://production-ref.supabase.co/storage/v1/object/public/example.webp',
    updated_at: priorProductionAssetTimestamp,
  }],
  ['id'],
  ['id', 'storage_provider', 'storage_bucket', 'url', 'updated_at'],
);
assert.equal(idempotentAssetRewrite.rewrittenRowCount, 1);
assert.equal(idempotentAssetRewrite.reusedProductionTimestampCount, 1);
assert.equal(idempotentAssetRewrite.rows[0].updated_at, priorProductionAssetTimestamp);

const changedAssetRewrite = rewriteProductionCatalogueAssetUrls(
  [{
    id: 'asset-1',
    storage_provider: 'supabase_storage',
    storage_bucket: 'stackr-catalogue-public',
    url: 'https://staging-ref.supabase.co/storage/v1/object/public/changed.webp',
    updated_at: '2026-08-11T00:00:00.000Z',
  }],
  'staging-ref',
  'production-ref',
  assetRewriteTimestamp,
  idempotentAssetRewrite.rows,
  ['id'],
  ['id', 'storage_provider', 'storage_bucket', 'url', 'updated_at'],
);
assert.equal(changedAssetRewrite.reusedProductionTimestampCount, 0);
assert.equal(changedAssetRewrite.rows[0].updated_at, assetRewriteTimestamp);

const changedAssetMetadataRewrite = rewriteProductionCatalogueAssetUrls(
  [{
    id: 'asset-1',
    storage_provider: 'supabase_storage',
    storage_bucket: 'stackr-catalogue-public',
    url: 'https://staging-ref.supabase.co/storage/v1/object/public/example.webp',
    width: 100,
    updated_at: '2026-08-11T00:00:00.000Z',
  }],
  'staging-ref',
  'production-ref',
  assetRewriteTimestamp,
  [{
    id: 'asset-1',
    storage_provider: 'supabase_storage',
    storage_bucket: 'stackr-catalogue-public',
    url: 'https://production-ref.supabase.co/storage/v1/object/public/example.webp',
    width: 99,
    updated_at: priorProductionAssetTimestamp,
  }],
  ['id'],
  ['id', 'storage_provider', 'storage_bucket', 'url', 'width', 'updated_at'],
);
assert.equal(changedAssetMetadataRewrite.reusedProductionTimestampCount, 0);
assert.equal(changedAssetMetadataRewrite.rows[0].updated_at, assetRewriteTimestamp);

const exactTargetMatchInput = {
  tableName: 'catalog.example',
  sourceRows: [{ id: 'source-1', value: 'canonical' }],
  preservedTargetRows: [{ id: 'preserved-1', value: 'production-only' }],
  targetRows: [
    { id: 'preserved-1', value: 'production-only' },
    { id: 'source-1', value: 'canonical' },
  ],
  primaryKey: ['id'],
  targetSequenceStates: [],
};
assert.deepEqual(
  catalogueTransferTargetMatch(exactTargetMatchInput),
  { matches: true, reason: null },
);
assert.deepEqual(
  catalogueTransferTargetMatch({
    ...exactTargetMatchInput,
    targetRows: exactTargetMatchInput.targetRows.slice(0, 1),
  }),
  { matches: false, reason: 'row_count' },
);
assert.deepEqual(
  catalogueTransferTargetMatch({
    ...exactTargetMatchInput,
    targetRows: [...exactTargetMatchInput.targetRows, { id: 'extra-1', value: 'extra' }],
  }),
  { matches: false, reason: 'row_count' },
);
assert.deepEqual(
  catalogueTransferTargetMatch({
    ...exactTargetMatchInput,
    targetRows: [
      exactTargetMatchInput.targetRows[0],
      { id: 'source-1', value: 'changed' },
    ],
  }),
  { matches: false, reason: 'transferred_row_mismatch' },
);
assert.deepEqual(
  catalogueTransferTargetMatch({
    ...exactTargetMatchInput,
    sourceRows: [{ id: 'shared-1', value: 'canonical' }],
    preservedTargetRows: [{ id: 'shared-1', value: 'production-only' }],
    targetRows: [
      { id: 'shared-1', value: 'canonical' },
      { id: 'other-1', value: 'production-only' },
    ],
  }),
  { matches: false, reason: 'expected_primary_key_overlap' },
);
const sequenceStates = [{
  column: 'id',
  sequence: 'catalog.example_id_seq',
  startValue: '1',
  lastValue: '3',
  isCalled: false,
}];
assert.deepEqual(
  expectedCatalogueOwnedSequenceStates(sequenceStates, [{ id: 1 }, { id: 2 }]),
  sequenceStates,
);
assert.deepEqual(
  catalogueTransferTargetMatch({
    tableName: 'catalog.example',
    sourceRows: [{ id: 1 }, { id: 2 }],
    preservedTargetRows: [],
    targetRows: [{ id: 1 }, { id: 2 }],
    primaryKey: ['id'],
    targetSequenceStates: [{ ...sequenceStates[0], lastValue: '2', isCalled: true }],
  }),
  { matches: false, reason: 'sequence_state' },
);

const { normalizePostgresUrl } = await import('./deploy/prepare-postgres-urls.mjs');
const {
  SUPABASE_ROOT_CA_FINGERPRINT256,
  createVerifiedSupabasePostgresClient,
  createVerifiedSupabasePostgresConfig,
  stripPostgresTlsParameters,
} = await import('./deploy/verified-supabase-postgres.mjs');
const { assertNoPostgresConnectionOverrides } = await import('./deploy/postgres-url-guard.mjs');
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
assert.throws(
  () => normalizePostgresUrl(
    'postgresql://stackr_recognition.exampleproject:password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
    'exampleproject',
  ),
  /database_url_role_mismatch/,
  'deployment database URLs must use the project postgres role, not a restricted service login',
);

const tlsConfiguredUrl = 'postgresql://postgres.exampleproject:password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require&sslrootcert=%2Ftmp%2Funtrusted-ca.pem&sslcert=%2Ftmp%2Fclient.pem&sslkey=%2Ftmp%2Fclient.key&ssl=true&application_name=preserved';
const verifiedPostgresConfig = createVerifiedSupabasePostgresConfig(
  tlsConfiguredUrl,
  'stackr-deployment-test',
);
const verifiedPostgresUrl = new URL(verifiedPostgresConfig.connectionString);
for (const parameter of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey']) {
  assert.equal(verifiedPostgresUrl.searchParams.has(parameter), false, `TLS URL parameter ${parameter} must not override the pinned certificate`);
}
assert.equal(verifiedPostgresUrl.searchParams.get('application_name'), 'preserved');
assert.equal(verifiedPostgresConfig.ssl.rejectUnauthorized, true);
assert.equal(
  new X509Certificate(verifiedPostgresConfig.ssl.ca).fingerprint256,
  SUPABASE_ROOT_CA_FINGERPRINT256,
  'deployment database clients must pin the published Supabase root certificate',
);
assert.throws(
  () => stripPostgresTlsParameters('postgresql://postgres:password@db.example.invalid:5432/postgres'),
  /untrusted_supabase_postgres_host/,
);
for (const [parameter, value] of [
  ['host', 'db.example.invalid'],
  ['port', '6543'],
  ['user', 'postgres.anotherproject'],
  ['password', 'another-password'],
]) {
  assert.throws(
    () => createVerifiedSupabasePostgresClient(
      `${tlsConfiguredUrl}&${parameter}=${encodeURIComponent(value)}`,
      'stackr-deployment-test',
    ),
    new RegExp(`unsafe_postgres_connection_parameter:${parameter}`),
    `query parameter ${parameter} must not override the verified database target`,
  );
}
assert.throws(
  () => normalizePostgresUrl(
    'postgresql://postgres.exampleproject:password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?host=db.example.invalid',
    'exampleproject',
  ),
  /unsafe_postgres_connection_parameter:host/,
  'CLI database URLs must reject host overrides too',
);
assert.throws(
  () => assertNoPostgresConnectionOverrides(new URL('postgresql://postgres:password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?user=postgres.anotherproject')),
  /unsafe_postgres_connection_parameter:user/,
  'the dependency-free URL guard must protect non-Node deployment tools too',
);
assert.doesNotMatch(
  readFileSync('scripts/deploy/prepare-postgres-urls.mjs', 'utf8'),
  /verified-supabase-postgres/,
  'URL normalization must remain usable in lightweight workflows without node-postgres installed',
);
const verifiedPostgresClient = createVerifiedSupabasePostgresClient(
  tlsConfiguredUrl,
  'stackr-deployment-test',
);
assert.equal(verifiedPostgresClient.connectionParameters.ssl.rejectUnauthorized, true);
assert.equal(
  new X509Certificate(verifiedPostgresClient.connectionParameters.ssl.ca).fingerprint256,
  SUPABASE_ROOT_CA_FINGERPRINT256,
  'node-postgres must retain the pinned CA after parsing the connection URL',
);
assert.throws(
  () => createVerifiedSupabasePostgresClient(tlsConfiguredUrl, 'stackr-deployment-test', {
    ssl: { rejectUnauthorized: false },
  }),
  /unsafe_postgres_client_option:ssl/,
);
for (const clientScript of [
  'scripts/deploy/promote-catalogue-storage.mjs',
  'scripts/deploy/rehearse-staging-catalogue-transfer.mjs',
  'scripts/deploy/backup-restore-storage-fixture.mjs',
  'scripts/deploy/verify-postgres-restore.mjs',
  'scripts/deploy/release-database.mjs',
]) {
  const source = readFileSync(clientScript, 'utf8');
  assert.match(source, /createVerifiedSupabasePostgresClient/);
  assert.doesNotMatch(source, /rejectUnauthorized\s*:\s*false|sslmode=no-verify|NODE_TLS_REJECT_UNAUTHORIZED|uselibpqcompat/);
}

const {
  isStorageConnectionLimitError,
  isRetryableStorageError,
  isStorageThrottleError,
  retryStorageOperation,
} = await import('./deploy/storage-operation-retry.mjs');
assert.equal(
  isStorageConnectionLimitError(new Error('Too many connections issued to the database')),
  true,
);
assert.equal(isStorageConnectionLimitError(new Error('temporary network error')), false);
assert.equal(isStorageThrottleError({ statusCode: 429, message: 'SlowDown' }), true);
assert.equal(isStorageThrottleError({ cause: { code: 'too_many_connections' } }), true);
assert.equal(isRetryableStorageError({ status: 503, message: 'service unavailable' }), true);
assert.equal(isRetryableStorageError({ code: 'ECONNRESET', message: 'socket closed' }), true);
assert.equal(isRetryableStorageError({ statusCode: 401, message: 'invalid key' }), false);
assert.equal(isRetryableStorageError({ statusCode: 404, message: 'object missing' }), false);
const abortedUploadError = {
  statusCode: 400,
  message: 'upload_production_object:public/card_image/hash/original.png:Bad Request',
};
assert.equal(isRetryableStorageError(abortedUploadError), false);
assert.equal(
  isRetryableStorageError(abortedUploadError, { retryAbortedUploadBadRequest: true }),
  true,
);
assert.equal(
  isRetryableStorageError({
    message: abortedUploadError.message,
    status: 400,
    cause: { message: 'Bad Request', status: 400, statusCode: '400' },
  }, { retryAbortedUploadBadRequest: true }),
  true,
);
assert.equal(
  isRetryableStorageError({
    message: abortedUploadError.message,
    status: 400,
    cause: { message: 'Bad Request', status: 400, statusCode: 'InvalidRequest' },
  }, { retryAbortedUploadBadRequest: true }),
  false,
);
assert.equal(
  isRetryableStorageError(
    { statusCode: 400, message: 'download_source_object:path:Bad Request' },
    { retryAbortedUploadBadRequest: true },
  ),
  false,
);
const connectionLimitWaits = [];
const connectionLimitRetries = [];
let connectionLimitAttempts = 0;
assert.equal(
  await retryStorageOperation(async () => {
    connectionLimitAttempts += 1;
    if (connectionLimitAttempts < 3) {
      throw new Error('Too many connections issued to the database');
    }
    return 'recovered';
  }, {
    attempts: 6,
    random: () => 0,
    wait: async (milliseconds) => connectionLimitWaits.push(milliseconds),
    onRetry: (details) => connectionLimitRetries.push(details),
  }),
  'recovered',
);
assert.equal(connectionLimitAttempts, 3);
assert.deepEqual(connectionLimitWaits, [5_000, 10_000]);
assert.deepEqual(
  connectionLimitRetries.map(({ throttled }) => throttled),
  [true, true],
);
const ordinaryWaits = [];
let ordinaryAttempts = 0;
await assert.rejects(
  retryStorageOperation(async () => {
    ordinaryAttempts += 1;
    const error = new Error('service temporarily unavailable');
    error.statusCode = 503;
    throw error;
  }, {
    attempts: 3,
    random: () => 0,
    wait: async (milliseconds) => ordinaryWaits.push(milliseconds),
  }),
  /service temporarily unavailable/,
);
assert.equal(ordinaryAttempts, 3);
assert.deepEqual(ordinaryWaits, [500, 1_000]);
let fatalAttempts = 0;
await assert.rejects(
  retryStorageOperation(async () => {
    fatalAttempts += 1;
    const error = new Error('invalid service key');
    error.statusCode = 401;
    throw error;
  }, {
    attempts: 6,
    wait: async () => assert.fail('fatal Storage errors must not be delayed or retried'),
  }),
  /invalid service key/,
);
assert.equal(fatalAttempts, 1);
const cappedThrottleWaits = [];
let cappedThrottleAttempts = 0;
await assert.rejects(
  retryStorageOperation(async () => {
    cappedThrottleAttempts += 1;
    const error = new Error('SlowDown: Too many connections issued to the database');
    error.statusCode = 429;
    throw error;
  }, {
    attempts: 6,
    random: () => 0.999,
    wait: async (milliseconds) => cappedThrottleWaits.push(milliseconds),
  }),
  /Too many connections/,
);
assert.equal(cappedThrottleAttempts, 6);
assert.ok(cappedThrottleWaits.every((milliseconds) => milliseconds <= 60_000));
assert.equal(cappedThrottleWaits.at(-1), 60_000);
const abortedUploadWaits = [];
const abortedUploadRetries = [];
let abortedUploadAttempts = 0;
assert.equal(
  await retryStorageOperation(async () => {
    abortedUploadAttempts += 1;
    if (abortedUploadAttempts === 1) throw abortedUploadError;
    return 'uploaded';
  }, {
    attempts: 6,
    retryAbortedUploadBadRequest: true,
    random: () => 0,
    wait: async (milliseconds) => abortedUploadWaits.push(milliseconds),
    onRetry: (details) => abortedUploadRetries.push(details),
  }),
  'uploaded',
);
assert.equal(abortedUploadAttempts, 2);
assert.deepEqual(abortedUploadWaits, [2_000]);
assert.equal(abortedUploadRetries[0].abortedUpload, true);
let exhaustedAbortedUploadAttempts = 0;
await assert.rejects(
  retryStorageOperation(async () => {
    exhaustedAbortedUploadAttempts += 1;
    throw abortedUploadError;
  }, {
    attempts: 3,
    retryAbortedUploadBadRequest: true,
    random: () => 0,
    wait: async () => {},
  }),
  (error) => error === abortedUploadError,
);
assert.equal(exhaustedAbortedUploadAttempts, 3);

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
assert.match(productionWorkflow, /STACKR_STORAGE_PROMOTION_CONCURRENCY: 8/);
assert.match(productionWorkflow, /STACKR_STORAGE_PROMOTION_RETRY_ATTEMPTS: 6/);
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
