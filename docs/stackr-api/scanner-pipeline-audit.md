# Stackr Scanner Pipeline Audit

Audit date: 2026-07-27

## Scanner Entry Points

Current scanner surfaces:

- Main scan flow: `features/scan/ScanScreen.tsx`
- Scan result: `app/scan/result.tsx`
- Binder page result: `app/scan/binder-page-result.tsx`
- Vision Camera screen: `app/scan/card-camera.tsx`
- Native card vision module: `modules/stackr-card-vision`
- Scan diagnostics: `app/scan/diagnostics.tsx`, `lib/scanDiagnostics.ts`

The current UI should be preserved. Stage 2 should wrap and instrument scanner service calls, not replace the scanner flow wholesale.

## Main Capture Flow

`features/scan/ScanScreen.tsx` uses:

- `expo-camera` `CameraView`
- `expo-image-manipulator`
- ML Kit text recognition
- JPEG decoding with `jpeg-js`
- AsyncStorage for preferences/queues
- Supabase for card lookup, calibration and learning events
- Local and remote recognition orchestrators

Important constants:

- Card aspect ratio: `0.716`
- Frame check width: `180`
- Localisation frame check width: `320`
- Localised output width: `720`
- Auto frame check interval: `1350ms`
- Target crop padding ratio: `0.12`
- Binder page output width: `1500`
- Binder page pocket output width: `520`

Photo capture uses `takePictureAsync` with quality `0.7`, no base64 and no EXIF. Recognition images are then prepared separately with crop/resize/compression and base64 payloads.

## Crop, Localisation And Compression

The scanner builds a captured-frame geometry object from preview dimensions, safe area, rotation and mirroring. It attempts geometry-based crop mapping with `getCropFromPreviewRect`, then falls back to legacy centered crop logic when needed.

Recognition image variants include:

- Localised card crop when localisation succeeds.
- Target crop around the card.
- Wide safety crop.
- Full-frame fallback.

Observed compression/resizing examples:

- Target crop: resize width around `960`, compression around `0.76`.
- Wide safety crop: resize width around `1040`, compression around `0.72`.
- Full-frame: resize width around `1180` or `960`, compression around `0.68`.
- Targeted OCR crops: compression around `0.86`.
- Frame checks: smaller resize widths and lower compression for speed.

## Quality Gate

Quality flow:

1. Evaluate captured photo quality.
2. Localise card where enabled.
3. Validate scanner frame using `lib/scannerRecognitionPipeline.ts`.
4. Reject low-quality or non-card captures before recognition when enabled.
5. Log quality rejection as scan learning event with structured route context.

Quality failure categories include focus, glare, exposure, framing, stability and card coverage concepts.

## OCR

ML Kit OCR is used in two forms:

- General fallback OCR over the image.
- Targeted OCR regions for name, HP, collector number, set code and copyright.

Targeted OCR region coordinates are normalized against the card image. Extracted OCR signals are passed to `matchLocalOcrCandidates` and then to remote recognition as hints.

Current language gap: shared recognition types know about Korean and Chinese variants, but the local OCR matcher production path groups language as English/Japanese/Chinese/unknown rather than fully distinguishing all required languages.

## Local Matching

Local matching uses:

- `lib/localOcrCardMatcher.ts`
- `lib/localCardIndex.ts`
- Optional `lib/onDeviceVisualMatcher.ts`
- `lib/scannerRecognitionPipeline.ts`

Local OCR matching is preferred when it returns strong confidence. Otherwise the flow falls back to remote recognition and merges local candidates with remote candidates where useful.

The local card index loads from `pokemon_cards`, which means it is not yet the canonical multilingual catalogue/search index required by the target architecture.

## Remote Recognition Flow

`lib/cardSight.ts` currently orchestrates remote and fallback recognition:

1. Primary visual endpoint via Railway backend, currently a Rare Candy style local visual pack route.
2. Local AI/OCR catalogue resolver when printed number evidence exists.
3. Visual fallbacks through CardSightAI and Ximilar when configured.
4. Text fallback endpoint.
5. Final visual retry.

Ximilar fallback is feature-flagged by `SCAN_XIMILAR_FALLBACK_ENABLED`. It should remain available until Stackr's own benchmark has passed.

## Supabase Edge Recognition

`supabase/functions/stackr-card-recognition/index.ts` is a Ximilar-backed Edge Function. It validates bearer auth, image dimensions, batch size and rate limits, then calls Ximilar endpoints. It uses service-role credentials server-side.

Risk: the function has permissive CORS and remains directly invoked from the mobile app. Stage 2 should put this behind the private recognition service and gateway.

## Vision Camera And Native Module Flow

`app/scan/card-camera.tsx` is a separate Vision Camera path using:

- `lib/useScanCamera.ts`
- `lib/useLiveCardFrameAnalyser.ts`
- `lib/cardVisionFrameAnalyser.ts`
- `lib/stackrCardVision.ts`
- Native module `modules/stackr-card-vision`

The native module has Android and iOS implementations for frame analysis, rectification and identity search scaffolding. The JS fallback reports native unavailable when the module is not linked.

ONNX health checks exist through `onnxruntime-react-native` and `assets/models/stackr-card-vision-healthcheck.onnx`. The production card-identity model is blocked and absent.

## Binder Page Flow

Binder page scanning uses:

- Binder page layouts.
- Grid cell creation.
- Per-pocket image assessment.
- Targeted OCR per pocket.
- Local matching.
- Remote fallback with bounded concurrency.
- Duplicate pocket candidate marking.
- Binder page scan session storage.

Remote fallback concurrency is controlled by `SCAN_BINDER_PAGE_REMOTE_CONCURRENCY`.

## Feedback, Shadow Mode And Analytics

Current tracking:

- In-memory diagnostics keep the latest 12 scan sessions.
- `scan_learning_events` captures attempts, candidates, outcomes, timings, OCR preview and route context.
- Recognition feedback queue stores metadata locally and uploads images only after explicit consent.
- Recognition feedback backend stores metadata, images, events, review status and checksums.
- Shadow-mode pilot records compare visible/current provider with local recognition, reject raw images and require internal tester/admin access.
- Scan lab uploads require admin tester access and explicit image consent.

Gaps:

- No single API event spine yet.
- No consistent request ID across mobile, backend and Supabase Edge functions.
- Production accuracy, fallback and failure dashboards are not proven from live data in this audit.

## Acceptance Criteria Before Replacing Current Scanner Path

Do not remove current fallbacks until:

- Local recognition has an approved ONNX model and approved embeddings.
- Benchmark includes at least the required languages and variant/finish cases.
- False accept rate, exact identity accuracy, variant accuracy and no-match behaviour are measured.
- Ximilar fallback usage is logged and below an agreed threshold.
- Scanner feedback dataset has reviewed labels and leakage checks.
- Stage 2 API route logs include request IDs, route versions, timings and provider decisions.

## Scanner Go/No-Go

Go for Stage 2 instrumentation, API wrapping and shadow-mode routes.

No-go for making Stackr local recognition the primary scanner path or removing Ximilar/CardSight fallback.
