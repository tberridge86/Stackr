# Stage 10: Stackr Pricing Service

Stage status: implemented behind Stackr API v1 projections. No production refresh job or provider credential was activated.

## Current State Found

- The repository already had a legacy `/api/pricing/:cardId` route and `backend/lib/pricingV2` scoring modules.
- The canonical Stage 2 schema already had a private `market` schema, but it only contained market identities, generic observations and summaries.
- Pricing V2 already separated active listings from sold evidence in code, but the public API did not yet expose the requested `/v1` pricing contract.
- eBay active listing access is implemented only through the official Browse API OAuth flow. eBay sold data remains unavailable unless an authorised sold-data source or legitimate import is configured.

## Implemented API

- `GET /v1/cards/{variantId}/price`
- `GET /v1/cards/{variantId}/price-history`
- `GET /v1/market/movers`
- `GET /v1/market/opportunities`

Responses use the existing Stackr API envelope, request IDs, API version headers and cache headers.

The price endpoint returns `unavailable` with a reason when exact evidence is insufficient. It does not fill a missing raw, graded, sealed, language, variant or grade price with unrelated evidence unless a future estimate row explicitly contains a labelled `fallbackEstimate`.

### Stored catalogue browsing

`POST /v1/market/catalogue-prices` remains a personally authenticated, read-only
bulk path accepting 1–100 exact references. It does not call providers, enqueue a
refresh, persist evidence or value holdings. Exact stored evidence for the
selected finish takes priority, including stale values and qualified sale
provenance. Catalogue facts render independently of asynchronous price decoration.

The new client explicitly opts in with `classificationVersion: "classified-v1"`.
Requests without this capability keep the legacy contract and do not call the
classification RPC. A new client encountering an old strict backend retries
without the option only for `400 invalid_price_read`, and remembers legacy
support only after that retry succeeds. Auth/denied/timeout failures never
trigger this downgrade. General classified cache entries use a new namespace.

For opted-in general browsing only, selected resolved raw identities without an exact
quote may consult the optional service-only
`api.read_pricing_classifications(uuid[])` RPC in one batch of at most 100 IDs.
Printing-guide reads use the same selected gap identities, never all candidate
finishes. The entire stored read has a 2,500 ms deadline; classification, the two
printing guides and optional published baseline metadata share one 450 ms
ancillary budget with transport cancellation. A transport that ignores abort
cannot hold or later alter the returned response. Missing additive RPC schema
retains the compatible existing fallback. Initial identity-read failures reject
the request. Ancillary permission, authentication, malformed batch and timeout
failures are explicit per-reference `readErrors`; stronger exact and successfully
classified rows still return. Failed references have no fabricated unavailable
price or replacement revision. Prices, unchanged references and failed references
form a complete, disjoint partition. The client commits successful rows, keeps
previous failed-reference evidence stale with backoff, and surfaces a partial-read
error to the diagnostic observer. It never caches an empty failed reference as
authoritative unavailable. Legacy requests keep their prior guide error contract.
When a list spans several 100-reference batches, partial failures accumulate
while independent batches continue and publish their successful rows. The client
throws one combined partial-read error after those batches settle. Fatal auth,
account, route and cache-generation cancellation still stop obsolete requests;
they are not replaced by an earlier partial error.
Due refreshes of fully cached stale pages are also awaited within a multi-page
operation, so a fatal failure on that page prevents subsequent requests. Cached
rows still publish immediately before the refresh settles. Ordinary cached
single-page reads retain their background refresh behavior.

The adapter accepts `MARKET_GUIDE` and `ESTIMATED_VALUE` only for current-policy,
identity-bound English/Japanese TCGCSV raw market evidence with a matching
printing, set, catalogue version and language, explicit finish scope, finite
confidence, positive GBP amount and valid source/retrieval/expiry and original
currency/FX provenance. A printing-level guide remains condition-unspecified and
general and requires a source amount below £20. Market-guide values equal the
verified GBP source amount; the estimated tier applies the stored policy's
positive tenth-pound rounding/minimum to a source amount below £2. The source
record's central amount must match its USD amount multiplied by the retained
USD-to-GBP rate, either at source precision or the writer's penny rounding.
Returned source dates and expiry must agree with provenance and the underlying
record by timestamp instant, and source ≤ retrieval ≤ classification check time.
Missing, invalid, conflicting or future chronology is unavailable. Missing/invalid expiry is unavailable, never fresh. A valid expired
guide remains stale. These guide classifications carry no completed-sale claim
and no invented observation count. Blended-language Cardmarket classifications,
unknown providers, unsupported provider languages and retained conversions
without usable FX timestamps remain unavailable through this adapter. Existing
separately reviewed guide paths remain compatible when classification is absent.

An identity-bound `PRICE_UNAVAILABLE` decision (or a rejected malformed
classification) suppresses weak general/provisional fallback for that selected
row. The app preserves this decision across its account/auth/language/mode
scoped cache and restarts. It preserves stronger embedded or exact stored
quotes. Eligible unclassified ordinary modern common/uncommon raw cards retain
the current `catalogue-rarity-era-baseline-v2` fallback, labelled
`Estimated price (provisional baseline)`, low confidence; the retired v1 model
guard remains intact. This provisional amount is neither calibrated market
value nor sale evidence and is not usable for holdings, graded or sealed prices.
Display amounts round to GBP pennies; stored amounts and source provenance keep
their original precision.

This optional source integration does not establish that the classification
schema/ACL is currently deployed, that historical migrations match the current
ledger, that any current cohort has useful evidence, or that an authenticated
installed app receives it. Those live-data, deployment and device checks remain
separate release gates; no classification worker or migration is activated here.

## Market Model

New private market entities:

- source providers;
- currencies;
- exchange-rate snapshots;
- conditions;
- graders and grades;
- duplicate groups;
- active listings;
- sold observations;
- price estimate versions;
- price estimates;
- outlier decisions;
- refresh jobs.

The migration also extends `market.price_observations` with Stage 10 provenance fields for provider code, source item ID, observed price, shipping, currency, listing/sale type, condition, grade, sold time, source URL, raw title, match confidence, duplicate group and ingestion run.

## Provider Boundary

The new `PriceSource` adapter contract requires:

- `identifySource`;
- `healthCheck`;
- `fetchActiveListings`;
- `fetchSoldObservations`;
- `normaliseObservation`;
- `validateObservation`.

The eBay Browse adapter:

- uses OAuth client credentials for official active-listing access;
- does not claim to support sold observations;
- returns `sold_data_not_available_from_browse_api` for sold-data calls;
- validates that active listings are not normalised as sold observations.

## Calculation Rules

The current estimator keeps these evidence classes separate:

- active asking prices;
- accepted offers;
- auction results;
- confirmed sold transactions;
- raw-card values;
- graded-card values;
- sealed-product values.

The existing Pricing V2 statistics continue to use duplicate grouping, median absolute deviation outlier handling, recency weighting, sample counts, source counts, confidence and freshness.

## Security

- Raw provider payloads, internal notes and credential references remain in private `market` tables.
- `api.market_price_estimates`, `api.market_price_history`, `api.market_movers` and `api.market_opportunities` are public-safe projections but are granted only to the backend service role.
- Direct `anon` and `authenticated` access to `market` tables and Stage 10 market projections is revoked.
- No provider secret or Supabase service-role key is exposed to the client bundle.

## Rollback

Use:

`supabase/manual/rollback_20260728171416_stackr_market_pricing_service.sql`

This drops Stage 10 views and tables and removes the added Stage 10 columns from `market.price_observations`. It does not drop the `market` schema because earlier stages own objects there.

## Remaining Gaps

- Production sold-data access is not configured and must remain unavailable until approved access or a legitimate import exists.
- Refresh workers are modelled but not activated.
- Exchange-rate snapshots are modelled; live rate ingestion still needs a licensed provider adapter.
- Legacy `public.price_observations` remains for the existing app compatibility path.
