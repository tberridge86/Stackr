import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCatalogueLogoTransactions } from './prepare-reviewed-set-logo-catalogue-publication.mjs';

export const M6 = Object.freeze({
  project: 'oakdbbzdqwurpjnoqhmu', bucket: 'stackr-catalogue-public',
  setId: '903d5baa-27c7-5690-b1d7-2395c770204a', language: 'ja', game: 'pokemon', code: 'M6',
  forbiddenStagingId: '47879bc4-23b1-4eed-99d5-ef0f3548418b',
  logoId: '3b55304f6aef379f0fc0a33d04038d96a1a513d4de9f73d584f4d55b366c545b',
  sha256: '383905581374e6a41be583303354be84a34891d52f8b6420ea632ff61a07f7ba',
  bytes: 900649, width: 1280, height: 544, mimeType: 'image/png',
  permissionQuote: 'Yes, my permission covers this supplied Storm logo.',
});
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE_ROOT = 'D:/Stackr-organization';
const RIGHTS = 'catalogue/rights-reviews/stackr-m6-owner-supplied-set-logo.2026-10-18.json';
const RIGHTS_SHA256 = '1a0ba3c6a2df7ad4282c43aa8fc8f00da74d3a4b160f26324fe87541879c341e';
const ART = 'assets/rev2/11-japanese-set-logo/logos-owner-supplied-20261018/m6.png';
const PROVENANCE = 'assets/rev2/11-japanese-set-logo/storm-m6-owner-supplied-20261018.json';
export const SOURCE_KEY = `public/set_logo/reviewed/${M6.sha256}/source.png`;
export const CANONICAL_KEY = `public/set_logo/reviewed/catalogue/${M6.setId}/${M6.sha256}/delivery.png`;
export const ASSET_ID = `reviewed:set-logo:${M6.setId}:${M6.sha256}`;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const ASSET_FIELDS = Object.freeze(['asset_id', 'asset_type', 'game_code', 'set_id', 'printing_id', 'variant_id',
  'source_id', 'url', 'storage_path', 'mime_type', 'width', 'height', 'sha256', 'content_sha256', 'byte_size',
  'rights_status', 'permission_status', 'publicly_servable', 'asset_visibility', 'storage_provider', 'storage_bucket',
  'storage_key', 'original_source_url', 'original_source_identifier', 'source_attribution', 'derivative_list',
  'cache_control', 'externally_referenced', 'unavailable_reason', 'retention_status', 'deleted_at', 'deprecated_at',
  'acquisition_source', 'recognition_reference_eligible']);
const sha = value => createHash('sha256').update(value).digest('hex');
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const jsonSql = value => q(JSON.stringify(value)) + '::jsonb';
const publicUrl = key => `https://${M6.project}.supabase.co/storage/v1/object/public/${M6.bucket}/${key}`;
const projection = (alias, fields) => `jsonb_build_object(${fields.map(field => `${q(field)},${alias}.${field}`).join(',')})`;
// Match the manifest's inherited set-identity precedence before proving absence.
const LOGO_MEMBERSHIPS = `with logo_asset_ids as materialized (select id from catalog.assets where asset_type='set_logo'),
  logo_link_ids as materialized (
    select catalogue_version_id,asset_id from catalog.catalogue_version_assets where asset_type='set_logo'
    union select cva.catalogue_version_id,cva.asset_id from logo_asset_ids a join catalog.catalogue_version_assets cva on cva.asset_id=a.id
  ) select raw.* from logo_link_ids ids join catalog.catalogue_version_assets raw
    on raw.catalogue_version_id=ids.catalogue_version_id and raw.asset_id=ids.asset_id`;
const SCOPED_LINKS = `from (${LOGO_MEMBERSHIPS}) cva join catalog.catalogue_versions cv on cv.id=cva.catalogue_version_id
  left join catalog.assets linked on linked.id=cva.asset_id
  left join catalog.card_variants av on av.id=coalesce(cva.variant_id,linked.variant_id)
  left join catalog.card_printings ap on ap.id=coalesce(cva.printing_id,linked.printing_id,av.printing_id)
  where cv.status='published' and cv.deprecated_at is null
    and coalesce(cva.set_id,linked.set_id,av.set_id,ap.set_id)='${M6.setId}'::uuid
    and (cva.asset_type='set_logo' or linked.asset_type='set_logo')`;
const EXACT_ASSET_IDS = `select cva.asset_id as id ${SCOPED_LINKS}
  union select id from catalog.assets where asset_id=${q(ASSET_ID)}
  ${[SOURCE_KEY, CANONICAL_KEY].map(key => `union select id from catalog.assets where storage_provider='supabase_storage'
    and storage_bucket=${q(M6.bucket)} and storage_key=${q(key)} and deleted_at is null`).join('\n')}`;
const KEY_ASSET_IDS = EXACT_ASSET_IDS.slice(EXACT_ASSET_IDS.indexOf('\n  union select id') + '\n  union '.length);

export async function readM6Evidence(repo = REPO) {
  const [rightsBytes, artBytes, provenanceBytes] = await Promise.all([RIGHTS, ART, PROVENANCE].map(file => readFile(path.join(repo, file))));
  const rights = JSON.parse(rightsBytes), provenance = JSON.parse(provenanceBytes);
  assert.equal(sha(rightsBytes), RIGHTS_SHA256, 'The exact reviewed owner-attestation record changed');
  assert.equal(rights.ownerAttestation?.answer, M6.permissionQuote, 'Exact fresh owner permission is required');
  assert.equal(rights.ownerAttestation.recordedDate, '2026-10-18');
  assert.equal(rights.ownerAttestation.assetSha256, M6.sha256);
  assert.equal(rights.activationAuthorized, true);
  assert.equal(rights.publicRuntimeDisplayAuthorized, true);
  for (const [key, value] of Object.entries({ setId: M6.setId, language: M6.language, setCode: M6.code, sha256: M6.sha256, bytes: M6.bytes })) assert.equal(rights.scope[key], value);
  assert.equal(provenance.sha256, M6.sha256); assert.equal(provenance.setId, M6.setId);
  assert.equal(provenance.sourcePixelsUnchanged, true); assert.equal(provenance.sourceUrl, publicUrl(SOURCE_KEY));
  assert.equal(sha(artBytes), M6.sha256); assert.equal(artBytes.length, M6.bytes);
  assert.equal(artBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(artBytes.readUInt32BE(16), M6.width); assert.equal(artBytes.readUInt32BE(20), M6.height);
  return { rightsRecord: RIGHTS, rightsRecordSha256: sha(rightsBytes), provenanceRecord: PROVENANCE,
    provenanceRecordSha256: sha(provenanceBytes), assetPath: ART, assetSha256: sha(artBytes),
    permissionQuote: M6.permissionQuote, permissionDate: '2026-10-18',
    operationalAuthority: 'Existing owner standing authorization for exact supplied verified artwork through import, supersession, publication and actual API verification; this preparer performs local preparation only.',
    independentLicensorDocumentationClaimed: false };
}

export function preflightSql() {
  const fields = ['id', ...ASSET_FIELDS, 'licensing_review_notes', 'updated_at'];
  return `-- EXACT ONE-LOGO READ PLAN. The executor must verify project ${M6.project}; the literal below is a declared target, not connection proof.
begin read only;
set local statement_timeout='5s'; set local lock_timeout='1s';
with published as (select set_id,catalogue_version_id,language_code from api.catalogue_sets where set_id='${M6.setId}'::uuid),
links as materialized (select cva.* ${SCOPED_LINKS}),
candidate_ids as materialized (${EXACT_ASSET_IDS.replace(`select cva.asset_id as id ${SCOPED_LINKS}`, 'select asset_id as id from links')}),
candidates as (select a.${fields.join(',a.')} from candidate_ids wanted join catalog.assets a on a.id=wanted.id order by a.id limit 1001)
select jsonb_build_object('schemaVersion','stackr-storm-m6-before-v4','declaredProjectRef',${q(M6.project)},'capturedAt',now(),
 'sets',coalesce((select jsonb_agg(${projection('s', ['id', 'game_code', 'language_code', 'set_code', 'provider_set_code', 'native_name', 'english_display_name', 'deprecated_at'])}) from catalog.sets s where s.id='${M6.setId}'::uuid),'[]'::jsonb),
 'publishedMemberships',coalesce((select jsonb_agg(to_jsonb(p) order by p.catalogue_version_id) from published p),'[]'::jsonb),
 'publishedLinks',coalesce((select jsonb_agg(to_jsonb(l) order by l.catalogue_version_id,l.asset_id) from links l),'[]'::jsonb),
 'assets',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from candidates a),'[]'::jsonb),
 'objects',coalesce((select jsonb_agg(jsonb_build_object('bucket_id',o.bucket_id,'name',o.name,'metadata',o.metadata) order by o.name) from storage.objects o
   where o.bucket_id=${q(M6.bucket)} and o.name in(${q(SOURCE_KEY)},${q(CANONICAL_KEY)})),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code)) from ingest.sources s where s.code='stackr_manual'),'[]'::jsonb)) as snapshot;
rollback;
`;
}

export function validateSnapshot(snapshot) {
  assert.equal(snapshot.schemaVersion, 'stackr-storm-m6-before-v5-parts', 'All four complete decomposed reads are required');
  assert.equal(snapshot.partCaptureTimes?.length, 4); assert.deepEqual(snapshot.partCaptureTimes.map(row => row.ordinal).sort(), [1, 2, 3, 4]);
  for (const row of snapshot.partCaptureTimes) assert.ok(Number.isFinite(Date.parse(row.capturedAt)));
  assert.equal(snapshot.declaredProjectRef, M6.project);
  assert.ok(Number.isFinite(Date.parse(snapshot.capturedAt)), 'Snapshot time is required');
  for (const key of ['sets', 'publishedMemberships', 'publishedLinks', 'assets', 'objects', 'sources']) assert.ok(Array.isArray(snapshot[key]), `Complete ${key} snapshot is required`);
  assert.equal(snapshot.sets.length, 1); const set = snapshot.sets[0];
  assert.equal(set.id, M6.setId); assert.equal(set.game_code, M6.game); assert.equal(set.language_code, M6.language);
  assert.equal(String(set.set_code).toUpperCase(), M6.code); assert.equal(set.deprecated_at, null);
  assert.equal(set.native_name, 'ストームエメラルダ'); assert.equal(set.english_display_name, 'Storm Emeralda');
  assert.ok(Object.hasOwn(set, 'provider_set_code'), 'Provider-code fingerprint is required');
  assert.ok(snapshot.publishedMemberships.length > 0 && snapshot.publishedMemberships.length <= 20);
  for (const row of snapshot.publishedMemberships) { assert.equal(row.set_id, M6.setId); assert.equal(row.language_code, M6.language); assert.match(row.catalogue_version_id, UUID); }
  assert.equal(new Set(snapshot.publishedMemberships.map(row => row.catalogue_version_id)).size, snapshot.publishedMemberships.length);
  assert.equal(snapshot.publishedLinks.length, 0, 'This is an addition only; existing published logo links need a separate supersession review');
  assert.ok(snapshot.assets.length <= 1000, 'Candidate snapshot was truncated');
  for (const row of snapshot.assets) { assert.match(row.id, UUID); for (const field of [...ASSET_FIELDS, 'licensing_review_notes', 'updated_at']) assert.ok(Object.hasOwn(row, field), `Missing asset fingerprint field ${field}`); }
  assert.equal(snapshot.sources.length, 1); assert.equal(snapshot.sources[0].code, 'stackr_manual'); assert.match(snapshot.sources[0].id, UUID);
  for (const object of snapshot.objects) { assert.equal(object.bucket_id, M6.bucket); assert.ok([SOURCE_KEY, CANONICAL_KEY].includes(object.name)); }
  assert.equal(new Set(snapshot.objects.map(row => row.name)).size, snapshot.objects.length, 'Duplicate controlled objects');
  const source = snapshot.objects.find(row => row.name === SOURCE_KEY);
  assert.ok(source, 'Verified existing source object is required');
  assert.equal(Number(source.metadata?.size), M6.bytes); assert.equal(source.metadata?.mimetype, M6.mimeType);
  return snapshot;
}

export function decomposedReadParts() {
  const assetFields = ['id', ...ASSET_FIELDS, 'licensing_review_notes', 'updated_at'];
  const header = `-- Exact M6 metadata only; executor verifies actual project ${M6.project}. Separate read timestamps are intentional.
begin read only;\nset local statement_timeout='5s'; set local lock_timeout='1s';\n`;
  const wrap = (ordinal, label, ctes, fields) => ({ ordinal, label,
    sql: `${header}${ctes ? `with ${ctes}\n` : ''}select jsonb_build_object('schemaVersion','stackr-storm-m6-read-part-v1',
 'ordinal',${ordinal},'label',${q(label)},'declaredProjectRef',${q(M6.project)},'setId',${q(M6.setId)},'capturedAt',now(),
 ${fields}) as snapshot_part;\nrollback;\n` });
  return [
    wrap(1, 'set-and-published-versions', '', `'sets',coalesce((select jsonb_agg(${projection('s', ['id', 'game_code', 'language_code', 'set_code', 'provider_set_code', 'native_name', 'english_display_name', 'deprecated_at'])}) from catalog.sets s where s.id='${M6.setId}'::uuid),'[]'::jsonb),
 'publishedMemberships',coalesce((select jsonb_agg(to_jsonb(p) order by p.catalogue_version_id) from (select set_id,catalogue_version_id,language_code from api.catalogue_sets where set_id='${M6.setId}'::uuid limit 21) p),'[]'::jsonb)`),
    wrap(2, 'complete-effective-logo-links-and-assets', `links as materialized(select cva.* ${SCOPED_LINKS} order by cva.catalogue_version_id,cva.asset_id limit 1001),
 linked_assets as(select a.${assetFields.join(',a.')} from catalog.assets a where a.id in(select asset_id from links) order by a.id limit 1001)`,
      `'publishedLinks',coalesce((select jsonb_agg(to_jsonb(l) order by l.catalogue_version_id,l.asset_id) from links l),'[]'::jsonb),
 'linkedAssets',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from linked_assets a),'[]'::jsonb)`),
    wrap(3, 'active-exact-keys-and-all-identifier-conflicts', `candidate_ids as materialized(${KEY_ASSET_IDS}),
 candidates as(select a.${assetFields.join(',a.')} from candidate_ids wanted join catalog.assets a on a.id=wanted.id order by a.id limit 1001)`,
      `'assets',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from candidates a),'[]'::jsonb)`),
    wrap(4, 'controlled-object-and-manual-source-metadata', '', `'objects',coalesce((select jsonb_agg(jsonb_build_object('bucket_id',o.bucket_id,'name',o.name,'metadata',o.metadata) order by o.name) from storage.objects o
 where o.bucket_id=${q(M6.bucket)} and o.name in(${q(SOURCE_KEY)},${q(CANONICAL_KEY)})),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code)) from ingest.sources s where s.code='stackr_manual'),'[]'::jsonb)`),
  ];
}

export function normalizeM6ReadParts(parts) {
  assert.equal(parts.length, 4, 'Every decomposed read part is required');
  const byOrdinal = new Map();
  for (const part of parts) {
    assert.equal(part.schemaVersion, 'stackr-storm-m6-read-part-v1'); assert.equal(part.declaredProjectRef, M6.project); assert.equal(part.setId, M6.setId);
    assert.ok([1, 2, 3, 4].includes(part.ordinal)); assert.ok(!byOrdinal.has(part.ordinal), 'Duplicate read ordinal');
    assert.equal(part.label, decomposedReadParts().find(expected=>expected.ordinal===part.ordinal).label, 'Read ordinal/label differs');
    assert.ok(Number.isFinite(Date.parse(part.capturedAt)), 'Each read needs its own timestamp'); byOrdinal.set(part.ordinal, part);
  }
  const one=byOrdinal.get(1), two=byOrdinal.get(2), three=byOrdinal.get(3), four=byOrdinal.get(4);
  for (const [part, field, cap] of [[one,'sets',1],[one,'publishedMemberships',20],[two,'publishedLinks',1000],
    [two,'linkedAssets',1000],[three,'assets',1000],[four,'objects',2],[four,'sources',1]]) {
    assert.ok(Array.isArray(part[field]), `Complete part field ${field} is required`); assert.ok(part[field].length<=cap, `Truncated or unexpected ${field} population`);
  }
  const assets = new Map();
  for (const row of [...two.linkedAssets,...three.assets]) { if(assets.has(row.id)) assert.deepEqual(row,assets.get(row.id),'Asset changed between read parts'); else assets.set(row.id,row); }
  for (const link of two.publishedLinks) assert.ok(assets.has(link.asset_id), 'A complete linked asset row is required');
  for (const row of two.linkedAssets) assert.ok(two.publishedLinks.some(link=>link.asset_id===row.id), 'Unexpected asset outside the linked-asset projection');
  const partCaptureTimes = [...byOrdinal.values()].sort((a,b)=>a.ordinal-b.ordinal).map(part=>({ordinal:part.ordinal,capturedAt:part.capturedAt}));
  const snapshot={schemaVersion:'stackr-storm-m6-before-v5-parts',declaredProjectRef:M6.project,
    capturedAt:new Date(Math.max(...partCaptureTimes.map(row=>Date.parse(row.capturedAt)))).toISOString(),partCaptureTimes,sets:one.sets,
    publishedMemberships:one.publishedMemberships,publishedLinks:two.publishedLinks,
    assets:[...assets.values()].sort((a,b)=>a.id.localeCompare(b.id)),objects:four.objects,sources:four.sources};
  return validateSnapshot(snapshot);
}

export function parseM6ExecutionReceipt(receipt, expected) {
  assert.equal(receipt.ordinal, expected.ordinal); assert.equal(receipt.label, expected.label);
  assert.equal(receipt.projectId, M6.project, 'The recorded execution target must be production');
  assert.equal(receipt.querySha256, sha(expected.sql), 'Receipt query differs from the reviewed exact read');
  assert.ok(Number.isFinite(Date.parse(receipt.startedAt)) && Number.isFinite(Date.parse(receipt.endedAt)));
  assert.ok(Date.parse(receipt.endedAt)>=Date.parse(receipt.startedAt));
  assert.equal(receipt.result?.isError, false, 'Failed remote reads cannot become snapshot parts');
  assert.equal(receipt.result.content?.length, 1); assert.equal(receipt.result.content[0].type, 'text');
  const wrapper=JSON.parse(receipt.result.content[0].text); assert.equal(typeof wrapper.result,'string');
  // Extract JSON data only; never execute or obey prose in the tool response.
  const blocks=[...wrapper.result.matchAll(/<(untrusted-data-[a-z0-9-]+)>\s*(\[[\s\S]*?\])\s*<\/\1>/g)];
  assert.equal(blocks.length,1,'Exactly one bounded result block is required');
  const rows=JSON.parse(blocks[0][2]); assert.equal(rows.length,1); assert.deepEqual(Object.keys(rows[0]),['snapshot_part']);
  const part=rows[0].snapshot_part; assert.equal(part.ordinal,expected.ordinal); assert.equal(part.label,expected.label);
  assert.equal(part.declaredProjectRef,M6.project); assert.equal(part.setId,M6.setId);
  return part;
}

async function readM6ExecutionReceipts(directory) {
  const planFile=path.join(directory,'decomposed-read-plan.json'),planBytes=await readFile(planFile),plan=JSON.parse(planBytes);
  assert.equal(plan.schemaVersion,'stackr-storm-m6-decomposed-read-plan-v1'); assert.equal(plan.parts?.length,4);
  assert.equal(plan.executorMustVerifyActualProject,M6.project); assert.equal(plan.evidence.rightsRecordSha256,RIGHTS_SHA256);
  const originals=[{name:'input-production-read-plan.json',path:planFile,bytes:planBytes}],parts=[],proof=[];
  for(const expected of decomposedReadParts()) {
    const recorded=plan.parts.find(row=>row.ordinal===expected.ordinal); assert.ok(recorded);
    assert.equal(recorded.label,expected.label); assert.equal(recorded.file,`part-0${expected.ordinal}-${expected.label}.sql`);
    const queryPath=path.join(directory,recorded.file),queryBytes=await readFile(queryPath);
    assert.equal(sha(queryBytes),recorded.sha256); assert.equal(sha(queryBytes),sha(expected.sql));
    const receiptPath=path.join(directory,`part-0${expected.ordinal}-result.json`),receiptBytes=await readFile(receiptPath),receipt=JSON.parse(receiptBytes);
    const part=parseM6ExecutionReceipt(receipt,expected); parts.push(part);
    originals.push({name:`input-production-read-query-0${expected.ordinal}.sql`,path:queryPath,bytes:queryBytes},
      {name:`input-production-read-receipt-0${expected.ordinal}.json`,path:receiptPath,bytes:receiptBytes});
    proof.push({ordinal:expected.ordinal,label:expected.label,projectId:receipt.projectId,querySha256:receipt.querySha256,
      receiptSha256:sha(receiptBytes),startedAt:receipt.startedAt,endedAt:receipt.endedAt,serverCapturedAt:part.capturedAt});
  }
  return {snapshot:normalizeM6ReadParts(parts),originals,proof};
}

function eligibleExisting(row) {
  return row.set_id === M6.setId && row.asset_type === 'set_logo' && row.game_code === M6.game
    && row.content_sha256 === M6.sha256 && row.mime_type === M6.mimeType && row.width === M6.width && row.height === M6.height && Number(row.byte_size) === M6.bytes
    && row.rights_status === 'approved' && row.permission_status === 'approved' && row.publicly_servable === true && row.asset_visibility === 'public_catalogue'
    && row.storage_provider === 'supabase_storage' && row.storage_bucket === M6.bucket && [SOURCE_KEY, CANONICAL_KEY].includes(row.storage_key)
    && row.retention_status === 'active' && row.deleted_at === null && row.deprecated_at === null && row.unavailable_reason === null && row.externally_referenced === false
    && row.printing_id === null && row.variant_id === null;
}

export function buildM6Plan(snapshot, evidence) {
  validateSnapshot(snapshot);
  assert.equal(evidence.rightsRecord, RIGHTS); assert.equal(evidence.rightsRecordSha256, RIGHTS_SHA256);
  assert.equal(evidence.permissionDate, '2026-10-18'); assert.equal(evidence.permissionQuote, M6.permissionQuote); assert.equal(evidence.assetSha256, M6.sha256);
  const eligible = snapshot.assets.filter(eligibleExisting); assert.ok(eligible.length <= 1, 'Multiple exact eligible assets need explicit reuse review');
  const existing = eligible[0];
  const storageKey = existing?.storage_key ?? SOURCE_KEY;
  assert.ok(!snapshot.assets.some(row => [SOURCE_KEY,CANONICAL_KEY].includes(row.storage_key) && row.storage_bucket === M6.bucket && row.storage_provider === 'supabase_storage' && row.deleted_at === null && row.id !== existing?.id), 'An immutable controlled storage key is already assigned to a conflicting asset');
  assert.ok(!snapshot.assets.some(row => row.asset_id === ASSET_ID && row.id !== existing?.id), 'Canonical asset identifier conflicts with existing state');
  if (existing) { assert.ok(typeof existing.asset_id === 'string' && existing.asset_id.length, 'An eligible legacy null asset identifier requires a separate link-only reuse plan'); assert.ok(Array.isArray(existing.derivative_list), 'Existing derivatives must be explicitly captured'); }
  const attribution = 'Owner-supplied unchanged Storm Emeralda set logo; exact permission attested 2026-10-18';
  const expectedAsset = existing ? Object.fromEntries(ASSET_FIELDS.map(field => [field, existing[field]])) : {
    asset_id: ASSET_ID, asset_type: 'set_logo', game_code: M6.game, set_id: M6.setId, printing_id: null, variant_id: null,
    source_id: snapshot.sources[0].id, url: publicUrl(storageKey), storage_path: storageKey, mime_type: M6.mimeType,
    width: M6.width, height: M6.height, sha256: M6.sha256, content_sha256: M6.sha256, byte_size: M6.bytes,
    rights_status: 'approved', permission_status: 'approved', publicly_servable: true, asset_visibility: 'public_catalogue',
    storage_provider: 'supabase_storage', storage_bucket: M6.bucket, storage_key: storageKey,
    original_source_url: null, original_source_identifier: `stackr-reviewed-set-logo:${M6.logoId}`, source_attribution: attribution,
    derivative_list: [], cache_control: 'public, max-age=31536000, immutable', externally_referenced: false,
    unavailable_reason: null, retention_status: 'active', deleted_at: null, deprecated_at: null,
    acquisition_source: 'existing_stackr_catalogue_asset', recognition_reference_eligible: false,
  };
  const item = { setId: M6.setId, language: M6.language, game: M6.game, versions: snapshot.publishedMemberships.map(row => row.catalogue_version_id).sort(),
    name: 'Storm Emeralda', logoId: M6.logoId, assetId: expectedAsset.asset_id, storageKey, sha256: M6.sha256,
    width: M6.width, height: M6.height, byteSize: M6.bytes, mimeType: M6.mimeType, attribution,
    review: { batch: 'storm-m6-canonical-link-20261018', mode: existing ? 'reuse' : 'new_asset', expectedAsset,
      reusedAssetRowId: existing?.id ?? null, existingLicensingNotes: existing?.licensing_review_notes ?? null,
      ownerAttestation: { answer: evidence.permissionQuote, recordedDate: evidence.permissionDate, assetSha256: M6.sha256,
        record: evidence.rightsRecord, recordSha256: evidence.rightsRecordSha256 },
      sourcePixelsUnchanged: true, sourceUrl: publicUrl(SOURCE_KEY), independentLicensorDocumentationClaimed: false } };
  const object = snapshot.objects.find(row => row.name === storageKey);
  if (object) { assert.equal(Number(object.metadata?.size), M6.bytes); assert.equal(object.metadata?.mimetype, M6.mimeType); }
  assert.ok(object, 'Only reuse of an existing exact controlled object is authorized by this no-upload batch');
  return { schemaVersion: 'stackr-storm-m6-one-asset-plan-v1', revision: '2026-10-18-m6-link', projectRef: M6.project, bucket: M6.bucket,
    scope: M6, sourceId: snapshot.sources[0].id, identityFingerprint: snapshot.sets[0], beforeSnapshotSha256: sha(JSON.stringify(snapshot)),
    beforeSnapshot: snapshot, evidence, canonicalAssets: [item], changedCanonicalAssets: [item],
    storageAction: 'reuse_existing_exact_object_after_byte_verification', remoteStorageWritesRequired: false,
    requiredByteVerification: { key: storageKey, sha256: M6.sha256, bytes: M6.bytes, width: M6.width, height: M6.height },
    derivatives: { policy: 'Preserve the existing set-logo derivative list verbatim when reusing; new standalone set logos retain the existing empty-list contract. No generated card-image derivatives.', list: expectedAsset.derivative_list },
    originalLinks: [], originalAssetsAndObjectsPreserved: true, stagingIdRejected: M6.forbiddenStagingId,
    candidateScope: 'Active exact provider/bucket/source-key/canonical-key rows, ALL deterministic asset identifier matches, and ALL assets behind complete effective M6 logo memberships. No global hash, deleted-key history or all-assets absence assertion. Unlinked deleted other-ID key rows, unrelated hash duplicates and unlinked other-key assets are never reused, resurrected or mutated.',
    preparedLocallyOnly: true, remoteSqlExecuted: false, uploaded: false, published: false };
}

export function buildM6Transactions(plan) {
  assert.equal(plan.projectRef, M6.project); assert.equal(plan.bucket, M6.bucket); assert.match(plan.sourceId, UUID);
  assert.deepEqual(plan, buildM6Plan(plan.beforeSnapshot, plan.evidence), 'Frozen one-item plan differs from its evidence');
  const asset = plan.canonicalAssets[0], snapshot = plan.beforeSnapshot;
  const setFields = ['id', 'game_code', 'language_code', 'set_code', 'provider_set_code', 'native_name', 'english_display_name', 'deprecated_at'];
  const common = `if (select ${projection('s', setFields)} from catalog.sets s where s.id='${M6.setId}'::uuid) is distinct from ${jsonSql(plan.identityFingerprint)}
    then raise exception 'Exact Japanese M6 identity fingerprint changed'; end if;
  if not exists(select 1 from ingest.sources where id='${plan.sourceId}'::uuid and code='stackr_manual') then raise exception 'Manual source changed'; end if;
  if jsonb_array_length(requested) is distinct from 1 or requested->0->>'setId' is distinct from ${q(M6.setId)} or requested->0->>'language' is distinct from 'ja'
    or requested->0->>'sha256' is distinct from ${q(M6.sha256)} or requested#>>'{0,review,ownerAttestation,recordSha256}' is distinct from ${q(plan.evidence.rightsRecordSha256)}
    or requested#>>'{0,review,ownerAttestation,answer}' is distinct from ${q(M6.permissionQuote)} then raise exception 'Exact asset/owner-attestation scope changed'; end if;`;
  // Read the complete inherited membership scope once while its dependencies
  // are locked. Reuse it for both candidate metadata and addition-only absence.
  const beforeStateRead = `with links as materialized (select cva.* ${SCOPED_LINKS}),
    candidate_ids as materialized (select asset_id as id from links union ${KEY_ASSET_IDS})
    select jsonb_build_object('assets',coalesce((select jsonb_agg(${projection('a', ['id', ...ASSET_FIELDS, 'licensing_review_notes', 'updated_at'])} order by a.id)
      from candidate_ids wanted join catalog.assets a on a.id=wanted.id),'[]'::jsonb),
      'hasLinks',exists(select 1 from links)) into actual_links`;
  const metadataMatch = `${projection('a', ASSET_FIELDS)} = item#>'{review,expectedAsset}'
    and (case when item#>>'{review,mode}'='reuse' then a.id=(item#>>'{review,reusedAssetRowId}')::uuid
      and a.licensing_review_notes is not distinct from item#>>'{review,existingLicensingNotes}'
      else a.licensing_review_notes::jsonb=item->'review' end)`;
  const fullLinks = `if exists(select 1 ${SCOPED_LINKS}
      and (cva.set_id is distinct from '${M6.setId}'::uuid or cva.asset_type is distinct from 'set_logo' or cva.language_code is distinct from 'ja' or cva.printing_id is not null or cva.variant_id is not null))
    then raise exception 'Full scoped logo membership identity changed'; end if;`;
  const objectGate = `if not exists(select 1 from storage.objects o where o.bucket_id=${q(M6.bucket)} and o.name=${q(asset.storageKey)}
    and (o.metadata->>'size')::bigint=${M6.bytes} and o.metadata->>'mimetype'=${q(M6.mimeType)}) then raise exception 'Controlled logo object metadata differs'; end if;`;
  const publicationGuard = `${common}
  ${beforeStateRead};
  if actual_links->'assets' is distinct from ${jsonSql(snapshot.assets)} then raise exception 'Complete scoped asset before-state changed'; end if;
  if (actual_links->>'hasLinks')::boolean
    then raise exception 'Addition-only published logo absence changed'; end if;
  ${objectGate}`;
  const rollbackGuard = `${common}
  ${fullLinks}
  for item in select value from jsonb_array_elements(requested) loop
    if not exists(select 1 from catalog.assets a where a.asset_id=item->>'assetId' and ${metadataMatch})
      then raise exception 'Published logo exact approval/provenance changed'; end if;
  end loop;
  ${objectGate}`;
  const sql = buildCatalogueLogoTransactions({ plan, changed: [asset], original: [], sourceId: plan.sourceId,
    lockedPublicationGuardSql: publicationGuard, lockedRollbackGuardSql: rollbackGuard, assetEligibilitySql: metadataMatch });
  // The existing builder's Chinese identity branch is deliberately unused. The
  // fixed Japanese guard and source row are held stable by these extra locks.
  const lock = 'lock table catalog.sets, catalog.catalogue_versions, catalog.catalogue_version_sets in share mode;';
  for (const key of ['publication', 'rollback']) {
    assert.ok(sql[key].includes(lock)); sql[key] = sql[key].replace(lock, lock + '\nlock table ingest.sources in share mode;\nlock table catalog.card_variants, catalog.card_printings in share mode;');
    for(const [prior,next] of [["set local lock_timeout = '10s';","set local lock_timeout = '1s';"],
      ["set local statement_timeout = '60s';","set local statement_timeout = '5s';"]]) {
      assert.equal(sql[key].split(prior).length,2,'Recovered builder deadline changed; review before generating SQL');
      sql[key]=sql[key].replace(prior,next);
    }
  }
  // The generic publisher's global post-COMMIT count is unsuitable for this
  // bounded operation: a read error there could conceal a successful commit.
  // Return only the exact raw asset/memberships while locks and deadlines hold.
  const exactReceipt = operation => `select jsonb_build_object('operation',${q(operation)},'setId',${q(M6.setId)},
    'asset',${projection('a', ['id','asset_id','set_id','content_sha256','storage_key','byte_size'])},
    'memberships',coalesce((select jsonb_agg(to_jsonb(cva) order by cva.catalogue_version_id,cva.asset_id)
      from catalog.catalogue_version_assets cva where cva.asset_id=a.id and cva.set_id='${M6.setId}'::uuid
        and cva.asset_type='set_logo' and cva.catalogue_version_id in (${asset.versions.map(version => q(version) + '::uuid').join(',')})),'[]'::jsonb)) as mutation_receipt
  from catalog.assets a where a.asset_id=${q(asset.assetId)} and a.set_id='${M6.setId}'::uuid limit 1;
commit;\n`;
  const publicationTail = "commit;\nselect count(*) as published_reviewed_logos from api.asset_manifest where asset_id like 'reviewed:set-logo:%';\n";
  assert.ok(sql.publication.endsWith(publicationTail), 'Recovered publication tail changed; review before generating SQL');
  sql.publication = sql.publication.slice(0,-publicationTail.length) + exactReceipt('publish');
  assert.ok(sql.rollback.endsWith('commit;\n'), 'Recovered rollback tail changed; review before generating SQL');
  sql.rollback = sql.rollback.slice(0,-'commit;\n'.length) + exactReceipt('rollback');
  return sql;
}

async function privateDirectory(output) {
  assert.equal(process.platform,'win32','Private production batch files require the Windows D-drive workspace');
  const full = path.resolve(output), root = path.resolve(PRIVATE_ROOT);
  assert.ok(full.toLowerCase().startsWith(root.toLowerCase() + path.sep), 'Preparation output must remain under D:/Stackr-organization');
  for (let cursor = full; cursor; cursor = path.dirname(cursor)) {
    try { assert.equal((await lstat(cursor)).isSymbolicLink(), false, 'Output has a reparse ancestor'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path.dirname(cursor) === cursor) break;
  }
  await mkdir(full, { recursive: true }); return full;
}
async function writeFresh(output, name, data) { const bytes = typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'; await writeFile(path.join(output, name), bytes, { flag: 'wx' }); return sha(bytes); }

export async function prepareReadPlan(output, repo = REPO) {
  const evidence = await readM6Evidence(repo), directory = await privateDirectory(output);
  const sqlSha256 = await writeFresh(directory, 'preflight-read-only.sql', preflightSql());
  const explainSql = preflightSql().replace('with published as (', 'explain (format json, costs true)\nwith published as (');
  const explainSha256 = await writeFresh(directory, 'preflight-explain-only.sql', explainSql);
  const difference = { previousExecutedRead: 'read-plan/preflight-read-only.sql (five-second timeout, no before snapshot)', intermediateUnexecutedRead: 'read-plan-v2/preflight-read-only.sql',
    unchanged: ['Exact production M6 identity and all current published version memberships', 'Complete raw direct M6 logo memberships', 'All active rows at the exact provider/bucket/source-key and canonical-key, including ineligible rows', 'All deterministic canonical asset-identifier conflicts, including deleted/ineligible rows', 'All assets behind effective M6 logo links, including deleted/ineligible rows', 'Source/object/source-ID metadata and truncation rejection'],
    addedCompleteness: 'Inherited effective M6 logo memberships, CVA/asset-type disagreement and all ineligible/deleted assets behind those memberships are now captured using the live view COALESCE precedence.',
    explicitNarrowing: ['No global content-hash scan or foreign/deleted same-hash absence claim', 'No inventory of unlinked M6 assets at unrelated keys/identifiers; they cannot be reused or mutated by this exact-key operation', 'Unlinked deleted key rows at other asset identifiers are outside this operation: partial storage uniqueness excludes them; they are never reused, resurrected or mutated. All deleted deterministic-ID matches and deleted linked rows remain captured.'],
    strongerWriteBoundary: 'Reuse is limited to fully eligible ACTIVE exact M6 rows at the two controlled keys. The existing builder uses ON CONFLICT(asset_id) DO NOTHING and selects exact identifier with deleted_at NULL; no asset UPDATE or DELETE. Locked guards recheck this same exact candidate population.',
    queryShape: 'Materialize logo membership IDs before inherited identity joins; UNION separate active exact provider/bucket/key and all-row unique asset-ID producers, deduplicate IDs, then fetch metadata. Removes both observed V3 full historical deleted-key scans without hiding a unique-ID or linked-row conflict. EXPLAIN has no ANALYZE and must be inspected before running the changed read.',
    performanceProven: false };
  const semanticDiffSha256 = await writeFresh(directory, 'scope-and-query-diff.json', difference);
  const receipt = { schemaVersion: 'stackr-storm-m6-local-read-plan-v1', preparedAt: new Date().toISOString(), scope: M6, evidence,
    sql: 'preflight-read-only.sql', sqlSha256, explainSql: 'preflight-explain-only.sql', explainSha256, semanticDiff: 'scope-and-query-diff.json', semanticDiffSha256, executorMustVerifyActualProject: M6.project,
    requirements: ['Save the returned snapshot JSON verbatim and exact execution target separately.', 'The next preparation phase requires complete before-state and fails if any published M6 set-logo link exists.', 'Verify actual controlled image bytes/hash, not storage metadata alone, before any publication.', 'Review frozen publication and rollback before root execution.'],
    remoteCallsPerformed: false, published: false };
  await writeFresh(directory, 'preflight-read-plan.json', receipt); return receipt;
}

export async function prepareDecomposedReadPlan(output, repo = REPO) {
  const evidence=await readM6Evidence(repo), directory=await privateDirectory(output), parts=decomposedReadParts(), files={};
  for(const part of parts) {
    const filename=`part-0${part.ordinal}-${part.label}.sql`;
    files[filename]=await writeFresh(directory,filename,part.sql);
  }
  const plan={schemaVersion:'stackr-storm-m6-decomposed-read-plan-v1',preparedAt:new Date().toISOString(),scope:M6,evidence,
    parts:parts.map(part=>({ordinal:part.ordinal,label:part.label,file:`part-0${part.ordinal}-${part.label}.sql`,sha256:files[`part-0${part.ordinal}-${part.label}.sql`]})),
    equivalentPopulation:'Union of part2 linkedAssets and part3 assets equals the reviewed V4 candidate population; set/version and object/source projections unchanged. Complete effective link identity includes all COALESCE branches and CVA/asset-type mismatch. Only aggregation is decomposed; no timeout, rights, identity, deletion or truncation policy is relaxed.',
    consistency:'Each part carries its own timestamp. All four successful complete outputs are required; inconsistent duplicate asset fingerprints fail. These are separately observed states, not one MVCC snapshot. Exact identity, memberships, candidate rows and approval/provenance must be rechecked under publication locks before writing.',
    limitations:'No monolithic read retry. No actual before snapshot, SQL-engine rehearsal, upload or publication is established by this preparation.',
    files,executorMustVerifyActualProject:M6.project,remoteCallsPerformed:false,published:false};
  await writeFresh(directory,'decomposed-read-plan.json',plan); return plan;
}

export async function prepareM6Publication({ snapshotPath, partPaths, receiptDirectory, output, repo = REPO }) {
  assert.equal([Boolean(snapshotPath),Boolean(partPaths?.length),Boolean(receiptDirectory)].filter(Boolean).length,1,'Choose exactly one complete snapshot input');
  const receipts=receiptDirectory?await readM6ExecutionReceipts(receiptDirectory):null;
  const inputParts=partPaths?await Promise.all(partPaths.map(async file=>({file,bytes:await readFile(file)}))):[];
  const snapshotBytes = receipts?Buffer.from(JSON.stringify(receipts.snapshot)):partPaths ? Buffer.from(JSON.stringify(normalizeM6ReadParts(inputParts.map(input=>JSON.parse(input.bytes))))):await readFile(snapshotPath);
  const snapshot = JSON.parse(snapshotBytes), evidence = await readM6Evidence(repo);
  const plan = buildM6Plan(snapshot, evidence), sql = buildM6Transactions(plan), directory = await privateDirectory(output);
  const files = {};
  for(const input of receipts?.originals??[]) files[input.name]=await writeFresh(directory,input.name,input.bytes.toString('utf8'));
  for(const [index,input] of inputParts.entries()) files[`input-read-part-${index+1}.json`]=await writeFresh(directory,`input-read-part-${index+1}.json`,input.bytes.toString('utf8'));
  files['before-snapshot.json'] = await writeFresh(directory, 'before-snapshot.json', snapshotBytes.toString('utf8'));
  files['publication-plan.json'] = await writeFresh(directory, 'publication-plan.json', plan);
  files['publish-canonical-logo.sql'] = await writeFresh(directory, 'publish-canonical-logo.sql', sql.publication);
  files['rollback-canonical-logo.sql'] = await writeFresh(directory, 'rollback-canonical-logo.sql', sql.rollback);
  const rollback = { scope: M6, expectedPublishedAsset: plan.canonicalAssets[0], originalLinks: [], previousImmutableAssetsAndObjectsPreserved: true,
    method: 'Under identical exact identity/source/approval/version/membership drift guards, remove only this new M6 set-logo membership and restore the proved empty prior membership. Retain every asset row and storage object.', rollbackSql: 'rollback-canonical-logo.sql', executed: false };
  files['rollback-receipt.json'] = await writeFresh(directory, 'rollback-receipt.json', rollback);
  const freeze = { schemaVersion: 'stackr-storm-m6-frozen-local-batch-v1', preparedAt: new Date().toISOString(), files, evidence,
    inputReadParts:inputParts.map(input=>({path:input.file,sha256:sha(input.bytes)})),
    rootExecutedReadProof:receipts?.proof??[],
    preparerSha256: sha(await readFile(fileURLToPath(import.meta.url))), builderSha256: sha(await readFile(path.join(repo, 'scripts/prepare-reviewed-set-logo-catalogue-publication.mjs'))),
    actualByteVerificationStillRequired: plan.requiredByteVerification, remoteCallsPerformed: false, uploaded: false, published: false };
  await writeFresh(directory, 'frozen-preparation.json', freeze); return freeze;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const output = option('output'); assert.ok(output, 'Specify an exact private --output directory');
  assert.ok(!process.argv.some(arg => ['--execute', '--publish', '--upload'].includes(arg)), 'This tool prepares locally only');
  const result = process.argv.includes('--prepare-read-parts') ? await prepareDecomposedReadPlan(output)
    : process.argv.includes('--prepare-read-plan') ? await prepareReadPlan(output)
    : await prepareM6Publication({ snapshotPath: option('snapshot'),receiptDirectory:option('receipt-directory'),partPaths:process.argv.filter(arg=>arg.startsWith('--part=')).map(arg=>arg.slice(7)).length?process.argv.filter(arg=>arg.startsWith('--part=')).map(arg=>arg.slice(7)):undefined,output });
  console.log(JSON.stringify(result));
}
