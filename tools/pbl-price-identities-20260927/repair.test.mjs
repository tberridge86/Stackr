import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {SOURCE,STAGING_SOURCE,OLD_SET,SET,VERSION,validatePairs,validateAliases,readAliases,repairAliases} from './repair.mjs';
const cohort=JSON.parse(await readFile(new URL('../queue1-pbl-relink-20260927/cohort.json',import.meta.url),'utf8'));
const cards=cohort.flatMap(r=>[
 {variant_id:randomUUID(),printing_id:r.duplicate_printing_id,set_id:OLD_SET,set_code:'PBL',language_code:'en',catalogue_version_id:VERSION,collector_number:r.collector_number,card_english_display_name:r.name,variant_code:'normal',finish_code:null},
 {variant_id:r.canonical_variant_ids[0],printing_id:r.canonical_printing_id,set_id:SET,set_code:'me05',language_code:'en',catalogue_version_id:VERSION,collector_number:r.collector_number,card_english_display_name:r.name,variant_code:'holo',finish_code:'holo'},
]);
const provider={id:'me05',cards:cohort.map(r=>({id:`me05-${String(r.collector_number).padStart(3,'0')}`,localId:String(r.collector_number).padStart(3,'0'),name:r.name}))};
const pairs=validatePairs(cohort,cards,provider);
for(const override of [{language_code:'ja'},{collector_number:'999'},{card_english_display_name:'Wrong'},{set_id:SET},{finish_code:'holo'}])assert.throws(()=>validatePairs(cohort,[{...cards[0],...override},...cards.slice(1)],provider));
assert.throws(()=>validatePairs(cohort,cards,{...provider,cards:provider.cards.slice(1)}));
const db=new PGlite();
await db.exec(`create schema ingest;create schema catalog;
create table ingest.external_identifiers(id uuid primary key,source_id uuid,source_entity_type text,external_id text,language_code text,set_id uuid,printing_id uuid,variant_id uuid,is_current boolean,deprecated_at timestamptz,updated_at timestamptz);
create table catalog.catalogue_version_external_identifiers(catalogue_version_id uuid,source_id uuid,source_entity_type text,external_id text,language_code text,set_id uuid,printing_id uuid,variant_id uuid);
create table public.holdings(id uuid,card_id text,quantity int);`);
const aliases=[{external_id:'me5',source_entity_type:'set',set_id:OLD_SET,printing_id:null,variant_id:null},...pairs.map(r=>({external_id:r.external_id,source_entity_type:'card',set_id:null,printing_id:null,variant_id:r.old_variant_id}))];
for(const a of aliases){
 await db.query('insert into ingest.external_identifiers values($1,$2,$3,$4,$5,$6,$7,$8,true,null,now())',[randomUUID(),SOURCE,a.source_entity_type,a.external_id,'en',a.set_id,a.printing_id,a.variant_id]);
 await db.query('insert into catalog.catalogue_version_external_identifiers values($1,$2,$3,$4,$5,$6,$7,$8)',[VERSION,SOURCE,a.source_entity_type,a.external_id,'en',a.set_id,a.printing_id,a.variant_id]);
}
await db.query("insert into public.holdings values($1,'me5-32',2)",[randomUUID()]);
const saved=(await db.query('select * from public.holdings')).rows;
const before=await readAliases(db);validateAliases(before.live,pairs);
await db.query('insert into ingest.external_identifiers select gen_random_uuid(),$1,source_entity_type,external_id,language_code,set_id,printing_id,variant_id,is_current,deprecated_at,updated_at from ingest.external_identifiers where source_id=$2',[STAGING_SOURCE,SOURCE]);
await db.query('insert into catalog.catalogue_version_external_identifiers select catalogue_version_id,$1,source_entity_type,external_id,language_code,set_id,printing_id,variant_id from catalog.catalogue_version_external_identifiers where source_id=$2',[STAGING_SOURCE,SOURCE]);
const stagingBefore=await readAliases(db,STAGING_SOURCE);
await db.exec('begin');await repairAliases(db,pairs,STAGING_SOURCE);assert.deepEqual(await readAliases(db),before,'staging source cannot modify production source');await db.exec('rollback');assert.deepEqual(await readAliases(db,STAGING_SOURCE),stagingBefore);
await assert.rejects(repairAliases(db,pairs,randomUUID()),'unknown environment source rejected');
await db.exec('begin');await repairAliases(db,pairs);await db.exec('rollback');assert.deepEqual(await readAliases(db),before,'rehearsal restores all alias fields');
await db.exec('begin');const changed=await repairAliases(db,pairs);await db.exec('commit');validateAliases(changed.after.live,pairs,true);validateAliases(changed.after.published,pairs,true);
assert(changed.after.live.filter(r=>r.source_entity_type==='card').every(r=>r.variant_id===null&&r.printing_id),'corrected aliases only prove printing');
assert.deepEqual((await db.query('select * from public.holdings')).rows,saved,'saved references and quantities unchanged');
await assert.rejects(repairAliases(db,pairs),'unexpected/previously repaired state fails before writing');
await db.close();console.log('Pitch Black alias rehearsal, rollback, printing-only publication, conflict gates and holdings preservation passed.');
