import assert from 'node:assert/strict';
import Module from 'node:module';
process.env.STACKR_API_URL = 'https://api.stackr.test';
process.env.PRICE_API_URL = 'https://api.stackr.test';
process.env.STACKR_NODE_TOOLING_RUNTIME = 'true';

const loader = Module as unknown as { _load: (name: string, parent: unknown, main: boolean) => unknown };
const original = loader._load;
loader._load = (name, parent, main) => {
  if (name === 'react-native') return { Platform: { OS: 'web' } };
  if (name === 'react-native-url-polyfill/auto') return {};
  if (name === '@react-native-async-storage/async-storage') return { getItem: async () => null, setItem: async () => {} };
  return original(name, parent, main);
};

async function main() {
  const { StackrApiClient, StackrApiV1Error } = await import('../lib/stackrApiV1');
  loader._load = original;
  const calls: RequestInit[] = [];
  let always304 = false;
  const client = new StackrApiClient({
    baseUrl: 'https://api.stackr.test/v1', getDeviceId: async () => 'device:test:000001',
    getAccessToken: async () => 'test-owner-token',
    fetchImpl: async (_url, init) => {
      calls.push(init ?? {});
      return always304 || calls.length % 2 === 1 ? new Response(null, { status: 304 })
        : new Response(JSON.stringify({ data: { sets: [{ setId: 'restored' }] }, meta: {} }));
    },
  });
  const controller = new AbortController();
  const response = await client.sets({ language: 'en' }, { signal: controller.signal });
  assert.equal(response.data.sets[0].setId, 'restored');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].signal, controller.signal, 'recovery retains screen cancellation');
  assert.equal(calls[1].cache, 'no-store');
  assert.equal((calls[1].headers as Record<string, string>)['If-None-Match'], '');
  calls.length = 0;
  assert.throws(() => client.marketPriceSnapshots({ legacyIds: ['me4-33', ''], legacySetId: 'me4', language: 'en', latestOnly: true }), /non-empty/);
  assert.throws(() => client.marketPriceSnapshots({ legacyIds: ['me4-33', 'ME4-33'], legacySetId: 'me4', language: 'en', latestOnly: true }), /unique/);
  assert.throws(() => client.marketPriceSnapshots({ variantIds: ['exact-variant'], legacySetId: 'me4' }), /scope/);
  assert.equal(calls.length, 0, 'invalid selectors cannot be silently changed into a valid network request');
  await client.marketPriceSnapshots({ variantIds: ['exact-variant'] });
  assert.equal((calls[1].headers as Record<string, string>).Authorization, 'Bearer test-owner-token');
  always304 = true;
  calls.length = 0;
  await assert.rejects(client.catalogManifest('saved-etag'), (error: unknown) => error instanceof StackrApiV1Error && error.code === 'not_modified');
  assert.equal(calls.length, 1, 'explicit conditional manifest reads preserve their existing not-modified contract');
  calls.length = 0;
  await assert.rejects(client.sets(), (error: unknown) => error instanceof StackrApiV1Error && error.status === 304);
  assert.equal(calls.length, 2, 'a broken cache cannot create an unbounded retry loop');
  calls.length = 0;
  await assert.rejects(client.submitRecognitionShadowComparison({ rawImageRecorded: false }));
  assert.equal(calls.length, 1, 'mutations must never be replayed by read-cache recovery');
  console.log('API cache recovery preserves authentication, cancellation, conditional manifests and mutation safety.');
}
void main();
