# Stackr Foreign Card Catalogue and Image Audit

Generated: 2026-07-26 08:31 BST

Sources checked:
- TCGdex English sets: https://api.tcgdex.net/v2/en/sets
- TCGdex Japanese sets: https://api.tcgdex.net/v2/ja/sets
- TCGdex Traditional Chinese sets: https://api.tcgdex.net/v2/zh-tw/sets
- PokeData Chinese page: https://www.pokedata.io/sets#CHINESE
- PokeData sets API: https://www.pokedata.io/api/sets

Generated evidence:
- `tmp/foreign-card-audit/provider-coverage-report.json`
- `tmp/foreign-card-audit/provider-image-probes.json`
- `tmp/foreign-card-audit/live-supabase-catalogue-report.json`
- `tmp/foreign-card-audit/missing-image-report.json`
- `tmp/foreign-card-audit/set-coverage-report.json`
- `tmp/foreign-card-audit/pricing-coverage-report.json`
- `tmp/foreign-card-audit/failed-record-report.json`

## Root-Cause Summary

Stackr is not failing because Japanese or Chinese image URLs are generally blocked. The live probes show valid TCGdex and PokeData image URLs returning `200`, image MIME types, usable dimensions, no auth requirement, no hotlink block, and no signed expiry. The real failure is identity and ingestion drift across language-specific catalogue paths.

The main causes are:

1. The canonical TCGdex sync layer only supports `en` and `ja`. `zh-tw` is recognised by lower-level helpers, but `backend/lib/tcgdexCatalogue.js` normalises unsupported languages back to `en`, so Chinese cannot become durable canonical catalogue rows.
2. Japanese provider mappings are being written with the default top-level `language = 'en'`. The sync code puts `language` inside `metadata`, but omits the top-level mapping field before upserting on `provider,provider_card_id,language`. Production evidence shows 5,220 `provider_mappings` rows where `stackr_card_id` is `ja:*` but `language` is `en`.
3. PokeData client mapping is hardcoded around Japanese. Chinese PokeData sets are mapped as English in `mapPokeDataSet`, while PokeData cards are hardcoded to `language: 'ja'` and `region: 'JP'`.
4. Search, global search, binder lookup, virtual binder IDs, and marketplace pricing still contain English/Japanese-only gates. Chinese IDs with `zh-tw:` prefixes are either ignored or normalised incorrectly.
5. Japanese missing images are mostly provider coverage gaps, not bad HTTP image URLs. Current Supabase evidence shows 5,220 Japanese canonical cards, 2,294 resolved images, and 2,926 missing images. The missing rows mostly have no provider image base, so no URL was ever available to validate.
6. The backend has a controlled image ingestion path, but it depends on `sharp` and `STACKR_CACHE_PROVIDER_IMAGES=true`. In this workspace `sharp` is not installed at the root, so deployment packaging must be verified before relying on image validation/derivative generation.
7. Pricing is only partly language-separated. Canonical `market_prices` has Japanese rows, but `card_prices` and `market_price_snapshots` show no Japanese rows in the readable production data, and marketplace display pricing attaches snapshots by `card_id` without filtering language.

## Current Coverage

Live provider coverage:

- TCGdex: 218 English sets, 177 Japanese sets, 98 Traditional Chinese sets.
- TCGdex set logos/symbols: English has broad logo/symbol coverage, Japanese only 4 sets exposed logo/symbol assets, Traditional Chinese exposed 0 set logo/symbol assets in the sampled set list.
- PokeData Chinese local export: 117 Chinese sets, 15,201 cards, 15,201 card image URLs, 3,816 cards with at least one value, 11,385 unpriced.

Current readable Supabase catalogue:

- `tcg_sets`: `ja = 177`, `zh-tw = 0`.
- `tcg_cards`: `ja = 5,220`, `zh-tw = 0`.
- Japanese images: 2,294 resolved, 2,926 missing.
- Japanese set sync: 177 sets present, 107 sets have zero stored cards, 130 sets are not complete.
- Provider mappings: 5,220 Japanese card mappings are stored under top-level `language = 'en'`.
- Pricing: `market_prices` has 3,248 Japanese rows; `card_prices` and `market_price_snapshots` show 0 Japanese rows in the public-readable report.

Largest Japanese missing-image sets:

- `ja:SM12a` TAG TEAM GX Tag All Stars: 226/226 missing.
- `ja:SV11W` White Flare: 174/174 missing.
- `ja:VS1` Pokemon Card VS: 143/143 missing.
- `ja:E1` Base Expansion Pack: 128/128 missing.
- `ja:SM12` Alter Genesis: 117/117 missing.
- `ja:SM10` Double Blaze: 116/116 missing.

## Failure Map

| Stage | English path | Japanese divergence | Chinese divergence |
| --- | --- | --- | --- |
| Search request | `searchLocalPokemonCards(..., language: en)` searches `pokemon_cards`, API fallback, local index. | Canonical Japanese search exists, but only for `language === 'ja'`. | All-language search only fans out to `en` and `ja`; Chinese is absent. |
| Set lookup | English uses PokemonTCG/TCGdex IDs and generated image URLs. | Japanese TCGdex sets import, but set logos are often absent from TCGdex and need PokeData/PokeWallet assets. | TCGdex has `zh-tw` sets, but canonical sync normalises `zh-tw` to `en`; PokeData Chinese is not mapped into canonical rows. |
| Card lookup | English card IDs are stable provider IDs like `base1-1`. | Japanese canonical IDs use `ja:SV2a-001`, but provider mappings are recorded as `language = en`. | `zh-tw:` prefixes are not stripped or inferred by multiple helpers. |
| External API request | PokemonTCG/TGCdex English image paths usually resolve. | TCGdex images resolve when `card.image` exists; many Japanese TCGdex records have no image base. | TCGdex Chinese images resolve when image bases exist; many Chinese sets have no logo/symbol; no durable sync path. |
| Identifier mapping | `provider_mappings` default language works for English by accident. | Sync omits top-level mapping language, causing Japanese records to be indexed as English. | Chinese would also collapse to English in the current canonical sync. |
| Supabase records | English legacy and canonical tables are supported. | Canonical Japanese rows exist, but legacy `pokemon_cards` has no readable Japanese rows and provider mappings are wrong. | No `zh-tw` canonical rows exist in the readable production report. |
| Image URL storage | `card_images` and card image fields can store resolved URLs. | Missing rows usually have no provider image base, not a failed URL. | No canonical rows means no image storage or checks for Chinese. |
| CDN behaviour | Valid TCGdex/PokeData image URLs are cacheable and public. | Valid Japanese TCGdex/PokeData probes are public and cacheable. | Valid Chinese TCGdex/PokeData probes are public and cacheable. |
| React Native render | `StackrImage` renders the URI or falls back silently. | UI cannot diagnose why a missing image failed unless backend image check rows exist. | Same, but Chinese rows do not reach the renderer consistently. |
| Cache | App request/image caches speed repeats. | Failed URI states can persist until cache invalidates; no structured client-side image-failure event is written. | Same, plus catalogue rows are missing. |
| Marketplace matching | Listings use `card_id`, set/product fields, and snapshots. | Price display can ignore language if it reads by `card_id` only. | Chinese prices would be normalised to English by current price language helper. |
| Pricing lookup | English marketplace language is default. | Some Japanese market prices exist, but mappings and snapshots do not line up. | Chinese pricing is unsupported; `normalizePriceLanguage` returns `en` for anything not Japanese. |

## Affected Code Paths

- `backend/lib/tcgdexCatalogue.js`
  - `SUPPORTED_LANGUAGES = new Set(['en', 'ja'])`.
  - `normalizeLanguage` falls unsupported values back to `en`.
  - `stripLanguagePrefix` strips only `en`, `ja`, `jp`.
  - `writeCardRows` creates `provider_mappings` without a top-level `language` field.
  - `repairTcgdexCatalogue` defaults to `['en', 'ja']`.
- `backend/lib/tcgdex.js`
  - Lower-level TCGdex helper correctly recognises `zh-tw`, proving the language support split is internal.
- `lib/pokemonTcg.ts`
  - `normalizePokemonCardLanguage` supports `zh-tw`, but `mapPokeDataSet` maps non-Japanese PokeData sets to English.
  - `mapPokeDataCard` hardcodes PokeData cards as Japanese.
  - `findPokeDataSetForLookup` filters only Japanese PokeData sets.
  - `fetchAllSets` loads PokeData only for Japanese/all.
  - `fetchCardsForSet` only uses PokeData card fallback for Japanese.
- `lib/cardSearch.ts`
  - Canonical search returns rows only for `language === 'ja'`.
  - All-language search combines only English and Japanese.
- `lib/globalSearch.ts`
  - Global card search explicitly queries only English and Japanese.
- `lib/binders.ts`
  - `inferBinderLanguage`, `stripSetLanguagePrefix`, `getSetLookupCandidates`, and `parseVirtualBinderCardId` do not support `zh-tw`.
  - Some virtual card upserts still conflict on `binder_id,card_id` only, which is not language/variant safe.
- `lib/marketplace.ts`
  - `attachPrices` reads `market_price_snapshots` by `card_id` only and does not filter by listing/card language.
- `backend/server.js`
  - `normalizePriceLanguage` only returns `ja` or `en`.
  - eBay title filters treat Chinese as non-English, but there is no Chinese positive lane.
- `supabase/migrations/20260718120000_tcgdex_catalogue_repair.sql`
  - `provider_card_records` is unique on `(provider, provider_record_id)` without language.
  - `catalogue_health` reports English/Japanese set counts only.

## Identifier Findings

Risky identifiers currently in use:

- English set IDs for non-English records.
- Translated display names.
- Card number alone.
- Set code without language.
- PokeData numeric ID without language/source.
- TCGdex provider ID with language stored inconsistently.
- `zh-tw:` prefixes not recognised by several helpers.
- Collector numbers normalised inconsistently across leading zeros and slash totals.
- Secret-card numbering is handled in some search paths but not enforced as a canonical key.

Use this canonical internal key:

```text
game + source + language + provider_set_id + collector_number_normalized + variant_id
```

Examples:

```text
pokemon:tcgdex:ja:SV2a:001:normal
pokemon:tcgdex:zh-tw:SV2a:001:normal
pokemon:pokedata:zh-tw:3841:001:normal
pokemon:pokedata:ja:3858:001:normal
```

Rules:

- Preserve the provider record ID separately.
- Preserve the printed collector number exactly and store a normalised number for matching.
- Never merge solely by translated name.
- Include variant/finish/source variant when PokeData exposes multiple entries for the same number.
- Use `language` in every unique key and conflict target where provider IDs may overlap.

## Image Diagnostics

Live probes:

- TCGdex English `base1-1`: `200 image/webp`, 600x825, public, cacheable.
- TCGdex Japanese `SV2a-001`: `200 image/webp`, 600x825, public, cacheable.
- TCGdex Japanese `M1L-001`: provider card record has no image base.
- TCGdex Chinese `SV2a-001`: `200 image/webp`, 600x825, public, cacheable.
- TCGdex Chinese `SC2a-001`: provider card record has no image base.
- PokeData Chinese card sample: `200 image/webp`, 300x419, public.
- PokeData Japanese card sample: `200 image/webp`, 716x1000, public.

Current failed Japanese image report:

- `tmp/foreign-card-audit/missing-image-report.json` contains every readable Japanese card with non-resolved image state from the current production catalogue.
- Count: 2,926.
- Common failure reason: provider record has no image base.
- `tmp/foreign-card-audit/failed-record-report.json` is empty from public-readable `catalogue_sync_errors`, so the missing images are not currently represented as sync errors.

Required improvement:

- When a provider supplies no image base, record a `card_image_checks` row with `candidate_url = null`, provider source, card ID, provider record ID, and failure reason. Right now `catalogue_health` reports missing cards, but `image_resolution_failures` is 0, which hides the cause.

## Database Changes

Recommended additive changes:

1. Add `internal_card_key` to canonical card/printing tables and backfill it from `language/source/set/collector/variant`.
2. Change or add a unique constraint for provider records:

```sql
unique (provider, provider_record_type, provider_record_id, language)
```

3. Fix `provider_mappings`:

```sql
update public.provider_mappings
set language = metadata->>'language'
where stackr_card_id like 'ja:%'
  and language = 'en'
  and metadata->>'language' = 'ja';
```

Add a check/audit query for future rows where the card ID prefix and top-level language disagree.

4. Make binder and listing uniqueness language safe:

```sql
unique (binder_id, card_id, set_id, language)
```

Do not use `onConflict: 'binder_id,card_id'` for multilingual official binders.

5. Add image asset governance fields:

- `source_provider`
- `source_url`
- `storage_bucket`
- `storage_path`
- `checksum_sha256`
- `original_content_type`
- `original_width`
- `original_height`
- `rights_status`
- `attribution`
- `removal_required_at`
- `derivatives`

6. Extend health views to report all languages, not just English/Japanese.
7. Keep Japanese/Chinese pricing in language-specific price tables and indexes. Reads should filter by `card_id`, `set_id`, and `language`.

## Adapter Layer

Create a provider adapter contract:

```ts
type CatalogueProviderAdapter = {
  provider: 'tcgdex' | 'pokedata' | 'pokemon_tcg_api' | 'pokewallet';
  supportedLanguages: string[];
  coverage(): Promise<ProviderCoverage>;
  fetchSets(language: string): Promise<CanonicalSet[]>;
  fetchCardsForSet(language: string, providerSetId: string): Promise<CanonicalCard[]>;
  resolveImages(card: CanonicalCard): Promise<ImageCandidate[]>;
  fetchPrices(card: CanonicalCard): Promise<PriceObservation[]>;
  licensing(): ProviderLicensing;
};
```

Adapter output must include:

- Coverage.
- Language support.
- Image availability.
- Pricing availability.
- Rate limits.
- Licensing restrictions.
- Update frequency.
- Error state.

Adapters should return a common schema. Reconciliation should use exact provider IDs, source set IDs, language, collector number, and variant. Names are evidence only, not identity.

## Controlled Image Ingestion

Do not depend permanently on third-party hotlinked images.

Process:

1. Fetch only from authorised/permitted sources.
2. Validate HTTP status, MIME type, format support, and dimensions.
3. Generate `sha256` checksum.
4. Detect duplicate assets by checksum.
5. Store a permitted copy in controlled object storage when rights allow.
6. Generate thumbnail, grid, listing, detail, and full-resolution derivatives.
7. Store source attribution and rights status.
8. Record removal/refresh requirements.
9. Store placeholders only when no valid or permitted image exists.

Implementation note: verify backend deployment includes `sharp` or replace it with a dependency available in the backend package.

## Pricing Changes

Japanese and Chinese pricing must remain separate from English pricing.

Required shape:

- `entity_id`
- `language`
- `source_provider`
- `marketplace_region`
- `currency`
- `exchange_rate`
- `exchange_rate_timestamp`
- `raw_or_graded`
- `grader`
- `grade`
- `condition`
- `sale_date`
- `source_url`
- `outlier_score`
- `confidence`

Rules:

- Never copy English prices into Japanese/Chinese records.
- Never treat Chinese as English in `normalizePriceLanguage`.
- Marketplace display should use listing/card language.
- Search price queries should include positive language terms for Japanese/Chinese and reject other-language listings.
- Keep PokeData price source labels as PokeData/eBay/PSA; do not store them in `tcgplayer`-shaped raw data unless the original source is actually TCGplayer.

## Tests

Unit tests:

- `normalizeLanguage('zh-tw')` remains `zh-tw` in canonical backend sync.
- `stripLanguagePrefix('zh-tw:SV2a')` returns `SV2a`.
- PokeData Chinese set maps to `language = zh-tw`, not `en`.
- PokeData Chinese card maps to `language = zh-tw`, not `ja`.
- Canonical key generation distinguishes `ja:SV2a-001`, `zh-tw:SV2a-001`, and `en:sv3pt5-1`.
- Provider mappings include top-level `language`.
- Search all-language includes configured languages.
- Binder virtual IDs parse `zh-tw:` correctly.
- Marketplace price lookup filters by language.
- eBay pricing language normalisation supports `zh-tw` and positive Chinese search terms.

Integration tests:

- Sync `ja:SV2a`; rerun sync; no duplicate cards or mappings.
- Sync `zh-tw:SV2a`; cards and images persist under `zh-tw`.
- Import PokeData Chinese export; rerun; no duplicate records.
- Open official Japanese set with missing image rows; no crashes.
- Open official Chinese set; cards display with honest missing data where needed.
- Resolve images for a card with a valid TCGdex image; row moves to `resolved`.
- Resolve images for a card with no provider image base; diagnostic row is written.
- Pricing refresh writes separate Japanese/Chinese rows and does not update English snapshots.
- Marketplace listing for a Japanese card reads Japanese price rows only.

Acceptance validation:

- New user with no history can browse English plus expandable Japanese/Chinese sets.
- Existing Japanese binders open without crashes.
- Chinese binders can be created from canonical rows.
- Missing images display placeholders with diagnostic status.
- Rerunning imports is idempotent.
- Pricing is language-specific and marked unavailable where no data exists.

## Recommended Implementation Order

1. Fix language normalisation and prefix handling across backend canonical sync, frontend catalogue helpers, binder helpers, search, marketplace, and pricing.
2. Fix `provider_mappings` write path to include top-level `language`; run backfill for existing Japanese rows.
3. Update database uniqueness/indexes to include language/source/variant where needed.
4. Build the canonical internal card key and backfill Japanese rows.
5. Add Chinese support to canonical sync using TCGdex first, then PokeData as a separate adapter/source.
6. Replace hardcoded PokeData Japanese mapping with language-aware PokeData mapping.
7. Make image diagnostics complete, including no-image-base failures.
8. Enable controlled image ingestion/storage only for sources that allow it; generate derivatives and checksums.
9. Repair marketplace and price lookup paths to use `card_id + set_id + language`.
10. Add the tests above and run an idempotent import/reimport validation for Japanese and Chinese sample sets.
11. Extend UI copy/states to show missing data honestly without crashes.

## Acceptance Status Today

- A Japanese set can be opened without missing-card crashes: partially true, but image/price gaps remain.
- Correct cards matched using stable IDs: not reliable because provider mappings have wrong top-level language.
- Image failures logged and diagnosable: partially false; missing provider image base is not represented in image check failures.
- Images persist reliably after refresh: partially true when provider image base exists; controlled storage must be verified.
- Pricing is language-specific: partially true in schema, false in some read/write paths.
- Missing data marked honestly: partially true in `image_status`, less true in diagnostics and pricing.
- Import reruns safely without duplicates: partially true for cards, unsafe for mapping/binder conflicts until language/variant keys are fixed.
