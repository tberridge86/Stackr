import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createCatalogueV1Service, parseCursor } from '../backend/lib/stackrApiV1.js';

const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const setId = id(1000);
const versionId = id(1001);
const cards = Array.from({ length: 51 }, (_, index) => ({
  printing_id: id(index + 1), variant_id: id(index + 101), catalogue_version_id: versionId,
  set_id: setId, set_code: 'fixture', language_code: 'en', game_code: 'pokemon',
  card_native_name: `Card ${index + 1}`, card_english_display_name: `Card ${index + 1}`,
  collector_number: String(index + 1), collector_number_sort: index + 1,
  variant_code: 'normal', finish_code: 'normal',
}));
const artwork = cards.slice(0, 50).map((card, index) => ({
  asset_id: id(index + 201), asset_row_id: id(index + 201), catalogue_version_id: versionId,
  asset_type: 'card_image', printing_id: card.printing_id, variant_id: card.variant_id,
  storage_provider: 's3_compatible', storage_bucket: 'catalogue-public',
  storage_key: `originals/card ${index + 1}.webp`, permission_status: 'approved',
  source_attribution: 'Verified integration fixture',
  derivative_list: [{ role: 'search-result', storageProvider: 'supabase_storage',
    storageBucket: 'legacy-public', storageKey: `grid/${index + 1}.webp` }],
}));
const env = { STACKR_R2_BUCKET: 'catalogue-public', STACKR_R2_PUBLIC_BASE_URL: 'https://cdn.example/catalogue',
  SUPABASE_URL: 'https://metadata.supabase.co' };

function fixture({ failure = false } = {}) {
  const reads = [];
  const images = [];
  const client = (origin, fetch) => createClient(origin, 'fixture-public-key', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  });
  const supabase = client('https://facts.example', async (input) => {
    const url = new URL(String(input)); reads.push(url);
    return Response.json(url.pathname.endsWith('/catalogue_sets')
      ? { catalogue_version_id: versionId, language_code: 'en' } : cards);
  });
  const assetSupabase = client('https://images.example', async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/rest/v1/rpc/card_image_manifest_for_identities');
    images.push(JSON.parse(init.body));
    return failure ? Response.json({ code: '57014', message: 'Fixture artwork failure' }, { status: 400 })
      : Response.json(artwork);
  });
  return { reads, images, service: createCatalogueV1Service({ supabase, assetSupabase, assetIdentityRpc: true, env }) };
}

const previousPageLimit = process.env.STACKR_ENFORCE_UI_PAGE_LIMIT;
process.env.STACKR_ENFORCE_UI_PAGE_LIMIT = 'true';
try {
  for (const includeAssets of [false, true]) {
    const f = fixture();
    const result = await f.service.setCards(setId, { language: 'en', limit: 500, includeAssets });
    assert.equal(result.cards.length, 50, 'The fallback retains the architecture response limit');
    assert.equal(new Set(result.cards.map((card) => card.cardId)).size, 50);
    assert.equal(result.pagination.limit, 50);
    assert.equal(parseCursor(result.pagination.nextCursor).variant_id, cards[49].variant_id);
    const query = f.reads.find((url) => url.pathname.endsWith('/catalogue_cards'));
    assert.equal(query.searchParams.get('limit'), '51', 'One lookahead determines continuation');
    assert.equal(query.searchParams.get('catalogue_version_id'), `eq.${versionId}`);
    assert.equal(f.images.length, includeAssets ? 1 : 0, 'Facts-only fallback never reads optional artwork');
    const image = result.cards.find((card) => card.cardId === id(1)).variants[0].image;
    if (!includeAssets) assert.equal(image, null);
    else {
      assert.equal(image.deliveryUrl, 'https://cdn.example/catalogue/originals/card%201.webp');
      assert.equal(image.derivatives[0].deliveryUrl,
        'https://metadata.supabase.co/storage/v1/object/public/legacy-public/grid/1.webp');
    }
  }
  const f = fixture({ failure: true });
  const result = await f.service.setCards(setId, { limit: 500 });
  assert.equal(result.cards.length, 50, 'Optional R2 artwork failure retains the complete bounded facts page');
  assert.ok(result.cards.every((card) => card.variants.every((variant) => variant.image === null)));
  assert.equal(parseCursor(result.pagination.nextCursor).variant_id, cards[49].variant_id);
  console.log('Combined R2 set fallback retains 50-item pages, identity/cursors, facts-only reads, mixed providers and optional-image failure recovery.');
} finally {
  if (previousPageLimit === undefined) delete process.env.STACKR_ENFORCE_UI_PAGE_LIMIT;
  else process.env.STACKR_ENFORCE_UI_PAGE_LIMIT = previousPageLimit;
}
