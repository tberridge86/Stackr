create index if not exists catalog_assets_approved_external_source_queue_idx
  on catalog.assets (source_id, id)
  where rights_status = 'approved'
    and permission_status = 'approved'
    and storage_provider = 'external_reference'
    and publicly_servable = true
    and deprecated_at is null;
