# Native97 prepared publication — 2026-10-01

This is a prepared, unpublished bounded recovery lane for 97 Japanese VS1 fronts. It is limited to set `f1b5f7cb-2472-496b-8587-1ceab0233632`, provider category `85`, group `24180`, and observed collector numbers ending in `/141`.

- Cohort: 97 fronts, 291 derivatives, and 388 immutable image objects.
- Native correction scope: 97 printing names and 193 existing variant-scoped native search-name rows. There are no unchanged-name members.
- Archive: GitHub release asset `603125015`, `stackr-native97-reviewed-20261001.zip`, SHA-256 `afc0f06595f6a2bb597584dc24d76fb3f8865d27e07fcf3dd8d9056b0653187e`, 22,586,572 bytes.
- Archive manifest SHA-256: `cf59383d7f8b99ea085802b5c0ee22b3126e204e5a9028853749d85e3594e6b0`.
- Frozen cohort SHA-256: `1d06acef9184b646097db2bed97c38f866f8684a2587dc59e42c252bfbb9adf5`.
- Frozen correction-plan SHA-256: `3b412784e86d6d6319d057c443107f0eb25bf6050d8a2bcd28f85943634bfcad`.

The protected lane validates the frozen archive, the complete 15-cohort exclusion set through Native99, source and visual-review bindings, exact printing and variant-native row IDs for staging and production, and all object paths and hashes. It changes only `card_printings.native_name` and the approved existing native `card_names.name` and `normalized_name` fields. It preserves aliases, row IDs, variant associations and states, provenance, prices, holdings, and existing artwork. Staging historical variant deprecations are read and preserved; production requires every bound variant to be active.

Initial preparation was unpublished. The first protected run and bounded recovery are recorded below.

## Publication attempt and rate-limit recovery

[Run 36860755298](https://github.com/tberridge86/Stackr/actions/runs/36860755298), source `aa03a1ea26dee995d8353f49d7313ceec7810dd8`, stopped before publication after a public image read exhausted four attempts with HTTP 429. It uploaded 114 immutable files and verified 113 of those files; it published **zero fronts**. Both metadata rehearsals passed and rolled back. A fresh readback confirms all 97 full printing/name/variant/API snapshots remain unchanged in each environment and zero production assets carry this cohort. [Receipt and recovery evidence](native97-rate-limit-recovery-20261001.json).

The bounded repair opts only Native97 into two concurrent transfers spaced by at least 700 ms, with a shared cooldown honoring valid `Retry-After` headers. The successor will reuse and reverify previously uploaded objects, then continue the same frozen 97 fronts and 388 image objects. Archive, cohort, correction plan, approvals, access controls and transaction boundaries remain unchanged. Publication is not complete until its successor receipt and independent API/file checks pass.

## Successor journal repair

[Run 36863609488](https://github.com/tberridge86/Stackr/actions/runs/36863609488), source `ff187ae560f5481125eacf37b75c6472895dd06a`, stopped before publication with `Cannot read properties of undefined (reading 'push')`. The pacing change had omitted the journal's `objects` array; the first batch failed while trying to record a transfer, before the upload/read call. The missing receipt field is not an upload count. Both rehearsals passed and rolled back. Fresh full snapshots remain unchanged for all 97 cards in each environment, and the production asset count for this cohort is zero. [Checksum-verified receipt and recovery evidence](native97-journal-recovery-20261001.json).

The bounded repair restores that array through the shared journal initializer and tests the real publisher through local byte validation and a controlled setup failure, then reads back its saved receipt. All previously uploaded immutable files remain in place. The reviewed successor must use the same 97-front cohort, 388 objects, archive, name correction plan, pacing and protected workflow. Until successful publication and independent live checks, the verified total remains **9,253 fronts**, with **2,908** of the original 4,201 artwork cases unresolved. TestFlight **1.0.4 (48)** is already available; this repair does not rebuild or resubmit the app.

## Third protected-publication failure preserved

[Run 36878902269](https://github.com/tberridge86/Stackr/actions/runs/36878902269), revision `31f8c1cc5be68772f9a286bd76c25e06e53c5c3d`, stopped before publication when a public-object read returned HTTP 429. It checked 42 objects, verified or reused 41, and created 0 new objects; it made 0 asset, link, metadata, ownership, or pricing writes. The 114 immutable objects retained from the first attempt remain available. Fresh staging and production comparisons each bind all 97 rows and show 0 changes. A single later public HTTP 200 confirms one retained WebP was readable, but does not authorize a blind rerun. [Raw receipt, artifact binding, byte-preserved snapshots and machine-readable checks](native97-third-failure-evidence-20261001.json) are retained for the next reviewed recovery decision. The cohort remains unpublished.
