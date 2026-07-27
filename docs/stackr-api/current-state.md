# Stackr API Stage 1 Current State

Audit date: 2026-07-27
Repository: `D:\Stackr-1`
Stage scope: audit only. No API implementation, production schema change, deployment, provider sync or data import was performed.

## Repository State

The repository is an Expo Router React Native application with a separate Express backend and committed Supabase assets.

- Git branch: `main`, tracking `origin/main`.
- Working tree: dirty before this audit, with many modified, deleted and untracked files already present. These were treated as user-owned.
- New Stage 1 files are isolated under `docs/stackr-api`.
- No generated Supabase TypeScript database types were found in `types`, `lib` or `supabase`.

## Application And Runtime

Root package:

- Name: `Stackr-native`
- Version: `1.0.3`
- Entry: `expo-router/entry`
- Expo: `~54.0.36`
- React Native: `0.81.5`
- React: `19.1.0`
- TypeScript: `~5.9.2`
- New architecture: enabled in `app.json`

Important client dependencies:

- Supabase JS: `@supabase/supabase-js`
- Scanner/camera: `expo-camera`, `react-native-vision-camera`, `expo-image-manipulator`, `expo-image-picker`
- OCR: `@react-native-ml-kit/text-recognition`
- On-device inference: `onnxruntime-react-native`
- Caching: `@tanstack/react-query`, async-storage persister, `@react-native-async-storage/async-storage`
- Payments and marketplace: `@stripe/stripe-react-native`, backend Stripe and Shippo routes

Backend package:

- Name: `pocketvault-backend`
- Runtime: Node `20.x`
- Entry: `backend/server.js`
- Web framework: Express
- Backend package still carries the older PocketVault name.

## Navigation And App Structure

The app uses Expo Router and a custom tab bar from `app/_layout.tsx`.

Current provider stack includes auth/profile/app-mode/collection/trade/achievement providers, theme, React Query persistence, and conditional Stripe provider setup. Primary scan entry is `/scan`; result routes include `/scan/result`, `/scan/binder-page-result`, diagnostics screens, admin feedback screens and normal collection/market/community routes.

`app.config.js` switches name, slug, scheme, bundle ID and Android package when `APP_VARIANT=development`.

## Authentication And Session Handling

`lib/supabase.tsx` creates a Supabase client in the mobile bundle with a hard-coded Supabase project URL and publishable anon key. Values are intentionally redacted in this audit. Auth persistence uses AsyncStorage except during static web rendering. `detectSessionInUrl` is false, and session persistence/auto-refresh are enabled outside static web rendering.

`components/auth-context.tsx` calls Supabase Auth to load the user, listens for auth state changes, clears stale auth storage and writes Expo push tokens to `profiles.expo_push_token`.

Current implication: Supabase Auth is the live identity provider. Stage 2 should retain Supabase Auth initially but place app data access behind a versioned Stackr API boundary.

## Direct Mobile Supabase Surface

A static scan of `app`, `components`, `features`, `lib`, `hooks` and `types` found 457 direct Supabase call markers across 59 targets. This count is a marker inventory, not a count of unique user workflows.

| Target | Markers | Notes |
| --- | ---: | --- |
| `supabase.auth` | 101 | Auth, session, sign-in/out, user lookup across auth screens, profile, trade, scanner admin and library services. |
| `binder_cards` | 38 | Binder, scan result, inventory, listing, achievements, Pokedex and community flows. |
| `pokemon_cards` | 31 | Search, scan resolution, market, binder and legacy catalogue lookups. |
| `user_card_flags` | 31 | Ownership/listing/wishlist flows. |
| `binders` | 27 | Binder CRUD, profile, explorer, offer and Pokedex flows. |
| `profiles` | 23 | Auth profile, marketplace, social, admin and ratings flows. |
| `user_card_variants` | 19 | Variant and quantity tracking. |
| `trade_offers` | 17 | Trade context and offer screens. |
| `market_price_snapshots` | 16 | Price, scan result, home, binder, listing and inventory views. |
| `card_previews` | 9 | Offer, home and value-history views. |
| `market_watchlist` | 9 | Prices, community and home flows. |
| `pokemon_sets` | 9 | Search, prices, binder and catalogue helpers. |
| `activity_feed` | 4 | Home and activity library. |
| `activity_reactions` | 4 | Activity library. |
| `market_product_price_snapshots` | 4 | Inventory and product search. |
| `seller_inventory_items` | 4 | Inventory/profile. |
| `social_posts` | 4 | Community/profile. |
| `trade_offer_events` | 4 | Trade event logging. |
| `user_achievement_events` | 4 | Achievements. |
| `user_follows` | 4 | Activity/following. |
| `user_pokedex_cards` | 4 | Pokedex collection. |
| `friendships` | 7 | Friends service. |
| `binder_card_showcases` | 7 | Binder and profile showcase. |
| `notifications` | 7 | Notification and trade flows. |
| `tcg_cards` | 6 | Canonical catalogue lookups. |
| `market_products` | 5 | Product search. |
| `trade_reviews` | 3 | Trade reviews. |
| `tcg_sets` | 3 | Canonical set lookups. |
| `scan_learning_events` | 3 | Scanner analytics/learning. |
| `community_news` | 2 | Community/admin. |
| `inventory_movements` | 2 | Inventory service. |
| `local_featured_events` | 2 | Community/admin. |
| `local_stores` | 2 | Community/admin. |
| `card_prices` | 2 | Listing/binder fallbacks. |
| `profile_rating_summary` | 2 | Profile/trade ratings. |
| `scan_grading_jobs` | 2 | Grading jobs. |
| `seller_sale_transactions` | 2 | Inventory/profile. |
| `tcg_set_cover_images` | 2 | Binder/catalogue cover enrichment. |
| `trade_cash_terms` | 2 | Trade offers. |
| `trade_offer_cards` | 2 | Trade offer cards. |
| `trade-listings` | 2 | Listing flow. |
| `trader_ratings` | 2 | Trader ratings. |
| `storage:card-scans` | 2 | `lib/storage.ts`. |
| `storage:trade-listings` | 2 | Listing media upload. |
| `card-scans` | 2 | Legacy storage/table-style marker in `lib/storage.ts`. |
| `catalogue_health` | 1 | Japanese catalogue health. |
| `local_meetup_attendees` | 1 | Community. |
| `minty_insights` | 1 | Minty insights. |
| `seller_sale_transaction_items` | 1 | Inventory. |
| `trader_rating_summary` | 1 | Trader ratings. |
| `user_coin_ledger` | 1 | Achievements. |
| `user_cosmetics` | 1 | Cosmetics. |
| `user_insight_interactions` | 1 | Minty insight interactions. |
| `rpc:get_active_scanner_threshold_set` | 1 | Scanner calibration. |
| `rpc:purchase_cosmetic` | 1 | Cosmetics. |
| `function:minty-insight` | 1 | Supabase Edge Function. |
| `function:stackr-card-recognition` | 1 | Ximilar-backed Supabase Edge Function. |

Current implication: the app is still tightly coupled to Supabase table names, RLS shape and provider functions. This is the largest Stage 2 migration surface.

## Backend HTTP Surface

`backend/server.js` is the current backend entry point. It mounts routes for:

- `/api/cardsight`
- `/api/gibl`
- `/api/local-ai`
- `/api/rare-candy-scan`
- `/api/recognition-feedback`
- `/api/recognition-shadow-mode`
- `/api/scan-lab`
- `/api/scanner-packs`
- `/api/discord`
- `/api/shippo`
- `/api/stripe`

It also exposes catalogue, pricing, search, eBay, Ximilar, grading, PokeTrace, debug, trade notification and scan-identify endpoints directly from `server.js`.

Observed risk: backend logs are mostly ad hoc `console.log`/`console.warn`. A consistent request ID middleware and structured logger were not found. Some debug endpoints are present and should be gated before production API hardening.

## Supabase Schema And Migrations

Committed Supabase assets:

- `supabase/migrations`: 63 SQL migration files.
- `supabase/functions`: `minty-insight`, `stackr-card-recognition`.
- `supabase/manual`: manual runbook/schema notes.

Migration inventory from committed SQL:

- Extensions: `pg_trgm`, `pgcrypto`
- Created tables: 73
- Views: 5
- Functions: 13
- Triggers: 7
- Named policies: 109
- Storage buckets created in migrations: `recognition-feedback`, `scan-lab-training`

Created table families include canonical catalogue, provider records, provider mappings, prices, pricing review, scanner calibration, scan learning, recognition feedback, shadow-mode pilot, scan lab captures, achievements, marketplace products, inventory, sales and user card variants.

Views:

- `admin_binder_directory_view`
- `catalogue_health`
- `japanese_catalogue_health`
- `tcg_card_printings`
- `tcg_set_cover_images`

Important schema concern: the app references legacy tables such as `profiles`, `pokemon_cards`, `pokemon_sets`, `binder_cards`, `binders`, `user_card_flags`, `trade_offers`, `notifications` and others. Several are altered or granted in committed migrations but not created in the visible migration history. The authoritative production schema therefore may not be fully reconstructible from this repository alone.

## Scanner And Recognition State

The main scanner flow is `features/scan/ScanScreen.tsx`. It uses Expo Camera, ML Kit OCR, crop geometry, image quality checks, card localisation, local OCR matching, remote recognition fallback, learning events and in-memory diagnostics.

A newer Vision Camera/native-analysis flow exists at `app/scan/card-camera.tsx` with `lib/useScanCamera.ts`, `lib/useLiveCardFrameAnalyser.ts` and the private native module `modules/stackr-card-vision`.

Recognition stack:

- Local OCR matcher: `lib/localOcrCardMatcher.ts`
- Local card index: `lib/localCardIndex.ts`
- Recognition orchestrator: `lib/recognition/orchestratorCore.ts`
- Legacy engine wrapper: `lib/recognition/engines/legacyEngine.ts`
- Local on-device engine: `lib/recognition/engines/localOnDeviceV1.ts`
- Visual fallback/orchestration: `lib/cardSight.ts`
- Ximilar edge fallback: `lib/ximilarRecognition.ts`
- Variant resolver: `lib/recognition/variantResolver.ts`

The current local OCR matcher handles English, Japanese and Chinese-like script grouping. Korean exists in shared recognition types but is not implemented as a production local OCR language path.

## Catalogue And Local Recognition Assets

Packaged local catalogue files:

- `assets/catalogue/card-catalogue.sqlite`
- `assets/catalogue/card-embeddings.bin`
- `assets/catalogue/catalogue-manifest.json`
- `assets/catalogue/complete-package.json`
- `assets/catalogue/delta-package.json`
- `assets/catalogue/card-variant-families.json`

Read-only SQLite check:

- Tables: `cards`, `pack_info`
- Cards: 52
- Languages: `en` 48, `ja` 2, `zh-Hant` 2
- No packaged `zh-Hans` or `ko` rows were found.

The catalogue manifest status is `blocked`. It reports zero approved embeddings, 52 missing embeddings and an install rejection reason. The card identity ONNX model manifest is also `blocked` and no `assets/models/card_identity/model.onnx` file exists.

## Pricing State

The app has both legacy pricing helpers and Pricing V2.

Pricing V2 client:

- `lib/pricingV2.ts`
- Calls `${PRICE_API_URL}/api/pricing/:cardId`
- Response state distinguishes `market_value`, `asking_price_indication`, `stale_verified_value` and `insufficient_exact_market_evidence`
- Client cache TTL: 60 seconds

Pricing V2 backend:

- `backend/lib/pricingV2`
- Methodology version: `pricing-v2.0.0`
- Feature flag defaults to disabled on backend.
- Adapters: manual verified comps, eBay sold provider, existing Stackr cached sources, eBay active listings.
- Sold data requires an authorised endpoint/token. eBay active listings are explicitly active asking-price evidence, not verified sold transactions.

## Caching And Offline Storage

Observed storage/caching:

- Supabase auth session in AsyncStorage.
- React Query persisted via AsyncStorage in `components/StackrQueryProvider.tsx`.
- Local card index in AsyncStorage with a 7-day max age.
- Scan learning has an offline queue capped at 50 events.
- Recognition feedback queue stores local metadata and consent state, with image upload only after explicit consent.
- In-memory scan diagnostics retain the latest 12 scan sessions.
- Scanner pack/catalogue assets are local files, but the current approved pack is blocked.

## Tests, CI And Build Baseline

Commands run before documentation edits:

| Command | Result |
| --- | --- |
| `npm run lint` | Passed with 2 pre-existing warnings: unused `theme` in `app/(tabs)/explore.tsx`, unused `focusedResultLimit` in `app/(tabs)/search.tsx`. |
| `npx tsc --noEmit` | Passed. |
| `npx tsc --noEmit -p backend\tsconfig.json` | Passed. |
| Root `test:*` scripts | 24 scripts passed. |
| Build command | Not run because no root or backend `build` script exists. |

Root test scripts run successfully:

`test:pricing-v2`, `test:recognition-orchestrator`, `test:scanner-calibration`, `test:scanner-pipeline`, `test:scanner-analytics`, `test:card-centering`, `test:card-frame-analyser`, `test:live-card-guidance`, `test:card-rectification`, `test:ocr-evidence`, `test:pilot-dataset`, `test:embedding-v0-guard`, `test:embedding-failure-analysis`, `test:card-identity-onnx-export`, `test:reference-pack`, `test:card-identity-search`, `test:local-on-device-inference`, `test:local-quick-scan`, `test:recognition-feedback`, `test:shadow-mode-pilot`, `test:evidence-fusion`, `test:variant-resolver`, `test:scan-lab-core`, `test:scan-lab-manifest`.

CI/CD:

- One GitHub workflow was found: `.github/workflows/price-refresh.yml`
- It runs scheduled/manual pricing and TCGCSV jobs using GitHub secrets/vars.
- No mobile build/test workflow was found in `.github/workflows`.

## Stage 1 Current-State Summary

Stackr already has significant scanner, feedback, canonical-catalogue and pricing work in the repository. It is not yet operating through a single versioned Stackr API. The app still directly depends on Supabase table names, Supabase Edge Functions, Railway backend endpoints and multiple provider-specific paths. Local recognition assets are explicitly blocked and cannot replace Ximilar/CardSight/legacy visual fallback yet.
