-- Manual rollback for Stage 14 application migration evidence tables.
-- Export audit evidence first. This rollback intentionally refuses to discard applied mappings.

do $$
begin
  if to_regclass('audit.application_identity_migrations') is not null
    and exists (
      select 1
      from audit.application_identity_migrations
      where status = 'applied'
    ) then
    raise exception 'Stage 14 rollback blocked: applied identity mappings must be rolled back before dropping the ledger.';
  end if;
end
$$;

drop table if exists audit.provider_retirement_gate_evaluations;
drop table if exists audit.recognition_shadow_comparisons;
drop table if exists audit.application_identity_migrations;
