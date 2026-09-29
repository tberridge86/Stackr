# Stackr remaining work — 29 September evening

For the owner-facing summary and the exact outstanding logo/set list, use the [plain-English report](october-1-plain-english-status-20260929.md). PR255 is merged; [run 36621263622](https://github.com/tberridge86/Stackr/actions/runs/36621263622) has resumed the frozen artwork batch. The older failed-run figures below are preserved evidence, not a current upload counter.

## Single publication owner

The owner requested continuation in **Resume missing artwork list**, including reuse of work from **Greeting exchange** without duplication. Greeting exchange's available history contains a status audit of run 36540630666, not an additional publication or new prepared package. A coordination message has requested existing evidence only and no duplicate acquisition/publication. The separately mentioned **Casual greeting** chat is not visible in the available chat list; its link has been requested. Its work is not assumed stopped or imported.

Continue the existing protected `artwork3303` lane only. Its production-deployment concurrency group serializes runs; check for another active run before dispatch. Preserve exact archives, immutable keys, verified files, canonical metadata, prices and holdings. Do not restart image acquisition or replay historical metadata imports.

## Delivered and retained

- All 677 signed-off canonical set/product operations remain present; 675 retain their recorded metadata and two have reviewed later anniversary totals.
- The stored-details API correction is live: 57,436 published printings / 76,272 variants match stored metadata with zero parity mismatches. This includes stored nulls; it is not universal field completeness.
- All 480 Storm/anniversary cards pass public set identity, metadata and artwork-reference checks. Twelve settled card-detail responses and twelve original-image byte hashes also pass.
- Reviewed source changes are merged through PR254; historical drafts already integrated into newer main must not be replayed.

## Remaining list

| Work | Measured position | Completion evidence |
|---|---|---|
| Approved recovered artwork | 7,911 fronts / 23,733 derivative references prepared. Failed run has 3,275 verified files of 31,590 planned storage objects; **0 cohort assets/links published**. These are file counts, not card counts. | Recover the observed HTTP 520 retry gap, complete uploads, publish the associations atomically, verify final receipt and public API/manifest delivery. |
| Artwork outside that approved batch | 4,250 cases from the frozen 12,161-case artwork worklist. | Resolve each source/identity case before adding a separately verified cohort; do not mark these complete when the 7,911 publish. |
| New set checklists | 94 of 102 newly created sets remain unpublished with zero canonical cards; 8 have published cards. | Source and reconcile real checklists; preserve set IDs/names and publication guards. |
| Pricing delivery | Existing pricing/valuation fixes are merged; newer backend and refresh-worker delivery is not verified. Last known provider-account rejection was an expired Railway trial on September 27. | Confirm restored deployment access, deploy through existing lanes, verify worker persistence and reconcile owner totals. No paid-plan change is authorized. |
| Search exceptions | English EN30C `R` is below the search minimum; Japanese M6a `WAT` returns no result. Both cards are available by ID/set list. | Correct selected-set collector-code retrieval and verify both identities without broad search redesign. |
| Logos and covers | Existing Chinese/Japanese logo checks and 81 CoroCoro-cover checks passed; Seven additional Chinese mappings are prepared (130 total); seven supplied images still need exact links, and 30thD needs a verified source. See the additive logo receipt. | Resolve exact mappings with evidence; confirm installed rendering. Existing source tests are not a catalogue-wide 99% measurement. |
| Retrieval performance | Repeated API requests are fast in the recorded sample; some first requests exceed 0.5 seconds. | Measure actual first/repeat API and installed-screen requests, then address demonstrated delays. No universal sub-0.5-second claim. |
| Native release and device acceptance | Latest verified production artifact is build 46. October 1 continuation is scheduled. | Verify delivery dependencies, build the exact reviewed source with the normal production profile, submit via existing TestFlight, then check metadata/images/values, haptics, gyro, reduced motion and camera on the phone. |

The 4,250 artwork cases and 94 incomplete set checklists describe different populations and must not be added together as a card-gap total. See the [artwork exception register](artwork4250-exceptions-20260928.json.gz), [new set status](october-1-new-metadata-set-status-20260929.json) and [API acceptance evidence](october-1-api-acceptance-20260929.md).

## Failure and recovery evidence

[Run 36540630666](https://github.com/tberridge86/Stackr/actions/runs/36540630666) failed before publication on HTTP 520. Its artifact checksum was independently verified; [the bounded receipt](artwork7911-storage-recovery-20260929.json) distinguishes attempted, verified and newly created files. The retry fix retains four attempts and the existing 1/2/4-second delays. A successful retry can return a duplicate object response after an ambiguous write; the caller still requires the original hash and dimensions to match before publication. Permanent failures and exhausted retries still stop the batch.
