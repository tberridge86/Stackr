create or replace function api.list_ebay_recognition_evidence_rows(
  p_after_retrieved_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 250
)
returns table (
  id uuid,
  external_id text,
  source_url text,
  retrieved_at timestamptz,
  raw_payload jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  approved_source_id uuid;
begin
  if p_limit < 1
    or p_limit > 500
    or ((p_after_retrieved_at is null) <> (p_after_id is null)) then
    raise exception 'Invalid eBay recognition evidence pagination parameters.' using errcode = '22023';
  end if;

  select s.id
  into approved_source_id
  from ingest.sources s
  where s.code = 'ebay_browse_recognition_evidence';

  if approved_source_id is null then
    raise exception 'The approved eBay recognition evidence source is unavailable.' using errcode = 'P0001';
  end if;

  return query
  select
    r.id,
    r.external_id,
    r.source_url,
    r.retrieved_at,
    r.raw_payload
  from ingest.raw_source_records r
  where r.source_id = approved_source_id
    and r.validation_status = 'valid'
    and r.deprecated_at is null
    and r.raw_payload #>> '{assessment,confidenceBand}' = 'high'
    and (
      p_after_retrieved_at is null
      or (r.retrieved_at, r.id) < (p_after_retrieved_at, p_after_id)
    )
  order by r.retrieved_at desc, r.id desc
  limit p_limit;
end;
$$;

alter function api.list_ebay_recognition_evidence_rows(timestamptz, uuid, integer)
  set statement_timeout = '30s';

revoke all on function api.list_ebay_recognition_evidence_rows(timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function api.list_ebay_recognition_evidence_rows(timestamptz, uuid, integer)
  to service_role;
