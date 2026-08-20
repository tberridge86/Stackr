#!/usr/bin/env node
import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';

const SOURCE_CODE = 'pokemon_card_jp_official';
const BUCKET = 'stackr-catalogue-public';
const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_CONVERTED_BYTES = 20 * 1024 * 1024;

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
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

function imageUrlFromPayload(payload) {
  const value = clean(
    payload?.official_image_url
      ?? payload?.thumbnail_path
      ?? payload?.thumbnail_path_reference_only
      ?? payload?.image_url,
  );
  if (!value) return null;
  const url = new URL(value, 'https://www.pokemon-card.com');
  requireCondition(url.protocol === 'https:', `Non-HTTPS source URL: ${url.href}`);
  requireCondition(['www.pokemon-card.com', 'pokemon-card.com'].includes(url.hostname), `Unexpected source host: ${url.hostname}`);
  return url.href;
}

function isGif(buffer) {
  return buffer.length >= 6
    && (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a');
}

function isPng(buffer) {
  return buffer.length >= 24
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
    && buffer.toString('ascii', 12, 16) === 'IHDR';
}

function pngDimensions(buffer) {
  requireCondition(isPng(buffer), 'Converted output is not a valid PNG.');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function convertGifToPng(buffer) {
  const conversion = spawnSync('python3', ['scripts/convert-gif-first-frame-to-png.py'], {
    input: buffer,
    maxBuffer: MAX_CONVERTED_BYTES,
    encoding: null,
  });
  if (conversion.status !== 0) {
    const stderr = Buffer.isBuffer(conversion.stderr)
      ? conversion.stderr.toString('utf8')
      : String(conversion.stderr ?? '');
    throw new Error(`GIF conversion failed: ${stderr.trim() || `exit ${conversion.status}`}`);
  }
  const output = Buffer.from(conversion.stdout ?? []);
  requireCondition(output.length > 0, 'GIF conversion produced an empty PNG.');
  requireCondition(output.length <= MAX_CONVERTED_BYTES, 'Converted PNG exceeds the size ceiling.');
  requireCondition(isPng(output), 'GIF conversion did not produce a PNG.');
  return output;
}

async function fetchGif(url, attempts = 3) {
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
          Accept: 'image/gif,image/*;q=0.8',
          Referer: 'https://www.pokemon-card.com/card-search/',
          'Accept-Language': 'ja,en-GB;q=0.8,en;q=0.7',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const advertisedLength = Number(response.headers.get('content-length') ?? 0);
      if (advertisedLength > MAX_SOURCE_BYTES) throw new Error('GIF exceeds source size ceiling.');
      const buffer = Buffer.from(await response.arrayBuffer());
      requireCondition(buffer.length > 0, 'Downloaded GIF is empty.');
      requireCondition(buffer.length <= MAX_SOURCE_BYTES, 'Downloaded GIF exceeds source size ceiling.');
      requireCondition(isGif(buffer), 'Downloaded bytes are not a GIF.');
      return {
        buffer,
        contentType: clean(response.headers.get('content-type')),
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1_500);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`GIF fetch failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
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

async function main() {
  const setCode = clean(option('set-code'));
  const reportPath = path.resolve(option('report', `reports/catalogue/japanese-gif-mirror/${setCode ?? 'unknown'}.json`));
  const target = clean(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const delayMs = Math.max(250, Math.min(5_000, Number(option('delay-ms', '750')) || 750));
  const apply = hasFlag('apply');
  const verifyPublic = hasFlag('verify-public');

  requireCondition(setCode, '--set-code is required.');
  requireCondition(target === 'staging', 'GIF mirroring is restricted to staging.');
  requireCondition(apply, '--apply is required.');

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Expected StackR staging SUPABASE_URL.');
  requireCondition(!supabaseUrl.includes(PRODUCTION_PROJECT_REF), 'Production target detected; GIF mirror refused.');
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
    .select('id,set_code,total')
    .eq('language_code', 'ja')
    .eq('set_code', setCode)
    .is('deprecated_at', null);
  requireNoError(setError, 'load target Japanese set');
  requireCondition(sets?.length === 1, `Expected one active Japanese set ${setCode}.`);
  const setRow = sets[0];

  const { data: printings, error: printingError } = await catalog.from('card_printings')
    .select('id,set_id,collector_number,collector_number_sort_key,native_name')
    .eq('set_id', setRow.id)
    .eq('language_code', 'ja')
    .is('deprecated_at', null);
  requireNoError(printingError, 'load target printings');
  const printingById = new Map((printings ?? []).map((row) => [row.id, row]));
  const printingIds = [...printingById.keys()];

  const variants = await selectInBatches(
    catalog.from('card_variants'),
    'printing_id',
    printingIds,
    'id,printing_id,variant_code,native_image_status',
    (query) => query.eq('language_code', 'ja').is('deprecated_at', null),
  );
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

  const existingAssets = await selectInBatches(
    catalog.from('assets'),
    'variant_id',
    variantIds,
    'id,asset_id,variant_id,storage_provider,storage_bucket,storage_key,content_sha256,publicly_servable',
    (query) => query.eq('source_id', source.id).eq('asset_type', 'card_image').is('deprecated_at', null),
  );
  const assetByVariant = new Map(existingAssets.map((row) => [row.variant_id, row]));

  const candidates = [];
  for (const identifier of identifiers) {
    const variant = variantById.get(identifier.variant_id);
    const printing = variant ? printingById.get(variant.printing_id) : null;
    const raw = rawById.get(identifier.raw_record_id);
    requireCondition(variant && printing && raw, `Incomplete source chain for ${identifier.external_id}.`);
    requireCondition(raw.validation_status === 'valid' && raw.licence_status === 'approved', `Source row ${identifier.external_id} is not approved and valid.`);
    const imageUrl = imageUrlFromPayload(raw.raw_payload);
    requireCondition(imageUrl, `Image URL is missing for ${identifier.external_id}.`);
    if (!new URL(imageUrl).pathname.toLowerCase().endsWith('.gif')) continue;
    const existingAsset = assetByVariant.get(variant.id) ?? null;
    if (
      existingAsset?.storage_provider === 'supabase_storage'
      && existingAsset.storage_bucket === BUCKET
      && clean(existingAsset.storage_key)
      && clean(existingAsset.content_sha256)
      && existingAsset.publicly_servable === true
    ) {
      continue;
    }
    candidates.push({
      externalId: identifier.external_id,
      variantId: variant.id,
      printingId: printing.id,
      collectorNumber: printing.collector_number,
      nativeName: printing.native_name,
      imageUrl,
      sourceUpdatedAt: raw.source_updated_at ?? identifier.source_updated_at ?? new Date().toISOString(),
      existingAsset,
    });
  }
  candidates.sort((left, right) => left.collectorNumber.localeCompare(right.collectorNumber));

  const successes = [];
  const failures = [];
  for (const candidate of candidates) {
    try {
      const downloaded = await fetchGif(candidate.imageUrl);
      const sourceSha256 = createHash('sha256').update(downloaded.buffer).digest('hex');
      const png = convertGifToPng(downloaded.buffer);
      const contentSha256 = createHash('sha256').update(png).digest('hex');
      const { width, height } = pngDimensions(png);
      const storageKey = `public/card_image/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}/original.png`;

      const { error: uploadError } = await db.storage.from(BUCKET).upload(storageKey, png, {
        contentType: 'image/png',
        cacheControl: '31536000',
        upsert: true,
      });
      requireNoError(uploadError, `upload converted PNG ${candidate.externalId}`);
      const { data: publicData } = db.storage.from(BUCKET).getPublicUrl(storageKey);
      const publicUrl = clean(publicData?.publicUrl);
      requireCondition(publicUrl, `No public URL generated for ${candidate.externalId}.`);

      let publicVerified = false;
      if (verifyPublic) {
        const response = await fetch(publicUrl, { headers: { Range: 'bytes=0-63', 'Cache-Control': 'no-cache' } });
        requireCondition(response.ok || response.status === 206, `Public verification returned HTTP ${response.status}.`);
        publicVerified = true;
      }

      const now = new Date().toISOString();
      const assetRow = {
        asset_id: `pokemon-card-jp-official:${candidate.externalId}`,
        asset_type: 'card_image',
        game_code: 'pokemon',
        set_id: setRow.id,
        printing_id: candidate.printingId,
        variant_id: candidate.variantId,
        source_id: source.id,
        url: publicUrl,
        storage_path: storageKey,
        mime_type: 'image/png',
        width,
        height,
        sha256: contentSha256,
        rights_status: 'approved',
        publicly_servable: true,
        attribution_text: 'Pokémon Card Game Japan official card database',
        licensing_review_notes: `Full rights confirmed by the StackR owner. Original GIF SHA-256: ${sourceSha256}. Deterministically converted first frame to PNG.`,
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
        byte_size: png.length,
        derivative_list: [],
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

      const oldAsset = candidate.existingAsset;
      let asset;
      if (oldAsset?.id) {
        const { data, error } = await catalog.from('assets').update(assetRow).eq('id', oldAsset.id).select('id').single();
        requireNoError(error, `update GIF asset ${candidate.externalId}`);
        asset = data;
      } else {
        const { data, error } = await catalog.from('assets').insert(assetRow).select('id').single();
        requireNoError(error, `insert GIF asset ${candidate.externalId}`);
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

      successes.push({
        externalId: candidate.externalId,
        collectorNumber: candidate.collectorNumber,
        variantId: candidate.variantId,
        assetId: asset.id,
        sourceSha256,
        contentSha256,
        width,
        height,
        byteSize: png.length,
        storageKey,
        publicUrl,
        publicVerified,
      });
      await sleep(delayMs);
    } catch (error) {
      failures.push({
        externalId: candidate.externalId,
        collectorNumber: candidate.collectorNumber,
        variantId: candidate.variantId,
        imageUrl: candidate.imageUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const { count: mirroredCount, error: mirroredCountError } = await catalog.from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', source.id)
    .eq('set_id', setRow.id)
    .eq('asset_type', 'card_image')
    .eq('publicly_servable', true)
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved')
    .is('deprecated_at', null)
    .is('deleted_at', null);
  requireNoError(mirroredCountError, 'verify total mirrored assets');

  const report = {
    ok: failures.length === 0,
    target: 'staging',
    production_modified: false,
    set_code: setCode,
    gif_candidates_selected: candidates.length,
    converted_successfully: successes.length,
    failed: failures.length,
    public_urls_verified: successes.filter((row) => row.publicVerified).length,
    total_approved_set_assets_after_run: mirroredCount ?? 0,
    successes,
    failures,
  };
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, successes: successes.slice(0, 5) }, null, 2));
  requireCondition(report.ok, 'One or more official GIF images failed conversion or mirroring.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
