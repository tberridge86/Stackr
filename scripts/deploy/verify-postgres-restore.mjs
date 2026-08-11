import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';
const SOURCE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const TARGET_PROJECT_REF = process.env.SUPABASE_RESTORE_PROJECT_REF;
const SOURCE_DB_URL = process.env.STACKR_SOURCE_DB_URL ?? process.env.SUPABASE_DB_URL;
const TARGET_DB_URL = process.env.STACKR_RESTORE_DB_URL ?? process.env.SUPABASE_RESTORE_DB_URL;
const EVIDENCE_DIR = process.env.STACKR_RECOVERY_EVIDENCE_DIR ?? process.cwd();
const APPLICATION_SCHEMAS = ['public', 'catalog', 'ingest', 'market', 'ml', 'api', 'audit'];
const VOLATILE_TABLES = new Set([
  'audit.observability_events',
  'ml.embedding_activation_events',
  'ml.scan_upload_assets',
]);

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

function tableKey(table) {
  return `${table.schema_name}.${table.table_name}`;
}

function multisetContains(sourceValues, restoreValues) {
  const remaining = new Map();
  for (const value of sourceValues) remaining.set(value, (remaining.get(value) ?? 0) + 1);
  for (const value of restoreValues) {
    const count = remaining.get(value) ?? 0;
    if (count === 0) return false;
    remaining.set(value, count - 1);
  }
  return true;
}

function volatileTableCheck(key, sourceTables, targetTables, sourceRows, targetRows) {
  const source = sourceTables.find((table) => tableKey(table) === key);
  const restore = targetTables.find((table) => tableKey(table) === key);
  const sourceRowHashes = sourceRows.find((table) => table.table === key)?.row_hashes ?? [];
  const restoreRowHashes = targetRows.find((table) => table.table === key)?.row_hashes ?? [];
  const sourceCount = source ? BigInt(source.row_count) : -1n;
  const restoreCount = restore ? BigInt(restore.row_count) : -1n;
  const sameCount = Boolean(source && restore) && restoreCount === sourceCount;
  const sameDigest = Boolean(source && restore) && restore.row_digest === source.row_digest;
  const restoreRowsAreLiveSourceSubset = multisetContains(sourceRowHashes, restoreRowHashes);
  const acceptable = Boolean(source && restore)
    && restoreCount <= sourceCount
    && restoreRowsAreLiveSourceSubset;
  return {
    table: key,
    sourcePresent: Boolean(source),
    restorePresent: Boolean(restore),
    sourceRowCount: source?.row_count ?? null,
    restoreRowCount: restore?.row_count ?? null,
    sourceRowDigest: source?.row_digest ?? null,
    restoreRowDigest: restore?.row_digest ?? null,
    restoreNotAheadOfLiveSource: source && restore ? restoreCount <= sourceCount : false,
    snapshotBehindLiveSource: source && restore ? restoreCount < sourceCount : false,
    sameCountRowsMatch: sameCount ? sameDigest : null,
    restoreRowsAreLiveSourceSubset,
    acceptable,
  };
}

function tableMismatches(sourceTables, targetTables) {
  const sourceByKey = new Map(sourceTables.map((table) => [tableKey(table), table]));
  const targetByKey = new Map(targetTables.map((table) => [tableKey(table), table]));
  return [...new Set([...sourceByKey.keys(), ...targetByKey.keys()])]
    .sort()
    .flatMap((key) => {
      const source = sourceByKey.get(key);
      const restore = targetByKey.get(key);
      if (source?.row_count === restore?.row_count && source?.row_digest === restore?.row_digest) {
        return [];
      }
      return [{
        table: key,
        sourcePresent: Boolean(source),
        restorePresent: Boolean(restore),
        sourceRowCount: source?.row_count ?? null,
        restoreRowCount: restore?.row_count ?? null,
        sourceRowDigest: source?.row_digest ?? null,
        restoreRowDigest: restore?.row_digest ?? null,
      }];
    });
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function connect(connectionString) {
  const client = createVerifiedSupabasePostgresClient(
    connectionString,
    'stackr-recovery-verifier',
  );
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

async function volatileRowDigests(client) {
  const output = [];
  for (const key of [...VOLATILE_TABLES].sort()) {
    const [schemaName, tableName] = key.split('.');
    const qualified = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
    const result = await client.query(`
      select coalesce(array_agg(row_hash order by row_hash), '{}') as row_hashes
      from (select md5(to_jsonb(source_row)::text) as row_hash from ${qualified} source_row) rows
    `);
    output.push({ table: key, row_hashes: result.rows[0].row_hashes });
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
  const [sourceVolatileRows, targetVolatileRows] = await Promise.all([
    volatileRowDigests(source),
    volatileRowDigests(target),
  ]);
  const [sourceMigrations, targetMigrations] = await Promise.all([
    migrationSnapshot(source),
    migrationSnapshot(target),
  ]);
  const [sourceExtensions, targetExtensions] = await Promise.all([
    extensionSnapshot(source),
    extensionSnapshot(target),
  ]);

  const sourceStrictTables = sourceTables.filter((table) => !VOLATILE_TABLES.has(tableKey(table)));
  const targetStrictTables = targetTables.filter((table) => !VOLATILE_TABLES.has(tableKey(table)));
  const strictTableMismatches = tableMismatches(sourceStrictTables, targetStrictTables);
  const volatileTableChecks = [...VOLATILE_TABLES]
    .sort()
    .map((key) => volatileTableCheck(
      key,
      sourceTables,
      targetTables,
      sourceVolatileRows,
      targetVolatileRows,
    ));

  const checks = {
    schema: digest(sourceSchema) === digest(targetSchema),
    tableData: digest(sourceStrictTables) === digest(targetStrictTables),
    volatileTableSnapshotBounds: volatileTableChecks.every((check) => check.acceptable),
    migrationHistory: digest(sourceMigrations) === digest(targetMigrations),
    extensions: digest(sourceExtensions) === digest(targetExtensions),
  };
  const evidence = {
    schemaVersion: 'stackr-postgres-restore-evidence-v1.2.0',
    verifiedAt: new Date().toISOString(),
    sourceProjectRef: SOURCE_PROJECT_REF,
    restoreProjectRef: TARGET_PROJECT_REF,
    sourceSchemaSha256: digest(sourceSchema),
    restoreSchemaSha256: digest(targetSchema),
    sourceTableDataSha256: digest(sourceStrictTables),
    restoreTableDataSha256: digest(targetStrictTables),
    sourceMigrationHistorySha256: digest(sourceMigrations),
    restoreMigrationHistorySha256: digest(targetMigrations),
    sourceExtensionSha256: digest(sourceExtensions),
    restoreExtensionSha256: digest(targetExtensions),
    tableCount: sourceTables.length,
    strictTableCount: sourceStrictTables.length,
    strictTableMismatches,
    volatileTableCount: volatileTableChecks.length,
    volatileTableChecks,
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
