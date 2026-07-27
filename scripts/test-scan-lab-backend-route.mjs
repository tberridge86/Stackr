import assert from 'node:assert/strict';
import {
  assertScanLabCaptureMetadata,
  normaliseScanLabImageContentType,
} from '../backend/routes/scanLab.js';

function validCapture(overrides = {}) {
  return {
    schemaVersion: 'stackr-scan-lab-v1.0.0',
    routeVersion: 'stackr-scan-lab-upload-v1.0.0',
    localId: 'scanlab_test_backend',
    physicalCardSessionId: 'physical_test_backend',
    capturedAt: '2026-07-27T12:00:00.000Z',
    originalPhotoWidth: 3024,
    originalPhotoHeight: 4032,
    originalPhotoOrientation: 'portrait',
    rectifiedCardWidth: 720,
    rectifiedCardHeight: 1006,
    expectedIdentity: {
      stackrCardId: 'sv1-099',
      cardName: 'Pikachu',
      setId: 'sv1',
      language: 'en',
      variant: 'standard',
    },
    userConfirmedIdentity: {
      stackrCardId: 'sv1-099',
      cardName: 'Pikachu',
      setId: 'sv1',
      language: 'en',
      variant: 'standard',
    },
    reviewStatus: 'confirmed',
    captureQuality: {
      qualityAccepted: true,
      fillRatio: 0.72,
      processingMs: 12.4,
    },
    ocrEvidence: { items: [] },
    rectification: { status: 'success' },
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
    consentToUploadImages: true,
    ...overrides,
  };
}

function captureMetadataError(capture) {
  try {
    assertScanLabCaptureMetadata(capture);
  } catch (error) {
    return error;
  }
  return null;
}

assert.doesNotThrow(() => assertScanLabCaptureMetadata(validCapture()));

const noConsent = captureMetadataError(validCapture({ consentToUploadImages: false }));
assert.ok(noConsent);
assert.ok(noConsent.details.includes('image_upload_consent_required'));

const pending = captureMetadataError(validCapture({ reviewStatus: 'pending' }));
assert.ok(pending);
assert.ok(pending.details.includes('supported_review_decision_required'));

const missingQuality = captureMetadataError(validCapture({ captureQuality: null }));
assert.ok(missingQuality);
assert.ok(missingQuality.details.includes('capture_quality_required'));

const missingDimensions = captureMetadataError(validCapture({ rectifiedCardWidth: 0 }));
assert.ok(missingDimensions);
assert.ok(missingDimensions.details.includes('rectified_dimensions_required'));

assert.equal(normaliseScanLabImageContentType('image/jpeg; charset=binary'), 'image/jpeg');
assert.equal(normaliseScanLabImageContentType('IMAGE/PNG'), 'image/png');
assert.equal(normaliseScanLabImageContentType('application/octet-stream'), null);
assert.equal(normaliseScanLabImageContentType('text/plain'), null);

console.log('Scan Lab backend route tests passed.');
