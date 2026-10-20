-- Read-only before/after evidence for the frozen eligible Yellow A subset.
-- Keep full returned metadata private, outside public workflow artifacts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH wanted AS (SELECT unnest(ARRAY['8a4dd5f6-ed5a-4d09-babf-85572f6eea0a'::uuid,'f4c6af1e-70c0-48fe-b3a1-1d04059b1051'::uuid]::uuid[]) AS id),
p AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),
v AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT 3),
n AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT 5),
a AS MATERIALIZED (
 SELECT * FROM catalog.assets
 WHERE printing_id IN (SELECT id FROM wanted) OR variant_id IN (SELECT id FROM v)
 OR (printing_id IS NULL AND variant_id IS NULL AND set_id IN (SELECT set_id FROM p)) LIMIT 201
),
l AS MATERIALIZED (
 SELECT * FROM catalog.catalogue_version_assets
 WHERE printing_id IN (SELECT id FROM wanted) OR variant_id IN (SELECT id FROM v)
 OR asset_id IN (SELECT id FROM a)
 OR (printing_id IS NULL AND variant_id IS NULL AND set_id IN (SELECT set_id FROM p)) LIMIT 201
)
SELECT 'printings' AS scope,id::text AS identity,to_jsonb(p) AS payload FROM p
UNION ALL SELECT 'variants',id::text,to_jsonb(v) FROM v
UNION ALL SELECT 'names',id::text,to_jsonb(n) FROM n
UNION ALL SELECT 'sets',s.id::text,to_jsonb(s) FROM catalog.sets s WHERE id IN (SELECT set_id FROM p)
UNION ALL SELECT 'assets',a.id::text,to_jsonb(a) FROM a
UNION ALL SELECT 'links',l.catalogue_version_id::text||':'||l.asset_id::text,to_jsonb(l) FROM l
UNION ALL SELECT 'sources',s.id::text,to_jsonb(s) FROM ingest.sources s WHERE code='scrydex'
ORDER BY scope,identity;
ROLLBACK;
