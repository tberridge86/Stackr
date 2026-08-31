-- Staging-only support for the bounded Japanese stored-original derivative repair.
-- The predicate exactly matches the fail-closed candidate query; production is not targeted.
create index if not exists catalog_assets_stored_derivative_repair_idx
  on catalog.assets (source_id, id)
  where asset_type = 'card_image'
    and storage_provider = 'supabase_storage'
    and storage_bucket = 'stackr-catalogue-public'
    and rights_status = 'approved'
    and permission_status = 'approved'
    and asset_visibility = 'public_catalogue'
    and publicly_servable = true
    and retention_status = 'active'
    and variant_id is not null
    and storage_key is not null
    and derivative_list = '[]'::jsonb
    and deprecated_at is null
    and deleted_at is null;
