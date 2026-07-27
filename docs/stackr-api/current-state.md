# Stackr API Stage 1 Current State

Audit date: 2026-07-27
Repository: `D:\Stackr-1`
Branch audited: `chore/sync-latest-website-20260727`
Commit audited: `cd1f47b`
Stage scope: audit only. No API implementation, production schema change, migration push, provider sync, data import or deployment was performed.

## Evidence Base

- Local repository inspection from `D:\Stackr-1`.
- Connected Supabase read-only metadata and SQL inspection for project `oakdbbzdqwurpjnoqhmu`.
- Local package scripts and baseline command output saved under `.tmp/stage1-audit`.
- Previously confirmed Railway source settings: GitHub repository `tberridge86/Stackr`, service `pocketvault`, root directory `/backend`, production branch `main`.
- Secret values were not printed in this audit. Environment-variable names only are documented.

## Repository Shape

Stackr is an Expo Router React Native app with a separate Express backend and committed Supabase assets.

Top-level application:

- Root package name: `Stackr-native`
- App version: `1.0.3`
- Entry point: `expo-router/entry`
- Expo SDK: `~54.0.36`
- React Native: `0.81.5`
- React: `19.1.0`
- TypeScript: `~5.9.2`
- New architecture: enabled in `app.json`
- Expo app slug/name are adjusted by `app.config.js` when `APP_VARIANT=development`.

Backend:

- Backend package name: `pocketvault-backend`
- Runtime: Node `20.x`
- Entry point: `backend/server.js`
- Start command: `node server.js`
- Railway root directory `/backend` matches the backend package location.
- The backend package still carries the older PocketVault name.

Important client dependencies:

- Supabase: `@supabase/supabase-js`
- Camera/scanner: `expo-camera`, `react-native-vision-camera`, `expo-image-manipulator`, `expo-image-picker`
- OCR: `@react-native-ml-kit/text-recognition`
- On-device inference: `onnxruntime-react-native`
- Caching/offline: `@tanstack/react-query`, React Query persistence and `@react-native-async-storage/async-storage`
- Payments/subscriptions: `@stripe/stripe-react-native`, `react-native-purchases`

No generated Supabase TypeScript database types were found in a committed `types`, `lib` or `supabase` location.

## Navigation And UI Flow

The app uses Expo Router. `app/_layout.tsx` installs the main providers and a custom persistent tab bar. The nested tab layout in `app/(tabs)/_layout.tsx` hides the native tab bar and routes through custom navigation.

Primary user surfaces include:

- Home, binder/collection, market, search, trade, community, profile and Pokedex routes.
- Scanner routes: `/scan`, `/scan/camera`, `/scan/result`, `/scan/binder-page-result`, diagnostics and native card-camera pages.
- Admin scanner/review pages: scan lab, recognition feedback, scanner analytics and shadow-mode pilot.
- Auth routes: login, callback and reset-password.

Stage 2 must preserve the current UI and migrate service/data paths behind feature flags rather than replacing screens.

## Authentication And Session Handling

`lib/supabase.tsx` creates the mobile Supabase client. The client contains public Supabase project configuration only; secret/service-role credentials were not found in the mobile client setup during this audit.

Session handling:

- Supabase Auth is the identity provider.
- Auth sessions persist through AsyncStorage outside static web rendering.
- `detectSessionInUrl` is disabled.
- Auth context calls `supabase.auth.getUser`, subscribes to auth state changes, clears stale auth storage and writes Expo push tokens to `profiles.expo_push_token`.

Target implication: keep Supabase Auth initially, but move catalogue/search/pricing/private data access behind a Stackr API client.

## Direct Mobile Supabase Surface

A static marker scan of `app`, `components`, `features`, `lib`, `hooks` and `types` found 457 direct Supabase call markers across 59 targets. This is a coupling inventory, not a count of unique workflows.

High-volume or high-risk direct surfaces:

| Area | Current direct tables/functions | Migration pressure |
| --- | --- | --- |
| Auth/profile | `supabase.auth`, `profiles`, push-token writes | Retain auth; wrap profile data behind API where needed. |
| Binder/collection | `binders`, `binder_cards`, `user_card_variants`, `user_card_flags` | Keep until catalogue identity parity exists. |
| Catalogue/search | `pokemon_cards`, `pokemon_sets`, `tcg_cards`, `tcg_sets`, `tcg_set_cover_images`, `catalogue_health` | First API facade candidate. |
| Pricing/market | `market_price_snapshots`, `card_prices`, `market_products`, `market_product_price_snapshots`, `market_watchlist` | First API facade candidate, read-only first. |
| Trading/community | `trade_offers`, `trade_offer_cards`, `trade_offer_events`, `notifications`, `social_posts`, `activity_feed`, `friendships` | Later migration; user-write heavy. |
| Scanner/admin | `scan_learning_events`, scanner calibration RPC, feedback/scan-lab sessions | Wrap through API event spine. |
| Storage/functions | buckets `card-scans`, `trade-listings`; functions `minty-insight`, `stackr-card-recognition` | Move private/provider work behind backend/gateway. |

Current implication: the mobile app is still tightly coupled to Supabase table names, RLS behavior and Supabase Edge Function availability.

## Backend HTTP Surface

`backend/server.js` is the current backend entry. It mounts or defines routes for:

- Card recognition and visual fallbacks: `/api/cardsight`, `/api/gibl`, `/api/local-ai`, `/api/rare-candy-scan`, Ximilar routes and scan identify routes.
- Scanner datasets: `/api/recognition-feedback`, `/api/recognition-shadow-mode`, `/api/scan-lab`, `/api/scanner-packs`.
- Pricing/search/providers: eBay, PokeTrace, Pokemon TCG API, TCGdex, pricing V2, product search and catalogue routes.
- Commerce/ops: `/api/discord`, `/api/shippo`, `/api/stripe`.

Logging is mostly ad hoc console output. A consistent request-ID middleware and structured log schema were not found as a universal backend pattern.

## Supabase Live State

Connected Supabase project:

- Project ref: `oakdbbzdqwurpjnoqhmu`
- Region: `eu-west-1`
- Health: active/healthy during audit
- Postgres: `17.6.1.104`

Live schemas:

- Present: `auth`, `extensions`, `graphql`, `graphql_public`, `public`, `realtime`, `storage`, `vault`
- Not present: `catalog`, `ingest`, `market`, `ml`, `api`, `audit`

Live extension state:

- Installed: `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`
- Available but not installed: `pg_trgm`, `vector`, `pg_cron`

Live edge functions:

- Deployed: `scan-card`, version 3, JWT verification disabled.
- Local but not deployed according to live function listing: `minty-insight`, `stackr-card-recognition`.

Important drift:

- Supabase migration history reported no recorded migrations.
- The repository contains 63 SQL migration files under `supabase/migrations`.
- Several live public tables exist even though the migration history is empty.
- Several tables referenced by local migrations and code were not present in the live table check, including scan lab, feedback, scanner benchmark and some pricing/market tables.

This drift is the largest blocker for production Stage 2 schema work.

## Supabase Tables, Views, Functions, Triggers And Storage

Live high-volume catalogue/pricing tables include:

- `pokemon_cards` about 20,359 rows and `pokemon_sets` about 173 rows.
- `tcg_cards` 5,220 rows, `tcg_sets` 177 rows and `tcg_series` 14 rows.
- `card_printings` 5,220 rows; `canonical_card_concepts` and `cards` empty.
- `card_images` 5,220 rows, `card_image_checks` 2,204 rows.
- `card_fingerprints` 20,237 rows and `card_clip_embeddings` 18,767 rows.
- `card_prices` and `market_prices` 3,248 rows each.
- `market_price_snapshots` about 330k rows.
- `market_product_price_snapshots` 12,607 rows and `market_products` 191 rows.
- `catalogue_sync_runs` 162 rows and `catalogue_sync_errors` 0 rows.

Live views:

- `admin_binder_directory_view`
- `catalogue_health`
- `japanese_catalogue_health`
- `profile_rating_summary`
- `tcg_card_printings`
- `tcg_set_cover_images`

Live functions include `accept_trade_offer`, `admin_binder_directory`, `handle_new_user`, `is_admin`, `enforce_wanted_card_limit`, binder value recalculation helpers and timestamp touch helpers.

Live triggers include:

- `auth.users` user-created profile trigger.
- Binder value recalculation trigger.
- Updated-at triggers for local community tables and listings.
- Wanted-card limit trigger.
- Storage object/bucket triggers.

Live storage buckets:

| Bucket | Public | Limits observed | Notes |
| --- | --- | --- | --- |
| `card-scans` | yes | no file size or MIME limit observed | Public listing risk noted by advisor. |
| `profile-backgrounds` | yes | no file size or MIME limit observed | Public listing risk noted by advisor. |
| `trade-listings` | yes | no file size or MIME limit observed | Public listing risk noted by advisor. |

Local migrations refer to private buckets `scan-lab-training` and `recognition-feedback`, but those were not present in live storage metadata.

## Supabase Security And Performance Findings

Security advisor findings from the connected project included:

- RLS enabled without policy on several public tables, including catalogue/provider/pricing/cache tables.
- Security-definer views in public for catalogue and admin projection views.
- Mutable `search_path` warnings on public functions.
- Public buckets allow object listing.
- Public execution grants on security-definer functions.
- Leaked-password protection is disabled.

Performance advisor themes included:

- Unindexed foreign keys across catalogue, pricing, social, trade and user tables.
- Multiple permissive policies on several user/community/trade tables.
- Duplicate indexes on `profiles`, `provider_card_records` and `user_card_variants`.

Stage 2 must not expand public Supabase exposure until these findings have a tracked remediation plan.

## Supabase Migration Assets In Repository

Committed local assets:

- `supabase/migrations`: 63 SQL files.
- `supabase/functions/minty-insight/index.ts`
- `supabase/functions/stackr-card-recognition/index.ts`
- `supabase/manual` runbooks and manual SQL.

Key local schema families:

- Canonical-ish catalogue tables in `public`: `canonical_card_concepts`, `tcg_series`, `tcg_sets`, `tcg_cards`, `card_printings`, `card_variants`, `sealed_products`, provider records/mappings, market prices and catalogue review queues.
- TCGdex repair tables: `provider_card_records`, card image/check tables, card price/check tables and catalogue sync tables.
- Pricing V2: `pricing_sources`, `price_observations`, `pricing_review_queue` and pricing fields.
- Scanner: calibration, benchmark, scan learning, scanner training, feedback, shadow mode and scan lab tables.

Important schema concern: current local canonical work still lives largely in `public`, while Stage 2 asks for separate schemas (`catalog`, `ingest`, `market`, `ml`, `api`, `audit`) and private exposure controls.

## Scanner And Recognition State

The main scanner flow is `features/scan/ScanScreen.tsx`. It uses Expo Camera, crop geometry, JPEG decoding, image quality checks, ML Kit OCR, card localisation/rectification, local OCR matching, remote recognition and scanner analytics.

Recognition stack:

- Local OCR matcher: `lib/localOcrCardMatcher.ts`
- Local card index: `lib/localCardIndex.ts`
- Recognition orchestrator: `lib/recognition/orchestrator.ts`
- Orchestrator core: `lib/recognition/orchestratorCore.ts`
- Local on-device engine: `lib/recognition/engines/localOnDeviceV1.ts`
- Legacy engine wrapper: `lib/recognition/engines/legacyEngine.ts`
- Visual/remote fallback orchestration: `lib/cardSight.ts`
- Ximilar Edge fallback client: `lib/ximilarRecognition.ts`
- Variant resolver: `lib/recognition/variantResolver.ts`

Feature flags:

- Local recognition default: off.
- Legacy cloud fallback default: on.
- Recognition feedback default: on.
- Scanner diagnostics default: off.
- Ximilar fallback default: on unless explicitly disabled.

Current implication: preserve current scanner behavior. Do not make local recognition primary until model, embedding and benchmark blockers are cleared.

## ONNX And Local Model Assets

Assets found:

- `assets/models/stackr-card-vision-healthcheck.onnx`
- `assets/models/card_identity/model-manifest.json`
- `assets/models/card_identity/evidence-fusion-calibration.json`
- `assets/models/card_identity/MODEL_CARD.md`
- `assets/catalogue/card-catalogue.sqlite`
- `assets/catalogue/card-embeddings.bin`
- catalogue manifest/package JSON files
- native module scaffolding under `modules/stackr-card-vision`

The production card-identity ONNX model manifest is blocked and no approved production `model.onnx` was found for card identity. The packaged catalogue has only 52 local rows and zero approved embeddings.

## Data Coverage Summary

Live coverage by inspected row counts:

| Data area | Current coverage |
| --- | --- |
| English Pokemon catalogue | `pokemon_cards` about 20,359 rows; `pokemon_sets` about 173 rows. |
| Japanese/TCGdex canonical-ish catalogue | `tcg_cards` 5,220 rows; `card_printings` 5,220 rows; `tcg_sets` 177 rows. |
| Simplified Chinese | No live row coverage detected in the audited aggregate counts. |
| Traditional Chinese | Only packaged local sample coverage was found; no live production count detected. |
| Korean | No live row coverage detected in the audited aggregate counts. |
| Pricing | Strong legacy snapshot volume; Pricing V2 observations/review queue are not yet populated. |
| Variants | `card_variants` table exists but live row count was 0; user-owned variants exist separately. |

No card identity should be treated as canonical by name alone. Current legacy flows still depend heavily on provider IDs, names and `pokemon_cards`.

## Pricing State

Pricing V2 exists in code and migrations:

- Client: `lib/pricingV2.ts`
- Backend: `backend/lib/pricingV2`
- Methodology: `pricing-v2.0.0`
- Sources: manual verified comps, authorised eBay sold source when configured, existing Stackr cached source and eBay active listings.

Live pricing sources:

- `ebay_active`: enabled, active-listing evidence.
- `ebay_sold`: disabled/unconfigured.
- `existing_stackr_source`: enabled.
- `manual_verified_comp`: enabled.

Current implication: keep strict separation between verified/sold evidence and active asking-price indicators.

## Caching And Offline Storage

Observed storage/caching:

- Supabase Auth session in AsyncStorage.
- React Query persistence in `components/StackrQueryProvider.tsx`.
- Local card index cache in AsyncStorage with a seven-day age limit.
- Scan learning offline queue capped at 50 events.
- Recognition feedback local queue and explicit consent state.
- Scanner packs downloaded by `lib/scannerPack.ts` into the app document directory.
- Backend in-memory caches for provider calls, token state, image resolution and pricing/recognition lookups.

## Tests, CI And Build Baseline

Baseline commands were run before documentation edits and before any production change.

| Command | Result |
| --- | --- |
| `npm run lint` | Passed with 2 existing warnings: unused `theme` in `app/(tabs)/explore.tsx`; unused `focusedResultLimit` in `app/(tabs)/search.tsx`. |
| `npx tsc --noEmit` | Passed. |
| Scanner/pricing/recognition `test:*` scripts listed in `.tmp/stage1-audit/commands/summary.json` | Passed. |
| `npx expo export --platform web --output-dir .tmp/stage1-audit/web-export` | Passed. |

No root `npm test` script and no root or backend `build` script exists. Web export was used as the available build sanity check.

CI/CD:

- `.github/workflows/price-refresh.yml` exists for scheduled/manual price refresh work.
- No general pull-request CI workflow for lint/type-check/tests/build was found.
- Railway is connected to GitHub for the backend service, but Stage 1 did not deploy.

## Current-State Conclusion

Stackr already has serious scanner, recognition-feedback, pricing and catalogue groundwork. It is not yet operating through a single versioned Stackr API, and the live Supabase state is not safely reproducible from committed migrations.

The largest blockers before Stage 2 production database work are:

1. Empty live Supabase migration history despite 63 local migrations.
2. Live/local drift in Edge Functions, storage buckets and scanner/pricing tables.
3. Security advisor findings around views, functions, buckets and RLS policies.
4. Incomplete required-language coverage, especially Simplified Chinese and Korean.
5. Blocked local recognition model/embedding assets.
6. Missing general CI gate before Railway production deploys.
