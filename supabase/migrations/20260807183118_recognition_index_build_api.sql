create or replace function api.list_recognition_reference_assets(
  p_after_asset_id uuid default null,
  p_limit integer default 500,
  p_stored_only boolean default true
)
returns table (
  reference_asset_id uuid,
  source_image_id text,
  variant_id uuid,
  language_code text,
  storage_bucket text,
  storage_key text,
  source_url text,
  source_image_checksum_sha256 text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    coalesce(a.asset_id, a.id::text),
    a.variant_id,
    coalesce(p.language_code, s.language_code),
    a.storage_bucket,
    a.storage_key,
    a.url,
    a.content_sha256
  from catalog.assets a
  join catalog.card_variants v on v.id = a.variant_id
  join catalog.card_printings p on p.id = v.printing_id
  join catalog.sets s on s.id = p.set_id
  where a.asset_type = 'card_image'
    and a.recognition_reference_eligible
    and a.asset_visibility = 'public_catalogue'
    and a.publicly_servable
    and a.rights_status = 'approved'
    and a.permission_status = 'approved'
    and a.retention_status = 'active'
    and a.deleted_at is null
    and a.deprecated_at is null
    and a.unavailable_reason is null
    and a.variant_id is not null
    and coalesce(p.language_code, s.language_code) is not null
    and (not p_stored_only or (a.storage_bucket is not null and a.storage_key is not null))
    and (p_after_asset_id is null or a.id > p_after_asset_id)
  order by a.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

create or replace function api.prepare_recognition_embedding_index(
  p_model_id text,
  p_index_version text,
  p_embedding_dimensions integer,
  p_manifest_sha256 text,
  p_expected_count integer,
  p_scope jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  index_id uuid;
  model_dimensions integer;
  model_license_status text;
  existing_status text;
  existing_manifest_sha256 text;
  existing_expected_count integer;
  existing_embedding_count integer;
begin
  if p_model_id <> 'dinov2_vits14'
    or p_embedding_dimensions <> 384
    or p_index_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
    or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_count < 1 then
    raise exception 'Invalid recognition index build parameters.' using errcode = '22023';
  end if;

  select embedding_dimensions, license_status
  into model_dimensions, model_license_status
  from ml.embedding_models
  where model_id = p_model_id
    and deprecated_at is null;

  if model_dimensions is distinct from p_embedding_dimensions
    or model_license_status <> 'production_allowed' then
    raise exception 'Recognition model is unavailable or not approved.' using errcode = 'P0001';
  end if;

  select
    id,
    status,
    completeness_report ->> 'manifestSha256',
    (completeness_report ->> 'expectedCount')::integer
  into
    index_id,
    existing_status,
    existing_manifest_sha256,
    existing_expected_count
  from ml.embedding_index_versions
  where model_id = p_model_id
    and index_version = p_index_version
    and language_code is null
  for update;

  if index_id is null then
    insert into ml.embedding_index_versions (
      model_id,
      index_version,
      language_code,
      embedding_dimensions,
      status,
      vector_table_name,
      hnsw_index_name,
      reference_embedding_count,
      missing_embedding_count,
      completeness_report
    ) values (
      p_model_id,
      p_index_version,
      null,
      p_embedding_dimensions,
      'building',
      'card_embeddings_dinov2_vits14_384',
      'card_embeddings_dinov2_vits14_384_embedding_hnsw_idx',
      0,
      p_expected_count,
      jsonb_build_object(
        'manifestSha256', p_manifest_sha256,
        'expectedCount', p_expected_count,
        'scope', coalesce(p_scope, '{}'::jsonb)
      )
    )
    returning id into index_id;
  else
    if existing_status not in ('building', 'failed', 'blocked') then
      raise exception 'A completed recognition index version cannot be rebuilt.' using errcode = 'P0001';
    end if;
    if existing_manifest_sha256 is distinct from p_manifest_sha256
      or existing_expected_count is distinct from p_expected_count then
      raise exception 'A recognition index version cannot change catalogue snapshot.' using errcode = 'P0001';
    end if;

    select count(*)::integer
    into existing_embedding_count
    from ml.card_embeddings_dinov2_vits14_384
    where index_version_id = index_id
      and deprecated_at is null;

    if existing_embedding_count > p_expected_count then
      raise exception 'Recognition index contains more rows than its catalogue snapshot.' using errcode = 'P0001';
    end if;

    update ml.embedding_index_versions
    set status = 'building',
        vector_table_name = 'card_embeddings_dinov2_vits14_384',
        hnsw_index_name = 'card_embeddings_dinov2_vits14_384_embedding_hnsw_idx',
        reference_embedding_count = existing_embedding_count,
        missing_embedding_count = p_expected_count - existing_embedding_count,
        completeness_report = jsonb_build_object(
          'manifestSha256', p_manifest_sha256,
          'expectedCount', p_expected_count,
          'scope', coalesce(p_scope, '{}'::jsonb)
        ),
        updated_at = now()
    where id = index_id;
  end if;

  return index_id;
end;
$$;

create or replace function api.upsert_recognition_embedding_batch(
  p_index_version_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_rows integer;
  affected_rows integer;
  index_model_id text;
  index_dimensions integer;
  index_preprocessing_sha256 text;
  current_embedding_count integer;
  expected_embedding_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Embedding rows must be a JSON array.' using errcode = '22023';
  end if;
  expected_rows := jsonb_array_length(p_rows);
  if expected_rows < 1 or expected_rows > 50 then
    raise exception 'Embedding batches must contain between 1 and 50 rows.' using errcode = '22023';
  end if;

  select
    model_id,
    embedding_dimensions,
    completeness_report #>> '{scope,preprocessingSha256}',
    (completeness_report ->> 'expectedCount')::integer
  into
    index_model_id,
    index_dimensions,
    index_preprocessing_sha256,
    expected_embedding_count
  from ml.embedding_index_versions
  where id = p_index_version_id
    and status = 'building'
    and model_id = 'dinov2_vits14'
    and vector_table_name = 'card_embeddings_dinov2_vits14_384';

  if index_model_id is null
    or index_dimensions <> 384
    or index_preprocessing_sha256 !~ '^[0-9a-f]{64}$'
    or expected_embedding_count < 1 then
    raise exception 'Recognition index is not open for embedding writes.' using errcode = 'P0001';
  end if;

  insert into ml.card_embeddings_dinov2_vits14_384 (
    model_id,
    index_version_id,
    variant_id,
    reference_asset_id,
    source_image_id,
    language_code,
    embedding,
    embedding_norm,
    preprocessing_checksum_sha256,
    source_image_checksum_sha256,
    deprecated_at
  )
  select
    index_model_id,
    p_index_version_id,
    (item ->> 'variantId')::uuid,
    (item ->> 'referenceAssetId')::uuid,
    item ->> 'sourceImageId',
    item ->> 'languageCode',
    (item -> 'embedding')::text::extensions.vector,
    (item ->> 'embeddingNorm')::numeric,
    item ->> 'preprocessingSha256',
    nullif(item ->> 'sourceImageSha256', ''),
    null
  from jsonb_array_elements(p_rows) item
  join catalog.assets a
    on a.id = (item ->> 'referenceAssetId')::uuid
   and a.variant_id = (item ->> 'variantId')::uuid
   and coalesce(a.asset_id, a.id::text) = item ->> 'sourceImageId'
  join catalog.card_variants v on v.id = a.variant_id
  join catalog.card_printings p on p.id = v.printing_id
  join catalog.sets s on s.id = p.set_id
  where a.asset_type = 'card_image'
    and a.recognition_reference_eligible
    and a.asset_visibility = 'public_catalogue'
    and a.publicly_servable
    and a.rights_status = 'approved'
    and a.permission_status = 'approved'
    and a.retention_status = 'active'
    and a.deleted_at is null
    and a.deprecated_at is null
    and a.unavailable_reason is null
    and coalesce(p.language_code, s.language_code) = item ->> 'languageCode'
    and jsonb_typeof(item -> 'embedding') = 'array'
    and jsonb_array_length(item -> 'embedding') = 384
    and (item ->> 'embeddingNorm')::numeric > 0.98
    and (item ->> 'embeddingNorm')::numeric < 1.02
    and item ->> 'preprocessingSha256' = index_preprocessing_sha256
    and item ->> 'sourceImageSha256' ~ '^[0-9a-f]{64}$'
    and a.content_sha256 = item ->> 'sourceImageSha256'
  on conflict (model_id, index_version_id, variant_id, source_image_id)
  do update set
    reference_asset_id = excluded.reference_asset_id,
    language_code = excluded.language_code,
    embedding = excluded.embedding,
    embedding_norm = excluded.embedding_norm,
    preprocessing_checksum_sha256 = excluded.preprocessing_checksum_sha256,
    source_image_checksum_sha256 = excluded.source_image_checksum_sha256,
    deprecated_at = null,
    updated_at = now();

  get diagnostics affected_rows = row_count;
  if affected_rows <> expected_rows then
    raise exception 'One or more embedding rows failed eligibility validation.' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into current_embedding_count
  from ml.card_embeddings_dinov2_vits14_384
  where index_version_id = p_index_version_id
    and deprecated_at is null;

  if current_embedding_count > expected_embedding_count then
    raise exception 'Recognition index exceeded its catalogue snapshot.' using errcode = 'P0001';
  end if;

  update ml.embedding_index_versions
  set reference_embedding_count = current_embedding_count,
      missing_embedding_count = expected_embedding_count - current_embedding_count,
      updated_at = now()
  where id = p_index_version_id;

  return affected_rows;
end;
$$;

create or replace function api.finalize_recognition_embedding_index(
  p_index_version_id uuid,
  p_index_checksum_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count integer;
  actual_count integer;
  invalid_count integer;
  manifest_sha256 text;
  preprocessing_sha256 text;
begin
  if p_index_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Index checksum is invalid.' using errcode = '22023';
  end if;

  select
    (completeness_report ->> 'expectedCount')::integer,
    completeness_report ->> 'manifestSha256',
    completeness_report #>> '{scope,preprocessingSha256}'
  into expected_count, manifest_sha256, preprocessing_sha256
  from ml.embedding_index_versions
  where id = p_index_version_id
    and status = 'building'
    and model_id = 'dinov2_vits14'
    and embedding_dimensions = 384;

  if expected_count is null then
    raise exception 'Recognition index is not ready to finalize.' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into actual_count
  from ml.card_embeddings_dinov2_vits14_384
  where index_version_id = p_index_version_id
    and deprecated_at is null;

  select count(*)::integer
  into invalid_count
  from ml.card_embeddings_dinov2_vits14_384 e
  left join catalog.assets a on a.id = e.reference_asset_id
  where e.index_version_id = p_index_version_id
    and e.deprecated_at is null
    and (
      a.id is null
      or not a.recognition_reference_eligible
      or a.variant_id is distinct from e.variant_id
      or a.asset_visibility <> 'public_catalogue'
      or not a.publicly_servable
      or a.rights_status <> 'approved'
      or a.permission_status <> 'approved'
      or a.retention_status <> 'active'
      or a.deleted_at is not null
      or a.deprecated_at is not null
      or a.unavailable_reason is not null
      or a.content_sha256 is distinct from e.source_image_checksum_sha256
      or e.preprocessing_checksum_sha256 is distinct from preprocessing_sha256
    );

  if actual_count <> expected_count or invalid_count <> 0 then
    raise exception 'Recognition index is incomplete or contains ineligible references.' using errcode = 'P0001';
  end if;

  update ml.embedding_index_versions
  set status = 'validated',
      reference_embedding_count = actual_count,
      missing_embedding_count = 0,
      checksum_sha256 = p_index_checksum_sha256,
      completeness_report = completeness_report || jsonb_build_object(
        'actualCount', actual_count,
        'missingCount', 0,
        'referenceEligibilityVerified', true
      ),
      health_report = jsonb_build_object(
        'status', 'validated',
        'manifestSha256', manifest_sha256,
        'referenceEmbeddingCount', actual_count,
        'invalidReferenceCount', invalid_count,
        'referenceEligibilityVerified', true
      ),
      built_at = now(),
      validated_at = now(),
      updated_at = now()
  where id = p_index_version_id;

  return jsonb_build_object(
    'indexVersionId', p_index_version_id,
    'status', 'validated',
    'referenceEmbeddingCount', actual_count,
    'manifestSha256', manifest_sha256,
    'indexChecksumSha256', p_index_checksum_sha256
  );
end;
$$;

revoke all on function api.list_recognition_reference_assets(uuid, integer, boolean)
  from public, anon, authenticated;
revoke all on function api.prepare_recognition_embedding_index(text, text, integer, text, integer, jsonb)
  from public, anon, authenticated;
revoke all on function api.upsert_recognition_embedding_batch(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function api.finalize_recognition_embedding_index(uuid, text)
  from public, anon, authenticated;

grant execute on function api.list_recognition_reference_assets(uuid, integer, boolean)
  to service_role;
grant execute on function api.prepare_recognition_embedding_index(text, text, integer, text, integer, jsonb)
  to service_role;
grant execute on function api.upsert_recognition_embedding_batch(uuid, jsonb)
  to service_role;
grant execute on function api.finalize_recognition_embedding_index(uuid, text)
  to service_role;
