-- A canonical set can be intentionally shared by more than one provider
-- group.  A later group sweep must not overwrite a still-valid outcome that
-- is already owned by another group, while stale or malformed mappings stay
-- visible for repair.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function api.catalogue_bulk_group_candidates(
  p_category integer,p_group bigint,p_after uuid default null,p_limit integer default 500
) returns setof jsonb language sql stable security invoker set search_path='' as $function$
  with current_versions as materialized (
    select distinct on (cv.language_code) cv.id,cv.language_code
    from catalog.catalogue_versions cv
    where cv.status='published' and cv.deprecated_at is null
    order by cv.language_code,cv.published_at desc nulls last,cv.created_at desc,cv.id desc
  ), member as materialized (
    select s.category_id,s.group_id,s.set_id,s.language_code,s.method,
      case
        when s.method='exact_set_code' then api.japanese_exact_price_set_is_current(s.group_id,s.set_id)
        when s.method='exact_set_title' then api.english_exact_price_set_is_current(s.group_id,s.set_id)
        else true
      end as is_current
    from market.catalogue_provider_set_members s
    where s.category_id=p_category and s.group_id=p_group
  ), published as materialized (
    select cvv.variant_id,cvv.printing_id,cvv.set_id,cvv.language_code,
      cv.id as catalogue_version_id,p.collector_number,v.variant_code,v.finish_code,
      p.english_display_name as card_english_display_name,p.native_name as card_native_name,
      member.category_id,member.group_id,member.method
    from member
    join current_versions cv on cv.language_code=member.language_code
    join catalog.catalogue_version_variants cvv on cvv.catalogue_version_id=cv.id
      and cvv.language_code=member.language_code and cvv.set_id=member.set_id
    join catalog.card_variants v on v.id=cvv.variant_id and v.deprecated_at is null
      and v.language_code=cvv.language_code and v.printing_id=cvv.printing_id
    join catalog.card_printings p on p.id=cvv.printing_id and p.deprecated_at is null
      and p.set_id=cvv.set_id and p.language_code=v.language_code
    join catalog.sets s on s.id=p.set_id and s.deprecated_at is null
    join catalog.languages l on l.code=v.language_code
    where member.is_current and (p_after is null or cvv.variant_id>p_after)
  )
  select jsonb_build_object(
    'variant_id',c.variant_id,'printing_id',c.printing_id,'set_id',c.set_id,
    'language_code',c.language_code,'catalogue_version_id',c.catalogue_version_id,
    'collector_number',c.collector_number,'variant_code',c.variant_code,'finish_code',c.finish_code,
    'card_english_display_name',c.card_english_display_name,'card_native_name',c.card_native_name,
    'provider_set_method',c.method,
    'unique_collector_number',coalesce(length(split_part(api.normalized_price_collector(c.collector_number),'/',1)),0)>0
      and (select count(distinct p.id) from catalog.card_printings p
        where p.set_id=c.set_id and p.language_code=c.language_code and p.deprecated_at is null
          and split_part(api.normalized_price_collector(p.collector_number),'/',1)=split_part(api.normalized_price_collector(c.collector_number),'/',1))=1,
    'provider_mapping',case when own_map.variant_id is not null then to_jsonb(own_map) end
  )
  from published c
  left join market.catalogue_provider_cards own_map on own_map.variant_id=c.variant_id
    and own_map.printing_id=c.printing_id and own_map.set_id=c.set_id and own_map.language_code=c.language_code
    and own_map.category_id=c.category_id and own_map.group_id=c.group_id
    and own_map.subtype=api.catalogue_provider_subtype(c.variant_code,c.finish_code)
  where not exists (
    select 1
    from market.catalogue_provider_cards other_map
    join market.catalogue_provider_set_members other_member
      on other_member.category_id=other_map.category_id and other_member.group_id=other_map.group_id
      and other_member.set_id=c.set_id and other_member.language_code=c.language_code
    where other_map.variant_id=c.variant_id and other_map.printing_id=c.printing_id
      and other_map.set_id=c.set_id and other_map.catalogue_version_id=c.catalogue_version_id
      and other_map.language_code=c.language_code
      and other_map.subtype=api.catalogue_provider_subtype(c.variant_code,c.finish_code)
      and other_map.method in ('exact_name_number','exact_set_code_number','reviewed')
      and ((other_map.category_id=3 and c.language_code='en')
        or (other_map.category_id=85 and c.language_code='ja'))
      and case
        when other_member.method='exact_set_code' then api.japanese_exact_price_set_is_current(other_member.group_id,other_member.set_id)
        when other_member.method='exact_set_title' then api.english_exact_price_set_is_current(other_member.group_id,other_member.set_id)
        else true
      end
      and (other_map.category_id<>c.category_id or other_map.group_id<>c.group_id)
  )
  order by c.variant_id
  limit greatest(1,least(coalesce(p_limit,500),500));
$function$;

revoke all on function api.catalogue_bulk_group_candidates(integer,bigint,uuid,integer) from public,anon,authenticated;
grant execute on function api.catalogue_bulk_group_candidates(integer,bigint,uuid,integer) to service_role;
