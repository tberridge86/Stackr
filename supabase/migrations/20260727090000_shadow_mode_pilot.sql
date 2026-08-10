create extension if not exists pgcrypto;

create table if not exists public.recognition_shadow_mode_pilot_items (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  local_record_id text not null,
  schema_version text not null,
  route_version text not null,
  anonymous_scan_id text not null,
  visible_engine_result jsonb not null default '{}'::jsonb,
  local_engine_result jsonb not null default '{}'::jsonb,
  top_three_local_candidates jsonb not null default '[]'::jsonb,
  local_confidence numeric,
  visible_confidence numeric,
  timings jsonb not null default '{}'::jsonb,
  agreement jsonb not null default '{}'::jsonb,
  user_confirmed_identity jsonb,
  user_feedback_action text,
  disagreement_category text not null
    check (disagreement_category in (
      'pending_manual_review',
      'current_provider_correct_local_wrong',
      'local_correct_current_provider_wrong',
      'both_wrong',
      'both_correct',
      'exact_identity_agreement_variant_disagreement',
      'language_disagreement',
      'catalogue_missing',
      'capture_quality_failure',
      'local_unavailable',
      'visible_unavailable'
    )),
  capture_quality_failure_reasons text[] not null default '{}',
  capture_quality jsonb not null default '{}'::jsonb,
  ocr_evidence_summary jsonb not null default '{}'::jsonb,
  model_version text,
  catalogue_version text,
  visible_model_version text,
  visible_catalogue_version text,
  device_class text,
  app_context jsonb not null default '{}'::jsonb,
  raw_image_recorded boolean not null default false
    check (raw_image_recorded = false),
  image_upload_consent_active boolean not null default false,
  review_status text not null default 'pending_review'
    check (review_status in ('pending_review', 'reviewed', 'ignored')),
  reviewer_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, local_record_id)
);

create index if not exists recognition_shadow_mode_review_idx
  on public.recognition_shadow_mode_pilot_items (review_status, disagreement_category, created_at desc);

create index if not exists recognition_shadow_mode_scan_idx
  on public.recognition_shadow_mode_pilot_items (anonymous_scan_id, created_at desc);

create or replace function public.touch_recognition_shadow_mode_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_recognition_shadow_mode_updated_at
  on public.recognition_shadow_mode_pilot_items;

create trigger touch_recognition_shadow_mode_updated_at
before update on public.recognition_shadow_mode_pilot_items
for each row
execute function public.touch_recognition_shadow_mode_updated_at();

alter table public.recognition_shadow_mode_pilot_items enable row level security;

drop policy if exists "Internal reviewers manage shadow mode pilot"
  on public.recognition_shadow_mode_pilot_items;
create policy "Internal reviewers manage shadow mode pilot"
  on public.recognition_shadow_mode_pilot_items
  for all
  to authenticated
  using (public.is_recognition_feedback_reviewer())
  with check (public.is_recognition_feedback_reviewer());

grant select, insert, update, delete on public.recognition_shadow_mode_pilot_items to authenticated;

comment on table public.recognition_shadow_mode_pilot_items is
  'Internal local-recognition shadow-mode pilot evidence. Stores compact metadata only and rejects raw-image storage.';

comment on column public.recognition_shadow_mode_pilot_items.user_confirmed_identity is
  'Tester-confirmed identity from the visible scan result, correction, manual search or collection action.';

comment on column public.recognition_shadow_mode_pilot_items.raw_image_recorded is
  'Must remain false. Images are handled only through separate explicit consent flows.';
