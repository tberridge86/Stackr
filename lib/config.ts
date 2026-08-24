const APP_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT ?? process.env.APP_VARIANT ?? 'production';
const IS_PRODUCTION_APP = APP_VARIANT === 'production';
const IS_STAGING_APP = !IS_PRODUCTION_APP;
const PRODUCTION_PRICE_API_URL = 'https://pocketvault-production.up.railway.app';
const DEFAULT_PRICE_API_URL = IS_STAGING_APP ? '' : PRODUCTION_PRICE_API_URL;

export const PRICE_API_URL = (
  process.env.PRICE_API_URL
  ?? process.env.EXPO_PUBLIC_PRICE_API_URL
  ?? DEFAULT_PRICE_API_URL
).replace(/\/$/, '');
export const STACKR_API_URL = (
  process.env.EXPO_PUBLIC_STACKR_API_URL
  ?? process.env.STACKR_API_URL
  ?? (IS_STAGING_APP ? '' : PRICE_API_URL)
).replace(/\/$/, '');

const configuredPublicApiUrls = [PRICE_API_URL, STACKR_API_URL].filter(Boolean);
if (IS_PRODUCTION_APP && configuredPublicApiUrls.some((url) => /staging/i.test(url))) {
  throw new Error('Production app build is configured with a staging API URL.');
}
if (IS_STAGING_APP && configuredPublicApiUrls.some((url) => url === PRODUCTION_PRICE_API_URL)) {
  throw new Error(`${APP_VARIANT} app build is configured with the production API URL.`);
}
export const BETA_TRADE_DEMO_MODE = process.env.EXPO_PUBLIC_BETA_TRADE_DEMO_MODE !== 'false';
export const CAPTURE_GEOMETRY_V2_ENABLED = process.env.EXPO_PUBLIC_CAPTURE_GEOMETRY_V2 !== 'false';
export const CARD_LOCALISATION_ENABLED = process.env.EXPO_PUBLIC_CARD_LOCALISATION !== 'false';
export const CARD_LOCALISATION_SAMPLE_FPS = Number(process.env.EXPO_PUBLIC_CARD_LOCALISATION_SAMPLE_FPS ?? 4);
export const CARD_LOCALISATION_SAFETY_MARGIN = Number(process.env.EXPO_PUBLIC_CARD_LOCALISATION_SAFETY_MARGIN ?? 0.025);
export const SCAN_QUALITY_ENABLED = process.env.EXPO_PUBLIC_SCAN_QUALITY !== 'false';
export const SCAN_QUALITY_DEVICE_PROFILE = process.env.EXPO_PUBLIC_SCAN_QUALITY_DEVICE_PROFILE ?? 'balanced';
export const SCAN_QUALITY_DIAGNOSTICS_ENABLED = process.env.EXPO_PUBLIC_SCAN_QUALITY_DIAGNOSTICS === 'true';
export const SCAN_AUTO_CAPTURE_V2_ENABLED = process.env.EXPO_PUBLIC_SCAN_AUTO_CAPTURE_V2 !== 'false';
export const SCAN_AUTO_CAPTURE_STABLE_FRAMES = Number(process.env.EXPO_PUBLIC_SCAN_AUTO_CAPTURE_STABLE_FRAMES ?? 2);
export const SCAN_FRAME_CONSENSUS_ENABLED = process.env.EXPO_PUBLIC_SCAN_FRAME_CONSENSUS !== 'false';
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
  process.env.EXPO_PUBLIC_SCAN_LAB_UPLOAD_API_URL
  ?? `${PRICE_API_URL}/api/scan-lab`
).replace(/\/$/, '');
export const RECOGNITION_FEEDBACK_API_URL = (
  process.env.EXPO_PUBLIC_RECOGNITION_FEEDBACK_API_URL
  ?? `${PRICE_API_URL}/api/recognition-feedback`
).replace(/\/$/, '');
export const SHADOW_MODE_PILOT_API_URL = (
  process.env.EXPO_PUBLIC_SHADOW_MODE_PILOT_API_URL
  ?? `${PRICE_API_URL}/api/recognition-shadow-mode`
).replace(/\/$/, '');
export const USD_TO_GBP = 0.79;
export const EUR_TO_GBP = 0.85;
