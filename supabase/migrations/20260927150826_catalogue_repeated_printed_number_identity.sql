-- Reprints can share a printed collector number within one expansion.
-- Keep every existing canonical key valid and unchanged. New ambiguous
-- printings can explicitly include their immutable printing UUID instead of
-- inventing a collector number or mislabelling their finish.
alter table catalog.card_variants
  drop constraint card_variants_check,
  add constraint card_variants_check check (
    canonical_key = lower(game_code || ':' || language_code || ':' || set_id::text || ':' || collector_number || ':' || variant_code)
    or canonical_key = lower(game_code || ':' || language_code || ':' || set_id::text || ':' || collector_number || ':' || variant_code || ':printing:' || printing_id::text)
  );

comment on constraint card_variants_check on catalog.card_variants is
  'Legacy keys remain unchanged; repeated printed numbers may use a suffix bound to the actual immutable printing UUID. Printing/variant uniqueness and composite identity foreign key still apply.';
