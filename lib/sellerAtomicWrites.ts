export const SELLER_ATOMIC_WRITES_ENABLED: boolean = false;

export class SellerAtomicWritesDisabledError extends Error {
  readonly code = 'SELLER_ATOMIC_WRITES_DISABLED';

  constructor() {
    super('Seller inventory writes are disabled in this release.');
    this.name = 'SellerAtomicWritesDisabledError';
  }
}

export function assertSellerAtomicWritesEnabled() {
  if (!SELLER_ATOMIC_WRITES_ENABLED) {
    throw new SellerAtomicWritesDisabledError();
  }
}

export function isSellerAtomicWritesDisabledError(error: unknown) {
  return error instanceof SellerAtomicWritesDisabledError
    || (typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'SELLER_ATOMIC_WRITES_DISABLED');
}
