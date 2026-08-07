create extension if not exists pgcrypto;
create extension if not exists pg_trgm with schema extensions;
set local search_path = "$user", public, extensions;

create schema if not exists catalog;
create schema if not exists ingest;
create schema if not exists market;
create schema if not exists ml;
create schema if not exists api;
create schema if not exists audit;

revoke all on schema catalog from public;
revoke all on schema ingest from public;
revoke all on schema market from public;
revoke all on schema ml from public;
revoke all on schema api from public;
revoke all on schema audit from public;

grant usage on schema catalog to anon, authenticated, service_role;
grant usage on schema api to anon, authenticated, service_role;
grant usage on schema ingest, market, ml, audit to service_role;

create or replace function audit.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function audit.set_updated_at() from public, anon, authenticated;
grant execute on function audit.set_updated_at() to service_role;

create or replace function catalog.is_catalog_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'catalog_admin')
    or coalesce(auth.jwt() -> 'app_metadata' -> 'roles' ? 'admin', false)
    or coalesce(auth.jwt() -> 'app_metadata' -> 'roles' ? 'catalog_admin', false);
$$;

revoke all on function catalog.is_catalog_admin() from public, anon;
grant execute on function catalog.is_catalog_admin() to authenticated, service_role;

create table if not exists catalog.games (
  code text primary key,
  display_name text not null,
  publisher text,
  active boolean not null default true,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z0-9][a-z0-9_-]*$')
);

create table if not exists catalog.languages (
  code text primary key,
  bcp47_code text not null unique,
  english_name text not null,
  native_name text not null,
  script_code text,
  sort_order integer not null default 100,
  active boolean not null default true,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code in ('en', 'ja', 'zh-Hans', 'zh-Hant', 'ko'))
);

create table if not exists ingest.sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  source_type text not null check (source_type in ('catalogue', 'pricing', 'image', 'recognition', 'manual', 'internal')),
  base_url text,
  terms_url text,
  licence_status text not null default 'under_review'
    check (licence_status in ('approved', 'under_review', 'restricted', 'denied', 'unknown')),
  attribution_required boolean not null default true,
  robots_policy text,
  rate_limit_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  internal_notes text,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z0-9][a-z0-9_-]*$')
);

create table if not exists catalog.series (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references catalog.games(code),
  language_code text not null references catalog.languages(code),
  native_name text not null,
  english_display_name text,
  series_code text,
  release_date date,
  end_date date,
  display_order integer,
  source_updated_at timestamptz,
  discontinued_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  corrected_by_series_id uuid references catalog.series(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalog.sets (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references catalog.games(code),
  language_code text not null references catalog.languages(code),
  series_id uuid references catalog.series(id) on delete set null,
  set_code text,
  provider_set_code text,
  native_name text not null,
  english_display_name text,
  release_date date,
  printed_total integer,
  total integer,
  region_code text,
  display_order integer,
  source_updated_at timestamptz,
  discontinued_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  corrected_by_set_id uuid references catalog.sets(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (printed_total is null or printed_total >= 0),
  check (total is null or total >= 0)
);

comment on column catalog.sets.set_code is
  'Set codes are intentionally not globally unique. Always scope by game, language and canonical set id.';

create table if not exists catalog.rarities (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references catalog.games(code),
  code text not null,
  english_label text not null,
  native_label text,
  rarity_group text,
  sort_order integer not null default 100,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_code, code),
  check (code ~ '^[a-z0-9][a-z0-9_-]*$')
);

create table if not exists catalog.finishes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  english_label text not null,
  finish_group text not null default 'standard'
    check (finish_group in ('standard', 'foil', 'parallel', 'edition', 'stamp', 'regional', 'other')),
  description text,
  sort_order integer not null default 100,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z0-9][a-z0-9_-]*$')
);

create table if not exists catalog.variant_taxonomy (
  code text primary key,
  english_label text not null,
  variant_group text not null
    check (variant_group in ('base', 'foil', 'edition', 'promo', 'stamp', 'regional', 'sealed', 'graded', 'other')),
  finish_code text references catalog.finishes(code),
  description text,
  sort_order integer not null default 100,
  active boolean not null default true,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z0-9][a-z0-9_-]*$')
);

create table if not exists catalog.card_concepts (
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

create table if not exists catalog.card_printings (
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

comment on column catalog.card_printings.collector_number is
  'Opaque collector number. May contain letters, slashes, leading zeroes or regional characters.';

create table if not exists catalog.card_variants (
  id uuid primary key default gen_random_uuid(),
  printing_id uuid not null,
  game_code text not null,
  set_id uuid not null,
  language_code text not null,
  collector_number text not null,
  variant_code text not null references catalog.variant_taxonomy(code),
  finish_code text references catalog.finishes(code),
  canonical_key text not null,
  artwork_key text,
  image_signature text,
  is_default boolean not null default false,
  variant_display_name text,
  source_confidence numeric not null default 0 check (source_confidence >= 0 and source_confidence <= 1),
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
  unique (canonical_key),
  unique (printing_id, variant_code),
  check (variant_code <> ''),
  check (
    canonical_key = lower(game_code || ':' || language_code || ':' || set_id::text || ':' || collector_number || ':' || variant_code)
  )
);

comment on column catalog.card_variants.canonical_key is
  'Deterministic key: game + language + canonical set id + collector number + variant code. Card name is not part of identity.';

comment on column catalog.card_variants.artwork_key is
  'Artwork grouping key. It is intentionally not unique because multiple variants may share the same artwork.';

create table if not exists catalog.card_names (
  id uuid primary key default gen_random_uuid(),
  card_concept_id uuid references catalog.card_concepts(id) on delete cascade,
  printing_id uuid references catalog.card_printings(id) on delete cascade,
  variant_id uuid references catalog.card_variants(id) on delete cascade,
  language_code text not null references catalog.languages(code),
  name_type text not null
    check (name_type in ('native', 'english_display', 'translated', 'alias', 'search_normalized')),
  name text not null,
  normalized_name text not null,
  source_confidence numeric not null default 0 check (source_confidence >= 0 and source_confidence <= 1),
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (name <> ''),
  check (normalized_name <> ''),
  check (num_nonnulls(card_concept_id, printing_id, variant_id) >= 1)
);

create table if not exists catalog.assets (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null
    check (asset_type in ('card_image', 'set_symbol', 'set_logo', 'series_logo', 'sealed_product_image', 'other')),
  game_code text references catalog.games(code),
  set_id uuid references catalog.sets(id) on delete cascade,
  printing_id uuid references catalog.card_printings(id) on delete cascade,
  variant_id uuid references catalog.card_variants(id) on delete cascade,
  source_id uuid references ingest.sources(id) on delete set null,
  url text,
  storage_path text,
  mime_type text,
  width integer,
  height integer,
  sha256 text,
  rights_status text not null default 'unknown'
    check (rights_status in ('approved', 'under_review', 'restricted', 'denied', 'unknown')),
  publicly_servable boolean not null default false,
  attribution_text text,
  licensing_review_notes text,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (url is not null or storage_path is not null),
  check (width is null or width > 0),
  check (height is null or height > 0),
  check (num_nonnulls(set_id, printing_id, variant_id) >= 1)
);

create table if not exists catalog.sealed_products (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references catalog.games(code),
  language_code text not null references catalog.languages(code),
  set_id uuid references catalog.sets(id) on delete set null,
  product_type text not null
    check (product_type in ('booster_box', 'booster_pack', 'elite_trainer_box', 'starter_deck', 'collection_box', 'tin', 'bundle', 'sealed_case', 'other')),
  native_name text not null,
  english_display_name text,
  product_code text,
  barcode text,
  release_date date,
  source_updated_at timestamptz,
  discontinued_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  corrected_by_product_id uuid references catalog.sealed_products(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalog.sealed_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references catalog.sealed_products(id) on delete cascade,
  variant_code text not null references catalog.variant_taxonomy(code),
  native_name text,
  english_display_name text,
  quantity integer,
  source_confidence numeric not null default 0 check (source_confidence >= 0 and source_confidence <= 1),
  source_updated_at timestamptz,
  discontinued_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  corrected_by_variant_id uuid references catalog.sealed_product_variants(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, variant_code),
  check (quantity is null or quantity > 0)
);

create table if not exists catalog.catalogue_versions (
  id uuid primary key default gen_random_uuid(),
  version_key text not null unique,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'deprecated', 'rolled_back')),
  description text,
  published_at timestamptz,
  superseded_by_version_id uuid references catalog.catalogue_versions(id),
  min_change_sequence bigint,
  max_change_sequence bigint,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (version_key <> ''),
  check (max_change_sequence is null or min_change_sequence is null or max_change_sequence >= min_change_sequence)
);

create table if not exists catalog.catalogue_change_log (
  change_sequence bigserial primary key,
  catalogue_version_id uuid references catalog.catalogue_versions(id) on delete set null,
  entity_schema text not null,
  entity_table text not null,
  entity_id uuid,
  entity_key text,
  change_type text not null check (change_type in ('insert', 'update', 'deprecate', 'correct', 'delete_marker')),
  mobile_syncable boolean not null default true,
  public_change_summary jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (entity_schema in ('catalog', 'market')),
  check (entity_table <> ''),
  check (entity_id is not null or entity_key is not null)
);

create table if not exists ingest.import_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references ingest.sources(id) on delete restrict,
  run_key text not null,
  import_type text not null check (import_type in ('full', 'delta', 'backfill', 'repair', 'manual')),
  status text not null default 'started'
    check (status in ('started', 'running', 'completed', 'failed', 'cancelled', 'rolled_back')),
  requested_by uuid references auth.users(id),
  request_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_requested integer not null default 0 check (records_requested >= 0),
  records_retrieved integer not null default 0 check (records_retrieved >= 0),
  records_inserted integer not null default 0 check (records_inserted >= 0),
  records_updated integer not null default 0 check (records_updated >= 0),
  records_skipped integer not null default 0 check (records_skipped >= 0),
  records_conflicted integer not null default 0 check (records_conflicted >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  internal_notes text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, run_key)
);

create table if not exists ingest.raw_source_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references ingest.sources(id) on delete restrict,
  import_run_id uuid references ingest.import_runs(id) on delete set null,
  record_type text not null
    check (record_type in ('game', 'language', 'series', 'set', 'card', 'printing', 'variant', 'rarity', 'finish', 'asset', 'sealed_product', 'price', 'other')),
  external_id text not null,
  language_code text references catalog.languages(code),
  source_url text,
  retrieved_at timestamptz not null default now(),
  source_updated_at timestamptz,
  licence_status text not null default 'unknown'
    check (licence_status in ('approved', 'under_review', 'restricted', 'denied', 'unknown')),
  attribution_text text,
  payload_hash text not null,
  raw_payload jsonb not null,
  internal_notes text,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ingest.external_identifiers (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references ingest.sources(id) on delete restrict,
  raw_record_id uuid references ingest.raw_source_records(id) on delete set null,
  source_entity_type text not null,
  external_id text not null,
  external_uri text,
  game_code text references catalog.games(code),
  language_code text references catalog.languages(code),
  series_id uuid references catalog.series(id) on delete cascade,
  set_id uuid references catalog.sets(id) on delete cascade,
  card_concept_id uuid references catalog.card_concepts(id) on delete cascade,
  printing_id uuid references catalog.card_printings(id) on delete cascade,
  variant_id uuid references catalog.card_variants(id) on delete cascade,
  sealed_product_id uuid references catalog.sealed_products(id) on delete cascade,
  sealed_product_variant_id uuid references catalog.sealed_product_variants(id) on delete cascade,
  asset_id uuid references catalog.assets(id) on delete cascade,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  is_current boolean not null default true,
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (external_id <> ''),
  check (
    num_nonnulls(series_id, set_id, card_concept_id, printing_id, variant_id, sealed_product_id, sealed_product_variant_id, asset_id) = 1
  )
);

create table if not exists ingest.data_conflicts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references ingest.sources(id) on delete restrict,
  import_run_id uuid references ingest.import_runs(id) on delete set null,
  raw_record_id uuid references ingest.raw_source_records(id) on delete set null,
  conflict_type text not null
    check (conflict_type in ('duplicate_external_id', 'identity_collision', 'name_conflict', 'variant_conflict', 'set_code_conflict', 'licence_conflict', 'schema_conflict', 'other')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  entity_schema text,
  entity_table text,
  entity_id uuid,
  canonical_key text,
  proposed_payload jsonb not null default '{}'::jsonb,
  existing_payload jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'ignored')),
  resolution_notes text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  internal_notes text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists market.market_identities (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  product_kind text not null check (product_kind in ('raw_card', 'graded_card', 'sealed_product')),
  variant_id uuid references catalog.card_variants(id) on delete restrict,
  sealed_product_variant_id uuid references catalog.sealed_product_variants(id) on delete restrict,
  condition_code text,
  grader text,
  grade text,
  certification_number text,
  language_code text references catalog.languages(code),
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (product_kind in ('raw_card', 'graded_card') and variant_id is not null and sealed_product_variant_id is null)
    or (product_kind = 'sealed_product' and sealed_product_variant_id is not null and variant_id is null)
  ),
  check (
    (product_kind = 'graded_card' and grader is not null and grade is not null)
    or (product_kind <> 'graded_card' and certification_number is null)
  )
);

create table if not exists market.price_observations (
  id uuid primary key default gen_random_uuid(),
  market_identity_id uuid not null references market.market_identities(id) on delete restrict,
  source_id uuid not null references ingest.sources(id) on delete restrict,
  raw_record_id uuid references ingest.raw_source_records(id) on delete set null,
  observation_hash text not null unique,
  source_listing_id text,
  source_type text not null
    check (source_type in ('active_listing', 'sold_transaction', 'sold_listing', 'market_estimate', 'manual_comp')),
  observed_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  source_updated_at timestamptz,
  original_price numeric,
  original_shipping_price numeric,
  original_currency text,
  normalised_price_gbp numeric,
  normalised_delivered_price_gbp numeric,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  include_in_estimate boolean not null default false,
  exclusion_reason text,
  raw_payload jsonb not null default '{}'::jsonb,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (normalised_price_gbp is null or normalised_price_gbp >= 0),
  check (normalised_delivered_price_gbp is null or normalised_delivered_price_gbp >= 0)
);

create table if not exists market.price_summaries (
  id uuid primary key default gen_random_uuid(),
  market_identity_id uuid not null references market.market_identities(id) on delete restrict,
  summary_key text not null unique,
  display_currency text not null default 'GBP',
  market_value numeric,
  low_price numeric,
  high_price numeric,
  confidence_label text not null default 'insufficient_evidence'
    check (confidence_label in ('high', 'medium', 'low', 'insufficient_evidence')),
  confidence_score numeric not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  observation_count integer not null default 0 check (observation_count >= 0),
  sold_observation_count integer not null default 0 check (sold_observation_count >= 0),
  active_listing_count integer not null default 0 check (active_listing_count >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  calculated_at timestamptz not null default now(),
  stale_after timestamptz,
  source_breakdown jsonb not null default '[]'::jsonb,
  public_notes text,
  internal_notes text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ml.recognition_feedback_items (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  variant_id uuid references catalog.card_variants(id) on delete set null,
  predicted_variant_id uuid references catalog.card_variants(id) on delete set null,
  feedback_action text not null
    check (feedback_action in ('confirm_result', 'choose_candidate', 'manual_correction', 'variant_correction', 'missing_card', 'bad_scan')),
  reviewed_status text not null default 'queued'
    check (reviewed_status in ('queued', 'approved', 'changed', 'ambiguous', 'rejected_poor_image', 'withdrawn', 'deleted')),
  capture_metadata jsonb not null default '{}'::jsonb,
  ocr_evidence jsonb not null default '{}'::jsonb,
  model_version text,
  catalogue_version_id uuid references catalog.catalogue_versions(id) on delete set null,
  physical_card_session_id text,
  image_storage_path text,
  image_checksum_sha256 text,
  consent_state jsonb not null default '{}'::jsonb,
  reviewer_notes text,
  internal_notes text,
  source_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ml.benchmark_cases (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references catalog.card_variants(id) on delete restrict,
  language_code text not null references catalog.languages(code),
  case_key text not null unique,
  capture_condition text,
  expected_identity_key text not null,
  dataset_split text not null default 'protected_test'
    check (dataset_split in ('train', 'validation', 'protected_test', 'holdout')),
  source_updated_at timestamptz,
  deprecated_at timestamptz,
  deprecated_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit.catalogue_events (
  id uuid primary key default gen_random_uuid(),
  request_id text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  event_type text not null,
  entity_schema text,
  entity_table text,
  entity_id uuid,
  canonical_key text,
  event_payload jsonb not null default '{}'::jsonb,
  internal_notes text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sets_source_scoped_code_idx
  on catalog.sets(game_code, language_code, coalesce(set_code, ''), id);

create index if not exists sets_lookup_idx
  on catalog.sets(game_code, language_code, set_code, release_date desc);

create index if not exists sets_names_fts_idx
  on catalog.sets using gin(to_tsvector('simple', coalesce(native_name, '') || ' ' || coalesce(english_display_name, '') || ' ' || coalesce(set_code, '')));

create index if not exists sets_native_name_trgm_idx
  on catalog.sets using gin(native_name gin_trgm_ops);

create index if not exists sets_english_display_name_trgm_idx
  on catalog.sets using gin(english_display_name gin_trgm_ops);

create index if not exists series_names_fts_idx
  on catalog.series using gin(to_tsvector('simple', coalesce(native_name, '') || ' ' || coalesce(english_display_name, '') || ' ' || coalesce(series_code, '')));

create index if not exists card_printings_identity_idx
  on catalog.card_printings(game_code, language_code, set_id, collector_number, collector_number_sort_key);

create index if not exists card_printings_name_fts_idx
  on catalog.card_printings using gin(to_tsvector('simple', coalesce(native_name, '') || ' ' || coalesce(english_display_name, '') || ' ' || collector_number));

create index if not exists card_printings_native_name_trgm_idx
  on catalog.card_printings using gin(native_name gin_trgm_ops);

create index if not exists card_printings_english_name_trgm_idx
  on catalog.card_printings using gin(english_display_name gin_trgm_ops);

create index if not exists card_variants_printing_idx
  on catalog.card_variants(printing_id, variant_code);

create index if not exists card_variants_set_number_variant_idx
  on catalog.card_variants(game_code, language_code, set_id, collector_number, variant_code);

create index if not exists card_variants_artwork_idx
  on catalog.card_variants(artwork_key)
  where artwork_key is not null;

create index if not exists card_names_lookup_idx
  on catalog.card_names(language_code, name_type, normalized_name);

create index if not exists card_names_fts_idx
  on catalog.card_names using gin(to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(normalized_name, '')));

create index if not exists card_names_name_trgm_idx
  on catalog.card_names using gin(name gin_trgm_ops);

create index if not exists card_names_normalized_trgm_idx
  on catalog.card_names using gin(normalized_name gin_trgm_ops);

create index if not exists assets_variant_public_idx
  on catalog.assets(variant_id, asset_type, publicly_servable, rights_status);

create index if not exists catalogue_changes_delta_idx
  on catalog.catalogue_change_log(change_sequence, mobile_syncable, changed_at);

create index if not exists import_runs_source_status_idx
  on ingest.import_runs(source_id, status, started_at desc);

create index if not exists raw_source_records_lookup_idx
  on ingest.raw_source_records(source_id, record_type, external_id, language_code, retrieved_at desc);

create index if not exists raw_source_records_payload_hash_idx
  on ingest.raw_source_records(payload_hash);

create unique index if not exists raw_source_records_identity_uidx
  on ingest.raw_source_records(source_id, record_type, external_id, coalesce(language_code, ''));

create unique index if not exists external_identifiers_current_uidx
  on ingest.external_identifiers(source_id, source_entity_type, external_id, coalesce(language_code, ''))
  where is_current and deprecated_at is null;

create index if not exists external_identifiers_variant_idx
  on ingest.external_identifiers(variant_id, source_id)
  where variant_id is not null;

create index if not exists data_conflicts_open_idx
  on ingest.data_conflicts(status, severity, conflict_type, created_at)
  where status in ('open', 'in_review');

create index if not exists market_identities_kind_idx
  on market.market_identities(product_kind, language_code, identity_key);

create index if not exists price_observations_identity_time_idx
  on market.price_observations(market_identity_id, source_type, observed_at desc, fetched_at desc);

create index if not exists price_summaries_identity_idx
  on market.price_summaries(market_identity_id, calculated_at desc);

create index if not exists ml_feedback_review_idx
  on ml.recognition_feedback_items(reviewed_status, created_at)
  where deleted_at is null;

create index if not exists ml_benchmark_language_variant_idx
  on ml.benchmark_cases(language_code, variant_id, dataset_split);

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'catalog.games'::regclass,
    'catalog.languages'::regclass,
    'ingest.sources'::regclass,
    'catalog.series'::regclass,
    'catalog.sets'::regclass,
    'catalog.rarities'::regclass,
    'catalog.finishes'::regclass,
    'catalog.variant_taxonomy'::regclass,
    'catalog.card_concepts'::regclass,
    'catalog.card_printings'::regclass,
    'catalog.card_variants'::regclass,
    'catalog.card_names'::regclass,
    'catalog.assets'::regclass,
    'catalog.sealed_products'::regclass,
    'catalog.sealed_product_variants'::regclass,
    'catalog.catalogue_versions'::regclass,
    'catalog.catalogue_change_log'::regclass,
    'ingest.import_runs'::regclass,
    'ingest.raw_source_records'::regclass,
    'ingest.external_identifiers'::regclass,
    'ingest.data_conflicts'::regclass,
    'market.market_identities'::regclass,
    'market.price_observations'::regclass,
    'market.price_summaries'::regclass,
    'ml.recognition_feedback_items'::regclass,
    'ml.benchmark_cases'::regclass,
    'audit.catalogue_events'::regclass
  ] loop
    execute format('drop trigger if exists set_updated_at on %s', target_table);
    execute format('create trigger set_updated_at before update on %s for each row execute function audit.set_updated_at()', target_table);
  end loop;
end $$;

create or replace view api.catalogue_cards
with (security_invoker = true)
as
select
  v.id as variant_id,
  v.canonical_key,
  v.game_code,
  v.language_code,
  l.english_name as language_english_name,
  l.native_name as language_native_name,
  p.set_id,
  s.set_code,
  s.native_name as set_native_name,
  s.english_display_name as set_english_display_name,
  p.id as printing_id,
  p.collector_number,
  p.collector_number_prefix,
  p.collector_number_sort,
  p.collector_number_suffix,
  p.collector_number_sort_key,
  p.native_name as card_native_name,
  p.english_display_name as card_english_display_name,
  r.code as rarity_code,
  r.english_label as rarity_label,
  v.variant_code,
  vt.english_label as variant_label,
  v.finish_code,
  f.english_label as finish_label,
  v.artwork_key,
  p.updated_at,
  greatest(p.updated_at, v.updated_at, s.updated_at) as changed_at
from catalog.card_variants v
join catalog.card_printings p on p.id = v.printing_id
join catalog.sets s on s.id = p.set_id
join catalog.languages l on l.code = v.language_code
left join catalog.rarities r on r.id = p.rarity_id
left join catalog.variant_taxonomy vt on vt.code = v.variant_code
left join catalog.finishes f on f.code = v.finish_code
where v.deprecated_at is null
  and p.deprecated_at is null
  and s.deprecated_at is null;

create or replace view api.catalogue_sets
with (security_invoker = true)
as
select
  s.id as set_id,
  s.game_code,
  s.language_code,
  l.english_name as language_english_name,
  l.native_name as language_native_name,
  s.series_id,
  sr.native_name as series_native_name,
  sr.english_display_name as series_english_display_name,
  s.set_code,
  s.native_name,
  s.english_display_name,
  s.release_date,
  s.printed_total,
  s.total,
  s.region_code,
  s.updated_at,
  s.source_updated_at
from catalog.sets s
join catalog.languages l on l.code = s.language_code
left join catalog.series sr on sr.id = s.series_id
where s.deprecated_at is null;

create or replace view api.catalogue_card_names
with (security_invoker = true)
as
select
  n.id,
  n.card_concept_id,
  n.printing_id,
  n.variant_id,
  n.language_code,
  n.name_type,
  n.name,
  n.normalized_name,
  n.source_confidence,
  n.updated_at
from catalog.card_names n
where n.deprecated_at is null;

create or replace view api.catalogue_delta_changes
with (security_invoker = true)
as
select
  change_sequence,
  catalogue_version_id,
  entity_schema,
  entity_table,
  entity_id,
  entity_key,
  change_type,
  public_change_summary,
  changed_at
from catalog.catalogue_change_log
where mobile_syncable = true;

alter table catalog.games enable row level security;
alter table catalog.languages enable row level security;
alter table catalog.series enable row level security;
alter table catalog.sets enable row level security;
alter table catalog.rarities enable row level security;
alter table catalog.finishes enable row level security;
alter table catalog.variant_taxonomy enable row level security;
alter table catalog.card_concepts enable row level security;
alter table catalog.card_printings enable row level security;
alter table catalog.card_variants enable row level security;
alter table catalog.card_names enable row level security;
alter table catalog.assets enable row level security;
alter table catalog.sealed_products enable row level security;
alter table catalog.sealed_product_variants enable row level security;
alter table catalog.catalogue_versions enable row level security;
alter table catalog.catalogue_change_log enable row level security;
alter table ingest.sources enable row level security;
alter table ingest.import_runs enable row level security;
alter table ingest.raw_source_records enable row level security;
alter table ingest.external_identifiers enable row level security;
alter table ingest.data_conflicts enable row level security;
alter table market.market_identities enable row level security;
alter table market.price_observations enable row level security;
alter table market.price_summaries enable row level security;
alter table ml.recognition_feedback_items enable row level security;
alter table ml.benchmark_cases enable row level security;
alter table audit.catalogue_events enable row level security;

create policy "catalogue games public read" on catalog.games
  for select to anon, authenticated
  using (deprecated_at is null);

create policy "catalogue languages public read" on catalog.languages
  for select to anon, authenticated
  using (active and deprecated_at is null);

create policy "catalogue series public read" on catalog.series
  for select to anon, authenticated
  using (deprecated_at is null);

create policy "catalogue sets public read" on catalog.sets
  for select to anon, authenticated
  using (deprecated_at is null);

create policy "catalogue rarities public read" on catalog.rarities
  for select to anon, authenticated
  using (deprecated_at is null);

create policy "catalogue finishes public read" on catalog.finishes
  for select to anon, authenticated
  using (deprecated_at is null);

create policy "catalogue variants taxonomy public read" on catalog.variant_taxonomy
  for select to anon, authenticated
  using (active and deprecated_at is null);

create policy "catalogue concepts public read" on catalog.card_concepts
  for select to anon, authenticated
  using (deprecated_at is null);

create policy "catalogue printings public read" on catalog.card_printings
  for select to anon, authenticated
  using (deprecated_at is null);

create policy "catalogue card variants public read" on catalog.card_variants
  for select to anon, authenticated
  using (deprecated_at is null);

create policy "catalogue card names public read" on catalog.card_names
  for select to anon, authenticated
  using (deprecated_at is null);

create policy "catalogue assets public read" on catalog.assets
  for select to anon, authenticated
  using (deprecated_at is null and publicly_servable and rights_status = 'approved');

create policy "catalogue sealed products public read" on catalog.sealed_products
  for select to anon, authenticated
  using (deprecated_at is null);

create policy "catalogue sealed product variants public read" on catalog.sealed_product_variants
  for select to anon, authenticated
  using (deprecated_at is null);

create policy "catalogue versions public read" on catalog.catalogue_versions
  for select to anon, authenticated
  using (status = 'published' and deprecated_at is null);

create policy "catalogue change log public read" on catalog.catalogue_change_log
  for select to anon, authenticated
  using (mobile_syncable);

create policy "catalogue games admin write" on catalog.games
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue languages admin write" on catalog.languages
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue series admin write" on catalog.series
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue sets admin write" on catalog.sets
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue rarities admin write" on catalog.rarities
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue finishes admin write" on catalog.finishes
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue variant taxonomy admin write" on catalog.variant_taxonomy
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue concepts admin write" on catalog.card_concepts
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue printings admin write" on catalog.card_printings
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue card variants admin write" on catalog.card_variants
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue card names admin write" on catalog.card_names
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue assets admin write" on catalog.assets
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue sealed products admin write" on catalog.sealed_products
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue sealed product variants admin write" on catalog.sealed_product_variants
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue versions admin write" on catalog.catalogue_versions
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue change log admin write" on catalog.catalogue_change_log
  for all to authenticated
  using (catalog.is_catalog_admin())
  with check (catalog.is_catalog_admin());

create policy "catalogue service role manages games" on catalog.games for all to service_role using (true) with check (true);
create policy "catalogue service role manages languages" on catalog.languages for all to service_role using (true) with check (true);
create policy "catalogue service role manages series" on catalog.series for all to service_role using (true) with check (true);
create policy "catalogue service role manages sets" on catalog.sets for all to service_role using (true) with check (true);
create policy "catalogue service role manages rarities" on catalog.rarities for all to service_role using (true) with check (true);
create policy "catalogue service role manages finishes" on catalog.finishes for all to service_role using (true) with check (true);
create policy "catalogue service role manages variants" on catalog.variant_taxonomy for all to service_role using (true) with check (true);
create policy "catalogue service role manages concepts" on catalog.card_concepts for all to service_role using (true) with check (true);
create policy "catalogue service role manages printings" on catalog.card_printings for all to service_role using (true) with check (true);
create policy "catalogue service role manages card variants" on catalog.card_variants for all to service_role using (true) with check (true);
create policy "catalogue service role manages names" on catalog.card_names for all to service_role using (true) with check (true);
create policy "catalogue service role manages assets" on catalog.assets for all to service_role using (true) with check (true);
create policy "catalogue service role manages sealed products" on catalog.sealed_products for all to service_role using (true) with check (true);
create policy "catalogue service role manages sealed variants" on catalog.sealed_product_variants for all to service_role using (true) with check (true);
create policy "catalogue service role manages versions" on catalog.catalogue_versions for all to service_role using (true) with check (true);
create policy "catalogue service role manages changes" on catalog.catalogue_change_log for all to service_role using (true) with check (true);

create policy "ingest service role manages sources" on ingest.sources for all to service_role using (true) with check (true);
create policy "ingest service role manages import runs" on ingest.import_runs for all to service_role using (true) with check (true);
create policy "ingest service role manages raw records" on ingest.raw_source_records for all to service_role using (true) with check (true);
create policy "ingest service role manages external identifiers" on ingest.external_identifiers for all to service_role using (true) with check (true);
create policy "ingest service role manages conflicts" on ingest.data_conflicts for all to service_role using (true) with check (true);
create policy "market service role manages identities" on market.market_identities for all to service_role using (true) with check (true);
create policy "market service role manages observations" on market.price_observations for all to service_role using (true) with check (true);
create policy "market service role manages summaries" on market.price_summaries for all to service_role using (true) with check (true);
create policy "ml service role manages feedback" on ml.recognition_feedback_items for all to service_role using (true) with check (true);
create policy "ml service role manages benchmarks" on ml.benchmark_cases for all to service_role using (true) with check (true);
create policy "audit service role manages catalogue events" on audit.catalogue_events for all to service_role using (true) with check (true);

grant select on all tables in schema catalog to anon, authenticated;
grant select, insert, update, delete on all tables in schema catalog to service_role;
grant usage, select on all sequences in schema catalog to anon, authenticated, service_role;

grant select on api.catalogue_cards, api.catalogue_sets, api.catalogue_card_names, api.catalogue_delta_changes
  to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema ingest to service_role;
grant usage, select on all sequences in schema ingest to service_role;
grant select, insert, update, delete on all tables in schema market to service_role;
grant usage, select on all sequences in schema market to service_role;
grant select, insert, update, delete on all tables in schema ml to service_role;
grant usage, select on all sequences in schema ml to service_role;
grant select, insert, update, delete on all tables in schema audit to service_role;
grant usage, select on all sequences in schema audit to service_role;

revoke all on all tables in schema ingest from anon, authenticated;
revoke all on all sequences in schema ingest from anon, authenticated;
revoke all on all tables in schema market from anon, authenticated;
revoke all on all sequences in schema market from anon, authenticated;
revoke all on all tables in schema ml from anon, authenticated;
revoke all on all sequences in schema ml from anon, authenticated;
revoke all on all tables in schema audit from anon, authenticated;
revoke all on all sequences in schema audit from anon, authenticated;

alter default privileges in schema ingest revoke all on tables from anon, authenticated;
alter default privileges in schema market revoke all on tables from anon, authenticated;
alter default privileges in schema ml revoke all on tables from anon, authenticated;
alter default privileges in schema audit revoke all on tables from anon, authenticated;

insert into catalog.games (code, display_name, publisher)
values ('pokemon', 'Pokemon', 'The Pokemon Company')
on conflict (code) do update set
  display_name = excluded.display_name,
  publisher = excluded.publisher,
  updated_at = now();

insert into catalog.languages (code, bcp47_code, english_name, native_name, script_code, sort_order)
values
  ('en', 'en', 'English', 'English', 'Latn', 10),
  ('ja', 'ja', 'Japanese', '日本語', 'Jpan', 20),
  ('zh-Hans', 'zh-Hans', 'Simplified Chinese', '简体中文', 'Hans', 30),
  ('zh-Hant', 'zh-Hant', 'Traditional Chinese', '繁體中文', 'Hant', 40),
  ('ko', 'ko', 'Korean', '한국어', 'Kore', 50)
on conflict (code) do update set
  bcp47_code = excluded.bcp47_code,
  english_name = excluded.english_name,
  native_name = excluded.native_name,
  script_code = excluded.script_code,
  sort_order = excluded.sort_order,
  active = true,
  deprecated_at = null,
  updated_at = now();

insert into ingest.sources (code, display_name, source_type, licence_status, attribution_required)
values
  ('stackr_manual', 'Stackr manual catalogue curation', 'manual', 'approved', false),
  ('tcgdex', 'TCGdex', 'catalogue', 'under_review', true),
  ('pokemon_tcg_api', 'Pokemon TCG API', 'catalogue', 'under_review', true),
  ('tcgcsv', 'TCGCSV', 'pricing', 'under_review', true),
  ('ebay', 'eBay', 'pricing', 'restricted', true)
on conflict (code) do update set
  display_name = excluded.display_name,
  source_type = excluded.source_type,
  licence_status = excluded.licence_status,
  attribution_required = excluded.attribution_required,
  updated_at = now();

insert into catalog.finishes (code, english_label, finish_group, sort_order, description)
values
  ('normal', 'Normal', 'standard', 10, 'Standard non-special finish.'),
  ('holo', 'Holo', 'foil', 20, 'Holographic finish.'),
  ('reverse_holo', 'Reverse Holo', 'foil', 30, 'Reverse holographic finish.'),
  ('first_edition', 'First Edition', 'edition', 40, 'First edition print marker.'),
  ('unlimited', 'Unlimited', 'edition', 50, 'Unlimited edition print.'),
  ('promo', 'Promo', 'other', 60, 'Promotional distribution marker retained for compatibility.'),
  ('stamped', 'Stamped', 'stamp', 70, 'Stamped promotional or event variant.'),
  ('poke_ball', 'Poke Ball', 'parallel', 80, 'Poke Ball patterned parallel finish.'),
  ('master_ball', 'Master Ball', 'parallel', 90, 'Master Ball patterned parallel finish.'),
  ('regional_other', 'Other Regional Variant', 'regional', 100, 'Regional or language-specific variant not otherwise classified.')
on conflict (code) do update set
  english_label = excluded.english_label,
  finish_group = excluded.finish_group,
  sort_order = excluded.sort_order,
  description = excluded.description,
  deprecated_at = null,
  updated_at = now();

insert into catalog.variant_taxonomy (code, english_label, variant_group, finish_code, sort_order, description)
values
  ('normal', 'Normal', 'base', 'normal', 10, 'Default raw card variant.'),
  ('holo', 'Holo', 'foil', 'holo', 20, 'Holographic card variant.'),
  ('reverse_holo', 'Reverse Holo', 'foil', 'reverse_holo', 30, 'Reverse holographic card variant.'),
  ('first_edition', 'First Edition', 'edition', 'first_edition', 40, 'First edition card variant.'),
  ('unlimited', 'Unlimited', 'edition', 'unlimited', 50, 'Unlimited card variant.'),
  ('promo', 'Promo', 'promo', 'promo', 60, 'Promotional card variant.'),
  ('stamped', 'Stamped', 'stamp', 'stamped', 70, 'Stamped card variant.'),
  ('poke_ball', 'Poke Ball', 'regional', 'poke_ball', 80, 'Poke Ball patterned regional variant.'),
  ('master_ball', 'Master Ball', 'regional', 'master_ball', 90, 'Master Ball patterned regional variant.'),
  ('regional_other', 'Other Regional Variant', 'regional', 'regional_other', 100, 'Other regional or language-specific variant.'),
  ('sealed_standard', 'Sealed Standard', 'sealed', null, 200, 'Default sealed product variant.'),
  ('graded_standard', 'Graded Standard', 'graded', null, 300, 'Default graded-card market identity variant.')
on conflict (code) do update set
  english_label = excluded.english_label,
  variant_group = excluded.variant_group,
  finish_code = excluded.finish_code,
  sort_order = excluded.sort_order,
  description = excluded.description,
  active = true,
  deprecated_at = null,
  updated_at = now();

insert into catalog.rarities (game_code, code, english_label, rarity_group, sort_order)
values
  ('pokemon', 'common', 'Common', 'standard', 10),
  ('pokemon', 'uncommon', 'Uncommon', 'standard', 20),
  ('pokemon', 'rare', 'Rare', 'standard', 30),
  ('pokemon', 'double_rare', 'Double Rare', 'special', 40),
  ('pokemon', 'illustration_rare', 'Illustration Rare', 'special', 50),
  ('pokemon', 'special_illustration_rare', 'Special Illustration Rare', 'special', 60),
  ('pokemon', 'secret_rare', 'Secret Rare', 'secret', 70),
  ('pokemon', 'promo', 'Promo', 'promo', 80)
on conflict (game_code, code) do update set
  english_label = excluded.english_label,
  rarity_group = excluded.rarity_group,
  sort_order = excluded.sort_order,
  deprecated_at = null,
  updated_at = now();

comment on schema catalog is
  'Canonical public-safe catalogue data for Stackr trading-card identities.';

comment on schema ingest is
  'Private provider ingestion state, raw records, external identifiers and conflicts. Not exposed to public Supabase Data API.';

comment on schema market is
  'Private market/pricing identities and observations. Public-safe price summaries must be exposed through Stackr API projections only.';

comment on schema ml is
  'Private recognition benchmark and feedback dataset metadata. Not exposed directly to public clients.';

comment on schema api is
  'Public-safe API projections that exclude raw payloads, provider secrets, internal notes and licensing-review internals.';

comment on schema audit is
  'Private structured catalogue/API audit events.';

comment on view api.catalogue_cards is
  'Public-safe catalogue card projection. Excludes raw payloads, provider secrets, internal notes and licensing-review fields.';

comment on view api.catalogue_sets is
  'Public-safe set projection. Set codes are scoped and not treated as globally unique.';

comment on table ingest.raw_source_records is
  'Private immutable-ish source payload capture with attribution, retrieval time, licence status and raw source identifiers.';

comment on table ingest.data_conflicts is
  'Private review queue for conflicting external IDs, name/variant conflicts and identity collisions.';

-- Rollback for an isolated validation database before catalogue import:
--   drop schema if exists api cascade;
--   drop schema if exists audit cascade;
--   drop schema if exists ml cascade;
--   drop schema if exists market cascade;
--   drop schema if exists ingest cascade;
--   drop schema if exists catalog cascade;
-- Do not drop shared extensions such as pgcrypto or pg_trgm unless the
-- environment owner confirms no other object depends on them.
