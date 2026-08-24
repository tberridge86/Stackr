import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { normalizePostgresUrl } from './prepare-postgres-urls.mjs';

export function preparePrimaryPostgresUrl({
  connectionString = process.env.SUPABASE_DB_URL,
  projectRef = process.env.SUPABASE_PROJECT_REF,
  environmentPath = process.env.GITHUB_ENV,
} = {}) {
  if (!environmentPath) throw new Error('github_environment_file_missing');
  const prepared = normalizePostgresUrl(connectionString, projectRef);
  appendFileSync(environmentPath, `SUPABASE_DB_URL=${prepared.normalized}\n`, {
    encoding: 'utf8',
  });
  return prepared;
}

function main() {
  const prepared = preparePrimaryPostgresUrl();
  process.stdout.write(`::add-mask::${prepared.encodedPassword}\n`);
  process.stdout.write(`::add-mask::${prepared.normalized}\n`);
  process.stdout.write(`Protected ${prepared.endpointKind} database URL prepared.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`prepare_primary_postgres_url_failed:${error.message}`);
    process.exitCode = 1;
  }
}
