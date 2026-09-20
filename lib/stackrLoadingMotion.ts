/** Shared by the native loading screen and its high-resolution video export. */
export const STACKR_LOADING_TIMING = {
  revealEnd: 2880,
  ready: 3780,
  fadeStart: 4620,
  fadeEnd: 4920,
  loopEnd: 5100,
} as const;

export type LoadingTrack = { inputRange: number[]; outputRange: number[] };

const outCubic = (t: number) => 1 - (1 - t) ** 3;
const inOutCubic = (t: number) => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

function phase(start: number, duration: number, from = 0, to = 1, ease = outCubic): LoadingTrack {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= 24; i += 1) {
    inputRange.push(start + duration * i / 24);
    outputRange.push(from + (to - from) * ease(i / 24));
  }
  return { inputRange, outputRange };
}

export const STACKR_LOADING_TRACKS = {
  frontOpacity: phase(80, 220),
  frontY: { inputRange: [80, 180, 300, 410, 500, 590, 700], outputRange: [-96, -52, -18, -2, 3, 0.8, 0] },
  frontRotation: phase(80, 620, -14, 0),
  rear: phase(600, 540),
  middle: phase(680, 500),
  star: phase(1030, 380),
  lockup: phase(1350, 830, 0, 1, inOutCubic),
  wordmark: phase(1540, 810, 0, 1, inOutCubic),
  tagline: phase(2200, 440),
  sparkles: phase(2500, 380),
  sceneOpacity: phase(STACKR_LOADING_TIMING.fadeStart, 300, 1, 0, inOutCubic),
} satisfies Record<string, LoadingTrack>;

export function loadingTrackValue(track: LoadingTrack, milliseconds: number) {
  const { inputRange, outputRange } = track;
  if (milliseconds <= inputRange[0]) return outputRange[0];
  for (let i = 1; i < inputRange.length; i += 1) {
    if (milliseconds <= inputRange[i]) {
      const t = (milliseconds - inputRange[i - 1]) / (inputRange[i] - inputRange[i - 1]);
      return outputRange[i - 1] + (outputRange[i] - outputRange[i - 1]) * t;
    }
  }
  return outputRange[outputRange.length - 1];
}

export function getStackrLoadingLayout(width: number, height: number, compact = false) {
  const baseMarkHeight = 190;
  const baseMarkWidth = baseMarkHeight * 398 / 420;
  const baseWordmarkHeight = 64;
  const baseWordmarkWidth = baseWordmarkHeight * 957 / 265;
  const baseGap = 12;
  const baseWidth = baseMarkWidth + baseGap + baseWordmarkWidth;
  const baseHeight = 255;
  const scale = Math.max(0.1, Math.min(
    compact ? 0.7 : 1,
    Math.max(1, width - 48) / baseWidth,
    Math.max(1, height - 64) / baseHeight,
  ));
  return {
    scale,
    width: baseWidth * scale,
    height: baseHeight * scale,
    markWidth: baseMarkWidth * scale,
    markHeight: baseMarkHeight * scale,
    wordmarkWidth: baseWordmarkWidth * scale,
    wordmarkHeight: baseWordmarkHeight * scale,
    gap: baseGap * scale,
    taglineSize: 12 * scale,
    taglineHeight: 19 * scale,
    taglineSpacing: 1.45 * scale,
    sparklesWidth: 46 * scale,
    sparklesHeight: 24 * scale,
    auraSize: Math.min(600, Math.max(280, Math.min(width, height) * 1.05)),
  };
}
