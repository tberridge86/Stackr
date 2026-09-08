# Stackr integration repair — 8 September 2026

## Conclusion

The original Stackr API and saved collections are present. The reported symptoms have several causes: different release components are on different commits, Home makes excessive dependent reads, some catalogue assets are missing from the published API, and price refresh is not producing a verified sold-data feed. Combining every historical branch without checking its runtime dependencies would not solve these problems.

This repair starts from main `7ee2fa2f6491be54717c4f6e5f6415bf49270cb2` in an isolated worktree. It preserves the reviewed simplified layout, canonical API, owner recognition/teaching workflow, bundled artwork and existing release controls. It does not modify the heavily edited `D:/Stackr-1` checkout.

## Observed release split

| Component | Evidence on 8 September | Consequence |
| --- | --- | --- |
| Repository main | `7ee2fa2`, PR #147 | Includes new image rendition fallback, unpriced binder reads and printing-language filtering. |
| Production API backend | Railway deployment `3b95c056-803d-49dc-9b0e-000ea2a90e8a`, source `e3c9b00` | The #147 API language fix is not serving requests yet. A live English Pikachu search returned a Simplified Chinese printing. |
| Owner iPhone channel | `owner-recognition`, runtime `1.0.3-owner-recognition-v1`, OTA group `a4b8463e-3d10-4ba0-85ca-82f25f505748` | Build 27 receives the English-set repair; today's #147 image/Home changes and this additional repair are not published. |
| Production collection data | 45 binders, 1,601 ownership records, 1,702 saved binder-card rows, 1,323 marked owned | Missing Home display is not evidence that these records were deleted. These are database-wide counts, not an asserted total for one user. |
| Production prices | 333,585 stored snapshots; newest 7 September 18:44 UTC; zero canonical estimates, sold observations and refresh-queue rows | Stored estimates can be shown with provenance/freshness. This does not establish live last-sold coverage. |
| Family schema | `family_child_profiles` and `family_purchase_requests` absent in production | The existing staging-only adult-managed child-profile prototype is not a production child-account capability. |

## Changes in this repair

Home reads saved binders and ownership concurrently, then paginates saved binder cards. It displays those records before optional catalogue enrichment and prices. Only the selected binder's full catalogue is requested for supplementary artwork and missing-card suggestions. Read errors do not masquerade as an empty collection; unknown official-set totals do not become 100% completion.

The existing exact-identity price reader now reports progress with pending units retained in the coverage denominator. Home can show a labelled known subtotal while the rest loads. Duplicate identity lookups share one promise within that load, and superseded requests stop scheduling work. An account switch during card resolution prevents the next authenticated price read. No prices are cached across accounts by this change. Raw/graded identity, condition, language and variant constraints remain enforced; unknown prices are not converted to zero.

Tracked sets now follow the current auth account, hide old state immediately and reject delayed responses after account switches or sign-out. Card long-press hints only advertise an implemented action. Long-press and shared back-button actions use the existing rate-limited haptic helper, preserving their current destinations and card-viewer behaviour.

The currently unreferenced global-search helper now includes Simplified Chinese and tolerates a failed language lane. This is preparatory coverage, not proof of a visible improvement to the current tab search. The current tab's language-filter defect is addressed by the already-merged #147 backend change and still needs deployment.

## Requirement status and next acceptance

| Requested outcome | Present evidence | Remaining acceptance / work |
| --- | --- | --- |
| Collections and value on Home | Saved-record-first loading and partial-price progress implemented and regression-tested here | Publish the combined update; verify a signed-in large collection on build 27. Full valuation still uses individual exact-price requests; a bounded server batch read is the next major throughput improvement. |
| Card images and original API | Live EN/Chinese image samples return 200; #147 retries alternate renditions; all 81 supplied covers are in the verified local iOS export | Deploy #147 and this mobile repair. Reconcile genuinely absent exact-card assets through the existing asset pipeline. |
| All sets/logos and English support | Five language shards advertised; existing English-support helpers and bundled Japanese logo pack retained | A missing API logo does not prove a missing bundled logo. Check set identity and the actual renderer; publish exact missing assets only after that reconciliation. See the bounded probe note. |
| Fast, accurate search | Tab debounce and request guards present; #147 printing-language fix merged | Deploy the backend fix; repeat English/native-name queries, cancellation and warm/cold timings. Japanese native-name zero-result sample requires follow-up if it remains after deployment. |
| Clear scanner | Existing owner model, camera and correction/teaching flow retained; release profile unchanged | Physical-card camera testing: focus, glare, rotation, clean review, language/set/number/finish correction and private upload/withdrawal. General visual-recognition flags remain disabled; owner testing is not a general accuracy claim. |
| Haptics and long-hold orientation | Added missing feedback without replacing the existing viewer | Feel haptics and exercise hold/tilt on a physical iPhone, including reduced motion and disabled-haptics preferences. |
| Live or close-to-live values, last sold where possible | Honest stored estimates and exact-variant constraints retained | Resolve stalled refresh operations, activate a reviewed available provider lane and prove real completed-sale provenance. Do not label active asking prices or estimates as last sold. |
| Safe adults and families including children | Adult account-switch containment improved; commerce controls retained; child prototype remains staging-only | Integrate and exercise server-enforced parent/child boundaries, purchase approval, restricted communication, private profiles and report/block handling before production child access. A UI child mode alone is insufficient. |
| Simplified UI, access and navigation | Layout unchanged; shared card/back controls improved; existing Home component tests pass | Route-by-route device checks for back destinations/deep links, safe areas, text scaling and VoiceOver remain. This patch is not proof that every screen has been manually checked. |

## Verification

Passed locally: app typecheck; normal lint (zero errors, ten existing warnings); focused changed-file lint; personal-loading and Home release suites; new integration suite covering paginated saved reads, actual Home ownership/pricing helpers, partial prices/cancellation, the actual collection provider with deferred account reads, and four-language global-search failure isolation. New tests are included in Platform CI.

The production-owner iOS JavaScript export completed with 2,826 modules and 552 unique assets. All 81 magazine-cover SHA-256 hashes were found in the exported assets. Final bundle SHA-256: `5d3f194db26421ece59294aeeb19d5dc70e53f7afbda972fd24eb8c5641bf5d9`. The export emitted the existing missing local Android `google-services.json` configuration warning; this iOS-only export is not an Android build or native signing proof. The exported Hermes bundle also contains the new saved-collection and price-progress code markers.

Live probes were public reads and database SELECTs. No catalogue edits, price refreshes, remote migrations, deployment, OTA publication or production/staging jobs were initiated by this repair task. See [catalogue probe evidence](integration-catalogue-probes-20260908.md). Passing fixtures and local packaging are not a claim of live device functionality.

## Release handoff

After review and passing CI, merge this repair, deploy the existing backend-only release workflow from that exact main commit, and publish one verified iOS update through the existing owner-recognition channel/runtime. The #147 database migrations are already applied; do not recreate or replay them. Verify the served update ID and asset hashes, then exercise Home and search on build 27 before treating the symptoms as resolved.

Rollback targets: backend deployment `3b95c056-803d-49dc-9b0e-000ea2a90e8a`; owner OTA group `a4b8463e-3d10-4ba0-85ca-82f25f505748`. Catalogue completion, price-provider activation and family-account release require their own concrete, tested rollout scope.
