import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';

export const COHORT_SHA='2d1be403c9b1a64ffad508912e0e8dba1fd06c67c15d695306366c7c84312cae';
export const MIGRATION='20260927150826_catalogue_repeated_printed_number_identity';
export const MIGRATION_SHA='6eaea4bc3f35c102d8d0a38c3cb225626da53ba79169022d95d1bd3a138907e7';
export const PROJECTS={staging:'lmwfhvexfcoyeuoyrlco',production:'oakdbbzdqwurpjnoqhmu'};
export const stableId=text=>{const h=createHash('sha256').update('stackr-newsets480:'+text).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export function canonicalKey(s,c,b) {
  const base=`pokemon:${c.language_code}:${s}:${c.collector_number}:${c.variant_code}`;
  return (base+(c.printing_scoped_key?`:printing:${b.printing_id}`:'')).toLowerCase();
}
export function validateCohort(bytes) {
  check(digest(bytes)===COHORT_SHA,'Frozen metadata cohort changed');
  const c=JSON.parse(bytes);
  check(c.cards.length===480&&c.sets.length===4&&c.asset_imports===0,'Wrong metadata population');
  for(const s of c.sets) {
    const rows=c.cards.filter(r=>r.provider_set_code===s.provider_set_code&&r.language_code===s.language_code);
    check(rows.length===s.total,'Incomplete set');
    check(new Set(rows.map(r=>r.provider_id)).size===s.total,'Ambiguous provider identity');
    for(const r of rows) {
      check(r.native_name&&r.collector_number&&['holo','normal'].includes(r.variant_code),'Incomplete printing');
      check(digest(Buffer.from(JSON.stringify(r.raw_payload)))===r.raw_payload_sha256,'Source payload changed');
      check(r.printing_scoped_key===(r.provider_set_code==='30th-c'),'Wrong discriminator scope');
      if(r.printing_scoped_key)check(r.collector_number===r.raw_payload.number&&r.provider_id===r.raw_payload.id,'Classic ordinal substituted for printed number');
      else check(r.collector_number===r.raw_payload.localId&&r.provider_id===r.raw_payload.id,'Source identity changed');
    }
  }
  for(const e of Object.keys(PROJECTS))check(new Set(c.cards.map(r=>r.bindings[e].printing_id)).size===480&&new Set(c.cards.map(r=>r.bindings[e].variant_id)).size===480,'Printing collapse');
  return c;
}
export function assertConfig(env,execute) {
  check(execute&&env.GITHUB_REF==='refs/heads/main'&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')&&env.GITHUB_SHA===env.STACKR_EXPECTED_MAIN_SHA,'Protected exact main execution required');
  check(env.STACKR_NEWSETS480_CONFIRMATION==='IMPORT NEWSETS480','Bounded metadata confirmation required');
  for(const [e,k] of [['staging','SUPABASE_STAGING_DB_URL'],['production','SUPABASE_DB_URL']]) {
    const u=new URL(env[k]);
    check(['postgres:','postgresql:'].includes(u.protocol)&&!u.search&&!u.hash,'Database override forbidden');
    check(u.hostname===`db.${PROJECTS[e]}.supabase.co`||(u.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(u.username)===`postgres.${PROJECTS[e]}`),'Wrong database target');
  }
}
export async function bulk(db,table,rows,columns) {
  if(!rows.length)return [];
  return (await db.query(`insert into ${table}(${columns.join(',')}) select ${columns.join(',')} from jsonb_populate_recordset(null::${table},$1::jsonb) on conflict do nothing returning *`,[JSON.stringify(rows)])).rows;
}
const equalFields=(actual,wanted,fields,label)=>{check(actual,`${label} missing`);for(const k of fields)check(JSON.stringify(actual[k])===JSON.stringify(wanted[k]),`${label} changed: ${k}`);};
function numberParts(n) {
  const m=n.match(/^([^0-9]*)([0-9]+)(.*)$/u);
  return m?{collector_number_prefix:m[1]||null,collector_number_sort:Number(m[2]),collector_number_suffix:m[3]||null,collector_number_sort_key:`${m[1]}${m[2].padStart(12,'0')}${m[3]}`.toLowerCase()}:{collector_number_prefix:null,collector_number_sort:null,collector_number_suffix:n,collector_number_sort_key:n.toLowerCase()};
}
export async function verify(db,c,environment) {
  const ids=c.cards.map(r=>r.bindings[environment].variant_id);
  const found=(await db.query('select printing_id,variant_id,collector_number,language_code,set_id,canonical_key from api.catalogue_cards where variant_id=any($1::uuid[])',[ids])).rows;
  check(found.length===480,'Published card population incomplete');
  for(const r of c.cards) {
    const b=r.bindings[environment],s=c.sets.find(s=>s.provider_set_code===r.provider_set_code),v=found.find(v=>v.variant_id===b.variant_id);
    equalFields(v,{...b,collector_number:r.collector_number,language_code:r.language_code,set_id:s.ids[environment],canonical_key:canonicalKey(s.ids[environment],r,b)},['printing_id','variant_id','collector_number','language_code','set_id','canonical_key'],'Published identity');
  }
  return c.sets.map(s=>({set_id:s.ids[environment],set_code:s.set_code,language:s.language_code,published_printings:c.cards.filter(r=>r.provider_set_code===s.provider_set_code).length}));
}
export async function writeMetadata(db,c,environment,migration) {
  check(digest(Buffer.from(migration))===MIGRATION_SHA,'Migration changed');
  const version=MIGRATION.split('_')[0],name=MIGRATION.slice(version.length+1);
  const ledger=(await db.query('select * from supabase_migrations.schema_migrations where version=$1',[version])).rows;
  if(ledger.length)check(ledger[0].name===name&&ledger[0].statements?.length===1&&digest(Buffer.from(ledger[0].statements[0]))===MIGRATION_SHA,'Migration ledger drift');
  else {
    await db.query(migration);
    await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])',[version,name,[migration]]);
  }
  const versions=(await db.query("select id,language_code from catalog.catalogue_versions where id=any($1::uuid[]) and status='published' and deprecated_at is null for share",[Object.values(c.versions)])).rows;
  check(versions.length===2&&versions.every(v=>c.versions[v.language_code]===v.id),'Published versions changed');
  const sources=(await db.query("select * from ingest.sources where code in ('tcgdex','pokemon_tcg_api') for share")).rows;
  check(sources.length===2&&sources.find(s=>s.code==='tcgdex').licence_status==='approved','Source provenance changed');
  const counts={sets_created:0,printings_created:0,variants_created:0,raw_records_created:0,mappings_created:0,names_created:0,rarities_created:0};
  for(const s of c.sets) {
    const id=s.ids[environment],current=(await db.query('select * from catalog.sets where id=$1 for update',[id])).rows[0],base=s.baseline[environment];
    if(current) {
      check(!current.deprecated_at&&current.game_code==='pokemon'&&current.language_code===s.language_code&&current.set_code===s.set_code,'Set identity drift');
      for(const k of ['native_name','english_display_name','provider_set_code','printed_total','total'])check(current[k]===s[k]||(base&&current[k]===base[k]),`Set field conflict: ${k}`);
      await db.query('update catalog.sets set native_name=$2,english_display_name=$3,provider_set_code=$4,printed_total=$5,total=$6,release_date=$7 where id=$1',[id,s.native_name,s.english_display_name,s.provider_set_code,s.printed_total,s.total,s.release_date]);
    } else {
      check(!base,'Existing set disappeared');
      check(!(await db.query('select id from catalog.sets where game_code=$1 and language_code=$2 and set_code=$3',['pokemon',s.language_code,s.set_code])).rows.length,'New set code already exists');
      counts.sets_created+=(await bulk(db,'catalog.sets',[{...s,id,game_code:'pokemon'}],['id','game_code','language_code','set_code','native_name','english_display_name','provider_set_code','printed_total','total','release_date'])).length;
    }
    const expected=c.cards.filter(r=>r.provider_set_code===s.provider_set_code).map(r=>r.bindings[environment].printing_id);
    const actual=(await db.query('select id from catalog.card_printings where set_id=$1',[id])).rows;
    check(actual.every(p=>expected.includes(p.id)),'Unexpected existing printing in bounded set');
  }
  const rr=[...new Map(c.cards.filter(r=>r.rarity_code).map(r=>[r.rarity_code,{game_code:'pokemon',code:r.rarity_code,english_label:r.raw_payload.rarity}])).values()];
  counts.rarities_created=(await bulk(db,'catalog.rarities',rr,['game_code','code','english_label'])).length;
  const rarities=(await db.query("select id,code from catalog.rarities where game_code='pokemon' and code=any($1::text[]) and deprecated_at is null",[rr.map(r=>r.code)])).rows;
  check(rarities.length===rr.length,'Rarity unavailable');
  const printingRows=[],variantRows=[],rawRows=[],mappingRows=[],nameRows=[],versionPrintings=[],versionVariants=[],versionMappings=[];
  for(const r of c.cards) {
    const s=c.sets.find(s=>s.provider_set_code===r.provider_set_code),b=r.bindings[environment],setId=s.ids[environment],source=sources.find(s=>s.code===r.source_code),v=c.versions[r.language_code];
    const p={id:b.printing_id,game_code:'pokemon',set_id:setId,language_code:r.language_code,collector_number:r.collector_number,...numberParts(r.collector_number),native_name:r.native_name,english_display_name:r.language_code==='en'?r.native_name:null,artist:r.artist,supertype:r.supertype,subtypes:r.subtypes,rarity_id:rarities.find(x=>x.code===r.rarity_code)?.id??null};
    if(!b.existing_printing)printingRows.push(p);
    const variant={id:b.variant_id,printing_id:b.printing_id,game_code:'pokemon',set_id:setId,language_code:r.language_code,collector_number:r.collector_number,variant_code:r.variant_code,finish_code:r.variant_code,canonical_key:canonicalKey(setId,r,b),is_default:!b.existing_printing,source_confidence:0.98,native_image_status:'missing'};
    if(!b.existing_variant)variantRows.push(variant);
    const rawId=stableId(`${environment}:raw:${r.source_code}:${r.language_code}:${r.provider_id}`);
    rawRows.push({id:rawId,source_id:source.id,record_type:'card',external_id:r.provider_id,provider_record_id:r.provider_id,language_code:r.language_code,source_url:r.source_url,licence_status:source.licence_status,payload_hash:r.raw_payload_sha256,raw_payload:r.raw_payload,attribution_text:r.source_code==='tcgdex'?'TCGdex factual metadata; MIT notice retained in THIRD_PARTY_NOTICES.md.':'Pokemon TCG API factual card metadata; artwork not imported by this release.',validation_status:'valid',internal_notes:`Frozen cohort ${COHORT_SHA}; owner-requested metadata import; finish follows provider classification; printed numbers preserved.`});
    const mapping={source_id:source.id,source_entity_type:'card',external_id:r.provider_id,external_uri:r.source_url,raw_record_id:rawId,game_code:'pokemon',language_code:r.language_code,variant_id:b.variant_id,confidence:0.98};
    mappingRows.push(mapping);
    if(!b.existing_printing)nameRows.push({id:stableId(`${environment}:name:${b.printing_id}`),printing_id:b.printing_id,language_code:r.language_code,name_type:'native',name:r.native_name,normalized_name:r.native_name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' '),source_confidence:0.98});
    const member={catalogue_version_id:v,language_code:r.language_code,set_id:setId,printing_id:b.printing_id};
    versionPrintings.push(member);versionVariants.push({...member,variant_id:b.variant_id,canonical_key:variant.canonical_key});
    versionMappings.push({...mapping,catalogue_version_id:v,set_id:null,printing_id:null});
  }
  counts.printings_created=(await bulk(db,'catalog.card_printings',printingRows,Object.keys(printingRows[0]))).length;
  counts.variants_created=(await bulk(db,'catalog.card_variants',variantRows,Object.keys(variantRows[0]))).length;
  const printings=(await db.query('select * from catalog.card_printings where id=any($1::uuid[])',[c.cards.map(r=>r.bindings[environment].printing_id)])).rows;
  const variants=(await db.query('select * from catalog.card_variants where id=any($1::uuid[])',[c.cards.map(r=>r.bindings[environment].variant_id)])).rows;
  for(const r of c.cards) {
    const b=r.bindings[environment],p=printings.find(x=>x.id===b.printing_id),v=variants.find(x=>x.id===b.variant_id);
    equalFields(p,b.existing_printing??printingRows.find(x=>x.id===b.printing_id),['id','game_code','set_id','language_code','collector_number','native_name','english_display_name'],'Printing');
    equalFields(v,b.existing_variant??variantRows.find(x=>x.id===b.variant_id),['id','printing_id','game_code','set_id','language_code','collector_number','variant_code','finish_code','canonical_key'],'Variant');
    check(!p.deprecated_at&&!v.deprecated_at,'Deprecated identity');
  }
  counts.raw_records_created=(await bulk(db,'ingest.raw_source_records',rawRows,Object.keys(rawRows[0]))).length;
  const storedRaw=(await db.query('select id,source_id,provider_record_id,payload_hash from ingest.raw_source_records where id=any($1::uuid[])',[rawRows.map(r=>r.id)])).rows;
  for(const r of rawRows)equalFields(storedRaw.find(x=>x.id===r.id),r,['id','source_id','provider_record_id','payload_hash'],'Raw source provenance');
  counts.mappings_created=(await bulk(db,'ingest.external_identifiers',mappingRows,Object.keys(mappingRows[0]))).length;
  const storedMappings=(await db.query("select * from ingest.external_identifiers where source_id=any($1::uuid[]) and source_entity_type='card' and external_id=any($2::text[]) and is_current and deprecated_at is null",[sources.map(s=>s.id),c.cards.map(r=>r.provider_id)])).rows;
  for(const m of mappingRows)equalFields(storedMappings.find(x=>x.source_id===m.source_id&&x.external_id===m.external_id&&x.language_code===m.language_code),m,['source_id','external_id','language_code','variant_id'],'Provider mapping');
  counts.names_created=(await bulk(db,'catalog.card_names',nameRows,Object.keys(nameRows[0]))).length;
  const vs=c.sets.map(s=>({catalogue_version_id:c.versions[s.language_code],language_code:s.language_code,set_id:s.ids[environment],set_code:s.set_code,set_status:'Images incomplete',checklist_completion_percentage:100,image_completion_percentage:0,set_art_completion_percentage:0,snapshot_summary:{cohort_sha256:COHORT_SHA,expected_printings:s.total,imported_printings:s.total,assets_imported:0,device_verified:false}}));
  await bulk(db,'catalog.catalogue_version_sets',vs,Object.keys(vs[0]));
  await bulk(db,'catalog.catalogue_version_printings',versionPrintings,Object.keys(versionPrintings[0]));
  await bulk(db,'catalog.catalogue_version_variants',versionVariants,Object.keys(versionVariants[0]));
  await bulk(db,'catalog.catalogue_version_external_identifiers',versionMappings,['catalogue_version_id','language_code','source_id','source_entity_type','external_id','external_uri','set_id','printing_id','variant_id','confidence']);
  return {counts,sets:await verify(db,c,environment),assets_imported:0,ownership_changes:0};
}
export async function rehearse(db,c,e,migration) {
  await db.query('begin isolation level serializable');
  try {await db.query("set local statement_timeout='45s'");await db.query("set local lock_timeout='5s'");return {status:'passed_and_rolled_back',...await writeMetadata(db,c,e,migration)};}
  finally {await db.query('rollback');}
}
async function main() {
  assertConfig(process.env,process.argv.includes('--execute'));
  const {createVerifiedSupabasePostgresClient}=await import('../../scripts/deploy/verified-supabase-postgres.mjs');
  const c=validateCohort(await readFile(new URL('./cohort.json',import.meta.url))),migration=await readFile(new URL(`../../supabase/migrations/${MIGRATION}.sql`,import.meta.url),'utf8');
  const out=process.env.STACKR_NEWSETS480_OUTPUT;check(out,'Receipt directory required');await mkdir(out,{recursive:true});
  const journal={status:'preflight',started_at:new Date().toISOString(),revision:process.env.GITHUB_SHA,run_id:process.env.GITHUB_RUN_ID,cohort_sha256:COHORT_SHA,migration_sha256:MIGRATION_SHA,device_verified:false};
  const save=()=>writeFile(`${out}/receipt.json`,JSON.stringify(journal,null,2));await save();
  let db,committed=false,commitAttempted=false;
  try {
    for(const e of ['staging','production']) {
      db=createVerifiedSupabasePostgresClient(process.env[e==='staging'?'SUPABASE_STAGING_DB_URL':'SUPABASE_DB_URL'],`stackr-newsets480-${e}`,{connectionTimeoutMillis:15000});await db.connect();
      journal[`${e}_rehearsal`]=await rehearse(db,c,e,migration);await save();console.log(`${e} complete metadata and migration rehearsal passed and rolled back`);
      if(e==='staging'){await db.end();db=null;}
    }
    await db.query('begin isolation level serializable');await db.query("set local statement_timeout='45s'");await db.query("set local lock_timeout='5s'");await db.query("select pg_advisory_xact_lock(hashtext('stackr-newsets480-20260927'))");
    journal.publication=await writeMetadata(db,c,'production',migration);journal.status='commit_intent';await save();commitAttempted=true;await db.query('commit');committed=true;
    journal.published_at=new Date().toISOString();journal.sets=await verify(db,c,'production');journal.status='published_catalogue_verified';journal.verified_at=new Date().toISOString();await save();console.log(JSON.stringify({status:journal.status,printings:480,assets:0}));
  } catch(e) {if(db&&!committed)await db.query('rollback').catch(()=>{});journal.status=committed?'published_verification_failed':commitAttempted?'commit_outcome_unknown':'failed_before_publication';journal.error=e.message;await save();throw e;}
  finally {if(db)await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
