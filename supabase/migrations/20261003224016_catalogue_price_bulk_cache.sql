-- Local candidate: bounded stored reads and resumable catalogue-wide outcomes.
-- No provider calls, schedules, catalogue changes or price backfill on migration.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists market.catalogue_price_outcomes (
  variant_id uuid primary key references catalog.card_variants(id) on delete cascade,
  catalogue_version_id uuid not null references catalog.catalogue_versions(id),
  reason text not null,
  checked_at timestamptz not null,
  next_retry_at timestamptz not null,
  provider text not null,
  check (next_retry_at >= checked_at)
);
alter table market.catalogue_price_outcomes enable row level security;
create policy "service manages catalogue price outcomes" on market.catalogue_price_outcomes
  for all to service_role using (true) with check (true);
revoke all on market.catalogue_price_outcomes from public, anon, authenticated;
grant select, insert, update, delete on market.catalogue_price_outcomes to service_role;

create table market.catalogue_general_prices (
  variant_id uuid primary key references catalog.card_variants(id) on delete cascade,
  printing_id uuid not null references catalog.card_printings(id),
  set_id uuid not null,
  language_code text not null check (language_code = 'en'),
  catalogue_version_id uuid not null references catalog.catalogue_versions(id),
  provider text not null check (provider = 'tcgcsv'),
  product_id bigint not null check (product_id > 0),
  group_id bigint not null check (group_id > 0),
  original_price numeric not null check (original_price >= 0 and original_price < 'Infinity'::numeric),
  original_currency text not null check (original_currency = 'USD'),
  exchange_rate numeric not null check (exchange_rate > 0 and exchange_rate <= 10),
  exchange_rate_at timestamptz not null,
  exchange_rate_source text not null check (length(exchange_rate_source) > 0),
  central_estimate numeric not null check (central_estimate >= 0 and central_estimate < 'Infinity'::numeric),
  dataset_at timestamptz not null,
  stale_after timestamptz not null,
  recorded_at timestamptz not null default now()
);
alter table market.catalogue_general_prices enable row level security;
create policy "service manages general catalogue prices" on market.catalogue_general_prices
  for all to service_role using (true) with check (true);
revoke all on market.catalogue_general_prices from public, anon, authenticated;
grant select, insert, update, delete on market.catalogue_general_prices to service_role;

-- A provider file is shared by all cards in a set and reused across worker slices.
create table market.catalogue_bulk_feeds (
  feed_key text primary key,
  dataset_at timestamptz,
  payload jsonb,
  fetched_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  retry_after timestamptz
);
create table market.catalogue_bulk_budget (
  provider text primary key,
  window_started_at timestamptz not null,
  requests integer not null check (requests >= 0),
  next_request_at timestamptz not null
);
alter table market.catalogue_bulk_feeds enable row level security;
alter table market.catalogue_bulk_budget enable row level security;
create policy "service manages bulk feeds" on market.catalogue_bulk_feeds for all to service_role using (true) with check (true);
create policy "service manages bulk budget" on market.catalogue_bulk_budget for all to service_role using (true) with check (true);
revoke all on market.catalogue_bulk_feeds, market.catalogue_bulk_budget from public, anon, authenticated;
grant select, insert, update, delete on market.catalogue_bulk_feeds, market.catalogue_bulk_budget to service_role;

-- A bounded card lookup must not sort/scan the entire snapshot history.
create index if not exists catalogue_price_public_snapshot_latest_idx
  on public.market_price_snapshots(card_id, language, calculated_at desc nulls last, id desc)
  where user_id is null;
create index if not exists catalogue_price_published_alias_lookup_idx
  on catalog.catalogue_version_external_identifiers(external_id, language_code)
  include (catalogue_version_id, printing_id, variant_id);

create or replace function api.read_catalogue_prices(p_references text[], p_language text default null)
returns table(reference text, candidates jsonb)
language plpgsql stable security invoker set search_path = '' as $function$
begin
  if coalesce(array_length(p_references, 1), 0) not between 1 and 100
    or exists(select 1 from unnest(p_references) r where r is null or r !~ '^[A-Za-z0-9._:/+-]{1,160}$')
    or (p_language is not null and p_language not in ('en','ja','zh-tw','zh-cn','ko')) then
    raise exception 'invalid catalogue price references' using errcode = '22023';
  end if;
  return query
  with refs as (
    select r, ordinal, case when r ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then r::uuid end canonical_id
    from unnest(p_references) with ordinality as input(r, ordinal)
  )
  select refs.r, coalesce(items.value, '[]'::jsonb)
  from refs
  left join lateral (
    select jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'is_default', v.is_default,
      'general_quote', (
        select to_jsonb(g) from market.catalogue_general_prices g
        where g.variant_id = c.variant_id and g.printing_id = c.printing_id and g.set_id = c.set_id
          and g.language_code = c.language_code and g.catalogue_version_id = c.catalogue_version_id
      ),
      'requested_variant_ids', (
        select coalesce(jsonb_agg(distinct requested.id), '[]'::jsonb) from (
          select exact_variant.id from catalog.card_variants exact_variant where exact_variant.id = refs.canonical_id
          union all
          select e.variant_id from api.catalogue_external_identifiers e where e.external_id = refs.r
            and e.variant_id is not null and (p_language is null or e.language_code = p_language)
        ) requested
      ),
      'estimate', (
        select to_jsonb(e) from api.market_price_estimates e
        where e.variant_id = c.variant_id and e.product_kind = 'raw_card'
          and e.display_currency_code = 'GBP' and e.condition_code = 'raw_near_mint'
          and e.language_code = c.language_code
          and e.grader_code is null and e.grade_value is null and e.fallback_identity_key is null
        order by e.calculated_at desc, e.price_estimate_id desc limit 1
      ),
      'snapshot', (
        select to_jsonb(s) from public.market_price_snapshots s
        where s.user_id is null and s.card_id = c.variant_id::text and s.language = c.language_code
          and to_jsonb(s)->>'set_id' = c.set_id::text
          and coalesce(s.pricing_identity_json->>'canonicalVariantId',s.pricing_identity_json->>'canonical_variant_id') = c.variant_id::text
          and coalesce(s.pricing_identity_json->>'canonicalPrintingId',s.pricing_identity_json->>'canonical_printing_id') = c.printing_id::text
          and s.pricing_identity_json->>'productType' = 'raw_card'
          and coalesce(s.pricing_identity_json->>'rawCondition',s.pricing_identity_json->>'condition') = 'raw_near_mint'
          and coalesce(to_jsonb(s)->>'currency', 'GBP') = 'GBP'
        order by s.calculated_at desc nulls last, s.id desc limit 1
      ),
      'outcome', (
        select jsonb_build_object('reason',o.reason,'next_retry_at',o.next_retry_at)
        from market.catalogue_price_outcomes o where o.variant_id = c.variant_id
          and o.catalogue_version_id = c.catalogue_version_id
      )
    ) order by c.variant_id) value
    from (
      -- Resolve indexed identities before entering the published card projection.
      select distinct resolved.printing_id from (
        select cv.printing_id from catalog.card_variants cv where cv.id = refs.canonical_id
        union all
        select cp.id from catalog.card_printings cp where cp.id = refs.canonical_id
        union all
        select coalesce(e.printing_id, ev.printing_id) from api.catalogue_external_identifiers e
          left join catalog.card_variants ev on ev.id = e.variant_id
        where e.external_id = refs.r and (p_language is null or e.language_code = p_language)
      ) resolved where resolved.printing_id is not null
    ) identities
    join lateral (
      select * from api.catalogue_cards bounded where bounded.printing_id = identities.printing_id
        and (p_language is null or bounded.language_code = p_language)
    ) c on true
    join catalog.card_variants v on v.id = c.variant_id
  ) items on true
  order by refs.ordinal;
end;
$function$;
revoke all on function api.read_catalogue_prices(text[],text) from public, anon, authenticated;
grant execute on function api.read_catalogue_prices(text[],text) to service_role;

-- All published cards are eligible for accounting, regardless of ownership.
-- Missing provider support remains an explicit outcome with its own retry date.
create or replace function api.catalogue_bulk_price_candidates(p_after uuid default null, p_limit integer default 100)
returns setof jsonb language sql stable security invoker set search_path = '' as $function$
  select to_jsonb(c) from api.catalogue_cards c
  left join market.catalogue_price_outcomes o on o.variant_id = c.variant_id
    and o.catalogue_version_id = c.catalogue_version_id
  where (p_after is null or c.variant_id > p_after)
    and (o.variant_id is null or o.next_retry_at <= now())
  order by c.variant_id limit greatest(1,least(coalesce(p_limit,100),500));
$function$;
revoke all on function api.catalogue_bulk_price_candidates(uuid,integer) from public, anon, authenticated;
grant execute on function api.catalogue_bulk_price_candidates(uuid,integer) to service_role;

comment on function api.read_catalogue_prices(text[],text) is
  'Service-only, bounded published identities and exact raw near-mint GBP stored quotes. Never calls providers or exposes personal snapshots.';

create function api.claim_catalogue_bulk_feed(p_key text) returns uuid
language plpgsql security invoker set search_path = '' as $function$
declare token uuid;
begin
  if p_key !~ '^(last-updated|groups|[0-9]+/(products|prices))$' then raise exception 'invalid feed'; end if;
  insert into market.catalogue_bulk_feeds(feed_key) values(p_key) on conflict do nothing;
  -- Lock the shared budget before reserving a feed. Failed attempts count too.
  insert into market.catalogue_bulk_budget values('tcgcsv',now(),0,now()) on conflict do nothing;
  perform 1 from market.catalogue_bulk_budget where provider='tcgcsv' for update;
  if not exists(select 1 from market.catalogue_bulk_budget where provider='tcgcsv'
    and next_request_at <= now() and (window_started_at <= now()-interval '24 hours' or requests < 6000)) then return null; end if;
  update market.catalogue_bulk_feeds set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  where feed_key=p_key and (lease_until is null or lease_until<=now()) and (retry_after is null or retry_after<=now())
    and (fetched_at is null or fetched_at<=now()-interval '24 hours') returning lease_token into token;
  if token is null then return null; end if;
  update market.catalogue_bulk_budget set
    requests=case when window_started_at<=now()-interval '24 hours' then 1 else requests+1 end,
    window_started_at=case when window_started_at<=now()-interval '24 hours' then now() else window_started_at end,
    next_request_at=now()+interval '1 second' where provider='tcgcsv';
  return token;
end;
$function$;
create function api.finish_catalogue_bulk_feed(p_key text,p_token uuid,p_dataset timestamptz,p_payload jsonb,p_retry_seconds integer default 0)
returns boolean language plpgsql security invoker set search_path = '' as $function$
begin
  update market.catalogue_bulk_feeds set
    dataset_at=case when p_payload is null then dataset_at else p_dataset end,
    payload=coalesce(p_payload,payload),fetched_at=case when p_payload is null then fetched_at else now() end,
    lease_token=null,lease_until=null,
    retry_after=case when p_retry_seconds>0 then now()+make_interval(secs=>least(p_retry_seconds,86400)) else null end
  where feed_key=p_key and lease_token=p_token and lease_until>now();
  return found;
end;
$function$;

create function api.store_catalogue_bulk_prices(p_results jsonb) returns integer
language plpgsql security invoker set search_path = '' as $function$
declare item jsonb; c record; q jsonb; n integer=0;
begin
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) not between 1 and 500 then raise exception 'invalid price results'; end if;
  for item in select * from jsonb_array_elements(p_results) loop
    select * into c from api.catalogue_cards where variant_id=(item->>'variantId')::uuid
      and catalogue_version_id=(item->>'catalogueVersionId')::uuid;
    if not found then raise exception 'catalogue revision changed'; end if;
    if item->>'reason' not in ('priced','no_provider_quote','unresolved_provider_identity','unsupported_provider_language','unsupported_provider_finish','provider_backoff')
      or (item->>'nextRetryAt')::timestamptz < now() then raise exception 'invalid price outcome'; end if;
    q=item->'quote';
    if q is not null and q <> 'null'::jsonb then
      -- TCGCSV is condition-unspecified market evidence. It never enters exact
      -- near-mint estimates, sold observations, holdings or price-history charts.
      if c.language_code <> 'en' or not (
        (c.variant_code in ('normal','standard','default') and c.finish_code in ('normal','standard','default','non_holo'))
        or (c.variant_code='holo' and c.finish_code='holo'))
        or q->>'currency' <> 'USD' or (q->>'datasetAt')::timestamptz > now()+interval '5 minutes'
        or (q->>'exchangeRateAt')::timestamptz > now()+interval '5 minutes' then raise exception 'unsupported general quote'; end if;
      insert into market.catalogue_general_prices(variant_id,printing_id,set_id,language_code,catalogue_version_id,provider,
        product_id,group_id,original_price,original_currency,exchange_rate,exchange_rate_at,exchange_rate_source,central_estimate,dataset_at,stale_after)
      values(c.variant_id,c.printing_id,c.set_id,c.language_code,c.catalogue_version_id,'tcgcsv',
        (q->>'productId')::bigint,(q->>'groupId')::bigint,(q->>'price')::numeric,'USD',(q->>'exchangeRate')::numeric,
        (q->>'exchangeRateAt')::timestamptz,q->>'exchangeRateSource',round((q->>'price')::numeric*(q->>'exchangeRate')::numeric,2),
        (q->>'datasetAt')::timestamptz,(q->>'datasetAt')::timestamptz+interval '48 hours')
      on conflict(variant_id) do update set printing_id=excluded.printing_id,set_id=excluded.set_id,language_code=excluded.language_code,
        catalogue_version_id=excluded.catalogue_version_id,product_id=excluded.product_id,group_id=excluded.group_id,
        original_price=excluded.original_price,exchange_rate=excluded.exchange_rate,exchange_rate_at=excluded.exchange_rate_at,
        exchange_rate_source=excluded.exchange_rate_source,central_estimate=excluded.central_estimate,dataset_at=excluded.dataset_at,
        stale_after=excluded.stale_after,recorded_at=now()
      where excluded.dataset_at >= market.catalogue_general_prices.dataset_at;
    end if;
    insert into market.catalogue_price_outcomes values(c.variant_id,c.catalogue_version_id,item->>'reason',now(),(item->>'nextRetryAt')::timestamptz,'tcgcsv')
    on conflict(variant_id) do update set catalogue_version_id=excluded.catalogue_version_id,reason=excluded.reason,
      checked_at=excluded.checked_at,next_retry_at=excluded.next_retry_at,provider=excluded.provider;
    n=n+1;
  end loop;
  return n;
end;
$function$;
revoke all on function api.claim_catalogue_bulk_feed(text),api.finish_catalogue_bulk_feed(text,uuid,timestamptz,jsonb,integer),api.store_catalogue_bulk_prices(jsonb) from public, anon, authenticated;
grant execute on function api.claim_catalogue_bulk_feed(text),api.finish_catalogue_bulk_feed(text,uuid,timestamptz,jsonb,integer),api.store_catalogue_bulk_prices(jsonb) to service_role;

create function api.normalized_price_collector(p_value text) returns text
language sql immutable strict security invoker set search_path = '' as $function$
  select regexp_replace(lower(regexp_replace(normalize(p_value,NFKC),'\s+','','g')), '(^|[^0-9])0+(?=[0-9])','\1','g');
$function$;
create index catalogue_collector_normalized_lookup_idx on catalog.card_printings
  (api.normalized_price_collector(collector_number),language_code,set_id) where deprecated_at is null;
create index catalogue_collector_prefix_lookup_idx on catalog.card_printings
  (split_part(api.normalized_price_collector(collector_number),'/',1),language_code,set_id) where deprecated_at is null;

create function api.search_price_catalogue_collector(p_collector text,p_language text default null,p_set uuid default null,p_limit integer default 100)
returns setof jsonb language plpgsql stable security invoker set search_path = '' as $function$
begin
  if p_collector is null or p_collector !~ '^[a-z0-9/-]{1,64}$' or
    (p_language is not null and p_language not in ('en','ja','zh-cn','zh-tw','ko')) then raise exception 'invalid collector lookup'; end if;
  return query select to_jsonb(c) from (
    select bounded.id from (
    select p.id from catalog.card_printings p where strpos(p_collector,'/')>0 and p.deprecated_at is null
      and (p_language is null or p.language_code=p_language) and (p_set is null or p.set_id=p_set)
      and api.normalized_price_collector(p.collector_number)=p_collector
    union all
    select p.id from catalog.card_printings p where strpos(p_collector,'/')=0 and p.deprecated_at is null
      and (p_language is null or p.language_code=p_language) and (p_set is null or p.set_id=p_set)
      and split_part(api.normalized_price_collector(p.collector_number),'/',1)=p_collector
    ) bounded order by bounded.id limit greatest(1,least(p_limit,1000))
  ) matched join lateral (select * from api.catalogue_cards published where published.printing_id=matched.id
    and (p_language is null or published.language_code=p_language) and (p_set is null or published.set_id=p_set)) c on true
  order by c.printing_id,c.variant_id limit greatest(1,least(p_limit,1000));
end;
$function$;
revoke all on function api.normalized_price_collector(text),api.search_price_catalogue_collector(text,text,uuid,integer) from public,anon,authenticated;
grant execute on function api.normalized_price_collector(text),api.search_price_catalogue_collector(text,text,uuid,integer) to service_role;


