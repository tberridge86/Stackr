import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  planCatalogueAssetMigration, migrateCatalogueAssets, createCatalogueMigrationRollback,
} from './lib/r2-catalogue-migration.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const body = Buffer.from('unchanged original bytes');
const grid = Buffer.from('unchanged grid bytes');
const base = 'https://cdn.example.com/assets';
const sourceBucket = 'stackr-catalogue-public';
const destinationBucket = 'stackr-catalogue-r2';
const asset = {
  id: 'asset-row-1', asset_id: 'stable-asset-1', asset_type: 'card_image',
  source_id: 'approved-source', variant_id: 'stable-variant',
  original_source_url: 'https://upstream.example.com/art.png', source_attribution: 'Original source',
  rights_status: 'approved', permission_status: 'approved', asset_visibility: 'public_catalogue',
  publicly_servable: true, retention_status: 'active', deleted_at: null, deprecated_at: null,
  updated_at: '2026-10-23T01:00:00Z', storage_provider: 'supabase_storage',
  storage_bucket: sourceBucket, storage_key: 'old/original.png', storage_path: 'old/original.png',
  archival_storage_key: 'old/original.png', url: 'https://old.example.com/original.png',
  mime_type: 'image/png', byte_size: body.length, sha256: sha(body), content_sha256: sha(body),
  derivative_list: [{ role: 'card-grid', storageProvider: 'supabase_storage', storageBucket: sourceBucket,
    storageKey: 'old/grid.webp', storage_key: 'old/grid.webp', mimeType: 'image/webp', width: 240, height: 336,
    byteSize: grid.length, contentSha256: sha(grid), url: 'https://old.example.com/grid.webp',
    delivery_url: 'https://old.example.com/grid.webp' }],
};
const configuration = { sourceBucket, destinationBucket, publicBaseUrl: base };

function fixture(overrides = {}) {
  const events = [];
  const objects = new Map();
  const sources = new Map([['old/original.png', body], ['old/grid.webp', grid]]);
  const input = {
    ...configuration, assets: [structuredClone(asset)], execute: true,
    sourceStorage: { async getObject(bucket, key, options) {
      events.push({ kind: 'source', bucket, key, options });
      assert.equal(bucket, sourceBucket);
      return sources.get(key);
    } },
    destinationStorage: {
      id: 's3_compatible', catalogueStorage: true, catalogueBucket: destinationBucket,
      publicUrl: (bucket, key) => bucket === destinationBucket ? `${base}/${key}` : null,
      async putObject(inputObject) {
        events.push({ kind: 'put', key: inputObject.key });
        assert.equal(inputObject.upsert, false);
        assert.equal(inputObject.bucket, destinationBucket);
        if (objects.has(inputObject.key)) throw Object.assign(new Error('exists'), { status: 412 });
        objects.set(inputObject.key, { body: Buffer.from(inputObject.body), mimeType: inputObject.contentType });
      },
      async getObject(bucket, key, options) {
        events.push({ kind: 'destination_get', key, options });
        assert.equal(bucket, destinationBucket);
        return objects.get(key)?.body;
      },
    },
    async fetchImpl(url, options) {
      events.push({ kind: 'cdn', url });
      assert.equal(options.redirect, 'error');
      const value = objects.get(url.slice(base.length + 1));
      return new Response(value.body, { headers: { 'content-type': value.mimeType, 'content-length': String(value.body.length) } });
    },
    async journal(record) { events.push({ kind: 'journal', record: structuredClone(record) }); },
    async publish(plan) {
      events.push({ kind: 'publish', plan: structuredClone(plan) });
      return { applied: true, updatedAt: '2026-10-23T02:00:00Z' };
    },
    ...overrides,
  };
  return { input, events, objects, sources };
}
function noPublication(f) { assert.equal(f.events.filter((event) => event.kind === 'publish').length, 0); }
function failed(result, code) {
  assert.equal(result.status, 'stopped');
  assert.equal(result.results[0].code, code);
}

// Default and explicit dry runs are metadata-only: no source reads, writes or journal callbacks.
for (const execute of [undefined, false, 'true']) {
  const f = fixture({ execute });
  const result = await migrateCatalogueAssets(f.input);
  assert.equal(result.status, 'inventory');
  assert.equal(result.results[0].plan.objects.length, 2);
  assert.equal(f.events.length, 0);
}

for (const invalid of [
  { publicly_servable: false }, { permission_status: 'unknown' }, { rights_status: 'restricted' },
  { asset_visibility: 'private' }, { retention_status: 'temporary' }, { deleted_at: '2026-01-01' },
  { deprecated_at: '2026-01-01' }, { deleted_at: undefined }, { updated_at: null },
  { storage_provider: 'external_reference' }, { storage_bucket: 'private-scans' },
  { storage_key: '../escape.png' }, { archival_storage_key: 'another-original.png' },
]) {
  const f = fixture({ assets: [{ ...asset, ...invalid }] });
  assert.equal((await migrateCatalogueAssets(f.input)).status, 'stopped');
  assert.equal(f.events.length, 0);
}
for (const url of ['http://cdn.example.com', 'https://user:secret@cdn.example.com',
  'https://cdn.example.com?a=1', 'https://cdn.example.com#x', 'https://127.0.0.1',
  'https://[::1]', 'https://private.internal', 'https://localhost', 'https://x.supabase.co',
  'https://account.r2.cloudflarestorage.com']) {
  const f = fixture({ publicBaseUrl: url });
  await assert.rejects(() => migrateCatalogueAssets(f.input), /unsafe_public_base_url/);
  assert.equal(f.events.length, 0);
}

const successful = fixture();
const success = await migrateCatalogueAssets(successful.input);
assert.equal(success.status, 'complete');
assert.equal(success.processedBytes, body.length + grid.length);
const receipt = success.results[0].receipt;
assert.equal(receipt.patch.url, `${base}/${receipt.patch.storage_key}`);
assert.match(receipt.patch.storage_key, /asset-row-1/);
assert.ok(receipt.patch.storage_key.includes(sha(asset.asset_id)));
assert.match(receipt.patch.storage_key, new RegExp(sha(body)));
assert.deepEqual([...successful.objects.values()].map((object) => object.body), [body, grid]);
assert.equal(receipt.patch.derivative_list[0].width, 240);
assert.equal(receipt.patch.derivative_list[0].storage_key, receipt.patch.derivative_list[0].storageKey);
assert.equal(receipt.patch.derivative_list[0].delivery_url, receipt.patch.derivative_list[0].url);
assert.equal(receipt.patch.derivative_list[0].deliveryUrl, receipt.patch.derivative_list[0].url);
for (const field of ['id', 'asset_id', 'variant_id', 'source_id', 'original_source_url', 'source_attribution', 'rights_status']) {
  assert.equal(Object.hasOwn(receipt.patch, field), false, `${field} must remain unchanged`);
}
const publicationIndex = successful.events.findIndex((event) => event.kind === 'publish');
assert.equal(successful.events[publicationIndex - 1].record.event, 'publication_pending');
assert.equal(successful.events.slice(0, publicationIndex).filter((event) => event.kind === 'cdn').length, 2);
assert.equal(successful.events.slice(0, publicationIndex).filter((event) => event.kind === 'destination_get').length, 2);
const rollback = createCatalogueMigrationRollback(receipt);
assert.equal(rollback.guard.updated_at, '2026-10-23T02:00:00Z');
assert.equal(rollback.guard.storage_key, receipt.patch.storage_key);
assert.equal(rollback.patch.storage_key, asset.storage_key);
assert.deepEqual(rollback.patch.derivative_list, asset.derivative_list);
assert.equal(rollback.patch.cache_control, null, 'rollback restores previously absent fields to null');
assert.throws(() => createCatalogueMigrationRollback({ ...receipt, status: 'failed' }), /invalid_rollback_receipt/);
for (const field of ['id', 'asset_id', 'rights_status', 'source_id', 'deleted_at']) {
  assert.throws(() => createCatalogueMigrationRollback({ ...receipt, before: { ...receipt.before, [field]: 'changed' } }), /rollback_contains_non_pointer_fields/);
  assert.throws(() => createCatalogueMigrationRollback({ ...receipt, patch: { ...receipt.patch, [field]: 'changed' } }), /rollback_contains_non_pointer_fields/);
}
for (const invalid of [{ rowId: 'another-row' }, { assetId: 'another-identity' },
  { updatedAt: 'not-a-date' }, { operationId: 'tampered' },
  { before: { ...receipt.before, storage_key: 'unrelated/object.png' } }]) {
  assert.throws(() => createCatalogueMigrationRollback({ ...receipt, ...invalid }));
}

const recoveredAssetId = 'artwork-recovered-20260928:fc07b852-1c0c-46e5-8653-1501809f5f8b:47d3c0dded1f7350dba40ca8f686a96c2278800a4c5fb8772cbdcefb90aecfe8';
for (const assetId of [recoveredAssetId, 'ポケモン:カード/artwork#01']) {
  const f = fixture({ assets: [{ ...asset, id: '0000693d-698d-4600-91d9-9b494e07f27a', asset_id: assetId }] });
  const result = await migrateCatalogueAssets(f.input);
  assert.equal(result.status, 'complete');
  const migrated = result.results[0].receipt;
  assert.equal(migrated.assetId, assetId);
  assert.equal(migrated.guard.asset_id, assetId);
  assert.equal(Object.hasOwn(migrated.patch, 'asset_id'), false);
  assert.ok(migrated.patch.storage_key.includes(sha(assetId)));
  assert.equal(migrated.patch.storage_key.includes(assetId), false);
  assert.equal(createCatalogueMigrationRollback(migrated).assetId, assetId);
}
for (const assetId of ['', 'bad\nidentity', 'x'.repeat(4097)]) {
  assert.throws(() => planCatalogueAssetMigration({ ...asset, asset_id: assetId }, configuration), /missing_asset_identity/);
}
const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <path fill="#f00" d="M0 0h24v24H0z"/>\n</svg>\n');
const svgAsset = { ...asset, asset_type: 'set_logo', mime_type: 'image/svg+xml', byte_size: svgBytes.length,
  content_sha256: sha(svgBytes), sha256: sha(svgBytes), derivative_list: [] };
const svg = fixture({ assets: [svgAsset] });
svg.sources.set(svgAsset.storage_key, svgBytes);
const svgResult = await migrateCatalogueAssets(svg.input);
assert.equal(svgResult.status, 'complete');
const svgReceipt = svgResult.results[0].receipt;
assert.ok(svgReceipt.patch.storage_key.endsWith('/original.svg'));
assert.equal(svgReceipt.patch.content_sha256, sha(svgBytes));
assert.deepEqual(svg.objects.get(svgReceipt.patch.storage_key).body, svgBytes,
  'approved public SVG must retain exact bytes without parsing or rewriting');
assert.equal(svg.events.filter((event) => event.kind === 'destination_get').length, 1);
assert.equal(svg.events.filter((event) => event.kind === 'cdn').length, 1);
const svgWrongMime = fixture({ assets: [svgAsset], fetchImpl: async () => new Response(svgBytes,
  { headers: { 'content-type': 'text/html' } }) });
svgWrongMime.sources.set(svgAsset.storage_key, svgBytes);
failed(await migrateCatalogueAssets(svgWrongMime.input), 'cdn_mime_mismatch');
noPublication(svgWrongMime);
for (const invalid of [{ permission_status: 'unknown' }, { asset_visibility: 'private' }]) {
  const f = fixture({ assets: [{ ...svgAsset, ...invalid }] });
  failed(await migrateCatalogueAssets(f.input), 'asset_not_public_approved_active');
  assert.equal(f.events.length, 0);
}
const unknownMime = fixture({ assets: [{ ...asset, mime_type: 'application/octet-stream' }] });
failed(await migrateCatalogueAssets(unknownMime.input), 'unsupported_mime_type');
assert.equal(unknownMime.events.length, 0);

for (const mutate of [
  (f) => { f.sources.set(asset.storage_key, Buffer.from('wrong')); },
  (f) => { f.sources.set(asset.storage_key, Buffer.alloc(body.length, 0)); },
]) {
  const f = fixture(); mutate(f);
  assert.equal((await migrateCatalogueAssets(f.input)).status, 'stopped');
  assert.equal(f.objects.size, 0); noPublication(f);
}
const badFreshRead = fixture();
badFreshRead.input.destinationStorage.getObject = async () => Buffer.alloc(body.length, 0);
failed(await migrateCatalogueAssets(badFreshRead.input), 'object_hash_mismatch');
noPublication(badFreshRead);

const conflict = fixture();
const successfulKey = receipt.patch.storage_key;
conflict.objects.set(successfulKey, { body: Buffer.alloc(body.length, 0), mimeType: 'image/png' });
failed(await migrateCatalogueAssets(conflict.input), 'object_hash_mismatch');
assert.deepEqual(conflict.objects.get(successfulKey).body, Buffer.alloc(body.length, 0), 'conflicting object must never be overwritten');
noPublication(conflict);

for (const makeResponse of [
  () => new Response(Buffer.alloc(body.length, 0), { headers: { 'content-type': 'image/png' } }),
  () => new Response(body, { headers: { 'content-type': 'text/html' } }),
  () => new Response(body, { status: 404 }),
  () => new Response(Buffer.alloc(body.length + 1), { headers: { 'content-type': 'image/png' } }),
  () => ({ ok: true, redirected: true }),
]) {
  const f = fixture({ fetchImpl: async () => makeResponse() });
  assert.equal((await migrateCatalogueAssets(f.input)).status, 'stopped');
  noPublication(f);
}
const unsafeAdapter = fixture();
unsafeAdapter.input.destinationStorage.publicUrl = () => 'https://attacker.example.com/image.png';
failed(await migrateCatalogueAssets(unsafeAdapter.input), 'unexpected_public_object_url');
assert.equal(unsafeAdapter.objects.size, 0);

const partial = fixture();
const realPut = partial.input.destinationStorage.putObject;
partial.input.destinationStorage.putObject = async (input) => {
  if (input.key.endsWith('card-grid.webp')) throw new Error('temporary failure');
  return realPut(input);
};
partial.input.assets.push({ ...asset, id: 'asset-row-2', asset_id: 'stable-asset-2' });
const stopped = await migrateCatalogueAssets(partial.input);
assert.equal(stopped.remaining, 1);
assert.equal(partial.objects.size, 1);
noPublication(partial);
partial.input.destinationStorage.putObject = realPut;
partial.input.assets = [asset];
const resumed = await migrateCatalogueAssets(partial.input);
assert.equal(resumed.status, 'complete');
assert.equal(resumed.results[0].receipt.objects[0].reused, true);
assert.equal(partial.objects.size, 2, 'retry reuses verified content-addressed object');

const cancelled = fixture();
const controller = new AbortController();
cancelled.input.signal = controller.signal;
cancelled.input.readSource = async () => { controller.abort(); return body; };
assert.equal((await migrateCatalogueAssets(cancelled.input)).status, 'stopped');
assert.equal(cancelled.objects.size, 0); noPublication(cancelled);
const alreadyCancelled = fixture({ signal: AbortSignal.abort() });
failed(await migrateCatalogueAssets(alreadyCancelled.input), 'cancelled');
assert.equal(alreadyCancelled.events.length, 0);
const cancelBeforePublish = fixture();
const publishController = new AbortController();
cancelBeforePublish.input.signal = publishController.signal;
cancelBeforePublish.input.journal = async (record) => { if (record.event === 'publication_pending') publishController.abort(); };
failed(await migrateCatalogueAssets(cancelBeforePublish.input), 'cancelled');
noPublication(cancelBeforePublish);

const timeout = fixture({ objectTimeoutMs: 5, readSource: async () => new Promise(() => {}) });
failed(await migrateCatalogueAssets(timeout.input), 'cancelled_or_deadline');
assert.equal(timeout.objects.size, 0); noPublication(timeout);
const latePut = fixture({ objectTimeoutMs: 5 });
latePut.input.destinationStorage.putObject = async () => new Promise(() => {});
failed(await migrateCatalogueAssets(latePut.input), 'cancelled_or_deadline');
noPublication(latePut);
const stalledCdn = fixture({ objectTimeoutMs: 5, fetchImpl: async () => new Response(new ReadableStream({
  pull: () => new Promise(() => {}),
}), { headers: { 'content-type': 'image/png' } }) });
failed(await migrateCatalogueAssets(stalledCdn.input), 'cancelled_or_deadline');
noPublication(stalledCdn);

const budget = fixture({ maxBatchBytes: body.length });
failed(await migrateCatalogueAssets(budget.input), 'batch_byte_limit_exceeded');
assert.equal(budget.events.length, 0);
const unknownSize = fixture({ assets: [{ ...asset, byte_size: null, derivative_list: [] }], maxObjectBytes: body.length - 1 });
failed(await migrateCatalogueAssets(unknownSize.input), 'object_byte_limit_exceeded');
assert.equal(unknownSize.objects.size, 0);
const unknownBatchSize = fixture({ maxBatchBytes: body.length + grid.length - 1,
  assets: [{ ...asset, byte_size: null, derivative_list: [{ ...asset.derivative_list[0], byteSize: null }] }] });
failed(await migrateCatalogueAssets(unknownBatchSize.input), 'object_byte_limit_exceeded');
assert.equal(unknownBatchSize.objects.size, 1);
noPublication(unknownBatchSize);

const journalFailure = fixture({ journal: async () => { throw new Error('journal unavailable'); } });
failed(await migrateCatalogueAssets(journalFailure.input), 'operation_failed');
assert.equal(journalFailure.objects.size, 0); noPublication(journalFailure);
const beforePublicationFailure = fixture({ journal: async (record) => {
  if (record.event === 'publication_pending') throw new Error('durability failure');
} });
assert.equal((await migrateCatalogueAssets(beforePublicationFailure.input)).status, 'stopped');
noPublication(beforePublicationFailure);

const casConflict = fixture({ publish: async () => ({ applied: false }) });
const casResult = await migrateCatalogueAssets(casConflict.input);
failed(casResult, 'publication_conflict');
assert.equal(casResult.results[0].status, 'failed');
for (const publish of [async () => { throw new Error('connection lost'); }, async () => ({ applied: true })]) {
  const f = fixture({ publish });
  assert.equal((await migrateCatalogueAssets(f.input)).results[0].status, 'publication_requires_reconciliation');
}
const completionFailure = fixture({ journal: async (record) => {
  if (record.event === 'publication_complete') throw new Error('journal lost');
} });
const reconciliation = await migrateCatalogueAssets(completionFailure.input);
assert.equal(reconciliation.results[0].status, 'publication_requires_reconciliation');
assert.equal(reconciliation.results[0].updatedAt, '2026-10-23T02:00:00Z');

const duplicateIdentity = fixture({ assets: [asset, { ...asset, id: 'asset-row-2', asset_id: 'stable-asset-2' }] });
assert.equal((await migrateCatalogueAssets(duplicateIdentity.input)).status, 'complete');
assert.equal(duplicateIdentity.objects.size, 4, 'identical bytes never merge distinct asset identities');
assert.throws(() => planCatalogueAssetMigration({ ...asset, derivative_list: [asset.derivative_list[0], asset.derivative_list[0]] }, configuration), /duplicate_object_role/);
await assert.rejects(() => migrateCatalogueAssets({ ...configuration, assets: Array(51).fill(asset) }), /batch_asset_limit_exceeded/);

console.log('R2 migration core: metadata-only inventory, eligibility, exact-byte copy, CDN verification, immutable conflicts, bounded failure/cancellation, resumable copy, CAS and rollback contracts passed.');
