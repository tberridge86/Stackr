-- Atomic, replay-safe application boundary for hash-bound reviewed metadata.
-- The evidence bundle is verified by the server-side importer before this RPC;
-- this function independently constrains the database mutation surface and
-- commits canonical values and their audit rows in one PostgreSQL statement.

create table audit.reviewed_metadata_repair_batches (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  source_id uuid not null references ingest.sources(id) on delete restrict,
  import_run_id uuid not null references ingest.import_runs(id) on delete restrict,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  operation_count integer not null check (operation_count between 1 and 2100),
  field_count integer not null check (field_count between 1 and 2100),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now()
);

create index reviewed_metadata_repair_batches_import_run_idx
  on audit.reviewed_metadata_repair_batches(import_run_id, created_at desc);

create index reviewed_metadata_repair_batches_source_idx
  on audit.reviewed_metadata_repair_batches(source_id);

alter table audit.reviewed_metadata_repair_batches enable row level security;

drop policy if exists "audit service role reads reviewed metadata batches"
  on audit.reviewed_metadata_repair_batches;
create policy "audit service role reads reviewed metadata batches"
  on audit.reviewed_metadata_repair_batches
  for select
  to service_role
  using (true);

drop policy if exists "audit service role inserts reviewed metadata batches"
  on audit.reviewed_metadata_repair_batches;
create policy "audit service role inserts reviewed metadata batches"
  on audit.reviewed_metadata_repair_batches
  for insert
  to service_role
  with check (true);

revoke all on table audit.reviewed_metadata_repair_batches
  from public, anon, authenticated, service_role;
grant select, insert on table audit.reviewed_metadata_repair_batches
  to service_role;

create or replace function api.apply_reviewed_metadata_repair_batch(
  p_request_id text,
  p_source_id uuid,
  p_import_run_id uuid,
  p_attempt_started_at text,
  p_operations jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_request_id text := btrim(p_request_id);
  v_payload_sha256 text;
  v_existing_payload_sha256 text;
  v_existing_source_id uuid;
  v_existing_import_run_id uuid;
  v_existing_result jsonb;
  v_result jsonb;
  v_operation_count integer;
  v_field_count integer := 0;
  v_applied_count integer := 0;
  v_release_date_count integer := 0;
  v_series_id_count integer := 0;
  v_source_updated_at_count integer := 0;
  v_rarity_id_count integer := 0;
  v_supertype_count integer := 0;
  v_artist_count integer := 0;
  v_source_code text;
  v_operation jsonb;
  v_patch jsonb;
  v_evidence jsonb;
  v_evidence_item jsonb;
  v_evidence_keys text[];
  v_entity_table text;
  v_entity_type text;
  v_entity_id_text text;
  v_entity_id uuid;
  v_raw_record_id_text text;
  v_raw_record_id uuid;
  v_provider_record_id text;
  v_source_confidence numeric;
  v_patch_keys text[];
  v_guard_keys text[];
  v_operation_keys text[];
  v_field text;
  v_value text;
  v_updated_rows integer;
  v_target record;
  v_raw record;
  v_evidence_raw record;
  v_evidence_raw_record_id uuid;
  v_evidence_import_run_id uuid;
begin
  if v_request_id is null
    or v_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$' then
    raise exception 'Reviewed metadata request_id is invalid.' using errcode = '22023';
  end if;

  if p_source_id is null or p_import_run_id is null then
    raise exception 'Reviewed metadata source_id and import_run_id are required.' using errcode = '22023';
  end if;

  if p_attempt_started_at is null
    or p_attempt_started_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
    raise exception 'Reviewed metadata attempt_started_at is invalid.' using errcode = '22023';
  end if;
  perform p_attempt_started_at::timestamptz;

  if p_operations is null or jsonb_typeof(p_operations) <> 'array' then
    raise exception 'Reviewed metadata operations must be a JSON array.' using errcode = '22023';
  end if;

  v_operation_count := jsonb_array_length(p_operations);
  if v_operation_count < 1 or v_operation_count > 2100 then
    raise exception 'Reviewed metadata batches must contain between 1 and 2100 operations.' using errcode = '22023';
  end if;
  if octet_length(p_operations::text) > 16777216 then
    raise exception 'Reviewed metadata batch exceeds the 16 MiB payload limit.' using errcode = '22023';
  end if;

  v_payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_operations::text, 'UTF8')),
    'hex'
  );

  -- Serialize absent-row and existing-row idempotency checks for this request.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stackr:reviewed-metadata:' || v_request_id, 0)
  );

  select payload_sha256, source_id, import_run_id, result
  into v_existing_payload_sha256, v_existing_source_id, v_existing_import_run_id, v_existing_result
  from audit.reviewed_metadata_repair_batches
  where request_id = v_request_id;

  if found then
    if v_existing_payload_sha256 is distinct from v_payload_sha256
      or v_existing_source_id is distinct from p_source_id
      or v_existing_import_run_id is distinct from p_import_run_id then
      raise exception 'Reviewed metadata request_id was already used for a different payload.'
        using errcode = '23505';
    end if;
    update ingest.import_runs import_run
    set
      records_updated = greatest(
        import_run.records_updated,
        (v_existing_result ->> 'operationCount')::integer
      ),
      metadata = import_run.metadata || jsonb_build_object(
        'reviewedMetadataRepairBatch',
        jsonb_build_object(
          'requestId', v_request_id,
          'payloadSha256', v_payload_sha256,
          'operationCount', (v_existing_result ->> 'operationCount')::integer,
          'fieldCount', (v_existing_result ->> 'fieldCount')::integer,
          'status', 'applied'
        )
      ),
      updated_at = now()
    where import_run.id = p_import_run_id
      and import_run.source_id = p_source_id
      and import_run.request_id = v_request_id
      and import_run.status = 'running'
      and import_run.metadata #>> '{reviewedMetadataRepair,attemptStartedAt}' = p_attempt_started_at;
    return v_existing_result;
  end if;

  select source.code
  into v_source_code
  from ingest.import_runs import_run
  join ingest.sources source on source.id = import_run.source_id
  where import_run.id = p_import_run_id
    and import_run.source_id = p_source_id
    and import_run.import_type = 'repair'
    and import_run.status = 'running'
    and import_run.request_id = v_request_id
    and import_run.metadata #>> '{reviewedMetadataRepair,attemptStartedAt}' = p_attempt_started_at
    and source.active
    and source.deprecated_at is null
    and source.licence_status = 'approved'
  for update of import_run
  for share of source;

  if v_source_code is null then
    raise exception 'Reviewed metadata import run is not one active approved repair run for this request.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_operations) item
    group by item ->> 'entityTable', item ->> 'entityId'
    having count(*) > 1
  ) then
    raise exception 'Reviewed metadata batch contains duplicate canonical targets.' using errcode = '22023';
  end if;

  -- Parse and bound the complete mutation contract before acquiring row locks.
  for v_operation in
    select item
    from jsonb_array_elements(p_operations) item
  loop
    if jsonb_typeof(v_operation) <> 'object' then
      raise exception 'Each reviewed metadata operation must be an object.' using errcode = '22023';
    end if;

    select coalesce(array_agg(key order by key), '{}'::text[])
    into v_operation_keys
    from jsonb_object_keys(v_operation) key;
    if v_operation_keys <> array[
      'entityId', 'entityTable', 'evidence', 'nullGuards',
      'patch', 'providerRecordId', 'rawRecordId', 'sourceConfidence'
    ]::text[] then
      raise exception 'Reviewed metadata operation has unsupported or missing keys.' using errcode = '22023';
    end if;

    if jsonb_typeof(v_operation -> 'entityTable') <> 'string'
      or jsonb_typeof(v_operation -> 'entityId') <> 'string'
      or jsonb_typeof(v_operation -> 'rawRecordId') <> 'string'
      or jsonb_typeof(v_operation -> 'providerRecordId') <> 'string'
      or jsonb_typeof(v_operation -> 'sourceConfidence') <> 'number'
      or jsonb_typeof(v_operation -> 'patch') <> 'object'
      or jsonb_typeof(v_operation -> 'nullGuards') <> 'array'
      or jsonb_typeof(v_operation -> 'evidence') <> 'array' then
      raise exception 'Reviewed metadata operation has invalid value types.' using errcode = '22023';
    end if;

    v_entity_table := v_operation ->> 'entityTable';
    if v_entity_table not in ('sets', 'card_printings') then
      raise exception 'Reviewed metadata operation targets an unsupported table.' using errcode = '22023';
    end if;

    v_entity_id_text := v_operation ->> 'entityId';
    v_raw_record_id_text := v_operation ->> 'rawRecordId';
    if v_entity_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or v_raw_record_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Reviewed metadata operation contains an invalid UUID.' using errcode = '22023';
    end if;
    v_entity_id := v_entity_id_text::uuid;
    v_raw_record_id := v_raw_record_id_text::uuid;

    v_provider_record_id := btrim(v_operation ->> 'providerRecordId');
    if v_provider_record_id = '' or length(v_provider_record_id) > 512 then
      raise exception 'Reviewed metadata providerRecordId is invalid.' using errcode = '22023';
    end if;

    v_source_confidence := (v_operation ->> 'sourceConfidence')::numeric;
    if v_source_confidence < 0 or v_source_confidence > 1 then
      raise exception 'Reviewed metadata sourceConfidence must be between zero and one.' using errcode = '22023';
    end if;

    v_patch := v_operation -> 'patch';
    select coalesce(array_agg(key order by key), '{}'::text[])
    into v_patch_keys
    from jsonb_object_keys(v_patch) key;
    if cardinality(v_patch_keys) < 1 then
      raise exception 'Reviewed metadata patch cannot be empty.' using errcode = '22023';
    end if;

    if v_entity_table = 'sets' then
      if not (v_patch_keys <@ array['release_date', 'series_id']::text[]) then
        raise exception 'Reviewed set metadata patch contains an unsupported field.' using errcode = '22023';
      end if;
    else
      if not (v_patch_keys <@ array['artist', 'rarity_id', 'source_updated_at', 'supertype']::text[]) then
        raise exception 'Reviewed printing metadata patch contains an unsupported field.' using errcode = '22023';
      end if;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_operation -> 'nullGuards') guard
      where jsonb_typeof(guard) <> 'string'
    ) then
      raise exception 'Reviewed metadata nullGuards must contain only field names.' using errcode = '22023';
    end if;
    select coalesce(array_agg(value order by value), '{}'::text[])
    into v_guard_keys
    from jsonb_array_elements_text(v_operation -> 'nullGuards') value;
    if cardinality(v_guard_keys) <> cardinality(v_patch_keys)
      or v_guard_keys <> v_patch_keys then
      raise exception 'Reviewed metadata nullGuards must exactly match patch fields.' using errcode = '22023';
    end if;

    v_evidence := v_operation -> 'evidence';
    if jsonb_array_length(v_evidence) <> cardinality(v_patch_keys) then
      raise exception 'Reviewed metadata requires exactly one evidence item per patch field.' using errcode = '22023';
    end if;

    for v_evidence_item in
      select item from jsonb_array_elements(v_evidence) item
    loop
      if jsonb_typeof(v_evidence_item) <> 'object' then
        raise exception 'Each reviewed metadata evidence item must be an object.' using errcode = '22023';
      end if;
      select coalesce(array_agg(key order by key), '{}'::text[])
      into v_evidence_keys
      from jsonb_object_keys(v_evidence_item) key;
      if v_evidence_keys <> array[
        'acquisitionMode', 'attributionText', 'candidateEvidenceSha256', 'candidateManifestSha256',
        'field', 'importRunId', 'mappingEvidenceSha256', 'permissionEvidenceRef', 'providerRecordId',
        'providerRecordType', 'rawPayloadSha256', 'rawPayloadValueSha256', 'rawRecordId', 'retrievedAt',
        'reviewAuthorityId', 'reviewAuthorityRegistrySha256', 'reviewEvidenceSha256',
        'reviewSignatureSha256', 'reviewSignedAt', 'reviewedAt', 'reviewerId', 'rightsRegistrySha256',
        'sourceCode', 'sourceId', 'sourceUpdatedAt', 'sourceUrl', 'targetEntityId', 'targetEntityType',
        'targetLinkEvidenceSha256'
      ]::text[] then
        raise exception 'Reviewed metadata evidence has unsupported or missing keys.' using errcode = '22023';
      end if;
      if exists (
        select 1
        from unnest(array[
          'acquisitionMode', 'candidateEvidenceSha256', 'candidateManifestSha256', 'field', 'importRunId',
          'providerRecordId', 'providerRecordType', 'rawPayloadSha256', 'rawPayloadValueSha256',
          'rawRecordId', 'retrievedAt', 'reviewAuthorityId', 'reviewAuthorityRegistrySha256',
          'reviewEvidenceSha256', 'reviewSignatureSha256', 'reviewSignedAt', 'reviewedAt', 'reviewerId',
          'rightsRegistrySha256', 'sourceCode', 'sourceId', 'sourceUpdatedAt', 'sourceUrl',
          'targetEntityId', 'targetEntityType', 'targetLinkEvidenceSha256'
        ]::text[]) required_key
        where jsonb_typeof(v_evidence_item -> required_key) <> 'string'
      ) or jsonb_typeof(v_evidence_item -> 'mappingEvidenceSha256') not in ('null', 'string')
        or jsonb_typeof(v_evidence_item -> 'permissionEvidenceRef') not in ('null', 'string')
        or jsonb_typeof(v_evidence_item -> 'attributionText') not in ('null', 'string') then
        raise exception 'Reviewed metadata evidence has invalid value types.' using errcode = '22023';
      end if;
      if v_evidence_item ->> 'rawRecordId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or v_evidence_item ->> 'importRunId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or v_evidence_item ->> 'sourceId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or v_evidence_item ->> 'targetEntityId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Reviewed metadata evidence contains an invalid UUID.' using errcode = '22023';
      end if;
      if v_evidence_item ->> 'retrievedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
        or v_evidence_item ->> 'sourceUpdatedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
        or v_evidence_item ->> 'reviewedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
        or v_evidence_item ->> 'reviewSignedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
        raise exception 'Reviewed metadata evidence timestamps must be canonical UTC ISO-8601.' using errcode = '22023';
      end if;
      perform (v_evidence_item ->> 'retrievedAt')::timestamptz;
      perform (v_evidence_item ->> 'sourceUpdatedAt')::timestamptz;
      perform (v_evidence_item ->> 'reviewedAt')::timestamptz;
      perform (v_evidence_item ->> 'reviewSignedAt')::timestamptz;
    end loop;

    for v_field in select unnest(v_patch_keys)
    loop
      if jsonb_typeof(v_patch -> v_field) <> 'string' then
        raise exception 'Reviewed metadata patch values must be strings.' using errcode = '22023';
      end if;
      v_value := v_patch ->> v_field;
      if v_value = '' or length(v_value) > 512 or v_value ~ '[[:cntrl:]]' then
        raise exception 'Reviewed metadata patch value is empty, oversized, or contains control characters.' using errcode = '22023';
      end if;

      if v_field = 'release_date' then
        v_release_date_count := v_release_date_count + 1;
        if v_value !~ '^\d{4}-\d{2}-\d{2}$' or v_value::date::text <> v_value then
          raise exception 'Reviewed release_date must be a real YYYY-MM-DD date.' using errcode = '22023';
        end if;
      elsif v_field = 'series_id' then
        v_series_id_count := v_series_id_count + 1;
        if v_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'Reviewed series_id is not a UUID.' using errcode = '22023';
        end if;
      elsif v_field = 'source_updated_at' then
        v_source_updated_at_count := v_source_updated_at_count + 1;
        if v_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
          raise exception 'Reviewed source_updated_at must be canonical UTC ISO-8601.' using errcode = '22023';
        end if;
        perform v_value::timestamptz;
      elsif v_field = 'rarity_id' then
        v_rarity_id_count := v_rarity_id_count + 1;
        if v_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'Reviewed rarity_id is not a UUID.' using errcode = '22023';
        end if;
      elsif v_field = 'supertype' then
        v_supertype_count := v_supertype_count + 1;
      elsif v_field = 'artist' then
        v_artist_count := v_artist_count + 1;
      end if;

      if (
        select count(*)
        from jsonb_array_elements(v_evidence) evidence_item
        where evidence_item ->> 'field' = v_field
      ) <> 1 then
        raise exception 'Reviewed metadata evidence does not uniquely cover each patch field.' using errcode = '22023';
      end if;
    end loop;

    if exists (
      select 1
      from jsonb_array_elements(v_evidence) evidence_item
      where jsonb_typeof(evidence_item) <> 'object'
        or not ((evidence_item ->> 'field') = any(v_patch_keys))
    ) then
      raise exception 'Reviewed metadata evidence contains an unsupported field.' using errcode = '22023';
    end if;

    v_field_count := v_field_count + cardinality(v_patch_keys);
  end loop;

  if v_release_date_count > 50 or v_series_id_count > 50 then
    raise exception 'Reviewed set metadata exceeds the 50-row per-field limit.' using errcode = '22023';
  end if;
  if v_source_updated_at_count > 500
    or v_rarity_id_count > 500
    or v_supertype_count > 500
    or v_artist_count > 500 then
    raise exception 'Reviewed printing metadata exceeds the 500-row per-field limit.' using errcode = '22023';
  end if;

  -- Lock both current-run and reviewed historical raw rows in one global order.
  for v_raw_record_id in
    select raw_id
    from (
      select (operation ->> 'rawRecordId')::uuid as raw_id
      from jsonb_array_elements(p_operations) operation
      union
      select (evidence_item ->> 'rawRecordId')::uuid as raw_id
      from jsonb_array_elements(p_operations) operation
      cross join lateral jsonb_array_elements(operation -> 'evidence') evidence_item
    ) retained_rows
    order by raw_id
  loop
    perform 1
    from ingest.raw_source_records raw_record
    where raw_record.id = v_raw_record_id
    for share;
  end loop;

  -- Lock and re-verify retained provenance in deterministic UUID order.
  for v_operation in
    select item
    from jsonb_array_elements(p_operations) item
    order by (item ->> 'rawRecordId')::uuid, item ->> 'entityTable', (item ->> 'entityId')::uuid
  loop
    v_entity_table := v_operation ->> 'entityTable';
    v_entity_type := case when v_entity_table = 'sets' then 'set' else 'printing' end;
    v_entity_id := (v_operation ->> 'entityId')::uuid;
    v_raw_record_id := (v_operation ->> 'rawRecordId')::uuid;
    v_provider_record_id := v_operation ->> 'providerRecordId';
    v_evidence := v_operation -> 'evidence';

    select
      raw_record.id,
      raw_record.source_id,
      raw_record.import_run_id,
      raw_record.record_type,
      raw_record.provider_record_id,
      raw_record.source_url,
      raw_record.retrieved_at,
      raw_record.source_updated_at,
      raw_record.licence_status,
      raw_record.attribution_text,
      raw_record.payload_hash,
      raw_record.validation_status,
      raw_record.deprecated_at
    into v_raw
    from ingest.raw_source_records raw_record
    where raw_record.id = v_raw_record_id
    for share;

    if not found
      or v_raw.source_id is distinct from p_source_id
      or v_raw.import_run_id is distinct from p_import_run_id
      or v_raw.record_type is distinct from case when v_entity_table = 'sets' then 'set' else 'card' end
      or v_raw.provider_record_id is distinct from v_provider_record_id
      or v_raw.licence_status is distinct from 'approved'
      or v_raw.validation_status is distinct from 'valid'
      or v_raw.deprecated_at is not null then
      raise exception 'Reviewed metadata raw record is not exact, active, valid, and approved.' using errcode = 'P0001';
    end if;

    for v_evidence_item in select item from jsonb_array_elements(v_evidence) item
    loop
      if v_evidence_item ->> 'rawRecordId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or v_evidence_item ->> 'importRunId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Reviewed metadata evidence contains an invalid retained-record UUID.' using errcode = '22023';
      end if;
      v_evidence_raw_record_id := (v_evidence_item ->> 'rawRecordId')::uuid;
      v_evidence_import_run_id := (v_evidence_item ->> 'importRunId')::uuid;

      select
        evidence_raw.id,
        evidence_raw.source_id,
        evidence_raw.import_run_id,
        evidence_raw.record_type,
        evidence_raw.provider_record_id,
        evidence_raw.source_url,
        evidence_raw.retrieved_at,
        evidence_raw.source_updated_at,
        evidence_raw.licence_status,
        evidence_raw.attribution_text,
        evidence_raw.payload_hash,
        evidence_raw.validation_status,
        evidence_raw.deprecated_at
      into v_evidence_raw
      from ingest.raw_source_records evidence_raw
      where evidence_raw.id = v_evidence_raw_record_id
      for share;

      if not found
        or v_evidence_raw.source_id is distinct from p_source_id
        or v_evidence_raw.import_run_id is distinct from v_evidence_import_run_id
        or v_evidence_raw.record_type is distinct from v_raw.record_type
        or v_evidence_raw.provider_record_id is distinct from v_provider_record_id
        or v_evidence_raw.source_url is distinct from v_raw.source_url
        or v_evidence_raw.retrieved_at is distinct from (v_evidence_item ->> 'retrievedAt')::timestamptz
        or v_evidence_raw.source_updated_at is distinct from (v_evidence_item ->> 'sourceUpdatedAt')::timestamptz
        or v_evidence_raw.licence_status is distinct from 'approved'
        or v_evidence_raw.attribution_text is distinct from v_raw.attribution_text
        or v_evidence_raw.payload_hash is distinct from v_raw.payload_hash
        or v_evidence_raw.validation_status is distinct from 'valid'
        or v_evidence_raw.deprecated_at is not null then
        raise exception 'Reviewed metadata evidence does not identify one exact retained approved source row.' using errcode = 'P0001';
      end if;

      if v_evidence_item ->> 'targetEntityType' is distinct from v_entity_type
        or v_evidence_item ->> 'targetEntityId' is distinct from v_entity_id::text
        or v_evidence_item ->> 'sourceCode' is distinct from v_source_code
        or v_evidence_item ->> 'sourceId' is distinct from p_source_id::text
        or v_evidence_item ->> 'providerRecordType' is distinct from v_raw.record_type
        or v_evidence_item ->> 'providerRecordId' is distinct from v_provider_record_id
        or v_evidence_item ->> 'sourceUrl' is distinct from v_raw.source_url
        or (v_evidence_item ->> 'sourceUpdatedAt')::timestamptz is distinct from v_raw.source_updated_at
        or v_evidence_item ->> 'attributionText' is distinct from v_raw.attribution_text
        or v_evidence_item ->> 'rawPayloadValueSha256' is distinct from v_raw.payload_hash then
        raise exception 'Reviewed metadata audit evidence does not match retained database provenance.' using errcode = 'P0001';
      end if;

      if v_evidence_item ->> 'acquisitionMode' not in ('manual', 'automated')
        or v_evidence_item ->> 'sourceUrl' !~ '^https://'
        or coalesce(length(v_evidence_item ->> 'reviewerId'), 0) < 1
        or coalesce(length(v_evidence_item ->> 'reviewerId'), 0) > 256
        or coalesce(length(v_evidence_item ->> 'reviewAuthorityId'), 0) < 1
        or coalesce(length(v_evidence_item ->> 'reviewAuthorityId'), 0) > 256
        or (v_evidence_item ->> 'reviewedAt')::timestamptz < (v_evidence_item ->> 'retrievedAt')::timestamptz
        or (v_evidence_item ->> 'reviewedAt')::timestamptz > (v_evidence_item ->> 'reviewSignedAt')::timestamptz then
        raise exception 'Reviewed metadata audit evidence has invalid review or acquisition fields.' using errcode = '22023';
      end if;

      if not coalesce(v_evidence_item ->> 'candidateEvidenceSha256' ~ '^[0-9a-f]{64}$', false)
        or not coalesce(v_evidence_item ->> 'candidateManifestSha256' ~ '^[0-9a-f]{64}$', false)
        or not coalesce(v_evidence_item ->> 'rightsRegistrySha256' ~ '^[0-9a-f]{64}$', false)
        or not coalesce(v_evidence_item ->> 'rawPayloadSha256' ~ '^[0-9a-f]{64}$', false)
        or not coalesce(v_evidence_item ->> 'rawPayloadValueSha256' ~ '^[0-9a-f]{64}$', false)
        or not coalesce(v_evidence_item ->> 'targetLinkEvidenceSha256' ~ '^[0-9a-f]{64}$', false)
        or not coalesce(v_evidence_item ->> 'reviewEvidenceSha256' ~ '^[0-9a-f]{64}$', false)
        or not coalesce(v_evidence_item ->> 'reviewAuthorityRegistrySha256' ~ '^[0-9a-f]{64}$', false)
        or not coalesce(v_evidence_item ->> 'reviewSignatureSha256' ~ '^[0-9a-f]{64}$', false) then
        raise exception 'Reviewed metadata audit evidence contains an invalid SHA-256.' using errcode = '22023';
      end if;

      if (v_evidence_item ->> 'field') in ('series_id', 'rarity_id') then
        if not coalesce(v_evidence_item ->> 'mappingEvidenceSha256' ~ '^[0-9a-f]{64}$', false) then
          raise exception 'Reviewed canonical mapping evidence is missing or invalid.' using errcode = '22023';
        end if;
      elsif v_evidence_item ->> 'mappingEvidenceSha256' is not null then
        raise exception 'Reviewed non-mapping field supplied unexpected mapping evidence.' using errcode = '22023';
      end if;
    end loop;
  end loop;

  -- Freeze every referenced taxonomy row in a stable order before validating
  -- targets. This prevents an approved mapping from being deprecated or
  -- reclassified between its validation and the guarded canonical update.
  for v_entity_id in
    select distinct (operation -> 'patch' ->> 'series_id')::uuid
    from jsonb_array_elements(p_operations) operation
    where operation -> 'patch' ? 'series_id'
    order by 1
  loop
    perform 1
    from catalog.series mapped
    where mapped.id = v_entity_id
    for share;
    if not found then
      raise exception 'Reviewed series mapping is missing.' using errcode = 'P0001';
    end if;
  end loop;

  for v_entity_id in
    select distinct (operation -> 'patch' ->> 'rarity_id')::uuid
    from jsonb_array_elements(p_operations) operation
    where operation -> 'patch' ? 'rarity_id'
    order by 1
  loop
    perform 1
    from catalog.rarities mapped
    where mapped.id = v_entity_id
    for share;
    if not found then
      raise exception 'Reviewed rarity mapping is missing.' using errcode = 'P0001';
    end if;
  end loop;

  -- Lock all canonical targets in one stable order and prove null/deprecated guards.
  for v_operation in
    select item
    from jsonb_array_elements(p_operations) item
    order by case item ->> 'entityTable' when 'sets' then 0 else 1 end,
      (item ->> 'entityId')::uuid
  loop
    v_entity_table := v_operation ->> 'entityTable';
    v_entity_id := (v_operation ->> 'entityId')::uuid;
    v_patch := v_operation -> 'patch';

    if v_entity_table = 'sets' then
      select target.id, target.game_code, target.language_code,
        target.release_date, target.series_id, target.deprecated_at
      into v_target
      from catalog.sets target
      where target.id = v_entity_id
      for update;

      if not found or v_target.deprecated_at is not null then
        raise exception 'Reviewed metadata set target is missing or deprecated.' using errcode = 'P0001';
      end if;
      if (v_patch ? 'release_date' and v_target.release_date is not null)
        or (v_patch ? 'series_id' and v_target.series_id is not null) then
        raise exception 'Reviewed metadata refuses to overwrite non-null set metadata.' using errcode = 'P0001';
      end if;
      if v_patch ? 'series_id' and not exists (
        select 1
        from catalog.series mapped
        where mapped.id = (v_patch ->> 'series_id')::uuid
          and mapped.game_code = v_target.game_code
          and mapped.language_code = v_target.language_code
          and mapped.deprecated_at is null
      ) then
        raise exception 'Reviewed series mapping is not one active same-game same-language series.' using errcode = 'P0001';
      end if;
    else
      select target.id, target.game_code, target.set_id, target.language_code,
        target.source_updated_at, target.rarity_id, target.supertype,
        target.artist, target.deprecated_at
      into v_target
      from catalog.card_printings target
      where target.id = v_entity_id
      for update;

      if not found or v_target.deprecated_at is not null then
        raise exception 'Reviewed metadata printing target is missing or deprecated.' using errcode = 'P0001';
      end if;
      if (v_patch ? 'source_updated_at' and v_target.source_updated_at is not null)
        or (v_patch ? 'rarity_id' and v_target.rarity_id is not null)
        or (v_patch ? 'supertype' and v_target.supertype is not null)
        or (v_patch ? 'artist' and v_target.artist is not null) then
        raise exception 'Reviewed metadata refuses to overwrite non-null printing metadata.' using errcode = 'P0001';
      end if;
      if v_patch ? 'rarity_id' and not exists (
        select 1
        from catalog.rarities mapped
        where mapped.id = (v_patch ->> 'rarity_id')::uuid
          and mapped.game_code = v_target.game_code
          and mapped.deprecated_at is null
      ) then
        raise exception 'Reviewed rarity mapping is not one active same-game rarity.' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  -- Apply each statically whitelisted patch and its audit row in this transaction.
  for v_operation in
    select item
    from jsonb_array_elements(p_operations) item
    order by case item ->> 'entityTable' when 'sets' then 0 else 1 end,
      (item ->> 'entityId')::uuid
  loop
    v_entity_table := v_operation ->> 'entityTable';
    v_entity_id := (v_operation ->> 'entityId')::uuid;
    v_raw_record_id := (v_operation ->> 'rawRecordId')::uuid;
    v_provider_record_id := v_operation ->> 'providerRecordId';
    v_source_confidence := (v_operation ->> 'sourceConfidence')::numeric;
    v_patch := v_operation -> 'patch';
    v_evidence := v_operation -> 'evidence';

    if v_entity_table = 'sets' then
      update catalog.sets target
      set
        release_date = case when v_patch ? 'release_date'
          then (v_patch ->> 'release_date')::date else target.release_date end,
        series_id = case when v_patch ? 'series_id'
          then (v_patch ->> 'series_id')::uuid else target.series_id end
      where target.id = v_entity_id
        and target.deprecated_at is null
        and (not (v_patch ? 'release_date') or target.release_date is null)
        and (not (v_patch ? 'series_id') or target.series_id is null);
    else
      update catalog.card_printings target
      set
        source_updated_at = case when v_patch ? 'source_updated_at'
          then (v_patch ->> 'source_updated_at')::timestamptz else target.source_updated_at end,
        rarity_id = case when v_patch ? 'rarity_id'
          then (v_patch ->> 'rarity_id')::uuid else target.rarity_id end,
        supertype = case when v_patch ? 'supertype'
          then v_patch ->> 'supertype' else target.supertype end,
        artist = case when v_patch ? 'artist'
          then v_patch ->> 'artist' else target.artist end
      where target.id = v_entity_id
        and target.deprecated_at is null
        and (not (v_patch ? 'source_updated_at') or target.source_updated_at is null)
        and (not (v_patch ? 'rarity_id') or target.rarity_id is null)
        and (not (v_patch ? 'supertype') or target.supertype is null)
        and (not (v_patch ? 'artist') or target.artist is null);
    end if;

    get diagnostics v_updated_rows = row_count;
    if v_updated_rows <> 1 then
      raise exception 'Reviewed metadata guarded update did not affect exactly one target.' using errcode = 'P0001';
    end if;

    insert into audit.ingest_merge_decisions (
      source_id,
      import_run_id,
      raw_record_id,
      request_id,
      decision_type,
      entity_schema,
      entity_table,
      entity_id,
      confidence,
      reason,
      proposed_payload,
      existing_payload
    ) values (
      p_source_id,
      p_import_run_id,
      v_raw_record_id,
      v_request_id,
      'updated',
      'catalog',
      v_entity_table,
      v_entity_id,
      v_source_confidence,
      'hash_bound_reviewed_metadata_repair',
      jsonb_build_object(
        'providerRecordId', v_provider_record_id,
        'patch', v_patch,
        'reviewedMetadataEvidence', v_evidence
      ),
      '{}'::jsonb
    );

    v_applied_count := v_applied_count + 1;
  end loop;

  v_result := jsonb_build_object(
    'status', 'applied',
    'requestId', v_request_id,
    'sourceId', p_source_id,
    'importRunId', p_import_run_id,
    'payloadSha256', v_payload_sha256,
    'operationCount', v_operation_count,
    'fieldCount', v_field_count,
    'auditCount', v_applied_count
  );

  update ingest.import_runs import_run
  set
    records_updated = v_operation_count,
    metadata = import_run.metadata || jsonb_build_object(
      'reviewedMetadataRepairBatch',
      jsonb_build_object(
        'requestId', v_request_id,
        'payloadSha256', v_payload_sha256,
        'operationCount', v_operation_count,
        'fieldCount', v_field_count,
        'status', 'applied'
      )
    ),
    updated_at = now()
  where import_run.id = p_import_run_id
    and import_run.source_id = p_source_id
    and import_run.request_id = v_request_id
    and import_run.status = 'running';

  get diagnostics v_updated_rows = row_count;
  if v_updated_rows <> 1 then
    raise exception 'Reviewed metadata import run changed before batch completion.' using errcode = 'P0001';
  end if;

  insert into audit.reviewed_metadata_repair_batches (
    request_id,
    source_id,
    import_run_id,
    payload_sha256,
    operation_count,
    field_count,
    result
  ) values (
    v_request_id,
    p_source_id,
    p_import_run_id,
    v_payload_sha256,
    v_operation_count,
    v_field_count,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function api.apply_reviewed_metadata_repair_batch(text, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function api.apply_reviewed_metadata_repair_batch(text, uuid, uuid, text, jsonb)
  to service_role;

comment on table audit.reviewed_metadata_repair_batches is
  'Immutable request-id ledger for atomic reviewed catalogue metadata repair batches. Identical replays return the recorded result; request-id collisions fail closed.';

comment on function api.apply_reviewed_metadata_repair_batch(text, uuid, uuid, text, jsonb) is
  'Service-role-only, SECURITY INVOKER RPC that applies bounded reviewed set/printing metadata patches and their audit rows atomically. It never accepts arbitrary table or column names.';
