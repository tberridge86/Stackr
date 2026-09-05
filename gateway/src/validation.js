import { GatewayError } from './errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TOKEN = /^[A-Za-z0-9._~:/+-]+$/;
const LANGUAGE_CODES = new Set(['en', 'ja', 'zh-tw', 'zh-cn', 'ko']);
const PRODUCT_TYPES = new Set(['raw_card', 'graded_card', 'sealed_product']);
const OBSERVATION_TYPES = new Set(['sold_observation', 'active_listing']);
const FEEDBACK_ACTIONS = new Set([
  'confirm_result',
  'choose_candidate',
  'manual_correction',
  'variant_correction',
  'missing_card',
  'bad_scan',
]);
const SHADOW_REVIEW_STATUSES = new Set(['pending_review', 'reviewed', 'ignored']);

function bad(code, message, details) {
  throw new GatewayError(400, code, message, details);
}

export function validatePath(pathname) {
  if (!pathname.startsWith('/v1/') || pathname.length > 512) {
    bad('invalid_path', 'Request path is not valid for Stackr API v1.');
  }
  if (/\.{2}|%2f|%5c|\\|\/\//i.test(pathname)) {
    bad('invalid_path', 'Request path contains a forbidden sequence.');
  }
}

function validateQueryValue(name, value) {
  if (value.length > 2048) bad('invalid_query', `${name} is too long.`);
  if (name === 'limit' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 500)) {
    bad('invalid_limit', 'limit must be an integer between 1 and 500.');
  }
  if (name === 'since' && (!/^\d+$/.test(value) || Number(value) < 0)) {
    bad('invalid_change_sequence', 'since must be a non-negative integer.');
  }
  if (name === 'language' && !LANGUAGE_CODES.has(value)) {
    bad('invalid_language', 'language is not supported.');
  }
  if (name === 'currency' && !/^[A-Z]{3}$/.test(value)) {
    bad('invalid_currency', 'currency must be a three-letter uppercase code.');
  }
  if (name === 'productType' && !PRODUCT_TYPES.has(value)) {
    bad('invalid_product_type', 'productType is not supported.');
  }
  if (name === 'observationType' && !OBSERVATION_TYPES.has(value)) {
    bad('invalid_observation_type', 'observationType is not supported.');
  }
  if (['seriesId', 'setId', 'sourceId', 'printingId', 'variantId'].includes(name) && !UUID_PATTERN.test(value)) {
    bad('invalid_identifier', `${name} must be a UUID.`);
  }
  if (name === 'q' && (value.trim().length < 2 || value.trim().length > 160)) {
    bad('invalid_search_query', 'q must contain between 2 and 160 characters.');
  }
  if (name === 'cursor' && !/^[A-Za-z0-9_-]{1,2048}$/.test(value)) {
    bad('invalid_cursor', 'cursor is not a valid opaque Stackr cursor.');
  }
  if (!['q', 'cursor'].includes(name) && value && !SAFE_TOKEN.test(value)) {
    bad('invalid_query', `${name} contains unsupported characters.`);
  }
}

export function validateQuery(route, url) {
  const seen = new Set();
  for (const [name, value] of url.searchParams) {
    if (!route.query?.has(name)) {
      bad('unsupported_query_parameter', `Query parameter ${name} is not supported on this route.`);
    }
    if (seen.has(name)) bad('duplicate_query_parameter', `Query parameter ${name} may only be supplied once.`);
    seen.add(name);
    validateQueryValue(name, value);
  }
}

export function validateDeviceId(value, required) {
  const deviceId = String(value ?? '').trim();
  if (!deviceId && !required) return null;
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(deviceId)) {
    throw new GatewayError(400, 'invalid_device_id', 'X-Stackr-Device-Id must contain 8 to 128 safe characters.');
  }
  return deviceId;
}

export function validateIdempotencyKey(value) {
  const key = String(value ?? '').trim();
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
    throw new GatewayError(400, 'idempotency_key_required', 'A valid Idempotency-Key header is required for this mutation.');
  }
  return key;
}

function requireObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    bad('invalid_payload', 'JSON request body must be an object.');
  }
  return value;
}

function rejectUnknownKeys(value, allowed) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) bad('unsupported_payload_field', 'Request body contains unsupported fields.', { fields: unknown });
}

function requireString(value, name, max = 256) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > max) {
    bad('invalid_payload', `${name} must be a non-empty string no longer than ${max} characters.`);
  }
}

function rejectImageData(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  if (serialized.includes('data:image') || serialized.includes('base64image') || serialized.includes('imagebytes')) {
    throw new GatewayError(413, 'image_payload_not_allowed', 'Use a private uploaded-image key instead of image bytes in JSON.');
  }
}

function validateRecognitionIdentify(payload) {
  rejectUnknownKeys(payload, new Set([
    'modelVersion', 'embedding', 'ocrText', 'possibleCollectorNumber', 'possibleSetCode',
    'possibleCardName', 'detectedLanguage', 'detectedScript', 'captureQuality',
    'privateImageKey', 'imageMimeType', 'corners', 'consent', 'client',
  ]));
  requireString(payload.modelVersion, 'modelVersion', 160);
  requireObject(payload.captureQuality);
  if (payload.embedding != null) {
    if (!Array.isArray(payload.embedding) || payload.embedding.length < 1 || payload.embedding.length > 4096) {
      bad('invalid_embedding', 'embedding must contain between 1 and 4096 values.');
    }
    if (payload.embedding.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
      bad('invalid_embedding', 'embedding values must be finite numbers.');
    }
  }
  if (payload.ocrText != null && (typeof payload.ocrText !== 'string' || payload.ocrText.length > 2000)) {
    bad('invalid_ocr_text', 'ocrText must be a string no longer than 2000 characters.');
  }
  for (const [name, max] of [['possibleCollectorNumber', 160], ['possibleSetCode', 160], ['possibleCardName', 256], ['detectedScript', 64], ['imageMimeType', 64]]) {
    optionalString(payload, name, max);
  }
  if (payload.detectedLanguage != null && !LANGUAGE_CODES.has(payload.detectedLanguage)) {
    bad('invalid_language', 'detectedLanguage is not supported.');
  }
  if (payload.imageMimeType != null && !['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(payload.imageMimeType)) {
    bad('invalid_mime_type', 'imageMimeType is not supported.');
  }
  if (payload.privateImageKey != null) requireString(payload.privateImageKey, 'privateImageKey', 1024);
  for (const name of ['captureQuality', 'corners', 'consent', 'client']) {
    if (payload[name] != null) requireObject(payload[name]);
  }
  if (payload.embedding == null && !payload.privateImageKey) {
    bad('recognition_evidence_required', 'An embedding or privateImageKey is required.');
  }
  rejectImageData(payload);
}

function validateRecognitionEmbed(payload) {
  rejectUnknownKeys(payload, new Set(['modelVersion', 'privateImageKey', 'imageMimeType', 'corners', 'consent', 'client']));
  requireString(payload.modelVersion, 'modelVersion', 160);
  requireString(payload.privateImageKey, 'privateImageKey', 1024);
  if (payload.imageMimeType != null && !['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(payload.imageMimeType)) {
    bad('invalid_mime_type', 'imageMimeType is not supported.');
  }
  for (const name of ['corners', 'consent', 'client']) {
    if (payload[name] != null) requireObject(payload[name]);
  }
  rejectImageData(payload);
}

function validateRecognitionFeedback(payload) {
  rejectUnknownKeys(payload, new Set(['scanId', 'feedbackAction', 'selectedVariantId', 'correctedVariantId', 'notes', 'consent', 'client']));
  if (!UUID_PATTERN.test(String(payload.scanId ?? ''))) bad('invalid_scan_id', 'scanId must be a UUID.');
  if (!FEEDBACK_ACTIONS.has(payload.feedbackAction)) bad('invalid_feedback_action', 'feedbackAction is not supported.');
  for (const name of ['selectedVariantId', 'correctedVariantId']) {
    if (payload[name] != null && !UUID_PATTERN.test(payload[name])) bad('invalid_variant_id', `${name} must be a UUID.`);
  }
  if (payload.notes != null && (typeof payload.notes !== 'string' || payload.notes.length > 1000)) {
    bad('invalid_feedback_notes', 'notes must be no longer than 1000 characters.');
  }
  for (const name of ['consent', 'client']) {
    if (payload[name] != null) requireObject(payload[name]);
  }
}

function assertNoShadowImageFields(value, path = 'record') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey !== 'rawimagerecorded' && /(?:base64|imagebytes|imageuri|rawimage|photouri)/i.test(key)) {
      bad('shadow_image_payload_forbidden', `Shadow comparison field ${path}.${key} is not allowed.`);
    }
    if (child && typeof child === 'object') assertNoShadowImageFields(child, `${path}.${key}`);
  }
}

function validateRecognitionShadowComparison(payload) {
  rejectUnknownKeys(payload, new Set(['record']));
  const record = requireObject(payload.record);
  if (record.rawImageRecorded !== false || record.shadowSnapshot?.rawImageRecorded !== false) {
    bad('shadow_image_payload_forbidden', 'Shadow comparisons must explicitly record that no raw image was retained.');
  }
  requireString(record.schemaVersion, 'record.schemaVersion', 96);
  requireString(record.localRecordId, 'record.localRecordId', 192);
  requireString(record.anonymousScanId, 'record.anonymousScanId', 192);
  assertNoShadowImageFields(record);
}

function validateRecognitionShadowReview(payload) {
  rejectUnknownKeys(payload, new Set(['reviewStatus', 'disagreementCategory', 'reviewerNotes']));
  if (!SHADOW_REVIEW_STATUSES.has(payload.reviewStatus)) {
    bad('invalid_review_status', 'reviewStatus is not supported.');
  }
  optionalString(payload, 'disagreementCategory', 128);
  optionalString(payload, 'reviewerNotes', 2000);
}

function validateScanPresign(payload) {
  rejectUnknownKeys(payload, new Set(['uploadId', 'mimeType', 'byteSize', 'expiresInSeconds']));
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(payload.mimeType)) {
    bad('invalid_mime_type', 'mimeType is not an approved scan image type.');
  }
  if (!Number.isInteger(payload.byteSize) || payload.byteSize < 1 || payload.byteSize > 10 * 1024 * 1024) {
    bad('invalid_upload_size', 'byteSize must be between 1 byte and 10 MB.');
  }
  if (payload.uploadId != null && !/^[A-Za-z0-9._:-]{8,128}$/.test(payload.uploadId)) {
    bad('invalid_upload_id', 'uploadId must contain 8 to 128 safe characters.');
  }
  if (payload.expiresInSeconds != null
    && (!Number.isInteger(payload.expiresInSeconds) || payload.expiresInSeconds < 60 || payload.expiresInSeconds > 3600)) {
    bad('invalid_expiry', 'expiresInSeconds must be an integer between 60 and 3600.');
  }
}

function validateCacheActivation(payload) {
  rejectUnknownKeys(payload, new Set(['catalogueVersion']));
  requireString(payload.catalogueVersion, 'catalogueVersion', 160);
  if (!SAFE_TOKEN.test(payload.catalogueVersion)) bad('invalid_catalogue_version', 'catalogueVersion contains unsupported characters.');
}

function optionalString(payload, name, max = 256) {
  if (payload[name] != null) requireString(payload[name], name, max);
}

function validateAdminOptions(payload) {
  for (const name of ['source', 'language', 'setId', 'providerRecordId', 'runKey', 'runAfter', 'idempotencyKey', 'requestId']) {
    optionalString(payload, name, name === 'providerRecordId' ? 512 : 256);
  }
  if (payload.setId != null && !UUID_PATTERN.test(payload.setId)) bad('invalid_set_id', 'setId must be a UUID.');
  if (payload.language != null && !LANGUAGE_CODES.has(payload.language)) bad('invalid_language', 'language is not supported.');
  if (payload.dryRun != null && typeof payload.dryRun !== 'boolean') bad('invalid_dry_run', 'dryRun must be a boolean.');
  if (payload.allowImageAssets != null && typeof payload.allowImageAssets !== 'boolean') {
    bad('invalid_allow_image_assets', 'allowImageAssets must be a boolean.');
  }
  if (payload.priority != null && (!Number.isInteger(payload.priority) || payload.priority < 0 || payload.priority > 100)) {
    bad('invalid_priority', 'priority must be an integer between 0 and 100.');
  }
}

function validateCatalogueAdminCommand(payload, pathname) {
  rejectUnknownKeys(payload, new Set([
    'source', 'language', 'setId', 'providerRecordId', 'runKey', 'dryRun', 'allowImageAssets',
    'priority', 'runAfter', 'idempotencyKey', 'requestId',
  ]));
  validateAdminOptions(payload);
  if (pathname.endsWith('/run-source') && !payload.source) bad('source_required', 'source is required for run-source.');
  if (pathname.endsWith('/run-language') && !payload.language) bad('language_required', 'language is required for run-language.');
  if (pathname.endsWith('/run-set') && !payload.setId) bad('set_id_required', 'setId is required for run-set.');
  if (pathname.endsWith('/resume-import') && !payload.runKey) bad('run_key_required', 'runKey is required for resume-import.');
  if (pathname.endsWith('/rebuild-record') && !payload.providerRecordId) {
    bad('provider_record_id_required', 'providerRecordId is required for rebuild-record.');
  }
}

function validateAssetMigrationCommand(payload) {
  rejectUnknownKeys(payload, new Set([
    'assetType', 'setId', 'printingId', 'variantId', 'since', 'limit', 'dryRun',
    'priority', 'runAfter', 'idempotencyKey', 'requestId',
  ]));
  for (const name of ['assetType', 'setId', 'printingId', 'variantId', 'since', 'runAfter', 'idempotencyKey', 'requestId']) {
    optionalString(payload, name, 256);
  }
  for (const name of ['setId', 'printingId', 'variantId']) {
    if (payload[name] != null && !UUID_PATTERN.test(payload[name])) bad('invalid_identifier', `${name} must be a UUID.`);
  }
  if (payload.limit != null && (!Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 1000)) {
    bad('invalid_limit', 'limit must be an integer between 1 and 1000.');
  }
  if (payload.dryRun != null && typeof payload.dryRun !== 'boolean') bad('invalid_dry_run', 'dryRun must be a boolean.');
  if (payload.priority != null && (!Number.isInteger(payload.priority) || payload.priority < 0 || payload.priority > 100)) {
    bad('invalid_priority', 'priority must be an integer between 0 and 100.');
  }
}

function validateQualityEvaluation(payload) {
  rejectUnknownKeys(payload, new Set([
    'runKey', 'manifestSha256', 'environment', 'sourceCommitSha', 'report',
  ]));
  requireString(payload.runKey, 'runKey', 192);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/.test(payload.runKey)) bad('invalid_run_key', 'runKey is not valid.');
  if (!/^[a-f0-9]{64}$/.test(String(payload.manifestSha256 ?? ''))) bad('invalid_manifest_checksum', 'manifestSha256 must be a lowercase SHA-256.');
  if (!['development', 'test', 'staging', 'production'].includes(payload.environment)) bad('invalid_environment', 'environment is not supported.');
  if (payload.sourceCommitSha != null && !/^[a-f0-9]{7,64}$/.test(payload.sourceCommitSha)) bad('invalid_commit_sha', 'sourceCommitSha is not valid.');
  requireObject(payload.report);
  requireString(payload.report.schemaVersion, 'report.schemaVersion', 96);
  requireString(payload.report.datasetKey, 'report.datasetKey', 160);
  if (!['blocked', 'internal_only', 'release_candidate'].includes(payload.report.claimStatus)) bad('invalid_claim_status', 'report.claimStatus is invalid.');
  if (!Array.isArray(payload.report.releaseGates) || payload.report.releaseGates.length !== 7) bad('invalid_release_gates', 'The complete immutable release-gate set is required.');
  const serialized = JSON.stringify(payload.report);
  if (/"(?:ocrText|privateImageKey|imagePath|imageUrl|imageBytes|imagePayload|userId|deviceId|accessToken)"\s*:/i.test(serialized)) {
    bad('sensitive_quality_payload', 'Quality reports may contain aggregate evidence only.');
  }
}

function validateObservabilityRefresh(payload) {
  rejectUnknownKeys(payload, new Set(['windowHours']));
  if (payload.windowHours != null
    && (!Number.isInteger(payload.windowHours) || payload.windowHours < 1 || payload.windowHours > 720)) {
    bad('invalid_observability_window', 'windowHours must be an integer between 1 and 720.');
  }
}

function validateSameArtworkDisplayReferences(payload) {
  rejectUnknownKeys(payload, new Set(['references']));
  if (!Array.isArray(payload.references) || payload.references.length < 1 || payload.references.length > 50) {
    bad('invalid_same_artwork_references', 'references must contain between 1 and 50 source identities.');
  }
  const seen = new Set();
  for (const reference of payload.references) {
    if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
      bad('invalid_same_artwork_reference', 'Each reference must be an object.');
    }
    rejectUnknownKeys(reference, new Set(['sourceCardId', 'sourceDefaultVariantId']));
    if (!UUID_PATTERN.test(reference.sourceCardId ?? '') || !UUID_PATTERN.test(reference.sourceDefaultVariantId ?? '')) {
      bad('invalid_same_artwork_reference', 'Same-artwork source identities must be canonical UUIDs.');
    }
    const key = `${reference.sourceCardId}:${reference.sourceDefaultVariantId}`.toLowerCase();
    if (seen.has(key)) bad('duplicate_same_artwork_reference', 'Same-artwork source identities must not be duplicated.');
    seen.add(key);
  }
}

export function parseAndValidateJson(bodyBytes, kind, pathname = '') {
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    bad('invalid_json', 'Request body is not valid JSON.');
  }
  requireObject(payload);
  if (kind === 'recognitionIdentify') validateRecognitionIdentify(payload);
  if (kind === 'recognitionEmbed') validateRecognitionEmbed(payload);
  if (kind === 'recognitionFeedback') validateRecognitionFeedback(payload);
  if (kind === 'recognitionShadowComparison') validateRecognitionShadowComparison(payload);
  if (kind === 'recognitionShadowReview') validateRecognitionShadowReview(payload);
  if (kind === 'scanPresign') validateScanPresign(payload);
  if (kind === 'cacheActivation') validateCacheActivation(payload);
  if (kind === 'catalogueAdminCommand') validateCatalogueAdminCommand(payload, pathname);
  if (kind === 'assetMigrationCommand') validateAssetMigrationCommand(payload);
  if (kind === 'qualityEvaluation') validateQualityEvaluation(payload);
  if (kind === 'observabilityRefresh') validateObservabilityRefresh(payload);
  if (kind === 'sameArtworkDisplayReferences') validateSameArtworkDisplayReferences(payload);
  return payload;
}

export function detectImageMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF'
    && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp') {
    const brand = new TextDecoder().decode(bytes.slice(8, 12));
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  return null;
}

export function validateImageBody(bytes, contentType) {
  const declared = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  const detected = detectImageMime(bytes);
  if (!detected) bad('invalid_image_signature', 'Uploaded image file signature is not supported.');
  if (declared !== 'application/octet-stream' && declared !== detected) {
    bad('mime_signature_mismatch', 'Declared image MIME type does not match the file signature.');
  }
  return detected;
}

export async function readBoundedBody(request, maxBytes) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) {
    throw new GatewayError(413, 'payload_too_large', `Request body exceeds the ${maxBytes}-byte limit.`);
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('payload too large');
      throw new GatewayError(413, 'payload_too_large', `Request body exceeds the ${maxBytes}-byte limit.`);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
