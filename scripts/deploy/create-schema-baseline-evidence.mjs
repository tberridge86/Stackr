import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function argument(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function readRequired(filePath, label) {
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`${label}_missing`);
  }
  const content = readFileSync(filePath, 'utf8');
  if (!content.trim()) throw new Error(`${label}_empty`);
  return content;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function countMatches(content, expression) {
  return Array.from(content.matchAll(expression)).length;
}

function copyRowCount(content) {
  let inCopy = false;
  let count = 0;
  for (const line of content.split(/\r?\n/)) {
    if (/^COPY\s+/i.test(line)) {
      inCopy = true;
      continue;
    }
    if (inCopy && line === '\\.') {
      inCopy = false;
      continue;
    }
    if (inCopy && line) count += 1;
  }
  return count;
}

function referenceDataInventory(content) {
  const targetTables = [];
  let inCopy = false;
  let rows = 0;

  for (const line of content.split(/\r?\n/)) {
    const copy = line.match(/^COPY\s+(?:ONLY\s+)?(?:(?:"([^"]+)"|([A-Za-z_][\w$]*))\.)?(?:"([^"]+)"|([A-Za-z_][\w$]*))\s+\(/i);
    if (copy) {
      const schema = copy[1] ?? copy[2];
      const table = copy[3] ?? copy[4];
      if (!schema || !['catalog', 'ingest'].includes(schema)) {
        throw new Error('reference_data_copy_target_outside_catalog_or_ingest');
      }
      targetTables.push(`${schema}.${table}`);
      inCopy = true;
      continue;
    }
    if (inCopy && line === '\\.') {
      inCopy = false;
      continue;
    }
    if (inCopy && line) rows += 1;
  }

  if (rows === 0) throw new Error('reference_data_rows_missing');
  return { rows, targetTables: Array.from(new Set(targetTables)).sort() };
}

export function createSchemaBaselineEvidence({ schema, historySchema, historyData, referenceData }) {
  if (/^COPY\s+/im.test(schema)) throw new Error('schema_dump_contains_copy_data');
  if (!referenceData?.trim()) throw new Error('reference_data_empty');

  const schemas = Array.from(schema.matchAll(/^CREATE SCHEMA\s+"?([^";\s]+)"?/gim))
    .map((match) => match[1])
    .sort();
  const referenceInventory = referenceDataInventory(referenceData);

  return {
    schemaVersion: 'stackr-production-schema-baseline-v1.1.0',
    generatedAt: new Date().toISOString(),
    sourceProjectRef: process.env.SUPABASE_PRODUCTION_PROJECT_REF ?? null,
    productionMutationPerformed: false,
    customerTableDataIncluded: false,
    catalogueReferenceDataIncluded: true,
    referenceDataSchemas: ['catalog', 'ingest'],
    files: {
      schema: { bytes: Buffer.byteLength(schema), sha256: sha256(schema) },
      migrationHistorySchema: {
        bytes: Buffer.byteLength(historySchema),
        sha256: sha256(historySchema),
      },
      migrationHistoryData: {
        bytes: Buffer.byteLength(historyData),
        sha256: sha256(historyData),
      },
      referenceData: {
        bytes: Buffer.byteLength(referenceData),
        sha256: sha256(referenceData),
      },
    },
    inventory: {
      schemas,
      tables: countMatches(schema, /^CREATE TABLE\s+/gim),
      views: countMatches(schema, /^CREATE(?: OR REPLACE)? VIEW\s+/gim),
      materializedViews: countMatches(schema, /^CREATE MATERIALIZED VIEW\s+/gim),
      functions: countMatches(schema, /^CREATE(?: OR REPLACE)? FUNCTION\s+/gim),
      triggers: countMatches(schema, /^CREATE TRIGGER\s+/gim),
      policies: countMatches(schema, /^CREATE POLICY\s+/gim),
      extensions: countMatches(schema, /^CREATE EXTENSION\s+/gim),
      migrationHistorySchemaPresent: !historySchema.includes(
        'stackr: supabase_migrations schema absent on source',
      ),
      migrationHistoryRows: copyRowCount(historyData),
      referenceDataRows: referenceInventory.rows,
      referenceDataTargetTables: referenceInventory.targetTables,
    },
  };
}

function main() {
  const schema = readRequired(argument('schema'), 'schema_dump');
  const historySchema = readRequired(argument('history-schema'), 'migration_history_schema');
  const historyData = readRequired(argument('history-data'), 'migration_history_data');
  const referenceData = readRequired(argument('reference-data'), 'reference_data');
  const outputPath = argument('output');
  if (!outputPath) throw new Error('evidence_output_missing');

  const evidence = createSchemaBaselineEvidence({ schema, historySchema, historyData, referenceData });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8' });
  console.log(JSON.stringify(evidence, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`create_schema_baseline_evidence_failed:${error.message}`);
    process.exitCode = 1;
  }
}
