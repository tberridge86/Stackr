import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dmlReviewVersions, dmlReviews } from './migration-reconciliation/dmlImpact.mjs';
import { buildRows, hasDataMutation, renderCsv } from './migration-reconciliation/generateMatrix.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = resolve(root, 'supabase', 'migrations');
const migrationFiles = readdirSync(migrationDirectory)
  .filter((fileName) => /^\d{14}_.+\.sql$/.test(fileName))
  .sort();
const rows = buildRows();

assert.equal(migrationFiles.length, 72, 'Production readiness must cover exactly 72 migrations.');
assert.equal(rows.length, migrationFiles.length);

const detectedDmlVersions = migrationFiles
  .filter((fileName) => hasDataMutation(readFileSync(resolve(migrationDirectory, fileName), 'utf8')))
  .map((fileName) => fileName.slice(0, 14));

assert.deepEqual(
  detectedDmlVersions,
  [...dmlReviewVersions],
  'Every migration containing DML must have exactly one live-data review.',
);
assert.equal(dmlReviews.size, 22, 'The reviewed migration chain contains 22 DML-bearing migrations.');
assert.ok(rows.every((row) => row.dml_review_status !== 'unreviewed'));
assert.ok(rows.every((row) => row.dml_scope !== 'none' || row.dml_review_status === 'not_applicable'));
assert.ok(rows.every((row) => row.dml_scope === 'none' || row.production_data_impact.length > 20));

const matrixPath = resolve(root, 'docs', 'stackr-api', 'production-migration-matrix.csv');
assert.equal(readFileSync(matrixPath, 'utf8'), renderCsv(rows), 'Regenerate the migration matrix.');

const requiredDocuments = [
  'production-dry-run-report.md',
  'production-live-data-impact-review.md',
  'production-migration-execution-plan.md',
  'prompt-6-production-readiness.md',
];
const documents = requiredDocuments.map((name) =>
  readFileSync(resolve(root, 'docs', 'stackr-api', name), 'utf8'));
const combined = documents.join('\n');

assert.match(combined, /npx supabase@latest db push[\s\S]*--linked[\s\S]*--dry-run[\s\S]*--include-all/i);
assert.match(combined, /LegacyProjectNotLinkedError/);
assert.match(combined, /Production remains \*\*NO-GO\*\*/i);
assert.match(combined, /72 migrations/i);
assert.match(combined, /981 owned-card identity rows/i);
assert.match(combined, /four security-advisor errors/i);

for (const document of documents) {
  const codeBlocks = [...document.matchAll(/```(?:powershell|bash|sh)?\n([\s\S]*?)```/g)]
    .map((match) => match[1]);
  for (const block of codeBlocks) {
    if (/supabase@latest db push/i.test(block)) {
      assert.match(block, /--dry-run/i, 'Documentation must not contain a runnable production db push without --dry-run.');
    }
    assert.doesNotMatch(block, /migration\s+repair/i);
    assert.doesNotMatch(block, /db\s+reset\s+--linked/i);
  }
}

const workflow = readFileSync(resolve(root, '.github', 'workflows', 'catalogue-ingestion-ci.yml'), 'utf8');
assert.match(workflow, /npm run test:production-readiness/);
assert.doesNotMatch(workflow, /supabase(?:@latest)?\s+db\s+push/i);
assert.doesNotMatch(workflow, /supabase(?:@latest)?\s+migration\s+repair/i);

console.log('Production readiness evidence tests passed.');
