import { randomUUID } from 'node:crypto';
import pg from 'pg';

const [component, action] = process.argv.slice(2, 4);
const targetId = process.argv.find((value) => value.startsWith('--id='))?.slice(5);
const reason = process.argv.find((value) => value.startsWith('--reason='))?.slice(9) ?? null;
const databaseUrl = process.env.SUPABASE_DB_URL;

if (!databaseUrl) throw new Error('SUPABASE_DB_URL is required.');
if (!targetId) throw new Error('Missing --id=<target-uuid>.');

const statements = {
  'catalogue:activate': 'select catalog.activate_catalogue_version($1::uuid, $2::text, $3::text) as id',
  'catalogue:rollback': 'select catalog.rollback_catalogue_version($1::uuid, $2::text, $3::text) as id',
  'index:activate': 'select ml.activate_embedding_index_version($1::uuid, $2::text) as id',
  'index:rollback': 'select ml.rollback_embedding_index_version($1::uuid, $2::text, $3::text) as id',
};
const statement = statements[`${component}:${action}`];
if (!statement) throw new Error('Use catalogue|index followed by activate|rollback.');

const requestId = process.env.STACKR_RELEASE_REQUEST_ID || randomUUID();
const client = new pg.Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 10_000,
  application_name: `stackr-release-${component}-${action}`,
});

await client.connect();
try {
  await client.query('begin');
  const values = component === 'index' && action === 'activate'
    ? [targetId, requestId]
    : [targetId, requestId, reason];
  const result = await client.query(statement, values);
  await client.query('commit');
  console.log(JSON.stringify({ ok: true, component, action, targetId: result.rows[0]?.id, requestId }));
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  await client.end();
}
