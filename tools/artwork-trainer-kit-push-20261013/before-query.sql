-- Read-only current before/after evidence for exactly 48 trainer-kit printings.
-- Keep full returned metadata private, outside public workflow artifacts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH wanted AS (SELECT unnest(ARRAY['9b365a5e-1038-49b0-aade-4b332440fe6a'::uuid,'e0dc898e-99b7-4c65-8ad2-47cca732c426'::uuid,'0ae2446f-b90c-462e-9511-4060f1ba5e95'::uuid,'03d83023-8d9e-4b7d-a4bf-4a1419178944'::uuid,'07c2a5ad-ef7b-4cc4-af58-ec98d54e4f6b'::uuid,'94ccccfc-0613-40b6-b752-046bd1ca6053'::uuid,'f19f2180-fd49-4259-b932-5a865689b0e9'::uuid,'168b76ae-1ef0-4229-af53-6c1f1d836fc7'::uuid,'900823f6-be7a-418b-a022-c04edd35caa6'::uuid,'f57c5c60-e548-4f8a-b982-7b9e9ae98ea3'::uuid,'15ff0c4b-de6c-435a-81fd-7a1d06fa38c2'::uuid,'8fd129d6-2772-45be-916e-fbd8009fb9cd'::uuid,'4faf85ca-9cbf-488e-ae4f-91cba4289383'::uuid,'0ef5c2a0-c730-4397-a39d-c2bc456446a7'::uuid,'438ba40a-d59c-4e88-a919-028962dbbeb4'::uuid,'a763217a-4520-4368-aeac-35fe2ffd0d1a'::uuid,'ce3b151f-4d5b-4610-bfe7-21a7e2ec7a9a'::uuid,'7d7c6e4f-ecde-43e7-b178-c74a5d0aad4a'::uuid,'e11f115a-78fb-4b1e-ace1-b9d724f36366'::uuid,'37f4fe50-53d3-4862-9976-c198eb5c6a9d'::uuid,'620d06b4-45c4-4c56-886f-7e23aff0d09e'::uuid,'0f758b29-af25-4dde-af5a-d151ce9ee260'::uuid,'7ee30ea0-2823-4f38-9446-985f02ef5437'::uuid,'add5c58b-f1ad-4000-aba8-45a221f592e3'::uuid,'84e5f2bb-03b5-42cb-af2e-15dab56669a0'::uuid,'1bc0725b-ac6f-456a-bb8f-584429fb692f'::uuid,'345851a8-2183-407a-a050-27d99bdbb580'::uuid,'4f3a578d-d1db-49a9-aab5-903e2c58a11a'::uuid,'b60b149b-453b-4e2a-a9e9-a6f1eb5e724d'::uuid,'ee4a30ba-a2db-4c9d-8591-a2ccd40c5e44'::uuid,'8986a388-3f2b-4b87-aef5-192ee1824fda'::uuid,'2277f4c1-398d-42cf-a3f6-e3ffd69b22cb'::uuid,'b9e0c7aa-37c5-4e1f-833a-ae5fe2e9b7fe'::uuid,'2c991e41-0d9c-4826-aa1f-837d2ebb0b5a'::uuid,'71b06e4f-015c-4ab5-8d6c-4430adbfa99b'::uuid,'73d1695f-001c-4997-9c25-70e63a4db95b'::uuid,'3698718f-8226-41d3-995f-059b7884b462'::uuid,'f4e525ab-39b4-4b0b-a7a1-43a2e9c46595'::uuid,'3e33c0f3-264f-48b6-8784-efd56e4979d8'::uuid,'cd920ddd-90bb-4f31-abc7-77aa5ac8925c'::uuid,'04de0d36-152b-4c5c-b1e0-29fffad0ef4e'::uuid,'e34ca81a-5cc7-40d4-8e37-ff64317c91ff'::uuid,'cec83a2d-a809-4e9d-8540-1e5b66ed77f9'::uuid,'94ecb3dd-ae61-41c2-894e-daf12e01f671'::uuid,'3b22c400-1c7e-45e0-a7f3-ee9258e1abb2'::uuid,'f0ef382f-61bb-46e9-a1c7-5994cec4c075'::uuid,'36bc09ca-a219-4272-a463-bfcc46f36ba6'::uuid,'e1beca80-dc20-43db-aeb0-65ea358e11a4'::uuid]::uuid[]) AS id),
p AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),
v AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT 49),
n AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT 97),
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
