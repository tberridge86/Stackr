import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const REQUIRED_SCHEMA = 'stackr-poketrace-terapeak-benchmark-v2';
const REQUIRED_INPUT_SCHEMA = 'stackr-poketrace-terapeak-manual-sample-v1';
const REQUIRED_MANIFEST_SCHEMA = 'stackr-private-benchmark-evidence-manifest-v1';
const REQUIRED_REVIEW_SCHEMA = 'stackr-amber-rights-review-v1';
const REQUIRED_REVIEW_FEATURE = 'poketrace_terapeak_manual_benchmark';
const REQUIRED_REVIEW_FIELDS = Object.freeze([
  'dataAsset',
  'source',
  'ownerOrLicensor',
  'permittedPurpose',
  'territory',
  'term',
  'transformationRights',
  'storageRights',
  'deletionRequirements',
  'attribution',
  'downstreamDeliveryRights',
  'approvingPerson',
]);
const DEFAULT_WORKSPACE_ROOT = process.cwd();
const OFFICIAL_POKETRACE_BASE_URL = 'https://api.poketrace.com/v1';
const MAX_THRESHOLDS = Object.freeze({
  maxMedianApe: 0.03,
  maxMeanApe: 0.04,
  maxSingleSaleApe: 0.05,
  maxMedianDateDeltaDays: 1,
  maxSingleSaleDateDeltaDays: 1,
});
const REQUIRED_BENCHMARK_ATTESTATIONS = Object.freeze([
  'manuallyCollected',
  'noScraping',
  'noAutomation',
  'no130point',
  'exactListingPairsReviewed',
  'privateEvidenceIndexReviewed',
  'providerEvidenceFingerprintsRecomputed',
]);

function enabled(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function clean(value) {
  return String(value ?? '').trim();
}

function fail(message) {
  throw new Error(`PokeTrace activation blocked: ${message}`);
}

function validatePokeTraceBaseUrl(value) {
  const raw = clean(value) || OFFICIAL_POKETRACE_BASE_URL;
  try {
    const parsed = new URL(raw);
    const normalised = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`;
    if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash
      || normalised !== OFFICIAL_POKETRACE_BASE_URL) {
      fail('POKETRACE_API_BASE_URL must be the reviewed official endpoint');
    }
  } catch (error) {
    if (String(error?.message ?? '').startsWith('PokeTrace activation blocked:')) throw error;
    fail('POKETRACE_API_BASE_URL must be the reviewed official endpoint');
  }
}

function numeric(value, name) {
  if (value === null || value === undefined || value === '') {
    fail(`benchmark report is missing numeric ${name}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`benchmark report is missing numeric ${name}`);
  return parsed;
}

function isOutside(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot);
}

function resolveReviewedCheckoutFile(filePath, workspaceRoot, label, envName) {
  const requested = clean(filePath);
  if (!requested) fail(`${envName} is not set`);
  if (isAbsolute(requested)) fail(`${label} path must be relative to the reviewed deployment checkout`);

  let root;
  let candidate;
  try {
    root = realpathSync(resolve(workspaceRoot));
    const unresolvedCandidate = resolve(root, requested);
    if (isOutside(root, unresolvedCandidate)) fail(`${label} path escapes the reviewed deployment checkout`);
    candidate = realpathSync(unresolvedCandidate);
    if (isOutside(root, candidate)) fail(`${label} symlink escapes the reviewed deployment checkout`);
    if (!statSync(candidate).isFile()) fail(`${label} path is not a file`);
  } catch (error) {
    if (String(error?.message ?? '').startsWith('PokeTrace activation blocked:')) throw error;
    fail(`${label} could not be read from the reviewed deployment checkout`);
  }
  return candidate;
}

export function resolveReviewedPokeTraceReportPath(reportPath, workspaceRoot = DEFAULT_WORKSPACE_ROOT) {
  return resolveReviewedCheckoutFile(
    reportPath,
    workspaceRoot,
    'benchmark report',
    'POKETRACE_TERAPEAK_BENCHMARK_REPORT',
  );
}

export function resolveReviewedTerapeakRightsReviewPath(reviewPath, workspaceRoot = DEFAULT_WORKSPACE_ROOT) {
  return resolveReviewedCheckoutFile(
    reviewPath,
    workspaceRoot,
    'Terapeak amber review',
    'POKETRACE_TERAPEAK_RIGHTS_REVIEW',
  );
}

function verifyReviewedHash(content, suppliedHash, label) {
  const expectedHash = clean(suppliedHash).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) fail(`a reviewed 64-character ${label} SHA-256 is required`);
  const actualHash = createHash('sha256').update(content).digest('hex');
  if (actualHash !== expectedHash) fail(`${label} SHA-256 does not match the reviewed value`);
  return actualHash;
}

function validateTerapeakAmberReview(review) {
  if (review?.schemaVersion !== REQUIRED_REVIEW_SCHEMA || review?.featureKey !== REQUIRED_REVIEW_FEATURE) {
    fail('Terapeak amber review schema or feature key is invalid');
  }
  if (review.approvalStatus !== 'approved') fail('Terapeak amber review is not approved');
  if (!clean(review.operatingBoundaryReference).includes('docs/stackrtcg-ip-operating-boundary.md')) {
    fail('Terapeak amber review does not reference the operating boundary');
  }
  for (const field of REQUIRED_REVIEW_FIELDS) {
    if (!clean(review[field])) fail(`Terapeak amber review is missing ${field}`);
  }
  const approvedAt = Date.parse(clean(review.approvedAt));
  if (!Number.isFinite(approvedAt) || approvedAt > Date.now() + 5 * 60_000) {
    fail('Terapeak amber review has no valid, effective approvedAt timestamp');
  }
  if (!Array.isArray(review.evidenceReferences) || !review.evidenceReferences.some((value) => clean(value))) {
    fail('Terapeak amber review has no source-terms evidence reference');
  }
  if (review.expiresAt != null) {
    const expiry = Date.parse(clean(review.expiresAt));
    if (!Number.isFinite(expiry) || expiry <= Date.now()) fail('Terapeak amber review is expired or has an invalid expiresAt timestamp');
  }
  const controls = review.controls ?? {};
  for (const control of [
    'manualOnly',
    'noScraping',
    'noAutomation',
    'no130point',
    'privateRawSample',
    'uniqueListingIdsOnly',
    'privateEvidenceManifestRequired',
    'providerEvidenceFingerprintsRequired',
    'reviewerMustInspectPrivateEvidenceIndex',
    'reviewerMustRecomputeProviderEvidenceFingerprints',
  ]) {
    if (controls[control] !== true) fail(`Terapeak amber review must require ${control}`);
  }
}

function validateBenchmarkAudit(report, rightsReviewHash) {
  const audit = report?.audit ?? {};
  const manifest = audit.manifest ?? {};
  if (audit.inputSchemaVersion !== REQUIRED_INPUT_SCHEMA) fail('benchmark input schema is invalid');
  for (const [name, hash] of [
    ['input', audit.inputSha256],
    ['manifest', audit.manifestSha256],
    ['private evidence index', manifest.privateEvidenceIndexSha256],
    ['rights review', manifest.rightsReviewSha256],
  ]) {
    if (!/^[a-f0-9]{64}$/i.test(clean(hash))) fail(`benchmark ${name} SHA-256 is invalid`);
  }
  if (manifest.schemaVersion !== REQUIRED_MANIFEST_SCHEMA) fail('benchmark private evidence manifest schema is invalid');
  for (const field of ['reviewer', 'rightsReviewReference', 'sourceTermsReference']) {
    if (!clean(manifest[field])) fail(`benchmark private evidence manifest is missing ${field}`);
  }
  if (clean(manifest.rightsReviewSha256).toLowerCase() !== rightsReviewHash) {
    fail('benchmark private evidence manifest is not bound to the reviewed Terapeak approval');
  }
  const capturedAt = Date.parse(clean(manifest.capturedAt));
  if (!Number.isFinite(capturedAt) || capturedAt > Date.now() + 5 * 60_000) {
    fail('benchmark private evidence manifest has an invalid capturedAt timestamp');
  }
  const retentionUntil = Date.parse(clean(manifest.retentionUntil));
  if (!Number.isFinite(retentionUntil) || retentionUntil <= Date.now() || retentionUntil <= capturedAt) {
    fail('benchmark private evidence manifest retention has expired or is invalid');
  }
  for (const control of REQUIRED_BENCHMARK_ATTESTATIONS) {
    if (manifest.attestation?.[control] !== true) {
      fail(`benchmark private evidence manifest must attest ${control}`);
    }
  }
}

export function checkPokeTraceActivationReadiness({
  env = process.env,
  reportText = null,
  rightsReviewText = null,
  workspaceRoot = DEFAULT_WORKSPACE_ROOT,
} = {}) {
  const providerEnabled = enabled(env.PRICING_V2_POKETRACE_SOLD_ENABLED);
  const providerAuthorised = enabled(env.PRICING_V2_POKETRACE_SOLD_AUTHORISED);
  if (!providerEnabled && !providerAuthorised) {
    return { active: false, ready: true, reason: 'provider_disabled' };
  }
  if (!providerEnabled || !providerAuthorised) fail('enabled and authorised flags must both be true');
  if (!enabled(env.PRICING_ENGINE_V2_ENABLED)) fail('PRICING_ENGINE_V2_ENABLED must be true');
  if (!clean(env.POKETRACE_API_KEY)) fail('POKETRACE_API_KEY is missing from this worker environment');
  validatePokeTraceBaseUrl(env.POKETRACE_API_BASE_URL);

  const configuredReportPath = clean(env.POKETRACE_TERAPEAK_BENCHMARK_REPORT);
  const reviewedReportPath = reportText === null
    ? resolveReviewedPokeTraceReportPath(configuredReportPath, workspaceRoot)
    : configuredReportPath || '<in-memory>';
  const content = reportText ?? readFileSync(reviewedReportPath, 'utf8');
  const actualHash = verifyReviewedHash(content, env.POKETRACE_TERAPEAK_BENCHMARK_REPORT_SHA256, 'benchmark report');

  const configuredReviewPath = clean(env.POKETRACE_TERAPEAK_RIGHTS_REVIEW);
  const reviewedRightsPath = rightsReviewText === null
    ? resolveReviewedTerapeakRightsReviewPath(configuredReviewPath, workspaceRoot)
    : configuredReviewPath || '<in-memory>';
  const reviewContent = rightsReviewText ?? readFileSync(reviewedRightsPath, 'utf8');
  const reviewHash = verifyReviewedHash(reviewContent, env.POKETRACE_TERAPEAK_RIGHTS_REVIEW_SHA256, 'Terapeak amber review');
  let rightsReview;
  try {
    rightsReview = JSON.parse(reviewContent);
  } catch {
    fail('Terapeak amber review is not valid JSON');
  }
  validateTerapeakAmberReview(rightsReview);

  let report;
  try {
    report = JSON.parse(content);
  } catch {
    fail('benchmark report is not valid JSON');
  }
  if (report.schemaVersion !== REQUIRED_SCHEMA || report.offlineOnly !== true) {
    fail('benchmark report schema or offline-only marker is invalid');
  }
  if (report.activationEligible !== true
    || report.pass !== true
    || !Array.isArray(report.failures)
    || report.failures.length !== 0) {
    fail('benchmark report did not pass');
  }
  validateBenchmarkAudit(report, reviewHash);

  const metrics = report.metrics ?? {};
  const thresholds = report.thresholds ?? {};
  const recordCount = numeric(metrics.recordCount, 'metrics.recordCount');
  const comparableCount = numeric(metrics.comparableCount, 'metrics.comparableCount');
  const exactListingIdOverlap = numeric(metrics.exactListingIdOverlap, 'metrics.exactListingIdOverlap');
  const uniqueExactListingIds = numeric(metrics.uniqueExactListingIds, 'metrics.uniqueExactListingIds');
  if (numeric(thresholds.minComparable, 'thresholds.minComparable') < 30) fail('benchmark sample floor was weakened below 30');
  if (recordCount < 30 || comparableCount < 30) fail('fewer than 30 exact comparable sales were measured');
  if (comparableCount !== recordCount
    || exactListingIdOverlap !== recordCount
    || uniqueExactListingIds !== recordCount) {
    fail('every labelled benchmark row must be a unique exact-listing comparable sale');
  }
  for (const [name, maximum] of Object.entries(MAX_THRESHOLDS)) {
    if (numeric(thresholds[name], `thresholds.${name}`) > maximum) fail(`${name} was weakened`);
  }
  if (numeric(metrics.medianAbsolutePercentageError, 'metrics.medianAbsolutePercentageError') > MAX_THRESHOLDS.maxMedianApe) {
    fail('median price error exceeds 3%');
  }
  if (numeric(metrics.meanAbsolutePercentageError, 'metrics.meanAbsolutePercentageError') > MAX_THRESHOLDS.maxMeanApe) {
    fail('mean price error exceeds 4%');
  }
  if (numeric(metrics.maximumAbsolutePercentageError, 'metrics.maximumAbsolutePercentageError') > MAX_THRESHOLDS.maxSingleSaleApe) {
    fail('a matched sale price error exceeds 5%');
  }
  if (numeric(metrics.medianDateDeltaDays, 'metrics.medianDateDeltaDays') > MAX_THRESHOLDS.maxMedianDateDeltaDays) {
    fail('median sale-date drift exceeds 1 day');
  }
  if (numeric(metrics.maximumDateDeltaDays, 'metrics.maximumDateDeltaDays') > MAX_THRESHOLDS.maxSingleSaleDateDeltaDays) {
    fail('a matched sale date differs by more than 1 day');
  }
  for (const name of [
    'nonComparableRows',
    'exactPriceMismatches',
    'invalidPriceRows',
    'medianAbsolutePercentageError',
    'meanAbsolutePercentageError',
    'maximumAbsolutePercentageError',
    'listingIdMismatches',
    'duplicateListingIds',
    'duplicateEvidenceReferences',
    'identityMismatches',
    'gradeMismatches',
    'missingFields',
    'anomalyRows',
    'currencyMismatches',
    'invalidEvidenceHashes',
    'reviewerMismatches',
    'invalidCaptureTimestamps',
  ]) {
    if (numeric(metrics[name], `metrics.${name}`) !== 0) fail(`${name} must be zero before activation`);
  }

  return {
    active: true,
    ready: true,
    reportPath: reviewedReportPath,
    reportSha256: actualHash,
    rightsReviewPath: reviewedRightsPath,
    rightsReviewSha256: reviewHash,
    comparableCount,
  };
}
