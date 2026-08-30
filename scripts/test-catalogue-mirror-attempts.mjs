import assert from 'node:assert/strict';
import {
  aggregateMirrorAttempts,
  deferredAssetIds,
  finalAssetResults,
  parseMirrorAttemptJsonLines,
} from './catalogue-mirror-attempts.mjs';

const assetA = '10000000-0000-4000-8000-000000000001';
const assetB = '10000000-0000-4000-8000-000000000002';
const assetC = '10000000-0000-4000-8000-000000000003';
const attempts = [
  {
    schemaVersion: 1,
    cursor: { exhausted: false },
    workflowAttempt: { phase: 'scan', ordinal: 1 },
    results: [
      { id: assetA, status: 'deferred', error: 'HTTP 503' },
      { id: assetB, status: 'mirrored' },
    ],
  },
  {
    schemaVersion: 1,
    cursor: { exhausted: true },
    workflowAttempt: { phase: 'scan', ordinal: 2 },
    results: [{ id: assetC, status: 'deferred', error: 'timeout' }],
  },
  {
    schemaVersion: 1,
    cursor: { exhausted: true },
    workflowAttempt: { phase: 'retry', ordinal: 1 },
    results: [
      { id: assetA, status: 'mirrored' },
      { id: assetC, status: 'deferred', error: 'timeout' },
    ],
  },
];

assert.deepEqual(deferredAssetIds(attempts.slice(0, 2)), [assetA, assetC]);
assert.deepEqual(deferredAssetIds(attempts), [assetC]);
assert.deepEqual(
  finalAssetResults(attempts).map(({ id, status }) => ({ id, status })),
  [
    { id: assetA, status: 'mirrored' },
    { id: assetB, status: 'mirrored' },
    { id: assetC, status: 'deferred' },
  ],
  'the newest per-asset result must replace an earlier deferred attempt',
);

const firstRetry = aggregateMirrorAttempts(attempts, { provider: 'tcgdex', language: 'zh-cn' });
assert.equal(firstRetry.schemaVersion, 2);
assert.equal(firstRetry.scanBatchesAttempted, 2);
assert.equal(firstRetry.retryRoundsAttempted, 1);
assert.equal(firstRetry.retryBatchesAttempted, 1);
assert.equal(firstRetry.assetAttemptsInspected, 5);
assert.equal(firstRetry.uniqueAssetsInspected, 3);
assert.equal(firstRetry.retriedAssets, 2);
assert.equal(firstRetry.resolvedAfterRetry, 1);
assert.equal(firstRetry.mirrored, 2);
assert.equal(firstRetry.deferred, 1);
assert.equal(firstRetry.attemptSummary.deferred, 3);
assert.equal(firstRetry.scanExhausted, true);
assert.equal(firstRetry.queueDrained, false);
assert.deepEqual(firstRetry.unresolvedAssetIds, [assetC]);

const completedAttempts = [
  ...attempts,
  {
    schemaVersion: 1,
    cursor: { exhausted: true },
    workflowAttempt: { phase: 'retry', ordinal: 2 },
    results: [{ id: assetC, status: 'reused_existing' }],
  },
];
const completed = aggregateMirrorAttempts(completedAttempts, { provider: 'tcgdex', language: 'zh-cn' });
assert.deepEqual(deferredAssetIds(completedAttempts), []);
assert.equal(completed.retryRoundsAttempted, 2);
assert.equal(completed.resolvedAfterRetry, 2);
assert.equal(completed.reusedExisting, 1);
assert.equal(completed.deferred, 0);
assert.equal(completed.attemptSummary.deferred, 3);
assert.equal(completed.queueDrained, true);
assert.deepEqual(completed.unresolvedAssetIds, []);

assert.deepEqual(
  parseMirrorAttemptJsonLines(`\n${attempts.map((report) => JSON.stringify(report)).join('\n')}\n`),
  attempts,
);
assert.throws(() => deferredAssetIds(attempts.slice(0, 2), 1), /bounded maximum is 1/);
assert.throws(() => parseMirrorAttemptJsonLines('{"ok":true}\n'), /does not contain a results array/);

console.log('catalogue mirror attempt aggregation tests passed');
