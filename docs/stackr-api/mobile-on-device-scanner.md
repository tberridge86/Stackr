# Stage 8: Stackr Mobile On-Device-First Scanner

Stage status: implemented behind feature flags. Existing scanner UI and legacy fallback remain available.

## Current State Found

- `features/scan/ScanScreen.tsx` already performs camera preview, quality checks, card localisation, targeted ML Kit OCR, local OCR catalogue matching, diagnostics, feedback and result confirmation.
- `lib/recognition/localOnDeviceInference.ts` already loads the selected local ONNX path only when the model and catalogue manifests are approved.
- Stage 6 still blocks the production model/index, so the new path is disabled by default.
- `expo-sqlite` is not installed in the app dependencies yet. The Stage 8 cache code includes a persistent SQLite adapter, but the live app will report the persistent cache as unavailable until that dependency is added.

## Implemented Mobile Flow

When enabled by flags, the scanner now uses this order:

1. Camera preview and current quality guidance.
2. Overlay/capture geometry from the same preview frame.
3. Perspective/localised crop where available.
4. Targeted local OCR.
5. Exact local Stackr catalogue-cache lookup when OCR has a collector-number signal.
6. Local ONNX embedding generation when the approved model/catalogue are available.
7. Stackr API `/v1/recognition/identify` with embedding, OCR and quality metadata only.
8. Candidate confirmation in the existing scan result screen.
9. Existing legacy fallback only when `ximilarEmergencyFallback` is enabled and local/Stackr API paths do not return usable candidates.

The Stackr API client rejects base64/image-byte JSON payloads for recognition. Fallback image recognition is reserved for private uploaded-image keys.

## Feature Flags

- `EXPO_PUBLIC_STACKR_API_ENABLED`
- `EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED`
- `EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY`
- `EXPO_PUBLIC_IMAGE_FALLBACK_ENABLED`
- `EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK`
- `EXPO_PUBLIC_SCAN_FEEDBACK_ENABLED`

Compatibility flags still honoured:

- `EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED`
- `EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE`
- `EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED`
- `EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED`

## Local Catalogue Cache

New cache module:

`lib/stackrCatalogueCache.ts`

It stores:

- catalogue manifest;
- sets;
- card identities;
- variants;
- aliases;
- external IDs;
- latest change sequence;
- active model/index versions;
- queued offline scans.

The cache supports:

- transactional bootstrap;
- checksum validation;
- atomic manifest activation after data writes;
- rollback on failed bootstrap;
- delta sequence tracking;
- exact language/set-code/collector-number lookup;
- offline unresolved-scan queueing.

## Crop Alignment

The scanner now passes the selected rectified/target crop URI into the internal recognition request. The local ONNX path uses that URI instead of only receiving resized base64 fallback images, aligning OCR/recognition with the crop shown to the user.

## Known Blockers

- `expo-sqlite` must be installed before the persistent on-device catalogue cache can run in the actual Expo app.
- The production model and embedding index remain blocked until Stage 6 selects and validates them.
- Private scan image upload is not activated because the upload endpoint/presigned-key flow is not yet wired into the mobile app.
- Stackr API recognition is feature-flagged off by default until the gateway and private recognition service are deployed together.

## Rollback

Disable:

- `EXPO_PUBLIC_STACKR_API_ENABLED`
- `EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED`
- `EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY`

The app will return to the existing scanner and legacy fallback behaviour. Code rollback is a normal revert of the Stage 8 commit.
