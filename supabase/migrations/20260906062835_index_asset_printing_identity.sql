-- Additive read-side index only: no catalogue or ownership rows are changed.
-- Abort promptly if catalogue ingestion currently holds a conflicting lock.
set lock_timeout = '1s';
set statement_timeout = '60s';

create index if not exists assets_printing_identity_lookup_idx
  on catalog.assets (printing_id) include (id)
  where printing_id is not null;

comment on index catalog.assets_printing_identity_lookup_idx is
  'Cover exact asset-printing candidates without scanning stored artwork metadata.';

-- The rehearsal also found whole-CVA scans on variant and printing identity.
create index if not exists catalogue_version_assets_variant_identity_idx
  on catalog.catalogue_version_assets (variant_id)
  include (catalogue_version_id, asset_id)
  where variant_id is not null;

create index if not exists catalogue_version_assets_printing_identity_idx
  on catalog.catalogue_version_assets (printing_id)
  include (catalogue_version_id, asset_id)
  where printing_id is not null;
