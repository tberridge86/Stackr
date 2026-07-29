-- Stage 7: private recognition service scan diagnostics.
--
-- The recognition service stores minimised request diagnostics here. It must
-- not store base64 images, public user-image paths, or raw OCR text unless a
-- later consented dataset migration explicitly permits it.

create schema if not exists ml;
create schema if not exists audit;

revoke all on schema ml from public;
grant usage on schema ml, audit to service_role;

create table if not exists ml.recognition_scan_diagnostics (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique,
  request_id text,
  created_by uuid references auth.users(id) on delete set null,
  route_version text not null,
  model_version text,
  index_version text,
  requested_path text not null
    check (requested_path in ('fast_path', 'fallback_path', 'embed', 'feedback')),
  source_type text not null
    check (source_type in ('device_embedding', 'private_image_key', 'feedback', 'none')),
  match_status text not null
    check (match_status in ('exact', 'probable', 'ambiguous', 'no_match', 'rejected')),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  top_variant_id uuid references catalog.card_variants(id) on delete set null,
  top_printing_id uuid references catalog.card_printings(id) on delete set null,
  overall_confidence numeric check (overall_confidence is null or (overall_confidence >= 0 and overall_confidence <= 1)),
  score_summary jsonb not null default '{}'::jsonb,
  uncertainty_flags text[] not null default array[]::text[],
  requested_next_action text not null default 'confirm_candidate'
    check (requested_next_action in ('auto_confirm_allowed', 'confirm_candidate', 'rescan', 'upload_fallback_image', 'manual_entry', 'none')),
  capture_quality jsonb not null default '{}'::jsonb,
  ocr_summary jsonb not null default '{}'::jsonb,
  image_retention_status text not null default 'none'
    check (image_retention_status in ('none', 'temporary_fallback', 'consented_feedback', 'unknown')),
  image_storage_key_hash text,
  diagnostic_payload jsonb not null default '{}'::jsonb,
  consent_state jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (image_storage_key_hash is null or image_storage_key_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists recognition_scan_diagnostics_created_idx
  on ml.recognition_scan_diagnostics(created_at desc);

create index if not exists recognition_scan_diagnostics_status_idx
  on ml.recognition_scan_diagnostics(match_status, created_at desc);

create index if not exists recognition_scan_diagnostics_model_idx
  on ml.recognition_scan_diagnostics(model_version, index_version, created_at desc);

create index if not exists recognition_scan_diagnostics_variant_idx
  on ml.recognition_scan_diagnostics(top_variant_id, created_at desc)
  where top_variant_id is not null;

do $$
begin
  if to_regprocedure('audit.set_updated_at()') is not null then
    drop trigger if exists set_recognition_scan_diagnostics_updated_at on ml.recognition_scan_diagnostics;
    create trigger set_recognition_scan_diagnostics_updated_at
      before update on ml.recognition_scan_diagnostics
      for each row execute function audit.set_updated_at();
  end if;
end $$;

alter table ml.recognition_scan_diagnostics enable row level security;

drop policy if exists "recognition scan diagnostics service role manages rows" on ml.recognition_scan_diagnostics;
create policy "recognition scan diagnostics service role manages rows"
  on ml.recognition_scan_diagnostics
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table ml.recognition_scan_diagnostics from anon, authenticated;
grant select, insert, update, delete on table ml.recognition_scan_diagnostics to service_role;
grant usage, select on all sequences in schema ml to service_role;

comment on table ml.recognition_scan_diagnostics is
  'Private minimised diagnostics emitted by the Stackr FastAPI recognition service. Original images are not stored here.';

comment on column ml.recognition_scan_diagnostics.image_storage_key_hash is
  'SHA-256 hash of a private uploaded-image key when fallback processing uses an object-storage key. The raw key is not retained.';

comment on column ml.recognition_scan_diagnostics.ocr_summary is
  'Redacted OCR evidence summary. Do not store raw OCR text here unless a later consented training-data migration explicitly permits it.';
