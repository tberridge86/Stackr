# Stackr Performance And Pricing Audit

Date: 2026-07-14

## Scope

Focused audit of Japanese card search, graded pricing, slab-label rendering and collection summary consistency.

## Runtime And Libraries

- Expo: `~54.0.35`
- React Native: `0.81.5`
- React: `19.1.0`
- Supabase client: `@supabase/supabase-js ^2.105.1`
- Image stack: React Native `Image`, `expo-image` is installed and used by shared `StackrImage`
- No new runtime dependencies were added.

## Confirmed Bottlenecks

### Japanese Search Normalisation

Confirmed in `lib/cardSearch.ts`: the search normaliser previously reduced input to `[a-z0-9]`, which stripped Japanese characters before scoring. That made Japanese names dependent on weaker database matching or fallback paths.

Fix:

- Normalisation now uses `NFKC` for full-width/half-width forms.
- Japanese scripts are preserved during tokenisation.
- Default card search select now includes `language`.

Affected files:

- `lib/cardSearch.ts`
- `lib/localCardIndex.ts`
- `lib/scannerPack.ts`

### Exact Collector-Number Search

Confirmed in `lib/cardSearch.ts`: searches such as `098/112` were mostly reduced to generic terms and did not directly query `number`.

Fix:

- Added parsed collector-number hints for `098/112`, `098-112`, `098 112`, `098 of 112` and `#098`.
- Added number-specific Supabase query path.
- Scoring now boosts exact number + set-total matches above fuzzy name results.

### Graded Price Fallback

Confirmed in `lib/pricing.ts`: `pickPokeTraceTier` fell back to the first tier when a requested graded tier was missing. This could make an unavailable requested grader/grade look priced from another tier.

Fix:

- Added exact-tier resolution for graded prices.
- PSA 10, CGC 10, BGS 9.5, ACE 10 and other grader populations now use distinct keys.
- Missing exact graded tiers return unavailable instead of inheriting another grader.

Affected files:

- `lib/pricing.ts`
- `lib/graderRegistry.ts`
- `scripts/verify-pricing-domain.ts`

### Slab Listing Value Fallback

Confirmed in `features/listing/CreateListingScreen.tsx`: graded slab market value could fall through to raw TCG/CardMarket values when graded pricing was unavailable.

Fix:

- Graded slabs now use graded PokeTrace or graded eBay fallback only.
- Raw TCG/CardMarket values are not used as slab values.

### Home/Profile Count Divergence

Confirmed in code:

- Home built `ownedUnits` from binder cards and variant records inside `features/home/HubScreen.tsx`.
- Profile independently combined `user_card_variants` and supplemental binder rows inside `features/profile/ProfileScreen.tsx`.

This explains the observed mismatch where Home could show `189` while Profile showed `120`.

Fix:

- Added `lib/collectionSummary.ts`.
- Profile now uses `getCollectionSummary()` for binder count, cards owned, completed sets and collection value.
- Home uses the same shared summary for headline owned count and value.

Current chosen shared metric:

- `totalCardsOwned`: distinct owned card/variant/slab units.
- `totalOwnedItems`: quantity-aware total, retained for detail use.

## Likely Bottlenecks Still Present

- First local-card-index build can still require a paged Supabase read of `pokemon_cards`; this is cached afterwards.
- Search callers still use screen-level debouncing inconsistently; cancellation is not centralised in a shared hook yet.
- Some custom search selects may omit `language`; default search now includes it, but not every screen uses default columns.
- PokeTrace itself may not provide complete Japanese coverage. The app now keeps Japanese cache lanes separate, but it cannot invent missing provider coverage.
- Collection summary currently uses current TCG-style value where available; exact graded slab collection valuation still needs grader-specific stored price coverage.

## Query Patterns Observed

- `pokemon_cards`: name/set/number search, exact ID fetch, set fetch.
- `pokemon_sets`: set lookup and completion totals.
- `market_price_snapshots`: latest card prices and history by `card_id`.
- `user_card_variants`: ownership quantities by `user_id`, `set_id`, `card_id`.
- `binder_cards`: binder membership and owned state.
- `user_card_flags`: marketplace listing data including `pricing_mode`, `grade_company`, `grade`.

## Database Indexes Added

Migration:

- `supabase/migrations/20260714120000_performance_pricing_indexes.sql`

Indexes:

- `pokemon_cards_language_set_number_idx`: language + set + collector-number search.
- `pokemon_cards_name_trgm_idx`: approximate name search.
- `pokemon_cards_raw_data_gin_idx`: JSON catalogue metadata lookup.
- `market_price_snapshots_card_language_latest_idx`: newest-first language-specific price history.
- `user_card_variants_user_set_card_idx`: collection summary aggregation.
- `user_card_variants_user_quantity_idx`: quantity aggregation.
- `user_card_flags_graded_listing_idx`: graded marketplace filtering.
- `binder_cards_binder_owned_idx`: binder-owned summary queries.

## Cache Strategy

Existing:

- PokeTrace price cache: 60 seconds.
- PokeTrace history cache: 60 seconds.
- TCGCSV UI cache: 10 minutes.
- Binder request cache: 20-30 seconds.
- Local card index: 7 days in AsyncStorage chunks.

Added/changed:

- PokeTrace price cache key now includes language, grader, grade and grade label.
- `getCollectionSummary()` has a 20-second in-memory TTL plus inflight de-duplication.
- Japanese and English price requests no longer share the same local client cache key.

## Japanese Catalogue Source And Coverage

Confirmed sources:

- `pokemon_cards.language` and `pokemon_sets.language` were added by migration `20260707120000_japanese_card_pricing_support.sql`.
- Backend has TCGdex Japanese endpoints in `backend/lib/tcgdex.js` and routes in `backend/server.js`.

Coverage limitation:

- No code change in this pass fabricates missing Japanese catalogue rows.
- If a Japanese card is missing from `pokemon_cards` or TCGdex, the UI must show unavailable/no-result states.

## Japanese Pricing Behaviour

Changed:

- Price calls can pass `language`.
- Client PokeTrace cache keys include `language`.
- eBay fallback calls from card detail pass language.

Limitation:

- PokeTrace provider coverage for Japanese prints is not guaranteed by this pass.
- English pricing is not silently presented as Japanese pricing by the cache layer.

## Grader Registry

New:

- `lib/graderRegistry.ts`

Supported definitions:

- PSA
- CGC, including legacy `CGS` alias
- Beckett / BGS
- TAG
- AGS
- ACE
- GetGraded

The registry contains display names, aliases, supported grades, certification method, template key, subgrade support and price coverage.

## Pricing Key

New central pricing key:

- `canonicalCardId`
- `language`
- `edition`
- `variant`
- `rawOrGraded`
- `grader`
- `grade`
- `gradeLabel`
- `currency`
- `source`
- `salesWindow`

Implemented in:

- `buildStackrPricingKey()` in `lib/pricing.ts`

## Slab Label Changes

Changed:

- Shared grader display and grade-label terminology now comes from `lib/graderRegistry.ts`.
- Label dynamic text uses shorter metadata and stricter zones.
- Long names can use two controlled lines in the modal size.
- Grade area has a higher minimum font scale and hidden overflow.
- Text blocks use hidden overflow and no font padding to reduce clipping differences between iOS and Android.

Limitations:

- This is still an asset-backed template renderer, not a full text-measurement engine.
- Visual QA is still required on physical devices for the long-name cases.

## Verification Added

Script:

- `scripts/verify-pricing-domain.ts`

Checks:

- CGS normalises to CGC.
- PSA 10 and CGC 10 use distinct tiers.
- BGS 9.5 tier format is distinct.
- ACE 10 does not inherit PSA/CGC/BGS pricing when missing.
- English and Japanese pricing keys are distinct.

Run:

- `npx tsx scripts/verify-pricing-domain.ts`

Result:

- Passed.

## Measured Results

Local checks completed:

- `npx tsx scripts/verify-pricing-domain.ts`: passed.
- `npx tsc --noEmit`: passed after integration fixes.

Not measured in this environment:

- Physical iOS/Android search latency.
- Real Supabase query plans after migration.
- Real Japanese catalogue hit rate.
- Real PokeTrace/TCGdex Japanese coverage.
- Slab-label pixel overlap via screenshot automation.

These require a seeded database and device/emulator visual QA.

## Manual QA Still Required

- Japanese exact-name search.
- English alias search for a Japanese print.
- `098/112`, `098 112`, and set-code + number searches.
- PSA 10 vs CGC 10 vs ACE 10 slab listing values.
- Missing graded price state.
- Slab label long-name cases.
- Home/Profile count after scanning, deleting, slab conversion and quantity changes.
