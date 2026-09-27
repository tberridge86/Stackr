import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { check, digest, retryStorageRead, prepareApprovedBytes } from '../queue1-publish-20260927/publish.mjs';
import { resolveServerKey } from '../queue1-publish-20260927/credentials.mjs';

export const COHORT_SHA = '4a3f56695c97f2bed45f0ba30fc26e76a80c5a06c2976786b2b5b9afca4a967d';
export const APPROVAL_SHA = '8c68bf3499de1e1e340b00fc03e5f1b469de7b65d259b5fba5a8b4cd31119ca9';
export const APPROVAL_PATH = 'catalogue/rights-evidence/mep89-scrydex-owner-confirmation.2026-09-27.json';
export const SET = '36c13b17-0e5f-42aa-a7c9-9ff7acd71e01';
export const VERSION = 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8';
export const PROJECTS = { staging: 'lmwfhvexfcoyeuoyrlco', production: 'oakdbbzdqwurpjnoqhmu' };
export const PREFIX = 'queue1-mep89-front-20260927:';
export const BUCKET = 'stackr-catalogue-public';
export const SPECS = [['card-grid', 240, 82], ['search-result', 96, 78], ['detail-page', 720, 86]];
const SOURCE_NOTES = `Provenance only; automated acquisition inactive. Exactly 89 English MEP fronts approved by owner; ${APPROVAL_PATH}; ${APPROVAL_SHA}. No source-wide approval.`;
const publicUrl = key => `https://${PROJECTS.production}.supabase.co/storage/v1/object/public/${BUCKET}/${key}`;
const objectKey = (hash, role) => `public/card_image/${hash.slice(0,2)}/${hash.slice(2,4)}/${hash}/${role}.${role === 'original' ? 'png' : 'webp'}`;
export function assertConfig(env, execute) {
  check(execute && env.GITHUB_REF === 'refs/heads/main', 'Protected main execution only');
  check(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && env.GITHUB_SHA === env.STACKR_EXPECTED_MAIN_SHA, 'Exact main SHA required');
  check(env.STACKR_MEP89_CONFIRMATION === 'PUBLISH MEP89', 'Bounded publication confirmation required');
  for (const [kind, key] of [['staging', 'SUPABASE_STAGING_DB_URL'], ['production', 'SUPABASE_DB_URL']]) {
    const u = new URL(env[key]), project = PROJECTS[kind];
    check(['postgres:', 'postgresql:'].includes(u.protocol) && !u.search && !u.hash, 'Database override forbidden');
    check(u.hostname === `db.${project}.supabase.co` || (u.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(u.username) === `postgres.${project}`), 'Wrong database target');
  }
}
export function validateEvidence(bytes, approvalBytes) {
  check(digest(bytes) === COHORT_SHA && digest(approvalBytes) === APPROVAL_SHA, 'Frozen evidence changed');
  const rows = JSON.parse(bytes), approval = JSON.parse(approvalBytes);
  check(rows.length === 89 && new Set(rows.map(r => r.printing_id)).size === 89 && new Set(rows.map(r => r.image_sha256)).size === 89, 'Wrong cohort population');
  check(approval.sourceCode === 'scrydex' && approval.languageCode === 'en' && approval.targetCount === 89 && approval.cohortSha256 === COHORT_SHA && approval.sourceWideApproval === false, 'Approval scope mismatch');
  check(['store','resize','displayInStackr'].every(k => approval.capabilities[k] === true), 'Missing approved capability');
  for (const r of rows) {
    check(r.set_id === SET && r.language_code === 'en' && r.catalogue_version_id === VERSION && r.set_code === 'mep', 'Wrong frozen identity');
    const museum = r.collector_number === 'Museum';
    check(museum ? r.provider_id === 'mep-1000' && r.provider_name === 'Pikachu at the Museum' : /^0\d{2}$/.test(r.collector_number) && +r.collector_number >= 1 && +r.collector_number <= 88 && r.provider_id === `mep-${+r.collector_number}`, 'Provider identity mismatch');
    check(r.image_url === `https://images.scrydex.com/pokemon/${r.provider_id}/large` && /^[a-f0-9]{64}$/.test(r.image_sha256) && r.format === 'png', 'Unexpected source image');
    check(r.bytes > 0 && r.bytes < 10_000_000 && r.width > 0 && r.height > 0, 'Unexpected image size');
  }
  return rows;
}
export function bind(rows, cards) {
  check(cards.length === 89, 'Catalogue population drift');
  for (const r of rows) {
    const hits = cards.filter(c => c.printing_id === r.printing_id);
    check(hits.length === 1, 'Missing or ambiguous printing');
    const c = hits[0];
    check(c.game_code === 'pokemon' && !c.same_artwork_as_variant_id, 'Wrong game or existing artwork relation');
    for (const k of ['set_id','set_code','language_code','catalogue_version_id','printing_id','variant_id','collector_number','card_english_display_name','variant_code','finish_code']) check(c[k] === r[k], `Canonical identity drift: ${k}`);
  }
}
export async function validateBytes(sharp, bytes, o) {
  check(bytes.length === o.byteSize && digest(bytes) === o.sha256, 'Image bytes changed');
  const metadata = await sharp(bytes).metadata();
  check(metadata.format === (o.role === 'original' ? 'png' : 'webp'), 'Image format changed');
  const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  check(decoded.info.width === o.width && decoded.info.height === o.height, 'Decoded image dimensions changed');
}
export async function prepareImages(rows, sharp, read) {
  const plans = [];
  for (const r of rows) {
    const bytes = await read(r.image_url);
    const original = { role:'original', sha256:r.image_sha256, byteSize:r.bytes, width:r.width, height:r.height, mimeType:'image/png', key:objectKey(r.image_sha256,'original'), bytes };
    await validateBytes(sharp, bytes, original);
    const objects = [original];
    for (const [role, width, quality] of SPECS) {
      const result = await sharp(bytes).resize({ width, withoutEnlargement:true }).webp({ quality }).toBuffer({ resolveWithObject:true });
      const sha256 = digest(result.data);
      const o = { role, sha256, byteSize:result.data.length, width:result.info.width, height:result.info.height, mimeType:'image/webp', key:objectKey(sha256,role), bytes:result.data };
      await validateBytes(sharp, result.data, o); objects.push(o);
    }
    plans.push({ r, objects });
  }
  check(plans.flatMap(p => p.objects).length === 356, 'Wrong file population');
  return plans;
}
export function payload({ r, objects }, sourceId) {
  const o = objects.find(o => o.role === 'original');
  check(o && objects.length === 4 && new Set(objects.map(o => o.role)).size === 4, 'Incomplete derivative cohort');
  return {
    asset_id:`${PREFIX}${r.printing_id}:${r.image_sha256}`, asset_type:'card_image', game_code:'pokemon',
    set_id:SET, printing_id:r.printing_id, variant_id:null, source_id:sourceId,
    url:publicUrl(o.key), original_source_url:r.image_url, original_source_identifier:r.provider_id,
    storage_provider:'supabase_storage', storage_bucket:BUCKET, storage_key:o.key, storage_path:o.key,
    mime_type:o.mimeType, width:o.width, height:o.height, byte_size:o.byteSize, sha256:o.sha256, content_sha256:o.sha256,
    asset_visibility:'public_catalogue', publicly_servable:true, permission_status:'approved', rights_status:'approved',
    acquisition_source:'provider_url', recognition_reference_eligible:false, externally_referenced:false,
    retention_status:'active', cache_control:'public, max-age=31536000, immutable',
    derivative_list:objects.filter(o => o.role !== 'original').map(o => ({role:o.role,storageProvider:'supabase_storage',storageBucket:BUCKET,storageKey:o.key,mimeType:o.mimeType,width:o.width,height:o.height,byteSize:o.byteSize,sha256:o.sha256})),
    attribution_text:'Pokémon card artwork; image source: Scrydex.', source_attribution:'Scrydex',
    licensing_review_notes:JSON.stringify({ approval_path:APPROVAL_PATH, approval_sha256:APPROVAL_SHA, cohort_sha256:COHORT_SHA, source_page:r.source_url, source_page_sha256:r.source_page_sha256, owner_attestation:true, artwork_scope:'printing_front', exact_finish_verified:false, museum_jumbo_unnumbered:r.collector_number === 'Museum', recognition_approved:false }),
  };
}
export function assertSource(s) {
  check(s.code === 'scrydex' && s.source_type === 'image' && s.base_url === 'https://scrydex.com' && s.active === false && s.licence_status === 'under_review' && !s.deprecated_at && s.internal_notes === SOURCE_NOTES, 'Source provenance changed; global activation forbidden');
}
const CARDS = "select game_code,language_code,set_id,set_code,printing_id,collector_number,card_english_display_name,variant_id,variant_code,finish_code,same_artwork_as_variant_id,catalogue_version_id from api.catalogue_cards where set_id=$1 and language_code='en' limit 200";
export async function manifest(db, rows) {
  const ids = (await db.query(`select asset_id as id from catalog.catalogue_version_assets where catalogue_version_id=$1 and (set_id=$2 or printing_id=any($3::uuid[]) or variant_id=any($4::uuid[]))
    union select id from catalog.assets where set_id=$2 or printing_id=any($3::uuid[]) or variant_id=any($4::uuid[])`, [VERSION, SET, rows.map(r => r.printing_id),rows.map(r => r.variant_id)])).rows.map(a => a.id);
  if (!ids.length) return [];
  return (await db.query("select * from api.asset_manifest where asset_row_id=any($1::uuid[]) and catalogue_version_id=$2 and asset_type='card_image'",[ids,VERSION])).rows.filter(a => a.set_id === SET || rows.some(r => r.printing_id === a.printing_id));
}
export function validateManifest(rows, found, complete = false) {
  if (complete) check(found.length === 89 && new Set(found.map(a => a.printing_id)).size === 89, 'Incomplete public manifest');
  for (const a of found) {
    const r = rows.find(r => r.printing_id === a.printing_id);
    check(r && a.set_id === SET && a.variant_id === null && a.asset_id === `${PREFIX}${r.printing_id}:${r.image_sha256}` && a.content_sha256 === r.image_sha256, 'Existing artwork conflict');
  }
}
export async function writeMetadata(db, plans, receipt) {
  const rows = plans.map(p => p.r);
  const locked = await db.query("select id from catalog.catalogue_versions where id=$1 and status='published' and deprecated_at is null for share",[VERSION]);
  check(locked.rows.length === 1, 'Published version changed');
  bind(rows,(await db.query(CARDS,[SET])).rows);
  validateManifest(rows,await manifest(db,rows));
  const addedSource = await db.query("insert into ingest.sources(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values('scrydex','Scrydex','image','https://scrydex.com','under_review',true,false,$1) on conflict(code) do nothing returning id",[SOURCE_NOTES]);
  const source = (await db.query("select * from ingest.sources where code='scrydex' for share")).rows[0]; assertSource(source);
  receipt.provenance_sources_created = addedSource.rows.length;
  for (const plan of plans) {
    const p = payload(plan,source.id), keys = Object.keys(p);
    const values = keys.map(k => typeof p[k] === 'object' && p[k] !== null ? JSON.stringify(p[k]) : p[k]);
    const inserted = await db.query(`insert into catalog.assets(${keys.join(',')}) values(${keys.map((_,i) => '$'+(i+1)).join(',')}) on conflict do nothing returning id`,values);
    const a = (await db.query('select * from catalog.assets where asset_id=$1',[p.asset_id])).rows[0];
    check(a && !a.deleted_at && !a.deprecated_at && !a.unavailable_reason, 'Asset insertion conflict');
    a.byte_size = Number(a.byte_size);
    for (const k of keys) check(isDeepStrictEqual(a[k],p[k]), `Stored payload mismatch: ${k}`);
    receipt.assets.push({id:a.id,printing_id:plan.r.printing_id,created:inserted.rows.length === 1});
    const link = await db.query("insert into catalog.catalogue_version_assets(catalogue_version_id,language_code,set_id,printing_id,variant_id,asset_id,asset_type) values($1,'en',$2,$3,null,$4,'card_image') on conflict do nothing returning asset_id",[VERSION,SET,plan.r.printing_id,a.id]);
    receipt.links.push({asset_id:a.id,created:link.rows.length === 1});
  }
  const visible = await manifest(db, rows); validateManifest(rows,visible,true);
  for (const plan of plans) {
    const hit = visible.find(a => a.printing_id === plan.r.printing_id), p = payload(plan,source.id);
    check(hit.storage_key === p.storage_key && isDeepStrictEqual(hit.derivative_list,p.derivative_list), 'Public storage binding mismatch');
  }
}
export async function rehearse(db, plans) {
  const receipt = { assets:[],links:[] };
  await db.query('begin isolation level serializable');
  try {
    await db.query("set local statement_timeout='45s'"); await db.query("set local lock_timeout='5s'");
    await writeMetadata(db,plans,receipt);
  } finally { await db.query('rollback'); }
  return {status:'passed_and_rolled_back',tested_assets:receipt.assets.length,tested_links:receipt.links.length,provenance_sources:receipt.provenance_sources_created};
}
async function main() {
  assertConfig(process.env,process.argv.includes('--execute'));
  const rows = validateEvidence(await readFile(new URL('./cohort.json',import.meta.url)),await readFile(new URL('../../'+APPROVAL_PATH,import.meta.url)));
  const output = process.env.STACKR_MEP89_OUTPUT; check(output,'Receipt directory required'); await mkdir(output,{recursive:true});
  const journal = {status:'preflight',started_at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID,revision:process.env.GITHUB_SHA,cohort_sha256:COHORT_SHA,approval_sha256:APPROVAL_SHA,assets:[],links:[],objects:[],ownership_changes:0,device_verified:false};
  const save = () => writeFile(`${output}/receipt.json`,JSON.stringify(journal,null,2)); await save();
  const require = createRequire(new URL('../../backend/package.json',import.meta.url)), sharp = require('sharp');
  const { createVerifiedSupabasePostgresClient } = await import('../../scripts/deploy/verified-supabase-postgres.mjs');
  const read = url => retryStorageRead(async () => {
    const response = await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error(`Image read failed: ${response.status}`),{status:response.status}); }
    check(Number(response.headers.get('content-length') ?? 0) < 10_000_000,'Image response too large');
    const b = Buffer.from(await response.arrayBuffer()); check(b.length < 10_000_000,'Image response too large'); return b;
  });
  let db, connected = false, committed = false, commitAttempted = false;
  try {
    const plans = await prepareImages(rows,sharp,read), objects = plans.flatMap(p => p.objects);
    journal.prepared_images = 89; journal.prepared_objects = 356; await save();
    console.log(JSON.stringify({phase:'89_approved_originals_and_267_derivatives_verified'}));
    for (const [environment, connection] of [['staging',process.env.SUPABASE_STAGING_DB_URL],['production',process.env.SUPABASE_DB_URL]]) {
      db = createVerifiedSupabasePostgresClient(connection,`stackr-mep89-${environment}`,{connectionTimeoutMillis:15000});
      await db.connect(); connected = true;
      journal[`${environment}_rehearsal`] = await rehearse(db,plans); await save();
      console.log(JSON.stringify({phase:`${environment}_rehearsal_passed_and_rolled_back`}));
      if (environment === 'staging') { await db.end(); connected = false; }
    }
    const { createClient } = require('@supabase/supabase-js');
    const secret = await resolveServerKey({project:PROJECTS.production,configuredKey:process.env.SUPABASE_PRODUCTION_SECRET_KEY,accessToken:process.env.SUPABASE_ACCESS_TOKEN,mask:key => {if (process.env.GITHUB_ACTIONS === 'true') process.stdout.write(`::add-mask::${key}\n`);}});
    const client = createClient(`https://${PROJECTS.production}.supabase.co`,secret,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,opts) => fetch(u,{...opts,signal:AbortSignal.timeout(60000),redirect:'error'})}});
    const bucket = await client.storage.getBucket(BUCKET); check(!bucket.error && bucket.data?.public === true,'Wrong public bucket');
    const existing = (await db.query('select name from storage.objects where bucket_id=$1 and name=any($2::text[])',[BUCKET,objects.map(o => o.key)])).rows;
    await prepareApprovedBytes(objects,{existingKeys:new Set(existing.map(o => o.name)),readSource:o => o.bytes,readTarget:o => read(publicUrl(o.key)),validate:(bytes,o) => validateBytes(sharp,bytes,o)});
    for (let i = 0; i < objects.length; i += 3) {
      const results = await Promise.allSettled(objects.slice(i,i+3).map(async o => {
        const entry = {key:o.key,sha256:o.sha256,role:o.role,byte_size:o.byteSize,created:false,verified:false}; journal.objects.push(entry);
        if (!o.existingBytesVerified) {
          const response = await client.storage.from(BUCKET).upload(o.key,o.bytes,{contentType:o.mimeType,cacheControl:'31536000',upsert:false});
          if (response.error) check(Number(response.error.statusCode) === 409 || /already exists|duplicate/i.test(response.error.message),'Image upload failed');
          else entry.created = true;
          await validateBytes(sharp,await read(publicUrl(o.key)),o);
        }
        entry.verified = true; delete o.bytes;
      }));
      await save(); const failure = results.find(r => r.status === 'rejected'); if (failure) throw failure.reason;
      if (i % 60 === 0) console.log(JSON.stringify({phase:'public_objects_verified',count:journal.objects.filter(o => o.verified).length}));
    }
    await db.query('begin isolation level serializable'); await db.query("set local statement_timeout='45s'"); await db.query("set local lock_timeout='5s'");
    await db.query("select pg_advisory_xact_lock(hashtext('stackr-mep89-publication-20260927'))");
    await writeMetadata(db,plans,journal);
    journal.status = 'commit_intent'; await save(); commitAttempted = true; await db.query('commit'); committed = true;
    journal.published_at = new Date().toISOString(); journal.status = 'published'; await save();
    validateManifest(rows,await manifest(db,rows),true);
    for (let i = 0; i < objects.length; i += 3) {
      const results = await Promise.allSettled(objects.slice(i,i+3).map(async o => validateBytes(sharp,await read(publicUrl(o.key)),o)));
      const failure = results.find(r => r.status === 'rejected'); if (failure) throw failure.reason;
    }
    journal.publication_count = 89; journal.public_objects_verified = 356;
    journal.status = 'published_manifest_and_public_bytes_verified'; journal.verified_at = new Date().toISOString(); await save();
    console.log(JSON.stringify({status:journal.status,images:89,objects:356,device_verified:false}));
  } catch (e) {
    if (connected && !committed) await db.query('rollback').catch(() => {});
    journal.status = committed ? 'published_verification_failed' : commitAttempted ? 'commit_outcome_unknown' : 'failed_before_publication'; journal.error = e.message; await save(); throw e;
  } finally { if (connected) await db.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => {console.error(e.message);process.exitCode=1;});
