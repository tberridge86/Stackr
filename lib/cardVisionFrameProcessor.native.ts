import { VisionCameraProxy, type Frame } from './visionCamera';
import type { CardFrameAnalyserGuide } from './cardVisionFrameAnalyser';

type BasicFrameProcessorParameter = string | number | boolean | undefined | ArrayBuffer;
type FrameProcessorParameter =
  | BasicFrameProcessorParameter
  | BasicFrameProcessorParameter[]
  | Record<string, BasicFrameProcessorParameter | undefined>;

export type StackrCardFrameProcessorOptions = {
  scanId: string;
  minIntervalMs: number;
  guide?: CardFrameAnalyserGuide;
};

type StackrCardFrameAnalyserPlugin = {
  call: (frame: Frame, options?: Record<string, FrameProcessorParameter>) => FrameProcessorParameter;
};

export const STACKR_CARD_FRAME_PROCESSOR_TARGET_FPS = 8;
export const STACKR_CARD_FRAME_ANALYSIS_INTERVAL_MS = 125;

const stackrCardFrameAnalyserPlugin = (() => {
  try {
    return VisionCameraProxy.initFrameProcessorPlugin('stackrCardFrameAnalyser', {}) as
      | StackrCardFrameAnalyserPlugin
      | undefined;
  } catch {
    return undefined;
  }
})();

export function isStackrCardFrameAnalyserPluginAvailable(): boolean {
  return stackrCardFrameAnalyserPlugin != null;
}

export function analyseStackrCardFrame(
  frame: Frame,
  options: StackrCardFrameProcessorOptions
): FrameProcessorParameter {
  'worklet';

  if (stackrCardFrameAnalyserPlugin == null) {
    return undefined;
  }

  const guide = options.guide;
  return stackrCardFrameAnalyserPlugin.call(frame, {
    scanId: options.scanId,
    minIntervalMs: options.minIntervalMs,
    guide: guide
      ? {
          x: guide.x,
          y: guide.y,
          width: guide.width,
          height: guide.height,
        }
      : undefined,
  });
}
