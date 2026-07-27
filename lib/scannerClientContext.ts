import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export type ScannerClientContext = {
  appVersion: string | null;
  platform: string;
  osName: string | null;
  osVersion: string | null;
  deviceFamily: string;
  deviceTier: 'low' | 'mid' | 'high' | 'unknown';
};

function getDeviceFamily() {
  const model = String(Device.modelName ?? '').toLowerCase();
  if (Platform.OS === 'ios') {
    if (model.includes('ipad')) return 'iPad';
    if (model.includes('iphone')) return 'iPhone';
    return 'iOS device';
  }
  if (Platform.OS === 'android') {
    if (model.includes('tablet') || model.includes('tab')) return 'Android tablet';
    return 'Android phone';
  }
  return Platform.OS;
}

function getDeviceTier(): ScannerClientContext['deviceTier'] {
  const yearClass = Number(Device.deviceYearClass);
  if (!Number.isFinite(yearClass) || yearClass <= 0) return 'unknown';
  if (yearClass >= 2022) return 'high';
  if (yearClass >= 2018) return 'mid';
  return 'low';
}

export function getScannerClientContext(): ScannerClientContext {
  const legacyManifest = (Constants as any).manifest;
  return {
    appVersion: Constants.expoConfig?.version ?? legacyManifest?.version ?? null,
    platform: Platform.OS,
    osName: Device.osName ?? Platform.OS,
    osVersion: Device.osVersion ?? null,
    deviceFamily: getDeviceFamily(),
    deviceTier: getDeviceTier(),
  };
}
