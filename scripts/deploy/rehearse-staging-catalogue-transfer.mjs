import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { connectPostgresWithRetry } from './postgres-initial-connection.mjs';
import { normalizePostgresUrl } from './prepare-postgres-urls.mjs';
import {
  RAW_SOURCE_RECORD_COPY_BATCH_MAX_BYTES,
  RAW_SOURCE_RECORD_TABLE,
  captureRawSourceRecordIndexes,
  copyRawSourceRecordRows,
  dropRawSourceRecordIndexes,
  resetRawSourceRecordCopyStagePreparation,
  restoreRawSourceRecordIndexes,
  verifyRawSourceRecordIndexes,
} from './raw-source-record-bulk-load.mjs';

const SOURCE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const TARGET_PROJECT_REF = process.env.SUPABASE_RESTORE_PROJECT_REF;
const PRODUCTION_PROJECT_REF = process.env.SUPABASE_PRODUCTION_PROJECT_REF;
const SOURCE_DB_URL = process.env.STACKR_SOURCE_DB_URL;
const TARGET_DB_URL = process.env.STACKR_RESTORE_DB_URL;
const EVIDENCE_PATH = process.env.STACKR_TRANSFER_EVIDENCE_PATH;
const TRANSFER_MODE = process.env.STACKR_TRANSFER_MODE ?? 'rehearse';
const TRANSFER_STATEMENT_TIMEOUT_MS = Number(
  process.env.STACKR_TRANSFER_STATEMENT_TIMEOUT_MS ?? 900_000,
);
const TRANSFER_ROW_BATCH_SIZE = Number(
  process.env.STACKR_TRANSFER_ROW_BATCH_SIZE ?? 250,
);
const INITIAL_CONNECTION_ATTEMPTS = Number(
  process.env.STACKR_TRANSFER_INITIAL_CONNECTION_ATTEMPTS ?? 1,
);
const INITIAL_CONNECTION_RETRY_DELAY_MS = Number(
  process.env.STACKR_TRANSFER_INITIAL_CONNECTION_RETRY_DELAY_MS ?? 0,
);
const REQUIRE_EMPTY_BASELINE_TARGET_RAW =
  process.env.STACKR_TRANSFER_REQUIRE_EMPTY_BASELINE_TARGET ?? 'false';
const REQUIRE_EMPTY_BASELINE_TARGET = REQUIRE_EMPTY_BASELINE_TARGET_RAW === 'true';
const RESUME_FROM_VERIFIED_BASELINE_RAW =
  process.env.STACKR_TRANSFER_RESUME_FROM_VERIFIED_BASELINE ?? 'false';
const RESUME_FROM_VERIFIED_BASELINE = RESUME_FROM_VERIFIED_BASELINE_RAW === 'true';
const BASELINE_MIGRATION_HISTORY_PATH =
  process.env.STACKR_TRANSFER_BASELINE_MIGRATION_HISTORY_PATH ?? null;
const DEFER_TARGET_DIGEST_UNTIL_PRECOMMIT_RAW =
  process.env.STACKR_TRANSFER_DEFER_TARGET_DIGEST_UNTIL_PRECOMMIT ?? 'false';
const DEFER_TARGET_DIGEST_UNTIL_PRECOMMIT =
  DEFER_TARGET_DIGEST_UNTIL_PRECOMMIT_RAW === 'true';
const OPTIMIZE_RAW_SOURCE_RECORD_LOAD_RAW =
  process.env.STACKR_TRANSFER_OPTIMIZE_RAW_SOURCE_RECORD_LOAD ?? 'false';
const OPTIMIZE_RAW_SOURCE_RECORD_LOAD = OPTIMIZE_RAW_SOURCE_RECORD_LOAD_RAW === 'true';
const TARGET_SCHEMA_STABILITY_SECONDS = Number(
  process.env.STACKR_TRANSFER_TARGET_STABILITY_SECONDS ?? 0,
);
const TARGET_SCHEMA_STABILITY_MAX_WAIT_SECONDS = Number(
  process.env.STACKR_TRANSFER_TARGET_STABILITY_MAX_WAIT_SECONDS ?? 300,
);
const TARGET_MINIMUM_MIGRATION_COUNT = Number(
  process.env.STACKR_TRANSFER_TARGET_MINIMUM_MIGRATION_COUNT ?? 0,
);
const TRANSFER_CONFIRMATION = process.env.STACKR_TRANSFER_CONFIRMATION;
const TRANSFER_TARGET_PROFILE = process.env.STACKR_TRANSFER_TARGET_PROFILE
  ?? 'staging-preservation';
const CATALOGUE_RELEASE_LABEL = process.env.STACKR_CATALOGUE_RELEASE_LABEL ?? null;
const REQUIRED_CATALOGUE_LANGUAGES = String(
  process.env.STACKR_REQUIRED_CATALOGUE_LANGUAGES ?? 'en,ja,zh-tw,zh-cn',
).split(',').map((value) => value.trim()).filter(Boolean);
const TABLE_CONFIG_PATH = process.env.STACKR_TRANSFER_TABLE_CONFIG
  ?? 'deploy/staging-catalogue-preservation-tables.json';
const CATALOGUE_SELF_REFERENTIAL_FOREIGN_KEYS = [
  {
    childTable: 'catalog.series',
    constraintName: 'series_corrected_by_series_id_fkey',
    childColumns: ['corrected_by_series_id'],
    deleteAction: 'no_action',
  },
  {
    childTable: 'catalog.sets',
    constraintName: 'sets_corrected_by_set_id_fkey',
    childColumns: ['corrected_by_set_id'],
    deleteAction: 'no_action',
  },
  {
    childTable: 'catalog.card_concepts',
    constraintName: 'card_concepts_corrected_by_concept_id_fkey',
    childColumns: ['corrected_by_concept_id'],
    deleteAction: 'no_action',
  },
  {
    childTable: 'catalog.card_printings',
    constraintName: 'card_printings_corrected_by_printing_id_fkey',
    childColumns: ['corrected_by_printing_id'],
    deleteAction: 'no_action',
  },
  {
    childTable: 'catalog.card_variants',
    constraintName: 'card_variants_corrected_by_variant_id_fkey',
    childColumns: ['corrected_by_variant_id'],
    deleteAction: 'no_action',
  },
  {
    childTable: 'catalog.card_variants',
    constraintName: 'card_variants_same_artwork_as_variant_id_fkey',
    childColumns: ['same_artwork_as_variant_id'],
    deleteAction: 'set_null',
  },
  {
    childTable: 'catalog.sealed_products',
    constraintName: 'sealed_products_corrected_by_product_id_fkey',
    childColumns: ['corrected_by_product_id'],
    deleteAction: 'no_action',
  },
  {
    childTable: 'catalog.sealed_product_variants',
    constraintName: 'sealed_product_variants_corrected_by_variant_id_fkey',
    childColumns: ['corrected_by_variant_id'],
    deleteAction: 'no_action',
  },
  {
    childTable: 'catalog.catalogue_versions',
    constraintName: 'catalogue_versions_superseded_by_version_id_fkey',
    childColumns: ['superseded_by_version_id'],
    deleteAction: 'no_action',
  },
];
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
if (!Number.isInteger(TRANSFER_STATEMENT_TIMEOUT_MS)
    || TRANSFER_STATEMENT_TIMEOUT_MS < 60_000
    || TRANSFER_STATEMENT_TIMEOUT_MS > 1_200_000) {
  throw new Error('invalid_transfer_statement_timeout');
}
if (!Number.isInteger(TRANSFER_ROW_BATCH_SIZE)
    || TRANSFER_ROW_BATCH_SIZE < 1
    || TRANSFER_ROW_BATCH_SIZE > 5_000) {
  throw new Error('invalid_transfer_row_batch_size');
}
if (!Number.isInteger(INITIAL_CONNECTION_ATTEMPTS)
    || INITIAL_CONNECTION_ATTEMPTS < 1
    || INITIAL_CONNECTION_ATTEMPTS > 6) {
  throw new Error('invalid_initial_connection_attempts');
}
if (!Number.isInteger(INITIAL_CONNECTION_RETRY_DELAY_MS)
    || INITIAL_CONNECTION_RETRY_DELAY_MS < 0
    || INITIAL_CONNECTION_RETRY_DELAY_MS > 60_000) {
  throw new Error('invalid_initial_connection_retry_delay');
}
if (!['true', 'false'].includes(REQUIRE_EMPTY_BASELINE_TARGET_RAW)) {
  throw new Error('invalid_require_empty_baseline_target');
}
if (!['true', 'false'].includes(RESUME_FROM_VERIFIED_BASELINE_RAW)) {
  throw new Error('invalid_resume_from_verified_baseline');
}
if (!['true', 'false'].includes(DEFER_TARGET_DIGEST_UNTIL_PRECOMMIT_RAW)) {
  throw new Error('invalid_defer_target_digest_until_precommit');
}
if (!['true', 'false'].includes(OPTIMIZE_RAW_SOURCE_RECORD_LOAD_RAW)) {
  throw new Error('invalid_optimize_raw_source_record_load');
}
if (!Number.isInteger(TARGET_SCHEMA_STABILITY_SECONDS)
    || TARGET_SCHEMA_STABILITY_SECONDS < 0
    || TARGET_SCHEMA_STABILITY_SECONDS > 300) {
  throw new Error('invalid_target_schema_stability_seconds');
}
if (!Number.isInteger(TARGET_SCHEMA_STABILITY_MAX_WAIT_SECONDS)
    || TARGET_SCHEMA_STABILITY_MAX_WAIT_SECONDS < TARGET_SCHEMA_STABILITY_SECONDS
    || TARGET_SCHEMA_STABILITY_MAX_WAIT_SECONDS > 900) {
  throw new Error('invalid_target_schema_stability_max_wait_seconds');
}
if (!Number.isInteger(TARGET_MINIMUM_MIGRATION_COUNT)
    || TARGET_MINIMUM_MIGRATION_COUNT < 0
    || TARGET_MINIMUM_MIGRATION_COUNT > 10_000) {
  throw new Error('invalid_target_minimum_migration_count');
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
  const expectedCommitTarget = {
    'staging-preservation': 'krjttpmthxkfsbqksxci',
    'production-baseline-rehearsal': 'isfybjkwvcuqpqtmkujo',
  }[TRANSFER_TARGET_PROFILE];
  if (!expectedCommitTarget) {
    throw new Error('committed_transfer_target_profile_invalid');
  }
  if (TARGET_PROJECT_REF !== expectedCommitTarget) {
    throw new Error('committed_transfer_target_not_isolated_candidate');
  }
  if (PRODUCTION_PROJECT_REF !== 'oakdbbzdqwurpjnoqhmu') {
    throw new Error('committed_transfer_production_guard_mismatch');
  }
}
if (INITIAL_CONNECTION_ATTEMPTS > 1
    || REQUIRE_EMPTY_BASELINE_TARGET
    || RESUME_FROM_VERIFIED_BASELINE) {
  if (TRANSFER_MODE !== 'commit'
      || TRANSFER_TARGET_PROFILE !== 'production-baseline-rehearsal'
      || SOURCE_PROJECT_REF !== 'lmwfhvexfcoyeuoyrlco'
      || TARGET_PROJECT_REF !== 'isfybjkwvcuqpqtmkujo'
      || PRODUCTION_PROJECT_REF !== 'oakdbbzdqwurpjnoqhmu') {
    throw new Error('baseline_resume_controls_not_isolated_rehearsal');
  }
}
if (RESUME_FROM_VERIFIED_BASELINE && !REQUIRE_EMPTY_BASELINE_TARGET) {
  throw new Error('baseline_resume_requires_empty_target_guard');
}
if (REQUIRE_EMPTY_BASELINE_TARGET && !BASELINE_MIGRATION_HISTORY_PATH) {
  throw new Error('baseline_migration_history_path_missing');
}
if (DEFER_TARGET_DIGEST_UNTIL_PRECOMMIT
    && (TRANSFER_MODE !== 'commit'
      || TRANSFER_TARGET_PROFILE !== 'production-baseline-rehearsal'
      || TARGET_PROJECT_REF !== 'isfybjkwvcuqpqtmkujo')) {
  throw new Error('deferred_target_digest_not_isolated_baseline_rehearsal');
}
if (OPTIMIZE_RAW_SOURCE_RECORD_LOAD
    && (TRANSFER_MODE !== 'commit'
      || TRANSFER_TARGET_PROFILE !== 'production-baseline-rehearsal'
      || SOURCE_PROJECT_REF !== 'lmwfhvexfcoyeuoyrlco'
      || TARGET_PROJECT_REF !== 'isfybjkwvcuqpqtmkujo'
      || PRODUCTION_PROJECT_REF !== 'oakdbbzdqwurpjnoqhmu'
      || !REQUIRE_EMPTY_BASELINE_TARGET)) {
  throw new Error('raw_source_record_optimization_not_isolated_baseline_rehearsal');
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
if (OPTIMIZE_RAW_SOURCE_RECORD_LOAD
    && !tableConfig.tables.includes(RAW_SOURCE_RECORD_TABLE)) {
  throw new Error('raw_source_record_optimization_table_missing');
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

function rawSourceRecordIndexEvidence(snapshot) {
  return {
    count: snapshot.count,
    names: snapshot.names,
    fingerprint: snapshot.fingerprint,
    primaryKeyName: snapshot.primaryKey.index_name,
    primaryKeyDefinition: snapshot.primaryKey.definition,
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function recordTransferPhase(phase, details = {}) {
  process.stdout.write(`${JSON.stringify({ transferPhase: phase, ...details })}\n`);
}

async function targetSchemaState(client, configuredTables) {
  const requestedTables = [
    ...configuredTables,
    'supabase_migrations.schema_migrations',
  ];
  const rows = (await client.query(`
    with requested(table_name) as (
      select unnest($1::text[])
    )
    select
      requested.table_name,
      relation.oid::text as relation_oid,
      relation.relfilenode::text as relation_file_node,
      relation.relnatts::integer as relation_attribute_count,
      relation.relchecks::integer as relation_check_count,
      case when requested.table_name = 'supabase_migrations.schema_migrations'
        then (select count(*)::integer from supabase_migrations.schema_migrations)
        else null
      end as migration_row_count,
      coalesce((
        select md5(string_agg(
          attribute.attnum::text || ':'
            || attribute.attname || ':'
            || attribute.atttypid::text || ':'
            || attribute.atttypmod::text || ':'
            || attribute.attnotnull::text || ':'
            || coalesce(pg_get_expr(default_value.adbin, default_value.adrelid), ''),
          E'\\n' order by attribute.attnum
        ))
        from pg_attribute attribute
        left join pg_attrdef default_value
          on default_value.adrelid = attribute.attrelid
         and default_value.adnum = attribute.attnum
        where attribute.attrelid = relation.oid
          and attribute.attnum > 0
          and not attribute.attisdropped
      ), '') as column_fingerprint,
      coalesce((
        select md5(string_agg(
          pg_get_indexdef(index_entry.indexrelid),
          E'\\n' order by index_entry.indexrelid
        ))
        from pg_index index_entry
        where index_entry.indrelid = relation.oid
      ), '') as index_fingerprint,
      coalesce((
        select md5(string_agg(
          pg_get_constraintdef(constraint_entry.oid, true),
          E'\\n' order by constraint_entry.oid
        ))
        from pg_constraint constraint_entry
        where constraint_entry.conrelid = relation.oid
      ), '') as constraint_fingerprint,
      (
        select count(*)::integer
        from pg_stat_activity activity
        where activity.datname = current_database()
          and activity.pid <> pg_backend_pid()
          and activity.state = 'active'
          and activity.query ~* '^[[:space:]]*(create|alter|drop|truncate|reindex|cluster)[[:space:]]'
      ) as active_ddl_count
    from requested
    left join pg_namespace namespace
      on namespace.nspname = split_part(requested.table_name, '.', 1)
    left join pg_class relation
      on relation.relnamespace = namespace.oid
     and relation.relname = split_part(requested.table_name, '.', 2)
     and relation.relkind in ('r', 'p')
    order by requested.table_name
  `, [requestedTables])).rows;
  const activeDdlCount = Number(rows[0]?.active_ddl_count ?? 0);
  const migrationRow = rows.find((row) => (
    row.table_name === 'supabase_migrations.schema_migrations'
  ));
  const fingerprintRows = rows.map(({ active_ddl_count: _activeDdlCount, ...row }) => row);
  return {
    ready: rows.length === requestedTables.length
      && rows.every((row) => row.relation_oid !== null)
      && Number(migrationRow?.migration_row_count ?? -1) >= TARGET_MINIMUM_MIGRATION_COUNT,
    missingTables: rows
      .filter((row) => row.relation_oid === null)
      .map((row) => row.table_name),
    migrationRowCount: Number(migrationRow?.migration_row_count ?? -1),
    activeDdlCount,
    fingerprint: digestRows(fingerprintRows),
  };
}

async function waitForTargetSchemaStability(client, configuredTables) {
  if (TARGET_SCHEMA_STABILITY_SECONDS === 0) {
    return {
      requiredStableSeconds: 0,
      observedStableSeconds: 0,
      samples: 0,
      fingerprint: null,
    };
  }

  const deadline = Date.now() + (TARGET_SCHEMA_STABILITY_MAX_WAIT_SECONDS * 1_000);
  let stableSince = null;
  let lastFingerprint = null;
  let samples = 0;
  while (Date.now() <= deadline) {
    let state;
    try {
      state = await targetSchemaState(client, configuredTables);
    } catch (error) {
      if (!['42P01', '42704', '55000', 'XX000'].includes(error?.code)) throw error;
      stableSince = null;
      lastFingerprint = null;
      samples += 1;
      process.stdout.write(`${JSON.stringify({
        phase: 'target_schema_stability',
        sample: samples,
        ready: false,
        activeDdlCount: null,
        missingTableCount: null,
        transientSchemaReadFailure: true,
        observedStableSeconds: 0,
        requiredStableSeconds: TARGET_SCHEMA_STABILITY_SECONDS,
      })}\n`);
      await wait(15_000);
      continue;
    }
    samples += 1;
    if (state.ready && state.activeDdlCount === 0) {
      if (state.fingerprint !== lastFingerprint) stableSince = Date.now();
      lastFingerprint = state.fingerprint;
      const observedStableSeconds = Math.floor((Date.now() - stableSince) / 1_000);
      process.stdout.write(`${JSON.stringify({
        phase: 'target_schema_stability',
        sample: samples,
        ready: true,
        activeDdlCount: 0,
        migrationRowCount: state.migrationRowCount,
        observedStableSeconds,
        requiredStableSeconds: TARGET_SCHEMA_STABILITY_SECONDS,
      })}\n`);
      if (observedStableSeconds >= TARGET_SCHEMA_STABILITY_SECONDS) {
        return {
          requiredStableSeconds: TARGET_SCHEMA_STABILITY_SECONDS,
          observedStableSeconds,
          samples,
          fingerprint: state.fingerprint,
        };
      }
    } else {
      stableSince = null;
      lastFingerprint = null;
      process.stdout.write(`${JSON.stringify({
        phase: 'target_schema_stability',
        sample: samples,
        ready: state.ready,
        activeDdlCount: state.activeDdlCount,
        missingTableCount: state.missingTables.length,
        migrationRowCount: state.migrationRowCount,
        minimumMigrationCount: TARGET_MINIMUM_MIGRATION_COUNT,
        observedStableSeconds: 0,
        requiredStableSeconds: TARGET_SCHEMA_STABILITY_SECONDS,
      })}\n`);
    }
    await wait(15_000);
  }
  throw new Error('target_schema_stability_timeout');
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

function frozenBaselineMigrationKeys(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const keys = [];
  let inMigrationCopy = false;
  let copyClosed = false;
  for (const line of content.split(/\r?\n/)) {
    if (!inMigrationCopy) {
      if (/^COPY\s+"?supabase_migrations"?\."?schema_migrations"?\s+/i.test(line)) {
        inMigrationCopy = true;
      }
      continue;
    }
    if (line === '\\.') {
      copyClosed = true;
      break;
    }
    if (!line) continue;
    const fields = line.split('\t');
    const version = fields[0];
    const name = fields[2];
    if (fields.length < 3
        || !/^\d{14}$/.test(version ?? '')
        || !/^[a-z0-9_]+$/.test(name ?? '')) {
      throw new Error('baseline_migration_history_row_invalid');
    }
    keys.push({ version, name });
  }
  if (!inMigrationCopy || !copyClosed || keys.length === 0) {
    throw new Error('baseline_migration_history_copy_invalid');
  }
  const uniqueVersions = new Set(keys.map((row) => row.version));
  if (uniqueVersions.size !== keys.length) {
    throw new Error('baseline_migration_history_version_duplicate');
  }
  return keys.sort((left, right) => (
    left.version.localeCompare(right.version) || left.name.localeCompare(right.name)
  ));
}

async function verifyEmptyFrozenBaselineTarget(client) {
  if (!REQUIRE_EMPTY_BASELINE_TARGET) return null;
  const expectedMigrations = frozenBaselineMigrationKeys(BASELINE_MIGRATION_HISTORY_PATH);
  if (expectedMigrations.length !== TARGET_MINIMUM_MIGRATION_COUNT) {
    throw new Error(
      `baseline_migration_history_count_mismatch:${expectedMigrations.length}`,
    );
  }
  const actualMigrations = (await client.query(`
    select version, name
    from supabase_migrations.schema_migrations
    order by version, name
  `)).rows;
  const expectedMigrationFingerprint = digestRows(expectedMigrations);
  const actualMigrationFingerprint = digestRows(actualMigrations);
  if (actualMigrations.length !== expectedMigrations.length
      || actualMigrationFingerprint !== expectedMigrationFingerprint) {
    throw new Error(
      `baseline_target_migration_history_mismatch:expected_${expectedMigrations.length}`
      + `:actual_${actualMigrations.length}`,
    );
  }

  const tablePresence = (await client.query(`
    with requested(table_name) as (
      select unnest($1::text[])
    )
    select table_name, to_regclass(table_name) is not null as present
    from requested
    order by table_name
  `, [tableConfig.tables])).rows;
  const missingTables = tablePresence
    .filter((row) => !row.present)
    .map((row) => row.table_name);
  if (missingTables.length) {
    throw new Error(`baseline_target_tables_missing:${missingTables.join(',')}`);
  }

  const tableCounts = (await client.query(
    tableConfig.tables.map((tableName) => `
      select '${tableName}'::text as table_name,
        count(*)::bigint::text as row_count
      from ${qualifiedName(tableName)}
    `).join('\nunion all\n'),
  )).rows;
  const nonEmptyTables = tableCounts
    .filter((row) => BigInt(row.row_count) !== 0n)
    .map((row) => `${row.table_name}:${row.row_count}`);
  if (nonEmptyTables.length) {
    throw new Error(`baseline_target_not_empty:${nonEmptyTables.join(',')}`);
  }

  const adoptedVersions = adoptedMigrationVersions();
  const adoptedRows = await migrationRows(client, adoptedVersions);
  if (adoptedRows.length) {
    throw new Error(`baseline_target_adopted_migrations_present:${adoptedRows.length}`);
  }
  const verification = {
    required: true,
    resumeFromVerifiedBaseline: RESUME_FROM_VERIFIED_BASELINE,
    migrationCount: actualMigrations.length,
    migrationIdentitySha256: actualMigrationFingerprint,
    emptyTableCount: tableCounts.length,
    adoptedMigrationCount: adoptedRows.length,
  };
  recordTransferPhase('empty_frozen_baseline_verified', verification);
  return verification;
}

async function connect(connectionString, applicationName) {
  return connectPostgresWithRetry({
    connectionString,
    applicationName,
    statementTimeoutMs: TRANSFER_STATEMENT_TIMEOUT_MS,
    maxAttempts: INITIAL_CONNECTION_ATTEMPTS,
    retryDelayMs: INITIAL_CONNECTION_RETRY_DELAY_MS,
    onRetry: ({ attempt, maxAttempts }) => {
      process.stderr.write(
        `Transient ${applicationName} checkout failure on attempt ${attempt}`
        + ` of ${maxAttempts}; retrying.\n`,
      );
    },
  });
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

async function* readRowBatches(
  client,
  tableName,
  primaryKey,
  columns = null,
  { metadata = null, preserveJsonbText = false } = {},
) {
  const order = primaryKey.map(quoteIdentifier).join(', ');
  const metadataByName = new Map(
    metadata?.columns?.map((column) => [column.column_name, column]) ?? [],
  );
  if (preserveJsonbText && (!columns?.length || !metadata)) {
    throw new Error(`jsonb_text_projection_metadata_missing:${tableName}`);
  }
  const projection = columns?.length
    ? columns.map((columnName) => {
      const columnSql = quoteIdentifier(columnName);
      return preserveJsonbText && metadataByName.get(columnName)?.udt_name === 'jsonb'
        ? `${columnSql}::text as ${columnSql}`
        : columnSql;
    }).join(', ')
    : '*';
  if (columns?.length) {
    const selectedColumns = new Set(columns);
    const missingPrimaryKeyColumns = primaryKey.filter((column) => !selectedColumns.has(column));
    if (missingPrimaryKeyColumns.length) {
      throw new Error(
        `transfer_projection_missing_primary_key:${tableName}:${missingPrimaryKeyColumns.join(',')}`,
      );
    }
  }

  let cursor = null;
  while (true) {
    const cursorSql = cursor
      ? `where (${order}) > (${primaryKey.map((_, index) => `$${index + 1}`).join(', ')})`
      : '';
    const parameters = cursor ? [...cursor, TRANSFER_ROW_BATCH_SIZE] : [TRANSFER_ROW_BATCH_SIZE];
    const limitParameter = `$${parameters.length}`;
    const rows = (await client.query(
      `select ${projection}
       from ${qualifiedName(tableName)}
       ${cursorSql}
       order by ${order}
       limit ${limitParameter}`,
      parameters,
    )).rows;
    if (!rows.length) break;
    yield rows;
    const finalRow = rows.at(-1);
    cursor = primaryKey.map((column) => finalRow[column]);
    if (rows.length < TRANSFER_ROW_BATCH_SIZE) break;
  }
}

async function digestTable(
  client,
  tableName,
  primaryKey,
  columns = null,
  options = {},
) {
  const hash = createHash('sha256');
  let rowCount = 0;
  for await (const rows of readRowBatches(
    client,
    tableName,
    primaryKey,
    columns,
    options,
  )) {
    for (const row of rows) hash.update(stableJson(row)).update('\n');
    rowCount += rows.length;
  }
  return { rowCount, sha256: hash.digest('hex') };
}

async function tableRowCount(client, tableName) {
  return Number((await client.query(
    `select count(*)::integer as row_count from ${qualifiedName(tableName)}`,
  )).rows[0].row_count);
}

function transferForeignKeyIndexName(requirement) {
  const { table } = splitTableName(requirement.childTable);
  const suffix = createHash('sha256')
    .update(`${requirement.childTable}:${requirement.childColumns.join(',')}`)
    .digest('hex')
    .slice(0, 12);
  const readablePrefix = `${table}_${requirement.childColumns.join('_')}`
    .replaceAll(/[^a-z0-9_]/g, '_')
    .slice(0, 40);
  return `${readablePrefix}_stackr_fk_${suffix}`;
}

async function catalogueForeignKeyRequirements(client, selectedTables) {
  const rows = (await client.query(`
    with foreign_keys as (
      select
        constraint_entry.oid::text as constraint_oid,
        constraint_entry.conname as constraint_name,
        constraint_entry.condeferrable as constraint_deferrable,
        constraint_entry.condeferred as constraint_initially_deferred,
        constraint_entry.convalidated as constraint_validated,
        format('%I.%I', child_namespace.nspname, child_relation.relname) as child_table,
        child_namespace.nspname as child_schema,
        format('%I.%I', parent_namespace.nspname, parent_relation.relname) as parent_table,
        array_agg(child_attribute.attname order by key_entry.ordinality)::text[]
          as child_columns,
        case constraint_entry.confdeltype
          when 'a' then 'no_action'
          when 'r' then 'restrict'
          when 'c' then 'cascade'
          when 'n' then 'set_null'
          when 'd' then 'set_default'
          else constraint_entry.confdeltype::text
        end as delete_action
      from pg_constraint constraint_entry
      join pg_class child_relation
        on child_relation.oid = constraint_entry.conrelid
      join pg_namespace child_namespace
        on child_namespace.oid = child_relation.relnamespace
      join pg_class parent_relation
        on parent_relation.oid = constraint_entry.confrelid
      join pg_namespace parent_namespace
        on parent_namespace.oid = parent_relation.relnamespace
      join lateral unnest(constraint_entry.conkey) with ordinality
        as key_entry(child_attribute_number, ordinality) on true
      join pg_attribute child_attribute
        on child_attribute.attrelid = child_relation.oid
       and child_attribute.attnum = key_entry.child_attribute_number
      where constraint_entry.contype = 'f'
        and format('%I.%I', parent_namespace.nspname, parent_relation.relname) = any($1::text[])
      group by
        constraint_entry.oid,
        constraint_entry.conname,
        constraint_entry.condeferrable,
        constraint_entry.condeferred,
        constraint_entry.convalidated,
        child_namespace.nspname,
        child_relation.relname,
        parent_namespace.nspname,
        parent_relation.relname,
        constraint_entry.confdeltype
    )
    select
      foreign_keys.*,
      supporting_index.index_name as supporting_index_name
    from foreign_keys
    left join lateral (
      select index_relation.relname as index_name
      from pg_class child_relation
      join pg_namespace child_namespace
        on child_namespace.oid = child_relation.relnamespace
      join pg_index index_entry
        on index_entry.indrelid = child_relation.oid
      join pg_class index_relation
        on index_relation.oid = index_entry.indexrelid
      join pg_am index_method
        on index_method.oid = index_relation.relam
      where format('%I.%I', child_namespace.nspname, child_relation.relname)
          = foreign_keys.child_table
        and index_method.amname = 'btree'
        and index_entry.indisvalid
        and index_entry.indisready
        and index_entry.indpred is null
        and (
          select array_agg(index_attribute.attname order by index_key.ordinality)::text[]
          from unnest(index_entry.indkey) with ordinality
            as index_key(attribute_number, ordinality)
          join pg_attribute index_attribute
            on index_attribute.attrelid = child_relation.oid
           and index_attribute.attnum = index_key.attribute_number
          where index_key.ordinality <= cardinality(foreign_keys.child_columns)
        ) = foreign_keys.child_columns
      order by index_entry.indisunique desc, index_relation.relname
      limit 1
    ) supporting_index on true
    order by foreign_keys.child_table, foreign_keys.constraint_name
  `, [selectedTables])).rows;

  const selected = new Set(selectedTables);
  return rows.map((row) => ({
    constraintOid: row.constraint_oid,
    constraintName: row.constraint_name,
    constraintDeferrable: row.constraint_deferrable,
    constraintInitiallyDeferred: row.constraint_initially_deferred,
    constraintValidated: row.constraint_validated,
    childTable: row.child_table,
    childSchema: row.child_schema,
    parentTable: row.parent_table,
    childColumns: row.child_columns,
    deleteAction: row.delete_action,
    childSelected: selected.has(row.child_table),
    supportingIndexName: row.supporting_index_name,
  }));
}

function selectedSelfReferentialForeignKeys(requirements) {
  return requirements
    .filter((requirement) => (
      requirement.childSelected && requirement.childTable === requirement.parentTable
    ))
    .map((requirement) => ({
      constraintName: requirement.constraintName,
      childTable: requirement.childTable,
      childColumns: requirement.childColumns,
      deleteAction: requirement.deleteAction,
      constraintDeferrable: requirement.constraintDeferrable,
      constraintInitiallyDeferred: requirement.constraintInitiallyDeferred,
      constraintValidated: requirement.constraintValidated,
    }))
    .sort((left, right) => (
      `${left.childTable}.${left.constraintName}`
        .localeCompare(`${right.childTable}.${right.constraintName}`)
    ));
}

function expectedSelectedSelfReferentialForeignKeys(selectedTables) {
  const selected = new Set(selectedTables);
  return CATALOGUE_SELF_REFERENTIAL_FOREIGN_KEYS
    .filter(({ childTable }) => selected.has(childTable))
    .sort((left, right) => (
      `${left.childTable}.${left.constraintName}`
        .localeCompare(`${right.childTable}.${right.constraintName}`)
    ));
}

function selfReferentialForeignKeyContract(constraints) {
  return constraints.map((constraint) => ({
    childTable: constraint.childTable,
    constraintName: constraint.constraintName,
    childColumns: constraint.childColumns,
    deleteAction: constraint.deleteAction,
  }));
}

function assertExpectedSelfReferentialForeignKeys(constraints, selectedTables) {
  const expected = expectedSelectedSelfReferentialForeignKeys(selectedTables);
  if (stableJson(selfReferentialForeignKeyContract(constraints)) !== stableJson(expected)) {
    throw new Error('catalogue_self_foreign_key_contract_mismatch');
  }
}

async function prepareSelectedSelfReferentialForeignKeys(client, selectedTables) {
  const before = selectedSelfReferentialForeignKeys(
    await catalogueForeignKeyRequirements(client, selectedTables),
  );
  assertExpectedSelfReferentialForeignKeys(before, selectedTables);
  const invalid = before.filter(({ constraintValidated }) => !constraintValidated);
  if (invalid.length) {
    throw new Error(
      `catalogue_self_foreign_key_not_validated:${invalid.map(({ childTable, constraintName }) => (
        `${childTable}.${constraintName}`
      )).join(',')}`,
    );
  }

  const requiringPreparation = before.filter((constraint) => (
    !constraint.constraintDeferrable || constraint.constraintInitiallyDeferred
  ));
  if (TRANSFER_MODE === 'promote' && requiringPreparation.length) {
    throw new Error('production_catalogue_self_foreign_keys_not_prepared');
  }
  if (TRANSFER_MODE === 'rehearse' && requiringPreparation.length) {
    throw new Error('catalogue_self_foreign_keys_not_prepared');
  }

  const alteredConstraints = [];
  if (requiringPreparation.length) {
    await client.query('begin');
    try {
      await client.query("set local lock_timeout = '5s'");
      await client.query("set local statement_timeout = '5min'");
      for (const constraint of requiringPreparation) {
        await client.query(
          `alter table ${qualifiedName(constraint.childTable)}
           alter constraint ${quoteIdentifier(constraint.constraintName)}
           deferrable initially immediate`,
        );
        alteredConstraints.push({
          childTable: constraint.childTable,
          constraintName: constraint.constraintName,
        });
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw new Error(
        `catalogue_self_foreign_key_preparation_failed:postgres_${error.code ?? 'unknown'}`,
      );
    }
  }

  const prepared = selectedSelfReferentialForeignKeys(
    await catalogueForeignKeyRequirements(client, selectedTables),
  );
  assertExpectedSelfReferentialForeignKeys(prepared, selectedTables);
  if (prepared.length !== before.length
      || prepared.some((constraint) => (
        !constraint.constraintValidated
        || !constraint.constraintDeferrable
        || constraint.constraintInitiallyDeferred
      ))) {
    throw new Error('catalogue_self_foreign_key_deferral_preparation_failed');
  }
  return {
    constraintCount: prepared.length,
    alteredConstraintCount: alteredConstraints.length,
    alteredConstraints,
    before,
    prepared,
    preparedBeforeDataTransaction: true,
    deferredDuringTransfer: false,
    validation: null,
    postFinalise: null,
  };
}

function qualifiedConstraintName(constraint) {
  const { schema } = splitTableName(constraint.childTable);
  return `${quoteIdentifier(schema)}.${quoteIdentifier(constraint.constraintName)}`;
}

async function deferPreparedSelfReferentialForeignKeys(client, selectedTables, prepared) {
  const current = selectedSelfReferentialForeignKeys(
    await catalogueForeignKeyRequirements(client, selectedTables),
  );
  assertExpectedSelfReferentialForeignKeys(current, selectedTables);
  if (stableJson(current) !== stableJson(prepared)) {
    throw new Error('catalogue_self_foreign_key_transaction_guard_mismatch');
  }
  if (current.length === 0) return true;
  await client.query(
    `set constraints ${current.map(qualifiedConstraintName).join(', ')} deferred`,
  );
  return true;
}

async function validateDeferredSelfReferentialForeignKeys(client, constraints) {
  await client.query(
    `set constraints ${constraints.map(qualifiedConstraintName).join(', ')} immediate`,
  );
  return {
    constraintsForcedImmediate: true,
    validatedBeforePreCommit: true,
  };
}

async function verifySelfReferentialForeignKeysAfterFinalise(
  client,
  selectedTables,
  prepared,
) {
  const after = selectedSelfReferentialForeignKeys(
    await catalogueForeignKeyRequirements(client, selectedTables),
  );
  assertExpectedSelfReferentialForeignKeys(after, selectedTables);
  if (stableJson(after) !== stableJson(prepared)) {
    throw new Error('catalogue_self_foreign_key_postfinalise_mismatch');
  }
  return {
    schemaPreparationPersisted: true,
    verified: true,
    constraints: after,
  };
}

async function externalCatalogueForeignKeyRows(client, requirements) {
  const results = [];
  for (const requirement of requirements.filter(({ childSelected }) => !childSelected)) {
    const predicate = requirement.childColumns
      .map((column) => `${quoteIdentifier(column)} is not null`)
      .join(' and ');
    const rowCount = Number((await client.query(
      `select count(*)::integer as row_count
       from ${qualifiedName(requirement.childTable)}
       where ${predicate}`,
    )).rows[0].row_count);
    results.push({
      constraintName: requirement.constraintName,
      childTable: requirement.childTable,
      parentTable: requirement.parentTable,
      deleteAction: requirement.deleteAction,
      rowCount,
    });
  }
  return results;
}

function assertExternalCatalogueForeignKeysEmpty(externalDependencies) {
  const populatedExternalDependencies = externalDependencies.filter(({ rowCount }) => rowCount > 0);
  if (populatedExternalDependencies.length) {
    const detail = populatedExternalDependencies
      .map(({ childTable, constraintName, rowCount, deleteAction }) => (
        `${childTable}.${constraintName}:${deleteAction}:${rowCount}`
      ))
      .join(',');
    throw new Error(`external_catalogue_foreign_key_rows:${detail}`);
  }
  return populatedExternalDependencies;
}

async function lockAndVerifyExternalCatalogueForeignKeys(
  client,
  selectedTables,
  preparedExternalDependencies,
) {
  const externalChildTables = preparedExternalDependencies.map(({ childTable }) => childTable);
  const lockedTables = [...new Set([...selectedTables, ...externalChildTables])].sort();
  await client.query(
    `lock table ${lockedTables.map(qualifiedName).join(', ')} in share row exclusive mode`,
  );
  const requirements = await catalogueForeignKeyRequirements(client, selectedTables);
  const unlockedExternalTables = [...new Set(
    requirements
      .filter(({ childSelected }) => !childSelected)
      .map(({ childTable }) => childTable)
      .filter((childTable) => !lockedTables.includes(childTable)),
  )].sort();
  if (unlockedExternalTables.length) {
    throw new Error(
      `external_catalogue_foreign_key_tables_unlocked:${unlockedExternalTables.join(',')}`,
    );
  }
  const externalDependencies = await externalCatalogueForeignKeyRows(client, requirements);
  const populatedExternalDependencies = assertExternalCatalogueForeignKeysEmpty(
    externalDependencies,
  );
  return {
    lockedTableCount: lockedTables.length,
    populatedExternalDependencyCount: populatedExternalDependencies.length,
    externalDependencies,
  };
}

async function prepareCatalogueForeignKeyIndexes(client, selectedTables) {
  const requirementsBefore = await catalogueForeignKeyRequirements(client, selectedTables);
  const externalDependencies = await externalCatalogueForeignKeyRows(client, requirementsBefore);
  const populatedExternalDependencies = assertExternalCatalogueForeignKeysEmpty(
    externalDependencies,
  );

  const createdIndexes = [];
  const missingSelectedIndexes = [...new Map(
    requirementsBefore
      .filter((requirement) => requirement.childSelected && !requirement.supportingIndexName)
      .map((requirement) => [
        `${requirement.childTable}:${requirement.childColumns.join(',')}`,
        requirement,
      ]),
  ).values()];
  if (TRANSFER_MODE === 'rehearse' && missingSelectedIndexes.length) {
    throw new Error(
      `catalogue_foreign_key_indexes_missing:${missingSelectedIndexes.map((requirement) => (
        `${requirement.childTable}.${requirement.constraintName}`
      )).join(',')}`,
    );
  }
  for (const requirement of missingSelectedIndexes) {
    const indexName = transferForeignKeyIndexName(requirement);
    await client.query(
      `create index concurrently if not exists
         ${quoteIdentifier(indexName)}
       on ${qualifiedName(requirement.childTable)}
         (${requirement.childColumns.map(quoteIdentifier).join(', ')})`,
    );
    createdIndexes.push({
      indexName,
      childTable: requirement.childTable,
      childColumns: requirement.childColumns,
      constraintName: requirement.constraintName,
      parentTable: requirement.parentTable,
    });
    recordTransferPhase('foreign_key_index_created', {
      indexName,
      childTable: requirement.childTable,
      childColumns: requirement.childColumns,
    });
  }

  const requirementsAfter = await catalogueForeignKeyRequirements(client, selectedTables);
  const remainingMissing = requirementsAfter.filter((requirement) => (
    requirement.childSelected && !requirement.supportingIndexName
  ));
  if (remainingMissing.length) {
    throw new Error(
      `catalogue_foreign_key_indexes_missing:${remainingMissing.map((requirement) => (
        `${requirement.childTable}.${requirement.constraintName}`
      )).join(',')}`,
    );
  }

  return {
    requirementCount: requirementsAfter.filter(({ childSelected }) => childSelected).length,
    createdIndexCount: createdIndexes.length,
    createdIndexes,
    externalDependencyCount: externalDependencies.length,
    populatedExternalDependencyCount: populatedExternalDependencies.length,
    externalDependencies,
  };
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
  if (!rows.length) return null;
  if (OPTIMIZE_RAW_SOURCE_RECORD_LOAD && tableName === RAW_SOURCE_RECORD_TABLE) {
    try {
      return await copyRawSourceRecordRows(client, metadata, columnNames, rows);
    } catch (error) {
      throw new Error(
        `transfer_insert_failed:${tableName}:${error.message}`,
        { cause: error },
      );
    }
  }
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

async function restartOwnedSequences(client, tableName, metadata) {
  const sequenceStates = await ownedSequenceStates(client, tableName, metadata);
  for (const sequence of sequenceStates) {
    const maximumValue = (await client.query(
      `select max(${quoteIdentifier(sequence.column)})::text as maximum_value
       from ${qualifiedName(tableName)}`,
    )).rows[0].maximum_value;
    const restartValue = maximumValue !== null
      ? BigInt(maximumValue) + 1n
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

async function tableExists(client, tableName) {
  splitTableName(tableName);
  return Boolean((await client.query(
    'select to_regclass($1) is not null as exists',
    [tableName],
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

function expectedFinalRow(tableName, sourceRow, promotionTimestamp) {
  const shouldRewrite = TRANSFER_MODE === 'promote'
    && tableName === 'catalog.assets'
    && sourceRow.storage_provider === 'supabase_storage'
    && sourceRow.storage_bucket === 'stackr-catalogue-public'
    && typeof sourceRow.url === 'string'
    && sourceRow.url.includes(SOURCE_PROJECT_REF);
  if (!shouldRewrite) return sourceRow;
  return {
    ...sourceRow,
    url: sourceRow.url.replaceAll(SOURCE_PROJECT_REF, TARGET_PROJECT_REF),
    updated_at: promotionTimestamp,
  };
}

let source = null;
let target = null;
let sourceConnectionAttempts = 0;
let targetConnectionAttempts = 0;
const results = [];
const excludedChecks = [];
const tablePlans = new Map();
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
let promotionTimestamp = null;
let productionAssetUrlRewriteAt = null;
let preCommitAcceptanceVerified = false;
let targetSchemaStability = null;
let foreignKeySafety = null;
let selfReferentialForeignKeySafety = null;
let baselineTargetVerification = null;
let rawSourceRecordIndexSnapshot = null;
const rawSourceRecordBulkLoad = {
  enabled: OPTIMIZE_RAW_SOURCE_RECORD_LOAD,
  insertStrategy: OPTIMIZE_RAW_SOURCE_RECORD_LOAD
    ? 'bounded_copy_to_transactional_stage_then_insert_with_index_rebuild'
    : 'parameterized_values',
  copyBatchMaximumBytes: OPTIMIZE_RAW_SOURCE_RECORD_LOAD
    ? RAW_SOURCE_RECORD_COPY_BATCH_MAX_BYTES
    : null,
  copiedRowCount: 0,
  copyBatchCount: 0,
  copyPayloadBytes: 0,
  loadDurationMs: 0,
  rawTransferDurationMs: null,
  before: null,
  afterDrop: null,
  preCommit: null,
  postCommit: null,
};

try {
  const sourceConnection = await connect(
    NORMALIZED_SOURCE_DB_URL,
    'stackr-staging-catalogue-source',
  );
  source = sourceConnection.client;
  sourceConnectionAttempts = sourceConnection.attemptsUsed;
  const targetConnection = await connect(
    NORMALIZED_TARGET_DB_URL,
    'stackr-staging-catalogue-rehearsal',
  );
  target = targetConnection.client;
  targetConnectionAttempts = targetConnection.attemptsUsed;
  baselineTargetVerification = await verifyEmptyFrozenBaselineTarget(target);
  targetSchemaStability = await waitForTargetSchemaStability(target, tableConfig.tables);
  foreignKeySafety = await prepareCatalogueForeignKeyIndexes(target, tableConfig.tables);
  recordTransferPhase('foreign_key_preflight_verified', {
    requirementCount: foreignKeySafety.requirementCount,
    createdIndexCount: foreignKeySafety.createdIndexCount,
    externalDependencyCount: foreignKeySafety.externalDependencyCount,
    populatedExternalDependencyCount: foreignKeySafety.populatedExternalDependencyCount,
  });
  selfReferentialForeignKeySafety = await prepareSelectedSelfReferentialForeignKeys(
    target,
    tableConfig.tables,
  );
  recordTransferPhase('self_foreign_keys_prepared', {
    constraintCount: selfReferentialForeignKeySafety.constraintCount,
    alteredConstraintCount: selfReferentialForeignKeySafety.alteredConstraintCount,
  });
  await source.query('begin transaction isolation level repeatable read read only');
  sourceTransactionOpen = true;
  await target.query('begin transaction isolation level read committed');
  targetTransactionOpen = true;
  foreignKeySafety.transactionGuard = await lockAndVerifyExternalCatalogueForeignKeys(
    target,
    tableConfig.tables,
    foreignKeySafety.externalDependencies,
  );
  recordTransferPhase('external_foreign_key_locks_verified', {
    lockedTableCount: foreignKeySafety.transactionGuard.lockedTableCount,
    populatedExternalDependencyCount:
      foreignKeySafety.transactionGuard.populatedExternalDependencyCount,
  });
  recordTransferPhase('transactions_open', { mode: TRANSFER_MODE });
  selfReferentialForeignKeySafety.deferredDuringTransfer =
    await deferPreparedSelfReferentialForeignKeys(
      target,
      tableConfig.tables,
      selfReferentialForeignKeySafety.prepared,
    );
  recordTransferPhase('self_foreign_keys_deferred', {
    constraintCount: selfReferentialForeignKeySafety.constraintCount,
  });

  adoptedMigrations = adoptedMigrationVersions();
  sourceAdoptedMigrationRows = await migrationRows(source, adoptedMigrations);
  if (TRANSFER_MODE === 'promote') {
    promotionTimestamp = (await target.query(
      'select transaction_timestamp() as promotion_timestamp',
    )).rows[0].promotion_timestamp;
    productionAssetUrlRewriteAt = promotionTimestamp.toISOString();
  }
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
  if (OPTIMIZE_RAW_SOURCE_RECORD_LOAD) {
    rawSourceRecordIndexSnapshot = await captureRawSourceRecordIndexes(target);
    rawSourceRecordBulkLoad.before = rawSourceRecordIndexEvidence(
      rawSourceRecordIndexSnapshot,
    );
    const dropped = await dropRawSourceRecordIndexes(target, rawSourceRecordIndexSnapshot);
    rawSourceRecordBulkLoad.afterDrop = {
      droppedCount: dropped.droppedCount,
      primaryKeyName: dropped.primaryKey.index_name,
      primaryKeyDefinition: dropped.primaryKey.definition,
    };
    recordTransferPhase('raw_source_record_indexes_deferred', {
      indexCount: dropped.droppedCount,
      primaryKeyName: dropped.primaryKey.index_name,
    });
  }

  for (const tableName of tableConfig.excludedEmptyStagingOnlyTables) {
    if (!await tableExists(source, tableName)) {
      excludedChecks.push({ table: tableName, rowCount: 0, reason: 'staging_only_table_absent' });
      continue;
    }
    const count = Number((await source.query(
      `select count(*)::integer as row_count from ${qualifiedName(tableName)}`,
    )).rows[0].row_count);
    if (count !== 0) throw new Error(`excluded_staging_table_not_empty:${tableName}:${count}`);
    excludedChecks.push({ table: tableName, rowCount: count, reason: 'staging_only_and_empty' });
  }
  for (const tableName of tableConfig.excludedStagingProjections) {
    if (!await tableExists(source, tableName)) {
      excludedChecks.push({ table: tableName, rowCount: 0, reason: 'staging_projection_absent' });
      continue;
    }
    const count = Number((await source.query(
      `select count(*)::integer as row_count from ${qualifiedName(tableName)}`,
    )).rows[0].row_count);
    excludedChecks.push({ table: tableName, rowCount: count, reason: 'staging_only_regenerable_projection' });
  }

  for (const tableName of tableConfig.tables) {
    const sourceMetadata = await tableMetadata(source, tableName);
    const targetMetadata = await tableMetadata(target, tableName);
    const contract = compatibleTableContract(tableName, sourceMetadata, targetMetadata);
    const targetBefore = await digestTable(target, tableName, targetMetadata.primaryKey);
    const targetSequencesBefore = await ownedSequenceStates(target, tableName, targetMetadata);
    tablePlans.set(tableName, {
      sourceMetadata,
      targetMetadata,
      targetBefore,
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
    recordTransferPhase('table_clear_started', { table: tableName });
    await target.query(`delete from ${qualifiedName(tableName)}`);
    recordTransferPhase('table_cleared', { table: tableName });
  }

  for (const tableName of tableConfig.tables) {
    const plan = tablePlans.get(tableName);
    const {
      sourceMetadata,
      targetMetadata,
      targetBefore,
      targetSequencesBefore,
      contract,
    } = plan;
    const targetRowCountAfterClear = await tableRowCount(target, tableName);
    if (targetRowCountAfterClear !== 0) throw new Error(`target_table_not_cleared:${tableName}`);

    const sourceHash = createHash('sha256');
    const expectedFinalHash = TRANSFER_MODE === 'promote' && tableName === 'catalog.assets'
      ? createHash('sha256')
      : null;
    let sourceRowCount = 0;
    let expectedProductionAssetUrlRewriteCount = 0;
    const rawCopyStartedAt = tableName === RAW_SOURCE_RECORD_TABLE ? Date.now() : null;
    const preserveRawJsonbText = OPTIMIZE_RAW_SOURCE_RECORD_LOAD
      && tableName === RAW_SOURCE_RECORD_TABLE;
    for await (const sourceRows of readRowBatches(
      source,
      tableName,
      sourceMetadata.primaryKey,
      contract.transferColumns,
      { metadata: sourceMetadata, preserveJsonbText: preserveRawJsonbText },
    )) {
      for (const sourceRow of sourceRows) {
        sourceHash.update(stableJson(sourceRow)).update('\n');
        if (expectedFinalHash) {
          const expectedRow = expectedFinalRow(tableName, sourceRow, promotionTimestamp);
          expectedFinalHash.update(stableJson(expectedRow)).update('\n');
          if (expectedRow !== sourceRow) expectedProductionAssetUrlRewriteCount += 1;
        }
      }
      sourceRowCount += sourceRows.length;
      const loadStartedAt = tableName === RAW_SOURCE_RECORD_TABLE ? Date.now() : null;
      const insertResult = await insertRows(
        target,
        tableName,
        targetMetadata,
        contract.transferColumns,
        sourceRows,
      );
      if (tableName === RAW_SOURCE_RECORD_TABLE && insertResult) {
        rawSourceRecordBulkLoad.loadDurationMs += Date.now() - loadStartedAt;
        rawSourceRecordBulkLoad.copiedRowCount += insertResult.rowCount;
        rawSourceRecordBulkLoad.copyBatchCount += insertResult.batchCount;
        rawSourceRecordBulkLoad.copyPayloadBytes += insertResult.payloadBytes;
        if (sourceRowCount === sourceRows.length || sourceRowCount % 25_000 === 0) {
          recordTransferPhase('raw_source_record_copy_progress', {
            copiedRowCount: rawSourceRecordBulkLoad.copiedRowCount,
            copyBatchCount: rawSourceRecordBulkLoad.copyBatchCount,
            copyPayloadBytes: rawSourceRecordBulkLoad.copyPayloadBytes,
          });
        }
      }
    }
    if (rawCopyStartedAt !== null) {
      rawSourceRecordBulkLoad.rawTransferDurationMs = Date.now() - rawCopyStartedAt;
    }
    await restartOwnedSequences(target, tableName, targetMetadata);
    if (OPTIMIZE_RAW_SOURCE_RECORD_LOAD && tableName === RAW_SOURCE_RECORD_TABLE) {
      const restored = await restoreRawSourceRecordIndexes(
        target,
        rawSourceRecordIndexSnapshot,
      );
      rawSourceRecordBulkLoad.preCommit = rawSourceRecordIndexEvidence(restored);
      recordTransferPhase('raw_source_record_indexes_restored', {
        indexCount: restored.count,
        fingerprint: restored.fingerprint,
      });
    }
    const sourceSha256 = sourceHash.digest('hex');
    const expectedFinalSha256 = expectedFinalHash
      ? expectedFinalHash.digest('hex')
      : sourceSha256;
    let targetDuringTransfer = null;
    if (!DEFER_TARGET_DIGEST_UNTIL_PRECOMMIT) {
      targetDuringTransfer = await digestTable(
        target,
        tableName,
        targetMetadata.primaryKey,
        contract.transferColumns,
        { metadata: targetMetadata, preserveJsonbText: preserveRawJsonbText },
      );
      if (targetDuringTransfer.rowCount !== sourceRowCount
          || targetDuringTransfer.sha256 !== sourceSha256) {
        throw new Error(`target_transfer_mismatch:${tableName}`);
      }
    }
    const targetSequencesDuringRehearsal = await ownedSequenceStates(target, tableName, targetMetadata);

    plan.expectedFinalRowCount = sourceRowCount;
    plan.expectedFinalSha256 = expectedFinalSha256;
    plan.expectedProductionAssetUrlRewriteCount = expectedProductionAssetUrlRewriteCount;

    results.push({
      table: tableName,
      primaryKey: sourceMetadata.primaryKey,
      transferColumns: contract.transferColumns,
      targetOnlyColumns: contract.targetOnlyColumns,
      sourceRowCount,
      targetRowCountBefore: targetBefore.rowCount,
      targetRowCountAfterClear,
      ...(targetDuringTransfer ? {
        targetRowCountDuringRehearsal: targetDuringTransfer.rowCount,
        matchedSourceRowCount: targetDuringTransfer.rowCount,
        matchedTargetSha256: targetDuringTransfer.sha256,
      } : {}),
      sourceSha256,
      targetBeforeSha256: targetBefore.sha256,
      expectedFinalSha256,
      targetSequencesBefore,
      targetSequencesDuringRehearsal,
    });
    recordTransferPhase('table_transferred', {
      table: tableName,
      sourceRowCount,
    });
  }

  selfReferentialForeignKeySafety.validation =
    await validateDeferredSelfReferentialForeignKeys(
      target,
      selfReferentialForeignKeySafety.prepared,
    );
  recordTransferPhase('self_foreign_keys_validated', {
    constraintCount: selfReferentialForeignKeySafety.constraintCount,
  });

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

  if (TRANSFER_MODE === 'promote') {
    const expectedRewriteCount = tablePlans.get('catalog.assets')
      .expectedProductionAssetUrlRewriteCount;
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
    const plan = tablePlans.get(result.table);
    const targetBeforeFinalise = await digestTable(
      target,
      result.table,
      plan.targetMetadata.primaryKey,
      plan.contract.transferColumns,
      {
        metadata: plan.targetMetadata,
        preserveJsonbText: OPTIMIZE_RAW_SOURCE_RECORD_LOAD
          && result.table === RAW_SOURCE_RECORD_TABLE,
      },
    );
    const sequences = await ownedSequenceStates(target, result.table, plan.targetMetadata);
    result.targetRowCountBeforeFinalise = targetBeforeFinalise.rowCount;
    result.targetBeforeFinaliseSha256 = targetBeforeFinalise.sha256;
    result.targetSequencesBeforeFinalise = sequences;
    if (DEFER_TARGET_DIGEST_UNTIL_PRECOMMIT) {
      result.targetRowCountDuringRehearsal = targetBeforeFinalise.rowCount;
      result.matchedSourceRowCount = targetBeforeFinalise.rowCount;
      result.matchedTargetSha256 = targetBeforeFinalise.sha256;
    }
    result.preCommitMatched = targetBeforeFinalise.rowCount === plan.expectedFinalRowCount
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
  recordTransferPhase('precommit_verified', { selectedTableCount: results.length });
  recordTransferPhase('target_finalise_started', { action: TRANSFER_MODE !== 'rehearse' ? 'commit' : 'rollback' });
  if (TRANSFER_MODE !== 'rehearse') await target.query('commit');
  else await target.query('rollback');
  targetTransactionOpen = false;
  resetRawSourceRecordCopyStagePreparation(target);
  recordTransferPhase('target_finalise_returned', { action: TRANSFER_MODE !== 'rehearse' ? 'commit' : 'rollback' });

  await target.query('begin transaction isolation level repeatable read read only');
  targetTransactionOpen = true;
  recordTransferPhase('postfinalise_verification_snapshot_open');

  if (OPTIMIZE_RAW_SOURCE_RECORD_LOAD) {
    const postCommitIndexes = await verifyRawSourceRecordIndexes(
      target,
      rawSourceRecordIndexSnapshot,
      'postcommit',
    );
    rawSourceRecordBulkLoad.postCommit = rawSourceRecordIndexEvidence(postCommitIndexes);
    recordTransferPhase('raw_source_record_indexes_postcommit_verified', {
      indexCount: postCommitIndexes.count,
      fingerprint: postCommitIndexes.fingerprint,
    });
  }

  selfReferentialForeignKeySafety.postFinalise =
    await verifySelfReferentialForeignKeysAfterFinalise(
      target,
      tableConfig.tables,
      selfReferentialForeignKeySafety.prepared,
    );

  for (const result of results) {
    const metadata = await tableMetadata(target, result.table);
    const plan = tablePlans.get(result.table);
    const targetAfterFinalise = await digestTable(
      target,
      result.table,
      metadata.primaryKey,
      TRANSFER_MODE !== 'rehearse' ? plan.contract.transferColumns : null,
      {
        metadata,
        preserveJsonbText: OPTIMIZE_RAW_SOURCE_RECORD_LOAD
          && TRANSFER_MODE !== 'rehearse'
          && result.table === RAW_SOURCE_RECORD_TABLE,
      },
    );
    const sequences = await ownedSequenceStates(target, result.table, metadata);
    if (TRANSFER_MODE !== 'rehearse') {
      result.targetRowCountAfterCommit = targetAfterFinalise.rowCount;
      result.targetAfterCommitSha256 = targetAfterFinalise.sha256;
      result.targetSequencesAfterCommit = sequences;
      result.commitMatched = targetAfterFinalise.rowCount === plan.expectedFinalRowCount
        && result.targetAfterCommitSha256 === result.expectedFinalSha256
        && stableJson(sequences) === stableJson(result.targetSequencesDuringRehearsal);
      if (!result.commitMatched) throw new Error(`target_postcommit_observation_mismatch:${result.table}`);
    } else {
      result.targetRowCountAfterRollback = targetAfterFinalise.rowCount;
      result.targetAfterRollbackSha256 = targetAfterFinalise.sha256;
      result.targetSequencesAfterRollback = sequences;
      result.rollbackMatched = targetAfterFinalise.rowCount === result.targetRowCountBefore
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

  await target.query('rollback');
  targetTransactionOpen = false;
  recordTransferPhase('postfinalise_verification_snapshot_closed');

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
    statementTimeoutMs: TRANSFER_STATEMENT_TIMEOUT_MS,
    rowBatchSize: TRANSFER_ROW_BATCH_SIZE,
    initialConnection: {
      configuredAttempts: INITIAL_CONNECTION_ATTEMPTS,
      retryDelayMs: INITIAL_CONNECTION_RETRY_DELAY_MS,
      sourceAttemptsUsed: sourceConnectionAttempts,
      targetAttemptsUsed: targetConnectionAttempts,
    },
    baselineTargetVerification,
    targetDigestStrategy: DEFER_TARGET_DIGEST_UNTIL_PRECOMMIT
      ? 'complete_precommit_and_postcommit'
      : 'per_table_transfer_then_complete_precommit_and_postcommit',
    rawSourceRecordBulkLoad,
    targetSchemaStability,
    foreignKeySafety,
    selfReferentialForeignKeySafety,
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
  if (targetTransactionOpen && target) await target.query('rollback').catch(() => {});
  if (target) resetRawSourceRecordCopyStagePreparation(target);
  if (sourceTransactionOpen && source) await source.query('rollback').catch(() => {});
  await Promise.allSettled([
    source?.end() ?? Promise.resolve(),
    target?.end() ?? Promise.resolve(),
  ]);
}
