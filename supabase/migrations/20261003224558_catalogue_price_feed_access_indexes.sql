-- Keep market internal to PostgREST; the importer reads only through api.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create function api.read_catalogue_bulk_feed(p_key text) returns jsonb
language plpgsql stable security invoker set search_path = '' as $function$
declare result jsonb;
begin
  if p_key is null or p_key !~ '^(last-updated|tcgplayer/(3|85)/(groups|[0-9]+/(products|prices)))$' then
    raise exception 'invalid feed';
  end if;
  select jsonb_build_object('payload',f.payload,'dataset_at',f.dataset_at,'fetched_at',f.fetched_at)
  into result from market.catalogue_bulk_feeds f where f.feed_key=p_key;
  return result;
end;
$function$;
revoke all on function api.read_catalogue_bulk_feed(text) from public, anon, authenticated;
grant execute on function api.read_catalogue_bulk_feed(text) to service_role;

create index catalogue_price_outcomes_version_idx on market.catalogue_price_outcomes(catalogue_version_id);
create index catalogue_provider_cards_version_idx on market.catalogue_provider_cards(catalogue_version_id);
create index catalogue_provider_cards_group_idx on market.catalogue_provider_cards(category_id,group_id);
create index catalogue_provider_cards_printing_idx on market.catalogue_provider_cards(printing_id);
create index catalogue_provider_cards_set_idx on market.catalogue_provider_cards(set_id);
create index catalogue_provider_sets_set_idx on market.catalogue_provider_sets(set_id);
