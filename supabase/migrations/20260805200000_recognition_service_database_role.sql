-- Least-privilege database role used by the server-side recognition service.
-- Login remains disabled until each environment provisions its own password.
do $$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'stackr_recognition'
  ) then
    create role stackr_recognition
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication;
  end if;
end
$$;

alter role stackr_recognition nologin;
alter role stackr_recognition set statement_timeout = '10s';
alter role stackr_recognition set idle_in_transaction_session_timeout = '10s';
alter role stackr_recognition set search_path = public, ml, api, audit, catalog;

grant connect on database postgres to stackr_recognition;
grant usage on schema ml, api, audit, catalog to stackr_recognition;

grant select on table
  ml.embedding_models,
  ml.embedding_index_versions,
  api.catalogue_cards
to stackr_recognition;

-- api.catalogue_cards is a security-invoker view, so the role also needs
-- explicit access to its published-catalogue dependencies.
grant select on table
  catalog.catalogue_version_variants,
  catalog.catalogue_versions,
  catalog.card_variants,
  catalog.card_printings,
  catalog.sets,
  catalog.languages,
  catalog.rarities,
  catalog.variant_taxonomy,
  catalog.finishes
to stackr_recognition;

grant select, insert, update on table
  ml.recognition_scan_diagnostics
to stackr_recognition;

grant insert on table
  audit.catalogue_events
to stackr_recognition;

drop policy if exists "recognition service reads embedding models"
  on ml.embedding_models;
create policy "recognition service reads embedding models"
  on ml.embedding_models
  for select
  to stackr_recognition
  using (true);

drop policy if exists "recognition service reads embedding indexes"
  on ml.embedding_index_versions;
create policy "recognition service reads embedding indexes"
  on ml.embedding_index_versions
  for select
  to stackr_recognition
  using (true);

drop policy if exists "recognition service reads published version variants"
  on catalog.catalogue_version_variants;
create policy "recognition service reads published version variants"
  on catalog.catalogue_version_variants
  for select
  to stackr_recognition
  using (
    exists (
      select 1
      from catalog.catalogue_versions cv
      where cv.id = catalogue_version_variants.catalogue_version_id
        and cv.status = 'published'
        and cv.deprecated_at is null
    )
  );

drop policy if exists "recognition service reads published versions"
  on catalog.catalogue_versions;
create policy "recognition service reads published versions"
  on catalog.catalogue_versions
  for select
  to stackr_recognition
  using (status = 'published' and deprecated_at is null);

drop policy if exists "recognition service reads published variants"
  on catalog.card_variants;
create policy "recognition service reads published variants"
  on catalog.card_variants
  for select
  to stackr_recognition
  using (deprecated_at is null);

drop policy if exists "recognition service reads published printings"
  on catalog.card_printings;
create policy "recognition service reads published printings"
  on catalog.card_printings
  for select
  to stackr_recognition
  using (deprecated_at is null);

drop policy if exists "recognition service reads published sets"
  on catalog.sets;
create policy "recognition service reads published sets"
  on catalog.sets
  for select
  to stackr_recognition
  using (deprecated_at is null);

drop policy if exists "recognition service reads active languages"
  on catalog.languages;
create policy "recognition service reads active languages"
  on catalog.languages
  for select
  to stackr_recognition
  using (active and deprecated_at is null);

drop policy if exists "recognition service reads active rarities"
  on catalog.rarities;
create policy "recognition service reads active rarities"
  on catalog.rarities
  for select
  to stackr_recognition
  using (deprecated_at is null);

drop policy if exists "recognition service reads active variant taxonomy"
  on catalog.variant_taxonomy;
create policy "recognition service reads active variant taxonomy"
  on catalog.variant_taxonomy
  for select
  to stackr_recognition
  using (active and deprecated_at is null);

drop policy if exists "recognition service reads active finishes"
  on catalog.finishes;
create policy "recognition service reads active finishes"
  on catalog.finishes
  for select
  to stackr_recognition
  using (deprecated_at is null);

drop policy if exists "recognition service reads diagnostics"
  on ml.recognition_scan_diagnostics;
create policy "recognition service reads diagnostics"
  on ml.recognition_scan_diagnostics
  for select
  to stackr_recognition
  using (true);

drop policy if exists "recognition service writes diagnostics"
  on ml.recognition_scan_diagnostics;
create policy "recognition service writes diagnostics"
  on ml.recognition_scan_diagnostics
  for insert
  to stackr_recognition
  with check (true);

drop policy if exists "recognition service updates diagnostics"
  on ml.recognition_scan_diagnostics;
create policy "recognition service updates diagnostics"
  on ml.recognition_scan_diagnostics
  for update
  to stackr_recognition
  using (true)
  with check (true);

drop policy if exists "recognition service writes feedback events"
  on audit.catalogue_events;
create policy "recognition service writes feedback events"
  on audit.catalogue_events
  for insert
  to stackr_recognition
  with check (true);
