# Stackr Release 55 preparation receipt

Recorded 2026-10-11. This is a source-and-process preparation receipt only. It does not create an iOS build, submit to App Store Connect, publish an update, deploy a backend, apply a data change, or establish installed-device acceptance.

## Candidate and prior delivery

- The review candidate was [PR 329](https://github.com/tberridge86/Stackr/pull/329) at audit start, `23c64b0e28c2260ba7b5312fbc0fee1bba8dbc6f`. It remains a PR head, not `main`; the recorded `main` base is `3d08536f7bd581ed1266f176c13640c0a712305f`. This is the starting candidate rather than the final Release 55 SHA.
- Exact-head PR checks for `23c64b0e28c2260ba7b5312fbc0fee1bba8dbc6f` recorded twelve successful checks, zero failures and two skipped checks. This is candidate CI, not final-main CI and not release acceptance.
- The delivered TestFlight baseline is Stackr `1.0.6 (54)`, EAS build `d8c14ae8-bb89-4ec3-b8c0-e41f6f6f3d6e`, frozen source `bf3d7a233aa7d30dda99b61ccd51533ae85eed90`; see [the build 54 delivery receipt](testflight54-delivery-20261008.md). It predates this candidate and does not attest Release 55 contents.
- The app configuration keeps version `1.0.6`, uses EAS remote app-version management, and sets the production build profile to auto-increment. The workflow-pinned cached `eas-cli` 23.2.0 is locally available and its read-only `build:version:get` and `build:list` commands support the required iOS/profile JSON reads. A bounded non-interactive production `build:version:get` attempt reached the authenticated project configuration but did not return a version within the audit window; no build-list result, remote counter or Apple state was obtained. Build 55 must be confirmed from a completed fresh EAS read and the accepted EAS build response; it must not be inferred from the historical build 54 receipt.

## Prepared source changes and checks

- `1048fa2d3aaea172084414afcc28c5851450304b`: ready sets, products, public collectors and graded/raw listings publish from their existing Search promises independently of stalled sibling sources. The actual coordinator regression fails at the starting source and passes after the repair; no extra requests or dependencies were introduced.
- `6317a2fe7ecf353781f8c8eaa069eacd4409232d`: direct Set/Binder quantity edits persist a stable, owner-bound, immutable history-only intent after a successful holding write. Recovery does not replay quantities. Real activity-writer duplicate checks cover an ambiguous insert followed by changed catalogue data. Review found two snapshot gaps, both corrected, including an absent Set target.
- Relevant final application typecheck passes. The full 10-command Home activity, 17-command personal-loading and 8-command mobile-recovery suites pass. Application lint has zero errors/eight existing warnings; expanded touched-file lint has zero errors/eleven existing Search/Binder warnings. Both scopes were independently reviewed with no remaining scoped P1/P2.
- Evidence: `docs/audits/20261011/search-independent-publication-release55.md`, `direct-history-recovery-release55.md`, `direct-history-recovery-release55-review.md` and the existing shared repair queue. No new finding or duplicate PR was created; the queue retains 28 unique findings.
- A fresh 19:05:57 UTC health response advertises backend prefix `599c776f1220`, source `bundled_workflow_sha`, and deployment `d3fd1999-bad0-4c8a-80fb-c8ec64a71295`. It does not advertise this candidate. Fresh production/staging configuration reads find no exposed service following the candidate branch. Two unpinned main-following owner-price workers and the API canary can be triggered by a merge; their success rollback points remain executable. The unrelated primary-API staged patch remains untouched.

These source tests do not establish native rendering, transport cancellation, a network-duration bound, atomic holding/history commits, original activity chronology, physical latency or installed-device acceptance. Final pushed-head CI and a local iOS export are recorded separately by the coordinator after publication; the prior twelve passing checks cannot be transferred to the new head.

## Release 55 blockers

1. **Final immutable source:** the owner must decide whether to merge PR 329. The owner-native workflow accepts only an exact reviewed `main` SHA, so its `expected_main_sha` cannot be supplied until a merge produces and records that final SHA. No merge approval is implied here.
2. **Serving backend identity:** a read-only production health check during this audit reports deployed source `599c776f12201470273574c4d5f9f01632609dc1` (`bundled_workflow_sha`). That source is ancestral to the candidate, while the candidate has backend-tree changes after it. The workflow requires an `expected_backend_sha` and `verify-ios-release-delivery.mjs` verifies it against published mobile delivery, so the current health result cannot attest the prospective Release 55 backend. A configured source pin, a rollback ID, or a green PR run is not that attestation.
3. **Preserved audience/profile:** Build 54 was built and submitted with the normal-production identity/runtime, and its current installed baseline is normal production `1.0.6` rather than the owner-recognition runtime. Release 55 should therefore default to `production`, preserving the installed app's production channel, runtime and recognition-disabled policy. `production-owner` would be a deliberate audience/policy change and needs separate recorded approval.
4. **Remote build-number and Apple state:** immediately before the build, complete the current EAS/iOS and App Store Connect reads without exposing credentials. Remote auto-increment is a configuration property, not proof that the resulting archive is build 55 or that Apple accepts it.
5. **Final-main validation:** after any merge, record the exact `main` workflow result for its final SHA. The twelve passing PR-head checks cannot be transferred to a merge commit.
6. **Skipped gates and acceptance:** `release-candidate-gate` and `canary-api-evidence` were skipped in the candidate CI. They remain unproven; they are neither passed nor waived. Physical iPhone launch, account-boundary, scanner, network and latency acceptance is also absent.

## Controlled build path when the blockers are resolved

The existing `Build owner iOS release` workflow is the only prepared native-build path. It requires an owner workflow dispatch on `main`, an exact reviewed main SHA, an exact attested backend SHA, the preserved `production` profile, and the protected production environment. Before invoking EAS it runs the existing mobile recovery, server-delivery and Home activity suites, then verifies the frozen mobile-delivery receipt. It starts an EAS iOS build and records the returned build identity; it does not submit to Apple.

The workflow's EAS response and its `frozen-ios-build-receipt.json` are needed to prove the native archive's SHA, profile, channel, runtime and assigned build number. A separate reviewed submission action and Apple processing evidence would still be needed for TestFlight availability. Neither is authorized by this preparation receipt.

## Checks for the release owner

Run these checks only at the appropriate stage and record their actual outputs against the final SHA:

1. Before approval: confirm PR 329's final diff, merge method and exact intended main SHA; use `production` unless a separate owner-recognition policy change is approved, and record the expected backend SHA, impact and rollback plan in one action packet.
2. After the approved merge and matching backend delivery: verify fresh `main` CI at the resulting SHA, then run the repository's mobile-delivery verifier with `FROZEN_SOURCE_SHA=<final-main-sha>`, `EXPECTED_BACKEND_SHA=<40-character serving-backend-sha>`, `RELEASE_BUILD_PROFILE=production` and an absolute task-specific `RUNNER_TEMP` under the existing D-drive runtime directory: `node scripts/verify-ios-release-delivery.mjs`. This command performs a real local iOS export and bundle check before reading `https://pocketvault-production.up.railway.app/health` (which must report the backend SHA prefix) and the configured public mobile API/schema routes. It writes a local receipt but does not deploy, refresh prices or read collector rows. A local export is not a signed native build or phone acceptance. Keep unrelated staged primary-API work excluded.
3. Immediately before an approved owner-native build: from the frozen source use the cached workflow-pinned CLI to complete `eas build:version:get --platform ios --profile production --json --non-interactive` and `eas build:list --platform ios --build-profile production --limit 10 --json --non-interactive`, then read App Store Connect state. Confirm the protected workflow environment is available without reading secret values. Confirm that the returned EAS build is exactly `1.0.6 (55)` before calling it Release 55.
4. After an authorized build: retain the generated native receipt and perform the separately approved Apple/TestFlight and installed-iPhone acceptance steps. Record actual observations; do not substitute fixture, CI or configuration evidence.

## Current decision

The existing native workflow and normal-production profile provide the build path. This pass has prepared, tested and independently reviewed confirmed Search publication and direct collection-history recovery repairs within the existing app. Final published-head checks, final-main selection and delivery proof remain separate.

Buildability alone does not establish production readiness. The separate Marnie canonical/runtime correction remains unapplied, Japanese source-document binding and catalogue/image coverage remain open, and the saved scanner, latency and observation-window targets still lack installed-device evidence. These gaps remain active in the completion ledger and repair queue; this receipt does not waive them.

Until a final reviewed source and the appropriate delivery/acceptance gates are resolved, Release 55 is **not approved, built, uploaded, deployed, or accepted**.
