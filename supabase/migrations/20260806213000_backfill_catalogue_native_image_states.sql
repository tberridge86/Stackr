-- Reconcile exact approved images and explicit same-artwork fallbacks.

with exact_native_images as (
  select distinct a.variant_id
  from catalog.assets a
  where a.variant_id is not null
    and a.asset_type = 'card_image'
    and a.rights_status = 'approved'
    and a.permission_status = 'approved'
    and a.publicly_servable
    and a.deprecated_at is null
    and a.deleted_at is null
)
update catalog.card_variants v
set
  native_image_status = 'available',
  same_artwork_as_variant_id = null
from exact_native_images exact
where v.id = exact.variant_id
  and v.deprecated_at is null
  and (
    v.native_image_status is distinct from 'available'
    or v.same_artwork_as_variant_id is not null
  );

with fallback_candidates as (
  select target.id as target_variant_id, source.variant_id as source_variant_id
  from catalog.card_variants target
  cross join lateral (
    select candidate.id as variant_id
    from catalog.card_variants candidate
    join catalog.assets a on a.variant_id = candidate.id
    where candidate.id <> target.id
      and candidate.deprecated_at is null
      and candidate.artwork_key = target.artwork_key
      and a.asset_type = 'card_image'
      and a.rights_status = 'approved'
      and a.permission_status = 'approved'
      and a.publicly_servable
      and a.deprecated_at is null
      and a.deleted_at is null
    order by
      (candidate.language_code = target.language_code) desc,
      (candidate.set_id = target.set_id) desc,
      candidate.id
    limit 1
  ) source
  where target.deprecated_at is null
    and target.native_image_status = 'missing'
    and target.artwork_key is not null
)
update catalog.card_variants target
set
  native_image_status = 'same_artwork_reference',
  same_artwork_as_variant_id = fallback.source_variant_id
from fallback_candidates fallback
where target.id = fallback.target_variant_id;
