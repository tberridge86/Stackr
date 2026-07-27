export const RECOGNITION_FEEDBACK_SCHEMA_VERSION = 'stackr-recognition-feedback-v1.0.0';
export const RECOGNITION_FEEDBACK_ROUTE_VERSION = 'stackr-recognition-feedback-upload-v1.0.0';
export const RECOGNITION_FEEDBACK_DATASET_MANIFEST_VERSION = 'stackr-recognition-feedback-dataset-v1.0.0';

export type RecognitionFeedbackAction =
  | 'confirm_result'
  | 'choose_candidate'
  | 'manual_correction'
  | 'variant_correction'
  | 'missing_card'
  | 'bad_scan';

export type RecognitionFeedbackReviewStatus =
  | 'queued'
  | 'approved_identity'
  | 'changed_identity'
  | 'ambiguous'
  | 'rejected_poor_image'
  | 'rejected_other'
  | 'exported'
  | 'withdrawn'
  | 'deleted';

export type RecognitionFeedbackLabelStatus =
  | 'user_submitted'
  | 'queued_for_review'
  | 'reviewed'
  | 'verified'
  | 'rejected'
  | 'withdrawn';

export type RecognitionFeedbackImageUploadStatus =
  | 'local_only'
  | 'metadata_received'
  | 'uploaded'
  | 'failed'
  | 'deleted';

export type RecognitionFeedbackIdentity = {
  stackrCardId: string | null;
  cardName: string | null;
  setId: string | null;
  collectorNumber: string | null;
  language: string | null;
  variant: string | null;
};

export type RecognitionFeedbackCandidateScore = {
  canonicalCardId: string | null;
  rank: number;
  confidence: number | null;
  visualSimilarity: number | null;
  finalScore: number | null;
  setId?: string | null;
  collectorNumber?: string | null;
};

export type RecognitionFeedbackConsentState = {
  metadataStored: boolean;
  imageUploadConsent: boolean;
  imageUploadConsentAt: string | null;
  imageUploadWithdrawnAt: string | null;
  deletionRequestedAt: string | null;
  explanationVersion: typeof RECOGNITION_FEEDBACK_SCHEMA_VERSION;
};

export type RecognitionFeedbackRecord = {
  schemaVersion: typeof RECOGNITION_FEEDBACK_SCHEMA_VERSION;
  localId: string;
  backendId: string | null;
  anonymousScanId: string;
  createdAt: string;
  action: RecognitionFeedbackAction;
  predictedIdentity: RecognitionFeedbackIdentity | null;
  correctedIdentity: RecognitionFeedbackIdentity | null;
  correctedVariant: string | null;
  missingCardDescription: string | null;
  topCandidateScores: RecognitionFeedbackCandidateScore[];
  captureQuality: Record<string, unknown>;
  ocrEvidenceSummary: Record<string, unknown>;
  modelVersion: string | null;
  catalogueVersion: string | null;
  deviceClass: string | null;
  physicalCardSessionId: string | null;
  rectifiedImageUri: string | null;
  rectifiedImageWidth: number | null;
  rectifiedImageHeight: number | null;
  rectifiedImageStoragePath: string | null;
  rectifiedImageChecksumSha256: string | null;
  consentState: RecognitionFeedbackConsentState;
  userLabelStatus: RecognitionFeedbackLabelStatus;
  reviewStatus: RecognitionFeedbackReviewStatus;
  reviewedIdentity: RecognitionFeedbackIdentity | null;
  reviewerNotes: string | null;
  datasetVersion: string | null;
  imageUploadStatus: RecognitionFeedbackImageUploadStatus;
  uploadError: string | null;
  uploadedAt: string | null;
  deletedAt: string | null;
};

export type RecognitionFeedbackDraftInput = {
  localId?: string;
  backendId?: string | null;
  anonymousScanId: string;
  createdAt?: string;
  action: RecognitionFeedbackAction;
  predictedIdentity?: Partial<RecognitionFeedbackIdentity> | null;
  correctedIdentity?: Partial<RecognitionFeedbackIdentity> | null;
  correctedVariant?: string | null;
  missingCardDescription?: string | null;
  topCandidateScores?: RecognitionFeedbackCandidateScore[];
  captureQuality?: Record<string, unknown> | null;
  ocrEvidenceSummary?: Record<string, unknown> | null;
  modelVersion?: string | null;
  catalogueVersion?: string | null;
  deviceClass?: string | null;
  physicalCardSessionId?: string | null;
  rectifiedImageUri?: string | null;
  rectifiedImageWidth?: number | null;
  rectifiedImageHeight?: number | null;
};

export type RecognitionFeedbackReviewDecision =
  | {
      decision: 'approve_identity';
      reviewedIdentity?: Partial<RecognitionFeedbackIdentity> | null;
      reviewerNotes?: string | null;
      physicalCardSessionId?: string | null;
    }
  | {
      decision: 'change_identity';
      reviewedIdentity: Partial<RecognitionFeedbackIdentity>;
      reviewerNotes?: string | null;
      physicalCardSessionId?: string | null;
    }
  | {
      decision: 'mark_ambiguous';
      reviewerNotes?: string | null;
      physicalCardSessionId?: string | null;
    }
  | {
      decision: 'reject_poor_image';
      reviewerNotes?: string | null;
      physicalCardSessionId?: string | null;
    }
  | {
      decision: 'reject_other';
      reviewerNotes?: string | null;
      physicalCardSessionId?: string | null;
    }
  | {
      decision: 'group_physical_card';
      physicalCardSessionId: string;
      reviewerNotes?: string | null;
    };

export type RecognitionFeedbackUploadValidation = {
  ok: boolean;
  reasons: string[];
};

export type RecognitionFeedbackDatasetRow = {
  id: string;
  anonymous_scan_id: string;
  action: RecognitionFeedbackAction;
  predicted_identity: Record<string, unknown> | null;
  corrected_identity: Record<string, unknown> | null;
  reviewed_identity: Record<string, unknown> | null;
  review_status: RecognitionFeedbackReviewStatus;
  user_label_status: RecognitionFeedbackLabelStatus;
  image_upload_status: RecognitionFeedbackImageUploadStatus;
  consent_state: Record<string, unknown> | null;
  rectified_image_storage_path: string | null;
  rectified_image_checksum_sha256: string | null;
  capture_quality: Record<string, unknown> | null;
  ocr_evidence_summary: Record<string, unknown> | null;
  model_version: string | null;
  catalogue_version: string | null;
  device_class: string | null;
  physical_card_session_id: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type RecognitionFeedbackDatasetManifestExample = {
  id: string;
  anonymousScanId: string;
  split: 'train' | 'validation' | 'test';
  action: RecognitionFeedbackAction;
  physicalCardSessionId: string;
  rectifiedImageStoragePath: string;
  rectifiedImageChecksumSha256: string | null;
  reviewedIdentity: Record<string, unknown>;
  predictedIdentity: Record<string, unknown> | null;
  correctedIdentity: Record<string, unknown> | null;
  captureQuality: Record<string, unknown> | null;
  ocrEvidenceSummary: Record<string, unknown> | null;
  modelVersion: string | null;
  catalogueVersion: string | null;
  deviceClass: string | null;
  createdAt: string;
};

export type RecognitionFeedbackDatasetManifest = {
  manifestVersion: typeof RECOGNITION_FEEDBACK_DATASET_MANIFEST_VERSION;
  sourceSchemaVersion: typeof RECOGNITION_FEEDBACK_SCHEMA_VERSION;
  datasetVersion: string;
  generatedAt: string;
  deploymentAction: 'none';
  examples: RecognitionFeedbackDatasetManifestExample[];
  rejectedRows: Array<{ id: string; reasons: string[] }>;
  splitCounts: Record<'train' | 'validation' | 'test', number>;
  physicalCardSessionCounts: Record<'train' | 'validation' | 'test', number>;
  leakageChecks: {
    physicalCardSessionLeakage: boolean;
    leakedPhysicalCardSessionIds: string[];
  };
  limitations: string[];
};

function trimOrNull(value?: string | null) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

export function createRecognitionFeedbackLocalId(now = Date.now()) {
  return `rfb_${now.toString(36)}_${randomSuffix()}`;
}

export function createRecognitionFeedbackPhysicalCardSessionId(now = Date.now()) {
  return `rfb_physical_${now.toString(36)}_${randomSuffix().slice(0, 6)}`;
}

export function normaliseRecognitionFeedbackIdentity(
  identity?: Partial<RecognitionFeedbackIdentity> | null
): RecognitionFeedbackIdentity {
  return {
    stackrCardId: trimOrNull(identity?.stackrCardId),
    cardName: trimOrNull(identity?.cardName),
    setId: trimOrNull(identity?.setId),
    collectorNumber: trimOrNull(identity?.collectorNumber),
    language: trimOrNull(identity?.language)?.toLowerCase() ?? null,
    variant: trimOrNull(identity?.variant),
  };
}

export function recognitionFeedbackIdentityHasSignal(identity?: RecognitionFeedbackIdentity | null) {
  return Boolean(identity?.stackrCardId || identity?.cardName || identity?.setId || identity?.collectorNumber);
}

export function createRecognitionFeedbackRecord(input: RecognitionFeedbackDraftInput): RecognitionFeedbackRecord {
  const predictedIdentity = input.predictedIdentity
    ? normaliseRecognitionFeedbackIdentity(input.predictedIdentity)
    : null;
  const correctedIdentity = input.correctedIdentity
    ? normaliseRecognitionFeedbackIdentity(input.correctedIdentity)
    : null;

  return {
    schemaVersion: RECOGNITION_FEEDBACK_SCHEMA_VERSION,
    localId: input.localId ?? createRecognitionFeedbackLocalId(),
    backendId: input.backendId ?? null,
    anonymousScanId: trimOrNull(input.anonymousScanId) ?? createRecognitionFeedbackLocalId(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    action: input.action,
    predictedIdentity: recognitionFeedbackIdentityHasSignal(predictedIdentity) ? predictedIdentity : null,
    correctedIdentity: recognitionFeedbackIdentityHasSignal(correctedIdentity) ? correctedIdentity : null,
    correctedVariant: trimOrNull(input.correctedVariant),
    missingCardDescription: trimOrNull(input.missingCardDescription),
    topCandidateScores: (input.topCandidateScores ?? []).slice(0, 10),
    captureQuality: input.captureQuality ?? {},
    ocrEvidenceSummary: input.ocrEvidenceSummary ?? {},
    modelVersion: trimOrNull(input.modelVersion),
    catalogueVersion: trimOrNull(input.catalogueVersion),
    deviceClass: trimOrNull(input.deviceClass),
    physicalCardSessionId: trimOrNull(input.physicalCardSessionId) ?? createRecognitionFeedbackPhysicalCardSessionId(),
    rectifiedImageUri: trimOrNull(input.rectifiedImageUri),
    rectifiedImageWidth: input.rectifiedImageWidth ?? null,
    rectifiedImageHeight: input.rectifiedImageHeight ?? null,
    rectifiedImageStoragePath: null,
    rectifiedImageChecksumSha256: null,
    consentState: {
      metadataStored: true,
      imageUploadConsent: false,
      imageUploadConsentAt: null,
      imageUploadWithdrawnAt: null,
      deletionRequestedAt: null,
      explanationVersion: RECOGNITION_FEEDBACK_SCHEMA_VERSION,
    },
    userLabelStatus: 'user_submitted',
    reviewStatus: 'queued',
    reviewedIdentity: null,
    reviewerNotes: null,
    datasetVersion: null,
    imageUploadStatus: 'local_only',
    uploadError: null,
    uploadedAt: null,
    deletedAt: null,
  };
}

export function explainRecognitionFeedbackImageUpload() {
  return {
    title: 'Help improve recognition',
    body: [
      'Stackr will upload only the rectified card crop from this scan.',
      'It will include your correction, capture quality, OCR summary, model/catalogue versions and anonymous scan ID.',
      'It will not upload unrelated camera surroundings by default.',
      'You can withdraw consent and request deletion later.',
    ],
    uploadLabel: 'Upload card crop',
    declineLabel: 'Keep local only',
  };
}

export function grantRecognitionFeedbackImageConsent(
  record: RecognitionFeedbackRecord,
  consentAt = new Date().toISOString()
): RecognitionFeedbackRecord {
  return {
    ...record,
    consentState: {
      ...record.consentState,
      imageUploadConsent: true,
      imageUploadConsentAt: consentAt,
      imageUploadWithdrawnAt: null,
      deletionRequestedAt: null,
    },
  };
}

export function withdrawRecognitionFeedbackConsent(
  record: RecognitionFeedbackRecord,
  withdrawnAt = new Date().toISOString()
): RecognitionFeedbackRecord {
  return {
    ...record,
    consentState: {
      ...record.consentState,
      imageUploadConsent: false,
      imageUploadWithdrawnAt: withdrawnAt,
    },
    userLabelStatus: 'withdrawn',
    reviewStatus: 'withdrawn',
  };
}

export function markRecognitionFeedbackDeleted(
  record: RecognitionFeedbackRecord,
  deletedAt = new Date().toISOString()
): RecognitionFeedbackRecord {
  return {
    ...withdrawRecognitionFeedbackConsent(record, deletedAt),
    imageUploadStatus: 'deleted',
    deletedAt,
    consentState: {
      ...record.consentState,
      imageUploadConsent: false,
      imageUploadWithdrawnAt: deletedAt,
      deletionRequestedAt: deletedAt,
    },
    reviewStatus: 'deleted',
  };
}

export function validateRecognitionFeedbackForImageUpload(
  record: RecognitionFeedbackRecord
): RecognitionFeedbackUploadValidation {
  const reasons: string[] = [];
  if (!record.consentState.imageUploadConsent) reasons.push('image_upload_consent_required');
  if (record.consentState.imageUploadWithdrawnAt) reasons.push('image_upload_consent_withdrawn');
  if (!record.rectifiedImageUri) reasons.push('rectified_image_missing');
  if (record.deletedAt || record.imageUploadStatus === 'deleted') reasons.push('feedback_deleted');
  if (!record.physicalCardSessionId) reasons.push('physical_card_session_required');
  if (!record.anonymousScanId) reasons.push('anonymous_scan_id_required');
  return { ok: reasons.length === 0, reasons };
}

export function applyRecognitionFeedbackReviewDecision(
  record: RecognitionFeedbackRecord,
  decision: RecognitionFeedbackReviewDecision,
  reviewedAt = new Date().toISOString()
): RecognitionFeedbackRecord {
  const physicalCardSessionId = trimOrNull(decision.physicalCardSessionId) ?? record.physicalCardSessionId;

  if (decision.decision === 'group_physical_card') {
    return {
      ...record,
      physicalCardSessionId: decision.physicalCardSessionId,
      reviewerNotes: trimOrNull(decision.reviewerNotes) ?? record.reviewerNotes,
    };
  }

  if (decision.decision === 'approve_identity') {
    const identity = normaliseRecognitionFeedbackIdentity(
      decision.reviewedIdentity ?? record.correctedIdentity ?? record.predictedIdentity
    );
    return {
      ...record,
      physicalCardSessionId,
      reviewedIdentity: recognitionFeedbackIdentityHasSignal(identity) ? identity : null,
      userLabelStatus: 'reviewed',
      reviewStatus: 'approved_identity',
      reviewerNotes: trimOrNull(decision.reviewerNotes),
      uploadedAt: record.uploadedAt || reviewedAt,
    };
  }

  if (decision.decision === 'change_identity') {
    const identity = normaliseRecognitionFeedbackIdentity(decision.reviewedIdentity);
    return {
      ...record,
      physicalCardSessionId,
      reviewedIdentity: recognitionFeedbackIdentityHasSignal(identity) ? identity : null,
      userLabelStatus: 'reviewed',
      reviewStatus: 'changed_identity',
      reviewerNotes: trimOrNull(decision.reviewerNotes),
      uploadedAt: record.uploadedAt || reviewedAt,
    };
  }

  if (decision.decision === 'mark_ambiguous') {
    return {
      ...record,
      physicalCardSessionId,
      reviewedIdentity: null,
      userLabelStatus: 'rejected',
      reviewStatus: 'ambiguous',
      reviewerNotes: trimOrNull(decision.reviewerNotes),
    };
  }

  if (decision.decision === 'reject_poor_image') {
    return {
      ...record,
      physicalCardSessionId,
      reviewedIdentity: null,
      userLabelStatus: 'rejected',
      reviewStatus: 'rejected_poor_image',
      reviewerNotes: trimOrNull(decision.reviewerNotes),
    };
  }

  return {
    ...record,
    physicalCardSessionId,
    reviewedIdentity: null,
    userLabelStatus: 'rejected',
    reviewStatus: 'rejected_other',
    reviewerNotes: trimOrNull(decision.reviewerNotes),
  };
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function splitForRecognitionFeedbackPhysicalCard(
  physicalCardSessionId: string
): 'train' | 'validation' | 'test' {
  const bucket = hashString(physicalCardSessionId) % 100;
  if (bucket < 70) return 'train';
  if (bucket < 85) return 'validation';
  return 'test';
}

function hasImageUploadConsent(row: RecognitionFeedbackDatasetRow) {
  const consent = row.consent_state ?? {};
  return consent.imageUploadConsent === true && !consent.imageUploadWithdrawnAt && !consent.deletionRequestedAt;
}

function validateDatasetRow(row: RecognitionFeedbackDatasetRow) {
  const reasons: string[] = [];
  const reviewedIdentity = row.reviewed_identity ?? row.corrected_identity ?? null;

  if (!hasImageUploadConsent(row)) reasons.push('image_upload_consent_missing_or_withdrawn');
  if (row.image_upload_status !== 'uploaded') reasons.push('rectified_image_not_uploaded');
  if (row.deleted_at) reasons.push('feedback_deleted');
  if (row.user_label_status !== 'reviewed' && row.user_label_status !== 'verified') reasons.push('label_not_reviewed');
  if (row.review_status !== 'approved_identity' && row.review_status !== 'changed_identity') reasons.push('review_status_not_approved');
  if (!row.rectified_image_storage_path) reasons.push('rectified_image_missing');
  if (!row.physical_card_session_id) reasons.push('physical_card_session_missing');
  if (!reviewedIdentity || Object.keys(reviewedIdentity).length === 0) reasons.push('reviewed_identity_missing');
  return reasons;
}

function countBySplit<T>(
  rows: T[],
  getSplit: (row: T) => 'train' | 'validation' | 'test'
): Record<'train' | 'validation' | 'test', number> {
  return rows.reduce(
    (counts, row) => {
      counts[getSplit(row)] += 1;
      return counts;
    },
    { train: 0, validation: 0, test: 0 }
  );
}

export function buildRecognitionFeedbackDatasetManifest(
  rows: RecognitionFeedbackDatasetRow[],
  options: { datasetVersion: string; generatedAt?: string }
): RecognitionFeedbackDatasetManifest {
  const rejectedRows: Array<{ id: string; reasons: string[] }> = [];
  const examples: RecognitionFeedbackDatasetManifestExample[] = [];

  for (const row of rows) {
    const reasons = validateDatasetRow(row);
    if (reasons.length) {
      rejectedRows.push({ id: row.id, reasons });
      continue;
    }

    const physicalCardSessionId = row.physical_card_session_id!;
    const split = splitForRecognitionFeedbackPhysicalCard(physicalCardSessionId);
    examples.push({
      id: row.id,
      anonymousScanId: row.anonymous_scan_id,
      split,
      action: row.action,
      physicalCardSessionId,
      rectifiedImageStoragePath: row.rectified_image_storage_path!,
      rectifiedImageChecksumSha256: row.rectified_image_checksum_sha256,
      reviewedIdentity: (row.reviewed_identity ?? row.corrected_identity)!,
      predictedIdentity: row.predicted_identity,
      correctedIdentity: row.corrected_identity,
      captureQuality: row.capture_quality,
      ocrEvidenceSummary: row.ocr_evidence_summary,
      modelVersion: row.model_version,
      catalogueVersion: row.catalogue_version,
      deviceClass: row.device_class,
      createdAt: row.created_at,
    });
  }

  const sessionsBySplit = new Map<string, Set<'train' | 'validation' | 'test'>>();
  for (const example of examples) {
    const splits = sessionsBySplit.get(example.physicalCardSessionId) ?? new Set();
    splits.add(example.split);
    sessionsBySplit.set(example.physicalCardSessionId, splits);
  }
  const leakedPhysicalCardSessionIds = [...sessionsBySplit.entries()]
    .filter(([, splits]) => splits.size > 1)
    .map(([id]) => id)
    .sort();
  const sessionRows = [...sessionsBySplit.entries()].map(([id, splits]) => ({
    id,
    split: [...splits][0]!,
  }));
  const splitCounts = countBySplit(examples, (example) => example.split);
  const physicalCardSessionCounts = countBySplit(sessionRows, (row) => row.split);

  return {
    manifestVersion: RECOGNITION_FEEDBACK_DATASET_MANIFEST_VERSION,
    sourceSchemaVersion: RECOGNITION_FEEDBACK_SCHEMA_VERSION,
    datasetVersion: options.datasetVersion,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    deploymentAction: 'none',
    examples,
    rejectedRows,
    splitCounts,
    physicalCardSessionCounts,
    leakageChecks: {
      physicalCardSessionLeakage: leakedPhysicalCardSessionIds.length > 0,
      leakedPhysicalCardSessionIds,
    },
    limitations: [
      ...(examples.length === 0 ? ['No reviewed recognition-feedback rows were exportable.'] : []),
      ...(splitCounts.test === 0 ? ['No test examples were selected by the physical-card split.'] : []),
      'Exporting a candidate dataset version does not train or deploy a model.',
    ],
  };
}
