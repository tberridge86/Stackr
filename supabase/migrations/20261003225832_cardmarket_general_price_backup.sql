-- Proposed Cardmarket public-guide backup.  It is separate from the TCGCSV/Tcgplayer
-- tables and intentionally stores only printing-scoped blended estimates.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table market.cardmarket_public_feed_revisions (
  id uuid primary key default gen_random_uuid(),
  feed_kind text not null check (feed_kind in ('products','price_guide')),
  source_url text not null check (source_url in (
    'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json',
    'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json')),
  source_created_at timestamptz not null,
  etag text,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_length bigint not null check (byte_length > 0 and byte_length <= 33554432),
  retrieved_at timestamptz not null default now(),
  unique(feed_kind, sha256)
);
create index cardmarket_feed_revision_latest_idx on market.cardmarket_public_feed_revisions(feed_kind, source_created_at desc, retrieved_at desc);

create table market.cardmarket_public_feed_leases (
  feed_kind text primary key check (feed_kind in ('products','price_guide')),
  last_succeeded_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  retry_after timestamptz
);

-- A review maps a provider product to a Stackr printing only. It is never a variant,
-- finish, condition, language-specific quote, or valuation identity.
create table market.cardmarket_printing_mappings (
  printing_id uuid primary key references catalog.card_printings(id) on delete cascade,
  catalogue_version_id uuid not null references catalog.catalogue_versions(id),
  provider_category_id integer not null check (provider_category_id > 0),
  provider_product_id bigint not null check (provider_product_id > 0),
  mapping_scope text not null default 'blended_printing' check (mapping_scope = 'blended_printing'),
  method text not null check (method = 'reviewed_exact'),
  language_evidence jsonb not null check (jsonb_typeof(language_evidence) = 'object' and language_evidence <> '{}'::jsonb),
  variant_evidence jsonb not null check (jsonb_typeof(variant_evidence) = 'object' and variant_evidence <> '{}'::jsonb),
  finish_evidence jsonb not null check (jsonb_typeof(finish_evidence) = 'object' and finish_evidence <> '{}'::jsonb),
  review_reference text not null check (length(btrim(review_reference)) between 5 and 1000),
  reviewed_at timestamptz not null default now(),
  unique(provider_category_id, provider_product_id)
);
create index cardmarket_mapping_catalogue_version_idx on market.cardmarket_printing_mappings(catalogue_version_id);

create table market.cardmarket_blended_general_prices (
  printing_id uuid primary key references market.cardmarket_printing_mappings(printing_id) on delete cascade,
  catalogue_version_id uuid not null references catalog.catalogue_versions(id),
  price_guide_revision_id uuid not null references market.cardmarket_public_feed_revisions(id),
  product_catalogue_revision_id uuid not null references market.cardmarket_public_feed_revisions(id),
  original_price numeric not null check (original_price >= 0 and original_price < 'Infinity'::numeric),
  original_currency text not null check (original_currency = 'EUR'),
  selected_field text not null check (selected_field in ('trend','avg30','avg')),
  exchange_rate numeric not null check (exchange_rate > 0 and exchange_rate < 'Infinity'::numeric),
  exchange_rate_at timestamptz not null,
  exchange_rate_source text not null check (length(btrim(exchange_rate_source)) > 0),
  central_estimate_gbp numeric not null check (central_estimate_gbp >= 0 and central_estimate_gbp < 'Infinity'::numeric),
  display_scope text not null default 'blended_general_estimate' check (display_scope = 'blended_general_estimate'),
  source_created_at timestamptz not null,
  stale_after timestamptz not null,
  recorded_at timestamptz not null default now(),
  check (stale_after >= source_created_at),
  check (exchange_rate_at <= recorded_at + interval '5 minutes')
);
create index cardmarket_blended_price_fresh_idx on market.cardmarket_blended_general_prices(stale_after, source_created_at desc);
create index cardmarket_blended_price_catalogue_version_idx on market.cardmarket_blended_general_prices(catalogue_version_id);
create index cardmarket_blended_price_guide_revision_idx on market.cardmarket_blended_general_prices(price_guide_revision_id);
create index cardmarket_blended_product_revision_idx on market.cardmarket_blended_general_prices(product_catalogue_revision_id);

create table market.cardmarket_mapping_repairs (
  repair_key text primary key,
  provider_category_id integer,
  provider_product_id bigint,
  printing_id uuid references catalog.card_printings(id) on delete cascade,
  reason text not null check (reason in ('missing_exact_mapping','ambiguous_provider_mapping','mapping_missing_language_variant_finish_evidence','duplicate_canonical_target','missing_price_guide_row','no_market_guide_value','provider_category_mismatch')),
  detail jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index cardmarket_mapping_repairs_open_idx on market.cardmarket_mapping_repairs(last_seen_at, provider_category_id, provider_product_id) where status = 'open';
create index cardmarket_mapping_repairs_printing_idx on market.cardmarket_mapping_repairs(printing_id) where printing_id is not null;

create table market.cardmarket_mapping_reviews (
  id bigint generated always as identity primary key,
  printing_id uuid not null references catalog.card_printings(id) on delete cascade,
  provider_category_id integer not null,
  provider_product_id bigint not null,
  action text not null check (action in ('reviewed_exact','replaced','removed')),
  review_reference text not null,
  payload jsonb not null,
  reviewed_at timestamptz not null default now()
);
create index cardmarket_mapping_reviews_printing_idx on market.cardmarket_mapping_reviews(printing_id, reviewed_at desc);

-- Prevent an old blended quote from being relabelled after any reviewed map change.
create function api.invalidate_cardmarket_blended_price_mapping() returns trigger
language plpgsql security invoker set search_path = '' as $function$
begin
  delete from market.cardmarket_blended_general_prices where printing_id = old.printing_id;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;
create trigger cardmarket_mapping_price_invalidation
before update or delete on market.cardmarket_printing_mappings
for each row execute function api.invalidate_cardmarket_blended_price_mapping();

-- The review record is append-only and also captures direct service-role corrections.
create function api.audit_cardmarket_printing_mapping() returns trigger
language plpgsql security invoker set search_path = '' as $function$
declare mapped market.cardmarket_printing_mappings; action_name text;
begin
  mapped := case when tg_op = 'DELETE' then old else new end;
  action_name := case tg_op when 'INSERT' then 'reviewed_exact' when 'UPDATE' then 'replaced' else 'removed' end;
  insert into market.cardmarket_mapping_reviews(printing_id,provider_category_id,provider_product_id,action,review_reference,payload)
  values(mapped.printing_id,mapped.provider_category_id,mapped.provider_product_id,action_name,mapped.review_reference,to_jsonb(mapped));
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;
create trigger cardmarket_mapping_append_only_audit
after insert or update or delete on market.cardmarket_printing_mappings
for each row execute function api.audit_cardmarket_printing_mapping();

alter table market.cardmarket_public_feed_revisions enable row level security;
alter table market.cardmarket_public_feed_leases enable row level security;
alter table market.cardmarket_printing_mappings enable row level security;
alter table market.cardmarket_blended_general_prices enable row level security;
alter table market.cardmarket_mapping_repairs enable row level security;
alter table market.cardmarket_mapping_reviews enable row level security;
create policy "service manages Cardmarket feeds" on market.cardmarket_public_feed_revisions for all to service_role using (true) with check (true);
create policy "service manages Cardmarket feed leases" on market.cardmarket_public_feed_leases for all to service_role using (true) with check (true);
create policy "service manages Cardmarket mappings" on market.cardmarket_printing_mappings for all to service_role using (true) with check (true);
create policy "service manages Cardmarket blended prices" on market.cardmarket_blended_general_prices for all to service_role using (true) with check (true);
create policy "service manages Cardmarket repairs" on market.cardmarket_mapping_repairs for all to service_role using (true) with check (true);
create policy "service manages Cardmarket mapping reviews" on market.cardmarket_mapping_reviews for all to service_role using (true) with check (true);
revoke all on market.cardmarket_public_feed_revisions, market.cardmarket_public_feed_leases, market.cardmarket_printing_mappings, market.cardmarket_blended_general_prices, market.cardmarket_mapping_repairs, market.cardmarket_mapping_reviews from public, anon, authenticated;
grant select, insert, update, delete on market.cardmarket_public_feed_revisions, market.cardmarket_public_feed_leases, market.cardmarket_printing_mappings, market.cardmarket_blended_general_prices, market.cardmarket_mapping_repairs to service_role;
grant select, insert on market.cardmarket_mapping_reviews to service_role;
grant usage, select on sequence market.cardmarket_mapping_reviews_id_seq to service_role;

create function api.claim_cardmarket_public_feed(p_kind text) returns uuid
language plpgsql security invoker set search_path = '' as $function$
declare token uuid;
begin
  if p_kind not in ('products','price_guide') then raise exception 'invalid Cardmarket feed'; end if;
  insert into market.cardmarket_public_feed_leases(feed_kind) values(p_kind) on conflict do nothing;
  perform 1 from market.cardmarket_public_feed_leases where feed_kind = p_kind for update;
  if exists(select 1 from market.cardmarket_public_feed_leases where feed_kind = p_kind and ((last_succeeded_at > now() - interval '24 hours') or (lease_until > now()) or (retry_after > now()))) then return null; end if;
  token := gen_random_uuid();
  update market.cardmarket_public_feed_leases set lease_token = token, lease_until = now() + interval '15 minutes' where feed_kind = p_kind;
  return token;
end;
$function$;

create function api.finish_cardmarket_public_feed(p_kind text,p_token uuid,p_source_created_at timestamptz,p_etag text,p_sha256 text,p_byte_length bigint,p_source_url text,p_retry_seconds integer default 0)
returns uuid language plpgsql security invoker set search_path = '' as $function$
declare revision_id uuid;
begin
  if p_kind not in ('products','price_guide') or p_retry_seconds not between 0 and 86400 then raise exception 'invalid Cardmarket feed completion'; end if;
  if p_source_created_at is null or p_source_created_at > now() + interval '5 minutes' or p_sha256 !~ '^[a-f0-9]{64}$' or p_byte_length not between 1 and 33554432 then raise exception 'invalid Cardmarket feed metadata'; end if;
  if (p_kind = 'products' and p_source_url <> 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json') or (p_kind = 'price_guide' and p_source_url <> 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json') then raise exception 'invalid Cardmarket source URL'; end if;
  if not exists(select 1 from market.cardmarket_public_feed_leases where feed_kind=p_kind and lease_token=p_token and lease_until > now()) then raise exception 'invalid Cardmarket feed lease'; end if;
  insert into market.cardmarket_public_feed_revisions(feed_kind,source_url,source_created_at,etag,sha256,byte_length)
  values(p_kind,p_source_url,p_source_created_at,nullif(btrim(p_etag),''),p_sha256,p_byte_length)
  on conflict(feed_kind,sha256) do update set retrieved_at=now(), etag=excluded.etag
  returning id into revision_id;
  update market.cardmarket_public_feed_leases set last_succeeded_at=now(),lease_token=null,lease_until=null,retry_after=case when p_retry_seconds > 0 then now()+make_interval(secs=>p_retry_seconds) else null end where feed_kind=p_kind;
  return revision_id;
end;
$function$;

create function api.fail_cardmarket_public_feed(p_kind text,p_token uuid,p_retry_seconds integer default 3600) returns boolean
language plpgsql security invoker set search_path = '' as $function$
begin
  if p_kind not in ('products','price_guide') or p_retry_seconds not between 1 and 86400 then raise exception 'invalid Cardmarket feed failure'; end if;
  update market.cardmarket_public_feed_leases set lease_token=null,lease_until=null,retry_after=now()+make_interval(secs=>p_retry_seconds) where feed_kind=p_kind and lease_token=p_token and lease_until>now();
  return found;
end;
$function$;

create function api.review_cardmarket_printing_mapping(p_mapping jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $function$
declare prior market.cardmarket_printing_mappings; pid uuid; category integer; product bigint; version_id uuid;
begin
  if jsonb_typeof(p_mapping) <> 'object' or p_mapping ?| array['variantId','condition','grade','price','currency'] or p_mapping->>'method' <> 'reviewed_exact'
    or (p_mapping->>'printingId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (p_mapping->>'catalogueVersionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (p_mapping->>'providerCategoryId') !~ '^[1-9][0-9]*$' or (p_mapping->>'providerProductId') !~ '^[1-9][0-9]*$'
    or jsonb_typeof(p_mapping->'languageEvidence') <> 'object' or p_mapping->'languageEvidence'='{}'::jsonb
    or jsonb_typeof(p_mapping->'variantEvidence') <> 'object' or p_mapping->'variantEvidence'='{}'::jsonb
    or jsonb_typeof(p_mapping->'finishEvidence') <> 'object' or p_mapping->'finishEvidence'='{}'::jsonb
    or length(btrim(p_mapping->>'reviewReference')) not between 5 and 1000 then raise exception 'invalid reviewed Cardmarket mapping'; end if;
  pid := (p_mapping->>'printingId')::uuid; category := (p_mapping->>'providerCategoryId')::integer; product := (p_mapping->>'providerProductId')::bigint; version_id := (p_mapping->>'catalogueVersionId')::uuid;
  select * into prior from market.cardmarket_printing_mappings where printing_id=pid;
  insert into market.cardmarket_printing_mappings(printing_id,catalogue_version_id,provider_category_id,provider_product_id,method,language_evidence,variant_evidence,finish_evidence,review_reference)
  values(pid,version_id,category,product,'reviewed_exact',p_mapping->'languageEvidence',p_mapping->'variantEvidence',p_mapping->'finishEvidence',btrim(p_mapping->>'reviewReference'))
  on conflict(printing_id) do update set catalogue_version_id=excluded.catalogue_version_id,provider_category_id=excluded.provider_category_id,provider_product_id=excluded.provider_product_id,language_evidence=excluded.language_evidence,variant_evidence=excluded.variant_evidence,finish_evidence=excluded.finish_evidence,review_reference=excluded.review_reference,reviewed_at=now();
  update market.cardmarket_mapping_repairs set status='resolved',last_seen_at=now() where provider_category_id=category and provider_product_id=product;
  return true;
end;
$function$;

create function api.queue_cardmarket_mapping_repairs(p_repairs jsonb) returns integer
language plpgsql security invoker set search_path = '' as $function$
declare item jsonb; n integer := 0; key text;
begin
  if jsonb_typeof(p_repairs) <> 'array' or jsonb_array_length(p_repairs) not between 1 and 500 then raise exception 'invalid Cardmarket repairs'; end if;
  for item in select value from jsonb_array_elements(p_repairs) loop
    if (item->>'providerCategoryId') !~ '^[1-9][0-9]*$' or (item->>'providerProductId') !~ '^[1-9][0-9]*$' or item->>'reason' not in ('missing_exact_mapping','ambiguous_provider_mapping','mapping_missing_language_variant_finish_evidence','duplicate_canonical_target','missing_price_guide_row','no_market_guide_value','provider_category_mismatch') then raise exception 'invalid Cardmarket repair'; end if;
    key := 'cardmarket:'||(item->>'providerCategoryId')||':'||(item->>'providerProductId');
    insert into market.cardmarket_mapping_repairs(repair_key,provider_category_id,provider_product_id,printing_id,reason,detail)
    values(key,(item->>'providerCategoryId')::integer,(item->>'providerProductId')::bigint,case when (item->>'printingId') ~* '^[0-9a-f]{8}-' then (item->>'printingId')::uuid end,item->>'reason',coalesce(item->'detail','{}'::jsonb))
    on conflict(repair_key) do update set reason=excluded.reason,detail=excluded.detail,status='open',last_seen_at=now(); n := n + 1;
  end loop;
  return n;
end;
$function$;

create function api.store_cardmarket_blended_general_prices(p_price_guide_revision uuid,p_product_catalogue_revision uuid,p_results jsonb) returns integer
language plpgsql security invoker set search_path = '' as $function$
declare item jsonb; mapping market.cardmarket_printing_mappings; price_revision market.cardmarket_public_feed_revisions; product_revision market.cardmarket_public_feed_revisions; n integer := 0; input_price numeric;
begin
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) not between 1 and 500 then raise exception 'invalid Cardmarket price results'; end if;
  select * into price_revision from market.cardmarket_public_feed_revisions where id=p_price_guide_revision and feed_kind='price_guide';
  select * into product_revision from market.cardmarket_public_feed_revisions where id=p_product_catalogue_revision and feed_kind='products';
  if price_revision.id is null or product_revision.id is null then raise exception 'invalid Cardmarket feed revisions'; end if;
  for item in select value from jsonb_array_elements(p_results) loop
    if item ?| array['variantId','condition','grade','finish','holdingId','currency'] or (item->>'printingId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (item->>'catalogueVersionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (item->>'providerCategoryId') !~ '^[1-9][0-9]*$' or (item->>'providerProductId') !~ '^[1-9][0-9]*$'
      or item->>'selectedField' not in ('trend','avg30','avg') or (item->>'price') !~ '^[0-9]+(\.[0-9]+)?$'
      or (item->>'exchangeRate') !~ '^[0-9]+(\.[0-9]+)?$' or (item->>'exchangeRateAt') is null or length(btrim(item->>'exchangeRateSource')) < 1 then raise exception 'invalid Cardmarket blended price'; end if;
    input_price := (item->>'price')::numeric;
    if input_price >= 'Infinity'::numeric or (item->>'exchangeRate')::numeric >= 'Infinity'::numeric or (item->>'exchangeRate')::numeric <= 0 or (item->>'exchangeRateAt')::timestamptz > now() or (item->>'exchangeRateAt')::timestamptz < now()-interval '7 days' then raise exception 'invalid Cardmarket FX evidence'; end if;
    select * into mapping from market.cardmarket_printing_mappings where printing_id=(item->>'printingId')::uuid and catalogue_version_id=(item->>'catalogueVersionId')::uuid and provider_category_id=(item->>'providerCategoryId')::integer and provider_product_id=(item->>'providerProductId')::bigint;
    if not found then raise exception 'unreviewed Cardmarket mapping'; end if;
    insert into market.cardmarket_blended_general_prices(printing_id,catalogue_version_id,price_guide_revision_id,product_catalogue_revision_id,original_price,original_currency,selected_field,exchange_rate,exchange_rate_at,exchange_rate_source,central_estimate_gbp,source_created_at,stale_after)
    values(mapping.printing_id,mapping.catalogue_version_id,price_revision.id,product_revision.id,input_price,'EUR',item->>'selectedField',(item->>'exchangeRate')::numeric,(item->>'exchangeRateAt')::timestamptz,btrim(item->>'exchangeRateSource'),round(input_price*(item->>'exchangeRate')::numeric,2),price_revision.source_created_at,price_revision.source_created_at+interval '48 hours')
    on conflict(printing_id) do update set catalogue_version_id=excluded.catalogue_version_id,price_guide_revision_id=excluded.price_guide_revision_id,product_catalogue_revision_id=excluded.product_catalogue_revision_id,original_price=excluded.original_price,selected_field=excluded.selected_field,exchange_rate=excluded.exchange_rate,exchange_rate_at=excluded.exchange_rate_at,exchange_rate_source=excluded.exchange_rate_source,central_estimate_gbp=excluded.central_estimate_gbp,source_created_at=excluded.source_created_at,stale_after=excluded.stale_after,recorded_at=now()
    where excluded.source_created_at >= market.cardmarket_blended_general_prices.source_created_at;
    n := n + 1;
  end loop;
  return n;
end;
$function$;

create function api.read_cardmarket_blended_general_prices(p_printing_ids uuid[]) returns table(printing_id uuid, quote jsonb)
language plpgsql stable security invoker set search_path = '' as $function$
begin
  if coalesce(array_length(p_printing_ids,1),0) not between 1 and 100 then raise exception 'invalid Cardmarket printing references' using errcode='22023'; end if;
  return query select p.printing_id,jsonb_build_object('provider','cardmarket_public','priceScope','blended_general_estimate','currency','GBP','centralEstimate',p.central_estimate_gbp,'originalCurrency',p.original_currency,'originalPrice',p.original_price,'exchangeRate',p.exchange_rate,'exchangeRateAt',p.exchange_rate_at,'exchangeRateSource',p.exchange_rate_source,'selectedField',p.selected_field,'sourceCreatedAt',p.source_created_at,'staleAfter',p.stale_after,'freshness',case when p.stale_after <= now() then 'stale' else 'fresh' end,'providerCategoryId',m.provider_category_id,'providerProductId',m.provider_product_id,'language',null,'condition',null,'finish',null,'grade',null,'usableForExactVariant',false,'usableForHoldingsValuation',false)
  from market.cardmarket_blended_general_prices p join market.cardmarket_printing_mappings m on m.printing_id=p.printing_id
  where p.printing_id = any(p_printing_ids);
end;
$function$;

revoke all on function api.claim_cardmarket_public_feed(text), api.finish_cardmarket_public_feed(text,uuid,timestamptz,text,text,bigint,text,integer), api.fail_cardmarket_public_feed(text,uuid,integer), api.review_cardmarket_printing_mapping(jsonb), api.queue_cardmarket_mapping_repairs(jsonb), api.store_cardmarket_blended_general_prices(uuid,uuid,jsonb), api.read_cardmarket_blended_general_prices(uuid[]) from public, anon, authenticated;
grant execute on function api.claim_cardmarket_public_feed(text), api.finish_cardmarket_public_feed(text,uuid,timestamptz,text,text,bigint,text,integer), api.fail_cardmarket_public_feed(text,uuid,integer), api.review_cardmarket_printing_mapping(jsonb), api.queue_cardmarket_mapping_repairs(jsonb), api.store_cardmarket_blended_general_prices(uuid,uuid,jsonb), api.read_cardmarket_blended_general_prices(uuid[]) to service_role;
comment on function api.read_cardmarket_blended_general_prices(uuid[]) is 'Service-only GBP-converted public Cardmarket guide estimates retaining EUR and FX provenance attached to reviewed printings. Blended across unproven language/condition/finish; never exact or holdings valuation.';





