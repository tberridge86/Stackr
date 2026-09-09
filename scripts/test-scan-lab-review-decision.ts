import assert from 'node:assert/strict';
import { createScanLabCaptureRecord, type ScanLabCaptureDraft } from '../lib/scanLabCore';
import {
  applyPinnedScanLabReviewDecision,
  findSavedScanLabReviewDecision,
} from '../lib/scanLabReviewDecision';

const draft: ScanLabCaptureDraft = {
  localId: 'scanlab_current',
  backendCaptureId: null,
  physicalCardSessionId: 'physical_current',
  capturedAt: '2026-09-09T09:30:00.000Z',
  originalPhotoUri: 'file:///original.jpg',
  originalPhotoWidth: 3024,
  originalPhotoHeight: 4032,
  originalPhotoOrientation: 'portrait',
  rectifiedCardUri: 'file:///rectified.png',
  rectifiedCardWidth: 720,
  rectifiedCardHeight: 1006,
  recognitionCropUri: 'file:///recognition.png',
  ocrSourceCropUri: 'file:///ocr.png',
  thumbnailUri: 'file:///thumb.jpg',
  rectification: null,
  captureQuality: null,
  ocrEvidence: null,
  expectedIdentity: { stackrCardId: 'sv1-099', cardName: 'Pikachu', setId: 'sv1', language: 'en', variant: 'normal' },
  userConfirmedIdentity: null,
  consentToUploadImages: false,
  device: { platform: 'ios', deviceModel: 'iPhone', osName: 'iOS', osVersion: '18.0' },
  lightingCategory: 'bright_indoor',
  sleeveState: 'sleeved',
  holderState: 'none',
  cardSide: 'front',
};

const current = createScanLabCaptureRecord(draft);
const pending = {
  captureId: current.localId,
  decision: {
    status: 'corrected' as const,
    identity: { stackrCardId: 'sv2-099', cardName: 'Raichu', setId: 'sv2', language: 'ja', variant: 'reverse_holo' },
  },
};
const saved = applyPinnedScanLabReviewDecision({ ...current, uploadStatus: 'metadata_received' }, pending);
assert.equal(saved.uploadStatus, 'metadata_received', 'the updater uses the current persisted record');
assert.equal(saved.reviewStatus, 'corrected');
assert.equal(findSavedScanLabReviewDecision([saved], pending)?.localId, current.localId);
assert.equal(findSavedScanLabReviewDecision([{ ...saved, reviewStatus: 'pending' }], pending), null);
assert.equal(findSavedScanLabReviewDecision([{ ...saved, userConfirmedIdentity: { ...saved.userConfirmedIdentity!, cardName: 'Other' } }], pending), null);
assert.throws(() => applyPinnedScanLabReviewDecision(current, { ...pending, captureId: 'scanlab_other' }), /selected capture changed/);

console.log('Scan Lab pinned review decision tests passed.');
