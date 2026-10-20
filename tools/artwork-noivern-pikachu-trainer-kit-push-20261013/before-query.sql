-- Read-only before/after evidence for the frozen eligible Noivern/Pikachu subset.
-- Keep full returned metadata private, outside public workflow artifacts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH wanted AS (SELECT unnest(ARRAY['a64649c7-5481-4262-9f6d-19146ebc17da'::uuid,'e4a4076e-f9c6-49ec-b999-9e19998d9299'::uuid,'ef087289-9a22-46f0-8b3d-24486698be4a'::uuid,'cddec383-5fbb-4d0e-b615-457d365a25e4'::uuid,'06a3de81-90d3-46e9-8316-bb2df51d7b85'::uuid,'3b186859-e003-4e33-b879-e58fd553d590'::uuid,'38a6a930-15cb-4206-99d5-23c454f525ec'::uuid,'88a1aa59-cf9b-4f6e-a4ff-0cf6350b4df9'::uuid,'bda9fd64-9330-40f5-8d15-3138cfb0a27b'::uuid,'c1007776-2b09-4bed-92a1-cf18b32bbea3'::uuid,'a897118d-12de-4778-85dd-92cbbf339956'::uuid,'42c049d3-130e-477a-bd1d-66b3493cdf3a'::uuid,'b6d78b75-1b07-462b-8c4e-5d553e311c81'::uuid,'3c966b39-f2e4-45fc-a4a8-bd7bf353aae9'::uuid,'b9bea178-9503-46b3-b53d-a8ac832563f7'::uuid,'fd41fb1b-5059-41a5-b4f1-ea3eda175172'::uuid,'3f1989ac-500d-476b-a763-3902f837f2c0'::uuid,'fb028221-f1ab-4927-a6b6-0ef8bab23542'::uuid,'4516a431-cd16-4edc-bc60-e797084f5791'::uuid,'710fdedf-e4c0-4644-bc38-29ebd59b1d6d'::uuid,'79f976e4-ebf1-4339-98a8-9bdbbfb2ec7b'::uuid,'6ab21e6d-7b31-4440-bdb9-c1df9f69a9b4'::uuid,'d830f22c-dd4e-488b-8f6f-a5281cf9765b'::uuid,'1e26cf8f-7226-4400-a5a7-70cb8ca8ddcf'::uuid,'ab59603a-0674-4004-8029-75aed356dc8c'::uuid,'45420540-f07d-4233-960d-a5eec8134ca6'::uuid,'9202c18e-fc60-45b5-ae01-5019c55388e9'::uuid,'cfad2949-a9e9-4c94-b169-7156e4b2f462'::uuid,'546591c2-7a20-42fd-b76b-f31aae9d0894'::uuid,'96597b5d-4f5f-4375-836e-03d65356ccd5'::uuid,'68d7c034-a370-4a11-9b9f-5522a785705e'::uuid,'f035319a-b3a4-40a8-a147-58af1d4d6195'::uuid,'bc75436d-caa3-48e8-800c-3b89aa6fb75c'::uuid,'e4191a8b-65a4-4f3d-8085-f96b88b80cc0'::uuid,'71fc3190-3696-48fc-a0f1-fb153fa17c8e'::uuid,'d4b7c9a6-162a-40ed-84a7-e51f85866e72'::uuid,'f0273ea0-35c4-400c-b8b8-82de9ad601d7'::uuid,'3c9b72f3-ee03-4944-a907-458d9ffb06a0'::uuid,'36a73193-6cce-473a-8101-88b9c55b517c'::uuid,'50ed6480-52a7-4b5d-8a9c-08d73c9dab9f'::uuid,'679c41d1-5715-4c5d-b8b1-254dc061d99c'::uuid,'e258ff6a-affc-46e5-91df-bb242e8e088b'::uuid,'63ad0e13-a340-4054-bf9f-8cc3c67fc9de'::uuid,'1fe187e5-165d-4fee-bffc-2aaac22b38e0'::uuid,'a9fc6e10-a365-497c-bb14-1714dd6bc778'::uuid,'04a6af12-fc3e-4524-a000-a1df29d1058d'::uuid,'32e51d81-14cc-46de-8f53-7fa474da50d2'::uuid,'4672cb98-7d8c-4092-9c3e-e9073795f22e'::uuid,'010a5353-13b5-4808-bd6c-abffdbdd1b0b'::uuid,'c8236c5b-b2b7-4dcd-aa7e-432d2cef83ee'::uuid,'42f9d816-5ea2-40e9-9299-c7af365db084'::uuid,'7ed53d2e-d054-4691-bdef-f97d735360e1'::uuid]::uuid[]) AS id),
p AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),
v AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT 53),
n AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT 105),
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
