type SellerTrialEnvironment = {
  APP_VARIANT?: string;
  EXPO_PUBLIC_APP_VARIANT?: string;
  EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED?: string;
  EXPO_PUBLIC_SELLER_TRIAL_MODE?: string;
};

function getRuntimeSellerTrialEnvironment(): SellerTrialEnvironment {
  // Expo/Metro only inlines public variables when each property is referenced
  // directly. Keep this object literal so the embedded Android bundle can be
  // inspected and so runtime code never depends on a dynamic process.env read.
  return {
    APP_VARIANT: process.env.APP_VARIANT,
    EXPO_PUBLIC_APP_VARIANT: process.env.EXPO_PUBLIC_APP_VARIANT,
    EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: process.env.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED,
    EXPO_PUBLIC_SELLER_TRIAL_MODE: process.env.EXPO_PUBLIC_SELLER_TRIAL_MODE,
  };
}

/**
 * Seller Trial is deliberately limited to the separately packaged staging app.
 * It never enables the production seller RPC boundary: trial inventory is kept
 * in the signed-in user's device cache and can be discarded with the app data.
 */
export function isSellerTrialModeEnabled(env?: SellerTrialEnvironment) {
  const source = env ?? getRuntimeSellerTrialEnvironment();
  const variant = source.EXPO_PUBLIC_APP_VARIANT ?? source.APP_VARIANT;

  return variant === 'staging'
    && source.EXPO_PUBLIC_SELLER_TRIAL_MODE === 'true';
}

export const SELLER_TRIAL_TITLE = 'Seller Trial — this device only';
export const SELLER_TRIAL_BODY =
  'Try stock intake, stock-out and the seller workspace without live money. Trial inventory stays on this device with no sync or backup, and deleting the app or trial data removes it. Production inventory, binders, listings, orders, payments, shipping labels and payouts are not changed.';
