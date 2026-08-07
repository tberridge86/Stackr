-- Expand-first containment for findings from the 2026-07-28 release audit.
-- This creates the public-safe profile replacement before the mobile cutover,
-- while immediately containing market-row and scan-storage exposure.

-- Compatibility guard for databases that received legacy schema changes
-- outside Supabase's migration ledger. Historical migrations contain the same
-- repairs; this block covers environments where those versions were marked
-- applied before the repairs were committed.
do $legacy_preflight$
declare
  binder_id_type text;
  movement_binder_id_type text;
  inventory_created boolean := false;
  added_price_alert_columns text[] := array[]::text[];
  column_name text;
  marker text := 'Created by 20260729055239 critical security containment.';
begin
  if pg_catalog.to_regclass('public.binders') is not null then
    select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into binder_id_type
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.binders'::regclass
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;

    if binder_id_type is distinct from 'uuid' then
      raise exception 'Expected public.binders.id to be uuid, found %', binder_id_type
        using errcode = '42804';
    end if;

    if pg_catalog.to_regclass('public.inventory_movements') is null then
      create table public.inventory_movements (
        id text primary key,
        user_id uuid not null references auth.users(id) on delete cascade,
        action_type text not null check (action_type in ('scan_in', 'scan_out')),
        card_id text,
        product_id text,
        set_id text,
        card_name text,
        product_name text,
        quantity integer not null default 1 check (quantity > 0),
        reason text not null,
        binder_id uuid references public.binders(id) on delete set null,
        binder_name text,
        collection_id text,
        value_at_time numeric,
        image_small text,
        created_at timestamptz not null default now()
      );
      inventory_created := true;
    end if;

    select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into movement_binder_id_type
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.inventory_movements'::regclass
      and a.attname = 'binder_id'
      and a.attnum > 0
      and not a.attisdropped;

    if movement_binder_id_type is distinct from binder_id_type then
      raise exception 'inventory_movements.binder_id (%) must match binders.id (%)',
        movement_binder_id_type,
        binder_id_type
        using errcode = '42804';
    end if;

    create index if not exists inventory_movements_user_created_idx
      on public.inventory_movements(user_id, created_at desc);
    create index if not exists inventory_movements_user_card_idx
      on public.inventory_movements(user_id, card_id);

    alter table public.inventory_movements enable row level security;
    drop policy if exists "Inventory movements are private" on public.inventory_movements;
    create policy "Inventory movements are private"
      on public.inventory_movements
      for all
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);

    grant select, insert, update, delete
      on table public.inventory_movements
      to authenticated, service_role;

    if inventory_created then
      execute pg_catalog.format(
        'comment on column public.inventory_movements.binder_id is %L',
        marker
      );
    end if;
  end if;

  if pg_catalog.to_regclass('public.price_alerts') is not null then
    foreach column_name in array array[
      'stackr_card_id',
      'product_key',
      'language',
      'raw_or_graded',
      'grader',
      'grade',
      'target_price_gbp',
      'active',
      'updated_at'
    ]
    loop
      if not exists (
        select 1
        from pg_catalog.pg_attribute a
        where a.attrelid = 'public.price_alerts'::regclass
          and a.attname = column_name
          and a.attnum > 0
          and not a.attisdropped
      ) then
        added_price_alert_columns := pg_catalog.array_append(
          added_price_alert_columns,
          column_name
        );
      end if;
    end loop;

    alter table public.price_alerts
      add column if not exists stackr_card_id text references public.pokemon_cards(id) on delete cascade,
      add column if not exists product_key text,
      add column if not exists language text not null default 'en',
      add column if not exists raw_or_graded text not null default 'raw'
        check (raw_or_graded in ('raw', 'graded', 'sealed')),
      add column if not exists grader text,
      add column if not exists grade text,
      add column if not exists target_price_gbp numeric,
      add column if not exists active boolean not null default true,
      add column if not exists updated_at timestamptz not null default now();

    foreach column_name in array added_price_alert_columns
    loop
      execute pg_catalog.format(
        'comment on column public.price_alerts.%I is %L',
        column_name,
        marker
      );
    end loop;
  end if;
end
$legacy_preflight$;

-- Harden the four legacy public catalogue views reported by the Supabase
-- security advisor. Underlying tables expose only the fields needed by those
-- public views, with RLS still deciding which rows are visible.
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
      execute pg_catalog.format(
        'alter view public.%I set (security_invoker = true)',
        view_name
      );
      execute pg_catalog.format(
        'revoke all privileges on table public.%I from anon, authenticated',
        view_name
      );
      execute pg_catalog.format(
        'grant select on table public.%I to anon, authenticated, service_role',
        view_name
      );
    end if;
  end loop;

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

create table if not exists public.profile_public_directory (
  id uuid primary key references public.profiles(id) on delete cascade,
  collector_name text,
  avatar_url text,
  avatar_preset text,
  banner_url text,
  pokemon_type text,
  background_key text,
  profile_banner_cosmetic_id text,
  profile_border_cosmetic_id text,
  favorite_card_id text,
  favorite_set_id text,
  chase_card_id text,
  chase_set_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_public_directory_collector_name_idx
  on public.profile_public_directory (lower(collector_name), id);

create or replace function public.sync_profile_public_directory()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.profile_public_directory where id = old.id;
    return old;
  end if;

  insert into public.profile_public_directory (
    id,
    collector_name,
    avatar_url,
    avatar_preset,
    banner_url,
    pokemon_type,
    background_key,
    profile_banner_cosmetic_id,
    profile_border_cosmetic_id,
    favorite_card_id,
    favorite_set_id,
    chase_card_id,
    chase_set_id,
    created_at,
    updated_at
  ) values (
    new.id,
    new.collector_name,
    new.avatar_url,
    new.avatar_preset,
    new.banner_url,
    new.pokemon_type,
    new.background_key,
    new.profile_banner_cosmetic_id,
    new.profile_border_cosmetic_id,
    new.favorite_card_id,
    new.favorite_set_id,
    new.chase_card_id,
    new.chase_set_id,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    collector_name = excluded.collector_name,
    avatar_url = excluded.avatar_url,
    avatar_preset = excluded.avatar_preset,
    banner_url = excluded.banner_url,
    pokemon_type = excluded.pokemon_type,
    background_key = excluded.background_key,
    profile_banner_cosmetic_id = excluded.profile_banner_cosmetic_id,
    profile_border_cosmetic_id = excluded.profile_border_cosmetic_id,
    favorite_card_id = excluded.favorite_card_id,
    favorite_set_id = excluded.favorite_set_id,
    chase_card_id = excluded.chase_card_id,
    chase_set_id = excluded.chase_set_id,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_profile_public_directory() from public, anon, authenticated;

drop trigger if exists sync_profile_public_directory_after_write on public.profiles;
create trigger sync_profile_public_directory_after_write
after insert or update or delete on public.profiles
for each row execute function public.sync_profile_public_directory();

insert into public.profile_public_directory (
  id,
  collector_name,
  avatar_url,
  avatar_preset,
  banner_url,
  pokemon_type,
  background_key,
  profile_banner_cosmetic_id,
  profile_border_cosmetic_id,
  favorite_card_id,
  favorite_set_id,
  chase_card_id,
  chase_set_id,
  created_at,
  updated_at
)
select
  id,
  collector_name,
  avatar_url,
  avatar_preset,
  banner_url,
  pokemon_type,
  background_key,
  profile_banner_cosmetic_id,
  profile_border_cosmetic_id,
  favorite_card_id,
  favorite_set_id,
  chase_card_id,
  chase_set_id,
  coalesce(created_at, now()),
  now()
from public.profiles
on conflict (id) do update set
  collector_name = excluded.collector_name,
  avatar_url = excluded.avatar_url,
  avatar_preset = excluded.avatar_preset,
  banner_url = excluded.banner_url,
  pokemon_type = excluded.pokemon_type,
  background_key = excluded.background_key,
  profile_banner_cosmetic_id = excluded.profile_banner_cosmetic_id,
  profile_border_cosmetic_id = excluded.profile_border_cosmetic_id,
  favorite_card_id = excluded.favorite_card_id,
  favorite_set_id = excluded.favorite_set_id,
  chase_card_id = excluded.chase_card_id,
  chase_set_id = excluded.chase_set_id,
  updated_at = now();

alter table public.profile_public_directory enable row level security;

drop policy if exists "Public profile directory is readable" on public.profile_public_directory;
create policy "Public profile directory is readable"
  on public.profile_public_directory
  for select
  to anon, authenticated
  using (true);

revoke all on table public.profile_public_directory from public, anon, authenticated;
grant select on table public.profile_public_directory to anon, authenticated;
grant select, insert, update, delete on table public.profile_public_directory to service_role;

drop policy if exists "Allow authenticated users to read market snapshots"
  on public.market_price_snapshots;
drop policy if exists "Market price snapshots are readable"
  on public.market_price_snapshots;
create policy "Public or owner market snapshots are readable"
  on public.market_price_snapshots
  for select
  to anon, authenticated
  using (user_id is null or (select auth.uid()) = user_id);

update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'card-scans';

drop policy if exists "Allow authenticated uploads to card scans" on storage.objects;
drop policy if exists "Allow public read access to card scans" on storage.objects;
drop policy if exists "Users can upload own card scans" on storage.objects;
drop policy if exists "Users can read own card scans" on storage.objects;
drop policy if exists "Users can delete own card scans" on storage.objects;

create policy "Users can upload own card scans"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'card-scans'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

create policy "Users can read own card scans"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'card-scans'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or owner_id = (select auth.uid())::text
    )
  );

create policy "Users can delete own card scans"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'card-scans'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or owner_id = (select auth.uid())::text
    )
  );

comment on table public.profile_public_directory is
  'Public-safe profile projection maintained from profiles; excludes email, push tokens, roles, and payment identifiers.';
