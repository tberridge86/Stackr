-- Read-only staging source rehearsal; this does not install a function or
-- establish owner HTTP/device or deployed candidate performance.
-- Ten printing IDs from the timed-out native cohort; same identity/price/scope
-- predicates as the deployed read RPC, substituting only the reviewed helper.
set statement_timeout='8s'; select now() observed_at,jsonb_agg(r) guides from (with current_versions as materialized(
  select distinct on(cv.language_code) cv.id,cv.language_code from catalog.catalogue_versions cv
  where cv.status='published' and cv.deprecated_at is null
  order by cv.language_code,cv.published_at desc nulls last,cv.created_at desc,cv.id desc
 )
 select g.printing_id,jsonb_build_object(
  'provider','tcgcsv','currency','GBP','centralEstimate',g.central_estimate,
  'priceScope','printing_general_estimate','usableForExactVariant',false,'usableForHoldingsValuation',false,
  'language',g.language_code,'condition',null,'finish',null,'grade',null,
  'providerCategoryId',g.category_id,'providerGroupId',g.group_id,'providerProductId',g.product_id,
  'providerSubtype',g.subtype,'anchorVariantId',g.anchor_variant_id,
  'originalPrice',g.original_price,'originalCurrency',g.original_currency,
  'exchangeRate',g.exchange_rate,'exchangeRateAt',g.exchange_rate_at,'exchangeRateSource',g.exchange_rate_source,
  'sourceCreatedAt',g.dataset_at,'staleAfter',g.stale_after)
 from market.catalogue_printing_general_prices g
 join current_versions cv on cv.id=g.catalogue_version_id and cv.language_code=g.language_code
 join catalog.card_variants v on v.id=g.anchor_variant_id and v.printing_id=g.printing_id and v.language_code=g.language_code and v.deprecated_at is null
 join catalog.card_printings p on p.id=g.printing_id and p.set_id=g.set_id and p.language_code=g.language_code and p.deprecated_at is null
 join catalog.sets s on s.id=g.set_id and s.deprecated_at is null and s.language_code=g.language_code
 join catalog.catalogue_version_variants cvv on cvv.catalogue_version_id=cv.id and cvv.variant_id=v.id
  and cvv.printing_id=p.id and cvv.set_id=p.set_id and cvv.language_code=v.language_code
 join market.catalogue_provider_cards m on m.variant_id=v.id and m.printing_id=p.id and m.set_id=p.set_id
  and m.language_code=v.language_code and m.catalogue_version_id=cv.id
  and m.category_id=g.category_id and m.group_id=g.group_id and m.product_id=g.product_id
 join market.catalogue_provider_set_members sm on sm.category_id=g.category_id and sm.group_id=g.group_id and sm.set_id=g.set_id and sm.language_code=g.language_code
 cross join lateral(select g.group_id guard_group,g.set_id guard_set) guard_args
 where g.printing_id=any(array['2c8cc972-78a1-4b07-adc5-d45976ba74c3'::uuid,'717bece3-4e17-443b-b2f4-246ee868aa3c'::uuid,'7e6cd159-b443-4025-9c5a-93a5b701e047'::uuid,'b1f7349e-dd55-4acf-8e7c-7218fb46845d'::uuid,'b4832c82-af35-4cf2-9ab7-3d603685d99c'::uuid,'c82a1527-9003-457c-8f49-a43f932f747a'::uuid,'d7b0f40f-a59b-4a84-af3e-8554cb3b42f5'::uuid,'d9879837-e01a-48d3-bf8e-118aae33e47f'::uuid,'e1304ca9-61cc-483b-b156-3f34fcef609f'::uuid,'f626cf39-f491-4c3d-95e1-42e3ea234421'::uuid])
  and (sm.method<>'exact_set_title' or (with published_sets as materialized (
   select s.id as set_id,s.english_display_name
   from catalog.sets s join catalog.languages l on l.code=s.language_code
   where s.language_code='en' and s.deprecated_at is null
     and exists(select 1 from catalog.catalogue_version_sets cvs
       join catalog.catalogue_versions cv on cv.id=cvs.catalogue_version_id
       where cvs.set_id=s.id and cv.status='published' and cv.deprecated_at is null)
 ), provider_groups as materialized (
   select g->>'groupId' as group_id,trim(coalesce(g->>'name','')) as raw_title,
     regexp_replace(trim(coalesce(g->>'name','')),'^(?:(?:SM|XY|BW|DP|HGSS|PL|SWSH|SV|ME)[[:space:]]*[-:]|(?:SWSH|SV|ME)[0-9]{2}[[:space:]]*[-:])[[:space:]]*','','i') as title
   from market.catalogue_bulk_feeds f cross join lateral jsonb_array_elements(f.payload->'results') g
   where f.feed_key='tcgplayer/3/groups' and g->>'categoryId'='3'
 )
 select exists(
   select 1 from market.catalogue_provider_sets mapping
   join published_sets s on s.set_id=mapping.set_id
   join provider_groups g on g.group_id=guard_args.guard_group::text
   where mapping.category_id=3 and mapping.group_id=guard_args.guard_group and mapping.set_id=guard_args.guard_set and mapping.method='exact_set_title'
     and g.title<>g.raw_title
     and api.catalogue_provider_name(s.english_display_name)=api.catalogue_provider_name(g.title)
     and (select count(distinct other.group_id::bigint) from provider_groups other
       where api.catalogue_provider_name(other.title)=api.catalogue_provider_name(s.english_display_name))=1
     and (select count(distinct other.set_id) from published_sets other
       where api.catalogue_provider_name(other.english_display_name)=api.catalogue_provider_name(s.english_display_name))=1
     and exists(
       select 1 from catalog.card_printings p
       join catalog.card_variants v on v.printing_id=p.id and v.deprecated_at is null
       join catalog.catalogue_version_variants cvv on cvv.variant_id=v.id
       join catalog.catalogue_versions cv on cv.id=cvv.catalogue_version_id
       join catalog.languages l on l.code=v.language_code
       where p.set_id=s.set_id and p.deprecated_at is null and v.language_code='en'
         and cv.status='published' and cv.deprecated_at is null
         and api.catalogue_provider_subtype(v.variant_code,v.finish_code) is not null
     )
 )))
  and (sm.method<>'exact_set_code' or api.japanese_exact_price_set_is_current(g.group_id,g.set_id))
  and not exists(select 1 from market.catalogue_provider_cards other where other.category_id=g.category_id and other.product_id=g.product_id and other.printing_id<>g.printing_id)) r;
