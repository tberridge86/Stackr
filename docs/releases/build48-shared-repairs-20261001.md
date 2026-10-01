# Build 48 shared repairs — 1 October 2026

**Implemented and locally tested client candidate. Not deployed, installed or verified on the owner's phone.** Data and authenticated valuation exceptions remain open.

## Baseline and coordination

- Installed 1.0.4 (48): `f8bf3a7c99ab1c5d4ef4420d558c4ba36d78678a`.
- Initial repair base: `f541ab797f5e0320e99152958ec4aff18b448de5`.
- Branch: `agent/release/build48-shared-repairs-20261001`.
- [PR293](https://github.com/tberridge86/Stackr/pull/293). Reconciled through main `ff187ae560f5481125eacf37b75c6472895dd06a` (PR292); publication changes must remain preserved during final integration.
- Owner authorized coordination with **Resume missing artwork list**, which is actively publishing Native97 and owns production integration. Ownership proposals, findings and the exact SV4a gap were successfully messaged. Acknowledgment of additional server metadata/pricing work is still pending.
- PR209 already documents inspection's empty mask registry/device limitations; PR219 is search cleanup without installed speed evidence. Neither was replayed. Main's PR291 touches publication tooling, not these client files.
- No production data, verified source image, card identity, holding, quantity, saved binder setting or pricing history was changed. No competing pricing system, provider or publication workflow was added.

## One issue-to-fix checklist

| Issue | Demonstrated cause | Implemented correction and scope | Remaining verification |
| --- | --- | --- | --- |
| Startup / distorted S | Build48 substituted traced vectors for the original bitmap identity; decorative dismissal waited 3,780ms plus fade, with another route minimum timer | Restore pre-PR217 design from `2319042^`, original contained bitmap assets, readiness dismissal, no artificial route minimum; preserve authentication/profile recovery and Reduce Motion | Startup tests pass; actual cold/warm startup and approved appearance need phone acceptance |
| Mew search | API returns 43 matching cards. Optional manifests could hold final results indefinitely; provider enrichment also delays completion | Canonical matches first; optional manifest work bounded to two seconds and four concurrent requests; retain matches on image failure; skip provider enrichment when images exist | Executed search tests include stalled images, early/final rows and stale queries. Precise signed-in phone failure not reproduced |
| False empty discovery | Authoritative failure plus empty fallback was accepted as no sets; languages waited together | Retryable failure instead of false empty; independent language results; preserve prior rows and show pending/incomplete status | Actual Discover callback and four-language fallback tests pass; phone discovery pending |
| Set completeness / Abyss Eye | Standard Japanese binders intentionally hide extras; M5 API has 118 cards vs printed81. SV4a separately has a real 40-card gap | Explain hidden extra cards without changing settings/ownership; retain strict completeness validation | Full cursor census below. SV4a data repair remains open |
| English metadata | Missing authoritative names: SV7a 0/94, SV4a 1/320, SV8a 0/237, M5 0/118 populated | Audited existing native/English presentation; no guessed translations or borrowed descriptive text | Existing display regression suites pass. Missing name IDs saved. Server mappings and descriptive coverage remain open |
| One long press / visible card will not inspect | Variant overlay opened details; progressive artwork did not reach inspector fields; binder language could override a mixed-language card | Tiles, showcase, variants and accessibility share one inspection request; propagate verified artwork; preserve the exact resolved variant without mutating cached printing defaults; prefer card language; bounded exact-reference recovery and useful error state | Executed ordinary/variant/mixed-language, missing detail, wrong-language, stale-response and ownership-preservation checks pass. Morpeko and phone gesture pending |
| Holo / gyro / haptics | Empty exact-mask registry suppressed coloured ordinary holo shine | Verified finishes without masks get restrained, labelled general simulated foil lighting; exact masks take precedence; unknown/nonholo/invalid identities remain conservative | Profile, haptic dispatch, motion, lifecycle and Skia CPU/WASM tests pass. Exact foil geometry and physical gyro/tactile feel remain unverified |
| White corners | Rounded containers do not necessarily clip contained card silhouettes | Shared card-shaped clipping for binder/detail, inspection, card search and set grid; source bytes/borders preserved | Component frame, source-preservation and artwork-recovery checks pass; phone edge/aspect-ratio checks pending; excessive internal image padding may need a separately reviewed crop |
| Prices unavailable | Detail adapter swallowed API errors into cached no-quote results; binder transport failures became completed reads and 401 persisted after refreshed credentials | Propagate errors to existing retry UI; bounded network retry; resume 401 after token refresh, retain 403 denial; preserve quote identity/basis and account separation | Price/cache/retry, collection valuation and Home suites pass. Authenticated phone totals and deployed worker/provider freshness remain open |

## Public delivery measurements

Read-only Windows desktop HTTPS, 1 October 2026: ten sequential requests per row, 70 total. Response bodies fully read; image bytes not saved. First means first in this process, **not guaranteed cold server/CDN cache**. Repeats comprise nine requests. These do not measure phone decoding/rendering/startup or authenticated pricing.

| Response | First ms | All p50 / p95 ms | Repeat p50 / p95 ms |
| --- | ---: | ---: | ---: |
| Mew search |675|239 /675|239 /265|
| Simplified Chinese discovery |325|325 /369|326 /369|
| SV7a first card page |359|359 /396|366 /396|
| SV4a first card page |450|376 /450|376 /393|
| SV8a first card page |334|354 /385|356 /385|
| Froakie Chaos Rising detail |324|336 /350|337 /350|
| Froakie grid image bytes |1,778|74 /1,778|74 /156|

All 70 final samples succeeded. An earlier pilot recorded an initial Mew search of 3,732ms (repeat p95 283ms). Its set/card evidence parser used the wrong response envelope: pilot parse errors are **measurement errors, not API failures**. The corrected run followed those requests and can benefit from warmed caches. A universal sub-500ms target is not established.

[Final timing evidence](evidence/build48-public-delivery-20261001.json) · [Preserved pilot with limitations above](evidence/build48-public-delivery-pilot-20261001.json).
Reproduce with `node scripts/measure-build48-public-delivery.mjs`.

## Complete cursor census and metadata exceptions

Terminal-cursor traversal, distinct printing IDs and catalogue versions recorded. Image references are not proof of every image's delivered bytes/rendering. These are selected regression sets, not a catalogue-wide percentage.

| Language / set | Cards / recorded total | Image references | API English names | Full traversal ms |
| --- | ---: | ---: | ---: | ---: |
| Japanese SV7a |94 /94|94|0|211|
| Japanese SV4a |320 /360|320|1|6,801|
| Japanese SV8a |237 /237|237|0|8,444|
| Japanese M5 Abyss Eye |118 /118|118|0|1,961|
| English me04 Chaos Rising |122 /122|122|122|3,050|
| Simplified Chinese cs1bc |199 /199|199|199|4,362|
| Traditional Chinese SVAM |25 /25|25|0|706|

SV4a missing numbers: **127–146 and 148–167**, 40 numbers. An independent `limit=500` read also returned 320 with no cursor; a client page-size change does not restore them. Do not equate this with any historical “last 40” without matching records.

All seven sets have English set names. Only 322 of 1,115 sampled printing records have API English names; runtime verified name fallbacks can differ. Supertype is populated throughout, subtype arrays empty, artist coverage variable, attacks/rules absent from all sampled API details. Those are separate metadata categories. The named fields are not evidence of complete English descriptions.

[Full census, missing-name IDs, page timings and versions](evidence/build48-set-delivery-20261001.json).
Reproduce with `node scripts/audit-build48-set-delivery.mjs`.

## Verification and delivery gates

Locally passed: TypeScript; lint (0 errors, 10 existing warnings in unchanged files); startup; complete card-inspection suite including 31 motion cases, 20 lifecycle cases and 25 Skia rendering cases; personal loading/search and new build48 delivery controls; binder image/fallback, variant/artwork, foreign picker, visible-price and personal-price identity; foreign/native display; preferred artwork; 13 facts-first retrieval, 18 reopen/SQLite and 12 parallel-read checks; collection-pricing UI and Home release suites. New delivery tests are in the existing CI-invoked personal-loading script.

Lifecycle native boundaries are mocked; Skia runs CPU/WASM. Review/CI, actual deployed/build identity and physical device acceptance are separate gates. No mobile or production release was launched here. The release owner should integrate through the existing PR/release process, choose the next build number and record exact served source/update identities.

Initial CI run36864067257 found an outdated source assertion expecting the two-argument manifest call. The call now includes the cancellation signal. Updated that assertion without removing the identity check; the complete API integration/transport/cache suite passes locally. The following CI run exposed an image-test dependency mock missing the shared sizing module; corrected it and added actual component layout/source-preservation checks. Updated the controlled-image source assertion to retain the existing approved overlay inside the new bounded read. Both full artwork recovery and controlled-image suites pass locally. The replacement GitHub run must pass before integration. Independently verified all three committed JSON receipts against the SHA256 manifest.

## Phone test sequence for the integrated candidate

Release-owner review found and corrected a startup accessibility regression before the next build: animations now wait until the system explicitly reports that Reduce Motion is off. A pending, enabled or unreadable preference keeps the loading artwork static. The CI-wired asynchronous component test covers each path. The card-shaped image override also explicitly clears inherited opposing edges; its merged-style test verifies the intended dimensions and position. This is layout-source evidence, not a claim of a reproduced physical-phone failure. Existing restored bitmap artwork, readiness dismissal, saved preferences and original card image bytes are preserved. These reviewed changes require replacement CI at the final PR head before the next normal TestFlight candidate is built.

1. Record build/update identity, phone/iOS and network. Five force-closed opens and five normal opens: original S/animation, time to usable Home, no wait after readiness.
2. Search **Mew** for individual cards; open **SV7a, SV4a, SV8a** and both Chinese discovery filters. Record first/repeat time and counts. SV4a must remain explicitly incomplete until repaired.
3. **Abyss Eye**: distinguish standard 81 from full 118 without automatic settings changes. Compare native identity and English labels with API evidence.
4. In ordinary, variant and mixed-language binders, one hold on **Morpeko** and **Froakie #088 Chaos Rising** opens inspection. Check shine, tilt and haptics separately; also test nonholo.
5. Check corners at tile/detail/inspection sizes. Toggle Reduce Motion and haptics; respect preferences, retain normal ownership taps.
6. Same-account Home/binder/card values: match quantities, condition, finish, currency and estimate labels; retry after network interruption; record missing reasons and first/repeat price timing.

**Still open:** reviewed release delivery; SV4a 40-card data gap; authoritative English names/descriptions; authenticated pricing and worker/provider checks; exact foil masks/source-padding exceptions; phone acceptance and full retrieval target. Adjacent artwork publication remains separate.
