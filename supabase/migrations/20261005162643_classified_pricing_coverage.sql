-- Additive classified coverage. Existing provider maps/quotes are never modified.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table market.pricing_classifications (
 variant_id uuid primary key references catalog.card_variants(id),
 catalogue_version_id uuid not null references catalog.catalogue_versions(id),
 printing_id uuid not null, set_id uuid not null, language_code text not null,
 classification text not null check(classification in ('EXACT_PRICE','MARKET_GUIDE','ESTIMATED_VALUE','PRICE_UNAVAILABLE')),
 value_gbp numeric, resolution jsonb not null, evidence_hash text not null,
 checked_at timestamptz not null default now(),
 check((classification='PRICE_UNAVAILABLE' and value_gbp is null) or
       (classification<>'PRICE_UNAVAILABLE' and value_gbp>0 and value_gbp<'Infinity'::numeric))
);
create index pricing_classifications_version_idx on market.pricing_classifications(catalogue_version_id,variant_id);
create table market.pricing_classification_history (
 id bigint generated always as identity primary key,
 variant_id uuid not null, catalogue_version_id uuid not null,
 evidence_hash text not null, resolution jsonb not null, recorded_at timestamptz not null default now()
);
create index pricing_classification_history_variant_idx on market.pricing_classification_history(variant_id,recorded_at desc);
alter table market.pricing_classifications enable row level security;
alter table market.pricing_classification_history enable row level security;
revoke all on market.pricing_classifications,market.pricing_classification_history from public,anon,authenticated;
grant select,insert,update on market.pricing_classifications to service_role;
grant select,insert on market.pricing_classification_history to service_role;
grant usage,select on sequence market.pricing_classification_history_id_seq to service_role;
create policy "service resolves pricing" on market.pricing_classifications for all to service_role using(true) with check(true);
create policy "service reads pricing history" on market.pricing_classification_history for select to service_role using(true);
create policy "service appends pricing history" on market.pricing_classification_history for insert to service_role with check(true);

-- Shared pure policy, exercised against real PostgreSQL fixtures. No rarity-only
-- default prices. Printing/blended evidence cannot establish valuable variants.
create function api.resolve_pricing_classification(p_identity jsonb,p_evidence jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $f$
declare e jsonb; best jsonb; amount numeric; score integer; best_score integer=-1;
 tier text; reason text='no_defensible_market_evidence'; confidence numeric;
 exact_language boolean; exact_finish boolean; max_signal numeric;
begin
 if coalesce((p_identity->>'physical_valid')::boolean,false) is not true then
  reason='invalid_published_identity';
 else
  select max((x->>'value')::numeric) into max_signal from jsonb_array_elements(coalesce(p_evidence,'[]'::jsonb)) x
   where x->>'printing_id'=p_identity->>'printing_id' and x->>'set_id'=p_identity->>'set_id'
    and x->>'currency'='GBP' and x->>'catalogue_version_id'=p_identity->>'catalogue_version_id';
  for e in select value from jsonb_array_elements(coalesce(p_evidence,'[]'::jsonb)) loop
   amount=(e->>'value')::numeric;
   if amount is null or amount<=0 or amount>='Infinity'::numeric
    or e->>'currency' is distinct from 'GBP' or e->>'printing_id' is distinct from p_identity->>'printing_id'
    or e->>'set_id' is distinct from p_identity->>'set_id'
    or e->>'catalogue_version_id' is distinct from p_identity->>'catalogue_version_id'
    or e->>'source_at' is null or e->>'retrieved_at' is null
    or (e->>'source_at')::timestamptz>(e->>'retrieved_at')::timestamptz+interval '5 minutes' then continue; end if;
   exact_language=e->>'language' is not distinct from p_identity->>'language_code';
   exact_finish=e->>'finish' is not distinct from p_identity->>'finish_code'
     and e->>'variant_code' is not distinct from p_identity->>'variant_code';
   score=-1; confidence=0; tier=null;
   if e->>'scope'='exact_variant_market' and exact_language and exact_finish
     and e->>'variant_id'=p_identity->>'variant_id' then
    score=40; confidence=0.85; tier='MARKET_GUIDE';
    -- Provider market aggregates have unspecified raw condition. They cannot
    -- become condition-specific exact prices or completed-sale evidence.
    if amount<2 and max_signal<20 then tier='ESTIMATED_VALUE'; end if;
   elsif e->>'scope'='printing_market' and exact_language then
    if amount<20 and max_signal<20 and p_identity->>'variant_code' in ('normal','standard','default','holo','reverse_holo')
      and p_identity->>'finish_code' in ('normal','standard','default','non_holo','holo','reverse_holo') then
     score=30; confidence=0.65; tier=case when amount<2 then 'ESTIMATED_VALUE' else 'MARKET_GUIDE' end;
    else reason='stronger_variant_evidence_required'; end if;
   elsif e->>'scope'='blended_printing_market' then
    -- Mixed-language public prices may contribute only to inexpensive ordinary
    -- commons/uncommons, never rare cards or special/vintage edition finishes.
    if amount<2 and max_signal<20 and p_identity->>'rarity_code' in ('common','uncommon')
      and p_identity->>'variant_code' in ('normal','standard','default')
      and p_identity->>'finish_code' in ('normal','standard','default','non_holo') then
     score=20; confidence=0.45; tier='ESTIMATED_VALUE';
    else reason='blended_language_finish_condition_evidence_insufficient'; end if;
   end if;
   if score>best_score or (score=best_score and e->>'source_at'>best->>'sourceAt') then
    best_score=score;
    best=jsonb_build_object('classification',tier,'value',case when tier='ESTIMATED_VALUE' then greatest(0.1,round(amount*10)/10) else amount end,
     'currency','GBP','provider',e->>'provider','evidenceType',e->>'scope','confidence',confidence,
     'sourceAt',e->>'source_at','retrievedAt',e->>'retrieved_at','staleAfter',e->>'stale_after',
     'printingMatch',true,'languageMatch',exact_language,'finishMatch',exact_finish,
     'condition','raw_market_unspecified','grade',null,'exact',false,'reason',null,
     'marketSignalValue',amount,'provenance',e,'usableForHoldingsValuation',false);
   end if;
  end loop;
 end if;
 if best is null then best=jsonb_build_object('classification','PRICE_UNAVAILABLE','value',null,'currency','GBP',
  'provider',null,'evidenceType','none','confidence',0,'sourceAt',null,'retrievedAt',null,'staleAfter',null,
  'printingMatch',false,'languageMatch',false,'finishMatch',false,'condition','raw_market_unspecified',
  'grade',null,'exact',false,'reason',case when reason='no_defensible_market_evidence' then coalesce(nullif(p_identity->>'outcome_reason','priced'),reason) else reason end,
  'usableForHoldingsValuation',false); end if;
 return best || jsonb_build_object('variantId',p_identity->>'variant_id','printingId',p_identity->>'printing_id',
  'setId',p_identity->>'set_id','language',p_identity->>'language_code','finish',p_identity->>'finish_code',
  'catalogueVersionId',p_identity->>'catalogue_version_id','policyVersion','classified-v1');
end;
$f$;

-- Includes every latest published membership, even retired/corrupt physical
-- identities. Such rows are classified unavailable, never omitted from coverage.
create function api.pricing_classification_page(p_after uuid default null,p_limit integer default 2000)
returns table(variant_id uuid,catalogue_version_id uuid,printing_id uuid,set_id uuid,language_code text,resolution jsonb)
language sql stable security invoker set search_path='' as $f$
 with cv as materialized (
  select distinct on(language_code) id,language_code from catalog.catalogue_versions
  where status='published' and deprecated_at is null and language_code in ('en','ja','zh-cn','zh-tw')
  order by language_code,published_at desc nulls last,created_at desc,id desc
 ), page as materialized (
  select m.* from cv join catalog.catalogue_version_variants m on m.catalogue_version_id=cv.id and m.language_code=cv.language_code
  where p_after is null or m.variant_id>p_after order by m.variant_id limit least(greatest(coalesce(p_limit,2000),1),5000)
 ), identities as materialized (
  select m.variant_id,m.catalogue_version_id,m.printing_id,m.set_id,m.language_code,v.variant_code,v.finish_code,
   coalesce(v.deprecated_at is null and v.printing_id=m.printing_id and v.language_code=m.language_code
    and p.deprecated_at is null and p.set_id=m.set_id and p.language_code=m.language_code
    and s.deprecated_at is null and s.language_code=m.language_code and v.id is not null and p.id is not null and s.id is not null,false) physical_valid,
   r.code rarity_code,o.reason outcome_reason
  from page m left join catalog.card_variants v on v.id=m.variant_id
  left join catalog.card_printings p on p.id=m.printing_id left join catalog.sets s on s.id=m.set_id
  left join catalog.rarities r on r.id=p.rarity_id
  left join market.catalogue_price_outcomes o on o.variant_id=m.variant_id and o.catalogue_version_id=m.catalogue_version_id
 ), evidence as (
  select i.variant_id,jsonb_build_object('provider','tcgcsv','scope','exact_variant_market','currency','GBP',
    'value',g.central_estimate,'variant_id',i.variant_id,'printing_id',i.printing_id,'set_id',i.set_id,
    'catalogue_version_id',i.catalogue_version_id,'language',g.language_code,'finish',i.finish_code,'variant_code',i.variant_code,
    'source_at',g.dataset_at,'retrieved_at',g.recorded_at,'stale_after',g.stale_after,'source_record',to_jsonb(g)) e
  from identities i join market.catalogue_general_prices g on g.variant_id=i.variant_id and g.printing_id=i.printing_id
    and g.set_id=i.set_id and g.language_code=i.language_code and g.catalogue_version_id=i.catalogue_version_id
  join market.catalogue_provider_cards map on map.variant_id=g.variant_id and map.printing_id=g.printing_id
    and map.set_id=g.set_id and map.language_code=g.language_code and map.product_id=g.product_id
    and map.group_id=g.group_id and map.category_id=g.category_id and map.subtype=g.subtype
  where g.original_price>0 and g.central_estimate>0 and g.subtype=api.catalogue_provider_subtype(i.variant_code,i.finish_code)
    and ((g.category_id=3 and i.language_code='en') or (g.category_id=85 and i.language_code='ja'))
  union all
  select i.variant_id,jsonb_build_object('provider','tcgcsv','scope','printing_market','currency','GBP',
    'value',g.central_estimate,'printing_id',i.printing_id,'set_id',i.set_id,'catalogue_version_id',i.catalogue_version_id,
    'language',g.language_code,'finish',null,'variant_code',null,'source_at',g.dataset_at,'retrieved_at',g.recorded_at,
    'stale_after',g.stale_after,'source_record',to_jsonb(g))
  from identities i join market.catalogue_general_prices g on g.printing_id=i.printing_id and g.variant_id<>i.variant_id
    and g.set_id=i.set_id and g.language_code=i.language_code and g.catalogue_version_id=i.catalogue_version_id
  join market.catalogue_provider_cards map on map.variant_id=g.variant_id and map.printing_id=g.printing_id
    and map.set_id=g.set_id and map.language_code=g.language_code and map.product_id=g.product_id
    and map.group_id=g.group_id and map.category_id=g.category_id and map.subtype=g.subtype
  where g.original_price>0 and g.central_estimate>0 and g.subtype in ('Normal','Holofoil')
  union all
  select i.variant_id,jsonb_build_object('provider','tcgcsv','scope','printing_market','currency','GBP',
    'value',g.central_estimate,'printing_id',i.printing_id,'set_id',i.set_id,'catalogue_version_id',i.catalogue_version_id,
    'language',g.language_code,'finish',null,'variant_code',null,'source_at',g.dataset_at,'retrieved_at',g.recorded_at,
    'stale_after',g.stale_after,'source_record',to_jsonb(g))
  from identities i join market.catalogue_printing_general_prices g on g.printing_id=i.printing_id
    and g.set_id=i.set_id and g.language_code=i.language_code and g.catalogue_version_id=i.catalogue_version_id
  where g.original_price>0 and g.central_estimate>0
  union all
  select i.variant_id,jsonb_build_object('provider','cardmarket_public','scope','blended_printing_market','currency','GBP',
    'value',g.central_estimate_gbp,'printing_id',i.printing_id,'set_id',i.set_id,'catalogue_version_id',i.catalogue_version_id,
    'language',null,'finish',null,'variant_code',null,'source_at',g.source_created_at,'retrieved_at',g.recorded_at,
    'stale_after',g.stale_after,'source_record',to_jsonb(g),'mapping',to_jsonb(map))
  from identities i join market.cardmarket_blended_general_prices g on g.printing_id=i.printing_id and g.catalogue_version_id=i.catalogue_version_id
  join market.cardmarket_printing_mappings map on map.printing_id=g.printing_id and map.catalogue_version_id=g.catalogue_version_id
  where g.original_price>0 and g.central_estimate_gbp>0
 )
 select i.variant_id,i.catalogue_version_id,i.printing_id,i.set_id,i.language_code,
  api.resolve_pricing_classification(to_jsonb(i),coalesce((select jsonb_agg(e.e order by e.e->>'scope',e.e->>'provider') from evidence e where e.variant_id=i.variant_id),'[]'::jsonb))
 from identities i order by i.variant_id;
$f$;

create function api.store_pricing_classification_page(p_after uuid default null,p_limit integer default 2000) returns jsonb
language plpgsql security invoker set search_path='' as $f$
declare n integer; cursor_id uuid; changed integer;
begin
 if p_limit not between 1 and 5000 then raise exception 'invalid classification page size'; end if;
 with page as materialized(select * from api.pricing_classification_page(p_after,p_limit)), stored as (
  insert into market.pricing_classifications(variant_id,catalogue_version_id,printing_id,set_id,language_code,classification,value_gbp,resolution,evidence_hash)
  select p.variant_id,p.catalogue_version_id,p.printing_id,p.set_id,p.language_code,p.resolution->>'classification',
   (p.resolution->>'value')::numeric,p.resolution,md5(p.resolution::text) from page p
  on conflict(variant_id) do update set catalogue_version_id=excluded.catalogue_version_id,printing_id=excluded.printing_id,
   set_id=excluded.set_id,language_code=excluded.language_code,classification=excluded.classification,value_gbp=excluded.value_gbp,
   resolution=excluded.resolution,evidence_hash=excluded.evidence_hash,checked_at=now()
  where market.pricing_classifications.evidence_hash<>excluded.evidence_hash
  returning variant_id,catalogue_version_id,evidence_hash,resolution
 ), history as (
  insert into market.pricing_classification_history(variant_id,catalogue_version_id,evidence_hash,resolution)
  select variant_id,catalogue_version_id,evidence_hash,resolution from stored returning id
 ) select (select count(*) from page),(select variant_id from page order by variant_id desc limit 1),(select count(*) from history)
 into n,cursor_id,changed;
 return jsonb_build_object('processed',n,'changed',changed,'nextAfter',cursor_id,'complete',n<p_limit,'observedAt',now());
end;
$f$;

create function api.read_pricing_classifications(p_variants uuid[]) returns table(variant_id uuid,resolution jsonb)
language sql stable security invoker set search_path='' as $f$
 select p.variant_id,p.resolution || jsonb_build_object('checkedAt',p.checked_at,
  'freshness',case when p.resolution->>'staleAfter' is null then 'unavailable'
   when (p.resolution->>'staleAfter')::timestamptz<=now() then 'stale' else 'fresh' end)
 from market.pricing_classifications p where p.variant_id=any(p_variants) and coalesce(array_length(p_variants,1),0) between 1 and 100
 and p.catalogue_version_id=(select cv.id from catalog.catalogue_versions cv where cv.language_code=p.language_code
  and cv.status='published' and cv.deprecated_at is null order by cv.published_at desc nulls last,cv.created_at desc,cv.id desc limit 1);
$f$;

create function api.pricing_classified_coverage() returns jsonb
language sql stable security invoker set search_path='' as $f$
 with cv as materialized(select distinct on(language_code) id,language_code from catalog.catalogue_versions
  where status='published' and deprecated_at is null and language_code in('en','ja','zh-cn','zh-tw')
  order by language_code,published_at desc nulls last,created_at desc,id desc), counted as materialized(
  select m.variant_id,m.language_code,p.classification,p.resolution->>'provider' provider,p.resolution->>'evidenceType' evidence_type,
   p.resolution->>'reason' reason,p.value_gbp from cv join catalog.catalogue_version_variants m on m.catalogue_version_id=cv.id and m.language_code=cv.language_code
  left join market.pricing_classifications p on p.variant_id=m.variant_id and p.catalogue_version_id=m.catalogue_version_id
 ), totals as(select count(*) total,count(classification) classified,count(*) filter(where classification='EXACT_PRICE') exact,
  count(*) filter(where classification='MARKET_GUIDE') guide,count(*) filter(where classification='ESTIMATED_VALUE') estimated,
  count(*) filter(where classification='PRICE_UNAVAILABLE') unavailable from counted)
 select jsonb_build_object('observedAt',now(),'totalPublishedVariants',total,'classified',classified,'exactPrice',exact,
  'marketGuide',guide,'estimatedValue',estimated,'priceUnavailable',unavailable,
  'classifiedCoveragePercent',round(100.0*classified/nullif(total,0),2),'usableValuationCoveragePercent',round(100.0*(exact+guide+estimated)/nullif(total,0),2),
  'languages',(select jsonb_agg(to_jsonb(t)) from(select language_code,count(*) published,count(classification) classified,
   count(*) filter(where classification='EXACT_PRICE') exact,count(*) filter(where classification='MARKET_GUIDE') guide,
   count(*) filter(where classification='ESTIMATED_VALUE') estimated,count(*) filter(where classification='PRICE_UNAVAILABLE') unavailable
   from counted group by language_code order by language_code)t),
  'providers',(select jsonb_agg(to_jsonb(t)) from(select provider,count(*) variants from counted group by provider order by provider)t),
  'evidenceTiers',(select jsonb_agg(to_jsonb(t)) from(select evidence_type,count(*) variants from counted group by evidence_type order by evidence_type)t),
  'unavailableReasons',(select jsonb_agg(to_jsonb(t)) from(select reason,count(*) variants from counted where classification='PRICE_UNAVAILABLE' group by reason order by count(*) desc)t),
  'catalogueVersions',(select jsonb_agg(to_jsonb(cv) order by language_code) from cv)) from totals;
$f$;

revoke all on function api.resolve_pricing_classification(jsonb,jsonb),api.pricing_classification_page(uuid,integer),
 api.store_pricing_classification_page(uuid,integer),api.read_pricing_classifications(uuid[]),api.pricing_classified_coverage() from public,anon,authenticated;
grant execute on function api.resolve_pricing_classification(jsonb,jsonb),api.pricing_classification_page(uuid,integer),
 api.store_pricing_classification_page(uuid,integer),api.read_pricing_classifications(uuid[]),api.pricing_classified_coverage() to service_role;
