create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table if not exists private.seller_inventory_batch_commits (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  committed_at timestamptz not null default now(),
  primary key (user_id, request_id),
  check (request_id ~ '^[A-Za-z0-9:_-]{16,128}$')
);

create index if not exists seller_inventory_batch_commits_committed_idx
  on private.seller_inventory_batch_commits(committed_at);

alter table private.seller_inventory_batch_commits enable row level security;

drop policy if exists "Users can read own seller batch commits"
  on private.seller_inventory_batch_commits;
create policy "Users can read own seller batch commits"
  on private.seller_inventory_batch_commits
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own seller batch commits"
  on private.seller_inventory_batch_commits;
create policy "Users can create own seller batch commits"
  on private.seller_inventory_batch_commits
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table private.seller_inventory_batch_commits from public, anon;
grant select, insert on table private.seller_inventory_batch_commits to authenticated;
grant select, insert, update, delete on table private.seller_inventory_batch_commits to service_role;

alter table public.inventory_movements
  add column if not exists inventory_item_id text null;

create index if not exists inventory_movements_user_item_idx
  on public.inventory_movements(user_id, inventory_item_id)
  where inventory_item_id is not null;

comment on column public.inventory_movements.inventory_item_id is
  'Seller inventory row changed by this movement. Kept as text after stock reaches zero.';

create or replace function private.lock_seller_inventory_statement_actor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  -- Authenticated Data API writes, including statements that match no rows,
  -- cooperate with the batch RPC before row processing begins. Privileged
  -- null-identity maintenance falls through to the row trigger, which locks
  -- each actual OLD/NEW owner before that row is changed.
  if v_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('stackr_seller_inventory_batch'),
      pg_catalog.hashtext(v_user_id::text)
    );
  end if;
  return null;
end;
$$;

create or replace function private.lock_seller_inventory_item_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_user_id uuid;
  v_new_user_id uuid;
  v_lock_user_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_user_id := old.user_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_user_id := new.user_id;
  end if;

  -- UPDATE can move a row between owners when invoked by a privileged role.
  -- Acquire both owner locks in UUID order so opposing transfers cannot
  -- deadlock. Ordinary authenticated writes acquire only their own key.
  for v_lock_user_id in
    select candidate.user_id
    from (values (v_old_user_id), (v_new_user_id)) as candidate(user_id)
    where candidate.user_id is not null
    group by candidate.user_id
    order by candidate.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('stackr_seller_inventory_batch'),
      pg_catalog.hashtext(v_lock_user_id::text)
    );
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.lock_seller_inventory_item_owner()
  from public, anon, authenticated, service_role;
revoke all on function private.lock_seller_inventory_statement_actor()
  from public, anon, authenticated, service_role;

drop trigger if exists lock_seller_inventory_statement_actor
  on public.seller_inventory_items;
create trigger lock_seller_inventory_statement_actor
  before insert or update or delete
  on public.seller_inventory_items
  for each statement
  execute function private.lock_seller_inventory_statement_actor();

drop trigger if exists lock_seller_inventory_item_owner
  on public.seller_inventory_items;
create trigger lock_seller_inventory_item_owner
  before insert or update or delete
  on public.seller_inventory_items
  for each row
  execute function private.lock_seller_inventory_item_owner();

comment on function private.lock_seller_inventory_item_owner() is
  'Serialises legacy direct seller inventory writes on the same per-user advisory key as atomic batch commits.';
comment on function private.lock_seller_inventory_statement_actor() is
  'Acquires the authenticated actor advisory key before every legacy direct seller inventory statement, including empty writes.';
comment on trigger lock_seller_inventory_statement_actor
  on public.seller_inventory_items is
  'Makes authenticated legacy direct statements cooperate with atomic seller batches before row processing.';
comment on trigger lock_seller_inventory_item_owner
  on public.seller_inventory_items is
  'Prevents direct owner writes from racing an atomic seller inventory snapshot replacement.';

create or replace function public.commit_seller_inventory_batch(
  p_request_id text,
  p_expected_inventory jsonb,
  p_inventory jsonb,
  p_movements jsonb default '[]'::jsonb,
  p_sale jsonb default null,
  p_binder_deltas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_payload jsonb;
  v_prior_payload jsonb;
  v_prior_result jsonb;
  v_result jsonb;
  v_expected_count integer;
  v_inventory_count integer;
  v_current_count integer;
  v_movement_count integer;
  v_binder_delta_count integer;
  v_sale_id text;
  v_sale_sold_price numeric;
  v_sale_estimated_value numeric;
  v_sale_created_at timestamptz;
  v_sale_lines jsonb;
  v_binder_delta record;
  v_binder_card record;
  v_current_binder_quantity integer;
  v_next_binder_quantity integer;
begin
  if v_user_id is null then
    raise exception 'seller_inventory_authentication_required' using errcode = '42501';
  end if;

  if p_request_id is null
    or p_request_id !~ '^[A-Za-z0-9:_-]{16,128}$' then
    raise exception 'invalid_seller_inventory_request_id' using errcode = '22023';
  end if;

  if not pg_catalog.starts_with(
    p_request_id,
    'seller-batch:' || v_user_id::text || ':'
  ) then
    raise exception 'seller_inventory_request_identity_mismatch' using errcode = '42501';
  end if;

  if p_expected_inventory is null or jsonb_typeof(p_expected_inventory) <> 'array'
    or p_inventory is null or jsonb_typeof(p_inventory) <> 'array'
    or p_movements is null or jsonb_typeof(p_movements) <> 'array'
    or p_binder_deltas is null or jsonb_typeof(p_binder_deltas) <> 'array'
    or (p_sale is not null and jsonb_typeof(p_sale) <> 'object') then
    raise exception 'invalid_seller_inventory_batch_shape' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'expectedInventory', p_expected_inventory,
    'inventory', p_inventory,
    'movements', p_movements,
    'sale', p_sale,
    'binderDeltas', p_binder_deltas
  );

  if octet_length(v_payload::text) > 8388608 then
    raise exception 'seller_inventory_batch_too_large' using errcode = '22023';
  end if;

  -- Serialise every seller operation for this user. A retry with the same key
  -- observes either the complete prior result or no prior mutation at all.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('stackr_seller_inventory_batch'),
    pg_catalog.hashtext(v_user_id::text)
  );

  select batch.payload, batch.result
  into v_prior_payload, v_prior_result
  from private.seller_inventory_batch_commits batch
  where batch.user_id = v_user_id
    and batch.request_id = p_request_id;

  if found then
    if v_prior_payload is distinct from v_payload then
      raise exception 'seller_inventory_idempotency_conflict' using errcode = '23505';
    end if;
    return v_prior_result || jsonb_build_object('replayed', true);
  end if;

  if jsonb_array_length(p_expected_inventory) > 5000
    or jsonb_array_length(p_inventory) > 5000
    or jsonb_array_length(p_movements) > 500
    or jsonb_array_length(p_binder_deltas) > 500 then
    raise exception 'seller_inventory_batch_limit_exceeded' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_expected_count
  from jsonb_to_recordset(p_expected_inventory) as item(
    id text,
    card_id text,
    set_id text,
    condition text,
    quantity integer,
    asking_price numeric,
    buy_price numeric,
    notes text,
    card jsonb,
    created_at timestamptz,
    updated_at timestamptz
  );

  if exists (
    select 1
    from jsonb_to_recordset(p_expected_inventory) as item(
      id text,
      card_id text,
      set_id text,
      condition text,
      quantity integer,
      asking_price numeric,
      buy_price numeric,
      notes text,
      card jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
    where item.id is null or item.id = '' or octet_length(item.id) > 512
      or item.card_id is null or item.card_id = '' or octet_length(item.card_id) > 512
      or item.condition not in (
        'Mint', 'Near Mint', 'Lightly Played', 'Moderately Played',
        'Heavily Played', 'Damaged', 'Sealed'
      )
      or item.quantity is null or item.quantity < 1 or item.quantity > 1000000
      or item.card is null or jsonb_typeof(item.card) <> 'object'
      or octet_length(item.card::text) > 65536
      or item.created_at is null or item.updated_at is null
      or item.asking_price::text in ('NaN', 'Infinity', '-Infinity')
      or item.buy_price::text in ('NaN', 'Infinity', '-Infinity')
      or item.asking_price < 0 or item.buy_price < 0
      or item.asking_price > 100000000 or item.buy_price > 100000000
  ) or (
    select count(*) <> count(distinct item.id)
    from jsonb_to_recordset(p_expected_inventory) as item(id text)
  ) then
    raise exception 'invalid_expected_seller_inventory' using errcode = '22023';
  end if;

  -- Lock the currently visible stock rows before checking the optimistic
  -- snapshot precondition. Stale clients fail before any mutation.
  perform 1
  from public.seller_inventory_items item
  where item.user_id = v_user_id
  for update;

  select count(*)::integer
  into v_current_count
  from public.seller_inventory_items item
  where item.user_id = v_user_id;

  if v_current_count <> v_expected_count or exists (
    with expected as (
      select *
      from jsonb_to_recordset(p_expected_inventory) as item(
        id text,
        card_id text,
        set_id text,
        condition text,
        quantity integer,
        asking_price numeric,
        buy_price numeric,
        notes text,
        card jsonb,
        created_at timestamptz,
        updated_at timestamptz
      )
    )
    select 1
    from public.seller_inventory_items current_item
    full join expected expected_item on expected_item.id = current_item.id
    where (current_item.user_id = v_user_id or current_item.id is null)
      and (
        current_item.id is null
        or expected_item.id is null
        or row(
          current_item.card_id,
          current_item.set_id,
          current_item.condition,
          current_item.quantity,
          current_item.asking_price,
          current_item.buy_price,
          current_item.notes,
          current_item.card_snapshot,
          current_item.created_at,
          current_item.updated_at
        ) is distinct from row(
          expected_item.card_id,
          expected_item.set_id,
          expected_item.condition,
          expected_item.quantity,
          expected_item.asking_price,
          expected_item.buy_price,
          expected_item.notes,
          expected_item.card,
          expected_item.created_at,
          expected_item.updated_at
        )
      )
  ) then
    raise exception 'seller_inventory_snapshot_conflict' using errcode = '40001';
  end if;

  select count(*)::integer
  into v_inventory_count
  from jsonb_to_recordset(p_inventory) as item(id text);

  if exists (
    select 1
    from jsonb_to_recordset(p_inventory) as item(
      id text,
      card_id text,
      set_id text,
      condition text,
      quantity integer,
      asking_price numeric,
      buy_price numeric,
      notes text,
      card jsonb,
      created_at timestamptz,
      updated_at timestamptz
    )
    where item.id is null or item.id = '' or octet_length(item.id) > 512
      or item.card_id is null or item.card_id = '' or octet_length(item.card_id) > 512
      or item.condition not in (
        'Mint', 'Near Mint', 'Lightly Played', 'Moderately Played',
        'Heavily Played', 'Damaged', 'Sealed'
      )
      or item.quantity is null or item.quantity < 1 or item.quantity > 1000000
      or item.card is null or jsonb_typeof(item.card) <> 'object'
      or octet_length(item.card::text) > 65536
      or item.created_at is null or item.updated_at is null
      or item.asking_price::text in ('NaN', 'Infinity', '-Infinity')
      or item.buy_price::text in ('NaN', 'Infinity', '-Infinity')
      or item.asking_price < 0 or item.buy_price < 0
      or item.asking_price > 100000000 or item.buy_price > 100000000
  ) or (
    select count(*) <> count(distinct item.id)
    from jsonb_to_recordset(p_inventory) as item(id text)
  ) then
    raise exception 'invalid_seller_inventory' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_movement_count
  from jsonb_to_recordset(p_movements) as movement(id text);

  if exists (
    select 1
    from jsonb_to_recordset(p_movements) as movement(
      id text,
      inventory_item_id text,
      action_type text,
      card_id text,
      set_id text,
      card_name text,
      quantity integer,
      reason text,
      binder_id uuid,
      binder_name text,
      collection_id text,
      value_at_time numeric,
      image_small text,
      created_at timestamptz
    )
    where movement.id is null or movement.id = '' or octet_length(movement.id) > 512
      or movement.inventory_item_id is null or movement.inventory_item_id = ''
      or movement.action_type not in ('scan_in', 'scan_out')
      or movement.card_id is null or movement.card_id = ''
      or movement.quantity is null or movement.quantity < 1 or movement.quantity > 1000000
      or movement.reason is null or movement.reason = '' or octet_length(movement.reason) > 512
      or movement.created_at is null
      or movement.value_at_time::text in ('NaN', 'Infinity', '-Infinity')
      or movement.value_at_time < 0 or movement.value_at_time > 100000000
  ) or (
    select count(*) <> count(distinct movement.id)
    from jsonb_to_recordset(p_movements) as movement(id text)
  ) then
    raise exception 'invalid_seller_inventory_movement' using errcode = '22023';
  end if;

  if exists (
    with expected as (
      select item.id, item.quantity
      from jsonb_to_recordset(p_expected_inventory) as item(id text, quantity integer)
    ), desired as (
      select item.id, item.quantity
      from jsonb_to_recordset(p_inventory) as item(id text, quantity integer)
    ), movement_delta as (
      select
        movement.inventory_item_id as id,
        sum(case movement.action_type when 'scan_in' then movement.quantity else -movement.quantity end)::integer as quantity_delta
      from jsonb_to_recordset(p_movements) as movement(
        inventory_item_id text,
        action_type text,
        quantity integer
      )
      group by movement.inventory_item_id
    ), item_ids as (
      select id from expected
      union
      select id from desired
      union
      select id from movement_delta
    )
    select 1
    from item_ids
    left join expected using (id)
    left join desired using (id)
    left join movement_delta using (id)
    where coalesce(desired.quantity, 0) - coalesce(expected.quantity, 0)
      <> coalesce(movement_delta.quantity_delta, 0)
  ) or exists (
    with known_items as (
      select item.id
      from jsonb_to_recordset(p_expected_inventory) as item(id text)
      union
      select item.id
      from jsonb_to_recordset(p_inventory) as item(id text)
    )
    select 1
    from jsonb_to_recordset(p_movements) as movement(inventory_item_id text)
    where not exists (
      select 1 from known_items where known_items.id = movement.inventory_item_id
    )
  ) then
    raise exception 'seller_inventory_movement_mismatch' using errcode = '22023';
  end if;

  if p_sale is not null then
    v_sale_id := p_sale ->> 'id';
    v_sale_sold_price := nullif(p_sale ->> 'sold_price', '')::numeric;
    v_sale_estimated_value := (p_sale ->> 'estimated_value')::numeric;
    v_sale_created_at := (p_sale ->> 'created_at')::timestamptz;
    v_sale_lines := p_sale -> 'lines';

    if v_sale_id is null or v_sale_id = '' or octet_length(v_sale_id) > 512
      or v_sale_estimated_value is null or v_sale_estimated_value < 0
      or v_sale_estimated_value > 100000000
      or v_sale_estimated_value::text in ('NaN', 'Infinity', '-Infinity')
      or v_sale_sold_price < 0 or v_sale_sold_price > 100000000
      or v_sale_sold_price::text in ('NaN', 'Infinity', '-Infinity')
      or v_sale_created_at is null
      or v_sale_lines is null or jsonb_typeof(v_sale_lines) <> 'array'
      or jsonb_array_length(v_sale_lines) < 1
      or jsonb_array_length(v_sale_lines) > 500 then
      raise exception 'invalid_seller_sale' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(v_sale_lines) as line(
        inventory_item_id text,
        card_id text,
        card_name text,
        set_name text,
        condition text,
        quantity integer,
        estimated_unit_price numeric,
        image_small text
      )
      where line.inventory_item_id is null or line.inventory_item_id = ''
        or line.card_id is null or line.card_id = ''
        or line.card_name is null or line.card_name = ''
        or line.condition not in (
          'Mint', 'Near Mint', 'Lightly Played', 'Moderately Played',
          'Heavily Played', 'Damaged', 'Sealed'
        )
        or line.quantity is null or line.quantity < 1 or line.quantity > 1000000
        or line.estimated_unit_price::text in ('NaN', 'Infinity', '-Infinity')
        or line.estimated_unit_price < 0 or line.estimated_unit_price > 100000000
    ) or (
      select count(*) <> count(distinct line.inventory_item_id)
      from jsonb_to_recordset(v_sale_lines) as line(inventory_item_id text)
    ) or exists (
      with expected as (
        select item.id, item.quantity
        from jsonb_to_recordset(p_expected_inventory) as item(id text, quantity integer)
      )
      select 1
      from jsonb_to_recordset(v_sale_lines) as line(inventory_item_id text, quantity integer)
      left join expected on expected.id = line.inventory_item_id
      where expected.id is null or line.quantity > expected.quantity
    ) or exists (
      select 1
      from jsonb_to_recordset(p_movements) as movement(action_type text, reason text)
      where movement.action_type <> 'scan_out' or movement.reason <> 'Sold'
    ) or exists (
      with sale_quantity as (
        select line.inventory_item_id, sum(line.quantity)::integer as quantity
        from jsonb_to_recordset(v_sale_lines) as line(inventory_item_id text, quantity integer)
        group by line.inventory_item_id
      ), movement_quantity as (
        select movement.inventory_item_id, sum(movement.quantity)::integer as quantity
        from jsonb_to_recordset(p_movements) as movement(
          inventory_item_id text,
          action_type text,
          reason text,
          quantity integer
        )
        where movement.action_type = 'scan_out' and movement.reason = 'Sold'
        group by movement.inventory_item_id
      )
      select 1
      from sale_quantity
      full join movement_quantity using (inventory_item_id)
      where sale_quantity.inventory_item_id is null
        or movement_quantity.inventory_item_id is null
        or sale_quantity.quantity <> movement_quantity.quantity
    ) then
      raise exception 'seller_sale_movement_mismatch' using errcode = '22023';
    end if;
  elsif exists (
    select 1
    from jsonb_to_recordset(p_movements) as movement(reason text)
    where movement.reason = 'Sold'
  ) then
    raise exception 'seller_sale_required_for_sold_movement' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_binder_delta_count
  from jsonb_to_recordset(p_binder_deltas) as delta(binder_id uuid);

  if exists (
    select 1
    from jsonb_to_recordset(p_binder_deltas) as delta(
      binder_id uuid,
      card_id text,
      set_id text,
      quantity_delta integer,
      card_name text,
      card_number text,
      image_url text,
      set_name text
    )
    where delta.binder_id is null
      or delta.card_id is null or delta.card_id = '' or octet_length(delta.card_id) > 512
      or delta.set_id is null or delta.set_id = '' or octet_length(delta.set_id) > 512
      or delta.quantity_delta is null or delta.quantity_delta = 0
      or abs(delta.quantity_delta) > 1000000
  ) or (
    select count(*) <> count(distinct (delta.binder_id, delta.card_id))
    from jsonb_to_recordset(p_binder_deltas) as delta(binder_id uuid, card_id text)
  ) or exists (
    with binder_delta as (
      select delta.binder_id, delta.card_id, delta.quantity_delta
      from jsonb_to_recordset(p_binder_deltas) as delta(
        binder_id uuid,
        card_id text,
        quantity_delta integer
      )
    ), movement_delta as (
      select
        movement.binder_id,
        movement.card_id,
        sum(case movement.action_type when 'scan_in' then movement.quantity else -movement.quantity end)::integer as quantity_delta
      from jsonb_to_recordset(p_movements) as movement(
        binder_id uuid,
        card_id text,
        action_type text,
        quantity integer
      )
      where movement.binder_id is not null
      group by movement.binder_id, movement.card_id
    )
    select 1
    from binder_delta
    full join movement_delta using (binder_id, card_id)
    where binder_delta.binder_id is null
      or movement_delta.binder_id is null
      or binder_delta.quantity_delta <> movement_delta.quantity_delta
  ) then
    raise exception 'seller_binder_movement_mismatch' using errcode = '22023';
  end if;

  delete from public.seller_inventory_items item
  where item.user_id = v_user_id;

  insert into public.seller_inventory_items (
    id,
    user_id,
    card_id,
    set_id,
    condition,
    quantity,
    asking_price,
    buy_price,
    notes,
    card_snapshot,
    created_at,
    updated_at
  )
  select
    item.id,
    v_user_id,
    item.card_id,
    item.set_id,
    item.condition,
    item.quantity,
    item.asking_price,
    item.buy_price,
    item.notes,
    item.card,
    item.created_at,
    item.updated_at
  from jsonb_to_recordset(p_inventory) as item(
    id text,
    card_id text,
    set_id text,
    condition text,
    quantity integer,
    asking_price numeric,
    buy_price numeric,
    notes text,
    card jsonb,
    created_at timestamptz,
    updated_at timestamptz
  );

  if v_binder_delta_count > 0 then
    for v_binder_delta in
      select *
      from jsonb_to_recordset(p_binder_deltas) as delta(
        binder_id uuid,
        card_id text,
        set_id text,
        quantity_delta integer,
        card_name text,
        card_number text,
        image_url text,
        set_name text
      )
      order by delta.binder_id, delta.card_id
    loop
      perform 1
      from public.binders binder
      where binder.id = v_binder_delta.binder_id
        and binder.user_id = v_user_id
      for update;

      if not found then
        raise exception 'seller_binder_not_owned' using errcode = '42501';
      end if;

      select card.id, card.owned, card.owned_quantity
      into v_binder_card
      from public.binder_cards card
      where card.binder_id = v_binder_delta.binder_id
        and card.card_id = v_binder_delta.card_id
      for update;

      if found then
        v_current_binder_quantity := case
          when v_binder_card.owned then greatest(1, coalesce(v_binder_card.owned_quantity, 1))
          else 0
        end;
        v_next_binder_quantity := v_current_binder_quantity + v_binder_delta.quantity_delta;
        if v_next_binder_quantity < 0 then
          raise exception 'seller_binder_quantity_underflow' using errcode = '22003';
        end if;

        update public.binder_cards card
        set
          owned = v_next_binder_quantity > 0,
          owned_quantity = greatest(1, v_next_binder_quantity),
          card_name = coalesce(v_binder_delta.card_name, card.card_name),
          card_number = coalesce(v_binder_delta.card_number, card.card_number),
          image_url = coalesce(v_binder_delta.image_url, card.image_url),
          set_name = coalesce(v_binder_delta.set_name, card.set_name)
        where card.id = v_binder_card.id;
      else
        if v_binder_delta.quantity_delta < 1 then
          raise exception 'seller_binder_quantity_underflow' using errcode = '22003';
        end if;

        insert into public.binder_cards (
          binder_id,
          card_id,
          set_id,
          api_card_id,
          api_set_id,
          owned,
          owned_quantity,
          notes,
          card_name,
          card_number,
          image_url,
          set_name
        ) values (
          v_binder_delta.binder_id,
          v_binder_delta.card_id,
          v_binder_delta.set_id,
          v_binder_delta.card_id,
          v_binder_delta.set_id,
          true,
          v_binder_delta.quantity_delta,
          '',
          v_binder_delta.card_name,
          v_binder_delta.card_number,
          v_binder_delta.image_url,
          v_binder_delta.set_name
        );
      end if;
    end loop;
  end if;

  insert into public.inventory_movements (
    id,
    user_id,
    inventory_item_id,
    action_type,
    card_id,
    set_id,
    card_name,
    quantity,
    reason,
    binder_id,
    binder_name,
    collection_id,
    value_at_time,
    image_small,
    created_at
  )
  select
    movement.id,
    v_user_id,
    movement.inventory_item_id,
    movement.action_type,
    movement.card_id,
    movement.set_id,
    movement.card_name,
    movement.quantity,
    movement.reason,
    movement.binder_id,
    movement.binder_name,
    movement.collection_id,
    movement.value_at_time,
    movement.image_small,
    movement.created_at
  from jsonb_to_recordset(p_movements) as movement(
    id text,
    inventory_item_id text,
    action_type text,
    card_id text,
    set_id text,
    card_name text,
    quantity integer,
    reason text,
    binder_id uuid,
    binder_name text,
    collection_id text,
    value_at_time numeric,
    image_small text,
    created_at timestamptz
  );

  if p_sale is not null then
    insert into public.seller_sale_transactions (
      id,
      user_id,
      sold_price,
      estimated_value,
      created_at
    ) values (
      v_sale_id,
      v_user_id,
      v_sale_sold_price,
      v_sale_estimated_value,
      v_sale_created_at
    );

    insert into public.seller_sale_transaction_items (
      transaction_id,
      user_id,
      inventory_item_id,
      card_id,
      card_name,
      set_name,
      condition,
      quantity,
      estimated_unit_price,
      image_small,
      created_at
    )
    select
      v_sale_id,
      v_user_id,
      line.inventory_item_id,
      line.card_id,
      line.card_name,
      line.set_name,
      line.condition,
      line.quantity,
      line.estimated_unit_price,
      line.image_small,
      v_sale_created_at
    from jsonb_to_recordset(v_sale_lines) as line(
      inventory_item_id text,
      card_id text,
      card_name text,
      set_name text,
      condition text,
      quantity integer,
      estimated_unit_price numeric,
      image_small text
    );
  end if;

  v_result := jsonb_build_object(
    'requestId', p_request_id,
    'inventoryItemCount', v_inventory_count,
    'movementCount', v_movement_count,
    'binderDeltaCount', v_binder_delta_count,
    'saleRecorded', p_sale is not null,
    'replayed', false
  );

  insert into private.seller_inventory_batch_commits (
    user_id,
    request_id,
    payload,
    result
  ) values (
    v_user_id,
    p_request_id,
    v_payload,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;

grant execute on function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) is 'Atomically commits an authenticated seller stock snapshot, its movements, optional sale, and binder quantity changes with optimistic concurrency and idempotent retries.';
