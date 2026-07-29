-- Preserve each provider response for every import run and seed rarity terms
-- present in the Pokemon TCG API catalogue.

drop index if exists ingest.raw_source_records_identity_uidx;

create unique index raw_source_records_run_identity_uidx
  on ingest.raw_source_records(
    source_id,
    import_run_id,
    record_type,
    external_id,
    coalesce(language_code, '')
  );

create index raw_source_records_history_idx
  on ingest.raw_source_records(source_id, record_type, external_id, retrieved_at desc);

insert into catalog.rarities (game_code, code, english_label, rarity_group, sort_order)
values
  ('pokemon', 'ultra_rare', 'Ultra Rare', 'special', 65),
  ('pokemon', 'mega_hyper_rare', 'Mega Hyper Rare', 'secret', 75)
on conflict (game_code, code) do update set
  english_label = excluded.english_label,
  rarity_group = excluded.rarity_group,
  sort_order = excluded.sort_order,
  deprecated_at = null,
  updated_at = now();

comment on index ingest.raw_source_records_run_identity_uidx is
  'Retains one copy of each provider record for every import run while preventing duplicate processing inside a run.';
