import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRows, renderCsv } from './migration-reconciliation/generateMatrix.mjs';
import { sqlChunks, sqlStatementEnds } from './migration-reconciliation/sqlChunks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = resolve(root, 'supabase', 'migrations');
const migrationFiles = readdirSync(migrationDirectory)
  .filter((fileName) => /^\d{14}_.+\.sql$/.test(fileName))
  .sort();
const rows = buildRows();

assert.equal(migrationFiles.length, 72, 'Prompt 5 evidence must cover all 72 migrations.');
assert.equal(rows.length, migrationFiles.length);
assert.deepEqual(
  rows.map((row) => `${row.migration_version}_${row.migration_name}.sql`),
  migrationFiles,
  'Each migration must appear exactly once and in order.',
);
assert.equal(new Set(rows.map((row) => row.migration_version)).size, rows.length);
assert.ok(rows.every((row) => ['partially_present', 'not_present'].includes(row.classification)));
assert.ok(rows.every((row) => row.production_history === 'untracked'));

const matrixPath = resolve(root, 'docs', 'stackr-api', 'production-migration-matrix.csv');
assert.equal(readFileSync(matrixPath, 'utf8'), renderCsv(rows), 'Regenerate the migration matrix.');

const inventoryRepair = readFileSync(
  resolve(migrationDirectory, '20260627120000_inventory_movements_and_binder_schema_repair.sql'),
  'utf8',
);
assert.match(inventoryRepair, /binder_id uuid(?: null)? references public\.binders\(id\)/i);
assert.doesNotMatch(inventoryRepair, /binder_id text(?: null)? references public\.binders\(id\)/i);

const mintyMigration = readFileSync(
  resolve(migrationDirectory, '20260715143000_minty_insight_platform.sql'),
  'utf8',
);
for (const column of [
  'stackr_card_id',
  'product_key',
  'language',
  'raw_or_graded',
  'grader',
  'grade',
  'target_price_gbp',
  'active',
  'updated_at',
]) {
  assert.match(mintyMigration, new RegExp(`add column if not exists ${column}\\b`, 'i'));
}

const rewardMigration = readFileSync(
  resolve(migrationDirectory, '20260528114500_server_side_coin_awards.sql'),
  'utf8',
);
assert.match(rewardMigration, /alter table public\.achievement_coin_rewards enable row level security/i);
assert.match(rewardMigration, /to authenticated\s+using \(true\)/i);

const preflight = readFileSync(
  resolve(migrationDirectory, '20260729064011_legacy_production_migration_preflight.sql'),
  'utf8',
);
assert.match(preflight, /Expected public\.binders\.id to be uuid/i);
assert.match(preflight, /Created by 20260729064011 legacy production migration preflight\./i);
assert.match(preflight, /add column if not exists active boolean not null default true/i);

const rollback = readFileSync(
  resolve(root, 'supabase', 'manual', 'rollback_20260729064011_legacy_production_migration_preflight.sql'),
  'utf8',
);
assert.match(rollback, /Rollback blocked: inventory_movements contains data/i);
assert.match(rollback, /Rollback blocked: price_alerts\.active contains changed values/i);
assert.match(rollback, /col_description/i);

const parserFixture = `
-- semicolon ; in a comment
create table public.parser_fixture (value text default ';');
/* another ; comment */
create function public.parser_fixture_fn() returns void language plpgsql as $body$
begin
  perform ';';
end;
$body$;
select "semi;colon";
`;
assert.equal(sqlStatementEnds(parserFixture).length, 4, 'Three statements plus trailing whitespace.');
const chunks = sqlChunks(parserFixture, 90);
assert.ok(chunks.length > 1);
assert.equal(chunks.map(({ start, length }) => parserFixture.slice(start, start + length)).join(''), parserFixture);

console.log('Production migration reconciliation tests passed.');
