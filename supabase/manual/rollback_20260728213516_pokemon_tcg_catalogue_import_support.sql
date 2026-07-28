-- Run only after stopping catalogue ingestion workers.
-- This rollback intentionally aborts instead of deleting provenance or card data.

begin;

do $$
begin
  if exists (
    select 1
    from ingest.raw_source_records
    group by source_id, record_type, external_id, coalesce(language_code, '')
    having count(*) > 1
  ) then
    raise exception
      'Rollback blocked: multiple import runs now retain the same provider identity. Archive nothing and reconcile provenance before restoring the legacy unique index.';
  end if;

  if exists (
    select 1
    from catalog.card_printings p
    join catalog.rarities r on r.id = p.rarity_id
    where r.game_code = 'pokemon'
      and r.code in ('ultra_rare', 'mega_hyper_rare')
  ) then
    raise exception
      'Rollback blocked: imported card printings reference the rarity rows. Deprecate or remap affected canonical records before removing taxonomy.';
  end if;
end
$$;

drop index if exists ingest.raw_source_records_run_identity_uidx;
drop index if exists ingest.raw_source_records_history_idx;

create unique index if not exists raw_source_records_identity_uidx
  on ingest.raw_source_records(
    source_id,
    record_type,
    external_id,
    coalesce(language_code, '')
  );

delete from catalog.rarities
where game_code = 'pokemon'
  and code in ('ultra_rare', 'mega_hyper_rare');

commit;
