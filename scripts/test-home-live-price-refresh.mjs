import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import {
  buildVerifiedHomeSnapshotTrend,
  selectComparableHomeSnapshotEntries,
  supportsHomeSnapshotScope,
  takeRotatingStringBatch,
} from '../lib/homePriceRefreshCore.ts';

const firstBatch = takeRotatingStringBatch(['variant-b', 'variant-a', 'variant-b', 'variant-c'], 0, 2);
assert.equal(supportsHomeSnapshotScope('raw_card', 'Near Mint'), true);
assert.equal(supportsHomeSnapshotScope('raw_card', 'raw_near_mint'), true);
assert.equal(supportsHomeSnapshotScope('raw_card', 'Lightly Played'), false);
assert.equal(supportsHomeSnapshotScope('graded_card', 'Near Mint'), false);
assert.equal(supportsHomeSnapshotScope('raw_card', null), false);
assert.deepEqual(firstBatch.items, ['variant-a', 'variant-b']);
assert.equal(firstBatch.nextCursor, 2);
const secondBatch = takeRotatingStringBatch(['variant-b', 'variant-a', 'variant-c'], firstBatch.nextCursor, 2);
assert.deepEqual(secondBatch.items, ['variant-c']);
assert.equal(secondBatch.nextCursor, 0);

const eligibleSubset = selectComparableHomeSnapshotEntries([
  { productType: 'raw_card', condition: 'Near Mint', variantId: 'variant-a', central: 10, status: 'available', quantity: 2 },
  { productType: 'graded_card', condition: 'Near Mint', variantId: 'variant-b', central: 100, status: 'available', quantity: 1 },
  { productType: 'raw_card', condition: 'Near Mint', variantId: 'variant-c', central: null, status: 'unavailable', quantity: 1 },
]);
assert.deepEqual(eligibleSubset.entries, [{ variantId: 'variant-a', quantity: 2 }]);
assert.deepEqual(eligibleSubset.variantIds, ['variant-a']);
assert.equal(eligibleSubset.eligibleUnits, 2, 'Unsupported or unavailable cards must not blank an eligible stored-price subset.');

const trend = buildVerifiedHomeSnapshotTrend(
  [
    { variantId: 'variant-a', quantity: 1 },
    { variantId: 'variant-b', quantity: 1 },
  ],
  [
    { variantId: 'variant-a', snapshotAt: '1970-01-01T00:00:01.200Z', marketCentral: 10, freshness: 'fresh', priceType: 'estimate' },
    { variantId: 'variant-b', snapshotAt: '1970-01-01T00:00:01.300Z', marketCentral: 20, freshness: 'fresh', priceType: 'estimate' },
    { variantId: 'variant-a', snapshotAt: '1970-01-01T00:00:02.100Z', marketCentral: 15, freshness: 'fresh', priceType: 'estimate' },
    { variantId: 'variant-b', snapshotAt: '1970-01-01T00:00:03.100Z', marketCentral: 999, freshness: 'stale', priceType: 'estimate' },
  ],
  { rangeStartMs: 1_000, nowMs: 4_000, bucketMs: 1_000 },
);
assert.deepEqual(trend, [30, 35], 'only actual, fresh provider snapshots can create chart points');

assert.deepEqual(
  buildVerifiedHomeSnapshotTrend(
    [{ variantId: 'variant-a', quantity: 1 }, { variantId: 'variant-b', quantity: 1 }],
    [{ variantId: 'variant-a', snapshotAt: '1970-01-01T00:00:01.000Z', marketCentral: 10, freshness: 'fresh', priceType: 'estimate' }],
    { rangeStartMs: 0, nowMs: 2_000, bucketMs: 1_000 },
  ),
  [],
  'partial card coverage must not be displayed as portfolio movement',
);

const historical = [
  { variantId: 'a', snapshotAt: '2026-08-01T00:00:00Z', staleAfter: '2026-08-02T00:00:00Z', marketCentral: 10, freshness: 'stale', priceType: 'legacy_cached_market_estimate' },
  { variantId: 'a', snapshotAt: '2026-08-01T12:00:00Z', staleAfter: '2026-08-02T12:00:00Z', marketCentral: 12, freshness: 'source_timestamped', priceType: 'legacy_cached_market_estimate' },
];
const options = { rangeStartMs: Date.parse('2026-08-01T00:00:00Z'), nowMs: Date.parse('2026-08-04T00:00:00Z'), bucketMs: 1_800_000 };
assert.deepEqual(buildVerifiedHomeSnapshotTrend([{ variantId: 'a', quantity: 2 }], historical, options), [20, 24], 'Historical estimates remain valid at their original observation time');
assert.deepEqual(buildVerifiedHomeSnapshotTrend([{ variantId: 'a', quantity: 1 }], historical.map((row) => ({ ...row, staleAfter: row.snapshotAt })), options), [], 'Re-fetching an expired quote cannot create fresh history');
assert.deepEqual(buildVerifiedHomeSnapshotTrend([{ variantId: 'a', quantity: 1 }], historical.map((row) => ({ ...row, marketCentral: 0 })), options), [], 'Missing prices cannot become zero-value movement');

const regime = (primarySource, priceBasis, methodologyVersion = 'pricing-v2.0.0') => ({
  primarySource,
  priceBasis,
  methodologyVersion,
  priceType: 'market_estimate',
});
assert.deepEqual(
  buildVerifiedHomeSnapshotTrend(
    [{ variantId: 'a', quantity: 1 }],
    [
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:01.000Z', marketCentral: 10, freshness: 'fresh', ...regime('existing_stackr_source', 'unknown_or_mixed_normalisation') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:02.000Z', marketCentral: 12, freshness: 'fresh', ...regime('existing_stackr_source', 'unknown_or_mixed_normalisation') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:03.000Z', marketCentral: 20, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:04.000Z', marketCentral: 22, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
    ],
    { rangeStartMs: 0, nowMs: 5_000, bucketMs: 1_000 },
  ),
  [20, 22],
  'a source/basis transition resets the series instead of looking like a price jump',
);

assert.deepEqual(
  buildVerifiedHomeSnapshotTrend(
    [{ variantId: 'a', quantity: 1 }],
    [
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:01.000Z', marketCentral: 10, freshness: 'fresh', ...regime('source-a', 'item_price_excludes_shipping') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:02.000Z', marketCentral: 30, freshness: 'fresh', ...regime('source-b', 'normalised_delivered_price_gbp') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:03.000Z', marketCentral: 20, freshness: 'fresh', ...regime('source-a', 'item_price_excludes_shipping') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:04.000Z', marketCentral: 21, freshness: 'fresh', ...regime('source-a', 'item_price_excludes_shipping') },
    ],
    { rangeStartMs: 0, nowMs: 5_000, bucketMs: 1_000 },
  ),
  [20, 21],
  'A-B-A history keeps only the latest contiguous A regime',
);

assert.deepEqual(
  buildVerifiedHomeSnapshotTrend(
    [{ variantId: 'a', quantity: 1 }, { variantId: 'b', quantity: 1 }],
    [
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:01.000Z', marketCentral: 10, freshness: 'fresh', ...regime('legacy', 'unknown_or_mixed_normalisation') },
      { variantId: 'b', snapshotAt: '1970-01-01T00:00:01.000Z', marketCentral: 5, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:02.000Z', marketCentral: 20, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
      { variantId: 'b', snapshotAt: '1970-01-01T00:00:02.000Z', marketCentral: 5, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
      { variantId: 'a', snapshotAt: '1970-01-01T00:00:03.000Z', marketCentral: 25, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
      { variantId: 'b', snapshotAt: '1970-01-01T00:00:03.000Z', marketCentral: 5, freshness: 'fresh', ...regime('poketrace_sold', 'item_price_excludes_shipping') },
    ],
    { rangeStartMs: 0, nowMs: 4_000, bucketMs: 1_000 },
  ),
  [25, 30],
  'a portfolio only resumes once every tracked variant has valid current-regime coverage',
);

const homeSourceText = await readFile(new URL('../features/home/HubScreen.tsx', import.meta.url), 'utf8');
const homeSource = ts.createSourceFile('HubScreen.tsx', homeSourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const visit = (node, predicate) => {
  if (predicate(node)) return node;
  let found;
  ts.forEachChild(node, (child) => {
    if (!found) found = visit(child, predicate);
  });
  return found;
};

const variableInitializer = (name) => {
  const declaration = visit(homeSource, (node) => (
    ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text === name
  ));
  assert.ok(declaration?.initializer, `${name} must remain a declared callback or configuration value`);
  return declaration.initializer;
};

const asCallback = (expression, name) => {
  const callback = ts.isCallExpression(expression) && expression.expression.getText(homeSource) === 'useCallback'
    ? expression.arguments[0]
    : expression;
  assert.ok(callback && ts.isArrowFunction(callback), `${name} must remain an executable callback`);
  return callback;
};

const pollCallback = asCallback(variableInitializer('pollLivePrices'), 'pollLivePrices');
const pollCallTargets = [];
const collectCalls = (node, targets) => {
  if (ts.isCallExpression(node)) targets.push(node.expression.getText(homeSource));
  ts.forEachChild(node, (child) => collectCalls(child, targets));
};
collectCalls(pollCallback.body, pollCallTargets);
assert.ok(
  pollCallTargets.includes('loadCollectionValueRef.current'),
  'the Home poll must still re-read stored collection prices',
);
assert.ok(
  !pollCallTargets.some((target) => target.includes('requestMarketPriceRefresh') || target.includes('enqueueAutomaticProviderRefresh')),
  'the Home poll must not enqueue provider refreshes',
);

const homeFocusEffect = visit(homeSource, (node) => (
  ts.isCallExpression(node)
  && node.expression.getText(homeSource) === 'useFocusEffect'
));
assert.ok(homeFocusEffect, 'Home must retain its focus lifecycle');
const focusCallback = homeFocusEffect.arguments[0];
assert.ok(
  focusCallback
  && ts.isCallExpression(focusCallback)
  && focusCallback.expression.getText(homeSource) === 'useCallback',
  'Home focus lifecycle must use its callback wrapper',
);
const focusBody = asCallback(focusCallback.arguments[0], 'Home focus lifecycle').body;
const intervalCall = visit(focusBody, (node) => (
  ts.isCallExpression(node) && node.expression.getText(homeSource) === 'setInterval'
));
assert.ok(intervalCall, 'Home must retain a stored-price polling timer');
assert.equal(
  intervalCall.arguments[1]?.getText(homeSource),
  'HOME_STORED_PRICE_POLL_MS',
  'Home polling must use the stored-price cadence',
);
assert.equal(
  variableInitializer('HOME_STORED_PRICE_POLL_MS').getText(homeSource),
  '3 * 60 * 1000',
  'Home stored-price polling must keep queued results visible promptly',
);
const focusCallTargets = [];
collectCalls(focusBody, focusCallTargets);
assert.ok(
  focusCallTargets.includes('pollLivePrices'),
  'Home focus must immediately read cached/stored prices through the poll callback',
);

const manualRefresh = asCallback(variableInitializer('refreshLivePrices'), 'refreshLivePrices');
const manualCallTargets = [];
collectCalls(manualRefresh.body, manualCallTargets);
assert.ok(
  manualCallTargets.includes('stackrApiClient.requestMarketPriceRefresh'),
  'the explicit Home refresh action must remain connected to the provider queue',
);
assert.ok(
  manualCallTargets.includes('loadCollectionValueRef.current'),
  'the explicit Home refresh action must immediately re-read stored prices after queuing',
);
assert.match(homeSourceText, /pendingManualPriceRefreshesRef/, 'Home must retain queued exact refreshes only for its focused stored-price follow-up.');
assert.match(homeSourceText, /reconcileManualPriceRefreshes/, 'Home must clear a queued notice only after a newer stored price is observed.');
const valueTracker = visit(homeSource, (node) => (
  ts.isJsxSelfClosingElement(node) && node.tagName.getText(homeSource) === 'ValueTrackerCard'
));
assert.ok(valueTracker, 'Home must render the collection value tracker');
const onRefresh = valueTracker.attributes.properties.find((attribute) => (
  ts.isJsxAttribute(attribute) && attribute.name.text === 'onRefresh'
));
assert.ok(
  onRefresh
  && ts.isJsxAttribute(onRefresh)
  && onRefresh.initializer
  && ts.isJsxExpression(onRefresh.initializer)
  && onRefresh.initializer.expression?.getText(homeSource) === 'refreshLivePrices',
  'the value tracker refresh control must remain connected to the manual queue callback',
);

console.log('home live price refresh tests passed');
