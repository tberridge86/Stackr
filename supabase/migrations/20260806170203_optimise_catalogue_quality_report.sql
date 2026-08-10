create or replace view ingest.catalogue_quality_report
with (security_invoker = true) as
with active_sets as (
  select *
  from catalog.sets
  where deprecated_at is null
),
set_refs as (
  select id as set_id, id::text as set_ref
  from active_sets
  union
  select id as set_id, set_code as set_ref
  from active_sets
  where nullif(set_code, '') is not null
  union
  select id as set_id, provider_set_code as set_ref
  from active_sets
  where nullif(provider_set_code, '') is not null
),
variant_image_counts as (
  select
    variant_id,
    count(*) filter (
      where asset_type = 'card_image'
        and deprecated_at is null
        and publicly_servable
        and rights_status = 'approved'
    ) as image_count
  from catalog.assets
  where variant_id is not null
  group by variant_id
),
set_card_counts as (
  select
    s.id as set_id,
    count(distinct cp.id) as imported_card_total,
    count(distinct cv.id) filter (where coalesce(vic.image_count, 0) = 0) as cards_missing_images
  from active_sets s
  left join catalog.card_printings cp
    on cp.set_id = s.id and cp.deprecated_at is null
  left join catalog.card_variants cv
    on cv.printing_id = cp.id and cv.deprecated_at is null
  left join variant_image_counts vic
    on vic.variant_id = cv.id
  group by s.id
),
set_logo_counts as (
  select
    set_id,
    count(*) filter (
      where asset_type in ('set_logo', 'set_symbol')
        and deprecated_at is null
        and publicly_servable
        and rights_status = 'approved'
    ) as logo_count
  from catalog.assets
  where set_id is not null
  group by set_id
),
duplicate_keys as (
  select set_id, count(*) as duplicate_canonical_keys
  from (
    select set_id, canonical_key
    from catalog.card_variants
    where deprecated_at is null
    group by set_id, canonical_key
    having count(*) > 1
  ) duplicate_rows
  group by set_id
),
unresolved_variants as (
  select set_id, count(*) as unresolved_variant_count
  from catalog.card_variants
  where deprecated_at is null
    and (variant_code = 'regional_other' or source_confidence < 0.70)
  group by set_id
),
open_conflicts as (
  select
    coalesce(entity_id::text, proposed_payload->>'set_id', proposed_payload->>'setId') as set_ref,
    count(*) filter (where conflict_type = 'name_conflict') as conflicting_names
  from ingest.data_conflicts
  where status in ('open', 'in_review')
  group by coalesce(entity_id::text, proposed_payload->>'set_id', proposed_payload->>'setId')
),
open_conflicts_by_set as (
  select
    sr.set_id,
    max(oc.conflicting_names) as conflicting_names
  from set_refs sr
  join open_conflicts oc on oc.set_ref = sr.set_ref
  group by sr.set_id
),
raw_record_quality as (
  select
    coalesce(raw_payload->>'set_id', raw_payload->>'setId', raw_payload->>'set_code', raw_payload->>'setCode') as set_ref,
    count(*) filter (where retrieved_at < now() - interval '30 days') as stale_source_records,
    count(*) filter (where licence_status <> 'approved') as records_without_legal_use_status
  from ingest.raw_source_records
  where deprecated_at is null
  group by coalesce(raw_payload->>'set_id', raw_payload->>'setId', raw_payload->>'set_code', raw_payload->>'setCode')
),
raw_record_quality_by_set as (
  select
    sr.set_id,
    max(rrq.stale_source_records) as stale_source_records,
    max(rrq.records_without_legal_use_status) as records_without_legal_use_status
  from set_refs sr
  join raw_record_quality rrq on rrq.set_ref = sr.set_ref
  group by sr.set_id
),
expected_set_totals as (
  select
    coalesce(language_code, raw_payload->>'language_code', raw_payload->>'languageCode', raw_payload->>'language') as language_code,
    count(distinct provider_record_id) as expected_set_total
  from ingest.raw_source_records
  where record_type = 'set'
    and deprecated_at is null
  group by coalesce(language_code, raw_payload->>'language_code', raw_payload->>'languageCode', raw_payload->>'language')
)
select
  s.id as set_id,
  s.game_code,
  s.language_code,
  s.set_code,
  s.provider_set_code,
  s.native_name,
  s.english_display_name,
  coalesce(est.expected_set_total, count(*) over (partition by s.game_code, s.language_code)) as expected_set_total,
  count(*) over (partition by s.game_code, s.language_code) as imported_set_total,
  greatest(
    coalesce(est.expected_set_total, count(*) over (partition by s.game_code, s.language_code))
      - count(*) over (partition by s.game_code, s.language_code),
    0
  ) as expected_vs_imported_set_delta,
  s.total as expected_card_total,
  coalesce(scc.imported_card_total, 0) as imported_card_total,
  greatest(coalesce(s.total, 0) - coalesce(scc.imported_card_total, 0), 0) as expected_vs_imported_card_delta,
  coalesce(scc.cards_missing_images, 0) as cards_missing_images,
  (coalesce(slc.logo_count, 0) = 0) as set_missing_logo,
  coalesce(dk.duplicate_canonical_keys, 0) as duplicate_canonical_keys,
  coalesce(uv.unresolved_variant_count, 0) as unresolved_variants,
  coalesce(oc.conflicting_names, 0) as conflicting_names,
  coalesce(rrq.stale_source_records, 0) as stale_source_records,
  coalesce(rrq.records_without_legal_use_status, 0) as records_without_legal_use_status,
  now() as reported_at
from active_sets s
left join set_card_counts scc on scc.set_id = s.id
left join set_logo_counts slc on slc.set_id = s.id
left join duplicate_keys dk on dk.set_id = s.id
left join unresolved_variants uv on uv.set_id = s.id
left join open_conflicts_by_set oc on oc.set_id = s.id
left join raw_record_quality_by_set rrq on rrq.set_id = s.id
left join expected_set_totals est on est.language_code = s.language_code;

comment on view ingest.catalogue_quality_report is
  'Private catalogue quality report using pre-aggregated exact-key joins for predictable execution time.';
