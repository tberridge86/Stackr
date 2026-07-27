# Canonical Catalogue Data Dictionary

Audit/stage date: 2026-07-27
Migration: `supabase/migrations/20260727212256_canonical_stackr_catalogue_database.sql`
Scope: additive local/repository migration only. No production Supabase migration was pushed.

## Shared Conventions

| Convention | Meaning |
| --- | --- |
| `created_at` | Row creation timestamp. |
| `updated_at` | Row update timestamp maintained by `audit.set_updated_at()`. |
| `source_updated_at` | Timestamp from the provider/source when available. |
| `deprecated_at`, `deprecated_reason` | Soft deprecation without deleting historical identifiers. |
| `corrected_by_*` | Points to the replacement/corrected canonical row. |
| `canonical_key` | Deterministic Stackr identity key, never card-name based. |
| `raw_payload` | Private raw provider JSON; only in private schemas. |
| `internal_notes` | Private operational/review notes; excluded from public projections. |

## `catalog` Schema

Canonical public-safe catalogue data. Readable by `anon` and `authenticated` where active/not deprecated. Writable by catalogue admins and service role only.

### `catalog.games`

Supported trading-card games.

Key columns:

- `code`: text primary key, for example `pokemon`.
- `display_name`: public display name.
- `publisher`: optional publisher label.
- `active`, `deprecated_at`, `deprecated_reason`: lifecycle controls.

Seeded rows:

- `pokemon`

### `catalog.languages`

Supported catalogue languages.

Key columns:

- `code`: primary key used across the schema.
- `bcp47_code`: BCP 47 language tag.
- `english_name`: English language label.
- `native_name`: native label.
- `script_code`: script hint.
- `sort_order`: deterministic display order.

Seeded rows:

| code | bcp47 | English | Native |
| --- | --- | --- | --- |
| `en` | `en` | English | English |
| `ja` | `ja` | Japanese | 日本語 |
| `zh-Hans` | `zh-Hans` | Simplified Chinese | 简体中文 |
| `zh-Hant` | `zh-Hant` | Traditional Chinese | 繁體中文 |
| `ko` | `ko` | Korean | 한국어 |

### `catalog.series`

Language-scoped game series.

Key columns:

- `id`: UUID primary key.
- `game_code`: FK to `catalog.games`.
- `language_code`: FK to `catalog.languages`.
- `native_name`, `english_display_name`: localized/display names.
- `series_code`: provider/collector-facing code where available.
- `release_date`, `end_date`, `display_order`: ordering metadata.
- `corrected_by_series_id`: soft correction pointer.

### `catalog.sets`

Canonical set records.

Key columns:

- `id`: UUID canonical set ID.
- `game_code`, `language_code`, `series_id`: identity scope.
- `set_code`: non-unique set code. It must be interpreted with game, language and set ID.
- `provider_set_code`: provider-specific set code when different.
- `native_name`, `english_display_name`: required native name plus optional English display name.
- `printed_total`, `total`: set sizes.
- `region_code`: regional hint.
- `corrected_by_set_id`: soft correction pointer.

Indexes:

- `(game_code, language_code, set_code, release_date desc)` for set lookup.
- Full-text index over native name, English display name and set code.
- Trigram indexes over native and English display names.

### `catalog.rarities`

Game-scoped rarity taxonomy.

Key columns:

- `game_code`: FK to game.
- `code`: machine code, unique per game.
- `english_label`, `native_label`: display labels.
- `rarity_group`, `sort_order`: grouping/order.

Seeded Pokemon examples include common, uncommon, rare, double rare, illustration rare, special illustration rare, secret rare and promo.

### `catalog.finishes`

Finish taxonomy.

Key columns:

- `code`: unique machine code.
- `english_label`: display label.
- `finish_group`: `standard`, `foil`, `parallel`, `edition`, `stamp`, `regional` or `other`.
- `description`, `sort_order`: documentation/order.

Seeded finishes include normal, holo, reverse holo, first edition, unlimited, promo, stamped, Poke Ball, Master Ball and other regional variants.

### `catalog.variant_taxonomy`

Variant taxonomy used by raw cards, graded identities and sealed products.

Key columns:

- `code`: primary key.
- `english_label`: display label.
- `variant_group`: `base`, `foil`, `edition`, `promo`, `stamp`, `regional`, `sealed`, `graded` or `other`.
- `finish_code`: optional FK to `catalog.finishes`.

Required seeded variants:

- `normal`
- `holo`
- `reverse_holo`
- `first_edition`
- `unlimited`
- `promo`
- `stamped`
- `poke_ball`
- `master_ball`
- `regional_other`
- `sealed_standard`
- `graded_standard`

### `catalog.card_concepts`

Cross-printing card concept, separate from printings and variants.

Key columns:

- `id`: UUID primary key.
- `game_code`: FK to game.
- `concept_key`: game-scoped stable concept key.
- `default_english_name`: optional public display name.
- `pokemon_dex_ids`: optional Pokemon dex references.
- `corrected_by_concept_id`: soft correction pointer.

The concept is not a unique physical card identity.

### `catalog.card_printings`

Printed card in a set/language, before variant/finish split.

Key columns:

- `id`: UUID primary key.
- `game_code`, `set_id`, `language_code`: identity scope.
- `card_concept_id`: optional FK to concept.
- `collector_number`: opaque text, preserving letters, slashes, leading zeroes and regional characters.
- `collector_number_prefix`, `collector_number_sort`, `collector_number_suffix`, `collector_number_sort_key`: sortable components.
- `native_name`, `english_display_name`: names.
- `rarity_id`: FK to rarity.
- `supertype`, `subtypes`, `artist`: card metadata.
- `corrected_by_printing_id`: soft correction pointer.

Important constraint:

- Composite uniqueness includes `(id, game_code, language_code, set_id, collector_number)` so `catalog.card_variants` can enforce identity without using card name.

### `catalog.card_variants`

Canonical card variant identity.

Key columns:

- `id`: UUID primary key.
- `printing_id`: FK to printing.
- `game_code`, `set_id`, `language_code`, `collector_number`: copied identity scope from printing for deterministic key enforcement.
- `variant_code`: FK to variant taxonomy.
- `finish_code`: FK to finish taxonomy.
- `canonical_key`: deterministic unique key.
- `artwork_key`: non-unique artwork grouping key.
- `image_signature`: optional image fingerprint/signature.
- `is_default`: default variant marker for a printing.
- `source_confidence`: source confidence from 0 to 1.
- `corrected_by_variant_id`: soft correction pointer.

Canonical key format:

```text
lower(game_code + ':' + language_code + ':' + set_id + ':' + collector_number + ':' + variant_code)
```

Card names are not part of identity. `artwork_key` is intentionally not unique so normal, reverse, Poke Ball, Master Ball and other variants can share artwork.

### `catalog.card_names`

Native names, English display names, translations and aliases.

Key columns:

- `card_concept_id`, `printing_id`, `variant_id`: at least one target is required.
- `language_code`: language of the name/alias.
- `name_type`: `native`, `english_display`, `translated`, `alias` or `search_normalized`.
- `name`: original display/search value.
- `normalized_name`: normalized lookup value.
- `source_confidence`: source confidence from 0 to 1.

Indexes:

- `(language_code, name_type, normalized_name)` lookup.
- Full-text index over name and normalized name.
- Trigram indexes over name and normalized name.

### `catalog.assets`

Public-safe asset metadata.

Key columns:

- `asset_type`: card image, set symbol, set logo, series logo, sealed product image or other.
- `set_id`, `printing_id`, `variant_id`: at least one asset target is required.
- `source_id`: optional FK to `ingest.sources`.
- `url` or `storage_path`: at least one location is required.
- `mime_type`, `width`, `height`, `sha256`: file metadata.
- `rights_status`: approved, under review, restricted, denied or unknown.
- `publicly_servable`: only approved/public assets should be exposed.
- `attribution_text`: public attribution text.
- `licensing_review_notes`: private review notes, excluded from API views.

### `catalog.sealed_products`

Canonical sealed product identity before variant split.

Key columns:

- `game_code`, `language_code`, `set_id`: scope.
- `product_type`: booster box, booster pack, elite trainer box, starter deck, collection box, tin, bundle, sealed case or other.
- `native_name`, `english_display_name`: names.
- `product_code`, `barcode`, `release_date`: product metadata.
- `corrected_by_product_id`: soft correction pointer.

### `catalog.sealed_product_variants`

Variant records for sealed products.

Key columns:

- `product_id`: FK to sealed product.
- `variant_code`: FK to variant taxonomy.
- `native_name`, `english_display_name`: optional variant labels.
- `quantity`: product quantity where meaningful.
- `source_confidence`: source confidence from 0 to 1.

### `catalog.catalogue_versions`

Catalogue package/version metadata for mobile sync.

Key columns:

- `version_key`: unique semantic or generated version key.
- `status`: draft, published, deprecated or rolled back.
- `published_at`: publication timestamp.
- `superseded_by_version_id`: lifecycle pointer.
- `min_change_sequence`, `max_change_sequence`: delta sync boundaries.

### `catalog.catalogue_change_log`

Monotonic change sequence for mobile delta sync.

Key columns:

- `change_sequence`: `bigserial` primary key.
- `catalogue_version_id`: optional version group.
- `entity_schema`, `entity_table`, `entity_id`, `entity_key`: changed object.
- `change_type`: insert, update, deprecate, correct or delete marker.
- `mobile_syncable`: whether the public API can expose the change.
- `public_change_summary`: safe delta payload.

## `ingest` Schema

Private provider ingestion state. Service-role only.

### `ingest.sources`

Provider/source registry.

Key columns:

- `code`, `display_name`, `source_type`: provider identity.
- `base_url`, `terms_url`, `robots_policy`: source governance.
- `licence_status`: approved, under review, restricted, denied or unknown.
- `attribution_required`, `rate_limit_config`, `active`: ingestion controls.
- `internal_notes`: private notes.

Seeded sources:

- `stackr_manual`
- `tcgdex`
- `pokemon_tcg_api`
- `tcgcsv`
- `ebay`

### `ingest.import_runs`

Idempotent import execution records.

Key columns:

- `source_id`, `run_key`: unique import identity.
- `import_type`: full, delta, backfill, repair or manual.
- `status`: started, running, completed, failed, cancelled or rolled back.
- count columns: requested, retrieved, inserted, updated, skipped, conflicted.
- `request_id`, `metadata`, `internal_notes`: operational metadata.

### `ingest.raw_source_records`

Private raw provider record store.

Key columns:

- `source_id`, `import_run_id`: provenance.
- `record_type`: game, language, series, set, card, printing, variant, rarity, finish, asset, sealed product, price or other.
- `external_id`: raw provider ID.
- `language_code`: optional language scope.
- `source_url`, `retrieved_at`, `source_updated_at`: source traceability.
- `licence_status`, `attribution_text`: rights metadata.
- `payload_hash`, `raw_payload`: private raw payload capture.

Active uniqueness:

- Unique index on source, record type, external ID and language.

### `ingest.external_identifiers`

Provider ID mappings to canonical entities.

Key columns:

- `source_id`, `raw_record_id`, `source_entity_type`, `external_id`, `external_uri`.
- exactly one target FK among series, set, concept, printing, variant, sealed product, sealed product variant or asset.
- `confidence`: mapping confidence from 0 to 1.
- `is_current`, `deprecated_at`: preserves corrected/discontinued IDs without deleting history.

Active uniqueness:

- Current, non-deprecated external IDs are unique by source, source entity type, external ID and language.

### `ingest.data_conflicts`

Private data-quality review queue.

Key columns:

- `conflict_type`: duplicate external ID, identity collision, name conflict, variant conflict, set code conflict, licence conflict, schema conflict or other.
- `severity`: low, medium, high or critical.
- `canonical_key`, `entity_schema`, `entity_table`, `entity_id`: affected canonical object.
- `proposed_payload`, `existing_payload`: private comparison payloads.
- `status`, `resolution_notes`, `resolved_by`, `resolved_at`: review workflow.

## `market` Schema

Private market/pricing data. Service-role only in this migration.

### `market.market_identities`

Pricing identity layer that keeps raw, graded and sealed products separate.

Key columns:

- `identity_key`: unique market identity.
- `product_kind`: `raw_card`, `graded_card` or `sealed_product`.
- `variant_id`: required for raw/graded cards.
- `sealed_product_variant_id`: required for sealed products.
- `condition_code`, `grader`, `grade`, `certification_number`: graded/raw context.
- `language_code`: optional language scope.

### `market.price_observations`

Private provider price evidence.

Key columns:

- `market_identity_id`, `source_id`, `raw_record_id`: provenance.
- `observation_hash`: unique observation ID.
- `source_listing_id`, `source_type`: provider evidence type.
- `observed_at`, `fetched_at`, `source_updated_at`: timing.
- original and normalized price fields.
- `confidence`, `include_in_estimate`, `exclusion_reason`: scoring controls.
- `raw_payload`, `internal_notes`: private evidence.

### `market.price_summaries`

Private calculated summaries, intended to be wrapped by Stackr API before any public exposure.

Key columns:

- `market_identity_id`, `summary_key`: identity.
- market/low/high values and confidence fields.
- observation, sold and active listing counts.
- `calculated_at`, `stale_after`: freshness.
- `source_breakdown`, `public_notes`, `internal_notes`.

## `ml` Schema

Private recognition and benchmark metadata. Service-role only.

### `ml.recognition_feedback_items`

Recognition feedback dataset metadata.

Key columns:

- `created_by`: optional user.
- `variant_id`, `predicted_variant_id`: reviewed/expected identity links.
- `feedback_action`, `reviewed_status`: workflow.
- `capture_metadata`, `ocr_evidence`: private scanner evidence summaries.
- `model_version`, `catalogue_version_id`: model/catalogue context.
- `physical_card_session_id`: leakage-control grouping.
- `image_storage_path`, `image_checksum_sha256`, `consent_state`: consented image controls.

### `ml.benchmark_cases`

Recognition benchmark cases.

Key columns:

- `variant_id`, `language_code`: target identity.
- `case_key`: unique case key.
- `capture_condition`: capture metadata label.
- `expected_identity_key`: canonical key under test.
- `dataset_split`: train, validation, protected test or holdout.

No vector columns are created. Embedding/vector dimensions must be selected by the model benchmark.

## `audit` Schema

Private operational events. Service-role only.

### `audit.catalogue_events`

Structured catalogue/API events.

Key columns:

- `request_id`: request correlation ID.
- `actor_user_id`, `actor_role`: actor context.
- `event_type`: event label.
- `entity_schema`, `entity_table`, `entity_id`, `canonical_key`: affected entity.
- `event_payload`, `internal_notes`: private event metadata.

## `api` Schema

Public-safe projections.

### `api.catalogue_cards`

Read model for mobile/API catalogue card results.

Includes:

- variant ID and canonical key.
- game, language and set IDs.
- set names/codes.
- collector number and sortable collector-number components.
- native and English card names.
- rarity, variant and finish labels.
- artwork grouping key.
- safe timestamps.

Excludes:

- raw payloads;
- provider secrets;
- internal notes;
- licensing-review notes.

### `api.catalogue_sets`

Read model for set search/list views.

Includes game/language, series, set code, native and English names, release date, totals and safe timestamps.

### `api.catalogue_card_names`

Read model for native names, translated names and aliases.

### `api.catalogue_delta_changes`

Read model for mobile delta sync from `catalog.catalogue_change_log`.

## RLS And Grant Summary

| Schema | `anon` | `authenticated` | `service_role` |
| --- | --- | --- | --- |
| `catalog` | select active/public-safe rows | select active rows; admin writes through `catalog.is_catalog_admin()` | full manage |
| `api` | select safe views | select safe views | select safe views |
| `ingest` | no grants | no grants | full manage |
| `market` | no grants | no grants | full manage |
| `ml` | no grants | no grants | full manage |
| `audit` | no grants | no grants | full manage |

## Migration Tests

`npm run test:catalogue-schema` validates:

- all required schemas and entities exist in the migration;
- supported languages are seeded;
- required variant taxonomy is seeded;
- duplicate collector numbers are scoped by variant and set;
- conflicting active external IDs are caught;
- translated aliases do not define identity;
- shared-artwork variants remain separate;
- public API projections exclude raw/private fields;
- no vector columns are added.
