# Stackr Scanner Pipeline Audit

Audit date: 2026-07-27
Scope: repository and live Supabase inspection only. No scanner UI, model asset, provider routing or production function was changed.

## Scanner Entry Points

Current scanner surfaces:

- Main scan flow: `features/scan/ScanScreen.tsx`
- Scan result: `app/scan/result.tsx`
- Binder page result: `app/scan/binder-page-result.tsx`
- Vision Camera path: `app/scan/card-camera.tsx`
- Diagnostics: `app/scan/diagnostics.tsx`, `app/scan/rectification-diagnostics.tsx`, `app/scan/card-vision-diagnostics.tsx`
- Native card vision module: `modules/stackr-card-vision`
- Admin/review surfaces: `app/admin/scan-lab.tsx`, `app/admin/recognition-feedback.tsx`, `app/admin/scanner-analytics.tsx`, `app/admin/shadow-mode-pilot.tsx`

The current scanner UI is mature and should be preserved. Stage 2 should wrap service calls and add instrumentation, not replace the flow.

## Main Capture Flow

`features/scan/ScanScreen.tsx` uses:

- `expo-camera` `CameraView`
- `expo-image-manipulator`
- `expo-file-system/legacy`
- ML Kit text recognition
- JPEG decoding through `jpeg-js`
- Supabase catalogue lookup, calibration and learning-event writes
- Local OCR matching and local recognition orchestration
- Remote/legacy visual recognition fallback
- Scan diagnostics, learning events and feedback queues

Important constants found in `ScanScreen.tsx`:

| Constant | Value |
| --- | --- |
| Card aspect ratio | `0.716` |
| Frame check width | `180` |
| Localisation frame check width | `320` |
| Localisation output width | `720` |
| Auto frame check interval | `1350ms` |
| Target crop padding ratio | `0.12` |
| Local quick scan frame width ratio | `0.72` |
| Binder page output width | `1500` |
| Binder page pocket output width | `520` |

Camera capture uses `takePictureAsync` in the main scan and preview paths. Captured images are processed into separate recognition payloads rather than sending the original photo blindly.

## Crop, Localisation And Compression

The scanner builds capture geometry from preview dimensions, safe area, rotation and mirroring. It attempts preview-to-photo crop mapping, then falls back to centered crop logic when needed.

Recognition image variants:

- Localised/rectified card crop when localisation succeeds.
- Target crop around the card.
- Wide safety crop.
- Full-frame fallback.

Observed resize/compression behavior:

| Image path | Resize/compression |
| --- | --- |
| Localised working image | about `0.82` compression |
| Target crop | resize width about `960`, compression about `0.76` |
| Wide safety crop | resize width about `1040`, compression about `0.72` |
| Full-frame fallback | compression about `0.68` |
| Targeted OCR crops | compression about `0.86` |
| Low-weight preview/frame check | compression around `0.42` to `0.5` |
| Binder page output | compression about `0.82`; pocket crops about `0.76` |

Localisation and rectification use `localiseCardFromJpegBase64` and `perspectiveCorrectCardJpegBase64`.

## OCR

ML Kit OCR is used in two ways:

- General fallback OCR over prepared images.
- Targeted OCR regions over likely printed card zones.

Targeted OCR region coordinates are normalized:

| Region | x | y | width | height | Resize width |
| --- | ---: | ---: | ---: | ---: | ---: |
| name | `0.035` | `0.018` | `0.72` | `0.13` | `760` |
| hp | `0.66` | `0.018` | `0.31` | `0.12` | `420` |
| collector-number | `0.015` | `0.84` | `0.46` | `0.14` | `620` |
| set-code | `0.015` | `0.76` | `0.5` | `0.2` | `660` |
| copyright | `0.36` | `0.84` | `0.62` | `0.14` | `760` |

OCR evidence is passed to local matching and remote recognition as hints.

Language gap: the shared recognition types mention Korean and Chinese variants, but the production local OCR matcher does not yet prove full support for English, Japanese, Simplified Chinese, Traditional Chinese and Korean.

## Quality Gate

Quality flow:

1. Evaluate brightness, contrast, edge/focus, glare and framing from JPEG pixels.
2. Localise the card where enabled.
3. Validate scanner frame using the scanner recognition pipeline.
4. Reject low-quality or non-card captures when enabled.
5. Record quality/failure metadata through scan learning and diagnostics paths.

Quality/failure categories include:

- focus
- glare
- exposure
- framing
- stability
- card coverage
- low confidence
- no match
- fallback/provider failure

## Local Matching And ONNX Integration

Local matching uses:

- `lib/localOcrCardMatcher.ts`
- `lib/localCardIndex.ts`
- `lib/recognition/orchestrator.ts`
- `lib/recognition/orchestratorCore.ts`
- `lib/recognition/engines/localOnDeviceV1.ts`
- `lib/onDeviceVisualMatcher.ts`
- `lib/scannerRecognitionPipeline.ts`

Local OCR matching is preferred when confidence is strong. Otherwise the flow falls back to remote recognition and merges candidates where useful.

ONNX/native assets:

- `assets/models/stackr-card-vision-healthcheck.onnx`
- `onnxruntime-react-native`
- `modules/stackr-card-vision`
- Android/iOS native frame-analysis and rectification scaffolding

Blocking state:

- Card-identity ONNX model manifest is blocked.
- No approved production `model.onnx` was found for card identity.
- Catalogue embeddings are blocked with zero approved embeddings.

## Remote Recognition Flow

`lib/cardSight.ts` orchestrates remote and fallback recognition:

1. Primary visual endpoint through the Railway backend, currently using a local visual pack/Rare Candy style route when configured.
2. Local AI/OCR catalogue resolver when printed-number evidence exists.
3. Visual fallbacks through CardSightAI and Ximilar when configured.
4. Text fallback endpoint.
5. Final visual retry path.

`lib/recognition/featureFlags.ts` defaults:

- `EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED`: false
- `EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE`: false
- `EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED`: true
- `EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED`: false
- `EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED`: true

`lib/config.ts` keeps Ximilar fallback enabled unless `EXPO_PUBLIC_SCAN_XIMILAR_FALLBACK=false`.

## Supabase Edge Recognition Drift

Local repository:

- `supabase/functions/stackr-card-recognition/index.ts` is a Ximilar-backed Edge Function.
- It validates auth, image dimensions, batch size and rate limits, then calls Ximilar endpoints.
- It uses service-role credentials server-side.

Live Supabase:

- Only `scan-card` was listed as deployed.
- `scan-card` has JWT verification disabled and uses Anthropic for card identification.
- Local `stackr-card-recognition` and `minty-insight` were not listed as deployed.

Risk: the app invokes `stackr-card-recognition`, but live function inventory did not show that function. Stage 2 must reconcile function source and deployment state before changing scanner traffic.

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

Remote concurrency is controlled by `EXPO_PUBLIC_SCAN_BINDER_PAGE_REMOTE_CONCURRENCY`.

## Feedback, Shadow Mode And Analytics

Current tracking in code:

- In-memory diagnostics keep the latest 12 scan sessions.
- `scan_learning_events` captures attempts, candidates, outcomes, timings, OCR preview and route context.
- Recognition feedback queue stores metadata locally and uploads images only after explicit consent.
- Recognition feedback backend stores metadata, images, events, review status and checksums.
- Shadow-mode pilot compares visible/current provider with local recognition, rejects raw images and requires internal tester/admin access.
- Scan lab uploads require admin/tester access and explicit image consent.

Live database gap:

- Several feedback, scan lab, benchmark, shadow mode and scanner training tables referenced by migrations/code were not present in live table checks.
- Private storage buckets `recognition-feedback` and `scan-lab-training` were not present in live storage metadata.

## Recognition Success, Fallback And Failure Tracking

Tracking exists in code but is not yet proven end-to-end in live production:

- Scanner logs use route/stage labels and diagnostic events.
- Local and remote candidate decisions are captured in recognition diagnostics.
- Fallback use can be represented in scan learning and shadow-mode paths.
- Review/feedback tables and buckets exist in migrations but are not all present live.
- No live dashboard or production accuracy/fallback/failure metric was verified.

## Scanner Test Baseline

Relevant commands passed during Stage 1:

- `npm run test:recognition-orchestrator`
- `npm run test:scanner-pipeline`
- `npm run test:scanner-analytics`
- `npm run test:scanner-calibration`
- `npm run test:card-centering`
- `npm run test:card-frame-analyser`
- `npm run test:live-card-guidance`
- `npm run test:card-rectification`
- `npm run test:ocr-evidence`
- `npm run test:card-identity-search`
- `npm run test:local-quick-scan`
- `npm run test:recognition-feedback`
- `npm run test:shadow-mode-pilot`
- `npm run test:evidence-fusion`
- `npm run test:variant-resolver`
- `npm run test:scan-lab-core`
- `npm run test:scan-lab-manifest`
- `npm run test:scan-lab-backend`

## Acceptance Criteria Before Replacing Current Scanner Path

Do not remove existing fallbacks until:

- Local recognition has an approved ONNX model and approved embeddings.
- Benchmark covers English, Japanese, Simplified Chinese, Traditional Chinese and Korean.
- Benchmark includes variants/finishes and cards that share artwork.
- False accept rate, exact identity accuracy, variant accuracy and no-match behavior are measured.
- Ximilar/CardSight fallback usage is logged and below an agreed threshold.
- Feedback dataset has reviewed labels and leakage checks.
- Request IDs connect mobile, backend, Edge Function and Supabase records.

## Scanner Go/No-Go

Go for Stage 2 scanner instrumentation and API wrapping in shadow/fallback-preserving mode.

No-go for making Stackr local recognition the primary scanner path, removing Ximilar/CardSight fallback or claiming multilingual recognition readiness.
