# Home cold retrieval release evidence - 25 October 2026

This is the next bounded improvement on the existing draft PR #439. Home requests larger, bounded pages for its complete saved/owned facts. It changes neither the required result set nor the public catalogue/R2 delivery path. Release remains gated on scoped delivery and actual device acceptance.

## Source and scope

Canonical starting source: 1134846c535a687e1afdc2e7f898ef6fd2d1606d; local equivalent baseline: 53ab596156037c560c2776eb55ab02c66d90c40e. Current integration branch is codex/architecture-integration-20261024, main is 6dfe188166df76b41d44801ab66970b0a3881ae5. Source for this change is the containing commit; final exact source/CI receipt is linked from PR #439 and the original checkout's home-cold-retrieval-handoff-20261025.md. The isolated candidate is D:/Stackr-1/work/collection-summary-20261025. Original unfinished work and twelve local-only canonical PNG test fixtures are preserved.

Changed runtime: lib/homeSavedCollection.ts, lib/uiCollectionPages.ts, lib/ownership.ts. Home opts into a 500-row page budget. Other callers retain 50-row defaults; IN-filter chunks and total row budgets are unchanged. Both pagers advance by actual returned rows and require an empty page to prove exhaustion. Lower server limits do not truncate results. Foreign rows, malformed pages, duplicate identities, account changes and cancellation retain their existing guards.

The previous prepared valuation provides totals, coverage, binder summaries and trend; it lacks complete placements, duplicate/missing-card display facts and active-binder records. Replacing the facts scan with that response would lose Home behaviour. This change therefore reduces the repeated round trips and query executions without adding an aggregate, index, service or schema dependency.

## Actual Home path

Home verifies the account, fetches saved binders, overlaps complete saved and owned paging, reads local master/name/art preferences, derives binder/duplicate/missing-card models, rechecks the account, then publishes facts and obtains prepared valuation/history. Exact stored-price fallback remains conditional on missing prepared routes or coverage that would discard retained evidence. The outer Home account verification still exists; loader SDK call counts are not a full-screen network count.

Optional selected-binder catalogue/branding and warming remain separate. Chase/activity and Minty enrichment start after interactions plus a short delay; uncached Minty can call its Edge Function. Market Movers navigates to value-history; the traced initial Home facts path does not issue a movers request. Images load through existing references independently of these Data API pages. This patch does not claim to reduce all auth, valuation, history, insight or image work, or change when the first usable screen paints.

## Measured retrieval work

| Client fixture | Cold reads before / after | JSON bytes before / after | Immediate warm reads |
| --- | ---: | ---: | ---: |
| Empty | 2 / 2 | 4 / 4 | 0 / 0 |
| Small, 8 saved / 6 owned | 6 / 6 | 6341 / 6341 | 0 / 0 |
| Large, 1702 saved / 1323 owned | 66 / 11 | 1256977 / 1256922 | 0 / 0 |
| Five languages, 5 saved / 5 owned | 6 / 6 | 5451 / 5451 | 0 / 0 |

The large candidate reads 2 binder, 4 ownership and 5 saved-card pages, retaining all 379 unowned placements. The large cold loader's SDK getSession calls fall from 80 to 18; getUser remains 1 in this subset. SDK calls are not necessarily network requests. Immediate warm reuse already existed at the starting candidate, so this patch gets no credit for that earlier improvement. At server caps 100, 50 and 17, the complete candidate needs 36, 66 and 183 reads respectively.

## Measurement conditions

See evidence/home-cold-retrieval-20261025/measurements.json and client-comparison.txt. The harness executes actual source modules, replacing native/auth/transport boundaries with deterministic fixtures. Baseline modules are read from the exact local baseline and their normalized Git blob IDs match canonical 1134846c. Response bytes are UTF-8 JSON arrays, excluding headers, TLS, compression, auth, pricing, metadata and images. Timed samples add 50 ms per Data API read and include JavaScript work; they are not hosted or device latency. The shared timing cohort and per-sample returned/transport row assertions prevent unequal-fixture comparisons.

The 66-read baseline is the complete collection-facts subset of Home, not total screen traffic. The hosted row cap is unverified. Local config declares max_rows=1000; this is not hosted configuration evidence. Five hundred is a bounded request budget, not an assumption that every server returns that many rows. Payload remains essentially unchanged: the 55-byte large-fixture difference is JSON array framing only.

| Matched timed client cohort | Cold median ms before / after | Warm median ms before / after |
| --- | ---: | ---: |
| empty | 63.82 / 54.78 | 0.18 / 0.22 |
| small | 222.31 / 226.35 | 0.22 / 0.24 |
| large-1702-saved-1323-owned | 2192.39 / 424.08 | 3.62 / 3.56 |
| five-languages-same-collector | 217.66 / 222.09 | 0.21 / 0.21 |

Five matched samples per cohort, Windows / Node v24.15.0, 50 ms artificial delay per Data API read, cap500. Raw samples are retained. Small timing differences are host noise; no warm speedup is claimed. Independent review found unequal fixture sizes in the first timing draft; that comparison was withdrawn and replaced by this asserted, matched-cohort run.

## Cache and account safety

The existing complete owner/revision facts cache and 30-second retention remain unchanged. That retention is not a promise of maximum origin-row age. Explicit refresh bypasses facts and binder-list reuse; edits, logout/account changes, expired facts and superseded requests retain existing invalidation. Facts exclude live price values. Oversized snapshots return complete results and bypass retention. Public catalogue caches are not used for these private facts; legacy, R2 and private URL fields remain exact and cannot cross the tested owner boundary.

Regressions cover full-field parity, unowned placements, five languages with the same collector reference, lower row caps, duplicate/foreign data, edits, TTL/manual refresh, shared and sole cancellation, late writes, failures/retry and account changes. Actual Home runtime tests cover offline preview, retained valuation quantities, independent failures and blur/remount races. No new cache mechanism was necessary for this page-budget change.

## Database evidence

The local PGlite harness executes EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) against representative synthetic schema/RLS and existing index shapes. It records estimated and actual plans separately, first/last/terminal pages, returned counts and cumulative query execution time. Cohorts contain 0, 24, 1702 or 250 rows per source plus 10000 foreign rows per source. This differs from the client large cohort of 1702 saved/1323 owned. Only the requested LIMIT changes from 50 to 500; filters, ordering and projections remain identical. No remote execution analysis was run. Plans justify reducing repeated executions, not a speculative production index. Raw plans are in query-plans-50.json and query-plans-500.json.

| Local plan fixture | Saved / owned executions, page50 to page500 | Cumulative saved / owned execution ms, page50 to page500 |
| --- | --- | --- |
| Empty | 0 / 1 to 0 / 1 | 0 / 0.218 to 0 / 0.223 |
| Small, 24 per source | 2 / 2 to 2 / 2 | 0.745 / 0.383 to 0.770 / 0.350 |
| Large, 1702 per source | 36 / 36 to 5 / 5 | 80.875 / 58.686 to 15.502 / 13.978 |
| Multilingual, 250 per source | 6 / 6 to 2 / 2 | 2.786 / 2.605 to 1.012 / 1.155 |

These are sequential local runs, one per page budget, after client timing completed. Cumulative milliseconds are observed totals, not repeated-sample medians or production predictions. For example, the 24-row saved first page estimates 12 rows and actually returns 24; the 250-row saved page500 plan estimates 125 and actually returns 250. Raw plans preserve estimation error rather than presenting estimates as executed counts.

## Qualification and delivery

The starting 1134846c candidate was rechecked mergeable with all five workflows passing. New-source exact-head checks must be read from the final publication receipt; old CI cannot qualify a new commit. Local validation and independent review details are recorded in the adjacent provenance and audit reports. The deployment gate is not equivalent to CI or a web export.

Fresh read-only migration ledger: 191 entries, latest 20261005205507. Profile 20261025154000 and separate daily-movers 20261022064554 are absent; ledger absence alone does not prove the functions are absent. The Profile SQL remains unchanged and separately gated. Do not apply the migration backlog.

Latest successful backend/gateway release logs were reread: backend source 7c1acd409680b38d5913d8cae76df560b5d91daa, deployment dfc23b30-9675-4ba0-ad2b-9f1875302747; gateway source 4e405d7b95dce08d71bdbd42ad5e4e6f3b829a07, Worker 56f04b7f-0692-4d8f-a9ae-0963442e57b8. These are release receipts, not a fresh served-source attestation. Direct health/EAS readback was inaccessible from this execution environment; that is not evidence of an outage.

Correction: iOS workflow 39558210992 was VERIFY_ONLY:true. It did not request a native build. The separate historical Build 60 /1.0.6 receipt names EAS 23565784-9fa5-4f9c-ae48-2376756891fb at source 311fc84a95de4c730b61473f891079547d1a9b6f; this does not establish a fresh installation. Public monitor 40215560295 passed, but neither private Home nor phone acceptance follows from that.

No live migration, deployment, app build/publication, price refresh, schedule change or R2 operation was performed. R2 immutable originals, pointers and rollback receipts are untouched. Use the scoped [release approval package](home-cold-release-approval-20261025.md) and [device checklist](home-cold-device-acceptance-20261025.md). No new database/backend/gateway release is required by this cold Home patch; the combined candidate's earlier work still has its own gates.

Rollback the client change through the existing app delivery lane to the recorded compatible prior app/update. A source revert alone does not roll back an installed device. There is no Home schema rollback. The separate Profile function/ledger rollback is specified in the approval package.

## Prioritised remaining work

1. Finish scoped Profile/client rollout, attest served versions and installed device; keep the separate daily-movers migration excluded.
2. Measure actual hosted row cap and private Home requests, bytes, first usable facts/value and complete settlement on representative accounts. At cap50 this improvement cannot reduce reads.
3. Use those measurements to decide whether prepared valuation should start earlier or a compact facts contract is justified; preserve duplicate/placement/master behaviour and conservative price coverage.
4. Investigate catalogue cache freshness and actual hosted query plans only where measurements identify remaining work.
5. Job reliability, monitoring and database/asset recovery remain queued. Do not change production ownership or schedules as incidental cleanup.
