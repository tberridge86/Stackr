import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

export const RAW_SOURCE_RECORD_TABLE = 'ingest.raw_source_records';
export const RAW_SOURCE_RECORD_JSON_BATCH_MAX_BYTES = 8 * 1024 * 1024;

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
