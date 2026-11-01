import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildPublication } from './build-publication.mjs';
import { BATCH } from './batch.mjs';
const {PGlite}=createRequire('D:/Stackr/package.json')('@electric-sql/pglite');
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(path.join(ROOT,name),'utf8'));
const manifest=read('publication/object-manifest.json'),envelope=read('envelope.json'),prior=read('prior.json'),authority=read('authority.json');
// In-memory fixtures only. These are never persisted as proof of external GETs.
const verification={bucket:manifest.bucket,verifiedAt:'2026-11-01T20:45:00Z',objects:manifest.objects.map(o=>({key:o.key,status:200,
 deliveryUrl:o.plannedDeliveryUrl,sha256:o.sha256,bytes:o.bytes,width:o.width,height:o.height,mimeType:o.mimeType,cacheControl:'max-age=14400'}))};
const evidence=Object.fromEntries(['manifest','envelope','prior','verification','authority'].map(k=>[k,{sha256:'a'.repeat(64)}]));
const input={manifest,envelope,prior,authority,verification,evidence};
let result=buildPublication(input),scenarios=0;
for(const mutate of [
 x=>x.verification.objects.pop(),x=>x.verification.objects[0].status=404,
 x=>x.verification.objects[0].sha256='0'.repeat(64),x=>x.verification.objects[0].deliveryUrl='https://wrong.invalid/image.png',
 x=>delete x.verification.objects[0].cacheControl,x=>x.verification.objects[0].cacheControl='max-age=14400\ninvalid',
 x=>{x.verification.objects[0].sha256='0'.repeat(64);x.manifest.objects[0].sha256='0'.repeat(64);},
 x=>{x.manifest.objects[1].sha256='0'.repeat(64);x.manifest.assets[0].asset.derivative_list[0].contentSha256='0'.repeat(64);x.verification.objects[1].sha256='0'.repeat(64);},
 x=>x.authority.approved=false,x=>x.authority.scope.setIds[0]=BATCH[1].setId,
 x=>x.authority.provenance.sourceSha256='0'.repeat(64),x=>x.authority.scope.originalSha256s[0]='0'.repeat(64),
 x=>x.authority.scope.sourceWideAuthority=true,x=>x.authority.scope.operations=['immutable-upload'],
 x=>x.envelope.sets[0].language_code='en',x=>x.envelope.candidateAssets.push({}),
 x=>x.envelope.publishedMemberships.pop(),x=>x.prior.publishedLinks.push({...x.prior.publishedLinks[0]}),
 x=>x.prior.linkedAssets[0].permission_status='pending',x=>x.prior.linkedAssets[0].content_sha256='0'.repeat(64),
 x=>x.prior.publishedLinks[0].variant_id='01234567-1234-4123-8123-0123456789ab',
 x=>x.prior.publishedLinks[0].asset_type='card_image',x=>x.prior.linkedAssets[0].deleted_at='2026-11-01T00:00:00Z',
]) {const changed=structuredClone(input);mutate(changed);assert.throws(()=>buildPublication(changed));scenarios++;}
const frozen=process.argv[2];
if(frozen) {
 const plan=JSON.parse(fs.readFileSync(path.join(frozen,'publication-plan.json'),'utf8'));
 const actual=buildPublication({...input,verification:plan.verification,evidence:plan.evidence});
 assert.deepEqual(actual.plan,plan);assert.equal(actual.publish,fs.readFileSync(path.join(frozen,'publish.sql'),'utf8'));
 assert.equal(actual.rollback,fs.readFileSync(path.join(frozen,'rollback.sql'),'utf8'));result=actual;scenarios++;
}
const db=new PGlite();
const q=x=>`'${String(x).replaceAll("'","''")}'`;
const allAssets=[...prior.linkedAssets,...result.plan.assets];
const assetFields=[...new Set(allAssets.flatMap(Object.keys))];
const uuidFields=['id','set_id','source_id','printing_id','variant_id'];
const type=key=>uuidFields.includes(key)?'uuid':/(_at|_until)$/.test(key)?'timestamptz'
 :allAssets.some(a=>typeof a[key]==='boolean')?'boolean'
 :allAssets.some(a=>typeof a[key]==='number')?'bigint'
 :allAssets.some(a=>a[key]&&typeof a[key]==='object')?'jsonb':'text';
async function insert(table,row) {const keys=Object.keys(row);await db.exec(`insert into ${table} (${keys.join(',')}) select ${keys.map(k=>'r.'+k).join(',')} from jsonb_populate_record(null::${table},${q(JSON.stringify(row))}::jsonb) r`);}
async function count(table) {return Number((await db.query(`select count(*) as n from ${table}`)).rows[0].n);}
async function reject(sql,pattern){await assert.rejects(db.exec(sql),pattern);await db.exec('rollback');scenarios++;}
async function seed(){
 await db.exec('truncate catalog.catalogue_version_assets,catalog.assets,catalog.card_variants,catalog.card_printings,catalog.catalogue_version_sets,catalog.sets,catalog.catalogue_versions,ingest.sources;');
 for(const set of envelope.sets)await insert('catalog.sets',set);
 await insert('ingest.sources',envelope.sources[0]);
 for(const version of new Set(envelope.publishedMemberships.map(x=>x.catalogue_version_id)))await insert('catalog.catalogue_versions',{id:version,status:'published',deprecated_at:null});
 for(const member of envelope.publishedMemberships)await insert('catalog.catalogue_version_sets',member);
 for(const asset of prior.linkedAssets)await insert('catalog.assets',asset);
 for(const link of prior.publishedLinks)await insert('catalog.catalogue_version_assets',link);
}
try {
 await db.exec(`create schema catalog;create schema api;create schema ingest;
 create table catalog.assets(${assetFields.map(k=>k+' '+type(k)+(k==='id'?' primary key':'')+(k==='asset_id'?' unique':'')).join(',')}${assetFields.includes('last_verified_at')?'':',last_verified_at timestamptz'});
 create table catalog.catalogue_versions(id uuid primary key,status text,deprecated_at timestamptz);
 create table catalog.card_variants(id uuid primary key,set_id uuid,printing_id uuid);
 create table catalog.card_printings(id uuid primary key,set_id uuid);
 create table catalog.catalogue_version_assets(catalogue_version_id uuid,language_code text,set_id uuid,printing_id uuid,variant_id uuid,asset_id uuid,asset_type text,created_at timestamptz default now(),primary key(catalogue_version_id,asset_id));
 create table catalog.sets(id uuid primary key,set_code text,provider_set_code text,game_code text,language_code text,native_name text,english_display_name text,deprecated_at timestamptz);
 create table ingest.sources(id uuid primary key,code text);
 create table catalog.catalogue_version_sets(set_id uuid,language_code text,catalogue_version_id uuid);
 create view api.catalogue_sets as select s.* from catalog.catalogue_version_sets s join catalog.catalogue_versions v on v.id=s.catalogue_version_id where v.status='published' and v.deprecated_at is null;`);
 await seed();await db.exec(result.publish);
 assert.equal(await count('catalog.assets'),4);assert.equal(await count('catalog.catalogue_version_assets'),2);
 assert.equal(Number((await db.query(`select count(*) n from catalog.catalogue_version_assets where asset_id in (${BATCH.map(x=>q(x.rowId)+'::uuid').join(',')})`)).rows[0].n),2);
 const fresh=(await db.query(`select cache_control,derivative_list from catalog.assets where id=${q(BATCH[0].rowId)}::uuid`)).rows[0];
 assert.equal(fresh.cache_control,'max-age=14400');assert.ok(fresh.derivative_list.every(x=>x.cacheControl==='max-age=14400'));scenarios++;
 await reject(result.publish,/Complete effective logo links changed/);
 await db.exec(result.rollback);assert.equal(await count('catalog.assets'),4);assert.equal(await count('catalog.catalogue_version_assets'),2);
 for(const old of prior.publishedLinks)assert.equal((await db.query(`select to_jsonb(l)=to_jsonb(jsonb_populate_record(null::catalog.catalogue_version_assets,${q(JSON.stringify(old))}::jsonb)) ok from catalog.catalogue_version_assets l where l.asset_id=${q(old.asset_id)}::uuid`)).rows[0].ok,true);
 scenarios++;await reject(result.rollback,/Complete effective logo links changed/);
 await seed();await db.exec(`update catalog.catalogue_version_assets set created_at=created_at+interval '1 hour' where asset_id=${q(prior.publishedLinks[0].asset_id)}::uuid`);
 await reject(result.publish,/Complete effective logo links changed/);
 await seed();await db.exec(`update catalog.assets set permission_status='pending' where id=${q(prior.linkedAssets[0].id)}::uuid`);
 await reject(result.publish,/Previous immutable asset before-state changed/);assert.equal(await count('catalog.assets'),2);
 await seed();await db.exec(`update catalog.sets set language_code='en' where id=${q(BATCH[0].setId)}::uuid`);
 await reject(result.publish,/Exact Japanese set identity changed/);
 await seed();await db.exec(`update catalog.catalogue_version_assets set language_code='en' where asset_id=${q(prior.publishedLinks[0].asset_id)}::uuid`);
 await reject(result.publish,/Complete effective logo links changed/);
 await seed();const anotherVersion='01234567-1234-4123-8123-0123456789ab';
 await insert('catalog.catalogue_versions',{id:anotherVersion,status:'published',deprecated_at:null});
 await insert('catalog.catalogue_version_sets',{set_id:BATCH[0].setId,language_code:'ja',catalogue_version_id:anotherVersion});
 await reject(result.publish,/Complete published memberships changed/);
 await seed();const inherited='11234567-1234-4123-8123-0123456789ab';
 await insert('catalog.assets',{...prior.linkedAssets[0],id:inherited,asset_id:'fixture-inherited',set_id:null,printing_id:inherited});
 await insert('catalog.card_printings',{id:inherited,set_id:BATCH[0].setId});
 await insert('catalog.catalogue_version_assets',{...prior.publishedLinks[0],asset_id:inherited,set_id:null,asset_type:null});
 await reject(result.publish,/Complete effective logo links changed/);
 await seed();await insert('catalog.assets',result.plan.assets[0]);await reject(result.publish,/Replacement candidate before-state changed/);
 await seed();await db.exec(result.publish);await db.exec(`update catalog.assets set width=1 where id=${q(BATCH[0].rowId)}::uuid`);
 await reject(result.rollback,/Replacement immutable asset metadata changed/);
 await seed();await db.exec(result.publish);await db.exec(`update catalog.assets set source_attribution='changed' where id=${q(prior.linkedAssets[0].id)}::uuid`);
 await reject(result.rollback,/Previous immutable asset before-state changed/);
 await seed();await db.exec(result.publish);await db.exec(`delete from catalog.catalogue_version_assets where asset_id=${q(BATCH[0].rowId)}::uuid`);
 await reject(result.rollback,/Complete effective logo links changed/);
 await seed();await db.exec(result.publish);await db.exec(`update catalog.catalogue_version_assets set created_at=created_at+interval '1 hour' where asset_id=${q(BATCH[0].rowId)}::uuid`);
 await reject(result.rollback,/Complete effective logo links changed/);
 // A failure on the second new asset must roll back the entire transaction.
 await seed();await db.exec(`create function catalog.reject_second() returns trigger language plpgsql as $$begin if new.id=${q(BATCH[1].rowId)}::uuid then raise exception 'second fixture failure';end if;return new;end;$$;create trigger reject_second before insert on catalog.assets for each row execute function catalog.reject_second();`);
 await reject(result.publish,/second fixture failure/);assert.equal(await count('catalog.assets'),2);assert.equal(await count('catalog.catalogue_version_assets'),2);
 console.log(JSON.stringify({pass:true,scenarios,remoteEffects:0,actualFrozenPacket:Boolean(frozen)}));
}finally{await db.close();}
