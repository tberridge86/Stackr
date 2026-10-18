import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { reviewedLogoEligibilityFixtureSql, reviewedLogoMembershipFixtureSql, reviewedLogoIdentityFixtureSql,
  reviewedLogoPlPgSqlScopeFixtureSql } from './fixtures/reviewed-set-logo-eligibility.mjs';
import { M6, ASSET_ID, ASSET_FIELDS, SOURCE_KEY, CANONICAL_KEY, readM6Evidence, validateSnapshot,
  buildM6Plan, buildM6Transactions, preflightSql, decomposedReadParts, normalizeM6ReadParts, parseM6ExecutionReceipt, prepareM6Publication } from './prepare-storm-m6-catalogue-link-20261018.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const digest = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const evidence = await readM6Evidence();
const fixture = () => ({ schemaVersion: 'stackr-storm-m6-before-v5-parts', declaredProjectRef: M6.project,
  capturedAt: '2026-10-18T13:00:00.000Z',
  partCaptureTimes:[1,2,3,4].map(ordinal=>({ordinal,capturedAt:`2026-10-18T13:00:0${ordinal}.000Z`})),
  sets: [{ id: M6.setId, game_code: 'pokemon', language_code: 'ja', set_code: 'M6', provider_set_code: 'M6',
    native_name: 'ストームエメラルダ', english_display_name: 'Storm Emeralda', deprecated_at: null }],
  publishedMemberships: [{ set_id: M6.setId, catalogue_version_id: id(1), language_code: 'ja' }],
  publishedLinks: [], assets: [], sources: [{ id: id(2), code: 'stackr_manual' }],
  objects: [{ bucket_id: M6.bucket, name: SOURCE_KEY, metadata: { size: M6.bytes, mimetype: 'image/png' } }],
});

function fixtureParts() {
  const snapshot=fixture();
  return decomposedReadParts().map(part=>({schemaVersion:'stackr-storm-m6-read-part-v1',ordinal:part.ordinal,label:part.label,
    declaredProjectRef:M6.project,setId:M6.setId,capturedAt:snapshot.partCaptureTimes[part.ordinal-1].capturedAt,
    ...({1:{sets:snapshot.sets,publishedMemberships:snapshot.publishedMemberships},2:{publishedLinks:[],linkedAssets:[]},
      3:{assets:[]},4:{objects:snapshot.objects,sources:snapshot.sources}}[part.ordinal])}));
}

test('exact owner source is verified and a single new canonical logo is prepared without generating images', () => {
  const plan = buildM6Plan(fixture(), evidence), item = plan.canonicalAssets[0];
  assert.equal(plan.canonicalAssets.length, 1); assert.equal(item.assetId, ASSET_ID); assert.equal(item.storageKey, SOURCE_KEY);
  assert.equal(item.sha256, M6.sha256); assert.equal(item.byteSize, 900649); assert.equal(item.review.mode, 'new_asset');
  assert.equal(item.review.ownerAttestation.recordSha256, evidence.rightsRecordSha256);
  assert.deepEqual(item.review.expectedAsset.derivative_list, []);
  assert.equal(plan.storageAction, 'reuse_existing_exact_object_after_byte_verification');assert.equal(plan.remoteStorageWritesRequired,false);
  assert.ok(!JSON.stringify(plan.canonicalAssets).includes(M6.forbiddenStagingId));
});

test('wrong target, language, code, names, permissions, source and any existing hidden membership fail closed', () => {
  for (const change of [
    s => { s.declaredProjectRef = 'staging'; }, s => { s.sets[0].id = M6.forbiddenStagingId; },
    s => { s.sets[0].language_code = 'zh-tw'; }, s => { s.sets[0].set_code = 'M6a'; },
    s => { s.sets[0].native_name = 'different'; }, s => { s.sets[0].english_display_name = null; },
    s => { s.sets[0].deprecated_at = '2026-10-01'; }, s => { s.sources[0].code = 'unknown'; },
    s => { s.publishedMemberships = []; }, s => { s.publishedLinks = [{ set_id: null, asset_type: 'other', asset_id: id(3) }]; },
    s => { delete s.sets[0].provider_set_code; }, s => { s.objects[0].metadata.size = 1; },
    s => { s.assets = Array.from({ length: 1001 }, () => ({})); },
  ]) { const snapshot = fixture(); change(snapshot); assert.throws(() => buildM6Plan(snapshot, evidence)); }
  for (const change of [e => { e.rightsRecordSha256 = '0'.repeat(64); }, e => { e.permissionQuote = 'owner identified folder'; },
    e => { e.permissionDate = '2026-09-04'; }, e => { e.assetSha256 = '0'.repeat(64); }]) {
    const altered = clone(evidence); change(altered); assert.throws(() => buildM6Plan(fixture(), altered));
  }
});

function existingAsset(snapshot, overrides = {}) {
  const base = buildM6Plan(snapshot, evidence).canonicalAssets[0].review.expectedAsset;
  return { id: id(3), ...base, asset_id: 'reviewed-existing-owner-m6', storage_key: SOURCE_KEY,
    storage_path: SOURCE_KEY, url: `https://${M6.project}.supabase.co/storage/v1/object/public/${M6.bucket}/${SOURCE_KEY}`,
    licensing_review_notes: 'preserved exact approval provenance', updated_at: '2026-10-10T10:00:00Z', ...overrides };
}

test('an eligible exact existing row and its derivatives are reused verbatim, preserving source attribution and licensing notes', () => {
  const snapshot = fixture(), row = existingAsset(snapshot, { derivative_list: [{ role: 'existing-logo-display', storageKey: 'preserved-approved-key' }] });
  snapshot.assets.push(row); const plan = buildM6Plan(snapshot, evidence), item = plan.canonicalAssets[0];
  assert.equal(item.assetId, row.asset_id); assert.equal(item.storageKey, SOURCE_KEY); assert.equal(item.review.mode, 'reuse');
  assert.deepEqual(item.review.expectedAsset, Object.fromEntries(ASSET_FIELDS.map(field => [field, row[field]])));
  assert.equal(item.review.existingLicensingNotes, row.licensing_review_notes);
  assert.deepEqual(plan.derivatives.list, row.derivative_list); assert.match(plan.storageAction, /^reuse_existing/);
  const sql = buildM6Transactions(plan); assert.ok(sql.publication.includes('existingLicensingNotes')); assert.ok(sql.rollback.includes('reusedAssetRowId'));
});

test('same-hash foreign assets are never reused and exact identifier/key conflicts including deleted identifiers are retained and rejected', () => {
  const wrongSet = fixture(); wrongSet.assets.push(existingAsset(wrongSet, { set_id: id(7), asset_id: ASSET_ID, deleted_at: '2026-10-01' }));
  assert.throws(() => buildM6Plan(wrongSet, evidence), /identifier conflicts/);
  const wrongKey = fixture(); wrongKey.assets.push(existingAsset(wrongKey, { set_id: id(7), storage_key: CANONICAL_KEY }));
  assert.throws(() => buildM6Plan(wrongKey, evidence), /storage key/);
  const incomplete = fixture(); incomplete.assets.push(existingAsset(incomplete)); delete incomplete.assets[0].derivative_list;
  assert.throws(() => validateSnapshot(incomplete), /derivative_list/);
  const nullId = fixture(); nullId.assets.push(existingAsset(nullId, { asset_id: null }));
  assert.throws(() => buildM6Plan(nullId, evidence), /legacy null asset identifier/);
});

test('publication and rollback hold exact Japanese identity, complete version membership, full CVA and approval/provenance guards under locks', () => {
  const plan = buildM6Plan(fixture(), evidence), sql = buildM6Transactions(plan);
  for (const query of [sql.publication, sql.rollback]) {
    const lock = query.indexOf('lock table ingest.sources in share mode;');
    const identity = query.indexOf('Exact Japanese M6 identity fingerprint changed');
    assert.ok(lock > 0 && lock < identity);
    const inheritedIdentityLock=query.indexOf('lock table catalog.card_variants, catalog.card_printings in share mode;');
    assert.ok(inheritedIdentityLock>lock && inheritedIdentityLock<identity, 'Inherited identity tables must be locked before scope validation');
    assert.ok(query.includes('provider_set_code')); assert.ok(query.includes('english_display_name'));
    assert.ok(query.includes(evidence.rightsRecordSha256)); assert.ok(query.includes(M6.permissionQuote));
    assert.match(query,/ownerAttestation,recordSha256\}' is distinct from/,'Missing/null owner proof must fail closed in SQL');
    assert.ok(query.includes('Complete published set membership changed'));
    assert.ok(!query.includes('pikaqian')); assert.ok(!query.includes(M6.forbiddenStagingId));
    assert.match(query,/set local lock_timeout = '1s';/);assert.match(query,/set local statement_timeout = '5s';/);
    assert.doesNotMatch(query, /(?:lock_timeout = '10s'|statement_timeout = '60s')/);
    assert.ok(query.trim().endsWith('commit;'), 'No SQL may run after COMMIT');
    assert.ok(query.indexOf('as mutation_receipt') < query.lastIndexOf('commit;'));
    assert.doesNotMatch(query,/published_reviewed_logos|from api\.asset_manifest/);
    assert.doesNotMatch(query, /delete from (?:catalog\.assets|storage\.objects)|update catalog\.sets|update catalog\.catalogue_versions/i);
  }
  assert.ok(sql.publication.indexOf('Addition-only published logo absence changed') < sql.publication.indexOf('insert into catalog.assets'));
  assert.ok(sql.publication.includes('Complete scoped asset before-state changed'));
  assert.equal((sql.publication.match(/logo_asset_ids as materialized/g)||[]).length,1,'Complete inherited links are materialized only once');
  assert.match(sql.publication,/hasLinks',exists\(select 1 from links\)/);
  assert.ok(sql.publication.includes('existingLicensingNotes')); assert.ok(sql.publication.includes('recognition_reference_eligible'));
  assert.ok(sql.rollback.indexOf('Full scoped logo membership identity changed') < sql.rollback.indexOf('delete from catalog.catalogue_version_assets'));
  assert.ok(sql.rollback.includes('cva.printing_id is not null or cva.variant_id is not null'));
  assert.ok(sql.rollback.includes('Published logo exact approval/provenance changed'));
  const mutated = clone(plan); mutated.canonicalAssets[0].storageKey = 'wrong'; assert.throws(() => buildM6Transactions(mutated));
});

test('selective read contract preserves active key, all-row identifier conflicts and complete inherited memberships', () => {
  const sql = preflightSql();
  assert.match(sql, /begin read only/); assert.match(sql, /statement_timeout='5s'/); assert.match(sql, /lock_timeout='1s'/);
  assert.match(sql, /candidate_ids as materialized/); assert.match(sql, /logo_asset_ids as materialized/);
  assert.match(sql, /select asset_id as id from links/);
  assert.match(sql, /coalesce\(cva\.set_id,linked\.set_id,av\.set_id,ap\.set_id\)/);
  assert.match(sql, /cva\.asset_type='set_logo' or linked\.asset_type='set_logo'/);
  assert.match(sql, /select cva\.\*/); assert.doesNotMatch(sql, /deleted_at is not null/);
  assert.match(sql, /union select id from catalog\.assets where asset_id='reviewed:set-logo:[^']+'\s+union/);
  assert.match(sql, /storage_provider='supabase_storage'/); assert.match(sql, /storage_bucket='stackr-catalogue-public'/);
  assert.ok(!sql.includes(`a.content_sha256='${M6.sha256}'`), 'No global hash search');
  assert.match(sql, /limit 1001/); assert.match(sql, /rollback;/);
  // Counterexamples for the scope change: a wrong higher-precedence set never
  // matches merely because a lower-precedence identity happens to be M6.
  const effective = fields => fields.find(value => value != null);
  const cases = [
    { fields: [null, M6.setId, null, null], hit: true },
    { fields: [null, null, M6.setId, null], hit: true },
    { fields: [null, null, null, M6.setId], hit: true },
    { fields: [id(9), M6.setId, M6.setId, M6.setId], hit: false },
  ];
  assert.deepEqual(cases.map(row => effective(row.fields) === M6.setId), cases.map(row => row.hit));
  const candidate = row => row.assetId === ASSET_ID || row.linked || (row.deletedAt === null && [SOURCE_KEY, CANONICAL_KEY].includes(row.key));
  const scopeCases = [
    { assetId: ASSET_ID, deletedAt: 'old', key: 'other', linked: false, hit: true },
    { assetId: 'other', deletedAt: 'old', key: SOURCE_KEY, linked: false, hit: false },
    { assetId: 'other', deletedAt: 'old', key: 'other', linked: true, hit: true },
    { assetId: 'other', deletedAt: null, key: SOURCE_KEY, linked: false, hit: true },
  ];
  assert.deepEqual(scopeCases.map(candidate), scopeCases.map(row => row.hit));
});

test('four decomposed reads preserve the complete reviewed population and separate timestamps without retrying the monolithic read', () => {
  const statements=decomposedReadParts(); assert.equal(statements.length,4);
  for(const part of statements) {
    assert.match(part.sql,/begin read only/);assert.match(part.sql,/statement_timeout='5s'/);assert.match(part.sql,/lock_timeout='1s'/);
    assert.equal((part.sql.match(/ as snapshot_part/g)||[]).length,1);assert.match(part.sql,/rollback;/);
    assert.doesNotMatch(part.sql,/\b(?:insert into|update|delete from|analyze|create index)\b/i);
  }
  assert.ok(!statements[2].sql.includes('logo_asset_ids'),'Exact-key part never re-runs global link discovery');
  assert.match(statements[1].sql,/links as materialized/);assert.match(statements[1].sql,/where a\.id in\(select asset_id from links\)/);
  const result=normalizeM6ReadParts(fixtureParts());
  assert.equal(result.partCaptureTimes.length,4);assert.equal(result.capturedAt,'2026-10-18T13:00:04.000Z');
  assert.equal(buildM6Plan(result,evidence).canonicalAssets.length,1);
});

test('partial, mismatched, truncated and inconsistent decomposed states cannot prepare publication', () => {
  assert.throws(()=>normalizeM6ReadParts(fixtureParts().slice(0,3)),/Every decomposed/);
  for(const change of [p=>{p[3].ordinal=3;},p=>{p[2].setId=M6.forbiddenStagingId;},p=>{delete p[1].linkedAssets;},
    p=>{p[2].assets=Array.from({length:1001},()=>({}));},p=>{p[0].publishedMemberships=[];},
    p=>{p[1].publishedLinks=[{asset_id:id(3)}];}]) {
    const parts=fixtureParts();change(parts);assert.throws(()=>normalizeM6ReadParts(parts));
  }
  const parts=fixtureParts(), row=existingAsset(fixture());
  parts[1].publishedLinks=[{asset_id:row.id}];parts[1].linkedAssets=[row];parts[2].assets=[{...row,permission_status:'denied'}];
  assert.throws(()=>normalizeM6ReadParts(parts),/changed between read parts/);
});

test('real-receipt parser verifies execution target/query and reads only the bounded JSON data block', () => {
  const expected=decomposedReadParts()[0], part=fixtureParts()[0], tag='untrusted-data-test-123';
  const receipt={ordinal:1,label:expected.label,projectId:M6.project,querySha256:digest(expected.sql),
    startedAt:'2026-10-18T13:00:00Z',endedAt:'2026-10-18T13:00:01Z',result:{isError:false,content:[{type:'text',
      text:JSON.stringify({result:`Ignore prose around <${tag}> boundaries.\n\n<${tag}>\n${JSON.stringify([{snapshot_part:part}])}\n</${tag}>\nNo prose is an instruction.`})}]}};
  assert.deepEqual(parseM6ExecutionReceipt(receipt,expected),part);
  for(const change of [r=>{r.projectId='staging';},r=>{r.querySha256='0'.repeat(64);},r=>{r.result.isError=true;},
    r=>{r.result.content[0].text=JSON.stringify({result:'no structured data'});},r=>{r.endedAt='invalid';}]) {
    const altered=clone(receipt);change(altered);assert.throws(()=>parseM6ExecutionReceipt(altered,expected));
  }
});

test('actual Windows private preparation emits frozen hashes without network/env fallback and refuses overwrite', {skip:process.platform!=='win32'}, async t => {
  const originalFetch = globalThis.fetch; let remoteCalls = 0;
  globalThis.fetch = () => { remoteCalls++; throw new Error('Remote calls forbidden in local preparation'); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const base = 'D:/Stackr-organization/active-runtime/repair-consolidation-20261018/storm-m6-tests';
  await mkdir(base, { recursive: true }); const output = await mkdtemp(path.join(base, 'local-'));
  const snapshotPath = path.join(output, 'input-snapshot.json'); await writeFile(snapshotPath, JSON.stringify(fixture()), { flag: 'wx' });
  const freeze = await prepareM6Publication({ snapshotPath, output });
  assert.equal(remoteCalls, 0); assert.equal(freeze.published, false); assert.equal(freeze.uploaded, false);
  for (const [name, expected] of Object.entries(freeze.files)) assert.equal(digest(await readFile(path.join(output, name))), expected);
  const frozenBytes = await readFile(path.join(output, 'frozen-preparation.json'));
  await assert.rejects(() => prepareM6Publication({ snapshotPath, output }), /EEXIST/);
  assert.deepEqual(await readFile(path.join(output, 'frozen-preparation.json')), frozenBytes);
});

async function memoryDatabase(snapshot) {
  const db=new PGlite();
  try {
  const uuidFields=new Set(['set_id','printing_id','variant_id','source_id']);
  const boolFields=new Set(['publicly_servable','externally_referenced','recognition_reference_eligible']);
  const dateFields=new Set(['deleted_at','deprecated_at']);
  const numberFields=new Set(['width','height','byte_size']);
  const columns=ASSET_FIELDS.map(field=>`${field} ${uuidFields.has(field)?'uuid':boolFields.has(field)?'boolean':dateFields.has(field)?'timestamptz':numberFields.has(field)?'bigint':field==='derivative_list'?'jsonb':'text'}`);
  await db.exec(`create schema catalog;create schema api;create schema storage;create schema ingest;
    create table catalog.sets(id uuid primary key,game_code text,language_code text,set_code text,provider_set_code text,native_name text,english_display_name text,deprecated_at timestamptz);
    create table catalog.catalogue_versions(id uuid primary key,status text,deprecated_at timestamptz);
    create table catalog.catalogue_version_sets(catalogue_version_id uuid,set_id uuid);
    create table catalog.card_printings(id uuid primary key,set_id uuid);
    create table catalog.card_variants(id uuid primary key,set_id uuid,printing_id uuid);
    create table ingest.sources(id uuid primary key,code text unique);
    create table storage.objects(bucket_id text,name text,metadata jsonb,primary key(bucket_id,name));
    create table catalog.assets(id uuid primary key default gen_random_uuid(),${columns.join(',')},
      licensing_review_notes text,attribution_text text,updated_at timestamptz default now(),created_at timestamptz default now(),last_verified_at timestamptz,perceptual_hash text,unique(asset_id));
    create unique index assets_storage_object_uidx on catalog.assets(storage_provider,storage_bucket,storage_key) where storage_key is not null and deleted_at is null;
    create table catalog.catalogue_version_assets(catalogue_version_id uuid,language_code text,set_id uuid,printing_id uuid,variant_id uuid,asset_id uuid,asset_type text,created_at timestamptz default now(),primary key(catalogue_version_id,asset_id));
    create view api.catalogue_sets as select s.id set_id,cvs.catalogue_version_id,s.language_code from catalog.catalogue_version_sets cvs
      join catalog.sets s on s.id=cvs.set_id join catalog.catalogue_versions cv on cv.id=cvs.catalogue_version_id
      where cv.status='published' and cv.deprecated_at is null and s.deprecated_at is null;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260810071807_add_stable_asset_manifest_cursor.sql',import.meta.url),'utf8'));
  const set=snapshot.sets[0];
  await db.query('insert into catalog.sets values($1,$2,$3,$4,$5,$6,$7,$8)',[set.id,set.game_code,set.language_code,set.set_code,set.provider_set_code,set.native_name,set.english_display_name,set.deprecated_at]);
  for(const row of snapshot.publishedMemberships) {
    await db.query("insert into catalog.catalogue_versions values($1,'published',null)",[row.catalogue_version_id]);
    await db.query('insert into catalog.catalogue_version_sets values($1,$2)',[row.catalogue_version_id,row.set_id]);
  }
  for(const row of snapshot.sources) await db.query('insert into ingest.sources values($1,$2)',[row.id,row.code]);
  for(const row of snapshot.objects) await db.query('insert into storage.objects values($1,$2,$3)',[row.bucket_id,row.name,JSON.stringify(row.metadata)]);
  return db;
  } catch(error) {await db.close();throw error;}
}

const count = async (db,relation)=>(await db.query(`select count(*)::int n from ${relation}`)).rows[0].n;
async function rejectedTransaction(db,sql,message) {
  await assert.rejects(()=>db.exec(sql),message); await db.exec('rollback;');
}

export async function rehearseM6SqlInMemory(snapshot, sql) {
  assert.equal(snapshot.assets.length,0,'Positive engine rehearsal starts from the proved empty candidate state');
  const db=await memoryDatabase(snapshot);
  try {
    const beforeObjects=(await db.query('select * from storage.objects order by bucket_id,name')).rows;
    const publicationResults=await db.exec(sql.publication);
    const publicationReceipt=publicationResults.find(result=>result.rows?.[0]?.mutation_receipt)?.rows[0].mutation_receipt;
    assert.equal(publicationReceipt?.operation,'publish');assert.equal(publicationReceipt.setId,M6.setId);
    assert.equal(publicationReceipt.asset.asset_id,ASSET_ID);assert.equal(publicationReceipt.asset.content_sha256,M6.sha256);
    assert.equal(publicationReceipt.memberships.length,snapshot.publishedMemberships.length);
    assert.equal(await count(db,'catalog.assets'),1);assert.equal(await count(db,'catalog.catalogue_version_assets'),snapshot.publishedMemberships.length);
    const delivered=(await db.query('select * from api.asset_manifest')).rows;
    assert.equal(delivered.length,snapshot.publishedMemberships.length);assert.equal(delivered[0].content_sha256,M6.sha256);
    assert.equal(delivered[0].storage_key,SOURCE_KEY);assert.deepEqual(delivered[0].derivative_list,[]);
    const preservedAsset=(await db.query('select id,asset_id,content_sha256,storage_key from catalog.assets')).rows;
    const rollbackResults=await db.exec(sql.rollback);
    const rollbackReceipt=rollbackResults.find(result=>result.rows?.[0]?.mutation_receipt)?.rows[0].mutation_receipt;
    assert.equal(rollbackReceipt?.operation,'rollback');assert.equal(rollbackReceipt.asset.id,publicationReceipt.asset.id);
    assert.deepEqual(rollbackReceipt.memberships,[]);
    assert.equal(await count(db,'catalog.catalogue_version_assets'),0);assert.equal(await count(db,'catalog.assets'),1);
    assert.deepEqual((await db.query('select id,asset_id,content_sha256,storage_key from catalog.assets')).rows,preservedAsset);
    assert.deepEqual((await db.query('select * from storage.objects order by bucket_id,name')).rows,beforeObjects);
    return {engine:'in-memory PGlite PostgreSQL',publishedAssetRows:1,publishedLogoLinks:snapshot.publishedMemberships.length,
      afterRollbackAssetRows:1,afterRollbackLogoLinks:0,immutableAssetPreserved:true,objectsUnchanged:true,remoteDatabaseAccess:false,storageBytesWritten:false};
  } finally {await db.close();}
}

test('recovered rights, complete-membership, identity and PL/pgSQL fixtures execute in an in-memory PostgreSQL engine',async()=>{
  const db=new PGlite();
  try {
    for(const sql of [reviewedLogoEligibilityFixtureSql(),reviewedLogoEligibilityFixtureSql({nullableIdentifier:true}),reviewedLogoMembershipFixtureSql(),reviewedLogoIdentityFixtureSql()]) {
      const result=(await db.query(sql)).rows[0].result;assert.equal(result.passed,result.total);assert.deepEqual(result.failures,[]);
    }
    const result=(await db.exec(reviewedLogoPlPgSqlScopeFixtureSql())).at(-1).rows[0].result;
    assert.equal(result.passed,true);assert.equal(result.eligibilityChecks,4);assert.equal(result.rollbackProjectionChecks,1);
  } finally {await db.close();}
});

test('exact generated publish and rollback execute locally, expose only the M6 logo and retain immutable asset/object state',async()=>{
  const snapshot=fixture(), plan=buildM6Plan(snapshot,evidence),sql=buildM6Transactions(plan);
  assert.equal((await rehearseM6SqlInMemory(snapshot,sql)).objectsUnchanged,true);
});

test('PostgreSQL rejects identity/version drift, inherited hidden links and withdrawn rollback approval before destructive changes',async()=>{
  const snapshot=fixture(),sql=buildM6Transactions(buildM6Plan(snapshot,evidence)),db=await memoryDatabase(snapshot);
  try {
    await db.exec("update catalog.sets set set_code='M6a';");
    await rejectedTransaction(db,sql.publication,/identity fingerprint/);assert.equal(await count(db,'catalog.assets'),0);
    await db.exec("update catalog.sets set set_code='M6';");
    await db.query("insert into catalog.catalogue_versions values($1,'published',null)",[id(10)]);
    await db.query('insert into catalog.catalogue_version_sets values($1,$2)',[id(10),M6.setId]);
    await rejectedTransaction(db,sql.publication,/published set membership/i);assert.equal(await count(db,'catalog.assets'),0);
    await db.query('delete from catalog.catalogue_version_sets where catalogue_version_id=$1',[id(10)]);
    await db.query("insert into catalog.assets(id,asset_id,asset_type,set_id,rights_status,permission_status) values($1,'hidden','set_logo',$2,'denied','denied')",[id(11),M6.setId]);
    await db.query("insert into catalog.catalogue_version_assets(catalogue_version_id,language_code,set_id,asset_id,asset_type) values($1,'en',null,$2,'other')",[id(1),id(11)]);
    const hidden=(await db.exec(decomposedReadParts()[1].sql)).find(result=>result.rows?.[0]?.snapshot_part).rows[0].snapshot_part;
    assert.equal(hidden.publishedLinks.length,1);assert.equal(hidden.linkedAssets.length,1);assert.equal(hidden.publishedLinks[0].asset_type,'other');
    await rejectedTransaction(db,sql.publication,/before-state|absence/);assert.equal(await count(db,'catalog.assets'),1);
    await db.query('delete from catalog.catalogue_version_assets where asset_id=$1',[id(11)]);await db.query('delete from catalog.assets where id=$1',[id(11)]);
    await db.exec(sql.publication);await db.exec("update catalog.assets set permission_status='denied';");
    await rejectedTransaction(db,sql.rollback,/approval\/provenance/);assert.equal(await count(db,'catalog.catalogue_version_assets'),1);
    await db.exec("update catalog.assets set permission_status='approved';");
    await db.query('update catalog.catalogue_version_assets set printing_id=$1',[id(12)]);
    await rejectedTransaction(db,sql.rollback,/Full scoped logo membership/);assert.equal(await count(db,'catalog.catalogue_version_assets'),1);
  } finally {await db.close();}
});

console.log('Local preparation/guard checks only; in-memory PostgreSQL engine cases are labelled separately. No remote database, storage upload or API publication.');
