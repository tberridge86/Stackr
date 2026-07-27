# Prompt 24: Rollout And Rollback Plan

Date: 2026-07-27

## Decision

Status: blocked. This is a rollout plan only; it must not be executed until
`24-production-readiness.md` is updated with measured evidence showing every
launch gate has passed.

## Non-Negotiable Rollout Invariants

- Manual card search remains available in every stage.
- Local recognition must abstain when confidence, quality or variant evidence is
  insufficient.
- Ximilar and CardSight must not be called during ordinary identity recognition
  in the local-only stages.
- CardSight may remain an internal benchmark provider only.
- Ximilar grading or listing support must stay separate from card identity.
- No raw images are logged in analytics.
- No image leaves the device unless the user gives explicit consent through the
  recognition-feedback or Scan Lab flow.
- A remote kill switch must be able to disable local automatic acceptance
  without removing collection data.
- A failed model or catalogue update must preserve the previous approved pack.

## Stage A: Internal Testers

Purpose: validate local accepted results while preserving current fallback for
review cases.

Entry gates:

- Approved ONNX model installed.
- Approved catalogue pack installed.
- Model/catalogue compatibility verified.
- Evidence-fusion calibration is ready.
- Exact-variant limitations are documented.
- Internal testers are explicitly scoped, not just broadly inferred.

Routing:

- Local accepted result: visible to internal tester.
- Local review/rescan result: current provider fallback remains available.
- Shadow-mode comparison continues recording same-capture disagreement metadata.

Exit gates:

- Accepted-result precision is at least 99% for internal test data.
- False automatic accept rate is below 0.5%.
- No critical catalogue corruption remains unresolved.
- p50 and p95 latency are below target on reference devices.
- Crash, memory, thermal and battery metrics are acceptable.

## Stage B: Small Production Cohort

Purpose: validate production behaviour without automatic cloud fallback for
uncertain local cases.

Entry gates:

- Stage A exit gates passed.
- Remote cohort assignment is implemented and auditable.
- Remote kill switch is tested.
- Previous approved model/catalogue pack rollback is tested.
- Customer support and manual-search flows are ready for unresolved cards.

Routing:

- Local accepted result: visible to cohort.
- Local review/rescan result: manual review or manual search, not automatic
  third-party recognition fallback.
- No CardSight or Ximilar call during ordinary identity scans.

Exit gates:

- Production-cohort accepted precision remains at least 99%.
- No severe device-specific crash regression.
- p50/p95 latency holds across supported device classes.
- Local-only unresolved rate is acceptable.
- Catalogue gaps are quantified and triaged.

## Stage C: Local-Only Ordinary Scanning

Purpose: ordinary scans use local identity recognition without recognition
credits.

Entry gates:

- Stage B exit gates passed.
- Rollback rehearsal completed.
- Atomic model/catalogue update flow proven.
- Monitoring dashboards are live without image retention.
- Support messaging for missing packs and unresolved scans is ready.

Routing:

- Local accepted result: added through existing binder/listing destination
  choices.
- Local review required: show candidates and manual search.
- Local rescan required: show the actual capture or catalogue reason.
- No ordinary identity scan uses Ximilar, CardSight or another cloud recognition
  provider.

## Remote Kill Switch

The current environment feature flags are not sufficient as a production remote
kill switch. Before rollout, add a server-controlled configuration value that can
be changed without an app rebuild.

Required behaviour:

- Disable local automatic acceptance immediately.
- Preserve manual search.
- Preserve user collection data.
- Optionally keep local review-only candidate display if safe.
- Fall back according to the active rollout stage.
- Emit a metadata-only event that local acceptance was disabled by remote config.

## Atomic Model And Catalogue Rollback

Required install shape:

1. Download the candidate model/catalogue pack to a temporary directory.
2. Verify manifest schema versions.
3. Verify SHA-256 checksums before opening files.
4. Verify model and catalogue compatibility.
5. Verify embedding count and dimensions.
6. Run a local smoke query against the pack.
7. Promote the pack with a single filesystem rename.
8. Keep the previous approved pack until the new pack is proven healthy.
9. On any failure, delete the temporary directory and continue using the previous
   approved pack.

Rollback triggers:

- Checksum mismatch.
- Model/catalogue incompatibility.
- Corrupt SQLite catalogue.
- Embedding count mismatch.
- Local inference crash spike.
- p95 latency breach.
- Severe memory pressure.
- False automatic accept rate above gate.
- Confirmed exact-variant regression.

## Monitoring Without Images

Record metadata only:

- anonymous scan ID
- rollout stage
- device class
- model version
- catalogue version
- result state
- capture-quality failure reasons
- p50/p95 latency buckets
- memory pressure signal
- crash/session correlation ID where available
- manual-search fallback rate
- review-required rate
- rescan-required rate

Do not record:

- raw image data
- image URIs
- base64 payloads
- API keys
- personal information
- raw OCR text in production analytics

## Rollback Runbook

Immediate rollback:

1. Flip the remote kill switch to disable local automatic acceptance.
2. Confirm manual search still opens from the scanner result state.
3. Confirm collection add/listing flows are not removed or migrated.
4. Monitor crash rate and scanner completion rate for recovery.

Pack rollback:

1. Mark the active pack unhealthy in remote config.
2. Instruct clients to reopen the previous approved pack.
3. Reject pending delta updates for the unhealthy pack.
4. Preserve the user's collection data and scan history.
5. File a catalogue/model incident with version, checksum and failure signal.

Provider rollback:

1. Stage A may restore current provider fallback for review cases.
2. Stage B/C must not silently reintroduce third-party recognition credit usage
   unless product approval explicitly changes the rollout policy.
3. Manual search remains the fallback when local identity recognition is
   disabled and cloud recognition is not approved.

## Current Exit Criteria Status

- Ordinary scans incur no third-party recognition credit: not met.
- Local recognition can be rolled back safely: not proven.
- Accuracy and latency are backed by production-like evidence: not met.

