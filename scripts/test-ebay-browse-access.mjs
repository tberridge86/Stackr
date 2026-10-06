import assert from 'node:assert/strict';
import { createEbayBrowsePriceSource } from '../backend/lib/marketPricing/ebayBrowseSource.js';

const calls = [];
const fakeFetch = async (url, init) => {
  calls.push({ url: String(url), init });
  assert.ok(init.signal, 'OAuth and Browse requests must have a deadline');
  if (String(url).endsWith('/oauth2/token')) {
    const credential = Buffer.from(init.headers.Authorization.slice(6), 'base64').toString().split(':')[0];
    return Response.json({ access_token: `token-${credential}`, expires_in: 3600 });
  }
  return Response.json({ itemSummaries: [{ itemId: 'v1|123|0', title: 'Pokemon card', price: { value: '10', currency: 'GBP' } }] });
};
const first = createEbayBrowsePriceSource({ clientId: 'one', clientSecret: 'fixture', fetchImpl: fakeFetch });
assert.equal((await first.healthCheck()).accessVerified, false);
assert.equal(calls.length, 0, 'configuration is not an access probe');
const results = await Promise.all([first.fetchActiveListings({ query: 'Pokemon' }), first.fetchActiveListings({ query: 'Pokemon' })]);
assert.equal(calls.filter(c => c.url.endsWith('/oauth2/token')).length, 1, 'concurrent OAuth requests coalesce');
assert.ok(results.every(r => r.ok && r.observations.every(o => o.sourceType === 'active_listing' && o.soldAt === null)));
const second = createEbayBrowsePriceSource({ clientId: 'two', clientSecret: 'fixture', fetchImpl: fakeFetch });
assert.equal((await second.healthCheck({ verifyAccess: true })).accessVerified, true);
assert.equal(calls.filter(c => c.url.endsWith('/oauth2/token')).length, 2);
assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer token-two', 'tokens cannot cross credential configurations');
const denied = createEbayBrowsePriceSource({ clientId: 'denied', clientSecret: 'fixture', fetchImpl: async () => new Response('private provider response', { status: 401 }) });
const failure = await denied.healthCheck({ verifyAccess: true });
assert.equal(failure.accessVerified, false); assert.equal(failure.reason, 'ebay_oauth_failed');
assert.ok(!JSON.stringify(failure).includes('private provider response'));
const invalid = createEbayBrowsePriceSource({ clientId: 'invalid', clientSecret: 'fixture', fetchImpl: async () => Response.json({ expires_in: 3600 }) });
assert.equal((await invalid.healthCheck({ verifyAccess: true })).reason, 'invalid_ebay_oauth_response');
const stalled = createEbayBrowsePriceSource({ clientId: 'stalled', clientSecret: 'fixture', requestTimeoutMs: 15, fetchImpl: (_url, init) => new Promise((_resolve, reject) => { const keepAlive = setTimeout(() => reject(Error('Deadline failed')), 500); init.signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(init.signal.reason); }, { once: true }); }) });
assert.equal((await stalled.healthCheck({ verifyAccess: true })).reason, 'ebay_request_timeout');
assert.equal((await second.fetchSoldObservations()).ok, false);
console.log('eBay access fixtures passed: bounded OAuth/Browse, credential isolation, coalescing, explicit live probe, safe failures and asking/sold separation.');
