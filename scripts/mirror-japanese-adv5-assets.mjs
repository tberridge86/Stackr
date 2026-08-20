#!/usr/bin/env node
import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const SOURCE_CODE = 'pokecardex';
const BUCKET = 'stackr-catalogue-public';
const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const ALLOWED_HOSTS = new Set(['www.pokecardex.com', 'pokecardex.com']);
const MAX_BYTES = 20 * 1024 * 1024;
const EXPECTED_CARD_COUNT = 83;

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function clean(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function chunks(values, size = 80) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message ?? String(error)}`);
}

function sourceUrl(value) {
  const text = clean(value);
  requireCondition(text, 'Asset source URL is missing.');
  const url = new URL(text);
  requireCondition(url.protocol === 'https:', `Asset URL is not HTTPS: ${url.href}`);
  requireCondition(ALLOWED_HOSTS.has(url.hostname), `Unexpected asset host: ${url.hostname}`);
  return url;
}

function candidateUrls(value, desiredWidth = 1000) {
  const original = sourceUrl(value);
  const urls = [];

  const highResolution = new URL(original.href);
  highResolution.searchParams.set('w', String(desiredWidth));
  urls.push(highResolution.href);

  const noWidth = new URL(original.href);
  noWidth.searchParams.delete('w');
  urls.push(noWidth.href);

  urls.push(original.href);
  return unique(urls);
}

function detectImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (
    buffer.length >= 24
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (
    buffer.length >= 30
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  throw new Error('Downloaded bytes are not JPEG, PNG or WebP.');
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = buffer[offset + 1];
    while (marker === 0xff && offset + 2 < buffer.length) {
      offset += 1;
      marker = buffer[offset + 1];
    }
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isSof = (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    );
    if (isSof && length >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return { width: null, height: null };
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return { width: null, height: null };
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function webpDimensions(buffer) {
  if (buffer.length < 30) return { width: null, height: null };
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8L' && buffer[20] === 0x2f && buffer.length >= 25) {
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    return {
      width: 1 + (b1 | ((b2 & 0x3f) << 8)),
      height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
    };
  }
  if (
    chunk === 'VP8 '
    && buffer[23] === 0x9d
    && buffer[24] === 0x01
    && buffer[25] === 0x2a
  ) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return { width: null, height: null };
}

function imageDimensions(buffer, mimeType) {
  if (mimeType === 'image/jpeg') return jpegDimensions(buffer);
  if (mimeType === 'image/png') return pngDimensions(buffer);
  if (mimeType === 'image/webp') return webpDimensions(buffer);
  return { width: null, height: null };
}

async function fetchOne(url, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'StackR-Catalogue-Asset-Mirror/1.0 (+https://stackrtcg.com)',
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
          Referer: 'https://www.pokecardex.com/series/jp/ADV5',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-GB;q=0.8,en;q=0.7',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const advertisedLength = Number(response.headers.get('content-length') ?? 0);
      if (advertisedLength > MAX_BYTES) throw new Error('Advertised asset exceeds the size ceiling.');
      const buffer = Buffer.from(await response.arrayBuffer());
      requireCondition(buffer.length > 0, 'Downloaded asset is empty.');
      requireCondition(buffer.length <= MAX_BYTES, 'Downloaded asset exceeds the size ceiling.');
      const detected = detectImage(buffer);
      const dimensions = imageDimensions(buffer, detected.mimeType);
      return {
        sourceUrl: url,
        buffer,
        byteSize: buffer.length,
        responseContentType: clean(response.headers.get('content-type')),
        ...detected,
        ...dimensions,
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1_500);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Asset fetch failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function fetchBest(value, desiredWidth, minimumWidth) {
  const successes = [];
  const failures = [];
  for (const url of candidateUrls(value, desiredWidth)) {
    try {
      const result = await fetchOne(url);
      successes.push(result);
    } catch (error) {
      failures.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  requireCondition(successes.length > 0, `No asset URL succeeded: ${JSON.stringify(failures)}`);
  successes.sort((left, right) => (
    ((right.width ?? 0) * (right.height ?? 0)) - ((left.width ?? 0) * (left.height ?? 0))
      || right.byteSize - left.byteSize
  ));
  const selected = successes[0];
  requireCondition((selected.width ?? 0) >= minimumWidth,
    `Best asset width ${selected.width ?? 'unknown'} is below minimum ${minimumWidth}.`);
  return { ...selected, attemptedUrls: candidateUrls(value, desiredWidth), failures };
}

async function selectInBatches(table, column, values, columns, configure = (query) => query) {
  const rows = [];
  for (const batch of chunks(unique(values))) {
    if (!batch.length) continue;
    const { data, error } = await configure(table.select(columns).in(column, batch));
    requireNoError(error, `select ${column}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, ...(await worker(items[index])) };
      } catch (error) {
        results[index] = {
          ok: false,
          identity: items[index].identity,
          assetType: items[index].assetType,
          sourceUrl: items[index].sourceUrl,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => runner()));
  return results;
}

async function main() {
  const setCode = clean(option('set-code', 'ADV5'));
  const reportPath = path.resolve(option('report', 'reports/catalogue/japanese-adv5-composite/asset-report.json'));
  const target = clean(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const concurrency = Math.max(1, Math.min(4, Number(option('concurrency', '2')) || 2));
  const delayMs = Math.max(250, Math.min(5_000, Number(option('delay-ms', '750')) || 750));
  const apply = hasFlag('apply');
  const verifyPublic = hasFlag('verify-public');

  requireCondition(setCode === 'ADV5', 'This worker is restricted to ADV5.');
  requireCondition(target === 'staging', 'ADV5 asset mirroring is restricted to staging.');
  requireCondition(apply, '--apply is required.');

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Expected StackR staging SUPABASE_URL.');
  requireCondition(!supabaseUrl.includes(PRODUCTION_PROJECT_REF), 'Production target detected; ADV5 asset mirror refused.');
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const catalog = db.schema('catalog');
  const ingest = db.schema('ingest');

  const { data: source, error: sourceError } = await ingest.from('sources')
    .select('id,code')
    .eq('code', SOURCE_CODE)
    .eq('active', true)
    .is('deprecated_at', null)
    .single();
  requireNoError(sourceError, 'load PokéCardex source');

  const { data: sets, error: setError } = await catalog.from('sets')
    .select('id,set_code,total,native_name,english_display_name')
    .eq('language_code', 'ja')
    .eq('set_code', setCode)
    .is('deprecated_at', null);
  requireNoError(setError, 'load Japanese ADV5 set');
  requireCondition(sets?.length === 1, 'Expected one active Japanese ADV5 set.');
  const setRow = sets[0];
  requireCondition(setRow.total === EXPECTED_CARD_COUNT, `ADV5 total is ${setRow.total}, not 83.`);

  const { data: printings, error: printingError } = await catalog.from('card_printings')
    .select('id,set_id,collector_number,collector_number_sort_key,native_name')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null);
  requireNoError(printingError, 'load ADV5 printings');
  requireCondition((printings ?? []).length === EXPECTED_CARD_COUNT, 'ADV5 printing count is not 83.');
  const printingById = new Map((printings ?? []).map((row) => [row.id, row]));
  const printingIds = [...printingById.keys()];

  const variants = await selectInBatches(
    catalog.from('card_variants'),
    'printing_id',
    printingIds,
    'id,printing_id,variant_code,native_image_status',
    (query) => query.eq('language_code', 'ja').is('deprecated_at', null),
  );
  requireCondition(new Set(variants.map((row) => row.printing_id)).size === EXPECTED_CARD_COUNT,
    'ADV5 variant coverage is not 83 printings.');
  const variantById = new Map(variants.map((row) => [row.id, row]));
  const variantIds = [...variantById.keys()];

  const identifiers = await selectInBatches(
    ingest.from('external_identifiers'),
    'variant_id',
    variantIds,
    'id,external_id,raw_record_id,variant_id,source_updated_at',
    (query) => query
      .eq('source_id', source.id)
      .eq('source_entity_type', 'card')
      .eq('language_code', 'ja')
      .eq('is_current', true)
      .is('deprecated_at', null),
  );
  requireCondition(identifiers.length === EXPECTED_CARD_COUNT, `Expected 83 PokéCardex card identifiers, found ${identifiers.length}.`);
  const rawIds = unique(identifiers.map((row) => row.raw_record_id));
  const rawRows = await selectInBatches(
    ingest.from('raw_source_records'),
    'id',
    rawIds,
    'id,external_id,raw_payload,source_updated_at,validation_status,licence_status',
    (query) => query
      .eq('source_id', source.id)
      .eq('record_type', 'card')
      .eq('language_code', 'ja')
      .is('deprecated_at', null),
  );
  const rawById = new Map(rawRows.map((row) => [row.id, row]));

  const existingCardAssets = await selectInBatches(
    catalog.from('assets'),
    'variant_id',
    variantIds,
    'id,asset_id,variant_id,storage_provider,storage_bucket,storage_key,content_sha256,publicly_servable,rights_status,permission_status,derivative_list',
    (query) => query.eq('source_id', source.id).eq('asset_type', 'card_image').is('deprecated_at', null).is('deleted_at', null),
  );
  const cardAssetByVariant = new Map();
  for (const asset of existingCardAssets) {
    requireCondition(!cardAssetByVariant.has(asset.variant_id), `Multiple active PokéCardex assets exist for variant ${asset.variant_id}.`);
    cardAssetByVariant.set(asset.variant_id, asset);
  }

  const jobs = [];
  for (const identifier of identifiers) {
    const variant = variantById.get(identifier.variant_id);
    const printing = variant ? printingById.get(variant.printing_id) : null;
    const raw = rawById.get(identifier.raw_record_id);
    requireCondition(variant && printing && raw, `Incomplete ADV5 source chain for ${identifier.external_id}.`);
    requireCondition(raw.validation_status === 'valid' && raw.licence_status === 'approved',
      `ADV5 raw source ${identifier.external_id} is not approved and valid.`);
    const imageUrl = clean(raw.raw_payload?.image_url);
    requireCondition(imageUrl, `ADV5 image URL is missing for ${identifier.external_id}.`);
    const existingAsset = cardAssetByVariant.get(variant.id) ?? null;
    const ready = existingAsset
      && existingAsset.storage_provider === 'supabase_storage'
      && existingAsset.storage_bucket === BUCKET
      && clean(existingAsset.storage_key)
      && clean(existingAsset.content_sha256)
      && existingAsset.publicly_servable === true
      && existingAsset.rights_status === 'approved'
      && existingAsset.permission_status === 'approved';
    if (ready) {
      if (variant.native_image_status !== 'available') {
        const { error } = await catalog.from('card_variants')
          .update({ native_image_status: 'available', updated_at: new Date().toISOString() })
          .eq('id', variant.id);
        requireNoError(error, `restore ADV5 available status ${printing.collector_number}`);
      }
      continue;
    }
    jobs.push({
      identity: `ADV5-${printing.collector_number}`,
      assetType: 'card_image',
      sourceUrl: imageUrl,
      desiredWidth: 1000,
      minimumWidth: 600,
      setId: setRow.id,
      printingId: printing.id,
      variantId: variant.id,
      collectorNumber: printing.collector_number,
      originalSourceIdentifier: identifier.external_id,
      sourceUpdatedAt: raw.source_updated_at ?? identifier.source_updated_at ?? new Date().toISOString(),
      existingAsset,
    });
  }

  const { data: setRawRows, error: setRawError } = await ingest.from('raw_source_records')
    .select('id,raw_payload,source_updated_at')
    .eq('source_id', source.id)
    .eq('record_type', 'set')
    .eq('external_id', 'ADV5')
    .eq('language_code', 'ja')
    .is('deprecated_at', null)
    .order('retrieved_at', { ascending: false })
    .limit(2);
  requireNoError(setRawError, 'load PokéCardex ADV5 set record');
  requireCondition((setRawRows ?? []).length === 1, 'Expected one active PokéCardex ADV5 set record.');
  const setPayload = setRawRows[0].raw_payload ?? {};

  const { data: existingSetAssets, error: setAssetError } = await catalog.from('assets')
    .select('id,asset_id,asset_type,storage_provider,storage_bucket,storage_key,content_sha256,publicly_servable,rights_status,permission_status,derivative_list')
    .eq('source_id', source.id)
    .eq('set_id', setRow.id)
    .in('asset_type', ['set_logo', 'set_symbol'])
    .is('deprecated_at', null)
    .is('deleted_at', null);
  requireNoError(setAssetError, 'load existing ADV5 set assets');
  const setAssetByType = new Map();
  for (const asset of existingSetAssets ?? []) {
    requireCondition(!setAssetByType.has(asset.asset_type), `Multiple active ${asset.asset_type} assets exist for ADV5.`);
    setAssetByType.set(asset.asset_type, asset);
  }

  for (const config of [
    { assetType: 'set_logo', value: setPayload.logo_url, identifier: 'ADV5-logo', desiredWidth: 1200, minimumWidth: 150 },
    { assetType: 'set_symbol', value: setPayload.symbol_url, identifier: 'ADV5-symbol', desiredWidth: 800, minimumWidth: 40 },
  ]) {
    const url = clean(config.value);
    requireCondition(url, `${config.assetType} source URL is missing.`);
    const existingAsset = setAssetByType.get(config.assetType) ?? null;
    const ready = existingAsset
      && existingAsset.storage_provider === 'supabase_storage'
      && existingAsset.storage_bucket === BUCKET
      && clean(existingAsset.storage_key)
      && clean(existingAsset.content_sha256)
      && existingAsset.publicly_servable === true
      && existingAsset.rights_status === 'approved'
      && existingAsset.permission_status === 'approved';
    if (ready) continue;
    jobs.push({
      identity: config.identifier,
      assetType: config.assetType,
      sourceUrl: url,
      desiredWidth: config.desiredWidth,
      minimumWidth: config.minimumWidth,
      setId: setRow.id,
      printingId: null,
      variantId: null,
      collectorNumber: null,
      originalSourceIdentifier: config.identifier,
      sourceUpdatedAt: setRawRows[0].source_updated_at ?? new Date().toISOString(),
      existingAsset,
    });
  }

  const results = await runPool(jobs, concurrency, async (job) => {
    const downloaded = await fetchBest(job.sourceUrl, job.desiredWidth, job.minimumWidth);
    const contentSha256 = createHash('sha256').update(downloaded.buffer).digest('hex');
    const storageKey = `public/${job.assetType}/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}/original.${downloaded.extension}`;

    const { error: uploadError } = await db.storage.from(BUCKET).upload(storageKey, downloaded.buffer, {
      contentType: downloaded.mimeType,
      cacheControl: '31536000',
      upsert: true,
    });
    requireNoError(uploadError, `upload ${job.identity}`);
    const { data: publicData } = db.storage.from(BUCKET).getPublicUrl(storageKey);
    const publicUrl = clean(publicData?.publicUrl);
    requireCondition(publicUrl, `Public URL was not generated for ${job.identity}.`);

    let publicVerified = false;
    if (verifyPublic) {
      const response = await fetch(publicUrl, { headers: { Range: 'bytes=0-63', 'Cache-Control': 'no-cache' } });
      requireCondition(response.ok || response.status === 206, `Public URL returned HTTP ${response.status}.`);
      publicVerified = true;
    }

    const now = new Date().toISOString();
    const old = job.existingAsset;
    const assetRow = {
      asset_id: `pokecardex:${job.originalSourceIdentifier}`,
      asset_type: job.assetType,
      game_code: 'pokemon',
      set_id: job.setId,
      printing_id: job.printingId,
      variant_id: job.variantId,
      source_id: source.id,
      url: publicUrl,
      storage_path: storageKey,
      mime_type: downloaded.mimeType,
      width: downloaded.width,
      height: downloaded.height,
      sha256: contentSha256,
      rights_status: 'approved',
      publicly_servable: true,
      attribution_text: 'PokéCardex',
      licensing_review_notes: 'Full Pokémon data and asset rights confirmed by the StackR owner.',
      source_updated_at: job.sourceUpdatedAt,
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: now,
      asset_visibility: 'public_catalogue',
      storage_provider: 'supabase_storage',
      storage_bucket: BUCKET,
      storage_key: storageKey,
      original_source_url: downloaded.sourceUrl,
      original_source_identifier: job.originalSourceIdentifier,
      source_attribution: 'PokéCardex',
      permission_status: 'approved',
      content_sha256: contentSha256,
      perceptual_hash: null,
      byte_size: downloaded.byteSize,
      derivative_list: old?.content_sha256 === contentSha256 && Array.isArray(old?.derivative_list)
        ? old.derivative_list
        : [],
      cache_control: 'public, max-age=31536000, immutable',
      archival_storage_key: null,
      externally_referenced: false,
      unavailable_reason: null,
      last_verified_at: now,
      retention_status: 'active',
      retention_until: null,
      deleted_at: null,
      deletion_reason: null,
      acquisition_source: 'provider_url',
      recognition_reference_eligible: job.assetType === 'card_image',
    };

    let asset;
    if (old?.id) {
      const { data, error } = await catalog.from('assets').update(assetRow).eq('id', old.id).select('*').single();
      requireNoError(error, `update asset ${job.identity}`);
      asset = data;
    } else {
      const { data, error } = await catalog.from('assets').insert(assetRow).select('*').single();
      requireNoError(error, `insert asset ${job.identity}`);
      asset = data;
    }

    if (job.variantId) {
      const { error } = await catalog.from('card_variants')
        .update({
          native_image_status: 'available',
          image_signature: contentSha256,
          source_updated_at: job.sourceUpdatedAt,
          updated_at: now,
        })
        .eq('id', job.variantId);
      requireNoError(error, `update ADV5 variant ${job.collectorNumber}`);
    }

    await sleep(delayMs);
    return {
      identity: job.identity,
      assetType: job.assetType,
      collectorNumber: job.collectorNumber,
      assetId: asset.id,
      sourceUrl: downloaded.sourceUrl,
      attemptedUrls: downloaded.attemptedUrls,
      publicUrl,
      publicVerified,
      contentSha256,
      storageKey,
      mimeType: downloaded.mimeType,
      width: downloaded.width,
      height: downloaded.height,
      byteSize: downloaded.byteSize,
      action: old?.id ? 'updated' : 'inserted',
    };
  });

  const successes = results.filter((row) => row.ok);
  const failures = results.filter((row) => !row.ok);

  const { count: cardAssetCount, error: cardCountError } = await catalog.from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', source.id)
    .eq('set_id', setRow.id)
    .eq('asset_type', 'card_image')
    .eq('publicly_servable', true)
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved')
    .is('deprecated_at', null)
    .is('deleted_at', null);
  requireNoError(cardCountError, 'verify ADV5 card-image assets');

  const { data: setAssets, error: setVerifyError } = await catalog.from('assets')
    .select('asset_type,id,storage_key,content_sha256,publicly_servable,rights_status,permission_status')
    .eq('source_id', source.id)
    .eq('set_id', setRow.id)
    .in('asset_type', ['set_logo', 'set_symbol'])
    .is('deprecated_at', null)
    .is('deleted_at', null);
  requireNoError(setVerifyError, 'verify ADV5 set assets');
  const validSetAssetTypes = new Set((setAssets ?? [])
    .filter((asset) => asset.publicly_servable && asset.rights_status === 'approved' && asset.permission_status === 'approved'
      && clean(asset.storage_key) && clean(asset.content_sha256))
    .map((asset) => asset.asset_type));

  const { count: availableVariantCount, error: variantCountError } = await catalog.from('card_variants')
    .select('id', { count: 'exact', head: true })
    .in('id', variantIds)
    .eq('native_image_status', 'available')
    .is('deprecated_at', null);
  requireNoError(variantCountError, 'verify ADV5 available variants');

  const report = {
    ok: failures.length === 0
      && cardAssetCount === EXPECTED_CARD_COUNT
      && availableVariantCount === EXPECTED_CARD_COUNT
      && validSetAssetTypes.has('set_logo')
      && validSetAssetTypes.has('set_symbol'),
    target: 'staging',
    production_modified: false,
    set_code: setCode,
    jobs_selected: jobs.length,
    processed_successfully: successes.length,
    failed: failures.length,
    public_urls_verified: successes.filter((row) => row.publicVerified).length,
    card_image_assets: cardAssetCount ?? 0,
    variants_available: availableVariantCount ?? 0,
    set_logo_available: validSetAssetTypes.has('set_logo'),
    set_symbol_available: validSetAssetTypes.has('set_symbol'),
    total_bytes_mirrored: successes.reduce((sum, row) => sum + row.byteSize, 0),
    successes,
    failures,
  };

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, successes: successes.slice(0, 10) }, null, 2));
  requireCondition(report.ok, 'ADV5 asset mirror did not reach zero gaps.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
