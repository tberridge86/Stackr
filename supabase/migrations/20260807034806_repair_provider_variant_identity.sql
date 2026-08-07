-- Atomically repair a provider's stale base card identity when a pinned
-- snapshot explicitly supersedes one finish with another. Service role only.

create or replace function ingest.repair_provider_variant_identity(
  p_source_id uuid,
  p_language_code text,
  p_external_id text,
  p_expected_variant_id uuid,
  p_stale_variant_id uuid,
  p_supported_variant_codes text[],
  p_reason text default 'provider_pinned_snapshot_finish_correction'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stale_variant catalog.card_variants%rowtype;
  expected_variant catalog.card_variants%rowtype;
  transfer record;
  transferred_assets integer := 0;
  retired_assets integer := 0;
begin
  if p_external_id is null or btrim(p_external_id) = '' or p_external_id like '%:%' then
    raise exception 'A base provider card ID is required.';
  end if;

  if coalesce(array_length(p_supported_variant_codes, 1), 0) = 0 then
    raise exception 'The pinned snapshot must declare at least one supported finish.';
  end if;

  select * into strict stale_variant
  from catalog.card_variants
  where id = p_stale_variant_id
    and deprecated_at is null;

  select * into strict expected_variant
  from catalog.card_variants
  where id = p_expected_variant_id
    and deprecated_at is null;

  if stale_variant.id = expected_variant.id
     or stale_variant.printing_id <> expected_variant.printing_id
     or stale_variant.artwork_key is distinct from expected_variant.artwork_key then
    raise exception 'Variant identity safety check failed.';
  end if;

  if not expected_variant.variant_code = any(p_supported_variant_codes)
     or stale_variant.variant_code = any(p_supported_variant_codes) then
    raise exception 'Pinned finish evidence does not support this repair.';
  end if;

  if not exists (
    select 1
    from ingest.external_identifiers identifier
    where identifier.source_id = p_source_id
      and identifier.source_entity_type = 'card'
      and identifier.language_code = p_language_code
      and identifier.external_id = p_external_id
      and identifier.variant_id = p_stale_variant_id
      and identifier.is_current
      and identifier.deprecated_at is null
  ) then
    raise exception 'The stale base provider identity is no longer current.';
  end if;

  if not exists (
    select 1
    from ingest.external_identifiers identifier
    where identifier.source_id = p_source_id
      and identifier.source_entity_type = 'card'
      and identifier.language_code = p_language_code
      and identifier.variant_id = p_expected_variant_id
      and identifier.is_current
      and identifier.deprecated_at is null
  ) then
    raise exception 'The supported provider variant identity is not current.';
  end if;

  if exists (
    select 1
    from ingest.external_identifiers identifier
    where identifier.variant_id = p_stale_variant_id
      and identifier.is_current
      and identifier.deprecated_at is null
      and (
        identifier.source_id <> p_source_id
        or identifier.source_entity_type <> 'card'
        or identifier.language_code is distinct from p_language_code
        or identifier.external_id not in (
          p_external_id,
          p_external_id || ':' || stale_variant.variant_code
        )
      )
  ) then
    raise exception 'The stale variant has an unexpected current provider link.';
  end if;

  if exists (
    select 1
    from catalog.assets asset
    where asset.variant_id in (p_stale_variant_id, p_expected_variant_id)
      and asset.deprecated_at is null
    group by asset.variant_id, asset.source_id, asset.asset_type
    having count(*) > 1
  ) then
    raise exception 'Ambiguous active assets prevent an automatic variant repair.';
  end if;

  if exists (
    select 1
    from catalog.assets stale_asset
    where stale_asset.variant_id = p_stale_variant_id
      and stale_asset.deprecated_at is null
      and stale_asset.storage_provider in ('supabase_storage', 's3_compatible', 'local_dev')
      and not exists (
        select 1
        from catalog.assets expected_asset
        where expected_asset.variant_id = p_expected_variant_id
          and expected_asset.source_id is not distinct from stale_asset.source_id
          and expected_asset.asset_type = stale_asset.asset_type
          and expected_asset.deprecated_at is null
      )
  ) then
    raise exception 'A mirrored stale asset has no supported destination.';
  end if;

  for transfer in
    select
      stale_asset.id as stale_asset_id,
      expected_asset.id as expected_asset_id,
      expected_asset.storage_provider as expected_storage_provider,
      stale_asset.url,
      stale_asset.storage_path,
      stale_asset.mime_type,
      stale_asset.width,
      stale_asset.height,
      stale_asset.sha256,
      stale_asset.publicly_servable,
      stale_asset.storage_provider,
      stale_asset.storage_bucket,
      stale_asset.storage_key,
      stale_asset.original_source_url,
      stale_asset.original_source_identifier,
      stale_asset.source_attribution,
      stale_asset.content_sha256,
      stale_asset.perceptual_hash,
      stale_asset.byte_size,
      stale_asset.derivative_list,
      stale_asset.cache_control,
      stale_asset.archival_storage_key,
      stale_asset.last_verified_at,
      stale_asset.acquisition_source
    from catalog.assets stale_asset
    join catalog.assets expected_asset
      on expected_asset.variant_id = p_expected_variant_id
     and expected_asset.source_id is not distinct from stale_asset.source_id
     and expected_asset.asset_type = stale_asset.asset_type
     and expected_asset.deprecated_at is null
    where stale_asset.variant_id = p_stale_variant_id
      and stale_asset.deprecated_at is null
      and stale_asset.storage_provider in ('supabase_storage', 's3_compatible', 'local_dev')
  loop
    update catalog.assets
    set
      url = coalesce(original_source_url, url),
      storage_provider = 'unavailable',
      storage_bucket = null,
      storage_key = null,
      storage_path = null,
      externally_referenced = false,
      publicly_servable = false,
      unavailable_reason = p_reason,
      retention_status = 'unavailable',
      updated_at = now()
    where id = transfer.stale_asset_id;

    if transfer.expected_storage_provider not in ('supabase_storage', 's3_compatible', 'local_dev') then
      update catalog.assets
      set
        url = transfer.url,
        storage_path = transfer.storage_path,
        mime_type = transfer.mime_type,
        width = transfer.width,
        height = transfer.height,
        sha256 = transfer.sha256,
        publicly_servable = transfer.publicly_servable,
        storage_provider = transfer.storage_provider,
        storage_bucket = transfer.storage_bucket,
        storage_key = transfer.storage_key,
        original_source_url = transfer.original_source_url,
        original_source_identifier = transfer.original_source_identifier,
        source_attribution = transfer.source_attribution,
        content_sha256 = transfer.content_sha256,
        perceptual_hash = transfer.perceptual_hash,
        byte_size = transfer.byte_size,
        derivative_list = transfer.derivative_list,
        cache_control = transfer.cache_control,
        archival_storage_key = transfer.archival_storage_key,
        last_verified_at = transfer.last_verified_at,
        acquisition_source = transfer.acquisition_source,
        externally_referenced = false,
        unavailable_reason = null,
        retention_status = 'active',
        updated_at = now()
      where id = transfer.expected_asset_id;
      transferred_assets := transferred_assets + 1;
    end if;
  end loop;

  update catalog.assets
  set
    url = coalesce(original_source_url, url),
    storage_provider = 'unavailable',
    storage_bucket = null,
    storage_key = null,
    storage_path = null,
    externally_referenced = false,
    publicly_servable = false,
    unavailable_reason = p_reason,
    retention_status = 'unavailable',
    deprecated_at = now(),
    deprecated_reason = p_reason,
    updated_at = now()
  where variant_id = p_stale_variant_id
    and deprecated_at is null;
  get diagnostics retired_assets = row_count;

  update ingest.external_identifiers
  set
    variant_id = p_expected_variant_id,
    updated_at = now()
  where source_id = p_source_id
    and source_entity_type = 'card'
    and language_code = p_language_code
    and external_id = p_external_id
    and variant_id = p_stale_variant_id
    and is_current
    and deprecated_at is null;

  update ingest.external_identifiers
  set
    is_current = false,
    deprecated_at = now(),
    deprecated_reason = p_reason,
    updated_at = now()
  where source_id = p_source_id
    and source_entity_type = 'card'
    and language_code = p_language_code
    and external_id = p_external_id || ':' || stale_variant.variant_code
    and variant_id = p_stale_variant_id
    and is_current
    and deprecated_at is null;

  update catalog.card_variants
  set
    native_image_status = 'missing',
    same_artwork_as_variant_id = p_expected_variant_id,
    deprecated_at = now(),
    deprecated_reason = p_reason,
    corrected_by_variant_id = p_expected_variant_id,
    updated_at = now()
  where id = p_stale_variant_id;

  update catalog.card_variants expected
  set
    native_image_status = case
      when exists (
        select 1
        from catalog.assets asset
        where asset.variant_id = expected.id
          and asset.publicly_servable
          and asset.storage_provider in ('supabase_storage', 's3_compatible', 'local_dev')
          and asset.deprecated_at is null
      ) then 'available'
      else expected.native_image_status
    end,
    same_artwork_as_variant_id = null,
    updated_at = now()
  where expected.id = p_expected_variant_id;

  return jsonb_build_object(
    'status', 'repaired',
    'externalId', p_external_id,
    'staleVariantCode', stale_variant.variant_code,
    'expectedVariantCode', expected_variant.variant_code,
    'transferredAssets', transferred_assets,
    'retiredAssets', retired_assets
  );
end;
$$;

revoke all on function ingest.repair_provider_variant_identity(uuid, text, text, uuid, uuid, text[], text)
  from public, anon, authenticated;
grant execute on function ingest.repair_provider_variant_identity(uuid, text, text, uuid, uuid, text[], text)
  to service_role;
