import assert from 'node:assert/strict';
import {
  createSellerSweepReviewHandoff,
  createSellerSweepReviewExport,
  getSellerSweepReviewIssues,
  SellerSweepReviewHandoffError,
} from '../lib/sellerSweepReviewHandoff';
import type { SellerSweepInventoryItem } from '../lib/sellerSweepBatchPlanner';
import type { SweepScanSession } from '../lib/sweepScanSession';

function session(overrides: Partial<SweepScanSession> = {}): SweepScanSession {
  return {
    scanSessionId: 'sweep-review-test',
    binderId: null,
    createdAt: '2026-08-13T09:00:00.000Z',
    updatedAt: '2026-08-13T09:05:00.000Z',
    lastCaptureKey: null,
    lastCaptureAt: null,
    items: [{
      id: 'scan-item-1',
      identityKey: 'en:set-1:card-1:normal',
      status: 'confirmed',
      candidates: [{
        id: 'card-1',
        name: 'Exact Card',
        number: '001',
        set_id: 'set-1',
        set_name: 'Test Set',
        image_small: 'https://example.invalid/card-1.png',
        language: 'en',
        variant_code: 'normal',
        confidence: 0.99,
      }],
      selectedCandidateIndex: 0,
      quantity: 2,
      captureCount: 1,
      captureUris: [],
      firstCapturedAt: '2026-08-13T09:01:00.000Z',
      lastCapturedAt: '2026-08-13T09:01:00.000Z',
      source: 'auto',
    }],
    ...overrides,
  };
}

function expectedItem(): SellerSweepInventoryItem {
  return {
    id: 'inventory-1',
    card_id: 'existing-card',
    set_id: 'set-existing',
    condition: 'Near Mint',
    quantity: 1,
    asking_price: null,
    buy_price: 123.45,
    notes: 'private acquisition note',
    card: {
      id: 'existing-card',
      name: 'Existing Card',
      number: '002',
      set_id: 'set-existing',
      set_name: 'Existing Set',
      rarity: null,
      image_small: null,
      image_large: null,
      tcg_price: null,
      ebay_price: null,
      cardmarket_price: null,
      language: 'en',
      variant_code: 'normal',
    },
    created_at: '2026-08-12T09:00:00.000Z',
    updated_at: '2026-08-12T09:00:00.000Z',
  };
}

function main() {
  const reviewed = session();
  const proposal = createSellerSweepReviewHandoff({
    session: reviewed,
    conditions: { 'scan-item-1': 'Near Mint' },
    identityReviews: { 'scan-item-1': true },
    expectedItems: [expectedItem()],
    requestId: 'seller:sweep-review-test',
    timestamp: '2026-08-13T10:00:00.000Z',
  });

  assert.equal(proposal.requestId, 'seller:sweep-review-test');
  assert.equal(proposal.expectedItems.length, 1);
  assert.equal(proposal.items.length, 2);
  assert.equal(proposal.items[1].quantity, 2);
  assert.equal(proposal.items[1].card.language, 'en');
  assert.equal(proposal.items[1].card.variant_code, 'normal');
  assert.equal(proposal.movements.length, 1);
  assert.equal(proposal.movements[0].reason, 'Added to Sell/Trade');
  assert.equal(proposal.binderDeltas.length, 0);

  const exported = createSellerSweepReviewExport({
    sourceSessionId: reviewed.scanSessionId,
    exportedAt: '2026-08-13T10:05:00.000Z',
    proposal,
  });
  const exportedJson = JSON.stringify(exported);
  assert.equal(exported.commitEnabled, true);
  assert.equal(exported.summary.reviewedCopyCount, 2);
  assert.equal(exported.reviewedCards[0].condition, 'Near Mint');
  assert.equal(exportedJson.includes('private acquisition note'), false);
  assert.equal(exportedJson.includes('123.45'), false);
  assert.equal(exportedJson.includes('inventory-1'), false);
  assert.equal(exportedJson.includes('expectedItems'), true, 'The omission manifest should identify excluded private fields.');

  assert.deepEqual(
    getSellerSweepReviewIssues({ session: reviewed, conditions: {}, identityReviews: {} })
      .map((issue) => issue.code),
    ['identity_not_reviewed', 'condition_not_reviewed'],
  );

  const incompleteIdentity = session({
    items: [{
      ...reviewed.items[0],
      candidates: [{ ...reviewed.items[0].candidates[0], variant_code: null }],
    }],
  });
  assert.deepEqual(
    getSellerSweepReviewIssues({
      session: incompleteIdentity,
      conditions: { 'scan-item-1': 'Near Mint' },
      identityReviews: { 'scan-item-1': true },
    }).map((issue) => issue.code),
    ['missing_exact_identity'],
  );

  const partlyReviewed = session({
    items: [{ ...reviewed.items[0], status: 'review' }],
  });
  assert.throws(
    () => createSellerSweepReviewHandoff({
      session: partlyReviewed,
      conditions: { 'scan-item-1': 'Near Mint' },
      identityReviews: { 'scan-item-1': true },
      expectedItems: [],
      requestId: 'seller:blocked-review',
      timestamp: '2026-08-13T10:00:00.000Z',
    }),
    (error: unknown) => error instanceof SellerSweepReviewHandoffError
      && error.issues[0]?.code === 'scan_not_confirmed',
  );

  assert.deepEqual(
    getSellerSweepReviewIssues({ session: session({ items: [] }), conditions: {}, identityReviews: {} })
      .map((issue) => issue.code),
    ['empty_batch'],
  );

  console.log('Seller Sweep review handoff tests passed.');
}

main();
