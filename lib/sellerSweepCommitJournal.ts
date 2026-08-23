import type { SellerInventoryBatchResult } from './inventory';
import { sellerBatchRequestId } from './sellerCache';
import {
  SELLER_SWEEP_MAX_INVENTORY_ITEMS,
  SELLER_SWEEP_MAX_REVIEWED_LINES,
  type SellerSweepInventoryBatchProposal,
} from './sellerSweepBatchPlanner';

export const SELLER_SWEEP_COMMIT_JOURNAL_VERSION = 1 as const;
export const SELLER_SWEEP_COMMIT_JOURNAL_PREFIX = 'stackr:seller-sweep-commit:v1';

export type SellerSweepCommitJournalState =
  | 'pending'
  | 'unconfirmed'
  | 'committed_needs_refresh'
  | 'committed';

export type SellerSweepCommitJournalEntry = {
  schemaVersion: typeof SELLER_SWEEP_COMMIT_JOURNAL_VERSION;
  userId: string;
  sourceSessionId: string;
  state: SellerSweepCommitJournalState;
  proposal: SellerSweepInventoryBatchProposal;
  result: SellerInventoryBatchResult | null;
  createdAt: string;
  updatedAt: string;
};

export class SellerSweepCommitJournalError extends Error {
  readonly code = 'seller_sweep_commit_journal_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'SellerSweepCommitJournalError';
  }
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/;

function invalid(message: string): never {
  throw new SellerSweepCommitJournalError(message);
}

function cleanBoundedText(value: unknown, maximumLength: number) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function isIsoTimestamp(value: unknown) {
  return cleanBoundedText(value, 64)
    && Number.isFinite(Date.parse(String(value)));
}

function assertUniqueIds(rows: unknown[], label: string) {
  const ids = rows.map((row) => (row as { id?: unknown } | null)?.id);
  if (ids.some((id) => !cleanBoundedText(id, 512)) || new Set(ids).size !== ids.length) {
    invalid(`${label} contains an invalid or duplicate ID.`);
  }
}

export function assertSellerSweepProposalForCommit(
  proposal: SellerSweepInventoryBatchProposal,
) {
  if (!proposal || typeof proposal !== 'object' || !REQUEST_PATTERN.test(proposal.requestId ?? '')) {
    invalid('Seller Sweep request ID is invalid.');
  }
  if (!Array.isArray(proposal.expectedItems)
    || !Array.isArray(proposal.items)
    || !Array.isArray(proposal.movements)
    || !Array.isArray(proposal.binderDeltas)
    || proposal.sale !== null) {
    invalid('Seller Sweep proposal shape is invalid.');
  }
  if (proposal.expectedItems.length > SELLER_SWEEP_MAX_INVENTORY_ITEMS
    || proposal.items.length > SELLER_SWEEP_MAX_INVENTORY_ITEMS
    || proposal.movements.length < 1
    || proposal.movements.length > SELLER_SWEEP_MAX_REVIEWED_LINES
    || proposal.binderDeltas.length > SELLER_SWEEP_MAX_REVIEWED_LINES) {
    invalid('Seller Sweep proposal exceeds the reviewed batch limits.');
  }

  assertUniqueIds(proposal.expectedItems, 'Expected inventory');
  assertUniqueIds(proposal.items, 'Desired inventory');
  assertUniqueIds(proposal.movements, 'Inventory movements');

  const desiredItemIds = new Set(proposal.items.map((item) => item.id));
  for (const movement of proposal.movements) {
    if (!cleanBoundedText(movement.inventory_item_id, 512)
      || !desiredItemIds.has(movement.inventory_item_id)
      || movement.action_type !== 'scan_in'
      || movement.reason !== 'Added to Sell/Trade'
      || !Number.isSafeInteger(movement.quantity)
      || movement.quantity < 1) {
      invalid('Seller Sweep movement does not match the reviewed inventory proposal.');
    }
  }
  return proposal;
}

export function assertSellerSweepCommitResult(
  proposal: SellerSweepInventoryBatchProposal,
  result: SellerInventoryBatchResult,
  expectedUserId: string,
) {
  assertSellerSweepProposalForCommit(proposal);
  const expectedRequestId = sellerBatchRequestId(expectedUserId, proposal.requestId);
  if (!result
    || typeof result !== 'object'
    || !cleanBoundedText(result.requestId, 128)
    || result.requestId !== expectedRequestId
    || result.inventoryItemCount !== proposal.items.length
    || result.movementCount !== proposal.movements.length
    || result.binderDeltaCount !== proposal.binderDeltas.length
    || result.saleRecorded !== false
    || typeof result.replayed !== 'boolean') {
    invalid('Seller Sweep commit receipt does not match the reviewed proposal.');
  }
  return result;
}

export function sellerSweepCommitJournalKey(userId: string, sourceSessionId: string) {
  if (!UUID_PATTERN.test(userId) || !cleanBoundedText(sourceSessionId, 256)) {
    invalid('Seller Sweep journal identity is invalid.');
  }
  return `${SELLER_SWEEP_COMMIT_JOURNAL_PREFIX}:${userId}:${sourceSessionId}`;
}

export function createSellerSweepCommitJournalEntry(input: {
  userId: string;
  sourceSessionId: string;
  state: SellerSweepCommitJournalState;
  proposal: SellerSweepInventoryBatchProposal;
  result?: SellerInventoryBatchResult | null;
  createdAt: string;
  updatedAt?: string;
}): SellerSweepCommitJournalEntry {
  sellerSweepCommitJournalKey(input.userId, input.sourceSessionId);
  assertSellerSweepProposalForCommit(input.proposal);
  if (!isIsoTimestamp(input.createdAt) || !isIsoTimestamp(input.updatedAt ?? input.createdAt)) {
    invalid('Seller Sweep journal timestamp is invalid.');
  }
  const result = input.result ?? null;
  if (input.state === 'committed' || input.state === 'committed_needs_refresh') {
    if (!result) invalid('Committed Seller Sweep journal is missing its receipt.');
    assertSellerSweepCommitResult(input.proposal, result, input.userId);
  } else if (result !== null) {
    invalid('Unconfirmed Seller Sweep journal cannot contain a committed receipt.');
  }
  return {
    schemaVersion: SELLER_SWEEP_COMMIT_JOURNAL_VERSION,
    userId: input.userId,
    sourceSessionId: input.sourceSessionId,
    state: input.state,
    proposal: input.proposal,
    result,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };
}

export function serializeSellerSweepCommitJournal(entry: SellerSweepCommitJournalEntry) {
  return JSON.stringify(createSellerSweepCommitJournalEntry(entry));
}

export function parseSellerSweepCommitJournal(
  raw: string | null,
  expected: { userId: string; sourceSessionId: string },
) {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid('Seller Sweep journal is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') invalid('Seller Sweep journal is invalid.');
  const entry = parsed as SellerSweepCommitJournalEntry;
  if (entry.schemaVersion !== SELLER_SWEEP_COMMIT_JOURNAL_VERSION
    || entry.userId !== expected.userId
    || entry.sourceSessionId !== expected.sourceSessionId
    || !['pending', 'unconfirmed', 'committed_needs_refresh', 'committed'].includes(entry.state)) {
    invalid('Seller Sweep journal does not match the active account and scan session.');
  }
  return createSellerSweepCommitJournalEntry(entry);
}
