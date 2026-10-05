set local lock_timeout='5s';
set local statement_timeout='60s';
CREATE OR REPLACE FUNCTION api.pricing_classification_page_primary_evidence(p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 2000)
 RETURNS TABLE(variant_id uuid, catalogue_version_id uuid, printing_id uuid, set_id uuid, language_code text, resolution jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
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
$function$;


-- Retained, identity-bound provider snapshots are historical market signals for
-- inexpensive cards only. Their old FX conversion is explicitly unverified;
-- this lane can never establish a valuable quote or a condition-specific price.
CREATE FUNCTION api.retained_cheap_snapshot_resolution(p_identity jsonb,p_base jsonb,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE j jsonb=p_snapshot->'pricing_identity_json'; amount numeric; source_at timestamptz; fetched_at timestamptz; expiry timestamptz; unit text; raw_pricing jsonb;
BEGIN
 IF p_base->>'classification' IS DISTINCT FROM 'PRICE_UNAVAILABLE'
  OR coalesce(p_base->>'reason','') NOT IN ('no_provider_quote','unresolved_provider_identity','no_defensible_market_evidence')
  OR coalesce((p_identity->>'physical_valid')::boolean,false) IS NOT TRUE
  OR coalesce(p_identity->>'variant_code','') NOT IN ('normal','standard','default','holo','reverse_holo')
  OR coalesce(p_identity->>'finish_code','') NOT IN ('normal','standard','default','non_holo','holo','reverse_holo')
  OR p_snapshot->>'user_id' IS NOT NULL OR p_snapshot->>'primary_source' IS DISTINCT FROM 'tcgdex'
  OR coalesce(p_snapshot->>'price_source','') NOT IN ('tcgdex_tcgplayer','tcgdex_cardmarket')
  OR p_snapshot->>'price_type' IS DISTINCT FROM 'market_estimate'
  OR (p_snapshot->>'proven_last_sold')::boolean IS DISTINCT FROM false
  OR p_snapshot->>'card_id' IS DISTINCT FROM p_identity->>'variant_id'
  OR p_snapshot->>'set_id' IS DISTINCT FROM p_identity->>'set_id'
  OR p_snapshot->>'language' IS DISTINCT FROM p_identity->>'language_code'
  OR j->>'canonicalVariantId' IS DISTINCT FROM p_identity->>'variant_id'
  OR j->>'canonicalPrintingId' IS DISTINCT FROM p_identity->>'printing_id'
  OR j->>'setId' IS DISTINCT FROM p_identity->>'set_id'
  OR j->>'language' IS DISTINCT FROM p_identity->>'language_code'
  OR j->>'productType' IS DISTINCT FROM 'raw_card'
  OR j->>'rawCondition' IS DISTINCT FROM 'raw_near_mint'
  OR j->>'variant' IS DISTINCT FROM p_identity->>'variant_code'
  OR j->>'finish' IS DISTINCT FROM p_identity->>'finish_code'
  OR coalesce(j->>'grade','')<>'' OR coalesce(j->>'gradingCompany','')<>''
  OR nullif(p_snapshot->>'canonical_identity_key','') IS NULL
  OR p_snapshot->>'canonical_identity_key' IS DISTINCT FROM j->>'identityKey'
  OR nullif(p_snapshot->>'tcgdex_card_id','') IS NULL
  OR p_snapshot->'source_payload'->>'id' IS DISTINCT FROM p_snapshot->>'tcgdex_card_id'
  OR regexp_replace(lower(split_part(coalesce(p_snapshot->'source_payload'->>'localId',''), '/',1)),'^0+(?=[0-9])','')
     IS DISTINCT FROM regexp_replace(lower(split_part(coalesce(p_identity->>'collector_number',''), '/',1)),'^0+(?=[0-9])','')
  OR nullif(p_identity->>'collector_number','') IS NULL THEN RETURN NULL; END IF;
 amount=(p_snapshot->>'tcgdex_price')::numeric;
 source_at=(p_snapshot->>'tcgdex_price_updated_at')::timestamptz;
 fetched_at=(p_snapshot->>'snapshot_at')::timestamptz;
 expiry=(p_snapshot->>'stale_after')::timestamptz;
 raw_pricing=p_snapshot->'source_payload'->'pricing'->(case p_snapshot->>'price_source' when 'tcgdex_cardmarket' then 'cardmarket' else 'tcgplayer' end);
 unit=upper(raw_pricing->>'unit');
 IF amount IS NULL OR amount<=0 OR amount>=2 OR source_at IS NULL OR fetched_at IS NULL OR expiry IS NULL
  OR source_at>fetched_at+interval '5 minutes' OR expiry<source_at OR unit NOT IN ('USD','EUR','GBP') OR unit IS NULL
  OR (raw_pricing->>'updated')::timestamptz IS DISTINCT FROM source_at
 THEN RETURN NULL; END IF;
 IF jsonb_typeof(raw_pricing) IS DISTINCT FROM 'object' OR NOT EXISTS(
  SELECT 1 FROM jsonb_each(raw_pricing) f
  WHERE f.key IN ('trend','avg30','avg','low','trend-holo','avg30-holo','avg-holo','low-holo')
   AND jsonb_typeof(f.value)='number' AND (f.value#>>'{}')::numeric>0
  UNION ALL
  SELECT 1 FROM jsonb_each(raw_pricing) v CROSS JOIN LATERAL jsonb_each(case when jsonb_typeof(v.value)='object' then v.value else '{}'::jsonb end) f
  WHERE f.key IN ('marketPrice','midPrice','lowPrice','market','mid','low')
   AND jsonb_typeof(f.value)='number' AND (f.value#>>'{}')::numeric>0
 ) THEN RETURN NULL; END IF;
 RETURN p_base || jsonb_build_object(
  'classification','ESTIMATED_VALUE','value',greatest(0.1,round(amount*10)/10),'currency','GBP',
  'provider',p_snapshot->>'price_source','evidenceType','retained_printing_market','confidence',0.55,
  'sourceAt',source_at,'retrievedAt',fetched_at,'staleAfter',expiry,'printingMatch',true,'languageMatch',true,'finishMatch',false,
  'condition','raw_market_unspecified','grade',null,'exact',false,'reason',null,'marketSignalValue',amount,
  'policyVersion','classified-v1-retained-cheap','usableForHoldingsValuation',false,
  'provenance',jsonb_build_object('snapshotId',p_snapshot->>'id','providerCardId',p_snapshot->>'tcgdex_card_id',
   'sourceUnit',unit,'sourcePricing',p_snapshot->'source_payload'->'pricing','quotedVariant',j->>'variant','quotedFinish',j->>'finish',
   'conversionQuality','retained_conversion_without_rate_timestamp','sourceAt',source_at,'retrievedAt',fetched_at));
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN NULL;
END;
$f$;

CREATE OR REPLACE FUNCTION api.pricing_classification_page(p_after uuid DEFAULT NULL,p_limit integer DEFAULT 2000)
RETURNS TABLE(variant_id uuid,catalogue_version_id uuid,printing_id uuid,set_id uuid,language_code text,resolution jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' SET plan_cache_mode='force_custom_plan' AS $f$
 WITH page AS MATERIALIZED(SELECT * FROM api.pricing_classification_page_primary_evidence(p_after,p_limit))
 SELECT r.variant_id,r.catalogue_version_id,r.printing_id,r.set_id,r.language_code,
  coalesce(api.retained_cheap_snapshot_resolution(jsonb_build_object('variant_id',r.variant_id,'printing_id',r.printing_id,
   'set_id',r.set_id,'language_code',r.language_code,'collector_number',p.collector_number,'variant_code',v.variant_code,'finish_code',v.finish_code,
   'physical_valid',v.id IS NOT NULL AND v.deprecated_at IS NULL AND v.printing_id=r.printing_id AND v.language_code=r.language_code
    AND p.deprecated_at IS NULL AND p.set_id=r.set_id AND p.language_code=r.language_code
    AND s.deprecated_at IS NULL AND s.language_code=r.language_code),r.resolution,snapshot.payload),r.resolution)
 FROM page r LEFT JOIN catalog.card_variants v ON v.id=r.variant_id
 LEFT JOIN catalog.card_printings p ON p.id=r.printing_id LEFT JOIN catalog.sets s ON s.id=r.set_id
 LEFT JOIN LATERAL(
  SELECT to_jsonb(q) payload FROM public.market_price_snapshots q
  WHERE r.resolution->>'classification'='PRICE_UNAVAILABLE'
   AND q.card_id=r.variant_id::text AND q.language=r.language_code AND q.set_id=r.set_id::text AND q.user_id IS NULL
   AND q.price_source IN ('tcgdex_tcgplayer','tcgdex_cardmarket') AND q.primary_source='tcgdex'
   AND q.price_type='market_estimate' AND q.tcgdex_price>0 AND q.tcgdex_price<2
  ORDER BY q.snapshot_at DESC,q.id DESC LIMIT 1
 ) snapshot ON true ORDER BY r.variant_id;
$f$;
REVOKE ALL ON FUNCTION api.retained_cheap_snapshot_resolution(jsonb,jsonb,jsonb),api.pricing_classification_page_primary_evidence(uuid,integer),api.pricing_classification_page(uuid,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.retained_cheap_snapshot_resolution(jsonb,jsonb,jsonb),api.pricing_classification_page_primary_evidence(uuid,integer),api.pricing_classification_page(uuid,integer) TO service_role;
