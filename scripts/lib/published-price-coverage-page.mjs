export function buildPublishedPriceCoveragePageSql({language,version,cursor="00000000-0000-0000-0000-000000000000",observedAt,pageSize=1000}){
 const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 if(!/^(en|ja|ko|zh-cn|zh-tw)$/.test(language)||![version,cursor].every(x=>uuid.test(x))||!Number.isInteger(pageSize)||pageSize<1||pageSize>1000||! /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(observedAt)||!Number.isFinite(Date.parse(observedAt)))throw Error("unsafe page parameters");
 return `set statement_timeout='8s';
with membership as materialized(
 select cvv.* from catalog.catalogue_version_variants cvv
 where cvv.catalogue_version_id='${version}'::uuid and cvv.variant_id>'${cursor}'::uuid
 order by cvv.variant_id limit ${pageSize}
), physical as materialized(
 select v.id as variant_id,v.printing_id,p.set_id,v.language_code
 from membership cvv
 join catalog.card_variants v on v.id=cvv.variant_id and v.printing_id=cvv.printing_id and v.language_code=cvv.language_code and v.deprecated_at is null
 join catalog.card_printings p on p.id=v.printing_id and p.set_id=cvv.set_id and p.language_code=v.language_code and p.deprecated_at is null
 join catalog.sets s on s.id=p.set_id and s.language_code=v.language_code and s.deprecated_at is null
 join catalog.languages l on l.code=v.language_code
 where cvv.language_code='${language}'
), guide_ids as materialized(
 select array_agg(distinct p.printing_id) as ids from physical p
 join market.catalogue_printing_general_prices g on g.printing_id=p.printing_id
 where not exists(select 1 from market.catalogue_general_prices q where q.variant_id=p.variant_id and q.printing_id=p.printing_id and q.set_id=p.set_id and q.language_code=p.language_code and q.catalogue_version_id='${version}'::uuid and q.original_price>0 and q.central_estimate>0 and q.stale_after>'${observedAt}'::timestamptz)
 and not exists(select 1 from market.cardmarket_blended_general_prices cm where cm.printing_id=p.printing_id and cm.catalogue_version_id='${version}'::uuid and cm.original_price>0 and cm.central_estimate_gbp>0 and cm.stale_after>'${observedAt}'::timestamptz and exists(select 1 from market.cardmarket_printing_mappings m where m.printing_id=cm.printing_id and m.catalogue_version_id=cm.catalogue_version_id))
 and g.original_price>0 and g.central_estimate>0 and g.stale_after>'${observedAt}'::timestamptz
), guides as materialized(
 select g.* from guide_ids ids cross join lateral api.read_catalogue_printing_general_prices(ids.ids) g
 where cardinality(ids.ids) between 1 and 100 and (g.quote->>'centralEstimate')::numeric>0
 and (g.quote->>'originalPrice')::numeric>0 and (g.quote->>'staleAfter')::timestamptz>'${observedAt}'::timestamptz
), classified as materialized(
 select p.*,q.variant_id is not null as variant_quote,guide.printing_id is not null as printing_guide,cm.printing_id is not null as cardmarket,
 q.provider as variant_provider,q.dataset_at as variant_dataset_at,q.stale_after as variant_expires,
 guide.quote->>'sourceCreatedAt' as guide_dataset_at,guide.quote->>'staleAfter' as guide_expires,
 cm.source_created_at as cm_dataset_at,cm.stale_after as cm_expires
 from physical p
 left join market.catalogue_general_prices q on q.variant_id=p.variant_id and q.printing_id=p.printing_id and q.set_id=p.set_id and q.language_code=p.language_code and q.catalogue_version_id='${version}'::uuid and q.original_price>0 and q.central_estimate>0 and q.stale_after>'${observedAt}'::timestamptz
 left join guides guide on guide.printing_id=p.printing_id
 left join market.cardmarket_blended_general_prices cm on cm.printing_id=p.printing_id and cm.catalogue_version_id='${version}'::uuid and cm.original_price>0 and cm.central_estimate_gbp>0 and cm.stale_after>'${observedAt}'::timestamptz
 and exists(select 1 from market.cardmarket_printing_mappings m where m.printing_id=cm.printing_id and m.catalogue_version_id=cm.catalogue_version_id)
)
select '${language}' as language_code,'${version}' as catalogue_version_id,now() as read_at,
 (select id from catalog.catalogue_versions where language_code='${language}' and status='published' and deprecated_at is null) as current_catalogue_version_id,
 (select count(*) from membership) as scanned,
 (select max(variant_id::text) from membership) as next_cursor,
 (select md5(coalesce(string_agg(variant_id::text||':'||printing_id::text||':'||set_id::text||':'||language_code,',' order by variant_id),'')) from membership) as membership_hash,
 count(*) as physical,
 count(*) filter(where variant_quote) as positive_variant_quotes,
 count(*) filter(where printing_guide and not variant_quote and not cardmarket) as additional_printing_guide_variants,
 count(*) filter(where cardmarket) as positive_cardmarket_variants,
 count(*) filter(where variant_quote or printing_guide or cardmarket) as positive_deduplicated_stored_variants,
 (select cardinality(ids) from guide_ids) as printing_guide_candidates,
 (select jsonb_agg(r) from(select 'variant_quote' as scope,variant_provider as provider,variant_dataset_at::text as source_date,variant_expires::text as expires,count(*) as variants from classified where variant_quote group by variant_provider,variant_dataset_at,variant_expires
 union all select 'printing_guide','tcgcsv',guide_dataset_at,guide_expires,count(*) from classified where printing_guide and not variant_quote and not cardmarket group by guide_dataset_at,guide_expires
 union all select 'printing_guide','cardmarket_public',cm_dataset_at::text,cm_expires::text,count(*) from classified where cardmarket group by cm_dataset_at,cm_expires) r) as source_breakdown
from classified;`;
}

export const TARGET_PRICE_LANGUAGES = ['en', 'ja', 'zh-cn', 'zh-tw'];
export const ZERO_VARIANT_CURSOR = '00000000-0000-0000-0000-000000000000';

// A failed, oversized or drifting read never advances the checkpoint.
export function validatePublishedPriceCoveragePage(page, {language, version, cursor, pageSize}) {
  const countKeys = ['scanned', 'physical', 'positive_variant_quotes', 'positive_cardmarket_variants',
    'additional_printing_guide_variants', 'positive_deduplicated_stored_variants'];
  if (page.language_code !== language || page.catalogue_version_id !== version
    || page.current_catalogue_version_id !== version) throw new Error('coverage_publication_drift');
  if (countKeys.some(key => !Number.isSafeInteger(page[key]) || page[key] < 0)
    || page.scanned > pageSize || page.physical > page.scanned
    || countKeys.slice(2).some(key => page[key] > page.physical)) throw new Error('invalid_coverage_counts');
  if (page.printing_guide_candidates > 100) throw new Error('coverage_guide_batch_too_large');
  if (page.positive_deduplicated_stored_variants < Math.max(page.positive_variant_quotes,page.positive_cardmarket_variants,page.additional_printing_guide_variants)
    || page.positive_deduplicated_stored_variants > page.positive_variant_quotes + page.positive_cardmarket_variants + page.additional_printing_guide_variants)
    throw new Error('invalid_coverage_overlap_counts');
  if (page.scanned > 0 && (!page.next_cursor || page.next_cursor <= cursor)) throw new Error('coverage_cursor_did_not_advance');
  if (page.scanned === 0 && page.next_cursor !== null) throw new Error('invalid_empty_coverage_cursor');
  if (!/^[a-f0-9]{32}$/.test(page.membership_hash)) throw new Error('coverage_membership_hash_missing');
  return {...page, cursor, limit:pageSize};
}

export function summarisePublishedPriceCoverage(checkpoint) {
  const rows = Object.entries(checkpoint.pages).map(([language, pages]) => {
    let expectedCursor = ZERO_VARIANT_CURSOR;
    let version = null;
    for (const page of pages) {
      if (page.cursor !== expectedCursor) throw new Error('coverage_checkpoint_gap_or_overlap');
      version ??= page.catalogue_version_id;
      validatePublishedPriceCoveragePage(page, {language,version,cursor:expectedCursor,pageSize:page.limit});
      if (page !== pages.at(-1) && page.scanned < page.limit) throw new Error('coverage_rows_after_terminal_page');
      expectedCursor = page.next_cursor;
    }
    const sum = key => pages.reduce((total,page)=>total+page[key],0);
    return {language, catalogueVersionId:version, pages:pages.length,
      complete:pages.length>0 && pages.at(-1).scanned < pages.at(-1).limit,
      scanned:sum('scanned'),physical:sum('physical'),
      invalidPhysicalMemberships:sum('scanned')-sum('physical'),
      positiveStoredVariants:sum('positive_deduplicated_stored_variants'),
      positiveVariantQuotes:sum('positive_variant_quotes'),
      positiveCardmarketVariants:sum('positive_cardmarket_variants'),
      additionalPrintingGuideVariants:sum('additional_printing_guide_variants'),
      nextCursor:expectedCursor};
  });
  const active = rows.filter(row=>TARGET_PRICE_LANGUAGES.includes(row.language));
  const complete = TARGET_PRICE_LANGUAGES.every(language=>active.some(row=>row.language===language && row.complete));
  const positive = active.reduce((total,row)=>total+row.positiveStoredVariants,0);
  const physical = active.reduce((total,row)=>total+row.physical,0);
  return {complete, observation:checkpoint.observation, rows,
    targetLanguages:TARGET_PRICE_LANGUAGES, koreanExcluded:true,
    measuredPhysicalVariants:physical, measuredPositiveStoredVariants:positive,
    wholeCataloguePercent:complete && physical>0 ? Math.round(positive/physical*10000)/100:null,
    projectedGeneralSourceAvailability:'not measured',ownerHttpPhoneVisibility:'not measured',
    atomic:false};
}
