# API-first stabilisation and bounded cleanup — 22 September 2026

## Status and evidence boundary

Audited GitHub main: `478b3a5bf1fc955f31119f03367efcf65a05fe47`.
This is a source-cleanup candidate plus an execution brief, not a completed architecture migration, database cleanup or mobile release. The user's dirty Windows checkout was not accessed. No production rows, indexes, policies, objects, configuration or deployments were changed.

The first implementation removes unreachable private helpers from `lib/cardSearch.ts`. Its exported function, options, canonical search call, existing presentation enrichment and output mapping are retained. The removed code included a separate set matcher, fuzzy-scoring implementation and direct-table fallback helpers that were not called by the current exported function. This reduces maintenance ambiguity; it does not establish a runtime speed gain or remove downstream provider enrichment.

Validation in the isolated environment: existing grading-intent assertions and 20 new adapter scenarios passed with Node 22.16 and the available TypeScript compiler. The new suite is called by the existing `test-card-search-intent.mjs`, already included in `test:ux-service-release`. It checks short/grading-only input, language forwarding, number queries, canonical identity/artwork/provenance mapping, defaults, all-language scope and error propagation. Network dependencies are mocked; this does not validate the live API, dependency import side effects, account access or the phone.

Full locked-dependency app typecheck, lint, existing integration suites, native bundle and physical-device acceptance remain open. Keep the candidate draft until those checks are satisfied. No paid build request is needed to inspect this source cleanup.

## Architecture decision: consolidate, do not rebuild

Use the existing Stackr API as the application-facing authority and existing PostgreSQL/Supabase persistence as the authoritative stored data. Do not create a second database, second gateway, new search service or extra scheduler for this work.

External providers -> existing ingestion/price workers -> validated canonical records and approved object storage -> existing Stackr API -> versioned device cache -> screens.

The API owns identity, read contracts, artwork references and source-labelled pricing. Image bytes should use approved object storage/CDN paths, not JSON blobs or mandatory API proxying. Authentication and authorized media transfers are not catalogue-provider bypasses; preserve them.

Ordinary catalogue reads must not wait for external price or artwork providers. Cached results must retain version/freshness information and cannot silently override authoritative identity changes. Private collection/valuation caches must be account-scoped, fenced on account changes and excluded from shared public caches.

## Ordered execution work

### 1. Finish the utilisation map before cutting paths

Trace Search, Discover Sets, Pokédex, Binder library/detail/add-cards, Marketplace and Home. Record actual route, adapter, table/RPC, cache key, invalidation, request count, provider dependency and failure behavior. Inspect installed configuration as well as source.

Known inspection points include `lib/cardSearch.ts`, `lib/stackrDomainAdapter.ts`, `lib/pokemonTcg.ts`, `lib/stackrApiV1.ts`, `lib/stackrApiTransportPolicy.ts`, `gateway/src/cache.js`, `components/StackrImage.tsx` and the screen entry points. Do not call the map complete until downstream dependencies are traced.

The current search adapter still awaits `attachLiveTcgdexCardReferences`; that boundary needs coverage and configuration checks before removal. Do not move the same provider work to an untracked client fire-and-forget job. Publish missing enrichment server-side and consume it through normal versioned reads.

Pokédex species, binder holdings and marketplace listings have different scopes. Reuse canonical identity and query interpretation; do not force identical result sets or replace species with card rows. Preserve Japanese, Simplified/Traditional Chinese and Korean input. Test exact set, number, language and finish boundaries.

### 2. Consolidate the read path incrementally

Reuse existing API endpoints and client adapters. Batch identities, avoid per-card duplicate requests, coalesce equivalent in-flight reads, bound memory caches, cancel superseded requests and prevent an older response from replacing a newer query. Reuse existing manifest/delta mechanisms rather than adding another sync protocol.

Return a compact list projection for the first page; load optional detail independently. Distinguish errors from legitimate empty results. Retain last valid cached data on transient failure without concealing its age. Preserve real decreases, removals, corrected identities and legitimate invalidation.

Only remove a direct catalogue/provider bypass after the replacement delivers the same required records and artwork under the production configuration. Supabase auth is not removed merely to satisfy an API-only slogan.

### 3. Review measured database work, not an indiscriminate deletion list

The connected production performance advisor returned the following at `2026-09-22T19:43:57.957Z`:

| Advisory category | Findings | Interpretation |
| --- | ---: | --- |
| duplicate_index | 4 | Candidate redundant index groups; constraints/dependencies must be inspected. |
| auth_rls_initplan | 115 | Candidate repeated per-row auth evaluation; verify equivalent policy semantics before changing. |
| multiple_permissive_policies | 247 | Findings can repeat by role/action; not 247 proven redundant policies. |
| unindexed_foreign_keys | 183 | Candidates, not an instruction to index every foreign key. |
| unused_index | 201 | Counters alone do not prove an index is safe to remove. |

Duplicate groups reported:
- `local_meetup_attendees`: `local_meetup_attendees_meetup_user_unique` / `local_meetup_attendees_pkey`.
- `profiles`: `profiles_collector_name_unique` / `unique_collector_name`.
- `provider_card_records`: `idx_provider_card_record` / `provider_card_records_provider_provider_record_id_key`.
- `user_card_variants`: `user_card_variants_id_uidx` / `user_card_variants_pkey`.

The attempted read-only size/statistics SQL was blocked by the tool safety layer. Therefore table bytes, index savings, statistics-reset windows and query plans were not measured in this session. Do not label these findings the confirmed cause of mobile slowness or assign invented savings.

For the next authorized measurement, use representative hot read plans, row counts, bytes and observation windows. Preserve primary/unique constraints and RLS. Rehearse reviewed migrations in staging; test anonymous, owner, other-user, public and administrative access. Reuse existing migration history rather than rewriting applied migrations. Removal must be rollbackable.

### 4. Clean storage and repository without losing useful evidence

Classify assets and data as authoritative, derived/rebuildable, required evidence or proven orphan. Trace static, dynamic, database and manifest references before deletion. Preserve approved artwork, languages, finish identities, price history and user uploads. Do not delete an image solely because one screen does not display it.

Reuse existing raw-source version/observation deduplication. Exclude raw provider payloads from routine list responses while retaining the evidence needed to explain mappings and recover data. Apply established retention rules, not a new arbitrary purge horizon. Delete storage objects through the Storage API, not by deleting metadata rows.

Existing PR #185 owns tracked local/editor-file cleanup (44 files; 1,148,930 bytes recorded). Do not duplicate it or present it as a phone-performance fix. Review existing API-cache and price-request work (#158 and #167) against current main before reusing anything; historical drafts are not automatically current or safe to merge.

### 5. Release based on visible results

Use one integration owner and small reviewable commits. No extra feature redesign, new provider, bulk catalogue rewrite, blanket rollback or repeated build submissions.

Measure before/after on the same device, account, dataset and network: useful first content, decoded first-screen images, cold/warm/reopen timing, request counts, payload sizes and failures. Report the sample count and percentile method. A placeholder or fast empty response is not success. Proposed budgets must be labelled targets until measured.

Test one frozen cross-screen card/query cohort including all supported languages, normal/holo/reverse, known-price/no-quote/provider-error states, account switching and offline reopen. Every owned unit must reconcile to a priced or explicitly explained unpriced state; partial coverage is not a full collection valuation. Prevent transient failures from wiping usable prices.

Record source SHA, backend version, native build/update identity, actual checks and rollback for any release. Passing this bounded source test does not make Stackr production-ready. Confirm a viable native delivery route before spending another build attempt.

## References reviewed

Repository: `AGENTS.md`, `docs/agents/README.md`, `docs/agents/backend.md`, `docs/agents/performance.md`, `docs/structure-cleanup-guardrails.md`, `lib/cardSearch.ts`, `lib/cardSearchIntent.ts`, `scripts/test-card-search-intent.mjs`, `package.json`; current open PR metadata and connected production performance advisory.

Official guidance: PostgreSQL monitoring statistics; Supabase database linter; Supabase Storage object deletion. Advisor findings are a dated inspection, not a public benchmark.
