-- Planned forward restoration of the exact pre-repair guard.
-- Not applied. Run only through the approved scoped migration/release lane.
-- Preserve the applied repair in migration history; register this as a NEW
-- forward corrective migration if rollback is required.
-- Confirm the live staged candidate hash against the release receipt first.
set local lock_timeout='5s';
set local statement_timeout='8s';
do $rollback_guard$
begin
 if md5(replace(pg_get_functiondef('api.english_exact_price_set_is_current(bigint,uuid)'::regprocedure),E'\r\n',E'\n'))
   is distinct from '80c06d896c9a1531229b9df2cd5af3b3' then
   raise exception 'unexpected candidate identity guard revision for rollback';
 end if;
 if has_function_privilege('anon','api.english_exact_price_set_is_current(bigint,uuid)','EXECUTE')
   or has_function_privilege('authenticated','api.english_exact_price_set_is_current(bigint,uuid)','EXECUTE')
   or not has_function_privilege('service_role','api.english_exact_price_set_is_current(bigint,uuid)','EXECUTE')
 then raise exception 'unexpected identity guard access contract for rollback'; end if;
end;
$rollback_guard$;
CREATE OR REPLACE FUNCTION api.english_exact_price_set_is_current(p_group bigint, p_set uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select exists(
   select 1 from market.catalogue_provider_sets mapping
   join api.catalogue_sets s on s.set_id=mapping.set_id and s.language_code='en'
   join market.catalogue_bulk_feeds f on f.feed_key='tcgplayer/3/groups'
   cross join lateral jsonb_array_elements(f.payload->'results') g
   where mapping.category_id=3 and mapping.group_id=p_group and mapping.set_id=p_set and mapping.method='exact_set_title'
     and g->>'categoryId'='3' and g->>'groupId'=p_group::text
     and regexp_replace(trim(coalesce(g->>'name','')),'^(?:(?:SM|XY|BW|DP|HGSS|PL|SWSH|SV|ME)[[:space:]]*[-:]|(?:SWSH|SV|ME)[0-9]{2}[[:space:]]*[-:])[[:space:]]*','','i')<>trim(coalesce(g->>'name',''))
     and api.catalogue_provider_name(s.english_display_name)=api.catalogue_provider_name(regexp_replace(trim(coalesce(g->>'name','')),'^(?:(?:SM|XY|BW|DP|HGSS|PL|SWSH|SV|ME)[[:space:]]*[-:]|(?:SWSH|SV|ME)[0-9]{2}[[:space:]]*[-:])[[:space:]]*','','i'))
     and (select count(distinct (other->>'groupId')::bigint) from market.catalogue_bulk_feeds ff cross join lateral jsonb_array_elements(ff.payload->'results') other
       where ff.feed_key='tcgplayer/3/groups' and other->>'categoryId'='3'
         and api.catalogue_provider_name(regexp_replace(trim(coalesce(other->>'name','')),'^(?:(?:SM|XY|BW|DP|HGSS|PL|SWSH|SV|ME)[[:space:]]*[-:]|(?:SWSH|SV|ME)[0-9]{2}[[:space:]]*[-:])[[:space:]]*','','i'))=api.catalogue_provider_name(s.english_display_name))=1
     and (select count(distinct other_set.set_id) from api.catalogue_sets other_set where other_set.language_code='en'
       and api.catalogue_provider_name(other_set.english_display_name)=api.catalogue_provider_name(s.english_display_name))=1
     and exists(select 1 from api.catalogue_cards c where c.set_id=s.set_id and c.language_code='en'
       and api.catalogue_provider_subtype(c.variant_code,c.finish_code) is not null)
 );
$function$;
revoke all on function api.english_exact_price_set_is_current(bigint,uuid) from public,anon,authenticated;
grant execute on function api.english_exact_price_set_is_current(bigint,uuid) to service_role;
