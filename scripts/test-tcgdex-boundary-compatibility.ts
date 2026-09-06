import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  assertTcgdexRuntimeBoundaryCompatibility,
  assertTcgdexRuntimeBoundaryCompatibilityWithExpectedHash,
  TCGDEX_RUNTIME_BOUNDARY_COMPATIBILITY_PATH,
} from './tcgdex-boundary-compatibility';

const boundaryPath = 'docs/stackrtcg-ip-operating-boundary.md';
const priorReviewPath = 'catalogue/rights-reviews/stackrtcg-ip-boundary-green-compatibility.2026-09-04.json';
const lowReferencePath = 'catalogue/rights-reviews/tcgdex-low-resolution-card-reference-green.2026-09-04.json';
const marksPath = 'catalogue/rights-reviews/tcgdex-cjk-set-marks-owner-approved.2026-09-04.json';
const trackedPaths = [boundaryPath, TCGDEX_RUNTIME_BOUNDARY_COMPATIBILITY_PATH, priorReviewPath, lowReferencePath, marksPath];

function hash(value: Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function cloneFiles() {
  return new Map(trackedPaths.map((path) => [path, Buffer.from(readFileSync(path))]));
}

function writeJson(files: Map<string, Buffer>, path: string, edit: (value: Record<string, any>) => void) {
  const value = JSON.parse(files.get(path)!.toString('utf8')) as Record<string, any>;
  edit(value);
  files.set(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}

function expectFailure(
  label: string,
  edit: (files: Map<string, Buffer>) => void,
  rebindCurrentReview = false,
) {
  const files = cloneFiles();
  edit(files);
  const expected = rebindCurrentReview
    ? hash(files.get(TCGDEX_RUNTIME_BOUNDARY_COMPATIBILITY_PATH)!)
    : undefined;
  assert.throws(
    () => expected
      ? assertTcgdexRuntimeBoundaryCompatibilityWithExpectedHash((path) => {
        const value = files.get(path);
        if (!value) throw new Error(`Missing ${path}`);
        return value;
      }, expected)
      : assertTcgdexRuntimeBoundaryCompatibility((path) => {
        const value = files.get(path);
        if (!value) throw new Error(`Missing ${path}`);
        return value;
      }),
    label,
  );
}

assertTcgdexRuntimeBoundaryCompatibility((path) => readFileSync(path));

expectFailure('a changed current boundary must fail closed', (files) => {
  files.set(boundaryPath, Buffer.from('# altered operating boundary\n'));
});

expectFailure('a tampered original card-reference decision must fail closed', (files) => {
  writeJson(files, lowReferencePath, (decision) => {
    decision.scope.rendition = 'high.webp';
  });
});

expectFailure('missing compatibility records must fail closed', (files) => {
  files.delete(TCGDEX_RUNTIME_BOUNDARY_COMPATIBILITY_PATH);
});

expectFailure('changed card-reference permissions must fail closed', (files) => {
  writeJson(files, lowReferencePath, (decision) => {
    decision.assetPersistenceAuthorized = true;
  });
});

expectFailure('changed amber set-mark permissions must fail closed', (files) => {
  writeJson(files, marksPath, (decision) => {
    decision.assetPersistenceAuthorized = true;
  });
});

expectFailure('an unbound current compatibility review must fail closed', (files) => {
  writeJson(files, TCGDEX_RUNTIME_BOUNDARY_COMPATIBILITY_PATH, (review) => {
    review.predecessorCompatibilityReview.sha256 = '0'.repeat(64);
  });
}, true);

console.log('TCGdex boundary compatibility chain checks passed.');
