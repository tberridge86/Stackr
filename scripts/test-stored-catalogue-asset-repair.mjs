import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  APPROVED_REPAIR_LANGUAGE,
  APPROVED_REPAIR_SOURCE,
  assertApprovedCatalogueAssetRepairScope,
  assertStagingCatalogueAssetRepairTarget,
  catalogueAssetRepairReasons,
  countStoredCatalogueAssetRepairCandidates,
  listStoredCatalogueAssetRepairBatch,
  mergeCatalogueDerivativeList,
  missingRequiredCatalogueDerivativeRoles,
  repairStoredCatalogueAsset,
  resolveCatalogueAssetRepairSource,
  STAGING_SUPABASE_URL,
  summariseCatalogueAssetRepairBatch,
} from '../backend/lib/catalogueAssetRepair.js';
import { SupabaseObjectStorageAdapter } from '../backend/lib/objectStorage.js';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWO4o2HzH4QZYAwAT/QI/b1BT1MAAAAASUVORK5CYII=',
  'base64',
);
const repairCli = readFileSync('scripts/repair-stored-catalogue-assets.mjs', 'utf8');
const repairWorkflow = readFileSync('.github/workflows/catalogue-stored-asset-repair.yml', 'utf8');
const platformCi = readFileSync('.github/workflows/platform-ci.yml', 'utf8');

function readyDerivative(role) {
  return {
    role,
    storageProvider: 'supabase_storage',
    storageBucket: 'stackr-catalogue-public',
    storageKey: `public/card_image/aa/bb/${'a'.repeat(64)}/${role}.webp`,
    mimeType: 'image/webp',
    width: 2,
    height: 2,
    byteSize: 24,
    contentSha256: 'a'.repeat(64),
  };
}

function readyAsset(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    asset_id: 'provider-card-1',
    asset_type: 'card_image',
    source_id: '44444444-4444-4444-8444-444444444444',
    variant_id: '22222222-2222-4222-8222-222222222222',
    storage_provider: 'supabase_storage',
    storage_bucket: 'stackr-catalogue-public',
    storage_key: 'legacy/card-1.png',
    rights_status: 'approved',
    permission_status: 'approved',
    asset_visibility: 'public_catalogue',
    publicly_servable: true,
    retention_status: 'active',
    sha256: 'b'.repeat(64),
    content_sha256: 'b'.repeat(64),
    perceptual_hash: 'c'.repeat(16),
    mime_type: 'image/png',
    width: 2,
    height: 2,
    byte_size: tinyPng.length,
    derivative_list: [
      readyDerivative('card-grid'),
      readyDerivative('search-result'),
      readyDerivative('detail-page'),
    ],
    updated_at: '2026-08-31T00:00:00.000Z',
    ...overrides,
  };
}

function fakeUpdateSupabase(result = { data: { id: '11111111-1111-4111-8111-111111111111' }, error: null }) {
  const captured = { patch: null, filters: [] };
  const query = {
    eq(column, value) {
      captured.filters.push(['eq', column, value]);
      return this;
    },
    is(column, value) {
      captured.filters.push(['is', column, value]);
      return this;
    },
    select(columns) {
      captured.select = columns;
      return this;
    },
    async maybeSingle() {
      return result;
    },
  };
  const supabase = {
    schema(schema) {
      assert.equal(schema, 'catalog');
      return {
        from(table) {
          assert.equal(table, 'assets');
          return {
            update(patch) {
              captured.patch = patch;
              return query;
            },
          };
        },
      };
    },
  };
  return { supabase, captured };
}

function assertTargetGuard() {
  assert.doesNotThrow(() => assertStagingCatalogueAssetRepairTarget({
    target: 'staging',
    supabaseUrl: STAGING_SUPABASE_URL,
  }));
  assert.throws(() => assertStagingCatalogueAssetRepairTarget({
    target: 'production',
    supabaseUrl: STAGING_SUPABASE_URL,
  }), /explicit --target=staging/);
  assert.throws(() => assertStagingCatalogueAssetRepairTarget({
    target: 'staging',
    supabaseUrl: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
  }), /refuses production/);
  assert.throws(() => assertStagingCatalogueAssetRepairTarget({
    target: 'staging',
    supabaseUrl: 'https://lmwfhvexfcoyeuoyrlco.supabase.co.evil.invalid',
  }), /restricted to/);
  assert.doesNotThrow(() => assertApprovedCatalogueAssetRepairScope({
    source: APPROVED_REPAIR_SOURCE,
    language: APPROVED_REPAIR_LANGUAGE,
  }));
  assert.throws(() => assertApprovedCatalogueAssetRepairScope({
    source: 'tcgdex',
    language: 'ja',
  }), /restricted to audited scope/);
}

function assertCliIsBoundedAndReadOnlyByDefault() {
  assert.match(repairCli, /const execute = hasFlag\('execute'\)/, 'writes must require an explicit execute flag');
  assert.match(
    repairCli,
    /boundedInteger\(arg\('maxAssets', String\(limit\)\), limit, 1, 2500\)/,
    'one-command processing must retain a hard 2500-asset cap',
  );
  assert.match(
    repairCli,
    /while \(!exhausted && scanned < maxAssets\)[\s\S]+Math\.min\(limit, maxAssets - scanned\)/,
    'multi-page execution must remain bounded by both page and total limits',
  );
  assert.match(
    repairCli,
    /batch\.cursor\.nextAfterId <= nextAfterId[\s\S]+cursor did not advance/,
    'multi-page execution must fail if the deterministic cursor stalls',
  );
  assert.match(
    repairCli,
    /hasFlag\('execute'\) && hasFlag\('count'\)/,
    'exact candidate counts must remain read-only',
  );
  assert.match(
    platformCi,
    /npm run test:asset-pipeline\n\s+- run: npm run test:asset-repair/,
    'platform CI must run the repair safety tests next to the asset pipeline tests',
  );
}

function assertRepairClassificationAndCursor() {
  assert.deepEqual(catalogueAssetRepairReasons(readyAsset()), []);
  const incomplete = readyAsset({
    id: '33333333-3333-4333-8333-333333333333',
    sha256: null,
    content_sha256: null,
    perceptual_hash: null,
    derivative_list: [readyDerivative('card-grid')],
  });
  assert.deepEqual(missingRequiredCatalogueDerivativeRoles(incomplete), ['search-result', 'detail-page']);
  assert.deepEqual(catalogueAssetRepairReasons(incomplete), [
    'missing_content_sha256',
    'missing_sha256',
    'missing_perceptual_hash',
    'missing_derivative:search-result',
    'missing_derivative:detail-page',
  ]);

  const batch = summariseCatalogueAssetRepairBatch([readyAsset(), incomplete], 2);
  assert.equal(batch.candidates.length, 1);
  assert.equal(batch.candidates[0].id, incomplete.id);
  assert.deepEqual(batch.cursor, { nextAfterId: incomplete.id, exhausted: false });
  const finalBatch = summariseCatalogueAssetRepairBatch([incomplete], 2);
  assert.deepEqual(finalBatch.cursor, { nextAfterId: incomplete.id, exhausted: true });

  const merged = mergeCatalogueDerivativeList(
    [readyDerivative('card-grid'), { role: 'legacy-preview', storageKey: 'legacy.webp' }],
    [readyDerivative('search-result'), readyDerivative('detail-page')],
  );
  assert.deepEqual(merged.map((entry) => entry.role), [
    'card-grid',
    'legacy-preview',
    'search-result',
    'detail-page',
  ]);
}

async function assertSupabaseControlledDownload() {
  let downloaded = null;
  const adapter = new SupabaseObjectStorageAdapter({
    storage: {
      from(bucket) {
        return {
          async download(key) {
            downloaded = { bucket, key };
            return { data: new Blob([tinyPng], { type: 'image/png' }), error: null };
          },
        };
      },
    },
  });
  assert.deepEqual(
    await adapter.getObject('stackr-catalogue-public', 'legacy/card-1.png', { maxBytes: tinyPng.length }),
    tinyPng,
  );
  assert.deepEqual(downloaded, { bucket: 'stackr-catalogue-public', key: 'legacy/card-1.png' });
  await assert.rejects(
    () => adapter.getObject('stackr-catalogue-public', 'legacy/card-1.png', { maxBytes: tinyPng.length - 1 }),
    /exceeds/,
  );
}

async function assertScopedReadAndCountQueries() {
  const sourceId = '44444444-4444-4444-8444-444444444444';
  const requests = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    const method = init.method ?? (input instanceof Request ? input.method : 'GET');
    requests.push({ url, headers, method });
    if (headers.get('Accept-Profile') === 'ingest') {
      return new Response(JSON.stringify({
        id: sourceId,
        code: APPROVED_REPAIR_SOURCE,
        source_type: 'catalogue',
        licence_status: 'approved',
        active: true,
        deprecated_at: null,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: { 'content-range': '0-0/2180' } });
    }
    return new Response(JSON.stringify([{
      ...readyAsset({ derivative_list: [] }),
      source_id: sourceId,
      language_scope: { language_code: 'ja', deprecated_at: null },
    }]), { status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/*' } });
  };
  const supabase = createClient(STAGING_SUPABASE_URL, 'test-service-role-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchImpl },
  });

  const source = await resolveCatalogueAssetRepairSource(supabase, APPROVED_REPAIR_SOURCE);
  assert.equal(source.id, sourceId);
  const input = {
    source: APPROVED_REPAIR_SOURCE,
    sourceId,
    language: APPROVED_REPAIR_LANGUAGE,
    afterId: '00000000-0000-4000-8000-000000000001',
    limit: 2,
  };
  const batch = await listStoredCatalogueAssetRepairBatch(supabase, input);
  assert.equal(batch.candidates.length, 1);
  assert.equal(Object.hasOwn(batch.candidates[0], 'language_scope'), false);
  assert.equal(await countStoredCatalogueAssetRepairCandidates(supabase, input), 2180);

  const assetRequests = requests.filter((request) => request.headers.get('Accept-Profile') === 'catalog');
  assert.equal(assetRequests.length, 2);
  for (const request of assetRequests) {
    assert.equal(request.url.searchParams.get('source_id'), `eq.${sourceId}`);
    assert.equal(request.url.searchParams.get('language_scope.language_code'), 'eq.ja');
    assert.equal(request.url.searchParams.get('derivative_list'), 'eq.[]');
    assert.equal(request.url.searchParams.get('storage_provider'), 'eq.supabase_storage');
    assert.equal(request.url.searchParams.get('storage_bucket'), 'eq.stackr-catalogue-public');
  }
  assert.equal(assetRequests[0].url.searchParams.get('order'), 'id.asc');
  assert.equal(assetRequests[0].url.searchParams.get('limit'), '2');
  assert.equal(assetRequests[1].method, 'HEAD');
}

async function assertRepairMutationIsBounded() {
  const asset = readyAsset({
    sha256: null,
    content_sha256: null,
    perceptual_hash: null,
    derivative_list: [readyDerivative('card-grid')],
  });
  const downloads = [];
  const uploads = [];
  const storage = {
    id: 'supabase_storage',
    async getObject(bucket, key, options) {
      downloads.push({ bucket, key, options });
      return tinyPng;
    },
    async putObject(input) {
      uploads.push(input);
      return { provider: this.id, bucket: input.bucket, key: input.key };
    },
  };
  const { supabase, captured } = fakeUpdateSupabase();
  const result = await repairStoredCatalogueAsset(supabase, storage, asset, {
    execute: true,
    maxBytes: tinyPng.length,
  });

  assert.equal(result.status, 'repaired');
  assert.deepEqual(result.derivativeRoles, ['search-result', 'detail-page']);
  assert.deepEqual(downloads, [{
    bucket: asset.storage_bucket,
    key: asset.storage_key,
    options: { maxBytes: tinyPng.length },
  }]);
  assert.equal(uploads.length, 2, 'only missing required derivative roles should be generated');
  assert.deepEqual(uploads.map((upload) => upload.bucket), [asset.storage_bucket, asset.storage_bucket]);
  assert.deepEqual(uploads.map((upload) => upload.upsert), [false, false]);
  const expectedHash = createHash('sha256').update(tinyPng).digest('hex');
  assert.equal(captured.patch.content_sha256, expectedHash);
  assert.equal(captured.patch.sha256, expectedHash);
  assert.match(captured.patch.perceptual_hash, /^[a-f0-9]{16}$/);
  assert.deepEqual(Object.keys(captured.patch).sort(), [
    'byte_size',
    'content_sha256',
    'derivative_list',
    'height',
    'last_verified_at',
    'mime_type',
    'perceptual_hash',
    'sha256',
    'width',
  ]);
  for (const protectedColumn of [
    'asset_id',
    'source_id',
    'variant_id',
    'url',
    'original_source_url',
    'original_source_identifier',
    'source_attribution',
    'storage_bucket',
    'storage_key',
    'storage_provider',
  ]) {
    assert.equal(Object.hasOwn(captured.patch, protectedColumn), false, `${protectedColumn} must be preserved`);
  }
  assert.ok(captured.filters.some((filter) => filter[1] === 'updated_at' && filter[2] === asset.updated_at));
  assert.ok(captured.filters.some((filter) => filter[1] === 'source_id' && filter[2] === asset.source_id));
  assert.ok(captured.filters.some((filter) => filter[1] === 'variant_id' && filter[2] === asset.variant_id));
  assert.ok(captured.filters.some((filter) => filter[1] === 'storage_key' && filter[2] === asset.storage_key));
  assert.ok(captured.filters.some((filter) => filter[1] === 'derivative_list' && filter[2] === '[]'));

  const dryRun = await repairStoredCatalogueAsset(
    { schema() { throw new Error('dry-run must not update'); } },
    { id: 'supabase_storage', async getObject() { throw new Error('dry-run must not download'); } },
    asset,
    { execute: false, maxBytes: tinyPng.length },
  );
  assert.equal(dryRun.status, 'would_repair');
}

async function main() {
  assertTargetGuard();
  assertCliIsBoundedAndReadOnlyByDefault();
  assertRepairClassificationAndCursor();
  await assertSupabaseControlledDownload();
  await assertScopedReadAndCountQueries();
  await assertRepairMutationIsBounded();
  assert.match(repairWorkflow, /environment: staging/);
  assert.match(repairWorkflow, /SUPABASE_URL: https:\/\/lmwfhvexfcoyeuoyrlco\.supabase\.co/);
  assert.match(repairWorkflow, /SUPABASE_SECRET_KEY: \$\{\{ secrets\.SUPABASE_STAGING_SECRET_KEY \}\}/);
  assert.match(repairWorkflow, /github\.actor == 'tberridge86'/);
  assert.match(repairWorkflow, /github\.event\.comment\.body == '\/inspect-stackr-stored-catalogue-assets'/);
  assert.match(repairWorkflow, /github\.event\.comment\.body == '\/repair-stackr-stored-catalogue-assets'/);
  assert.match(repairWorkflow, /if: env\.MODE == 'execute'[\s\S]+--execute/);
  assert.match(repairWorkflow, /--maxAssets="\$MAX_ASSETS"/);
  assert.doesNotMatch(repairWorkflow, /oakdbbzdqwurpjnoqhmu|environment: production/);
  console.log('Stored catalogue asset repair tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
