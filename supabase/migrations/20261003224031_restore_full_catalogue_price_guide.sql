-- Direct provider imports, permanent identities, resumable whole-guide checkpoints.
-- This migration neither imports prices nor activates a schedule.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table market.catalogue_general_prices drop constraint catalogue_general_prices_language_code_check;
alter table market.catalogue_general_prices add constraint catalogue_general_prices_language_code_check check(language_code in ('en','ja'));
alter table market.catalogue_general_prices add column category_id integer not null default 3;
alter table market.catalogue_general_prices add column subtype text not null default 'Normal';
update market.catalogue_general_prices g set subtype='Holofoil' from api.catalogue_cards c
where c.variant_id=g.variant_id and c.variant_code='holo' and c.finish_code='holo';
alter table market.catalogue_general_prices add check((category_id=3 and language_code='en') or (category_id=85 and language_code='ja'));
alter table market.catalogue_general_prices add check(subtype in ('Normal','Holofoil','Reverse Holofoil'));

create table market.catalogue_provider_sets (
  category_id integer not null check(category_id in (3,85)), group_id bigint not null check(group_id>0),
  language_code text not null, set_id uuid not null references catalog.sets(id),
  method text not null check(method in ('exact_set_name','reviewed')), note text,
  verified_at timestamptz not null default now(), primary key(category_id,group_id),
  check((category_id=3 and language_code='en') or (category_id=85 and language_code='ja'))
);
create table market.catalogue_provider_cards (
  variant_id uuid primary key references catalog.card_variants(id) on delete cascade,
  printing_id uuid not null references catalog.card_printings(id), set_id uuid not null references catalog.sets(id),
  catalogue_version_id uuid not null references catalog.catalogue_versions(id), language_code text not null,
  category_id integer not null, group_id bigint not null, product_id bigint not null check(product_id>0), subtype text not null,
  method text not null check(method in ('exact_name_number','reviewed')), note text, verified_at timestamptz not null default now(),
  foreign key(category_id,group_id) references market.catalogue_provider_sets(category_id,group_id),
  unique(category_id,product_id,subtype), check(subtype in ('Normal','Holofoil','Reverse Holofoil')),
  check((category_id=3 and language_code='en') or (category_id=85 and language_code='ja'))
);
-- Provider promo groups may span several exact canonical sets. Membership is
-- reviewed individually; product mappings retain each card's own set identity.
create table market.catalogue_provider_set_members (
  category_id integer not null,group_id bigint not null,set_id uuid not null references catalog.sets(id),language_code text not null,
  method text not null check(method in ('exact_set_name','reviewed')),note text,verified_at timestamptz not null default now(),
  primary key(category_id,group_id,set_id),foreign key(category_id,group_id) references market.catalogue_provider_sets(category_id,group_id),
  check((category_id=3 and language_code='en') or (category_id=85 and language_code='ja'))
);
create index catalogue_provider_set_members_catalogue_idx on market.catalogue_provider_set_members(set_id,language_code);
create table market.catalogue_bulk_runs (
  id uuid primary key default gen_random_uuid(), provider text not null default 'tcgcsv' check(provider='tcgcsv'),
  dataset_at timestamptz not null unique, started_at timestamptz not null default now()
);
create table market.catalogue_bulk_groups (
  run_id uuid not null references market.catalogue_bulk_runs(id) on delete cascade,
  category_id integer not null check(category_id in (3,85)), group_id bigint not null check(group_id>0),
  language_code text not null, manifest jsonb not null,
  status text not null default 'pending' check(status in ('pending','running','complete','unmapped','failed')),
  stats jsonb not null default '{}', lease_token uuid, lease_until timestamptz, retry_after timestamptz,
  completed_at timestamptz, primary key(run_id,category_id,group_id),
  check((category_id=3 and language_code='en') or (category_id=85 and language_code='ja'))
);
create index catalogue_bulk_groups_resume_idx on market.catalogue_bulk_groups(run_id,status,retry_after,category_id,group_id);
create table market.catalogue_price_repairs (
  repair_key text primary key, category_id integer, group_id bigint, product_id bigint, variant_id uuid,
  reason text not null, detail jsonb not null default '{}', status text not null default 'open' check(status in ('open','resolved')),
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create index catalogue_price_repairs_open_idx on market.catalogue_price_repairs(category_id,group_id,last_seen_at) where status='open';
create table market.catalogue_mapping_reviews (
  id bigint generated always as identity primary key, reviewed_at timestamptz not null default now(), payload jsonb not null
);
do $permissions$
declare t text;
begin
  foreach t in array array['catalogue_provider_sets','catalogue_provider_set_members','catalogue_provider_cards','catalogue_bulk_runs','catalogue_bulk_groups','catalogue_price_repairs','catalogue_mapping_reviews'] loop
    execute format('alter table market.%I enable row level security',t);
    execute format('create policy "service manages price guide" on market.%I for all to service_role using(true) with check(true)',t);
    execute format('revoke all on market.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on market.%I to service_role',t);
  end loop;
end;
$permissions$;
grant usage,select on sequence market.catalogue_mapping_reviews_id_seq to service_role;

create function api.catalogue_provider_name(p_value text) returns text
language sql immutable strict security invoker set search_path='' as $function$
  select regexp_replace(replace(lower(normalize(p_value,NFKC)),'&','and'),'[[:space:][:punct:]・：]','','g');
$function$;
create function api.catalogue_provider_subtype(p_variant text,p_finish text) returns text
language sql immutable security invoker set search_path='' as $function$
 select case when p_variant in ('normal','standard','default') and p_finish in ('normal','standard','default','non_holo') then 'Normal'
 when p_variant='holo' and p_finish='holo' then 'Holofoil'
 when p_variant='reverse_holo' and p_finish='reverse_holo' then 'Reverse Holofoil' end;
$function$;

create function api.begin_catalogue_bulk_sweep(p_dataset timestamptz,p_groups jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $function$
declare rid uuid; g jsonb;
begin
 if p_dataset is null or p_dataset>now()+interval '5 minutes' or jsonb_typeof(p_groups) is distinct from 'array'
   or jsonb_array_length(p_groups) not between 1 and 5000 then raise exception 'invalid provider manifest'; end if;
 insert into market.catalogue_bulk_runs(dataset_at) values(p_dataset) on conflict(dataset_at) do update set dataset_at=excluded.dataset_at returning id into rid;
 for g in select * from jsonb_array_elements(p_groups) loop
   insert into market.catalogue_bulk_groups(run_id,category_id,group_id,language_code,manifest)
   values(rid,(g->>'categoryId')::integer,(g->>'groupId')::bigint,g->>'language',g)
   on conflict(run_id,category_id,group_id) do update set manifest=excluded.manifest;
 end loop;
 insert into market.catalogue_price_repairs(repair_key,category_id,reason,detail)
 select 'catalogue-set:'||s.set_id,case s.language_code when 'en' then 3 when 'ja' then 85 end,'no_mapped_provider_set',to_jsonb(s)
 from api.catalogue_sets s where s.language_code in ('en','ja')
   and exists(select 1 from api.catalogue_cards c where c.set_id=s.set_id and api.catalogue_provider_subtype(c.variant_code,c.finish_code) is not null)
   and not exists(select 1 from market.catalogue_provider_set_members m join market.catalogue_bulk_groups bg on bg.run_id=rid
     and bg.category_id=m.category_id and bg.group_id=m.group_id where m.set_id=s.set_id and m.language_code=s.language_code)
 on conflict(repair_key) do update set detail=excluded.detail,status='open',last_seen_at=now();
 insert into market.catalogue_price_outcomes(variant_id,catalogue_version_id,reason,checked_at,next_retry_at,provider)
 select c.variant_id,c.catalogue_version_id,case when c.language_code not in ('en','ja') then 'unsupported_provider_language'
   when api.catalogue_provider_subtype(c.variant_code,c.finish_code) is null then 'unsupported_provider_finish' else 'unresolved_provider_identity' end,
   now(),now()+case when c.language_code not in ('en','ja') or api.catalogue_provider_subtype(c.variant_code,c.finish_code) is null then interval '7 days' else interval '1 day' end,'tcgcsv'
 from api.catalogue_cards c
 on conflict(variant_id) do update set catalogue_version_id=excluded.catalogue_version_id,reason=excluded.reason,checked_at=excluded.checked_at,next_retry_at=excluded.next_retry_at
   where market.catalogue_price_outcomes.catalogue_version_id<>excluded.catalogue_version_id;
 return jsonb_build_object('runId',rid,'status','resumable','totalGroups',(select count(*) from market.catalogue_bulk_groups where run_id=rid));
end;
$function$;
create function api.claim_catalogue_bulk_sweep_group(p_run uuid) returns jsonb
language plpgsql security invoker set search_path='' as $function$
declare g market.catalogue_bulk_groups; token uuid=gen_random_uuid();
begin
 select * into g from market.catalogue_bulk_groups where run_id=p_run and
   (status='pending' or (status='running' and lease_until<=now()) or (status='failed' and retry_after<=now()))
 order by category_id,group_id for update skip locked limit 1;
 if not found then return null; end if;
 update market.catalogue_bulk_groups set status='running',lease_token=token,lease_until=now()+interval '30 minutes' where run_id=p_run and category_id=g.category_id and group_id=g.group_id;
 return jsonb_build_object('categoryId',g.category_id,'groupId',g.group_id,'language',g.language_code,'group',g.manifest,'leaseToken',token);
end;
$function$;

create function api.resolve_catalogue_bulk_set(p_category integer,p_group bigint,p_language text,p_name text,p_abbreviation text) returns jsonb
language plpgsql security invoker set search_path='' as $function$
declare mapped market.catalogue_provider_sets; ids uuid[]; full_name text; short_name text; code text;
begin
 if p_category is null or p_language is null or p_group is null or p_group<=0
   or not ((p_category=3 and p_language='en') or (p_category=85 and p_language='ja')) then raise exception 'invalid provider language'; end if;
 select * into mapped from market.catalogue_provider_sets where category_id=p_category and group_id=p_group;
 if found and exists(select 1 from market.catalogue_provider_set_members member join api.catalogue_sets s on s.set_id=member.set_id and s.language_code=member.language_code
   where member.category_id=p_category and member.group_id=p_group and member.language_code=p_language) then
   update market.catalogue_price_repairs set status='resolved',last_seen_at=now() where repair_key='set:'||p_category||':'||p_group or repair_key in
     (select 'catalogue-set:'||set_id from market.catalogue_provider_set_members where category_id=p_category and group_id=p_group);
   return jsonb_build_object('status','mapped','setId',mapped.set_id,'source',mapped.method,'setIds',
     (select jsonb_agg(member.set_id order by member.set_id) from market.catalogue_provider_set_members member join api.catalogue_sets s on s.set_id=member.set_id and s.language_code=member.language_code
       where member.category_id=p_category and member.group_id=p_group)); end if;
 full_name=api.catalogue_provider_name(p_name); code=api.catalogue_provider_name(p_abbreviation);
 short_name=case when length(code)>0 and starts_with(full_name,code) then substr(full_name,length(code)+1) else full_name end;
 select array_agg(distinct set_id) into ids from api.catalogue_sets where language_code=p_language and
   (api.catalogue_provider_name(native_name) in (full_name,short_name) or api.catalogue_provider_name(english_display_name) in (full_name,short_name))
   and length(full_name)>0;
 if coalesce(array_length(ids,1),0)=1 then
   insert into market.catalogue_provider_sets values(p_category,p_group,p_language,ids[1],'exact_set_name',null,now())
     on conflict(category_id,group_id) do update set set_id=excluded.set_id,verified_at=now() where market.catalogue_provider_sets.method<>'reviewed';
   insert into market.catalogue_provider_set_members values(p_category,p_group,ids[1],p_language,'exact_set_name',null,now()) on conflict(category_id,group_id,set_id) do update set verified_at=now();
   update market.catalogue_price_repairs set status='resolved',last_seen_at=now() where repair_key='set:'||p_category||':'||p_group or repair_key='catalogue-set:'||ids[1];
   return jsonb_build_object('status','mapped','setId',ids[1],'source','exact_set_name');
 end if;
 insert into market.catalogue_price_repairs(repair_key,category_id,group_id,reason,detail)
 values('set:'||p_category||':'||p_group,p_category,p_group,case when coalesce(array_length(ids,1),0)>1 then 'ambiguous_provider_set' else 'unmapped_provider_set' end,
   jsonb_build_object('name',p_name,'language',p_language,'candidateSetIds',ids))
 on conflict(repair_key) do update set reason=excluded.reason,detail=excluded.detail,status='open',last_seen_at=now();
 return jsonb_build_object('status',case when coalesce(array_length(ids,1),0)>1 then 'ambiguous' else 'unmapped' end);
end;
$function$;
create function api.catalogue_bulk_group_candidates(p_category integer,p_group bigint,p_after uuid default null,p_limit integer default 500)
returns setof jsonb language sql stable security invoker set search_path='' as $function$
 select to_jsonb(c)||jsonb_build_object('provider_mapping',case when m.variant_id is not null then to_jsonb(m) end)
 from market.catalogue_provider_set_members s join api.catalogue_cards c on c.set_id=s.set_id and c.language_code=s.language_code
 left join market.catalogue_provider_cards m on m.variant_id=c.variant_id and m.printing_id=c.printing_id and m.set_id=c.set_id
   and m.language_code=c.language_code and m.category_id=s.category_id and m.group_id=s.group_id
   and m.subtype=api.catalogue_provider_subtype(c.variant_code,c.finish_code)
 where s.category_id=p_category and s.group_id=p_group and (p_after is null or c.variant_id>p_after)
 order by c.variant_id limit greatest(1,least(coalesce(p_limit,500),500));
$function$;

-- Namespaced provider caches prevent Japanese and English group ID collisions.
create function api.claim_catalogue_bulk_feed_revision(p_key text,p_dataset timestamptz default null) returns uuid
language plpgsql security invoker set search_path='' as $function$
declare token uuid;
begin
 if p_key is null or p_key !~ '^(last-updated|tcgplayer/(3|85)/(groups|[0-9]+/(products|prices)))$' then raise exception 'invalid feed'; end if;
 if p_dataset>now()+interval '5 minutes' then raise exception 'invalid provider dataset'; end if;
 insert into market.catalogue_bulk_feeds(feed_key) values(p_key) on conflict do nothing;
 insert into market.catalogue_bulk_budget values('tcgcsv',now(),0,now()) on conflict do nothing;
 perform 1 from market.catalogue_bulk_budget where provider='tcgcsv' for update;
 if not exists(select 1 from market.catalogue_bulk_budget where provider='tcgcsv' and next_request_at<=now()
   and (window_started_at<=now()-interval '24 hours' or requests<6000)) then return null; end if;
 update market.catalogue_bulk_feeds set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 where feed_key=p_key and (lease_until is null or lease_until<=now()) and (retry_after is null or retry_after<=now())
   and (fetched_at is null or (p_key='last-updated' and fetched_at<=now()-interval '1 hour')
     or (p_key<>'last-updated' and (p_dataset>dataset_at or fetched_at<=now()-interval '24 hours'))) returning lease_token into token;
 if token is null then return null; end if;
 update market.catalogue_bulk_budget set requests=case when window_started_at<=now()-interval '24 hours' then 1 else requests+1 end,
   window_started_at=case when window_started_at<=now()-interval '24 hours' then now() else window_started_at end,
   next_request_at=now()+interval '1 second' where provider='tcgcsv';
 return token;
end;
$function$;
create or replace function api.claim_catalogue_bulk_feed(p_key text) returns uuid
language sql security invoker set search_path='' as $function$
 select api.claim_catalogue_bulk_feed_revision(p_key,null);
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
       or m->>'method' not in ('exact_name_number','reviewed') or not exists(select 1 from market.catalogue_provider_set_members s
         where s.category_id=(m->>'categoryId')::integer and s.group_id=(m->>'groupId')::bigint and s.set_id=c.set_id and s.language_code=c.language_code)
       then raise exception 'invalid provider mapping'; end if;
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

create function api.finish_catalogue_bulk_sweep_group(p_run uuid,p_category integer,p_group bigint,p_token uuid,p_status text,p_stats jsonb,p_retry_seconds integer default 0)
returns boolean language plpgsql security invoker set search_path='' as $function$
declare product jsonb;
begin
 if p_status is null or p_status not in ('complete','unmapped','failed') or jsonb_typeof(p_stats) is distinct from 'object' then raise exception 'invalid checkpoint'; end if;
 update market.catalogue_bulk_groups set status=p_status,stats=p_stats,lease_token=null,lease_until=null,completed_at=now(),
   retry_after=case when p_status='failed' then now()+make_interval(secs=>greatest(60,least(coalesce(p_retry_seconds,600),86400))) end
 where run_id=p_run and category_id=p_category and group_id=p_group and lease_token=p_token and lease_until>now();
 if not found then return false; end if;
 if p_status='failed' then
   insert into market.catalogue_price_outcomes(variant_id,catalogue_version_id,reason,checked_at,next_retry_at,provider)
   select c.variant_id,c.catalogue_version_id,'provider_backoff',now(),now()+make_interval(secs=>greatest(60,least(coalesce(p_retry_seconds,600),86400))),'tcgcsv'
   from market.catalogue_provider_set_members s join api.catalogue_cards c on c.set_id=s.set_id and c.language_code=s.language_code
   where s.category_id=p_category and s.group_id=p_group
   on conflict(variant_id) do update set catalogue_version_id=excluded.catalogue_version_id,reason=excluded.reason,checked_at=excluded.checked_at,next_retry_at=excluded.next_retry_at;
 end if;
 if p_status in ('complete','unmapped') then
   for product in select value from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results')
     where f.feed_key='tcgplayer/'||p_category||'/'||p_group||'/products' and exists(select 1 from jsonb_array_elements(value->'extendedData') x where x->>'name'='Number' and length(x->>'value')>0)
       and not exists(select 1 from market.catalogue_provider_cards where category_id=p_category and product_id=(value->>'productId')::bigint) loop
     insert into market.catalogue_price_repairs(repair_key,category_id,group_id,product_id,reason,detail)
       values('product:'||p_category||':'||(product->>'productId'),p_category,p_group,(product->>'productId')::bigint,'unmapped_provider_product',product)
       on conflict(repair_key) do update set detail=excluded.detail,status='open',last_seen_at=now();
   end loop;
 end if;
 return true;
end;
$function$;

-- Coverage is calculated from publication, never from holdings or successfully mapped rows alone.
create function api.catalogue_bulk_price_coverage(p_run uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $function$
 with published as (select c.*,api.catalogue_provider_subtype(c.variant_code,c.finish_code) subtype from api.catalogue_cards c),
 card_counts as (select c.language_code,c.set_id,count(*) total,
   count(*) filter(where c.language_code in ('en','ja') and c.subtype is not null) supported,
   count(*) filter(where m.variant_id is not null and m.printing_id=c.printing_id and m.set_id=c.set_id and m.language_code=c.language_code and m.subtype=c.subtype) mapped,
   count(*) filter(where c.language_code in ('en','ja') and c.subtype is not null and (m.variant_id is null or m.printing_id<>c.printing_id or m.set_id<>c.set_id or m.language_code<>c.language_code or m.subtype<>c.subtype)) unmapped,
   count(*) filter(where g.variant_id is not null and g.catalogue_version_id=c.catalogue_version_id) priced,
   count(*) filter(where g.variant_id is not null and g.catalogue_version_id=c.catalogue_version_id and g.stale_after<=now()) stale,
   count(*) filter(where o.reason='no_provider_quote' and o.catalogue_version_id=c.catalogue_version_id) missing_quote,
   count(*) filter(where o.reason='provider_backoff' and o.catalogue_version_id=c.catalogue_version_id) retry,
   count(*) filter(where c.language_code not in ('en','ja') or c.subtype is null) unsupported
 from published c left join market.catalogue_provider_cards m on m.variant_id=c.variant_id
 left join market.catalogue_general_prices g on g.variant_id=c.variant_id and g.printing_id=c.printing_id and g.language_code=c.language_code and g.set_id=c.set_id
 left join market.catalogue_price_outcomes o on o.variant_id=c.variant_id group by c.language_code,c.set_id),
 run_groups as (select category_id,status,count(*) total from market.catalogue_bulk_groups
 where run_id=coalesce(p_run,(select id from market.catalogue_bulk_runs order by dataset_at desc limit 1)) group by category_id,status)
 select jsonb_build_object('cards',coalesce((select jsonb_agg(to_jsonb(card_counts) order by language_code,set_id) from card_counts),'[]'),
   'groups',coalesce((select jsonb_agg(to_jsonb(run_groups) order by category_id,status) from run_groups),'[]'),
   'openRepairs',(select count(*) from market.catalogue_price_repairs where status='open'),
   'runStatus',case when not exists(select 1 from run_groups) then 'not_started'
     when exists(select 1 from run_groups where status in ('pending','running','failed')) then 'partial'
     when exists(select 1 from run_groups where status='unmapped') or exists(select 1 from card_counts where unmapped>0)
       or exists(select 1 from market.catalogue_price_repairs where status='open') then 'needs_mapping'
     when exists(select 1 from run_groups) then 'complete' else 'not_started' end);
$function$;

-- A deliberate repair is auditable, validates current provider metadata and canonical language/finish,
-- and invalidates an old quote instead of assigning it to a different card.
create function api.review_catalogue_bulk_mapping(p_mapping jsonb) returns boolean
language plpgsql security invoker set search_path='' as $function$
declare category integer=(p_mapping->>'categoryId')::integer; gid bigint=(p_mapping->>'groupId')::bigint;
 lang text=case category when 3 then 'en' when 85 then 'ja' end; sid uuid=(p_mapping->>'setId')::uuid;
 c record; product jsonb; wanted_subtype text;
begin
 if lang is null or length(trim(coalesce(p_mapping->>'note','')))<5
   or not exists(select 1 from api.catalogue_sets where set_id=sid and language_code=lang)
   or not exists(select 1 from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') g
     where f.feed_key='tcgplayer/'||category||'/groups' and (g->>'groupId')::bigint=gid and (g->>'categoryId')::integer=category) then raise exception 'invalid reviewed set mapping'; end if;
 insert into market.catalogue_provider_sets values(category,gid,lang,sid,'reviewed',p_mapping->>'note',now())
 on conflict(category_id,group_id) do update set method='reviewed',note=excluded.note,verified_at=now();
 insert into market.catalogue_provider_set_members values(category,gid,sid,lang,'reviewed',p_mapping->>'note',now())
 on conflict(category_id,group_id,set_id) do update set method='reviewed',note=excluded.note,verified_at=now();
 if p_mapping->>'variantId' is not null then
   select * into c from api.catalogue_cards where variant_id=(p_mapping->>'variantId')::uuid and set_id=sid and language_code=lang;
   if not found then raise exception 'invalid reviewed card identity'; end if;
   wanted_subtype=api.catalogue_provider_subtype(c.variant_code,c.finish_code);
   select value into product from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results')
     where f.feed_key='tcgplayer/'||category||'/'||gid||'/products' and (value->>'productId')::bigint=(p_mapping->>'productId')::bigint
       and (value->>'groupId')::bigint=gid and (value->>'categoryId')::integer=category;
   if product is null or wanted_subtype is null or p_mapping->>'subtype' is distinct from wanted_subtype or coalesce(product->'presaleInfo'->>'isPresale','false')='true'
     or not exists(select 1 from jsonb_array_elements(product->'extendedData') x where lower(x->>'name')='number'
       and split_part(api.normalized_price_collector(x->>'value'),'/',1)=split_part(api.normalized_price_collector(c.collector_number),'/',1)) then raise exception 'invalid reviewed product mapping'; end if;
   delete from market.catalogue_general_prices where variant_id=c.variant_id and
     (category_id<>category or group_id<>gid or product_id<>(p_mapping->>'productId')::bigint or catalogue_general_prices.subtype<>wanted_subtype
       or printing_id<>c.printing_id or set_id<>c.set_id or language_code<>lang);
   insert into market.catalogue_provider_cards(variant_id,printing_id,set_id,catalogue_version_id,language_code,category_id,group_id,product_id,subtype,method,note)
     values(c.variant_id,c.printing_id,c.set_id,c.catalogue_version_id,lang,category,gid,(p_mapping->>'productId')::bigint,wanted_subtype,'reviewed',p_mapping->>'note')
   on conflict(variant_id) do update set printing_id=excluded.printing_id,set_id=excluded.set_id,catalogue_version_id=excluded.catalogue_version_id,language_code=excluded.language_code,
     category_id=excluded.category_id,group_id=excluded.group_id,product_id=excluded.product_id,subtype=excluded.subtype,method='reviewed',note=excluded.note,verified_at=now();
   update market.catalogue_price_repairs set status='resolved',last_seen_at=now() where repair_key='variant:'||c.variant_id or repair_key='product:'||category||':'||(p_mapping->>'productId');
 end if;
 update market.catalogue_price_repairs set status='resolved',last_seen_at=now() where repair_key='set:'||category||':'||gid or repair_key='catalogue-set:'||sid;
 update market.catalogue_bulk_groups set status='pending',lease_until=null,lease_token=null where category_id=category and group_id=gid and status in ('unmapped','complete','failed');
 insert into market.catalogue_mapping_reviews(payload) values(p_mapping);
 return true;
end;
$function$;

create function api.review_catalogue_bulk_mappings(p_mappings jsonb) returns integer
language plpgsql security invoker set search_path='' as $function$
declare m jsonb; n integer=0;
begin
 if jsonb_typeof(p_mappings) is distinct from 'array' or jsonb_array_length(p_mappings) not between 1 and 100 then raise exception 'invalid mapping repair batch'; end if;
 for m in select * from jsonb_array_elements(p_mappings) loop
   perform api.review_catalogue_bulk_mapping(m); n=n+1;
 end loop;
 return n;
end;
$function$;
revoke update,delete on market.catalogue_mapping_reviews from service_role;

do $rpc_permissions$
declare fn record;
begin
 for fn in select p.oid::regprocedure signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='api' and p.proname in ('catalogue_provider_name','catalogue_provider_subtype','begin_catalogue_bulk_sweep','claim_catalogue_bulk_sweep_group',
   'resolve_catalogue_bulk_set','catalogue_bulk_group_candidates','finish_catalogue_bulk_sweep_group','catalogue_bulk_price_coverage','review_catalogue_bulk_mapping','review_catalogue_bulk_mappings','claim_catalogue_bulk_feed_revision') loop
   execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
   execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end;
$rpc_permissions$;


