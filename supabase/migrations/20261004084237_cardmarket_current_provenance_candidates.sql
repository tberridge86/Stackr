-- Expose only reviewable, printing-scoped Cardmarket candidates. The public guide
-- remains blended: this function never asserts a finish, condition, or valuation.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists raw_source_records_current_external_idx
  on ingest.raw_source_records(source_id, external_id, language_code, source_updated_at desc, retrieved_at desc, id desc)
  where deprecated_at is null;

create or replace function api.list_cardmarket_current_provenance_candidates(
  p_after_product_id bigint default 0,
  p_limit integer default 100
)
returns table(
  provider_product_id bigint,
  printing_id uuid,
  language_code text,
  catalogue_version_id uuid,
  provenance jsonb
)
language sql stable security invoker set search_path = '' as $function$
  with current_raw as materialized (
    select distinct on (r.source_id, r.external_id, r.language_code)
      r.source_id, r.external_id, r.language_code, r.id as raw_record_id,
      r.payload_hash, r.source_updated_at, r.retrieved_at,
      r.raw_payload->'pricing'->'cardmarket'->'idProduct' as product_json,
      r.raw_payload->'pricing'->'cardmarket'->>'idProduct' as product_text
    from ingest.raw_source_records r
    join ingest.sources source on source.id = r.source_id
    where source.code = 'tcgdex' and r.deprecated_at is null
    order by r.source_id, r.external_id, r.language_code,
      coalesce(r.source_updated_at, r.retrieved_at) desc, r.retrieved_at desc, r.id desc
  ), latest_published_versions as materialized (
    select distinct on (cv.language_code) cv.id, cv.language_code
    from catalog.catalogue_versions cv
    where cv.status = 'published' and cv.deprecated_at is null
    order by cv.language_code, cv.published_at desc nulls last, cv.created_at desc, cv.id desc
  ), observations as materialized (
    select raw.product_text::bigint as provider_product_id,
      printing.id as printing_id, variant.language_code, version.id as catalogue_version_id,
      raw.external_id, raw.raw_record_id, raw.payload_hash, raw.source_updated_at, raw.retrieved_at,
      variant.id as variant_id, variant.variant_code, variant.finish_code
    from current_raw raw
    join catalog.catalogue_version_external_identifiers identifier
      on identifier.source_id = raw.source_id
      and identifier.external_id = raw.external_id
      and identifier.language_code = raw.language_code
      and identifier.variant_id is not null
    join latest_published_versions version on version.id = identifier.catalogue_version_id
      and version.language_code = identifier.language_code
    join catalog.catalogue_version_variants version_variant
      on version_variant.catalogue_version_id = version.id and version_variant.variant_id = identifier.variant_id
    join catalog.card_variants variant on variant.id = identifier.variant_id and variant.deprecated_at is null
      and variant.language_code = identifier.language_code
    join catalog.card_printings printing on printing.id = variant.printing_id and printing.deprecated_at is null
      and printing.language_code = identifier.language_code
      and (identifier.printing_id is null or identifier.printing_id = printing.id)
    where jsonb_typeof(raw.product_json) = 'number'
      and raw.product_text ~ '^[1-9][0-9]*$'
  ), unambiguous as materialized (
    select provider_product_id,
      (array_agg(distinct printing_id order by printing_id))[1] as printing_id,
      min(language_code) as language_code,
      (array_agg(distinct catalogue_version_id order by catalogue_version_id))[1] as catalogue_version_id,
      jsonb_build_object(
        'source', 'tcgdex',
        'scope', 'current_canonical_printing_language',
        'externalIds', jsonb_agg(distinct external_id order by external_id),
        'rawRecordIds', jsonb_agg(distinct raw_record_id::text order by raw_record_id::text),
        'payloadHashes', jsonb_agg(distinct payload_hash order by payload_hash),
        'sourceUpdatedAt', max(source_updated_at),
        'retrievedAt', max(retrieved_at),
        'variantIds', jsonb_agg(distinct variant_id::text order by variant_id::text),
        'variantCodes', jsonb_agg(distinct variant_code order by variant_code),
        'finishCodes', jsonb_agg(distinct finish_code order by finish_code),
        'finishScope', 'blended_public_guide_not_exact_finish'
      ) as provenance
    from observations
    group by provider_product_id
    having count(distinct printing_id) = 1
      and count(distinct language_code) = 1
      and count(distinct catalogue_version_id) = 1
  )
  select provider_product_id, printing_id, language_code, catalogue_version_id, provenance
  from unambiguous
  where provider_product_id > p_after_product_id
  order by provider_product_id
  limit case when p_limit between 1 and 500 then p_limit else 0 end;
$function$;

revoke all on function api.list_cardmarket_current_provenance_candidates(bigint,integer) from public, anon, authenticated;
grant execute on function api.list_cardmarket_current_provenance_candidates(bigint,integer) to service_role;
comment on function api.list_cardmarket_current_provenance_candidates(bigint,integer) is
  'Service-only review candidates from current TCGdex provenance. Each provider product resolves to exactly one published canonical printing and language; finish is explicitly blended and never exact pricing evidence.';
