CREATE OR REPLACE FUNCTION api.card_image_manifest_for_identities(
  p_variant_ids uuid[],
  p_printing_ids uuid[],
  p_after_version_id uuid DEFAULT NULL::uuid,
  p_after_asset_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 1000
)
RETURNS SETOF api.asset_manifest
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
BEGIN
  IF p_variant_ids IS NULL OR p_printing_ids IS NULL
     OR cardinality(p_variant_ids) > 100 OR cardinality(p_printing_ids) > 100
     OR coalesce(array_ndims(p_variant_ids), 1) <> 1
     OR coalesce(array_ndims(p_printing_ids), 1) <> 1
     OR array_position(p_variant_ids, NULL) IS NOT NULL
     OR array_position(p_printing_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING errcode = '22023',
      message = 'Image identity arrays must be one-dimensional, non-null, and contain at most 100 non-null UUIDs each.';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Image page limit must be between 1 and 1000.';
  END IF;
  IF (p_after_version_id IS NULL) <> (p_after_asset_id IS NULL) THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Both image cursor UUIDs must be supplied together.';
  END IF;
  IF cardinality(p_variant_ids) = 0 AND cardinality(p_printing_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH target_variants AS MATERIALIZED (
    SELECT input.variant_id
    FROM unnest(p_variant_ids) AS input(variant_id)
    UNION
    SELECT v.id
    FROM catalog.card_variants v
    WHERE cardinality(p_variant_ids) = 0
      AND v.printing_id = ANY(p_printing_ids)
      AND v.deprecated_at IS NULL
  ), candidate AS MATERIALIZED (
    SELECT DISTINCT cva.catalogue_version_id, cva.asset_id
    FROM target_variants t
    JOIN catalog.catalogue_version_assets cva ON cva.variant_id = t.variant_id
    UNION
    SELECT cva.catalogue_version_id, cva.asset_id
    FROM catalog.catalogue_version_assets cva
    WHERE cardinality(p_variant_ids) = 0
      AND cva.printing_id = ANY(p_printing_ids)
  )
  SELECT
    COALESCE(a.asset_id, a.id::text) AS asset_id,
    a.asset_type,
    a.game_code,
    cva.set_id,
    cva.printing_id,
    cva.variant_id,
    a.storage_provider,
    a.storage_bucket,
    a.storage_key,
    a.url AS external_url,
    a.original_source_url,
    COALESCE(a.source_attribution, a.attribution_text) AS source_attribution,
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
    a.id AS asset_row_id
  FROM candidate c
  JOIN catalog.catalogue_version_assets cva
    ON cva.catalogue_version_id = c.catalogue_version_id
   AND cva.asset_id = c.asset_id
  JOIN catalog.catalogue_versions cv
    ON cv.id = cva.catalogue_version_id
   AND cv.status = 'published'
   AND cv.deprecated_at IS NULL
  JOIN catalog.assets a ON a.id = cva.asset_id
  WHERE a.asset_type = 'card_image'
    AND a.asset_visibility = 'public_catalogue'
    AND a.publicly_servable
    AND a.permission_status = 'approved'
    AND a.rights_status = 'approved'
    AND a.retention_status = 'active'
    AND a.deleted_at IS NULL
    AND a.storage_provider <> 'unavailable'
    AND (p_after_version_id IS NULL
      OR (cva.catalogue_version_id, a.id) > (p_after_version_id, p_after_asset_id))
  ORDER BY cva.catalogue_version_id, a.id
  LIMIT p_limit;
END;
$function$;
