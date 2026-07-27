import { Buffer } from 'buffer';
import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';
import {
  clampCropRect,
  expandCropRect,
  quadrilateralBounds,
  rectToQuadrilateral,
  type CapturePoint,
  type CaptureQuadrilateral,
  type CaptureRect,
  type CaptureSize,
} from './captureGeometry';

export type CardLocalisationStatus = 'confident' | 'uncertain' | 'failed';

export type CardLocalisationCornerSource =
  | 'edge-intersections'
  | 'edge-bounds'
  | 'none';

export type CardEdgeCompleteness = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  average: number;
};

export type CardLocalisationConfidence = {
  status: CardLocalisationStatus;
  score: number;
  reasons: string[];
  aspectRatio: number;
  aspectScore: number;
  frameCoverage: number;
  coverageScore: number;
  guideOverlap: number;
  positionScore: number;
  edgeCompleteness: CardEdgeCompleteness;
  convex: boolean;
  cornersDetected: boolean;
  cornerSource: CardLocalisationCornerSource;
};

export type CardLocalisationResult = {
  status: CardLocalisationStatus;
  confidence: CardLocalisationConfidence;
  imageSize: CaptureSize;
  quadrilateral?: CaptureQuadrilateral;
  crop?: CaptureRect;
  transformMatrix?: number[];
  safetyMarginRatio: number;
  sampledAt: string;
  source: 'local-edge';
  requiresManualAdjustment: boolean;
};

export type CardLocalisationOptions = {
  expectedAspectRatio?: number;
  guideRect?: CaptureRect | null;
  minFrameCoverage?: number;
  maxFrameCoverage?: number;
  minEdgeCompleteness?: number;
  safetyMarginRatio?: number;
  analysisStep?: number;
  sampledAt?: string;
};

export type CardLocalisationTrackingOptions = {
  alpha?: number;
  maxCenterShiftRatio?: number;
};

export type PerspectiveCorrectOptions = {
  expectedAspectRatio?: number;
  outputWidth?: number;
  safetyMarginRatio?: number;
  quality?: number;
};

export type PerspectiveCorrectResult = {
  base64: string;
  width: number;
  height: number;
  transformMatrix: number[];
  quadrilateral: CaptureQuadrilateral;
};

type DecodedJpeg = {
  width: number;
  height: number;
  data: Uint8Array;
};

type Homography = [number, number, number, number, number, number, number, number, number];

const DEFAULT_CARD_ASPECT_RATIO = 0.716;
const DEFAULT_SAFETY_MARGIN = 0.025;

function finiteOr(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function stripBase64ImagePrefix(base64: string) {
  return String(base64 ?? '').trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function decodeBase64Jpeg(base64: string): DecodedJpeg {
  const cleanBase64 = stripBase64ImagePrefix(base64);
  if (!cleanBase64) {
    throw new Error('No JPEG base64 image was supplied for localisation.');
  }

  const decoded = decodeJpeg(Buffer.from(cleanBase64, 'base64'), { useTArray: true });
  return {
    width: decoded.width,
    height: decoded.height,
    data: decoded.data,
  };
}

function lumaAt(image: DecodedJpeg, x: number, y: number) {
  const clampedX = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const clampedY = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const index = (clampedY * image.width + clampedX) * 4;
  return image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
}

function sampleRgbaBilinear(image: DecodedJpeg, x: number, y: number) {
  const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(y)));
  const x1 = Math.max(0, Math.min(image.width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(image.height - 1, y0 + 1));
  const dx = clamp01(x - x0);
  const dy = clamp01(y - y0);

  const read = (px: number, py: number, channel: number) => image.data[(py * image.width + px) * 4 + channel];
  const channels = [0, 1, 2, 3].map((channel) => {
    const top = read(x0, y0, channel) * (1 - dx) + read(x1, y0, channel) * dx;
    const bottom = read(x0, y1, channel) * (1 - dx) + read(x1, y1, channel) * dx;
    return Math.round(top * (1 - dy) + bottom * dy);
  });

  return channels as [number, number, number, number];
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

function round(value: number, precision = 4) {
  return Number(value.toFixed(precision));
}

function roundRect(rect: CaptureRect): CaptureRect {
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
  };
}

function roundPoint(point: CapturePoint): CapturePoint {
  return {
    x: round(point.x),
    y: round(point.y),
  };
}

function roundQuad(quad: CaptureQuadrilateral): CaptureQuadrilateral {
  return {
    topLeft: roundPoint(quad.topLeft),
    topRight: roundPoint(quad.topRight),
    bottomRight: roundPoint(quad.bottomRight),
    bottomLeft: roundPoint(quad.bottomLeft),
  };
}

function rectArea(rect: CaptureRect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function rectCenter(rect: CaptureRect): CapturePoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function rectOverlapRatio(rect: CaptureRect, container: CaptureRect) {
  const left = Math.max(rect.x, container.x);
  const top = Math.max(rect.y, container.y);
  const right = Math.min(rect.x + rect.width, container.x + container.width);
  const bottom = Math.min(rect.y + rect.height, container.y + container.height);
  const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
  const area = rectArea(rect);
  return area > 0 ? clamp01(overlap / area) : 0;
}

function getAspectScore(aspectRatio: number, expectedAspectRatio: number) {
  const portraitError = Math.abs(aspectRatio - expectedAspectRatio) / expectedAspectRatio;
  const landscapeAspect = 1 / expectedAspectRatio;
  const landscapeError = Math.abs(aspectRatio - landscapeAspect) / landscapeAspect;
  const bestError = Math.min(portraitError, landscapeError);
  return clamp01(1 - bestError / 0.34);
}

function getCoverageScore(coverage: number, minFrameCoverage: number, maxFrameCoverage: number) {
  if (coverage < minFrameCoverage) return clamp01((coverage / Math.max(0.001, minFrameCoverage)) * 0.86);
  if (coverage > maxFrameCoverage) return clamp01(1 - (coverage - maxFrameCoverage) / Math.max(0.001, 1 - maxFrameCoverage));
  return 1;
}

function getPositionScore(rect: CaptureRect, guideRect: CaptureRect) {
  const candidateCenter = rectCenter(rect);
  const guideCenter = rectCenter(guideRect);
  const distance = Math.hypot(candidateCenter.x - guideCenter.x, candidateCenter.y - guideCenter.y);
  const maxDistance = Math.max(1, Math.min(guideRect.width, guideRect.height) * 0.42);
  return clamp01(1 - distance / maxDistance);
}

function sideCompleteness(
  points: CapturePoint[],
  rect: CaptureRect,
  side: 'top' | 'right' | 'bottom' | 'left',
  tolerance: number,
  step: number
) {
  const bins = new Set<number>();
  const expectedSpan = side === 'top' || side === 'bottom' ? rect.width : rect.height;
  const expectedBins = Math.max(1, Math.ceil(expectedSpan / Math.max(1, step * 2.2)));

  for (const point of points) {
    if (side === 'top' && Math.abs(point.y - rect.y) <= tolerance) {
      bins.add(Math.floor((point.x - rect.x) / Math.max(1, step * 2.2)));
    }
    if (side === 'bottom' && Math.abs(point.y - (rect.y + rect.height)) <= tolerance) {
      bins.add(Math.floor((point.x - rect.x) / Math.max(1, step * 2.2)));
    }
    if (side === 'left' && Math.abs(point.x - rect.x) <= tolerance) {
      bins.add(Math.floor((point.y - rect.y) / Math.max(1, step * 2.2)));
    }
    if (side === 'right' && Math.abs(point.x - (rect.x + rect.width)) <= tolerance) {
      bins.add(Math.floor((point.y - rect.y) / Math.max(1, step * 2.2)));
    }
  }

  return clamp01(bins.size / expectedBins);
}

function getEdgeCompleteness(points: CapturePoint[], rect: CaptureRect, step: number): CardEdgeCompleteness {
  const tolerance = Math.max(step * 2, Math.min(rect.width, rect.height) * 0.065);
  const top = sideCompleteness(points, rect, 'top', tolerance, step);
  const right = sideCompleteness(points, rect, 'right', tolerance, step);
  const bottom = sideCompleteness(points, rect, 'bottom', tolerance, step);
  const left = sideCompleteness(points, rect, 'left', tolerance, step);
  return {
    top: round(top, 3),
    right: round(right, 3),
    bottom: round(bottom, 3),
    left: round(left, 3),
    average: round((top + right + bottom + left) / 4, 3),
  };
}

type XOnYLine = { slope: number; intercept: number; sampleCount: number };
type YOnXLine = { slope: number; intercept: number; sampleCount: number };

function fitLine(samples: CapturePoint[], dependent: 'x' | 'y'): XOnYLine | YOnXLine | null {
  if (samples.length < 4) return null;
  const independentValues = samples.map((point) => dependent === 'x' ? point.y : point.x);
  const dependentValues = samples.map((point) => dependent === 'x' ? point.x : point.y);
  const meanIndependent = independentValues.reduce((sum, value) => sum + value, 0) / samples.length;
  const meanDependent = dependentValues.reduce((sum, value) => sum + value, 0) / samples.length;
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const independentDelta = independentValues[index] - meanIndependent;
    numerator += independentDelta * (dependentValues[index] - meanDependent);
    denominator += independentDelta * independentDelta;
  }

  if (Math.abs(denominator) < 1e-6) return null;
  const slope = numerator / denominator;
  return {
    slope,
    intercept: meanDependent - slope * meanIndependent,
    sampleCount: samples.length,
  };
}

function intersectXOnYWithYOnX(xOnY: XOnYLine, yOnX: YOnXLine): CapturePoint | null {
  const denominator = 1 - xOnY.slope * yOnX.slope;
  if (Math.abs(denominator) < 1e-6) return null;
  const x = (xOnY.slope * yOnX.intercept + xOnY.intercept) / denominator;
  const y = yOnX.slope * x + yOnX.intercept;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function signedTriangleArea(a: CapturePoint, b: CapturePoint, c: CapturePoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isConvexQuad(quad: CaptureQuadrilateral) {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const signs = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const afterNext = points[(index + 2) % points.length];
    return Math.sign(signedTriangleArea(point, next, afterNext));
  }).filter((sign) => sign !== 0);
  return signs.length === 4 && signs.every((sign) => sign === signs[0]);
}

function pointNearRect(point: CapturePoint, rect: CaptureRect, tolerance: number) {
  return point.x >= rect.x - tolerance
    && point.x <= rect.x + rect.width + tolerance
    && point.y >= rect.y - tolerance
    && point.y <= rect.y + rect.height + tolerance;
}

function estimateQuadrilateralFromEdges(points: CapturePoint[], rect: CaptureRect, step: number): CaptureQuadrilateral | null {
  const verticalBins = Math.max(6, Math.floor(rect.height / Math.max(1, step * 5)));
  const horizontalBins = Math.max(6, Math.floor(rect.width / Math.max(1, step * 5)));
  const leftSamples: CapturePoint[] = [];
  const rightSamples: CapturePoint[] = [];
  const topSamples: CapturePoint[] = [];
  const bottomSamples: CapturePoint[] = [];

  for (let index = 0; index < verticalBins; index += 1) {
    const y0 = rect.y + (rect.height * index) / verticalBins;
    const y1 = rect.y + (rect.height * (index + 1)) / verticalBins;
    const band = points.filter((point) => point.y >= y0 && point.y < y1 && point.x >= rect.x && point.x <= rect.x + rect.width);
    if (band.length < 4) continue;
    const y = (y0 + y1) / 2;
    const xs = band.map((point) => point.x);
    leftSamples.push({ x: percentile(xs, 0.08), y });
    rightSamples.push({ x: percentile(xs, 0.92), y });
  }

  for (let index = 0; index < horizontalBins; index += 1) {
    const x0 = rect.x + (rect.width * index) / horizontalBins;
    const x1 = rect.x + (rect.width * (index + 1)) / horizontalBins;
    const band = points.filter((point) => point.x >= x0 && point.x < x1 && point.y >= rect.y && point.y <= rect.y + rect.height);
    if (band.length < 4) continue;
    const x = (x0 + x1) / 2;
    const ys = band.map((point) => point.y);
    topSamples.push({ x, y: percentile(ys, 0.08) });
    bottomSamples.push({ x, y: percentile(ys, 0.92) });
  }

  const leftLine = fitLine(leftSamples, 'x') as XOnYLine | null;
  const rightLine = fitLine(rightSamples, 'x') as XOnYLine | null;
  const topLine = fitLine(topSamples, 'y') as YOnXLine | null;
  const bottomLine = fitLine(bottomSamples, 'y') as YOnXLine | null;
  if (!leftLine || !rightLine || !topLine || !bottomLine) return null;

  const topLeft = intersectXOnYWithYOnX(leftLine, topLine);
  const topRight = intersectXOnYWithYOnX(rightLine, topLine);
  const bottomRight = intersectXOnYWithYOnX(rightLine, bottomLine);
  const bottomLeft = intersectXOnYWithYOnX(leftLine, bottomLine);
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) return null;

  const tolerance = Math.max(step * 8, Math.min(rect.width, rect.height) * 0.18);
  const quad = roundQuad({ topLeft, topRight, bottomRight, bottomLeft });
  if (!isConvexQuad(quad)) return null;
  if (![quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].every((point) => pointNearRect(point, rect, tolerance))) {
    return null;
  }

  const bounds = quadrilateralBounds(quad);
  const boundsArea = rectArea(bounds);
  const rectCandidateArea = rectArea(rect);
  if (boundsArea < rectCandidateArea * 0.45 || boundsArea > rectCandidateArea * 1.85) {
    return null;
  }

  return quad;
}

function makeUnitSquareToQuadHomography(quad: CaptureQuadrilateral): Homography {
  const p0 = quad.topLeft;
  const p1 = quad.topRight;
  const p2 = quad.bottomRight;
  const p3 = quad.bottomLeft;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  let g = 0;
  let h = 0;
  const denominator = dx1 * dy2 - dx2 * dy1;
  if ((Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) && Math.abs(denominator) > 1e-9) {
    g = (dx3 * dy2 - dx2 * dy3) / denominator;
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  }

  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ];
}

function applyHomography(matrix: Homography, point: CapturePoint): CapturePoint {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const denominator = g * point.x + h * point.y + i;
  if (Math.abs(denominator) < 1e-9) {
    return { x: c, y: f };
  }
  return {
    x: (a * point.x + b * point.y + c) / denominator,
    y: (d * point.x + e * point.y + f) / denominator,
  };
}

function expandQuad(quad: CaptureQuadrilateral, imageSize: CaptureSize, ratio: number) {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  const expandPoint = (point: CapturePoint) => ({
    x: Math.max(0, Math.min(imageSize.width - 1, center.x + (point.x - center.x) * (1 + ratio))),
    y: Math.max(0, Math.min(imageSize.height - 1, center.y + (point.y - center.y) * (1 + ratio))),
  });

  return roundQuad({
    topLeft: expandPoint(quad.topLeft),
    topRight: expandPoint(quad.topRight),
    bottomRight: expandPoint(quad.bottomRight),
    bottomLeft: expandPoint(quad.bottomLeft),
  });
}

function failedResult(imageSize: CaptureSize, reason: string, sampledAt: string, safetyMarginRatio: number): CardLocalisationResult {
  const confidence: CardLocalisationConfidence = {
    status: 'failed',
    score: 0,
    reasons: [reason],
    aspectRatio: 0,
    aspectScore: 0,
    frameCoverage: 0,
    coverageScore: 0,
    guideOverlap: 0,
    positionScore: 0,
    edgeCompleteness: { top: 0, right: 0, bottom: 0, left: 0, average: 0 },
    convex: false,
    cornersDetected: false,
    cornerSource: 'none',
  };

  return {
    status: 'failed',
    confidence,
    imageSize,
    safetyMarginRatio,
    sampledAt,
    source: 'local-edge',
    requiresManualAdjustment: true,
  };
}

export function localiseCardFromJpegBase64(
  base64: string,
  options: CardLocalisationOptions = {}
): CardLocalisationResult {
  const expectedAspectRatio = finiteOr(options.expectedAspectRatio, DEFAULT_CARD_ASPECT_RATIO);
  const minFrameCoverage = finiteOr(options.minFrameCoverage, 0.075);
  const maxFrameCoverage = finiteOr(options.maxFrameCoverage, 0.86);
  const minEdgeCompleteness = finiteOr(options.minEdgeCompleteness, 0.14);
  const safetyMarginRatio = finiteOr(options.safetyMarginRatio, DEFAULT_SAFETY_MARGIN);
  const sampledAt = options.sampledAt ?? new Date().toISOString();
  let image: DecodedJpeg;

  try {
    image = decodeBase64Jpeg(base64);
  } catch {
    return failedResult({ width: 0, height: 0 }, 'decode-failed', sampledAt, safetyMarginRatio);
  }

  const imageSize = { width: image.width, height: image.height };
  const fullRect = { x: 0, y: 0, width: image.width, height: image.height };
  const guideRect = options.guideRect
    ? clampCropRect(options.guideRect, imageSize) ?? fullRect
    : fullRect;
  const step = Math.max(1, Math.round(finiteOr(options.analysisStep, Math.floor(Math.min(image.width, image.height) / 160))));
  const gradients: number[] = [];
  const samples: { x: number; y: number; gradient: number }[] = [];

  for (let y = Math.max(step, Math.round(guideRect.y + step)); y < guideRect.y + guideRect.height - step; y += step) {
    for (let x = Math.max(step, Math.round(guideRect.x + step)); x < guideRect.x + guideRect.width - step; x += step) {
      const center = lumaAt(image, x, y);
      const right = lumaAt(image, x + step, y);
      const down = lumaAt(image, x, y + step);
      const left = lumaAt(image, x - step, y);
      const up = lumaAt(image, x, y - step);
      const gradient = Math.abs(center - right)
        + Math.abs(center - down)
        + Math.abs(center - left) * 0.45
        + Math.abs(center - up) * 0.45;
      gradients.push(gradient);
      samples.push({ x, y, gradient });
    }
  }

  if (gradients.length < 80) {
    return failedResult(imageSize, 'not-enough-samples', sampledAt, safetyMarginRatio);
  }

  const threshold = Math.max(28, percentile(gradients, 0.78));
  const edgePoints = samples
    .filter((sample) => sample.gradient >= threshold)
    .map((sample) => ({ x: sample.x, y: sample.y }));

  if (edgePoints.length < Math.max(30, gradients.length * 0.035)) {
    return failedResult(imageSize, 'not-enough-edge-points', sampledAt, safetyMarginRatio);
  }

  const xs = edgePoints.map((point) => point.x);
  const ys = edgePoints.map((point) => point.y);
  const left = percentile(xs, 0.035);
  const right = percentile(xs, 0.965);
  const top = percentile(ys, 0.035);
  const bottom = percentile(ys, 0.965);
  const rawRect = roundRect({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
  const crop = clampCropRect(rawRect, imageSize);

  if (!crop || crop.width < 24 || crop.height < 24) {
    return failedResult(imageSize, 'candidate-too-small', sampledAt, safetyMarginRatio);
  }

  const edgeQuadrilateral = estimateQuadrilateralFromEdges(edgePoints, crop, step);
  const quadrilateral = edgeQuadrilateral
    ? expandQuad(edgeQuadrilateral, imageSize, safetyMarginRatio)
    : roundQuad(rectToQuadrilateral(expandCropRect(crop, imageSize, safetyMarginRatio) ?? crop));
  const expandedCrop = quadrilateralBounds(quadrilateral);
  const aspectRatio = expandedCrop.width / expandedCrop.height;
  const aspectScore = getAspectScore(aspectRatio, expectedAspectRatio);
  const frameCoverage = rectArea(expandedCrop) / Math.max(1, rectArea(guideRect));
  const coverageScore = getCoverageScore(frameCoverage, minFrameCoverage, maxFrameCoverage);
  const guideOverlap = rectOverlapRatio(expandedCrop, guideRect);
  const positionScore = getPositionScore(expandedCrop, guideRect);
  const edgeCompleteness = getEdgeCompleteness(edgePoints, crop, step);
  const cornersDetected = edgeCompleteness.top >= minEdgeCompleteness
    && edgeCompleteness.right >= minEdgeCompleteness
    && edgeCompleteness.bottom >= minEdgeCompleteness
    && edgeCompleteness.left >= minEdgeCompleteness;
  const convex = expandedCrop.width > 0 && expandedCrop.height > 0;
  const score = clamp01(
    aspectScore * 0.24
    + coverageScore * 0.2
    + guideOverlap * 0.13
    + positionScore * 0.16
    + edgeCompleteness.average * 0.27
  );
  const reasons: string[] = [];

  if (frameCoverage < minFrameCoverage) reasons.push('move-closer');
  if (frameCoverage > maxFrameCoverage) reasons.push('move-further-away');
  if (positionScore < 0.55) reasons.push('centre-card');
  if (guideOverlap < 0.86) reasons.push('inside-guide');
  if (aspectScore < 0.45) reasons.push('aspect-ratio-off');
  if (!cornersDetected) reasons.push('four-edges-not-clear');

  const status: CardLocalisationStatus = score >= 0.66
    && cornersDetected
    && aspectScore >= 0.45
    && frameCoverage >= minFrameCoverage
    && frameCoverage <= maxFrameCoverage
    && positionScore >= 0.45
    && guideOverlap >= 0.78
    ? 'confident'
    : 'uncertain';
  const confidence: CardLocalisationConfidence = {
    status,
    score: round(score, 3),
    reasons,
    aspectRatio: round(aspectRatio, 3),
    aspectScore: round(aspectScore, 3),
    frameCoverage: round(frameCoverage, 3),
    coverageScore: round(coverageScore, 3),
    guideOverlap: round(guideOverlap, 3),
    positionScore: round(positionScore, 3),
    edgeCompleteness,
    convex,
    cornersDetected,
    cornerSource: edgeQuadrilateral && cornersDetected ? 'edge-intersections' : 'edge-bounds',
  };

  return {
    status,
    confidence,
    imageSize,
    quadrilateral,
    crop: roundRect(quadrilateralBounds(quadrilateral)),
    transformMatrix: makeUnitSquareToQuadHomography(quadrilateral).map((value) => round(value, 6)),
    safetyMarginRatio,
    sampledAt,
    source: 'local-edge',
    requiresManualAdjustment: status !== 'confident',
  };
}

function blendPoint(a: CapturePoint, b: CapturePoint, alpha: number): CapturePoint {
  return roundPoint({
    x: a.x * (1 - alpha) + b.x * alpha,
    y: a.y * (1 - alpha) + b.y * alpha,
  });
}

function quadCenter(quad: CaptureQuadrilateral): CapturePoint {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

export function smoothCardLocalisation(
  previous: CardLocalisationResult | null | undefined,
  next: CardLocalisationResult,
  options: CardLocalisationTrackingOptions = {}
): CardLocalisationResult {
  if (!previous?.quadrilateral || !next.quadrilateral || next.status === 'failed') return next;
  if (previous.imageSize.width !== next.imageSize.width || previous.imageSize.height !== next.imageSize.height) {
    return next;
  }

  const alpha = clamp01(finiteOr(options.alpha, 0.42));
  const maxCenterShiftRatio = finiteOr(options.maxCenterShiftRatio, 0.22);
  const previousCenter = quadCenter(previous.quadrilateral);
  const nextCenter = quadCenter(next.quadrilateral);
  const maxShift = Math.min(next.imageSize.width, next.imageSize.height) * maxCenterShiftRatio;
  if (Math.hypot(previousCenter.x - nextCenter.x, previousCenter.y - nextCenter.y) > maxShift) {
    return next;
  }

  const quadrilateral = roundQuad({
    topLeft: blendPoint(previous.quadrilateral.topLeft, next.quadrilateral.topLeft, alpha),
    topRight: blendPoint(previous.quadrilateral.topRight, next.quadrilateral.topRight, alpha),
    bottomRight: blendPoint(previous.quadrilateral.bottomRight, next.quadrilateral.bottomRight, alpha),
    bottomLeft: blendPoint(previous.quadrilateral.bottomLeft, next.quadrilateral.bottomLeft, alpha),
  });

  return {
    ...next,
    quadrilateral,
    crop: roundRect(quadrilateralBounds(quadrilateral)),
    transformMatrix: makeUnitSquareToQuadHomography(quadrilateral).map((value) => round(value, 6)),
  };
}

export function getCardLocalisationGuidance(result: CardLocalisationResult | null | undefined) {
  if (!result || result.status === 'failed') return 'Align one card inside the purple window.';
  const reasons = result.confidence.reasons;
  if (reasons.includes('move-closer')) return 'Move closer until the card is clear in the window.';
  if (reasons.includes('move-further-away')) return 'Move further away until every card edge is visible.';
  if (reasons.includes('centre-card') || reasons.includes('inside-guide')) return 'Centre the card inside the purple window.';
  if (reasons.includes('four-edges-not-clear')) return 'Show all four edges, then hold steady.';
  if (reasons.includes('aspect-ratio-off')) return 'Keep the card upright and square to the camera.';
  return result.status === 'confident' ? 'Card edges found. Hold steady...' : 'Hold steady while Stackr checks the edges.';
}

export function perspectiveCorrectCardJpegBase64(
  base64: string,
  quadrilateral: CaptureQuadrilateral,
  options: PerspectiveCorrectOptions = {}
): PerspectiveCorrectResult {
  const image = decodeBase64Jpeg(base64);
  const expectedAspectRatio = finiteOr(options.expectedAspectRatio, DEFAULT_CARD_ASPECT_RATIO);
  const outputWidth = Math.max(160, Math.round(finiteOr(options.outputWidth, 720)));
  const outputHeight = Math.max(220, Math.round(outputWidth / expectedAspectRatio));
  const quality = Math.max(35, Math.min(100, Math.round(finiteOr(options.quality, 84))));
  const safetyMarginRatio = finiteOr(options.safetyMarginRatio, DEFAULT_SAFETY_MARGIN);
  const safeQuad = expandQuad(quadrilateral, { width: image.width, height: image.height }, safetyMarginRatio);
  const transform = makeUnitSquareToQuadHomography(safeQuad);
  const output = new Uint8Array(outputWidth * outputHeight * 4);

  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const unitPoint = {
        x: outputWidth <= 1 ? 0 : x / (outputWidth - 1),
        y: outputHeight <= 1 ? 0 : y / (outputHeight - 1),
      };
      const sourcePoint = applyHomography(transform, unitPoint);
      const pixel = sampleRgbaBilinear(image, sourcePoint.x, sourcePoint.y);
      const index = (y * outputWidth + x) * 4;
      output[index] = pixel[0];
      output[index + 1] = pixel[1];
      output[index + 2] = pixel[2];
      output[index + 3] = 255;
    }
  }

  const encoded = encodeJpeg({ data: output, width: outputWidth, height: outputHeight }, quality);
  return {
    base64: Buffer.from(encoded.data).toString('base64'),
    width: outputWidth,
    height: outputHeight,
    transformMatrix: transform.map((value) => round(value, 6)),
    quadrilateral: safeQuad,
  };
}
