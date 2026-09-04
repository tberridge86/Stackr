import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const CJK_EDITORIAL_SET_TRANSLATION_REVIEW_PATH =
  'catalogue/rights-reviews/cjk-editorial-set-translation-owner-approved.2026-09-04.json';
const OWNER_ATTESTATION_PATH = 'catalogue/rights-evidence/cjk-app-metadata-permission-owner-attestation.2026-09-04.json';
const OWNER_ATTESTATION_SHA256 = '13e9bc1ffa4635cdc10110f0e8dc7356dcb7433d73e60755cc019ba075137d11';

type Lane = { id?: unknown; classification?: unknown; status?: unknown; activationAuthorized?: unknown; count?: unknown; counts?: unknown };
type Review = { schemaVersion?: unknown; reviewId?: unknown; status?: unknown; classification?: unknown; activationAuthorized?: unknown; ownerAttestation?: { path?: unknown; sha256?: unknown }; sourceFiles?: Record<string, unknown>; controls?: Record<string, unknown>; lanes?: unknown };

const REQUIRED_SOURCE_PATHS = [
  'catalogue/source-rights-registry.json',
  'catalogue/rights-evidence/tcgdex-metadata-mit.2026-08-14.json',
  'catalogue/japanese-set-display-drafts-source.json',
  'catalogue/chinese-set-translation-draft-native-name-source.json',
  'catalogue/tcgdex-chinese-set-identity-display-source.json',
  'scripts/build-chinese-set-translation-draft-review-pack.ts',
] as const;

const sha256 = (body: string | Buffer) => createHash('sha256').update(body).digest('hex');

/** Reads the distinct, owner-approved editorial runtime lane. The broader pending
 * record is intentionally not accepted here, so unrelated amber/red lanes stay closed. */
export function readCjkEditorialSetTranslationRightsGate(requiredLaneIds: string[]) {
  const body = readFileSync(resolve(CJK_EDITORIAL_SET_TRANSLATION_REVIEW_PATH), 'utf8');
  const review = JSON.parse(body) as Review;
  const attestation = readFileSync(resolve(OWNER_ATTESTATION_PATH));
  if (sha256(attestation) !== OWNER_ATTESTATION_SHA256
    || review.schemaVersion !== 'stackr-cjk-display-metadata-rights-review-v1'
    || review.reviewId !== 'cjk-editorial-set-translation-owner-approved:2026-09-04'
    || review.status !== 'approved_active_runtime_only'
    || review.classification !== 'amber'
    || review.activationAuthorized !== true
    || review.ownerAttestation?.path !== OWNER_ATTESTATION_PATH
    || review.ownerAttestation?.sha256 !== OWNER_ATTESTATION_SHA256
    || review.controls?.nativeNameRemainsPrimary !== true
    || review.controls?.englishTextLabel !== 'English translation:'
    || review.controls?.englishTextAuthoritative !== false
    || review.controls?.canonicalDatabaseWriteAuthorized !== false
    || review.controls?.storedCatalogueRewriteAuthorized !== false
    || !review.sourceFiles
    || !Array.isArray(review.lanes)) {
    throw new Error('CJK editorial set-translation review is not the expected owner-approved runtime-only record.');
  }
  const sourcePaths = Object.keys(review.sourceFiles).sort();
  const expectedSourcePaths = [...REQUIRED_SOURCE_PATHS].sort();
  if (sourcePaths.length !== expectedSourcePaths.length
    || sourcePaths.some((path, index) => path !== expectedSourcePaths[index])) {
    throw new Error('CJK editorial set-translation review has an unexpected source-file binding set.');
  }
  const verifiedSourceFiles: Record<string, string> = {};
  for (const path of REQUIRED_SOURCE_PATHS) {
    const expectedSha256 = review.sourceFiles[path];
    if (typeof expectedSha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(expectedSha256)
      || sha256(readFileSync(resolve(path))) !== expectedSha256) {
      throw new Error(`CJK editorial set-translation reviewed source changed: ${path}`);
    }
    verifiedSourceFiles[path] = expectedSha256;
  }
  const lanes = new Map((review.lanes as Lane[]).map((lane) => [String(lane.id ?? ''), lane]));
  for (const laneId of requiredLaneIds) {
    const lane = lanes.get(laneId);
    if (!lane || lane.classification !== 'amber' || lane.status !== 'approved_active_runtime_only' || lane.activationAuthorized !== true) {
      throw new Error(`CJK editorial set-translation lane is absent or not activated: ${laneId}`);
    }
  }
  return {
    reviewPath: CJK_EDITORIAL_SET_TRANSLATION_REVIEW_PATH,
    reviewSha256: sha256(body),
    reviewId: 'cjk-editorial-set-translation-owner-approved:2026-09-04',
    reviewStatus: 'approved_active_runtime_only' as const,
    activationAuthorized: true as const,
    publicRuntimeImportAuthorized: true as const,
    canonicalDatabaseWriteAuthorized: false as const,
    ownerAttestationPath: OWNER_ATTESTATION_PATH,
    ownerAttestationSha256: OWNER_ATTESTATION_SHA256,
    verifiedSourceFiles,
    requiredLaneIds: [...requiredLaneIds],
  };
}

if (require.main === module) {
  const result = readCjkEditorialSetTranslationRightsGate([
    'japanese_editorial_set_translation_candidates',
    'chinese_editorial_set_translation_candidates',
  ]);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
