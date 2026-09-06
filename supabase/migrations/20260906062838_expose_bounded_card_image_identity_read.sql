-- Backend-only, bounded, read-only artwork lookup. No catalogue facts change.
-- Every returned row still comes from the unchanged security-invoker manifest.
create or replace function api.card_image_manifest_for_identities(
  p_variant_ids uuid[],
  p_printing_ids uuid[],
  p_after_version_id uuid default null,
  p_after_asset_id uuid default null,
  p_limit integer default 1000
)
returns setof api.asset_manifest
language plpgsql
stable
security invoker
set search_path = ''
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
  WITH target_variants AS MATERIALIZED (
  SELECT unnest(p_variant_ids) AS variant_id
  UNION
  SELECT id FROM catalog.card_variants
  WHERE printing_id = ANY(p_printing_ids)
), candidate AS MATERIALIZED (
  -- Expansion above includes both direct and variant-inherited printing IDs.
  SELECT cva.catalogue_version_id, cva.asset_id
  FROM catalog.catalogue_version_assets cva
  JOIN target_variants t ON t.variant_id = cva.variant_id
  UNION
  SELECT cva.catalogue_version_id, cva.asset_id
  FROM catalog.catalogue_version_assets cva
  WHERE cva.printing_id = ANY(p_printing_ids)
  UNION
  SELECT cva.catalogue_version_id, cva.asset_id
  FROM catalog.assets a
  JOIN target_variants t ON t.variant_id = a.variant_id
  JOIN catalog.catalogue_version_assets cva ON cva.asset_id = a.id
  UNION
  SELECT cva.catalogue_version_id, cva.asset_id
  FROM catalog.assets a
  JOIN catalog.catalogue_version_assets cva ON cva.asset_id = a.id
  WHERE a.printing_id = ANY(p_printing_ids)
)
SELECT m.*
FROM candidate c
CROSS JOIN LATERAL (
  SELECT m.* FROM api.asset_manifest m
  WHERE m.catalogue_version_id = c.catalogue_version_id
    AND m.asset_row_id = c.asset_id
    AND m.asset_type = 'card_image'
    AND (m.variant_id = ANY(p_variant_ids) OR m.printing_id = ANY(p_printing_ids))
  -- Preserve the selective candidate-to-view lookup in the measured plan.
  OFFSET 0
) m
WHERE p_after_version_id IS NULL
   OR (m.catalogue_version_id, m.asset_row_id) > (p_after_version_id, p_after_asset_id)
ORDER BY m.catalogue_version_id, m.asset_row_id
LIMIT p_limit;
end;
$function$;

revoke all on function api.card_image_manifest_for_identities(uuid[], uuid[], uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function api.card_image_manifest_for_identities(uuid[], uuid[], uuid, uuid, integer)
  to service_role;

comment on function api.card_image_manifest_for_identities(uuid[], uuid[], uuid, uuid, integer) is
  'Bounded service-backend card-image read. Preserves all approved published direct and inherited asset identities through api.asset_manifest; does not change stored data.';
