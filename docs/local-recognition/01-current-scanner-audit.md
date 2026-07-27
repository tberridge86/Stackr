# Stackr Scanner Audit

Audit date: 2026-07-26

Scope: current Stackr React Native + Expo scanner implementation. This audit did not change app code, dependencies, native projects, migrations, or production behaviour.

## Executive Summary

The current Stackr scanner is a hybrid implementation. The main user-facing scanner uses `expo-camera` for still capture, ML Kit OCR for targeted text regions, local Supabase catalogue matching, local card/frame quality heuristics, and several remote fallbacks. The primary recognition route in `lib/cardSight.ts` first calls the local/backend visual pack route at `/api/rare-candy-scan/identify`, then uses local OCR catalogue resolution when printed-number evidence exists, then optional CardSight, Ximilar, and Claude-based fallbacks.

The scanner does not currently pass full-resolution frames through the JavaScript bridge as base64 in the main flow. It captures file URIs, then creates resized/cropped JPEG base64 variants for OCR and recognition. However, some related camera paths, especially listing capture and the older VisionCamera hook, do still create base64 images in JavaScript.

The most likely loading and usability risks are native-build requirements, camera permission/native module availability, repeated still-image capture in auto mode, and phone safe-area/header crowding in the current scan overlay. The most likely accuracy risks are remote fallback ambiguity, partial number matching, unsupported Korean recognition, and flows that can accept a resolved card outside the normal result-review screen.

## What I Found

- Main scanner: `features/scan/ScanScreen.tsx`, exported by `app/scan/index.tsx`.
- Legacy/alternate scanner: `app/scan/card-camera.tsx` with `lib/useScanCamera.ts` and `lib/scanStore.ts`.
- Listing/evidence camera: `components/listing/GuidedListingCamera.tsx`, reached from `features/listing/CreateListingScreen.tsx` and `app/listing/camera.tsx`.
- Grading camera: `app/grade/index.tsx`, using VisionCamera and Ximilar grading. This is condition/grading, not recognition.
- Recognition orchestration: `lib/cardSight.ts`.
- Local recognition support: `lib/localOcrCardMatcher.ts`, `lib/localCardIndex.ts`, `lib/scannerRecognitionPipeline.ts`, `lib/cardLocalisation.ts`, `lib/scanQuality.ts`, `lib/captureGeometry.ts`, `lib/scannerCalibration.ts`, `lib/scannerPack.ts`, `lib/onDeviceVisualMatcher.ts`.
- Remote/backend recognition routes: `backend/routes/rareCandyScan.js`, `backend/routes/localAiScan.js`, `backend/routes/cardsight.js`, selected legacy routes in `backend/server.js`, and Supabase Edge Function `supabase/functions/stackr-card-recognition/index.ts`.

## What I Will Change In This Task

Only documentation:

- `docs/local-recognition/01-current-scanner-audit.md`
- `docs/local-recognition/01-current-scanner-data-flow.mmd`
- `docs/local-recognition/01-risk-register.md`

## What I Will Leave Untouched

- App screens, hooks, stores, services, native modules, package versions, lockfiles, migrations, Supabase integration, marketplace, binder, listing, grading and navigation behaviour.
- Recognition thresholds and provider ordering.
- Camera capture settings and safe-area/header layout.
- API keys, environment configuration and backend routes.

## 1. Runtime And Package Versions

Recorded from `package.json` and `npm list --depth=0`:

| Package | Declared version | Installed version observed |
| --- | --- | --- |
| Expo SDK | `~54.0.36` | `expo@54.0.36` |
| React Native | `0.81.5` | `react-native@0.81.5` |
| React | `19.1.0` | `react@19.1.0` |
| Expo Camera | `~17.0.10` | `expo-camera@17.0.10` |
| Expo Dev Client | `~6.0.21` | `expo-dev-client@6.0.21` |
| React Native Vision Camera | `4` | `react-native-vision-camera@4.7.3` |
| ML Kit Text Recognition | `^2.0.0` | `@react-native-ml-kit/text-recognition@2.0.0` |
| ONNX Runtime React Native | `^1.24.3` | `onnxruntime-react-native@1.24.3` |
| CardSight SDK | `^3.5.1` | `cardsightai@3.5.1` |

Relevant scripts:

- `npm run android:dev` uses `APP_VARIANT=development` with `expo run:android`.
- `npm run android` and `npm run ios` run prebuild/native targets.
- `npm run test:scanner-pipeline`, `npm run test:scanner-calibration`, and `npm run test:scanner-analytics` exist.

## 2. Expo Go, Development Builds And Native Projects

Stackr is not an Expo Go-only app for the scanner stack.

Evidence:

- `app.json` configures native plugins for `expo-camera`, `react-native-vision-camera`, `@react-native-ml-kit/text-recognition`, `onnxruntime-react-native`, Stripe, image picker and build properties.
- `expo-dev-client` is installed.
- `android/` exists as a native project.
- `ios-swiftui/StackrSplashView.swift` exists, but a full `ios/` project directory was not present in the file listing inspected.
- VisionCamera, ML Kit OCR and ONNX Runtime require development/native builds. They should not be expected to work inside plain Expo Go.

## 3. Camera Packages

Current camera packages:

- Main scanner: `expo-camera` `CameraView` in `features/scan/ScanScreen.tsx`.
- Listing/evidence camera: `expo-camera` `CameraView` in `components/listing/GuidedListingCamera.tsx`.
- Legacy scanner and grading camera: `react-native-vision-camera` via `lib/visionCamera.ts`, `lib/visionCamera.native.ts`, `lib/visionCamera.web.ts`, and `lib/useScanCamera.ts`.

The main scanner imports `CameraView` and `useCameraPermissions` from `expo-camera` at `features/scan/ScanScreen.tsx`.

## 4. Photograph And Preview Resolutions

### Main Scanner

The main scanner does not set `pictureSize` or camera ratio. Raw photo dimensions come from the device/camera implementation at runtime. The code then produces resized derivatives:

| Image role | Source | Output |
| --- | --- | --- |
| Auto frame check, standard | guide crop | width `180`, JPEG compress `0.52`, base64 |
| Auto frame check, localisation mode | guide crop/full check | width `320`, JPEG compress `0.48`, base64 |
| Quality gate localisation check | guide crop | width `320`, JPEG compress `0.5`, base64 |
| Localised perspective crop | card-localisation output | width `720`, JPEG quality `84`, cache file URI plus base64 |
| Target recognition crop | guide crop | width `960`, JPEG compress `0.76`, base64 |
| Wide safety crop | expanded guide crop | width `1040`, JPEG compress `0.72`, base64 |
| Full-frame fallback | whole photo resized | width `1180`, JPEG compress `0.68`, base64 |
| Binder page full image | guide/page crop | width `1500`, JPEG compress `0.8`, base64 |
| Binder page pocket crop | pocket crop | width `520`, JPEG compress `0.76`, base64 |

Main still capture:

- `camera.takePictureAsync({ quality: 0.7, base64: false, exif: false })`.
- The full-resolution capture is kept as a file URI first.

### Main Preview Frame

The preview itself fills the screen through `CameraView`. The single-card guide uses:

- `CARD_ASPECT_RATIO = 0.716`.
- `OPTIMUM_SCAN_FRAME_WIDTH_RATIO = 0.44`.
- `OPTIMUM_SCAN_FRAME_MIN_WIDTH = 156`.
- `OPTIMUM_SCAN_FRAME_MAX_WIDTH = 210`.
- `topControls = insets.top + 110`.
- `bottomControls = insets.bottom + 174`.
- The guide is vertically centered inside `height - topControls - bottomControls`.

Binder page mode uses:

- `BINDER_PAGE_FRAME_WIDTH_RATIO = 0.84`.
- `BINDER_PAGE_FRAME_MAX_WIDTH = 360`.
- `topControls = insets.top + 138`.
- `bottomControls = insets.bottom + 218`.

This layout can explain the reported phone-header issue. The top safe-area budget is fixed relative to `insets.top`, and the guide/header/status/chip stack competes with the dynamic island/status area and camera controls on small or tall phones.

### Listing/Evidence Camera

`components/listing/GuidedListingCamera.tsx` captures manual listing evidence with:

- `takePictureAsync({ quality: 0.84, base64: true })`.
- Same-source preview crop width `900`, or `720` for edge photos.
- Auto quality samples with `quality: 0.34` and `base64: true`.

This path intentionally changes guide shape by capture requirement: front, back, corners, edges, surface, slab label, slab QR/cert and sealed packaging.

### Legacy VisionCamera Hook

`lib/useScanCamera.ts` captures with VisionCamera, then manipulates the image to:

- optional card crop,
- resize width default `600`,
- JPEG compress default `0.4`,
- `base64: true`.

`app/grade/index.tsx` overrides those settings to crop to card, resize width `2000`, and compress `0.86`.

## 5. Autofocus, Exposure And Orientation

### Autofocus

- Main scanner: no explicit `autofocus` prop found on `CameraView`.
- Listing/evidence camera: `autofocus="on"`.
- VisionCamera hook: no explicit focus/exposure control found in `lib/useScanCamera.ts`.

### Exposure And White Balance

No manual exposure, exposure compensation, focus point, ISO, shutter or white-balance control was found in the main scanner path.

### Torch

- Main scanner: `enableTorch={torchEnabled && facing === 'back'}`.
- Listing camera: same pattern, with requirement-based auto torch behaviour for reflective/surface capture.
- Grading camera: torch is controlled by the VisionCamera hook.

### Orientation

The main scanner builds a `CapturedFrame` from screen dimensions and photo dimensions. Orientation is inferred from viewport shape, not EXIF:

- portrait if `width < height`,
- landscape left if `width >= height`,
- `rotationDegrees: 0`.

The code also handles mirrored front-camera captures.

## 6. Scanner Screens, Hooks, Services, Stores And Native Modules

### Screens And Routes

| File | Role |
| --- | --- |
| `app/scan/index.tsx` | Current scanner route, exports `ScanScreen`. |
| `features/scan/ScanScreen.tsx` | Main scan UI, camera, OCR, local match, remote match, binder-page scanning. |
| `app/scan/result.tsx` | Single-card scan review, binder/listing/inventory follow-up actions, manual correction feedback. |
| `app/scan/binder-page-result.tsx` | Binder page review and bulk add for confirmed pocket matches. |
| `app/scan/diagnostics.tsx` | Development diagnostics for recent scan attempts. |
| `app/scan/camera.tsx` | Redirects to main scan route. |
| `app/camera.tsx` | Redirects to main scan route. |
| `app/scan/card-camera.tsx` | Legacy VisionCamera scanner surface. |
| `app/grade/index.tsx` | Card grading/pre-grade capture flow, separate from recognition. |
| `app/listing/camera.tsx` | Redirects to listing create flow. |
| `features/listing/CreateListingScreen.tsx` | Listing evidence workflow and optional condition analysis. |
| `components/listing/GuidedListingCamera.tsx` | Guided listing/evidence camera. |
| `features/inventory/InventoryScreen.tsx` | Inventory scan callback consumer. |

### Hooks, State And Services

| File | Role |
| --- | --- |
| `lib/useScanCamera.ts` | Legacy VisionCamera capture hook. |
| `lib/scanStore.ts` | Global scanned image callback/store. |
| `lib/cardSight.ts` | Main recognition orchestrator and provider fallback ordering. |
| `lib/ximilarRecognition.ts` | Client caller for Supabase Ximilar edge function. |
| `lib/ximilar.ts` | Grading/condition Ximilar helper. |
| `lib/localOcrCardMatcher.ts` | OCR signal extraction and local candidate matching. |
| `lib/localCardIndex.ts` | Local cached Supabase `pokemon_cards` index and search. |
| `lib/cardSearch.ts` | Supabase card search and fallback search helpers. |
| `lib/cardLocalisation.ts` | JPEG edge/localisation and perspective-crop helpers. |
| `lib/scanQuality.ts` | Quality scoring for blur, brightness, coverage and glare. |
| `lib/captureGeometry.ts` | Preview-to-photo crop geometry. |
| `lib/scanAutoCaptureState.ts` | Auto-capture stability state. |
| `lib/scannerCalibration.ts` | Remote threshold/calibration config from Supabase. |
| `lib/scannerRecognitionPipeline.ts` | Frame validation, candidate ranking and confirmation helper. |
| `lib/scannerAnalytics.ts` | Analytics metadata and dashboard summaries. |
| `lib/scanLearning.ts` | Supabase scan learning events. |
| `lib/scanDiagnostics.ts` | Local/dev diagnostics buffer. |
| `lib/scannerClientContext.ts` | Device/client scan context. |
| `lib/scanIntent.ts` | Scan route/intent normalization. |
| `lib/scannerPack.ts` | Downloaded vector pack manifest/vector search. |
| `lib/onDeviceVisualMatcher.ts` | Optional ONNX on-device visual reranking. |
| `lib/binderPageScan.ts` | Binder page grid/pocket image logic. |
| `lib/binderPageScanStore.ts` | Binder page result transfer store. |

### Native Modules Or Native-Only Packages

- `expo-camera`
- `react-native-vision-camera`
- `@react-native-ml-kit/text-recognition`
- `onnxruntime-react-native`
- `expo-image-manipulator`
- `expo-file-system`
- `expo-image-picker`

## 7. Current Recognition Flow

### Main Single-Card Flow

1. User opens `/scan`, which renders `features/scan/ScanScreen.tsx`.
2. Camera permissions are requested through `useCameraPermissions`.
3. `CameraView` starts with back camera by default and optional torch.
4. Auto mode can run periodic still-photo frame checks via `takePictureAsync`.
5. On manual or auto capture, the scanner captures a photo URI with `base64: false`.
6. The captured photo is mapped to preview coordinates by `createCapturedFrame`.
7. If scan quality is enabled, the app prepares a small frame-check image and runs localisation/quality validation.
8. If validation fails, the app blocks recognition and offers retry/manual search.
9. The app prepares recognition variants: localised crop if possible, target crop, wide safety crop and full-frame fallback.
10. ML Kit OCR runs on targeted regions from the best recognition image.
11. Local OCR matcher tries to produce a strong local catalogue candidate.
12. If local confidence is strong enough, the local result can bypass remote recognition.
13. Otherwise `identifyCardsDetailed` calls backend/provider routes.
14. Provider candidates are normalized, then local database rows are resolved.
15. Ranked candidates are sent to the scan result screen, inventory callback or binder page result flow.
16. Add-to-binder, listing continuation and feedback actions happen after user action in the normal scan-result route.

### Backend Provider Order

`lib/cardSight.ts` currently uses this order for non-batched single-image recognition:

1. `/api/rare-candy-scan/identify` as the primary visual-pack route.
2. `/api/local-ai/identify` when printed number evidence exists.
3. `/api/cardsight/identify` as visual fallback when Ximilar fallback reason does not apply.
4. Supabase Edge Function `stackr-card-recognition` for Ximilar fallback when enabled and reasoned by hints.
5. `/api/scan/identify` as a final Claude image/text fallback.
6. A final retry to `/api/rare-candy-scan/identify` if still unresolved.

For multi-image binder/page cases, Ximilar can be called in a batched fallback if enabled and unresolved.

## 8. Ximilar, OCR And Other Recognition Integrations

### Ximilar

Ximilar is present in two places:

- Recognition fallback: `lib/ximilarRecognition.ts` calls Supabase Edge Function `stackr-card-recognition`.
- Grading/condition: `lib/ximilar.ts`, `app/grade/index.tsx`, and listing condition analysis call Ximilar grading-style APIs.

The Supabase Edge Function proxies Ximilar with server-side token handling, authentication, byte/dimension validation, rate limiting, request logging and cache writes. It supports Ximilar endpoints including `tcg_id`, `card_ocr_id`, `slab_id`, `slab_grade`, `detect` and `analyze`.

`SCAN_XIMILAR_FALLBACK_ENABLED` defaults to true unless `EXPO_PUBLIC_SCAN_XIMILAR_FALLBACK=false`.

### CardSight

`backend/routes/cardsight.js` imports `cardsightai`, reads `CARDSIGHTAI_API_KEY` from backend environment, decodes a client base64 image and calls `client.identify.cardBySegment('pokemon', imageBuffer)`.

### ML Kit OCR

`features/scan/ScanScreen.tsx` imports `@react-native-ml-kit/text-recognition` and runs OCR on targeted card regions:

- name,
- HP,
- collector number,
- set code,
- copyright/year.

### Claude/Anthropic Fallback

`backend/server.js` exposes `/api/scan/identify`. That route resizes an image to about width `600`, quality `60`, sends it to Anthropic and asks for structured Pokemon card identity JSON. This is a late fallback, not the first route.

### Local Visual Pack

`backend/routes/rareCandyScan.js` uses `@huggingface/transformers`, default model `Xenova/clip-vit-base-patch32`, and a scanner pack under `backend/data/scanner-packs/en-clip-base-v1`. The inspected pack manifest reports 20,184 cards, 512 dimensions and `int8-normalized` vectors.

## 9. Resizing, Compression, Cropping And Base64

Main places image data is transformed:

- `features/scan/ScanScreen.tsx`: main scanner capture, auto frame checks, OCR crops, recognition crops, binder page crops.
- `lib/captureGeometry.ts`: converts preview rectangles to photo-space crops.
- `lib/cardLocalisation.ts`: decodes JPEG base64 and estimates/perspective-corrects card bounds.
- `lib/scanQuality.ts`: consumes base64 for quality metrics.
- `components/listing/GuidedListingCamera.tsx`: creates base64 full photo and preview crop for listing/evidence quality checks.
- `lib/useScanCamera.ts`: legacy VisionCamera path crops/resizes/compresses and stores base64.
- `backend/routes/cardsight.js`: strips base64 URI prefixes and decodes to buffer.
- `backend/routes/rareCandyScan.js`: strips base64 and embeds image.
- `backend/routes/localAiScan.js`: strips base64 and optionally embeds image for CLIP rerank.
- `backend/server.js`: strips/resizes base64 before Anthropic fallback and selected Ximilar routes.
- `supabase/functions/stackr-card-recognition/index.ts`: accepts base64/base64Images/image objects, validates byte and dimension constraints, hashes and forwards to Ximilar.

Main scanner compliance note: full-resolution frames are captured as URI, not base64. Resized recognition variants are then converted to base64 and can be sent to backend recognition routes.

## 10. Full Frame Versus Card Crop

The main scanner sends card crops first when possible:

1. Localised/perspective-corrected card crop.
2. Target guide crop.
3. Wide safety crop.
4. Resized full-frame fallback.

Therefore the complete camera frame is not the preferred recognition payload, but a resized full-frame fallback can still be sent when crops/localisation are not enough.

Binder page scan sends a page crop plus pocket crops.

Listing and grading capture are not primary recognition pathways, but they do move base64 image payloads through JavaScript for evidence/condition flows.

## 11. Confidence Handling

### Existing Guards

- `validateScannerFrame` rejects likely empty frames, multiple cards, tiny card coverage and hard quality failures.
- Local OCR matcher has statuses: `disabled`, `no-text`, `no-candidates`, `weak`, `ambiguous`, `matched`.
- Local OCR strong-match threshold defaults to `0.84` and can be overridden by scanner calibration.
- Rare Candy visual route requires visual similarity/final score thresholds before accepting primary candidates.
- Result screen shows candidate choices and lets the user mark incorrect, search manually or rescan.
- Binder page flow marks pockets as confirmed only at high confidence and requires a final bulk-confirm user action.

### Weak-Acceptance Risks

- `decideScannerConfirmation` exists in `lib/scannerRecognitionPipeline.ts`, but the main scanner only imports `validateScannerFrame` and `rankScannerCandidates`; it does not appear to use the confirmation helper as the universal result boundary.
- Inventory scan callback can receive a `resolvedCard` directly from `ScanScreen` and populate stock flows without going through the normal result-review screen.
- `resolveMatches` can fall back to a provider candidate object if a local DB row is not found, so a remote candidate can still be displayed as a result.
- Number-only identities are mitigated in local OCR and backend local-AI, but broad collector numbers remain a high-risk signal in any path that does not require enough corroborating evidence.

## 12. Card Catalogue Sources And Local Database Structure

### Client And Backend Catalogue Use

- `lib/localCardIndex.ts` loads `pokemon_cards` from Supabase in pages and caches a compact index in AsyncStorage under `stackr:local-card-index:v2`.
- `lib/cardSearch.ts` searches Supabase card data and maps records to app card models.
- `backend/routes/localAiScan.js` queries `pokemon_cards` and optionally `card_clip_embeddings`.
- `backend/routes/rareCandyScan.js` uses local scanner pack files under `backend/data/scanner-packs`.
- `backend/lib/tcgdex.js`, `backend/lib/tcgdexCatalogue.js`, `backend/lib/japaneseCatalogue.js`, `lib/pokemonTcg.ts`, `lib/pokemonDisplayNames.ts` and `backend/lib/cardDisplayNames.js` support catalogue ingestion/display normalization.

### Supabase Schema Areas

Relevant scanner/catalogue tables found in migrations:

- `pokemon_cards`: legacy broad Pokemon card table used by local scanner/search.
- `card_clip_embeddings`: visual embeddings for card images.
- `scan_learning_events`: scanner attempts, selections, corrections, rescans and related analytics/learning events.
- `scan_recognition_requests`: Ximilar edge request logs.
- `scan_recognition_cache`: Ximilar edge cache keyed by image hash and endpoint.
- `scan_grading_jobs`: grading job state, separate from recognition.
- `scanner_threshold_sets`: active scanner calibration thresholds.
- `scanner_benchmark_cases`, `scanner_benchmark_runs`, `scanner_benchmark_results`: benchmark/calibration storage.
- `scanner_training_samples`, `scanner_training_augmentations`, `scanner_feedback_review_queue`, `scanner_confusion_pairs`: rebuild/training feedback schema.
- Canonical multilingual catalogue tables from Japanese/TCGdex work: `canonical_card_concepts`, `tcg_series`, `tcg_sets`, `tcg_cards`, `card_printings`, `card_variants`, `sealed_products`, `provider_records`, `provider_mappings`, `market_prices`.

No scan-photo storage bucket was found as a current primary scanner storage path. Provider image caching can use Supabase storage bucket `card-images` when backend image caching is enabled. Future training samples have a `storage_path` column, but this audit did not find a current raw-photo upload path for normal scans.

## 13. English, Japanese, Korean And Chinese Support

### English

English is supported throughout the current scanner stack:

- local `pokemon_cards` records,
- scanner pack `en-clip-base-v1`,
- local OCR matcher,
- backend Rare Candy visual route,
- backend local-AI route.

### Japanese

Japanese support exists in catalogue/search and local OCR matching:

- TCGdex/Japanese catalogue migrations and backend helpers exist.
- Client language types include `ja`.
- Local OCR matcher detects Japanese when CJK plus hiragana/katakana is present.
- Search can include Japanese candidates.

The inspected scanner pack is English-only by manifest, so visual-pack parity for Japanese was not proven.

### Chinese

Chinese support exists partially:

- TCGdex language support includes `zh-tw`.
- Client language types include `zh-tw`.
- Local OCR matcher uses detected language `zh` and treats `zh`/`zh-tw` as compatible.

Simplified versus Traditional Chinese is not fully separated in the current scanner matcher. Scanner benchmark migrations mention `zh-Hans` and `zh-Hant`, but the app-level OCR matcher inspected returns only `zh`.

### Korean

No current scanner-recognition support for Korean (`ko`) was found in the inspected client, backend matcher, TCGdex language map or local OCR language detector. This is a gap.

## 14. Supabase, Storage And Edge Functions Related To Scanning

### Tables

- `scan_learning_events`: client scanner analytics and feedback events.
- `scan_recognition_requests`: remote recognition request audit rows.
- `scan_recognition_cache`: remote recognition cache.
- `scan_grading_jobs`: grading workflow.
- `scanner_threshold_sets`: remote configurable thresholds.
- `scanner_benchmark_*`: benchmark data.
- `scanner_training_*`, `scanner_feedback_review_queue`, `scanner_confusion_pairs`: scanner rebuild data collection and review structures.
- `card_clip_embeddings`: embeddings used by local-AI/visual rerank.
- `pokemon_cards`: current primary app catalogue table for scanner lookup.

### Edge Functions

- `supabase/functions/stackr-card-recognition/index.ts`: Ximilar recognition proxy with auth, validation, rate limits, logs and cache.

### Storage

- Backend provider image cache can use bucket `card-images`.
- No current normal-scan raw-photo upload bucket was identified.
- Scanner training schema includes `storage_path`, suggesting future/consented sample storage rather than current automatic scan upload.

## 15. Analytics, Logging And Performance Measurement

Current instrumentation:

- `lib/scannerAnalytics.ts` defines `scanner-analytics-v1`.
- Ruleset version is based on `stackr-scan-ruleset-2026-07-20:${SCANNER_CALIBRATION_VERSION}`.
- Timings include camera initialization, first card detection, quality gate, stable capture, photo capture, perspective crop, OCR, local match, remote request, DB save and total scan.
- Metadata records feature flags, device/client context, scan mode, language, match source, confidence, alternatives, remote endpoint, local status and threshold version.
- `lib/scanLearning.ts` writes learning events to Supabase.
- `lib/scanDiagnostics.ts` stores local/development scan diagnostics.
- `app/admin/scanner-analytics.tsx` displays analytics dashboards.
- Backend routes log provider-stage timings such as decode, AI/model and map timings.

## 16. Current Test Coverage

Scanner-related tests/scripts found:

- `scripts/test-scanner-recognition-pipeline.ts`
- `scripts/test-scanner-calibration.ts`
- `scripts/test-scanner-analytics.ts`
- `scripts/test-card-centering-assessment.ts`
- `scripts/test-card-localisation.ts`
- `scripts/test-local-ocr-card-matcher.ts`
- `scripts/test-capture-geometry.ts`
- `scripts/test-binder-page-scan.ts`
- `scripts/test-scan-quality.ts`
- `scripts/test-scan-auto-capture-state.ts`

Coverage strengths:

- Pure TypeScript scanner ranking/validation tests.
- Calibration threshold tests.
- Analytics summarization tests.
- Local OCR matching tests.
- Capture geometry tests.
- Localisation and quality heuristic tests.
- Binder page grid/pocket tests.

Coverage gaps:

- No device camera E2E tests found.
- No native module availability tests found.
- No provider integration test suite found for CardSight, Ximilar Edge Function, Anthropic fallback or Rare Candy cold-start behaviour.
- No full multilingual scan benchmark execution was run during inspection.
- No UI/safe-area screenshot test exists for the phone-header crowding reported by the user.

## 17. Abandoned, Incompatible Or High-Risk Dependencies

High-risk or build-sensitive dependencies:

- `react-native-vision-camera`: requires native/dev build and is still used by legacy scanner and grading.
- `@react-native-ml-kit/text-recognition`: requires native/dev build.
- `onnxruntime-react-native`: requires native/dev build and native module availability; optional on-device visual matching is disabled unless explicitly enabled.
- `cardsightai`: cloud recognition provider still present as fallback.
- Ximilar: cloud provider still present as recognition fallback and grading provider.
- Anthropic fallback in backend: cloud image route still present as final recognition fallback.
- `@huggingface/transformers`: backend model loading may cold-start and be CPU/memory intensive.
- `jpeg-js`: JavaScript-side JPEG decode/localisation can be expensive on lower-end phones.

No broad Expo/RN version incompatibility was proven in this audit, but the mix of Expo Camera, VisionCamera, ML Kit and ONNX means Expo Go is not sufficient for all scanner paths.

## 18. Likely Bottlenecks And False-Result Paths

### Slow Recognition Evidence

- Auto frame checks take still photos repeatedly, then manipulate and process JPEG/base64 in JavaScript. With localisation enabled, sampling defaults to 4 FPS.
- Each final scan can create multiple image variants before recognition.
- Localisation/perspective correction decodes JPEGs in JavaScript.
- ML Kit OCR runs across multiple cropped regions.
- Recognition can make serial backend calls across local visual pack, local-AI, CardSight, Ximilar and Anthropic fallback.
- Backend CLIP routes can cold-load models and scanner packs.
- Initial local catalogue indexing pages Supabase `pokemon_cards` and caches locally.

### Inaccurate Or False-Result Evidence

- Isolated collector-number evidence remains dangerous. Local matcher and local-AI include safeguards, but not every downstream result boundary uses the same confirmation decision helper.
- The normal result screen requires user review, but inventory callback flows can use a resolved card directly.
- `resolveMatches` can display provider candidates even when a local database row is missing.
- The full-frame fallback can include background clutter, fingers, cases or table edges.
- Korean is not supported in the inspected scanner language path.
- The inspected visual pack is English-only.
- Cloud fallbacks can return provider-specific candidate shapes and confidence semantics that are normalized imperfectly.

## What Currently Works

- Main scanner route and camera permission/render state exist.
- Manual capture and auto-capture frame checking exist.
- Full-resolution main captures are not bridged as base64.
- Card guide crop, wide crop and full-frame fallback are prepared.
- Localisation, quality gate and frame validation exist.
- Targeted OCR regions exist for name, HP, collector number, set code and year.
- Local OCR/candidate matching exists and can short-circuit remote recognition for strong matches.
- Backend Rare Candy visual route exists as the first provider.
- CardSight, Ximilar and Anthropic fallback routes exist.
- Result screen supports candidate review, manual search, match-incorrect feedback, rescan and add-to-binder.
- Binder page scanning and pocket review exist.
- Analytics, diagnostics and scanner calibration are already partially built.

## What Is Slow

- Still-photo based auto frame checking.
- Multiple `ImageManipulator` passes per scan.
- JavaScript JPEG decode/localisation.
- Multiple base64 variants per scan.
- Sequential remote fallbacks.
- Server-side CLIP cold start and catalogue/vector loading.
- Initial Supabase local-card index population.

## What Is Inaccurate

- Weak or ambiguous collector-number-only evidence can still influence some result flows.
- Korean cards are not supported.
- Chinese support is partial and not split into simplified/traditional in app-level OCR signals.
- English visual pack coverage does not prove Japanese/Chinese visual support.
- Inventory callback path has less explicit user confirmation than normal scan results.
- Full-frame fallback can dilute the visual signal with background.

## What Can Be Reused

- Existing navigation and result screens.
- Capture geometry and crop projection.
- Card localisation and perspective correction helpers.
- Scan quality and auto-capture stability rules.
- Local OCR matcher and local card index.
- Supabase scanner calibration and analytics tables.
- Scanner analytics metadata schema.
- Scan learning/correction event model.
- Binder page grid/pocket structure.
- Scanner pack manifest and vector-search storage format, subject to licensing review.
- Optional ONNX on-device visual rerank pathway, once native model packaging is proven.

## What Should Be Replaced Or Reduced

- Primary dependence on cloud recognition fallbacks for normal scans.
- Still-photo polling for auto frame checks, if a native frame processor/local model route becomes available.
- Any fallback that sends user photos without a clear consent boundary.
- Stale Ximilar-centric shared scan types.
- Result acceptance paths that do not pass through a single confidence/confirmation decision.
- English-only visual pack assumptions for multilingual scanning.

## What Must Not Be Disturbed

- Existing binder and marketplace data flows.
- `binder_cards`, listing, inventory and ownership behaviour.
- Authentication and Supabase client setup.
- Grading/condition flow boundaries. Recognition should remain separate from grading.
- Current route structure and deep links.
- Current calibration/analytics/learning data retention.
- Current package versions during this phase.

## Native-Build Requirements

Any future scanner work that uses ML Kit, VisionCamera or ONNX Runtime must be validated in development/native builds, not Expo Go.

Safest assumptions:

- Android can be validated through the existing native Android project and `expo run:android`.
- iOS will likely need prebuild/EAS/dev-client validation because a full `ios/` project was not present in the inspected root.
- Avoid Expo Go for scanner work touching OCR, VisionCamera, ONNX Runtime or custom native frame processors.

## Safest Migration Order

1. Freeze current behaviour with this audit and the existing scanner tests.
2. Add/verify explicit consent boundaries and logging for any route that transmits user photos.
3. Route every save/callback path through one confidence and confirmation decision.
4. Benchmark the existing local OCR plus Rare Candy route on real devices before changing provider order.
5. Replace still-photo auto checks with native/on-device frame processing only after parity is measured.
6. Introduce versioned, licensed local visual/catalogue packs per language.
7. Prove English parity first, then Japanese and Chinese, then add Korean catalogue/recognition support.
8. Deprioritize or remove cloud recognition fallbacks only after local/offline routes meet benchmark targets.

