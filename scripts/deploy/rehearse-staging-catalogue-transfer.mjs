import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const SOURCE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const TARGET_PROJECT_REF = process.env.SUPABASE_RESTORE_PROJECT_REF;
const PRODUCTION_PROJECT_REF = process.env.SUPABASE_PRODUCTION_PROJECT_REF;
const SOURCE_DB_URL = process.env.STACKR_SOURCE_DB_URL;
const TARGET_DB_URL = process.env.STACKR_RESTORE_DB_URL;
const EVIDENCE_PATH = process.env.STACKR_TRANSFER_EVIDENCE_PATH;
const TABLE_CONFIG_PATH = 'deploy/staging-catalogue-preservation-tables.json';

for (const [name, value] of Object.entries({
  SUPABASE_PROJECT_REF: SOURCE_PROJECT_REF,
  SUPABASE_RESTORE_PROJECT_REF: TARGET_PROJECT_REF,
  SUPABASE_PRODUCTION_PROJECT_REF: PRODUCTION_PROJECT_REF,
  STACKR_SOURCE_DB_URL: SOURCE_DB_URL,
  STACKR_RESTORE_DB_URL: TARGET_DB_URL,
  STACKR_TRANSFER_EVIDENCE_PATH: EVIDENCE_PATH,
})) {
  if (!value) throw new Error(`missing_required_environment_variable:${name}`);
}
if (SOURCE_PROJECT_REF === TARGET_PROJECT_REF) throw new Error('source_and_target_project_refs_match');
if (SOURCE_PROJECT_REF === PRODUCTION_PROJECT_REF) throw new Error('production_source_prohibited');
if (TARGET_PROJECT_REF === PRODUCTION_PROJECT_REF) throw new Error('production_target_prohibited');
if (!SOURCE_DB_URL.includes(SOURCE_PROJECT_REF)) throw new Error('source_database_url_project_mismatch');
if (!TARGET_DB_URL.includes(TARGET_PROJECT_REF)) throw new Error('target_database_url_project_mismatch');

const tableConfig = JSON.parse(readFileSync(TABLE_CONFIG_PATH, 'utf8'));
if (tableConfig.schemaVersion !== 'stackr-staging-catalogue-preservation-v1.0.0') {
  throw new Error('invalid_table_config_version');
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function splitTableName(value) {
  const parts = String(value).split('.');
  if (parts.length !== 2 || parts.some((part) => !/^[a-z_][a-z0-9_]*$/.test(part))) {
    throw new Error(`invalid_table_name:${value}`);
  }
  return { schema: parts[0], table: parts[1] };
}

function qualifiedName(value) {
  const { schema, table } = splitTableName(value);
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { $bytea: value.toString('base64') };
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function digestRows(rows) {
  const hash = createHash('sha256');
  for (const row of rows) hash.update(stableJson(row)).update('\n');
  return hash.digest('hex');
}

async function connect(connectionString, applicationName) {
  const client = new Client({ connectionString, application_name: applicationName });
  await client.connect();
  return client;
}

async function tableMetadata(client, tableName) {
  const { schema, table } = splitTableName(tableName);
  const columns = await client.query(`
    select column_name, data_type, udt_schema, udt_name, is_identity
    from information_schema.columns
    where table_schema = $1 and table_name = $2
    order by ordinal_position
  `, [schema, table]);
  if (!columns.rowCount) throw new Error(`table_missing:${tableName}`);

  const primaryKey = await client.query(`
    select a.attname as column_name
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join unnest(i.indkey) with ordinality as key(attnum, ordinal) on true
    join pg_attribute a on a.attrelid = c.oid and a.attnum = key.attnum
    where n.nspname = $1 and c.relname = $2 and i.indisprimary
    order by key.ordinal
  `, [schema, table]);
  if (!primaryKey.rowCount) throw new Error(`primary_key_missing:${tableName}`);

  return {
    columns: columns.rows,
    primaryKey: primaryKey.rows.map((row) => row.column_name),
  };
}

async function readRows(client, tableName, primaryKey) {
  const order = primaryKey.map(quoteIdentifier).join(', ');
  return (await client.query(`select * from ${qualifiedName(tableName)} order by ${order}`)).rows;
}

function keyForRow(row, primaryKey) {
  return stableJson(primaryKey.map((column) => row[column]));
}

async function insertRows(client, tableName, metadata, rows) {
  if (!rows.length) return;
  const columnNames = metadata.columns.map((column) => column.column_name);
  const columnSql = columnNames.map(quoteIdentifier).join(', ');
  const hasIdentity = metadata.columns.some((column) => column.is_identity === 'YES');
  const primaryKeySql = metadata.primaryKey.map(quoteIdentifier).join(', ');
  const updatedColumns = columnNames.filter((column) => !metadata.primaryKey.includes(column));
  const conflictAction = updatedColumns.length
    ? `do update set ${updatedColumns.map((column) => {
      const identifier = quoteIdentifier(column);
      return `${identifier} = excluded.${identifier}`;
    }).join(', ')}`
    : 'do nothing';
  const maxRowsPerBatch = Math.max(1, Math.floor(50000 / columnNames.length));

  for (let offset = 0; offset < rows.length; offset += maxRowsPerBatch) {
    const batch = rows.slice(offset, offset + maxRowsPerBatch);
    const values = [];
    const tuples = batch.map((row) => {
      const placeholders = columnNames.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await client.query(
      `insert into ${qualifiedName(tableName)} (${columnSql})`
      + `${hasIdentity ? ' overriding system value' : ''} `
      + `values ${tuples.join(', ')} on conflict (${primaryKeySql}) ${conflictAction}`,
      values,
    );
  }
}

async function setUserTriggersEnabled(client, tableName, enabled) {
  await client.query(
    `alter table ${qualifiedName(tableName)} ${enabled ? 'enable' : 'disable'} trigger user`,
  );
}

async function advanceOwnedSequences(client, tableName, metadata, rows) {
  if (!rows.length) return;
  for (const column of metadata.columns) {
    const sequence = await client.query(
      'select pg_get_serial_sequence($1, $2) as sequence_name',
      [tableName, column.column_name],
    );
    const sequenceName = sequence.rows[0]?.sequence_name;
    if (!sequenceName) continue;
    const values = rows
      .map((row) => row[column.column_name])
      .filter((value) => value !== null && value !== undefined)
      .map((value) => BigInt(value));
    if (!values.length) continue;
    const maximum = values.reduce((left, right) => (left > right ? left : right));
    await client.query('select setval($1::regclass, $2::bigint, true)', [sequenceName, maximum.toString()]);
  }
}

function verifySourceRows(tableName, sourceRows, targetRows, primaryKey) {
  const targetByKey = new Map(targetRows.map((row) => [keyForRow(row, primaryKey), row]));
  const matched = [];
  for (const sourceRow of sourceRows) {
    const key = keyForRow(sourceRow, primaryKey);
    const targetRow = targetByKey.get(key);
    if (!targetRow) throw new Error(`transferred_row_missing:${tableName}:${key}`);
    if (stableJson(sourceRow) !== stableJson(targetRow)) {
      throw new Error(`transferred_row_mismatch:${tableName}:${key}`);
    }
    matched.push(targetRow);
  }
  return matched;
}

const source = await connect(SOURCE_DB_URL, 'stackr-staging-catalogue-source');
const target = await connect(TARGET_DB_URL, 'stackr-staging-catalogue-rehearsal');
const results = [];
const excludedChecks = [];
let targetTransactionOpen = false;
let sourceTransactionOpen = false;

try {
  await source.query('begin transaction isolation level repeatable read read only');
  sourceTransactionOpen = true;
  await target.query('begin transaction isolation level repeatable read');
  targetTransactionOpen = true;

  for (const tableName of tableConfig.excludedEmptyStagingOnlyTables) {
    const count = Number((await source.query(
      `select count(*)::integer as row_count from ${qualifiedName(tableName)}`,
    )).rows[0].row_count);
    if (count !== 0) throw new Error(`excluded_staging_table_not_empty:${tableName}:${count}`);
    excludedChecks.push({ table: tableName, rowCount: count, reason: 'staging_only_and_empty' });
  }
  for (const tableName of tableConfig.excludedStagingProjections) {
    const count = Number((await source.query(
      `select count(*)::integer as row_count from ${qualifiedName(tableName)}`,
    )).rows[0].row_count);
    excludedChecks.push({ table: tableName, rowCount: count, reason: 'staging_only_regenerable_projection' });
  }

  for (const tableName of tableConfig.tables) {
    const sourceMetadata = await tableMetadata(source, tableName);
    const targetMetadata = await tableMetadata(target, tableName);
    if (stableJson(sourceMetadata) !== stableJson(targetMetadata)) {
      throw new Error(`table_contract_mismatch:${tableName}`);
    }

    const sourceRows = await readRows(source, tableName, sourceMetadata.primaryKey);
    const targetRowsBefore = await readRows(target, tableName, targetMetadata.primaryKey);
    const targetBeforeByKey = new Map(
      targetRowsBefore.map((row) => [keyForRow(row, targetMetadata.primaryKey), row]),
    );
    const preExistingSourceRows = sourceRows.filter((row) => (
      targetBeforeByKey.has(keyForRow(row, sourceMetadata.primaryKey))
    ));
    const preExistingSourceValueMismatches = preExistingSourceRows.filter((row) => {
      const key = keyForRow(row, sourceMetadata.primaryKey);
      return stableJson(row) !== stableJson(targetBeforeByKey.get(key));
    });

    await setUserTriggersEnabled(target, tableName, false);
    try {
      await insertRows(target, tableName, targetMetadata, sourceRows);
      await advanceOwnedSequences(target, tableName, targetMetadata, sourceRows);
    } finally {
      await setUserTriggersEnabled(target, tableName, true);
    }
    const targetRowsAfter = await readRows(target, tableName, targetMetadata.primaryKey);
    const matchedRows = verifySourceRows(
      tableName,
      sourceRows,
      targetRowsAfter,
      sourceMetadata.primaryKey,
    );

    results.push({
      table: tableName,
      primaryKey: sourceMetadata.primaryKey,
      sourceRowCount: sourceRows.length,
      targetRowCountBefore: targetRowsBefore.length,
      targetRowCountDuringRehearsal: targetRowsAfter.length,
      preExistingSourceKeyCount: preExistingSourceRows.length,
      preExistingSourceValueMismatchCount: preExistingSourceValueMismatches.length,
      matchedSourceRowCount: matchedRows.length,
      sourceSha256: digestRows(sourceRows),
      matchedTargetSha256: digestRows(matchedRows),
      targetBeforeSha256: digestRows(targetRowsBefore),
    });
  }

  await target.query('rollback');
  targetTransactionOpen = false;

  for (const result of results) {
    const metadata = await tableMetadata(target, result.table);
    const rows = await readRows(target, result.table, metadata.primaryKey);
    result.targetRowCountAfterRollback = rows.length;
    result.targetAfterRollbackSha256 = digestRows(rows);
    result.rollbackMatched = rows.length === result.targetRowCountBefore
      && result.targetAfterRollbackSha256 === result.targetBeforeSha256;
    if (!result.rollbackMatched) throw new Error(`target_rollback_mismatch:${result.table}`);
  }

  await source.query('rollback');
  sourceTransactionOpen = false;

  const evidence = {
    schemaVersion: 'stackr-staging-catalogue-transfer-evidence-v1.1.0',
    capturedAt: new Date().toISOString(),
    sourceCommitHash: process.env.GITHUB_SHA ?? null,
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: TARGET_PROJECT_REF,
    productionProjectRef: PRODUCTION_PROJECT_REF,
    sourceReadOnly: true,
    productionMutationPerformed: false,
    stagingMutationPerformed: false,
    targetTransactionCommitted: false,
    transferConflictPolicy: 'primary_key_upsert_with_user_triggers_disabled_in_rollback_only_transaction',
    targetRollbackVerified: results.every((result) => result.rollbackMatched),
    selectedTableCount: results.length,
    sourceRowCount: results.reduce((sum, result) => sum + result.sourceRowCount, 0),
    matchedSourceRowCount: results.reduce((sum, result) => sum + result.matchedSourceRowCount, 0),
    tables: results,
    excludedChecks,
    excludedStagingProjections: tableConfig.excludedStagingProjections,
    excludedEmptyStagingOnlyTables: tableConfig.excludedEmptyStagingOnlyTables,
  };
  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    selectedTableCount: evidence.selectedTableCount,
    sourceRowCount: evidence.sourceRowCount,
    matchedSourceRowCount: evidence.matchedSourceRowCount,
    targetRollbackVerified: evidence.targetRollbackVerified,
  })}\n`);
} finally {
  if (targetTransactionOpen) await target.query('rollback').catch(() => {});
  if (sourceTransactionOpen) await source.query('rollback').catch(() => {});
  await Promise.allSettled([source.end(), target.end()]);
}
