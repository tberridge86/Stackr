-- Retain actual provider dates when the existing approved guide writer replaces
-- its latest row. This migration does not fetch prices or activate a worker.
-- No history is invented from a current quote; OLD is retained on the next write.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table market.catalogue_daily_price_observations (
  id bigint generated always as identity primary key,
  observation_key text not null unique check (observation_key ~ '^[a-f0-9]{64}$'),
  variant_id uuid not null,
  printing_id uuid not null,
  set_id uuid not null,
  catalogue_version_id uuid not null,
  language_code text not null check (language_code in ('en','ja')),
  provider text not null check (provider = 'tcgcsv'),
  category_id integer not null,
  group_id bigint not null,
  product_id bigint not null,
  subtype text not null,
  source_at timestamptz not null,
  source_day date not null,
  central_estimate_gbp numeric not null check (central_estimate_gbp > 0 and central_estimate_gbp < 'Infinity'::numeric),
  stale_after timestamptz not null,
  source_payload jsonb not null,
  retained_at timestamptz not null default now(),
  check (source_day = (source_at at time zone 'UTC')::date),
  check (stale_after >= source_at)
);
-- History is append-only, including for the backend role. No FK cascade can
-- erase the receipt when a printing, provider mapping or publication is retired.
alter table market.catalogue_daily_price_observations enable row level security;
create policy "service reads daily guide history" on market.catalogue_daily_price_observations
  for select to service_role using (true);
create policy "service retains daily guide history" on market.catalogue_daily_price_observations
  for insert to service_role with check (true);
revoke all on market.catalogue_daily_price_observations from public, anon, authenticated;
grant select, insert on market.catalogue_daily_price_observations to service_role;
grant usage, select on sequence market.catalogue_daily_price_observations_id_seq to service_role;
create index catalogue_daily_price_identity_day_idx on market.catalogue_daily_price_observations
  (variant_id, catalogue_version_id, source_day desc, source_at desc, id desc);

create function market.retain_catalogue_daily_price(p_quote jsonb) returns void
language plpgsql security invoker set search_path = '' as $function$
begin
  -- The writer already proves the approved source product and printing. Retain
  -- its complete quote/FX receipt, but do not turn invalid legacy rows into data.
  if p_quote->>'provider' is distinct from 'tcgcsv'
    or p_quote->>'language_code' not in ('en','ja')
    or p_quote->>'original_currency' is distinct from 'USD'
    or not ((p_quote->>'category_id' = '3' and p_quote->>'language_code' = 'en')
      or (p_quote->>'category_id' = '85' and p_quote->>'language_code' = 'ja'))
    or p_quote->>'subtype' not in ('Normal','Holofoil','Reverse Holofoil')
    or (p_quote->>'original_price')::numeric <= 0
    or (p_quote->>'central_estimate')::numeric <= 0
    or (p_quote->>'exchange_rate')::numeric not between 0.000001 and 10
    or (p_quote->>'central_estimate')::numeric <> round((p_quote->>'original_price')::numeric * (p_quote->>'exchange_rate')::numeric, 2)
    or (p_quote->>'dataset_at')::timestamptz > (p_quote->>'recorded_at')::timestamptz + interval '5 minutes'
    or (p_quote->>'exchange_rate_at')::timestamptz > (p_quote->>'recorded_at')::timestamptz + interval '5 minutes'
    or (p_quote->>'stale_after')::timestamptz < (p_quote->>'dataset_at')::timestamptz then return; end if;
  insert into market.catalogue_daily_price_observations(observation_key,variant_id,printing_id,set_id,catalogue_version_id,
    language_code,provider,category_id,group_id,product_id,subtype,source_at,source_day,central_estimate_gbp,stale_after,source_payload)
  values(encode(sha256(convert_to((p_quote - 'recorded_at')::text,'UTF8')),'hex'),
    (p_quote->>'variant_id')::uuid,(p_quote->>'printing_id')::uuid,(p_quote->>'set_id')::uuid,(p_quote->>'catalogue_version_id')::uuid,
    p_quote->>'language_code','tcgcsv',(p_quote->>'category_id')::integer,(p_quote->>'group_id')::bigint,(p_quote->>'product_id')::bigint,
    p_quote->>'subtype',(p_quote->>'dataset_at')::timestamptz,((p_quote->>'dataset_at')::timestamptz at time zone 'UTC')::date,
    (p_quote->>'central_estimate')::numeric,(p_quote->>'stale_after')::timestamptz,p_quote)
  on conflict (observation_key) do nothing;
end;
$function$;
revoke all on function market.retain_catalogue_daily_price(jsonb) from public, anon, authenticated;
grant execute on function market.retain_catalogue_daily_price(jsonb) to service_role;

create function market.capture_catalogue_daily_price() returns trigger
language plpgsql security invoker set search_path = '' as $function$
begin
  if tg_op in ('UPDATE','DELETE') then perform market.retain_catalogue_daily_price(to_jsonb(old)); end if;
  if tg_op in ('INSERT','UPDATE') then perform market.retain_catalogue_daily_price(to_jsonb(new)); end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
revoke all on function market.capture_catalogue_daily_price() from public, anon, authenticated;
grant execute on function market.capture_catalogue_daily_price() to service_role;
create trigger retain_catalogue_daily_prices after insert or update or delete on market.catalogue_general_prices
  for each row execute function market.capture_catalogue_daily_price();

create function api.catalogue_daily_market_movers(p_limit integer default 25, p_sort text default 'percent') returns jsonb
language plpgsql stable security invoker set search_path = '' as $function$
declare result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 or p_sort is null or p_sort not in ('money','percent') then
    raise exception 'invalid daily mover query' using errcode = '22023';
  end if;
  with current_versions as materialized (
    select distinct on (cv.language_code) cv.id,cv.language_code from catalog.catalogue_versions cv
    where cv.status = 'published' and cv.deprecated_at is null
    order by cv.language_code,cv.published_at desc nulls last,cv.created_at desc,cv.id desc
  ), published as materialized (
    select v.id variant_id,p.id printing_id,p.set_id,v.language_code,cv.id catalogue_version_id,v.variant_code,v.finish_code
    from current_versions cv
    join catalog.catalogue_version_variants membership on membership.catalogue_version_id = cv.id and membership.language_code = cv.language_code
    join catalog.card_variants v on v.id = membership.variant_id and v.printing_id = membership.printing_id
      and v.language_code = membership.language_code and v.deprecated_at is null
    join catalog.card_printings p on p.id = v.printing_id and p.set_id = membership.set_id
      and p.language_code = v.language_code and p.deprecated_at is null
    join catalog.sets s on s.id = p.set_id and s.language_code = p.language_code and s.deprecated_at is null
  ), supported as materialized (
    select p.*,case
      when variant_code in ('normal','standard','default') and finish_code in ('normal','standard','default','non_holo') then 'Normal'
      when variant_code = 'holo' and finish_code = 'holo' then 'Holofoil'
      when variant_code = 'reverse_holo' and finish_code = 'reverse_holo' then 'Reverse Holofoil' end subtype
    from published p where language_code in ('en','ja')
  ), eligible as materialized (
    select * from supported where subtype is not null
  ), quoted as materialized (
    select p.*,g.dataset_at,g.stale_after,g.central_estimate,g.provider,g.category_id,g.group_id,g.product_id,
      encode(sha256(convert_to((to_jsonb(g) - 'recorded_at')::text,'UTF8')),'hex') observation_key
    from eligible p join market.catalogue_general_prices g on g.variant_id = p.variant_id and g.printing_id = p.printing_id
      and g.set_id = p.set_id and g.language_code = p.language_code and g.catalogue_version_id = p.catalogue_version_id
      and g.subtype = p.subtype and g.provider = 'tcgcsv' and g.original_currency = 'USD'
      and ((g.category_id = 3 and p.language_code = 'en') or (g.category_id = 85 and p.language_code = 'ja'))
    where g.dataset_at <= now() and g.stale_after >= g.dataset_at and g.central_estimate > 0
      and g.central_estimate < 'Infinity'::numeric and g.original_price > 0 and g.original_price < 'Infinity'::numeric
      and g.exchange_rate > 0 and g.exchange_rate <= 10
      and g.central_estimate = round(g.original_price * g.exchange_rate, 2)
      and g.dataset_at <= g.recorded_at + interval '5 minutes' and g.exchange_rate_at <= g.recorded_at + interval '5 minutes'
  ), pairs as materialized (
    select q.*,old.central_estimate_gbp previous_estimate,old.source_at previous_at
    from quoted q
    -- The current observation must be the exact receipt retained by the writer.
    join market.catalogue_daily_price_observations cur on cur.observation_key = q.observation_key
    cross join lateral (
      select h.central_estimate_gbp,h.source_at from market.catalogue_daily_price_observations h
      where h.variant_id = q.variant_id and h.printing_id = q.printing_id and h.set_id = q.set_id
        and h.catalogue_version_id = q.catalogue_version_id and h.language_code = q.language_code
        and h.provider = q.provider and h.category_id = q.category_id and h.group_id = q.group_id and h.product_id = q.product_id
        and h.subtype = q.subtype and h.source_day = (q.dataset_at at time zone 'UTC')::date - 1
      order by h.source_at desc,h.id desc limit 1
    ) old
    where q.dataset_at >= now() - interval '48 hours' and q.stale_after > now()
  ), movement as materialized (
    select pairs.*,central_estimate - previous_estimate delta,
      (central_estimate - previous_estimate) / previous_estimate * 100 percentage_change,
      case p_sort when 'money' then abs(central_estimate - previous_estimate)
        else abs((central_estimate - previous_estimate) / previous_estimate * 100) end rank_value
    from pairs where central_estimate <> previous_estimate
  ), ranked as (
    select movement.*,row_number() over (partition by delta > 0 order by rank_value desc,variant_id) direction_rank from movement
  ), selected as (
    -- Reserve both tails, then fill unused places from the strongest remainder.
    select * from ranked order by (direction_rank <= p_limit / 2) desc,rank_value desc,variant_id limit p_limit
  )
  select jsonb_build_object('movers',coalesce((select jsonb_agg(jsonb_build_object(
    'variantId',variant_id,'sealedProductVariantId',null,'productType','raw_card','currency','GBP',
    'currentEstimate',central_estimate,'previousEstimate',previous_estimate,'percentageChange',round(percentage_change,2),
    'confidence',jsonb_build_object('score',0,'label','low'),'calculatedAt',dataset_at,'previousCalculatedAt',previous_at,
    'comparisonDays',1,'priceBasis','catalogue_market_guide','sourceProvider','tcgcsv') order by rank_value desc,variant_id) from selected),'[]'::jsonb),
    'coverage',jsonb_build_object('scope','catalogue_daily','source','tcgcsv',
      'state',case when (select count(*) from pairs) > 0 then 'ready' else 'insufficient_history' end,
      'publishedVariants',(select count(*) from published),'supportedVariants',(select count(*) from eligible),
      'quotedVariants',(select count(*) from quoted),'comparableVariants',(select count(*) from pairs),
      'unsupportedVariants',(select count(*) from published) - (select count(*) from eligible),
      'unquotedVariants',(select count(*) from eligible) - (select count(*) from quoted),
      'staleVariants',(select count(*) from quoted where dataset_at < now() - interval '48 hours' or stale_after <= now()),
      'insufficientHistoryVariants',(select count(*) from quoted where dataset_at >= now() - interval '48 hours' and stale_after > now()) - (select count(*) from pairs),
      'latestSourceAt',(select max(dataset_at) from quoted),'asOf',now())) into result;
  return result;
end;
$function$;
revoke all on function api.catalogue_daily_market_movers(integer,text) from public, anon, authenticated;
grant execute on function api.catalogue_daily_market_movers(integer,text) to service_role;
