-- Resolve durable provider mappings through physical publication relations.
-- Only the base name resolver is replaced. The Japanese exact-code wrapper
-- (resolve_catalogue_bulk_set_by_code_or_name) continues to own its code
-- uniqueness and quarantine checks.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function api.resolve_catalogue_bulk_set_by_name(
  p_category integer,
  p_group bigint,
  p_language text,
  p_name text,
  p_abbreviation text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  mapped market.catalogue_provider_sets;
  ids uuid[];
  full_name text;
  short_name text;
  code text;
  current_member_set_ids jsonb;
  has_requested_language_member boolean;
begin
  if p_category is null or p_language is null or p_group is null or p_group <= 0
    or not ((p_category = 3 and p_language = 'en') or (p_category = 85 and p_language = 'ja')) then
    raise exception 'invalid provider language';
  end if;

  select * into mapped
  from market.catalogue_provider_sets
  where category_id = p_category
    and group_id = p_group;

  if found then
    -- api.catalogue_sets includes every non-deprecated published catalogue
    -- version, rather than choosing a latest version. Preserve that result
    -- cardinality and its all-member setIds aggregation here. Eligibility
    -- remains tied to at least one member in the requested language, exactly
    -- as the previous EXISTS predicate did.
    select
      jsonb_agg(member.set_id order by member.set_id),
      bool_or(member.language_code = p_language)
    into current_member_set_ids, has_requested_language_member
    from market.catalogue_provider_set_members member
    join catalog.sets catalogue_set
      on catalogue_set.id = member.set_id
      and catalogue_set.language_code = member.language_code
      and catalogue_set.deprecated_at is null
    join catalog.languages language
      on language.code = catalogue_set.language_code
    join catalog.catalogue_version_sets catalogue_version_set
      on catalogue_version_set.set_id = catalogue_set.id
    join catalog.catalogue_versions catalogue_version
      on catalogue_version.id = catalogue_version_set.catalogue_version_id
      and catalogue_version.status = 'published'
      and catalogue_version.deprecated_at is null
    where member.category_id = p_category
      and member.group_id = p_group;

    if coalesce(has_requested_language_member, false) then
      update market.catalogue_price_repairs
      set status = 'resolved', last_seen_at = now()
      where repair_key = 'set:' || p_category || ':' || p_group
        or repair_key in (
          select 'catalogue-set:' || set_id
          from market.catalogue_provider_set_members
          where category_id = p_category
            and group_id = p_group
        );
      return jsonb_build_object(
        'status', 'mapped',
        'setId', mapped.set_id,
        'source', mapped.method,
        'setIds', current_member_set_ids
      );
    end if;
  end if;

  full_name = api.catalogue_provider_name(p_name);
  code = api.catalogue_provider_name(p_abbreviation);
  short_name = case when length(code) > 0 and starts_with(full_name, code)
    then substr(full_name, length(code) + 1)
    else full_name
  end;

  select array_agg(distinct set_id) into ids
  from api.catalogue_sets
  where language_code = p_language
    and (api.catalogue_provider_name(native_name) in (full_name, short_name)
      or api.catalogue_provider_name(english_display_name) in (full_name, short_name))
    and length(full_name) > 0;

  if coalesce(array_length(ids, 1), 0) = 1 then
    insert into market.catalogue_provider_sets
    values (p_category, p_group, p_language, ids[1], 'exact_set_name', null, now())
    on conflict (category_id, group_id) do update
      set set_id = excluded.set_id,
          verified_at = now()
      where market.catalogue_provider_sets.method <> 'reviewed';
    insert into market.catalogue_provider_set_members
    values (p_category, p_group, ids[1], p_language, 'exact_set_name', null, now())
    on conflict (category_id, group_id, set_id) do update
      set verified_at = now();
    update market.catalogue_price_repairs
    set status = 'resolved', last_seen_at = now()
    where repair_key = 'set:' || p_category || ':' || p_group
      or repair_key = 'catalogue-set:' || ids[1];
    return jsonb_build_object('status', 'mapped', 'setId', ids[1], 'source', 'exact_set_name');
  end if;

  insert into market.catalogue_price_repairs(repair_key, category_id, group_id, reason, detail)
  values (
    'set:' || p_category || ':' || p_group,
    p_category,
    p_group,
    case when coalesce(array_length(ids, 1), 0) > 1 then 'ambiguous_provider_set' else 'unmapped_provider_set' end,
    jsonb_build_object('name', p_name, 'language', p_language, 'candidateSetIds', ids)
  )
  on conflict (repair_key) do update
    set reason = excluded.reason,
        detail = excluded.detail,
        status = 'open',
        last_seen_at = now();
  return jsonb_build_object(
    'status',
    case when coalesce(array_length(ids, 1), 0) > 1 then 'ambiguous' else 'unmapped' end
  );
end;
$function$;

revoke all on function api.resolve_catalogue_bulk_set_by_name(integer, bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function api.resolve_catalogue_bulk_set_by_name(integer, bigint, text, text, text)
  to service_role;