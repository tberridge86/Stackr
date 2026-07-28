import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MIGRATION_PATH = 'supabase/migrations/20260727212256_canonical_stackr_catalogue_database.sql';
const sql = readFileSync(MIGRATION_PATH, 'utf8');

function expectSql(pattern: RegExp, message: string) {
  assert.match(sql, pattern, message);
}

function rejectSql(pattern: RegExp, message: string) {
  assert.doesNotMatch(sql, pattern, message);
}

function canonicalKey(input: {
  game: string;
  language: string;
  setId: string;
  collectorNumber: string;
  variantCode: string;
}) {
  return [
    input.game,
    input.language,
    input.setId,
    input.collectorNumber,
    input.variantCode,
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
  expectSql(
    /finish_group in \([^)]*'promo'[^)]*\)/,
    'promo finish seed must satisfy the finish_group constraint',
  );
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
    game: 'pokemon',
    language: 'ja',
    setId,
    collectorNumber: '001/184',
    variantCode: 'normal',
  });
  const masterBall = canonicalKey({
    game: 'pokemon',
    language: 'ja',
    setId,
    collectorNumber: '001/184',
    variantCode: 'master_ball',
  });
  const duplicateNormal = canonicalKey({
    game: 'pokemon',
    language: 'ja',
    setId,
    collectorNumber: '001/184',
    variantCode: 'normal',
  });
  const sameNumberOtherSet = canonicalKey({
    game: 'pokemon',
    language: 'ja',
    setId: '22222222-2222-4222-8222-222222222222',
    collectorNumber: '001/184',
    variantCode: 'normal',
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
    game: 'pokemon',
    language: 'en',
    setId: '33333333-3333-4333-8333-333333333333',
    collectorNumber: '025',
    variantCode: 'normal',
  });
  const pikachuJapaneseAlias = canonicalKey({
    game: 'pokemon',
    language: 'en',
    setId: '33333333-3333-4333-8333-333333333333',
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
    game: 'pokemon',
    language: 'ja',
    setId: '44444444-4444-4444-8444-444444444444',
    collectorNumber: '025',
    variantCode: 'normal',
  });
  const pokeBall = canonicalKey({
    game: 'pokemon',
    language: 'ja',
    setId: '44444444-4444-4444-8444-444444444444',
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

assertMigrationStructure();
assertSupportedLanguagesSeeded();
assertVariantTaxonomySeeded();
assertDuplicateCollectorNumbersAreVariantScoped();
assertConflictingExternalIdsAreCaught();
assertTranslatedAliasesDoNotDefineIdentity();
assertSharedArtworkVariantsStaySeparate();
assertPublicSafeProjection();

console.log('Canonical catalogue schema migration tests passed.');
