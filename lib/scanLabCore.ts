import type { CardRectificationResult } from './cardRectification';
import type { CardFrameAnalysisResult } from './cardVisionFrameAnalyser';
import type { OcrEvidence } from './recognition/types';

export const SCAN_LAB_SCHEMA_VERSION = 'stackr-scan-lab-v1.0.0';
export const SCAN_LAB_UPLOAD_ROUTE_VERSION = 'stackr-scan-lab-upload-v1.0.0';

export const SCAN_LAB_LIGHTING_CATEGORIES = [
  'bright_indoor',
  'dim_indoor',
  'daylight',
  'mixed',
  'unknown',
] as const;

export const SCAN_LAB_SLEEVE_STATES = [
  'none',
  'sleeved',
  'unknown',
] as const;

export const SCAN_LAB_HOLDER_STATES = [
  'none',
  'binder_pocket',
  'toploader',
  'slab',
  'unknown',
] as const;

export const SCAN_LAB_CARD_SIDES = ['front', 'back'] as const;

export const SCAN_LAB_REVIEW_STATUSES = [
  'pending',
  'confirmed',
  'corrected',
  'unresolved',
  'wrong_variant',
  'poor_capture',
  'deleted',
] as const;

export const SCAN_LAB_UPLOAD_STATUSES = [
  'local_only',
  'metadata_received',
  'uploaded',
  'failed',
  'deleted',
] as const;

export type ScanLabLightingCategory = (typeof SCAN_LAB_LIGHTING_CATEGORIES)[number];
export type ScanLabSleeveState = (typeof SCAN_LAB_SLEEVE_STATES)[number];
export type ScanLabHolderState = (typeof SCAN_LAB_HOLDER_STATES)[number];
export type ScanLabCardSide = (typeof SCAN_LAB_CARD_SIDES)[number];
export type ScanLabReviewStatus = (typeof SCAN_LAB_REVIEW_STATUSES)[number];
export type ScanLabUploadStatus = (typeof SCAN_LAB_UPLOAD_STATUSES)[number];

export type ScanLabCardIdentity = {
  stackrCardId: string | null;
  cardName: string | null;
  setId: string | null;
  language: string | null;
  variant: string | null;
};

export type ScanLabDeviceInfo = {
  platform: string;
  deviceModel: string | null;
  osName: string | null;
  osVersion: string | null;
};

export type ScanLabCaptureRecord = {
  schemaVersion: typeof SCAN_LAB_SCHEMA_VERSION;
  localId: string;
  backendCaptureId: string | null;
  physicalCardSessionId: string;
  capturedAt: string;
  originalPhotoUri: string;
  originalPhotoWidth: number | null;
  originalPhotoHeight: number | null;
  originalPhotoOrientation: string | null;
  rectifiedCardUri: string | null;
  rectifiedCardWidth: number | null;
  rectifiedCardHeight: number | null;
  recognitionCropUri: string | null;
  ocrSourceCropUri: string | null;
  thumbnailUri: string | null;
  rectification: CardRectificationResult | null;
  captureQuality: CardFrameAnalysisResult | null;
  ocrEvidence: OcrEvidence | null;
  expectedIdentity: ScanLabCardIdentity;
  userConfirmedIdentity: ScanLabCardIdentity | null;
  reviewStatus: ScanLabReviewStatus;
  consentToUploadImages: boolean;
  uploadStatus: ScanLabUploadStatus;
  uploadError: string | null;
  uploadedAt: string | null;
  deletedAt: string | null;
  device: ScanLabDeviceInfo;
  lightingCategory: ScanLabLightingCategory;
  sleeveState: ScanLabSleeveState;
  holderState: ScanLabHolderState;
  cardSide: ScanLabCardSide;
};

export type ScanLabCaptureDraft = Omit<
  ScanLabCaptureRecord,
  'schemaVersion' | 'reviewStatus' | 'uploadStatus' | 'uploadError' | 'uploadedAt' | 'deletedAt'
>;

export type ScanLabReviewDecision =
  | { status: 'confirmed'; identity?: ScanLabCardIdentity | null }
  | { status: 'corrected'; identity: ScanLabCardIdentity }
  | { status: 'unresolved'; identity?: null }
  | { status: 'wrong_variant'; identity: ScanLabCardIdentity }
  | { status: 'poor_capture'; identity?: ScanLabCardIdentity | null };

export type ScanLabUploadValidation = {
  ok: boolean;
  reasons: string[];
};

export type ScanLabUploadMetadata = {
  schemaVersion: typeof SCAN_LAB_SCHEMA_VERSION;
  routeVersion: typeof SCAN_LAB_UPLOAD_ROUTE_VERSION;
  localId: string;
  physicalCardSessionId: string;
  capturedAt: string;
  originalPhotoWidth: number | null;
  originalPhotoHeight: number | null;
  originalPhotoOrientation: string | null;
  rectifiedCardWidth: number | null;
  rectifiedCardHeight: number | null;
  expectedIdentity: ScanLabCardIdentity;
  userConfirmedIdentity: ScanLabCardIdentity | null;
  reviewStatus: ScanLabReviewStatus;
  captureQuality: CardFrameAnalysisResult | null;
  ocrEvidence: OcrEvidence | null;
  rectification: CardRectificationResult | null;
  device: ScanLabDeviceInfo;
  lightingCategory: ScanLabLightingCategory;
  sleeveState: ScanLabSleeveState;
  holderState: ScanLabHolderState;
  cardSide: ScanLabCardSide;
  consentToUploadImages: boolean;
};

function trimOrNull(value?: string | null) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

export function normaliseScanLabIdentity(identity?: Partial<ScanLabCardIdentity> | null): ScanLabCardIdentity {
  return {
    stackrCardId: trimOrNull(identity?.stackrCardId),
    cardName: trimOrNull(identity?.cardName),
    setId: trimOrNull(identity?.setId),
    language: trimOrNull(identity?.language)?.toLowerCase() ?? null,
    variant: trimOrNull(identity?.variant),
  };
}

export function scanLabIdentityHasSignal(identity?: ScanLabCardIdentity | null) {
  if (!identity) return false;
  return Boolean(identity.stackrCardId || identity.cardName || identity.setId);
}

export function createScanLabLocalId(now = Date.now()) {
  return `scanlab_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createPhysicalCardSessionId(now = Date.now()) {
  return `physical_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createScanLabCaptureRecord(draft: ScanLabCaptureDraft): ScanLabCaptureRecord {
  return {
    ...draft,
    schemaVersion: SCAN_LAB_SCHEMA_VERSION,
    expectedIdentity: normaliseScanLabIdentity(draft.expectedIdentity),
    userConfirmedIdentity: draft.userConfirmedIdentity
      ? normaliseScanLabIdentity(draft.userConfirmedIdentity)
      : null,
    reviewStatus: 'pending',
    consentToUploadImages: Boolean(draft.consentToUploadImages),
    uploadStatus: 'local_only',
    uploadError: null,
    uploadedAt: null,
    deletedAt: null,
  };
}

export function applyScanLabReviewDecision(
  record: ScanLabCaptureRecord,
  decision: ScanLabReviewDecision,
  reviewedAt = new Date().toISOString()
): ScanLabCaptureRecord {
  const identity =
    decision.status === 'confirmed'
      ? normaliseScanLabIdentity(decision.identity ?? record.expectedIdentity)
      : decision.status === 'corrected' || decision.status === 'wrong_variant'
        ? normaliseScanLabIdentity(decision.identity)
        : decision.status === 'poor_capture'
          ? normaliseScanLabIdentity(decision.identity ?? record.expectedIdentity)
          : null;

  return {
    ...record,
    reviewStatus: decision.status,
    userConfirmedIdentity: scanLabIdentityHasSignal(identity) ? identity : null,
    uploadedAt: record.uploadedAt,
    capturedAt: record.capturedAt || reviewedAt,
  };
}

export function validateScanLabCaptureForUpload(record: ScanLabCaptureRecord): ScanLabUploadValidation {
  const reasons: string[] = [];

  if (!record.consentToUploadImages) {
    reasons.push('image_upload_consent_required');
  }
  if (!record.physicalCardSessionId.trim()) {
    reasons.push('physical_card_session_required');
  }
  if (!record.originalPhotoUri) {
    reasons.push('original_photo_missing');
  }
  if (!Number.isFinite(record.originalPhotoWidth ?? NaN) || (record.originalPhotoWidth ?? 0) <= 0 ||
    !Number.isFinite(record.originalPhotoHeight ?? NaN) || (record.originalPhotoHeight ?? 0) <= 0) {
    reasons.push('original_dimensions_missing');
  }
  if (!record.rectifiedCardUri) {
    reasons.push('rectified_card_missing');
  }
  if (!Number.isFinite(record.rectifiedCardWidth ?? NaN) || (record.rectifiedCardWidth ?? 0) <= 0 ||
    !Number.isFinite(record.rectifiedCardHeight ?? NaN) || (record.rectifiedCardHeight ?? 0) <= 0) {
    reasons.push('rectified_dimensions_missing');
  }
  if (!record.captureQuality) {
    reasons.push('capture_quality_missing');
  }
  if (record.reviewStatus === 'pending') {
    reasons.push('review_decision_required');
  }
  if (
    (record.reviewStatus === 'confirmed' || record.reviewStatus === 'corrected' || record.reviewStatus === 'wrong_variant') &&
    !scanLabIdentityHasSignal(record.userConfirmedIdentity ?? record.expectedIdentity)
  ) {
    reasons.push('card_identity_required');
  }
  if (record.deletedAt || record.uploadStatus === 'deleted') {
    reasons.push('capture_deleted');
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function shouldDeleteScanLabBackendCapture(record: ScanLabCaptureRecord) {
  return Boolean(record.backendCaptureId && record.uploadStatus !== 'deleted' && !record.deletedAt);
}

export function buildScanLabUploadMetadata(record: ScanLabCaptureRecord): ScanLabUploadMetadata {
  return {
    schemaVersion: SCAN_LAB_SCHEMA_VERSION,
    routeVersion: SCAN_LAB_UPLOAD_ROUTE_VERSION,
    localId: record.localId,
    physicalCardSessionId: record.physicalCardSessionId,
    capturedAt: record.capturedAt,
    originalPhotoWidth: record.originalPhotoWidth,
    originalPhotoHeight: record.originalPhotoHeight,
    originalPhotoOrientation: record.originalPhotoOrientation,
    rectifiedCardWidth: record.rectifiedCardWidth,
    rectifiedCardHeight: record.rectifiedCardHeight,
    expectedIdentity: record.expectedIdentity,
    userConfirmedIdentity: record.userConfirmedIdentity,
    reviewStatus: record.reviewStatus,
    captureQuality: record.captureQuality,
    ocrEvidence: record.ocrEvidence,
    rectification: record.rectification,
    device: record.device,
    lightingCategory: record.lightingCategory,
    sleeveState: record.sleeveState,
    holderState: record.holderState,
    cardSide: record.cardSide,
    consentToUploadImages: record.consentToUploadImages,
  };
}
