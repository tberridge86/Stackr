# Stackr Provider Dependency Map

Audit date: 2026-07-27
Values and credentials are intentionally omitted. This document lists providers, call surfaces and target classifications only.

## Classification Key

- Retain: keep as part of the target system.
- Wrap behind Stackr API: remove direct app dependency and mediate through versioned API/service code.
- Use as temporary fallback: keep during benchmark/migration, but do not make primary long term.
- Replace: phase out when Stackr-owned catalogue/recognition/pricing is ready or when rights are not approved.
- Remove: delete or disable if not needed or unsafe.

## Dependency Table

| Dependency | Current direct use | Current locations | Classification | Stage 2 action |
| --- | --- | --- | --- | --- |
| Supabase Auth | Mobile auth/session provider. | `lib/supabase.tsx`, auth screens, auth/profile contexts. | Retain | Keep initially. Forward user bearer token to Stackr API where needed. |
| Supabase Postgres | Direct mobile reads/writes to catalogue, collection, market, social, trade and scanner tables. Backend also uses privileged server client. | `app`, `components`, `features`, `lib`, `backend`, `scripts`. | Wrap behind Stackr API | Start with read-only catalogue/search/pricing. Do not move user-write flows until parity is proven. |
| Supabase Storage | Public scan/profile/listing buckets plus local migrations for private feedback/training buckets. | `lib/storage.ts`, listing flow, scan lab/feedback backend routes, migrations. | Wrap behind Stackr API | Use API-mediated or signed upload flows. Make private feedback/training buckets production-ready before use. |
| Supabase Edge Function `minty-insight` | Direct mobile function invoke exists locally; live deployment was not listed. | `lib/mintyInsightService.ts`, `supabase/functions/minty-insight`. | Wrap behind Stackr API | Route through gateway/backend so eBay/OpenAI keys remain server-only. |
| Supabase Edge Function `stackr-card-recognition` | Ximilar-backed fallback function invoked by app, but not listed as live deployed function. | `lib/ximilarRecognition.ts`, `supabase/functions/stackr-card-recognition`. | Use as temporary fallback | Reconcile deployment drift. Put behind private recognition service. |
| Supabase Edge Function `scan-card` | Live Edge Function using Anthropic; source was not found in local `supabase/functions`. | Live Supabase function list. | Replace or use as temporary fallback | Bring source under version control or disable after migration. Do not treat as canonical recognition. |
| Railway backend | Current API base for pricing, scanner, provider proxy, payments, shipping and admin routes. | `EXPO_PUBLIC_PRICE_API_URL`, `PRICE_API_URL`, `backend/server.js`. | Wrap behind Stackr API | Evolve behind `api.stackrtcg.com` and versioned routes. Keep `/backend` service as implementation if desired. |
| Ximilar | TCG ID, OCR ID, slab ID/grade, detect/analyze recognition fallback. | Supabase function, `backend/server.js`, `lib/cardSight.ts`, `lib/ximilarRecognition.ts`. | Use as temporary fallback | Keep until Stackr benchmark passes. Log fallback usage, cost, status and accuracy. |
| CardSightAI/cardsightai | Visual recognition fallback/proxy. | Root and backend package deps, `lib/cardSight.ts`, `backend/routes/cardsight.js`. | Use as temporary fallback | Keep behind recognition service until benchmark proves replacement. |
| Rare Candy style local visual pack | Backend visual pack matching and local candidate source. | `backend/routes/rareCandyScan.js`, `lib/cardSight.ts`. | Retain behind private recognition service | Keep as Stackr-controlled candidate path; expose only through gateway. |
| Local AI / CLIP / Hugging Face transformer flow | OCR/catalogue resolver and local visual search. | `backend/routes/localAiScan.js`, `lib/onDeviceVisualMatcher.ts`, backend deps. | Retain behind private recognition service | Harden, benchmark and version. Do not expose model internals directly to app. |
| TCGdex | Multilingual catalogue, images and provider pricing payloads. | `backend/lib/tcgdex.js`, `backend/lib/tcgdexCatalogue.js`, `backend/lib/japaneseCatalogue.js`, scripts. | Wrap behind Stackr API | Move all use into provider adapters/ingestion queues with provenance and rate limits. |
| TCGCSV | Market products, product pricing and historical product sync. | `scripts/*tcgcsv*`, `lib/pricing.ts`, `lib/productSearch.ts`, price-refresh workflow. | Wrap behind Stackr API | Keep in ingestion/price workers with attribution and freshness tracking. |
| Pokemon TCG API | English card/set API, images and direct fallback search. | `lib/pokemonTcg.ts`, `lib/cardSearch.ts`, scan result/card detail/binder/search routes, backend search. | Wrap behind Stackr API | Remove direct mobile calls. Keep as provider adapter only where terms permit. |
| Pokemon TCG image CDN | Card, logo and symbol images from provider IDs. | `lib/pokemonTcg.ts`, cached provider payloads. | Wrap behind Stackr API | Cache/expose through CDN only when licence status allows. |
| PokeData | Foreign-language set/card fallback exploration. | `lib/pokemonTcg.ts`, scripts. | Replace unless licence approved | Do not import production data until rights, attribution and rate limits are documented. |
| PokeWallet | Japanese/foreign set enrichment. | `backend/server.js`, `backend/lib/tcgdexCatalogue.js`. | Wrap behind provider adapter | Keep server-only if rights and rate limits are approved. |
| ScryDex | Edition image/provider enrichment. | `components/EditionAwareCardImage.tsx`, `lib/editionImages.ts`, backend edition-image route. | Wrap behind Stackr API | Avoid direct client dependency for catalogue assets; attribute and cache where allowed. |
| Pokemon Price Tracker | Legacy pricing endpoint. | `backend/server.js`, `lib/pricing.ts`. | Replace or wrap | Prefer Pricing V2 and authorised/attributed price observations. |
| PokeTrace | Card price/cache integration. | `backend/server.js`, `lib/pricing.ts`, `components/PokeTraceMarketInsights.tsx`, cache table. | Wrap behind pricing service | Keep server/API-mediated; record source category and freshness. |
| eBay Browse API | Active listing pricing, OAuth token and rate-limit checks. | `backend/server.js`, `backend/lib/pricingV2/adapters/ebayActive.js`, `lib/ebay.ts`. | Wrap behind pricing service | Keep credentials server-only. Label active listings as asking-price evidence. |
| Authorised eBay sold source | Optional sold transaction source. | `backend/lib/pricingV2/adapters/ebaySold.js`. | Retain if authorised | Use only with authorised endpoint/token. Store evidence and provenance. |
| SerpApi-style eBay search | Legacy sold/search fallback. | `backend/server.js`, pricing helpers. | Replace or temporary fallback | Prefer authorised APIs/manual verified comps. Do not scrape or bypass controls. |
| Cardmarket data embedded in provider payloads | Market estimates via provider raw data. | TCGdex/Pokemon payload handling, legacy price fields. | Wrap behind pricing service | Store provider and retrieval attribution; do not expose raw payloads publicly. |
| TCGPlayer data embedded in provider payloads | Variant/market prices from provider payloads. | `app/scan/result.tsx`, `backend/lib/tcgdexCatalogue.js`, price fields. | Wrap behind pricing service | Remove direct scan-result/provider dependency. |
| GIBL/GIBLTCG | Recognition/TCG provider route. | `backend/routes/gibl.js`, `backend/server.js`. | Use as temporary fallback or remove | Keep server-only if retained. Decide after benchmark and source review. |
| CardMatrix | Grading-quality provider. | `backend/server.js`, grade flow. | Wrap behind API | Keep server-only. Do not mix with card identity recognition. |
| Anthropic API | Live `scan-card` function and backend scan-identify route. | Live Supabase function, `backend/server.js`. | Replace or temporary fallback | Bring source under version control if retained. Do not use as primary canonical recognition. |
| OpenAI | Minty insight narrative generation. | `supabase/functions/minty-insight`, backend env references. | Retain behind API | Keep key server-only; log data/prompt boundaries. |
| Stripe | Payments and marketplace cash terms. | `components/StripeAppProvider*`, `backend/routes/stripe.js`. | Retain | Publishable key may be client-visible; secret key stays server-only. |
| RevenueCat | Subscription/customer purchase SDK. | Root dependency `react-native-purchases`. | Retain | Keep client SDK; do not mix purchase entitlement with catalogue authorization. |
| Shippo | Shipping labels/rates. | `backend/routes/shippo.js`, `lib/shippo.ts`, `lib/shippoDelivery.ts`. | Retain behind API | Keep token server-only and gate label purchase actions. |
| Discord | Webhooks/bot notifications for trades, reviews, feedback and news. | Backend routes, trade context, scripts. | Wrap behind API | Keep webhook/token server-only; avoid direct mobile webhook exposure. |
| Expo push API | Push notification send endpoint. | Backend notification/trade code. | Retain | Keep as notification service with request IDs and retry tracking. |
| Nominatim/Overpass/OpenStreetMap | Community location search and local discovery. | Community screens/helpers. | Wrap or retain with rate limits | Add rate-limit/user-agent compliance before scaling. |
| PokeAPI | Pokedex metadata. | `app/(tabs)/pokedex.tsx`, `app/pokemon/[id].tsx`. | Wrap behind Stackr API | Cache and attribute if retained. |
| GitHub-hosted PokeAPI sprites | Pokedex sprite image URLs. | `app/(tabs)/pokedex.tsx`. | Replace or wrap/cache | Avoid direct mobile dependency for production app assets. |
| Google News RSS | Community/news sync source. | `scripts/sync-community-news.ts`. | Retain as ops ingestion if approved | Keep in worker/script; record source and retrieval time. |

## Direct Mobile Dependencies To Remove First

Priority removals:

1. Direct Supabase reads for catalogue/search/pricing projections.
2. Direct Pokemon TCG API/image calls in scan result, card detail, binder/search and fallback flows.
3. Direct mobile invocation of provider-backed Supabase Edge Functions.
4. Direct mobile calls to Railway provider routes where a typed Stackr API route should exist.
5. Direct external Pokedex/sprite fetches if they remain part of production app UX.

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
- Import run ID and conflict status.

Adapters must not bypass robots.txt, authentication, anti-bot controls, rate limits, paywalls or source licence restrictions.
