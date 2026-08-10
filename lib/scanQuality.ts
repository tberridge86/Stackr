import { Buffer } from 'buffer';
import { decode as decodeJpeg } from 'jpeg-js';
import type { CapturePoint, CaptureQuadrilateral } from './captureGeometry';
import type { CardLocalisationResult } from './cardLocalisation';

export type ScanQualityInstruction =
  | 'show-whole-card'
  | 'move-closer'
  | 'hold-steady'
  | 'tap-to-focus'
  | 'reduce-glare'
  | 'improve-lighting';

export type ScanQualityFailureCode =
  | ScanQualityInstruction
  | 'overexposed'
  | 'corners-hidden'
  | 'perspective-distortion'
  | 'hand-obstruction'
  | 'sleeve-reflection'
  | 'unreadable-image';

export type ScanQualityFailure = {
  code: ScanQualityFailureCode;
  instruction: ScanQualityInstruction;
  message: string;
  priority: number;
  mandatory: boolean;
  score: number;
};

export type ScanQualityDeviceProfile = 'balanced' | 'low-end' | 'high-end';

export type ScanQualityThresholds = {
  minFocusScore: number;
  minExposureScore: number;
  minGlareScore: number;
  minFramingScore: number;
  minStabilityScore: number;
  minObstructionScore: number;
  minPerspectiveScore: number;
  minCardCoverage: number;
  maxCardCoverage: number;
  maxBrightRatio: number;
  maxGlareRatio: number;
  maxSkinRatio: number;
  maxCenterShiftRatio: number;
  maxAreaChangeRatio: number;
  maxPerspectiveDistortion: number;
};

export type ScanQualityCalibration = Partial<ScanQualityThresholds> & {
  deviceProfile?: ScanQualityDeviceProfile | string | null;
};

export type ScanQualityResult = {
  passed: boolean;
  focusScore: number;
  glareScore: number;
  exposureScore: number;
  framingScore: number;
  stabilityScore: number;
  obstructionScore: number;
  perspectiveScore: number;
  sleeveReflectionScore: number;
  failures: ScanQualityFailure[];
  instruction: ScanQualityInstruction | null;
  instructionText: string;
  thresholds: ScanQualityThresholds;
  metrics: {
    brightness: number;
    contrast: number;
    darkRatio: number;
    brightRatio: number;
    glareRatio: number;
    edgeDensity: number;
    focusGradientP90: number;
    skinRatio: number;
    cardCoverage: number;
    guideOverlap: number;
    cornersVisible: boolean;
    centerShiftRatio: number | null;
    areaChangeRatio: number | null;
    perspectiveDistortion: number;
    sleeveReflectionRatio: number;
  };
};

export type ScanQualityOptions = {
  localisation?: CardLocalisationResult | null;
  previousLocalisation?: CardLocalisationResult | null;
  calibration?: ScanQualityCalibration | null;
};

type DecodedJpeg = {
  width: number;
  height: number;
  data: Uint8Array;
};

const BASE_THRESHOLDS: Record<ScanQualityDeviceProfile, ScanQualityThresholds> = {
  balanced: {
    minFocusScore: 0.42,
    minExposureScore: 0.42,
    minGlareScore: 0.3,
    minFramingScore: 0.6,
    minStabilityScore: 0.58,
    minObstructionScore: 0.72,
    minPerspectiveScore: 0.46,
    minCardCoverage: 0.08,
    maxCardCoverage: 0.84,
    maxBrightRatio: 0.22,
    maxGlareRatio: 0.24,
    maxSkinRatio: 0.13,
    maxCenterShiftRatio: 0.085,
    maxAreaChangeRatio: 0.18,
    maxPerspectiveDistortion: 0.34,
  },
  'low-end': {
    minFocusScore: 0.34,
    minExposureScore: 0.36,
    minGlareScore: 0.24,
    minFramingScore: 0.56,
    minStabilityScore: 0.5,
    minObstructionScore: 0.68,
    minPerspectiveScore: 0.42,
    minCardCoverage: 0.07,
    maxCardCoverage: 0.88,
    maxBrightRatio: 0.28,
    maxGlareRatio: 0.3,
    maxSkinRatio: 0.15,
    maxCenterShiftRatio: 0.12,
    maxAreaChangeRatio: 0.24,
    maxPerspectiveDistortion: 0.42,
  },
  'high-end': {
    minFocusScore: 0.48,
    minExposureScore: 0.46,
    minGlareScore: 0.36,
    minFramingScore: 0.64,
    minStabilityScore: 0.64,
    minObstructionScore: 0.76,
    minPerspectiveScore: 0.5,
    minCardCoverage: 0.09,
    maxCardCoverage: 0.8,
    maxBrightRatio: 0.18,
    maxGlareRatio: 0.2,
    maxSkinRatio: 0.11,
    maxCenterShiftRatio: 0.065,
    maxAreaChangeRatio: 0.14,
    maxPerspectiveDistortion: 0.28,
  },
};

const INSTRUCTION_TEXT: Record<ScanQualityInstruction, string> = {
  'show-whole-card': 'Show the whole card.',
  'move-closer': 'Move closer.',
  'hold-steady': 'Hold steady.',
  'tap-to-focus': 'Tap to focus.',
  'reduce-glare': 'Reduce glare.',
  'improve-lighting': 'Improve lighting.',
};

const FAILURE_PRIORITY: Record<ScanQualityInstruction, number> = {
  'show-whole-card': 1,
  'move-closer': 2,
  'hold-steady': 3,
  'tap-to-focus': 4,
  'reduce-glare': 5,
  'improve-lighting': 6,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function stripBase64ImagePrefix(base64: string) {
  return String(base64 ?? '').trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function decodeBase64Jpeg(base64: string): DecodedJpeg {
  const cleanBase64 = stripBase64ImagePrefix(base64);
  if (!cleanBase64) {
    throw new Error('No JPEG base64 image supplied for scan quality.');
  }

  const decoded = decodeJpeg(Buffer.from(cleanBase64, 'base64'), { useTArray: true });
  return {
    width: decoded.width,
    height: decoded.height,
    data: decoded.data,
  };
}

function round(value: number, precision = 3) {
  return Number(value.toFixed(precision));
}

function lumaAt(image: DecodedJpeg, x: number, y: number) {
  const clampedX = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const clampedY = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const index = (clampedY * image.width + clampedX) * 4;
  return image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

function getProfileName(profile?: string | null): ScanQualityDeviceProfile {
  if (profile === 'low-end' || profile === 'high-end') return profile;
  return 'balanced';
}

export function createScanQualityThresholds(calibration?: ScanQualityCalibration | null): ScanQualityThresholds {
  const profile = getProfileName(calibration?.deviceProfile);
  const base = BASE_THRESHOLDS[profile];
  const overrides = Object.fromEntries(
    Object.entries(calibration ?? {}).filter(([key, value]) => key !== 'deviceProfile' && Number.isFinite(Number(value)))
  ) as Partial<ScanQualityThresholds>;

  return {
    ...base,
    ...overrides,
  };
}

function distance(a: CapturePoint, b: CapturePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function quadPoints(quad: CaptureQuadrilateral) {
  return [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
}

function quadCenter(quad: CaptureQuadrilateral) {
  const points = quadPoints(quad);
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function quadArea(quad: CaptureQuadrilateral) {
  const points = quadPoints(quad);
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function getPerspectiveDistortion(localisation?: CardLocalisationResult | null) {
  const quad = localisation?.quadrilateral;
  if (!quad) return 1;
  const top = distance(quad.topLeft, quad.topRight);
  const bottom = distance(quad.bottomLeft, quad.bottomRight);
  const left = distance(quad.topLeft, quad.bottomLeft);
  const right = distance(quad.topRight, quad.bottomRight);
  const horizontalSkew = Math.abs(top - bottom) / Math.max(top, bottom, 1);
  const verticalSkew = Math.abs(left - right) / Math.max(left, right, 1);
  return Math.max(horizontalSkew, verticalSkew);
}

function getStability(
  localisation: CardLocalisationResult | null | undefined,
  previousLocalisation: CardLocalisationResult | null | undefined,
  thresholds: ScanQualityThresholds
) {
  if (!localisation?.quadrilateral || !previousLocalisation?.quadrilateral) {
    return {
      score: 1,
      centerShiftRatio: null,
      areaChangeRatio: null,
    };
  }

  const imageScale = Math.max(1, Math.min(localisation.imageSize.width, localisation.imageSize.height));
  const centerShiftRatio = distance(quadCenter(localisation.quadrilateral), quadCenter(previousLocalisation.quadrilateral)) / imageScale;
  const currentArea = Math.max(1, quadArea(localisation.quadrilateral));
  const previousArea = Math.max(1, quadArea(previousLocalisation.quadrilateral));
  const areaChangeRatio = Math.abs(currentArea - previousArea) / Math.max(currentArea, previousArea);
  const movementPenalty = Math.max(
    centerShiftRatio / Math.max(0.001, thresholds.maxCenterShiftRatio),
    areaChangeRatio / Math.max(0.001, thresholds.maxAreaChangeRatio)
  );

  return {
    score: clamp01(1 - movementPenalty * 0.62),
    centerShiftRatio,
    areaChangeRatio,
  };
}

function isLikelySkin(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r > 95
    && g > 40
    && b > 20
    && max - min > 15
    && Math.abs(r - g) > 15
    && r > g
    && r > b;
}

function readImageMetrics(base64: string) {
  const image = decodeBase64Jpeg(base64);
  const step = Math.max(1, Math.floor(Math.min(image.width, image.height) / 120));
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  let darkPixels = 0;
  let brightPixels = 0;
  let glarePixels = 0;
  let sleeveReflectionPixels = 0;
  let skinPixels = 0;
  let edgePixels = 0;
  const gradients: number[] = [];

  for (let y = step; y < image.height - step; y += step) {
    for (let x = step; x < image.width - step; x += step) {
      const index = (y * image.width + x) * 4;
      const r = image.data[index];
      const g = image.data[index + 1];
      const b = image.data[index + 2];
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      const right = lumaAt(image, x + step, y);
      const down = lumaAt(image, x, y + step);
      const left = lumaAt(image, x - step, y);
      const up = lumaAt(image, x, y - step);
      const gradient = Math.abs(luma - right)
        + Math.abs(luma - down)
        + Math.abs(luma - left) * 0.35
        + Math.abs(luma - up) * 0.35;

      count += 1;
      sum += luma;
      sumSq += luma * luma;
      gradients.push(gradient);
      if (luma < 38) darkPixels += 1;
      if (luma > 232) brightPixels += 1;
      if (luma > 244 && gradient < 58) glarePixels += 1;
      if (luma > 236 && gradient < 28) sleeveReflectionPixels += 1;
      if (gradient > 48) edgePixels += 1;
      if (isLikelySkin(r, g, b)) skinPixels += 1;
    }
  }

  const brightness = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSq / count - brightness * brightness) : 0;
  const contrast = Math.sqrt(variance);
  const gradientP90 = percentile(gradients, 0.9);

  return {
    width: image.width,
    height: image.height,
    brightness,
    contrast,
    darkRatio: count ? darkPixels / count : 0,
    brightRatio: count ? brightPixels / count : 0,
    glareRatio: count ? glarePixels / count : 0,
    sleeveReflectionRatio: count ? sleeveReflectionPixels / count : 0,
    skinRatio: count ? skinPixels / count : 0,
    edgeDensity: count ? edgePixels / count : 0,
    gradientP90,
  };
}

function addFailure(
  failures: ScanQualityFailure[],
  code: ScanQualityFailureCode,
  instruction: ScanQualityInstruction,
  score: number,
  message = INSTRUCTION_TEXT[instruction],
  mandatory = true
) {
  failures.push({
    code,
    instruction,
    message,
    priority: FAILURE_PRIORITY[instruction],
    mandatory,
    score: round(score),
  });
}

export function getScanQualityInstruction(result: ScanQualityResult | null | undefined) {
  return result?.instructionText ?? 'Show the whole card.';
}

export function evaluateScanQuality(base64: string, options: ScanQualityOptions = {}): ScanQualityResult {
  const thresholds = createScanQualityThresholds(options.calibration);
  const failures: ScanQualityFailure[] = [];

  let metrics: ReturnType<typeof readImageMetrics>;
  try {
    metrics = readImageMetrics(base64);
  } catch {
    const failure: ScanQualityFailure = {
      code: 'unreadable-image',
      instruction: 'show-whole-card',
      message: INSTRUCTION_TEXT['show-whole-card'],
      priority: FAILURE_PRIORITY['show-whole-card'],
      mandatory: true,
      score: 0,
    };
    return {
      passed: false,
      focusScore: 0,
      glareScore: 0,
      exposureScore: 0,
      framingScore: 0,
      stabilityScore: 0,
      obstructionScore: 0,
      perspectiveScore: 0,
      sleeveReflectionScore: 0,
      failures: [failure],
      instruction: failure.instruction,
      instructionText: failure.message,
      thresholds,
      metrics: {
        brightness: 0,
        contrast: 0,
        darkRatio: 0,
        brightRatio: 0,
        glareRatio: 0,
        edgeDensity: 0,
        focusGradientP90: 0,
        skinRatio: 0,
        cardCoverage: 0,
        guideOverlap: 0,
        cornersVisible: false,
        centerShiftRatio: null,
        areaChangeRatio: null,
        perspectiveDistortion: 1,
        sleeveReflectionRatio: 0,
      },
    };
  }

  const localisation = options.localisation ?? null;
  const cardCoverage = localisation?.confidence.frameCoverage ?? 0;
  const guideOverlap = localisation?.confidence.guideOverlap ?? 0;
  const cornersVisible = Boolean(localisation?.confidence.cornersDetected);
  const localisationReasons = localisation?.confidence.reasons ?? [];
  const focusScore = clamp01((metrics.gradientP90 - 18) / 74 * 0.58 + Math.min(1, metrics.edgeDensity / 0.105) * 0.42);
  const underExposurePenalty = Math.max(0, (58 - metrics.brightness) / 58) + metrics.darkRatio * 1.08;
  const overExposurePenalty = Math.max(0, (metrics.brightness - 222) / 44) + Math.max(0, metrics.brightRatio - thresholds.maxBrightRatio) * 1.25;
  const rawExposureScore = clamp01(1 - Math.max(underExposurePenalty, overExposurePenalty));
  const underexposed = metrics.brightness < 52 || (metrics.brightness < 68 && metrics.darkRatio > 0.05);
  const exposureScore = underexposed
    ? Math.min(rawExposureScore, clamp01((metrics.brightness / 52) * 0.4))
    : rawExposureScore;
  const glareScore = clamp01(1 - Math.max(
    metrics.glareRatio / Math.max(0.001, thresholds.maxGlareRatio),
    metrics.brightRatio > thresholds.maxBrightRatio ? (metrics.brightRatio - thresholds.maxBrightRatio) * 2.2 : 0
  ));
  const sleeveReflectionScore = clamp01(1 - metrics.sleeveReflectionRatio / Math.max(0.001, thresholds.maxGlareRatio * 1.3));
  const framingScore = localisation?.status === 'confident'
    ? clamp01(
        localisation.confidence.score * 0.42
        + localisation.confidence.coverageScore * 0.23
        + localisation.confidence.guideOverlap * 0.17
        + (cornersVisible ? 0.18 : 0)
      )
    : 0;
  const stability = getStability(localisation, options.previousLocalisation, thresholds);
  const perspectiveDistortion = getPerspectiveDistortion(localisation);
  const perspectiveScore = clamp01(1 - perspectiveDistortion / Math.max(0.001, thresholds.maxPerspectiveDistortion));
  const obstructionScore = clamp01(1 - metrics.skinRatio / Math.max(0.001, thresholds.maxSkinRatio));
  const imageQualityLikelyBlocksLocalisation = underexposed
    || focusScore < thresholds.minFocusScore
    || glareScore < thresholds.minGlareScore
    || sleeveReflectionScore < thresholds.minGlareScore
    || exposureScore < thresholds.minExposureScore;
  const explicitFramingFailure = localisationReasons.includes('centre-card')
    || guideOverlap < 0.78
    || !cornersVisible
    || cardCoverage > thresholds.maxCardCoverage
    || cardCoverage < thresholds.minCardCoverage;
  const localisationBlockedByImageQuality = imageQualityLikelyBlocksLocalisation
    && localisation?.status !== 'confident'
    && !explicitFramingFailure;

  if (
    (!localisation || localisation.status === 'failed')
    && !imageQualityLikelyBlocksLocalisation
  ) {
    addFailure(failures, 'corners-hidden', 'show-whole-card', framingScore);
  } else if (
    !localisationBlockedByImageQuality
    && localisation?.status !== 'failed'
    && localisation
    && (localisationReasons.includes('centre-card') || guideOverlap < 0.78 || !cornersVisible || cardCoverage > thresholds.maxCardCoverage)
  ) {
    addFailure(failures, 'corners-hidden', 'show-whole-card', framingScore);
  } else if (localisation?.status !== 'failed' && cardCoverage < thresholds.minCardCoverage) {
    addFailure(failures, 'move-closer', 'move-closer', framingScore);
  } else if (!localisationBlockedByImageQuality && localisation?.status !== 'failed' && framingScore < thresholds.minFramingScore) {
    addFailure(failures, 'show-whole-card', 'show-whole-card', framingScore);
  }

  if (stability.score < thresholds.minStabilityScore) {
    addFailure(failures, 'hold-steady', 'hold-steady', stability.score);
  }

  if (
    focusScore < thresholds.minFocusScore
    && !underexposed
    && glareScore >= thresholds.minGlareScore
    && sleeveReflectionScore >= thresholds.minGlareScore
  ) {
    addFailure(failures, 'tap-to-focus', 'tap-to-focus', focusScore);
  }

  if (glareScore < thresholds.minGlareScore) {
    addFailure(failures, 'reduce-glare', 'reduce-glare', glareScore);
  }

  if (sleeveReflectionScore < thresholds.minGlareScore) {
    addFailure(failures, 'sleeve-reflection', 'reduce-glare', sleeveReflectionScore);
  }

  if (exposureScore < thresholds.minExposureScore) {
    addFailure(
      failures,
      metrics.brightness > 222 || metrics.brightRatio > thresholds.maxBrightRatio ? 'overexposed' : 'improve-lighting',
      metrics.brightness > 222 || metrics.brightRatio > thresholds.maxBrightRatio ? 'reduce-glare' : 'improve-lighting',
      exposureScore
    );
  }

  if (obstructionScore < thresholds.minObstructionScore) {
    addFailure(failures, 'hand-obstruction', 'show-whole-card', obstructionScore);
  }

  if (!localisationBlockedByImageQuality && localisation?.quadrilateral && perspectiveScore < thresholds.minPerspectiveScore) {
    addFailure(failures, 'perspective-distortion', 'show-whole-card', perspectiveScore);
  }

  const sortedFailures = failures.sort((a, b) => a.priority - b.priority || a.score - b.score);
  const instruction = sortedFailures[0]?.instruction ?? null;

  return {
    passed: sortedFailures.every((failure) => !failure.mandatory),
    focusScore: round(focusScore),
    glareScore: round(glareScore),
    exposureScore: round(exposureScore),
    framingScore: round(framingScore),
    stabilityScore: round(stability.score),
    obstructionScore: round(obstructionScore),
    perspectiveScore: round(perspectiveScore),
    sleeveReflectionScore: round(sleeveReflectionScore),
    failures: sortedFailures,
    instruction,
    instructionText: instruction ? INSTRUCTION_TEXT[instruction] : 'Card found. Hold steady...',
    thresholds,
    metrics: {
      brightness: round(metrics.brightness, 1),
      contrast: round(metrics.contrast, 1),
      darkRatio: round(metrics.darkRatio),
      brightRatio: round(metrics.brightRatio),
      glareRatio: round(metrics.glareRatio),
      edgeDensity: round(metrics.edgeDensity),
      focusGradientP90: round(metrics.gradientP90, 1),
      skinRatio: round(metrics.skinRatio),
      cardCoverage: round(cardCoverage),
      guideOverlap: round(guideOverlap),
      cornersVisible,
      centerShiftRatio: stability.centerShiftRatio == null ? null : round(stability.centerShiftRatio),
      areaChangeRatio: stability.areaChangeRatio == null ? null : round(stability.areaChangeRatio),
      perspectiveDistortion: round(perspectiveDistortion),
      sleeveReflectionRatio: round(metrics.sleeveReflectionRatio),
    },
  };
}
