# Prompt 24: Local-Only Production Recognition Readiness

Date: 2026-07-27

## Decision

Status: blocked. Do not enable local-only production recognition.

Prompt 24 explicitly requires shadow-mode evidence to meet the agreed quality and
performance gates before production rollout work begins. The current repository
does not contain that evidence yet, so this task is limited to a readiness audit
and blocked rollout record.

## What Was Found

- `assets/models/card_identity/model-manifest.json` is blocked.
- The approved mobile ONNX model is absent.
- `approvedForMobileInference` is false.
- ONNX/PyTorch parity was tested on 0 images.
- `assets/catalogue/catalogue-manifest.json` is blocked.
- The local embedding pack contains 0 usable embeddings.
- Evidence-fusion calibration is blocked and has no acceptance thresholds.
- Exact-variant accuracy has not been measured.
- Prompt 23 shadow-mode records are expected to classify as `local_unavailable`
  until an approved model and catalogue are installed.
- No production-like real-phone shadow-mode report exists with accepted
  precision, accepted coverage, p50/p95 latency, memory, crash rate or
  device-specific failure metrics.

## What Changed

- Created this blocked production-readiness document.
- Created `docs/local-recognition/24-rollout-and-rollback.md`.
- No scanner routing, feature flag, model, catalogue, Supabase, marketplace,
  binder, listing or grading behaviour was changed.

## What Was Deliberately Left Untouched

- Existing visible scanner behaviour.
- Existing legacy recognition route.
- Existing cloud fallback defaults.
- Ximilar/CardSight benchmark and grading-related code.
- Model and catalogue artifacts.
- Collection add, binder and listing destination flows.
- Supabase schema and RLS.
- Package versions.

## Launch Gate Status

| Gate | Required | Current status | Evidence |
| --- | --- | --- | --- |
| Accepted-result precision | At least 99% | Not met | No protected shadow-mode metric exists. |
| False automatic accepts | Below agreed limit | Not met | No accepted local results exist. |
| Accepted coverage | Reported by language and variant | Not met | No production-like shadow dataset. |
| p50 recognition latency | Below 300 ms after capture | Not met | No real-device measurement. |
| p95 recognition latency | Below 800 ms after capture | Not met | No real-device measurement. |
| Zero network dependency | Ordinary identity recognition works offline | Not met | Local model/catalogue are blocked. |
| Model integrity | Approved immutable checksum | Not met | Model binary absent. |
| Catalogue integrity | Approved pack with checksums | Not met | Pack is blocked and has 0 embeddings. |
| Exact-variant limits | Documented from measured results | Not met | Variant validation rows are missing. |
| Crash regression | No severe device-specific regression | Not met | No development-build pilot data. |
| Thermal behaviour | Tested during repeated scans | Not met | No repeated-scan thermal data. |
| Battery impact | Measured on reference devices | Not met | No battery report. |

## Production Requirement Status

| Requirement | Status | Notes |
| --- | --- | --- |
| Recognition works in airplane mode | Not met | Needs approved model, catalogue and local inference evidence. |
| No Ximilar/CardSight request during ordinary scan | Not met for local-only launch | Existing production route remains legacy/default; no rollout change made. |
| Model and catalogue checksum validation | Partially prepared | Manifests contain checksum fields, but the approved model and embedding pack are absent. |
| Failed catalogue update rollback | Partially prepared | Catalogue manifest documents atomic install instructions, but production updater evidence is absent. |
| Previous approved pack compatibility | Not met | No previous approved pack exists in this local-recognition line. |
| Memory safe on lower-end devices | Not met | No measured memory data. |
| Model session release | Not met | No production model session exists to validate. |
| Thermal testing | Not met | No repeated-scan thermal run. |
| Battery testing | Not met | No measured battery impact. |
| Crash-free and latency monitoring without images | Partially prepared | Shadow-mode metadata exists, but no real pilot metrics are present. |
| Remote kill switch | Not met | Existing env flags are not enough for a production remote kill switch. |
| Manual card search | Met by existing app | No change made. |

## Safe Production Posture Today

The only safe production posture today is:

- Keep `EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED=false`.
- Keep ordinary scans on the existing visible recognition route.
- Keep local recognition in blocked/not-ready mode.
- Use shadow-mode only for internal development once an approved local model and
  catalogue exist.
- Do not disable legacy fallback for ordinary scans.
- Do not advertise local-only or offline card recognition.

## Required Evidence Before Reopening Prompt 24

Prompt 24 can be reopened only after these artifacts exist and pass review:

1. Approved pilot dataset with real-phone protected test coverage.
2. Trained embedding model with protected-test metrics.
3. Hard-negative failure analysis comparing V0/V1 on identical data.
4. ONNX export with parity on at least 1,000 test images.
5. Approved local catalogue pack with nonzero embeddings and checksums.
6. Native search benchmark on the agreed Android reference device.
7. Local inference benchmark in airplane mode.
8. Calibrated evidence-fusion thresholds from held-out validation data.
9. Independent exact-variant accuracy report.
10. Shadow-mode pilot report with manually reviewed disagreements by language,
    era, variant and device class.

## Exit Criteria Status

- Ordinary scans incur no third-party recognition credit: not met.
- Local recognition can be rolled back safely: partially planned, not proven.
- Accuracy and latency are backed by production-like evidence: not met.

