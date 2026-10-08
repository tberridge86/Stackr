import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Buffer } from 'node:buffer';
import ts from 'typescript';
import { CataloguePriceCache } from '../lib/cataloguePriceCacheCore';
import type { StackrCardPrice } from '../lib/stackrApiV1';
import * as hash from '../lib/cataloguePriceHash';
import * as transport from '../lib/stackrApiTransportPolicy';

// Run the actual phone modules with only native/transport dependencies replaced.
function load<T>(file: string, mocks: Record<string, unknown>): T {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process, console, Date, Buffer, URL,
    require: (id: string) => { assert.ok(id in mocks, `Unexpected dependency ${id}`); return mocks[id]; } });
  return module.exports as T;
}

async function main() {
  const disk = new Map<string, string>();
  const storage = { getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => { disk.set(key, value); } };
  const api = load<typeof import('../lib/stackrApiV1')>('lib/stackrApiV1.ts', {
    '@react-native-async-storage/async-storage': storage, './config': { STACKR_API_URL: 'https://api.example.test' },
    './stackrApiTransportPolicy': transport, './supabase': {}, buffer: { Buffer }, './cataloguePriceHash': hash,
    './stackrPreviewApiProxy': { resolveStackrApiDeviceIdForRequest: (_remote: string, _request: string, getId: () => Promise<string>) => getId(), rewriteStackrApiUrlForLoopbackPreview: () => 'http://localhost/anonymous-preview', stripStackrPreviewProxyAuthorization: (value: unknown) => value },
  });
  const jwt = (sub: string, expiry: number) => `header.${Buffer.from(JSON.stringify({ sub, iss: 'https://auth.example.test', exp: expiry })).toString('base64url')}.signature`;
  let token: string | null = jwt('owner-a', 1);
  const requests: { url: string; body: any }[] = [];
  const ids = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  const quote = (variantId: string): StackrCardPrice => ({ variantId, identityKey: variantId, productType: 'raw_card', currency: 'GBP', status: 'market_estimate',
    priceType: 'market_estimate', estimates: { central: 12, low: null, high: null }, confidence: { label: 'low', score: 0.2 },
    calculatedAt: '2026-10-03T10:00:00Z', staleAfter: '2099-01-01T00:00:00Z', freshness: 'fresh',
    sample: { total: 1, sold: 0, active: 0, sources: 1, dateRange: { from: null, to: null } }, sourceBreakdown: [], outliers: {}, fallbackEstimate: null, unavailableReason: null,
    estimateVersion: 'fixture', provenLastSold: false, lastSoldEvidence: null });
  const client = new api.StackrApiClient({ baseUrl: 'https://api.example.test/v1', getAccessToken: async () => token,
    getDeviceId: async () => 'test-device', createIdempotencyKey: () => 'test-key', fetchImpl: async (url, init) => {
      assert.equal((init?.headers as any).Authorization, `Bearer ${token}`);
      assert.ok(String(url).startsWith('https://api.example.test/v1/'), 'authenticated reads must bypass anonymous preview proxy');
      const body = init?.body ? JSON.parse(String(init.body)) : null; requests.push({ url: String(url), body });
      let data: any;
      if (String(url).endsWith('/market/catalogue-prices')) {
        data = { prices: body.references.map((reference: string) => ({ reference, variantId: reference, cardId: reference,
          language: body.language, price: quote(reference), unavailableReason: null, nextRetryAt: null, revision: 'a'.repeat(64) })),
          unchangedReferences: [], priceRevision: 'b'.repeat(64), estimateMode: body.estimateMode };
      } else data = { ...quote(ids[0]), priceType: 'recent_sold', provenLastSold: true,
        lastSoldObservationId: 'verified-sale', lastSoldEvidence: { observationId: 'verified-sale', soldAt: '2026-10-02T10:00:00Z' } };
      return new Response(JSON.stringify({ data, meta: {} }), { headers: { 'Content-Type': 'application/json' } });
    } });
  const prices = load<typeof import('../lib/cataloguePrices')>('lib/cataloguePrices.ts', {
    '@react-native-async-storage/async-storage': storage, './cataloguePriceCacheCore': { CataloguePriceCache },
    './stackrSetRetrieval': {},
    './stackrPreferredSetArtwork': {},
    './cardArtworkPresentation': {},
    './publishedSetLogoFallbacks': {},
    './stackrCatalogueCache': {},
    './foreignCardPresentation': {},
    './englishSetIdentity': {},
    './pokemonSetSeries': {},
    './optionalCatalogueEnrichment': {},
    './stackrApiV1': { ...api, stackrApiClient: client }, './stackrDomainMappings': { toStackrApiLanguage: (value: string) => value },
    './cataloguePriceHash': hash,
  });
  const adapter = load<typeof import('../lib/stackrDomainAdapter')>('lib/stackrDomainAdapter.ts', {
    './stackrSetRetrieval': {},
    './stackrPreferredSetArtwork': {},
    './cardArtworkPresentation': {},
    './publishedSetLogoFallbacks': {},
    './stackrCatalogueCache': {},
    './foreignCardPresentation': {},
    './englishSetIdentity': {},
    './pokemonSetSeries': {},
    './optionalCatalogueEnrichment': {},
    './stackrApiV1': { ...api, stackrApiClient: {} }, './cataloguePrices': prices, './supabase': {},
    './stackrDomainMappings': {}, './tcgdexControlledCardReference': {}, './providerSetMarkRuntimePolicy': {},
    './homePriceRefreshCore': {}, './stackrPriceIdentity': {}, './pokemonDisplayNames': {}, './cardNameTranslations.js': {},
    './pokemonSetIdentity': {}, './resilientCatalogueRead': {}, './optionalSearchEnrichment': {},
  });
  assert.equal((await adapter.fetchStackrPriceSnapshots(ids, { language: 'en' }, client)).size, 201);
  assert.deepEqual(requests.map((request) => request.body.references.length), [100, 100, 1]);
  assert.ok(requests.every((request) => request.url.endsWith('/market/catalogue-prices')), 'no individual identity or price requests');
  const scopeA = await client.getPricingCacheScope();
  await prices.cataloguePriceCache.flush(); prices.cataloguePriceCache.clearMemory();
  await prices.fetchCataloguePrices(ids, { language: 'en' }, client);
  assert.equal(requests.length, 3, 'a full restart hydrates saved pages without network');
  token = jwt('owner-a', 999);
  assert.equal(await client.getPricingCacheScope(), scopeA, 'token refresh preserves account cache');
  token = jwt('owner-b', 999);
  assert.notEqual(await client.getPricingCacheScope(), scopeA);
  await prices.fetchCataloguePrices([ids[0]], { language: 'en' }, client);
  assert.equal(requests.length, 4, 'a second account cannot hydrate the first account quote');
  token = null;
  await assert.rejects(prices.fetchCataloguePrices([ids[0]], { language: 'en' }, client));
  assert.equal(requests.length, 4, 'signed-out reads do not use cached prices');
  token = jwt('owner-a', 999);
  await prices.fetchCataloguePrices([ids[0]], { language: 'en', estimateMode: 'general' }, client);
  await prices.fetchCataloguePrices([ids[0]], { language: 'ja' }, client);
  assert.equal(requests.length, 6, 'language and general/exact modes are isolated');
  const identity = { variantId: ids[0], cardId: ids[0], language: 'en' };
  await prices.fetchCachedRawDetailPrice(identity, { condition: 'near_mint' }, client);
  const detail = await prices.fetchCachedRawDetailPrice(identity, { condition: 'near_mint' }, client);
  assert.equal(detail.provenLastSold, true); assert.equal(detail.lastSoldEvidence?.observationId, 'verified-sale', 'detail cache preserves exact sale provenance');
  assert.equal(requests.length, 7);
  await prices.fetchCachedRawDetailPrice(identity, { condition: 'lightly_played' }, client);
  assert.equal(requests.length, 8, 'condition-specific detail quotes have separate caches');
  await prices.fetchCachedRawDetailPrice(identity, { condition: 'near_mint' }, client, true);
  assert.equal(requests.length, 9, 'manual refresh bypasses the fresh detail cache');
  const currentMarket = prices.cataloguePriceDisplay({ reference: ids[0], variantId: ids[0], cardId: ids[0], language: 'en', price: quote(ids[0]), unavailableReason: null, nextRetryAt: null, revision: 'display-current' });
  assert.equal(currentMarket.sourceLabel, 'Current market value');
  const generalMarket = prices.cataloguePriceDisplay({ reference: ids[0], variantId: ids[0], cardId: ids[0], language: 'en', price: { ...quote(ids[0]), fallbackEstimate: { identityKey: ids[0], reason: 'general_card_estimate', exact: false } }, unavailableReason: null, nextRetryAt: null, revision: 'display-general' });
  assert.equal(generalMarket.sourceLabel, 'Estimated price');
  const sold = prices.cataloguePriceDisplay({ reference: ids[0], variantId: ids[0], cardId: ids[0], language: 'en', price: { ...quote(ids[0]), priceType: 'recent_sold_value', provenLastSold: true, lastSoldEvidence: { observationId: 'verified-sale' } }, unavailableReason: null, nextRetryAt: null, revision: 'display-sold' });
  assert.equal(sold.sourceLabel, 'Last sold');
  assert.ok([...disk.keys()].every((key) => !key.includes('signature') && !key.includes('owner-a')), 'cache keys contain hashed identity, never bearer tokens');
  console.log('Price client passed: 201 cards / 3 bulk requests, zero per-card requests, restart / zero requests, account/token/language/mode/condition isolation, authenticated preview routing and forced detail refresh.');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
