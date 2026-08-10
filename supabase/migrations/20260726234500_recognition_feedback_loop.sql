create extension if not exists pgcrypto;

create or replace function public.is_recognition_feedback_reviewer()
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

create table if not exists public.recognition_feedback_items (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  local_feedback_id text not null,
  schema_version text not null,
  route_version text not null,
  anonymous_scan_id text not null,
  feedback_action text not null
    check (feedback_action in (
      'confirm_result',
      'choose_candidate',
      'manual_correction',
      'variant_correction',
      'missing_card',
      'bad_scan'
    )),
  predicted_identity jsonb,
  corrected_identity jsonb,
  corrected_variant text,
  missing_card_description text,
  top_candidate_scores jsonb not null default '[]'::jsonb,
  capture_quality jsonb not null default '{}'::jsonb,
  ocr_evidence_summary jsonb not null default '{}'::jsonb,
  model_version text,
  catalogue_version text,
  device_class text,
  consent_state jsonb not null default '{}'::jsonb,
  user_label_status text not null default 'user_submitted'
    check (user_label_status in (
      'user_submitted',
      'queued_for_review',
      'reviewed',
      'verified',
      'rejected',
      'withdrawn'
    )),
  review_status text not null default 'queued'
    check (review_status in (
      'queued',
      'approved_identity',
      'changed_identity',
      'ambiguous',
      'rejected_poor_image',
      'rejected_other',
      'exported',
      'withdrawn',
      'deleted'
    )),
  reviewed_identity jsonb,
  reviewer_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  physical_card_session_id text,
  rectified_image_width integer,
  rectified_image_height integer,
  rectified_image_storage_path text,
  rectified_image_checksum_sha256 text,
  image_upload_status text not null default 'local_only'
    check (image_upload_status in ('local_only', 'metadata_received', 'uploaded', 'failed', 'deleted')),
  dataset_version text,
  uploaded_at timestamptz,
  withdrawn_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, local_feedback_id)
);

create index if not exists recognition_feedback_items_owner_idx
  on public.recognition_feedback_items (created_by, created_at desc);

create index if not exists recognition_feedback_items_review_queue_idx
  on public.recognition_feedback_items (review_status, user_label_status, image_upload_status, created_at)
  where deleted_at is null;

create index if not exists recognition_feedback_items_physical_card_idx
  on public.recognition_feedback_items (physical_card_session_id)
  where deleted_at is null;

create table if not exists public.recognition_feedback_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid references public.recognition_feedback_items(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  event_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists recognition_feedback_events_feedback_idx
  on public.recognition_feedback_events (feedback_id, created_at desc);

create or replace function public.touch_recognition_feedback_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_recognition_feedback_updated_at
  on public.recognition_feedback_items;

create trigger touch_recognition_feedback_updated_at
before update on public.recognition_feedback_items
for each row
execute function public.touch_recognition_feedback_updated_at();

create or replace function public.prevent_user_feedback_review_field_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_recognition_feedback_reviewer() or current_role = 'service_role' then
    return new;
  end if;

  if new.review_status is distinct from old.review_status
    or new.reviewed_identity is distinct from old.reviewed_identity
    or new.reviewer_notes is distinct from old.reviewer_notes
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.dataset_version is distinct from old.dataset_version
  then
    raise exception 'Recognition feedback review fields can only be changed by internal reviewers.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_user_feedback_review_field_changes
  on public.recognition_feedback_items;

create trigger prevent_user_feedback_review_field_changes
before update on public.recognition_feedback_items
for each row
execute function public.prevent_user_feedback_review_field_changes();

alter table public.recognition_feedback_items enable row level security;
alter table public.recognition_feedback_events enable row level security;

drop policy if exists "Users can insert own recognition feedback"
  on public.recognition_feedback_items;
create policy "Users can insert own recognition feedback"
  on public.recognition_feedback_items
  for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Users can read own recognition feedback"
  on public.recognition_feedback_items;
create policy "Users can read own recognition feedback"
  on public.recognition_feedback_items
  for select
  to authenticated
  using (auth.uid() = created_by);

drop policy if exists "Users can update own nonreview recognition feedback"
  on public.recognition_feedback_items;
create policy "Users can update own nonreview recognition feedback"
  on public.recognition_feedback_items
  for update
  to authenticated
  using (auth.uid() = created_by and review_status in ('queued', 'withdrawn', 'deleted'))
  with check (auth.uid() = created_by);

drop policy if exists "Users can delete own recognition feedback"
  on public.recognition_feedback_items;
create policy "Users can delete own recognition feedback"
  on public.recognition_feedback_items
  for delete
  to authenticated
  using (auth.uid() = created_by);

drop policy if exists "Reviewers can manage recognition feedback"
  on public.recognition_feedback_items;
create policy "Reviewers can manage recognition feedback"
  on public.recognition_feedback_items
  for all
  to authenticated
  using (public.is_recognition_feedback_reviewer())
  with check (public.is_recognition_feedback_reviewer());

drop policy if exists "Users can insert own recognition feedback events"
  on public.recognition_feedback_events;
create policy "Users can insert own recognition feedback events"
  on public.recognition_feedback_events
  for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Users can read own recognition feedback events"
  on public.recognition_feedback_events;
create policy "Users can read own recognition feedback events"
  on public.recognition_feedback_events
  for select
  to authenticated
  using (auth.uid() = created_by);

drop policy if exists "Reviewers can read recognition feedback events"
  on public.recognition_feedback_events;
create policy "Reviewers can read recognition feedback events"
  on public.recognition_feedback_events
  for select
  to authenticated
  using (public.is_recognition_feedback_reviewer());

grant select, insert, update, delete on public.recognition_feedback_items to authenticated;
grant select, insert on public.recognition_feedback_events to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recognition-feedback',
  'recognition-feedback',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Recognition feedback service role manages private objects"
  on storage.objects;
create policy "Recognition feedback service role manages private objects"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'recognition-feedback')
  with check (bucket_id = 'recognition-feedback');

comment on table public.recognition_feedback_items is
  'Consent-controlled recognition feedback. User-submitted labels remain separate from internal review status and are not ground truth until reviewed.';

comment on column public.recognition_feedback_items.consent_state is
  'Stores metadata/image consent, withdrawal and deletion state. Images are never uploaded by default.';

comment on column public.recognition_feedback_items.physical_card_session_id is
  'Groups several views of the same physical card to prevent train/test leakage.';
