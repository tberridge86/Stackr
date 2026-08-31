-- Keep deterministic ingestion retries from sequentially scanning the full
-- conflict ledger for every quarantined provider record.
create index if not exists data_conflicts_ingest_dedupe_idx
  on ingest.data_conflicts (
    source_id,
    import_run_id,
    raw_record_id,
    conflict_type,
    canonical_key
  );
