-- Reprints can share a printed collector number within one expansion.
-- Keep every existing canonical key valid and unchanged. New ambiguous
-- printings can explicitly include their immutable printing UUID instead of
-- inventing a collector number or mislabelling their finish.
alter table catalog.card_printings
  add column printing_discriminator text not null default '',
  add constraint card_printings_discriminator_check check (
    printing_discriminator = '' or printing_discriminator ~ '^[a-z0-9][a-z0-9_-]{0,99}$'
  );

-- Some environments have the earlier natural-identity uniqueness repair.
-- Retain that protection for ordinary printings; explicitly discriminated
-- reprints need their source identity included in the uniqueness contract.
do $$
begin
  if to_regclass('catalog.card_printings_active_natural_identity_uidx') is not null then
    drop index catalog.card_printings_active_natural_identity_uidx;
    create unique index card_printings_active_natural_identity_uidx
      on catalog.card_printings (game_code, language_code, set_id, collector_number)
      where deprecated_at is null and printing_discriminator = '';
  end if;
end $$;

create unique index card_printings_discriminated_identity_uidx
  on catalog.card_printings (game_code, language_code, set_id, collector_number, printing_discriminator)
  where deprecated_at is null and printing_discriminator <> '';

comment on column catalog.card_printings.printing_discriminator is
  'Optional reviewed provider printing identity for distinct cards sharing one printed collector number. Never display this as part of the collector number.';

alter table catalog.card_variants
  drop constraint card_variants_check,
  add constraint card_variants_check check (
    canonical_key = lower(game_code || ':' || language_code || ':' || set_id::text || ':' || collector_number || ':' || variant_code)
    or canonical_key = lower(game_code || ':' || language_code || ':' || set_id::text || ':' || collector_number || ':' || variant_code || ':printing:' || printing_id::text)
  );

comment on constraint card_variants_check on catalog.card_variants is
  'Legacy keys remain unchanged; repeated printed numbers may use a suffix bound to the actual immutable printing UUID. Printing/variant uniqueness and composite identity foreign key still apply.';
