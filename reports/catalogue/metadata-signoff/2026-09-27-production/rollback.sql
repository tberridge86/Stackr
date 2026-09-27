-- REVIEW BEFORE USE. Not executed. Restores metadata and removes only this run's additions.
-- Aborts if any affected canonical row has changed since promotion.
begin;
set local lock_timeout='5s';
do $rollback$
declare
 v_run uuid := 'ea50db41-86ff-5969-b534-61cf3bb155c8';
 a record; current_row jsonb; b jsonb;
begin
 if not exists(select 1 from ingest.import_runs where id=v_run and status='completed') then raise exception 'Promotion not in completed state';end if;
 for a in select * from audit.ingest_merge_decisions where import_run_id=v_run and decision_type in ('created','updated') order by entity_table,entity_id loop
  if a.entity_table='sets' then select to_jsonb(s) into current_row from catalog.sets s where id=a.entity_id for update;
  elsif a.entity_table='sealed_products' then select to_jsonb(s) into current_row from catalog.sealed_products s where id=a.entity_id for update;
  else raise exception 'Unexpected rollback table';end if;
  if current_row is distinct from a.proposed_payload->'after' then raise exception 'Concurrent change: %',a.entity_id;end if;
 end loop;
 delete from ingest.external_identifiers e using audit.ingest_merge_decisions a
 where a.import_run_id=v_run and e.source_id=a.source_id and e.raw_record_id=a.raw_record_id
 and e.external_id=a.canonical_key and (e.set_id=a.entity_id or e.sealed_product_id=a.entity_id);
 delete from catalog.sealed_products s using audit.ingest_merge_decisions a
 where a.import_run_id=v_run and a.entity_table='sealed_products' and a.decision_type='created' and s.id=a.entity_id;
 delete from catalog.sets s using audit.ingest_merge_decisions a
 where a.import_run_id=v_run and a.entity_table='sets' and a.decision_type='created' and s.id=a.entity_id;
 for a in select * from audit.ingest_merge_decisions where import_run_id=v_run and entity_table='sets' and decision_type='updated' loop
  b=a.existing_payload;
  update catalog.sets set native_name=b->>'native_name',english_display_name=b->>'english_display_name',release_date=(b->>'release_date')::date,printed_total=(b->>'printed_total')::integer,total=(b->>'total')::integer where id=a.entity_id;
 end loop;
 update ingest.raw_source_records r set validation_status='quarantined',internal_notes='Canonical promotion rolled back; signed-off original payload retained. Reconciliation required.'
 where exists(select 1 from audit.ingest_merge_decisions a where a.import_run_id=v_run and a.raw_record_id=r.id);
 update ingest.data_conflicts c set status='open',resolved_at=null,resolution_notes='Promotion rolled back; original source remains signed off. Canonical reconciliation pending.'
 where exists(select 1 from audit.ingest_merge_decisions a where a.import_run_id=v_run and a.raw_record_id=c.raw_record_id);
 update ingest.import_runs set status='rolled_back',internal_notes=coalesce(internal_notes,'')||' Metadata rollback applied; audit and source history retained.' where id=v_run;
end $rollback$;
commit;
