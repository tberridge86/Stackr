# Traditional Chinese set-logo public network audit

**Observed:** 12 October 2026, public endpoints only

**Scope:** current public set facts and public `set_logo` manifest rows for Traditional Chinese. No account, database, user, credential, or live-data mutation was used.

## Measured public delivery state

| Read | Result | Scope and limit |
| --- | --- | --- |
| `/v1/sets?language=zh-tw&limit=250` | HTTP 200; 83 sets; no next cursor; 342.8 ms desktop observation | The returned set records contain factual identity fields only, with no embedded logo/delivery field. |
| `/v1/assets/manifest?assetType=set_logo&limit=500` | HTTP 200; 459 global logo rows; no next cursor; 285.6 ms desktop observation | Complete in one page, therefore below the four-page audit ceiling. |
| Traditional Chinese rows in that complete manifest | 47 approved rows, each with a public delivery URL and no unavailable reason | This is 47/83 current set records (56.6%). The remaining 36 have no public `set_logo` manifest metadata. It is not evidence that those 36 were sourced but withheld. |

An earlier cold desktop observation of the same one-page manifest took **2440.5 ms**. This is one desktop request, not an iPhone/mobile-data p95. It does show that the optional two-second asset deadline can legitimately expire on a cold request, leaving factual sets visible without a manifest logo until a later successful read or cache hit.

The six bundled Traditional Chinese marks are only local presentation coverage: all six IDs occur among the 47 currently published manifest rows, but the local bundle covers **6/83** current set records (7.2%). It must not be used as a server-publication denominator or as evidence that every other set lacks a mark.

## Runtime chain checked

The facts endpoint does not embed logo URLs. `fetchCanonicalSetAssetRows` in `lib/stackrDomainAdapter.ts` calls `allPages` for each asset type and only returns each result after every cursor page completes; each lane is enclosed in `readOptionalCatalogueEnrichment`, whose child deadline is 2,000 ms. Today the `set_logo` manifest has one page, but that is still an await of the complete page before the result is merged.

The current Discover path in `app/(tabs)/explore.tsx` first reads facts with `includeAssets: false`, then starts the richer read without blocking first paint and merges it later. That preserves the set list when optional marks are unavailable. It also means logo absence on initial paint can be expected on a cold or timed-out asset lane rather than proving a missing set.

## Classification

- **Published and deliverable:** 47 set-logo rows; all approved with a public delivery URL.
- **Missing public logo metadata:** 36 of the 83 current Traditional Chinese factual sets. This audit cannot classify them as sourced, unpublished, or unavailable because no corresponding public manifest row exists.
- **Slow optional-manifest risk:** confirmed as a possible cold-request outcome by the 2,440.5 ms desktop observation; no phone latency claim is made.
- **Local bundle scope:** six exact local marks; presentation fallback only.

## Safe recommendation

Keep the current facts-first, non-blocking enrichment route. Do not add a per-card manifest request or retry loop: that would amplify requests precisely when the optional manifest is slow. If a later change is needed, it should reuse the already-started catalogue-level enrichment/cache and merge only approved delivery rows; a per-set detail may use its existing `setId`-filtered asset route. Physical iPhone testing on mobile data remains needed to establish whether the cold deadline or image decoding is responsible for any visible flash.

No source code, dependency, permission, or catalogue data was changed by this audit.
