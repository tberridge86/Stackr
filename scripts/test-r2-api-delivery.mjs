import assert from 'node:assert/strict';
import { createCatalogueV1Service, toCatalogueAsset } from '../backend/lib/stackrApiV1.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cardRow = {
  printing_id: id(1), variant_id: id(2), catalogue_version_id: id(3),
  canonical_key: 'pokemon:en:fixture:001:normal', game_code: 'pokemon',
  language_code: 'en', set_id: id(4), set_code: 'fixture',
  card_native_name: 'Celebi', card_english_display_name: 'Celebi',
  collector_number: '001', variant_code: 'normal', finish_code: 'normal',
};
const original = {
  asset_id: id(5), asset_row_id: id(5), catalogue_version_id: id(3),
  asset_type: 'card_image', game_code: 'pokemon', set_id: id(4),
  printing_id: id(1), variant_id: id(2), storage_provider: 's3_compatible',
  storage_bucket: 'stackr-public', storage_key: 'originals/card front.webp',
  permission_status: 'approved', source_attribution: 'Verified fixture',
  derivative_list: [
    { role: 'card-grid', storageKey: 'grid/card.webp' },
    { role: 'card-detail', storageProvider: 'supabase_storage', storageBucket: 'legacy-public', storageKey: 'detail/card.webp' },
    { role: 'other-bucket', storageBucket: 'private-captures', storageKey: 'never-public.webp' },
    { role: 'published', storageBucket: 'other-public', storageKey: 'published.webp', deliveryUrl: 'https://verified.example/published.webp' },
  ],
};
let assetRow = original;
const db = { schema(schema) {
  assert.equal(schema, 'api');
  return {
    from(table) {
      assert.equal(table, 'catalogue_cards');
      return {
        select() { return this; }, eq() { return this; }, limit() { return this; },
        then(resolve, reject) { return Promise.resolve({ data: [cardRow], error: null }).then(resolve, reject); },
      };
    },
    rpc(name, args) {
      assert.equal(name, 'card_image_manifest_for_identities');
      assert.ok([...args.p_variant_ids, ...args.p_printing_ids].every((value) => [id(1), id(2)].includes(value)));
      return {
        abortSignal() { return this; },
        then(resolve, reject) { return Promise.resolve({ data: [assetRow], error: null }).then(resolve, reject); },
      };
    },
  };
} };
const env = {
  STACKR_R2_BUCKET: 'stackr-public', STACKR_R2_PUBLIC_BASE_URL: 'https://cdn.example/catalogue/',
  STACKR_ASSET_BASE_URL: 'https://legacy-proxy.example', SUPABASE_URL: 'https://project.supabase.co',
};
const service = (configuration = env) => createCatalogueV1Service({ supabase: db, assetSupabase: db, assetIdentityRpc: true, env: configuration });
const query = { printingId: id(1), assetType: 'card_image', limit: 20 };

const api = service();
const manifest = (await api.assetManifest(query)).assets[0];
assert.equal(manifest.deliveryUrl, 'https://cdn.example/catalogue/originals/card%20front.webp');
assert.equal(manifest.derivatives[0].deliveryUrl, 'https://cdn.example/catalogue/grid/card.webp');
assert.equal(manifest.derivatives[1].deliveryUrl, 'https://project.supabase.co/storage/v1/object/public/legacy-public/detail/card.webp');
assert.equal(manifest.derivatives[2].deliveryUrl, null, 'A different bucket is never mapped onto the R2 CDN.');
assert.equal(manifest.derivatives[3].deliveryUrl, 'https://verified.example/published.webp', 'Recorded derivative publication evidence is preserved.');
const detail = (await api.card(id(1))).card;
assert.equal(detail.defaultVariantId, id(2));
assert.equal(detail.variants[0].image.deliveryUrl, manifest.deliveryUrl, 'The actual card-detail projection uses the configured R2 reader too.');

assetRow = { ...original, storage_provider: 'supabase_storage', storage_bucket: 'legacy-public', derivative_list: [
  { role: 'card-grid', storageProvider: 's3_compatible', storageBucket: 'stackr-public', storageKey: 'migrated/grid.webp' },
] };
const legacy = (await api.assetManifest(query)).assets[0];
assert.equal(legacy.deliveryUrl, 'https://project.supabase.co/storage/v1/object/public/legacy-public/originals/card%20front.webp');
assert.equal(legacy.derivatives[0].deliveryUrl, 'https://cdn.example/catalogue/migrated/grid.webp');

assetRow = { ...original, storage_bucket: 'unknown-public', derivative_list: [] };
assert.equal((await api.assetManifest(query)).assets[0].deliveryUrl, null);
assert.equal((await api.card(id(1))).card.variants[0].image.deliveryUrl, null);
assetRow = { ...original, derivative_list: [] };
assert.equal((await service({}).assetManifest(query)).assets[0].deliveryUrl, null,
  'An unconfigured S3/R2 bucket has no inferred CDN URL.');
assert.equal((await service({ STACKR_ASSET_BASE_URL: env.STACKR_ASSET_BASE_URL }).assetManifest(query)).assets[0].deliveryUrl,
  'https://legacy-proxy.example/originals/card%20front.webp', 'An explicit legacy S3-compatible proxy retains its approved routing without R2 configuration.');
assetRow = { ...assetRow, storage_provider: 'supabase_storage', storage_bucket: 'legacy-public' };
assert.equal((await service({ STACKR_ASSET_BASE_URL: env.STACKR_ASSET_BASE_URL }).assetManifest(query)).assets[0].deliveryUrl,
  'https://legacy-proxy.example/originals/card%20front.webp', 'Explicit legacy Supabase proxy behavior survives without R2 configuration.');
assert.equal(toCatalogueAsset({ ...original, storage_provider: 'unknown', derivative_list: [] }, {}).deliveryUrl, null);
assert.equal(toCatalogueAsset({ ...original, storage_provider: 'unavailable', derivative_list: [] }, {}).deliveryUrl, null);
for (const invalid of [
  { STACKR_R2_BUCKET: 'stackr-public' },
  { STACKR_R2_PUBLIC_BASE_URL: env.STACKR_R2_PUBLIC_BASE_URL },
  { ...env, STACKR_R2_PUBLIC_BASE_URL: 'https://account.r2.cloudflarestorage.com' },
  { ...env, STACKR_R2_PUBLIC_BASE_URL: 'https://cdn.example/?token=private' },
]) assert.throws(() => service(invalid), /STACKR_R2_/);

console.log('V1 card and manifest responses preserve provider/bucket identity, mixed R2/Supabase derivatives, explicit URLs and missing-configuration states.');
