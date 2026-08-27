import { isSellerTrialModeEnabled } from './sellerTrial';

export const PREMIUM_SELLER_ENTITLEMENT_KEY = 'stackr_premium_seller';

export type PremiumSellerAccess = {
  enabled: boolean;
  entitled: boolean;
  allowed: boolean;
  reason: 'available' | 'disabled' | 'not_entitled';
};

type UserLike = {
  id?: string;
  app_metadata?: Record<string, unknown> | null;
} | null | undefined;

type PremiumSellerEnvironment = {
  APP_VARIANT?: string;
  EXPO_PUBLIC_APP_VARIANT?: string;
  EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED?: string;
  EXPO_PUBLIC_SELLER_TRIAL_MODE?: string;
};

export function isPremiumSellerModeEnabled(
  env?: PremiumSellerEnvironment,
) {
  const configuredValue = env
    ? env.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED
    : process.env.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED;
  return configuredValue === 'true';
}

export function hasPremiumSellerEntitlement(user: UserLike) {
  return user?.app_metadata?.[PREMIUM_SELLER_ENTITLEMENT_KEY] === true;
}

export function getPremiumSellerAccess(
  user: UserLike,
  env?: PremiumSellerEnvironment,
): PremiumSellerAccess {
  const enabled = isPremiumSellerModeEnabled(env);
  const entitled = hasPremiumSellerEntitlement(user);
  const trialAllowed = Boolean(user?.id) && isSellerTrialModeEnabled(env);
  const allowed = (enabled && entitled) || trialAllowed;

  return {
    enabled,
    entitled,
    allowed,
    reason: allowed ? 'available' : enabled ? 'not_entitled' : 'disabled',
  };
}

export function canPublishPremiumSellerModeChange({
  expectedUserId,
  currentUserId,
  accessAllowed,
  nextMode,
}: {
  expectedUserId: string;
  currentUserId: string | null;
  accessAllowed: boolean;
  nextMode: 'collector' | 'seller';
}) {
  return currentUserId === expectedUserId
    && (nextMode === 'collector' || accessAllowed);
}

export function assertPremiumSellerWriteAccess(
  user: UserLike,
  env?: PremiumSellerEnvironment,
) {
  // A staging Seller Trial may open the UI, but it must never cross the live
  // seller RPC boundary. Only the server-recognised entitlement unlocks it.
  if (!isPremiumSellerModeEnabled(env) || !hasPremiumSellerEntitlement(user)) {
    throw new Error('Premium Seller Mode is not available for this account.');
  }
}
