import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const quote = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const TRANSACTION_LOCKS = `set local lock_timeout = '10s';
set local statement_timeout = '60s';
lock table catalog.assets in share row exclusive mode;
lock table catalog.catalogue_version_assets in share row exclusive mode;
lock table catalog.sets, catalog.catalogue_versions, catalog.catalogue_version_sets in share mode;`;

// Recheck the immutable original and its current eligibility while asset writes are locked.
// The same predicate gates replacement and rollback before either removes memberships.
export const PRESERVED_LOGO_ELIGIBILITY_SQL = `a.id=(item->>'assetId')::uuid
      and a.asset_id=item->>'assetIdentifier' and a.asset_type='set_logo'
      and a.set_id=(item->>'setId')::uuid and a.content_sha256=item->>'contentSha256'
      and a.storage_key=item->>'storageKey' and a.storage_bucket='stackr-catalogue-public'
      and a.rights_status='approved' and a.permission_status='approved' and a.publicly_servable is true
      and a.asset_visibility='public_catalogue' and a.retention_status='active'
      and a.deleted_at is null and a.deprecated_at is null
      and exists (select 1 from storage.objects o where o.bucket_id=a.storage_bucket and o.name=a.storage_key)`;

export const PRESERVED_ORIGINAL_LOGO_ELIGIBILITY_SQL = PRESERVED_LOGO_ELIGIBILITY_SQL.replaceAll('item->', 'original_row.item->');

// Legacy approved assets can have a reviewed null external identifier. Their UUID,
// set, immutable bytes and permissions remain mandatory; missing evidence is refused.
export function preservedOriginalLogoEligibilitySql(rows) {
  assert.ok(rows.every(row => Object.hasOwn(row, 'assetIdentifier')
    && (row.assetIdentifier === null || typeof row.assetIdentifier === 'string')),
  'Original asset identifier evidence must be explicitly present');
  return rows.some(row => row.assetIdentifier === null)
    ? PRESERVED_ORIGINAL_LOGO_ELIGIBILITY_SQL.replace("a.asset_id=original_row.item->>'assetIdentifier'",
      "original_row.item ? 'assetIdentifier' and a.asset_id is not distinct from original_row.item->>'assetIdentifier'")
    : PRESERVED_ORIGINAL_LOGO_ELIGIBILITY_SQL;
}

// Compare the complete published membership, including versions added without a logo link.
export const PUBLISHED_LOGO_MEMBERSHIPS_MATCH_SQL = `(select coalesce(jsonb_agg(s.catalogue_version_id::text order by s.catalogue_version_id),'[]'::jsonb)
      from api.catalogue_sets s where s.set_id=(item->>'setId')::uuid)
      = (select coalesce(jsonb_agg(value order by value),'[]'::jsonb) from jsonb_array_elements_text(item->'versions'))`;

export const CANONICAL_LOGO_IDENTITY_MATCH_SQL = `exists (select 1 from catalog.sets s
      where s.id=(item->>'setId')::uuid and s.language_code=item->>'language'
      and s.game_code=item->>'game' and s.deprecated_at is null)`;

// New reviewed code bridges retain the exact product identity and published provider code.
// Existing releases without this optional evidence keep their original generated SQL.
export const REVIEWED_LOGO_PRODUCT_IDENTITY_MATCH_SQL = `exists (select 1 from catalog.sets s
      where s.id=(item->>'setId')::uuid
      and s.set_code=item#>>'{review,existingSetIdentity,code}'
      and s.provider_set_code=item#>>'{review,existingSetIdentity,code}'
      and s.native_name=item#>>'{review,existingSetIdentity,nativeName}'
      and s.english_display_name=item#>>'{review,existingSetIdentity,englishName}'
      and not exists (select 1 from jsonb_array_elements_text(item->'versions') requested_version(id)
        where not exists (select 1 from catalog.catalogue_version_external_identifiers e
          join ingest.sources src on src.id=e.source_id
          where e.set_id=s.id and e.catalogue_version_id=requested_version.id::uuid
          and e.language_code=item->>'language' and e.source_entity_type='set'
          and src.code='pikaqian' and e.external_id=item#>>'{review,existingSetIdentity,code}'))
      and not exists (select 1 from catalog.catalogue_version_external_identifiers e
        join ingest.sources src on src.id=e.source_id where e.set_id=s.id and src.code='pikaqian'
        and e.catalogue_version_id in (select value::uuid from jsonb_array_elements_text(item->'versions'))
        and e.external_id is distinct from item#>>'{review,existingSetIdentity,code}'))`;

/** This release supersedes approved logo deliveries; it does not create set identities or grant new rights. */
export function changedCanonicalAssets(plan, before, baseline) {
  const baselineBySet = new Map(baseline.logos.filter(row => row.canonicalSetId).map(row => [row.canonicalSetId, row]));
  const linksBySet = new Map();
  for (const link of before.links) {
    const links = linksBySet.get(link.setId) ?? [];
    links.push(link);
    linksBySet.set(link.setId, links);
  }
  return plan.canonicalAssets.filter(item => {
    const prior = baselineBySet.get(item.setId);
    assert.ok(prior && prior.language === item.language && prior.logoId === item.logoId, 'Canonical presentation identity changed');
    const links = linksBySet.get(item.setId);
    assert.ok(links?.length, 'An approved existing canonical delivery is required');
    assert.ok(links.every(link => link.rightsStatus === 'approved' && link.permissionStatus === 'approved'), 'Existing logo rights are not approved');
    assert.deepEqual(links.map(link => link.versionId).sort(), [...item.versions].sort(), 'Published set memberships changed');
    return links.some(link => link.assetIdentifier !== item.assetId || link.contentSha256 !== item.sha256);
  });
}

export async function prepareCatalogueLogoPublication(outputDir) {
  const read = async name => JSON.parse(await readFile(path.join(outputDir, name), 'utf8'));
  const [plan, before, baseline, manifest, identities, pack] = await Promise.all([
    read('publication-plan.json'), read('catalogue-links-before.json'), read('before-public-logo-manifest.json'),
    read('public-logo-manifest.json'), read('production-identity-snapshot.json'), read('reviewed-source-manifest.json'),
  ]);
  const manifestBytes = await readFile(path.join(outputDir, 'public-logo-manifest.json'));
  assert.equal(digest(manifestBytes), plan.manifestSha256);
  assert.equal(manifest.revision, plan.revision);
  const previous = new Map(baseline.logos.map(row => [row.logoId, row]));
  assert.equal(previous.size, manifest.logos.length, 'Logo identity count changed');
  for (const row of manifest.logos) {
    const prior = previous.get(row.logoId);
    assert.ok(prior, 'Logo identity was not previously reviewed');
    for (const field of ['language', 'name', 'provider', 'providerSetId', 'setCode', 'canonicalSetId']) {
      assert.equal(row[field], prior[field], `Previously reviewed identity changed: ${field}`);
    }
    if (row.sourceContentSha256 !== prior.sourceContentSha256) {
      const source = pack.logos.find(item => item.language === row.language && item.name === row.name && String(item.providerSetId ?? '') === String(row.providerSetId ?? ''));
      assert.ok(source?.aiEnhancement && source.sha256 === row.sourceContentSha256, 'Replacement is missing its reviewed enhancement provenance');
      assert.equal(source.aiEnhancement.originalSha256, prior.sourceContentSha256, 'Replacement input differs from its previously published logo');
      const original = await readFile(path.resolve(source.aiEnhancement.preservedOriginalPath));
      assert.equal(digest(original), prior.sourceContentSha256, 'Preserved original checksum differs');
    }
  }
  const changed = changedCanonicalAssets(plan, before, baseline);
  const scope = new Set(changed.map(row => row.setId));
  const original = before.links.filter(link => scope.has(link.setId));
  const sourceId = identities.sources.find(source => source.code === 'stackr_manual')?.id;
  assert.ok(sourceId && /^[a-f0-9-]{36}$/i.test(sourceId));
  const { publication, rollback } = buildCatalogueLogoTransactions({ plan, changed, original, sourceId });
  const receipt = { revision: plan.revision, manifestSha256: plan.manifestSha256, baselineRevision: baseline.revision,
    changedCanonicalSets: changed.length, previousLinksPreserved: original.length, allCanonicalSets: plan.canonicalAssets.length,
    newRightsGrants: 0, destructiveAssetOperations: 0, published: false };
  await Promise.all([
    writeFile(path.join(outputDir, 'publish-canonical-logos.sql'), publication),
    writeFile(path.join(outputDir, 'rollback-canonical-logos.sql'), rollback),
    writeFile(path.join(outputDir, 'catalogue-publication-plan.json'), JSON.stringify(receipt, null, 2)),
  ]);
  return receipt;
}

// Additional SQL comes only from a reviewed local batch preparer, never request
// data. Empty hooks retain the recovered generic builder's original output.
export function buildCatalogueLogoTransactions({ plan, changed, original, sourceId, localApprovalSources = original,
  lockedPublicationGuardSql = '', lockedRollbackGuardSql = '', assetEligibilitySql = '' }) {
  assert.equal(new Set(changed.map(asset => asset.storageKey)).size, changed.length, 'Canonical rows cannot share an immutable storage object');
  const publicationOriginalEligibility = preservedOriginalLogoEligibilitySql(localApprovalSources);
  const rollbackOriginalEligibility = preservedOriginalLogoEligibilitySql(original);
  const originalMinimal = original.map(({ assetId, setId, versionId }) => ({ assetId, setId, versionId }));
  const requested = quote(changed);
  const reviewedIdentityGuard = changed.some(item => item.review?.existingSetIdentity)
    ? `if item->'review' ? 'existingSetIdentity' and not (${REVIEWED_LOGO_PRODUCT_IDENTITY_MATCH_SQL})
      then raise exception 'Reviewed logo product code or identity changed'; end if;\n    ` : '';
  const transactionLocks = reviewedIdentityGuard
    ? `${TRANSACTION_LOCKS}\nlock table catalog.catalogue_version_external_identifiers, ingest.sources in share mode;`
    : TRANSACTION_LOCKS;
  const linkRead = `select coalesce(jsonb_agg(jsonb_build_object('assetId',cva.asset_id,'setId',cva.set_id,'versionId',cva.catalogue_version_id) order by cva.catalogue_version_id,cva.set_id,cva.asset_id),'[]'::jsonb)
    into actual_links from catalog.catalogue_version_assets cva join catalog.catalogue_versions cv on cv.id=cva.catalogue_version_id
    where cva.asset_type='set_logo' and cv.status='published' and cv.deprecated_at is null
      and cva.set_id in (select (value->>'setId')::uuid from jsonb_array_elements(requested));`;
  const publication = `-- Approved replacement logos only. Existing images and records remain immutable.
begin;
${transactionLocks}
do $publish$
declare requested jsonb := ${requested}; expected_links jsonb := ${quote(originalMinimal)}; original jsonb := ${quote(localApprovalSources)};
  actual_links jsonb; item jsonb; version_id uuid; asset_row_id uuid;
begin
  ${lockedPublicationGuardSql}
  if jsonb_array_length(requested) <> ${changed.length} then raise exception 'Logo publication scope changed'; end if;
  ${linkRead}
  if actual_links <> expected_links then raise exception 'Published logo links changed after review'; end if;
  if exists (select 1 from jsonb_array_elements(original) original_row(item) where not exists (select 1 from catalog.assets a where ${publicationOriginalEligibility}))
    then raise exception 'Original logo delivery or eligibility changed'; end if;
  for item in select value from jsonb_array_elements(requested) loop
    ${reviewedIdentityGuard}if not (${CANONICAL_LOGO_IDENTITY_MATCH_SQL})
      then raise exception 'Canonical logo identity changed'; end if;
    if not (${PUBLISHED_LOGO_MEMBERSHIPS_MATCH_SQL})
      then raise exception 'Complete published set membership changed'; end if;
    for version_id in select value::text::uuid from jsonb_array_elements_text(item->'versions') loop
      if not exists (select 1 from api.catalogue_sets s where s.set_id=(item->>'setId')::uuid and s.catalogue_version_id=version_id and s.language_code=item->>'language')
        then raise exception 'Published set membership changed'; end if;
    end loop;
    if not exists (select 1 from storage.objects o where o.bucket_id='stackr-catalogue-public' and o.name=item->>'storageKey')
      then raise exception 'Verified delivery object is missing'; end if;
    insert into catalog.assets (
      asset_id,asset_type,game_code,set_id,source_id,url,storage_path,mime_type,width,height,sha256,
      rights_status,permission_status,publicly_servable,asset_visibility,storage_provider,storage_bucket,storage_key,
      original_source_identifier,source_attribution,content_sha256,byte_size,derivative_list,cache_control,
      externally_referenced,last_verified_at,retention_status,licensing_review_notes,acquisition_source,recognition_reference_eligible
    ) values (
      item->>'assetId','set_logo',item->>'game',(item->>'setId')::uuid,'${sourceId}'::uuid,
      'https://${plan.projectRef}.supabase.co/storage/v1/object/public/${plan.bucket}/'||(item->>'storageKey'),item->>'storageKey',
      item->>'mimeType',(item->>'width')::int,(item->>'height')::int,item->>'sha256',
      'approved','approved',true,'public_catalogue','supabase_storage','${plan.bucket}',item->>'storageKey',
      'stackr-reviewed-set-logo:'||(item->>'logoId'),item->>'attribution',item->>'sha256',(item->>'byteSize')::bigint,
      '[]'::jsonb,'public, max-age=31536000, immutable',false,now(),'active',
      (item->'review')::text,'existing_stackr_catalogue_asset',false
    ) on conflict (asset_id) do nothing;
    select a.id into asset_row_id from catalog.assets a where a.asset_id=item->>'assetId'
      and a.set_id=(item->>'setId')::uuid and a.content_sha256=item->>'sha256' and a.storage_key=item->>'storageKey'
      and a.mime_type=item->>'mimeType' and a.width=(item->>'width')::int and a.height=(item->>'height')::int
      and a.byte_size=(item->>'byteSize')::bigint and a.deleted_at is null and a.deprecated_at is null and a.retention_status='active'
      and a.rights_status='approved' and a.permission_status='approved' and a.publicly_servable
      and a.asset_type='set_logo' and a.asset_visibility='public_catalogue' and a.storage_bucket='${plan.bucket}'
      ${assetEligibilitySql ? `and (${assetEligibilitySql})` : ''};
    if asset_row_id is null then raise exception 'Immutable reviewed asset conflicts'; end if;
    delete from catalog.catalogue_version_assets cva using catalog.catalogue_versions cv
      where cv.id=cva.catalogue_version_id and cv.status='published' and cv.deprecated_at is null
      and cva.set_id=(item->>'setId')::uuid and cva.asset_type='set_logo';
    for version_id in select value::text::uuid from jsonb_array_elements_text(item->'versions') loop
      insert into catalog.catalogue_version_assets (catalogue_version_id,language_code,set_id,asset_id,asset_type)
        values (version_id,item->>'language',(item->>'setId')::uuid,asset_row_id,'set_logo');
    end loop;
  end loop;
end;
$publish$;
commit;
select count(*) as published_reviewed_logos from api.asset_manifest where asset_id like 'reviewed:set-logo:%';
`;
  const expected = changed.flatMap(item => item.versions.map(versionId => ({ setId: item.setId, versionId, assetIdentifier: item.assetId })));
  const rollback = `-- Guarded rollback only; preserves immutable storage and asset rows.
begin;
${transactionLocks}
do $rollback$
declare requested jsonb := ${requested}; expected jsonb := ${quote(expected)}; original jsonb := ${quote(original)};
  actual jsonb; expected_sorted jsonb; item jsonb;
begin
  ${lockedRollbackGuardSql}
  select coalesce(jsonb_agg(jsonb_build_object('setId',cva.set_id,'versionId',cva.catalogue_version_id,'assetIdentifier',a.asset_id) order by cva.catalogue_version_id,cva.set_id,a.asset_id),'[]'::jsonb)
    into actual from catalog.catalogue_version_assets cva join catalog.catalogue_versions cv on cv.id=cva.catalogue_version_id join catalog.assets a on a.id=cva.asset_id
    where cva.asset_type='set_logo' and cv.status='published' and cv.deprecated_at is null and cva.set_id in (select (value->>'setId')::uuid from jsonb_array_elements(requested));
  select coalesce(jsonb_agg(value order by (value->>'versionId')::uuid,(value->>'setId')::uuid,value->>'assetIdentifier'),'[]'::jsonb) into expected_sorted from jsonb_array_elements(expected);
  if actual <> expected_sorted then raise exception 'Published logo links changed; fresh rollback review required'; end if;
  for item in select value from jsonb_array_elements(requested) loop
    ${reviewedIdentityGuard}if not (${CANONICAL_LOGO_IDENTITY_MATCH_SQL})
      then raise exception 'Canonical logo identity changed; fresh rollback review required'; end if;
    if not (${PUBLISHED_LOGO_MEMBERSHIPS_MATCH_SQL})
      then raise exception 'Complete published set membership changed; fresh rollback review required'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(original) original_row(item) where not exists (select 1 from catalog.assets a where ${rollbackOriginalEligibility}))
    then raise exception 'Original logo delivery or eligibility changed'; end if;
  delete from catalog.catalogue_version_assets cva using catalog.catalogue_versions cv where cv.id=cva.catalogue_version_id and cv.status='published' and cv.deprecated_at is null
    and cva.asset_type='set_logo' and cva.set_id in (select (value->>'setId')::uuid from jsonb_array_elements(requested));
  insert into catalog.catalogue_version_assets (catalogue_version_id,language_code,set_id,asset_id,asset_type)
    select (original_row.item->>'versionId')::uuid,original_row.item->>'language',(original_row.item->>'setId')::uuid,(original_row.item->>'assetId')::uuid,'set_logo' from jsonb_array_elements(original) original_row(item);
end;
$rollback$;
commit;
`;
  return { publication, rollback };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = process.argv.find(value => value.startsWith('--output='))?.slice(9);
  assert.ok(output, 'Specify --output=<reviewed publication directory>');
  console.log(JSON.stringify(await prepareCatalogueLogoPublication(path.resolve(output))));
}
