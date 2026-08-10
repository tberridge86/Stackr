import type {
  CaptureOrientation,
  CaptureQuadrilateral,
  CaptureRect,
  CaptureResizeMode,
} from './captureGeometry';
import {
  createCapturedFrame,
  previewRectToPhotoQuadrilateral,
  previewPointToPhotoPoint,
} from './captureGeometry';
import type { CardFrameAnalyserCorners } from './cardVisionFrameAnalyser';

export const STACKR_CARD_RECTIFICATION_VERSION = 'stackr-card-rectification-v1.0.0';
export const STACKR_CARD_ROI_MAPPING_VERSION = 'stackr-pokemon-card-roi-v1.0.0';

export const RECTIFIED_CARD_ASPECT_RATIO = 0.7;
export const RECOGNITION_CROP_SIZE = Object.freeze({ width: 224, height: 320 });
export const THUMBNAIL_SIZE = Object.freeze({ width: 112, height: 160 });

export type CardRectificationCameraPosition = 'back' | 'front' | 'unknown';

export type CardRectificationRoiId =
  | 'cardTitle'
  | 'artwork'
  | 'collectorNumber'
  | 'setRarity'
  | 'regulationCopyright'
  | 'fullFront'
  | 'fullBack'
  | 'leftEdge';

export type CardRectificationRoi = {
  id: CardRectificationRoiId;
  label: string;
  rect: CaptureRect;
};

export type CardRectificationRoiManifest = {
  version: string;
  cardAspectRatio: number;
  coordinateSpace: 'rectified_card_normalized';
  regions: readonly CardRectificationRoi[];
};

export type CardRectificationRequest = {
  version: string;
  scanId: string;
  sourcePhotoUri: string;
  photoWidth: number;
  photoHeight: number;
  photoOrientation: CaptureOrientation;
  rotationDegrees: 0 | 90 | 180 | 270;
  mirrored: boolean;
  cameraPosition: CardRectificationCameraPosition;
  previewWidth: number;
  previewHeight: number;
  previewResizeMode: CaptureResizeMode;
  previewCorners: CaptureQuadrilateral;
  recognitionWidth: number;
  recognitionHeight: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  roiMappingVersion: string;
};

export type CardRectificationImageOutput = {
  uri: string;
  width: number;
  height: number;
  role: 'rectified_full' | 'recognition_crop' | 'ocr_source_crop' | 'thumbnail' | 'roi_crop';
  mimeType: 'image/png' | 'image/jpeg';
};

export type CardRectificationTransform = {
  version: string;
  sourcePreviewCorners: CaptureQuadrilateral;
  sourcePhotoCorners: CaptureQuadrilateral;
  rectifiedSize: {
    width: number;
    height: number;
  };
  recognitionSize: {
    width: number;
    height: number;
  };
  roiMappingVersion: string;
};

export type CardRectificationResult = {
  status: 'success' | 'skipped' | 'failed';
  scanId: string | null;
  rectifiedFull?: CardRectificationImageOutput | null;
  recognitionCrop?: CardRectificationImageOutput | null;
  ocrSourceCrop?: CardRectificationImageOutput | null;
  thumbnail?: CardRectificationImageOutput | null;
  roiCrops?: Partial<Record<CardRectificationRoiId, CardRectificationImageOutput>> | null;
  transform?: CardRectificationTransform | null;
  roiManifest?: CardRectificationRoiManifest | null;
  message?: string | null;
};

const DEFAULT_CARD_ROI_REGIONS: readonly CardRectificationRoi[] = Object.freeze([
  { id: 'fullFront', label: 'Full front', rect: { x: 0, y: 0, width: 1, height: 1 } },
  { id: 'fullBack', label: 'Full back', rect: { x: 0, y: 0, width: 1, height: 1 } },
  { id: 'cardTitle', label: 'Card title', rect: { x: 0.07, y: 0.035, width: 0.66, height: 0.085 } },
  { id: 'artwork', label: 'Artwork', rect: { x: 0.075, y: 0.18, width: 0.85, height: 0.36 } },
  { id: 'collectorNumber', label: 'Collector number', rect: { x: 0.06, y: 0.855, width: 0.34, height: 0.055 } },
  { id: 'setRarity', label: 'Set / rarity', rect: { x: 0.38, y: 0.845, width: 0.3, height: 0.07 } },
  { id: 'regulationCopyright', label: 'Regulation / copyright', rect: { x: 0.055, y: 0.905, width: 0.89, height: 0.07 } },
  { id: 'leftEdge', label: 'Left edge', rect: { x: 0, y: 0.04, width: 0.08, height: 0.92 } },
]);

export const DEFAULT_CARD_ROI_MANIFEST: CardRectificationRoiManifest = Object.freeze({
  version: STACKR_CARD_ROI_MAPPING_VERSION,
  cardAspectRatio: RECTIFIED_CARD_ASPECT_RATIO,
  coordinateSpace: 'rectified_card_normalized',
  regions: DEFAULT_CARD_ROI_REGIONS,
});

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function rounded(value: number) {
  return Number(value.toFixed(4));
}

function roundQuad(quad: CaptureQuadrilateral): CaptureQuadrilateral {
  return {
    topLeft: { x: rounded(quad.topLeft.x), y: rounded(quad.topLeft.y) },
    topRight: { x: rounded(quad.topRight.x), y: rounded(quad.topRight.y) },
    bottomRight: { x: rounded(quad.bottomRight.x), y: rounded(quad.bottomRight.y) },
    bottomLeft: { x: rounded(quad.bottomLeft.x), y: rounded(quad.bottomLeft.y) },
  };
}

export function orientationToRotationDegrees(orientation?: string | null): 0 | 90 | 180 | 270 {
  switch (orientation) {
    case 'landscape-left':
    case 'landscapeLeft':
      return 90;
    case 'portrait-upside-down':
    case 'portraitUpsideDown':
      return 180;
    case 'landscape-right':
    case 'landscapeRight':
      return 270;
    case 'portrait':
    default:
      return 0;
  }
}

export function normalizeCaptureOrientation(orientation?: string | null): CaptureOrientation {
  switch (orientation) {
    case 'portrait-upside-down':
      return 'portraitUpsideDown';
    case 'landscape-left':
      return 'landscapeLeft';
    case 'landscape-right':
      return 'landscapeRight';
    case 'portrait':
      return 'portrait';
    default:
      return 'unknown';
  }
}

export function normalisedCornersToPreviewCorners(
  corners: CardFrameAnalyserCorners,
  previewWidth: number,
  previewHeight: number
): CaptureQuadrilateral {
  const width = Math.max(1, previewWidth);
  const height = Math.max(1, previewHeight);
  return roundQuad({
    topLeft: { x: clamp01(corners.topLeft.x) * width, y: clamp01(corners.topLeft.y) * height },
    topRight: { x: clamp01(corners.topRight.x) * width, y: clamp01(corners.topRight.y) * height },
    bottomRight: { x: clamp01(corners.bottomRight.x) * width, y: clamp01(corners.bottomRight.y) * height },
    bottomLeft: { x: clamp01(corners.bottomLeft.x) * width, y: clamp01(corners.bottomLeft.y) * height },
  });
}

export function roiToPixelRect(roi: CardRectificationRoi, size: { width: number; height: number }): CaptureRect {
  return {
    x: Math.round(roi.rect.x * size.width),
    y: Math.round(roi.rect.y * size.height),
    width: Math.round(roi.rect.width * size.width),
    height: Math.round(roi.rect.height * size.height),
  };
}

export function buildCardRectificationRequest(params: {
  scanId: string;
  sourcePhotoUri: string;
  photoWidth: number;
  photoHeight: number;
  photoOrientation?: string | null;
  mirrored?: boolean;
  cameraPosition?: CardRectificationCameraPosition;
  previewWidth: number;
  previewHeight: number;
  previewResizeMode?: CaptureResizeMode;
  acceptedCorners: CardFrameAnalyserCorners;
}): CardRectificationRequest {
  const cameraPosition = params.cameraPosition ?? 'unknown';
  if (cameraPosition === 'front' || params.mirrored) {
    throw new Error('Card rectification requires an unmirrored back-camera capture.');
  }

  const photoOrientation = normalizeCaptureOrientation(params.photoOrientation);
  return {
    version: STACKR_CARD_RECTIFICATION_VERSION,
    scanId: params.scanId,
    sourcePhotoUri: params.sourcePhotoUri,
    photoWidth: Math.max(1, Math.round(params.photoWidth)),
    photoHeight: Math.max(1, Math.round(params.photoHeight)),
    photoOrientation,
    rotationDegrees: orientationToRotationDegrees(params.photoOrientation),
    mirrored: false,
    cameraPosition,
    previewWidth: Math.max(1, Math.round(params.previewWidth)),
    previewHeight: Math.max(1, Math.round(params.previewHeight)),
    previewResizeMode: params.previewResizeMode ?? 'cover',
    previewCorners: normalisedCornersToPreviewCorners(
      params.acceptedCorners,
      params.previewWidth,
      params.previewHeight
    ),
    recognitionWidth: RECOGNITION_CROP_SIZE.width,
    recognitionHeight: RECOGNITION_CROP_SIZE.height,
    thumbnailWidth: THUMBNAIL_SIZE.width,
    thumbnailHeight: THUMBNAIL_SIZE.height,
    roiMappingVersion: STACKR_CARD_ROI_MAPPING_VERSION,
  };
}

export function mapRectificationPreviewCornersToPhotoCorners(
  request: Pick<
    CardRectificationRequest,
    | 'sourcePhotoUri'
    | 'photoWidth'
    | 'photoHeight'
    | 'photoOrientation'
    | 'rotationDegrees'
    | 'mirrored'
    | 'previewWidth'
    | 'previewHeight'
    | 'previewResizeMode'
    | 'previewCorners'
    | 'scanId'
  >
): CaptureQuadrilateral {
  const frame = createCapturedFrame({
    originalUri: request.sourcePhotoUri,
    pixelWidth: request.photoWidth,
    pixelHeight: request.photoHeight,
    orientation: request.photoOrientation,
    rotationDegrees: request.rotationDegrees,
    mirrored: request.mirrored,
    previewWidth: request.previewWidth,
    previewHeight: request.previewHeight,
    previewResizeMode: request.previewResizeMode,
    scanSessionId: request.scanId,
  });

  return {
    topLeft: previewPointToPhotoPoint(frame, request.previewCorners.topLeft),
    topRight: previewPointToPhotoPoint(frame, request.previewCorners.topRight),
    bottomRight: previewPointToPhotoPoint(frame, request.previewCorners.bottomRight),
    bottomLeft: previewPointToPhotoPoint(frame, request.previewCorners.bottomLeft),
  };
}

export function mapPreviewRectToRectifiedPhotoCorners(params: {
  sourcePhotoUri: string;
  photoWidth: number;
  photoHeight: number;
  photoOrientation: CaptureOrientation;
  rotationDegrees: 0 | 90 | 180 | 270;
  mirrored: boolean;
  previewWidth: number;
  previewHeight: number;
  previewResizeMode: CaptureResizeMode;
  previewRect: CaptureRect;
  scanId: string;
}): CaptureQuadrilateral {
  const frame = createCapturedFrame({
    originalUri: params.sourcePhotoUri,
    pixelWidth: params.photoWidth,
    pixelHeight: params.photoHeight,
    orientation: params.photoOrientation,
    rotationDegrees: params.rotationDegrees,
    mirrored: params.mirrored,
    previewWidth: params.previewWidth,
    previewHeight: params.previewHeight,
    previewResizeMode: params.previewResizeMode,
    scanSessionId: params.scanId,
  });

  return previewRectToPhotoQuadrilateral(frame, params.previewRect);
}
