-- The sweep hot path must not expand api.catalogue_cards for every provider
-- page (or once per stored result).  These helpers use the publication
-- membership and canonical rows directly, and verify every denormalised
-- membership value before returning it.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists catalogue_version_variants_price_identity_idx
  on catalog.catalogue_version_variants(catalogue_version_id, language_code, set_id, variant_id)
  include (printing_id);

create function api.published_catalogue_price_identity(p_variant uuid, p_catalogue_version uuid)
returns table(
  variant_id uuid, printing_id uuid, set_id uuid, language_code text,
  catalogue_version_id uuid, collector_number text, variant_code text,
  finish_code text, card_english_display_name text, card_native_name text
)
language sql stable security invoker set search_path='' as $function$
  select v.id, p.id, p.set_id, v.language_code, cv.id, p.collector_number,
    v.variant_code, v.finish_code, p.english_display_name, p.native_name
  from catalog.catalogue_version_variants cvv
  join catalog.catalogue_versions cv on cv.id=cvv.catalogue_version_id
    and cv.id=p_catalogue_version and cv.status='published'
    and cv.deprecated_at is null and cv.language_code=cvv.language_code
    and cv.id=(select current_version.id from catalog.catalogue_versions current_version
      where current_version.language_code=cv.language_code and current_version.status='published'
        and current_version.deprecated_at is null
      order by current_version.published_at desc nulls last,current_version.created_at desc,current_version.id desc limit 1)
  join catalog.card_variants v on v.id=cvv.variant_id and v.id=p_variant
    and v.deprecated_at is null and v.language_code=cvv.language_code
  join catalog.card_printings p on p.id=v.printing_id and p.deprecated_at is null
    and p.id=cvv.printing_id and p.set_id=cvv.set_id and p.language_code=v.language_code
  join catalog.sets s on s.id=p.set_id and s.deprecated_at is null
  join catalog.languages l on l.code=v.language_code;
$function$;

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
      and p.set_id=cvv.set_id and p.language_code=cvv.language_code
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
    'provider_mapping',case when m.variant_id is not null then to_jsonb(m) end
  )
  from published c
  left join market.catalogue_provider_cards m on m.variant_id=c.variant_id
    and m.printing_id=c.printing_id and m.set_id=c.set_id and m.language_code=c.language_code
    and m.category_id=c.category_id and m.group_id=c.group_id
    and m.subtype=api.catalogue_provider_subtype(c.variant_code,c.finish_code)
  order by c.variant_id
  limit greatest(1,least(coalesce(p_limit,500),500));
$function$;

-- Store validation is deliberately still strict.  Only the current published
-- canonical identity lookup changes; the provider product, finish, title,
-- collector and collision checks below remain the write boundary.
create or replace function api.store_catalogue_bulk_prices(p_results jsonb) returns integer
language plpgsql security invoker set search_path='' as $function$
declare item jsonb; c record; q jsonb; m jsonb; wanted_subtype text; mapped market.catalogue_provider_cards; product jsonb; n integer=0;
begin
 if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) not between 1 and 500 then raise exception 'invalid price results'; end if;
 -- Candidate reads materialize this guard once.  Store is also an RPC write
 -- boundary, so it repeats the check once per submitted exact-title group
 -- before the loop can change mappings, quotes, outcomes, or repairs.
 if exists(
   with exact_title_groups as (
     select distinct s.group_id,s.set_id
     from jsonb_array_elements(p_results) input_row
     join lateral api.published_catalogue_price_identity(
       (input_row->>'variantId')::uuid,(input_row->>'catalogueVersionId')::uuid
     ) identity_row on true
     join market.catalogue_provider_set_members s
       on s.category_id=(input_row->'mapping'->>'categoryId')::integer
      and s.group_id=(input_row->'mapping'->>'groupId')::bigint
      and s.set_id=identity_row.set_id and s.language_code=identity_row.language_code
     where input_row->'mapping' is not null and input_row->'mapping'<>'null'::jsonb
       and s.category_id=3 and s.method='exact_set_title'
   ) select 1 from exact_title_groups where not api.english_exact_price_set_is_current(group_id,set_id)
 ) then raise exception 'exact title set identity changed'; end if;
 for item in select * from jsonb_array_elements(p_results) loop
   select * into c from api.published_catalogue_price_identity((item->>'variantId')::uuid,(item->>'catalogueVersionId')::uuid);
   if not found then raise exception 'catalogue revision changed'; end if;
   if item->>'reason' not in ('priced','no_provider_quote','unresolved_provider_identity','ambiguous_provider_identity','unsupported_provider_language','unsupported_provider_finish','provider_backoff')
     or (item->>'nextRetryAt')::timestamptz<now() then raise exception 'invalid price outcome'; end if;
   wanted_subtype=api.catalogue_provider_subtype(c.variant_code,c.finish_code); q=item->'quote'; m=item->'mapping';
   if m is not null and m<>'null'::jsonb then
     if wanted_subtype is null or m->>'subtype' is distinct from wanted_subtype or not ((m->>'categoryId'='3' and c.language_code='en') or (m->>'categoryId'='85' and c.language_code='ja'))
       or m->>'method' not in ('exact_name_number','exact_set_code_number','reviewed') or not exists(select 1 from market.catalogue_provider_set_members s
         where s.category_id=(m->>'categoryId')::integer and s.group_id=(m->>'groupId')::bigint and s.set_id=c.set_id and s.language_code=c.language_code)
       then raise exception 'invalid provider mapping'; end if;
     if m->>'method'='exact_set_code_number' and (
       c.language_code<>'ja' or m->>'categoryId'<>'85' or not api.japanese_exact_price_set_is_current((m->>'groupId')::bigint,c.set_id)
       or length(split_part(api.normalized_price_collector(c.collector_number),'/',1))=0
       or not exists(select 1 from market.catalogue_provider_set_members s where s.category_id=85 and s.group_id=(m->>'groupId')::bigint and s.set_id=c.set_id and s.language_code='ja' and s.method='exact_set_code')
       or (select count(distinct p.id) from catalog.card_printings p where p.set_id=c.set_id and p.language_code='ja' and p.deprecated_at is null and split_part(api.normalized_price_collector(p.collector_number),'/',1)=split_part(api.normalized_price_collector(c.collector_number),'/',1))<>1
       or (select count(distinct value->>'productId') from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') value
         where f.feed_key='tcgplayer/85/'||(m->>'groupId')||'/products' and value->>'categoryId'='85' and value->>'groupId'=m->>'groupId' and coalesce(value->'presaleInfo'->>'isPresale','false')<>'true'
           and exists(select 1 from jsonb_array_elements(value->'extendedData') field where lower(field->>'name')='number' and split_part(api.normalized_price_collector(field->>'value'),'/',1)=split_part(api.normalized_price_collector(c.collector_number),'/',1)))<>1
     ) then raise exception 'invalid exact-code product identity'; end if;
     select value into product from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') value
       where f.feed_key='tcgplayer/'||(m->>'categoryId')||'/'||(m->>'groupId')||'/products' and value->>'productId'=m->>'productId' and value->>'categoryId'=m->>'categoryId' and value->>'groupId'=m->>'groupId';
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
     if not exists(select 1 from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') evidence where f.feed_key='tcgplayer/'||(m->>'categoryId')||'/'||(m->>'groupId')||'/prices' and f.dataset_at=(q->>'datasetAt')::timestamptz and evidence->>'productId'=m->>'productId' and evidence->>'subTypeName'=wanted_subtype and (evidence->>'marketPrice')::numeric=(q->>'price')::numeric) or not exists(select 1 from market.catalogue_bulk_feeds f where f.feed_key='tcgplayer/'||(m->>'categoryId')||'/'||(m->>'groupId')||'/products' and f.dataset_at=(q->>'datasetAt')::timestamptz) then raise exception 'quote does not match stored provider build'; end if;
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

revoke all on function api.published_catalogue_price_identity(uuid,uuid) from public,anon,authenticated;
grant execute on function api.published_catalogue_price_identity(uuid,uuid) to service_role;
