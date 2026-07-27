export type RecognitionFeatureFlags = {
  localRecognitionEnabled: boolean;
  localRecognitionShadowMode: boolean;
  legacyCloudFallbackEnabled: boolean;
  scannerDiagnosticsEnabled: boolean;
  recognitionFeedbackEnabled: boolean;
};

function flagFromEnv(value: string | undefined, defaultValue: boolean) {
  if (value == null || value === '') return defaultValue;
  return value === 'true' || value === '1';
}

export function getRecognitionFeatureFlags(env: Record<string, string | undefined> = process.env): RecognitionFeatureFlags {
  return {
    localRecognitionEnabled: flagFromEnv(env.EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED, false),
    localRecognitionShadowMode: flagFromEnv(env.EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE, false),
    legacyCloudFallbackEnabled: flagFromEnv(env.EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED, true),
    scannerDiagnosticsEnabled: flagFromEnv(env.EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED, false),
    recognitionFeedbackEnabled: flagFromEnv(env.EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED, true),
  };
}

export const defaultRecognitionFeatureFlags = getRecognitionFeatureFlags();

