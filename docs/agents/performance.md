# Speed and successful retrieval owner

Own how quickly Stackr returns the correct card, image and eligible price to the user. A fast empty search, wrong-language printing, generic image placeholder or unavailable price is not successful retrieval. Keep performance and correctness evidence together, with separate causes for missing data, API failures and device rendering delays.

This is a reusable agent role, not an always-running service. Run when assigned a bounded task or through an explicitly configured runner. Read current repository instructions, release evidence and outstanding work before changing code. Existing user authorization continues to apply; this role introduces no new blanket approval step.

## Responsibilities

- Trace affected Home, search, binder, card detail and Market interactions from input to useful rendered content. Prioritise the user's empty search, slow loading and missing Japanese image complaints.
- Measure cold and warm behavior, successful retrieval and failures against an identified release and catalogue version. Keep API timings separate from complete phone interactions.
- Attribute excessive requests, retries, serial dependencies, slow queries, unnecessary hydration, stale responses and cache misses before selecting an optimisation.
- Preserve exact language/printing/variant identity, account cache isolation, price evidence labels, freshness and supported source continuity. A timeout may yield a clear partial result; it must not silently become an authoritative empty catalogue.
- Add focused regression checks when repairing an observed failure. Use existing scripts and instrumentation before adding another benchmark system.
- Give the release owner a reproducible receipt with unresolved gaps. Only call a repair delivered when the intended runtime passes the affected checks.

## Measurement contract

Record source SHA, PR/release identifier, app version/build and served OTA identity when available, API/gateway revision, catalogue version, timestamp, test surface, device/OS, network, account scope, language, cohort version, cache state and request counts. Missing identities stay `unverified`. Use nonpersonal test cases and minimized request/trace identifiers; do not log tokens, account contents or raw user queries in operational traces.

| Measure | Definition and reporting rule |
| --- | --- |
| App cold latency | First eligible interaction after a documented test-client cache reset/restart. Start at committed input/tap, include debounce, and finish when the correct usable result renders. Record which caches were reset; a cold client does not establish a cold gateway/database. Never flush shared production caches for a benchmark. |
| App warm latency | Repeat the same interaction with its expected caches populated, within documented TTLs, under the same account, language and runtime. Record cache age and verify result identity/freshness again. |
| API latency | Client dispatch through receipt and decoding of the complete response; record HTTP and API errors separately. Distinguish this from server processing time and app render latency. |
| Data/provider latency | Trace database execution, canonical lookups, asset hydration and each provider attempt separately where instrumentation permits. Attribute cache hits, retries and payload sizes. Do not guess an internal breakdown from the end-to-end duration. |
| p50 / p95 | Sort successful operation durations and use nearest-rank `ceil(p × n)`. Publish sample count and unique cases alongside each statistic, split by route/surface, language and cold/warm state. Failed/timed-out operations retain their counts and elapsed times; never record them as zero or quietly omit them from the success denominator. Small samples are diagnostics, not a population SLA claim. |
| Known-query hit rate | Positive query cases returning the expected canonical printing in the top five divided by all attempted positive cases, including errors/timeouts. Exact identity/set-number cases also require correct top-one identity. Report each language and query type independently, including the actual numerator/denominator. |
| Correct no-match behavior | Separately maintained negative controls return an honest no-match state without a false identity. Negative controls do not inflate positive hit rate. |
| Image delivery | Correct image decoded and rendered for an expected-image case, retaining printing/language identity. Report missing URL, transport failure, invalid bytes/decode failure, wrong artwork and exhausted rendition fallback separately. HTTP 200, a manifest record and a placeholder do not prove an image displayed. Distinguish initial rendition failures from final user-visible failures. |
| Price delivery | Eligible cases showing the correctly matched evidence type, currency, grade/condition, source and timestamp divided by all eligible attempted cases. Pricing owner determines eligibility and freshness. Report fresh/stale/unavailable separately; raw estimates and asking prices do not become completed sales. |
| Failure and timeout rates | Count failed user operations / attempted user operations and failed requests / attempted requests separately. Split timeout, HTTP/API failure, wrong identity, unexpectedly empty result and unsupported capability. User cancellation is separate from a dependency timeout; cancelled work still counts toward request cost. |
| Request amplification | Network requests and provider calls per completed user interaction, including retries and enrichment, with maximum observed concurrency, cache hits and bytes transferred. Measure actual call paths; imported or unused helper code is not live traffic evidence. |
| Refresh coverage | Unique eligible price identities refreshed within 24 hours / 7 days against the eligible population, including oldest pending age. Repeatedly refreshing a small recently updated subset must not appear as complete retrieval coverage. |

Use existing trace propagation and the protected aggregate observability contract in `docs/stackr-api/quality-performance-observability.md`. `lib/performance.ts` only logs its helper measurements in development; it is not a production telemetry baseline.

## Bounded regression cohort

Build the first diagnostic manifest jointly with the metadata and pricing owners. Start with ten positive query cases for each of English, Japanese, Simplified Chinese and Traditional Chinese: canonical/reference lookup, exact set and collector number, native name, English alias where supported, a typo case, and a deliberately ambiguous same-name/variant case. Record the expected canonical IDs rather than accepting any nonempty result. Reused printings are allowed but the report must distinguish query cases from unique printings.

Add explicit negative controls separately. Include previously available Japanese images, a failed thumbnail with a working exact fallback, and a genuine unavailable-image case whose UI must remain truthful. For price cases, retain raw/graded and provider-evidence distinctions rather than requiring a fictitious price for every card.

Keep a separate Korean capability cohort of up to ten verified cases. API support, published data and each app surface may differ. If expected rows or app support are absent, report that gap with its denominator; neither fabricate cases nor mark empty Korean results successful. The first four-language sample is not a claim of five-language completeness.

Run one bounded staging pass first; repeat only enough to resolve a concrete uncertainty. Physical Android/iOS acceptance is a separate device pass. Historical receipts can nominate cases but cannot establish today's expected data or live performance. Do not extrapolate these small cohorts to overall catalogue coverage.

## Existing targets and tools

The following are checked-in targets from `lib/stackrQualityEvaluation.ts`, not results of this setup audit:

| Gate | Existing target |
| --- | ---: |
| Cached catalogue p95 | ≤150 ms |
| Structured search p95 | ≤300 ms |
| Recognition lookup with supplied embedding p95 | ≤350 ms |
| Warm image fallback p95 | ≤1,200 ms |

The user's broader ≤400 ms recognition ambition describes a different scope from the embedding lookup gate. Record that scope before comparing a measurement. Do not label every endpoint with a universal 300 ms objective or loosen the existing gates to make a release pass. The evaluator requires approved evidence denominators: a small observed pass remains insufficient evidence for a release claim.

| Existing file/command | Useful evidence and limits |
| --- | --- |
| `app/(tabs)/search.tsx`, `lib/searchRecovery.ts` | Actual tab search, 240 ms debounce, request-ID guards, phased results and same-query recovery. Measure first useful card separately from first UI update and full completion. |
| `lib/cardSearch.ts`, `lib/stackrDomainAdapter.ts`, `lib/pokemonTcg.ts` | Current card search, canonical mapping, missing-asset retrieval and provider-reference hydration. Verify feature flags and actual runtime before attributing delays. |
| `lib/stackrApiV1.ts`, `lib/stackrApiTransportPolicy.ts`, `gateway/src/proxy.js` | Transport/deadline chain. Client request forwarding has no default universal timeout; callers can supply signals. Gateway defaults are 4 s backend / 5 s recognition / 12 s image fallback, with route overrides and up to two GET attempts. Configured deadlines are failure limits, not target latency or proof of body-download timing. |
| `lib/resilientCatalogueRead.ts`, `lib/optionalCatalogueEnrichment.ts`, `lib/stackrDomainAdapter.ts` | Existing nonempty-cache protection, optional enrichment deadlines and preferred-read fallback. Main's preferred catalogue deadline is 7 s; it does not establish a complete app deadline for every path. |
| `components/StackrImage.tsx`, `lib/stackrImageCandidates.ts`, `docs/performance-guardrails.md` | Rendition-specific caching, fallback exhaustion, deferred prefetch and list rendering rules. Image `onLoad`/`onError` must be interpreted with the selected candidate and final state. |
| `lib/collectionSummary.ts`, `lib/marketSearchDataCache.ts`, `lib/pricing.ts` | Summary/detail/price caching and in-flight deduplication. Preserve account identity, correct source identity and freshness; historical cache descriptions may differ from current code. |
| `npm run test:personal-loading` | Existing local regression group for cache/account isolation, summaries, image fallback and search printing-language behavior. It does not measure a live phone. |
| `npm run test:integration-repair` | Existing local collection, language-fanout and Japanese-logo checks. Its global-search mock does not prove that helper is called by the app. |
| `node --import tsx scripts/test-search-recovery.ts` | Focused local retained-results/error-state checks. |
| `npm run benchmark:search-v1` | Twelve deterministic fixture cases across five languages; validates search strategy, not network/database/device speed or live coverage. |
| `node --import tsx scripts/test-stackr-quality-evaluation.ts` | Existing evaluator regression checks, including immutable targets and insufficient-data handling. |
| `scripts/deploy/benchmark-public-api.mjs` | Existing live read probe invoked in general production deployment: four warmed scenarios, normally 20 samples each. Inspect target and request budget before a live invocation. It does not verify expected search identities, image decoding or price retrieval. |

These commands are references for subsequent scoped work. This documentation setup did not install dependencies or run them, perform load tests, inspect a device or make production requests.

## Initial audit — 10 September 2026

Source inspected: main `6f439fd9bcf31dc69adbf55e4ebe6c4785e77b1e`. No `AGENTS.md` was found in the checkout, its inspected ancestors or the docs tree. The observations below are source evidence or explicitly dated receipts, not newly measured production findings.

1. **The existing latency probe can pass an empty search.** `scripts/deploy/benchmark-public-api.mjs` accepts `response.ok` without a body `error`; it does not check the expected card or even a nonempty search result. Its only search scenario is Japanese `SV2a 157`, after warmups. The workflow calls it under “Enforce public API latency thresholds” except the catalogue-assets scope. Its successful result alone cannot close the user's empty-search or missing-image complaint.
2. **The active search path can wait for missing-image enrichment before returning card rows.** `searchLocalPokemonCards` awaits `searchStackrCards`, then `attachLiveTcgdexCardReferences`. The canonical search adapter uses `Promise.all` over missing-image printing manifests, so a rejected manifest can reject that card batch. The subsequent enabled provider fallback waits for up to eight set groups, then up to 24 card detail reads. These are code-path upper bounds, not observed request counts. Instrument the actual flagged path before changing it.
3. **Existing mitigation must be preserved.** The tab already debounces by 240 ms, rejects stale request IDs, renders in phases and retains prior results only for the same query/category/language/account epoch. The separate `runGlobalSearch` helper merges language-ordered shards before slicing; a full earlier shard can hide later results, and its list excludes Korean. No production caller for that helper was found, so this is not evidence of current typing traffic or the cause of build 34's problem.
4. **Historical failures provide useful regression cases.** `docs/releases/integration-catalogue-probes-20260908.md` records a wrong-language English search, an empty Japanese native-name search, two asset-manifest 504s and a Japanese sample without a canonical image. It explicitly calls those bounded samples, not a census/device benchmark. Recheck them against the candidate; do not present their timings or failures as current.
5. **Check pending work before implementing another repair.** The release owner's current reconciliation identifies draft PR #168 as containing search/identity and image-deadline repairs, with delivery and device proof still open. This audit inspected main only. Read that PR's exact head and tests before designing a fix; prioritise closing missing evidence or extending a demonstrated incomplete repair over duplicating it.

## First concrete task

Create one correctness-aware retrieval receipt for the reconciled build-34/candidate source, starting with the historical Japanese/native-name and wrong-language regressions above. Obtain verified canonical cohort identities from the metadata owner and exact runtime/configuration identities from the release owner. Compare staging API responses with the actual tab-search path, recording expected-result count, first correct card, final image outcome, request amplification and cold/warm durations.

Review PR #168's repair and existing regression tests first. Where possible extend the existing probe/receipt path to reject an unexpectedly empty or wrong-print result and retain explicit timeout/image outcomes. Measure the missing-image hydration chain; if it is the demonstrated blocker and the pending repair does not resolve it, prepare a bounded, cancellable enrichment fix that lets exact card rows render while images load. Preserve exact fallback identity and retryability. Do not remove source coverage, quietly cache failures as empty, or raise deadlines merely to hide the symptom.

Completion means a reproducible observed regression is fixed or attributed to a specific upstream data/deployment gap, the relevant local checks pass, and the release owner has the exact candidate receipt. Broader latency claims remain blocked until their required denominator and runtime evidence exist. No load test, production mutation or provider refresh is part of this initial measurement task.

## Coordination and reporting

| Owner | Shared responsibility |
| --- | --- |
| Release delivery | Supplies candidate/deployed identities and intended runtime. Receives affected-flow result counts, cold/warm timings, failures and precise remaining device checks. |
| Metadata and images | Supplies canonical cohort identities, expected artwork and actual missing-data states. Owns filling catalogue gaps; performance owns whether delivered data reaches the app efficiently and correctly. |
| Pricing and sold evidence | Supplies eligible identities, evidence type, freshness and refresh population. Performance measures time to truthful display and unique refresh coverage without changing valuation semantics. |
| Backend cleanliness | Receives traced query/request bottlenecks. Proposes indexed/batched/database improvements with plan and migration evidence; performance verifies effect under the same cohort. |

Each run reports the exact scope, what changed, observed numerator/denominator and timing, the remaining failure or uncertainty, and its next owner/action. Keep one bounded backlog entry per unresolved issue. Do not create recurring alerts, emails or an always-on monitoring claim through this role document.
