import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseManualCsv } from './catalogue-ingestion/manualAdapters';

const MANIFEST_NAME = 'capture-review-manifest.csv';
const CONSENT_NAME = 'capture-consent-evidence.json';
const REQUIRED_CONSENT_SCOPE = 'private_model_evaluation_and_training';

type CaptureRow = Record<string, string>;

type ConsentEvidence = {
  schemaVersion?: string;
  recordedAt?: string;
  scope?: string;
  ownerStatement?: string;
  reviewedPhysicalCardSessions?: string[];
  productionPublicationApproved?: boolean;
};

function sha256(buffer: Buffer | string) {
  return createHash('sha256').update(buffer).digest('hex');
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function languageTag(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === 'zh-cn' || normalized === 'zh-hans') return 'zh-Hans';
  if (normalized === 'zh-tw' || normalized === 'zh-hant') return 'zh-Hant';
  return normalized;
}

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function insideRoot(root: string, relativePath: string) {
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Capture path escapes the approved root: ${relativePath}`);
  }
  return resolved;
}

function identityKey(row: CaptureRow) {
  return [
    clean(row.set_code),
    clean(row.collector_number),
    clean(row.variant),
    clean(row.finish),
    clean(row.expected_card_name).toLocaleLowerCase('en'),
    languageTag(clean(row.language)),
  ].join('|');
}

function assertEligible(row: CaptureRow) {
  const required = [
    'relative_path',
    'sha256',
    'physical_card_session_id',
    'set_code',
    'collector_number',
    'variant',
    'finish',
    'expected_card_name',
    'language',
  ];
  const missing = required.filter((field) => !clean(row[field]));
  if (missing.length) throw new Error(`Capture row is missing ${missing.join(', ')}.`);
  if (clean(row.source_kind) !== 'real_capture') throw new Error('Only real captures are eligible.');
  if (clean(row.image_rights_status) !== 'user_consent') throw new Error('Capture rights are not user-confirmed.');
  if (clean(row.review_status) !== 'confirmed') throw new Error('Capture review is not confirmed.');
  if (!['reviewed', 'verified'].includes(clean(row.label_verification_status))) {
    throw new Error('Capture label has not been reviewed.');
  }
  if (clean(row.card_side) !== 'front') throw new Error('Only front-card captures are eligible.');
  if (!/^[0-9a-f]{64}$/i.test(clean(row.sha256))) throw new Error('Capture SHA-256 is invalid.');
}

export function buildReviewedCaptureEvaluationManifest({
  root,
  verifyHashes = true,
  generatedAt = new Date().toISOString(),
}: {
  root: string;
  verifyHashes?: boolean;
  generatedAt?: string;
}) {
  const resolvedRoot = path.resolve(root);
  const reviewPath = path.join(resolvedRoot, MANIFEST_NAME);
  const consentPath = path.join(resolvedRoot, CONSENT_NAME);
  if (!existsSync(reviewPath)) throw new Error(`${MANIFEST_NAME} is missing.`);
  if (!existsSync(consentPath)) throw new Error(`${CONSENT_NAME} is missing.`);

  const reviewBytes = readFileSync(reviewPath);
  const consentBytes = readFileSync(consentPath);
  const consent = JSON.parse(consentBytes.toString('utf8').replace(/^\uFEFF/, '')) as ConsentEvidence;
  if (consent.scope !== REQUIRED_CONSENT_SCOPE) throw new Error('Consent scope does not permit private model evaluation and training.');
  if (consent.productionPublicationApproved !== false) throw new Error('Consent evidence must explicitly prohibit production publication.');
  if (!clean(consent.ownerStatement)) throw new Error('Consent owner statement is missing.');

  const rows = parseManualCsv(reviewBytes.toString('utf8')) as CaptureRow[];
  if (!rows.length) throw new Error('Capture review manifest has no rows.');
  const reviewedSessions = new Set((consent.reviewedPhysicalCardSessions ?? []).map(clean));
  const verifiedRows = rows
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, clean(value)])) as CaptureRow)
    .sort((left, right) => left.relative_path.localeCompare(right.relative_path));

  for (const row of verifiedRows) {
    assertEligible(row);
    if (!reviewedSessions.has(row.physical_card_session_id)) {
      throw new Error(`Consent evidence does not cover session ${row.physical_card_session_id}.`);
    }
    const imagePath = insideRoot(resolvedRoot, row.relative_path);
    if (!existsSync(imagePath)) throw new Error(`Capture file is missing: ${row.relative_path}`);
    if (verifyHashes) {
      const actual = sha256(readFileSync(imagePath));
      if (actual !== row.sha256.toLowerCase()) throw new Error(`Capture hash mismatch: ${row.relative_path}`);
    }
  }

  const duplicateGroups = [...verifiedRows.reduce((groups, row) => {
    groups.set(row.sha256, [...(groups.get(row.sha256) ?? []), row.relative_path]);
    return groups;
  }, new Map<string, string[]>()).entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([hash, paths]) => ({ sha256: hash, paths }));
  const uniqueRows = [...verifiedRows.reduce((byHash, row) => {
    if (!byHash.has(row.sha256)) byHash.set(row.sha256, row);
    return byHash;
  }, new Map<string, CaptureRow>()).values()];

  const sessionIdentity = new Map<string, string>();
  const sessionsByIdentity = new Map<string, Set<string>>();
  for (const row of uniqueRows) {
    const identity = identityKey(row);
    const existing = sessionIdentity.get(row.physical_card_session_id);
    if (existing && existing !== identity) {
      throw new Error(`Physical session ${row.physical_card_session_id} contains multiple identities.`);
    }
    sessionIdentity.set(row.physical_card_session_id, identity);
    const sessions = sessionsByIdentity.get(identity) ?? new Set<string>();
    sessions.add(row.physical_card_session_id);
    sessionsByIdentity.set(identity, sessions);
  }
  const protectedTestEligible = [...sessionsByIdentity.values()].every((sessions) => sessions.size >= 2);

  return {
    schemaVersion: 'stackr-reviewed-capture-evaluation-manifest-v1.0.0',
    generatedAt,
    privacyScope: REQUIRED_CONSENT_SCOPE,
    productionPublicationApproved: false,
    sourceRootName: path.basename(resolvedRoot),
    evidence: {
      consentSchemaVersion: consent.schemaVersion ?? null,
      consentRecordedAt: consent.recordedAt ?? null,
      consentSha256: sha256(consentBytes),
      reviewManifestSha256: sha256(reviewBytes),
    },
    summary: {
      inputRows: verifiedRows.length,
      uniqueImages: uniqueRows.length,
      exactDuplicateImagesRemoved: verifiedRows.length - uniqueRows.length,
      identityClasses: sessionsByIdentity.size,
      physicalCardSessions: sessionIdentity.size,
      protectedTestEligible,
    },
    evaluationPolicy: {
      queryImagesMustBeExcludedFromReferences: true,
      modelSelectionAndProtectedTestSeparated: protectedTestEligible,
      productionAcceptanceAllowed: false,
      reason: protectedTestEligible
        ? 'Private reviewed captures are eligible for a future protected split, but this manifest does not approve production.'
        : 'At least two physical-card sessions per identity are required before model selection and protected testing can be separated.',
    },
    duplicateGroups,
    images: uniqueRows.map((row) => ({
      id: `capture_${row.sha256.slice(0, 24)}`,
      relativePath: row.relative_path.replace(/\\/g, '/'),
      sha256: row.sha256,
      bytes: Number(row.bytes),
      width: Number(row.width),
      height: Number(row.height),
      physicalCardSessionId: row.physical_card_session_id,
      identityKey: identityKey(row),
      language: languageTag(row.language),
      setCode: row.set_code,
      collectorNumber: row.collector_number,
      variant: row.variant,
      finish: row.finish,
      cardName: row.expected_card_name,
      lightingCategory: row.lighting_category || 'unknown',
      sleeveState: row.sleeve_state || 'unknown',
      holderState: row.holder_state || 'unknown',
      rightsStatus: row.image_rights_status,
      reviewStatus: row.review_status,
      labelVerificationStatus: row.label_verification_status,
    })),
  };
}

export function writeReviewedCaptureEvaluationManifest({
  root,
  outputPath,
  verifyHashes = true,
  generatedAt,
}: {
  root: string;
  outputPath: string;
  verifyHashes?: boolean;
  generatedAt?: string;
}) {
  const manifest = buildReviewedCaptureEvaluationManifest({ root, verifyHashes, generatedAt });
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(outputPath, output, 'utf8');
  return { manifest, outputPath: path.resolve(outputPath), sha256: sha256(output) };
}

function main() {
  const root = argument('root');
  const outputPath = argument('out');
  if (!root || !outputPath) {
    throw new Error('Usage: --root=<approved capture folder> --out=<private manifest path>');
  }
  const result = writeReviewedCaptureEvaluationManifest({
    root,
    outputPath,
    verifyHashes: !process.argv.includes('--skip-file-hash-verification'),
    generatedAt: process.env.STACKR_CAPTURE_MANIFEST_GENERATED_AT,
  });
  console.log(JSON.stringify({
    ok: true,
    outputPath: result.outputPath,
    sha256: result.sha256,
    summary: result.manifest.summary,
    productionPublicationApproved: false,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
