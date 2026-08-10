import assert from 'node:assert/strict';
import {
  applyRecognitionFeedbackReviewDecision,
  buildRecognitionFeedbackDatasetManifest,
  createRecognitionFeedbackRecord,
  explainRecognitionFeedbackImageUpload,
  grantRecognitionFeedbackImageConsent,
  markRecognitionFeedbackDeleted,
  validateRecognitionFeedbackForImageUpload,
  withdrawRecognitionFeedbackConsent,
  type RecognitionFeedbackDatasetRow,
} from '../lib/recognitionFeedbackCore';

function baseRecord() {
  return createRecognitionFeedbackRecord({
    localId: 'rfb_test',
    anonymousScanId: 'scan-anon-1',
    createdAt: '2026-07-26T12:00:00.000Z',
    action: 'manual_correction',
    predictedIdentity: {
      stackrCardId: 'wrong-card',
      cardName: 'Wrongmon',
      setId: 'wrong-set',
      collectorNumber: '099',
      language: 'en',
    },
    correctedIdentity: {
      stackrCardId: 'sv1-025',
      cardName: 'Pikachu',
      setId: 'sv1',
      collectorNumber: '025',
      language: 'en',
      variant: 'normal',
    },
    topCandidateScores: [
      {
        canonicalCardId: 'wrong-card',
        rank: 1,
        confidence: 0.72,
        visualSimilarity: 0.8,
        finalScore: 0.7,
      },
    ],
    captureQuality: {
      blurScore: 0.88,
      glareRatio: 0.02,
    },
    ocrEvidenceSummary: {
      collectorNumber: '025',
      language: 'en',
    },
    modelVersion: 'model-v1',
    catalogueVersion: 'catalogue-v1',
    deviceClass: 'ios:iPhone:year-2024',
    physicalCardSessionId: 'physical-card-1',
    rectifiedImageUri: 'file:///rectified-card.jpg',
    rectifiedImageWidth: 720,
    rectifiedImageHeight: 1005,
  });
}

function datasetRow(patch: Partial<RecognitionFeedbackDatasetRow> = {}): RecognitionFeedbackDatasetRow {
  return {
    id: 'feedback-1',
    anonymous_scan_id: 'scan-anon-1',
    action: 'manual_correction',
    predicted_identity: { stackrCardId: 'wrong-card' },
    corrected_identity: { stackrCardId: 'sv1-025', cardName: 'Pikachu' },
    reviewed_identity: { stackrCardId: 'sv1-025', cardName: 'Pikachu' },
    review_status: 'approved_identity',
    user_label_status: 'reviewed',
    image_upload_status: 'uploaded',
    consent_state: {
      imageUploadConsent: true,
      imageUploadConsentAt: '2026-07-26T12:01:00.000Z',
      imageUploadWithdrawnAt: null,
      deletionRequestedAt: null,
    },
    rectified_image_storage_path: 'user/feedback-1/rectified-card.jpg',
    rectified_image_checksum_sha256: 'abc123',
    capture_quality: { blurScore: 0.88 },
    ocr_evidence_summary: { collectorNumber: '025' },
    model_version: 'model-v1',
    catalogue_version: 'catalogue-v1',
    device_class: 'ios:iPhone',
    physical_card_session_id: 'physical-card-1',
    deleted_at: null,
    created_at: '2026-07-26T12:00:00.000Z',
    ...patch,
  };
}

function consentRequiredBeforeUpload() {
  const record = baseRecord();
  const noConsent = validateRecognitionFeedbackForImageUpload(record);
  assert.equal(noConsent.ok, false);
  assert.ok(noConsent.reasons.includes('image_upload_consent_required'));

  const consented = grantRecognitionFeedbackImageConsent(record, '2026-07-26T12:01:00.000Z');
  const uploadable = validateRecognitionFeedbackForImageUpload(consented);
  assert.equal(uploadable.ok, true);

  const withdrawn = withdrawRecognitionFeedbackConsent(consented, '2026-07-26T12:02:00.000Z');
  const afterWithdrawal = validateRecognitionFeedbackForImageUpload(withdrawn);
  assert.equal(afterWithdrawal.ok, false);
  assert.ok(afterWithdrawal.reasons.includes('image_upload_consent_required'));
  assert.ok(afterWithdrawal.reasons.includes('image_upload_consent_withdrawn'));
}

function deletionIsReversibleControl() {
  const deleted = markRecognitionFeedbackDeleted(
    grantRecognitionFeedbackImageConsent(baseRecord()),
    '2026-07-26T12:03:00.000Z'
  );
  assert.equal(deleted.reviewStatus, 'deleted');
  assert.equal(deleted.imageUploadStatus, 'deleted');
  assert.equal(deleted.consentState.imageUploadConsent, false);
  assert.equal(validateRecognitionFeedbackForImageUpload(deleted).ok, false);
}

function reviewDecisionsKeepLabelsSeparate() {
  const record = baseRecord();
  assert.equal(record.userLabelStatus, 'user_submitted');
  assert.equal(record.reviewStatus, 'queued');
  assert.equal(record.reviewedIdentity, null);

  const approved = applyRecognitionFeedbackReviewDecision(record, { decision: 'approve_identity' });
  assert.equal(approved.userLabelStatus, 'reviewed');
  assert.equal(approved.reviewStatus, 'approved_identity');
  assert.equal(approved.reviewedIdentity?.stackrCardId, 'sv1-025');

  const changed = applyRecognitionFeedbackReviewDecision(record, {
    decision: 'change_identity',
    reviewedIdentity: {
      stackrCardId: 'sv2-026',
      cardName: 'Raichu',
      setId: 'sv2',
    },
  });
  assert.equal(changed.reviewStatus, 'changed_identity');
  assert.equal(changed.reviewedIdentity?.stackrCardId, 'sv2-026');

  const ambiguous = applyRecognitionFeedbackReviewDecision(record, { decision: 'mark_ambiguous' });
  assert.equal(ambiguous.reviewStatus, 'ambiguous');
  assert.equal(ambiguous.userLabelStatus, 'rejected');

  const poor = applyRecognitionFeedbackReviewDecision(record, { decision: 'reject_poor_image' });
  assert.equal(poor.reviewStatus, 'rejected_poor_image');

  const grouped = applyRecognitionFeedbackReviewDecision(record, {
    decision: 'group_physical_card',
    physicalCardSessionId: 'shared-physical-card',
  });
  assert.equal(grouped.physicalCardSessionId, 'shared-physical-card');
  assert.equal(grouped.reviewStatus, 'queued');
}

function unreviewedRowsNeverBecomeGroundTruth() {
  const manifest = buildRecognitionFeedbackDatasetManifest([
    datasetRow({ id: 'reviewed' }),
    datasetRow({
      id: 'unreviewed',
      user_label_status: 'user_submitted',
      review_status: 'queued',
    }),
    datasetRow({
      id: 'withdrawn',
      consent_state: {
        imageUploadConsent: false,
        imageUploadWithdrawnAt: '2026-07-26T12:02:00.000Z',
      },
    }),
    datasetRow({
      id: 'poor-image',
      review_status: 'rejected_poor_image',
      user_label_status: 'rejected',
    }),
  ], {
    datasetVersion: 'feedback-dataset-test',
    generatedAt: '2026-07-26T13:00:00.000Z',
  });

  assert.equal(manifest.examples.length, 1);
  assert.equal(manifest.examples[0].id, 'reviewed');
  assert.equal(manifest.deploymentAction, 'none');
  assert.ok(manifest.rejectedRows.some((row) => row.id === 'unreviewed' && row.reasons.includes('label_not_reviewed')));
  assert.ok(manifest.rejectedRows.some((row) => row.id === 'withdrawn' && row.reasons.includes('image_upload_consent_missing_or_withdrawn')));
  assert.ok(manifest.rejectedRows.some((row) => row.id === 'poor-image' && row.reasons.includes('review_status_not_approved')));
  assert.equal(manifest.leakageChecks.physicalCardSessionLeakage, false);
}

function explanationIsExplicit() {
  const explanation = explainRecognitionFeedbackImageUpload();
  assert.match(explanation.body.join(' '), /rectified card crop/i);
  assert.match(explanation.body.join(' '), /withdraw/i);
}

consentRequiredBeforeUpload();
deletionIsReversibleControl();
reviewDecisionsKeepLabelsSeparate();
unreviewedRowsNeverBecomeGroundTruth();
explanationIsExplicit();

console.log('recognition feedback loop tests passed');
