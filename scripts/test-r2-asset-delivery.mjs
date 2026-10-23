import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  assertCatalogueWriteStorage,
  createCatalogueObjectStorageAdapter,
  createPublicAssetStorageReaders,
  IMMUTABLE_CACHE_CONTROL,
  SupabaseObjectStorageAdapter,
} from '../backend/lib/objectStorage.js';
import {
  buildApprovedCatalogueAsset,
  buildCatalogueAssetRepairFromStoredOriginal,
} from '../backend/lib/assetPipeline.js';
import { listPublicAssetManifest, publicAssetManifestPage } from '../backend/lib/assetRepository.js';
import assetRoutes from '../backend/routes/assets.js';

const sharp = createRequire(new URL('../backend/package.json', import.meta.url))('sharp');
const config = {
  STACKR_CATALOGUE_STORAGE_PROVIDER: 'r2',
  STACKR_R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  STACKR_R2_BUCKET: 'stackr-catalogue-public',
  STACKR_R2_ACCESS_KEY_ID: 'fixture-access-key',
  STACKR_R2_SECRET_ACCESS_KEY: 'fixture-secret-key',
  STACKR_R2_PUBLIC_BASE_URL: 'https://catalogue.example.invalid',
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function withFetch(fetchImpl, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { return await run(); } finally { globalThis.fetch = previous; }
}

async function withEnvironment(values, run) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try { return await run(); } finally {
    for (const [key, value] of previous) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function fakeSupabase(rows) {
  const state = { ranges: [], orders: [] };
  const query = {
    select() { return this; },
    order(column, options) { state.orders.push([column, options]); return this; },
    range(start, end) { state.ranges.push([start, end]); return this; },
    eq() { return this; },
    gte() { return this; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return {
    state,
    schema() { return { from() { return query; } }; },
    storage: {
      from(bucket) {
        return { getPublicUrl(key) { return { data: { publicUrl: `https://legacy.example.invalid/${bucket}/${key}` } }; } };
      },
    },
  };
}

const rows = [{
  asset_id: 'legacy-card',
  storage_provider: 'supabase_storage',
  storage_bucket: 'stackr-catalogue-public',
  storage_key: 'public/legacy/original.jpg',
  external_url: 'https://provider.example.invalid/legacy.jpg',
  derivative_list: [{
    role: 'card-grid', storageProvider: 'supabase_storage',
    storageBucket: 'stackr-catalogue-public', storageKey: 'public/legacy/card-grid.webp',
  }, {
    role: 'search-result', storageProvider: 's3_compatible',
    storageBucket: 'stackr-catalogue-public', storageKey: 'public/migrated/search-result.webp',
  }],
}, {
  asset_id: 'migrated-card',
  storage_provider: 's3_compatible',
  storage_bucket: 'stackr-catalogue-public',
  storage_key: 'public/migrated/original.webp',
  derivative_list: [],
}, {
  asset_id: 'other-s3-bucket',
  storage_provider: 's3_compatible',
  storage_bucket: 'unmapped-old-bucket',
  storage_key: 'must-not-be-invented.jpg',
  derivative_list: [],
}, {
  asset_id: 'external-approved', storage_provider: 'external_reference',
  external_url: 'https://provider.example.invalid/approved.jpg', derivative_list: [],
}, {
  asset_id: 'external-controlled', storage_provider: 'external_reference',
  external_url: 'https://assets.tcgdex.net/ja/sv/sv2a/001/low.webp', derivative_list: [],
}];

async function assertProviderAwareManifest() {
  const supabase = fakeSupabase(rows);
  const readers = createPublicAssetStorageReaders(supabase, config);
  const manifest = await listPublicAssetManifest(supabase, { limit: 1000 }, readers);
  assert.deepEqual(supabase.state.ranges, [[0, 49]], 'public requests must be capped at 50 before database retrieval');
  assert.deepEqual(supabase.state.orders.map(([column]) => column), ['updated_at', 'asset_id', 'catalogue_version_id', 'asset_row_id']);
  assert.ok(supabase.state.orders.every(([, options]) => options.ascending === false));
  assert.equal(manifest[0].delivery_url, 'https://legacy.example.invalid/stackr-catalogue-public/public/legacy/original.jpg');
  assert.equal(manifest[0].derivative_list[0].deliveryUrl, 'https://legacy.example.invalid/stackr-catalogue-public/public/legacy/card-grid.webp');
  assert.equal(manifest[0].derivative_list[1].deliveryUrl, 'https://catalogue.example.invalid/public/migrated/search-result.webp');
  assert.equal(manifest[1].delivery_url, 'https://catalogue.example.invalid/public/migrated/original.webp');
  assert.equal(manifest[2].delivery_url, null, 'an unmapped bucket must never borrow the configured CDN');
  assert.equal(manifest[3].delivery_url, rows[3].external_url, 'eligible existing external references retain their source');
  assert.equal(manifest[4].delivery_url, null, 'the public endpoint cannot manufacture a controlled runtime reference');
  assert.equal(manifest[4].external_url, null);

  const mismatched = await listPublicAssetManifest(fakeSupabase(rows), {}, readers.s3_compatible);
  assert.equal(mismatched[0].delivery_url, null, 'a single R2 adapter must never rewrite a Supabase original');
  assert.equal(mismatched[0].derivative_list[0].deliveryUrl, null);
  const legacyOnly = await listPublicAssetManifest(supabase, {}, createPublicAssetStorageReaders(supabase, {}));
  assert.ok(legacyOnly[0].delivery_url);
  assert.equal(legacyOnly[1].delivery_url, null, 'missing R2 delivery configuration cannot fall back to a source URL');

  await listPublicAssetManifest(supabase, { offset: 50, limit: 20 }, readers);
  assert.deepEqual(supabase.state.ranges.at(-1), [50, 69]);
  for (const requested of [undefined, 'invalid', Infinity, NaN]) {
    assert.equal(publicAssetManifestPage({ limit: requested }).limit, 50);
  }
  assert.equal(publicAssetManifestPage({ limit: 3.8 }).limit, 3);
  assert.equal(publicAssetManifestPage({ limit: -20 }).limit, 1);
  assert.equal(publicAssetManifestPage({ offset: -2 }).offset, 0);
  assert.equal(publicAssetManifestPage({ offset: Infinity }).offset, 0);
  assert.equal(rows[4].external_url, 'https://assets.tcgdex.net/ja/sv/sv2a/001/low.webp', 'public sanitizing must not mutate source metadata');
}

async function assertOriginalAndR2Writes() {
  const storage = createCatalogueObjectStorageAdapter({ env: config });
  const objects = new Map();
  const calls = [];
  const pixels = Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, index) => (index * 37 + Math.floor(index / 7)) % 256));
  const jpeg = await sharp(pixels, { raw: { width: 64, height: 64, channels: 3 } })
    .jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
  await withFetch(async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    assert.equal(url.hostname, `${config.STACKR_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
    assert.ok(url.pathname.startsWith(`/${config.STACKR_R2_BUCKET}/`));
    const key = decodeURIComponent(url.pathname.slice(config.STACKR_R2_BUCKET.length + 2));
    if (options.method !== 'PUT') {
      return objects.has(key) ? new Response(objects.get(key)) : new Response(null, { status: 404 });
    }
    calls.push({ url, ...options });
    assert.equal(options.headers['if-none-match'], '*');
    assert.ok(url.searchParams.get('X-Amz-SignedHeaders').includes('if-none-match'));
    assert.equal(options.headers['cache-control'], IMMUTABLE_CACHE_CONTROL);
    assert.ok(options.signal instanceof AbortSignal, 'R2 uploads need a bounded deadline');
    if (objects.has(key)) return new Response(null, { status: 412 });
    objects.set(key, Buffer.from(options.body));
    return new Response(null, { status: 200 });
  }, async () => {
    const input = { storage, assetType: 'card_image', permissionStatus: 'approved', buffer: jpeg, mimeType: 'image/jpeg' };
    const asset = await buildApprovedCatalogueAsset(input);
    assert.equal(asset.storage_provider, 's3_compatible');
    assert.equal(asset.storage_bucket, config.STACKR_R2_BUCKET);
    assert.equal(asset.content_sha256, hash(jpeg));
    assert.equal(asset.byte_size, jpeg.length);
    assert.deepEqual(objects.get(asset.storage_key), jpeg, 'the immutable full-detail original must retain every source byte');
    assert.equal(asset.archival_storage_key, asset.storage_key);
    assert.equal(calls.length, 4, 'one original plus three derivatives should be written');
    for (const derivative of asset.derivative_list) {
      assert.equal(derivative.storageProvider, 's3_compatible');
      assert.equal(derivative.storageBucket, config.STACKR_R2_BUCKET);
      assert.equal(hash(objects.get(derivative.storageKey)), derivative.contentSha256);
    }
    assert.deepEqual(await storage.getObject(asset.storage_bucket, asset.storage_key), jpeg);
    await assert.rejects(() => storage.getObject(asset.storage_bucket, asset.storage_key, { maxBytes: 4 }), /exceeds 4 bytes/);
    const duplicate = await buildApprovedCatalogueAsset(input);
    assert.equal(duplicate.storage_key, asset.storage_key, 'atomic 412 duplicate responses must retain the original object');
    assert.equal(objects.size, 4);

    const differentOriginal = Buffer.from(jpeg);
    differentOriginal[0] ^= 0xff;
    objects.set(asset.storage_key, differentOriginal);
    try {
      await assert.rejects(() => buildApprovedCatalogueAsset(input), /different bytes/,
        'An existing content-addressed key with same-length different bytes must block publication.');
      assert.deepEqual(objects.get(asset.storage_key), differentOriginal, 'The conflicting immutable object is never overwritten.');
    } finally {
      objects.set(asset.storage_key, Buffer.from(jpeg));
    }

    const beforeKeys = [...objects.keys()];
    const repair = await buildCatalogueAssetRepairFromStoredOriginal({
      ...input, rightsStatus: 'approved', derivativeRoles: ['card-grid'],
    });
    assert.equal(repair.content_sha256, hash(jpeg));
    assert.equal(repair.derivative_list.length, 1);
    assert.deepEqual([...objects.keys()], beforeKeys, 'stored-original derivative repair must not rewrite the original');

    const oriented = await sharp({ create: { width: 6, height: 10, channels: 3, background: 'red' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const orientedAsset = await buildApprovedCatalogueAsset({ ...input, buffer: oriented });
    assert.deepEqual(objects.get(orientedAsset.storage_key), oriented, 'EXIF orientation must remain in the original source');
    assert.equal(orientedAsset.width, 10);
    assert.equal(orientedAsset.height, 6);
    assert.equal(orientedAsset.derivative_list[0].width, 10, 'display derivatives must retain correct orientation');
    assert.equal(orientedAsset.derivative_list[0].height, 6);

    const beforeCalls = calls.length;
    await assert.rejects(() => storage.putObject({ bucket: 'private-scans', key: 'private.jpg', body: jpeg }), /configured R2 bucket/);
    await assert.rejects(() => storage.putObject({ bucket: config.STACKR_R2_BUCKET, key: 'original.jpg', body: jpeg, upsert: true }), /immutable/);
    assert.equal(calls.length, beforeCalls);
  });
}

async function assertConfigurationAndRightsFailClosed() {
  assert.throws(() => createCatalogueObjectStorageAdapter({ env: {} }), /STACKR_R2_BUCKET/);
  for (const key of ['STACKR_R2_BUCKET', 'STACKR_R2_ACCESS_KEY_ID', 'STACKR_R2_SECRET_ACCESS_KEY', 'STACKR_R2_PUBLIC_BASE_URL']) {
    assert.throws(() => createCatalogueObjectStorageAdapter({ env: { ...config, [key]: '' } }), /required|requires|must name/);
  }
  assert.throws(() => createCatalogueObjectStorageAdapter({ env: { ...config, STACKR_CATALOGUE_STORAGE_PROVIDER: 'supabase_storage' } }), /must use R2/);
  assert.throws(() => createCatalogueObjectStorageAdapter({ env: { ...config, STACKR_R2_PUBLIC_BASE_URL: 'https://api.r2.cloudflarestorage.com' } }), /public HTTPS CDN/);
  assert.throws(() => createCatalogueObjectStorageAdapter({ env: { ...config, STACKR_R2_ENDPOINT: 'https://unrelated.example.invalid' } }), /Cloudflare R2/);
  assert.throws(() => createCatalogueObjectStorageAdapter({ env: { NODE_ENV: 'production', STACKR_CATALOGUE_STORAGE_PROVIDER: 'local_dev' } }), /must use R2/);
  const local = createCatalogueObjectStorageAdapter({ env: { NODE_ENV: 'development', STACKR_CATALOGUE_STORAGE_PROVIDER: 'local_dev' } });
  assert.equal(local.id, 'local_dev');
  assert.throws(() => assertCatalogueWriteStorage(new SupabaseObjectStorageAdapter({})), /metadata-only/);
  await assert.rejects(() => buildApprovedCatalogueAsset({
    assetType: 'card_image', permissionStatus: 'approved', storage: new SupabaseObjectStorageAdapter({}),
  }), /metadata-only/, 'a legacy caller must fail before any upload or metadata publication');
  const denied = await buildApprovedCatalogueAsset({ assetType: 'card_image', permissionStatus: 'approved', rightsStatus: 'denied' });
  assert.equal(denied.storage_provider, 'unavailable');
  assert.equal(denied.rights_status, 'denied');
  assert.equal(denied.publicly_servable, false);
}

async function assertConnectedManifestRoute() {
  const handler = assetRoutes.stack.find((layer) => layer.route?.path === '/manifest')?.route.stack[0].handle;
  assert.equal(typeof handler, 'function');
  const calls = [];
  await withEnvironment({ ...config, SUPABASE_URL: 'https://metadata.example.invalid', SUPABASE_SECRET_KEY: 'fixture-service-key' }, async () => {
    await withFetch(async (rawUrl) => {
      const url = new URL(rawUrl);
      assert.equal(url.hostname, 'metadata.example.invalid', 'the manifest may only query metadata');
      calls.push(url);
      const resultRows = url.searchParams.get('offset') === '100'
        ? Array.from({ length: 50 }, (_, index) => ({ ...rows[1], asset_id: `page-two-${index}` })) : rows;
      return new Response(JSON.stringify(resultRows), { status: 200, headers: { 'content-type': 'application/json' } });
    }, async () => {
      let result;
      let status = 200;
      const response = { status(value) { status = value; return this; }, json(value) { result = value; return this; } };
      await handler({ query: { limit: '1000', offset: '50' } }, response);
      assert.equal(status, 200);
      assert.equal(result.ok, true);
      assert.equal(result.count, rows.length);
      assert.equal(result.assets[0].delivery_url, 'https://metadata.example.invalid/storage/v1/object/public/stackr-catalogue-public/public/legacy/original.jpg');
      assert.equal(result.assets[1].delivery_url, 'https://catalogue.example.invalid/public/migrated/original.webp');
      assert.deepEqual(result.pagination, { limit: 50, offset: 50, nextOffset: null });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].searchParams.get('limit'), '50');
      assert.equal(calls[0].searchParams.get('offset'), '50');
      await handler({ query: { limit: '50', offset: '100' } }, response);
      assert.equal(result.count, 50);
      assert.deepEqual(result.pagination, { limit: 50, offset: 100, nextOffset: 150 });
    });
  });
  for (const file of [
    'mirror-approved-catalogue-assets.mjs', 'complete-japanese-catalogue-images.mjs',
    'import-approved-capture-catalogue-assets.mjs', 'materialize-pokedata-gap-art-20260910.mjs',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /createCatalogueObjectStorageAdapter/, `${file} must select the same R2 writer that constructs its public URLs`);
    assert.doesNotMatch(source, /new SupabaseObjectStorageAdapter/, `${file} must not write public binaries to Supabase`);
  }
}

await assertProviderAwareManifest();
await assertOriginalAndR2Writes();
await assertConfigurationAndRightsFailClosed();
await assertConnectedManifestRoute();
console.log('R2 public asset delivery tests passed (mocked storage and metadata only).');
