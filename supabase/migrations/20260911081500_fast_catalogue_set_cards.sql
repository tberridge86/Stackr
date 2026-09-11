-- Hot-path catalogue read for binder/set screens.
-- Returns card rows with the preferred published artwork in one PostgREST round trip.

create index if not exists card_printings_set_sort_idx
  on catalog.card_printings (set_id, collector_number_sort_key, id)
  where deprecated_at is null;

create or replace function api.card_image_manifest_for_identities(
  p_variant_ids uuid[],
  p_printing_ids uuid[],
  p_after_version_id uuid default null::uuid,
  p_after_asset_id uuid default null::uuid,
  p_limit integer default 1000
)
returns setof api.asset_manifest
language plpgsql
stable
set search_path to ''
as $function$
begin
  if p_variant_ids is null or p_printing_ids is null
     or cardinality(p_variant_ids) > 100 or cardinality(p_printing_ids) > 100
     or coalesce(array_ndims(p_variant_ids), 1) <> 1
     or coalesce(array_ndims(p_printing_ids), 1) <> 1
     or array_position(p_variant_ids, null) is not null
     or array_position(p_printing_ids, null) is not null then
    raise exception using errcode = '22023',
      message = 'Image identity arrays must be one-dimensional, non-null, and contain at most 100 non-null UUIDs each.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'Image page limit must be between 1 and 1000.';
  end if;
  if (p_after_version_id is null) <> (p_after_asset_id is null) then
    raise exception using errcode = '22023', message = 'Both image cursor UUIDs must be supplied together.';
  end if;
  if cardinality(p_variant_ids) = 0 and cardinality(p_printing_ids) = 0 then
    return;
  end if;

  return query
  with target_variants as materialized (
    select input.variant_id
    from unnest(p_variant_ids) as input(variant_id)
    union
    select v.id
    from catalog.card_variants v
    where cardinality(p_variant_ids) = 0
      and v.printing_id = any(p_printing_ids)
      and v.deprecated_at is null
  ), candidate as materialized (
    select distinct cva.catalogue_version_id, cva.asset_id
    from target_variants t
    join catalog.catalogue_version_assets cva on cva.variant_id = t.variant_id
    union
    select cva.catalogue_version_id, cva.asset_id
    from catalog.catalogue_version_assets cva
    where cardinality(p_variant_ids) = 0
      and cva.printing_id = any(p_printing_ids)
  )
  select
    coalesce(a.asset_id, a.id::text) as asset_id,
    a.asset_type,
    a.game_code,
    cva.set_id,
    cva.printing_id,
    cva.variant_id,
    a.storage_provider,
    a.storage_bucket,
    a.storage_key,
    a.url as external_url,
    a.original_source_url,
    coalesce(a.source_attribution, a.attribution_text) as source_attribution,
    a.permission_status,
    a.rights_status,
    a.content_sha256,
    a.perceptual_hash,
    a.mime_type,
    a.width,
    a.height,
    a.byte_size,
    a.derivative_list,
    a.cache_control,
    a.externally_referenced,
    a.unavailable_reason,
    a.last_verified_at,
    a.created_at,
    a.updated_at,
    cva.catalogue_version_id,
    a.id as asset_row_id
  from candidate c
  join catalog.catalogue_version_assets cva
    on cva.catalogue_version_id = c.catalogue_version_id
   and cva.asset_id = c.asset_id
  join catalog.catalogue_versions cv
    on cv.id = cva.catalogue_version_id
   and cv.status = 'published'
   and cv.deprecated_at is null
  join catalog.assets a on a.id = cva.asset_id
  where a.asset_type = 'card_image'
    and a.asset_visibility = 'public_catalogue'
    and a.publicly_servable
    and a.permission_status = 'approved'
    and a.rights_status = 'approved'
    and a.retention_status = 'active'
    and a.deleted_at is null
    and a.storage_provider <> 'unavailable'
    and (p_after_version_id is null
      or (cva.catalogue_version_id, a.id) > (p_after_version_id, p_after_asset_id))
  order by cva.catalogue_version_id, a.id
  limit p_limit;
end;
$function$;

create or replace function api.catalogue_set_card_rows(
  p_set_id uuid,
  p_language_code text default null,
  p_after_variant_id uuid default null,
  p_limit integer default 120
)
returns table(card_row jsonb, image_row jsonb)
language sql
stable
set search_path to ''
as $function$
with selected as materialized (
  select c.*
  from api.catalogue_cards c
  where c.set_id = p_set_id
    and (p_language_code is null or c.language_code = p_language_code)
    and (p_after_variant_id is null or c.variant_id > p_after_variant_id)
  order by c.variant_id
  limit least(greatest(coalesce(p_limit, 120), 1), 500) + 1
), targets as materialized (
  select s.variant_id as source_variant_id, s.variant_id as candidate_variant_id, 0 as relation_type
  from selected s
  union all
  select s.variant_id, s.same_artwork_as_variant_id, 1
  from selected s
  where s.same_artwork_as_variant_id is not null
), candidates as materialized (
  select
    t.source_variant_id,
    t.relation_type,
    coalesce(a.asset_id, a.id::text) as asset_id,
    a.asset_type,
    a.game_code,
    cva.set_id,
    cva.printing_id,
    cva.variant_id,
    a.storage_provider,
    a.storage_bucket,
    a.storage_key,
    a.url as external_url,
    a.original_source_url,
    coalesce(a.source_attribution, a.attribution_text) as source_attribution,
    a.permission_status,
    a.rights_status,
    a.content_sha256,
    a.perceptual_hash,
    a.mime_type,
    a.width,
    a.height,
    a.byte_size,
    a.derivative_list,
    a.cache_control,
    a.externally_referenced,
    a.unavailable_reason,
    a.last_verified_at,
    a.created_at,
    a.updated_at,
    cva.catalogue_version_id,
    a.id as asset_row_id,
    (
      a.storage_provider in ('supabase_storage', 's3_compatible', 'local_dev')
      and a.storage_key is not null
      and (
        select count(distinct d->>'role')
        from jsonb_array_elements(coalesce(a.derivative_list, '[]'::jsonb)) d
        where d->>'role' in ('card-grid', 'search-result', 'detail-page')
      ) = 3
    ) as app_ready
  from targets t
  join catalog.catalogue_version_assets cva on cva.variant_id = t.candidate_variant_id
  join catalog.catalogue_versions cv
    on cv.id = cva.catalogue_version_id
   and cv.status = 'published'
   and cv.deprecated_at is null
  join catalog.assets a on a.id = cva.asset_id
  where a.asset_type = 'card_image'
    and a.asset_visibility = 'public_catalogue'
    and a.publicly_servable
    and a.permission_status = 'approved'
    and a.rights_status = 'approved'
    and a.retention_status = 'active'
    and a.deleted_at is null
    and a.storage_provider <> 'unavailable'
), ranked as materialized (
  select c.*,
    row_number() over (
      partition by c.source_variant_id
      order by
        case
          when c.relation_type = 0 and c.app_ready then 0
          when c.relation_type = 1 and c.app_ready then 1
          when c.relation_type = 1 then 2
          else 3
        end,
        c.asset_row_id
    ) as rn
  from candidates c
)
select
  to_jsonb(s) as card_row,
  case when r.asset_id is null then null
    else to_jsonb(r) - 'source_variant_id' - 'relation_type' - 'app_ready' - 'rn'
  end as image_row
from selected s
left join ranked r
  on r.source_variant_id = s.variant_id
 and r.rn = 1
order by s.variant_id;
$function$;
