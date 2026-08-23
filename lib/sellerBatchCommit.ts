import { sha256Text } from './sha256';
import type { SellerSweepInventoryItem } from './sellerSweepBatchPlanner';

export type SellerBatchRpcResponse<T> = {
  data: T | null;
  error: unknown | null;
};

export class SellerInventoryCommitReconciliationRequiredError extends Error {
  readonly code = 'seller_inventory_commit_reconciliation_required';

  constructor(
    readonly requestId: string,
    readonly outcome: 'unconfirmed' | 'committed_identity_unverified' | 'committed_state_unverified',
    options?: { cause?: unknown },
  ) {
    super(
      outcome === 'unconfirmed'
        ? 'Seller inventory save status could not be confirmed.'
        : outcome === 'committed_identity_unverified'
          ? 'Seller inventory was saved, but the active account could not be verified.'
          : 'Seller inventory was saved, but live inventory does not match the reviewed proposal.',
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

function canonicalSellerValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Seller inventory contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSellerValue).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalSellerValue(record[key])}`)
      .join(',')}}`;
  }
  throw new Error('Seller inventory contains an unsupported value.');
}

function canonicalTimestamp(value: string, field: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`Seller inventory ${field} is invalid.`);
  return new Date(milliseconds).toISOString();
}

export function canonicalSellerInventoryState(
  items: readonly SellerSweepInventoryItem[],
): string {
  if (!Array.isArray(items)) throw new Error('Seller inventory state must be an array.');
  const ids = items.map((item) => item?.id);
  if (ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error('Seller inventory state contains an invalid or duplicate item ID.');
  }
  const canonicalItems = items
    .map((item) => ({
      id: item.id,
      card_id: item.card_id,
      set_id: item.set_id,
      condition: item.condition,
      quantity: item.quantity,
      asking_price: item.asking_price,
      buy_price: item.buy_price,
      notes: item.notes,
      card: item.card,
      created_at: canonicalTimestamp(item.created_at, `${item.id}.created_at`),
      updated_at: canonicalTimestamp(item.updated_at, `${item.id}.updated_at`),
    }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return canonicalSellerValue(canonicalItems);
}

export function getSellerInventoryStateHash(items: readonly SellerSweepInventoryItem[]) {
  return sha256Text(canonicalSellerInventoryState(items));
}

export function assertSellerInventoryPostCommitState(input: {
  requestId: string;
  expectedItems: readonly SellerSweepInventoryItem[];
  liveItems: readonly SellerSweepInventoryItem[];
}) {
  const expectedCanonical = canonicalSellerInventoryState(input.expectedItems);
  const liveCanonical = canonicalSellerInventoryState(input.liveItems);
  const expectedStateHash = sha256Text(expectedCanonical);
  const liveStateHash = sha256Text(liveCanonical);
  if (expectedCanonical !== liveCanonical || expectedStateHash !== liveStateHash) {
    throw new SellerInventoryCommitReconciliationRequiredError(
      input.requestId,
      'committed_state_unverified',
    );
  }
  return Object.freeze({ expectedStateHash, liveStateHash });
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
