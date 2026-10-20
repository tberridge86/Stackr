-- Starting a provider sweep used to enumerate every published `api.catalogue_cards`
-- row twice in one transaction.  That view is deliberately rich, and production's
-- request timeout can expire before a checkpoint is committed.  Keep run creation
-- bounded; initialise outcomes in small, durable pages using only the publication
-- relations needed by the original view.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table market.catalogue_bulk_outcome_seed (
  catalogue_version_id uuid primary key references catalog.catalogue_versions(id) on delete cascade,
  after_variant_id uuid,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table market.catalogue_bulk_outcome_seed enable row level security;
create policy "service manages bulk outcome seed" on market.catalogue_bulk_outcome_seed
  for all to service_role using (true) with check (true);
revoke all on market.catalogue_bulk_outcome_seed from public, anon, authenticated;
grant select, insert, update, delete on market.catalogue_bulk_outcome_seed to service_role;

create or replace function api.seed_catalogue_bulk_price_outcomes(p_limit integer default 500)
returns jsonb
language plpgsql security invoker set search_path='' as $function$
declare seed market.catalogue_bulk_outcome_seed; scanned integer; written integer; next_variant uuid;
begin
  if coalesce(p_limit, 0) not between 1 and 500 then
    raise exception 'invalid bulk outcome seed limit' using errcode='22023';
  end if;

  -- Every currently published catalogue revision gets one durable cursor. A
  -- completed revision is never scanned again unless publication creates a new
  -- revision, so daily provider runs do not re-walk the whole catalogue.
  insert into market.catalogue_bulk_outcome_seed(catalogue_version_id)
  select cv.id
  from catalog.catalogue_versions cv
  where cv.status='published' and cv.deprecated_at is null
  on conflict(catalogue_version_id) do nothing;

  select s.* into seed
  from market.catalogue_bulk_outcome_seed s
  join catalog.catalogue_versions cv on cv.id=s.catalogue_version_id
    and cv.status='published' and cv.deprecated_at is null
  where s.completed_at is null
  order by s.updated_at,s.catalogue_version_id
  for update of s skip locked
  limit 1;
  if not found then
    return jsonb_build_object('complete',not exists(
      select 1 from market.catalogue_bulk_outcome_seed s
      join catalog.catalogue_versions cv on cv.id=s.catalogue_version_id
        and cv.status='published' and cv.deprecated_at is null
      where s.completed_at is null
    ),'deferred',exists(
      select 1 from market.catalogue_bulk_outcome_seed s
      join catalog.catalogue_versions cv on cv.id=s.catalogue_version_id
        and cv.status='published' and cv.deprecated_at is null
      where s.completed_at is null
    ),'scanned',0,'written',0);
  end if;

  with page as materialized (
    select v.id as variant_id,cv.id as catalogue_version_id,
      case when v.language_code not in ('en','ja') then 'unsupported_provider_language'
        when api.catalogue_provider_subtype(v.variant_code,v.finish_code) is null then 'unsupported_provider_finish'
        else 'unresolved_provider_identity' end as reason,
      case when v.language_code not in ('en','ja') or api.catalogue_provider_subtype(v.variant_code,v.finish_code) is null
        then now()+interval '7 days' else now()+interval '1 day' end as next_retry_at
    from catalog.catalogue_version_variants cvv
    join catalog.catalogue_versions cv on cv.id=cvv.catalogue_version_id
      and cv.id=seed.catalogue_version_id and cv.status='published' and cv.deprecated_at is null
    join catalog.card_variants v on v.id=cvv.variant_id and v.deprecated_at is null
    join catalog.card_printings p on p.id=v.printing_id and p.deprecated_at is null
    join catalog.sets sets on sets.id=p.set_id and sets.deprecated_at is null
    join catalog.languages language on language.code=v.language_code
    where seed.after_variant_id is null or v.id>seed.after_variant_id
    order by v.id
    limit p_limit
  ), upserted as (
    insert into market.catalogue_price_outcomes(variant_id,catalogue_version_id,reason,checked_at,next_retry_at,provider)
    select variant_id,catalogue_version_id,reason,now(),next_retry_at,'tcgcsv' from page
    on conflict(variant_id) do update
      set catalogue_version_id=excluded.catalogue_version_id,reason=excluded.reason,
          checked_at=excluded.checked_at,next_retry_at=excluded.next_retry_at
      where market.catalogue_price_outcomes.catalogue_version_id<>excluded.catalogue_version_id
    returning 1
  )
  select count(*),coalesce((array_agg(variant_id order by variant_id desc))[1],null),
    (select count(*) from upserted)
  into scanned,next_variant,written
  from page;

  update market.catalogue_bulk_outcome_seed
  set after_variant_id=next_variant,
      completed_at=case when scanned<p_limit then now() else null end,
      updated_at=now()
  where catalogue_version_id=seed.catalogue_version_id;

  return jsonb_build_object(
    'complete',not exists(
      select 1 from market.catalogue_bulk_outcome_seed s
      join catalog.catalogue_versions cv on cv.id=s.catalogue_version_id
        and cv.status='published' and cv.deprecated_at is null
      where s.completed_at is null
    ),
    'deferred',false,'catalogueVersionId',seed.catalogue_version_id,
    'scanned',scanned,'written',written
  );
end;
$function$;

-- Preserve run idempotence and the catalogue-set repair ledger without
-- consulting presentation views. The repair lookup starts from a set's indexed
-- printings and stops at the first eligible published variant.
create or replace function api.begin_catalogue_bulk_sweep(p_dataset timestamptz,p_groups jsonb)
returns jsonb
language plpgsql security invoker set search_path='' as $function$
declare rid uuid; g jsonb;
begin
  if p_dataset is null or p_dataset>now()+interval '5 minutes' or jsonb_typeof(p_groups) is distinct from 'array'
    or jsonb_array_length(p_groups) not between 1 and 5000 then raise exception 'invalid provider manifest'; end if;
  insert into market.catalogue_bulk_runs(dataset_at) values(p_dataset)
    on conflict(dataset_at) do update set dataset_at=excluded.dataset_at
    returning id into rid;
  for g in select * from jsonb_array_elements(p_groups) loop
    insert into market.catalogue_bulk_groups(run_id,category_id,group_id,language_code,manifest)
    values(rid,(g->>'categoryId')::integer,(g->>'groupId')::bigint,g->>'language',g)
    on conflict(run_id,category_id,group_id) do update set manifest=excluded.manifest;
  end loop;
  insert into market.catalogue_price_repairs(repair_key,category_id,reason,detail)
  select distinct 'catalogue-set:'||s.id,case s.language_code when 'en' then 3 when 'ja' then 85 end,
    'no_mapped_provider_set',jsonb_build_object('set_id',s.id,'language_code',s.language_code)
  from catalog.catalogue_version_sets cvs
  join catalog.catalogue_versions cv on cv.id=cvs.catalogue_version_id
    and cv.status='published' and cv.deprecated_at is null
  join catalog.sets s on s.id=cvs.set_id and s.deprecated_at is null
  join catalog.languages language on language.code=s.language_code
  where s.language_code in ('en','ja')
    and exists(
      select 1 from catalog.card_printings p
      join catalog.card_variants v on v.printing_id=p.id and v.deprecated_at is null
      join catalog.catalogue_version_variants cvv on cvv.variant_id=v.id
        and cvv.catalogue_version_id=cvs.catalogue_version_id
      where p.set_id=s.id and p.deprecated_at is null
        and api.catalogue_provider_subtype(v.variant_code,v.finish_code) is not null
    )
    and not exists(
      select 1 from market.catalogue_provider_set_members m
      join market.catalogue_bulk_groups bg on bg.run_id=rid
        and bg.category_id=m.category_id and bg.group_id=m.group_id
      where m.set_id=s.id and m.language_code=s.language_code
    )
  on conflict(repair_key) do update
    set detail=excluded.detail,status='open',last_seen_at=now();
  return jsonb_build_object('runId',rid,'status','resumable',
    'totalGroups',(select count(*) from market.catalogue_bulk_groups where run_id=rid));
end;
$function$;

-- Health deliberately reads only durable sweep and price-guide ledgers. The
-- detailed coverage RPC remains available for operator analysis, but its
-- catalogue-wide presentation join must never decide whether an import ran.
create function api.catalogue_bulk_sweep_health(p_run uuid default null)
returns jsonb
language sql stable security invoker set search_path='' as $function$
  with target as (
    select coalesce(p_run,(select id from market.catalogue_bulk_runs order by dataset_at desc limit 1)) as run_id
  ), groups as (
    select g.category_id,g.status,count(*)::integer as total
    from market.catalogue_bulk_groups g join target t on t.run_id=g.run_id
    group by g.category_id,g.status
  ), quotes as (
    select provider,language_code,count(*)::integer as total,
      count(*) filter(where stale_after<=now())::integer as stale
    from market.catalogue_general_prices group by provider,language_code
  ), outcomes as (
    select count(*)::integer as total,
      count(*) filter(where reason='no_provider_quote')::integer as no_provider_quote,
      count(*) filter(where reason='unsupported_provider_language')::integer as unsupported_language,
      count(*) filter(where reason='unsupported_provider_finish')::integer as unsupported_finish
    from market.catalogue_price_outcomes
  ), repairs as (select count(*)::integer as open from market.catalogue_price_repairs where status='open')
  select jsonb_build_object(
    'runId',(select run_id from target),
    'datasetAt',(select dataset_at from market.catalogue_bulk_runs r join target t on t.run_id=r.id),
    'groups',coalesce((select jsonb_agg(jsonb_build_object('categoryId',category_id,'status',status,'total',total) order by category_id,status) from groups),'[]'::jsonb),
    'quotes',coalesce((select jsonb_agg(jsonb_build_object('provider',provider,'languageCode',language_code,'total',total,'stale',stale) order by provider,language_code) from quotes),'[]'::jsonb),
    'outcomes',(select to_jsonb(outcomes) from outcomes),
    'openRepairs',(select open from repairs),
    'runStatus',case
      when not exists(select 1 from groups) then 'not_started'
      when exists(select 1 from groups where status in ('pending','running','failed')) then 'partial'
      when exists(select 1 from groups where status='unmapped') or (select open from repairs)>0 then 'needs_mapping'
      else 'complete' end
  );
$function$;

revoke all on function api.seed_catalogue_bulk_price_outcomes(integer) from public,anon,authenticated;
grant execute on function api.seed_catalogue_bulk_price_outcomes(integer) to service_role;
revoke all on function api.catalogue_bulk_sweep_health(uuid) from public,anon,authenticated;
grant execute on function api.catalogue_bulk_sweep_health(uuid) to service_role;
