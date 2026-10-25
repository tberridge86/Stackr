# Collection summary infrastructure candidate — 25 October 2026

## Result and scope

The first improvement replaces Profile's full collection-summary scans with one authenticated PostgreSQL aggregate. Home uses a separate prepared-valuation path and is not changed by this candidate.

The function derives the owner from `auth.uid()`, runs with caller privileges and existing RLS, and explicitly excludes another owner's publicly visible binders. It returns complete counts, completion and conservative stored raw-card estimate coverage. It does not read image bytes, call price providers, change catalogue rows or intervene in R2 activity.

The client keeps an older-database compatibility path only for a specifically missing RPC. Authentication, permission, malformed-response and timeout failures do not silently fall back. It retains scoped caching and rejects obsolete account/version results.

## Measured request and response work

The historical implementation is the exact `lib/collectionSummary.ts` from PR #439 head `985e62290a208b5b3f5d8699d9171e8b14cca59a`, Git blob `05960d7bb783d0f3d775d763e4f2491fc9b591c0`.

The harness executes the actual summary, binder and ownership modules, with native storage and Data API transport replaced by deterministic fixtures. The aggregate itself executes in PGlite PostgreSQL. Counts and completion are compared on identical seeded populations.

| Fixture | Original data reads | Compact reads | Original response-body bytes | Compact response-body bytes |
| --- | ---: | ---: | ---: | ---: |
| Small mixed ownership | 10 | 1 | 3,129 | 550 |
| 1,003 saved placements, including duplicates | 30 | 1 | 496,050 | 550 |
| 1,003 distinct holdings | 69 | 1 | 394,422 | 570 |
| Five languages plus a wrong-set reference | 7 | 1 | 2,517 | 549 |
| Legacy empty finish in a master set | 11 | 1 | 1,145 | 551 |

The original 22-request figure describes only the saved-placement pages in the second fixture. Binder, ownership and metadata reads bring its total to 30. A subsequent fresh memory-cache read performs zero Data API requests.

These byte counts exclude transport headers, TLS and request bodies. Compact byte length can vary slightly with the generated timestamp; the independent SQL run returned 571 bytes for the distinct-holdings cohort. In-process seeded-database first-call and warm-query timings are recorded separately. They are not phone latency, production cold starts or hosted database performance. Comparable original hosted database work/latency remains unmeasured; no speed multiplier is claimed.

## Correctness change to valuation

The old summary could price graded slabs using raw-card guides and could borrow a price from a different set when a card ID matched. The candidate removes those unsupported contributions instead of institutionalising them in SQL.

Valid raw estimates retain a fixed USD-to-GBP conversion of 0.79 and are explicitly labelled as stored raw estimates with unknown freshness. Slabs, unsupported conditions, ambiguous finishes/editions, conflicting languages and absent exact metadata remain unpriced. A known zero quote is distinct from an unavailable value. Holdings counts remain complete even when valuation coverage is partial.

The legacy graded-placement fixture changes from £72.68 to £17.38 because four graded copies have no supported slab valuation. The separate raw-first-edition fixture preserves its £15.80/unit estimate. This is a correction to an unsupported estimate, not a measured market-price change.

## Source and validation state

- Existing integration: [PR #439](https://github.com/tberridge86/Stackr/pull/439), branch `codex/architecture-integration-20261024`.
- Local isolated candidate: `D:/Stackr-1/work/collection-summary-20261025`.
- Local comparison baseline: `1061469237f6fbced31a031383c266e44ac2d10a`.
- Exact current source/deployment provenance: [collection-summary-provenance-20261025.json](collection-summary-provenance-20261025.json).
- Independent review: passed after fixing a final-session invalidation race and empty legacy-variant completion mismatch. The reviewer independently reran the full focused summary suite; no remaining actionable findings.
- `npm run typecheck`: passed.
- `npm run lint`: passed with zero errors and eight existing warnings. Targeted lint of task files passed with five existing Profile warnings.
- Actual PostgreSQL/RLS/privilege fixtures, compact/compatibility and exact historical-source comparison, cache/account/timeout tests: passed.
- Profile load-state and ownership pagination regressions: passed.
- Detailed outputs: [evidence/collection-summary-20261025](evidence/collection-summary-20261025/). New tests are wired into the existing CI `test:personal-loading` command.
- Hosted exact-source CI and installed-device checks: pending.
- Root/backend/gateway deployments, remote SQL, provider jobs and R2 changes performed by this task: none.

The local source snapshot excludes large assets/native material and reuses existing dependencies; it is not a fresh locked-install CI environment.

## Release sequence and rollback

1. Reconcile the existing integration PR with current main, preserving the separately merged R2 fixes. Require exact-source hosted CI; previous commits' passes do not certify this candidate.
2. Live metadata confirms the five required tables, expected referenced columns/types and RLS enablement. Verify actual caller grants and policy behaviour and inspect representative hosted query plans before activation.
3. Apply only reviewed `supabase/migrations/20261025154000_collection_summary_v1.sql` through the existing approved database release lane. Do not apply the entire pending integration migration backlog as an incidental step.
4. Validate authenticated compact responses for two different accounts, foreign public-binder exclusion, complete counts and exact price coverage. Measure first/warm reads without provider refreshes.
5. Deliver the compatible client through the established app release lane and verify Profile on device, including an edit, offline reuse and account switching.
6. Record database version, client build/update, exact source, CI and device evidence together.

The migration only adds a read function and execute permissions; it does not mutate collection/catalogue data. Client rollback restores the previous app revision. Database rollback can remove the exact new function through the reviewed database lane after dependency checks; the candidate client recognises a missing RPC and retains its bounded compatibility path. An execution-denied function is deliberately an error, not a fallback.

## Prioritised follow-up

1. Profile live query-plan and on-device acceptance, then Home's separate valuation/summary request costs.
2. Measured public-edge and account-specific cache behaviour with edit invalidation.
3. Query-plan-backed database improvements; no speculative indexes.
4. Worker scheduler ownership, durable job claims and bounded retries, independent of the active R2 process.
5. Outcome monitoring for price freshness, image failures and first usable content; verify alert delivery.
6. Combined database/asset restore rehearsal and exact release-version reconciliation.

A successful public monitor is service-health evidence only. Neither local fixtures nor a healthy endpoint closes the existing device repair register.
