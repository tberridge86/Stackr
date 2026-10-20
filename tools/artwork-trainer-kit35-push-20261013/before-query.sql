-- Read-only current before/after evidence for exactly 35 trainer-kit printings.
-- Keep full returned metadata private, outside public workflow artifacts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH wanted AS (SELECT unnest(ARRAY['20a3ba24-8e99-42b5-9be2-a029d59f1850'::uuid,'9caf4d76-392a-47cd-a1b4-3428b275c249'::uuid,'c321148e-ad9d-439f-8cd7-bfcf122f6c8c'::uuid,'dc64adb6-bb7c-42e2-b065-e58b2050445a'::uuid,'b47fdfd7-2d73-4bd8-83ac-111803765596'::uuid,'529d141b-0b1f-4c33-997e-ba7fe1e27e28'::uuid,'cee8b124-be7d-41cf-a334-67e84c42dec2'::uuid,'deda41f1-002d-48d1-a470-54a48fae46e3'::uuid,'22c47863-ca79-4674-af6d-15ee728f8328'::uuid,'a9e30c22-3828-4d7b-9b1c-c9fd398d73f0'::uuid,'4d160caf-165e-4349-a958-0faaad378fa2'::uuid,'6acbe758-54d6-40b0-a0d6-d31eef9e726a'::uuid,'35dbf65e-b3fc-4032-8568-7b2bf88b5ed5'::uuid,'30b48c4e-4fcb-400e-b821-b651b199daad'::uuid,'1bf46b58-74f8-4608-8c28-10defe84df33'::uuid,'c78ec551-8858-49db-ae96-ce5375bb1570'::uuid,'1b2713b0-022a-4693-a6de-5f2d6eb30bb7'::uuid,'6335751c-8877-4aec-9a83-a04eb0e19dba'::uuid,'9ca4e77d-1615-4fea-a7c7-2ed843d60498'::uuid,'c0cd604b-bd6d-4bfe-987f-1de153538ac0'::uuid,'94b3f4e6-2de9-469f-8198-c37857498d31'::uuid,'873a1e7f-2e12-4c37-9f1d-6e8a73c7c0e3'::uuid,'4a6b3ede-aa23-41a6-972e-ba13ec61c4f1'::uuid,'e8dad291-4ef4-4a9f-ae97-21360fd3dd6a'::uuid,'cd3e2c56-8283-4802-8b51-c66b1668c0e2'::uuid,'40dd82e3-4fd8-41d7-946c-111832146acc'::uuid,'04b0987e-c977-4689-b3c7-5392bcf770f6'::uuid,'6666d35c-51e6-4b5e-83de-3cb753f22d8c'::uuid,'654e6235-2dbc-49cc-b102-481d960686bf'::uuid,'737b730b-52ea-4898-a9cc-03a090126fec'::uuid,'bd894c5c-9ebe-48f1-a399-47d493a581a1'::uuid,'bc149f9f-7851-4989-8f4f-a7449cd12f23'::uuid,'7649a75d-4ed3-4aa9-9e79-465984c1b29c'::uuid,'7a1143ff-7525-4c55-a369-19405f2951fa'::uuid,'5ac040e9-d175-4916-9a22-e67d2c66e4fe'::uuid]::uuid[]) AS id),
p AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),
v AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT 36),
n AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT 71),
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
