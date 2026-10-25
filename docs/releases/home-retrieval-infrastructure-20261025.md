# Home retrieval candidate - 25 October 2026

State: implemented, locally validated and independently reviewed. The existing draft PR remains the release surface; exact-source hosted checks are linked there. No deployment or phone acceptance is claimed.

## Scope and current state

This change targets Home's saved collection facts and the request generations that consume them. It preserves the earlier Profile aggregate candidate in the same integration. It does not introduce a valuation authority, change the pricing pipeline, migrate assets, or change a production schedule.

The authoritative remote integration is PR #439, branch `codex/architecture-integration-20261024`. Its starting head was `f1ffcb499c39fdd7642d8d80d67829691a6e94ba`. The independently checked main branch was `6dfe188166df76b41d44801ab66970b0a3881ae5`; the PR payload's `base_sha` of `7e22cee8...` was historical, not the current main head.

The canonical reconciled baseline is `17b5d075136ddc28e4c12134993c290719f3c595`, directly based on the verified main head. GitHub reports it mergeable. The previous integration head is preserved on `codex/architecture-before-home-20261025`. Home is appended to this same branch.

Local candidate: `D:/Stackr-1/work/collection-summary-20261025`. Local reconciled baseline: `6ab9f7b7a9da759fbd84130f3ee0ba8e916de4c0`. The original working checkout and architecture worktree were preserved.

All 35 main-side changes since the common ancestor were reconciled, including the R2 migration/recovery work. Independent review verified 28 exact normalized input matches and seven expected combinations with existing integration changes. Workflow conflicts were resolved by preserving both test sets and correctly combining step-local R2 bindings. No workflow was dispatched. The current staging preflight remains intact.

## Home read trace

| Path | Existing behaviour | Scope of this change |
| --- | --- | --- |
| Initial/focus collection load | Authenticate; restore scoped display independently; read binders and ownership, then all saved pages; build facts; read prepared valuation and history | Reuse complete facts briefly and overlap independent saved/owned reads |
| Return navigation | Repeats collection loading for the new focus | Fresh facts can be reused; authentication and prices remain independent |
| Chart range | Invalidates prior display request and repeats collection loading | Same facts may serve the new range; obsolete results must not publish |
| Three-minute stored-price poll | Reads stored collection/price state again | Expired facts still refresh; the 30-second cache does not suppress this poll |
| Collection/binder edits | Existing mutations bump collection revision | Invalidate facts and restart active Home work; reject obsolete writes |
| Pull-to-refresh | Existing stored/provider refresh controls and other Home sections | Explicit facts refresh bypasses a previous cached or in-flight generation |
| Activity, chase, insights | Separate deferred loaders; optional catalogue/image enrichment | Remain independent of the saved-facts cache |
| Market/history data | Prepared valuation/history or existing stored-price fallback; catalogue movers are a separate path | No new caching or weakening of price coverage |

Private saved rows remain owner-scoped and are not placed in a public catalogue cache. Legacy and R2 URLs remain references; no image bytes or object pointers are changed.

## Before measurements

The baseline harness runs actual Home saved-loader, binder, ownership, paging, request-cache and deadline modules. Only transport/native dependencies are deterministic fixtures. Response bytes count Data API JSON bodies, excluding request bodies, TLS/headers, auth traffic, prices and optional enrichment.

| Collection fixture | First data reads | Immediate repeat reads | First body bytes | Repeat body bytes |
| --- | ---: | ---: | ---: | ---: |
| Empty | 2 | 1 | 4 | 2 |
| Small: 8 saved, 6 owned | 6 | 4 | 6,341 | 5,738 |
| Large: 1,702 saved, 1,323 owned | 66 | 64 | 1,256,977 | 1,256,374 |
| Five languages with matching collector numbers | 6 | 4 | 5,451 | 3,936 |

The large case includes all 379 unowned placements. Original first reads are two binder pages, 28 ownership pages and 36 saved-card pages. An empty page proves exhaustion; a smaller server cap cannot silently truncate results.

A held ownership response confirms the original saved paging waits for ownership even when binders are already ready. Overlapping these sources removes that dependency without changing which rows are returned.

## Implemented behaviour and repeat-read result

Complete Home facts have a 30-second retention TTL under an authenticated owner and collection revision. This is not a maximum origin-row-age guarantee: ordinary reads may reuse the existing owner binder-list cache. Explicit refresh also evicts that list; local mutation paths retain their existing binder invalidation. Local edits and manual refresh supersede earlier work. Idle logout/account changes clear reuse, and shared reads stop when their last consumer cancels. A cancelled consumer does not cancel another current consumer.

Cold saved-card paging starts when binders are ready, concurrently with ownership paging. Returned snapshots are defensively copied; legacy provider price fields are excluded. Large snapshots above the retention budget are returned completely but not cached. Prepared valuations, prices, authentication and optional enrichment are separate reads.

| Collection fixture | Original immediate repeat reads | New immediate repeat reads | Original repeat body bytes | New repeat body bytes |
| --- | ---: | ---: | ---: | ---: |
| Empty | 1 | 0 | 2 | 0 |
| Small | 4 | 0 | 5,738 | 0 |
| Large | 64 | 0 | 1,256,374 | 0 |
| Five languages | 4 | 0 | 3,936 | 0 |

With 102 saved and 63 owned rows, five samples on Windows/Node 24.15.0 with an artificial 50 ms delay per Data API read measured median complete-facts time of **395.1 → 341.1 ms cold** and **400.3 → 0.8 ms immediately warm**. These include JavaScript and host scheduling, exclude rendering/auth/pricing/enrichment and are not hosted or phone latency. A held ownership response now allows two saved-page dispatches before release (previously zero). First usable screen time remains unmeasured on a device.

Reproduction: obtain `lib/homeSavedCollection.ts` from canonical baseline `17b5d075136ddc28e4c12134993c290719f3c595` (blob `135f1f7222498264ae69ef67db084c58628f41b4`) into a temporary file, then run `node scripts/test-home-saved-cache.mjs --baseline-home-saved=<file>` from the repository root. Structured output and source hashes are in `evidence/home-retrieval-20261025/measurements.json`.

These are saved/ownership/binder Data API reads only. First-load counts and response bytes remain unchanged. Expired caches, explicit refresh and oversized-cache bypass still perform full reads. No screen-wide zero-request or universal sub-100 ms claim is made.

## Database evidence

`scripts/measure-home-facts-query-plans.mjs` executes `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` only against local in-memory PGlite. It records estimated costs and actual execution for every paginated read, retaining first, last data and empty-proof plans. No hosted SQL is run.

The local fixture uses relevant schema columns, existing composite index shapes and owner/public RLS models; it is not an attestation of the entire live schema, policies or row widths. Each source also has 10,000 foreign-account rows. Complete expected counts are asserted.

The plan cohort has 1,702 saved **and** 1,702 owned rows, deliberately separate from the client request fixture above. Its 36 saved-page executions totalled 88.205 ms; 36 owned-page executions totalled 63.660 ms in the recorded local run. These are cumulative database execution times, not screen latency or a production benchmark. No new index is justified or introduced by this evidence. Avoiding a valid repeat read avoids its page executions; cold/expired reads retain the same complete query shapes.

Independent review corrected the harness to advance by actual returned rows, matching the client; terminal offsets now include 24 and 1,702 rather than rounding to the next page boundary. The corrected script and evidence passed independent rerun.

## Validation and delivery

Detailed source/deployment readback: [home-retrieval-provenance-20261025.json](home-retrieval-provenance-20261025.json).
Local evidence directory: [evidence/home-retrieval-20261025](evidence/home-retrieval-20261025/).

Completed local checks: `npm run typecheck`; `npm run lint` (zero errors, eight existing warnings); targeted lint (zero errors, two existing duplicate-import warnings); `npm run test:home-retrieval`; `npm run test:collection-summary`; `npm run test:english-set-visibility`; and the local query-plan harness. Local dependencies were reused; hosted CI supplies a fresh locked installation.

The Stackr reviewer independently reran Home retrieval and English-set identity checks and found no remaining actionable issue. Review resolved two P2 races: a deferred edit reload surviving blur/refocus, and an old unmounted screen deleting a newer persisted snapshot. The owner-wide bounded write queue and focus/account/session/source guards have real Home runtime regressions. Complete results, five-language identity, account switching, idle logout/login, expiry, edits, manual refresh, shared/solo cancellation, offline preview, failure retry, large-snapshot bypass and legacy/R2/private URL isolation are covered. An updating prepared valuation retains its own quantities and an explicit previous-valuation warning, including when a refresh report exists.

Reconciled baseline hosted CI passed gateway, pricing identity, card UI and binder retrieval. Platform CI exposed an existing test synchronization assumption in the English-set cache test. The fixture now awaits the actual transport-start signal before invalidation; the late-response assertion is preserved and independently passes. Final containing-commit workflow results are maintained on [PR #439](https://github.com/tberridge86/Stackr/pull/439); the publication receipt records their exact commit/run IDs. No CI workflow was manually dispatched.

The read-only migration ledger still contains 191 entries, latest `20261005205507`. Neither the prior Profile migration `20261025154000` nor daily movers migration `20261022064554` is recorded. Home's facts-cache change requires no database migration.

A fresh successful Production API Monitor at 17:16 UTC covers public endpoints and a public R2 image, not private Home behaviour or the currently served source revision. Fresh workflow listings still identify the latest successful backend source as `7c1acd409...`, gateway source as `4e405d7b...` and iOS build source as `311fc84a...`. Exact IDs and limitations are in provenance. Direct runtime attestation was unavailable from this environment.

## Rollout and rollback

1. Completed: previous integration head preserved, source reconciled onto verified current main, existing PR retained as the review surface. Recheck main/head before promotion.
2. Require hosted checks on the exact final source. Local dependency reuse is not a fresh locked installation.
3. Use established release approvals. Do not sweep the pending migration backlog into a client release. The Home change has no migration; Profile's aggregate is a separately prepared database change with an older-database fallback.
4. On a phone, verify cold launch, return navigation, range switch, edits, pull-to-refresh, offline/online recovery, logout/account switching and legacy/R2 images. Measure first usable content and cold/warm reads separately.
5. Link the delivered app/update, backend, gateway and database versions in the shared release record.

Rollback the client through the existing release lane to its recorded prior app/update. No database, asset pointer, source original or schedule rollback is needed for this Home change. Prior Profile migration rollback remains documented separately.

## Remaining priorities

1. Finish release gates for the combined candidate: exact-source hosted CI, approved delivery and phone acceptance; complete the previously prepared Profile database rollout separately.
2. Measure cold Home authentication, prepared valuation/history and optional catalogue enrichment under real conditions. Warm facts reuse does not eliminate those calls or cold collection scans.
3. Public catalogue cache behaviour and invalidation; hosted query plans before any database index or query redesign.
4. Scheduler ownership, durable claims/retries and explicit failures; operational monitoring; database/asset recovery rehearsal remain queued.
