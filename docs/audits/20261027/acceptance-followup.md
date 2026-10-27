# Six acceptance checks — 27 October 2026

Follow-up to the platform audit, observed approximately 15:24–15:30 UTC.
Main is still `b5d643a997041db2a8c42b5b6cb0180e8ddf28e7`.
Release fix PR #449 is `b0f96dc995c5b0880efcedfc96baa8029645c188`;
client candidate PR #446 is `d76f5099f1cb1811df01b3eace6532d8eaf83a59`.
This follow-up changes evidence only, not runtime code or production data.

| Check | Result | Evidence / remaining action |
| --- | --- | --- |
| New upload | Source pass; live unmeasured | Actual R2 writer fixture preserves the original, generates three derivatives, verifies immutable collision handling and metadata. All eight retained workflow bindings pass. No staging assets were created since Oct23 in a bounded live query; this does not exclude repair/update activity. The existing Catalogue Ingestion workflow's visible latest run is Aug24. A new live R2 receipt is still required. |
| Two accounts | Candidate runtime fixtures passed | Fresh Binder and Search in-flight tests reject old A responses and edits after logout/B/A-B-A; complete pagination passes. No real two-user login or installed-phone test occurred. See client evidence. |
| Missing image | Component and repair integration passed | Actual component/detail logic handles fallback, retry, placeholder and corrected-source recovery. Actual repair library rebuilds two missing derivatives and guards the metadata update while retaining identity. Native decoding and real object/database writes remain unmeasured. |
| Price correctness/freshness | Partial identity/label pass; freshness failed | Four sampled card references retain language/finish distinctions and market-estimate provenance. Latest sampled general collection summary has389 units:371 older-priced,18 unpriced,0 fresh. Of the371,180 use exact prices and191 general estimates. This is one sampled generation, not platform-wide coverage. |
| Actual recovery | Source pass; live unmeasured | Existing storage recovery-pack and R2 rollback-journal tests passed. The named isolated restore project `krjttpmthxkfsbqksxci` is absent from the connected project's inventory. D: is unavailable. No database backup restore or file-to-metadata restore was executed. Do not substitute the active migration rehearsal database or staging itself without establishing its purpose and contents. |
| Release gates | Partial, exact revision checked | PR449's pricing job initially failed downloading ONNX during dependency installation; one retry succeeded, including all six pricing test steps. Seven Platform jobs passed; lint/type/unit remained running at the recorded check. Release-candidate gate skipped; full local Supabase bootstrap/reset step also skipped. PR446's five hosted workflows pass, while previously recorded release/API-canary holds remain. |

## Useful new finding

Valuation publication success is insufficient for price freshness. The sampled
latest general summary was calculated at15:26:26 but had zero fresh units.
Older exact prices and labelled general estimates are not current exact prices.
The source projection correctly labels the sampled quote stale; verify the
installed app does the same. Investigate provider timestamps and refresh scope
before changing freshness thresholds. Do not refresh timestamps merely because
a worker reruns.

## Prepared live upload check

The retained `catalogue-ingestion-ci.yml` workflow can run a single staging
mirror with operation=mirror, provider=pokemon_card_jp_official, language=ja,
limit=1, batches=1, mirror_concurrency=1 and report_quality=false. It retains
rights gates and writes through the normal asset pipeline. This is an object
upload onto an existing approved metadata record, not a fabricated card.

A bounded staging query found approved public external asset
`0002f513-8811-4c34-bd6d-5c9f1aefa1c8` with source
`https://www.pokemon-card.com/assets/images/card_images/large/XYP/032340_P_OROTTO.jpg`.
Before dispatch, verify its source/language joins and the actual first eligible
candidate, plus staging R2 destination isolation. Do not treat this observation
as a frozen selection: the retained workflow exposes a batch limit, not an
exact asset-ID input. After execution, use the returned asset ID to read back
original/derivative pointers, hashes, sizes, formats and identity, and retrieve
the bytes from the configured staging CDN. A no-op/reused result does not prove
a new upload.

The connected GitHub tools can read runs and rerun failed jobs but do not
expose workflow dispatch. Browser fallback reached the workflow signed out,
without a Run workflow control. The new-upload step requires authenticated
dispatch access; no live writer was launched. The R2 migration worker and
PR448 remain untouched.

## Evidence

- [Fresh client/runtime and repair fixtures](acceptance-client-followup.md)
- [Live price sample and source transformations](acceptance-prices-followup.md)
- [PR449 Platform CI](https://github.com/tberridge86/Stackr/actions/runs/40530273121)
- [PR449 pricing retry](https://github.com/tberridge86/Stackr/actions/runs/40530273145)
- [Existing upload workflow](https://github.com/tberridge86/Stackr/actions/workflows/catalogue-ingestion-ci.yml)

Additional source checks executed from the platform candidate:
`test-r2-asset-delivery.mjs`, `test-r2-writer-workflows.mjs`,
`test-r2-catalogue-rollback.mjs`, `test-storage-recovery-pack.mjs` — all passed.
Their storage/database boundaries are fixtures, not production receipts.
