#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { buildApprovedCatalogueAsset } from '../backend/lib/assetPipeline.js';
import { SupabaseObjectStorageAdapter } from '../backend/lib/objectStorage.js';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const ALLOWED_PROVIDERS = new Set(['tcgdex', 'pikaqian', 'pokemon_card_jp_official', 'pokedata_japanese']);
const ALLOWED_LANGUAGES = new Set(['en', 'ja', 'zh-cn', 'ko']);
const RETRYABLE_SOURCE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_SOURCE_ATTEMPTS = 3;
const MAX_DATABASE_ATTEMPTS = 3;
const MAX_DEFERRED_PER_BATCH = 5;
const MAX_SOURCE_REDIRECTS = 3;
const CANDIDATE_ASSET_COLUMNS = [
  'id',
  'asset_id',
  'asset_type',
  'set_id',
  'printing_id',
  'variant_id',
  'url',
  'original_source_url',
  'original_source_identifier',
  'source_attribution',
].join(',');
const LANGUAGE_SCOPES = [
  {
    relation: 'card_variants!assets_variant_id_fkey',
    requiredColumn: 'variant_id',
    emptyColumns: [],
  },
  {
    relation: 'card_printings!assets_printing_id_fkey',
    requiredColumn: 'printing_id',
    emptyColumns: ['variant_id'],
  },
  {
    relation: 'sets!assets_set_id_fkey',
    requiredColumn: 'set_id',
    emptyColumns: ['variant_id', 'printing_id'],
  },
];

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

function requiredLanguage(value) {
  const language = String(value ?? '').trim();
  if (!ALLOWED_LANGUAGES.has(language)) {
    throw new Error('Use --language=en, --language=ja, --language=zh-cn, or --language=ko.');
  }
  return language;
}

function percentage(count, total) {
  if (total === 0) return null;
  return Number(((count / total) * 100).toFixed(2));
}

function progressSummary(results, summary) {
  const total = results.length;
  const counts = {
    processed: (summary.mirrored ?? 0) + (summary.reused_existing ?? 0) + (summary.source_unavailable ?? 0),
    reused: summary.reused_existing ?? 0,
    mirrored: summary.mirrored ?? 0,
    deferred: summary.deferred ?? 0,
    unavailable: summary.source_unavailable ?? 0,
  };
  const metric = (count) => ({ count, percentage: percentage(count, total) });
  return {
    scope: 'batch',
    denominator: { name: 'inspected_assets', count: total },
    processed: {
      ...metric(counts.processed),
      statuses: ['mirrored', 'reused_existing', 'source_unavailable'],
    },
    reused: { ...metric(counts.reused), statuses: ['reused_existing'] },
    mirrored: { ...metric(counts.mirrored), statuses: ['mirrored'] },
    deferred: { ...metric(counts.deferred), statuses: ['deferred'] },
    unavailable: { ...metric(counts.unavailable), statuses: ['source_unavailable'] },
    wouldMirror: { ...metric(summary.would_mirror ?? 0), statuses: ['would_mirror'] },
    failed: { ...metric(summary.failed ?? 0), statuses: ['failed'] },
  };
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

function isRetryableDatabaseError(error) {
  const code = String(error?.code || '');
  const message = errorMessage(error).toLowerCase();
  return ['40001', '40P01', '53300', '57014', '57P03'].includes(code)
    || message.includes('statement timeout')
    || message.includes('fetch failed');
}

function requireStaging() {
  const target = String(arg('target') || process.env.STACKR_CATALOGUE_IMPORT_TARGET || '').trim().toLowerCase();
  const url = String(process.env.SUPABASE_URL ?? '');
  let origin = '';
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/' && !parsed.search && !parsed.hash && !parsed.username && !parsed.password) {
      origin = parsed.origin;
    }
  } catch {
    // The canonical-origin check below handles malformed URLs.
  }
  if (target !== 'staging' || origin !== `https://${STAGING_SUPABASE_REF}.supabase.co`) {
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

function sourceRequestHeaders(provider) {
  const headers = { Accept: 'image/avif,image/webp,image/png,image/jpeg' };
  if (provider === 'pokemon_card_jp_official') {
    return {
      ...headers,
      Referer: 'https://www.pokemon-card.com/card-search/',
      'User-Agent': 'StackR-Catalogue-Image-Mirror/1.0 (+https://stackrtcg.com)',
    };
  }
  if (provider === 'pokedata_japanese') {
    return {
      ...headers,
      Referer: 'https://www.pokedata.io/',
      'User-Agent': 'StackR-Catalogue-Image-Mirror/1.0 (+https://stackrtcg.com)',
    };
  }
  return headers;
}

function hostMatches(hostname, root) {
  return hostname === root || hostname.endsWith(`.${root}`);
}

export function validateProviderSourceUrl(provider, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${provider} source image URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`${provider} source images must use credential-free HTTPS URLs.`);
  }
  if (provider === 'pokemon_card_jp_official') {
    if (url.hostname !== 'www.pokemon-card.com'
      || !url.pathname.startsWith('/assets/images/card_images/large/')) {
      throw new Error('Official Japanese images must remain on the reviewed large-card image path.');
    }
  } else if (provider === 'tcgdex') {
    if (!hostMatches(url.hostname, 'tcgdex.net')) {
      throw new Error('TCGdex images must remain on a tcgdex.net host.');
    }
  } else if (provider === 'pikaqian') {
    if (!hostMatches(url.hostname, 'pikaqian.com')) {
      throw new Error('PikaQian images must remain on a pikaqian.com host.');
    }
  } else if (provider === 'pokedata_japanese') {
    if (url.hostname !== 'pokemoncardimages.pokedata.io'
      || !url.pathname.startsWith('/images/')
      || url.pathname.toLowerCase() === '/images/placeholder.webp') {
      throw new Error('PokeData Japanese images must remain on the reviewed card-image host and cannot use the placeholder.');
    }
  } else {
    throw new Error(`Unsupported source-image provider: ${provider}.`);
  }
  return url;
}

async function fetchApprovedSource(url, options) {
  let current = validateProviderSourceUrl(options.provider, url);
  for (let redirectCount = 0; redirectCount <= MAX_SOURCE_REDIRECTS; redirectCount += 1) {
    const response = await fetch(current, {
      headers: sourceRequestHeaders(options.provider),
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => undefined);
    if (!location) throw new Error('Source image redirect omitted its destination.');
    if (redirectCount === MAX_SOURCE_REDIRECTS) throw new Error('Source image exceeded the redirect limit.');
    current = validateProviderSourceUrl(options.provider, new URL(location, current).href);
  }
  throw new Error('Source image redirect validation failed.');
}

async function downloadApprovedImage(url, timeoutMs, maxBytes, provider) {
  validateProviderSourceUrl(provider, url);
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_SOURCE_ATTEMPTS; attempt += 1) {
    let response = null;
    try {
      response = await fetchApprovedSource(url, { provider, timeoutMs });
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

function scopedCandidateQuery(supabase, input, scope) {
  let query = supabase.schema('catalog').from('assets')
    .select(`${CANDIDATE_ASSET_COLUMNS},language_scope:${scope.relation}!inner(language_code)`)
    .eq('source_id', input.sourceId)
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved')
    .eq('storage_provider', 'external_reference')
    .eq('publicly_servable', true)
    .eq('language_scope.language_code', input.language)
    .not(scope.requiredColumn, 'is', null)
    .is('deprecated_at', null)
    .is('deleted_at', null);
  for (const column of scope.emptyColumns) query = query.is(column, null);
  if (input.afterId) query = query.gt('id', input.afterId);
  if (input.throughId) query = query.lte('id', input.throughId);
  if (input.assetIds.length) query = query.in('id', input.assetIds);
  return query.order('id', { ascending: true }).limit(input.limit);
}

async function languageScopedCandidates(supabase, input) {
  const responses = await Promise.all(LANGUAGE_SCOPES.map((scope) => scopedCandidateQuery(supabase, input, scope)));
  const assetsById = new Map();
  for (const response of responses) {
    if (response.error) throw response.error;
    for (const candidate of response.data ?? []) {
      const { language_scope: languageScope, ...asset } = candidate;
      if (languageScope?.language_code !== input.language) {
        throw new Error(`Candidate asset ${asset.id} did not resolve to requested language ${input.language}.`);
      }
      assetsById.set(asset.id, asset);
    }
  }
  return [...assetsById.values()]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .slice(0, input.limit);
}

async function reuseExistingStorageObject(supabase, asset, mirrored) {
  const { data: existing, error: existingError } = await supabase.schema('catalog').from('assets')
    .select('id,asset_id,variant_id,printing_id,url,storage_path')
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

  // Content-addressed storage means the canonical row and this duplicate point
  // at the same immutable original. Keep one physical object, but promote the
  // newly generated validation and derivative metadata onto the canonical row
  // before retiring the duplicate reference.
  const { error: canonicalError } = await supabase.schema('catalog').from('assets').update({
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
  }).eq('id', existing.id);
  if (canonicalError) throw canonicalError;

  let sameVariant = false;
  let safeSamePrintingAlias = false;
  if (asset.variant_id && existing.variant_id) {
    sameVariant = existing.variant_id === asset.variant_id;
    if (!sameVariant) {
      const { data: variantScopes, error: scopeError } = await supabase.schema('catalog').from('card_variants')
        .select('id,printing_id,language_code')
        .in('id', [asset.variant_id, existing.variant_id]);
      if (scopeError) throw scopeError;
      const targetScope = (variantScopes ?? []).find((row) => row.id === asset.variant_id);
      const existingScope = (variantScopes ?? []).find((row) => row.id === existing.variant_id);
      safeSamePrintingAlias = Boolean(
        targetScope?.printing_id
        && targetScope.printing_id === existingScope?.printing_id
        && targetScope.language_code === existingScope?.language_code,
      );
    }
  }

  const shareAcrossDistinctIdentity = asset.asset_type === 'card_image'
    && asset.variant_id
    && existing.variant_id
    && !sameVariant
    && !safeSamePrintingAlias;
  if (shareAcrossDistinctIdentity) {
    // Exact source/content equality is valid evidence for both identities. Keep
    // separate provenance rows while sharing one immutable physical object.
    const { error: sharedError } = await supabase.schema('catalog').from('assets').update({
      url: existing.url,
      storage_provider: mirrored.storage_provider,
      storage_bucket: mirrored.storage_bucket,
      storage_key: mirrored.storage_key,
      storage_path: mirrored.storage_path ?? existing.storage_path ?? mirrored.storage_key,
      externally_referenced: false,
      publicly_servable: true,
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
    }).eq('id', asset.id);
    if (sharedError) throw sharedError;
    const { error: variantError } = await supabase.schema('catalog').from('card_variants').update({
      native_image_status: 'available',
      same_artwork_as_variant_id: null,
    }).eq('id', asset.variant_id);
    if (variantError) throw variantError;
    return {
      id: asset.id,
      status: 'reused_existing',
      canonicalAssetId: existing.id,
      sharedPhysicalObject: true,
      bytes: mirrored.byte_size,
    };
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
    const { error: variantError } = await supabase.schema('catalog').from('card_variants').update({
      native_image_status: sameVariant
        ? 'available'
        : safeSamePrintingAlias
          ? 'same_artwork_reference'
          : 'scan_acquisition_required',
      same_artwork_as_variant_id: safeSamePrintingAlias ? existing.variant_id : null,
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
      'asset_id',
      'variant_id',
      'printing_id',
      'url',
      'storage_provider',
      'storage_bucket',
      'storage_key',
      'storage_path',
      'sha256',
      'content_sha256',
      'perceptual_hash',
      'mime_type',
      'width',
      'height',
      'byte_size',
      'derivative_list',
      'cache_control',
      'archival_storage_key',
      'last_verified_at',
      'retention_status',
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

  const image = await downloadApprovedImage(sourceUrl, options.timeoutMs, options.maxBytes, options.provider);
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

async function mirrorOneWithDatabaseRetry(supabase, storage, asset, options) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_DATABASE_ATTEMPTS; attempt += 1) {
    try {
      return await mirrorOne(supabase, storage, asset, options);
    } catch (error) {
      lastError = error;
      if (!isRetryableDatabaseError(error) || attempt === MAX_DATABASE_ATTEMPTS) throw error;
      await sleep(250 * (2 ** (attempt - 1)));
    }
  }
  throw lastError ?? new Error('Catalogue asset mirror failed.');
}

async function main() {
  if (hasFlag('help')) {
    console.log('node scripts/mirror-approved-catalogue-assets.mjs --provider=tcgdex|pikaqian|pokemon_card_jp_official|pokedata_japanese --language=en|ja|zh-cn|ko --limit=100 --concurrency=2 --target=staging [--afterId=<uuid>] [--throughId=<uuid>] [--assetIds=<uuid,...>]');
    return;
  }
  requireStaging();
  const provider = arg('provider');
  if (!ALLOWED_PROVIDERS.has(provider)) {
    throw new Error('Use --provider=tcgdex, --provider=pikaqian, --provider=pokemon_card_jp_official, or --provider=pokedata_japanese.');
  }
  const language = requiredLanguage(arg('language'));
  if (provider === 'pikaqian' && language !== 'zh-cn') {
    throw new Error('PikaQian catalogue assets are restricted to --language=zh-cn.');
  }
  if (provider === 'pokemon_card_jp_official' && language !== 'ja') {
    throw new Error('Official Japanese catalogue assets are restricted to --language=ja.');
  }
  if (provider === 'pokedata_japanese' && language !== 'ja') {
    throw new Error('PokeData Japanese catalogue assets are restricted to --language=ja.');
  }
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
  const candidates = await languageScopedCandidates(supabase, {
    sourceId,
    language,
    afterId,
    throughId,
    assetIds,
    limit,
  });

  const results = await mapWithConcurrency(candidates, concurrency, async (asset) => {
    try {
      return await mirrorOneWithDatabaseRetry(supabase, storage, asset, {
        provider,
        dryRun,
        timeoutMs,
        maxBytes,
      });
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
  const degraded = Boolean(summary.failed) || (summary.deferred ?? 0) > deferredLimit;
  const ok = !summary.failed;
  const progress = progressSummary(results, summary);
  const cursor = {
    scope: 'language_candidate_scan',
    nextAfterId: assetIds.length === 0 && candidates.length > 0 ? candidates[candidates.length - 1].id : null,
    exhausted: assetIds.length > 0 || candidates.length < limit,
  };
  console.log(JSON.stringify({
    schemaVersion: 1,
    ok,
    degraded,
    provider,
    language,
    dryRun,
    range: { afterId: afterId || null, throughId: throughId || null, assetIds: assetIds.length || null },
    inspected: results.length,
    deferredLimit,
    cursor,
    summary,
    progress,
    results,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: errorMessage(error) }, null, 2));
    process.exitCode = 1;
  });
}
