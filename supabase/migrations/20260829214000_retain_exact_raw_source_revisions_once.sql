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
begin
  if p_source_id is null
    or p_import_run_id is null
    or nullif(btrim(p_record_type), '') is null
    or nullif(btrim(p_external_id), '') is null
    or nullif(btrim(p_provider_record_id), '') is null
    or nullif(btrim(p_payload_hash), '') is null
    or p_raw_payload is null
  then
    raise exception using
      errcode = '22023',
      message = 'retain_raw_source_record requires complete source, run, identity, hash and payload inputs';
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
  order by raw_record.retrieved_at desc, raw_record.id
  limit 1
  for update;

  if current_row.id is not null and current_row.raw_payload = p_raw_payload then
    update ingest.raw_source_records raw_record
    set
      source_url = p_source_url,
      source_endpoint = p_source_endpoint,
      retrieved_at = p_retrieved_at,
      source_updated_at = p_source_updated_at,
      licence_status = p_licence_status,
      attribution_text = p_attribution_text,
      http_metadata = coalesce(p_http_metadata, '{}'::jsonb),
      validation_status = p_validation_status,
      validation_errors = coalesce(p_validation_errors, '[]'::jsonb)
    where raw_record.id = current_row.id;
    return pg_catalog.jsonb_build_object('id', current_row.id, 'changed', 'updated');
  end if;

  select raw_record.*
  into retained_row
  from ingest.raw_source_records raw_record
  where raw_record.source_id = p_source_id
    and raw_record.record_type = p_record_type
    and raw_record.external_id = p_external_id
    and raw_record.language_code is not distinct from p_language_code
    and raw_record.raw_payload = p_raw_payload
    and raw_record.deprecated_at is null
  order by raw_record.retrieved_at desc, raw_record.id
  limit 1
  for update;

  if retained_row.id is not null then
    update ingest.raw_source_records raw_record
    set
      source_url = p_source_url,
      source_endpoint = p_source_endpoint,
      retrieved_at = p_retrieved_at,
      source_updated_at = p_source_updated_at,
      licence_status = p_licence_status,
      attribution_text = p_attribution_text,
      http_metadata = coalesce(p_http_metadata, '{}'::jsonb),
      validation_status = p_validation_status,
      validation_errors = coalesce(p_validation_errors, '[]'::jsonb)
    where raw_record.id = retained_row.id;
    return pg_catalog.jsonb_build_object('id', retained_row.id, 'changed', 'reused');
  end if;

  if current_row.id is not null then
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
    where raw_record.id = current_row.id;
    return pg_catalog.jsonb_build_object('id', current_row.id, 'changed', 'updated');
  end if;

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

  return pg_catalog.jsonb_build_object('id', retained_row.id, 'changed', 'inserted');
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
) is 'Atomically retains changed provider payload revisions while reusing exact JSON revisions across import runs.';
