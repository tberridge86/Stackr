-- Coverage is a report over the latest published physical catalogue identity.
-- Avoid api.catalogue_cards here: that rich presentation view can expand the
-- report far beyond the current publication membership.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function api.catalogue_bulk_price_coverage(p_run uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $function$
 with current_versions as materialized (
   select distinct on (cv.language_code) cv.id,cv.language_code
   from catalog.catalogue_versions cv where cv.status='published' and cv.deprecated_at is null
   order by cv.language_code,cv.published_at desc nulls last,cv.created_at desc,cv.id desc
 ), published as materialized (
   select cvv.variant_id,cvv.printing_id,cvv.set_id,cvv.language_code,cv.id catalogue_version_id,
     v.variant_code,v.finish_code
   from current_versions cv
   join catalog.catalogue_version_variants cvv on cvv.catalogue_version_id=cv.id and cvv.language_code=cv.language_code
   join catalog.card_variants v on v.id=cvv.variant_id and v.deprecated_at is null and v.language_code=cvv.language_code and v.printing_id=cvv.printing_id
   join catalog.card_printings p on p.id=cvv.printing_id and p.deprecated_at is null and p.set_id=cvv.set_id and p.language_code=cvv.language_code
   join catalog.sets s on s.id=p.set_id and s.deprecated_at is null and s.language_code=cvv.language_code
   join catalog.languages l on l.code=cvv.language_code
 ), typed as materialized (
   select p.*,api.catalogue_provider_subtype(p.variant_code,p.finish_code) subtype from published p
 ), card_counts as (
   select c.language_code,c.set_id,count(*) total,
     count(*) filter(where c.language_code in ('en','ja') and c.subtype is not null) supported,
     count(*) filter(where m.variant_id is not null and m.printing_id=c.printing_id and m.set_id=c.set_id and m.language_code=c.language_code and m.subtype=c.subtype) mapped,
     count(*) filter(where c.language_code in ('en','ja') and c.subtype is not null and (m.variant_id is null or m.printing_id<>c.printing_id or m.set_id<>c.set_id or m.language_code<>c.language_code or m.subtype<>c.subtype)) unmapped,
     -- priced reports any current stored general estimate (including a
     -- Cardmarket blended estimate), not exact-provider eligibility.
     count(*) filter(where g.variant_id is not null and g.catalogue_version_id=c.catalogue_version_id) priced,
     count(*) filter(where g.variant_id is not null and g.catalogue_version_id=c.catalogue_version_id and g.stale_after<=now()) stale,
     count(*) filter(where o.reason='no_provider_quote' and o.catalogue_version_id=c.catalogue_version_id) missing_quote,
     count(*) filter(where o.reason='provider_backoff' and o.catalogue_version_id=c.catalogue_version_id) retry,
     count(*) filter(where c.language_code not in ('en','ja') or c.subtype is null) unsupported
   from typed c
   left join market.catalogue_provider_cards m on m.variant_id=c.variant_id
   left join market.catalogue_general_prices g on g.variant_id=c.variant_id and g.printing_id=c.printing_id and g.language_code=c.language_code and g.set_id=c.set_id
   left join market.catalogue_price_outcomes o on o.variant_id=c.variant_id
   group by c.language_code,c.set_id
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
