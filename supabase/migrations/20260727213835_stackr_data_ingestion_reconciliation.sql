-- Stage 3: Stackr data ingestion and reconciliation.
-- Additive repository migration only. Do not apply to production until the
-- Stage 2 canonical catalogue migration has been validated in an isolated DB.

create extension if not exists pgcrypto;

create schema if not exists ingest;
create schema if not exists audit;

revoke all on schema ingest from public;
revoke all on schema audit from public;
grant usage on schema ingest, audit to service_role;

alter table ingest.raw_source_records
  add column if not exists provider_record_id text,
  add column if not exists source_endpoint text,
  add column if not exists http_metadata jsonb not null default '{}'::jsonb,
  add column if not exists validation_status text not null default 'pending',
  add column if not exists validation_errors jsonb not null default '[]'::jsonb;

update ingest.raw_source_records
set
  provider_record_id = external_id,
  source_endpoint = coalesce(source_endpoint, source_url)
where provider_record_id is null;

alter table ingest.raw_source_records
  alter column provider_record_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'raw_source_records_provider_record_id_nonempty'
  ) then
    alter table ingest.raw_source_records
      add constraint raw_source_records_provider_record_id_nonempty
      check (provider_record_id <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'raw_source_records_http_metadata_object'
  ) then
    alter table ingest.raw_source_records
      add constraint raw_source_records_http_metadata_object
      check (jsonb_typeof(http_metadata) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'raw_source_records_validation_status_check'
  ) then
    alter table ingest.raw_source_records
      add constraint raw_source_records_validation_status_check
      check (validation_status in ('pending', 'valid', 'invalid', 'quarantined'));
  end if;
end $$;

create table if not exists ingest.import_checkpoints (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references ingest.sources(id) on delete restrict,
  import_run_id uuid references ingest.import_runs(id) on delete cascade,
  checkpoint_key text not null,
  checkpoint_type text not null
    check (checkpoint_type in ('source', 'language', 'set', 'record', 'cursor')),
  language_code text references catalog.languages(code),
  provider_set_id text,
  cursor_payload jsonb not null default '{}'::jsonb,
  last_raw_record_id uuid references ingest.raw_source_records(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned')),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, checkpoint_key)
);

create table if not exists ingest.work_queue (
  id uuid primary key default gen_random_uuid(),
  queue_name text not null
    check (queue_name in ('catalogue_ingestion', 'asset_processing', 'embedding_generation', 'price_refresh', 'conflict_review')),
  source_id uuid references ingest.sources(id) on delete set null,
  import_run_id uuid references ingest.import_runs(id) on delete set null,
  command text not null
    check (command in ('run_source', 'run_language', 'run_set', 'resume_import', 'rebuild_record', 'process_asset', 'generate_embedding', 'refresh_price', 'review_conflict')),
  idempotency_key text not null,
  priority integer not null default 50 check (priority >= 0 and priority <= 100),
  status text not null default 'pending'
    check (status in ('pending', 'leased', 'completed', 'failed', 'dead_letter', 'cancelled')),
  run_after timestamptz not null default now(),
  lease_token uuid,
  leased_at timestamptz,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  backoff_seconds integer not null default 60 check (backoff_seconds > 0),
  last_error text,
  dead_lettered_at timestamptz,
  dead_letter_reason text,
  payload jsonb not null default '{}'::jsonb,
  request_id text,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create table if not exists ingest.provider_schedule_policies (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references ingest.sources(id) on delete cascade,
  job_name text not null,
  queue_name text not null
    check (queue_name in ('catalogue_ingestion', 'asset_processing', 'embedding_generation', 'price_refresh', 'conflict_review')),
  command text not null,
  cron_expression text,
  automated_refresh_allowed boolean not null default false,
  enabled boolean not null default false,
  terms_reviewed_at timestamptz,
  terms_review_url text,
  last_enqueued_at timestamptz,
  next_run_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, job_name),
  check (enabled = false or automated_refresh_allowed = true),
  check (cron_expression is null or cron_expression <> '')
);

create table if not exists ingest.source_health_reports (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references ingest.sources(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null
    check (status in ('ok', 'degraded', 'unavailable', 'forbidden', 'failed', 'unknown')),
  response_status integer,
  response_time_ms integer check (response_time_ms is null or response_time_ms >= 0),
  next_retry_at timestamptz,
  message text,
  http_metadata jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists audit.ingest_merge_decisions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references ingest.sources(id) on delete set null,
  import_run_id uuid references ingest.import_runs(id) on delete set null,
  raw_record_id uuid references ingest.raw_source_records(id) on delete set null,
  request_id text,
  decision_type text not null
    check (decision_type in ('validated', 'external_id_match', 'identity_match', 'created', 'updated', 'skipped', 'quarantined', 'licence_blocked', 'failed')),
  entity_schema text,
  entity_table text,
  entity_id uuid,
  canonical_key text,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  reason text not null,
  proposed_payload jsonb not null default '{}'::jsonb,
  existing_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists raw_source_records_provider_record_idx
  on ingest.raw_source_records(source_id, record_type, provider_record_id, language_code, retrieved_at desc);

create index if not exists raw_source_records_retrieved_idx
  on ingest.raw_source_records(source_id, retrieved_at desc);

create index if not exists import_checkpoints_active_idx
  on ingest.import_checkpoints(source_id, status, updated_at desc);

create index if not exists work_queue_due_idx
  on ingest.work_queue(queue_name, status, run_after, priority desc, created_at)
  where status in ('pending', 'failed');

create index if not exists work_queue_import_run_idx
  on ingest.work_queue(import_run_id, status, created_at desc);

create index if not exists work_queue_dead_letter_idx
  on ingest.work_queue(queue_name, dead_lettered_at desc)
  where status = 'dead_letter';

create index if not exists provider_schedule_due_idx
  on ingest.provider_schedule_policies(enabled, next_run_at, queue_name)
  where enabled and automated_refresh_allowed;

create index if not exists source_health_reports_current_idx
  on ingest.source_health_reports(source_id, checked_at desc);

create index if not exists ingest_merge_decisions_raw_record_idx
  on audit.ingest_merge_decisions(raw_record_id, created_at desc);

create index if not exists ingest_merge_decisions_canonical_idx
  on audit.ingest_merge_decisions(canonical_key, decision_type, created_at desc)
  where canonical_key is not null;

create or replace function ingest.next_retry_at(
  attempts integer,
  base_seconds integer default 60,
  max_seconds integer default 86400
) returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now() + make_interval(secs => least(
    greatest(coalesce(base_seconds, 60), 1)
      * power(2, greatest(coalesce(attempts, 0), 0))::integer,
    greatest(coalesce(max_seconds, 86400), 1)
  ));
$$;

revoke all on function ingest.next_retry_at(integer, integer, integer) from public, anon, authenticated;
grant execute on function ingest.next_retry_at(integer, integer, integer) to service_role;

create or replace view ingest.source_health_current
with (security_invoker = true) as
select distinct on (source_id)
  source_id,
  status,
  checked_at,
  response_status,
  response_time_ms,
  next_retry_at,
  message,
  capabilities
from ingest.source_health_reports
order by source_id, checked_at desc;

create or replace view ingest.dead_letter_queue
with (security_invoker = true) as
select
  id,
  queue_name,
  source_id,
  import_run_id,
  command,
  idempotency_key,
  attempts,
  max_attempts,
  last_error,
  dead_lettered_at,
  dead_letter_reason,
  payload,
  request_id,
  created_at,
  updated_at
from ingest.work_queue
where status = 'dead_letter';

create or replace view ingest.catalogue_quality_report
with (security_invoker = true) as
with variant_image_counts as (
  select
    variant_id,
    count(*) filter (
      where asset_type = 'card_image'
        and deprecated_at is null
        and publicly_servable
        and rights_status = 'approved'
    ) as image_count
  from catalog.assets
  where variant_id is not null
  group by variant_id
),
set_logo_counts as (
  select
    set_id,
    count(*) filter (
      where asset_type in ('set_logo', 'set_symbol')
        and deprecated_at is null
        and publicly_servable
        and rights_status = 'approved'
    ) as logo_count
  from catalog.assets
  where set_id is not null
  group by set_id
),
duplicate_keys as (
  select set_id, count(*) as duplicate_canonical_keys
  from (
    select set_id, canonical_key, count(*) as duplicate_count
    from catalog.card_variants
    where deprecated_at is null
    group by set_id, canonical_key
    having count(*) > 1
  ) duplicate_rows
  group by set_id
),
unresolved_variants as (
  select set_id, count(*) as unresolved_variant_count
  from catalog.card_variants
  where deprecated_at is null
    and (variant_code = 'regional_other' or source_confidence < 0.70)
  group by set_id
),
open_conflicts as (
  select
    coalesce(entity_id::text, proposed_payload->>'set_id', proposed_payload->>'setId') as set_ref,
    count(*) filter (where conflict_type = 'name_conflict') as conflicting_names,
    count(*) as open_conflicts
  from ingest.data_conflicts
  where status in ('open', 'in_review')
  group by coalesce(entity_id::text, proposed_payload->>'set_id', proposed_payload->>'setId')
),
raw_record_quality as (
  select
    coalesce(raw_payload->>'set_id', raw_payload->>'setId', raw_payload->>'set_code', raw_payload->>'setCode') as set_ref,
    count(*) filter (where retrieved_at < now() - interval '30 days') as stale_source_records,
    count(*) filter (where licence_status <> 'approved') as records_without_legal_use_status
  from ingest.raw_source_records
  where deprecated_at is null
  group by coalesce(raw_payload->>'set_id', raw_payload->>'setId', raw_payload->>'set_code', raw_payload->>'setCode')
),
expected_set_totals as (
  select
    coalesce(language_code, raw_payload->>'language_code', raw_payload->>'languageCode', raw_payload->>'language') as language_code,
    count(distinct provider_record_id) as expected_set_total
  from ingest.raw_source_records
  where record_type = 'set'
    and deprecated_at is null
  group by coalesce(language_code, raw_payload->>'language_code', raw_payload->>'languageCode', raw_payload->>'language')
)
select
  s.id as set_id,
  s.game_code,
  s.language_code,
  s.set_code,
  s.provider_set_code,
  s.native_name,
  s.english_display_name,
  coalesce(max(est.expected_set_total), count(*) over (partition by s.game_code, s.language_code)) as expected_set_total,
  count(*) over (partition by s.game_code, s.language_code) as imported_set_total,
  greatest(
    coalesce(max(est.expected_set_total), count(*) over (partition by s.game_code, s.language_code))
      - count(*) over (partition by s.game_code, s.language_code),
    0
  ) as expected_vs_imported_set_delta,
  s.total as expected_card_total,
  count(distinct cp.id) as imported_card_total,
  greatest(coalesce(s.total, 0) - count(distinct cp.id), 0) as expected_vs_imported_card_delta,
  count(distinct cv.id) filter (where coalesce(vic.image_count, 0) = 0) as cards_missing_images,
  (coalesce(max(slc.logo_count), 0) = 0) as set_missing_logo,
  coalesce(max(dk.duplicate_canonical_keys), 0) as duplicate_canonical_keys,
  coalesce(max(uv.unresolved_variant_count), 0) as unresolved_variants,
  coalesce(max(oc.conflicting_names), 0) as conflicting_names,
  coalesce(max(rrq.stale_source_records), 0) as stale_source_records,
  coalesce(max(rrq.records_without_legal_use_status), 0) as records_without_legal_use_status,
  now() as reported_at
from catalog.sets s
left join catalog.card_printings cp
  on cp.set_id = s.id and cp.deprecated_at is null
left join catalog.card_variants cv
  on cv.printing_id = cp.id and cv.deprecated_at is null
left join variant_image_counts vic
  on vic.variant_id = cv.id
left join set_logo_counts slc
  on slc.set_id = s.id
left join duplicate_keys dk
  on dk.set_id = s.id
left join unresolved_variants uv
  on uv.set_id = s.id
left join open_conflicts oc
  on oc.set_ref in (s.id::text, coalesce(s.set_code, ''), coalesce(s.provider_set_code, ''))
left join raw_record_quality rrq
  on rrq.set_ref in (s.id::text, coalesce(s.set_code, ''), coalesce(s.provider_set_code, ''))
left join expected_set_totals est
  on est.language_code = s.language_code
where s.deprecated_at is null
group by
  s.id,
  s.game_code,
  s.language_code,
  s.set_code,
  s.provider_set_code,
  s.native_name,
  s.english_display_name,
  s.total;

drop trigger if exists set_updated_at on ingest.import_checkpoints;
create trigger set_updated_at
  before update on ingest.import_checkpoints
  for each row execute function audit.set_updated_at();

drop trigger if exists set_updated_at on ingest.work_queue;
create trigger set_updated_at
  before update on ingest.work_queue
  for each row execute function audit.set_updated_at();

drop trigger if exists set_updated_at on ingest.provider_schedule_policies;
create trigger set_updated_at
  before update on ingest.provider_schedule_policies
  for each row execute function audit.set_updated_at();

drop trigger if exists set_updated_at on audit.ingest_merge_decisions;
create trigger set_updated_at
  before update on audit.ingest_merge_decisions
  for each row execute function audit.set_updated_at();

alter table ingest.import_checkpoints enable row level security;
alter table ingest.work_queue enable row level security;
alter table ingest.provider_schedule_policies enable row level security;
alter table ingest.source_health_reports enable row level security;
alter table audit.ingest_merge_decisions enable row level security;

create policy "ingest service role manages checkpoints" on ingest.import_checkpoints for all to service_role using (true) with check (true);
create policy "ingest service role manages work queue" on ingest.work_queue for all to service_role using (true) with check (true);
create policy "ingest service role manages schedule policies" on ingest.provider_schedule_policies for all to service_role using (true) with check (true);
create policy "ingest service role manages source health" on ingest.source_health_reports for all to service_role using (true) with check (true);
create policy "audit service role manages merge decisions" on audit.ingest_merge_decisions for all to service_role using (true) with check (true);

revoke all on all tables in schema ingest from anon, authenticated;
revoke all on all tables in schema audit from anon, authenticated;
revoke all on all sequences in schema ingest from anon, authenticated;
revoke all on all sequences in schema audit from anon, authenticated;

grant select, insert, update, delete on table
  ingest.import_checkpoints,
  ingest.work_queue,
  ingest.provider_schedule_policies,
  ingest.source_health_reports,
  audit.ingest_merge_decisions
  to service_role;

grant select on table
  ingest.source_health_current,
  ingest.dead_letter_queue,
  ingest.catalogue_quality_report
  to service_role;

grant usage, select on all sequences in schema ingest to service_role;
grant usage, select on all sequences in schema audit to service_role;

comment on column ingest.raw_source_records.provider_record_id is
  'Provider record identifier retained separately from Stackr canonical IDs. Mirrors external_id for Stage 2 compatibility.';

comment on column ingest.raw_source_records.http_metadata is
  'HTTP status, headers used for conditional requests, cache validators and endpoint metadata. Must not contain provider secrets.';

comment on table ingest.work_queue is
  'Durable table-backed queue for catalogue ingestion, asset processing, embedding generation, price refresh and conflict review. Supports retry, leasing and dead-letter states.';

comment on table ingest.provider_schedule_policies is
  'Provider refresh policy registry. A schedule may only be enabled when automated_refresh_allowed is true after terms review.';

comment on table ingest.source_health_reports is
  'Provider health snapshots, including forbidden/unavailable states instead of covert workarounds.';

comment on table audit.ingest_merge_decisions is
  'Append-only-ish audit log for validation, match, upsert and quarantine decisions made by the ingestion pipeline.';

comment on view ingest.catalogue_quality_report is
  'Private catalogue quality report covering expected/imported totals, missing assets, duplicate keys, unresolved variants, conflicts, stale records and legal-use status.';
