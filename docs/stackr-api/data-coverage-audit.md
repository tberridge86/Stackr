# Stackr Data Coverage Audit

Audit date: 2026-07-27
No live production database counts were queried in this Stage 1 audit.

## Data Sources Found

Current catalogue and pricing data comes from a mix of:

- Legacy Supabase tables such as `pokemon_cards`, `pokemon_sets`, `card_prices` and `market_price_snapshots`.
- Canonical catalogue tables introduced by migrations: `tcg_series`, `tcg_sets`, `tcg_cards`, `card_printings`, `card_variants`, `provider_records`, `provider_card_records`, `provider_mappings`.
- TCGdex ingestion scripts and backend catalogue routes.
- TCGCSV product/pricing sync scripts.
- Pokemon TCG API fallback helpers.
- PokeData, PokeWallet and Scrydex enrichment paths.
- Pricing V2 observations, sources, snapshots and review queues.
- Recognition feedback, scan lab and shadow-mode pilot datasets.

## Local Packaged Catalogue

Read-only inspection of `assets/catalogue/card-catalogue.sqlite` found:

| Metric | Value |
| --- | ---: |
| Tables | `cards`, `pack_info` |
| Card rows | 52 |
| English rows | 48 |
| Japanese rows | 2 |
| Traditional Chinese rows | 2 |
| Simplified Chinese rows | 0 |
| Korean rows | 0 |

The local catalogue manifest reports:

- Pack version: `stackr-card-identity-catalogue-v0.0.0-blocked`
- Status: blocked
- Canonical cards: 52
- Embeddings: 0 approved, 52 missing
- Embedding file bytes: header only
- Install is explicitly rejected until approved embeddings exist.

## Model And Recognition Dataset Coverage

`assets/models/card_identity/model-manifest.json` reports:

- Model version: `stackr-card-identity-onnx-v0.0.0-blocked`
- Status: blocked
- No mobile inference approval.
- No exported `model.onnx`.
- Tested images: 0.
- Required test images: 1000.
- Quantized accuracy, parity and benchmark values are unavailable.

`ml/models/stackr-embedding-v0/metrics.json` reports:

- Status: blocked.
- Blockers include no approved training pixels and no real phone test captures.
- Protected test set row count: 315.
- Real phone captures: not available.
- No selected baseline.

## Language Coverage

| Language | Current evidence | Gap |
| --- | --- | --- |
| English | Strongest support. Legacy Pokemon TCG API paths, local index, packaged rows, TCGCSV/pricing scripts and many app flows assume English data. | Direct provider/app coupling remains. |
| Japanese | TCGdex language support includes `ja`; canonical Japanese migrations and health scripts exist; packaged local rows include 2 Japanese rows. | Coverage count and set completeness were not verified against production DB. |
| Traditional Chinese | TCGdex support includes `zh-tw`; packaged local rows include 2 `zh-Hant` rows; PokeData Chinese exploration exists. | Production set/card coverage and variant completeness are unverified. |
| Simplified Chinese | Pricing adapters and some recognition types mention `zh-CN` or Chinese simplified concepts. | No packaged local rows found; TCGdex code normalizes generic Chinese to `zh-tw`; production ingestion path is not proven. |
| Korean | Shared recognition types and pricing adapter capability lists mention Korean. | No packaged local rows found; no TCGdex Korean language support in current code; local OCR matcher does not implement Korean production matching. |

## TCGdex Language Support In Code

`backend/lib/tcgdex.js` supports:

- `en`
- `fr`
- `es`
- `it`
- `pt-br`
- `de`
- `ja`
- `zh-tw`
- `id`
- `th`

The project objective requires English, Japanese, Simplified Chinese, Traditional Chinese and Korean. Current TCGdex code covers English, Japanese and Traditional Chinese only among those required languages.

## Canonical Identity And Variants

Positive findings:

- New canonical schema includes printings, variants, provider mappings and provider records.
- Variant resolver includes exact identity concepts beyond card name.
- `user_card_variants` supports multiple user-owned variants.
- Pricing V2 identity includes language, variant, finish, edition, condition, product type, grader and grade.
- Recognition feedback identity includes Stackr card ID, card name, set ID, collector number, language and variant.

Gaps:

- Legacy app flows still use `pokemon_cards` and `pokemon_sets`.
- Local card index is based on `pokemon_cards`, not the full canonical catalogue.
- Variant classifier manifest is blocked by missing training set/approved weights.
- Some scan result pricing still pulls provider variants directly instead of through Pricing V2.

## Source Attribution

Positive findings:

- Canonical TCGdex migrations include source provider, source ID, raw payload, retrieved time and provider mapping structures.
- `provider_records`, `provider_card_records` and `provider_mappings` exist.
- Pricing V2 `price_observations` includes source ID, external reference, source type, fetched time, condition, listing URL, raw payload and match confidence fields.
- Scanner training samples include source type and rights status constraints.
- Recognition feedback and scan lab tables track consent, image upload state and checksums.

Gaps:

- Legacy tables may not consistently carry licence status and raw source identifiers.
- Public CDN eligibility is not yet governed by a single rights-status service.
- Production data coverage by language/set could not be measured without a trusted schema dump or read-only production query.

## Pricing Coverage

Pricing sources found:

- Existing Stackr cached snapshots.
- TCGdex/TCGPlayer/Cardmarket payload-derived prices.
- TCGCSV product pricing.
- Manual verified comps.
- eBay active listings.
- Optional authorised eBay sold provider.
- Legacy PokeTrace/Pokemon Price Tracker style routes.

Pricing V2 explicitly separates market value from asking-price indications. This is a strong target pattern, but the backend feature flag defaults to disabled and the app still contains legacy price fallbacks.

## Coverage Measurement Gaps

Before Stage 2 can claim catalogue readiness, Stackr needs:

- Production-safe counts by language, set, card, printing and variant.
- Coverage by required language: `en`, `ja`, `zh-Hans`, `zh-Hant`, `ko`.
- Coverage by source provider and licence/rights status.
- Counts of records with images, missing images, blocked images and cached Stackr-owned image URLs.
- Counts of records with exact identity keys and provider mappings.
- Recognition benchmark rows by language, set, variant, finish, device class and capture condition.

## Data Go/No-Go

Go for Stage 2 read-only API facade and coverage-report endpoints.

No-go for replacing current recognition fallback or declaring multilingual catalogue completeness. The local pack is blocked and current required-language coverage is incomplete.
