-- Read-only current before/after evidence for the exact 57 printing fronts.
-- Keep returned full metadata private, outside public workflow artifacts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH wanted AS (SELECT unnest(ARRAY['e2e03892-7792-4195-a3d5-917d3d04ba9d'::uuid,'895f5de7-527b-4a67-a95a-6f75b6ff5452'::uuid,'a206a552-23c9-4558-b54e-990e59ed42b8'::uuid,'24fcd196-8056-4b9f-9fa4-a94590cdb4d5'::uuid,'0a27fb89-d6c5-4bbf-90d6-3111d2574ef4'::uuid,'3d897c9b-99c6-4abe-b233-b5145f470013'::uuid,'72cece9a-2978-4478-859f-912e1b08ae00'::uuid,'35fddea9-a70b-4478-8b43-08f1ea8a7b73'::uuid,'d27027b7-46b7-42d8-bd21-0f44c6003a2c'::uuid,'6407ff5f-2add-4515-94a9-67d07f7f7a0b'::uuid,'1fa68b34-4090-49e4-9857-41d43fcb53dd'::uuid,'a9c768fd-31a6-44e4-9e5d-c0016da64b8d'::uuid,'07b44a1b-8c2b-4d83-8141-d334cbe41994'::uuid,'dc88d95a-0c3d-40a4-a59f-98b0b30b992b'::uuid,'4d0c8e02-78b5-4435-b2b4-d01f2cca35e3'::uuid,'c2b37b78-465f-4f1e-a02f-5f3f6055c5a7'::uuid,'732098e1-0173-41b2-b07d-d963edad591f'::uuid,'d123ca53-7b70-4fec-a2da-5feb23526be4'::uuid,'f51bca2f-f1ec-40a6-8ab9-8d18dd69ef5d'::uuid,'d1bc82eb-b6f3-4c0a-92ad-0c8fd338939b'::uuid,'7e79424d-2079-4c1b-bda0-497352562653'::uuid,'2934f39a-83d8-49d5-8d0a-16e126ee4e42'::uuid,'880d6c79-5308-49db-9ec5-7e99de0bbc1a'::uuid,'1b8daad4-42d9-4570-833b-ca8907068e4c'::uuid,'6dca81d6-43cc-4e11-946f-b0b4baf1b7da'::uuid,'971673ab-3e34-46b5-8991-3c1dd91547f6'::uuid,'bb31fd6e-30fb-4fc0-ac22-50f1c92aa89c'::uuid,'6bb53054-3354-4c97-99a8-17d94c19c30b'::uuid,'94d35af0-479f-4b47-94b5-e08a6b65ae11'::uuid,'4b735e37-6328-4f18-a466-81ea9a199f2b'::uuid,'176e40f6-7f10-414a-bfed-cb74c3cd1b5e'::uuid,'5cd95964-1c96-407c-ba1b-e222a2c5d9e5'::uuid,'a8838cd2-2d09-41dc-9aa1-ac00155dff6e'::uuid,'0d044d0e-6560-4954-9ff9-b6b720700bc4'::uuid,'ddd527b2-6968-4ef4-a7e4-ce8ebaf67df5'::uuid,'79b9e780-156c-4bf2-aeff-f8fe4a0f2988'::uuid,'440d8566-173d-4509-89aa-a0f7487b287a'::uuid,'31445437-6835-4f5b-8f09-cc53f982d10c'::uuid,'3ed90597-9ed0-4cba-a787-d524986eeb0a'::uuid,'78dd02c6-e10a-4efa-8ffc-8e4aeb38f432'::uuid,'898a37a8-bc31-4ee3-b1a7-61a4fa7df897'::uuid,'f96f5544-e088-4211-bb6f-491b6f9578f8'::uuid,'3a706357-349b-4e00-b96e-563468425b6b'::uuid,'d119f75d-0c19-4fce-b547-024923fbcf57'::uuid,'45c6f48e-5d9f-4759-b938-93d942b19160'::uuid,'2c72e7de-2314-4c19-a225-da1a0da92ecc'::uuid,'cf2cc1a5-68bb-4df1-8b74-2c98d1e3523e'::uuid,'0fa0f11b-897b-45d6-9dab-afd988b6adaf'::uuid,'82727996-25b6-4cfd-866a-145fb4ed86eb'::uuid,'07143750-5608-4d23-8976-0a1f19a11be9'::uuid,'6e5e7974-2464-430e-9599-51b28daedaab'::uuid,'2f24f6f6-9529-40b4-b6ad-d77346caeb0e'::uuid,'bb3a3e75-2d6d-409d-8f61-5abc3447c647'::uuid,'0c682820-985f-4845-acde-72e6615fa469'::uuid,'25f87aa8-5630-4d01-ad2a-6bd43fae0d8d'::uuid,'681ee223-8a08-478b-876f-1cf622a586ef'::uuid,'894e008f-f38b-48c4-a096-f59fdbba495b'::uuid]::uuid[]) AS id),
p AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),
v AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT 82),
n AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT 163),
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
UNION ALL SELECT 'sources',s.id::text,to_jsonb(s) FROM ingest.sources s WHERE code IN ('scrydex','limitless')
ORDER BY scope,identity;
ROLLBACK;
