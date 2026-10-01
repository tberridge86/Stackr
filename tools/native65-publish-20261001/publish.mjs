// Exact 65-front publication with 53 reviewed native-name repairs in the same
// serializable transaction. Uses the existing immutable artwork release path.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertConfig as baseConfig, assertNoConflictingFronts, publicationObjects, publishFrozenCohort, safePath } from '../artwork3303-publish-20260928/publish.mjs';
import { createNativeNameCorrections } from '../artwork3303-publish-20260928/native-name-corrections.mjs';
import { TCGPLAYER_SOURCE } from '../native96-publish-20260930/publish.mjs';
import { SOURCE as KOREAN_SOURCE } from '../korean232-publish-20260930/publish.mjs';
const HERE = new URL('.', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, HERE)));
const gz = url => JSON.parse(gunzipSync(readFileSync(url)));
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const FRONTS=65;
export const LANGUAGE_COUNTS=Object.freeze({ja:58,ko:7});
export const SOURCE_COUNTS=Object.freeze({tcgplayer_card_artwork:58,pokemon_card_kr_official:7});
export const ARCHIVE=Object.freeze({id:602279940,kind:'github_release_asset',sha256:'d45475488fb64603bb15abc3ed9c68a9de65672a18d16d1cfecd96d5c1b0dd7b',size_in_bytes:16416458});
const prior=['artwork3303-publish-20260928','english49-publish-20260930','tw200-publish-20260930','english45-publish-20260930','sh33-publish-20260930','residual146-publish-20260930','native96-publish-20260930','korean232-publish-20260930'];
export function frozenConstants(){
 const c=read('./frozen-constants.json');
 check(SHA.test(c.cohort_sha256)&&SHA.test(c.corrections_sha256)&&isDeepStrictEqual(c.artifacts,[ARCHIVE]),'Native65 archive or hash changed');
 check(isDeepStrictEqual(c.language_counts,LANGUAGE_COUNTS)&&isDeepStrictEqual(c.source_counts,SOURCE_COUNTS)&&c.native_name_corrections===53,'Native65 frozen scope changed');
 return c;
}
export function correctionPlan(){
 const bytes=readFileSync(new URL('./native-name-corrections.json',HERE));
 check(digest(bytes)===frozenConstants().corrections_sha256,'Frozen native-name repair changed');
 const plan=JSON.parse(bytes);createNativeNameCorrections(plan);return plan;
}
export function exceptionLedger(){
 const rows=gz(new URL('../../docs/releases/artwork3449-exceptions-20261001.json.gz',HERE));
 check(rows.length===3449&&new Set(rows.map(r=>r.printing_id)).size===3449,'Native65 baseline changed');
 return new Map(rows.map(r=>[r.printing_id,r]));
}
export function validateRow(row,ledger,c,plan){
 const repair=plan.find(r=>r.printing_id===row.printing_id),q=row.evidence?.independent_visual_review;
 check(ledger&&['ja','ko'].includes(row.language_code),'Native65 printing absent from baseline');
 for(const k of ['printing_id','set_id','set_code','language_code','collector_number','catalogue_version_id'])check(row[k]===ledger[k],`Native65 identity changed: ${k}`);
 for(const k of ['printing_id','set_id','catalogue_version_id'])check(UUID.test(row[k]),'Native65 invalid catalogue ID');
 check(row.previous_native_name===ledger.card_native_name&&row.metadata_correction_required===!!repair,'Native65 correction boundary changed');
 const desired=repair?.proposed_native_name??ledger.card_native_name;
 check(row.card_native_name===desired,'Native65 post-repair name changed');
 if(repair){
  check(repair.current_native_name===ledger.card_native_name&&repair.language_code===row.language_code&&repair.set_id===row.set_id&&repair.collector_number===row.collector_number&&repair.set_code===row.set_code,'Native65 repair identity changed');
  check(ledger.category==='Verified front held for native-name correction'&&desired!==ledger.card_native_name,'Native65 unexpected metadata repair');
 }else check(ledger.category==='Verified front awaiting publication','Native65 unreviewed publication candidate');
 check(q?.reviewer==='root'&&q.printing_id===row.printing_id&&q.current_native_name===ledger.card_native_name&&q.language_code===row.language_code&&q.set_code===row.set_code&&q.collector_number===row.collector_number,'Native65 root review identity changed');
 check(typeof q.observed_native_title==='string'&&q.observed_native_title.length>0&&q.source_url===row.image_url,'Native65 literal title/source missing');
 // A held review is accepted only with its exact hash-bound, atomic name repair.
 // Its historical failed-name result is retained rather than rewritten as a pass.
 check(q.passed===true||repair&&q.passed===false,'Native65 visual review unverified');
 const suffix=row.language_code==='ja'&&row.set_code==='E2'&&row.collector_number==='009'&&row.card_native_name==='アリアドス-009/092'&&q.observed_native_title==='アリアドス'&&q.accepted_title_suffix==='-009/092'&&!repair;
 check(q.observed_native_title===desired||suffix,'Native65 native title differs from repaired identity');
 const denominators={E1:'128',E2:'092',E3:'087',SV4K:'066',SV4M:'066',SV5K:'071'};
 check(denominators[row.set_code]&&q.observed_printed_number===`${row.collector_number}/${denominators[row.set_code]}`&&row.evidence.source_collector_number===q.observed_printed_number,'Native65 printed number changed');
 if(row.language_code==='ja'){
  const e=row.evidence,pid=String(row.provider_id??'');
  check(row.source_code===TCGPLAYER_SOURCE.code&&/^\d+$/.test(pid)&&e.provider_id===pid&&e.provider_category_id===85&&/^\d+$/.test(String(e.provider_group_id))&&e.metadata_url===`https://tcgcsv.com/tcgplayer/85/${e.provider_group_id}/products`&&e.product_url?.startsWith(`https://www.tcgplayer.com/product/${pid}/`)&&row.image_url===`https://tcgplayer-cdn.tcgplayer.com/product/${pid}_in_1000x1000.jpg`,'Native65 Japanese provenance changed');
 }else{
  check(row.source_code===KOREAN_SOURCE.code&&q.observed_printed_set_code===row.set_code&&row.image_url===`https://cards.image.pokemonkorea.co.kr/data/wmimages/SV/${row.set_code}/${row.set_code}_${row.collector_number}.png?w=512`,'Native65 Korean provenance changed');
 }
 check(row.objects?.length===4&&row.objects[0].role==='original'&&new Set(row.objects.map(o=>o.role)).size===4,'Native65 incomplete object roles');
 for(const o of row.objects){
  check(['original','card-grid','search-result','detail-page'].includes(o.role)&&o.artifact_id===ARCHIVE.id&&SHA.test(o.sha256)&&Number.isInteger(o.byte_size)&&o.byte_size>0&&o.byte_size<12000000&&Number.isInteger(o.width)&&o.width>0&&Number.isInteger(o.height)&&o.height>0,'Native65 object evidence changed');
  check(o.mime_type===(o.role==='original'?(row.language_code==='ko'?'image/png':'image/jpeg'):'image/webp'),'Native65 MIME changed');
  const ext=o.mime_type==='image/png'?'png':'jpg';
  check(o.file===(o.role==='original'?`acquired/originals/${o.sha256}.${ext}`:`prepared/objects/${o.sha256}/${o.role}.webp`),'Native65 archived object path changed');
  safePath(`/packages/${o.artifact_id}`,o.file);
 }
 check(row.objects[0].sha256===q.original_sha256,'Native65 review image checksum changed');
 if(row.language_code==='ko')check(row.objects[0].width===512&&row.objects[0].height===714,'Native65 Korean source dimensions changed');
}
export function validatePlan(bytes,receipt){
 const c=frozenConstants(),plan=correctionPlan();
 check(digest(bytes)===c.cohort_sha256&&receipt.cohort_sha256===c.cohort_sha256&&receipt.corrections_sha256===c.corrections_sha256,'Native65 frozen plan changed');
 for(const k of ['artifacts','set_counts','source_counts','language_counts'])check(isDeepStrictEqual(receipt[k],c[k]),'Native65 receipt scope changed');
 check(receipt.fronts===65&&receipt.derivative_references===195&&receipt.object_references===260&&receipt.native_name_corrections===53,'Native65 receipt count changed');
 const rows=JSON.parse(gunzipSync(bytes)),ledger=exceptionLedger();
 check(rows.length===65&&new Set(rows.map(r=>r.printing_id)).size===65,'Native65 membership changed');
 check(plan.length===53&&plan.every(p=>rows.some(r=>r.printing_id===p.printing_id)),'Native65 correction outside artwork cohort');
 for(const row of rows)validateRow(row,ledger.get(row.printing_id),c,plan);
 for(const [field,expected]of [['language_code',LANGUAGE_COUNTS],['source_code',SOURCE_COUNTS]])check(isDeepStrictEqual(rows.reduce((a,r)=>(a[r[field]]=(a[r[field]]??0)+1,a),{}),expected),'Native65 language/source count differs');
 const sets=rows.reduce((a,r)=>(a[`${r.language_code}/${r.set_code}`]=(a[`${r.language_code}/${r.set_code}`]??0)+1,a),{});check(isDeepStrictEqual(sets,c.set_counts),'Native65 set counts differ');
 const completed=new Set(prior.flatMap(name=>gz(new URL(`../${name}/cohort.json.gz`,HERE)).map(r=>r.printing_id)));
 check(rows.every(r=>!completed.has(r.printing_id)),'Native65 overlaps a completed cohort');
 assertNoConflictingFronts(rows);check(publicationObjects(rows).length===260,'Native65 object count differs');return rows;
}
export function validateApproval(a){
 const c=frozenConstants();check(a.approved===true&&a.store_resize_display===true&&a.fronts===65&&a.native_name_corrections===53&&a.corrections_sha256===c.corrections_sha256&&a.cohort_sha256===c.cohort_sha256&&a.source_wide_approval===false&&isDeepStrictEqual(a.source_counts,SOURCE_COUNTS)&&isDeepStrictEqual(a.language_counts,LANGUAGE_COUNTS)&&a.owner_statement&&a.approved_at,'Native65 approval scope differs');
}
export async function sourcesFor(db,_receipt,environment){
 // Staging provenance is rolled back with its rehearsal. Production sources
 // already exist; reject policy drift without changing their configuration.
 const expected=[TCGPLAYER_SOURCE,KOREAN_SOURCE];
 if(environment==='staging')for(const source of expected)await db.query('insert into ingest.sources(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(code) do nothing',Object.values(source));
 const rows=(await db.query('select * from ingest.sources where code=any($1::text[]) for share',[expected.map(s=>s.code)])).rows;
 check(rows.length===2&&expected.every(source=>{const found=rows.find(r=>r.code===source.code);return found&&!found.deprecated_at&&Object.entries(source).every(([k,v])=>found[k]===v);}), 'Native65 source policy drift');
 return new Map(rows.map(r=>[r.code,r.id]));
}
export function assertConfig(env){check(env.STACKR_NATIVE65_CONFIRMATION==='PUBLISH NATIVE65','Native65 confirmation required');baseConfig({...env,STACKR_ARTWORK3303_CONFIRMATION:'PUBLISH ARTWORK3303'});}
async function main(){assertConfig(process.env);check(process.argv.includes('--execute'),'Explicit execution required');const receipt=read('./plan-receipt.json'),approval=read('./approval.json');validateApproval(approval);const rows=validatePlan(readFileSync(new URL('./cohort.json.gz',HERE)),receipt);await publishFrozenCohort({rows,receipt,approval,root:process.env.STACKR_NATIVE65_PACKAGES,output:process.env.STACKR_NATIVE65_OUTPUT,sourceResolver:sourcesFor,nativeNameCorrections:createNativeNameCorrections(correctionPlan())});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
