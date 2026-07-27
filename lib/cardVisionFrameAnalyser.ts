export type CardFrameAnalyserFailureReason =
  | 'NO_CARD'
  | 'MULTIPLE_CARDS'
  | 'LOW_FILL'
  | 'ASPECT_RATIO'
  | 'BLUR'
  | 'GLARE'
  | 'UNDEREXPOSED'
  | 'OVEREXPOSED'
  | 'PERSPECTIVE'
  | 'CORNER_OCCLUDED'
  | 'EDGE_CLIPPED'
  | 'LOW_CONFIDENCE_RECTANGLE'
  | 'NON_CARD_RECTANGLE';

export const CARD_FRAME_ANALYSER_FAILURE_REASON_ORDER: readonly CardFrameAnalyserFailureReason[] = [
  'NO_CARD',
  'MULTIPLE_CARDS',
  'LOW_FILL',
  'ASPECT_RATIO',
  'BLUR',
  'GLARE',
  'UNDEREXPOSED',
  'OVEREXPOSED',
  'PERSPECTIVE',
  'CORNER_OCCLUDED',
  'EDGE_CLIPPED',
  'LOW_CONFIDENCE_RECTANGLE',
  'NON_CARD_RECTANGLE',
];

export type CardFrameAnalyserPoint = {
  x: number;
  y: number;
};

export type CardFrameAnalyserCorners = {
  topLeft: CardFrameAnalyserPoint;
  topRight: CardFrameAnalyserPoint;
  bottomRight: CardFrameAnalyserPoint;
  bottomLeft: CardFrameAnalyserPoint;
};

export type CardFrameAnalyserGuide = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CardFrameAnalyserQualityConfig = {
  version: string;
  expectedCardAspectRatio: number;
  aspectTolerance: number;
  minDetectionAreaRatio: number;
  minQualityFillRatio: number;
  minAspectRatioScore: number;
  minBlurScore: number;
  maxGlareRatio: number;
  maxUnderexposureRatio: number;
  maxOverexposureRatio: number;
  minPerspectiveScore: number;
  minCornerEdgeSupportRatio: number;
  minCornerMeanLuminance: number;
  maxCornerMeanLuminance: number;
  edgeClipMarginRatio: number;
  minEdgeGradient: number;
  maxPlausibleCards: number;
};

export type LuminanceFrameInput = {
  width: number;
  height: number;
  luminance: Uint8Array;
  rowStride?: number;
  guide?: CardFrameAnalyserGuide;
};

export type CardFrameAnalysisResult = {
  cardDetected: boolean;
  corners: CardFrameAnalyserCorners | null;
  fillRatio: number;
  aspectRatioScore: number;
  blurScore: number;
  glareRatio: number;
  underexposureRatio: number;
  overexposureRatio: number;
  perspectiveScore: number;
  allCornersVisible: boolean;
  edgeClipped: boolean;
  qualityAccepted: boolean;
  failureReasons: CardFrameAnalyserFailureReason[];
  processingMs: number;
};

type EdgeComponent = {
  edgeCount: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  points: number[];
};

const MAX_U8 = 255;

export const STACKR_CARD_FRAME_ANALYSER_CONFIG_VERSION = 'stackr-card-frame-analyser-v1.0.0';

export const DEFAULT_CARD_FRAME_ANALYSER_CONFIG: CardFrameAnalyserQualityConfig = {
  version: STACKR_CARD_FRAME_ANALYSER_CONFIG_VERSION,
  expectedCardAspectRatio: 0.716,
  aspectTolerance: 0.18,
  minDetectionAreaRatio: 0.08,
  minQualityFillRatio: 0.34,
  minAspectRatioScore: 0.6,
  minBlurScore: 0.32,
  maxGlareRatio: 0.08,
  maxUnderexposureRatio: 0.45,
  maxOverexposureRatio: 0.28,
  minPerspectiveScore: 0.62,
  minCornerEdgeSupportRatio: 0.035,
  minCornerMeanLuminance: 42,
  maxCornerMeanLuminance: 238,
  edgeClipMarginRatio: 0.025,
  minEdgeGradient: 18,
  maxPlausibleCards: 1,
};

const nowMs = () => {
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now();
  }
  return Date.now();
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const finiteOrZero = (value: number) => (Number.isFinite(value) ? value : 0);

const luminanceAt = (frame: LuminanceFrameInput, x: number, y: number) => {
  const rowStride = frame.rowStride ?? frame.width;
  return frame.luminance[y * rowStride + x] ?? 0;
};

const defaultGuide = (): CardFrameAnalyserGuide => ({
  x: 0,
  y: 0,
  width: 1,
  height: 1,
});

const normalizeGuide = (guide?: CardFrameAnalyserGuide): CardFrameAnalyserGuide => {
  if (!guide) return defaultGuide();
  return {
    x: clamp01(guide.x),
    y: clamp01(guide.y),
    width: clamp01(guide.width),
    height: clamp01(guide.height),
  };
};

const pushReason = (
  reasons: Set<CardFrameAnalyserFailureReason>,
  condition: boolean,
  reason: CardFrameAnalyserFailureReason
) => {
  if (condition) reasons.add(reason);
};

const orderedReasons = (reasons: Set<CardFrameAnalyserFailureReason>) =>
  CARD_FRAME_ANALYSER_FAILURE_REASON_ORDER.filter((reason) => reasons.has(reason));

const emptyResult = (
  startedAt: number,
  reasons: Iterable<CardFrameAnalyserFailureReason>
): CardFrameAnalysisResult => ({
  cardDetected: false,
  corners: null,
  fillRatio: 0,
  aspectRatioScore: 0,
  blurScore: 0,
  glareRatio: 0,
  underexposureRatio: 0,
  overexposureRatio: 0,
  perspectiveScore: 0,
  allCornersVisible: false,
  edgeClipped: false,
  qualityAccepted: false,
  failureReasons: orderedReasons(new Set(reasons)),
  processingMs: finiteOrZero(nowMs() - startedAt),
});

function buildGradientAndEdges(
  frame: LuminanceFrameInput,
  config: CardFrameAnalyserQualityConfig
): { gradients: Uint8Array; edges: Uint8Array; focusScore: number } {
  const { width, height } = frame;
  const gradients = new Uint8Array(width * height);
  const edges = new Uint8Array(width * height);
  const samples: number[] = [];
  let gradientSum = 0;
  let sampleCount = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const topLeft = luminanceAt(frame, x - 1, y - 1);
      const top = luminanceAt(frame, x, y - 1);
      const topRight = luminanceAt(frame, x + 1, y - 1);
      const left = luminanceAt(frame, x - 1, y);
      const right = luminanceAt(frame, x + 1, y);
      const bottomLeft = luminanceAt(frame, x - 1, y + 1);
      const bottom = luminanceAt(frame, x, y + 1);
      const bottomRight = luminanceAt(frame, x + 1, y + 1);
      const gx = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight;
      const gy = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;
      const magnitude = Math.min(MAX_U8, Math.round((Math.abs(gx) + Math.abs(gy)) / 4));
      const index = y * width + x;
      gradients[index] = magnitude;
      if (magnitude > 0) {
        samples.push(magnitude);
        gradientSum += magnitude;
        sampleCount += 1;
      }
    }
  }

  const meanGradient = sampleCount > 0 ? gradientSum / sampleCount : 0;
  const edgeThreshold = Math.min(88, Math.max(config.minEdgeGradient, meanGradient * 1.1));

  for (let index = 0; index < gradients.length; index += 1) {
    edges[index] = gradients[index] >= edgeThreshold ? 1 : 0;
  }

  samples.sort((a, b) => b - a);
  const topCount = Math.max(1, Math.floor(samples.length * 0.12));
  const topSum = samples.slice(0, topCount).reduce((sum, value) => sum + value, 0);
  const focusScore = topCount > 0 ? clamp01(topSum / topCount / MAX_U8) : 0;

  return { gradients, edges, focusScore };
}

function collectComponents(width: number, height: number, edges: Uint8Array): EdgeComponent[] {
  const visited = new Uint8Array(edges.length);
  const components: EdgeComponent[] = [];
  const queue: number[] = [];

  for (let start = 0; start < edges.length; start += 1) {
    if (edges[start] === 0 || visited[start] === 1) continue;

    visited[start] = 1;
    queue.length = 0;
    queue.push(start);
    let cursor = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const points: number[] = [];

    while (cursor < queue.length) {
      const index = queue[cursor];
      cursor += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      points.push(index);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nextIndex = ny * width + nx;
          if (edges[nextIndex] === 0 || visited[nextIndex] === 1) continue;
          visited[nextIndex] = 1;
          queue.push(nextIndex);
        }
      }
    }

    components.push({
      edgeCount: points.length,
      minX,
      minY,
      maxX,
      maxY,
      points,
    });
  }

  return components;
}

function boxIntersectionOverUnion(left: EdgeComponent, right: EdgeComponent) {
  const intersectionWidth = Math.max(0, Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX) + 1);
  const intersectionHeight = Math.max(0, Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY) + 1);
  const intersection = intersectionWidth * intersectionHeight;
  const leftArea = (left.maxX - left.minX + 1) * (left.maxY - left.minY + 1);
  const rightArea = (right.maxX - right.minX + 1) * (right.maxY - right.minY + 1);
  return intersection / Math.max(1, leftArea + rightArea - intersection);
}

function removeNestedComponents(components: EdgeComponent[]) {
  const distinct: EdgeComponent[] = [];
  for (const component of components) {
    const overlapsExisting = distinct.some((accepted) => boxIntersectionOverUnion(accepted, component) >= 0.72);
    if (!overlapsExisting) distinct.push(component);
  }
  return distinct;
}

function polygonArea(corners: CardFrameAnalyserCorners) {
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function distance(
  a: CardFrameAnalyserPoint,
  b: CardFrameAnalyserPoint,
  frameWidth = 1,
  frameHeight = 1
) {
  return Math.hypot((a.x - b.x) * frameWidth, (a.y - b.y) * frameHeight);
}

function angleScore(
  a: CardFrameAnalyserPoint,
  b: CardFrameAnalyserPoint,
  c: CardFrameAnalyserPoint,
  frameWidth = 1,
  frameHeight = 1
) {
  const ux = (a.x - b.x) * frameWidth;
  const uy = (a.y - b.y) * frameHeight;
  const vx = (c.x - b.x) * frameWidth;
  const vy = (c.y - b.y) * frameHeight;
  const denominator = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (denominator <= 0) return 0;
  return clamp01(1 - Math.abs((ux * vx + uy * vy) / denominator));
}

function componentCorners(component: EdgeComponent, width: number, height: number): CardFrameAnalyserCorners {
  let topLeft = { score: Number.POSITIVE_INFINITY, x: component.minX, y: component.minY };
  let topRight = { score: Number.NEGATIVE_INFINITY, x: component.maxX, y: component.minY };
  let bottomRight = { score: Number.NEGATIVE_INFINITY, x: component.maxX, y: component.maxY };
  let bottomLeft = { score: Number.POSITIVE_INFINITY, x: component.minX, y: component.maxY };

  for (const index of component.points) {
    const x = index % width;
    const y = Math.floor(index / width);
    const sum = x + y;
    const diff = x - y;
    if (sum < topLeft.score) topLeft = { score: sum, x, y };
    if (diff > topRight.score) topRight = { score: diff, x, y };
    if (sum > bottomRight.score) bottomRight = { score: sum, x, y };
    if (diff < bottomLeft.score) bottomLeft = { score: diff, x, y };
  }

  return {
    topLeft: { x: clamp01(topLeft.x / (width - 1)), y: clamp01(topLeft.y / (height - 1)) },
    topRight: { x: clamp01(topRight.x / (width - 1)), y: clamp01(topRight.y / (height - 1)) },
    bottomRight: { x: clamp01(bottomRight.x / (width - 1)), y: clamp01(bottomRight.y / (height - 1)) },
    bottomLeft: { x: clamp01(bottomLeft.x / (width - 1)), y: clamp01(bottomLeft.y / (height - 1)) },
  };
}

function exposureRatios(frame: LuminanceFrameInput, component: EdgeComponent | null) {
  const minX = component?.minX ?? 0;
  const minY = component?.minY ?? 0;
  const maxX = component?.maxX ?? frame.width - 1;
  const maxY = component?.maxY ?? frame.height - 1;
  let glare = 0;
  let under = 0;
  let over = 0;
  let total = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const value = luminanceAt(frame, x, y);
      if (value >= 248) glare += 1;
      if (value <= 35) under += 1;
      if (value >= 238) over += 1;
      total += 1;
    }
  }

  return {
    glareRatio: total > 0 ? glare / total : 0,
    underexposureRatio: total > 0 ? under / total : 0,
    overexposureRatio: total > 0 ? over / total : 0,
  };
}

function cornerVisibility(
  frame: LuminanceFrameInput,
  edges: Uint8Array,
  corners: CardFrameAnalyserCorners,
  config: CardFrameAnalyserQualityConfig
) {
  const radius = Math.max(4, Math.round(Math.min(frame.width, frame.height) * 0.045));
  const pixelCorners = Object.values(corners).map((corner) => ({
    x: Math.round(corner.x * (frame.width - 1)),
    y: Math.round(corner.y * (frame.height - 1)),
  }));

  return pixelCorners.every((corner) => {
    let edgeCount = 0;
    let total = 0;
    let luminanceSum = 0;

    for (let y = Math.max(0, corner.y - radius); y <= Math.min(frame.height - 1, corner.y + radius); y += 1) {
      for (let x = Math.max(0, corner.x - radius); x <= Math.min(frame.width - 1, corner.x + radius); x += 1) {
        if (Math.hypot(x - corner.x, y - corner.y) > radius) continue;
        const index = y * frame.width + x;
        edgeCount += edges[index] === 1 ? 1 : 0;
        luminanceSum += luminanceAt(frame, x, y);
        total += 1;
      }
    }

    const edgeSupportRatio = total > 0 ? edgeCount / total : 0;
    const meanLuminance = total > 0 ? luminanceSum / total : 0;
    return (
      edgeSupportRatio >= config.minCornerEdgeSupportRatio &&
      meanLuminance >= config.minCornerMeanLuminance &&
      meanLuminance <= config.maxCornerMeanLuminance
    );
  });
}

function edgeClipped(
  corners: CardFrameAnalyserCorners,
  component: EdgeComponent,
  width: number,
  height: number,
  guide: CardFrameAnalyserGuide,
  config: CardFrameAnalyserQualityConfig
) {
  const margin = config.edgeClipMarginRatio;
  const touchesFrame =
    component.minX <= width * margin ||
    component.minY <= height * margin ||
    component.maxX >= width * (1 - margin) ||
    component.maxY >= height * (1 - margin);
  const outsideGuide = Object.values(corners).some((corner) => (
    corner.x <= guide.x + margin ||
    corner.y <= guide.y + margin ||
    corner.x >= guide.x + guide.width - margin ||
    corner.y >= guide.y + guide.height - margin
  ));
  return touchesFrame || outsideGuide;
}

function calculateGeometry(
  corners: CardFrameAnalyserCorners,
  guide: CardFrameAnalyserGuide,
  frameWidth: number,
  frameHeight: number,
  config: CardFrameAnalyserQualityConfig
) {
  const top = distance(corners.topLeft, corners.topRight, frameWidth, frameHeight);
  const right = distance(corners.topRight, corners.bottomRight, frameWidth, frameHeight);
  const bottom = distance(corners.bottomLeft, corners.bottomRight, frameWidth, frameHeight);
  const left = distance(corners.topLeft, corners.bottomLeft, frameWidth, frameHeight);
  const shortSide = (top + bottom) / 2;
  const longSide = (left + right) / 2;
  const ratio = longSide > 0 ? shortSide / longSide : 0;
  const area = polygonArea(corners);
  const guideArea = Math.max(0.01, guide.width * guide.height);
  const sideBalance =
    (Math.min(top, bottom) / Math.max(top, bottom, 0.0001)) *
    (Math.min(left, right) / Math.max(left, right, 0.0001));
  const orthogonal =
    (angleScore(corners.topRight, corners.topLeft, corners.bottomLeft, frameWidth, frameHeight) +
      angleScore(corners.topLeft, corners.topRight, corners.bottomRight, frameWidth, frameHeight) +
      angleScore(corners.topRight, corners.bottomRight, corners.bottomLeft, frameWidth, frameHeight) +
      angleScore(corners.topLeft, corners.bottomLeft, corners.bottomRight, frameWidth, frameHeight)) /
    4;

  return {
    fillRatio: clamp01(area / guideArea),
    aspectRatioScore: clamp01(
      1 - Math.abs(ratio - config.expectedCardAspectRatio) / config.aspectTolerance
    ),
    perspectiveScore: clamp01(sideBalance * orthogonal),
  };
}

export function analyzeLuminanceFrame(
  input: LuminanceFrameInput,
  config: CardFrameAnalyserQualityConfig = DEFAULT_CARD_FRAME_ANALYSER_CONFIG
): CardFrameAnalysisResult {
  const startedAt = nowMs();
  if (
    input.width < 8 ||
    input.height < 8 ||
    input.luminance.length < (input.rowStride ?? input.width) * input.height
  ) {
    return emptyResult(startedAt, ['NO_CARD']);
  }

  const guide = normalizeGuide(input.guide);
  const { edges, focusScore } = buildGradientAndEdges(input, config);
  const components = collectComponents(input.width, input.height, edges)
    .filter((component) => component.edgeCount >= 24)
    .sort((a, b) => b.edgeCount - a.edgeCount);

  const plausibleComponents = removeNestedComponents(components.filter((component) => {
    const boxWidth = component.maxX - component.minX + 1;
    const boxHeight = component.maxY - component.minY + 1;
    const area = (boxWidth * boxHeight) / (input.width * input.height);
    const boxAspect = Math.min(boxWidth, boxHeight) / Math.max(boxWidth, boxHeight, 0.0001);
    return area >= config.minDetectionAreaRatio && boxAspect >= 0.42 && boxAspect <= 0.92;
  }));

  if (plausibleComponents.length > config.maxPlausibleCards) {
    const exposure = exposureRatios(input, null);
    return {
      ...emptyResult(startedAt, ['MULTIPLE_CARDS']),
      blurScore: finiteOrZero(focusScore),
      glareRatio: finiteOrZero(exposure.glareRatio),
      underexposureRatio: finiteOrZero(exposure.underexposureRatio),
      overexposureRatio: finiteOrZero(exposure.overexposureRatio),
    };
  }

  const candidate = plausibleComponents[0] ?? components[0] ?? null;
  if (!candidate) {
    const exposure = exposureRatios(input, null);
    return {
      ...emptyResult(startedAt, ['NO_CARD']),
      blurScore: finiteOrZero(focusScore),
      glareRatio: finiteOrZero(exposure.glareRatio),
      underexposureRatio: finiteOrZero(exposure.underexposureRatio),
      overexposureRatio: finiteOrZero(exposure.overexposureRatio),
    };
  }

  const corners = componentCorners(candidate, input.width, input.height);
  const geometry = calculateGeometry(corners, guide, input.width - 1, input.height - 1, config);
  const exposure = exposureRatios(input, candidate);
  const clipped = edgeClipped(corners, candidate, input.width, input.height, guide, config);
  const visibleCorners =
    cornerVisibility(input, edges, corners, config) &&
    geometry.aspectRatioScore >= config.minAspectRatioScore;
  const reasons = new Set<CardFrameAnalyserFailureReason>();

  const boundingArea = ((candidate.maxX - candidate.minX + 1) * (candidate.maxY - candidate.minY + 1)) /
    (input.width * input.height);
  const probablyNonCard =
    plausibleComponents.length === 0 ||
    boundingArea < config.minDetectionAreaRatio ||
    geometry.aspectRatioScore <= 0.08;

  pushReason(reasons, probablyNonCard, 'NON_CARD_RECTANGLE');
  pushReason(reasons, geometry.fillRatio < config.minQualityFillRatio, 'LOW_FILL');
  pushReason(reasons, geometry.aspectRatioScore < config.minAspectRatioScore, 'ASPECT_RATIO');
  pushReason(reasons, focusScore < config.minBlurScore, 'BLUR');
  pushReason(reasons, exposure.glareRatio > config.maxGlareRatio, 'GLARE');
  pushReason(reasons, exposure.underexposureRatio > config.maxUnderexposureRatio, 'UNDEREXPOSED');
  pushReason(reasons, exposure.overexposureRatio > config.maxOverexposureRatio, 'OVEREXPOSED');
  pushReason(reasons, geometry.perspectiveScore < config.minPerspectiveScore, 'PERSPECTIVE');
  pushReason(reasons, !visibleCorners, 'CORNER_OCCLUDED');
  pushReason(reasons, clipped, 'EDGE_CLIPPED');
  pushReason(reasons, candidate.edgeCount < 36, 'LOW_CONFIDENCE_RECTANGLE');

  const finalReasons = orderedReasons(reasons);
  const cardDetected = !probablyNonCard;

  return {
    cardDetected,
    corners: cardDetected ? corners : null,
    fillRatio: finiteOrZero(geometry.fillRatio),
    aspectRatioScore: finiteOrZero(geometry.aspectRatioScore),
    blurScore: finiteOrZero(focusScore),
    glareRatio: finiteOrZero(exposure.glareRatio),
    underexposureRatio: finiteOrZero(exposure.underexposureRatio),
    overexposureRatio: finiteOrZero(exposure.overexposureRatio),
    perspectiveScore: finiteOrZero(geometry.perspectiveScore),
    allCornersVisible: visibleCorners,
    edgeClipped: clipped,
    qualityAccepted: cardDetected && finalReasons.length === 0,
    failureReasons: finalReasons,
    processingMs: finiteOrZero(nowMs() - startedAt),
  };
}
