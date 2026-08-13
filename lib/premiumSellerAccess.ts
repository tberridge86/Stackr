export const PREMIUM_SELLER_ENTITLEMENT_KEY = 'stackr_premium_seller';

export type PremiumSellerAccess = {
  enabled: boolean;
  entitled: boolean;
  allowed: boolean;
  reason: 'available' | 'disabled' | 'not_entitled';
};

type UserLike = {
  app_metadata?: Record<string, unknown> | null;
} | null | undefined;

type PremiumSellerEnvironment = {
  EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED?: string;
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
  const allowed = enabled && entitled;

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
  if (!getPremiumSellerAccess(user, env).allowed) {
    throw new Error('Premium Seller Mode is not available for this account.');
  }
}
