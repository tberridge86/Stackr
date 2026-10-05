set local lock_timeout='5s';
set local statement_timeout='60s';
-- Select the latest identity-bound observation before applying the cheap-value ceiling.
CREATE OR REPLACE FUNCTION api.retained_snapshot_is_valid(p_identity jsonb,p_base jsonb,p_snapshot jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE j jsonb=p_snapshot->'pricing_identity_json'; amount numeric; source_at timestamptz; fetched_at timestamptz; expiry timestamptz; unit text; raw_pricing jsonb; native_max numeric;
BEGIN
 IF p_base->>'classification' IS DISTINCT FROM 'PRICE_UNAVAILABLE'
  OR coalesce(p_base->>'reason','') NOT IN ('no_provider_quote','unresolved_provider_identity','no_defensible_market_evidence')
  OR coalesce((p_identity->>'physical_valid')::boolean,false) IS NOT TRUE
  OR coalesce(p_identity->>'language_code','') NOT IN ('en','ja')
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
  OR nullif(p_identity->>'collector_number','') IS NULL THEN RETURN false; END IF;
 amount=(p_snapshot->>'tcgdex_price')::numeric;
 source_at=(p_snapshot->>'tcgdex_price_updated_at')::timestamptz;
 fetched_at=(p_snapshot->>'snapshot_at')::timestamptz;
 expiry=(p_snapshot->>'stale_after')::timestamptz;
 raw_pricing=p_snapshot->'source_payload'->'pricing'->(case p_snapshot->>'price_source' when 'tcgdex_cardmarket' then 'cardmarket' else 'tcgplayer' end);
 unit=upper(raw_pricing->>'unit');
 IF amount IS NULL OR amount<=0 OR amount>='Infinity'::numeric OR source_at IS NULL OR fetched_at IS NULL OR expiry IS NULL
  OR source_at>fetched_at+interval '5 minutes' OR expiry<source_at OR unit NOT IN ('USD','EUR','GBP') OR unit IS NULL
  OR (raw_pricing->>'updated')::timestamptz IS DISTINCT FROM source_at
 THEN RETURN false; END IF;
 IF jsonb_typeof(raw_pricing) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 -- A seller's low asking price does not establish a cheap market. Require a
 -- central market signal. The cheap resolver applies the value ceiling.
 SELECT max(signal) INTO native_max FROM (
  SELECT (f.value#>>'{}')::numeric signal FROM jsonb_each(raw_pricing) f
  WHERE f.key IN ('trend','avg30','avg','trend-holo','avg30-holo','avg-holo')
   AND jsonb_typeof(f.value)='number'
  UNION ALL
  SELECT (f.value#>>'{}')::numeric FROM jsonb_each(raw_pricing) v
   CROSS JOIN LATERAL jsonb_each(case when jsonb_typeof(v.value)='object' then v.value else '{}'::jsonb end) f
  WHERE f.key IN ('marketPrice','midPrice','market','mid') AND jsonb_typeof(f.value)='number'
 ) signals;
 IF native_max IS NULL OR native_max<=0 OR native_max>='Infinity'::numeric THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN false;
END;
$f$;

CREATE OR REPLACE FUNCTION api.pricing_classification_page(p_after uuid DEFAULT NULL,p_limit integer DEFAULT 2000)
RETURNS TABLE(variant_id uuid,catalogue_version_id uuid,printing_id uuid,set_id uuid,language_code text,resolution jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' SET plan_cache_mode='force_custom_plan' AS $f$
 WITH page AS MATERIALIZED(SELECT * FROM api.pricing_classification_page_primary_evidence(p_after,p_limit)),
 identities AS MATERIALIZED(
  SELECT r.*,jsonb_build_object('variant_id',r.variant_id,'printing_id',r.printing_id,'set_id',r.set_id,
   'language_code',r.language_code,'collector_number',p.collector_number,'variant_code',v.variant_code,'finish_code',v.finish_code,
   'physical_valid',v.id IS NOT NULL AND v.deprecated_at IS NULL AND v.printing_id=r.printing_id AND v.language_code=r.language_code
    AND p.deprecated_at IS NULL AND p.set_id=r.set_id AND p.language_code=r.language_code
    AND s.deprecated_at IS NULL AND s.language_code=r.language_code) snapshot_identity
  FROM page r LEFT JOIN catalog.card_variants v ON v.id=r.variant_id
   LEFT JOIN catalog.card_printings p ON p.id=r.printing_id LEFT JOIN catalog.sets s ON s.id=r.set_id
 )
 SELECT i.variant_id,i.catalogue_version_id,i.printing_id,i.set_id,i.language_code,
  coalesce(api.retained_cheap_snapshot_resolution(i.snapshot_identity,i.resolution,snapshot.payload),i.resolution)
 FROM identities i LEFT JOIN LATERAL(
  SELECT to_jsonb(q) payload FROM public.market_price_snapshots q
  WHERE i.resolution->>'classification'='PRICE_UNAVAILABLE' AND i.language_code IN ('en','ja')
   AND q.card_id=i.variant_id::text AND q.language=i.language_code AND q.set_id=i.set_id::text AND q.user_id IS NULL
   AND q.price_source IN ('tcgdex_tcgplayer','tcgdex_cardmarket') AND q.primary_source='tcgdex'
   AND q.price_type='market_estimate' AND q.tcgdex_price>0
   AND api.retained_snapshot_is_valid(i.snapshot_identity,i.resolution,to_jsonb(q))
  ORDER BY q.snapshot_at DESC,q.id DESC LIMIT 1
 ) snapshot ON true ORDER BY i.variant_id;
$f$;
REVOKE ALL ON FUNCTION api.retained_snapshot_is_valid(jsonb,jsonb,jsonb),api.pricing_classification_page(uuid,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.retained_snapshot_is_valid(jsonb,jsonb,jsonb),api.pricing_classification_page(uuid,integer) TO service_role;
