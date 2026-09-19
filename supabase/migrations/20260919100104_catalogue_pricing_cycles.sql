-- Additive, service-only pricing maintenance. Catalogue publication and source
-- approvals are read, never modified. Every cycle freezes all published languages.
create table public.catalogue_price_cycles (
  id uuid primary key default gen_random_uuid(),
  catalogue_revision jsonb not null,
  started_at timestamptz not null default now(),
  due_at timestamptz not null,
  completed_at timestamptz,
  population integer not null default 0,
  checkpoint bigint not null default 0
);
create unique index catalogue_price_one_open_cycle on public.catalogue_price_cycles ((true)) where completed_at is null;
create table public.catalogue_price_state (
  variant_id uuid primary key,
  identity jsonb not null,
  outcome text not null,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  checked_at timestamptz
);
create table public.catalogue_price_items (
  cycle_id uuid not null references public.catalogue_price_cycles(id),
  variant_id uuid not null,
  ordinal bigint not null,
  identity jsonb not null,
  outcome text not null check (outcome in ('priced','older_price_retained','pending','retrying','no_provider_quote','unresolved_identity','unsupported_scope')),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  checked_at timestamptz,
  primary key(cycle_id,variant_id),
  unique(cycle_id,ordinal)
);
create index catalogue_price_due on public.catalogue_price_items(cycle_id,next_attempt_at,ordinal) where outcome in ('pending','retrying');
create table public.catalogue_price_provider_budget (
  provider text primary key,
  window_started_at timestamptz not null default now(),
  requests integer not null default 0,
  next_request_at timestamptz not null default now(),
  blocked_until timestamptz not null default now()
);
insert into public.catalogue_price_provider_budget(provider) values ('tcgdex');

create function api.begin_catalogue_price_cycle(p_hours integer default 12) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare cycle uuid; n integer;
begin
  if p_hours < 1 or p_hours > 168 then raise exception 'invalid cycle interval'; end if;
  perform pg_advisory_xact_lock(hashtext('stackr.catalogue-price-cycle'));
  select id into cycle from public.catalogue_price_cycles where completed_at is null;
  if cycle is not null then return cycle; end if;
  -- A frequent queue check must not start another full pass before its cadence.
  select id into cycle from public.catalogue_price_cycles where due_at > now() order by started_at desc limit 1;
  if cycle is not null then return cycle; end if;
  insert into public.catalogue_price_cycles(catalogue_revision,due_at)
  select coalesce(jsonb_object_agg(language_code,catalogue_version_id),'{}'::jsonb), now()+make_interval(hours=>p_hours)
  from (select distinct language_code,catalogue_version_id from api.catalogue_cards) revisions returning id into cycle;
  insert into public.catalogue_price_items(cycle_id,variant_id,ordinal,identity,outcome,next_attempt_at)
  select cycle,c.variant_id,row_number() over(order by c.variant_id),i.identity,
    case when s.identity=i.identity and s.next_attempt_at>now() then s.outcome else 'pending' end,
    case when s.identity=i.identity then s.next_attempt_at else now() end
  from api.catalogue_cards c
  cross join lateral (select jsonb_build_object('variantId',c.variant_id,'printingId',c.printing_id,
    'setId',c.set_id,'language',c.language_code,'variantCode',c.variant_code,'finishCode',c.finish_code,
    'catalogueVersionId',c.catalogue_version_id) identity) i
  left join public.catalogue_price_state s on s.variant_id=c.variant_id;
  get diagnostics n = row_count;
  update public.catalogue_price_cycles set population=n,
    checkpoint=(select count(*) from public.catalogue_price_items where cycle_id=cycle and outcome not in ('pending','retrying')),
    completed_at=case when not exists(select 1 from public.catalogue_price_items where cycle_id=cycle and outcome in ('pending','retrying')) then now() end
  where id=cycle;
  return cycle;
end $$;

create function api.claim_catalogue_prices(p_cycle uuid,p_limit integer default 12)
returns setof public.catalogue_price_items language sql security invoker set search_path = '' as $$
  with selected as (
    select cycle_id,variant_id from public.catalogue_price_items
    where cycle_id=p_cycle and outcome in ('pending','retrying') and next_attempt_at<=now()
      and (lease_until is null or lease_until<=now())
    order by attempts,ordinal for update skip locked limit greatest(0,least(p_limit,100))
  ) update public.catalogue_price_items i set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=i.attempts+1
  from selected s where i.cycle_id=s.cycle_id and i.variant_id=s.variant_id returning i.*;
$$;

create function api.finish_catalogue_price(p_cycle uuid,p_variant uuid,p_lease uuid,p_outcome text,p_delay_seconds integer,p_error text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare item public.catalogue_price_items;
begin
  if p_outcome not in ('priced','older_price_retained','retrying','no_provider_quote','unresolved_identity','unsupported_scope') then raise exception 'invalid outcome'; end if;
  update public.catalogue_price_items set outcome=p_outcome,checked_at=now(),lease_token=null,lease_until=null,
    next_attempt_at=now()+make_interval(secs=>greatest(1,p_delay_seconds)),last_error=p_error
  where cycle_id=p_cycle and variant_id=p_variant and lease_token=p_lease and lease_until>now() returning * into item;
  if not found then return false; end if;
  insert into public.catalogue_price_state(variant_id,identity,outcome,next_attempt_at,attempts,last_error,checked_at)
  values(item.variant_id,item.identity,item.outcome,item.next_attempt_at,item.attempts,item.last_error,item.checked_at)
  on conflict(variant_id) do update set identity=excluded.identity,outcome=excluded.outcome,next_attempt_at=excluded.next_attempt_at,
    attempts=excluded.attempts,last_error=excluded.last_error,checked_at=excluded.checked_at;
  update public.catalogue_price_cycles set checkpoint=(select count(*) from public.catalogue_price_items where cycle_id=p_cycle and outcome not in ('pending','retrying')),
    completed_at=case when not exists(select 1 from public.catalogue_price_items where cycle_id=p_cycle and outcome in ('pending','retrying')) then now() else null end
  where id=p_cycle;
  return true;
end $$;

-- All catalogue/priority consumers reserve against this one persistent budget.
-- Values are supplied only by the reviewed deployment configuration, never clients.
create function api.reserve_catalogue_provider_request(p_provider text,p_limit integer,p_spacing_ms integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_limit<1 or p_spacing_ms<100 then return false; end if;
  update public.catalogue_price_provider_budget set
    requests=case when window_started_at<=now()-interval '12 hours' then 1 else requests+1 end,
    window_started_at=case when window_started_at<=now()-interval '12 hours' then now() else window_started_at end,
    next_request_at=now()+make_interval(secs=>p_spacing_ms/1000.0)
  where provider=p_provider and blocked_until<=now() and next_request_at<=now()
    and (window_started_at<=now()-interval '12 hours' or requests<p_limit);
  return found;
end $$;

create function api.catalogue_price_cycle_status() returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('cycle',to_jsonb(c),'overdue',c.completed_at is null and c.due_at<now(),
    'outcomes',coalesce((select jsonb_agg(x) from (select identity->>'language' language,identity->>'variantCode' variant,outcome,count(*) identities
      from public.catalogue_price_items where cycle_id=c.id group by 1,2,3) x),'[]'::jsonb))
  from public.catalogue_price_cycles c order by c.started_at desc limit 1;
$$;

alter table public.catalogue_price_cycles enable row level security;
alter table public.catalogue_price_state enable row level security;
alter table public.catalogue_price_items enable row level security;
alter table public.catalogue_price_provider_budget enable row level security;
revoke all on public.catalogue_price_cycles,public.catalogue_price_state,public.catalogue_price_items,public.catalogue_price_provider_budget from public,anon,authenticated;
grant all on public.catalogue_price_cycles,public.catalogue_price_state,public.catalogue_price_items,public.catalogue_price_provider_budget to service_role;
revoke all on function api.begin_catalogue_price_cycle(integer),api.claim_catalogue_prices(uuid,integer),api.finish_catalogue_price(uuid,uuid,uuid,text,integer,text),api.reserve_catalogue_provider_request(text,integer,integer),api.catalogue_price_cycle_status() from public,anon,authenticated;
grant execute on function api.begin_catalogue_price_cycle(integer),api.claim_catalogue_prices(uuid,integer),api.finish_catalogue_price(uuid,uuid,uuid,text,integer,text),api.reserve_catalogue_provider_request(text,integer,integer),api.catalogue_price_cycle_status() to service_role;

-- Private inputs are captured in one database snapshot. Binder placement is
-- separate from ownership; duplicate placement never creates another holding.
create function api.collection_valuation_inputs(p_owner uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
 with b as materialized (select * from public.binders where user_id=p_owner),
 o as materialized (select * from public.user_card_variants where user_id=p_owner and quantity>0),
 bc as materialized (select c.* from public.binder_cards c join b on b.id=c.binder_id),
 payload as (select jsonb_build_object(
   'ownedRows',coalesce((select jsonb_agg(to_jsonb(o) order by id) from o),'[]'::jsonb),
   'binders',coalesce((select jsonb_agg(to_jsonb(b) order by id) from b),'[]'::jsonb),
   'binderCards',coalesce((select jsonb_agg(to_jsonb(bc) order by id) from bc),'[]'::jsonb)) body)
 select body || jsonb_build_object('collectionRevision',md5(body::text)) from payload;
$$;

create table public.collection_valuation_generations (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 collection_revision text,
 valuation_revision uuid,
 summary jsonb,
 calculated_at timestamptz,
 requested_at timestamptz not null default now(),
 refresh_requested_at timestamptz,
 refresh_completed_at timestamptz,
 refresh_progress jsonb,
 lease_token uuid,
 lease_until timestamptz
);
alter table public.collection_valuation_generations enable row level security;
revoke all on public.collection_valuation_generations from public,anon,authenticated;
grant all on public.collection_valuation_generations to service_role;

create function api.request_collection_valuation(p_owner uuid,p_refresh boolean default false) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_revision text; result public.collection_valuation_generations;
begin
 select api.collection_valuation_inputs(p_owner)->>'collectionRevision' into current_revision;
 insert into public.collection_valuation_generations(owner_id,refresh_requested_at)
 values(p_owner,case when p_refresh then now() end)
 on conflict(owner_id) do update set
   requested_at=case when collection_valuation_generations.collection_revision is distinct from current_revision
      or collection_valuation_generations.calculated_at<now()-interval '3 minutes' then now() else collection_valuation_generations.requested_at end,
   refresh_requested_at=case when p_refresh and (collection_valuation_generations.refresh_requested_at is null
      or collection_valuation_generations.refresh_completed_at>=collection_valuation_generations.refresh_requested_at)
      then now() else collection_valuation_generations.refresh_requested_at end
 returning * into result;
 return jsonb_build_object('state',case when result.summary is null then 'pending'
   when result.collection_revision is distinct from current_revision or result.requested_at>result.calculated_at then 'updating' else 'ready' end,
   'requestedCollectionRevision',current_revision,'summary',result.summary,
   'refreshRequest',case when result.refresh_requested_at is null then null else jsonb_build_object('requestedAt',result.refresh_requested_at,
     'completedAt',result.refresh_completed_at,'pending',result.refresh_completed_at is null or result.refresh_completed_at<result.refresh_requested_at) end);
end $$;

create function api.claim_collection_valuation(p_owner uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result public.collection_valuation_generations;
begin
 update public.collection_valuation_generations set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes'
 where owner_id=p_owner and (lease_until is null or lease_until<=now())
   and (summary is null or requested_at>calculated_at or calculated_at<now()-interval '3 minutes'
     or refresh_completed_at is null and refresh_requested_at is not null or refresh_requested_at>refresh_completed_at
     or refresh_progress->>'complete'='false')
 returning * into result;
 if not found then return null; end if;
 return jsonb_build_object('lease',result.lease_token,'previousCollectionRevision',result.collection_revision,'refreshRequestedAt',result.refresh_requested_at,
   'refreshCompletedAt',result.refresh_completed_at,'refreshProgress',result.refresh_progress,'inputs',api.collection_valuation_inputs(p_owner));
end $$;

create function api.publish_collection_valuation(p_owner uuid,p_lease uuid,p_revision text,p_summary jsonb,p_refresh_completed timestamptz default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
 if api.collection_valuation_inputs(p_owner)->>'collectionRevision'<>p_revision then
   update public.collection_valuation_generations set lease_token=null,lease_until=null where owner_id=p_owner and lease_token=p_lease;
   return false;
 end if;
 update public.collection_valuation_generations set collection_revision=p_revision,valuation_revision=(p_summary->>'valuationRevision')::uuid,
   summary=p_summary,calculated_at=now(),lease_token=null,lease_until=null,
   refresh_completed_at=coalesce(p_refresh_completed,refresh_completed_at)
 where owner_id=p_owner and lease_token=p_lease and lease_until>now();
 if not found then return false; end if;
 if p_summary->'trend'->>'eligible'='true' and (p_summary->>'totalUnits')::integer>0
   and p_summary->>'freshUnits'=p_summary->>'totalUnits' and (p_summary->>'unpricedUnits')::integer=0 then
   insert into public.collection_valuation_history(owner_id,scope,bucket_at,point_at,total,evidence)
   select p_owner,p_summary->'trend'->>'scope',date_bin(interval '30 minutes',now(),timestamptz '1970-01-01'),
     now(),(p_summary->>'total')::numeric,p_summary->'trend'->>'evidence'
   where (select evidence from public.collection_valuation_history where owner_id=p_owner and scope=p_summary->'trend'->>'scope'
     order by point_at desc limit 1) is distinct from p_summary->'trend'->>'evidence'
   on conflict(owner_id,scope,bucket_at) do update set point_at=excluded.point_at,total=excluded.total,evidence=excluded.evidence;
 end if;
 delete from public.collection_valuation_history where owner_id=p_owner and bucket_at<now()-interval '90 days';
 return true;
end $$;

revoke all on function api.collection_valuation_inputs(uuid),api.request_collection_valuation(uuid,boolean),api.claim_collection_valuation(uuid),api.publish_collection_valuation(uuid,uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function api.collection_valuation_inputs(uuid),api.request_collection_valuation(uuid,boolean),api.claim_collection_valuation(uuid),api.publish_collection_valuation(uuid,uuid,text,jsonb,timestamptz) to service_role;

create function api.checkpoint_collection_refresh(p_owner uuid,p_lease uuid,p_progress jsonb) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
 update public.collection_valuation_generations set refresh_progress=p_progress,lease_until=now()+interval '5 minutes'
 where owner_id=p_owner and lease_token=p_lease and lease_until>now();
 return found;
end $$;
revoke all on function api.checkpoint_collection_refresh(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function api.checkpoint_collection_refresh(uuid,uuid,jsonb) to service_role;

create index if not exists market_exact_shared_latest on public.market_price_snapshots(card_id,calculated_at desc) where user_id is null;
create function api.latest_stored_exact_prices(p_variants uuid[]) returns setof jsonb
language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('variantId',v,'estimate',(
   select to_jsonb(e) from api.market_price_estimates e where e.variant_id=v and e.product_kind='raw_card'
     and e.condition_code='raw_near_mint' and e.display_currency_code='GBP' and e.fallback_identity_key is null
     order by e.calculated_at desc limit 1), 'snapshot',(
   select to_jsonb(s) from public.market_price_snapshots s where s.user_id is null and s.card_id=v::text
     and coalesce(s.pricing_identity_json->>'canonicalVariantId',s.pricing_identity_json->>'canonical_variant_id')=v::text
     and to_jsonb(s)->>'set_id'=c.set_id::text and to_jsonb(s)->>'language'=c.language_code
     and coalesce(s.pricing_identity_json->>'canonicalPrintingId',c.printing_id::text)=c.printing_id::text
     and s.pricing_identity_json->>'productType'='raw_card'
     and coalesce(s.pricing_identity_json->>'rawCondition',s.pricing_identity_json->>'condition')='raw_near_mint'
     order by s.calculated_at desc nulls last,s.id desc limit 1))
 from unnest(p_variants) v join api.catalogue_cards c on c.variant_id=v where array_length(p_variants,1)<=200;
$$;
revoke all on function api.latest_stored_exact_prices(uuid[]) from public,anon,authenticated;
grant execute on function api.latest_stored_exact_prices(uuid[]) to service_role;

create table public.catalogue_price_identity_leases(variant_id uuid primary key,token uuid not null,lease_until timestamptz not null);
alter table public.catalogue_price_identity_leases enable row level security;
revoke all on public.catalogue_price_identity_leases from public,anon,authenticated;
grant all on public.catalogue_price_identity_leases to service_role;
create function api.claim_price_identity(p_variant uuid) returns uuid language plpgsql security invoker set search_path = '' as $$
declare claimed uuid;
begin
 insert into public.catalogue_price_identity_leases values(p_variant,gen_random_uuid(),now()+interval '1 minute')
 on conflict(variant_id) do update set token=excluded.token,lease_until=excluded.lease_until
 where catalogue_price_identity_leases.lease_until<=now() returning token into claimed;
 return claimed;
end $$;
revoke all on function api.claim_price_identity(uuid) from public,anon,authenticated;
grant execute on function api.claim_price_identity(uuid) to service_role;

-- Small publication-priority lane using the existing exact queue. The initial
-- catalogue belongs to the full cycle; only changes relative to its frozen
-- identity snapshot are discovered here. Markers prevent repeated first-page work.
create table public.catalogue_price_priority_markers(variant_id uuid primary key,identity jsonb not null,queued_at timestamptz not null default now());
alter table public.catalogue_price_priority_markers enable row level security;
revoke all on public.catalogue_price_priority_markers from public,anon,authenticated;
grant all on public.catalogue_price_priority_markers to service_role;
create table public.catalogue_price_repair_signals(variant_id uuid primary key,revision uuid not null default gen_random_uuid());
alter table public.catalogue_price_repair_signals enable row level security;
revoke all on public.catalogue_price_repair_signals from public,anon,authenticated;
grant all on public.catalogue_price_repair_signals to service_role;
create function api.catalogue_price_priority_candidates(p_limit integer default 12) returns setof jsonb
language sql stable security invoker set search_path = '' as $$
 with latest as (select id from public.catalogue_price_cycles order by started_at desc limit 1)
 select i.identity || case when repair.revision is null then '{}'::jsonb else jsonb_build_object('repairRevision',repair.revision) end from api.catalogue_cards c cross join latest
 cross join lateral (select jsonb_build_object('variantId',c.variant_id,'printingId',c.printing_id,
   'setId',c.set_id,'language',c.language_code,'variantCode',c.variant_code,'finishCode',c.finish_code,
   'catalogueVersionId',c.catalogue_version_id) identity) i
 left join public.catalogue_price_items old on old.cycle_id=latest.id and old.variant_id=c.variant_id
 left join public.catalogue_price_priority_markers marker on marker.variant_id=c.variant_id
 left join public.catalogue_price_repair_signals repair on repair.variant_id=c.variant_id
 where (i.identity is distinct from old.identity or repair.revision is not null)
   and (i.identity || case when repair.revision is null then '{}'::jsonb else jsonb_build_object('repairRevision',repair.revision) end) is distinct from marker.identity
 order by c.variant_id limit greatest(0,least(p_limit,30));
$$;
create function api.published_price_catalogue_revision() returns jsonb
language sql stable security invoker set search_path = '' as $$
 select coalesce(jsonb_object_agg(language_code,catalogue_version_id),'{}'::jsonb)
 from (select distinct language_code,catalogue_version_id from api.catalogue_cards) revisions;
$$;
revoke all on function api.catalogue_price_priority_candidates(integer),api.published_price_catalogue_revision() from public,anon,authenticated;
grant execute on function api.catalogue_price_priority_candidates(integer),api.published_price_catalogue_revision() to service_role;

-- History belongs to the owner and never contains individual holdings. Only
-- comparable complete, fresh generations create points; polling creates none.
create table public.collection_valuation_history (
 owner_id uuid not null references auth.users(id) on delete cascade,
 scope text not null,bucket_at timestamptz not null,point_at timestamptz not null,
 total numeric not null check(total>=0),evidence text not null,
 primary key(owner_id,scope,bucket_at)
);
alter table public.collection_valuation_history enable row level security;
revoke all on public.collection_valuation_history from public,anon,authenticated;
grant all on public.collection_valuation_history to service_role;
create function api.collection_valuation_trend(p_owner uuid,p_scope text) returns jsonb
language sql stable security invoker set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('at',point_at,'total',total,'evidence',evidence) order by point_at),'[]'::jsonb)
 from (select point_at,total,evidence from public.collection_valuation_history where owner_id=p_owner and scope=p_scope
   and bucket_at>=now()-interval '31 days' order by point_at desc limit 1441) recent;
$$;
revoke all on function api.collection_valuation_trend(uuid,text) from public,anon,authenticated;
grant execute on function api.collection_valuation_trend(uuid,text) to service_role;

-- Alias repairs are observed transactionally, even without a new publication
-- version. Only published variants in the changed language/version are signalled.
create function api.signal_catalogue_price_alias_repair() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare old_row jsonb; new_row jsonb; changed jsonb;
begin
 if TG_OP<>'INSERT' then old_row=to_jsonb(OLD); end if;
 if TG_OP<>'DELETE' then new_row=to_jsonb(NEW); end if;
 if old_row is not distinct from new_row then return null; end if;
 for changed in select value from jsonb_array_elements(jsonb_build_array(old_row,new_row)) loop
   insert into public.catalogue_price_repair_signals(variant_id)
   select c.variant_id from api.catalogue_cards c
   where c.catalogue_version_id=(changed->>'catalogue_version_id')::uuid and c.language_code=changed->>'language_code'
     and (c.variant_id=(changed->>'variant_id')::uuid or c.printing_id=(changed->>'printing_id')::uuid
       or changed->>'variant_id' is null and changed->>'printing_id' is null and c.set_id=(changed->>'set_id')::uuid)
   on conflict(variant_id) do update set revision=gen_random_uuid();
 end loop;
 return null;
end $$;
revoke all on function api.signal_catalogue_price_alias_repair() from public,anon,authenticated;
grant execute on function api.signal_catalogue_price_alias_repair() to service_role;
create trigger catalogue_price_alias_repair after insert or update or delete on catalog.catalogue_version_external_identifiers
 for each row execute function api.signal_catalogue_price_alias_repair();
