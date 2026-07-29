-- Final compatibility guard for databases that received legacy Stackr schema
-- changes outside Supabase's migration ledger. The historical migrations now
-- include the same repairs; this guard covers environments where those older
-- versions were already marked applied.
do $preflight$
declare
  binder_id_type text;
  movement_binder_id_type text;
  inventory_created boolean := false;
  added_price_alert_columns text[] := array[]::text[];
  column_name text;
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
      comment on column public.inventory_movements.binder_id is
        'Created by 20260729064011 legacy production migration preflight.';
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
        'Created by 20260729064011 legacy production migration preflight.'
      );
    end loop;
  end if;
end
$preflight$;
