-- Resolve the final launch-language release-date gap from the official Pokemon China product page.
-- Evidence: catalogue/pokemon-cn-csm25-release-date-evidence-2026-08-21.json
-- Official source: https://www.pokemon.cn/tcg/product/16318.html
-- Source fact SHA-256: 5f5f52540d91eadef238916641962ee91a0ebbe45d01002f89472cb9a15d9475

set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table catalog.sets in share row exclusive mode;

do $precondition$
declare
  launch_missing_count integer;
  target_count integer;
  identifier_count integer;
  approved_raw_count integer;
begin
  select count(*)::integer
  into launch_missing_count
  from catalog.sets
  where language_code in ('en','ja','zh-tw','zh-cn')
    and deprecated_at is null
    and release_date is null;

  select count(*)::integer
  into target_count
  from catalog.sets
  where game_code='pokemon'
    and language_code='zh-cn'
    and set_code='csm2.5c'
    and provider_set_code='csm2.5c'
    and native_name='炫奇争胜'
    and english_display_name='Striking Competition'
    and release_date is null
    and printed_total=61
    and total=99
    and deprecated_at is null;

  select
    count(*)::integer,
    count(*) filter (
      where source.licence_status='approved'
        and raw.licence_status='approved'
        and raw.payload_hash ~ '^[0-9a-f]{64}$'
    )::integer
  into identifier_count, approved_raw_count
  from catalog.sets set_row
  join ingest.external_identifiers identifier
    on identifier.set_id=set_row.id
   and identifier.is_current
   and identifier.deprecated_at is null
  join ingest.sources source
    on source.id=identifier.source_id
   and source.code in ('tcgdex','pikaqian')
  join ingest.raw_source_records raw
    on raw.id=identifier.raw_record_id
   and raw.deprecated_at is null
  where set_row.game_code='pokemon'
    and set_row.language_code='zh-cn'
    and set_row.set_code='csm2.5c'
    and set_row.deprecated_at is null;

  if launch_missing_count <> 1
     or target_count <> 1
     or identifier_count <> 3
     or approved_raw_count <> 3
  then
    raise exception 'Official csm2.5c release-date precondition failed: launch gaps %, target %, identifiers %, approved raw %',
      launch_missing_count, target_count, identifier_count, approved_raw_count;
  end if;
end
$precondition$;

create temporary table _stackr_csm25_release_date_change (
  set_id uuid primary key,
  set_code text not null,
  native_name text not null,
  old_release_date date,
  new_release_date date not null
) on commit drop;

with updated as (
  update catalog.sets
  set
    release_date='2023-03-17'::date,
    updated_at=now()
  where game_code='pokemon'
    and language_code='zh-cn'
    and set_code='csm2.5c'
    and provider_set_code='csm2.5c'
    and native_name='炫奇争胜'
    and english_display_name='Striking Competition'
    and release_date is null
    and printed_total=61
    and total=99
    and deprecated_at is null
  returning id, set_code, native_name
)
insert into _stackr_csm25_release_date_change
select id, set_code, native_name, null, '2023-03-17'::date
from updated;

do $update_count$
begin
  if (select count(*) from _stackr_csm25_release_date_change) <> 1 then
    raise exception 'Official csm2.5c release-date migration changed an unexpected number of rows';
  end if;
end
$update_count$;

insert into audit.catalogue_events (
  request_id,
  actor_role,
  event_type,
  entity_schema,
  entity_table,
  entity_id,
  canonical_key,
  event_payload,
  internal_notes
)
select
  'catalogue-zh-cn-csm25-date:2026-08-21:5f5f52540d91eade',
  'catalogue_migration',
  'catalogue_set_release_date_backfilled',
  'catalog',
  'sets',
  change.set_id,
  concat('pokemon:zh-cn:', change.set_code),
  jsonb_build_object(
    'languageCode', 'zh-cn',
    'setCode', change.set_code,
    'nativeName', change.native_name,
    'oldReleaseDate', change.old_release_date,
    'newReleaseDate', change.new_release_date,
    'sourceCode', 'pokemon_cn_official',
    'sourceType', 'official_primary_product_page',
    'sourceUrl', 'https://www.pokemon.cn/tcg/product/16318.html',
    'sourcePagePublishedAt', '2023-03-01',
    'sourceFactSha256', '5f5f52540d91eadef238916641962ee91a0ebbe45d01002f89472cb9a15d9475'
  ),
  'Official Pokemon China product page resolves the prior TCGdex date conflict; existing raw provider facts remain unchanged.'
from _stackr_csm25_release_date_change change;

insert into catalog.catalogue_change_log (
  entity_schema,
  entity_table,
  entity_id,
  change_type,
  mobile_syncable,
  public_change_summary
)
select
  'catalog',
  'sets',
  change.set_id,
  'update',
  true,
  jsonb_build_object(
    'languageCode', 'zh-cn',
    'setCode', change.set_code,
    'releaseDate', change.new_release_date
  )
from _stackr_csm25_release_date_change change;

do $postcondition$
begin
  if exists (
    select 1
    from catalog.sets
    where game_code='pokemon'
      and language_code='zh-cn'
      and set_code='csm2.5c'
      and deprecated_at is null
      and release_date is distinct from '2023-03-17'::date
  ) then
    raise exception 'Official csm2.5c release-date postcondition failed';
  end if;

  if exists (
    select 1
    from catalog.sets
    where language_code in ('en','ja','zh-tw','zh-cn')
      and deprecated_at is null
      and release_date is null
  ) then
    raise exception 'A launch-language release-date gap remains after csm2.5c resolution';
  end if;
end
$postcondition$;
