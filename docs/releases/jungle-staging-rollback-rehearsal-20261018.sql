-- PRIVATE V6 PREPARATION ONLY. NO STAGING WRITE APPROVAL EXISTS.
-- Existing verified TLS executor must prove target lmwfhvexfcoyeuoyrlco outside SQL.
-- Always ROLLBACK; temporary historical lifecycle visibility is only rehearsal.
-- One historical variant UPDATE (+ known timestamp trigger), zero new variants,
-- zero or one temporary current membership INSERT, one existing cva UPDATE.
-- No asset/source/object/default/alias/finish/native-status/price/account writes.
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
SET LOCAL idle_in_transaction_session_timeout='15s';
SET LOCAL search_path=pg_catalog;
SET LOCAL TIME ZONE 'UTC';
DO $v6$
DECLARE
 prepared_v6 jsonb := NULL; -- Human approval and independent review are absent.
 expected_contract_sha text := '9c385a9b332afd4ecf8a3d1bab0d5759d01d0b51d85e268fa0074c5fbf789592';
 expected_base_sha text := '696d6eeb94ee1606509a7ac4aa7824db30c4e89a6a9475de2b3b3fbf22af3348';
 pinned_historical jsonb := '{"id":"2f89247e-d3cd-4ec0-88e3-baff0f60252c","set_id":"739d2f18-1dd0-45dc-ba58-2195d5760ed5","game_code":"pokemon","created_at":"2026-08-06T21:36:16.935038+00:00","is_default":false,"updated_at":"2026-08-29T22:02:30.588032+00:00","artwork_key":"tcgdex:https://assets.tcgdex.net/en/base/base2/60/high.webp","finish_code":"first_edition","printing_id":"7f7c3925-368d-4cbc-8e37-415b6ceb4bda","variant_code":"first_edition","canonical_key":"pokemon:en:739d2f18-1dd0-45dc-ba58-2195d5760ed5:60:first_edition","deprecated_at":"2026-08-29T22:02:30.588032+00:00","language_code":"en","discontinued_at":null,"image_signature":null,"collector_number":"60","deprecated_reason":"tcgdex_pinned_snapshot_finish_correction","source_confidence":0.85,"source_updated_at":null,"native_image_status":"missing","variant_display_name":null,"corrected_by_variant_id":"ccac455c-42b0-4344-9fd1-285ed8756e75","same_artwork_as_variant_id":"ccac455c-42b0-4344-9fd1-285ed8756e75"}'::jsonb;
 pinned_triggers jsonb := '[{"enabled":"O","relation":"catalog.card_variants","definition":"CREATE TRIGGER set_updated_at BEFORE UPDATE ON catalog.card_variants FOR EACH ROW EXECUTE FUNCTION audit.set_updated_at()","function_definition":"CREATE OR REPLACE FUNCTION audit.set_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\n SET search_path TO ''''\nAS $function$\nbegin\n  new.updated_at = now();\n  return new;\nend;\n$function$\n"}]'::jsonb;
 actual_contract jsonb; actual_triggers jsonb;
 base_before jsonb; base_after jsonb; family_before jsonb; family_after jsonb; expected_after jsonb;
 rpc_before jsonb; rpc_changed jsonb; rpc_restored jsonb;
 facts_before jsonb; facts_changed jsonb; facts_restored jsonb;
 historical_after jsonb; inserted_membership jsonb; membership_row jsonb; normal_before jsonb;
 selected_id uuid := '2f89247e-d3cd-4ec0-88e3-baff0f60252c';
 normal_id uuid := 'ccac455c-42b0-4344-9fd1-285ed8756e75';
 target_printing_id uuid := '7f7c3925-368d-4cbc-8e37-415b6ceb4bda';
 target_set_id uuid := '739d2f18-1dd0-45dc-ba58-2195d5760ed5';
 version_id uuid := 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8';
 active_asset_id uuid := '0d6fe9c6-58c6-46a3-8f13-88c4352b8791';
 excluded_asset_id uuid := '7f8dd334-fe4a-4bca-bcfc-7679f41b09d2';
 selected_key text := 'pokemon:en:739d2f18-1dd0-45dc-ba58-2195d5760ed5:60:first_edition';
 membership_present boolean; inner_verified boolean := false; changed_count integer;
BEGIN
 IF prepared_v6 IS NULL OR prepared_v6->>'targetProject' IS DISTINCT FROM 'lmwfhvexfcoyeuoyrlco'
   OR prepared_v6->>'mode' IS DISTINCT FROM 'historical_visibility_rollback_only_one_association'
   OR prepared_v6->>'historyEvidenceSha256' IS DISTINCT FROM '5380adb34ae1d27c8d8ea83f13b854913e24a1fa8ac45f25ec8e71f722b10d8e'
   OR coalesce(prepared_v6->>'independentReviewSha256','') !~ '^[0-9a-f]{64}$'
   OR coalesce(prepared_v6->>'exactOwnerStagingWriteApprovalSha256','') !~ '^[0-9a-f]{64}$'
   OR coalesce(prepared_v6->>'existingStageApprovalEvidenceSha256','') !~ '^[0-9a-f]{64}$'
   OR prepared_v6->>'allowsTemporaryHistoricalVisibility' IS DISTINCT FROM 'true'
   OR prepared_v6->>'allowsConditionalTemporaryMembershipInsert' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'HOLD_V6_AUTHORITY: reviewed exact staging-only rollback authority missing';
 END IF;
 -- No asset write: the separate storage-identity trigger cannot fire.
 PERFORM 1 FROM catalog.assets a WHERE a.id IN (active_asset_id,excluded_asset_id) FOR SHARE;
 PERFORM 1 FROM ingest.sources s WHERE s.id='c18bc87f-e4db-434c-9353-a2306136af47' FOR SHARE;
 PERFORM 1 FROM catalog.sets s WHERE s.id=target_set_id FOR SHARE;
 PERFORM 1 FROM catalog.card_printings p WHERE p.id=target_printing_id FOR SHARE;
 PERFORM 1 FROM catalog.catalogue_versions cv WHERE cv.id=version_id FOR SHARE;
 PERFORM 1 FROM catalog.card_variants v WHERE v.id IN (normal_id,selected_id) ORDER BY v.id FOR UPDATE;
 PERFORM 1 FROM catalog.catalogue_version_variants m WHERE m.variant_id IN (normal_id,selected_id) OR m.canonical_key=selected_key
   ORDER BY m.catalogue_version_id,m.variant_id LIMIT 9 FOR SHARE;
 PERFORM 1 FROM catalog.catalogue_version_assets m WHERE m.asset_id IN (active_asset_id,excluded_asset_id) OR m.variant_id=selected_id
   ORDER BY m.catalogue_version_id,m.asset_id LIMIT 9 FOR SHARE;
 PERFORM 1 FROM catalog.catalogue_version_assets m WHERE m.catalogue_version_id=version_id AND m.asset_id=active_asset_id FOR UPDATE;
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
) AS data) SELECT data INTO actual_contract FROM contract;
 IF encode(sha256(convert_to((actual_contract)::text,'UTF8')),'hex') IS DISTINCT FROM expected_contract_sha THEN RAISE EXCEPTION 'HOLD_V6_CONTRACT: schema/trigger/RPC drift'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('relation',t.tgrelid::regclass::text,
 'definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled,'function_definition',pg_get_functiondef(t.tgfoid))
 ORDER BY t.tgrelid::regclass::text,t.tgname),'[]'::jsonb) INTO actual_triggers FROM pg_trigger t WHERE NOT t.tgisinternal
 AND t.tgrelid IN ('catalog.card_variants'::regclass,'catalog.catalogue_version_variants'::regclass,'catalog.catalogue_version_assets'::regclass);
 IF actual_triggers IS DISTINCT FROM pinned_triggers THEN RAISE EXCEPTION 'HOLD_V6_TRIGGER: affected trigger body drift'; END IF;
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
) SELECT jsonb_build_object(
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
) INTO base_before;
 IF base_before IS DISTINCT FROM '{"sets":[{"id":"739d2f18-1dd0-45dc-ba58-2195d5760ed5","total":64,"set_code":"base2","game_code":"pokemon","series_id":null,"created_at":"2026-08-05T13:45:19.616+00:00","updated_at":"2026-08-30T22:46:35.242857+00:00","native_name":"Jungle","region_code":null,"release_date":"1999-06-16","deprecated_at":null,"display_order":null,"language_code":"en","printed_total":64,"discontinued_at":null,"deprecated_reason":null,"provider_set_code":"base2","source_updated_at":null,"corrected_by_set_id":null,"english_display_name":"Jungle"}],"assets":[{"id":"0d6fe9c6-58c6-46a3-8f13-88c4352b8791","url":"https://lmwfhvexfcoyeuoyrlco.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/card_image/a7/6f/a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133/original.jpg","width":600,"height":825,"set_id":null,"sha256":"a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133","asset_id":"0d6fe9c6-58c6-46a3-8f13-88c4352b8791","byte_size":134485,"game_code":"pokemon","mime_type":"image/jpeg","source_id":"c18bc87f-e4db-434c-9353-a2306136af47","asset_type":"card_image","created_at":"2026-08-06T21:37:40.355818+00:00","deleted_at":null,"updated_at":"2026-08-06T22:51:37.395024+00:00","variant_id":"ccac455c-42b0-4344-9fd1-285ed8756e75","printing_id":null,"storage_key":"public/card_image/a7/6f/a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133/original.jpg","storage_path":"public/card_image/a7/6f/a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133/original.jpg","cache_control":"public, max-age=31536000, immutable","deprecated_at":null,"rights_status":"approved","content_sha256":"a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133","storage_bucket":"stackr-catalogue-public","deletion_reason":null,"derivative_list":[{"role":"card-grid","width":240,"height":330,"byteSize":21360,"mimeType":"image/webp","storageKey":"public/card_image/b4/bb/b4bb92c1d0086f3a56e34c6dde6c0418721fbc240f2a62a4a181c3b58713080e/card-grid.webp","cacheControl":"public, max-age=31536000, immutable","contentSha256":"b4bb92c1d0086f3a56e34c6dde6c0418721fbc240f2a62a4a181c3b58713080e","storageBucket":"stackr-catalogue-public","storageProvider":"supabase_storage"},{"role":"search-result","width":96,"height":132,"byteSize":3886,"mimeType":"image/webp","storageKey":"public/card_image/43/ea/43ea7a160ce4462c2e1cd195213988316b5c27046c0c646cca2f3d2fcf4cca2f/search-result.webp","cacheControl":"public, max-age=31536000, immutable","contentSha256":"43ea7a160ce4462c2e1cd195213988316b5c27046c0c646cca2f3d2fcf4cca2f","storageBucket":"stackr-catalogue-public","storageProvider":"supabase_storage"},{"role":"detail-page","width":600,"height":825,"byteSize":86920,"mimeType":"image/webp","storageKey":"public/card_image/ab/7e/ab7e0dae2228d36f54e0284eecdef784e730a0d9c76259b46c10c55acfff7420/detail-page.webp","cacheControl":"public, max-age=31536000, immutable","contentSha256":"ab7e0dae2228d36f54e0284eecdef784e730a0d9c76259b46c10c55acfff7420","storageBucket":"stackr-catalogue-public","storageProvider":"supabase_storage"}],"perceptual_hash":"bf9098809dffffbf","retention_until":null,"asset_visibility":"public_catalogue","attribution_text":null,"last_verified_at":"2026-08-06T22:51:34.093+00:00","retention_status":"active","storage_provider":"supabase_storage","deprecated_reason":null,"permission_status":"approved","publicly_servable":true,"source_updated_at":null,"acquisition_source":"provider_url","source_attribution":"tcgdex","unavailable_reason":null,"original_source_url":"https://assets.tcgdex.net/en/base/base2/60/high.webp","archival_storage_key":"public/card_image/a7/6f/a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133/original.jpg","externally_referenced":false,"licensing_review_notes":null,"original_source_identifier":"base2-60:normal","recognition_reference_eligible":true},{"id":"7f8dd334-fe4a-4bca-bcfc-7679f41b09d2","url":"https://assets.tcgdex.net/en/base/base2/60/high.webp","width":600,"height":825,"set_id":null,"sha256":null,"asset_id":null,"byte_size":134485,"game_code":"pokemon","mime_type":"image/jpeg","source_id":"c18bc87f-e4db-434c-9353-a2306136af47","asset_type":"card_image","created_at":"2026-08-06T21:36:21.54343+00:00","deleted_at":null,"updated_at":"2026-08-29T22:02:30.588032+00:00","variant_id":"2f89247e-d3cd-4ec0-88e3-baff0f60252c","printing_id":null,"storage_key":null,"storage_path":null,"cache_control":null,"deprecated_at":"2026-08-29T22:02:30.588032+00:00","rights_status":"approved","content_sha256":"a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133","storage_bucket":null,"deletion_reason":null,"derivative_list":[{"role":"card-grid","width":240,"height":330,"byteSize":21360,"mimeType":"image/webp","storageKey":"public/card_image/b4/bb/b4bb92c1d0086f3a56e34c6dde6c0418721fbc240f2a62a4a181c3b58713080e/card-grid.webp","cacheControl":"public, max-age=31536000, immutable","contentSha256":"b4bb92c1d0086f3a56e34c6dde6c0418721fbc240f2a62a4a181c3b58713080e","storageBucket":"stackr-catalogue-public","storageProvider":"supabase_storage"},{"role":"search-result","width":96,"height":132,"byteSize":3886,"mimeType":"image/webp","storageKey":"public/card_image/43/ea/43ea7a160ce4462c2e1cd195213988316b5c27046c0c646cca2f3d2fcf4cca2f/search-result.webp","cacheControl":"public, max-age=31536000, immutable","contentSha256":"43ea7a160ce4462c2e1cd195213988316b5c27046c0c646cca2f3d2fcf4cca2f","storageBucket":"stackr-catalogue-public","storageProvider":"supabase_storage"},{"role":"detail-page","width":600,"height":825,"byteSize":86920,"mimeType":"image/webp","storageKey":"public/card_image/ab/7e/ab7e0dae2228d36f54e0284eecdef784e730a0d9c76259b46c10c55acfff7420/detail-page.webp","cacheControl":"public, max-age=31536000, immutable","contentSha256":"ab7e0dae2228d36f54e0284eecdef784e730a0d9c76259b46c10c55acfff7420","storageBucket":"stackr-catalogue-public","storageProvider":"supabase_storage"}],"perceptual_hash":"bf9098809dffffbf","retention_until":null,"asset_visibility":"public_catalogue","attribution_text":null,"last_verified_at":"2026-08-29T21:53:04.003+00:00","retention_status":"unavailable","storage_provider":"unavailable","deprecated_reason":"tcgdex_pinned_snapshot_finish_correction","permission_status":"approved","publicly_servable":false,"source_updated_at":null,"acquisition_source":"provider_url","source_attribution":"tcgdex","unavailable_reason":"tcgdex_pinned_snapshot_finish_correction","original_source_url":"https://assets.tcgdex.net/en/base/base2/60/high.webp","archival_storage_key":"public/card_image/a7/6f/a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133/original.jpg","externally_referenced":false,"licensing_review_notes":"User attested full access/permission on 2026-08-18; approved for StackR catalogue use.","original_source_identifier":"base2-60","recognition_reference_eligible":true}],"sources":[{"id":"c18bc87f-e4db-434c-9353-a2306136af47","code":"tcgdex","active":true,"base_url":"https://api.tcgdex.net/v2","terms_url":"https://github.com/tcgdex/cards-database/blob/master/LICENSE","updated_at":"2026-08-31T06:14:56.999575+00:00","source_type":"catalogue","display_name":"TCGdex","deprecated_at":null,"licence_status":"approved"}],"variants":[{"id":"ccac455c-42b0-4344-9fd1-285ed8756e75","set_id":"739d2f18-1dd0-45dc-ba58-2195d5760ed5","game_code":"pokemon","created_at":"2026-08-06T21:37:37.415951+00:00","is_default":true,"updated_at":"2026-08-30T23:19:36.667707+00:00","artwork_key":"tcgdex:https://assets.tcgdex.net/en/base/base2/60/high.webp","finish_code":"normal","printing_id":"7f7c3925-368d-4cbc-8e37-415b6ceb4bda","variant_code":"normal","canonical_key":"pokemon:en:739d2f18-1dd0-45dc-ba58-2195d5760ed5:60:normal","deprecated_at":null,"language_code":"en","discontinued_at":null,"image_signature":null,"collector_number":"60","deprecated_reason":null,"source_confidence":0.85,"source_updated_at":null,"native_image_status":"available","variant_display_name":null,"corrected_by_variant_id":null,"same_artwork_as_variant_id":null}],"versions":[{"id":"d6bdab54-ec11-4b54-85a9-311d6ce3b2c8","status":"published","created_at":"2026-08-20T01:59:16.793735+00:00","updated_at":"2026-08-20T13:38:28.221223+00:00","description":"Stackr coverage-limited catalogue en tcgdex-796afd47e430-full-primary-2026-08-19","version_key":"en:tcgdex-796afd47e430-full-primary-2026-08-19","published_at":"2026-08-20T13:38:28.221223+00:00","deprecated_at":null,"language_code":"en","version_label":"tcgdex-796afd47e430-full-primary-2026-08-19","coverage_summary":{"sets":223,"language":"en","conflicts":0,"setStatuses":{"Complete":131,"Images incomplete":68,"Set art incomplete":13,"Metadata incomplete":11},"missingLogos":66,"expectedCards":24016,"missingSymbols":54,"releaseEligible":true,"exactNativeImages":31153,"publicationPolicy":"measured_provider_coverage","storedCardRecords":23666,"unvalidatedImages":0,"missingCardRecords":350,"coverageLimitedSnapshot":true,"missingRequiredVariants":0,"missingExactNativeImages":2015,"releaseBlockingMissingLogos":66,"unresolvedIdentityConflicts":0,"releaseBlockingMissingSymbols":54,"acknowledgedPublicationBlockers":["language_has_incomplete_sets","missing_card_records","missing_exact_native_images","release_blocking_missing_logo","release_blocking_missing_symbol"]},"deprecated_reason":null,"source_updated_at":null,"max_change_sequence":null,"min_change_sequence":null,"superseded_by_version_id":null}],"printings":[{"id":"7f7c3925-368d-4cbc-8e37-415b6ceb4bda","artist":"Ken Sugimori","set_id":"739d2f18-1dd0-45dc-ba58-2195d5760ed5","subtypes":[],"game_code":"pokemon","rarity_id":"d3aeeb9c-841e-4088-8fa8-bc4028b800de","supertype":"Pokémon","created_at":"2026-08-06T21:36:15.985323+00:00","updated_at":"2026-08-30T23:15:36.71525+00:00","native_name":"Pikachu","deprecated_at":null,"language_code":"en","card_concept_id":"b99b2635-88f2-4c86-a126-6fe6191f571e","discontinued_at":null,"collector_number":"60","deprecated_reason":null,"source_updated_at":null,"english_display_name":"Pikachu","collector_number_sort":60,"collector_number_prefix":null,"collector_number_suffix":null,"corrected_by_printing_id":null,"collector_number_sort_key":"000000000060"}],"assetLinks":[{"set_id":null,"asset_id":"0d6fe9c6-58c6-46a3-8f13-88c4352b8791","asset_type":"card_image","created_at":"2026-08-09T14:57:23.577138+00:00","variant_id":"ccac455c-42b0-4344-9fd1-285ed8756e75","printing_id":null,"language_code":"en","catalogue_version_id":"2a4a05d7-6e77-4bb9-ad09-83e627ea4538"},{"set_id":null,"asset_id":"0d6fe9c6-58c6-46a3-8f13-88c4352b8791","asset_type":"card_image","created_at":"2026-08-20T13:37:24.697005+00:00","variant_id":"ccac455c-42b0-4344-9fd1-285ed8756e75","printing_id":null,"language_code":"en","catalogue_version_id":"d6bdab54-ec11-4b54-85a9-311d6ce3b2c8"}],"currentLinks":[{"set_id":null,"asset_id":"0d6fe9c6-58c6-46a3-8f13-88c4352b8791","asset_type":"card_image","created_at":"2026-08-20T13:37:24.697005+00:00","variant_id":"ccac455c-42b0-4344-9fd1-285ed8756e75","printing_id":null,"language_code":"en","catalogue_version_id":"d6bdab54-ec11-4b54-85a9-311d6ce3b2c8"}],"publishedMemberships":[{"set_id":"739d2f18-1dd0-45dc-ba58-2195d5760ed5","created_at":"2026-08-20T13:37:17.558328+00:00","variant_id":"ccac455c-42b0-4344-9fd1-285ed8756e75","printing_id":"7f7c3925-368d-4cbc-8e37-415b6ceb4bda","canonical_key":"pokemon:en:739d2f18-1dd0-45dc-ba58-2195d5760ed5:60:normal","language_code":"en","catalogue_version_id":"d6bdab54-ec11-4b54-85a9-311d6ce3b2c8"}],"allVariantMemberships":[{"set_id":"739d2f18-1dd0-45dc-ba58-2195d5760ed5","created_at":"2026-08-09T14:57:16.967069+00:00","variant_id":"ccac455c-42b0-4344-9fd1-285ed8756e75","printing_id":"7f7c3925-368d-4cbc-8e37-415b6ceb4bda","canonical_key":"pokemon:en:739d2f18-1dd0-45dc-ba58-2195d5760ed5:60:normal","language_code":"en","catalogue_version_id":"2a4a05d7-6e77-4bb9-ad09-83e627ea4538"},{"set_id":"739d2f18-1dd0-45dc-ba58-2195d5760ed5","created_at":"2026-08-20T13:37:17.558328+00:00","variant_id":"ccac455c-42b0-4344-9fd1-285ed8756e75","printing_id":"7f7c3925-368d-4cbc-8e37-415b6ceb4bda","canonical_key":"pokemon:en:739d2f18-1dd0-45dc-ba58-2195d5760ed5:60:normal","language_code":"en","catalogue_version_id":"d6bdab54-ec11-4b54-85a9-311d6ce3b2c8"}]}'::jsonb OR encode(sha256(convert_to((base_before)::text,'UTF8')),'hex') IS DISTINCT FROM expected_base_sha THEN
   RAISE EXCEPTION 'HOLD_V6_BEFORE: exact captured asset/source/publication/normal state drift';
 END IF;
 WITH family_variants AS MATERIALIZED (
 SELECT v.* FROM catalog.card_variants v WHERE v.id IN (selected_id,normal_id)
   OR v.canonical_key=selected_key OR (v.printing_id=target_printing_id AND v.variant_code IN ('normal','first_edition'))
 ORDER BY v.id LIMIT 9
), family_memberships AS MATERIALIZED (
 SELECT m.* FROM catalog.catalogue_version_variants m WHERE m.variant_id IN (selected_id,normal_id) OR m.canonical_key=selected_key
 ORDER BY m.catalogue_version_id,m.variant_id LIMIT 9
), family_links AS MATERIALIZED (
 SELECT m.* FROM catalog.catalogue_version_assets m WHERE m.asset_id IN (active_asset_id,excluded_asset_id) OR m.variant_id=selected_id
 ORDER BY m.catalogue_version_id,m.asset_id LIMIT 9
) SELECT jsonb_build_object(
 'variants',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]'::jsonb) FROM family_variants v),
 'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.catalogue_version_id,m.variant_id),'[]'::jsonb) FROM family_memberships m),
 'links',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.catalogue_version_id,m.asset_id),'[]'::jsonb) FROM family_links m)) INTO family_before;
 IF jsonb_array_length(family_before->'variants')<>2 OR jsonb_array_length(family_before->'memberships')>=8
   OR jsonb_array_length(family_before->'links')>=9 THEN RAISE EXCEPTION 'HOLD_V6_FAMILY: missing/multiple/overflow family'; END IF;
 IF (SELECT to_jsonb(v) FROM catalog.card_variants v WHERE v.id=selected_id) IS DISTINCT FROM pinned_historical
   OR pinned_historical->>'deprecated_at' IS NULL OR pinned_historical->>'is_default' IS DISTINCT FROM 'false'
   OR pinned_historical->>'printing_id' IS DISTINCT FROM target_printing_id::text
   OR pinned_historical->>'canonical_key' IS DISTINCT FROM selected_key
   OR pinned_historical->>'language_code' IS DISTINCT FROM 'en'
   OR pinned_historical->>'game_code' IS DISTINCT FROM 'pokemon'
   OR pinned_historical->>'set_id' IS DISTINCT FROM target_set_id::text
   OR pinned_historical->>'collector_number' IS DISTINCT FROM '60'
   OR pinned_historical->>'variant_code' IS DISTINCT FROM 'first_edition'
   OR pinned_historical->>'finish_code' IS DISTINCT FROM 'first_edition'
   OR pinned_historical->>'same_artwork_as_variant_id' IS DISTINCT FROM normal_id::text
   OR pinned_historical->>'corrected_by_variant_id' IS DISTINCT FROM normal_id::text
   OR pinned_historical->>'native_image_status' IS DISTINCT FROM 'missing' THEN
   RAISE EXCEPTION 'HOLD_V6_HISTORY: exact historical identity/lifecycle changed';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM catalog.variant_taxonomy t WHERE t.code='first_edition' AND t.active AND t.deprecated_at IS NULL AND t.finish_code='first_edition')
  OR NOT EXISTS(SELECT 1 FROM catalog.finishes f WHERE f.code='first_edition' AND f.deprecated_at IS NULL) THEN
   RAISE EXCEPTION 'HOLD_V6_TAXONOMY: existing taxonomy/finish unavailable'; END IF;
 FOR membership_row IN SELECT value FROM jsonb_array_elements(family_before->'memberships') LOOP
   IF membership_row->>'language_code' IS DISTINCT FROM 'en' OR membership_row->>'set_id' IS DISTINCT FROM target_set_id::text
    OR membership_row->>'printing_id' IS DISTINCT FROM target_printing_id::text
    OR (membership_row->>'variant_id'=selected_id::text AND membership_row->>'canonical_key' IS DISTINCT FROM selected_key)
    OR (membership_row->>'canonical_key'=selected_key AND membership_row->>'variant_id' IS DISTINCT FROM selected_id::text)
    OR membership_row->>'variant_id' NOT IN (selected_id::text,normal_id::text) THEN
    RAISE EXCEPTION 'HOLD_V6_MEMBERSHIP: historical/current identity ambiguity'; END IF;
 END LOOP;
 SELECT EXISTS(SELECT 1 FROM catalog.catalogue_version_variants cvv WHERE cvv.catalogue_version_id=version_id AND cvv.variant_id=selected_id) INTO membership_present;
 SELECT to_jsonb(v) INTO normal_before FROM catalog.card_variants v WHERE v.id=normal_id;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.catalogue_version_id,r.asset_row_id),'[]'::jsonb) INTO rpc_before
 FROM api.card_image_manifest_for_identities(ARRAY[normal_id,selected_id]::uuid[],ARRAY[target_printing_id]::uuid[],NULL,NULL,50) r;
 IF jsonb_array_length(rpc_before)<>1 OR rpc_before#>>'{0,asset_row_id}' IS DISTINCT FROM active_asset_id::text
   OR rpc_before#>>'{0,variant_id}' IS DISTINCT FROM normal_id::text
   OR rpc_before#>>'{0,content_sha256}' IS DISTINCT FROM 'a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133' THEN RAISE EXCEPTION 'HOLD_V6_RPC_BEFORE: unexpected baseline'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.variant_id),'[]'::jsonb) INTO facts_before FROM (
 SELECT c.* FROM api.catalogue_cards c WHERE c.catalogue_version_id=version_id AND c.printing_id=target_printing_id
 AND c.variant_id IN (selected_id,normal_id) ORDER BY c.variant_id LIMIT 3) r;
 IF jsonb_array_length(facts_before)<>1 OR facts_before#>>'{0,variant_id}' IS DISTINCT FROM normal_id::text THEN
   RAISE EXCEPTION 'HOLD_V6_FACTS_BEFORE: unexpected published visibility'; END IF;
 RAISE NOTICE 'V6_BEFORE protected_sha256=% current_historical_membership_present=%',encode(sha256(convert_to((family_before)::text,'UTF8')),'hex'),membership_present;
 BEGIN
   UPDATE catalog.card_variants v SET deprecated_at=NULL,deprecated_reason=NULL
    WHERE v.id=selected_id AND v.deprecated_at IS NOT NULL;
   GET DIAGNOSTICS changed_count=ROW_COUNT;
   IF changed_count<>1 THEN RAISE EXCEPTION 'HOLD_V6_HISTORY_COUNT'; END IF;
   SELECT to_jsonb(v) INTO historical_after FROM catalog.card_variants v WHERE v.id=selected_id;
   IF (historical_after-'deprecated_at'-'deprecated_reason'-'updated_at') IS DISTINCT FROM (pinned_historical-'deprecated_at'-'deprecated_reason'-'updated_at')
    OR historical_after->>'deprecated_at' IS NOT NULL OR historical_after->>'deprecated_reason' IS NOT NULL
    OR historical_after->'updated_at' IS DISTINCT FROM to_jsonb(now()) THEN RAISE EXCEPTION 'HOLD_V6_HISTORY_DELTA'; END IF;
   IF NOT membership_present THEN
     INSERT INTO catalog.catalogue_version_variants(catalogue_version_id,language_code,set_id,printing_id,variant_id,canonical_key,created_at)
      VALUES(version_id,'en',target_set_id,target_printing_id,selected_id,selected_key,now());
     GET DIAGNOSTICS changed_count=ROW_COUNT;
     IF changed_count<>1 THEN RAISE EXCEPTION 'HOLD_V6_MEMBERSHIP_COUNT'; END IF;
     SELECT to_jsonb(cvv) INTO inserted_membership FROM catalog.catalogue_version_variants cvv WHERE cvv.catalogue_version_id=version_id AND cvv.variant_id=selected_id;
   END IF;
   UPDATE catalog.catalogue_version_assets cva SET printing_id=target_printing_id,variant_id=selected_id
    WHERE cva.catalogue_version_id=version_id AND cva.asset_id=active_asset_id AND cva.variant_id=normal_id;
   GET DIAGNOSTICS changed_count=ROW_COUNT;
   IF changed_count<>1 THEN RAISE EXCEPTION 'HOLD_V6_ASSOCIATION_COUNT'; END IF;
   WITH family_variants AS MATERIALIZED (
 SELECT v.* FROM catalog.card_variants v WHERE v.id IN (selected_id,normal_id)
   OR v.canonical_key=selected_key OR (v.printing_id=target_printing_id AND v.variant_code IN ('normal','first_edition'))
 ORDER BY v.id LIMIT 9
), family_memberships AS MATERIALIZED (
 SELECT m.* FROM catalog.catalogue_version_variants m WHERE m.variant_id IN (selected_id,normal_id) OR m.canonical_key=selected_key
 ORDER BY m.catalogue_version_id,m.variant_id LIMIT 9
), family_links AS MATERIALIZED (
 SELECT m.* FROM catalog.catalogue_version_assets m WHERE m.asset_id IN (active_asset_id,excluded_asset_id) OR m.variant_id=selected_id
 ORDER BY m.catalogue_version_id,m.asset_id LIMIT 9
) SELECT jsonb_build_object(
 'variants',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]'::jsonb) FROM family_variants v),
 'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.catalogue_version_id,m.variant_id),'[]'::jsonb) FROM family_memberships m),
 'links',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.catalogue_version_id,m.asset_id),'[]'::jsonb) FROM family_links m)) INTO family_after;
   expected_after=jsonb_build_object(
    'variants',(SELECT jsonb_agg(CASE WHEN x->>'id'=selected_id::text THEN historical_after ELSE x END ORDER BY x->>'id') FROM jsonb_array_elements(family_before->'variants') x),
    'memberships',(SELECT jsonb_agg(x ORDER BY x->>'catalogue_version_id',x->>'variant_id') FROM jsonb_array_elements((family_before->'memberships') || CASE WHEN membership_present THEN '[]'::jsonb ELSE jsonb_build_array(inserted_membership) END) x),
    'links',(SELECT jsonb_agg(CASE WHEN x->>'catalogue_version_id'=version_id::text AND x->>'asset_id'=active_asset_id::text
      THEN x||jsonb_build_object('printing_id',target_printing_id,'variant_id',selected_id) ELSE x END ORDER BY x->>'catalogue_version_id',x->>'asset_id') FROM jsonb_array_elements(family_before->'links') x));
   IF family_after IS DISTINCT FROM expected_after OR (SELECT to_jsonb(v) FROM catalog.card_variants v WHERE v.id=normal_id) IS DISTINCT FROM normal_before THEN
     RAISE EXCEPTION 'HOLD_V6_DELTA: unexpected family/default/alias/history/other membership change'; END IF;
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
) SELECT jsonb_build_object(
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
) INTO base_after;
   IF (base_after-'variants'-'publishedMemberships'-'currentLinks'-'assetLinks'-'allVariantMemberships')
    IS DISTINCT FROM (base_before-'variants'-'publishedMemberships'-'currentLinks'-'assetLinks'-'allVariantMemberships') THEN
    RAISE EXCEPTION 'HOLD_V6_IMMUTABLE: assets/source/printing/set/publication changed'; END IF;
   SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.catalogue_version_id,r.asset_row_id),'[]'::jsonb) INTO rpc_changed
 FROM api.card_image_manifest_for_identities(ARRAY[normal_id,selected_id]::uuid[],ARRAY[target_printing_id]::uuid[],NULL,NULL,50) r;
   IF jsonb_array_length(rpc_changed)<>1 OR rpc_changed#>>'{0,variant_id}' IS DISTINCT FROM selected_id::text
    OR rpc_changed#>>'{0,printing_id}' IS DISTINCT FROM target_printing_id::text
    OR ((rpc_changed->0)-'variant_id'-'printing_id') IS DISTINCT FROM ((rpc_before->0)-'variant_id'-'printing_id') THEN
    RAISE EXCEPTION 'HOLD_V6_RPC_CHANGED: exact override/immutable bytes differ'; END IF;
   SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.variant_id),'[]'::jsonb) INTO facts_changed FROM (
 SELECT c.* FROM api.catalogue_cards c WHERE c.catalogue_version_id=version_id AND c.printing_id=target_printing_id
 AND c.variant_id IN (selected_id,normal_id) ORDER BY c.variant_id LIMIT 3) r;
   IF jsonb_array_length(facts_changed)<>2
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(facts_changed) f WHERE f->>'variant_id'=selected_id::text
      AND f->>'canonical_key'=selected_key AND f->>'variant_code'='first_edition' AND f->>'finish_code'='first_edition'
      AND f->>'native_image_status'='missing' AND f->>'same_artwork_as_variant_id'=normal_id::text)
    OR NOT (facts_changed @> facts_before) THEN RAISE EXCEPTION 'HOLD_V6_FACTS_CHANGED: published first-edition visibility/normal preservation failed'; END IF;
   RAISE NOTICE 'V6_HISTORICAL_FIXTURE=%',historical_after;
   RAISE NOTICE 'V6_RPC_FIXTURE=%',rpc_changed;
   RAISE NOTICE 'V6_FACTS_FIXTURE=%',facts_changed;
   inner_verified := true;
   RAISE EXCEPTION USING ERRCODE='ZR006',MESSAGE='Verified V6 rehearsal subtransaction rollback';
 EXCEPTION WHEN SQLSTATE 'ZR006' THEN
   IF NOT inner_verified THEN RAISE; END IF;
 END;
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
) SELECT jsonb_build_object(
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
) INTO base_after;
 WITH family_variants AS MATERIALIZED (
 SELECT v.* FROM catalog.card_variants v WHERE v.id IN (selected_id,normal_id)
   OR v.canonical_key=selected_key OR (v.printing_id=target_printing_id AND v.variant_code IN ('normal','first_edition'))
 ORDER BY v.id LIMIT 9
), family_memberships AS MATERIALIZED (
 SELECT m.* FROM catalog.catalogue_version_variants m WHERE m.variant_id IN (selected_id,normal_id) OR m.canonical_key=selected_key
 ORDER BY m.catalogue_version_id,m.variant_id LIMIT 9
), family_links AS MATERIALIZED (
 SELECT m.* FROM catalog.catalogue_version_assets m WHERE m.asset_id IN (active_asset_id,excluded_asset_id) OR m.variant_id=selected_id
 ORDER BY m.catalogue_version_id,m.asset_id LIMIT 9
) SELECT jsonb_build_object(
 'variants',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]'::jsonb) FROM family_variants v),
 'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.catalogue_version_id,m.variant_id),'[]'::jsonb) FROM family_memberships m),
 'links',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.catalogue_version_id,m.asset_id),'[]'::jsonb) FROM family_links m)) INTO family_after;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.catalogue_version_id,r.asset_row_id),'[]'::jsonb) INTO rpc_restored
 FROM api.card_image_manifest_for_identities(ARRAY[normal_id,selected_id]::uuid[],ARRAY[target_printing_id]::uuid[],NULL,NULL,50) r;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.variant_id),'[]'::jsonb) INTO facts_restored FROM (
 SELECT c.* FROM api.catalogue_cards c WHERE c.catalogue_version_id=version_id AND c.printing_id=target_printing_id
 AND c.variant_id IN (selected_id,normal_id) ORDER BY c.variant_id LIMIT 3) r;
 IF base_after IS DISTINCT FROM base_before OR family_after IS DISTINCT FROM family_before
  OR rpc_restored IS DISTINCT FROM rpc_before OR facts_restored IS DISTINCT FROM facts_before THEN
   RAISE EXCEPTION 'HOLD_V6_ROLLBACK: full captured family/lifecycle/membership/RPC/facts differ'; END IF;
 RAISE NOTICE 'V6_ROLLED_BACK protected_sha256=% persistent_changes=0',encode(sha256(convert_to((family_after)::text,'UTF8')),'hex');
END;
$v6$;
ROLLBACK;
