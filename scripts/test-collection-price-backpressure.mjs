import assert from 'node:assert/strict';
import { test } from 'node:test';

// Exercise the real loader. Only external identity/API dependencies are controlled;
// no live credentials, provider calls, database or native-render claims are involved.
const modulePath = process.env.STACKR_COLLECTION_TEST_MODULE || '../lib/collectionPricingApi.ts';
const { loadCollectionPrices } = await import(modulePath);
const variantId = '11111111-1111-4111-8111-111111111111';
const makeInput = (index, extra = {}) => ({
  key: `row-${index}`, references: [`id-${index}`, `alias-${index}`, `name-${index}`],
  quantity: 2, language: 'en', setId: '22222222-2222-4222-8222-222222222222',
  variantCode: 'normal', condition: 'Near Mint', ...extra,
});
const match = {
  variantId, matchedBy: 'canonical_uuid',
  card: { variants: [{ variantId, variantCode: 'normal' }] },
};
const priced = { data: {
  estimates: { central: 1.25 }, status: 'legacy_cached_market_estimate', freshness: 'source_timestamped',
  calculatedAt: '2026-09-11T17:00:00Z', staleAfter: null, unavailableReason: null,
} };
const unavailable = { data: {
  ...priced.data, estimates: { central: null }, status: 'unavailable', freshness: 'unknown',
  calculatedAt: null, unavailableReason: 'insufficient_exact_market_evidence',
} };
const fail = (status, code = 'request_failed') => Object.assign(new Error('controlled request failure'), {
  status, code, requestId: '33333333-3333-4333-8333-333333333333',
});
const noPriceCalls = { cardPrice: async () => assert.fail('No quote may be requested without identity.') };

test('429 stops a 300-row, three-alias batch at its first failed resolution', async () => {
  let resolutions = 0;
  const progress = [];
  const rows = await loadCollectionPrices(Array.from({ length: 300 }, (_, index) => makeInput(index)), {
    client: noPriceCalls, concurrency: 1,
    resolver: async () => { resolutions += 1; throw fail(429, 'rate_limit_exceeded'); },
    onProgress: (_, completed) => progress.push(completed),
  });
  console.log(JSON.stringify({ scenario: 'controlled_300_row_429', resolutionCalls: resolutions }));
  assert.equal(resolutions, 1, 'A server throttle must not trigger 899 additional alias lookups.');
  assert.equal(rows.length, 300);
  assert.equal(rows[0].requestFailure.kind, 'rate_limited');
  assert.equal(rows[0].requestFailure.status, 429);
  assert.equal(rows[0].requestFailure.deferred, false);
  assert.equal(rows[0].requestFailure.requestId, '33333333-3333-4333-8333-333333333333');
  assert(rows.slice(1).every((row) => row.requestFailure.deferred && row.requestFailure.requestId === null));
  assert(rows.every((row) => row.central === null && row.quantity === 2));
  assert.equal(progress.at(-1), 1, 'Deferred rows are not counted as completed requests.');
});

test('parallel throttles are bounded by existing concurrency, not collection size', async () => {
  let resolutions = 0;
  const rows = await loadCollectionPrices(Array.from({ length: 300 }, (_, index) => makeInput(index)), {
    client: noPriceCalls, concurrency: 4,
    resolver: async () => { resolutions += 1; throw fail(429); },
  });
  assert.equal(resolutions, 4);
  assert.equal(rows.filter((row) => row.requestFailure.deferred).length, 296);
});

for (const [status, kind] of [[401, 'authentication_required'], [403, 'access_denied'], [429, 'rate_limited'], [500, 'service_error'], [503, 'service_error'], [504, 'service_error']]) {
  test(`quote HTTP ${status} remains distinct from missing evidence and halts new rows`, async () => {
    let quoteCalls = 0;
    const rows = await loadCollectionPrices([makeInput(1), makeInput(2), makeInput(3)], {
      concurrency: 1, resolver: async () => match,
      client: { cardPrice: async () => { quoteCalls += 1; throw fail(status); } },
    });
    assert.equal(quoteCalls, 1);
    assert.equal(rows[0].requestFailure.kind, kind);
    assert.equal(rows[0].requestFailure.status, status);
    assert.equal(rows[0].variantId, variantId);
    assert.equal(rows[2].requestFailure.deferred, true);
    assert.notEqual(rows[0].unavailableReason, 'No matching Stackr price is available.');
  });
}

test('successful earlier prices are retained when later requests are deferred', async () => {
  let quoteCalls = 0;
  const rows = await loadCollectionPrices([makeInput(1), makeInput(2), makeInput(3)], {
    concurrency: 1, resolver: async () => match,
    client: { cardPrice: async () => { if (++quoteCalls === 1) return priced; throw fail(504); } },
  });
  assert.equal(rows[0].central, 1.25);
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].requestFailure, undefined);
  assert.equal(rows[2].central, null);
  assert.equal(rows[2].requestFailure.deferred, true);
});

test('HTTP 200 genuinely unavailable quotes do not stop healthy sibling reads', async () => {
  let calls = 0;
  const rows = await loadCollectionPrices([makeInput(1), makeInput(2)], {
    concurrency: 1, resolver: async () => match,
    client: { cardPrice: async () => ++calls === 1 ? unavailable : priced },
  });
  assert.equal(calls, 2);
  assert.equal(rows[0].unavailableReason, 'insufficient_exact_market_evidence');
  assert.equal(rows[0].requestFailure, undefined);
  assert.equal(rows[1].central, 1.25);
});

test('genuine 404 identity misses preserve alias fallbacks', async () => {
  const refs = [];
  const rows = await loadCollectionPrices([makeInput(1)], {
    client: { cardPrice: async () => priced },
    resolver: async (ref) => { refs.push(ref); if (refs.length === 1) throw fail(404); return match; },
  });
  assert.deepEqual(refs, ['id-1', 'alias-1']);
  assert.equal(rows[0].central, 1.25);
});

test('one item-specific error does not discard otherwise valid siblings', async () => {
  let calls = 0;
  const rows = await loadCollectionPrices([makeInput(1), makeInput(2)], {
    concurrency: 1, resolver: async () => match,
    client: { cardPrice: async () => { if (++calls === 1) throw new Error('item-specific'); return priced; } },
  });
  assert.equal(calls, 2);
  assert.equal(rows[0].requestError, 'item-specific');
  assert.equal(rows[1].central, 1.25);
});

test('no identity match, missing condition and wrong finish do not fabricate a price', async () => {
  const rows = await loadCollectionPrices([
    makeInput(1, { condition: 'unknown' }), makeInput(2, { variantCode: 'reverse_holo' }),
    makeInput(3, { references: ['absent'] }),
  ], { client: noPriceCalls, resolver: async (ref) => ref === 'absent' ? null : match });
  assert(rows.every((row) => row.central === null && row.requestFailure === undefined));
  assert.match(rows[0].unavailableReason, /condition/);
  assert.match(rows[1].unavailableReason, /variant/);
  assert.match(rows[2].unavailableReason, /No exact/);
});

test('a later load/account is not locked out by another load failure or given its prices', async () => {
  await loadCollectionPrices([makeInput(1)], {
    client: noPriceCalls, resolver: async () => { throw fail(403); },
  });
  let calls = 0;
  const rows = await loadCollectionPrices([makeInput(1)], {
    client: { cardPrice: async () => { calls += 1; return priced; } }, resolver: async () => match,
  });
  assert.equal(calls, 1);
  assert.equal(rows[0].central, 1.25);
  assert.equal(rows[0].requestFailure, undefined);
});

test('superseded loads schedule no new calls or progress', async () => {
  await loadCollectionPrices([makeInput(1)], {
    client: noPriceCalls, resolver: async () => assert.fail('No stale account resolution.'),
    isCurrent: () => false, onProgress: () => assert.fail('No stale account progress.'),
  });
});

test('recognized network failures stop alias fanout', async () => {
  let calls = 0;
  const rows = await loadCollectionPrices([makeInput(1), makeInput(2)], {
    client: noPriceCalls, concurrency: 1,
    resolver: async () => { calls += 1; throw new TypeError('Network request failed'); },
  });
  assert.equal(calls, 1);
  assert.equal(rows[0].requestFailure.kind, 'network_error');
  assert.equal(rows[1].requestFailure.deferred, true);
});

test('already in-flight healthy results survive another worker throttling', async () => {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const rowsPromise = loadCollectionPrices([makeInput(1), makeInput(2), makeInput(3)], {
    client: { cardPrice: async () => {
      calls += 1;
      if (calls === 1) { await wait; return priced; }
      release();
      throw fail(429);
    } },
    resolver: async () => match, concurrency: 2,
  });
  const rows = await rowsPromise;
  assert.equal(calls, 2);
  assert.equal(rows[0].central, 1.25);
  assert.equal(rows[1].requestFailure.kind, 'rate_limited');
  assert.equal(rows[2].requestFailure.deferred, true);
});
