-- Minimal, local-only PG17 fixture for scripts/test-live-pricing-migrations.mjs.
-- It provides just the historical relation contracts consumed by the pricing
-- migrations. It contains no production data, credentials, provider calls, or
-- approval records, and is intentionally additive for repeatable CI use.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- Supabase's service database role bypasses RLS; the rehearsal must exercise
-- service-only RPCs under the same role boundary while anon/authenticated do not.
alter role service_role bypassrls;

create schema if not exists catalog;
create schema if not exists ingest;
create schema if not exists market;
create schema if not exists api;
create schema if not exists audit;
create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

revoke all on schema catalog, ingest, market, api, audit from public;
grant usage on schema api to anon, authenticated, service_role;
grant usage on schema catalog, ingest, market, audit to service_role;

create table if not exists public.price_refresh_queue (
  id uuid primary key default gen_random_uuid(),
  card_id text not null,
  set_id text,
  language text not null default 'en',
  reason text not null default 'manual',
  priority integer not null default 50,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  run_after timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.market_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  card_id text not null,
  set_id text,
  language text not null default 'en',
  canonical_identity_key text,
  pricing_identity_json jsonb not null default '{}'::jsonb,
  market_price_gbp numeric,
  low_price_gbp numeric,
  high_price_gbp numeric,
  tcgdex_price numeric,
  tcg_mid numeric,
  tcg_low numeric,
  primary_source text,
  price_source text,
  price_type text,
  confidence_score numeric,
  confidence_label text,
  methodology_version text,
  calculated_at timestamptz,
  snapshot_at timestamptz not null default now(),
  stale_after timestamptz,
  is_stale boolean not null default false,
  source_breakdown jsonb not null default '[]'::jsonb
);

create table if not exists public.price_observations (
  id uuid primary key default gen_random_uuid(),
  card_id text,
  source text not null default 'unknown',
  source_type text not null default 'market_estimate',
  raw_payload jsonb not null default '{}'::jsonb
);

-- Model the pre-existing personal snapshot contract: authenticated users may
-- manage only their own non-null-user rows. The privacy migration must retain
-- these writes while closing shared-row reads.
alter table public.market_price_snapshots enable row level security;
grant select, insert, update, delete on public.market_price_snapshots to authenticated;
drop policy if exists "Fixture users manage own personal snapshots" on public.market_price_snapshots;
create policy "Fixture users manage own personal snapshots"
  on public.market_price_snapshots
  for all
  to authenticated
  using ((select auth.uid()) = user_id and user_id is not null)
  with check ((select auth.uid()) = user_id and user_id is not null);
-- Simulate a legacy permissive insertion policy which the privacy migration
-- must constrain without deleting unrelated existing policies.
drop policy if exists "Fixture legacy shared snapshot insert" on public.market_price_snapshots;
create policy "Fixture legacy shared snapshot insert"
  on public.market_price_snapshots
  for insert
  to authenticated
  with check (true);

create table if not exists ingest.sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  source_type text not null,
  base_url text,
  terms_url text,
  licence_status text not null default 'under_review',
  attribution_required boolean not null default true,
  robots_policy text,
  rate_limit_config jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  internal_notes text,
  deprecated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists ingest.raw_source_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references ingest.sources(id),
  record_type text not null,
  provider_record_id text,
  external_id text,
  language_code text,
  source_url text,
  source_endpoint text,
  retrieved_at timestamptz,
  attribution_text text,
  payload_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  licence_status text not null default 'under_review',
  validation_status text not null default 'pending',
  validation_errors jsonb not null default '[]'::jsonb,
  deprecated_at timestamptz,
  deprecated_reason text,
  internal_notes text,
  updated_at timestamptz not null default now()
);

create table if not exists market.source_providers (
  code text primary key,
  display_name text not null,
  provider_kind text not null,
  active boolean not null default false,
  official_api_required boolean not null default true,
  oauth_required boolean not null default false,
  supports_active_listings boolean not null default false,
  supports_sold_observations boolean not null default false,
  supports_raw_cards boolean not null default true,
  supports_graded_cards boolean not null default true,
  supports_sealed_products boolean not null default true,
  supported_marketplaces text[] not null default '{}'::text[],
  supported_currencies text[] not null default '{}'::text[],
  terms_url text,
  data_licence_status text not null default 'unreviewed',
  automated_refresh_allowed boolean not null default false,
  credential_env_names text[] not null default '{}'::text[],
  health_status text not null default 'unknown',
  deprecated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists market.currencies (code text primary key, active boolean not null default true);
create table if not exists market.conditions (code text primary key, product_kind text not null, active boolean not null default true, deprecated_at timestamptz);
create table if not exists market.graders (code text primary key, active boolean not null default true);
create table if not exists market.grades (id uuid primary key default gen_random_uuid(), grader_code text, grade_value text, display_label text);

-- Small canonical catalogue contract used by the PokeTrace function and the
-- public catalogue view. These are schema-only stand-ins, not catalogue data.
create table if not exists catalog.languages (
  code text primary key, english_name text, native_name text
);
create table if not exists catalog.sets (
  id uuid primary key default gen_random_uuid(), game_code text, language_code text,
  set_code text, provider_set_code text, native_name text, english_display_name text,
  deprecated_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists catalog.card_printings (
  id uuid primary key default gen_random_uuid(), set_id uuid, language_code text,
  collector_number text, game_code text, native_name text, english_display_name text,
  deprecated_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists catalog.card_variants (
  id uuid primary key default gen_random_uuid(), printing_id uuid, set_id uuid,
  canonical_key text, game_code text, language_code text, collector_number text,
  variant_code text, deprecated_at timestamptz, updated_at timestamptz not null default now()
);

create or replace view api.catalogue_cards
with (security_invoker = true)
as
select
  variant.id as variant_id,
  variant.canonical_key,
  variant.game_code,
  variant.language_code,
  language.english_name as language_english_name,
  language.native_name as language_native_name,
  printing.set_id,
  set_row.set_code,
  set_row.native_name as set_native_name,
  set_row.english_display_name as set_english_display_name,
  printing.id as printing_id,
  printing.collector_number,
  printing.native_name as card_native_name,
  printing.english_display_name as card_english_display_name,
  variant.variant_code,
  variant.updated_at,
  greatest(variant.updated_at, printing.updated_at, set_row.updated_at) as changed_at
from catalog.card_variants variant
join catalog.card_printings printing on printing.id = variant.printing_id
join catalog.sets set_row on set_row.id = printing.set_id
join catalog.languages language on language.code = variant.language_code
where variant.deprecated_at is null
  and printing.deprecated_at is null
  and set_row.deprecated_at is null;

grant select on api.catalogue_cards to anon, authenticated, service_role;

create table if not exists market.market_identities (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  product_kind text not null,
  language_code text,
  canonical_card_id text,
  set_id text,
  collector_number text,
  variant_id uuid,
  sealed_product_variant_id uuid,
  condition_code text,
  grader text,
  grade text,
  deprecated_at timestamptz
);

create table if not exists market.sold_observations (
  id uuid primary key default gen_random_uuid(),
  market_identity_id uuid not null references market.market_identities(id),
  variant_id uuid,
  sealed_product_variant_id uuid,
  provider_code text not null references market.source_providers(code),
  source_item_id text not null,
  sold_price numeric not null,
  shipping_price numeric,
  currency_code text not null,
  sale_type text not null,
  condition_code text,
  grader_code text,
  grade_id uuid,
  observed_at timestamptz not null,
  sold_at timestamptz not null,
  source_url text,
  raw_title text not null,
  parsed_match_confidence numeric not null default 0,
  duplicate_group_id uuid,
  raw_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists market.active_listings (
  id uuid primary key default gen_random_uuid(),
  market_identity_id uuid not null references market.market_identities(id),
  variant_id uuid,
  sealed_product_variant_id uuid,
  provider_code text not null references market.source_providers(code),
  source_item_id text not null,
  observed_price numeric,
  shipping_price numeric,
  currency_code text,
  listing_type text,
  condition_code text,
  grader_code text,
  grade_id uuid,
  observed_at timestamptz,
  source_url text,
  raw_title text,
  parsed_match_confidence numeric,
  duplicate_group_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists market.price_estimate_versions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active'
);
create table if not exists market.price_estimates (
  id uuid primary key default gen_random_uuid(),
  market_identity_id uuid not null,
  estimate_version_id uuid not null,
  product_kind text not null,
  variant_id uuid,
  sealed_product_variant_id uuid,
  condition_code text,
  grader_code text,
  grade_id uuid,
  display_currency_code text not null,
  evidence_status text,
  unavailable_reason text,
  sample_count integer,
  sold_sample_count integer,
  active_listing_count integer,
  source_count integer,
  date_range_start timestamptz,
  date_range_end timestamptz,
  low_estimate numeric,
  central_estimate numeric,
  high_estimate numeric,
  confidence_score numeric,
  confidence_label text,
  freshness text,
  recency_weight numeric,
  source_breakdown jsonb,
  outlier_summary jsonb,
  fallback_identity_key text,
  fallback_reason text,
  calculated_at timestamptz,
  stale_after timestamptz,
  public_notes text,
  internal_notes text,
  superseded_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists market_price_estimates_active_scope_fixture_uidx
  on market.price_estimates (market_identity_id, estimate_version_id, product_kind, variant_id, sealed_product_variant_id, condition_code, grader_code, grade_id, display_currency_code) nulls not distinct
  where superseded_at is null;
create table if not exists market.outlier_decisions (
  id uuid primary key default gen_random_uuid(),
  price_estimate_id uuid not null,
  sold_observation_id uuid not null,
  decision text,
  method text,
  observed_price numeric,
  median_price numeric,
  mad_score numeric,
  reason text,
  decided_by text
);

revoke all on all tables in schema market from public, anon, authenticated;
revoke all on all tables in schema ingest from public, anon, authenticated;
grant all privileges on all tables in schema market, ingest to service_role;
grant select on all tables in schema catalog to service_role;
grant select, insert, update on public.price_observations to service_role;
grant select, insert, update on public.market_price_snapshots to service_role;
