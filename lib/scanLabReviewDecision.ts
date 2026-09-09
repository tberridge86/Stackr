import {
  applyScanLabReviewDecision,
  type ScanLabCaptureRecord,
  type ScanLabReviewDecision,
} from './scanLabCore';

export type PinnedScanLabReviewDecision = {
  captureId: string;
  decision: ScanLabReviewDecision;
};

function sameIdentity(
  left: ScanLabCaptureRecord['userConfirmedIdentity'],
  right: ScanLabCaptureRecord['userConfirmedIdentity']
) {
  return left?.stackrCardId === right?.stackrCardId
    && left?.cardName === right?.cardName
    && left?.setId === right?.setId
    && left?.language === right?.language
    && left?.variant === right?.variant;
}

/** Applies a decision only when the record is still the capture shown in the confirmation. */
export function applyPinnedScanLabReviewDecision(
  record: ScanLabCaptureRecord,
  pending: PinnedScanLabReviewDecision
) {
  if (record.localId !== pending.captureId) {
    throw new Error('The selected capture changed before its review decision could be saved.');
  }
  return applyScanLabReviewDecision(record, pending.decision);
}

/** Confirms that the queue write retained the requested decision for the pinned capture. */
export function findSavedScanLabReviewDecision(
  records: ScanLabCaptureRecord[],
  pending: PinnedScanLabReviewDecision
) {
  const saved = records.find((record) => record.localId === pending.captureId);
  if (!saved || saved.reviewStatus !== pending.decision.status) return null;

  const expected = applyScanLabReviewDecision(saved, pending.decision);
  return sameIdentity(saved.userConfirmedIdentity, expected.userConfirmedIdentity) ? saved : null;
}
