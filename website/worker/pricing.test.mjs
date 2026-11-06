import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPriceService, discountedPence, parseSourceDocument, nextWeeklyRefresh, REFRESH_MS, STALE_MS } from './pricing.mjs';

const START = Date.parse('2026-11-01T13:00:00.000Z');
const product = { id: 'black', name: 'Black Bolt', language: 'English', setKey: 'black-bolt', type: 'Booster bundle', packs: 6, unit: '1 retail unit' };
const identity = { language: 'English', setKey: 'black-bolt', type: 'Booster bundle', packs: 6, unit: '1 retail unit', edition: 'standard', cardsPerPack: null };
const source = { id: 'retailer', name: 'Example UK', url: 'https://retailer.example/products/black-bolt', format: 'jsonld', country: 'GB', currency: 'GBP', identity, match: { titles: ['Pokemon Black Bolt Booster Bundle'], requiredText: ['one sealed bundle', '\\b6 booster packs\\b', 'English'] } };
const schema = (overrides = {}, offer = {}) => ({ '@context': 'https://schema.org', '@type': 'Product', name: 'Pokemon Black Bolt Booster Bundle', description: 'One sealed bundle with 6 booster packs in English.', offers: { '@type': 'Offer', price: '69.99', priceCurrency: 'GBP', availability: 'https://schema.org/InStock', ...offer }, ...overrides });
const html = (overrides, offer) => `<html><script type="application/ld+json">${JSON.stringify(schema(overrides, offer))}</script></html>`;
const seed = (overrides = {}) => ({ productId: 'black', sourceId: 'retailer', marketPence: 6999, currency: 'GBP', identity, observedAt: new Date(START).toISOString(), ...overrides });
function setup(options = {}) {
  let clock = START; let calls = 0; let content = html(); let failure = false;
  const service = createPriceService({ products: [product], sources: { black: [source] }, now: () => clock, fetchImpl: async () => { calls++; if (failure) throw new Error('offline'); return new Response(content); }, ...options });
  return { service, tick: amount => { clock += amount; }, content: next => { content = next; }, fail: () => { failure = true; }, calls: () => calls };
}
const request = (url = 'https://stackr.example/api/prices', options) => new Request(url, options);

test('10% price uses integer pence and rounds half pennies consistently', () => {
  assert.equal(discountedPence(6999), 6299);
  assert.equal(discountedPence(1), 1);
  assert.equal(discountedPence(10), 9);
  assert.equal(discountedPence(5), 5);
  assert.equal(discountedPence(15), 14);
  assert.equal(discountedPence(13999), 12599);
  assert.throws(() => discountedPence(0));
  assert.throws(() => discountedPence(6.99));
});

test('weekly review aligns with Monday 09:00 London across daylight saving changes', () => {
  for (const [observed, next] of [
    ['2026-11-02T22:00:00Z', '2026-11-09T09:00:00Z'],
    ['2026-11-09T09:00:00Z', '2026-11-16T09:00:00Z'],
    ['2027-03-27T12:00:00Z', '2027-03-29T08:00:00Z'],
    ['2027-10-30T12:00:00Z', '2027-11-01T09:00:00Z'],
  ]) assert.equal(new Date(nextWeeklyRefresh(Date.parse(observed))).toISOString(), new Date(next).toISOString());
});

test('encoded descriptions retain exact identity checks after decoding entities and markup', () => {
  assert.equal(parseSourceDocument(html({ description: '&lt;p&gt;One sealed bundle with 6 booster packs in English.&lt;/p&gt;' }), source, START).marketPence, 6999);
  assert.equal(parseSourceDocument(html({ description: '&#60;p&#62;One sealed bundle with 6&#32;booster packs in English.&#60;/p&#62;' }), source, START).marketPence, 6999);
  assert.throws(() => parseSourceDocument(html({ description: '&lt;p&gt;One sealed bundle with 36 booster packs in English.&lt;/p&gt;' }), source, START));
  assert.throws(() => parseSourceDocument(html({ description: '&lt;p&gt;One sealed bundle with 6 booster packs in Korean.&lt;/p&gt;' }), source, START));
});

test('opt-in empty-schema descriptions use one bounded SKU-pinned product element with exact page metadata', () => {
  const expected={ tag:'div', className:'product__description', pageTitle:'Black Bolt | Example UK', pageUrl:source.url };
  const descriptor={ ...source, match:{ ...source.match, sku:'SKU-EXACT', descriptionElement:expected } };
  const prefix='<meta property="og:title" content="Black Bolt | Example UK"><meta property="og:url" content="'+source.url+'">';
  const product=html({sku:'SKU-EXACT',description:''});
  const description='<div class="product__description rte"><div>One sealed bundle with 6 booster packs in English.</div></div>';
  assert.equal(parseSourceDocument(prefix+product+description,descriptor,START).marketPence,6999);
  assert.throws(()=>parseSourceDocument(prefix.replace(source.url,'https://retailer.example/another-product')+product+description,descriptor,START));
  assert.throws(()=>parseSourceDocument(prefix+product+description+description,descriptor,START));
  assert.throws(()=>parseSourceDocument(prefix+html({sku:'WRONG',description:''})+description,descriptor,START));
  assert.throws(()=>parseSourceDocument(prefix+html({sku:'SKU-EXACT',description:'One sealed bundle with 36 booster packs in Japanese.'})+description,descriptor,START));
  assert.throws(()=>parseSourceDocument(prefix+product+description.replace('6 booster','36 booster'),descriptor,START));
  const group='<script type="application/ld+json">'+JSON.stringify({'@type':'ProductGroup',hasVariant:[schema({sku:'SKU-OTHER',description:'',name:'Different product'}),schema({sku:'SKU-EXACT',description:''})]})+'</script>';
  assert.equal(parseSourceDocument(prefix+group+description,descriptor,START).marketPence,6999);
  const duplicate='<script type="application/ld+json">'+JSON.stringify({'@type':'ProductGroup',hasVariant:[schema({sku:'SKU-EXACT',description:''}),schema({sku:'SKU-EXACT',description:''})]})+'</script>';
  assert.throws(()=>parseSourceDocument(prefix+duplicate+description,descriptor,START));
});

test('bounded refresh batches persist a cursor and resume on a fresh service before completing the weekly cycle', async () => {
  const values=new Map(),cache={get:async key=>values.get(key),put:async(key,value)=>values.set(key,structuredClone(value))};
  const entries=[1,2,3,4].map(number=>({...source,id:'source'+number,url:'https://retailer'+number+'.example/product'}));
  const first=setup({sources:{black:entries},limits:{batchSources:2},cache});
  const partial=await first.service.refresh();
  assert.equal(first.calls(),2);assert.equal(partial.refreshPending,true);assert.equal(partial.refreshProgress.completedSources,2);assert.equal(partial.lastRefreshAttemptAt,null);assert.equal(partial.persistenceStatus,'stored');
  const second=setup({sources:{black:entries},limits:{batchSources:2},cache});
  const saved=await second.service.getSnapshot();assert.equal(saved.refreshPending,true);assert.equal(second.calls(),0);assert.equal(saved.persistenceStatus,'loaded');
  const completed=await(await second.service.handleRequest(request())).json();
  assert.equal(second.calls(),2);assert.equal(completed.refreshPending,false);assert.equal(completed.refreshProgress.completedSources,4);assert.equal(completed.products.black.currentSourceCount,4);assert.equal(completed.lastRefreshAttemptAt,new Date(START).toISOString());assert(Date.parse(completed.nextRefreshAt)>START);
  await second.service.handleRequest(request());assert.equal(second.calls(),2,'A completed cycle must not restart before its weekly review');
});

test('changed retailer quote changes StackR price after weekly review', async () => {
  const run = setup();
  const first = await (await run.service.handleRequest(request())).json();
  assert.equal(first.products.black.marketPence, 6999);
  assert.equal(first.products.black.shopPence, 6299);
  assert.equal(first.products.black.savingsPence, 700);
  assert.equal(first.discountBps, 1000);
  assert.deepEqual(first.products.black.identity, identity);
  run.content(html({}, { price: '79.99' }));
  run.tick(Date.parse(first.nextRefreshAt) - START - 1);
  assert.equal((await (await run.service.handleRequest(request())).json()).products.black.marketPence, 6999);
  assert.equal(run.calls(), 1);
  run.tick(1);
  assert.equal((await (await run.service.handleRequest(request())).json()).products.black.shopPence, 7199);
  assert.equal(run.calls(), 2);
});

test('failed refresh retains source time and becomes stale at seven days', async () => {
  const run = setup();
  const first = await run.service.refresh();
  run.fail(); run.tick(REFRESH_MS / 2);
  const failed = await run.service.refresh();
  assert.equal(failed.products.black.observedAt, first.products.black.observedAt);
  assert.equal(failed.products.black.status, 'current');
  assert.equal(failed.products.black.sources[0].error, 'provider-unavailable');
  run.tick(STALE_MS - REFRESH_MS / 2);
  const stale = await run.service.getSnapshot();
  assert.equal(stale.products.black.status, 'stale');
  assert.equal(stale.products.black.shopPence, 6299);
  assert.equal(stale.products.black.observedAt, first.products.black.observedAt);
});

test('missing providers remain unavailable with null amounts and explicit source counts', async () => {
  const run = setup({ sources: {} });
  const feed = await run.service.refresh();
  assert.equal(feed.products.black.status, 'unavailable');
  assert.equal(feed.products.black.marketPence, null);
  assert.equal(feed.products.black.shopPence, null);
  assert.equal(feed.products.black.configuredSourceCount, 0);
  assert.equal(run.calls(), 0);
});

test('expanded catalogue initializes every product, including zero-booster fixed decks, without invented prices', async () => {
  const catalogue=JSON.parse(fs.readFileSync(new URL('../src/products.json',import.meta.url),'utf8'));
  const configured=JSON.parse(fs.readFileSync(new URL('./price-sources.json',import.meta.url),'utf8'));
  const deck=catalogue.find(entry=>entry.packs===0&&entry.deckCards===60);
  assert(deck,'Expanded catalogue must retain ready-to-play fixed decks');
  let calls=0;
  const service=createPriceService({products:catalogue,sources:configured,now:()=>START,fetchImpl:async()=>{calls++;throw Error('No source fetch expected');}});
  const snapshot=await service.getSnapshot();
  assert.deepEqual(Object.keys(snapshot.products).sort(),catalogue.map(entry=>entry.id).sort());
  assert.equal(snapshot.products[deck.id].identity.packs,0);
  assert.equal(snapshot.products[deck.id].identity.type,deck.type);
  assert.equal(snapshot.products[deck.id].status,'unavailable');
  assert.equal(snapshot.products[deck.id].marketPence,null);
  assert.equal(snapshot.products[deck.id].shopPence,null);
  assert.equal(calls,0);
  assert.throws(()=>createPriceService({products:[{...deck,packs:-1}],sources:{}}),/Incomplete identity/);
});

test('a fixed deck quote cannot borrow the identity or price of a booster product', async () => {
  const deck={id:'fixed-deck',name:'Fixed battle deck',language:'English',setKey:'collections',type:'Battle deck',packs:0,deckCards:60,unit:'1 retail unit'};
  const deckIdentity={...identity,setKey:'collections',type:'Battle deck',packs:0};
  const deckSource={...source,identity:deckIdentity,match:{titles:['Pokemon fixed battle deck'],requiredText:['60-card deck','English']}};
  const service=createPriceService({products:[deck],sources:{[deck.id]:[deckSource]},seedQuotes:[{...seed(),productId:deck.id,identity}],now:()=>START});
  assert.equal((await service.getSnapshot()).products[deck.id].status,'unavailable');
  const exact=createPriceService({products:[deck],sources:{[deck.id]:[deckSource]},seedQuotes:[{...seed(),productId:deck.id,identity:deckIdentity,marketPence:1999}],now:()=>START});
  const quote=(await exact.getSnapshot()).products[deck.id];
  assert.equal(quote.status,'current');assert.equal(quote.marketPence,1999);assert.equal(quote.shopPence,1799);
});

test('seed evidence must have exact identity and valid nonfuture timestamps', async () => {
  for (const bad of [seed({ observedAt: 'invalid' }), seed({ observedAt: '2026-02-30T13:00:00Z' }), seed({ observedAt: new Date(START + 1).toISOString() }), seed({ identity: { ...identity, language: 'Japanese' } }), seed({ identity: { ...identity, packs: 20 } }), seed({ identity: { ...identity, edition: 'Pokemon Center' } }), seed({ currency: 'USD' }), seed({ marketPence: 0 }), seed({ asOf: new Date(START + 1).toISOString() })]) {
    const run = setup({ seedQuotes: [bad] });
    assert.equal((await run.service.getSnapshot()).products.black.status, 'unavailable');
    assert.equal(run.calls(), 0);
  }
  const run = setup({ seedQuotes: [seed()] });
  assert.equal((await run.service.getSnapshot()).products.black.status, 'current');
  run.tick(STALE_MS);
  assert.equal((await run.service.getSnapshot()).products.black.status, 'stale');
});

test('old source-as-of remains stale even when retrieval observation is recent', async () => {
  const run = setup({ seedQuotes: [seed({ asOf: new Date(START - STALE_MS).toISOString() })] });
  assert.equal((await run.service.getSnapshot()).products.black.status, 'stale');
});

test('cached explicit stock withdrawal is not resurrected by bootstrap seed evidence', async () => {
  const values = new Map();
  const cache = { get: async key => values.get(key), put: async (key, value) => values.set(key, structuredClone(value)) };
  const first = setup({ cache });
  first.content(html({}, { availability: 'https://schema.org/OutOfStock' }));
  await first.service.refresh();
  const second = setup({ cache, seedQuotes: [seed()] });
  assert.equal((await second.service.getSnapshot()).products.black.status, 'unavailable');
});

test('reject exact title, pack and language mismatches, foreign currency, out-of-stock and preorder', () => {
  for (const document of [html({ name: 'Pokemon White Flare Booster Bundle' }), html({ description: 'One sealed bundle with 36 booster packs in English.' }), html({ description: 'One sealed bundle with 6 booster packs in Japanese.' }), html({}, { priceCurrency: 'USD' }), html({}, { availability: 'https://schema.org/OutOfStock' }), html({}, { availability: 'https://schema.org/PreOrder' }), html({}, { price: '0.00' }), html({}, { price: '69.999' })]) {
    assert.throws(() => parseSourceDocument(document, source, START));
  }
});

test('standard box and special edition identities cannot share descriptors; Chinese scripts stay separate', () => {
  assert.throws(() => setup({ sources: { black: [{ ...source, identity: { ...identity, edition: 'deluxe' } }] } }));
  assert.throws(() => setup({ products: [{ ...product, language: 'Traditional Chinese' }], sources: { black: [{ ...source, identity: { ...identity, language: 'Simplified Chinese' } }] } }));
});

test('an explicit current out-of-stock observation withdraws prior in-stock evidence', async () => {
  const run = setup(); await run.service.refresh();
  run.content(html({}, { availability: 'https://schema.org/OutOfStock' })); run.tick(REFRESH_MS);
  const feed = await run.service.refresh();
  assert.equal(feed.products.black.status, 'unavailable');
  assert.equal(feed.products.black.marketPence, null);
  assert.equal(feed.products.black.sources[0].marketPence, 6999);
  assert.equal(feed.products.black.sources[0].observedAt, new Date(START).toISOString());
});

test('arbitrary price banners and AggregateOffer are never market evidence', () => {
  assert.throws(() => parseSourceDocument('<div>SALE £9.99 In Stock</div>', source, START));
  assert.throws(() => parseSourceDocument(html({}, { '@type': 'AggregateOffer', lowPrice: '9.99' }), source, START));
  const unrelated = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Organization', offers: { price: 1 } })}</script>`;
  assert.throws(() => parseSourceDocument(unrelated, source, START));
});

test('provider timestamps must not be future or malformed', () => {
  assert.throws(() => parseSourceDocument(html({ dateModified: '2099-01-01T00:00:00Z' }), source, START));
  assert.throws(() => parseSourceDocument(html({ dateModified: 'not-a-date' }), source, START));
  assert.equal(parseSourceDocument(html({ dateModified: '2026-10-31T13:00:00Z' }), source, START).providerUpdatedAt, '2026-10-31T13:00:00.000Z');
});

test('offer variant must match trusted variant, and ambiguous offers are rejected', () => {
  const withVariant = { ...source, match: { ...source.match, variantId: '123' } };
  assert.throws(() => parseSourceDocument(html({}, { url: 'https://retailer.example/products/black-bolt?variant=456' }), withVariant, START));
  assert.equal(parseSourceDocument(html({}, { url: 'https://retailer.example/products/black-bolt?variant=123' }), withVariant, START).marketPence, 6999);
  assert.throws(() => parseSourceDocument(html({ offers: [schema().offers, schema().offers] }), source, START));
});

test('Shopify JSON requires actual currency and exact available variant', () => {
  const descriptor = { ...source, format: 'shopify-json', match: { ...source.match, variantId: '123' } };
  const productJson = { title: 'Pokemon Black Bolt Booster Bundle', description: schema().description, currency: 'GBP', variants: [{ id: 123, price: 6999, available: true }] };
  assert.equal(parseSourceDocument(JSON.stringify(productJson), descriptor, START).marketPence, 6999);
  assert.throws(() => parseSourceDocument(JSON.stringify({ ...productJson, currency: undefined }), descriptor, START));
  assert.throws(() => parseSourceDocument(JSON.stringify({ ...productJson, variants: [{ id: 123, price: 6999, available: false }] }), descriptor, START));
});

test('lowest exact current in-stock quote wins; failed source alone is retained, and single-source is disclosed', async () => {
  const second = { ...source, id: 'second', url: 'https://second.example/products/black-bolt' };
  let secondFails = false;
  const run = setup({ sources: { black: [source, second] }, fetchImpl: async url => {
    if (url === second.url && secondFails) throw new Error('offline');
    return new Response(html({}, { price: url === second.url ? '59.99' : '69.99' }));
  } });
  let feed = await run.service.refresh();
  assert.equal(feed.products.black.marketPence, 5999);
  assert.equal(feed.products.black.currentSourceCount, 2);
  assert.equal(feed.products.black.indicative, false);
  secondFails = true; run.tick(STALE_MS);
  feed = await run.service.refresh();
  assert.equal(feed.products.black.marketPence, 6999);
  assert.equal(feed.products.black.currentSourceCount, 1);
  assert.equal(feed.products.black.sources[1].status, 'stale');
  assert.equal(feed.products.black.indicative, true);
});

test('retrieval is bounded concurrently and deduplicated across simultaneous visitors', async () => {
  let active = 0; let maximum = 0; let calls = 0;
  const entries = [1, 2, 3, 4].map(number => ({ ...source, id: `source${number}`, url: `https://retailer${number}.example/product` }));
  const run = setup({ sources: { black: entries }, limits: { concurrency: 2 }, fetchImpl: async () => {
    calls++; active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return new Response(html());
  } });
  const responses = await Promise.all([run.service.handleRequest(request()), run.service.handleRequest(request()), run.service.handleRequest(request())]);
  for (const response of responses) assert.equal((await response.json()).products.black.status, 'current');
  assert.equal(maximum, 2); assert.equal(calls, 4);
});

test('a visitor arriving during an existing cold refresh waits for the same completed feed', async () => {
  let unblock; let started;
  const gate = new Promise(resolve => { unblock = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const run = setup({ fetchImpl: async () => { started(); await gate; return new Response(html()); } });
  const first = run.service.handleRequest(request());
  await entered;
  const second = run.service.handleRequest(request());
  unblock();
  const responses = await Promise.all([first, second]);
  for (const response of responses) assert.equal((await response.json()).products.black.status, 'current');
});

test('source budgets, private hosts and URL credentials are rejected before fetch', () => {
  for (const url of ['http://retailer.example/product', 'https://127.0.0.1/product', 'https://localhost/product', 'https://private.internal/product', 'https://user:pass@retailer.example/product']) {
    assert.throws(() => setup({ sources: { black: [{ ...source, url }] } }));
  }
  assert.throws(() => setup({ sources: { black: [source, { ...source, id: 'second' }] }, limits: { maxSources: 1 } }));
});

test('visitor query, cookie, authorization and referer never reach public providers', async () => {
  let observed;
  const run = setup({ fetchImpl: async (url, options) => { observed = { url, options }; return new Response(html()); } });
  await run.service.handleRequest(request('https://stackr.example/api/prices?url=https://evil.example&discountBps=10000', { headers: { Cookie: 'session=secret', Authorization: 'Bearer secret', Referer: 'https://private.example' } }));
  assert.equal(observed.url, source.url);
  assert.equal(observed.options.credentials, 'omit');
  assert.equal(observed.options.redirect, 'error');
  assert.deepEqual(Object.keys(observed.options.headers), ['Accept']);
});

test('timeouts and body-size limits preserve unavailable instead of publishing zero', async () => {
  const timeout = setup({ limits: { timeoutMs: 10 }, fetchImpl: async () => new Promise(() => {}) });
  assert.equal((await timeout.service.refresh()).products.black.sources[0].error, 'timeout');
  const oversized = setup({ limits: { maxBodyBytes: 10 } });
  assert.equal((await oversized.service.refresh()).products.black.sources[0].error, 'response-too-large');
  const lengthHeader = setup({ limits: { maxBodyBytes: 10 }, fetchImpl: async () => new Response('tiny', { headers: { 'Content-Length': '2000' } }) });
  assert.equal((await lengthHeader.service.refresh()).products.black.sources[0].error, 'response-too-large');
});

test('shared JSON cache prevents a second instance refetch and preserves stale evidence during an outage', async () => {
  const values = new Map();
  const cache = { get: async key => values.get(key), put: async (key, value) => values.set(key, structuredClone(value)) };
  const first = setup({ cache }); await first.service.refresh();
  const second = setup({ cache });
  await second.service.handleRequest(request()); assert.equal(second.calls(), 0);
  second.tick(STALE_MS); second.fail();
  const feed = await (await second.service.handleRequest(request())).json();
  assert.equal(feed.products.black.status, 'stale');
  assert.equal(feed.products.black.observedAt, new Date(START).toISOString());
  assert.equal(feed.products.black.marketPence, 6999);
});

test('cache namespace isolates product and language configuration; failed cache operations do not discard evidence', async () => {
  const values = new Map(); const cache = { get: async key => values.get(key), put: async (key, value) => values.set(key, structuredClone(value)) };
  await setup({ cache }).service.refresh();
  const french = { ...product, language: 'French' };
  const run = setup({ cache, products: [french], sources: { black: [{ ...source, identity: { ...identity, language: 'French' } }] } });
  assert.equal((await run.service.getSnapshot()).products.black.status, 'unavailable');
  const broken = setup({ cache: { get: async () => { throw new Error('unavailable'); }, put: async () => { throw new Error('unavailable'); } } });
  assert.equal((await broken.service.refresh()).products.black.status, 'current');
});

test('method/path handling has no write or refresh endpoint', async () => {
  const run = setup();
  assert.equal((await run.service.handleRequest(request('https://stackr.example/api/prices', { method: 'POST' }))).status, 405);
  assert.equal((await run.service.handleRequest(request('https://stackr.example/api/refresh'))).status, 404);
  assert.equal(run.calls(), 0);
});

test('configured runtime pack matchers cannot use accessory or competing pack counts as identity', () => {
  const configured = JSON.parse(fs.readFileSync(new URL('./price-sources.json', import.meta.url), 'utf8'));
  const etb = configured['asc-etb'][0];
  const example = description => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: etb.match.titles[0], description, offers: { '@type': 'Offer', price: '100.00', priceCurrency: 'GBP', availability: 'https://schema.org/InStock' } })}</script>`;
  for (const description of ['One English box has 9 sleeves and 11 booster packs.', 'One English box has 9 sleeves and eleven booster packs.', 'One English box has 19 booster packs.', 'One English box has 9 accessories and booster packs.']) {
    assert.throws(() => parseSourceDocument(example(description), etb, START));
  }
  for (const description of ['One English box has 9 booster packs.', '9 × Pokémon TCG: Mega Evolution—Ascended Heroes booster packs', 'Nine Ascended Heroes booster packs']) {
    assert.equal(parseSourceDocument(example(description), etb, START).marketPence, 10000);
  }
  for (const entries of Object.values(configured)) {
    for (const descriptor of entries.filter(entry => entry.identityReviewedAt)) {
      const matcher = new RegExp(descriptor.match.requiredText[0], 'i');
      assert.equal(matcher.test(`${descriptor.identity.packs} accessories and ${descriptor.identity.packs + 1} booster packs`), false);
      if(descriptor.liveParserVerified!==true)assert.equal(matcher.test(`${descriptor.identity.packs} booster ${descriptor.identity.packs===1?'pack':'packs'}`), true);
    }
  }
  for(const [productId,sourceId,description]of [
    ['prism-poster','leoslair','3 Pokémon TCG: Scarlet & Violet - Prismatic Evolutions booster packs'],
    ['prism-bundle','leoslair','6 Pokémon TCG: Scarlet & Violet - Prismatic Evolutions Booster Packs'],
    ['prism-bundle','tcgshopuk','6 Scarlet & Violet—Prismatic Evolutions booster packs'],
    ['en-shrouded-fable-bundle','eternacards','6 Pokemon TCG: Scarlet & Violet - Shrouded Fable - Booster Packs'],
  ]){
   const descriptor=configured[productId]?.find(source=>source.id===sourceId);if(descriptor)assert(new RegExp(descriptor.match.requiredText[0],'i').test(description));
  }
});
