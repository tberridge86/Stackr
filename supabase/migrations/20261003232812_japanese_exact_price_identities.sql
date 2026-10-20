-- Japanese provider identities share printed set codes and collector numbers.
-- Neither translated names nor runtime-only display maps are identity evidence.
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table market.catalogue_provider_sets drop constraint catalogue_provider_sets_method_check;
alter table market.catalogue_provider_sets add check(method in ('exact_set_name','exact_set_code','reviewed'));
alter table market.catalogue_provider_sets add check(method<>'exact_set_code' or category_id=85);
alter table market.catalogue_provider_set_members drop constraint catalogue_provider_set_members_method_check;
alter table market.catalogue_provider_set_members add check(method in ('exact_set_name','exact_set_code','reviewed'));
alter table market.catalogue_provider_set_members add check(method<>'exact_set_code' or category_id=85);
alter table market.catalogue_provider_cards drop constraint catalogue_provider_cards_method_check;
alter table market.catalogue_provider_cards add check(method in ('exact_name_number','exact_set_code_number','reviewed'));
alter table market.catalogue_provider_cards add check(method<>'exact_set_code_number' or category_id=85);

alter function api.resolve_catalogue_bulk_set(integer,bigint,text,text,text) rename to resolve_catalogue_bulk_set_by_name;
create function api.resolve_catalogue_bulk_set(p_category integer,p_group bigint,p_language text,p_name text,p_abbreviation text) returns jsonb
language plpgsql security invoker set search_path='' as $function$
declare code text; ids uuid[]; provider_count integer; exact_group boolean; previous_method text; previous_set uuid;
begin
 if p_category=85 and p_language='ja' and p_group>0 then
   select method,set_id into previous_method,previous_set from market.catalogue_provider_sets where category_id=85 and group_id=p_group;
   if previous_method is null or previous_method='exact_set_code' then
     code=lower(normalize(trim(coalesce(p_abbreviation,'')),NFKC));
     if code ~ '^[a-z0-9-]{1,32}$' then
       select count(distinct (g->>'groupId')::bigint),bool_or(g->>'groupId'=p_group::text) into provider_count,exact_group
       from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') g
       where f.feed_key='tcgplayer/85/groups' and lower(normalize(trim(coalesce(g->>'abbreviation','')),NFKC))=code;
       select array_agg(distinct s.set_id) into ids from api.catalogue_sets s where s.language_code='ja'
         and lower(normalize(trim(s.set_code),NFKC))=code;
       if provider_count=1 and exact_group is true and coalesce(array_length(ids,1),0)=1 and (previous_set is null or previous_set=ids[1]) then
         insert into market.catalogue_provider_sets values(85,p_group,'ja',ids[1],'exact_set_code','Unique exact provider abbreviation / published native set code',now())
           on conflict(category_id,group_id) do update set set_id=excluded.set_id,method=excluded.method,note=excluded.note,verified_at=now()
           where market.catalogue_provider_sets.method='exact_set_code';
         insert into market.catalogue_provider_set_members values(85,p_group,ids[1],'ja','exact_set_code','Unique exact provider abbreviation / published native set code',now())
           on conflict(category_id,group_id,set_id) do update set verified_at=now();
         update market.catalogue_price_repairs set status='resolved',last_seen_at=now() where repair_key='set:85:'||p_group or repair_key='catalogue-set:'||ids[1];
         return jsonb_build_object('status','mapped','setId',ids[1],'source','exact_set_code');
       end if;
       if provider_count>1 or coalesce(array_length(ids,1),0)>1 or previous_method='exact_set_code' then
         if previous_method='exact_set_code' then perform api.quarantine_japanese_exact_code_group(p_group); end if;
         insert into market.catalogue_price_repairs(repair_key,category_id,group_id,reason,detail)
           values('set:85:'||p_group,85,p_group,'ambiguous_provider_set',jsonb_build_object('code',code,'providerGroups',provider_count,'candidateSetIds',ids))
           on conflict(repair_key) do update set reason=excluded.reason,detail=excluded.detail,status='open',last_seen_at=now();
         return jsonb_build_object('status','ambiguous');
       end if;
     elsif previous_method='exact_set_code' then
       perform api.quarantine_japanese_exact_code_group(p_group);
       return jsonb_build_object('status','unmapped');
     end if;
   end if;
 end if;
 return api.resolve_catalogue_bulk_set_by_name(p_category,p_group,p_language,p_name,p_abbreviation);
end;
$function$;

create function api.quarantine_japanese_exact_code_group(p_group bigint) returns void
language plpgsql security invoker set search_path='' as $function$
begin
 -- Retain the identity evidence for review, but discard a quote whose automatic
 -- identifier is now demonstrably ambiguous. This is not a provider outage.
 delete from market.catalogue_general_prices q using market.catalogue_provider_cards m
   where m.category_id=85 and m.group_id=p_group and m.method='exact_set_code_number' and q.variant_id=m.variant_id;
 update market.catalogue_price_outcomes o set reason='ambiguous_provider_identity',checked_at=now(),next_retry_at=now()+interval '1 day'
   from market.catalogue_provider_cards m where m.category_id=85 and m.group_id=p_group and m.method='exact_set_code_number' and o.variant_id=m.variant_id;
end;
$function$;

create function api.japanese_exact_price_set_is_current(p_group bigint,p_set uuid) returns boolean
language sql stable security invoker set search_path='' as $function$
 select exists(select 1 from market.catalogue_provider_sets mapping join api.catalogue_sets s on s.set_id=mapping.set_id and s.language_code='ja'
   where mapping.category_id=85 and mapping.group_id=p_group and mapping.set_id=p_set and mapping.method='exact_set_code'
     and lower(normalize(trim(s.set_code),NFKC)) ~ '^[a-z0-9-]{1,32}$'
     and (select count(distinct other.set_id) from api.catalogue_sets other where other.language_code='ja'
       and lower(normalize(trim(other.set_code),NFKC))=lower(normalize(trim(s.set_code),NFKC)))=1
     and (select count(distinct g->>'groupId') from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') g
       where f.feed_key='tcgplayer/85/groups' and lower(normalize(trim(coalesce(g->>'abbreviation','')),NFKC))=lower(normalize(trim(s.set_code),NFKC)))=1
     and exists(select 1 from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') g
       where f.feed_key='tcgplayer/85/groups' and g->>'groupId'=p_group::text
         and lower(normalize(trim(coalesce(g->>'abbreviation','')),NFKC))=lower(normalize(trim(s.set_code),NFKC))));
$function$;

create or replace function api.catalogue_bulk_group_candidates(p_category integer,p_group bigint,p_after uuid default null,p_limit integer default 500)
returns setof jsonb language sql stable security invoker set search_path='' as $function$
 select jsonb_build_object('variant_id',c.variant_id,'printing_id',c.printing_id,'set_id',c.set_id,'language_code',c.language_code,
   'catalogue_version_id',c.catalogue_version_id,'collector_number',c.collector_number,'variant_code',c.variant_code,'finish_code',c.finish_code,
   'card_english_display_name',c.card_english_display_name,'card_native_name',c.card_native_name,
   'provider_set_method',s.method,'unique_collector_number',coalesce(length(split_part(api.normalized_price_collector(c.collector_number),'/',1)),0)>0
     and (select count(distinct p.id) from catalog.card_printings p where p.set_id=c.set_id and p.language_code=c.language_code and p.deprecated_at is null
       and split_part(api.normalized_price_collector(p.collector_number),'/',1)=split_part(api.normalized_price_collector(c.collector_number),'/',1))=1,
   'provider_mapping',case when m.variant_id is not null then to_jsonb(m) end)
 from market.catalogue_provider_set_members s join api.catalogue_cards c on c.set_id=s.set_id and c.language_code=s.language_code
 left join market.catalogue_provider_cards m on m.variant_id=c.variant_id and m.printing_id=c.printing_id and m.set_id=c.set_id
   and m.language_code=c.language_code and m.category_id=s.category_id and m.group_id=s.group_id
   and m.subtype=api.catalogue_provider_subtype(c.variant_code,c.finish_code)
 where s.category_id=p_category and s.group_id=p_group and (p_after is null or c.variant_id>p_after)
   and (s.method<>'exact_set_code' or api.japanese_exact_price_set_is_current(p_group,s.set_id))
 order by c.variant_id limit greatest(1,least(coalesce(p_limit,500),500));
$function$;

create or replace function api.store_catalogue_bulk_prices(p_results jsonb) returns integer
language plpgsql security invoker set search_path='' as $function$
declare item jsonb; c record; q jsonb; m jsonb; wanted_subtype text; mapped market.catalogue_provider_cards; product jsonb; n integer=0;
begin
 if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) not between 1 and 500 then raise exception 'invalid price results'; end if;
 for item in select * from jsonb_array_elements(p_results) loop
   select * into c from api.catalogue_cards where variant_id=(item->>'variantId')::uuid and catalogue_version_id=(item->>'catalogueVersionId')::uuid;
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
       c.language_code<>'ja' or m->>'categoryId'<>'85'
       or not api.japanese_exact_price_set_is_current((m->>'groupId')::bigint,c.set_id)
       or length(split_part(api.normalized_price_collector(c.collector_number),'/',1))=0
       or not exists(select 1 from market.catalogue_provider_set_members s where s.category_id=85 and s.group_id=(m->>'groupId')::bigint
         and s.set_id=c.set_id and s.language_code='ja' and s.method='exact_set_code')
       or (select count(distinct p.id) from catalog.card_printings p where p.set_id=c.set_id and p.language_code='ja' and p.deprecated_at is null
         and split_part(api.normalized_price_collector(p.collector_number),'/',1)=split_part(api.normalized_price_collector(c.collector_number),'/',1))<>1
       or (select count(distinct value->>'productId') from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results')
         where f.feed_key='tcgplayer/85/'||(m->>'groupId')||'/products' and value->>'categoryId'='85'
           and value->>'groupId'=m->>'groupId' and coalesce(value->'presaleInfo'->>'isPresale','false')<>'true'
           and exists(select 1 from jsonb_array_elements(value->'extendedData') field where lower(field->>'name')='number'
             and split_part(api.normalized_price_collector(field->>'value'),'/',1)=split_part(api.normalized_price_collector(c.collector_number),'/',1)))<>1
     ) then raise exception 'invalid exact-code product identity'; end if;
     select value into product from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results')
       where f.feed_key='tcgplayer/'||(m->>'categoryId')||'/'||(m->>'groupId')||'/products'
         and value->>'productId'=m->>'productId' and value->>'categoryId'=m->>'categoryId' and value->>'groupId'=m->>'groupId';
     if product is null or coalesce(product->'presaleInfo'->>'isPresale','false')='true'
       or not exists(select 1 from jsonb_array_elements(product->'extendedData') field where lower(field->>'name')='number'
         and split_part(api.normalized_price_collector(field->>'value'),'/',1)=split_part(api.normalized_price_collector(c.collector_number),'/',1))
       or (m->>'method'='exact_name_number' and api.catalogue_provider_name(product->>'name') is distinct from
         api.catalogue_provider_name(coalesce(c.card_english_display_name,c.card_native_name)) and not exists(
           select 1 from market.catalogue_provider_cards existing where existing.variant_id=c.variant_id and existing.printing_id=c.printing_id
             and existing.set_id=c.set_id and existing.language_code=c.language_code and existing.category_id=(m->>'categoryId')::integer
             and existing.group_id=(m->>'groupId')::bigint and existing.product_id=(m->>'productId')::bigint and existing.subtype=wanted_subtype))
       then raise exception 'invalid provider product evidence'; end if;
     -- A provider finish cannot silently map to a second canonical variant.
     if exists(select 1 from market.catalogue_provider_cards where category_id=(m->>'categoryId')::integer and product_id=(m->>'productId')::bigint
       and catalogue_provider_cards.subtype=wanted_subtype and variant_id<>c.variant_id) then raise exception 'provider mapping collision'; end if;
     select * into mapped from market.catalogue_provider_cards where variant_id=c.variant_id;
     if found and (mapped.category_id<>(m->>'categoryId')::integer or mapped.group_id<>(m->>'groupId')::bigint or mapped.product_id<>(m->>'productId')::bigint or mapped.subtype<>wanted_subtype
       or mapped.printing_id<>c.printing_id or mapped.set_id<>c.set_id or mapped.language_code<>c.language_code)
       then raise exception 'permanent mapping requires review'; end if;
     if m->>'method'='reviewed' and (mapped.variant_id is null or mapped.method<>'reviewed') then raise exception 'reviewed mapping requires review record'; end if;
     insert into market.catalogue_provider_cards(variant_id,printing_id,set_id,catalogue_version_id,language_code,category_id,group_id,product_id,subtype,method)
       values(c.variant_id,c.printing_id,c.set_id,c.catalogue_version_id,c.language_code,(m->>'categoryId')::integer,(m->>'groupId')::bigint,(m->>'productId')::bigint,wanted_subtype,m->>'method')
       on conflict(variant_id) do update set catalogue_version_id=excluded.catalogue_version_id,verified_at=now();
   end if;
   if q is not null and q<>'null'::jsonb then
     if m is null or m='null'::jsonb or q->>'categoryId' is distinct from m->>'categoryId' or q->>'groupId' is distinct from m->>'groupId'
       or q->>'productId' is distinct from m->>'productId' or q->>'subtype' is distinct from wanted_subtype or q->>'currency'<>'USD'
       or (q->>'datasetAt')::timestamptz>now()+interval '5 minutes' or (q->>'exchangeRateAt')::timestamptz>now()+interval '5 minutes'
       or (q->>'exchangeRateAt')::timestamptz<now()-interval '7 days' or item->>'reason'<>'priced' then raise exception 'unsupported general quote'; end if;
     if not exists(select 1 from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') evidence
       where f.feed_key='tcgplayer/'||(m->>'categoryId')||'/'||(m->>'groupId')||'/prices' and f.dataset_at=(q->>'datasetAt')::timestamptz
         and evidence->>'productId'=m->>'productId' and evidence->>'subTypeName'=wanted_subtype and (evidence->>'marketPrice')::numeric=(q->>'price')::numeric)
       or not exists(select 1 from market.catalogue_bulk_feeds f where f.feed_key='tcgplayer/'||(m->>'categoryId')||'/'||(m->>'groupId')||'/products'
         and f.dataset_at=(q->>'datasetAt')::timestamptz) then raise exception 'quote does not match stored provider build'; end if;
     insert into market.catalogue_general_prices(variant_id,printing_id,set_id,language_code,catalogue_version_id,provider,category_id,product_id,group_id,subtype,
       original_price,original_currency,exchange_rate,exchange_rate_at,exchange_rate_source,central_estimate,dataset_at,stale_after)
     values(c.variant_id,c.printing_id,c.set_id,c.language_code,c.catalogue_version_id,'tcgcsv',(q->>'categoryId')::integer,(q->>'productId')::bigint,(q->>'groupId')::bigint,wanted_subtype,
       (q->>'price')::numeric,'USD',(q->>'exchangeRate')::numeric,(q->>'exchangeRateAt')::timestamptz,q->>'exchangeRateSource',
       round((q->>'price')::numeric*(q->>'exchangeRate')::numeric,2),(q->>'datasetAt')::timestamptz,(q->>'datasetAt')::timestamptz+interval '48 hours')
     on conflict(variant_id) do update set catalogue_version_id=excluded.catalogue_version_id,category_id=excluded.category_id,product_id=excluded.product_id,group_id=excluded.group_id,
       subtype=excluded.subtype,original_price=excluded.original_price,exchange_rate=excluded.exchange_rate,exchange_rate_at=excluded.exchange_rate_at,exchange_rate_source=excluded.exchange_rate_source,
       central_estimate=excluded.central_estimate,dataset_at=excluded.dataset_at,stale_after=excluded.stale_after,recorded_at=now()
     where excluded.dataset_at>=market.catalogue_general_prices.dataset_at;
   elsif item->>'reason'='priced' then raise exception 'priced outcome requires quote'; end if;
   insert into market.catalogue_price_outcomes values(c.variant_id,c.catalogue_version_id,item->>'reason',now(),(item->>'nextRetryAt')::timestamptz,'tcgcsv')
     on conflict(variant_id) do update set catalogue_version_id=excluded.catalogue_version_id,reason=excluded.reason,checked_at=excluded.checked_at,next_retry_at=excluded.next_retry_at;
   if item->>'reason' in ('unresolved_provider_identity','ambiguous_provider_identity') then
     insert into market.catalogue_price_repairs(repair_key,variant_id,reason,detail) values('variant:'||c.variant_id,c.variant_id,item->>'reason',to_jsonb(c))
       on conflict(repair_key) do update set reason=excluded.reason,detail=excluded.detail,status='open',last_seen_at=now();
   elsif m is not null and m<>'null'::jsonb then
     update market.catalogue_price_repairs set status='resolved',last_seen_at=now() where repair_key='variant:'||c.variant_id
       or repair_key='product:'||(m->>'categoryId')||':'||(m->>'productId');
   end if;
   n=n+1;
 end loop;
 return n;
end;
$function$;

create function api.requeue_japanese_exact_code_groups(p_run uuid) returns integer
language plpgsql security invoker set search_path='' as $function$
declare g record; mapping jsonb; n integer=0;
begin
 if not exists(select 1 from market.catalogue_bulk_runs where id=p_run) then raise exception 'invalid catalogue run'; end if;
 for g in select * from market.catalogue_bulk_groups where run_id=p_run and category_id=85 and language_code='ja' and status='unmapped' order by group_id
 loop
   mapping=api.resolve_catalogue_bulk_set(85,g.group_id,'ja',g.manifest->>'name',g.manifest->>'abbreviation');
   if mapping->>'status'='mapped' and mapping->>'source'='exact_set_code' then
     update market.catalogue_bulk_groups set status='pending',lease_token=null,lease_until=null,retry_after=null
       where run_id=p_run and category_id=85 and group_id=g.group_id and status='unmapped';
     if found then n=n+1; end if;
   end if;
 end loop;
 return n;
end;
$function$;
revoke all on function api.resolve_catalogue_bulk_set(integer,bigint,text,text,text),api.requeue_japanese_exact_code_groups(uuid),api.quarantine_japanese_exact_code_group(bigint),api.japanese_exact_price_set_is_current(bigint,uuid) from public,anon,authenticated;
grant execute on function api.resolve_catalogue_bulk_set(integer,bigint,text,text,text),api.requeue_japanese_exact_code_groups(uuid),api.quarantine_japanese_exact_code_group(bigint),api.japanese_exact_price_set_is_current(bigint,uuid) to service_role;
