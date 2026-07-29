-- Harden the four legacy public catalogue views reported by the Supabase
-- security advisor. The conditional block keeps this migration compatible
-- with isolated canonical-catalogue databases that do not contain the legacy
-- public tables.
do $legacy_view_security$
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
      execute format(
        'alter view public.%I set (security_invoker = true)',
        view_name
      );
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

  -- tcg_set_cover_images selects all columns from its lateral card_images
  -- subquery. Only resolved catalogue image rows are visible to public roles.
  if pg_catalog.to_regclass('public.card_images') is not null then
    execute 'alter table public.card_images enable row level security';
    execute 'drop policy if exists "resolved catalogue images public read" on public.card_images';
    execute $policy$
      create policy "resolved catalogue images public read"
      on public.card_images
      for select
      to anon, authenticated
      using (
        resolution_status in ('resolved', 'resolved_secondary')
        and resolved_image_url is not null
      )
    $policy$;
    execute 'revoke all privileges on table public.card_images from anon, authenticated';
    execute 'grant select on table public.card_images to anon, authenticated';
  end if;

  if pg_catalog.to_regclass('public.card_image_checks') is not null then
    execute 'alter table public.card_image_checks enable row level security';
    execute 'drop policy if exists "catalogue image check summary public read" on public.card_image_checks';
    execute $policy$
      create policy "catalogue image check summary public read"
      on public.card_image_checks
      for select
      to anon, authenticated
      using (true)
    $policy$;
    execute 'revoke all privileges on table public.card_image_checks from anon, authenticated';
    execute 'grant select (card_id, resolution_status) on table public.card_image_checks to anon, authenticated';
  end if;

  if pg_catalog.to_regclass('public.card_prices') is not null then
    execute 'alter table public.card_prices enable row level security';
    execute 'drop policy if exists "published catalogue prices public read" on public.card_prices';
    execute $policy$
      create policy "published catalogue prices public read"
      on public.card_prices
      for select
      to anon, authenticated
      using (pricing_status = 'priced')
    $policy$;
    execute 'revoke all privileges on table public.card_prices from anon, authenticated';
    execute $grant$
      grant select (
        entity_id,
        entity_type,
        language,
        region,
        condition,
        grader,
        grade,
        currency,
        price_type,
        low,
        market,
        average,
        high,
        last_sold,
        sales_count,
        display_price,
        display_currency,
        provider,
        provider_record_id,
        provider_updated_at,
        retrieved_at,
        confidence,
        pricing_status,
        created_at,
        updated_at
      ) on table public.card_prices to anon, authenticated
    $grant$;
  end if;

  if pg_catalog.to_regclass('public.card_price_checks') is not null then
    execute 'alter table public.card_price_checks enable row level security';
    execute 'drop policy if exists "catalogue price check summary public read" on public.card_price_checks';
    execute $policy$
      create policy "catalogue price check summary public read"
      on public.card_price_checks
      for select
      to anon, authenticated
      using (true)
    $policy$;
    execute 'revoke all privileges on table public.card_price_checks from anon, authenticated';
    execute $grant$
      grant select (
        entity_id,
        entity_type,
        language,
        region,
        provider,
        provider_record_id,
        pricing_status,
        last_checked_at,
        next_check_at,
        failure_reason
      ) on table public.card_price_checks to anon, authenticated
    $grant$;
  end if;

  if pg_catalog.to_regclass('public.catalogue_sync_runs') is not null then
    execute 'alter table public.catalogue_sync_runs enable row level security';
    execute 'drop policy if exists "catalogue sync summary public read" on public.catalogue_sync_runs';
    execute $policy$
      create policy "catalogue sync summary public read"
      on public.catalogue_sync_runs
      for select
      to anon, authenticated
      using (language is not null)
    $policy$;
    execute 'revoke all privileges on table public.catalogue_sync_runs from anon, authenticated';
    execute $grant$
      grant select (
        language,
        status,
        job_name,
        finished_at
      ) on table public.catalogue_sync_runs to anon, authenticated
    $grant$;
  end if;
end
$legacy_view_security$;

create table if not exists audit.catalogue_release_events (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('activate', 'rollback')),
  request_id text not null,
  actor_role text not null default current_user,
  previous_version_id uuid references catalog.catalogue_versions(id) on delete restrict,
  target_version_id uuid not null references catalog.catalogue_versions(id) on delete restrict,
  reason text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (action, request_id),
  check (btrim(request_id) <> ''),
  check (btrim(reason) <> '')
);

alter table audit.catalogue_release_events enable row level security;

drop policy if exists "release events service role read" on audit.catalogue_release_events;
create policy "release events service role read"
  on audit.catalogue_release_events
  for select
  to service_role
  using (true);

drop policy if exists "release events service role insert" on audit.catalogue_release_events;
create policy "release events service role insert"
  on audit.catalogue_release_events
  for insert
  to service_role
  with check (true);

revoke all on table audit.catalogue_release_events from public, anon, authenticated;
grant select, insert on table audit.catalogue_release_events to service_role;

-- PostgreSQL enforces the invariant even when a caller bypasses the release
-- functions. Creating this index intentionally fails if an environment
-- already contains multiple active published versions.
create unique index if not exists catalogue_versions_single_active_idx
  on catalog.catalogue_versions ((true))
  where status = 'published' and deprecated_at is null;

create or replace function catalog.catalogue_activation_readiness(
  p_version_key text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  candidate catalog.catalogue_versions%rowtype;
  active_version catalog.catalogue_versions%rowtype;
  blockers text[] := array[]::text[];
  expected_min_sequence bigint;
  latest_mobile_sequence bigint;
  mobile_change_count bigint := 0;
  unassigned_change_count bigint := 0;
  foreign_assignment_count bigint := 0;
  outside_assignment_count bigint := 0;
begin
  select *
  into candidate
  from catalog.catalogue_versions
  where version_key = btrim(p_version_key)
  limit 1;

  if candidate.id is null then
    return pg_catalog.jsonb_build_object(
      'ready', false,
      'versionKey', p_version_key,
      'blockers', pg_catalog.to_jsonb(array['version_not_found']::text[])
    );
  end if;

  select *
  into active_version
  from catalog.catalogue_versions
  where status = 'published'
    and deprecated_at is null
  order by published_at desc nulls last, created_at desc
  limit 1;

  if candidate.status = 'published' and candidate.deprecated_at is null then
    return pg_catalog.jsonb_build_object(
      'ready', true,
      'alreadyActive', true,
      'versionId', candidate.id,
      'versionKey', candidate.version_key,
      'activeVersionKey', candidate.version_key,
      'minChangeSequence', candidate.min_change_sequence,
      'maxChangeSequence', candidate.max_change_sequence,
      'blockers', '[]'::jsonb
    );
  end if;

  if candidate.status <> 'draft' then
    blockers := pg_catalog.array_append(blockers, 'candidate_status_must_be_draft');
  end if;

  if candidate.min_change_sequence is null or candidate.max_change_sequence is null then
    blockers := pg_catalog.array_append(blockers, 'candidate_sequence_range_required');
  elsif candidate.min_change_sequence > candidate.max_change_sequence then
    blockers := pg_catalog.array_append(blockers, 'candidate_sequence_range_invalid');
  end if;

  if active_version.id is not null and active_version.max_change_sequence is null then
    blockers := pg_catalog.array_append(blockers, 'active_version_max_sequence_required');
  end if;

  select min(change_sequence), max(change_sequence)
  into expected_min_sequence, latest_mobile_sequence
  from catalog.catalogue_change_log
  where mobile_syncable
    and (
      active_version.id is null
      or change_sequence > active_version.max_change_sequence
    );

  if expected_min_sequence is null then
    blockers := pg_catalog.array_append(blockers, 'no_pending_mobile_changes');
  elsif candidate.min_change_sequence is distinct from expected_min_sequence then
    blockers := pg_catalog.array_append(blockers, 'candidate_does_not_start_at_next_mobile_change');
  end if;

  if candidate.max_change_sequence is not null
     and latest_mobile_sequence is not null
     and candidate.max_change_sequence > latest_mobile_sequence then
    blockers := pg_catalog.array_append(blockers, 'candidate_exceeds_latest_mobile_change');
  end if;

  if candidate.min_change_sequence is not null and candidate.max_change_sequence is not null then
    select
      count(*) filter (where mobile_syncable),
      count(*) filter (where mobile_syncable and catalogue_version_id is null),
      count(*) filter (
        where mobile_syncable
          and catalogue_version_id is not null
          and catalogue_version_id <> candidate.id
      )
    into mobile_change_count, unassigned_change_count, foreign_assignment_count
    from catalog.catalogue_change_log
    where change_sequence between candidate.min_change_sequence and candidate.max_change_sequence;

    select count(*)
    into outside_assignment_count
    from catalog.catalogue_change_log
    where catalogue_version_id = candidate.id
      and mobile_syncable
      and change_sequence not between candidate.min_change_sequence and candidate.max_change_sequence;

    if mobile_change_count = 0 then
      blockers := pg_catalog.array_append(blockers, 'candidate_contains_no_mobile_changes');
    end if;
    if foreign_assignment_count > 0 then
      blockers := pg_catalog.array_append(blockers, 'candidate_range_assigned_to_another_version');
    end if;
    if outside_assignment_count > 0 then
      blockers := pg_catalog.array_append(blockers, 'candidate_has_changes_outside_declared_range');
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'ready', pg_catalog.cardinality(blockers) = 0,
    'alreadyActive', false,
    'versionId', candidate.id,
    'versionKey', candidate.version_key,
    'candidateStatus', candidate.status,
    'activeVersionKey', active_version.version_key,
    'minChangeSequence', candidate.min_change_sequence,
    'maxChangeSequence', candidate.max_change_sequence,
    'expectedMinChangeSequence', expected_min_sequence,
    'latestMobileChangeSequence', latest_mobile_sequence,
    'mobileChangeCount', mobile_change_count,
    'unassignedChangeCount', unassigned_change_count,
    'foreignAssignmentCount', foreign_assignment_count,
    'outsideAssignmentCount', outside_assignment_count,
    'blockers', pg_catalog.to_jsonb(blockers)
  );
end
$function$;

create or replace function catalog.activate_catalogue_version(
  p_version_key text,
  p_request_id text,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  candidate catalog.catalogue_versions%rowtype;
  active_version catalog.catalogue_versions%rowtype;
  readiness jsonb;
  now_at timestamptz := pg_catalog.clock_timestamp();
begin
  if nullif(btrim(p_request_id), '') is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'activation reason is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stackr:catalogue-activation', 0)
  );
  lock table catalog.catalogue_versions in share row exclusive mode;
  lock table catalog.catalogue_change_log in share row exclusive mode;

  select *
  into candidate
  from catalog.catalogue_versions
  where version_key = btrim(p_version_key)
  for update;

  if candidate.id is null then
    raise exception 'catalogue version % was not found', p_version_key
      using errcode = 'P0002';
  end if;

  if candidate.status = 'published' and candidate.deprecated_at is null then
    return candidate.id;
  end if;

  readiness := catalog.catalogue_activation_readiness(candidate.version_key);
  if coalesce((readiness ->> 'ready')::boolean, false) is not true then
    raise exception 'catalogue version % is not ready: %',
      candidate.version_key,
      readiness -> 'blockers'
      using errcode = '23514';
  end if;

  select *
  into active_version
  from catalog.catalogue_versions
  where status = 'published'
    and deprecated_at is null
  order by published_at desc nulls last, created_at desc
  limit 1
  for update;

  update catalog.catalogue_change_log
  set
    catalogue_version_id = candidate.id,
    updated_at = now_at
  where mobile_syncable
    and catalogue_version_id is null
    and change_sequence between candidate.min_change_sequence and candidate.max_change_sequence;

  if active_version.id is not null then
    update catalog.catalogue_versions
    set
      status = 'deprecated',
      superseded_by_version_id = candidate.id,
      deprecated_at = now_at,
      deprecated_reason = 'Superseded by ' || candidate.version_key,
      updated_at = now_at
    where id = active_version.id;
  end if;

  update catalog.catalogue_versions
  set
    status = 'published',
    published_at = now_at,
    superseded_by_version_id = null,
    deprecated_at = null,
    deprecated_reason = null,
    updated_at = now_at
  where id = candidate.id;

  insert into audit.catalogue_release_events (
    action,
    request_id,
    previous_version_id,
    target_version_id,
    reason,
    event_payload
  ) values (
    'activate',
    btrim(p_request_id),
    active_version.id,
    candidate.id,
    btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'versionKey', candidate.version_key,
      'previousVersionKey', active_version.version_key,
      'minChangeSequence', candidate.min_change_sequence,
      'maxChangeSequence', candidate.max_change_sequence,
      'readiness', readiness
    )
  );

  return candidate.id;
end
$function$;

-- Rollback is deliberately forward-only for mobile delta sync. The caller
-- must first write compensating catalogue changes and prepare a new draft
-- version that starts after the failed version's maximum sequence.
create or replace function catalog.rollback_catalogue_version(
  p_failed_version_key text,
  p_rollback_version_key text,
  p_request_id text,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  failed_version catalog.catalogue_versions%rowtype;
  rollback_version catalog.catalogue_versions%rowtype;
  active_version catalog.catalogue_versions%rowtype;
  activated_version_id uuid;
begin
  if nullif(btrim(p_request_id), '') is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'rollback reason is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stackr:catalogue-activation', 0)
  );

  select *
  into failed_version
  from catalog.catalogue_versions
  where version_key = btrim(p_failed_version_key)
  for update;

  select *
  into rollback_version
  from catalog.catalogue_versions
  where version_key = btrim(p_rollback_version_key)
  for update;

  if failed_version.id is null or rollback_version.id is null then
    raise exception 'failed and rollback catalogue versions must both exist'
      using errcode = 'P0002';
  end if;

  select *
  into active_version
  from catalog.catalogue_versions
  where status = 'published'
    and deprecated_at is null
  order by published_at desc nulls last, created_at desc
  limit 1
  for update;

  if active_version.id = rollback_version.id and failed_version.status = 'rolled_back' then
    return rollback_version.id;
  end if;

  if active_version.id is distinct from failed_version.id then
    raise exception 'failed version % is not the active catalogue version', p_failed_version_key
      using errcode = '23514';
  end if;

  if rollback_version.status <> 'draft' then
    raise exception 'rollback version % must be draft', p_rollback_version_key
      using errcode = '23514';
  end if;

  if rollback_version.min_change_sequence is null
     or failed_version.max_change_sequence is null
     or rollback_version.min_change_sequence <= failed_version.max_change_sequence then
    raise exception 'rollback must use forward-only compensating change sequences'
      using errcode = '23514';
  end if;

  activated_version_id := catalog.activate_catalogue_version(
    rollback_version.version_key,
    p_request_id,
    'Rollback of ' || failed_version.version_key || ': ' || btrim(p_reason)
  );

  update catalog.catalogue_versions
  set
    status = 'rolled_back',
    deprecated_reason = 'Rolled back by ' || rollback_version.version_key || ': ' || btrim(p_reason),
    updated_at = pg_catalog.clock_timestamp()
  where id = failed_version.id;

  insert into audit.catalogue_release_events (
    action,
    request_id,
    previous_version_id,
    target_version_id,
    reason,
    event_payload
  ) values (
    'rollback',
    btrim(p_request_id),
    failed_version.id,
    rollback_version.id,
    btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'failedVersionKey', failed_version.version_key,
      'rollbackVersionKey', rollback_version.version_key,
      'failedMaxChangeSequence', failed_version.max_change_sequence,
      'rollbackMinChangeSequence', rollback_version.min_change_sequence,
      'rollbackMaxChangeSequence', rollback_version.max_change_sequence
    )
  );

  return activated_version_id;
end
$function$;

revoke all on function catalog.catalogue_activation_readiness(text) from public, anon, authenticated;
revoke all on function catalog.activate_catalogue_version(text, text, text) from public, anon, authenticated;
revoke all on function catalog.rollback_catalogue_version(text, text, text, text) from public, anon, authenticated;

grant execute on function catalog.catalogue_activation_readiness(text) to service_role;
grant execute on function catalog.activate_catalogue_version(text, text, text) to service_role;
grant execute on function catalog.rollback_catalogue_version(text, text, text, text) to service_role;

comment on table audit.catalogue_release_events is
  'Private immutable audit trail for catalogue activation and forward-only rollback events.';

comment on function catalog.catalogue_activation_readiness(text) is
  'Read-only readiness report for one draft catalogue version. Service role only.';

comment on function catalog.activate_catalogue_version(text, text, text) is
  'Atomically assigns the declared mobile delta range and activates one draft catalogue version.';

comment on function catalog.rollback_catalogue_version(text, text, text, text) is
  'Activates a new forward-only compensating version and marks the failed version rolled back.';
