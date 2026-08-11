import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';

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
  process.env.STACKR_REQUIRED_CATALOGUE_LANGUAGES ?? 'en,ja,zh-tw,zh-cn,ko',
).split(',').map((value) => value.trim()).filter(Boolean);
const TABLE_CONFIG_PATH = process.env.STACKR_TRANSFER_TABLE_CONFIG
  ?? 'deploy/staging-catalogue-preservation-tables.json';

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

const source = await connect(SOURCE_DB_URL, 'stackr-staging-catalogue-source');
const target = await connect(TARGET_DB_URL, 'stackr-staging-catalogue-rehearsal');
const results = [];
const excludedChecks = [];
const snapshots = new Map();
let targetTransactionOpen = false;
let sourceTransactionOpen = false;
let sourceReleaseVersions = [];

try {
  await source.query('begin transaction isolation level repeatable read read only');
  sourceTransactionOpen = true;
  await target.query('begin transaction isolation level repeatable read');
  targetTransactionOpen = true;

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
      result.commitMatched = rows.length === result.sourceRowCount
        && result.targetAfterCommitSha256 === result.sourceSha256
        && stableJson(sequences) === stableJson(result.targetSequencesDuringRehearsal);
      if (!result.commitMatched) throw new Error(`target_commit_mismatch:${result.table}`);
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

  let targetReleaseVersions = [];
  let productionAssetUrlRewriteCount = 0;
  if (TRANSFER_MODE === 'promote') {
    targetReleaseVersions = verifyReleaseCatalogueVersions(
      await releaseCatalogueVersions(target),
      'target',
    );
    if (digestRows(targetReleaseVersions) !== digestRows(sourceReleaseVersions)) {
      throw new Error('production_release_versions_mismatch');
    }
    const rewritten = await target.query(`
      update catalog.assets
      set url = replace(url, $1, $2), updated_at = now()
      where storage_provider = 'supabase_storage'
        and storage_bucket = 'stackr-catalogue-public'
        and url like '%' || $1 || '%'
    `, [SOURCE_PROJECT_REF, TARGET_PROJECT_REF]);
    productionAssetUrlRewriteCount = rewritten.rowCount;
    const staleUrls = Number((await target.query(`
      select count(*)::integer as count
      from catalog.assets
      where storage_provider = 'supabase_storage'
        and storage_bucket = 'stackr-catalogue-public'
        and url like '%' || $1 || '%'
    `, [SOURCE_PROJECT_REF])).rows[0].count);
    if (staleUrls !== 0) throw new Error('production_asset_url_rewrite_incomplete');
  }

  await source.query('rollback');
  sourceTransactionOpen = false;

  const evidence = {
    schemaVersion: TRANSFER_MODE === 'promote'
      ? 'stackr-production-catalogue-data-promotion-evidence-v1.0.0'
      : 'stackr-staging-catalogue-transfer-evidence-v1.4.0',
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
          productionAssetUrlRewriteCount,
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
