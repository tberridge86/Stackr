# Build 47 preparation — 27 September 2026

Candidate starts from main `8a7481e1ac37916a1e11b6e721d5067e6a37bd8c`.
Installed build 46 is app 1.0.4 at `d5965bb5a824f49aa8a75cd2c70316b47b09b8ef`.
This change does not create or submit a native build.

## Verified scope

| Area | Verified result | Remaining exception |
| --- | --- | --- |
| Metadata | ✓ Published set-card identities reconciled: 57,436 printings and 76,272 variants across 561 nonempty set/language groups | 50 published set records remain empty; this is not a claim that every Pokémon release exists |
| Artwork | ✓ Original 688-card queue completed, including 131 Pocket records; 480 Storm Emeralda/anniversary cards published; all 480 individual card responses verified after #240 | Wider catalogue census has 12,161 printings without a set-list image reference; this does not prove all display fallbacks are absent |
| Pricing implementation | ✓ Existing pricing repair, full refresh and reconciliation completed; 348 saved value/count comparisons passed | 298/366 owned copies priced at £679.24; 68 unpriced copies have explicit classifications; all currently saved prices exceed the six-hour freshness policy |
| Preservation | ✓ Existing metadata/artwork and ownership retained through the pricing repair | No holding identities or quantities are changed by this candidate |

The £679.24 subtotal includes 167 exact-finish and 131 same-printing general-estimate copies. It is not an exact-finish-only or completed-sales valuation. The exact-only saved subtotal is £19.04. Build 46's old prepared-summary selection does not establish current-main client behaviour.

## Interaction review and focused changes

The existing inspector is already on main through #210; do not replay open historical #209. It loads lazily on inspection, preserves normal taps and list state, and mounts sensors/graphics only inside the active enlarged viewer. Existing tests cover dismissal, navigation, backgrounding, system/user Reduce Motion, identity/finish selection and graphics fallback. Unknown finishes and finishes without verified masks remain neutral. The verified mask registry is empty; this is not a claim of authentic foil simulation for every card. Haptics remain preference-aware, throttled and nonblocking.

A startup storage read could complete after a user saved Reduce Motion and undo that choice in memory. Saving now waits for hydration, matching the existing preference pattern. A delayed-read regression verifies the saved choice wins.

Global search previously withheld all matched cards until missing-image manifests and controlled provider references settled. It now publishes canonical rows immediately after the existing Stackr API response and enriches images through the same existing path. First/final render phases preserve those rows; request IDs reject results from an older query. Optional manifest failure no longer erases valid matches. No pricing path, identity mapping, artwork permission or persistence policy changes.

The callback execution tests cover pending artwork, failed artwork, enriched identity preservation, first-phase rendering and stale-query rejection. Search still uses the existing 240 ms debounce and existing deadlines. Optional artwork requests still occur; there is no claim that total request volume or every endpoint's latency has been eliminated. Historical #219's large dead-code cleanup is deliberately outside this release fix.

## Validation

- Local typecheck passed; lint: zero errors and ten existing warnings.
- Card inspection suite passed: 31 motion cases, 7 primary material cases plus 27 identity/mask assertions, 20 lifecycle cases, 25 CPU/WASM rendering cases; haptic dispatch/preferences and mounted entrypoint checks also passed.
- Personal-loading suite, motion settings regression, controlled-reference boundary, mobile runtime isolation/parser and benchmark contracts passed.
- Fixture search: 12 identity/language scenarios passed. Fixture execution time is not a live latency metric.
- Resolved ordinary `production` profile passed explicit production target and safe-release-flag verification, with dotenv disabled and owner recognition disabled.
- Full PR CI and final source SHA must be recorded on the PR before integration.

At 17:55:43 UTC the existing public API benchmark measured 10 samples per successful route after one warmup, from this desktop, using nearest-rank percentiles:

| Route | p50 | p95 | Result |
| --- | ---: | ---: | --- |
| Gateway health | 87.41 ms | 107.85 ms | Pass |
| English set list (20 records) | 89.91 ms | 119.92 ms | Pass; nonempty, unique English identities |
| Japanese SV2a 157 search | 83.82 ms | 117.46 ms | Pass; expected printing and language verified |
| Variant artwork manifest | — | — | Warmup HTTP 504; zero successful timed samples |

The benchmark now recognizes the gateway's actual service identity and retains completed measurements when a later route fails. It still exits unsuccessfully on failure and keeps the original thresholds. These narrow warm readings are not a broad search SLA, cold-cache proof, or native first-paint measurement. The generic variant manifest remains an explicit service exception; the existing bounded printing manifest path is distinct.

## Build 47 handoff

Use the normal `production` build profile/channel, not the workflow's default `production-owner`. The existing workflow is `.github/workflows/build-owner-ios-release.yml` with the exact reviewed current-main SHA and `build_profile=production`. Remote numbering is authoritative; verify the next native build is 47 rather than editing a local version field. The workflow builds only; submission is separate.

Main already includes #214–#218 (pricing/general estimates, launch design and refresh worker scope), #220–#240 (the bounded artwork/import cohorts and API/pricing corrections). This candidate adds only the interaction/search changes and diagnostic verification described above. Backend migrations/artwork publication are already deployed; a native build does not repeat their data writes.

At 17:56:43 UTC Expo Free allowance was 15/15 iOS builds used, resetting 1 October 2026 at 00:00 UTC. No paid-plan change, native build, submission or OTA bypass was performed. Railway rejected worker deployment because its trial expired; manual complete-owned and queue-only refresh checks succeeded earlier, but recurring worker recovery is not verified.

Before device sign-off, install the completed build and verify Home/binder/card-detail values in the owner's session, ordinary taps and 400 ms inspection holds, enabled/disabled haptics, tilt calibration/recenter/rotation, drag fallback, reduced-motion settings, background/resume, and repeated opening/closing without drift or retained sensors. Measure first card rows, image completion, cold start and scrolling on the physical iPhone. Native haptic feel, GPU frame rate, battery impact and phone load times remain unmeasured.
