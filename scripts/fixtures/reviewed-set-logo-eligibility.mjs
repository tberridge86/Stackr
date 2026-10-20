import { PRESERVED_LOGO_ELIGIBILITY_SQL, PRESERVED_ORIGINAL_LOGO_ELIGIBILITY_SQL, preservedOriginalLogoEligibilitySql, PUBLISHED_LOGO_MEMBERSHIPS_MATCH_SQL, CANONICAL_LOGO_IDENTITY_MATCH_SQL } from '../prepare-reviewed-set-logo-catalogue-publication.mjs';

/** Read-only PostgreSQL fixture: evaluate the production guard against isolated asset states. */
export function reviewedLogoEligibilityFixtureSql({ nullableIdentifier = false } = {}) {
  const predicate = (nullableIdentifier
    ? preservedOriginalLogoEligibilitySql([{assetIdentifier:null}]).replaceAll('original_row.item','item')
    : PRESERVED_LOGO_ELIGIBILITY_SQL).replace('storage.objects', 'fixture_objects');
  const identifier = nullableIdentifier ? 'null' : "'reviewed:set-logo:fixture/'||name";
  return `with cases(name,expected,patch,object_present,asset_present) as (values
    ('approved_original',true,'{}'::jsonb,true,true),
    ('permission_withdrawn',false,'{"permission_status":"denied"}'::jsonb,true,true),
    ('rights_withdrawn',false,'{"rights_status":"under_review"}'::jsonb,true,true),
    ('permission_missing',false,'{"permission_status":null}'::jsonb,true,true),
    ('not_public',false,'{"publicly_servable":false}'::jsonb,true,true),
    ('private_visibility',false,'{"asset_visibility":"private"}'::jsonb,true,true),
    ('inactive_retention',false,'{"retention_status":"deleted"}'::jsonb,true,true),
    ('deleted_original',false,'{"deleted_at":"2026-10-10T00:00:00Z"}'::jsonb,true,true),
    ('deprecated_original',false,'{"deprecated_at":"2026-10-10T00:00:00Z"}'::jsonb,true,true),
    ('changed_hash',false,'{"content_sha256":"changed"}'::jsonb,true,true),
    ('changed_storage_key',false,'{"storage_key":"changed/path"}'::jsonb,true,true),
    ('changed_bucket',false,'{"storage_bucket":"private-bucket"}'::jsonb,true,true),
    ('changed_identifier',false,'{"asset_id":"other-logo"}'::jsonb,true,true),
    ('changed_set',false,'{"set_id":"30000000-0000-4000-8000-000000000001"}'::jsonb,true,true),
    ('changed_asset_type',false,'{"asset_type":"card_image"}'::jsonb,true,true),
    ('missing_object',false,'{}'::jsonb,false,true),
    ('missing_asset',false,'{}'::jsonb,true,false)
  ), inputs as (
    select *,jsonb_build_object('assetId','10000000-0000-4000-8000-000000000001',
      'setId','20000000-0000-4000-8000-000000000001','assetIdentifier',${identifier},
      'contentSha256',repeat('a',64),'storageKey','public/set_logo/reviewed/fixture/'||name||'/delivery.png') as item
      from cases
  ), raw_assets as (
    select name,jsonb_build_object('id',item->>'assetId','set_id',item->>'setId','asset_id',item->>'assetIdentifier',
      'content_sha256',item->>'contentSha256','storage_key',item->>'storageKey','storage_bucket','stackr-catalogue-public',
      'asset_type','set_logo','rights_status','approved','permission_status','approved','publicly_servable',true,
      'asset_visibility','public_catalogue','retention_status','active','deleted_at',null,'deprecated_at',null)||patch as data
      from inputs where asset_present
  ), fixture_assets as (
    select name,(data->>'id')::uuid as id,(data->>'set_id')::uuid as set_id,data->>'asset_id' as asset_id,
      data->>'content_sha256' as content_sha256,data->>'storage_key' as storage_key,data->>'storage_bucket' as storage_bucket,
      data->>'asset_type' as asset_type,data->>'rights_status' as rights_status,data->>'permission_status' as permission_status,
      (data->>'publicly_servable')::boolean as publicly_servable,data->>'asset_visibility' as asset_visibility,
      data->>'retention_status' as retention_status,(data->>'deleted_at')::timestamptz as deleted_at,
      (data->>'deprecated_at')::timestamptz as deprecated_at from raw_assets
  ), fixture_objects as (
    select 'stackr-catalogue-public'::text as bucket_id,item->>'storageKey' as name from inputs where object_present
  ), evaluated as (
    select i.name,i.expected,exists(select 1 from fixture_assets a where a.name=i.name and ${predicate}) as eligible
      from inputs i
  ) select jsonb_build_object('total',count(*),'passed',count(*) filter (where eligible=expected),
    'failures',coalesce(jsonb_agg(jsonb_build_object('case',name,'expected',expected,'eligible',eligible)) filter (where eligible<>expected),'[]'::jsonb)) as result from evaluated;`;
}

/** Read-only fixture for exact membership equality; added logo-less versions must fail. */
export function reviewedLogoMembershipFixtureSql() {
  const predicate = PUBLISHED_LOGO_MEMBERSHIPS_MATCH_SQL.replace('api.catalogue_sets s', 'fixture_memberships s');
  return `with cases(name,expected,versions) as (values
    ('exact_reviewed_membership',true,'["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002"]'::jsonb),
    ('extra_published_version_without_logo',false,'["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002","10000000-0000-4000-8000-000000000003"]'::jsonb),
    ('missing_published_version',false,'["10000000-0000-4000-8000-000000000001"]'::jsonb),
    ('reordered_memberships',true,'["10000000-0000-4000-8000-000000000002","10000000-0000-4000-8000-000000000001"]'::jsonb),
    ('no_published_memberships',false,'[]'::jsonb)
  ), inputs as (select *,jsonb_build_object('setId','20000000-0000-4000-8000-000000000001',
    'versions',jsonb_build_array('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')) as item from cases),
  evaluated as (select name,expected,(
    with fixture_memberships as (select (item->>'setId')::uuid as set_id,value::uuid as catalogue_version_id from jsonb_array_elements_text(versions))
    select ${predicate}) as matches from inputs)
  select jsonb_build_object('total',count(*),'passed',count(*) filter(where matches=expected),
    'failures',coalesce(jsonb_agg(name) filter(where matches<>expected),'[]'::jsonb)) as result from evaluated;`;
}

export function reviewedLogoIdentityFixtureSql() {
  const predicate = CANONICAL_LOGO_IDENTITY_MATCH_SQL.replace('catalog.sets s', 'fixture_sets s');
  return `with cases(name,expected,language_code,game_code,deprecated_at,present) as (values
    ('exact_canonical_identity',true,'ja','pokemon',null::timestamptz,true),
    ('language_changed',false,'en','pokemon',null::timestamptz,true),
    ('game_changed',false,'ja','other',null::timestamptz,true),
    ('set_deprecated',false,'ja','pokemon','2026-10-10T00:00:00Z'::timestamptz,true),
    ('identity_missing',false,'ja','pokemon',null::timestamptz,false)
  ), inputs as (select *,jsonb_build_object('setId','20000000-0000-4000-8000-000000000001','language','ja','game','pokemon') as item from cases),
  evaluated as (select name,expected,(
    with fixture_sets as (select (item->>'setId')::uuid as id,language_code,game_code,deprecated_at where present)
    select ${predicate}) as matches from inputs)
  select jsonb_build_object('total',count(*),'passed',count(*) filter(where matches=expected),
    'failures',coalesce(jsonb_agg(name) filter(where matches<>expected),'[]'::jsonb)) as result from evaluated;`;
}

/** Compile and execute guarded original aliases and rollback projections without table writes. */
export function reviewedLogoPlPgSqlScopeFixtureSql() {
  const predicate = PRESERVED_ORIGINAL_LOGO_ELIGIBILITY_SQL.replace('storage.objects', 'fixture_objects');
  return `do $scope_fixture$
  declare original jsonb := '[{"assetId":"10000000-0000-4000-8000-000000000001","assetIdentifier":"approved-original","setId":"20000000-0000-4000-8000-000000000001","versionId":"30000000-0000-4000-8000-000000000001","language":"ja","contentSha256":"approved-hash","storageKey":"approved/path"}]'::jsonb;
    item jsonb; branch_name text; withdrawn boolean; rejected boolean; restored record; guard_checks int := 0;
  begin
    for branch_name in select unnest(array['publication','rollback']) loop
      for withdrawn in select unnest(array[false,true]) loop
        select exists (select 1 from jsonb_array_elements(original) original_row(item) where not exists (
          with fixture_assets as (select '10000000-0000-4000-8000-000000000001'::uuid as id,
            'approved-original'::text as asset_id,'set_logo'::text as asset_type,'20000000-0000-4000-8000-000000000001'::uuid as set_id,
            'approved-hash'::text as content_sha256,'approved/path'::text as storage_key,'stackr-catalogue-public'::text as storage_bucket,
            'approved'::text as rights_status,case when withdrawn then 'denied' else 'approved' end as permission_status,true as publicly_servable,
            'public_catalogue'::text as asset_visibility,'active'::text as retention_status,null::timestamptz as deleted_at,null::timestamptz as deprecated_at),
          fixture_objects as (select 'stackr-catalogue-public'::text as bucket_id,'approved/path'::text as name)
          select 1 from fixture_assets a where ${predicate})) into rejected;
        if rejected is distinct from withdrawn then raise exception 'Qualified original guard failed: %',branch_name; end if;
        guard_checks := guard_checks + 1;
      end loop;
    end loop;
    select (original_row.item->>'versionId')::uuid as version_id,original_row.item->>'language' as language_code,
      (original_row.item->>'setId')::uuid as set_id,(original_row.item->>'assetId')::uuid as asset_id,'set_logo' as asset_type
      into restored from jsonb_array_elements(original) original_row(item);
    if restored.language_code <> 'ja' or restored.asset_id <> '10000000-0000-4000-8000-000000000001'::uuid or guard_checks <> 4
      then raise exception 'Qualified rollback projection failed'; end if;
  end;
  $scope_fixture$;
  select jsonb_build_object('guardBranches',2,'eligibilityChecks',4,'rollbackProjectionChecks',1,'passed',true,'remoteDataMutated',false) as result;`;
}
