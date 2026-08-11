import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { assertNoPostgresConnectionOverrides } from './postgres-url-guard.mjs';

const { Client } = pg;
const PINNED_ROOT_CERTIFICATE = new URL(
  '../../deploy/certificates/supabase-prod-ca-2021.crt',
  import.meta.url,
);
const SUPABASE_ROOT_CA_FINGERPRINT256 = '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
const TLS_QUERY_PARAMETERS = new Set([
  'ssl',
  'sslmode',
  'sslrootcert',
  'sslcert',
  'sslkey',
  'sslpassword',
  'sslnegotiation',
]);

function isSupabasePostgresHost(hostname) {
  return hostname.endsWith('.pooler.supabase.com')
    || hostname.endsWith('.supabase.co');
}

export function stripPostgresTlsParameters(connectionString) {
  const parsed = new URL(String(connectionString ?? '').trim());
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('invalid_postgres_connection_scheme');
  }
  if (!isSupabasePostgresHost(parsed.hostname)) {
    throw new Error('untrusted_supabase_postgres_host');
  }
  assertNoPostgresConnectionOverrides(parsed);
  for (const parameter of TLS_QUERY_PARAMETERS) parsed.searchParams.delete(parameter);
  return parsed.toString();
}

export function loadPinnedSupabaseRootCertificate() {
  const certificate = readFileSync(PINNED_ROOT_CERTIFICATE, 'utf8');
  const parsed = new X509Certificate(certificate);
  if (parsed.fingerprint256 !== SUPABASE_ROOT_CA_FINGERPRINT256
    || !parsed.subject.includes('CN=Supabase Root 2021 CA')) {
    throw new Error('unexpected_supabase_root_certificate');
  }
  return certificate;
}

export function createVerifiedSupabasePostgresConfig(connectionString, applicationName) {
  if (!applicationName) throw new Error('postgres_application_name_required');
  return {
    connectionString: stripPostgresTlsParameters(connectionString),
    application_name: applicationName,
    ssl: {
      ca: loadPinnedSupabaseRootCertificate(),
      rejectUnauthorized: true,
    },
  };
}

export function createVerifiedSupabasePostgresClient(connectionString, applicationName, options = {}) {
  for (const key of ['connectionString', 'application_name', 'ssl']) {
    if (Object.hasOwn(options, key)) throw new Error(`unsafe_postgres_client_option:${key}`);
  }
  return new Client({
    ...options,
    ...createVerifiedSupabasePostgresConfig(connectionString, applicationName),
  });
}

export { SUPABASE_ROOT_CA_FINGERPRINT256 };
