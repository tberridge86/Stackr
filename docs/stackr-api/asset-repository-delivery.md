# Stage 4: Asset Repository and Delivery Pipeline

## Current Storage Baseline

Stackr already used Supabase Storage before Stage 4:

- `recognition-feedback`: private recognition feedback uploads through the backend.
- `scan-lab-training`: private Scan Lab uploads through the backend.
- `card-scans`: legacy client-side helper in `lib/storage.ts`; Stage 4 does not expand this public upload pattern.

Stage 4 keeps Supabase Storage as the primary provider because it is already present, supports private buckets with RLS, and supports signed upload URLs. The backend abstraction also includes local development storage and an S3-compatible adapter suitable for Cloudflare R2.

## Bucket Separation

| Bucket | Visibility | Purpose |
| --- | --- | --- |
| `stackr-catalogue-public` | Public | Approved catalogue images, set symbols, set logos, series logos and sealed-product images. |
| `stackr-scan-temp` | Private | Temporary user scan uploads created by short-lived signed upload URLs. |
| `stackr-training-feedback` | Private | Training and feedback captures retained only after consent. |
| `stackr-model-private` | Private | Model files, indexes and recognition artifacts. |
| `recognition-feedback` | Private | Existing recognition feedback bucket retained for compatibility. |
| `scan-lab-training` | Private | Existing Scan Lab bucket retained for compatibility. |

## Asset Record Contract

`catalog.assets` is extended additively with:

- public asset ID and visibility;
- storage provider, bucket and key;
- original source URL and source identifier;
- source attribution and permission status;
- SHA-256 content hash;
- perceptual hash;
- byte size, MIME type and dimensions;
- derivative list;
- immutable cache-control metadata;
- archival original key where permitted;
- external-reference/unavailable state;
- last verification time;
- retention/deletion status.

`ml.model_assets` stores private model file metadata and is service-role only.

## Approved Catalogue Assets

Approved assets are processed outside normal catalogue reads:

1. Validate MIME type, file signature, dimensions and size.
2. Normalize orientation.
3. Strip unnecessary metadata by re-encoding.
4. Store a content-addressed original under a SHA-256 path.
5. Generate deterministic WebP derivatives:
   - `card-grid`
   - `search-result`
   - `detail-page`
6. Apply `public, max-age=31536000, immutable`.
7. Record SHA-256 and perceptual hashes for duplicate detection.

Third-party images are not mirrored unless `permission_status = 'approved'` and `rights_status = 'approved'`. Restricted, denied or under-review assets remain metadata-only, externally referenced or unavailable.

## Private User Scans

User scan uploads use the backend endpoint:

```text
POST /api/assets/scans/presigned-upload
```

The endpoint requires a valid bearer token, validates declared MIME type and size before issuing a signed upload, stores files in `stackr-scan-temp`, uses pseudonymous private object paths, clamps requested expiry, and returns retention metadata.

The backend also supports a fully validated authenticated upload path:

```text
POST /api/assets/scans/upload
```

That endpoint accepts the image body, validates file signature, dimensions and size, stores the object in the private scan bucket, records SHA-256, perceptual hash, MIME type, dimensions, byte size and retention metadata in `ml.scan_upload_assets`, and returns the private asset record ID. Existing feedback and Scan Lab upload routes now validate file signatures and dimensions before storing images.

Temporary scans use a 24-hour default retention marker. Training retention requires explicit consent in the feedback/Scan Lab flows.

## Public Manifest API

Approved catalogue assets are exposed through:

```text
GET /api/assets/manifest
```

The endpoint reads `api.asset_manifest`, a security-invoker view that only returns approved public catalogue records. It excludes raw payloads, internal notes, provider secrets, licensing review notes, private scans, training captures and private model assets.

## Existing-Asset Migration Command

Existing image records can be inspected or queued with:

```text
npm run asset:migrate-existing -- --dryRun --limit=25
npm run asset:migrate-existing -- --assetType=card_image --limit=100
```

The command queues approved assets into `ingest.work_queue` with `queue_name = 'asset_processing'` and `command = 'process_asset'`. It does not download, scrape or mirror third-party images directly.

The protected admin endpoint uses the same logic:

```text
POST /api/admin/assets/migrate-existing
```

## Rollback

Rollback is additive:

1. Disable calls to `/api/assets/scans/presigned-upload` and `/api/assets/manifest`.
2. Stop workers consuming `asset_processing`.
3. Remove queued `process_asset` rows that have not run.
4. Revert the Stage 4 code commit.
5. If required in a non-production recovery window, drop `api.asset_manifest`, `ml.model_assets`, Stage 4 storage policies and Stage 4 `catalog.assets` columns after confirming no newer migration depends on them.

No production deployment or destructive data migration is part of Stage 4.
