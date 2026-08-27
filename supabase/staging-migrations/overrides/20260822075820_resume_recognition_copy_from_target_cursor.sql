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
as $$
declare
  source_model_id text;
  source_preprocessing_sha256 text;
  target_expected_count integer;
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
    or p_limit > 1000 then
    raise exception 'Invalid recognition copy batch parameters.' using errcode = '22023';
  end if;

  select model_id, completeness_report #>> '{scope,preprocessingSha256}'
  into source_model_id, source_preprocessing_sha256
  from ml.embedding_index_versions
  where id = p_source_index_version_id
    and status = 'validated'
    and model_id = 'dinov2_vits14'
    and embedding_dimensions = 384;

  select
    (completeness_report ->> 'expectedCount')::integer,
    completeness_report #>> '{scope,preprocessingSha256}'
  into target_expected_count, target_preprocessing_sha256
  from ml.embedding_index_versions
  where id = p_target_index_version_id
    and status = 'building'
    and model_id = source_model_id
    and embedding_dimensions = 384;

  if source_model_id is null
    or source_preprocessing_sha256 !~ '^[0-9a-f]{64}$'
    or target_expected_count < 1
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
  ),
  inserted as (
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
      model_id,
      p_target_index_version_id,
      variant_id,
      reference_asset_id,
      source_image_id,
      language_code,
      embedding,
      embedding_norm,
      preprocessing_checksum_sha256,
      source_image_checksum_sha256,
      null
    from batch
    order by variant_id, reference_asset_id
    on conflict (model_id, index_version_id, variant_id, source_image_id)
    do nothing
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

alter function api.copy_recognition_embedding_public_subset_batch(uuid, uuid, uuid, integer)
  set statement_timeout = '60s';

revoke all on function api.copy_recognition_embedding_public_subset_batch(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function api.copy_recognition_embedding_public_subset_batch(uuid, uuid, uuid, integer)
  to service_role;

create or replace function api.verify_recognition_embedding_manifest(
  p_index_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
            pg_catalog.chr(30)
            order by e.variant_id, e.reference_asset_id
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
        '{manifestVerifiedAt}',
        to_jsonb(now()),
        true
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

alter function api.verify_recognition_embedding_manifest(uuid)
  set statement_timeout = '2min';

revoke all on function api.verify_recognition_embedding_manifest(uuid)
  from public, anon, authenticated;
grant execute on function api.verify_recognition_embedding_manifest(uuid)
  to service_role;

create or replace function api.finalize_published_recognition_embedding_index(
  p_index_version_id uuid,
  p_source_index_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  index_version_name text;
  expected_count integer;
  actual_count integer;
  distinct_variant_count integer;
  invalid_count integer;
  manifest_sha256 text;
  manifest_verified boolean;
  source_checksum_sha256 text;
  derived_index_checksum_sha256 text;
  language_counts jsonb;
begin
  select
    index_version,
    (completeness_report ->> 'expectedCount')::integer,
    completeness_report ->> 'manifestSha256',
    coalesce((completeness_report ->> 'manifestVerified')::boolean, false)
  into index_version_name, expected_count, manifest_sha256, manifest_verified
  from ml.embedding_index_versions
  where id = p_index_version_id
    and status = 'building'
    and model_id = 'dinov2_vits14'
    and embedding_dimensions = 384;

  select checksum_sha256
  into source_checksum_sha256
  from ml.embedding_index_versions
  where id = p_source_index_version_id
    and status = 'validated'
    and model_id = 'dinov2_vits14'
    and embedding_dimensions = 384;

  if index_version_name is null
    or expected_count < 1
    or manifest_sha256 !~ '^[0-9a-f]{64}$'
    or not manifest_verified
    or source_checksum_sha256 !~ '^[0-9a-f]{64}$' then
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
      or a.variant_id is distinct from e.variant_id
      or a.content_sha256 is distinct from e.source_image_checksum_sha256
      or extensions.vector_dims(e.embedding) <> 384
      or e.embedding::text ~* 'nan|infinity'
      or e.embedding_norm < 0.999
      or e.embedding_norm > 1.001
    );

  if actual_count <> expected_count
    or distinct_variant_count <> expected_count
    or invalid_count <> 0 then
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
        'publishedCatalogueMembershipVerified', true
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
    'reusedEmbeddingCount', actual_count,
    'newlyGeneratedEmbeddingCount', 0
  );
end;
$$;

alter function api.finalize_published_recognition_embedding_index(uuid, uuid)
  set statement_timeout = '2min';

revoke all on function api.finalize_published_recognition_embedding_index(uuid, uuid)
  from public, anon, authenticated;
grant execute on function api.finalize_published_recognition_embedding_index(uuid, uuid)
  to service_role;
