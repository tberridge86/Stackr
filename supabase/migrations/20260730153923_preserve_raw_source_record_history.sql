-- Preserve provider revisions across import runs while keeping each run idempotent.
drop index if exists ingest.raw_source_records_identity_uidx;

create unique index if not exists raw_source_records_import_run_identity_uidx
  on ingest.raw_source_records(
    source_id,
    import_run_id,
    record_type,
    external_id,
    coalesce(language_code, '')
  )
  where import_run_id is not null;

comment on index ingest.raw_source_records_import_run_identity_uidx is
  'Prevents duplicate provider identities within one import run while retaining later raw provider revisions in subsequent runs.';
