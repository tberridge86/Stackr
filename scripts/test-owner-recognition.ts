import assert from 'node:assert/strict';
import {
  createOwnerCaptureRecord, ownerCaptureDirectory, parseOwnerRecognitionResult,
  OWNER_INDEX_VERSION, OWNER_MODEL_VERSION,
} from '../lib/ownerRecognitionCore';

const candidate = { rank: 1, similarity: 0.74, variantId: '83eb7d96-15f4-44b3-83c0-294bcb29c3b2',
  canonicalKey: 'test-card', name: 'Test card', language: 'en', setId: 'test', setCode: 'test',
  collectorNumber: '1', variantCode: 'normal', referenceAssetId: 'ref-test' };
const result = parseOwnerRecognitionResult({ status: 'review_required', modelVersion: OWNER_MODEL_VERSION,
  indexVersion: OWNER_INDEX_VERSION, requiresReview: true, autoAccept: false, autoAdd: false,
  candidates: [candidate], timings: { preprocessingMs: 2, inferenceMs: 3, searchMs: 1, totalMs: 6 } });
for (const patch of [{ autoAdd: true }, { autoAccept: true }, { requiresReview: false },
  { modelVersion: 'dinov2_vits14' }, { indexVersion: 'other' },
  { candidates: [{ ...candidate, similarity: NaN }] }, { candidates: Array(6).fill(candidate) }]) {
  assert.throws(() => parseOwnerRecognitionResult({ ...result, ...patch }));
}
assert.throws(() => ownerCaptureDirectory('file:///documents/', '../someone'));
assert.throws(() => ownerCaptureDirectory(null, '309453d1-52a2-4f40-81e4-27ae69b520fa'));
assert.equal(ownerCaptureDirectory('file:///documents/', '309453d1-52a2-4f40-81e4-27ae69b520fa'),
  'file:///documents/owner-recognition/309453d1-52a2-4f40-81e4-27ae69b520fa/');
const input = { id: 'capture-1', capturedAt: '2026-09-05T12:00:00Z', physicalCardId: 'my-card-1', result, selectedVariantId: null };
const unresolved = createOwnerCaptureRecord(input);
assert.equal(unresolved.reviewStatus, 'unresolved');
assert.equal(unresolved.expectedIdentity, null);
assert.equal(unresolved.trainingUseApproved, false);
assert.equal(unresolved.publicDisplayApproved, false);
assert.equal(unresolved.holdoutAssignment, 'unassigned');
const confirmed = createOwnerCaptureRecord({ ...input, selectedVariantId: candidate.variantId });
assert.equal(confirmed.reviewStatus, 'owner_confirmed');
assert.equal(confirmed.expectedIdentity?.variantId, candidate.variantId);
assert.equal(confirmed.physicalCardId, unresolved.physicalCardId);
assert.throws(() => createOwnerCaptureRecord({ ...input, selectedVariantId: 'not-a-prediction' }));
assert.throws(() => createOwnerCaptureRecord({ ...input, physicalCardId: '' }));
console.log('Owner recognition result and private capture contract tests passed.');
