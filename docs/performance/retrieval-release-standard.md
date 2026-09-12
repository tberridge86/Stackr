# Stackr retrieval release standard

Status: release blocked pending measured evidence. This is a target and acceptance contract, not a claim that the existing client achieves it.

## Scope and ownership

Continue the existing `perf/binder-first-paint` workstream. Reuse existing catalogue, asset, sync and cache components before introducing new services. Do not replace parallel pricing or canonical-asset work. Do not deploy production or publish a mobile/TestFlight build from this change.

## User-visible performance contract

Measure navigation intent to the first interactive, identity-complete binder model, with a visibly rendered first viewport. A spinner or empty skeleton does not count as useful content. Report initial identity rendering and ownership-edit readiness separately. Benchmark recorded target devices and networks, not server duration alone.

- Warm repeat navigation: target p95 <= 150 ms; hard acceptance ceiling 250 ms.
- Process-cold launch with a valid local catalogue: target p95 <= 500 ms to useful content.
- Online initial catalogue retrieval: every declared warm acceptance sample <= 500 ms, including all pages required for completeness. Report p50, p95, maximum, errors, sample size, payload size and cache state. First-ever installation, cold origin, expired cache and weak networks are separate cohorts; do not omit them or relabel slow samples as cold after collection.
- Complete identities: 100% of expected canonical printings for the selected set/language/version; preserve all supported variants. A larger page limit is an optimisation, not a completeness guarantee. Perfect Order 124 and Surging Sparks 252 are initial regression fixtures, not a substitute for general pagination tests.
- Artwork and prices must not prevent useful identity rendering. Existing approved cached artwork may render immediately. Image and price availability are distinct from catalogue completeness.

## Required architecture

1. Read public canonical set/card facts from the existing on-device catalogue store where available. Use versioned, validated local snapshots and atomic background delta application. Keep the previous valid complete snapshot until its replacement is validated. Never publish partial sync results as a complete catalogue.
2. Store private ownership overlays separately, scoped to account and binder. Account changes cancel or invalidate pending work and clear inaccessible private state. Local caching must not grant new access, bypass server authorisation, or imply that stale ownership is current. Keep mutations disabled until the necessary ownership state is validated.
3. All official binder entry-point reads explicitly use the identities-only path. This includes binder record/set branding resolution as well as set-card retrieval. Preserve the enriched default behaviour for other existing callers unless they explicitly request lightweight facts.
4. Fetch artwork through the existing exact canonical asset resolver after first render. Prioritise the visible viewport and a small look-ahead; bound concurrency, deduplicate identical in-flight work and cancel obsolete work. Do not re-fetch the whole binder/ownership/catalogue graph merely to add images.
5. Merge only validated artwork fields into the current rows. Preserve saved image fallbacks, ordering, canonical printing/language/variant identity, ownership, quantities, condition, grading, notes and pricing. Recheck the active request/account generation inside deferred state updater functions. Missing artwork must not change a default variant or remove a card.
6. Pricing remains independent. Preserve unavailable/stale/pending states; never convert missing prices into real zero-valued estimates. Do not wait for per-card pricing to open a binder.
7. Use bounded, version-aware caches, request coalescing and stable pagination. A refresh must invalidate stale in-flight writers as well as cached values. Avoid provider calls, asset probing, global catalogue scans or N+1 requests on the critical rendering path.

## Required tests and release evidence

- Complete canonical identities and variants for small, large and multi-page sets, including more than 500 variant rows; no duplicates, missing pages or premature null cursor.
- Facts complete while artwork/pricing promises hang or reject; background enrichment failures retain usable cards.
- Account switch, navigation, refresh and ownership edits during enrichment cannot restore stale or private data.
- Partial, duplicate, mismatched-language/version and failed snapshots do not poison the cache or replace a valid complete snapshot.
- Warm cache, process restart, offline browsing of permitted cached data, expired cache and reconnect/delta recovery are exercised explicitly.
- Enriched API defaults remain backward compatible; published-only data and origin protection remain intact.
- Record raw parsed HTTP responses and deterministic counts/checksums for endpoint tests. Scraper-generated summaries are not correctness evidence.
- Typecheck and existing binder/catalogue/account-cache regression suites pass, then on-device first-render and edit-readiness traces pass. Keep production/mobile blocked until all relevant gates are demonstrated.

## Claim discipline

A few fast server responses do not establish best-in-class UX. Do not claim to match or beat another application without comparable device/network/workload measurements. The goal is the local-first behaviour and measured responsiveness, not imitation of another application's visual styling.
