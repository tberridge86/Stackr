import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManualCsvSourceAdapter, parseManualCsv } from './catalogue-ingestion/manualAdapters';
import {
  calculateExponentialBackoff,
  payloadChecksum,
} from './catalogue-ingestion/pipeline';
import {
  collectorNumberParts,
  proposedCanonicalKey,
} from './catalogue-ingestion/sourceAdapter';

const migration = readFileSync('supabase/migrations/20260727213835_stackr_data_ingestion_reconciliation.sql', 'utf8');
const rawHistoryMigration = readFileSync('supabase/migrations/20260730153923_preserve_raw_source_record_history.sql', 'utf8');
const ingestionPipeline = readFileSync('scripts/catalogue-ingestion/pipeline.ts', 'utf8');
const backendRoute = readFileSync('backend/routes/catalogueIngestion.js', 'utf8');

function expectSql(pattern: RegExp, message: string) {
  assert.match(migration, pattern, message);
}

function rejectSql(pattern: RegExp, message: string) {
  assert.doesNotMatch(migration, pattern, message);
}

function assertMigrationAddsIngestionState() {
  for (const table of [
    'ingest.import_checkpoints',
    'ingest.work_queue',
    'ingest.provider_schedule_policies',
    'ingest.source_health_reports',
    'audit.ingest_merge_decisions',
  ]) {
    expectSql(new RegExp(`create table if not exists ${table.replace('.', '\\.')}`), `missing ${table}`);
  }

  for (const queue of [
    'catalogue_ingestion',
    'asset_processing',
    'embedding_generation',
    'price_refresh',
    'conflict_review',
  ]) {
    expectSql(new RegExp(`'${queue}'`), `missing durable queue ${queue}`);
  }

  expectSql(/add column if not exists http_metadata jsonb not null default '\{\}'::jsonb/, 'raw records must retain HTTP metadata');
  expectSql(/provider_record_id text/, 'raw records must retain provider record IDs separately');
  expectSql(/dead_letter/, 'queue must support dead-letter state');
  expectSql(/attempts integer not null default 0/, 'queue must track attempts');
  expectSql(/backoff_seconds integer not null default 60/, 'queue must track retry backoff');
  expectSql(/create or replace function ingest\.next_retry_at/, 'migration must include exponential backoff helper');
  expectSql(/check \(enabled = false or automated_refresh_allowed = true\)/, 'scheduled jobs must require terms approval');
  expectSql(/create or replace view ingest\.catalogue_quality_report/, 'missing private quality report view');
  expectSql(/expected_set_total/, 'quality report must show expected set totals');
  expectSql(/imported_set_total/, 'quality report must show imported set totals');
  expectSql(/expected_vs_imported_set_delta/, 'quality report must show set total deltas');
  expectSql(/cards_missing_images/, 'quality report must show cards missing images');
  expectSql(/set_missing_logo/, 'quality report must show sets missing logos');
  expectSql(/duplicate_canonical_keys/, 'quality report must show duplicate canonical keys');
  expectSql(/records_without_legal_use_status/, 'quality report must show legal-use gaps');
  expectSql(/create policy "ingest service role manages work queue"/, 'work queue must be service-only under RLS');
  expectSql(/revoke all on all tables in schema ingest from anon, authenticated;/, 'private ingest tables must not be exposed');
  rejectSql(/auth\.role\(/, 'new migration must not use deprecated auth.role()');
  rejectSql(/\bvector\s*\(/i, 'Stage 3 must not add vector columns');
}

function assertIdentityHelpers() {
  const keyA = proposedCanonicalKey({
    gameCode: 'pokemon',
    languageCode: 'ja',
    setId: 'set-uuid',
    collectorNumber: '001/184',
    variantCode: 'master_ball',
  });
  const keyB = proposedCanonicalKey({
    gameCode: 'pokemon',
    languageCode: 'ja',
    setId: 'set-uuid',
    collectorNumber: '001/184',
    variantCode: 'normal',
  });
  assert.notEqual(keyA, keyB, 'variant must participate in canonical key');
  assert.equal(keyA.includes('pikachu'), false, 'card name must not participate in canonical key');

  const parts = collectorNumberParts('SV-P 001/190a');
  assert.equal(parts.collectorNumberPrefix, 'SV-P ');
  assert.equal(parts.collectorNumberSort, 1);
  assert.equal(parts.collectorNumberSuffix, '/190a');
  assert.ok(parts.collectorNumberSortKey.includes('000000000001'));
}

function assertRawRecordHistoryIsRetainedPerRun() {
  assert.match(rawHistoryMigration, /drop index if exists ingest\.raw_source_records_identity_uidx/);
  assert.match(
    rawHistoryMigration,
    /create unique index if not exists raw_source_records_import_run_identity_uidx[\s\S]+source_id,[\s\S]+import_run_id,[\s\S]+record_type,[\s\S]+external_id/,
  );
  assert.match(rawHistoryMigration, /where import_run_id is not null/);
  assert.match(
    ingestionPipeline,
    /table\(db, 'ingest', 'raw_source_records'\)[\s\S]+\.eq\('import_run_id', importRunId\)/,
  );
}

function assertChecksumsAndBackoff() {
  assert.equal(
    payloadChecksum({ b: 2, a: 1 }),
    payloadChecksum({ a: 1, b: 2 }),
    'payload checksum must be deterministic across key order',
  );
  assert.equal(calculateExponentialBackoff(0, 60).seconds, 60);
  assert.equal(calculateExponentialBackoff(3, 60).seconds, 480);
  assert.equal(calculateExponentialBackoff(20, 60, 600).seconds, 600);
}

async function assertManualCsvAdapter() {
  const rows = parseManualCsv('id,name,collector_number,variant\n"row,1","Pikachu",001/184,Master Ball\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'row,1');
  assert.equal(rows[0].variant, 'Master Ball');

  const dir = mkdtempSync(join(tmpdir(), 'stackr-ingest-test-'));
  const file = join(dir, 'catalogue.csv');
  try {
    writeFileSync(file, [
      'record_type,provider_record_id,language,set_code,set_name,name,collector_number,variant,licence_status,image_url',
      'set,set-1,en,SV1,Scarlet Violet,,,,approved,',
      'card,card-1,en,SV1,Scarlet Violet,Pikachu,001/184,master_ball,approved,https://example.invalid/pikachu.png',
    ].join('\n'));

    const adapter = new ManualCsvSourceAdapter({ filePath: file });
    const source = adapter.identifySource();
    assert.equal(source.code, 'stackr_manual');
    assert.equal(source.automatedRefreshAllowed, false);

    const health = await adapter.healthCheck();
    assert.equal(health.status, 'ok');

    const cards = await adapter.fetchCards({ language: 'en' });
    const collected = [];
    for await (const card of cards) collected.push(card);
    assert.equal(collected.length, 1);
    const validation = adapter.validateRecord(collected[0]);
    assert.equal(validation.ok, true);
    const normalised = adapter.normaliseRecord(collected[0]);
    assert.equal(normalised.languageCode, 'en');
    assert.equal(normalised.collectorNumber, '001/184');
    assert.equal(normalised.variantCode, 'master_ball');
    assert.equal(normalised.imageUrl, 'https://example.invalid/pikachu.png');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertBackendRouteIsProtected() {
  assert.match(backendRoute, /STACKR_ADMIN_API_KEY \|\| process\.env\.ADMIN_API_KEY/, 'admin route must use existing admin key pattern');
  assert.match(backendRoute, /\/:command\(run-source\|run-language\|run-set\|resume-import\|rebuild-record\)/, 'admin route must support required commands');
  assert.match(backendRoute, /mode: 'queued'/, 'endpoint should enqueue durable work instead of running unbounded provider fetches inline');
  assert.doesNotMatch(backendRoute, /SUPABASE_SERVICE_ROLE_KEY.*json/i, 'route must not serialize service credentials');
}

async function main() {
  assertMigrationAddsIngestionState();
  assertIdentityHelpers();
  assertRawRecordHistoryIsRetainedPerRun();
  assertChecksumsAndBackoff();
  await assertManualCsvAdapter();
  assertBackendRouteIsProtected();

  console.log('Catalogue ingestion framework tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
