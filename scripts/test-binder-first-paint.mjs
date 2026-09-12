import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createSetFactsReader, loadCompleteSetPages, mergeBinderArtwork, publicSetCardFacts, validateCompleteSet } from '../lib/stackrSetRetrieval.ts';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const setId = uuid(90000);
const makeCards = (count) => Array.from({ length: count }, (_, i) => ({
  cardId: uuid(i + 1), catalogueVersionId: uuid(90001), game: 'pokemon', languageCode: 'en',
  set: { setId, setCode: 'test', nativeName: 'Fixture', englishDisplayName: 'Fixture' },
  collectorNumber: { value: String(i + 1).padStart(3, '0'), sort: i + 1, prefix: null, suffix: null, sortKey: String(i + 1).padStart(3, '0') },
  names: { native: `Card ${i + 1}`, englishDisplay: `Card ${i + 1}` }, rarity: { code: 'common', label: 'Common' },
  defaultVariantId: uuid(i + 10001), variants: [{ variantId: uuid(i + 10001), canonicalId: `pokemon:en:${setId}:${i + 1}:normal`, variantCode: 'normal', variantLabel: 'Normal', finishCode: 'normal', finishLabel: 'Normal', artworkKey: null, imageVariantId: uuid(i + 10001), image: null, updatedAt: null }], updatedAt: null,
}));
const key = (count = 124, namespace = 'https://fixture.invalid/v1') => ({ namespace, setId, language: 'en', expectedCount: count });
const clone = (v) => JSON.parse(JSON.stringify(v));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const memoryStore = () => {
  const rows = new Map(); let writes = 0;
  return { rows, get writes() { return writes; }, async read(k) { return clone(rows.get(JSON.stringify([k.namespace, k.setId, k.language])) ?? null); }, async write(v) { writes++; rows.set(JSON.stringify([v.namespace, v.setId, v.language]), clone(v)); }, async clear(namespace) { for (const [id, row] of rows) if (row.namespace === namespace) rows.delete(id); } };
};

let tests = 0;
async function test(name, run) { await run(); tests++; console.log(`PASS ${name}`); }

for (const count of [124, 252]) await test(`complete ${count} identities without an artwork or price dependency`, async () => {
  const cards = makeCards(count); let calls = 0;
  const rows = await loadCompleteSetPages(key(count), async (cursor) => {
    calls++; return cursor ? { cards: cards.slice(100), nextCursor: null } : { cards: cards.slice(0, 100), nextCursor: 'next' };
  }, (rows) => rows);
  assert.equal(calls, 2); assert.equal(rows.length, count);
  assert.deepEqual(rows.map((v) => v.cardId), cards.map((v) => v.cardId));
  assert(rows.every((v) => v.variants.every((variant) => variant.image === null)));
});

await test('incomplete, duplicate, cross-language, cross-set and mixed-version responses fail closed', async () => {
  const cards = makeCards(124);
  assert.throws(() => validateCompleteSet(cards.slice(0, 117), key()));
  for (const change of [
    (rows) => { rows[123] = rows[0]; },
    (rows) => { rows[0].languageCode = 'ja'; },
    (rows) => { rows[0].set.setId = uuid(99999); },
    (rows) => { rows[0].catalogueVersionId = uuid(99998); },
    (rows) => { rows[0].defaultVariantId = uuid(99997); },
  ]) { const changed = clone(cards); change(changed); assert.throws(() => validateCompleteSet(changed, key())); }
});

await test('repeated pagination and changing versions reject instead of claiming completion', async () => {
  await assert.rejects(loadCompleteSetPages(key(), async () => ({ cards: makeCards(1), nextCursor: 'same' }), (rows) => rows), /repeated/);
  let calls = 0;
  await assert.rejects(loadCompleteSetPages(key(), async () => {
    const cards = makeCards(62); if (calls++) cards[0].catalogueVersionId = uuid(99999);
    return { cards, nextCursor: calls === 1 ? 'next' : null };
  }, (rows) => rows), /version changed/);
});

await test('public snapshot whitelists out ownership, credentials, prices and image URLs', async () => {
  const card = makeCards(1)[0]; card.owned = true; card.user_id = 'private'; card.price = 100; card.token = 'secret';
  card.set.user_id = 'private'; card.variants[0].image = { deliveryUrl: 'https://private.invalid/image' }; card.variants[0].owned = true;
  const serialized = JSON.stringify(publicSetCardFacts(card));
  for (const privateValue of ['private', 'secret', 'owned', 'user_id', 'deliveryUrl', '"price"']) assert(!serialized.includes(privateValue));
});

await test('missing or malformed versions cannot enter memory, disk or paginated catalogue results', async () => {
  for (const version of [null, undefined, '', 'not-a-version', 42]) {
    const invalid = makeCards(124); invalid[0].catalogueVersionId = version;
    assert.throws(() => validateCompleteSet(invalid, key()), /version/i);
    const store = memoryStore();
    const reader = createSetFactsReader({ store: async () => store });
    await assert.rejects(reader.read(key(), async () => invalid), /version/i);
    await reader.flush(); assert.equal(store.writes, 0);
    const corrupt = createSetFactsReader({ store: async () => ({ ...store,
      read: async () => ({ ...key(), schema: 1, fetchedAt: Date.now(), cards: invalid }),
    }) });
    assert.equal((await corrupt.read(key(), async () => makeCards(124))).source, 'network');
    await assert.rejects(loadCompleteSetPages(key(), async () => ({ cards: invalid, nextCursor: null }),
      () => makeCards(124)), /version/i, 'normalization must not hide unversioned source rows');
  }
  const unversioned = makeCards(124).map((card) => ({ ...card, catalogueVersionId: null }));
  assert.throws(() => validateCompleteSet(unversioned, key()), /version/i);
});

await test('one network read for 20 callers; fresh disk and memory need no additional network', async () => {
  const store = memoryStore(); let reads = 0;
  const reader = createSetFactsReader({ store: async () => store });
  const load = async () => { reads++; return makeCards(124); };
  const results = await Promise.all(Array.from({ length: 20 }, () => reader.read(key(), load)));
  assert(results.every((v) => v.cards.length === 124)); assert.equal(reads, 1); await reader.flush();
  const first = await reader.read(key(), load); assert.equal(first.source, 'memory'); first.cards[0].names.native = 'mutated';
  assert.equal((await reader.read(key(), load)).cards[0].names.native, 'Card 1');
  const reopened = createSetFactsReader({ store: async () => store });
  assert.equal((await reopened.read(key(), load)).source, 'disk'); assert.equal(reads, 1);
  assert.equal(store.writes, 1);
});

await test('partial results are not cached, retained or promoted as complete', async () => {
  const store = memoryStore(); const reader = createSetFactsReader({ store: async () => store });
  await assert.rejects(reader.read(key(), async () => makeCards(117)), /Incomplete/); await reader.flush(); assert.equal(store.writes, 0);
  assert.equal((await reader.read(key(), async () => makeCards(124))).cards.length, 124);
});

await test('expired or corrupt snapshots refetch; production cannot read staging snapshots', async () => {
  const store = memoryStore(); let now = 1000; let reads = 0;
  const load = async () => { reads++; return makeCards(124); };
  const reader = createSetFactsReader({ store: async () => store, now: () => now, ttlMs: 100 });
  await reader.read(key(), load); await reader.flush(); now += 101;
  await reader.read(key(), load); assert.equal(reads, 2);
  await reader.read(key(124, 'https://staging.invalid/v1'), load); assert.equal(reads, 3);
  const corrupt = createSetFactsReader({ store: async () => ({ read: async () => ({ schema: 1, cards: [] }), write: async () => {}, clear: async () => {} }) });
  assert.equal((await corrupt.read(key(), load)).source, 'network'); assert.equal(reads, 4);
});

await test('a stalled optional disk cache cannot hold up the network read', async () => {
  const reader = createSetFactsReader({ store: () => new Promise(() => {}), diskBudgetMs: 5 });
  const start = performance.now();
  assert.equal((await reader.read(key(), async () => makeCards(124))).cards.length, 124);
  assert(performance.now() - start < 500);
});

await test('one cancelled caller does not cancel other consumers of shared work', async () => {
  const reader = createSetFactsReader({ store: async () => null }); const wait = deferred(); const controller = new AbortController(); let calls = 0;
  const loader = async () => { calls++; return wait.promise; };
  const cancelled = reader.read(key(), loader, controller.signal); const alive = reader.read(key(), loader);
  controller.abort(new Error('left screen')); await assert.rejects(cancelled, /left screen/);
  wait.resolve(makeCards(124)); assert.equal((await alive).cards.length, 124); assert.equal(calls, 1);
});

await test('refresh discards late work and does not restore invalidated disk data', async () => {
  const store = memoryStore(); const reader = createSetFactsReader({ store: async () => store });
  const wait = deferred(); let started; const start = new Promise((resolve) => { started = resolve; });
  const old = reader.read(key(), async () => { started(); return wait.promise; }); await start;
  reader.invalidate(key().namespace); wait.resolve(makeCards(124)); await assert.rejects(old, /cancelled/);
  assert.equal((await reader.read(key(), async () => makeCards(124))).source, 'network'); await reader.flush(); assert.equal(store.writes, 1);
});

await test('late artwork preserves order, all edits, saved image reference and default finish', async () => {
  const facts = makeCards(2);
  const rows = facts.map((card, i) => ({ id: `row-${i}`, set_id: setId, card_id: card.cardId, language: 'en', owned: true, owned_quantity: 5, condition: 'Mint', grade: '10', notes: 'current', slot_order: 10 - i, tcg_price: 99, image_url: 'saved-image', card: { id: card.cardId, set: { id: setId }, raw_data: { stackr: { cardId: card.cardId, defaultVariantId: card.defaultVariantId } }, images: {} } }));
  const stale = clone(rows).reverse(); stale.forEach((row) => { row.owned = false; row.owned_quantity = 1; row.tcg_price = 1; row.card.images.small = 'approved-display'; });
  const merged = mergeBinderArtwork(rows, stale);
  assert.deepEqual(merged.map((row) => row.id), rows.map((row) => row.id));
  for (const row of merged) { assert.equal(row.owned_quantity, 5); assert.equal(row.tcg_price, 99); assert.equal(row.condition, 'Mint'); assert.equal(row.notes, 'current'); assert.equal(row.image_url, 'saved-image'); assert.equal(row.card.images.small, 'approved-display'); }
  const wrong = clone(stale); wrong[0].language = 'ja'; wrong[1].card.raw_data.stackr.defaultVariantId = uuid(77777);
  assert.deepEqual(mergeBinderArtwork(rows, wrong), rows);
});

console.log(`${tests} executable retrieval tests passed. Fixture tests are not production or device latency proof.`);
