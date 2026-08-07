import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const SOURCE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const TARGET_PROJECT_REF = process.env.SUPABASE_RESTORE_PROJECT_REF;
const SOURCE_DB_URL = process.env.STACKR_SOURCE_DB_URL ?? process.env.SUPABASE_DB_URL;
const TARGET_DB_URL = process.env.STACKR_RESTORE_DB_URL ?? process.env.SUPABASE_RESTORE_DB_URL;
const EVIDENCE_DIR = process.env.STACKR_RECOVERY_EVIDENCE_DIR ?? process.cwd();
const APPLICATION_SCHEMAS = ['public', 'catalog', 'ingest', 'market', 'ml', 'api', 'audit'];

for (const [name, value] of Object.entries({
  SUPABASE_PROJECT_REF: SOURCE_PROJECT_REF,
  SUPABASE_RESTORE_PROJECT_REF: TARGET_PROJECT_REF,
  SUPABASE_DB_URL: SOURCE_DB_URL,
  SUPABASE_RESTORE_DB_URL: TARGET_DB_URL,
})) {
  if (!value) throw new Error(`missing_required_environment_variable:${name}`);
}
if (SOURCE_PROJECT_REF === TARGET_PROJECT_REF) throw new Error('source_and_restore_project_refs_match');
if (!SOURCE_DB_URL.includes(SOURCE_PROJECT_REF)) throw new Error('source_database_url_project_mismatch');
if (!TARGET_DB_URL.includes(TARGET_PROJECT_REF)) throw new Error('restore_database_url_project_mismatch');

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function connect(connectionString) {
  const client = new Client({ connectionString, application_name: 'stackr-recovery-verifier' });
  await client.connect();
  // Full-table recovery fingerprints intentionally exceed the normal API query limit.
  await client.query('set statement_timeout = 0');
  return client;
}

async function schemaSnapshot(client) {
  const result = await client.query(`
    with selected_schemas as (
      select unnest($1::text[]) as schema_name
    ), objects as (
      select 'column' as object_type,
        n.nspname as schema_name,
        c.relname as object_name,
        a.attnum::text as object_identity,
        concat_ws('|', a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod),
          a.attnotnull::text, coalesce(pg_get_expr(ad.adbin, ad.adrelid), '')) as definition
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
      join selected_schemas s on s.schema_name = n.nspname
      where a.attnum > 0 and not a.attisdropped and c.relkind in ('r', 'p', 'v', 'm')
      union all
      select 'constraint', n.nspname, c.relname, con.conname,
        pg_get_constraintdef(con.oid, true)
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join selected_schemas s on s.schema_name = n.nspname
      union all
      select 'index', n.nspname, c.relname, i.relname, pg_get_indexdef(i.oid)
      from pg_index x
      join pg_class c on c.oid = x.indrelid
      join pg_class i on i.oid = x.indexrelid
      join pg_namespace n on n.oid = c.relnamespace
      join selected_schemas s on s.schema_name = n.nspname
      union all
      select 'view', n.nspname, c.relname, c.relname,
        concat_ws('|', c.relkind::text, coalesce(array_to_string(c.reloptions, ','), ''),
          pg_get_viewdef(c.oid, true))
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join selected_schemas s on s.schema_name = n.nspname
      where c.relkind in ('v', 'm')
      union all
      select 'function', n.nspname, p.proname,
        pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join selected_schemas s on s.schema_name = n.nspname
      union all
      select 'trigger', n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid, true)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join selected_schemas s on s.schema_name = n.nspname
      where not t.tgisinternal
    )
    select object_type, schema_name, object_name, object_identity, definition
    from objects
    order by object_type, schema_name, object_name, object_identity
  `, [APPLICATION_SCHEMAS]);
  return result.rows;
}

async function tableDigests(client) {
  const tableResult = await client.query(`
    select schemaname as schema_name, tablename as table_name
    from pg_tables
    where schemaname = any($1::text[])
    order by schemaname, tablename
  `, [APPLICATION_SCHEMAS]);
  const output = [];
  for (const table of tableResult.rows) {
    const qualified = `${quoteIdentifier(table.schema_name)}.${quoteIdentifier(table.table_name)}`;
    const result = await client.query(`
      select count(*)::text as row_count,
        coalesce(md5(string_agg(row_hash, '' order by row_hash)), md5('')) as row_digest
      from (select md5(to_jsonb(source_row)::text) as row_hash from ${qualified} source_row) rows
    `);
    output.push({ ...table, ...result.rows[0] });
  }
  return output;
}

async function migrationSnapshot(client) {
  const exists = await client.query(`
    select to_regclass('supabase_migrations.schema_migrations') is not null as present
  `);
  if (!exists.rows[0].present) return [];
  const result = await client.query(`
    select version, name, cardinality(statements)::integer as statement_count
    from supabase_migrations.schema_migrations
    order by version
  `);
  return result.rows;
}

async function extensionSnapshot(client) {
  const result = await client.query(`
    select e.extname, e.extversion, n.nspname as schema_name
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname in ('vector', 'pg_trgm', 'pgcrypto')
    order by e.extname
  `);
  return result.rows;
}

const source = await connect(SOURCE_DB_URL);
const target = await connect(TARGET_DB_URL);
try {
  const [sourceSchema, targetSchema] = await Promise.all([
    schemaSnapshot(source),
    schemaSnapshot(target),
  ]);
  const [sourceTables, targetTables] = await Promise.all([
    tableDigests(source),
    tableDigests(target),
  ]);
  const [sourceMigrations, targetMigrations] = await Promise.all([
    migrationSnapshot(source),
    migrationSnapshot(target),
  ]);
  const [sourceExtensions, targetExtensions] = await Promise.all([
    extensionSnapshot(source),
    extensionSnapshot(target),
  ]);

  const checks = {
    schema: digest(sourceSchema) === digest(targetSchema),
    tableData: digest(sourceTables) === digest(targetTables),
    migrationHistory: digest(sourceMigrations) === digest(targetMigrations),
    extensions: digest(sourceExtensions) === digest(targetExtensions),
  };
  const evidence = {
    schemaVersion: 'stackr-postgres-restore-evidence-v1.0.0',
    verifiedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    restoreProjectRef: TARGET_PROJECT_REF,
    sourceSchemaSha256: digest(sourceSchema),
    restoreSchemaSha256: digest(targetSchema),
    sourceTableDataSha256: digest(sourceTables),
    restoreTableDataSha256: digest(targetTables),
    sourceMigrationHistorySha256: digest(sourceMigrations),
    restoreMigrationHistorySha256: digest(targetMigrations),
    sourceExtensionSha256: digest(sourceExtensions),
    restoreExtensionSha256: digest(targetExtensions),
    tableCount: sourceTables.length,
    migrationCount: sourceMigrations.length,
    checks,
    ok: Object.values(checks).every(Boolean),
  };
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(path.join(EVIDENCE_DIR, 'postgres-restore-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.ok) process.exitCode = 1;
} finally {
  await Promise.allSettled([source.end(), target.end()]);
}
