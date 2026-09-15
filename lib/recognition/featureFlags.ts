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

// Expo only inlines direct process.env.EXPO_PUBLIC_* accesses in app code.
// Build this object at the boundary; injected test environments must replace it,
// not merge with it, so an empty test configuration never inherits build flags.
function readBuildTimeRecognitionEnvironment(): Record<string, string | undefined> {
  return {
    EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED: process.env.EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED,
    EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE: process.env.EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE,
    EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED: process.env.EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED,
    EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED: process.env.EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED,
    EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED: process.env.EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED,
    EXPO_PUBLIC_STACKR_API_ENABLED: process.env.EXPO_PUBLIC_STACKR_API_ENABLED,
    EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED: process.env.EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED,
    EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY: process.env.EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY,
    EXPO_PUBLIC_IMAGE_FALLBACK_ENABLED: process.env.EXPO_PUBLIC_IMAGE_FALLBACK_ENABLED,
    EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK: process.env.EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK,
    EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED: process.env.EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED,
  };
}

export function getRecognitionFeatureFlags(
  env: Record<string, string | undefined> = readBuildTimeRecognitionEnvironment()
): RecognitionFeatureFlags {
  const stackrApiEnabled = flagFromEnv(env.EXPO_PUBLIC_STACKR_API_ENABLED, false);
  const onDeviceEmbeddingEnabled = flagFromEnv(
    env.EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED,
    flagFromEnv(env.EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED, false)
  );
  const ximilarEmergencyFallback = flagFromEnv(
    env.EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK,
    // Paid fallback is opt-in, including when build configuration is missing.
    flagFromEnv(env.EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED, false)
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
