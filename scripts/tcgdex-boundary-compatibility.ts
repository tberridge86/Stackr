import { createHash } from 'node:crypto';

type Json = Record<string, any>;
type ReadFile = (path: string) => Buffer;

export const TCGDEX_RUNTIME_BOUNDARY_COMPATIBILITY_PATH =
  'catalogue/rights-reviews/tcgdex-runtime-boundary-compatibility.2026-09-06.json';
export const TCGDEX_RUNTIME_BOUNDARY_COMPATIBILITY_SHA256 = '25bf028d12d5d6f856100321c5fddac009c64730bc7fc47b846056abb5efd893';

const PRIOR_BOUNDARY_SHA256 = 'f93aa675f76aadbe77e58bbbb0e0a81fdeb4268de8ca4d7a8190e9a6df5efb1b';
const CURRENT_BOUNDARY_SHA256 = 'a8c7361b9083be744ec433c3e31bd09a0af16237145dd88ecfe12a19c91d8d27';

function sha256(value: Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function json(readFile: ReadFile, path: string): Json {
  return JSON.parse(readFile(path).toString('utf8')) as Json;
}

function required(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

/** Validate the append-only current-boundary bridge and immutable prior records. */
export function assertTcgdexRuntimeBoundaryCompatibilityWithExpectedHash(
  readFile: ReadFile,
  expectedReviewSha256: string,
) {
  const reviewBytes = readFile(TCGDEX_RUNTIME_BOUNDARY_COMPATIBILITY_PATH);
  required(
    sha256(reviewBytes) === expectedReviewSha256,
    'TCGdex current-boundary compatibility review is missing or has been modified.',
  );
  const review = json(readFile, TCGDEX_RUNTIME_BOUNDARY_COMPATIBILITY_PATH);
  required(review.classification === 'technical_scope_compatibility', 'Unexpected compatibility review classification.');
  required(review.status === 'recorded_current_authority_compatibility', 'Compatibility review is not recorded.');
  required(review.currentAuthority?.path === 'docs/stackrtcg-ip-operating-boundary.md', 'Unexpected current authority path.');
  required(review.currentAuthority?.sha256 === CURRENT_BOUNDARY_SHA256, 'Compatibility review has an unexpected current authority.');
  required(
    sha256(readFile(review.currentAuthority.path)) === review.currentAuthority.sha256,
    'Current operating-boundary binding does not match the compatibility review.',
  );
  required(review.priorAuthority?.sha256 === PRIOR_BOUNDARY_SHA256, 'Compatibility review has an unexpected prior authority.');
  required(review.documentDeltaDisposition?.tcgdexProviderMetadataOrAssetPermissionsChanged === false, 'Compatibility review changes TCGdex provider permissions.');
  required(review.documentDeltaDisposition?.tcgdexCardReferenceRuntimeControlsChanged === false, 'Compatibility review changes card-reference controls.');
  required(review.documentDeltaDisposition?.tcgdexSetMarkPermissionsChanged === false, 'Compatibility review changes set-mark permissions.');
  required(review.documentDeltaDisposition?.catalogueDataMutationAuthorized === false, 'Compatibility review authorizes catalogue mutation.');
  for (const key of ['activatesAmberUses', 'activatesRedUses', 'changesExistingDecisionOrEvidenceHashes', 'authorizesCatalogueDataMutation', 'authorizesAssetMirroring', 'authorizesDeployment']) {
    required(review.limits?.[key] === false, `Compatibility review must keep ${key} false.`);
  }

  const predecessor = review.predecessorCompatibilityReview;
  required(predecessor?.path && predecessor?.sha256, 'Compatibility review has no bound predecessor review.');
  required(sha256(readFile(predecessor.path)) === predecessor.sha256, 'Prior compatibility review has been modified.');
  const previousReview = json(readFile, predecessor.path);
  required(previousReview.authority?.sha256 === PRIOR_BOUNDARY_SHA256, 'Prior compatibility review is not bound to the original boundary.');

  const lowReference = (review.reconfirmedDecisions as Json[] | undefined)?.find(
    (entry) => entry.decisionId === 'tcgdex-low-resolution-card-reference-green:2026-09-04',
  );
  required(lowReference?.path && lowReference?.sha256, 'Low-resolution card-reference decision is not reconfirmed.');
  required(lowReference.classification === 'green', 'Card-reference compatibility must remain green.');
  required(lowReference.originalAuthoritySha256 === PRIOR_BOUNDARY_SHA256, 'Card-reference decision has the wrong original boundary.');
  required(sha256(readFile(lowReference.path)) === lowReference.sha256, 'Card-reference decision has been modified.');
  const lowDecision = json(readFile, lowReference.path);
  required(lowDecision.bindings?.operatingBoundarySha256 === PRIOR_BOUNDARY_SHA256, 'Card-reference decision no longer binds the original boundary.');
  required(lowDecision.bindings?.boundaryCompatibilityReviewPath === predecessor.path, 'Card-reference decision is not bound to the predecessor review.');
  required(lowDecision.bindings?.boundaryCompatibilityReviewSha256 === predecessor.sha256, 'Card-reference decision predecessor hash mismatch.');
  for (const key of lowReference.unchangedRuntimeControls ?? []) {
    required(Boolean(lowDecision.runtimeControls?.[key]), `Card-reference runtime control changed or missing: ${key}.`);
  }
  required(lowDecision.activationAuthorized === true && lowDecision.publicRuntimeDisplayAuthorized === true, 'Card-reference activation fields changed.');
  required(lowDecision.canonicalDatabaseWriteAuthorized === false && lowDecision.assetPersistenceAuthorized === false, 'Card-reference persistence scope changed.');

  const marks = review.amberSeparation;
  required(marks?.path && marks?.sha256, 'Amber set-mark review is not separately bound.');
  required(marks.classification === 'amber', 'Set-mark review must remain amber.');
  required(marks.originalAuthoritySha256 === PRIOR_BOUNDARY_SHA256, 'Set-mark review has the wrong original boundary.');
  required(marks.existingRecordedReviewRemainsRequired === true, 'Set-mark review requirement was removed.');
  required(marks.reconfirmedWithoutActivationOrExpansion === true, 'Compatibility record must not activate or expand set marks.');
  required(sha256(readFile(marks.path)) === marks.sha256, 'Set-mark decision has been modified.');
  const marksDecision = json(readFile, marks.path);
  required(marksDecision.classification === 'amber', 'Set-mark decision classification changed.');
  required(marksDecision.activationAuthorized === true && marksDecision.publicRuntimeDisplayAuthorized === true, 'Existing reviewed set-mark delivery changed.');
  required(marksDecision.canonicalDatabaseWriteAuthorized === false && marksDecision.assetPersistenceAuthorized === false, 'Set-mark persistence scope changed.');
  required(marksDecision.bindings?.operatingBoundarySha256 === PRIOR_BOUNDARY_SHA256, 'Set-mark decision no longer binds the original boundary.');
}

/** The repository integrity check pins the dated compatibility record itself. */
export function assertTcgdexRuntimeBoundaryCompatibility(readFile: ReadFile) {
  assertTcgdexRuntimeBoundaryCompatibilityWithExpectedHash(
    readFile,
    TCGDEX_RUNTIME_BOUNDARY_COMPATIBILITY_SHA256,
  );
}
