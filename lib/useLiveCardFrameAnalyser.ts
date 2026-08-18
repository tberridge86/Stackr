import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STACKR_CARD_FRAME_ANALYSIS_INTERVAL_MS,
  STACKR_CARD_FRAME_PROCESSOR_TARGET_FPS,
  analyseStackrCardFrame,
  isStackrCardFrameAnalyserPluginAvailable,
} from './cardVisionFrameProcessor';
import type {
  CardFrameAnalyserCorners,
  CardFrameAnalyserGuide,
  CardFrameAnalysisResult,
} from './cardVisionFrameAnalyser';
import {
  addCardFrameAnalysisListener,
  getCardVisionRuntimeInfo,
  recordCardFrameAnalyserFocusFailure,
  resetCardFrameAnalyserInstrumentation,
  type CardFrameAnalyserInstrumentation,
  type StackrCardVisionRuntimeInfo,
} from './stackrCardVision';
import {
  LIVE_CARD_STABILITY_REQUIRED_FRAMES,
  calculateCornerMovement,
  getLiveCardGuidance,
  getNextStableFrameCount,
  isStableCornerMovement,
  type LiveCardGuidance,
} from './liveCardGuidance';
import { stackrHaptics } from './haptics';
import { runAtTargetFps, useFrameProcessor, type FrameProcessor } from './visionCamera';

export type CaptureSource = 'auto' | 'manual';

export type UseLiveCardFrameAnalyserOptions = {
  enabled: boolean;
  scanId: string;
  guide: CardFrameAnalyserGuide;
  autoCaptureEnabled: boolean;
  captureInProgress: boolean;
  onStableCapture: () => void | Promise<void>;
  requiredStableFrames?: number;
  minIntervalMs?: number;
};

export type UseLiveCardFrameAnalyserResult = {
  analyserAvailable: boolean;
  runtimeInfo: StackrCardVisionRuntimeInfo;
  frameProcessor?: FrameProcessor;
  latestResult: CardFrameAnalysisResult | null;
  guidance: LiveCardGuidance;
  stableFrameCount: number;
  instrumentation: CardFrameAnalyserInstrumentation;
  recordFocusFailure: () => void;
  recordCapture: (source: CaptureSource) => void;
};

const emptyInstrumentation = (): CardFrameAnalyserInstrumentation => ({
  scanId: null,
  analysisFramesReceived: 0,
  framesProcessed: 0,
  framesDropped: 0,
  focusFailures: 0,
  analyserP50Ms: 0,
  analyserP95Ms: 0,
  timeToStableCaptureMs: null,
  captureSource: null,
});

export function useLiveCardFrameAnalyser({
  enabled,
  scanId,
  guide,
  autoCaptureEnabled,
  captureInProgress,
  onStableCapture,
  requiredStableFrames = LIVE_CARD_STABILITY_REQUIRED_FRAMES,
  minIntervalMs = STACKR_CARD_FRAME_ANALYSIS_INTERVAL_MS,
}: UseLiveCardFrameAnalyserOptions): UseLiveCardFrameAnalyserResult {
  const [runtimeInfo, setRuntimeInfo] = useState<StackrCardVisionRuntimeInfo>(() => getCardVisionRuntimeInfo());
  const [latestResult, setLatestResult] = useState<CardFrameAnalysisResult | null>(null);
  const [stableFrameCount, setStableFrameCount] = useState(0);
  const [instrumentation, setInstrumentation] = useState<CardFrameAnalyserInstrumentation>(() => (
    emptyInstrumentation()
  ));

  const previousCornersRef = useRef<CardFrameAnalyserCorners | null>(null);
  const stableFrameCountRef = useRef(0);
  const scanStartedAtRef = useRef(Date.now());
  const autoCaptureLockedRef = useRef(false);
  const autoCaptureInFlightRef = useRef(false);
  const onStableCaptureRef = useRef(onStableCapture);
  const autoCaptureEnabledRef = useRef(autoCaptureEnabled);
  const captureInProgressRef = useRef(captureInProgress);

  useEffect(() => {
    onStableCaptureRef.current = onStableCapture;
  }, [onStableCapture]);

  useEffect(() => {
    autoCaptureEnabledRef.current = autoCaptureEnabled;
  }, [autoCaptureEnabled]);

  useEffect(() => {
    captureInProgressRef.current = captureInProgress;
  }, [captureInProgress]);

  useEffect(() => {
    scanStartedAtRef.current = Date.now();
    previousCornersRef.current = null;
    stableFrameCountRef.current = 0;
    autoCaptureLockedRef.current = false;
    autoCaptureInFlightRef.current = false;
    setStableFrameCount(0);
    setLatestResult(null);
    setInstrumentation(resetCardFrameAnalyserInstrumentation());
    setRuntimeInfo(getCardVisionRuntimeInfo());
  }, [scanId]);

  const analyserAvailable = useMemo(
    () => enabled && runtimeInfo.cameraFrameAccessAvailable && isStackrCardFrameAnalyserPluginAvailable(),
    [enabled, runtimeInfo.cameraFrameAccessAvailable]
  );

  const guidance = useMemo(
    () => getLiveCardGuidance({
      analyserAvailable,
      result: latestResult,
      stableFrameCount,
      requiredStableFrames,
      captureInProgress,
      cornerMovement: null,
    }),
    [analyserAvailable, captureInProgress, latestResult, requiredStableFrames, stableFrameCount]
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const subscription = addCardFrameAnalysisListener((event) => {
      if (event.scanId && event.scanId !== scanId) return;

      const result = event.result ?? null;
      const previousStableFrameCount = stableFrameCountRef.current;
      const cornerMovement = calculateCornerMovement(previousCornersRef.current, result?.corners ?? null);
      const nextStableFrameCount = getNextStableFrameCount({
        currentStableFrameCount: previousStableFrameCount,
        result,
        cornerMovement,
      });
      const movementStable = isStableCornerMovement(cornerMovement);

      if (!result?.qualityAccepted || !movementStable) {
        autoCaptureLockedRef.current = false;
      }

      previousCornersRef.current = result?.corners ?? null;
      stableFrameCountRef.current = nextStableFrameCount;
      setLatestResult(result);
      setStableFrameCount(nextStableFrameCount);
      const { result: _result, message: _message, ...eventInstrumentation } = event;
      setInstrumentation((previous) => ({
        ...previous,
        ...eventInstrumentation,
        scanId: event.scanId ?? scanId,
      }));

      if (
        result?.qualityAccepted
        && movementStable
        && previousStableFrameCount < requiredStableFrames
        && nextStableFrameCount >= requiredStableFrames
      ) {
        void stackrHaptics.scannerFrameReady();
      }

      if (
        result?.qualityAccepted &&
        movementStable &&
        nextStableFrameCount >= requiredStableFrames &&
        autoCaptureEnabledRef.current &&
        !captureInProgressRef.current &&
        !autoCaptureLockedRef.current &&
        !autoCaptureInFlightRef.current
      ) {
        autoCaptureLockedRef.current = true;
        autoCaptureInFlightRef.current = true;
        const timeToStableCaptureMs = Date.now() - scanStartedAtRef.current;
        setInstrumentation((previous) => ({
          ...previous,
          timeToStableCaptureMs,
          captureSource: 'auto',
        }));

        Promise.resolve(onStableCaptureRef.current()).finally(() => {
          autoCaptureInFlightRef.current = false;
        });
      }
    });

    return () => subscription.remove();
  }, [enabled, requiredStableFrames, scanId]);

  const analysisEnabled = analyserAvailable && enabled;
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';

    if (!analysisEnabled) {
      return;
    }

    runAtTargetFps(STACKR_CARD_FRAME_PROCESSOR_TARGET_FPS, () => {
      'worklet';
      analyseStackrCardFrame(frame, {
        scanId,
        minIntervalMs,
        guide,
      });
    });
  }, [
    analysisEnabled,
    guide.height,
    guide.width,
    guide.x,
    guide.y,
    minIntervalMs,
    scanId,
  ]);

  const recordFocusFailure = useCallback(() => {
    const nextInstrumentation = recordCardFrameAnalyserFocusFailure();
    setInstrumentation((previous) => ({
      ...previous,
      ...nextInstrumentation,
      scanId: previous.scanId ?? scanId,
      focusFailures: Math.max(previous.focusFailures + 1, nextInstrumentation.focusFailures),
    }));
  }, [scanId]);

  const recordCapture = useCallback((source: CaptureSource) => {
    void stackrHaptics.scannerCaptureLocked();
    setInstrumentation((previous) => ({
      ...previous,
      scanId: previous.scanId ?? scanId,
      captureSource: source,
    }));
  }, [scanId]);

  return {
    analyserAvailable,
    runtimeInfo,
    frameProcessor: analysisEnabled ? frameProcessor : undefined,
    latestResult,
    guidance,
    stableFrameCount,
    instrumentation,
    recordFocusFailure,
    recordCapture,
  };
}