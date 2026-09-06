import assert from 'node:assert/strict';
import Module from 'node:module';

const VARIANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiOrigin = 'https://gateway.stackr.test/v1';

function response(data: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    data,
    meta: { requestId: 'personal-pricing-test', apiVersion: '1', generatedAt: '2026-09-06T00:00:00.000Z' },
  }), { headers: { 'Content-Type': 'application/json' } });
}

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

async function loadClient() {
  process.env.STACKR_API_URL = apiOrigin.replace(/\/v1$/, '');
  process.env.PRICE_API_URL = apiOrigin.replace(/\/v1$/, '');
  const originalLoad = moduleWithLoad._load;
  moduleWithLoad._load = (request, parent, isMain) => {
    if (request === 'react-native') return { Platform: { OS: 'web' } };
    if (request === '@react-native-async-storage/async-storage') {
      return { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
    }
    if (request === 'react-native-url-polyfill/auto') return {};
    return originalLoad(request, parent, isMain);
  };
  try {
    return await import('../lib/stackrApiV1');
  } finally {
    moduleWithLoad._load = originalLoad;
  }
}

type ClientModule = Awaited<ReturnType<typeof loadClient>>;

async function pricingReadsRequireTokenAndStayOffPreviewProxy({ StackrApiClient }: ClientModule) {
  const globalScope = globalThis as typeof globalThis & { __DEV__?: boolean; window?: { location: { origin: string; hostname: string } } };
  const previousDev = Object.getOwnPropertyDescriptor(globalScope, '__DEV__');
  const previousWindow = Object.getOwnPropertyDescriptor(globalScope, 'window');
  Object.defineProperty(globalScope, '__DEV__', { configurable: true, value: true });
  Object.defineProperty(globalScope, 'window', {
    configurable: true,
    value: { location: { origin: 'http://127.0.0.1:8081', hostname: '127.0.0.1' } },
  });
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  try {
    const client = new StackrApiClient({
      baseUrl: apiOrigin,
      getAccessToken: async () => 'owner-access-token',
      getDeviceId: async () => 'device:owner:0001',
      fetchImpl: (async (url, init) => {
        calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
        return response();
      }) as typeof fetch,
    });

    await client.sets({ language: 'en' });
    await client.cardPrice(VARIANT_ID);
    await client.cardPriceHistory(VARIANT_ID);
    await client.marketMovers();
    await client.marketOpportunities();
    await client.marketPriceSnapshots({ variantIds: [VARIANT_ID], rangeDays: 7 });

    assert.match(calls[0].url, /^http:\/\/127\.0\.0\.1:8081\/__stackr-preview-api\/v1\/sets/);
    assert.equal(calls[0].headers.Authorization, undefined, 'catalogue reads stay anonymous');
    for (const call of calls.slice(1)) {
      assert.match(call.url, /^https:\/\/gateway\.stackr\.test\/v1\//, 'pricing reads must stay on HTTPS');
      assert.doesNotMatch(call.url, /__stackr-preview-api|127\.0\.0\.1|localhost/);
      assert.equal(call.headers.Authorization, 'Bearer owner-access-token');
    }
  } finally {
    if (previousDev) Object.defineProperty(globalScope, '__DEV__', previousDev); else Reflect.deleteProperty(globalScope, '__DEV__');
    if (previousWindow) Object.defineProperty(globalScope, 'window', previousWindow); else Reflect.deleteProperty(globalScope, 'window');
  }
}

async function unauthenticatedPricingNeverCallsNetwork({ StackrApiClient, StackrApiV1Error }: ClientModule) {
  let calls = 0;
  const client = new StackrApiClient({
    baseUrl: apiOrigin,
    getAccessToken: async () => null,
    fetchImpl: (async () => { calls += 1; return response(); }) as typeof fetch,
  });
  await assert.rejects(client.cardPrice(VARIANT_ID), (error: unknown) => (
    error instanceof StackrApiV1Error && error.status === 401 && error.code === 'authentication_required'
  ));
  assert.equal(calls, 0, 'pricing without a verified session must not issue an anonymous request');
}

async function run() {
  const clientModule = await loadClient();
  await pricingReadsRequireTokenAndStayOffPreviewProxy(clientModule);
  await unauthenticatedPricingNeverCallsNetwork(clientModule);
  console.log('personal pricing client checks passed');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
