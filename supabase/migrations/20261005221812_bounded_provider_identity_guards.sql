-- Bound the exact English provider-title guard to identity relations.
-- Preserve all published versions (not only latest), provider-title collisions,
-- canonical-title collisions, supported finish checks and service-only access.
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Refuse to overwrite a separately changed identity contract.
do $guard$
begin
 if md5(replace(pg_get_functiondef('api.english_exact_price_set_is_current(bigint,uuid)'::regprocedure),E'\r\n',E'\n'))
   is distinct from 'ca77044f82345cc18fdc7f2be1cca8f6' then
   raise exception 'unexpected English exact-title identity guard revision';
 end if;
end;
$guard$;

create or replace function api.english_exact_price_set_is_current(p_group bigint,p_set uuid)
returns boolean language sql stable security invoker set search_path='' as $function$
 with published_sets as materialized (
   select s.id as set_id,s.english_display_name
   from catalog.sets s join catalog.languages l on l.code=s.language_code
   where s.language_code='en' and s.deprecated_at is null
     and exists(select 1 from catalog.catalogue_version_sets cvs
       join catalog.catalogue_versions cv on cv.id=cvs.catalogue_version_id
       where cvs.set_id=s.id and cv.status='published' and cv.deprecated_at is null)
 ), provider_groups as materialized (
   select g->>'groupId' as group_id,trim(coalesce(g->>'name','')) as raw_title,
     regexp_replace(trim(coalesce(g->>'name','')),'^(?:(?:SM|XY|BW|DP|HGSS|PL|SWSH|SV|ME)[[:space:]]*[-:]|(?:SWSH|SV|ME)[0-9]{2}[[:space:]]*[-:])[[:space:]]*','','i') as title
   from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') g
   where f.feed_key='tcgplayer/3/groups' and g->>'categoryId'='3'
 )
 select exists(
   select 1 from market.catalogue_provider_sets mapping
   join published_sets s on s.set_id=mapping.set_id
   join provider_groups g on g.group_id=p_group::text
   where mapping.category_id=3 and mapping.group_id=p_group and mapping.set_id=p_set and mapping.method='exact_set_title'
     and g.title<>g.raw_title
     and api.catalogue_provider_name(s.english_display_name)=api.catalogue_provider_name(g.title)
     and (select count(distinct other.group_id::bigint) from provider_groups other
       where api.catalogue_provider_name(other.title)=api.catalogue_provider_name(s.english_display_name))=1
     and (select count(distinct other.set_id) from published_sets other
       where api.catalogue_provider_name(other.english_display_name)=api.catalogue_provider_name(s.english_display_name))=1
     and exists(
       select 1 from catalog.card_printings p
       join catalog.card_variants v on v.printing_id=p.id and v.deprecated_at is null
       join catalog.catalogue_version_variants cvv on cvv.variant_id=v.id
       join catalog.catalogue_versions cv on cv.id=cvv.catalogue_version_id
       join catalog.languages l on l.code=v.language_code
       where p.set_id=s.set_id and p.deprecated_at is null and v.language_code='en'
         and cv.status='published' and cv.deprecated_at is null
         and api.catalogue_provider_subtype(v.variant_code,v.finish_code) is not null
     )
 );
$function$;
revoke all on function api.english_exact_price_set_is_current(bigint,uuid) from public,anon,authenticated;
grant execute on function api.english_exact_price_set_is_current(bigint,uuid) to service_role;
