import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function argument(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

const directory = argument('directory');
const expectedSchemaSha256 = argument('expected-schema-sha256');
const expectedHistoryVersion = argument('expected-history-version');
const expectedHistoryName = argument('expected-history-name');
const expectedHistoryCountRaw = argument('expected-history-count');
const transferTableConfigPath = argument('transfer-table-config');
const expectedHistoryCount = expectedHistoryCountRaw == null
  ? (expectedHistoryVersion ? 1 : 0)
  : Number(expectedHistoryCountRaw);
const errors = [];

if (!directory || !expectedSchemaSha256) {
  console.error('baseline_directory_and_checksum_required');
  process.exit(1);
}
if (Boolean(expectedHistoryVersion) !== Boolean(expectedHistoryName)) {
  errors.push('baseline_expected_history_identity_incomplete');
}
if (!Number.isSafeInteger(expectedHistoryCount) || expectedHistoryCount < 0) {
  errors.push('baseline_expected_history_count_invalid');
}
if (expectedHistoryCount > 0 && (!expectedHistoryVersion || !expectedHistoryName)) {
  errors.push('baseline_expected_history_identity_required');
}
if (expectedHistoryCount === 0 && (expectedHistoryVersion || expectedHistoryName)) {
  errors.push('baseline_expected_history_identity_unexpected');
}

function migrationHistoryRows(content) {
  const rows = [];
  let inCopy = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^COPY\s+"supabase_migrations"\."schema_migrations"\s+/i.test(line)) {
      inCopy = true;
      continue;
    }
    if (inCopy && line === '\\.') break;
    if (inCopy && line) rows.push(line.split('\t'));
  }
  return rows;
}

function referenceDataInventory(content) {
  const tableRowCounts = new Map();
  let inCopy = false;
  let currentTable = null;
  let rows = 0;

  for (const line of content.split(/\r?\n/)) {
    const copy = line.match(/^COPY\s+(?:ONLY\s+)?(?:(?:"([^"]+)"|([A-Za-z_][\w$]*))\.)?(?:"([^"]+)"|([A-Za-z_][\w$]*))\s+\(/i);
    if (copy) {
      if (inCopy) throw new Error('reference_data_copy_nested');
      const schema = copy[1] ?? copy[2];
      const table = copy[3] ?? copy[4];
      if (!schema || !['catalog', 'ingest'].includes(schema)) {
        throw new Error('reference_data_copy_target_outside_catalog_or_ingest');
      }
      currentTable = `${schema}.${table}`;
      if (!tableRowCounts.has(currentTable)) tableRowCounts.set(currentTable, 0);
      inCopy = true;
      continue;
    }
    if (inCopy && line === '\\.') {
      inCopy = false;
      currentTable = null;
      continue;
    }
    if (inCopy) {
      rows += 1;
      tableRowCounts.set(currentTable, tableRowCounts.get(currentTable) + 1);
    }
  }
  if (inCopy) throw new Error('reference_data_copy_unterminated');

  const sortedTableRows = [...tableRowCounts.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right));
  return {
    rows,
    targetTables: sortedTableRows.map(([table]) => table),
    tableRows: Object.fromEntries(sortedTableRows),
  };
}

function readTransferTableConfig(filePath) {
  let config;
  try {
    config = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error('baseline_transfer_table_config_unreadable');
  }
  if (
    config === null
    || typeof config !== 'object'
    || Array.isArray(config)
    || config.schemaVersion !== 'stackr-production-catalogue-promotion-v1.0.0'
    || !Array.isArray(config.tables)
    || new Set(config.tables).size !== config.tables.length
    || !config.tables.every((table) => /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(table))
  ) {
    throw new Error('baseline_transfer_table_config_invalid');
  }
  return config;
}

const paths = {
  evidence: path.join(directory, 'baseline-evidence.json'),
  schema: path.join(directory, 'production-schema.sql'),
  historySchema: path.join(directory, 'migration-history-schema.sql'),
  historyData: path.join(directory, 'migration-history-data.sql'),
  referenceData: path.join(directory, 'production-reference-data.sql'),
};
for (const [label, filePath] of Object.entries(paths)) {
  if (!existsSync(filePath)) errors.push(`baseline_file_missing:${label}`);
}

let transferTableConfig = null;
if (transferTableConfigPath) {
  if (!existsSync(transferTableConfigPath)) {
    errors.push('baseline_transfer_table_config_missing');
  } else {
    try {
      transferTableConfig = readTransferTableConfig(transferTableConfigPath);
    } catch (error) {
      errors.push(error.message);
    }
  }
}

let referenceInventory = null;
let transferTableCoverage = null;

if (!errors.length) {
  const evidence = JSON.parse(readFileSync(paths.evidence, 'utf8'));
  const schema = readFileSync(paths.schema, 'utf8');
  const historySchema = readFileSync(paths.historySchema, 'utf8');
  const historyData = readFileSync(paths.historyData, 'utf8');
  const referenceData = readFileSync(paths.referenceData, 'utf8');

  if (evidence.schemaVersion !== 'stackr-production-schema-baseline-v1.1.0') {
    errors.push('baseline_evidence_version_invalid');
  }
  if (evidence.sourceProjectRef !== 'oakdbbzdqwurpjnoqhmu') {
    errors.push('baseline_source_project_mismatch');
  }
  if (evidence.productionMutationPerformed !== false) errors.push('baseline_claims_production_mutation');
  if (evidence.customerTableDataIncluded !== false) errors.push('baseline_claims_customer_data');
  if (evidence.catalogueReferenceDataIncluded !== true) errors.push('baseline_catalogue_reference_data_missing');
  if (
    !Array.isArray(evidence.referenceDataSchemas)
    || evidence.referenceDataSchemas.length !== 2
    || evidence.referenceDataSchemas[0] !== 'catalog'
    || evidence.referenceDataSchemas[1] !== 'ingest'
  ) errors.push('baseline_reference_data_schemas_invalid');
  const expectedHistoryRows = expectedHistoryCount;
  if (evidence.inventory?.migrationHistorySchemaPresent !== Boolean(expectedHistoryVersion)) {
    errors.push('unexpected_production_migration_history_schema');
  }
  if (evidence.inventory?.migrationHistoryRows !== expectedHistoryRows) {
    errors.push('unexpected_production_migration_history_rows');
  }
  const historyRows = migrationHistoryRows(historyData);
  if (historyRows.length !== expectedHistoryRows) {
    errors.push('production_migration_history_copy_row_count_mismatch');
  } else if (expectedHistoryVersion) {
    const [version, , name] = historyRows
      .toSorted(([leftVersion, , leftName], [rightVersion, , rightName]) => (
        leftVersion.localeCompare(rightVersion) || leftName.localeCompare(rightName)
      ))
      .at(-1);
    if (version !== expectedHistoryVersion || name !== expectedHistoryName) {
      errors.push('production_migration_history_identity_mismatch');
    }
  }
  if (/^COPY\s+/im.test(schema)) errors.push('baseline_schema_contains_table_data');

  try {
    referenceInventory = referenceDataInventory(referenceData);
    if (referenceInventory.rows === 0) errors.push('baseline_reference_data_rows_missing');
    if (evidence.inventory?.referenceDataRows !== referenceInventory.rows) {
      errors.push('baseline_reference_data_row_count_mismatch');
    }
    if (JSON.stringify(evidence.inventory?.referenceDataTargetTables) !== JSON.stringify(referenceInventory.targetTables)) {
      errors.push('baseline_reference_data_targets_mismatch');
    }
    if (transferTableConfig) {
      const transferTables = new Set(transferTableConfig.tables);
      const nonEmptyReferenceTables = Object.entries(referenceInventory.tableRows)
        .filter(([, rowCount]) => rowCount > 0)
        .map(([table]) => table);
      const coveredNonEmptyReferenceTables = nonEmptyReferenceTables
        .filter((table) => transferTables.has(table));
      const uncoveredNonEmptyReferenceTables = nonEmptyReferenceTables
        .filter((table) => !transferTables.has(table));
      const uncoveredEmptyReferenceTables = Object.entries(referenceInventory.tableRows)
        .filter(([table, rowCount]) => rowCount === 0 && !transferTables.has(table))
        .map(([table]) => table);
      transferTableCoverage = {
        configPath: transferTableConfigPath,
        configSchemaVersion: transferTableConfig.schemaVersion,
        verified: uncoveredNonEmptyReferenceTables.length === 0,
        nonEmptyReferenceTables,
        coveredNonEmptyReferenceTables,
        uncoveredNonEmptyReferenceTables,
        uncoveredEmptyReferenceTables,
      };
      if (uncoveredNonEmptyReferenceTables.length > 0) {
        errors.push(
          `baseline_nonempty_reference_table_outside_transfer_allowlist:${uncoveredNonEmptyReferenceTables.join(',')}`,
        );
      }
    }
  } catch (error) {
    errors.push(error.message);
  }

  const checksums = {
    schema: sha256(schema),
    migrationHistorySchema: sha256(historySchema),
    migrationHistoryData: sha256(historyData),
    referenceData: sha256(referenceData),
  };
  if (checksums.schema !== expectedSchemaSha256) errors.push('baseline_expected_schema_checksum_mismatch');
  for (const [label, checksum] of Object.entries(checksums)) {
    if (checksum !== evidence.files?.[label]?.sha256) {
      errors.push(`baseline_evidence_checksum_mismatch:${label}`);
    }
    if (evidence.files?.[label]?.bytes !== Buffer.byteLength({
      schema,
      migrationHistorySchema: historySchema,
      migrationHistoryData: historyData,
      referenceData,
    }[label])) {
      errors.push(`baseline_evidence_bytes_mismatch:${label}`);
    }
  }
}

console.log(JSON.stringify({
  ok: errors.length === 0,
  sourceProjectRef: 'oakdbbzdqwurpjnoqhmu',
  expectedSchemaSha256,
  expectedHistoryCount,
  expectedHistoryVersion: expectedHistoryVersion ?? null,
  expectedHistoryName: expectedHistoryName ?? null,
  referenceDataInventory: referenceInventory,
  transferTableCoverage,
  errors,
}, null, 2));
if (errors.length) process.exit(1);
