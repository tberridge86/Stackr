#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const FILES = Object.freeze({ inspector: './inspect-r2-optimised-tail-20261027.mjs',
  reconciler: './reconcile-r2-interrupted-runs-20261027.mjs', launcher: './launch-r2-recovered-run-20261027.mjs',
  receipt: './r2-recovery-receipt-20261027.mjs', runtime: './lib/r2-runtime-snapshot-20261026b.mjs',
  coverage: './lib/r2-final-coverage-snapshot-20261026b.mjs' });

export function buildRecoveredMigrationCommand(sources) {
  if (!sources || Object.keys(sources).sort().join(',') !== Object.keys(FILES).sort().join(',')) throw new Error('recovery_source_set_invalid');
  for (const source of Object.values(sources)) {
    if (typeof source !== 'string' || !source.length || Buffer.byteLength(source) > 262144) throw new Error('recovery_source_bound');
  }
  const sourceHashes = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, hash(source)]));
  if (sourceHashes.runtime !== '2d615728ed248e99beae61e761ea310ee63ea5d6a60f4d119959c515f73cade8'
    || sourceHashes.coverage !== 'a5a8fd084e85a8fecc880ae0c0880f3630e72283f7fe7b41184e0c3f67c8f716') throw new Error('recovery_production_runtime_changed');
  const encoded = Object.fromEntries(Object.entries(sources).map(([name, source]) =>
    [name, gzipSync(Buffer.from(source), { level: 9 }).toString('base64')]));
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
function report(record){const line=JSON.stringify(record);if(Buffer.byteLength(line)>8192)fail('recovery_log_bound');console.log(line);}
let stopping=false;
function onStop(){stopping=true;report({event:'recovered_migration_stop_requested',atBatchBoundary:true});}
const timer=setTimeout(()=>{report({event:'recovered_production_entry_failed',code:'recovery_reconciliation_deadline',requiresReconciliation:true});process.exit(1);},900000);
try{
 if(process.platform!=='linux'||process.getuid?.()!==1000||process.geteuid?.()!==1000
  ||process.env.RAILWAY_PROJECT_ID!=='d205637b-5376-41aa-9169-1015ba88fec3'
  ||process.env.RAILWAY_SERVICE_ID!=='b5410607-a591-420e-a506-fe184ce7455b'
  ||process.env.RAILWAY_ENVIRONMENT_ID!=='b4304736-cac8-4ca9-92a7-93f7f6499c2f')fail('recovery_host_mismatch');
 const pins={
  'scripts/run-r2-catalogue-migration.mjs':'015b6b36f19840c367be96a5a8a18605e4ad36fe2d813e7ff574f10e4a1adadc',
  'scripts/inspect-r2-bulk-run.mjs':'72b5c6765e03d74d98aef38b21f0148627f7ec437298f23661c83320e453e7d3',
  'scripts/migrate-catalogue-to-r2.mjs':'757abcbc4347d186ce481746f4d704c63228f3b7644df9890f56e73b0a8f13dd',
  'scripts/lib/r2-catalogue-migration.mjs':'d05fdae0f9d7280b70f03aad681eb2b01e6b31b7d4c11acab31745c4ed14b922',
  'scripts/deploy/verified-supabase-postgres.mjs':'8e2bf4f392a465fad9bd6669dba5b68fb081a6ca9489b5b4d3b75ac5e5327cb7',
  'scripts/deploy/postgres-url-guard.mjs':'169bbef8e8aebbf969fc9ad4b2e5a719e3818949025113b14d4dc544709eac2a',
  'backend/lib/objectStorage.js':'302dd62b0608687ce144dde49bff9e99d07a56acaa3e4c252d2d6768031d0a48'
 };
 for(const [name,expected] of Object.entries(pins)){
  const filename=path.resolve(process.cwd(),name);
  if(await realpath(filename)!==filename)fail('recovery_source_link');
  const file=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
   const before=await file.stat();if(!before.isFile()||before.size<1||before.size>524288)fail('recovery_source_bound');
   const bytes=Buffer.alloc(before.size+1);let size=0;
   while(size<bytes.length){const part=await file.read(bytes,size,bytes.length-size,null);if(!part.bytesRead)break;size+=part.bytesRead;}
   const after=await file.stat();
   if(size!==before.size||after.size!==before.size||after.ino!==before.ino||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs
    ||hash(bytes.subarray(0,size))!==expected)fail('recovery_source_mismatch');
  }finally{await file.close();}
 }
 const modules={};
 for(const name of ['inspector','reconciler','launcher','receipt','runtime','coverage']){
  const bytes=gunzipSync(Buffer.from(encoded[name],'base64'),{maxOutputLength:262144});
  if(hash(bytes)!==sourceHashes[name])fail('recovery_source_mismatch');
  modules[name]=await import('data:text/javascript;base64,'+bytes.toString('base64'));
 }
 const original=name=>import(pathToFileURL(path.resolve(process.cwd(),name)).href);
 const runner=await original('scripts/run-r2-catalogue-migration.mjs');
 const cli=await original('scripts/migrate-catalogue-to-r2.mjs');
 const core=await original('scripts/lib/r2-catalogue-migration.mjs');
 const postgres=await original('scripts/deploy/verified-supabase-postgres.mjs');
 const objectStorage=await original('backend/lib/objectStorage.js');
 const store=modules.receipt.createRecoveryReceiptStore();
 const reconcile=modules.reconciler.createInterruptedRunReconciler({
  readExpectations:modules.inspector.readOptimisedRunExpectations20261027,
  createClient:url=>postgres.createVerifiedSupabasePostgresClient(url,'stackr-r2-recovery-20261027',{
   connectionTimeoutMillis:15000,statement_timeout:30000,query_timeout:45000,
  }),fetchImpl:globalThis.fetch,report
 });
 const launch=modules.launcher.createRecoveredMigrationLauncher({
  reconcile:async options=>{const certificate=await reconcile(options);clearTimeout(timer);return certificate;},
  successorExists:store.successorExists,persistAcceptance:store.persistAcceptance,
  createRuntime:()=>modules.runtime.createOptimisedMigrationRuntime({
   runCatalogueR2Migration:cli.runCatalogueR2Migration,migrateCatalogueAssets:core.migrateCatalogueAssets,
   planCatalogueAssetMigration:core.planCatalogueAssetMigration,createClient:postgres.createVerifiedSupabasePostgresClient,
   storage:objectStorage.createCatalogueObjectStorageAdapter({env:process.env}),report
  }),runRunner:runner.runR2MigrationRunner,readCapacity:runner.migrationDiskCapacity,
  verifyCoverage:options=>modules.coverage.verifyR2FinalCoverage20261026b({...options,createClient:postgres.createVerifiedSupabasePostgresClient}),
  stopRequested:()=>stopping,report
 });
 process.on('SIGTERM',onStop);process.on('SIGINT',onStop);
 report({event:'recovered_production_entry_start',runId:'production-recovered-20261027a',sourceHashes,requiresFreshReconciliation:true});
 await launch({env:process.env});
}catch(error){
 const code=typeof error?.code==='string'&&/^(recovery_|reconciliation_|cutover_|runner_)[a-z0-9_]{1,100}$/.test(error.code)?error.code:'recovery_entry_failed';
 report({event:'recovered_production_entry_failed',code,requiresReconciliation:true});process.exitCode=1;
}finally{clearTimeout(timer);process.off('SIGTERM',onStop);process.off('SIGINT',onStop);}
`.trim();
  const startCommand = 'node --input-type=module -e ' + quote(entry);
  return { sourceHashes, commandSha256: hash(startCommand), startCommand };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sources = Object.fromEntries(await Promise.all(Object.entries(FILES).map(async ([name, file]) =>
    [name, await readFile(new URL(file, import.meta.url), 'utf8')])));
  process.stdout.write(buildRecoveredMigrationCommand(sources).startCommand + '\n');
}
