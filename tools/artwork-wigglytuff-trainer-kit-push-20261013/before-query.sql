-- Read-only before/after evidence for the frozen eligible Wigglytuff subset.
-- Keep full returned metadata private, outside public workflow artifacts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH wanted AS (SELECT unnest(ARRAY['15572f14-5fe2-4292-9f91-4a8652948e80'::uuid,'05fb22b4-1b03-436c-8995-269b78da9698'::uuid,'84d04932-2d39-4b66-99c0-fc1e818bdf2d'::uuid,'78c83cb9-5797-4224-81c7-39647e6541e5'::uuid,'10d53a46-803e-47c6-877d-c6c613c9c482'::uuid,'2684b389-bc21-405e-8098-be441f213b44'::uuid,'bfc146cf-e450-4a82-931e-72f968f8e295'::uuid,'06115803-2387-4680-9ede-c33447a0ebf1'::uuid,'8b2c29d8-78d1-45e6-83b5-efcba8b6c516'::uuid,'adba1977-2831-4895-bed3-15b7b7f9f046'::uuid,'80e8eda0-0b0e-4899-9a41-b765e9dc3cfd'::uuid,'fadd2ece-41bd-47ca-a504-67cf4cfeb70a'::uuid,'23ff7220-0ea9-4dd2-b5b8-9c6c4ed45ed1'::uuid,'8664f43d-056e-437d-9251-265ffc9311a2'::uuid,'64ffb22c-ab18-4920-b276-f44ea9c5e94a'::uuid,'b7c81cdd-2686-459f-9379-54ae192df446'::uuid,'a4e26bd6-d017-4bfe-8a1e-bd4ebb363a9a'::uuid,'7ba96b99-6669-4ae4-a6ed-ab02bd9355ef'::uuid,'f22f43b0-7c14-419c-8f8e-b2bcc773b71d'::uuid,'cfa7a818-dabf-4095-8251-90871bfc2bfc'::uuid,'9fafc055-b666-48b4-8aed-d458481aea4f'::uuid,'40f8de48-b792-4e64-a8e5-0ab5f5e3fc38'::uuid,'77296c73-550e-41cf-a746-ec006a06708d'::uuid,'7476ae62-49c1-4329-9aa6-986b950c9d52'::uuid,'3efc0fe5-b47f-42b6-bc1e-1b0f7bdde21b'::uuid,'5252cb9f-a1cf-4fea-8218-150380d6f4bd'::uuid,'2ab90434-374a-4161-81ee-b518c66c9fea'::uuid,'80be77e4-352f-48ac-98ac-aa4865550e4a'::uuid]::uuid[]) AS id),
p AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),
v AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT 29),
n AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT 57),
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
