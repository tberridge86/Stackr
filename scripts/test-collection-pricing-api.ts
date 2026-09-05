import assert from 'node:assert/strict';
import {
  loadCollectionPrices,
  normaliseCollectionMarketCondition,
  normaliseCollectionVariantCode,
  type CollectionPriceInput,
} from '../lib/collectionPricingApi';

const baseInput = (overrides: Partial<CollectionPriceInput> = {}): CollectionPriceInput => ({
  key: 'card-1',
  references: ['reference-1'],
  quantity: 1,
  condition: 'Near Mint',
  ...overrides,
});

const price = (central: number | null) => ({
  data: {
    estimates: { central },
    status: central == null ? 'unavailable' : 'recent_sold_value',
    freshness: 'fresh',
    calculatedAt: '2026-09-05T10:00:00.000Z',
    staleAfter: '2026-09-05T11:00:00.000Z',
    unavailableReason: central == null ? 'No evidence' : null,
  },
});

const resolver = async (reference: string) => ({
  variantId: 'default-variant',
  matchedBy: 'exact_external_id' as const,
  card: {
    defaultVariantId: 'default-variant',
    variants: [
      { variantId: 'default-variant', variantCode: 'normal' },
      { variantId: 'reverse-variant', variantCode: 'reverse-holo' },
    ],
  },
});

const requests: any[] = [];
const client = {
  cardPrice: async (variantId: string, query: any) => {
    requests.push({ variantId, query });
    return price(12.34);
  },
};

const singleVariantResolver = async () => ({
  variantId: 'only-variant',
  matchedBy: 'exact_external_id' as const,
  card: {
    defaultVariantId: 'only-variant',
    variants: [{ variantId: 'only-variant', variantCode: 'normal' }],
  },
});

async function main() {
  const [exactVariant] = await loadCollectionPrices([baseInput({ variantCode: 'Reverse Holo' })], {
    client: client as any,
    resolver: resolver as any,
  });
  assert.equal(exactVariant.variantId, 'reverse-variant', 'Requested variants must be selected by normalized exact variant code');
  assert.equal(requests[0].variantId, 'reverse-variant');

  const callsBeforeRejectedVariant = requests.length;

  const [missingVariant] = await loadCollectionPrices([baseInput({ variantCode: '1st Edition' })], {
    client: client as any,
    resolver: resolver as any,
  });
  assert.equal(missingVariant.status, 'unavailable');
  assert.equal(missingVariant.central, null);
  assert.equal(missingVariant.variantId, null, 'A missing requested variant must not fall back to the default variant');
  assert.equal(requests.length, callsBeforeRejectedVariant, 'Rejected variants must not make a price request');

  const zeroClient = { cardPrice: async () => price(0) };
  const [zero] = await loadCollectionPrices([baseInput()], { client: zeroClient as any, resolver: singleVariantResolver as any });
  assert.equal(zero.central, 0, 'A real zero estimate must be preserved rather than coerced to unavailable');

  assert.equal(normaliseCollectionMarketCondition('Near Mint'), 'raw_near_mint');
  assert.equal(normaliseCollectionMarketCondition('Lightly Played'), 'raw_lightly_played');
assert.equal(normaliseCollectionMarketCondition('Near Mint', 'graded_card'), 'graded');
assert.equal(normaliseCollectionVariantCode('reverseHolofoil'), 'reverse_holo');
assert.equal(
  normaliseCollectionVariantCode('1stEditionHolofoil'),
  '1st_edition_holofoil',
  'Distinct legacy finishes must not be collapsed into a broader variant',
);

  const guardedRequests: any[] = [];
  const guardedClient = {
    cardPrice: async (...args: any[]) => {
      guardedRequests.push(args);
      return price(10);
    },
  };
  const [unknownCondition] = await loadCollectionPrices([baseInput({ condition: 'Display case' })], {
    client: guardedClient as any,
    resolver: singleVariantResolver as any,
  });
  assert.equal(unknownCondition.status, 'unavailable');
  assert.match(unknownCondition.unavailableReason ?? '', /recognized raw-card condition/i);
  assert.equal(guardedRequests.length, 0, 'An unrecognized raw condition must not select a price');

  const [missingRawCondition] = await loadCollectionPrices([baseInput({ condition: null })], {
    client: guardedClient as any,
    resolver: singleVariantResolver as any,
  });
  assert.equal(missingRawCondition.status, 'unavailable');
  assert.equal(guardedRequests.length, 0, 'A missing raw condition must not select an arbitrary price');

  const [incompleteGraded] = await loadCollectionPrices([baseInput({ productType: 'graded_card', grader: 'PSA', grade: null })], {
    client: guardedClient as any,
    resolver: singleVariantResolver as any,
  });
  assert.equal(incompleteGraded.status, 'unavailable');
  assert.match(incompleteGraded.unavailableReason ?? '', /grader and grade/i);
  assert.equal(guardedRequests.length, 0, 'An incomplete graded card must not select a price');

  const ambiguousResolver = async () => ({
    variantId: 'first-normal',
    matchedBy: 'exact_external_id' as const,
    card: {
      defaultVariantId: 'first-normal',
      variants: [
        { variantId: 'first-normal', variantCode: 'normal' },
        { variantId: 'second-normal', variantCode: 'normal' },
      ],
    },
  });
  const [ambiguousRequested] = await loadCollectionPrices([baseInput({ variantCode: 'normal' })], {
    client: guardedClient as any,
    resolver: ambiguousResolver as any,
  });
  assert.equal(ambiguousRequested.status, 'unavailable');
  assert.match(ambiguousRequested.unavailableReason ?? '', /ambiguous/i);
  assert.equal(guardedRequests.length, 0, 'Ambiguous requested variants must not make a price request');

  const firstEditionResolver = async () => ({
    variantId: 'first-edition',
    matchedBy: 'exact_external_id' as const,
    card: {
      defaultVariantId: 'first-edition',
      variants: [{ variantId: 'first-edition', variantCode: 'first_edition' }],
    },
  });
  const [lossyLegacyVariant] = await loadCollectionPrices([baseInput({ variantCode: '1stEditionHolofoil' })], {
    client: guardedClient as any,
    resolver: firstEditionResolver as any,
  });
  assert.equal(lossyLegacyVariant.status, 'unavailable');
  assert.equal(guardedRequests.length, 0, 'A distinct legacy finish must not select a broader variant');

  const [ambiguousDefault] = await loadCollectionPrices([baseInput()], {
    client: guardedClient as any,
    resolver: resolver as any,
  });
  assert.equal(ambiguousDefault.status, 'unavailable');
  assert.match(ambiguousDefault.unavailableReason ?? '', /unique exact variant/i);
  assert.equal(guardedRequests.length, 0, 'A card with multiple variants needs an explicit exact variant');

  const [completeGraded] = await loadCollectionPrices([baseInput({ productType: 'graded_card', grader: 'PSA', grade: '10' })], {
    client: guardedClient as any,
    resolver: singleVariantResolver as any,
  });
  assert.equal(completeGraded.central, 10);
  assert.equal(guardedRequests.length, 1, 'A complete graded identity may request its exact price');
  assert.deepEqual(guardedRequests[0][1], {
    productType: 'graded_card', currency: 'GBP', condition: 'graded', grader: 'PSA', grade: '10',
  });

  const flakyClient = {
    cardPrice: async (variantId: string) => {
      if (variantId === 'broken-variant') throw new Error('test request failure');
      return price(8);
    },
  };
  const flakyResolver = async (reference: string) => ({
    variantId: reference === 'broken' ? 'broken-variant' : 'healthy-variant',
    matchedBy: 'exact_external_id' as const,
    card: {
      defaultVariantId: reference === 'broken' ? 'broken-variant' : 'healthy-variant',
      variants: [{
        variantId: reference === 'broken' ? 'broken-variant' : 'healthy-variant',
        variantCode: 'normal',
      }],
    },
  });
  const siblings = await loadCollectionPrices([
    baseInput({ key: 'broken', references: ['broken'] }),
    baseInput({ key: 'healthy', references: ['healthy'] }),
  ], { client: flakyClient as any, resolver: flakyResolver as any, concurrency: 1 });
  assert.equal(siblings[0].status, 'unavailable');
  assert.match(siblings[0].requestError ?? '', /test request failure/);
  assert.equal(siblings[1].central, 8, 'One request failure must not discard sibling results');

  console.log('Collection pricing API tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
