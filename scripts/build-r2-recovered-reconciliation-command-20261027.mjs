#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

/** Compose a proposed read-only command; never contacts Railway. */
export function buildRecoveredReconciliationCommand(inspectorSource, reconcilerSource, parentInspectorSource) {
  const sources = { inspector: inspectorSource, reconciler: reconcilerSource, parentInspector: parentInspectorSource };
  for (const source of Object.values(sources)) {
    if (typeof source !== 'string' || !source.length || Buffer.byteLength(source) > 262144) {
      throw new Error('reconciliation_source_bound');
    }
  }
  const sourceHashes = Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, hash(value)]));
  const encoded = Object.fromEntries(Object.entries(sources).map(([key, value]) =>
    [key, gzipSync(Buffer.from(value), { level: 9 }).toString('base64')]));
  const entry = `
import {createHash} from 'node:crypto';
import {open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const sourceHashes=${JSON.stringify(sourceHashes)};
const encoded=${JSON.stringify(encoded)};
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
let emitted=0,queue=Promise.resolve();
async function emit(record){
 const line=JSON.stringify(record)+'\\n';
 if(Buffer.byteLength(line)>8192||++emitted>96)fail('reconciliation_output_bound');
 await new Promise((resolve,reject)=>process.stdout.write(line,error=>error?reject(error):resolve()));
}
const report=record=>{queue=queue.then(()=>emit(record));queue.catch(()=>{});};
const timer=setTimeout(()=>{process.stderr.write('{"event":"r2_reconciliation_failed","code":"reconciliation_deadline","resumeAuthorized":false}\\n');process.exit(1);},900000);
try{
 if(process.platform!=='linux'||process.getuid?.()!==1000||process.geteuid?.()!==1000
  ||process.env.RAILWAY_PROJECT_ID!=='d205637b-5376-41aa-9169-1015ba88fec3'
  ||process.env.RAILWAY_SERVICE_ID!=='b5410607-a591-420e-a506-fe184ce7455b'
  ||process.env.RAILWAY_ENVIRONMENT_ID!=='b4304736-cac8-4ca9-92a7-93f7f6499c2f')fail('reconciliation_host_mismatch');
 const modules={};
 for(const name of ['inspector','reconciler','parentInspector']){
  const bytes=gunzipSync(Buffer.from(encoded[name],'base64'),{maxOutputLength:262144});
  if(hash(bytes)!==sourceHashes[name])fail('reconciliation_source_mismatch');
  modules[name]=await import('data:text/javascript;base64,'+bytes.toString('base64'));
 }
 const pins={
  'scripts/deploy/verified-supabase-postgres.mjs':'8e2bf4f392a465fad9bd6669dba5b68fb081a6ca9489b5b4d3b75ac5e5327cb7',
  'scripts/deploy/postgres-url-guard.mjs':'169bbef8e8aebbf969fc9ad4b2e5a719e3818949025113b14d4dc544709eac2a'
 };
 for(const [name,expected] of Object.entries(pins)){
  const filename=path.resolve(process.cwd(),name);
  if(await realpath(filename)!==filename)fail('reconciliation_source_link');
  const file=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
   const before=await file.stat();
   if(!before.isFile()||before.size<1||before.size>262144)fail('reconciliation_source_bound');
   const bytes=Buffer.alloc(before.size+1);let size=0;
   while(size<bytes.length){const part=await file.read(bytes,size,bytes.length-size,null);if(!part.bytesRead)break;size+=part.bytesRead;}
   const after=await file.stat();
   if(size!==before.size||after.size!==before.size||after.ino!==before.ino||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs
    ||hash(bytes.subarray(0,size))!==expected)fail('reconciliation_source_mismatch');
  }finally{await file.close();}
 }
 const postgres=await import(pathToFileURL(path.resolve(process.cwd(),'scripts/deploy/verified-supabase-postgres.mjs')).href);
 const reconcile=modules.reconciler.createRecoveredRunReconciler({
  readExpectations:modules.inspector.readRecoveredRunExpectations20261027,
  readParentEvidence:modules.parentInspector.inspectOptimisedTail20261027,
  createClient:url=>postgres.createVerifiedSupabasePostgresClient(url,'stackr-r2-reconciliation-20261027',{
   connectionTimeoutMillis:15000,statement_timeout:30000,query_timeout:45000,
  }),fetchImpl:globalThis.fetch,report
 });
 await emit({event:'r2_reconciliation_start',sourceHashes,deadlineSeconds:900,databaseReadOnly:true,runnerStarted:false,resumeAuthorized:false});
 const result=await reconcile({env:process.env});
 await queue;
 await emit({event:'r2_reconciliation_complete',sourceHashes,certificate:result,certificateSha256:hash(JSON.stringify(result)),runnerStarted:false,resumeAuthorized:false});
}catch(error){
 try{await queue;}catch{}
 const code=typeof error?.code==='string'&&/^(reconciliation_|cutover_)[a-z0-9_]{1,100}$/.test(error.code)?error.code:'reconciliation_failed';
 await emit({event:'r2_reconciliation_failed',code,runnerStarted:false,resumeAuthorized:false});process.exitCode=1;
}finally{clearTimeout(timer);}
`.trim();
  const startCommand = 'node --input-type=module -e ' + quote(entry);
  return { sourceHashes, startCommand, commandSha256: hash(startCommand) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inspector, reconciler, parentInspector] = await Promise.all([
    readFile(new URL('./inspect-r2-recovered-tail-20261027.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./reconcile-r2-recovered-run-20261027.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./inspect-r2-optimised-tail-20261027.mjs', import.meta.url), 'utf8'),
  ]);
  process.stdout.write(buildRecoveredReconciliationCommand(inspector, reconciler, parentInspector).startCommand + '\n');
}
