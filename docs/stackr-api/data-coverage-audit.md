# Stackr Data Coverage Audit

Audit date: 2026-07-27
Scope: read-only repository and Supabase inspection. No imports, refreshes or data repairs were run.

## Source Systems Found

Current catalogue and pricing data comes from a mix of:

- Legacy Supabase tables: `pokemon_cards`, `pokemon_sets`, `market_price_snapshots`, `card_prices`.
- Canonical-ish public tables: `tcg_series`, `tcg_sets`, `tcg_cards`, `card_printings`, `card_variants`, `provider_records`, `provider_card_records`, `provider_mappings`.
- Provider ingestion scripts: TCGdex, TCGCSV, Pokemon TCG API, PokeData exploration and provider repair scripts.
- Pricing V2 sources: manual verified comps, existing Stackr cached source, eBay active listings and optional authorised eBay sold source.
- Recognition/feedback datasets in local migrations and app code: scan learning, scanner benchmark, scan lab, recognition feedback and shadow-mode pilot.

## Live Language Coverage

Connected Supabase row counts found the following coverage:

| Table/data area | Language | Rows | Notes |
| --- | --- | ---: | --- |
| `pokemon_cards` | `en` | about 20,359 | Legacy English Pokemon catalogue. |
| `pokemon_sets` | `en` | about 173 | Legacy English sets. |
| `tcg_cards` | `ja` | 5,220 | TCGdex-backed Japanese canonical-ish catalogue. |
| `tcg_sets` | `ja` | 177 | TCGdex-backed Japanese sets. |
| `card_printings` | `ja` | 5,220 | Japanese printings. |
| `card_prices` | `ja` | 3,248 | TCGdex/Cardmarket-derived price rows. |
| `market_prices` | `ja` | 3,248 | TCGdex/Cardmarket-derived market rows. |
| `market_price_snapshots` | `en` | about 330,293 | Legacy snapshot volume. |
| `market_price_snapshots` | `ja` | 41 | Very small Japanese snapshot presence. |
| Live aggregate checks | `zh-Hans` | 0 detected | No Simplified Chinese production row coverage found. |
| Live aggregate checks | `zh-Hant` | 0 detected | No Traditional Chinese production row coverage found in live aggregates. |
| Live aggregate checks | `ko` | 0 detected | No Korean production row coverage found. |

Conclusion: production coverage is currently English-heavy with a Japanese canonical/catalogue island. It does not meet the stated objective for English, Japanese, Simplified Chinese, Traditional Chinese and Korean coverage.

## Live Set And Collector Coverage

Exact checks found:

| Table | Rows | Distinct sets | Distinct collector numbers | Raw/source payload evidence |
| --- | ---: | ---: | ---: | --- |
| `tcg_cards` | 5,220 | 50 | 360 | Source/raw payload present. |
| `card_printings` | 5,220 | 50 | 360 | Source/raw payload present. |
| `pokemon_cards` | 20,359 | 173 | 1,759 | Name/raw data present. |

Collector numbers with letters, slashes, leading zeroes and regional characters must remain strings. Stage 2 should add separate sortable collector-number components rather than converting collector numbers to numeric identity.

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

The catalogue package is not production-ready:

- Pack version: `stackr-card-identity-catalogue-v0.0.0-blocked`
- Status: blocked
- Canonical cards: 52
- Approved embeddings: 0
- Missing embeddings: 52
- Install is rejected until approved embeddings exist.

## Model And Recognition Dataset Coverage

`assets/models/card_identity/model-manifest.json` reports a blocked model:

- Model version: `stackr-card-identity-onnx-v0.0.0-blocked`
- No mobile inference approval.
- No exported production card-identity `model.onnx` found.
- Tested images: 0.
- Required test images: 1,000.
- Quantized accuracy, parity and benchmark values are unavailable.

`ml/models/stackr-embedding-v0/metrics.json` is also blocked because approved training pixels and real phone captures are unavailable.

## Catalogue Data Structures

Positive findings:

- Local migrations introduce canonical concepts, series, sets, cards, printings, variants, sealed products, provider records and provider mappings.
- TCGdex repair migrations add provider card records, card images/checks, card prices/checks and catalogue sync runs/errors.
- Search helpers already read both `pokemon_cards`/`pokemon_sets` and `tcg_cards`/`tcg_sets`.
- Pricing V2 identity includes language, variant, finish, edition, condition, product type, grader and grade.
- Recognition feedback identity includes Stackr card ID, name, set ID, collector number, language and variant.

Gaps:

- Canonical schema work is in `public`; the requested `catalog`, `ingest`, `market`, `ml`, `api` and `audit` schemas do not exist live.
- `canonical_card_concepts`, `cards` and `card_variants` had zero live rows in the audit checks.
- `tcg_cards` had local names/raw payloads, but English display names were not populated in the exact row check.
- Raw, graded and sealed product identities are present in code/migrations, but not consistently unified behind a single canonical API surface.
- Set codes cannot be assumed globally unique. Stage 2 must scope them by game/language/provider/canonical set identity.

## Variants, Rarities And Finishes

Current support:

- `user_card_variants` supports multiple owned user variants.
- `card_variants` table exists, but live row count was 0.
- Variant resolver code supports finish/variant concepts and exact identity scoring.
- Pricing V2 has fields for variant, finish, edition, condition, product type, grader and grade.

Required taxonomy still needs a canonical seed:

- normal
- holo
- reverse holo
- first edition
- unlimited
- promo
- stamped
- Poke Ball
- Master Ball
- regional/other variants

Stage 2 must allow variants that share artwork and must not merge them by name alone.

## Source Attribution And Provenance

Positive findings:

- TCGdex-oriented migrations store source provider, source ID, raw payload and retrieval timestamps.
- `provider_records`, `provider_card_records` and `provider_mappings` are present live.
- Pricing V2 `price_observations` includes source ID, external reference, source type, fetched time, condition, listing URL, raw payload and match confidence fields.
- Scanner training/feedback migrations include consent, source type, rights status and image checksum concepts.

Gaps:

- Legacy `pokemon_cards`/`pokemon_sets` and legacy price snapshots may not consistently carry licence status and raw source identifiers.
- Public image/CDN eligibility is not governed by one rights-status service.
- Live data has provider/source rows but not a complete licence-review workflow.
- `price_observations` and `pricing_review_queue` were empty in live checks, so Pricing V2 evidence capture is not yet populated.

## Pricing Coverage

Live pricing-related counts:

| Table | Rows | Notes |
| --- | ---: | --- |
| `market_price_snapshots` | about 330k | Mostly English legacy pricing snapshots. |
| `market_product_price_snapshots` | 12,607 | Product/sealed pricing snapshots. |
| `card_prices` | 3,248 | TCGdex/Cardmarket-style card prices. |
| `market_prices` | 3,248 | Canonical-ish market rows. |
| `pricing_sources` | 4 | Source taxonomy seeded. |
| `price_observations` | 0 | Pricing V2 observation table not populated. |
| `pricing_review_queue` | 0 | No live review queue rows. |

Live pricing source rows:

- `ebay_active`: enabled; active-listing evidence.
- `ebay_sold`: disabled/unconfigured; sold-transaction evidence.
- `existing_stackr_source`: enabled; market estimate.
- `manual_verified_comp`: enabled; sold-transaction/manual evidence.

Pricing V2 correctly separates market value from asking-price indications, but the live evidence tables are not yet proving the model at production scale.

## Missing Live Tables Referenced By Local Work

The read-only live check did not find several tables referenced by local migrations and code, including:

- `scan_lab_captures`, `scan_lab_capture_events`
- `recognition_feedback_items`, `recognition_feedback_events`
- `recognition_shadow_mode_pilot_items`
- `scanner_benchmark_cases`, `scanner_benchmark_runs`, `scanner_benchmark_results`
- `scanner_training_samples`, `scanner_training_augmentations`
- `scanner_feedback_review_queue`, `scanner_confusion_pairs`, `scanner_threshold_sets`
- `price_refresh_queue`, `price_refresh_runs`
- `price_observations` exists live, but has 0 rows
- `market_snapshots`, `card_market_metrics`, `minty_insights`, `minty_insight_signals`, `provider_sync_logs`, `user_insight_interactions`

This live/local mismatch must be resolved before applying Stage 2 production migrations.

## Required Coverage Reports For Stage 2

Before any catalogue cutover, Stage 2 needs automated reports for:

- Cards, sets, printings and variants by required language.
- Source provider, raw source ID presence and licence/rights status.
- Public-image eligibility and missing/blocked image counts.
- Exact canonical identity key coverage.
- External ID conflicts and duplicate collector-number cases.
- Raw, graded and sealed product separation.
- Recognition benchmark rows by language, set, variant, finish, device class and capture condition.

## Data Go/No-Go

No-go for production Stage 2 schema migration until live/local migration drift is reconciled and required-language coverage gaps are acknowledged in tests and acceptance criteria.

Limited go for local-only canonical data-model design and migration tests, as long as no production migration is pushed and current direct paths remain intact.
