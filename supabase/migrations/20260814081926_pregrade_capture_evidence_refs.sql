alter table public.scan_grading_jobs
  add column if not exists evidence_manifest_ref text,
  add column if not exists evidence_manifest_sha256 text,
  add column if not exists evidence_eligibility text not null default 'not_applicable',
  add column if not exists physical_card_id text,
  add column if not exists canonical_variant_id text,
  add column if not exists identity_attestation_ref text,
  add column if not exists identity_attestation_sha256 text,
  add column if not exists evidence_contract_enforced boolean not null default true;

-- Historical jobs cannot be given evidence that never existed. Preserve them explicitly,
-- while the owner INSERT policy below prevents clients from creating new exemptions.
update public.scan_grading_jobs
set evidence_contract_enforced = false
where intent = 'full_pregrade'
  and (
    evidence_manifest_ref is null
    or evidence_manifest_sha256 is null
    or photo_stages <> array[
      'front', 'back',
      'corner_top_left', 'corner_top_right', 'corner_bottom_left', 'corner_bottom_right',
      'edge_top', 'edge_right', 'edge_bottom', 'edge_left',
      'surface_front_raking_left', 'surface_front_raking_right',
      'surface_back_raking_left', 'surface_back_raking_right'
    ]::text[]
  );

alter table public.scan_grading_jobs
  drop constraint if exists scan_grading_jobs_evidence_manifest_pair_check,
  drop constraint if exists scan_grading_jobs_evidence_manifest_sha256_check,
  drop constraint if exists scan_grading_jobs_evidence_manifest_ref_check,
  drop constraint if exists scan_grading_jobs_evidence_manifest_binding_check,
  drop constraint if exists scan_grading_jobs_evidence_eligibility_check,
  drop constraint if exists scan_grading_jobs_evidence_identity_pair_check,
  drop constraint if exists scan_grading_jobs_identity_attestation_pair_check,
  drop constraint if exists scan_grading_jobs_identity_attestation_sha256_check,
  drop constraint if exists scan_grading_jobs_identity_attestation_ref_check,
  drop constraint if exists scan_grading_jobs_identity_attestation_binding_check,
  drop constraint if exists scan_grading_jobs_full_pregrade_evidence_check;

alter table public.scan_grading_jobs
  add constraint scan_grading_jobs_evidence_manifest_pair_check
    check (
      (evidence_manifest_ref is null and evidence_manifest_sha256 is null)
      or (evidence_manifest_ref is not null and evidence_manifest_sha256 is not null)
    ),
  add constraint scan_grading_jobs_evidence_manifest_sha256_check
    check (evidence_manifest_sha256 is null or evidence_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint scan_grading_jobs_evidence_manifest_ref_check
    check (
      evidence_manifest_ref is null
      or evidence_manifest_ref ~ '^stackr-private://pregrade-manifests/[^/]+/[0-9a-f]{64}[.]json$'
    ),
  add constraint scan_grading_jobs_evidence_manifest_binding_check
    check (
      evidence_manifest_ref is null
      or right(evidence_manifest_ref, 69) = evidence_manifest_sha256 || '.json'
    ),
  add constraint scan_grading_jobs_evidence_eligibility_check
    check (evidence_eligibility in (
      'not_applicable', 'identity_bound', 'structurally_ineligible_identity_unbound'
    )),
  add constraint scan_grading_jobs_evidence_identity_pair_check
    check (
      (physical_card_id is null and canonical_variant_id is null)
      or (physical_card_id is not null and canonical_variant_id is not null)
    ),
  add constraint scan_grading_jobs_identity_attestation_pair_check
    check (
      (identity_attestation_ref is null and identity_attestation_sha256 is null)
      or (identity_attestation_ref is not null and identity_attestation_sha256 is not null)
    ),
  add constraint scan_grading_jobs_identity_attestation_sha256_check
    check (identity_attestation_sha256 is null or identity_attestation_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint scan_grading_jobs_identity_attestation_ref_check
    check (
      identity_attestation_ref is null
      or identity_attestation_ref ~ '^stackr-authority://pregrade-identities/[^/]+/[0-9a-f]{64}[.]json$'
    ),
  add constraint scan_grading_jobs_identity_attestation_binding_check
    check (
      identity_attestation_ref is null
      or right(identity_attestation_ref, 69) = identity_attestation_sha256 || '.json'
    ),
  add constraint scan_grading_jobs_full_pregrade_evidence_check
    check (
      intent <> 'full_pregrade'
      or evidence_contract_enforced = false
      or (
        photo_count = 14
        and photo_stages = array[
          'front', 'back',
          'corner_top_left', 'corner_top_right', 'corner_bottom_left', 'corner_bottom_right',
          'edge_top', 'edge_right', 'edge_bottom', 'edge_left',
          'surface_front_raking_left', 'surface_front_raking_right',
          'surface_back_raking_left', 'surface_back_raking_right'
        ]::text[]
        and evidence_manifest_ref is not null
        and evidence_manifest_sha256 is not null
        and (
          (
            evidence_eligibility = 'identity_bound'
            and physical_card_id is not null
            and canonical_variant_id is not null
            and identity_attestation_ref is not null
            and identity_attestation_sha256 is not null
          )
          or (
            evidence_eligibility = 'structurally_ineligible_identity_unbound'
            and physical_card_id is null
            and canonical_variant_id is null
            and identity_attestation_ref is null
            and identity_attestation_sha256 is null
          )
        )
      )
    );

create or replace function public.enforce_scan_grading_job_owner_update_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if row(
    new.user_id, new.scan_session_id, new.intent, new.provider,
    new.photo_count, new.photo_stages,
    new.evidence_manifest_ref, new.evidence_manifest_sha256,
    new.evidence_eligibility, new.physical_card_id, new.canonical_variant_id,
    new.identity_attestation_ref, new.identity_attestation_sha256,
    new.evidence_contract_enforced, new.queued_at
  ) is distinct from row(
    old.user_id, old.scan_session_id, old.intent, old.provider,
    old.photo_count, old.photo_stages,
    old.evidence_manifest_ref, old.evidence_manifest_sha256,
    old.evidence_eligibility, old.physical_card_id, old.canonical_variant_id,
    old.identity_attestation_ref, old.identity_attestation_sha256,
    old.evidence_contract_enforced, old.queued_at
  ) then
    raise exception using errcode = '42501', message = 'grading job identity, provider and evidence are immutable';
  end if;

  if old.status in ('complete', 'failed', 'requires_rescan') and new is distinct from old then
    raise exception using errcode = '42501', message = 'terminal grading jobs are immutable';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'queued' and new.status in ('processing', 'failed'))
    or (old.status = 'processing' and new.status in ('complete', 'failed', 'requires_rescan'))
  ) then
    raise exception using errcode = '42501', message = 'invalid grading job status transition';
  end if;

  if new.result is distinct from old.result and not (
    old.status = 'processing' and new.status in ('complete', 'requires_rescan')
  ) then
    raise exception using errcode = '42501', message = 'grading result can only be attached at a processing terminal transition';
  end if;

  if new.status = 'complete' and new.result is null then
    raise exception using errcode = '42501', message = 'completed grading jobs require a result';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_scan_grading_job_owner_update_boundary() from public, anon, authenticated;

drop trigger if exists scan_grading_jobs_owner_update_boundary on public.scan_grading_jobs;
create trigger scan_grading_jobs_owner_update_boundary
before update on public.scan_grading_jobs
for each row execute function public.enforce_scan_grading_job_owner_update_boundary();

drop policy if exists "scan grading jobs owner insert" on public.scan_grading_jobs;
create policy "scan grading jobs owner insert"
  on public.scan_grading_jobs
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and evidence_contract_enforced = true
    and status = 'queued'
    and result is null
    and error_code is null
    and error_message is null
    and started_at is null
    and completed_at is null
    and (
      intent <> 'full_pregrade'
      or (
        evidence_eligibility = 'structurally_ineligible_identity_unbound'
        and physical_card_id is null
        and canonical_variant_id is null
        and identity_attestation_ref is null
        and identity_attestation_sha256 is null
      )
    )
  );

comment on column public.scan_grading_jobs.evidence_manifest_ref is
  'Opaque private device evidence reference only. Never store image bytes, base64, local URIs, or job payloads here.';
comment on column public.scan_grading_jobs.evidence_manifest_sha256 is
  'SHA-256 binding for the private pre-grade evidence manifest reference.';
comment on column public.scan_grading_jobs.evidence_contract_enforced is
  'False only for pre-migration legacy jobs; authenticated inserts must be true.';
comment on column public.scan_grading_jobs.identity_attestation_ref is
  'Hash-bound identity authority reference. Authenticated owner inserts cannot self-assert this field.';
comment on column public.scan_grading_jobs.identity_attestation_sha256 is
  'SHA-256 binding for the authoritative identity attestation; required before identity_bound is valid.';
comment on table public.scan_grading_jobs is
  'Owner updates retain controlled processing-to-terminal status/result writes for the current client-side provider flow. Evidence, identity and provider are immutable, results attach only on complete/rescan transitions, and terminal rows cannot be rewritten; final status/result authority must move to a trusted worker before client write access can be removed.';
