import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { normalizePostgresUrl } from './prepare-postgres-urls.mjs';

export function prepareProductionBaselineUrl({
  connectionString = process.env.SUPABASE_PRODUCTION_DB_URL,
  projectRef = process.env.SUPABASE_PRODUCTION_PROJECT_REF,
  environmentPath = process.env.GITHUB_ENV,
} = {}) {
  if (!projectRef) throw new Error('production_project_ref_missing');
  if (!environmentPath) throw new Error('github_environment_file_missing');

  const prepared = normalizePostgresUrl(connectionString, projectRef);
  appendFileSync(environmentPath, `STACKR_PRODUCTION_DB_URL=${prepared.normalized}\n`, {
    encoding: 'utf8',
  });

  return prepared;
}

function main() {
  const prepared = prepareProductionBaselineUrl();
  process.stdout.write(`::add-mask::${prepared.encodedPassword}\n`);
  process.stdout.write(`::add-mask::${prepared.normalized}\n`);
  process.stdout.write('Protected production database URL prepared for schema-only capture.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`prepare_production_baseline_url_failed:${error.message}`);
    process.exitCode = 1;
  }
}
