-- Aggregate one bounded evidence page once; no per-variant rescans.
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function api.pricing_classification_page(p_after uuid default null,p_limit integer default 2000)
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
 ), evidence as materialized (
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
 , aggregated as materialized (
  select variant_id,jsonb_agg(e order by e->>'scope',e->>'provider') signals from evidence group by variant_id
 )
 select i.variant_id,i.catalogue_version_id,i.printing_id,i.set_id,i.language_code,
  api.resolve_pricing_classification(to_jsonb(i),coalesce(a.signals,'[]'::jsonb))
 from identities i left join aggregated a on a.variant_id=i.variant_id order by i.variant_id;
$f$;
