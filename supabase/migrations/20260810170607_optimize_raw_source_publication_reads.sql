create index if not exists raw_source_records_active_source_language_id_idx
  on ingest.raw_source_records(source_id, language_code, id)
  where deprecated_at is null;

comment on index ingest.raw_source_records_active_source_language_id_idx is
  'Supports bounded provider-language publication reports without scanning raw history.';
