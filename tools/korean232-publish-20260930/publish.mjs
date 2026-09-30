import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assertConfig as baseConfig, assertNoConflictingFronts, publishFrozenCohort, safePath } from '../artwork3303-publish-20260928/publish.mjs';

const HERE = new URL('.', import.meta.url);
const constantsFile = new URL('./frozen-constants.json', HERE);
const ledgerFile = new URL('../../docs/releases/artwork3681-exceptions-20260930.json.gz', HERE);
const previous = ['artwork3303-publish-20260928', 'english49-publish-20260930', 'tw200-publish-20260930', 'english45-publish-20260930', 'sh33-publish-20260930', 'residual146-publish-20260930', 'native96-publish-20260930'];
export const FRONTS = 232;
export const HELD = Object.freeze(['SV4K/091','SV4K/092','SV4M/091','SV4M/092','SV5K/090','SV5K/091','SV5K/092']);
export const SOURCE = Object.freeze({ code:'pokemon_card_kr_official', display_name:'Pokémon Korea official artwork', source_type:'image', base_url:'https://pokemoncard.co.kr', licence_status:'under_review', attribution_required:true, active:false, internal_notes:'Frozen-cohort artwork approval only; no source-wide acquisition approval.' });
const SHA=/^[a-f0-9]{64}$/;
const readGz=(path)=>JSON.parse(gunzipSync(readFileSync(path)));
const heldKey=(row)=>`${row.set_code}/${String(row.collector_number).padStart(3,'0')}`;
export { heldKey };

export function frozenConstants() {
  const c=JSON.parse(readFileSync(constantsFile));
  check(SHA.test(c.cohort_sha256) && Array.isArray(c.artifacts) && c.artifacts.length===1,'Invalid Korean frozen constants');
  const a=c.artifacts[0];
  check(a.id===601945434&&a.kind==='github_release_asset'&&a.sha256==='b0ae19c658ddee8abf2a855c7ad3e7ee186933e45b0c466f17dd5c632877211c'&&a.size_in_bytes===182095064&&a.source_code===SOURCE.code&&a.language_code==='ko','Invalid Korean archive');
  check(isDeepStrictEqual(c.source_counts,{[SOURCE.code]:FRONTS})&&isDeepStrictEqual(c.language_counts,{ko:FRONTS})&&Object.keys(c.set_counts??{}).length===3&&Object.entries(c.set_counts).every(([key,count])=>['ko/SV4K','ko/SV4M','ko/SV5K'].includes(key)&&Number.isInteger(count)&&count>0)&&Object.values(c.set_counts).reduce((n,x)=>n+x,0)===FRONTS,'Korean frozen counts changed');
  return c;
}
function exactTitle(row, review) {
  if (row.card_native_name===review.observed_native_title) return true;
  const ex=row.card_native_name.endsWith(' ex') && review.observed_native_title===row.card_native_name.replace(/ ex$/,'ex') && review.formatting_alias==='Whitespace before stylized ex suffix only';
  const glyph = review.formatting_alias==='Printed energy glyph expressed as the matching Korean energy type' && ((row.set_code==='SV4K'&&row.collector_number==='095'&&row.card_native_name==='기본 악 에너지'&&review.observed_native_title==='기본[Darkness symbol]에너지') || (row.set_code==='SV4M'&&row.collector_number==='095'&&row.card_native_name==='기본 강철 에너지'&&review.observed_native_title==='기본[Metal symbol]에너지'));
  return ex || glyph;
}
function reviewOf(row) { return row.evidence?.independent_visual_review; }
export function validateRow(row, ledger, constants) {
  const review=reviewOf(row), number=String(row.collector_number).padStart(3,'0');
  check(row.language_code==='ko'&&['SV4K','SV4M','SV5K'].includes(row.set_code)&&!HELD.includes(heldKey(row)),'Held or wrong Korean set/language');
  check(ledger&&['printing_id','set_id','catalogue_version_id','set_code','collector_number','card_native_name','language_code'].every(k=>row[k]===ledger[k]),'Korean ledger identity changed');
  for(const key of ['printing_id','set_id','catalogue_version_id'])check(/^[a-f0-9-]{36}$/.test(row[key]),'Invalid Korean catalogue ID');
  check(review?.passed===true&&review.reviewer==='root'&&review.printing_id===row.printing_id&&review.language_code==='ko'&&review.set_code===row.set_code&&review.collector_number===row.collector_number&&review.current_native_name===row.card_native_name&&review.observed_printed_set_code===row.set_code&&review.observed_printed_number===`${number}/${row.set_code==='SV5K'?'071':'066'}`&&row.evidence.source_collector_number===review.observed_printed_number&&exactTitle(row,review),'Frozen Korean review identity changed');
  const url=`https://cards.image.pokemonkorea.co.kr/data/wmimages/SV/${row.set_code}/${row.set_code}_${number}.png?w=512`;
  check(row.source_code===SOURCE.code&&row.image_url===url&&review.source_url===url,'Wrong official Korean CDN path');
  check(Array.isArray(row.objects)&&row.objects.length===4&&row.objects[0].role==='original'&&new Set(row.objects.map(x=>x.role)).size===4,'Wrong object roles');
  const roles=new Set(['original','card-grid','search-result','detail-page']);
  for(const object of row.objects){check(roles.has(object.role)&&SHA.test(object.sha256)&&object.byte_size>0&&object.byte_size<12_000_000&&object.width>0&&object.height>0&&constants.artifacts[0].id===object.artifact_id,'Invalid Korean object');check(object.mime_type===((object.role==='original')?'image/png':'image/webp'),'Wrong Korean object MIME');safePath(`/packages/${object.artifact_id}`,object.file);}
  const original=row.objects[0];check(original.width===512&&original.height===714&&original.sha256===review.original_sha256,'Original Korean front changed');
}
export function validatePlan(bytes, receipt) {
  const c=frozenConstants();check(digest(bytes)===c.cohort_sha256&&receipt.cohort_sha256===c.cohort_sha256,'Korean cohort hash changed');check(receipt.fronts===FRONTS&&receipt.derivative_references===FRONTS*3&&receipt.object_references===FRONTS*4&&isDeepStrictEqual(receipt.artifacts,c.artifacts)&&isDeepStrictEqual(receipt.set_counts,c.set_counts)&&isDeepStrictEqual(receipt.source_counts,c.source_counts)&&isDeepStrictEqual(receipt.language_counts,c.language_counts),'Korean receipt archive/scope changed');
  const rows=JSON.parse(gunzipSync(bytes));const ledger=new Map(readGz(ledgerFile).filter(x=>x.category==='Exact source needed'&&x.language_code==='ko').map(x=>[x.printing_id,x]));
  check(rows.length===FRONTS&&new Set(rows.map(x=>x.printing_id)).size===FRONTS&&rows.every(x=>ledger.has(x.printing_id)),'Korean membership changed');
  for(const row of rows)validateRow(row,ledger.get(row.printing_id),c);
  for(const [set,count]of Object.entries(c.set_counts))check(rows.filter(row=>'ko/'+row.set_code===set).length===count,'Korean frozen set count changed');
  for(const name of previous){const ids=new Set(readGz(new URL(`../${name}/cohort.json.gz`,HERE)).map(x=>x.printing_id));check(!rows.some(x=>ids.has(x.printing_id)),'Korean cohort overlaps previous cohort');}
  assertNoConflictingFronts(rows);return rows;
}
export function validateApproval(a){const c=frozenConstants();check(a.approved===true&&a.store_resize_display===true&&a.fronts===FRONTS&&a.cohort_sha256===c.cohort_sha256&&a.source_wide_approval===false&&isDeepStrictEqual(a.source_counts,c.source_counts)&&isDeepStrictEqual(a.language_counts,c.language_counts)&&typeof a.owner_statement==='string'&&a.owner_statement.trim()&&a.approved_at,'Korean approval scope changed');}
export async function sourcesFor(db){await db.query('insert into ingest.sources(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(code) do nothing',Object.values(SOURCE));const rows=(await db.query('select * from ingest.sources where code=$1 for share',[SOURCE.code])).rows;check(rows.length===1&&Object.entries(SOURCE).every(([k,v])=>rows[0][k]===v)&&!rows[0].deprecated_at,'Korean source policy changed');return new Map([[SOURCE.code,rows[0].id]]);}
export function assertConfig(env){check(env.STACKR_KOREAN232_CONFIRMATION==='PUBLISH KOREAN232','Korean confirmation required');baseConfig({...env,STACKR_ARTWORK3303_CONFIRMATION:'PUBLISH ARTWORK3303'});}
async function main(){assertConfig(process.env);check(process.argv.includes('--execute'),'Explicit execution required');const receipt=JSON.parse(await readFile(new URL('./plan-receipt.json',HERE)));const approval=JSON.parse(await readFile(new URL('./approval.json',HERE)));validateApproval(approval);const rows=validatePlan(await readFile(new URL('./cohort.json.gz',HERE)),receipt);await publishFrozenCohort({rows,receipt,approval,root:process.env.STACKR_KOREAN232_PACKAGES,output:process.env.STACKR_KOREAN232_OUTPUT,sourceResolver:sourcesFor});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
