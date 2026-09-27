import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {assertConfig,validateSecurity,rehearse,MIGRATION,MIGRATION_SHA,BASELINE_SHA} from './publish.mjs';
import {digest} from '../queue1-publish-20260927/publish.mjs';
test('single SQL change and previous function are frozen',()=>{
 assert.equal(digest(readFileSync(new URL(`../../supabase/migrations/${MIGRATION}.sql`,import.meta.url))),MIGRATION_SHA);
 assert.equal(digest(readFileSync(new URL('./baseline.json',import.meta.url))),BASELINE_SHA);
});
test('service-only invoker execution is mandatory',()=>{
 const good={prosecdef:false,anon:false,authenticated:false,service_role:true};validateSecurity(good);
 for(const bad of [{prosecdef:true},{anon:true},{authenticated:true},{service_role:false}])assert.throws(()=>validateSecurity({...good,...bad}));
});
test('wrong code, confirmation, project and unprotected execution are rejected',()=>{
 const e={GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_PRINTING_FRONT_CONFIRMATION:'REPAIR PRINTING FRONT API',SUPABASE_DB_URL:'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres',SUPABASE_STAGING_DB_URL:'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres'};
 assertConfig(e,true);for(const d of [{STACKR_PRINTING_FRONT_CONFIRMATION:'YES'},{GITHUB_REF:'refs/heads/other'},{STACKR_EXPECTED_MAIN_SHA:'b'.repeat(40)},{SUPABASE_DB_URL:e.SUPABASE_STAGING_DB_URL}])assert.throws(()=>assertConfig({...e,...d},true));assert.throws(()=>assertConfig(e,false));
});
test('failed production rehearsal always rolls back without metadata writes',async()=>{
 const seen=[];const db={query:async sql=>{seen.push(sql);return{rows:[]};}};
 await assert.rejects(rehearse(db,'production',null,'invalid',{}, {}, [],''),/Frozen migration/);
 assert.equal(seen.at(-1),'rollback');assert.ok(!seen.some(q=>/insert|update|alter|create|commit/.test(q)));
});
test('existing protected lane retains production reviewer and shared lock',()=>{
 const w=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
 const job=w.split('\n  printing_front_api:')[1].split('\n  deploy:')[0];
 assert.match(w,/group: stackr-production-deployment/);assert.match(w,/inputs\.release_scope != 'printing_front_api'/);
 for(const re of [/environment: production/,/test "\$EXPECTED_SHA" = "\$GITHUB_SHA"/,/false false false false/,/test -z "\$OTHER_IDENTIFIERS"/,/secret-scan/])assert.match(job,re);
});
