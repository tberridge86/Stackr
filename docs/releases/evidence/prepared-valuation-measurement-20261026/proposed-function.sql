-- REVIEW PROPOSAL ONLY. Not applied and not registered as a migration.
-- Plan-backed single payload evaluation; no index, grant, ownership or hash change.
begin;
create or replace function api.collection_valuation_inputs(p_owner uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
 with b as materialized (select * from public.binders where user_id=p_owner),
 o as materialized (select * from public.user_card_variants where user_id=p_owner and quantity>0),
 bc as materialized (select c.* from public.binder_cards c join b on b.id=c.binder_id),
 -- Prevent repeated JSON aggregation without materializing a second large tuple.
 -- OFFSET 0 is a planner barrier: retain the plan regression on PostgreSQL upgrades.
 payload as (select jsonb_build_object(
   'ownedRows',coalesce((select jsonb_agg(to_jsonb(o) order by id) from o),'[]'::jsonb),
   'binders',coalesce((select jsonb_agg(to_jsonb(b) order by id) from b),'[]'::jsonb),
   'binderCards',coalesce((select jsonb_agg(to_jsonb(bc) order by id) from bc),'[]'::jsonb)) body offset 0)
 select body || jsonb_build_object('collectionRevision',md5(body::text)) from payload;
$$;
commit;
