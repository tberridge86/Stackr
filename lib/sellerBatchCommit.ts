export type SellerBatchRpcResponse<T> = {
  data: T | null;
  error: unknown | null;
};

export class SellerInventoryCommitReconciliationRequiredError extends Error {
  readonly code = 'seller_inventory_commit_reconciliation_required';

  constructor(
    readonly requestId: string,
    readonly outcome: 'unconfirmed' | 'committed_identity_unverified',
    options?: { cause?: unknown },
  ) {
    super(
      outcome === 'unconfirmed'
        ? 'Seller inventory save status could not be confirmed.'
        : 'Seller inventory was saved, but the active account could not be verified.',
      options,
    );
    this.name = 'SellerInventoryCommitReconciliationRequiredError';
  }
}

export class SellerInventoryCommitAccountChangedError extends Error {
  readonly code = 'seller_inventory_commit_account_changed';

  constructor() {
    super('Seller account changed before the save could continue.');
    this.name = 'SellerInventoryCommitAccountChangedError';
  }
}

export function isSellerInventoryCommitReconciliationRequired(error: unknown) {
  return error instanceof SellerInventoryCommitReconciliationRequiredError
    || (error as { code?: string } | null)?.code === 'seller_inventory_commit_reconciliation_required';
}

export function isSellerInventoryCommitAccountChanged(error: unknown) {
  return error instanceof SellerInventoryCommitAccountChangedError
    || (error as { code?: string } | null)?.code === 'seller_inventory_commit_account_changed';
}

export function canStartSellerInventoryCommit({
  reconciliationRequired,
  loadError,
}: {
  reconciliationRequired: boolean;
  loadError: string | null;
}) {
  return !reconciliationRequired && !loadError;
}

export async function executeSellerBatchWithIdentity<T>({
  requestId,
  verifyIdentity,
  invoke,
  isRetryableError,
  waitBeforeRetry,
}: {
  requestId: string;
  verifyIdentity: () => Promise<boolean>;
  invoke: () => Promise<SellerBatchRpcResponse<T>>;
  isRetryableError: (error: unknown) => boolean;
  waitBeforeRetry: () => Promise<void>;
}) {
  let outcomeMayBeCommitted = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (!await verifyIdentity()) {
        if (outcomeMayBeCommitted) {
          throw new SellerInventoryCommitReconciliationRequiredError(requestId, 'unconfirmed');
        }
        throw new SellerInventoryCommitAccountChangedError();
      }
    } catch (error) {
      if (isSellerInventoryCommitReconciliationRequired(error)
        || isSellerInventoryCommitAccountChanged(error)) throw error;
      if (outcomeMayBeCommitted) {
        throw new SellerInventoryCommitReconciliationRequiredError(
          requestId,
          'unconfirmed',
          { cause: error },
        );
      }
      throw error;
    }

    let response: SellerBatchRpcResponse<T>;
    try {
      response = await invoke();
    } catch (error) {
      outcomeMayBeCommitted = true;
      if (attempt === 0 && isRetryableError(error)) {
        try {
          await waitBeforeRetry();
        } catch (waitError) {
          throw new SellerInventoryCommitReconciliationRequiredError(
            requestId,
            'unconfirmed',
            { cause: waitError },
          );
        }
        continue;
      }
      throw new SellerInventoryCommitReconciliationRequiredError(
        requestId,
        'unconfirmed',
        { cause: error },
      );
    }

    if (!response.error && response.data != null) {
      let identityMatches = false;
      try {
        identityMatches = await verifyIdentity();
      } catch (error) {
        throw new SellerInventoryCommitReconciliationRequiredError(
          requestId,
          'committed_identity_unverified',
          { cause: error },
        );
      }
      if (!identityMatches) {
        throw new SellerInventoryCommitReconciliationRequiredError(
          requestId,
          'committed_identity_unverified',
        );
      }
      return response.data;
    }

    if (!response.error) {
      throw new SellerInventoryCommitReconciliationRequiredError(requestId, 'unconfirmed');
    }

    if (outcomeMayBeCommitted || isRetryableError(response.error)) {
      outcomeMayBeCommitted = true;
      if (attempt === 0) {
        try {
          await waitBeforeRetry();
        } catch (waitError) {
          throw new SellerInventoryCommitReconciliationRequiredError(
            requestId,
            'unconfirmed',
            { cause: waitError },
          );
        }
        continue;
      }
      throw new SellerInventoryCommitReconciliationRequiredError(
        requestId,
        'unconfirmed',
        { cause: response.error },
      );
    }

    throw response.error;
  }

  throw new SellerInventoryCommitReconciliationRequiredError(requestId, 'unconfirmed');
}
