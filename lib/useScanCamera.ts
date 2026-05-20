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
  resizeWidth?: number;
  compress?: number;
};

function getCenteredCardCrop(photoWidth?: number, photoHeight?: number) {
  if (!photoWidth || !photoHeight) return null;

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
      const crop = options.cropToCard ? getCenteredCardCrop(photo.width, photo.height) : null;
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
