export const MOBILE_UX_FLOW_CONTRACT_VERSION = '1.2.0' as const;
export const MOBILE_UX_MIN_TOUCH_TARGET = 44 as const;

export const MOBILE_FLOW_CONTROL_DIMENSIONS = Object.freeze({
  sweepCapture: Object.freeze({
    navigationButton: Object.freeze({ width: 46, height: 46 }),
    captureModeTab: Object.freeze({ minWidth: 44, minHeight: 44 }),
    scanModeTab: Object.freeze({ minWidth: 44, minHeight: 44 }),
    binderLayoutChip: Object.freeze({ minWidth: 44, minHeight: 44 }),
    manualSearchCloseButton: Object.freeze({ width: 44, height: 44 }),
    reviewButton: Object.freeze({ width: 104, minHeight: 50 }),
  }),
  sellerSweep: Object.freeze({
    headerBackButton: Object.freeze({ width: 44, height: 44 }),
    scanMoreButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
    binderChip: Object.freeze({ minWidth: 44, minHeight: 44 }),
    identityReviewButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
    conditionChip: Object.freeze({ minWidth: 44, minHeight: 44 }),
    confirmButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
    iconAction: Object.freeze({ width: 44, height: 44 }),
    quantityStepButton: Object.freeze({ width: 44, height: 44 }),
    exportButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
    commitButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
    prepareButton: Object.freeze({ minWidth: 44, minHeight: 50 }),
  }),
  binderPageReview: Object.freeze({
    destinationBinderChip: Object.freeze({ minWidth: 44, minHeight: 44 }),
    destinationPageStepButton: Object.freeze({ width: 44, height: 44 }),
    pocketSelectButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
    candidateNavButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
    pocketActionButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
    saveAction: Object.freeze({ minWidth: 44, minHeight: 54 }),
  }),
  inventorySeller: Object.freeze({
    stockModeSegment: Object.freeze({ minWidth: 44, minHeight: 44 }),
    stockReasonChip: Object.freeze({ minWidth: 44, minHeight: 44 }),
    scanEntryAction: Object.freeze({ minWidth: 44, minHeight: 88 }),
    scanInDestinationChip: Object.freeze({ minWidth: 44, minHeight: 44 }),
    binderDestinationChip: Object.freeze({ minWidth: 44, minHeight: 44 }),
    stockQuantityStepButton: Object.freeze({ width: 44, height: 44 }),
    stockActionButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
  }),
  pregradeCapture: Object.freeze({
    resultBackButton: Object.freeze({ width: 44, height: 44 }),
    resultPrimaryButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
    permissionButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
    closeButton: Object.freeze({ width: 48, height: 48 }),
    torchButton: Object.freeze({ width: 48, height: 48 }),
    viewTab: Object.freeze({ width: 68, height: 48 }),
    captureButton: Object.freeze({ width: 72, height: 72 }),
    submitButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
    retryStatusButton: Object.freeze({ minWidth: 44, minHeight: 44 }),
  }),
} as const);

export type MobileFlowControlStyleDimension = Readonly<{
  width?: number;
  minWidth?: number;
  height?: number;
  minHeight?: number;
}>;

export const MOBILE_FLOW_RENDERED_CONTROL_STYLE_LAYERS = Object.freeze({
  sweepCapture: Object.freeze({
    manualSearchCloseButton: Object.freeze([
      Object.freeze({ width: 36, height: 36 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.sweepCapture.manualSearchCloseButton,
    ]),
    binderLayoutChip: Object.freeze([
      Object.freeze({ minWidth: 34, minHeight: 34 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.sweepCapture.binderLayoutChip,
    ]),
    scanModeTab: Object.freeze([
      Object.freeze({ minWidth: 34, minHeight: 36 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.sweepCapture.scanModeTab,
    ]),
  }),
  sellerSweep: Object.freeze(Object.fromEntries(
    Object.entries(MOBILE_FLOW_CONTROL_DIMENSIONS.sellerSweep).map(([control, dimension]) => [
      control,
      Object.freeze([Object.freeze({}), dimension]),
    ]),
  )),
  binderPageReview: Object.freeze({
    destinationBinderChip: Object.freeze([
      Object.freeze({ minHeight: 36 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.binderPageReview.destinationBinderChip,
    ]),
    destinationPageStepButton: Object.freeze([
      Object.freeze({ width: 28, height: 28 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.binderPageReview.destinationPageStepButton,
    ]),
    pocketSelectButton: Object.freeze([
      Object.freeze({ minHeight: 126 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.binderPageReview.pocketSelectButton,
    ]),
    candidateNavButton: Object.freeze([
      Object.freeze({ minHeight: 32 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.binderPageReview.candidateNavButton,
    ]),
    pocketActionButton: Object.freeze([
      Object.freeze({ minHeight: 42 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.binderPageReview.pocketActionButton,
    ]),
    saveAction: Object.freeze([
      Object.freeze({ minHeight: 54 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.binderPageReview.saveAction,
    ]),
  }),
  inventorySeller: Object.freeze({
    stockModeSegment: Object.freeze([
      Object.freeze({ minHeight: 44 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.inventorySeller.stockModeSegment,
    ]),
    stockReasonChip: Object.freeze([
      Object.freeze({ minHeight: 36 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.inventorySeller.stockReasonChip,
    ]),
    scanEntryAction: Object.freeze([
      Object.freeze({ minHeight: 88 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.inventorySeller.scanEntryAction,
    ]),
    scanInDestinationChip: Object.freeze([
      Object.freeze({ minHeight: 31 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.inventorySeller.scanInDestinationChip,
    ]),
    binderDestinationChip: Object.freeze([
      Object.freeze({ minHeight: 33 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.inventorySeller.binderDestinationChip,
    ]),
    stockQuantityStepButton: Object.freeze([
      Object.freeze({ width: 28, height: 28 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.inventorySeller.stockQuantityStepButton,
    ]),
    stockActionButton: Object.freeze([
      Object.freeze({ minHeight: 38 }),
      MOBILE_FLOW_CONTROL_DIMENSIONS.inventorySeller.stockActionButton,
    ]),
  }),
} as const);

export function flattenMobileFlowControlStyle(
  layers: readonly MobileFlowControlStyleDimension[],
): MobileFlowControlStyleDimension {
  return Object.freeze(Object.assign({}, ...layers));
}
export const SCAN_NAVIGATION_BLOCKING_STATES = Object.freeze([
  'CAPTURING',
  'CAPTURED',
  'IDENTIFYING',
  'CONFIRMING',
] as const);

export type ScanNavigationGuardState = Readonly<{
  blocked: boolean;
  title: string;
  message: string;
}>;

export function deriveScanNavigationGuard(input: {
  captureInFlight: boolean;
  scannerState: string;
}): ScanNavigationGuardState {
  const blocked = input.captureInFlight
    || (SCAN_NAVIGATION_BLOCKING_STATES as readonly string[]).includes(input.scannerState);
  return Object.freeze({
    blocked,
    title: blocked ? 'Finish the current scan' : '',
    message: blocked
      ? 'Stackr is still capturing or identifying this card. Wait for the result before leaving or changing scan mode.'
      : '',
  });
}

export function canApplyScanAsyncContinuation(input: {
  routeMounted: boolean;
  navigatingAway: boolean;
}): boolean {
  return input.routeMounted && !input.navigatingAway;
}

export function canApplyGuidedCaptureContinuation(input: {
  mounted: boolean;
  visible: boolean;
  departing: boolean;
  generation: number;
  activeGeneration: number;
  requirementId?: string | null;
  activeRequirementId?: string | null;
}) {
  return input.mounted
    && input.visible
    && !input.departing
    && input.generation === input.activeGeneration
    && (input.requirementId == null || input.requirementId === input.activeRequirementId);
}

export type GuidedCaptureOperationToken = Readonly<{
  generation: number;
  operationId: number;
}>;

/**
 * One synchronous ownership boundary shared by preview/auto and manual camera
 * work. Reset invalidates every old token, so a late close/reopen continuation
 * cannot release or mutate the newly visible camera generation.
 */
export function createGuidedCaptureOperationMutex(initialGeneration = 0) {
  let generation = initialGeneration;
  let nextOperationId = 0;
  let owner: GuidedCaptureOperationToken | null = null;

  const owns = (token: GuidedCaptureOperationToken) => owner !== null
    && token.generation === generation
    && owner.generation === token.generation
    && owner.operationId === token.operationId;

  return Object.freeze({
    reset(nextGeneration: number) {
      if (!Number.isSafeInteger(nextGeneration) || nextGeneration < 0) {
        throw new Error('guided_capture_generation_invalid');
      }
      generation = nextGeneration;
      owner = null;
    },
    tryAcquire(requestGeneration: number): GuidedCaptureOperationToken | null {
      if (requestGeneration !== generation || owner !== null) return null;
      nextOperationId += 1;
      owner = Object.freeze({ generation, operationId: nextOperationId });
      return owner;
    },
    owns,
    release(token: GuidedCaptureOperationToken): boolean {
      if (!owns(token)) return false;
      owner = null;
      return true;
    },
    isLocked() {
      return owner !== null;
    },
    getGeneration() {
      return generation;
    },
  });
}

export type MobileFlowExitGuard = 'none' | 'confirm' | 'block';

export type MobileFlowMutex = { current: boolean };

export function tryAcquireMobileFlowMutex(mutex: MobileFlowMutex): boolean {
  if (mutex.current) return false;
  mutex.current = true;
  return true;
}

export function releaseMobileFlowMutex(mutex: MobileFlowMutex): void {
  mutex.current = false;
}

export type MobileFlowActionState = Readonly<{
  label: string;
  hint: string;
  disabled: boolean;
  busy: boolean;
}>;

function assertCount(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field}_invalid`);
  }
  return value;
}

export type SweepCaptureUxState = Readonly<{
  reviewAction: MobileFlowActionState;
  statusAnnouncement: string;
}>;

export function deriveSweepCaptureUxState(input: {
  capturedCopies: number;
  captureBusy: boolean;
}): SweepCaptureUxState {
  const capturedCopies = assertCount(input.capturedCopies, 'captured_copies');
  const plural = capturedCopies === 1 ? 'card' : 'cards';
  const disabled = input.captureBusy || capturedCopies === 0;

  return Object.freeze({
    reviewAction: Object.freeze({
      label: capturedCopies === 0
        ? 'Review swept cards'
        : `Review ${capturedCopies} swept ${plural}`,
      hint: input.captureBusy
        ? 'Wait for the current capture to finish before opening review.'
        : capturedCopies === 0
          ? 'Capture at least one card before opening review.'
          : 'Opens the batch review without clearing any captured cards.',
      disabled,
      busy: input.captureBusy,
    }),
    statusAnnouncement: input.captureBusy
      ? `Capturing the next card. ${capturedCopies} ${plural} already in this batch.`
      : `${capturedCopies} ${plural} in this sweep batch.`,
  });
}

export type SellerSweepUxState = Readonly<{
  exitGuard: MobileFlowExitGuard;
  exitTitle: string;
  exitMessage: string;
  statusAnnouncement: string;
  prepareAction: MobileFlowActionState;
  commitAction: MobileFlowActionState;
}>;

export function deriveSellerSweepUxState(input: {
  preparing: boolean;
  committing: boolean;
  journalRestoring: boolean;
  journalUnchecked: boolean;
  journalError: boolean;
  reconciliationRequired: boolean;
  committed: boolean;
  proposalReady: boolean;
  reviewIssueCount: number;
  reviewHasChanges: boolean;
}): SellerSweepUxState {
  const reviewIssueCount = assertCount(input.reviewIssueCount, 'review_issue_count');
  const recoveryBusy = input.journalRestoring || input.journalUnchecked;
  const hardBusy = input.preparing || input.committing || recoveryBusy;

  let exitGuard: MobileFlowExitGuard = 'none';
  let exitTitle = 'Leave Seller Sweep?';
  let exitMessage = 'Your scanned cards stay saved on this device.';

  if (hardBusy) {
    exitGuard = 'block';
    exitTitle = input.committing
      ? 'Seller save in progress'
      : input.preparing
        ? 'Preparing seller batch'
        : 'Checking seller recovery';
    exitMessage = 'Stay on this screen until the current safety check finishes.';
  } else if (input.journalError || input.reconciliationRequired) {
    exitGuard = 'confirm';
    exitTitle = 'Seller recovery is still required';
    exitMessage = 'Leave to inventory only. The saved request stays locked on this device and must be verified before another seller batch is started.';
  } else if (input.proposalReady && !input.committed) {
    exitGuard = 'confirm';
    exitTitle = 'Leave the prepared batch?';
    exitMessage = 'Your scans stay saved, but this prepared plan is not committed. You will need to reopen and verify the batch before saving it.';
  } else if (input.reviewHasChanges && !input.committed) {
    exitGuard = 'confirm';
    exitTitle = 'Leave seller review?';
    exitMessage = 'Your scans stay saved, but exact-identity and condition selections may need to be reviewed again.';
  }

  const prepareDisabled = input.preparing
    || input.committing
    || recoveryBusy
    || input.journalError
    || input.reconciliationRequired
    || input.committed
    || input.proposalReady
    || reviewIssueCount > 0;
  const commitDisabled = input.committing
    || recoveryBusy
    || input.journalError
    || input.committed
    || !input.proposalReady;

  const statusAnnouncement = input.committed
    ? 'Seller batch saved and verified against live inventory.'
    : input.journalError
      ? 'Seller changes are paused because the local recovery record needs attention.'
      : recoveryBusy
        ? 'Checking the saved Seller Sweep recovery record.'
        : input.committing
          ? input.reconciliationRequired
            ? 'Verifying the previously saved seller batch.'
            : 'Saving the reviewed seller batch atomically.'
          : input.reconciliationRequired
            ? 'Seller batch may already be saved. Verification is required before another request.'
            : input.preparing
              ? 'Preparing the reviewed seller batch against live inventory.'
              : input.proposalReady
                ? 'Atomic seller batch plan ready. No inventory has changed yet.'
                : reviewIssueCount > 0
                  ? `${reviewIssueCount} seller review ${reviewIssueCount === 1 ? 'check remains' : 'checks remain'}.`
                  : 'All exact identities and conditions are ready to prepare.';

  return Object.freeze({
    exitGuard,
    exitTitle,
    exitMessage,
    statusAnnouncement,
    prepareAction: Object.freeze({
      label: input.preparing
        ? 'Preparing seller batch'
        : input.committed
          ? 'Seller batch saved'
          : input.reconciliationRequired
            ? 'Seller batch verification required'
            : input.proposalReady
              ? 'Seller batch plan ready'
              : 'Prepare reviewed seller batch',
      hint: input.reconciliationRequired
        ? 'Verify the saved request before preparing another batch.'
        : input.proposalReady
          ? 'Use the atomic save action to commit this exact reviewed plan.'
          : reviewIssueCount > 0
            ? `Complete ${reviewIssueCount} remaining review ${reviewIssueCount === 1 ? 'check' : 'checks'} first.`
            : 'Checks live inventory and creates a reviewable plan without changing it.',
      disabled: prepareDisabled,
      busy: input.preparing,
    }),
    commitAction: Object.freeze({
      label: recoveryBusy
        ? 'Checking Seller Sweep recovery'
        : input.committing
          ? input.reconciliationRequired
            ? 'Verifying saved seller batch'
            : 'Saving seller batch atomically'
          : input.committed
            ? 'Seller batch saved and verified'
            : input.reconciliationRequired
              ? 'Verify saved seller batch'
              : 'Save seller batch atomically',
      hint: input.reconciliationRequired
        ? 'Safely reuses the same request ID and payload to verify whether it was saved.'
        : 'Writes the reviewed inventory movements as one atomic transaction.',
      disabled: commitDisabled,
      busy: input.committing || recoveryBusy,
    }),
  });
}

export type PregradeCaptureUxState = Readonly<{
  exitGuard: MobileFlowExitGuard;
  exitTitle: string;
  exitMessage: string;
  statusAnnouncement: string;
  captureAction: MobileFlowActionState;
  submitAction: MobileFlowActionState;
}>;

export function derivePregradeCaptureUxState(input: {
  capturedViewCount: number;
  requiredViewCount: number;
  currentViewNumber: number;
  currentViewLabel: string;
  capturing: boolean;
  submitting: boolean;
  gradingJobId: string | null;
  resultReady: boolean;
}): PregradeCaptureUxState {
  const capturedViewCount = assertCount(input.capturedViewCount, 'captured_view_count');
  const requiredViewCount = assertCount(input.requiredViewCount, 'required_view_count');
  const currentViewNumber = assertCount(input.currentViewNumber, 'current_view_number');
  if (requiredViewCount === 0 || capturedViewCount > requiredViewCount) {
    throw new Error('pregrade_view_count_invalid');
  }
  if (currentViewNumber === 0 || currentViewNumber > requiredViewCount) {
    throw new Error('pregrade_current_view_invalid');
  }
  const currentViewLabel = input.currentViewLabel.trim();
  if (!currentViewLabel) throw new Error('pregrade_current_view_label_invalid');

  const durableJob = Boolean(input.gradingJobId);
  const persisting = input.submitting && !durableJob;
  const captureComplete = capturedViewCount === requiredViewCount;
  const exitGuard: MobileFlowExitGuard = input.submitting || input.capturing
    ? 'block'
    : capturedViewCount > 0 && !durableJob && !input.resultReady
      ? 'confirm'
      : 'none';

  const statusAnnouncement = input.resultReady
    ? 'Pre-grade result ready.'
    : persisting
      ? 'Saving the private evidence bundle and creating the pre-grade job. Stay on this screen.'
      : input.submitting && durableJob
        ? 'Pre-grade processing is still running on this device. Keep this screen open until the result is saved.'
        : input.capturing
          ? `Capturing ${currentViewLabel}, view ${currentViewNumber} of ${requiredViewCount}.`
          : durableJob
            ? 'Pre-grade job already saved. Replace an evidence view to create a new submission.'
          : captureComplete
            ? `All ${requiredViewCount} evidence views captured. Ready to submit pre-grade.`
            : `${capturedViewCount} of ${requiredViewCount} evidence views captured. Current step ${currentViewNumber}: ${currentViewLabel}.`;

  return Object.freeze({
    exitGuard,
    exitTitle: input.submitting
      ? durableJob ? 'Pre-grade still processing' : 'Saving pre-grade evidence'
      : input.capturing
        ? 'Capture in progress'
        : 'Discard captured evidence?',
    exitMessage: input.submitting
      ? durableJob
        ? 'Stackr has no background grading worker yet. Stay here until the provider result or failure status is saved.'
        : 'Stay on this screen until the private evidence bundle and job record are safely created.'
      : input.capturing
        ? 'Stay on this screen until the current evidence photo finishes saving.'
      : `${capturedViewCount} unsaved evidence ${capturedViewCount === 1 ? 'view' : 'views'} will be discarded if you leave now.`,
    statusAnnouncement,
    captureAction: Object.freeze({
      label: input.capturing
        ? `Capturing ${currentViewLabel}`
        : `Capture ${currentViewLabel}, view ${currentViewNumber} of ${requiredViewCount}`,
      hint: input.submitting
        ? 'Capture is unavailable while the pre-grade is being submitted.'
        : durableJob
          ? 'Capturing a replacement view starts a new evidence revision without changing the completed job.'
        : 'Replaces this view if it was already captured, then advances to the next missing view.',
      disabled: input.capturing || input.submitting,
      busy: input.capturing,
    }),
    submitAction: Object.freeze({
      label: input.submitting
        ? durableJob ? 'Pre-grade processing' : 'Saving pre-grade evidence'
        : durableJob
          ? 'Pre-grade already submitted'
        : captureComplete
          ? 'Submit full pre-grade'
          : `${capturedViewCount} of ${requiredViewCount} evidence views captured`,
      hint: durableJob
        ? 'Replace at least one evidence view to create a new pre-grade submission.'
        : captureComplete
        ? 'Saves all evidence views privately before creating the pre-grade job.'
        : `Capture ${requiredViewCount - capturedViewCount} more ${requiredViewCount - capturedViewCount === 1 ? 'view' : 'views'} before submitting.`,
      disabled: input.submitting || durableJob || !captureComplete,
      busy: input.submitting,
    }),
  });
}
