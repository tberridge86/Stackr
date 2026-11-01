import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BATCH, PROJECT, BUCKET, REVISION, SOURCE_JPEG, sourceUrl, sourceIdentifier } from './batch.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const j=value=>`${q(JSON.stringify(value))}::jsonb`;
const sorted=rows=>[...rows].sort((a,b)=>`${a.set_id??''}:${a.catalogue_version_id??''}:${a.asset_id??a.id??''}`.localeCompare(`${b.set_id??''}:${b.catalogue_version_id??''}:${b.asset_id??b.id??''}`));
const project=(alias,fields)=>`jsonb_build_object(${fields.map(key=>`${q(key)},${alias}.${key}`).join(',')})`;
const linkFields=['catalogue_version_id','language_code','set_id','printing_id','variant_id','asset_id','asset_type'];
const linkCore=row=>Object.fromEntries(linkFields.map(k=>[k,row[k]]));
const membershipJson=rows=>`(select coalesce(jsonb_agg(to_jsonb(r) order by r.set_id,r.catalogue_version_id,r.asset_id),'[]'::jsonb) from jsonb_populate_recordset(null::catalog.catalogue_version_assets,${j(rows)}) r)`;
const OLD_HASHES={
 l1b:'f3234f24da22abb5966af659f8a3db3203d3143ec9683dfcd2cc87b40d204794',
 ll:'9dfdcbec146a9ca771bd333ebfa0cfab991b96ce8270686a1707df9288af0532',
};
// The exact locally prepared manifest is frozen below after hash/decode verification.
// This prevents coherent changes to both manifest and remote verification claims.
const EXPECTED_MANIFEST_CANONICAL_SHA='6a2f7b809ba62214998b05bf47d078e02fa6d96593f1c769ea2017bffdd97598';

export function buildPublication({manifest,envelope,prior,verification,authority,evidence}) {
 assert.equal(sha(JSON.stringify(manifest)),EXPECTED_MANIFEST_CANONICAL_SHA,'Prepared object manifest differs from the reviewed exact batch');
 assert.equal(manifest.schemaVersion,'stackr-jp-crop-local-objects-v1');
 assert.equal(manifest.projectRef,PROJECT);assert.equal(manifest.bucket,BUCKET);assert.equal(manifest.pipelineMainRevision,REVISION);
 assert.equal(manifest.provenance.sourceSha256,SOURCE_JPEG);assert.equal(manifest.assets.length,2);assert.equal(manifest.objects.length,8);
 assert.equal(envelope.declaredProjectRef,PROJECT);assert.equal(prior.declaredProjectRef,PROJECT);
 assert.equal(envelope.sets.length,2);assert.equal(envelope.publishedMemberships.length,2);
 assert.deepEqual(envelope.sources,[{id:'a23954d2-49ca-4f2e-8cee-ed628e179006',code:'stackr_manual'}]);
 assert.deepEqual(envelope.candidateAssets,[],'Existing candidate asset needs fresh reuse/conflict review');
 assert.equal(prior.publishedLinks.length,2,'Expected one complete current link per set');assert.equal(prior.linkedAssets.length,2);
 assert.equal(authority.schemaVersion,'stackr-jp-crop-operational-approval-v1');assert.equal(authority.projectRef,PROJECT);
 assert.equal(authority.bucket,BUCKET);assert.equal(authority.approved,true);
 assert.equal(authority.scope.batch,'OWNER-SUPPLIED-JP-CROP-PR203');
 assert.deepEqual([...authority.scope.setIds].sort(),BATCH.map(x=>x.setId).sort());
 assert.deepEqual([...authority.scope.originalSha256s].sort(),BATCH.map(x=>x.sha256).sort());
 assert.equal(authority.scope.sourceWideAuthority,false);assert.equal(authority.scope.independentlyAuditedVendorLicence,false);
 assert.equal(authority.provenance.sourceSha256,SOURCE_JPEG);
 assert.ok(authority.provenance.ownerInstructions.length>0,'Standing owner instructions must be retained');
 for(const operation of ['immutable-upload','catalogue-supersession','api-verification'])assert.ok(authority.scope.operations.includes(operation));
 assert.equal(verification.bucket,BUCKET);assert.equal(verification.objects.length,8);
 assert.equal(new Set(verification.objects.map(o=>o.key)).size,8);assert.ok(Number.isFinite(Date.parse(verification.verifiedAt)));
 for(const object of manifest.objects) {
  const actual=verification.objects.find(o=>o.key===object.key);assert.ok(actual,'Missing object GET verification');
  assert.equal(actual.status,200);assert.equal(actual.deliveryUrl,object.plannedDeliveryUrl);
  for(const field of ['sha256','bytes','width','height','mimeType'])assert.equal(actual[field],object[field],`Verified ${field} differs`);
  assert.ok(typeof actual.cacheControl==='string'&&actual.cacheControl.length>0&&actual.cacheControl.length<=512
   &&/^[\x20-\x7e]+$/.test(actual.cacheControl)&&actual.cacheControl.trim()===actual.cacheControl,'Invalid observed cache-control');
 }
 for(const name of ['manifest','envelope','prior','verification','authority'])assert.match(evidence[name]?.sha256,/^[a-f0-9]{64}$/);
 const assets=[],newLinks=[];
 for(const item of BATCH) {
  const set=envelope.sets.find(s=>s.id===item.setId);assert.ok(set);assert.equal(set.language_code,'ja');assert.equal(set.game_code,'pokemon');
  assert.deepEqual(Object.keys(set).sort(),['id','game_code','language_code','set_code','provider_set_code','native_name','english_display_name','deprecated_at'].sort());
  assert.equal(set.set_code.toLowerCase(),item.code);assert.equal(set.provider_set_code.toLowerCase(),item.code);
  assert.equal(set.english_display_name,item.name);assert.equal(set.deprecated_at,null);
  const member=envelope.publishedMemberships.find(m=>m.set_id===item.setId);assert.equal(member?.language_code,'ja');
  assert.equal(member.catalogue_version_id,'1a23b7a7-c50e-4601-9180-a25c950d27ea');
  const oldLink=prior.publishedLinks.find(l=>l.set_id===item.setId);assert.ok(oldLink);
  assert.ok(Object.keys(oldLink).every(k=>[...linkFields,'created_at'].includes(k)),'Unexpected membership field requires review');
  assert.equal(oldLink.catalogue_version_id,member.catalogue_version_id);assert.equal(oldLink.language_code,'ja');
  assert.equal(oldLink.asset_type,'set_logo');assert.equal(oldLink.printing_id,null);assert.equal(oldLink.variant_id,null);
  const old=prior.linkedAssets.find(a=>a.id===oldLink.asset_id);assert.ok(old);assert.equal(old.set_id,item.setId);
  assert.equal(old.asset_type,'set_logo');assert.equal(old.content_sha256,OLD_HASHES[item.code]);
  assert.equal(old.permission_status,'approved');assert.equal(old.rights_status,'approved');assert.equal(old.publicly_servable,true);
  assert.equal(old.deleted_at,null);assert.equal(old.deprecated_at,null);assert.equal(old.retention_status,'active');
  const a=manifest.assets.find(a=>a.target.setId===item.setId).asset;
  assert.equal(a.content_sha256,item.sha256);assert.equal(a.asset_id,`reviewed:set-logo:${item.setId}:${item.sha256}`);
  assert.equal(a.original_source_url,sourceUrl(item));assert.equal(a.original_source_identifier,sourceIdentifier(item));
  const notes={schemaVersion:'stackr-two-japanese-reviewed-crop-supersession-v1',exactCrop:item,
   provenance:manifest.provenance,operationalAuthority:authority,previousImmutableAsset:old,previousMembership:oldLink,
   evidence,objectVerification:verification,cachePolicy:{desired:'public, max-age=31536000, immutable',
    basis:'Recorded actual public GET cache-control; storage metadata is not inferred'}};
  const asset={id:item.rowId,asset_id:a.asset_id,asset_type:'set_logo',game_code:'pokemon',set_id:item.setId,
   printing_id:null,variant_id:null,source_id:envelope.sources[0].id,url:a.url,storage_path:a.storage_key,
   mime_type:a.mime_type,width:a.width,height:a.height,sha256:item.sha256,content_sha256:item.sha256,
   perceptual_hash:a.perceptual_hash,byte_size:a.byte_size,rights_status:'approved',permission_status:'approved',
   publicly_servable:true,asset_visibility:'public_catalogue',storage_provider:'s3_compatible',storage_bucket:BUCKET,
   storage_key:a.storage_key,original_source_url:a.original_source_url,original_source_identifier:a.original_source_identifier,
   source_attribution:a.source_attribution,derivative_list:a.derivative_list.map(d=>({...d,cacheControl:verification.objects.find(o=>o.key===d.storageKey).cacheControl})),
   cache_control:verification.objects.find(o=>o.key===a.storage_key).cacheControl,externally_referenced:false,
   unavailable_reason:null,retention_status:'active',deleted_at:null,deprecated_at:null,
   acquisition_source:'existing_stackr_catalogue_asset',recognition_reference_eligible:false,licensing_review_notes:JSON.stringify(notes)};
  assets.push(asset);newLinks.push({...linkCore(oldLink),asset_id:item.rowId,created_at:verification.verifiedAt});
 }
 const requested=BATCH.map(i=>q(i.setId)+'::uuid').join(',');
 const read=fs.readFileSync(path.join(ROOT,'read-query-optimized.sql'),'utf8');
 assert.equal(sha(read),'434bbbc7837aeea3eb703b62d81bf98355421fabd5dab81af016add1545313ee','Effective-link guard query differs from the successfully captured query');
 const start=read.indexOf('with active_versions'),end=read.indexOf(',\n linked_assets as');
 assert.ok(start>=0&&end>start);
 const cte=read.slice(start,end);
 const completeRead=`${cte}\nselect coalesce(jsonb_agg(to_jsonb(l) order by l.set_id,l.catalogue_version_id,l.asset_id),'[]'::jsonb) into actual_links from links l;`;
 const locks=`set local lock_timeout='1s';\nset local statement_timeout='5s';\nlock table catalog.assets,catalog.catalogue_version_assets in share row exclusive mode;\nlock table catalog.sets,catalog.catalogue_versions,catalog.catalogue_version_sets,ingest.sources,catalog.card_variants,catalog.card_printings in share mode;`;
 const identityGuards=envelope.sets.map(s=>`if (select ${project('s',Object.keys(s))} from catalog.sets s where s.id=${q(s.id)}::uuid) is distinct from ${j(s)} then raise exception 'Exact Japanese set identity changed'; end if;`).join('\n');
 const guards=`${identityGuards}
 if not exists(select 1 from ingest.sources where id=${q(envelope.sources[0].id)}::uuid and code='stackr_manual') then raise exception 'Source changed'; end if;
 if (select coalesce(jsonb_agg(${project('s',['set_id','catalogue_version_id','language_code'])} order by s.set_id,s.catalogue_version_id),'[]'::jsonb) from api.catalogue_sets s where s.set_id in (${requested})) is distinct from ${j(sorted(envelope.publishedMemberships))} then raise exception 'Complete published memberships changed'; end if;
 if exists(select 1 from jsonb_array_elements(${j(prior.linkedAssets)}) old(item) where not exists(select 1 from catalog.assets a where a.id=(item->>'id')::uuid and to_jsonb(a)=to_jsonb(jsonb_populate_record(null::catalog.assets,item)))) then raise exception 'Previous immutable asset before-state changed'; end if;`;
 const candidateLanes=assets.map(a=>`(a.id=${q(a.id)}::uuid or a.asset_id=${q(a.asset_id)} or (a.storage_provider='s3_compatible' and a.storage_bucket=${q(BUCKET)} and a.storage_key=${q(a.storage_key)} and a.deleted_at is null) or (a.set_id=${q(a.set_id)}::uuid and a.content_sha256=${q(a.content_sha256)} and a.asset_type='set_logo' and a.deleted_at is null))`).join(' or ');
 const oldCore=sorted(prior.publishedLinks),newCore=sorted(newLinks);
 const assertNew=assets.map(a=>`if not exists(select 1 from catalog.assets a where a.id=${q(a.id)}::uuid and ${project('a',Object.keys(a))}=${j(a)}) then raise exception 'Replacement immutable asset metadata changed'; end if;`).join('\n');
 const inserts=assets.map(a=>{const fields=Object.keys(a);return `insert into catalog.assets (${fields.join(',')},last_verified_at) select ${fields.map(k=>'r.'+k).join(',')},${q(verification.verifiedAt)}::timestamptz from jsonb_populate_record(null::catalog.assets,${j(a)}) r;`;}).join('\n');
 const remove=rows=>`delete from catalog.catalogue_version_assets cva using jsonb_array_elements(${j(rows)}) wanted(item) where cva.catalogue_version_id=(item->>'catalogue_version_id')::uuid and cva.asset_id=(item->>'asset_id')::uuid;\nget diagnostics affected=row_count;\nif affected<>2 then raise exception 'Exact membership deletion count differs'; end if;`;
 const addNew=newLinks.map(l=>{const fields=[...linkFields,'created_at'];return `insert into catalog.catalogue_version_assets (${fields.join(',')}) select ${fields.map(k=>'r.'+k).join(',')} from jsonb_populate_record(null::catalog.catalogue_version_assets,${j(l)}) r;`;}).join('\n');
 const restore=prior.publishedLinks.map(l=>{const fields=Object.keys(l);return `insert into catalog.catalogue_version_assets (${fields.join(',')}) select ${fields.map(k=>'r.'+k).join(',')} from jsonb_populate_record(null::catalog.catalogue_version_assets,${j(l)}) r;`;}).join('\n');
 const receipt=operation=>`select jsonb_build_object('operation',${q(operation)},'batch','OWNER-SUPPLIED-JP-CROP-PR203','immutableAssetsAndObjectsRetained',true,'newAssets',(select jsonb_agg(to_jsonb(a) order by a.id) from catalog.assets a where a.id in (${assets.map(a=>q(a.id)+'::uuid').join(',')})),'newLinks',(select coalesce(jsonb_agg(to_jsonb(l) order by l.catalogue_version_id,l.asset_id),'[]'::jsonb) from catalog.catalogue_version_assets l where l.asset_id in (${assets.map(a=>q(a.id)+'::uuid').join(',')}))) as mutation_receipt;\ncommit;\n`;
 const publish=`-- Exact two-crop supersession. Eight externally verified R2 objects; preserve all previous assets/objects.\nbegin;\n${locks}\ndo $publish$ declare actual_links jsonb;affected bigint;begin\n${guards}\n${completeRead}\nif actual_links is distinct from ${membershipJson(oldCore)} then raise exception 'Complete effective logo links changed';end if;\nif exists(select 1 from catalog.assets a where ${candidateLanes}) then raise exception 'Replacement candidate before-state changed';end if;\n${inserts}\n${assertNew}\n${remove(oldCore)}\n${addNew}\n${completeRead}\nif actual_links is distinct from ${membershipJson(newCore)} then raise exception 'Published links differ';end if;\nend;$publish$;\n${receipt('publish')}`;
 const rollback=`-- Exact inverse membership swap only. Retain both old and new immutable assets/R2 objects.\nbegin;\n${locks}\ndo $rollback$ declare actual_links jsonb;affected bigint;begin\n${guards}\n${assertNew}\n${completeRead}\nif actual_links is distinct from ${membershipJson(newCore)} then raise exception 'Complete effective logo links changed; fresh rollback review required';end if;\n${remove(newCore)}\n${restore}\n${completeRead}\nif actual_links is distinct from ${membershipJson(oldCore)} then raise exception 'Restored links differ';end if;\nend;$rollback$;\n${receipt('rollback')}`;
 return {plan:{schemaVersion:'stackr-two-japanese-crops-publication-plan-v1',projectRef:PROJECT,assets,newLinks,prior,envelope,authority,verification,evidence,
  completeReadSha256:sha(read),effects:{insertAssets:2,replaceMemberships:2,deleteAssets:0,deleteObjects:0,sourceRightsChanges:0}},publish,rollback};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
 const [verificationPath,authorityPath,output]=process.argv.slice(2);assert.ok(verificationPath&&authorityPath&&output);
 const files={manifest:path.join(ROOT,'publication/object-manifest.json'),envelope:path.join(ROOT,'envelope.json'),prior:path.join(ROOT,'prior.json'),verification:path.resolve(verificationPath),authority:path.resolve(authorityPath)};
 const input={evidence:{}};
 for(const [key,file]of Object.entries(files)){const bytes=fs.readFileSync(file);input[key]=JSON.parse(bytes);input.evidence[key]={path:file,sha256:sha(bytes),bytes:bytes.length};}
 for(const o of input.manifest.objects){const b=fs.readFileSync(o.localPath);assert.equal(sha(b),o.sha256);assert.equal(b.length,o.bytes);}
 const result=buildPublication(input);fs.mkdirSync(output,{recursive:true});
 for(const [name,value]of [['publication-plan.json',JSON.stringify(result.plan,null,2)+'\n'],['publish.sql',result.publish],['rollback.sql',result.rollback]])fs.writeFileSync(path.join(output,name),value,{flag:'wx'});
 console.log(JSON.stringify({prepared:true,publishSha256:sha(result.publish),rollbackSha256:sha(result.rollback),effects:result.plan.effects}));
}
