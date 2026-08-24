create table private.premium_seller_runtime_control (
  singleton boolean primary key default true check (singleton),
  writes_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.premium_seller_runtime_control (
  singleton,
  writes_enabled
)
values (true, false)
on conflict (singleton) do nothing;

comment on table private.premium_seller_runtime_control is
  'Server-owned emergency control for Premium Seller inventory writes. New environments start disabled.';

alter table private.premium_seller_runtime_control enable row level security;

revoke all on table private.premium_seller_runtime_control from public, anon, authenticated, service_role;

-- Keep the already-rehearsed atomic implementation intact, but move it behind
-- a public authorization wrapper. The internal function remains invoker-mode;
-- when called by the SECURITY DEFINER wrapper it executes with the wrapper
-- owner's table privileges and cannot be invoked by API roles directly.
alter function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) set schema private;

alter function private.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) rename to commit_seller_inventory_batch_impl;

alter function private.commit_seller_inventory_batch_impl(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) owner to postgres;

revoke all on function private.commit_seller_inventory_batch_impl(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;

comment on function private.commit_seller_inventory_batch_impl(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) is 'Internal atomic seller inventory implementation. Call through the guarded public wrapper only.';

-- Reads remain owner-private for every authenticated user so an expired or
-- paused Premium account never loses access to its existing records. Writes
-- are intentionally absent from RLS and are available only through the wrapper.
drop policy if exists "Seller inventory is private"
  on public.seller_inventory_items;

drop policy if exists "Users can read own seller inventory"
  on public.seller_inventory_items;

create policy "Users can read own seller inventory"
  on public.seller_inventory_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Seller sale transactions are private"
  on public.seller_sale_transactions;

drop policy if exists "Users can read own seller sales"
  on public.seller_sale_transactions;

create policy "Users can read own seller sales"
  on public.seller_sale_transactions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Seller sale transaction items are private"
  on public.seller_sale_transaction_items;

drop policy if exists "Users can read own seller sale items"
  on public.seller_sale_transaction_items;

create policy "Users can read own seller sale items"
  on public.seller_sale_transaction_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Inventory movements are private"
  on public.inventory_movements;

drop policy if exists "Users can read own inventory movements"
  on public.inventory_movements;

create policy "Users can read own inventory movements"
  on public.inventory_movements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own seller batch commits"
  on private.seller_inventory_batch_commits;

revoke all on table public.seller_inventory_items from public, anon, authenticated;

revoke all on table public.inventory_movements from public, anon, authenticated;

revoke all on table public.seller_sale_transactions from public, anon, authenticated;

revoke all on table public.seller_sale_transaction_items from public, anon, authenticated;

revoke all on table private.seller_inventory_batch_commits from public, anon, authenticated;

grant select on table public.seller_inventory_items to authenticated;

grant select on table public.inventory_movements to authenticated;

grant select on table public.seller_sale_transactions to authenticated;

grant select on table public.seller_sale_transaction_items to authenticated;

grant select on table private.seller_inventory_batch_commits to authenticated;

revoke all on sequence public.seller_sale_transaction_items_id_seq
  from public, anon, authenticated;

create function public.commit_seller_inventory_batch(
  p_request_id text,
  p_expected_inventory jsonb,
  p_inventory jsonb,
  p_movements jsonb default '[]'::jsonb,
  p_sale jsonb default null,
  p_binder_deltas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_writes_enabled boolean;
  v_entitled boolean := coalesce(
    (auth.jwt() -> 'app_metadata' -> 'stackr_premium_seller') = 'true'::jsonb,
    false
  );
begin
  if v_user_id is null then
    raise exception 'seller_inventory_authentication_required' using errcode = '42501';
  end if;

  if p_request_id is null or not starts_with(
    p_request_id,
    'seller-batch:' || v_user_id::text || ':'
  ) then
    raise exception 'seller_inventory_request_identity_mismatch' using errcode = '42501';
  end if;

  select control.writes_enabled
  into v_writes_enabled
  from private.premium_seller_runtime_control control
  where control.singleton;

  if not coalesce(v_writes_enabled, false) then
    raise exception 'premium_seller_mode_disabled' using errcode = '42501';
  end if;

  if not v_entitled then
    raise exception 'premium_seller_entitlement_required' using errcode = '42501';
  end if;

  return private.commit_seller_inventory_batch_impl(
    p_request_id,
    p_expected_inventory,
    p_inventory,
    p_movements,
    p_sale,
    p_binder_deltas
  );
end;
$$;

alter function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) owner to postgres;

revoke all on function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) is 'Atomically commits Premium Seller inventory for an authenticated, server-entitled user while the server runtime control is enabled.';

notify pgrst, 'reload schema';
