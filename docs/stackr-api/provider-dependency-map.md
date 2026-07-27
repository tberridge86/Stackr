# Stackr Provider Dependency Map

Audit date: 2026-07-27
Values and credentials are intentionally omitted.

## Classification Key

- Retain: keep as part of the target system.
- Wrap behind Stackr API: remove direct app dependency and mediate through versioned API/service code.
- Use as temporary fallback: keep during benchmark and migration, but do not make primary long term.
- Replace: phase out when Stackr-owned catalogue/recognition/pricing is ready.
- Remove: delete or disable if not needed or unsafe.

## Dependency Table

| Dependency | Current direct use | Current locations | Classification | Stage 2 action |
| --- | --- | --- | --- | --- |
| Supabase Auth | Mobile auth/session provider. | `lib/supabase.tsx`, auth screens, auth context. | Retain | Keep initially. Forward bearer tokens to API. |
| Supabase Postgres | Direct mobile reads/writes to 50+ app tables plus backend service access. | `app`, `components`, `features`, `lib`, `backend`, `scripts`. | Wrap behind Stackr API | Start with read-only catalogue/pricing facade. Do not migrate all writes at once. |
| Supabase Storage | App storage buckets and private feedback/scan-lab buckets. | `lib/storage.ts`, listing flow, feedback/scan-lab backend routes. | Wrap behind Stackr API | Use signed or API-mediated upload flows. Keep private buckets private. |
| Supabase Edge Function `minty-insight` | Direct mobile invoke. | `lib/mintyInsightService.ts`, `supabase/functions/minty-insight`. | Wrap behind Stackr API | Route through gateway or backend service. |
| Supabase Edge Function `stackr-card-recognition` | Ximilar-backed recognition fallback. | `lib/ximilarRecognition.ts`, `supabase/functions/stackr-card-recognition`. | Use as temporary fallback | Keep while benchmark is incomplete. Move behind recognition service. |
| Railway backend | Current API base for pricing, scanner, provider proxy, payments and shipping. | `PRICE_API_URL`, `EXPO_PUBLIC_PRICE_API_URL`, `backend/server.js`. | Wrap behind Stackr API | Evolve or front with `api.stackr.app`; version routes. |
| Ximilar | TCG ID, OCR ID, slab ID/grade, detect/analyze fallback. | Supabase Edge Function, backend direct routes, `lib/cardSight.ts`. | Use as temporary fallback | Keep fallback only. Track usage, cost, success/failure and endpoint choice. |
| CardSightAI/cardsightai | Visual recognition fallback/proxy. | `lib/cardSight.ts`, `backend/routes/cardsight.js`, package deps. | Use as temporary fallback | Keep until Stackr benchmark passes; route through recognition service. |
| Rare Candy style local visual pack | Backend visual pack matching. | `backend/routes/rareCandyScan.js`, `lib/cardSight.ts`. | Retain behind private recognition service | Keep as Stackr-controlled local candidate source, but not as public API surface. |
| Backend local AI/CLIP OCR resolver | OCR/catalogue resolver and CLIP search. | `backend/routes/localAiScan.js`, `lib/cardSight.ts`. | Retain behind private recognition service | Harden and version through recognition service. |
| TCGdex | Multilingual catalogue, images and pricing payloads. | `backend/lib/tcgdex.js`, `backend/lib/tcgdexCatalogue.js`, sync/verify scripts. | Retain as ingestion source | Move all use into provider adapters and catalogue ingestion queues. |
| TCGCSV | Market products, product pricing and history. | `scripts/*tcgcsv*`, pricing workflow. | Retain as ingestion source | Keep in queue worker with attribution and source freshness checks. |
| Pokemon TCG API | English card/set API and direct app pricing/card fallback. | `lib/pokemonTcg.ts`, `lib/cardSearch.ts`, `lib/pokedexCollection.ts`, `app/scan/result.tsx`, `app/card/[id].tsx`, backend search route. | Wrap behind Stackr API | Remove direct mobile calls; preserve only as licensed/attributed adapter where allowed. |
| Pokemon TCG image CDN | Card imagery from provider payloads. | Pokemon TCG helpers and cached raw data. | Wrap behind Stackr API | Cache only when licence permits; expose via CDN with rights status. |
| eBay Browse API | Active listing pricing and OAuth/rate-limit checks. | `backend/server.js`, `backend/lib/pricingV2/adapters/ebayActive.js`, `app/prices`, `lib/ebay.ts`. | Wrap behind pricing service | Keep server-only. Label active listings as asking-price indication. |
| Authorised eBay sold provider | Optional sold transaction source. | `backend/lib/pricingV2/adapters/ebaySold.js`. | Retain if authorised | Use only with authorised endpoint/token. Do not scrape sold pages. |
| SerpApi-style sold/search provider | Legacy pricing fallback. | `backend/server.js`, pricing helpers. | Replace or wrap | Prefer authorised APIs and verified/manual comps. |
| Cardmarket data from provider payloads | Market estimates in TCGdex/Pokemon payloads. | `backend/lib/tcgdexCatalogue.js`, legacy pricing. | Wrap behind pricing service | Store attribution and retrieval timestamps. |
| TCGPlayer data from provider payloads | Variant prices in Pokemon/TCGdex payloads. | `app/scan/result.tsx`, `backend/lib/tcgdexCatalogue.js`. | Wrap behind pricing service | Remove direct scan-result provider fetch. |
| PokeData | Japanese/Chinese set/card fallback. | `lib/pokemonTcg.ts`, deep-dive scripts. | Wrap behind provider adapter | Verify licence/coverage before production ingestion. |
| PokeWallet | Japanese/foreign set enrichment. | `backend/lib/tcgdexCatalogue.js`. | Wrap behind provider adapter | Retain only if rights/rate-limit conditions are documented. |
| Scrydex | Edition image/provider enrichment. | Backend edition image route. | Wrap behind provider adapter | Keep server-only and attribute source. |
| Pokemon Price Tracker | Legacy pricing endpoint. | `backend/server.js`, `lib/pricing.ts`. | Replace or wrap | Prefer Pricing V2; keep only if authorised and attributed. |
| PokeTrace | Card price/cache integration. | `backend/server.js`, `lib/pricing.ts`, `poketrace_api_cache`. | Wrap behind pricing service | Retain only if API terms permit. |
| GIBL/GIBLTCG | Recognition/TCG provider route. | `backend/routes/gibl.js`, `backend/server.js`. | Use as temporary fallback or remove | Decide after benchmark. Keep server-only if retained. |
| CardMatrix | Grading quality provider. | `backend/server.js`, `lib/ximilar.ts`. | Wrap behind API | Keep server-only. |
| Stripe | Payments and marketplace cash terms. | Backend Stripe route, mobile Stripe provider. | Retain | Keep server-only secret key; expose only publishable key to client. |
| Shippo | Shipping labels/rates. | `backend/routes/shippo.js`, `lib/shippo.ts`. | Retain behind API | Keep token server-only; gate label purchases. |
| Discord | Webhooks/bot notifications. | Backend Discord routes, trade/community flows. | Wrap behind API | Keep webhooks/tokens server-only. |
| OpenAI | Minty insight narrative. | Supabase function/backend env references. | Wrap behind API | Keep keys server-only and log prompt/data boundaries. |
| Anthropic API | Legacy scan identify fallback in backend. | `backend/server.js`. | Replace or temporary fallback | Do not use as primary recognition. Gate or remove debug path. |
| Expo push API | Push notification send endpoint. | `backend/server.js`, trade context. | Retain | Keep through notification service with request IDs. |
| Nominatim/Overpass/OpenStreetMap | Community location search. | Community tab. | Wrap or retain with rate limits | Add user agent/rate-limit compliance and API boundary if used at scale. |
| PokeAPI | Pokedex metadata. | `app/(tabs)/pokedex.tsx`, `app/pokemon/[id].tsx`. | Wrap behind Stackr API | Cache and attribute if retained. |

## Direct Mobile Provider Calls To Remove First

Highest priority direct mobile calls:

- Direct Supabase table calls for catalogue/search/price data.
- Direct Pokemon TCG API calls in scan result, card detail and binder price fallbacks.
- Direct Railway provider routes for eBay, recognition feedback, scan lab, shadow mode and pricing.
- Direct Supabase Edge Function invocation for Ximilar recognition.

## Provider Rules For Future Ingestion

Every provider adapter must store:

- Source/provider name.
- Raw provider record ID.
- Source URL where terms permit.
- Retrieval timestamp.
- Provider-updated timestamp when supplied.
- Licence or rights status.
- Raw payload or raw payload hash.
- Transformation/mapping version.

Adapters must not bypass robots.txt, authentication, anti-bot controls, rate limits, paywalls or source licence restrictions.
