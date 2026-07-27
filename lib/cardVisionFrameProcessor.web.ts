import type { Frame } from './visionCamera';
import type { CardFrameAnalyserGuide } from './cardVisionFrameAnalyser';

export type StackrCardFrameProcessorOptions = {
  scanId: string;
  minIntervalMs: number;
  guide?: CardFrameAnalyserGuide;
};

export const STACKR_CARD_FRAME_PROCESSOR_TARGET_FPS = 8;
export const STACKR_CARD_FRAME_ANALYSIS_INTERVAL_MS = 125;

export function isStackrCardFrameAnalyserPluginAvailable(): boolean {
  return false;
}

export function analyseStackrCardFrame(
  _frame: Frame,
  _options: StackrCardFrameProcessorOptions
): undefined {
  return undefined;
}
