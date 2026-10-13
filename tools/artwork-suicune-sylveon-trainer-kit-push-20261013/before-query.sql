-- Read-only before/after evidence for the frozen eligible Suicune/Sylveon subset.
-- Keep full returned metadata private, outside public workflow artifacts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH wanted AS (SELECT unnest(ARRAY['b2db7f0f-bea6-4133-870d-74e8de0e998a'::uuid,'bdc5dc0d-673d-42d2-a82c-b74f20fe5f7e'::uuid,'e2aba3d6-b018-4103-9258-92dfdc4b7832'::uuid,'abccea61-8dba-447d-b446-0bd20f36f4ba'::uuid,'97ebc468-d31e-4547-8470-c1a0acad7ae5'::uuid,'3429c3d6-cffc-4cc3-b71f-c1914a1a3619'::uuid,'9b8133b7-ad14-42cb-b914-f5cbdb5e8c0b'::uuid,'0579f81f-8c1a-42c6-bdf3-3c5638233efc'::uuid,'d49f2a24-ae5c-4ff4-92c1-de90bd1e491e'::uuid,'b3de6315-03db-49a3-8227-8ccd8a0ce10d'::uuid,'48c5dd4a-25ae-4271-a42a-b0603a92e3de'::uuid,'324d943c-a813-4107-ab04-c2d61f12b06f'::uuid,'b836a658-1cb8-4ce0-a19d-33e584158ec6'::uuid,'1d70b9d0-2c26-4b26-8de2-e1e5962f2ebf'::uuid,'d4767396-f6b5-4918-94d6-73295df5391d'::uuid,'3810e52c-e820-49de-9f0a-c19d66fadad7'::uuid,'d476fe6f-f616-482d-a274-2a0c35a5a066'::uuid,'cb9cf895-ee72-445a-9402-282046ca3e59'::uuid,'c38ee5dc-5594-4561-aea3-9754b2af6208'::uuid,'fc101e0f-4c38-42cd-a8b9-de4f837e7673'::uuid,'4dc036f6-343c-42d3-aae5-da0ffa007503'::uuid,'91323421-73e3-409c-8c67-b0d7f2f9d55e'::uuid,'6a9e1f9a-f50f-4d1c-ade3-7befbcd70842'::uuid,'4012dc15-cb5a-4ad8-9340-7711d2da7f86'::uuid,'1ff39e29-941d-4a63-af95-d355bbf568dc'::uuid,'434cc7ae-9a89-4997-a8fb-037c640ab485'::uuid,'5c19952c-b579-4053-b507-845ac1279fba'::uuid,'4437be74-8eca-45e9-b26b-566aa21ea490'::uuid,'a25422c1-7f25-47b8-ac38-684f031ab6f6'::uuid,'4294d508-52c8-4284-ad8e-0d03660cb845'::uuid,'15587724-107d-43da-9e1a-33d6b4b2f993'::uuid,'8a78048d-e33c-4fa9-8579-8198d2ed8be3'::uuid,'42c5e484-f71a-4a36-a064-e9bc7def1b12'::uuid,'76b24fef-d692-40af-8a3f-82bb564c379d'::uuid,'7a64fa6a-93d2-4011-85f6-cc972e5c917c'::uuid,'aa5afff2-f878-4b12-bc44-7c2501865dd4'::uuid,'df6e1241-8607-4545-b748-d67c6eb6e78f'::uuid,'9dedf489-bc99-4e83-944e-a06f68d3aa3e'::uuid,'cae84be4-5560-4e32-9544-a62e4254e452'::uuid,'80b33abd-9bf7-411f-984e-28d5c4c45d68'::uuid,'078742cd-6333-46ff-84f6-310ed0c6abd0'::uuid,'575ca6d6-620b-4131-88e9-5fea7097d96c'::uuid,'a9a92fa2-c116-45bc-a2e6-c58307fe7dcf'::uuid,'43045c37-839d-4e3b-9554-f5cdb55a8b20'::uuid,'0e9298bd-74c5-48f8-8323-5c0a4911a0af'::uuid,'5db233df-ba25-40e9-b4a6-663ed2120ec3'::uuid,'eea25be7-dbfb-417b-9a7b-e14e4c05da62'::uuid,'d657bf06-8d28-470e-b568-408797733d39'::uuid,'4b139f27-b3a8-4819-b214-65fb59ed0dc5'::uuid,'464f4750-2b3c-42e1-8448-7f3da93cf893'::uuid,'e95cfd43-49a0-4ee1-9b1c-2d54c05bd0aa'::uuid,'6c9284da-425a-4105-a62e-8ccdb5581423'::uuid,'18949c4f-ed23-4ab9-96be-9e945c5797ee'::uuid,'4139bd95-c582-40cf-a021-1b268d80318d'::uuid,'85833469-4229-448d-adfb-a3c068702aae'::uuid,'bd25b1df-e903-4c31-8f9a-4f7365d51bc8'::uuid,'150d0ee5-9429-4cf0-8707-7ffe266b8b0f'::uuid,'46f3d410-0617-40ed-bbc5-08587d95c90e'::uuid,'9d00655f-8fda-4d30-a011-c0229a9e9029'::uuid,'5ee5fd0e-f801-437b-8a2b-5e3228e397de'::uuid]::uuid[]) AS id),
p AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),
v AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT 61),
n AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT 121),
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
