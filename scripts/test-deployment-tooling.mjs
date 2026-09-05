import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

const { verifyPriceRefreshRuntime } = await import('./deploy/verify-price-refresh-runtime.mjs');
const productionProjectRef = releaseManifest.components.database.projectRef;
const testOnlyProductionKey = ['sb', 'secret', 'A'.repeat(24)].join('_');
const verifiedPriceRefreshRequests = [];
const verifiedPriceRefreshRuntime = await verifyPriceRefreshRuntime({
  environment: {
    PRICE_API_URL: 'https://prices.production.invalid',
    SUPABASE_SERVICE_ROLE_KEY: testOnlyProductionKey,
    SUPABASE_URL: `https://${productionProjectRef}.supabase.co`,
  },
  request: async (url, options) => {
    verifiedPriceRefreshRequests.push({ url: String(url), options });
    if (url.hostname.endsWith('.supabase.co')) {
      return new Response(JSON.stringify([{ code: 'en' }]), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      ok: true,
      runtime: {
        railwayEnvironment: 'production',
        supabaseProjectRef: productionProjectRef,
      },
    }), { headers: { 'content-type': 'application/json' } });
  },
});
assert.equal(verifiedPriceRefreshRuntime.projectRef, productionProjectRef);
assert.equal(verifiedPriceRefreshRequests.length, 2);
assert.equal(
  verifiedPriceRefreshRequests[0].url,
  `https://${productionProjectRef}.supabase.co/rest/v1/catalogue_languages?select=code&limit=1`,
);
assert.equal(verifiedPriceRefreshRequests[0].options.headers.apikey, testOnlyProductionKey);
assert.equal(
  verifiedPriceRefreshRequests[0].options.headers.Authorization,
  undefined,
  'modern Supabase secret keys must not be sent as JWT bearer tokens',
);
assert.equal(verifiedPriceRefreshRequests[1].url, 'https://prices.production.invalid/health');

await assert.rejects(
  verifyPriceRefreshRuntime({
    environment: {
      PRICE_API_URL: 'https://prices.production.invalid',
      SUPABASE_SERVICE_ROLE_KEY: testOnlyProductionKey,
      SUPABASE_URL: `https://${releaseManifest.components.database.stagingProjectRef}.supabase.co`,
    },
    request: async () => new Response('{}'),
  }),
  /must target the release-manifest production project/,
);

await assert.rejects(
  verifyPriceRefreshRuntime({
    environment: {
      PRICE_API_URL: 'https://prices.production.invalid',
      SUPABASE_SERVICE_ROLE_KEY: ['sb', 'publishable', 'A'.repeat(24)].join('_'),
      SUPABASE_URL: `https://${productionProjectRef}.supabase.co`,
    },
    request: async () => new Response('{}'),
  }),
  /is not a server-side Supabase credential/,
);

await assert.rejects(
  verifyPriceRefreshRuntime({
    environment: {
      PRICE_API_URL: 'https://prices.staging.invalid',
      SUPABASE_SERVICE_ROLE_KEY: testOnlyProductionKey,
      SUPABASE_URL: `https://${productionProjectRef}.supabase.co`,
    },
    request: async (url) => url.hostname.endsWith('.supabase.co')
      ? new Response(JSON.stringify([{ code: 'en' }]))
      : new Response(JSON.stringify({
        ok: true,
        runtime: {
          railwayEnvironment: 'staging',
          supabaseProjectRef: releaseManifest.components.database.stagingProjectRef,
        },
      })),
  }),
  /PRICE_API_URL is not the approved production backend runtime/,
);

const catalogueWorkerSecretsTemp = mkdtempSync(path.join(tmpdir(), 'stackr-catalogue-worker-secrets-test-'));
try {
  const catalogueSecrets = {
    BACKEND_ORIGIN_KEY: 'test-catalogue-origin-key',
    BACKEND_ADMIN_KEY: 'test-catalogue-admin-key',
  };
  for (const scope of ['gate0_hardening', 'catalogue_api']) {
    const outputPath = path.join(catalogueWorkerSecretsTemp, `${scope}-worker-secrets.json`);
    const workerSecrets = run(
      'scripts/deploy/write-worker-secrets.mjs',
      [`--output=${outputPath}`],
      { ...catalogueSecrets, STACKR_DEPLOYMENT_SCOPE: scope },
    );
    assert.equal(workerSecrets.status, 0, workerSecrets.stderr || workerSecrets.stdout);
    assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')), catalogueSecrets);
    for (const value of Object.values(catalogueSecrets)) {
      assert.doesNotMatch(workerSecrets.stdout, new RegExp(value), 'worker secret values must not be logged');
    }
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
  // The repository ledger is eight reviewed migrations ahead of the last
  // legacy reconciliation evidence: Premium Seller, the byte-identical
  // emergency containment capture, Gate 0, and the unapplied staging-first
  // catalogue natural-identity reconciliation, followed by staging's atomic
  // exact raw-revision retention, immutable run-observation provenance,
  // conflict-deduplication lookup index, and launch conflict-report repair.
  // Normal production workflows remain fail-closed; staging applies
  // migrations only through scoped paths.
  const reconciliation = JSON.parse(migrationReconciliation.stdout);
  assert.equal(reconciliation.localMigrationFileCount, reconciliation.stagingMigrationHistoryCount + 8);
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
  assert.equal(localMigrations.at(-1), '20260831202805_repair_launch_catalogue_conflict_set_resolution.sql');
  assert.ok(localMigrations.includes('20260827093110_emergency_client_write_containment.sql'));
  assert.ok(localMigrations.includes('20260827124944_gate0_financial_route_containment.sql'));
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
const catalogueAssetsProductionPreflight = run(
  'scripts/deploy/preflight.mjs',
  ['--catalogue-assets-release'],
  {
    STACKR_DEPLOYMENT_ENVIRONMENT: 'production',
    STACKR_DEPLOYMENT_SCOPE: 'catalogue_assets',
    STACKR_STORAGE_BACKUP_APPROVED: 'true',
    SUPABASE_ACCESS_TOKEN: 'test-only',
    SUPABASE_DB_URL: 'postgresql://test-only',
    SUPABASE_PROJECT_REF: releaseManifest.components.database.projectRef,
    SUPABASE_STAGING_DB_URL: 'postgresql://test-only-staging',
    SUPABASE_STAGING_SECRET_KEY: 'test-only-staging-key',
    SUPABASE_PRODUCTION_SECRET_KEY: 'test-only-production-key',
  },
);
assert.notEqual(
  catalogueAssetsProductionPreflight.status,
  0,
  'production catalogue promotion must remain blocked until rights evidence is compiled',
);
assert.match(
  catalogueAssetsProductionPreflight.stdout,
  /release_gate_not_ready:catalogueRightsEvidenceVerified/,
);
assert.match(
  catalogueAssetsProductionPreflight.stdout,
  /release_approval_missing:STACKR_CATALOGUE_RIGHTS_RELEASE_APPROVED/,
);
const ownerApprovedButUnverifiedCatalogueAssetsPreflight = run(
  'scripts/deploy/preflight.mjs',
  ['--catalogue-assets-release'],
  {
    STACKR_DEPLOYMENT_ENVIRONMENT: 'production',
    STACKR_DEPLOYMENT_SCOPE: 'catalogue_assets',
    STACKR_STORAGE_BACKUP_APPROVED: 'true',
    STACKR_CATALOGUE_RIGHTS_RELEASE_APPROVED: 'true',
    SUPABASE_ACCESS_TOKEN: 'test-only',
    SUPABASE_DB_URL: 'postgresql://test-only',
    SUPABASE_PROJECT_REF: releaseManifest.components.database.projectRef,
    SUPABASE_STAGING_DB_URL: 'postgresql://test-only-staging',
    SUPABASE_STAGING_SECRET_KEY: 'test-only-staging-key',
    SUPABASE_PRODUCTION_SECRET_KEY: 'test-only-production-key',
  },
);
assert.notEqual(
  ownerApprovedButUnverifiedCatalogueAssetsPreflight.status,
  0,
  'protected approval must not override the checked-in rights-evidence hold',
);
assert.match(
  ownerApprovedButUnverifiedCatalogueAssetsPreflight.stdout,
  /release_gate_not_ready:catalogueRightsEvidenceVerified/,
);
assert.doesNotMatch(
  ownerApprovedButUnverifiedCatalogueAssetsPreflight.stdout,
  /release_approval_missing:STACKR_CATALOGUE_RIGHTS_RELEASE_APPROVED/,
);
assert.doesNotMatch(
  catalogueAssetsProductionPreflight.stdout,
  /missing_release_variable:(?:RAILWAY|CLOUDFLARE|BACKEND|EXPO|STACKR_GATEWAY)/,
  'assets-only production promotion must not require unrelated application deployment credentials',
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

  writeFileSync(
    path.join(secretScanTemp, 'shippo-diagnostic.txt'),
    `provider error: ${['shippo', 'live', 'A'.repeat(32)].join('_')}\n`,
  );
  const scannedShippoDiagnostic = run('scripts/deploy/secret-scan.mjs', [`--directory=${secretScanTemp}`]);
  assert.notEqual(scannedShippoDiagnostic.status, 0, 'diagnostics containing a Shippo token must not be uploaded');
  assert.match(scannedShippoDiagnostic.stderr, /shippo_api_token/);
} finally {
  rmSync(secretScanTemp, { recursive: true, force: true });
}

const dockerfile = readFileSync('recognition-service/Dockerfile', 'utf8');
assert.match(dockerfile, /python:3\.12\.11-slim-bookworm@sha256:[0-9a-f]{64}/);
assert.match(dockerfile, /USER 10001:10001/);
assert.match(dockerfile, /chmod 0555 \/models/);

const backendServer = readFileSync('backend/server.js', 'utf8');
assert.match(backendServer, /res\.setHeader\('X-Request-Id', requestId\)/);
assert.match(
  backendServer,
  /function getHealthRuntimeAttestation\(\) \{[\s\S]*gitCommit: sourceCommit\.commit[\s\S]*gitCommitSource: sourceCommit\.source[\s\S]*deploymentId:[\s\S]*railwayEnvironment:[\s\S]*supabaseProjectRef: getSupabaseProjectRef\(\)/,
  'backend health must always expose the minimal deployment attestation',
);
assert.match(backendServer, /getBundledSourceCommit\(\)[\s\S]*\.stackr-source-commit/);
assert.match(backendServer, /function getHealthSourceCommit\(\)[\s\S]*bundled_workflow_sha[\s\S]*railway_git_sha/);
const healthSourceCommit = backendServer.match(/function getHealthSourceCommit\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
assert.doesNotMatch(healthSourceCommit, /SOURCE_COMMIT/);
const backendHealthHandler = backendServer.match(/app\.get\(\['\/health', '\/api\/health'\][\s\S]*?\n\}\);/)?.[0] ?? '';
assert.match(backendHealthHandler, /runtime: getHealthRuntimeAttestation\(\)/);
assert.doesNotMatch(backendHealthHandler, /KeyPreview|publicPreview|STACKR_HEALTH_RUNTIME_DIAGNOSTICS/);

const rollbackTool = readFileSync('scripts/deploy/railway-rollback.mjs', 'utf8');
assert.match(rollbackTool, /backend: 'RAILWAY_BACKEND_SERVICE_ID'/);
assert.match(rollbackTool, /recognition: 'RAILWAY_RECOGNITION_SERVICE_ID'/);
assert.match(rollbackTool, /serviceId environmentId/);
assert.match(rollbackTool, /RAILWAY_BACKEND_SERVICE_ID/);
assert.match(rollbackTool, /RAILWAY_RECOGNITION_SERVICE_ID/);
assert.match(rollbackTool, /RAILWAY_ENVIRONMENT_ID/);
assert.match(rollbackTool, /deployment\.status !== 'SUCCESS'/);
assert.match(rollbackTool, /verifyOnly/);
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

const rollbackMockImport = `--import=${pathToFileURL(path.resolve('scripts/test-fixtures/mock-railway-rollback-fetch.mjs')).href}`;
const rollbackEnvironment = {
  NODE_OPTIONS: [process.env.NODE_OPTIONS, rollbackMockImport].filter(Boolean).join(' '),
  RAILWAY_API_TOKEN: 'test',
  RAILWAY_RECOGNITION_SERVICE_ID: 'recognition-service',
  RAILWAY_ENVIRONMENT_ID: 'staging-environment',
  MOCK_RAILWAY_SERVICE_ID: 'recognition-service',
  MOCK_RAILWAY_ENVIRONMENT_ID: 'staging-environment',
};
const unsupportedRollback = run(
  'scripts/deploy/railway-rollback.mjs',
  ['--component=catalogue-api', '--deployment=backend-deployment'],
  { NODE_OPTIONS: rollbackMockImport },
);
assert.notEqual(unsupportedRollback.status, 0, 'unapproved Railway components must remain blocked');
assert.match(unsupportedRollback.stderr, /supports only backend or recognition/);

const disguisedBackendRollback = run(
  'scripts/deploy/railway-rollback.mjs',
  ['--component=recognition', '--deployment=backend-deployment'],
  { ...rollbackEnvironment, MOCK_RAILWAY_SERVICE_ID: 'backend-service' },
);
assert.notEqual(disguisedBackendRollback.status, 0, 'a backend deployment ID must not pass as recognition');
assert.match(disguisedBackendRollback.stderr, /not a recognition deployment/);

const crossedEnvironmentRollback = run(
  'scripts/deploy/railway-rollback.mjs',
  ['--component=recognition', '--deployment=recognition-deployment'],
  { ...rollbackEnvironment, MOCK_RAILWAY_ENVIRONMENT_ID: 'production-environment' },
);
assert.notEqual(crossedEnvironmentRollback.status, 0, 'recognition rollback must stay in its protected environment');
assert.match(crossedEnvironmentRollback.stderr, /different environment/);

const recognitionRollback = run(
  'scripts/deploy/railway-rollback.mjs',
  ['--component=recognition', '--deployment=recognition-deployment'],
  { ...rollbackEnvironment, MOCK_RAILWAY_ALLOW_MUTATION: 'true' },
);
assert.equal(recognitionRollback.status, 0, recognitionRollback.stderr || recognitionRollback.stdout);
assert.match(recognitionRollback.stdout, /"deploymentRollback": true/);

const backendRollbackEnvironment = {
  NODE_OPTIONS: [process.env.NODE_OPTIONS, rollbackMockImport].filter(Boolean).join(' '),
  RAILWAY_API_TOKEN: 'test',
  RAILWAY_BACKEND_SERVICE_ID: 'backend-service',
  RAILWAY_ENVIRONMENT_ID: 'production-environment',
  MOCK_RAILWAY_SERVICE_ID: 'backend-service',
  MOCK_RAILWAY_ENVIRONMENT_ID: 'production-environment',
};
const backendRollbackVerification = run(
  'scripts/deploy/railway-rollback.mjs',
  ['--component=backend', '--deployment=backend-deployment', '--verify-only'],
  backendRollbackEnvironment,
);
assert.equal(
  backendRollbackVerification.status,
  0,
  backendRollbackVerification.stderr || backendRollbackVerification.stdout,
);
assert.match(backendRollbackVerification.stdout, /"verified": true/);
assert.doesNotMatch(backendRollbackVerification.stdout, /"deploymentRollback": true/);

const failedBackendRollbackTarget = run(
  'scripts/deploy/railway-rollback.mjs',
  ['--component=backend', '--deployment=backend-deployment', '--verify-only'],
  { ...backendRollbackEnvironment, MOCK_RAILWAY_DEPLOYMENT_STATUS: 'FAILED' },
);
assert.notEqual(failedBackendRollbackTarget.status, 0, 'failed deployments must not be accepted as rollback targets');
assert.match(failedBackendRollbackTarget.stderr, /not a known-good successful deployment/);

const ineligibleBackendRollbackTarget = run(
  'scripts/deploy/railway-rollback.mjs',
  ['--component=backend', '--deployment=backend-deployment', '--verify-only'],
  { ...backendRollbackEnvironment, MOCK_RAILWAY_CAN_ROLLBACK: 'false' },
);
assert.notEqual(ineligibleBackendRollbackTarget.status, 0, 'non-rollback-eligible deployments must be rejected');
assert.match(ineligibleBackendRollbackTarget.stderr, /not rollback-eligible/);

const backendRollback = run(
  'scripts/deploy/railway-rollback.mjs',
  ['--component=backend', '--deployment=backend-deployment'],
  { ...backendRollbackEnvironment, MOCK_RAILWAY_ALLOW_MUTATION: 'true' },
);
assert.equal(backendRollback.status, 0, backendRollback.stderr || backendRollback.stdout);
assert.match(backendRollback.stdout, /"component": "backend"/);
assert.match(backendRollback.stdout, /"deploymentRollback": true/);

const stagingWorkflow = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
const platformCiWorkflow = readFileSync('.github/workflows/platform-ci.yml', 'utf8');
const productionWorkflow = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const productionBackendOnlyJob = productionWorkflow.slice(
  productionWorkflow.indexOf('  backend_only:'),
  productionWorkflow.indexOf('  deploy:', productionWorkflow.indexOf('  backend_only:')),
);
const productionBackendHardeningWorkflow = readFileSync(
  '.github/workflows/deploy-production-backend-hardening.yml',
  'utf8',
);
const productionBackendHardeningApproval = JSON.parse(
  readFileSync('deploy/production-backend-hardening-approval.json', 'utf8'),
);
const productionMonitorWorkflow = readFileSync('.github/workflows/production-api-monitor.yml', 'utf8');
const priceRefreshWorkflow = readFileSync('.github/workflows/price-refresh.yml', 'utf8');
const rollbackWorkflow = readFileSync('.github/workflows/rollback.yml', 'utf8');
const recoveryWorkflow = readFileSync('.github/workflows/staging-recovery-drill.yml', 'utf8');
const productionBaselineWorkflow = readFileSync('.github/workflows/capture-production-schema-baseline.yml', 'utf8');
const baselineMigrationTrialWorkflow = readFileSync('.github/workflows/trial-production-baseline-migrations.yml', 'utf8');
const stagingRebuildBreakGlassWorkflow = readFileSync('.github/workflows/rebuild-staging-break-glass.yml', 'utf8');
const catalogueTransferWorkflow = readFileSync('.github/workflows/staging-catalogue-preservation-rehearsal.yml', 'utf8');
const legacyCataloguePromotionWorkflow = readFileSync('.github/workflows/promote-catalogue-production.yml', 'utf8');
const legacyCatalogueDataPromotionWorkflow = readFileSync('.github/workflows/promote-catalogue-data-production.yml', 'utf8');
const normalizedCatalogueEvidenceWorkflow = readFileSync(
  '.github/workflows/normalize-resumed-catalogue-backfill-evidence.yml',
  'utf8',
);
const retiredCatalogueContinuationWorkflow = readFileSync(
  '.github/workflows/continue-catalogue-production-after-resume.yml',
  'utf8',
);
const pricingV2DeployScript = readFileSync('scripts/pricing-v2-deploy.mjs', 'utf8');
const packageManifest = JSON.parse(readFileSync('package.json', 'utf8'));
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

for (const [workflowName, workflow] of [
  ['promote-catalogue-production.yml', legacyCataloguePromotionWorkflow],
  ['promote-catalogue-data-production.yml', legacyCatalogueDataPromotionWorkflow],
]) {
  assert.match(workflow, /name: Retired -/);
  assert.match(workflow, /deploy-production\.yml/);
  assert.match(workflow, /release_scope=catalogue_assets/);
  assert.match(workflow, /apply_migrations=false/);
  assert.match(workflow, /exit 1/);
  assert.doesNotMatch(
    workflow,
    /environment:\s*production|actions\/checkout|db push|catalogue-production-snapshot\.mjs|rehearse-staging-catalogue-transfer\.mjs|promote-catalogue-storage\.mjs|@railway\/cli|wrangler\s|eas update|gh workflow run/,
    `${workflowName} must remain an audit-only fail-closed handoff`,
  );
  assert.doesNotMatch(
    workflow,
    /secrets\.(?:SUPABASE|RAILWAY|CLOUDFLARE|EXPO|BACKEND)/,
    `${workflowName} must never receive deployment credentials`,
  );
}
assert.match(normalizedCatalogueEvidenceWorkflow, /actions: read/);
assert.match(normalizedCatalogueEvidenceWorkflow, /No deployment was dispatched/);
assert.match(normalizedCatalogueEvidenceWorkflow, /deploy-production\.yml/);
assert.doesNotMatch(normalizedCatalogueEvidenceWorkflow, /actions: write|gh workflow run|promote-catalogue-data-production\.yml/);
assert.match(retiredCatalogueContinuationWorkflow, /No deployment is dispatched/);
assert.match(retiredCatalogueContinuationWorkflow, /deploy-production\.yml/);
assert.match(retiredCatalogueContinuationWorkflow, /exit 1/);
assert.doesNotMatch(retiredCatalogueContinuationWorkflow, /gh workflow run/);

assert.match(pricingV2DeployScript, /manual_pricing_v2_production_deploy_retired/);
assert.match(pricingV2DeployScript, /productionMutationPerformed: false/);
assert.match(pricingV2DeployScript, /\.github\/workflows\/deploy-production\.yml/);
assert.match(pricingV2DeployScript, /process\.exitCode = 1/);
assert.doesNotMatch(
  pricingV2DeployScript,
  /dotenv|createClient|SUPABASE_(?:SERVICE_ROLE|SECRET|PROJECT_REF)|oakdbbzdqwurpjnoqhmu|spawnSync|skip-dry-run|skip-tests|pricing-v2:(?:backfill|refresh)/,
  'the retired pricing deploy command must not read production credentials or invoke data writers',
);
assert.equal(
  packageManifest.scripts['pricing-v2:deploy'],
  'node scripts/pricing-v2-deploy.mjs',
  'the public Pricing V2 deploy command must resolve only to the retired handoff',
);
const pricingDeployPlan = run('scripts/pricing-v2-deploy.mjs', ['--plan']);
assert.equal(pricingDeployPlan.status, 0, pricingDeployPlan.stderr || pricingDeployPlan.stdout);
assert.match(pricingDeployPlan.stdout, /productionMutationPerformed": false/);
const blockedPricingDeploy = run('scripts/pricing-v2-deploy.mjs');
assert.equal(blockedPricingDeploy.status, 1);
assert.match(blockedPricingDeploy.stderr, /Retired command blocked/);

assert.match(stagingWorkflow, /github\.ref == 'refs\/heads\/main'/);
assert.doesNotMatch(stagingWorkflow, /chore\/api-gateway-v1/);
assert.match(
  stagingWorkflow,
  /steps:\s*\n\s*- uses: actions\/checkout@[^\n]+\n\s+with:\s*\n\s+fetch-depth: 0/,
  'staging must fetch provenance commits before verifying the exact migration ledger',
);
const databaseMigrationCiJob = platformCiWorkflow.slice(
  platformCiWorkflow.indexOf('  database-migration-tests:'),
  platformCiWorkflow.indexOf('  openapi-and-generated-client:'),
);
assert.match(
  databaseMigrationCiJob,
  /actions\/checkout@[^\n]+\n\s+with:\s*\n\s+fetch-depth: 0/,
  'database CI must fetch provenance commits before verifying the exact migration ledger',
);
assert.match(stagingWorkflow, /Verify private service readiness[\s\S]*--require-commerce-disabled/);
assert.match(
  stagingWorkflow,
  /Smoke-test the public staging contract[\s\S]*--gateway="\$STACKR_GATEWAY_URL"[\s\S]*--backend="\$STACKR_BACKEND_URL"[\s\S]*--require-commerce-disabled/,
);
const publicStagingSmoke = stagingWorkflow.slice(
  stagingWorkflow.indexOf('Smoke-test the public staging contract'),
  stagingWorkflow.indexOf('Prove Gate 0 database containment', stagingWorkflow.indexOf('Smoke-test the public staging contract')),
);
const publicStagingSmokeBranches = publicStagingSmoke.split(/\n\s*else\s*\n/);
assert.equal(publicStagingSmokeBranches.length, 2, 'public staging smoke must have exact Gate 0 and non-Gate-0 branches');
assert.match(publicStagingSmokeBranches[0], /gate0_hardening[\s\S]*--gateway-safety/);
assert.doesNotMatch(publicStagingSmokeBranches[0], /--full-gateway|--require-published-catalogue/);
assert.match(
  publicStagingSmokeBranches[1],
  /--full-gateway[\s\S]*--require-published-catalogue[\s\S]*--required-catalogue-languages=en,ja,zh-tw,zh-cn,ko/,
);
assert.doesNotMatch(publicStagingSmokeBranches[1], /--gateway-safety/);
assert.equal(
  [...stagingWorkflow.matchAll(/--expected-backend-commit="\$GITHUB_SHA"/g)].length,
  4,
  'every private and public staging scope branch must attest the deployed backend SHA',
);
assert.equal(
  [...stagingWorkflow.matchAll(/--expected-backend-environment=staging/g)].length,
  4,
  'every staging backend attestation must bind the Railway environment',
);
assert.equal(
  [...stagingWorkflow.matchAll(/--expected-backend-supabase-project-ref=lmwfhvexfcoyeuoyrlco/g)].length,
  4,
  'every staging backend attestation must bind the staging Supabase project',
);
assert.match(productionWorkflow, /Verify service readiness before activation[\s\S]*--require-commerce-disabled/);
assert.match(productionWorkflow, /smoke_args=\([\s\S]*--require-commerce-disabled/);
assert.match(
  productionWorkflow,
  /apply_migrations:[\s\S]*?default: false[\s\S]*?type: boolean/,
  'production migrations must be an explicit opt-in',
);
assert.match(rollbackWorkflow, /Smoke-test surviving public paths[\s\S]*--require-commerce-disabled/);
assert.match(stagingWorkflow, /Attest staging source revision[\s\S]*git rev-parse HEAD/);
assert.match(productionWorkflow, /Attest production source revision[\s\S]*git rev-parse HEAD/);
assert.match(
  productionWorkflow,
  /backend_only:[\s\S]+github\.ref == 'refs\/heads\/main'[\s\S]+inputs\.confirmation == 'DEPLOY PRODUCTION'[\s\S]+inputs\.release_scope == 'backend_only'/,
  'backend-only production deployment must require the exact main ref and confirmation',
);
assert.match(productionBackendOnlyJob, /STACKR_EXPECTED_MAIN_SHA: \$\{\{ inputs\.expected_main_sha \}\}/);
assert.match(productionBackendOnlyJob, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
assert.match(productionBackendOnlyJob, /"\$STACKR_EXPECTED_MAIN_SHA" != "\$GITHUB_SHA"/);
assert.doesNotMatch(productionWorkflow, /previous_backend_deployment_id/);
assert.match(
  productionBackendOnlyJob,
  /Discover and attest the live backend rollback target[\s\S]+discover-live-railway-backend\.mjs[\s\S]+--project="\$RAILWAY_PROJECT_ID"[\s\S]+--environment="\$RAILWAY_ENVIRONMENT_ID"[\s\S]+--service="\$RAILWAY_BACKEND_SERVICE_ID"[\s\S]+--github-env="\$GITHUB_ENV"[\s\S]+rollback-target\.json[\s\S]+Deploy backend code only/,
);
assert.match(productionBackendOnlyJob, /npm run ci:secret-scan[\s\S]+--history-range="HEAD\^\.\.HEAD"/);
for (const releaseCheck of [
  'npm run lint',
  'npm run typecheck',
  'npm run typecheck:backend',
  'npm test --prefix backend',
  'npm run test:stackr-api-v1',
  'npm run test:collection-pricing-ui',
  'npm run test:commerce-release-lock',
  'node scripts/test-deployment-tooling.mjs',
  'node scripts/test-railway-live-backend-discovery.mjs',
  'npm run test:production-pricing-smoke',
]) {
  assert.ok(productionBackendOnlyJob.includes(releaseCheck), `backend-only release must run ${releaseCheck}`);
}
assert.match(
  productionBackendOnlyJob,
  /@railway\/cli@5\.30\.1 up "\$GITHUB_WORKSPACE\/backend" --detach --yes --json/,
  'backend-only deploy must capture the exact deployment ID returned by Railway up',
);
assert.match(productionBackendOnlyJob, /result\?\.deploymentId/);
assert.match(productionBackendOnlyJob, /\.stackr-source-commit/);
assert.match(productionBackendOnlyJob, /RAILWAY_DEPLOYMENT_ID="\$railway_deployment_id"/);
assert.match(productionBackendOnlyJob, /--limit 1000/);
assert.doesNotMatch(productionBackendOnlyJob, /--limit 1(?:\s|$)|deployment redeploy/);
assert.match(
  productionBackendOnlyJob,
  /Discover and attest the live backend rollback target[\s\S]+set -euo pipefail[\s\S]+discover-live-railway-backend\.mjs/,
);
assert.match(
  productionBackendOnlyJob,
  /Smoke-test exact pricing reads through backend and gateway[\s\S]+set -euo pipefail[\s\S]+production-pricing-smoke\.mjs/,
);
assert.match(productionBackendOnlyJob, /STACKR_BACKEND_DEPLOY_ATTEMPTED=true/);
assert.match(
  productionBackendOnlyJob,
  /production-pricing-smoke\.mjs[\s\S]+--backend="\$STACKR_BACKEND_URL"[\s\S]+--gateway="\$STACKR_GATEWAY_URL"[\s\S]+--variant-id="\$STACKR_PRICING_SMOKE_VARIANT_ID"[\s\S]+--expected-backend-commit="\$STACKR_EXPECTED_MAIN_SHA"[\s\S]+--expected-backend-deployment="\$STACKR_BACKEND_DEPLOYMENT_ID"/,
);
assert.match(
  productionBackendOnlyJob,
  /Roll back backend after a failed deployment or smoke check[\s\S]+if: failure\(\) && env\.STACKR_BACKEND_DEPLOY_ATTEMPTED == 'true'[\s\S]+--component=backend[\s\S]+PREVIOUS_BACKEND_DEPLOYMENT_ID/,
);
assert.doesNotMatch(
  productionBackendOnlyJob,
  /SUPABASE_(?:ACCESS_TOKEN|DB_URL|STAGING|PRODUCTION_SECRET)|supabase@|db push|promote-catalogue|release-database|wrangler|eas-cli|RAILWAY_RECOGNITION_SERVICE_ID|recognition-service|CLOUDFLARE|EXPO_TOKEN|variable set/,
  'backend-only release must never mutate database, storage, catalogue, gateway, recognition, mobile, or runtime variables',
);
assert.match(stagingWorkflow, /EXPO_PUBLIC_BETA_TRADE_DEMO_MODE: 'true'[\s\S]*Validate effective EAS preview environment/);
assert.match(productionWorkflow, /EXPO_PUBLIC_BETA_TRADE_DEMO_MODE: 'true'[\s\S]*Validate effective EAS production environment/);
assert.match(stagingWorkflow, /env:exec preview[\s\S]*--require-safe-release-flags/);
assert.match(productionWorkflow, /env:exec production[\s\S]*--require-safe-release-flags/);
assert.doesNotMatch(rollbackWorkflow, /catalogue-api/);
assert.match(rollbackWorkflow, /--component=recognition/);
assert.match(rollbackWorkflow, /RAILWAY_RECOGNITION_SERVICE_ID/);
assert.match(productionWorkflow, /PREVIOUS_BACKEND_DEPLOYMENT_ID/);
assert.doesNotMatch(productionWorkflow, /Roll back catalogue API deployment/);
assert.match(
  productionWorkflow,
  /railway-rollback\.mjs[\s\S]+--component=recognition[\s\S]+PREVIOUS_RECOGNITION_DEPLOYMENT_ID/,
);
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
  [...stagingWorkflow.matchAll(/db push\s*\\\s*\n\s*--db-url "([^"]+)"/g)].map((match) => match[1]),
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
assert.match(
  productionMonitorWorkflow,
  /STACKR_BACKEND_URL: \$\{\{ vars\.STACKR_BACKEND_URL \|\| 'https:\/\/pocketvault-production\.up\.railway\.app' \}\}/,
);
assert.match(productionMonitorWorkflow, /timeout-minutes:\s*10/);
assert.doesNotMatch(productionMonitorWorkflow, /for attempt in 1 2 3/);
assert.match(productionMonitorWorkflow, /--backend="\$STACKR_BACKEND_URL"/);
assert.match(productionMonitorWorkflow, /--require-commerce-disabled/);
assert.match(productionMonitorWorkflow, /body\?\.runtime\?\.railwayEnvironment !== 'production'/);
assert.match(productionMonitorWorkflow, /body\?\.runtime\?\.supabaseProjectRef !== 'oakdbbzdqwurpjnoqhmu'/);
assert.match(productionMonitorWorkflow, /issues: write/);
assert.match(productionMonitorWorkflow, /if: failure\(\)[\s\S]+gh issue (?:comment|create)/);
assert.match(productionMonitorWorkflow, /if: success\(\)[\s\S]+gh issue close/);
assert.doesNotMatch(
  priceRefreshWorkflow,
  /environment:\s*production/,
  'frequent scheduled price refreshes must not wait on the protected production deployment approval gate',
);
assert.match(
  priceRefreshWorkflow,
  /SUPABASE_URL: \$\{\{ vars\.STACKR_SUPABASE_URL \|\| 'https:\/\/oakdbbzdqwurpjnoqhmu\.supabase\.co' \}\}/,
);
assert.match(
  priceRefreshWorkflow,
  /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_PRODUCTION_SECRET_KEY \|\| secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/,
);
assert.match(
  priceRefreshWorkflow,
  /PRICE_API_URL: \$\{\{ vars\.STACKR_BACKEND_URL \|\| 'https:\/\/pocketvault-production\.up\.railway\.app' \}\}/,
);
assert.match(
  priceRefreshWorkflow,
  /Verify production runtime bindings[\s\S]*node scripts\/deploy\/verify-price-refresh-runtime\.mjs[\s\S]*Install dependencies/,
);
assert.doesNotMatch(priceRefreshWorkflow, /SUPABASE_URL: \$\{\{ secrets\.SUPABASE_URL \}\}/);
assert.doesNotMatch(priceRefreshWorkflow, /PRICE_API_URL: \$\{\{ secrets\.PRICE_API_URL \}\}/);
assert.doesNotMatch(
  priceRefreshWorkflow,
  /cron: '8 2 \* \* \*'|npm run daily-tcgcsv-sync/,
  'the broken full-universe Node lane must not run on a schedule or invoke its mobile pricing import',
);
assert.match(
  priceRefreshWorkflow,
  /Block disabled full universe sync[\s\S]*full-universe lane is disabled until daily-tcgcsv-sync has a Node-only pricing provider boundary[\s\S]*exit 1/,
);
assert.equal(productionBackendHardeningApproval.status, 'approved');
assert.equal(productionBackendHardeningApproval.scope, 'production_backend_hardening_only');
assert.equal(productionBackendHardeningApproval.catalogueChangesAllowed, false);
assert.equal(productionBackendHardeningApproval.newFeaturesAllowed, false);
assert.equal(productionBackendHardeningApproval.databaseChangesAllowed, false);
assert.equal(productionBackendHardeningApproval.gatewayChangesAllowed, false);
assert.equal(productionBackendHardeningApproval.mobileChangesAllowed, false);
assert.equal(productionBackendHardeningApproval.recognitionChangesAllowed, false);
assert.equal(productionBackendHardeningApproval.runtimeBindingRepairApproved, true);
assert.match(productionBackendHardeningApproval.runtimeBindingRepairApprovedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
assert.equal(
  productionBackendHardeningApproval.runtimeBindingExpectedSupabaseProjectRef,
  'oakdbbzdqwurpjnoqhmu',
);
assert.equal(productionBackendHardeningApproval.runtimeBindingMutationScope, 'railway_runtime_variables_only');
assert.equal(productionBackendHardeningApproval.searchTimeoutRepairApproved, true);
assert.match(productionBackendHardeningApproval.searchTimeoutRepairApprovedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
assert.equal(
  productionBackendHardeningApproval.searchTimeoutRepairMutationScope,
  'backend_query_order_and_exact_match_only',
);
assert.equal(productionBackendHardeningApproval.rollbackPolicy, 'never_restore_pre_lock_backend');
assert.match(productionBackendHardeningWorkflow, /environment: production/);
assert.match(productionBackendHardeningWorkflow, /paths:[\s\S]+production-backend-hardening-approval\.json/);
assert.match(productionBackendHardeningWorkflow, /verify-wp32-release-candidate\.mjs/);
assert.match(productionBackendHardeningWorkflow, /test:commerce-release-lock/);
assert.match(productionBackendHardeningWorkflow, /test:deployment/);
assert.match(productionBackendHardeningWorkflow, /@railway\/cli@5\.30\.1 up "\$GITHUB_WORKSPACE\/backend" --ci/);
assert.match(
  productionBackendHardeningWorkflow,
  /STACKR_SUPABASE_URL: \$\{\{ vars\.STACKR_SUPABASE_URL \}\}[\s\S]*STACKR_SUPABASE_PUBLISHABLE_KEY: \$\{\{ secrets\.STACKR_SUPABASE_PUBLISHABLE_KEY \}\}[\s\S]*SUPABASE_PRODUCTION_SECRET_KEY: \$\{\{ secrets\.SUPABASE_PRODUCTION_SECRET_KEY \}\}/,
);
assert.match(productionBackendHardeningWorkflow, /test "\$STACKR_SUPABASE_URL" = "\$expected_url"/);
assert.match(
  productionBackendHardeningWorkflow,
  /\/rest\/v1\/catalogue_languages\?select=code&limit=1/,
);
for (const runtimeVariable of [
  'STACKR_GATEWAY_ORIGIN_KEY BACKEND_ORIGIN_KEY',
  'SUPABASE_URL STACKR_SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY STACKR_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY SUPABASE_PRODUCTION_SECRET_KEY',
  'SOURCE_COMMIT GITHUB_SHA',
]) {
  assert.match(productionBackendHardeningWorkflow, new RegExp(`set_runtime_variable ${runtimeVariable}`));
}
assert.match(
  productionBackendHardeningWorkflow,
  /--gateway="\$STACKR_GATEWAY_URL"[\s\\]+--backend="\$STACKR_BACKEND_URL"[\s\S]*--full-gateway[\s\S]*--require-commerce-disabled/,
);
assert.match(productionBackendHardeningWorkflow, /body\?\.runtime\?\.railwayEnvironment !== 'production'/);
assert.match(productionBackendHardeningWorkflow, /body\?\.runtime\?\.supabaseProjectRef !== process\.env\.SUPABASE_PROJECT_REF/);
assert.match(productionBackendHardeningWorkflow, /--require-published-catalogue/);
assert.doesNotMatch(
  productionBackendHardeningWorkflow,
  /SUPABASE_(?:ACCESS_TOKEN|DB_URL)|CLOUDFLARE|EXPO_TOKEN|RAILWAY_RECOGNITION|release-database|db push|wrangler|eas-cli|catalogue (?:activate|rollback)|recognition-service/,
  'production backend hardening must not mutate catalogue, database, gateway, mobile or recognition state',
);
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
assert.match(stagingWorkflow, /release_scope:[\s\S]+options: \[gate0_hardening, catalogue_api, full_platform\]/);
assert.match(
  stagingWorkflow,
  /if \[ "\$\{\{ inputs\.release_scope \}\}" != "gate0_hardening" \] && \[ "\$\{\{ inputs\.release_candidate \}\}" != "true" \]; then[\s\S]*Non-Gate-0 staging deployments require release_candidate=true and reviewed evidence\.[\s\S]*exit 1/,
  'release_candidate=false must be accepted only for the isolated Gate 0 hardening scope',
);
assert.match(stagingWorkflow, /STACKR_STORAGE_BACKUP_APPROVED/);
assert.match(stagingWorkflow, /verify-staging-migration-reconciliation\.mjs --require-aligned/);
assert.match(stagingWorkflow, /verify-staging-readiness-evidence\.mjs --require-catalogue-api-ready/);
assert.match(stagingWorkflow, /verify-staging-readiness-evidence\.mjs --require-release-ready/);
assert.match(stagingWorkflow, /deploy:preflight -- --catalogue-api-release/);
assert.match(stagingWorkflow, /prepare-postgres-urls\.mjs --source-only/);
assert.match(
  stagingWorkflow,
  /test "\$SUPABASE_PROJECT_REF" = "lmwfhvexfcoyeuoyrlco"[\s\S]*test "\$STACKR_SUPABASE_URL" = "https:\/\/lmwfhvexfcoyeuoyrlco\.supabase\.co"/,
  'Gate 0 must pin both the staging database project ref and public Supabase URL',
);
assert.deepEqual(
  [...stagingWorkflow.matchAll(/db dump\s*\\\s*\n\s*--db-url "([^"]+)"/g)].map((match) => match[1]),
  ['$STACKR_SOURCE_DB_URL', '$STACKR_SOURCE_DB_URL'],
  'staging logical backups must use the validated, normalized source URL',
);
assert.match(stagingWorkflow, /Deploy recognition container[\s\S]+if: inputs\.release_scope == 'full_platform'/);
assert.match(stagingWorkflow, /RECOGNITION_REQUIRED:\$\{\{ inputs\.release_scope/);
assert.match(
  stagingWorkflow,
  /Validate staging mobile public configuration\s+if: inputs\.release_scope == 'gate0_hardening' \|\| inputs\.release_scope == 'full_platform'[\s\S]*npm run mobile:verify-runtime --[\s\S]*--expected-environment=staging[\s\S]*--expected-app-variant=staging[\s\S]*--require-explicit[\s\S]*--require-safe-release-flags/,
  'Gate 0 and full staging deployments must validate the explicit safe mobile runtime even without publishing an update',
);
for (const [variable, expectedValue] of Object.entries({
  STACKR_MOBILE_APP_VARIANT: 'staging',
  STACKR_MOBILE_ENVIRONMENT: 'staging',
  STACKR_MOBILE_PRICE_API_URL: '${{ vars.STACKR_BACKEND_URL }}',
  STACKR_MOBILE_API_URL: '${{ vars.STACKR_GATEWAY_URL }}',
  STACKR_MOBILE_SUPABASE_URL: '${{ vars.STACKR_SUPABASE_URL }}',
  STACKR_MOBILE_SUPABASE_PUBLISHABLE_KEY: '${{ secrets.STACKR_SUPABASE_PUBLISHABLE_KEY }}',
  EXPO_PUBLIC_BETA_TRADE_DEMO_MODE: "'true'",
  EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: "'false'",
  EXPO_PUBLIC_STACKR_SCAN_LAB_ENABLED: "'false'",
  EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED: "'false'",
  EXPO_PUBLIC_SCAN_QUALITY_DIAGNOSTICS: "'false'",
  EXPO_PUBLIC_SCAN_XIMILAR_FALLBACK: "'false'",
  EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK: "'false'",
})) {
  assert.ok(
    stagingWorkflow.includes(`${variable}: ${expectedValue}`),
    `staging must pin ${variable} to its reviewed safe runtime value`,
  );
}
assert.match(
  stagingWorkflow,
  /Verify the exact staging migration ledger[\s\S]+id: gate0_ledger_preflight[\s\S]+--phase=pre-apply[\s\S]+applyRequired[\s\S]+apply_required=\$apply_required[\s\S]+STACKR_GATE0_APPLY_REQUIRED=\$apply_required/,
  'Gate 0 preflight must capture whether the exact migration is pending or already applied',
);
assert.doesNotMatch(
  stagingWorkflow,
  /--require-pending/,
  'Gate 0 staging deploys must be safely resumable after the migration is already applied',
);
assert.match(stagingWorkflow, /Materialize the isolated staging migration ledger[\s\S]+stackr-staging-ledger/);
assert.match(stagingWorkflow, /cd "\$RUNNER_TEMP\/stackr-staging-ledger"[\s\S]+db push/);
assert.match(stagingWorkflow, /unexpected_staging_pending_migrations/);
assert.match(
  stagingWorkflow,
  /const expected = process\.env\.STACKR_GATE0_APPLY_REQUIRED === 'true'[\s\S]+\? \['20260827124944_gate0_financial_route_containment\.sql'\][\s\S]+: \[\]/,
  'Gate 0 dry-run must expect the migration only while the ledger says it is pending',
);
const gate0DryRunPosition = stagingWorkflow.indexOf('Dry-run backward-compatible migrations');
const gate0RehearsalPosition = stagingWorkflow.indexOf('Rehearse Gate 0 migration in a rollback-only transaction');
const gate0ApplyPosition = stagingWorkflow.indexOf('Apply backward-compatible migrations');
const gate0ImmediateProofPosition = stagingWorkflow.indexOf(
  'Prove Gate 0 database containment immediately after migration',
);
const stagingRailwayTargetPosition = stagingWorkflow.indexOf('Attest staging Railway deployment target');
const stagingBackendDeployPosition = stagingWorkflow.indexOf('Deploy catalogue API behind the staging gateway');
const stagingBackendRuntimePosition = stagingWorkflow.indexOf('Attest deployed staging backend runtime');
assert.ok(
  gate0DryRunPosition >= 0
    && gate0DryRunPosition < gate0RehearsalPosition
    && gate0RehearsalPosition < gate0ApplyPosition
    && gate0ApplyPosition < gate0ImmediateProofPosition
    && gate0ImmediateProofPosition < stagingRailwayTargetPosition
    && stagingRailwayTargetPosition < stagingBackendDeployPosition
    && stagingBackendDeployPosition < stagingBackendRuntimePosition,
  'Gate 0 must prove the DB and Railway target before deployment, then attest the deployed runtime',
);
assert.match(
  stagingWorkflow,
  /Rehearse Gate 0 migration in a rollback-only transaction[\s\S]+steps\.gate0_ledger_preflight\.outputs\.apply_required == 'true'[\s\S]+rehearse-gate0-financial-route-containment\.mjs/,
  'the rollback-only rehearsal must run only for the exact pending Gate 0 migration',
);
const gate0ApplySection = stagingWorkflow.slice(gate0ApplyPosition, gate0ImmediateProofPosition);
assert.match(
  gate0ApplySection,
  /if: inputs\.apply_migrations && \(inputs\.release_scope != 'gate0_hardening' \|\| steps\.gate0_ledger_preflight\.outputs\.apply_required == 'true'\)/,
  'a resumed Gate 0 deploy must skip the already-applied migration without skipping later proofs',
);
assert.match(
  gate0ApplySection,
  /db push[\s\S]+--include-all \\[\s\S]+--yes/,
  'the reviewed live Supabase push must answer prompts explicitly',
);
assert.match(
  stagingWorkflow,
  /Prove Gate 0 database containment immediately after migration[\s\S]+--phase=post-apply[\s\S]+verify-gate0-financial-route-containment\.mjs[\s\S]+--phase=post-apply/,
);
assert.equal(
  [...stagingWorkflow.matchAll(/verify-gate0-financial-route-containment\.mjs\s*\\?\s*\n\s*--phase=post-apply/g)].length,
  2,
  'Gate 0 database containment must be proved immediately after apply and again after public smoke tests',
);
assert.match(
  stagingWorkflow,
  /Attest staging Railway deployment target[\s\S]*@railway\/cli@5\.30\.1 list --json[\s\S]*@railway\/cli@5\.30\.1 service list[\s\S]*--project "\$RAILWAY_PROJECT_ID"[\s\S]*--environment "\$RAILWAY_ENVIRONMENT_ID"[\s\S]*--json/,
  'the Railway target must be read and attested with the pinned CLI before upload',
);
for (const contract of [
  /project\?\.id === expected\.projectId/,
  /edge\?\.node\?\.id === expected\.environmentId/,
  /environmentName: 'staging'/,
  /service\?\.id === expected\.serviceId/,
  /serviceName: 'stackr-backend-staging'/,
  /summaryMatches\[0\]\?\.url !== expected\.serviceUrl/,
  /edge\?\.node\?\.environmentId === expected\.environmentId/,
]) {
  assert.match(stagingWorkflow, contract, `missing fail-closed Railway target contract: ${contract}`);
}
assert.match(
  stagingWorkflow,
  /Attest deployed staging backend runtime[\s\S]*gitCommit: process\.env\.GITHUB_SHA\.slice\(0, 12\)[\s\S]*railwayEnvironment: 'staging'[\s\S]*supabaseProjectRef: 'lmwfhvexfcoyeuoyrlco'[\s\S]*new URL\('\/health', process\.env\.STACKR_BACKEND_URL\)/,
  'the deployed backend health response must prove the exact source, environment, and staging database',
);
assert.ok(
  stagingBackendRuntimePosition < stagingWorkflow.indexOf('Deploy recognition container behind the staging gateway'),
  'backend runtime identity must be proved before continuing with later provider deploys',
);
assert.match(stagingWorkflow, /gate0_hardening[\s\S]+never publishes a mobile update/);
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
assert.doesNotMatch(baselineMigrationTrialWorkflow, /APPROVE DESTRUCTIVE STAGING REBUILD/);
assert.doesNotMatch(baselineMigrationTrialWorkflow, /rebuild-staging:|mutation-started/);
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
assert.match(stagingRebuildBreakGlassWorkflow, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
assert.match(stagingRebuildBreakGlassWorkflow, /test "\$EXPECTED_COMMIT_SHA" = "\$GITHUB_SHA"/);
assert.match(stagingRebuildBreakGlassWorkflow, /inputs\.approve_data_replacement/);
assert.match(stagingRebuildBreakGlassWorkflow, /inputs\.incident_reference/);
assert.match(stagingRebuildBreakGlassWorkflow, /current_main_sha=.*commits\/main/);
assert.match(stagingRebuildBreakGlassWorkflow, /rebuild-staging:\s+needs: authorize/);
assert.match(
  stagingRebuildBreakGlassWorkflow,
  /rebuild-staging:[\s\S]*?github\.ref == 'refs\/heads\/main' &&[\s\S]*?inputs\.expected_commit_sha == github\.sha &&[\s\S]*?inputs\.approve_data_replacement/,
);
assert.match(stagingRebuildBreakGlassWorkflow, /Create ephemeral rollback backup/);
assert.match(stagingRebuildBreakGlassWorkflow, /Restore rollback backup after a failed rebuild/);
assert.doesNotMatch(stagingRebuildBreakGlassWorkflow, /environment: production|SUPABASE_PRODUCTION_DB_URL|--linked/);
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
assert.match(catalogueTransferScript, /CATALOGUE_RELEASE_LABELS[\s\S]+split\(','\)/);
assert.match(catalogueTransferScript, /where version_label = any\(\$1::text\[\]\)/);
assert.match(catalogueTransferScript, /versionLabels: CATALOGUE_RELEASE_LABELS/);
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
assert.match(catalogueTransferScript, /planCatalogueAssetIdentityMerge/);
assert.match(catalogueTransferScript, /foreignKeyColumnsReferencingSources/);
assert.match(catalogueTransferScript, /foreignKeyColumnsReferencingTable/);
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
assert.doesNotMatch(catalogueTransferScript, /non_idempotent_production_transfer_requires_indexed_foreign_keys/);
assert.match(catalogueTransferScript, /if \(!targetAlreadyMatched && TRANSFER_MODE !== 'promote'\) \{[\s\S]+delete from \$\{qualifiedName\(tableName\)\}/);
assert.match(catalogueTransferScript, /sourceIdentityMerge \|\| TRANSFER_MODE === 'promote'/);
assert.match(catalogueTransferScript, /productionTargetOnlyRowCountPreserved/);
assert.match(catalogueTransferScript, /upsert_allowlisted_production_catalogue_rows_preserve_target_only_rows/);
assert.match(catalogueTransferScript, /productionMutationPerformed: TRANSFER_MODE === 'promote' && !targetAlreadyMatched/);
assert.match(catalogueTransferScript, /targetAlreadyMatched: evidence\.targetAlreadyMatched/);
assert.match(catalogueTransferScript, /productionMutationPerformed: evidence\.productionMutationPerformed/);
assert.match(catalogueTransferScript, /transferPolicy: evidence\.transferPolicy/);
assert.match(catalogueTransferScript, /postCommitObservationMatched/);
assert.ok(
  catalogueTransferScript.indexOf("TRANSFER_MODE !== 'promote'")
    < catalogueTransferScript.indexOf('delete from ${qualifiedName(tableName)}'),
  'production promotion must never enter the destructive replacement path',
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
    schemaVersion: 'stackr-production-catalogue-data-promotion-evidence-v1.7.0',
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
    preservedTargetOnlyRowCount: 1,
    catalogueRelease: {
      sourceVersionIds: ['internal-release-uuid'],
      releaseVersionSha256: 'internal-release-digest',
      productionAssetUrlRewriteCount: 1,
      productionAssetTimestampReuseCount: 0,
    },
    assetIdentityPreservation: {
      table: 'catalog.assets',
      naturalKey: 'asset_id',
      sourceCount: 2,
      canonicalSourceCount: 2,
      sourceStorageAliasCount: 0,
      sourceStableAssetIdCount: 2,
      preservedProductionAssetIdCount: 2,
      remappedAssetIdCount: 1,
      storageObjectMatchedAssetCount: 0,
      preservedProductionStableAssetIdCount: 0,
      insertedAssetCount: 0,
      preservedTargetOnlyAssetCount: 1,
      remappedForeignKeyRowCount: 1,
      projectedStorageAliasForeignKeyRowCount: 0,
      projectedStorageAliasForeignKeyValueCount: 0,
    },
    tables: [{
      table: 'internal.schema_table',
      sourceSha256: 'internal-row-digest',
      targetPreCommitVerified: true,
      transferSkippedAsAlreadyCurrent: true,
      commitMatched: true,
      postCommitObservationMatched: true,
      sourceRowCount: 2,
      productionTargetOnlyRowCountPreserved: 1,
      targetRowCountDuringRehearsal: 3,
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
  assert.equal(publicAudit.verification.databaseMutationPerformed, false);
  assert.equal(publicAudit.verification.exactPostCommitVerificationPassed, true);
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
  assert.match(postCommitMismatchAudit.stderr, /successful_database_promotion_not_verified/);

  const storageMutationEvidencePath = path.join(
    promotionAuditDirectory,
    'storage-mutation-evidence.json',
  );
  writeFileSync(storageMutationEvidencePath, JSON.stringify({
    schemaVersion: 'stackr-production-catalogue-storage-promotion-v1.0.0',
    sourceObjectCount: 12,
    targetObjectCountBefore: 10,
    copiedObjectCount: 2,
    copiedByteSize: 4096,
    copiedContentHashVerifiedCount: 2,
    targetObjectCountAfter: 12,
    verifiedSourceObjectCount: 12,
    existingProductionObjectsRetained: true,
    providerRequestsPerformed: false,
    ok: true,
  }));
  const databaseMutationEvidencePath = path.join(
    promotionAuditDirectory,
    'database-mutation-evidence.json',
  );
  writeFileSync(databaseMutationEvidencePath, JSON.stringify({
    schemaVersion: 'stackr-production-catalogue-data-promotion-evidence-v1.7.0',
    targetAlreadyMatched: false,
    productionMutationPerformed: true,
    targetTransactionCommitted: true,
    targetCommitVerified: true,
    transferPolicy: 'upsert_allowlisted_production_catalogue_rows_preserve_target_only_rows_source_and_asset_storage_identity_project_exact_storage_aliases_and_private_provenance_references',
    selectedTableCount: 1,
    sourceRowCount: 12,
    matchedSourceRowCount: 12,
    preservedTargetOnlyRowCount: 3,
    catalogueRelease: {
      productionAssetUrlRewriteCount: 3,
      productionAssetTimestampReuseCount: 1,
    },
    assetIdentityPreservation: {
      table: 'catalog.assets',
      naturalKey: 'asset_id',
      sourceCount: 12,
      canonicalSourceCount: 10,
      sourceStorageAliasCount: 2,
      sourceStableAssetIdCount: 10,
      preservedProductionAssetIdCount: 7,
      remappedAssetIdCount: 3,
      storageObjectMatchedAssetCount: 2,
      preservedProductionStableAssetIdCount: 1,
      insertedAssetCount: 3,
      preservedTargetOnlyAssetCount: 3,
      remappedForeignKeyRowCount: 4,
      projectedStorageAliasForeignKeyRowCount: 2,
      projectedStorageAliasForeignKeyValueCount: 2,
    },
    tables: [{
      targetPreCommitVerified: true,
      transferSkippedAsAlreadyCurrent: false,
      commitMatched: true,
      postCommitObservationMatched: true,
      sourceRowCount: 12,
      productionTargetOnlyRowCountPreserved: 3,
      targetRowCountDuringRehearsal: 15,
    }],
  }));
  const mutationAuditOutputPath = path.join(promotionAuditDirectory, 'mutation-audit.json');
  const mutationAuditResult = run(
    './scripts/deploy/create-production-catalogue-promotion-audit.mjs',
    [
      `--storage=${storageMutationEvidencePath}`,
      `--database=${databaseMutationEvidencePath}`,
      `--output=${mutationAuditOutputPath}`,
      '--promotion-outcome=success',
    ],
  );
  assert.equal(mutationAuditResult.status, 0, mutationAuditResult.stderr);
  const mutationAudit = JSON.parse(readFileSync(mutationAuditOutputPath, 'utf8'));
  assert.equal(mutationAudit.storage.copiedObjectCount, 2);
  assert.equal(mutationAudit.database.productionMutationPerformed, true);
  assert.equal(mutationAudit.verification.storageMutationPerformed, true);
  assert.equal(mutationAudit.verification.databaseMutationPerformed, true);
  assert.equal(mutationAudit.verification.exactPostCommitVerificationPassed, true);

  const impossibleTimestampReuseEvidencePath = path.join(
    promotionAuditDirectory,
    'impossible-timestamp-reuse-evidence.json',
  );
  writeFileSync(impossibleTimestampReuseEvidencePath, JSON.stringify({
    ...JSON.parse(readFileSync(databaseMutationEvidencePath, 'utf8')),
    catalogueRelease: {
      productionAssetUrlRewriteCount: 3,
      productionAssetTimestampReuseCount: 4,
    },
  }));
  const impossibleTimestampReuseAudit = run(
    './scripts/deploy/create-production-catalogue-promotion-audit.mjs',
    [
      `--storage=${storageMutationEvidencePath}`,
      `--database=${impossibleTimestampReuseEvidencePath}`,
      `--output=${path.join(
        promotionAuditDirectory,
        'impossible-timestamp-reuse-audit.json',
      )}`,
      '--promotion-outcome=success',
    ],
  );
  assert.notEqual(impossibleTimestampReuseAudit.status, 0);
  assert.match(
    impossibleTimestampReuseAudit.stderr,
    /successful_database_promotion_not_verified/,
  );

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
    schemaVersion: 'stackr-production-catalogue-data-promotion-evidence-v1.7.0',
    targetAlreadyMatched: false,
    productionMutationPerformed: true,
    targetTransactionCommitted: false,
    targetCommitVerified: false,
    transferPolicy: 'verify_allowlisted_production_catalogue_already_matches_without_mutation',
    selectedTableCount: 1,
    sourceRowCount: 2,
    matchedSourceRowCount: 2,
    preservedTargetOnlyRowCount: 0,
    catalogueRelease: {
      productionAssetUrlRewriteCount: 1,
      productionAssetTimestampReuseCount: 1,
    },
    assetIdentityPreservation: {
      table: 'catalog.assets',
      naturalKey: 'asset_id',
      sourceCount: 2,
      canonicalSourceCount: 2,
      sourceStorageAliasCount: 0,
      sourceStableAssetIdCount: 2,
      preservedProductionAssetIdCount: 2,
      remappedAssetIdCount: 0,
      storageObjectMatchedAssetCount: 0,
      preservedProductionStableAssetIdCount: 0,
      insertedAssetCount: 0,
      preservedTargetOnlyAssetCount: 0,
      remappedForeignKeyRowCount: 0,
      projectedStorageAliasForeignKeyRowCount: 0,
      projectedStorageAliasForeignKeyValueCount: 0,
    },
    tables: [{
      targetPreCommitVerified: false,
      transferSkippedAsAlreadyCurrent: false,
      commitMatched: false,
      postCommitObservationMatched: false,
      sourceRowCount: 2,
      productionTargetOnlyRowCountPreserved: 0,
      targetRowCountDuringRehearsal: 2,
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
  assert.match(contradictorySuccessAudit.stderr, /successful_database_promotion_not_verified/);

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
  assert.match(badStorageSuccessAudit.stderr, /successful_storage_promotion_not_verified/);
} finally {
  rmSync(promotionAuditDirectory, { recursive: true, force: true });
}

const {
  catalogueTargetOnlyRows,
  catalogueTransferTargetMatch,
  expectedCatalogueOwnedSequenceStates,
  planCatalogueAssetIdentityMerge,
  planCatalogueSourceIdentityMerge,
  projectCatalogueAssetAliasReferences,
  remapCatalogueIdentityForeignKeys,
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

const assetIdentityPlan = planCatalogueAssetIdentityMerge(
  [
    { id: 'staging-asset-shared', asset_id: 'card-image:shared', value: 'canonical' },
    { id: 'staging-asset-new', asset_id: 'card-image:new', value: 'new' },
    { id: 'stable-null-asset', asset_id: null, value: 'canonical-null' },
  ],
  [
    { id: 'production-asset-shared', asset_id: 'card-image:shared', value: 'old' },
    { id: 'production-asset-only', asset_id: 'card-image:legacy', value: 'legacy' },
    { id: 'stable-null-asset', asset_id: null, value: 'old-null' },
  ],
);
assert.equal(
  assetIdentityPlan.sourceIdMap.get('staging-asset-shared'),
  'production-asset-shared',
);
assert.equal(assetIdentityPlan.sourceIdMap.get('staging-asset-new'), 'staging-asset-new');
assert.equal(assetIdentityPlan.sourceIdMap.get('stable-null-asset'), 'stable-null-asset');
assert.deepEqual(
  assetIdentityPlan.mappedSourceRows.map(({ id, asset_id: assetId }) => ({ id, assetId })),
  [
    { id: 'production-asset-shared', assetId: 'card-image:shared' },
    { id: 'staging-asset-new', assetId: 'card-image:new' },
    { id: 'stable-null-asset', assetId: null },
  ],
);
assert.deepEqual(
  assetIdentityPlan.preservedTargetOnlyRows.map(({ id }) => id),
  ['production-asset-only'],
);
assert.equal(assetIdentityPlan.preservedProductionAssetIdCount, 2);
assert.equal(assetIdentityPlan.canonicalSourceCount, 3);
assert.equal(assetIdentityPlan.sourceStorageAliasCount, 0);
assert.equal(assetIdentityPlan.storageObjectMatchedAssetCount, 0);
assert.equal(assetIdentityPlan.preservedProductionStableAssetIdCount, 0);
assert.equal(assetIdentityPlan.remappedAssetIdCount, 1);
assert.equal(assetIdentityPlan.insertedAssetCount, 1);
const remappedAssetForeignKeys = remapCatalogueIdentityForeignKeys(
  [
    { id: 'version-asset-1', asset_id: 'staging-asset-shared' },
    { id: 'version-asset-2', asset_id: 'staging-asset-new' },
  ],
  ['asset_id'],
  assetIdentityPlan.sourceIdMap,
  'catalog.catalogue_version_assets',
  'asset',
);
assert.deepEqual(
  remappedAssetForeignKeys.rows.map(({ asset_id: assetId }) => assetId),
  ['production-asset-shared', 'staging-asset-new'],
);
assert.equal(remappedAssetForeignKeys.remappedRowCount, 1);
const rerunAssetIdentityPlan = planCatalogueAssetIdentityMerge(
  [
    { id: 'staging-asset-shared', asset_id: 'card-image:shared', value: 'canonical' },
    { id: 'staging-asset-new', asset_id: 'card-image:new', value: 'new' },
    { id: 'stable-null-asset', asset_id: null, value: 'canonical-null' },
  ],
  [...assetIdentityPlan.mappedSourceRows, ...assetIdentityPlan.preservedTargetOnlyRows],
);
assert.deepEqual(
  [...rerunAssetIdentityPlan.sourceIdMap.entries()],
  [...assetIdentityPlan.sourceIdMap.entries()],
  'rerunning production asset promotion must preserve the same stable asset UUID mapping',
);
assert.equal(rerunAssetIdentityPlan.insertedAssetCount, 0);
assert.throws(
  () => planCatalogueAssetIdentityMerge(
    [{ id: 'asset-collision', asset_id: 'card-image:new' }],
    [{ id: 'asset-collision', asset_id: 'card-image:legacy' }],
  ),
  /catalogue_asset_identity_id_collision/,
);
assert.throws(
  () => planCatalogueAssetIdentityMerge(
    [
      { id: 'asset-a', asset_id: 'card-image:duplicate' },
      { id: 'asset-b', asset_id: 'card-image:duplicate' },
    ],
    [],
  ),
  /catalogue_asset_identity_duplicate:source:asset_id/,
);

const storageIdentityPlan = planCatalogueAssetIdentityMerge(
  [
    {
      id: 'source-storage-canonical',
      asset_id: 'card-image:storage-canonical',
      storage_provider: 'supabase_storage',
      storage_bucket: 'stackr-catalogue-public',
      storage_key: 'public/card_image/aa/canonical.jpg',
      deleted_at: null,
    },
    {
      id: 'source-storage-alias',
      asset_id: null,
      storage_provider: 'supabase_storage',
      storage_bucket: 'stackr-catalogue-public',
      storage_key: 'public/card_image/aa/canonical.jpg',
      deleted_at: null,
    },
    {
      id: 'source-legacy-null',
      asset_id: null,
      storage_provider: 'supabase_storage',
      storage_bucket: 'stackr-catalogue-public',
      storage_key: 'public/card_image/bb/legacy.jpg',
      deleted_at: null,
    },
    { id: 'source-new-storage', asset_id: 'card-image:new-storage' },
  ],
  [
    {
      id: 'production-storage-canonical',
      asset_id: 'card-image:storage-canonical',
      storage_provider: 'supabase_storage',
      storage_bucket: 'stackr-catalogue-public',
      storage_key: 'public/card_image/aa/canonical.jpg',
      deleted_at: null,
    },
    {
      id: 'production-legacy-storage',
      asset_id: 'card-image:production-legacy',
      storage_provider: 'supabase_storage',
      storage_bucket: 'stackr-catalogue-public',
      storage_key: 'public/card_image/bb/legacy.jpg',
      deleted_at: null,
    },
  ],
);
assert.equal(storageIdentityPlan.sourceCount, 4);
assert.equal(storageIdentityPlan.canonicalSourceCount, 3);
assert.equal(storageIdentityPlan.sourceStorageAliasCount, 1);
assert.equal(storageIdentityPlan.preservedProductionAssetIdCount, 2);
assert.equal(storageIdentityPlan.storageObjectMatchedAssetCount, 1);
assert.equal(storageIdentityPlan.preservedProductionStableAssetIdCount, 1);
assert.equal(storageIdentityPlan.insertedAssetCount, 1);
assert.equal(
  storageIdentityPlan.sourceIdMap.get('source-storage-alias'),
  'production-storage-canonical',
);
assert.equal(
  storageIdentityPlan.sourceIdMap.get('source-legacy-null'),
  'production-legacy-storage',
);
assert.deepEqual(
  storageIdentityPlan.mappedSourceRows.map(({ id, asset_id: assetId }) => ({ id, assetId })),
  [
    { id: 'production-storage-canonical', assetId: 'card-image:storage-canonical' },
    { id: 'production-legacy-storage', assetId: 'card-image:production-legacy' },
    { id: 'source-new-storage', assetId: 'card-image:new-storage' },
  ],
);
const storageAliasProjection = projectCatalogueAssetAliasReferences(
  [
    { catalogue_version_id: 'v1', asset_id: 'source-storage-canonical' },
    { catalogue_version_id: 'v1', asset_id: 'source-storage-alias' },
    { catalogue_version_id: 'v1', asset_id: 'source-new-storage' },
  ],
  ['asset_id'],
  storageIdentityPlan.sourceAliasIds,
  'catalog.catalogue_version_assets',
);
assert.deepEqual(
  storageAliasProjection.rows.map(({ asset_id: assetId }) => assetId),
  ['source-storage-canonical', 'source-new-storage'],
);
assert.equal(storageAliasProjection.projectedRowCount, 1);
assert.equal(storageAliasProjection.projectedValueCount, 1);

const reassignedStorageIdentityPlan = planCatalogueAssetIdentityMerge(
  [
    {
      id: 'source-corrected-active',
      asset_id: null,
      variant_id: 'variant-corrected',
      asset_type: 'card_image',
      sha256: 'c'.repeat(64),
      content_sha256: 'c'.repeat(64),
      storage_provider: 'supabase_storage',
      storage_bucket: 'stackr-catalogue-public',
      storage_key: 'public/card_image/cc/corrected.jpg',
      deleted_at: null,
      deprecated_at: null,
      retention_status: 'active',
    },
    {
      id: 'production-stable-id',
      asset_id: 'card-image:stable',
      variant_id: 'variant-deprecated',
      asset_type: 'card_image',
      sha256: 'c'.repeat(64),
      content_sha256: 'c'.repeat(64),
      storage_provider: 'unavailable',
      storage_bucket: null,
      storage_key: null,
      archival_storage_key: 'public/card_image/cc/corrected.jpg',
      deleted_at: null,
      deprecated_at: '2026-08-19T22:40:41.443Z',
      retention_status: 'unavailable',
    },
  ],
  [
    {
      id: 'production-stable-id',
      asset_id: 'card-image:stable',
      variant_id: 'variant-deprecated',
      asset_type: 'card_image',
      sha256: 'c'.repeat(64),
      content_sha256: 'c'.repeat(64),
      storage_provider: 'supabase_storage',
      storage_bucket: 'stackr-catalogue-public',
      storage_key: 'public/card_image/cc/corrected.jpg',
      deleted_at: null,
      deprecated_at: null,
      retention_status: 'active',
    },
  ],
);
assert.deepEqual(
  reassignedStorageIdentityPlan.mappedSourceRows.map((row) => ({
    id: row.id,
    assetId: row.asset_id,
    variantId: row.variant_id,
    retentionStatus: row.retention_status,
  })),
  [
    {
      id: 'production-stable-id',
      assetId: 'card-image:stable',
      variantId: 'variant-deprecated',
      retentionStatus: 'unavailable',
    },
    {
      id: 'source-corrected-active',
      assetId: null,
      variantId: 'variant-corrected',
      retentionStatus: 'active',
    },
  ],
  'stable production identity must be vacated before the corrected variant claims its storage',
);
assert.equal(reassignedStorageIdentityPlan.preservedProductionAssetIdCount, 1);
assert.equal(reassignedStorageIdentityPlan.storageObjectMatchedAssetCount, 0);
assert.equal(reassignedStorageIdentityPlan.insertedAssetCount, 1);
assert.equal(
  new Set(reassignedStorageIdentityPlan.mappedSourceRows.map(({ id }) => id)).size,
  reassignedStorageIdentityPlan.mappedSourceRows.length,
);
assert.throws(
  () => planCatalogueAssetIdentityMerge(
    [
      {
        id: 'source-storage-conflict',
        asset_id: 'card-image:source-conflict',
        storage_provider: 'supabase_storage',
        storage_bucket: 'stackr-catalogue-public',
        storage_key: 'public/card_image/cc/conflict.jpg',
        deleted_at: null,
      },
    ],
    [
      {
        id: 'target-storage-conflict',
        asset_id: 'card-image:target-conflict',
        storage_provider: 'supabase_storage',
        storage_bucket: 'stackr-catalogue-public',
        storage_key: 'public/card_image/cc/conflict.jpg',
        deleted_at: null,
      },
    ],
  ),
  /catalogue_asset_storage_stable_identity_conflict/,
);
assert.throws(
  () => planCatalogueAssetIdentityMerge(
    [
      {
        id: 'source-ambiguous-a',
        asset_id: null,
        storage_provider: 'supabase_storage',
        storage_bucket: 'stackr-catalogue-public',
        storage_key: 'public/card_image/dd/ambiguous.jpg',
        deleted_at: null,
      },
      {
        id: 'source-ambiguous-b',
        asset_id: null,
        storage_provider: 'supabase_storage',
        storage_bucket: 'stackr-catalogue-public',
        storage_key: 'public/card_image/dd/ambiguous.jpg',
        deleted_at: null,
      },
    ],
    [],
  ),
  /catalogue_asset_storage_identity_ambiguous_source/,
);
assert.throws(
  () => planCatalogueAssetIdentityMerge(
    [
      {
        id: 'source-card-canonical',
        asset_id: 'card-image:canonical-card',
        variant_id: 'variant-a',
        storage_provider: 'supabase_storage',
        storage_bucket: 'stackr-catalogue-public',
        storage_key: 'public/card_image/ee/shared.jpg',
        deleted_at: null,
      },
      {
        id: 'source-card-alias',
        asset_id: null,
        variant_id: 'variant-b',
        storage_provider: 'supabase_storage',
        storage_bucket: 'stackr-catalogue-public',
        storage_key: 'public/card_image/ee/shared.jpg',
        deleted_at: null,
      },
    ],
    [],
  ),
  /catalogue_asset_storage_identity_card_identity_conflict/,
);
assert.throws(
  () => planCatalogueAssetIdentityMerge(
    [
      {
        id: 'source-metadata-canonical',
        asset_id: 'set-logo:canonical',
        sha256: 'a'.repeat(64),
        storage_provider: 'supabase_storage',
        storage_bucket: 'stackr-catalogue-public',
        storage_key: 'public/set_logo/ff/shared.jpg',
        deleted_at: null,
      },
      {
        id: 'source-metadata-alias',
        asset_id: null,
        sha256: 'b'.repeat(64),
        storage_provider: 'supabase_storage',
        storage_bucket: 'stackr-catalogue-public',
        storage_key: 'public/set_logo/ff/shared.jpg',
        deleted_at: null,
      },
    ],
    [],
  ),
  /catalogue_asset_storage_identity_metadata_conflict/,
);

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
  catalogueTargetOnlyRows(
    exactTargetMatchInput.sourceRows,
    exactTargetMatchInput.targetRows,
    exactTargetMatchInput.primaryKey,
  ),
  exactTargetMatchInput.preservedTargetRows,
  'production-preserving promotion must retain only rows whose primary keys are absent from staging',
);
assert.throws(
  () => catalogueTargetOnlyRows(
    [{ id: 'duplicate' }, { id: 'duplicate' }],
    [],
    ['id'],
  ),
  /catalogue_source_primary_key_overlap/,
);
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
assert.deepEqual(
  catalogueTransferTargetMatch({
    tableName: 'catalog.example',
    sourceRows: [{ id: 1 }, { id: 2 }],
    preservedTargetRows: [{ id: 3 }],
    targetRows: [{ id: 1 }, { id: 2 }, { id: 3 }],
    primaryKey: ['id'],
    targetSequenceStates: [{ ...sequenceStates[0], lastValue: '4' }],
  }),
  { matches: true, reason: null },
  'sequence safety must include retained production-only rows',
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
assert.match(productionWorkflow, /STACKR_CATALOGUE_RIGHTS_RELEASE_APPROVED/);
assert.match(productionWorkflow, /verify-staging-migration-reconciliation\.mjs --require-aligned/);
assert.match(productionWorkflow, /verify-staging-readiness-evidence\.mjs --require-release-ready/);
assert.match(productionWorkflow, /update:revert-update-rollout/);
assert.match(productionWorkflow, /release_scope:[\s\S]+options: \[backend_only, catalogue_assets, catalogue_api, full_platform\]/);
assert.match(productionWorkflow, /--require-catalogue-api-ready/);
assert.match(
  productionWorkflow,
  /Catalogue-assets-only promotion forbids gateway, migration, mobile, and gateway-promotion changes\./,
);
assert.match(
  productionWorkflow,
  /Catalogue-assets-only promotion forbids catalogue or recognition index activation IDs\./,
);
assert.match(
  productionWorkflow,
  /name: Dry-run backward-compatible migrations\s+if: inputs\.release_scope != 'catalogue_assets'/,
);
assert.match(
  productionWorkflow,
  /name: Apply backward-compatible migrations\s+if: inputs\.release_scope != 'catalogue_assets' && inputs\.apply_migrations/,
);
for (const stepName of [
  'Prepare gateway runtime configuration',
  'Synchronize backend gateway origin authentication',
  'Deploy rolling catalogue API version',
  'Verify service readiness before activation',
  'Observe and smoke-test canary',
  'Enforce public API latency thresholds',
]) {
  assert.match(
    productionWorkflow,
    new RegExp(`name: ${stepName}\\s+if: inputs\\.release_scope != 'catalogue_assets'`),
    `${stepName} must be skipped during catalogue-assets-only promotion`,
  );
}
assert.match(
  productionWorkflow,
  /name: Promote verified catalogue snapshot into production[\s\S]+if: inputs\.release_scope == 'catalogue_api' \|\| inputs\.release_scope == 'catalogue_assets'/,
);
assert.match(
  productionWorkflow,
  /name: Upload gateway version\s+if: \$\{\{ inputs\.release_scope != 'catalogue_assets' && !inputs\.gateway_bootstrap \}\}/,
);
assert.match(
  productionWorkflow,
  /name: Create first production gateway deployment\s+if: inputs\.release_scope != 'catalogue_assets' && inputs\.gateway_bootstrap/,
);
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
  const publishEnvironmentPath = path.join(easTemp, 'publish-github.env');
  const groupId = '11111111-2222-4333-8444-555555555555';
  const updateGitSha = 'a'.repeat(40);
  const updateMessage = `Stackr staging ${updateGitSha}`;
  writeFileSync(payloadPath, JSON.stringify([
    {
      id: '11111111-1111-4111-8111-111111111111',
      group: groupId,
      branch: 'staging',
      message: updateMessage,
      runtimeVersion: '1.0.3-staging',
      platform: 'android',
      manifestPermalink: 'https://u.expo.dev/updates/android',
      isRollBackToEmbedded: false,
      gitCommitHash: updateGitSha,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      group: groupId,
      branch: 'staging',
      message: updateMessage,
      runtimeVersion: '1.0.3-staging',
      platform: 'ios',
      manifestPermalink: 'https://u.expo.dev/updates/ios',
      isRollBackToEmbedded: false,
      gitCommitHash: updateGitSha,
    },
  ]));
  const publishEvidence = run('scripts/deploy/capture-eas-update-group.mjs', [
    `--file=${payloadPath}`,
    `--github-env=${publishEnvironmentPath}`,
    '--mode=publish-evidence',
  ]);
  assert.equal(publishEvidence.status, 0, publishEvidence.stderr || publishEvidence.stdout);
  assert.equal(
    readFileSync(publishEnvironmentPath, 'utf8'),
    `STACKR_MOBILE_UPDATE_PUBLISHED=true\nSTACKR_EAS_UPDATE_GROUP_ID=${groupId}\n`,
  );
  const captured = run('scripts/deploy/capture-eas-update-group.mjs', [
    `--file=${payloadPath}`,
    `--github-env=${environmentPath}`,
    '--expected-runtime=1.0.3-staging',
    `--expected-git-sha=${updateGitSha}`,
    `--expected-message=${updateMessage}`,
    '--expected-platforms=android,ios',
  ]);
  assert.equal(captured.status, 0, captured.stderr || captured.stdout);
  assert.equal(readFileSync(environmentPath, 'utf8'), `STACKR_EAS_UPDATE_GROUP_ID=${groupId}\n`);
} finally {
  rmSync(easTemp, { recursive: true, force: true });
}

console.log('Stage 13 deployment tooling tests passed.');
