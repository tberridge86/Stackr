create extension if not exists pgcrypto;

create or replace function public.is_scan_lab_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create table if not exists public.scan_lab_captures (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  local_capture_id text not null,
  schema_version text not null,
  route_version text not null,
  physical_card_session_id text not null,
  captured_at timestamptz not null,
  expected_identity jsonb not null default '{}'::jsonb,
  user_confirmed_identity jsonb,
  review_status text not null default 'pending'
    check (review_status in (
      'pending',
      'confirmed',
      'corrected',
      'unresolved',
      'wrong_variant',
      'poor_capture',
      'deleted'
    )),
  label_verification_status text not null default 'user_reported'
    check (label_verification_status in (
      'user_reported',
      'queued_for_review',
      'reviewed',
      'verified',
      'rejected'
    )),
  original_photo_width integer,
  original_photo_height integer,
  original_photo_orientation text,
  rectified_card_width integer,
  rectified_card_height integer,
  original_photo_storage_path text,
  rectified_card_storage_path text,
  original_photo_checksum_sha256 text,
  rectified_card_checksum_sha256 text,
  capture_quality jsonb not null default '{}'::jsonb,
  ocr_evidence jsonb not null default '{}'::jsonb,
  rectification jsonb not null default '{}'::jsonb,
  device_info jsonb not null default '{}'::jsonb,
  lighting_category text not null default 'unknown'
    check (lighting_category in ('bright_indoor', 'dim_indoor', 'daylight', 'mixed', 'unknown')),
  sleeve_state text not null default 'unknown'
    check (sleeve_state in ('none', 'sleeved', 'unknown')),
  holder_state text not null default 'unknown'
    check (holder_state in ('none', 'binder_pocket', 'toploader', 'slab', 'unknown')),
  card_side text not null default 'front'
    check (card_side in ('front', 'back')),
  image_upload_consent boolean not null default false,
  image_upload_status text not null default 'local_only'
    check (image_upload_status in ('local_only', 'metadata_received', 'uploaded', 'failed', 'deleted')),
  reviewer_notes text,
  uploaded_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, local_capture_id)
);

create index if not exists scan_lab_captures_created_by_idx
  on public.scan_lab_captures (created_by, created_at desc);

create index if not exists scan_lab_captures_physical_card_session_idx
  on public.scan_lab_captures (physical_card_session_id);

create index if not exists scan_lab_captures_review_export_idx
  on public.scan_lab_captures (
    label_verification_status,
    review_status,
    image_upload_status,
    physical_card_session_id
  )
  where deleted_at is null;

create table if not exists public.scan_lab_capture_events (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid references public.scan_lab_captures(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  event_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scan_lab_capture_events_capture_idx
  on public.scan_lab_capture_events (capture_id, created_at desc);

create or replace function public.touch_scan_lab_capture_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_scan_lab_capture_updated_at
  on public.scan_lab_captures;

create trigger touch_scan_lab_capture_updated_at
before update on public.scan_lab_captures
for each row
execute function public.touch_scan_lab_capture_updated_at();

alter table public.scan_lab_captures enable row level security;
alter table public.scan_lab_capture_events enable row level security;

drop policy if exists "Scan Lab admins can insert own captures"
  on public.scan_lab_captures;
create policy "Scan Lab admins can insert own captures"
  on public.scan_lab_captures
  for insert
  to authenticated
  with check (auth.uid() = created_by and public.is_scan_lab_admin());

drop policy if exists "Scan Lab admins can read own captures"
  on public.scan_lab_captures;
create policy "Scan Lab admins can read own captures"
  on public.scan_lab_captures
  for select
  to authenticated
  using (auth.uid() = created_by and public.is_scan_lab_admin());

drop policy if exists "Scan Lab admins can update own captures"
  on public.scan_lab_captures;
create policy "Scan Lab admins can update own captures"
  on public.scan_lab_captures
  for update
  to authenticated
  using (auth.uid() = created_by and public.is_scan_lab_admin())
  with check (auth.uid() = created_by and public.is_scan_lab_admin());

drop policy if exists "Scan Lab admins can delete own captures"
  on public.scan_lab_captures;
create policy "Scan Lab admins can delete own captures"
  on public.scan_lab_captures
  for delete
  to authenticated
  using (auth.uid() = created_by and public.is_scan_lab_admin());

drop policy if exists "Scan Lab admins can insert own events"
  on public.scan_lab_capture_events;
create policy "Scan Lab admins can insert own events"
  on public.scan_lab_capture_events
  for insert
  to authenticated
  with check (auth.uid() = created_by and public.is_scan_lab_admin());

drop policy if exists "Scan Lab admins can read own events"
  on public.scan_lab_capture_events;
create policy "Scan Lab admins can read own events"
  on public.scan_lab_capture_events
  for select
  to authenticated
  using (auth.uid() = created_by and public.is_scan_lab_admin());

grant select, insert, update, delete on public.scan_lab_captures to authenticated;
grant select, insert on public.scan_lab_capture_events to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scan-lab-training',
  'scan-lab-training',
  false,
  41943040,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Scan Lab service role manages private training objects"
  on storage.objects;
create policy "Scan Lab service role manages private training objects"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'scan-lab-training')
  with check (bucket_id = 'scan-lab-training');

comment on table public.scan_lab_captures is
  'Internal Scan Lab capture metadata for consented real-world recognition training examples. Images are stored in the private scan-lab-training bucket through the protected backend route only.';

comment on column public.scan_lab_captures.physical_card_session_id is
  'Groups multiple views of the same physical card so train/test splitting cannot leak by individual image.';
