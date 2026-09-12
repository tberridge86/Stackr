CREATE OR REPLACE FUNCTION api.catalogue_set_card_rows(
  p_set_id uuid,
  p_language_code text DEFAULT NULL,
  p_after_variant_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 120
)
RETURNS TABLE(card_row jsonb, image_row jsonb)
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
), targets AS MATERIALIZED (
  SELECT s.variant_id AS source_variant_id, s.variant_id AS candidate_variant_id, 0 AS relation_type
  FROM selected s
  UNION ALL
  SELECT s.variant_id, s.same_artwork_as_variant_id, 1
  FROM selected s
  WHERE s.same_artwork_as_variant_id IS NOT NULL
), candidates AS MATERIALIZED (
  SELECT
    t.source_variant_id,
    t.relation_type,
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
    a.id AS asset_row_id,
    (
      a.storage_provider IN ('supabase_storage', 's3_compatible', 'local_dev')
      AND a.storage_key IS NOT NULL
      AND (
        SELECT count(DISTINCT d->>'role')
        FROM jsonb_array_elements(COALESCE(a.derivative_list, '[]'::jsonb)) d
        WHERE d->>'role' IN ('card-grid', 'search-result', 'detail-page')
      ) = 3
    ) AS app_ready
  FROM targets t
  JOIN catalog.catalogue_version_assets cva ON cva.variant_id = t.candidate_variant_id
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
), ranked AS MATERIALIZED (
  SELECT c.*,
    row_number() OVER (
      PARTITION BY c.source_variant_id
      ORDER BY
        CASE
          WHEN c.relation_type = 0 AND c.app_ready THEN 0
          WHEN c.relation_type = 1 AND c.app_ready THEN 1
          WHEN c.relation_type = 1 THEN 2
          ELSE 3
        END,
        c.asset_row_id
    ) AS rn
  FROM candidates c
)
SELECT
  to_jsonb(s) AS card_row,
  CASE WHEN r.asset_id IS NULL THEN NULL
    ELSE to_jsonb(r) - 'source_variant_id' - 'relation_type' - 'app_ready' - 'rn'
  END AS image_row
FROM selected s
LEFT JOIN ranked r
  ON r.source_variant_id = s.variant_id
 AND r.rn = 1
ORDER BY s.variant_id;
$function$;
