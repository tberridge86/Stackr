# Daily pricing readiness — 10 October 2026

This audit extends coordinated release PR #323 from base `f4160709ef6eb6f144d022e2cecc565ea729fa5d`. The candidate is implemented locally and independently reviewed; integration checks and live promotion remain separate. No pricing worker was deployed or refreshed, no remote database script or catalogue mutation ran, and the removed Codex schedules remain off.

## Actual delivery lanes

| Lane | What it can provide | Daily boundary |
| --- | --- | --- |
| Retained TCGCSV bulk data | Printing/finish market guides for supported English/Japanese groups; original USD amount, observed FX, dataset date and expiry | Durable per-set checkpoints refresh provider groups instead of making one provider request for every card |
| Retained Cardmarket public guide | Reviewed-printing blended estimate with original EUR, observed FX and feed revisions; exact language, condition, finish and grade remain unknown | Daily provider revision; hourly checks reuse verified retained files and checkpoints |
| Exact TCGdex wrapper | Source-labelled estimate for a supported canonical raw near-mint GBP variant; never an individual sale | Supported identity/scope only, with inflight and cooldown checks; older FX/source limitations remain below |
| Canonical sold publication | Supported transactions or labelled sale-derived estimates for exact identity | Requires qualifying evidence and an authorised source; elapsed time cannot create a missing sale |
| Provisional model v2 | Labelled ordinary modern common/uncommon estimate for safe browsing | Not market/sold evidence or a holdings valuation; no cheap rare, vintage or unknown fallback |

## Read-only production observations

The coordinating agent inspected existing Railway production services on 9 October. TCGCSV checks hourly at minute 13 UTC and Cardmarket at minute 17. Successful executions were recorded at 19:14 UTC and 19:20 UTC, but the services use different source branches: TCGCSV `7dc63aab2bb7be9ca69e77e686ef7722db6927a7` and Cardmarket `f6aee12a18a89c28b8fd1b9c234a9d834e8ced4b`. Their source was compared with the existing candidate worker files; no replacement pipeline or branch import was invented.

The TCGCSV run reported `needs_mapping`: English 168 complete/52 unmapped groups, Japanese 163 complete/298 unmapped groups, 23,125 retained English quotes (12 stale), 6,976 Japanese quotes (24 stale) and 36,336 open repairs. The 76,272 outcome rows include 4,810 without a provider quote, 1,240 unsupported finishes and 28,813 unsupported languages. These are distinct group, quote and outcome counts, not a denominator of unique current priced cards; they cannot be added to Cardmarket estimates.

The coverage scan counted 76,317 published members before physical identity joins, 45 more than its classified outcome total. The new receipt exposes published/classified/unclassified counts, and cannot certify complete coverage while that difference exists.

Cardmarket reported 9,234 reviewed mappings, zero new stores, 35 repairs and a complete cached/resumed invocation. That log did not expose the provider-created time, so it does not prove current quote freshness. TCGCSV's public metadata advanced to `2026-10-09T20:05:19+0000`; the earlier 19:14 sweep using the previous day's source was consistent with that publication timing.

Historical 6 October receipts measured approximately 38,371 positive variants among 76,030 in a four-language cohort. That is dated coverage evidence, not today's catalogue coverage. Neither successful process exits nor cached zero-write runs establish that every card is priced or freshly valued.

## Implemented readiness corrections

- A shared rolling 48-hour provider-age gate uses the dataset/feed publication time. Missing, expired or future source dates beyond a five-minute clock-skew allowance cannot be republished as current. Cardmarket checks this before database writes; TCGCSV checks it before beginning the group sweep and during page planning. Genuine older stored quotes keep their stale status.
- Both provider market amounts must be positive and remain positive after penny rounding. A provider zero or tiny placeholder does not become a priced card. Cardmarket records rejected sub-cent values as explicit repair outcomes.
- TCGCSV rejects malformed, excessively future, expired or regressing publication metadata before accepting a feed revision, preserving prior retained data instead of poisoning its hourly cache.
- Cardmarket acknowledges full reviewed identity, including catalogue version and evidence, rather than only a reusable product number. New or corrected mappings reset the same-guide cursor atomically with acknowledgement. Changed product catalogues resolve their own revision. Old checkpoints re-verify identity once; unchanged identities/guides remain no-ops.
- Compact daily receipts expose provider age, processing completion and per-language counts. `fullCatalogueCurrent` remains false when coverage is unavailable, repairs remain, or prices are missing/stale. Cardmarket's blended scope never certifies full exact coverage.
- Existing worker images explicitly include the shared status helper. The cron wrapper resolves completion once, preserves its deadline result and avoids a lingering kill timer after synchronous shutdown.
- The existing GitHub scheduled bulk lane can be suppressed by `STACKR_CATALOGUE_PRICING_SCHEDULER=railway` while protected manual dispatch remains available. The code introduces scheduler ownership; no repository variable or live schedule was changed.

## Exact identity and history corrections

- Refresh product/condition/currency and slab qualifiers are validated before an existing inflight promise or cooldown can be reused. Unsupported requests cannot inherit the raw near-mint GBP response for the same variant UUID.
- Graded prices require both grader and grade before querying estimates. A latest competing slab cannot satisfy an incomplete identity. Raw legacy fallback/refresh rejects slab qualifiers.
- The market panel now keeps its visual default PSA label separate from the requested pricing identity. Raw cards request raw prices without an invented grader. Grade-only or grader-only inputs preserve incomplete slab intent and cannot fall through to raw prices or raw history.
- Raw history defaults to near mint, consistent with its price endpoint, and preserves an explicit alternate condition. Variant, product, condition, currency and asking/sold types stay separate. Foreign observations retain their recorded original currency; there is no implicit history FX conversion.
- Exact numeric graded history returns `422 unsupported_graded_history_identity` before querying evidence. The current projection supplies only a display grade label, which cannot establish a requested numeric grade. Existing correctly scoped slab prices remain available; the client treats unsupported history separately from price failure.
- Client history requests the selected raw condition, GBP and sold observations with a maximum of 200 rows. Optional `provenOnly` and `soldSince` filters apply on the server before pagination so newer unverified/old sales cannot hide a qualifying sale. The client also validates exact variant/currency/condition, proven sale/date and duplicates. Item prices exclude delivery; missing delivery stays unknown. History caches include account and identity scope; pending price/history responses recheck the active account before return.
- The actual chart plots `poketrace_sold` with a PokeTrace verified-sales label, preserves unfamiliar verified providers, displays single-sale sources and aligns providers on their real sale dates. Graded history remains explicitly unavailable rather than borrowing another slab's sales.

## Validation

`npm run test:daily-pricing` passed all nine local fixture groups: compact coverage/freshness status, bulk source acceptance, bulk sweep exit status, cron shutdown, Cardmarket guide/checkpoint identities, daily worker behavior, cached ingestion, coverage reporting and actual client/panel/chart behavior. The final client fixture also passed after adding raw, exact slab and incomplete slab caller cases. These use local mocks and fixtures, not live catalogue writes.

`node scripts/test-market-pricing-service.mjs` passed after the backend corrections. It exercises actual service/router paths with loopback HTTP and mocked providers, including concurrent valid/unsupported refreshes, incomplete vs exact slab prices, played/NM/foreign/slab history separation, pre-query graded-history rejection and filtering qualifying recent sales before a capped page. The actual-client fixture checks delayed responses across account changes and the rendered source/date chart.

Gateway validation and forwarding passed all 51 tests. Generated contract validation passed all 43 operations. App/backend typechecks, deployment-tooling, price database/FX fixtures and scoped `git diff --check` passed. Lint completed with zero errors and eight pre-existing warnings. Earlier baseline CI is not proof for this diff.

Independent read-only pricing review found no remaining actionable defect in the final task logic. It covered the daily workers, client/panel/chart, service, gateway, contracts and fixtures. Review is not live activation evidence: complete catalogue freshness, daily capacity and actual API/native delivery remain unverified.

The frozen-source production-profile local iOS export passed with 3,364 modules at pricing source `07c12e024669acf1d0ed49bde7cc81b732ac4cb2`: `entry-c5e00ec45b83c2b4c73d527d8bc28832.hbc`, 11,593,655 bytes, SHA-256 `6066af05384e7532e8b860dd2967abd9ffe7b125791aadcaedb20214d56cd30e`. This supersedes the preceding local export receipt. Its guard verified the updated exact-history/delivery markers, existing v2/retired-cache guards and all 33 required opening/loader/cover assets. This is unsigned local bundle evidence, not a signed native build, TestFlight upload or measurement on an iPhone. The PR checks report CI for the exact candidate commit separately.

## Remaining boundaries and promotion

The older exact TCGdex wrapper still uses its existing conversion policy and its legacy snapshot converter collapses underlying provider/FX detail into the wrapper label. The observed daily FX in bulk guides must not be confused with newly verified FX for those legacy snapshots. Previously stored market columns copied from asking floors cannot be identified or rewritten merely from their amount; they need a separately approved bounded refresh or reviewed source evidence.

Unresolved mappings, unsupported languages/finishes and exact graded-history identity remain explicit limitations. Current complete catalogue coverage and daily capacity across all physical cards are unmeasured. Promotion must identify the exact source for both existing daily workers, set one scheduled bulk owner, verify fresh source-dated persisted readback and gaps, and verify the matching API/client behavior before reporting live delivery. Cardmarket's live watch patterns also need `scripts/catalogue-price-daily-status.mjs` and `scripts/catalogue-price-database.mjs`, so future shared-helper fixes rebuild its image. Ship gateway/backend history-query support together before the updated mobile client. This document does not authorise those operations.

Provider cadence/capability: [TCGCSV](https://tcgcsv.com/) publishes around 20:00 UTC daily and does not supply condition-specific SKUs; [Cardmarket's public guide announcement](https://news.cardmarket.com/en/StarWarsUnlimited/were-making-the-price-guide-and-product-catalogue-available-for-download) describes daily guide publication. Neither source turns an aggregate guide into an individual last-sold transaction.
