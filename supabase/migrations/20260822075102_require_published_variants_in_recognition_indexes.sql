create or replace function ml.recognition_reference_is_publicly_eligible(
  p_asset_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from catalog.assets a
    join catalog.card_variants v
      on v.id = a.variant_id
     and v.deprecated_at is null
    join catalog.card_printings p
      on p.id = v.printing_id
     and p.deprecated_at is null
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
      and a.storage_bucket is not null
      and a.storage_key is not null
      and coalesce(p.language_code, s.language_code) in ('en', 'ja', 'zh-cn', 'zh-tw')
      and exists (
        select 1
        from catalog.catalogue_version_variants cvv
        join catalog.catalogue_versions cv
          on cv.id = cvv.catalogue_version_id
         and cv.status = 'published'
         and cv.deprecated_at is null
        where cvv.variant_id = v.id
      )
  );
$$;

revoke all on function ml.recognition_reference_is_publicly_eligible(uuid)
  from public, anon, authenticated;

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
  where ml.recognition_reference_is_publicly_eligible(a.id)
    and (not p_stored_only or (a.storage_bucket is not null and a.storage_key is not null))
    and (p_after_asset_id is null or a.id > p_after_asset_id)
  order by a.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

revoke all on function api.list_recognition_reference_assets(uuid, integer, boolean)
  from public, anon, authenticated;
grant execute on function api.list_recognition_reference_assets(uuid, integer, boolean)
  to service_role;

create or replace function api.clone_recognition_embedding_index_public_subset(
  p_source_index_version_id uuid,
  p_index_version text,
  p_manifest_sha256 text,
  p_expected_count integer,
  p_scope jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_model_id text;
  source_dimensions integer;
  source_status text;
  source_checksum_sha256 text;
  source_preprocessing_sha256 text;
  observed_manifest_sha256 text;
  derived_index_checksum_sha256 text;
  candidate_index_version_id uuid;
  actual_count integer;
  distinct_variant_count integer;
  invalid_count integer;
  language_counts jsonb;
begin
  if p_source_index_version_id is null
    or p_index_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
    or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_count < 1 then
    raise exception 'Invalid recognition index clone parameters.' using errcode = '22023';
  end if;

  select
    model_id,
    embedding_dimensions,
    status,
    checksum_sha256,
    completeness_report #>> '{scope,preprocessingSha256}'
  into
    source_model_id,
    source_dimensions,
    source_status,
    source_checksum_sha256,
    source_preprocessing_sha256
  from ml.embedding_index_versions
  where id = p_source_index_version_id;

  if source_model_id <> 'dinov2_vits14'
    or source_dimensions <> 384
    or source_status <> 'validated'
    or source_checksum_sha256 !~ '^[0-9a-f]{64}$'
    or source_preprocessing_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'The source recognition index is not a validated reusable DINOv2 build.' using errcode = 'P0001';
  end if;

  select encode(
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
  into observed_manifest_sha256
  from ml.card_embeddings_dinov2_vits14_384 e
  where e.index_version_id = p_source_index_version_id
    and e.deprecated_at is null
    and ml.recognition_reference_is_publicly_eligible(e.reference_asset_id);

  select count(*)::integer, count(distinct e.variant_id)::integer
  into actual_count, distinct_variant_count
  from ml.card_embeddings_dinov2_vits14_384 e
  where e.index_version_id = p_source_index_version_id
    and e.deprecated_at is null
    and ml.recognition_reference_is_publicly_eligible(e.reference_asset_id);

  if observed_manifest_sha256 is distinct from p_manifest_sha256
    or actual_count <> p_expected_count
    or distinct_variant_count <> p_expected_count then
    raise exception 'The published recognition subset does not match its frozen manifest.' using errcode = 'P0001';
  end if;

  candidate_index_version_id := api.prepare_recognition_embedding_index(
    source_model_id,
    p_index_version,
    source_dimensions,
    p_manifest_sha256,
    p_expected_count,
    coalesce(p_scope, '{}'::jsonb) || jsonb_build_object(
      'sourceIndexVersionId', p_source_index_version_id,
      'eligibilityRuleVersion', 'published-launch4-v1',
      'preprocessingSha256', source_preprocessing_sha256,
      'reusedEmbeddingCount', p_expected_count,
      'newlyGeneratedEmbeddingCount', 0
    )
  );

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
    e.model_id,
    candidate_index_version_id,
    e.variant_id,
    e.reference_asset_id,
    e.source_image_id,
    e.language_code,
    e.embedding,
    e.embedding_norm,
    e.preprocessing_checksum_sha256,
    e.source_image_checksum_sha256,
    null
  from ml.card_embeddings_dinov2_vits14_384 e
  where e.index_version_id = p_source_index_version_id
    and e.deprecated_at is null
    and ml.recognition_reference_is_publicly_eligible(e.reference_asset_id)
  order by e.variant_id, e.reference_asset_id;

  get diagnostics actual_count = row_count;

  select count(*)::integer, count(distinct variant_id)::integer
  into actual_count, distinct_variant_count
  from ml.card_embeddings_dinov2_vits14_384
  where index_version_id = candidate_index_version_id
    and deprecated_at is null;

  select count(*)::integer
  into invalid_count
  from ml.card_embeddings_dinov2_vits14_384 e
  left join catalog.assets a on a.id = e.reference_asset_id
  where e.index_version_id = candidate_index_version_id
    and e.deprecated_at is null
    and (
      a.id is null
      or not ml.recognition_reference_is_publicly_eligible(e.reference_asset_id)
      or a.variant_id is distinct from e.variant_id
      or a.content_sha256 is distinct from e.source_image_checksum_sha256
      or e.preprocessing_checksum_sha256 is distinct from source_preprocessing_sha256
      or extensions.vector_dims(e.embedding) <> 384
      or e.embedding::text ~* 'nan|infinity'
      or e.embedding_norm < 0.999
      or e.embedding_norm > 1.001
    );

  if actual_count <> p_expected_count
    or distinct_variant_count <> p_expected_count
    or invalid_count <> 0 then
    raise exception 'The cloned recognition index failed completeness validation.' using errcode = 'P0001';
  end if;

  select jsonb_object_agg(language_code, language_count order by language_code)
  into language_counts
  from (
    select language_code, count(*) as language_count
    from ml.card_embeddings_dinov2_vits14_384
    where index_version_id = candidate_index_version_id
      and deprecated_at is null
    group by language_code
  ) counts;

  derived_index_checksum_sha256 := encode(
    extensions.digest(
      pg_catalog.convert_to(
        'stackr-recognition-public-subset-v1' || pg_catalog.chr(31)
          || source_checksum_sha256 || pg_catalog.chr(31)
          || p_manifest_sha256 || pg_catalog.chr(31)
          || p_index_version || pg_catalog.chr(31)
          || p_expected_count::text,
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
        'manifestSha256', p_manifest_sha256,
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
  where id = candidate_index_version_id
    and status = 'building';

  return jsonb_build_object(
    'indexVersionId', candidate_index_version_id,
    'indexVersion', p_index_version,
    'status', 'validated',
    'activated', false,
    'referenceEmbeddingCount', actual_count,
    'missingEmbeddingCount', 0,
    'invalidReferenceCount', invalid_count,
    'duplicateVariantCount', actual_count - distinct_variant_count,
    'languageCounts', language_counts,
    'manifestSha256', p_manifest_sha256,
    'indexChecksumSha256', derived_index_checksum_sha256,
    'reusedEmbeddingCount', actual_count,
    'newlyGeneratedEmbeddingCount', 0
  );
end;
$$;

alter function api.clone_recognition_embedding_index_public_subset(uuid, text, text, integer, jsonb)
  set statement_timeout = '5min';

revoke all on function api.clone_recognition_embedding_index_public_subset(uuid, text, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function api.clone_recognition_embedding_index_public_subset(uuid, text, text, integer, jsonb)
  to service_role;
