import assert from 'node:assert/strict';
import {
  SCAN_LAB_SCHEMA_VERSION,
  applyScanLabReviewDecision,
  buildScanLabUploadMetadata,
  createScanLabCaptureRecord,
  shouldDeleteScanLabBackendCapture,
  validateScanLabCaptureForUpload,
  type ScanLabCaptureDraft,
} from '../lib/scanLabCore';

const sampleCaptureQuality = {
  cardDetected: true,
  corners: {
    topLeft: { x: 0.18, y: 0.14 },
    topRight: { x: 0.82, y: 0.14 },
    bottomRight: { x: 0.82, y: 0.86 },
    bottomLeft: { x: 0.18, y: 0.86 },
  },
  fillRatio: 0.72,
  aspectRatioScore: 0.96,
  blurScore: 0.88,
  glareRatio: 0.01,
  underexposureRatio: 0.02,
  overexposureRatio: 0.01,
  perspectiveScore: 0.91,
  allCornersVisible: true,
  edgeClipped: false,
  qualityAccepted: true,
  failureReasons: [],
  processingMs: 12.4,
};

function draft(overrides: Partial<ScanLabCaptureDraft> = {}): ScanLabCaptureDraft {
  return {
    localId: 'scanlab_test_1',
    backendCaptureId: null,
    physicalCardSessionId: 'physical_test_card',
    capturedAt: '2026-07-26T12:00:00.000Z',
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
    captureQuality: sampleCaptureQuality,
    ocrEvidence: null,
    expectedIdentity: {
      stackrCardId: 'sv1-099',
      cardName: 'Pikachu',
      setId: 'sv1',
      language: 'EN',
      variant: 'normal',
    },
    userConfirmedIdentity: null,
    consentToUploadImages: false,
    device: {
      platform: 'ios',
      deviceModel: 'iPhone',
      osName: 'iOS',
      osVersion: '18.0',
    },
    lightingCategory: 'bright_indoor',
    sleeveState: 'sleeved',
    holderState: 'none',
    cardSide: 'front',
    ...overrides,
  };
}

const pending = createScanLabCaptureRecord(draft());
assert.equal(pending.schemaVersion, SCAN_LAB_SCHEMA_VERSION);
assert.equal(pending.reviewStatus, 'pending');
assert.equal(pending.uploadStatus, 'local_only');
assert.equal(pending.expectedIdentity.language, 'en');

const noConsentValidation = validateScanLabCaptureForUpload(pending);
assert.equal(noConsentValidation.ok, false);
assert.ok(noConsentValidation.reasons.includes('image_upload_consent_required'));
assert.ok(noConsentValidation.reasons.includes('review_decision_required'));

const confirmed = applyScanLabReviewDecision(
  { ...pending, consentToUploadImages: true },
  { status: 'confirmed' }
);
const confirmedValidation = validateScanLabCaptureForUpload(confirmed);
assert.equal(confirmedValidation.ok, true);
assert.equal(confirmed.userConfirmedIdentity?.stackrCardId, 'sv1-099');

const corrected = applyScanLabReviewDecision(
  { ...pending, consentToUploadImages: true },
  {
    status: 'corrected',
    identity: {
      stackrCardId: 'sv2-099',
      cardName: 'Raichu',
      setId: 'sv2',
      language: 'JA',
      variant: 'reverse_holo',
    },
  }
);
assert.equal(corrected.reviewStatus, 'corrected');
assert.equal(corrected.userConfirmedIdentity?.language, 'ja');

const missingRectified = validateScanLabCaptureForUpload({
  ...confirmed,
  rectifiedCardUri: null,
});
assert.equal(missingRectified.ok, false);
assert.ok(missingRectified.reasons.includes('rectified_card_missing'));

const missingDimensions = validateScanLabCaptureForUpload({
  ...confirmed,
  rectifiedCardWidth: null,
});
assert.equal(missingDimensions.ok, false);
assert.ok(missingDimensions.reasons.includes('rectified_dimensions_missing'));

const missingQuality = validateScanLabCaptureForUpload({
  ...confirmed,
  captureQuality: null,
});
assert.equal(missingQuality.ok, false);
assert.ok(missingQuality.reasons.includes('capture_quality_missing'));

const metadata = buildScanLabUploadMetadata(confirmed);
assert.equal(metadata.consentToUploadImages, true);
assert.equal(metadata.physicalCardSessionId, 'physical_test_card');
assert.equal(metadata.expectedIdentity.stackrCardId, 'sv1-099');
assert.equal(metadata.captureQuality?.qualityAccepted, true);

assert.equal(shouldDeleteScanLabBackendCapture(confirmed), false);
assert.equal(shouldDeleteScanLabBackendCapture({
  ...confirmed,
  backendCaptureId: 'backend_capture_1',
  uploadStatus: 'failed',
}), true);
assert.equal(shouldDeleteScanLabBackendCapture({
  ...confirmed,
  backendCaptureId: 'backend_capture_1',
  uploadStatus: 'deleted',
}), false);

console.log('Scan Lab core tests passed.');
