# Coding and performance handoff: Home cold payload, 26 October 2026

Candidate: `D:/workspace/Stackr-home-payload-20261026`, branch `codex/home-cold-payload-20261026`, baseline `b5d643a997041db2a8c42b5b6cb0180e8ddf28e7`. The clean Build 61 checkout and the original dirty checkout were not edited. This report concerns a local candidate, not a delivered app.

## Change and ownership

Only `lib/homeSavedCollection.ts`, `scripts/test-home-saved-cache.mjs` and `scripts/test-home-saved-collection.ts` are task source changes. Home requests an explicit 20-column saved-card projection through the existing 500-row, 50-filter-ID pager. It retains IDs and aliases, language, names, image URL, set total, owned quantity, condition/grader/grade, notes, slot order and creation time. The reader materializes four null price fields before returning the complete BinderCardRecord shape; the existing private facts cache continues enforcing that boundary. Unavailable prices stay unavailable and independent pricing retains authority.

The production-shaped fixture also populates `cert_number`, `slab_image_url`, `graded_value`, `graded_at`, `owned_card_variant_id` and `lifecycle_version`. These fields are intentionally omitted from this Home display contract. No Home or Home pricing-unit consumer reads them; `snapshotBinderView` already drops them from the read-only custom binder preview. Listing certificate checks and collection export use separate explicit server reads. No caller's authoritative editable/export rows are replaced by this projection.

## Baseline and measured scope

`coding-before.txt` captures the unchanged b5 suite before runtime edits. `coding-after.txt` loads the exact historical Home/ownership/pager modules with `--baseline-facts-revision=b5d643a997041db2a8c42b5b6cb0180e8ddf28e7`. Both sides use 500-row pages. The historical normalized blobs are Home `a96e916b03b222d4e23b7794f1eb5385e2ab9a6c`, pager `be8a7d485daee66016a82f1a1e368b5642751215` and ownership `773df47496b4db3f137c6040603a0618f9a4e025`.

| Matched fixture | Cold reads before/after | Response-array bytes before/after |
| --- | --- | --- |
| Original 24-column large, 1702 saved / 1323 owned | 11 / 11 | 1,256,922 / 1,080,420 |
| Synthetic populated 30-column large, same counts | 11 / 11 | 1,743,771 / 1,080,420 |
| Synthetic populated 30-column small | 6 / 6 | 8,573 / 5,531 |
| Empty | 2 / 2 | 4 / 4 |
| Synthetic populated 30-column five-language same collector | 6 / 6 | 6,846 / 4,939 |

The original comparison is a 14.0% total facts-payload reduction. The larger 30-column reduction depends on deliberately populated synthetic metadata; it is not an estimate of production population values. Every cohort retains all saved/owned/unowned placements and all consumed field values. Actual custom binder snapshot generation is compared before/after. A separate valid-UUID, non-null notes/API aliases/grade/order/time fixture also exercises accepted custom-cache save/read parity.

The unknown-large-column regression adds synthetic unused server payload and verifies that it does not transfer or enter the retained facts. It observes actual existing owner-scoped request-cache keys and introduces no public cache. Retained notes can still make a legitimate complete result exceed the cache budget; that result is returned complete without retention. Caps 500, 100, 50 and 17 retain complete populations with 11, 36, 66 and 183 reads respectively. These are offline SDK-boundary fixtures, not production/network or image-delivery measurements.

## Compatibility and cache audit

Only exact `42703`/`PGRST204` errors naming `language`, `grade_company` or `grade` can remove a column, one at a time, for at most three retries. Compatibility is allowed only on the first saved-card query before any successful page; it cannot restart a partial scan. Available language/grade fields remain present. Unknown-column, auth, network and later-page schema failures fail closed. There is no wildcard fallback. Both error formats, each optional column, all three missing, late failure/retry and cancellation are exercised.

No additional private-cache runtime defect was reproduced, so `homeSavedCollectionCache.ts` and Hub remain unchanged. Existing owner/session/source-revision isolation, shared/sole cancellation, idle account transitions, forced refresh and defensive-copy tests are retained. New failed initial/final session checks prove a cached snapshot is not returned while identity lookup fails, followed by a valid same-owner retry. The 30-second retention TTL is not a strict maximum origin age.

## Dependency trace and limitations

Hub remotely verifies the user before facts. Inside facts, local session checks guard private cache/source boundaries while ownership performs its existing remote user check. Saved and owned reads overlap; Hub confirms the account again before publishing facts. Prepared valuation/history and exact stored-price fallback remain independent and preserve their coverage denominator. Prepared summaries cannot supply placement-level duplicate, missing-card and binder models.

Optional active-binder catalogue/branding still uses its existing full binder path; optional custom reopen warming reuses complete non-price facts. Thus these metrics cover the required saved-facts lane, not total Home traffic. No auth call, provider refresh, R2/image pointer or service was changed. Five matched cold/warm host timing pairs per cohort use a fixed 50 ms delay per request, excluding link bandwidth, hosted DB, auth transport, rendering and phone work. They show no consistent latency gain; this change claims fewer bytes, not a measured phone speedup.

Local paired and focused results are captured with the candidate; the release coordinator owns required typecheck/lint, final independent review and publication evidence. No migration/index, live data operation, deployment or native build was performed for this candidate.
