-- Restore launch-catalogue reporting when provider conflicts retain their
-- provider-native set identifiers. PokeData set IDs are numeric and are not
-- canonical UUIDs, so they must be resolved through the unique active
-- language/set-code identity rather than cast directly.

set lock_timeout = '5s';
set statement_timeout = '2min';

create or replace view ingest.launch_catalogue_set_progress
with (security_invoker = true)
as
with launch_sets as (
  select sets.*
  from catalog.sets
  where sets.deprecated_at is null
    and sets.language_code = any (array['en', 'ja', 'zh-tw', 'zh-cn'])
),
printing_counts as (
  select
    card_printings.set_id,
    count(*) filter (where card_printings.deprecated_at is null) as stored_card_records,
    count(*) filter (
      where card_printings.deprecated_at is null
        and card_printings.rarity_id is not null
    ) as classified_rarities,
    count(*) filter (
      where card_printings.deprecated_at is null
        and card_printings.rarity_id is null
    ) as missing_rarities
  from catalog.card_printings
  group by card_printings.set_id
),
variant_counts as (
  select
    card_variants.set_id,
    count(*) filter (where card_variants.deprecated_at is null) as stored_variants,
    count(*) filter (
      where card_variants.deprecated_at is null
        and card_variants.native_image_status = 'same_artwork_reference'
    ) as declared_fallback_references
  from catalog.card_variants
  group by card_variants.set_id
),
exact_asset_variants as (
  select distinct
    variant.set_id,
    variant.id as variant_id
  from catalog.card_variants variant
  join catalog.assets asset
    on asset.variant_id = variant.id
   and asset.asset_type = 'card_image'
   and asset.rights_status = 'approved'
   and asset.permission_status = 'approved'
   and asset.publicly_servable
   and asset.deprecated_at is null
  join ingest.external_identifiers identifier
    on identifier.asset_id = asset.id
   and identifier.source_entity_type = 'asset'
   and identifier.language_code = variant.language_code
   and identifier.is_current
   and identifier.deprecated_at is null
  where variant.deprecated_at is null
    and variant.language_code = any (array['en', 'ja', 'zh-tw', 'zh-cn'])
),
exact_asset_counts as (
  select
    exact_asset_variants.set_id,
    count(*) as exact_native_images
  from exact_asset_variants
  group by exact_asset_variants.set_id
),
fallback_counts as (
  select
    variant.set_id,
    count(*) as fallback_references
  from catalog.card_variants variant
  left join exact_asset_variants exact
    on exact.variant_id = variant.id
  where variant.deprecated_at is null
    and variant.language_code = any (array['en', 'ja', 'zh-tw', 'zh-cn'])
    and variant.native_image_status = 'same_artwork_reference'
    and exact.variant_id is null
  group by variant.set_id
),
set_art as (
  select
    assets.set_id,
    bool_or(assets.asset_type = 'set_logo') as has_logo,
    bool_or(assets.asset_type = 'set_symbol') as has_symbol
  from catalog.assets
  where assets.set_id is not null
    and assets.asset_type = any (array['set_logo', 'set_symbol'])
    and assets.rights_status = 'approved'
    and assets.permission_status = 'approved'
    and assets.publicly_servable
    and assets.deprecated_at is null
  group by assets.set_id
),
conflict_inputs as (
  select
    conflict.entity_id,
    nullif(conflict.proposed_payload ->> 'set_id', '') as proposed_set_id,
    coalesce(
      nullif(conflict.proposed_payload ->> 'set_code', ''),
      nullif(conflict.proposed_payload ->> 'setCode', ''),
      nullif(conflict.proposed_payload ->> 'source_set_code', ''),
      nullif(conflict.proposed_payload ->> 'sourceSetCode', '')
    ) as proposed_set_code,
    case lower(coalesce(
      nullif(conflict.proposed_payload ->> 'language_code', ''),
      nullif(conflict.proposed_payload ->> 'image_language_code', ''),
      nullif(conflict.proposed_payload ->> 'language', '')
    ))
      when 'japanese' then 'ja'
      when 'jp' then 'ja'
      when 'ja-jp' then 'ja'
      when 'english' then 'en'
      when 'traditional chinese' then 'zh-tw'
      when 'simplified chinese' then 'zh-cn'
      else lower(coalesce(
        nullif(conflict.proposed_payload ->> 'language_code', ''),
        nullif(conflict.proposed_payload ->> 'image_language_code', ''),
        nullif(conflict.proposed_payload ->> 'language', '')
      ))
    end as proposed_language_code
  from ingest.data_conflicts conflict
  where conflict.status = any (array['open', 'in_review'])
    and conflict.conflict_type = any (array[
      'duplicate_external_id',
      'identity_collision',
      'set_code_conflict',
      'variant_conflict'
    ])
),
resolved_conflicts as (
  select coalesce(
    entity_set.id,
    payload_uuid_set.id,
    unique_code_set.id
  ) as set_id
  from conflict_inputs conflict
  left join catalog.sets entity_set
    on entity_set.id = conflict.entity_id
  left join catalog.sets payload_uuid_set
    on payload_uuid_set.id = case
      when conflict.proposed_set_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then conflict.proposed_set_id::uuid
      else null
    end
  left join lateral (
    select (array_agg(candidate.id order by candidate.id))[1] as id
    from catalog.sets candidate
    where candidate.deprecated_at is null
      and candidate.language_code = conflict.proposed_language_code
      and lower(candidate.set_code) = lower(conflict.proposed_set_code)
    having count(*) = 1
  ) unique_code_set
    on entity_set.id is null
   and payload_uuid_set.id is null
),
conflict_counts as (
  select
    resolved_conflicts.set_id,
    count(*) as unresolved_identity_conflicts
  from resolved_conflicts
  where resolved_conflicts.set_id is not null
  group by resolved_conflicts.set_id
)
select
  set_row.language_code,
  set_row.id as set_id,
  set_row.set_code,
  set_row.provider_set_code,
  set_row.native_name,
  set_row.english_display_name,
  set_row.release_date,
  greatest(
    coalesce(set_row.total, 0)::bigint,
    coalesce(printing.stored_card_records, 0)
  ) as expected_card_records,
  coalesce(printing.stored_card_records, 0) as stored_card_records,
  greatest(
    greatest(
      coalesce(set_row.total, 0)::bigint,
      coalesce(printing.stored_card_records, 0)
    ) - coalesce(printing.stored_card_records, 0),
    0
  ) as missing_card_records,
  coalesce(variant.stored_variants, 0) as stored_variants,
  coalesce(exact_asset.exact_native_images, 0) as exact_native_images,
  coalesce(fallback.fallback_references, 0) as fallback_references,
  greatest(
    coalesce(variant.stored_variants, 0) - coalesce(exact_asset.exact_native_images, 0),
    0
  ) as variants_without_exact_native_image,
  coalesce(printing.classified_rarities, 0) as classified_rarities,
  coalesce(printing.missing_rarities, 0) as missing_rarities,
  coalesce(art.has_logo, false) as has_logo,
  coalesce(art.has_symbol, false) as has_symbol,
  coalesce(conflicts.unresolved_identity_conflicts, 0) as unresolved_identity_conflicts,
  case
    when coalesce(conflicts.unresolved_identity_conflicts, 0) > 0 then 'Under review'
    when greatest(
      greatest(
        coalesce(set_row.total, 0)::bigint,
        coalesce(printing.stored_card_records, 0)
      ) - coalesce(printing.stored_card_records, 0),
      0
    ) > 0 then 'Metadata incomplete'
    when greatest(
      coalesce(variant.stored_variants, 0) - coalesce(exact_asset.exact_native_images, 0),
      0
    ) > 0 then 'Images incomplete'
    when not coalesce(art.has_logo, false)
      or not coalesce(art.has_symbol, false) then 'Set art incomplete'
    else 'Complete'
  end as completion_status
from launch_sets set_row
left join printing_counts printing on printing.set_id = set_row.id
left join variant_counts variant on variant.set_id = set_row.id
left join exact_asset_counts exact_asset on exact_asset.set_id = set_row.id
left join fallback_counts fallback on fallback.set_id = set_row.id
left join set_art art on art.set_id = set_row.id
left join conflict_counts conflicts on conflicts.set_id = set_row.id;

comment on view ingest.launch_catalogue_set_progress is
  'Private launch progress. Provider-native conflict set IDs resolve only through an existing canonical UUID or one unique active language/set-code identity.';

reset lock_timeout;
reset statement_timeout;
