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
const expectedHistoryCount = argument('expected-history-count');
const errors = [];

if (!directory || !expectedSchemaSha256) {
  console.error('baseline_directory_and_checksum_required');
  process.exit(1);
}
if (Boolean(expectedHistoryVersion) !== Boolean(expectedHistoryName)) {
  errors.push('baseline_expected_history_identity_incomplete');
}
if (Boolean(expectedHistoryVersion) !== Boolean(expectedHistoryCount)) {
  errors.push('baseline_expected_history_count_incomplete');
}
if (expectedHistoryCount && (!/^\d+$/.test(expectedHistoryCount) || Number(expectedHistoryCount) < 1)) {
  errors.push('baseline_expected_history_count_invalid');
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

const paths = {
  evidence: path.join(directory, 'baseline-evidence.json'),
  schema: path.join(directory, 'production-schema.sql'),
  historySchema: path.join(directory, 'migration-history-schema.sql'),
  historyData: path.join(directory, 'migration-history-data.sql'),
};
for (const [label, filePath] of Object.entries(paths)) {
  if (!existsSync(filePath)) errors.push(`baseline_file_missing:${label}`);
}

if (!errors.length) {
  const evidence = JSON.parse(readFileSync(paths.evidence, 'utf8'));
  const schema = readFileSync(paths.schema, 'utf8');
  const historySchema = readFileSync(paths.historySchema, 'utf8');
  const historyData = readFileSync(paths.historyData, 'utf8');

  if (evidence.schemaVersion !== 'stackr-production-schema-baseline-v1.0.0') {
    errors.push('baseline_evidence_version_invalid');
  }
  if (evidence.sourceProjectRef !== 'oakdbbzdqwurpjnoqhmu') {
    errors.push('baseline_source_project_mismatch');
  }
  if (evidence.productionMutationPerformed !== false) errors.push('baseline_claims_production_mutation');
  if (evidence.customerTableDataIncluded !== false) errors.push('baseline_claims_customer_data');
  const expectedHistoryRows = expectedHistoryCount ? Number(expectedHistoryCount) : 0;
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
    const [version, , name] = historyRows.at(-1);
    if (version !== expectedHistoryVersion || name !== expectedHistoryName) {
      errors.push('production_migration_history_identity_mismatch');
    }
  }
  if (/^COPY\s+/im.test(schema)) errors.push('baseline_schema_contains_table_data');

  const checksums = {
    schema: sha256(schema),
    migrationHistorySchema: sha256(historySchema),
    migrationHistoryData: sha256(historyData),
  };
  if (checksums.schema !== expectedSchemaSha256) errors.push('baseline_expected_schema_checksum_mismatch');
  for (const [label, checksum] of Object.entries(checksums)) {
    if (checksum !== evidence.files?.[label]?.sha256) {
      errors.push(`baseline_evidence_checksum_mismatch:${label}`);
    }
  }
}

console.log(JSON.stringify({
  ok: errors.length === 0,
  sourceProjectRef: 'oakdbbzdqwurpjnoqhmu',
  expectedSchemaSha256,
  expectedHistoryCount: expectedHistoryCount ? Number(expectedHistoryCount) : null,
  expectedHistoryVersion: expectedHistoryVersion ?? null,
  expectedHistoryName: expectedHistoryName ?? null,
  errors,
}, null, 2));
if (errors.length) process.exit(1);
