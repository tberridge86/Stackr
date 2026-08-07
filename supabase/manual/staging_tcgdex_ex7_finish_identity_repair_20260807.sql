-- Staging-only data repair for TCGdex EX7 finish identities.
--
-- The pinned TCGdex snapshot at 771a8381c57c73182b9776657a15cd1166c66d36
-- declares these cards as normal + reverse, not holo. An older import linked the
-- base provider IDs and :holo aliases to unsupported holo variants. This repair
-- moves any already mirrored scan to the supported normal variant before
-- deprecating the stale provider-only holo identity.

begin;

create temp table ex7_finish_repairs (
  card_external_id text primary key,
  stale_variant_id uuid not null,
  correct_variant_id uuid not null
) on commit drop;

insert into ex7_finish_repairs (card_external_id, stale_variant_id, correct_variant_id)
select
  base.external_id,
  base.variant_id,
  normal.variant_id
from ingest.sources source
join ingest.external_identifiers base
  on base.source_id = source.id
 and base.source_entity_type = 'card'
 and base.language_code = 'en'
 and base.is_current
 and base.deprecated_at is null
join ingest.external_identifiers normal
  on normal.source_id = source.id
 and normal.source_entity_type = 'card'
 and normal.language_code = 'en'
 and normal.external_id = base.external_id || ':normal'
 and normal.is_current
 and normal.deprecated_at is null
join ingest.external_identifiers stale_holo
  on stale_holo.source_id = source.id
 and stale_holo.source_entity_type = 'card'
 and stale_holo.language_code = 'en'
 and stale_holo.external_id = base.external_id || ':holo'
 and stale_holo.variant_id = base.variant_id
 and stale_holo.is_current
 and stale_holo.deprecated_at is null
where source.code = 'tcgdex'
  and base.external_id in (
    'ex7-36', 'ex7-37', 'ex7-38', 'ex7-39', 'ex7-40',
    'ex7-41', 'ex7-42', 'ex7-79', 'ex7-80', 'ex7-81',
    'ex7-82', 'ex7-83', 'ex7-84', 'ex7-85', 'ex7-86'
  );

do $$
begin
  if (select count(*) from ex7_finish_repairs) <> 15 then
    raise exception 'Expected exactly 15 EX7 finish repairs.';
  end if;

  if exists (
    select 1
    from ex7_finish_repairs repair
    join catalog.card_variants stale on stale.id = repair.stale_variant_id
    join catalog.card_variants correct on correct.id = repair.correct_variant_id
    where stale.variant_code <> 'holo'
       or correct.variant_code <> 'normal'
       or stale.printing_id <> correct.printing_id
       or stale.artwork_key is distinct from correct.artwork_key
       or stale.deprecated_at is not null
       or correct.deprecated_at is not null
  ) then
    raise exception 'EX7 variant safety check failed.';
  end if;

  if exists (
    select 1
    from ex7_finish_repairs repair
    join ingest.external_identifiers identifier
      on identifier.variant_id = repair.stale_variant_id
     and identifier.is_current
     and identifier.deprecated_at is null
    join ingest.sources source on source.id = identifier.source_id
    where source.code <> 'tcgdex'
       or identifier.external_id not in (
         repair.card_external_id,
         repair.card_external_id || ':holo'
       )
  ) then
    raise exception 'A stale EX7 holo variant has an unexpected current source link.';
  end if;

  if exists (
    select 1
    from ex7_finish_repairs repair
    join catalog.assets stale
      on stale.variant_id = repair.stale_variant_id
     and stale.deprecated_at is null
     and stale.storage_provider in ('supabase_storage', 's3_compatible', 'local_dev')
    where not exists (
      select 1
      from catalog.assets correct
      where correct.variant_id = repair.correct_variant_id
        and correct.source_id = stale.source_id
        and correct.deprecated_at is null
    )
  ) then
    raise exception 'A mirrored EX7 holo asset has no normal asset destination.';
  end if;
end $$;

create temp table ex7_asset_transfers on commit drop as
select distinct on (repair.correct_variant_id, stale.source_id)
  stale.id as stale_asset_id,
  correct.id as correct_asset_id,
  stale.url,
  stale.storage_path,
  stale.mime_type,
  stale.width,
  stale.height,
  stale.sha256,
  stale.publicly_servable,
  stale.storage_provider,
  stale.storage_bucket,
  stale.storage_key,
  stale.original_source_url,
  stale.original_source_identifier,
  stale.source_attribution,
  stale.content_sha256,
  stale.perceptual_hash,
  stale.byte_size,
  stale.derivative_list,
  stale.cache_control,
  stale.archival_storage_key,
  stale.last_verified_at,
  stale.acquisition_source
from ex7_finish_repairs repair
join catalog.assets stale
  on stale.variant_id = repair.stale_variant_id
 and stale.deprecated_at is null
 and stale.storage_provider in ('supabase_storage', 's3_compatible', 'local_dev')
join catalog.assets correct
  on correct.variant_id = repair.correct_variant_id
 and correct.source_id = stale.source_id
 and correct.deprecated_at is null
where correct.storage_provider not in ('supabase_storage', 's3_compatible', 'local_dev')
order by repair.correct_variant_id, stale.source_id, stale.created_at desc;

-- Release the unique storage-object reference before assigning it to the
-- supported normal asset. The object itself remains in storage.
update catalog.assets stale
set
  url = coalesce(stale.original_source_url, stale.url),
  storage_provider = 'unavailable',
  storage_bucket = null,
  storage_key = null,
  storage_path = null,
  externally_referenced = false,
  publicly_servable = false,
  unavailable_reason = 'tcgdex_pinned_snapshot_finish_correction',
  retention_status = 'unavailable',
  deprecated_at = now(),
  deprecated_reason = 'tcgdex_pinned_snapshot_finish_correction',
  updated_at = now()
from ex7_finish_repairs repair
where stale.variant_id = repair.stale_variant_id
  and stale.deprecated_at is null;

update catalog.assets correct
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
from ex7_asset_transfers transfer
where correct.id = transfer.correct_asset_id;

update ingest.external_identifiers base
set
  variant_id = repair.correct_variant_id,
  updated_at = now()
from ex7_finish_repairs repair
where base.external_id = repair.card_external_id
  and base.variant_id = repair.stale_variant_id
  and base.is_current
  and base.deprecated_at is null;

update ingest.external_identifiers stale_holo
set
  is_current = false,
  deprecated_at = now(),
  deprecated_reason = 'tcgdex_pinned_snapshot_finish_correction',
  updated_at = now()
from ex7_finish_repairs repair
where stale_holo.external_id = repair.card_external_id || ':holo'
  and stale_holo.variant_id = repair.stale_variant_id
  and stale_holo.is_current
  and stale_holo.deprecated_at is null;

update catalog.card_variants stale
set
  native_image_status = 'missing',
  same_artwork_as_variant_id = repair.correct_variant_id,
  deprecated_at = now(),
  deprecated_reason = 'tcgdex_pinned_snapshot_finish_correction',
  corrected_by_variant_id = repair.correct_variant_id,
  updated_at = now()
from ex7_finish_repairs repair
where stale.id = repair.stale_variant_id;

update catalog.card_variants correct
set
  native_image_status = case
    when exists (
      select 1
      from catalog.assets asset
      where asset.variant_id = correct.id
        and asset.publicly_servable
        and asset.storage_provider in ('supabase_storage', 's3_compatible', 'local_dev')
        and asset.deprecated_at is null
    ) then 'available'
    else correct.native_image_status
  end,
  same_artwork_as_variant_id = null,
  updated_at = now()
from ex7_finish_repairs repair
where correct.id = repair.correct_variant_id;

commit;
