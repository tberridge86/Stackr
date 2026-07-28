import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import {
  contentExtension,
  IMAGE_MIME_TYPES,
  PRIVATE_SCAN_MIME_TYPES,
  sha256,
  validateImageBuffer,
} from './assetValidation.js';
import { IMMUTABLE_CACHE_CONTROL } from './objectStorage.js';

export const STACKR_ASSET_BUCKETS = {
  publicCatalogue: 'stackr-catalogue-public',
  scanTemp: 'stackr-scan-temp',
  trainingFeedback: 'stackr-training-feedback',
  modelPrivate: 'stackr-model-private',
};

export const CATALOGUE_DERIVATIVE_SPECS = [
  { role: 'card-grid', width: 240, format: 'webp', quality: 82 },
  { role: 'search-result', width: 96, format: 'webp', quality: 78 },
  { role: 'detail-page', width: 720, format: 'webp', quality: 86 },
];

function assertAssetType(assetType) {
  const allowed = new Set(['card_image', 'set_symbol', 'set_logo', 'series_logo', 'sealed_product_image', 'other']);
  if (!allowed.has(assetType)) throw new Error(`Unsupported catalogue asset type: ${assetType}`);
}

export function contentHashStorageKey(input) {
  const extension = input.extension.replace(/^\./, '');
  return [
    input.visibility,
    input.assetType,
    input.sha256.slice(0, 2),
    input.sha256.slice(2, 4),
    input.sha256,
    `${input.role}.${extension}`,
  ].join('/');
}

async function imageHash(buffer) {
  const pixels = await sharp(buffer)
    .rotate()
    .resize(8, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
  const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  let bits = '';
  for (const value of pixels) bits += value >= average ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

export async function perceptualHashForImage(buffer) {
  return imageHash(buffer);
}

async function normalisedImage(buffer, mimeType) {
  const format = mimeType === 'image/png' ? 'png' : 'jpeg';
  const image = sharp(buffer).rotate();
  if (format === 'png') {
    return {
      mimeType: 'image/png',
      extension: 'png',
      buffer: await image.png({ compressionLevel: 9 }).toBuffer(),
    };
  }
  return {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    buffer: await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer(),
  };
}

async function derivativeImage(buffer, spec) {
  const output = await sharp(buffer)
    .rotate()
    .resize({ width: spec.width, withoutEnlargement: true })
    .webp({ quality: spec.quality })
    .toBuffer();
  const metadata = await sharp(output).metadata();
  return {
    role: spec.role,
    buffer: output,
    mimeType: 'image/webp',
    width: metadata.width,
    height: metadata.height,
    byteSize: output.length,
    sha256: sha256(output),
    extension: 'webp',
  };
}

async function putContentAddressedObject(storage, input) {
  try {
    return await storage.putObject(input);
  } catch (error) {
    const message = String(error?.message ?? error);
    const status = Number(error?.status ?? error?.statusCode ?? 0);
    if (status === 409 || /already exists|duplicate/i.test(message)) {
      return {
        provider: storage.id,
        bucket: input.bucket,
        key: input.key,
        path: input.key,
        cacheControl: input.cacheControl ?? null,
        duplicate: true,
      };
    }
    throw error;
  }
}

export async function buildApprovedCatalogueAsset(input) {
  assertAssetType(input.assetType);

  if (input.permissionStatus !== 'approved') {
    return {
      asset_id: input.assetId ?? randomUUID(),
      asset_type: input.assetType,
      storage_provider: input.permissionStatus === 'denied' || input.permissionStatus === 'restricted'
        ? 'unavailable'
        : 'external_reference',
      asset_visibility: 'public_catalogue',
      url: input.sourceUrl ?? null,
      original_source_url: input.sourceUrl ?? null,
      original_source_identifier: input.sourceIdentifier ?? null,
      source_attribution: input.sourceAttribution ?? null,
      permission_status: input.permissionStatus ?? 'unknown',
      rights_status: input.permissionStatus ?? 'unknown',
      publicly_servable: false,
      externally_referenced: input.permissionStatus !== 'denied' && input.permissionStatus !== 'restricted',
      unavailable_reason: input.permissionStatus === 'approved' ? null : 'mirroring_not_authorised',
      derivative_list: [],
      retention_status: 'unavailable',
      last_verified_at: new Date().toISOString(),
    };
  }

  const validation = validateImageBuffer(input.buffer, {
    declaredMimeType: input.mimeType,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxBytes: input.maxBytes ?? 12 * 1024 * 1024,
  });
  if (!validation.ok) {
    const error = new Error('Catalogue asset image validation failed.');
    error.details = validation.reasons;
    throw error;
  }

  const original = await normalisedImage(input.buffer, validation.mimeType);
  const originalSha = sha256(original.buffer);
  const originalMetadata = await sharp(original.buffer).metadata();
  const perceptualHash = await imageHash(original.buffer);
  const bucket = input.bucket ?? STACKR_ASSET_BUCKETS.publicCatalogue;
  const originalKey = contentHashStorageKey({
    visibility: 'public',
    assetType: input.assetType,
    sha256: originalSha,
    role: 'original',
    extension: original.extension,
  });

  await putContentAddressedObject(input.storage, {
    bucket,
    key: originalKey,
    body: original.buffer,
    contentType: original.mimeType,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    upsert: false,
  });

  const derivativeList = [];
  for (const spec of CATALOGUE_DERIVATIVE_SPECS) {
    const derivative = await derivativeImage(original.buffer, spec);
    const key = contentHashStorageKey({
      visibility: 'public',
      assetType: input.assetType,
      sha256: derivative.sha256,
      role: spec.role,
      extension: derivative.extension,
    });
    await putContentAddressedObject(input.storage, {
      bucket,
      key,
      body: derivative.buffer,
      contentType: derivative.mimeType,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      upsert: false,
    });
    derivativeList.push({
      role: spec.role,
      storageProvider: input.storage.id,
      storageBucket: bucket,
      storageKey: key,
      mimeType: derivative.mimeType,
      width: derivative.width,
      height: derivative.height,
      byteSize: derivative.byteSize,
      contentSha256: derivative.sha256,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });
  }

  return {
    asset_id: input.assetId ?? randomUUID(),
    asset_type: input.assetType,
    asset_visibility: 'public_catalogue',
    storage_provider: input.storage.id,
    storage_bucket: bucket,
    storage_key: originalKey,
    storage_path: originalKey,
    url: input.sourceUrl ?? null,
    original_source_url: input.sourceUrl ?? null,
    original_source_identifier: input.sourceIdentifier ?? null,
    source_attribution: input.sourceAttribution ?? null,
    permission_status: 'approved',
    rights_status: 'approved',
    content_sha256: originalSha,
    sha256: originalSha,
    perceptual_hash: perceptualHash,
    mime_type: original.mimeType,
    width: originalMetadata.width,
    height: originalMetadata.height,
    byte_size: original.buffer.length,
    derivative_list: derivativeList,
    cache_control: IMMUTABLE_CACHE_CONTROL,
    archival_storage_key: input.preserveArchivalOriginal === false ? null : originalKey,
    publicly_servable: true,
    externally_referenced: false,
    retention_status: 'active',
    last_verified_at: new Date().toISOString(),
  };
}

export function validatePrivateScanUpload(buffer, contentType, options = {}) {
  return validateImageBuffer(buffer, {
    declaredMimeType: contentType,
    allowedMimeTypes: PRIVATE_SCAN_MIME_TYPES,
    maxBytes: options.maxBytes ?? 20 * 1024 * 1024,
    maxWidth: options.maxWidth ?? 8000,
    maxHeight: options.maxHeight ?? 8000,
  });
}

export function privateScanStorageKey(input) {
  const userSegment = createHash('sha256')
    .update(String(input.userId ?? 'unknown-user'))
    .digest('hex')
    .slice(0, 24);
  const uploadId = String(input.uploadId ?? randomUUID());
  const extension = contentExtension(input.mimeType);
  return `private/u/${userSegment}/scan-temp/${uploadId}.${extension}`;
}

export async function createPrivateScanSignedUpload(input) {
  const mimeType = String(input.mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (!PRIVATE_SCAN_MIME_TYPES.has(mimeType)) {
    const error = new Error('Unsupported scan upload MIME type.');
    error.status = 415;
    throw error;
  }
  const maxBytes = Number(input.maxBytes ?? 20 * 1024 * 1024);
  if (Number(input.declaredByteSize ?? 0) > maxBytes) {
    const error = new Error('Scan upload is too large.');
    error.status = 413;
    throw error;
  }
  const expiresInSeconds = Math.max(60, Math.min(Number(input.expiresInSeconds ?? 600), 3600));
  const key = privateScanStorageKey({
    userId: input.userId,
    uploadId: input.uploadId,
    mimeType,
  });
  const signed = await input.storage.createSignedUpload({
    bucket: STACKR_ASSET_BUCKETS.scanTemp,
    key,
    contentType: mimeType,
    expiresInSeconds,
    upsert: false,
  });
  return {
    ...signed,
    storageBucket: STACKR_ASSET_BUCKETS.scanTemp,
    storageKey: key,
    maxBytes,
    mimeType,
    retentionStatus: 'temporary',
    retentionUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}
