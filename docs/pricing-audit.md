# Stackr Pricing Audit

Date: 2026-07-26

Supabase project: `oakdbbzdqwurpjnoqhmu`  
API URL: `https://oakdbbzdqwurpjnoqhmu.supabase.co`

## Summary

The current pricing path mixes live provider calls, cached provider estimates and legacy eBay summaries. Some UI copy still implies "sold comps" even when the data can be a cached estimate or an active listing fallback. Japanese and Chinese cards are especially exposed because the older pricing paths mostly treat language as `en` or `ja`, while newer catalogue work uses `zh-tw` as a distinct language lane.

Pricing Engine V2 has been added as a parallel, feature-flagged path. It does not remove the existing implementation.

## Source Audit

| Source name | Source type | Represents | Languages | Product types | Current integration file | Auth | Failure behaviour | Refresh interval | Coverage | Main missing-price cause | Main incorrect-match cause | V2 decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| eBay Browse API | External API | Active listings only | Marketplace dependent | Raw, graded, sealed | `backend/server.js`, `lib/ebay.ts` | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Falls back to cached old eBay summary or no price | Live endpoint, refresh script lanes | Pending baseline run | Rate limits, no exact listing match | Active listings displayed near sold wording | Retain as `ebay_active`, LOW confidence only |
| SerpApi eBay sold search | Third-party search API | Claimed sold search, not first-party verified in Stackr | Marketplace dependent | Raw, graded, sealed | `backend/server.js` | `SERPAPI_API_KEY` | Falls back to eBay Browse active listings | Live endpoint | Pending baseline run | Quota/no results | Search result shape cannot prove completed transaction | Disable for V2 trusted sold path unless explicitly approved |
| Authorised eBay sold provider | External API | Verified completed transactions | Provider dependent | Raw, graded, sealed | New `backend/lib/pricingV2/adapters/ebaySold.js` | `EBAY_SOLD_API_URL`, `EBAY_SOLD_API_KEY` | Reports unavailable; no active substitution | Configured in V2 | Not configured locally | Access not configured | n/a | Preferred source when configured |
| PokeTrace | External API/cache | Market tiers and provider price summaries | Primarily English/global, some foreign support via card mapping | Raw and graded | `lib/pricing.ts`, `backend/server.js`, `components/PokeTraceMarketInsights.tsx` | `POKETRACE_API_KEY` | Uses `poketrace_api_cache`, can serve stale cache on provider failure | 60s client cache, 12h backend cache | Pending baseline run | Provider misses/mapping gaps | Provider card chosen by translated name/number score | Retain as secondary market estimate unless verified sale rows are exposed |
| PokemonTCG.io | External API | TCGPlayer/cardmarket data inside English card payloads | English first | Raw cards | `lib/pricing.ts`, `app/card/[id].tsx` | Optional `POKEMON_TCG_API_KEY` | Direct client fallback can silently fail | On screen load or scripts | Pending baseline run | Missing foreign cards, missing `tcgplayer` block | English set/card IDs reused for foreign cards | Downgrade to secondary estimate |
| TCGCSV | Public price feed | TCGPlayer market/low/mid estimates | English products/sets | Raw cards, sealed products | `lib/pricing.ts`, `scripts/daily-tcgcsv-sync.ts`, `scripts/sync-market-products-tcgcsv.ts` | None | No match for set/card row | Daily when enabled | Pending baseline run | Set-name and number matching gaps | Name contains/collector-number fallback | Retain as secondary estimate |
| CardMarket via cached providers | Provider estimate | European trend estimate | Mostly English/European | Raw cards | `lib/pricing.ts`, `app/card/[id].tsx` | Provider dependent | Null trend | Daily/cache | Pending baseline run | No mapped product | Market trend mixed with sold/active UI | Retain as secondary estimate |
| `market_price_snapshots` | Supabase cache | Legacy mixed snapshot plus V2 cache columns | `en`, `ja`; now supports `zh-tw`, `zh-cn`, `ko` through V2 identity | Cards; some old user scoped rows | Many app screens, refresh scripts | Supabase | Shows price unavailable if no usable field | Daily/lane refresh | Pending baseline run | No snapshot or stale null fields | Language/variant not part of legacy key | Retain, extend for V2 cached API |
| `market_prices` | Supabase canonical catalogue price table | Provider market price records | Intended multi-language | Cards, products | `backend/server.js`, Japanese catalogue migration | Supabase | Empty list | Sync dependent | Pending baseline run | Incomplete provider mappings | Entity IDs can be source-specific | Retain as secondary estimate |
| `price_observations` | Supabase evidence table | Active/sold/market observations | Intended multi-language | Cards/products | Minty Insights migration, new V2 engine | Supabase | Empty evidence | Sync dependent | Pending baseline run | Sparse ingestion | Previous schema lacked full canonical key | Extend for V2 observations |

## Current Failure Map

1. Card identity is often built from translated names plus collector number, not a stable language-specific key.
2. Old eBay endpoint first tries a third-party "sold" search and then falls back to Browse active listings, but the UI can still read as sold-comps.
3. Legacy snapshots store `ebay_average`, `tcg_mid`, `cardmarket_trend` without a full product identity, variant, finish, condition, grader or grade.
4. `app/card/[id].tsx` still performs client-side pricing fetches and direct PokemonTCG.io fallback calls.
5. Japanese support added `language` and `tcgdex_price`, but Chinese needs its own `zh-tw`/`zh-cn` path and should not be squeezed into English or Japanese.
6. Raw, graded and sealed products are represented in several places (`pricing_mode`, `grade_company`, `market_products`) but not consistently in cache keys.
7. UI states collapse several different causes into "Price unavailable".

## Baseline Measurement

Baseline was not run in this local session because only `EXPO_PUBLIC_PRICE_API_URL` is present in `.env.local`; no `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` is available locally. The project URL is known from the dashboard link, so the repeatable measurement command has been added:

```bash
npm run pricing-v2:baseline -- --output=docs/pricing-v2-baseline-report.md
```

The script records:

- Percentage of cards with a usable legacy price.
- Percentage showing price unavailable.
- Legacy prices older than 7, 30 and 90 days.
- Duplicate card keys.
- Mismatched language observations.
- Raw identities with graded evidence.
- Graded identities with raw evidence.
- V2 coverage after backfill.

No before/after improvement claim should be made until this report is generated before and after the V2 backfill.

## Affected Code Paths

- Server pricing endpoints: `backend/server.js`
- Existing mobile eBay helper: `lib/ebay.ts`
- Existing provider helpers: `lib/pricing.ts`
- Card price display: `app/card/[id].tsx`
- Set grid price display: `app/set/[id].tsx`
- Binder price refresh modal/path: `features/binder/BinderDetailScreen.tsx`
- Listing price lookup: `features/listing/CreateListingScreen.tsx`
- Home/Minty insight data: `features/home/HubScreen.tsx`, `lib/mintyInsightEngine.ts`, `supabase/functions/minty-insight/index.ts`
- Refresh jobs: `scripts/price-refresh.ts`, `scripts/daily-market-snapshot.ts`, `scripts/daily-tcgcsv-sync.ts`
- Existing pricing tables: `market_price_snapshots`, `market_product_price_snapshots`, `market_prices`, `price_observations`

## Access Blockers

- No authorised marketplace-wide eBay completed-sale provider is configured in this local environment.
- The old SerpApi path is not treated as trusted V2 sold evidence by default.
- Supabase service credentials were not available locally, so migration/backfill/baseline execution must be run in the configured environment.
