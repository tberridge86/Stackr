const DEFAULT_PRICE_API_URL = 'https://pocketvault-production.up.railway.app';

export const PRICE_API_URL = (
  process.env.PRICE_API_URL
  ?? process.env.EXPO_PUBLIC_PRICE_API_URL
  ?? DEFAULT_PRICE_API_URL
).replace(/\/$/, '');
export const BETA_TRADE_DEMO_MODE = process.env.EXPO_PUBLIC_BETA_TRADE_DEMO_MODE !== 'false';
export const USD_TO_GBP = 0.79;
export const EUR_TO_GBP = 0.85;
