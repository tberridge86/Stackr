#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { buildApprovedCatalogueAsset } from '../backend/lib/assetPipeline.js';
import { SupabaseObjectStorageAdapter } from '../backend/lib/objectStorage.js';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const ALLOWED_PROVIDERS = new Set(['tcgdex', 'pikaqian']);

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer from ${min} to ${max}, received ${value}.`);
  }
  return parsed;
}

function requireStaging() {
  const target = String(arg('target') || process.env.STACKR_CATALOGUE_IMPORT_TARGET || '').trim().toLowerCase();
  const url = process.env.SUPABASE_URL ?? '';
  if (target !== 'staging' || !url.includes(STAGING_SUPABASE_REF)) {
    throw new Error(`Catalogue mirroring is restricted to staging project ${STAGING_SUPABASE_REF}.`);
  }
}

function adminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Staging Supabase backend credentials are required.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function downloadApprovedImage(url, timeoutMs, maxBytes) {
  const response = await fetch(url, {
    headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Source image returned HTTP ${response.status}.`);
  const declaredBytes = Number(response.headers.get('content-length') ?? 0);
  if (declaredBytes > maxBytes) throw new Error(`Source image exceeds ${maxBytes} bytes.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new Error(`Downloaded image exceeds ${maxBytes} bytes.`);
  return {
    buffer,
    mimeType: String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(),
  };
}

async function providerSourceId(supabase, provider) {
  const { data, error } = await supabase.schema('ingest').from('sources')
    .select('id,code')
    .eq('code', provider)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Staging source ${provider} is missing.`);
  return data.id;
}

async function mirrorOne(supabase, storage, asset, options) {
  const sourceUrl = asset.original_source_url || asset.url;
  if (!sourceUrl) throw new Error('Approved asset has no source URL.');
  if (options.dryRun) return { id: asset.id, status: 'would_mirror' };

  const image = await downloadApprovedImage(sourceUrl, options.timeoutMs, options.maxBytes);
  const mirrored = await buildApprovedCatalogueAsset({
    assetId: asset.id,
    assetType: asset.asset_type,
    buffer: image.buffer,
    mimeType: image.mimeType,
    permissionStatus: 'approved',
    sourceUrl,
    sourceIdentifier: asset.original_source_identifier || asset.asset_id || asset.id,
    sourceAttribution: asset.source_attribution || options.provider,
    preserveArchivalOriginal: true,
    storage,
  });
  const publicUrl = storage.publicUrl(mirrored.storage_bucket, mirrored.storage_key);
  const { error } = await supabase.schema('catalog').from('assets').update({
    asset_id: asset.asset_id || asset.id,
    url: publicUrl,
    storage_provider: mirrored.storage_provider,
    storage_bucket: mirrored.storage_bucket,
    storage_key: mirrored.storage_key,
    storage_path: mirrored.storage_path,
    original_source_url: sourceUrl,
    original_source_identifier: mirrored.original_source_identifier,
    source_attribution: mirrored.source_attribution,
    permission_status: 'approved',
    rights_status: 'approved',
    publicly_servable: true,
    externally_referenced: false,
    unavailable_reason: null,
    sha256: mirrored.sha256,
    content_sha256: mirrored.content_sha256,
    perceptual_hash: mirrored.perceptual_hash,
    mime_type: mirrored.mime_type,
    width: mirrored.width,
    height: mirrored.height,
    byte_size: mirrored.byte_size,
    derivative_list: mirrored.derivative_list,
    cache_control: mirrored.cache_control,
    archival_storage_key: mirrored.archival_storage_key,
    last_verified_at: mirrored.last_verified_at,
    retention_status: 'active',
    acquisition_source: 'provider_url',
  }).eq('id', asset.id);
  if (error) throw error;

  if (asset.variant_id) {
    const { error: variantError } = await supabase.schema('catalog').from('card_variants')
      .update({ native_image_status: 'available' })
      .eq('id', asset.variant_id);
    if (variantError) throw variantError;
  }
  return { id: asset.id, status: 'mirrored', bytes: mirrored.byte_size };
}

async function main() {
  if (hasFlag('help')) {
    console.log('node scripts/mirror-approved-catalogue-assets.mjs --provider=tcgdex --limit=100 --concurrency=2 --target=staging');
    return;
  }
  requireStaging();
  const provider = arg('provider');
  if (!ALLOWED_PROVIDERS.has(provider)) throw new Error('Use --provider=tcgdex or --provider=pikaqian.');
  const limit = boundedInteger(arg('limit', '100'), 100, 1, 2000);
  const concurrency = boundedInteger(arg('concurrency', '2'), 2, 1, 4);
  const timeoutMs = boundedInteger(arg('timeoutMs', '30000'), 30000, 1000, 120000);
  const maxBytes = boundedInteger(arg('maxBytes', String(12 * 1024 * 1024)), 12 * 1024 * 1024, 1024, 25 * 1024 * 1024);
  const dryRun = hasFlag('dry-run') || hasFlag('dryRun');
  const supabase = adminSupabase();
  const storage = new SupabaseObjectStorageAdapter(supabase);
  const sourceId = await providerSourceId(supabase, provider);
  const { data, error } = await supabase.schema('catalog').from('assets')
    .select('id,asset_id,asset_type,variant_id,url,original_source_url,original_source_identifier,source_attribution')
    .eq('source_id', sourceId)
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved')
    .eq('storage_provider', 'external_reference')
    .eq('publicly_servable', true)
    .is('deprecated_at', null)
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results = await mapWithConcurrency(data ?? [], concurrency, async (asset) => {
    try {
      return await mirrorOne(supabase, storage, asset, { provider, dryRun, timeoutMs, maxBytes });
    } catch (error) {
      return { id: asset.id, status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  });
  const summary = results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({ ok: !summary.failed, provider, dryRun, inspected: results.length, summary, results }, null, 2));
  if (summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
