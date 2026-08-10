export type CaptureOrientation =
  | 'portrait'
  | 'portraitUpsideDown'
  | 'landscapeLeft'
  | 'landscapeRight'
  | 'unknown';

export type CaptureResizeMode = 'cover' | 'contain' | 'stretch';

export type CapturePoint = {
  x: number;
  y: number;
};

export type CaptureSize = {
  width: number;
  height: number;
};

export type CaptureRect = CapturePoint & CaptureSize;

export type CaptureInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type CaptureQuadrilateral = {
  topLeft: CapturePoint;
  topRight: CapturePoint;
  bottomRight: CapturePoint;
  bottomLeft: CapturePoint;
};

export type CapturePreviewTransform = {
  resizeMode: CaptureResizeMode;
  sourceWidth: number;
  sourceHeight: number;
  displayedWidth: number;
  displayedHeight: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
};

export type CapturedFrameInput = {
  originalUri: string;
  pixelWidth?: number | null;
  pixelHeight?: number | null;
  orientation?: CaptureOrientation;
  rotationDegrees?: number | null;
  mirrored?: boolean;
  previewWidth: number;
  previewHeight: number;
  previewResizeMode?: CaptureResizeMode;
  safeAreaInsets?: Partial<CaptureInsets> | null;
  detectedCardPreviewRect?: CaptureRect | null;
  detectedCardQuadrilateral?: CaptureQuadrilateral | null;
  capturedAt?: string;
  scanSessionId?: string;
};

export type CapturedFrame = Readonly<{
  originalUri: string;
  pixelWidth: number;
  pixelHeight: number;
  orientation: CaptureOrientation;
  rotationDegrees: 0 | 90 | 180 | 270;
  mirrored: boolean;
  previewDimensions: CaptureSize;
  previewResizeMode: CaptureResizeMode;
  safeAreaInsets: CaptureInsets;
  detectedCardQuadrilateral: CaptureQuadrilateral;
  capturedAt: string;
  scanSessionId: string;
  previewTransform: CapturePreviewTransform;
}>;

export function createCaptureSessionId(prefix = 'capture') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function finiteOr(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeRotation(rotation?: number | null): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(Number(rotation ?? 0) / 90) * 90) % 360 + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

function roundPoint(point: CapturePoint): CapturePoint {
  return {
    x: Number(point.x.toFixed(4)),
    y: Number(point.y.toFixed(4)),
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

function freezeQuad(quad: CaptureQuadrilateral): CaptureQuadrilateral {
  return Object.freeze({
    topLeft: Object.freeze({ ...quad.topLeft }),
    topRight: Object.freeze({ ...quad.topRight }),
    bottomRight: Object.freeze({ ...quad.bottomRight }),
    bottomLeft: Object.freeze({ ...quad.bottomLeft }),
  });
}

function fullPhotoQuad(width: number, height: number): CaptureQuadrilateral {
  return {
    topLeft: { x: 0, y: 0 },
    topRight: { x: width, y: 0 },
    bottomRight: { x: width, y: height },
    bottomLeft: { x: 0, y: height },
  };
}

function orientedPhotoSize(width: number, height: number, rotationDegrees: 0 | 90 | 180 | 270): CaptureSize {
  return rotationDegrees === 90 || rotationDegrees === 270
    ? { width: height, height: width }
    : { width, height };
}

export function getPreviewTransform(
  source: CaptureSize,
  preview: CaptureSize,
  resizeMode: CaptureResizeMode = 'cover'
): CapturePreviewTransform {
  const sourceWidth = Math.max(1, source.width);
  const sourceHeight = Math.max(1, source.height);
  const previewWidth = Math.max(1, preview.width);
  const previewHeight = Math.max(1, preview.height);

  if (resizeMode === 'stretch') {
    return {
      resizeMode,
      sourceWidth,
      sourceHeight,
      displayedWidth: previewWidth,
      displayedHeight: previewHeight,
      offsetX: 0,
      offsetY: 0,
      scaleX: previewWidth / sourceWidth,
      scaleY: previewHeight / sourceHeight,
    };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const previewAspect = previewWidth / previewHeight;
  const scale = resizeMode === 'contain'
    ? sourceAspect > previewAspect ? previewWidth / sourceWidth : previewHeight / sourceHeight
    : sourceAspect > previewAspect ? previewHeight / sourceHeight : previewWidth / sourceWidth;
  const displayedWidth = sourceWidth * scale;
  const displayedHeight = sourceHeight * scale;

  return {
    resizeMode,
    sourceWidth,
    sourceHeight,
    displayedWidth,
    displayedHeight,
    offsetX: (previewWidth - displayedWidth) / 2,
    offsetY: (previewHeight - displayedHeight) / 2,
    scaleX: scale,
    scaleY: scale,
  };
}

function orientedToStoredPoint(
  point: CapturePoint,
  photo: CaptureSize,
  rotationDegrees: 0 | 90 | 180 | 270
): CapturePoint {
  switch (rotationDegrees) {
    case 90:
      return { x: point.y, y: photo.height - point.x };
    case 180:
      return { x: photo.width - point.x, y: photo.height - point.y };
    case 270:
      return { x: photo.width - point.y, y: point.x };
    case 0:
    default:
      return point;
  }
}

function storedToOrientedPoint(
  point: CapturePoint,
  photo: CaptureSize,
  rotationDegrees: 0 | 90 | 180 | 270
): CapturePoint {
  switch (rotationDegrees) {
    case 90:
      return { x: photo.height - point.y, y: point.x };
    case 180:
      return { x: photo.width - point.x, y: photo.height - point.y };
    case 270:
      return { x: point.y, y: photo.width - point.x };
    case 0:
    default:
      return point;
  }
}

export function previewPointToPhotoPoint(frame: CapturedFrame, point: CapturePoint): CapturePoint {
  const previewWidth = frame.previewDimensions.width;
  const x = frame.mirrored ? previewWidth - point.x : point.x;
  const transform = frame.previewTransform;
  const orientedPoint = {
    x: (x - transform.offsetX) / transform.scaleX,
    y: (point.y - transform.offsetY) / transform.scaleY,
  };
  return roundPoint(orientedToStoredPoint(
    orientedPoint,
    { width: frame.pixelWidth, height: frame.pixelHeight },
    frame.rotationDegrees
  ));
}

export function photoPointToPreviewPoint(frame: CapturedFrame, point: CapturePoint): CapturePoint {
  const oriented = storedToOrientedPoint(
    point,
    { width: frame.pixelWidth, height: frame.pixelHeight },
    frame.rotationDegrees
  );
  const transform = frame.previewTransform;
  const previewPoint = {
    x: transform.offsetX + oriented.x * transform.scaleX,
    y: transform.offsetY + oriented.y * transform.scaleY,
  };
  return roundPoint({
    x: frame.mirrored ? frame.previewDimensions.width - previewPoint.x : previewPoint.x,
    y: previewPoint.y,
  });
}

export function rectToQuadrilateral(rect: CaptureRect): CaptureQuadrilateral {
  return {
    topLeft: { x: rect.x, y: rect.y },
    topRight: { x: rect.x + rect.width, y: rect.y },
    bottomRight: { x: rect.x + rect.width, y: rect.y + rect.height },
    bottomLeft: { x: rect.x, y: rect.y + rect.height },
  };
}

export function previewRectToPhotoQuadrilateral(frame: CapturedFrame, rect: CaptureRect): CaptureQuadrilateral {
  const previewQuad = rectToQuadrilateral(rect);
  return roundQuad({
    topLeft: previewPointToPhotoPoint(frame, previewQuad.topLeft),
    topRight: previewPointToPhotoPoint(frame, previewQuad.topRight),
    bottomRight: previewPointToPhotoPoint(frame, previewQuad.bottomRight),
    bottomLeft: previewPointToPhotoPoint(frame, previewQuad.bottomLeft),
  });
}

export function quadrilateralBounds(quad: CaptureQuadrilateral): CaptureRect {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function clampCropRect(rect: CaptureRect, photo: CaptureSize): CaptureRect | null {
  const photoWidth = Math.max(1, photo.width);
  const photoHeight = Math.max(1, photo.height);
  const left = Math.max(0, Math.min(photoWidth, rect.x));
  const top = Math.max(0, Math.min(photoHeight, rect.y));
  const right = Math.max(left, Math.min(photoWidth, rect.x + rect.width));
  const bottom = Math.max(top, Math.min(photoHeight, rect.y + rect.height));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function expandCropRect(rect: CaptureRect, photo: CaptureSize, ratio = 0): CaptureRect | null {
  const expansion = Math.min(rect.width, rect.height) * Math.max(0, ratio);
  return clampCropRect({
    x: rect.x - expansion,
    y: rect.y - expansion,
    width: rect.width + expansion * 2,
    height: rect.height + expansion * 2,
  }, photo);
}

export function getCropFromPreviewRect(
  frame: CapturedFrame,
  previewRect: CaptureRect,
  paddingRatio = 0
): CaptureRect | null {
  const quad = previewRectToPhotoQuadrilateral(frame, previewRect);
  return expandCropRect(
    quadrilateralBounds(quad),
    { width: frame.pixelWidth, height: frame.pixelHeight },
    paddingRatio
  );
}

export function captureRectToManipulatorCrop(rect: CaptureRect) {
  return {
    originX: Math.max(0, Math.round(rect.x)),
    originY: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

type Homography = [number, number, number, number, number, number, number, number, number];

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
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    if (Math.abs(denominator) > 1e-9) {
      g = (dx3 * dy2 - dx2 * dy3) / denominator;
      h = (dx1 * dy3 - dx3 * dy1) / denominator;
    }
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

function invertHomography(matrix: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const A = e * i - f * h;
  const B = c * h - b * i;
  const C = b * f - c * e;
  const D = f * g - d * i;
  const E = a * i - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  const determinant = a * A + b * D + c * G;

  if (Math.abs(determinant) < 1e-9) {
    throw new Error('Captured card quadrilateral cannot be perspective mapped.');
  }

  return [
    A / determinant,
    B / determinant,
    C / determinant,
    D / determinant,
    E / determinant,
    F / determinant,
    G / determinant,
    H / determinant,
    I / determinant,
  ];
}

function applyHomography(matrix: Homography, point: CapturePoint): CapturePoint {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const denominator = g * point.x + h * point.y + i;
  if (Math.abs(denominator) < 1e-9) {
    throw new Error('Captured card point cannot be mapped because it is outside the valid perspective plane.');
  }
  return roundPoint({
    x: (a * point.x + b * point.y + c) / denominator,
    y: (d * point.x + e * point.y + f) / denominator,
  });
}

export function correctedCardPointToPhotoPoint(frame: CapturedFrame, point: CapturePoint): CapturePoint {
  const homography = makeUnitSquareToQuadHomography(frame.detectedCardQuadrilateral);
  return applyHomography(homography, point);
}

export function photoPointToCorrectedCardPoint(frame: CapturedFrame, point: CapturePoint): CapturePoint {
  const homography = makeUnitSquareToQuadHomography(frame.detectedCardQuadrilateral);
  return applyHomography(invertHomography(homography), point);
}

export function createCapturedFrame(input: CapturedFrameInput): CapturedFrame {
  const pixelWidth = Math.max(1, finiteOr(input.pixelWidth, 1));
  const pixelHeight = Math.max(1, finiteOr(input.pixelHeight, 1));
  const previewWidth = Math.max(1, finiteOr(input.previewWidth, 1));
  const previewHeight = Math.max(1, finiteOr(input.previewHeight, 1));
  const rotationDegrees = normalizeRotation(input.rotationDegrees);
  const previewResizeMode = input.previewResizeMode ?? 'cover';
  const source = orientedPhotoSize(pixelWidth, pixelHeight, rotationDegrees);
  const previewTransform = getPreviewTransform(source, { width: previewWidth, height: previewHeight }, previewResizeMode);

  const provisionalFrame = {
    originalUri: input.originalUri,
    pixelWidth,
    pixelHeight,
    orientation: input.orientation ?? 'unknown',
    rotationDegrees,
    mirrored: Boolean(input.mirrored),
    previewDimensions: Object.freeze({ width: previewWidth, height: previewHeight }),
    previewResizeMode,
    safeAreaInsets: Object.freeze({
      top: finiteOr(input.safeAreaInsets?.top, 0),
      right: finiteOr(input.safeAreaInsets?.right, 0),
      bottom: finiteOr(input.safeAreaInsets?.bottom, 0),
      left: finiteOr(input.safeAreaInsets?.left, 0),
    }),
    detectedCardQuadrilateral: fullPhotoQuad(pixelWidth, pixelHeight),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    scanSessionId: input.scanSessionId ?? createCaptureSessionId(),
    previewTransform: Object.freeze(previewTransform),
  };

  const detectedCardQuadrilateral = input.detectedCardQuadrilateral
    ? roundQuad(input.detectedCardQuadrilateral)
    : input.detectedCardPreviewRect
      ? previewRectToPhotoQuadrilateral(provisionalFrame, input.detectedCardPreviewRect)
      : fullPhotoQuad(pixelWidth, pixelHeight);

  return Object.freeze({
    ...provisionalFrame,
    detectedCardQuadrilateral: freezeQuad(detectedCardQuadrilateral),
  });
}
