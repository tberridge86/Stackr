-- REVIEW-ONLY parameterized SELECT; not a migration or an installed RPC.
-- $1 = requested variant UUIDs (including explicit artwork aliases).
-- $2 = requested printing UUIDs. Bound each request to its backend page.
-- Execute only through an authorized parameter-binding read-only connection.
-- Do not interpolate unvalidated request text or narrow by set/language/version.
-- This candidate did not complete before the sampled JA page's five-second deadline.
-- See docs/historical-asset-query-recovery.md before considering activation.

WITH target_variants AS MATERIALIZED (
  SELECT unnest($1::uuid[]) AS variant_id
  UNION
  SELECT id FROM catalog.card_variants
  WHERE printing_id = ANY($2::uuid[])
), candidate AS MATERIALIZED (
  -- Expansion above includes both direct and variant-inherited printing IDs.
  SELECT cva.catalogue_version_id, cva.asset_id
  FROM catalog.catalogue_version_assets cva
  JOIN target_variants t ON t.variant_id = cva.variant_id
  UNION
  SELECT cva.catalogue_version_id, cva.asset_id
  FROM catalog.catalogue_version_assets cva
  WHERE cva.printing_id = ANY($2::uuid[])
  UNION
  SELECT cva.catalogue_version_id, cva.asset_id
  FROM catalog.assets a
  JOIN target_variants t ON t.variant_id = a.variant_id
  JOIN catalog.catalogue_version_assets cva ON cva.asset_id = a.id
  UNION
  SELECT cva.catalogue_version_id, cva.asset_id
  FROM catalog.assets a
  JOIN catalog.catalogue_version_assets cva ON cva.asset_id = a.id
  WHERE a.printing_id = ANY($2::uuid[])
)
SELECT m.*
FROM candidate c
CROSS JOIN LATERAL (
  SELECT m.* FROM api.asset_manifest m
  WHERE m.catalogue_version_id = c.catalogue_version_id
    AND m.asset_row_id = c.asset_id
    AND m.asset_type = 'card_image'
    AND (m.variant_id = ANY($1::uuid[]) OR m.printing_id = ANY($2::uuid[]))
  -- Preserve the selective candidate-to-view lookup in the measured plan.
  OFFSET 0
) m
ORDER BY m.catalogue_version_id, m.asset_row_id;
