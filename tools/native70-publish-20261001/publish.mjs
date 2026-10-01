// Exact 70-front publication with 70 reviewed native-name repairs in the same
// serializable transaction. Uses the existing immutable artwork release path.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertConfig as baseConfig, assertNoConflictingFronts, publicationObjects, publishFrozenCohort, safePath } from '../artwork3303-publish-20260928/publish.mjs';
import { createNativeNameCorrections } from '../artwork3303-publish-20260928/native-name-corrections.mjs';
import { TCGPLAYER_SOURCE } from '../native96-publish-20260930/publish.mjs';
const HERE = new URL('.', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, HERE)));
const gz = url => JSON.parse(gunzipSync(readFileSync(url)));
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const FRONTS=70;
export const LANGUAGE_COUNTS=Object.freeze({ja:70});
export const SOURCE_COUNTS=Object.freeze({tcgplayer_card_artwork:70});
export const ARCHIVE=Object.freeze({id:602387380,kind:'github_release_asset',sha256:'befce0455eeb0c32fe0a5b6ded2b215bc96b4ccfe0a80f8eb8130c1e6ae4daad',size_in_bytes:13592296});
const prior=['artwork3303-publish-20260928','english49-publish-20260930','tw200-publish-20260930','english45-publish-20260930','sh33-publish-20260930','residual146-publish-20260930','native96-publish-20260930','korean232-publish-20260930','native65-publish-20261001','native72-publish-20261001'];
export function frozenConstants(){
 const c=read('./frozen-constants.json');
 check(SHA.test(c.cohort_sha256)&&SHA.test(c.corrections_sha256)&&isDeepStrictEqual(c.artifacts,[ARCHIVE]),'Native70 archive or hash changed');
 check(isDeepStrictEqual(c.language_counts,LANGUAGE_COUNTS)&&isDeepStrictEqual(c.source_counts,SOURCE_COUNTS)&&isDeepStrictEqual(c.set_counts,{'ja/E1':19,'ja/E2':51})&&c.native_name_corrections===70,'Native70 frozen scope changed');
 return c;
}
export function correctionPlan(){
 const bytes=readFileSync(new URL('./native-name-corrections.json',HERE));
 check(digest(bytes)===frozenConstants().corrections_sha256,'Frozen native-name repair changed');
 const plan=JSON.parse(bytes);createNativeNameCorrections(plan,{expectedCount:70});return plan;
}
export function exceptionLedger(){
 const rows=gz(new URL('../../docs/releases/artwork3312-exceptions-20261001.json.gz',HERE));
 check(rows.length===3312&&new Set(rows.map(r=>r.printing_id)).size===3312,'Native70 baseline changed');
 return new Map(rows.map(r=>[r.printing_id,r]));
}
export function validateRow(row,ledger,c,plan){
 const repair=plan.find(r=>r.printing_id===row.printing_id),q=row.evidence?.independent_visual_review;
 check(ledger&&row.language_code==='ja'&&((row.set_code==='E1'&&row.set_id==='2d5f077d-14bb-4fb5-b565-1f4e10c078c9')||(row.set_code==='E2'&&row.set_id==='c6c46c29-2f36-4586-b18f-af1269e684d2')),'Native70 printing absent from baseline');
 for(const k of ['printing_id','set_id','set_code','language_code','collector_number','catalogue_version_id'])check(row[k]===ledger[k],`Native70 identity changed: ${k}`);
 for(const k of ['printing_id','set_id','catalogue_version_id'])check(UUID.test(row[k]),'Native70 invalid catalogue ID');
 check(row.previous_native_name===ledger.card_native_name&&row.metadata_correction_required===true&&!!repair,'Native70 correction boundary changed');
 const desired=repair?.proposed_native_name??ledger.card_native_name;
 check(row.card_native_name===desired,'Native70 post-repair name changed');
 check(repair&&repair.current_native_name===ledger.card_native_name&&repair.proposed_native_name===q?.observed_native_title&&repair.language_code===row.language_code&&repair.set_id===row.set_id&&repair.collector_number===row.collector_number&&repair.set_code===row.set_code,'Native70 repair identity changed');
 check(ledger.category==='Verified front held for native-name correction'&&desired!==ledger.card_native_name,'Native70 unexpected metadata repair');
 check(q?.reviewer==='root'&&q.visual_identity_verified===true&&q.metadata_correction_required===true&&q.printing_id===row.printing_id&&q.current_native_name===ledger.card_native_name&&q.language_code===row.language_code&&q.set_code===row.set_code&&q.collector_number===row.collector_number,'Native70 root review identity changed');
 check(q.observed_native_title===desired&&q.source_url===row.image_url&&q.original_sha256===row.objects?.[0]?.sha256,'Native70 literal title/source/hash mismatch');
 check(q.set_id===row.set_id&&repair.reviewer==='root'&&repair.observed_printed_number===q.observed_printed_number&&repair.source_url===q.source_url&&repair.original_sha256===q.original_sha256,'Native70 correction evidence differs from reviewed face');
 check(q.observed_printed_number===`${row.collector_number}/${row.set_code==='E1'?'128':'092'}`&&row.evidence.source_collector_number===q.observed_printed_number,'Native70 printed number changed');
 const e=row.evidence,pid=String(row.provider_id??'');
 check(e.provider_group_id===(row.set_code==='E1'?23730:23731)&&e.source_url===row.image_url,'Native70 source group differs');
 check(row.source_code===TCGPLAYER_SOURCE.code&&/^\d+$/.test(pid)&&e.provider_id===pid&&e.provider_category_id===85&&/^\d+$/.test(String(e.provider_group_id))&&e.metadata_url===`https://tcgcsv.com/tcgplayer/85/${e.provider_group_id}/products`&&e.product_url?.startsWith(`https://www.tcgplayer.com/product/${pid}/`)&&row.image_url===`https://tcgplayer-cdn.tcgplayer.com/product/${pid}_in_1000x1000.jpg`,'Native70 Japanese provenance changed');
 check(row.objects?.length===4&&row.objects[0].role==='original'&&new Set(row.objects.map(o=>o.role)).size===4,'Native70 incomplete object roles');
 for(const o of row.objects){
  check(['original','card-grid','search-result','detail-page'].includes(o.role)&&o.artifact_id===ARCHIVE.id&&SHA.test(o.sha256)&&Number.isInteger(o.byte_size)&&o.byte_size>0&&o.byte_size<12000000&&Number.isInteger(o.width)&&o.width>0&&Number.isInteger(o.height)&&o.height>0,'Native70 object evidence changed');
  check(o.mime_type===(o.role==='original'?'image/jpeg':'image/webp'),'Native70 MIME changed');
  const ext='jpg';
  check(o.file===(o.role==='original'?`acquired/originals/${o.sha256}.${ext}`:`prepared/objects/${o.sha256}/${o.role}.webp`),'Native70 archived object path changed');
  safePath(`/packages/${o.artifact_id}`,o.file);
 }
 check(row.objects[0].sha256===q.original_sha256,'Native70 review image checksum changed');
}
export function validatePlan(bytes,receipt){
 const c=frozenConstants(),plan=correctionPlan();
 check(digest(bytes)===c.cohort_sha256&&receipt.cohort_sha256===c.cohort_sha256&&receipt.corrections_sha256===c.corrections_sha256,'Native70 frozen plan changed');
 for(const k of ['artifacts','set_counts','source_counts','language_counts'])check(isDeepStrictEqual(receipt[k],c[k]),'Native70 receipt scope changed');
 check(receipt.fronts===70&&receipt.derivative_references===210&&receipt.object_references===280&&receipt.native_name_corrections===70,'Native70 receipt count changed');
 const rows=JSON.parse(gunzipSync(bytes)),ledger=exceptionLedger();
 check(rows.length===70&&new Set(rows.map(r=>r.printing_id)).size===70,'Native70 membership changed');
 check(plan.length===70&&plan.every(p=>rows.some(r=>r.printing_id===p.printing_id)),'Native70 correction outside artwork cohort');
 for(const row of rows)validateRow(row,ledger.get(row.printing_id),c,plan);
 for(const [field,expected]of [['language_code',LANGUAGE_COUNTS],['source_code',SOURCE_COUNTS]])check(isDeepStrictEqual(rows.reduce((a,r)=>(a[r[field]]=(a[r[field]]??0)+1,a),{}),expected),'Native70 language/source count differs');
 const sets=rows.reduce((a,r)=>(a[`${r.language_code}/${r.set_code}`]=(a[`${r.language_code}/${r.set_code}`]??0)+1,a),{});check(isDeepStrictEqual(sets,c.set_counts),'Native70 set counts differ');
 const completed=new Set(prior.flatMap(name=>gz(new URL(`../${name}/cohort.json.gz`,HERE)).map(r=>r.printing_id)));
 check(rows.every(r=>!completed.has(r.printing_id)),'Native70 overlaps a completed cohort');
 assertNoConflictingFronts(rows);check(publicationObjects(rows).length===280,'Native70 object count differs');return rows;
}
export function validateApproval(a){
 const c=frozenConstants();check(a.approved===true&&a.store_resize_display===true&&a.fronts===70&&a.native_name_corrections===70&&a.corrections_sha256===c.corrections_sha256&&a.cohort_sha256===c.cohort_sha256&&a.source_wide_approval===false&&isDeepStrictEqual(a.source_counts,SOURCE_COUNTS)&&isDeepStrictEqual(a.language_counts,LANGUAGE_COUNTS)&&a.owner_statement&&a.approved_at,'Native70 approval scope differs');
}
export async function sourcesFor(db,_receipt,environment){
 // Staging provenance is rolled back with its rehearsal. Production sources
 // already exist; reject policy drift without changing their configuration.
 const expected=[TCGPLAYER_SOURCE];
 if(environment==='staging')for(const source of expected)await db.query('insert into ingest.sources(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(code) do nothing',Object.values(source));
 const rows=(await db.query('select * from ingest.sources where code=any($1::text[]) for share',[expected.map(s=>s.code)])).rows;
 check(rows.length===1&&expected.every(source=>{const found=rows.find(r=>r.code===source.code);return found&&!found.deprecated_at&&Object.entries(source).every(([k,v])=>found[k]===v);}), 'Native70 source policy drift');
 return new Map(rows.map(r=>[r.code,r.id]));
}
export function assertConfig(env){check(env.STACKR_NATIVE70_CONFIRMATION==='PUBLISH NATIVE70','Native70 confirmation required');baseConfig({...env,STACKR_ARTWORK3303_CONFIRMATION:'PUBLISH ARTWORK3303'});}
async function main(){assertConfig(process.env);check(process.argv.includes('--execute'),'Explicit execution required');const receipt=read('./plan-receipt.json'),approval=read('./approval.json');validateApproval(approval);const rows=validatePlan(readFileSync(new URL('./cohort.json.gz',HERE)),receipt);await publishFrozenCohort({rows,receipt,approval,root:process.env.STACKR_NATIVE70_PACKAGES,output:process.env.STACKR_NATIVE70_OUTPUT,sourceResolver:sourcesFor,nativeNameCorrections:createNativeNameCorrections(correctionPlan(),{expectedCount:70})});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
