create index if not exists catalog_assets_reusable_source_url_idx
  on catalog.assets (original_source_url, id)
  include (
    variant_id,
    storage_provider,
    storage_bucket,
    storage_key,
    content_sha256,
    perceptual_hash,
    mime_type,
    width,
    height,
    byte_size,
    derivative_list,
    archival_storage_key,
    last_verified_at
  )
  where asset_type = 'card_image'
    and storage_provider in ('supabase_storage', 's3_compatible', 'local_dev')
    and rights_status = 'approved'
    and permission_status = 'approved'
    and publicly_servable = true
    and deprecated_at is null
    and deleted_at is null
    and original_source_url is not null;
