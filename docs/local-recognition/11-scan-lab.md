# Scan Lab Internal Capture Workflow

## Purpose

Scan Lab is an internal-only development tool for collecting consented real-world
Pokemon card captures that can improve Stackr's local recognition model. It is
not part of the ordinary production scanner flow and does not replace scanner
recognition, grading, marketplace, binder or Supabase catalogue behaviour.

## Access Model

- The route is registered as `admin/scan-lab` but is not linked from ordinary app
  navigation.
- The client screen renders only when `EXPO_PUBLIC_STACKR_SCAN_LAB_ENABLED=true`
  or the app is a development build, and the signed-in profile has
  `role = 'admin'`.
- Uploads go through `POST /api/scan-lab/captures` and
  `PUT /api/scan-lab/captures/:captureId/files/:role`.
- The backend validates the user's Supabase access token and verifies the
  profile role before accepting metadata or image bytes.
- Supabase service-role credentials remain server-side only.
- File uploads are accepted only as image MIME types supported by the private
  bucket; arbitrary `application/octet-stream` uploads are rejected.

## Local Capture Data

Each queued local record stores:

- `physicalCardSessionId` for grouping several views of the same physical card.
- Original full-resolution photo URI.
- Rectified card URI, recognition crop URI, OCR crop URI and thumbnail URI when
  native rectification succeeds.
- Capture-quality measurements from `StackrCardVision`.
- OCR evidence from the region-based OCR service when rectification succeeds.
- Expected identity, review status and user-confirmed identity.
- Device model, platform, OS, lighting category, sleeve state, holder state and
  front/back side.
- Explicit image-upload consent and upload/delete status.

## Consent and Upload

Images are copied into the app document directory under `scan-lab/<localId>/`
before entering the local queue. They remain local until an admin tester reviews
a capture and toggles explicit upload consent. The upload path uses Expo file
upload with raw image bytes rather than reading full-resolution photos into
JavaScript as base64 strings.

Uploaded data lands in:

- `public.scan_lab_captures`
- `public.scan_lab_capture_events`
- private storage bucket `scan-lab-training`

The app never writes directly to the bucket.
The backend keeps `image_upload_status = metadata_received` until both the
original photo and rectified-card file have storage paths. Training export rejects
partial uploads. The app records the backend capture ID immediately after
metadata is accepted, so a tester can delete a partially uploaded backend row if
a later file upload fails.

## Review States

Testers can mark a capture as:

- `confirmed`
- `corrected`
- `unresolved`
- `wrong_variant`
- `poor_capture`

Rows are exported for training only after a later database review marks
`label_verification_status` as `reviewed` or `verified`.
Export also requires active image-upload consent, uploaded original and rectified
image paths, checksums for both files, and capture-quality evidence.

## Export Command

Use:

```bash
npm run export:scan-lab-manifest
```

The command requires backend credentials:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`

It writes:

- `ml/data_manifests/scan-lab-reviewed-training-manifest.json`

The exporter splits by `physicalCardSessionId`, so multiple views of one
physical card cannot be split across train, validation and test.

## Known Limits

- Upload is backend-protected, but production deployments should keep
  `STACKR_SCAN_LAB_UPLOADS_ENABLED` disabled unless an internal collection run is
  active.
- Rectified image and OCR evidence depend on the native Prompt 6 and Prompt 7
  foundations being available in the build.
- The current export command produces JSON. A later data-engineering pass can
  convert reviewed rows to Parquet if the training pipeline requires it.
