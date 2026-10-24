import assert from 'node:assert/strict';
import { fetchFastSetCards } from '../backend/lib/fastSetCards.js';
import { parseCursor } from '../backend/lib/stackrApiV1.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const setId = id(100);
const versionId = id(101);
const env = {
  STACKR_R2_BUCKET: 'catalogue-public', STACKR_R2_PUBLIC_BASE_URL: 'https://cdn.example/catalogue/',
  STACKR_ASSET_BASE_URL: 'https://legacy-proxy.example', SUPABASE_URL: 'https://metadata.supabase.co',
};
const environmentKeys = [...Object.keys(env), 'STACKR_CATALOGUE_STORAGE_PROVIDER'];
async function withEnvironment(values, operation) {
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of environmentKeys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    return await operation();
  } finally {
    for (const key of environmentKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}
const card = (n) => ({
  printing_id: id(n), variant_id: id(n + 10), catalogue_version_id: versionId,
  canonical_key: `pokemon:en:fixture:${n}:normal`, game_code: 'pokemon', language_code: 'en',
  set_id: setId, set_code: 'fixture', card_native_name: `Card ${n}`, card_english_display_name: `Card ${n}`,
  collector_number: String(n), collector_number_sort: n, variant_code: 'normal', finish_code: 'normal',
});
const asset = (n, overrides = {}) => ({
  asset_id: id(n + 20), asset_type: 'card_image', game_code: 'pokemon', set_id: setId,
  printing_id: id(n), variant_id: id(n + 10), storage_provider: 's3_compatible',
  storage_bucket: 'catalogue-public', storage_key: `originals/card ${n}.webp`, permission_status: 'approved',
  derivative_list: [
    { role: 'card-grid', storageKey: `grid/${n}.webp` },
    { role: 'search-result', storageProvider: 'supabase_storage', storageBucket: 'legacy-public', storageKey: `thumb/${n}.webp` },
    { role: 'unmapped', storageBucket: 'other-bucket', storageKey: 'not-mapped.webp' },
    { role: 'recorded', storageBucket: 'other-bucket', storageKey: 'recorded.webp', deliveryUrl: 'https://verified.example/recorded.webp' },
  ], ...overrides,
});
function fixture(images, error = null) {
  const requests = [];
  const db = { schema(schema) {
    assert.equal(schema, 'api');
    return {
      rpc(name, args) {
        assert.equal(name, 'catalogue_set_card_rows');
        assert.equal(args.p_set_id, setId); assert.equal(args.p_language_code, 'en');
        requests.push(args);
        return Promise.resolve({ data: images.map((image, index) => ({ card_row: card(index + 1), image_row: image })), error });
      },
      from(table) {
        assert.equal(table, 'catalogue_cards');
        return {
          select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
          then(resolve, reject) { return Promise.resolve({ data: [card(1)], error: null }).then(resolve, reject); },
        };
      },
    };
  } };
  return { requests, read: (input = {}, options = {}) => fetchFastSetCards(db, setId, { language: 'en', limit: 2, ...input }, options) };
}

await withEnvironment(env, async () => {
  const f = fixture([asset(1), asset(2, {
    storage_provider: 'supabase_storage', storage_bucket: 'legacy-public',
    derivative_list: [{ role: 'card-grid', storageProvider: 's3_compatible', storageBucket: 'catalogue-public', storageKey: 'migrated/grid.webp' }],
  }), asset(3)]);
  const page = await f.read();
  assert.equal(page.cards.length, 2, 'The sentinel row remains pagination-only.');
  const first = page.cards[0].variants[0].image;
  const second = page.cards[1].variants[0].image;
  assert.equal(first.deliveryUrl, 'https://cdn.example/catalogue/originals/card%201.webp');
  assert.equal(first.derivatives[0].deliveryUrl, 'https://cdn.example/catalogue/grid/1.webp');
  assert.equal(first.derivatives[1].deliveryUrl, 'https://metadata.supabase.co/storage/v1/object/public/legacy-public/thumb/1.webp');
  assert.equal(first.derivatives[2].deliveryUrl, null, 'A different bucket cannot borrow the configured CDN.');
  assert.equal(first.derivatives[3].deliveryUrl, 'https://verified.example/recorded.webp');
  assert.equal(second.deliveryUrl, 'https://metadata.supabase.co/storage/v1/object/public/legacy-public/originals/card%202.webp');
  assert.equal(second.derivatives[0].deliveryUrl, 'https://cdn.example/catalogue/migrated/grid.webp');
  assert.deepEqual(page.cards.map((entry) => [entry.cardId, entry.set.setId, entry.defaultVariantId]), [
    [id(1), setId, id(11)], [id(2), setId, id(12)],
  ]);
  assert.deepEqual(parseCursor(page.pagination.nextCursor), { variant_id: id(12) });
  assert.equal(f.requests.length, 1, 'Resolving delivery URLs adds no network request.');
  assert.equal(f.requests[0].p_limit, 2); assert.equal(f.requests[0].p_after_variant_id, null);
  await f.read({ cursor: page.pagination.nextCursor });
  assert.equal(f.requests[1].p_after_variant_id, id(12));
  const unmapped = await fixture([asset(1, { storage_bucket: 'other-bucket', derivative_list: [] })]).read();
  assert.equal(unmapped.cards[0].variants[0].image.deliveryUrl, null);
});

await withEnvironment({}, async () => {
  const page = await fixture([asset(1)]).read();
  assert.equal(page.cards[0].variants[0].image.deliveryUrl, null, 'Unconfigured R2 never invents a public URL.');
  assert.equal(page.cards[0].variants[0].image.derivatives[3].deliveryUrl, 'https://verified.example/recorded.webp');
});
await withEnvironment({ STACKR_ASSET_BASE_URL: env.STACKR_ASSET_BASE_URL }, async () => {
  const page = await fixture([asset(1), asset(2, { storage_provider: 'supabase_storage' })]).read();
  assert.equal(page.cards[0].variants[0].image.deliveryUrl, 'https://legacy-proxy.example/originals/card%201.webp');
  assert.equal(page.cards[1].variants[0].image.deliveryUrl, 'https://legacy-proxy.example/originals/card%202.webp');
});
for (const invalid of [
  { STACKR_R2_BUCKET: env.STACKR_R2_BUCKET },
  { STACKR_R2_PUBLIC_BASE_URL: env.STACKR_R2_PUBLIC_BASE_URL },
  { ...env, STACKR_R2_PUBLIC_BASE_URL: 'https://account.r2.cloudflarestorage.com' },
  { ...env, STACKR_R2_PUBLIC_BASE_URL: 'https://cdn.example/?token=private' },
]) {
  await withEnvironment(invalid, async () => {
    const f = fixture([asset(1)]);
    await assert.rejects(f.read(), /STACKR_R2_/);
    assert.equal(f.requests.length, 0, 'Invalid delivery configuration fails before a database read.');
    const facts = await f.read({ includeAssets: false }, { catalogueVersionId: versionId });
    assert.equal(facts.cards.length, 1, 'Facts-only reads remain independent of optional delivery configuration.');
    assert.equal(f.requests.length, 0);
  });
}
await withEnvironment(env, async () => {
  const failure = new Error('fixture set read failed');
  await assert.rejects(fixture([], failure).read(), (error) => error === failure);
});

console.log('Fast set-card R2 delivery passes: mixed providers, bucket isolation, explicit URLs, unchanged identity/cursors, invalid config and facts-only independence (fixtures only).');
