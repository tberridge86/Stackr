-- Global Pokémon artwork launch boundary.
--
-- Economic/legal premise approved by the product owner:
-- all Pokémon catalogue artwork and derivatives, from all current and future
-- sources, are approved for Stackr-owned products and operations worldwide.
--
-- This migration intentionally:
--   * leaves `stackr-catalogue-public` public and never mutates Storage objects;
--   * keeps the public manifest empty until a global owner attestation is
--     imported and the append-only runtime switch is explicitly enabled;
--   * permits manifest rows only for active, content-addressed Storage objects;
--   * keeps raw provider/licensing evidence private;
--   * blocks non-service writes to the catalogue bucket; and
--   * uses an append-only disable event as the rollback path.
--
-- Accepted limitation: disabling the manifest cannot revoke a previously known
-- direct public Storage URL while the bucket remains public.

create extension if not exists pgcrypto;

create schema if not exists catalog;
create schema if not exists api;
create schema if not exists audit;

do $$
declare
  catalogue_bucket_public boolean;
begin
  if to_regclass('catalog.assets') is null
    or to_regclass('catalog.catalogue_version_assets') is null
    or to_regclass('catalog.catalogue_versions') is null
  then
    raise exception 'global artwork boundary prerequisite missing: catalogue asset/version tables';
  end if;

  select b.public
  into catalogue_bucket_public
  from storage.buckets b
  where b.id = 'stackr-catalogue-public';

  if not found then
    raise exception 'global artwork boundary prerequisite missing: stackr-catalogue-public bucket';
  end if;

  if not catalogue_bucket_public then
    raise exception using
      message = 'global artwork boundary blocked: stackr-catalogue-public is not public',
      hint = 'This economic launch boundary does not change bucket visibility. Reconcile the environment before applying.';
  end if;
end
$$;

create table if not exists catalog.artwork_global_owner_attestations (
  event_sequence bigint generated always as identity primary key,
  attestation_id uuid not null unique,
  approved boolean not null check (approved),
  franchise text not null check (franchise = 'pokemon'),
  asset_scope text not null check (asset_scope = 'all_pokemon_catalogue_artwork_and_derivatives'),
  source_scope text not null check (source_scope = 'all_current_and_future_pokemon_artwork_sources'),
  use_scope text not null check (use_scope = 'all_stackr_products_and_operations'),
  channel_scope text not null check (channel_scope = 'all_stackr_owned_and_operated_channels'),
  territory_scope text not null check (territory_scope = 'worldwide'),
  legal_entity_name text not null check (length(btrim(legal_entity_name)) between 2 and 240),
  signer_full_name text not null check (length(btrim(signer_full_name)) between 2 and 200),
  signer_title text not null check (length(btrim(signer_title)) between 2 and 200),
  signed_at timestamptz not null,
  effective_at timestamptz not null,
  expires_at timestamptz not null,
  hard_copy_evidence_ref text
    check (hard_copy_evidence_ref is null or length(btrim(hard_copy_evidence_ref)) between 8 and 1000),
  notes text check (notes is null or length(notes) <= 2000),
  attestation_payload jsonb not null check (jsonb_typeof(attestation_payload) = 'object'),
  attestation_payload_sha256 text not null unique
    check (attestation_payload_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_file_sha256 text not null check (evidence_file_sha256 ~ '^[a-f0-9]{64}$'),
  imported_request_id uuid not null unique,
  imported_by text not null check (length(btrim(imported_by)) between 3 and 200),
  recorded_at timestamptz not null default now(),
  check (signed_at <= effective_at),
  check (effective_at < expires_at),
  check (signed_at <= recorded_at + interval '5 minutes')
);

create table if not exists catalog.artwork_delivery_control_events (
  event_sequence bigint generated always as identity primary key,
  event_id uuid not null unique default gen_random_uuid(),
  state text not null check (state in ('disabled', 'enabled')),
  reason text not null check (length(btrim(reason)) between 8 and 1000),
  request_id uuid not null unique,
  actor text not null check (length(btrim(actor)) between 3 and 200),
  owner_attestation_id uuid references catalog.artwork_global_owner_attestations(attestation_id) on delete restrict,
  owner_attestation_sha256 text
    check (owner_attestation_sha256 is null or owner_attestation_sha256 ~ '^[a-f0-9]{64}$'),
  migration_sha256 text check (migration_sha256 is null or migration_sha256 ~ '^[a-f0-9]{64}$'),
  compatible_client_release_sha256 text
    check (compatible_client_release_sha256 is null or compatible_client_release_sha256 ~ '^[a-f0-9]{64}$'),
  backend_containment_release_sha256 text
    check (backend_containment_release_sha256 is null or backend_containment_release_sha256 ~ '^[a-f0-9]{64}$'),
  compatibility_evidence_ref text,
  expected_storage_object_count bigint check (expected_storage_object_count is null or expected_storage_object_count >= 0),
  expected_storage_inventory_sha256 text
    check (expected_storage_inventory_sha256 is null or expected_storage_inventory_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_contract_verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    state = 'disabled'
    or (
      owner_attestation_id is not null
      and owner_attestation_sha256 is not null
      and migration_sha256 is not null
      and compatible_client_release_sha256 is not null
      and backend_containment_release_sha256 is not null
      and compatibility_evidence_ref is not null
      and length(btrim(compatibility_evidence_ref)) >= 8
      and expected_storage_object_count is not null
      and expected_storage_inventory_sha256 is not null
      and manifest_contract_verified_at is not null
    )
  )
);

create index if not exists artwork_delivery_control_events_latest_idx
  on catalog.artwork_delivery_control_events(event_sequence desc);
create index if not exists artwork_delivery_control_events_attestation_idx
  on catalog.artwork_delivery_control_events(owner_attestation_id)
  where owner_attestation_id is not null;

alter table catalog.artwork_global_owner_attestations enable row level security;
alter table catalog.artwork_delivery_control_events enable row level security;

revoke all on table catalog.artwork_global_owner_attestations from public, anon, authenticated;
revoke all on table catalog.artwork_delivery_control_events from public, anon, authenticated;
revoke all on table catalog.artwork_global_owner_attestations from service_role;
revoke all on table catalog.artwork_delivery_control_events from service_role;
grant select, insert on table catalog.artwork_global_owner_attestations to service_role;
grant select, insert on table catalog.artwork_delivery_control_events to service_role;
grant usage, select on sequence catalog.artwork_global_owner_attestations_event_sequence_seq to service_role;
grant usage, select on sequence catalog.artwork_delivery_control_events_event_sequence_seq to service_role;

drop policy if exists "global artwork attestations service append" on catalog.artwork_global_owner_attestations;
create policy "global artwork attestations service append"
  on catalog.artwork_global_owner_attestations
  for insert to service_role with check (true);

drop policy if exists "global artwork attestations service read" on catalog.artwork_global_owner_attestations;
create policy "global artwork attestations service read"
  on catalog.artwork_global_owner_attestations
  for select to service_role using (true);

drop policy if exists "artwork delivery controls service append" on catalog.artwork_delivery_control_events;
create policy "artwork delivery controls service append"
  on catalog.artwork_delivery_control_events
  for insert to service_role with check (true);

drop policy if exists "artwork delivery controls service read" on catalog.artwork_delivery_control_events;
create policy "artwork delivery controls service read"
  on catalog.artwork_delivery_control_events
  for select to service_role using (true);

create or replace function audit.reject_artwork_launch_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'artwork launch ledgers are append-only';
end
$$;

revoke all on function audit.reject_artwork_launch_event_mutation() from public, anon, authenticated, service_role;

drop trigger if exists reject_artwork_global_owner_attestation_mutation
  on catalog.artwork_global_owner_attestations;
create trigger reject_artwork_global_owner_attestation_mutation
  before update or delete on catalog.artwork_global_owner_attestations
  for each row execute function audit.reject_artwork_launch_event_mutation();

drop trigger if exists reject_artwork_delivery_control_event_mutation
  on catalog.artwork_delivery_control_events;
create trigger reject_artwork_delivery_control_event_mutation
  before update or delete on catalog.artwork_delivery_control_events
  for each row execute function audit.reject_artwork_launch_event_mutation();

insert into catalog.artwork_delivery_control_events (
  event_id,
  state,
  reason,
  request_id,
  actor
)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  'disabled',
  'Default-off global Pokémon artwork boundary installed.',
  '00000000-0000-4000-8000-000000000002'::uuid,
  'migration:artwork_delivery_default_off_boundary'
where not exists (select 1 from catalog.artwork_delivery_control_events);

create or replace function catalog.is_artwork_delivery_enabled()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from storage.buckets b
    where b.id = 'stackr-catalogue-public'
      and b.public = true
  ) and coalesce((
    select e.state = 'enabled'
      and e.owner_attestation_sha256 = a.attestation_payload_sha256
      and a.approved
      and a.franchise = 'pokemon'
      and a.asset_scope = 'all_pokemon_catalogue_artwork_and_derivatives'
      and a.source_scope = 'all_current_and_future_pokemon_artwork_sources'
      and a.use_scope = 'all_stackr_products_and_operations'
      and a.channel_scope = 'all_stackr_owned_and_operated_channels'
      and a.territory_scope = 'worldwide'
      and a.effective_at <= statement_timestamp()
      and a.expires_at > statement_timestamp()
      and e.migration_sha256 is not null
      and e.compatible_client_release_sha256 is not null
      and e.backend_containment_release_sha256 is not null
      and e.expected_storage_object_count is not null
      and e.expected_storage_inventory_sha256 is not null
      and e.manifest_contract_verified_at is not null
    from catalog.artwork_delivery_control_events e
    left join catalog.artwork_global_owner_attestations a
      on a.attestation_id = e.owner_attestation_id
    order by e.event_sequence desc
    limit 1
  ), false)
$$;

revoke all on function catalog.is_artwork_delivery_enabled() from public;
grant execute on function catalog.is_artwork_delivery_enabled() to anon, authenticated, service_role;

-- Public reads are accepted under the global-coverage premise. Writes remain
-- service-only: these restrictive policies cannot be widened by another
-- permissive policy for anon/authenticated clients. Service role bypasses RLS.
drop policy if exists "Stackr catalogue artwork non-service inserts denied" on storage.objects;
create policy "Stackr catalogue artwork non-service inserts denied"
  on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'stackr-catalogue-public');

drop policy if exists "Stackr catalogue artwork non-service updates denied" on storage.objects;
create policy "Stackr catalogue artwork non-service updates denied"
  on storage.objects as restrictive for update to public
  using (bucket_id <> 'stackr-catalogue-public')
  with check (bucket_id <> 'stackr-catalogue-public');

drop policy if exists "Stackr catalogue artwork non-service deletes denied" on storage.objects;
create policy "Stackr catalogue artwork non-service deletes denied"
  on storage.objects as restrictive for delete to public
  using (bucket_id <> 'stackr-catalogue-public');

-- The base asset audit/licensing record remains private. Public consumers use
-- only the security-barrier manifest below; source URLs and raw evidence are
-- never projected.
revoke select on table catalog.assets from public, anon, authenticated;
drop policy if exists "catalogue assets public read" on catalog.assets;
drop policy if exists "catalogue assets signed release boundary" on catalog.assets;

drop view if exists api.asset_manifest;
create view api.asset_manifest
with (security_barrier = true) as
select
  coalesce(a.asset_id, a.id::text) as asset_id,
  a.asset_type,
  a.game_code,
  coalesce(cva.set_id, a.set_id, av.set_id, ap.set_id) as set_id,
  coalesce(cva.printing_id, a.printing_id, av.printing_id) as printing_id,
  coalesce(cva.variant_id, a.variant_id) as variant_id,
  a.storage_provider,
  a.storage_bucket,
  a.storage_key,
  null::text as external_url,
  null::text as original_source_url,
  coalesce(a.source_attribution, a.attribution_text) as source_attribution,
  'global_owner_approved'::text as permission_status,
  'global_owner_approved'::text as rights_status,
  a.content_sha256,
  a.perceptual_hash,
  a.mime_type,
  a.width,
  a.height,
  a.byte_size,
  '[]'::jsonb as derivative_list,
  a.cache_control,
  false as externally_referenced,
  a.unavailable_reason,
  a.last_verified_at,
  a.created_at,
  a.updated_at,
  cva.catalogue_version_id,
  a.id as asset_row_id
from catalog.catalogue_version_assets cva
join catalog.catalogue_versions cv on cv.id = cva.catalogue_version_id
join catalog.assets a on a.id = cva.asset_id
join storage.objects o
  on o.bucket_id = a.storage_bucket
 and o.name = a.storage_key
left join catalog.card_variants av
  on av.id = coalesce(cva.variant_id, a.variant_id)
left join catalog.card_printings ap
  on ap.id = coalesce(cva.printing_id, a.printing_id, av.printing_id)
where (select catalog.is_artwork_delivery_enabled())
  and cv.status = 'published'
  and cv.deprecated_at is null
  and a.asset_visibility = 'public_catalogue'
  and a.retention_status = 'active'
  and a.deleted_at is null
  and a.deprecated_at is null
  and a.storage_provider = 'supabase_storage'
  and a.storage_bucket = 'stackr-catalogue-public'
  and a.content_sha256 ~ '^[a-f0-9]{64}$'
  and position(a.content_sha256 in a.storage_key) > 0;

grant select on table api.asset_manifest to anon, authenticated, service_role;

-- Legacy compatibility is metadata-only. Existing select('*') callers must be
-- migrated to these views before this migration is applied; image/raw columns
-- on the base relations are deliberately not granted.
revoke select on table public.pokemon_cards from public, anon, authenticated;
grant select (
  id, name, number, set_id, rarity, language, region, image_status,
  pricing_status, last_image_checked_at, last_price_checked_at
) on table public.pokemon_cards to anon, authenticated;

revoke select on table public.tcg_cards from public, anon, authenticated;
grant select (
  id, set_id, concept_id, region, language, canonical_name, local_name,
  english_display_name, collector_number, rarity, supertype, subtypes, hp,
  artist, source_provider, source_id, data_completeness, image_status,
  last_synced_at, provider, provider_card_id, provider_set_id, pricing_status,
  record_status, last_image_checked_at, last_price_checked_at, created_at, updated_at
) on table public.tcg_cards to anon, authenticated;

revoke select on table public.pokemon_sets from public, anon, authenticated;
grant select (
  id, name, series, printed_total, total, release_date, language, region
) on table public.pokemon_sets to anon, authenticated;

revoke select on table public.tcg_sets from public, anon, authenticated;
grant select (
  id, series_id, region, language, canonical_name, local_name,
  english_display_name, set_code, release_date, printed_total, actual_total,
  source_provider, source_id, data_completeness, image_completeness,
  last_synced_at, created_at, updated_at
) on table public.tcg_sets to anon, authenticated;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'public.card_previews',
    'public.card_images',
    'public.tcg_card_printings',
    'public.tcg_set_cover_images'
  ]
  loop
    if to_regclass(relation_name) is not null then
      execute format(
        'revoke select on table %s from public, anon, authenticated',
        to_regclass(relation_name)
      );
    end if;
  end loop;
end
$$;

create or replace view api.legacy_pokemon_card_metadata
with (security_invoker = true) as
select
  c.id, c.name, c.number, c.set_id, c.rarity, c.language, c.region,
  '{}'::jsonb as external_ids,
  null::text as image_small,
  null::text as image_large,
  c.image_status,
  c.pricing_status,
  jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'number', c.number,
    'language', c.language,
    'rarity', c.rarity,
    'set', jsonb_build_object('id', c.set_id)
  ) as raw_data
from public.pokemon_cards c;

create or replace view api.legacy_tcg_card_metadata
with (security_invoker = true) as
select
  c.id, c.set_id, c.concept_id, c.region, c.language, c.canonical_name,
  c.local_name, c.english_display_name, c.collector_number, c.rarity,
  c.supertype, c.subtypes, c.hp, c.artist,
  null::text as image_small_url,
  null::text as image_large_url,
  c.source_provider, c.source_id, c.provider, c.provider_card_id,
  c.provider_set_id, c.data_completeness, c.image_status, c.pricing_status,
  c.record_status,
  jsonb_build_object(
    'id', c.id,
    'name', coalesce(c.english_display_name, c.canonical_name, c.local_name),
    'local_name', c.local_name,
    'number', c.collector_number,
    'language', c.language,
    'rarity', c.rarity,
    'set', jsonb_build_object('id', c.set_id)
  ) as raw_payload
from public.tcg_cards c;

create or replace view api.legacy_pokemon_set_metadata
with (security_invoker = true) as
select
  s.id, s.name, s.series, s.printed_total, s.total, s.release_date,
  s.language, s.region,
  '{}'::jsonb as external_ids,
  null::text as symbol_url,
  null::text as logo_url,
  jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'series', s.series,
    'printedTotal', s.printed_total,
    'total', s.total,
    'releaseDate', s.release_date,
    'language', s.language,
    'region', s.region
  ) as raw_data
from public.pokemon_sets s;

create or replace view api.legacy_tcg_set_metadata
with (security_invoker = true) as
select
  s.id, s.series_id, s.region, s.language, s.canonical_name, s.local_name,
  s.english_display_name, s.set_code, s.release_date, s.printed_total,
  s.actual_total, s.source_provider, s.source_id, s.data_completeness,
  s.image_completeness,
  jsonb_build_object(
    'id', s.id,
    'name', coalesce(s.english_display_name, s.canonical_name, s.local_name),
    'series_id', s.series_id,
    'set_code', s.set_code,
    'releaseDate', s.release_date,
    'printedTotal', s.printed_total,
    'total', s.actual_total,
    'language', s.language,
    'region', s.region
  ) as raw_payload
from public.tcg_sets s;

grant select on table
  api.legacy_pokemon_card_metadata,
  api.legacy_tcg_card_metadata,
  api.legacy_pokemon_set_metadata,
  api.legacy_tcg_set_metadata
to anon, authenticated, service_role;

comment on table catalog.artwork_global_owner_attestations is
  'Append-only global Pokémon artwork owner approvals. Signer and legal-entity identities are operator supplied.';
comment on table catalog.artwork_delivery_control_events is
  'Append-only default-off manifest runtime events. Disable is the rollback path.';
comment on view api.asset_manifest is
  'Global-owner-approved, runtime-gated, active content-addressed public artwork manifest; raw provider URLs are excluded.';

do $$
declare
  catalogue_bucket_public boolean;
  default_delivery_enabled boolean;
  manifest_rows bigint;
begin
  select b.public into catalogue_bucket_public
  from storage.buckets b
  where b.id = 'stackr-catalogue-public';

  if catalogue_bucket_public is distinct from true then
    raise exception 'global artwork boundary invariant failed: catalogue bucket is not public';
  end if;

  select catalog.is_artwork_delivery_enabled() into default_delivery_enabled;
  if default_delivery_enabled then
    raise exception 'global artwork boundary invariant failed: delivery is not default-off';
  end if;

  select count(*) into manifest_rows from api.asset_manifest;
  if manifest_rows <> 0 then
    raise exception 'global artwork boundary invariant failed: OFF manifest is not empty';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'catalog'
      and g.table_name in ('artwork_global_owner_attestations', 'artwork_delivery_control_events')
      and g.grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'global artwork boundary invariant failed: private approval ledger is publicly granted';
  end if;

  if has_table_privilege('anon', 'catalog.assets', 'select')
    or has_table_privilege('authenticated', 'catalog.assets', 'select')
    or has_table_privilege('anon', 'public.pokemon_cards', 'select')
    or has_table_privilege('authenticated', 'public.pokemon_cards', 'select')
    or has_table_privilege('anon', 'public.tcg_cards', 'select')
    or has_table_privilege('authenticated', 'public.tcg_cards', 'select')
  then
    raise exception 'global artwork boundary invariant failed: full-row raw relation access remains';
  end if;

  if has_column_privilege('anon', 'public.pokemon_cards', 'image_small', 'select')
    or has_column_privilege('anon', 'public.pokemon_cards', 'image_large', 'select')
    or has_column_privilege('anon', 'public.pokemon_cards', 'raw_data', 'select')
    or has_column_privilege('authenticated', 'public.pokemon_cards', 'image_small', 'select')
    or has_column_privilege('authenticated', 'public.pokemon_cards', 'image_large', 'select')
    or has_column_privilege('authenticated', 'public.pokemon_cards', 'raw_data', 'select')
    or has_column_privilege('anon', 'public.tcg_cards', 'image_small_url', 'select')
    or has_column_privilege('anon', 'public.tcg_cards', 'image_large_url', 'select')
    or has_column_privilege('anon', 'public.tcg_cards', 'raw_payload', 'select')
    or has_column_privilege('anon', 'public.tcg_cards', 'raw_source', 'select')
    or has_column_privilege('authenticated', 'public.tcg_cards', 'image_small_url', 'select')
    or has_column_privilege('authenticated', 'public.tcg_cards', 'image_large_url', 'select')
    or has_column_privilege('authenticated', 'public.tcg_cards', 'raw_payload', 'select')
    or has_column_privilege('authenticated', 'public.tcg_cards', 'raw_source', 'select')
  then
    raise exception 'global artwork boundary invariant failed: legacy artwork/raw column privilege remains';
  end if;

  if not exists (
    select 1 from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname = 'Stackr catalogue artwork non-service inserts denied'
      and p.permissive = 'RESTRICTIVE'
      and p.cmd = 'INSERT'
  ) or not exists (
    select 1 from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname = 'Stackr catalogue artwork non-service updates denied'
      and p.permissive = 'RESTRICTIVE'
      and p.cmd = 'UPDATE'
  ) or not exists (
    select 1 from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname = 'Stackr catalogue artwork non-service deletes denied'
      and p.permissive = 'RESTRICTIVE'
      and p.cmd = 'DELETE'
  ) then
    raise exception 'global artwork boundary invariant failed: service-only Storage write boundary missing';
  end if;
end
$$;
