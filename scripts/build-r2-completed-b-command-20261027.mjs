import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const hash = value => createHash('sha256').update(value).digest('hex');
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

/** Compose only; no deployment, network, database or filesystem mutation. */
export function buildCompletedBCommand(source) {
  if (typeof source !== 'string' || !source.length || Buffer.byteLength(source) > 131072) throw new Error('closeout_source_bound');
  const sourceSha256 = hash(source);
  const encoded = gzipSync(Buffer.from(source), { level: 9 }).toString('base64');
  const entry = `
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
const sourceSha256=${JSON.stringify(sourceSha256)};
let lines=0;
async function emit(record){
 const line=JSON.stringify(record)+'\\n';
 if(Buffer.byteLength(line)>8192||++lines>8)throw Object.assign(new Error('closeout_output_bound'),{code:'closeout_output_bound'});
 await new Promise((resolve,reject)=>process.stdout.write(line,error=>error?reject(error):resolve()));
}
const timer=setTimeout(()=>{process.stderr.write('{"event":"r2_completed_b_failed","code":"closeout_deadline","runnerStarted":false}\\n');process.exit(1);},300000);
try{
 const source=gunzipSync(Buffer.from(${JSON.stringify(encoded)},'base64'),{maxOutputLength:131072});
 if(createHash('sha256').update(source).digest('hex')!==sourceSha256)throw Object.assign(new Error('closeout_source_mismatch'),{code:'closeout_source_mismatch'});
 const {inspectCompletedB20261027}=await import('data:text/javascript;base64,'+source.toString('base64'));
 await emit({event:'r2_completed_b_start',sourceSha256,runId:'production-recovered-20261027b',databaseQueried:false,networkRequested:false,runnerStarted:false});
 const result=await inspectCompletedB20261027();
 if(result.events?.length!==3)throw Object.assign(new Error('closeout_event_count'),{code:'closeout_event_count'});
 for(const event of result.events)await emit(event);
 await emit({event:'r2_completed_b_finished',sourceSha256,certificateSha256:result.certificateSha256,evidenceModified:false,runnerStarted:false,completionVerified:false});
}catch(error){
 const code=typeof error?.code==='string'&&/^(closeout_|cutover_|bulk_inspection_|runner_)[a-z0-9_]{1,100}$/.test(error.code)?error.code:'closeout_failed';
 await emit({event:'r2_completed_b_failed',code,evidenceModified:false,runnerStarted:false,completionVerified:false});process.exitCode=1;
}finally{clearTimeout(timer);}
`.trim();
  const startCommand = 'node --input-type=module -e ' + quote(entry);
  return { sourceSha256, commandSha256: hash(startCommand), startCommand };
}
