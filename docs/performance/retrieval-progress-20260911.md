# Retrieval progress — 11 September 2026

Status: implemented and focused-tested on `perf/binder-first-paint`; NOT merged, deployed, or device-verified by this task. No production, hosted database, gateway configuration, pricing-worker or TestFlight mutation was performed.

## Exact source and execution

- Starting branch head: `a67aaa968a8d39c7628829eb883c8745502fc82f`.
- Previous identities-first runtime: `eb6b8abfcb1fe02da589f94959ef94418caa748e`.
- New runtime commit: `6050b2abfb17101c407e1db3489624155eada878`.
- Source application and all focused checks: [run 34634062949](https://github.com/tberridge86/Stackr/actions/runs/34634062949), successful.
- Runtime source hashes and regression results: artifact `10277108127` (`binder-retrieval-regression`), observed at `2026-09-11T18:36:07.559Z`.
- Read-only validation configuration restored in `a135e044bbe1b3ce087616d323280835837d8014`. It tests committed files; no source patching or committing, no write permission, no persisted checkout credentials. The live canary probe is explicitly selectable on manual dispatch, rather than automatically repeating on every code push. This is diagnostic CI, not a replacement or bypass for production release acceptance.
- An earlier source-publish attempt passed all source tests but GitHub rejected its attempted workflow modification. No permission was escalated: the successful retry published code only, then the existing connector separately restored read-only CI. The obsolete patch generators and temporary patch are absent from the final tree.

## New runtime changes

1. `features/binder/BinderDetailScreen.tsx`: authentication and the facts-only binder-record read now overlap. Both must finish and all existing active-account/public/private checks must pass before the screen requests cards or renders their contents. Authentication is not bypassed or replaced by a trust in cached client state.
2. `lib/binders.ts`: after the authorised binder read, the independent saved ownership and public catalogue reads start together. The loader still waits for both before returning its combined rows. A saved-ownership error fails promptly even when the catalogue is stalled. Custom and ambiguous binders do not start unrelated catalogue calls. Failed/partial catalogue recovery and cache exclusion remain intact.
3. `lib/binderCardIdentity.ts`: eligible saved rows are indexed once, then consumed through exact-ID or collector-number buckets. The original `findSavedBinderCardMatch` remains as the behavioural reference. Duplicate exact IDs, collector ambiguity, resolved set aliases, language isolation, exact-match precedence, original saved-row identity and duplicate saved-row-ID consumption are preserved.

These remove two serial waits and repeated matching work. They do not establish a measured end-to-end phone improvement by themselves.

## Focused validation

The successful run completed `npm run typecheck`, `npm run test:binder-catalogue`, `npm run test:personal-loading`, the existing 12 executable first-paint cases, and 12 new cases in `scripts/test-retrieval-parallel.mjs`.

The new tests execute the real transpiled binder service. They also extract the actual screen `load` callback via the TypeScript AST and execute it with controlled deferred dependencies; they are not a full native React render or network benchmark. They cover overlapping reads, denied binder access, prompt ownership denial, custom/ambiguous binders, failed-catalogue retry, saved state preservation, account changes, navigation cancellation and rendering before artwork/pricing completion. Detailed ownership-edit readiness stays false while its supplemental read is pending.

Indexed matching was compared to the original implementation for 4,096 seeded mixed requests, plus explicit ambiguity/alias/consumption cases. The new result is the original saved-row object, not an approximate copied match.

| Controlled matching population | Previous eligibility evaluations | Indexed evaluations | Previous Node CPU time | Indexed Node CPU time |
| --- | ---: | ---: | ---: | ---: |
| 252 cards / 252 saved rows | 31,878 | 252 | 13.926 ms | 0.446 ms |
| 1,000 cards / 1,000 saved rows | 500,500 | 1,000 | 150.124 ms | 1.830 ms |

These are one diagnostic observation on a GitHub Node `v22.23.2` runner, not a phone p95. The deterministic work-count reduction and behaviour-equivalence checks are the meaningful regression proof. Local and CI SHA-256 hashes of all three changed runtime files matched.

## Live canary API diagnostic — no phone claims

Endpoint: `https://stackr-api-perf-canary-production.up.railway.app`. This is NOT the normal phone gateway. Served backend revision, origin protection and phone runtime were not attested by these probes. The script commit identifies the test script only.

Each pass makes 11 requests per set: first observed plus 10 declared warm requests. The script follows every cursor, downloads and parses the JSON, verifies exact unique printing count, set/language, collector sequence and default-variant membership. No shared cache was flushed. First observed is NOT evidence of a deliberately cold database. Both probes were from GitHub-hosted Linux runners, not a UK phone or a fixed-location deployment SLA.

| Probe start UTC / run | Set | Correct responses | Warm samples | Warm p50 | Warm p95 / max | First observed |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 18:23:32 / 34632987639 | Perfect Order | 11/11, each 124 cards | 10 | 257.5 ms | 372.3 ms | 1,868.7 ms |
| 18:23:32 / 34632987639 | Surging Sparks | 11/11, each 252 cards | 10 | 273.9 ms | 333.2 ms | 1,629.9 ms |
| 18:32:51 / 34633864583 | Perfect Order | 11/11, each 124 cards | 10 | 281.7 ms | 382.4 ms | 615.4 ms |
| 18:32:51 / 34633864583 | Surging Sparks | 11/11, each 252 cards | 10 | 293.4 ms | 310.6 ms | 371.4 ms |

Raw evidence artifacts: `10277106649` and `10276653733`. Across these two separately reported passes, all 44 responses met the tested identity checks and all 40 declared warm responses were <=500 ms. Three of four first-observed requests exceeded 500 ms. Ten warm samples per set are a diagnostic, not a reliable population tail-latency estimate. Earlier morning failures remain failures; these later passes do not retroactively erase them.

The API was not redeployed between these probes as part of this task. These figures must not be attributed to the new client matching/parallelisation patch.

## Outstanding acceptance and ownership

- Mandatory network authentication/binder/ownership reads still exist. Public per-set persistence does not make the entire screen offline-first. Real warm navigation, process-cold reopen, cache expiry, reconnect and native SQLite execution remain to be measured and completed.
- The first-observed API spikes remain unresolved; warm canary performance does not pass an uncached end-to-end requirement.
- Public snapshots currently have a five-minute TTL and bounded retention. Atomic version/delta replacement, retention of the previous valid snapshot on failed refresh, and verified native offline behaviour are not certified by this work.
- The old scanner-wide catalogue cache must not be presented as a completed delta sync engine: its cursor-only delta behaviour is unchanged and is not used to prove these binder fixes.
- Actual tap-to-correct-visible-first-viewport and ownership-edit-readiness are unmeasured on a device. A skeleton, JS callback completion or setState invocation does not prove native rendering.
- Normal production gateway routing, complete production API retrieval and exact mobile runtime need separate release-owner evidence before any promotion. No new TestFlight build is authorised by this receipt.
- PR #180 remains the separate gateway/RLS workstream. These changes neither apply its migration nor deploy its gateway patch. Pricing and canonical-asset work remain untouched.

Next implementation focus: cache-backed authorised reopening and truthful stale/refresh handling, coupled with actual first-viewport and ownership-ready measurement. Preserve the existing stricter cached catalogue/search targets; do not change thresholds to make a release green.

## 12 September: release probe false-green closed in source

Source base for this increment: `0b38f610cf8f78e3a8b8d476812e512f46812170` on this existing draft workstream. Production and device delivery remain unchanged.

`scripts/deploy/benchmark-public-api.mjs`, the bounded probe used by the existing production workflow, now validates useful response content on every warmup and measured sample. It rejects an empty or wrong-language set list, an empty/wrong-language search, and a search that omits the expected canonical Japanese SV2a 157 printing (`ba65f365-abcb-40dd-9486-ba24014f33d5`). The asset scenario is narrowed to the production-verified M5 004 variant (`61459941-7744-431e-99ef-2b4c5fa26bef`) and requires the exact variant, an HTTPS original and exactly one HTTPS delivery for each of `card-grid`, `search-result` and `detail-page`.

The report now records the minimum/maximum useful result count and that the expected identity was verified. The new local contract suite contains 12 cases: 4 valid envelopes and 8 false-green failures covering empty, wrong-language, wrong-identity and incomplete-derivative results. TypeScript, lint (zero errors; nine pre-existing warnings) and diff checks pass. The broader deployment-tooling test is locally unmeasured because this sparse checkout deliberately omits tracked asset files that its secret-scan fixture enumerates; normal full-checkout CI remains required.

A read-only production database check against Supabase project `oakdbbzdqwurpjnoqhmu` at `2026-09-12T09:58:32.171791Z` confirms the pinned search identity is still published as Japanese `SV2a` collector `157`, with normal and reverse-holo variants. It also confirms the exact M5 004 asset remains approved in `supabase_storage` with one each of the three required derivatives. This verifies current database identities, not public-route latency, downloaded bytes or app rendering.

This is executable probe validation, not a fresh live latency sample or phone-render proof. One bounded public request from this runner timed out at 10 seconds before receiving any response, so no new API p50/p95 is claimed; use the existing guarded workflow/canary path for the next bounded live pass after review.
