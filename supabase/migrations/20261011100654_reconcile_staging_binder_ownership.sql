-- Reconcile a staging-only absent binder ownership lifecycle.
-- Recovered from the 20260902 lifecycle migration files and verified against
-- current production function definitions. No data copy or backfill is performed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $guard$
declare
  v_core_count integer;
  v_column_count integer;
  v_hashes_ok boolean;
  v_policy_ok boolean;
  v_foundation_count integer;
  v_foundation_ok boolean := false;
begin
  select count(*) into v_core_count from (values
    (to_regclass('public.binder_ownership_mutation_requests') is not null),
    (to_regprocedure('public.apply_binder_ownership_mutation_v1(uuid,text,text,jsonb,text)') is not null),
    (to_regprocedure('public.apply_binder_ownership_mutation_v1_unversioned(uuid,text,text,jsonb,text)') is not null),
    (to_regprocedure('public.check_binder_mutation_precondition_v1(text,jsonb)') is not null),
    (to_regprocedure('public.binder_ownership_lifecycle_readiness_v1()') is not null)
  ) as core(present) where present;
  select count(*) into v_foundation_count from (values
    (to_regclass('public.marketplace_listing_publication_requests') is not null),
    (to_regclass('public.marketplace_inventory_reservations') is not null),
    (to_regclass('public.marketplace_listing_transaction_events') is not null),
    (to_regclass('public.marketplace_listing_review_events') is not null)
  ) as foundation(present) where present;
  if v_foundation_count <> 0 and v_foundation_count <> 4 then
    raise exception 'marketplace safeguard foundation is partially installed; refusing reconciliation';
  elsif v_foundation_count = 4 then
    select
      (select count(*) from (
        values
          ('marketplace_listing_publication_requests','request_id','uuid'),('marketplace_listing_publication_requests','request_key','text'),('marketplace_listing_publication_requests','seller_user_id','uuid'),('marketplace_listing_publication_requests','listing_id','uuid'),('marketplace_listing_publication_requests','manifest_hash','text'),('marketplace_listing_publication_requests','state','text'),('marketplace_listing_publication_requests','approval_snapshot','jsonb'),('marketplace_listing_publication_requests','inventory_snapshot','jsonb'),('marketplace_listing_publication_requests','pricing_snapshot','jsonb'),('marketplace_listing_publication_requests','error_code','text'),('marketplace_listing_publication_requests','error_message','text'),('marketplace_listing_publication_requests','created_at','timestamp with time zone'),('marketplace_listing_publication_requests','updated_at','timestamp with time zone'),
          ('marketplace_inventory_reservations','reservation_id','uuid'),('marketplace_inventory_reservations','request_id','uuid'),('marketplace_inventory_reservations','seller_user_id','uuid'),('marketplace_inventory_reservations','inventory_source_type','text'),('marketplace_inventory_reservations','inventory_source_id','text'),('marketplace_inventory_reservations','quantity','integer'),('marketplace_inventory_reservations','identity_fingerprint','text'),('marketplace_inventory_reservations','status','text'),('marketplace_inventory_reservations','created_at','timestamp with time zone'),('marketplace_inventory_reservations','updated_at','timestamp with time zone'),
          ('marketplace_listing_transaction_events','id','bigint'),('marketplace_listing_transaction_events','request_id','uuid'),('marketplace_listing_transaction_events','seller_user_id','uuid'),('marketplace_listing_transaction_events','event_kind','text'),('marketplace_listing_transaction_events','state','text'),('marketplace_listing_transaction_events','code','text'),('marketplace_listing_transaction_events','message','text'),('marketplace_listing_transaction_events','created_at','timestamp with time zone'),
          ('marketplace_listing_review_events','id','uuid'),('marketplace_listing_review_events','listing_id','uuid'),('marketplace_listing_review_events','seller_user_id','uuid'),('marketplace_listing_review_events','reviewer_user_id','uuid'),('marketplace_listing_review_events','decision','text'),('marketplace_listing_review_events','previous_verification_status','text'),('marketplace_listing_review_events','resulting_verification_status','text'),('marketplace_listing_review_events','previous_listing_status','text'),('marketplace_listing_review_events','resulting_listing_status','text'),('marketplace_listing_review_events','internal_notes','text'),('marketplace_listing_review_events','seller_message','text'),('marketplace_listing_review_events','listing_snapshot','jsonb'),('marketplace_listing_review_events','created_at','timestamp with time zone')
      ) expected(table_name,column_name,column_type)
      left join information_schema.columns actual on actual.table_schema='public' and actual.table_name=expected.table_name and actual.column_name=expected.column_name and actual.data_type=expected.column_type
      where actual.column_name is null) = 0
      and (select count(*) from information_schema.columns where table_schema='public' and table_name in ('marketplace_listing_publication_requests','marketplace_inventory_reservations','marketplace_listing_transaction_events','marketplace_listing_review_events')) = 44
      and (select count(*) from (
        values
          ('marketplace_inventory_reservations','marketplace_inventory_reservation_quantity_valid','60bf7317507aa966abafa35095e62a98'),('marketplace_inventory_reservations','marketplace_inventory_reservation_source_valid','cb260ffc8e50f11e41fee35f8e0f8494'),('marketplace_inventory_reservations','marketplace_inventory_reservation_status_valid','be592687cc6aca96e9cc799204bd99f0'),('marketplace_inventory_reservations','marketplace_inventory_reservations_request_id_fkey','7219c0916e9cd0a1341a1a60de6c285d'),('marketplace_inventory_reservations','marketplace_inventory_reservations_seller_user_id_fkey','146b7ab748ba823473bc556396ef3ae2'),
          ('marketplace_listing_publication_requests','marketplace_listing_publication_requests_seller_user_id_fkey','146b7ab748ba823473bc556396ef3ae2'),('marketplace_listing_publication_requests','marketplace_listing_publication_state_valid','99cd1934d71357aa0e10dd001779a8f6'),
          ('marketplace_listing_review_events','marketplace_listing_review_events_decision_valid','8f9cd3d6fdb33511a645ba42e20c468e'),('marketplace_listing_review_events','marketplace_listing_review_events_listing_id_fkey','a7ec6c41b1f6b85b98d34daf9c84adad'),('marketplace_listing_review_events','marketplace_listing_review_events_notes_length','89a76e60cb844af0c573e9dca1587ab6'),('marketplace_listing_review_events','marketplace_listing_review_events_reviewer_user_id_fkey','f57aa7bc8399d43a3cdf7992af8e323b'),('marketplace_listing_review_events','marketplace_listing_review_events_seller_message_length','fce3ca9c5833da08115463257ad76d9d'),('marketplace_listing_review_events','marketplace_listing_review_events_seller_user_id_fkey','30bcc53b33fbbf868f41f54d53c3598c'),('marketplace_listing_review_events','marketplace_listing_review_events_verification_statuses_valid','6fbd38952acb7db2429a8033ecd9f1eb'),
          ('marketplace_listing_transaction_events','marketplace_listing_event_kind_valid','a1af68a7daff589dfe3a6bd4e55af735'),('marketplace_listing_transaction_events','marketplace_listing_transaction_events_request_id_fkey','7219c0916e9cd0a1341a1a60de6c285d'),('marketplace_listing_transaction_events','marketplace_listing_transaction_events_seller_user_id_fkey','146b7ab748ba823473bc556396ef3ae2')
      ) expected(table_name,constraint_name,definition_md5)
      left join pg_constraint constraint_row on constraint_row.conname=expected.constraint_name
      left join pg_class relation on relation.oid=constraint_row.conrelid and relation.relname=expected.table_name
      left join pg_namespace namespace on namespace.oid=relation.relnamespace and namespace.nspname='public'
      where constraint_row.oid is null or namespace.oid is null or md5(pg_get_constraintdef(constraint_row.oid)) <> expected.definition_md5) = 0
      and (select count(*) from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='public' and relation.relname in ('marketplace_listing_publication_requests','marketplace_inventory_reservations','marketplace_listing_transaction_events','marketplace_listing_review_events') and relation.relrowsecurity and relation.relforcerowsecurity) = 4
      and not exists (select 1 from (values ('marketplace_listing_publication_requests'),('marketplace_inventory_reservations'),('marketplace_listing_transaction_events'),('marketplace_listing_review_events')) expected(table_name) where has_table_privilege('anon', 'public.' || expected.table_name, 'select') or has_table_privilege('anon', 'public.' || expected.table_name, 'insert') or has_table_privilege('anon', 'public.' || expected.table_name, 'update') or has_table_privilege('anon', 'public.' || expected.table_name, 'delete') or has_table_privilege('authenticated', 'public.' || expected.table_name, 'select') or has_table_privilege('authenticated', 'public.' || expected.table_name, 'insert') or has_table_privilege('authenticated', 'public.' || expected.table_name, 'update') or has_table_privilege('authenticated', 'public.' || expected.table_name, 'delete'))
      and has_table_privilege('service_role','public.marketplace_listing_publication_requests','select')
      and has_table_privilege('service_role','public.marketplace_listing_publication_requests','insert')
      and has_table_privilege('service_role','public.marketplace_listing_publication_requests','update')
      and has_table_privilege('service_role','public.marketplace_listing_publication_requests','delete')
      and has_table_privilege('service_role','public.marketplace_inventory_reservations','select')
      and has_table_privilege('service_role','public.marketplace_inventory_reservations','insert')
      and has_table_privilege('service_role','public.marketplace_inventory_reservations','update')
      and has_table_privilege('service_role','public.marketplace_inventory_reservations','delete')
      and has_table_privilege('service_role','public.marketplace_listing_transaction_events','select')
      and has_table_privilege('service_role','public.marketplace_listing_transaction_events','insert')
      and has_table_privilege('service_role','public.marketplace_listing_review_events','select')
      and has_table_privilege('service_role','public.marketplace_listing_review_events','insert')
      and has_table_privilege('service_role','public.marketplace_listing_review_events','update')
      and has_table_privilege('service_role','public.marketplace_listing_review_events','delete')
    into v_foundation_ok;
    if not v_foundation_ok then
      raise exception 'marketplace safeguard foundation is installed but not production-compatible; refusing reconciliation';
    end if;
  end if;
  if v_core_count = 5 then
    select count(*) into v_column_count from information_schema.columns
      where table_schema='public' and table_name='binder_ownership_mutation_requests';
    select count(*) = 10 into v_hashes_ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and (p.proname,md5(pg_get_functiondef(p.oid))) in (
        ('apply_binder_ownership_mutation_v1','a1e60a71ef2e44b13ff65cecde08bfb6'),
        ('apply_binder_ownership_mutation_v1_unversioned','827ee4a912be6faca4b7690e03c148d5'),
        ('check_binder_mutation_precondition_v1','382cbf6195b729484903dfb75048bac1'),
        ('binder_ownership_lifecycle_readiness_v1','d0bbd6a5e2b8e52d284f0c7ea62c5372'),
        ('binder_conflict_detail_v1','77b4eb2a2b697d7020ee2cfcd947d1f7'),
        ('bump_binder_lifecycle_version_v1','d2f842e7f54a00ab425bf24c4ea5fa9e'),
        ('guard_reserved_binder_delete','40573b3822e6e1446914b2edef1d5992'),
        ('guard_reserved_binder_membership_mutation','972bb5b00f4ab077dae60527c549d73c'),
        ('guard_reserved_owned_variant_mutation','cedc5566dd3f93aa385562658e50eb09'),
        ('guard_reserved_seller_inventory_mutation','104a2b067d3fa970f7b25490ef3d4eac')
      );
    select exists(
        select 1 from pg_policy policy
        join pg_class relation on relation.oid=policy.polrelid
        join pg_namespace namespace on namespace.oid=relation.relnamespace
        where namespace.nspname='public'
          and relation.relname='binder_ownership_mutation_requests'
          and relation.relrowsecurity
          and policy.polname='Users can read own binder mutation requests'
          and policy.polcmd='r'
          and policy.polroles=array[(select oid from pg_roles where rolname='authenticated')]::oid[]
          and pg_get_expr(policy.polqual, policy.polrelid)='(owner_user_id = ( SELECT auth.uid() AS uid))'
      )
      and has_function_privilege('authenticated','public.apply_binder_ownership_mutation_v1(uuid,text,text,jsonb,text)','execute')
      and not has_function_privilege('anon','public.apply_binder_ownership_mutation_v1(uuid,text,text,jsonb,text)','execute')
      and not has_table_privilege('anon','public.binder_ownership_mutation_requests','select')
      and not has_table_privilege('authenticated','public.binder_ownership_mutation_requests','insert')
      and not has_table_privilege('authenticated','public.binder_ownership_mutation_requests','update')
      and not has_table_privilege('authenticated','public.binder_ownership_mutation_requests','delete') into v_policy_ok;
    if v_foundation_count = 4 and v_foundation_ok and v_column_count = 12 and v_hashes_ok and v_policy_ok then return; end if;
    raise exception 'binder ownership lifecycle is installed but not production-compatible; refusing reconciliation';
  elsif v_core_count <> 0 then
    raise exception 'binder ownership lifecycle is partially installed; refusing reconciliation';
  end if;
  select count(*) into v_column_count from (values
    (to_regclass('public.marketplace_listing_publication_requests') is not null),
    (to_regclass('public.marketplace_inventory_reservations') is not null),
    (to_regclass('public.marketplace_listing_transaction_events') is not null),
    (to_regclass('public.marketplace_listing_review_events') is not null)
  ) as foundation(present) where present;
  if v_column_count <> 0 and v_column_count <> 4 then
    raise exception 'marketplace safeguard foundation is partially installed; refusing reconciliation';
  elsif v_column_count = 0 then
    execute $foundation$
-- Empty transaction/audit tables only. These definitions are recovered from
-- 20260901190000_marketplace_listing_transactions.sql and
-- 20260826084759_marketplace_trust_and_safety.sql, then checked against production.
create table public.marketplace_listing_publication_requests (
  request_id uuid primary key,
  request_key text not null unique,
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid,
  manifest_hash text not null,
  state text not null,
  approval_snapshot jsonb not null,
  inventory_snapshot jsonb not null,
  pricing_snapshot jsonb not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint marketplace_listing_publication_state_valid check (state in ('draft','review_required','ready','publishing','reconciliation_required','published','rejected','cancelled'))
);
create table public.marketplace_inventory_reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.marketplace_listing_publication_requests(request_id) on delete cascade,
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  inventory_source_type text not null,
  inventory_source_id text not null,
  quantity integer not null,
  identity_fingerprint text not null,
  status text not null default 'reserved',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint marketplace_inventory_reservation_source_valid check (inventory_source_type in ('seller_inventory','owned_variant')),
  constraint marketplace_inventory_reservation_quantity_valid check (quantity between 1 and 999),
  constraint marketplace_inventory_reservation_status_valid check (status in ('reserved','published','released'))
);
create table public.marketplace_listing_transaction_events (
  id bigint generated by default as identity primary key,
  request_id uuid not null references public.marketplace_listing_publication_requests(request_id) on delete cascade,
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  event_kind text not null,
  state text not null,
  code text,
  message text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint marketplace_listing_event_kind_valid check (event_kind in ('draft','review','authorization','pricing','reservation','publication','retry','reconciliation','moderation','cancellation','export'))
);
create table public.marketplace_listing_review_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.user_card_flags(id) on delete set null,
  seller_user_id uuid references auth.users(id) on delete set null,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  decision text not null,
  previous_verification_status text not null,
  resulting_verification_status text not null,
  previous_listing_status text,
  resulting_listing_status text,
  internal_notes text,
  seller_message text,
  listing_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint marketplace_listing_review_events_decision_valid check (decision in ('approve','reject','request_more_evidence')),
  constraint marketplace_listing_review_events_verification_statuses_valid check (previous_verification_status in ('not_required','pending','verified','rejected') and resulting_verification_status in ('not_required','pending','verified','rejected')),
  constraint marketplace_listing_review_events_notes_length check (internal_notes is null or char_length(internal_notes) <= 2000),
  constraint marketplace_listing_review_events_seller_message_length check (seller_message is null or char_length(seller_message) <= 500)
);
create index marketplace_listing_publication_seller_updated_idx on public.marketplace_listing_publication_requests(seller_user_id, updated_at desc);
create index marketplace_inventory_reservation_source_idx on public.marketplace_inventory_reservations(seller_user_id, inventory_source_type, inventory_source_id, status);
create index marketplace_listing_transaction_events_request_idx on public.marketplace_listing_transaction_events(request_id, created_at);
create index marketplace_listing_transaction_events_seller_created_idx on public.marketplace_listing_transaction_events(seller_user_id, created_at desc);
create index marketplace_listing_review_events_listing_idx on public.marketplace_listing_review_events(listing_id, created_at desc);
create index marketplace_listing_review_events_reviewer_idx on public.marketplace_listing_review_events(reviewer_user_id, created_at desc);
create index marketplace_listing_review_events_seller_created_idx on public.marketplace_listing_review_events(seller_user_id, created_at desc);
alter table public.marketplace_listing_publication_requests enable row level security;
alter table public.marketplace_listing_publication_requests force row level security;
alter table public.marketplace_inventory_reservations enable row level security;
alter table public.marketplace_inventory_reservations force row level security;
alter table public.marketplace_listing_transaction_events enable row level security;
alter table public.marketplace_listing_transaction_events force row level security;
alter table public.marketplace_listing_review_events enable row level security;
alter table public.marketplace_listing_review_events force row level security;
revoke all on table public.marketplace_listing_publication_requests from public, anon, authenticated;
revoke all on table public.marketplace_inventory_reservations from public, anon, authenticated;
revoke all on table public.marketplace_listing_transaction_events from public, anon, authenticated;
revoke all on table public.marketplace_listing_review_events from public, anon, authenticated;
grant select, insert, update, delete on table public.marketplace_listing_publication_requests to service_role;
grant select, insert, update, delete on table public.marketplace_inventory_reservations to service_role;
grant select, insert on table public.marketplace_listing_transaction_events to service_role;
grant select, insert, update, delete on table public.marketplace_listing_review_events to service_role;
$foundation$;
  end if;
  if to_regclass('public.binders') is null or to_regclass('public.binder_cards') is null or to_regclass('public.user_card_variants') is null or to_regclass('public.seller_inventory_items') is null or to_regclass('public.marketplace_inventory_reservations') is null or to_regclass('public.marketplace_listing_publication_requests') is null or to_regclass('public.marketplace_listing_review_events') is null or to_regclass('public.marketplace_listing_transaction_events') is null then
    raise exception 'binder ownership reconciliation prerequisites are missing';
  end if;
  execute $recovered$
-- Recovered source: supabase/migrations/20260902120000_binder_ownership_lifecycle.sql
create table if not exists public.binder_ownership_mutation_requests (
  request_id uuid primary key,
  request_key text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  payload jsonb not null,
  payload_sha256 text not null,
  state text not null default 'pending',
  result jsonb null,
  error_code text null,
  error_message text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint binder_ownership_operation_valid check (
    operation in (
      'create_binder',
      'update_binder',
      'delete_binder',
      'add_cards',
      'set_card_owned',
      'update_card_quantity',
      'update_card_condition',
      'update_card_grading',
      'update_variant',
      'remove_card',
      'move_card'
    )
  ),
  constraint binder_ownership_state_valid check (
    state in (
      'pending',
      'conflict',
      'reservation_blocked',
      'reconciliation_required',
      'applied',
      'cancelled',
      'failed'
    )
  ),
  constraint binder_ownership_payload_sha_valid check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  )
);

alter table public.binder_ownership_mutation_requests enable row level security;

drop policy if exists "Users can read own binder mutation requests"
  on public.binder_ownership_mutation_requests;
create policy "Users can read own binder mutation requests"
  on public.binder_ownership_mutation_requests
  for select
  to authenticated
  using (owner_user_id = (select auth.uid()));

revoke all on table public.binder_ownership_mutation_requests from public, anon, authenticated;
grant select on table public.binder_ownership_mutation_requests to authenticated, service_role;

create or replace function public.guard_reserved_owned_variant_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved_quantity integer;
begin
  select coalesce(sum(reservation.quantity), 0)::integer
  into v_reserved_quantity
  from public.marketplace_inventory_reservations reservation
  where reservation.seller_user_id = old.user_id
    and reservation.inventory_source_type = 'owned_variant'
    and reservation.inventory_source_id = old.id::text
    and reservation.status in ('reserved', 'published');

  if v_reserved_quantity = 0 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'This owned card is reserved by an active marketplace listing.'
      using errcode = '40001';
  end if;

  if new.user_id is distinct from old.user_id
    or new.card_id is distinct from old.card_id
    or new.set_id is distinct from old.set_id
    or new.variant is distinct from old.variant
    or new.condition is distinct from old.condition
    or new.grade_company is distinct from old.grade_company
    or new.grade is distinct from old.grade then
    raise exception 'This card identity or condition is reserved by an active marketplace listing.'
      using errcode = '40001';
  end if;

  if new.quantity < v_reserved_quantity then
    raise exception 'Quantity cannot be reduced below the amount reserved by active marketplace listings.'
      using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_reserved_owned_variant_before_mutation
  on public.user_card_variants;
create trigger guard_reserved_owned_variant_before_mutation
before update or delete on public.user_card_variants
for each row execute function public.guard_reserved_owned_variant_mutation();

create or replace function public.guard_reserved_seller_inventory_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved_quantity integer;
begin
  select coalesce(sum(reservation.quantity), 0)::integer
  into v_reserved_quantity
  from public.marketplace_inventory_reservations reservation
  where reservation.seller_user_id = old.user_id
    and reservation.inventory_source_type = 'seller_inventory'
    and reservation.inventory_source_id = old.id::text
    and reservation.status in ('reserved', 'published');

  if v_reserved_quantity = 0 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'This seller inventory item is reserved by an active marketplace listing.'
      using errcode = '40001';
  end if;

  if new.user_id is distinct from old.user_id
    or new.card_id is distinct from old.card_id
    or new.set_id is distinct from old.set_id
    or new.condition is distinct from old.condition
    or coalesce(new.card_snapshot->>'variant', 'normal')
      is distinct from coalesce(old.card_snapshot->>'variant', 'normal')
    or nullif(new.card_snapshot->>'inventory_binder_id', '')
      is distinct from nullif(old.card_snapshot->>'inventory_binder_id', '') then
    raise exception 'This inventory identity, condition or binder is reserved by an active marketplace listing.'
      using errcode = '40001';
  end if;

  if new.quantity < v_reserved_quantity then
    raise exception 'Quantity cannot be reduced below the amount reserved by active marketplace listings.'
      using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_reserved_seller_inventory_before_mutation
  on public.seller_inventory_items;
create trigger guard_reserved_seller_inventory_before_mutation
before update or delete on public.seller_inventory_items
for each row execute function public.guard_reserved_seller_inventory_mutation();

create or replace function public.guard_reserved_binder_membership_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.marketplace_inventory_reservations reservation
    join public.marketplace_listing_publication_requests request
      on request.request_id = reservation.request_id
    where reservation.status in ('reserved', 'published')
      and request.inventory_snapshot->>'binderId' = old.binder_id::text
      and old.owned_card_variant_id is not null
      and reservation.inventory_source_type = 'owned_variant'
      and reservation.inventory_source_id = old.owned_card_variant_id::text
  ) and (
    tg_op = 'DELETE'
    or new.binder_id is distinct from old.binder_id
    or new.owned_card_variant_id is distinct from old.owned_card_variant_id
  ) then
    raise exception 'This binder membership is reserved by an active marketplace listing.'
      using errcode = '40001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists guard_reserved_binder_membership_before_mutation
  on public.binder_cards;
create trigger guard_reserved_binder_membership_before_mutation
before update or delete on public.binder_cards
for each row execute function public.guard_reserved_binder_membership_mutation();

create or replace function public.guard_reserved_binder_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.marketplace_inventory_reservations reservation
    where reservation.seller_user_id = old.user_id
      and reservation.status in ('reserved', 'published')
      and (
        (
          reservation.inventory_source_type = 'owned_variant'
          and reservation.inventory_source_id in (
            select card.owned_card_variant_id::text
            from public.binder_cards card
            where card.binder_id = old.id
              and card.owned_card_variant_id is not null
          )
        )
        or (
          reservation.inventory_source_type = 'seller_inventory'
          and reservation.inventory_source_id in (
            select inventory.id::text
            from public.seller_inventory_items inventory
            where inventory.user_id = old.user_id
              and inventory.card_snapshot->>'inventory_binder_id' = old.id::text
          )
        )
      )
  ) then
    raise exception 'This binder contains inventory reserved by an active marketplace listing.'
      using errcode = '40001';
  end if;
  return old;
end;
$$;

drop trigger if exists guard_reserved_binder_before_delete on public.binders;
create trigger guard_reserved_binder_before_delete
before delete on public.binders
for each row execute function public.guard_reserved_binder_delete();

create or replace function public.apply_binder_ownership_mutation_v1(
  p_request_id uuid,
  p_request_key text,
  p_operation text,
  p_payload jsonb,
  p_payload_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.binder_ownership_mutation_requests%rowtype;
  v_binder public.binders%rowtype;
  v_target_binder public.binders%rowtype;
  v_card public.binder_cards%rowtype;
  v_variant public.user_card_variants%rowtype;
  v_item jsonb;
  v_result jsonb := '{}'::jsonb;
  v_state text;
  v_error_code text;
  v_error_message text;
  v_quantity integer;
  v_owned boolean;
  v_variant_count integer;
begin
  if v_user_id is null then
    raise exception 'Sign in before changing a binder.' using errcode = '42501';
  end if;
  if p_request_id is null
    or p_request_key !~ '^binder:[0-9a-f]{64}$'
    or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_operation not in (
      'create_binder',
      'update_binder',
      'delete_binder',
      'add_cards',
      'set_card_owned',
      'update_card_quantity',
      'update_card_condition',
      'update_card_grading',
      'update_variant',
      'remove_card',
      'move_card'
    )
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Binder mutation identity or payload is invalid.' using errcode = '22023';
  end if;

  insert into public.binder_ownership_mutation_requests (
    request_id,
    request_key,
    owner_user_id,
    operation,
    payload,
    payload_sha256,
    state
  ) values (
    p_request_id,
    p_request_key,
    v_user_id,
    p_operation,
    p_payload,
    p_payload_sha256,
    'pending'
  )
  on conflict (request_id) do nothing;

  select request.* into v_request
  from public.binder_ownership_mutation_requests request
  where request.request_id = p_request_id
  for update;

  if not found
    or v_request.owner_user_id <> v_user_id
    or v_request.request_key <> p_request_key
    or v_request.operation <> p_operation
    or v_request.payload <> p_payload
    or v_request.payload_sha256 <> p_payload_sha256 then
    raise exception 'Binder request identity changed during retry.' using errcode = '40001';
  end if;

  if v_request.state = 'applied' then
    return jsonb_build_object(
      'requestId', v_request.request_id,
      'requestKey', v_request.request_key,
      'state', 'applied',
      'replayed', true,
      'result', coalesce(v_request.result, '{}'::jsonb),
      'errorCode', null,
      'message', null
    );
  end if;

  begin
    if p_operation = 'create_binder' then
      if nullif(trim(p_payload->>'name'), '') is null
        or char_length(trim(p_payload->>'name')) > 80
        or p_payload->>'type' not in ('official', 'custom') then
        raise exception 'Binder name or type is invalid.' using errcode = '22023';
      end if;
      insert into public.binders (
        id,
        user_id,
        name,
        color,
        cover_key,
        type,
        source_set_id,
        source_set_logo_url,
        source_set_symbol_url,
        source_set_cover_url,
        source_set_display_name,
        source_set_local_name,
        source_set_english_display_name,
        language,
        edition,
        default_condition,
        card_mode
      ) values (
        (p_payload->>'binderId')::uuid,
        v_user_id,
        trim(p_payload->>'name'),
        coalesce(nullif(p_payload->>'color', ''), '#2563eb'),
        nullif(p_payload->>'coverKey', ''),
        p_payload->>'type',
        nullif(p_payload->>'sourceSetId', ''),
        nullif(p_payload->>'sourceSetLogoUrl', ''),
        nullif(p_payload->>'sourceSetSymbolUrl', ''),
        nullif(p_payload->>'sourceSetCoverUrl', ''),
        nullif(p_payload->>'sourceSetDisplayName', ''),
        nullif(p_payload->>'sourceSetLocalName', ''),
        nullif(p_payload->>'sourceSetEnglishDisplayName', ''),
        coalesce(nullif(p_payload->>'language', ''), 'en'),
        nullif(p_payload->>'edition', ''),
        coalesce(nullif(p_payload->>'defaultCondition', ''), 'Near Mint'),
        coalesce(nullif(p_payload->>'cardMode', ''), 'raw')
      )
      returning * into v_binder;
      v_result := jsonb_build_object('binder', to_jsonb(v_binder));

    elsif p_operation = 'update_binder' then
      select binder.* into v_binder
      from public.binders binder
      where binder.id = (p_payload->>'binderId')::uuid
        and binder.user_id = v_user_id
      for update;
      if not found then
        raise exception 'Binder was not found or changed ownership.' using errcode = '40001';
      end if;
      if nullif(trim(p_payload->>'name'), '') is null
        or char_length(trim(p_payload->>'name')) > 80 then
        raise exception 'Binder name is invalid.' using errcode = '22023';
      end if;
      update public.binders binder
      set
        name = trim(p_payload->>'name'),
        color = coalesce(nullif(p_payload->>'color', ''), binder.color),
        cover_key = nullif(p_payload->>'coverKey', ''),
        language = coalesce(nullif(p_payload->>'language', ''), binder.language),
        edition = nullif(p_payload->>'edition', ''),
        default_condition = coalesce(nullif(p_payload->>'defaultCondition', ''), binder.default_condition),
        card_mode = coalesce(nullif(p_payload->>'cardMode', ''), binder.card_mode)
      where binder.id = v_binder.id
      returning * into v_binder;
      v_result := jsonb_build_object('binder', to_jsonb(v_binder));

    elsif p_operation = 'delete_binder' then
      select binder.* into v_binder
      from public.binders binder
      where binder.id = (p_payload->>'binderId')::uuid
        and binder.user_id = v_user_id
      for update;
      if not found then
        raise exception 'Binder was not found or already deleted.' using errcode = '40001';
      end if;
      delete from public.binders binder where binder.id = v_binder.id;
      v_result := jsonb_build_object('binderId', v_binder.id, 'deleted', true);

    elsif p_operation = 'add_cards' then
      select binder.* into v_binder
      from public.binders binder
      where binder.id = (p_payload->>'binderId')::uuid
        and binder.user_id = v_user_id
      for update;
      if not found then
        raise exception 'Target binder was not found.' using errcode = '40001';
      end if;
      if jsonb_typeof(p_payload->'cards') <> 'array' then
        raise exception 'Binder card batch is invalid.' using errcode = '22023';
      end if;
      for v_item in select value from jsonb_array_elements(p_payload->'cards')
      loop
        if nullif(v_item->>'cardId', '') is null or nullif(v_item->>'setId', '') is null then
          raise exception 'Card identity is incomplete.' using errcode = '22023';
        end if;
        if not exists (
          select 1
          from public.binder_cards card
          where card.binder_id = v_binder.id
            and card.card_id = v_item->>'cardId'
            and card.set_id = v_item->>'setId'
            and coalesce(card.language, 'en') = coalesce(nullif(v_item->>'language', ''), 'en')
        ) then
          insert into public.binder_cards (
            binder_id,
            card_id,
            set_id,
            language,
            card_name,
            image_url,
            set_name,
            slot_order,
            owned,
            owned_quantity,
            condition,
            grade_company,
            grade,
            notes
          ) values (
            v_binder.id,
            v_item->>'cardId',
            v_item->>'setId',
            coalesce(nullif(v_item->>'language', ''), coalesce(v_binder.language, 'en')),
            nullif(v_item->>'cardName', ''),
            nullif(v_item->>'imageUrl', ''),
            nullif(v_item->>'setName', ''),
            coalesce((v_item->>'slotOrder')::integer, 0),
            false,
            1,
            coalesce(nullif(v_item->>'condition', ''), coalesce(v_binder.default_condition, 'Near Mint')),
            nullif(v_item->>'gradeCompany', ''),
            nullif(v_item->>'grade', ''),
            ''
          );
        end if;
      end loop;
      v_result := jsonb_build_object('binderId', v_binder.id, 'cardsApplied', jsonb_array_length(p_payload->'cards'));

    elsif p_operation in (
      'set_card_owned',
      'update_card_quantity',
      'update_card_condition',
      'update_card_grading'
    ) then
      if nullif(p_payload->>'binderCardId', '') is not null
        and p_payload->>'binderCardId' not like 'virtual:%' then
        select card.* into v_card
        from public.binder_cards card
        join public.binders binder on binder.id = card.binder_id
        where card.id = (p_payload->>'binderCardId')::uuid
          and binder.user_id = v_user_id
        for update of card;
      else
        select binder.* into v_binder
        from public.binders binder
        where binder.id = (p_payload->>'binderId')::uuid
          and binder.user_id = v_user_id
        for update;
        if not found then
          raise exception 'Binder was not found.' using errcode = '40001';
        end if;
        select card.* into v_card
        from public.binder_cards card
        where card.binder_id = v_binder.id
          and card.card_id = p_payload->>'cardId'
          and card.set_id = p_payload->>'setId'
          and coalesce(card.language, 'en') = coalesce(nullif(p_payload->>'language', ''), 'en')
        limit 1
        for update;
        if not found then
          insert into public.binder_cards (
            binder_id, card_id, set_id, language, card_name, card_number, image_url,
            set_name, slot_order, owned, owned_quantity, condition, grade_company, grade, notes
          ) values (
            v_binder.id,
            p_payload->>'cardId',
            p_payload->>'setId',
            coalesce(nullif(p_payload->>'language', ''), 'en'),
            nullif(p_payload->>'cardName', ''),
            nullif(p_payload->>'cardNumber', ''),
            nullif(p_payload->>'imageUrl', ''),
            nullif(p_payload->>'setName', ''),
            coalesce((p_payload->>'slotOrder')::integer, 0),
            false,
            1,
            coalesce(nullif(p_payload->>'condition', ''), 'Near Mint'),
            nullif(p_payload->>'gradeCompany', ''),
            nullif(p_payload->>'grade', ''),
            ''
          )
          returning * into v_card;
        end if;
      end if;
      if v_card.id is null then
        raise exception 'Binder card was not found or changed.' using errcode = '40001';
      end if;

      if v_card.owned_card_variant_id is not null then
        select variant.* into v_variant
        from public.user_card_variants variant
        where variant.id = v_card.owned_card_variant_id
          and variant.user_id = v_user_id
        for update;
      end if;

      if p_operation = 'set_card_owned' then
        v_owned := coalesce((p_payload->>'owned')::boolean, false);
        v_quantity := greatest(1, least(999, coalesce((p_payload->>'ownedQuantity')::integer, 1)));
        if v_owned then
          if v_variant.id is null then
            insert into public.user_card_variants (
              user_id, card_id, set_id, variant, condition, grade_company, grade, quantity
            ) values (
              v_user_id,
              v_card.card_id,
              v_card.set_id,
              'normal',
              coalesce(nullif(p_payload->>'condition', ''), coalesce(v_card.condition, 'Near Mint')),
              coalesce(p_payload->>'gradeCompany', coalesce(v_card.grade_company, '')),
              coalesce(p_payload->>'grade', coalesce(v_card.grade, '')),
              v_quantity
            )
            on conflict (user_id, card_id, set_id, variant, condition, grade_company, grade)
            do update set
              quantity = greatest(public.user_card_variants.quantity, excluded.quantity),
              updated_at = timezone('utc', now())
            returning * into v_variant;
          else
            update public.user_card_variants variant
            set quantity = v_quantity, updated_at = timezone('utc', now())
            where variant.id = v_variant.id
            returning * into v_variant;
          end if;
          update public.binder_cards card
          set
            owned = true,
            owned_quantity = v_variant.quantity,
            owned_card_variant_id = v_variant.id,
            condition = v_variant.condition,
            grade_company = nullif(v_variant.grade_company, ''),
            grade = nullif(v_variant.grade, '')
          from public.binders binder
          where binder.id = card.binder_id
            and binder.user_id = v_user_id
            and card.card_id = v_variant.card_id
            and card.set_id = v_variant.set_id;
        else
          if v_variant.id is not null then
            update public.binder_cards card
            set owned = false, owned_quantity = 1, owned_card_variant_id = null
            from public.binders binder
            where binder.id = card.binder_id
              and binder.user_id = v_user_id
              and card.owned_card_variant_id = v_variant.id;
            delete from public.user_card_variants variant where variant.id = v_variant.id;
          else
            update public.binder_cards card
            set owned = false, owned_quantity = 1, owned_card_variant_id = null
            where card.id = v_card.id;
          end if;
        end if;

      elsif p_operation = 'update_card_quantity' then
        v_quantity := (p_payload->>'quantity')::integer;
        if v_quantity < 1 or v_quantity > 999 or v_variant.id is null then
          raise exception 'Card quantity or physical ownership identity is invalid.' using errcode = '22023';
        end if;
        update public.user_card_variants variant
        set quantity = v_quantity, updated_at = timezone('utc', now())
        where variant.id = v_variant.id
        returning * into v_variant;
        update public.binder_cards card
        set owned = true, owned_quantity = v_quantity
        where card.owned_card_variant_id = v_variant.id;

      elsif p_operation = 'update_card_condition' then
        if nullif(trim(p_payload->>'condition'), '') is null or v_variant.id is null then
          raise exception 'Card condition or physical ownership identity is invalid.' using errcode = '22023';
        end if;
        update public.user_card_variants variant
        set condition = trim(p_payload->>'condition'), updated_at = timezone('utc', now())
        where variant.id = v_variant.id
        returning * into v_variant;
        update public.binder_cards card
        set condition = v_variant.condition
        where card.owned_card_variant_id = v_variant.id;

      elsif p_operation = 'update_card_grading' then
        if v_variant.id is null then
          raise exception 'Physical ownership identity is missing.' using errcode = '22023';
        end if;
        update public.user_card_variants variant
        set
          grade_company = coalesce(p_payload->>'gradeCompany', ''),
          grade = coalesce(p_payload->>'grade', ''),
          updated_at = timezone('utc', now())
        where variant.id = v_variant.id
        returning * into v_variant;
        update public.binder_cards card
        set
          grade_company = nullif(v_variant.grade_company, ''),
          grade = nullif(v_variant.grade, '')
        where card.owned_card_variant_id = v_variant.id;
      end if;
      v_result := jsonb_build_object(
        'binderCardId', v_card.id,
        'owned', case when p_operation = 'set_card_owned' then v_owned else true end,
        'quantity', case when v_variant.id is null then 0 else v_variant.quantity end
      );

    elsif p_operation = 'update_variant' then
      select count(*)::integer into v_variant_count
      from public.user_card_variants variant
      where variant.user_id = v_user_id
        and variant.card_id = p_payload->>'cardId'
        and variant.set_id = p_payload->>'setId'
        and variant.variant = p_payload->>'variant';
      if v_variant_count > 1 then
        raise exception 'More than one owned variant matches this request.' using errcode = '40001';
      end if;
      select variant.* into v_variant
      from public.user_card_variants variant
      where variant.user_id = v_user_id
        and variant.card_id = p_payload->>'cardId'
        and variant.set_id = p_payload->>'setId'
        and variant.variant = p_payload->>'variant'
      limit 1
      for update;
      v_quantity := greatest(0, least(999, coalesce((p_payload->>'quantity')::integer, 0)));
      if v_quantity = 0 then
        if v_variant.id is not null then
          update public.binder_cards card
          set owned_card_variant_id = null
          where card.owned_card_variant_id = v_variant.id;
          delete from public.user_card_variants variant where variant.id = v_variant.id;
        end if;
      elsif v_variant.id is null then
        insert into public.user_card_variants (
          user_id, card_id, set_id, variant, condition, grade_company, grade, quantity
        ) values (
          v_user_id,
          p_payload->>'cardId',
          p_payload->>'setId',
          p_payload->>'variant',
          coalesce(nullif(p_payload->>'condition', ''), 'Near Mint'),
          coalesce(p_payload->>'gradeCompany', ''),
          coalesce(p_payload->>'grade', ''),
          v_quantity
        )
        returning * into v_variant;
      else
        update public.user_card_variants variant
        set quantity = v_quantity, updated_at = timezone('utc', now())
        where variant.id = v_variant.id
        returning * into v_variant;
      end if;
      update public.binder_cards card
      set owned = exists (
        select 1
        from public.user_card_variants variant
        where variant.user_id = v_user_id
          and variant.card_id = card.card_id
          and variant.set_id = card.set_id
          and variant.quantity > 0
      )
      from public.binders binder
      where binder.id = card.binder_id
        and binder.user_id = v_user_id
        and card.card_id = p_payload->>'cardId'
        and card.set_id = p_payload->>'setId';
      v_result := jsonb_build_object('cardId', p_payload->>'cardId', 'variant', p_payload->>'variant', 'quantity', v_quantity);

    elsif p_operation in ('remove_card', 'move_card') then
      select card.* into v_card
      from public.binder_cards card
      join public.binders binder on binder.id = card.binder_id
      where card.id = (p_payload->>'binderCardId')::uuid
        and card.binder_id = (p_payload->>'binderId')::uuid
        and binder.user_id = v_user_id
      for update of card;
      if not found then
        raise exception 'Binder card was not found or changed.' using errcode = '40001';
      end if;
      if p_operation = 'remove_card' then
        delete from public.binder_cards card where card.id = v_card.id;
        v_result := jsonb_build_object('binderCardId', v_card.id, 'removed', true);
      else
        select binder.* into v_target_binder
        from public.binders binder
        where binder.id = (p_payload->>'targetBinderId')::uuid
          and binder.user_id = v_user_id
        for update;
        if not found then
          raise exception 'Target binder was not found.' using errcode = '40001';
        end if;
        if exists (
          select 1
          from public.binder_cards card
          where card.binder_id = v_target_binder.id
            and card.card_id = v_card.card_id
            and card.set_id = v_card.set_id
            and coalesce(card.language, 'en') = coalesce(v_card.language, 'en')
        ) then
          raise exception 'The target binder already contains this exact card.' using errcode = '40001';
        end if;
        update public.binder_cards card
        set binder_id = v_target_binder.id
        where card.id = v_card.id;
        v_result := jsonb_build_object(
          'binderCardId', v_card.id,
          'sourceBinderId', v_card.binder_id,
          'targetBinderId', v_target_binder.id
        );
      end if;
    end if;

    update public.binder_ownership_mutation_requests request
    set
      state = 'applied',
      result = v_result,
      error_code = null,
      error_message = null,
      updated_at = timezone('utc', now())
    where request.request_id = p_request_id;

    return jsonb_build_object(
      'requestId', p_request_id,
      'requestKey', p_request_key,
      'state', 'applied',
      'replayed', false,
      'result', v_result,
      'errorCode', null,
      'message', null
    );
  exception when others then
    v_error_message := sqlerrm;
    if v_error_message ilike '%reserv%'
      or v_error_message ilike '%active marketplace listing%' then
      v_state := 'reservation_blocked';
      v_error_code := 'BINDER_RESERVATION_BLOCKED';
    elsif sqlstate = '40001'
      or v_error_message ilike '%changed%'
      or v_error_message ilike '%already contains%'
      or v_error_message ilike '%more than one%' then
      v_state := 'conflict';
      v_error_code := 'BINDER_CONFLICT';
    else
      v_state := 'failed';
      v_error_code := 'BINDER_MUTATION_FAILED';
    end if;
    update public.binder_ownership_mutation_requests request
    set
      state = v_state,
      error_code = v_error_code,
      error_message = v_error_message,
      updated_at = timezone('utc', now())
    where request.request_id = p_request_id;
    return jsonb_build_object(
      'requestId', p_request_id,
      'requestKey', p_request_key,
      'state', v_state,
      'replayed', false,
      'result', '{}'::jsonb,
      'errorCode', v_error_code,
      'message', v_error_message
    );
  end;
end;
$$;

revoke all on function public.apply_binder_ownership_mutation_v1(uuid, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.apply_binder_ownership_mutation_v1(uuid, text, text, jsonb, text)
  to authenticated, service_role;

create or replace function public.binder_ownership_lifecycle_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before checking binder ownership readiness.'
      using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ready', true,
    'schemaVersion', 1,
    'idempotentMutations', true,
    'reservationGuards', true
  );
end;
$$;

revoke all on function public.binder_ownership_lifecycle_readiness_v1()
  from public, anon, authenticated;
grant execute on function public.binder_ownership_lifecycle_readiness_v1()
  to authenticated, service_role;

comment on table public.binder_ownership_mutation_requests is
  'Private idempotency and recovery journal for server-authoritative binder ownership changes.';
comment on function public.apply_binder_ownership_mutation_v1(uuid, text, text, jsonb, text) is
  'Applies one authenticated binder ownership mutation with stable retry identity and verified result.';
comment on function public.binder_ownership_lifecycle_readiness_v1() is
  'Read-only capability gate used before enabling binder ownership lifecycle v1.';


-- Recovered source: supabase/migrations/20260902164829_optimize_binder_marketplace_transaction_access.sql
-- Optimize access paths introduced by the marketplace and binder lifecycle migrations.

drop policy if exists "Users can read own binder mutation requests"
  on public.binder_ownership_mutation_requests;

create policy "Users can read own binder mutation requests"
  on public.binder_ownership_mutation_requests
  for select
  to authenticated
  using (owner_user_id = (select auth.uid()));

create index if not exists binder_ownership_mutation_requests_owner_updated_idx
  on public.binder_ownership_mutation_requests (owner_user_id, updated_at desc);

create index if not exists marketplace_listing_review_events_seller_created_idx
  on public.marketplace_listing_review_events (seller_user_id, created_at desc);

create index if not exists marketplace_listing_transaction_events_seller_created_idx
  on public.marketplace_listing_transaction_events (seller_user_id, created_at desc);

alter function public.binder_ownership_lifecycle_readiness_v1()
  security invoker;


-- Recovered source: supabase/migrations/20260902173000_binder_conflict_preconditions.sql
alter table public.binders
  add column if not exists lifecycle_version bigint not null default 1 check (lifecycle_version > 0);
alter table public.binder_cards
  add column if not exists lifecycle_version bigint not null default 1 check (lifecycle_version > 0);
alter table public.user_card_variants
  add column if not exists lifecycle_version bigint not null default 1 check (lifecycle_version > 0);

create or replace function public.bump_binder_lifecycle_version_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.lifecycle_version := old.lifecycle_version + 1;
  return new;
end;
$$;

revoke all on function public.bump_binder_lifecycle_version_v1() from public, anon, authenticated;

drop trigger if exists bump_binder_lifecycle_version_v1 on public.binders;
create trigger bump_binder_lifecycle_version_v1
before update on public.binders
for each row execute function public.bump_binder_lifecycle_version_v1();

drop trigger if exists bump_binder_card_lifecycle_version_v1 on public.binder_cards;
create trigger bump_binder_card_lifecycle_version_v1
before update on public.binder_cards
for each row execute function public.bump_binder_lifecycle_version_v1();

drop trigger if exists bump_owned_variant_lifecycle_version_v1 on public.user_card_variants;
create trigger bump_owned_variant_lifecycle_version_v1
before update on public.user_card_variants
for each row execute function public.bump_binder_lifecycle_version_v1();

create table if not exists public.binder_lifecycle_policy (
  singleton boolean primary key default true check (singleton),
  enforce_preconditions boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.binder_lifecycle_policy (singleton, enforce_preconditions)
values (true, false)
on conflict (singleton) do nothing;

alter table public.binder_lifecycle_policy enable row level security;
revoke all on table public.binder_lifecycle_policy from public, anon, authenticated;

create or replace function public.binder_conflict_detail_v1(
  p_subject_type text,
  p_subject text,
  p_binder_name text,
  p_field text,
  p_expected text,
  p_current text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'subjectType', p_subject_type,
    'subject', left(coalesce(nullif(p_subject, ''), 'Collection item'), 120),
    'binderName', left(coalesce(p_binder_name, ''), 80),
    'field', left(coalesce(nullif(p_field, ''), 'server version'), 48),
    'expected', left(coalesce(p_expected, 'missing'), 120),
    'current', left(coalesce(p_current, 'missing'), 120)
  );
$$;

revoke all on function public.binder_conflict_detail_v1(text, text, text, text, text, text)
from public, anon, authenticated;

create or replace function public.check_binder_mutation_precondition_v1(
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_expected jsonb := p_payload->'expected';
  v_binder public.binders%rowtype;
  v_card public.binder_cards%rowtype;
  v_variant public.user_card_variants%rowtype;
  v_subject text;
  v_field text;
  v_before text;
  v_after text;
  v_expected_version bigint;
begin
  if v_user_id is null then
    raise exception 'Sign in before changing a binder.' using errcode = '42501';
  end if;
  if p_operation = 'create_binder' then return null; end if;
  if jsonb_typeof(v_expected) <> 'object' then
    return public.binder_conflict_detail_v1(
      'request', 'This binder change', '', 'review version', 'missing', 'required'
    );
  end if;

  if p_operation in ('update_binder', 'delete_binder', 'add_cards') then
    if coalesce(p_payload->>'binderId', '') !~ '^[0-9a-fA-F-]{36}$' then
      return public.binder_conflict_detail_v1('binder', 'Binder', '', 'identity', 'valid binder', 'invalid');
    end if;
    select binder.* into v_binder
    from public.binders binder
    where binder.id = (p_payload->>'binderId')::uuid and binder.user_id = v_user_id
    for update;
    if not found then
      return public.binder_conflict_detail_v1(
        'binder', coalesce(v_expected->>'binderName', 'Binder'), '', 'existence', 'present', 'missing or inaccessible'
      );
    end if;
    v_expected_version := case
      when coalesce(v_expected->>'binderVersion', '') ~ '^[0-9]+$' then (v_expected->>'binderVersion')::bigint
      else -1
    end;
    if v_expected_version <> v_binder.lifecycle_version then
      v_field := 'server version';
      v_before := v_expected_version::text;
      v_after := v_binder.lifecycle_version::text;
      if p_operation = 'update_binder' then
        if coalesce(v_expected->>'name', '') is distinct from coalesce(v_binder.name, '') then
          v_field := 'name'; v_before := v_expected->>'name'; v_after := v_binder.name;
        elsif coalesce(v_expected->>'color', '') is distinct from coalesce(v_binder.color, '') then
          v_field := 'colour'; v_before := v_expected->>'color'; v_after := v_binder.color;
        elsif coalesce(v_expected->>'coverKey', '') is distinct from coalesce(v_binder.cover_key, '') then
          v_field := 'cover'; v_before := v_expected->>'coverKey'; v_after := v_binder.cover_key;
        elsif coalesce(v_expected->>'language', '') is distinct from coalesce(v_binder.language, '') then
          v_field := 'language'; v_before := v_expected->>'language'; v_after := v_binder.language;
        elsif coalesce(v_expected->>'edition', '') is distinct from coalesce(v_binder.edition, '') then
          v_field := 'edition'; v_before := v_expected->>'edition'; v_after := v_binder.edition;
        elsif coalesce(v_expected->>'defaultCondition', '') is distinct from coalesce(v_binder.default_condition, '') then
          v_field := 'default condition'; v_before := v_expected->>'defaultCondition'; v_after := v_binder.default_condition;
        elsif coalesce(v_expected->>'cardMode', '') is distinct from coalesce(v_binder.card_mode, '') then
          v_field := 'card mode'; v_before := v_expected->>'cardMode'; v_after := v_binder.card_mode;
        end if;
      end if;
      return public.binder_conflict_detail_v1(
        'binder', format('Binder "%s"', coalesce(v_binder.name, v_expected->>'binderName', 'Unnamed')),
        v_binder.name, v_field, v_before, v_after
      );
    end if;
    if p_operation = 'add_cards' and exists (
      select 1
      from jsonb_array_elements(coalesce(p_payload->'cards', '[]'::jsonb)) item
      join public.binder_cards card
        on card.binder_id = v_binder.id
       and card.card_id = item->>'cardId'
       and card.set_id = item->>'setId'
       and coalesce(card.language, 'en') = coalesce(nullif(item->>'language', ''), 'en')
    ) then
      return public.binder_conflict_detail_v1(
        'binder', format('Binder "%s"', v_binder.name), v_binder.name,
        'card membership', 'card absent', 'exact card already present'
      );
    end if;
    return null;
  end if;

  if p_operation in (
    'set_card_owned', 'update_card_quantity', 'update_card_condition',
    'update_card_grading', 'remove_card', 'move_card'
  ) then
    if coalesce(p_payload->>'binderCardId', '') ~ '^[0-9a-fA-F-]{36}$' then
      select card.* into v_card
      from public.binder_cards card
      join public.binders binder on binder.id = card.binder_id
      where card.id = (p_payload->>'binderCardId')::uuid and binder.user_id = v_user_id
      for update of card;
    elsif coalesce(p_payload->>'binderId', '') ~ '^[0-9a-fA-F-]{36}$' then
      select card.* into v_card
      from public.binder_cards card
      join public.binders binder on binder.id = card.binder_id
      where binder.id = (p_payload->>'binderId')::uuid
        and binder.user_id = v_user_id
        and card.card_id = p_payload->>'cardId'
        and card.set_id = p_payload->>'setId'
        and coalesce(card.language, 'en') = coalesce(nullif(p_payload->>'language', ''), 'en')
      limit 1
      for update of card;
    end if;

    if v_card.id is null then
      v_expected_version := case
        when coalesce(v_expected->>'cardVersion', '') ~ '^[0-9]+$' then (v_expected->>'cardVersion')::bigint
        else -1
      end;
      if p_operation in ('set_card_owned', 'update_card_quantity', 'update_card_condition', 'update_card_grading')
        and coalesce(p_payload->>'binderCardId', '') like 'virtual:%'
        and v_expected_version = 0 then
        return null;
      end if;
      return public.binder_conflict_detail_v1(
        'card', format('Card "%s"', coalesce(v_expected->>'cardName', v_expected->>'cardId', 'Unknown')),
        coalesce(v_expected->>'binderName', ''), 'existence', 'present', 'missing or moved'
      );
    end if;

    select binder.* into v_binder
    from public.binders binder
    where binder.id = v_card.binder_id and binder.user_id = v_user_id;
    v_subject := format(
      'Card "%s" in binder "%s"',
      coalesce(v_card.card_name, v_expected->>'cardName', v_card.card_id),
      coalesce(v_binder.name, v_expected->>'binderName', 'Unnamed')
    );

    if p_operation = 'move_card' then
      if coalesce(v_expected->>'cardId', '') is distinct from coalesce(v_card.card_id, '') then
        return public.binder_conflict_detail_v1('card', v_subject, v_binder.name, 'card identity', v_expected->>'cardId', v_card.card_id);
      elsif coalesce(v_expected->>'setId', '') is distinct from coalesce(v_card.set_id, '') then
        return public.binder_conflict_detail_v1('card', v_subject, v_binder.name, 'set identity', v_expected->>'setId', v_card.set_id);
      elsif coalesce(v_expected->>'language', 'en') is distinct from coalesce(v_card.language, 'en') then
        return public.binder_conflict_detail_v1('card', v_subject, v_binder.name, 'language', v_expected->>'language', v_card.language);
      elsif coalesce(v_expected->>'ownedCardVariantId', '') is distinct from coalesce(v_card.owned_card_variant_id::text, '') then
        return public.binder_conflict_detail_v1('card', v_subject, v_binder.name, 'physical ownership identity', v_expected->>'ownedCardVariantId', v_card.owned_card_variant_id::text);
      end if;
      return null;
    end if;

    v_expected_version := case
      when coalesce(v_expected->>'cardVersion', '') ~ '^[0-9]+$' then (v_expected->>'cardVersion')::bigint
      else -1
    end;
    if v_expected_version <> v_card.lifecycle_version then
      v_field := 'server version'; v_before := v_expected_version::text; v_after := v_card.lifecycle_version::text;
      if coalesce(v_expected->>'owned', 'false')::boolean is distinct from coalesce(v_card.owned, false) then
        v_field := 'owned status'; v_before := v_expected->>'owned'; v_after := v_card.owned::text;
      elsif coalesce(v_expected->>'quantity', '0')::integer is distinct from coalesce(v_card.owned_quantity, 0) then
        v_field := 'quantity'; v_before := v_expected->>'quantity'; v_after := v_card.owned_quantity::text;
      elsif coalesce(v_expected->>'condition', '') is distinct from coalesce(v_card.condition, '') then
        v_field := 'condition'; v_before := v_expected->>'condition'; v_after := v_card.condition;
      elsif coalesce(v_expected->>'gradeCompany', '') is distinct from coalesce(v_card.grade_company, '') then
        v_field := 'grading company'; v_before := v_expected->>'gradeCompany'; v_after := v_card.grade_company;
      elsif coalesce(v_expected->>'grade', '') is distinct from coalesce(v_card.grade, '') then
        v_field := 'grade'; v_before := v_expected->>'grade'; v_after := v_card.grade;
      end if;
      return public.binder_conflict_detail_v1('card', v_subject, v_binder.name, v_field, v_before, v_after);
    end if;
    return null;
  end if;

  if p_operation = 'update_variant' then
    select variant.* into v_variant
    from public.user_card_variants variant
    where variant.user_id = v_user_id
      and variant.card_id = p_payload->>'cardId'
      and variant.set_id = p_payload->>'setId'
      and variant.variant = p_payload->>'variant'
    limit 1
    for update;
    v_subject := format('Card "%s" variant "%s"',
      coalesce(v_expected->>'cardName', p_payload->>'cardId', 'Unknown'), p_payload->>'variant');
    if coalesce(v_expected->>'variantQuantity', '0')::integer is distinct from coalesce(v_variant.quantity, 0) then
      return public.binder_conflict_detail_v1('variant', v_subject, coalesce(v_expected->>'binderName', ''),
        'quantity', v_expected->>'variantQuantity', coalesce(v_variant.quantity, 0)::text);
    elsif v_variant.id is not null
      and coalesce(v_expected->>'condition', '') is distinct from coalesce(v_variant.condition, '') then
      return public.binder_conflict_detail_v1('variant', v_subject, coalesce(v_expected->>'binderName', ''),
        'condition', v_expected->>'condition', v_variant.condition);
    elsif v_variant.id is not null
      and coalesce(v_expected->>'gradeCompany', '') is distinct from coalesce(v_variant.grade_company, '') then
      return public.binder_conflict_detail_v1('variant', v_subject, coalesce(v_expected->>'binderName', ''),
        'grading company', v_expected->>'gradeCompany', v_variant.grade_company);
    elsif v_variant.id is not null
      and coalesce(v_expected->>'grade', '') is distinct from coalesce(v_variant.grade, '') then
      return public.binder_conflict_detail_v1('variant', v_subject, coalesce(v_expected->>'binderName', ''),
        'grade', v_expected->>'grade', v_variant.grade);
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.check_binder_mutation_precondition_v1(text, jsonb)
from public, anon, authenticated;

alter function public.apply_binder_ownership_mutation_v1(uuid, text, text, jsonb, text)
  rename to apply_binder_ownership_mutation_v1_unversioned;

revoke all on function public.apply_binder_ownership_mutation_v1_unversioned(uuid, text, text, jsonb, text)
from public, anon, authenticated;

create function public.apply_binder_ownership_mutation_v1(
  p_request_id uuid,
  p_request_key text,
  p_operation text,
  p_payload jsonb,
  p_payload_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_existing public.binder_ownership_mutation_requests%rowtype;
  v_conflict jsonb;
  v_message text;
  v_enforce boolean := false;
begin
  if v_user_id is null then
    raise exception 'Sign in before changing a binder.' using errcode = '42501';
  end if;

  select request.* into v_existing
  from public.binder_ownership_mutation_requests request
  where request.request_id = p_request_id
  for update;
  if found then
    if v_existing.owner_user_id <> v_user_id
      or v_existing.request_key <> p_request_key
      or v_existing.operation <> p_operation
      or v_existing.payload <> p_payload
      or v_existing.payload_sha256 <> p_payload_sha256 then
      raise exception 'Binder request identity changed during retry.' using errcode = '40001';
    end if;
    if v_existing.state <> 'pending' then
      return jsonb_build_object(
        'requestId', v_existing.request_id,
        'requestKey', v_existing.request_key,
        'state', v_existing.state,
        'replayed', true,
        'result', coalesce(v_existing.result, '{}'::jsonb),
        'errorCode', v_existing.error_code,
        'message', v_existing.error_message
      );
    end if;
  end if;

  select policy.enforce_preconditions into v_enforce
  from public.binder_lifecycle_policy policy
  where policy.singleton = true;
  v_enforce := coalesce(v_enforce, false)
    or coalesce(p_payload->>'preconditionSchemaVersion', '') = '1';

  if v_enforce and p_operation <> 'create_binder' then
    v_conflict := public.check_binder_mutation_precondition_v1(p_operation, p_payload);
    if v_conflict is not null then
      v_message := format(
        'BINDER_CONFLICT: %s changed field "%s" from "%s" to "%s". Refresh before trying again.',
        v_conflict->>'subject', v_conflict->>'field', v_conflict->>'expected', v_conflict->>'current'
      );
      insert into public.binder_ownership_mutation_requests (
        request_id, request_key, owner_user_id, operation, payload, payload_sha256,
        state, result, error_code, error_message
      ) values (
        p_request_id, p_request_key, v_user_id, p_operation, p_payload, p_payload_sha256,
        'conflict', jsonb_build_object('conflict', v_conflict), 'BINDER_CONFLICT', v_message
      )
      on conflict (request_id) do update set
        state = case when public.binder_ownership_mutation_requests.state = 'applied'
          then 'applied' else 'conflict' end,
        result = case when public.binder_ownership_mutation_requests.state = 'applied'
          then public.binder_ownership_mutation_requests.result else jsonb_build_object('conflict', v_conflict) end,
        error_code = case when public.binder_ownership_mutation_requests.state = 'applied'
          then public.binder_ownership_mutation_requests.error_code else 'BINDER_CONFLICT' end,
        error_message = case when public.binder_ownership_mutation_requests.state = 'applied'
          then public.binder_ownership_mutation_requests.error_message else v_message end,
        updated_at = timezone('utc', now())
      where public.binder_ownership_mutation_requests.owner_user_id = v_user_id
        and public.binder_ownership_mutation_requests.request_key = p_request_key
        and public.binder_ownership_mutation_requests.operation = p_operation
        and public.binder_ownership_mutation_requests.payload = p_payload
        and public.binder_ownership_mutation_requests.payload_sha256 = p_payload_sha256;

      select request.* into v_existing
      from public.binder_ownership_mutation_requests request
      where request.request_id = p_request_id;
      if not found
        or v_existing.owner_user_id <> v_user_id
        or v_existing.request_key <> p_request_key
        or v_existing.operation <> p_operation
        or v_existing.payload <> p_payload
        or v_existing.payload_sha256 <> p_payload_sha256 then
        raise exception 'Binder request identity changed during conflict recording.' using errcode = '40001';
      end if;
      return jsonb_build_object(
        'requestId', v_existing.request_id,
        'requestKey', v_existing.request_key,
        'state', v_existing.state,
        'replayed', false,
        'result', coalesce(v_existing.result, '{}'::jsonb),
        'errorCode', v_existing.error_code,
        'message', v_existing.error_message
      );
    end if;
  end if;

  return public.apply_binder_ownership_mutation_v1_unversioned(
    p_request_id, p_request_key, p_operation, p_payload, p_payload_sha256
  );
end;
$$;

revoke all on function public.apply_binder_ownership_mutation_v1(uuid, text, text, jsonb, text)
from public, anon;
grant execute on function public.apply_binder_ownership_mutation_v1(uuid, text, text, jsonb, text)
to authenticated;

create or replace function public.binder_ownership_lifecycle_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ready', true,
    'schemaVersion', 2,
    'reservationGuards', true,
    'idempotentMutations', true,
    'conflictPreconditions', true,
    'preconditionsEnforced', coalesce((
      select policy.enforce_preconditions
      from public.binder_lifecycle_policy policy
      where policy.singleton = true
    ), false)
  );
$$;

revoke all on function public.binder_ownership_lifecycle_readiness_v1() from public, anon;
grant execute on function public.binder_ownership_lifecycle_readiness_v1() to authenticated;


-- Recovered source: supabase/migrations/20260902180000_binder_readiness_policy_access.sql
drop policy if exists binder_lifecycle_policy_read_authenticated
on public.binder_lifecycle_policy;

create policy binder_lifecycle_policy_read_authenticated
on public.binder_lifecycle_policy
for select
to authenticated
using (singleton = true);

grant select on table public.binder_lifecycle_policy to authenticated;

alter function public.binder_ownership_lifecycle_readiness_v1()
security invoker;

$recovered$;
end;
$guard$;
commit;
