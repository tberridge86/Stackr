# Prompt 23 - Controlled Shadow-Mode Pilot

## Current State

Stackr already has `localRecognitionShadowMode` through
`EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE`. When enabled, the scanner keeps the
current visible legacy recognition result and runs `local_on_device_v1` on the
same accepted capture through the provider-neutral orchestrator.

The local model/catalogue are still blocked by the earlier placeholder
manifests:

- `assets/models/card_identity/model-manifest.json` has no approved ONNX model.
- `assets/catalogue/catalogue-manifest.json` has zero usable embeddings.

Shadow records will therefore classify as `local_unavailable` until the approved
model and catalogue are installed. No successful local recognition evidence is
fabricated.

## What Changed

- `ScannerDiagnostics.shadowMode` now carries a compact same-capture comparison:
  visible result, local result, top three local candidates, confidence, timings,
  agreement fields and a disagreement category.
- The result screen submits shadow pilot metadata only when:
  - `EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE=true`
  - the signed-in profile has `role = admin`
  - the backend also enables the internal shadow-mode pilot flag
- The backend route is `/api/recognition-shadow-mode`.
- The internal dashboard is `app/admin/shadow-mode-pilot.tsx`.

## Server Flags

Enable the pilot only on internal environments:

```bash
EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE=true
INTERNAL_LOCAL_RECOGNITION_SHADOW_MODE_ENABLED=true
```

Ordinary production users should keep both flags unset or false.

## Data Recorded

The pilot stores:

- anonymous scan ID
- visible engine result
- local engine result
- top three local candidates
- confidence
- timings
- agreement/disagreement
- tester feedback action
- tester-confirmed identity when supplied
- capture-quality summary
- OCR evidence summary without raw OCR text
- model/catalogue versions
- device/app context

It does not store raw images, image URIs, base64 payloads or a second upload.
Image contribution remains the separate opt-in recognition-feedback flow.

## Disagreement Categories

- `current_provider_correct_local_wrong`
- `local_correct_current_provider_wrong`
- `both_wrong`
- `both_correct`
- `exact_identity_agreement_variant_disagreement`
- `language_disagreement`
- `catalogue_missing`
- `capture_quality_failure`
- `local_unavailable`
- `visible_unavailable`
- `pending_manual_review`

## Meaningful Pilot Sample

A useful pilot must include real-phone captures across:

- English, Japanese, Korean, Simplified Chinese and Traditional Chinese
- old and modern eras
- commons and high-rarity cards
- same-art reprints
- promos
- standard/reverse holo
- Master Ball and Poke Ball patterns where available
- sleeves, binder pages, top-loaders and slabs
- low light, glare and perspective stress cases

Do not switch ordinary users to local recognition from average accuracy alone.
Report accepted precision, accepted coverage, false automatic accepts, p50/p95
latency, memory use, crash rate, device-specific failures and catalogue gaps by
language and variant.

## Review Flow

1. Internal tester scans with shadow mode enabled.
2. Visible Stackr result remains unchanged.
3. Tester confirms, corrects, marks missing, reports bad scan, adds to binder or
   moves to manual search.
4. App submits one metadata-only shadow pilot record.
5. Reviewer opens `/admin/shadow-mode-pilot`.
6. Reviewer confirms or changes the disagreement category and marks the row
   reviewed or ignored.

## Remaining Blockers

- Real-phone local recognition evidence is unavailable until the approved model
  and catalogue are present.
- The migration must be applied before backend records can be stored.
- Crash rate and memory reporting need native runtime/device telemetry from a
  development build; this task only creates the recording and review shell.
