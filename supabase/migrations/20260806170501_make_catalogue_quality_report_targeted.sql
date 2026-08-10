create index if not exists raw_source_records_active_set_ref_idx
  on ingest.raw_source_records ((coalesce(
    raw_payload->>'set_id',
    raw_payload->>'setId',
    raw_payload->>'set_code',
    raw_payload->>'setCode'
  )))
  where deprecated_at is null;

create index if not exists raw_source_records_active_language_set_idx
  on ingest.raw_source_records ((coalesce(
    language_code,
    raw_payload->>'language_code',
    raw_payload->>'languageCode',
    raw_payload->>'language'
  )), provider_record_id)
  where record_type = 'set' and deprecated_at is null;

create index if not exists data_conflicts_open_set_ref_idx
  on ingest.data_conflicts ((coalesce(
    entity_id::text,
    proposed_payload->>'set_id',
    proposed_payload->>'setId'
  )))
  where status in ('open', 'in_review');

create or replace view ingest.catalogue_quality_report
with (security_invoker = true) as
with expected_set_totals as (
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
  not exists (
    select 1
    from catalog.assets a
    where a.set_id = s.id
      and a.asset_type in ('set_logo', 'set_symbol')
      and a.deprecated_at is null
      and a.publicly_servable
      and a.rights_status = 'approved'
  ) as set_missing_logo,
  coalesce(dk.duplicate_canonical_keys, 0) as duplicate_canonical_keys,
  coalesce(uv.unresolved_variant_count, 0) as unresolved_variants,
  coalesce(oc.conflicting_names, 0) as conflicting_names,
  coalesce(rrq.stale_source_records, 0) as stale_source_records,
  coalesce(rrq.records_without_legal_use_status, 0) as records_without_legal_use_status,
  now() as reported_at
from catalog.sets s
left join expected_set_totals est on est.language_code = s.language_code
left join lateral (
  select
    count(distinct cp.id) as imported_card_total,
    count(distinct cv.id) filter (
      where not exists (
        select 1
        from catalog.assets a
        where a.variant_id = cv.id
          and a.asset_type = 'card_image'
          and a.deprecated_at is null
          and a.publicly_servable
          and a.rights_status = 'approved'
      )
    ) as cards_missing_images
  from catalog.card_printings cp
  left join catalog.card_variants cv
    on cv.printing_id = cp.id and cv.deprecated_at is null
  where cp.game_code = s.game_code
    and cp.language_code = s.language_code
    and cp.set_id = s.id
    and cp.deprecated_at is null
) scc on true
left join lateral (
  select count(*) as duplicate_canonical_keys
  from (
    select cv.canonical_key
    from catalog.card_variants cv
    where cv.game_code = s.game_code
      and cv.language_code = s.language_code
      and cv.set_id = s.id
      and cv.deprecated_at is null
    group by cv.canonical_key
    having count(*) > 1
  ) duplicate_rows
) dk on true
left join lateral (
  select count(*) as unresolved_variant_count
  from catalog.card_variants cv
  where cv.game_code = s.game_code
    and cv.language_code = s.language_code
    and cv.set_id = s.id
    and cv.deprecated_at is null
    and (cv.variant_code = 'regional_other' or cv.source_confidence < 0.70)
) uv on true
left join lateral (
  select max(conflicting_names) as conflicting_names
  from (
    select
      coalesce(dc.entity_id::text, dc.proposed_payload->>'set_id', dc.proposed_payload->>'setId') as set_ref,
      count(*) filter (where dc.conflict_type = 'name_conflict') as conflicting_names
    from ingest.data_conflicts dc
    where dc.status in ('open', 'in_review')
      and coalesce(dc.entity_id::text, dc.proposed_payload->>'set_id', dc.proposed_payload->>'setId') = any (
        array[s.id::text, nullif(s.set_code, ''), nullif(s.provider_set_code, '')]
      )
    group by coalesce(dc.entity_id::text, dc.proposed_payload->>'set_id', dc.proposed_payload->>'setId')
  ) conflict_refs
) oc on true
left join lateral (
  select
    max(stale_source_records) as stale_source_records,
    max(records_without_legal_use_status) as records_without_legal_use_status
  from (
    select
      coalesce(
        rsr.raw_payload->>'set_id',
        rsr.raw_payload->>'setId',
        rsr.raw_payload->>'set_code',
        rsr.raw_payload->>'setCode'
      ) as set_ref,
      count(*) filter (where rsr.retrieved_at < now() - interval '30 days') as stale_source_records,
      count(*) filter (where rsr.licence_status <> 'approved') as records_without_legal_use_status
    from ingest.raw_source_records rsr
    where rsr.deprecated_at is null
      and coalesce(
        rsr.raw_payload->>'set_id',
        rsr.raw_payload->>'setId',
        rsr.raw_payload->>'set_code',
        rsr.raw_payload->>'setCode'
      ) = any (array[s.id::text, nullif(s.set_code, ''), nullif(s.provider_set_code, '')])
    group by coalesce(
      rsr.raw_payload->>'set_id',
      rsr.raw_payload->>'setId',
      rsr.raw_payload->>'set_code',
      rsr.raw_payload->>'setCode'
    )
  ) raw_refs
) rrq on true
where s.deprecated_at is null;

comment on view ingest.catalogue_quality_report is
  'Private catalogue quality report using indexed per-set quality checks for predictable execution time.';
