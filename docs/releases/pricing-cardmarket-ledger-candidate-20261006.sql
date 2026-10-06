-- SOURCE-ONLY candidate: not an applied migration or approved deployment.
-- Preserve invoker access, the 1..500 cap, native physical checks and cursor.
-- Validate in provider order and stop AFTER collecting p_limit eligible rows.
-- Limiting raw mappings before validation would truncate the ledger.
create or replace function api.list_reviewed_cardmarket_printing_mappings(
  p_after_product_id bigint default 0, p_limit integer default 500
) returns table (
  cardmarket_product_id bigint, cardmarket_category_id integer, printing_id uuid,
  catalogue_version_id uuid, language_evidence jsonb, variant_evidence jsonb,
  finish_evidence jsonb, review_reference text
) language plpgsql stable security invoker set search_path='' as $function$
declare mapping record; accepted integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then return; end if;
  for mapping in
    select m.* from market.cardmarket_printing_mappings m
    where m.provider_product_id > p_after_product_id order by m.provider_product_id
  loop
    if exists (
      with current_versions as (
        select distinct on (cv.language_code) cv.id,cv.language_code
        from catalog.catalogue_versions cv
        where cv.status='published' and cv.deprecated_at is null
        order by cv.language_code,cv.published_at desc nulls last,cv.created_at desc,cv.id desc
      )
      select 1 from catalog.card_printings p
      join current_versions v on v.id=mapping.catalogue_version_id and v.language_code=p.language_code
      where p.id=mapping.printing_id and p.deprecated_at is null
      and exists (
        select 1 from catalog.catalogue_version_variants cvv
        join catalog.card_variants variant on variant.id=cvv.variant_id
          and variant.deprecated_at is null and variant.printing_id=p.id
          and variant.language_code=p.language_code
        join catalog.sets s on s.id=variant.set_id and s.deprecated_at is null
        where cvv.catalogue_version_id=v.id
      )
    ) then
      cardmarket_product_id := mapping.provider_product_id;
      cardmarket_category_id := mapping.provider_category_id;
      printing_id := mapping.printing_id;
      catalogue_version_id := mapping.catalogue_version_id;
      language_evidence := mapping.language_evidence;
      variant_evidence := mapping.variant_evidence;
      finish_evidence := mapping.finish_evidence;
      review_reference := mapping.review_reference;
      return next;
      accepted := accepted + 1;
      if accepted >= p_limit then return; end if;
    end if;
  end loop;
end;
$function$;
