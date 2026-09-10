import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';

const SOURCE = 'lmwfhvexfcoyeuoyrlco';
const TARGET = 'oakdbbzdqwurpjnoqhmu';
const BUCKET = 'stackr-catalogue-public';
const REQUIRED_ROLES = ['card-grid', 'search-result', 'detail-page'];
const manifest = JSON.parse(readFileSync(process.env.STACKR_POKEDATA_GAP_MANIFEST ?? 'deploy/manifests/pokedata-gap-art-20260910.json', 'utf8'));
const apply = process.env.STACKR_POKEDATA_GAP_APPLY === 'true';
const confirmation = process.env.STACKR_POKEDATA_GAP_CONFIRMATION;
const evidencePath = process.env.STACKR_POKEDATA_GAP_EVIDENCE_PATH;
const sourceUrl = process.env.STACKR_SOURCE_DB_URL;
const targetUrl = process.env.STACKR_RESTORE_DB_URL;
const sourceKey = process.env.SUPABASE_STAGING_SECRET_KEY;
const targetKey = process.env.SUPABASE_PRODUCTION_SECRET_KEY;

function fail(message) { throw new Error(message); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function safeKey(value) {
  const key = String(value ?? '').trim();
  return key && !key.startsWith('/') && !key.endsWith('/') && key.split('/').every((part) => part && part !== '.' && part !== '..') ? key : null;
}
function derivativeKey(entry) { return safeKey(entry?.storageKey ?? entry?.storage_key ?? entry?.deliveryPath ?? entry?.delivery_path ?? entry?.path); }
function assetKeys(asset) {
  const original = safeKey(asset.storage_key);
  const derivatives = Array.isArray(asset.derivative_list) ? asset.derivative_list : [];
  const byRole = new Map(derivatives.map((item) => [item?.role, derivativeKey(item)]));
  if (!original || REQUIRED_ROLES.some((role) => !byRole.get(role)) || derivatives.length !== 3) fail(`source_asset_derivatives_invalid:${asset.id}`);
  return [original, ...REQUIRED_ROLES.map((role) => byRole.get(role))];
}
function isReady(asset) {
  return asset.asset_type === 'card_image' && asset.asset_visibility === 'public_catalogue'
    && asset.rights_status === 'approved' && asset.permission_status === 'approved'
    && asset.publicly_servable === true && asset.retention_status === 'active'
    && !asset.deleted_at && ['supabase_storage', 's3_compatible'].includes(asset.storage_provider)
    && asset.storage_bucket === BUCKET;
}
function comparableAsset(asset) {
  return ['id', 'variant_id', 'printing_id', 'asset_type', 'content_sha256', 'original_source_url', 'storage_key'].map((key) => asset[key] ?? null);
}
function assertConfig() {
  if (manifest?.contract !== 'pokedata-gap-art-20260910' || manifest?.expected?.total !== 82 || manifest?.candidates?.length !== 82) fail('manifest_contract_invalid');
  if (manifest.sourceProjectRef !== SOURCE || manifest.targetProjectRef !== TARGET) fail('manifest_project_guard_invalid');
  if (new Set(manifest.candidates.map((row) => row.variantId)).size !== 82) fail('manifest_variant_identity_invalid');
  if (!sourceUrl?.includes(SOURCE) || !targetUrl?.includes(TARGET) || !sourceKey || !targetKey || !evidencePath) fail('protected_environment_missing');
  if (apply && confirmation !== 'PROMOTE 82 VERIFIED POKEDATA ART') fail('apply_confirmation_missing');
  if (!apply && confirmation) fail('dry_run_must_not_supply_confirmation');
}
async function main() {
  assertConfig();
  const sourceDb = createVerifiedSupabasePostgresClient(sourceUrl, 'stackr-pokedata-gap-source');
  const targetDb = createVerifiedSupabasePostgresClient(targetUrl, 'stackr-pokedata-gap-target');
  const sourceStorage = createClient(`https://${SOURCE}.supabase.co`, sourceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const targetStorage = createClient(`https://${TARGET}.supabase.co`, targetKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await Promise.all([sourceDb.connect(), targetDb.connect()]);
  try {
    const ids = manifest.candidates.map((row) => row.variantId);
    const sourceRows = (await sourceDb.query(`select to_jsonb(a) as asset from catalog.assets a where a.variant_id = any($1::uuid[]) and a.asset_type = 'card_image' and a.deprecated_at is null and a.deleted_at is null`, [ids])).rows.map((row) => row.asset);
    if (sourceRows.length !== 82 || sourceRows.some((asset) => !isReady(asset))) fail(`source_asset_scope_invalid:${sourceRows.length}`);
    const sourceByVariant = new Map(sourceRows.map((asset) => [asset.variant_id, asset]));
    for (const candidate of manifest.candidates) {
      const asset = sourceByVariant.get(candidate.variantId);
      if (!asset || asset.printing_id !== candidate.printingId) fail(`source_identity_mismatch:${candidate.variantId}`);
    }
    const sourceVersion = (await sourceDb.query(`select id from catalog.catalogue_versions where language_code='ja' and status='published' and deprecated_at is null`)).rows;
    const targetVersion = (await targetDb.query(`select id from catalog.catalogue_versions where language_code='ja' and status='published' and deprecated_at is null`)).rows;
    if (sourceVersion.length !== 1 || targetVersion.length !== 1 || sourceVersion[0].id !== targetVersion[0].id) fail('published_japanese_version_mismatch');
    const assetIds = sourceRows.map((asset) => asset.id);
    const sourceLinks = (await sourceDb.query(`select to_jsonb(x) as row from catalog.catalogue_version_assets x where x.catalogue_version_id=$1 and x.asset_id=any($2::uuid[])`, [sourceVersion[0].id, assetIds])).rows.map((row) => row.row);
    if (sourceLinks.length !== 82) fail(`source_version_asset_scope_invalid:${sourceLinks.length}`);
    const targetRows = (await targetDb.query(`select to_jsonb(a) as asset from catalog.assets a where a.variant_id=any($1::uuid[]) and a.asset_type='card_image' and a.deprecated_at is null and a.deleted_at is null`, [ids])).rows.map((row) => row.asset);
    if (targetRows.some(isReady)) fail('target_already_has_ready_image');
    for (const existing of targetRows) {
      const source = sourceRows.find((row) => row.id === existing.id);
      if (!source || JSON.stringify(comparableAsset(source)) !== JSON.stringify(comparableAsset(existing))) fail(`target_asset_identity_conflict:${existing.id}`);
    }
    const objectKeys = [...new Set(sourceRows.flatMap(assetKeys))];
    if (objectKeys.length !== 328) fail(`storage_object_scope_invalid:${objectKeys.length}`);
    const sourceObjects = (await sourceDb.query(`select name, metadata from storage.objects where bucket_id=$1 and name=any($2::text[])`, [BUCKET, objectKeys])).rows;
    if (sourceObjects.length !== 328) fail(`source_storage_scope_invalid:${sourceObjects.length}`);
    const targetObjects = (await targetDb.query(`select name, metadata from storage.objects where bucket_id=$1 and name=any($2::text[])`, [BUCKET, objectKeys])).rows;
    const targetByName = new Map(targetObjects.map((row) => [row.name, row]));
    for (const source of sourceObjects) {
      const target = targetByName.get(source.name);
      if (target && JSON.stringify(target.metadata) !== JSON.stringify(source.metadata)) fail(`target_storage_metadata_conflict:${source.name}`);
    }
    const plan = { assets: sourceRows.length, links: sourceLinks.length, objects: sourceObjects.length, objectsMissingInProduction: sourceObjects.filter((row) => !targetByName.has(row.name)).length };
    if (apply) {
      for (const object of sourceObjects.filter((row) => !targetByName.has(row.name))) {
        const { data: blob, error: downloadError } = await sourceStorage.storage.from(BUCKET).download(object.name);
        if (downloadError) fail(`source_download_failed:${object.name}`);
        const bytes = Buffer.from(await blob.arrayBuffer());
        const expectedSize = Number(object.metadata?.size ?? bytes.length);
        const expectedHash = object.name.match(/\/([a-f0-9]{64})\/[^/]+$/)?.[1];
        if (bytes.length !== expectedSize || !expectedHash || sha(bytes) !== expectedHash) fail(`source_object_hash_invalid:${object.name}`);
        const { error: uploadError } = await targetStorage.storage.from(BUCKET).upload(object.name, bytes, { contentType: object.metadata?.mimetype ?? 'application/octet-stream', cacheControl: String(object.metadata?.cacheControl ?? '').replace(/^max-age=/, ''), upsert: false });
        if (uploadError) fail(`target_upload_failed:${object.name}`);
      }
      await targetDb.query('begin');
      try {
        const columns = (await targetDb.query(`select column_name from information_schema.columns where table_schema='catalog' and table_name='assets' and is_generated='NEVER' order by ordinal_position`)).rows.map((row) => row.column_name);
        const writes = columns.filter((column) => column !== 'id').map((column) => `"${column}"=excluded."${column}"`).join(',');
        for (const asset of sourceRows) await targetDb.query(`insert into catalog.assets (${columns.map((column) => `"${column}"`).join(',')}) select ${columns.map((column) => `(jsonb_populate_record(null::catalog.assets,$1::jsonb))."${column}"`).join(',')} on conflict (id) do update set ${writes}`, [JSON.stringify(asset)]);
        const linkColumns = (await targetDb.query(`select column_name from information_schema.columns where table_schema='catalog' and table_name='catalogue_version_assets' and is_generated='NEVER' order by ordinal_position`)).rows.map((row) => row.column_name);
        for (const link of sourceLinks) await targetDb.query(`insert into catalog.catalogue_version_assets (${linkColumns.map((column) => `"${column}"`).join(',')}) select ${linkColumns.map((column) => `(jsonb_populate_record(null::catalog.catalogue_version_assets,$1::jsonb))."${column}"`).join(',')} on conflict do nothing`, [JSON.stringify(link)]);
        await targetDb.query('commit');
      } catch (error) { await targetDb.query('rollback'); throw error; }
      const targetReady = (await targetDb.query(`select to_jsonb(a) as asset from catalog.assets a where a.variant_id=any($1::uuid[]) and a.asset_type='card_image' and a.deprecated_at is null and a.deleted_at is null`, [ids])).rows.map((row) => row.asset);
      if (targetReady.length !== 82 || targetReady.some((asset) => !isReady(asset))) fail(`target_asset_verification_failed:${targetReady.length}`);
      const targetObjectCount = (await targetDb.query(`select count(*)::int as count from storage.objects where bucket_id=$1 and name=any($2::text[])`, [BUCKET, objectKeys])).rows[0]?.count;
      if (targetObjectCount !== 328) fail(`target_storage_verification_failed:${targetObjectCount}`);
    }
    const result = { schemaVersion: 1, contract: manifest.contract, apply, verifiedAt: new Date().toISOString(), plan, variantIds: ids, rollback: apply ? { deleteOnlyStorageObjects: sourceObjects.filter((row) => !targetByName.has(row.name)).map((row) => row.name), restoreAssetRowsFromPreApplyBackup: true } : null };
    mkdirSync(path.dirname(evidencePath), { recursive: true }); writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(JSON.stringify({ ok: true, ...result }) + '\n');
  } finally { await Promise.allSettled([sourceDb.end(), targetDb.end()]); }
}
main().catch((error) => { process.stderr.write(`pokedata_gap_art_promotion_failed:${error.message}\n`); process.exitCode = 1; });
