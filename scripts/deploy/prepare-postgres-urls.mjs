import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function encodeComponent(value) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

export function normalizePostgresUrl(value, expectedProjectRef) {
  const connectionString = String(value ?? '').trim();
  if (!connectionString || /[\r\n]/.test(connectionString)) {
    throw new Error('invalid_database_url');
  }

  const schemeMatch = connectionString.match(/^(postgres(?:ql)?):\/\/(.+)$/i);
  if (!schemeMatch) throw new Error('invalid_database_url_scheme');

  const remainder = schemeMatch[2];
  const credentialEnd = remainder.lastIndexOf('@');
  if (credentialEnd <= 0) throw new Error('invalid_database_url_credentials');

  const credentials = remainder.slice(0, credentialEnd);
  const server = remainder.slice(credentialEnd + 1);
  const passwordStart = credentials.indexOf(':');
  if (passwordStart <= 0 || !server) throw new Error('invalid_database_url_credentials');

  const username = encodeComponent(credentials.slice(0, passwordStart));
  const password = encodeComponent(credentials.slice(passwordStart + 1));
  const normalized = `${schemeMatch[1].toLowerCase()}://${username}:${password}@${server}`;
  const parsed = new URL(normalized);

  if (!decodeURIComponent(parsed.username).includes(expectedProjectRef)) {
    throw new Error('database_url_project_mismatch');
  }
  if (!parsed.hostname.endsWith('.supabase.com')) {
    throw new Error('database_url_host_mismatch');
  }
  if (!password) throw new Error('database_url_password_missing');

  return { normalized, encodedPassword: password };
}

function writeGitHubEnvironment(name, value) {
  const environmentPath = process.env.GITHUB_ENV;
  if (!environmentPath) throw new Error('github_environment_file_missing');
  appendFileSync(environmentPath, `${name}=${value}\n`, { encoding: 'utf8' });
}

function main() {
  const sourceOnly = process.argv.includes('--source-only');
  const source = normalizePostgresUrl(
    process.env.SUPABASE_DB_URL,
    process.env.SUPABASE_PROJECT_REF,
  );

  for (const value of [source.encodedPassword, source.normalized]) {
    process.stdout.write(`::add-mask::${value}\n`);
  }

  if (sourceOnly) {
    process.stdout.write('Protected source database URL verified.\n');
    return;
  }

  const restore = normalizePostgresUrl(
    process.env.SUPABASE_RESTORE_DB_URL,
    process.env.SUPABASE_RESTORE_PROJECT_REF,
  );

  for (const value of [restore.encodedPassword, restore.normalized]) {
    process.stdout.write(`::add-mask::${value}\n`);
  }

  writeGitHubEnvironment('STACKR_SOURCE_DB_URL', source.normalized);
  writeGitHubEnvironment('STACKR_RESTORE_DB_URL', restore.normalized);
  process.stdout.write('Protected database URLs prepared.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`prepare_postgres_urls_failed:${error.message}`);
    process.exitCode = 1;
  }
}
