import {
  SCAN_LAB_SCHEMA_VERSION,
  type ScanLabCardSide,
  type ScanLabHolderState,
  type ScanLabLightingCategory,
  type ScanLabReviewStatus,
  type ScanLabSleeveState,
} from './scanLabCore';

export const SCAN_LAB_TRAINING_MANIFEST_VERSION = 'stackr-scan-lab-training-manifest-v1.0.0';

export type ScanLabReviewedCaptureRow = {
  id: string;
  created_by: string;
  physical_card_session_id: string;
  captured_at: string;
  expected_identity: Record<string, unknown> | null;
  user_confirmed_identity: Record<string, unknown> | null;
  review_status: ScanLabReviewStatus;
  label_verification_status: 'user_reported' | 'queued_for_review' | 'reviewed' | 'verified' | 'rejected';
  original_photo_storage_path: string | null;
  rectified_card_storage_path: string | null;
  original_photo_checksum_sha256: string | null;
  rectified_card_checksum_sha256: string | null;
  image_upload_consent: boolean;
  image_upload_status: 'local_only' | 'metadata_received' | 'uploaded' | 'failed' | 'deleted';
  deleted_at: string | null;
  capture_quality: Record<string, unknown> | null;
  ocr_evidence: Record<string, unknown> | null;
  rectification: Record<string, unknown> | null;
  device_info: Record<string, unknown> | null;
  lighting_category: ScanLabLightingCategory;
  sleeve_state: ScanLabSleeveState;
  holder_state: ScanLabHolderState;
  card_side: ScanLabCardSide;
};

export type ScanLabTrainingManifestExample = {
  id: string;
  physicalCardSessionId: string;
  split: 'train' | 'validation' | 'test';
  capturedAt: string;
  reviewStatus: ScanLabReviewStatus;
  labelVerificationStatus: 'reviewed' | 'verified';
  originalPhotoStoragePath: string;
  rectifiedCardStoragePath: string;
  originalPhotoChecksumSha256: string | null;
  rectifiedCardChecksumSha256: string | null;
  expectedIdentity: Record<string, unknown> | null;
  userConfirmedIdentity: Record<string, unknown> | null;
  captureQuality: Record<string, unknown> | null;
  ocrEvidence: Record<string, unknown> | null;
  rectification: Record<string, unknown> | null;
  deviceInfo: Record<string, unknown> | null;
  lightingCategory: ScanLabLightingCategory;
  sleeveState: ScanLabSleeveState;
  holderState: ScanLabHolderState;
  cardSide: ScanLabCardSide;
};

export type ScanLabTrainingManifest = {
  manifestVersion: typeof SCAN_LAB_TRAINING_MANIFEST_VERSION;
  sourceSchemaVersion: typeof SCAN_LAB_SCHEMA_VERSION;
  generatedAt: string;
  examples: ScanLabTrainingManifestExample[];
  rejectedRows: Array<{ id: string; reasons: string[] }>;
  splitCounts: Record<'train' | 'validation' | 'test', number>;
  physicalCardSessionCounts: Record<'train' | 'validation' | 'test', number>;
  leakageChecks: {
    physicalCardSessionLeakage: boolean;
    leakedPhysicalCardSessionIds: string[];
  };
  limitations: string[];
};

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function splitForPhysicalCardSessionId(
  physicalCardSessionId: string
): 'train' | 'validation' | 'test' {
  const bucket = hashString(physicalCardSessionId) % 100;
  if (bucket < 70) return 'train';
  if (bucket < 85) return 'validation';
  return 'test';
}

function validateReviewedRow(row: ScanLabReviewedCaptureRow) {
  const reasons: string[] = [];
  if (!row.image_upload_consent) reasons.push('image_upload_consent_missing');
  if (row.image_upload_status !== 'uploaded') reasons.push('images_not_uploaded');
  if (row.deleted_at) reasons.push('capture_deleted');
  if (!row.physical_card_session_id) reasons.push('physical_card_session_missing');
  if (!row.original_photo_storage_path) reasons.push('original_photo_missing');
  if (!row.rectified_card_storage_path) reasons.push('rectified_card_missing');
  if (!row.original_photo_checksum_sha256) reasons.push('original_photo_checksum_missing');
  if (!row.rectified_card_checksum_sha256) reasons.push('rectified_card_checksum_missing');
  if (row.label_verification_status !== 'reviewed' && row.label_verification_status !== 'verified') {
    reasons.push('label_not_reviewed');
  }
  if (
    row.review_status !== 'confirmed' &&
    row.review_status !== 'corrected' &&
    row.review_status !== 'wrong_variant' &&
    row.review_status !== 'poor_capture'
  ) {
    reasons.push('unsupported_review_status');
  }
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

export function buildScanLabTrainingManifest(
  rows: ScanLabReviewedCaptureRow[],
  generatedAt = new Date().toISOString()
): ScanLabTrainingManifest {
  const rejectedRows: Array<{ id: string; reasons: string[] }> = [];
  const examples: ScanLabTrainingManifestExample[] = [];

  rows.forEach((row) => {
    const reasons = validateReviewedRow(row);
    if (reasons.length) {
      rejectedRows.push({ id: row.id, reasons });
      return;
    }

    const split = splitForPhysicalCardSessionId(row.physical_card_session_id);
    examples.push({
      id: row.id,
      physicalCardSessionId: row.physical_card_session_id,
      split,
      capturedAt: row.captured_at,
      reviewStatus: row.review_status,
      labelVerificationStatus: row.label_verification_status as 'reviewed' | 'verified',
      originalPhotoStoragePath: row.original_photo_storage_path!,
      rectifiedCardStoragePath: row.rectified_card_storage_path!,
      originalPhotoChecksumSha256: row.original_photo_checksum_sha256,
      rectifiedCardChecksumSha256: row.rectified_card_checksum_sha256,
      expectedIdentity: row.expected_identity,
      userConfirmedIdentity: row.user_confirmed_identity,
      captureQuality: row.capture_quality,
      ocrEvidence: row.ocr_evidence,
      rectification: row.rectification,
      deviceInfo: row.device_info,
      lightingCategory: row.lighting_category,
      sleeveState: row.sleeve_state,
      holderState: row.holder_state,
      cardSide: row.card_side,
    });
  });

  const sessionsBySplit = new Map<string, Set<'train' | 'validation' | 'test'>>();
  examples.forEach((example) => {
    const splits = sessionsBySplit.get(example.physicalCardSessionId) ?? new Set();
    splits.add(example.split);
    sessionsBySplit.set(example.physicalCardSessionId, splits);
  });
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
  const realPhoneCaptureCount = examples.filter((example) => {
    const platform = String(example.deviceInfo?.platform ?? '').toLowerCase();
    return platform === 'ios' || platform === 'android';
  }).length;

  return {
    manifestVersion: SCAN_LAB_TRAINING_MANIFEST_VERSION,
    sourceSchemaVersion: SCAN_LAB_SCHEMA_VERSION,
    generatedAt,
    examples,
    rejectedRows,
    splitCounts,
    physicalCardSessionCounts,
    leakageChecks: {
      physicalCardSessionLeakage: leakedPhysicalCardSessionIds.length > 0,
      leakedPhysicalCardSessionIds,
    },
    limitations: [
      ...(examples.length === 0 ? ['No reviewed Scan Lab captures were exportable.'] : []),
      ...(realPhoneCaptureCount === 0 ? ['No iOS or Android real-device captures were present.'] : []),
      ...(splitCounts.test === 0 ? ['No test examples were selected by the physical-card split.'] : []),
    ],
  };
}
