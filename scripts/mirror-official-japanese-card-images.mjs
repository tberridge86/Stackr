#!/usr/bin/env node
import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

const SOURCE_CODE = 'pokemon_card_jp_official';
const BUCKET = 'stackr-catalogue-public';
const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const OFFICIAL_HOSTS = new Set(['www.pokemon-card.com', 'pokemon-card.com']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function chunks(values, size = 80) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
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

function absoluteOfficialUrl(value) {
  const text = clean(value);
  if (!text) return null;
  const url = new URL(text, 'https://www.pokemon-card.com');
  requireCondition(url.protocol === 'https:', `Image URL is not HTTPS: ${url.href}`);
  requireCondition(OFFICIAL_HOSTS.has(url.hostname), `Unexpected image host: ${url.hostname}`);
  return url.href;
}

function imageUrlFromPayload(payload) {
  return absoluteOfficialUrl(
    payload?.official_image_url
      ?? payload?.thumbnail_path
      ?? payload?.thumbnail_path_reference_only
      ?? payload?.image_url
      ?? null,
  );
}

function detectImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (
    buffer.length >= 8
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
    buffer.length >= 12
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
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    const isSof = (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    );
    if (isSof && segmentLength >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
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
    && buffer.length >= 30
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

async function fetchImage(url, attempts = 3) {
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
          Referer: 'https://www.pokemon-card.com/card-search/',
          'Accept-Language': 'ja,en-GB;q=0.8,en;q=0.7',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const advertisedLength = Number(response.headers.get('content-length') ?? 0);
      if (advertisedLength > MAX_IMAGE_BYTES) {
        throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes before download.`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new Error('Downloaded image is empty.');
      if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes.`);
      const detected = detectImage(buffer);
      const dimensions = imageDimensions(buffer, detected.mimeType);
      return {
        buffer,
        byteSize: buffer.length,
        ...detected,
        ...dimensions,
        responseContentType: clean(response.headers.get('content-type')),
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1_500);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Image fetch failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
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
  let nextIndex = 0;
  async function runner() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, ...(await worker(items[index], index)) };
      } catch (error) {
        results[index] = {
          ok: false,
          setCode: items[index].setCode,
          collectorNumber: items[index].collectorNumber,
          externalId: items[index].externalId,
          variantId: items[index].variantId,
          imageUrl: items[index].imageUrl,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => runner()));
  return results;
}

async function main() {
  const setCodes = unique((option('set-codes') ?? '').split(',').map((value) => clean(value)));
  const reportPath = path.resolve(option('report', 'reports/catalogue/japanese-image-mirror/report.json'));
  const target = clean(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const limit = Math.max(0, Number(option('limit', '0')) || 0);
  const concurrency = Math.max(1, Math.min(4, Number(option('concurrency', '2')) || 2));
  const delayMs = Math.max(250, Math.min(5_000, Number(option('delay-ms', '750')) || 750));
  const apply = hasFlag('apply');
  const refresh = hasFlag('refresh');
  const verifyPublic = hasFlag('verify-public');

  requireCondition(setCodes.length > 0, '--set-codes is required.');
  requireCondition(target === 'staging', 'Official image mirroring is restricted to staging.');
  requireCondition(apply, '--apply is required.');

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Expected StackR staging SUPABASE_URL.');
  requireCondition(!supabaseUrl.includes(PRODUCTION_PROJECT_REF), 'Production target detected; image mirror refused.');
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const catalog = db.schema('catalog');
  const ingest = db.schema('ingest');

  const { data: source, error: sourceError } = await ingest.from('sources')
    .select('id,code')
    .eq('code', SOURCE_CODE)
    .eq('active', true)
    .is('deprecated_at', null)
    .single();
  requireNoError(sourceError, 'load official Japanese source');

  const { data: sets, error: setError } = await catalog.from('sets')
    .select('id,set_code,native_name,total')
    .eq('language_code', 'ja')
    .in('set_code', setCodes)
    .is('deprecated_at', null);
  requireNoError(setError, 'load Japanese sets');
  const setsByCode = new Map((sets ?? []).map((row) => [row.set_code, row]));
  const missingSets = setCodes.filter((code) => !setsByCode.has(code));
  requireCondition(missingSets.length === 0, `Unknown active Japanese sets: ${missingSets.join(', ')}`);

  const printings = [];
  for (const setRow of sets ?? []) {
    const { data, error } = await catalog.from('card_printings')
      .select('id,set_id,collector_number,collector_number_sort_key,native_name')
      .eq('set_id', setRow.id)
      .eq('language_code', 'ja')
      .is('deprecated_at', null);
    requireNoError(error, `load printings for ${setRow.set_code}`);
    printings.push(...(data ?? []).map((row) => ({ ...row, setCode: setRow.set_code })));
  }
  const printingById = new Map(printings.map((row) => [row.id, row]));
  const printingIds = printings.map((row) => row.id);

  const variants = await selectInBatches(
    catalog.from('card_variants'),
    'printing_id',
    printingIds,
    'id,printing_id,variant_code,native_image_status',
    (query) => query.eq('language_code', 'ja').is('deprecated_at', null),
  );
  const variantById = new Map(variants.map((row) => [row.id, row]));
  const variantIds = variants.map((row) => row.id);

  const identifiers = await selectInBatches(
    ingest.from('external_identifiers'),
    'variant_id',
    variantIds,
    'id,external_id,external_uri,raw_record_id,variant_id,source_updated_at',
    (query) => query
      .eq('source_id', source.id)
      .eq('source_entity_type', 'card')
      .eq('language_code', 'ja')
      .eq('is_current', true)
      .is('deprecated_at', null),
  );
  const rawIds = unique(identifiers.map((row) => row.raw_record_id));
  const rawRows = await selectInBatches(
    ingest.from('raw_source_records'),
    'id',
    rawIds,
    'id,external_id,raw_payload,source_url,source_updated_at,validation_status,licence_status',
    (query) => query.eq('source_id', source.id).eq('record_type', 'card').eq('language_code', 'ja').is('deprecated_at', null),
  );
  const rawById = new Map(rawRows.map((row) => [row.id, row]));

  const assets = await selectInBatches(
    catalog.from('assets'),
    'variant_id',
    variantIds,
    'id,asset_id,variant_id,source_id,storage_provider,storage_bucket,storage_key,storage_path,url,content_sha256,derivative_list,publicly_servable,deprecated_at',
    (query) => query.eq('source_id', source.id).eq('asset_type', 'card_image').is('deprecated_at', null),
  );
  const assetsByVariant = new Map();
  for (const asset of assets) {
    const list = assetsByVariant.get(asset.variant_id) ?? [];
    list.push(asset);
    assetsByVariant.set(asset.variant_id, list);
  }
  const duplicateAssetVariants = [...assetsByVariant.entries()].filter(([, rows]) => rows.length > 1);
  requireCondition(duplicateAssetVariants.length === 0, `Multiple active official image assets found for ${duplicateAssetVariants.length} variants.`);

  const candidatesByVariant = new Map();
  for (const identifier of identifiers) {
    const variant = variantById.get(identifier.variant_id);
    const printing = variant ? printingById.get(variant.printing_id) : null;
    const raw = rawById.get(identifier.raw_record_id);
    requireCondition(variant && printing && raw, `Incomplete source chain for official ID ${identifier.external_id}.`);
    requireCondition(raw.validation_status === 'valid', `Raw source ${identifier.external_id} is not valid.`);
    requireCondition(raw.licence_status === 'approved', `Raw source ${identifier.external_id} is not approved.`);
    const imageUrl = imageUrlFromPayload(raw.raw_payload);
    requireCondition(imageUrl, `Official image URL is missing for ${identifier.external_id}.`);
    const candidate = {
      setCode: printing.setCode,
      setId: printing.set_id,
      printingId: printing.id,
      collectorNumber: printing.collector_number,
      collectorSortKey: printing.collector_number_sort_key ?? printing.collector_number,
      nativeName: printing.native_name,
      variantId: variant.id,
      variantCode: variant.variant_code,
      nativeImageStatus: variant.native_image_status,
      externalId: identifier.external_id,
      identifierId: identifier.id,
      rawId: raw.id,
      sourceUpdatedAt: raw.source_updated_at ?? identifier.source_updated_at ?? new Date().toISOString(),
      imageUrl,
      existingAsset: (assetsByVariant.get(variant.id) ?? [])[0] ?? null,
    };
    const existingCandidate = candidatesByVariant.get(variant.id);
    requireCondition(!existingCandidate, `Multiple official source identities point to variant ${variant.id}.`);
    candidatesByVariant.set(variant.id, candidate);
  }

  const allCandidates = [...candidatesByVariant.values()].sort((left, right) => (
    left.setCode.localeCompare(right.setCode)
      || left.collectorSortKey.localeCompare(right.collectorSortKey)
      || left.externalId.localeCompare(right.externalId)
  ));
  const readyBefore = allCandidates.filter((candidate) => (
    !refresh
      && candidate.existingAsset?.storage_provider === 'supabase_storage'
      && candidate.existingAsset?.storage_bucket === BUCKET
      && clean(candidate.existingAsset?.storage_key)
      && clean(candidate.existingAsset?.content_sha256)
      && candidate.existingAsset?.publicly_servable === true
  ));
  for (const candidate of readyBefore) {
    if (candidate.nativeImageStatus !== 'available') {
      const { error } = await catalog.from('card_variants')
        .update({ native_image_status: 'available', updated_at: new Date().toISOString() })
        .eq('id', candidate.variantId);
      requireNoError(error, 'restore available image status');
    }
  }

  const pendingCandidates = allCandidates.filter((candidate) => !readyBefore.includes(candidate));
  const selectedCandidates = limit > 0 ? pendingCandidates.slice(0, limit) : pendingCandidates;

  const results = await runPool(selectedCandidates, concurrency, async (candidate) => {
    const downloaded = await fetchImage(candidate.imageUrl);
    const contentSha256 = createHash('sha256').update(downloaded.buffer).digest('hex');
    const storageKey = `public/card_image/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}/original.${downloaded.extension}`;

    const { error: uploadError } = await db.storage.from(BUCKET).upload(storageKey, downloaded.buffer, {
      contentType: downloaded.mimeType,
      cacheControl: '31536000',
      upsert: true,
    });
    requireNoError(uploadError, `upload ${candidate.externalId}`);

    const { data: publicData } = db.storage.from(BUCKET).getPublicUrl(storageKey);
    const publicUrl = clean(publicData?.publicUrl);
    requireCondition(publicUrl, `Public URL was not generated for ${candidate.externalId}.`);

    let publicVerified = false;
    if (verifyPublic) {
      const response = await fetch(publicUrl, {
        headers: { Range: 'bytes=0-63', 'Cache-Control': 'no-cache' },
      });
      requireCondition(response.ok || response.status === 206, `Public URL verification failed with HTTP ${response.status}.`);
      publicVerified = true;
    }

    const now = new Date().toISOString();
    const existing = candidate.existingAsset;
    const derivativeList = existing?.content_sha256 === contentSha256 && Array.isArray(existing?.derivative_list)
      ? existing.derivative_list
      : [];
    const assetRow = {
      asset_id: `pokemon-card-jp-official:${candidate.externalId}`,
      asset_type: 'card_image',
      game_code: 'pokemon',
      set_id: candidate.setId,
      printing_id: candidate.printingId,
      variant_id: candidate.variantId,
      source_id: source.id,
      url: publicUrl,
      storage_path: storageKey,
      mime_type: downloaded.mimeType,
      width: downloaded.width,
      height: downloaded.height,
      sha256: contentSha256,
      rights_status: 'approved',
      publicly_servable: true,
      attribution_text: 'Pokémon Card Game Japan official card database',
      licensing_review_notes: 'Full Pokémon data and asset rights confirmed by the StackR owner.',
      source_updated_at: candidate.sourceUpdatedAt,
      deprecated_at: null,
      deprecated_reason: null,
      updated_at: now,
      asset_visibility: 'public_catalogue',
      storage_provider: 'supabase_storage',
      storage_bucket: BUCKET,
      storage_key: storageKey,
      original_source_url: candidate.imageUrl,
      original_source_identifier: candidate.externalId,
      source_attribution: 'Pokémon Card Game Japan',
      permission_status: 'approved',
      content_sha256: contentSha256,
      perceptual_hash: null,
      byte_size: downloaded.byteSize,
      derivative_list: derivativeList,
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
      recognition_reference_eligible: true,
    };

    let asset;
    if (existing?.id) {
      const { data, error } = await catalog.from('assets').update(assetRow).eq('id', existing.id).select('*').single();
      requireNoError(error, `update asset ${candidate.externalId}`);
      asset = data;
    } else {
      const { data, error } = await catalog.from('assets').insert(assetRow).select('*').single();
      requireNoError(error, `insert asset ${candidate.externalId}`);
      asset = data;
    }

    const { error: variantError } = await catalog.from('card_variants')
      .update({
        native_image_status: 'available',
        image_signature: contentSha256,
        source_updated_at: candidate.sourceUpdatedAt,
        updated_at: now,
      })
      .eq('id', candidate.variantId);
    requireNoError(variantError, `update variant ${candidate.externalId}`);

    await sleep(delayMs);
    return {
      setCode: candidate.setCode,
      collectorNumber: candidate.collectorNumber,
      externalId: candidate.externalId,
      variantId: candidate.variantId,
      assetId: asset.id,
      publicUrl,
      publicVerified,
      contentSha256,
      byteSize: downloaded.byteSize,
      mimeType: downloaded.mimeType,
      width: downloaded.width,
      height: downloaded.height,
      responseContentType: downloaded.responseContentType,
      storageKey,
      action: existing?.id ? 'updated' : 'inserted',
    };
  });

  const failures = results.filter((result) => !result.ok);
  const successes = results.filter((result) => result.ok);
  const successfulVariantIds = successes.map((result) => result.variantId);
  const verifiedAssets = await selectInBatches(
    catalog.from('assets'),
    'variant_id',
    successfulVariantIds,
    'id,variant_id,storage_bucket,storage_key,content_sha256,publicly_servable,rights_status,permission_status',
    (query) => query.eq('source_id', source.id).eq('asset_type', 'card_image').is('deprecated_at', null),
  );
  const verifiedByVariant = new Map(verifiedAssets.map((row) => [row.variant_id, row]));
  const unverifiedSuccesses = successes.filter((result) => {
    const asset = verifiedByVariant.get(result.variantId);
    return !asset
      || asset.storage_bucket !== BUCKET
      || !clean(asset.storage_key)
      || !clean(asset.content_sha256)
      || asset.publicly_servable !== true
      || asset.rights_status !== 'approved'
      || asset.permission_status !== 'approved';
  });

  const report = {
    ok: failures.length === 0 && unverifiedSuccesses.length === 0,
    target: 'staging',
    production_modified: false,
    set_codes: setCodes,
    candidate_variants: allCandidates.length,
    ready_before: readyBefore.length,
    pending_before: pendingCandidates.length,
    selected_for_run: selectedCandidates.length,
    processed_successfully: successes.length,
    failed: failures.length,
    unverified_successes: unverifiedSuccesses.map((result) => result.externalId),
    public_verification_requested: verifyPublic,
    public_urls_verified: successes.filter((result) => result.publicVerified).length,
    total_bytes_mirrored: successes.reduce((total, result) => total + result.byteSize, 0),
    remaining_after_run: Math.max(0, pendingCandidates.length - successes.length),
    complete_for_requested_sets: failures.length === 0 && limit === 0 && pendingCandidates.length === successes.length,
    successes,
    failures,
  };

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, successes: successes.slice(0, 10) }, null, 2));
  requireCondition(report.ok, 'One or more official Japanese images failed to mirror or verify.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
