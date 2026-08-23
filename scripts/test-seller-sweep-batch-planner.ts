import assert from 'node:assert/strict';
import {
  planSellerSweepInventoryBatch,
  SELLER_SWEEP_MAX_COPIES_PER_LINE,
  SELLER_SWEEP_MAX_DISTINCT_CARDS,
  SELLER_SWEEP_MAX_REVIEWED_LINES,
  SELLER_SWEEP_MAX_TOTAL_COPIES,
  SellerSweepBatchPlanningError,
  type SellerSweepCardSnapshot,
  type SellerSweepInventoryItem,
  type SellerSweepReviewedLine,
} from '../lib/sellerSweepBatchPlanner';

const TIMESTAMP = '2026-08-13T12:34:56.000Z';
const BINDER_A = '11111111-1111-4111-8111-111111111111';
const BINDER_B = '22222222-2222-4222-8222-222222222222';

function card(
  id: string,
  variantCode = 'normal',
  language = 'en',
): SellerSweepCardSnapshot & { set_id: string; language: string; variant_code: string } {
  return {
    id,
    name: `Card ${id}`,
    number: '001/100',
    set_id: 'set-1',
    set_name: 'Test Set',
    rarity: 'Rare',
    image_small: `https://example.invalid/${id}-${variantCode}.jpg`,
    image_large: null,
    tcg_price: null,
    ebay_price: null,
    cardmarket_price: null,
    language,
    variant_code: variantCode,
  };
}

function line(
  scanItemId: string,
  overrides: Partial<SellerSweepReviewedLine> = {},
): SellerSweepReviewedLine {
  return {
    scanItemId,
    status: 'confirmed',
    identityResolution: 'exact',
    card: card('card-1'),
    condition: 'Near Mint',
    quantity: 1,
    movementId: `movement:${scanItemId}`,
    binder: null,
    valueAtTime: 12.5,
    ...overrides,
  };
}

function inventoryItem(
  id: string,
  overrides: Partial<SellerSweepInventoryItem> = {},
): SellerSweepInventoryItem {
  return {
    id,
    card_id: 'card-1',
    set_id: 'set-1',
    condition: 'Near Mint',
    quantity: 4,
    asking_price: null,
    buy_price: null,
    notes: null,
    card: card('card-1'),
    persisted_card_snapshot: card('card-1'),
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function expectPlanningError(
  code: SellerSweepBatchPlanningError['code'],
  callback: () => unknown,
) {
  assert.throws(callback, (error: unknown) => (
    error instanceof SellerSweepBatchPlanningError && error.code === code
  ));
}

function plan(
  lines: SellerSweepReviewedLine[],
  expectedItems: SellerSweepInventoryItem[] = [],
  requestId = 'seller_sweep_test_001',
) {
  return planSellerSweepInventoryBatch({
    requestId,
    timestamp: TIMESTAMP,
    expectedItems,
    lines,
  });
}

function testExactDuplicateAggregation() {
  const expected = [inventoryItem('inventory-existing')];
  const result = plan([
    line('scan-a', { quantity: 2 }),
    line('scan-b', { quantity: 3 }),
  ], expected);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, 'inventory-existing');
  assert.equal(result.items[0].quantity, 9);
  assert.equal(result.items[0].updated_at, TIMESTAMP);
  assert.equal(result.movements.length, 2);
  assert.equal(result.movements.reduce((sum, movement) => sum + movement.quantity, 0), 5);
  assert.deepEqual(
    new Set(result.movements.map((movement) => movement.inventory_item_id)),
    new Set(['inventory-existing']),
  );
  assert.equal(result.expectedItems[0].quantity, 4);
  assert.equal(result.sale, null);
}

function testFailClosedReviewStates() {
  expectPlanningError('scan_not_confirmed', () => plan([
    line('review', { status: 'review' }),
  ]));
  expectPlanningError('scan_not_confirmed', () => plan([
    line('unresolved', { status: 'unresolved' }),
  ]));
  expectPlanningError('ambiguous_identity', () => plan([
    line('ambiguous', { identityResolution: 'ambiguous' }),
  ]));
  expectPlanningError('invalid_card_identity', () => plan([
    line('missing-variant', { card: card('card-1', '') }),
  ]));
  expectPlanningError('invalid_card_identity', () => plan([
    line('missing-language', { card: card('card-1', 'normal', '') }),
  ]));
  expectPlanningError('invalid_condition', () => plan([
    line('missing-condition', { condition: null }),
  ]));
}

function testVariantConditionAndBinderSeparation() {
  const result = plan([
    line('normal-nm-a', { binder: { id: BINDER_A, name: 'Binder A' } }),
    line('reverse-nm-a', {
      card: card('card-1', 'reverse-holo'),
      binder: null,
    }),
    line('normal-lp-a', {
      condition: 'Lightly Played',
      binder: null,
    }),
    line('normal-nm-b', { binder: { id: BINDER_B, name: 'Binder B' } }),
    line('normal-nm-sell', { binder: null }),
  ]);

  assert.equal(result.items.length, 5);
  assert.equal(new Set(result.items.map((item) => item.id)).size, 5);
  assert.equal(result.binderDeltas.length, 2);
  assert.equal(result.binderDeltas.find((delta) => delta.binder_id === BINDER_A)?.quantity_delta, 1);
  assert.equal(
    result.binderDeltas.find((delta) => delta.binder_id === BINDER_B)?.quantity_delta,
    1,
  );
  assert.equal(
    result.movements.find((movement) => movement.id === 'movement:normal-nm-sell')?.reason,
    'Added to Sell/Trade',
  );
  assert.equal(
    result.movements.find((movement) => movement.id === 'movement:normal-nm-a')?.reason,
    'Added to Binder',
  );
}

function testBinderContractCannotCollapseExactIdentities() {
  expectPlanningError('binder_identity_not_representable', () => plan([
    line('binder-normal', { binder: { id: BINDER_A, name: 'Binder A' } }),
    line('binder-reverse', {
      card: card('card-1', 'reverse-holo'),
      binder: { id: BINDER_A, name: 'Binder A' },
    }),
  ]));
  expectPlanningError('binder_identity_not_representable', () => plan([
    line('binder-lp', {
      condition: 'Lightly Played',
      binder: { id: BINDER_A, name: 'Binder A' },
    }),
  ]));
  expectPlanningError('binder_identity_not_representable', () => plan([
    line('binder-en', { binder: { id: BINDER_A, name: 'Binder A' } }),
    line('binder-ja', {
      card: card('card-1', 'normal', 'ja'),
      binder: { id: BINDER_A, name: 'Binder A' },
    }),
  ]));
  const duplicateExact = plan([
    line('binder-copy-a', { quantity: 2, binder: { id: BINDER_A, name: 'Binder A' } }),
    line('binder-copy-b', { quantity: 3, binder: { id: BINDER_A, name: 'Binder A' } }),
  ]);
  assert.equal(duplicateExact.binderDeltas.length, 1);
  assert.equal(duplicateExact.binderDeltas[0].quantity_delta, 5);
}

function testQuantityAndBatchBounds() {
  for (const quantity of [0, -1, 1.5, SELLER_SWEEP_MAX_COPIES_PER_LINE + 1]) {
    expectPlanningError('invalid_quantity', () => plan([
      line(`quantity-${quantity}`, { quantity }),
    ]));
  }

  const distinct = Array.from({ length: SELLER_SWEEP_MAX_DISTINCT_CARDS + 1 }, (_, index) => (
    line(`distinct-${index}`, {
      card: card(`card-${index}`),
      movementId: `movement:distinct:${index}`,
    })
  ));
  expectPlanningError('distinct_card_limit_exceeded', () => plan(distinct));

  const totalCopies = Array.from({ length: 6 }, (_, index) => (
    line(`copies-${index}`, {
      card: card(`copies-card-${index}`),
      quantity: index === 5
        ? SELLER_SWEEP_MAX_TOTAL_COPIES - (5 * SELLER_SWEEP_MAX_COPIES_PER_LINE) + 1
        : SELLER_SWEEP_MAX_COPIES_PER_LINE,
    })
  ));
  expectPlanningError('copy_limit_exceeded', () => plan(totalCopies));

  const tooManyReviewedLines = Array.from(
    { length: SELLER_SWEEP_MAX_REVIEWED_LINES + 1 },
    (_, index) => line(`reviewed-${index}`, {
      movementId: `movement:reviewed:${index}`,
    }),
  );
  expectPlanningError('reviewed_line_limit_exceeded', () => plan(tooManyReviewedLines));
}

function testDeterminismAndInputImmutability() {
  const expected = [inventoryItem('inventory-existing')];
  const lines = [
    line('scan-b', { card: card('card-2', 'holo'), quantity: 2 }),
    line('scan-a', { card: card('card-1', 'normal'), quantity: 1 }),
  ];
  const beforeExpected = structuredClone(expected);
  const beforeLines = structuredClone(lines);
  const first = plan(lines, expected, 'seller_sweep_determinism');
  const second = plan([...lines].reverse(), expected, 'seller_sweep_determinism');

  assert.deepEqual(first, second);
  assert.deepEqual(expected, beforeExpected);
  assert.deepEqual(lines, beforeLines);

  first.items[0].card.name = 'Mutated output';
  first.items[0].quantity = 999;
  first.expectedItems[0].persisted_card_snapshot!.name = 'Mutated expected output';
  assert.deepEqual(expected, beforeExpected);
  assert.equal(first.expectedItems[0].card.name, beforeExpected[0].card.name);
  assert.equal(first.items[0].persisted_card_snapshot?.name, beforeExpected[0].card.name);
}

function testAmbiguousLegacyInventoryIsRejected() {
  const legacy = inventoryItem('legacy-inventory', {
    card: {
      ...card('card-1'),
      language: null,
      variant_code: null,
    },
    persisted_card_snapshot: undefined,
  });
  expectPlanningError('ambiguous_existing_inventory', () => plan([
    line('exact-incoming'),
  ], [legacy]));
}

function testCallerIdentifiersAreRequiredAndUnique() {
  expectPlanningError('invalid_request_id', () => plan([], [], 'contains spaces'));
  expectPlanningError('invalid_movement_id', () => plan([
    line('missing-movement', { movementId: '' }),
  ]));
  expectPlanningError('duplicate_movement_id', () => plan([
    line('movement-a', { movementId: 'movement:duplicate' }),
    line('movement-b', {
      card: card('card-2'),
      movementId: 'movement:duplicate',
    }),
  ]));
}

function testTwentyCardLaunchLanguageBatch() {
  const languages = ['en', 'ja', 'zh-cn', 'zh-tw'] as const;
  const lines = Array.from({ length: 20 }, (_, index) => {
    const language = languages[index % languages.length];
    return line(`launch-card-${index}`, {
      card: card(`launch-card-${index}`, 'normal', language),
      movementId: `movement:launch-card:${index}`,
    });
  });
  const result = plan(lines, [], 'seller_sweep_launch_20');

  assert.equal(result.items.length, 20);
  assert.equal(result.movements.length, 20);
  assert.equal(new Set(result.items.map((item) => item.id)).size, 20);
  assert.equal(new Set(result.movements.map((movement) => movement.id)).size, 20);
  assert.deepEqual(
    Object.fromEntries(languages.map((language) => [
      language,
      result.items.filter((item) => item.card.language === language).length,
    ])),
    { en: 5, ja: 5, 'zh-cn': 5, 'zh-tw': 5 },
  );
}

function main() {
  testExactDuplicateAggregation();
  testFailClosedReviewStates();
  testVariantConditionAndBinderSeparation();
  testBinderContractCannotCollapseExactIdentities();
  testQuantityAndBatchBounds();
  testDeterminismAndInputImmutability();
  testAmbiguousLegacyInventoryIsRejected();
  testCallerIdentifiersAreRequiredAndUnique();
  testTwentyCardLaunchLanguageBatch();
  console.log('Seller Sweep batch planner tests passed.');
}

main();
