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
const baselinePageSize = baselineSource && !/HOME_SAVED_FACTS_PAGE_SIZE\s*=\s*500/.test(baselineSource) ? 50 : 500;
const omittedHomeFields = ['cert_number', 'slab_image_url', 'graded_value', 'graded_at', 'owned_card_variant_id', 'lifecycle_version'];
const plain = value => JSON.parse(JSON.stringify(value));
function comparableFacts(value) {
  return plain({ binders: value.binders, ownedRows: value.ownedRows,
    cardsByBinder: [...value.cardsByBinder].map(([id, rows]) => [id, rows.map(row =>
      Object.fromEntries(Object.entries(row).filter(([key]) => !omittedHomeFields.includes(key))))]) });
}
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
function dataSet(binderCount=2, savedCount=8, ownedCount=6, multilingual=false, productionColumns=true) {
 const languages=multilingual?['en','ja','zh-cn','zh-tw','ko']:['en'];
 const binders=Array.from({length:binderCount},(_,i)=>({id:`binder-${i}`,user_id:owner,name:`Synthetic ${languages[i%languages.length]} binder`,color:'#111111',type:'custom',is_public:false,source_set_id:null,language:languages[i%languages.length],created_at:stamp,sort_order:i,edition:null,master_set_enabled:false,card_mode:'raw'}));
 const binder_cards=Array.from({length:savedCount},(_,i)=>{const language=languages[i%languages.length];return {id:`saved-${String(i).padStart(6,'0')}`,binder_id:binders[multilingual?i%binderCount:0].id,card_id:`${language}:synthetic-${multilingual?'001':i}`,set_id:`${language}:synthetic-set`,language,api_card_id:null,api_set_id:null,card_name:`${language} synthetic card ${i}`,card_number:multilingual?'001':String(i),image_url:`https://example.invalid/${language}/${i}.webp`,set_name:`${language} synthetic set`,set_total:2000,slot_order:i,owned:i<ownedCount,owned_quantity:1,condition:'Near Mint',grade_company:null,grade:null,notes:'',ebay_price:null,tcg_price:i%7?12.34:null,cardmarket_price:null,last_price_update:i%7?stamp:null,created_at:stamp};});
 const user_card_variants=Array.from({length:ownedCount},(_,i)=>{const language=languages[i%languages.length];return {id:`owned-${String(i).padStart(6,'0')}`,user_id:owner,card_id:`${language}:synthetic-${multilingual?'001':i}`,set_id:`${language}:synthetic-set`,variant:'normal',quantity:i%19?1:2,condition:'Near Mint',grade_company:'',grade:''};});
 // Match the production table's 30-column shape, with meaningful non-null
 // metadata that the Home and read-only reopen contracts intentionally omit.
 for (let index = 0; productionColumns && index < binder_cards.length; index++) {
   Object.assign(binder_cards[index], {
     cert_number: 'SYNTHETIC-CERT-' + index,
     slab_image_url: 'https://example.invalid/private/' + owner + '/slabs/' + index + '.webp',
     graded_value: 47.25, graded_at: stamp,
     owned_card_variant_id: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
     lifecycle_version: index + 1,
   });
 }
 return {binders,binder_cards,user_card_variants};
}
function harness(tables,options={}) {
 let account=owner,clock=Date.now();
 const controls={holdOwnership:false,holdSaved:null,afterPage:null,failTable:null,delayMs:0,sessionHold:null,holdSessionAt:-1,serverCap:500,missingColumns:[],schemaCode:'42703',schemaErrorAfterFirst:false,sessionErrorAt:-1,...options};
 class ClockDate extends Date { static now(){return clock;} }
 const cacheKeys=[],requests=[],listeners=new Set(),modules=new Map(),held=deferred(),authCalls={getSession:0,getUser:0};
 const session=()=>account?({user:{id:account}}):null;
 const supabase={auth:{getSession:async()=>{authCalls.getSession++;if(authCalls.getSession===controls.sessionErrorAt)return {data:{session:null},error:new Error('fixture session failure')};const value=session();if(authCalls.getSession===controls.holdSessionAt)await controls.sessionHold.promise;return {data:{session:value},error:null};},getUser:async()=>{authCalls.getUser++;return {data:{user:session()?.user??null},error:null};},onAuthStateChange:cb=>{listeners.add(cb);return {data:{subscription:{unsubscribe:()=>listeners.delete(cb)}}};}},from(table){
  assert.ok(Object.hasOwn(tables,table),`Unexpected data source ${table}`);
  let columns='*',from=0,to=49,signal;const filters=[],orders=[];
  const query={select(value){columns=value;return query;},returns(){return query;},eq(key,value){filters.push(row=>row[key]===value);return query;},in(key,values){assert.ok(values.length<=50);filters.push(row=>values.includes(row[key]));return query;},order(key,{ascending=true}={}){orders.push([key,ascending]);return query;},range(start,end){assert.equal(end-start+1,table==='binders'?50:controls.baseline?baselinePageSize:500);from=start;to=end;return query;},abortSignal(value){signal=value;return query;},then(done,fail){return Promise.resolve().then(async()=>{
   const request={table,from,to,columns,rows:null,bytes:null};requests.push(request);
   if(controls.holdOwnership&&table==='user_card_variants')await held.promise;
   if(controls.holdSaved&&table==='binder_cards')await controls.holdSaved.promise;
   if(controls.delayMs)await new Promise(done=>setTimeout(done,controls.delayMs));
   if(signal?.aborted)throw new Error('Aborted transport');
   const missing = table === 'binder_cards' && columns !== '*'
     ? controls.missingColumns.find(column => columns.split(',').includes(column)) : null;
   if (missing && (!controls.schemaErrorAfterFirst || from > 0)) {
     const error = { code: controls.schemaCode, message: controls.schemaCode === 'PGRST204'
       ? "Could not find the '" + missing + "' column of 'binder_cards' in the schema cache"
       : 'column binder_cards.' + missing + ' does not exist' };
     request.rows = 0; request.bytes = Buffer.byteLength(JSON.stringify(error));
     controls.afterPage?.(table, request);
     return { data: null, error };
   }
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
 const real=new Set(['homeSavedCollection','binders','ownership','uiCollectionPages','requestCache','personalDataRead','homeSavedCollectionCache','collectionSummaryInvalidation','binderReopenSnapshot','tcgdexControlledCardReference']);
 const unused=new Proxy({},{get(_target,name){return()=>{throw new Error(`Unexpected optional/native call ${String(name)}`);};}});
 function load(name){if(modules.has(name))return modules.get(name);const module={exports:{}};modules.set(name,module.exports);
  const source=controls.baseline?(baselineModules.get(name)??(name==='homeSavedCollection'?baselineSource:null)??readFileSync(resolve(root,'lib',`${name}.ts`),'utf8')):readFileSync(resolve(root,'lib',`${name}.ts`),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(compiled,{module,exports:module.exports,require(path){const dependency=path.replace(/^\.\//,'');if(real.has(dependency))return load(dependency);if(dependency==='supabase')return{supabase};if(dependency==='config')return{PRICE_API_URL:'https://example.invalid',USD_TO_GBP:0.79};if(dependency==='stackrQuery')return{invalidateStackrCollectionQueries(){}};return unused;},console,setTimeout,clearTimeout,AbortController,URL,Date:ClockDate});
  if (name === 'requestCache') {
    const actualRead = module.exports.getCachedOrFetch;
    module.exports.getCachedOrFetch = (key, ...args) => { cacheKeys.push(key); return actualRead(key, ...args); };
  }
  return module.exports;
 }
 const module=load('homeSavedCollection');return{
 snapshot(binder, cards) {
   return load('binderReopenSnapshot').snapshotBinderView({ namespace: 'fixture-private', accountId: owner },
     binder, cards, 1, { customSource: { kind: 'home-saved-cards-v1', cardCount: cards.length } });
 },
 async reopen(binder, cards) {
   const api = load('binderReopenSnapshot');
   const scope = { namespace: 'fixture-private', accountId: owner };
   const cache = api.createBinderReopenCache({ store: async () => null, now: () => 1 });
   assert.equal(cache.save(scope, binder, cards, cache.lease(), 1,
     { customSource: { kind: 'home-saved-cards-v1', cardCount: cards.length } }), true);
   await cache.flush();
   return cache.read(scope, binder.id);
 },
 read:(config={})=>module.fetchHomeSavedCollection(account,config),requests,authCalls,controls,cacheKeys,releaseOwnership:()=>held.release(),listeners,
 advance(ms){clock+=ms;},invalidate(){load('collectionSummaryInvalidation').bumpCollectionSummaryVersion();},
 auth(next,event=next?'SIGNED_IN':'SIGNED_OUT'){account=next;for(const cb of [...listeners])cb(event,session());},
 cleanup(){if(real.has('homeSavedCollectionCache')&&modules.has('homeSavedCollectionCache'))load('homeSavedCollectionCache').invalidateHomeSavedFacts();},
};
}
function report(requests){const tableCounts={},tableRows={},tableBytes={};for(const r of requests){tableCounts[r.table]=(tableCounts[r.table]??0)+1;tableRows[r.table]=(tableRows[r.table]??0)+r.rows;tableBytes[r.table]=(tableBytes[r.table]??0)+r.bytes;}return{requests:requests.length,bodyBytes:requests.reduce((s,r)=>s+r.bytes,0),tableCounts,tableRows,tableBytes};}
const reports=[];
const datasets=[['original-large-24-columns',dataSet(2,1702,1323,false,false)],['small',dataSet()],['large-1702-saved-1323-owned',dataSet(2,1702,1323)],['empty',dataSet(0,0,0)],['five-languages-same-collector',dataSet(5,5,5,true)]];
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
   assert.deepEqual(comparableFacts(first), comparableFacts(baselineFacts),
     'Before and after preserve every consumed field, placement, identity and quantity');
   for (const binder of first.binders) {
     assert.deepEqual(plain(f.snapshot(binder, first.cardsByBinder.get(binder.id))),
       plain(f.snapshot(baselineFacts.binders.find(item => item.id === binder.id), baselineFacts.cardsByBinder.get(binder.id))),
       'Actual custom binder-reopen snapshots retain their complete pre-existing contract');
   }
 }
 assert.equal(first.binders.length,tables.binders.length);assert.equal(first.ownedRows.length,tables.user_card_variants.length);
 assert.equal([...first.cardsByBinder.values()].flat().length,tables.binder_cards.length);
 assert.ok([...first.cardsByBinder.values()].flat().every(row => omittedHomeFields.every(key => !Object.hasOwn(row, key))));
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

// Non-null consumed fields and real custom-cache acceptance are checked apart
// from the wire-size fixture, whose optional fields intentionally remain sparse.
const contractTables = dataSet();
const binderIds = new Map();
for (const [index, binder] of contractTables.binders.entries()) {
  const id = '00000000-0000-4000-8000-' + String(9000 + index).padStart(12, '0');
  binderIds.set(binder.id, id); binder.id = id; binder.edition = 'first_edition';
}
for (const [index, row] of contractTables.binder_cards.entries()) {
  Object.assign(row, {
    binder_id: binderIds.get(row.binder_id),
    api_card_id: '00000000-0000-4000-8000-' + String(100 + index).padStart(12, '0'),
    api_set_id: '00000000-0000-4000-8000-000000000200',
    condition: 'Light Play', grade_company: 'PSA', grade: '9',
    notes: 'Retained private note ' + index, slot_order: 100 - index,
    created_at: '2026-10-20T12:00:00.000Z',
  });
}
const contract = harness(contractTables), contractFacts = await contract.read();
const originalContract = baselineSource ? harness(contractTables, { baseline: true }) : null;
const originalFacts = originalContract ? await originalContract.read() : null;
for (const binder of contractFacts.binders) {
  const afterRows = contractFacts.cardsByBinder.get(binder.id);
  const beforeRows = originalFacts?.cardsByBinder.get(binder.id)
    ?? contractTables.binder_cards.filter(row => row.binder_id === binder.id);
  const afterSnapshot = await contract.reopen(binder, afterRows);
  const beforeSnapshot = await contract.reopen(binder, beforeRows);
  assert.deepEqual(plain(afterSnapshot), plain(beforeSnapshot),
    'Complete custom binder cache accepts identical notes/order/grade/identity snapshots');
  for (const row of afterRows) {
    const expected = contractTables.binder_cards.find(item => item.id === row.id);
    for (const field of ['api_card_id', 'api_set_id', 'condition', 'grade_company', 'grade', 'notes', 'slot_order', 'created_at']) {
      assert.equal(row[field], expected[field]);
    }
  }
}
originalContract?.cleanup(); contract.cleanup();

// Compatibility never retries arbitrary failures or restarts a partial scan.
const compatibilityReports = [];
for (const schemaCode of ['42703', 'PGRST204']) {
  for (const missingColumns of [['language'], ['grade_company'], ['grade'], ['language', 'grade_company', 'grade']]) {
    const tables = dataSet();
    tables.binder_cards.forEach(row => {
      row.notes = 'Retained private note'; row.grade_company = 'PSA'; row.grade = '9';
      for (const column of missingColumns) delete row[column];
    });
    const f = harness(tables, { missingColumns, schemaCode });
    const facts = await f.read();
    assert.equal(facts.ownedRows.length, 6);
    const saved = [...facts.cardsByBinder.values()].flat();
    assert.equal(saved.length, 8);
    for (const row of saved) {
      for (const column of ['language', 'grade_company', 'grade']) {
        assert.equal(Object.hasOwn(row, column), !missingColumns.includes(column));
      }
      assert.equal(row.notes, 'Retained private note');
      if (!missingColumns.includes('grade_company')) assert.equal(row.grade_company, 'PSA');
      if (!missingColumns.includes('grade')) assert.equal(row.grade, '9');
    }
    const reads = f.requests.filter(request => request.table === 'binder_cards');
    assert.equal(reads.length, 2 + missingColumns.length);
    assert.ok(reads.every(request => request.columns !== '*'));
    assert.equal(reads.filter(request => request.from === 0).length, 1 + missingColumns.length);
    if (baselineRevision) {
      const before = harness(tables, { baseline: true, missingColumns, schemaCode });
      const original = await before.read();
      assert.deepEqual(comparableFacts(facts), comparableFacts(original));
      before.cleanup();
    }
    compatibilityReports.push({ schemaCode, missingColumns, savedReads: reads.length });
    f.cleanup();
  }
}
for (const [missingColumns, schemaCode] of [[['card_name'], '42703'], [['language'], '42501'], [['grade'], '500']]) {
  const f = harness(dataSet(), { missingColumns, schemaCode });
  await assert.rejects(f.read(), error => error.code === schemaCode);
  assert.equal(f.requests.filter(request => request.table === 'binder_cards').length, 1);
  f.cleanup();
}
const laterSchema = harness(dataSet(2, 1702, 1323), {
  missingColumns: ['language'], schemaErrorAfterFirst: true,
});
await assert.rejects(laterSchema.read(), error => error.code === '42703');
assert.equal(laterSchema.requests.filter(request => request.table === 'binder_cards').length, 2,
  'A late schema failure must not rescan successful pages');
laterSchema.controls.missingColumns = [];
assert.equal([...(await laterSchema.read()).cardsByBinder.values()].flat().length, 1702,
  'The failed partial read is not cached as a complete collection');
laterSchema.cleanup();

const schemaAbort = new AbortController();
const abortedSchema = harness(dataSet(), { missingColumns: ['language'],
  afterPage: table => { if (table === 'binder_cards') schemaAbort.abort(); } });
await assert.rejects(abortedSchema.read({ signal: schemaAbort.signal }), /cancelled/);
assert.equal(abortedSchema.requests.filter(request => request.table === 'binder_cards').length, 1);
abortedSchema.cleanup();

const sessionFailure = harness(dataSet());
await sessionFailure.read();
for (const offset of [1, 2]) {
  sessionFailure.controls.sessionErrorAt = sessionFailure.authCalls.getSession + offset;
  await assert.rejects(sessionFailure.read(), /fixture session failure/);
  sessionFailure.controls.sessionErrorAt = -1;
}
const sessionRetryStart = sessionFailure.requests.length;
assert.equal((await sessionFailure.read()).ownedRows.length, 6);
assert.equal(sessionFailure.requests.length, sessionRetryStart,
  'Session failures cannot reveal facts, and a valid same-owner retry can reuse complete facts');
sessionFailure.cleanup();

// A future large server column must not expand Home transport/private caches.
const extraTables = dataSet();
for (const row of extraTables.binder_cards) row.unused_server_payload = 'unused'.repeat(70_000);
const extra = harness(extraTables), extraFacts = await extra.read();
assert.ok([...extraFacts.cardsByBinder.values()].flat().every(row => !Object.hasOwn(row, 'unused_server_payload')));
assert.ok(extra.cacheKeys.every(key => key.startsWith('home:saved-facts:' + owner + ':') || key === 'binders:' + owner + ':saved'),
  'Home facts remain exclusively in existing owner-scoped private cache keys');
assert.ok(extra.cacheKeys.length >= 2, 'Observe actual private cache calls, not an empty assertion');
assert.ok(extra.requests.filter(request => request.table === 'binder_cards').every(request => request.columns !== '*'));
const extraSplit = extra.requests.length;
await extra.read(); assert.equal(extra.requests.length, extraSplit);
let extraBaseline = null;
if (baselineSource) {
  const before = harness(extraTables, { baseline: true });
  await before.read(); extraBaseline = report(before.requests); before.cleanup();
}
const extraColumnReport = { baseline: extraBaseline, after: report(extra.requests),
  unknownColumnTransferred: false, publicCacheUsed: false };
extra.cleanup();

// Each pair uses one cohort definition; assertions prevent population drift.
const timingCohorts = [
  { cohort: 'original-large-24-columns', binders: 2, saved: 1702, owned: 1323, productionColumns: false, baselineRequests: 66, candidateRequests: 11 },
  { cohort: 'empty', binders: 0, saved: 0, owned: 0, baselineRequests: 2, candidateRequests: 2 },
  { cohort: 'small', binders: 2, saved: 8, owned: 6, baselineRequests: 6, candidateRequests: 6 },
  { cohort: 'large-1702-saved-1323-owned', binders: 2, saved: 1702, owned: 1323, baselineRequests: 66, candidateRequests: 11 },
  { cohort: 'five-languages-same-collector', binders: 5, saved: 5, owned: 5, multilingual: true, baselineRequests: 6, candidateRequests: 6 },
];
const perDataApiReadDelayMs = 50;
const timingServerCap = 500;
async function timedSample(cohort, baseline = false) {
  const tables = dataSet(cohort.binders, cohort.saved, cohort.owned, cohort.multilingual, cohort.productionColumns !== false);
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
  assert.equal(firstRead.requests, baseline && baselinePageSize === 50 ? cohort.baselineRequests : cohort.candidateRequests,
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
      multilingual: Boolean(cohort.multilingual), sourceColumns: cohort.productionColumns === false ? 24 : 30, serverCap: timingServerCap, delayMs: perDataApiReadDelayMs },
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
  baselinePageSize,
  intentionallyOmittedFields: omittedHomeFields,
  fixtureColumns: 'original-large-24-columns retains prior input; other synthetic cohorts populate the 30-column production shape',
  baselineModuleBlobs,
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  transport: 'offline actual modules; response-array JSON bytes; excludes headers, TLS, hosted DB and device rendering',
  reports,
  serverCapReports,
  compatibilityReports,
  extraColumnReport,
  dependency: { savedDispatchesWhileOwnershipHeld },
  cohortTimings,
  syntheticHostTiming: {
    ...largeTiming,
    cohort: '1702 saved /1323 owned; server cap500',
    includesJavaScriptWork: true,
    hostedLatency: 'unmeasured',
    budgetBypass: 'complete oversized snapshot is returned but not retained',
    originCap: 'fixture row caps are explicit; hosted payload latency remains unmeasured',
  },
}, null, 2));
console.log('Home saved facts: complete bounded cache, independent source paging, owner/edit/manual/TTL/cancellation/failure isolation passed.');
