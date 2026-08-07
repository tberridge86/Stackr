#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { buildApprovedCatalogueAsset } from '../backend/lib/assetPipeline.js';
import { SupabaseObjectStorageAdapter } from '../backend/lib/objectStorage.js';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const ALLOWED_PROVIDERS = new Set(['tcgdex', 'pikaqian']);
const RETRYABLE_SOURCE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_SOURCE_ATTEMPTS = 3;
const MAX_DEFERRED_PER_BATCH = 5;

class SourceImageUnavailableError extends Error {
  constructor(status) {
    super(`Source image returned HTTP ${status}.`);
    this.name = 'SourceImageUnavailableError';
    this.status = status;
  }
}

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

function optionalUuidArg(name) {
  const value = String(arg(name) || '').trim().toLowerCase();
  if (!value) return '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error(`Expected --${name} to be a UUID.`);
  }
  return value;
}

function uuidListArg(name, maxItems = 100) {
  const raw = String(arg(name) || '').trim();
  if (!raw) return [];
  const values = [...new Set(raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (values.length > maxItems) throw new Error(`--${name} accepts at most ${maxItems} UUIDs.`);
  for (const value of values) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
      throw new Error(`Expected --${name} to contain UUIDs.`);
    }
  }
  return values;
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function sourceRetryDelayMs(response, attempt) {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 250), 30_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 250), 30_000);
  }
  return 500 * (2 ** (attempt - 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireStaging() {
  const target = String(arg('target') || process.env.STACKR_CATALOGUE_IMPORT_TARGET || '').trim().toLowerCase();
  const url = process.env.SUPABASE_URL ?? '';
  if (target !== 'staging' || !url.includes(STAGING_SUPABASE_REF)) {
    throw new Error(`Catalogue mirroring is restricted to staging project ${STAGING_SUPABASE_REF}.`);
  }
}

function boundedSupabaseFetch(input, init = {}) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(60_000),
  });
}

function adminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Staging Supabase backend credentials are required.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: boundedSupabaseFetch },
  });
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
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_SOURCE_ATTEMPTS; attempt += 1) {
    let response = null;
    try {
      response = await fetch(url, {
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 404 || response.status === 410) {
        throw new SourceImageUnavailableError(response.status);
      }
      if (RETRYABLE_SOURCE_STATUSES.has(response.status) && attempt < MAX_SOURCE_ATTEMPTS) {
        await response.body?.cancel().catch(() => undefined);
        await sleep(sourceRetryDelayMs(response, attempt));
        continue;
      }
      if (!response.ok) throw new Error(`Source image returned HTTP ${response.status}.`);
      const declaredBytes = Number(response.headers.get('content-length') ?? 0);
      if (declaredBytes > maxBytes) throw new Error(`Source image exceeds ${maxBytes} bytes.`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > maxBytes) throw new Error(`Downloaded image exceeds ${maxBytes} bytes.`);
      return {
        buffer,
        mimeType: String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(),
      };
    } catch (error) {
      if (error instanceof SourceImageUnavailableError) throw error;
      lastError = error;
      if (attempt === MAX_SOURCE_ATTEMPTS) throw error;
      await sleep(sourceRetryDelayMs(response, attempt));
    }
  }
  throw lastError ?? new Error('Source image download failed.');
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

async function reuseExistingStorageObject(supabase, asset, mirrored) {
  const { data: existing, error: existingError } = await supabase.schema('catalog').from('assets')
    .select('id,asset_id,variant_id,url')
    .eq('storage_provider', mirrored.storage_provider)
    .eq('storage_bucket', mirrored.storage_bucket)
    .eq('storage_key', mirrored.storage_key)
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved')
    .eq('publicly_servable', true)
    .is('deprecated_at', null)
    .is('deleted_at', null)
    .neq('id', asset.id)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing?.id || (asset.asset_type === 'card_image' && !existing.variant_id)) {
    throw new Error(`Stored object ${mirrored.storage_key} exists without a reusable catalogue asset.`);
  }

  const { error: duplicateError } = await supabase.schema('catalog').from('assets').update({
    storage_provider: 'unavailable',
    storage_bucket: null,
    storage_key: null,
    storage_path: null,
    externally_referenced: false,
    publicly_servable: false,
    unavailable_reason: `duplicate_content:${existing.asset_id || existing.id}`,
    content_sha256: mirrored.content_sha256,
    perceptual_hash: mirrored.perceptual_hash,
    mime_type: mirrored.mime_type,
    width: mirrored.width,
    height: mirrored.height,
    byte_size: mirrored.byte_size,
    derivative_list: mirrored.derivative_list,
    archival_storage_key: mirrored.archival_storage_key,
    last_verified_at: mirrored.last_verified_at,
    retention_status: 'unavailable',
  }).eq('id', asset.id);
  if (duplicateError) throw duplicateError;

  if (asset.variant_id) {
    const sameVariant = existing.variant_id === asset.variant_id;
    const { error: variantError } = await supabase.schema('catalog').from('card_variants').update({
      native_image_status: sameVariant ? 'available' : 'same_artwork_reference',
      same_artwork_as_variant_id: sameVariant ? null : existing.variant_id,
    }).eq('id', asset.variant_id);
    if (variantError) throw variantError;
  }

  return {
    id: asset.id,
    status: 'reused_existing',
    canonicalAssetId: existing.id,
    bytes: mirrored.byte_size,
  };
}

async function reuseExactSourceMatch(supabase, asset, sourceUrl) {
  if (asset.asset_type !== 'card_image' || !asset.variant_id) return null;

  const { data: existing, error } = await supabase.schema('catalog').from('assets')
    .select([
      'id',
      'storage_provider',
      'storage_bucket',
      'storage_key',
      'content_sha256',
      'perceptual_hash',
      'mime_type',
      'width',
      'height',
      'byte_size',
      'derivative_list',
      'archival_storage_key',
      'last_verified_at',
    ].join(','))
    .eq('asset_type', 'card_image')
    .eq('original_source_url', sourceUrl)
    .in('storage_provider', ['supabase_storage', 's3_compatible', 'local_dev'])
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved')
    .eq('publicly_servable', true)
    .is('deprecated_at', null)
    .is('deleted_at', null)
    .neq('id', asset.id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!existing?.id) return null;

  return reuseExistingStorageObject(supabase, asset, existing);
}

async function markSourceUnavailable(supabase, asset, error) {
  const unavailableReason = `source_http_${error.status}`;
  const { error: assetError } = await supabase.schema('catalog').from('assets').update({
    storage_provider: 'unavailable',
    storage_bucket: null,
    storage_key: null,
    storage_path: null,
    externally_referenced: false,
    publicly_servable: false,
    unavailable_reason: unavailableReason,
    last_verified_at: new Date().toISOString(),
    retention_status: 'unavailable',
  }).eq('id', asset.id);
  if (assetError) throw assetError;

  if (asset.variant_id) {
    const { data: alternative, error: alternativeError } = await supabase.schema('catalog').from('assets')
      .select('id')
      .eq('variant_id', asset.variant_id)
      .eq('rights_status', 'approved')
      .eq('permission_status', 'approved')
      .eq('publicly_servable', true)
      .in('storage_provider', ['supabase_storage', 's3_compatible', 'local_dev'])
      .is('deprecated_at', null)
      .neq('id', asset.id)
      .limit(1)
      .maybeSingle();
    if (alternativeError) throw alternativeError;

    let fallbackVariantId = null;
    let fallbackAvailable = false;
    if (!alternative?.id) {
      const { data: variant, error: variantReadError } = await supabase.schema('catalog').from('card_variants')
        .select('same_artwork_as_variant_id')
        .eq('id', asset.variant_id)
        .maybeSingle();
      if (variantReadError) throw variantReadError;
      fallbackVariantId = variant?.same_artwork_as_variant_id ?? null;
      if (fallbackVariantId) {
        const { data: fallbackAsset, error: fallbackAssetError } = await supabase.schema('catalog').from('assets')
          .select('id')
          .eq('variant_id', fallbackVariantId)
          .eq('rights_status', 'approved')
          .eq('permission_status', 'approved')
          .eq('publicly_servable', true)
          .in('storage_provider', ['supabase_storage', 's3_compatible', 'local_dev'])
          .is('deprecated_at', null)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();
        if (fallbackAssetError) throw fallbackAssetError;
        fallbackAvailable = Boolean(fallbackAsset?.id);
      }
    }
    const { error: variantError } = await supabase.schema('catalog').from('card_variants').update({
      native_image_status: alternative?.id
        ? 'available'
        : fallbackAvailable
        ? 'same_artwork_reference'
        : 'scan_acquisition_required',
      same_artwork_as_variant_id: fallbackAvailable ? fallbackVariantId : null,
    }).eq('id', asset.variant_id);
    if (variantError) throw variantError;
  }

  return { id: asset.id, status: 'source_unavailable', reason: unavailableReason };
}

async function mirrorOne(supabase, storage, asset, options) {
  const sourceUrl = asset.original_source_url || asset.url;
  if (!sourceUrl) throw new Error('Approved asset has no source URL.');
  if (options.dryRun) return { id: asset.id, status: 'would_mirror' };

  const exactSourceReuse = await reuseExactSourceMatch(supabase, asset, sourceUrl);
  if (exactSourceReuse) return exactSourceReuse;

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
  if (error?.code === '23505' && String(error.message || '').includes('assets_storage_object_uidx')) {
    return reuseExistingStorageObject(supabase, asset, mirrored);
  }
  if (error) throw error;

  if (asset.variant_id) {
    const { error: variantError } = await supabase.schema('catalog').from('card_variants')
      .update({ native_image_status: 'available', same_artwork_as_variant_id: null })
      .eq('id', asset.variant_id);
    if (variantError) throw variantError;
  }
  return { id: asset.id, status: 'mirrored', bytes: mirrored.byte_size };
}

async function main() {
  if (hasFlag('help')) {
    console.log('node scripts/mirror-approved-catalogue-assets.mjs --provider=tcgdex --limit=100 --concurrency=2 --target=staging [--afterId=<uuid>] [--throughId=<uuid>] [--assetIds=<uuid,...>]');
    return;
  }
  requireStaging();
  const provider = arg('provider');
  if (!ALLOWED_PROVIDERS.has(provider)) throw new Error('Use --provider=tcgdex or --provider=pikaqian.');
  const limit = boundedInteger(arg('limit', '100'), 100, 1, 2000);
  const concurrency = boundedInteger(arg('concurrency', '2'), 2, 1, 6);
  const timeoutMs = boundedInteger(arg('timeoutMs', '30000'), 30000, 1000, 120000);
  const maxBytes = boundedInteger(arg('maxBytes', String(12 * 1024 * 1024)), 12 * 1024 * 1024, 1024, 25 * 1024 * 1024);
  const afterId = optionalUuidArg('afterId');
  const throughId = optionalUuidArg('throughId');
  const assetIds = uuidListArg('assetIds');
  if (afterId && throughId && afterId >= throughId) {
    throw new Error('--afterId must sort before --throughId.');
  }
  if (assetIds.length && (afterId || throughId)) {
    throw new Error('--assetIds cannot be combined with --afterId or --throughId.');
  }
  const dryRun = hasFlag('dry-run') || hasFlag('dryRun');
  const supabase = adminSupabase();
  const storage = new SupabaseObjectStorageAdapter(supabase);
  const sourceId = await providerSourceId(supabase, provider);
  let assetQuery = supabase.schema('catalog').from('assets')
    .select('id,asset_id,asset_type,variant_id,url,original_source_url,original_source_identifier,source_attribution')
    .eq('source_id', sourceId)
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved')
    .eq('storage_provider', 'external_reference')
    .eq('publicly_servable', true)
    .is('deprecated_at', null);
  if (afterId) assetQuery = assetQuery.gt('id', afterId);
  if (throughId) assetQuery = assetQuery.lte('id', throughId);
  if (assetIds.length) assetQuery = assetQuery.in('id', assetIds);
  const { data, error } = await assetQuery
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results = await mapWithConcurrency(data ?? [], concurrency, async (asset) => {
    try {
      return await mirrorOne(supabase, storage, asset, { provider, dryRun, timeoutMs, maxBytes });
    } catch (error) {
      if (error instanceof SourceImageUnavailableError && !dryRun) {
        try {
          return await markSourceUnavailable(supabase, asset, error);
        } catch (markError) {
          return { id: asset.id, status: 'failed', error: errorMessage(markError) };
        }
      }
      return { id: asset.id, status: 'deferred', error: errorMessage(error) };
    }
  });
  const summary = results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
  const deferredLimit = Math.min(MAX_DEFERRED_PER_BATCH, Math.max(results.length - 1, 0));
  const ok = !summary.failed && (summary.deferred ?? 0) <= deferredLimit;
  console.log(JSON.stringify({
    ok,
    provider,
    dryRun,
    range: { afterId: afterId || null, throughId: throughId || null, assetIds: assetIds.length || null },
    inspected: results.length,
    deferredLimit,
    summary,
    results,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: errorMessage(error) }, null, 2));
  process.exitCode = 1;
});
