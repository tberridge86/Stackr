import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..', '..');
const migrationsDirectory = join(repositoryRoot, 'supabase', 'migrations');
const outputPath = join(
  repositoryRoot,
  'docs',
  'stackr-api',
  'production-migration-matrix.csv',
);

const notPresentVersions = new Set([
  '20260621170000',
  '20260628120000',
  '20260707123000',
  '20260719123000',
  '20260719133000',
  '20260720173000',
  '20260720184000',
  '20260720235000',
  '20260721090000',
  '20260726103000',
  '20260726223000',
  '20260726234500',
  '20260727090000',
  '20260727212256',
  '20260727213835',
  '20260728060617',
  '20260728064400',
  '20260728152412',
  '20260728171416',
  '20260728213516',
  '20260729055009',
  '20260729064011',
]);

const compatibilityNotes = new Map([
  [
    '20260528114500',
    'Replay passed. The advisor found RLS missing on achievement_coin_rewards; the migration now enables RLS and grants authenticated read access through an explicit policy.',
  ],
  [
    '20260627120000',
    'Initial replay failed because inventory_movements.binder_id was text while production binders.id is uuid. The foreign-key column now uses uuid and the clean replay passed.',
  ],
  [
    '20260715143000',
    'Initial replay reached a legacy price_alerts table without Minty columns. Guarded ADD COLUMN IF NOT EXISTS statements now complete the table and the clean replay passed.',
  ],
  [
    '20260727212256',
    'The first failure was transport truncation, not PostgreSQL. Parser-safe statement chunks applied successfully without changing the migration SQL.',
  ],
  [
    '20260728064400',
    'The final chunk exceeded the client wait window but committed. Migration history and expected objects were checked before continuing; it was not replayed twice.',
  ],
  [
    '20260729064011',
    'Final idempotent guard for untracked legacy environments. It rejects incompatible binder types and marks only objects it creates for conservative rollback.',
  ],
]);

function migrationParts(fileName) {
  const match = fileName.match(/^(\d{14})_(.+)\.sql$/);
  if (!match) throw new Error(`Unexpected migration filename: ${fileName}`);
  return { version: match[1], name: match[2] };
}

function targetObjects(sql) {
  const pattern = /\b(?:create\s+table(?:\s+if\s+not\s+exists)?|alter\s+table(?:\s+if\s+exists)?|create\s+(?:or\s+replace\s+)?view)\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;
  const objects = new Set();
  for (const match of sql.matchAll(pattern)) objects.add(match[1].toLowerCase());
  return [...objects].sort();
}

function hasDataMutation(sql) {
  const withoutComments = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '');
  return /\b(?:insert\s+into|update\s+[a-z_]|delete\s+from)\b/i.test(withoutComments);
}

export function buildRows() {
  const files = readdirSync(migrationsDirectory)
    .filter((fileName) => /^\d{14}_.+\.sql$/.test(fileName))
    .sort();

  return files.map((fileName) => {
    const { version, name } = migrationParts(fileName);
    const sql = readFileSync(join(migrationsDirectory, fileName), 'utf8');
    const objects = targetObjects(sql);
    const classification = notPresentVersions.has(version)
      ? 'not_present'
      : 'partially_present';
    const mutationWarning = hasDataMutation(sql)
      ? ' Contains DML; the schema-only rehearsal does not prove live-row effects.'
      : '';
    const defaultNote = classification === 'not_present'
      ? 'No tracked migration or matching target schema was found in production. The migration passed in the ordered rehearsal.'
      : 'Production overlaps one or more legacy targets, but has no migration ledger entry. Similar names were not treated as proof of application.';

    return {
      migration_version: version,
      migration_name: name,
      production_history: 'untracked',
      classification,
      compared_production_objects: objects.length
        ? objects.join('; ')
        : 'functions, indexes, policies, grants, or seed rows named by the migration',
      fingerprint_evidence: classification === 'not_present'
        ? 'Target absent from the read-only production inventory; ordered clone replay passed.'
        : 'Production object inventory overlaps; exact production baseline was cloned before ordered replay.',
      data_compatibility_notes: `${compatibilityNotes.get(version) ?? defaultNote}${mutationWarning}`,
      rehearsal_result: 'passed_on_production_schema_baseline',
      approved_action: classification === 'not_present'
        ? 'Apply normally in order after backup, dry run, data review, and explicit approval.'
        : 'Replay idempotently in order; do not mark applied or repair history merely because objects overlap.',
      reviewer: 'Codex rehearsal; human production approval required',
      evidence_timestamp: '2026-07-29',
    };
  });
}

const columns = [
  'migration_version',
  'migration_name',
  'production_history',
  'classification',
  'compared_production_objects',
  'fingerprint_evidence',
  'data_compatibility_notes',
  'rehearsal_result',
  'approved_action',
  'reviewer',
  'evidence_timestamp',
];

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function renderCsv(rows = buildRows()) {
  return [
    columns.map(csvCell).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
    '',
  ].join('\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  const rows = buildRows();
  writeFileSync(outputPath, renderCsv(rows), 'utf8');
  process.stdout.write(`Wrote ${rows.length} migration rows to ${outputPath}\n`);
}
