set local lock_timeout='5s';
set local statement_timeout='60s';
CREATE OR REPLACE FUNCTION api.retained_cheap_snapshot_resolution(p_identity jsonb,p_base jsonb,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE j jsonb=p_snapshot->'pricing_identity_json'; amount numeric; source_at timestamptz; fetched_at timestamptz; expiry timestamptz; unit text; raw_pricing jsonb; native_max numeric;
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
 IF jsonb_typeof(raw_pricing) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
 -- A seller's low asking price does not establish a cheap market. Require a
 -- central market signal and reject stronger signals across the same printing.
 SELECT max(signal) INTO native_max FROM (
  SELECT (f.value#>>'{}')::numeric signal FROM jsonb_each(raw_pricing) f
  WHERE f.key IN ('trend','avg30','avg','trend-holo','avg30-holo','avg-holo')
   AND jsonb_typeof(f.value)='number'
  UNION ALL
  SELECT (f.value#>>'{}')::numeric FROM jsonb_each(raw_pricing) v
   CROSS JOIN LATERAL jsonb_each(case when jsonb_typeof(v.value)='object' then v.value else '{}'::jsonb end) f
  WHERE f.key IN ('marketPrice','midPrice','market','mid') AND jsonb_typeof(f.value)='number'
 ) signals;
 IF native_max IS NULL OR native_max<=0 OR native_max>=(case unit when 'GBP' then 2 else 3 end) THEN RETURN NULL; END IF;
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

REVOKE ALL ON FUNCTION api.retained_cheap_snapshot_resolution(jsonb,jsonb,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.retained_cheap_snapshot_resolution(jsonb,jsonb,jsonb) TO service_role;
