-- Exact English TCGdex rarity backfill derived from approved, hash-bound raw records.
-- Evidence: catalogue/tcgdex-english-rarity-backfill-evidence-2026-08-20.json
-- candidate-count: 3874
-- candidate-fact-count: 6484
-- candidate-sha256: 33ac38eac2c418a3df6888004daafb8eea41ad0d0a1ddbcd79f94ed5694b70bc
-- missing-total-before: 4688
-- conflicting-printings-excluded: 225
-- no-usable-fact-or-ambiguous-set-excluded: 589
-- Safety: existing English printings only; one exact current TCGdex set identifier;
-- one distinct non-None rarity code; existing active taxonomy code; fill NULL only.

create temporary table _stackr_tcgdex_rarity_source on commit drop as
select id
from ingest.sources
where code='tcgdex'
  and active
  and deprecated_at is null
  and licence_status='approved';

create temporary table _stackr_tcgdex_english_set_keys on commit drop as
select
  external_identifier.set_id,
  min(external_identifier.external_id) as set_external_id,
  count(*)::integer as identifier_count
from ingest.external_identifiers external_identifier
join _stackr_tcgdex_rarity_source source
  on source.id=external_identifier.source_id
where external_identifier.source_entity_type='set'
  and external_identifier.language_code='en'
  and external_identifier.is_current
  and external_identifier.deprecated_at is null
  and external_identifier.set_id is not null
group by external_identifier.set_id;

create temporary table _stackr_tcgdex_english_rarity_facts on commit drop as
select
  printing.id as printing_id,
  printing.set_id,
  printing.language_code,
  printing.collector_number,
  printing.native_name,
  card_identifier.external_id as card_external_id,
  raw.payload_hash,
  nullif(
    trim(both '_' from regexp_replace(
      lower(nullif(btrim(coalesce(
        raw.raw_payload->>'rarity',
        raw.raw_payload->>'rarityCode',
        raw.raw_payload->>'rarity_code',
        raw.raw_payload#>>'{card,rarity}'
      )), '')),
      '[^a-z0-9]+',
      '_',
      'g'
    )),
    ''
  ) as rarity_code
from catalog.card_printings printing
join catalog.card_variants variant
  on variant.printing_id=printing.id
 and variant.deprecated_at is null
join ingest.external_identifiers card_identifier
  on card_identifier.variant_id=variant.id
 and card_identifier.source_entity_type='card'
 and card_identifier.language_code='en'
 and card_identifier.is_current
 and card_identifier.deprecated_at is null
join _stackr_tcgdex_rarity_source source
  on source.id=card_identifier.source_id
join ingest.raw_source_records raw
  on raw.id=card_identifier.raw_record_id
 and raw.deprecated_at is null
 and raw.licence_status='approved'
 and raw.payload_hash ~ '^[0-9a-f]{64}$'
where printing.game_code='pokemon'
  and printing.language_code='en'
  and printing.deprecated_at is null
  and printing.rarity_id is null
  and lower(coalesce(
    raw.raw_payload->>'rarity',
    raw.raw_payload->>'rarityCode',
    raw.raw_payload->>'rarity_code',
    raw.raw_payload#>>'{card,rarity}',
    ''
  )) <> 'none';

create temporary table _stackr_tcgdex_english_rarity_per_printing on commit drop as
select
  fact.printing_id,
  fact.set_id,
  fact.language_code,
  fact.collector_number,
  fact.native_name,
  set_key.set_external_id,
  count(distinct fact.rarity_code)::integer as distinct_codes,
  min(fact.rarity_code) as rarity_code,
  count(*)::integer as fact_count,
  encode(
    extensions.digest(
      string_agg(
        concat_ws('|', fact.card_external_id, fact.payload_hash, fact.rarity_code),
        E'\n'
        order by fact.card_external_id, fact.payload_hash, fact.rarity_code
      ),
      'sha256'
    ),
    'hex'
  ) as fact_bundle_sha256
from _stackr_tcgdex_english_rarity_facts fact
join _stackr_tcgdex_english_set_keys set_key
  on set_key.set_id=fact.set_id
 and set_key.identifier_count=1
where fact.rarity_code is not null
group by
  fact.printing_id,
  fact.set_id,
  fact.language_code,
  fact.collector_number,
  fact.native_name,
  set_key.set_external_id;

create temporary table _stackr_tcgdex_english_rarity_candidates (
  printing_id uuid primary key,
  set_id uuid not null,
  language_code text not null,
  collector_number text not null,
  native_name text not null,
  set_external_id text not null,
  rarity_code text not null,
  rarity_id uuid not null,
  fact_count integer not null,
  fact_bundle_sha256 text not null,
  candidate_key text not null
) on commit drop;

insert into _stackr_tcgdex_english_rarity_candidates (
  printing_id, set_id, language_code, collector_number, native_name,
  set_external_id, rarity_code, rarity_id, fact_count, fact_bundle_sha256, candidate_key
)
select
  candidate.printing_id,
  candidate.set_id,
  candidate.language_code,
  candidate.collector_number,
  candidate.native_name,
  candidate.set_external_id,
  candidate.rarity_code,
  rarity.id,
  candidate.fact_count,
  candidate.fact_bundle_sha256,
  jsonb_build_array(
    candidate.language_code,
    candidate.set_external_id,
    candidate.collector_number,
    candidate.native_name,
    candidate.rarity_code,
    candidate.fact_bundle_sha256
  )::text
from _stackr_tcgdex_english_rarity_per_printing candidate
join catalog.rarities rarity
  on rarity.game_code='pokemon'
 and rarity.code=candidate.rarity_code
 and rarity.deprecated_at is null
where candidate.distinct_codes=1;

do $evidence$
declare
  actual_count integer;
  actual_fact_count integer;
  actual_sha256 text;
  actual_by_code jsonb;
  actual_conflicts integer;
  actual_taxonomy_missing integer;
  actual_no_usable integer;
  actual_missing_total integer;
begin
  select count(*)::integer, coalesce(sum(fact_count),0)::integer
    into actual_count, actual_fact_count
  from _stackr_tcgdex_english_rarity_candidates;

  select encode(
    extensions.digest(string_agg(candidate_key,E'\n' order by candidate_key),'sha256'),
    'hex'
  )
    into actual_sha256
  from _stackr_tcgdex_english_rarity_candidates;

  select coalesce(jsonb_object_agg(rarity_code,code_count order by rarity_code),'{}'::jsonb)
    into actual_by_code
  from (
    select rarity_code, count(*)::integer as code_count
    from _stackr_tcgdex_english_rarity_candidates
    group by rarity_code
  ) counts;

  select count(*)::integer into actual_conflicts
  from _stackr_tcgdex_english_rarity_per_printing
  where distinct_codes>1;

  select count(*)::integer into actual_taxonomy_missing
  from _stackr_tcgdex_english_rarity_per_printing candidate
  left join catalog.rarities rarity
    on rarity.game_code='pokemon'
   and rarity.code=candidate.rarity_code
   and rarity.deprecated_at is null
  where candidate.distinct_codes=1 and rarity.id is null;

  select count(*)::integer into actual_missing_total
  from catalog.card_printings
  where game_code='pokemon' and language_code='en'
    and deprecated_at is null and rarity_id is null;

  actual_no_usable :=
    actual_missing_total - (select count(*)::integer from _stackr_tcgdex_english_rarity_per_printing);

  if actual_count <> 3874
    or actual_fact_count <> 6484
    or actual_sha256 <> '33ac38eac2c418a3df6888004daafb8eea41ad0d0a1ddbcd79f94ed5694b70bc'
    or actual_by_code <> '{"crown":24,"legend":18,"one_star":200,"two_star":263,"holo_rare":397,"one_shiny":150,"rare_holo":108,"two_shiny":60,"hyper_rare":74,"rare_prime":26,"shiny_rare":310,"three_star":23,"holo_rare_v":230,"one_diamond":745,"two_diamond":542,"amazing_rare":9,"four_diamond":119,"radiant_rare":15,"shiny_rare_v":9,"ace_spec_rare":33,"three_diamond":292,"holo_rare_vmax":88,"rare_holo_lv_x":59,"holo_rare_vstar":32,"shiny_rare_vmax":7,"black_white_rare":4,"shiny_ultra_rare":12,"classic_collection":25}'::jsonb
    or actual_conflicts <> 225
    or actual_taxonomy_missing <> 0
    or actual_no_usable <> 589
    or actual_missing_total <> 4688
  then
    raise exception
      'English TCGdex rarity evidence mismatch: count %, facts %, sha %, conflicts %, taxonomy %, no-usable %, missing %',
      actual_count, actual_fact_count, actual_sha256, actual_conflicts,
      actual_taxonomy_missing, actual_no_usable, actual_missing_total;
  end if;
end
$evidence$;

create temporary table _stackr_tcgdex_english_rarity_changes (
  printing_id uuid primary key,
  set_external_id text not null,
  collector_number text not null,
  native_name text not null,
  rarity_code text not null,
  rarity_id uuid not null,
  fact_bundle_sha256 text not null
) on commit drop;

do $backfill$
declare
  expected_update_count integer;
  updated_count integer;
begin
  perform printing.id
  from catalog.card_printings printing
  join _stackr_tcgdex_english_rarity_candidates candidate
    on candidate.printing_id=printing.id
  order by printing.id
  for update of printing;

  if exists (
    select 1
    from _stackr_tcgdex_english_rarity_candidates candidate
    join catalog.card_printings printing on printing.id=candidate.printing_id
    where printing.rarity_id is not null
      and printing.rarity_id <> candidate.rarity_id
  ) then
    raise exception 'English TCGdex rarity backfill refused a conflicting non-null canonical rarity';
  end if;

  select count(*)::integer into expected_update_count
  from _stackr_tcgdex_english_rarity_candidates candidate
  join catalog.card_printings printing on printing.id=candidate.printing_id
  where printing.rarity_id is null;

  with changed as (
    update catalog.card_printings printing
    set rarity_id=candidate.rarity_id, updated_at=now()
    from _stackr_tcgdex_english_rarity_candidates candidate
    where printing.id=candidate.printing_id
      and printing.rarity_id is null
    returning
      printing.id,
      candidate.set_external_id,
      candidate.collector_number,
      candidate.native_name,
      candidate.rarity_code,
      candidate.rarity_id,
      candidate.fact_bundle_sha256
  )
  insert into _stackr_tcgdex_english_rarity_changes (
    printing_id, set_external_id, collector_number, native_name,
    rarity_code, rarity_id, fact_bundle_sha256
  )
  select id, set_external_id, collector_number, native_name,
    rarity_code, rarity_id, fact_bundle_sha256
  from changed;

  get diagnostics updated_count = row_count;
  if updated_count <> expected_update_count then
    raise exception 'English TCGdex rarity update count mismatch: expected %, got %',
      expected_update_count, updated_count;
  end if;
end
$backfill$;

insert into audit.catalogue_events (
  request_id, actor_role, event_type, entity_schema, entity_table,
  entity_id, canonical_key, event_payload, internal_notes
)
select
  'catalogue-rarity-en:2026-08-20:33ac38eac2c418a3',
  'catalogue_migration',
  'catalogue_printing_rarity_backfilled',
  'catalog',
  'card_printings',
  change.printing_id,
  concat('pokemon:en:',change.set_external_id,':',change.collector_number),
  jsonb_build_object(
    'languageCode','en',
    'setExternalId',change.set_external_id,
    'collectorNumber',change.collector_number,
    'rarityCode',change.rarity_code,
    'factBundleSha256',change.fact_bundle_sha256,
    'candidateSetSha256','33ac38eac2c418a3df6888004daafb8eea41ad0d0a1ddbcd79f94ed5694b70bc',
    'sourceCode','tcgdex'
  ),
  'One exact non-None TCGdex rarity code across approved raw facts; null-only backfill.'
from _stackr_tcgdex_english_rarity_changes change;

insert into catalog.catalogue_change_log (
  entity_schema, entity_table, entity_id, change_type, mobile_syncable, public_change_summary
)
select
  'catalog',
  'card_printings',
  change.printing_id,
  'update',
  true,
  jsonb_build_object(
    'field','rarity_id',
    'rarityCode',change.rarity_code,
    'languageCode','en',
    'sourceCode','tcgdex'
  )
from _stackr_tcgdex_english_rarity_changes change;

do $postcondition$
begin
  if exists (
    select 1
    from _stackr_tcgdex_english_rarity_candidates candidate
    join catalog.card_printings printing on printing.id=candidate.printing_id
    where printing.rarity_id is distinct from candidate.rarity_id
  ) then
    raise exception 'English TCGdex rarity backfill postcondition failed';
  end if;
end
$postcondition$;
