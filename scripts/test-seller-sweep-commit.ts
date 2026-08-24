import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertSellerInventoryPostCommitState,
  canonicalSellerInventoryState,
  executeSellerBatchWithIdentity,
  getSellerInventoryStateHash,
  isSellerInventoryCommitAccountChanged,
  isSellerInventoryCommitReconciliationRequired,
} from '../lib/sellerBatchCommit';
import { getPremiumSellerAccess } from '../lib/premiumSellerAccess';
import { sellerBatchRequestId } from '../lib/sellerCache';
import {
  assertSellerSweepCommitResult,
  createSellerSweepCommitJournalEntry,
  parseSellerSweepCommitJournal,
  sellerSweepCommitJournalKey,
  serializeSellerSweepCommitJournal,
  SellerSweepCommitJournalError,
} from '../lib/sellerSweepCommitJournal';
import type { SellerSweepInventoryBatchProposal } from '../lib/sellerSweepBatchPlanner';

const userId = '00000000-0000-4000-8000-000000000001';
const sourceSessionId = 'sweep-session-1';

function proposal(): SellerSweepInventoryBatchProposal {
  const timestamp = '2026-08-14T09:00:00.000Z';
  return {
    requestId: 'seller:sweep-session-1',
    expectedItems: [],
    items: [{
      id: 'inventory-card-1',
      card_id: 'card-1',
      set_id: 'set-1',
      condition: 'Near Mint',
      quantity: 2,
      asking_price: null,
      buy_price: null,
      notes: null,
      card: {
        id: 'card-1',
        name: 'Exact card',
        number: '001',
        set_id: 'set-1',
        set_name: 'Test Set',
        rarity: null,
        image_small: null,
        image_large: null,
        tcg_price: null,
        ebay_price: null,
        cardmarket_price: null,
        language: 'en',
        variant_code: 'normal',
      },
      created_at: timestamp,
      updated_at: timestamp,
    }],
    movements: [{
      id: 'sweep:seller:sweep-session-1:movement:001',
      inventory_item_id: 'inventory-card-1',
      action_type: 'scan_in',
      card_id: 'card-1',
      set_id: 'set-1',
      card_name: 'Exact card',
      quantity: 2,
      reason: 'Added to Sell/Trade',
      binder_id: null,
      binder_name: null,
      collection_id: null,
      value_at_time: null,
      image_small: null,
      created_at: timestamp,
    }],
    sale: null,
    binderDeltas: [],
  };
}

const batch = proposal();
const receipt = {
  requestId: sellerBatchRequestId(userId, batch.requestId),
  inventoryItemCount: 1,
  movementCount: 1,
  binderDeltaCount: 0,
  saleRecorded: false,
  replayed: false,
};

const expectedLiveItems = batch.items.map((item) => ({
  ...item,
  persisted_card_snapshot: { ...item.card },
  created_at: '2026-08-14T10:00:00+01:00',
  updated_at: '2026-08-14T10:00:00+01:00',
}));
const stateProof = assertSellerInventoryPostCommitState({
  requestId: receipt.requestId,
  expectedItems: batch.items,
  liveItems: expectedLiveItems,
});
assert.equal(stateProof.expectedStateHash, stateProof.liveStateHash);
assert.equal(getSellerInventoryStateHash(batch.items), getSellerInventoryStateHash(expectedLiveItems));
assert.equal(canonicalSellerInventoryState(batch.items), canonicalSellerInventoryState(expectedLiveItems));
const secondExpectedItem = {
  ...batch.items[0],
  id: 'inventory-card-2',
  card_id: 'card-2',
  card: { ...batch.items[0].card, id: 'card-2', name: 'Second exact card' },
};
assert.equal(
  getSellerInventoryStateHash([batch.items[0], secondExpectedItem]),
  getSellerInventoryStateHash([secondExpectedItem, batch.items[0]]),
  'Live inventory row order must not change the canonical state hash.',
);
assert.throws(
  () => assertSellerInventoryPostCommitState({
    requestId: receipt.requestId,
    expectedItems: batch.items,
    liveItems: expectedLiveItems.map((item) => ({ ...item, quantity: item.quantity + 1 })),
  }),
  (error: unknown) => isSellerInventoryCommitReconciliationRequired(error),
  'A live quantity mismatch must keep Seller Sweep in reconciliation.',
);
assert.throws(
  () => assertSellerInventoryPostCommitState({
    requestId: receipt.requestId,
    expectedItems: batch.items,
    liveItems: expectedLiveItems.map((item) => ({
      ...item,
      card: { ...item.card, variant_code: 'reverse_holo' },
    })),
  }),
  (error: unknown) => isSellerInventoryCommitReconciliationRequired(error),
  'A live canonical-card mismatch must keep Seller Sweep in reconciliation.',
);

const pending = createSellerSweepCommitJournalEntry({
  userId,
  sourceSessionId,
  state: 'pending',
  proposal: batch,
  result: null,
  createdAt: '2026-08-14T09:01:00.000Z',
});
const pendingBody = serializeSellerSweepCommitJournal(pending);
assert.deepEqual(
  parseSellerSweepCommitJournal(pendingBody, { userId, sourceSessionId }),
  pending,
);
assert.match(sellerSweepCommitJournalKey(userId, sourceSessionId), new RegExp(userId));
assert.throws(
  () => parseSellerSweepCommitJournal(pendingBody, {
    userId: '00000000-0000-4000-8000-000000000002',
    sourceSessionId,
  }),
  SellerSweepCommitJournalError,
);
assert.throws(
  () => parseSellerSweepCommitJournal('{', { userId, sourceSessionId }),
  SellerSweepCommitJournalError,
);
assert.throws(
  () => createSellerSweepCommitJournalEntry({ ...pending, state: 'committed', result: null }),
  SellerSweepCommitJournalError,
);

const awaitingRefresh = createSellerSweepCommitJournalEntry({
  ...pending,
  state: 'committed_needs_refresh',
  result: receipt,
  updatedAt: '2026-08-14T09:02:00.000Z',
});
assert.equal(awaitingRefresh.result?.requestId, receipt.requestId);
assert.deepEqual(assertSellerSweepCommitResult(batch, receipt, userId), receipt);
assert.throws(
  () => assertSellerSweepCommitResult(batch, { ...receipt, movementCount: 2 }, userId),
  SellerSweepCommitJournalError,
);
assert.throws(
  () => assertSellerSweepCommitResult(batch, {
    ...receipt,
    requestId: sellerBatchRequestId(userId, 'seller:different'),
  }, userId),
  SellerSweepCommitJournalError,
);
assert.throws(
  () => assertSellerSweepCommitResult(batch, {
    ...receipt,
    requestId: sellerBatchRequestId(
      '00000000-0000-4000-8000-000000000002',
      batch.requestId,
    ),
  }, userId),
  SellerSweepCommitJournalError,
  'The same request token from another account must not satisfy recovery.',
);
assert.throws(
  () => createSellerSweepCommitJournalEntry({
    ...pending,
    state: 'committed',
    result: {
      ...receipt,
      requestId: sellerBatchRequestId(
        '00000000-0000-4000-8000-000000000002',
        batch.requestId,
      ),
    },
  }),
  SellerSweepCommitJournalError,
);

assert.equal(
  getPremiumSellerAccess(
    { app_metadata: { stackr_premium_seller: true } },
    { EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'true' },
  ).allowed,
  true,
);
assert.equal(
  getPremiumSellerAccess(
    { app_metadata: { stackr_premium_seller: 'true' } },
    { EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED: 'true' },
  ).allowed,
  false,
  'Entitlement must be the exact JSON boolean.',
);

async function main() {
let invocations = 0;
const recovered = await executeSellerBatchWithIdentity({
  requestId: receipt.requestId,
  verifyIdentity: async () => true,
  invoke: async () => {
    invocations += 1;
    return invocations === 1
      ? { data: null, error: { code: 'PGRST000' } }
      : { data: { ...receipt, replayed: true }, error: null };
  },
  isRetryableError: (error) => (error as { code?: string })?.code === 'PGRST000',
  waitBeforeRetry: async () => undefined,
});
assert.equal(invocations, 2);
assert.equal(recovered.replayed, true);

await assert.rejects(
  executeSellerBatchWithIdentity({
    requestId: receipt.requestId,
    verifyIdentity: async () => true,
    invoke: async () => {
      throw new Error('network request failed');
    },
    isRetryableError: () => true,
    waitBeforeRetry: async () => undefined,
  }),
  (error: unknown) => isSellerInventoryCommitReconciliationRequired(error),
);

await assert.rejects(
  executeSellerBatchWithIdentity({
    requestId: receipt.requestId,
    verifyIdentity: async () => false,
    invoke: async () => ({ data: receipt, error: null }),
    isRetryableError: () => false,
    waitBeforeRetry: async () => undefined,
  }),
  (error: unknown) => isSellerInventoryCommitAccountChanged(error),
);

let identityChecks = 0;
await assert.rejects(
  executeSellerBatchWithIdentity({
    requestId: receipt.requestId,
    verifyIdentity: async () => {
      identityChecks += 1;
      return identityChecks === 1;
    },
    invoke: async () => ({ data: null, error: { code: 'PGRST000' } }),
    isRetryableError: () => true,
    waitBeforeRetry: async () => undefined,
  }),
  (error: unknown) => isSellerInventoryCommitReconciliationRequired(error),
);

const inventorySource = readFileSync('lib/inventory.ts', 'utf8');
assert.match(inventorySource, /rpc\('commit_seller_inventory_batch', rpcInput\)/);
assert.match(inventorySource, /assertPremiumSellerWriteAccess\(user\)/);
assert.match(inventorySource, /sellerBatchRequestId\(user\.id, requestToken\)/);
assert.match(inventorySource, /user\.id !== input\.expectedUserId/);
assert.match(inventorySource, /return \{ userId: user\.id, items \}/);

const migrationSource = readFileSync(
  'supabase/migrations/20260822223828_atomic_seller_inventory_batches.sql',
  'utf8',
);
assert.match(migrationSource, /security invoker/i);
assert.doesNotMatch(migrationSource, /security definer/i);
assert.match(migrationSource, /v_user_id uuid := \(select auth\.uid\(\)\)/i);
assert.match(migrationSource, /pg_catalog\.pg_advisory_xact_lock/);
assert.doesNotMatch(migrationSource, /lock table public\.seller_inventory_items/i);
assert.match(migrationSource, /row\([\s\S]+?\) is distinct from row\(/);
assert.match(migrationSource, /primary key \(user_id, request_id\)/i);
assert.match(migrationSource, /return v_prior_result \|\| jsonb_build_object\('replayed', true\)/);
assert.match(migrationSource, /from public, anon;/i);
assert.match(migrationSource, /to authenticated;/i);

const sellerCacheSource = readFileSync('lib/sellerCache.ts', 'utf8');
assert.match(sellerCacheSource, /seller-batch:\$\{userId\}:\$\{requestToken\}/);

const sweepScreen = readFileSync('app/scan/sweep-result.tsx', 'utf8');
assert.ok(
  sweepScreen.indexOf('persistSellerJournal(activeJournal)')
    < sweepScreen.indexOf('commitSellerInventoryBatch({'),
  'The durable recovery journal must be verified before the RPC is sent.',
);
assert.match(sweepScreen, /committed_needs_refresh/);
assert.match(sweepScreen, /Verify saved batch/);
assert.match(sweepScreen, /loadVerifiedSellerInventorySnapshot\(\)/);
assert.match(sweepScreen, /expectedItems: verifiedInventory\.items/);
assert.match(sweepScreen, /setSellerPreparedForUserId\(verifiedInventory\.userId\)/);
assert.match(sweepScreen, /expectedUserId: activeJournal\.userId/);
assert.match(sweepScreen, /refreshedInventory\.userId !== committed\.userId/);
assert.match(sweepScreen, /assertSellerInventoryPostCommitState\(\{/);
assert.ok(
  sweepScreen.indexOf('assertSellerInventoryPostCommitState({')
    < sweepScreen.indexOf("state: 'committed',", sweepScreen.indexOf('assertSellerInventoryPostCommitState({')),
  'Live inventory must match the proposal before the journal can be marked committed.',
);
assert.match(sweepScreen, /committed\.userId !== activeJournal\.userId/);
assert.match(sweepScreen, /onAuthStateChange/);
assert.match(sweepScreen, /sellerJournalCheckedSessionId !== activeSweepSessionId/);

console.log('Seller Sweep atomic commit and recovery tests passed.');
}

void main();
