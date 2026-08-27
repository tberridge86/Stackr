-- Stage 4: Stackr asset repository and delivery pipeline.
-- Additive repository migration only. Do not apply to production until the
-- Stage 2 and Stage 3 migrations have been validated in an isolated DB.

create extension if not exists pgcrypto;

create schema if not exists catalog;
create schema if not exists ml;
create schema if not exists api;
create schema if not exists audit;

revoke all on schema ml from public;
grant usage on schema catalog, ml, audit to service_role;
grant usage on schema api to anon, authenticated, service_role;

alter table catalog.assets
  add column if not exists asset_id text,
  add column if not exists asset_visibility text not null default 'public_catalogue',
  add column if not exists storage_provider text not null default 'supabase_storage',
  add column if not exists storage_bucket text,
  add column if not exists storage_key text,
  add column if not exists original_source_url text,
  add column if not exists original_source_identifier text,
  add column if not exists source_attribution text,
  add column if not exists permission_status text not null default 'unknown',
  add column if not exists content_sha256 text,
  add column if not exists perceptual_hash text,
  add column if not exists byte_size bigint,
  add column if not exists derivative_list jsonb not null default '[]'::jsonb,
  add column if not exists cache_control text,
  add column if not exists archival_storage_key text,
  add column if not exists externally_referenced boolean not null default false,
  add column if not exists unavailable_reason text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists retention_status text not null default 'active',
  add column if not exists retention_until timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_reason text;

update catalog.assets
set
  asset_id = coalesce(asset_id, id::text),
  storage_provider = case
    when storage_provider = 'supabase_storage' and storage_path is null and storage_key is null and url is not null
      then 'external_reference'
    else storage_provider
  end,
  storage_key = coalesce(storage_key, storage_path),
  storage_bucket = coalesce(storage_bucket, case when publicly_servable then 'stackr-catalogue-public' else null end),
  original_source_url = coalesce(original_source_url, url),
  source_attribution = coalesce(source_attribution, attribution_text),
  permission_status = case
    when permission_status <> 'unknown' then permission_status
    when rights_status = 'approved' then 'approved'
    when rights_status = 'denied' then 'denied'
    when rights_status = 'restricted' then 'restricted'
    when rights_status = 'under_review' then 'under_review'
    else 'unknown'
  end,
  content_sha256 = coalesce(content_sha256, sha256),
  externally_referenced = case
    when storage_path is null and storage_key is null and url is not null then true
    else externally_referenced
  end
where asset_id is null
   or storage_key is null
   or storage_bucket is null
   or original_source_url is null
   or source_attribution is null
   or content_sha256 is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assets_asset_id_key'
  ) then
    alter table catalog.assets
      add constraint assets_asset_id_key unique (asset_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assets_asset_visibility_check'
  ) then
    alter table catalog.assets
      add constraint assets_asset_visibility_check
      check (asset_visibility in ('public_catalogue', 'private_scan_temp', 'private_training_feedback', 'private_model'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assets_storage_provider_check'
  ) then
    alter table catalog.assets
      add constraint assets_storage_provider_check
      check (storage_provider in ('supabase_storage', 's3_compatible', 'local_dev', 'external_reference', 'unavailable'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assets_permission_status_check'
  ) then
    alter table catalog.assets
      add constraint assets_permission_status_check
      check (permission_status in ('approved', 'under_review', 'restricted', 'denied', 'unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assets_retention_status_check'
  ) then
    alter table catalog.assets
      add constraint assets_retention_status_check
      check (retention_status in ('active', 'temporary', 'retain_for_training', 'delete_scheduled', 'deleted', 'unavailable'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assets_content_sha256_format'
  ) then
    alter table catalog.assets
      add constraint assets_content_sha256_format
      check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assets_storage_or_reference_check'
  ) then
    alter table catalog.assets
      add constraint assets_storage_or_reference_check
      check (
        storage_provider in ('external_reference', 'unavailable')
        or storage_key is not null
        or storage_path is not null
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assets_derivative_list_array'
  ) then
    alter table catalog.assets
      add constraint assets_derivative_list_array
      check (jsonb_typeof(derivative_list) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assets_byte_size_positive'
  ) then
    alter table catalog.assets
      add constraint assets_byte_size_positive
      check (byte_size is null or byte_size > 0);
  end if;
end $$;

create unique index if not exists assets_storage_object_uidx
  on catalog.assets(storage_provider, storage_bucket, storage_key)
  where storage_key is not null and deleted_at is null;

create index if not exists assets_content_sha256_idx
  on catalog.assets(content_sha256)
  where content_sha256 is not null and deleted_at is null;

create index if not exists assets_perceptual_hash_idx
  on catalog.assets(perceptual_hash)
  where perceptual_hash is not null and deleted_at is null;

create index if not exists assets_retention_idx
  on catalog.assets(asset_visibility, retention_status, retention_until)
  where retention_status in ('temporary', 'delete_scheduled');

create index if not exists assets_manifest_public_idx
  on catalog.assets(asset_type, asset_visibility, publicly_servable, permission_status, updated_at desc)
  where deleted_at is null;

create table if not exists ml.model_assets (
  id uuid primary key default gen_random_uuid(),
  model_key text not null,
  model_version text not null,
  asset_id uuid references catalog.assets(id) on delete restrict,
  storage_bucket text not null default 'stackr-model-private',
  storage_key text not null,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null default 'application/octet-stream',
  byte_size bigint not null check (byte_size > 0),
  permission_status text not null default 'under_review'
    check (permission_status in ('approved', 'under_review', 'restricted', 'denied', 'unknown')),
  approved_for_install boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_key, model_version, storage_key)
);

create index if not exists model_assets_version_idx
  on ml.model_assets(model_key, model_version, approved_for_install);

create table if not exists ml.scan_upload_assets (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null unique default gen_random_uuid()::text,
  asset_type text not null
    check (asset_type in ('user_scan', 'recognition_feedback', 'scan_lab_capture', 'training_capture')),
  asset_visibility text not null
    check (asset_visibility in ('private_scan_temp', 'private_training_feedback')),
  created_by uuid references auth.users(id) on delete set null,
  storage_provider text not null default 'supabase_storage'
    check (storage_provider in ('supabase_storage', 's3_compatible', 'local_dev')),
  storage_bucket text not null,
  storage_key text not null,
  original_source text not null default 'stackr_user_upload',
  source_attribution text,
  permission_status text not null default 'temporary_upload'
    check (permission_status in ('temporary_upload', 'user_consented', 'consent_withdrawn', 'delete_requested', 'unknown')),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  perceptual_hash text check (perceptual_hash is null or perceptual_hash ~ '^[a-f0-9]{16}$'),
  mime_type text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  byte_size bigint not null check (byte_size > 0),
  derivative_list jsonb not null default '[]'::jsonb check (jsonb_typeof(derivative_list) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz,
  retention_status text not null default 'temporary'
    check (retention_status in ('temporary', 'retain_for_training', 'delete_scheduled', 'deleted')),
  retention_until timestamptz,
  deleted_at timestamptz,
  deletion_reason text,
  upload_context jsonb not null default '{}'::jsonb,
  unique (storage_bucket, storage_key)
);

create index if not exists scan_upload_assets_owner_idx
  on ml.scan_upload_assets(created_by, created_at desc)
  where deleted_at is null;

create index if not exists scan_upload_assets_retention_idx
  on ml.scan_upload_assets(retention_status, retention_until)
  where retention_status in ('temporary', 'delete_scheduled');

create index if not exists scan_upload_assets_content_sha_idx
  on ml.scan_upload_assets(content_sha256)
  where deleted_at is null;

create index if not exists scan_upload_assets_perceptual_hash_idx
  on ml.scan_upload_assets(perceptual_hash)
  where perceptual_hash is not null and deleted_at is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'stackr-catalogue-public',
    'stackr-catalogue-public',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'stackr-scan-temp',
    'stackr-scan-temp',
    false,
    20971520,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  ),
  (
    'stackr-training-feedback',
    'stackr-training-feedback',
    false,
    41943040,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  ),
  (
    'stackr-model-private',
    'stackr-model-private',
    false,
    524288000,
    array['application/octet-stream', 'application/json', 'application/x-sqlite3']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

drop policy if exists "Stackr catalogue public assets are readable" on storage.objects;
create policy "Stackr catalogue public assets are readable"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'stackr-catalogue-public');

drop policy if exists "Stackr service role manages catalogue assets" on storage.objects;
create policy "Stackr service role manages catalogue assets"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'stackr-catalogue-public')
  with check (bucket_id = 'stackr-catalogue-public');

drop policy if exists "Stackr service role manages scan temp assets" on storage.objects;
create policy "Stackr service role manages scan temp assets"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'stackr-scan-temp')
  with check (bucket_id = 'stackr-scan-temp');

drop policy if exists "Stackr service role manages training feedback assets" on storage.objects;
create policy "Stackr service role manages training feedback assets"
  on storage.objects
  for all
  to service_role
  using (bucket_id in ('stackr-training-feedback', 'recognition-feedback', 'scan-lab-training'))
  with check (bucket_id in ('stackr-training-feedback', 'recognition-feedback', 'scan-lab-training'));

drop policy if exists "Stackr service role manages model assets" on storage.objects;
create policy "Stackr service role manages model assets"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'stackr-model-private')
  with check (bucket_id = 'stackr-model-private');

drop policy if exists "catalogue assets public read" on catalog.assets;
create policy "catalogue assets public read"
  on catalog.assets
  for select
  to anon, authenticated
  using (
    deprecated_at is null
    and deleted_at is null
    and asset_visibility = 'public_catalogue'
    and publicly_servable
    and rights_status = 'approved'
    and permission_status = 'approved'
    and retention_status = 'active'
  );

create or replace view api.asset_manifest
with (security_invoker = true) as
select
  a.asset_id,
  a.asset_type,
  a.game_code,
  a.set_id,
  a.printing_id,
  a.variant_id,
  a.storage_provider,
  a.storage_bucket,
  a.storage_key,
  a.url as external_url,
  a.original_source_url,
  coalesce(a.source_attribution, a.attribution_text) as source_attribution,
  a.permission_status,
  a.rights_status,
  a.content_sha256,
  a.perceptual_hash,
  a.mime_type,
  a.width,
  a.height,
  a.byte_size,
  a.derivative_list,
  a.cache_control,
  a.externally_referenced,
  a.unavailable_reason,
  a.last_verified_at,
  a.created_at,
  a.updated_at
from catalog.assets a
where a.asset_visibility = 'public_catalogue'
  and a.publicly_servable
  and a.permission_status = 'approved'
  and a.rights_status = 'approved'
  and a.retention_status = 'active'
  and a.deleted_at is null
  and a.storage_provider <> 'unavailable';

grant select on table api.asset_manifest to anon, authenticated, service_role;
grant select, insert, update, delete on table ml.model_assets to service_role;
grant select, insert, update, delete on table ml.scan_upload_assets to service_role;
revoke all on table ml.model_assets from anon, authenticated;
revoke all on table ml.scan_upload_assets from anon, authenticated;

alter table ml.model_assets enable row level security;
alter table ml.scan_upload_assets enable row level security;

drop policy if exists "model assets service role manages rows" on ml.model_assets;
create policy "model assets service role manages rows"
  on ml.model_assets
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "scan upload assets service role manages rows" on ml.scan_upload_assets;
create policy "scan upload assets service role manages rows"
  on ml.scan_upload_assets
  for all
  to service_role
  using (true)
  with check (true);

drop trigger if exists set_updated_at on ml.model_assets;
create trigger set_updated_at
  before update on ml.model_assets
  for each row execute function audit.set_updated_at();

drop trigger if exists set_updated_at on ml.scan_upload_assets;
create trigger set_updated_at
  before update on ml.scan_upload_assets
  for each row execute function audit.set_updated_at();

comment on table catalog.assets is
  'Canonical asset metadata for approved catalogue assets, private scan uploads, training captures, model files and external references.';

comment on column catalog.assets.derivative_list is
  'Array of derivative objects generated outside normal catalogue requests. Includes role, storage key, dimensions, byte size, MIME type, SHA-256 and cache headers.';

comment on view api.asset_manifest is
  'Public-safe manifest of approved catalogue assets only. Private scans, training captures, model assets, licensing notes and unavailable assets are excluded.';

comment on table ml.model_assets is
  'Private model files and recognition indexes. Rows are service-role only and not exposed through the public Data API.';

comment on table ml.scan_upload_assets is
  'Private validated user scan, feedback and training-upload asset records. Rows are service-role only and not exposed through the public Data API.';
