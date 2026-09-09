-- Search latency repair for the published catalogue API.
-- These indexes match the identity-first access paths used by /v1/search.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists catalogue_version_external_identifiers_external_lookup_idx
  on catalog.catalogue_version_external_identifiers (external_id, language_code, catalogue_version_id)
  include (source_entity_type, set_id, printing_id, variant_id, confidence);

create index if not exists card_printings_collector_lookup_idx
  on catalog.card_printings (collector_number, language_code, set_id, id)
  where deprecated_at is null;

create index if not exists catalogue_version_variants_variant_lookup_idx
  on catalog.catalogue_version_variants (variant_id, catalogue_version_id)
  include (language_code, set_id, printing_id);

create index if not exists catalogue_version_printings_printing_lookup_idx
  on catalog.catalogue_version_printings (printing_id, catalogue_version_id)
  include (language_code, set_id);
