// lib/useScanCamera.ts (New File)
import { useRef, useState } from 'react';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useScanStore } from './scanStore';

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
    frameCenterY?: number;
    marginRatio?: number;
  };
  resizeWidth?: number;
  compress?: number;
};

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
    const originX = hiddenX + ((frame.previewWidth - frame.frameWidth) / 2) * scaleX;
    const originY = hiddenY + (frameCenterY - frame.frameHeight / 2) * scaleY;

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

export function useScanCamera(
  initialContinuous = false,
  addToScanQueue = true,
  options: ScanCameraOptions = {}
) {
  const camera = useRef<Camera>(null);
  const [torch, setTorch] = useState<'off' | 'on'>('off');
  const [isContinuous, setIsContinuous] = useState(initialContinuous);
  const devices = useCameraDevices();
  const device = devices.find(d => d.position === 'back');
  const scanStore = useScanStore();
  

  const takePhoto = async () => {
    if (camera.current) {
      const photo = await camera.current.takePhoto();
      const crop = options.cropToCard ? getCenteredCardCrop(photo.width, photo.height, options.cropFrame) : null;
      const actions: ImageManipulator.Action[] = [
        ...(crop ? [{ crop }] : []),
        { resize: { width: options.resizeWidth ?? 600 } },
      ];
      const manipulated = await ImageManipulator.manipulateAsync(
        `file://${photo.path}`,
        actions,
        { compress: options.compress ?? 0.4, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      // Add to queue OR legacy callback
      if (addToScanQueue) {
        scanStore.addScanned(manipulated.base64!);
        scanStore.triggerCallback(manipulated.base64!); // Backward compat
      }
      
      if (isContinuous) {
        // Auto-loop for pack scanning (1s delay to reposition)
        setTimeout(() => takePhoto(), 1000);
      }

      return {
        uri: manipulated.uri,
        base64: manipulated.base64 ?? '',
      };
    }

    return null;
  };

  const toggleTorch = () => {
    setTorch(t => t === 'on' ? 'off' : 'on');
  };

  return { 
    camera, 
    device, 
    torch, 
    toggleTorch, 
    takePhoto, 
    isContinuous,
    setIsContinuous
  };
}
