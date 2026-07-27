# StackR Scanner Capture Geometry Audit

Date: 2026-07-20

## Installed Runtime Checked

- Expo: `54.0.36`
- Expo Camera: `17.0.10`
- Expo Image Manipulator: `14.0.8`
- ML Kit text recognition: `2.0.0`
- onnxruntime-react-native: `1.24.3`
- react-native-vision-camera: `4.7.3`

## Active Camera Paths

- `features/scan/ScanScreen.tsx`
  - Active `/scan` route via `app/scan/index.tsx`.
  - Uses Expo `CameraView`.
  - Current scan overlay is calculated in screen coordinates.
  - Captured photos are cropped for recognition using local `buildPhotoCrop`.
  - Recognition uses `lib/cardSight.ts` and backend providers.

- `components/listing/GuidedListingCamera.tsx`
  - Active guided evidence camera inside `features/listing/CreateListingScreen.tsx`.
  - Uses Expo `CameraView`.
  - Produces listing evidence photos for front, back, surface, edges, corners, slab label, packaging, and optional detail captures.
  - Current capture result stores the photo but does not include a shared capture session object or reusable coordinate mapping metadata.

## Listing And Binder Pathways

- `features/listing/CreateListingScreen.tsx`
  - Stores guided-camera results in `evidencePhotos`.
  - Uploads evidence photos to Supabase storage in `uploadPhotos`.
  - Builds listing media metadata from capture requirements.
  - Runs Ximilar condition analysis from stored evidence photos.

- `features/binder/BinderDetailScreen.tsx`
  - Routes scan-to-binder users into the active `/scan` flow with a binder id.
  - Does not own camera capture geometry directly.

- `lib/scanStore.ts`
  - Bridges scan results back into inventory/listing style callbacks.

## Duplicate Or Legacy Scanner Implementations

- `app/scan/camera.tsx`
  - Redirect shim to active scan route.

- `app/listing/camera.tsx`
  - Redirect shim to listing creation.

- `app/scan/card-camera.tsx`
  - Older Vision Camera scanner UI.
  - Uses `lib/useScanCamera.ts`.
  - Not the active `/scan` route.

- `lib/useScanCamera.ts`
  - Older Vision Camera helper with its own preview-to-photo crop math.
  - Still used by `app/grade/index.tsx`.
  - Should not be expanded as a new scanner path.

- `app/grade/index.tsx`
  - Older grading capture route using Vision Camera and `lib/useScanCamera.ts`.
  - Separate from the Rev 2 guided listing camera.

## Current Geometry Risk

The active scan flow and older Vision Camera helper each contain their own preview-to-photo crop math. The listing evidence camera stores captured photos without a shared immutable captured-frame object. This makes it easy for the live guide, evidence preview, recognition image and uploaded listing image to drift if a crop is recreated later from approximate screen coordinates.

## First Safe Implementation Target

Create one shared geometry utility in `lib/captureGeometry.ts`, then wire it into:

1. `features/scan/ScanScreen.tsx` for scan crop preparation.
2. `components/listing/GuidedListingCamera.tsx` for capture session metadata and same-source evidence preview crops.
3. `features/listing/CreateListingScreen.tsx` for storing capture-frame metadata with evidence photos.

The first pass should be guarded by `EXPO_PUBLIC_CAPTURE_GEOMETRY_V2`, preserve existing routes and styling, and avoid recognition logic changes.
