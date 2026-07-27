# Recognition Architecture Shell

Created: 2026-07-26

Scope: Prompt 2 architecture shell. This introduces typed recognition contracts, feature flags, a provider-neutral orchestrator, a legacy adapter, a not-ready local adapter, structured sanitized events and unit tests. It does not replace scanner UI, providers, camera capture, Supabase schemas, marketplace, binder, listing or grading behaviour.

## Current Behaviour Preserved

Production defaults continue to use the existing working route:

- `localRecognitionEnabled`: false by default.
- `localRecognitionShadowMode`: false by default.
- `legacyCloudFallbackEnabled`: true by default.
- `scannerDiagnosticsEnabled`: false by default.
- `recognitionFeedbackEnabled`: true by default.

When those defaults are active, the provider-neutral `identifyCardsDetailed` wrapper calls the existing `lib/cardSight.ts` implementation directly. That means the current user experience, provider order, diagnostics shape and scan-result navigation stay unchanged.

## New Files

- `lib/recognition/types.ts`: shared strict TypeScript contracts.
- `lib/recognition/featureFlags.ts`: scanner recognition feature flags.
- `lib/recognition/events.ts`: sanitized structured event helpers.
- `lib/recognition/engines/legacyEngine.ts`: adapter around the existing route.
- `lib/recognition/engines/localOnDeviceV1.ts`: registered local engine that returns controlled not-ready/rescan.
- `lib/recognition/orchestratorCore.ts`: pure provider-neutral orchestration used by tests and future adapters.
- `lib/recognition/orchestrator.ts`: app-facing orchestration with default legacy adapter wiring and legacy-compatible exports.
- `scripts/test-recognition-orchestrator.ts`: unit coverage for the architecture shell.

## Interfaces Added

The architecture now defines:

- `RecognitionEngine`
- `RecognitionRequest`
- `RecognitionResult`
- `RecognitionCandidate`
- `CardIdentity`
- `CaptureQuality`
- `CardCorners`
- `RectifiedCard`
- `OcrEvidence`
- `VisualEvidence`
- `CandidateEvidence`
- `ScannerDiagnostics`
- `ModelManifest`
- `CatalogueManifest`
- `RecognitionFeedback`

`RecognitionResult.outcome` is limited to exactly:

- `accepted`
- `review_required`
- `rescan_required`

## Engines

### `existing_legacy_engine`

The legacy adapter wraps the current Stackr route in `lib/cardSight.ts`.

Manifest versions recorded:

- Model: `existing-legacy-engine:2026-07-26`
- Catalogue: `existing-stackr-catalogue:2026-07-26`
- Architecture: `stackr-recognition-architecture-v1`

The adapter maps existing `IdentifiedCard` values into typed `RecognitionCandidate` values, then maps back to the existing `IdentifyCardsDetailedResult` shape for current scanner screens.

### `local_on_device_v1`

The local adapter is intentionally not ready.

Manifest versions recorded:

- Model: `local-on-device-v1:not-ready:2026-07-26`
- Catalogue: `local-catalogue-v1:not-ready:2026-07-26`
- Architecture: `stackr-recognition-architecture-v1`

It never creates fake matches. It returns `rescan_required` with `LOCAL_ENGINE_NOT_READY`.

## Orchestration Rules

1. With production defaults, call the legacy route directly.
2. When local recognition is enabled, try `local_on_device_v1` first.
3. If local returns `accepted` or `review_required`, use that result.
4. If local returns `rescan_required`, times out, throws or returns a malformed response, fall back to legacy only when `legacyCloudFallbackEnabled` is true.
5. If every available engine fails or is disabled, return `rescan_required` with no candidates.
6. Shadow mode can run the local engine without allowing it to change the final legacy result.

## Structured Events

Structured recognition events include:

- anonymous scan ID,
- processing stage,
- duration in milliseconds,
- result state,
- engine ID,
- model version,
- catalogue version,
- confidence,
- top-one/top-two margin,
- quality failure reasons,
- candidate count,
- error code.

The event shape intentionally excludes:

- card image data,
- API keys,
- personal information,
- raw OCR text.

The current legacy scan learning event pipeline remains unchanged in this prompt. The new recognition event helper is safe to use for production analytics because it does not accept or serialize image payloads or raw OCR text.

## Scanner UI Boundary

`features/scan/ScanScreen.tsx` now imports recognition through `lib/recognition/orchestrator` instead of importing the provider-specific legacy module. The pure core lives in `lib/recognition/orchestratorCore.ts`, so unit tests and future local engines can exercise orchestration without importing React Native-facing legacy dependencies. The legacy compatibility function still returns the same `IdentifyCardsDetailedResult` shape, so the UI does not need to know whether future results come from local recognition, legacy providers, or another adapter.

## Local Recognition Rollout Path

The local engine can now be enabled later by setting:

- `EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED=true`

Shadow evaluation can be enabled independently with:

- `EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE=true`

Cloud fallback can be disabled later with:

- `EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED=false`

Those switches should only be changed after device testing, consent gates and benchmark evidence are in place.

## Tests

`scripts/test-recognition-orchestrator.ts` covers:

- accepted result,
- review-required result,
- rescan-required result,
- engine timeout,
- malformed engine response,
- disabled feature flags,
- legacy engine fallback,
- no forced result when both engines fail.

## Exit Criteria

- Existing user behaviour remains unchanged: met by direct legacy routing under default flags.
- Scanner UI no longer needs to know which recognition provider is used: met by moving scanner import to the provider-neutral orchestrator.
- Local recognition can be enabled independently later: met by `localRecognitionEnabled` and `localRecognitionShadowMode`.
- No fake recognition output introduced: met. The local engine returns not-ready/rescan only.
