import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import createV1Router from '../backend/routes/v1.js';
import {
  createPersonalPricingMiddleware, isLegacyPricingPath, isV1PricingPath,
  personalPricingConfiguration, verifiedPricingUserId,
} from '../backend/lib/marketPricing/personalAccess.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const env = { STACKR_PRICING_OWNER_USER_ID: owner };
let evidenceReads = 0;
let authReads = 0;
const supabase = { auth: { async getUser(token) {
  authReads++;
  if (token === 'unavailable') throw new Error('Offline verification fixture');
  if (token === 'invalid') return { data: { user: null }, error: { message: 'Invalid fixture token' } };
  return { data: { user: {
    id: ['owner', 'anonymous'].includes(token) ? owner : other,
    is_anonymous: token === 'anonymous',
    app_metadata: { role: 'admin' }, user_metadata: { ownerId: owner, role: 'admin' },
  } }, error: null };
} } };
const authenticate = (req) => verifiedPricingUserId(req, supabase);
const read = (value) => { evidenceReads++; return value; };
const pricingService = {
  price: async () => read({ amount: 12, ownerOnly: true }),
  priceHistory: async () => read({ variantId: owner, observations: [{ observedPrice: 12 }], pagination: {} }),
  snapshotHistory: async () => read({ snapshots: [] }),
  marketMovers: async () => read({ movers: [], pagination: {} }),
  marketOpportunities: async () => read({ opportunities: [], pagination: {} }),
  requestSnapshotRefresh: async (_id, _input, userId) => read({ status: 'queued', requestedBy: userId }),
  requestSnapshotRefreshBatch: async (_ids, _input, userId) => read({ summary: { queued: 1 }, requestedBy: userId }),
};
const app = express();
app.use(express.json());
app.use('/v1', createV1Router({ env, getAuthenticatedUserId: authenticate, pricingService,
  service: { languages: async () => ({ languages: [] }) } }));
app.use(createPersonalPricingMiddleware({ env, matchesPath: isLegacyPricingPath, getAuthenticatedUserId: authenticate }));
const legacyPaths = ['/api/pricing/card', '/market/cards/card', '/market/products/product', '/api/poketrace/card',
  '/api/poketrace/card/card/prices/raw/history', '/api/foreign/cards/card/prices', '/api/price/ebay', '/price',
  '/price/debug', '/api/price/tcgdex', '/api/pokemon-price-tracker/card'];
for (const path of legacyPaths) app.get(path, (_req, res) => res.json(read({ ownerOnly: true })));
const listener = await new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const base = `http://127.0.0.1:${listener.address().port}`;
const modern = [`/v1/cards/${owner}/price`, `/v1/cards/${owner}/price-history`, '/v1/market/price-snapshots',
  '/v1/market/movers', '/v1/market/opportunities'];
try {
  for (const path of [...modern, ...legacyPaths]) {
    for (const token of [null, 'other', 'invalid', 'anonymous', 'unavailable']) {
      const before = evidenceReads;
      const response = await fetch(base + path, { headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Stackr-User-Id': owner, 'X-Stackr-Admin-Key': owner,
      } });
      assert.equal(response.status, token === 'unavailable' ? 503 : token === 'other' || token === 'anonymous' ? 403 : 401, path);
      assert.equal(evidenceReads, before, 'Reject before any evidence read or provider call');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.match(response.headers.get('vary'), /Authorization/i);
      await response.arrayBuffer();
    }
    const accepted = await fetch(base + path, { headers: { Authorization: 'Bearer owner' } });
    assert.equal(accepted.status, 200, path);
    assert.equal(accepted.headers.get('cache-control'), 'private, no-store');
    assert.match(accepted.headers.get('vary'), /Authorization/i);
    await accepted.arrayBuffer();
  }
  for (const path of [`/v1/cards/${owner}/price-refresh`, '/v1/market/price-refresh']) {
    const before = evidenceReads;
    const denied = await fetch(base + path, { method: 'POST', headers: { Authorization: 'Bearer other', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 403); assert.equal(evidenceReads, before); await denied.arrayBuffer();
    const authBefore = authReads;
    const accepted = await fetch(base + path, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).data.requestedBy, owner);
    assert.equal(authReads, authBefore + 1, 'Verify once, and reuse only the server-verified identity');
  }
  const before = authReads;
  const catalogue = await fetch(`${base}/v1/languages`);
  assert.equal(catalogue.status, 200); assert.equal(authReads, before);
  assert.match(catalogue.headers.get('cache-control'), /public/); await catalogue.arrayBuffer();
  pricingService.price = async () => { throw new Error('Private backend fixture detail'); };
  const failed = await fetch(base + modern[0], { headers: { Authorization: 'Bearer owner' } });
  assert.equal(failed.status, 500);
  assert.equal(failed.headers.get('cache-control'), 'private, no-store');
  assert.match(failed.headers.get('vary'), /Authorization/i);
  assert.doesNotMatch(await failed.text(), /Private backend fixture detail/);
  delete env.STACKR_PRICING_OWNER_USER_ID;
  const missing = await fetch(base + modern[0]);
  assert.equal(missing.status, 503); await missing.arrayBuffer();
  for (const mode of ['typo', '']) assert.throws(() => personalPricingConfiguration({ STACKR_PRICING_ACCESS_MODE: mode }), /not configured/);
  for (const id of ['', `${owner},${other}`, 'not-an-id']) assert.throws(() => personalPricingConfiguration({ STACKR_PRICING_OWNER_USER_ID: id }), /not configured/);
  assert.equal(personalPricingConfiguration({ STACKR_PRICING_ACCESS_MODE: 'public' }).mode, 'public');
  assert.equal(isV1PricingPath(`/V1/cards/${owner}/PRICE/`), true);
  assert.equal(isLegacyPricingPath('/api/%70oketrace/card'), true);
  assert.equal(isV1PricingPath('/cards/card/variants'), false);
  assert.equal(isLegacyPricingPath('/api/tcgdex/search'), false);
  const serverSource = await readFile(new URL('../backend/server.js', import.meta.url), 'utf8');
  assert(serverSource.indexOf('app.use(createPersonalPricingMiddleware(') < serverSource.indexOf("app.get('/api/pricing/"), 'Legacy gate must run before legacy pricing handlers');
} finally { await new Promise((resolve) => listener.close(resolve)); }
console.log('Personal pricing access: verified owner only, no legacy bypass, no shared caching; catalogue unchanged.');
