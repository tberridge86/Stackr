create or replace function api.get_recognition_embedding_index_status(
  p_index_version_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'indexVersionId', i.id,
    'indexVersion', i.index_version,
    'modelId', i.model_id,
    'embeddingDimensions', i.embedding_dimensions,
    'status', i.status,
    'checksumSha256', i.checksum_sha256,
    'referenceEmbeddingCount', i.reference_embedding_count,
    'missingEmbeddingCount', i.missing_embedding_count,
    'completenessReport', i.completeness_report,
    'healthReport', i.health_report,
    'activatedAt', i.activated_at,
    'updatedAt', i.updated_at
  )
  from ml.embedding_index_versions i
  where i.id = p_index_version_id
    and i.model_id = 'dinov2_vits14'
    and i.embedding_dimensions = 384;
$$;

revoke all on function api.get_recognition_embedding_index_status(uuid)
  from public, anon, authenticated;
grant execute on function api.get_recognition_embedding_index_status(uuid)
  to service_role;

create or replace function api.list_recognition_embedding_manifest_rows(
  p_index_version_id uuid,
  p_after_variant_id uuid default null,
  p_limit integer default 1000
)
returns table (
  variant_id uuid,
  reference_asset_id uuid,
  source_image_id text,
  language_code text,
  source_image_checksum_sha256 text,
  preprocessing_checksum_sha256 text,
  embedding_norm numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_index_version_id is null
    or p_limit < 1
    or p_limit > 1000 then
    raise exception 'Invalid recognition embedding manifest pagination parameters.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from ml.embedding_index_versions i
    where i.id = p_index_version_id
      and i.model_id = 'dinov2_vits14'
      and i.embedding_dimensions = 384
      and i.status = 'validated'
  ) then
    raise exception 'Recognition embedding manifest source is not validated.' using errcode = 'P0001';
  end if;

  return query
  select
    e.variant_id,
    e.reference_asset_id,
    e.source_image_id,
    e.language_code,
    e.source_image_checksum_sha256,
    e.preprocessing_checksum_sha256,
    e.embedding_norm
  from ml.card_embeddings_dinov2_vits14_384 e
  join catalog.assets a
    on a.id = e.reference_asset_id
   and a.variant_id = e.variant_id
  join catalog.card_variants v
    on v.id = e.variant_id
   and v.deprecated_at is null
  join catalog.card_printings p
    on p.id = v.printing_id
   and p.deprecated_at is null
  join catalog.sets s
    on s.id = p.set_id
   and s.deprecated_at is null
  where e.index_version_id = p_index_version_id
    and e.deprecated_at is null
    and e.model_id = 'dinov2_vits14'
    and e.variant_id is not null
    and (p_after_variant_id is null or e.variant_id > p_after_variant_id)
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
  order by e.variant_id, e.reference_asset_id
  limit p_limit;
end;
$$;

alter function api.list_recognition_embedding_manifest_rows(uuid, uuid, integer)
  set statement_timeout = '30s';

revoke all on function api.list_recognition_embedding_manifest_rows(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function api.list_recognition_embedding_manifest_rows(uuid, uuid, integer)
  to service_role;
