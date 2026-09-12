# Stackr retrieval contract — 11 September 2026

Status: candidate implementation; NOT a production or mobile release approval.
Scope: official binder identities, public per-set caching and optional image enrichment. Pricing, gateway owner configuration, catalogue ingestion and native release remain with their existing workstreams.

## User-visible behaviour

Open complete card identities first, retaining saved ownership and ordering. Artwork and prices cannot hold the initial catalogue response. Load images through the existing approved resolver after identities are available. Do not re-read the binder or its card identities just to enrich images. Never replace a current ownership/quantity/condition/grading/note/price field with stale enrichment.

Use bounded memory and indexed per-set SQLite snapshots for recently visited public catalogues. Namespace by the actual API origin, canonical set ID and language. Store only whitelisted public facts, never credentials, private collection state, prices or transient provider image references. Five-minute cache lifetime; changed expected counts, corrupted snapshots, expiry and explicit refresh force revalidation. This is NOT an indefinitely offline, fully synchronized catalogue.

Only admit a complete, terminal-cursor response with exact expected unique identities and consistent set, language, variants and catalogue version. A request limit of 500 does not prove completeness. Do not count fixtures, extracted summaries or HTTP 200 alone as production evidence.

Memory cache: at most 24 set snapshots / 8 MiB estimated UTF-16 footprint, at most 2 MiB per snapshot. SQLite retained payload: at most 24 sets / 8 MiB. SQLite lookup gets a 25 ms head start; a slow/unavailable optional store must not hold the network. Shared requests deduplicate concurrent readers. Explicit refresh invalidates late work. A departing caller cannot cancel another caller's shared request.

## Acceptance targets — targets, not achieved measurements

| Measurement | Bar |
| --- | --- |
| Warm memory-backed complete binder view, on target phone | p95 <=100 ms; measure actual render, not function duration |
| Persisted-cache reopen, on target phone | p95 <=200 ms including parsing and rendering |
| Complete initial network catalogue read | Every repeated warm acceptance sample <=500 ms, including all pages and JSON parsing |
| Data correctness | Complete exact expected canonical identity set every sample; variants/ownership preserved |
| Artwork | Deferred, same canonical identity/language/default finish; controlled overlays stay display-only |

Record first-observed and controlled cold-start results separately. Record p50/p95/p99/max, all failures, request IDs, endpoint, candidate SHA, time, device/network and cache state. Do not choose only the fastest samples or equate canary proxy duration with phone first render. No TestFlight/public release until normal production routing and device acceptance both pass.

## Known boundaries still requiring work

The older scanner catalogue cache persists whole arrays and its applyDelta implementation advances a cursor without applying entity changes. It must not be treated as proof of production-quality delta synchronization. This binder path uses an independent table in the existing SQLite database, does not invoke that scanner bootstrap, and does not advance its cursor.

This change does not claim to make every screen local-first. Search, home summaries, market retrieval, private ownership synchronization, image batching/cancellation under device scrolling, app restart, native SQLite execution and full on-device latency need their own acceptance evidence. The existing authorization checks remain in place; their end-to-end cost is included in device acceptance.

Reference patterns: Linear's memory/IndexedDB/sync design (https://linear.app/now/scaling-the-linear-sync-engine), Android's offline-first data-layer guidance (https://developer.android.com/topic/architecture/data-layer/offline-first), and Expo SDK 54 asynchronous SQLite and exclusive transactions (https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/). These establish design patterns, not a claim that Stackr matches a ranked fastest-app benchmark.
