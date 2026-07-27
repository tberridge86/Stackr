import React, { type DependencyList } from 'react';

export type CameraRef = {
  takePhoto: (options?: Record<string, unknown>) => Promise<{
    path?: string | null;
    width?: number;
    height?: number;
  }>;
  focus?: (point: Point) => Promise<void>;
};

export type Point = {
  x: number;
  y: number;
};

export type CameraRuntimeError = Error;

export type Frame = {
  width: number;
  height: number;
};

export type FrameProcessor = {
  frameProcessor: (frame: Frame) => void;
  type: 'readonly';
};

type CameraDevice = {
  position: string;
  [key: string]: unknown;
};

export const Camera = React.forwardRef<CameraRef, Record<string, unknown>>(function VisionCameraWebFallback() {
  return null;
});

export function useCameraDevices(): CameraDevice[] {
  return [];
}

export function useCameraPermission() {
  return {
    hasPermission: false,
    requestPermission: async () => false,
  };
}

export function useFrameProcessor(
  frameProcessor: (frame: Frame) => void,
  _dependencies?: DependencyList
): FrameProcessor {
  return {
    frameProcessor,
    type: 'readonly',
  };
}

export function runAtTargetFps<T>(_fps: number, func: () => T): T {
  return func();
}

export const VisionCameraProxy = {
  initFrameProcessorPlugin: (_name: string, _options: Record<string, unknown>) => undefined,
};
