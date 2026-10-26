# Remaining frontend query boundaries — 2026-10-24

This is a scoped source audit of the architecture integration candidate. It is not a claim that every frontend request meets the 50-row rule, that production has changed, or that retrieval is below 100 ms.

## Ownership paths repaired in this candidate

`lib/ownership.ts`, `lib/collectionSummary.ts`, `lib/pokedexCollection.ts`, `lib/binders.ts`, `features/binder/BinderDetailScreen.tsx`, and the trade selector in `app/offer/new.tsx` now request at most 50 rows per paged ownership response. Independent work in this candidate also bounds Home's saved-card reader and the Binder library's saved-card and catalogue enrichment readers. Search and market-mover client contracts have their own focused changes and tests.

The ownership changes preserve complete logical results across pages. A short server page is not proof of completion; offset readers advance by received rows and require an empty terminal page. Invalid, repeated, foreign-owner, failed, cancelled, or over-budget continuations reject instead of publishing a partial collection as complete. Existing account/revision guards remain in place. The binder directory additionally subscribes to account changes while reading or enriching cached results, shares one 10-second deadline across its saved-data pages, and refuses more than 256,000 directory rows.

Home and Binder library saved reads also share a 10-second parent deadline. Their reusable pager enforces a 256,000-row ceiling across all filter chunks; exceeding it rejects without publishing a partial result. The 1,702-row saved-card fixture requires 36 requests at 50 rows per response or 102 requests under a 17-row server cap. Optional catalogue enrichment retains its shorter deadline and reports unknown totals when required facts are unavailable. Offset pagination does not provide a database snapshot across concurrent deletions.

Existing request budgets preserve their prior logical row capacity: Pokedex 128,000 rows, Binder detail supplemental ownership 51,200 rows, and saved binder cards 256,000 rows at a full 50-row page size. These are safety ceilings, not demonstrated throughput. Existing operation deadlines still apply; timing out must offer retry and preserve prior good UI state.

This is a response-size correction. Full collection totals still require multiple client requests. For example, the summary regression with 1,003 saved rows now needs 22 requests including the empty terminal page, rather than two larger responses. No extra unbounded concurrency was introduced. Production request amplification, cancellation behavior on real transports, and end-to-end latency remain unmeasured. Benchmark representative small, large, multilingual, and master-set collections before promotion; a server aggregate remains the preferable long-term solution for totals.

## Confirmed live sites outside this scoped patch

| Site | Remaining behavior | Follow-up and useful regression |
| --- | --- | --- |
| `lib/collectionExport.ts` — `createCollectionExport` | 200-row binder/card pages; short-page termination. This is a client metadata export. | Use complete 50-row paging while preserving the 500-binder/10,000-card caps, account checks and export deadline. Test a lower server cap and failure after the first page; never export a partial collection as complete. |
| `app/(tabs)/community/index.tsx` — `loadCollectors` | Fetches up to 250 directory rows and filters the loaded population on the client. | Add server search plus a stable continuation cursor and 50-row responses. Test a matching collector beyond the first page and stale search cancellation. |
| `app/prices/index.tsx` — card search | Builds a `pokemon_cards` query with `limit(500)`. | Move to the bounded shared search contract with visible continuation. Test matches after row 50 and filter/sort consistency; simply cutting the limit loses results. |
| `features/listing/CreateListingScreen.tsx` — `fetchCertificationDuplicateReview` | Loads up to 500 graded listings, then checks certification data on the client. | Query an indexed normalized certification key or an authorized existence/aggregate endpoint. Test a duplicate beyond the former first page; truncation can incorrectly clear the duplicate warning. |
| `lib/activity.ts` — `fetchActivityFeed` | Fetches 100 posts, then unbounded profile, reaction and follow rows. | Page posts at 50; return reaction counts/current-user reaction from an aggregate and scope follow/profile lookups to the visible page. Test many reactions on one post and a followed author beyond the first lookup page. |
| `lib/scannerAnalytics.ts` — `fetchScannerAnalyticsDashboard` | Fetches up to 2,000 detailed events and calculates dashboard statistics in the client. | Calculate authorized date-window aggregates on the server and fetch a separate bounded latest-error page. Test totals over 2,000 events and date-window boundaries. |

These sites need separately reviewable changes. The user's architecture authorization covers them; leaving them listed here is an implementation scope boundary, not a permission restriction. This is not an exhaustive certification of every application query.

## Local catalogue and asset distinctions

`lib/localCardIndex.ts` has an unused `PAGE_SIZE = 1000` constant. Its `STORAGE_CHUNK_SIZE = 500` controls AsyncStorage chunks, not network responses. Its live `fetchAllScanCards` path still walks set metadata for all languages with four concurrent set reads, then caches card metadata and image URL strings for OCR matching. A scoped candidate lookup or incremental index would reduce this work. It does not download the complete card-image library; no complete 100,000-image local synchronization path was identified in this audit.

The 250-row legacy Pokémon API helpers in `lib/pokemonTcg.ts` had no confirmed call sites in the audited tree and are not counted as live violations. Server ingestion and background jobs may process bulk metadata/assets under the Railway pipeline; they are distinct from frontend payloads. Count-only queries using `head: true`, single-row existence checks, and local in-memory/storage chunk sizes are not oversized row responses.
