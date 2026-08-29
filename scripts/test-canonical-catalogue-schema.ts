import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MIGRATION_PATH = 'supabase/migrations/20260727212256_canonical_stackr_catalogue_database.sql';
const RECONCILIATION_PATH =
  'supabase/migrations/20260730080047_reconcile_catalogue_seed_encoding_and_finish_taxonomy.sql';
const STRICT_FOREIGN_IMPORT_PATH =
  'supabase/migrations/20260801090000_strict_foreign_catalogue_import_safety.sql';
const PUBLICATION_SNAPSHOT_PATH =
  'supabase/migrations/20260801120000_language_catalogue_publication_snapshots.sql';
const NATURAL_IDENTITY_RECONCILIATION_PATH =
  'supabase/migrations/20260829170147_reconcile_active_catalogue_natural_identities.sql';
const sql = readFileSync(MIGRATION_PATH, 'utf8');
const reconciliationSql = readFileSync(RECONCILIATION_PATH, 'utf8');
const strictForeignImportSql = readFileSync(STRICT_FOREIGN_IMPORT_PATH, 'utf8');
const publicationSnapshotSql = readFileSync(PUBLICATION_SNAPSHOT_PATH, 'utf8');
const naturalIdentityReconciliationSql = readFileSync(
  NATURAL_IDENTITY_RECONCILIATION_PATH,
  'utf8',
);

function expectSql(pattern: RegExp, message: string) {
  assert.match(sql, pattern, message);
}

function rejectSql(pattern: RegExp, message: string) {
  assert.doesNotMatch(sql, pattern, message);
}

function canonicalKey(input: {
  language: string;
  setCode: string;
  collectorNumber: string;
  variantCode: string;
  finishCode?: string;
}) {
  return [
    input.language,
    input.setCode,
    input.collectorNumber,
    input.variantCode,
    input.finishCode ?? 'normal',
  ].join(':').toLowerCase();
}

function externalIdentifierKey(input: {
  sourceId: string;
  sourceEntityType: string;
  externalId: string;
  languageCode?: string | null;
}) {
  return [
    input.sourceId,
    input.sourceEntityType,
    input.externalId,
    input.languageCode ?? '',
  ].join(':');
}

function assertMigrationStructure() {
  for (const schema of ['catalog', 'ingest', 'market', 'ml', 'api', 'audit']) {
    expectSql(new RegExp(`create schema if not exists ${schema};`), `missing ${schema} schema`);
  }

  for (const table of [
    'catalog.games',
    'catalog.languages',
    'catalog.series',
    'catalog.sets',
    'catalog.card_printings',
    'catalog.card_variants',
    'catalog.rarities',
    'catalog.finishes',
    'catalog.card_names',
    'catalog.assets',
    'ingest.sources',
    'ingest.raw_source_records',
    'ingest.import_runs',
    'ingest.data_conflicts',
    'catalog.catalogue_versions',
  ]) {
    expectSql(new RegExp(`create table if not exists ${table.replace('.', '\\.')}`), `missing ${table}`);
  }

  expectSql(/create extension if not exists pg_trgm with schema extensions;/, 'missing pg_trgm extension');
  expectSql(/using gin\(.*gin_trgm_ops\)/s, 'missing trigram index');
  expectSql(/using gin\(to_tsvector\('simple'/, 'missing full-text-search index');
  expectSql(/with \(security_invoker = true\)/, 'public API views should be security invoker');
  expectSql(/grant usage on schema ingest, market, ml, audit to service_role;/, 'private schema usage should be service-only');
  expectSql(/revoke all on all tables in schema ingest from anon, authenticated;/, 'ingest tables must not be public');
  expectSql(/revoke all on all tables in schema ml from anon, authenticated;/, 'ml tables must not be public');
  expectSql(/revoke all on all tables in schema audit from anon, authenticated;/, 'audit tables must not be public');
  expectSql(/revoke all on all tables in schema market from anon, authenticated;/, 'private market tables must not be public');
  rejectSql(/auth\.role\(/, 'new migration should not use deprecated auth.role() checks');
  rejectSql(/\bvector\s*\(/i, 'vector columns must not be added in Stage 2');
}

function assertSupportedLanguagesSeeded() {
  for (const language of ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko']) {
    expectSql(new RegExp(`'${language}'`), `missing language seed ${language}`);
  }
  for (const language of ['en', 'ja', 'zh-tw', 'zh-cn', 'ko']) {
    assert.match(strictForeignImportSql, new RegExp(`'${language}'`), `strict importer migration must support ${language}`);
  }
  assert.match(strictForeignImportSql, /where code in \('zh-Hans', 'zh-Hant'\)/);
}

function assertVariantTaxonomySeeded() {
  for (const variant of [
    'normal',
    'holo',
    'reverse_holo',
    'first_edition',
    'unlimited',
    'promo',
    'stamped',
    'poke_ball',
    'master_ball',
    'regional_other',
  ]) {
    expectSql(new RegExp(`'${variant}'`), `missing variant seed ${variant}`);
  }
}

function assertDuplicateCollectorNumbersAreVariantScoped() {
  const setId = '11111111-1111-4111-8111-111111111111';
  const normal = canonicalKey({
    language: 'ja',
    setCode: setId,
    collectorNumber: '001/184',
    variantCode: 'normal',
    finishCode: 'normal',
  });
  const masterBall = canonicalKey({
    language: 'ja',
    setCode: setId,
    collectorNumber: '001/184',
    variantCode: 'master_ball',
    finishCode: 'normal',
  });
  const duplicateNormal = canonicalKey({
    language: 'ja',
    setCode: setId,
    collectorNumber: '001/184',
    variantCode: 'normal',
    finishCode: 'normal',
  });
  const sameNumberOtherSet = canonicalKey({
    language: 'ja',
    setCode: '22222222-2222-4222-8222-222222222222',
    collectorNumber: '001/184',
    variantCode: 'normal',
    finishCode: 'normal',
  });

  assert.notEqual(normal, masterBall, 'same collector number in same set must be allowed for different variants');
  assert.equal(normal, duplicateNormal, 'same set, number and variant should collide');
  assert.notEqual(normal, sameNumberOtherSet, 'same collector number in different sets must not collide');
  expectSql(/unique \(canonical_key\)/, 'card variant canonical key must be unique');
  expectSql(/unique \(printing_id, variant_code\)/, 'a printing should not have duplicate variant codes');
  expectSql(/collector_number text not null/, 'collector number must remain text');
  expectSql(/collector_number_sort integer/, 'sortable collector number component missing');
}

function assertConflictingExternalIdsAreCaught() {
  const sourceId = 'tcgdex';
  const keyA = externalIdentifierKey({
    sourceId,
    sourceEntityType: 'card',
    externalId: 'sv2a-025',
    languageCode: 'ja',
  });
  const keyB = externalIdentifierKey({
    sourceId,
    sourceEntityType: 'card',
    externalId: 'sv2a-025',
    languageCode: 'ja',
  });
  const correctedHistoricalKey = externalIdentifierKey({
    sourceId,
    sourceEntityType: 'card',
    externalId: 'sv2a-025',
    languageCode: 'en',
  });

  assert.equal(keyA, keyB, 'same current external id must conflict');
  assert.notEqual(keyA, correctedHistoricalKey, 'language-scoped historical identifiers must remain distinguishable');
  expectSql(/external_identifiers_current_uidx/, 'missing active external id uniqueness index');
  expectSql(/where is_current and deprecated_at is null/, 'external id uniqueness must allow historical deprecated rows');
  expectSql(/duplicate_external_id/, 'data conflict taxonomy must include duplicate external IDs');
}

function assertTranslatedAliasesDoNotDefineIdentity() {
  const pikachuEnglish = canonicalKey({
    language: 'en',
    setCode: '33333333-3333-4333-8333-333333333333',
    collectorNumber: '025',
    variantCode: 'normal',
  });
  const pikachuJapaneseAlias = canonicalKey({
    language: 'en',
    setCode: '33333333-3333-4333-8333-333333333333',
    collectorNumber: '025',
    variantCode: 'normal',
  });

  assert.equal(pikachuEnglish, pikachuJapaneseAlias, 'aliases must not alter identity');
  expectSql(/name_type in \('native', 'english_display', 'translated', 'alias', 'search_normalized'\)/, 'missing alias name types');
  expectSql(/card_names_name_trgm_idx/, 'card name trigram index missing');
  rejectSql(/unique .*name/i, 'card names must not be unique identity keys');
}

function assertSharedArtworkVariantsStaySeparate() {
  const sharedArtworkId = 'artwork:pikachu:base';
  const normal = canonicalKey({
    language: 'ja',
    setCode: '44444444-4444-4444-8444-444444444444',
    collectorNumber: '025',
    variantCode: 'normal',
  });
  const pokeBall = canonicalKey({
    language: 'ja',
    setCode: '44444444-4444-4444-8444-444444444444',
    collectorNumber: '025',
    variantCode: 'poke_ball',
  });

  assert.equal(sharedArtworkId, 'artwork:pikachu:base');
  assert.notEqual(normal, pokeBall, 'shared artwork variants must remain distinct canonical identities');
  expectSql(/artwork_key text/, 'artwork grouping key missing');
  expectSql(/card_variants_artwork_idx/, 'shared artwork lookup index missing');
  rejectSql(/unique .*artwork_key/i, 'artwork key must not be unique');
}

function assertPublicSafeProjection() {
  const viewStart = sql.indexOf('create or replace view api.catalogue_cards');
  const viewEnd = sql.indexOf('create or replace view api.catalogue_sets');
  assert.ok(viewStart >= 0 && viewEnd > viewStart, 'catalogue card API view not found');
  const viewSql = sql.slice(viewStart, viewEnd);

  for (const privateField of ['raw_payload', 'internal_notes', 'provider_secret', 'licensing_review_notes']) {
    assert.doesNotMatch(viewSql, new RegExp(privateField), `api.catalogue_cards leaks ${privateField}`);
  }
}

function assertCatalogueSeedReconciliation() {
  for (const nativeName of ['日本語', '简体中文', '繁體中文', '한국어']) {
    assert.match(
      reconciliationSql,
      new RegExp(nativeName),
      `catalogue reconciliation must restore ${nativeName}`,
    );
  }
  assert.match(
    reconciliationSql,
    /where code = 'promo'[\s\S]+finish_group is distinct from 'other'/,
    'promo finish must converge to the reviewed taxonomy',
  );
  assert.match(
    reconciliationSql,
    /drop constraint if exists finishes_finish_group_check/,
    'historical finish constraints must be replaced safely',
  );
  assert.match(
    reconciliationSql,
    /check \(finish_group in \('standard', 'foil', 'parallel', 'edition', 'stamp', 'regional', 'other'\)\)/,
    'reconciled finish constraint must match the canonical model',
  );
}

function assertSuspiciousLegacyRowsAreQuarantined() {
  for (const pattern of ['ja:CS*', 'ja:SV4a', 'ja:CP5']) {
    assert.match(
      strictForeignImportSql,
      new RegExp(pattern.replace('*', '\\*'), 'i'),
      `strict importer migration must quarantine ${pattern}`,
    );
  }
  assert.match(strictForeignImportSql, /insert into ingest\.data_conflicts/i);
  assert.match(strictForeignImportSql, /data_completeness = 'quarantined'/i);
  assert.match(strictForeignImportSql, /record_status = 'quarantined'/i);
  assert.doesNotMatch(strictForeignImportSql, /\bdelete\s+from\b/i);
}

function assertLanguagePublicationSnapshots() {
  for (const table of [
    'catalog.catalogue_version_sets',
    'catalog.catalogue_version_printings',
    'catalog.catalogue_version_variants',
    'catalog.catalogue_version_assets',
    'catalog.catalogue_version_external_identifiers',
  ]) {
    assert.match(
      publicationSnapshotSql,
      new RegExp(`create table if not exists ${table.replace('.', '\\.')}`),
      `missing ${table}`,
    );
  }
  for (const view of [
    'api.published_catalogue_versions',
    'api.catalogue_languages',
    'api.catalogue_series',
    'api.catalogue_sets',
    'api.catalogue_cards',
    'api.catalogue_card_names',
    'api.catalogue_external_identifiers',
    'api.catalogue_delta_changes',
    'api.asset_manifest',
  ]) {
    assert.match(
      publicationSnapshotSql,
      new RegExp(`create or replace view ${view.replace('.', '\\.')}`),
      `missing ${view}`,
    );
  }
  assert.match(
    publicationSnapshotSql,
    /catalogue_versions_one_published_per_language_uidx/,
    'there must be one active published version per language',
  );
  assert.match(
    publicationSnapshotSql,
    /language_code = candidate\.language_code/,
    'activation must deprecate only the previous version for the same language',
  );
  assert.match(
    publicationSnapshotSql,
    /set_status in \('Metadata incomplete', 'Images incomplete', 'Set art incomplete', 'Under review', 'Complete'\)/,
    'set snapshot status taxonomy must match Step 9',
  );
  const externalIdentifierViewStart = publicationSnapshotSql.indexOf('create or replace view api.catalogue_external_identifiers');
  const deltaViewStart = publicationSnapshotSql.indexOf('create or replace view api.catalogue_delta_changes');
  assert.ok(externalIdentifierViewStart >= 0 && deltaViewStart > externalIdentifierViewStart);
  const externalIdentifierViewSql = publicationSnapshotSql.slice(externalIdentifierViewStart, deltaViewStart);
  assert.match(
    externalIdentifierViewSql,
    /from catalog\.catalogue_version_external_identifiers cvei/,
    'published external IDs must be read from the snapshot table',
  );
  assert.doesNotMatch(
    externalIdentifierViewSql,
    /from ingest\.external_identifiers/i,
    'app-facing external ID view must not read live ingest records',
  );
  for (const viewName of ['api.catalogue_sets', 'api.catalogue_cards', 'api.asset_manifest']) {
    const start = publicationSnapshotSql.indexOf(`create or replace view ${viewName}`);
    assert.ok(start >= 0, `${viewName} view missing`);
    const nextView = publicationSnapshotSql.indexOf('create or replace view ', start + 1);
    const body = publicationSnapshotSql.slice(start, nextView > start ? nextView : undefined);
    assert.match(body, /cv\.status = 'published'/, `${viewName} must filter to published versions`);
    assert.match(body, /cv\.deprecated_at is null/, `${viewName} must exclude deprecated versions`);
  }
}

function assertActiveNaturalIdentityReconciliation() {
  assert.match(
    naturalIdentityReconciliationSql,
    /constraint_row\.confrelid = 'catalog\.card_names'::regclass/,
    'card-name reconciliation must fail closed if a new foreign key references card_names',
  );
  assert.match(
    naturalIdentityReconciliationSql,
    /having count\(\*\) > 1\s+and count\(distinct card_name\.name\) > 1/,
    'card-name reconciliation must refuse conflicting display names',
  );
  assert.match(
    naturalIdentityReconciliationSql,
    /source_confidence desc,\s+card_name\.source_updated_at desc nulls last/,
    'the retained card name must be selected deterministically from the strongest source row',
  );

  const auditPosition = naturalIdentityReconciliationSql.indexOf(
    'insert into audit.catalogue_events',
  );
  const deletePosition = naturalIdentityReconciliationSql.indexOf(
    'delete from catalog.card_names',
  );
  assert.ok(auditPosition >= 0, 'every removed card name must be recorded in the catalogue audit log');
  assert.ok(deletePosition > auditPosition, 'card-name audit evidence must be written before deletion');
  assert.match(
    naturalIdentityReconciliationSql,
    /where audit_row\.entity_id = card_name\.id/,
    'only rows with matching audit evidence may be deleted',
  );

  assert.match(
    naturalIdentityReconciliationSql,
    /create unique index card_printings_active_natural_identity_uidx[\s\S]+?on catalog\.card_printings \([\s\S]+?game_code,[\s\S]+?language_code,[\s\S]+?set_id,[\s\S]+?collector_number[\s\S]+?\)\s+where deprecated_at is null;/,
    'active printings must have a partial natural-identity unique index',
  );
  assert.match(
    naturalIdentityReconciliationSql,
    /create unique index card_names_active_natural_identity_uidx[\s\S]+?on catalog\.card_names \([\s\S]+?card_concept_id,[\s\S]+?printing_id,[\s\S]+?variant_id,[\s\S]+?language_code,[\s\S]+?name_type,[\s\S]+?normalized_name[\s\S]+?\) nulls not distinct\s+where deprecated_at is null;/,
    'active names must enforce null-safe natural-identity uniqueness without blocking history',
  );
  assert.doesNotMatch(
    naturalIdentityReconciliationSql,
    /(?:delete|update)\s+(?:from\s+)?ingest\.raw_source_records/i,
    'provider revision history must remain immutable in this reconciliation',
  );
}

assertMigrationStructure();
assertSupportedLanguagesSeeded();
assertVariantTaxonomySeeded();
assertDuplicateCollectorNumbersAreVariantScoped();
assertConflictingExternalIdsAreCaught();
assertTranslatedAliasesDoNotDefineIdentity();
assertSharedArtworkVariantsStaySeparate();
assertPublicSafeProjection();
assertCatalogueSeedReconciliation();
assertSuspiciousLegacyRowsAreQuarantined();
assertLanguagePublicationSnapshots();
assertActiveNaturalIdentityReconciliation();

console.log('Canonical catalogue schema migration tests passed.');
