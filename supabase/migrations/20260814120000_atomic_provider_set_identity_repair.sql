-- Exact, replay-safe repair for the reviewed zh-cn CSV1C/CBB1C case collision.
-- This migration is deliberately not a generic identity merge facility: every
-- project, provider byte hash, row id, projection hash, count and mutation is fixed.
-- The superseded zero-loss plan is retained only as fail-closed historical evidence;
-- its old identifier directions do not authorize either mutation below.

create table if not exists audit.provider_set_identity_repair_receipts (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  project_ref text not null check (project_ref = 'lmwfhvexfcoyeuoyrlco'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  precondition_state_sha256 text not null check (precondition_state_sha256 ~ '^[0-9a-f]{64}$'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now()
);

alter table audit.provider_set_identity_repair_receipts enable row level security;

drop policy if exists "audit service role reads provider set identity repair receipts"
  on audit.provider_set_identity_repair_receipts;
create policy "audit service role reads provider set identity repair receipts"
  on audit.provider_set_identity_repair_receipts
  for select to service_role using (true);

drop policy if exists "audit service role inserts provider set identity repair receipts"
  on audit.provider_set_identity_repair_receipts;
create policy "audit service role inserts provider set identity repair receipts"
  on audit.provider_set_identity_repair_receipts
  for insert to service_role with check (true);

revoke all on table audit.provider_set_identity_repair_receipts
  from public, anon, authenticated, service_role;
grant select, insert on table audit.provider_set_identity_repair_receipts
  to service_role;

create or replace function api.apply_reviewed_provider_set_identity_repair(
  p_request_id text,
  p_project_ref text,
  p_attempt_started_at text,
  p_apply boolean,
  p_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_empty_set_id constant uuid := '1f2add00-9ae7-4a7e-9b01-2e8f0fb8e059';
  v_csv_set_id constant uuid := '31225f01-ead5-4e8d-83f8-c06978e706da';
  v_cbb_set_id constant uuid := '6fddd811-836e-4304-8d28-f36caef0d044';
  v_existing_cbb_identifier_id constant uuid := '1e3a30de-558a-4b23-a14b-cbbfa697f142';
  v_new_csv_identifier_id constant uuid := 'b7575e3b-8911-41b8-bb54-8105aa297569';
  v_tcgdex_source_id constant uuid := 'c18bc87f-e4db-434c-9353-a2306136af47';
  v_existing_cbb_raw_record_id constant uuid := 'f979ea63-81d6-4651-b853-bd22bb076d96';
  v_new_csv_raw_record_id constant uuid := 'aed9683b-5ccc-4b32-9cc5-966437785579';
  v_existing_cbb_payload_sha256 constant text := 'e1192ebc75912230cde853febc5b3bf4b287007cd2cff801fd4e05e48b0af7e3';
  v_new_csv_payload_sha256 constant text := '18d91af85fe219f3655cfcc07f7fc0957223ad0c9ffd2a00d33b7971baf4effe';
  v_expected_evidence constant jsonb := jsonb_build_object(
    'dependencyLedgerSha256', 'c38ceeb1af7246fc35ef1cafe2bd5fb38c97689aff6b0e6f8101e83c5e5878e4',
    'dependencyQuerySha256', 'a5ada0c318bfad62f7f08bd1ed6528be681b725c3a0ac727c7e4a9345b1a6df2',
    'dependencySnapshotSha256', '0b09a06f3b1eab96857707437cb0b45628b02803f8df33c869d538b026ca8474',
    'existingCbb1cRawPayloadSha256', 'e1192ebc75912230cde853febc5b3bf4b287007cd2cff801fd4e05e48b0af7e3',
    'githubCbb1cSourceResponseSha256', 'bd9a27ada31dcc71197ba253476999fae00e3b309a4724e03bfd8669bd553818',
    'githubCommitResponseSha256', '0182ef3fa3fbf822efaded0ec615ed941d8143f3ffdb9998fe7f007c6c55ddf4',
    'githubCommitSha', 'ccb9cef3f9a545be89cd5e716cc1c72f99070bac',
    'githubCsv1cSourceResponseSha256', '1224d60892407d81b0eacbdd0550a88f3fe75b348427e829d9842f4151ba098d',
    'newCsv1cRawPayloadSha256', '18d91af85fe219f3655cfcc07f7fc0957223ad0c9ffd2a00d33b7971baf4effe',
    'providerResolutionEvidenceId', 'provider-resolution:2026-08-14:42a5f7613be7f7e92c71d286',
    'providerResolutionManifestSha256', '36bb85d319cfb1b17bede1ac06f99ba428b560c8a34e9b6b690607e00a2e7560',
    'providerSetListResponseSha256', '69170515af0564d353d0400905ccbb759ee402455a88021f433453fe23f056da',
    'supersededRepairPlanSha256', 'd97125c6b51c5c24bf2a42fee8d414dee9b85b6eebc01ffc5a430737e78200a2',
    'supersededZeroLossContractSha256', 'b4164aa26d46d8e41a649dc59675aee4de0f076e33cdd8d77bc9cb9bbb18cfd0',
    'supersededZeroLossEvidenceId', 'zero-loss-canonical-repair:2026-08-14:6c196cd23eacab1db2179316',
    'supersededZeroLossEvidenceSha256', '473192e0aebd27bf02b7f28c12caf56223691502631353db348cba403a1be9df',
    'supersededZeroLossManifestSha256', '71cbe445ef0c3ceebf703a12a025230ea88d1e3f906b7d627e590a6d75962e15'
  );
  v_request_id text := btrim(p_request_id);
  v_attempt_started_at timestamptz;
  v_payload_sha256 text;
  v_existing_payload_sha256 text;
  v_existing_result jsonb;
  v_empty_projection_sha256 text;
  v_csv_projection_sha256 text;
  v_cbb_projection_sha256 text;
  v_identifier_projection_sha256 text;
  v_historical_set_projection_sha256 text;
  v_historical_identifier_projection_sha256 text;
  v_precondition_state jsonb;
  v_precondition_state_sha256 text;
  v_result jsonb;
  v_existing_identifier ingest.external_identifiers%rowtype;
  v_existing_raw ingest.raw_source_records%rowtype;
  v_updated_rows integer;
  v_inserted_rows integer;
  v_empty_printings integer;
  v_empty_variants integer;
  v_empty_assets integer;
  v_empty_names integer;
  v_empty_products integer;
  v_empty_incoming_successors integer;
  v_csv_printings integer;
  v_csv_variants integer;
  v_cbb_printings integer;
  v_cbb_variants integer;
  v_historical_set_rows integer;
  v_historical_identifier_rows integer;
begin
  if v_request_id is null or v_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$' then
    raise exception 'Provider set identity repair request_id is invalid.' using errcode = '22023';
  end if;
  if p_project_ref is distinct from 'lmwfhvexfcoyeuoyrlco' then
    raise exception 'Provider set identity repair is restricted to the exact staging project.' using errcode = '22023';
  end if;
  if p_apply is null then
    raise exception 'Provider set identity repair mode is required.' using errcode = '22023';
  end if;
  if p_attempt_started_at is null
    or p_attempt_started_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
    raise exception 'Provider set identity repair attempt_started_at is invalid.' using errcode = '22023';
  end if;
  v_attempt_started_at := p_attempt_started_at::timestamptz;
  if v_attempt_started_at < pg_catalog.clock_timestamp() - interval '15 minutes'
    or v_attempt_started_at > pg_catalog.clock_timestamp() + interval '60 seconds' then
    raise exception 'Provider set identity repair attempt is stale or future-dated.' using errcode = '22023';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object'
    or p_evidence is distinct from v_expected_evidence then
    raise exception 'Provider set identity repair evidence does not match the fixed reviewed bundle.' using errcode = '22023';
  end if;

  v_payload_sha256 := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
      'evidence', p_evidence,
      'projectRef', p_project_ref
    )::text, 'UTF8')),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stackr:provider-set-identity:' || v_request_id, 0)
  );

  select payload_sha256, result
  into v_existing_payload_sha256, v_existing_result
  from audit.provider_set_identity_repair_receipts
  where request_id = v_request_id;

  if found then
    if not p_apply then
      raise exception 'An applied request_id cannot be reused as a dry run.' using errcode = '23505';
    end if;
    if v_existing_payload_sha256 is distinct from v_payload_sha256 then
      raise exception 'Provider set identity repair request_id was already used for different evidence.' using errcode = '23505';
    end if;
    return jsonb_set(v_existing_result, '{replayed}', 'true'::jsonb, true);
  end if;

  -- Prevent phantoms while the bounded dependency census and mutations run.
  lock table
    catalog.sets, catalog.card_printings, catalog.card_variants,
    catalog.card_names, catalog.assets, catalog.sealed_products,
    ingest.sources, ingest.raw_source_records, ingest.external_identifiers,
    catalog.catalogue_version_sets, catalog.catalogue_version_external_identifiers
  in share row exclusive mode;

  -- Lock every mutable row before checking the reviewed pre-state.
  perform 1
  from catalog.sets
  where id in (v_empty_set_id, v_csv_set_id, v_cbb_set_id)
  order by id
  for update;
  if not found or (select count(*) from catalog.sets where id in (v_empty_set_id, v_csv_set_id, v_cbb_set_id)) <> 3 then
    raise exception 'One or more reviewed canonical set rows are absent.' using errcode = 'P0001';
  end if;

  select * into v_existing_identifier
  from ingest.external_identifiers
  where id = v_existing_cbb_identifier_id
  for update;
  if not found then
    raise exception 'The reviewed raw-bound Gem Pack identifier row is absent.' using errcode = 'P0001';
  end if;

  select * into v_existing_raw
  from ingest.raw_source_records
  where id = v_existing_cbb_raw_record_id
  for update;
  if not found then
    raise exception 'The reviewed Gem Pack raw record is absent.' using errcode = 'P0001';
  end if;
  if exists (select 1 from ingest.raw_source_records where id = v_new_csv_raw_record_id)
    or exists (select 1 from ingest.external_identifiers where id = v_new_csv_identifier_id) then
    raise exception 'A fixed corrective insert UUID is already occupied.' using errcode = 'P0001';
  end if;

  -- Reproduce the projection hashes from the reviewed zero-loss dependency read.
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
    'id', s.id, 'gameCode', s.game_code, 'languageCode', s.language_code,
    'setCode', s.set_code, 'providerSetCode', s.provider_set_code,
    'nativeName', s.native_name, 'englishDisplayName', s.english_display_name,
    'releaseDate', s.release_date, 'printedTotal', s.printed_total, 'total', s.total,
    'deprecatedAt', s.deprecated_at, 'correctedBySetId', s.corrected_by_set_id
  )::text, 'UTF8')), 'hex')
  into v_empty_projection_sha256 from catalog.sets s where s.id = v_empty_set_id;
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
    'id', s.id, 'gameCode', s.game_code, 'languageCode', s.language_code,
    'setCode', s.set_code, 'providerSetCode', s.provider_set_code,
    'nativeName', s.native_name, 'englishDisplayName', s.english_display_name,
    'releaseDate', s.release_date, 'printedTotal', s.printed_total, 'total', s.total,
    'deprecatedAt', s.deprecated_at, 'correctedBySetId', s.corrected_by_set_id
  )::text, 'UTF8')), 'hex')
  into v_csv_projection_sha256 from catalog.sets s where s.id = v_csv_set_id;
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
    'id', s.id, 'gameCode', s.game_code, 'languageCode', s.language_code,
    'setCode', s.set_code, 'providerSetCode', s.provider_set_code,
    'nativeName', s.native_name, 'englishDisplayName', s.english_display_name,
    'releaseDate', s.release_date, 'printedTotal', s.printed_total, 'total', s.total,
    'deprecatedAt', s.deprecated_at, 'correctedBySetId', s.corrected_by_set_id
  )::text, 'UTF8')), 'hex')
  into v_cbb_projection_sha256 from catalog.sets s where s.id = v_cbb_set_id;
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
    'id', e.id, 'sourceId', e.source_id, 'rawRecordId', e.raw_record_id,
    'sourceEntityType', e.source_entity_type, 'externalId', e.external_id,
    'languageCode', e.language_code, 'setId', e.set_id, 'printingId', e.printing_id,
    'variantId', e.variant_id, 'assetId', e.asset_id,
    'confidence', e.confidence, 'isCurrent', e.is_current, 'deprecatedAt', e.deprecated_at
  )::text, 'UTF8')), 'hex')
  into v_identifier_projection_sha256
  from ingest.external_identifiers e where e.id = v_existing_cbb_identifier_id;
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
    'catalogueVersionId', cvs.catalogue_version_id, 'setId', cvs.set_id,
    'languageCode', cvs.language_code, 'setCode', cvs.set_code,
    'setStatus', cvs.set_status, 'createdAt', cvs.created_at
  )::text, 'UTF8')), 'hex')
  into v_historical_set_projection_sha256
  from catalog.catalogue_version_sets cvs
  where cvs.catalogue_version_id = '79f43e8f-7062-4d29-8571-569eccb7c249'
    and cvs.set_id = v_empty_set_id;
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
    'catalogueVersionId', cve.catalogue_version_id, 'sourceId', cve.source_id,
    'sourceEntityType', cve.source_entity_type, 'externalId', cve.external_id,
    'languageCode', cve.language_code, 'setId', cve.set_id,
    'printingId', cve.printing_id, 'variantId', cve.variant_id,
    'confidence', cve.confidence, 'createdAt', cve.created_at
  )::text, 'UTF8')), 'hex')
  into v_historical_identifier_projection_sha256
  from catalog.catalogue_version_external_identifiers cve
  where cve.catalogue_version_id = '79f43e8f-7062-4d29-8571-569eccb7c249'
    and cve.source_id = v_tcgdex_source_id and cve.source_entity_type = 'set'
    and cve.external_id = 'CSV1C' and cve.language_code = 'zh-cn';

  if v_empty_projection_sha256 <> 'ec706aef58c3e2648b9bfba2eae5eaae036566458581003a802e2ac067adeb9d'
    or v_csv_projection_sha256 <> 'b2e706ff8f2a12bd5971f8fe034298ae0f5f72ada20c0a41c3fcac47fb6e2882'
    or v_cbb_projection_sha256 <> '4c750da6f957ebe96a83ff93679378a593067b91c287178f015b5ba109978f77'
    or v_identifier_projection_sha256 <> '522dddccf673d19457c808da25be6a38c04b03886d9ce3e2a02d4481232178de'
    or v_historical_set_projection_sha256 <> '43f8cc6ac340dd68de804baca7197901984409365b286a66e340adbb1ccaa890'
    or v_historical_identifier_projection_sha256 <> 'c78a7b604ce4246069391e63b3a1d86054fff106ff277b727e140c212b99a9d6' then
    raise exception 'A reviewed set or identifier projection has drifted.' using errcode = 'P0001';
  end if;

  if v_existing_identifier.source_id <> v_tcgdex_source_id
    or v_existing_identifier.raw_record_id <> v_existing_cbb_raw_record_id
    or v_existing_identifier.source_entity_type <> 'set'
    or v_existing_identifier.external_id <> 'CSV1C'
    or v_existing_identifier.game_code <> 'pokemon'
    or v_existing_identifier.language_code <> 'zh-cn'
    or v_existing_identifier.set_id <> v_empty_set_id
    or not v_existing_identifier.is_current
    or v_existing_identifier.deprecated_at is not null then
    raise exception 'The reviewed raw-bound Gem Pack identifier provenance has drifted.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from ingest.sources s
    where s.id = v_tcgdex_source_id and s.code = 'tcgdex'
      and s.active and s.deprecated_at is null and s.licence_status = 'approved'
  ) then
    raise exception 'The fixed TCGdex source is not active and approved.' using errcode = 'P0001';
  end if;
  if v_existing_raw.source_id <> v_tcgdex_source_id
    or v_existing_raw.record_type <> 'set'
    or v_existing_raw.external_id <> 'CSV1C'
    or v_existing_raw.language_code <> 'zh-cn'
    or v_existing_raw.deprecated_at is not null
    or v_existing_raw.licence_status <> 'approved'
    or v_existing_raw.payload_hash <> v_existing_cbb_payload_sha256
    or v_existing_raw.raw_payload is distinct from jsonb_build_object(
      'id', 'CSV1C',
      'name', '宝石包 第一卷',
      'cardCount', jsonb_build_object('total', 9, 'official', 9)
    ) then
    raise exception 'The fixed Gem Pack raw-record bytes are absent, drifted, or no longer approved.' using errcode = 'P0001';
  end if;
  if pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      '{"cardCount":{"official":9,"total":9},"id":"CSV1C","name":"宝石包 第一卷"}', 'UTF8'
    )), 'hex') <> v_existing_cbb_payload_sha256
    or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      '{"cardCount":{"official":127,"total":127},"id":"CSV1C","name":"亘古开来"}', 'UTF8'
    )), 'hex') <> v_new_csv_payload_sha256 then
    raise exception 'The fixed provider payload literals do not match their reviewed stable hashes.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from ingest.raw_source_records r
    where r.source_id = v_tcgdex_source_id and r.record_type = 'set'
      and r.language_code = 'zh-cn'
      and (
        r.payload_hash = v_new_csv_payload_sha256
        or r.raw_payload is not distinct from jsonb_build_object(
          'id', 'CSV1C',
          'name', '亘古开来',
          'cardCount', jsonb_build_object('total', 127, 'official', 127)
        )
      )
  ) then
    raise exception 'A retained Eternal Birth raw row already exists; corrective review must be refreshed.' using errcode = 'P0001';
  end if;

  select count(*) into v_empty_printings from catalog.card_printings where set_id = v_empty_set_id;
  select count(*) into v_empty_variants from catalog.card_variants where set_id = v_empty_set_id;
  select count(*) into v_empty_assets from catalog.assets where set_id = v_empty_set_id;
  select count(*) into v_empty_names
  from catalog.card_names n
  where n.printing_id in (select id from catalog.card_printings where set_id = v_empty_set_id)
     or n.variant_id in (select id from catalog.card_variants where set_id = v_empty_set_id);
  select count(*) into v_empty_products from catalog.sealed_products where set_id = v_empty_set_id;
  select count(*) into v_empty_incoming_successors from catalog.sets where corrected_by_set_id = v_empty_set_id;
  select count(*) into v_csv_printings from catalog.card_printings where set_id = v_csv_set_id;
  select count(*) into v_csv_variants from catalog.card_variants where set_id = v_csv_set_id;
  select count(*) into v_cbb_printings from catalog.card_printings where set_id = v_cbb_set_id;
  select count(*) into v_cbb_variants from catalog.card_variants where set_id = v_cbb_set_id;
  select count(*) into v_historical_set_rows
  from catalog.catalogue_version_sets where set_id = v_empty_set_id;
  select count(*) into v_historical_identifier_rows
  from catalog.catalogue_version_external_identifiers where set_id = v_empty_set_id;

  if (v_empty_printings, v_empty_variants, v_empty_assets, v_empty_names, v_empty_products, v_empty_incoming_successors)
      is distinct from (0, 0, 0, 0, 0, 0)
    or (v_csv_printings, v_csv_variants, v_cbb_printings, v_cbb_variants)
      is distinct from (167, 393, 115, 115)
    or (v_historical_set_rows, v_historical_identifier_rows) is distinct from (1, 1) then
    raise exception 'Zero-loss dependency counts differ from the reviewed state.' using errcode = 'P0001';
  end if;
  if (select count(*) from ingest.external_identifiers where set_id = v_empty_set_id) <> 1
    or exists (
      select 1 from ingest.external_identifiers
      where source_id = v_tcgdex_source_id and source_entity_type = 'set'
        and language_code = 'zh-cn' and external_id in ('CSV1C', 'CBB1C')
        and is_current and deprecated_at is null and id <> v_existing_cbb_identifier_id
    ) then
    raise exception 'Exact current CSV1C/CBB1C identifier cardinality has drifted.' using errcode = 'P0001';
  end if;

  v_precondition_state := jsonb_build_object(
    'emptySet', jsonb_build_object(
      'assets', v_empty_assets, 'historicalIdentifierRows', v_historical_identifier_rows,
      'historicalSetRows', v_historical_set_rows, 'names', v_empty_names,
      'printings', v_empty_printings, 'products', v_empty_products, 'variants', v_empty_variants
    ),
    'populatedSets', jsonb_build_object(
      'cbb1c', jsonb_build_object('printings', v_cbb_printings, 'variants', v_cbb_variants),
      'csv1c', jsonb_build_object('printings', v_csv_printings, 'variants', v_csv_variants)
    ),
    'projectionSha256', jsonb_build_object(
      'cbbSet', v_cbb_projection_sha256, 'misboundGemPackIdentifier', v_identifier_projection_sha256,
      'csvSet', v_csv_projection_sha256, 'emptySet', v_empty_projection_sha256,
      'historicalIdentifier', v_historical_identifier_projection_sha256,
      'historicalSet', v_historical_set_projection_sha256
    ),
    'rawProvenance', jsonb_build_object(
      'existingCbb1cRawRecordId', v_existing_cbb_raw_record_id,
      'existingCbb1cRawPayloadSha256', v_existing_cbb_payload_sha256,
      'newCsv1cRawRecordIdAbsent', true,
      'newCsv1cIdentifierIdAbsent', true,
      'newCsv1cRawPayloadAbsent', true,
      'newCsv1cRawPayloadSha256', v_new_csv_payload_sha256
    )
  );
  v_precondition_state_sha256 := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_precondition_state::text, 'UTF8')), 'hex'
  );

  if not p_apply then
    return jsonb_build_object(
      'schemaVersion', '2.0.0', 'receiptType', 'provider_set_identity_repair',
      'requestId', v_request_id, 'projectRef', p_project_ref,
      'mode', 'validated_dry_run', 'applied', false, 'replayed', false,
      'payloadSha256', v_payload_sha256,
      'preconditionStateSha256', v_precondition_state_sha256,
      'preconditionState', v_precondition_state,
      'evidence', p_evidence, 'noRowsDeleted', true,
      'historicalPublicationRowsMutated', 0
    );
  end if;

  update ingest.external_identifiers
  set
    external_id = 'CBB1C',
    set_id = v_cbb_set_id,
    updated_at = pg_catalog.transaction_timestamp()
  where id = v_existing_cbb_identifier_id
    and raw_record_id = v_existing_cbb_raw_record_id
    and set_id = v_empty_set_id and source_id = v_tcgdex_source_id
    and external_id = 'CSV1C' and language_code = 'zh-cn'
    and is_current and deprecated_at is null;
  get diagnostics v_updated_rows = row_count;
  if v_updated_rows <> 1 then
    raise exception 'Raw-bound Gem Pack identifier rekey lost its exact precondition.' using errcode = 'P0001';
  end if;

  insert into ingest.raw_source_records (
    id, source_id, import_run_id, record_type, external_id, language_code,
    source_url, retrieved_at, source_updated_at, licence_status,
    attribution_text, payload_hash, raw_payload, internal_notes,
    deprecated_at, deprecated_reason
  ) values (
    v_new_csv_raw_record_id,
    v_tcgdex_source_id,
    null,
    'set',
    'CSV1C',
    'zh-cn',
    'https://api.tcgdex.net/v2/zh-cn/sets',
    '2026-08-14T00:35:00.000Z'::timestamptz,
    '2026-08-13T20:08:43.000Z'::timestamptz,
    'approved',
    'TCGdex cards-database metadata at signed commit ccb9cef3f9a545be89cd5e716cc1c72f99070bac.',
    v_new_csv_payload_sha256,
    jsonb_build_object(
      'id', 'CSV1C',
      'name', '亘古开来',
      'cardCount', jsonb_build_object('total', 127, 'official', 127)
    ),
    jsonb_build_object(
      'provenanceType', 'reviewed_hash_bound_provider_bytes',
      'providerSetListPath', 'reports/catalogue/provider-resolution/2026-08-14/raw/tcgdex-zh-cn-sets.json',
      'providerSetListResponseSha256', '69170515af0564d353d0400905ccbb759ee402455a88021f433453fe23f056da',
      'githubCommitSha', 'ccb9cef3f9a545be89cd5e716cc1c72f99070bac',
      'githubCommitResponseSha256', '0182ef3fa3fbf822efaded0ec615ed941d8143f3ffdb9998fe7f007c6c55ddf4',
      'githubCommitSignatureVerified', true,
      'githubCsv1cSourcePath', 'data-asia/SV/CSV1C.ts',
      'githubCsv1cSourceResponseSha256', '1224d60892407d81b0eacbdd0550a88f3fe75b348427e829d9842f4151ba098d',
      'githubCbb1cSourcePath', 'data-asia/SV/CBB1C.ts',
      'githubCbb1cSourceResponseSha256', 'bd9a27ada31dcc71197ba253476999fae00e3b309a4724e03bfd8669bd553818',
      'fabricatedEndpointFetch', false
    )::text,
    null,
    null
  );
  get diagnostics v_inserted_rows = row_count;
  if v_inserted_rows <> 1 then
    raise exception 'CSV1C raw-record insertion did not affect exactly one row.' using errcode = 'P0001';
  end if;

  insert into ingest.external_identifiers (
    id, source_id, raw_record_id, source_entity_type, external_id, external_uri,
    game_code, language_code, set_id, confidence, is_current,
    source_updated_at, deprecated_at, deprecated_reason
  ) values (
    v_new_csv_identifier_id,
    v_tcgdex_source_id,
    v_new_csv_raw_record_id,
    'set',
    'CSV1C',
    null,
    v_existing_identifier.game_code,
    'zh-cn',
    v_csv_set_id,
    v_existing_identifier.confidence,
    true,
    '2026-08-13T20:08:43.000Z'::timestamptz,
    null,
    null
  );
  get diagnostics v_inserted_rows = row_count;
  if v_inserted_rows <> 1 then
    raise exception 'CSV1C identifier insertion did not affect exactly one row.' using errcode = 'P0001';
  end if;

  update catalog.sets
  set
    corrected_by_set_id = v_cbb_set_id,
    deprecated_at = pg_catalog.transaction_timestamp(),
    deprecated_reason = 'reviewed_case_variant_collision_repaired',
    updated_at = pg_catalog.transaction_timestamp()
  where id = v_empty_set_id and deprecated_at is null and corrected_by_set_id is null;
  get diagnostics v_updated_rows = row_count;
  if v_updated_rows <> 1 then
    raise exception 'Empty CSV1C collision row deprecation lost its exact precondition.' using errcode = 'P0001';
  end if;

  insert into catalog.catalogue_change_log (
    entity_schema, entity_table, entity_id, entity_key,
    change_type, mobile_syncable, public_change_summary
  ) values (
    'catalog', 'sets', v_empty_set_id, 'pokemon:zh-cn:CSV1C',
    'deprecate', true,
    jsonb_build_object(
      'reason', 'reviewed_case_variant_collision_repaired',
      'correctedBySetId', v_cbb_set_id,
      'insertedCsv1cIdentifierId', v_new_csv_identifier_id,
      'insertedCsv1cRawRecordId', v_new_csv_raw_record_id,
      'rekeyedCbb1cIdentifierId', v_existing_cbb_identifier_id,
      'requestId', v_request_id
    )
  );

  -- Postconditions: all card identity rows and immutable publication history survive.
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
    'catalogueVersionId', cvs.catalogue_version_id, 'setId', cvs.set_id,
    'languageCode', cvs.language_code, 'setCode', cvs.set_code,
    'setStatus', cvs.set_status, 'createdAt', cvs.created_at
  )::text, 'UTF8')), 'hex')
  into v_historical_set_projection_sha256
  from catalog.catalogue_version_sets cvs
  where cvs.catalogue_version_id = '79f43e8f-7062-4d29-8571-569eccb7c249'
    and cvs.set_id = v_empty_set_id;
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
    'catalogueVersionId', cve.catalogue_version_id, 'sourceId', cve.source_id,
    'sourceEntityType', cve.source_entity_type, 'externalId', cve.external_id,
    'languageCode', cve.language_code, 'setId', cve.set_id,
    'printingId', cve.printing_id, 'variantId', cve.variant_id,
    'confidence', cve.confidence, 'createdAt', cve.created_at
  )::text, 'UTF8')), 'hex')
  into v_historical_identifier_projection_sha256
  from catalog.catalogue_version_external_identifiers cve
  where cve.catalogue_version_id = '79f43e8f-7062-4d29-8571-569eccb7c249'
    and cve.source_id = v_tcgdex_source_id and cve.source_entity_type = 'set'
    and cve.external_id = 'CSV1C' and cve.language_code = 'zh-cn';

  if (select count(*) from catalog.card_printings where set_id in (v_csv_set_id, v_cbb_set_id)) <> 282
    or (select count(*) from catalog.card_variants where set_id in (v_csv_set_id, v_cbb_set_id)) <> 508
    or (select count(*) from catalog.catalogue_version_sets where set_id = v_empty_set_id) <> 1
    or (select count(*) from catalog.catalogue_version_external_identifiers where set_id = v_empty_set_id) <> 1
    or v_historical_set_projection_sha256 <> '43f8cc6ac340dd68de804baca7197901984409365b286a66e340adbb1ccaa890'
    or v_historical_identifier_projection_sha256 <> 'c78a7b604ce4246069391e63b3a1d86054fff106ff277b727e140c212b99a9d6'
    or (select count(*) from ingest.external_identifiers where set_id = v_empty_set_id) <> 0
    or (select count(*) from ingest.external_identifiers
        where id = v_new_csv_identifier_id and source_id = v_tcgdex_source_id
          and raw_record_id = v_new_csv_raw_record_id and source_entity_type = 'set'
          and language_code = 'zh-cn' and external_id = 'CSV1C'
          and set_id = v_csv_set_id and is_current and deprecated_at is null) <> 1
    or (select count(*) from ingest.external_identifiers
        where id = v_existing_cbb_identifier_id and source_id = v_tcgdex_source_id
          and raw_record_id = v_existing_cbb_raw_record_id and source_entity_type = 'set'
          and language_code = 'zh-cn' and external_id = 'CBB1C'
          and set_id = v_cbb_set_id and is_current and deprecated_at is null) <> 1
    or (select count(*) from ingest.raw_source_records
        where id = v_existing_cbb_raw_record_id and source_id = v_tcgdex_source_id
          and record_type = 'set' and external_id = 'CSV1C' and language_code = 'zh-cn'
          and payload_hash = v_existing_cbb_payload_sha256
          and raw_payload is not distinct from jsonb_build_object(
            'id', 'CSV1C', 'name', '宝石包 第一卷',
            'cardCount', jsonb_build_object('total', 9, 'official', 9)
          ) and licence_status = 'approved' and deprecated_at is null) <> 1
    or (select count(*) from ingest.raw_source_records
        where id = v_new_csv_raw_record_id and source_id = v_tcgdex_source_id
          and import_run_id is null and record_type = 'set' and external_id = 'CSV1C'
          and language_code = 'zh-cn' and source_url = 'https://api.tcgdex.net/v2/zh-cn/sets'
          and payload_hash = v_new_csv_payload_sha256
          and raw_payload is not distinct from jsonb_build_object(
            'id', 'CSV1C', 'name', '亘古开来',
            'cardCount', jsonb_build_object('total', 127, 'official', 127)
          ) and licence_status = 'approved' and deprecated_at is null) <> 1 then
    raise exception 'Provider set identity repair postconditions failed; transaction rolled back.' using errcode = 'P0001';
  end if;

  v_result := jsonb_build_object(
    'schemaVersion', '2.0.0', 'receiptType', 'provider_set_identity_repair',
    'requestId', v_request_id, 'projectRef', p_project_ref,
    'mode', 'applied', 'applied', true, 'replayed', false,
    'appliedAt', to_char(pg_catalog.transaction_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'payloadSha256', v_payload_sha256,
    'preconditionStateSha256', v_precondition_state_sha256,
    'evidence', p_evidence,
    'sourceSetId', v_empty_set_id,
    'successorSetId', v_cbb_set_id,
    'csv1cSetId', v_csv_set_id,
    'cbb1cSetId', v_cbb_set_id,
    'existingCbb1cRawRecordId', v_existing_cbb_raw_record_id,
    'existingCbb1cRawPayloadSha256', v_existing_cbb_payload_sha256,
    'insertedCsv1cRawRecordId', v_new_csv_raw_record_id,
    'insertedCsv1cRawPayloadSha256', v_new_csv_payload_sha256,
    'rekeyedCbb1cIdentifierId', v_existing_cbb_identifier_id,
    'insertedCsv1cIdentifierId', v_new_csv_identifier_id,
    'rawRecordsInserted', 1,
    'identifiersInserted', 1,
    'identifiersRekeyed', 1,
    'preservedPrintingCount', 282,
    'preservedVariantCount', 508,
    'noRowsDeleted', true,
    'historicalPublicationRowsMutated', 0
  );

  insert into audit.provider_set_identity_repair_receipts (
    request_id, project_ref, payload_sha256, precondition_state_sha256, evidence, result
  ) values (
    v_request_id, p_project_ref, v_payload_sha256, v_precondition_state_sha256, p_evidence, v_result
  );

  return v_result;
end;
$$;

revoke all on function api.apply_reviewed_provider_set_identity_repair(text, text, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function api.apply_reviewed_provider_set_identity_repair(text, text, text, boolean, jsonb)
  to service_role;

comment on table audit.provider_set_identity_repair_receipts is
  'Immutable applied receipts for the exact reviewed zh-cn CSV1C/CBB1C identity repair.';

comment on function api.apply_reviewed_provider_set_identity_repair(text, text, text, boolean, jsonb) is
  'Service-role-only SECURITY INVOKER boundary for one exact, hash-bound, no-delete CSV1C/CBB1C repair. Dry-run validates without writes; apply rechecks and commits atomically.';
