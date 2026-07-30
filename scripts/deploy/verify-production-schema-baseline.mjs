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
const errors = [];

if (!directory || !expectedSchemaSha256) {
  console.error('baseline_directory_and_checksum_required');
  process.exit(1);
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
  if (evidence.inventory?.migrationHistorySchemaPresent !== false) {
    errors.push('unexpected_production_migration_history_schema');
  }
  if (evidence.inventory?.migrationHistoryRows !== 0) {
    errors.push('unexpected_production_migration_history_rows');
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
  errors,
}, null, 2));
if (errors.length) process.exit(1);
