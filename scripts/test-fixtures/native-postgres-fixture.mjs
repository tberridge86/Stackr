import { randomUUID } from 'node:crypto';
import pg from 'pg';

// No URL, host, port, user or password comes from environment/config. This mode
// can only address the dedicated disposable PostgreSQL service in Platform CI.
// Roles are cluster-global: this job must own the whole service, not just its DB.
export function nativeFixtureEnabled(env = process.env) {
  if (!env.STACKR_NATIVE_POSTGRES_FIXTURE) return false;
  if (env.STACKR_NATIVE_POSTGRES_FIXTURE !== '1' || env.GITHUB_ACTIONS !== 'true' || env.CI !== 'true' || env.GITHUB_JOB !== 'prepared-valuation-postgres17') {
    throw new Error('native_postgres_fixture_requires_explicit_ci_mode');
  }
  return true;
}
export async function createNativePostgresFixture({ env = process.env, Client = pg.Client, nonce = randomUUID } = {}) {
  if (!nativeFixtureEnabled(env)) return undefined;
  const suffix = nonce().replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/.test(suffix)) throw new Error('invalid_fixture_database_nonce');
  const database = 'stackr_fixture_' + suffix;
  const config = { host:'127.0.0.1', port:5432, user:'postgres', password:'postgres',
    database:'postgres', connectionTimeoutMillis:5000, application_name:'stackr-isolated-query-plan-fixture' };
  const admin = new Client(config);
  let client;
  let created = false;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      if (client) await client.end();
      if (created) await admin.query('drop database "' + database + '"');
    } finally { await admin.end(); }
  };
  try {
    await admin.connect();
    const result = await admin.query("select current_setting('server_version_num')::int as version");
    if (result.rows[0]?.version < 170000 || result.rows[0]?.version >= 180000 || !Number.isInteger(result.rows[0]?.version)) {
      throw new Error('native_fixture_requires_postgres_17');
    }
    // Never reuse/drop a preexisting database. Failure before CREATE succeeds
    // leaves created=false, so cleanup cannot target somebody else's database.
    await admin.query('create database "' + database + '"');
    created = true;
    client = new Client({ ...config, database });
    await client.connect();
    return { query:(sql,params)=>client.query(sql,params), exec:(sql)=>client.query(sql), close };
  } catch (error) {
    await close();
    throw error;
  }
}
