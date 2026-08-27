import { MOBILE_RUNTIME_CONFIG } from './mobileRuntimeConfig';

export const PRICE_API_URL = MOBILE_RUNTIME_CONFIG.priceApiUrl;
export const STACKR_API_URL = MOBILE_RUNTIME_CONFIG.stackrApiUrl;

// This approval must be changed in source and reviewed before mobile commerce can run.
// A public Expo environment variable is intentionally unable to enable payments alone.
export const LIVE_COMMERCE_RELEASE_APPROVED = false;

export function isBetaTradeDemoMode(
  configuredMode = process.env.EXPO_PUBLIC_BETA_TRADE_DEMO_MODE,
): boolean {
  return !LIVE_COMMERCE_RELEASE_APPROVED || configuredMode !== 'false';
}

export const BETA_TRADE_DEMO_MODE = isBetaTradeDemoMode();
export const TRADE_CASH_TERMS_ENABLED = (
  LIVE_COMMERCE_RELEASE_APPROVED && !BETA_TRADE_DEMO_MODE
);
export const TRADE_FULFILMENT_ENABLED = LIVE_COMMERCE_RELEASE_APPROVED;

export function assertTradeFulfilmentEnabled(): void {
  if (!TRADE_FULFILMENT_ENABLED) {
    throw new Error('Trade fulfilment is disabled for this release.');
  }
}
export const CAPTURE_GEOMETRY_V2_ENABLED = process.env.EXPO_PUBLIC_CAPTURE_GEOMETRY_V2 !== 'false';
export const CARD_LOCALISATION_ENABLED = process.env.EXPO_PUBLIC_CARD_LOCALISATION !== 'false';
export const CARD_LOCALISATION_SAMPLE_FPS = Number(process.env.EXPO_PUBLIC_CARD_LOCALISATION_SAMPLE_FPS ?? 4);
export const CARD_LOCALISATION_SAFETY_MARGIN = Number(process.env.EXPO_PUBLIC_CARD_LOCALISATION_SAFETY_MARGIN ?? 0.025);
export const SCAN_QUALITY_ENABLED = process.env.EXPO_PUBLIC_SCAN_QUALITY !== 'false';
export const SCAN_QUALITY_DEVICE_PROFILE = process.env.EXPO_PUBLIC_SCAN_QUALITY_DEVICE_PROFILE ?? 'balanced';
export const SCAN_QUALITY_DIAGNOSTICS_ENABLED = process.env.EXPO_PUBLIC_SCAN_QUALITY_DIAGNOSTICS === 'true';
export const SCAN_AUTO_CAPTURE_V2_ENABLED = process.env.EXPO_PUBLIC_SCAN_AUTO_CAPTURE_V2 !== 'false';
export const SCAN_AUTO_CAPTURE_STABLE_FRAMES = Number(process.env.EXPO_PUBLIC_SCAN_AUTO_CAPTURE_STABLE_FRAMES ?? 2);
export const SCAN_LOCAL_OCR_MATCHER_ENABLED = process.env.EXPO_PUBLIC_SCAN_LOCAL_OCR_MATCHER !== 'false';
export const SCAN_LOCAL_OCR_STRONG_CONFIDENCE = Number(process.env.EXPO_PUBLIC_SCAN_LOCAL_OCR_STRONG_CONFIDENCE ?? 0.84);
export const SCAN_XIMILAR_FALLBACK_ENABLED = process.env.EXPO_PUBLIC_SCAN_XIMILAR_FALLBACK !== 'false';
export const SCAN_BINDER_PAGE_V2_ENABLED = process.env.EXPO_PUBLIC_SCAN_BINDER_PAGE_V2 !== 'false';
export const SCAN_BINDER_PAGE_REMOTE_CONCURRENCY = Number(process.env.EXPO_PUBLIC_SCAN_BINDER_PAGE_REMOTE_CONCURRENCY ?? 2);
export const SCAN_LAB_INTERNAL_ENABLED = (
  process.env.EXPO_PUBLIC_STACKR_SCAN_LAB_ENABLED === 'true' ||
  (typeof __DEV__ !== 'undefined' && __DEV__ === true)
);
export const SCAN_LAB_UPLOAD_API_URL = (
  `${PRICE_API_URL}/api/scan-lab`
).replace(/\/$/, '');
export const RECOGNITION_FEEDBACK_API_URL = (
  `${PRICE_API_URL}/api/recognition-feedback`
).replace(/\/$/, '');
export const SHADOW_MODE_PILOT_API_URL = (
  `${PRICE_API_URL}/api/recognition-shadow-mode`
).replace(/\/$/, '');
export const USD_TO_GBP = 0.79;
export const EUR_TO_GBP = 0.85;
