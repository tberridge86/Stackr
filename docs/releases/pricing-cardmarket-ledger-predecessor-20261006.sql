CREATE OR REPLACE FUNCTION api.list_reviewed_cardmarket_printing_mappings(p_after_product_id bigint DEFAULT 0, p_limit integer DEFAULT 500)
 RETURNS TABLE(cardmarket_product_id bigint, cardmarket_category_id integer, printing_id uuid, catalogue_version_id uuid, language_evidence jsonb, variant_evidence jsonb, finish_evidence jsonb, review_reference text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with current_versions as (select distinct on(cv.language_code) cv.id,cv.language_code from catalog.catalogue_versions cv where cv.status='published' and cv.deprecated_at is null order by cv.language_code,cv.published_at desc nulls last,cv.created_at desc,cv.id desc)
 select m.provider_product_id,m.provider_category_id,m.printing_id,m.catalogue_version_id,m.language_evidence,m.variant_evidence,m.finish_evidence,m.review_reference
 from market.cardmarket_printing_mappings m join catalog.card_printings p on p.id=m.printing_id and p.deprecated_at is null
 join current_versions v on v.id=m.catalogue_version_id and v.language_code=p.language_code
 where m.provider_product_id>p_after_product_id
 and exists (select 1 from catalog.catalogue_version_variants cvv join catalog.card_variants variant on variant.id=cvv.variant_id and variant.deprecated_at is null and variant.printing_id=p.id and variant.language_code=p.language_code join catalog.sets s on s.id=variant.set_id and s.deprecated_at is null where cvv.catalogue_version_id=v.id)
 order by m.provider_product_id limit case when p_limit between 1 and 500 then p_limit else 0 end;
$function$

