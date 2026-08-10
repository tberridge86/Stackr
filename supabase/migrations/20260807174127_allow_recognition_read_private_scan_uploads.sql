create or replace function ml.resolve_private_scan_asset(
  p_asset_id text,
  p_created_by uuid
)
returns table (
  asset_id text,
  created_by uuid,
  storage_bucket text,
  storage_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    scan.asset_id,
    scan.created_by,
    scan.storage_bucket,
    scan.storage_key
  from ml.scan_upload_assets scan
  where scan.asset_id = p_asset_id
    and scan.created_by = p_created_by
    and p_asset_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and scan.asset_type = 'user_scan'
    and scan.asset_visibility = 'private_scan_temp'
    and scan.storage_bucket = 'stackr-scan-temp'
    and scan.storage_key ~ '^private/u/[a-f0-9]{24}/scan-temp/[A-Za-z0-9:_-]{1,128}\.(jpg|png|webp|heic)$'
    and scan.permission_status = 'temporary_upload'
    and scan.retention_status = 'temporary'
    and scan.retention_until > now()
    and scan.deleted_at is null
  limit 1;
$$;

revoke all on function ml.resolve_private_scan_asset(text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function ml.resolve_private_scan_asset(text, uuid)
  to stackr_recognition;

comment on function ml.resolve_private_scan_asset(text, uuid) is
  'Resolves one active temporary private scan only when its opaque asset ID and signed gateway user ID match. Executable solely by the private recognition role.';
