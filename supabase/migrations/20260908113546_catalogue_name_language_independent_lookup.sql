-- Exact-name lookups must work across name languages while filtering the printing language.
-- The older (language_code, name_type, normalized_name) index cannot seek by name alone.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create index card_names_active_normalized_lookup_idx
  on catalog.card_names (normalized_name, name_type)
  include (name, printing_id, variant_id)
  where deprecated_at is null;
