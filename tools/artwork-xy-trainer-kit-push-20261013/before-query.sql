-- Read-only before/after evidence for the frozen eligible XY subset.
-- Keep full returned metadata private, outside public workflow artifacts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH wanted AS (SELECT unnest(ARRAY['90e3c837-43c3-4030-b562-0f5468482f24'::uuid,'767740d5-8c5d-4da7-a266-88706eeddead'::uuid,'2a06c0d9-2cba-4936-96b1-241f49a4d5b1'::uuid,'ec056356-b258-4e45-9199-d074732983a5'::uuid,'ea080be0-5dc9-4fa4-bb71-b2c56e1dd38b'::uuid,'7f4726e6-2cea-4ffa-9393-b13a8e04f5b9'::uuid,'41416e4f-dba6-4102-af42-55aaae20b2dd'::uuid,'0b280b35-35de-4b74-ba66-d100c70aecbd'::uuid,'3ef2f7d9-5ac9-4196-8d8f-1fce8e3f79ec'::uuid,'5ef9e7c2-2554-49df-9c04-0616f1ff8805'::uuid,'d0e62137-8209-4c5e-95d1-9df9b538bf45'::uuid,'198e435c-42e8-4665-89db-b0cb8ca0fa00'::uuid,'31e40d30-c143-4633-9284-d9cddd1c826b'::uuid,'90ffb419-2dd2-4c8a-ad83-4e2ef74ae6c7'::uuid,'6349bf59-22db-4d09-9b5b-82a8434d2846'::uuid,'44813c0d-ba23-40f9-a708-d6e814ebfd55'::uuid,'e6a125b9-5c47-4e24-87a1-6d15664634a4'::uuid,'ab8556ce-16a0-437f-a003-14398cbd0ffe'::uuid,'34ee9f99-eef7-4466-aec6-b4b74ce6c272'::uuid,'07e0b301-0b21-47b2-8121-11d87818aecf'::uuid,'09f1b04a-b1de-436d-87f6-01ce812a6a2a'::uuid,'470c1b7d-360e-42d5-8d47-97bb1b1123a8'::uuid,'346834ec-c516-450b-94f6-8c2fa35e0d7c'::uuid,'cf876d71-863e-4a9d-9c9d-e766d99c5707'::uuid,'8b0536d8-d599-47ba-8d05-2750521af86c'::uuid,'0866b4c4-0db2-47a2-8dbe-4072f84dda47'::uuid,'daa532ac-cdbb-4077-9e45-281799aeb080'::uuid,'1eb614e6-e49d-4da5-be2d-e5938fca82be'::uuid,'01738d8b-45f5-494b-8c67-978549fa0a47'::uuid,'f3ce8a82-239d-4d64-ad98-fe99ee106ad0'::uuid,'bbe21b58-c37b-425e-9c17-24cc085b97e6'::uuid,'b10bfd91-c927-4685-a5db-a2c23d7861cd'::uuid,'a51e74a6-62ce-4b93-a1b7-6f25a2873424'::uuid,'d2db1993-e34e-4fca-9eca-ae241f297156'::uuid,'f8b19ee7-99e7-4475-a389-1f302c4074e2'::uuid,'c50e14c5-374b-4a7c-aa7b-7027800cd63c'::uuid,'0a75f5ce-e37a-408e-91d8-4e3524e99e20'::uuid,'b2175b9b-a246-4c32-8e39-4fb8d3f54091'::uuid,'ad2b8c57-0d00-49cd-a86f-efaa4f7b29d9'::uuid,'93b96720-51ed-478a-b750-bdf8bab4becc'::uuid,'9e338967-821b-4056-abcc-c3179a62f777'::uuid,'c5c67e6b-0774-482f-8c3d-8bf7cb762772'::uuid,'3d014e18-d406-4ff6-8af7-289241e7a834'::uuid,'e5794ef6-db20-402f-b15a-eaedbb5bb774'::uuid,'faaed3bc-bd99-4462-b620-6a18139f66cb'::uuid,'64698c96-9598-41c5-a4e6-fe409d3c5b8c'::uuid,'7d53e658-7997-4a16-907d-746f47e7d8ab'::uuid,'5e1218aa-4682-474b-9b9c-05791a2648bb'::uuid,'ae76c834-b7fd-4ee1-b35c-6bb322f7672b'::uuid,'123cb592-bcf1-420f-972f-2fa158e11acc'::uuid,'f9103807-6da5-4c3d-b094-6c8e81efb62f'::uuid,'3dac0e4a-945a-4b17-ad6a-fa6101fa9191'::uuid,'d8d9510f-8d02-4ae6-8bff-bda010520f82'::uuid]::uuid[]) AS id),
p AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),
v AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT 54),
n AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT 107),
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
