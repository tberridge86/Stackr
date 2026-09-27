import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { resolveServerKey } from './credentials.mjs';
import { setTimeout as delay } from 'node:timers/promises';

export const STAGING = 'lmwfhvexfcoyeuoyrlco';
export const PRODUCTION = 'oakdbbzdqwurpjnoqhmu';
export const REVIEW_BUCKET = 'stackr-catalogue-review';
export const PUBLIC_BUCKET = 'stackr-catalogue-public';
export const PREFIX = 'queue1-approved-20260927:';
export const COHORT_SHA = '69c2fdecbb43337fde90b6687996faaade168f6a561ce6b8cfa1dfa5ec2b1730';
export const APPROVAL_SHA = 'c4d95ec09b4678637a977aa4bdbc2ac242a5a49fc2bb7839e059388a91749ff1';
export const APPROVAL_PATH = 'catalogue/rights-evidence/queue1-english-pokemon-tcg-api-owner-confirmation.2026-09-27.json';
export const SCOPE = { 'sm3.5': 78, 'sm7.5': 78, 'swsh4.5sv': 122, 'swsh12.5gg': 70 };
export const STORAGE_CONCURRENCY = 3;
export async function retryStorageRead(read, wait = delay) {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); } catch (error) {
      const status = Number(error.status ?? error.statusCode);
      const transient = status === 429 || (status >= 500 && status <= 504)
        || /too many connections issued to the database|remaining connection slots|fetch failed|ECONNRESET/i.test(error.message);
      if (!transient || attempt >= 3) throw error;
      await wait(1000 * (2 ** attempt));
    }
  }
}
export const CARD_IDENTITY_SQL = "select game_code,language_code,set_id,set_code,printing_id,collector_number,card_english_display_name,variant_id,variant_code,finish_code,same_artwork_as_variant_id,catalogue_version_id from api.catalogue_cards where game_code='pokemon' and language_code='en' and set_code=any($1::text[]) limit 1000";
export function assertNoArtworkConflicts(plans, existingPublic) {
  const expected = new Map(plans.map(r => [r.target.printing_id, `${PREFIX}${r.target.printing_id}:${r.image_sha256}`]));
  for (const asset of existingPublic) check(expected.get(asset.printing_id) === asset.asset_id, 'Existing published artwork requires review');
}
export async function prepareApprovedBytes(objects, { existingKeys, readSource, readTarget, validate }) {
  for (let i = 0; i < objects.length; i += STORAGE_CONCURRENCY) {
    const outcomes = await Promise.allSettled(objects.slice(i, i + STORAGE_CONCURRENCY).map(async o => {
      const existing = existingKeys.has(o.key);
      const bytes = await (existing ? readTarget(o) : readSource(o));
      await validate(bytes, o);
      if (existing) o.existingBytesVerified = true;
      else o.bytes = bytes;
    }));
    const failed = outcomes.find(o => o.status === 'rejected'); if (failed) throw failed.reason;
  }
}
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function check(ok, message) { if (!ok) throw new Error(message); }
export function nameKey(value) { return String(value).normalize('NFKC').toLowerCase().replaceAll('’', "'").replace(/[‐‑–—-](ex|gx)\b/g, ' $1').replace(/\s+/g, ' ').trim(); }
export function assertConfig(env, execute) {
  check(execute === true, 'Explicit execution required');
  check(env.GITHUB_REF === 'refs/heads/main', 'Protected main only');
  check(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && env.GITHUB_SHA === env.STACKR_EXPECTED_MAIN_SHA, 'Exact main revision required');
  check(env.STACKR_QUEUE1_CONFIRMATION === 'PUBLISH QUEUE1', 'Publication confirmation required');
  check(env.SUPABASE_STAGING_URL === `https://${STAGING}.supabase.co` && env.SUPABASE_PRODUCTION_URL === `https://${PRODUCTION}.supabase.co`, 'Wrong project');
  for (const [project, connection] of [[STAGING, env.SUPABASE_STAGING_DB_URL], [PRODUCTION, env.SUPABASE_DB_URL]]) {
    const u = new URL(connection);
    check(['postgres:', 'postgresql:'].includes(u.protocol) && !u.search && !u.hash, 'Invalid database URL');
    check(u.hostname === `db.${project}.supabase.co` || (u.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(u.username) === `postgres.${project}`), 'Wrong catalogue database');
  }
}
export async function withCatalogueReaders(createClient, env, run) {
  const sourceDb = createClient(env.SUPABASE_STAGING_DB_URL, 'stackr-queue1-staging-read', { connectionTimeoutMillis: 15000 });
  const targetDb = createClient(env.SUPABASE_DB_URL, 'stackr-queue1-production-read', { connectionTimeoutMillis: 15000 });
  const connected = new Set();
  try {
    for (const db of [sourceDb, targetDb]) {
      await db.connect();
      connected.add(db);
      await db.query('begin read only');
      await db.query("set local statement_timeout='45s'");
    }
    return await run({ sourceDb, targetDb });
  } finally {
    await Promise.allSettled([sourceDb, targetDb].map(async db => {
      try { if (connected.has(db)) await db.query('rollback'); } finally { await db.end(); }
    }));
  }
}
export function validateEvidence(cohortBytes, approvalBytes) {
  check(digest(cohortBytes) === COHORT_SHA, 'Cohort bytes changed');
  check(digest(approvalBytes) === APPROVAL_SHA, 'Approval bytes changed');
  const rows = JSON.parse(cohortBytes), approval = JSON.parse(approvalBytes);
  check(rows.length === 348 && approval.cohortSha256 === COHORT_SHA && approval.targetCount === 348, 'Wrong approved cohort');
  check(approval.sourceCode === 'pokemon_tcg_api' && approval.languageCode === 'en' && approval.ownerStatement === 'YES', 'Wrong permission scope');
  check(['store', 'resize', 'displayInStackr'].every(k => approval.capabilities[k] === true), 'Missing approved capability');
  const keys = new Set(), hashes = new Set();
  for (const r of rows) {
    const key = `${r.set_code}:${r.collector_number}`;
    check(SCOPE[r.set_code] && r.language_code === 'en' && !keys.has(key) && !hashes.has(r.image_sha256), 'Duplicate or wrong identity');
    keys.add(key); hashes.add(r.image_sha256);
    check(r.objects.length === 4 && new Set(r.objects.map(o => o.role)).size === 4, 'Wrong derivative cohort');
    for (const o of r.objects) {
      const extension = o.role === 'original' ? 'png' : 'webp';
      check(/^[a-f0-9]{64}$/.test(o.sha256) && o.key === `private-review/card_image/${o.sha256.slice(0, 2)}/${o.sha256.slice(2, 4)}/${o.sha256}/${o.role}.${extension}`, 'Unexpected source object');
      check(o.role === 'original' ? o.sha256 === r.image_sha256 : ['card-grid', 'search-result', 'detail-page'].includes(o.role), 'Invalid image role');
    }
  }
  for (const [code, count] of Object.entries(SCOPE)) check(rows.filter(r => r.set_code === code).length === count, 'Set count changed');
  return rows;
}
export function bind(rows, cards, staging = false) {
  return rows.map(r => {
    const matches = cards.filter(p => p.set_code === r.set_code && p.collector_number === r.collector_number && p.language_code === 'en' && p.game_code === 'pokemon' && p.variant_code === r.variant_code && p.finish_code === r.finish_code);
    check(matches.length === 1, `Missing/ambiguous identity ${r.set_code}/${r.collector_number}`);
    const p = matches[0];
    check(nameKey(p.card_english_display_name) === nameKey(r.card_name), 'Card name mismatch');
    check(!p.same_artwork_as_variant_id, 'Existing artwork reference requires review');
    if (staging) check(p.set_id === r.staging_set_id && p.printing_id === r.staging_printing_id && p.variant_id === r.staging_variant_id, 'Staging identity drift');
    return { ...r, target: p };
  });
}
export function assertPrivateAsset(a, r, sourceId) {
  check(a && a.id === r.staging_asset_id && a.printing_id === r.staging_printing_id && a.set_id === r.staging_set_id && a.variant_id === null && a.source_id === sourceId, 'Private identity drift');
  check(a.content_sha256 === r.image_sha256 && a.storage_bucket === REVIEW_BUCKET && a.storage_provider === 'supabase_storage' && a.storage_key === r.objects[0].key, 'Private storage drift');
  check(!a.publicly_servable && a.permission_status === 'under_review' && a.rights_status === 'under_review' && !a.deleted_at && !a.deprecated_at && a.retention_status === 'active', 'Private policy drift');
  check(a.derivative_list.length === 3, 'Private derivatives missing');
  for (const d of a.derivative_list) {
    const o = r.objects.find(x => x.role === d.role);
    check(o && d.storageBucket === REVIEW_BUCKET && d.storageKey === o.key && d.sha256 === o.sha256 && d.width === o.width && d.height === o.height, 'Private derivative drift');
  }
}
export function publicPayload(r, sourceId, objects) {
  check(objects.length === 4 && new Set(objects.map(o => o.role)).size === 4, 'Incomplete public object cohort');
  for (const o of objects) {
    const extension = o.role === 'original' ? 'png' : 'webp';
    check(o.key === `public/card_image/${o.sha256.slice(0, 2)}/${o.sha256.slice(2, 4)}/${o.sha256}/${o.role}.${extension}`, 'Unexpected public object path');
  }
  const original = objects.find(o => o.role === 'original');
  return {
    asset_id: `${PREFIX}${r.target.printing_id}:${r.image_sha256}`, asset_type: 'card_image', game_code: 'pokemon',
    set_id: r.target.set_id, printing_id: r.target.printing_id, variant_id: null, source_id: sourceId,
    url: r.image_url, original_source_url: r.image_url, original_source_identifier: r.provider_card_id,
    storage_provider: 'supabase_storage', storage_bucket: PUBLIC_BUCKET, storage_key: original.key, storage_path: original.key,
    mime_type: original.mimeType, width: original.width, height: original.height, byte_size: original.byteSize,
    sha256: r.image_sha256, content_sha256: r.image_sha256, asset_visibility: 'public_catalogue', publicly_servable: true,
    permission_status: 'approved', rights_status: 'approved', acquisition_source: 'provider_url', recognition_reference_eligible: false,
    externally_referenced: false, retention_status: 'active', cache_control: 'public, max-age=31536000, immutable',
    derivative_list: objects.filter(o => o.role !== 'original').map(o => ({ role: o.role, storageProvider: 'supabase_storage', storageBucket: PUBLIC_BUCKET, storageKey: o.key, mimeType: o.mimeType, width: o.width, height: o.height, byteSize: o.byteSize, sha256: o.sha256 })),
    attribution_text: 'Pokémon card artwork; source: Pokémon TCG API / PokemonTCG datasets.', source_attribution: 'PokemonTCG/pokemon-tcg-data',
    licensing_review_notes: JSON.stringify({ approval_path: APPROVAL_PATH, approval_sha256: APPROVAL_SHA, cohort_sha256: COHORT_SHA, staging_run_id: 36304753186, staging_asset_id: r.staging_asset_id, artwork_scope: 'printing_front', exact_finish_verified: false, owner_attestation: true }),
  };
}
export function assertExistingAsset(a, payload) {
  for (const key of Object.keys(payload)) check(isDeepStrictEqual(a[key], payload[key]), `Existing asset conflict: ${key}`);
  check(!a.deleted_at && !a.deprecated_at && !a.unavailable_reason, 'Existing asset unavailable');
}

async function main() {
  assertConfig(process.env, process.argv.includes('--execute'));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const output = path.resolve(process.env.STACKR_QUEUE1_OUTPUT ?? 'queue1-publication-result');
  await mkdir(output, { recursive: true });
  const rows = validateEvidence(await readFile(new URL('./cohort.json', import.meta.url)), await readFile(path.join(root, APPROVAL_PATH)));
  const requireBackend = createRequire(path.join(root, 'backend/package.json'));
  const { createClient } = requireBackend('@supabase/supabase-js'), sharp = requireBackend('sharp');
  const { contentHashStorageKey } = await import('../../backend/lib/assetPipeline.js');
  const { createVerifiedSupabasePostgresClient } = await import('../../scripts/deploy/verified-supabase-postgres.mjs');
  const limitedFetch = (url, opts = {}) => fetch(url, { ...opts, signal: AbortSignal.timeout(60000) });
  const client = (project, secret) => { check(secret, 'Missing credential'); return createClient(`https://${project}.supabase.co`, secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: limitedFetch } }); };
  const serverKey = (project, configuredKey) => resolveServerKey({ project, configuredKey,
    accessToken: process.env.SUPABASE_ACCESS_TOKEN,
    mask: key => { if (process.env.GITHUB_ACTIONS === 'true') process.stdout.write(`::add-mask::${key}\n`); },
  });
  const source = client(STAGING, await serverKey(STAGING, process.env.SUPABASE_STAGING_SECRET_KEY));
  const target = client(PRODUCTION, await serverKey(PRODUCTION, process.env.SUPABASE_PRODUCTION_SECRET_KEY));
  const result = async promise => { const { data, error } = await promise; if (error) throw new Error(error.message); return data; };
  return withCatalogueReaders(createVerifiedSupabasePostgresClient, process.env, async ({ sourceDb, targetDb }) => {
  const cards = async db => (await db.query(CARD_IDENTITY_SQL, [Object.keys(SCOPE)])).rows;
  const sourceRecord = async db => { const records = (await db.query("select id,code,active,licence_status from ingest.sources where code='pokemon_tcg_api'")).rows; check(records.length === 1 && records[0].active && ['under_review', 'approved'].includes(records[0].licence_status), 'Source revoked or unavailable'); return records[0]; };
  const ss = await sourceRecord(sourceDb), ts = await sourceRecord(targetDb);
  const reviewBucket = await result(source.storage.getBucket(REVIEW_BUCKET)), publicBucket = await result(target.storage.getBucket(PUBLIC_BUCKET));
  check(reviewBucket.public === false && publicBucket.public === true, 'Bucket policy mismatch');
  bind(rows, await cards(sourceDb), true);
  const plans = bind(rows, await cards(targetDb));
  check(new Set(plans.map(r => r.target.printing_id)).size === 348, 'Duplicate target printing');
  const sourceAssets = (await sourceDb.query("select * from catalog.assets where asset_id like 'queue1-private-20260927:%' limit 500")).rows;
  check(sourceAssets.length === 348, 'Private asset cohort drift');
  for (const r of plans) assertPrivateAsset(sourceAssets.find(a => a.id === r.staging_asset_id), r, ss.id);
  const journal = { started_at: new Date().toISOString(), revision: process.env.GITHUB_SHA, run_id: process.env.GITHUB_RUN_ID, cohort_sha256: COHORT_SHA, approval_sha256: APPROVAL_SHA, status: 'preflight', objects: [], assets: [], links: [] };
  const save = () => writeFile(path.join(output, 'receipt.json'), JSON.stringify(journal, null, 2));
  await save();
  const printingIds = plans.map(r => r.target.printing_id);
  const publicAssets = async db => (await db.query("select printing_id,asset_id from api.asset_manifest where printing_id=any($1::uuid[]) and asset_type='card_image'", [printingIds])).rows;
  assertNoArtworkConflicts(plans, await publicAssets(targetDb));
  const existingAssets = (await targetDb.query('select * from catalog.assets where asset_id=any($1::text[])', [plans.map(r => `${PREFIX}${r.target.printing_id}:${r.image_sha256}`)])).rows;
  // Validate the entire batch before the first write, including any resume conflicts.
  const prepared = [];
  for (const r of plans) {
    const objects = r.objects.map(o => ({ ...o, key: contentHashStorageKey({ visibility: 'public', assetType: 'card_image', sha256: o.sha256, role: o.role, extension: o.role === 'original' ? 'png' : 'webp' }), sourceKey: o.key }));
    const payload = publicPayload(r, ts.id, objects);
    const existing = existingAssets.find(a => a.asset_id === payload.asset_id);
    if (existing) { existing.byte_size = Number(existing.byte_size); assertExistingAsset(existing, payload); }
    prepared.push({ r, objects, payload });
  }
  // Reuse existing production bytes only after rechecking the frozen hash and decode.
  // Missing objects still come from private staging; never fetch the original provider.
  async function validateBytes(bytes, o) {
    check(bytes.length === o.byteSize && digest(bytes) === o.sha256, 'Image bytes changed');
    const info = await sharp(bytes).metadata();
    check(info.width === o.width && info.height === o.height && info.format === (o.role === 'original' ? 'png' : 'webp'), 'Image decode/dimensions changed');
  }
  const allObjects = prepared.flatMap(p => p.objects);
  const existingObjects = (await targetDb.query('select name from storage.objects where bucket_id=$1 and name=any($2::text[])', [PUBLIC_BUCKET, allObjects.map(o => o.key)])).rows;
  const readBytes = (storage, key) => retryStorageRead(async () => Buffer.from(await (await result(storage.download(key))).arrayBuffer()));
  await prepareApprovedBytes(allObjects, {
    existingKeys: new Set(existingObjects.map(o => o.name)),
    readSource: o => readBytes(source.storage.from(REVIEW_BUCKET), o.sourceKey),
    readTarget: o => readBytes(target.storage.from(PUBLIC_BUCKET), o.key), validate: validateBytes,
  });
  journal.status = 'all_approved_bytes_verified'; await save();
  console.log(JSON.stringify({ phase: journal.status, images: 348, objects: allObjects.length }));
  let db, committed = false, commitAttempted = false;
  try {
    for (let i = 0; i < allObjects.length; i += STORAGE_CONCURRENCY) {
      const outcomes = await Promise.allSettled(allObjects.slice(i, i + STORAGE_CONCURRENCY).map(async o => {
        const entry = { key: o.key, sha256: o.sha256, role: o.role, created: false, verified: false }; journal.objects.push(entry);
        if (o.existingBytesVerified) { entry.verified = true; return; }
        const uploaded = await target.storage.from(PUBLIC_BUCKET).upload(o.key, o.bytes, { contentType: o.mimeType, cacheControl: '31536000', upsert: false });
        if (uploaded.error) check(Number(uploaded.error.statusCode) === 409 || /already exists|duplicate/i.test(uploaded.error.message), 'Upload failed'); else entry.created = true;
        const blob = await result(target.storage.from(PUBLIC_BUCKET).download(o.key));
        await validateBytes(Buffer.from(await blob.arrayBuffer()), o); entry.verified = true; delete o.bytes;
      }));
      await save(); const failed = outcomes.find(o => o.status === 'rejected'); if (failed) throw failed.reason;
      if (i % 120 === 0) console.log(JSON.stringify({ phase: 'storage_verified', objects: Math.min(i + STORAGE_CONCURRENCY, allObjects.length) }));
    }
    check(isDeepStrictEqual(await sourceRecord(sourceDb), ss) && isDeepStrictEqual(await sourceRecord(targetDb), ts), 'Source changed during transfer');
    db = createVerifiedSupabasePostgresClient(process.env.SUPABASE_DB_URL, 'stackr-queue1-publication', { connectionTimeoutMillis: 15000 });
    await db.connect(); await db.query('begin isolation level serializable');
    await db.query("set local lock_timeout='5s'"); await db.query("set local statement_timeout='45s'");
    await db.query("select pg_advisory_xact_lock(hashtext('stackr-queue1-publication-20260927'))");
    const versions = [...new Set(plans.map(p => p.target.catalogue_version_id))];
    const locked = await db.query("select id from catalog.catalogue_versions where id=any($1::uuid[]) and status='published' and deprecated_at is null for share", [versions]);
    check(locked.rows.length === versions.length, 'Publication version changed');
    const current = await db.query(CARD_IDENTITY_SQL, [Object.keys(SCOPE)]);
    const rebound = bind(rows, current.rows);
    for (let i = 0; i < plans.length; i++) for (const k of ['set_id', 'printing_id', 'variant_id', 'catalogue_version_id']) check(plans[i].target[k] === rebound[i].target[k], 'Production identity/version drift');
    const lockedSource = (await db.query('select id,code,active,licence_status from ingest.sources where id=$1 for share', [ts.id])).rows[0];
    check(isDeepStrictEqual(lockedSource, ts), 'Production source drift');
    assertNoArtworkConflicts(plans, await publicAssets(db));
    for (const { r, payload } of prepared) {
      const keys = Object.keys(payload);
      const values = keys.map(k => typeof payload[k] === 'object' && payload[k] !== null ? JSON.stringify(payload[k]) : payload[k]);
      const inserted = await db.query(`insert into catalog.assets (${keys.join(',')}) values (${keys.map((_, i) => '$' + (i + 1)).join(',')}) on conflict do nothing returning id`, values);
      const stored = (await db.query('select * from catalog.assets where asset_id=$1', [payload.asset_id])).rows[0];
      check(stored, 'Asset insert conflict');
      // pg returns bigint as text, while PostgREST returns it as a number.
      stored.byte_size = Number(stored.byte_size); assertExistingAsset(stored, payload);
      journal.assets.push({ id: stored.id, asset_id: stored.asset_id, printing_id: r.target.printing_id, created: inserted.rows.length === 1 });
      const link = await db.query('insert into catalog.catalogue_version_assets (catalogue_version_id,language_code,set_id,printing_id,variant_id,asset_id,asset_type) values ($1,$2,$3,$4,null,$5,$6) on conflict do nothing returning asset_id', [r.target.catalogue_version_id, 'en', r.target.set_id, r.target.printing_id, stored.id, 'card_image']);
      journal.links.push({ catalogue_version_id: r.target.catalogue_version_id, asset_id: stored.id, created: link.rows.length === 1 });
    }
    const verify = await db.query('select count(distinct printing_id)::int as count from api.asset_manifest where asset_row_id=any($1::uuid[])', [journal.assets.map(a => a.id)]);
    check(verify.rows[0].count === 348, 'Manifest publication incomplete');
    journal.status = 'commit_intent'; await save();
    commitAttempted = true; await db.query('commit'); committed = true; journal.status = 'published'; journal.published_at = new Date().toISOString(); await save();
    const published = (await targetDb.query('select asset_row_id,printing_id,content_sha256,derivative_list from api.asset_manifest where asset_id like $1 limit 500', [`${PREFIX}%`])).rows;
    check(published.length === 348, 'Post-commit manifest count mismatch');
    for (const { r, payload } of prepared) {
      const hit = published.filter(p => p.printing_id === r.target.printing_id && p.content_sha256 === r.image_sha256);
      check(hit.length === 1 && isDeepStrictEqual(hit[0].derivative_list, payload.derivative_list), 'Post-commit manifest mismatch');
    }
    // Verify anonymous public delivery of each derivative, not just HTTP success.
    for (let i = 0; i < allObjects.length; i += STORAGE_CONCURRENCY) {
      const outcomes = await Promise.allSettled(allObjects.slice(i, i + STORAGE_CONCURRENCY).map(async o => {
        const response = await retryStorageRead(async () => {
          const fetched = await limitedFetch(`https://${PRODUCTION}.supabase.co/storage/v1/object/public/${PUBLIC_BUCKET}/${o.key}`);
          if (!fetched.ok) {
            await fetched.body?.cancel();
            throw Object.assign(new Error('Public storage response failed'), { status: fetched.status });
          }
          return fetched;
        });
        check(response.ok, 'Public image delivery failed'); await validateBytes(Buffer.from(await response.arrayBuffer()), o);
      }));
      const failed = outcomes.find(o => o.status === 'rejected'); if (failed) throw failed.reason;
    }
    journal.status = 'published_manifest_and_public_bytes_verified'; journal.verified_at = new Date().toISOString(); journal.publication_count = 348; journal.public_objects_verified = 1392; journal.device_verified = false;
    await save(); console.log(JSON.stringify({ status: journal.status, count: 348, objects: 1392, device_verified: false }));
  } catch (error) {
    if (db && !committed) await db.query('rollback').catch(() => {});
    journal.status = committed ? 'published_verification_failed' : commitAttempted ? 'commit_outcome_unknown_reconcile_before_rollback' : 'failed_before_publication'; journal.error = error.message; await save(); throw error;
  } finally { if (db) await db.end(); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
