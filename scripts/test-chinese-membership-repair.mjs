import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const sql=readFileSync('supabase/manual/chinese_membership_repair_20261011.sql','utf8');
const version='79f43e8f-7062-4d29-8571-569eccb7c249';
const expected=[
 ['7d02957d-9876-420a-81f0-0bc347eb012e','258e3d35-f4ce-4f5e-a201-50452ddfbad3','a702fde2-d188-4521-9127-0287f79fc1fc','9cb82b70-c6cf-4c7e-a2bf-0bd3fe44a45e','7bf1e1c6-2caf-46cc-8a0f-ba85abec5ed2','013','圆陆鲨'],
 ['a7f6873d-5d84-44ec-ac47-cf376061f3bf','7a60470a-5110-4b41-9c97-c3d9b524a648','a702fde2-d188-4521-9127-0287f79fc1fc','e1d5d9a4-87be-42f3-bd07-828b81434fe6','7bf1e1c6-2caf-46cc-8a0f-ba85abec5ed2','014','尖牙陆鲨'],
 ['5bff5571-a70e-4c7f-a834-430ebc3178f1','a4e135fb-8cb6-4164-9fff-011e987be52b','a702fde2-d188-4521-9127-0287f79fc1fc','360afabc-341c-4a5b-94e4-f56776fe9dc8','7bf1e1c6-2caf-46cc-8a0f-ba85abec5ed2','015','烈咬陆鲨'],
];
const digest=createHash('md5').update(expected.map(r=>r.slice(0,5).join(':')).sort().join(',')).digest('hex');
assert.equal(digest,'447d442ec003e1bf1cb0dca3726cc6b4');
assert.match(sql,/^begin;/m);
assert.match(sql,/\nrollback;\s*\nselect 'REHEARSAL_ROLLED_BACK'/);
assert.match(sql,new RegExp(version,'g'));
assert.match(sql,/for update of cvv/i);
assert.match(sql,/for share of v,p,s/i);
assert.match(sql,/v\.game_code='pokemon'[\s\S]*lower\(s\.set_code\)='csmpic'/i);
assert.match(sql,/with changed as \([\s\S]*update catalog\.catalogue_version_variants/i);
assert.match(sql,/Preserved full-row fingerprint changed/);
assert.match(sql,/chinese_membership_repair_before/);
assert.match(sql,/Artwork, provider, price, ownership or binder preservation receipt changed/);
assert.doesNotMatch(sql,/\b(?:update|delete|insert into)\s+(?:catalog\.card_variants|catalog\.card_printings|catalog\.sets|catalog\.assets|catalog\.catalogue_version_assets|market\.|public\.)/i);
for(const row of expected) for(const value of row) assert.ok(sql.includes(value),'missing reviewed value '+value);

function applyMembershipRepair(rows, physical) {
 const byVariant=new Map(expected.map(r=>[r[0],r]));
 const changed=[];
 const cloned=rows.map(row=>({...row}));
 for(const row of cloned) {
   const e=byVariant.get(row.variantId);
   if(!e) continue;
   assert.equal(row.catalogueVersionId,version,'wrong catalogue version');
   assert.equal(row.language,'zh-cn','wrong membership language');
   assert.equal(row.printingId,e[1],'old printing guard');
   assert.equal(row.setId,e[2],'old set guard');
   const p=physical.get(row.variantId);
   assert.deepEqual(p,{printingId:e[3],setId:e[4],collector:e[5],nativeName:e[6],language:'zh-cn',published:true},'physical identity guard');
   row.printingId=e[3]; row.setId=e[4]; changed.push(row.variantId);
 }
 assert.equal(changed.length,3,'exactly three memberships change');
 return {rows:cloned,changed};
}
const physical=new Map(expected.map(r=>[r[0],{printingId:r[3],setId:r[4],collector:r[5],nativeName:r[6],language:'zh-cn',published:true}]));
const source=expected.map(r=>({catalogueVersionId:version,variantId:r[0],language:'zh-cn',printingId:r[1],setId:r[2]}));
source.push({catalogueVersionId:version,variantId:'unrelated',language:'ja',printingId:'keep-printing',setId:'keep-set'});
const result=applyMembershipRepair(source,physical);
assert.equal(result.rows.at(-1).printingId,'keep-printing');
assert.equal(result.rows.at(-1).setId,'keep-set');
assert.deepEqual(result.changed.sort(),expected.map(r=>r[0]).sort());
const bad=source.map(r=>({...r}));
bad[0].printingId='drifted';
assert.throws(()=>applyMembershipRepair(bad,physical),/old printing guard/);
const wrongPhysical=new Map(physical);
wrongPhysical.set(expected[1][0],{...wrongPhysical.get(expected[1][0]),nativeName:'wrong'});
assert.throws(()=>applyMembershipRepair(source,wrongPhysical),/physical identity guard/);

async function runSqlRehearsal({drift=false}={}) {
 const db=new PGlite();
 try {
  await db.exec(`create schema catalog; create schema market; create schema audit;
   create table catalog.catalogue_versions(id uuid primary key,language_code text,version_key text,status text,deprecated_at timestamptz);
   create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,printing_id uuid,set_id uuid,language_code text,primary key(catalogue_version_id,variant_id));
   create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,game_code text,deprecated_at timestamptz);
   create table catalog.card_printings(id uuid primary key,set_id uuid,language_code text,collector_number text,native_name text,deprecated_at timestamptz);
   create table catalog.sets(id uuid primary key,game_code text,set_code text,language_code text,deprecated_at timestamptz);
   create table catalog.assets(variant_id uuid,printing_id uuid,set_id uuid); create table catalog.catalogue_version_assets(variant_id uuid,printing_id uuid,set_id uuid);
   create table market.catalogue_general_prices(variant_id uuid,printing_id uuid,set_id uuid); create table market.catalogue_provider_cards(variant_id uuid,printing_id uuid,set_id uuid); create table market.catalogue_price_outcomes(variant_id uuid);
   create table public.user_card_variants(card_id text,set_id text); create table public.binder_cards(card_id text,api_card_id text,set_id text);
   create table audit.catalogue_events(request_id text,actor_role text,event_type text,entity_schema text,entity_table text,event_payload jsonb);`);
  await db.query(`insert into catalog.catalogue_versions values($1,'zh-cn','zh-cn:api-launch-2026-08-09-v1','published',null)`,[version]);
  for(const [variant,oldPrinting,oldSet,newPrinting,newSet,collector,native] of expected){
    await db.query(`insert into catalog.sets values($1,'pokemon','CSMPiC','zh-cn',null) on conflict do nothing`,[newSet]);
    await db.query(`insert into catalog.card_printings values($1,$2,'zh-cn',$3,$4,null)`,[newPrinting,newSet,collector,native]);
    await db.query(`insert into catalog.card_variants values($1,$2,'zh-cn','pokemon',null)`,[variant,newPrinting]);
    await db.query(`insert into catalog.catalogue_version_variants values($1,$2,$3,$4,'zh-cn')`,[version,variant,drift&&variant===expected[0][0]?'00000000-0000-4000-8000-000000000001':oldPrinting,oldSet]);
  }
  const committed=sql.replace(/rollback;\s*select 'REHEARSAL_ROLLED_BACK' result;/i,'commit;');
  await db.exec(committed);
  const rows=(await db.query(`select variant_id,printing_id,set_id from catalog.catalogue_version_variants order by variant_id`)).rows;
  assert.equal(rows.length,3);
  for(const row of rows){const e=expected.find(x=>x[0]===row.variant_id);assert.equal(row.printing_id,e[3]);assert.equal(row.set_id,e[4]);}
  assert.equal((await db.query(`select count(*)::int count from audit.catalogue_events where request_id='chinese-membership-repair-20261011'`)).rows[0].count,2);
 } finally { await db.close(); }
}
await runSqlRehearsal();
await assert.rejects(runSqlRehearsal({drift:true}),/Membership rows no longer match the exact reviewed old IDs/);
console.log(JSON.stringify({cohort:3,cohortMd5:digest,rollbackDefault:true,actualSqlRehearsal:true,onlyMembershipFieldsChanged:true,driftRejected:true,physicalIdentityRejected:true}));
