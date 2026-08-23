#!/usr/bin/env node
import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { buildApprovedCatalogueAsset, perceptualHashForImage } from '../backend/lib/assetPipeline.js';
import { SupabaseObjectStorageAdapter } from '../backend/lib/objectStorage.js';
import {
  localiseCardFromJpegBase64,
  perspectiveCorrectCardJpegBase64,
} from '../lib/cardLocalisation.ts';
import { assessInternetListingEvidence } from './catalogue-ingestion/internetEvidence.ts';

const requireFromBackend = createRequire(path.resolve('backend/package.json'));
const sharp = requireFromBackend('sharp');

const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const SOURCE_CODE = 'ebay_browse_recognition_evidence';
const PREPARED_SCHEMA = 'stackr-ebay-recognition-reference-preparation-v1.0.0';
const APPROVED_SCHEMA = 'stackr-ebay-recognition-reference-approval-v1.0.0';
const COMMITTED_SCHEMA = 'stackr-ebay-recognition-reference-commit-v1.0.0';
const RISKY_TITLE = /\b(?:psa|bgs|cgc|sgc|ace\s+grading|graded|slab|lot|bundle|playset|proxy|replica|reprint|custom|fan[ -]?made|jumbo|oversized|digital|online\s+code|empty)\b|\b[2-9]\d*\s+cards?\b/i;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function integerArg(name, fallback, minimum, maximum) {
  const value = Number(arg(name, String(fallback)));
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`--${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function canonicalJson(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function manifestSha256(value) {
  return sha256(Buffer.from(canonicalJson(value), 'utf8'));
}

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function requireStaging() {
  const url = clean(process.env.SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY);
  if (!url || !key) throw new Error('Staging Supabase backend credentials are required.');
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname !== `${STAGING_PROJECT_REF}.supabase.co`
    || url.includes(PRODUCTION_PROJECT_REF)
  ) {
    throw new Error(`This command is restricted to staging project ${STAGING_PROJECT_REF}.`);
  }
  return { url: url.replace(/\/$/, ''), key };
}

function adminClient() {
  const config = requireStaging();
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init = {}) => fetch(input, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(90_000),
      }),
    },
  });
}

async function mapConcurrent(values, concurrency, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      output[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function sourceId(supabase) {
  const { data, error } = await supabase.schema('ingest').from('sources')
    .select('id,code')
    .eq('code', SOURCE_CODE)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Staging ingest source ${SOURCE_CODE} is missing.`);
  return data.id;
}

async function readHighEvidence(supabase) {
  const rows = [];
  const pageSize = 500;
  let afterRetrievedAt = null;
  let afterId = null;
  for (;;) {
    let data = null;
    let finalError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await supabase.schema('api').rpc('list_ebay_recognition_evidence_rows', {
        p_after_retrieved_at: afterRetrievedAt,
        p_after_id: afterId,
        p_limit: pageSize,
      });
      data = result.data;
      finalError = result.error;
      if (!finalError) break;
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
      }
    }
    if (finalError) throw finalError;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    const last = page.at(-1);
    if (!last?.retrieved_at || !last?.id) throw new Error('Evidence pagination cursor is incomplete.');
    afterRetrievedAt = last.retrieved_at;
    afterId = last.id;
  }
  return rows;
}

async function existingEligibleVariants(supabase, variantIds) {
  const result = new Set();
  for (let offset = 0; offset < variantIds.length; offset += 500) {
    const { data, error } = await supabase.schema('api').rpc('list_recognition_fingerprint_assets', {
      p_variant_ids: variantIds.slice(offset, offset + 500),
    });
    if (error) throw error;
    for (const row of data ?? []) result.add(String(row.variant_id));
  }
  return result;
}

function listingFromPayload(payload) {
  return {
    sourceItemId: clean(payload?.sourceItemId),
    sourceUrl: clean(payload?.sourceUrl),
    title: clean(payload?.title) ?? '',
    condition: clean(payload?.condition),
    imageUrls: Array.isArray(payload?.imageUrls) ? payload.imageUrls.map(clean).filter(Boolean) : [],
    aspects: Array.isArray(payload?.aspects) ? payload.aspects : [],
    itemCreationDate: clean(payload?.itemCreationDate),
    query: clean(payload?.query),
  };
}

function strictListing(row) {
  const payload = row.raw_payload ?? {};
  const fingerprint = payload.fingerprint;
  if (!fingerprint?.variantId || !fingerprint?.fingerprintSha256) return null;
  const listing = listingFromPayload(payload);
  const assessment = assessInternetListingEvidence(fingerprint, listing);
  const strict = assessment.confidenceBand === 'high'
    && assessment.identityStatus === 'confirmed'
    && assessment.collectorNumberMatch
    && assessment.setCodeMatch
    && assessment.languageMatch === true
    && assessment.variantStatus === 'confirmed'
    && assessment.conflicts.length === 0
    && assessment.imageUrls.length > 0
    && !RISKY_TITLE.test(listing.title);
  if (!strict) return null;
  return {
    evidenceRecordId: row.id,
    externalId: row.external_id,
    retrievedAt: row.retrieved_at,
    fingerprint,
    listing,
    assessment,
  };
}

function upgradedImageUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/(^|\.)ebayimg\.com$/i.test(url.hostname)) {
    throw new Error('Only HTTPS eBay image evidence may be promoted.');
  }
  url.pathname = url.pathname.replace(/\/s-l\d+\.(?:jpg|jpeg|png|webp)$/i, '/s-l1600.jpg');
  return url.toString();
}

async function downloadImage(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: 'image/avif,image/webp,image/png,image/jpeg',
      'User-Agent': 'Stackr-Recognition-Evidence/1',
    },
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) throw new Error(`image_http_${response.status}`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error('image_declared_too_large');
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < 8_000) throw new Error('image_too_small');
  if (body.length > MAX_IMAGE_BYTES) throw new Error('image_too_large');
  return body;
}

function quadrilateralHasInteriorMargin(quadrilateral, width, height, marginRatio = 0.006) {
  const points = [
    quadrilateral.topLeft,
    quadrilateral.topRight,
    quadrilateral.bottomRight,
    quadrilateral.bottomLeft,
  ];
  const minimumX = width * marginRatio;
  const maximumX = width * (1 - marginRatio);
  const minimumY = height * marginRatio;
  const maximumY = height * (1 - marginRatio);
  return points.every((point) => point.x >= minimumX && point.x <= maximumX
    && point.y >= minimumY && point.y <= maximumY);
}

async function prepareListingImage(entry, outputDir, maximumImages) {
  const failures = [];
  for (const originalUrl of entry.assessment.imageUrls.slice(0, maximumImages)) {
    try {
      const sourceImageUrl = upgradedImageUrl(originalUrl);
      const downloaded = await downloadImage(sourceImageUrl);
      const sourceMetadata = await sharp(downloaded, { failOn: 'error' }).metadata();
      if ((sourceMetadata.width ?? 0) < 400 || (sourceMetadata.height ?? 0) < 400) {
        throw new Error('image_dimensions_too_small');
      }
      const jpeg = await sharp(downloaded, { failOn: 'error' })
        .rotate()
        .jpeg({ quality: 95, mozjpeg: true })
        .toBuffer();
      const localisation = localiseCardFromJpegBase64(jpeg.toString('base64'), {
        minFrameCoverage: 0.28,
        maxFrameCoverage: 0.96,
        minEdgeCompleteness: 0.18,
        safetyMarginRatio: 0.14,
      });
      if (
        localisation.status !== 'confident'
        || !localisation.quadrilateral
        || localisation.confidence.score < 0.78
        || localisation.confidence.aspectScore < 0.78
        || !localisation.confidence.cornersDetected
      ) {
        throw new Error(`card_localisation_${localisation.status}`);
      }
      if (!quadrilateralHasInteriorMargin(
        localisation.quadrilateral,
        sourceMetadata.width,
        sourceMetadata.height,
      )) {
        throw new Error('expanded_card_boundary_clipped');
      }
      const rectified = perspectiveCorrectCardJpegBase64(
        jpeg.toString('base64'),
        localisation.quadrilateral,
        { outputWidth: 720, quality: 94, safetyMarginRatio: 0 },
      );
      const rectifiedBuffer = Buffer.from(rectified.base64, 'base64');
      const stats = await sharp(rectifiedBuffer, { failOn: 'error' }).stats();
      if (Number.isFinite(stats.entropy) && stats.entropy < 2.2) throw new Error('rectified_entropy_too_low');
      if (Number.isFinite(stats.sharpness) && stats.sharpness < 0.35) throw new Error('rectified_sharpness_too_low');
      const sourceImageSha256 = sha256(downloaded);
      const rectifiedSha256 = sha256(rectifiedBuffer);
      const fileName = `${entry.fingerprint.variantId}-${sha256(Buffer.from(entry.listing.sourceItemId)).slice(0, 12)}-${rectifiedSha256.slice(0, 12)}.jpg`;
      const imagePath = path.join(outputDir, 'images', fileName);
      await writeFile(imagePath, rectifiedBuffer, { flag: 'wx' });
      return {
        ok: true,
        candidate: {
          evidenceRecordId: entry.evidenceRecordId,
          externalId: entry.externalId,
          sourceItemId: entry.listing.sourceItemId,
          sourceListingUrl: entry.listing.sourceUrl,
          sourceImageUrl,
          sourceImageSha256,
          sourceImageBytes: downloaded.length,
          sourceImageWidth: sourceMetadata.width,
          sourceImageHeight: sourceMetadata.height,
          itemCreationDate: entry.listing.itemCreationDate,
          title: entry.listing.title,
          nameMatch: entry.assessment.nameMatch,
          provenanceSha256: entry.assessment.provenanceSha256,
          rectifiedSha256,
          rectifiedPerceptualHash: await perceptualHashForImage(rectifiedBuffer),
          rectifiedBytes: rectifiedBuffer.length,
          rectifiedWidth: rectified.width,
          rectifiedHeight: rectified.height,
          localisation,
          imagePath,
        },
      };
    } catch (error) {
      failures.push({ imageUrl: originalUrl, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ok: false, failures };
}

async function prepare() {
  const outputDir = path.resolve(arg('outputDir', 'reports/recognition/ebay-promotion'));
  const maxVariants = integerArg('maxVariants', 940, 1, 2000);
  const maxListings = integerArg('maxListingsPerVariant', 5, 1, 10);
  const maxImages = integerArg('maxImagesPerListing', 3, 1, 6);
  const concurrency = integerArg('downloadConcurrency', 6, 1, 12);
  await mkdir(path.join(outputDir, 'images'), { recursive: true });
  const supabase = adminClient();
  const source = await sourceId(supabase);
  const evidence = await readHighEvidence(supabase);
  const strict = evidence.map(strictListing).filter(Boolean);
  const variants = [...new Set(strict.map((item) => item.fingerprint.variantId))].sort();
  const alreadyEligible = await existingEligibleVariants(supabase, variants);
  const targetVariants = variants.filter((variantId) => !alreadyEligible.has(variantId)).slice(0, maxVariants);
  const byVariant = new Map(targetVariants.map((variantId) => [variantId, []]));
  for (const entry of strict) {
    if (!byVariant.has(entry.fingerprint.variantId)) continue;
    byVariant.get(entry.fingerprint.variantId).push(entry);
  }
  const tasks = [];
  for (const variantId of targetVariants) {
    const entries = byVariant.get(variantId)
      .sort((left, right) => Number(right.assessment.nameMatch) - Number(left.assessment.nameMatch)
        || left.listing.sourceItemId.localeCompare(right.listing.sourceItemId))
      .slice(0, maxListings);
    for (const entry of entries) tasks.push(entry);
  }
  const prepared = await mapConcurrent(tasks, concurrency, async (entry) => {
    const result = await prepareListingImage(entry, outputDir, maxImages);
    return { entry, ...result };
  });
  const preparedByVariant = new Map(targetVariants.map((variantId) => [variantId, []]));
  const exclusions = [];
  for (const result of prepared) {
    if (result.ok) preparedByVariant.get(result.entry.fingerprint.variantId).push(result.candidate);
    else exclusions.push({
      variantId: result.entry.fingerprint.variantId,
      sourceItemId: result.entry.listing.sourceItemId,
      reason: 'no_valid_listing_image',
      details: result.failures,
    });
  }
  const body = {
    schemaVersion: PREPARED_SCHEMA,
    generatedAt: new Date().toISOString(),
    projectRef: STAGING_PROJECT_REF,
    productionModified: false,
    sourceCode: SOURCE_CODE,
    selectionRules: {
      correctedSetCodeBoundaryMatch: true,
      identityStatus: 'confirmed',
      confidenceBand: 'high',
      collectorNumberMatch: true,
      exactSetCodeMatch: true,
      explicitLanguageMatch: true,
      variantStatus: 'confirmed',
      conflicts: 0,
      riskyListingTitlesExcluded: true,
      cardLocalisationStatus: 'confident',
      minimumLocalisationScore: 0.78,
      minimumAspectScore: 0.78,
      minimumFrameCoverage: 0.28,
      minimumEdgeCompleteness: 0.18,
      cardCropExpansionRatio: 0.14,
      expandedCardMustRemainInsideSourceFrame: true,
    },
    highEvidenceRowsRead: evidence.length,
    strictEvidenceRows: strict.length,
    strictVariantCount: variants.length,
    alreadyEligibleVariantCount: alreadyEligible.size,
    targetVariantCount: targetVariants.length,
    candidateImageCount: prepared.filter((item) => item.ok).length,
    candidates: targetVariants.map((variantId) => ({
      variantId,
      fingerprint: byVariant.get(variantId)[0]?.fingerprint ?? null,
      images: preparedByVariant.get(variantId),
    })),
    exclusions,
  };
  const manifest = { ...body, manifestSha256: manifestSha256(body) };
  const manifestPath = path.join(outputDir, 'prepared-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    ok: true,
    phase: 'prepare',
    manifestPath,
    manifestSha256: manifest.manifestSha256,
    targetVariantCount: targetVariants.length,
    candidateImageCount: body.candidateImageCount,
    productionModified: false,
  }, null, 2));
}

function verifyManifest(value, schema) {
  if (value?.schemaVersion !== schema) throw new Error(`Expected manifest schema ${schema}.`);
  const claimed = value.manifestSha256;
  const body = { ...value };
  delete body.manifestSha256;
  if (manifestSha256(body) !== claimed) throw new Error('Manifest SHA-256 verification failed.');
  if (value.projectRef !== STAGING_PROJECT_REF || value.productionModified !== false) {
    throw new Error('Manifest is not restricted to Stackr staging.');
  }
}

async function printingContext(supabase, printingIds) {
  const result = new Map();
  for (let offset = 0; offset < printingIds.length; offset += 250) {
    const { data, error } = await supabase.schema('catalog').from('card_printings')
      .select('id,set_id,language_code')
      .in('id', printingIds.slice(offset, offset + 250));
    if (error) throw error;
    for (const row of data ?? []) result.set(row.id, row);
  }
  return result;
}

async function commit() {
  const manifestPath = path.resolve(arg('manifest'));
  const outputPath = path.resolve(arg('output', path.join(path.dirname(manifestPath), 'committed-manifest.json')));
  const approved = JSON.parse(await readFile(manifestPath, 'utf8'));
  verifyManifest(approved, APPROVED_SCHEMA);
  if (approved.commitEligible !== true || approved.status !== 'validated_inactive') {
    throw new Error('Promotion manifest has not passed independent validation.');
  }
  const supabase = adminClient();
  const storage = new SupabaseObjectStorageAdapter(supabase);
  const source = await sourceId(supabase);
  const promotions = Array.isArray(approved.promotions) ? approved.promotions : [];
  if (!promotions.length) throw new Error('Approved promotion manifest contains no assets.');
  const variantIds = promotions.map((item) => item.variantId);
  const eligibleBefore = await existingEligibleVariants(supabase, variantIds);
  const contexts = await printingContext(
    supabase,
    [...new Set(promotions.map((item) => item.fingerprint?.printingId).filter(Boolean))],
  );
  const results = [];
  for (const promotion of promotions) {
    const stableAssetId = `ebay-recognition-v1:${promotion.variantId}`;
    const { data: existing, error: existingError } = await supabase.schema('catalog').from('assets')
      .select('id,asset_id,variant_id,content_sha256,storage_bucket,storage_key,recognition_reference_eligible')
      .eq('asset_id', stableAssetId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.recognition_reference_eligible && existing.variant_id === promotion.variantId) {
      results.push({
        ...existing,
        variantId: promotion.variantId,
        languageCode: promotion.fingerprint.languageCode,
        status: 'reused_committed',
      });
      continue;
    }
    if (eligibleBefore.has(promotion.variantId)) {
      results.push({
        variantId: promotion.variantId,
        languageCode: promotion.fingerprint.languageCode,
        status: 'already_eligible',
      });
      continue;
    }
    if (existing) throw new Error(`Existing staged asset ${stableAssetId} is not safely reusable.`);
    const selected = promotion.selectedCandidate;
    const image = await readFile(path.resolve(selected.imagePath));
    if (sha256(image) !== selected.rectifiedSha256) {
      throw new Error(`Selected rectified image checksum changed for ${promotion.variantId}.`);
    }
    const stored = await buildApprovedCatalogueAsset({
      assetId: stableAssetId,
      assetType: 'card_image',
      buffer: image,
      mimeType: 'image/jpeg',
      permissionStatus: 'approved',
      sourceUrl: selected.sourceImageUrl,
      sourceIdentifier: selected.sourceItemId,
      sourceAttribution: 'eBay Browse API listing evidence; StackR rectified-card validation',
      preserveArchivalOriginal: true,
      storage,
    });
    const printing = contexts.get(promotion.fingerprint.printingId);
    if (!printing || printing.language_code !== promotion.fingerprint.languageCode) {
      throw new Error(`Printing context mismatch for ${promotion.variantId}.`);
    }
    const publicUrl = storage.publicUrl(stored.storage_bucket, stored.storage_key);
    const assetId = randomUUID();
    const auditNotes = JSON.stringify({
      schemaVersion: 'stackr-ebay-recognition-reference-audit-v1.0.0',
      preparedManifestSha256: approved.preparedManifestSha256,
      approvalManifestSha256: approved.manifestSha256,
      evidenceRecordId: selected.evidenceRecordId,
      sourceItemId: selected.sourceItemId,
      sourceListingUrl: selected.sourceListingUrl,
      sourceImageUrl: selected.sourceImageUrl,
      sourceImageSha256: selected.sourceImageSha256,
      rectifiedSha256: selected.rectifiedSha256,
      consensus: promotion.consensus,
      productionModified: false,
    });
    const row = {
      id: assetId,
      asset_id: stableAssetId,
      asset_type: 'card_image',
      game_code: 'pokemon',
      set_id: printing.set_id,
      printing_id: promotion.fingerprint.printingId,
      variant_id: promotion.variantId,
      source_id: source,
      url: publicUrl,
      storage_path: stored.storage_path,
      mime_type: stored.mime_type,
      width: stored.width,
      height: stored.height,
      sha256: stored.sha256,
      rights_status: 'approved',
      publicly_servable: true,
      attribution_text: 'eBay Browse API listing evidence; independently rectified and validated by StackR',
      licensing_review_notes: auditNotes,
      source_updated_at: selected.itemCreationDate,
      asset_visibility: 'public_catalogue',
      storage_provider: stored.storage_provider,
      storage_bucket: stored.storage_bucket,
      storage_key: stored.storage_key,
      original_source_url: selected.sourceImageUrl,
      original_source_identifier: selected.sourceItemId,
      source_attribution: 'eBay Browse API listing evidence',
      permission_status: 'approved',
      content_sha256: stored.content_sha256,
      perceptual_hash: stored.perceptual_hash,
      byte_size: stored.byte_size,
      derivative_list: stored.derivative_list,
      cache_control: stored.cache_control,
      archival_storage_key: stored.archival_storage_key,
      externally_referenced: false,
      unavailable_reason: null,
      last_verified_at: stored.last_verified_at,
      retention_status: 'active',
      acquisition_source: 'approved_commercial_provider',
      recognition_reference_eligible: true,
    };
    const { data: inserted, error: insertError } = await supabase.schema('catalog').from('assets')
      .insert(row)
      .select('id,asset_id,variant_id,content_sha256,storage_bucket,storage_key,width,height,last_verified_at')
      .single();
    if (insertError) throw insertError;
    const { error: variantError } = await supabase.schema('catalog').from('card_variants')
      .update({ native_image_status: 'available', same_artwork_as_variant_id: null })
      .eq('id', promotion.variantId);
    if (variantError) throw variantError;
    results.push({
      ...inserted,
      languageCode: promotion.fingerprint.languageCode,
      status: 'committed',
      sourceItemId: selected.sourceItemId,
      sourceListingUrl: selected.sourceListingUrl,
      sourceImageUrl: selected.sourceImageUrl,
      sourceImageSha256: selected.sourceImageSha256,
      rectifiedSha256: selected.rectifiedSha256,
    });
  }
  const body = {
    schemaVersion: COMMITTED_SCHEMA,
    generatedAt: new Date().toISOString(),
    projectRef: STAGING_PROJECT_REF,
    productionModified: false,
    approvalManifestSha256: approved.manifestSha256,
    requestedPromotionCount: promotions.length,
    committedCount: results.filter((item) => item.status === 'committed').length,
    reusedCount: results.filter((item) => item.status === 'reused_committed').length,
    skippedAlreadyEligibleCount: results.filter((item) => item.status === 'already_eligible').length,
    assets: results,
  };
  const manifest = { ...body, manifestSha256: manifestSha256(body) };
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    ok: true,
    phase: 'commit',
    outputPath,
    manifestSha256: manifest.manifestSha256,
    committedCount: body.committedCount,
    reusedCount: body.reusedCount,
    skippedAlreadyEligibleCount: body.skippedAlreadyEligibleCount,
    productionModified: false,
  }, null, 2));
}

async function main() {
  const phase = arg('phase');
  if (phase === 'prepare') return prepare();
  if (phase === 'commit') return commit();
  throw new Error('Use --phase=prepare or --phase=commit.');
}

main().catch((error) => {
  const detail = error instanceof Error
    ? error.message
    : (error && typeof error === 'object' ? JSON.stringify(error) : String(error));
  console.error(JSON.stringify({
    ok: false,
    error: detail,
    productionModified: false,
  }, null, 2));
  process.exitCode = 1;
});
