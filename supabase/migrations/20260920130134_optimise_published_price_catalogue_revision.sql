-- The prior revision function aggregated every row in api.catalogue_cards.
-- Production measurement on 2026-09-20 found that path took 8,136 ms against
-- the authenticator's 8-second statement budget. The equivalent published
-- version metadata lookup took 34.553 ms (85 shared blocks, no temp blocks).
--
-- Catalogue versions are uniquely published per language. Preserve the old
-- empty-language behaviour with a bounded visible-membership EXISTS check,
-- while avoiding the full card projection. This migration checks the current
-- projection once and aborts on any language-membership drift rather than
-- silently changing the revision's meaning.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  old_revision jsonb;
  candidate_revision jsonb;
begin
  select api.published_price_catalogue_revision() into old_revision;

  with visible as (
    select cv.language_code, cv.id as catalogue_version_id
    from catalog.catalogue_versions cv
    where cv.status = 'published'
      and cv.deprecated_at is null
      and cv.language_code is not null
      and exists (
        select 1
        from catalog.catalogue_version_variants cvv
        join catalog.card_variants v
          on v.id = cvv.variant_id
         and v.deprecated_at is null
         and v.language_code = cv.language_code
        join catalog.card_printings cp
          on cp.id = v.printing_id and cp.deprecated_at is null
        join catalog.sets s
          on s.id = cp.set_id and s.deprecated_at is null
        join catalog.languages l on l.code = v.language_code
        where cvv.catalogue_version_id = cv.id
      )
  )
  select coalesce(jsonb_object_agg(language_code, catalogue_version_id order by language_code), '{}'::jsonb)
    into candidate_revision
  from visible;

  if exists (
    select 1
    from catalog.catalogue_versions cv
    join catalog.catalogue_version_variants cvv on cvv.catalogue_version_id = cv.id
    join catalog.card_variants v on v.id = cvv.variant_id and v.deprecated_at is null
    join catalog.card_printings cp on cp.id = v.printing_id and cp.deprecated_at is null
    join catalog.sets s on s.id = cp.set_id and s.deprecated_at is null
    join catalog.languages l on l.code = v.language_code
    where cv.status = 'published'
      and cv.deprecated_at is null
      and cv.language_code is not null
      and v.language_code is distinct from cv.language_code
  ) then
    raise exception 'published_price_catalogue_revision_preflight_language_drift';
  end if;

  if old_revision is distinct from candidate_revision then
    raise exception 'published_price_catalogue_revision_preflight_mismatch';
  end if;
end
$preflight$;

create or replace function api.published_price_catalogue_revision() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(language_code, catalogue_version_id order by language_code), '{}'::jsonb)
  from (
    select cv.language_code, cv.id as catalogue_version_id
    from catalog.catalogue_versions cv
    where cv.status = 'published'
      and cv.deprecated_at is null
      and cv.language_code is not null
      and exists (
        select 1
        from catalog.catalogue_version_variants cvv
        join catalog.card_variants v
          on v.id = cvv.variant_id
         and v.deprecated_at is null
         and v.language_code = cv.language_code
        join catalog.card_printings cp
          on cp.id = v.printing_id and cp.deprecated_at is null
        join catalog.sets s
          on s.id = cp.set_id and s.deprecated_at is null
        join catalog.languages l on l.code = v.language_code
        where cvv.catalogue_version_id = cv.id
      )
  ) visible;
$$;

revoke all on function api.published_price_catalogue_revision() from public, anon, authenticated;
grant execute on function api.published_price_catalogue_revision() to service_role;
