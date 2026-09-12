CREATE OR REPLACE FUNCTION api.catalogue_set_cards_bundle(
  p_set_id uuid,
  p_language_code text DEFAULT NULL,
  p_after_variant_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
WITH selected AS MATERIALIZED (
  SELECT c.*
  FROM api.catalogue_cards c
  WHERE c.set_id = p_set_id
    AND (p_language_code IS NULL OR c.language_code = p_language_code)
    AND (p_after_variant_id IS NULL OR c.variant_id > p_after_variant_id)
  ORDER BY c.variant_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 120), 1), 500) + 1
), target_variants AS MATERIALIZED (
  SELECT s.variant_id FROM selected s
  UNION
  SELECT s.same_artwork_as_variant_id
  FROM selected s
  WHERE s.same_artwork_as_variant_id IS NOT NULL
), asset_rows AS MATERIALIZED (
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
  FROM target_variants t
  JOIN catalog.catalogue_version_assets cva ON cva.variant_id = t.variant_id
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
)
SELECT jsonb_build_object(
  'rows', COALESCE((
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.variant_id)
    FROM selected s
  ), '[]'::jsonb),
  'assets', COALESCE((
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.catalogue_version_id, a.asset_row_id)
    FROM asset_rows a
  ), '[]'::jsonb)
);
$function$;
