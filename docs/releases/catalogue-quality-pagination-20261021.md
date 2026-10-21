# Catalogue quality pagination — 21 October 2026

Inspected main: `6951b9e52b01071616c7051e32e23982aa022b7a`. This is a reporting-tool repair, not a catalogue import or app release. [Machine-readable evidence](./catalogue-quality-pagination-20261021.json) freezes the enumerated set IDs and observation times.

## Verified reporting gap

The active `catalogue-ingest.ts quality-report` command explicitly defaulted to 500 rows, and `fetchCatalogueQualityReport` performed a single limited read with no exhaustion evidence. Read-only metadata scans of `ingest.catalogue_quality_report` reached an empty fifth page in each environment, using ascending immutable set UUIDs and 250-row pages, on 21 October 2026 at 13:39–13:40 UTC.

| Language | Production active sets | Staging active sets | Production sets with unknown expected card count |
| --- | ---: | ---: | ---: |
| en | 234 | 217 | 1 |
| ja | 221 | 397 | 1 |
| zh-cn | 134 | 132 | 1 |
| zh-tw | 108 | 83 | 3 |
| ko | 97 | 97 | 0 |
| Total | 794 | 926 | 6 |

Production project: `oakdbbzdqwurpjnoqhmu`; staging: `lmwfhvexfcoyeuoyrlco`. Both accesses were rechecked. The old default omitted 294/794 and 426/926 active set rows respectively. These are active canonical set populations, all tagged game `pokemon`; they are not total expected products, printings, variants, or image slots. Full live image/logo gap counts were not evaluated by these lightweight metadata scans. No records were modified.

Published membership counts were separately measured at 13:41:42 UTC: en 225, ja 170, zh-cn 185, zh-tw 83, ko 97. Membership rows can reference a different population from active canonical sets; these counts are not coverage percentages. Existing magazine/issue identities and the 81-cover scope are unchanged. No new product population is inferred.

## Narrow source repair

The reader now uses ordered set-ID pages, continuing through short server-capped pages until an observed empty page. A hard 20-query budget and 250-row page size bound work. Explicit `--limit` remains supported as a sample cap, with a one-row lookahead to distinguish truncation from exact exhaustion. `pagination.complete` and its termination reason make partial reports explicit. This is a keyset scan, not a transaction snapshot; concurrent inserts behind the cursor require a new scan.

The summary counts repeated view totals once per game/language and exposes `byGameAndLanguage` and `unknownExpectedCardTotalSets`. The view's expected-set count is a raw-provider estimate grouped only by language and reused across games. It is not a reviewed expected universe; cross-game arithmetic does not resolve that upstream denominator limitation. Expected-card totals are sums of known values, with unknown rows separately counted. Consumers must check pagination and unknown counts before interpreting totals.

Operational workflows with an explicit 500-row language cap retain that cap and now receive partial/exhaustion evidence. No workflows, source adapters, activation gates, permissions, migration SQL, commerce controls, prices or user data changed.

## Regression evidence and review

On the same synthetic 626-set fixture, the pinned original reader returned 500 rows and zero image gaps; the replacement returned 626 rows and the seven gaps deliberately placed in the tail. These seven are synthetic regression gaps, not repaired live artwork. Thirteen cases pass under Node 24.19.0 with zero network calls, including server caps, limits, empty scope, page budget, second-page errors, repeated identities, language mismatch, invalid page data, unknown card counts and grouped totals. An independent reviewer repeated the tests and found no blocking pagination defect.

The regression is included in the existing `test:catalogue-ingestion` script used by Platform CI. Local `npm run typecheck` and `npm run lint` were attempted but could not start because this isolated fixture lacks `tsc` and `expo`; they are not passes. Hosted exact-head CI remains a release prerequisite and its result belongs in the PR handoff.

## Japanese continuity and delivered sample

The existing continuity query from `japanese-source-continuity-20260910.json` was re-executed against production around 13:41 UTC: 2,294 current legacy image bases matched 2,294 manifest-eligible references. Without an immutable historical ID list, equal counts do not prove an unchanged frozen cohort. Neither count establishes all-Japanese completeness. The receipt retains source-level asset-record counts, including official Japanese, PokeData Japanese and TCGdex; stored/configured state is separate from upstream endpoint availability, which was not measured. PikaQian and all other registered lanes remain intact.

The current app path was traced from `app/(tabs)/search.tsx` through `searchLocalPokemonCards` in `lib/cardSearch.ts` to `searchStackrCards` in `lib/stackrDomainAdapter.ts`, which consumes the nested `result.card` DTO and default variant image. A production query for `SV2a 157`, language `ja`, returned the exact Japanese printing, normal variant and TCGdex image at 13:38:50 UTC. The returned search-result WebP was fetched, decoded (96×132, 3,454 bytes), and SHA-256 matched at 13:41:42 UTC. Exact printing/set/variant/asset IDs are in the JSON receipt.

Outcome denominators: 1/2 search attempts verified the expected identity; the second attempt using Python urllib returned HTTP 403. One of one attempted returned image files decoded and hash-matched. The access failure remains recorded without extrapolating to a global outage. No phone rendering, actual-device timings, provider availability rate, or catalogue-wide delivery percentage is claimed. Live Railway SHA and EAS native/OTA identity are unmeasured in this scope.

## Release handoff

Review the exact PR head and require existing Platform CI lint, typecheck, backend typecheck and catalogue-ingestion regressions. Merge this tooling-only change through the normal release-owner process; no application deployment or migration is needed. Then invoke the existing read-only quality-report command against an explicitly selected environment and save all pagination flags and group-specific results. A page-budget result must remain partial. Preserve existing source estimates as estimates and establish reviewed per-product/card/variant denominators before making completeness claims. Performance can reuse the exact Japanese DTO/image identity in this receipt; catalogue retains broader multilingual cohorts and artwork-gap enumeration as pending work. Revert the focused source commit if needed; no data rollback is required.
