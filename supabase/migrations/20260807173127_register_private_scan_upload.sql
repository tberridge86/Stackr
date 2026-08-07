create or replace function api.register_private_scan_upload(
  p_created_by uuid,
  p_storage_key text,
  p_content_sha256 text,
  p_perceptual_hash text,
  p_mime_type text,
  p_width integer,
  p_height integer,
  p_byte_size bigint,
  p_retention_until timestamptz,
  p_upload_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  registered_asset ml.scan_upload_assets%rowtype;
begin
  if p_created_by is null then
    raise exception 'created_by is required' using errcode = '22023';
  end if;

  if p_storage_key is null or p_storage_key !~ '^private/u/[a-f0-9]{24}/scan-temp/[A-Za-z0-9:_-]{1,128}\.(jpg|png|webp|heic)$' then
    raise exception 'invalid private scan storage key' using errcode = '22023';
  end if;

  if p_content_sha256 is null or p_content_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid private scan SHA-256' using errcode = '22023';
  end if;

  if p_perceptual_hash is not null and p_perceptual_hash !~ '^[a-f0-9]{16}$' then
    raise exception 'invalid private scan perceptual hash' using errcode = '22023';
  end if;

  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic') then
    raise exception 'unsupported private scan MIME type' using errcode = '22023';
  end if;

  if p_width is null or p_width < 1 or p_width > 8000
    or p_height is null or p_height < 1 or p_height > 8000 then
    raise exception 'invalid private scan dimensions' using errcode = '22023';
  end if;

  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 20971520 then
    raise exception 'invalid private scan byte size' using errcode = '22023';
  end if;

  if p_retention_until is null
    or p_retention_until <= now()
    or p_retention_until > now() + interval '25 hours' then
    raise exception 'invalid private scan retention window' using errcode = '22023';
  end if;

  if p_upload_context is null or jsonb_typeof(p_upload_context) <> 'object'
    or octet_length(p_upload_context::text) > 8192 then
    raise exception 'invalid private scan upload context' using errcode = '22023';
  end if;

  insert into ml.scan_upload_assets (
    asset_type,
    asset_visibility,
    created_by,
    storage_provider,
    storage_bucket,
    storage_key,
    original_source,
    permission_status,
    content_sha256,
    perceptual_hash,
    mime_type,
    width,
    height,
    byte_size,
    derivative_list,
    last_verified_at,
    retention_status,
    retention_until,
    upload_context
  ) values (
    'user_scan',
    'private_scan_temp',
    p_created_by,
    'supabase_storage',
    'stackr-scan-temp',
    p_storage_key,
    'stackr_authenticated_api_upload',
    'temporary_upload',
    p_content_sha256,
    p_perceptual_hash,
    p_mime_type,
    p_width,
    p_height,
    p_byte_size,
    '[]'::jsonb,
    now(),
    'temporary',
    p_retention_until,
    p_upload_context
  )
  returning * into registered_asset;

  return jsonb_build_object(
    'asset_id', registered_asset.asset_id,
    'storage_bucket', registered_asset.storage_bucket,
    'storage_key', registered_asset.storage_key,
    'retention_status', registered_asset.retention_status,
    'retention_until', registered_asset.retention_until
  );
end;
$$;

revoke all on function api.register_private_scan_upload(
  uuid, text, text, text, text, integer, integer, bigint, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function api.register_private_scan_upload(
  uuid, text, text, text, text, integer, integer, bigint, timestamptz, jsonb
) to service_role;

comment on function api.register_private_scan_upload(
  uuid, text, text, text, text, integer, integer, bigint, timestamptz, jsonb
) is 'Registers a validated, temporary private recognition scan. Callable only by the backend service role.';
