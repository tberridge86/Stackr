# Prepared valuation measurement and local SQL proposal — 26 October 2026

## Outcome and current source

Continuation of PR #446 from app candidate b50547de15a49712d99c67829c38a0bb1d9428b6; authoritative previous qualification evidence f0e3c333eafaf4dd6e32e634a5689e96affa2d92. GitHub main remained b5d643a997041db2a8c42b5b6cb0180e8ddf28e7 and PR #446 remained open, draft and conflict-free at investigation start. The candidate checkout was clean. Original dirty worktrees and R2 work were preserved.

This unit adds authenticated measurement tooling and a locally tested, unapplied SQL proposal. It changes no app, backend, gateway, worker, live schema, schedule or asset reference. It does not establish whether the reviewed Home change makes the real app faster: designated QA credentials remain unavailable and phone acceptance is unverified.

## Recovered deployment and access

Fresh public health readbacks report gateway /v1/health healthy and Railway backend prefix 7c1acd409680, deployment dfc23b30-9675-4ba0-ad2b-9f1875302747, production project oakdbbzdqwurpjnoqhmu. Established full backend source remains 7c1acd409680b38d5913d8cae76df560b5d91daa; Worker revision was not independently attested. Fresh Apple readback confirms Build 1.0.6 (61) remains available to Team (Expo), not that a device installed it. No native build or submission was performed.

D:/workspace/stackr-qa.local.json exists with empty email/password fields. No credentials were printed, no customer account reset, no privileged impersonation, no authenticated Home request and no valuation RPC invocation occurred. Read-only schema/function/statistics inspection and non-executing EXPLAIN were performed; no hosted EXPLAIN ANALYZE was run.

## Concrete database finding

api.collection_valuation_inputs constructs three ordered JSON arrays, then references the combined body both in its result and in md5(body::text). The observed PostgreSQL 17.6 estimated plan repeats all three JSON aggregates: six aggregate nodes.

Three local variants were compared:
- Current SQL: six aggregates.
- MATERIALIZED payload: three aggregates, but an additional large-payload tuplestore spills at the observed 2184kB work_mem.
- Selected proposal: OFFSET 0 on the one-row payload subquery prevents pull-up/repeated evaluation without that payload tuplestore. Three aggregates, exact same JSON and revision hash.

OFFSET 0 is used deliberately as a planner barrier, not pagination or truncation. The source comment and plan regression require revalidation after PostgreSQL planner upgrades. It is an implementation-dependent optimization fence; there is no promise every future planner preserves this plan.

No index, input column, ordering, owner predicate, pricing rule, signature, STABLE property, SECURITY INVOKER setting, empty search_path or privilege changes are proposed. Public/anon/authenticated still cannot execute the service-only function. The verified-JWT backend route remains responsible for selecting the owner; a service-role caller intentionally can specify an owner.

## Matched local results

PGlite 0.5.8 / PostgreSQL 18.3, synthetic full column/type/index shapes observed from production; work_mem 2184kB; six measured warm samples per variant using all six order permutations. Shared development host, not controlled phone/network conditions. Schema fixture does not recreate all production constraints, defaults, triggers or RLS policies. Service role bypasses RLS by design.

| Cohort | Saved / positive owned rows | Before median ms | Selected median ms | Internal input JSON bytes |
| --- | --- | --- | --- | --- |
| Empty | 0 / 0 | 1.749 | 1.313 | 102 |
| Small | 24 / 18 | 3.973 | 2.975 | 29,212 |
| Large | 1702 / 1323 | 155.578 | 96.921 | 2,041,682 |
| Multilingual | 250 / 200 | 25.550 | 16.567 | 311,954 |

Each cohort also contains 2,500 foreign saved rows and 2,500 foreign owned rows. These are synthetic stress populations, not copied customers. All complete target rows, hashes and JSON outputs match. Five languages sharing collector numbers remain distinct.

The large MATERIALIZED alternative median was 103.777 ms and wrote 277 temporary blocks; current and selected variants wrote zero temporary blocks in that normal fixture. Separate wide-note / 64kB stress plans are retained. PGlite temporary-block accounting does not prove physical-disk I/O performance.

These timings include local query result decoding. They are not actual hosted RPC, HTTP, Home render or phone timings. The 2.04 MB figure is an internal full-input payload, not the compact prepared API response or Home's earlier 1.08 MB collection download. No HTTP request/byte reduction is claimed. Empty/small differences are descriptive samples, not guaranteed speedups.

Hosted EXPLAIN on a synthetic owner parameter confirmed six versus three aggregate plan nodes without executing either query. Its row/cost estimates are not representative authenticated-account execution timings. Historical mixed RPC statistics remain 448 calls, mean 1531.47 ms; they do not isolate JSON work, write/lock contention, account size or cache state. The unchanged request wrapper still performs INSERT/ON CONFLICT UPDATE, including ready reads.

## Verification and proposal boundaries

The authoritative final raw measurement is evidence/prepared-valuation-measurement-20261026/local-plans.json. Earlier exploratory captures remain outside the candidate and are not release measurements.

The local harness checks exact full JSON/hash equality, public foreign-binder exclusion, null/wide/Unicode fields, notes/language/quantity/edition/printing edits, zero-to-positive and positive-to-zero ownership, insertion-order independence, unchanged pending/ready/updating wrapper responses, explicit EXECUTE privileges, STABLE/INVOKER/search_path, and exact proposal/rollback text. Proposed and rollback SQL run only in local PGlite.

Independent reviewer reran the frozen harness: PASS. The independent run reproduced six/three/three aggregates and large temporary writes zero/277/zero. Its timings are separate corroboration, not substituted into the table.

The exact proposal is docs/releases/evidence/prepared-valuation-measurement-20261026/proposed-function.sql, canonical LF SHA-256 82baae83c24b91c2cbcbaacfeba51a4bdee81505f14b616b3d080c31d441fa80. Rollback restores the original function body; SHA-256 2f868d282abc4969d539bba4c53c9d4a0cbfd12c06d77ddf4089423dfb97b795. See sql-source-manifest.json for verification; hashes must be refreshed if text changes.

This is deliberately an unregistered proposal outside supabase/migrations, not an applied migration. The local cached Supabase CLI failed before help/migration creation because its telemetry initialization tried to write the protected C:/Users/berri/.supabase profile. No permissions were bypassed, no migration version was invented, and no broad migration push was attempted. Migration registration through the existing CLI lane and an approved single-migration rollout remain gates.

## Authenticated measurement tooling

scripts/measure-home-authenticated.mjs is a bounded desktop service-dependency probe. It uses the actual pinned saved-reader/cache/pager and prepared API client with ordinary designated-account authentication. It compares serial and concurrent dependency schedules. It does not render Home, measure optional sections/images or prove installed-phone acceptance.

Preflight:
node scripts/measure-home-authenticated.mjs --credentials-file=D:/workspace/stackr-qa.local.json

After the owner fills the existing designated QA file locally:
node scripts/measure-home-authenticated.mjs --credentials-file=D:/workspace/stackr-qa.local.json --execute --designated-qa-account --allow-prepared-generation-get --samples=3 --include-actions --output=D:/workspace/home-authenticated-receipt.json

The output path must be new. The opt-ins acknowledge ordinary authentication and the existing GET's generation side effects; they do not enable price-refresh POSTs, admin access, holding edits or direct job dispatch. The existing materialization worker can perform downstream work under its existing configuration; this GET must not be described as universally write-neutral.

Client-memory cold/warm, forced facts and local invalidation are labelled separately. Local invalidation is not a real holding/binder edit. Receipt records decoded body bytes, not compressed network transfer bytes; origin/database caches are not reset. Prepared 403 may be a legitimate owner-only pricing restriction; it stops further prepared probes and must not be worked around by changing entitlements or using a privileged token.

Raw rows, UUIDs, revisions, credentials, query URLs and headers stay out of emitted measurement evidence. The tool reports controlled aggregate counts/coverage and anonymized request streams. Source bodies are checked against Git, across both modes and at completion. Limits and errors remain explicit; exceeding a budget is a failure, not a truncated success.

## Release, rollback and remaining work

No new app/runtime behavior is shipped by this unit. Existing reviewed Home behavior remains unmerged/unshipped; Build 61 remains the last verified distributed app. Earlier b505 exact-head app CI and runtime-equivalent 086959bc iOS export remain historical receipts; new tool/source CI is recorded separately after publication. No native rebuild is needed just to verify these measurement tools.

Before any SQL rollout: obtain authenticated matched measurements, validate on an authorised PostgreSQL 17 environment with realistic I/O/concurrency, confirm live function signature/body/ACL against saved evidence, register exactly one migration through the existing lane, complete independent release review and obtain scoped approval. Never replay Profile canonical 20261025154000 / ledger 20261026072532 or include daily-movers/unrelated migrations. Rollback is the pinned original function body with unchanged privileges.

Next priorities:
1. Designated-account probe and actual Home/device acceptance; establish real cap, pricing coverage and critical path.
2. Qualify the selected SQL proposal against representative PostgreSQL 17 conditions; investigate remaining update/lock cost if still significant.
3. Verify the worker's effective page cap: readPages has a locally reproduced conditional short-page truncation risk, not a confirmed production incident. It was not changed in this unit.
4. Job reliability, monitoring and recovery remain queued. R2 runs separately; no worker, originals, pointers or rollback receipts were changed.

## Final local qualification

Authenticated tool offline safety/completeness suite and scoped lint passed; independent reviewer also ran the offline suite. New SQL fixture/harness scoped lint passed after adding the explicit Node Buffer import; the initial lint failure is retained. An optional existing mocked HTTP route test was blocked locally by EACCES on127.0.0.1; this is not a passing local result. The existing Platform CI job now explicitly runs the authenticated offline suite, mocked private-route fixture and SQL invariants. No workflow trigger, production job or schedule changed. Exact-head hosted outcomes follow publication in the separate final receipt.
