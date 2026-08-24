-- Reconcile the controlled recognition-index functions that were proven in
-- staging. This migration is deliberately additive/replacing only: it does
-- not create, activate, or modify any embedding index on its own.

create or replace function ml.recognition_reference_is_publicly_eligible(
  p_asset_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from catalog.assets a
    join catalog.card_variants v
      on v.id = a.variant_id
     and v.deprecated_at is null
     and v.discontinued_at is null
    join catalog.card_printings p
      on p.id = v.printing_id
     and p.deprecated_at is null
     and p.discontinued_at is null
    join catalog.sets s
      on s.id = p.set_id
     and s.deprecated_at is null
    where a.id = p_asset_id
      and a.asset_type = 'card_image'
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
      and a.storage_provider = 'supabase_storage'
      and a.storage_bucket = 'stackr-catalogue-public'
      and a.storage_key is not null
      and a.content_sha256 ~ '^[0-9a-f]{64}$'
      and v.language_code in ('en', 'ja', 'zh-cn', 'zh-tw')
      and exists (
        select 1
        from catalog.catalogue_version_variants cvv
        join catalog.catalogue_versions cv
          on cv.id = cvv.catalogue_version_id
         and cv.status = 'published'
         and cv.deprecated_at is null
        where cvv.variant_id = v.id
          and cvv.language_code = v.language_code
      )
  );
$$;

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
    v.language_code,
    a.storage_bucket,
    a.storage_key,
    a.url,
    a.content_sha256
  from catalog.assets a
  join catalog.card_variants v on v.id = a.variant_id
  where ml.recognition_reference_is_publicly_eligible(a.id)
    and (not p_stored_only or (a.storage_bucket is not null and a.storage_key is not null))
    and (p_after_asset_id is null or a.id > p_after_asset_id)
  order by a.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

create or replace function api.upsert_recognition_embedding_batch(
  p_index_version_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
set statement_timeout = '60s'
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
    model_id, index_version_id, variant_id, reference_asset_id, source_image_id,
    language_code, embedding, embedding_norm, preprocessing_checksum_sha256,
    source_image_checksum_sha256, deprecated_at
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
  where ml.recognition_reference_is_publicly_eligible(a.id)
    and v.language_code = item ->> 'languageCode'
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

create or replace function api.copy_recognition_embedding_public_subset_batch(
  p_source_index_version_id uuid,
  p_target_index_version_id uuid,
  p_after_variant_id uuid default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  source_model_id text;
  source_model_sha256 text;
  source_preprocessing_sha256 text;
  target_expected_count integer;
  target_model_sha256 text;
  target_preprocessing_sha256 text;
  batch_count integer;
  inserted_count integer;
  current_count integer;
  last_variant_id uuid;
  effective_after_variant_id uuid;
begin
  if p_source_index_version_id is null
    or p_target_index_version_id is null
    or p_limit < 1
    or p_limit > 2000 then
    raise exception 'Invalid recognition copy batch parameters.' using errcode = '22023';
  end if;

  select
    model_id,
    completeness_report #>> '{scope,modelSha256}',
    completeness_report #>> '{scope,preprocessingSha256}'
  into source_model_id, source_model_sha256, source_preprocessing_sha256
  from ml.embedding_index_versions
  where id = p_source_index_version_id
    and status = 'validated'
    and model_id = 'dinov2_vits14'
    and embedding_dimensions = 384;

  select
    (completeness_report ->> 'expectedCount')::integer,
    completeness_report #>> '{scope,modelSha256}',
    completeness_report #>> '{scope,preprocessingSha256}'
  into target_expected_count, target_model_sha256, target_preprocessing_sha256
  from ml.embedding_index_versions
  where id = p_target_index_version_id
    and status = 'building'
    and model_id = source_model_id
    and embedding_dimensions = 384;

  if source_model_id is null
    or source_model_sha256 !~ '^[0-9a-f]{64}$'
    or source_preprocessing_sha256 !~ '^[0-9a-f]{64}$'
    or target_expected_count < 1
    or target_model_sha256 is distinct from source_model_sha256
    or target_preprocessing_sha256 is distinct from source_preprocessing_sha256 then
    raise exception 'Recognition indexes are not compatible for controlled reuse.' using errcode = 'P0001';
  end if;

  effective_after_variant_id := p_after_variant_id;
  if effective_after_variant_id is null then
    select variant_id
    into effective_after_variant_id
    from ml.card_embeddings_dinov2_vits14_384
    where index_version_id = p_target_index_version_id
      and deprecated_at is null
    order by variant_id desc
    limit 1;
  end if;

  with batch as materialized (
    select e.*
    from ml.card_embeddings_dinov2_vits14_384 e
    where e.model_id = source_model_id
      and e.index_version_id = p_source_index_version_id
      and e.deprecated_at is null
      and ml.recognition_reference_is_publicly_eligible(e.reference_asset_id)
      and (effective_after_variant_id is null or e.variant_id > effective_after_variant_id)
    order by e.variant_id, e.reference_asset_id
    limit p_limit
  ), inserted as (
    insert into ml.card_embeddings_dinov2_vits14_384 (
      model_id, index_version_id, variant_id, reference_asset_id, source_image_id,
      language_code, embedding, embedding_norm, preprocessing_checksum_sha256,
      source_image_checksum_sha256, deprecated_at
    )
    select
      model_id, p_target_index_version_id, variant_id, reference_asset_id, source_image_id,
      language_code, embedding, embedding_norm, preprocessing_checksum_sha256,
      source_image_checksum_sha256, null
    from batch
    order by variant_id, reference_asset_id
    on conflict (model_id, index_version_id, variant_id, source_image_id) do nothing
    returning variant_id
  )
  select
    (select count(*) from batch)::integer,
    (select count(*) from inserted)::integer,
    (select variant_id from batch order by variant_id desc, reference_asset_id desc limit 1)
  into batch_count, inserted_count, last_variant_id;

  select count(*)::integer
  into current_count
  from ml.card_embeddings_dinov2_vits14_384
  where index_version_id = p_target_index_version_id
    and deprecated_at is null;

  if current_count > target_expected_count then
    raise exception 'Recognition index exceeded its frozen manifest.' using errcode = 'P0001';
  end if;

  update ml.embedding_index_versions
  set reference_embedding_count = current_count,
      missing_embedding_count = target_expected_count - current_count,
      updated_at = now()
  where id = p_target_index_version_id
    and status = 'building';

  return jsonb_build_object(
    'batchCount', batch_count,
    'insertedCount', inserted_count,
    'currentCount', current_count,
    'missingCount', target_expected_count - current_count,
    'lastVariantId', last_variant_id,
    'complete', current_count = target_expected_count
  );
end;
$$;

create or replace function api.verify_recognition_embedding_manifest(
  p_index_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '2min'
as $$
declare
  expected_manifest_sha256 text;
  observed_manifest_sha256 text;
  expected_count integer;
  actual_count integer;
begin
  select
    completeness_report ->> 'manifestSha256',
    (completeness_report ->> 'expectedCount')::integer
  into expected_manifest_sha256, expected_count
  from ml.embedding_index_versions
  where id = p_index_version_id
    and status = 'building'
    and model_id = 'dinov2_vits14'
    and embedding_dimensions = 384;

  if expected_manifest_sha256 !~ '^[0-9a-f]{64}$' or expected_count < 1 then
    raise exception 'Recognition index manifest is unavailable.' using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          pg_catalog.string_agg(
            e.variant_id::text || pg_catalog.chr(31)
              || e.reference_asset_id::text || pg_catalog.chr(31)
              || e.source_image_id || pg_catalog.chr(31)
              || e.language_code || pg_catalog.chr(31)
              || e.source_image_checksum_sha256,
            pg_catalog.chr(30) order by e.variant_id, e.reference_asset_id
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  into actual_count, observed_manifest_sha256
  from ml.card_embeddings_dinov2_vits14_384 e
  where e.index_version_id = p_index_version_id
    and e.deprecated_at is null;

  if actual_count <> expected_count
    or observed_manifest_sha256 is distinct from expected_manifest_sha256 then
    raise exception 'Recognition index rows do not match the frozen manifest.' using errcode = 'P0001';
  end if;

  update ml.embedding_index_versions
  set completeness_report = jsonb_set(
        jsonb_set(completeness_report, '{manifestVerified}', 'true'::jsonb, true),
        '{manifestVerifiedAt}', to_jsonb(now()), true
      ),
      updated_at = now()
  where id = p_index_version_id
    and status = 'building';

  return jsonb_build_object(
    'indexVersionId', p_index_version_id,
    'referenceEmbeddingCount', actual_count,
    'manifestSha256', observed_manifest_sha256,
    'manifestVerified', true
  );
end;
$$;

create or replace function api.finalize_published_recognition_embedding_index(
  p_index_version_id uuid,
  p_source_index_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '2min'
as $$
declare
  index_version_name text;
  expected_count integer;
  actual_count integer;
  distinct_variant_count integer;
  invalid_count integer;
  reused_embedding_count integer;
  newly_generated_embedding_count integer;
  manifest_sha256 text;
  manifest_verified boolean;
  source_checksum_sha256 text;
  source_model_sha256 text;
  source_preprocessing_sha256 text;
  target_model_sha256 text;
  target_preprocessing_sha256 text;
  derived_index_checksum_sha256 text;
  language_counts jsonb;
begin
  select
    index_version,
    (completeness_report ->> 'expectedCount')::integer,
    completeness_report ->> 'manifestSha256',
    coalesce((completeness_report ->> 'manifestVerified')::boolean, false),
    completeness_report #>> '{scope,modelSha256}',
    completeness_report #>> '{scope,preprocessingSha256}'
  into
    index_version_name,
    expected_count,
    manifest_sha256,
    manifest_verified,
    target_model_sha256,
    target_preprocessing_sha256
  from ml.embedding_index_versions
  where id = p_index_version_id
    and status = 'building'
    and model_id = 'dinov2_vits14'
    and embedding_dimensions = 384;

  select
    checksum_sha256,
    completeness_report #>> '{scope,modelSha256}',
    completeness_report #>> '{scope,preprocessingSha256}'
  into source_checksum_sha256, source_model_sha256, source_preprocessing_sha256
  from ml.embedding_index_versions
  where id = p_source_index_version_id
    and status = 'validated'
    and model_id = 'dinov2_vits14'
    and embedding_dimensions = 384;

  if index_version_name is null
    or expected_count < 1
    or manifest_sha256 !~ '^[0-9a-f]{64}$'
    or not manifest_verified
    or source_checksum_sha256 !~ '^[0-9a-f]{64}$'
    or source_model_sha256 !~ '^[0-9a-f]{64}$'
    or source_preprocessing_sha256 !~ '^[0-9a-f]{64}$'
    or target_model_sha256 is distinct from source_model_sha256
    or target_preprocessing_sha256 is distinct from source_preprocessing_sha256 then
    raise exception 'Recognition index is not ready for published-subset finalisation.' using errcode = 'P0001';
  end if;

  select count(*)::integer, count(distinct variant_id)::integer
  into actual_count, distinct_variant_count
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
      or not ml.recognition_reference_is_publicly_eligible(e.reference_asset_id)
      or e.model_id <> 'dinov2_vits14'
      or a.variant_id is distinct from e.variant_id
      or a.content_sha256 is distinct from e.source_image_checksum_sha256
      or e.preprocessing_checksum_sha256 is distinct from target_preprocessing_sha256
      or extensions.vector_dims(e.embedding) <> 384
      or e.embedding::text ~* 'nan|infinity'
      or e.embedding_norm < 0.999
      or e.embedding_norm > 1.001
    );

  select count(*)::integer
  into reused_embedding_count
  from ml.card_embeddings_dinov2_vits14_384 target
  where target.index_version_id = p_index_version_id
    and target.deprecated_at is null
    and exists (
      select 1
      from ml.card_embeddings_dinov2_vits14_384 source
      where source.index_version_id = p_source_index_version_id
        and source.deprecated_at is null
        and source.model_id = target.model_id
        and source.variant_id = target.variant_id
        and source.reference_asset_id = target.reference_asset_id
        and source.source_image_id = target.source_image_id
        and source.source_image_checksum_sha256 = target.source_image_checksum_sha256
        and source.preprocessing_checksum_sha256 = target.preprocessing_checksum_sha256
        and source.embedding = target.embedding
    );
  newly_generated_embedding_count := actual_count - reused_embedding_count;

  if actual_count <> expected_count
    or distinct_variant_count <> expected_count
    or invalid_count <> 0
    or newly_generated_embedding_count < 0 then
    raise exception 'Recognition index is incomplete or contains invalid published references.' using errcode = 'P0001';
  end if;

  select jsonb_object_agg(language_code, language_count order by language_code)
  into language_counts
  from (
    select language_code, count(*) as language_count
    from ml.card_embeddings_dinov2_vits14_384
    where index_version_id = p_index_version_id
      and deprecated_at is null
    group by language_code
  ) counts;

  derived_index_checksum_sha256 := encode(
    extensions.digest(
      pg_catalog.convert_to(
        'stackr-recognition-public-subset-v1' || pg_catalog.chr(31)
          || source_checksum_sha256 || pg_catalog.chr(31)
          || target_model_sha256 || pg_catalog.chr(31)
          || target_preprocessing_sha256 || pg_catalog.chr(31)
          || manifest_sha256 || pg_catalog.chr(31)
          || index_version_name || pg_catalog.chr(31)
          || expected_count::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  update ml.embedding_index_versions
  set status = 'validated',
      reference_embedding_count = actual_count,
      missing_embedding_count = 0,
      checksum_sha256 = derived_index_checksum_sha256,
      completeness_report = completeness_report || jsonb_build_object(
        'actualCount', actual_count,
        'missingCount', 0,
        'languageCounts', language_counts,
        'referenceEligibilityVerified', true,
        'publishedCatalogueMembershipVerified', true,
        'reusedEmbeddingCount', reused_embedding_count,
        'newlyGeneratedEmbeddingCount', newly_generated_embedding_count
      ),
      health_report = jsonb_build_object(
        'status', 'validated',
        'manifestSha256', manifest_sha256,
        'referenceEmbeddingCount', actual_count,
        'invalidReferenceCount', invalid_count,
        'duplicateVariantCount', actual_count - distinct_variant_count,
        'referenceEligibilityVerified', true,
        'publishedCatalogueMembershipVerified', true,
        'sourceIndexVersionId', p_source_index_version_id,
        'reusedEmbeddingCount', reused_embedding_count,
        'newlyGeneratedEmbeddingCount', newly_generated_embedding_count,
        'activationApproved', false
      ),
      built_at = now(),
      validated_at = now(),
      updated_at = now()
  where id = p_index_version_id
    and status = 'building';

  return jsonb_build_object(
    'indexVersionId', p_index_version_id,
    'indexVersion', index_version_name,
    'status', 'validated',
    'activated', false,
    'referenceEmbeddingCount', actual_count,
    'missingEmbeddingCount', 0,
    'invalidReferenceCount', invalid_count,
    'duplicateVariantCount', actual_count - distinct_variant_count,
    'languageCounts', language_counts,
    'manifestSha256', manifest_sha256,
    'indexChecksumSha256', derived_index_checksum_sha256,
    'reusedEmbeddingCount', reused_embedding_count,
    'newlyGeneratedEmbeddingCount', newly_generated_embedding_count
  );
end;
$$;

revoke all on function ml.recognition_reference_is_publicly_eligible(uuid)
  from public, anon, authenticated, service_role;
revoke all on function api.list_recognition_reference_assets(uuid, integer, boolean)
  from public, anon, authenticated;
revoke all on function api.upsert_recognition_embedding_batch(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function api.copy_recognition_embedding_public_subset_batch(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function api.verify_recognition_embedding_manifest(uuid)
  from public, anon, authenticated;
revoke all on function api.finalize_published_recognition_embedding_index(uuid, uuid)
  from public, anon, authenticated;

grant execute on function api.list_recognition_reference_assets(uuid, integer, boolean)
  to service_role;
grant execute on function api.upsert_recognition_embedding_batch(uuid, jsonb)
  to service_role;
grant execute on function api.copy_recognition_embedding_public_subset_batch(uuid, uuid, uuid, integer)
  to service_role;
grant execute on function api.verify_recognition_embedding_manifest(uuid)
  to service_role;
grant execute on function api.finalize_published_recognition_embedding_index(uuid, uuid)
  to service_role;
