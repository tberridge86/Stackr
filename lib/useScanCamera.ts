import { useEffect, useRef, useState } from 'react';
import { useCameraDevices, type CameraRef, type Point } from './visionCamera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useScanStore } from './scanStore';
import {
  captureRectToManipulatorCrop,
  createCapturedFrame,
  getCropFromPreviewRect,
} from './captureGeometry';
import {
  buildCardRectificationRequest,
  orientationToRotationDegrees,
  type CardRectificationCameraPosition,
  type CardRectificationResult,
} from './cardRectification';
import {
  recordCapturedPhotoForRectification,
  recordCardRectificationResult,
} from './cardRectificationStore';
import type { CardFrameAnalyserCorners } from './cardVisionFrameAnalyser';
import { CAPTURE_GEOMETRY_V2_ENABLED } from './config';
import { rectifyCapturedCard } from './stackrCardVision';

const CARD_ASPECT_RATIO = 0.716;
const CARD_CROP_WIDTH_RATIO = 0.96;
const CARD_CROP_HEIGHT_RATIO = 0.98;

type ScanCameraOptions = {
  cropToCard?: boolean;
  cropFrame?: {
    previewWidth: number;
    previewHeight: number;
    frameWidth: number;
    frameHeight: number;
    frameX?: number;
    frameY?: number;
    frameCenterY?: number;
    marginRatio?: number;
  };
  resizeWidth?: number;
  compress?: number;
  autoRepeat?: boolean;
  includeBase64?: boolean;
};

type ScanCameraTakePhotoOptions = {
  acceptedCorners?: CardFrameAnalyserCorners | null;
  scanId?: string;
  rectify?: boolean;
  cameraPosition?: CardRectificationCameraPosition;
};

function toFileUri(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('file://') || path.startsWith('content://')) return path;
  return `file://${path}`;
}

function getCenteredCardCrop(
  photoWidth?: number,
  photoHeight?: number,
  frame?: ScanCameraOptions['cropFrame']
) {
  if (!photoWidth || !photoHeight) return null;

  if (frame?.previewWidth && frame?.previewHeight && frame.frameWidth && frame.frameHeight) {
    const sensorAspect = photoWidth / photoHeight;
    const previewAspect = frame.previewWidth / frame.previewHeight;
    let visiblePhotoWidth = photoWidth;
    let visiblePhotoHeight = photoHeight;
    let hiddenX = 0;
    let hiddenY = 0;

    if (sensorAspect > previewAspect) {
      visiblePhotoWidth = photoHeight * previewAspect;
      hiddenX = (photoWidth - visiblePhotoWidth) / 2;
    } else {
      visiblePhotoHeight = photoWidth / previewAspect;
      hiddenY = (photoHeight - visiblePhotoHeight) / 2;
    }

    const scaleX = visiblePhotoWidth / frame.previewWidth;
    const scaleY = visiblePhotoHeight / frame.previewHeight;
    const frameCenterY = frame.frameCenterY ?? frame.previewHeight / 2;
    const frameX = frame.frameX ?? (frame.previewWidth - frame.frameWidth) / 2;
    const frameY = frame.frameY ?? frameCenterY - frame.frameHeight / 2;
    const originX = hiddenX + frameX * scaleX;
    const originY = hiddenY + frameY * scaleY;

    const marginRatio = frame.marginRatio ?? 0;
    const rawWidth = frame.frameWidth * scaleX;
    const rawHeight = frame.frameHeight * scaleY;
    const width = Math.min(photoWidth, Math.round(rawWidth * (1 + marginRatio)));
    const height = Math.min(photoHeight, Math.round(rawHeight * (1 + marginRatio)));
    const marginX = (width - rawWidth) / 2;
    const marginY = (height - rawHeight) / 2;
    const clampedOriginX = Math.max(0, Math.min(photoWidth - width, Math.round(originX - marginX)));
    const clampedOriginY = Math.max(0, Math.min(photoHeight - height, Math.round(originY - marginY)));

    return {
      originX: clampedOriginX,
      originY: clampedOriginY,
      width,
      height,
    };
  }

  let cropWidth = photoWidth * CARD_CROP_WIDTH_RATIO;
  let cropHeight = cropWidth / CARD_ASPECT_RATIO;
  const maxCropHeight = photoHeight * CARD_CROP_HEIGHT_RATIO;

  if (cropHeight > maxCropHeight) {
    cropHeight = maxCropHeight;
    cropWidth = cropHeight * CARD_ASPECT_RATIO;
  }

    return {
      originX: Math.max(0, Math.round((photoWidth - cropWidth) / 2)),
      originY: Math.max(0, Math.round((photoHeight - cropHeight) / 2)),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight),
    };
}

function getSharedGeometryCrop(
  photoWidth?: number,
  photoHeight?: number,
  frame?: ScanCameraOptions['cropFrame']
) {
  if (!CAPTURE_GEOMETRY_V2_ENABLED || !photoWidth || !photoHeight || !frame?.previewWidth || !frame.previewHeight) {
    return null;
  }

  const frameCenterY = frame.frameCenterY ?? frame.previewHeight / 2;
  const frameX = frame.frameX ?? (frame.previewWidth - frame.frameWidth) / 2;
  const frameY = frame.frameY ?? frameCenterY - frame.frameHeight / 2;
  const capturedFrame = createCapturedFrame({
    originalUri: 'vision-camera-capture',
    pixelWidth: photoWidth,
    pixelHeight: photoHeight,
    orientation: frame.previewWidth >= frame.previewHeight ? 'landscapeLeft' : 'portrait',
    rotationDegrees: 0,
    mirrored: false,
    previewWidth: frame.previewWidth,
    previewHeight: frame.previewHeight,
    previewResizeMode: 'cover',
    detectedCardPreviewRect: {
      x: frameX,
      y: frameY,
      width: frame.frameWidth,
      height: frame.frameHeight,
    },
  });
  const crop = getCropFromPreviewRect(capturedFrame, {
    x: frameX,
    y: frameY,
    width: frame.frameWidth,
    height: frame.frameHeight,
  }, frame.marginRatio ?? 0);

  return crop ? captureRectToManipulatorCrop(crop) : null;
}

export function useScanCamera(
  initialContinuous = false,
  addToScanQueue = true,
  options: ScanCameraOptions = {}
) {
  const camera = useRef<CameraRef>(null);
  const [torch, setTorch] = useState<'off' | 'on'>('off');
  const [isContinuous, setIsContinuous] = useState(initialContinuous);
  const devices = useCameraDevices();
  const device = devices.find(d => d.position === 'back');
  const scanStore = useScanStore();
  const continuousTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (continuousTimeoutRef.current) {
        clearTimeout(continuousTimeoutRef.current);
        continuousTimeoutRef.current = null;
      }
    };
  }, []);
  

  const takePhoto = async (
    _source: 'auto' | 'manual' | 'repeat' = 'manual',
    captureOptions: ScanCameraTakePhotoOptions = {}
  ) => {
    if (camera.current) {
      const photo = await camera.current.takePhoto({ flash: 'off', enableShutterSound: false });
      const photoUri = toFileUri(photo.path);
      if (!photoUri) {
        throw new Error('Camera returned a photo without a file path.');
      }
      let rectification: CardRectificationResult | null = null;
      if (captureOptions.scanId) {
        recordCapturedPhotoForRectification(captureOptions.scanId, photoUri);
      }
      if (
        captureOptions.rectify === true &&
        captureOptions.acceptedCorners &&
        captureOptions.scanId &&
        options.cropFrame?.previewWidth &&
        options.cropFrame.previewHeight
      ) {
        try {
          const orientation = (photo as any).orientation as string | undefined;
          const photoWidth = photo.width ?? 1;
          const photoHeight = photo.height ?? 1;
          const request = buildCardRectificationRequest({
            scanId: captureOptions.scanId,
            sourcePhotoUri: photoUri,
            photoWidth,
            photoHeight,
            photoOrientation: orientation,
            mirrored: Boolean((photo as any).isMirrored),
            cameraPosition: captureOptions.cameraPosition ?? (device?.position === 'back' ? 'back' : 'unknown'),
            previewWidth: options.cropFrame.previewWidth,
            previewHeight: options.cropFrame.previewHeight,
            previewResizeMode: 'cover',
            acceptedCorners: captureOptions.acceptedCorners,
          });
          rectification = rectifyCapturedCard({
            ...request,
            rotationDegrees: orientationToRotationDegrees(orientation),
          });
        } catch (error) {
          rectification = {
            status: 'failed',
            scanId: captureOptions.scanId,
            message: error instanceof Error ? error.message : String(error),
          };
        }
        recordCardRectificationResult(captureOptions.scanId, rectification);
      }

      const crop = options.cropToCard
        ? getSharedGeometryCrop(photo.width, photo.height, options.cropFrame)
          ?? getCenteredCardCrop(photo.width, photo.height, options.cropFrame)
        : null;
      const actions: ImageManipulator.Action[] = [
        ...(crop ? [{ crop }] : []),
        { resize: { width: options.resizeWidth ?? 600 } },
      ];
      const manipulated = await ImageManipulator.manipulateAsync(
        photoUri,
        actions,
        {
          compress: options.compress ?? 0.4,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: options.includeBase64 !== false,
        }
      );
      
      // Add to queue OR legacy callback
      if (addToScanQueue) {
        scanStore.addScanned(manipulated.base64!);
        scanStore.triggerCallback(manipulated.base64!); // Backward compat
      }
      
      if (options.autoRepeat === true && isContinuous && mountedRef.current) {
        // Auto-loop for pack scanning (1s delay to reposition)
        if (continuousTimeoutRef.current) clearTimeout(continuousTimeoutRef.current);
        continuousTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) void takePhoto('repeat');
        }, 1000);
      }

      return {
        uri: manipulated.uri,
        base64: manipulated.base64 ?? '',
        rectification,
        originalPhotoUri: photoUri,
        originalPhotoWidth: photo.width ?? null,
        originalPhotoHeight: photo.height ?? null,
        originalPhotoOrientation: ((photo as any).orientation as string | undefined) ?? null,
      };
    }

    return null;
  };

  const toggleTorch = () => {
    setTorch(t => t === 'on' ? 'off' : 'on');
  };

  const focusAtPoint = async (point: Point): Promise<boolean> => {
    if (!camera.current?.focus) return false;
    try {
      await camera.current.focus(point);
      return true;
    } catch {
      return false;
    }
  };

  return { 
    camera, 
    device, 
    torch, 
    toggleTorch, 
    takePhoto, 
    focusAtPoint,
    isContinuous,
    setIsContinuous
  };
}
