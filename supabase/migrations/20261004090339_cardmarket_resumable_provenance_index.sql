set local lock_timeout='5s';
set local statement_timeout='60s';

create table market.cardmarket_provenance_runs (
 id uuid primary key default gen_random_uuid(), observed_until timestamptz not null, version_snapshot jsonb not null,
 status text not null default 'running' check(status in('running','complete','failed')),
 cursor_catalogue_version_id uuid, cursor_source_id uuid, cursor_source_entity_type text, cursor_external_id text, cursor_language_code text,
 processed_identifiers integer not null default 0, created_at timestamptz not null default now(), completed_at timestamptz
);
create table market.cardmarket_provenance_observations (
 run_id uuid not null references market.cardmarket_provenance_runs(id) on delete cascade,
 provider_product_id bigint not null, printing_id uuid not null references catalog.card_printings(id), language_code text not null,
 catalogue_version_id uuid not null references catalog.catalogue_versions(id), external_id text not null, raw_record_id uuid not null,
 payload_hash text, source_updated_at timestamptz, retrieved_at timestamptz not null, variant_id uuid not null, variant_code text, finish_code text,
 primary key(run_id,provider_product_id,printing_id,language_code,catalogue_version_id,external_id,variant_id)
);
create index cardmarket_provenance_observation_candidate_idx on market.cardmarket_provenance_observations(run_id,provider_product_id,printing_id,language_code,catalogue_version_id);
alter table market.cardmarket_provenance_runs enable row level security; alter table market.cardmarket_provenance_observations enable row level security;
create policy "service manages Cardmarket provenance runs" on market.cardmarket_provenance_runs for all to service_role using(true) with check(true);
create policy "service manages Cardmarket provenance observations" on market.cardmarket_provenance_observations for all to service_role using(true) with check(true);
revoke all on market.cardmarket_provenance_runs,market.cardmarket_provenance_observations from public,anon,authenticated;
grant select,insert,update,delete on market.cardmarket_provenance_runs,market.cardmarket_provenance_observations to service_role;

create function api.begin_cardmarket_provenance_run() returns jsonb language plpgsql security invoker set search_path='' as $f$
declare run_id uuid; snapshot jsonb;
begin
 select coalesce(jsonb_object_agg(language_code,id order by language_code),'{}'::jsonb) into snapshot from (
  select distinct on(language_code) language_code,id from catalog.catalogue_versions where status='published' and deprecated_at is null
  order by language_code,published_at desc nulls last,created_at desc,id desc) v;
 insert into market.cardmarket_provenance_runs(observed_until,version_snapshot) values(now(),snapshot) returning id into run_id;
 return jsonb_build_object('runId',run_id,'status','running','versions',snapshot);
end $f$;

create function api.process_cardmarket_provenance_page(p_run uuid) returns jsonb language plpgsql security invoker set search_path='' as $f$
declare r market.cardmarket_provenance_runs; page_count integer; last_row record;
begin
 select * into r from market.cardmarket_provenance_runs where id=p_run for update; if not found then raise exception 'unknown provenance run'; end if;
 if r.status <> 'running' then return jsonb_build_object('status',r.status,'processed',0); end if;
 create temporary table if not exists pg_temp.cardmarket_provenance_page on commit drop as select null::uuid catalogue_version_id,null::uuid source_id,null::text source_entity_type,null::text external_id,null::text language_code,null::uuid printing_id,null::uuid variant_id where false;
 truncate pg_temp.cardmarket_provenance_page;
 insert into pg_temp.cardmarket_provenance_page with versions as (select key language_code,value::text::uuid id from jsonb_each_text(r.version_snapshot)), page as materialized (
  select i.catalogue_version_id,i.source_id,i.source_entity_type,i.external_id,i.language_code,i.printing_id,i.variant_id
  from catalog.catalogue_version_external_identifiers i join versions v on v.id=i.catalogue_version_id and v.language_code=i.language_code
  join ingest.sources s on s.id=i.source_id and s.code='tcgdex'
  join catalog.catalogue_version_variants version_variant on version_variant.catalogue_version_id=i.catalogue_version_id and version_variant.variant_id=i.variant_id
  where (r.cursor_catalogue_version_id is null or (i.catalogue_version_id,i.source_id,i.source_entity_type,i.external_id,i.language_code) > (r.cursor_catalogue_version_id,r.cursor_source_id,r.cursor_source_entity_type,r.cursor_external_id,r.cursor_language_code))
  order by i.catalogue_version_id,i.source_id,i.source_entity_type,i.external_id,i.language_code limit 500
 ) select * from page;
 select count(*) into page_count from pg_temp.cardmarket_provenance_page;
 if page_count=0 then update market.cardmarket_provenance_runs set status='complete',completed_at=now() where id=p_run; return jsonb_build_object('status','complete','processed',0); end if;
 with observed as (
  select p.*,v.printing_id actual_printing_id,v.language_code actual_language,v.variant_code,v.finish_code,raw.id raw_record_id,raw.payload_hash,raw.source_updated_at,raw.retrieved_at,raw.raw_payload
    from pg_temp.cardmarket_provenance_page p join catalog.card_variants v on v.id=p.variant_id and v.deprecated_at is null and v.language_code=p.language_code
  join catalog.card_printings cp on cp.id=v.printing_id and cp.deprecated_at is null and cp.language_code=p.language_code
  join lateral (select * from ingest.raw_source_records x where x.source_id=p.source_id and x.external_id=p.external_id and x.language_code=p.language_code and x.deprecated_at is null and x.retrieved_at<=r.observed_until order by coalesce(x.source_updated_at,x.retrieved_at) desc,x.retrieved_at desc,x.id desc limit 1) raw on true
  where (p.printing_id is null or p.printing_id=v.printing_id) and jsonb_typeof(raw.raw_payload->'pricing'->'cardmarket'->'idProduct')='number' and raw.raw_payload->'pricing'->'cardmarket'->>'idProduct' ~ '^[1-9][0-9]*$'
 ) insert into market.cardmarket_provenance_observations(run_id,provider_product_id,printing_id,language_code,catalogue_version_id,external_id,raw_record_id,payload_hash,source_updated_at,retrieved_at,variant_id,variant_code,finish_code)
 select p_run,(raw_payload->'pricing'->'cardmarket'->>'idProduct')::bigint,actual_printing_id,actual_language,catalogue_version_id,external_id,raw_record_id,payload_hash,source_updated_at,retrieved_at,variant_id,variant_code,finish_code from observed on conflict do nothing;
 select * into last_row from pg_temp.cardmarket_provenance_page order by catalogue_version_id desc,source_id desc,source_entity_type desc,external_id desc,language_code desc limit 1;
 update market.cardmarket_provenance_runs set cursor_catalogue_version_id=last_row.catalogue_version_id,cursor_source_id=last_row.source_id,cursor_source_entity_type=last_row.source_entity_type,cursor_external_id=last_row.external_id,cursor_language_code=last_row.language_code,processed_identifiers=processed_identifiers+page_count,status=case when page_count<500 then 'complete' else 'running' end,completed_at=case when page_count<500 then now() else null end where id=p_run;
 return jsonb_build_object('status',case when page_count<500 then 'complete' else 'running' end,'processed',page_count,'cursor',last_row.external_id);
end $f$;
revoke all on function api.begin_cardmarket_provenance_run(),api.process_cardmarket_provenance_page(uuid) from public,anon,authenticated;
grant execute on function api.begin_cardmarket_provenance_run(),api.process_cardmarket_provenance_page(uuid) to service_role;

create function api.list_cardmarket_completed_provenance_candidates(p_run uuid,p_after_product_id bigint default 0,p_limit integer default 100)
returns table(provider_product_id bigint,printing_id uuid,language_code text,catalogue_version_id uuid,provenance jsonb)
language plpgsql stable security invoker set search_path='' as $f$
declare r market.cardmarket_provenance_runs; current_snapshot jsonb;
begin
 if p_limit not between 1 and 500 then raise exception 'invalid provenance candidate page'; end if;
 select * into r from market.cardmarket_provenance_runs where id=p_run; if not found or r.status<>'complete' then raise exception 'provenance run is incomplete'; end if;
 select coalesce(jsonb_object_agg(v.language_code,v.id order by v.language_code),'{}'::jsonb) into current_snapshot from (select distinct on(cv.language_code) cv.language_code,cv.id from catalog.catalogue_versions cv where cv.status='published' and cv.deprecated_at is null order by cv.language_code,cv.published_at desc nulls last,cv.created_at desc,cv.id desc) v;
 if current_snapshot <> r.version_snapshot then raise exception 'provenance run is no longer current'; end if;
 return query select o.provider_product_id,(array_agg(distinct o.printing_id order by o.printing_id))[1],min(o.language_code),(array_agg(distinct o.catalogue_version_id order by o.catalogue_version_id))[1],jsonb_build_object('source','tcgdex','externalIds',jsonb_agg(distinct o.external_id order by o.external_id),'rawRecordIds',jsonb_agg(distinct o.raw_record_id::text order by o.raw_record_id::text),'payloadHashes',jsonb_agg(distinct o.payload_hash order by o.payload_hash),'variantIds',jsonb_agg(distinct o.variant_id::text order by o.variant_id::text),'finishCodes',jsonb_agg(distinct o.finish_code order by o.finish_code),'finishScope','blended_public_guide_not_exact_finish') from market.cardmarket_provenance_observations o where o.run_id=p_run and o.provider_product_id>p_after_product_id group by o.provider_product_id having count(distinct o.printing_id)=1 and count(distinct o.language_code)=1 and count(distinct o.catalogue_version_id)=1 order by o.provider_product_id limit p_limit;
end $f$;
revoke all on function api.list_cardmarket_completed_provenance_candidates(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function api.list_cardmarket_completed_provenance_candidates(uuid,bigint,integer) to service_role;
