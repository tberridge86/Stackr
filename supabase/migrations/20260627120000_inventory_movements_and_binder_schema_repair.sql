alter table public.binders
  add column if not exists master_set_enabled boolean not null default false;

comment on column public.binders.master_set_enabled is
  'Whether this binder tracks master-set variant completion instead of printed-card completion only.';

create table if not exists public.inventory_movements (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in ('scan_in', 'scan_out')),
  card_id text null,
  product_id text null,
  set_id text null,
  card_name text null,
  product_name text null,
  quantity integer not null default 1 check (quantity > 0),
  reason text not null,
  binder_id text null references public.binders(id) on delete set null,
  binder_name text null,
  collection_id text null,
  value_at_time numeric null,
  image_small text null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_user_created_idx
  on public.inventory_movements(user_id, created_at desc);

create index if not exists inventory_movements_user_card_idx
  on public.inventory_movements(user_id, card_id);

alter table public.inventory_movements enable row level security;

drop policy if exists "Inventory movements are private" on public.inventory_movements;
create policy "Inventory movements are private"
  on public.inventory_movements
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.inventory_movements to authenticated, service_role;

comment on table public.inventory_movements is
  'Private scan-in and scan-out movement history for seller inventory and collection activity.';
