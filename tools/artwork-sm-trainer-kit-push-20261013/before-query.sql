-- Read-only current before/after evidence for exactly 30 eligible saved Sun and Moon trainer-kit printings.
-- Keep full returned metadata private, outside public workflow artifacts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH wanted AS (SELECT unnest(ARRAY['5e004631-1955-47b0-83f3-3605d186e0d2'::uuid,'9931006f-1117-4350-bb35-efba27c96966'::uuid,'a29e0f6a-dd90-4af4-bee4-59e950c48b0c'::uuid,'740b985b-4123-441e-bdc0-d04b622d2594'::uuid,'38346db4-0110-480f-875b-fac787ab4895'::uuid,'78523a91-22a5-432f-8d6b-90cc934e1d46'::uuid,'2a0f8be5-ff87-4204-9f41-16f041d93f86'::uuid,'02a8c514-128c-41aa-ac00-6bc152de0e4e'::uuid,'a1535139-0734-400d-a86e-0e0facdc3ba9'::uuid,'bd3c50db-e4cf-4ed9-8ba6-88cf98a57d69'::uuid,'a7ba5745-3c07-48ea-9c4f-796e2343a78d'::uuid,'4cd3c46b-1955-4ccf-a759-f824c1720279'::uuid,'4b351e1b-d0f1-44c8-889c-1f79859063a6'::uuid,'6d6a95fc-8ca3-4f1d-9278-185a21858bd1'::uuid,'b32f35f3-afd5-4c49-84fa-52c064a01619'::uuid,'8327292f-c734-4370-85a7-0a06584d237e'::uuid,'fac47d46-3198-4989-a5c4-d15c6c466398'::uuid,'6dd3ed47-90a1-4fba-8946-e6e6a86f3ff6'::uuid,'8610a792-cce7-4eeb-b6ae-69666a79cae7'::uuid,'f50688aa-2b52-4e3d-a23a-abec36fb4eac'::uuid,'78f35e8d-4760-4486-8857-659fadb07e92'::uuid,'136f8491-a6c8-4119-af65-b268204c0ded'::uuid,'1d38e69c-aa2d-4a8c-8235-0f7db66e48e3'::uuid,'61cba4cc-b89e-41b3-bbc2-2d948586d70f'::uuid,'bee1c1f4-ad97-4dbe-abc8-0fab0baf2ddb'::uuid,'9f38714a-4735-4ac5-9e15-29dfbeccd73f'::uuid,'e9504611-6a51-4d10-982c-563af39b428d'::uuid,'5442fd44-0fff-416d-893e-7f46a2ab7db9'::uuid,'eed66f68-e02b-4c0b-b986-bd447f59793a'::uuid,'b0ef3dda-751e-49c3-9d93-5e490416813f'::uuid]::uuid[]) AS id),
p AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),
v AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT 31),
n AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT 61),
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
