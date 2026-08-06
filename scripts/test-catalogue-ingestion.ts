import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManualCsvSourceAdapter, ManualJsonSourceAdapter, parseManualCsv } from './catalogue-ingestion/manualAdapters';
import { PikaQianSourceAdapter } from './catalogue-ingestion/providerFileAdapters';
import { TcgdexSourceAdapter, tcgdexAdapterInternals } from './catalogue-ingestion/tcgdexAdapter';
import {
  CatalogueIngestionRunner,
  calculateExponentialBackoff,
  payloadChecksum,
  runWithConcurrencyByKey,
} from './catalogue-ingestion/pipeline';
import {
  collectorNumberParts,
  normaliseLanguageCode,
  proposedCanonicalKey,
  type ProviderRecord,
  type SourceAdapter,
} from './catalogue-ingestion/sourceAdapter';

const migration = readFileSync('supabase/migrations/20260727213835_stackr_data_ingestion_reconciliation.sql', 'utf8');
const rawHistoryMigration = readFileSync('supabase/migrations/20260730153923_preserve_raw_source_record_history.sql', 'utf8');
const strictForeignMigration = readFileSync('supabase/migrations/20260801090000_strict_foreign_catalogue_import_safety.sql', 'utf8');
const recognitionRoleMigration = readFileSync('supabase/migrations/20260805200000_recognition_service_database_role.sql', 'utf8');
const ingestionPipeline = readFileSync('scripts/catalogue-ingestion/pipeline.ts', 'utf8');
const catalogueIngest = readFileSync('scripts/catalogue-ingest.ts', 'utf8');
const sourceAdapter = readFileSync('scripts/catalogue-ingestion/sourceAdapter.ts', 'utf8');
const tcgdexAdapter = readFileSync('scripts/catalogue-ingestion/tcgdexAdapter.ts', 'utf8');
const legacySync = readFileSync('scripts/sync-tcgdex-catalogue.mjs', 'utf8');
const backendRoute = readFileSync('backend/routes/catalogueIngestion.js', 'utf8');
const catalogueWorkflow = readFileSync('.github/workflows/catalogue-ingestion-ci.yml', 'utf8');

function expectSql(pattern: RegExp, message: string) {
  assert.match(migration, pattern, message);
}

function rejectSql(pattern: RegExp, message: string) {
  assert.doesNotMatch(migration, pattern, message);
}

function assertCanonicalStagingSourceGuard() {
  assert.match(catalogueIngest, /STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco'/);
  assert.match(catalogueIngest, /PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu'/);
  assert.match(catalogueIngest, /Catalogue imports must use the canonical staging Supabase project/);
  assert.match(catalogueIngest, /Refusing catalogue import against the known production Supabase project/);
}

function assertBoundedCatalogueWrites() {
  assert.match(ingestionPipeline, /writeConcurrency\?: number/);
  assert.match(ingestionPipeline, /writeConcurrency > 16/);
  assert.match(ingestionPipeline, /function reconciliationPhase/);
  assert.match(ingestionPipeline, /await runWithConcurrency\(/);
  assert.match(catalogueIngest, /--writeConcurrency must be an integer from 1 to 16/);
  assert.match(catalogueWorkflow, /CATALOGUE_BATCH_COUNT >= 1 && CATALOGUE_BATCH_COUNT <= 12/);
  assert.match(catalogueWorkflow, /current_offset=\$\(\(CATALOGUE_START_OFFSET \+ batch \* CATALOGUE_BATCH_LIMIT\)\)/);
  assert.match(catalogueWorkflow, /--runKey="github-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}-\$\{batch\}"/);
}

function assertRecognitionRoleIsLeastPrivilege() {
  assert.match(recognitionRoleMigration, /create role stackr_recognition[\s\S]+nologin/);
  assert.match(recognitionRoleMigration, /grant select on table[\s\S]+ml\.embedding_models/);
  assert.match(recognitionRoleMigration, /grant select, insert, update on table[\s\S]+ml\.recognition_scan_diagnostics/);
  assert.match(recognitionRoleMigration, /grant insert on table[\s\S]+audit\.catalogue_events/);
  assert.doesNotMatch(recognitionRoleMigration, /\bbypassrls\b|\bsuperuser\b/i);
  assert.doesNotMatch(recognitionRoleMigration, /grant all/i);
  assert.doesNotMatch(recognitionRoleMigration, /password\s+/i);
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
    languageCode: 'ja',
    setCode: 'SV4a',
    collectorNumber: '001/184',
    variantCode: 'master_ball',
    finishCode: 'holo',
  });
  const keyB = proposedCanonicalKey({
    languageCode: 'ja',
    setCode: 'SV4a',
    collectorNumber: '001/184',
    variantCode: 'normal',
    finishCode: 'normal',
  });
  assert.equal(keyA, 'ja:sv4a:001/184:master_ball:holo');
  assert.notEqual(keyA, keyB, 'variant must participate in canonical key');
  assert.notEqual(
    keyA,
    proposedCanonicalKey({
      languageCode: 'ja',
      setCode: 'SV4a',
      collectorNumber: '001/184',
      variantCode: 'master_ball',
      finishCode: 'normal',
    }),
    'finish must participate in canonical key',
  );
  assert.equal(keyA.includes('pikachu'), false, 'card name must not participate in canonical key');

  const parts = collectorNumberParts('SV-P 001/190a');
  assert.equal(parts.collectorNumberPrefix, 'SV-P ');
  assert.equal(parts.collectorNumberSort, 1);
  assert.equal(parts.collectorNumberSuffix, '/190a');
  assert.ok(parts.collectorNumberSortKey.includes('000000000001'));
}

function providerRecord(languageCode: string, id: string): ProviderRecord {
  return {
    provider: 'tcgdex',
    providerRecordId: id,
    recordType: 'card',
    languageCode,
    licenceStatus: 'approved',
    payload: {
      id,
      name: 'Test Card',
      localId: '001',
      set: { id: 'CS1', name: 'Test Set' },
      variant: 'normal',
    },
  };
}

function fakeAdapter(records: ProviderRecord[]): SourceAdapter {
  return {
    identifySource: () => ({
      code: 'tcgdex',
      displayName: 'TCGdex',
      sourceType: 'catalogue',
      baseUrl: 'https://api.tcgdex.net/v2',
      termsUrl: 'https://www.tcgdex.net/',
      licenceStatus: 'approved',
      attributionRequired: true,
      robotsPolicy: 'api_only_no_scraping',
      rateLimitConfig: {},
      capabilities: ['sets', 'cards', 'variants', 'assets'],
      automatedRefreshAllowed: false,
    }),
    healthCheck: async () => ({ status: 'ok', capabilities: { cards: true } }),
    fetchSets: async () => [],
    fetchCards: async () => records,
    fetchVariants: async () => [],
    fetchAssets: async () => [],
    validateRecord: () => ({ ok: true, issues: [] }),
    normaliseRecord: (record) => ({
      provider: record.provider,
      providerRecordId: record.providerRecordId,
      recordType: record.recordType,
      gameCode: 'pokemon',
      languageCode: record.languageCode ?? 'en',
      setCode: 'CS1',
      providerSetId: 'CS1',
      collectorNumber: '001',
      collectorNumberPrefix: null,
      collectorNumberSort: 1,
      collectorNumberSuffix: null,
      collectorNumberSortKey: '000000000001',
      nativeName: 'Test Card',
      englishDisplayName: 'Test Card',
      variantCode: 'normal',
      finishCode: 'normal',
      sourceConfidence: 0.95,
      licenceStatus: record.licenceStatus,
      raw: record.payload,
    }),
  };
}

function noDbAccess() {
  return {
    schema(schema: string) {
      throw new Error(`Unexpected DB access during safety test: ${schema}`);
    },
  };
}

async function assertStrictForeignLanguageSafety() {
  assert.equal(normaliseLanguageCode('zh-cn'), 'zh-cn');
  assert.equal(normaliseLanguageCode('zh_CN'), 'zh-cn');
  assert.equal(normaliseLanguageCode('ko'), 'ko');
  assert.throws(() => normaliseLanguageCode('fr'), /Unsupported catalogue language/);
  assert.throws(() => normaliseLanguageCode('zh-Hans'), /Unsupported catalogue language/);

  const simplifiedAdapter = new TcgdexSourceAdapter({ language: 'zh-cn', licenceStatus: 'approved' });
  const koreanAdapter = new TcgdexSourceAdapter({ language: 'ko', licenceStatus: 'approved' });
  assert.equal(simplifiedAdapter.language, 'zh-cn');
  assert.equal(koreanAdapter.language, 'ko');
  assert.equal(simplifiedAdapter.licenceStatus, 'approved');
  assert.equal(simplifiedAdapter.assetLicenceStatus, 'under_review', 'metadata approval must not approve provider images');

  const simplified = simplifiedAdapter.normaliseRecord(providerRecord('zh-cn', 'zh-cn-card-1'));
  const korean = koreanAdapter.normaliseRecord(providerRecord('ko', 'ko-card-1'));
  assert.equal(simplified.languageCode, 'zh-cn', 'zh-cn must stay zh-cn');
  assert.equal(korean.languageCode, 'ko', 'ko must stay ko');
  assert.notEqual(simplified.languageCode, 'ja', 'zh-cn must not be insertable as ja');
  assert.notEqual(korean.languageCode, 'ja', 'ko must not be insertable as ja');
  const setRecord = simplifiedAdapter.normaliseRecord({
    provider: 'tcgdex',
    providerRecordId: 'SV4a',
    recordType: 'set',
    languageCode: 'zh-cn',
    licenceStatus: 'approved',
    payload: { id: 'SV4a', name: 'Set Name', cardCount: { official: 165, total: 190 } },
  });
  assert.equal(setRecord.setCode, 'SV4a', 'TCGdex set-list IDs must become canonical set codes');
  assert.equal(setRecord.providerSetId, 'SV4a', 'TCGdex set-list IDs must remain exact provider set IDs');
  assert.equal(setRecord.printedTotal, 165);
  assert.equal(setRecord.total, 190);
  assert.deepEqual(tcgdexAdapterInternals.variantCandidates({
    variants: { normal: false, holo: true, reverse: false, firstEdition: false, wPromo: false },
  }), ['holo'], 'holo-only cards must not be silently converted to normal');
  assert.deepEqual(tcgdexAdapterInternals.variantCandidates({
    variants: { normal: true, holo: false, reverse: true, firstEdition: true, wPromo: true },
  }), ['normal', 'reverse_holo', 'first_edition', 'promo']);
  assert.deepEqual(tcgdexAdapterInternals.variantCandidates({ variants: [] }), ['normal']);
  assert.equal(tcgdexAdapterInternals.imageVariantCandidate({ variants: { normal: true, reverse: true } }), 'normal');
  assert.equal(tcgdexAdapterInternals.imageVariantCandidate({ variants: { normal: false, holo: true } }), 'holo');
  assert.equal(
    tcgdexAdapterInternals.imageVariantCandidate({ variants: { firstEdition: true, holo: true, normal: false } }),
    null,
    'one generic image must not be guessed onto one of several non-normal finishes',
  );
  assert.deepEqual(tcgdexAdapterInternals.setAssetCandidates({
    logo: 'https://assets.example/set/logo',
    symbol: 'https://assets.example/set/symbol',
  }), [
    { assetType: 'set_logo', imageUrl: 'https://assets.example/set/logo.webp' },
    { assetType: 'set_symbol', imageUrl: 'https://assets.example/set/symbol.webp' },
  ]);
  assert.deepEqual(tcgdexAdapterInternals.setAssetCandidates({ logo: null, symbol: null }), []);
  assert.equal(
    tcgdexAdapterInternals.tcgdexAssetUrl('https://assets.example/cards/001', 'card_image'),
    'https://assets.example/cards/001/high.webp',
  );
  assert.match(proposedCanonicalKey({
    languageCode: simplified.languageCode,
    setCode: 'CS1',
    collectorNumber: '001',
    variantCode: 'normal',
    finishCode: 'normal',
  }), /^zh-cn:/);
  assert.match(proposedCanonicalKey({
    languageCode: korean.languageCode,
    setCode: 'CS1',
    collectorNumber: '001',
    variantCode: 'normal',
    finishCode: 'normal',
  }), /^ko:/);

  const dryRun = await new CatalogueIngestionRunner(
    noDbAccess(),
    fakeAdapter([providerRecord('zh-cn', 'zh-cn-card-2'), providerRecord('ko', 'ko-card-2')]),
  ).run({ dryRun: true });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.importRunId, null);
  assert.equal(dryRun.stats.recordsRetrieved, 2);
  assert.equal(dryRun.stats.recordsSkipped, 2);

  await assert.rejects(
    () => new CatalogueIngestionRunner(noDbAccess(), fakeAdapter([providerRecord('fr', 'bad-language')])).run(),
    /Unsupported catalogue language/,
    'invalid provider languages must fail before database access',
  );
}

async function assertTcgdexLanguageRunFetchesSetsCardsAndVariants() {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    const payload = url.endsWith('/sets')
      ? [{ id: 'CS1', name: 'Test Set', cardCount: { official: 1, total: 1 } }]
      : url.endsWith('/cards')
        ? [{ id: 'CS1-001', localId: '001', name: 'Test Card' }]
        : {
            id: 'CS1-001',
            localId: '001',
            name: 'Test Card',
            set: { id: 'CS1', name: 'Test Set', cardCount: { official: 1, total: 1 } },
            variants: { normal: true, holo: false, reverse: true, firstEdition: false, wPromo: false },
          };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const adapter = new TcgdexSourceAdapter({ language: 'zh-cn', licenceStatus: 'approved' });
    const result = await new CatalogueIngestionRunner(noDbAccess(), adapter).run({
      command: 'run_language',
      language: 'zh-cn',
      limit: 1,
      dryRun: true,
    });
    assert.equal(result.ok, true);
    assert.ok(result.stats);
    assert.equal(result.stats.recordsRetrieved, 4, 'language run must include one set, one card and two variants');
    assert.equal(requests.some((url) => url.endsWith('/zh-cn/cards')), true);
    assert.equal(requests.some((url) => url.endsWith('/zh-cn/cards/CS1-001')), true);
    assert.equal(
      requests.filter((url) => url.endsWith('/zh-cn/cards/CS1-001')).length,
      1,
      'card and variant batches must share one provider detail request',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function assertTcgdexOffsetSelectsTheRequestedBatch() {
  const originalFetch = globalThis.fetch;
  const requestedDetails: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/cards')) {
      return new Response(JSON.stringify([
        { id: 'SET-001' },
        { id: 'SET-002' },
        { id: 'SET-003' },
      ]), { status: 200 });
    }
    requestedDetails.push(url);
    const id = url.split('/').at(-1);
    return new Response(JSON.stringify({
      id,
      localId: id?.slice(-3),
      name: id,
      set: { id: 'SET', name: 'Offset Set' },
      variants: { normal: true },
    }), { status: 200 });
  };
  try {
    const adapter = new TcgdexSourceAdapter({ language: 'en' });
    const records = await adapter.fetchCards({ limit: 1, cursor: { offset: 1 } });
    assert.equal(records.length, 1);
    assert.equal(records[0].providerRecordId, 'SET-002');
    assert.equal(requestedDetails.length, 1);
    assert.ok(requestedDetails[0].endsWith('/en/cards/SET-002'));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function assertImageAssetsAreBlockedByDefault() {
  let assetFetches = 0;
  const adapter: SourceAdapter = {
    ...fakeAdapter([providerRecord('ja', 'image-guard-card')]),
    fetchAssets: async () => {
      assetFetches += 1;
      throw new Error('image assets should not be fetched by default');
    },
  };

  const dryRun = await new CatalogueIngestionRunner(noDbAccess(), adapter).run({
    language: 'ja',
    dryRun: true,
  });
  assert.equal(dryRun.ok, true);
  assert.equal(assetFetches, 0, 'normal imports must not fetch image assets by default');
  assert.match(ingestionPipeline, /allowImageAssets/, 'image assets must require an explicit opt-in');
  assert.match(
    catalogueIngest,
    /approvedOnlyAssets: hasFlag\('approvedOnlyAssets'\) \|\| hasFlag\('approved-only'\)/,
    'the ingestion CLI must pass the approved-only asset gate into the runner',
  );
  assert.match(
    ingestionPipeline,
    /card_image_collection_disabled_until_canonical_identity_complete/,
    'asset records need an explicit skipped decision reason while image collection is paused',
  );
  assert.match(
    ingestionPipeline,
    /Card printing identity is ambiguous; variant was not attached by guesswork\./,
    'multiple finishes must reuse one exact printing identity and fail closed when that printing is ambiguous',
  );
  assert.match(
    ingestionPipeline,
    /Provider variant identity changed but the printing has multiple active variants; automatic repair was refused\./,
    'provider variant corrections must fail closed once a printing has multiple active finishes',
  );
  assert.match(ingestionPipeline, /provider_variant_identity_corrected/);
  assert.match(
    ingestionPipeline,
    /hasCompleteCardImageIdentity/,
    'image assets must require language, set_code, collector_number, variant and finish',
  );
  assert.match(ingestionPipeline, /hasCompleteSetArtIdentity/);
  assert.match(ingestionPipeline, /new_set_art_from_exact_provider_identity/);
  assert.match(ingestionPipeline, /storage_provider: 'external_reference'/);
  assert.match(
    ingestionPipeline,
    /card_concepts'\)[\s\S]{0,300}\.upsert\([\s\S]{0,300}onConflict: 'game_code,concept_key'/,
    'parallel catalogue writes must resolve card concepts with a database-native upsert',
  );
  assert.match(tcgdexAdapter, /assetLicenceStatus \?\? 'under_review'/);
}

function assertStrictForeignMigration() {
  for (const language of ['en', 'ja', 'zh-tw', 'zh-cn', 'ko']) {
    assert.match(strictForeignMigration, new RegExp(`'${language}'`), `strict migration must support ${language}`);
  }
  for (const pattern of ['ja:CS*', 'ja:SV4a', 'ja:CP5']) {
    assert.match(strictForeignMigration, new RegExp(pattern.replace('*', '\\*'), 'i'), `strict migration must quarantine ${pattern}`);
  }
  assert.match(strictForeignMigration, /insert into ingest\.data_conflicts/i, 'suspicious records must be quarantined into ingest conflicts');
  assert.match(strictForeignMigration, /data_completeness = 'quarantined'/i, 'legacy rows must be marked quarantined');
  assert.doesNotMatch(strictForeignMigration, /\bdelete\s+from\b/i, 'quarantine migration must not delete rows');
  assert.doesNotMatch(sourceAdapter, /return 'ja';/, 'language helper must not fallback to ja');
  assert.doesNotMatch(sourceAdapter, /return 'en';\s*$/m, 'language helper must not silently fallback to English for unsupported values');
  assert.doesNotMatch(tcgdexAdapter, /zh-Hans|zh-Hant/, 'TCGdex adapter must preserve zh-cn and zh-tw importer codes');
  assert.match(
    ingestionPipeline,
    /if \(match\.status === 'matched'\) \{[\s\S]{0,1600}sourceEntityType: 'set'/,
    'matched canonical sets must retain the exact provider set identifier used for future provider-scoped imports',
  );
  assert.match(legacySync, /Legacy TCGdex direct catalogue sync is disabled/, 'legacy direct importer must be blocked');
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

async function assertSamePrintingRecordsAreSerialised() {
  const activeKeys = new Set<string>();
  let activeWorkers = 0;
  let maxActiveWorkers = 0;
  await runWithConcurrencyByKey(
    [
      { id: 'card-a-normal', printing: 'card-a' },
      { id: 'card-a-reverse', printing: 'card-a' },
      { id: 'card-b-normal', printing: 'card-b' },
      { id: 'card-b-holo', printing: 'card-b' },
    ],
    4,
    (record) => record.printing,
    async (record) => {
      assert.equal(activeKeys.has(record.printing), false, 'variants of one printing must never overlap');
      activeKeys.add(record.printing);
      activeWorkers += 1;
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeWorkers -= 1;
      activeKeys.delete(record.printing);
    },
  );
  assert.equal(maxActiveWorkers, 2, 'different printings should still reconcile concurrently');
}

async function assertManualJsonAdapterHasNoImplicitLimit() {
  const dir = mkdtempSync(join(tmpdir(), 'stackr-json-ingest-test-'));
  const file = join(dir, 'catalogue.json');
  const records = [
    { record_type: 'set', provider_record_id: 'set-1', language: 'zh-cn', provider_set_id: 'set-1', name: 'Set One' },
    { record_type: 'card', provider_record_id: 'card-1', language: 'zh-cn', provider_set_id: 'set-1', collector_number: '001', name: 'Card One' },
    { record_type: 'card', provider_record_id: 'card-2', language: 'zh-cn', provider_set_id: 'set-1', collector_number: '002', name: 'Card Two' },
  ];
  try {
    writeFileSync(file, JSON.stringify({ records }));

    const manual = new ManualJsonSourceAdapter({ filePath: file });
    const manualCards = [];
    for await (const card of manual.fetchCards({ language: 'zh-cn' })) manualCards.push(card);
    assert.equal(manualCards.length, 2, 'manual JSON imports without a limit must retain every matching record');

    const pikaqian = new PikaQianSourceAdapter({ filePath: file, licenceStatus: 'approved' });
    const discoveryCards = [];
    for await (const card of pikaqian.fetchCards({ language: 'zh-cn' })) discoveryCards.push(card);
    assert.equal(discoveryCards.length, 0, 'PikaQian discovery must not import every card before set batching');

    const scopedCards = [];
    for await (const card of pikaqian.fetchCards({ language: 'zh-cn', setId: 'set-1' })) scopedCards.push(card);
    assert.equal(scopedCards.length, 2, 'PikaQian set batches must retain every card in the selected set');
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
  assertCanonicalStagingSourceGuard();
  assertBoundedCatalogueWrites();
  assertRecognitionRoleIsLeastPrivilege();
  assertMigrationAddsIngestionState();
  assertIdentityHelpers();
  await assertStrictForeignLanguageSafety();
  await assertTcgdexLanguageRunFetchesSetsCardsAndVariants();
  await assertTcgdexOffsetSelectsTheRequestedBatch();
  await assertImageAssetsAreBlockedByDefault();
  assertStrictForeignMigration();
  assertRawRecordHistoryIsRetainedPerRun();
  assertChecksumsAndBackoff();
  await assertSamePrintingRecordsAreSerialised();
  await assertManualCsvAdapter();
  await assertManualJsonAdapterHasNoImplicitLimit();
  assertBackendRouteIsProtected();

  console.log('Catalogue ingestion framework tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
