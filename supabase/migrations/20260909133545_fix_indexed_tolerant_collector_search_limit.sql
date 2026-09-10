set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function api.catalogue_cards_by_collector(
  p_collector text,
  p_language text default null,
  p_set_ids uuid[] default null,
  p_limit integer default 80
)
returns setof api.catalogue_cards
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_collector is null or pg_catalog.btrim(p_collector) = '' then
    return;
  end if;

  if pg_catalog.strpos(p_collector, '/') > 0 then
    return query
      select c.*
      from api.catalogue_cards c
      where catalog.normalise_stackr_collector_number(c.collector_number) = p_collector
        and (p_language is null or c.language_code = p_language)
        and (p_set_ids is null or c.set_id = any(p_set_ids))
      order by c.variant_id
      limit greatest(1, least(coalesce(p_limit, 80), 500));
  else
    return query
      select c.*
      from api.catalogue_cards c
      where pg_catalog.split_part(catalog.normalise_stackr_collector_number(c.collector_number), '/', 1) = p_collector
        and (p_language is null or c.language_code = p_language)
        and (p_set_ids is null or c.set_id = any(p_set_ids))
      order by c.variant_id
      limit greatest(1, least(coalesce(p_limit, 80), 500));
  end if;
end;
$$;

revoke all on function api.catalogue_cards_by_collector(text, text, uuid[], integer)
  from public, anon, authenticated;
grant execute on function api.catalogue_cards_by_collector(text, text, uuid[], integer)
  to service_role;
