import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCohort,canonicalKey,rehearse,assertConfig,PROJECTS} from './publish.mjs';
const bytes=readFileSync(new URL('./cohort.json',import.meta.url));
const c=validateCohort(bytes);
test('frozen sources contain exactly four complete sets and 480 distinct printings',()=>{
  assert.deepEqual(c.sets.map(s=>s.total),[161,113,176,30]);
  assert.throws(()=>validateCohort(Buffer.concat([bytes,Buffer.from(' ')])));
});
test('Classic repeated numbers retain five separate cards, without synthetic collector numbers',()=>{
  const rows=c.cards.filter(r=>r.provider_set_code==='30th-c'&&['106','11'].includes(r.collector_number));
  assert.equal(rows.length,5);
  assert.equal(new Set(rows.map(r=>canonicalKey(c.sets[3].ids.production,r,r.bindings.production))).size,5);
  assert.equal(rows.filter(r=>r.collector_number==='106').length,3);
  assert.ok(rows.every(r=>!/[a-z]/i.test(r.collector_number)));
});
test('paired stadiums, LEGEND halves, energies and RGB cards remain separate',()=>{
  for(const [set,numbers] of [['M6',['071','072','073','074','075','076']],['M6a',['151','152','GRA','FIR','WAT','LIG','PSY','FIG','DAR','MET','R','G','B']]])
    assert.equal(c.cards.filter(r=>r.provider_set_code===set&&numbers.includes(r.collector_number)).length,numbers.length);
  assert.equal(c.cards.find(r=>r.provider_id==='M6a-156').native_name,'MサーナイトEX');
});
test('ordinary keys keep their existing format; Classic suffix binds the actual printing UUID',()=>{
  for(const r of c.cards){const b=r.bindings.production,s=c.sets.find(s=>s.provider_set_code===r.provider_set_code);const k=canonicalKey(s.ids.production,r,b);assert.equal(k.includes(':printing:'),r.printing_scoped_key);if(r.printing_scoped_key)assert.ok(k.endsWith(b.printing_id));}
});
test('rehearsals always roll back after a schema or identity failure',async()=>{
  const sql=[];const db={query:async q=>{sql.push(q);if(q.startsWith('select * from supabase_migrations'))throw Error('fixture failure');return{rows:[]};}};
  await assert.rejects(rehearse(db,c,'staging','bad migration'),/Migration changed/);assert.equal(sql.at(-1),'rollback');assert.ok(!sql.includes('commit'));
});
test('protected run refuses wrong revision, project and unrelated confirmation',()=>{
  const e={GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_NEWSETS480_CONFIRMATION:'IMPORT NEWSETS480',SUPABASE_DB_URL:`postgres://postgres@db.${PROJECTS.production}.supabase.co/postgres`,SUPABASE_STAGING_DB_URL:`postgres://postgres@db.${PROJECTS.staging}.supabase.co/postgres`};
  assertConfig(e,true);for(const x of [{GITHUB_REF:'refs/heads/other'},{STACKR_EXPECTED_MAIN_SHA:'b'.repeat(40)},{STACKR_NEWSETS480_CONFIRMATION:'YES'},{SUPABASE_DB_URL:e.SUPABASE_STAGING_DB_URL}])assert.throws(()=>assertConfig({...e,...x},true));
});
