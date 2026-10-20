-- Keep the bounded physical report hashable without materializing fields that
-- the per-card aggregate never reads.  The language table is tiny, so making
-- it hashable also avoids one primary-key probe for every published variant.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function api.catalogue_bulk_price_coverage(p_run uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $function$
 with current_versions as materialized (
   select distinct on (cv.language_code) cv.id,cv.language_code
   from catalog.catalogue_versions cv
   where cv.status='published' and cv.deprecated_at is null
   order by cv.language_code,cv.published_at desc nulls last,cv.created_at desc,cv.id desc
 ), current_cvv as materialized (
   select cvv.variant_id,cvv.printing_id,cvv.set_id,cvv.language_code,cv.id catalogue_version_id
   from current_versions cv
   join catalog.catalogue_version_variants cvv
     on cvv.catalogue_version_id=cv.id and cvv.language_code=cv.language_code
 ), physical_variants as materialized (
   select v.id,v.printing_id,v.language_code,v.variant_code,v.finish_code
   from catalog.card_variants v
   where v.deprecated_at is null
 ), physical_printings as materialized (
   select p.id,p.set_id,p.language_code
   from catalog.card_printings p
   where p.deprecated_at is null
 ), physical_sets as materialized (
   select s.id,s.language_code
   from catalog.sets s
   where s.deprecated_at is null
 ), physical_languages as materialized (
   select l.code from catalog.languages l
 ), published as materialized (
   select cvv.variant_id,cvv.printing_id,cvv.set_id,cvv.language_code,cvv.catalogue_version_id,
     v.variant_code,v.finish_code
   from current_cvv cvv
   join physical_variants v
     on v.id=cvv.variant_id and v.language_code=cvv.language_code and v.printing_id=cvv.printing_id
   join physical_printings p
     on p.id=cvv.printing_id and p.set_id=cvv.set_id and p.language_code=cvv.language_code
   join physical_sets s
     on s.id=p.set_id and s.language_code=cvv.language_code
   join physical_languages l on l.code=cvv.language_code
 ), typed as materialized (
   select p.variant_id,p.printing_id,p.set_id,p.language_code,p.catalogue_version_id,
     api.catalogue_provider_subtype(p.variant_code,p.finish_code) subtype
   from published p
 ), market_maps as materialized (
   select m.variant_id,m.printing_id,m.set_id,m.language_code,m.subtype
   from market.catalogue_provider_cards m
 ), general_prices as materialized (
   select g.variant_id,g.printing_id,g.set_id,g.language_code,g.catalogue_version_id,g.stale_after
   from market.catalogue_general_prices g
 ), price_outcomes as materialized (
   select o.variant_id,o.catalogue_version_id,o.reason
   from market.catalogue_price_outcomes o
 ), evaluated as materialized (
   select c.language_code,c.set_id,
     c.language_code in ('en','ja') and c.subtype is not null supported,
     m.variant_id is not null and m.printing_id=c.printing_id and m.set_id=c.set_id and m.language_code=c.language_code and m.subtype=c.subtype mapped,
     c.language_code in ('en','ja') and c.subtype is not null and (m.variant_id is null or m.printing_id<>c.printing_id or m.set_id<>c.set_id or m.language_code<>c.language_code or m.subtype<>c.subtype) unmapped,
     g.variant_id is not null and g.catalogue_version_id=c.catalogue_version_id priced,
     g.variant_id is not null and g.catalogue_version_id=c.catalogue_version_id and g.stale_after<=now() stale,
     o.reason='no_provider_quote' and o.catalogue_version_id=c.catalogue_version_id missing_quote,
     o.reason='provider_backoff' and o.catalogue_version_id=c.catalogue_version_id retry,
     c.language_code not in ('en','ja') or c.subtype is null unsupported
   from typed c
   left join market_maps m on m.variant_id=c.variant_id
   left join general_prices g on g.variant_id=c.variant_id and g.printing_id=c.printing_id and g.language_code=c.language_code and g.set_id=c.set_id
   left join price_outcomes o on o.variant_id=c.variant_id
 ), card_counts as (
   select e.language_code,e.set_id,count(*) total,
     count(*) filter(where e.supported) supported,
     count(*) filter(where e.mapped) mapped,
     count(*) filter(where e.unmapped) unmapped,
     count(*) filter(where e.priced) priced,
     count(*) filter(where e.stale) stale,
     count(*) filter(where e.missing_quote) missing_quote,
     count(*) filter(where e.retry) retry,
     count(*) filter(where e.unsupported) unsupported
   from evaluated e
   group by e.language_code,e.set_id
 ), run_groups as (
   select category_id,status,count(*) total from market.catalogue_bulk_groups
   where run_id=coalesce(p_run,(select id from market.catalogue_bulk_runs order by dataset_at desc limit 1)) group by category_id,status
 ) select jsonb_build_object('cards',coalesce((select jsonb_agg(to_jsonb(card_counts) order by language_code,set_id) from card_counts),'[]'),
   'groups',coalesce((select jsonb_agg(to_jsonb(run_groups) order by category_id,status) from run_groups),'[]'),
   'openRepairs',(select count(*) from market.catalogue_price_repairs where status='open'),
   'runStatus',case when not exists(select 1 from run_groups) then 'not_started'
     when exists(select 1 from run_groups where status in ('pending','running','failed')) then 'partial'
     when exists(select 1 from run_groups where status='unmapped') or exists(select 1 from card_counts where unmapped>0) or exists(select 1 from market.catalogue_price_repairs where status='open') then 'needs_mapping'
     when exists(select 1 from run_groups) then 'complete' else 'not_started' end);
$function$;
revoke all on function api.catalogue_bulk_price_coverage(uuid) from public,anon,authenticated;
grant execute on function api.catalogue_bulk_price_coverage(uuid) to service_role;
