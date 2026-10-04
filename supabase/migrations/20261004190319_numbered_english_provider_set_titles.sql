-- TCGCSV uses finite numbered expansion labels such as "SV02: Paldea
-- Evolved". Keep this as a title-only English rule: every downstream
-- uniqueness/current-publication guard remains exactly the existing contract.
set local lock_timeout='5s';
set local statement_timeout='60s';

create or replace function api.resolve_catalogue_bulk_set(p_category integer,p_group bigint,p_language text,p_name text,p_abbreviation text) returns jsonb
language plpgsql security invoker set search_path='' as $function$
declare raw_title text; suffix text; ids uuid[]; provider_count integer; exact_group boolean; previous_method text; previous_set uuid;
begin
 if p_category=3 and p_language='en' and p_group>0 then
   select method,set_id into previous_method,previous_set from market.catalogue_provider_sets where category_id=3 and group_id=p_group;
   raw_title=trim(coalesce(p_name,''));
   -- This is intentionally a finite provider-label grammar.  The separator is
   -- mandatory; arbitrary leading words are never removed.
   suffix=regexp_replace(raw_title,'^(?:(?:SM|XY|BW|DP|HGSS|PL|SWSH|SV|ME)[[:space:]]*[-:]|(?:SWSH|SV|ME)[0-9]{2}[[:space:]]*[-:])[[:space:]]*','','i');
   if suffix<>raw_title and length(api.catalogue_provider_name(suffix))>0 then
     select count(distinct (g->>'groupId')::bigint),bool_or(g->>'groupId'=p_group::text)
       into provider_count,exact_group
     from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') g
     where f.feed_key='tcgplayer/3/groups' and g->>'categoryId'='3'
       and api.catalogue_provider_name(regexp_replace(trim(coalesce(g->>'name','')),'^(?:(?:SM|XY|BW|DP|HGSS|PL|SWSH|SV|ME)[[:space:]]*[-:]|(?:SWSH|SV|ME)[0-9]{2}[[:space:]]*[-:])[[:space:]]*','','i'))=api.catalogue_provider_name(suffix);
     select array_agg(distinct s.set_id) into ids
     from api.catalogue_sets s
     where s.language_code='en' and api.catalogue_provider_name(s.english_display_name)=api.catalogue_provider_name(suffix)
       and exists(select 1 from api.catalogue_cards c where c.set_id=s.set_id and c.language_code='en'
         and api.catalogue_provider_subtype(c.variant_code,c.finish_code) is not null);
     if (previous_method is null or previous_method='exact_set_title') and provider_count=1 and exact_group is true
       and coalesce(array_length(ids,1),0)=1 and (previous_set is null or previous_set=ids[1]) then
       insert into market.catalogue_provider_sets values(3,p_group,'en',ids[1],'exact_set_title',
         'Unique exact provider title suffix after controlled expansion label',now())
       on conflict(category_id,group_id) do update set set_id=excluded.set_id,method=excluded.method,note=excluded.note,verified_at=now()
         where market.catalogue_provider_sets.method='exact_set_title';
       insert into market.catalogue_provider_set_members values(3,p_group,ids[1],'en','exact_set_title',
         'Unique exact provider title suffix after controlled expansion label',now())
       on conflict(category_id,group_id,set_id) do update set verified_at=now();
       update market.catalogue_price_repairs set status='resolved',last_seen_at=now()
         where repair_key='set:3:'||p_group or repair_key='catalogue-set:'||ids[1];
       return jsonb_build_object('status','mapped','setId',ids[1],'source','exact_set_title');
     end if;
   end if;
   if previous_method='exact_set_title' then
     perform api.quarantine_english_exact_title_group(p_group);
     insert into market.catalogue_price_repairs(repair_key,category_id,group_id,reason,detail)
     values('set:3:'||p_group,3,p_group,case when coalesce(provider_count,0)>1 or coalesce(array_length(ids,1),0)>1 then 'ambiguous_provider_set' else 'unmapped_provider_set' end,
       jsonb_build_object('name',p_name,'titleSuffix',suffix,'providerGroups',provider_count,'candidateSetIds',ids))
     on conflict(repair_key) do update set reason=excluded.reason,detail=excluded.detail,status='open',last_seen_at=now();
     return jsonb_build_object('status',case when coalesce(provider_count,0)>1 or coalesce(array_length(ids,1),0)>1 then 'ambiguous' else 'unmapped' end);
   end if;
 end if;
 return api.resolve_catalogue_bulk_set_by_code_or_name(p_category,p_group,p_language,p_name,p_abbreviation);
end;
$function$;

create or replace function api.english_exact_price_set_is_current(p_group bigint,p_set uuid) returns boolean
language sql stable security invoker set search_path='' as $function$
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

revoke all on function api.resolve_catalogue_bulk_set(integer,bigint,text,text,text),api.english_exact_price_set_is_current(bigint,uuid) from public,anon,authenticated;
grant execute on function api.resolve_catalogue_bulk_set(integer,bigint,text,text,text),api.english_exact_price_set_is_current(bigint,uuid) to service_role;
