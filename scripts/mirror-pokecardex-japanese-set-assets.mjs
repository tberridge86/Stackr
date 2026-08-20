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
const MAX_BYTES = 10 * 1024 * 1024;

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

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message ?? String(error)}`);
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
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
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
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return { width: null, height: null };
}

function dimensions(buffer, mimeType) {
  if (mimeType === 'image/jpeg') return jpegDimensions(buffer);
  if (mimeType === 'image/png') return pngDimensions(buffer);
  if (mimeType === 'image/webp') return webpDimensions(buffer);
  return { width: null, height: null };
}

function codeCandidates(setRow) {
  const values = unique([
    clean(setRow.set_code),
    clean(setRow.provider_set_code),
    clean(setRow.set_code)?.toUpperCase(),
    clean(setRow.provider_set_code)?.toUpperCase(),
    clean(setRow.set_code)?.toLowerCase(),
    clean(setRow.provider_set_code)?.toLowerCase(),
  ]);
  if (setRow.set_code === 'PCG10') values.push('WCP');
  return unique(values);
}

function sourceCandidates(setRow, assetType) {
  const folder = assetType === 'set_logo' ? 'logos' : 'symbols';
  const extensions = ['png', 'webp', 'jpg', 'jpeg'];
  const urls = [];
  for (const code of codeCandidates(setRow)) {
    for (const extension of extensions) {
      urls.push(`https://www.pokecardex.com/assets/images/sets/${folder}/${encodeURIComponent(code)}.${extension}`);
    }
  }
  return unique(urls);
}

async function fetchCandidate(url, attempts = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40_000);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'StackR-Catalogue-Asset-Mirror/1.0 (+https://stackrtcg.com)',
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
          Referer: 'https://www.pokecardex.com/',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-GB;q=0.8,en;q=0.7',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const advertisedLength = Number(response.headers.get('content-length') ?? 0);
      if (advertisedLength > MAX_BYTES) throw new Error('Asset exceeds size ceiling.');
      const buffer = Buffer.from(await response.arrayBuffer());
      requireCondition(buffer.length > 0 && buffer.length <= MAX_BYTES, 'Asset is empty or oversized.');
      const detected = detectImage(buffer);
      const size = dimensions(buffer, detected.mimeType);
      requireCondition((size.width ?? 0) > 0 && (size.height ?? 0) > 0, 'Asset dimensions cannot be read.');
      return {
        url,
        buffer,
        byteSize: buffer.length,
        responseContentType: clean(response.headers.get('content-type')),
        ...detected,
        ...size,
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1_000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : String(lastError));
}

async function findAsset(setRow, assetType) {
  const attempts = [];
  for (const url of sourceCandidates(setRow, assetType)) {
    try {
      const result = await fetchCandidate(url);
      const minimumWidth = assetType === 'set_logo' ? 120 : 25;
      const minimumHeight = assetType === 'set_logo' ? 30 : 25;
      if ((result.width ?? 0) < minimumWidth || (result.height ?? 0) < minimumHeight) {
        attempts.push({ url, error: `dimensions ${result.width}x${result.height} below minimum` });
        continue;
      }
      return { ...result, attempts };
    } catch (error) {
      attempts.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  throw new Error(`No valid ${assetType} found: ${JSON.stringify(attempts)}`);
}

async function main() {
  const setCodes = unique((option('set-codes') ?? '').split(',').map(clean));
  const reportPath = path.resolve(option('report', 'reports/catalogue/japanese-set-assets/report.json'));
  const target = clean(option('target', process.env.STACKR_CATALOGUE_IMPORT_TARGET));
  const delayMs = Math.max(250, Math.min(5_000, Number(option('delay-ms', '750')) || 750));
  const apply = hasFlag('apply');
  const verifyPublic = hasFlag('verify-public');

  requireCondition(setCodes.length > 0, '--set-codes is required.');
  requireCondition(target === 'staging', 'Set asset mirroring is restricted to staging.');
  requireCondition(apply, '--apply is required.');

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
  requireCondition(supabaseUrl?.includes(STAGING_PROJECT_REF), 'Expected StackR staging SUPABASE_URL.');
  requireCondition(!supabaseUrl.includes(PRODUCTION_PROJECT_REF), 'Production target detected; set asset mirror refused.');
  requireCondition(supabaseKey, 'A staging secret/service key is required.');

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const catalog = db.schema('catalog');
  const ingest = db.schema('ingest');

  const { data: source, error: sourceError } = await ingest.from('sources').upsert({
    code: SOURCE_CODE,
    display_name: 'PokéCardex',
    source_type: 'catalogue',
    base_url: 'https://www.pokecardex.com',
    terms_url: null,
    licence_status: 'approved',
    attribution_required: true,
    robots_policy: 'bounded asset acquisition',
    rate_limit_config: { minimum_delay_ms: delayMs, bounded: true },
    active: true,
    internal_notes: 'Pokémon asset rights confirmed by the StackR owner; preserve source URL and attribution.',
    source_updated_at: new Date().toISOString(),
    deprecated_at: null,
    deprecated_reason: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'code' }).select('*').single();
  requireNoError(sourceError, 'ensure PokéCardex source');

  const { data: sets, error: setError } = await catalog.from('sets')
    .select('id,set_code,provider_set_code,native_name,english_display_name')
    .eq('language_code', 'ja')
    .in('set_code', setCodes)
    .is('deprecated_at', null);
  requireNoError(setError, 'load Japanese sets');
  const byCode = new Map((sets ?? []).map((row) => [row.set_code, row]));
  const missing = setCodes.filter((code) => !byCode.has(code));
  requireCondition(missing.length === 0, `Unknown active Japanese sets: ${missing.join(', ')}`);

  const results = [];
  for (const setCode of setCodes) {
    const setRow = byCode.get(setCode);
    const setResult = {
      setCode,
      setId: setRow.id,
      ok: true,
      assets: [],
      failures: [],
    };
    for (const assetType of ['set_logo', 'set_symbol']) {
      try {
        const { data: existingRows, error: existingError } = await catalog.from('assets')
          .select('*')
          .eq('source_id', source.id)
          .eq('set_id', setRow.id)
          .eq('asset_type', assetType)
          .is('deprecated_at', null)
          .is('deleted_at', null)
          .limit(2);
        requireNoError(existingError, `load ${setCode} ${assetType}`);
        requireCondition((existingRows ?? []).length <= 1, `Multiple active ${assetType} assets exist for ${setCode}.`);
        const old = existingRows?.[0] ?? null;
        const ready = old
          && old.storage_provider === 'supabase_storage'
          && old.storage_bucket === BUCKET
          && clean(old.storage_key)
          && clean(old.content_sha256)
          && old.publicly_servable === true
          && old.rights_status === 'approved'
          && old.permission_status === 'approved';
        if (ready) {
          setResult.assets.push({ assetType, action: 'already_ready', assetId: old.id, publicUrl: old.url });
          continue;
        }

        const downloaded = await findAsset(setRow, assetType);
        const contentSha256 = createHash('sha256').update(downloaded.buffer).digest('hex');
        const storageKey = `public/${assetType}/${contentSha256.slice(0, 2)}/${contentSha256.slice(2, 4)}/${contentSha256}/original.${downloaded.extension}`;
        const { error: uploadError } = await db.storage.from(BUCKET).upload(storageKey, downloaded.buffer, {
          contentType: downloaded.mimeType,
          cacheControl: '31536000',
          upsert: true,
        });
        requireNoError(uploadError, `upload ${setCode} ${assetType}`);
        const { data: publicData } = db.storage.from(BUCKET).getPublicUrl(storageKey);
        const publicUrl = clean(publicData?.publicUrl);
        requireCondition(publicUrl, `No public URL generated for ${setCode} ${assetType}.`);

        let publicVerified = false;
        if (verifyPublic) {
          const response = await fetch(publicUrl, { headers: { Range: 'bytes=0-63', 'Cache-Control': 'no-cache' } });
          requireCondition(response.ok || response.status === 206, `Public URL returned HTTP ${response.status}.`);
          publicVerified = true;
        }

        const now = new Date().toISOString();
        const row = {
          asset_id: `pokecardex:${setCode}:${assetType}`,
          asset_type: assetType,
          game_code: 'pokemon',
          set_id: setRow.id,
          printing_id: null,
          variant_id: null,
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
          source_updated_at: now,
          deprecated_at: null,
          deprecated_reason: null,
          updated_at: now,
          asset_visibility: 'public_catalogue',
          storage_provider: 'supabase_storage',
          storage_bucket: BUCKET,
          storage_key: storageKey,
          original_source_url: downloaded.url,
          original_source_identifier: `${setCode}:${assetType}`,
          source_attribution: 'PokéCardex',
          permission_status: 'approved',
          content_sha256: contentSha256,
          perceptual_hash: null,
          byte_size: downloaded.byteSize,
          derivative_list: old?.content_sha256 === contentSha256 && Array.isArray(old?.derivative_list) ? old.derivative_list : [],
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
          recognition_reference_eligible: false,
        };
        let asset;
        if (old?.id) {
          const { data, error } = await catalog.from('assets').update(row).eq('id', old.id).select('*').single();
          requireNoError(error, `update ${setCode} ${assetType}`);
          asset = data;
        } else {
          const { data, error } = await catalog.from('assets').insert(row).select('*').single();
          requireNoError(error, `insert ${setCode} ${assetType}`);
          asset = data;
        }
        setResult.assets.push({
          assetType,
          action: old?.id ? 'updated' : 'inserted',
          assetId: asset.id,
          sourceUrl: downloaded.url,
          publicUrl,
          publicVerified,
          contentSha256,
          width: downloaded.width,
          height: downloaded.height,
          byteSize: downloaded.byteSize,
          attemptedBeforeSuccess: downloaded.attempts.length,
        });
        await sleep(delayMs);
      } catch (error) {
        setResult.ok = false;
        setResult.failures.push({ assetType, error: error instanceof Error ? error.message : String(error) });
      }
    }
    results.push(setResult);
  }

  const successfulSets = results.filter((row) => row.ok && row.assets.length === 2);
  const failedSets = results.filter((row) => !row.ok || row.assets.length !== 2);
  const hashes = results.flatMap((row) => row.assets.map((asset) => asset.contentSha256).filter(Boolean));
  const duplicateHashes = unique(hashes.filter((value, index, array) => array.indexOf(value) !== index));

  const report = {
    ok: failedSets.length === 0 && duplicateHashes.length === 0,
    target: 'staging',
    production_modified: false,
    requested_sets: setCodes,
    completed_sets: successfulSets.map((row) => row.setCode),
    failed_sets: failedSets.map((row) => row.setCode),
    duplicate_content_hashes: duplicateHashes,
    results,
  };
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  requireCondition(report.ok, 'One or more Japanese set assets failed or resolved to duplicate placeholder content.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
