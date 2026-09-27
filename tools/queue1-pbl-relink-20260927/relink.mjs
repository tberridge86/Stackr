import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { retryStorageRead, prepareApprovedBytes } from '../queue1-publish-20260927/publish.mjs';
import { resolveServerKey } from '../queue1-publish-20260927/credentials.mjs';

export const HASH = '027856dca58ceedb3783b4f48b0c13dd25eb1f55cb3d6fe3bfa593ce6dbfbb33';
export const SOURCE_SET = 'd6d58c17-5923-496e-94ef-5819f34ae10c';
export const TARGET_SET = '2f77da8e-8199-4634-b30d-385565560731';
export const VERSION = 'd6bdab54-ec11-4b54-85a9-311d6ce3b2c8';
export const PREFIX = 'queue1-pbl-front-20260927:';
export const PROJECTS = { staging: 'lmwfhvexfcoyeuoyrlco', production: 'oakdbbzdqwurpjnoqhmu' };
export const BUCKET = 'stackr-catalogue-public';
export const publicUrl = key => `https://${PROJECTS.production}.supabase.co/storage/v1/object/public/${BUCKET}/${key}`;
export function copyKey(r) {
  check(/^[a-f0-9-]{36}$/.test(r.duplicate_printing_id) && /^[a-f0-9]{64}$/.test(r.sha256), 'Invalid copy identity');
  check(r.storage_key === `public/card_image/${r.sha256.slice(0,2)}/${r.sha256.slice(2,4)}/${r.sha256}/original.jpg`, 'Unexpected original object layout');
  return r.storage_key.replace('/original.jpg', `/pbl-${r.duplicate_printing_id}-original.jpg`);
}
export const digest = b => createHash('sha256').update(b).digest('hex');
export function check(ok, message) { if (!ok) throw new Error(message); }
export function assertConfig(env, execute) {
  check(execute && env.GITHUB_REF === 'refs/heads/main', 'Protected main execution only');
  check(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && env.GITHUB_SHA === env.STACKR_EXPECTED_MAIN_SHA, 'Exact main SHA required');
  check(env.STACKR_PBL_CONFIRMATION === 'RELINK PBL', 'Relink confirmation required');
  for (const [kind, key] of [['staging', 'SUPABASE_STAGING_DB_URL'], ['production', 'SUPABASE_DB_URL']]) {
    const u = new URL(env[key]); const ref = PROJECTS[kind];
    check(['postgres:', 'postgresql:'].includes(u.protocol) && !u.search && !u.hash, 'Database override forbidden');
    check(u.hostname === `db.${ref}.supabase.co` || (u.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(u.username) === `postgres.${ref}`), 'Wrong database target');
  }
}
export function validateCohort(bytes) {
  check(digest(bytes) === HASH, 'Frozen cohort changed');
  const rows = JSON.parse(bytes);
  check(rows.length === 120 && new Set(rows.map(r => r.duplicate_printing_id)).size === 120 && new Set(rows.map(r => r.canonical_printing_id)).size === 120, 'Wrong cohort population');
  return rows;
}
export function validateProviderFront(r, d) {
  const number = String(r.collector_number).padStart(3, '0');
  check(d?.id === `me05-${number}` && d.localId === number && d.name === r.name && d.set?.id === 'me05'
    && d.image === `https://assets.tcgdex.net/en/me/me05/${number}`, 'Current provider printing-front descriptor mismatch');
}
export function validatePair(r, cards, source, front) {
  validateProviderFront(r, front);
  const target = cards.filter(c => c.printing_id === r.duplicate_printing_id);
  const canonical = cards.filter(c => c.printing_id === r.canonical_printing_id);
  check(target.length === 1 && canonical.length >= 1, 'Printing binding missing/ambiguous');
  const t = target[0];
  for (const c of [...target, ...canonical]) {
    check(c.game_code === 'pokemon' && c.language_code === 'en' && c.catalogue_version_id === VERSION, 'Language/game/version mismatch');
    check(String(c.collector_number).replace(/^0+/, '') === String(r.collector_number).replace(/^0+/, '') && c.card_english_display_name === r.name, 'Collector/name mismatch');
  }
  check(t.set_id === TARGET_SET && t.set_code === 'PBL' && t.variant_code === 'normal' && t.finish_code === null, 'Target variant changed');
  check(canonical.every(c => c.set_id === SOURCE_SET && c.set_code === 'me05'), 'Canonical set changed');
  check(source && source.asset_id === r.source_asset_id && source.content_sha256 === r.sha256 && source.storage_key === r.storage_key, 'Source bytes/binding changed');
  const v = canonical.find(c => c.variant_id === source.variant_id);
  check(v && ['normal', 'holo', 'reverse_holo'].includes(v.variant_code) && v.variant_code === v.finish_code, 'Stamped/unknown source variant forbidden');
  check(source.permission_status === 'approved' && source.rights_status === 'approved' && source.publicly_servable === true && source.asset_visibility === 'public_catalogue' && source.retention_status === 'active' && !source.deprecated_at, 'Source no longer eligible');
  check(source.asset_type === 'card_image' && source.storage_provider === 'supabase_storage' && source.storage_bucket === 'stackr-catalogue-public', 'Wrong source storage/type');
  check(isDeepStrictEqual(source.derivative_list, r.derivative_list), 'Source renditions changed');
  const u = new URL(source.original_source_url);
  check(u.origin === 'https://assets.tcgdex.net' && !u.search && !u.hash && u.pathname === `/en/me/me05/${String(r.collector_number).padStart(3, '0')}/high.webp`, 'Source language/printing path mismatch');
  check(source.original_source_url === `${front.image}/high.webp`, 'Asset is not the independently verified generic provider front');
  return t;
}
export function relinkPayload(r, source) {
  const key = copyKey(r);
  return { ...source, id: randomUUID(), asset_id: `${PREFIX}${r.duplicate_printing_id}:${r.sha256}`,
    set_id: TARGET_SET, printing_id: r.duplicate_printing_id, variant_id: null,
    storage_key: key, storage_path: key, archival_storage_key: key, url: publicUrl(key),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    recognition_reference_eligible: false,
    licensing_review_notes: JSON.stringify({ purpose: 'Copy an existing eligible public original for a documented duplicate printing and reuse its derivatives; no new source permission or finish claim', sourceAssetId: source.id, sourcePrintingId: r.canonical_printing_id, cohortSha256: HASH, currentProviderFrontVerified: true, sourceVariantId: source.variant_id, exactFinishVerified: false, artworkScope: 'printing_front' }),
  };
}
export function samePayload(actual, expected) {
  return Object.keys(expected).filter(k => !['id', 'created_at', 'updated_at'].includes(k)).every(k =>
    k === 'byte_size' ? Number(actual[k]) === Number(expected[k]) : isDeepStrictEqual(actual[k], expected[k]));
}
export function validatePublicSources(rows, manifest) {
  check(manifest.length === rows.length, 'Current canonical public manifest is incomplete');
  for (const r of rows) {
    const hits = manifest.filter(a => a.asset_id === r.source_asset_id && a.printing_id === r.canonical_printing_id);
    check(hits.length === 1 && hits[0].set_id === SOURCE_SET && hits[0].content_sha256 === r.sha256 && isDeepStrictEqual(hits[0].derivative_list, r.derivative_list), 'Current public source changed or was withdrawn');
  }
}
const CARDS = "select game_code,language_code,set_id,set_code,printing_id,collector_number,card_english_display_name,variant_id,variant_code,finish_code,catalogue_version_id from api.catalogue_cards where set_id=any($1::uuid[]) and language_code='en' limit 500";
const MANIFEST = "select asset_id,set_id,printing_id,content_sha256,storage_key,derivative_list from api.asset_manifest where asset_row_id=any($1::uuid[]) and catalogue_version_id=$2 and asset_type='card_image'";
export async function targetManifest(db, rows, cards) {
  const printingIds = rows.map(r => r.duplicate_printing_id);
  const variantIds = cards.filter(c => c.set_id === TARGET_SET).map(c => c.variant_id);
  // Resolve every possible direct/inherited target binding using base-table IDs,
  // then push a bounded primary-key filter into the public view.
  const candidates = (await db.query(`select asset_id as id from catalog.catalogue_version_assets
    where catalogue_version_id=$1 and (set_id=$2 or printing_id=any($3::uuid[]) or variant_id=any($4::uuid[]))
    union select id from catalog.assets where set_id=$2 or printing_id=any($3::uuid[]) or variant_id=any($4::uuid[])`,
  [VERSION, TARGET_SET, printingIds, variantIds])).rows.map(r => r.id);
  if (!candidates.length) return [];
  return (await db.query(MANIFEST, [candidates, VERSION])).rows.filter(a => a.set_id === TARGET_SET || printingIds.includes(a.printing_id));
}
async function readState(db, rows, fronts) {
  const cards = (await db.query(CARDS, [[SOURCE_SET, TARGET_SET]])).rows.sort((a,b) => a.variant_id.localeCompare(b.variant_id));
  check(cards.length === 314, 'Catalogue population drift');
  const sources = (await db.query('select * from catalog.assets where asset_id=any($1::text[])', [rows.map(r => r.source_asset_id)])).rows.sort((a,b) => a.asset_id.localeCompare(b.asset_id));
  check(sources.length === 120, 'Source asset population drift');
  const sourceIds = [...new Set(sources.map(s => s.source_id))];
  check(sourceIds.length === 1, 'Mixed source provenance');
  const source = (await db.query('select id,code,licence_status,active from ingest.sources where id=$1', sourceIds)).rows[0];
  check(source?.code === 'tcgdex' && source.active === true && source.licence_status === 'approved', 'Existing source is not eligible');
  for (const r of rows) validatePair(r, cards, sources.find(s => s.asset_id === r.source_asset_id), fronts.find(f => f.localId === String(r.collector_number).padStart(3, '0')));
  validatePublicSources(rows, (await db.query(MANIFEST, [sources.map(s => s.id), VERSION])).rows);
  const published = await targetManifest(db, rows, cards);
  for (const a of published) {
    const r = rows.find(r => r.duplicate_printing_id === a.printing_id);
    check(r && a.set_id === TARGET_SET && a.asset_id === `${PREFIX}${r.duplicate_printing_id}:${r.sha256}` && a.content_sha256 === r.sha256 && a.storage_key === copyKey(r) && isDeepStrictEqual(a.derivative_list, r.derivative_list), 'Existing target artwork conflict');
  }
  return { cards, sources, source };
}
async function verifyFiles(rows, sources, sharp, copied = false) {
  const objects = [];
  for (const r of rows) {
    const a = sources.find(s => s.asset_id === r.source_asset_id);
    objects.push({ key: copied ? copyKey(r) : a.storage_key, sha: a.content_sha256, bytes: Number(a.byte_size), width: a.width, height: a.height });
    for (const d of a.derivative_list) {
      check(d.storageBucket === 'stackr-catalogue-public' && d.storageProvider === 'supabase_storage', 'Wrong derivative storage');
      objects.push({ key: d.storageKey, sha: d.contentSha256, bytes: d.byteSize, width: d.width, height: d.height });
    }
  }
  check(objects.length === 480, 'Expected four existing files per printing');
  for (let i = 0; i < objects.length; i += 3) {
    const results = await Promise.allSettled(objects.slice(i, i + 3).map(async o => {
      check(/^[a-f0-9]{64}$/.test(o.sha) && o.key.includes(o.sha) && !o.key.includes('..'), 'Invalid stored content path');
      const data = await retryStorageRead(async () => {
        const response = await fetch(publicUrl(o.key), { signal: AbortSignal.timeout(30000), redirect: 'error' });
        if (!response.ok) { const e = new Error('Public storage read failed'); e.status = response.status; throw e; }
        return Buffer.from(await response.arrayBuffer());
      });
      check(digest(data) === o.sha && data.length === o.bytes, 'Public file hash/size mismatch');
      const decoded = await sharp(data).raw().toBuffer({ resolveWithObject: true });
      check(decoded.info.width === o.width && decoded.info.height === o.height, 'Public image dimensions mismatch');
    }));
    const failure = results.find(r => r.status === 'rejected'); if (failure) throw failure.reason;
  }
  return objects.length;
}
export function copyObjects(rows, sources) {
  return rows.map(r => {
    const a = sources.find(s => s.asset_id === r.source_asset_id);
    check(a && a.content_sha256 === r.sha256 && a.storage_key === r.storage_key, 'Copy source mismatch');
    return { sourceKey: a.storage_key, key: copyKey(r), sha256: a.content_sha256, byteSize: Number(a.byte_size), width: a.width, height: a.height, mimeType: a.mime_type };
  });
}
async function copyOriginals(rows, sources, db, sharp, require, journal, save) {
  const { createClient } = require('@supabase/supabase-js');
  const secret = await resolveServerKey({ project: PROJECTS.production, configuredKey: process.env.SUPABASE_PRODUCTION_SECRET_KEY, accessToken: process.env.SUPABASE_ACCESS_TOKEN,
    mask: key => { if (process.env.GITHUB_ACTIONS === 'true') process.stdout.write(`::add-mask::${key}\n`); } });
  const client = createClient(`https://${PROJECTS.production}.supabase.co`, secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(60000), redirect: 'error' }) } });
  const bucket = await client.storage.getBucket(BUCKET); check(!bucket.error && bucket.data?.public === true, 'Public bucket unavailable');
  const objects = copyObjects(rows, sources);
  check(objects.length === 120 && new Set(objects.map(o => o.key)).size === 120, 'Wrong original copy population');
  const existing = (await db.query('select name from storage.objects where bucket_id=$1 and name=any($2::text[])', [BUCKET, objects.map(o => o.key)])).rows;
  const read = key => retryStorageRead(async () => {
    const response = await fetch(publicUrl(key), { signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('Public original read failed'), { status: response.status }); }
    return Buffer.from(await response.arrayBuffer());
  });
  const validate = async (bytes, o) => {
    check(digest(bytes) === o.sha256 && bytes.length === o.byteSize, 'Original copy bytes changed');
    const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    check(decoded.info.width === o.width && decoded.info.height === o.height, 'Original copy dimensions changed');
  };
  await prepareApprovedBytes(objects, { existingKeys: new Set(existing.map(o => o.name)), readSource: o => read(o.sourceKey), readTarget: o => read(o.key), validate });
  journal.storage_objects = [];
  for (let i = 0; i < objects.length; i += 3) {
    const results = await Promise.allSettled(objects.slice(i, i + 3).map(async o => {
      const entry = { key: o.key, sha256: o.sha256, created: false, verified: false }; journal.storage_objects.push(entry);
      if (!o.existingBytesVerified) {
        const uploaded = await client.storage.from(BUCKET).upload(o.key, o.bytes, { contentType: o.mimeType, cacheControl: '31536000', upsert: false });
        if (uploaded.error) check(Number(uploaded.error.statusCode) === 409 || /already exists|duplicate/i.test(uploaded.error.message), 'Original copy upload failed');
        else entry.created = true;
        await validate(await read(o.key), o);
      }
      entry.verified = true; delete o.bytes;
    }));
    journal.storage_objects_created = journal.storage_objects.filter(o => o.created).length; await save();
    const failed = results.find(r => r.status === 'rejected'); if (failed) throw failed.reason;
  }
  journal.original_copies_verified = 120; await save();
}
async function insertLinks(db, rows, state, journal) {
  await db.query("select id from catalog.catalogue_versions where id=$1 and status='published' and deprecated_at is null for share", [VERSION]).then(r => check(r.rows.length === 1, 'Published version changed'));
  await db.query('select id from catalog.assets where asset_id=any($1::text[]) for share', [rows.map(r => r.source_asset_id)]);
  await db.query('select id from ingest.sources where id=$1 for share', [state.source.id]);
  for (const r of rows) {
    const payload = relinkPayload(r, state.sources.find(s => s.asset_id === r.source_asset_id));
    const inserted = await db.query('insert into catalog.assets select (jsonb_populate_record(null::catalog.assets,$1::jsonb)).* on conflict do nothing returning id', [JSON.stringify(payload)]);
    const stored = (await db.query('select * from catalog.assets where asset_id=$1', [payload.asset_id])).rows;
    check(stored.length === 1, 'Target asset insert conflicted with a database constraint');
    check(samePayload(stored[0], payload), 'Existing target asset differs');
    if (inserted.rows.length) journal.assets_created.push(stored[0].id);
    const linked = await db.query("insert into catalog.catalogue_version_assets(catalogue_version_id,language_code,set_id,printing_id,variant_id,asset_id,asset_type) values($1,'en',$2,$3,null,$4,'card_image') on conflict do nothing returning asset_id", [VERSION, TARGET_SET, r.duplicate_printing_id, stored[0].id]);
    if (linked.rows.length) journal.links_created.push(stored[0].id);
  }
  const result = await targetManifest(db, rows, state.cards);
  check(result.length === 120 && new Set(result.map(r => r.printing_id)).size === 120, 'Target manifest is incomplete');
  for (const r of rows) {
    const hits = result.filter(a => a.printing_id === r.duplicate_printing_id);
    check(hits.length === 1 && hits[0].set_id === TARGET_SET && hits[0].asset_id === `${PREFIX}${r.duplicate_printing_id}:${r.sha256}` && hits[0].content_sha256 === r.sha256 && hits[0].storage_key === copyKey(r) && isDeepStrictEqual(hits[0].derivative_list, r.derivative_list), 'Target manifest identity changed');
  }
}
async function main() {
  assertConfig(process.env, process.argv.includes('--execute'));
  const rows = validateCohort(await readFile(new URL('./cohort.json', import.meta.url)));
  const { createVerifiedSupabasePostgresClient } = await import('../../scripts/deploy/verified-supabase-postgres.mjs');
  const require = createRequire(new URL('../../backend/package.json', import.meta.url)); const sharp = require('sharp');
  const output = process.env.STACKR_PBL_OUTPUT; check(output, 'Receipt directory required'); await mkdir(output, { recursive: true });
  const journal = { status: 'preflight', run_id: process.env.GITHUB_RUN_ID, revision: process.env.GITHUB_SHA, cohort_sha256: HASH, started_at: new Date().toISOString(), assets_created: [], links_created: [], storage_objects_created: 0, ownership_changes: 0, device_verified: false };
  const save = () => writeFile(`${output}/receipt.json`, JSON.stringify(journal, null, 2)); await save();
  let db; let connected = false; let committed = false; let commitAttempted = false;
  try {
    const fronts = [];
    for (let i = 0; i < rows.length; i += 3) {
      const results = await Promise.allSettled(rows.slice(i, i + 3).map(async r => {
        const number = String(r.collector_number).padStart(3, '0');
        const d = await retryStorageRead(async () => {
          const response = await fetch(`https://api.tcgdex.net/v2/en/cards/me05-${number}`, { signal: AbortSignal.timeout(30000), redirect: 'error' });
          if (!response.ok) { const e = new Error('Provider descriptor read failed'); e.status = response.status; throw e; }
          return response.json();
        });
        validateProviderFront(r, d);
        return { id: d.id, localId: d.localId, name: d.name, set: { id: d.set.id }, image: d.image };
      }));
      const failure = results.find(r => r.status === 'rejected'); if (failure) throw failure.reason;
      fronts.push(...results.map(r => r.value));
    }
    journal.current_provider_fronts_verified = fronts.length; await save();
    console.log(JSON.stringify({ phase: 'provider_fronts_verified', count: fronts.length }));
    // Roll back a full metadata/link rehearsal in canonical staging before production is opened.
    db = createVerifiedSupabasePostgresClient(process.env.SUPABASE_STAGING_DB_URL, 'stackr-pbl-rehearsal', { connectionTimeoutMillis: 15000 });
    await db.connect(); connected = true; await db.query('begin isolation level serializable');
    await db.query("set local statement_timeout='45s'"); await db.query("set local lock_timeout='5s'");
    const staged = await readState(db, rows, fronts); const rehearsal = { assets_created: [], links_created: [] };
    await insertLinks(db, rows, staged, rehearsal); await db.query('rollback'); await db.end(); connected = false;
    journal.staging_rehearsal = { status: 'passed_and_rolled_back', tested_assets: 120, tested_links: 120 }; await save();
    console.log(JSON.stringify({ phase: 'staging_rehearsal_passed_and_rolled_back' }));
    db = createVerifiedSupabasePostgresClient(process.env.SUPABASE_DB_URL, 'stackr-pbl-relink', { connectionTimeoutMillis: 15000 });
    await db.connect(); connected = true; await db.query('begin read only'); await db.query("set local statement_timeout='45s'");
    const before = await readState(db, rows, fronts); await db.query('rollback');
    journal.public_files_verified = await verifyFiles(rows, before.sources, sharp); await save();
    await copyOriginals(rows, before.sources, db, sharp, require, journal, save);
    console.log(JSON.stringify({ phase: 'original_copies_verified', count: 120 }));
    await db.query('begin isolation level serializable'); await db.query("set local statement_timeout='45s'"); await db.query("set local lock_timeout='5s'");
    await db.query("select pg_advisory_xact_lock(hashtext('stackr-pbl-relink-20260927'))");
    const locked = await readState(db, rows, fronts);
    check(isDeepStrictEqual(locked, before), 'Catalogue changed during file verification');
    await insertLinks(db, rows, locked, journal);
    journal.status = 'commit_intent'; await save(); commitAttempted = true; await db.query('commit'); committed = true;
    journal.published_at = new Date().toISOString(); journal.status = 'published'; await save();
    // Re-read the current public manifest outside the publishing transaction.
    const finalState = await readState(db, rows, fronts); check(isDeepStrictEqual(finalState.sources, locked.sources), 'Canonical source assets changed');
    const finalManifest = await targetManifest(db, rows, finalState.cards);
    check(finalManifest.length === 120 && new Set(finalManifest.map(a => a.printing_id)).size === 120 && finalManifest.every(a => a.asset_id.startsWith(PREFIX)), 'Post-commit image coverage differs');
    journal.public_files_reverified = await verifyFiles(rows, locked.sources, sharp, true);
    journal.status = 'published_120_duplicate_fronts_verified'; journal.verified_at = new Date().toISOString(); await save(); console.log(JSON.stringify(journal));
  } catch (error) {
    if (connected && !committed) await db.query('rollback').catch(() => {});
    journal.status = committed ? 'published_verification_failed' : commitAttempted ? 'commit_outcome_unknown' : 'failed_before_publication'; journal.error = error.message; await save(); throw error;
  } finally { if (connected) await db.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
