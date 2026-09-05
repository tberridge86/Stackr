-- SELF-CONTAINED, READ-ONLY PostgreSQL VALUES FIXTURE.
-- No production table/view is read or changed. `passed = true` proves only this
-- fixture's branch coverage; production EXPLAIN/equivalence remains required.
with params as (
  select array['variant-cva']::text[] as p_variant_ids,
         array['printing-cva', 'printing-derived-cva', 'printing-derived-asset', 'printing-asset']::text[] as p_printing_ids
),
versions(version_id, published, deprecated) as (
  values ('ja-v1', true, false), ('zh-tw-v2', true, false), ('draft-v', false, false), ('old-v', true, true)
),
variants(variant_id, printing_id) as (
  values ('variant-cva', 'printing-other'), ('variant-derived-cva', 'printing-derived-cva'),
         ('variant-derived-asset', 'printing-derived-asset'), ('variant-unrequested', 'printing-other')
),
assets(asset_id, asset_type, variant_id, printing_id, visibility, publicly_servable, permission_status, rights_status, retention_status, deleted, storage_provider, external_url, attribution, mime_type) as (
  values
    ('a-cva-variant', 'card_image', 'variant-unrequested', null, 'public_catalogue', true, 'approved', 'approved', 'active', false, 'provider', 'https://example/a-cva.webp', 'provider', 'image/webp'),
    ('a-cva-printing', 'card_image', null, 'printing-other', 'public_catalogue', true, 'approved', 'approved', 'active', false, 'provider', 'https://example/a-cva-printing.webp', 'provider', 'image/webp'),
    ('a-derived-cva', 'card_image', 'variant-unrequested', null, 'public_catalogue', true, 'approved', 'approved', 'active', false, 'provider', 'https://example/a-derived-cva.webp', 'provider', 'image/webp'),
    ('a-derived-asset', 'card_image', 'variant-derived-asset', null, 'public_catalogue', true, 'approved', 'approved', 'active', false, 'provider', 'https://example/a-derived-asset.webp', 'provider', 'image/webp'),
    ('a-dedupe', 'card_image', 'variant-derived-asset', null, 'public_catalogue', true, 'approved', 'approved', 'active', false, 'provider', 'https://example/a-dedupe.webp', 'provider', 'image/webp'),
    ('a-asset-printing', 'card_image', null, 'printing-asset', 'public_catalogue', true, 'approved', 'approved', 'active', false, 'provider', 'https://example/a-asset-printing.webp', 'provider', 'image/webp'),
    ('a-cross', 'card_image', 'variant-derived-asset', null, 'public_catalogue', true, 'approved', 'approved', 'active', false, 'provider', 'https://example/a-cross.webp', 'provider', 'image/webp'),
    ('a-coalesce-extra', 'card_image', 'variant-derived-asset', null, 'public_catalogue', true, 'approved', 'approved', 'active', false, 'provider', 'https://example/a-extra.webp', 'provider', 'image/webp'),
    ('a-visibility', 'card_image', 'variant-derived-asset', null, 'private', true, 'approved', 'approved', 'active', false, 'provider', 'https://example/private.webp', 'provider', 'image/webp'),
    ('a-public', 'card_image', 'variant-derived-asset', null, 'public_catalogue', false, 'approved', 'approved', 'active', false, 'provider', 'https://example/not-public.webp', 'provider', 'image/webp'),
    ('a-permission', 'card_image', 'variant-derived-asset', null, 'public_catalogue', true, 'review', 'approved', 'active', false, 'provider', 'https://example/review.webp', 'provider', 'image/webp'),
    ('a-rights', 'card_image', 'variant-derived-asset', null, 'public_catalogue', true, 'approved', 'review', 'active', false, 'provider', 'https://example/rights.webp', 'provider', 'image/webp'),
    ('a-retention', 'card_image', 'variant-derived-asset', null, 'public_catalogue', true, 'approved', 'approved', 'expired', false, 'provider', 'https://example/expired.webp', 'provider', 'image/webp'),
    ('a-deleted', 'card_image', 'variant-derived-asset', null, 'public_catalogue', true, 'approved', 'approved', 'active', true, 'provider', 'https://example/deleted.webp', 'provider', 'image/webp'),
    ('a-unavailable', 'card_image', 'variant-derived-asset', null, 'public_catalogue', true, 'approved', 'approved', 'active', false, 'unavailable', 'https://example/unavailable.webp', 'provider', 'image/webp'),
    ('a-logo', 'set_logo', 'variant-derived-asset', null, 'public_catalogue', true, 'approved', 'approved', 'active', false, 'provider', 'https://example/logo.webp', 'provider', 'image/webp')
),
cva(catalogue_version_id, asset_id, variant_id, printing_id) as (
  values
    ('ja-v1', 'a-cva-variant', 'variant-cva', null), ('ja-v1', 'a-cva-printing', null, 'printing-cva'),
    ('ja-v1', 'a-derived-cva', 'variant-derived-cva', null), ('ja-v1', 'a-derived-asset', null, null),
    ('ja-v1', 'a-dedupe', 'variant-derived-cva', null),
    ('ja-v1', 'a-asset-printing', null, null), ('ja-v1', 'a-cross', null, null), ('zh-tw-v2', 'a-cross', null, null),
    ('ja-v1', 'a-coalesce-extra', 'variant-unrequested', null),
    ('ja-v1', 'a-visibility', null, null), ('ja-v1', 'a-public', null, null), ('ja-v1', 'a-permission', null, null),
    ('ja-v1', 'a-rights', null, null), ('ja-v1', 'a-retention', null, null), ('ja-v1', 'a-deleted', null, null), ('ja-v1', 'a-unavailable', null, null),
    ('ja-v1', 'a-logo', null, null), ('draft-v', 'a-cross', null, null), ('old-v', 'a-cross', null, null)
),
manifest as (
  select c.catalogue_version_id, c.asset_id as asset_row_id, a.asset_type, a.external_url, a.attribution, a.mime_type,
         a.permission_status, a.rights_status, a.retention_status, a.storage_provider,
         coalesce(c.variant_id, a.variant_id) as variant_id,
         coalesce(c.printing_id, a.printing_id, av.printing_id) as printing_id
  from cva c join versions v on v.version_id = c.catalogue_version_id
  join assets a on a.asset_id = c.asset_id
  left join variants av on av.variant_id = coalesce(c.variant_id, a.variant_id)
  where v.published and not v.deprecated and a.visibility = 'public_catalogue' and a.publicly_servable
    and a.permission_status = 'approved' and a.rights_status = 'approved' and a.retention_status = 'active'
    and not a.deleted and a.storage_provider <> 'unavailable'
),
target_variants as materialized (
  select unnest(p.p_variant_ids) as variant_id from params p
  union
  select av.variant_id from variants av cross join params p where av.printing_id = any(p.p_printing_ids)
),
candidate_rows as materialized (
  select c.catalogue_version_id, c.asset_id from cva c join target_variants tv on tv.variant_id = c.variant_id
  union
  select c.catalogue_version_id, c.asset_id from cva c cross join params p where c.printing_id = any(p.p_printing_ids)
  union
  select c.catalogue_version_id, c.asset_id from assets a join cva c on c.asset_id = a.asset_id join target_variants tv on tv.variant_id = a.variant_id
  union
  select c.catalogue_version_id, c.asset_id from assets a join cva c on c.asset_id = a.asset_id cross join params p where a.printing_id = any(p.p_printing_ids)
),
current_members as (
  select m.* from manifest m cross join params p
  where m.asset_type = 'card_image'
    and (m.variant_id = any(p.p_variant_ids) or m.printing_id = any(p.p_printing_ids))
),
candidate_members as (
  select m.* from candidate_rows c
  cross join lateral (
    select m.* from manifest m cross join params p
    where m.catalogue_version_id = c.catalogue_version_id and m.asset_row_id = c.asset_id
      and m.asset_type = 'card_image'
      and (m.variant_id = any(p.p_variant_ids) or m.printing_id = any(p.p_printing_ids))
    offset 0
  ) m
),
differences as (
  select 'missing' as kind, to_jsonb(x) as row_data
  from (select * from current_members except all select * from candidate_members) x
  union all
  select 'unexpected', to_jsonb(x)
  from (select * from candidate_members except all select * from current_members) x
)
select (select count(*) from current_members) = 8 and not exists(select 1 from differences) as passed,
       (select count(*) from current_members) as expected_count,
       (select count(*) from candidate_members) as actual_count,
       coalesce(jsonb_agg(row_data) filter (where kind = 'missing'), '[]'::jsonb) as missing_rows,
       coalesce(jsonb_agg(row_data) filter (where kind = 'unexpected'), '[]'::jsonb) as unexpected_rows,
       (select jsonb_agg(to_jsonb(m) order by catalogue_version_id, asset_row_id) from candidate_members m) as delivery_rows
from differences;
