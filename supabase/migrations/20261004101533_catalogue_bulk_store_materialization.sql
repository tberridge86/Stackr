-- Materialize the bounded request's current identities and retained provider evidence once.
-- No permanent projection or new pricing identity is introduced.
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function api.store_catalogue_bulk_prices(p_results jsonb) returns integer
language plpgsql security invoker set search_path='' as $function$
declare item jsonb; c record; q jsonb; m jsonb; wanted_subtype text; mapped market.catalogue_provider_cards; product jsonb; identities_cache jsonb; product_cache jsonb; collector_counts jsonb; canonical_collector_counts jsonb; japanese_set_current jsonb; price_cache jsonb; product_datasets jsonb; n integer=0;
begin
 if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) not between 1 and 500 then raise exception 'invalid price results'; end if;
 -- Materialize publication membership and retained evidence once per bounded
 -- request. The loop below keeps the same strict write checks without
 -- repeatedly decompressing the provider feed or scanning catalogue versions.
 with wanted as materialized (
   select distinct (value->>'variantId')::uuid variant_id,(value->>'catalogueVersionId')::uuid catalogue_version_id
   from jsonb_array_elements(p_results)
 ), current_versions as materialized (
   select distinct on(cv.language_code) cv.id,cv.language_code
   from catalog.catalogue_versions cv where cv.status='published' and cv.deprecated_at is null
   order by cv.language_code,cv.published_at desc nulls last,cv.created_at desc,cv.id desc
 ), published as materialized (
   select v.id variant_id,p.id printing_id,p.set_id,v.language_code,cv.id catalogue_version_id,
     p.collector_number,v.variant_code,v.finish_code,p.english_display_name card_english_display_name,p.native_name card_native_name
   from wanted w join catalog.catalogue_version_variants cvv on cvv.variant_id=w.variant_id and cvv.catalogue_version_id=w.catalogue_version_id
   join current_versions cv on cv.id=cvv.catalogue_version_id and cv.language_code=cvv.language_code
   join catalog.card_variants v on v.id=cvv.variant_id and v.deprecated_at is null and v.language_code=cvv.language_code
   join catalog.card_printings p on p.id=v.printing_id and p.deprecated_at is null and p.id=cvv.printing_id and p.set_id=cvv.set_id and p.language_code=v.language_code
   join catalog.sets s on s.id=p.set_id and s.deprecated_at is null
   join catalog.languages l on l.code=v.language_code
 ) select coalesce(jsonb_object_agg(p.variant_id::text||':'||p.catalogue_version_id::text,to_jsonb(p)),'{}'::jsonb) into identities_cache from published p;

 with wanted as materialized (
   select distinct input_row->'mapping'->>'groupId' group_id,identity_row.set_id
   from jsonb_array_elements(p_results) input_row
   cross join lateral jsonb_to_record(identities_cache->((input_row->>'variantId')::uuid::text||':'||(input_row->>'catalogueVersionId')::uuid::text)) as identity_row(set_id uuid,language_code text)
   where input_row->'mapping'->>'method'='exact_set_code_number' and identity_row.language_code='ja'
 ), counts as (
   select p.set_id,split_part(api.normalized_price_collector(p.collector_number),'/',1) base,count(distinct p.id) n
   from (select distinct set_id from wanted) w join catalog.card_printings p on p.set_id=w.set_id
   where p.language_code='ja' and p.deprecated_at is null group by p.set_id,2
 ) select
   coalesce((select jsonb_object_agg(w.group_id||':'||w.set_id::text,api.japanese_exact_price_set_is_current(w.group_id::bigint,w.set_id)) from wanted w),'{}'::jsonb),
   coalesce((select jsonb_object_agg(cc.set_id::text||':'||cc.base,cc.n) from counts cc),'{}'::jsonb)
 into japanese_set_current,canonical_collector_counts;

 with wanted as materialized (
   select distinct 'tcgplayer/'||(value->'mapping'->>'categoryId')||'/'||(value->'mapping'->>'groupId')||'/products' feed_key
   from jsonb_array_elements(p_results) where value->'mapping' is not null and value->'mapping'<>'null'::jsonb
 ), feeds as materialized (
   select f.feed_key,f.dataset_at,f.payload from wanted w join market.catalogue_bulk_feeds f on f.feed_key=w.feed_key
 ), products as materialized (
   select f.feed_key,f.dataset_at,e.value,e.ordinality,
     coalesce((select array_agg(distinct split_part(api.normalized_price_collector(field->>'value'),'/',1))
       from jsonb_array_elements(e.value->'extendedData') field where lower(field->>'name')='number'),'{}'::text[]) collector_bases
   from feeds f cross join lateral jsonb_array_elements(f.payload->'results') with ordinality e(value,ordinality)
   where e.value->>'categoryId'=split_part(f.feed_key,'/',2) and e.value->>'groupId'=split_part(f.feed_key,'/',3)
 ), counts as (
   select p.feed_key,base,count(distinct p.value->>'productId') n from products p cross join lateral unnest(p.collector_bases) base
   where coalesce(p.value->'presaleInfo'->>'isPresale','false')<>'true' group by p.feed_key,base
 ) select
   coalesce((select jsonb_object_agg(p.feed_key||':'||(p.value->>'productId'),p.value order by p.ordinality desc) from products p where p.value->>'productId' is not null),'{}'::jsonb),
   coalesce((select jsonb_object_agg(cc.feed_key||':'||cc.base,cc.n) from counts cc),'{}'::jsonb),
   coalesce((select jsonb_object_agg(f.feed_key,f.dataset_at) from feeds f),'{}'::jsonb)
 into product_cache,collector_counts,product_datasets;

 with wanted as materialized (
   select distinct 'tcgplayer/'||(value->'mapping'->>'categoryId')||'/'||(value->'mapping'->>'groupId')||'/prices' feed_key
   from jsonb_array_elements(p_results) where value->'mapping' is not null and value->'mapping'<>'null'::jsonb
 ), evidence as materialized (
   select f.feed_key,f.dataset_at,e.value from wanted w join market.catalogue_bulk_feeds f on f.feed_key=w.feed_key
   cross join lateral jsonb_array_elements(f.payload->'results') e(value)
   where e.value->>'productId' is not null and e.value->>'subTypeName' is not null
 ), grouped as (
   select e.feed_key||':'||(e.value->>'productId')||':'||(e.value->>'subTypeName') evidence_key,
     jsonb_agg(jsonb_build_object('dataset_at',e.dataset_at,'market_price',e.value->'marketPrice')) values
   from evidence e group by 1
 ) select coalesce(jsonb_object_agg(g.evidence_key,g.values),'{}'::jsonb) into price_cache from grouped g;

 -- Candidate reads materialize this guard once.  Store is also an RPC write
 -- boundary, so it repeats the check once per submitted exact-title group
 -- before the loop can change mappings, quotes, outcomes, or repairs.
 if exists(
   with exact_title_groups as (
     select distinct s.group_id,s.set_id
     from jsonb_array_elements(p_results) input_row
     join lateral jsonb_to_record(identities_cache->((input_row->>'variantId')::uuid::text||':'||(input_row->>'catalogueVersionId')::uuid::text))
       as identity_row(set_id uuid,language_code text) on true
     join market.catalogue_provider_set_members s
       on s.category_id=(input_row->'mapping'->>'categoryId')::integer
      and s.group_id=(input_row->'mapping'->>'groupId')::bigint
      and s.set_id=identity_row.set_id and s.language_code=identity_row.language_code
     where input_row->'mapping' is not null and input_row->'mapping'<>'null'::jsonb
       and s.category_id=3 and s.method='exact_set_title'
   ) select 1 from exact_title_groups where not api.english_exact_price_set_is_current(group_id,set_id)
 ) then raise exception 'exact title set identity changed'; end if;
 for item in select * from jsonb_array_elements(p_results) loop
   if not identities_cache ? ((item->>'variantId')::uuid::text||':'||(item->>'catalogueVersionId')::uuid::text) then raise exception 'catalogue revision changed'; end if;
   select * into c from jsonb_to_record(identities_cache->((item->>'variantId')::uuid::text||':'||(item->>'catalogueVersionId')::uuid::text))
     as identity_row(variant_id uuid,printing_id uuid,set_id uuid,language_code text,catalogue_version_id uuid,
       collector_number text,variant_code text,finish_code text,card_english_display_name text,card_native_name text);
   if item->>'reason' not in ('priced','no_provider_quote','unresolved_provider_identity','ambiguous_provider_identity','unsupported_provider_language','unsupported_provider_finish','provider_backoff')
     or (item->>'nextRetryAt')::timestamptz<now() then raise exception 'invalid price outcome'; end if;
   wanted_subtype=api.catalogue_provider_subtype(c.variant_code,c.finish_code); q=item->'quote'; m=item->'mapping';
   if m is not null and m<>'null'::jsonb then
     if wanted_subtype is null or m->>'subtype' is distinct from wanted_subtype or not ((m->>'categoryId'='3' and c.language_code='en') or (m->>'categoryId'='85' and c.language_code='ja'))
       or m->>'method' not in ('exact_name_number','exact_set_code_number','reviewed') or not exists(select 1 from market.catalogue_provider_set_members s
         where s.category_id=(m->>'categoryId')::integer and s.group_id=(m->>'groupId')::bigint and s.set_id=c.set_id and s.language_code=c.language_code)
       then raise exception 'invalid provider mapping'; end if;
     if m->>'method'='exact_set_code_number' and (
       c.language_code<>'ja' or m->>'categoryId'<>'85' or not coalesce((japanese_set_current->>((m->>'groupId')||':'||c.set_id::text))::boolean,false)
       or length(split_part(api.normalized_price_collector(c.collector_number),'/',1))=0
       or not exists(select 1 from market.catalogue_provider_set_members s where s.category_id=85 and s.group_id=(m->>'groupId')::bigint and s.set_id=c.set_id and s.language_code='ja' and s.method='exact_set_code')
       or coalesce((canonical_collector_counts->>(c.set_id::text||':'||split_part(api.normalized_price_collector(c.collector_number),'/',1)))::bigint,0)<>1
       or coalesce((collector_counts->>('tcgplayer/85/'||(m->>'groupId')||'/products:'||split_part(api.normalized_price_collector(c.collector_number),'/',1)))::bigint,0)<>1
     ) then raise exception 'invalid exact-code product identity'; end if;
     product=product_cache->('tcgplayer/'||(m->>'categoryId')||'/'||(m->>'groupId')||'/products:'||(m->>'productId'));
     if product is null or coalesce(product->'presaleInfo'->>'isPresale','false')='true'
       or not exists(select 1 from jsonb_array_elements(product->'extendedData') field where lower(field->>'name')='number' and split_part(api.normalized_price_collector(field->>'value'),'/',1)=split_part(api.normalized_price_collector(c.collector_number),'/',1))
       or (m->>'method'='exact_name_number' and api.catalogue_provider_name(product->>'name') is distinct from api.catalogue_provider_name(coalesce(c.card_english_display_name,c.card_native_name)) and not exists(
         select 1 from market.catalogue_provider_cards existing where existing.variant_id=c.variant_id and existing.printing_id=c.printing_id and existing.set_id=c.set_id and existing.language_code=c.language_code and existing.category_id=(m->>'categoryId')::integer and existing.group_id=(m->>'groupId')::bigint and existing.product_id=(m->>'productId')::bigint and existing.subtype=wanted_subtype))
       then raise exception 'invalid provider product evidence'; end if;
     if exists(select 1 from market.catalogue_provider_cards where category_id=(m->>'categoryId')::integer and product_id=(m->>'productId')::bigint and catalogue_provider_cards.subtype=wanted_subtype and variant_id<>c.variant_id) then raise exception 'provider mapping collision'; end if;
     select * into mapped from market.catalogue_provider_cards where variant_id=c.variant_id;
     if found and (mapped.category_id<>(m->>'categoryId')::integer or mapped.group_id<>(m->>'groupId')::bigint or mapped.product_id<>(m->>'productId')::bigint or mapped.subtype<>wanted_subtype or mapped.printing_id<>c.printing_id or mapped.set_id<>c.set_id or mapped.language_code<>c.language_code) then raise exception 'permanent mapping requires review'; end if;
     if m->>'method'='reviewed' and (mapped.variant_id is null or mapped.method<>'reviewed') then raise exception 'reviewed mapping requires review record'; end if;
     insert into market.catalogue_provider_cards(variant_id,printing_id,set_id,catalogue_version_id,language_code,category_id,group_id,product_id,subtype,method)
       values(c.variant_id,c.printing_id,c.set_id,c.catalogue_version_id,c.language_code,(m->>'categoryId')::integer,(m->>'groupId')::bigint,(m->>'productId')::bigint,wanted_subtype,m->>'method')
       on conflict(variant_id) do update set catalogue_version_id=excluded.catalogue_version_id,verified_at=now();
   end if;
   if q is not null and q<>'null'::jsonb then
     if m is null or m='null'::jsonb or q->>'categoryId' is distinct from m->>'categoryId' or q->>'groupId' is distinct from m->>'groupId' or q->>'productId' is distinct from m->>'productId' or q->>'subtype' is distinct from wanted_subtype or q->>'currency'<>'USD' or (q->>'datasetAt')::timestamptz>now()+interval '5 minutes' or (q->>'exchangeRateAt')::timestamptz>now()+interval '5 minutes' or (q->>'exchangeRateAt')::timestamptz<now()-interval '7 days' or item->>'reason'<>'priced' then raise exception 'unsupported general quote'; end if;
     if not exists(select 1 from jsonb_array_elements(price_cache->('tcgplayer/'||(m->>'categoryId')||'/'||(m->>'groupId')||'/prices:'||(m->>'productId')||':'||wanted_subtype)) evidence
       where (evidence->>'dataset_at')::timestamptz=(q->>'datasetAt')::timestamptz and (evidence->>'market_price')::numeric=(q->>'price')::numeric)
       or (product_datasets->>('tcgplayer/'||(m->>'categoryId')||'/'||(m->>'groupId')||'/products'))::timestamptz is distinct from (q->>'datasetAt')::timestamptz then raise exception 'quote does not match stored provider build'; end if;
     insert into market.catalogue_general_prices(variant_id,printing_id,set_id,language_code,catalogue_version_id,provider,category_id,product_id,group_id,subtype,original_price,original_currency,exchange_rate,exchange_rate_at,exchange_rate_source,central_estimate,dataset_at,stale_after)
       values(c.variant_id,c.printing_id,c.set_id,c.language_code,c.catalogue_version_id,'tcgcsv',(q->>'categoryId')::integer,(q->>'productId')::bigint,(q->>'groupId')::bigint,wanted_subtype,(q->>'price')::numeric,'USD',(q->>'exchangeRate')::numeric,(q->>'exchangeRateAt')::timestamptz,q->>'exchangeRateSource',round((q->>'price')::numeric*(q->>'exchangeRate')::numeric,2),(q->>'datasetAt')::timestamptz,(q->>'datasetAt')::timestamptz+interval '48 hours')
       on conflict(variant_id) do update set catalogue_version_id=excluded.catalogue_version_id,category_id=excluded.category_id,product_id=excluded.product_id,group_id=excluded.group_id,subtype=excluded.subtype,original_price=excluded.original_price,exchange_rate=excluded.exchange_rate,exchange_rate_at=excluded.exchange_rate_at,exchange_rate_source=excluded.exchange_rate_source,central_estimate=excluded.central_estimate,dataset_at=excluded.dataset_at,stale_after=excluded.stale_after,recorded_at=now() where excluded.dataset_at>=market.catalogue_general_prices.dataset_at;
   elsif item->>'reason'='priced' then raise exception 'priced outcome requires quote'; end if;
   insert into market.catalogue_price_outcomes values(c.variant_id,c.catalogue_version_id,item->>'reason',now(),(item->>'nextRetryAt')::timestamptz,'tcgcsv') on conflict(variant_id) do update set catalogue_version_id=excluded.catalogue_version_id,reason=excluded.reason,checked_at=excluded.checked_at,next_retry_at=excluded.next_retry_at;
   if item->>'reason' in ('unresolved_provider_identity','ambiguous_provider_identity') then insert into market.catalogue_price_repairs(repair_key,variant_id,reason,detail) values('variant:'||c.variant_id,c.variant_id,item->>'reason',to_jsonb(c)) on conflict(repair_key) do update set reason=excluded.reason,detail=excluded.detail,status='open',last_seen_at=now();
   elsif m is not null and m<>'null'::jsonb then update market.catalogue_price_repairs set status='resolved',last_seen_at=now() where repair_key='variant:'||c.variant_id or repair_key='product:'||(m->>'categoryId')||':'||(m->>'productId'); end if;
   n=n+1;
 end loop;
 return n;
end;
$function$;

revoke all on function api.store_catalogue_bulk_prices(jsonb) from public,anon,authenticated;
grant execute on function api.store_catalogue_bulk_prices(jsonb) to service_role;
