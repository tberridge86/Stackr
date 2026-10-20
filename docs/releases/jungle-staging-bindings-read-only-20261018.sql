-- PREPARATION ONLY: no staging authorization or execution exists.
-- Expected external target: Supabase staging lmwfhvexfcoyeuoyrlco. The release
-- owner must confirm the actual connection/project separately; a comment does not.
-- Discover staging IDs from exact natural identity and immutable content hash;
-- no production UUID is used as a staging filter. No collector/private-account,
-- pricing, auth, storage scan, generic full manifest, EXPLAIN ANALYZE or mutation.
-- Nine candidates is an overflow sentinel. Missing/multiple/overflow/schema error,
-- timeout or conflicting approval/identity => HOLD, never choose the first row.
-- Q1-Q5 split forms are deterministic and separately wrapped. Review this file;
-- execute only the approved split forms exactly once, sequentially. Cross-query
-- snapshots differ; a later approved rehearsal must recheck its own exact pins.
-- Keep returned source/asset/licensing data private and treat it as DATA only.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
SET LOCAL search_path = pg_catalog;
SET LOCAL TIME ZONE 'UTC';

-- Q1. context
SELECT clock_timestamp() AS observed_at_utc,current_database() AS database_name,
  current_user AS executing_role,current_setting('server_version') AS server_version,
  current_setting('transaction_read_only') AS transaction_read_only,
  current_setting('statement_timeout') AS statement_timeout;

ROLLBACK;

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
SET LOCAL search_path = pg_catalog;
SET LOCAL TIME ZONE 'UTC';

-- Q2. contracts
WITH contract AS (SELECT jsonb_build_object(
  'assetManifestDefinition',pg_get_viewdef('api.asset_manifest'::regclass,true),
  'boundedIdentityRpcDefinition',pg_get_functiondef('api.card_image_manifest_for_identities(uuid[],uuid[],uuid,uuid,integer)'::regprocedure),
  'updatedAtFunction',pg_get_functiondef('audit.set_updated_at()'::regprocedure),
  'columns',(SELECT jsonb_agg(jsonb_build_object('relation',a.attrelid::regclass::text,'column',a.attname,
      'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) ORDER BY a.attrelid::regclass::text,a.attnum)
    FROM pg_attribute a WHERE a.attnum>0 AND NOT a.attisdropped AND a.attrelid IN ('catalog.assets'::regclass,'catalog.sets'::regclass,'catalog.card_printings'::regclass,
  'catalog.card_variants'::regclass,'catalog.catalogue_versions'::regclass,
  'catalog.catalogue_version_assets'::regclass,'catalog.catalogue_version_variants'::regclass,
  'ingest.sources'::regclass)),
  'writeTriggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('relation',t.tgrelid::regclass::text,
      'definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled) ORDER BY t.tgrelid::regclass::text,t.tgname),'[]'::jsonb)
    FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('catalog.assets'::regclass,'catalog.sets'::regclass,'catalog.card_printings'::regclass,
  'catalog.card_variants'::regclass,'catalog.catalogue_versions'::regclass,
  'catalog.catalogue_version_assets'::regclass,'catalog.catalogue_version_variants'::regclass,
  'ingest.sources'::regclass)),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('relation',c.conrelid::regclass::text,'name',c.conname,
      'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conrelid::regclass::text,c.conname)
    FROM pg_constraint c WHERE c.conrelid IN ('catalog.assets'::regclass,'catalog.sets'::regclass,'catalog.card_printings'::regclass,
  'catalog.card_variants'::regclass,'catalog.catalogue_versions'::regclass,
  'catalog.catalogue_version_assets'::regclass,'catalog.catalogue_version_variants'::regclass,
  'ingest.sources'::regclass)),
  'indexes',(SELECT jsonb_agg(jsonb_build_object('relation',i.indrelid::regclass::text,'definition',pg_get_indexdef(i.indexrelid))
      ORDER BY i.indrelid::regclass::text,i.indexrelid) FROM pg_index i WHERE i.indrelid IN ('catalog.assets'::regclass,'catalog.sets'::regclass,'catalog.card_printings'::regclass,
  'catalog.card_variants'::regclass,'catalog.catalogue_versions'::regclass,
  'catalog.catalogue_version_assets'::regclass,'catalog.catalogue_version_variants'::regclass,
  'ingest.sources'::regclass))
) AS data) SELECT data AS contract,encode(sha256(convert_to((data)::text, 'UTF8')), 'hex') AS contract_sha256 FROM contract;

ROLLBACK;

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
SET LOCAL search_path = pg_catalog;
SET LOCAL TIME ZONE 'UTC';

-- Q3. existing-object-and-source
WITH source_candidates AS MATERIALIZED (
  SELECT s.id,s.code,s.display_name,s.source_type,s.base_url,s.terms_url,s.licence_status,
    s.active,s.deprecated_at,s.updated_at
  FROM ingest.sources s WHERE s.code = 'tcgdex' ORDER BY s.id LIMIT 9
), asset_candidates AS MATERIALIZED (
  SELECT a.* FROM catalog.assets a
  WHERE a.asset_type = 'card_image'
    AND a.content_sha256 = 'a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133'
    AND a.deleted_at IS NULL ORDER BY a.id LIMIT 9
), data AS (SELECT jsonb_build_object(
  'sources',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM source_candidates x),
  'matchingObjects',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM asset_candidates x),
  'sourceCountBounded',(SELECT count(*) FROM source_candidates),'assetCountBounded',(SELECT count(*) FROM asset_candidates),
  'hold',(SELECT count(*) FROM source_candidates)<>1 OR (SELECT count(*) FROM asset_candidates)<>1,
  'overflow',(SELECT count(*) FROM source_candidates)>=9 OR (SELECT count(*) FROM asset_candidates)>=9,
  'note','Existing approved asset reuse only; NULL licensing notes are data, not an inferred missing or new permission.'
) AS data) SELECT data AS candidates,encode(sha256(convert_to((data)::text, 'UTF8')), 'hex') AS candidates_sha256 FROM data;

ROLLBACK;

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
SET LOCAL search_path = pg_catalog;
SET LOCAL TIME ZONE 'UTC';

-- Q4. canonical-printing-and-publication
WITH set_candidates AS MATERIALIZED (
  SELECT s.* FROM catalog.sets s
  WHERE s.game_code = 'pokemon' AND s.language_code = 'en'
    AND s.set_code = 'base2' AND s.deprecated_at IS NULL ORDER BY s.id LIMIT 9
), printing_candidates AS MATERIALIZED (
  SELECT p.* FROM catalog.card_printings p
  WHERE p.set_id IN (SELECT id FROM set_candidates)
    AND p.game_code = 'pokemon' AND p.language_code = 'en'
    AND p.collector_number = '60' AND p.deprecated_at IS NULL ORDER BY p.id LIMIT 9
), variant_candidates AS MATERIALIZED (
  SELECT v.* FROM catalog.card_variants v
  WHERE v.printing_id IN (SELECT id FROM printing_candidates)
    AND v.variant_code IN ('first_edition','normal') AND v.deprecated_at IS NULL
  ORDER BY v.id LIMIT 9
), version_candidates AS MATERIALIZED (
  SELECT cv.* FROM catalog.catalogue_versions cv
  WHERE cv.language_code = 'en' AND cv.status = 'published' AND cv.deprecated_at IS NULL
  ORDER BY cv.id LIMIT 9
), published_memberships AS MATERIALIZED (
  SELECT m.* FROM catalog.catalogue_version_variants m
  WHERE m.catalogue_version_id IN (SELECT id FROM version_candidates)
    AND m.variant_id IN (SELECT id FROM variant_candidates)
  ORDER BY m.catalogue_version_id,m.variant_id LIMIT 9
), data AS (SELECT jsonb_build_object(
  'sets',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM set_candidates x),
  'printings',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM printing_candidates x),
  'variants',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM variant_candidates x),
  'publishedEnglishVersions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM version_candidates x),
  'publishedMemberships',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.catalogue_version_id,x.variant_id),'[]'::jsonb) FROM published_memberships x),
  'hold',(SELECT count(*) FROM set_candidates)<>1 OR (SELECT count(*) FROM printing_candidates)<>1
    OR (SELECT count(*) FROM version_candidates)<>1
    OR (SELECT count(*) FROM variant_candidates WHERE variant_code='first_edition')<>1
    OR (SELECT count(*) FROM variant_candidates WHERE variant_code='normal')<>1,
  'overflow',(SELECT count(*) FROM set_candidates)>=9 OR (SELECT count(*) FROM printing_candidates)>=9
    OR (SELECT count(*) FROM variant_candidates)>=9 OR (SELECT count(*) FROM version_candidates)>=9
    OR (SELECT count(*) FROM published_memberships)>=9
) AS data) SELECT data AS candidates,encode(sha256(convert_to((data)::text, 'UTF8')), 'hex') AS candidates_sha256 FROM data;

ROLLBACK;

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
SET LOCAL search_path = pg_catalog;
SET LOCAL TIME ZONE 'UTC';

-- Q5. exact-binding-and-links
WITH source_candidates AS MATERIALIZED (
  SELECT s.id,s.code,s.display_name,s.source_type,s.base_url,s.terms_url,s.licence_status,
    s.active,s.deprecated_at,s.updated_at
  FROM ingest.sources s WHERE s.code = 'tcgdex' ORDER BY s.id LIMIT 9
), asset_candidates AS MATERIALIZED (
  SELECT a.* FROM catalog.assets a
  WHERE a.asset_type = 'card_image'
    AND a.content_sha256 = 'a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133'
    AND a.deleted_at IS NULL ORDER BY a.id LIMIT 9
), set_candidates AS MATERIALIZED (
  SELECT s.* FROM catalog.sets s
  WHERE s.game_code = 'pokemon' AND s.language_code = 'en'
    AND s.set_code = 'base2' AND s.deprecated_at IS NULL ORDER BY s.id LIMIT 9
), printing_candidates AS MATERIALIZED (
  SELECT p.* FROM catalog.card_printings p
  WHERE p.set_id IN (SELECT id FROM set_candidates)
    AND p.game_code = 'pokemon' AND p.language_code = 'en'
    AND p.collector_number = '60' AND p.deprecated_at IS NULL ORDER BY p.id LIMIT 9
), variant_candidates AS MATERIALIZED (
  SELECT v.* FROM catalog.card_variants v
  WHERE v.printing_id IN (SELECT id FROM printing_candidates)
    AND v.variant_code IN ('first_edition','normal') AND v.deprecated_at IS NULL
  ORDER BY v.id LIMIT 9
), version_candidates AS MATERIALIZED (
  SELECT cv.* FROM catalog.catalogue_versions cv
  WHERE cv.language_code = 'en' AND cv.status = 'published' AND cv.deprecated_at IS NULL
  ORDER BY cv.id LIMIT 9
), published_memberships AS MATERIALIZED (
  SELECT m.* FROM catalog.catalogue_version_variants m
  WHERE m.catalogue_version_id IN (SELECT id FROM version_candidates)
    AND m.variant_id IN (SELECT id FROM variant_candidates)
  ORDER BY m.catalogue_version_id,m.variant_id LIMIT 9
), asset_links AS MATERIALIZED (
  SELECT m.* FROM catalog.catalogue_version_assets m
  WHERE m.asset_id IN (SELECT id FROM asset_candidates)
  ORDER BY m.catalogue_version_id,m.asset_id LIMIT 9
), all_variant_memberships AS MATERIALIZED (
  SELECT m.* FROM catalog.catalogue_version_variants m
  WHERE m.variant_id IN (SELECT id FROM variant_candidates)
  ORDER BY m.catalogue_version_id,m.variant_id LIMIT 9
), current_links AS MATERIALIZED (
  SELECT m.* FROM asset_links m
  WHERE m.catalogue_version_id IN (SELECT id FROM version_candidates)
  ORDER BY m.catalogue_version_id,m.asset_id LIMIT 9
), roles AS MATERIALIZED (
  SELECT (SELECT to_jsonb(x) FROM source_candidates x LIMIT 1) AS source,
    (SELECT to_jsonb(x) FROM asset_candidates x LIMIT 1) AS asset,
    (SELECT to_jsonb(x) FROM set_candidates x LIMIT 1) AS set_row,
    (SELECT to_jsonb(x) FROM printing_candidates x LIMIT 1) AS printing,
    (SELECT to_jsonb(x) FROM variant_candidates x WHERE variant_code='first_edition' LIMIT 1) AS selected,
    (SELECT to_jsonb(x) FROM variant_candidates x WHERE variant_code='normal' LIMIT 1) AS normal,
    (SELECT to_jsonb(x) FROM version_candidates x LIMIT 1) AS version,
    (SELECT to_jsonb(x) FROM current_links x LIMIT 1) AS association
), checks AS MATERIALIZED (
  SELECT array_remove(ARRAY[
    CASE WHEN (SELECT count(*) FROM source_candidates)<>1 THEN 'HOLD_SOURCE_MISSING_MULTIPLE_OR_OVERFLOW' END,
    CASE WHEN (SELECT count(*) FROM asset_candidates)<>1 THEN 'HOLD_ASSET_MISSING_MULTIPLE_OR_OVERFLOW' END,
    CASE WHEN (SELECT count(*) FROM set_candidates)<>1 THEN 'HOLD_SET_MISSING_MULTIPLE_OR_OVERFLOW' END,
    CASE WHEN (SELECT count(*) FROM printing_candidates)<>1 THEN 'HOLD_PRINTING_MISSING_MULTIPLE_OR_OVERFLOW' END,
    CASE WHEN (SELECT count(*) FROM version_candidates)<>1 THEN 'HOLD_PUBLICATION_MISSING_MULTIPLE_OR_OVERFLOW' END,
    CASE WHEN (SELECT count(*) FROM variant_candidates WHERE variant_code='first_edition')<>1
      OR (SELECT count(*) FROM variant_candidates WHERE variant_code='normal')<>1 THEN 'HOLD_VARIANT_MISSING_MULTIPLE_OR_OVERFLOW' END,
    CASE WHEN (SELECT count(*) FROM current_links)<>1 THEN 'HOLD_CURRENT_ASSOCIATION_MISSING_MULTIPLE_OR_OVERFLOW' END,
    CASE WHEN (SELECT count(*) FROM asset_links)>=9 OR (SELECT count(*) FROM all_variant_memberships)>=9
      OR (SELECT count(*) FROM published_memberships)>=9 THEN 'HOLD_LINK_OR_MEMBERSHIP_OVERFLOW' END,
    CASE WHEN source->>'active' IS DISTINCT FROM 'true' OR source->>'licence_status' IS DISTINCT FROM 'approved'
      OR source->>'deprecated_at' IS NOT NULL OR source->>'code' IS DISTINCT FROM 'tcgdex'
      THEN 'HOLD_EXISTING_SOURCE_NOT_APPROVED' END,
    CASE WHEN asset->>'source_id' IS DISTINCT FROM source->>'id'
      OR asset->>'permission_status' IS DISTINCT FROM 'approved' OR asset->>'rights_status' IS DISTINCT FROM 'approved'
      OR asset->>'asset_visibility' IS DISTINCT FROM 'public_catalogue' OR asset->>'publicly_servable' IS DISTINCT FROM 'true'
      OR asset->>'retention_status' IS DISTINCT FROM 'active' OR asset->>'deleted_at' IS NOT NULL
      OR asset->>'deprecated_at' IS NOT NULL OR asset->>'unavailable_reason' IS NOT NULL
      THEN 'HOLD_EXISTING_ASSET_NOT_ELIGIBLE' END,
    CASE WHEN asset->>'game_code' IS DISTINCT FROM 'pokemon' OR asset->>'storage_provider' IS DISTINCT FROM 'supabase_storage'
      OR asset->>'storage_bucket' IS DISTINCT FROM 'stackr-catalogue-public'
      OR nullif(asset->>'storage_key','') IS NULL
      OR asset->>'original_source_url' IS DISTINCT FROM 'https://assets.tcgdex.net/en/base/base2/60/high.webp'
      OR asset->>'original_source_identifier' IS DISTINCT FROM 'base2-60:normal'
      OR asset->>'width' IS DISTINCT FROM '600' OR asset->>'height' IS DISTINCT FROM '825'
      OR asset->>'byte_size' IS DISTINCT FROM '134485' OR asset->>'mime_type' IS DISTINCT FROM 'image/jpeg'
      THEN 'HOLD_IMMUTABLE_SOURCE_OR_OBJECT_METADATA_DIFFERS' END,
    CASE WHEN set_row->>'native_name' IS DISTINCT FROM 'Jungle'
      OR (set_row->>'english_display_name' IS NOT NULL AND set_row->>'english_display_name'<>'Jungle')
      OR printing->>'native_name' IS DISTINCT FROM 'Pikachu'
      OR (printing->>'english_display_name' IS NOT NULL AND printing->>'english_display_name'<>'Pikachu')
      OR printing->>'set_id' IS DISTINCT FROM set_row->>'id' THEN 'HOLD_SET_OR_PRINTING_METADATA_DIFFERS' END,
    CASE WHEN selected->>'finish_code' IS DISTINCT FROM 'first_edition' OR normal->>'finish_code' IS DISTINCT FROM 'normal'
      OR selected->>'printing_id' IS DISTINCT FROM printing->>'id' OR normal->>'printing_id' IS DISTINCT FROM printing->>'id'
      OR selected->>'language_code' IS DISTINCT FROM 'en' OR normal->>'language_code' IS DISTINCT FROM 'en'
      OR selected->>'game_code' IS DISTINCT FROM 'pokemon' OR normal->>'game_code' IS DISTINCT FROM 'pokemon'
      OR selected->>'set_id' IS DISTINCT FROM set_row->>'id' OR normal->>'set_id' IS DISTINCT FROM set_row->>'id'
      OR selected->>'collector_number' IS DISTINCT FROM '60' OR normal->>'collector_number' IS DISTINCT FROM '60'
      THEN 'HOLD_VARIANT_IDENTITY_OR_EDITION_DIFFERS' END,
    CASE WHEN selected->>'native_image_status' IS DISTINCT FROM 'same_artwork_reference'
      OR selected->>'same_artwork_as_variant_id' IS DISTINCT FROM normal->>'id'
      OR asset->>'variant_id' IS DISTINCT FROM normal->>'id'
      THEN 'HOLD_EXISTING_ALIAS_OR_ASSET_BINDING_DIFFERS' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM published_memberships m WHERE m.variant_id::text=selected->>'id'
        AND m.printing_id::text=printing->>'id' AND m.set_id::text=set_row->>'id' AND m.language_code='en')
      OR NOT EXISTS (SELECT 1 FROM published_memberships m WHERE m.variant_id::text=normal->>'id'
        AND m.printing_id::text=printing->>'id' AND m.set_id::text=set_row->>'id' AND m.language_code='en')
      THEN 'HOLD_EXACT_PUBLISHED_MEMBERSHIP_MISSING' END,
    CASE WHEN association->>'asset_id' IS DISTINCT FROM asset->>'id'
      OR association->>'language_code' IS DISTINCT FROM 'en' OR association->>'asset_type' IS DISTINCT FROM 'card_image'
      OR association->>'variant_id' IS DISTINCT FROM normal->>'id'
      OR (association->>'printing_id' IS NOT NULL AND association->>'printing_id'<>printing->>'id')
      OR (association->>'set_id' IS NOT NULL AND association->>'set_id'<>set_row->>'id')
      THEN 'HOLD_ASSOCIATION_NOT_THE_EXPECTED_NORMAL_BINDING' END
  ],NULL) AS hold_reasons FROM roles
),
  data AS (SELECT jsonb_build_object(
  'sources',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM source_candidates x),
  'assets',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM asset_candidates x),
  'sets',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM set_candidates x),
  'printings',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM printing_candidates x),
  'variants',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM variant_candidates x),
  'versions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) FROM version_candidates x),
  'publishedMemberships',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.catalogue_version_id,x.variant_id),'[]'::jsonb) FROM published_memberships x),
  'currentLinks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.catalogue_version_id,x.asset_id),'[]'::jsonb) FROM current_links x),
  'assetLinks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.catalogue_version_id,x.asset_id),'[]'::jsonb) FROM asset_links x),
  'allVariantMemberships',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.catalogue_version_id,x.variant_id),'[]'::jsonb) FROM all_variant_memberships x)
) AS data)
SELECT CASE WHEN cardinality(c.hold_reasons)=0 THEN 'EXACT_STAGING_BINDING_IDENTIFIED_REVIEW_REQUIRED' ELSE 'HOLD' END AS decision,
  c.hold_reasons,CASE WHEN cardinality(c.hold_reasons)=0 THEN jsonb_build_object(
    'sourceId',r.source->>'id','assetRowId',r.asset->>'id','publicAssetId',r.asset->>'asset_id',
    'setId',r.set_row->>'id','printingId',r.printing->>'id','selectedFirstEditionVariantId',r.selected->>'id',
    'normalVariantId',r.normal->>'id','publishedCatalogueVersionId',r.version->>'id',
    'association',r.association) ELSE NULL END AS staging_binding,
  d.data AS before_rows,encode(sha256(convert_to((d.data)::text, 'UTF8')), 'hex') AS before_rows_sha256
FROM roles r CROSS JOIN checks c CROSS JOIN data d;

ROLLBACK;
