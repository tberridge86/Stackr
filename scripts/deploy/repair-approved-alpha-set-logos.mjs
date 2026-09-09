#!/usr/bin/env node
/**
 * Restores alpha to approved, currently-published English set logos that were
 * historically flattened from TCGdex WebP to JPEG. This deliberately does
 * not ingest a catalogue or create assets: it updates only the existing asset
 * row after storing immutable replacements from its existing approved source.
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { buildApprovedCatalogueAsset, STACKR_ASSET_BUCKETS } from '../../backend/lib/assetPipeline.js';
import { SupabaseObjectStorageAdapter } from '../../backend/lib/objectStorage.js';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const sharp = requireBackend('sharp');

const PRODUCTION_REF = 'oakdbbzdqwurpjnoqhmu';
const MAX_CANDIDATES = 150;
const MAX_SOURCE_BYTES = 1024 * 1024;
const SOURCE = /^https:\/\/assets\.tcgdex\.net\/en\/[a-z0-9.-]+\/[a-z0-9.-]+\/logo\.webp$/i;
const ASSET_COLUMNS = [
  'id', 'asset_id', 'asset_type', 'storage_provider', 'storage_bucket', 'storage_key', 'storage_path',
  'url', 'mime_type', 'content_sha256', 'sha256', 'perceptual_hash', 'width', 'height', 'byte_size',
  'derivative_list', 'original_source_url', 'original_source_identifier', 'source_attribution',
  'permission_status', 'rights_status', 'publicly_servable', 'retention_status', 'deleted_at',
  'cache_control', 'archival_storage_key', 'last_verified_at::text as last_verified_at', 'updated_at::text as updated_at',
].join(',');

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}
function flag(name) { return process.argv.includes(`--${name}`); }
function integer(name, fallback, min, max) {
  const value = Number(arg(name, String(fallback)));
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`--${name} must be an integer from ${min} to ${max}.`);
  return value;
}
function origin(url) {
  try { return new URL(url).origin; } catch { return ''; }
}
function safeError(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') return [error.code, error.message, error.detail].filter(Boolean).join(': ') || 'database_or_api_error';
  return String(error);
}
function productionDatabaseUrl() {
  const value = String(process.env.SUPABASE_DB_URL || '').trim();
  if (!value) throw new Error('SUPABASE_DB_URL is required for guarded catalogue metadata access.');
  const parsed = new URL(value);
  const productionIdentity = decodedURIComponent(parsed.username).includes(PRODUCTION_REF);
  const trustedHost = parsed.hostname.endsWith('.supabase.co') || parsed.hostname.endsWith('.pooler.supabase.com');
  if (!trustedHost || (!parsed.hostname.includes(PRODUCTION_REF) && !productionIdentity)) throw new Error('SUPABASE_DB_URL is not pinned to the production project.');
  return value;
}
function decodedURIComponent(value) { try { return decodeURIComponent(value); } catch { return value; } }
function assertScope() {
  if (arg('target') !== 'production') throw new Error('This repair requires --target=production.');
  if (origin(process.env.SUPABASE_URL) !== `https://${PRODUCTION_REF}.supabase.co`) throw new Error('This repair is locked to the canonical production Supabase project.');
  if (!process.env.SUPABASE_PRODUCTION_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('A production-only Supabase secret is required.');
  productionDatabaseUrl();
  if (flag('execute') && arg('confirmation') !== 'REPAIR APPROVED ALPHA SET LOGOS') throw new Error('Writes require --confirmation=REPAIR APPROVED ALPHA SET LOGOS.');
}
function client() {
  const key = process.env.SUPABASE_PRODUCTION_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(process.env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init = {}) => fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) }) },
  });
}
function isCandidate(asset) {
  return asset.asset_type === 'set_logo'
    && asset.mime_type === 'image/jpeg'
    && asset.storage_provider === 'supabase_storage'
    && asset.storage_bucket === STACKR_ASSET_BUCKETS.publicCatalogue
    && asset.permission_status === 'approved'
    && asset.rights_status === 'approved'
    && asset.publicly_servable === true
    && asset.retention_status === 'active'
    && !asset.deleted_at
    && SOURCE.test(asset.original_source_url || '');
}
async function publishedCandidates(db) {
  const result = await db.query(`
    select ${ASSET_COLUMNS}
    from catalog.assets a
    where a.asset_type = 'set_logo'
      and a.mime_type = 'image/jpeg'
      and a.storage_provider = 'supabase_storage'
      and a.storage_bucket = $1
      and a.permission_status = 'approved'
      and a.rights_status = 'approved'
      and a.publicly_servable
      and a.retention_status = 'active'
      and a.deleted_at is null
      and a.original_source_url like $2
      and exists (
        select 1 from catalog.catalogue_version_assets cva
        join catalog.catalogue_versions cv on cv.id = cva.catalogue_version_id
        join catalog.sets s on s.id = coalesce(cva.set_id, a.set_id)
        where cva.asset_id = a.id and cva.asset_type = 'set_logo'
          and cva.language_code = 'en' and cv.status = 'published'
          and cv.deprecated_at is null and s.deprecated_at is null
      )
    order by a.id
    limit $3`, [STACKR_ASSET_BUCKETS.publicCatalogue, 'https://assets.tcgdex.net/en/%/logo.webp', MAX_CANDIDATES + 1]);
  if (result.rows.length > MAX_CANDIDATES) throw new Error(`Published candidate guard exceeded ${MAX_CANDIDATES}.`);
  return result.rows.filter(isCandidate);
}
async function sourceBuffer(url) {
  if (!SOURCE.test(url || '')) throw new Error('Source URL failed the approved TCGdex English logo allowlist.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { Accept: 'image/webp' } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_SOURCE_BYTES) throw new Error('Source exceeds the 1 MiB logo bound.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_SOURCE_BYTES) throw new Error('Source payload violates the logo size bound.');
  const metadata = await sharp(buffer).metadata();
  return { buffer, metadata };
}
function before(asset) {
  return Object.fromEntries(Object.entries(asset).filter(([key]) => [
    'storage_provider', 'storage_bucket', 'storage_key', 'storage_path', 'url', 'mime_type', 'content_sha256',
    'sha256', 'perceptual_hash', 'width', 'height', 'byte_size', 'derivative_list', 'cache_control',
    'archival_storage_key', 'last_verified_at', 'updated_at',
  ].includes(key)));
}
async function repairOne(db, storage, asset, execute) {
  try {
    const source = await sourceBuffer(asset.original_source_url);
    if (!source.metadata.hasAlpha) return { assetId: asset.id, status: 'opaque_source_skipped', source: asset.original_source_url };
    if (!execute) return { assetId: asset.id, status: 'alpha_source_would_repair', source: asset.original_source_url, sourceMetadata: { width: source.metadata.width, height: source.metadata.height, hasAlpha: true }, rollback: before(asset) };
    const rebuilt = await buildApprovedCatalogueAsset({
      assetId: asset.asset_id || asset.id, assetType: 'set_logo', sourceUrl: asset.original_source_url,
      sourceIdentifier: asset.original_source_identifier, sourceAttribution: asset.source_attribution,
      permissionStatus: 'approved', buffer: source.buffer, mimeType: 'image/webp', storage,
      bucket: STACKR_ASSET_BUCKETS.publicCatalogue,
    });
    const payload = {
      ...rebuilt,
      storage_provider: storage.id,
      storage_bucket: STACKR_ASSET_BUCKETS.publicCatalogue,
      storage_key: rebuilt.storage_key,
      storage_path: rebuilt.storage_path,
      url: storage.publicUrl(STACKR_ASSET_BUCKETS.publicCatalogue, rebuilt.storage_key),
      original_source_url: asset.original_source_url,
      original_source_identifier: asset.original_source_identifier,
      source_attribution: asset.source_attribution,
    };
    const updatedResult = await db.query(`
      update catalog.assets set
        storage_provider=$1, storage_bucket=$2, storage_key=$3, storage_path=$4, url=$5,
        mime_type=$6, content_sha256=$7, sha256=$8, perceptual_hash=$9, width=$10, height=$11,
        byte_size=$12, derivative_list=$13::jsonb, cache_control=$14, archival_storage_key=$15,
        last_verified_at=$16
      where id=$17 and updated_at=$18::timestamptz and asset_type='set_logo'
        and mime_type='image/jpeg' and storage_key=$19 and permission_status='approved'
        and rights_status='approved' and publicly_servable and retention_status='active'
        and deleted_at is null
      returning ${ASSET_COLUMNS}`,
    [payload.storage_provider, payload.storage_bucket, payload.storage_key, payload.storage_path, payload.url,
      payload.mime_type, payload.content_sha256, payload.sha256, payload.perceptual_hash, payload.width, payload.height,
      payload.byte_size, JSON.stringify(payload.derivative_list), payload.cache_control, payload.archival_storage_key,
      payload.last_verified_at, asset.id, asset.updated_at, asset.storage_key]);
    const updated = updatedResult.rows[0];
    if (!updated) return { assetId: asset.id, status: 'stale_skipped', rollback: before(asset) };
    const manifestResult = await db.query(`select asset_id,mime_type,storage_key,derivative_list from api.asset_manifest where asset_row_id=$1 and asset_type='set_logo'`, [asset.id]);
    const manifest = manifestResult.rows;
    const served = await storage.getObject(updated.storage_bucket, updated.storage_key, { maxBytes: MAX_SOURCE_BYTES });
    const servedMetadata = await sharp(served).metadata();
    if (!manifest?.length || manifest.some((row) => row.mime_type !== 'image/webp' || row.storage_key !== updated.storage_key) || !servedMetadata.hasAlpha) throw new Error('Manifest or stored-object alpha verification failed.');
    return { assetId: asset.id, status: 'repaired', source: asset.original_source_url, before: before(asset), after: { storage_key: updated.storage_key, mime_type: updated.mime_type, derivative_list: updated.derivative_list, updated_at: updated.updated_at }, rollback: before(asset), servedMetadata: { width: servedMetadata.width, height: servedMetadata.height, hasAlpha: servedMetadata.hasAlpha } };
  } catch (error) { return { assetId: asset.id, status: 'failed', error: safeError(error), rollback: before(asset) }; }
}
async function main() {
  assertScope();
  const execute = flag('execute');
  const expected = integer('expected-scanned', 141, 1, MAX_CANDIDATES);
  const receipt = arg('receipt', 'outputs/releases/catalogue-alpha-logo-repair-receipt.json');
  const supabase = client();
  const db = createVerifiedSupabasePostgresClient(productionDatabaseUrl(), 'stackr-approved-alpha-logo-repair', { connectionTimeoutMillis: 15_000, statement_timeout: 60_000 });
  try {
    await db.connect();
    const candidates = await publishedCandidates(db);
    if (candidates.length !== expected) throw new Error(`Expected ${expected} currently published JPEG/WebP candidates, found ${candidates.length}; refusing to continue.`);
    const storage = new SupabaseObjectStorageAdapter(supabase);
    const results = [];
    const report = { schemaVersion: 1, ok: true, command: 'repair-approved-alpha-set-logos', target: 'production', dryRun: !execute, scope: { published: true, language: 'en', assetType: 'set_logo', source: 'approved TCGdex English WebP only', maxCandidates: MAX_CANDIDATES }, candidates: candidates.length, summary: {}, results };
    report.rollbackPlan = candidates.map((asset) => ({ assetId: asset.id, before: before(asset) }));
    await mkdir(path.dirname(receipt), { recursive: true });
    const persistReceipt = async () => {
      report.summary = results.reduce((counts, result) => ({ ...counts, [result.status]: (counts[result.status] || 0) + 1 }), {});
      report.ok = !report.summary.failed;
      await writeFile(receipt, `${JSON.stringify(report, null, 2)}\n`);
    };
    await persistReceipt();
    for (const asset of candidates) { results.push(await repairOne(db, storage, asset, execute)); await persistReceipt(); }
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally { await db.end(); }
}
main().catch((error) => { console.error(JSON.stringify({ ok: false, command: 'repair-approved-alpha-set-logos', error: safeError(error) }, null, 2)); process.exitCode = 1; });
