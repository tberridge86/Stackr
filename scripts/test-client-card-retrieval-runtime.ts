import assert from 'node:assert/strict';
import Module from 'node:module';

process.env.STACKR_NODE_TOOLING_RUNTIME = 'true';
process.env.STACKR_API_URL = 'https://api.stackr.test';
process.env.PRICE_API_URL = 'https://api.stackr.test';

// Import the complete real client and adapter. Only native storage and the
// remote transport are fixtures; no application functions are copied here.
const loader = Module as unknown as { _load: (name: string, parent: unknown, main: boolean) => unknown };
const originalLoad = loader._load;
let readStorage = async (): Promise<string | null> => null;
let writeStorage = async (_key: string, _value: string): Promise<void> => {};
loader._load = (name, parent, main) => {
  if (name === 'react-native') return { Platform: { OS: 'web' } };
  if (name === 'react-native-url-polyfill/auto') return {};
  if (name === '@react-native-async-storage/async-storage') return {
    getItem: () => readStorage(), setItem: (key: string, value: string) => writeStorage(key, value), removeItem: async () => {},
  };
  if (name === './supabase') return { supabase: { auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } } };
  return originalLoad(name, parent, main);
};
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function main() {
  const { StackrApiClient } = await import('../lib/stackrApiV1');
  const { resolveCachedStackrCard, resolveStackrCard } = await import('../lib/stackrDomainAdapter');
  loader._load = originalLoad;
  const timeout = globalThis.setTimeout, clear = globalThis.clearTimeout;
  const deadlines = new Map<object, { delay: number; work: () => void }>();
  globalThis.setTimeout = ((work: () => void, delay?: number, ...args: unknown[]) => {
    if (delay !== 25 && delay !== 7000 && delay !== 10_000) return timeout(work, delay, ...args);
    const handle = {}; deadlines.set(handle, { delay, work }); return handle;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((handle: object) => {
    if (!deadlines.delete(handle)) clear(handle as ReturnType<typeof setTimeout>);
  }) as typeof clearTimeout;
  const expireDeadline = (delay: number) => {
    const pending = [...deadlines.values()].filter(deadline => deadline.delay === delay);
    assert.ok(pending.length, `Expected a pending ${delay}ms deadline`);
    for (const deadline of pending) deadline.work();
  };
  try {
    const storageRead = deferred<string | null>(), storageWrite = deferred<void>();
    let storedId: string | null = null, publicFetches = 0;
    const sentPublicHeaders: Headers[] = [];
    readStorage = () => storageRead.promise;
    writeStorage = (_key, value) => { storedId = value; return storageWrite.promise; };
    const publicClient = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
      getAccessToken: async () => { throw new Error('Public catalogue reads cannot wait for login'); },
      fetchImpl: async (_url, init) => {
        publicFetches++; sentPublicHeaders.push(new Headers(init?.headers));
        return Response.json({ data: { sets: [], cards: [], assets: [], results: [], references: [] }, meta: {} });
      },
    });
    const publicReads = [publicClient.sets(), publicClient.card(uuid(1)),
      publicClient.assetManifest({ printingId: uuid(1) }), publicClient.search({ q: 'Shelmet' }),
      publicClient.sameArtworkDisplayReferences([{ sourceCardId: uuid(1), sourceDefaultVariantId: uuid(2) }])];
    await tick();
    assert.equal(publicFetches, 0, 'Fast storage is allowed a small best-effort initialization window');
    expireDeadline(25);
    await Promise.all(publicReads);
    assert.equal(publicFetches, 5, 'A stuck real AsyncStorage read cannot block catalogue facts, art or search');
    assert.ok(sentPublicHeaders.every(headers => !headers.has('Authorization') && !headers.has('X-Stackr-Device-Id')));
    storageRead.resolve(null); await tick();
    const pendingWriteRead = publicClient.sets(); await tick(); expireDeadline(25); await pendingWriteRead;
    assert.equal(publicFetches, 6, 'A stuck real AsyncStorage write cannot block public retrieval either');
    storageWrite.resolve(); await tick(); await publicClient.sets();
    assert.equal(sentPublicHeaders.at(-1)?.get('X-Stackr-Device-Id'), storedId,
      'Completed persistence restores the same actual device identity on subsequent reads');
    assert.ok(String(storedId).startsWith('device:'));

    let failedStorageFetches = 0;
    const failedStorage = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
      getDeviceId: async () => { throw new Error('Storage unavailable'); },
      fetchImpl: async () => { failedStorageFetches++; return Response.json({ data: { sets: [] }, meta: {} }); },
    });
    await failedStorage.sets(); assert.equal(failedStorageFetches, 1, 'Optional storage failure is not catalogue failure');

    let cancelledFetches = 0, cancelledStorageReads = 0;
    const cancelledStorage = deferred<string>();
    const cancelled = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
      getDeviceId: () => { cancelledStorageReads++; return cancelledStorage.promise; },
      fetchImpl: async () => { cancelledFetches++; return Response.json({ data: { sets: [] }, meta: {} }); },
    });
    const before = new AbortController(); before.abort();
    await assert.rejects(cancelled.sets({}, { signal: before.signal }), { name: 'AbortError' });
    assert.equal(cancelledStorageReads, 0, 'A route already cancelled must not begin initialization');
    const during = new AbortController();
    const cancelledRead = cancelled.sets({}, { signal: during.signal });
    const cancellation = assert.rejects(cancelledRead, { name: 'AbortError' });
    await tick(); during.abort(); await cancellation;
    cancelledStorage.resolve('device:late-storage-000001'); await tick();
    assert.equal(cancelledFetches, 0, 'Storage completing after screen cancellation must never dispatch a fetch');

    let privateFetches = 0, privateStorageCalls = 0;
    const privateStorage = deferred<string>();
    const privateHeaders: Headers[] = [];
    const privateClient = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
      getAccessToken: async () => 'exact-owner-token',
      getDeviceId: () => { privateStorageCalls++; return privateStorage.promise; },
      fetchImpl: async (_url, init) => {
        privateFetches++; privateHeaders.push(new Headers(init?.headers));
        return Response.json({ data: { snapshots: [] }, meta: {} });
      },
    });
    const privateRead = privateClient.marketPriceSnapshots({ variantIds: [uuid(2)] });
    const privateTimeout = assert.rejects(privateRead, /Device storage is taking longer/);
    await tick(); assert.equal(privateFetches, 0); expireDeadline(10_000); await privateTimeout;
    assert.equal(privateFetches, 0, 'Private initialization timeout must fail closed with no network dispatch');
    privateStorage.resolve('device:exact-owner-000001'); await tick();
    assert.equal(privateFetches, 0, 'Late private initialization cannot dispatch an expired request');
    await privateClient.marketPriceSnapshots({ variantIds: [uuid(2)] });
    assert.equal(privateStorageCalls, 2);
    assert.equal(privateFetches, 1, 'Retry initializes a new private request');
    assert.equal(privateHeaders[0].get('Authorization'), 'Bearer exact-owner-token');
    assert.equal(privateHeaders[0].get('X-Stackr-Device-Id'), 'device:exact-owner-000001');

    const moverCoverage = { scope: 'catalogue_daily', state: 'ready', source: 'tcgcsv',
      publishedVariants: 100_000, supportedVariants: 80_000, quotedVariants: 70_000,
      comparableVariants: 60_000, unsupportedVariants: 20_000, unquotedVariants: 10_000,
      staleVariants: 5000, insufficientHistoryVariants: 5000, latestSourceAt: null, asOf: '2026-10-24T00:00:00Z' };
    const moverRequests: URL[] = [];
    const moverClient = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
      getAccessToken: async () => 'exact-owner-token', getDeviceId: async () => 'device:exact-owner-000001',
      fetchImpl: async (url, init) => {
        const request = new URL(String(url)); moverRequests.push(request);
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('Authorization'), 'Bearer exact-owner-token');
        assert.equal(headers.get('X-Stackr-Device-Id'), 'device:exact-owner-000001');
        assert.equal(request.searchParams.get('scope'), 'catalogue_daily');
        return Response.json({ data: { movers: [], coverage: moverCoverage }, meta: {} });
      },
    });
    for (const sortBy of ['money', 'percent'] as const) {
      for (const limit of [undefined, 100, 7]) {
        const result = await moverClient.marketMovers({ scope: 'catalogue_daily', sortBy, limit });
        assert.equal(moverRequests.at(-1)?.searchParams.get('limit'), limit === 7 ? '7' : '50',
          'Actual authenticated mover transport retains the 50-item response boundary');
        assert.equal(moverRequests.at(-1)?.searchParams.get('sortBy'), sortBy);
        assert.deepEqual(result.data.coverage, moverCoverage,
          'A bounded ranked result does not shrink global catalogue coverage metadata');
      }
    }

    const denied = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1', getAccessToken: async () => null,
      getDeviceId: async () => { throw new Error('Signed-out reads must not initialize devices'); },
      fetchImpl: async () => { throw new Error('Signed-out private read dispatched'); },
    });
    await assert.rejects(denied.marketPriceSnapshots({ variantIds: [uuid(2)] }), (error: unknown) =>
      (error as { status?: number })?.status === 401);
    const privateStorageFailure = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
      getAccessToken: async () => 'exact-owner-token', getDeviceId: async () => { throw new Error('Private storage unavailable'); },
      fetchImpl: async () => { throw new Error('Private storage failure dispatched without identity'); },
    });
    await assert.rejects(privateStorageFailure.marketPriceSnapshots({ variantIds: [uuid(2)] }), /Private storage unavailable/);
    assert.equal(deadlines.size, 0, 'Initialization always releases its deadlines');

    const previewRuntime = globalThis as unknown as { __DEV__?: boolean; window?: { location: { origin: string; hostname: string } } };
    const originalDevelopment = previewRuntime.__DEV__, originalWindow = previewRuntime.window;
    try {
      previewRuntime.__DEV__ = true;
      previewRuntime.window = { location: { origin: 'http://localhost:8081', hostname: 'localhost' } };
      let previewStorageReads = 0;
      const previewUrls: string[] = [];
      const preview = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
        getDeviceId: async () => { previewStorageReads++; throw new Error('Preview storage unavailable'); },
        fetchImpl: async (url, init) => {
          previewUrls.push(String(url));
          assert.equal(new Headers(init?.headers).has('Authorization'), false);
          assert.equal(new Headers(init?.headers).has('X-Stackr-Device-Id'), false);
          return Response.json({ data: { sets: [] }, meta: {} });
        },
      });
      await preview.sets();
      assert.equal(previewStorageReads, 0, 'Anonymous loopback preview must still avoid storage entirely');
      assert.equal(previewUrls[0], 'http://localhost:8081/__stackr-preview-api/v1/sets?limit=50');
      const authenticatedDevice = deferred<string>(), stopPrivate = new AbortController();
      let authenticatedFetches = 0;
      const authenticatedPreview = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
        headers: { Authorization: 'Bearer exact-owner-token' }, getDeviceId: () => authenticatedDevice.promise,
        fetchImpl: async (url, init) => {
          authenticatedFetches++;
          assert.equal(String(url), 'https://api.stackr.test/v1/sets?limit=50');
          assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer exact-owner-token');
          assert.equal(new Headers(init?.headers).get('X-Stackr-Device-Id'), 'device:exact-owner-000001');
          return Response.json({ data: { sets: [] }, meta: {} });
        },
      });
      const cancelledPrivate = authenticatedPreview.sets({}, { signal: stopPrivate.signal });
      const privateCancellation = assert.rejects(cancelledPrivate, { name: 'AbortError' });
      await tick(); stopPrivate.abort(); await privateCancellation;
      authenticatedDevice.resolve('device:exact-owner-000001'); await tick();
      assert.equal(authenticatedFetches, 0, 'Cancelled authenticated bootstrap cannot dispatch after identity resolves');
      await authenticatedPreview.sets();
      assert.equal(authenticatedFetches, 1, 'Authenticated retry must stay on HTTPS with both original security headers');
    } finally {
      if (originalDevelopment === undefined) delete previewRuntime.__DEV__; else previewRuntime.__DEV__ = originalDevelopment;
      if (originalWindow === undefined) delete previewRuntime.window; else previewRuntime.window = originalWindow;
    }

    let revalidationFetches = 0;
    const stopRevalidation = new AbortController();
    const aborted304 = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
      getDeviceId: async () => 'device:runtime-fixture-000001', fetchImpl: async () => {
        revalidationFetches++; stopRevalidation.abort(); return new Response(null, { status: 304 });
      },
    });
    await assert.rejects(aborted304.sets({}, { signal: stopRevalidation.signal }), { name: 'AbortError' });
    assert.equal(revalidationFetches, 1, 'An aborted response must not dispatch a cache-revalidation replay');

    const stuck = deferred<Response>(); let requests = 0;
    const transportSignals: AbortSignal[] = [];
    const card = { cardId: uuid(1), defaultVariantId: uuid(2), names: { native: 'Current card' } };
    const client = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
      getDeviceId: async () => 'device:runtime-fixture-000001',
      getAccessToken: async () => { throw new Error('Public card retrieval must not wait on login'); },
      fetchImpl: async (_url, init) => {
        if (++requests === 1) { if (init?.signal) transportSignals.push(init.signal); return stuck.promise; }
        return Response.json({ data: { card }, meta: {} });
      },
    });
    const first = resolveCachedStackrCard(uuid(1), {}, client);
    const joined = resolveCachedStackrCard(uuid(1), {}, client);
    const failures = Promise.all([assert.rejects(first, /catalogue is taking longer/), assert.rejects(joined, /catalogue is taking longer/)]);
    await tick();
    assert.equal(requests, 1, 'Simultaneous consumers still deduplicate the same required card read');
    assert.equal(deadlines.size, 1, 'The shared pending card read has one absolute deadline');
    assert.ok(transportSignals[0] && !transportSignals[0].aborted, 'Shared required read owns an active transport signal');
    expireDeadline(7000);
    await failures;
    assert.equal(transportSignals[0].aborted, true, 'The shared deadline aborts the underlying card request');
    assert.equal(deadlines.size, 0);
    assert.equal((await resolveCachedStackrCard(uuid(1), {}, client))?.card.names.native, 'Current card');
    assert.equal(requests, 2, 'Retry must start a fresh request after the shared read deadline');
    stuck.resolve(Response.json({ data: { card: { ...card, names: { native: 'Late old card' } } }, meta: {} }));
    await tick();
    assert.equal((await resolveCachedStackrCard(uuid(1), {}, client))?.card.names.native, 'Current card');
    assert.equal(requests, 2, 'A timed-out result cannot overwrite the successful retry or erase its cache');
    for (const status of [401, 403, 429, 500, 503]) {
      let reads = 0;
      const unavailable = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
        getDeviceId: async () => 'device:runtime-fixture-000001', fetchImpl: async () => {
          reads++; return Response.json({ error: { code: 'fixture_unavailable', message: 'Fixture request unavailable' }, meta: {} }, { status });
        } });
      await assert.rejects(resolveStackrCard(uuid(1), {}, unavailable), (error: unknown) => (error as { status?: number })?.status === status);
      assert.equal(reads, 1, 'Access/rate/backend failures cannot become a second name-search request or empty result');
    }
    let variantReads = 0;
    const variant = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
      getDeviceId: async () => 'device:runtime-fixture-000001', fetchImpl: async () => {
        if (++variantReads === 1) return Response.json({ error: { code: 'card_not_found', message: 'Not a printing ID' }, meta: {} }, { status: 404 });
        return Response.json({ data: { results: [{ type: 'card', reason: 'exact_canonical_id', cardId: card.cardId,
          variantId: card.defaultVariantId, card }] }, meta: {} });
      } });
    assert.equal((await resolveStackrCard(uuid(2), {}, variant))?.variantId, card.defaultVariantId);
    assert.equal(variantReads, 2, 'A genuine missing printing still permits exact variant-ID search fallback');
    const searchTransport = deferred<Response>(), searchSignals: AbortSignal[] = [];
    const searchClient = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1',
      getDeviceId: async () => 'device:runtime-fixture-000001', fetchImpl: async (_url, init) => {
        if (init?.signal) searchSignals.push(init.signal);
        return searchTransport.promise;
      },
    });
    const searchRead = resolveCachedStackrCard('swsh8-13', {}, searchClient);
    const searchTimeout = assert.rejects(searchRead, /catalogue is taking longer/);
    await tick(); assert.ok(searchSignals[0] && !searchSignals[0].aborted);
    expireDeadline(7000); await searchTimeout;
    assert.equal(searchSignals[0].aborted, true, 'The same cache deadline must also abort exact external-ID search');
    searchTransport.resolve(Response.json({ data: { results: [] }, meta: {} })); await tick();
    assert.equal(deadlines.size, 0);
    console.log('Actual client/adapter runtime: stalled storage cannot block public reads; cancelled routes never dispatch; private storage fails closed and Retry retains account/device headers; shared card deadlines abort transport and permit fresh recovery.');
  } finally {
    globalThis.setTimeout = timeout; globalThis.clearTimeout = clear;
  }
}
void main().catch(error => { loader._load = originalLoad; console.error(error); process.exitCode = 1; });
