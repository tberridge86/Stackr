import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  catalogueTargetOnlyRows,
  catalogueTransferTargetMatch,
  expectedCatalogueOwnedSequenceStates,
  planCatalogueAssetIdentityMerge,
  planCatalogueSourceIdentityMerge,
  remapCatalogueIdentityForeignKeys,
  remapCatalogueSourceForeignKeys,
  rewriteProductionCatalogueAssetUrls,
  stableCatalogueJson as stableJson,
  verifyCatalogueRowsByPrimaryKey as verifySourceRows,
} from './catalogue-source-identity.mjs';
import {
  projectCatalogueExcludedParentReferences,
  validateCatalogueExcludedParentForeignKeys,
} from './catalogue-excluded-parent-transfer.mjs';
import { prepareCatalogueSelfReferenceTransfer } from './catalogue-self-reference-transfer.mjs';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';

const SOURCE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const TARGET_PROJECT_REF = process.env.SUPABASE_RESTORE_PROJECT_REF;
const PRODUCTION_PROJECT_REF = process.env.SUPABASE_PRODUCTION_PROJECT_REF;
const SOURCE_DB_URL = process.env.STACKR_SOURCE_DB_URL;
const TARGET_DB_URL = process.env.STACKR_RESTORE_DB_URL;
const EVIDENCE_PATH = process.env.STACKR_TRANSFER_EVIDENCE_PATH;
const TRANSFER_MODE = process.env.STACKR_TRANSFER_MODE ?? 'rehearse';
const SOURCE_IDENTITY_POLICY = process.env.STACKR_TRANSFER_SOURCE_IDENTITY_POLICY
  ?? (TRANSFER_MODE === 'promote' ? 'preserve_by_code' : 'replace');
const TRANSFER_CONFIRMATION = process.env.STACKR_TRANSFER_CONFIRMATION;
const CATALOGUE_RELEASE_LABELS = String(
  process.env.STACKR_CATALOGUE_RELEASE_LABEL ?? '',
).split(',').map((value) => value.trim()).filter(Boolean);
const REQUIRED_CATALOGUE_LANGUAGES = String(
  process.env.STACKR_REQUIRED_CATALOGUE_LANGUAGES ?? 'en,ja,zh-tw,zh-cn,ko',
).split(',').map((value) => value.trim()).filter(Boolean);
const TABLE_CONFIG_PATH = process.env.STACKR_TRANSFER_TABLE_CONFIG
  ?? 'deploy/staging-catalogue-preservation-tables.json';
const SOURCE_IDENTITY_TABLE = 'ingest.sources';
const ASSET_TABLE = 'catalog.assets';

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
if (!SOURCE_DB_URL.includes(SOURCE_PROJECT_REF)) throw new Error('source_database_url_project_mismatch');
if (!TARGET_DB_URL.includes(TARGET_PROJECT_REF)) throw new Error('target_database_url_project_mismatch');
if (!['rehearse', 'commit', 'promote'].includes(TRANSFER_MODE)) throw new Error('invalid_transfer_mode');
if (!['replace', 'preserve_by_code'].includes(SOURCE_IDENTITY_POLICY)) {
  throw new Error('invalid_transfer_source_identity_policy');
}
if (TRANSFER_MODE === 'promote' && SOURCE_IDENTITY_POLICY !== 'preserve_by_code') {
  throw new Error('production_source_identity_policy_mismatch');
}
if (TRANSFER_MODE === 'commit' && SOURCE_IDENTITY_POLICY !== 'replace') {
  throw new Error('committed_source_identity_policy_mismatch');
}
if (TRANSFER_MODE !== 'promote' && TARGET_PROJECT_REF === PRODUCTION_PROJECT_REF) {
  throw new Error('production_target_prohibited');
}
if (TRANSFER_MODE === 'commit') {
  if (TRANSFER_CONFIRMATION !== 'COMMIT STAGING CATALOGUE TO ISOLATED CANDIDATE') {
    throw new Error('committed_transfer_confirmation_missing');
  }
  if (SOURCE_PROJECT_REF !== 'lmwfhvexfcoyeuoyrlco') {
    throw new Error('committed_transfer_source_not_canonical_staging');
  }
  if (TARGET_PROJECT_REF !== 'krjttpmthxkfsbqksxci') {
    throw new Error('committed_transfer_target_not_isolated_candidate');
  }
  if (PRODUCTION_PROJECT_REF !== 'oakdbbzdqwurpjnoqhmu') {
    throw new Error('committed_transfer_production_guard_mismatch');
  }
}
if (TRANSFER_MODE === 'promote') {
  if (TRANSFER_CONFIRMATION !== 'PROMOTE VERIFIED CATALOGUE TO PRODUCTION') {
    throw new Error('production_promotion_confirmation_missing');
  }
  if (SOURCE_PROJECT_REF !== 'lmwfhvexfcoyeuoyrlco') {
    throw new Error('production_promotion_source_not_canonical_staging');
  }
  if (TARGET_PROJECT_REF !== 'oakdbbzdqwurpjnoqhmu'
    || TARGET_PROJECT_REF !== PRODUCTION_PROJECT_REF) {
    throw new Error('production_promotion_target_guard_mismatch');
  }
  if (CATALOGUE_RELEASE_LABELS.length === 0) throw new Error('catalogue_release_label_missing');
  if (CATALOGUE_RELEASE_LABELS.length > 10
    || new Set(CATALOGUE_RELEASE_LABELS).size !== CATALOGUE_RELEASE_LABELS.length
    || CATALOGUE_RELEASE_LABELS.some((label) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/.test(label))) {
    throw new Error('catalogue_release_labels_invalid');
  }
  if (REQUIRED_CATALOGUE_LANGUAGES.length === 0) {
    throw new Error('required_catalogue_languages_missing');
  }
}

const tableConfig = JSON.parse(readFileSync(TABLE_CONFIG_PATH, 'utf8'));
if (![
  'stackr-staging-catalogue-preservation-v1.0.0',
  'stackr-production-catalogue-promotion-v1.0.0',
].includes(tableConfig.schemaVersion)) {
  throw new Error('invalid_table_config_version');
}
for (const property of [
  'tables',
  'excludedParentReferenceProjections',
  'excludedStagingProjections',
  'excludedEmptyStagingOnlyTables',
]) {
  if (!Array.isArray(tableConfig[property])) throw new Error(`invalid_table_config_property:${property}`);
}
const declaredExcludedParentReferenceProjections = tableConfig.excludedParentReferenceProjections.map(
  (declaration) => {
    const valid = declaration && typeof declaration === 'object'
      && typeof declaration.table === 'string'
      && typeof declaration.constraint === 'string'
      && typeof declaration.parentTable === 'string'
      && Array.isArray(declaration.columns)
      && declaration.columns.length > 0
      && declaration.columns.every((column) => typeof column === 'string')
      && declaration.action === 'set_null'
      && typeof declaration.reason === 'string'
      && declaration.reason.length > 0;
    if (!valid) throw new Error('invalid_excluded_parent_reference_projection_declaration');
    return {
      table: declaration.table,
      constraintName: declaration.constraint,
      parentTable: declaration.parentTable,
      columnNames: declaration.columns,
      action: declaration.action,
      reason: declaration.reason,
    };
  },
);
const declaredProjectionKeys = new Set();
for (const declaration of declaredExcludedParentReferenceProjections) {
  splitTableName(declaration.table);
  splitTableName(declaration.parentTable);
  if (!tableConfig.tables.includes(declaration.table)) {
    throw new Error(`excluded_parent_reference_projection_table_not_selected:${declaration.table}`);
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(declaration.constraintName)
    || declaration.columnNames.some((column) => !/^[a-z_][a-z0-9_]*$/.test(column))) {
    throw new Error('invalid_excluded_parent_reference_projection_identifier');
  }
  const declarationKey = `${declaration.table}:${declaration.constraintName}`;
  if (declaredProjectionKeys.has(declarationKey)) {
    throw new Error(`duplicate_excluded_parent_reference_projection:${declarationKey}`);
  }
  declaredProjectionKeys.add(declarationKey);
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

function databaseParameterValue(value, column) {
  if (value === null || value === undefined) return value;
  if (column.udt_name === 'json' || column.udt_name === 'jsonb') {
    return JSON.stringify(value);
  }
  return value;
}

function digestRows(rows) {
  const hash = createHash('sha256');
  for (const row of rows) hash.update(stableJson(row)).update('\n');
  return hash.digest('hex');
}

async function connect(connectionString, applicationName) {
  const client = createVerifiedSupabasePostgresClient(connectionString, applicationName);
  await client.connect();
  return client;
}

async function tableMetadata(client, tableName) {
  const { schema, table } = splitTableName(tableName);
  const columns = await client.query(`
    select
      column_name,
      data_type,
      udt_schema,
      udt_name,
      is_nullable,
      column_default,
      is_identity,
      is_generated
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

async function readRows(client, tableName, primaryKey, columns = null) {
  const order = primaryKey.map(quoteIdentifier).join(', ');
  const projection = columns?.length ? columns.map(quoteIdentifier).join(', ') : '*';
  return (await client.query(
    `select ${projection} from ${qualifiedName(tableName)} order by ${order}`,
  )).rows;
}

function projectRow(row, columnNames) {
  return Object.fromEntries(columnNames.map((column) => [column, row[column]]));
}

function compatibleTableContract(tableName, sourceMetadata, targetMetadata) {
  if (stableJson(sourceMetadata.primaryKey) !== stableJson(targetMetadata.primaryKey)) {
    throw new Error(`table_contract_mismatch:${tableName}:primary_key`);
  }
  const targetByName = new Map(
    targetMetadata.columns.map((column) => [column.column_name, column]),
  );
  const incompatibleSourceColumns = [];
  for (const sourceColumn of sourceMetadata.columns) {
    const targetColumn = targetByName.get(sourceColumn.column_name);
    const compatible = targetColumn
      && sourceColumn.data_type === targetColumn.data_type
      && sourceColumn.udt_schema === targetColumn.udt_schema
      && sourceColumn.udt_name === targetColumn.udt_name
      && sourceColumn.is_generated === targetColumn.is_generated;
    if (!compatible) incompatibleSourceColumns.push(sourceColumn.column_name);
  }
  if (incompatibleSourceColumns.length) {
    throw new Error(
      `table_contract_mismatch:${tableName}:source_columns:${incompatibleSourceColumns.join(',')}`,
    );
  }

  const sourceColumnNames = new Set(
    sourceMetadata.columns.map((column) => column.column_name),
  );
  const targetOnlyColumns = targetMetadata.columns.filter(
    (column) => !sourceColumnNames.has(column.column_name),
  );
  const requiredTargetOnlyColumns = targetOnlyColumns.filter((column) => (
    column.is_nullable !== 'YES'
    && column.column_default === null
    && column.is_identity !== 'YES'
    && column.is_generated === 'NEVER'
  ));
  if (requiredTargetOnlyColumns.length) {
    throw new Error(
      `table_contract_mismatch:${tableName}:required_target_columns:${requiredTargetOnlyColumns.map((column) => column.column_name).join(',')}`,
    );
  }

  return {
    transferColumns: sourceMetadata.columns.map((column) => column.column_name),
    targetOnlyColumns: targetOnlyColumns.map((column) => column.column_name),
  };
}

async function insertRows(client, tableName, metadata, columnNames, rows) {
  if (!rows.length) return;
  const columnSql = columnNames.map(quoteIdentifier).join(', ');
  const selectedColumns = new Set(columnNames);
  const metadataByName = new Map(
    metadata.columns.map((column) => [column.column_name, column]),
  );
  const hasIdentity = metadata.columns.some((column) => (
    selectedColumns.has(column.column_name) && column.is_identity === 'YES'
  ));
  const maxRowsPerBatch = Math.max(1, Math.floor(50000 / columnNames.length));

  for (let offset = 0; offset < rows.length; offset += maxRowsPerBatch) {
    const batch = rows.slice(offset, offset + maxRowsPerBatch);
    const values = [];
    const tuples = batch.map((row) => {
      const placeholders = columnNames.map((column) => {
        values.push(databaseParameterValue(row[column], metadataByName.get(column)));
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    try {
      await client.query(
        `insert into ${qualifiedName(tableName)} (${columnSql})`
        + `${hasIdentity ? ' overriding system value' : ''} `
        + `values ${tuples.join(', ')}`,
        values,
      );
    } catch (error) {
      throw new Error(
        `transfer_insert_failed:${tableName}:batch_${offset}:postgres_${error.code ?? 'unknown'}`,
      );
    }
  }
}

async function upsertRows(
  client,
  tableName,
  metadata,
  columnNames,
  primaryKey,
  rows,
  selectedUpdateColumns = null,
) {
  if (!rows.length) return;
  const columnSql = columnNames.map(quoteIdentifier).join(', ');
  const conflictSql = primaryKey.map(quoteIdentifier).join(', ');
  const primaryKeyColumns = new Set(primaryKey);
  const transferableColumns = new Set(columnNames);
  const updateColumns = selectedUpdateColumns ?? columnNames.filter(
    (column) => !primaryKeyColumns.has(column),
  );
  const invalidUpdateColumns = updateColumns.filter((column) => (
    !transferableColumns.has(column) || primaryKeyColumns.has(column)
  ));
  if (invalidUpdateColumns.length) {
    throw new Error(
      `invalid_transfer_update_columns:${tableName}:${invalidUpdateColumns.join(',')}`,
    );
  }
  const updateSql = updateColumns.length
    ? `do update set ${updateColumns.map((column) => (
      `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`
    )).join(', ')}`
    : 'do nothing';
  const selectedColumns = new Set(columnNames);
  const metadataByName = new Map(
    metadata.columns.map((column) => [column.column_name, column]),
  );
  const hasIdentity = metadata.columns.some((column) => (
    selectedColumns.has(column.column_name) && column.is_identity === 'YES'
  ));
  const maxRowsPerBatch = Math.max(1, Math.floor(50000 / columnNames.length));

  for (let offset = 0; offset < rows.length; offset += maxRowsPerBatch) {
    const batch = rows.slice(offset, offset + maxRowsPerBatch);
    const values = [];
    const tuples = batch.map((row) => {
      const placeholders = columnNames.map((column) => {
        values.push(databaseParameterValue(row[column], metadataByName.get(column)));
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    try {
      await client.query(
        `insert into ${qualifiedName(tableName)} (${columnSql})`
        + `${hasIdentity ? ' overriding system value' : ''} `
        + `values ${tuples.join(', ')} `
        + `on conflict (${conflictSql}) ${updateSql}`,
        values,
      );
    } catch (error) {
      const constraint = typeof error?.constraint === 'string'
        && /^[a-z_][a-z0-9_]*$/.test(error.constraint)
        ? `:constraint_${error.constraint}`
        : '';
      throw new Error(
        `transfer_upsert_failed:${tableName}:batch_${offset}:postgres_${error.code ?? 'unknown'}`
        + constraint,
      );
    }
  }
}

async function setUserTriggersEnabled(client, tableName, enabled) {
  await client.query(
    `alter table ${qualifiedName(tableName)} ${enabled ? 'enable' : 'disable'} trigger user`,
  );
}

async function userTriggerStates(client, tableName) {
  const { schema, table } = splitTableName(tableName);
  return (await client.query(`
    select trigger_record.tgname as trigger_name, trigger_record.tgenabled as enabled_mode
    from pg_trigger trigger_record
    join pg_class table_record on table_record.oid = trigger_record.tgrelid
    join pg_namespace namespace_record on namespace_record.oid = table_record.relnamespace
    where namespace_record.nspname = $1
      and table_record.relname = $2
      and not trigger_record.tgisinternal
    order by trigger_record.tgname
  `, [schema, table])).rows;
}

async function lockTransferTables(client, tableNames) {
  await client.query("set local lock_timeout = '30s'");
  for (const tableName of [...tableNames].sort()) {
    await client.query(`lock table ${qualifiedName(tableName)} in exclusive mode`);
  }
}

async function foreignKeyColumnsReferencingTable(client, tableName, parentTableName) {
  const { schema, table } = splitTableName(tableName);
  const parent = splitTableName(parentTableName);
  const result = await client.query(`
    select distinct child_attribute.attname as column_name
    from pg_constraint constraint_record
    join pg_class child_table on child_table.oid = constraint_record.conrelid
    join pg_namespace child_namespace on child_namespace.oid = child_table.relnamespace
    join pg_class parent_table on parent_table.oid = constraint_record.confrelid
    join pg_namespace parent_namespace on parent_namespace.oid = parent_table.relnamespace
    join lateral unnest(constraint_record.conkey, constraint_record.confkey)
      with ordinality as key_columns(child_attnum, parent_attnum, ordinal) on true
    join pg_attribute child_attribute
      on child_attribute.attrelid = child_table.oid
      and child_attribute.attnum = key_columns.child_attnum
    join pg_attribute parent_attribute
      on parent_attribute.attrelid = parent_table.oid
      and parent_attribute.attnum = key_columns.parent_attnum
    where constraint_record.contype = 'f'
      and child_namespace.nspname = $1
      and child_table.relname = $2
      and parent_namespace.nspname = $3
      and parent_table.relname = $4
      and parent_attribute.attname = 'id'
    order by child_attribute.attname
  `, [schema, table, parent.schema, parent.table]);
  return result.rows.map((row) => row.column_name);
}

async function foreignKeyColumnsReferencingSources(client, tableName) {
  return foreignKeyColumnsReferencingTable(client, tableName, SOURCE_IDENTITY_TABLE);
}

async function excludedParentForeignKeys(
  client,
  tableName,
  transferColumns,
  selectedTables,
  rows,
  declaredProjections,
) {
  const { schema, table } = splitTableName(tableName);
  const result = await client.query(`
    select
      constraint_record.conname as constraint_name,
      parent_namespace.nspname || '.' || parent_table.relname as parent_table,
      jsonb_agg(child_attribute.attname::text order by key_columns.ordinal) as column_names,
      bool_and(not child_attribute.attnotnull) as all_columns_nullable,
      case constraint_record.confdeltype
        when 'a' then 'NO ACTION'
        when 'r' then 'RESTRICT'
        when 'c' then 'CASCADE'
        when 'n' then 'SET NULL'
        when 'd' then 'SET DEFAULT'
        else 'UNKNOWN'
      end as delete_action
    from pg_constraint constraint_record
    join pg_class child_table on child_table.oid = constraint_record.conrelid
    join pg_namespace child_namespace on child_namespace.oid = child_table.relnamespace
    join pg_class parent_table on parent_table.oid = constraint_record.confrelid
    join pg_namespace parent_namespace on parent_namespace.oid = parent_table.relnamespace
    join unnest(constraint_record.conkey)
      with ordinality as key_columns(child_attnum, ordinal) on true
    join pg_attribute child_attribute
      on child_attribute.attrelid = child_table.oid
      and child_attribute.attnum = key_columns.child_attnum
    where constraint_record.contype = 'f'
      and child_namespace.nspname = $1
      and child_table.relname = $2
    group by
      constraint_record.oid,
      constraint_record.conname,
      parent_namespace.nspname,
      parent_table.relname,
      constraint_record.confdeltype
    order by constraint_record.conname
  `, [schema, table]);

  return validateCatalogueExcludedParentForeignKeys({
    foreignKeys: result.rows.map((row) => ({
      constraintName: row.constraint_name,
      parentTable: row.parent_table,
      columnNames: row.column_names,
      allColumnsNullable: row.all_columns_nullable,
      deleteAction: row.delete_action,
    })),
    transferColumns,
    selectedTables,
    tableName,
    rows,
    declaredProjections,
  });
}

async function selfReferentialForeignKeyColumns(client, tableName, transferColumns) {
  const { schema, table } = splitTableName(tableName);
  const result = await client.query(`
    select
      constraint_record.conname as constraint_name,
      jsonb_agg(child_attribute.attname::text order by key_columns.ordinal) as column_names,
      bool_and(not child_attribute.attnotnull) as all_columns_nullable
    from pg_constraint constraint_record
    join pg_class child_table on child_table.oid = constraint_record.conrelid
    join pg_namespace child_namespace on child_namespace.oid = child_table.relnamespace
    join unnest(constraint_record.conkey)
      with ordinality as key_columns(child_attnum, ordinal) on true
    join pg_attribute child_attribute
      on child_attribute.attrelid = child_table.oid
      and child_attribute.attnum = key_columns.child_attnum
    where constraint_record.contype = 'f'
      and constraint_record.conrelid = constraint_record.confrelid
      and child_namespace.nspname = $1
      and child_table.relname = $2
    group by constraint_record.oid, constraint_record.conname
    order by constraint_record.conname
  `, [schema, table]);

  const transferredColumns = new Set(transferColumns);
  const deferredColumns = new Set();
  for (const constraint of result.rows) {
    const constraintColumns = constraint.column_names;
    const selectedColumns = constraintColumns.filter((column) => transferredColumns.has(column));
    if (selectedColumns.length === 0) continue;
    if (selectedColumns.length !== constraintColumns.length) {
      throw new Error(
        `self_reference_transfer_columns_incomplete:${tableName}:${constraint.constraint_name}`,
      );
    }
    if (!constraint.all_columns_nullable) {
      throw new Error(
        `self_reference_transfer_requires_nullable_columns:${tableName}:${constraint.constraint_name}`,
      );
    }
    for (const column of selectedColumns) deferredColumns.add(column);
  }
  return [...deferredColumns].sort();
}

async function ownedSequenceStates(client, tableName, metadata) {
  const states = [];
  for (const column of metadata.columns) {
    const sequence = await client.query(`
      select n.nspname as schema_name, c.relname as sequence_name, s.seqstart::text as start_value
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_sequence s on s.seqrelid = c.oid
      where c.oid = pg_get_serial_sequence($1, $2)::regclass
    `,
      [tableName, column.column_name],
    );
    const sequenceRow = sequence.rows[0];
    if (!sequenceRow) continue;
    const state = await client.query(
      `select last_value::text as last_value, is_called from ${quoteIdentifier(sequenceRow.schema_name)}.${quoteIdentifier(sequenceRow.sequence_name)}`,
    );
    states.push({
      column: column.column_name,
      schema: sequenceRow.schema_name,
      sequence: sequenceRow.sequence_name,
      startValue: sequenceRow.start_value,
      lastValue: state.rows[0].last_value,
      isCalled: state.rows[0].is_called,
    });
  }
  return states;
}

async function restartOwnedSequences(client, tableName, metadata, rows) {
  const sequenceStates = await ownedSequenceStates(client, tableName, metadata);
  for (const sequence of sequenceStates) {
    const values = rows
      .map((row) => row[sequence.column])
      .filter((value) => value !== null && value !== undefined)
      .map((value) => BigInt(value));
    const restartValue = values.length
      ? values.reduce((left, right) => (left > right ? left : right)) + 1n
      : BigInt(sequence.startValue);
    await client.query(
      `alter sequence ${quoteIdentifier(sequence.schema)}.${quoteIdentifier(sequence.sequence)} restart with ${restartValue}`,
    );
  }
}

async function rawSourceRecordDuplicateSummary(client) {
  const result = await client.query(`
    select
      count(*)::integer as duplicate_group_count,
      coalesce(sum(row_count - 1), 0)::integer as duplicate_row_count,
      count(*) filter (where payload_version_count > 1)::integer as changed_payload_group_count,
      count(*) filter (where import_run_count > 1)::integer as multiple_import_run_group_count
    from (
      select
        count(*)::integer as row_count,
        count(distinct payload_hash)::integer as payload_version_count,
        count(distinct coalesce(import_run_id::text, ''))::integer as import_run_count
      from ingest.raw_source_records
      group by source_id, record_type, external_id, coalesce(language_code, '')
      having count(*) > 1
    ) duplicate_groups
  `);
  return result.rows[0];
}

async function indexExists(client, qualifiedIndexName) {
  return Boolean((await client.query(
    'select to_regclass($1) is not null as exists',
    [qualifiedIndexName],
  )).rows[0].exists);
}

async function releaseCatalogueVersions(client) {
  if (CATALOGUE_RELEASE_LABELS.length === 0) return [];
  return (await client.query(`
    select id, version_key, version_label, language_code, status, coverage_summary
    from catalog.catalogue_versions
    where version_label = any($1::text[])
    order by language_code, id
  `, [CATALOGUE_RELEASE_LABELS])).rows;
}

function verifyReleaseCatalogueVersions(rows, context) {
  const eligibleRows = rows.filter((row) => (
    row.status === 'published'
    && row.coverage_summary?.releaseEligible === true
    && row.coverage_summary?.controlledStagingSnapshot !== true
  ));
  const byLanguage = new Map(eligibleRows.map((row) => [row.language_code, row]));
  const missingLanguages = REQUIRED_CATALOGUE_LANGUAGES.filter((language) => !byLanguage.has(language));
  if (missingLanguages.length) {
    throw new Error(`${context}_release_languages_missing:${missingLanguages.join(',')}`);
  }
  if (eligibleRows.length !== REQUIRED_CATALOGUE_LANGUAGES.length) {
    throw new Error(`${context}_release_language_version_count_mismatch`);
  }
  return eligibleRows;
}

const source = await connect(SOURCE_DB_URL, 'stackr-staging-catalogue-source');
const target = await connect(TARGET_DB_URL, 'stackr-staging-catalogue-rehearsal');
const results = [];
const excludedChecks = [];
const snapshots = new Map();
let targetTransactionOpen = false;
let sourceTransactionOpen = false;
let sourceReleaseVersions = [];
let sourceIdentityPlan = null;
let targetReleaseVersions = [];
let productionAssetUrlRewriteCount = 0;
let productionAssetTimestampReuseCount = 0;
let targetCommitSucceeded = false;
let targetAlreadyMatched = false;
let assetIdentityPlan = null;
const productionAssetRewriteTimestamp = new Date().toISOString();

try {
  await source.query('begin transaction isolation level repeatable read read only');
  sourceTransactionOpen = true;
  await target.query('begin transaction isolation level repeatable read');
  targetTransactionOpen = true;
  await lockTransferTables(target, tableConfig.tables);

  if (TRANSFER_MODE === 'promote') {
    sourceReleaseVersions = verifyReleaseCatalogueVersions(
      await releaseCatalogueVersions(source),
      'source',
    );
  }

  const rawRecordDuplicates = await rawSourceRecordDuplicateSummary(source);
  const legacyRawRecordIdentityIndexPresent = await indexExists(
    target,
    'ingest.raw_source_records_identity_uidx',
  );
  const importRunRawRecordIdentityIndexPresent = await indexExists(
    target,
    'ingest.raw_source_records_import_run_identity_uidx',
  );
  if (rawRecordDuplicates.duplicate_group_count > 0 && legacyRawRecordIdentityIndexPresent) {
    throw new Error(
      'source_unique_constraint_conflict:ingest.raw_source_records'
      + `:groups_${rawRecordDuplicates.duplicate_group_count}`
      + `:extra_rows_${rawRecordDuplicates.duplicate_row_count}`
      + `:changed_payload_groups_${rawRecordDuplicates.changed_payload_group_count}`
      + `:multiple_import_run_groups_${rawRecordDuplicates.multiple_import_run_group_count}`,
    );
  }

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

  if (SOURCE_IDENTITY_POLICY === 'preserve_by_code') {
    if (!tableConfig.tables.includes(SOURCE_IDENTITY_TABLE)) {
      throw new Error('source_identity_table_missing');
    }
    const sourceMetadata = await tableMetadata(source, SOURCE_IDENTITY_TABLE);
    const targetMetadata = await tableMetadata(target, SOURCE_IDENTITY_TABLE);
    sourceIdentityPlan = planCatalogueSourceIdentityMerge(
      await readRows(source, SOURCE_IDENTITY_TABLE, sourceMetadata.primaryKey),
      await readRows(target, SOURCE_IDENTITY_TABLE, targetMetadata.primaryKey),
    );
  }

  for (const tableName of tableConfig.tables) {
    const sourceMetadata = await tableMetadata(source, tableName);
    const targetMetadata = await tableMetadata(target, tableName);
    const contract = compatibleTableContract(tableName, sourceMetadata, targetMetadata);
    const targetRowsBefore = await readRows(target, tableName, targetMetadata.primaryKey);

    let sourceRows = await readRows(source, tableName, sourceMetadata.primaryKey);
    let sourceIdentityForeignKeyColumns = [];
    let sourceIdentityForeignKeyRemappedRowCount = 0;
    let assetIdentityForeignKeyColumns = [];
    let assetIdentityForeignKeyRemappedRowCount = 0;
    if (sourceIdentityPlan) {
      if (tableName === SOURCE_IDENTITY_TABLE) {
        sourceRows = sourceIdentityPlan.mappedSourceRows;
      } else {
        sourceIdentityForeignKeyColumns = await foreignKeyColumnsReferencingSources(
          target,
          tableName,
        );
        const remapped = remapCatalogueSourceForeignKeys(
          sourceRows,
          sourceIdentityForeignKeyColumns,
          sourceIdentityPlan.sourceIdMap,
          tableName,
        );
        sourceRows = remapped.rows;
        sourceIdentityForeignKeyRemappedRowCount = remapped.remappedRowCount;
      }
    }
    if (assetIdentityPlan && tableName !== ASSET_TABLE) {
      assetIdentityForeignKeyColumns = await foreignKeyColumnsReferencingTable(
        target,
        tableName,
        ASSET_TABLE,
      );
      const remapped = remapCatalogueIdentityForeignKeys(
        sourceRows,
        assetIdentityForeignKeyColumns,
        assetIdentityPlan.sourceIdMap,
        tableName,
        'asset',
      );
      sourceRows = remapped.rows;
      assetIdentityForeignKeyRemappedRowCount = remapped.remappedRowCount;
    }
    if (TRANSFER_MODE === 'promote' && tableName === ASSET_TABLE) {
      const rewritten = rewriteProductionCatalogueAssetUrls(
        sourceRows,
        SOURCE_PROJECT_REF,
        TARGET_PROJECT_REF,
        productionAssetRewriteTimestamp,
        targetRowsBefore,
        targetMetadata.primaryKey,
        contract.transferColumns,
      );
      sourceRows = rewritten.rows;
      productionAssetUrlRewriteCount = rewritten.rewrittenRowCount;
      productionAssetTimestampReuseCount = rewritten.reusedProductionTimestampCount;
      assetIdentityPlan = planCatalogueAssetIdentityMerge(sourceRows, targetRowsBefore);
      sourceRows = assetIdentityPlan.mappedSourceRows;
    }
    const sourceRowsBeforeExcludedParentProjection = sourceRows;
    const excludedParentReferenceForeignKeys = await excludedParentForeignKeys(
      target,
      tableName,
      contract.transferColumns,
      tableConfig.tables,
      sourceRows,
      declaredExcludedParentReferenceProjections,
    );
    const excludedParentReferenceProjection = projectCatalogueExcludedParentReferences(
      sourceRows,
      excludedParentReferenceForeignKeys,
      tableName,
    );
    sourceRows = excludedParentReferenceProjection.rows;
    const selfReferenceForeignKeyColumns = await selfReferentialForeignKeyColumns(
      target,
      tableName,
      contract.transferColumns,
    );
    const selfReferenceTransfer = prepareCatalogueSelfReferenceTransfer(
      sourceRows,
      selfReferenceForeignKeyColumns,
      tableName,
    );
    if (sourceIdentityPlan && tableName === SOURCE_IDENTITY_TABLE
      && selfReferenceForeignKeyColumns.length > 0) {
      throw new Error(`source_identity_self_reference_unsupported:${tableName}`);
    }
    const targetSequencesBefore = await ownedSequenceStates(target, tableName, targetMetadata);
    const targetUserTriggerStates = await userTriggerStates(target, tableName);
    const nonstandardUserTriggers = targetUserTriggerStates.filter(
      (trigger) => trigger.enabled_mode !== 'O',
    );
    if (nonstandardUserTriggers.length) {
      throw new Error(
        `nonstandard_user_trigger_state:${tableName}:${nonstandardUserTriggers.map((trigger) => (
          `${trigger.trigger_name}:${trigger.enabled_mode}`
        )).join(',')}`,
      );
    }
    const preservedTargetRows = TRANSFER_MODE === 'promote'
      ? catalogueTargetOnlyRows(
          sourceRows,
          targetRowsBefore.map((row) => projectRow(row, contract.transferColumns)),
          sourceMetadata.primaryKey,
        )
      : sourceIdentityPlan && tableName === SOURCE_IDENTITY_TABLE
      ? sourceIdentityPlan.preservedTargetOnlyRows.map((row) => (
          projectRow(row, contract.transferColumns)
        ))
      : [];
    snapshots.set(tableName, {
      sourceMetadata,
      targetMetadata,
      sourceRows,
      sourceRowsBeforeExcludedParentProjection,
      targetRowsBefore,
      targetSequencesBefore,
      contract,
      sourceIdentityForeignKeyColumns,
      sourceIdentityForeignKeyRemappedRowCount,
      assetIdentityForeignKeyColumns,
      assetIdentityForeignKeyRemappedRowCount,
      excludedParentReferenceForeignKeys,
      excludedParentReferenceProjection,
      selfReferenceForeignKeyColumns,
      selfReferenceTransfer,
      targetUserTriggerStates,
      preservedTargetRows,
    });
  }

  // A prior workflow may have committed the catalogue before a later deployment step failed.
  // Only that exact state may bypass replacement; changed snapshots fail before target DML.
  if (TRANSFER_MODE === 'promote') {
    const targetMismatchTables = [];
    for (const tableName of tableConfig.tables) {
      const snapshot = snapshots.get(tableName);
      const targetRows = snapshot.targetRowsBefore.map((row) => (
        projectRow(row, snapshot.contract.transferColumns)
      ));
      const targetMatch = catalogueTransferTargetMatch({
        tableName,
        sourceRows: snapshot.sourceRows,
        preservedTargetRows: snapshot.preservedTargetRows,
        targetRows,
        primaryKey: snapshot.sourceMetadata.primaryKey,
        targetSequenceStates: snapshot.targetSequencesBefore,
      });
      if (!targetMatch.matches) {
        targetMismatchTables.push(`${tableName}:${targetMatch.reason}`);
      }
    }
    targetAlreadyMatched = targetMismatchTables.length === 0;
  }

  if (!targetAlreadyMatched && TRANSFER_MODE !== 'promote') {
    for (const tableName of [...tableConfig.tables].reverse()) {
      if (sourceIdentityPlan && tableName === SOURCE_IDENTITY_TABLE) continue;
      await setUserTriggersEnabled(target, tableName, false);
      await target.query(`delete from ${qualifiedName(tableName)}`);
      await setUserTriggersEnabled(target, tableName, true);
    }
  }

  for (const tableName of tableConfig.tables) {
    const snapshot = snapshots.get(tableName);
    const {
      sourceMetadata,
      targetMetadata,
      sourceRows,
      sourceRowsBeforeExcludedParentProjection,
      targetRowsBefore,
      targetSequencesBefore,
      contract,
      sourceIdentityForeignKeyColumns,
      sourceIdentityForeignKeyRemappedRowCount,
      assetIdentityForeignKeyColumns,
      assetIdentityForeignKeyRemappedRowCount,
      excludedParentReferenceForeignKeys,
      excludedParentReferenceProjection,
      selfReferenceForeignKeyColumns,
      selfReferenceTransfer,
      targetUserTriggerStates,
      preservedTargetRows,
    } = snapshot;
    const targetRowsAfterClear = targetAlreadyMatched || TRANSFER_MODE === 'promote'
      ? targetRowsBefore
      : await readRows(target, tableName, targetMetadata.primaryKey);
    const sourceIdentityMerge = Boolean(
      sourceIdentityPlan && tableName === SOURCE_IDENTITY_TABLE,
    );
    if (!targetAlreadyMatched && TRANSFER_MODE !== 'promote'
      && !sourceIdentityMerge && targetRowsAfterClear.length !== 0) {
      throw new Error(`target_table_not_cleared:${tableName}`);
    }
    if (!targetAlreadyMatched && TRANSFER_MODE !== 'promote' && sourceIdentityMerge
      && digestRows(targetRowsAfterClear) !== digestRows(targetRowsBefore)) {
      throw new Error(`target_table_changed_before_merge:${tableName}`);
    }

    if (!targetAlreadyMatched) {
      await setUserTriggersEnabled(target, tableName, false);
      if (sourceIdentityMerge || TRANSFER_MODE === 'promote') {
        await upsertRows(
          target,
          tableName,
          targetMetadata,
          contract.transferColumns,
          targetMetadata.primaryKey,
          selfReferenceTransfer.initialRows,
        );
        await upsertRows(
          target,
          tableName,
          targetMetadata,
          contract.transferColumns,
          targetMetadata.primaryKey,
          selfReferenceTransfer.rowsToRestore,
          selfReferenceForeignKeyColumns,
        );
      } else {
        await insertRows(
          target,
          tableName,
          targetMetadata,
          contract.transferColumns,
          selfReferenceTransfer.initialRows,
        );
        await upsertRows(
          target,
          tableName,
          targetMetadata,
          contract.transferColumns,
          targetMetadata.primaryKey,
          selfReferenceTransfer.rowsToRestore,
          selfReferenceForeignKeyColumns,
        );
      }
      await restartOwnedSequences(
        target,
        tableName,
        targetMetadata,
        [...sourceRows, ...preservedTargetRows],
      );
      await setUserTriggersEnabled(target, tableName, true);
    }
    const targetUserTriggerStatesDuringRehearsal = await userTriggerStates(target, tableName);
    if (stableJson(targetUserTriggerStatesDuringRehearsal) !== stableJson(targetUserTriggerStates)) {
      throw new Error(`user_trigger_state_mismatch:${tableName}`);
    }
    const targetRowsAfter = await readRows(
      target,
      tableName,
      targetMetadata.primaryKey,
      contract.transferColumns,
    );
    const targetSequencesDuringRehearsal = await ownedSequenceStates(target, tableName, targetMetadata);
    const expectedTargetSequencesDuringRehearsal = expectedCatalogueOwnedSequenceStates(
      targetSequencesBefore,
      sourceRows,
    );
    if (stableJson(targetSequencesDuringRehearsal)
      !== stableJson(expectedTargetSequencesDuringRehearsal)) {
      throw new Error(`target_precommit_sequence_mismatch:${tableName}`);
    }
    const matchedRows = verifySourceRows(
      tableName,
      sourceRows,
      targetRowsAfter,
      sourceMetadata.primaryKey,
    );
    const matchedPreservedTargetRows = preservedTargetRows.length > 0
      ? verifySourceRows(
          tableName,
          preservedTargetRows,
          targetRowsAfter,
          targetMetadata.primaryKey,
        )
      : [];
    const expectedTargetRowCount = sourceRows.length + preservedTargetRows.length;
    if (targetRowsAfter.length !== expectedTargetRowCount) {
      throw new Error(
        `target_precommit_row_count_mismatch:${tableName}`
        + `:${expectedTargetRowCount}:${targetRowsAfter.length}`,
      );
    }

    results.push({
      table: tableName,
      primaryKey: sourceMetadata.primaryKey,
      transferColumns: contract.transferColumns,
      targetOnlyColumns: contract.targetOnlyColumns,
      sourceRowCount: sourceRows.length,
      targetRowCountBefore: targetRowsBefore.length,
      targetRowCountAfterClear: targetAlreadyMatched || TRANSFER_MODE === 'promote'
        ? null
        : targetRowsAfterClear.length,
      targetRowCountDuringRehearsal: targetRowsAfter.length,
      matchedSourceRowCount: matchedRows.length,
      sourceSha256: digestRows(sourceRows),
      sourceBeforeExcludedParentProjectionSha256:
        digestRows(sourceRowsBeforeExcludedParentProjection),
      matchedTargetSha256: digestRows(matchedRows),
      sourceIdentityMerge,
      sourceIdentityForeignKeyColumns,
      sourceIdentityForeignKeyRemappedRowCount,
      assetIdentityForeignKeyColumns,
      assetIdentityForeignKeyRemappedRowCount,
      excludedParentReferenceForeignKeys,
      excludedParentReferenceProjectedColumns:
        excludedParentReferenceProjection.projectedColumns,
      excludedParentReferenceProjectedRowCount:
        excludedParentReferenceProjection.projectedRowCount,
      excludedParentReferenceProjectedValueCount:
        excludedParentReferenceProjection.projectedValueCount,
      selfReferenceForeignKeyColumns,
      deferredSelfReferenceRowCount: selfReferenceTransfer.deferredRowCount,
      deferredSelfReferenceValueCount: selfReferenceTransfer.deferredValueCount,
      targetUserTriggerStates,
      targetUserTriggerStatesDuringRehearsal,
      preservedTargetRowCount: matchedPreservedTargetRows.length,
      preservedTargetSha256: digestRows(matchedPreservedTargetRows),
      targetPreCommitVerified: false,
      transferSkippedAsAlreadyCurrent: targetAlreadyMatched,
      targetBeforeSha256: digestRows(targetRowsBefore),
      targetSequencesBefore,
      productionTargetOnlyRowCountPreserved: TRANSFER_MODE === 'promote'
        ? matchedPreservedTargetRows.length
        : null,
      targetSequencesDuringRehearsal,
    });
  }

  if (TRANSFER_MODE === 'promote') {
    targetReleaseVersions = verifyReleaseCatalogueVersions(
      await releaseCatalogueVersions(target),
      'target',
    );
    if (digestRows(targetReleaseVersions) !== digestRows(sourceReleaseVersions)) {
      throw new Error('production_release_versions_mismatch');
    }
    const staleUrls = Number((await target.query(`
      select count(*)::integer as count
      from catalog.assets
      where storage_provider = 'supabase_storage'
        and storage_bucket = 'stackr-catalogue-public'
        and url like '%' || $1 || '%'
    `, [SOURCE_PROJECT_REF])).rows[0].count);
    if (staleUrls !== 0) throw new Error('production_asset_url_rewrite_incomplete');
  }

  for (const result of results) {
    const snapshot = snapshots.get(result.table);
    const sequencesAtPreCommit = result.targetSequencesBefore.length > 0
      ? await ownedSequenceStates(target, result.table, snapshot.targetMetadata)
      : [];
    const expectedSequencesAtPreCommit = expectedCatalogueOwnedSequenceStates(
      result.targetSequencesBefore,
      [...snapshot.sourceRows, ...snapshot.preservedTargetRows],
    );
    if (stableJson(sequencesAtPreCommit) !== stableJson(expectedSequencesAtPreCommit)) {
      throw new Error(`target_precommit_sequence_mismatch:${result.table}`);
    }
    result.targetSequencesAtPreCommit = sequencesAtPreCommit;
    result.targetPreCommitVerified = true;
  }

  if (TRANSFER_MODE !== 'rehearse') {
    await target.query('commit');
    targetCommitSucceeded = true;
  } else await target.query('rollback');
  targetTransactionOpen = false;

  for (const result of results) {
    const snapshot = snapshots.get(result.table);
    if (TRANSFER_MODE !== 'rehearse') {
      result.commitMatched = result.targetPreCommitVerified && targetCommitSucceeded;
      try {
        const metadata = await tableMetadata(target, result.table);
        const rows = await readRows(
          target,
          result.table,
          metadata.primaryKey,
          snapshot.contract.transferColumns,
        );
        const sequences = await ownedSequenceStates(target, result.table, metadata);
        result.targetRowCountAfterCommit = rows.length;
        result.targetAfterCommitSha256 = digestRows(rows);
        result.targetSequencesAfterCommit = sequences;
        const expectedRowCount = snapshot.sourceRows.length
          + snapshot.preservedTargetRows.length;
        const expectedSequences = expectedCatalogueOwnedSequenceStates(
          result.targetSequencesBefore,
          [...snapshot.sourceRows, ...snapshot.preservedTargetRows],
        );
        const matchedRows = verifySourceRows(
          result.table,
          snapshot.sourceRows,
          rows,
          metadata.primaryKey,
        );
        result.matchedTargetAfterCommitSha256 = digestRows(matchedRows);
        let preservedRowsObserved = true;
        if (snapshot.preservedTargetRows.length > 0) {
          const preservedTargetRows = verifySourceRows(
            result.table,
            snapshot.preservedTargetRows,
            rows,
            metadata.primaryKey,
          );
          result.preservedTargetAfterCommitSha256 = digestRows(preservedTargetRows);
          preservedRowsObserved = result.preservedTargetAfterCommitSha256
            === result.preservedTargetSha256;
        }
        result.postCommitObservationMatched = result.matchedTargetAfterCommitSha256
          === result.sourceSha256
          && preservedRowsObserved
          && rows.length === expectedRowCount
          && stableJson(sequences) === stableJson(expectedSequences);
      } catch (error) {
        result.postCommitObservationMatched = false;
        result.postCommitObservationError = {
          name: error instanceof Error ? error.name : 'Error',
          code: typeof error?.code === 'string' ? error.code : 'verification_error',
        };
      }
    } else {
      const metadata = await tableMetadata(target, result.table);
      const rows = await readRows(target, result.table, metadata.primaryKey);
      const sequences = await ownedSequenceStates(target, result.table, metadata);
      result.targetRowCountAfterRollback = rows.length;
      result.targetAfterRollbackSha256 = digestRows(rows);
      result.targetSequencesAfterRollback = sequences;
      result.rollbackMatched = rows.length === result.targetRowCountBefore
        && result.targetAfterRollbackSha256 === result.targetBeforeSha256
        && stableJson(sequences) === stableJson(result.targetSequencesBefore);
      if (!result.rollbackMatched) throw new Error(`target_rollback_mismatch:${result.table}`);
    }
  }

  await source.query('rollback');
  sourceTransactionOpen = false;

  const evidence = {
    schemaVersion: TRANSFER_MODE === 'promote'
      ? 'stackr-production-catalogue-data-promotion-evidence-v1.6.0'
      : 'stackr-staging-catalogue-transfer-evidence-v1.6.0',
    capturedAt: new Date().toISOString(),
    sourceCommitHash: process.env.GITHUB_SHA ?? null,
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: TARGET_PROJECT_REF,
    productionProjectRef: PRODUCTION_PROJECT_REF,
    sourceReadOnly: true,
    productionMutationPerformed: TRANSFER_MODE === 'promote' && !targetAlreadyMatched,
    stagingMutationPerformed: false,
    isolatedCandidateMutationPerformed: TRANSFER_MODE === 'commit',
    targetTransactionCommitted: TRANSFER_MODE !== 'rehearse',
    transferPolicy: TRANSFER_MODE === 'promote' && targetAlreadyMatched
      ? 'verify_allowlisted_production_catalogue_already_matches_without_mutation'
      : TRANSFER_MODE === 'promote'
      ? 'upsert_allowlisted_production_catalogue_rows_preserve_target_only_rows_source_identity_and_project_declared_private_provenance_references'
      : TRANSFER_MODE === 'commit'
      ? 'replace_allowlisted_isolated_candidate_tables_with_canonical_staging_rows'
      : SOURCE_IDENTITY_POLICY === 'preserve_by_code'
      ? 'rehearse_allowlisted_catalogue_rows_preserve_target_source_identity_and_project_declared_private_provenance_references'
      : 'replace_allowlisted_target_tables_with_source_rows_in_rollback_only_transaction',
    sourceIdentityPolicy: SOURCE_IDENTITY_POLICY,
    targetRollbackVerified: TRANSFER_MODE === 'rehearse'
      ? results.every((result) => result.rollbackMatched)
      : null,
    targetCommitVerified: TRANSFER_MODE !== 'rehearse'
      ? targetCommitSucceeded && results.every((result) => result.targetPreCommitVerified)
      : null,
    targetAlreadyMatched,
    catalogueRelease: TRANSFER_MODE === 'promote'
      ? {
          versionLabels: CATALOGUE_RELEASE_LABELS,
          requiredLanguages: REQUIRED_CATALOGUE_LANGUAGES,
          sourceVersionIds: sourceReleaseVersions.map((row) => row.id),
          releaseVersionSha256: digestRows(sourceReleaseVersions),
          productionAssetUrlRewriteCount,
          productionAssetTimestampReuseCount,
        }
      : null,
    sourceIdentityPreservation: sourceIdentityPlan
      ? {
          table: SOURCE_IDENTITY_TABLE,
          naturalKey: 'code',
          sourceCount: sourceIdentityPlan.sourceCount,
          preservedProductionSourceIdCount:
            sourceIdentityPlan.preservedProductionSourceIdCount,
          remappedSourceIdCount: sourceIdentityPlan.remappedSourceIdCount,
          insertedSourceCount: sourceIdentityPlan.insertedSourceCount,
          preservedTargetOnlySourceCount: sourceIdentityPlan.preservedTargetOnlyRows.length,
          remappedForeignKeyRowCount: results.reduce(
            (sum, result) => sum + result.sourceIdentityForeignKeyRemappedRowCount,
            0,
          ),
        }
      : null,
    excludedParentReferenceProjection: {
      foreignKeyCount: results.reduce(
        (sum, result) => sum + result.excludedParentReferenceForeignKeys.length,
        0,
      ),
      projectedRowCount: results.reduce(
        (sum, result) => sum + result.excludedParentReferenceProjectedRowCount,
        0,
      ),
      projectedValueCount: results.reduce(
        (sum, result) => sum + result.excludedParentReferenceProjectedValueCount,
        0,
      ),
    },
    selectedTableCount: results.length,
    sourceRowCount: results.reduce((sum, result) => sum + result.sourceRowCount, 0),
    matchedSourceRowCount: results.reduce((sum, result) => sum + result.matchedSourceRowCount, 0),
    preservedTargetOnlyRowCount: TRANSFER_MODE === 'promote'
      ? results.reduce((sum, result) => (
          sum + result.productionTargetOnlyRowCountPreserved
        ), 0)
      : null,
    assetIdentityPreservation: assetIdentityPlan
      ? {
          table: ASSET_TABLE,
          naturalKey: 'asset_id',
          sourceCount: assetIdentityPlan.sourceCount,
          sourceStableAssetIdCount: assetIdentityPlan.sourceStableAssetIdCount,
          preservedProductionAssetIdCount:
            assetIdentityPlan.preservedProductionAssetIdCount,
          remappedAssetIdCount: assetIdentityPlan.remappedAssetIdCount,
          insertedAssetCount: assetIdentityPlan.insertedAssetCount,
          preservedTargetOnlyAssetCount: assetIdentityPlan.preservedTargetOnlyRows.length,
          remappedForeignKeyRowCount: results.reduce(
            (sum, result) => sum + result.assetIdentityForeignKeyRemappedRowCount,
            0,
          ),
        }
      : null,
    tables: results,
    excludedChecks,
    excludedStagingProjections: tableConfig.excludedStagingProjections,
    excludedEmptyStagingOnlyTables: tableConfig.excludedEmptyStagingOnlyTables,
    rawSourceRecordHistory: {
      ...rawRecordDuplicates,
      legacyIdentityIndexPresent: legacyRawRecordIdentityIndexPresent,
      importRunIdentityIndexPresent: importRunRawRecordIdentityIndexPresent,
    },
  };
  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    selectedTableCount: evidence.selectedTableCount,
    sourceRowCount: evidence.sourceRowCount,
    matchedSourceRowCount: evidence.matchedSourceRowCount,
    targetRollbackVerified: evidence.targetRollbackVerified,
    targetCommitVerified: evidence.targetCommitVerified,
    targetAlreadyMatched: evidence.targetAlreadyMatched,
    productionMutationPerformed: evidence.productionMutationPerformed,
    transferPolicy: evidence.transferPolicy,
  })}\n`);
} finally {
  if (targetTransactionOpen) await target.query('rollback').catch(() => {});
  if (sourceTransactionOpen) await source.query('rollback').catch(() => {});
  await Promise.allSettled([source.end(), target.end()]);
}
