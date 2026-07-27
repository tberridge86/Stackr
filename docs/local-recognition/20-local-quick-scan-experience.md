# Stackr Local Quick Scan Experience

Date: 2026-07-26

## What Was Found

- The existing Stackr scanner is implemented primarily in `features/scan/ScanScreen.tsx`.
- The current scanner still preserves the legacy Expo Camera capture path and downstream `/scan/result` flow.
- Local recognition warmup already runs behind `localRecognitionEnabled` or `localRecognitionShadowMode`.
- Binder, inventory and listing destinations are resolved through the existing scan intent system and result screen.
- Duplicate camera captures are already guarded by `captureInFlightRef`.
- The on-device model and catalogue remain blocked:
  - `assets/models/card_identity/model-manifest.json` is not approved for mobile inference.
  - `assets/catalogue/catalogue-manifest.json` is not approved for install and contains zero embeddings.
  - The calibration dataset needed for automatic acceptance is still unavailable.

## What Changed

- Added `lib/localQuickScanExperience.ts`, a typed quick-scan state machine and view-model layer.
- Added the required quick-scan states:
  - `opening_camera`
  - `searching_for_card`
  - `improve_capture`
  - `stable`
  - `capturing`
  - `rectifying`
  - `recognising`
  - `accepted`
  - `review_required`
  - `rescan_required`
  - `adding_to_collection`
  - `complete`
  - `recoverable_error`
- Added deterministic guidance copy for capture issues such as glare, lighting, focus, visible corners and framing.
- Added review candidate summaries that expose set, collector number, language and variant differences.
- Added duplicate-add state handling to prevent repeated add attempts for the same card key.
- Wired local quick-scan guidance into `features/scan/ScanScreen.tsx` behind `localRecognitionEnabled`.
- Kept the production scanner copy and frame sizing unchanged when local recognition is disabled.
- Made the local quick-scan frame larger behind the flag so the card remains the visual focus.
- Added safer hit targets and accessibility labels for scanner controls.
- Updated `/scan/result` so local-mode confidence is shown as review/status copy instead of technical percentages.
- Added guards against repeated binder/listing add taps.

## What Was Deliberately Left Untouched

- Legacy cloud/hybrid recognition behavior.
- Supabase tables, RLS, storage and edge functions.
- Marketplace and binder save flows.
- Binder page scanner behavior.
- Listing destination choices.
- Full Pre-Grade and grading features.
- Package versions and native dependencies.
- Any model, catalogue or calibration approval status.

## Current Outcomes

- `accepted`: supported in the state machine and result view model, but not yet reachable from real local recognition because the model/catalogue/calibration are blocked.
- `review_required`: supported and used as the honest local-mode presentation for current `/scan/result` cards.
- `rescan_required`: supported with concrete reason copy and no forced candidate.

## UX Notes

- The scanner does not show raw confidence numbers in local quick-scan guidance.
- The result screen keeps legacy percentage displays when local recognition is disabled.
- In local mode, the result screen defaults to review language unless a future route payload carries explicit accepted local evidence.
- Manual search remains available from scanner and result screens.
- When `localRecognitionEnabled` is on for normal card/listing scans, scanner manual search opens in-place so the camera component is not torn down.
- Binder-page and inventory callback scans keep their existing manual-search destination contracts.

## Remaining Blockers

- No approved ONNX model exists.
- No compatible embedding catalogue pack exists.
- Evidence-fusion calibration is blocked by missing protected validation data.
- Native end-to-end local candidates cannot be generated on this Windows environment.
- Android build checks cannot run because Java/JDK is unavailable.
- iOS checks are unavailable on Windows.

## Safest Next Migration Step

Prompt 21 should pass the local recognition outcome through the scan result route once a real local model/catalogue can produce candidates, then render accepted/review/rescan cards from the explicit `RecognitionResult` outcome rather than inferring from card count.
