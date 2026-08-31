import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManualCsvSourceAdapter, ManualJsonSourceAdapter, parseManualCsv } from './catalogue-ingestion/manualAdapters';
import { PikaQianSourceAdapter } from './catalogue-ingestion/providerFileAdapters';
import { TcgdexSourceAdapter, tcgdexAdapterInternals } from './catalogue-ingestion/tcgdexAdapter';
import {
  canonicalTcgdexCardId,
  sortTcgdexCardRows,
  sortTcgdexSetRows,
} from './catalogue-ingestion/tcgdexOrdering';
import {
  CatalogueIngestionRunner,
  canRelinkExternalIdentifierAsset,
  calculateExponentialBackoff,
  classifyMappedOfficialImageTarget,
  chooseExistingVariantForCardImage,
  isMissingVariantRepairPrecondition,
  isResolvedDeprecatedVariantAlias,
  isSafeUnsupportedPrimaryVariantCorrection,
  isSafeSupportedPrimaryAliasTarget,
  isVariantRepairNotApplicable,
  payloadChecksum,
  parseRetainedRawRecord,
  reconciliationPhase,
  releasedExactlyOnePrimaryAlias,
  runWithConcurrencyByKey,
} from './catalogue-ingestion/pipeline';
import {
  collectorNumberParts,
  normaliseFinishCode,
  normaliseLanguageCode,
  normaliseVariantCode,
  PRIMARY_CATALOGUE_LANGUAGE_CODES,
  proposedCanonicalKey,
  SUPPORTED_CATALOGUE_LANGUAGE_CODES,
  type ProviderRecord,
  type SourceAdapter,
} from './catalogue-ingestion/sourceAdapter';

const migration = readFileSync('supabase/migrations/20260727213835_stackr_data_ingestion_reconciliation.sql', 'utf8');
const rawHistoryMigration = readFileSync('supabase/migrations/20260730153923_preserve_raw_source_record_history.sql', 'utf8');
const exactRawRevisionMigration = readFileSync(
  'supabase/migrations/20260829214000_retain_exact_raw_source_revisions_once.sql',
  'utf8',
);
const rawObservationMigration = readFileSync(
  'supabase/migrations/20260829221000_track_raw_source_record_observations.sql',
  'utf8',
);
const strictForeignMigration = readFileSync('supabase/migrations/20260801090000_strict_foreign_catalogue_import_safety.sql', 'utf8');
const recognitionRoleMigration = readFileSync('supabase/migrations/20260805200000_recognition_service_database_role.sql', 'utf8');
const ingestionPipeline = readFileSync('scripts/catalogue-ingestion/pipeline.ts', 'utf8');
const catalogueIngest = readFileSync('scripts/catalogue-ingest.ts', 'utf8');
const sourceAdapter = readFileSync('scripts/catalogue-ingestion/sourceAdapter.ts', 'utf8');
const tcgdexAdapter = readFileSync('scripts/catalogue-ingestion/tcgdexAdapter.ts', 'utf8');
const legacySync = readFileSync('scripts/sync-tcgdex-catalogue.mjs', 'utf8');
const backendRoute = readFileSync('backend/routes/catalogueIngestion.js', 'utf8');
const catalogueWorkflow = readFileSync('.github/workflows/catalogue-ingestion-ci.yml', 'utf8');
const japaneseCompletionWorkflow = readFileSync('.github/workflows/complete-japanese-catalogue-images.yml', 'utf8');
const recoveryWorkflow = readFileSync('.github/workflows/staging-recovery-drill.yml', 'utf8');

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
  assert.match(catalogueWorkflow, /CATALOGUE_BATCH_COUNT >= 1 && CATALOGUE_BATCH_COUNT <= 60/);
  assert.match(
    catalogueWorkflow,
    /format\('stackr-staging-catalogue-mirror-\{0\}', inputs\.provider\)/,
  );
  assert.match(catalogueWorkflow, /\|\| 'stackr-staging-database-maintenance'/);
  assert.match(recoveryWorkflow, /group: stackr-staging-database-maintenance/);
  assert.match(catalogueWorkflow, /TCGDEX_SNAPSHOT_COMMIT: [0-9a-f]{40}/);
  assert.match(catalogueWorkflow, /repository: tcgdex\/cards-database/);
  assert.match(catalogueWorkflow, /TCGDEX_COMPILE_LANGS: \$\{\{ inputs\.language \}\}/);
  assert.match(catalogueWorkflow, /--setIds="\$CATALOGUE_SET_ID"/);
  assert.match(catalogueWorkflow, /--tcgdexSnapshotRoot="\$GITHUB_WORKSPACE\/\.tcgdex-source\/server\/generated"/);
  assert.match(catalogueWorkflow, /options: \[snapshot, mirror, publish\]/);
  assert.match(catalogueWorkflow, /Publish validated language shard[\s\S]+catalogue-master\.ts publish/);
  assert.match(catalogueWorkflow, /--version="\$CATALOGUE_PUBLISH_VERSION"/);
  assert.match(catalogueWorkflow, /controlled_staging:/);
  assert.match(catalogueWorkflow, /--controlled-staging --setId="\$CATALOGUE_SET_ID"/);
  assert.match(catalogueWorkflow, /controlled_args\+=\(--coverage-limited\)/);
  assert.match(catalogueWorkflow, /CATALOGUE_PUBLISH_VERSION" == staging-\*/);
  assert.match(
    catalogueWorkflow,
    /Report language quality \(advisory\)[\s\S]+continue-on-error: true/,
    'a busy staging quality view must not invalidate a completed one-time snapshot import',
  );
  assert.match(
    catalogueWorkflow,
    /Import exact sets from the pinned TCGdex snapshot[\s\S]+catalogue-master\.ts apply[\s\S]+--provider=tcgdex/,
    'the one-time TCGdex path must keep importing from its pinned local snapshot',
  );
  assert.match(
    catalogueWorkflow,
    /options: \[tcgdex, pikaqian, pokemon_card_jp_official, pokedata_japanese\]/,
    'the controlled workflow must expose the reviewed Japanese image providers',
  );
  assert.match(
    catalogueWorkflow,
    /Import bounded official Japanese catalogue ranges[\s\S]+--source=pokemon-card-jp-official[\s\S]+--language=ja/,
    'the official Japanese path must import exact ja ranges',
  );
  assert.match(
    catalogueWorkflow,
    /Import bounded official Japanese catalogue ranges[\s\S]+asset_args\+=\(--allowImageAssets --approvedOnlyAssets --assetLicenceStatus=approved\)/,
    'the official Japanese path must import approved image references',
  );
  assert.match(
    catalogueWorkflow,
    /Import bounded official Japanese catalogue ranges[\s\S]+--assetsOnly/,
    'the official Japanese path must never overwrite catalogue metadata',
  );
  assert.match(
    japaneseCompletionWorkflow,
    /CATALOGUE_BATCH_SIZE >= 100 && CATALOGUE_BATCH_SIZE <= 500[\s\S]+hitCnt[\s\S]+matrix=\$\{JSON\.stringify\(\{ include \}\)\}/,
    'Japanese catalogue discovery must produce a bounded dynamic matrix from the live official count',
  );
  assert.match(
    japaneseCompletionWorkflow,
    /--source=pokemon-card-jp-official[\s\S]+--licenceStatus=approved[\s\S]+--assetLicenceStatus=approved[\s\S]+--assetsOnly[\s\S]+--target=staging/,
    'Japanese official writes must be explicitly approved and staging-only',
  );
  assert.match(
    japaneseCompletionWorkflow,
    /Enforce 100% effective staging coverage[\s\S]+effectiveAppReadyPercent[\s\S]+== 100/,
    'the completion workflow must not describe partial Japanese app coverage as complete',
  );
}

function assertPinnedPrimaryVariantCorrectionSafety() {
  const base = {
    provider: 'tcgdex',
    sourceId: 'source-tcgdex',
    languageCode: 'en',
    providerRecordId: 'pl3-36',
    staleVariantId: 'variant-holo',
    staleVariantCode: 'holo',
    staleArtworkKey: 'tcgdex:pl3-36',
    expectedVariantCode: 'normal',
    expectedArtworkKey: 'tcgdex:pl3-36',
    supportedVariantCodes: ['normal', 'reverse_holo'],
    activeVariants: [
      { id: 'variant-holo', variant_code: 'holo' },
      { id: 'variant-reverse', variant_code: 'reverse_holo' },
    ],
    currentIdentifiers: [
      {
        source_id: 'source-tcgdex',
        source_entity_type: 'card',
        language_code: 'en',
        external_id: 'pl3-36',
      },
      {
        source_id: 'source-tcgdex',
        source_entity_type: 'card',
        language_code: 'en',
        external_id: 'pl3-36:holo',
      },
    ],
  };

  assert.equal(isSafeUnsupportedPrimaryVariantCorrection(base), true);
  assert.equal(isSafeUnsupportedPrimaryVariantCorrection({ ...base, provider: 'unreviewed' }), false);
  assert.equal(isSafeUnsupportedPrimaryVariantCorrection({
    ...base,
    supportedVariantCodes: ['normal', 'holo', 'reverse_holo'],
  }), false);
  assert.equal(isSafeUnsupportedPrimaryVariantCorrection({
    ...base,
    activeVariants: [...base.activeVariants, { id: 'variant-normal', variant_code: 'normal' }],
  }), false);
  assert.equal(isSafeUnsupportedPrimaryVariantCorrection({
    ...base,
    currentIdentifiers: [...base.currentIdentifiers, {
      source_id: 'other-source',
      source_entity_type: 'card',
      language_code: 'en',
      external_id: 'other-36',
    }],
  }), false);
  assert.equal(isSafeUnsupportedPrimaryVariantCorrection({
    ...base,
    expectedArtworkKey: 'different-artwork',
  }), false);

  assert.equal(isMissingVariantRepairPrecondition({ code: 'P0002' }), true);
  assert.equal(isMissingVariantRepairPrecondition({ code: '23505' }), false);
  assert.equal(isMissingVariantRepairPrecondition(new Error('query returned no rows')), false);
  assert.equal(isVariantRepairNotApplicable({ code: 'P0002' }), true);
  assert.equal(isVariantRepairNotApplicable({
    code: 'P0001',
    message: 'Pinned finish evidence does not support this repair.',
  }), true);
  for (const message of [
    'Variant identity safety check failed.',
    'The stale base provider identity is no longer current.',
    'The supported provider variant identity is not current.',
    'The stale variant has an unexpected current provider link.',
    'Ambiguous active assets prevent an automatic variant repair.',
    'A mirrored stale asset has no supported destination.',
  ]) assert.equal(isVariantRepairNotApplicable({ code: 'P0001', message }), true);
  assert.equal(isVariantRepairNotApplicable({
    code: 'P0001',
    message: 'Pinned finish evidence does not support this repair',
  }), false);
  assert.equal(isVariantRepairNotApplicable({ code: 'P0001', message: 'A base provider card ID is required.' }), false);
  assert.equal(isVariantRepairNotApplicable({
    code: 'P0001',
    message: 'The pinned snapshot must declare at least one supported finish.',
  }), false);
  assert.equal(isVariantRepairNotApplicable(new Error('Pinned finish evidence does not support this repair.')), false);
  assert.equal(isVariantRepairNotApplicable({ code: '23505', message: 'duplicate key' }), false);

  const safeAliasTarget = {
    currentPrintingId: 'printing-1',
    currentArtworkKey: 'tcgdex:2021swsh-17',
    identityVariant: {
      id: 'variant-normal',
      printingId: 'printing-1',
      variantCode: 'normal',
      artworkKey: 'tcgdex:2021swsh-17',
    },
    expectedVariantCode: 'normal',
  };
  assert.equal(isSafeSupportedPrimaryAliasTarget(safeAliasTarget), true);
  assert.equal(isSafeSupportedPrimaryAliasTarget({
    ...safeAliasTarget,
    identityVariant: { ...safeAliasTarget.identityVariant, printingId: 'printing-2' },
  }), false);
  assert.equal(isSafeSupportedPrimaryAliasTarget({
    ...safeAliasTarget,
    identityVariant: { ...safeAliasTarget.identityVariant, artworkKey: 'different-artwork' },
  }), false);
  assert.equal(isSafeSupportedPrimaryAliasTarget({
    ...safeAliasTarget,
    identityVariant: { ...safeAliasTarget.identityVariant, variantCode: 'reverse_holo' },
  }), false);
  assert.equal(releasedExactlyOnePrimaryAlias([{ id: 'released-base-alias' }]), true);
  assert.equal(releasedExactlyOnePrimaryAlias([]), false);
  assert.equal(releasedExactlyOnePrimaryAlias(null), false);
  assert.equal(releasedExactlyOnePrimaryAlias([{ id: 'one' }, { id: 'two' }]), false);
  assert.equal(reconciliationPhase({ provider: 'tcgdex', recordType: 'variant' }, { ok: true }), 2);
  assert.equal(reconciliationPhase({ provider: 'tcgdex', recordType: 'card' }, { ok: true }), 3);
  assert.equal(reconciliationPhase({ provider: 'tcgdex', recordType: 'asset' }, { ok: true }), 4);
  assert.equal(reconciliationPhase({ provider: 'manual', recordType: 'card' }, { ok: true }), 2);
  assert.equal(reconciliationPhase({ provider: 'manual', recordType: 'variant' }, { ok: true }), 3);
  assert.equal(reconciliationPhase({ provider: 'tcgdex', recordType: 'variant' }, { ok: false }), 0);

  const mismatchStart = ingestionPipeline.indexOf(
    'if (externalVariantId && identityVariantId && externalVariantId !== identityVariantId)',
  );
  const unresolvedMismatchStart = ingestionPipeline.indexOf(
    'if (externalVariantId && identityVariantId && externalVariantId !== identityVariantId)',
    mismatchStart + 1,
  );
  assert.ok(mismatchStart >= 0 && unresolvedMismatchStart > mismatchStart);
  const mismatchResolution = ingestionPipeline.slice(mismatchStart, unresolvedMismatchStart);
  const releaseIndex = mismatchResolution.indexOf('releaseSupportedPrimaryVariantAlias');
  const repairIndex = mismatchResolution.indexOf('tryRepairProviderVariantIdentity');
  assert.ok(releaseIndex >= 0 && repairIndex > releaseIndex,
    'a supported base alias must be released before attempting destructive variant repair');
  assert.match(mismatchResolution, /if \(released\)[\s\S]+externalVariantId = undefined/);
  assert.match(mismatchResolution, /releaseSupportedPrimaryVariantAlias[\s\S]+identityVariantId/);
  assert.match(
    ingestionPipeline,
    /existingConflict = table\(db, 'ingest', 'data_conflicts'\)[\s\S]+priorConflict[\s\S]+data_conflicts'\)\.insert/,
    'retrying the same record must not duplicate a staged conflict',
  );

  assert.equal(isResolvedDeprecatedVariantAlias({
    deprecatedAt: '2026-08-19T00:00:00.000Z',
    correctedByVariantId: 'variant-normal',
    correctionTargetId: 'variant-normal',
    deprecatedPrintingId: 'printing-1',
    correctionTargetPrintingId: 'printing-1',
    externalVariantId: 'variant-normal',
  }), true);
  assert.equal(isResolvedDeprecatedVariantAlias({
    deprecatedAt: '2026-08-19T00:00:00.000Z',
    correctedByVariantId: 'variant-normal',
    correctionTargetId: 'variant-normal',
    deprecatedPrintingId: 'printing-1',
    correctionTargetPrintingId: 'printing-2',
  }), false);
}

function assertExternalIdentifierAssetRelinkingSafety() {
  const healthy = {
    id: 'healthy-asset',
    publicly_servable: true,
    rights_status: 'approved',
    permission_status: 'approved',
    storage_provider: 'external_reference',
    retention_status: 'active',
    deprecated_at: null,
    deleted_at: null,
  };

  for (const retired of [
    { ...healthy, id: 'retired-asset', deprecated_at: '2026-08-31T00:00:00.000Z' },
    { ...healthy, id: 'deleted-asset', deleted_at: '2026-08-31T00:00:00.000Z' },
    { ...healthy, id: 'unavailable-asset', storage_provider: 'unavailable' },
    { ...healthy, id: 'non-public-asset', publicly_servable: false },
    { ...healthy, id: 'inactive-asset', retention_status: 'delete_scheduled' },
  ]) {
    assert.equal(
      canRelinkExternalIdentifierAsset(retired, healthy),
      true,
      `a stale provider identity should move off ${retired.id}`,
    );
  }

  assert.equal(
    canRelinkExternalIdentifierAsset({ ...healthy, id: 'another-healthy-asset' }, healthy),
    false,
    'two different healthy assets must remain an identity conflict',
  );
  assert.equal(
    canRelinkExternalIdentifierAsset(
      { ...healthy, id: 'retired-asset', retention_status: 'unavailable' },
      { ...healthy, publicly_servable: false },
    ),
    false,
    'a retired identity must never be relinked to an unhealthy candidate',
  );
  assert.equal(
    canRelinkExternalIdentifierAsset(healthy, healthy),
    false,
    'an already-idempotent asset identity does not require relinking',
  );
  assert.match(
    ingestionPipeline,
    /canRelinkExternalIdentifierAsset\(existingAsset, candidateAsset\)/,
    'the external identifier write path must apply the tested relink safety predicate',
  );
}

function assertJapaneseAssetOnlyVariantSelection() {
  assert.doesNotMatch(
    ingestionPipeline,
    /official_card_id_not_present_in_existing_japanese_catalogue/,
    'an unmapped official card ID must continue to the exact set + collector + variant matcher',
  );
  assert.match(
    ingestionPipeline,
    /if \(mappedVariantId\) \{[\s\S]+official_card_image_attached_by_existing_provider_identity[\s\S]+const setMatch = await findSetId/,
    'mapped official IDs use their guarded identity while unmapped IDs fall through to exact catalogue identity',
  );
  assert.match(
    ingestionPipeline,
    /identifierRows \?\? \[\]\)\.length > 1[\s\S]+Official Japanese card ID maps to multiple current variants; image attachment was refused/,
    'ambiguous official card-ID mappings must remain quarantined',
  );
  assert.match(
    ingestionPipeline,
    /\.update\(\{ artwork_key: classification\.expectedArtworkKey \}\)[\s\S]+\.is\('artwork_key', null\)[\s\S]+exact_artwork_key_compare_and_set/,
    'a mapped official card ID may backfill only a guarded null artwork key',
  );
  const mappedBase = {
    id: 'variant-ja',
    languageCode: 'ja',
    setId: 'set-ja',
    collectorNumber: '001',
    variantCode: 'normal',
    finishCode: 'normal',
    artworkKey: null,
  };
  const officialTarget = {
    cardId: '50451',
    resolvedSetId: 'set-ja',
    providerCollectorNumber: '001',
    requestedVariantCode: 'normal',
    requestedFinishCode: 'normal',
    mappedVariant: mappedBase,
  };
  assert.equal(classifyMappedOfficialImageTarget(officialTarget).status, 'repair');
  assert.equal(classifyMappedOfficialImageTarget({
    ...officialTarget,
    mappedVariant: { ...mappedBase, variantCode: 'unclassified', finishCode: null },
  }).status, 'repair');
  assert.equal(classifyMappedOfficialImageTarget({
    ...officialTarget,
    resolvedSetId: 'wrong-set',
  }).status, 'conflict');
  assert.equal(classifyMappedOfficialImageTarget({
    ...officialTarget,
    providerCollectorNumber: '1',
  }).status, 'conflict', 'collector identities remain opaque; 001 must not equal 1');
  assert.equal(classifyMappedOfficialImageTarget({
    ...officialTarget,
    mappedVariant: { ...mappedBase, languageCode: 'en' },
  }).status, 'conflict');
  assert.equal(classifyMappedOfficialImageTarget({
    ...officialTarget,
    mappedVariant: { ...mappedBase, variantCode: 'holo', finishCode: 'holo' },
  }).status, 'conflict');
  assert.equal(classifyMappedOfficialImageTarget({
    ...officialTarget,
    mappedVariant: { ...mappedBase, artworkKey: 'tcgdex:other' },
  }).status, 'conflict');
  assert.equal(classifyMappedOfficialImageTarget({
    ...officialTarget,
    resolvedSetId: null,
    providerCollectorNumber: null,
    mappedVariant: { ...mappedBase, artworkKey: 'pokemon_card_jp_official:50451' },
  }).status, 'exact', 'a concurrent exact compare-and-set remains idempotent');
  const officialRepairUpdate = ingestionPipeline.match(
    /\.update\(\{ artwork_key: classification\.expectedArtworkKey \}\)[\s\S]{0,1200}?\.select\('id,artwork_key'\)/,
  )?.[0] ?? '';
  assert.ok(officialRepairUpdate);
  assert.doesNotMatch(
    officialRepairUpdate,
    /\{[^}]*\b(?:variant_code|finish_code|canonical_key|printing_id)\s*:/,
    'official artwork repair must not mutate canonical, variant, finish, or printing identity',
  );
  const exact = chooseExistingVariantForCardImage([
    { id: 'normal', canonical_key: 'expected', is_default: false },
    { id: 'reverse', canonical_key: 'other', is_default: true },
  ], 'expected');
  assert.deepEqual(exact, {
    status: 'matched',
    variantId: 'normal',
    reason: 'card_image_attached_to_exact_canonical_variant',
  });

  const existingDefault = chooseExistingVariantForCardImage([
    { id: 'legacy-default', canonical_key: 'legacy', is_default: true, variant_code: 'normal', finish_code: 'normal' },
    { id: 'legacy-reverse', canonical_key: 'legacy-reverse', is_default: false, variant_code: 'reverse_holo', finish_code: 'reverse_holo' },
  ], 'missing-normal');
  assert.deepEqual(existingDefault, {
    status: 'matched',
    variantId: 'legacy-default',
    reason: 'card_image_attached_to_existing_default_variant',
  });

  assert.deepEqual(
    chooseExistingVariantForCardImage([
      {
        id: 'normal-only',
        canonical_key: 'pokemon:ja:set:001:normal',
        is_default: true,
        variant_code: 'normal',
        finish_code: 'normal',
      },
    ], 'pokemon:ja:set:001:master_ball', 'master_ball'),
    { status: 'conflicted', reason: 'exact_variant_missing' },
    'finish-specific images must not be attached to a normal fallback variant',
  );

  assert.equal(
    chooseExistingVariantForCardImage([
      { id: 'a', canonical_key: 'a', is_default: false },
      { id: 'b', canonical_key: 'b', is_default: false },
    ], 'missing-normal').status,
    'conflicted',
    'asset-only Japanese imports must not invent or guess a variant',
  );
  assert.equal(
    chooseExistingVariantForCardImage([
      { id: 'only-holo', canonical_key: 'legacy-holo', is_default: true, variant_code: 'holo', finish_code: 'holo' },
    ], 'missing-normal').status,
    'conflicted',
    'official normal artwork must not be attached to a holo-only or special variant',
  );
  assert.match(catalogueIngest, /assetsOnly: hasFlag\('assetsOnly'\)/);
}

function assertDeterministicTcgdexCardOrdering() {
  assert.equal(canonicalTcgdexCardId({ id: '  SET-Alpha  ' }), 'set-alpha');
  const rows = [
    { id: 'set-z-016' },
    { id: 'SET-A-16' },
    { id: 'set-b-016' },
    { id: 'set-a-15' },
  ];
  assert.deepEqual(sortTcgdexCardRows(rows).map((row) => row.id), [
    'set-a-15',
    'SET-A-16',
    'set-b-016',
    'set-z-016',
  ]);
  assert.equal(rows[0].id, 'set-z-016', 'provider input arrays must not be mutated');
  assert.throws(() => sortTcgdexCardRows([{ id: 'CARD-1' }, { id: ' card-1 ' }]), /duplicate provider ID card-1/);
  assert.throws(() => sortTcgdexCardRows([{ name: 'missing-id' }]), /stable provider ID/);
  assert.deepEqual(sortTcgdexSetRows([{ id: 'set-z' }, { id: 'SET-A' }]), [{ id: 'SET-A' }, { id: 'set-z' }]);
  assert.throws(() => sortTcgdexSetRows([{ id: 'SET-1' }, { id: ' set-1 ' }]), /duplicate provider ID set-1/);
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
  assert.equal(normaliseVariantCode('Reverse Pikachu Stamp'), 'reverse_pikachu_stamp');
  assert.equal(normaliseFinishCode('Reverse Pikachu Stamp'), 'stamped');
  assert.equal(normaliseFinishCode('Mewtwo Stamp 15'), 'stamped');
  assert.equal(normaliseFinishCode('reverse'), 'reverse_holo');
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
  assert.deepEqual(PRIMARY_CATALOGUE_LANGUAGE_CODES, ['en', 'ja', 'zh-cn', 'ko']);
  assert.deepEqual(SUPPORTED_CATALOGUE_LANGUAGE_CODES, ['en', 'ja', 'zh-tw', 'zh-cn', 'ko']);
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

  const foreignRecord = providerRecord('zh-cn', 'zh-cn-name-1');
  foreignRecord.payload.name = '测试卡';
  const foreignWithoutEnglishName = simplifiedAdapter.normaliseRecord(foreignRecord);
  assert.equal(foreignWithoutEnglishName.nativeName, '测试卡');
  assert.equal(
    foreignWithoutEnglishName.englishDisplayName,
    null,
    'a foreign localized name must not be copied into englishDisplayName',
  );
  const foreignWithEnglishName = simplifiedAdapter.normaliseRecord({
    ...foreignRecord,
    payload: { ...foreignRecord.payload, englishName: 'Test Card' },
  });
  assert.equal(foreignWithEnglishName.englishDisplayName, 'Test Card');

  const englishAdapter = new TcgdexSourceAdapter({ language: 'en', licenceStatus: 'approved' });
  const english = englishAdapter.normaliseRecord(providerRecord('en', 'en-name-1'));
  assert.equal(english.englishDisplayName, 'Test Card', 'English records may use their localized name as display name');

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
  assert.deepEqual(tcgdexAdapterInternals.variantCandidates({
    variants: { holo: true, normal: true, wPromo: false, reverse: true, firstEdition: false },
  }), ['normal', 'holo', 'reverse_holo'], 'provider key order must never change the base card identity');
  assert.deepEqual(tcgdexAdapterInternals.variantCandidates({ variants: [] }), ['normal']);
  assert.equal(tcgdexAdapterInternals.imageVariantCandidate({ variants: { normal: true, reverse: true } }), 'normal');
  assert.equal(tcgdexAdapterInternals.imageVariantCandidate({ variants: { normal: false, holo: true } }), 'holo');
  const variantPolicyAdapter = new TcgdexSourceAdapter({ language: 'en', licenceStatus: 'approved' });
  const baseVariantRecord = variantPolicyAdapter.normaliseRecord({
    provider: 'tcgdex',
    providerRecordId: 'ex8-17',
    recordType: 'card',
    languageCode: 'en',
    licenceStatus: 'approved',
    payload: {
      id: 'ex8-17',
      name: 'Test Card',
      localId: '17',
      set: { id: 'ex8', name: 'Test Set' },
      variant: 'holo',
      image_variant: 'normal',
      variants: { holo: true, normal: true },
    },
  });
  assert.equal(baseVariantRecord.variantCode, 'normal', 'the base TCGdex card ID must follow the displayed normal image');
  const explicitHoloRecord = variantPolicyAdapter.normaliseRecord({
    provider: 'tcgdex',
    providerRecordId: 'ex8-17:holo',
    recordType: 'variant',
    languageCode: 'en',
    licenceStatus: 'approved',
    payload: {
      id: 'ex8-17',
      name: 'Test Card',
      localId: '17',
      set: { id: 'ex8', name: 'Test Set' },
      variant: 'holo',
      image_variant: 'normal',
      variants: { holo: true, normal: true },
    },
  });
  assert.equal(explicitHoloRecord.variantCode, 'holo', 'an explicit holo alias must remain holo');

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
    assert.equal(
      result.stats.recordsRetrieved,
      3,
      'language run must include one set, one card with its primary finish, and one additional variant',
    );
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
        { id: 'SET-003' },
        { id: 'SET-001' },
        { id: 'SET-002' },
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

async function assertTcgdexSetOffsetUsesStableProviderIds() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([
    { id: 'SET-Z', name: 'Last' },
    { id: 'SET-A', name: 'First' },
    { id: 'SET-B', name: 'Second' },
  ]), { status: 200 });
  try {
    const adapter = new TcgdexSourceAdapter({ language: 'en' });
    const records = await adapter.fetchSets({ limit: 1, cursor: { offset: 1 } });
    assert.equal(records.length, 1);
    assert.equal(records[0].providerRecordId, 'SET-B');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function assertTcgdexMissingCardDetailFailsClosed() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/cards')) {
      return new Response(JSON.stringify([{ id: 'SET-001' }]), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  try {
    const adapter = new TcgdexSourceAdapter({ language: 'en' });
    await assert.rejects(adapter.fetchCards({ limit: 1 }), /TCGdex request failed \(404\)/);
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
    'provider variant corrections without the exact pinned finish evidence must fail closed',
  );
  assert.match(ingestionPipeline, /isSafeUnsupportedPrimaryVariantCorrection/);
  assert.match(ingestionPipeline, /provider_variant_identity_corrected/);
  assert.match(
    ingestionPipeline,
    /deprecated_provider_variant_alias_already_corrected/,
    'deprecated corrected aliases must be retained as audit evidence without being revived or relinked',
  );
  assert.match(
    ingestionPipeline,
    /priorDecision[\s\S]+ingest_merge_decisions/,
    'retrying one deterministic import run must not append duplicate audit decisions',
  );
  assert.match(
    ingestionPipeline,
    /hasCompleteCardImageIdentity/,
    'image assets must require language, set_code, collector_number, variant and finish',
  );
  assert.match(ingestionPipeline, /hasCompleteSetScopedAssetIdentity/);
  assert.match(ingestionPipeline, /variant_taxonomy'\)\.upsert/);
  assert.match(ingestionPipeline, /finish_code: 'stamped'/);
  assert.match(ingestionPipeline, /new_set_asset_from_exact_provider_identity/);
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

function assertChangedRawRecordHistoryWithoutExactDuplicates() {
  assert.match(rawHistoryMigration, /drop index if exists ingest\.raw_source_records_identity_uidx/);
  assert.match(
    rawHistoryMigration,
    /create unique index if not exists raw_source_records_import_run_identity_uidx[\s\S]+source_id,[\s\S]+import_run_id,[\s\S]+record_type,[\s\S]+external_id/,
  );
  assert.match(rawHistoryMigration, /where import_run_id is not null/);
  assert.match(ingestionPipeline, /rpc\('retain_raw_source_record'/);
  assert.doesNotMatch(
    ingestionPipeline,
    /reusableQuery|revisionCandidates/,
    'raw revision reuse must not use a race-prone client lookup followed by an insert',
  );
  assert.match(exactRawRevisionMigration, /security invoker\s+set search_path = ''/i);
  assert.match(exactRawRevisionMigration, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended/i);
  assert.match(exactRawRevisionMigration, /raw_record\.raw_payload = p_raw_payload/);
  assert.doesNotMatch(
    exactRawRevisionMigration,
    /raw_record\.payload_hash = p_payload_hash[\s\S]+raw_record\.raw_payload = p_raw_payload/,
    'exact JSON equality must survive checksum-algorithm changes',
  );
  assert.match(exactRawRevisionMigration, /and raw_record\.deprecated_at is null/);
  assert.match(exactRawRevisionMigration, /'changed', 'reused'/);
  assert.match(exactRawRevisionMigration, /from public, anon, authenticated/);
  assert.match(exactRawRevisionMigration, /to service_role/);

  assert.match(
    rawObservationMigration,
    /create table if not exists ingest\.raw_source_record_observations[\s\S]+primary key \(import_run_id, raw_record_id\)/,
    'exact revision reuse must retain a compact run-to-revision observation',
  );
  assert.match(rawObservationMigration, /import_run_id uuid not null[\s\S]+on delete cascade/);
  assert.match(rawObservationMigration, /raw_record_id uuid not null[\s\S]+on delete restrict/);
  assert.match(rawObservationMigration, /retrieved_at timestamptz not null/);
  assert.match(rawObservationMigration, /raw_source_record_observations_revision_idx/);
  assert.match(rawObservationMigration, /before update on ingest\.raw_source_record_observations/);
  assert.match(rawObservationMigration, /alter table ingest\.raw_source_record_observations enable row level security/);
  assert.match(
    rawObservationMigration,
    /create policy "ingest service role manages raw record observations"[\s\S]+for all to service_role[\s\S]+with check \(true\)/,
  );
  assert.match(rawObservationMigration, /revoke all on table ingest\.raw_source_record_observations[\s\S]+from public, anon, authenticated/);
  assert.match(rawObservationMigration, /grant select, insert, update, delete on table ingest\.raw_source_record_observations[\s\S]+to service_role/);

  assert.match(rawObservationMigration, /security invoker\s+set search_path = ''/i);
  assert.match(rawObservationMigration, /pg_advisory_xact_lock\(pg_catalog\.hashtextextended/i);
  assert.match(rawObservationMigration, /or p_retrieved_at is null/);
  assert.match(
    rawObservationMigration,
    /current_row\.deprecated_at is not null[\s\S]+errcode = '55000'[\s\S]+retain_raw_source_record_same_run_identity_deprecated/,
    'a tombstoned same-run identity must fail with a stable prerequisite-state error',
  );
  assert.match(
    rawObservationMigration,
    /raw_record\.provider_record_id = p_provider_record_id[\s\S]+raw_record\.raw_payload = p_raw_payload[\s\S]+raw_record\.deprecated_at is null/,
    'cross-run reuse must require the same provider identity and exact active JSON revision',
  );
  assert.match(
    rawObservationMigration,
    /if retained_row\.id is not null then[\s\S]+retention_action := 'reused';[\s\S]+elsif current_row\.id is not null then/,
    'global exact reuse must take precedence over mutating a changed same-run revision',
  );
  assert.match(
    rawObservationMigration,
    /update ingest\.raw_source_records raw_record[\s\S]+where raw_record\.id = current_row\.id[\s\S]+raw_record\.import_run_id = p_import_run_id[\s\S]+raw_record\.deprecated_at is null/,
    'a changed retry may only update its own active run-scoped raw revision',
  );
  assert.match(
    rawObservationMigration,
    /insert into ingest\.raw_source_record_observations[\s\S]+p_import_run_id,[\s\S]+retained_row\.id,[\s\S]+on conflict \(import_run_id, raw_record_id\) do update set/,
    'every successful call must atomically upsert observation metadata against the retained revision',
  );
  assert.doesNotMatch(
    rawObservationMigration,
    /delete\s+from\s+ingest\.raw_source_records/i,
    'retention must never delete raw provenance',
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
  const id = '123e4567-e89b-42d3-a456-426614174000';
  for (const changed of ['inserted', 'updated', 'reused'] as const) {
    assert.deepEqual(parseRetainedRawRecord({ id, changed }), { id, changed });
  }
  for (const invalid of [null, [], {}, { id, changed: 'unknown' }, { id: 'not-a-uuid', changed: 'reused' }]) {
    assert.throws(() => parseRetainedRawRecord(invalid), /invalid_retain_raw_source_record_response/);
  }
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
  assertPinnedPrimaryVariantCorrectionSafety();
  assertExternalIdentifierAssetRelinkingSafety();
  assertJapaneseAssetOnlyVariantSelection();
  assertDeterministicTcgdexCardOrdering();
  assertRecognitionRoleIsLeastPrivilege();
  assertMigrationAddsIngestionState();
  assertIdentityHelpers();
  await assertStrictForeignLanguageSafety();
  await assertTcgdexLanguageRunFetchesSetsCardsAndVariants();
  await assertTcgdexOffsetSelectsTheRequestedBatch();
  await assertTcgdexSetOffsetUsesStableProviderIds();
  await assertTcgdexMissingCardDetailFailsClosed();
  await assertImageAssetsAreBlockedByDefault();
  assertStrictForeignMigration();
  assertChangedRawRecordHistoryWithoutExactDuplicates();
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
