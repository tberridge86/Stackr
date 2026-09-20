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
  assert.equal(missingVariant.status, 'market_estimate');
  assert.equal(missingVariant.pricingKind, 'general');
  assert.equal(missingVariant.variantId, 'default-variant', 'A missing raw/NM finish may use one proved same-card general base.');
  assert.equal(requests.length, callsBeforeRejectedVariant + 1, 'The general estimate makes one labelled base request.');

  const holoOnlyResolver = async () => ({
    variantId: 'holo-variant',
    matchedBy: 'exact_external_id' as const,
    card: {
      defaultVariantId: 'holo-variant',
      variants: [{ variantId: 'holo-variant', variantCode: 'holo' }],
    },
  });
  const generalBaseRequests: any[] = [];
  const [holoOnlyNormal] = await loadCollectionPrices([baseInput({ variantCode: 'normal' })], {
    client: { cardPrice: async (variantId: string, query: any) => {
      generalBaseRequests.push({ variantId, query });
      return price(6.5);
    } } as any,
    resolver: holoOnlyResolver as any,
  });
  assert.equal(holoOnlyNormal.variantId, 'holo-variant');
  assert.equal(holoOnlyNormal.central, 6.5);
  assert.equal(holoOnlyNormal.pricingKind, 'general', 'A holo-only base is a labelled general estimate for a saved normal.');
  assert.equal(holoOnlyNormal.quoteScope, 'printing_level');
  assert.deepEqual(holoOnlyNormal.fallbackEstimate, { identityKey: null, reason: 'same_printing_general_base', exact: false });
  assert.deepEqual(generalBaseRequests, [{ variantId: 'holo-variant', query: {
    productType: 'raw_card', currency: 'GBP', condition: 'raw_near_mint', grader: undefined, grade: undefined, estimateMode: 'general',
  } }]);
  const [missingReverseHolo] = await loadCollectionPrices([baseInput({ variantCode: 'reverse_holo' })], {
    client: { cardPrice: async () => price(6.5) } as any,
    resolver: holoOnlyResolver as any,
  });
  assert.equal(missingReverseHolo.pricingKind, 'general', 'Any absent raw/NM finish uses only the labelled same-card general base.');
  assert.equal(missingReverseHolo.variantId, 'holo-variant', 'The saved reverse-holo identity is never rewritten to the base variant.');
  const [gradedHoloOnly] = await loadCollectionPrices([baseInput({ variantCode: 'normal', productType: 'graded_card', grader: 'PSA', grade: '10' })], {
    client: { cardPrice: async () => { throw new Error('must not request a general base for a grade'); } } as any,
    resolver: holoOnlyResolver as any,
  });
  assert.equal(gradedHoloOnly.status, 'unavailable', 'A graded saved normal cannot use a raw general base.');
  const ambiguousHoloOnlyResolver = async () => ({
    variantId: 'holo-one', matchedBy: 'exact_external_id' as const,
    card: { defaultVariantId: 'holo-one', variants: [
      { variantId: 'holo-one', variantCode: 'holo' }, { variantId: 'holo-two', variantCode: 'holo' },
    ] },
  });
  const [ambiguousHoloOnly] = await loadCollectionPrices([baseInput({ variantCode: 'normal' })], {
    client: { cardPrice: async () => { throw new Error('ambiguous base must not be requested'); } } as any,
    resolver: ambiguousHoloOnlyResolver as any,
  });
  assert.equal(ambiguousHoloOnly.status, 'unavailable', 'Ambiguous holo bases fail closed.');

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
    productType: 'graded_card', currency: 'GBP', condition: 'graded', grader: 'PSA', grade: '10', estimateMode: 'general',
  });

  const generalClient = { cardPrice: async () => ({ data: {
    ...price(7).data,
    quoteScope: 'printing_level',
    fallbackEstimate: { identityKey: null, reason: 'same_printing_base_quote', exact: false },
  } }) };
  const [general] = await loadCollectionPrices([baseInput()], { client: generalClient as any, resolver: singleVariantResolver as any });
  assert.equal(general.pricingKind, 'general', 'Only an explicit fallback marker can make a returned quote general.');
  assert.equal(general.fallbackEstimate?.identityKey, null, 'Printing-level estimates may not name a different canonical identity.');

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

  let current = true;
  let resolutionCalls = 0;
  const progress: { completed: number; values: (number | null)[] }[] = [];
  const progressInputs = Array.from({ length: 8 }, (_, index) => baseInput({ key: `unit-${index}` }));
  const interrupted = await loadCollectionPrices(progressInputs, {
    client: client as any,
    resolver: (async () => { resolutionCalls += 1; return singleVariantResolver(); }) as any,
    concurrency: 1,
    isCurrent: () => current,
    onProgress: (results, completed) => {
      progress.push({ completed, values: results.map((result) => result.central) });
      if (completed === 2) current = false;
    },
  });
  assert.equal(progress.length, 2, 'An account switch must stop scheduling and publishing further prices');
  assert.equal(resolutionCalls, 1, 'Different ownership units of the same card share an identity read within this load');
  assert.deepEqual(progress[0].values, [12.34, null, null, null, null, null, null, null], 'Pending units remain in the subtotal coverage denominator');
  assert.equal(interrupted.filter((result) => result.central != null).length, 2);
  await loadCollectionPrices([baseInput()], {
    client: client as any,
    resolver: (async () => { resolutionCalls += 1; return singleVariantResolver(); }) as any,
  });
  assert.equal(resolutionCalls, 2, 'A later account/load never reuses the previous load cache');
  let sameAccount = true;
  let wrongAccountPriceReads = 0;
  await loadCollectionPrices([baseInput()], {
    client: { cardPrice: async () => { wrongAccountPriceReads += 1; return price(10); } } as any,
    resolver: (async () => { sameAccount = false; return singleVariantResolver(); }) as any,
    isCurrent: () => sameAccount,
  });
  assert.equal(wrongAccountPriceReads, 0, 'A switch during public card resolution must not start an authenticated price read');

  console.log('Collection pricing API tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
