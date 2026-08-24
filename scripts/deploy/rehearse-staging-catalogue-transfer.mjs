import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { normalizePostgresUrl } from './prepare-postgres-urls.mjs';

const { Client } = pg;
const SOURCE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const TARGET_PROJECT_REF = process.env.SUPABASE_RESTORE_PROJECT_REF;
const PRODUCTION_PROJECT_REF = process.env.SUPABASE_PRODUCTION_PROJECT_REF;
const SOURCE_DB_URL = process.env.STACKR_SOURCE_DB_URL;
const TARGET_DB_URL = process.env.STACKR_RESTORE_DB_URL;
const EVIDENCE_PATH = process.env.STACKR_TRANSFER_EVIDENCE_PATH;
const TRANSFER_MODE = process.env.STACKR_TRANSFER_MODE ?? 'rehearse';
const TRANSFER_CONFIRMATION = process.env.STACKR_TRANSFER_CONFIRMATION;
const CATALOGUE_RELEASE_LABEL = process.env.STACKR_CATALOGUE_RELEASE_LABEL ?? null;
const REQUIRED_CATALOGUE_LANGUAGES = String(
  process.env.STACKR_REQUIRED_CATALOGUE_LANGUAGES ?? 'en,ja,zh-tw,zh-cn',
).split(',').map((value) => value.trim()).filter(Boolean);
const TABLE_CONFIG_PATH = process.env.STACKR_TRANSFER_TABLE_CONFIG
  ?? 'deploy/staging-catalogue-preservation-tables.json';
const SHARED_STORAGE_OBJECT_INDEX_SQL = `
create index assets_storage_object_idx
  on catalog.assets(storage_provider, storage_bucket, storage_key)
  where storage_key is not null and deleted_at is null;
`;
const SHARED_STORAGE_OBJECT_FUNCTION_SQL = `
create or replace function catalog.enforce_shared_asset_storage_object_identity()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  conflicting_asset_id uuid;
begin
  if new.storage_key is null or new.deleted_at is not null then
    return new;
  end if;

  if new.storage_provider is null
     or new.storage_bucket is null
     or new.content_sha256 is null
     or new.mime_type is null
     or new.byte_size is null
  then
    raise exception using
      errcode = '23514',
      message = 'Active shared catalogue Storage references require provider, bucket, SHA-256, MIME type, and byte size.';
  end if;

  select existing.id
  into conflicting_asset_id
  from catalog.assets existing
  where existing.id <> new.id
    and existing.deleted_at is null
    and existing.storage_provider = new.storage_provider
    and existing.storage_bucket = new.storage_bucket
    and existing.storage_key = new.storage_key
    and (
      existing.asset_type is distinct from new.asset_type
      or existing.url is distinct from new.url
      or existing.storage_path is distinct from new.storage_path
      or existing.content_sha256 is distinct from new.content_sha256
      or existing.sha256 is distinct from new.sha256
      or existing.perceptual_hash is distinct from new.perceptual_hash
      or existing.mime_type is distinct from new.mime_type
      or existing.width is distinct from new.width
      or existing.height is distinct from new.height
      or existing.byte_size is distinct from new.byte_size
      or existing.derivative_list is distinct from new.derivative_list
      or existing.cache_control is distinct from new.cache_control
      or existing.archival_storage_key is distinct from new.archival_storage_key
    )
  limit 1;

  if conflicting_asset_id is not null then
    raise exception using
      errcode = '23514',
      message = format(
        'Catalogue asset %s conflicts with asset %s for shared Storage object %s/%s',
        new.id,
        conflicting_asset_id,
        new.storage_bucket,
        new.storage_key
      );
  end if;

  return new;
end
$function$;
`;
const SHARED_STORAGE_OBJECT_TRIGGER_SQL = `
create trigger enforce_shared_asset_storage_object_identity
before insert or update of
  asset_type,
  url,
  storage_provider,
  storage_bucket,
  storage_key,
  storage_path,
  content_sha256,
  sha256,
  perceptual_hash,
  mime_type,
  width,
  height,
  byte_size,
  derivative_list,
  cache_control,
  archival_storage_key,
  deleted_at
on catalog.assets
for each row
execute function catalog.enforce_shared_asset_storage_object_identity();
`;

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
let NORMALIZED_SOURCE_DB_URL;
let NORMALIZED_TARGET_DB_URL;
try {
  NORMALIZED_SOURCE_DB_URL = normalizePostgresUrl(SOURCE_DB_URL, SOURCE_PROJECT_REF).normalized;
} catch (error) {
  throw new Error(`source_database_url_invalid:${error.message}`);
}
try {
  NORMALIZED_TARGET_DB_URL = normalizePostgresUrl(TARGET_DB_URL, TARGET_PROJECT_REF).normalized;
} catch (error) {
  throw new Error(`target_database_url_invalid:${error.message}`);
}
if (!['rehearse', 'commit', 'promote'].includes(TRANSFER_MODE)) throw new Error('invalid_transfer_mode');
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
  if (!CATALOGUE_RELEASE_LABEL) throw new Error('catalogue_release_label_missing');
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

function adoptedMigrationVersions() {
  if (!Array.isArray(tableConfig.adoptedMigrations) || tableConfig.adoptedMigrations.length === 0) {
    throw new Error('adopted_migrations_missing');
  }
  const versions = new Set();
  for (const migration of tableConfig.adoptedMigrations) {
    if (!/^\d{14}$/.test(migration?.version ?? '') || !/^[a-z0-9_]+$/.test(migration?.name ?? '')) {
      throw new Error('adopted_migration_config_invalid');
    }
    if (versions.has(migration.version)) throw new Error(`adopted_migration_version_duplicate:${migration.version}`);
    versions.add(migration.version);
  }
  return tableConfig.adoptedMigrations;
}

async function migrationRows(client, migrations) {
  return (await client.query(`
    select version::text as version, statements, name
    from supabase_migrations.schema_migrations
    where version::text = any($1::text[])
    order by version, name
  `, [migrations.map((migration) => migration.version)])).rows;
}

function verifyAdoptedMigrationRows(rows, migrations, context) {
  if (rows.length !== migrations.length) throw new Error(`${context}_adopted_migration_count_mismatch`);
  const expectedByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const seen = new Set();
  for (const row of rows) {
    const expected = expectedByVersion.get(row.version);
    if (!expected || seen.has(row.version)) throw new Error(`${context}_adopted_migration_extra:${row.version}`);
    if (row.name !== expected.name) throw new Error(`${context}_adopted_migration_name_mismatch:${row.version}`);
    seen.add(row.version);
  }
  if (seen.size !== migrations.length) throw new Error(`${context}_adopted_migration_missing`);
}

function sameMigrationRows(left, right) {
  return digestRows(left) === digestRows(right);
}

async function sharedStorageObjectContract(client, context) {
  const index = await client.query(`
    select pg_get_indexdef(index_class.oid) as definition
    from pg_class index_class
    join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
    join pg_index on pg_index.indexrelid = index_class.oid
    where index_namespace.nspname = 'catalog'
      and index_class.relname = 'assets_storage_object_idx'
      and pg_index.indrelid = 'catalog.assets'::regclass
      and pg_index.indisvalid
  `);
  const fn = await client.query(`
    select
      procedure.oid,
      pg_get_functiondef(procedure.oid) as definition,
      has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute,
      coalesce((
        select bool_or(acl.privilege_type = 'EXECUTE')
        from aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) acl
        where acl.grantee = 0
      ), false) as public_execute,
      has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'catalog'
      and procedure.proname = 'enforce_shared_asset_storage_object_identity'
      and pg_get_function_identity_arguments(procedure.oid) = ''
  `);
  if (index.rowCount !== 1 || fn.rowCount !== 1) {
    throw new Error(`${context}_shared_storage_object_identity_missing`);
  }
  const trigger = await client.query(`
    select trigger.tgname as name, pg_get_triggerdef(trigger.oid) as definition
    from pg_trigger trigger
    where trigger.tgrelid = 'catalog.assets'::regclass
      and trigger.tgfoid = $1
      and not trigger.tgisinternal
  `, [fn.rows[0].oid]);
  if (trigger.rowCount !== 1 || trigger.rows[0].name !== 'enforce_shared_asset_storage_object_identity') {
    throw new Error(`${context}_shared_storage_object_trigger_identity_invalid`);
  }

  const contract = {
    indexDefinition: index.rows[0].definition,
    functionDefinition: fn.rows[0].definition,
    triggerName: trigger.rows[0].name,
    triggerDefinition: trigger.rows[0].definition,
    serviceRoleExecute: fn.rows[0].service_role_execute,
    publicExecute: fn.rows[0].public_execute,
    anonExecute: fn.rows[0].anon_execute,
    authenticatedExecute: fn.rows[0].authenticated_execute,
  };
  if (!contract.serviceRoleExecute || contract.publicExecute || contract.anonExecute || contract.authenticatedExecute) {
    throw new Error(`${context}_shared_storage_object_function_privileges_invalid`);
  }
  return contract;
}

async function sharedStorageObjectState(client) {
  const indexes = await client.query(`
    select index_class.relname as name, pg_get_indexdef(index_class.oid) as definition
    from pg_class index_class
    join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
    join pg_index on pg_index.indexrelid = index_class.oid
    where index_namespace.nspname = 'catalog'
      and pg_index.indrelid = 'catalog.assets'::regclass
      and index_class.relname in ('assets_storage_object_uidx', 'assets_storage_object_idx')
    order by index_class.relname
  `);
  const functions = await client.query(`
    select
      procedure.oid,
      pg_get_functiondef(procedure.oid) as definition,
      has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute,
      coalesce((
        select bool_or(acl.privilege_type = 'EXECUTE')
        from aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) acl
        where acl.grantee = 0
      ), false) as public_execute,
      has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'catalog'
      and procedure.proname = 'enforce_shared_asset_storage_object_identity'
      and pg_get_function_identity_arguments(procedure.oid) = ''
    order by procedure.oid
  `);
  const triggers = await client.query(`
    select trigger.tgname as name, pg_get_triggerdef(trigger.oid) as definition
    from pg_trigger trigger
    join pg_proc procedure on procedure.oid = trigger.tgfoid
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where trigger.tgrelid = 'catalog.assets'::regclass
      and namespace.nspname = 'catalog'
      and procedure.proname = 'enforce_shared_asset_storage_object_identity'
      and pg_get_function_identity_arguments(procedure.oid) = ''
      and not trigger.tgisinternal
    order by trigger.tgname
  `);
  return { indexes: indexes.rows, functions: functions.rows, triggers: triggers.rows };
}

async function replaceSharedStorageObjectContract(client) {
  await client.query('drop index if exists catalog.assets_storage_object_uidx');
  await client.query('drop index if exists catalog.assets_storage_object_idx');
  await client.query(SHARED_STORAGE_OBJECT_FUNCTION_SQL);
  await client.query('drop trigger if exists enforce_shared_asset_storage_object_identity on catalog.assets');
  await client.query(SHARED_STORAGE_OBJECT_INDEX_SQL);
  await client.query(SHARED_STORAGE_OBJECT_TRIGGER_SQL);
  await client.query('revoke all on function catalog.enforce_shared_asset_storage_object_identity() from public, anon, authenticated');
  await client.query('grant execute on function catalog.enforce_shared_asset_storage_object_identity() to service_role');
}

async function sharedStorageObjectDataInvariant(client, context) {
  const result = (await client.query(`
    with active_storage_assets as (
      select *
      from catalog.assets
      where storage_key is not null
        and deleted_at is null
    ), invalid_required_metadata as (
      select count(*)::integer as row_count
      from active_storage_assets
      where storage_provider is null
         or storage_bucket is null
         or content_sha256 is null
         or mime_type is null
         or byte_size is null
    ), conflicting_shared_objects as (
      select count(*)::integer as group_count
      from (
        select storage_provider, storage_bucket, storage_key
        from active_storage_assets
        group by storage_provider, storage_bucket, storage_key
        having count(distinct jsonb_build_array(
          asset_type,
          url,
          storage_path,
          content_sha256,
          sha256,
          perceptual_hash,
          mime_type,
          width,
          height,
          byte_size,
          derivative_list,
          cache_control,
          archival_storage_key
        )) > 1
      ) conflicts
    )
    select
      (select row_count from invalid_required_metadata) as invalid_required_metadata_count,
      (select group_count from conflicting_shared_objects) as conflicting_shared_object_count
  `)).rows[0];
  if (result.invalid_required_metadata_count !== 0
      || result.conflicting_shared_object_count !== 0) {
    throw new Error(
      `${context}_shared_storage_object_data_invalid`
      + `:metadata_${result.invalid_required_metadata_count}`
      + `:conflicts_${result.conflicting_shared_object_count}`,
    );
  }
  return result;
}

async function connect(connectionString, applicationName) {
  const client = new Client({ connectionString, application_name: applicationName });
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

function keyForRow(row, primaryKey) {
  return stableJson(primaryKey.map((column) => row[column]));
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

async function setUserTriggersEnabled(client, tableName, enabled) {
  await client.query(
    `alter table ${qualifiedName(tableName)} ${enabled ? 'enable' : 'disable'} trigger user`,
  );
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
  if (!CATALOGUE_RELEASE_LABEL) return [];
  return (await client.query(`
    select id, version_key, version_label, language_code, status, coverage_summary
    from catalog.catalogue_versions
    where version_label = $1
    order by language_code, id
  `, [CATALOGUE_RELEASE_LABEL])).rows;
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

function expectedFinalRows(tableName, sourceRows, promotionTimestamp) {
  if (TRANSFER_MODE !== 'promote' || tableName !== 'catalog.assets') return sourceRows;
  return sourceRows.map((row) => {
    const shouldRewrite = row.storage_provider === 'supabase_storage'
      && row.storage_bucket === 'stackr-catalogue-public'
      && typeof row.url === 'string'
      && row.url.includes(SOURCE_PROJECT_REF);
    if (!shouldRewrite) return row;
    return {
      ...row,
      url: row.url.replaceAll(SOURCE_PROJECT_REF, TARGET_PROJECT_REF),
      updated_at: promotionTimestamp,
    };
  });
}

const source = await connect(NORMALIZED_SOURCE_DB_URL, 'stackr-staging-catalogue-source');
const target = await connect(NORMALIZED_TARGET_DB_URL, 'stackr-staging-catalogue-rehearsal');
const results = [];
const excludedChecks = [];
const snapshots = new Map();
let targetTransactionOpen = false;
let sourceTransactionOpen = false;
let sourceReleaseVersions = [];
let adoptedMigrations = [];
let sourceAdoptedMigrationRows = [];
let targetAdoptedMigrationRowsBefore = [];
let adoptedMigrationInsertCount = 0;
let adoptedMigrationCommitVerified = null;
let adoptedMigrationRollbackVerified = null;
let sourceSharedStorageObjectContract = null;
let sourceSharedStorageObjectDataInvariant = null;
let targetSharedStorageObjectStateBefore = null;
let targetSharedStorageObjectDataInvariant = null;
let sharedStorageObjectTransferFingerprint = null;
let sharedStorageObjectCommitVerified = null;
let sharedStorageObjectRollbackVerified = null;
let targetReleaseVersions = [];
let productionAssetUrlRewriteCount = 0;
let productionAssetUrlRewriteAt = null;
let preCommitAcceptanceVerified = false;

try {
  await source.query('begin transaction isolation level repeatable read read only');
  sourceTransactionOpen = true;
  await target.query('begin transaction isolation level repeatable read');
  targetTransactionOpen = true;

  adoptedMigrations = adoptedMigrationVersions();
  sourceAdoptedMigrationRows = await migrationRows(source, adoptedMigrations);
  verifyAdoptedMigrationRows(sourceAdoptedMigrationRows, adoptedMigrations, 'source');
  targetAdoptedMigrationRowsBefore = await migrationRows(target, adoptedMigrations);
  sourceSharedStorageObjectContract = await sharedStorageObjectContract(source, 'source');
  sourceSharedStorageObjectDataInvariant = await sharedStorageObjectDataInvariant(source, 'source');
  targetSharedStorageObjectStateBefore = await sharedStorageObjectState(target);

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

  for (const tableName of tableConfig.tables) {
    const sourceMetadata = await tableMetadata(source, tableName);
    const targetMetadata = await tableMetadata(target, tableName);
    const contract = compatibleTableContract(tableName, sourceMetadata, targetMetadata);

    const sourceRows = await readRows(source, tableName, sourceMetadata.primaryKey);
    const targetRowsBefore = await readRows(target, tableName, targetMetadata.primaryKey);
    const targetSequencesBefore = await ownedSequenceStates(target, tableName, targetMetadata);
    snapshots.set(tableName, {
      sourceMetadata,
      targetMetadata,
      sourceRows,
      targetRowsBefore,
      targetSequencesBefore,
      contract,
    });
  }

  for (const tableName of [...tableConfig.tables].reverse()) {
    if (tableName === 'catalog.assets') {
      await replaceSharedStorageObjectContract(target);
      const targetContract = await sharedStorageObjectContract(target, 'target');
      sharedStorageObjectTransferFingerprint = digestRows([targetContract]);
      if (digestRows([targetContract]) !== digestRows([sourceSharedStorageObjectContract])) {
        throw new Error('target_shared_storage_object_contract_mismatch');
      }
    }
    await setUserTriggersEnabled(target, tableName, false);
    await target.query(`delete from ${qualifiedName(tableName)}`);
    await setUserTriggersEnabled(target, tableName, true);
  }

  for (const tableName of tableConfig.tables) {
    const snapshot = snapshots.get(tableName);
    const {
      sourceMetadata,
      targetMetadata,
      sourceRows,
      targetRowsBefore,
      targetSequencesBefore,
      contract,
    } = snapshot;
    const targetRowsAfterClear = await readRows(target, tableName, targetMetadata.primaryKey);
    if (targetRowsAfterClear.length !== 0) throw new Error(`target_table_not_cleared:${tableName}`);

    await setUserTriggersEnabled(target, tableName, false);
    await insertRows(target, tableName, targetMetadata, contract.transferColumns, sourceRows);
    await restartOwnedSequences(target, tableName, targetMetadata, sourceRows);
    await setUserTriggersEnabled(target, tableName, true);
    const targetRowsAfter = await readRows(
      target,
      tableName,
      targetMetadata.primaryKey,
      contract.transferColumns,
    );
    const targetSequencesDuringRehearsal = await ownedSequenceStates(target, tableName, targetMetadata);
    const matchedRows = verifySourceRows(
      tableName,
      sourceRows,
      targetRowsAfter,
      sourceMetadata.primaryKey,
    );

    results.push({
      table: tableName,
      primaryKey: sourceMetadata.primaryKey,
      transferColumns: contract.transferColumns,
      targetOnlyColumns: contract.targetOnlyColumns,
      sourceRowCount: sourceRows.length,
      targetRowCountBefore: targetRowsBefore.length,
      targetRowCountAfterClear: targetRowsAfterClear.length,
      targetRowCountDuringRehearsal: targetRowsAfter.length,
      matchedSourceRowCount: matchedRows.length,
      sourceSha256: digestRows(sourceRows),
      matchedTargetSha256: digestRows(matchedRows),
      targetBeforeSha256: digestRows(targetRowsBefore),
      targetSequencesBefore,
      targetSequencesDuringRehearsal,
    });
  }

  const sourceAdoptedByVersion = new Map(
    sourceAdoptedMigrationRows.map((row) => [row.version, row]),
  );
  for (const targetRow of targetAdoptedMigrationRowsBefore) {
    const sourceRow = sourceAdoptedByVersion.get(targetRow.version);
    if (!sourceRow || targetRow.name !== sourceRow.name
      || stableJson(targetRow.statements) !== stableJson(sourceRow.statements)) {
      throw new Error(`target_adopted_migration_conflict:${targetRow.version}`);
    }
  }
  const targetAdoptedVersions = new Set(targetAdoptedMigrationRowsBefore.map((row) => row.version));
  for (const sourceRow of sourceAdoptedMigrationRows) {
    if (targetAdoptedVersions.has(sourceRow.version)) continue;
    await target.query(
      `insert into supabase_migrations.schema_migrations (version, statements, name)
       values ($1, $2, $3)`,
      [sourceRow.version, sourceRow.statements, sourceRow.name],
    );
    adoptedMigrationInsertCount += 1;
  }
  const targetAdoptedMigrationRowsDuringTransfer = await migrationRows(target, adoptedMigrations);
  verifyAdoptedMigrationRows(targetAdoptedMigrationRowsDuringTransfer, adoptedMigrations, 'target');
  if (!sameMigrationRows(targetAdoptedMigrationRowsDuringTransfer, sourceAdoptedMigrationRows)) {
    throw new Error('target_adopted_migration_fingerprint_mismatch');
  }

  let promotionTimestamp = null;
  if (TRANSFER_MODE === 'promote') {
    promotionTimestamp = new Date();
    productionAssetUrlRewriteAt = promotionTimestamp.toISOString();
    const expectedRewriteCount = snapshots.get('catalog.assets').sourceRows.filter((row) => (
      row.storage_provider === 'supabase_storage'
      && row.storage_bucket === 'stackr-catalogue-public'
      && typeof row.url === 'string'
      && row.url.includes(SOURCE_PROJECT_REF)
    )).length;
    const rewritten = await target.query(`
      update catalog.assets
      set url = replace(url, $1, $2), updated_at = $3
      where storage_provider = 'supabase_storage'
        and storage_bucket = 'stackr-catalogue-public'
        and url like '%' || $1 || '%'
    `, [SOURCE_PROJECT_REF, TARGET_PROJECT_REF, promotionTimestamp]);
    productionAssetUrlRewriteCount = rewritten.rowCount;
    if (productionAssetUrlRewriteCount !== expectedRewriteCount) {
      throw new Error(
        `production_asset_url_rewrite_count_mismatch`
        + `:expected_${expectedRewriteCount}:actual_${productionAssetUrlRewriteCount}`,
      );
    }
  }

  for (const result of results) {
    const snapshot = snapshots.get(result.table);
    const expectedRows = expectedFinalRows(result.table, snapshot.sourceRows, promotionTimestamp);
    snapshot.expectedFinalRows = expectedRows;
    const rows = await readRows(
      target,
      result.table,
      snapshot.targetMetadata.primaryKey,
      snapshot.contract.transferColumns,
    );
    const sequences = await ownedSequenceStates(target, result.table, snapshot.targetMetadata);
    const matchedRows = verifySourceRows(
      result.table,
      expectedRows,
      rows,
      snapshot.sourceMetadata.primaryKey,
    );
    result.expectedFinalSha256 = digestRows(expectedRows);
    result.targetRowCountBeforeFinalise = rows.length;
    result.targetBeforeFinaliseSha256 = digestRows(rows);
    result.targetSequencesBeforeFinalise = sequences;
    result.preCommitMatched = rows.length === expectedRows.length
      && matchedRows.length === expectedRows.length
      && result.targetBeforeFinaliseSha256 === result.expectedFinalSha256
      && stableJson(sequences) === stableJson(result.targetSequencesDuringRehearsal);
    if (!result.preCommitMatched) throw new Error(`target_precommit_mismatch:${result.table}`);
  }

  const targetAdoptedMigrationRowsBeforeFinalise = await migrationRows(target, adoptedMigrations);
  verifyAdoptedMigrationRows(
    targetAdoptedMigrationRowsBeforeFinalise,
    adoptedMigrations,
    'target_precommit',
  );
  if (!sameMigrationRows(targetAdoptedMigrationRowsBeforeFinalise, sourceAdoptedMigrationRows)) {
    throw new Error('target_adopted_migration_precommit_mismatch');
  }
  const targetContractBeforeFinalise = await sharedStorageObjectContract(target, 'target_precommit');
  if (digestRows([targetContractBeforeFinalise]) !== digestRows([sourceSharedStorageObjectContract])) {
    throw new Error('target_shared_storage_object_precommit_mismatch');
  }
  targetSharedStorageObjectDataInvariant = await sharedStorageObjectDataInvariant(
    target,
    'target_precommit',
  );

  if (TRANSFER_MODE === 'promote') {
    targetReleaseVersions = verifyReleaseCatalogueVersions(
      await releaseCatalogueVersions(target),
      'target_precommit',
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

  preCommitAcceptanceVerified = true;
  if (TRANSFER_MODE !== 'rehearse') await target.query('commit');
  else await target.query('rollback');
  targetTransactionOpen = false;

  for (const result of results) {
    const metadata = await tableMetadata(target, result.table);
    const snapshot = snapshots.get(result.table);
    const rows = await readRows(
      target,
      result.table,
      metadata.primaryKey,
      TRANSFER_MODE !== 'rehearse' ? snapshot.contract.transferColumns : null,
    );
    const sequences = await ownedSequenceStates(target, result.table, metadata);
    if (TRANSFER_MODE !== 'rehearse') {
      result.targetRowCountAfterCommit = rows.length;
      result.targetAfterCommitSha256 = digestRows(rows);
      result.targetSequencesAfterCommit = sequences;
      result.commitMatched = rows.length === snapshot.expectedFinalRows.length
        && result.targetAfterCommitSha256 === result.expectedFinalSha256
        && stableJson(sequences) === stableJson(result.targetSequencesDuringRehearsal);
      if (!result.commitMatched) throw new Error(`target_postcommit_observation_mismatch:${result.table}`);
    } else {
      result.targetRowCountAfterRollback = rows.length;
      result.targetAfterRollbackSha256 = digestRows(rows);
      result.targetSequencesAfterRollback = sequences;
      result.rollbackMatched = rows.length === result.targetRowCountBefore
        && result.targetAfterRollbackSha256 === result.targetBeforeSha256
        && stableJson(sequences) === stableJson(result.targetSequencesBefore);
      if (!result.rollbackMatched) throw new Error(`target_rollback_mismatch:${result.table}`);
    }
  }

  const targetAdoptedMigrationRowsAfter = await migrationRows(target, adoptedMigrations);
  if (TRANSFER_MODE !== 'rehearse') {
    verifyAdoptedMigrationRows(targetAdoptedMigrationRowsAfter, adoptedMigrations, 'target_commit');
    adoptedMigrationCommitVerified = sameMigrationRows(
      targetAdoptedMigrationRowsAfter,
      sourceAdoptedMigrationRows,
    );
    if (!adoptedMigrationCommitVerified) throw new Error('target_adopted_migration_commit_mismatch');
    const targetContract = await sharedStorageObjectContract(target, 'target_commit');
    sharedStorageObjectCommitVerified = digestRows([targetContract])
      === digestRows([sourceSharedStorageObjectContract]);
    if (!sharedStorageObjectCommitVerified) throw new Error('target_shared_storage_object_commit_mismatch');
    await sharedStorageObjectDataInvariant(target, 'target_commit');
    if (TRANSFER_MODE === 'promote') {
      const committedReleaseVersions = verifyReleaseCatalogueVersions(
        await releaseCatalogueVersions(target),
        'target_commit',
      );
      if (digestRows(committedReleaseVersions) !== digestRows(sourceReleaseVersions)) {
        throw new Error('production_release_versions_postcommit_mismatch');
      }
    }
  } else {
    adoptedMigrationRollbackVerified = sameMigrationRows(
      targetAdoptedMigrationRowsAfter,
      targetAdoptedMigrationRowsBefore,
    );
    if (!adoptedMigrationRollbackVerified) throw new Error('target_adopted_migration_rollback_mismatch');
    const targetState = await sharedStorageObjectState(target);
    sharedStorageObjectRollbackVerified = digestRows([targetState])
      === digestRows([targetSharedStorageObjectStateBefore]);
    if (!sharedStorageObjectRollbackVerified) throw new Error('target_shared_storage_object_rollback_mismatch');
  }

  await source.query('rollback');
  sourceTransactionOpen = false;

  const evidence = {
    schemaVersion: TRANSFER_MODE === 'promote'
      ? 'stackr-production-catalogue-data-promotion-evidence-v1.1.0'
      : 'stackr-staging-catalogue-transfer-evidence-v1.5.0',
    capturedAt: new Date().toISOString(),
    sourceCommitHash: process.env.GITHUB_SHA ?? null,
    sourceProjectRef: SOURCE_PROJECT_REF,
    targetProjectRef: TARGET_PROJECT_REF,
    productionProjectRef: PRODUCTION_PROJECT_REF,
    sourceReadOnly: true,
    productionMutationPerformed: TRANSFER_MODE === 'promote',
    stagingMutationPerformed: false,
    isolatedCandidateMutationPerformed: TRANSFER_MODE === 'commit',
    targetTransactionCommitted: TRANSFER_MODE !== 'rehearse',
    preCommitAcceptanceVerified,
    transferPolicy: TRANSFER_MODE === 'promote'
      ? 'replace_allowlisted_production_catalogue_tables_with_verified_staging_release_rows'
      : TRANSFER_MODE === 'commit'
      ? 'replace_allowlisted_isolated_candidate_tables_with_canonical_staging_rows'
      : 'replace_allowlisted_target_tables_with_source_rows_in_rollback_only_transaction',
    targetRollbackVerified: TRANSFER_MODE === 'rehearse'
      ? results.every((result) => result.rollbackMatched)
      : null,
    targetCommitVerified: TRANSFER_MODE !== 'rehearse'
      ? results.every((result) => result.commitMatched)
      : null,
    catalogueRelease: TRANSFER_MODE === 'promote'
      ? {
          versionLabel: CATALOGUE_RELEASE_LABEL,
          requiredLanguages: REQUIRED_CATALOGUE_LANGUAGES,
          sourceVersionIds: sourceReleaseVersions.map((row) => row.id),
          releaseVersionSha256: digestRows(sourceReleaseVersions),
          promotionScope: 'complete_allowlisted_catalogue_snapshot',
          productionAssetUrlRewriteCount,
          productionAssetUrlRewriteAt,
        }
      : null,
    selectedTableCount: results.length,
    sourceRowCount: results.reduce((sum, result) => sum + result.sourceRowCount, 0),
    matchedSourceRowCount: results.reduce((sum, result) => sum + result.matchedSourceRowCount, 0),
    tables: results,
    excludedChecks,
    excludedStagingProjections: tableConfig.excludedStagingProjections,
    excludedEmptyStagingOnlyTables: tableConfig.excludedEmptyStagingOnlyTables,
    rawSourceRecordHistory: {
      ...rawRecordDuplicates,
      legacyIdentityIndexPresent: legacyRawRecordIdentityIndexPresent,
      importRunIdentityIndexPresent: importRunRawRecordIdentityIndexPresent,
    },
    migrationProvenance: {
      configuredCount: adoptedMigrations.length,
      insertedCount: adoptedMigrationInsertCount,
      sourceMigrationFingerprint: digestRows(sourceAdoptedMigrationRows),
      sourceMigrations: sourceAdoptedMigrationRows.map((row) => ({
        version: row.version,
        name: row.name,
        statementsSha256: digestRows([row.statements]),
      })),
      targetCommitVerified: adoptedMigrationCommitVerified,
      targetRollbackVerified: adoptedMigrationRollbackVerified,
    },
    sharedStorageObjectSchemaContract: {
      sourceFingerprint: digestRows([sourceSharedStorageObjectContract]),
      targetBeforeFingerprint: digestRows([targetSharedStorageObjectStateBefore]),
      targetTransferFingerprint: sharedStorageObjectTransferFingerprint,
      targetCommitVerified: sharedStorageObjectCommitVerified,
      targetRollbackVerified: sharedStorageObjectRollbackVerified,
      sourceDataInvariant: sourceSharedStorageObjectDataInvariant,
      targetDataInvariant: targetSharedStorageObjectDataInvariant,
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
  })}\n`);
} finally {
  if (targetTransactionOpen) await target.query('rollback').catch(() => {});
  if (sourceTransactionOpen) await source.query('rollback').catch(() => {});
  await Promise.allSettled([source.end(), target.end()]);
}
