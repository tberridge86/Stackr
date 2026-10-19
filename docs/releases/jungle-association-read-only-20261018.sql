-- Jungle Pikachu #60, English, first_edition: prepared 18 October 2026.
-- EXPECTED target: Supabase production oakdbbzdqwurpjnoqhmu; the connection/project
-- must be independently confirmed by the release owner. This comment is not proof.
-- Public asset ID is TEXT and is NOT assumed to equal catalog.assets.id (UUID).
-- No collector tables, prices, jobs, network calls, EXPLAIN ANALYZE or data writes.
-- Keep results private: the one asset's licensing notes and source URL are needed
-- for review, not public API fields. Do not publish raw licensing notes/receipts.
-- Each statement has a 5-second limit. A failure aborts this transaction: ROLLBACK.
-- This is a proposal requiring the owner's explicit remote-script authorization.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
SET LOCAL search_path = pg_catalog;
SET LOCAL TIME ZONE 'UTC';

-- Q1. Confirm read-only execution context; no project identity is inferred here.
SELECT clock_timestamp() AS observed_at_utc, current_database() AS database_name,
  current_user AS executing_role, current_setting('server_version') AS server_version,
  current_setting('transaction_read_only') AS transaction_read_only,
  current_setting('statement_timeout') AS statement_timeout;

-- Q2. Exact relation definitions, write triggers and constraints; no row scan.
WITH contract AS (SELECT jsonb_build_object(
  'assetManifestDefinition', pg_get_viewdef('api.asset_manifest'::regclass, true),
  'updatedAtFunction', pg_get_functiondef('audit.set_updated_at()'::regprocedure),
  'writeTriggers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'relation', t.tgrelid::regclass::text, 'definition', pg_get_triggerdef(t.oid, true),
      'enabled', t.tgenabled) ORDER BY t.tgrelid::regclass::text, t.tgname), '[]'::jsonb)
    FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN (
      'catalog.assets'::regclass, 'catalog.card_variants'::regclass,
      'catalog.catalogue_version_assets'::regclass)),
  'columns', (SELECT jsonb_agg(jsonb_build_object('relation', a.attrelid::regclass::text,
      'column', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notNull', a.attnotnull)
      ORDER BY a.attrelid::regclass::text, a.attnum)
    FROM pg_attribute a WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attrelid IN (
      'catalog.assets'::regclass, 'catalog.card_variants'::regclass,
      'catalog.catalogue_version_assets'::regclass)),
  'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object('relation', c.conrelid::regclass::text,
      'name', c.conname, 'definition', pg_get_constraintdef(c.oid, true))
      ORDER BY c.conrelid::regclass::text, c.conname), '[]'::jsonb)
    FROM pg_constraint c WHERE c.conrelid IN ('catalog.catalogue_version_assets'::regclass,
      'catalog.card_variants'::regclass))
))
SELECT contract.jsonb_build_object AS contract,
  encode(sha256(convert_to((contract.jsonb_build_object)::text, 'UTF8')), 'hex') AS contract_sha256 FROM contract;

-- Q3. Exactly one known asset, version, printing and selected/alias variant.
-- LIMIT 9 is an overflow sentinel: 9 entries means HOLD, not a complete list.
-- An absent source/alias/membership remains JSON null. Never infer a substitute.
WITH envelope AS (SELECT jsonb_build_object(
  'asset', (SELECT to_jsonb(a) FROM catalog.assets a WHERE a.asset_id = '0d6fe9c6-58c6-46a3-8f13-88c4352b8791'),
  'source', (SELECT jsonb_build_object('id', s.id, 'code', s.code,
      'display_name', s.display_name, 'source_type', s.source_type,
      'base_url', s.base_url, 'terms_url', s.terms_url, 'licence_status', s.licence_status,
      'active', s.active, 'deprecated_at', s.deprecated_at, 'updated_at', s.updated_at)
    FROM ingest.sources s JOIN catalog.assets a ON a.source_id = s.id
    WHERE a.asset_id = '0d6fe9c6-58c6-46a3-8f13-88c4352b8791'),
  'version', (SELECT to_jsonb(cv) FROM catalog.catalogue_versions cv WHERE cv.id = 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8'),
  'set', (SELECT to_jsonb(s) FROM catalog.sets s WHERE s.id = '739d2f18-1dd0-45dc-ba58-2195d5760ed5'),
  'printing', (SELECT to_jsonb(p) FROM catalog.card_printings p WHERE p.id = '7f7c3925-368d-4cbc-8e37-415b6ceb4bda'),
  'concept', (SELECT to_jsonb(c) FROM catalog.card_concepts c
    JOIN catalog.card_printings p ON p.card_concept_id = c.id WHERE p.id = '7f7c3925-368d-4cbc-8e37-415b6ceb4bda'),
  'selectedVariant', (SELECT to_jsonb(v) FROM catalog.card_variants v WHERE v.id = '2f89247e-d3cd-4ec0-88e3-baff0f60252c'),
  'aliasVariant', (SELECT to_jsonb(v) FROM catalog.card_variants v WHERE v.id = 'ccac455c-42b0-4344-9fd1-285ed8756e75'),
  'selectedMembership', (SELECT to_jsonb(m) FROM catalog.catalogue_version_variants m
    WHERE m.catalogue_version_id = 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8' AND m.variant_id = '2f89247e-d3cd-4ec0-88e3-baff0f60252c'),
  'association', (SELECT to_jsonb(m) FROM catalog.catalogue_version_assets m
    JOIN catalog.assets a ON a.id = m.asset_id
    WHERE m.catalogue_version_id = 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8' AND a.asset_id = '0d6fe9c6-58c6-46a3-8f13-88c4352b8791'),
  'assetLinksBounded', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.catalogue_version_id), '[]'::jsonb)
    FROM (SELECT m.* FROM catalog.catalogue_version_assets m JOIN catalog.assets a ON a.id = m.asset_id
      WHERE a.asset_id = '0d6fe9c6-58c6-46a3-8f13-88c4352b8791' ORDER BY m.catalogue_version_id LIMIT 9) x),
  'selectedMembershipsBounded', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.catalogue_version_id), '[]'::jsonb)
    FROM (SELECT m.* FROM catalog.catalogue_version_variants m WHERE m.variant_id = '2f89247e-d3cd-4ec0-88e3-baff0f60252c'
      ORDER BY m.catalogue_version_id LIMIT 9) x)
))
SELECT envelope.jsonb_build_object AS before_rows,
  encode(sha256(convert_to((envelope.jsonb_build_object)::text, 'UTF8')), 'hex') AS before_rows_sha256 FROM envelope;

-- Q4. Effective public manifest identities for only this existing object.
-- Includes other publications (max 9); results are not a delivered phone test.
SELECT m.asset_id, m.asset_row_id, m.catalogue_version_id, m.asset_type,
  m.game_code, m.set_id, m.printing_id, m.variant_id, m.rights_status,
  m.permission_status, m.storage_provider, m.storage_bucket, m.storage_key,
  m.content_sha256, m.width, m.height, m.byte_size, m.derivative_list,
  m.unavailable_reason, m.updated_at
FROM api.asset_manifest m WHERE m.asset_id = '0d6fe9c6-58c6-46a3-8f13-88c4352b8791'
ORDER BY m.catalogue_version_id, m.asset_row_id LIMIT 9;

-- Q5. Competing public assets for only this printing/selected/alias identity.
-- Nine rows is an overflow sentinel requiring a separately reviewed exact query.
SELECT m.asset_id, m.asset_row_id, m.catalogue_version_id, m.set_id,
  m.printing_id, m.variant_id, m.content_sha256, m.width, m.height,
  m.permission_status, m.rights_status, m.unavailable_reason
FROM api.asset_manifest m WHERE m.catalogue_version_id = 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8'
  AND m.asset_type = 'card_image' AND (m.printing_id = '7f7c3925-368d-4cbc-8e37-415b6ceb4bda'
    OR m.variant_id IN ('2f89247e-d3cd-4ec0-88e3-baff0f60252c', 'ccac455c-42b0-4344-9fd1-285ed8756e75'))
ORDER BY m.catalogue_version_id, m.asset_row_id LIMIT 9;

ROLLBACK;
