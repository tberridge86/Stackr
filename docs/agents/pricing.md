# Pricing owner

Own reliable price retrieval and honest price evidence from provider to the screen. A successful request, stored snapshot or completed queue row is not sufficient: the requested physical card must receive the correctly labelled value through the production app's actual API.

This is a reusable specialist brief, not an installed background process. The setup audit below examined source at `6f439fd9bcf31dc69adbf55e4ebe6c4785e77b1e` on 10 September 2026. The coordinating agent also supplied the live Railway schedule/deployment check recorded below. No provider response, completed refresh outcome or authenticated device price was verified in this audit.

## Responsibilities and boundaries

- Own provider adapters, exact price identity, refresh selection/cadence, completed-sale provenance, calculation quality, freshness and diagnostic reason codes. Cover Home, binders, card detail and Market consistently with their actual API paths.
- Maintain a source register distinguishing implemented adapter, configured credentials, permitted/enabled runtime lane, recent provider success, stored evidence, API readability and observed app result. A configured key or adapter `healthCheck()` is not live-price proof.
- Prioritise the existing authorised sources and current owner use. Reuse recorded authorisation; do not introduce recurring permission forms. Preserve actual access controls and never invent provider access, enable dormant integrations merely to clear an error, or buy a new subscription.
- Submit bounded code changes and meaningful regression evidence to the release owner. The release owner coordinates merging, deployment, rollback and the deployed acceptance receipt. Coordinate shared schema changes with the backend owner and card/provider identity changes with the catalogue owner.
- Do not delete historical price evidence, edit approval ledgers, weaken owner authentication, send external messages or make unapproved production writes. Provider credentials and owner tokens stay server-side and out of receipts.

## Source and operating-path audit

| Source/path present in this checkout | What it can represent in this implementation | Operational proof still required |
| --- | --- | --- |
| TCGdex exact provider service: `backend/lib/marketPricing/service.js`, `backend/lib/tcgdex.js` | Source-labelled market estimates, currently raw near-mint GBP and an exact normal/default variant. Requires an exact approved TCGdex alias, matching language/number and provider timestamp. It explicitly sets `proven_last_sold: false`. | Current deployed service/worker SHA, enabled owner configuration, a successful exact provider response, persisted snapshot and authenticated readback. An image or metadata match alone does not establish a price. |
| eBay active adapters: `backend/lib/pricingV2/adapters/ebayActive.js`, `backend/lib/marketPricing/ebayBrowseSource.js` | Active asking/listing prices. The Browse source's sold method explicitly returns unavailable. | Valid server credentials, quota, exact matches and a deployed supported path. Do not claim that these adapters provide eBay last sold. |
| Generic eBay sold adapter: `backend/lib/pricingV2/adapters/ebaySold.js` | A configurable external completed-transaction endpoint, not proof of access to an eBay-wide sold API. Requires endpoint, token, enabled flag, authorised flag and qualifying records. | Identify the real configured provider and response contract. `.github/workflows/price-refresh.yml` hardcodes this adapter's sold enabled/authorised flags to `false`; its existence is not activation. |
| PokeTrace sold adapter: `backend/lib/pricingV2/adapters/pokeTraceSold.js` | Completed-sale evidence only when activation and strict sale/identity checks pass. Its exact card resolver currently requires `market: us`; conversion to GBP cannot establish a UK sale. English/Japanese/Chinese game mapping exists; Korean has no game mapping in this resolver. | Current provider entitlement, enabled runtime, existing recorded activation requirements and a real exact-sale benchmark/readback. Do not infer coverage from declared adapter languages. |
| Existing caches and manual evidence: `backend/lib/pricingV2/adapters/existingStackr.js`, `manualVerified.js` | Stored estimates and separately qualified evidence. Legacy `ebay_average` remains an estimate. A manually reviewed comp still needs transaction evidence. | Source/time/identity completeness and actual rows. Cache presence is not a recent provider success. |
| Legacy provider helpers: `lib/pricing.ts`, `backend/server.js`, `scripts/daily-tcgcsv-sync.ts`, `scripts/sync-market-products-tcgcsv.ts` | PokeTrace aggregates, PokemonTCG.io/TCGplayer/Cardmarket data, TCGCSV estimates and the legacy SerpApi-to-Browse path. These are separate from the current exact owner TCGdex lane and canonical sold publication. | Establish which app path still consumes each helper and whether its job is deployed. Never describe market aggregates, search snippets or a Browse fallback as an individually evidenced final sale. |

The main service now reads `api.market_price_estimates` and, when empty, can return a source-labelled TCGdex snapshot with exact/default identity constraints. Therefore an empty canonical estimate store alone no longer proves that every price must be absent. See `backend/lib/marketPricing/service.js` (`price`, `findLegacySnapshotEstimate`, `legacySnapshotEstimate`).

There are two operational families to inspect. `scripts/refresh-owner-provider-prices.mjs` is the newer bounded exact owner TCGdex worker, with identity rules in `scripts/lib/owner-provider-price-refresh-core.mjs`. The legacy/V2 GitHub workflow is separately implemented in `.github/workflows/price-refresh.yml`, `scripts/price-refresh.ts` and `scripts/pricing-v2-refresh-worker.ts`. Do not revive the older V2 worker without checking the current owner rollout arrangement.

The 9 September cadence note describes Railway automatic owner refresh every six hours, maximum 30 cards, and its manual queue every five minutes, maximum 12 rows. The source's Home polling reads stored prices every three minutes; it does not fetch providers. These are schedules/limits, not proof that all collection prices refresh within six hours. See `docs/releases/price-refresh-cadence-20260909.md`.

The coordinating agent's read-only Railway `get_status` check on 10 September confirmed the following in production project `d205637b-5376-41aa-9169-1015ba88fec3`, environment `b4304736-cac8-4ca9-92a7-93f7f6499c2f`:

| Service | Configured cron | Latest deployment recorded by live status |
| --- | --- | --- |
| `marvelous-surprise` (`ff1e8d30-4307-45be-855c-5f83f092d8a5`) | `0 */6 * * *` | `SUCCESS`; `2ffa9698-7033-4b3f-bc98-c91748bb68ab`; 9 September 21:52 UTC |
| `marvelous-surprise Copy` (`c4c52418-b307-4c9f-9ffd-e67be163c366`) | `*/5 * * * *` | `SUCCESS`; `a910d57d-3b14-41a2-b947-abfbda941768`; 9 September 21:54 UTC |

This verifies that two scheduled services are deployed. It does not verify that the latest invocation produced a quote, cover the whole collection, or establish any completed-sale evidence. The next task must inspect actual outcomes and coverage rather than treating every price job as still stuck.

In a separate live GitHub read on 10 September, the coordinator found current-main `Stackr Price Refresh` run `34499879414` pending and the preceding eight refresh runs on that SHA cancelled. Production API Monitor run `34484619404` succeeded. These statuses do not identify the pending cause or describe Railway job outcomes; investigate this workflow separately. Source: [GitHub runs for the audited SHA](https://api.github.com/repos/tberridge86/Stackr/actions/runs?head_sha=6f439fd9bcf31dc69adbf55e4ebe6c4785e77b1e&per_page=20).

## Known evidence and current diagnostic leads

The 8 September inspection recorded an empty canonical estimate store and a GitHub refresh run `34061375184`, created 6 September on older SHA `a335d64b1c6f025c7e94fa6013614b6d70fbb2c3`, waiting for protected production approval and occupying the serialized refresh group. It also recorded 1,091 TCGdex/TCGplayer-labelled snapshots and 120 TCGdex/Cardmarket-labelled snapshots, plus 332,374 unlabelled historical snapshots. This is dated evidence from `docs/releases/build27-data-loading-repair-20260908.md`, not today's count or current blocker. The newer owner worker may supersede that blocked lane for supported cards.

Investigate these concrete source-level limitations before adding providers:

1. **Repeated selection of recent holdings.** The owner worker scans newest `user_card_variants.updated_at` records and selects a bounded prefix of eligible identities. The inspected selector has no refresh-age cursor or rotation. Measure whether older eligible holdings are repeatedly missed before proposing a fairness fix.
2. **Narrow supported scope.** Normal/default near-mint raw cards are eligible for the current owner refresh. Holo/reverse/special finishes, slabs, unsupported conditions and unresolved aliases must be reported separately, not silently omitted from a whole-collection coverage claim.
3. **A completed job can contain zero useful quotes.** The worker reports `refreshed`, `unavailable`, `failed`, queue retries and terminal states; it exits nonzero for `failed`, not necessarily for all-unavailable results. A terminal queue row can mean unsupported identity or retry exhaustion. Verify persisted values and outcomes, not green job status or `processed_at` alone.
4. **Freshness differs from fetch time.** Exact TCGdex snapshots expire six hours after the provider's own timestamp. A successful pull can correctly return a stale estimate. Older snapshots without expiry are `source_timestamped`, not certified fresh. The V2 config also contains static fallback FX rates, so a fetch timestamp must not be presented as the time an exchange rate was observed.
5. **Owner access must work across services.** `backend/lib/marketPricing/personalAccess.js` defaults to personal pricing and fails closed when owner configuration is absent. Distinguish 401/403/503 from an honest no-price response; the existing public release probe can pass by proving anonymous denial without proving a usable owner price.

## Data quality contract

- Match canonical printing and variant, set/collector number, language, edition and finish. Keep raw condition separate from grader and exact slab grade; keep sealed products separate. Ambiguous aliases are unavailable, never a guessed English substitute for a foreign card.
- Preserve original item amount, currency, source/provider/item IDs, source URL, sale timestamp, fetch timestamp, price basis and evidence hash. Keep shipping unknown when absent; zero shipping requires evidence. Store FX source/rate/as-of independently from retrieval time. Do not mix delivered prices with item-only prices or undocumented provider aggregates.
- “Last sold” means the most recent individually supported completed sale for the exact identity. A sale-derived median/estimate keeps its estimate label. Unknown accepted best-offer amounts, unsold auctions, asking prices and a search result saying “sold” cannot be promoted to final paid amounts.
- Deduplicate repeated observations and cross-provider eBay item IDs; exclude conflicting prices/timestamps and record the reason. Keep auditable exclusions for mismatches, lots, outliers, insufficient provenance and missing required fields. Do not delete evidence to improve a score.
- Show count after deduplication/exclusions, eligible date range, source count, methodology and confidence basis. `backend/lib/marketPricing/estimateBuilder.js` currently requires at least three qualifying sales by default; its confidence score is an internal heuristic, not a statistically calibrated accuracy percentage.
- Keep fresh, stale, pending, source-timestamped/unknown-age, unsupported, no evidence and provider error distinguishable. Unknown values stay null. Home should retain an honest priced subtotal and unpriced-unit count instead of valuing missing cards at £0 or fabricating chart movement.

Implementation anchors: `backend/lib/marketPricing/soldProvenance.js`, `estimateBuilder.js`, `publishEstimates.js`; `backend/lib/pricingV2/normalise.js`, `statistics.js`, `config.js`; `lib/collectionPricingApi.ts`, `lib/collectionPricingState.ts`, `lib/homePriceRefreshCore.ts`, `lib/personalPriceRefresh.ts`, `lib/pricingV2.ts`.

## First useful assignment

Produce one dated **missing-price baseline and exact-variant trace** before proposing a new feed.

1. Obtain read-only current deployed SHA/config-presence and recent worker receipts for both Railway owner jobs and GitHub refresh. Record actual target project, schedule, disabled/waiting/running state, selected identities, last successful quote and last execution separately. Never print secret values. Resolve the old approval incident's current relevance through the release owner.
2. Freeze a defined cohort of unique owned price identities, split by language/product type/condition/finish. Record whole-cohort size, currently supported size, unresolved size and reason counts. Include one proven supported normal card, one missing-price owned card and one unsupported finish or grade; use the shared catalogue/performance fixture identities where applicable.
3. Trace each through canonical/provider identity, provider result or existing receipt, snapshot/estimate, owner-authenticated backend and gateway, and app label. An existing stored quote suffices for the first read-only pass. If a write is needed, prepare one exact supported canary using the existing lane and hand it to the release owner under the established rollout authority.
4. Diagnose the largest demonstrated loss: scheduling, provider error/quota, identity, unsupported scope, persistence, stale data, auth or UI. Give one bounded repair and the proof required to close it. Run only the regression suites relevant to that repair, such as `test:owner-provider-price-refresh`, `test:personal-pricing`, `test:live-pricing` or `test:collection-pricing-ui`.

Close the canary only when its correctly scoped value is readable through the owner path with real source/time/label evidence, and an unsupported control remains honestly unavailable. For sold activation, additionally prove the individual final-price evidence and canonical publication; a TCGdex estimate canary cannot close the sold-feed objective.

## Metrics and handoff

Always include observation UTC time, deployed SHA, cohort definition and denominator. Use `not measured` until a measurement exists; never infer percentages from source files or snapshots spanning repeated dates.

| Metric | Exact reporting rule |
| --- | --- |
| Useful fresh price coverage | Unique eligible identities with a correctly scoped, source-labelled, unexpired usable API price / all unique identities in the frozen supported cohort. Also show coverage against the whole owned cohort so unsupported cards stay visible. |
| Sold-evidence coverage | Exact identities with at least one qualified individual completed sale / explicitly defined sold-eligible cohort. Separately count identities meeting the sale-derived estimate threshold. |
| Refresh outcomes | Attempts, persisted quote successes, unavailable, failed, retried, terminal-unsupported and terminal-exhausted by provider/language/scope. Count queue completion only with its actual outcome. |
| Freshness and no data | Fresh/stale/unknown-age/no-evidence/pending counts; age distribution by provider timestamp; most recent sale timestamp and fetch timestamp separately. |
| Queue health | Oldest due request, due count, processed-success count, retry/exhaustion count and request-to-readable-value p50/p95, with sample count and interval. |
| Coverage fairness | Unique eligible identities successfully refreshed in 24 hours/7 days, repeat selections and eligible identities never selected. No six-hour full-collection claim from a 30-card cap. |
| Match quality | Reviewed exact matches / manually checked fixture records; rejected language/variant/grade matches; deduplicated sale counts and excluded outliers. Report sample limitations. |

Return a short handoff: demonstrated cause, affected cohort, change/PR or no-change finding, local verification, source/current-runtime evidence, unresolved technical gate and next owner. Set outcome targets only after the baseline and existing provider limits are known. Keep the shared status updated when work runs; this brief creates no recurring timer or email alert.
