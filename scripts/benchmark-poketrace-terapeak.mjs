#!/usr/bin/env node
/**
 * Offline comparison of manually transcribed PokeTrace and Terapeak sales.
 * This script deliberately has no HTTP client and never accesses Terapeak.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INPUT_SCHEMA = 'stackr-poketrace-terapeak-manual-sample-v1';
const MANIFEST_SCHEMA = 'stackr-private-benchmark-evidence-manifest-v1';
const REPORT_SCHEMA = 'stackr-poketrace-terapeak-benchmark-v2';
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const REQUIRED_ATTESTATIONS = Object.freeze([
  'manuallyCollected', 'noScraping', 'noAutomation', 'no130point',
  'exactListingPairsReviewed', 'privateEvidenceIndexReviewed', 'providerEvidenceFingerprintsRecomputed',
]);
const DEFAULT_THRESHOLDS = Object.freeze({
  minComparable: 30, maxMedianApe: 0.03, maxMeanApe: 0.04, maxSingleSaleApe: 0.05,
  // Sale dates remain a day-level manual-transcription diagnostic, not a
  // substitute for raw same-currency price equality below.
  maxMedianDateDeltaDays: 1, maxSingleSaleDateDeltaDays: 1, maxIdentityMismatches: 0,
  maxGradeMismatches: 0, maxMissingFields: 0,
});
const REQUIRED = Object.freeze({
  common: ['canonicalIdentityKey', 'conditionOrGrade', 'evidenceReference', 'capturedAt', 'reviewedBy'],
  poketrace: ['itemId', 'price', 'currency', 'soldAt', 'title', 'url', 'anomaly', 'evidenceSha256'],
  terapeak: ['listingId', 'finalPrice', 'currency', 'soldAt', 'notes', 'evidenceSha256'],
});

function value(raw) { return raw === undefined || raw === null ? '' : String(raw).trim(); }
function keyFor(raw) { return value(raw).replace(/[^a-zA-Z0-9]/g, '').toLowerCase(); }
function field(object, ...names) {
  if (!object || typeof object !== 'object') return undefined;
  const keys = new Map(Object.keys(object).map((key) => [keyFor(key), key]));
  for (const name of names) { const found = keys.get(keyFor(name)); if (found !== undefined) return object[found]; }
  return undefined;
}
function parseBoolean(raw) {
  if (typeof raw === 'boolean') return raw;
  const normalised = value(raw).toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalised)) return true;
  if (['false', '0', 'no', 'n'].includes(normalised)) return false;
  return null;
}
function numberOrNull(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const parsed = Number(value(raw).replace(/[£$€,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}
function isoOrNull(raw) { const text = value(raw); return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null; }
function sha256(text) { return createHash('sha256').update(text).digest('hex'); }
function normaliseManifest(raw) {
  const manifest = raw && typeof raw === 'object' ? raw : {};
  return {
    schemaVersion: value(manifest.schemaVersion), reviewer: value(manifest.reviewer), capturedAt: isoOrNull(manifest.capturedAt),
    rightsReviewReference: value(manifest.rightsReviewReference), rightsReviewSha256: value(manifest.rightsReviewSha256).toLowerCase(),
    sourceTermsReference: value(manifest.sourceTermsReference), privateEvidenceIndexSha256: value(manifest.privateEvidenceIndexSha256).toLowerCase(),
    retentionUntil: isoOrNull(manifest.retentionUntil),
    attestation: Object.fromEntries(REQUIRED_ATTESTATIONS.map((name) => [name, manifest.attestation?.[name] === true])),
  };
}
function normaliseRecord(raw, index) {
  const poketrace = raw.poketrace ?? raw.pokeTrace ?? {};
  const terapeak = raw.terapeak ?? raw.teraPeak ?? {};
  const commonIdentity = field(raw, 'canonicalIdentityKey', 'identityKey', 'cardIdentity');
  const commonGrade = field(raw, 'conditionOrGrade', 'gradeCondition', 'grade');
  return {
    row: index + 1, canonicalIdentityKey: value(commonIdentity), conditionOrGrade: value(commonGrade),
    evidenceReference: value(field(raw, 'evidenceReference', 'privateEvidenceReference')),
    capturedAt: isoOrNull(field(raw, 'capturedAt', 'reviewedAt')), reviewedBy: value(field(raw, 'reviewedBy', 'reviewer')),
    poketrace: {
      itemId: value(field(poketrace, 'itemId', 'poketraceItemId') ?? field(raw, 'poketraceItemId')),
      price: numberOrNull(field(poketrace, 'price', 'soldPrice') ?? field(raw, 'poketracePrice')),
      currency: value(field(poketrace, 'currency') ?? field(raw, 'poketraceCurrency')).toUpperCase(),
      soldAt: isoOrNull(field(poketrace, 'soldAt', 'date') ?? field(raw, 'poketraceSoldAt')),
      title: value(field(poketrace, 'title') ?? field(raw, 'poketraceTitle')),
      url: value(field(poketrace, 'url') ?? field(raw, 'poketraceUrl')),
      anomaly: parseBoolean(field(poketrace, 'anomaly') ?? field(raw, 'poketraceAnomaly')),
      identityKey: value(field(poketrace, 'identityKey', 'canonicalIdentityKey') ?? field(raw, 'poketraceIdentityKey')),
      conditionOrGrade: value(field(poketrace, 'conditionOrGrade', 'grade') ?? field(raw, 'poketraceConditionOrGrade')),
      evidenceSha256: value(field(poketrace, 'evidenceSha256', 'responseSha256') ?? field(raw, 'poketraceEvidenceSha256')).toLowerCase(),
    },
    terapeak: {
      listingId: value(field(terapeak, 'listingId', 'itemId') ?? field(raw, 'terapeakListingId')),
      finalPrice: numberOrNull(field(terapeak, 'finalPrice', 'price') ?? field(raw, 'terapeakFinalPrice')),
      currency: value(field(terapeak, 'currency') ?? field(raw, 'terapeakCurrency')).toUpperCase(),
      soldAt: isoOrNull(field(terapeak, 'soldAt', 'date') ?? field(raw, 'terapeakSoldAt')),
      notes: value(field(terapeak, 'notes') ?? field(raw, 'terapeakNotes')),
      identityKey: value(field(terapeak, 'identityKey', 'canonicalIdentityKey') ?? field(raw, 'terapeakIdentityKey')),
      conditionOrGrade: value(field(terapeak, 'conditionOrGrade', 'grade') ?? field(raw, 'terapeakConditionOrGrade')),
      evidenceSha256: value(field(terapeak, 'evidenceSha256', 'exportSha256') ?? field(raw, 'terapeakEvidenceSha256')).toLowerCase(),
    },
  };
}
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); cell = ''; if (row.some((entry) => entry.length)) rows.push(row); row = []; }
    else cell += char;
  }
  row.push(cell); if (row.some((entry) => entry.length)) rows.push(row);
  if (rows.length < 2) return [];
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}
export function readBenchmarkPackage(filePath, manifestPath = '') {
  const content = readFileSync(filePath, 'utf8'); const json = filePath.toLowerCase().endsWith('.json'); const raw = json ? JSON.parse(content) : parseCsv(content);
  const records = Array.isArray(raw) ? raw : raw?.records;
  if (!Array.isArray(records)) throw new Error('Benchmark input must be a JSON array, {"records": [...]}, or a CSV with headers.');
  let manifestRaw = Array.isArray(raw) ? null : raw?.manifest; let manifestContent = manifestRaw ? JSON.stringify(manifestRaw) : '';
  if (manifestPath) { manifestContent = readFileSync(manifestPath, 'utf8'); manifestRaw = JSON.parse(manifestContent); }
  return { records: records.map(normaliseRecord), audit: { inputSchemaVersion: Array.isArray(raw) ? (manifestPath ? INPUT_SCHEMA : '') : value(raw?.schemaVersion), inputSha256: sha256(content), manifestSha256: manifestContent ? sha256(manifestContent) : '', manifest: normaliseManifest(manifestRaw) } };
}
export function readBenchmarkInput(filePath, manifestPath = '') { return readBenchmarkPackage(filePath, manifestPath).records; }
function median(values) { if (!values.length) return null; const ordered = [...values].sort((a, b) => a - b); const middle = Math.floor(ordered.length / 2); return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2; }
function rounded(valueToRound, decimals = 4) { return valueToRound === null ? null : Number(valueToRound.toFixed(decimals)); }
function missing(record) {
  const result = [];
  for (const name of REQUIRED.common) if (!value(record[name])) result.push(name);
  for (const name of REQUIRED.poketrace) { const candidate = record.poketrace[name]; if (candidate === null || candidate === '' || candidate === undefined) result.push(`poketrace.${name}`); }
  for (const name of REQUIRED.terapeak) { const candidate = record.terapeak[name]; if (candidate === null || candidate === '' || candidate === undefined) result.push(`terapeak.${name}`); }
  return result;
}
function validateAuditPackage(audit) {
  const failures = []; const manifest = audit?.manifest ?? {};
  if (audit?.inputSchemaVersion !== INPUT_SCHEMA) failures.push('input_schema_invalid');
  if (!SHA256_PATTERN.test(value(audit?.inputSha256))) failures.push('input_sha256_invalid');
  if (!SHA256_PATTERN.test(value(audit?.manifestSha256))) failures.push('manifest_sha256_invalid');
  if (manifest.schemaVersion !== MANIFEST_SCHEMA) failures.push('manifest_schema_invalid');
  for (const fieldName of ['reviewer', 'rightsReviewReference', 'rightsReviewSha256', 'sourceTermsReference', 'privateEvidenceIndexSha256']) if (!value(manifest[fieldName])) failures.push(`manifest_${fieldName}_missing`);
  if (!SHA256_PATTERN.test(value(manifest.privateEvidenceIndexSha256))) failures.push('private_evidence_index_sha256_invalid');
  if (!SHA256_PATTERN.test(value(manifest.rightsReviewSha256))) failures.push('rights_review_sha256_invalid');
  const capturedAt = Date.parse(value(manifest.capturedAt)); if (!Number.isFinite(capturedAt) || capturedAt > Date.now() + 5 * 60_000) failures.push('manifest_captured_at_invalid');
  const retentionUntil = Date.parse(value(manifest.retentionUntil)); if (!Number.isFinite(retentionUntil) || retentionUntil <= Date.now() || retentionUntil <= capturedAt) failures.push('manifest_retention_until_invalid');
  for (const name of REQUIRED_ATTESTATIONS) if (manifest.attestation?.[name] !== true) failures.push(`manifest_attestation_${name}_missing`);
  return [...new Set(failures)];
}
export function evaluateBenchmark(records, suppliedThresholds = {}, audit = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...suppliedThresholds }; const issues = []; const auditFailures = validateAuditPackage(audit);
  if (auditFailures.length) issues.push({ row: null, type: 'audit_metadata_invalid', fields: auditFailures });
  const ape = []; const dateDeltas = []; const seenListingIds = new Set(); const seenEvidenceReferences = new Set();
  let exactListingIdOverlap = 0; let uniqueExactListingIds = 0; let duplicateListingIds = 0; let duplicateEvidenceReferences = 0; let listingIdMismatches = 0; let identityMismatches = 0; let gradeMismatches = 0; let missingFields = 0; let anomalyRows = 0; let currencyMismatches = 0; let invalidEvidenceHashes = 0; let reviewerMismatches = 0; let invalidCaptureTimestamps = 0; let invalidPriceRows = 0; let exactPriceMismatches = 0;
  for (const record of records) {
    const recordMissing = missing(record); missingFields += recordMissing.length; if (recordMissing.length) issues.push({ row: record.row, type: 'missing_fields', fields: recordMissing });
    const evidenceReference = value(record.evidenceReference); const duplicateEvidenceReference = Boolean(evidenceReference && seenEvidenceReferences.has(evidenceReference));
    if (duplicateEvidenceReference) { duplicateEvidenceReferences += 1; issues.push({ row: record.row, type: 'duplicate_evidence_reference', evidenceReference }); } else if (evidenceReference) seenEvidenceReferences.add(evidenceReference);
    const identityMismatch = [record.poketrace.identityKey, record.terapeak.identityKey].some((identity) => !identity || identity !== record.canonicalIdentityKey);
    const gradeMismatch = [record.poketrace.conditionOrGrade, record.terapeak.conditionOrGrade].some((grade) => !grade || grade.toLowerCase() !== record.conditionOrGrade.toLowerCase());
    if (identityMismatch) { identityMismatches += 1; issues.push({ row: record.row, type: 'identity_mismatch' }); }
    if (gradeMismatch) { gradeMismatches += 1; issues.push({ row: record.row, type: 'grade_mismatch' }); }
    const exactListingId = Boolean(record.poketrace.itemId && record.poketrace.itemId === record.terapeak.listingId); let duplicateListing = false;
    if (exactListingId) { exactListingIdOverlap += 1; if (seenListingIds.has(record.poketrace.itemId)) { duplicateListing = true; duplicateListingIds += 1; issues.push({ row: record.row, type: 'duplicate_listing_id', listingId: record.poketrace.itemId }); } else { seenListingIds.add(record.poketrace.itemId); uniqueExactListingIds += 1; } } else if (record.poketrace.itemId && record.terapeak.listingId) { listingIdMismatches += 1; issues.push({ row: record.row, type: 'listing_id_mismatch' }); }
    const evidenceHashesInvalid = !SHA256_PATTERN.test(record.poketrace.evidenceSha256) || !SHA256_PATTERN.test(record.terapeak.evidenceSha256);
    if (evidenceHashesInvalid) { invalidEvidenceHashes += 1; issues.push({ row: record.row, type: 'invalid_evidence_sha256' }); }
    const pricesValid = Number.isFinite(record.poketrace.price) && record.poketrace.price > 0
      && Number.isFinite(record.terapeak.finalPrice) && record.terapeak.finalPrice > 0;
    if (!pricesValid) { invalidPriceRows += 1; issues.push({ row: record.row, type: 'invalid_price' }); }
    const reviewerMismatch = !record.reviewedBy || record.reviewedBy !== audit?.manifest?.reviewer; if (reviewerMismatch) { reviewerMismatches += 1; issues.push({ row: record.row, type: 'reviewer_mismatch' }); }
    const capturedAt = Date.parse(value(record.capturedAt)); const captureTimestampInvalid = !Number.isFinite(capturedAt) || capturedAt > Date.now() + 5 * 60_000; if (captureTimestampInvalid) { invalidCaptureTimestamps += 1; issues.push({ row: record.row, type: 'invalid_capture_timestamp' }); }
    if (record.poketrace.anomaly === true) { anomalyRows += 1; issues.push({ row: record.row, type: 'poketrace_anomaly' }); continue; }
    if (record.poketrace.currency !== record.terapeak.currency) { currencyMismatches += 1; issues.push({ row: record.row, type: 'currency_mismatch' }); continue; }
    if (recordMissing.length || identityMismatch || gradeMismatch || !exactListingId || duplicateListing || duplicateEvidenceReference || evidenceHashesInvalid || reviewerMismatch || captureTimestampInvalid || record.poketrace.anomaly !== false || !pricesValid) continue;
    const referencePrice = record.terapeak.finalPrice;
    // This is a same-currency, raw-numeric comparison. Percentages below are
    // diagnostics only; a penny mismatch on an expensive card still fails.
    const exactTolerance = Number.EPSILON * Math.max(1, Math.abs(record.poketrace.price), Math.abs(referencePrice)) * 8;
    if (Math.abs(record.poketrace.price - referencePrice) > exactTolerance) {
      exactPriceMismatches += 1;
      issues.push({ row: record.row, type: 'exact_price_mismatch' });
    }
    ape.push(Math.abs(record.poketrace.price - referencePrice) / referencePrice); dateDeltas.push(Math.abs(Date.parse(record.poketrace.soldAt) - Date.parse(record.terapeak.soldAt)) / 86_400_000);
  }
  const metrics = { recordCount: records.length, comparableCount: ape.length, nonComparableRows: records.length - ape.length, exactListingIdOverlap, uniqueExactListingIds, duplicateListingIds, duplicateEvidenceReferences, exactListingIdOverlapRate: records.length ? rounded(exactListingIdOverlap / records.length) : null, listingIdMismatches, exactPriceMismatches, invalidPriceRows, medianAbsolutePercentageError: rounded(median(ape)), meanAbsolutePercentageError: ape.length ? rounded(ape.reduce((sum, item) => sum + item, 0) / ape.length) : null, maximumAbsolutePercentageError: ape.length ? rounded(Math.max(...ape)) : null, medianDateDeltaDays: rounded(median(dateDeltas), 2), maximumDateDeltaDays: dateDeltas.length ? rounded(Math.max(...dateDeltas), 2) : null, identityMismatches, gradeMismatches, missingFields, anomalyRows, currencyMismatches, invalidEvidenceHashes, reviewerMismatches, invalidCaptureTimestamps };
  const failures = [];
  if (auditFailures.length) failures.push('audit_metadata_invalid');
  if (metrics.comparableCount < thresholds.minComparable) failures.push('insufficient_comparable_sample');
  if (metrics.medianAbsolutePercentageError === null || metrics.medianAbsolutePercentageError > thresholds.maxMedianApe) failures.push('median_price_error_exceeded');
  if (metrics.meanAbsolutePercentageError === null || metrics.meanAbsolutePercentageError > thresholds.maxMeanApe) failures.push('mean_price_error_exceeded');
  if (metrics.maximumAbsolutePercentageError === null || metrics.maximumAbsolutePercentageError > thresholds.maxSingleSaleApe) failures.push('single_sale_price_error_exceeded');
  if (metrics.medianDateDeltaDays === null || metrics.medianDateDeltaDays > thresholds.maxMedianDateDeltaDays) failures.push('median_date_delta_exceeded');
  if (metrics.maximumDateDeltaDays === null || metrics.maximumDateDeltaDays > thresholds.maxSingleSaleDateDeltaDays) failures.push('single_sale_date_delta_exceeded');
  if (metrics.identityMismatches > thresholds.maxIdentityMismatches) failures.push('identity_mismatches_exceeded');
  if (metrics.gradeMismatches > thresholds.maxGradeMismatches) failures.push('grade_mismatches_exceeded');
  if (metrics.missingFields > thresholds.maxMissingFields) failures.push('missing_fields_exceeded');
  if (metrics.nonComparableRows > 0) failures.push('non_comparable_rows_detected');
  if (metrics.invalidPriceRows > 0) failures.push('invalid_price_rows_detected');
  if (metrics.exactPriceMismatches > 0) failures.push('exact_price_mismatches_detected');
  if (metrics.listingIdMismatches > 0) failures.push('listing_id_mismatches_detected');
  if (metrics.duplicateListingIds > 0) failures.push('duplicate_listing_ids_detected');
  if (metrics.duplicateEvidenceReferences > 0) failures.push('duplicate_evidence_references_detected');
  if (metrics.anomalyRows > 0) failures.push('poketrace_anomalies_detected');
  if (metrics.currencyMismatches > 0) failures.push('currency_mismatches_detected');
  if (metrics.invalidEvidenceHashes > 0) failures.push('invalid_evidence_hashes_detected');
  if (metrics.reviewerMismatches > 0) failures.push('reviewer_mismatches_detected');
  if (metrics.invalidCaptureTimestamps > 0) failures.push('invalid_capture_timestamps_detected');
  return { schemaVersion: REPORT_SCHEMA, offlineOnly: true, activationEligible: failures.length === 0, audit, thresholds, metrics, failures, pass: failures.length === 0, issues };
}
function usage() { return 'Usage: node scripts/benchmark-poketrace-terapeak.mjs --input <manual.csv|manual.json> [--manifest private-manifest.json] [--output report.json] [--min-comparable 30] [--max-median-ape 0.03] [--max-mean-ape 0.04] [--max-single-sale-ape 0.05] [--max-median-date-delta-days 1] [--max-single-sale-date-delta-days 1]'; }
export function parseArgs(args) { const options = {}; for (let index = 0; index < args.length; index += 1) { const key = args[index]; if (key === '--help') return { help: true }; if (!key.startsWith('--') || args[index + 1] === undefined) throw new Error(usage()); options[key.slice(2)] = args[index + 1]; index += 1; } return options; }
function thresholdOptions(options) { const map = { 'min-comparable': 'minComparable', 'max-median-ape': 'maxMedianApe', 'max-mean-ape': 'maxMeanApe', 'max-single-sale-ape': 'maxSingleSaleApe', 'max-median-date-delta-days': 'maxMedianDateDeltaDays', 'max-single-sale-date-delta-days': 'maxSingleSaleDateDeltaDays', 'max-identity-mismatches': 'maxIdentityMismatches', 'max-grade-mismatches': 'maxGradeMismatches', 'max-missing-fields': 'maxMissingFields' }; return Object.fromEntries(Object.entries(map).flatMap(([flag, name]) => options[flag] === undefined ? [] : [[name, Number(options[flag])]])); }
function main() { const options = parseArgs(process.argv.slice(2)); if (options.help) { console.log(usage()); return; } if (!options.input) throw new Error(usage()); const benchmarkPackage = readBenchmarkPackage(resolve(options.input), options.manifest ? resolve(options.manifest) : ''); const report = evaluateBenchmark(benchmarkPackage.records, thresholdOptions(options), benchmarkPackage.audit); const output = `${JSON.stringify(report, null, 2)}\n`; if (options.output) writeFileSync(resolve(options.output), output); console.log(output); if (!report.pass) process.exitCode = 1; }
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) main();
