export const SELLER_ATOMIC_WRITES_ENABLED: boolean = false;

export const SELLER_ATOMIC_WRITES_DISABLED_MESSAGE =
  'Seller inventory updates are disabled in this bridge release.';

export function assertSellerAtomicWritesEnabled() {
  if (!SELLER_ATOMIC_WRITES_ENABLED) {
    throw new Error(SELLER_ATOMIC_WRITES_DISABLED_MESSAGE);
  }
}

export function isSellerAtomicWritesDisabledError(error: unknown) {
  return error instanceof Error && error.message === SELLER_ATOMIC_WRITES_DISABLED_MESSAGE;
}
