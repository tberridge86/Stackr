import {check,digest,retryStorageRead} from '../queue1-publish-20260927/publish.mjs';
export const REFERENCES_SHA='92a62061ff98f8c288ec5530682e5c4bf5f20976d1f0836cb8a5261a92a01db0';
export const PREFIX='newsets279-official-front-20260927:';
export function validateReferences(bytes,cohortSha) {
  check(digest(bytes)===REFERENCES_SHA,'Frozen official references changed');
  const x=JSON.parse(bytes);
  check(x.metadata_cohort_sha256===cohortSha&&x.source_code==='pokemon_card_jp_official'&&x.delivery==='external_reference'&&x.original_mirrors===0&&x.derivatives===0,'Reference scope changed');
  check(x.records.length===279&&new Set(x.records.map(r=>r.provider_id)).size===279&&x.withheld.length===10,'Reference population changed');
  for(const r of x.records) {
    const u=new URL(r.image_url);
    check(u.protocol==='https:'&&['www.pokemon-card.com','www.30th.pokemon-card.com'].includes(u.hostname)&&!u.search&&!u.hash,'Unapproved reference host');
    check(r.provider_id===`${r.set_code}-${r.collector_number}`&&['M6','M6a'].includes(r.set_code)&&r.asset_scope==='printing_front'&&r.recognition_reference_eligible===false,'Reference identity changed');
    check(!['M6a-151','M6a-152'].includes(r.provider_id),'Combined LEGEND image must remain withheld');
    // The official site also places single landscape BREAK cards in /legend/.
    if(u.pathname.includes('/legend/'))check(r.provider_id==='M6a-157'&&r.width===1212&&r.height===868,'Unreviewed landscape reference');
    check(/^[a-f0-9]{64}$/.test(r.sha256)&&r.bytes>0&&r.bytes<10000000&&['PNG','JPEG'].includes(r.format),'Invalid reference bytes');
  }
  return x;
}
export async function verifyReferenceBytes(refs,sharp) {
  for(let i=0;i<refs.records.length;i+=4) {
    const results=await Promise.allSettled(refs.records.slice(i,i+4).map(r=>retryStorageRead(async()=>{
      const q=await fetch(r.image_url,{redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!q.ok){await q.body?.cancel();throw Object.assign(Error(`Official image failed: ${r.provider_id} HTTP ${q.status}`),{status:q.status});}
      check(Number(q.headers.get('content-length')??0)<10000000,'Reference too large');
      const bytes=Buffer.from(await q.arrayBuffer());check(bytes.length===r.bytes&&digest(bytes)===r.sha256,`Official image changed: ${r.provider_id}`);
      const m=await sharp(bytes).metadata();check(m.format===r.format.toLowerCase(),'Reference format changed');
      const p=await sharp(bytes).raw().toBuffer({resolveWithObject:true});check(p.info.width===r.width&&p.info.height===r.height,'Decoded reference dimensions changed');
    })));
    const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    if(i%40===0)console.log(JSON.stringify({phase:'official_reference_bytes_verified',count:Math.min(i+4,refs.records.length)}));
  }
  return refs.records.length;
}
export function referencePayload(r,sourceId,env) {
  return {asset_id:`${PREFIX}${r.bindings[env].printing_id}:${r.sha256}`,asset_type:'card_image',game_code:'pokemon',set_id:r.set_ids[env],printing_id:r.bindings[env].printing_id,variant_id:null,source_id:sourceId,url:r.image_url,original_source_url:r.image_url,original_source_identifier:r.official_id,storage_provider:'external_reference',externally_referenced:true,asset_visibility:'public_catalogue',permission_status:'approved',rights_status:'approved',publicly_servable:true,retention_status:'active',recognition_reference_eligible:false,mime_type:r.format==='JPEG'?'image/jpeg':'image/png',width:r.width,height:r.height,byte_size:r.bytes,sha256:r.sha256,content_sha256:r.sha256,attribution_text:'Pokémon card artwork; source: official Pokémon Card Game Japan.',source_attribution:'Pokémon Card Game Japan',derivative_list:[],licensing_review_notes:JSON.stringify({source_permission:'Existing owner-confirmed official Pokémon data and asset permission; approved source retained.',source_page:r.source_url,references_sha256:REFERENCES_SHA,identity_review:r.identity_review,artwork_scope:'printing_front',exact_finish_verified:false,recognition_approved:false,storage_mirror:false})};
}
export async function verifyReferences(db,refs,env,version) {
  const expected=refs.records.map(r=>referencePayload(r,refs.source_permission_snapshot.production_source_id,env));
  const stored=(await db.query('select id,asset_id from catalog.assets where asset_id=any($1::text[])',[expected.map(p=>p.asset_id)])).rows;
  check(stored.length===279,'Missing official asset bindings');
  const found=(await db.query('select * from api.asset_manifest where asset_row_id=any($1::uuid[]) and catalogue_version_id=$2',[stored.map(a=>a.id),version])).rows;
  check(found.length===279,'Official references not fully published');
  for(const p of expected) {
    const a=found.find(a=>a.asset_id===p.asset_id);
    check(a&&a.printing_id===p.printing_id&&a.set_id===p.set_id&&a.variant_id===null&&a.external_url===p.url&&a.content_sha256===p.content_sha256,'Public official image identity mismatch');
  }
  return {published_references:found.length,mirrored_originals:0,derivatives:0};
}
export async function writeReferences(db,refs,env,version) {
  const source=(await db.query("select * from ingest.sources where code='pokemon_card_jp_official' for share")).rows[0];
  check(source?.id===refs.source_permission_snapshot.production_source_id&&source.licence_status==='approved'&&source.active&&!source.deprecated_at,'Official source permission changed');
  if(env==='production')check(source.internal_notes===refs.source_permission_snapshot.internal_notes,'Owner source attestation changed');
  const payloads=refs.records.map(r=>referencePayload(r,source.id,env)),cols=Object.keys(payloads[0]);
  const inserted=(await db.query(`insert into catalog.assets(${cols.join(',')}) select ${cols.join(',')} from jsonb_populate_recordset(null::catalog.assets,$1::jsonb) on conflict do nothing returning id`,[JSON.stringify(payloads)])).rows;
  const assets=(await db.query('select * from catalog.assets where asset_id=any($1::text[])',[payloads.map(p=>p.asset_id)])).rows;
  check(assets.length===279,'Official reference insertion conflict');
  for(const p of payloads) {
    const a=assets.find(a=>a.asset_id===p.asset_id);check(!a.deleted_at&&!a.deprecated_at&&!a.unavailable_reason,'Official asset unavailable');a.byte_size=Number(a.byte_size);
    for(const k of cols)check(JSON.stringify(a[k])===JSON.stringify(p[k]),`Official asset changed: ${k}`);
  }
  const linked=await db.query("insert into catalog.catalogue_version_assets(catalogue_version_id,language_code,set_id,printing_id,variant_id,asset_id,asset_type) select $1,'ja',set_id,printing_id,null,id,'card_image' from catalog.assets where asset_id=any($2::text[]) on conflict do nothing returning asset_id",[version,payloads.map(p=>p.asset_id)]);
  for(const [code,total,count] of [['M6',113,113],['M6a',176,166]]) {
    const setId=refs.records.find(r=>r.set_code===code).set_ids[env];
    await db.query("update catalog.catalogue_version_sets set image_completion_percentage=$3,set_status=$4,snapshot_summary=snapshot_summary||$5::jsonb where catalogue_version_id=$1 and set_id=$2",[version,setId,100*count/total,count===total?'Set art incomplete':'Images incomplete',JSON.stringify({published_official_reference_images:count,reference_image_denominator:total,references_sha256:REFERENCES_SHA,mirrored_originals:0})]);
  }
  return {assets_created:inserted.length,links_created:linked.rows.length,...await verifyReferences(db,refs,env,version)};
}
