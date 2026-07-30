import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { normalizePostgresUrl } from './prepare-postgres-urls.mjs';

export function prepareIsolatedReconciliationUrl({
  connectionString = process.env.SUPABASE_RESTORE_DB_URL,
  projectRef = process.env.SUPABASE_RESTORE_PROJECT_REF,
  productionProjectRef = process.env.SUPABASE_PRODUCTION_PROJECT_REF,
  stagingProjectRef = process.env.SUPABASE_STAGING_PROJECT_REF,
  environmentPath = process.env.GITHUB_ENV,
} = {}) {
  if (!projectRef || !productionProjectRef || !stagingProjectRef) {
    throw new Error('reconciliation_project_ref_missing');
  }
  if (projectRef === productionProjectRef || projectRef === stagingProjectRef) {
    throw new Error('reconciliation_target_not_isolated');
  }
  if (!environmentPath) throw new Error('github_environment_file_missing');

  const prepared = normalizePostgresUrl(connectionString, projectRef);
  appendFileSync(environmentPath, `STACKR_RESTORE_DB_URL=${prepared.normalized}\n`, {
    encoding: 'utf8',
  });
  return prepared;
}

function main() {
  const prepared = prepareIsolatedReconciliationUrl();
  process.stdout.write(`::add-mask::${prepared.encodedPassword}\n`);
  process.stdout.write(`::add-mask::${prepared.normalized}\n`);
  process.stdout.write('Protected isolated reconciliation URL prepared.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`prepare_isolated_reconciliation_url_failed:${error.message}`);
    process.exitCode = 1;
  }
}
