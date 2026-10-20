-- Read-only before/after evidence for the frozen eligible Latios subset.
-- Keep full returned metadata private, outside public workflow artifacts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH wanted AS (SELECT unnest(ARRAY['b8995abc-c60e-4b75-ae84-ab95a03751ab'::uuid,'4131af6d-7ecb-4c50-8f4e-9d626f02860e'::uuid,'7a9841ed-1edd-4623-b521-21e6c884aed1'::uuid,'d35325cb-be43-43dc-93e9-7209e90ae951'::uuid,'dfa45d96-1d3a-4325-940c-04c312b6bb6a'::uuid,'0e596b27-e980-42da-8350-5a335cc0cab4'::uuid,'ffccaa4d-9eac-4cdf-8ef5-61e7d8b2c20e'::uuid,'ed7519d1-4ded-4b28-ad2c-03293de28c78'::uuid,'93cbb08f-4a6e-4172-a80a-b80b84729e15'::uuid,'c4c82782-0817-4304-815b-bcc0bba3db9b'::uuid,'ed70a282-9ca5-45f7-9893-542dd095d4e3'::uuid,'1944094d-be94-48cd-8682-8dd9bce0842c'::uuid,'1b88f418-7810-4493-bf55-f05e42babe7a'::uuid,'2b359ce3-debe-42f9-8cdc-9c479a90b565'::uuid,'21924cab-37db-4b49-b020-a7427277011f'::uuid,'8d9e1c3e-f093-476a-8f5c-9b3a00b9dd18'::uuid,'da08e921-01ee-4e70-b097-9e499048c7df'::uuid,'14bba03a-a2ae-4b85-8b66-28e6b46817a0'::uuid,'2edf6f8d-8922-4d4c-9e4c-b1cca68b08a6'::uuid,'5c2b19f9-5c00-48c6-b33b-2e7493a71456'::uuid,'3f2d8dd0-bd9e-4f5d-8d21-762c9e6f0019'::uuid,'fc44e2c4-134e-4f11-b260-94e8d7875d1d'::uuid,'fadcbc2e-280a-4e06-b8d3-9df9eb2c5a5a'::uuid,'7fb74e6f-6423-465d-ba75-08b22e7983bf'::uuid,'b6326b64-0046-4ab5-8cfd-9c8e4877750d'::uuid,'0a51e711-6be1-4ab9-8e6d-556c6d50bf25'::uuid,'5078d507-c568-45d6-b16f-092d5002a64b'::uuid,'b9765507-5583-4f38-b8a2-588c50ab9d12'::uuid,'6ec47968-da5f-4f44-a26a-b43051cfe7ae'::uuid,'e9e493c2-3e60-4f41-873a-1daf1edf2c56'::uuid,'ac36c2c3-659f-4fdc-8352-672a2ff5231e'::uuid,'298d0048-ff00-47e2-8a00-e3452309d2b4'::uuid]::uuid[]) AS id),
p AS MATERIALIZED (SELECT * FROM catalog.card_printings WHERE id IN (SELECT id FROM wanted)),
v AS MATERIALIZED (SELECT * FROM catalog.card_variants WHERE printing_id IN (SELECT id FROM wanted) LIMIT 33),
n AS MATERIALIZED (SELECT * FROM catalog.card_names WHERE printing_id IN (SELECT id FROM wanted) LIMIT 65),
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
