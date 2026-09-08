import type { ReadonlyFrameProcessor } from 'react-native-vision-camera';
import { Camera as VisionCamera } from 'react-native-vision-camera';

export {
  Camera,
  VisionCameraProxy,
  runAtTargetFps,
  useCameraDevices,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
export type {
  Camera as CameraRef,
  CameraRuntimeError,
  Frame,
  Point,
} from 'react-native-vision-camera';
export type FrameProcessor = ReadonlyFrameProcessor;

export function getCameraPermissionStatus() {
  return VisionCamera.getCameraPermissionStatus();
}
