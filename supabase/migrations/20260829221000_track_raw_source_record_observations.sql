-- Preserve immutable raw revision provenance while recording every import run
-- that observes the revision. The bridge deliberately excludes raw_payload so
-- exact retries remain materially smaller than another raw revision row.
create table if not exists ingest.raw_source_record_observations (
  import_run_id uuid not null references ingest.import_runs(id) on delete cascade,
  raw_record_id uuid not null references ingest.raw_source_records(id) on delete restrict,
  retrieved_at timestamptz not null,
  source_updated_at timestamptz,
  source_url text,
  source_endpoint text,
  licence_status text not null
    check (licence_status in ('approved', 'under_review', 'restricted', 'denied', 'unknown')),
  attribution_text text,
  payload_hash text not null check (btrim(payload_hash) <> ''),
  http_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(http_metadata) = 'object'),
  validation_status text not null
    check (validation_status in ('pending', 'valid', 'invalid', 'quarantined')),
  validation_errors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(validation_errors) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (import_run_id, raw_record_id)
);

create index if not exists raw_source_record_observations_revision_idx
  on ingest.raw_source_record_observations(raw_record_id, retrieved_at desc);

drop trigger if exists set_updated_at on ingest.raw_source_record_observations;
create trigger set_updated_at
  before update on ingest.raw_source_record_observations
  for each row execute function audit.set_updated_at();

alter table ingest.raw_source_record_observations enable row level security;

drop policy if exists "ingest service role manages raw record observations"
  on ingest.raw_source_record_observations;
create policy "ingest service role manages raw record observations"
  on ingest.raw_source_record_observations
  for all to service_role
  using (true)
  with check (true);

revoke all on table ingest.raw_source_record_observations
  from public, anon, authenticated;
grant select, insert, update, delete on table ingest.raw_source_record_observations
  to service_role;

comment on table ingest.raw_source_record_observations is
  'Compact import-run-to-raw-revision provenance. Retry metadata is refreshed without duplicating immutable raw JSON payloads.';

comment on column ingest.raw_source_record_observations.import_run_id is
  'Import run that observed the retained raw revision; it need not be the run that first captured the revision.';

comment on column ingest.raw_source_record_observations.raw_record_id is
  'Exact active raw revision observed by this import run.';

create or replace function ingest.retain_raw_source_record(
  p_source_id uuid,
  p_import_run_id uuid,
  p_record_type text,
  p_external_id text,
  p_provider_record_id text,
  p_language_code text,
  p_source_url text,
  p_source_endpoint text,
  p_retrieved_at timestamptz,
  p_source_updated_at timestamptz,
  p_licence_status text,
  p_attribution_text text,
  p_payload_hash text,
  p_raw_payload jsonb,
  p_http_metadata jsonb,
  p_validation_status text,
  p_validation_errors jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_row ingest.raw_source_records%rowtype;
  retained_row ingest.raw_source_records%rowtype;
  retention_action text;
begin
  if p_source_id is null
    or p_import_run_id is null
    or nullif(pg_catalog.btrim(p_record_type), '') is null
    or nullif(pg_catalog.btrim(p_external_id), '') is null
    or nullif(pg_catalog.btrim(p_provider_record_id), '') is null
    or nullif(pg_catalog.btrim(p_payload_hash), '') is null
    or p_retrieved_at is null
    or p_raw_payload is null
  then
    raise exception using
      errcode = '22023',
      message = 'retain_raw_source_record requires complete source, run, identity, hash, retrieval time and payload inputs';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array(
      p_source_id,
      p_record_type,
      p_external_id,
      coalesce(p_language_code, '')
    )::text,
    0
  ));

  select raw_record.*
  into current_row
  from ingest.raw_source_records raw_record
  where raw_record.source_id = p_source_id
    and raw_record.import_run_id = p_import_run_id
    and raw_record.record_type = p_record_type
    and raw_record.external_id = p_external_id
    and raw_record.language_code is not distinct from p_language_code
  order by raw_record.created_at, raw_record.id
  limit 1
  for update;

  if current_row.id is not null and current_row.deprecated_at is not null then
    raise exception using
      errcode = '55000',
      message = 'retain_raw_source_record_same_run_identity_deprecated';
  end if;

  if current_row.id is not null
    and current_row.provider_record_id = p_provider_record_id
    and current_row.raw_payload = p_raw_payload
  then
    -- An exact retry only refreshes its compact observation. The first-capture
    -- revision and all of its provenance fields remain byte-for-byte stable.
    retained_row := current_row;
    retention_action := 'updated';
  else
    select raw_record.*
    into retained_row
    from ingest.raw_source_records raw_record
    where raw_record.source_id = p_source_id
      and raw_record.record_type = p_record_type
      and raw_record.external_id = p_external_id
      and raw_record.provider_record_id = p_provider_record_id
      and raw_record.language_code is not distinct from p_language_code
      and raw_record.raw_payload = p_raw_payload
      and raw_record.deprecated_at is null
    order by raw_record.created_at, raw_record.id
    limit 1
    for key share;

    if retained_row.id is not null then
      -- Reuse is immutable: this run is represented by the observation below,
      -- never by rewriting the retained revision's original import provenance.
      retention_action := 'reused';
    elsif current_row.id is not null then
      -- A changed retry may mutate only its own active run-scoped revision.
      update ingest.raw_source_records raw_record
      set
        provider_record_id = p_provider_record_id,
        source_url = p_source_url,
        source_endpoint = p_source_endpoint,
        retrieved_at = p_retrieved_at,
        source_updated_at = p_source_updated_at,
        licence_status = p_licence_status,
        attribution_text = p_attribution_text,
        payload_hash = p_payload_hash,
        raw_payload = p_raw_payload,
        http_metadata = coalesce(p_http_metadata, '{}'::jsonb),
        validation_status = p_validation_status,
        validation_errors = coalesce(p_validation_errors, '[]'::jsonb)
      where raw_record.id = current_row.id
        and raw_record.import_run_id = p_import_run_id
        and raw_record.deprecated_at is null
      returning raw_record.* into retained_row;

      if retained_row.id is null then
        raise exception using
          errcode = '55000',
          message = 'retain_raw_source_record_same_run_identity_not_active';
      end if;
      retention_action := 'updated';
    else
      insert into ingest.raw_source_records (
        source_id,
        import_run_id,
        record_type,
        external_id,
        provider_record_id,
        language_code,
        source_url,
        source_endpoint,
        retrieved_at,
        source_updated_at,
        licence_status,
        attribution_text,
        payload_hash,
        raw_payload,
        http_metadata,
        validation_status,
        validation_errors
      ) values (
        p_source_id,
        p_import_run_id,
        p_record_type,
        p_external_id,
        p_provider_record_id,
        p_language_code,
        p_source_url,
        p_source_endpoint,
        p_retrieved_at,
        p_source_updated_at,
        p_licence_status,
        p_attribution_text,
        p_payload_hash,
        p_raw_payload,
        coalesce(p_http_metadata, '{}'::jsonb),
        p_validation_status,
        coalesce(p_validation_errors, '[]'::jsonb)
      )
      returning * into retained_row;
      retention_action := 'inserted';
    end if;
  end if;

  insert into ingest.raw_source_record_observations (
    import_run_id,
    raw_record_id,
    retrieved_at,
    source_updated_at,
    source_url,
    source_endpoint,
    licence_status,
    attribution_text,
    payload_hash,
    http_metadata,
    validation_status,
    validation_errors
  ) values (
    p_import_run_id,
    retained_row.id,
    p_retrieved_at,
    p_source_updated_at,
    p_source_url,
    p_source_endpoint,
    p_licence_status,
    p_attribution_text,
    p_payload_hash,
    coalesce(p_http_metadata, '{}'::jsonb),
    p_validation_status,
    coalesce(p_validation_errors, '[]'::jsonb)
  )
  on conflict (import_run_id, raw_record_id) do update set
    retrieved_at = excluded.retrieved_at,
    source_updated_at = excluded.source_updated_at,
    source_url = excluded.source_url,
    source_endpoint = excluded.source_endpoint,
    licence_status = excluded.licence_status,
    attribution_text = excluded.attribution_text,
    payload_hash = excluded.payload_hash,
    http_metadata = excluded.http_metadata,
    validation_status = excluded.validation_status,
    validation_errors = excluded.validation_errors;

  return pg_catalog.jsonb_build_object(
    'id', retained_row.id,
    'changed', retention_action
  );
end;
$$;

revoke all on function ingest.retain_raw_source_record(
  uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  text, text, text, jsonb, jsonb, text, jsonb
) from public, anon, authenticated;

grant execute on function ingest.retain_raw_source_record(
  uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  text, text, text, jsonb, jsonb, text, jsonb
) to service_role;

comment on function ingest.retain_raw_source_record(
  uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  text, text, text, jsonb, jsonb, text, jsonb
) is 'Atomically retains changed provider payload revisions, reuses exact active revisions without mutation, and records run-level observations.';
