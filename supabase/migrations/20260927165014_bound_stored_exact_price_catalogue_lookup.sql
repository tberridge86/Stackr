-- Keep the published catalogue and exact-price contract intact while bounding
-- the catalogue scan before its joins. An unnest join alone can scan every card.
CREATE OR REPLACE FUNCTION api.latest_stored_exact_prices(p_variants uuid[])
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
 from unnest(p_variants) v join api.catalogue_cards c on c.variant_id=v where array_length(p_variants,1)<=200
   and c.variant_id = any(p_variants);
$function$;

revoke all on function api.latest_stored_exact_prices(uuid[]) from public, anon, authenticated;
grant execute on function api.latest_stored_exact_prices(uuid[]) to service_role;
