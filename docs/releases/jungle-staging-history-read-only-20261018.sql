-- PREPARATION ONLY. The previous five staging read approvals are consumed.
-- Expected external project: lmwfhvexfcoyeuoyrlco. Parent confirms connection.
-- One exact read-only follow-up: historical rows and collision keys for the
-- already observed English Jungle60 printing, one proposed fresh fixture UUID,
-- existing first-edition/normal taxonomy and affected non-internal triggers.
-- Include deprecated variants. No asset promotion, catalogue write or price/job.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
SET LOCAL idle_in_transaction_session_timeout='15s';
SET LOCAL search_path=pg_catalog;
SET LOCAL TIME ZONE 'UTC';
WITH variants AS MATERIALIZED (
 SELECT v.* FROM catalog.card_variants v
 WHERE v.id IN ('422c8895-963a-4593-aa8f-ebd7c197f512'::uuid,'2f89247e-d3cd-4ec0-88e3-baff0f60252c'::uuid)
   OR v.canonical_key='pokemon:en:739d2f18-1dd0-45dc-ba58-2195d5760ed5:60:first_edition'
   OR (v.printing_id='7f7c3925-368d-4cbc-8e37-415b6ceb4bda'::uuid AND v.variant_code='first_edition')
 ORDER BY v.id LIMIT 9
), taxonomy AS MATERIALIZED (
 SELECT t.* FROM catalog.variant_taxonomy t WHERE t.code IN ('normal','first_edition') ORDER BY t.code LIMIT 3
), finishes AS MATERIALIZED (
 SELECT f.* FROM catalog.finishes f WHERE f.code IN ('normal','first_edition') ORDER BY f.code LIMIT 3
), triggers AS MATERIALIZED (
 SELECT t.tgrelid::regclass::text AS relation,pg_get_triggerdef(t.oid,true) AS definition,t.tgenabled AS enabled,
   pg_get_functiondef(t.tgfoid) AS function_definition
 FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN (
  'catalog.card_variants'::regclass,'catalog.catalogue_version_variants'::regclass,'catalog.catalogue_version_assets'::regclass)
 ORDER BY t.tgrelid::regclass::text,t.tgname
), data AS (SELECT jsonb_build_object(
 'historicalVariants',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]'::jsonb) FROM variants v),
 'taxonomy',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.code),'[]'::jsonb) FROM taxonomy t),
 'finishes',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.code),'[]'::jsonb) FROM finishes f),
 'affectedTriggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.relation,t.definition),'[]'::jsonb) FROM triggers t),
 'fixtureId','422c8895-963a-4593-aa8f-ebd7c197f512','requiredCanonicalKey','pokemon:en:739d2f18-1dd0-45dc-ba58-2195d5760ed5:60:first_edition',
 'fixtureUuidCollision',EXISTS(SELECT 1 FROM variants WHERE id='422c8895-963a-4593-aa8f-ebd7c197f512'::uuid),
 'canonicalOrPrintingVariantCollision',EXISTS(SELECT 1 FROM variants WHERE canonical_key='pokemon:en:739d2f18-1dd0-45dc-ba58-2195d5760ed5:60:first_edition'
   OR (printing_id='7f7c3925-368d-4cbc-8e37-415b6ceb4bda'::uuid AND variant_code='first_edition')),
 'variantOverflow',(SELECT count(*) FROM variants)>=9,
 'taxonomyMissing',(SELECT count(*) FROM taxonomy WHERE code='first_edition')<>1
   OR (SELECT count(*) FROM finishes WHERE code='first_edition')<>1,
 'note','No mutation authority. Any collision, missing taxonomy, changed trigger or overflow holds the proposed fresh-fixture branch. Never resurrect or repurpose a historical/deprecated row automatically.'
) AS evidence)
SELECT evidence,encode(sha256(convert_to(evidence::text,'UTF8')),'hex') AS evidence_sha256 FROM data;
ROLLBACK;
