export type RecognitionFeatureFlags = {
  localRecognitionEnabled: boolean;
  localRecognitionShadowMode: boolean;
  legacyCloudFallbackEnabled: boolean;
  scannerDiagnosticsEnabled: boolean;
  recognitionFeedbackEnabled: boolean;
  stackrApiEnabled: boolean;
  onDeviceEmbeddingEnabled: boolean;
  stackrRecognitionPrimary: boolean;
  imageFallbackEnabled: boolean;
  ximilarEmergencyFallback: boolean;
  scanFeedbackEnabled: boolean;
};

function flagFromEnv(value: string | undefined, defaultValue: boolean) {
  if (value == null || value === '') return defaultValue;
  return value === 'true' || value === '1';
}

export function getRecognitionFeatureFlags(env: Record<string, string | undefined> = process.env): RecognitionFeatureFlags {
  const stackrApiEnabled = flagFromEnv(env.EXPO_PUBLIC_STACKR_API_ENABLED, false);
  const onDeviceEmbeddingEnabled = flagFromEnv(
    env.EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED,
    flagFromEnv(env.EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED, false)
  );
  const ximilarEmergencyFallback = flagFromEnv(
    env.EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK,
    flagFromEnv(env.EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED, true)
  );
  const scanFeedbackEnabled = flagFromEnv(
    env.EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED,
    flagFromEnv(env.EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED, true)
  );

  return {
    localRecognitionEnabled: flagFromEnv(env.EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED, false),
    localRecognitionShadowMode: flagFromEnv(env.EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE, false),
    legacyCloudFallbackEnabled: ximilarEmergencyFallback,
    scannerDiagnosticsEnabled: flagFromEnv(env.EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED, false),
    recognitionFeedbackEnabled: flagFromEnv(env.EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED, true),
    stackrApiEnabled,
    onDeviceEmbeddingEnabled,
    stackrRecognitionPrimary: flagFromEnv(env.EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY, false),
    imageFallbackEnabled: flagFromEnv(env.EXPO_PUBLIC_IMAGE_FALLBACK_ENABLED, false),
    ximilarEmergencyFallback,
    scanFeedbackEnabled,
  };
}

export const defaultRecognitionFeatureFlags = getRecognitionFeatureFlags();
