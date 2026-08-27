-- Emergency containment for shared pricing data and the client-authored coin path.
--
-- Client roles retain their existing read paths. All writes to the listed tables
-- must go through a trusted backend/service-role path until validated RPCs replace
-- the legacy direct client mutations.

do $$
declare
  relation_name text;
  policy_record record;
  client_write_tables text[] := array[
    'market_products',
    'market_product_price_snapshots',
    'market_price_snapshots',
    'user_achievements',
    'user_achievement_events',
    'user_coin_ledger'
  ];
  public_read_tables text[] := array[
    'market_products',
    'market_product_price_snapshots',
    'market_price_snapshots'
  ];
begin
  foreach relation_name in array client_write_tables loop
    if to_regclass(format('public.%I', relation_name)) is null then
      continue;
    end if;

    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      relation_name
    );

    if relation_name = any(public_read_tables) then
      execute format(
        'grant select on table public.%I to anon, authenticated',
        relation_name
      );
    else
      execute format(
        'grant select on table public.%I to authenticated',
        relation_name
      );
    end if;

    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      relation_name
    );
  end loop;

  -- Remove the explicit client write policies. SELECT and ALL policies are left
  -- untouched so this migration cannot silently narrow an existing read path;
  -- table privileges above remain the hard write boundary.
  for policy_record in
    select policyname, tablename
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(client_write_tables)
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and roles && array['public', 'anon', 'authenticated']::name[]
  loop
    execute format(
      'drop policy %I on public.%I',
      policy_record.policyname,
      policy_record.tablename
    );
  end loop;
end
$$;

revoke all on function public.get_active_scanner_threshold_set() from public, anon;
grant execute on function public.get_active_scanner_threshold_set() to authenticated, service_role;
alter function public.get_active_scanner_threshold_set()
  set search_path = pg_catalog, public, pg_temp;

-- Preserve the existing purchase contract while serializing each user's balance
-- check and debit inside the RPC transaction.
create or replace function public.purchase_cosmetic(p_cosmetic_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  item record;
  current_balance integer;
begin
  if current_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'You need to be logged in.');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select *
    into item
  from public.cosmetic_catalog
  where cosmetic_id = p_cosmetic_id
    and active = true;

  if item.cosmetic_id is null then
    return jsonb_build_object('ok', false, 'message', 'This cosmetic is not available.');
  end if;

  if exists (
    select 1
    from public.user_cosmetics
    where user_id = current_user_id
      and cosmetic_id = p_cosmetic_id
  ) then
    return jsonb_build_object('ok', true, 'message', 'Already unlocked.');
  end if;

  select coalesce(sum(amount), 0)
    into current_balance
  from public.user_coin_ledger
  where user_id = current_user_id;

  if current_balance < item.price then
    return jsonb_build_object(
      'ok', false,
      'message', 'You need ' || (item.price - current_balance)::text || ' more coins.'
    );
  end if;

  insert into public.user_cosmetics (
    user_id,
    cosmetic_id,
    source,
    metadata
  )
  values (
    current_user_id,
    p_cosmetic_id,
    'coins',
    jsonb_build_object(
      'name', item.name,
      'type', item.cosmetic_type,
      'price', item.price
    ) || coalesce(item.metadata, '{}'::jsonb)
  );

  insert into public.user_coin_ledger (
    user_id,
    amount,
    reason,
    cosmetic_id,
    metadata
  )
  values (
    current_user_id,
    -item.price,
    'cosmetic_purchase',
    p_cosmetic_id,
    jsonb_build_object(
      'name', item.name,
      'type', item.cosmetic_type
    ) || coalesce(item.metadata, '{}'::jsonb)
  );

  return jsonb_build_object('ok', true, 'message', item.name || ' unlocked.');
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'message', 'Already unlocked.');
end;
$$;

revoke all on function public.purchase_cosmetic(text) from public, anon;
grant execute on function public.purchase_cosmetic(text) to authenticated, service_role;
