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
  const projectRef = String(expectedProjectRef ?? '').trim();
  if (!connectionString || /[\r\n]/.test(connectionString)) {
    throw new Error('invalid_database_url');
  }
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error('invalid_project_ref');
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
  const decodedUsername = decodeURIComponent(parsed.username);
  const decodedPassword = decodeURIComponent(parsed.password);
  const hostname = parsed.hostname.toLowerCase();
  const directHost = `db.${projectRef}.supabase.co`;
  const sharedPoolerHost = /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(hostname);
  const isDirect = hostname === directHost
    && decodedUsername === 'postgres'
    && parsed.port === '5432';
  const isSharedSessionPooler = sharedPoolerHost
    && decodedUsername === `postgres.${projectRef}`
    && parsed.port === '5432';

  if (!password || !decodedPassword || /[\u0000-\u001f\u007f]/.test(decodedPassword)) {
    throw new Error('database_url_password_invalid');
  }
  if (parsed.pathname !== '/postgres') throw new Error('database_url_name_mismatch');
  if (parsed.hash) throw new Error('database_url_fragment_prohibited');
  const queryEntries = [...parsed.searchParams.entries()];
  if (queryEntries.length > 1
      || (queryEntries.length === 1
        && (queryEntries[0][0] !== 'sslmode'
          || !['require', 'verify-ca', 'verify-full'].includes(queryEntries[0][1])))) {
    throw new Error('database_url_query_prohibited');
  }
  if (!isDirect && !isSharedSessionPooler) {
    throw new Error('database_url_project_endpoint_mismatch');
  }

  return {
    normalized: parsed.toString(),
    encodedPassword: password,
    endpointKind: isDirect ? 'direct' : 'shared_session_pooler',
  };
}

function writeGitHubEnvironment(name, value) {
  const environmentPath = process.env.GITHUB_ENV;
  if (!environmentPath) throw new Error('github_environment_file_missing');
  appendFileSync(environmentPath, `${name}=${value}\n`, { encoding: 'utf8' });
}

function main() {
  const source = normalizePostgresUrl(
    process.env.SUPABASE_DB_URL,
    process.env.SUPABASE_PROJECT_REF,
  );
  const restore = normalizePostgresUrl(
    process.env.SUPABASE_RESTORE_DB_URL,
    process.env.SUPABASE_RESTORE_PROJECT_REF,
  );

  for (const value of [
    source.encodedPassword,
    source.normalized,
    restore.encodedPassword,
    restore.normalized,
  ]) {
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
