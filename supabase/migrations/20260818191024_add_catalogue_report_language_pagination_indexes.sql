create index if not exists raw_source_records_active_language_id_idx
  on ingest.raw_source_records (language_code, id)
  where deprecated_at is null;

create index if not exists external_identifiers_language_id_idx
  on ingest.external_identifiers (language_code, id);
