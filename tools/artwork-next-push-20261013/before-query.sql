-- Read-only current before evidence for the exact 10 queued printings.
-- Run independently against production and staging; keep returned rows private.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH wanted AS (SELECT unnest(ARRAY['90883e5c-8ae1-49fc-9bdb-064b92b1eedf'::uuid,'411b039e-87d2-4cf8-b667-ba15c9f219ad'::uuid,'494bd2bf-159c-4b9d-9959-5acdf99372ae'::uuid,'4c902586-66f4-4e88-b18f-9e30ef360529'::uuid,'fce8366f-fdf3-4e52-85c3-a0a39dbd8324'::uuid,'456430be-5645-45db-872a-7c7e25717b66'::uuid,'5181a179-8f7b-42ce-a638-bfa4bef25a2b'::uuid,'9fbfab2c-7661-4508-a8b0-110013c3d717'::uuid,'da0a1e6b-e976-48f2-8c5c-e7d663b3bdcd'::uuid,'c0310180-d61b-4e80-a649-23fcf35fa437'::uuid]::uuid[]) AS id),
p AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),
v AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted)),
a AS MATERIALIZED (
 SELECT * FROM catalog.assets
 WHERE printing_id IN (SELECT id FROM wanted) OR variant_id IN (SELECT id FROM v)
 OR (printing_id IS NULL AND variant_id IS NULL AND set_id IN (SELECT set_id FROM p))
),
l AS MATERIALIZED (
 SELECT * FROM catalog.catalogue_version_assets
 WHERE printing_id IN (SELECT id FROM wanted) OR variant_id IN (SELECT id FROM v)
 OR asset_id IN (SELECT id FROM a)
 OR (printing_id IS NULL AND variant_id IS NULL AND set_id IN (SELECT set_id FROM p))
)
SELECT 'printings' AS scope,id::text AS identity,to_jsonb(p) AS payload FROM p
UNION ALL SELECT 'variants',id::text,to_jsonb(v) FROM v
UNION ALL SELECT 'names',n.id::text,to_jsonb(n) FROM catalog.card_names n WHERE printing_id IN (SELECT id FROM wanted)
UNION ALL SELECT 'sets',s.id::text,to_jsonb(s) FROM catalog.sets s WHERE id IN (SELECT set_id FROM p)
UNION ALL SELECT 'assets',a.id::text,to_jsonb(a) FROM a
UNION ALL SELECT 'links',l.catalogue_version_id::text||':'||l.asset_id::text,to_jsonb(l) FROM l
ORDER BY scope,identity;
ROLLBACK;

