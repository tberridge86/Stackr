-- Language-scoped catalogue publication snapshots.
-- Repository migration only. Validate in staging before applying anywhere else.

create schema if not exists catalog;
create schema if not exists ingest;
create schema if not exists api;
create schema if not exists audit;

alter table if exists catalog.catalogue_versions
  add column if not exists language_code text references catalog.languages(code),
  add column if not exists version_label text,
  add column if not exists coverage_summary jsonb not null default '{}'::jsonb;

update catalog.catalogue_versions
set version_label = coalesce(version_label, version_key)
where version_label is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'catalogue_versions_coverage_summary_object'
  ) then
    alter table catalog.catalogue_versions
      add constraint catalogue_versions_coverage_summary_object
      check (jsonb_typeof(coverage_summary) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'catalogue_versions_language_required_for_publish'
  ) then
    alter table catalog.catalogue_versions
      add constraint catalogue_versions_language_required_for_publish
      check (status <> 'published' or language_code is not null);
  end if;
end $$;

create unique index if not exists catalogue_versions_one_published_per_language_uidx
  on catalog.catalogue_versions(language_code)
  where status = 'published' and deprecated_at is null and language_code is not null;

create table if not exists catalog.catalogue_version_sets (
  catalogue_version_id uuid not null references catalog.catalogue_versions(id) on delete cascade,
  language_code text not null references catalog.languages(code),
  set_id uuid not null references catalog.sets(id) on delete cascade,
  set_code text,
  set_status text not null
    check (set_status in ('Metadata incomplete', 'Images incomplete', 'Set art incomplete', 'Under review', 'Complete')),
  checklist_completion_percentage numeric not null default 0 check (checklist_completion_percentage >= 0 and checklist_completion_percentage <= 100),
  image_completion_percentage numeric not null default 0 check (image_completion_percentage >= 0 and image_completion_percentage <= 100),
  set_art_completion_percentage numeric not null default 0 check (set_art_completion_percentage >= 0 and set_art_completion_percentage <= 100),
  snapshot_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (catalogue_version_id, set_id),
  check (jsonb_typeof(snapshot_summary) = 'object')
);

create table if not exists catalog.catalogue_version_printings (
  catalogue_version_id uuid not null references catalog.catalogue_versions(id) on delete cascade,
  language_code text not null references catalog.languages(code),
  set_id uuid not null references catalog.sets(id) on delete cascade,
  printing_id uuid not null references catalog.card_printings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (catalogue_version_id, printing_id)
);

create table if not exists catalog.catalogue_version_variants (
  catalogue_version_id uuid not null references catalog.catalogue_versions(id) on delete cascade,
  language_code text not null references catalog.languages(code),
  set_id uuid not null references catalog.sets(id) on delete cascade,
  printing_id uuid not null references catalog.card_printings(id) on delete cascade,
  variant_id uuid not null references catalog.card_variants(id) on delete cascade,
  canonical_key text not null,
  created_at timestamptz not null default now(),
  primary key (catalogue_version_id, variant_id)
);

create table if not exists catalog.catalogue_version_assets (
  catalogue_version_id uuid not null references catalog.catalogue_versions(id) on delete cascade,
  language_code text not null references catalog.languages(code),
  set_id uuid references catalog.sets(id) on delete cascade,
  printing_id uuid references catalog.card_printings(id) on delete cascade,
  variant_id uuid references catalog.card_variants(id) on delete cascade,
  asset_id uuid not null references catalog.assets(id) on delete cascade,
  asset_type text not null,
  created_at timestamptz not null default now(),
  primary key (catalogue_version_id, asset_id),
  check (num_nonnulls(set_id, printing_id, variant_id) >= 1)
);

create table if not exists catalog.catalogue_version_external_identifiers (
  catalogue_version_id uuid not null references catalog.catalogue_versions(id) on delete cascade,
  language_code text not null references catalog.languages(code),
  source_id uuid not null references ingest.sources(id) on delete restrict,
  source_entity_type text not null,
  external_id text not null,
  external_uri text,
  set_id uuid references catalog.sets(id) on delete cascade,
  printing_id uuid references catalog.card_printings(id) on delete cascade,
  variant_id uuid references catalog.card_variants(id) on delete cascade,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  primary key (catalogue_version_id, source_id, source_entity_type, external_id, language_code),
  check (external_id <> ''),
  check (num_nonnulls(set_id, printing_id, variant_id) = 1)
);

create index if not exists catalogue_version_sets_published_lookup_idx
  on catalog.catalogue_version_sets(language_code, set_id);

create index if not exists catalogue_version_printings_lookup_idx
  on catalog.catalogue_version_printings(language_code, set_id, printing_id);

create index if not exists catalogue_version_variants_lookup_idx
  on catalog.catalogue_version_variants(language_code, set_id, printing_id, variant_id);

create index if not exists catalogue_version_assets_lookup_idx
  on catalog.catalogue_version_assets(language_code, asset_type, set_id, printing_id, variant_id);

create index if not exists catalogue_version_external_identifiers_lookup_idx
  on catalog.catalogue_version_external_identifiers(language_code, external_id, set_id, printing_id, variant_id);

alter table catalog.catalogue_version_sets enable row level security;
alter table catalog.catalogue_version_printings enable row level security;
alter table catalog.catalogue_version_variants enable row level security;
alter table catalog.catalogue_version_assets enable row level security;
alter table catalog.catalogue_version_external_identifiers enable row level security;

drop policy if exists "published catalogue version sets public read" on catalog.catalogue_version_sets;
create policy "published catalogue version sets public read" on catalog.catalogue_version_sets
  for select to anon, authenticated
  using (
    exists (
      select 1 from catalog.catalogue_versions cv
      where cv.id = catalogue_version_id
        and cv.status = 'published'
        and cv.deprecated_at is null
    )
  );

drop policy if exists "published catalogue version printings public read" on catalog.catalogue_version_printings;
create policy "published catalogue version printings public read" on catalog.catalogue_version_printings
  for select to anon, authenticated
  using (
    exists (
      select 1 from catalog.catalogue_versions cv
      where cv.id = catalogue_version_id
        and cv.status = 'published'
        and cv.deprecated_at is null
    )
  );

drop policy if exists "published catalogue version variants public read" on catalog.catalogue_version_variants;
create policy "published catalogue version variants public read" on catalog.catalogue_version_variants
  for select to anon, authenticated
  using (
    exists (
      select 1 from catalog.catalogue_versions cv
      where cv.id = catalogue_version_id
        and cv.status = 'published'
        and cv.deprecated_at is null
    )
  );

drop policy if exists "published catalogue version assets public read" on catalog.catalogue_version_assets;
create policy "published catalogue version assets public read" on catalog.catalogue_version_assets
  for select to anon, authenticated
  using (
    exists (
      select 1 from catalog.catalogue_versions cv
      where cv.id = catalogue_version_id
        and cv.status = 'published'
        and cv.deprecated_at is null
    )
  );

drop policy if exists "published catalogue version external identifiers public read" on catalog.catalogue_version_external_identifiers;
create policy "published catalogue version external identifiers public read" on catalog.catalogue_version_external_identifiers
  for select to anon, authenticated
  using (
    exists (
      select 1 from catalog.catalogue_versions cv
      where cv.id = catalogue_version_id
        and cv.status = 'published'
        and cv.deprecated_at is null
    )
  );

drop policy if exists "catalogue service role manages version sets" on catalog.catalogue_version_sets;
create policy "catalogue service role manages version sets" on catalog.catalogue_version_sets for all to service_role using (true) with check (true);
drop policy if exists "catalogue service role manages version printings" on catalog.catalogue_version_printings;
create policy "catalogue service role manages version printings" on catalog.catalogue_version_printings for all to service_role using (true) with check (true);
drop policy if exists "catalogue service role manages version variants" on catalog.catalogue_version_variants;
create policy "catalogue service role manages version variants" on catalog.catalogue_version_variants for all to service_role using (true) with check (true);
drop policy if exists "catalogue service role manages version assets" on catalog.catalogue_version_assets;
create policy "catalogue service role manages version assets" on catalog.catalogue_version_assets for all to service_role using (true) with check (true);
drop policy if exists "catalogue service role manages version external identifiers" on catalog.catalogue_version_external_identifiers;
create policy "catalogue service role manages version external identifiers" on catalog.catalogue_version_external_identifiers for all to service_role using (true) with check (true);

drop policy if exists "catalogue languages public read" on catalog.languages;
create policy "catalogue languages public read" on catalog.languages
  for select to anon, authenticated
  using (
    active
    and deprecated_at is null
    and exists (
      select 1 from catalog.catalogue_versions cv
      where cv.language_code = code
        and cv.status = 'published'
        and cv.deprecated_at is null
    )
  );

drop policy if exists "catalogue series public read" on catalog.series;
create policy "catalogue series public read" on catalog.series
  for select to anon, authenticated
  using (
    deprecated_at is null
    and exists (
      select 1
      from catalog.catalogue_version_sets cvs
      join catalog.catalogue_versions cv on cv.id = cvs.catalogue_version_id
      join catalog.sets s on s.id = cvs.set_id
      where cv.status = 'published'
        and cv.deprecated_at is null
        and s.series_id = series.id
    )
  );

drop policy if exists "catalogue sets public read" on catalog.sets;
create policy "catalogue sets public read" on catalog.sets
  for select to anon, authenticated
  using (
    deprecated_at is null
    and exists (
      select 1
      from catalog.catalogue_version_sets cvs
      join catalog.catalogue_versions cv on cv.id = cvs.catalogue_version_id
      where cv.status = 'published'
        and cv.deprecated_at is null
        and cvs.set_id = sets.id
    )
  );

drop policy if exists "catalogue printings public read" on catalog.card_printings;
create policy "catalogue printings public read" on catalog.card_printings
  for select to anon, authenticated
  using (
    deprecated_at is null
    and exists (
      select 1
      from catalog.catalogue_version_printings cvp
      join catalog.catalogue_versions cv on cv.id = cvp.catalogue_version_id
      where cv.status = 'published'
        and cv.deprecated_at is null
        and cvp.printing_id = card_printings.id
    )
  );

drop policy if exists "catalogue card variants public read" on catalog.card_variants;
create policy "catalogue card variants public read" on catalog.card_variants
  for select to anon, authenticated
  using (
    deprecated_at is null
    and exists (
      select 1
      from catalog.catalogue_version_variants cvv
      join catalog.catalogue_versions cv on cv.id = cvv.catalogue_version_id
      where cv.status = 'published'
        and cv.deprecated_at is null
        and cvv.variant_id = card_variants.id
    )
  );

drop policy if exists "catalogue card names public read" on catalog.card_names;
create policy "catalogue card names public read" on catalog.card_names
  for select to anon, authenticated
  using (
    deprecated_at is null
    and (
      (variant_id is not null and exists (
        select 1
        from catalog.catalogue_version_variants cvv
        join catalog.catalogue_versions cv on cv.id = cvv.catalogue_version_id
        where cv.status = 'published'
          and cv.deprecated_at is null
          and cvv.variant_id = card_names.variant_id
      ))
      or
      (printing_id is not null and exists (
        select 1
        from catalog.catalogue_version_printings cvp
        join catalog.catalogue_versions cv on cv.id = cvp.catalogue_version_id
        where cv.status = 'published'
          and cv.deprecated_at is null
          and cvp.printing_id = card_names.printing_id
      ))
    )
  );

drop policy if exists "catalogue assets public read" on catalog.assets;
create policy "catalogue assets public read" on catalog.assets
  for select to anon, authenticated
  using (
    deprecated_at is null
    and exists (
      select 1
      from catalog.catalogue_version_assets cva
      join catalog.catalogue_versions cv on cv.id = cva.catalogue_version_id
      where cv.status = 'published'
        and cv.deprecated_at is null
        and cva.asset_id = assets.id
    )
  );

create or replace function catalog.activate_catalogue_version(
  p_catalogue_version_id uuid,
  p_request_id text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = catalog, audit, public
as $$
declare
  candidate catalog.catalogue_versions%rowtype;
  previous_id uuid;
begin
  select * into candidate
  from catalog.catalogue_versions
  where id = p_catalogue_version_id
  for update;

  if not found then
    raise exception 'Catalogue version not found.' using errcode = 'P0001';
  end if;

  if candidate.language_code is null then
    raise exception 'Catalogue version requires language_code before activation.' using errcode = 'P0001';
  end if;

  if candidate.status not in ('draft', 'published', 'deprecated', 'rolled_back') then
    raise exception 'Catalogue version cannot be activated from status %.', candidate.status
      using errcode = 'P0001';
  end if;

  select id into previous_id
  from catalog.catalogue_versions
  where status = 'published'
    and deprecated_at is null
    and language_code = candidate.language_code
    and id <> p_catalogue_version_id
  order by published_at desc nulls last, updated_at desc
  limit 1
  for update;

  update catalog.catalogue_versions
  set status = 'deprecated',
      deprecated_at = now(),
      deprecated_reason = coalesce(p_reason, 'Superseded by catalogue activation.'),
      superseded_by_version_id = p_catalogue_version_id,
      updated_at = now()
  where id = previous_id;

  update catalog.catalogue_versions
  set status = 'published',
      published_at = now(),
      deprecated_at = null,
      deprecated_reason = null,
      superseded_by_version_id = null,
      updated_at = now()
  where id = p_catalogue_version_id;

  insert into audit.release_activation_events(
    component, action, target_id, previous_id, request_id, reason
  ) values (
    'catalogue', 'activate', p_catalogue_version_id, previous_id, p_request_id, p_reason
  );

  return p_catalogue_version_id;
end;
$$;

drop view if exists
  api.asset_manifest,
  api.catalogue_delta_changes,
  api.catalogue_external_identifiers,
  api.catalogue_card_names,
  api.catalogue_cards,
  api.catalogue_sets,
  api.catalogue_series,
  api.catalogue_languages,
  api.published_catalogue_versions
cascade;

create or replace view api.published_catalogue_versions
with (security_invoker = true)
as
select
  cv.id,
  cv.version_key,
  cv.version_label,
  cv.language_code,
  l.bcp47_code,
  l.english_name as language_english_name,
  l.native_name as language_native_name,
  l.script_code,
  l.sort_order as language_sort_order,
  cv.min_change_sequence,
  cv.max_change_sequence,
  cv.coverage_summary,
  cv.published_at,
  cv.updated_at
from catalog.catalogue_versions cv
join catalog.languages l on l.code = cv.language_code
where cv.status = 'published'
  and cv.deprecated_at is null
  and cv.language_code is not null;

create or replace view api.catalogue_languages
with (security_invoker = true)
as
select distinct
  l.code,
  l.bcp47_code,
  l.english_name,
  l.native_name,
  l.script_code,
  l.sort_order
from catalog.languages l
join catalog.catalogue_versions cv on cv.language_code = l.code
where l.active
  and l.deprecated_at is null
  and cv.status = 'published'
  and cv.deprecated_at is null;

create or replace view api.catalogue_series
with (security_invoker = true)
as
select distinct
  sr.id,
  sr.game_code,
  sr.language_code,
  sr.native_name,
  sr.english_display_name,
  sr.series_code,
  sr.release_date,
  sr.end_date,
  sr.display_order,
  sr.updated_at
from catalog.series sr
join catalog.sets s on s.series_id = sr.id
join catalog.catalogue_version_sets cvs on cvs.set_id = s.id
join catalog.catalogue_versions cv on cv.id = cvs.catalogue_version_id
where sr.deprecated_at is null
  and s.deprecated_at is null
  and cv.status = 'published'
  and cv.deprecated_at is null;

create or replace view api.catalogue_sets
with (security_invoker = true)
as
select
  s.id as set_id,
  cv.id as catalogue_version_id,
  cv.version_key as catalogue_version,
  s.game_code,
  s.language_code,
  l.english_name as language_english_name,
  l.native_name as language_native_name,
  s.series_id,
  sr.native_name as series_native_name,
  sr.english_display_name as series_english_display_name,
  s.set_code,
  s.native_name,
  s.english_display_name,
  s.release_date,
  s.printed_total,
  s.total,
  s.region_code,
  s.updated_at,
  s.source_updated_at
from catalog.catalogue_version_sets cvs
join catalog.catalogue_versions cv on cv.id = cvs.catalogue_version_id
join catalog.sets s on s.id = cvs.set_id
join catalog.languages l on l.code = s.language_code
left join catalog.series sr on sr.id = s.series_id
where cv.status = 'published'
  and cv.deprecated_at is null
  and s.deprecated_at is null;

create or replace view api.catalogue_cards
with (security_invoker = true)
as
select
  v.id as variant_id,
  cv.id as catalogue_version_id,
  cv.version_key as catalogue_version,
  v.canonical_key,
  v.game_code,
  v.language_code,
  l.english_name as language_english_name,
  l.native_name as language_native_name,
  p.set_id,
  s.set_code,
  s.native_name as set_native_name,
  s.english_display_name as set_english_display_name,
  p.id as printing_id,
  p.collector_number,
  p.collector_number_prefix,
  p.collector_number_sort,
  p.collector_number_suffix,
  p.collector_number_sort_key,
  p.native_name as card_native_name,
  p.english_display_name as card_english_display_name,
  r.code as rarity_code,
  r.english_label as rarity_label,
  v.variant_code,
  vt.english_label as variant_label,
  v.finish_code,
  f.english_label as finish_label,
  v.artwork_key,
  p.updated_at,
  greatest(p.updated_at, v.updated_at, s.updated_at) as changed_at
from catalog.catalogue_version_variants cvv
join catalog.catalogue_versions cv on cv.id = cvv.catalogue_version_id
join catalog.card_variants v on v.id = cvv.variant_id
join catalog.card_printings p on p.id = v.printing_id
join catalog.sets s on s.id = p.set_id
join catalog.languages l on l.code = v.language_code
left join catalog.rarities r on r.id = p.rarity_id
left join catalog.variant_taxonomy vt on vt.code = v.variant_code
left join catalog.finishes f on f.code = v.finish_code
where cv.status = 'published'
  and cv.deprecated_at is null
  and v.deprecated_at is null
  and p.deprecated_at is null
  and s.deprecated_at is null;

create or replace view api.catalogue_card_names
with (security_invoker = true)
as
select
  n.id,
  n.card_concept_id,
  n.printing_id,
  n.variant_id,
  n.language_code,
  n.name_type,
  n.name,
  n.normalized_name,
  n.source_confidence,
  n.updated_at
from catalog.card_names n
where n.deprecated_at is null
  and (
    exists (
      select 1
      from catalog.catalogue_version_variants cvv
      join catalog.catalogue_versions cv on cv.id = cvv.catalogue_version_id
      where cv.status = 'published'
        and cv.deprecated_at is null
        and cvv.variant_id = n.variant_id
    )
    or exists (
      select 1
      from catalog.catalogue_version_printings cvp
      join catalog.catalogue_versions cv on cv.id = cvp.catalogue_version_id
      where cv.status = 'published'
        and cv.deprecated_at is null
        and cvp.printing_id = n.printing_id
    )
  );

create or replace view api.catalogue_external_identifiers
with (security_invoker = true)
as
select
  cvei.source_entity_type,
  cvei.external_id,
  cvei.external_uri,
  cvei.language_code,
  cvei.set_id,
  cvei.printing_id,
  cvei.variant_id,
  cvei.confidence
from catalog.catalogue_version_external_identifiers cvei
join catalog.catalogue_versions cv on cv.id = cvei.catalogue_version_id
where cv.status = 'published'
  and cv.deprecated_at is null;

create or replace view api.catalogue_delta_changes
with (security_invoker = true)
as
select
  ccl.change_sequence,
  ccl.catalogue_version_id,
  ccl.entity_schema,
  ccl.entity_table,
  ccl.entity_id,
  ccl.entity_key,
  ccl.change_type,
  ccl.public_change_summary,
  ccl.changed_at
from catalog.catalogue_change_log ccl
join catalog.catalogue_versions cv on cv.id = ccl.catalogue_version_id
where ccl.mobile_syncable = true
  and cv.status = 'published'
  and cv.deprecated_at is null;

create or replace view api.asset_manifest
with (security_invoker = true) as
select
  a.asset_id,
  a.asset_type,
  a.game_code,
  a.set_id,
  a.printing_id,
  a.variant_id,
  a.storage_provider,
  a.storage_bucket,
  a.storage_key,
  a.url as external_url,
  a.original_source_url,
  coalesce(a.source_attribution, a.attribution_text) as source_attribution,
  a.permission_status,
  a.rights_status,
  a.content_sha256,
  a.perceptual_hash,
  a.mime_type,
  a.width,
  a.height,
  a.byte_size,
  a.derivative_list,
  a.cache_control,
  a.externally_referenced,
  a.unavailable_reason,
  a.last_verified_at,
  a.created_at,
  a.updated_at
from catalog.catalogue_version_assets cva
join catalog.catalogue_versions cv on cv.id = cva.catalogue_version_id
join catalog.assets a on a.id = cva.asset_id
where cv.status = 'published'
  and cv.deprecated_at is null
  and a.asset_visibility = 'public_catalogue'
  and a.publicly_servable
  and a.permission_status = 'approved'
  and a.rights_status = 'approved'
  and a.retention_status = 'active'
  and a.deleted_at is null
  and a.storage_provider <> 'unavailable';

grant select on catalog.catalogue_versions, catalog.catalogue_version_sets, catalog.catalogue_version_printings,
  catalog.catalogue_version_variants, catalog.catalogue_version_assets,
  catalog.catalogue_version_external_identifiers to anon, authenticated, service_role;
grant select, insert, update, delete on catalog.catalogue_version_sets, catalog.catalogue_version_printings,
  catalog.catalogue_version_variants, catalog.catalogue_version_assets,
  catalog.catalogue_version_external_identifiers to service_role;
grant select on api.published_catalogue_versions, api.catalogue_languages, api.catalogue_series,
  api.catalogue_cards, api.catalogue_sets, api.catalogue_card_names, api.catalogue_external_identifiers,
  api.catalogue_delta_changes, api.asset_manifest to anon, authenticated, service_role;

comment on table catalog.catalogue_version_sets is
  'Published set membership per language catalogue version. App views read this snapshot, not unfinished ingest rows.';

comment on table catalog.catalogue_version_variants is
  'Published variant membership per language catalogue version. Importer writes are invisible until a version is published.';

comment on table catalog.catalogue_version_external_identifiers is
  'Published provider identifiers copied from ingest at activation time so app search never reads unfinished ingest records.';

comment on view api.catalogue_cards is
  'Public card catalogue projection filtered to currently published language snapshots only.';

comment on view api.catalogue_sets is
  'Public set catalogue projection filtered to currently published language snapshots only.';
