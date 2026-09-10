-- Exact compensating repair; refuses to overwrite any later variant edits.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $rollback$
declare reverted integer; expected integer;
begin
select count(*) into expected from audit.catalogue_events
where request_id='captured-artwork-restore-20260910-34794a13e68b' and event_type='captured_same_printing_artwork_restored';
if expected<1 or expected>5271 then raise exception 'Unexpected recovery receipt count: %',expected; end if;
with original as materialized (
 select entity_id,event_payload from audit.catalogue_events
 where request_id='captured-artwork-restore-20260910-34794a13e68b' and event_type='captured_same_printing_artwork_restored'
), reverted as (
 update catalog.card_variants v
 set native_image_status=o.event_payload->>'beforeNativeImageStatus',same_artwork_as_variant_id=null
 from original o where v.id=o.entity_id and v.native_image_status='same_artwork_reference'
 and v.same_artwork_as_variant_id=(o.event_payload->>'targetVariantId')::uuid
 and v.updated_at=(o.event_payload->>'afterUpdatedAt')::timestamptz
 returning v.id
), logged as (
 insert into catalog.catalogue_change_log(entity_schema,entity_table,entity_id,change_type,mobile_syncable,public_change_summary)
 select 'catalog','card_variants',id,'update',true,jsonb_build_object('recoveryRolledBack','captured-artwork-restore-20260910-34794a13e68b')
 from reverted returning entity_id
)
select count(*) into reverted from logged;
if reverted<>expected then raise exception 'Rollback refused: later edits or missing rows (% of %)',reverted,expected; end if;
insert into audit.catalogue_events(request_id,actor_role,event_type,entity_schema,entity_table,entity_id,event_payload)
select 'captured-artwork-restore-20260910-34794a13e68b:rollback','catalogue_repair_cli','captured_same_printing_artwork_rollback','catalog','card_variants',
entity_id,jsonb_build_object('originalRequestId','captured-artwork-restore-20260910-34794a13e68b')
from audit.catalogue_events where request_id='captured-artwork-restore-20260910-34794a13e68b' and event_type='captured_same_printing_artwork_restored';
end $rollback$;
commit;
