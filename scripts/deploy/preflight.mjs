import { existsSync, readFileSync, readdirSync } from 'node:fs';

const releaseMode = process.argv.includes('--release');
const requiredPaths = [
  '.github/workflows/platform-ci.yml',
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/deploy-production.yml',
  '.github/workflows/rollback.yml',
  'backend/railway.json',
  'gateway/wrangler.jsonc',
  'recognition-service/Dockerfile',
  'recognition-service/railway.json',
  'supabase/config.toml',
  'supabase/seed.sql',
  'deploy/staging-runbook.md',
  'deploy/production-runbook.md',
  'deploy/rollback-runbook.md',
];
const errors = [];
const warnings = [];

for (const filePath of requiredPaths) {
  if (!existsSync(filePath)) errors.push(`missing:${filePath}`);
}

const manifest = JSON.parse(readFileSync('deploy/release-manifest.json', 'utf8'));
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

const dockerfile = readFileSync('recognition-service/Dockerfile', 'utf8');
for (const token of ['USER 10001:10001', 'HEALTHCHECK', 'STOPSIGNAL SIGTERM', '--timeout-graceful-shutdown']) {
  if (!dockerfile.includes(token)) errors.push(`recognition_container_guard_missing:${token}`);
}

if (!manifest.releaseGates.migrationHistoryAligned) warnings.push('migration_history_not_aligned');
if (!manifest.releaseGates.activeModelSelected) warnings.push('active_model_not_selected');
if (!manifest.releaseGates.activeIndexValidated) warnings.push('active_index_not_validated');

if (releaseMode) {
  if (process.env.STACKR_MIGRATION_BASELINE_APPROVED !== 'true') errors.push('migration_baseline_not_approved');
  if (process.env.STACKR_MODEL_INDEX_RELEASE_APPROVED !== 'true') errors.push('model_index_release_not_approved');
  for (const variable of [
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_DB_URL',
    'SUPABASE_PROJECT_REF',
    'RAILWAY_TOKEN',
    'RAILWAY_PROJECT_ID',
    'RAILWAY_ENVIRONMENT_ID',
    'RAILWAY_BACKEND_SERVICE_ID',
    'RAILWAY_RECOGNITION_SERVICE_ID',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
  ]) {
    if (!process.env[variable]) errors.push(`missing_release_variable:${variable}`);
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
