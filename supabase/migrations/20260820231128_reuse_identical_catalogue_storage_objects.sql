-- Reuse one immutable, content-addressed Storage object across multiple exact
-- catalogue set-art identities. This changes no object bytes and is limited to
-- the 28 evidence-bound duplicate records already verified in staging.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table catalog.assets in share row exclusive mode;

do $index_precondition$
declare
  current_definition text;
begin
  select pg_get_indexdef(indexrelid)
  into current_definition
  from pg_index
  where indexrelid = 'catalog.assets_storage_object_uidx'::regclass;

  if current_definition is distinct from
    'CREATE UNIQUE INDEX assets_storage_object_uidx ON catalog.assets USING btree (storage_provider, storage_bucket, storage_key) WHERE ((storage_key IS NOT NULL) AND (deleted_at IS NULL))'
  then
    raise exception 'Unexpected catalog.assets storage-object index definition: %', current_definition;
  end if;
end
$index_precondition$;

create temporary table _stackr_shared_catalogue_asset_repairs on commit drop as
with duplicate_assets as (
  select
    asset.*,
    substring(asset.unavailable_reason from '^duplicate_content:(.+)$') as target_ref
  from catalog.assets asset
  join catalog.sets set_row
    on set_row.id = asset.set_id
   and set_row.language_code in ('en', 'ja', 'zh-tw', 'zh-cn')
   and set_row.deprecated_at is null
  where asset.deprecated_at is null
    and asset.deleted_at is null
    and asset.storage_provider = 'unavailable'
    and asset.unavailable_reason ~ '^duplicate_content:'
    and asset.asset_type in ('set_logo', 'set_symbol', 'sealed_product_image')
), matched as (
  select
    duplicate.id as duplicate_asset_id,
    target.id as target_asset_id,
    duplicate.asset_type,
    duplicate.set_id,
    set_row.language_code,
    set_row.set_code,
    duplicate.content_sha256 as duplicate_sha256,
    target.content_sha256 as target_sha256,
    target.storage_provider,
    target.storage_bucket,
    target.storage_key,
    target.storage_path,
    target.url,
    target.mime_type,
    target.width,
    target.height,
    target.sha256,
    target.perceptual_hash,
    target.byte_size,
    target.derivative_list,
    target.cache_control,
    target.archival_storage_key,
    target.last_verified_at
  from duplicate_assets duplicate
  join catalog.sets set_row on set_row.id = duplicate.set_id
  join catalog.assets target
    on (target.id::text = duplicate.target_ref or target.asset_id = duplicate.target_ref)
   and target.deprecated_at is null
   and target.deleted_at is null
)
select * from matched;

do $evidence_precondition$
declare
  pair_count integer;
  duplicate_count integer;
  target_count integer;
  pair_sha256 text;
begin
  select
    count(*)::integer,
    count(distinct duplicate_asset_id)::integer,
    count(distinct target_asset_id)::integer,
    encode(digest(string_agg(
      duplicate_asset_id::text || '|' || target_asset_id::text || '|' || asset_type || '|' ||
      set_id::text || '|' || language_code || '|' || set_code || '|' || duplicate_sha256 || '|' ||
      target_sha256 || '|' || storage_bucket || '|' || storage_key,
      E'\n' order by language_code, asset_type, set_code, duplicate_asset_id
    ), 'sha256'), 'hex')
  into pair_count, duplicate_count, target_count, pair_sha256
  from _stackr_shared_catalogue_asset_repairs;

  if pair_count <> 28 or duplicate_count <> 28 or target_count <> 8 then
    raise exception 'Shared catalogue asset evidence count mismatch: pairs %, duplicates %, targets %',
      pair_count, duplicate_count, target_count;
  end if;

  if pair_sha256 <> '0c6701615b70a03af71eb299fae1e50c05e8766042c081fbdf36e64af246eb15' then
    raise exception 'Shared catalogue asset evidence digest mismatch: %', pair_sha256;
  end if;

  if exists (
    select 1
    from _stackr_shared_catalogue_asset_repairs repair
    join catalog.assets duplicate on duplicate.id = repair.duplicate_asset_id
    join catalog.assets target on target.id = repair.target_asset_id
    where duplicate.asset_type is distinct from target.asset_type
       or duplicate.content_sha256 is distinct from target.content_sha256
       or target.storage_provider <> 'supabase_storage'
       or target.storage_bucket is null
       or target.storage_key is null
       or target.storage_path is null
       or target.url is null
       or target.rights_status <> 'approved'
       or target.permission_status <> 'approved'
       or not target.publicly_servable
       or target.asset_visibility <> 'public_catalogue'
       or target.retention_status <> 'active'
       or target.mime_type is null
       or target.width is null
       or target.height is null
       or target.byte_size is null
       or target.derivative_list is null
       or jsonb_array_length(target.derivative_list) <> 3
  ) then
    raise exception 'A shared catalogue asset target is not an exact active production object';
  end if;
end
$evidence_precondition$;

drop index catalog.assets_storage_object_uidx;

create index assets_storage_object_idx
  on catalog.assets(storage_provider, storage_bucket, storage_key)
  where storage_key is not null and deleted_at is null;

create or replace function catalog.enforce_shared_asset_storage_object_identity()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  conflicting_asset_id uuid;
begin
  if new.storage_key is null or new.deleted_at is not null then
    return new;
  end if;

  if new.storage_provider is null
     or new.storage_bucket is null
     or new.content_sha256 is null
     or new.mime_type is null
     or new.byte_size is null
  then
    raise exception using
      errcode = '23514',
      message = 'Active shared catalogue Storage references require provider, bucket, SHA-256, MIME type, and byte size.';
  end if;

  select existing.id
  into conflicting_asset_id
  from catalog.assets existing
  where existing.id <> new.id
    and existing.deleted_at is null
    and existing.storage_provider = new.storage_provider
    and existing.storage_bucket = new.storage_bucket
    and existing.storage_key = new.storage_key
    and (
      existing.asset_type is distinct from new.asset_type
      or existing.url is distinct from new.url
      or existing.storage_path is distinct from new.storage_path
      or existing.content_sha256 is distinct from new.content_sha256
      or existing.sha256 is distinct from new.sha256
      or existing.perceptual_hash is distinct from new.perceptual_hash
      or existing.mime_type is distinct from new.mime_type
      or existing.width is distinct from new.width
      or existing.height is distinct from new.height
      or existing.byte_size is distinct from new.byte_size
      or existing.derivative_list is distinct from new.derivative_list
      or existing.cache_control is distinct from new.cache_control
      or existing.archival_storage_key is distinct from new.archival_storage_key
    )
  limit 1;

  if conflicting_asset_id is not null then
    raise exception using
      errcode = '23514',
      message = format(
        'Catalogue asset %s conflicts with asset %s for shared Storage object %s/%s',
        new.id,
        conflicting_asset_id,
        new.storage_bucket,
        new.storage_key
      );
  end if;

  return new;
end
$function$;

revoke all on function catalog.enforce_shared_asset_storage_object_identity() from public, anon, authenticated;
grant execute on function catalog.enforce_shared_asset_storage_object_identity() to service_role;

drop trigger if exists enforce_shared_asset_storage_object_identity on catalog.assets;
create trigger enforce_shared_asset_storage_object_identity
before insert or update of
  asset_type,
  url,
  storage_provider,
  storage_bucket,
  storage_key,
  storage_path,
  content_sha256,
  sha256,
  perceptual_hash,
  mime_type,
  width,
  height,
  byte_size,
  derivative_list,
  cache_control,
  archival_storage_key,
  deleted_at
on catalog.assets
for each row
execute function catalog.enforce_shared_asset_storage_object_identity();

create temporary table _stackr_shared_catalogue_asset_changes (
  duplicate_asset_id uuid primary key,
  target_asset_id uuid not null,
  asset_type text not null,
  set_id uuid not null,
  language_code text not null,
  set_code text not null,
  content_sha256 text not null,
  storage_bucket text not null,
  storage_key text not null
) on commit drop;

with updated as (
  update catalog.assets duplicate
  set
    url = repair.url,
    storage_provider = repair.storage_provider,
    storage_bucket = repair.storage_bucket,
    storage_key = repair.storage_key,
    storage_path = repair.storage_path,
    mime_type = repair.mime_type,
    width = repair.width,
    height = repair.height,
    sha256 = repair.sha256,
    perceptual_hash = repair.perceptual_hash,
    byte_size = repair.byte_size,
    derivative_list = repair.derivative_list,
    cache_control = repair.cache_control,
    archival_storage_key = repair.archival_storage_key,
    externally_referenced = false,
    publicly_servable = true,
    unavailable_reason = null,
    last_verified_at = repair.last_verified_at,
    retention_status = 'active',
    asset_visibility = 'public_catalogue',
    updated_at = now()
  from _stackr_shared_catalogue_asset_repairs repair
  where duplicate.id = repair.duplicate_asset_id
  returning duplicate.id
)
insert into _stackr_shared_catalogue_asset_changes (
  duplicate_asset_id,
  target_asset_id,
  asset_type,
  set_id,
  language_code,
  set_code,
  content_sha256,
  storage_bucket,
  storage_key
)
select
  repair.duplicate_asset_id,
  repair.target_asset_id,
  repair.asset_type,
  repair.set_id,
  repair.language_code,
  repair.set_code,
  repair.target_sha256,
  repair.storage_bucket,
  repair.storage_key
from _stackr_shared_catalogue_asset_repairs repair
join updated on updated.id = repair.duplicate_asset_id;

do $update_count$
declare
  changed_count integer;
begin
  select count(*)::integer into changed_count
  from _stackr_shared_catalogue_asset_changes;

  if changed_count <> 28 then
    raise exception 'Shared catalogue asset repair count mismatch: expected 28, got %', changed_count;
  end if;
end
$update_count$;

insert into audit.catalogue_events (
  request_id,
  actor_role,
  event_type,
  entity_schema,
  entity_table,
  entity_id,
  canonical_key,
  event_payload,
  internal_notes
)
select
  'catalogue-shared-storage:2026-08-21:0c6701615b70a03a',
  'catalogue_migration',
  'catalogue_asset_storage_object_reused',
  'catalog',
  'assets',
  change.duplicate_asset_id,
  concat('pokemon:', change.language_code, ':', change.set_code, ':', change.asset_type),
  jsonb_build_object(
    'targetAssetId', change.target_asset_id,
    'assetType', change.asset_type,
    'setId', change.set_id,
    'languageCode', change.language_code,
    'setCode', change.set_code,
    'contentSha256', change.content_sha256,
    'storageBucket', change.storage_bucket,
    'storageKey', change.storage_key,
    'pairSetSha256', '0c6701615b70a03af71eb299fae1e50c05e8766042c081fbdf36e64af246eb15'
  ),
  'Exact duplicate set artwork now reuses the existing immutable content-addressed Storage object.'
from _stackr_shared_catalogue_asset_changes change;

insert into catalog.catalogue_change_log (
  entity_schema,
  entity_table,
  entity_id,
  change_type,
  mobile_syncable,
  public_change_summary
)
select
  'catalog',
  'assets',
  change.duplicate_asset_id,
  'update',
  true,
  jsonb_build_object(
    'assetType', change.asset_type,
    'setId', change.set_id,
    'languageCode', change.language_code,
    'setCode', change.set_code,
    'storageObjectReused', true
  )
from _stackr_shared_catalogue_asset_changes change;

do $postcondition$
begin
  if exists (
    select 1
    from _stackr_shared_catalogue_asset_repairs repair
    join catalog.assets duplicate on duplicate.id = repair.duplicate_asset_id
    join catalog.assets target on target.id = repair.target_asset_id
    where duplicate.asset_type is distinct from target.asset_type
       or duplicate.url is distinct from target.url
       or duplicate.storage_provider is distinct from target.storage_provider
       or duplicate.storage_bucket is distinct from target.storage_bucket
       or duplicate.storage_key is distinct from target.storage_key
       or duplicate.storage_path is distinct from target.storage_path
       or duplicate.content_sha256 is distinct from target.content_sha256
       or duplicate.sha256 is distinct from target.sha256
       or duplicate.perceptual_hash is distinct from target.perceptual_hash
       or duplicate.mime_type is distinct from target.mime_type
       or duplicate.width is distinct from target.width
       or duplicate.height is distinct from target.height
       or duplicate.byte_size is distinct from target.byte_size
       or duplicate.derivative_list is distinct from target.derivative_list
       or duplicate.cache_control is distinct from target.cache_control
       or duplicate.archival_storage_key is distinct from target.archival_storage_key
       or not duplicate.publicly_servable
       or duplicate.asset_visibility <> 'public_catalogue'
       or duplicate.retention_status <> 'active'
       or duplicate.unavailable_reason is not null
  ) then
    raise exception 'Shared catalogue asset repair postcondition failed';
  end if;

  if exists (
    select 1
    from catalog.assets left_asset
    join catalog.assets right_asset
      on right_asset.id > left_asset.id
     and right_asset.deleted_at is null
     and right_asset.storage_provider = left_asset.storage_provider
     and right_asset.storage_bucket = left_asset.storage_bucket
     and right_asset.storage_key = left_asset.storage_key
    where left_asset.deleted_at is null
      and left_asset.storage_key is not null
      and (
        right_asset.asset_type is distinct from left_asset.asset_type
        or right_asset.url is distinct from left_asset.url
        or right_asset.storage_path is distinct from left_asset.storage_path
        or right_asset.content_sha256 is distinct from left_asset.content_sha256
        or right_asset.sha256 is distinct from left_asset.sha256
        or right_asset.perceptual_hash is distinct from left_asset.perceptual_hash
        or right_asset.mime_type is distinct from left_asset.mime_type
        or right_asset.width is distinct from left_asset.width
        or right_asset.height is distinct from left_asset.height
        or right_asset.byte_size is distinct from left_asset.byte_size
        or right_asset.derivative_list is distinct from left_asset.derivative_list
        or right_asset.cache_control is distinct from left_asset.cache_control
        or right_asset.archival_storage_key is distinct from left_asset.archival_storage_key
      )
  ) then
    raise exception 'Conflicting metadata exists for a shared catalogue Storage object';
  end if;
end
$postcondition$;
