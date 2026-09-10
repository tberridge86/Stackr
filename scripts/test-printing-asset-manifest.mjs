import assert from 'node:assert/strict';
import { ApiError, createCatalogueV1Service, encodeCursor, parseCursor } from '../backend/lib/stackrApiV1.js';

const printingId = '11111111-1111-4111-8111-111111111111';
const catalogueVersionId = '22222222-2222-4222-8222-222222222222';
const row = (n) => ({
  asset_id: `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  asset_row_id: `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  catalogue_version_id: catalogueVersionId, printing_id: printingId,
  asset_type: 'card_image', storage_provider: 'unavailable', permission_status: 'approved',
});
let available = [row(1), row(2), row(3)];
const calls = [];
const assetSupabase = { schema(schema) {
  assert.equal(schema, 'api');
  return {
    from() { assert.fail('A scoped card-image read must not scan the full manifest view.'); },
    async rpc(name, args) {
      assert.equal(name, 'card_image_manifest_for_identities');
      assert.deepEqual(args.p_printing_ids, [printingId]);
      assert.deepEqual(args.p_variant_ids, []);
      assert.ok(args.p_limit >= 1 && args.p_limit <= 1000);
      calls.push(args);
      return { data: available.filter((r) => !args.p_after_asset_id || r.asset_row_id > args.p_after_asset_id)
        .slice(0, args.p_limit), error: null };
    },
  };
} };
const service = createCatalogueV1Service({ supabase: assetSupabase, assetSupabase, assetIdentityRpc: true });
const query = { printingId, assetType: 'card_image', limit: 2 };
const first = await service.assetManifest(query);
assert.equal(first.assets.length, 2);
assert.deepEqual(parseCursor(first.pagination.nextCursor), {
  catalogueVersionId, assetRowId: row(2).asset_row_id,
});
const second = await service.assetManifest({ ...query, cursor: first.pagination.nextCursor });
assert.equal(second.assets.length, 1);
assert.equal(second.assets[0].assetId, row(3).asset_id);
assert.equal(second.pagination.nextCursor, null);
assert.equal(calls[1].p_after_asset_id, row(2).asset_row_id);

available = [];
assert.equal((await service.assetManifest(query)).assets.length, 0,
  'A printing with no artwork returns promptly with an empty page.');
await assert.rejects(() => service.assetManifest({ ...query, cursor: encodeCursor({}) }),
  (e) => e instanceof ApiError && e.code === 'invalid_cursor');

// The public manifest permits 1,000 records, while the bounded RPC caps each
// call at 1,000. Look ahead without exceeding that cap or losing a record.
available = Array.from({ length: 1001 }, (_, index) => row(index + 1));
calls.length = 0;
const large = await service.assetManifest({ ...query, limit: 1000 });
assert.equal(large.assets.length, 1000);
assert.deepEqual(calls.map((call) => call.p_limit), [1000, 1]);
const final = await service.assetManifest({ ...query, limit: 1000, cursor: large.pagination.nextCursor });
assert.equal(final.assets.length, 1);
assert.equal(final.assets[0].assetId, row(1001).asset_id);
assert.equal(final.pagination.nextCursor, null);
console.log('Printing image manifests use bounded reads, preserve cursors, and handle empty and maximum-size pages.');
