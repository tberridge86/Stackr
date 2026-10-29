# Stackr infrastructure assessment — 26 October 2026

Stackr has a capable platform and substantial safeguards. It is not yet demonstrably best in class: user-visible latency, account-cache correctness, complete retrieval and recovery assurance still have material gaps. The existing Cloudflare, Railway, Supabase and Expo stack remains a suitable basis. This assessment provides no measured justification for a new service or broad rewrite.

This is an engineering assessment, not a numeric certification. “Implemented” refers to inspected source; “observed live” refers to the stated bounded read; “unverified” is not a claim that a component is absent or broken.

## Current state

- Main / Build 61 source: b5d643a997041db2a8c42b5b6cb0180e8ddf28e7.
- PR #446 remains draft, open and conflict-free at df45ef50420cab9dae7e2fefb6e929cd1110363c. Three associated hosted workflows passed; the separate release-candidate gate was skipped. No merge, native build, deployment or SQL application was performed by this assessment.
- Earlier qualification evidence: a205af1a8bbea7dfcf8a8bb98bc2451791f8020b. The assessment is documentation-only, not an app build source.
- Public health at 14:16 UTC: gateway and backend HTTP 200; backend reports bundled source 7c1acd409680 and deployment dfc23b30-9675-4ba0-ad2b-9f1875302747. Active gateway Worker revision remains unattested.
- Supabase project oakdbbzdqwurpjnoqhmu reports ACTIVE_HEALTHY, PostgreSQL 17.6.1.104, eu-west-1.
- Designated QA email/password remain blank. Authenticated Home timings, actual account Data API page cap and installed-phone acceptance remain unverified.
- R2 was not interrupted or modified. A live public search response includes both assets.stackrtcg.com and legacy Supabase asset references. These are references, not unique objects or migration counts; migration completion was not established here. The old 24 October “zero copied” document is not a current progress counter.

## Assessment against a strong mobile platform

| Area | Best-in-class expectation | Stackr assessment |
| --- | --- | --- |
| Architecture | Clear responsibilities, few justified services, canonical identity and measured capacity. | Sound foundation: versioned API, public edge cache, Railway application/workers, Supabase Auth/data and R2 public artwork. Full capacity and failover claims remain unverified. |
| User-visible retrieval | Predictable first-useful-content latency under stated device/network/data conditions. | Below the intended experience: authenticated Home is unmeasured; existing large fixture still reads about 1.08 MB across 11 collection requests. The reviewed concurrency improvement is unshipped. |
| Public catalogue completeness | Stable continuation through every matching printing, independent optional enrichment. | Current search returns a bounded first successful strategy with no continuation. Live sample returned 50 results and nextCursor:null. Public caching works; the first observed request was slow. |
| Account and cache correctness | Every private cache entry and late response is tied to the current account/session; logout removes access. | Important gap: shared binder-record cache and edit loader expose a source-supported cross-account display path. Home’s separate scoped cache and gateway private-cache exclusions are positive controls, not proof all caches are safe. |
| Database efficiency | Read cost proportional to required output, representative plans, controlled concurrency and measured tail latency. | Confirmed duplicated aggregate work; locally reviewed proposal reduces six aggregates to three. Production improvement remains unverified and proposal unapplied. |
| Background work | One effective scheduler owner, durable claims, bounded retries, visible failure/backlog and freshness. | Substantial controls exist. Actual due-job age, processing progress, single active owner and alert effectiveness still need current ledger evidence. Conditional short-page worker risk remains queued. |
| Monitoring | User-journey success/latency, errors, saturation, freshness and actionable alerts. | Live public smoke monitor works. Authenticated journeys, production percentile distributions, complete image/freshness coverage and notification delivery are not established. |
| Recovery | Demonstrated restoration of data, assets, identities and security, with measured recovery time/data-loss objectives. | Backups and prior drill exist. Current verifier omits important security/Auth coverage; production RTO/RPO remain unmeasured. |
| Releases | Exact app/API/Worker/database correspondence, normal repeatable lane, rollback and device acceptance. | Strong source/CI/build receipts. Candidate remains unmerged; current Worker attestation, credential-lane readiness and installed-phone acceptance remain gaps. |
| Capacity and cost | Known concurrency limits, bounded device memory and cost per workload. | No current representative end-to-end load/cost evidence in this assessment. Generic request cache lacks eviction of expired high-cardinality keys; heap impact is unmeasured. R2 capability alone does not establish application-scale capacity. |

## New live public search sample

Three sequential unauthenticated desktop GETs to /v1/search?q=Pikachu&language=en&limit=50, observed 14:18:28 UTC, Cloudflare LHR. Network, origin/database caches and connection reuse were uncontrolled. No price, collection or worker requests were made.

| Request | Elapsed including decoded body | CF cache header | Results | Decoded JSON bytes |
| --- | --- | --- | --- | --- |
| First observed | 6,034.30 ms | DYNAMIC | 50 | 299,949 |
| Repeat 1 | 195.58 ms | HIT | 50 | 299,949 |
| Repeat 2 | 122.96 ms | HIT | 50 | 299,949 |

All returned HTTP 200 and nextCursor:null. These three observations are not p50/p95, controlled cold/warm, compressed wire bytes or phone timings. They establish functioning caching and a slow first observed response. They do not isolate database, backend, network or image-enrichment cost. Investigate the non-HIT path and field selection under matched conditions.

The deployed backend source also returns nextCursor:null after selecting a bounded strategy. Source: [candidate search](https://github.com/tberridge86/Stackr/blob/df45ef50420cab9dae7e2fefb6e929cd1110363c/backend/lib/stackrApiV1.js#L1735) and [client contract](https://github.com/tberridge86/Stackr/blob/df45ef50420cab9dae7e2fefb6e929cd1110363c/lib/stackrApiV1.ts#L1231). The deployed backend module differs from the candidate; its independently fetched search implementation retains the same continuation limitation.

## Priority findings

1. **INFRA-ACCOUNT-CACHE-001 — P1, source-supported private metadata display path.** [fetchBinderById](https://github.com/tberridge86/Stackr/blob/df45ef50420cab9dae7e2fefb6e929cd1110363c/lib/binders.ts#L573) keys records only by binder ID/asset mode for 30 seconds. [getCachedOrFetch](https://github.com/tberridge86/Stackr/blob/df45ef50420cab9dae7e2fefb6e929cd1110363c/lib/requestCache.ts#L15) returns a hit without an authenticated read. [The edit loader](https://github.com/tberridge86/Stackr/blob/df45ef50420cab9dae7e2fefb6e929cd1110363c/app/binder/new.tsx#L475) copies the returned name, cover and defaults without checking the current owner. The auth listener for binder-reopen purges a separate cache. Scenario: A opens the private binder’s edit form, warming the default/assets record cache key, then signs out; B signs in in the same JS process and opens that binder’s edit route before expiry. A cached record can populate B’s form. The same record key is present in main/Build 61 source. This is not an observed customer-data breach, installed-phone reproduction or write bypass; detail and write paths have separate checks. Treat as a release hold until account/session keys, auth purge, late-fill rejection and edit-owner validation are implemented and exercised with A/B/A, logout and held-response regressions.

2. **INFRA-RECOVERY-PROOF-001 — P1 assurance gap.** [Restore verifier](https://github.com/tberridge86/Stackr/blob/df45ef50420cab9dae7e2fefb6e929cd1110363c/scripts/deploy/verify-postgres-restore.mjs#L10) excludes Auth/private schemas; its schema snapshot omits RLS enabled/forced flags, policies and ACL equivalence. A successful current verifier cannot establish restored account boundaries. The August evidence records 185 database tables, 190,325 packed storage objects and 512 restored samples including private objects; backups are not absent. Extend an authorised isolated drill to Auth/private/security checks and measure RTO/RPO. No actual insecure restore is asserted.

3. **Retrieval and prepared-read cost.** Local PostgreSQL 18.3/PGlite evidence (six warm samples per variant) shows large prepared input median 155.578 → 96.921 ms and identical complete JSON/hash, six → three aggregates. Hosted PostgreSQL 17 analysis was non-executing EXPLAIN only. The proposal remains unregistered and unapplied; qualify PostgreSQL 17 execution/concurrency and authenticated Home before rollout. The existing GET also updates generation-request metadata. See the preceding prepared-valuation handoff.

4. **Conditional worker completeness.** scripts/lib/prepared-collection-valuation.mjs:18–24 stops on a short requested 500-row page. Prior local lower-cap reproduction returned 17 of 1,003 rows. Effective live worker cap and production occurrence are unverified. Qualify and repair bounded pagination without triggering price jobs.

5. **Security/configuration triage.** Fresh live advisors report leaked-password protection disabled, 11 authenticated-executable SECURITY DEFINER warnings and 33 RLS/no-policy informational findings. Representative RPCs contain deliberate owner/admin checks; warnings are not proof of an exploit. Pin current live bodies/grants and run negative-owner/admin/replay tests in an isolated environment. Performance findings (115 RLS initplan, 247 multiple-policy and four duplicate-index warnings; 190 unindexed-FK and 184 unused-index informational findings) need query-plan/workload triage, not blanket index/policy changes. The observed PostgreSQL 17.6 build also warrants a provider patch-status review against the published 17.11 update; exploit applicability and upgrade prerequisites were not assessed.

## Operational evidence and boundaries

- Gateway public caching rejects authenticated/cookie/range/private/no-store/session-bearing responses; private pricing uses private,no-store and Vary: Authorization. References: gateway/src/cache.js:32,161; gateway/src/index.js:77.
- Home facts use account/session/revision leases and a bounded 30-second cache; complete oversized results bypass storage rather than truncate. This does not remove the separate binder-record finding.
- Price workflows use a shared concurrency group, SQL claims use SKIP LOCKED with leases/token completion, and the runner is time-bounded with checkpoints. Recent cancelled scheduled runs had zero jobs; this does not show a provider failure. Scheduler/backlog cause remains unverified.
- Production API Monitor run 40309362033 actually executed its public smoke step successfully at 10:41:46–10:42:02 UTC, and the recovery-issue step succeeded. It is stronger evidence than a workflow that merely skipped its job, but does not measure authenticated Home.
- No code, schedules, subscriptions, production configuration, catalogue entries or R2 objects were changed. No new build, restore, migration, production job or price refresh was triggered.

## Recommended sequence

1. Close the binder cache account boundary and add meaningful regression/independent review.
2. Fill designated QA access, measure first usable Home/Search/Binders/Pokedex and finish installed-phone acceptance for the exact candidate.
3. Finish complete search continuation and reduce measured first-request/summary costs; qualify the existing SQL proposal before any migration approval.
4. Strengthen restore security verification and triage concrete Auth/RPC/patch findings alongside release qualification.
5. Qualify existing scheduler, freshness/backlog alerts, user-facing latency monitoring and normal release credentials. Measure capacity/cost before adding infrastructure.

Benchmark references: [Google SRE monitoring](https://sre.google/sre-book/monitoring-distributed-systems/), [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [Supabase backups](https://supabase.com/docs/guides/platform/backups), [Cloudflare R2 public caching](https://developers.cloudflare.com/r2/buckets/public-buckets/), [Supabase advisors](https://supabase.com/docs/guides/observability/advisors), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [PostgreSQL update notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).

The coding lead and independent reviewer supplied bounded source/evidence assessments. Root independently traced the binder edit/cache path, checked current GitHub/deployed health, read live advisors and ran the three public search GETs. No broad test suite was rerun for this assessment.
