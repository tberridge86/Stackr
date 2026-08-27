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

function getRuntimeRecognitionEnvironment(): Record<string, string | undefined> {
  // These direct references are required for Expo/Metro to embed build flags.
  // Passing an explicit object to getRecognitionFeatureFlags remains available
  // for deterministic tests.
  return {
    EXPO_PUBLIC_STACKR_API_ENABLED: process.env.EXPO_PUBLIC_STACKR_API_ENABLED,
    EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED: process.env.EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED,
    EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED: process.env.EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED,
    EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK: process.env.EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK,
    EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED: process.env.EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED,
    EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED: process.env.EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED,
    EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED: process.env.EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED,
    EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE: process.env.EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE,
    EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED: process.env.EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED,
    EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY: process.env.EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY,
    EXPO_PUBLIC_IMAGE_FALLBACK_ENABLED: process.env.EXPO_PUBLIC_IMAGE_FALLBACK_ENABLED,
  };
}

export function getRecognitionFeatureFlags(env?: Record<string, string | undefined>): RecognitionFeatureFlags {
  const source = env ?? getRuntimeRecognitionEnvironment();
  const stackrApiEnabled = flagFromEnv(source.EXPO_PUBLIC_STACKR_API_ENABLED, false);
  const onDeviceEmbeddingEnabled = flagFromEnv(
    source.EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED,
    flagFromEnv(source.EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED, false)
  );
  const ximilarEmergencyFallback = flagFromEnv(
    source.EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK,
    flagFromEnv(source.EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED, true)
  );
  const scanFeedbackEnabled = flagFromEnv(
    source.EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED,
    flagFromEnv(source.EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED, true)
  );

  return {
    localRecognitionEnabled: flagFromEnv(source.EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED, false),
    localRecognitionShadowMode: flagFromEnv(source.EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE, false),
    legacyCloudFallbackEnabled: ximilarEmergencyFallback,
    scannerDiagnosticsEnabled: flagFromEnv(source.EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED, false),
    recognitionFeedbackEnabled: flagFromEnv(source.EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED, true),
    stackrApiEnabled,
    onDeviceEmbeddingEnabled,
    stackrRecognitionPrimary: flagFromEnv(source.EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY, false),
    imageFallbackEnabled: flagFromEnv(source.EXPO_PUBLIC_IMAGE_FALLBACK_ENABLED, false),
    ximilarEmergencyFallback,
    scanFeedbackEnabled,
  };
}

export const defaultRecognitionFeatureFlags = getRecognitionFeatureFlags();
