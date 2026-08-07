create table if not exists public.user_card_variants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  set_id text not null,
  variant text not null default 'normal',
  quantity integer not null default 1 check (quantity >= 1),
  condition text not null default 'Near Mint',
  grade_company text not null default '',
  grade text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_card_variants
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists quantity integer not null default 1 check (quantity >= 1),
  add column if not exists condition text not null default 'Near Mint',
  add column if not exists grade_company text not null default '',
  add column if not exists grade text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.user_card_variants
set
  condition = coalesce(nullif(condition, ''), 'Near Mint'),
  grade_company = coalesce(grade_company, ''),
  grade = coalesce(grade, ''),
  quantity = greatest(1, coalesce(quantity, 1));

alter table public.binder_cards
  add column if not exists owned_card_variant_id uuid null;

do $$
declare
  constraint_record record;
  index_record record;
begin
  for constraint_record in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.user_card_variants'::regclass
      and con.contype = 'u'
      and (
        select array_agg(attr.attname::text order by key.ordinality)
        from unnest(con.conkey) with ordinality key(attnum, ordinality)
        join pg_attribute attr
          on attr.attrelid = con.conrelid
         and attr.attnum = key.attnum
      ) = array['user_id', 'card_id', 'set_id', 'variant']
  loop
    execute format(
      'alter table public.user_card_variants drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;

  for index_record in
    select ns.nspname as schema_name, idx.relname as index_name
    from pg_index ind
    join pg_class idx on idx.oid = ind.indexrelid
    join pg_class tbl on tbl.oid = ind.indrelid
    join pg_namespace ns on ns.oid = idx.relnamespace
    where tbl.oid = 'public.user_card_variants'::regclass
      and ind.indisunique
      and not ind.indisprimary
      and not exists (
        select 1
        from pg_constraint con
        where con.conindid = ind.indexrelid
      )
      and (
        select array_agg(attr.attname::text order by key.ordinality)
        from unnest(ind.indkey) with ordinality key(attnum, ordinality)
        join pg_attribute attr
          on attr.attrelid = tbl.oid
         and attr.attnum = key.attnum
      ) = array['user_id', 'card_id', 'set_id', 'variant']
  loop
    execute format(
      'drop index if exists %I.%I',
      index_record.schema_name,
      index_record.index_name
    );
  end loop;
end $$;

with binder_owned as (
  select
    b.user_id,
    bc.card_id,
    bc.set_id,
    'normal'::text as variant,
    coalesce(nullif(bc.condition, ''), 'Near Mint') as condition,
    coalesce(bc.grade_company, '') as grade_company,
    coalesce(bc.grade, '') as grade,
    max(greatest(1, coalesce(bc.owned_quantity, 1))) as quantity
  from public.binder_cards bc
  join public.binders b on b.id = bc.binder_id
  where bc.owned = true
  group by b.user_id, bc.card_id, bc.set_id, coalesce(nullif(bc.condition, ''), 'Near Mint'), coalesce(bc.grade_company, ''), coalesce(bc.grade, '')
)
update public.user_card_variants ucv
set quantity = greatest(ucv.quantity, bo.quantity)
from binder_owned bo
where ucv.user_id = bo.user_id
  and ucv.card_id = bo.card_id
  and ucv.set_id = bo.set_id
  and ucv.variant = bo.variant
  and ucv.condition = bo.condition
  and ucv.grade_company = bo.grade_company
  and ucv.grade = bo.grade;

with binder_owned as (
  select
    b.user_id,
    bc.card_id,
    bc.set_id,
    'normal'::text as variant,
    coalesce(nullif(bc.condition, ''), 'Near Mint') as condition,
    coalesce(bc.grade_company, '') as grade_company,
    coalesce(bc.grade, '') as grade,
    max(greatest(1, coalesce(bc.owned_quantity, 1))) as quantity
  from public.binder_cards bc
  join public.binders b on b.id = bc.binder_id
  where bc.owned = true
  group by b.user_id, bc.card_id, bc.set_id, coalesce(nullif(bc.condition, ''), 'Near Mint'), coalesce(bc.grade_company, ''), coalesce(bc.grade, '')
)
insert into public.user_card_variants (
  user_id,
  card_id,
  set_id,
  variant,
  condition,
  grade_company,
  grade,
  quantity
)
select
  bo.user_id,
  bo.card_id,
  bo.set_id,
  bo.variant,
  bo.condition,
  bo.grade_company,
  bo.grade,
  bo.quantity
from binder_owned bo
where not exists (
  select 1
  from public.user_card_variants ucv
  where ucv.user_id = bo.user_id
    and ucv.card_id = bo.card_id
    and ucv.set_id = bo.set_id
    and ucv.variant = bo.variant
    and ucv.condition = bo.condition
    and ucv.grade_company = bo.grade_company
    and ucv.grade = bo.grade
);

create unique index if not exists user_card_variants_owned_identity_uidx
  on public.user_card_variants(user_id, card_id, set_id, variant, condition, grade_company, grade);

create unique index if not exists user_card_variants_id_uidx
  on public.user_card_variants(id);

create index if not exists user_card_variants_user_card_idx
  on public.user_card_variants(user_id, card_id, set_id);

create index if not exists binder_cards_owned_variant_idx
  on public.binder_cards(owned_card_variant_id);

update public.binder_cards bc
set owned_card_variant_id = ucv.id,
    owned_quantity = ucv.quantity
from public.binders b
join public.user_card_variants ucv
  on ucv.user_id = b.user_id
where b.id = bc.binder_id
  and bc.owned = true
  and ucv.card_id = bc.card_id
  and ucv.set_id = bc.set_id
  and ucv.variant = 'normal'
  and ucv.condition = coalesce(nullif(bc.condition, ''), 'Near Mint')
  and ucv.grade_company = coalesce(bc.grade_company, '')
  and ucv.grade = coalesce(bc.grade, '');

alter table public.user_card_variants enable row level security;

drop policy if exists "Users can read own card variants" on public.user_card_variants;
create policy "Users can read own card variants"
  on public.user_card_variants
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own card variants" on public.user_card_variants;
create policy "Users can insert own card variants"
  on public.user_card_variants
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own card variants" on public.user_card_variants;
create policy "Users can update own card variants"
  on public.user_card_variants
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own card variants" on public.user_card_variants;
create policy "Users can delete own card variants"
  on public.user_card_variants
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.user_card_variants to authenticated, service_role;

comment on table public.user_card_variants is
  'Physical owned card records. Binder cards reference these rows; quantity here drives collection totals and duplicates.';

comment on column public.binder_cards.owned_card_variant_id is
  'Optional membership link to the physical owned card record represented by this binder display row.';
