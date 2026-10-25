import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
// Offline only: full shipped modules, fixture Supabase transport and unused native boundaries.
const root = process.cwd();
const baselinePath = process.argv.find(arg=>arg.startsWith('--baseline-home-saved='))?.slice('--baseline-home-saved='.length);
const baselineRevision = process.argv.find(arg => arg.startsWith('--baseline-facts-revision='))?.slice('--baseline-facts-revision='.length);
if (baselinePath && baselineRevision) throw new Error('Choose one baseline source option.');
const baselineModules = new Map();
if (baselineRevision) {
  if (!/^[a-f0-9]{7,40}$/i.test(baselineRevision)) throw new Error('The baseline revision must be a Git commit hash.');
  for (const name of ['homeSavedCollection', 'uiCollectionPages', 'ownership']) {
    baselineModules.set(name, execFileSync('git', ['show', baselineRevision + ':lib/' + name + '.ts'], {
      cwd: root, encoding: 'utf8', maxBuffer: 1_000_000,
    }));
  }
}
const baselineSource = baselineModules.get('homeSavedCollection') ?? (baselinePath ? readFileSync(baselinePath, 'utf8') : null);
function gitBlob(source) {
  const normalized = source.replaceAll('\r\n', '\n');
  return createHash('sha1').update('blob ' + Buffer.byteLength(normalized) + '\0').update(normalized).digest('hex');
}
const baselineModuleBlobs = Object.fromEntries([...baselineModules].map(([name, source]) => [name, gitBlob(source)]));
const normalizedBaseline=baselineSource?.replaceAll('\r\n','\n');
const baselineGitBlob=normalizedBaseline?createHash('sha1').update('blob '+Buffer.byteLength(normalizedBaseline)+'\0').update(normalizedBaseline).digest('hex'):null;
const ts = createRequire(resolve(root, 'package.json'))('typescript');
const tick = () => new Promise(done => setImmediate(done));
const deferred = () => { let release; const promise = new Promise(done => { release = done; }); return { promise, release }; };
const stamp = '2026-10-25T00:00:00.000Z', owner = '11111111-1111-4111-8111-111111111111';
function dataSet(binderCount=2, savedCount=8, ownedCount=6, multilingual=false) {
 const languages=multilingual?['en','ja','zh-cn','zh-tw','ko']:['en'];
 const binders=Array.from({length:binderCount},(_,i)=>({id:`binder-${i}`,user_id:owner,name:`Synthetic ${languages[i%languages.length]} binder`,color:'#111111',type:'custom',is_public:false,source_set_id:null,language:languages[i%languages.length],created_at:stamp,sort_order:i,edition:null,master_set_enabled:false,card_mode:'raw'}));
 const binder_cards=Array.from({length:savedCount},(_,i)=>{const language=languages[i%languages.length];return {id:`saved-${String(i).padStart(6,'0')}`,binder_id:binders[multilingual?i%binderCount:0].id,card_id:`${language}:synthetic-${multilingual?'001':i}`,set_id:`${language}:synthetic-set`,language,api_card_id:null,api_set_id:null,card_name:`${language} synthetic card ${i}`,card_number:multilingual?'001':String(i),image_url:`https://example.invalid/${language}/${i}.webp`,set_name:`${language} synthetic set`,set_total:2000,slot_order:i,owned:i<ownedCount,owned_quantity:1,condition:'Near Mint',grade_company:null,grade:null,notes:'',ebay_price:null,tcg_price:i%7?12.34:null,cardmarket_price:null,last_price_update:i%7?stamp:null,created_at:stamp};});
 const user_card_variants=Array.from({length:ownedCount},(_,i)=>{const language=languages[i%languages.length];return {id:`owned-${String(i).padStart(6,'0')}`,user_id:owner,card_id:`${language}:synthetic-${multilingual?'001':i}`,set_id:`${language}:synthetic-set`,variant:'normal',quantity:i%19?1:2,condition:'Near Mint',grade_company:'',grade:''};});
 return {binders,binder_cards,user_card_variants};
}
function harness(tables,options={}) {
 let account=owner,clock=Date.now();
 const controls={holdOwnership:false,holdSaved:null,afterPage:null,failTable:null,delayMs:0,sessionHold:null,holdSessionAt:-1,serverCap:500,...options};
 class ClockDate extends Date { static now(){return clock;} }
 const requests=[],listeners=new Set(),modules=new Map(),held=deferred(),authCalls={getSession:0,getUser:0};
 const session=()=>account?({user:{id:account}}):null;
 const supabase={auth:{getSession:async()=>{authCalls.getSession++;const value=session();if(authCalls.getSession===controls.holdSessionAt)await controls.sessionHold.promise;return {data:{session:value},error:null};},getUser:async()=>{authCalls.getUser++;return {data:{user:session()?.user??null},error:null};},onAuthStateChange:cb=>{listeners.add(cb);return {data:{subscription:{unsubscribe:()=>listeners.delete(cb)}}};}},from(table){
  assert.ok(Object.hasOwn(tables,table),`Unexpected data source ${table}`);
  let columns='*',from=0,to=49,signal;const filters=[],orders=[];
  const query={select(value){columns=value;return query;},eq(key,value){filters.push(row=>row[key]===value);return query;},in(key,values){assert.ok(values.length<=50);filters.push(row=>values.includes(row[key]));return query;},order(key,{ascending=true}={}){orders.push([key,ascending]);return query;},range(start,end){assert.equal(end-start+1,table==='binders'?50:controls.baseline?50:500);from=start;to=end;return query;},abortSignal(value){signal=value;return query;},then(done,fail){return Promise.resolve().then(async()=>{
   const request={table,from,to,rows:null,bytes:null};requests.push(request);
   if(controls.holdOwnership&&table==='user_card_variants')await held.promise;
   if(controls.holdSaved&&table==='binder_cards')await controls.holdSaved.promise;
   if(controls.delayMs)await new Promise(done=>setTimeout(done,controls.delayMs));
   if(signal?.aborted)throw new Error('Aborted transport');
   let rows=[...tables[table]];
   if(table==='binders')rows=rows.filter(row=>row.user_id===account||row.is_public);
   if(table==='user_card_variants')rows=rows.filter(row=>row.user_id===account);
   if(table==='binder_cards')rows=rows.filter(row=>tables.binders.some(b=>b.id===row.binder_id&&(b.user_id===account||b.is_public)));
   rows=rows.filter(row=>filters.every(filter=>filter(row)));
   rows.sort((a,b)=>{for(const[key,ascending]of orders){if(a[key]===b[key])continue;if(a[key]==null)return ascending?1:-1;if(b[key]==null)return ascending?-1:1;return(a[key]<b[key]?-1:1)*(ascending?1:-1);}return 0;});
   const data=rows.slice(from,Math.min(to+1,from+controls.serverCap)).map(row=>columns==='*'?{...row}:Object.fromEntries(columns.split(',').map(k=>k.trim()).map(k=>[k,row[k]??null])));
   request.rows=data.length;request.bytes=Buffer.byteLength(JSON.stringify(data));controls.afterPage?.(table,request);return {data,error:controls.failTable===table?new Error('fixture transport failure'):null};
  }).then(done,fail);}};return query;
 }};
 const real=new Set(['homeSavedCollection','binders','ownership','uiCollectionPages','requestCache','personalDataRead','homeSavedCollectionCache','collectionSummaryInvalidation']);
 const unused=new Proxy({},{get(_target,name){return()=>{throw new Error(`Unexpected optional/native call ${String(name)}`);};}});
 function load(name){if(modules.has(name))return modules.get(name);const module={exports:{}};modules.set(name,module.exports);
  const source=controls.baseline?(baselineModules.get(name)??(name==='homeSavedCollection'?baselineSource:null)??readFileSync(resolve(root,'lib',`${name}.ts`),'utf8')):readFileSync(resolve(root,'lib',`${name}.ts`),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(compiled,{module,exports:module.exports,require(path){const dependency=path.replace(/^\.\//,'');if(real.has(dependency))return load(dependency);if(dependency==='supabase')return{supabase};if(dependency==='config')return{PRICE_API_URL:'https://example.invalid',USD_TO_GBP:0.79};if(dependency==='stackrQuery')return{invalidateStackrCollectionQueries(){}};return unused;},console,setTimeout,clearTimeout,AbortController,Date:ClockDate});return module.exports;
 }
 const module=load('homeSavedCollection');return{
 read:(config={})=>module.fetchHomeSavedCollection(account,config),requests,authCalls,controls,releaseOwnership:()=>held.release(),listeners,
 advance(ms){clock+=ms;},invalidate(){load('collectionSummaryInvalidation').bumpCollectionSummaryVersion();},
 auth(next,event=next?'SIGNED_IN':'SIGNED_OUT'){account=next;for(const cb of [...listeners])cb(event,session());},
 cleanup(){if(real.has('homeSavedCollectionCache')&&modules.has('homeSavedCollectionCache'))load('homeSavedCollectionCache').invalidateHomeSavedFacts();},
};
}
function report(requests){const tableCounts={},tableRows={},tableBytes={};for(const r of requests){tableCounts[r.table]=(tableCounts[r.table]??0)+1;tableRows[r.table]=(tableRows[r.table]??0)+r.rows;tableBytes[r.table]=(tableBytes[r.table]??0)+r.bytes;}return{requests:requests.length,bodyBytes:requests.reduce((s,r)=>s+r.bytes,0),tableCounts,tableRows,tableBytes};}
const reports=[];
const datasets=[['small',dataSet()],['large-1702-saved-1323-owned',dataSet(2,1702,1323)],['empty',dataSet(0,0,0)],['five-languages-same-collector',dataSet(5,5,5,true)]];
for(const[cohort,tables]of datasets){
 const before=baselineSource?harness(tables,{baseline:true}):null;
 let baseline=null, baselineFacts=null;
 if (before) {
   baselineFacts = await before.read();
   const split = before.requests.length;
   const firstAuthCalls = { ...before.authCalls };
   await before.read();
   baseline = {
     first: report(before.requests.slice(0, split)),
     immediateRepeat: report(before.requests.slice(split)),
     firstAuthCalls,
     warmAuthCalls: Object.fromEntries(Object.entries(before.authCalls).map(([key, count]) => [key, count - firstAuthCalls[key]])),
   };
   before.cleanup();
 }
 const f=harness(tables),first=await f.read();
 const firstAuthCalls = { ...f.authCalls };
 if (baselineRevision) {
   const snapshot = value => JSON.stringify({
     binders: value.binders,
     ownedRows: value.ownedRows,
     cardsByBinder: [...value.cardsByBinder],
   });
   assert.equal(snapshot(first), snapshot(baselineFacts), 'Before and after preserve every field, placement, identity and quantity');
 }
 assert.equal(first.binders.length,tables.binders.length);assert.equal(first.ownedRows.length,tables.user_card_variants.length);
 assert.equal([...first.cardsByBinder.values()].flat().length,tables.binder_cards.length);
 assert.ok([...first.cardsByBinder.values()].flat().every(row=>row.tcg_price===null&&row.ebay_price===null&&row.cardmarket_price===null&&row.last_price_update===null));
 const split=f.requests.length,repeat=await f.read();
 const warmAuthCalls = Object.fromEntries(Object.entries(f.authCalls).map(([key, count]) => [key, count - firstAuthCalls[key]]));
 assert.equal(repeat.ownedRows.length,first.ownedRows.length);
 assert.equal([...repeat.cardsByBinder.values()].flat().length,tables.binder_cards.length);
 assert.equal(f.requests.length,split,'fresh complete facts add zero data reads');
 first.ownedRows.length=0;first.cardsByBinder.clear();first.binders.length=0;
 assert.equal((await f.read()).ownedRows.length,tables.user_card_variants.length,'caller mutation cannot poison reusable facts');
 if(cohort==='five-languages-same-collector')assert.equal(new Set([...repeat.cardsByBinder.values()].flat().map(row=>JSON.stringify([row.language,row.set_id,row.card_id]))).size,5);
 const warm=report(f.requests.slice(split));
 f.advance(31_000);const expiredStart=f.requests.length;await f.read();assert.ok(f.requests.length>expiredStart,'expired facts refresh, without truncation');
 const forcedStart=f.requests.length;await f.read({forceRefresh:true});assert.ok(f.requests.length>forcedStart,'explicit refresh bypasses both facts and binder cache');
 reports.push({cohort,binders:tables.binders.length,saved:tables.binder_cards.length,ownedRows:tables.user_card_variants.length,unownedSaved:tables.binder_cards.filter(row=>!row.owned).length,
 ...(baseline?{baseline}:{}),after:{first:report(f.requests.slice(0,split)),immediateRepeat:warm,expired:report(f.requests.slice(expiredStart,forcedStart)),forced:report(f.requests.slice(forcedStart))},authCalls:f.authCalls,firstAuthCalls,warmAuthCalls});
 f.cleanup();assert.equal(f.listeners.size,0);
}
// A requested range is a budget, never proof that the server returned all rows.
const serverCapReports = [];
for (const cap of [500, 100, 50, 17]) {
  const tables = dataSet(2, 1702, 1323);
  const f = harness(tables, { serverCap: cap });
  const value = await f.read();
  assert.equal(value.ownedRows.length, 1323);
  assert.equal([...value.cardsByBinder.values()].flat().length, 1702);
  const expected = 2 + Math.ceil(1702 / cap) + 1 + Math.ceil(1323 / cap) + 1;
  assert.equal(f.requests.length, expected, 'A lower cap changes request count, never completeness');
  assert.equal([...value.cardsByBinder.values()].flat().filter(row => !row.owned).length, 379);
  serverCapReports.push({ serverCap: cap, ...report(f.requests) });
  f.cleanup();
}

const stalled=harness(dataSet(),{holdOwnership:true});let settled=false;const pending=stalled.read().then(value=>{settled=true;return value;});
for(let n=0;n<12;n++)await tick();
const savedDispatchesWhileOwnershipHeld=stalled.requests.filter(row=>row.table==='binder_cards').length;
assert.ok(savedDispatchesWhileOwnershipHeld>0,'saved paging starts before ownership completes');
assert.equal(settled,false,'required ownership still gates completion');
stalled.releaseOwnership();await pending;stalled.cleanup();assert.equal(stalled.listeners.size,0);

const idle=harness(dataSet());await idle.read();const idleStart=idle.requests.length;idle.auth(null);idle.auth(owner);
await idle.read();assert.ok(idle.requests.length>idleStart,'idle logout/login as same owner invalidates old facts');idle.cleanup();

const solo=harness(dataSet(2,1702,1323),{holdSaved:deferred()});const abort=new AbortController();
const cancelled=solo.read({signal:abort.signal});while(!solo.requests.some(row=>row.table==='binder_cards'))await tick();
abort.abort();await assert.rejects(cancelled,/cancelled/);const abortCount=solo.requests.filter(row=>row.table==='binder_cards').length;
solo.controls.holdSaved.release();for(let n=0;n<12;n++)await tick();
assert.equal(solo.requests.filter(row=>row.table==='binder_cards').length,abortCount,'sole cancelled reader cannot scan later pages');
solo.controls.holdSaved=null;const retried=await solo.read();assert.equal([...retried.cardsByBinder.values()].flat().length,1702);solo.cleanup();

const shared=harness(dataSet(),{holdSaved:deferred()});const firstAbort=new AbortController();
const firstRead=shared.read({signal:firstAbort.signal});const secondRead=shared.read();while(!shared.requests.some(row=>row.table==='binder_cards'))await tick();
firstAbort.abort();await assert.rejects(firstRead,/cancelled/);shared.controls.holdSaved.release();
assert.equal((await secondRead).ownedRows.length,6,'one cancelled caller does not cancel another current consumer');shared.cleanup();

const edits=harness(dataSet());await edits.read();const editStart=edits.requests.length;edits.invalidate();await edits.read();
assert.ok(edits.requests.length>editStart,'an actual collection mutation invalidates facts');
edits.controls.sessionHold=deferred();edits.controls.holdSessionAt=edits.authCalls.getSession+2;
const late=edits.read();await tick();edits.invalidate();edits.controls.sessionHold.release();await assert.rejects(late,/cancelled|changed/);edits.cleanup();

const callbackEdit=harness(dataSet());await callbackEdit.read();await assert.rejects(callbackEdit.read({onBindersReady:()=>callbackEdit.invalidate()}),/cancelled/);callbackEdit.cleanup();

const failed=harness(dataSet(),{failTable:'binder_cards'});await assert.rejects(failed.read(),/fixture transport failure/);
failed.controls.failTable=null;assert.equal((await failed.read()).cardsByBinder.size,2,'failed pages never become a complete cached collection');failed.cleanup();

const remoteTables=dataSet(),remote=harness(remoteTables);await remote.read();
const added=dataSet(3,0,0).binders[2];remoteTables.binders.push(added);
assert.equal((await remote.read()).binders.length,2,'normal reuse has the stated bounded freshness');
assert.equal((await remote.read({forceRefresh:true})).binders.length,3,'manual refresh reads newly added binder IDs within TTL');
remoteTables.binders.splice(remoteTables.binders.findIndex(b=>b.id===added.id),1);
assert.equal((await remote.read({forceRefresh:true})).binders.length,2,'manual refresh also removes deleted binder IDs');
remote.cleanup();

const assetTables=dataSet();assetTables.binder_cards[0].image_url='https://legacy.example.invalid/storage/v1/object/public/catalogue/synthetic.webp';
assetTables.binder_cards[1].image_url='https://r2.example.invalid/catalogue/synthetic.webp';
assetTables.binder_cards[2].image_url='https://example.invalid/private/'+owner+'/synthetic.webp';
const assets=harness(assetTables);await assets.read();const materialized=await assets.read();
for(let n=0;n<3;n++)assert.equal(materialized.cardsByBinder.get('binder-0')[n].image_url,assetTables.binder_cards[n].image_url,'delivery URLs remain exact');
assets.auth('22222222-2222-4222-8222-222222222222');
const foreign=await assets.read();assert.equal(foreign.cardsByBinder.size,0);assert.equal(JSON.stringify(foreign).includes('/private/'),false);assets.cleanup();

const hugeTables=dataSet();for(const row of hugeTables.binder_cards)row.notes='x'.repeat(300_000);
const huge=harness(hugeTables);await huge.read();const hugeStart=huge.requests.length;
assert.equal([...(await huge.read()).cardsByBinder.values()].flat().length,8,'oversized facts remain complete');
assert.ok(huge.requests.length>hugeStart,'oversized complete facts bypass retained caching');huge.cleanup();

// Each pair uses one cohort definition; assertions prevent population drift.
const timingCohorts = [
  { cohort: 'empty', binders: 0, saved: 0, owned: 0, baselineRequests: 2, candidateRequests: 2 },
  { cohort: 'small', binders: 2, saved: 8, owned: 6, baselineRequests: 6, candidateRequests: 6 },
  { cohort: 'large-1702-saved-1323-owned', binders: 2, saved: 1702, owned: 1323, baselineRequests: 66, candidateRequests: 11 },
  { cohort: 'five-languages-same-collector', binders: 5, saved: 5, owned: 5, multilingual: true, baselineRequests: 6, candidateRequests: 6 },
];
const perDataApiReadDelayMs = 50;
const timingServerCap = 500;
async function timedSample(cohort, baseline = false) {
  const tables = dataSet(cohort.binders, cohort.saved, cohort.owned, cohort.multilingual);
  const f = harness(tables, { delayMs: perDataApiReadDelayMs, serverCap: timingServerCap, baseline });
  let start = performance.now();
  const first = await f.read();
  const firstMs = performance.now() - start;
  const firstRead = report(f.requests);
  assert.equal(first.binders.length, cohort.binders);
  assert.equal(first.ownedRows.length, cohort.owned);
  assert.equal([...first.cardsByBinder.values()].flat().length, cohort.saved);
  assert.equal(firstRead.tableRows.binders ?? 0, cohort.binders);
  assert.equal(firstRead.tableRows.user_card_variants ?? 0, cohort.owned);
  assert.equal(firstRead.tableRows.binder_cards ?? 0, cohort.saved);
  assert.equal(firstRead.requests, baseline ? cohort.baselineRequests : cohort.candidateRequests,
    'Timed paths must read the same complete collection');
  const split = f.requests.length;
  start = performance.now();
  const warm = await f.read();
  const warmMs = performance.now() - start;
  assert.equal(warm.ownedRows.length, cohort.owned);
  assert.equal([...warm.cardsByBinder.values()].flat().length, cohort.saved);
  const warmRead = report(f.requests.slice(split));
  // The older single-file comparison may predate complete-facts caching.
  if (!baseline || baselineRevision) assert.equal(warmRead.requests, 0);
  f.cleanup();
  return { firstMs, warmMs, firstRead, warmRead };
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const cohortTimings = [];
for (const cohort of timingCohorts) {
  const candidateSamples = [], baselineSamples = [];
  for (let sample = 0; sample < 5; sample++) {
    if (baselineSource) baselineSamples.push(await timedSample(cohort, true));
    candidateSamples.push(await timedSample(cohort));
  }
  cohortTimings.push({
    cohort: cohort.cohort,
    samples: 5,
    timingCohort: { binders: cohort.binders, saved: cohort.saved, owned: cohort.owned,
      multilingual: Boolean(cohort.multilingual), serverCap: timingServerCap, delayMs: perDataApiReadDelayMs },
    perDataApiReadDelayMs,
    firstCompleteFactsMedianMs: median(candidateSamples.map(row => row.firstMs)),
    warmCompleteFactsMedianMs: median(candidateSamples.map(row => row.warmMs)),
    baselineFirstMedianMs: baselineSamples.length ? median(baselineSamples.map(row => row.firstMs)) : null,
    baselineWarmMedianMs: baselineSamples.length ? median(baselineSamples.map(row => row.warmMs)) : null,
    baselineSamples,
    candidateSamples,
  });
}
const largeTiming = cohortTimings.find(row => row.cohort === 'large-1702-saved-1323-owned');
console.log(JSON.stringify({
  sourceRoot: root,
  baselineSourcePath: baselinePath ?? null,
  baselineRevision: baselineRevision ?? null,
  baselineGitBlob,
  baselineModuleBlobs,
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  transport: 'offline actual modules; response-array JSON bytes; excludes headers, TLS, hosted DB and device rendering',
  reports,
  serverCapReports,
  dependency: { savedDispatchesWhileOwnershipHeld },
  cohortTimings,
  syntheticHostTiming: {
    ...largeTiming,
    cohort: '1702 saved /1323 owned; server cap500',
    includesJavaScriptWork: true,
    hostedLatency: 'unmeasured',
    budgetBypass: 'complete oversized snapshot is returned but not retained',
    originCap: 'hosted PostgREST cap is unmeasured; local config declares1000; fixture cap50 retains66 cold reads',
  },
}, null, 2));
console.log('Home saved facts: complete bounded cache, independent source paging, owner/edit/manual/TTL/cancellation/failure isolation passed.');
