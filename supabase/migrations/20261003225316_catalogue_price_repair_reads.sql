-- Operator repair pages remain internal and bounded through the api schema.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create function api.list_catalogue_price_repairs(p_after text default null,p_limit integer default 100)
returns setof jsonb language plpgsql stable security invoker set search_path='' as $function$
begin
  if (p_after is not null and length(p_after)>300) or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid repair page';
  end if;
  return query select to_jsonb(r) from market.catalogue_price_repairs r
    where r.status='open' and (p_after is null or r.repair_key>p_after)
    order by r.repair_key limit p_limit;
end;
$function$;
revoke all on function api.list_catalogue_price_repairs(text,integer) from public,anon,authenticated;
grant execute on function api.list_catalogue_price_repairs(text,integer) to service_role;
