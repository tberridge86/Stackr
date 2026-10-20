-- PRIVATE V5 COMMIT CANDIDATE. NOT AUTHORIZED TO EXECUTE. NULL plan fails closed.
-- Uses V4 one-row/two-field mutation only. No staging lifecycle/cvv setup.
-- Unlike immutable V4 rehearsal, this separate candidate COMMITs only after all
-- guards/receipt creation pass and returns the actual receipt in a final SELECT.
-- A returned receipt is commit evidence only with successful whole-call status.
-- Session GUC transports public catalogue receipt; it creates no database row.
-- PRIVATE V4: one association; exact existing approved-asset reuse branch.
-- Default-blocked proposal, not live authorization. Fresh exact diagnostics,
-- existing exact approval receipt, independent review, staging rehearsal and concrete
-- owner write authorization are required before materialization and execution.
-- Change ONLY one existing published catalogue_version_assets association's
-- printing_id and variant_id. Preserve ALL canonical variant fields, timestamps,
-- metadata/aliases and other memberships; no original asset or object changes.
-- NULL plan blocks by default; this separately reviewed V5 candidate has an explicit COMMIT.
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
SET LOCAL search_path = pg_catalog;
SET LOCAL TIME ZONE 'UTC';
SELECT set_config('stackr.jungle_production_receipt','',false);
DO $repair$
DECLARE
  prepared_plan jsonb := NULL; -- MATERIALIZE_APPROVED_PLAN_JSON_HERE
  actual_contract jsonb;
  actual_before jsonb;
  actual_after jsonb;
  asset_before jsonb;
  selected_before jsonb;
  association jsonb;
  affected integer;
  rpc_before jsonb; rpc_after jsonb; facts_before jsonb; facts_after jsonb; receipt jsonb;
BEGIN
  IF prepared_plan IS NULL OR prepared_plan->>'targetProject' IS DISTINCT FROM 'oakdbbzdqwurpjnoqhmu'
 OR prepared_plan->>'executionMode' IS DISTINCT FROM 'commit_one_association'
 OR coalesce(prepared_plan->>'independentReviewReceiptSha256','') !~ '^[0-9a-f]{64}$'
 OR prepared_plan->>'stagingOutcomeReceiptSha256' IS DISTINCT FROM 'e43c8e3b14d7bcfcea85bdf33af0115f60beae11489926eacfd38032d16dfb8c'
 OR prepared_plan->>'stagingEffectiveSqlSha256' IS DISTINCT FROM 'c4b383672578aded3f646a1af29f6524b062839bdaa6803c608a44899455311e' THEN
 RAISE EXCEPTION 'HOLD_V5_AUTHORITY: exact production target/mode, V6 evidence and owner/review binding required'; END IF;
  IF prepared_plan IS NULL OR prepared_plan->>'planId' IS DISTINCT FROM 'AR-JUNGLE60-EXACT-REBIND'
    OR NOT prepared_plan ?& ARRAY['planId', 'diagnosticsSha256', 'sourceRightsReceiptSha256',
      'independentReviewReceiptSha256', 'ownerWriteAuthorizationReceiptSha256',
      'contractSha256', 'beforeRowsSha256', 'beforeRows', 'sourceRightsMode', 'existingApprovalEvidence', 'existingApprovalEvidenceReceiptSha256']
    OR coalesce(prepared_plan->>'diagnosticsSha256', '') !~ '^[0-9a-f]{64}$'
    OR coalesce(prepared_plan->>'sourceRightsReceiptSha256', '') !~ '^[0-9a-f]{64}$'
    OR coalesce(prepared_plan->>'independentReviewReceiptSha256', '') !~ '^[0-9a-f]{64}$'
    OR coalesce(prepared_plan->>'ownerWriteAuthorizationReceiptSha256', '') !~ '^[0-9a-f]{64}$'
    OR coalesce(prepared_plan->>'contractSha256', '') !~ '^[0-9a-f]{64}$'
    OR coalesce(prepared_plan->>'beforeRowsSha256', '') !~ '^[0-9a-f]{64}$'
    OR prepared_plan->'beforeRows' IS NULL
    OR prepared_plan->>'sourceRightsMode' IS DISTINCT FROM 'reuse_existing_exact_approved_asset'
    OR coalesce(prepared_plan->>'existingApprovalEvidenceReceiptSha256', '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'HOLD: materialized, reviewed and authorized exact plan is missing';
  END IF;
  -- Lock the exact existing rows, never a whole catalogue or collector table.
  PERFORM 1 FROM catalog.catalogue_versions WHERE id = 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8' FOR SHARE;
  PERFORM 1 FROM catalog.sets WHERE id = '739d2f18-1dd0-45dc-ba58-2195d5760ed5' FOR SHARE;
  PERFORM 1 FROM catalog.card_printings WHERE id = '7f7c3925-368d-4cbc-8e37-415b6ceb4bda' FOR SHARE;
  PERFORM 1 FROM catalog.card_concepts WHERE id =
    (SELECT card_concept_id FROM catalog.card_printings WHERE id = '7f7c3925-368d-4cbc-8e37-415b6ceb4bda') FOR SHARE;
  PERFORM 1 FROM catalog.assets WHERE asset_id = '0d6fe9c6-58c6-46a3-8f13-88c4352b8791' FOR SHARE;
  PERFORM 1 FROM ingest.sources WHERE id =
    (SELECT source_id FROM catalog.assets WHERE asset_id = '0d6fe9c6-58c6-46a3-8f13-88c4352b8791') FOR SHARE;
  PERFORM 1 FROM catalog.card_variants WHERE id = 'ccac455c-42b0-4344-9fd1-285ed8756e75' FOR SHARE;
  PERFORM 1 FROM catalog.card_variants WHERE id = '2f89247e-d3cd-4ec0-88e3-baff0f60252c' FOR SHARE;
  PERFORM 1 FROM catalog.catalogue_version_variants WHERE variant_id = '2f89247e-d3cd-4ec0-88e3-baff0f60252c'
    ORDER BY catalogue_version_id FOR SHARE;
  PERFORM 1 FROM catalog.catalogue_version_assets WHERE asset_id =
    (SELECT id FROM catalog.assets WHERE asset_id = '0d6fe9c6-58c6-46a3-8f13-88c4352b8791')
    ORDER BY catalogue_version_id FOR SHARE;
  PERFORM 1 FROM catalog.catalogue_version_assets
    WHERE catalogue_version_id = 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8' AND asset_id =
      (SELECT id FROM catalog.assets WHERE asset_id = '0d6fe9c6-58c6-46a3-8f13-88c4352b8791') FOR UPDATE;
  SELECT jsonb_build_object(
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
) INTO actual_contract;
  IF encode(sha256(convert_to((actual_contract)::text, 'UTF8')), 'hex') IS DISTINCT FROM prepared_plan->>'contractSha256' THEN
    RAISE EXCEPTION 'HOLD: schema, trigger or manifest contract changed';
  END IF;
  SELECT jsonb_build_object(
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
) INTO actual_before;
  IF actual_before IS DISTINCT FROM prepared_plan->'beforeRows'
    OR encode(sha256(convert_to((actual_before)::text, 'UTF8')), 'hex') IS DISTINCT FROM prepared_plan->>'beforeRowsSha256' THEN
    RAISE EXCEPTION 'HOLD: exact before rows changed; no retry or overwrite';
  END IF;
  asset_before := actual_before->'asset'; selected_before := actual_before->'selectedVariant';
  association := actual_before->'association';
  IF asset_before IS NULL OR selected_before IS NULL OR association IS NULL
    OR jsonb_array_length(actual_before->'assetLinksBounded') >= 9
    OR jsonb_array_length(actual_before->'selectedMembershipsBounded') >= 9
    OR asset_before->>'id' IS NULL OR asset_before->>'asset_id' IS DISTINCT FROM '0d6fe9c6-58c6-46a3-8f13-88c4352b8791'
    OR asset_before->>'asset_type' IS DISTINCT FROM 'card_image' OR asset_before->>'game_code' IS DISTINCT FROM 'pokemon'
    OR asset_before->>'variant_id' IS DISTINCT FROM 'ccac455c-42b0-4344-9fd1-285ed8756e75'
    OR asset_before->>'printing_id' IS NOT NULL OR asset_before->>'set_id' IS NOT NULL
    OR asset_before->>'permission_status' IS DISTINCT FROM 'approved' OR asset_before->>'rights_status' IS DISTINCT FROM 'approved'
    OR asset_before->>'asset_visibility' IS DISTINCT FROM 'public_catalogue'
    OR asset_before->>'publicly_servable' IS DISTINCT FROM 'true' OR asset_before->>'retention_status' IS DISTINCT FROM 'active'
    OR asset_before->>'deleted_at' IS NOT NULL OR asset_before->>'deprecated_at' IS NOT NULL OR asset_before->>'unavailable_reason' IS NOT NULL
    OR asset_before->>'storage_provider' IS DISTINCT FROM 'supabase_storage'
    OR asset_before->>'storage_bucket' IS DISTINCT FROM 'stackr-catalogue-public'
    OR asset_before->>'storage_key' IS DISTINCT FROM 'public/card_image/a7/6f/a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133/original.jpg'
    OR asset_before->>'content_sha256' IS DISTINCT FROM 'a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133'
    OR asset_before->>'width' IS DISTINCT FROM '600' OR asset_before->>'height' IS DISTINCT FROM '825'
    OR asset_before->>'byte_size' IS DISTINCT FROM '134485'
    OR nullif(asset_before->>'original_source_url', '') IS NULL
    OR actual_before#>>'{source,code}' IS DISTINCT FROM 'tcgdex'
    OR actual_before#>>'{source,licence_status}' IS DISTINCT FROM 'approved'
    OR actual_before#>>'{source,active}' IS DISTINCT FROM 'true' OR actual_before#>>'{source,deprecated_at}' IS NOT NULL
    OR actual_before#>>'{version,status}' IS DISTINCT FROM 'published'
    OR actual_before#>>'{version,language_code}' IS DISTINCT FROM 'en' OR actual_before#>>'{version,deprecated_at}' IS NOT NULL
    OR actual_before#>>'{set,game_code}' IS DISTINCT FROM 'pokemon'
    OR actual_before#>>'{set,language_code}' IS DISTINCT FROM 'en'
    OR actual_before#>>'{set,set_code}' IS DISTINCT FROM 'base2' OR actual_before#>>'{set,native_name}' IS DISTINCT FROM 'Jungle'
    OR actual_before#>>'{set,deprecated_at}' IS NOT NULL
    OR actual_before#>>'{printing,set_id}' IS DISTINCT FROM '739d2f18-1dd0-45dc-ba58-2195d5760ed5'
    OR actual_before#>>'{printing,language_code}' IS DISTINCT FROM 'en'
    OR actual_before#>>'{printing,collector_number}' IS DISTINCT FROM '60'
    OR actual_before#>>'{printing,native_name}' IS DISTINCT FROM 'Pikachu' OR actual_before#>>'{printing,deprecated_at}' IS NOT NULL
    OR selected_before->>'id' IS DISTINCT FROM '2f89247e-d3cd-4ec0-88e3-baff0f60252c' OR selected_before->>'printing_id' IS DISTINCT FROM '7f7c3925-368d-4cbc-8e37-415b6ceb4bda'
    OR selected_before->>'game_code' IS DISTINCT FROM 'pokemon' OR selected_before->>'set_id' IS DISTINCT FROM '739d2f18-1dd0-45dc-ba58-2195d5760ed5'
    OR selected_before->>'language_code' IS DISTINCT FROM 'en' OR selected_before->>'collector_number' IS DISTINCT FROM '60'
    OR selected_before->>'variant_code' IS DISTINCT FROM 'first_edition' OR selected_before->>'finish_code' IS DISTINCT FROM 'first_edition'
    OR selected_before->>'canonical_key' IS DISTINCT FROM 'pokemon:en:739d2f18-1dd0-45dc-ba58-2195d5760ed5:60:first_edition'
    OR selected_before->>'native_image_status' IS DISTINCT FROM 'same_artwork_reference'
    OR selected_before->>'same_artwork_as_variant_id' IS DISTINCT FROM 'ccac455c-42b0-4344-9fd1-285ed8756e75' OR selected_before->>'deprecated_at' IS NOT NULL
    OR actual_before#>>'{selectedMembership,catalogue_version_id}' IS DISTINCT FROM 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8'
    OR actual_before#>>'{selectedMembership,variant_id}' IS DISTINCT FROM '2f89247e-d3cd-4ec0-88e3-baff0f60252c'
    OR actual_before#>>'{selectedMembership,printing_id}' IS DISTINCT FROM '7f7c3925-368d-4cbc-8e37-415b6ceb4bda'
    OR actual_before#>>'{selectedMembership,set_id}' IS DISTINCT FROM '739d2f18-1dd0-45dc-ba58-2195d5760ed5'
    OR actual_before#>>'{selectedMembership,language_code}' IS DISTINCT FROM 'en'
    OR association->>'catalogue_version_id' IS DISTINCT FROM 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8'
    OR association->>'asset_id' IS DISTINCT FROM asset_before->>'id'
    OR association->>'language_code' IS DISTINCT FROM 'en' OR association->>'asset_type' IS DISTINCT FROM 'card_image'
    OR (association->>'set_id' IS NOT NULL AND association->>'set_id' <> '739d2f18-1dd0-45dc-ba58-2195d5760ed5')
    OR (association->>'printing_id' IS NOT NULL AND association->>'printing_id' <> '7f7c3925-368d-4cbc-8e37-415b6ceb4bda')
    OR (association->>'variant_id' IS NOT NULL AND association->>'variant_id' <> 'ccac455c-42b0-4344-9fd1-285ed8756e75') THEN
    RAISE EXCEPTION 'HOLD: rights, original, identity, membership or expected defect precondition failed';
  END IF;
  -- V4 permits this exact already-approved immutable object without inventing
  -- free-text notes. All real approval/source fields above remain mandatory;
  -- the separate evidence receipt is pinned and independently reviewed.
  IF prepared_plan#>>'{existingApprovalEvidence,approvalScope}' IS DISTINCT FROM 'reuse_existing_exact_approved_immutable_asset'
    OR prepared_plan#>>'{existingApprovalEvidence,assetPublicId}' IS DISTINCT FROM asset_before->>'asset_id'
    OR prepared_plan#>>'{existingApprovalEvidence,assetRowId}' IS DISTINCT FROM asset_before->>'id'
    OR prepared_plan#>>'{existingApprovalEvidence,sourceId}' IS DISTINCT FROM asset_before->>'source_id'
    OR prepared_plan#>>'{existingApprovalEvidence,sourceCode}' IS DISTINCT FROM actual_before#>>'{source,code}'
    OR prepared_plan#>>'{existingApprovalEvidence,sourceActive}' IS DISTINCT FROM 'true'
    OR prepared_plan#>>'{existingApprovalEvidence,sourceLicenceStatus}' IS DISTINCT FROM 'approved'
    OR prepared_plan#>>'{existingApprovalEvidence,sourceDeprecatedAt}' IS NOT NULL
    OR prepared_plan#>>'{existingApprovalEvidence,assetPermissionStatus}' IS DISTINCT FROM 'approved'
    OR prepared_plan#>>'{existingApprovalEvidence,assetRightsStatus}' IS DISTINCT FROM 'approved'
    OR prepared_plan#>>'{existingApprovalEvidence,originalSourceUrl}' IS DISTINCT FROM asset_before->>'original_source_url'
    OR prepared_plan#>>'{existingApprovalEvidence,originalSourceIdentifier}' IS DISTINCT FROM asset_before->>'original_source_identifier'
    OR prepared_plan#>>'{existingApprovalEvidence,contentSha256}' IS DISTINCT FROM asset_before->>'content_sha256'
    OR prepared_plan#>>'{existingApprovalEvidence,immutableStorageKey}' IS DISTINCT FROM asset_before->>'storage_key'
    OR prepared_plan#>'{existingApprovalEvidence,licensingReviewNotes}' IS DISTINCT FROM asset_before->'licensing_review_notes'
    OR prepared_plan#>>'{existingApprovalEvidence,sourceWideGrantInferred}' IS DISTINCT FROM 'false'
    OR prepared_plan#>>'{existingApprovalEvidence,newPermissionOrApprovalCreated}' IS DISTINCT FROM 'false'
    OR prepared_plan#>>'{existingApprovalEvidence,sourceOrAssetApprovalFieldsChanged}' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'HOLD: exact existing approval evidence does not bind unchanged asset/source';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.catalogue_version_id,r.asset_row_id),'[]'::jsonb) INTO rpc_before
 FROM api.card_image_manifest_for_identities(ARRAY['2f89247e-d3cd-4ec0-88e3-baff0f60252c','ccac455c-42b0-4344-9fd1-285ed8756e75']::uuid[],ARRAY['7f7c3925-368d-4cbc-8e37-415b6ceb4bda']::uuid[],NULL,NULL,50) r;
  IF jsonb_array_length(rpc_before)<>1 OR rpc_before#>>'{0,asset_row_id}' IS DISTINCT FROM '0d6fe9c6-58c6-46a3-8f13-88c4352b8791'
   OR rpc_before#>>'{0,variant_id}' IS DISTINCT FROM 'ccac455c-42b0-4344-9fd1-285ed8756e75'
   OR rpc_before#>>'{0,content_sha256}' IS DISTINCT FROM 'a76fe3dcd6a1d16129a1628975a574318d96258c1803fad9114c5401267a9133' THEN
    RAISE EXCEPTION 'HOLD_V5_RPC_BEFORE: unexpected original association'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.variant_id),'[]'::jsonb) INTO facts_before FROM (
 SELECT c.* FROM api.catalogue_cards c WHERE c.catalogue_version_id='d6bdab54-ec11-4b54-85a9-311d6ce3b2c8'::uuid AND c.printing_id='7f7c3925-368d-4cbc-8e37-415b6ceb4bda'::uuid
 AND c.variant_id IN ('2f89247e-d3cd-4ec0-88e3-baff0f60252c'::uuid,'ccac455c-42b0-4344-9fd1-285ed8756e75'::uuid) ORDER BY c.variant_id LIMIT 3) r;
  IF jsonb_array_length(facts_before)<>2 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(facts_before) f
    WHERE f->>'variant_id'='2f89247e-d3cd-4ec0-88e3-baff0f60252c' AND f->>'variant_code'='first_edition' AND f->>'finish_code'='first_edition'
      AND f->>'native_image_status'='same_artwork_reference' AND f->>'same_artwork_as_variant_id'='ccac455c-42b0-4344-9fd1-285ed8756e75') THEN
    RAISE EXCEPTION 'HOLD_V5_FACTS_BEFORE: exact active firstedition visibility unavailable; no lifecycle remedy'; END IF;
  UPDATE catalog.catalogue_version_assets SET printing_id = '7f7c3925-368d-4cbc-8e37-415b6ceb4bda', variant_id = '2f89247e-d3cd-4ec0-88e3-baff0f60252c'
    WHERE catalogue_version_id = 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8' AND asset_id = (asset_before->>'id')::uuid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'HOLD: expected exactly one existing association'; END IF;
  SELECT jsonb_build_object(
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
) INTO actual_after;
  IF (actual_after - 'association' - 'assetLinksBounded')
      IS DISTINCT FROM (actual_before - 'association' - 'assetLinksBounded')
    OR ((actual_after->'association') - 'printing_id' - 'variant_id')
      IS DISTINCT FROM (association - 'printing_id' - 'variant_id')
    OR (SELECT coalesce(jsonb_agg(x ORDER BY x->>'catalogue_version_id'), '[]'::jsonb)
        FROM jsonb_array_elements(actual_after->'assetLinksBounded') x WHERE x->>'catalogue_version_id' <> 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8')
      IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY x->>'catalogue_version_id'), '[]'::jsonb)
        FROM jsonb_array_elements(actual_before->'assetLinksBounded') x WHERE x->>'catalogue_version_id' <> 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8')
    OR actual_after#>>'{association,printing_id}' IS DISTINCT FROM '7f7c3925-368d-4cbc-8e37-415b6ceb4bda'
    OR actual_after#>>'{association,variant_id}' IS DISTINCT FROM '2f89247e-d3cd-4ec0-88e3-baff0f60252c' THEN
    RAISE EXCEPTION 'HOLD: one-association correction changed unrelated data';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.catalogue_version_id,r.asset_row_id),'[]'::jsonb) INTO rpc_after
 FROM api.card_image_manifest_for_identities(ARRAY['2f89247e-d3cd-4ec0-88e3-baff0f60252c','ccac455c-42b0-4344-9fd1-285ed8756e75']::uuid[],ARRAY['7f7c3925-368d-4cbc-8e37-415b6ceb4bda']::uuid[],NULL,NULL,50) r;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.variant_id),'[]'::jsonb) INTO facts_after FROM (
 SELECT c.* FROM api.catalogue_cards c WHERE c.catalogue_version_id='d6bdab54-ec11-4b54-85a9-311d6ce3b2c8'::uuid AND c.printing_id='7f7c3925-368d-4cbc-8e37-415b6ceb4bda'::uuid
 AND c.variant_id IN ('2f89247e-d3cd-4ec0-88e3-baff0f60252c'::uuid,'ccac455c-42b0-4344-9fd1-285ed8756e75'::uuid) ORDER BY c.variant_id LIMIT 3) r;
  IF jsonb_array_length(rpc_after)<>1 OR rpc_after#>>'{0,variant_id}' IS DISTINCT FROM '2f89247e-d3cd-4ec0-88e3-baff0f60252c'
    OR rpc_after#>>'{0,printing_id}' IS DISTINCT FROM '7f7c3925-368d-4cbc-8e37-415b6ceb4bda'
    OR ((rpc_after->0)-'variant_id'-'printing_id') IS DISTINCT FROM ((rpc_before->0)-'variant_id'-'printing_id')
    OR facts_after IS DISTINCT FROM facts_before THEN
    RAISE EXCEPTION 'HOLD_V5_DELIVERY_SCOPE: exact RPC override or unchanged published facts failed'; END IF;
  receipt=jsonb_build_object('schemaVersion','stackr-jungle-production-receipt-v5','phase','forward_verified_before_commit',
    'targetProject','oakdbbzdqwurpjnoqhmu','stagingOutcomeReceiptSha256','e43c8e3b14d7bcfcea85bdf33af0115f60beae11489926eacfd38032d16dfb8c',
    'stagingEffectiveSqlSha256','c4b383672578aded3f646a1af29f6524b062839bdaa6803c608a44899455311e','ownerAuthorizationReceiptSha256',prepared_plan->>'ownerWriteAuthorizationReceiptSha256',
    'independentReviewReceiptSha256',prepared_plan->>'independentReviewReceiptSha256',
    'observedAt',clock_timestamp(),'contractSha256',encode(sha256(convert_to((actual_contract)::text,'UTF8')),'hex'),
    'beforeRows',actual_before,'beforeRowsSha256',encode(sha256(convert_to((actual_before)::text,'UTF8')),'hex'),
    'afterRows',actual_after,'afterRowsSha256',encode(sha256(convert_to((actual_after)::text,'UTF8')),'hex'),
    'rpcBefore',rpc_before,'rpcAfter',rpc_after,'factsBefore',facts_before,'factsAfter',facts_after,
    'affectedRows',affected,'commitRequested',true);
  PERFORM set_config('stackr.jungle_production_receipt',receipt::text,false);
END
$repair$;
COMMIT;
-- Final SELECT survives connectors that discard NOTICE and earlier results.
-- The MATERIALIZED read runs before reset; no receipt leaks into a reused session.
WITH captured AS MATERIALIZED (
 SELECT nullif(current_setting('stackr.jungle_production_receipt',true),'')::jsonb AS receipt
), cleared AS MATERIALIZED (
 SELECT set_config('stackr.jungle_production_receipt','',false) AS cleared FROM captured
)
SELECT captured.receipt AS jungle_production_receipt,cleared.cleared='' AS session_receipt_cleared
FROM captured CROSS JOIN cleared;
