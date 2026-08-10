import assert from 'node:assert/strict';
import {
  buildScanLabTrainingManifest,
  splitForPhysicalCardSessionId,
  type ScanLabReviewedCaptureRow,
} from '../lib/scanLabManifest';

function row(overrides: Partial<ScanLabReviewedCaptureRow> = {}): ScanLabReviewedCaptureRow {
  return {
    id: overrides.id ?? 'capture_1',
    created_by: 'tester_1',
    physical_card_session_id: overrides.physical_card_session_id ?? 'physical_card_1',
    captured_at: '2026-07-26T12:00:00.000Z',
    expected_identity: { stackrCardId: 'sv1-099', cardName: 'Pikachu', setId: 'sv1' },
    user_confirmed_identity: { stackrCardId: 'sv1-099', cardName: 'Pikachu', setId: 'sv1' },
    review_status: 'confirmed',
    label_verification_status: 'reviewed',
    original_photo_storage_path: 'tester_1/capture_1/original-photo.jpg',
    rectified_card_storage_path: 'tester_1/capture_1/rectified-card.png',
    original_photo_checksum_sha256: 'a'.repeat(64),
    rectified_card_checksum_sha256: 'b'.repeat(64),
    image_upload_consent: true,
    image_upload_status: 'uploaded',
    deleted_at: null,
    capture_quality: { qualityAccepted: true },
    ocr_evidence: { items: [] },
    rectification: { status: 'success' },
    device_info: { platform: 'ios', deviceModel: 'iPhone' },
    lighting_category: 'bright_indoor',
    sleeve_state: 'sleeved',
    holder_state: 'none',
    card_side: 'front',
    ...overrides,
  };
}

const samePhysicalCardA = row({ id: 'capture_a', physical_card_session_id: 'physical_same_card' });
const samePhysicalCardB = row({ id: 'capture_b', physical_card_session_id: 'physical_same_card' });
const missingConsent = row({ id: 'capture_no_consent', image_upload_consent: false });
const pending = row({ id: 'capture_pending', review_status: 'pending' });
const unreviewed = row({ id: 'capture_unreviewed', label_verification_status: 'user_reported' });
const partialUpload = row({ id: 'capture_partial', image_upload_status: 'metadata_received' });
const missingChecksum = row({ id: 'capture_missing_checksum', rectified_card_checksum_sha256: null });

const manifest = buildScanLabTrainingManifest([
  samePhysicalCardA,
  samePhysicalCardB,
  missingConsent,
  pending,
  unreviewed,
  partialUpload,
  missingChecksum,
]);

assert.equal(manifest.examples.length, 2);
assert.equal(manifest.rejectedRows.length, 5);
assert.equal(manifest.leakageChecks.physicalCardSessionLeakage, false);
assert.equal(manifest.examples[0].split, manifest.examples[1].split);
assert.equal(
  manifest.examples[0].split,
  splitForPhysicalCardSessionId('physical_same_card')
);
assert.ok(
  manifest.rejectedRows.some((rejected) =>
    rejected.id === 'capture_no_consent' &&
    rejected.reasons.includes('image_upload_consent_missing')
  )
);
assert.ok(
  manifest.rejectedRows.some((rejected) =>
    rejected.id === 'capture_unreviewed' &&
    rejected.reasons.includes('label_not_reviewed')
  )
);
assert.ok(
  manifest.rejectedRows.some((rejected) =>
    rejected.id === 'capture_partial' &&
    rejected.reasons.includes('images_not_uploaded')
  )
);
assert.ok(
  manifest.rejectedRows.some((rejected) =>
    rejected.id === 'capture_missing_checksum' &&
    rejected.reasons.includes('rectified_card_checksum_missing')
  )
);

console.log('Scan Lab manifest tests passed.');
