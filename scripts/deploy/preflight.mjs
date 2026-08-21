import { existsSync, readFileSync, readdirSync } from 'node:fs';

const fullPlatformReleaseMode = process.argv.includes('--release');
const catalogueApiReleaseMode = process.argv.includes('--catalogue-api-release');
const catalogueAssetsReleaseMode = process.argv.includes('--catalogue-assets-release');
const catalogueReleaseMode = catalogueApiReleaseMode || catalogueAssetsReleaseMode;
const releaseMode = fullPlatformReleaseMode || catalogueReleaseMode;
const requiredPaths = [
  '.github/workflows/platform-ci.yml',
  '.github/workflows/gateway-ci.yml',
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/deploy-production.yml',
  '.github/workflows/staging-recovery-drill.yml',
  '.github/workflows/rollback.yml',
  'backend/railway.json',
  'gateway/wrangler.jsonc',
  'recognition-service/Dockerfile',
  'recognition-service/railway.json',
  'supabase/config.toml',
  'supabase/seed.sql',
  'deploy/README.md',
  'deploy/release-manifest.json',
  'deploy/evidence/staging-readiness-2026-07-30.json',
  'deploy/evidence/staging-migration-reconciliation-2026-07-30.json',
  'deploy/evidence/staging-recovery-2026-07-30.json',
  'deploy/staging-runbook.md',
  'deploy/production-runbook.md',
  'deploy/rollback-runbook.md',
  'deploy/disaster-recovery.md',
];
const errors = [];
const warnings = [];

for (const filePath of requiredPaths) {
  if (!existsSync(filePath)) errors.push(`missing:${filePath}`);
}

const manifest = JSON.parse(readFileSync('deploy/release-manifest.json', 'utf8'));
const latestStagingEvidenceName = readdirSync('deploy/evidence')
  .filter((name) => /^staging-readiness-\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .sort()
  .at(-1);
const stagingEvidence = JSON.parse(readFileSync(
  latestStagingEvidenceName
    ? `deploy/evidence/${latestStagingEvidenceName}`
    : 'deploy/evidence/staging-readiness-2026-07-30.json',
  'utf8',
));
const appConfig = JSON.parse(readFileSync('app.json', 'utf8'));
const supabaseConfig = readFileSync('supabase/config.toml', 'utf8');
const exposed = manifest.components.database.exposedSchemas;
for (const schema of manifest.components.database.privateSchemas) {
  if (exposed.includes(schema) || new RegExp(`schemas\\s*=\\s*\\[[^\\]]*"${schema}"`).test(supabaseConfig)) {
    errors.push(`private_schema_exposed:${schema}`);
  }
}

const migrations = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort();
if (new Set(migrations.map((name) => name.slice(0, 14))).size !== migrations.length) {
  errors.push('duplicate_migration_timestamp');
}
if (!migrations.includes('20260728203300_stackr_release_activation_controls.sql')) {
  errors.push('release_activation_migration_missing');
}

const productionProjectRef = manifest.components.database.projectRef;
const stagingProjectRef = manifest.components.database.stagingProjectRef;
for (const [label, projectRef] of [
  ['production', productionProjectRef],
  ['staging', stagingProjectRef],
]) {
  if (!/^[a-z]{20}$/.test(projectRef ?? '')) errors.push(`invalid_${label}_supabase_project_ref`);
}
if (productionProjectRef === stagingProjectRef) errors.push('staging_and_production_supabase_refs_match');
if (stagingEvidence.supabase?.productionProjectRef !== productionProjectRef) {
  errors.push('production_project_ref_evidence_mismatch');
}
if (stagingEvidence.supabase?.stagingProjectRef !== stagingProjectRef) {
  errors.push('staging_project_ref_evidence_mismatch');
}
if (manifest.releaseGates.migrationHistoryAligned === true
  && stagingEvidence.supabase?.migrationHistoryStatus !== 'aligned') {
  errors.push('migration_gate_lacks_aligned_evidence');
}
if (manifest.releaseGates.storageBackupVerified === true
  && stagingEvidence.storageRecovery?.status !== 'verified') {
  errors.push('storage_gate_lacks_verified_restore_evidence');
}

const easProjectId = manifest.components.mobile.easProjectId;
const appEasProjectId = appConfig.expo?.extra?.eas?.projectId;
const appUpdateUrl = appConfig.expo?.updates?.url;
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(easProjectId ?? '')) {
  errors.push('invalid_eas_project_id');
}
if (easProjectId !== appEasProjectId) errors.push('eas_project_id_mismatch');
if (appUpdateUrl !== `https://u.expo.dev/${easProjectId}`) errors.push('eas_update_url_mismatch');

const dockerfile = readFileSync('recognition-service/Dockerfile', 'utf8');
for (const token of ['USER 10001:10001', 'HEALTHCHECK', 'STOPSIGNAL SIGTERM', '--timeout-graceful-shutdown']) {
  if (!dockerfile.includes(token)) errors.push(`recognition_container_guard_missing:${token}`);
}

const releaseGateApprovals = {
  migrationHistoryAligned: 'STACKR_MIGRATION_BASELINE_APPROVED',
  activeModelSelected: 'STACKR_MODEL_INDEX_RELEASE_APPROVED',
  activeIndexValidated: 'STACKR_MODEL_INDEX_RELEASE_APPROVED',
  storageBackupVerified: 'STACKR_STORAGE_BACKUP_APPROVED',
};
const requiredCatalogueLanguages = ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'];
const releaseGateWarnings = {
  migrationHistoryAligned: 'migration_history_not_aligned',
  activeModelSelected: 'active_model_not_selected',
  activeIndexValidated: 'active_index_not_validated',
  storageBackupVerified: 'storage_backup_not_verified',
};
for (const [gate, warning] of Object.entries(releaseGateWarnings)) {
  if (manifest.releaseGates[gate] !== true) warnings.push(warning);
}

if (releaseMode) {
  const deploymentEnvironment = process.env.STACKR_DEPLOYMENT_ENVIRONMENT;
  if (!['staging', 'production'].includes(deploymentEnvironment)) {
    errors.push('invalid_release_environment');
  }
  if (catalogueApiReleaseMode && process.env.STACKR_DEPLOYMENT_SCOPE !== 'catalogue_api') {
    errors.push('invalid_catalogue_api_release_scope');
  }
  if (catalogueAssetsReleaseMode && process.env.STACKR_DEPLOYMENT_SCOPE !== 'catalogue_assets') {
    errors.push('invalid_catalogue_assets_release_scope');
  }
  if (fullPlatformReleaseMode && process.env.STACKR_DEPLOYMENT_SCOPE !== 'full_platform') {
    errors.push('invalid_full_platform_release_scope');
  }
  if (fullPlatformReleaseMode && stagingEvidence.releaseReadiness?.status !== 'ready') {
    errors.push('staging_evidence_not_release_ready');
  }
  if (catalogueReleaseMode) {
    if (stagingEvidence.supabase?.migrationHistoryStatus !== 'aligned') {
      errors.push('catalogue_api_migration_history_not_aligned');
    }
    if (stagingEvidence.databaseRecovery?.status !== 'verified') {
      errors.push('catalogue_api_database_recovery_not_verified');
    }
    if (stagingEvidence.storageRecovery?.status !== 'verified') {
      errors.push('catalogue_api_storage_recovery_not_verified');
    }
    if (!Number.isInteger(stagingEvidence.catalogue?.publishedVersions)
      || stagingEvidence.catalogue.publishedVersions <= 0) {
      errors.push('catalogue_api_version_not_published');
    }
    const releaseEligibleLanguages = new Set(stagingEvidence.catalogue?.releaseEligibleLanguages ?? []);
    for (const language of requiredCatalogueLanguages) {
      if (!releaseEligibleLanguages.has(language)) {
        errors.push(`catalogue_api_release_language_missing:${language}`);
      }
    }
  }

  const requiredReleaseGates = catalogueAssetsReleaseMode
    ? ['storageBackupVerified']
    : catalogueApiReleaseMode
    ? ['migrationHistoryAligned', 'storageBackupVerified']
    : Object.keys(releaseGateApprovals);
  for (const gate of requiredReleaseGates) {
    const approvalVariable = releaseGateApprovals[gate];
    if (manifest.releaseGates[gate] !== true) errors.push(`release_gate_not_ready:${gate}`);
    if (process.env[approvalVariable] !== 'true') errors.push(`release_approval_missing:${approvalVariable}`);
  }

  const requiredReleaseVariables = [
    'STACKR_DEPLOYMENT_ENVIRONMENT',
    'STACKR_DEPLOYMENT_SCOPE',
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_DB_URL',
    'SUPABASE_PROJECT_REF',
  ];
  if (!catalogueAssetsReleaseMode) {
    requiredReleaseVariables.push(
      'RAILWAY_API_TOKEN',
      'RAILWAY_PROJECT_ID',
      'RAILWAY_ENVIRONMENT_ID',
      'RAILWAY_BACKEND_SERVICE_ID',
      'CLOUDFLARE_API_TOKEN',
      'CLOUDFLARE_ACCOUNT_ID',
      'STACKR_BACKEND_URL',
      'STACKR_GATEWAY_URL',
      'STACKR_SUPABASE_URL',
      'STACKR_SUPABASE_PUBLISHABLE_KEY',
      'BACKEND_ORIGIN_KEY',
      'BACKEND_ADMIN_KEY',
    );
  }
  if (catalogueReleaseMode && deploymentEnvironment === 'production') {
    requiredReleaseVariables.push(
      'SUPABASE_STAGING_DB_URL',
      'SUPABASE_STAGING_SECRET_KEY',
      'SUPABASE_PRODUCTION_SECRET_KEY',
    );
  }
  if (fullPlatformReleaseMode) {
    requiredReleaseVariables.push(
      'RAILWAY_RECOGNITION_SERVICE_ID',
      'STACKR_RECOGNITION_URL',
      'RECOGNITION_SERVICE_SECRET',
      'EXPO_TOKEN',
    );
  }
  for (const variable of requiredReleaseVariables) {
    if (!process.env[variable]) errors.push(`missing_release_variable:${variable}`);
  }

  const expectedProjectRef = deploymentEnvironment === 'production'
    ? productionProjectRef
    : stagingProjectRef;
  if (expectedProjectRef && process.env.SUPABASE_PROJECT_REF
    && process.env.SUPABASE_PROJECT_REF !== expectedProjectRef) {
    errors.push(`supabase_project_ref_mismatch:${deploymentEnvironment}`);
  }
}

console.log(JSON.stringify({
  ok: errors.length === 0,
  mode: releaseMode ? 'release' : 'structural',
  migrationCount: migrations.length,
  warnings,
  errors,
}, null, 2));
if (errors.length) process.exit(1);
