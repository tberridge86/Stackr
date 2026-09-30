// Reuses the existing artwork publisher; no provider requests or source activation.
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {check,digest} from '../queue1-publish-20260927/publish.mjs';
import {assertConfig as baseConfig,assertNoConflictingFronts,safePath,publishFrozenCohort} from '../artwork3303-publish-20260928/publish.mjs';
import {APPROVAL_PATH,APPROVAL_SHA} from '../mep89-publish-20260927/publish.mjs';

export const COHORT_SHA='f7478efffa3f74a3e7e07fa768c3a7e34b894bd43693469812d697d9f34f68a8';
export const ARCHIVE_SHA='ac6bb248dee86f9c83b68b25fd9a184470cc717a2a44220fa2c4a71d0adea3d5';
export function validatePlan(bytes,receipt) {
  check(digest(bytes)===COHORT_SHA&&receipt.cohort_sha256===COHORT_SHA,'Frozen 49-front cohort changed');
  check(receipt.artifacts.length===1&&receipt.artifacts[0].id===600281085&&receipt.artifacts[0].sha256===ARCHIVE_SHA&&receipt.artifacts[0].size_in_bytes===47144816,'Frozen archive changed');
  const rows=JSON.parse(gunzipSync(bytes));
  check(rows.length===49&&new Set(rows.map(r=>r.printing_id)).size===49,'Wrong front count');
  for(const r of rows){
    check(r.source_code==='scrydex'&&r.language_code==='en'&&r.image_url===`https://images.scrydex.com/pokemon/${r.provider_id}/large`,'Wrong image source');
    check(/^(mcd(14|15|17|18)-(?:[1-9]|1[0-2])|svp-102)$/.test(r.provider_id),'Unreviewed provider identity');
    check(r.objects.length===4&&r.objects[0].role==='original'&&['card-grid','search-result','detail-page'].every(role=>r.objects.some(o=>o.role===role)),'Incomplete derivatives');
    for(const o of r.objects){
      check(o.artifact_id===600281085&&/^[a-f0-9]{64}$/.test(o.sha256)&&o.byte_size>0&&o.byte_size<12_000_000&&o.width>0&&o.height>0,'Invalid object evidence');
      check(o.mime_type===(o.role==='original'?'image/png':'image/webp'),'Wrong format');safePath('/packages',`${o.artifact_id}/${o.file}`);
    }
  }
  assertNoConflictingFronts(rows);return rows;
}
export function validateApproval(a){
  check(a.approved===true&&a.store_resize_display===true&&a.fronts===49&&a.cohort_sha256===COHORT_SHA&&a.source_code==='scrydex'&&a.language_code==='en'&&a.source_wide_approval===false&&typeof a.owner_statement==='string'&&a.owner_statement.trim()&&a.approved_at,'49-front source-specific owner confirmation is pending');
}
export function assertConfig(env){
  check(env.STACKR_ENGLISH49_CONFIRMATION==='PUBLISH ENGLISH49','49-front release confirmation required');
  baseConfig({...env,STACKR_ARTWORK3303_CONFIRMATION:'PUBLISH ARTWORK3303'});
}
export async function sourcesFor(db){
  const rows=(await db.query("select * from ingest.sources where code='scrydex' for share")).rows;
  const notes=`Provenance only; automated acquisition inactive. Exactly 89 English MEP fronts approved by owner; ${APPROVAL_PATH}; ${APPROVAL_SHA}. No source-wide approval.`;
  const s=rows[0];check(rows.length===1&&s.source_type==='image'&&s.base_url==='https://scrydex.com'&&s.active===false&&s.licence_status==='under_review'&&!s.deprecated_at&&s.internal_notes===notes,'Existing inactive source provenance changed');
  return new Map([['scrydex',s.id]]);
}
async function main(){
  assertConfig(process.env);check(process.argv.includes('--execute'),'Explicit execution required');
  const receipt=JSON.parse(await readFile(new URL('./plan-receipt.json',import.meta.url)));
  const approval=JSON.parse(await readFile(new URL('./approval.json',import.meta.url)));validateApproval(approval);
  const rows=validatePlan(await readFile(new URL('./cohort.json.gz',import.meta.url)),receipt);
  await publishFrozenCohort({rows,receipt,approval,root:process.env.STACKR_ENGLISH49_PACKAGES,output:process.env.STACKR_ENGLISH49_OUTPUT,sourceResolver:sourcesFor});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
