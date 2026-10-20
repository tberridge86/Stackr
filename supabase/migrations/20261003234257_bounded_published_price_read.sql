-- Bound the physical variant lookup before joining publication metadata.
-- These status/deprecation/language joins match api.catalogue_cards exactly.
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function api.read_catalogue_prices(p_references text[],p_language text default null)
returns table(reference text,candidates jsonb)
language plpgsql stable security invoker set search_path='' as $function$
begin
  if coalesce(array_length(p_references,1),0) not between 1 and 100
    or exists(select 1 from unnest(p_references) r where r is null or r !~ '^[A-Za-z0-9._:/+-]{1,160}$')
    or (p_language is not null and p_language not in ('en','ja','zh-tw','zh-cn','ko')) then
    raise exception 'invalid catalogue price references' using errcode='22023';
  end if;
  return query
  with refs as materialized (
    select r,ordinal,case when r ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then r::uuid end canonical_id
    from unnest(p_references) with ordinality input(r,ordinal)
  ), aliases as materialized (
    select refs.r,e.printing_id,e.variant_id from refs
      join api.catalogue_external_identifiers e on e.external_id=refs.r
      where p_language is null or e.language_code=p_language
  ), variant_refs as materialized (
    select refs.r,v.id as variant_id,v.printing_id from refs join catalog.card_variants v on v.id=refs.canonical_id
    union
    select a.r,a.variant_id,v.printing_id from aliases a join catalog.card_variants v on v.id=a.variant_id
  ), identities as materialized (
    select refs.r,p.id as printing_id from refs join catalog.card_printings p on p.id=refs.canonical_id
    union select v.r,v.printing_id from variant_refs v
    union select a.r,a.printing_id from aliases a where a.printing_id is not null
  ), requested as materialized (
    select v.r,jsonb_agg(distinct v.variant_id) as ids from variant_refs v group by v.r
  ), wanted_variants as materialized (
    select v.id as variant_id,v.printing_id,v.language_code,v.variant_code,v.finish_code,v.is_default
    from (select distinct i.printing_id from identities i) wanted
      join catalog.card_variants v on v.printing_id=wanted.printing_id
      where v.deprecated_at is null and (p_language is null or v.language_code=p_language)
  ), published as materialized (
    select v.variant_id,v.printing_id,p.set_id,v.language_code,cv.id as catalogue_version_id,v.variant_code,v.finish_code,v.is_default
    from wanted_variants v
      join catalog.catalogue_version_variants cvv on cvv.variant_id=v.variant_id
      join catalog.catalogue_versions cv on cv.id=cvv.catalogue_version_id and cv.status='published' and cv.deprecated_at is null
      join catalog.card_printings p on p.id=v.printing_id and p.deprecated_at is null
      join catalog.sets s on s.id=p.set_id and s.deprecated_at is null
      join catalog.languages l on l.code=v.language_code
  ), priced as materialized (
    select c.*,jsonb_build_object(
      'general_quote',(select to_jsonb(g) from market.catalogue_general_prices g where g.variant_id=c.variant_id
        and g.printing_id=c.printing_id and g.set_id=c.set_id and g.language_code=c.language_code and g.catalogue_version_id=c.catalogue_version_id),
      'estimate',(select to_jsonb(e) from api.market_price_estimates e where e.variant_id=c.variant_id
        and e.product_kind='raw_card' and e.display_currency_code='GBP' and e.condition_code='raw_near_mint'
        and e.language_code=c.language_code and e.grader_code is null and e.grade_value is null and e.fallback_identity_key is null
        order by e.calculated_at desc,e.price_estimate_id desc limit 1),
      'snapshot',(select to_jsonb(s) from public.market_price_snapshots s where s.user_id is null and s.card_id=c.variant_id::text
        and s.language=c.language_code and to_jsonb(s)->>'set_id'=c.set_id::text
        and coalesce(s.pricing_identity_json->>'canonicalVariantId',s.pricing_identity_json->>'canonical_variant_id')=c.variant_id::text
        and coalesce(s.pricing_identity_json->>'canonicalPrintingId',s.pricing_identity_json->>'canonical_printing_id')=c.printing_id::text
        and s.pricing_identity_json->>'productType'='raw_card'
        and coalesce(s.pricing_identity_json->>'rawCondition',s.pricing_identity_json->>'condition')='raw_near_mint'
        and coalesce(to_jsonb(s)->>'currency','GBP')='GBP'
        order by s.calculated_at desc nulls last,s.id desc limit 1),
      'outcome',(select jsonb_build_object('reason',o.reason,'next_retry_at',o.next_retry_at) from market.catalogue_price_outcomes o
        where o.variant_id=c.variant_id and o.catalogue_version_id=c.catalogue_version_id)
    ) as quotes from published c
  ), grouped as (
    select i.r,jsonb_agg(jsonb_build_object('variant_id',c.variant_id,'printing_id',c.printing_id,'set_id',c.set_id,
      'language_code',c.language_code,'catalogue_version_id',c.catalogue_version_id,'variant_code',c.variant_code,
      'finish_code',c.finish_code,'is_default',c.is_default,'requested_variant_ids',coalesce(requested.ids,'[]'::jsonb)) || c.quotes order by c.variant_id) as value
    from identities i join priced c on c.printing_id=i.printing_id left join requested on requested.r=i.r group by i.r
  )
  select refs.r,coalesce(grouped.value,'[]'::jsonb) from refs left join grouped on grouped.r=refs.r order by refs.ordinal;
end;
$function$;
revoke all on function api.read_catalogue_prices(text[],text) from public,anon,authenticated;
grant execute on function api.read_catalogue_prices(text[],text) to service_role;


