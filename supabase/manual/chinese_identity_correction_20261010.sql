-- Reviewed false Simplified Chinese duplicate correction; production only.
-- Deploy the reviewed old-ID resolver before COMMIT. Never change languages,
-- merge IDs, copy prices/artwork, or rewrite user holdings.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table catalog.sets,catalog.card_printings,catalog.card_variants in share row exclusive mode;
create temporary table chinese_printing_pairs on commit drop as
select s.id as simplified_set_id, s.set_code, p.id as printing_id,
  p.collector_number, p.native_name,
  coalesce(to_jsonb(p)->>'printing_discriminator','') as printing_discriminator,
  t.id as traditional_printing_id, ts.id as traditional_set_id
from catalog.sets s
join catalog.card_printings p on p.set_id=s.id and p.language_code='zh-cn' and p.deprecated_at is null
join catalog.sets ts on ts.game_code=s.game_code and ts.set_code=s.set_code
  and ts.language_code='zh-tw' and ts.deprecated_at is null
join catalog.card_printings t on t.set_id=ts.id and t.language_code='zh-tw'
  and t.collector_number=p.collector_number and t.native_name=p.native_name
  and coalesce(to_jsonb(t)->>'printing_discriminator','')=coalesce(to_jsonb(p)->>'printing_discriminator','')
  and t.deprecated_at is null
where s.language_code='zh-cn' and s.deprecated_at is null
  and (s.id,s.set_code) in (
    ('4719ccc9-35c0-406a-b2c2-989af15d77b0'::uuid,'SV7a'),
    ('66d9e865-7d40-4b2e-8ef0-ae24fca87673'::uuid,'SV8'),
    ('a16f8d4c-d648-4bee-a219-9abc2aae49a6'::uuid,'SV8a'),
    ('b67bee5b-da76-4575-a263-ab9cb69d4d7b'::uuid,'SV9'),
    ('1dbfe92e-8914-49b2-974c-47683cf51d4d'::uuid,'SV10'));


create temporary table chinese_set_pairs on commit drop as select distinct simplified_set_id source_id,traditional_set_id target_id from chinese_printing_pairs;
create temporary table chinese_variant_pairs on commit drop as
select v.id source_id,tv.id target_id,v.printing_id source_printing_id,tv.printing_id target_printing_id
from chinese_printing_pairs p
join catalog.card_variants v on v.printing_id=p.printing_id and v.language_code='zh-cn' and v.deprecated_at is null
join catalog.card_variants tv on tv.printing_id=p.traditional_printing_id and tv.language_code='zh-tw'
  and tv.variant_code=v.variant_code and tv.finish_code=v.finish_code and tv.deprecated_at is null;

create temporary table chinese_old_reference_ids on commit drop as
select source_id::text value from chinese_set_pairs union select printing_id::text from chinese_printing_pairs
union select source_id::text from chinese_variant_pairs
union select 'zh-cn:'||set_code from chinese_printing_pairs
union select 'zh-cn:'||set_code||'-'||collector_number from chinese_printing_pairs
union select 'zh-cn:'||set_code||':'||collector_number from chinese_printing_pairs
union select canonical_key from catalog.card_variants where id in(select source_id from chinese_variant_pairs);

do $guard$
declare ref record; reference_count bigint;
begin
  if (select count(*) from chinese_set_pairs)<>5 or (select count(*) from chinese_printing_pairs)<>605
    or (select count(distinct printing_id) from chinese_printing_pairs)<>605
    or (select count(*) from chinese_variant_pairs)<>750
    or (select count(distinct source_id) from chinese_variant_pairs)<>750
    or (select count(distinct target_id) from chinese_variant_pairs)<>750 then
    raise exception 'Exact reviewed 5/605/750 correction cohort has drifted';
  end if;
  if (select md5(string_agg(source_id::text||':'||target_id::text,',' order by source_id)) from chinese_set_pairs)<>'de6c97ccdd1548ffc9604b407876a5c4'
    or (select md5(string_agg(printing_id::text||':'||traditional_printing_id::text,',' order by printing_id)) from chinese_printing_pairs)<>'c03c33e8deae5bfd0ca7cdea05fc5d51'
    or (select md5(string_agg(source_id::text||':'||target_id::text,',' order by source_id)) from chinese_variant_pairs)<>'0dcc5a5aeafe04aaaa3fd0d854ff2f4f' then
    raise exception 'Database correction targets differ from reviewed runtime aliases';
  end if;
  if exists(select 1 from catalog.sets s join chinese_set_pairs p on p.source_id=s.id where s.corrected_by_set_id is not null)
    or exists(select 1 from catalog.card_printings s join chinese_printing_pairs p on p.printing_id=s.id where s.corrected_by_printing_id is not null)
    or exists(select 1 from catalog.card_variants s join chinese_variant_pairs p on p.source_id=s.id where s.corrected_by_variant_id is not null) then
    raise exception 'A source identity has an existing correction';
  end if;
  if (select count(*) from api.catalogue_sets where set_id in(select target_id from chinese_set_pairs) and language_code='zh-tw')<>5
    or (select count(distinct printing_id) from api.catalogue_cards where printing_id in(select traditional_printing_id from chinese_printing_pairs) and language_code='zh-tw')<>605
    or (select count(distinct variant_id) from api.catalogue_cards where variant_id in(select target_id from chinese_variant_pairs) and language_code='zh-tw')<>750 then
    raise exception 'Correction targets must remain published Traditional Chinese identities';
  end if;
  if exists(select 1 from catalog.assets where set_id in(select source_id from chinese_set_pairs)
      or printing_id in(select printing_id from chinese_printing_pairs) or variant_id in(select source_id from chinese_variant_pairs))
    or exists(select 1 from catalog.catalogue_version_assets where set_id in(select source_id from chinese_set_pairs)
      or printing_id in(select printing_id from chinese_printing_pairs) or variant_id in(select source_id from chinese_variant_pairs)) then
    raise exception 'Source artwork exists; requires separate review';
  end if;
  -- Aggregate guards only; never read or change personal collector contents.
  for ref in select table_name,column_name from information_schema.columns
    where table_schema='public' and table_name in
      ('user_card_variants','binder_cards','binder_card_showcases','user_card_flags','profiles',
       'marketplace_listings','seller_inventory_items','seller_sale_transaction_items','inventory_movements',
       'trade_listings','trade_offer_cards','wanted_cards','user_pokedex_cards','market_watchlist',
       'price_alerts','social_posts','activity_feed','notifications','market_price_snapshots')
    and (column_name in('card_id','api_card_id','set_id','favorite_card_id','chase_card_id','stackr_card_id'))
  loop
    execute format('lock table public.%I in share mode',ref.table_name);
    execute format('select count(*) from public.%I where lower(%I::text) in(select lower(value) from chinese_old_reference_ids)',ref.table_name,ref.column_name)
      into reference_count;
    if reference_count<>0 then raise exception 'Affected reference exists in %.%; explicit reference reconciliation required',ref.table_name,ref.column_name; end if;
  end loop;
  if exists(select 1 from market.market_identities where variant_id in(select source_id from chinese_variant_pairs))
    or exists(select 1 from market.sold_observations where variant_id in(select source_id from chinese_variant_pairs))
    or exists(select 1 from market.price_estimates where variant_id in(select source_id from chinese_variant_pairs))
    or exists(select 1 from market.active_listings where variant_id in(select source_id from chinese_variant_pairs))
    or exists(select 1 from market.catalogue_general_prices where variant_id in(select source_id from chinese_variant_pairs) or printing_id in(select printing_id from chinese_printing_pairs)) then
    raise exception 'Affected market evidence exists; preserve it through a separate reviewed repair';
  end if;
  if (select count(*) from catalog.catalogue_versions where language_code='zh-cn' and status='published' and deprecated_at is null)<>1 then
    raise exception 'Expected exactly one published Simplified Chinese version';
  end if;
end $guard$;

insert into audit.catalogue_events(request_id,actor_role,event_type,entity_schema,entity_table,event_payload)
values('chinese-identity-correction-20261010','catalogue_repair','chinese_identity_correction_before','catalog','sets',
 jsonb_build_object('set_pairs',(select jsonb_agg(to_jsonb(p)) from chinese_set_pairs p),
 'printing_pairs',(select jsonb_agg(to_jsonb(p)) from chinese_printing_pairs p),
 'variant_pairs',(select jsonb_agg(to_jsonb(p)) from chinese_variant_pairs p),
 'before_state','all source deprecated/corrected fields null; no affected collector or market references'));

update catalog.card_variants v set deprecated_at=now(),deprecated_reason='chinese_language_duplicate_corrected_20261010',corrected_by_variant_id=p.target_id
from chinese_variant_pairs p where v.id=p.source_id;
update catalog.card_printings v set deprecated_at=now(),deprecated_reason='chinese_language_duplicate_corrected_20261010',corrected_by_printing_id=p.traditional_printing_id
from chinese_printing_pairs p where v.id=p.printing_id;
update catalog.sets v set deprecated_at=now(),deprecated_reason='chinese_language_duplicate_corrected_20261010',corrected_by_set_id=p.target_id
from chinese_set_pairs p where v.id=p.source_id;

insert into catalog.catalogue_change_log(catalogue_version_id,entity_schema,entity_table,entity_id,entity_key,change_type,mobile_syncable,public_change_summary)
select cv.id,'catalog',p.entity_table,p.source_id,'chinese-identity-correction-20261010:'||p.source_id::text,
 'deprecate',true,jsonb_build_object('reason','incorrect_simplified_chinese_duplicate','correctedById',p.target_id,
 'originalLanguage','zh-cn','correctedLanguage','zh-tw')
from (
 select 'sets' entity_table,source_id,target_id from chinese_set_pairs
 union all select 'card_printings',printing_id,traditional_printing_id from chinese_printing_pairs
 union all select 'card_variants',source_id,target_id from chinese_variant_pairs
) p cross join catalog.catalogue_versions cv
where cv.language_code='zh-cn' and cv.status='published' and cv.deprecated_at is null
and not exists(select 1 from catalog.catalogue_change_log l where l.entity_key='chinese-identity-correction-20261010:'||p.source_id::text and l.change_type='deprecate');

update catalog.catalogue_versions cv set max_change_sequence=(
 select max(change_sequence) from catalog.catalogue_change_log where catalogue_version_id=cv.id)
where cv.language_code='zh-cn' and cv.status='published' and cv.deprecated_at is null;

do $resolve$
declare resolved_count integer;
begin
update ingest.data_conflicts c set status='resolved',resolved_at=now(),
 resolution_notes='False Simplified Chinese duplicate retired; canonical IDs retained with exact Traditional Chinese corrections. No source language retag, user-reference rewrite, image or price transfer.'
from chinese_printing_pairs p, ingest.sources s
where s.id=c.source_id and s.code='tcgdex' and c.conflict_type='identity_collision'
and c.entity_id=p.printing_id and c.canonical_key='chinese-language-conflict-20261010:'||p.printing_id::text
and c.status='open' and c.proposed_payload->>'cohort'='chinese-language-conflicts-20261010';
get diagnostics resolved_count = row_count;
if resolved_count<>605 then raise exception 'Expected exactly 605 reviewed open conflicts'; end if;
end $resolve$;

do $verify$
begin
 if exists(select 1 from api.catalogue_sets where set_id in(select source_id from chinese_set_pairs))
   or exists(select 1 from api.catalogue_cards where variant_id in(select source_id from chinese_variant_pairs)) then
   raise exception 'False Simplified Chinese identities remain published';
 end if;
 if (select count(*) from catalog.card_variants v join chinese_variant_pairs p on p.source_id=v.id
   where v.corrected_by_variant_id=p.target_id and v.deprecated_at is not null)<>750 then
   raise exception 'Retained variant correction receipt incomplete';
 end if;
 if (select count(*) from api.catalogue_delta_changes where entity_key like 'chinese-identity-correction-20261010:%')<>1360 then
   raise exception 'Expected 1360 public mobile deprecation/correction changes';
 end if;
end $verify$;
-- Rehearsal defaults to rollback. Change this one terminator to COMMIT only
-- after the reviewed resolver is live and the returned receipt is checked.
rollback;
select 'REHEARSAL_ROLLED_BACK' result;
