-- Prevent protected evaluation captures from entering recognition reference indexes.

alter table if exists catalog.assets
  add column if not exists recognition_reference_eligible boolean not null default true;

create index if not exists assets_recognition_reference_eligible_idx
  on catalog.assets(variant_id, asset_type, updated_at desc)
  where recognition_reference_eligible
    and asset_visibility = 'public_catalogue'
    and publicly_servable
    and rights_status = 'approved'
    and permission_status = 'approved'
    and retention_status = 'active'
    and deleted_at is null
    and deprecated_at is null;

comment on column catalog.assets.recognition_reference_eligible is
  'False when an otherwise public catalogue asset must be excluded from recognition reference indexes, including protected evaluation captures and their derivatives.';
