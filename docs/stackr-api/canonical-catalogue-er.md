# Canonical Catalogue Entity Relationship

Audit/stage date: 2026-07-28
Migrations:

- `supabase/migrations/20260727212256_canonical_stackr_catalogue_database.sql`
- `supabase/migrations/20260728060617_stackr_asset_repository_delivery_pipeline.sql`

Scope: additive local/repository migration only. No production Supabase migration was pushed.

## Schema Boundaries

```mermaid
flowchart LR
  API["api: public-safe views"]
  Catalog["catalog: canonical catalogue"]
  Ingest["ingest: provider/raw/private"]
  Market["market: private pricing"]
  ML["ml: private recognition datasets"]
  Audit["audit: private events"]

  API --> Catalog
  Ingest --> Catalog
  Ingest --> Market
  Market --> Catalog
  ML --> Catalog
  Audit --> Catalog
```

Public/mobile reads should use `api` views or safe `catalog` reads. `ingest`, `ml`, `audit` and private `market` tables are service-only.

## Core Catalogue ERD

```mermaid
erDiagram
  CATALOG_GAMES ||--o{ CATALOG_SERIES : owns
  CATALOG_GAMES ||--o{ CATALOG_SETS : owns
  CATALOG_GAMES ||--o{ CATALOG_CARD_CONCEPTS : owns
  CATALOG_LANGUAGES ||--o{ CATALOG_SERIES : localizes
  CATALOG_LANGUAGES ||--o{ CATALOG_SETS : localizes
  CATALOG_LANGUAGES ||--o{ CATALOG_CARD_PRINTINGS : localizes
  CATALOG_SERIES ||--o{ CATALOG_SETS : contains
  CATALOG_SETS ||--o{ CATALOG_CARD_PRINTINGS : contains
  CATALOG_CARD_CONCEPTS ||--o{ CATALOG_CARD_PRINTINGS : realizes
  CATALOG_RARITIES ||--o{ CATALOG_CARD_PRINTINGS : classifies
  CATALOG_CARD_PRINTINGS ||--o{ CATALOG_CARD_VARIANTS : has
  CATALOG_VARIANT_TAXONOMY ||--o{ CATALOG_CARD_VARIANTS : classifies
  CATALOG_FINISHES ||--o{ CATALOG_CARD_VARIANTS : finishes
  CATALOG_CARD_CONCEPTS ||--o{ CATALOG_CARD_NAMES : names
  CATALOG_CARD_PRINTINGS ||--o{ CATALOG_CARD_NAMES : names
  CATALOG_CARD_VARIANTS ||--o{ CATALOG_CARD_NAMES : aliases
  CATALOG_SETS ||--o{ CATALOG_ASSETS : assets
  CATALOG_CARD_PRINTINGS ||--o{ CATALOG_ASSETS : assets
  CATALOG_CARD_VARIANTS ||--o{ CATALOG_ASSETS : assets
  CATALOG_ASSETS ||--o{ ML_MODEL_ASSETS : private_model_files
  CATALOG_SETS ||--o{ CATALOG_SEALED_PRODUCTS : includes
  CATALOG_SEALED_PRODUCTS ||--o{ CATALOG_SEALED_PRODUCT_VARIANTS : has
  CATALOG_VARIANT_TAXONOMY ||--o{ CATALOG_SEALED_PRODUCT_VARIANTS : classifies
  CATALOG_CATALOGUE_VERSIONS ||--o{ CATALOG_CATALOGUE_CHANGE_LOG : groups
```

## Provider And Provenance ERD

```mermaid
erDiagram
  INGEST_SOURCES ||--o{ INGEST_IMPORT_RUNS : runs
  INGEST_SOURCES ||--o{ INGEST_RAW_SOURCE_RECORDS : retrieves
  INGEST_IMPORT_RUNS ||--o{ INGEST_RAW_SOURCE_RECORDS : produced
  INGEST_SOURCES ||--o{ INGEST_EXTERNAL_IDENTIFIERS : maps
  INGEST_RAW_SOURCE_RECORDS ||--o{ INGEST_EXTERNAL_IDENTIFIERS : supports
  INGEST_SOURCES ||--o{ INGEST_DATA_CONFLICTS : reports
  INGEST_IMPORT_RUNS ||--o{ INGEST_DATA_CONFLICTS : found
  INGEST_RAW_SOURCE_RECORDS ||--o{ INGEST_DATA_CONFLICTS : caused
```

External identifiers target exactly one canonical entity at a time: series, set, card concept, printing, variant, sealed product, sealed-product variant or asset. Active external IDs are unique by source, source entity type, external ID and language, while deprecated rows preserve historical identifiers.

## Market And Recognition ERD

```mermaid
erDiagram
  CATALOG_CARD_VARIANTS ||--o{ MARKET_MARKET_IDENTITIES : prices
  CATALOG_SEALED_PRODUCT_VARIANTS ||--o{ MARKET_MARKET_IDENTITIES : prices
  MARKET_MARKET_IDENTITIES ||--o{ MARKET_PRICE_OBSERVATIONS : observes
  MARKET_MARKET_IDENTITIES ||--o{ MARKET_PRICE_SUMMARIES : summarizes
  INGEST_SOURCES ||--o{ MARKET_PRICE_OBSERVATIONS : provides
  INGEST_RAW_SOURCE_RECORDS ||--o{ MARKET_PRICE_OBSERVATIONS : backs
  CATALOG_CARD_VARIANTS ||--o{ ML_RECOGNITION_FEEDBACK_ITEMS : labels
  CATALOG_CARD_VARIANTS ||--o{ ML_BENCHMARK_CASES : benchmarks
  CATALOG_CATALOGUE_VERSIONS ||--o{ ML_RECOGNITION_FEEDBACK_ITEMS : references
  CATALOG_ASSETS ||--o{ ML_MODEL_ASSETS : model_files
  ML_SCAN_UPLOAD_ASSETS }o--|| AUTH_USERS : owner_private
```

`market.market_identities` separates `raw_card`, `graded_card` and `sealed_product`. These identities are not combined.

## Public API Projections

```mermaid
erDiagram
  API_CATALOGUE_CARDS }o--|| CATALOG_CARD_VARIANTS : projects
  API_CATALOGUE_CARDS }o--|| CATALOG_CARD_PRINTINGS : projects
  API_CATALOGUE_CARDS }o--|| CATALOG_SETS : projects
  API_CATALOGUE_SETS }o--|| CATALOG_SETS : projects
  API_CATALOGUE_CARD_NAMES }o--|| CATALOG_CARD_NAMES : projects
  API_CATALOGUE_DELTA_CHANGES }o--|| CATALOG_CATALOGUE_CHANGE_LOG : projects
  API_ASSET_MANIFEST }o--|| CATALOG_ASSETS : projects
```

The `api` views are `security_invoker` views and expose only safe fields. They intentionally exclude:

- raw provider payloads;
- provider credentials or secret-bearing metadata;
- internal notes;
- licensing review notes;
- private feedback/training image paths.

## Canonical Identity Rule

Card names and aliases are searchable metadata, not identity.

Canonical card-variant identity is:

```text
game_code + language_code + canonical set id + collector_number + variant_code
```

The migration enforces this with `catalog.card_variants.canonical_key` and a unique constraint. The same artwork can be shared across variants through `artwork_key` without being unique.

## Delta Sync

`catalog.catalogue_versions` stores published catalogue package/version metadata.

`catalog.catalogue_change_log` stores a monotonic `change_sequence` for mobile delta sync. Public-safe mobile changes are exposed through `api.catalogue_delta_changes`.

## RLS And Exposure Summary

| Schema | Intended exposure | Grants/RLS |
| --- | --- | --- |
| `catalog` | Public-safe catalogue reads; admin/service writes | `anon` and `authenticated` get read-only grants; admin writes use `catalog.is_catalog_admin()`; service role can manage. |
| `api` | Public-safe projections | `anon` and `authenticated` get select on safe views. |
| `ingest` | Private provider/raw data | Service role only. |
| `market` | Private market identities/observations/summaries | Service role only in this migration. |
| `ml` | Private benchmark/feedback metadata | Service role only. |
| `audit` | Private operational event logs | Service role only. |
