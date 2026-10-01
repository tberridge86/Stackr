# Normal TestFlight build 48 — delivery checkpoint

**Stackr 1.0.4 (48) is approved and available to both existing TestFlight groups.** Apple confirmed `VALID`, beta review `APPROVED`, and internal/external `IN_BETA_TESTING` at 07:25:12 UTC on 1 October 2026. The existing Team (Expo) and Stackr Beta Testers groups are both attached, and the exact en-GB tester notes were saved and read back. Installed-device acceptance remains pending. [Sanitized receipts and checksums](testflight48-evidence-20261001.json).

## Accepted EAS build

| Field | Value |
| --- | --- |
| Frozen source | `f8bf3a7c99ab1c5d4ef4420d558c4ba36d78678a` |
| EAS build | `6c7c16a6-688f-4508-bc4a-0cde2de5a3c2` |
| Acceptance time | 07:06:42 UTC |
| Status at checkpoint | EAS native build `FINISHED` |
| Platform and profile | iOS, `production` |
| App version, runtime, channel | `1.0.4`, `1.0.4`, `production` |
| Verified build number | `48`, confirmed by the finished EAS receipt and downloaded IPA |
| Apple App Store Connect app | `6772118450` |
| Apple build and beta-review ID | `3d590e83-5b8a-4095-8cf9-af692843b493` |

The finished build matches the exact source, normal production profile/channel, runtime, platform, version and build number. Fingerprint: `f4a65a1f97d760e2134287b90c5ce34332612005`. The 362,815,807-byte downloaded IPA has SHA-256 `7c397572456eaa0a6128dcfbb17c75465a1f967d33f0c3d9f411a43e7309e870`.

Offline verification at 07:16:56 UTC confirmed bundle `com.tommo86.Stackr`, version/build `1.0.4 (48)`, runtime `1.0.4`, production channel, and readable provisioning for team `K82N877J3F` and the exact application identifier. Embedded update ID: `349fb0a5-c0e3-4e36-85bc-4bd455ca22c6`. The embedded manifest has no source SHA; source attribution comes from the exact EAS receipt and clean source/archive evidence, not an invented embedded attestation.

Submission `0ee04c92-8fff-4485-882f-321181b5be6d` selects only this finished EAS build. The existing `production-owner` submission profile supplies Apple app/group metadata only; the submitted native archive is the verified **normal production** build.

The EAS submission record ended `ERRORED` at 07:23:08 UTC with no error message or log files exposed by its official query. Its cause is unresolved. Independent Apple readback nevertheless confirmed the exact uploaded build was `VALID` and already testing internally. The existing Apple helper then verified notes, attached only the existing external group, and requested beta review; Apple approved it immediately. No upload was repeated. The EAS submission error is retained in the evidence rather than changed into a claimed EAS success.

## Review and dispatch record

Eight applicable CI checks passed against the exact source in [run 36823923386](https://github.com/tberridge86/Stackr/actions/runs/36823923386) and [run 36823923322](https://github.com/tberridge86/Stackr/actions/runs/36823923322). The separate release-candidate assessment was skipped under its existing invocation rules. [GitHub production review run 36826603393](https://github.com/tberridge86/Stackr/actions/runs/36826603393) was approved, but lacked `EXPO_TOKEN` and failed before dispatch. No approval was bypassed and no credentials were changed.

The established authenticated local fallback then produced exactly one accepted EAS build: build 48 above. It retained the normal production profile/channel and did not create another candidate request.

Expo Doctor passed 17 of 18 checks. The remaining advisory reports four patch updates: `expo` 54.0.36 to recommended ~54.0.37; `expo-constants` 18.0.13 to ~18.0.14; `expo-file-system` 19.0.23 to ~19.0.24; and `expo-updates` 29.0.19 to ~29.0.20. These dependencies and the lockfile are unchanged since build 46. The native build succeeded. No dependency upgrade or check suppression was introduced into this reviewed candidate.

## App changes since build 46

- Startup now loads fonts and the initial overlay progressively, with a fade and a six-second escape path if loading does not finish.
- Canonical card search is progressive rather than waiting for every result source before presenting useful results.
- Artwork loading and preferences are shared across the relevant surfaces.
- Valuation states distinguish exact prices, labelled general estimates, and unavailable values.
- Card, binder, scan, and history views now show their API states explicitly.
- Set logos add `csec`, `promo-s-p`, and `promo-sm-p`; Simplified Chinese logo mappings are updated.

Native dependencies, app configuration, and the lockfile are unchanged. Haptics and gyro support predate this candidate.

A fresh read of the production channel and its production branch found no update groups. There is therefore no currently served production OTA to supersede this candidate's embedded bundle. The channel is `01a0378f-1bd1-78e6-a009-9d55f65268a5`, branch `01a0378f-1b0f-7ccf-bc18-3fa7b76643cc`; no channel or update was changed for this delivery.

## Delivery and remaining acceptance

Native compilation, downloaded archive checks, Apple processing, tester notes, both existing group bindings and external beta approval are complete. The terminal EAS submission error remains an unexplained orchestration exception; Apple availability is independently verified. There was one native build and one upload submission.

Phone installation and the physical checks below remain open. The October 1 release follow-up was deleted after verified delivery to prevent a duplicate scheduled release. No public App Store release, OTA publication, new tester group or access-control change was performed.

## Physical device acceptance list

After Apple makes the exact build available, test it on a physical iPhone through the intended normal TestFlight path:

1. Install build 48 and confirm the app shows version `1.0.4` and build `48`.
2. Launch from a cold start, complete sign-in or the existing account path, and confirm the production app reaches its normal home and collection screens.
3. Enable Reduce Motion and repeat startup; confirm the loading overlay remains usable and its six-second escape path is available.
4. Grant camera permission and take a normal card scan; verify the capture, crop, result, and recovery/error paths without owner-recognition controls appearing.
5. Check progressive ordinary search, card detail artwork, set information, collection refresh, and the exact/general/unavailable valuation labels against the production-backed app.
6. Open Home, binder, card, scan, and history views; confirm their loading, empty, unavailable, and error API states are understandable, and compare the displayed Home/binder/card totals with the responses shown in the app.
7. Background and relaunch the app, then repeat a scan and a collection refresh to expose session, permission, or network regressions.
8. Check existing haptics and gyro holo movement, including reduced-motion settings.
9. Record device model, iOS version, TestFlight build number, tested flows, failures, and screenshots in the acceptance receipt.

These checks do not establish universal camera accuracy, provider-price completeness, service reliability, or production API availability outside the sampled device/session.

## Artwork and remaining catalogue work

Current artwork accounting is **8,997 fronts, 26,991 references, and 35,921 objects**. **3,164** remain. The separate 153 offline-prepared fronts are two batches: 73 archived to GitHub and 80 retained locally. Neither is published. This TestFlight checkpoint does not publish or change any artwork.

Known remaining work also includes 94 sets missing checklists, logo coverage, pricing work with six copies unpriced and 2 provider-credential dependencies, API-reliability evidence, and device gates. These remain separate from the build-48 delivery decision.

## Rollback reference

The prior normal production candidate is EAS build `a92675d2-fec1-4977-a72b-d623f69dd577`, source `d5965bb5a824f49aa8a75cd2c70316b47b09b8ef`, app version/runtime `1.0.4`, production channel/profile, build number `46`. A fresh EAS inventory reports it `FINISHED`. Apple readback at 07:12:42 UTC confirms build `fda2356d-5eb4-4932-a1f3-25747d5cb588` is `VALID`, beta-review `APPROVED`, and `IN_BETA_TESTING` with both existing groups attached.

Build 46 is an available reference, but compatibility with the current service state and its use as a runtime rollback have not been device-validated. No rollback or update-channel mutation was performed.
