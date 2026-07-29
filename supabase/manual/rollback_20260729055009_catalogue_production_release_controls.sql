-- Emergency rollback for 20260729055009_catalogue_production_release_controls.
--
-- This removes the activation entry points and restores the four legacy views
-- to their previous owner-rights behaviour. It intentionally does not restore
-- accidental INSERT/UPDATE/DELETE grants to public roles. Run only after the
-- release owner has confirmed that reverting the view hardening is necessary.

revoke all on function catalog.catalogue_activation_readiness(text) from public, anon, authenticated, service_role;
revoke all on function catalog.activate_catalogue_version(text, text, text) from public, anon, authenticated, service_role;
revoke all on function catalog.rollback_catalogue_version(text, text, text, text) from public, anon, authenticated, service_role;

drop function if exists catalog.rollback_catalogue_version(text, text, text, text);
drop function if exists catalog.activate_catalogue_version(text, text, text);
drop function if exists catalog.catalogue_activation_readiness(text);

drop index if exists catalog.catalogue_versions_single_active_idx;

do $legacy_view_security_rollback$
declare
  view_name text;
begin
  foreach view_name in array array[
    'catalogue_health',
    'japanese_catalogue_health',
    'tcg_card_printings',
    'tcg_set_cover_images'
  ]
  loop
    if exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = view_name
        and c.relkind = 'v'
    ) then
      execute format('alter view public.%I reset (security_invoker)', view_name);
      execute format(
        'revoke all privileges on table public.%I from anon, authenticated',
        view_name
      );
      execute format(
        'grant select on table public.%I to anon, authenticated, service_role',
        view_name
      );
    end if;
  end loop;

  if pg_catalog.to_regclass('public.card_images') is not null then
    execute 'drop policy if exists "resolved catalogue images public read" on public.card_images';
  end if;
  if pg_catalog.to_regclass('public.card_image_checks') is not null then
    execute 'drop policy if exists "catalogue image check summary public read" on public.card_image_checks';
  end if;
  if pg_catalog.to_regclass('public.card_prices') is not null then
    execute 'drop policy if exists "published catalogue prices public read" on public.card_prices';
  end if;
  if pg_catalog.to_regclass('public.card_price_checks') is not null then
    execute 'drop policy if exists "catalogue price check summary public read" on public.card_price_checks';
  end if;
  if pg_catalog.to_regclass('public.catalogue_sync_runs') is not null then
    execute 'drop policy if exists "catalogue sync summary public read" on public.catalogue_sync_runs';
  end if;
end
$legacy_view_security_rollback$;

-- Audit evidence is immutable. Drop the table only when it has never recorded
-- an activation or rollback; otherwise retain it for incident review.
do $release_event_rollback$
begin
  if pg_catalog.to_regclass('audit.catalogue_release_events') is null then
    return;
  end if;

  if exists (select 1 from audit.catalogue_release_events limit 1) then
    comment on table audit.catalogue_release_events is
      'Retained audit evidence after rollback of catalogue release-control functions.';
  else
    drop table audit.catalogue_release_events;
  end if;
end
$release_event_rollback$;
