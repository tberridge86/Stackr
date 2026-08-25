import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { finished } from 'node:stream/promises';

export const RAW_SOURCE_RECORD_TABLE = 'ingest.raw_source_records';
export const RAW_SOURCE_RECORD_COPY_BATCH_MAX_BYTES = 8 * 1024 * 1024;
// Kept as an alias while the existing JSON helper remains available to callers.
export const RAW_SOURCE_RECORD_JSON_BATCH_MAX_BYTES = RAW_SOURCE_RECORD_COPY_BATCH_MAX_BYTES;

const require = createRequire(import.meta.url);
const rawSourceRecordCopyStagePreparedClients = new WeakSet();
const rawSourceRecordDirectCopyRlsSnapshots = new WeakMap();
const RAW_SOURCE_RECORD_COPY_STAGE_TABLE = 'stackr_raw_source_records_copy_stage';

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function splitQualifiedName(value) {
  const parts = String(value).split('.');
  if (parts.length !== 2 || parts.some((part) => !/^[a-z_][a-z0-9_]*$/.test(part))) {
    throw new Error(`invalid_qualified_name:${value}`);
  }
  return { schema: parts[0], name: parts[1] };
}

function qualifiedName(value) {
  const { schema, name } = splitQualifiedName(value);
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
}

function quoteLiteral(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonTransferValue(value, location) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) {
    throw new Error(`raw_source_record_json_buffer_unsupported:${location}`);
  }
  if (typeof value === 'bigint') {
    throw new Error(`raw_source_record_json_bigint_unsupported:${location}`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`raw_source_record_json_nonfinite_number:${location}`);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => jsonTransferValue(item, `${location}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => (
      [key, jsonTransferValue(item, `${location}.${key}`)]
    )));
  }
  return value;
}

export function assertRawSourceRecordJsonContract(metadata, columnNames) {
  const supportedTypes = new Set(['uuid', 'text', 'timestamptz', 'jsonb']);
  const metadataByName = new Map(
    metadata.columns.map((column) => [column.column_name, column]),
  );
  const missingColumns = columnNames.filter((columnName) => !metadataByName.has(columnName));
  if (missingColumns.length) {
    throw new Error(`raw_source_record_json_columns_missing:${missingColumns.join(',')}`);
  }
  const unsupportedColumns = columnNames.filter((columnName) => (
    !supportedTypes.has(metadataByName.get(columnName).udt_name)
  ));
  if (unsupportedColumns.length) {
    throw new Error(`raw_source_record_json_types_unsupported:${unsupportedColumns.join(',')}`);
  }
}

export function rawSourceRecordInsertSql(metadata, columnNames) {
  assertRawSourceRecordJsonContract(metadata, columnNames);
  const columnSql = columnNames.map(quoteIdentifier).join(', ');
  const selectedColumns = new Set(columnNames);
  const hasIdentity = metadata.columns.some((column) => (
    selectedColumns.has(column.column_name) && column.is_identity === 'YES'
  ));
  const tableSql = qualifiedName(RAW_SOURCE_RECORD_TABLE);
  return `insert into ${tableSql} (${columnSql})`
    + `${hasIdentity ? ' overriding system value' : ''} `
    + `select ${columnSql} `
    + `from jsonb_populate_recordset(null::${tableSql}, $1::jsonb)`;
}

export function rawSourceRecordCopySql(metadata, columnNames) {
  assertRawSourceRecordJsonContract(metadata, columnNames);
  const columnSql = columnNames.map(quoteIdentifier).join(', ');
  return `copy ${quoteIdentifier(RAW_SOURCE_RECORD_COPY_STAGE_TABLE)} (${columnSql}) from stdin with (format text)`;
}

// COPY FROM cannot target an RLS-enabled relation. This is deliberately
// separate from the staged path; callers must make an explicit isolated-target
// opt-in before they can use it.
export function rawSourceRecordDirectCopySql(metadata, columnNames) {
  assertRawSourceRecordDirectCopyContract(metadata, columnNames);
  const columnSql = columnNames.map(quoteIdentifier).join(', ');
  return `copy ${qualifiedName(RAW_SOURCE_RECORD_TABLE)} (${columnSql}) from stdin with (format text)`;
}

function rawSourceRecordHasIdentity(metadata, columnNames) {
  const selectedColumns = new Set(columnNames);
  return metadata.columns.some((column) => (
    selectedColumns.has(column.column_name) && column.is_identity === 'YES'
  ));
}

export function assertRawSourceRecordDirectCopyContract(metadata, columnNames) {
  assertRawSourceRecordJsonContract(metadata, columnNames);
  const metadataByName = new Map(
    metadata.columns.map((column) => [column.column_name, column]),
  );
  const identityColumns = columnNames.filter((columnName) => (
    metadataByName.get(columnName).is_identity === 'YES'
  ));
  if (identityColumns.length) {
    throw new Error(`raw_source_record_direct_copy_identity_unsupported:${identityColumns.join(',')}`);
  }
  const generatedColumns = columnNames.filter((columnName) => {
    const generated = metadataByName.get(columnName).is_generated;
    return generated !== undefined && generated !== null && generated !== 'NEVER';
  });
  if (generatedColumns.length) {
    throw new Error(`raw_source_record_direct_copy_generated_unsupported:${generatedColumns.join(',')}`);
  }
}

export function rawSourceRecordCopyStageCreateSql(metadata, columnNames) {
  assertRawSourceRecordJsonContract(metadata, columnNames);
  const columnSql = columnNames.map(quoteIdentifier).join(', ');
  return `create temporary table ${quoteIdentifier(RAW_SOURCE_RECORD_COPY_STAGE_TABLE)} on commit drop as `
    + `select ${columnSql} from ${qualifiedName(RAW_SOURCE_RECORD_TABLE)} where false`;
}

export function rawSourceRecordCopyStageInsertSql(metadata, columnNames) {
  assertRawSourceRecordJsonContract(metadata, columnNames);
  const columnSql = columnNames.map(quoteIdentifier).join(', ');
  return `insert into ${qualifiedName(RAW_SOURCE_RECORD_TABLE)} (${columnSql})`
    + `${rawSourceRecordHasIdentity(metadata, columnNames) ? ' overriding system value' : ''} `
    + `select ${columnSql} from ${quoteIdentifier(RAW_SOURCE_RECORD_COPY_STAGE_TABLE)}`;
}

export function rawSourceRecordCopyStageTruncateSql() {
  return `truncate ${quoteIdentifier(RAW_SOURCE_RECORD_COPY_STAGE_TABLE)}`;
}

function rawSourceRecordCopyField(value, columnName, columnMetadata) {
  if (value === null || value === undefined) return '\\N';
  let serialized;
  if (columnMetadata.udt_name === 'jsonb') {
    if (typeof value !== 'string') {
      throw new Error(`raw_source_record_copy_jsonb_text_required:${columnName}`);
    }
    serialized = value;
  } else if (columnMetadata.udt_name === 'timestamptz' && value instanceof Date) {
    serialized = value.toISOString();
  } else {
    serialized = String(value);
  }
  return serialized
    .replaceAll('\\', '\\\\')
    .replaceAll('\t', '\\t')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r');
}

export function rawSourceRecordCopyBatches(
  rows,
  metadata,
  columnNames,
  maxBytes = RAW_SOURCE_RECORD_COPY_BATCH_MAX_BYTES,
) {
  assertRawSourceRecordJsonContract(metadata, columnNames);
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new Error('raw_source_record_copy_batch_limit_invalid');
  }
  const metadataByName = new Map(
    metadata.columns.map((column) => [column.column_name, column]),
  );
  const batches = [];
  let lines = [];
  let payloadBytes = 0;
  let startOffset = 0;

  const flush = () => {
    if (!lines.length) return;
    batches.push({
      payload: Buffer.from(lines.join(''), 'utf8'),
      rowCount: lines.length,
      startOffset,
      payloadBytes,
    });
    startOffset += lines.length;
    lines = [];
    payloadBytes = 0;
  };

  for (const row of rows) {
    const line = `${columnNames.map((columnName) => rawSourceRecordCopyField(
      row[columnName],
      columnName,
      metadataByName.get(columnName),
    )).join('\t')}\n`;
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (lineBytes > maxBytes) {
      throw new Error(`raw_source_record_copy_row_too_large:${lineBytes}`);
    }
    if (lines.length && payloadBytes + lineBytes > maxBytes) flush();
    lines.push(line);
    payloadBytes += lineBytes;
  }
  flush();
  return batches;
}

export async function assertRawSourceRecordCanonicalTableRlsEnabled(client) {
  const result = await client.query(`
    select table_class.relrowsecurity as row_security_enabled
    from pg_class table_class
    join pg_namespace table_namespace
      on table_namespace.oid = table_class.relnamespace
    where table_namespace.nspname = 'ingest'
      and table_class.relname = 'raw_source_records'
      and table_class.relkind in ('r', 'p')
  `);
  if (result.rows.length !== 1) throw new Error('raw_source_record_copy_table_missing');
  if (!Boolean(result.rows[0].row_security_enabled)) {
    throw new Error('raw_source_record_copy_rls_not_enabled');
  }
  return { rowSecurityEnabled: true };
}

function normalizedRawSourceRecordPolicies(rows) {
  return rows.map((row) => ({
    name: row.policy_name,
    command: row.policy_command,
    roles: String(row.policy_roles ?? ''),
    permissive: Boolean(row.policy_permissive),
    usingExpression: row.using_expression ?? null,
    checkExpression: row.check_expression ?? null,
  })).sort((left, right) => (
    left.name.localeCompare(right.name)
      || left.command.localeCompare(right.command)
      || left.roles.localeCompare(right.roles)
  ));
}

export function rawSourceRecordRlsPolicyFingerprint(policies) {
  return createHash('sha256').update(JSON.stringify(policies)).digest('hex');
}

export async function captureRawSourceRecordRlsState(client) {
  const relation = await client.query(`
    select
      table_class.relrowsecurity as row_security_enabled,
      table_class.relforcerowsecurity as force_row_security_enabled
    from pg_class table_class
    join pg_namespace table_namespace
      on table_namespace.oid = table_class.relnamespace
    where table_namespace.nspname = 'ingest'
      and table_class.relname = 'raw_source_records'
      and table_class.relkind in ('r', 'p')
  `);
  if (relation.rows.length !== 1) throw new Error('raw_source_record_direct_copy_table_missing');
  const policies = normalizedRawSourceRecordPolicies((await client.query(`
    select
      policy_entry.polname as policy_name,
      policy_entry.polcmd as policy_command,
      policy_entry.polroles::text as policy_roles,
      policy_entry.polpermissive as policy_permissive,
      pg_get_expr(policy_entry.polqual, policy_entry.polrelid) as using_expression,
      pg_get_expr(policy_entry.polwithcheck, policy_entry.polrelid) as check_expression
    from pg_policy policy_entry
    join pg_class table_class on table_class.oid = policy_entry.polrelid
    join pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
    where table_namespace.nspname = 'ingest'
      and table_class.relname = 'raw_source_records'
    order by policy_entry.polname, policy_entry.polcmd, policy_entry.polroles::text
  `)).rows);
  return {
    rowSecurityEnabled: Boolean(relation.rows[0].row_security_enabled),
    forceRowSecurityEnabled: Boolean(relation.rows[0].force_row_security_enabled),
    policyCount: policies.length,
    policyFingerprint: rawSourceRecordRlsPolicyFingerprint(policies),
  };
}

function assertRawSourceRecordDirectCopyCapability(options) {
  if (options?.allowIsolatedDirectCopy !== true || options?.isolatedTargetVerified !== true) {
    throw new Error('raw_source_record_direct_copy_isolated_target_confirmation_required');
  }
}

export async function disableRawSourceRecordRlsForIsolatedDirectCopy(client, options = {}) {
  assertRawSourceRecordDirectCopyCapability(options);
  if (rawSourceRecordDirectCopyRlsSnapshots.has(client)) {
    throw new Error('raw_source_record_direct_copy_already_prepared');
  }
  await client.query(`lock table ${qualifiedName(RAW_SOURCE_RECORD_TABLE)} in access exclusive mode`);
  const before = await captureRawSourceRecordRlsState(client);
  if (!before.rowSecurityEnabled) throw new Error('raw_source_record_direct_copy_rls_not_enabled');
  if (before.policyCount < 1) throw new Error('raw_source_record_direct_copy_policies_missing');
  try {
    await client.query(`alter table ${qualifiedName(RAW_SOURCE_RECORD_TABLE)} disable row level security`);
    const disabled = await captureRawSourceRecordRlsState(client);
    if (disabled.rowSecurityEnabled
        || disabled.forceRowSecurityEnabled !== before.forceRowSecurityEnabled
        || disabled.policyFingerprint !== before.policyFingerprint) {
      throw new Error('raw_source_record_direct_copy_rls_disable_verification_failed');
    }
  } catch (error) {
    // Best effort only: an aborted connection/transaction must be rolled back by
    // the caller, but a healthy transaction should never be left less protected.
    try {
      await client.query(`alter table ${qualifiedName(RAW_SOURCE_RECORD_TABLE)} enable row level security`);
    } catch (restoreError) {
      error.restoreFailure = restoreError;
    }
    throw error;
  }
  rawSourceRecordDirectCopyRlsSnapshots.set(client, before);
  return before;
}

export async function restoreRawSourceRecordRlsAfterIsolatedDirectCopy(client, before, options = {}) {
  assertRawSourceRecordDirectCopyCapability(options);
  if (rawSourceRecordDirectCopyRlsSnapshots.get(client) !== before) {
    throw new Error('raw_source_record_direct_copy_rls_snapshot_not_active');
  }
  if (!before?.rowSecurityEnabled || !Number.isInteger(before.policyCount)
      || typeof before.policyFingerprint !== 'string') {
    throw new Error('raw_source_record_direct_copy_rls_snapshot_invalid');
  }
  await client.query(`alter table ${qualifiedName(RAW_SOURCE_RECORD_TABLE)} enable row level security`);
  const restored = await captureRawSourceRecordRlsState(client);
  if (!restored.rowSecurityEnabled
      || restored.forceRowSecurityEnabled !== before.forceRowSecurityEnabled
      || restored.policyCount !== before.policyCount
      || restored.policyFingerprint !== before.policyFingerprint) {
    throw new Error('raw_source_record_direct_copy_rls_restore_verification_failed');
  }
  rawSourceRecordDirectCopyRlsSnapshots.delete(client);
  return restored;
}

export function resetRawSourceRecordDirectCopyPreparation(client) {
  rawSourceRecordDirectCopyRlsSnapshots.delete(client);
}

function copyFromFactory() {
  try {
    const copyFrom = require('pg-copy-streams').from;
    if (typeof copyFrom !== 'function') throw new Error('copy_from_export_missing');
    return copyFrom;
  } catch (error) {
    throw new Error('raw_source_record_copy_stream_dependency_missing', { cause: error });
  }
}

async function prepareRawSourceRecordCopyStage(client, metadata, columnNames) {
  if (rawSourceRecordCopyStagePreparedClients.has(client)) return;
  await assertRawSourceRecordCanonicalTableRlsEnabled(client);
  await client.query(rawSourceRecordCopyStageCreateSql(metadata, columnNames));
  rawSourceRecordCopyStagePreparedClients.add(client);
}

export function resetRawSourceRecordCopyStagePreparation(client) {
  rawSourceRecordCopyStagePreparedClients.delete(client);
}

export async function copyRawSourceRecordRows(client, metadata, columnNames, rows, options = {}) {
  if (!rows.length) return { batchCount: 0, rowCount: 0, payloadBytes: 0 };
  assertRawSourceRecordJsonContract(metadata, columnNames);
  await prepareRawSourceRecordCopyStage(client, metadata, columnNames);
  const copyFrom = options.copyFrom ?? copyFromFactory();
  if (typeof copyFrom !== 'function') throw new Error('raw_source_record_copy_stream_factory_invalid');
  const statement = rawSourceRecordCopySql(metadata, columnNames);
  const insertStatement = rawSourceRecordCopyStageInsertSql(metadata, columnNames);
  const truncateStatement = rawSourceRecordCopyStageTruncateSql();
  const batches = rawSourceRecordCopyBatches(rows, metadata, columnNames);
  let rowCount = 0;
  let payloadBytes = 0;
  for (const batch of batches) {
    try {
      const stream = client.query(copyFrom(statement));
      if (!stream || typeof stream.end !== 'function') {
        throw new Error('raw_source_record_copy_stream_invalid');
      }
      const completion = finished(stream);
      stream.end(batch.payload);
      await completion;
      const insertResult = await client.query(insertStatement);
      if (insertResult.rowCount !== batch.rowCount) {
        throw new Error(
          `raw_source_record_copy_insert_count_mismatch:expected_${batch.rowCount}`
          + `:actual_${insertResult.rowCount}`,
        );
      }
      await client.query(truncateStatement);
    } catch (error) {
      const failure = new Error(
        `raw_source_record_copy_failed:copy_batch_${batch.startOffset}`
        + `:postgres_${error.code ?? 'unknown'}`,
        { cause: error },
      );
      failure.code = error.code;
      throw failure;
    }
    rowCount += batch.rowCount;
    payloadBytes += batch.payloadBytes;
  }
  return { batchCount: batches.length, rowCount, payloadBytes };
}

function reportedCopyRowCount(stream) {
  if (stream.rowCount === undefined || stream.rowCount === null) return null;
  const rowCount = Number(stream.rowCount);
  if (!Number.isSafeInteger(rowCount) || rowCount < 0) {
    throw new Error('raw_source_record_direct_copy_reported_row_count_invalid');
  }
  return rowCount;
}

// This is intentionally not a fallback for the normal staged loader. The
// caller must explicitly attest that it has already verified an isolated
// target and must prepare RLS once for the complete table transfer. An
// enclosing transaction rollback is required to make any COPY failure atomic.
export async function copyRawSourceRecordRowsDirectToCanonical(
  client,
  metadata,
  columnNames,
  rows,
  options = {},
) {
  assertRawSourceRecordDirectCopyContract(metadata, columnNames);
  assertRawSourceRecordDirectCopyCapability(options);
  if (!rawSourceRecordDirectCopyRlsSnapshots.has(client)) {
    throw new Error('raw_source_record_direct_copy_rls_preparation_required');
  }
  if (!rows.length) {
    return {
      batchCount: 0,
      rowCount: 0,
      payloadBytes: 0,
      reportedCopyRowCount: null,
    };
  }

  const copyFrom = options.copyFrom ?? copyFromFactory();
  if (typeof copyFrom !== 'function') {
    throw new Error('raw_source_record_direct_copy_stream_factory_invalid');
  }
  const statement = rawSourceRecordDirectCopySql(metadata, columnNames);
  const batches = rawSourceRecordCopyBatches(rows, metadata, columnNames);
  let rowCount = 0;
  let payloadBytes = 0;
  let reportedRowCount = 0;
  let hasReportedRowCount = false;

  for (const batch of batches) {
    try {
      const stream = client.query(copyFrom(statement));
      if (!stream || typeof stream.end !== 'function') {
        throw new Error('raw_source_record_direct_copy_stream_invalid');
      }
      const completion = finished(stream);
      stream.end(batch.payload);
      await completion;
      const reportedRows = reportedCopyRowCount(stream);
      if (reportedRows !== null) {
        hasReportedRowCount = true;
        reportedRowCount += reportedRows;
        if (reportedRows !== batch.rowCount) {
          throw new Error(
            `raw_source_record_direct_copy_count_mismatch:expected_${batch.rowCount}`
            + `:actual_${reportedRows}`,
          );
        }
      }
    } catch (error) {
      const failure = new Error(
        `raw_source_record_direct_copy_failed:copy_batch_${batch.startOffset}`
        + `:postgres_${error.code ?? 'unknown'}`,
        { cause: error },
      );
      failure.code = error.code;
      throw failure;
    }
    rowCount += batch.rowCount;
    payloadBytes += batch.payloadBytes;
  }
  return {
    batchCount: batches.length,
    rowCount,
    payloadBytes,
    reportedCopyRowCount: hasReportedRowCount ? reportedRowCount : null,
  };
}

export function rawSourceRecordJsonBatches(
  rows,
  columnNames,
  maxBytes = RAW_SOURCE_RECORD_JSON_BATCH_MAX_BYTES,
) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new Error('raw_source_record_json_batch_limit_invalid');
  }
  const batches = [];
  let rowJson = [];
  let payloadBytes = 2;
  let startOffset = 0;

  const flush = () => {
    if (!rowJson.length) return;
    batches.push({
      payload: `[${rowJson.join(',')}]`,
      rowCount: rowJson.length,
      startOffset,
      payloadBytes,
    });
    startOffset += rowJson.length;
    rowJson = [];
    payloadBytes = 2;
  };

  for (const row of rows) {
    const projected = Object.fromEntries(columnNames.map((columnName) => (
      [columnName, jsonTransferValue(row[columnName], columnName)]
    )));
    const serialized = JSON.stringify(projected);
    const serializedBytes = Buffer.byteLength(serialized, 'utf8');
    if (serializedBytes + 2 > maxBytes) {
      throw new Error(`raw_source_record_json_row_too_large:${serializedBytes}`);
    }
    const nextBytes = payloadBytes + serializedBytes + (rowJson.length ? 1 : 0);
    if (rowJson.length && nextBytes > maxBytes) flush();
    rowJson.push(serialized);
    payloadBytes += serializedBytes + (rowJson.length > 1 ? 1 : 0);
  }
  flush();
  return batches;
}

function normalizedIndexRows(rows) {
  return rows.map((row) => ({
    schemaName: row.schema_name,
    indexName: row.index_name,
    definition: row.definition,
    comment: row.index_comment ?? null,
    unique: Boolean(row.is_unique),
    valid: Boolean(row.is_valid),
    ready: Boolean(row.is_ready),
    live: Boolean(row.is_live),
    clustered: Boolean(row.is_clustered),
    replicaIdentity: Boolean(row.is_replica_identity),
  })).sort((left, right) => (
    left.schemaName.localeCompare(right.schemaName)
      || left.indexName.localeCompare(right.indexName)
  ));
}

export function rawSourceRecordIndexFingerprint(indexes) {
  return createHash('sha256').update(JSON.stringify(indexes)).digest('hex');
}

async function readRawSourceRecordNonConstraintIndexes(client) {
  const rows = (await client.query(`
    select
      index_namespace.nspname as schema_name,
      index_class.relname as index_name,
      pg_get_indexdef(index_class.oid) as definition,
      obj_description(index_class.oid, 'pg_class') as index_comment,
      index_entry.indisunique as is_unique,
      index_entry.indisvalid as is_valid,
      index_entry.indisready as is_ready,
      index_entry.indislive as is_live,
      index_entry.indisclustered as is_clustered,
      index_entry.indisreplident as is_replica_identity
    from pg_class table_class
    join pg_namespace table_namespace
      on table_namespace.oid = table_class.relnamespace
    join pg_index index_entry
      on index_entry.indrelid = table_class.oid
    join pg_class index_class
      on index_class.oid = index_entry.indexrelid
    join pg_namespace index_namespace
      on index_namespace.oid = index_class.relnamespace
    where table_namespace.nspname = 'ingest'
      and table_class.relname = 'raw_source_records'
      and not index_entry.indisprimary
      and not exists (
        select 1
        from pg_constraint constraint_entry
        where constraint_entry.conindid = index_class.oid
      )
    order by index_namespace.nspname, index_class.relname
  `)).rows;
  return normalizedIndexRows(rows);
}

export async function assertRawSourceRecordPrimaryKey(client) {
  const rows = (await client.query(`
    select
      index_class.relname as index_name,
      pg_get_indexdef(index_class.oid) as definition
    from pg_class table_class
    join pg_namespace table_namespace
      on table_namespace.oid = table_class.relnamespace
    join pg_index index_entry
      on index_entry.indrelid = table_class.oid
    join pg_class index_class
      on index_class.oid = index_entry.indexrelid
    join pg_constraint constraint_entry
      on constraint_entry.conindid = index_class.oid
     and constraint_entry.conrelid = table_class.oid
     and constraint_entry.contype = 'p'
    where table_namespace.nspname = 'ingest'
      and table_class.relname = 'raw_source_records'
      and index_entry.indisprimary
      and index_entry.indisunique
      and index_entry.indisvalid
      and index_entry.indisready
      and index_entry.indislive
  `)).rows;
  if (rows.length !== 1) throw new Error('raw_source_record_primary_key_not_preserved');
  return rows[0];
}

export async function captureRawSourceRecordIndexes(client) {
  const indexes = await readRawSourceRecordNonConstraintIndexes(client);
  if (!indexes.length) throw new Error('raw_source_record_deferred_indexes_missing');
  const unhealthy = indexes.filter((index) => !index.valid || !index.ready || !index.live);
  if (unhealthy.length) {
    throw new Error(`raw_source_record_deferred_indexes_unhealthy:${unhealthy.map((index) => index.indexName).join(',')}`);
  }
  const roleBearing = indexes.filter((index) => index.clustered || index.replicaIdentity);
  if (roleBearing.length) {
    throw new Error(`raw_source_record_deferred_index_role_unsupported:${roleBearing.map((index) => index.indexName).join(',')}`);
  }
  const primaryKey = await assertRawSourceRecordPrimaryKey(client);
  return {
    indexes,
    count: indexes.length,
    names: indexes.map((index) => `${index.schemaName}.${index.indexName}`),
    fingerprint: rawSourceRecordIndexFingerprint(indexes),
    primaryKey,
  };
}

export async function dropRawSourceRecordIndexes(client, snapshot) {
  for (const index of snapshot.indexes) {
    await client.query(
      `drop index ${quoteIdentifier(index.schemaName)}.${quoteIdentifier(index.indexName)}`,
    );
  }
  const remaining = await readRawSourceRecordNonConstraintIndexes(client);
  if (remaining.length) {
    throw new Error(`raw_source_record_deferred_index_drop_incomplete:${remaining.map((index) => index.indexName).join(',')}`);
  }
  const primaryKey = await assertRawSourceRecordPrimaryKey(client);
  if (primaryKey.index_name !== snapshot.primaryKey.index_name
      || primaryKey.definition !== snapshot.primaryKey.definition) {
    throw new Error('raw_source_record_primary_key_changed:after_drop');
  }
  return { droppedCount: snapshot.count, primaryKey };
}

export async function verifyRawSourceRecordIndexes(client, expectedSnapshot, context) {
  const actual = await captureRawSourceRecordIndexes(client);
  if (actual.count !== expectedSnapshot.count
      || actual.fingerprint !== expectedSnapshot.fingerprint) {
    throw new Error(
      `raw_source_record_index_fingerprint_mismatch:${context}`
      + `:expected_${expectedSnapshot.fingerprint}:actual_${actual.fingerprint}`,
    );
  }
  if (actual.primaryKey.index_name !== expectedSnapshot.primaryKey.index_name
      || actual.primaryKey.definition !== expectedSnapshot.primaryKey.definition) {
    throw new Error(`raw_source_record_primary_key_changed:${context}`);
  }
  return actual;
}

export async function restoreRawSourceRecordIndexes(client, snapshot) {
  for (const index of snapshot.indexes) {
    try {
      await client.query(index.definition);
      await client.query(
        `comment on index ${quoteIdentifier(index.schemaName)}.${quoteIdentifier(index.indexName)}`
        + ` is ${quoteLiteral(index.comment)}`,
      );
    } catch (error) {
      throw new Error(
        `raw_source_record_index_restore_failed:${index.schemaName}.${index.indexName}`
        + `:postgres_${error.code ?? 'unknown'}`,
        { cause: error },
      );
    }
  }
  return verifyRawSourceRecordIndexes(client, snapshot, 'precommit');
}
