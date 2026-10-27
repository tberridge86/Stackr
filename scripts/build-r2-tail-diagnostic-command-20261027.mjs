#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";

/** Build a proposed command only. This function never contacts Railway. */
export function buildTailDiagnosticCommand(source) {
  if (typeof source !== 'string' || !source.length || Buffer.byteLength(source) > 131072) {
    throw new Error('diagnostic_source_bound');
  }
  const sourceSha256 = sha256(source);
  const compressed = gzipSync(Buffer.from(source, 'utf8'), { level: 9 }).toString('base64');
  const entry = `
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
const sourceSha256=${JSON.stringify(sourceSha256)};
let emitted=0;
async function emit(record){
 const line=JSON.stringify(record)+'\\n';
 if(Buffer.byteLength(line)>8193||++emitted>400)throw Object.assign(new Error('diagnostic_output_bound'),{code:'diagnostic_output_bound'});
 await new Promise((resolve,reject)=>process.stdout.write(line,error=>error?reject(error):resolve()));
}
const deadline=setTimeout(()=>{process.stderr.write('{"event":"r2_tail_diagnostic_failed","code":"diagnostic_deadline","resumeAuthorized":false}\\n');process.exit(1);},180000);
try{
 const source=gunzipSync(Buffer.from(${JSON.stringify(compressed)},'base64'),{maxOutputLength:131072});
 if(createHash('sha256').update(source).digest('hex')!==sourceSha256)throw Object.assign(new Error('diagnostic_source_mismatch'),{code:'diagnostic_source_mismatch'});
 const {inspectOptimisedTail20261027}=await import('data:text/javascript;base64,'+source.toString('base64'));
 await emit({event:'r2_tail_diagnostic_start',sourceSha256,deadlineSeconds:180,databaseQueried:false,networkRequested:false,runnerStarted:false,resumeAuthorized:false});
 for(const runId of ['production-optimised-20261026b','production-resumed-20261026a']){
  const result=await inspectOptimisedTail20261027({runId});
  if(!Array.isArray(result.events)||result.events.length>198)throw Object.assign(new Error('diagnostic_output_bound'),{code:'diagnostic_output_bound'});
  for(const record of result.events)await emit(record);
 }
 await emit({event:'r2_tail_diagnostic_all_runs_complete',sourceSha256,runCount:2,databaseQueried:false,networkRequested:false,evidenceModified:false,runnerStarted:false,reconciled:false,resumeAuthorized:false});
}catch(error){
 const code=typeof error?.code==='string'&&/^(diagnostic_|cutover_|bulk_inspection_|runner_)[a-z0-9_]{1,100}$/.test(error.code)?error.code:'diagnostic_failed';
 await emit({event:'r2_tail_diagnostic_failed',code,resumeAuthorized:false});process.exitCode=1;
}finally{clearTimeout(deadline);}
`.trim();
  return { sourceSha256, startCommand: 'node --input-type=module -e ' + shellQuote(entry) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = await readFile(new URL('./inspect-r2-optimised-tail-20261027.mjs', import.meta.url), 'utf8');
  process.stdout.write(buildTailDiagnosticCommand(source).startCommand + '\n');
}
