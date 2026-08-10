create or replace view api.asset_manifest
with (security_invoker = true) as
select
  coalesce(a.asset_id, a.id::text) as asset_id,
  a.asset_type,
  a.game_code,
  coalesce(cva.set_id, a.set_id, av.set_id, ap.set_id) as set_id,
  coalesce(cva.printing_id, a.printing_id, av.printing_id) as printing_id,
  coalesce(cva.variant_id, a.variant_id) as variant_id,
  a.storage_provider,
  a.storage_bucket,
  a.storage_key,
  a.url as external_url,
  a.original_source_url,
  coalesce(a.source_attribution, a.attribution_text) as source_attribution,
  a.permission_status,
  a.rights_status,
  a.content_sha256,
  a.perceptual_hash,
  a.mime_type,
  a.width,
  a.height,
  a.byte_size,
  a.derivative_list,
  a.cache_control,
  a.externally_referenced,
  a.unavailable_reason,
  a.last_verified_at,
  a.created_at,
  a.updated_at
from catalog.catalogue_version_assets cva
join catalog.catalogue_versions cv on cv.id = cva.catalogue_version_id
join catalog.assets a on a.id = cva.asset_id
left join catalog.card_variants av
  on av.id = coalesce(cva.variant_id, a.variant_id)
left join catalog.card_printings ap
  on ap.id = coalesce(cva.printing_id, a.printing_id, av.printing_id)
where cv.status = 'published'
  and cv.deprecated_at is null
  and a.asset_visibility = 'public_catalogue'
  and a.publicly_servable
  and a.permission_status = 'approved'
  and a.rights_status = 'approved'
  and a.retention_status = 'active'
  and a.deleted_at is null
  and a.storage_provider <> 'unavailable';

comment on view api.asset_manifest is
  'Approved published assets with set and printing identity inherited from their card variant when needed.';
