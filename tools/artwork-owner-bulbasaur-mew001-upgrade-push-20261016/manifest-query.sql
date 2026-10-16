-- Complete bounded base-table closure; 5/21/41 rows are rejection sentinels.
WITH target_variants AS MATERIALIZED (
 SELECT id FROM catalog.card_variants WHERE printing_id=ANY($1::uuid[]) OR id=ANY($2::uuid[]) ORDER BY id LIMIT 5
), base_assets AS MATERIALIZED (
 SELECT id FROM catalog.assets WHERE printing_id=ANY($1::uuid[]) OR variant_id IN(SELECT id FROM target_variants) OR id=ANY($3::uuid[]) ORDER BY id LIMIT 21
), scoped_links AS MATERIALIZED (
 SELECT asset_id,catalogue_version_id FROM catalog.catalogue_version_assets WHERE asset_id IN(SELECT id FROM base_assets) OR printing_id=ANY($1::uuid[]) OR variant_id IN(SELECT id FROM target_variants) ORDER BY catalogue_version_id,asset_id LIMIT 41
)
SELECT jsonb_build_object(
 'variant_ids',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM target_variants),'[]'::jsonb),
 'base_asset_ids',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM base_assets),'[]'::jsonb),
 'link_rows',COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY catalogue_version_id,asset_id) FROM scoped_links l),'[]'::jsonb)
) AS scope;
