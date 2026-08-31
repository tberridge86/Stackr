import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const databaseUrl = process.argv.find((value) => value.startsWith('--db-url='))?.slice(9);
if (!databaseUrl) throw new Error('database_url_required');
if (!process.argv.includes('--allow-destructive-local-database')) {
  throw new Error('explicit_disposable_database_opt_in_required');
}

const parsedDatabaseUrl = new URL(databaseUrl);
const allowedTestHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!allowedTestHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error('official_japanese_bootstrap_test_requires_local_disposable_database');
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = join(repositoryRoot, 'supabase', 'migrations');
const migrationSuffix = 'fix_atomic_official_japanese_metadata_bootstrap_concept_conflict.sql';
const migrationMatches = readdirSync(migrationDirectory)
  .filter((fileName) => fileName.endsWith(migrationSuffix));

assert.equal(
  migrationMatches.length,
  1,
  `expected exactly one migration ending in ${migrationSuffix}`,
);

const migrationPath = join(migrationDirectory, migrationMatches[0]);
const migration = readFileSync(migrationPath, 'utf8');

// This is deliberately a direct-Postgres test of the function and its ACLs.
// Local Supabase keeps private schemas out of PostgREST; hosted staging exposes
// ingest separately, so this fixture must not change local API schema exposure.

function fixedUuid(sequence) {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

const ids = {
  source: fixedUuid(1),
  set: fixedUuid(2),
  rarity: fixedUuid(3),
  fullRun: fixedUuid(101),
  fullRaw: fixedUuid(201),
  existingConcept: fixedUuid(301),
  existingPrinting: fixedUuid(302),
  existingRun: fixedUuid(102),
  existingRaw: fixedUuid(202),
  collisionRun: fixedUuid(103),
  collisionRaw: fixedUuid(203),
  siblingConcept: fixedUuid(401),
  siblingPrinting: fixedUuid(402),
  siblingVariant: fixedUuid(403),
  siblingRun: fixedUuid(104),
  siblingRaw: fixedUuid(204),
  concurrentRun: fixedUuid(106),
  concurrentRaw: fixedUuid(206),
  lateRun: fixedUuid(105),
  lateRaw: fixedUuid(205),
};

const sourceUpdatedAt = '2026-08-31T20:00:00.000Z';
const providerSetCode = 'SV1S';

async function resetFixture(client) {
  await client.query('reset role');
  await client.query(`
    drop schema if exists audit cascade;
    drop schema if exists ingest cascade;
    drop schema if exists catalog cascade;

    create extension if not exists pgcrypto;

    do $$
    begin
      create role anon nologin;
    exception when duplicate_object then null;
    end $$;
    do $$
    begin
      create role authenticated nologin;
    exception when duplicate_object then null;
    end $$;
    do $$
    begin
      create role service_role nologin bypassrls;
    exception when duplicate_object then
      alter role service_role bypassrls;
    end $$;

    create schema catalog;
    create schema ingest;
    create schema audit;

    revoke all on schema catalog, ingest, audit from public, anon, authenticated;
    grant usage on schema catalog, ingest, audit to service_role;

    create table catalog.games (
      code text primary key,
      display_name text not null,
      active boolean not null default true,
      deprecated_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table catalog.languages (
      code text primary key,
      bcp47_code text not null unique,
      english_name text not null,
      native_name text not null,
      active boolean not null default true,
      deprecated_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table ingest.sources (
      id uuid primary key default gen_random_uuid(),
      code text not null unique,
      display_name text not null,
      source_type text not null
        check (source_type in ('catalogue', 'pricing', 'image', 'recognition', 'manual', 'internal')),
      licence_status text not null
        check (licence_status in ('approved', 'under_review', 'restricted', 'denied', 'unknown')),
      active boolean not null default true,
      source_updated_at timestamptz,
      deprecated_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table catalog.sets (
      id uuid primary key default gen_random_uuid(),
      game_code text not null references catalog.games(code),
      language_code text not null references catalog.languages(code),
      set_code text,
      provider_set_code text,
      native_name text not null,
      english_display_name text,
      source_updated_at timestamptz,
      deprecated_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table catalog.rarities (
      id uuid primary key default gen_random_uuid(),
      game_code text not null references catalog.games(code),
      code text not null,
      english_label text not null,
      native_label text,
      deprecated_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (game_code, code)
    );

    create table catalog.finishes (
      code text primary key,
      english_label text not null,
      deprecated_at timestamptz
    );

    create table catalog.variant_taxonomy (
      code text primary key,
      english_label text not null,
      finish_code text references catalog.finishes(code),
      active boolean not null default true,
      deprecated_at timestamptz
    );

    create table catalog.card_concepts (
      id uuid primary key default gen_random_uuid(),
      game_code text not null references catalog.games(code),
      concept_key text not null,
      default_english_name text,
      pokemon_dex_ids integer[] not null default '{}'::integer[],
      source_updated_at timestamptz,
      discontinued_at timestamptz,
      deprecated_at timestamptz,
      deprecated_reason text,
      corrected_by_concept_id uuid references catalog.card_concepts(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (game_code, concept_key),
      check (concept_key <> '')
    );

    create table catalog.card_printings (
      id uuid primary key default gen_random_uuid(),
      game_code text not null references catalog.games(code),
      set_id uuid not null references catalog.sets(id) on delete restrict,
      language_code text not null references catalog.languages(code),
      card_concept_id uuid references catalog.card_concepts(id) on delete set null,
      collector_number text not null,
      collector_number_prefix text,
      collector_number_sort integer,
      collector_number_suffix text,
      collector_number_sort_key text not null,
      native_name text not null,
      english_display_name text,
      rarity_id uuid references catalog.rarities(id) on delete set null,
      supertype text,
      subtypes text[] not null default '{}'::text[],
      artist text,
      source_updated_at timestamptz,
      discontinued_at timestamptz,
      deprecated_at timestamptz,
      deprecated_reason text,
      corrected_by_printing_id uuid references catalog.card_printings(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (id, game_code, language_code, set_id, collector_number),
      check (collector_number <> ''),
      check (collector_number_sort is null or collector_number_sort >= 0),
      check (collector_number_sort_key <> '')
    );

    create table catalog.card_variants (
      id uuid primary key default gen_random_uuid(),
      printing_id uuid not null,
      game_code text not null,
      set_id uuid not null,
      language_code text not null,
      collector_number text not null,
      variant_code text not null references catalog.variant_taxonomy(code),
      finish_code text references catalog.finishes(code),
      canonical_key text not null unique,
      artwork_key text,
      image_signature text,
      is_default boolean not null default false,
      variant_display_name text,
      source_confidence numeric not null default 0
        check (source_confidence >= 0 and source_confidence <= 1),
      source_updated_at timestamptz,
      discontinued_at timestamptz,
      deprecated_at timestamptz,
      deprecated_reason text,
      corrected_by_variant_id uuid references catalog.card_variants(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      foreign key (printing_id, game_code, language_code, set_id, collector_number)
        references catalog.card_printings(id, game_code, language_code, set_id, collector_number)
        on delete restrict,
      unique (printing_id, variant_code),
      check (
        canonical_key = lower(
          game_code || ':' || language_code || ':' || set_id::text || ':'
          || collector_number || ':' || variant_code
        )
      )
    );

    create table catalog.card_names (
      id uuid primary key default gen_random_uuid(),
      card_concept_id uuid references catalog.card_concepts(id) on delete cascade,
      printing_id uuid references catalog.card_printings(id) on delete cascade,
      variant_id uuid references catalog.card_variants(id) on delete cascade,
      language_code text not null references catalog.languages(code),
      name_type text not null
        check (name_type in ('native', 'english_display', 'translated', 'alias', 'search_normalized')),
      name text not null,
      normalized_name text not null,
      source_confidence numeric not null default 0
        check (source_confidence >= 0 and source_confidence <= 1),
      source_updated_at timestamptz,
      deprecated_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (name <> ''),
      check (normalized_name <> ''),
      check (num_nonnulls(card_concept_id, printing_id, variant_id) >= 1)
    );

    create unique index card_printings_active_natural_identity_uidx
      on catalog.card_printings (
        game_code,
        language_code,
        set_id,
        collector_number
      )
      where deprecated_at is null;

    create unique index card_names_active_natural_identity_uidx
      on catalog.card_names (
        card_concept_id,
        printing_id,
        variant_id,
        language_code,
        name_type,
        normalized_name
      ) nulls not distinct
      where deprecated_at is null;

    create table catalog.assets (
      id uuid primary key default gen_random_uuid(),
      asset_type text not null
        check (asset_type in ('card_image', 'set_symbol', 'set_logo', 'series_logo', 'sealed_product_image', 'other')),
      set_id uuid references catalog.sets(id) on delete cascade,
      printing_id uuid references catalog.card_printings(id) on delete cascade,
      variant_id uuid references catalog.card_variants(id) on delete cascade,
      url text,
      storage_path text,
      rights_status text not null default 'unknown',
      publicly_servable boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (url is not null or storage_path is not null),
      check (num_nonnulls(set_id, printing_id, variant_id) >= 1)
    );

    create table ingest.import_runs (
      id uuid primary key default gen_random_uuid(),
      source_id uuid not null references ingest.sources(id) on delete restrict,
      run_key text not null,
      import_type text not null default 'repair',
      status text not null
        check (status in ('started', 'running', 'completed', 'failed', 'cancelled', 'rolled_back')),
      request_id text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (source_id, run_key)
    );

    create table ingest.raw_source_records (
      id uuid primary key default gen_random_uuid(),
      source_id uuid not null references ingest.sources(id) on delete restrict,
      import_run_id uuid references ingest.import_runs(id) on delete set null,
      record_type text not null,
      external_id text not null,
      provider_record_id text not null,
      language_code text references catalog.languages(code),
      payload_hash text not null,
      raw_payload jsonb not null,
      validation_status text not null default 'valid',
      deprecated_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table ingest.raw_source_record_observations (
      import_run_id uuid not null references ingest.import_runs(id) on delete cascade,
      raw_record_id uuid not null references ingest.raw_source_records(id) on delete restrict,
      retrieved_at timestamptz not null,
      source_updated_at timestamptz,
      licence_status text not null
        check (licence_status in ('approved', 'under_review', 'restricted', 'denied', 'unknown')),
      payload_hash text not null,
      validation_status text not null
        check (validation_status in ('pending', 'valid', 'invalid', 'quarantined')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (import_run_id, raw_record_id)
    );

    create table ingest.external_identifiers (
      id uuid primary key default gen_random_uuid(),
      source_id uuid not null references ingest.sources(id) on delete restrict,
      raw_record_id uuid references ingest.raw_source_records(id) on delete set null,
      source_entity_type text not null,
      external_id text not null,
      language_code text references catalog.languages(code),
      set_id uuid references catalog.sets(id) on delete cascade,
      variant_id uuid references catalog.card_variants(id) on delete cascade,
      confidence numeric not null default 0
        check (confidence >= 0 and confidence <= 1),
      is_current boolean not null default true,
      source_updated_at timestamptz,
      deprecated_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (external_id <> ''),
      check (num_nonnulls(set_id, variant_id) = 1)
    );

    create unique index external_identifiers_current_uidx
      on ingest.external_identifiers(
        source_id,
        source_entity_type,
        external_id,
        coalesce(language_code, '')
      )
      where is_current and deprecated_at is null;

    create table audit.ingest_merge_decisions (
      id uuid primary key default gen_random_uuid(),
      source_id uuid references ingest.sources(id) on delete set null,
      import_run_id uuid references ingest.import_runs(id) on delete set null,
      raw_record_id uuid references ingest.raw_source_records(id) on delete set null,
      request_id text,
      decision_type text not null
        check (decision_type in ('validated', 'external_id_match', 'identity_match', 'created', 'updated', 'skipped', 'quarantined', 'licence_blocked', 'failed')),
      entity_schema text,
      entity_table text,
      entity_id uuid,
      canonical_key text,
      confidence numeric not null default 0
        check (confidence >= 0 and confidence <= 1),
      reason text not null,
      proposed_payload jsonb not null default '{}'::jsonb,
      existing_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    grant select, insert, update, delete on all tables in schema catalog to service_role;
    grant select, insert, update, delete on all tables in schema ingest to service_role;
    grant select, insert, update, delete on all tables in schema audit to service_role;

    insert into catalog.games (code, display_name)
    values ('pokemon', 'Pokemon');

    insert into catalog.languages (code, bcp47_code, english_name, native_name)
    values ('ja', 'ja-JP', 'Japanese', '日本語');

    insert into catalog.finishes (code, english_label)
    values ('normal', 'Normal'), ('reverse_holo', 'Reverse Holo');

    insert into catalog.variant_taxonomy (code, english_label, finish_code)
    values ('normal', 'Normal', 'normal'), ('reverse_holo', 'Reverse Holo', 'reverse_holo');

    insert into ingest.sources (
      id,
      code,
      display_name,
      source_type,
      licence_status,
      active,
      source_updated_at
    ) values (
      '${ids.source}',
      'pokemon_card_jp_official',
      'Pokemon Card Japan Official',
      'catalogue',
      'approved',
      true,
      '${sourceUpdatedAt}'
    );

    insert into catalog.sets (
      id,
      game_code,
      language_code,
      set_code,
      provider_set_code,
      native_name,
      english_display_name,
      source_updated_at
    ) values (
      '${ids.set}',
      'pokemon',
      'ja',
      '${providerSetCode}',
      '${providerSetCode}',
      'スカーレットex',
      'Scarlet ex',
      '${sourceUpdatedAt}'
    );

    insert into catalog.rarities (
      id,
      game_code,
      code,
      english_label,
      native_label
    ) values (
      '${ids.rarity}',
      'pokemon',
      'ar',
      'Art Rare',
      'AR'
    );

    insert into ingest.external_identifiers (
      source_id,
      source_entity_type,
      external_id,
      language_code,
      set_id,
      confidence,
      source_updated_at
    ) values (
      '${ids.source}',
      'set',
      '${providerSetCode}',
      'ja',
      '${ids.set}',
      1,
      '${sourceUpdatedAt}'
    );
  `);

  await client.query(migration);
}

function officialPayload({ providerCardId, collectorNumber, nativeName }) {
  return {
    cardID: providerCardId,
    detailParserVersion: 'pokemon-card-jp-html-v1',
    variant: 'normal',
    finish: 'normal',
    set: { code: providerSetCode },
    localId: collectorNumber,
    name: nativeName,
    rarity: 'AR',
    image_url: `https://www.pokemon-card.com/assets/images/card_images/large/${providerCardId}.jpg`,
  };
}

async function addOfficialObservation(client, {
  runId,
  rawId,
  providerCardId,
  collectorNumber,
  nativeName,
}) {
  await client.query('reset role');
  const payload = officialPayload({ providerCardId, collectorNumber, nativeName });
  await client.query(
    `insert into ingest.import_runs (
      id,
      source_id,
      run_key,
      import_type,
      status,
      request_id,
      metadata
    ) values ($1, $2, $3, 'repair', 'running', $4, $5::jsonb)`,
    [
      runId,
      ids.source,
      `official-ja-bootstrap:${runId}`,
      `request:${runId}`,
      JSON.stringify({ preserveExistingMetadata: true, language: 'ja' }),
    ],
  );
  await client.query(
    `insert into ingest.raw_source_records (
      id,
      source_id,
      import_run_id,
      record_type,
      external_id,
      provider_record_id,
      language_code,
      payload_hash,
      raw_payload,
      validation_status
    ) values ($1, $2, $3, 'card', $4, $4, 'ja', $5, $6::jsonb, 'valid')`,
    [rawId, ids.source, runId, providerCardId, `sha256:${rawId}`, JSON.stringify(payload)],
  );
  await client.query(
    `insert into ingest.raw_source_record_observations (
      import_run_id,
      raw_record_id,
      retrieved_at,
      source_updated_at,
      licence_status,
      payload_hash,
      validation_status
    ) values ($1, $2, $3, $3, 'approved', $4, 'valid')`,
    [runId, rawId, sourceUpdatedAt, `sha256:${rawId}`],
  );
}

async function callBootstrap(client, role, runId, rawId) {
  assert.match(role, /^(anon|authenticated|service_role)$/);
  await client.query('reset role');
  await client.query(`set role ${role}`);
  try {
    const result = await client.query(
      `select ingest.bootstrap_preserved_official_japanese_card(
        $1::uuid,
        $2::uuid
      ) as result`,
      [runId, rawId],
    );
    return result.rows[0].result;
  } finally {
    await client.query('reset role');
  }
}

const canonicalTables = [
  'catalog.sets',
  'catalog.rarities',
  'catalog.card_concepts',
  'catalog.card_printings',
  'catalog.card_variants',
  'catalog.card_names',
  'catalog.assets',
];

const writableTables = [
  ...canonicalTables,
  'ingest.external_identifiers',
  'audit.ingest_merge_decisions',
];

const conflictGuardTables = [
  'catalog.card_concepts',
  'catalog.card_printings',
  'catalog.card_variants',
  'catalog.card_names',
  'catalog.assets',
  'ingest.external_identifiers',
  'audit.ingest_merge_decisions',
];

async function installConflictWriteGuards(client) {
  await client.query('reset role');
  await client.query(`
    create or replace function audit.reject_conflict_fixture_write()
    returns trigger
    language plpgsql
    set search_path = ''
    as $$
    begin
      raise exception using
        errcode = 'P0001',
        message = 'conflict_path_attempted_write:' || tg_table_schema || '.' || tg_table_name;
    end;
    $$;
  `);
  for (const table of conflictGuardTables) {
    await client.query(`
      create trigger reject_conflict_fixture_write
        before insert or update or delete on ${table}
        for each row execute function audit.reject_conflict_fixture_write()
    `);
  }
}

async function removeConflictWriteGuards(client) {
  await client.query('reset role');
  for (const table of conflictGuardTables) {
    await client.query(`drop trigger if exists reject_conflict_fixture_write on ${table}`);
  }
}

async function snapshotTables(client, tables) {
  await client.query('reset role');
  const snapshot = {};
  for (const table of tables) {
    const result = await client.query(`
      select coalesce(
        jsonb_agg(to_jsonb(row_value) order by row_value.id),
        '[]'::jsonb
      ) as rows
      from ${table} row_value
    `);
    snapshot[table] = result.rows[0].rows;
  }
  return snapshot;
}

function assertByteForByteUnchanged(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

async function assetCount(client) {
  await client.query('reset role');
  const result = await client.query('select count(*)::integer as count from catalog.assets');
  return result.rows[0].count;
}

async function seedExistingPrinting(client, {
  conceptId,
  printingId,
  collectorNumber,
  conceptKey,
  nativeName,
}) {
  await client.query('reset role');
  await client.query(
    `insert into catalog.card_concepts (
      id,
      game_code,
      concept_key,
      default_english_name,
      pokemon_dex_ids,
      source_updated_at
    ) values ($1, 'pokemon', $2, $3, $4::integer[], $5)`,
    [conceptId, conceptKey, 'Preserve this concept', [25], sourceUpdatedAt],
  );
  await client.query(
    `insert into catalog.card_printings (
      id,
      game_code,
      set_id,
      language_code,
      card_concept_id,
      collector_number,
      collector_number_sort,
      collector_number_suffix,
      collector_number_sort_key,
      native_name,
      english_display_name,
      rarity_id,
      supertype,
      subtypes,
      artist,
      source_updated_at
    ) values (
      $1,
      'pokemon',
      $2,
      'ja',
      $3,
      $4,
      $5,
      '/078',
      $6,
      $7,
      'Preserve this printing',
      $8,
      'Pokemon',
      $9::text[],
      'Fixture Artist',
      $10
    )`,
    [
      printingId,
      ids.set,
      conceptId,
      collectorNumber,
      Number.parseInt(collectorNumber, 10),
      `${collectorNumber.split('/')[0].padStart(12, '0')}/078`,
      nativeName,
      ids.rarity,
      ['Basic'],
      sourceUpdatedAt,
    ],
  );
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await resetFixture(client);

  const functionGuard = await client.query(`
    select
      routine.prosecdef as security_definer,
      routine.proconfig,
      has_function_privilege(
        'anon',
        'ingest.bootstrap_preserved_official_japanese_card(uuid,uuid)',
        'execute'
      ) as anon_can_execute,
      has_function_privilege(
        'authenticated',
        'ingest.bootstrap_preserved_official_japanese_card(uuid,uuid)',
        'execute'
      ) as authenticated_can_execute,
      has_function_privilege(
        'service_role',
        'ingest.bootstrap_preserved_official_japanese_card(uuid,uuid)',
        'execute'
      ) as service_role_can_execute,
      has_schema_privilege('service_role', 'ingest', 'usage')
        as service_role_has_ingest_usage,
      to_regprocedure(
        'ingest.bootstrap_official_japanese_card_identity(uuid,uuid,uuid,text,uuid,text,text,integer,text,text,text,text,text,numeric,timestamptz)'
      ) is not null as draft_function_still_exists
    from pg_proc routine
    where routine.oid =
      'ingest.bootstrap_preserved_official_japanese_card(uuid,uuid)'::regprocedure
  `);
  assert.deepEqual(functionGuard.rows[0], {
    security_definer: false,
    proconfig: ['search_path=""'],
    anon_can_execute: false,
    authenticated_can_execute: false,
    service_role_can_execute: true,
    service_role_has_ingest_usage: true,
    draft_function_still_exists: false,
  });

  await addOfficialObservation(client, {
    runId: ids.fullRun,
    rawId: ids.fullRaw,
    providerCardId: 'SV1S-001',
    collectorNumber: '001/078',
    nativeName: 'ピカチュウ',
  });

  const beforeDeniedCalls = await snapshotTables(client, writableTables);
  for (const deniedRole of ['anon', 'authenticated']) {
    await assert.rejects(
      callBootstrap(client, deniedRole, ids.fullRun, ids.fullRaw),
      (error) => error?.code === '42501',
    );
  }
  assertByteForByteUnchanged(
    await snapshotTables(client, writableTables),
    beforeDeniedCalls,
    'denied roles must not write through the bootstrap RPC',
  );

  const inserted = await callBootstrap(client, 'service_role', ids.fullRun, ids.fullRaw);
  const fullCanonicalKey = `pokemon:ja:${ids.set}:001/078:normal`;
  assert.deepEqual(inserted, {
    status: 'inserted',
    reason: 'official_japanese_metadata_bootstrapped',
    printingId: inserted.printingId,
    variantId: inserted.variantId,
    canonicalKey: fullCanonicalKey,
  });
  assert.match(inserted.printingId, /^[0-9a-f-]{36}$/);
  assert.match(inserted.variantId, /^[0-9a-f-]{36}$/);

  const fullBundle = await client.query(
    `select
      concept.game_code as concept_game_code,
      concept.concept_key,
      printing.set_id,
      printing.language_code,
      printing.card_concept_id,
      printing.collector_number,
      printing.collector_number_prefix,
      printing.collector_number_sort,
      printing.collector_number_suffix,
      printing.collector_number_sort_key,
      printing.native_name,
      printing.english_display_name,
      printing.rarity_id,
      variant.canonical_key,
      variant.variant_code,
      variant.finish_code,
      variant.artwork_key,
      variant.is_default,
      variant.source_confidence::text,
      card_name.name,
      card_name.normalized_name,
      card_name.name_type,
      identifier.source_id,
      identifier.raw_record_id,
      identifier.external_id,
      identifier.variant_id as identifier_variant_id,
      identifier.confidence::text as identifier_confidence,
      decision.import_run_id,
      decision.raw_record_id as decision_raw_record_id,
      decision.decision_type,
      decision.reason as decision_reason
    from catalog.card_variants variant
    join catalog.card_printings printing on printing.id = variant.printing_id
    join catalog.card_concepts concept on concept.id = printing.card_concept_id
    join catalog.card_names card_name on card_name.variant_id = variant.id
    join ingest.external_identifiers identifier on identifier.variant_id = variant.id
    join audit.ingest_merge_decisions decision on decision.entity_id = variant.id
    where variant.id = $1`,
    [inserted.variantId],
  );
  assert.deepEqual(fullBundle.rows[0], {
    concept_game_code: 'pokemon',
    concept_key: 'pokemon:ピカチュウ',
    set_id: ids.set,
    language_code: 'ja',
    card_concept_id: fullBundle.rows[0].card_concept_id,
    collector_number: '001/078',
    collector_number_prefix: null,
    collector_number_sort: 1,
    collector_number_suffix: '/078',
    collector_number_sort_key: '000000000001/078',
    native_name: 'ピカチュウ',
    english_display_name: null,
    rarity_id: ids.rarity,
    canonical_key: fullCanonicalKey,
    variant_code: 'normal',
    finish_code: 'normal',
    artwork_key: 'pokemon_card_jp_official:SV1S-001',
    is_default: true,
    source_confidence: '0.98',
    name: 'ピカチュウ',
    normalized_name: 'ピカチュウ',
    name_type: 'native',
    source_id: ids.source,
    raw_record_id: ids.fullRaw,
    external_id: 'SV1S-001',
    identifier_variant_id: inserted.variantId,
    identifier_confidence: '0.98',
    import_run_id: ids.fullRun,
    decision_raw_record_id: ids.fullRaw,
    decision_type: 'created',
    decision_reason: 'new_card_variant_from_safe_provider_record',
  });
  assert.match(fullBundle.rows[0].card_concept_id, /^[0-9a-f-]{36}$/);
  assert.equal(await assetCount(client), 0);

  const canonicalBeforeRetry = await snapshotTables(client, canonicalTables);
  const retryResult = await callBootstrap(client, 'service_role', ids.fullRun, ids.fullRaw);
  assert.deepEqual(retryResult, {
    status: 'preserved',
    reason: 'existing_canonical_metadata_preserved',
    printingId: inserted.printingId,
    variantId: inserted.variantId,
    canonicalKey: fullCanonicalKey,
  });
  assertByteForByteUnchanged(
    await snapshotTables(client, canonicalTables),
    canonicalBeforeRetry,
    'an exact retry must leave every canonical row byte-for-byte unchanged',
  );
  const retryAudit = await client.query(
    `select decision_type, reason
    from audit.ingest_merge_decisions
    where raw_record_id = $1
    order by decision_type`,
    [ids.fullRaw],
  );
  assert.deepEqual(retryAudit.rows, [
    { decision_type: 'created', reason: 'new_card_variant_from_safe_provider_record' },
    { decision_type: 'skipped', reason: 'existing_card_metadata_preserved_asset_deferred' },
  ]);
  assert.equal(await assetCount(client), 0);

  await seedExistingPrinting(client, {
    conceptId: ids.existingConcept,
    printingId: ids.existingPrinting,
    collectorNumber: '002/078',
    conceptKey: 'pokemon:ライチュウ',
    nativeName: 'ライチュウ',
  });
  const existingPrintingBefore = await client.query(
    'select to_jsonb(printing) as row from catalog.card_printings printing where id = $1',
    [ids.existingPrinting],
  );
  await addOfficialObservation(client, {
    runId: ids.existingRun,
    rawId: ids.existingRaw,
    providerCardId: 'SV1S-002',
    collectorNumber: '002/078',
    nativeName: 'ライチュウ',
  });
  const existingResult = await callBootstrap(
    client,
    'service_role',
    ids.existingRun,
    ids.existingRaw,
  );
  assert.equal(existingResult.status, 'inserted');
  assert.equal(existingResult.printingId, ids.existingPrinting);
  assert.equal(existingResult.canonicalKey, `pokemon:ja:${ids.set}:002/078:normal`);
  const existingPrintingAfter = await client.query(
    'select to_jsonb(printing) as row from catalog.card_printings printing where id = $1',
    [ids.existingPrinting],
  );
  assertByteForByteUnchanged(
    existingPrintingAfter.rows[0].row,
    existingPrintingBefore.rows[0].row,
    'an active printing with zero variants must be reused without mutation',
  );
  const reusedPrintingBundle = await client.query(
    `select
      count(*) filter (where variant.id is not null)::integer as variant_count,
      count(card_name.id)::integer as name_count
    from catalog.card_printings printing
    left join catalog.card_variants variant on variant.printing_id = printing.id
    left join catalog.card_names card_name on card_name.variant_id = variant.id
    where printing.id = $1`,
    [ids.existingPrinting],
  );
  assert.deepEqual(reusedPrintingBundle.rows[0], { variant_count: 1, name_count: 1 });
  assert.equal(await assetCount(client), 0);

  await addOfficialObservation(client, {
    runId: ids.collisionRun,
    rawId: ids.collisionRaw,
    providerCardId: 'SV1S-001',
    collectorNumber: '003/078',
    nativeName: 'ミュウ',
  });
  await installConflictWriteGuards(client);
  try {
    const beforeExternalIdCollision = await snapshotTables(client, writableTables);
    const collisionResult = await callBootstrap(
      client,
      'service_role',
      ids.collisionRun,
      ids.collisionRaw,
    );
    assert.equal(collisionResult.status, 'conflict');
    assert.equal(collisionResult.reason, 'external_identity_conflict');
    assertByteForByteUnchanged(
      await snapshotTables(client, writableTables),
      beforeExternalIdCollision,
      'an external-ID collision must leave zero writes',
    );
  } finally {
    await removeConflictWriteGuards(client);
  }

  await seedExistingPrinting(client, {
    conceptId: ids.siblingConcept,
    printingId: ids.siblingPrinting,
    collectorNumber: '004/078',
    conceptKey: 'pokemon:ミュウツー',
    nativeName: 'ミュウツー',
  });
  const siblingCanonicalKey = `pokemon:ja:${ids.set}:004/078:reverse_holo`;
  await client.query(
    `insert into catalog.card_variants (
      id,
      printing_id,
      game_code,
      set_id,
      language_code,
      collector_number,
      variant_code,
      finish_code,
      canonical_key,
      artwork_key,
      is_default,
      source_confidence,
      source_updated_at
    ) values (
      $1,
      $2,
      'pokemon',
      $3,
      'ja',
      '004/078',
      'reverse_holo',
      'reverse_holo',
      $4,
      'preserved:sibling-artwork',
      false,
      0.77,
      $5
    )`,
    [ids.siblingVariant, ids.siblingPrinting, ids.set, siblingCanonicalKey, sourceUpdatedAt],
  );
  await addOfficialObservation(client, {
    runId: ids.siblingRun,
    rawId: ids.siblingRaw,
    providerCardId: 'SV1S-004',
    collectorNumber: '004/078',
    nativeName: 'ミュウツー',
  });
  await installConflictWriteGuards(client);
  try {
    const beforeSiblingConflict = await snapshotTables(client, writableTables);
    const siblingResult = await callBootstrap(
      client,
      'service_role',
      ids.siblingRun,
      ids.siblingRaw,
    );
    assert.equal(siblingResult.status, 'conflict');
    assert.equal(siblingResult.reason, 'active_sibling_variant_requires_review');
    assertByteForByteUnchanged(
      await snapshotTables(client, writableTables),
      beforeSiblingConflict,
      'an active-sibling conflict must leave zero writes',
    );
  } finally {
    await removeConflictWriteGuards(client);
  }

  await addOfficialObservation(client, {
    runId: ids.concurrentRun,
    rawId: ids.concurrentRaw,
    providerCardId: 'SV1S-006',
    collectorNumber: '006/078',
    nativeName: 'カビゴン',
  });
  const concurrentClients = [
    new pg.Client({ connectionString: databaseUrl }),
    new pg.Client({ connectionString: databaseUrl }),
  ];
  await Promise.all(concurrentClients.map((concurrentClient) => concurrentClient.connect()));
  let concurrentResults;
  try {
    concurrentResults = await Promise.all(concurrentClients.map((concurrentClient) => (
      callBootstrap(
        concurrentClient,
        'service_role',
        ids.concurrentRun,
        ids.concurrentRaw,
      )
    )));
  } finally {
    await Promise.allSettled(concurrentClients.map((concurrentClient) => concurrentClient.end()));
  }
  assert.deepEqual(
    concurrentResults.map((result) => result.status).sort(),
    ['inserted', 'preserved'],
  );
  assert.equal(concurrentResults[0].printingId, concurrentResults[1].printingId);
  assert.equal(concurrentResults[0].variantId, concurrentResults[1].variantId);
  assert.equal(concurrentResults[0].canonicalKey, concurrentResults[1].canonicalKey);
  const concurrentBundle = await client.query(
    `select
      (select count(*)::integer
        from catalog.card_concepts
        where concept_key = 'pokemon:カビゴン') as concept_count,
      (select count(*)::integer
        from catalog.card_printings
        where collector_number = '006/078') as printing_count,
      (select count(*)::integer
        from catalog.card_variants
        where collector_number = '006/078') as variant_count,
      (select count(*)::integer
        from catalog.card_names
        where name = 'カビゴン') as name_count,
      (select count(*)::integer
        from ingest.external_identifiers
        where external_id = 'SV1S-006') as external_id_count,
      (select count(*)::integer
        from audit.ingest_merge_decisions
        where raw_record_id = $1
          and decision_type = 'created') as created_audit_count,
      (select count(*)::integer
        from audit.ingest_merge_decisions
        where raw_record_id = $1
          and decision_type = 'skipped') as skipped_audit_count,
      (select count(*)::integer from catalog.assets) as asset_count`,
    [ids.concurrentRaw],
  );
  assert.deepEqual(concurrentBundle.rows[0], {
    concept_count: 1,
    printing_count: 1,
    variant_count: 1,
    name_count: 1,
    external_id_count: 1,
    created_audit_count: 1,
    skipped_audit_count: 1,
    asset_count: 0,
  });

  await addOfficialObservation(client, {
    runId: ids.lateRun,
    rawId: ids.lateRaw,
    providerCardId: 'SV1S-005',
    collectorNumber: '005/078',
    nativeName: 'イーブイ',
  });
  await client.query(`
    create or replace function audit.fail_late_bootstrap_for_test()
    returns trigger
    language plpgsql
    set search_path = ''
    as $$
    begin
      if new.raw_record_id = '${ids.lateRaw}'::uuid
        and new.reason = 'new_card_variant_from_safe_provider_record'
      then
        raise exception using
          errcode = 'P0001',
          message = 'deliberate_late_audit_failure';
      end if;
      return new;
    end;
    $$;

    create trigger fail_late_bootstrap_for_test
      before insert on audit.ingest_merge_decisions
      for each row execute function audit.fail_late_bootstrap_for_test();
  `);
  const beforeLateFailure = await snapshotTables(client, writableTables);
  await assert.rejects(
    callBootstrap(client, 'service_role', ids.lateRun, ids.lateRaw),
    (error) => error?.code === 'P0001' && /deliberate_late_audit_failure/.test(error?.message),
  );
  assertByteForByteUnchanged(
    await snapshotTables(client, writableTables),
    beforeLateFailure,
    'a late audit failure must roll back the entire canonical write bundle',
  );

  const lateBundle = await client.query(
    `select
      (select count(*)::integer
        from catalog.card_concepts
        where concept_key = 'pokemon:イーブイ') as concept_count,
      (select count(*)::integer
        from catalog.card_printings
        where collector_number = '005/078') as printing_count,
      (select count(*)::integer
        from catalog.card_variants
        where collector_number = '005/078') as variant_count,
      (select count(*)::integer
        from catalog.card_names
        where name = 'イーブイ') as name_count,
      (select count(*)::integer
        from ingest.external_identifiers
        where external_id = 'SV1S-005') as external_id_count,
      (select count(*)::integer
        from audit.ingest_merge_decisions
        where raw_record_id = $1) as audit_count,
      (select count(*)::integer from catalog.assets) as asset_count`,
    [ids.lateRaw],
  );
  assert.deepEqual(lateBundle.rows[0], {
    concept_count: 0,
    printing_count: 0,
    variant_count: 0,
    name_count: 0,
    external_id_count: 0,
    audit_count: 0,
    asset_count: 0,
  });

  console.log(`Official Japanese metadata bootstrap migration test passed: ${migrationMatches[0]}`);
} finally {
  await client.query('reset role').catch(() => {});
  await client.end();
}
