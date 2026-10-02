import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';

const root = path.dirname(fileURLToPath(import.meta.url));
const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const PLAN_SHA = 'a2c1d358bd7d5fc76188b7ca03c8251a64f44fc97ddb9e182dd965d79e9a7277';
const PROJECT = 'oakdbbzdqwurpjnoqhmu';
const BUCKET = 'stackr-catalogue-public';
const sha = b => createHash('sha256').update(b).digest('hex');
const publicUrl = key => `https://${PROJECT}.supabase.co/storage/v1/object/public/${BUCKET}/${key}`;

export async function verifyPackage() {
  const bytes = await fs.readFile(path.join(root, 'plan.json'));
  assert.equal(sha(bytes), PLAN_SHA, 'Frozen plan changed');
  const plan = JSON.parse(bytes);
  assert.equal(plan.project, PROJECT); assert.equal(plan.bucket, BUCKET);
  assert.equal(plan.objects.length, 13); assert.equal(plan.cacheAssets.length, 3);
  assert.equal(new Set(plan.objects.map(o => o.key)).size, 13);
  const sharp = requireBackend('sharp');
  for (const o of plan.objects) {
    assert.match(o.file, /^[0-9a-f]{64}\.(webp|jpg)$/);
    assert.match(o.key, /^public\/card_image\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}\/[a-z0-9-]+\.(webp|jpg)$/);
    const body = await fs.readFile(path.join(root, 'payload', o.file));
    assert.equal(sha(body), o.sha256); assert.equal(body.length, o.bytes);
    await sharp(body).raw().toBuffer();
  }
  return plan;
}

export function assertExecutionEnvironment(env, head) {
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.equal(env.STACKR_RETRIEVAL_CONFIRMATION, 'PUBLISH RETRIEVAL REPAIRS');
  assert.match(env.STACKR_EXPECTED_MAIN_SHA ?? '', /^[0-9a-f]{40}$/);
  assert.equal(env.STACKR_EXPECTED_MAIN_SHA, env.GITHUB_SHA);
  assert.equal(head, env.GITHUB_SHA);
  assert.ok(env.SUPABASE_DB_URL?.includes(PROJECT), 'Production database identity missing');
  assert.ok(env.SUPABASE_PRODUCTION_SECRET_KEY, 'Storage credential missing');
}

export async function readObject(o, allowMissing = false, request = fetch) {
  const response = await request(publicUrl(o.key), { signal: AbortSignal.timeout(20000) });
  if (allowMissing && (response.status === 404 || response.status === 400)) return null;
  assert.equal(response.status, 200, `Object status ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(sha(bytes), o.sha256, 'Public image checksum mismatch');
  assert.equal(bytes.length, o.bytes);
  assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*max-age=31536000(?:,|$)/);
  assert.doesNotMatch(response.headers.get('cache-control') ?? '', /max-age=public/);
  return { key: o.key, sha256: sha(bytes), bytes: bytes.length, cache: response.headers.get('cache-control') };
}

export function validateRows(plan, rows) {
  assert.equal(rows.length, 4);
  for (const expected of [...plan.cacheAssets, plan.m5]) {
    const row = rows.find(r => r.id === expected.id);
    assert.ok(row, 'Reviewed asset missing');
    assert.equal(row.variant_id, expected.variantId);
    assert.equal(row.asset_visibility, 'public_catalogue');
    assert.equal(row.publicly_servable, true);
    assert.equal(row.retention_status, 'active');
    assert.equal(row.permission_status, 'approved'); assert.equal(row.rights_status, 'approved');
    assert.equal(row.deleted_at, null); assert.equal(row.deprecated_at, null);
    if (expected.after) {
      assert.equal(row.storage_provider, 'supabase_storage');
      assert.ok(isDeepStrictEqual(row.derivative_list, expected.after)
        || isDeepStrictEqual(row.derivative_list, expected.derivative_list), 'Cache asset changed since review');
    } else {
      assert.equal(row.printing_id, plan.m5.printingId);
      assert.equal(row.original_source_url, expected.asset.original_source_url);
      assert.equal(row.source_attribution, 'pokemon_card_jp_official');
      if (row.storage_key === expected.asset.storage_key) {
        assert.equal(row.storage_provider, 'supabase_storage');
        assert.deepEqual(row.derivative_list, expected.asset.derivative_list);
      } else {
        assert.equal(row.storage_provider, 'external_reference'); assert.equal(row.storage_key, null);
        assert.deepEqual(row.derivative_list, []);
        assert.equal(new Date(row.updated_at).getTime(), new Date(expected.beforeUpdatedAt).getTime());
      }
    }
  }
}

export async function applyAssociations(db, plan, saveBefore) {
  await db.query('begin');
  try {
    const ids = [...plan.cacheAssets.map(a => a.id), plan.m5.id];
    const { rows } = await db.query('select * from catalog.assets where id=any($1::uuid[]) order by id for update', [ids]);
    validateRows(plan, rows);
    await saveBefore(rows);
    for (const a of plan.cacheAssets) {
      const row = rows.find(r => r.id === a.id);
      if (isDeepStrictEqual(row.derivative_list, a.after)) continue;
      const result = await db.query('update catalog.assets set derivative_list=$2::jsonb where id=$1 returning id', [a.id, JSON.stringify(a.after)]);
      assert.equal(result.rowCount, 1);
    }
    const row = rows.find(r => r.id === plan.m5.id), a = plan.m5.asset;
    if (row.storage_key !== a.storage_key) {
      const result = await db.query(`update catalog.assets set storage_provider='supabase_storage', storage_bucket=$2,
        storage_key=$3, storage_path=$3, sha256=$4, content_sha256=$4, mime_type=$5, width=$6, height=$7,
        byte_size=$8, derivative_list=$9::jsonb, cache_control=$10, externally_referenced=false,
        archival_storage_key=$3, last_verified_at=now() where id=$1 returning id`,
      [plan.m5.id, BUCKET, a.storage_key, a.sha256, a.mime_type, a.width, a.height, a.byte_size, JSON.stringify(a.derivative_list), a.cache_control]);
      assert.equal(result.rowCount, 1);
    }
    await db.query('commit');
    return rows;
  } catch (error) {
    await db.query('rollback').catch(() => {});
    throw error;
  }
}

async function publish(plan) {
  assertExecutionEnvironment(process.env, execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
  const { Client } = requireBackend('pg');
  const { createClient } = requireBackend('@supabase/supabase-js');
  const storage = createClient(`https://${PROJECT}.supabase.co`, process.env.SUPABASE_PRODUCTION_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(BUCKET);
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  const output = process.env.STACKR_RETRIEVAL_OUTPUT;
  assert.ok(output, 'Receipt directory required');
  await fs.mkdir(output, { recursive: true });
  const receipt = { startedAt: new Date().toISOString(), source: process.env.GITHUB_SHA, planSha256: PLAN_SHA,
    preservedOriginalObjects: true, objects: [], associationsCommitted: false, publicApiVerified: false };
  const save = async () => {
    const bytes = JSON.stringify(receipt, null, 2) + '\n';
    await fs.writeFile(path.join(output, 'receipt.json'), bytes);
    await fs.writeFile(path.join(output, 'receipt.sha256'), `${sha(bytes)}  receipt.json\n`);
  };
  await save();
  try {
    await db.connect();
    receipt.stage = 'preflight'; await save();
    const ids = [...plan.cacheAssets.map(a => a.id), plan.m5.id];
    validateRows(plan, (await db.query('select * from catalog.assets where id=any($1::uuid[])', [ids])).rows);
    receipt.stage = 'objects'; await save();
    // Upload only new immutable paths; a matching interrupted upload is reused.
    // Every public byte and header is checked before any catalogue association changes.
    for (const o of plan.objects) {
      let verified = await readObject(o, true);
      let created = false;
      if (!verified) {
        const body = await fs.readFile(path.join(root, 'payload', o.file));
        const { error } = await storage.upload(o.key, body, { contentType: o.mimeType, cacheControl: '31536000', upsert: false });
        if (error) throw new Error(`Immutable upload failed (${error.statusCode ?? 'unknown'})`);
        created = true; verified = await readObject(o);
      }
      receipt.objects.push({ ...verified, created }); await save();
    }
    receipt.stage = 'associations'; await save();
    const rows = await applyAssociations(db, plan, rows => fs.writeFile(path.join(output, 'asset-before.json'), JSON.stringify(rows, null, 2)));
    receipt.associationsCommitted = true; receipt.stage = 'public-api'; await save();
    // Read every changed published binding, not just the uploaded objects.
    for (const a of plan.cacheAssets) {
      const row = rows.find(x => x.id === a.id);
      assert.ok(row.variant_id, 'Reviewed cache asset requires exact variant identity');
      const response = await fetch(`https://api.stackrtcg.com/v1/assets/manifest?assetType=card_image&variantId=${row.variant_id}&limit=100`,
        { signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
      assert.equal(response.status, 200);
      const assets = (await response.json()).data.assets;
      const asset = assets.find(x => x.assetId === a.id);
      for (const d of a.after) assert.ok(asset?.derivatives.some(x => x.storageKey === d.storageKey || x.deliveryUrl?.endsWith(d.storageKey)), 'API cache binding not yet visible');
    }
    const r = await fetch(`https://api.stackrtcg.com/v1/cards/${plan.m5.printingId}`, { signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
    assert.equal(r.status, 200);
    const card = (await r.json()).data.card;
    assert.equal(card.cardId, plan.m5.printingId); assert.equal(card.languageCode, 'ja');
    assert.equal(card.collectorNumber.value, '002'); assert.equal(card.set.setCode, 'M5');
    const derivatives = card.variants.find(v => v.variantId === plan.m5.variantId)?.image?.derivatives ?? [];
    for (const d of plan.m5.asset.derivative_list) assert.ok(derivatives.some(x => x.contentSha256 === d.contentSha256), 'API rendition not yet visible');
    receipt.publicApiVerified = true; receipt.completedAt = new Date().toISOString(); await save();
  } catch (error) {
    await db.query('rollback').catch(() => {});
    // SQL/network errors can contain connection details: retain only a bounded code/type.
    receipt.failed = true; receipt.failureCode = String(error.code ?? error.name ?? 'failure').slice(0,80); await save();
    throw new Error(`Retrieval repair stopped: ${receipt.failureCode}; see preserved receipt`);
  } finally { await db.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await verifyPackage();
  if (process.argv.includes('--execute')) await publish(plan);
  console.log(JSON.stringify({ verifiedObjects: plan.objects.length, cacheAssets: plan.cacheAssets.length,
    execute: process.argv.includes('--execute'), planSha256: PLAN_SHA }));
}
