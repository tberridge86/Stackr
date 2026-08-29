import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildApprovedCatalogueAsset,
  createPrivateScanSignedUpload,
  STACKR_ASSET_BUCKETS,
  validatePrivateScanUpload,
} from '../backend/lib/assetPipeline.js';
import { classifyExistingAssetForMigration } from '../backend/lib/assetRepository.js';
import {
  IMMUTABLE_CACHE_CONTROL,
  LocalObjectStorageAdapter,
  S3CompatibleObjectStorageAdapter,
  SupabaseObjectStorageAdapter,
  supabaseCacheControlSeconds,
} from '../backend/lib/objectStorage.js';
import { validateImageBuffer } from '../backend/lib/assetValidation.js';

const migration = readFileSync('supabase/migrations/20260728060617_stackr_asset_repository_delivery_pipeline.sql', 'utf8');
const assetRoute = readFileSync('backend/routes/assets.js', 'utf8');
const feedbackRoute = readFileSync('backend/routes/recognitionFeedback.js', 'utf8');
const scanLabRoute = readFileSync('backend/routes/scanLab.js', 'utf8');
const server = readFileSync('backend/server.js', 'utf8');
const catalogueMirror = readFileSync('scripts/mirror-approved-catalogue-assets.mjs', 'utf8');
const catalogueWorkflow = readFileSync('.github/workflows/catalogue-ingestion-ci.yml', 'utf8');

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWO4o2HzH4QZYAwAT/QI/b1BT1MAAAAASUVORK5CYII=',
  'base64',
);

function expectSql(pattern, message) {
  assert.match(migration, pattern, message);
}

function rejectSql(pattern, message) {
  assert.doesNotMatch(migration, pattern, message);
}

function assertMigrationIsSafe() {
  for (const bucket of [
    'stackr-catalogue-public',
    'stackr-scan-temp',
    'stackr-training-feedback',
    'stackr-model-private',
  ]) {
    expectSql(new RegExp(bucket), `missing storage bucket ${bucket}`);
  }

  expectSql(/create or replace view api\.asset_manifest\s+with \(security_invoker = true\)/, 'asset manifest view must use security_invoker');
  expectSql(/then 'external_reference'/, 'URL-only legacy assets must be converted to external references');
  expectSql(/create table if not exists ml\.scan_upload_assets/, 'private scan upload assets table is required');
  expectSql(/revoke all on table ml\.model_assets from anon, authenticated;/, 'model assets must not be public');
  expectSql(/revoke all on table ml\.scan_upload_assets from anon, authenticated;/, 'scan upload assets must not be public');
  expectSql(/permission_status = 'approved'/, 'public manifest must require approved permission status');
  expectSql(/retention_status = 'active'/, 'public manifest must require active retention');
  expectSql(/deleted_at is null/, 'public manifest must exclude deleted assets');
  expectSql(/for all\s+to service_role\s+using \(bucket_id = 'stackr-scan-temp'\)/, 'scan temp bucket must be service-role managed');
  rejectSql(/auth\.role\(/, 'new migration must not use deprecated auth.role()');
  rejectSql(/create policy .*stackr-scan-temp.*to anon/i, 'private scan bucket must not have anon write/read policy');
}

async function assertApprovedAssetProcessing() {
  const rootDir = mkdtempSync(join(tmpdir(), 'stackr-assets-'));
  const storage = new LocalObjectStorageAdapter({
    rootDir,
    publicBaseUrl: 'http://localhost:3001/local-object-storage',
  });
  try {
    const asset = await buildApprovedCatalogueAsset({
      storage,
      assetType: 'card_image',
      permissionStatus: 'approved',
      mimeType: 'image/png',
      buffer: tinyPng,
      sourceUrl: 'https://example.invalid/source-card.png',
      sourceIdentifier: 'example-card-1',
      sourceAttribution: 'Example source',
    });

    assert.equal(asset.permission_status, 'approved');
    assert.equal(asset.publicly_servable, true);
    assert.equal(asset.storage_bucket, STACKR_ASSET_BUCKETS.publicCatalogue);
    assert.equal(asset.cache_control, IMMUTABLE_CACHE_CONTROL);
    assert.match(asset.content_sha256, /^[a-f0-9]{64}$/);
    assert.match(asset.perceptual_hash, /^[a-f0-9]{16}$/);
    assert.ok(asset.storage_key.includes(asset.content_sha256), 'original path must include content hash');
    assert.deepEqual(asset.derivative_list.map((item) => item.role).sort(), [
      'card-grid',
      'detail-page',
      'search-result',
    ]);
    for (const derivative of asset.derivative_list) {
      assert.equal(derivative.cacheControl, IMMUTABLE_CACHE_CONTROL);
      assert.ok(derivative.storageKey.includes(derivative.contentSha256), 'derivative path must include derivative content hash');
    }

    const duplicate = await buildApprovedCatalogueAsset({
      storage,
      assetType: 'card_image',
      permissionStatus: 'approved',
      mimeType: 'image/png',
      buffer: tinyPng,
    });
    assert.equal(duplicate.content_sha256, asset.content_sha256, 'duplicate images should dedupe by SHA-256 path');

    const metadataOnly = await buildApprovedCatalogueAsset({
      assetType: 'card_image',
      permissionStatus: 'under_review',
      sourceUrl: 'https://example.invalid/unapproved.png',
      sourceAttribution: 'Example source',
    });
    assert.equal(metadataOnly.storage_provider, 'external_reference');
    assert.equal(metadataOnly.publicly_servable, false);
    assert.equal(metadataOnly.retention_status, 'unavailable');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

function assertImageValidation() {
  const corrupt = Buffer.from('not an image');
  const corruptResult = validateImageBuffer(corrupt, {
    declaredMimeType: 'image/png',
    maxBytes: 1024,
  });
  assert.equal(corruptResult.ok, false);
  assert.ok(corruptResult.reasons.includes('unsupported_or_corrupt_image_signature'));

  const mismatch = validatePrivateScanUpload(tinyPng, 'image/jpeg', { maxBytes: 1024 });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.reasons.includes('declared_mime_mismatch'));

  const oversized = validatePrivateScanUpload(Buffer.concat([tinyPng, Buffer.alloc(2048)]), 'image/png', {
    maxBytes: tinyPng.length,
  });
  assert.equal(oversized.ok, false);
  assert.ok(oversized.reasons.includes('image_too_large'));
}

async function assertPrivateSignedUpload() {
  let captured = null;
  const fakeStorage = {
    id: 'supabase_storage',
    async createSignedUpload(input) {
      captured = input;
      return {
        provider: this.id,
        bucket: input.bucket,
        key: input.key,
        signedUrl: `https://example.invalid/upload/${encodeURIComponent(input.key)}`,
        token: 'fake-token-for-test',
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      };
    },
  };

  const upload = await createPrivateScanSignedUpload({
    storage: fakeStorage,
    userId: 'real-user-id-123',
    uploadId: 'scan-1',
    mimeType: 'image/png',
    declaredByteSize: tinyPng.length,
    expiresInSeconds: 99_999,
  });

  assert.equal(upload.storageBucket, STACKR_ASSET_BUCKETS.scanTemp);
  assert.equal(captured.bucket, STACKR_ASSET_BUCKETS.scanTemp);
  assert.equal(captured.expiresInSeconds, 3600, 'presigned uploads must clamp long expiries');
  assert.match(upload.storageKey, /^private\/u\/[a-f0-9]{24}\/scan-temp\/scan-1\.png$/);
  assert.equal(upload.storageKey.includes('real-user-id-123'), false, 'private object key must not contain raw user ID');
  assert.equal(upload.retentionStatus, 'temporary');

  await assert.rejects(
    () => createPrivateScanSignedUpload({
      storage: fakeStorage,
      userId: 'user-1',
      mimeType: 'application/pdf',
      declaredByteSize: 10,
    }),
    /Unsupported scan upload MIME type/,
  );
}

function assertS3Compatibility() {
  const storage = new S3CompatibleObjectStorageAdapter({
    endpoint: 'https://r2.example.invalid',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    publicBaseUrl: 'https://cdn.example.invalid',
  });
  const signed = storage.createPresignedUpload({
    bucket: 'stackr-catalogue-public',
    key: 'public/card_image/aa/bb/hash/original.jpg',
    contentType: 'image/jpeg',
    expiresInSeconds: 900,
  });
  assert.match(signed.signedUrl, /X-Amz-Algorithm=AWS4-HMAC-SHA256/);
  assert.equal(storage.publicUrl('stackr-catalogue-public', signed.key), 'https://cdn.example.invalid/public/card_image/aa/bb/hash/original.jpg');
}

async function assertSupabaseCacheControl() {
  assert.equal(supabaseCacheControlSeconds(IMMUTABLE_CACHE_CONTROL), '31536000');
  assert.equal(supabaseCacheControlSeconds('private, max-age=0'), '0');
  assert.equal(supabaseCacheControlSeconds('86400'), '86400');

  let uploadOptions = null;
  const storage = new SupabaseObjectStorageAdapter({
    storage: {
      from() {
        return {
          async upload(_key, _body, options) {
            uploadOptions = options;
            return { data: { path: 'public/test.png' }, error: null };
          },
        };
      },
    },
  });
  await storage.putObject({
    bucket: 'stackr-catalogue-public',
    key: 'public/test.png',
    body: tinyPng,
    contentType: 'image/png',
    cacheControl: IMMUTABLE_CACHE_CONTROL,
  });
  assert.equal(uploadOptions.cacheControl, '31536000', 'Supabase upload cacheControl must be a TTL in seconds');
}

function assertRoutesAndMigrationCommand() {
  assert.match(
    server,
    /app\.use\('\/api\/assets',\s*(?:gatewayOriginAuth,\s*)?assetRoutes\)/,
    'server must mount public asset routes, optionally behind the gateway origin guard',
  );
  assert.match(
    server,
    /app\.use\('\/api\/admin\/assets',\s*gatewayOriginAuth,\s*adminAssetsRouter\)/,
    'server must protect and mount admin asset routes',
  );
  assert.match(assetRoute, /\/manifest/, 'route must expose a public manifest endpoint');
  assert.match(assetRoute, /\/scans\/presigned-upload/, 'route must expose private scan presigned uploads');
  assert.match(assetRoute, /\/scans\/upload/, 'route must expose authenticated scan uploads');
  assert.match(assetRoute, /scan_upload_assets/, 'authenticated uploads must record private asset metadata');
  assert.match(assetRoute, /\/migrate-existing/, 'route must expose protected asset migration endpoint');
  assert.match(assetRoute, /STACKR_ADMIN_API_KEY \|\| process\.env\.ADMIN_API_KEY/, 'admin route must use existing admin key pattern');
  assert.doesNotMatch(assetRoute, /SERVICE_ROLE_KEY.*res\.json/i, 'route must not serialize service credentials');
  assert.match(feedbackRoute, /validatePrivateScanUpload/, 'recognition feedback uploads must validate image signatures');
  assert.match(scanLabRoute, /validatePrivateScanUpload/, 'Scan Lab uploads must validate image signatures');
}

function assertMigrationClassifier() {
  assert.deepEqual(classifyExistingAssetForMigration({
    permission_status: 'under_review',
    rights_status: 'under_review',
    url: 'https://example.invalid/card.png',
  }), {
    action: 'metadata_only',
    reason: 'mirroring_not_authorised',
  });
  assert.equal(classifyExistingAssetForMigration({
    permission_status: 'approved',
    rights_status: 'approved',
    url: 'https://example.invalid/card.png',
    derivative_list: [],
  }).action, 'queue_asset_processing');
  assert.equal(classifyExistingAssetForMigration({
    permission_status: 'approved',
    rights_status: 'approved',
    storage_key: 'public/card_image/aa/bb/hash/original.jpg',
    content_sha256: 'a'.repeat(64),
    derivative_list: [
      { role: 'card-grid' },
      { role: 'search-result' },
      { role: 'detail-page' },
    ],
  }).action, 'already_ready');
}

function assertMirrorRequestsAreBounded() {
  assert.match(catalogueMirror, /AbortSignal\.timeout\(60_000\)/, 'Supabase mirror requests must have a bounded timeout');
  assert.match(catalogueMirror, /global:\s*\{ fetch: boundedSupabaseFetch \}/, 'the bounded fetch must cover Storage uploads');
  assert.match(catalogueMirror, /MAX_SOURCE_ATTEMPTS = 3/, 'provider image downloads must have a bounded retry count');
  assert.match(catalogueMirror, /MAX_DEFERRED_PER_BATCH = 5/, 'isolated transient asset failures must have a small batch limit');
  assert.match(catalogueMirror, /boundedInteger\(arg\('concurrency', '2'\), 2, 1, 6\)/, 'provider image concurrency must remain bounded at six');
  assert.match(catalogueMirror, /RETRYABLE_SOURCE_STATUSES\.has\(response\.status\)/, 'only transient source responses may retry');
  assert.match(catalogueMirror, /same_artwork_as_variant_id: null/, 'a mirrored native image must clear any artwork fallback');
  assert.match(
    catalogueMirror,
    /\.eq\('rights_status', 'approved'\)[\s\S]+\.eq\('permission_status', 'approved'\)[\s\S]+\.eq\('publicly_servable', true\)/,
    'duplicate storage reuse must only target approved public catalogue assets',
  );
  assert.match(
    catalogueMirror,
    /reuseExactSourceMatch[\s\S]+\.eq\('asset_type', 'card_image'\)[\s\S]+\.eq\('original_source_url', sourceUrl\)/,
    'exact card-image source matches must be eligible for artwork reuse',
  );
  assert.match(
    catalogueMirror,
    /const exactSourceReuse = await reuseExactSourceMatch[\s\S]+if \(exactSourceReuse\) return exactSourceReuse;[\s\S]+downloadApprovedImage/,
    'exact source artwork reuse must happen before another provider download',
  );
  assert.match(
    catalogueMirror,
    /status: 'deferred'[\s\S]+deferredLimit = Math\.min\(MAX_DEFERRED_PER_BATCH,[\s\S]+const degraded = Boolean\(summary\.failed\) \|\| \(summary\.deferred \?\? 0\) > deferredLimit;[\s\S]+const ok = !summary\.failed/,
    'transient records must defer without blocking later batches while hard database-state failures still fail',
  );
  assert.match(
    catalogueMirror,
    /fallbackAvailable[\s\S]+\? 'same_artwork_reference'[\s\S]+same_artwork_as_variant_id: fallbackAvailable/,
    'an unavailable provider image must preserve a verified same-artwork fallback',
  );
  assert.match(
    catalogueMirror,
    /ALLOWED_LANGUAGES = new Set\(\['en', 'ja', 'zh-cn', 'ko'\]\)/,
    'the mirror must accept exactly the four rollout languages',
  );
  assert.match(
    catalogueMirror,
    /const language = requiredLanguage\(arg\('language'\)\)/,
    'the mirror must require an explicit language',
  );
  assert.match(
    catalogueMirror,
    /provider === 'pikaqian' && language !== 'zh-cn'[\s\S]+PikaQian catalogue assets are restricted/,
    'PikaQian mirror runs must not report empty success for unsupported languages',
  );
  for (const relation of [
    'card_variants!assets_variant_id_fkey',
    'card_printings!assets_printing_id_fkey',
    'sets!assets_set_id_fkey',
  ]) {
    assert.ok(catalogueMirror.includes(relation), `the mirror must resolve language through ${relation}`);
  }
  assert.match(
    catalogueMirror,
    /\.eq\('language_scope\.language_code', input\.language\)/,
    'candidate asset queries must filter the related catalogue identity by language',
  );
  assert.match(
    catalogueMirror,
    /languageScope\?\.language_code !== input\.language[\s\S]+did not resolve to requested language/,
    'the mirror must fail closed if a returned catalogue relation has another language',
  );
  assert.match(
    catalogueMirror,
    /schemaVersion: 1,[\s\S]+degraded,[\s\S]+provider,[\s\S]+language,[\s\S]+cursor,[\s\S]+progress,/,
    'mirror JSON must expose stable schema, status, provider, language, cursor and progress fields',
  );
  assert.match(
    catalogueMirror,
    /scope: 'language_candidate_scan'[\s\S]+nextAfterId: assetIds\.length === 0 && candidates\.length > 0[\s\S]+exhausted: assetIds\.length > 0 \|\| candidates\.length < limit/,
    'the mirror must advance past inspected assets and expose when the language batch is exhausted',
  );
  assert.match(
    catalogueMirror,
    /function progressSummary[\s\S]+percentage: percentage\(count, total\)[\s\S]+processed:[\s\S]+reused:[\s\S]+mirrored:[\s\S]+deferred:[\s\S]+unavailable:/,
    'mirror progress must expose processed, reused, mirrored, deferred and unavailable percentages',
  );
  assert.match(
    catalogueMirror,
    /if \(total === 0\) return null;[\s\S]+scope: 'batch'[\s\S]+wouldMirror:[\s\S]+failed:/,
    'batch-only percentages must be explicit and undefined zero-denominator or unclassified outcomes must stay visible',
  );
  assert.match(
    catalogueWorkflow,
    /for \(\( batch=0; batch<CATALOGUE_BATCH_COUNT; batch\+\+ \)\)[\s\S]+mirror-approved-catalogue-assets\.mjs/,
    'the mirror workflow must support multiple bounded batches without raising request concurrency',
  );
  assert.match(
    catalogueWorkflow,
    /mirror-approved-catalogue-assets\.mjs[\s\S]+--provider="\$CATALOGUE_PROVIDER"[\s\S]+--language="\$CATALOGUE_LANGUAGE"/,
    'the existing mirror workflow must pass its selected language explicitly',
  );
  assert.match(
    catalogueWorkflow,
    /after_id=''[\s\S]+cursor_args=\(\)[\s\S]+--afterId="\$after_id"[\s\S]+payload\.cursor\?\.nextAfterId[\s\S]+Mirror cursor did not advance/,
    'the existing mirror workflow must consume each result cursor so deferred rows cannot starve later assets',
  );
  assert.match(
    catalogueWorkflow,
    /if \[\[ "\$\{\{ inputs\.operation \}\}" == "mirror" \]\]; then[\s\S]+CATALOGUE_LANGUAGE[\s\S]+\^\(en\|ja\|zh-cn\|ko\)\$/,
    'the existing workflow must reject languages outside the exact four-language mirror scope early',
  );
  assert.match(
    catalogueWorkflow,
    /inputs\.provider \}\}" == "pikaqian" && "\$CATALOGUE_LANGUAGE" != "zh-cn"/,
    'the existing workflow must reject unsupported PikaQian language combinations early',
  );
  assert.match(
    catalogueWorkflow,
    /CATALOGUE_MIRROR_CONCURRENCY >= 1 && CATALOGUE_MIRROR_CONCURRENCY <= 6/,
    'the mirror workflow must cap provider image concurrency at six',
  );
}

async function main() {
  assertMigrationIsSafe();
  await assertApprovedAssetProcessing();
  assertImageValidation();
  await assertPrivateSignedUpload();
  assertS3Compatibility();
  await assertSupabaseCacheControl();
  assertRoutesAndMigrationCommand();
  assertMigrationClassifier();
  assertMirrorRequestsAreBounded();

  console.log('Asset repository and delivery pipeline tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
