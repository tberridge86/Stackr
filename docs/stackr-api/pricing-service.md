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
