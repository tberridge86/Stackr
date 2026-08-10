create index if not exists catalogue_version_assets_asset_lookup_idx
  on catalog.catalogue_version_assets(asset_id, catalogue_version_id)
  include (language_code, set_id, printing_id, variant_id, asset_type);

create index if not exists assets_public_manifest_updated_lookup_idx
  on catalog.assets(updated_at desc, id)
  where asset_visibility = 'public_catalogue'
    and publicly_servable
    and permission_status = 'approved'
    and rights_status = 'approved'
    and retention_status = 'active'
    and deleted_at is null
    and storage_provider <> 'unavailable';

comment on index catalog.catalogue_version_assets_asset_lookup_idx is
  'Supports membership checks while scanning public assets in manifest order.';

comment on index catalog.assets_public_manifest_updated_lookup_idx is
  'Supports bounded newest-first reads from the public asset manifest.';
