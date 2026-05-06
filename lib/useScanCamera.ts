// lib/useScanCamera.ts (New File)
import { useRef, useState } from 'react';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useScanStore } from './scanStore';

export function useScanCamera(isContinuous = false) {
  const camera = useRef<Camera>(null);
  const [torch, setTorch] = useState<'off' | 'on'>('off');
  const devices = useCameraDevices();
  const device = devices.back;
  const scanStore = useScanStore();
  

  const takePhoto = async () => {
    if (camera.current?.camera) {
      const photo = await camera.current.camera.takePhoto({ 
        qualityPrioritization: 'speed' 
      });
      const manipulated = await ImageManipulator.manipulateAsync(
        `file://${photo.path}`,
        [{ resize: { width: 600 } }], // Speed: Smaller than 900
        { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      // Add to queue OR legacy callback
      scanStore.addScanned(manipulated.base64!);
      scanStore.triggerCallback(manipulated.base64!); // Backward compat
      
      if (isContinuous) {
        // Auto-loop for pack scanning (1s delay to reposition)
        setTimeout(() => takePhoto(), 1000);
      }
    }
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
    isContinuous 
  };
}