alter table public.scan_grading_jobs
  add column if not exists idempotency_key text;

-- Existing rows predate caller-supplied idempotency. Give each an immutable,
-- collision-free legacy key without pretending it is evidence-derived.
update public.scan_grading_jobs
set idempotency_key = 'legacy:' || id::text
where idempotency_key is null;

alter table public.scan_grading_jobs
  alter column idempotency_key set not null,
  drop constraint if exists scan_grading_jobs_idempotency_key_format_check,
  add constraint scan_grading_jobs_idempotency_key_format_check
    check (
      idempotency_key ~ '^(pregrade|condition):[0-9a-f]{64}$'
      or idempotency_key ~ '^legacy:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    );

-- Never trust an existing object merely because it has the expected name. A
-- prior/manual object with that name could have different keys, a predicate,
-- INCLUDE columns, or NULLS NOT DISTINCT semantics. Recreate the exact index.
drop index if exists public.scan_grading_jobs_owner_idempotency_uidx;
create unique index scan_grading_jobs_owner_idempotency_uidx
  on public.scan_grading_jobs (user_id, idempotency_key);

drop trigger if exists scan_grading_jobs_idempotency_immutable on public.scan_grading_jobs;
drop function if exists public.enforce_scan_grading_job_idempotency_immutable();

create function public.enforce_scan_grading_job_idempotency_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.idempotency_key is distinct from old.idempotency_key then
    raise exception using
      errcode = '42501',
      message = 'grading job idempotency key is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_scan_grading_job_idempotency_immutable()
  from public, anon, authenticated;

create trigger scan_grading_jobs_idempotency_immutable
before update on public.scan_grading_jobs
for each row execute function public.enforce_scan_grading_job_idempotency_immutable();

alter table public.scan_grading_jobs
  enable trigger scan_grading_jobs_idempotency_immutable;

alter table public.scan_grading_jobs enable row level security;

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
        idempotency_key = 'pregrade:' || evidence_manifest_sha256
        and evidence_eligibility = 'structurally_ineligible_identity_unbound'
        and physical_card_id is null
        and canonical_variant_id is null
        and identity_attestation_ref is null
        and identity_attestation_sha256 is null
      )
    )
  );

comment on column public.scan_grading_jobs.idempotency_key is
  'Owner-scoped immutable retry key. New full pre-grade jobs bind pregrade:<evidence manifest SHA-256>; legacy:<uuid> identifies only pre-migration rows.';
