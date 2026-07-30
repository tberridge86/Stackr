begin;

drop index if exists ingest.raw_source_records_import_run_identity_uidx;

do $$
begin
  if exists (
    select 1
    from ingest.raw_source_records
    group by source_id, record_type, external_id, coalesce(language_code, '')
    having count(*) > 1
  ) then
    raise exception using
      message = 'rollback_blocked_raw_source_record_history_exists',
      hint = 'Export and reconcile cross-run raw source history before restoring the legacy identity index.';
  end if;
end
$$;

create unique index if not exists raw_source_records_identity_uidx
  on ingest.raw_source_records(source_id, record_type, external_id, coalesce(language_code, ''));

commit;
